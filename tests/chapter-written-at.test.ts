/**
 * chapterWrittenAt：面板「今日产出」的数据源。
 *
 * 这个函数是**派生数据**的唯一出口（文件 mtime → ISO），所以两条边界必须锁住：
 * 没有 file / 文件已被删掉时要返回 undefined，而不是抛错或返回 epoch 0 ——
 * 否则「今日产出」会把不存在的东西算成 1970 年的产出。
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chapterWrittenAt } from '../src/engine.ts'

describe('chapterWrittenAt', () => {
  it('有正文文件时返回该文件的 mtime（ISO）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nf-written-'))
    writeFileSync(join(dir, '第1章_测试.md'), '正文', 'utf8')
    const at = chapterWrittenAt(dir, { no: 1, file: '第1章_测试.md' } as never)
    expect(typeof at).toBe('string')
    expect(Number.isFinite(Date.parse(at as string))).toBe(true)
  })

  it('没有 file 字段时返回 undefined', () => {
    expect(chapterWrittenAt(tmpdir(), { no: 2 } as never)).toBeUndefined()
  })

  it('file 指向的正文已被删除时返回 undefined（不抛错、不返回 0）', () => {
    expect(chapterWrittenAt(tmpdir(), { no: 3, file: '这本书的正文不存在.md' } as never)).toBeUndefined()
  })
})
