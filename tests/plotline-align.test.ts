/**
 * 剧情线批量刷新的**结果对齐**契约。
 *
 * ## 为什么测这段
 *
 * 批量刷新让模型一次返回 `{items: [{name, progress}]}`，然后按 name 对齐回原线。
 * 这里最容易出的错是**错位**——一旦线名对不上，模型给 A 线的进度就会被写到
 * B 线上。这种 bug 不报错、界面也正常显示，只是内容全错了，作者很难发现。
 *
 * 所以对齐必须按「线名逐字匹配」为主、按顺序兜底为辅，并明确规定：
 * 模型漏项的线**留空而不是拿别人的进度填**。
 *
 * 对齐逻辑在零依赖的 {@link ../src/plotline-align.ts}（engine.ts 依赖宿主包，
 * 脱离 dsh 环境 import 失败）。测试直接 import **源码本身**——复制一份到测试里
 * 就成了假的安全感：测试通过而线上漂移。
 */
import { describe, it, expect } from 'vitest'
import { alignPlotlineProgress } from '../src/plotline-align.ts'

const LINES = [
  { id: 'a', name: '古玉残片' },
  { id: 'b', name: '蛊村真相' },
  { id: 'c', name: '债主身份' },
]

describe('剧情线批量刷新 · 结果对齐', () => {
  it('按线名精确对齐（顺序打乱也不影响）', () => {
    const items = [
      { name: '债主身份', progress: 'C' },
      { name: '古玉残片', progress: 'A' },
      { name: '蛊村真相', progress: 'B' },
    ]
    const r = alignPlotlineProgress(items, LINES)
    expect(r.map(x => x.text)).toEqual(['A', 'B', 'C'])
  })

  it('模型漏项 → 该线留空，不拿别人的进度填', () => {
    const r = alignPlotlineProgress([{ name: '蛊村真相', progress: 'B' }], LINES)
    expect(r[0]!.text).toBe('')
    expect(r[1]!.text).toBe('B')
    expect(r[2]!.text).toBe('')
  })

  it('模型多返回一条不存在的线 → 忽略，不污染已有线', () => {
    const items = [
      { name: '不存在的线', progress: 'X' },
      { name: '古玉残片', progress: 'A' },
    ]
    const r = alignPlotlineProgress(items, LINES)
    expect(r.map(x => x.text)).toEqual(['A', '', ''])
  })

  it('模型漏写 name → 按出现顺序兜给尚未匹配的线', () => {
    const items = [
      { progress: '第一份' },
      { progress: '第二份' },
    ]
    const r = alignPlotlineProgress(items, LINES)
    // 两条都无名，按序给前两条：宁可可能错位，也不能让作者看到空白
    expect(r[0]!.text).toBe('第一份')
    expect(r[1]!.text).toBe('第二份')
    expect(r[2]!.text).toBe('')
  })

  it('name 重复时只认第一个，后面的走顺序兜底', () => {
    const items = [
      { name: '古玉残片', progress: '首个' },
      { name: '古玉残片', progress: '次个' },
    ]
    const r = alignPlotlineProgress(items, LINES)
    expect(r[0]!.text).toBe('首个')
    // 第二个同名不再覆盖「古玉残片」，顺位给下一条未匹配的线
    expect(r[1]!.text).toBe('次个')
  })

  it('空 progress 被丢弃，不占用「已匹配」状态', () => {
    // 第一条 name 命中但 progress 为空 → 丢弃，古玉残片仍算「未匹配」，
    // 于是第二条无名项会兜给它。这比让它留空更符合直觉：
    // 模型确实给了一条有效进度，只是第一条忘了填。
    const items = [
      { name: '古玉残片', progress: '   ' },
      { progress: '兜底的' },
    ]
    const r = alignPlotlineProgress(items, LINES)
    expect(r[0]!.text).toBe('兜底的')
    expect(r[1]!.text).toBe('')
    expect(r[2]!.text).toBe('')
  })

  it('progress 超长被截到 300 字', () => {
    const r = alignPlotlineProgress([{ name: '古玉残片', progress: '甲'.repeat(500) }], LINES)
    expect(r[0]!.text).toHaveLength(300)
  })

  it('items 不是数组 / 全是非对象 → 全部留空，不抛错', () => {
    for (const bad of [undefined, null, 'x', 42, [], [null, 1, 'x']]) {
      const r = alignPlotlineProgress(bad, LINES)
      expect(r.map(x => x.text)).toEqual(['', '', ''])
    }
  })

  it('线名为空串的边角：按顺序兜底仍能工作', () => {
    const weird = [{ id: 'x', name: '' }, { id: 'y', name: '正常' }]
    const r = alignPlotlineProgress([{ progress: 'P' }], weird)
    expect(r[0]!.text).toBe('P')
  })

  it('返回条数恒等于输入条数（调用方按 id 回写，必须一一对应）', () => {
    const r = alignPlotlineProgress([{ name: '蛊村真相', progress: 'B' }], LINES)
    expect(r).toHaveLength(LINES.length)
    expect(r.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})
