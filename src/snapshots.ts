/**
 * 章节历史版本（快照）：覆盖写入前自动留存正文，支持列表 / 回滚 / 清理。
 *
 * 为什么需要它：生成、按意见重写、去 AI 味润色、采纳草稿都会**覆盖** `第N章_*.md`，
 * 一旦改差（尤其是自动修订把好稿改坏）就没有退路。这里在覆盖前把旧稿存到
 * `<书目录>/snapshots/`，并维护一份 `snapshots/index.json` 索引。
 *
 * 纯 Node 文件操作，不依赖模型；路由层只做参数校验与响应。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChapterPlan, ChapterSnapshot } from './protocol.ts'

/** 快照目录名（书目录下）。 */
export const SNAPSHOT_DIR = 'snapshots'

/** 索引文件名。 */
const INDEX_FILE = 'index.json'

/** 每章默认保留的快照数（超出后按时间淘汰最旧的）。 */
export const DEFAULT_SNAPSHOT_KEEP = 20

/** 快照目录绝对路径。 */
export function snapshotDir(outputDir: string): string {
  return join(outputDir, SNAPSHOT_DIR)
}

/** 读取索引（缺失/损坏时返回空数组）。 */
export function loadSnapshots(outputDir: string): ChapterSnapshot[] {
  const file = join(snapshotDir(outputDir), INDEX_FILE)
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { snapshots?: ChapterSnapshot[] }
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : []
  } catch {
    return []
  }
}

/** 写回索引。 */
function saveSnapshots(outputDir: string, snapshots: ChapterSnapshot[]): void {
  const dir = snapshotDir(outputDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, INDEX_FILE), JSON.stringify({ snapshots }, null, 2), 'utf8')
}

/** 快照占用字节数（索引 + 正文）。 */
export function snapshotsBytes(outputDir: string): number {
  const dir = snapshotDir(outputDir)
  if (!existsSync(dir)) return 0
  let total = 0
  try {
    for (const name of readdirSync(dir)) {
      try { total += statSync(join(dir, name)).size } catch { /* 跳过读不到的条目 */ }
    }
  } catch { /* 目录不可读时按 0 计 */ }
  return total
}

/** 生成快照文件名（章节 + 时间戳 + 原因短标识）。 */
function snapshotFileName(chapterNo: number, reason: string, at: string): string {
  const stamp = at.replace(/[:.]/g, '-')
  const tag = reason.replace(/[^\w\u4e00-\u9fa5-]+/g, '').slice(0, 12) || 'snap'
  return `ch${String(chapterNo).padStart(4, '0')}_${stamp}_${tag}.md`
}

/**
 * 为一个章节留存快照（覆盖写入前调用）。
 *
 * @param outputDir 书目录。
 * @param chapter 章节（需要已存在正文文件）。
 * @param reason 留存原因（生成覆盖 / 采纳草稿 / 修订 / 润色 / 手工）。
 * @param keep 每章保留数量（超出淘汰最旧）。
 * @returns 新建的快照；无正文文件时返回 undefined（不产生空快照）。
 */
export function createSnapshot(
  outputDir: string,
  chapter: ChapterPlan,
  reason: string,
  keep = DEFAULT_SNAPSHOT_KEEP,
): ChapterSnapshot | undefined {
  if (chapter.file === undefined || chapter.file === '') return undefined
  const source = join(outputDir, chapter.file)
  if (!existsSync(source)) return undefined
  const at = new Date().toISOString()
  const dir = snapshotDir(outputDir)
  mkdirSync(dir, { recursive: true })
  const name = snapshotFileName(chapter.no, reason, at)
  const target = join(dir, name)
  try {
    copyFileSync(source, target)
  } catch {
    return undefined
  }
  const chars = chapter.chars ?? 0
  const snapshot: ChapterSnapshot = {
    id: name,
    chapterNo: chapter.no,
    file: `${SNAPSHOT_DIR}/${name}`,
    reason,
    chars,
    at,
  }
  const snapshots = [...loadSnapshots(outputDir), snapshot]
  saveSnapshots(outputDir, pruneList(snapshots, keep))
  return snapshot
}

/** 按「每章保留最近 keep 个」裁剪列表，并删除被淘汰的文件。 */
function pruneList(snapshots: ChapterSnapshot[], keep: number): ChapterSnapshot[] {
  const byChapter = new Map<number, ChapterSnapshot[]>()
  for (const s of snapshots) {
    const list = byChapter.get(s.chapterNo) ?? []
    list.push(s)
    byChapter.set(s.chapterNo, list)
  }
  const kept: ChapterSnapshot[] = []
  for (const list of byChapter.values()) {
    list.sort((a, b) => b.at.localeCompare(a.at))
    kept.push(...list.slice(0, Math.max(1, keep)))
  }
  return kept.sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 回滚到某个快照：把快照内容写回章节正文文件。
 *
 * 回滚前会**先给当前正文留一份快照**（reason=回滚前自动留存），所以回滚本身也可撤销。
 *
 * @param outputDir 书目录。
 * @param chapter 目标章节。
 * @param snapshotId 快照 id。
 * @returns 回滚后的字符数。
 * @throws 快照不存在或章节无正文文件时抛错。
 */
export function restoreSnapshot(outputDir: string, chapter: ChapterPlan, snapshotId: string): number {
  const snapshots = loadSnapshots(outputDir)
  const snapshot = snapshots.find(s => s.id === snapshotId)
  if (snapshot === undefined) throw new Error(`快照不存在：${snapshotId}`)
  if (snapshot.chapterNo !== chapter.no) throw new Error(`快照属于第 ${snapshot.chapterNo} 章，与目标第 ${chapter.no} 章不符`)
  const source = join(outputDir, snapshot.file)
  if (!existsSync(source)) throw new Error(`快照文件已丢失：${snapshot.file}`)
  if (chapter.file === undefined || chapter.file === '') throw new Error(`第 ${chapter.no} 章没有正文文件，无法回滚`)
  createSnapshot(outputDir, chapter, '回滚前留存')
  const body = readFileSync(source, 'utf8')
  writeFileSync(join(outputDir, chapter.file), body, 'utf8')
  return body.length
}

/** 删除一个快照（连同文件）。 */
export function removeSnapshot(outputDir: string, snapshotId: string): boolean {
  const snapshots = loadSnapshots(outputDir)
  const snapshot = snapshots.find(s => s.id === snapshotId)
  if (snapshot === undefined) return false
  try { rmSync(join(outputDir, snapshot.file), { force: true }) } catch { /* 文件已不在 */ }
  saveSnapshots(outputDir, snapshots.filter(s => s.id !== snapshotId))
  return true
}

/** 按每章保留数量清理（连文件一起删）。 */
export function pruneSnapshots(outputDir: string, keep = DEFAULT_SNAPSHOT_KEEP): number {
  const snapshots = loadSnapshots(outputDir)
  const kept = pruneList(snapshots, keep)
  const keptIds = new Set(kept.map(s => s.id))
  let removed = 0
  for (const s of snapshots) {
    if (keptIds.has(s.id)) continue
    try { rmSync(join(outputDir, s.file), { force: true }) } catch { /* ignore */ }
    removed++
  }
  saveSnapshots(outputDir, kept)
  return removed
}
