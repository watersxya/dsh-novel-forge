/**
 * 生产单失败熔断：同一章连续失败达上限后必须跳过，不能无限重跑。
 *
 * ## 为什么这个测试必须存在
 *
 * 主循环扫描时只跳过 `approved` 章，失败章的 `status` 是 `error`——修复前它会在
 * 下一轮被重新选中，构成「生成失败 → 重跑 → 再失败」的死循环。由于每轮要跑一次
 * 正文生成（maxTokens 常在 20000），配置类错误（如 maxTokens 配得过小导致必然
 * 截断）会变成**确定性烧钱**，唯一刹车是作者手动点停止。
 *
 * 修复策略：连败 {@link MAX_CHAPTER_FAILURES} 次 → 该章列入 `pendingManual`
 * 并快进到下一章，**不阻塞整批**（作者配错一次不该让剩下几十章全停摆）。
 *
 * 测的是 `pickNextChapter` 这个纯函数：判定逻辑独立在 run-selection.ts，
 * 不 import engine.ts（它依赖宿主包 @deepseek-ai/dsh-llm，脱离 dsh 环境跑不起来），
 * 因此可以完全离线验证。
 */
import { describe, it, expect } from 'vitest'
import { pickNextChapter, MAX_CHAPTER_FAILURES } from '../src/run-selection.ts'
import type { ChapterPlan, ChapterStatus } from '../src/protocol.ts'

function chapter(no: number, status: ChapterStatus): ChapterPlan {
  return { no, title: `第${no}章`, status, summary: '', beats: '' } as ChapterPlan
}

describe('生产单选章与失败熔断', () => {
  it('跳过已 approved 的章，选中第一个待处理章', () => {
    const chapters = [chapter(1, 'approved'), chapter(2, 'pending'), chapter(3, 'pending')]
    const picked = pickNextChapter(chapters, 1, 3, {})
    expect(picked.next?.no).toBe(2)
    expect(picked.circuitBroken).toEqual([])
  })

  it('失败次数未达上限时仍会重跑该章（瞬时抖动要能自愈）', () => {
    const chapters = [chapter(1, 'error'), chapter(2, 'pending')]
    const picked = pickNextChapter(chapters, 1, 2, { '1': 2 })
    expect(picked.next?.no).toBe(1)
    expect(picked.circuitBroken).toEqual([])
  })

  it('连续失败达上限时熔断该章：不选中它，且报出熔断清单', () => {
    const chapters = [chapter(1, 'error'), chapter(2, 'pending')]
    const picked = pickNextChapter(chapters, 1, 2, { '1': 3 })
    // 关键：不能把已达上限的章选为 next，否则又是无限重跑。
    expect(picked.next?.no).toBe(2)
    expect(picked.circuitBroken.map(x => x.chapter.no)).toEqual([1])
    expect(picked.circuitBroken[0]?.attempts).toBe(3)
  })

  it('全部章都成功时返回 undefined（批次完成）', () => {
    const chapters = [chapter(1, 'approved'), chapter(2, 'approved')]
    const picked = pickNextChapter(chapters, 1, 2, {})
    expect(picked.next).toBeUndefined()
    expect(picked.circuitBroken).toEqual([])
  })

  it('多章同时熔断时全部列出，不遗漏', () => {
    const chapters = [chapter(1, 'error'), chapter(2, 'error'), chapter(3, 'pending')]
    const picked = pickNextChapter(chapters, 1, 3, { '1': 3, '2': 5 })
    expect(picked.next?.no).toBe(3)
    expect(picked.circuitBroken.map(x => x.chapter.no)).toEqual([1, 2])
  })

  it('整批全熔断时返回 undefined 且不卡死（而不是反复重跑同一章）', () => {
    const chapters = [chapter(1, 'error'), chapter(2, 'error')]
    const picked = pickNextChapter(chapters, 1, 2, { '1': 3, '2': 3 })
    expect(picked.next).toBeUndefined()
    expect(picked.circuitBroken).toHaveLength(2)
  })

  it('扫描越过 approved 章时记录 advanceTo（供调用方快进 currentNo）', () => {
    const chapters = [chapter(1, 'approved'), chapter(2, 'approved'), chapter(3, 'pending')]
    const picked = pickNextChapter(chapters, 1, 3, {})
    expect(picked.next?.no).toBe(3)
    expect(picked.advanceTo).toBe(2)
  })

  it('区间终点之后的章不会被选中', () => {
    const chapters = [chapter(1, 'approved'), chapter(2, 'approved'), chapter(3, 'pending')]
    const picked = pickNextChapter(chapters, 1, 2, {})
    expect(picked.next).toBeUndefined()
  })
})
