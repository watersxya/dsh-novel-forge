/**
 * 来源卫生门禁自身的判别力（离线）。
 *
 * 为什么值得单独测：门禁的质量取决于两个方向，坏掉任何一个都会被人「关掉」而不是「修好」——
 *   1) **漏判**：真实的来源标注没被拦住，门禁形同虚设；
 *   2) **误判**：`derived from the url` 这类中性技术表达被拦下，作者被逼着放宽规则。
 *
 * 这里逐条覆盖这两类用例，并检查门禁脚本仍然声明了全部拦截类别与显式豁免清单。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 与 scripts/check-third-party.mjs 中「来源标注措辞」等价的规则（改动那边需同步这里）。 */
const SOURCE_MARKER_RULES: RegExp[] = [
  /移植自|搬运自/,
  /\b(?:ported|adapted|derived)\s+from\s+(?:(?:the|this|that)\s+)?(?:[A-Z][\w.-]*|[\w.-]+[-_/][\w.-]+)\b/,
  /\b(?:ported|adapted|derived)\s+from\s+(?:the\s+)?(?:project|repo|repository|codebase|implementation|upstream)\b/i,
]

const flags = (line: string): boolean => SOURCE_MARKER_RULES.some(re => re.test(line))

describe('来源卫生门禁：必须拦下真署名', () => {
  it.each([
    'ported from SomeProject',
    'derived from FooBar',
    '// derived from upstream',
    'adapted from the codebase',
    '本模块移植自上游实现',
    '该文案搬运自公开站点',
  ])('%s', (line) => {
    expect(flags(line), line).toBe(true)
  })
})

describe('来源卫生门禁：不得误报中性技术表达', () => {
  it.each([
    '// filename must be <owner>__<repo>.yml derived from the url',
    'the display name is derived from the file name',
    'value derived from user input at runtime',
    'const x = derived from base ? true : false',
  ])('%s', (line) => {
    expect(flags(line), line).toBe(false)
  })
})

describe('来源卫生门禁脚本的契约', () => {
  const script = readFileSync('scripts/check-third-party.mjs', 'utf8')

  it('声明了全部五类拦截特征', () => {
    for (const label of ['外部项目名', '外部组织名', '外部符号名', '不相容许可证标记', '来源标注措辞']) {
      expect(script, label).toContain(label)
    }
  })

  it('豁免清单是显式的，且每一项都写了理由', () => {
    // ALLOWED 是一张 路径 -> 理由 的表；显式豁免才不会被无声放宽。
    expect(script).toMatch(/const ALLOWED = new Map\(\[/)
    const allowed = /const ALLOWED = new Map\(\[([\s\S]*?)\]\)/.exec(script)?.[1] ?? ''
    const entries = allowed.split('\n').filter(l => l.trim().startsWith("['"))
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      // 每项形如 ['path', 'reason'] —— 必须有非空理由。
      expect(entry, entry).toMatch(/^\s*\[[^\]]+,\s*'[^']+'\],?\s*$/)
    }
  })

  it('失败信息给出可操作的出路（改写 / 集中登记），而不是只说“不通过”', () => {
    expect(script).toContain('PROVENANCE.md')
    expect(script).toMatch(/ALLOWED/)
  })

  it('成功时报告扫描数量与豁免清单（避免隐式豁免）', () => {
    expect(script).toContain('扫描')
    expect(script).toContain('豁免')
  })
})
