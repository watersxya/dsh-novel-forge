/**
 * 合并抽取的**解析容错**契约。
 *
 * ## 为什么测解析而不是测函数
 *
 * `summarizeFactsAndTimeline` 内部要调宿主包 `ctx.llm`，在插件脱离 dsh 环境时
 * 跑不起来（这正是 7 个集成测试文件挂掉的原因）。但它最容易出错、也最该被钉住
 * 的部分不是「怎么调模型」，而是**「模型返回畸形 JSON 时怎么收敛」**——
 * 合并后一次要parse 三个字段，任何一个坏掉都不该拖垮另两个。
 *
 * 这层逻辑必须能被离线验证，而 engine.ts 依赖宿主包 `@deepseek-ai/dsh-llm`
 * （脱离 dsh 环境直接 import 会失败）。所以规则层抽到零依赖的
 * {@link ../src/digest-parse.ts}，测试直接 import **源码本身**——
 * 不复制一份到测试里，否则测试通过而线上漂移，那就成了假的安全感。
 */
import { describe, it, expect } from 'vitest'
import { mapTimelineItem, parseFactLines, parseTimelineItems } from '../src/digest-parse.ts'
import { normalizeTimelineEvent } from '../src/timeline.ts'

const NOW = '2026-10-03T00:00:00.000Z'

function toEvent(item: Record<string, unknown>, index: number, chapterNo: number) {
  return normalizeTimelineEvent(mapTimelineItem(item, index), chapterNo, index, NOW)
}

describe('合并抽取 · facts 收敛', () => {
  it('正常数组：过滤掉长度 <= 8 的碎片', () => {
    const r = parseFactLines(['沈青在蛊村药铺治好了阿槐的腿', '短', '   ', '林默记下了第七根针的位置'])
    expect(r).toEqual(['沈青在蛊村药铺治好了阿槐的腿', '林默记下了第七根针的位置'])
  })

  it('超长项被截到 140 字（防模型 runaway 撑爆事实库）', () => {
    const long = '甲'.repeat(400)
    const r = parseFactLines([long])
    expect(r[0]).toHaveLength(140)
  })

  it('非数组（模型给了对象/字符串/null）→ 空数组，不抛错', () => {
    expect(parseFactLines({ a: 1 })).toEqual([])
    expect(parseFactLines('summary')).toEqual([])
    expect(parseFactLines(null)).toEqual([])
    expect(parseFactLines(undefined)).toEqual([])
  })

  it('混合类型数组：只保留合规字符串', () => {
    const r = parseFactLines([123, null, { x: 1 }, '这是一条足够长度的有效事实描述'])
    expect(r).toEqual(['这是一条足够长度的有效事实描述'])
  })
})

describe('合并抽取 · timeline 收敛', () => {
  it('正常数组全部保留，且保持模型给的叙述顺序（不按 order 重排）', () => {
    const raw = [
      { time: '第三日黄昏', order: 2, place: '药铺', characters: ['沈青'], event: '治好了阿槐' },
      { time: '紧接上一场', order: 1, place: '村口', characters: ['林默'], event: '发现脚印' },
    ]
    const r = parseTimelineItems(raw).map((it, i) => toEvent(it, i, 5))
    expect(r).toHaveLength(2)
    //顺序必须与模型输出一致——时间线检查靠这个发现「自报 order 与叙述顺序打架」
    expect(r[0].event).toBe('治好了阿槐')
    expect(r[1].event).toBe('发现脚印')
  })

  it('缺失/错类型字段回落到安全默认，不产生 undefined 字段', () => {
    const raw = [{ event: '只有事件' }, { event: '', time: 123, order: 'x', characters: '不是数组' }]
    const r = parseTimelineItems(raw).map((it, i) => toEvent(it, i, 5))
    expect(r[0].time).toBe('')
    expect(r[0].order).toBe(1)
    expect(r[0].place).toBe('')
    expect(r[0].characters).toEqual([])
    expect(r[1].order).toBe(2)
  })

  it('characters 里的非字符串成员被剔除', () => {
    const raw = [{ event: 'e', characters: ['沈青', 42, null, '林默'] }]
    const r = parseTimelineItems(raw).map((it, i) => toEvent(it, i, 5))
    expect(r[0].characters).toEqual(['沈青', '林默'])
  })

  it('空event 的项被过滤掉（调用方 .filter(e => e.event !== "")）', () => {
    const raw = [{ event: '有效' }, { event: '' }, { time: '无事件字段' }]
    const kept = parseTimelineItems(raw).map((it, i) => toEvent(it, i, 5)).filter(e => e.event !== '')
    expect(kept).toHaveLength(1)
    expect(kept[0].event).toBe('有效')
  })

  it('非数组（合并后模型漏给 timeline 字段）→ 空数组，摘要与事实不受影响', () => {
    expect(parseTimelineItems(undefined)).toEqual([])
    expect(parseTimelineItems(null)).toEqual([])
    expect(parseTimelineItems({ 0: {}, length: 1 })).toEqual([])
    expect(parseTimelineItems('[]')).toEqual([])
  })

  it('数组里混入 null / 数字 / 字符串时被剔除', () => {
    const raw = [null, 1, 'x', { event: 'ok' }]
    const r = parseTimelineItems(raw)
    expect(r).toHaveLength(1)
    expect(r[0].event).toBe('ok')
  })
})
