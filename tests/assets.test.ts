/**
 * 纯逻辑单测：写作资产 / 内置规则（不依赖 LLM，可离线跑）。
 */
import { describe, it, expect } from 'vitest'
import { emptyProjectAssets, effectiveAntiAiRules, ensureBuiltinAssets } from '../src/assets.ts'

describe('emptyProjectAssets', () => {
  it('返回结构完整的默认资产对象', () => {
    const a = emptyProjectAssets()
    expect(a).toEqual({ auxiliaryProgressions: [], antiAiRules: [], styleAssets: [] })
  })

  it('每次调用返回全新对象（不共享引用）', () => {
    const a = emptyProjectAssets()
    const b = emptyProjectAssets()
    expect(a).not.toBe(b)
    a.antiAiRules.length = 1
    expect(b.antiAiRules.length).toBe(0)
  })
})

describe('effectiveAntiAiRules', () => {
  it('无项目资产时返回内置全局规则（数组）', () => {
    const rules = effectiveAntiAiRules(undefined)
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(0)
  })

  it('空项目资产等价于无资产', () => {
    const rules = effectiveAntiAiRules(emptyProjectAssets())
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(0)
  })
})

describe('ensureBuiltinAssets', () => {
  it('missing_only 补齐内置规则但不覆盖已有结构', () => {
    const out = ensureBuiltinAssets(emptyProjectAssets(), 'missing_only')
    expect(Array.isArray(out.antiAiRules)).toBe(true)
    // 至少包含内置全局规则
    expect(out.antiAiRules.length).toBeGreaterThan(0)
  })

  it('无输入时也返回有效资产对象', () => {
    const out = ensureBuiltinAssets(undefined, 'missing_only')
    expect(out).toBeDefined()
    expect(Array.isArray(out.antiAiRules)).toBe(true)
  })
})
