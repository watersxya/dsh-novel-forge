/**
 * 单测：章节历史版本（快照）——真实文件系统、不调模型。
 *
 * 关注三件事：覆盖前能留存、回滚可用且可撤销、清理按每章保留数生效。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChapterPlan } from '../src/protocol.ts'
import {
  createSnapshot,
  DEFAULT_SNAPSHOT_KEEP,
  loadSnapshots,
  pruneSnapshots,
  removeSnapshot,
  restoreSnapshot,
  SNAPSHOT_DIR,
  snapshotsBytes,
} from '../src/snapshots.ts'

let dir: string

/** 造一章并写入正文文件。 */
function makeChapter(no: number, body: string, file = `第${no}章_测试.md`): ChapterPlan {
  writeFileSync(join(dir, file), `# 第${no}章 测试\n\n${body}\n`, 'utf8')
  return { no, volume: 1, title: '测试', beats: '', targetChars: 3000, status: 'written', file, chars: body.length }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-snap-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createSnapshot', () => {
  it('留存正文快照并写索引', () => {
    const chapter = makeChapter(1, '第一版正文')
    const snap = createSnapshot(dir, chapter, '重新生成前')
    expect(snap).toBeDefined()
    expect(snap?.chapterNo).toBe(1)
    expect(snap?.reason).toBe('重新生成前')
    expect(existsSync(join(dir, snap!.file))).toBe(true)
    expect(readFileSync(join(dir, snap!.file), 'utf8')).toContain('第一版正文')
    expect(loadSnapshots(dir)).toHaveLength(1)
    expect(snapshotsBytes(dir)).toBeGreaterThan(0)
  })

  it('没有正文文件时不产生空快照', () => {
    const chapter: ChapterPlan = { no: 1, volume: 1, title: 't', beats: '', targetChars: 3000, status: 'pending' }
    expect(createSnapshot(dir, chapter, 'x')).toBeUndefined()
    expect(loadSnapshots(dir)).toEqual([])
  })

  it('同一章超过保留数时淘汰最旧的', () => {
    const chapter = makeChapter(1, 'v0')
    for (let i = 0; i < DEFAULT_SNAPSHOT_KEEP + 3; i++) {
      writeFileSync(join(dir, chapter.file!), `# 第1章 测试\n\nv${i + 1}\n`, 'utf8')
      createSnapshot(dir, chapter, `第${i + 1}次`)
    }
    const list = loadSnapshots(dir).filter(s => s.chapterNo === 1)
    expect(list).toHaveLength(DEFAULT_SNAPSHOT_KEEP)
  })
})

describe('restoreSnapshot', () => {
  it('回滚把旧稿写回章节文件，并先给当前稿留一份（可撤销）', () => {
    const chapter = makeChapter(1, '第一版')
    const snap = createSnapshot(dir, chapter, '重新生成前')!
    // 模拟重新生成：正文被覆盖成第二版
    writeFileSync(join(dir, chapter.file!), '# 第1章 测试\n\n第二版\n', 'utf8')

    const chars = restoreSnapshot(dir, chapter, snap.id)
    expect(chars).toBeGreaterThan(0)
    expect(readFileSync(join(dir, chapter.file!), 'utf8')).toContain('第一版')
    const list = loadSnapshots(dir)
    expect(list).toHaveLength(2)
    expect(list.some(s => s.reason === '回滚前留存')).toBe(true)
    // 回滚前留存的那份内容应是「被覆盖掉的第二版」，所以回滚可再撤销
    const undo = list.find(s => s.reason === '回滚前留存')!
    expect(readFileSync(join(dir, undo.file), 'utf8')).toContain('第二版')
  })

  it('快照不存在或章号不符时报错', () => {
    const chapter = makeChapter(1, 'x')
    expect(() => restoreSnapshot(dir, chapter, '不存在')).toThrow()
    const snap = createSnapshot(dir, chapter, 'r')!
    const other: ChapterPlan = { ...chapter, no: 2 }
    expect(() => restoreSnapshot(dir, other, snap.id)).toThrow('不符')
  })
})

describe('removeSnapshot / pruneSnapshots', () => {
  it('删除单条会同时删文件与索引项', () => {
    const chapter = makeChapter(1, 'v1')
    const snap = createSnapshot(dir, chapter, 'r')!
    expect(removeSnapshot(dir, snap.id)).toBe(true)
    expect(loadSnapshots(dir)).toEqual([])
    expect(existsSync(join(dir, snap.file))).toBe(false)
  })

  it('prune 按每章保留数清理，并返回删除条数', () => {
    const a = makeChapter(1, 'a')
    const b = makeChapter(2, 'b')
    for (let i = 0; i < 4; i++) {
      createSnapshot(dir, a, `a${i}`)
      createSnapshot(dir, b, `b${i}`)
    }
    const removed = pruneSnapshots(dir, 2)
    expect(removed).toBe(4)
    expect(loadSnapshots(dir)).toHaveLength(4)
    expect(loadSnapshots(dir).filter(s => s.chapterNo === 1)).toHaveLength(2)
    expect(loadSnapshots(dir).filter(s => s.chapterNo === 2)).toHaveLength(2)
  })

  it('索引丢失时按无快照处理（不抛错）', () => {
    rmSync(join(dir, SNAPSHOT_DIR), { recursive: true, force: true })
    expect(loadSnapshots(dir)).toEqual([])
    mkdirSync(join(dir, SNAPSHOT_DIR), { recursive: true })
    writeFileSync(join(dir, SNAPSHOT_DIR, 'index.json'), '{ 坏掉的 json', 'utf8')
    expect(loadSnapshots(dir)).toEqual([])
  })
})
