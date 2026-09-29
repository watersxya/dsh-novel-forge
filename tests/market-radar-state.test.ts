/**
 * 热门题材雷达的界面状态规则（离线）。
 *
 * 用例直接对应 `market-radar-state.ts` 顶部写下的四条验收条件，
 * 断言的是**需求**，不是某个外部实现的形状：
 *
 *  R1 扫榜或分析进行中，不得改动作品勾选；
 *  R2 未勾选任何作品时不能开始分析；
 *  R3 已有报告之后仍允许再次分析（不得退化成"只能查看"）；
 *  R4 只有换了一份报告才复位信号勾选，同报告重渲染不冲掉手选。
 */
import { describe, expect, it } from 'vitest'
import { isDifferentReport, radarControls } from '../src/client/panel/market-radar-state.ts'

describe('radarControls', () => {
  it('R1：扫榜进行中，勾选与分析都被锁住，并提示等待榜单', () => {
    const c = radarControls({ scanning: true, analyzing: false, pickedCount: 3, hasReport: false })
    expect(c.canSelectCandidates).toBe(false)
    expect(c.canAnalyze).toBe(false)
    expect(c.canScan).toBe(false)
    expect(c.analyzeLabel).toBe('wait')
  })

  it('R1：分析进行中，勾选与分析都被锁住', () => {
    const c = radarControls({ scanning: false, analyzing: true, pickedCount: 3, hasReport: true })
    expect(c.canSelectCandidates).toBe(false)
    expect(c.canAnalyze).toBe(false)
    expect(c.canScan).toBe(false)
  })

  it('R2：没勾选作品时不能分析，但仍可改勾选', () => {
    const c = radarControls({ scanning: false, analyzing: false, pickedCount: 0, hasReport: false })
    expect(c.canAnalyze).toBe(false)
    expect(c.canSelectCandidates).toBe(true)
    expect(c.canScan).toBe(true)
    expect(c.analyzeLabel).toBe('pick')
  })

  it('首次分析（还没报告）时按钮文案为 first', () => {
    const c = radarControls({ scanning: false, analyzing: false, pickedCount: 5, hasReport: false })
    expect(c.canAnalyze).toBe(true)
    expect(c.analyzeLabel).toBe('first')
  })

  it('R3：已有报告时仍可分析，只是文案变成 again（不能只能查看）', () => {
    const c = radarControls({ scanning: false, analyzing: false, pickedCount: 4, hasReport: true })
    expect(c.canAnalyze).toBe(true)
    expect(c.canSelectCandidates).toBe(true)
    expect(c.analyzeLabel).toBe('again')
  })
})

describe('isDifferentReport', () => {
  it('R4：同一份报告的重渲染不得复位勾选', () => {
    expect(isDifferentReport('mr-abc', 'mr-abc')).toBe(false)
  })

  it('R4：换了一份报告要复位', () => {
    expect(isDifferentReport('mr-abc', 'mr-def')).toBe(true)
  })

  it('旧版产物没有标识：从有到无、从无到有都算换了一份', () => {
    expect(isDifferentReport('mr-abc', '')).toBe(true)
    expect(isDifferentReport('', 'mr-abc')).toBe(true)
  })

  it('两边都没有标识时不反复复位（避免每次渲染都重算勾选）', () => {
    expect(isDifferentReport('', '')).toBe(false)
  })
})
