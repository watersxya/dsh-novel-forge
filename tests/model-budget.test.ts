/**
 * 换模型时的 maxTokens 重算。
 *
 * ## 这个测试必须存在的原因
 *
 * 修复前，流式三处（正文生成 / 修订 / 去AI润色）各自手写兜底循环，
 * `maxTokens` 原样沿用**主模型**的值。当主模型切到窗口更小的备用模型时，
 * 一次 20000 token 的请求必然撞 `max-tokens` 截断 → 判定失败 → 换模型也没用
 * （备用模型本来就是那个小的）→ 白跑一轮，token 白烧。
 *
 * 规则本身只有三行，但它决定了「失败后重试到底有没有意义」，所以必须有测试钉死，
 * 不能靠人肉读代码。
 *
 * 测的是 `fullTextBudget`（在零依赖的 model-capability.ts 里），因此完全离线。
 */
import { describe, it, expect } from 'vitest'
import { fullTextBudget } from '../src/model-capability.ts'

const PRIMARY = 'deepseek-chat'

describe('fullTextBudget', () => {
  it('主模型：返回 20000 地板（用户配得再小也不让长章写不完）', () => {
    expect(fullTextBudget({ maxTokens: 8000 }, PRIMARY, PRIMARY)).toBe(20000)
  })

  it('主模型：用户配得很大时按用户值走', () => {
    expect(fullTextBudget({ maxTokens: 64000 }, PRIMARY, PRIMARY)).toBe(64000)
  })

  it('备用模型：未填 fallbackMaxTokens → undefined（沿用原值，不瞎猜窗口大小）', () => {
    const r = fullTextBudget({ maxTokens: 32000 }, 'kimi-k2.6', PRIMARY)
    expect(r).toBeUndefined()
  })

  it('备用模型：填了就用填的', () => {
    const r = fullTextBudget({ maxTokens: 32000, fallbackMaxTokens: 8000 }, 'kimi-k2.6', PRIMARY)
    expect(r).toBe(8000)
  })

  it('备用模型：填的值超过主模型上限时被夹住（不能反而放大预算）', () => {
    const r = fullTextBudget({ maxTokens: 8000, fallbackMaxTokens: 60000 }, 'kimi-k2.6', PRIMARY)
    // 主模型地板是 20000，备用填 60000 → 夹到 20000
    expect(r).toBe(20000)
  })

  it('非法值 0 / 负数视为未填 → undefined', () => {
    expect(fullTextBudget({ maxTokens: 32000, fallbackMaxTokens: 0 }, 'kimi-k2.6', PRIMARY)).toBeUndefined()
    expect(fullTextBudget({ maxTokens: 32000, fallbackMaxTokens: -1 }, 'kimi-k2.6', PRIMARY)).toBeUndefined()
  })

  it('核心回归：主模型 32000 → 备用 8000，预算必须被下调（而非沿用 32000）', () => {
    const primaryBudget = fullTextBudget({ maxTokens: 32000 }, PRIMARY, PRIMARY)
    const fallbackBudget = fullTextBudget({ maxTokens: 32000, fallbackMaxTokens: 8000 }, 'kimi-k2.6', PRIMARY)
    expect(primaryBudget).toBe(32000)
    expect(fallbackBudget).toBe(8000)
    expect(fallbackBudget!).toBeLessThan(primaryBudget!)
  })
})
