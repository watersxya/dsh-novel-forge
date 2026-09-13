/**
 * 内置种子数据的结构与功能标识完整性（自研表述不改变行为）。
 *
 * 背景：这批数据的**表达文本**已改写为本项目自己的说法，但功能标识必须原样保留——
 * 项目存档按 key 匹配模板与规则、去 AI 味扫描依赖 detectPatterns、起步写法档依赖
 * templateKey 引用。本测试就是这次改写的"行为不变"保证。
 */
import { describe, it, expect } from 'vitest'
import {
  BUILTIN_ANTI_AI_RULES,
  BUILTIN_STARTER_STYLE_PROFILES,
  BUILTIN_STYLE_TEMPLATES,
  starterProfileToAsset,
  styleTemplateToAsset,
} from '../src/assets.ts'

describe('内置叙事风格模板', () => {
  it('数量与 key 集合稳定', () => {
    expect(BUILTIN_STYLE_TEMPLATES).toHaveLength(16)
    const keys = BUILTIN_STYLE_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    // 关键 key 必须仍在（项目存档靠它匹配）
    for (const key of ['power-up-escalation', 'suspense-pressure', 'emotional-tension', 'immersive-daily']) {
      expect(keys).toContain(key)
    }
  })

  it('每套模板的表达文本非空，且结构字段齐全', () => {
    for (const t of BUILTIN_STYLE_TEMPLATES) {
      expect(t.name.length, t.key).toBeGreaterThan(0)
      expect(t.description.length, t.key).toBeGreaterThan(0)
      if (t.analysisMarkdown !== undefined) expect(t.analysisMarkdown.length, t.key).toBeGreaterThan(0)
      expect(t.proseRules.length, t.key).toBeGreaterThan(0)
      expect(t.dialogueRules.length, t.key).toBeGreaterThan(0)
      expect(t.languageRules.length, t.key).toBeGreaterThan(0)
      expect(t.rhythmRules.length, t.key).toBeGreaterThan(0)
      // 结构化规则字段是可选的历史兼容字段：有就必须成形状，没有也不影响功能（扁平规则必填）。
      if (t.narrative !== undefined) expect(['string', 'undefined']).toContain(typeof t.narrative.progressionMode)
      if (t.rhythm !== undefined) expect(['string', 'undefined']).toContain(typeof t.rhythm.pace)
      if (t.character !== undefined) expect(['string', 'undefined']).toContain(typeof t.character.emotionExpression)
      if (t.language !== undefined) expect(['string', 'undefined']).toContain(typeof t.language.register)
    }
  })

  it('defaultAntiAiRuleKeys 都指向存在的规则（引用完整性）', () => {
    const ruleKeys = new Set(BUILTIN_ANTI_AI_RULES.map(r => r.key))
    for (const t of BUILTIN_STYLE_TEMPLATES) {
      for (const ref of t.defaultAntiAiRuleKeys ?? []) {
        expect(ruleKeys.has(ref), `${t.key} -> ${ref}`).toBe(true)
      }
    }
  })

  it('styleTemplateToAsset 仍能产出可用资产', () => {
    const asset = styleTemplateToAsset(BUILTIN_STYLE_TEMPLATES[0]!)
    expect(asset.name).not.toBe('')
    expect(asset.proseRules.length).toBeGreaterThan(0)
  })
})

describe('内置反 AI 规则', () => {
  it('数量与 key 集合稳定，key 唯一', () => {
    expect(BUILTIN_ANTI_AI_RULES).toHaveLength(18)
    const keys = BUILTIN_ANTI_AI_RULES.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of ['forbid-explicit-psychology', 'forbid-ending-elevation', 'encourage-reality-gap']) {
      expect(keys).toContain(key)
    }
  })

  it('每条规则的名称/规避项/修正方向非空', () => {
    for (const r of BUILTIN_ANTI_AI_RULES) {
      expect(r.name.length, r.key).toBeGreaterThan(0)
      expect(r.avoid.length, r.key).toBeGreaterThan(0)
      expect(r.fix.length, r.key).toBeGreaterThan(0)
    }
  })

  it('带 detectPatterns 的规则仍保留可扫描的模式（去 AI 味行为不变）', () => {
    const withPatterns = BUILTIN_ANTI_AI_RULES.filter(r => (r.detectPatterns ?? []).length > 0)
    expect(withPatterns.length).toBeGreaterThanOrEqual(8)
    for (const r of withPatterns) {
      for (const p of r.detectPatterns ?? []) expect(p.length, r.key).toBeGreaterThan(0)
    }
    // 抽样：最典型的两条扫描模式必须还在
    const psychology = BUILTIN_ANTI_AI_RULES.find(r => r.key === 'forbid-explicit-psychology')
    expect(psychology?.detectPatterns).toContain('他感到')
    const elevation = BUILTIN_ANTI_AI_RULES.find(r => r.key === 'forbid-ending-elevation')
    expect(elevation?.detectPatterns).toContain('说到底')
  })

  it('内置规则的 builtin 标记与严重度/风险等级字段未被改写掉', () => {
    for (const r of BUILTIN_ANTI_AI_RULES) {
      expect(r.builtin, r.key).toBe(true)
      expect(['forbidden', 'risk', 'encourage']).toContain(r.severity)
      expect(['high', 'medium', 'low']).toContain(r.riskLevel)
    }
  })
})

describe('起步写法档', () => {
  it('4 档且 templateKey 都能对上模板', () => {
    expect(BUILTIN_STARTER_STYLE_PROFILES).toHaveLength(4)
    const templateKeys = new Set(BUILTIN_STYLE_TEMPLATES.map(t => t.key))
    for (const p of BUILTIN_STARTER_STYLE_PROFILES) {
      expect(templateKeys.has(p.templateKey), p.key).toBe(true)
      expect(p.name.length, p.key).toBeGreaterThan(0)
      expect(p.description.length, p.key).toBeGreaterThan(0)
    }
  })

  it('starterProfileToAsset 能按引用生成资产', () => {
    for (const p of BUILTIN_STARTER_STYLE_PROFILES) {
      const asset = starterProfileToAsset(p)
      expect(asset, p.key).not.toBeNull()
      expect(asset?.name).toBe(p.name)
    }
  })
})
