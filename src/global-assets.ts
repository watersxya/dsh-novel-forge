/**
 * 全局资源库（跨书可复用的自定义题材/推进模式）。
 * 雷达「同步底座到全局资源库」写入此处；/assets 返回时与内置库合并展示。
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { GenreNode, ProgressionMode } from './protocol.ts'
import { dshHome, dshHomePath } from './home.ts'

interface GlobalAssets {
  genres: GenreNode[]
  modes: ProgressionMode[]
}

const FILE = dshHomePath('novel-forge-global-assets.json')
let cache: GlobalAssets | null = null
/** 缓存对应的文件 mtime（ms）；-1 = 文件不存在。 */
let cacheMtime = -1

function load(): GlobalAssets {
  // 外部写入（另一个进程 / 手改文件）必须立刻可见：缓存按 mtime 失效，
  // 而不是进程内缓存永不刷新。
  let mtime = -1
  try { mtime = statSync(FILE).mtimeMs } catch { /* 文件不存在 */ }
  if (cache !== null && cacheMtime === mtime) return cache
  try {
    const raw = readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<GlobalAssets>
    cache = { genres: Array.isArray(parsed.genres) ? parsed.genres : [], modes: Array.isArray(parsed.modes) ? parsed.modes : [] }
  } catch {
    cache = { genres: [], modes: [] }
  }
  cacheMtime = mtime
  return cache
}

function persist(): void {
  if (cache === null) return
  mkdirSync(dshHome(), { recursive: true })
  writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8')
  try { cacheMtime = statSync(FILE).mtimeMs } catch { cacheMtime = -1 }
}

export function globalGenreLibrary(): GenreNode[] {
  return load().genres
}

export function globalProgressionLibrary(): ProgressionMode[] {
  return load().modes
}

/** 新增/已有则跳过；返回 true=新增。 */
export function addGlobalGenre(g: GenreNode): boolean {
  const lib = load()
  if (lib.genres.some(x => x.name === g.name)) return false
  lib.genres.push({ ...g, children: g.children ?? [] })
  persist()
  return true
}

export function addGlobalMode(m: ProgressionMode): boolean {
  const lib = load()
  if (lib.modes.some(x => x.name === m.name)) return false
  lib.modes.push({ ...m, payoffs: m.payoffs ?? [], risks: m.risks ?? [], primary: m.primary ?? false })
  persist()
  return true
}
