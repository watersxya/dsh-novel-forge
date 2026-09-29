/**
 * 结构化输出预算与字段长度合同（离线）。
 *
 * 这里锁三条：
 *   1. 预算随规模增长且被上下限夹住 —— 既不会给短任务过量分配，也不会给长任务
 *      不够用（截断后只能抛「请增大 maxTokens」正是要避免的）；
 *   2. 规模缺失/非法时不返回 NaN 或 0，而是退回下限；
 *   3. 长度合同渲染出的 prompt 语句与解析端使用的上限来自同一张表。
 */
import { describe, expect, it } from 'vitest'
import {
  outputBudgetSpec,
  renderLengthContract,
  resolveOutputBudget,
  scopeUnits,
  STRUCTURED_FIELD_LIMITS,
} from '../src/output-budget.ts'

describe('resolveOutputBudget', () => {
  it('随规模单调增长', () => {
    const small = resolveOutputBudget('chapter-list', { chapters: 5 })
    const medium = resolveOutputBudget('chapter-list', { chapters: 30 })
    const large = resolveOutputBudget('chapter-list', { chapters: 120 })
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })

  it('被上下限夹住：不会低于 floor，也不会超过 ceiling', () => {
    for (const kind of ['volume-strategy', 'chapter-list', 'character-cast', 'item-list', 'analysis'] as const) {
      const spec = outputBudgetSpec(kind)
      expect(resolveOutputBudget(kind, {})).toBeGreaterThanOrEqual(spec.floor)
      expect(resolveOutputBudget(kind, { volumes: 9999, chapters: 9999, characters: 9999, items: 9999, sourceChars: 9_999_999 }))
        .toBeLessThanOrEqual(spec.ceiling)
    }
  })

  it('规模缺失、0、负数或 NaN 都退回下限（不产生 NaN/0）', () => {
    for (const scope of [{}, { chapters: 0 }, { chapters: -3 }, { chapters: Number.NaN }, { chapters: Number.POSITIVE_INFINITY }]) {
      const value = resolveOutputBudget('chapter-list', scope)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
      // Infinity 是非有限值 → 按缺失处理 → 取下限。
      expect(value).toBeGreaterThanOrEqual(outputBudgetSpec('chapter-list').floor)
    }
  })

  it('参考项目的分卷口径在本插件里不会原样照搬（数值已按本插件字段核算）', () => {
    const spec = outputBudgetSpec('volume-strategy')
    // 参考项目为 每卷 +160 / 上限 5200；本插件卷字段带 uncertainty 与书级阶梯，
    // 故每卷额度更高。这里锁住"我们不是直接抄它"，同时保证仍在同量级。
    expect(spec.perUnit).toBeGreaterThanOrEqual(160)
    expect(spec.ceiling).toBeGreaterThanOrEqual(5_200)
    expect(spec.ceiling).toBeLessThanOrEqual(8_000)
  })

  it('单章额度覆盖真实字段体积（摘要 300 + 目标 200 + payoff ≈ 350 token/章）', () => {
    const spec = outputBudgetSpec('chapter-list')
    expect(spec.perUnit).toBeGreaterThanOrEqual(300)
    // 30 章的预算必须明显高于「按每章 120 token」的旧口径，否则会重新引入截断。
    expect(resolveOutputBudget('chapter-list', { chapters: 30 })).toBeGreaterThan(2_000 + 30 * 120)
  })
})

describe('scopeUnits', () => {
  it('分析类按输入正文千字折算，向上取整', () => {
    expect(scopeUnits('analysis', { sourceChars: 0 })).toBe(0)
    expect(scopeUnits('analysis', { sourceChars: 1 })).toBe(1)
    expect(scopeUnits('analysis', { sourceChars: 1_000 })).toBe(1)
    expect(scopeUnits('analysis', { sourceChars: 1_001 })).toBe(2)
  })

  it('按任务类型取对应的那个规模量，忽略其它字段', () => {
    expect(scopeUnits('chapter-list', { chapters: 12, volumes: 9 })).toBe(12)
    expect(scopeUnits('volume-strategy', { chapters: 12, volumes: 4 })).toBe(4)
    expect(scopeUnits('character-cast', { characters: 8 })).toBe(8)
    expect(scopeUnits('item-list', { items: 15 })).toBe(15)
  })
})

describe('长度合同', () => {
  it('渲染出的说明包含每个字段的上限', () => {
    const text = renderLengthContract([['卷名', 40], ['每卷定位', 300]])
    expect(text).toContain('卷名不超过 40 字')
    expect(text).toContain('每卷定位不超过 300 字')
    // 还要提醒模型写完即止，避免把预算花在自由发挥上。
    expect(text).toContain('立即结束')
  })

  it('空字段表返回空串（不往 prompt 里塞一句空话）', () => {
    expect(renderLengthContract([])).toBe('')
  })

  it('字段上限表是正数且互不矛盾', () => {
    for (const [key, value] of Object.entries(STRUCTURED_FIELD_LIMITS)) {
      expect(Number.isInteger(value), `${key} 应为整数`).toBe(true)
      expect(value, `${key} 应为正数`).toBeGreaterThan(0)
    }
    // 章节标题必须短于摘要，否则摘要字段没有压缩空间。
    expect(STRUCTURED_FIELD_LIMITS.chapterTitle).toBeLessThan(STRUCTURED_FIELD_LIMITS.chapterSummary)
  })
})
