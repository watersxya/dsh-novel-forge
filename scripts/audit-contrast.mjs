/**
 * 主题对比度审计（WCAG 2.x 相对亮度对比度）。
 *
 * 用法：node scripts/audit-contrast.mjs
 *
 * 做法：解析 src/client/panel/panel.module.css 顶层规则块，按 (主题, 明暗) 维度
 * 汇集 --nf-* 颜色令牌（浅色种子 = .view 基准，深色种子 = mode-dark 基准，主题块只写差异），
 * 然后对关键「前景/背景」组合算对比度：
 *   - text   vs bg / bg-raise   （正文，目标 ≥ 4.5）
 *   - text-2 vs bg / bg-raise   （次要文本，目标 ≥ 4.5）
 *   - text-3 vs bg              （辅助文本，目标 ≥ 3.0）
 *   - accent-fg vs accent       （按钮文字，目标 ≥ 4.5）
 *
 * 说明：玻璃底是半透明色叠在宿主壁纸上，真实对比度无法精确得知；
 * 这里按「rgba 先在内部逐层合成，再叠到基准画布（浅=白 / 深=#0a0b0d）」估算，
 * 是接近最差情况的保守口径。color-mix(in srgb, #hex, ...) 按 hex 全不透明处理
 * （--nf-glass-opacity 默认 100% 时即为其真实值）。endfield accent 走 --edge-accent
 * 引用链，valley / wuling 两档分别审计。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'panel', 'panel.module.css')
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/* ---------- 解析顶层规则块 ---------- */
function parseBlocks(src) {
  const blocks = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    const selector = src.slice(i, open).trim()
    if (selector.startsWith('@media') || selector.startsWith('@keyframes') || selector.startsWith('@supports')) {
      let depth = 1, j = open + 1
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') depth--
        j++
      }
      i = j
      continue
    }
    const close = src.indexOf('}', open)
    if (close < 0) break
    blocks.push({ selector: selector.replace(/\s+/g, ' '), body: src.slice(open + 1, close) })
    i = close + 1
  }
  return blocks
}

/* ---------- 颜色解析与合成 ---------- */
function parseColor(str) {
  const s = str.trim().toLowerCase()
  if (s === 'none' || s === 'transparent') return null
  let m = s.match(/^#([0-9a-f]{6})$/)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 }
  m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 }
  m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map(x => parseFloat(x.trim()))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] }
  }
  m = s.match(/^color-mix\(in srgb, (#[0-9a-f]{3,6})/) // 玻璃透明度默认 100% 时即该 hex
  if (m) return parseColor(m[1])
  return null
}

/** alpha 上合成：fg 叠在 bg 上（fg.a < 1 时） */
function over(fg, bg) {
  if (!fg) return null
  if (fg.a >= 1) return fg
  if (!bg) return { ...fg, a: 1 }
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  }
}

function luminance(c) {
  if (!c) return 0
  const f = v => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

function contrast(a, b) {
  if (!a || !b) return 0
  const l1 = luminance(a); const l2 = luminance(b)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/* ---------- 上下文定义 ---------- */
/** endfield accent 走 --edge-accent 引用链，按档位解析成实际值（valley 默认 / wuling 武陵青） */
const ALIAS = {
  'var(--edge-accent)': '#fff500',
  'var(--edge-accent-onpaper)': '#d9c700',
  'var(--edge-accent-deep)': '#e8e000',
}
const WULING = {
  'var(--edge-accent)': '#14d0d0',
  'var(--edge-accent-onpaper)': '#14d0d0',
  'var(--edge-accent-deep)': '#10b8b8',
}

const contexts = [
  { id: 'liquid·浅（默认）', canvas: { r: 255, g: 255, b: 255 }, theme: null, dark: false },
  { id: 'liquid·深（默认）', canvas: { r: 10, g: 11, b: 13 }, theme: 'mode-dark', dark: true },
  { id: 'neumorph·浅', canvas: { r: 240, g: 240, b: 245 }, theme: 'neumorph', dark: false },
  { id: 'macos·浅', canvas: { r: 245, g: 246, b: 248 }, theme: 'macos', dark: false },
  { id: 'macos·深', canvas: { r: 18, g: 18, b: 20 }, theme: 'macos', dark: true },
  { id: 'clay·浅', canvas: { r: 244, g: 233, b: 220 }, theme: 'clay', dark: false },
  { id: 'clay·深', canvas: { r: 43, g: 38, b: 34 }, theme: 'clay', dark: true },
  { id: 'endfield·浅·valley', canvas: { r: 245, g: 240, b: 230 }, theme: 'endfield', dark: false },
  { id: 'endfield·浅·wuling', canvas: { r: 245, g: 240, b: 230 }, theme: 'endfield', dark: false, alias: WULING },
  { id: 'endfield·深·valley', canvas: { r: 22, g: 24, b: 26 }, theme: 'endfield', dark: true },
  { id: 'endfield·深·wuling', canvas: { r: 22, g: 24, b: 26 }, theme: 'endfield', dark: true, alias: WULING },
]

/** 判断一个规则块属于哪个 (theme, dark) 的「根」令牌块；不属于返回 null。
 *  根块 = 每个逗号分段都以 .panel/.view 自身结尾（子规则如 `.panel[…] .button` 被排除）。 */
function blockContext(selector) {
  if (selector === '.view') return { theme: null, dark: false }
  if (/endfield-accent/.test(selector)) return null // wuling 变体单独体系，本审计按默认 valley 档
  for (const compound of selector.split(',')) {
    const last = compound.trim().split(' ').pop() ?? ''
    if (!last.startsWith('.panel') && !last.startsWith('.view')) return null
  }
  const t = selector.match(/data-nf-theme='([a-z]+)'\]/)
  if (t) {
    // 深色判定按逗号分段：剥掉 :not(...) 后，任一分段含深色标记且不含强制浅色
    const dark = selector.split(',').some(c => {
      const s = c.replace(/:not\([^)]*\)/g, '')
      return /data-ds-dark-theme|data-nf-mode='dark'/.test(s) && !/data-nf-mode='light'/.test(s)
    })
    return { theme: t[1], dark }
  }
  if (/data-nf-mode='dark'\],/.test(selector)) return { theme: 'mode-dark', dark: true }
  return null
}

const blocks = parseBlocks(css)
const TOKEN_RE = /--nf-(?:text|text-2|text-3|bg|bg-raise|accent|accent-fg)\s*:/

// 基准种子：浅色继承 .view 基准，深色继承 mode-dark 基准（主题块只写差异部分）
const seeds = { false: {}, true: {} }
for (const b of blocks) {
  const c = blockContext(b.selector)
  if (!c || c.theme !== null) continue
  const key = String(c.dark)
  for (const line of b.body.split(';')) {
    if (!TOKEN_RE.test(line)) continue
    const m = line.match(/(--nf-(?:text|text-2|text-3|bg|bg-raise|accent|accent-fg))\s*:\s*([^;]+)/)
    if (m) seeds[key][m[1]] = m[2].trim()
  }
}

const results = []
for (const ctx of contexts) {
  const tokens = { ...seeds[String(ctx.dark)] }
  for (const b of blocks) {
    const c = blockContext(b.selector)
    if (!c || c.theme !== ctx.theme || c.dark !== ctx.dark) continue
    for (const line of b.body.split(';')) {
      if (!TOKEN_RE.test(line)) continue
      const m = line.match(/(--nf-(?:text|text-2|text-3|bg|bg-raise|accent|accent-fg))\s*:\s*([^;]+)/)
      if (m) tokens[m[1]] = ((ctx.alias ?? ALIAS)[m[2].trim()] ?? m[2].trim())
    }
  }
  const need = ['--nf-text', '--nf-text-2', '--nf-text-3', '--nf-bg', '--nf-bg-raise', '--nf-accent', '--nf-accent-fg']
  const missing = need.filter(k => tokens[k] === undefined)
  if (missing.length > 0) {
    results.push({ id: ctx.id + '（令牌不全，跳过: ' + missing.join(',') + '）', rows: [] })
    continue
  }
  const canvas = ctx.canvas
  const bg = parseColor(tokens['--nf-bg'])
  const bgRaise = parseColor(tokens['--nf-bg-raise'])
  if (!bg || !bgRaise) {
    results.push({ id: ctx.id + '（bg/bg-raise 解析失败，跳过）', rows: [] })
    continue
  }
  const BG = over(bg, canvas)
  const BGraise = over(bgRaise, canvas)
  const resolve = (name) => over(parseColor(tokens[name]), BG)
  const accentSolid = over(parseColor(tokens['--nf-accent']), BG)
  const rows = [
    ['text / bg', contrast(resolve('--nf-text'), BG), 4.5],
    ['text-2 / bg', contrast(resolve('--nf-text-2'), BG), 4.5],
    ['text-3 / bg', contrast(resolve('--nf-text-3'), BG), 3.0],
    ['text / bg-raise', contrast(resolve('--nf-text'), BGraise), 4.5],
    ['text-2 / bg-raise', contrast(resolve('--nf-text-2'), BGraise), 4.5],
    ['accent-fg / accent', contrast(over(parseColor(tokens['--nf-accent-fg']), BG), accentSolid), 4.5],
  ]
  results.push({ id: ctx.id, rows })
}

/* ---------- 输出 ---------- */
let fail = 0
for (const r of results) {
  console.log('\n== ' + r.id + ' ==')
  if (r.rows.length === 0) { console.log('  ' + r.id); continue }
  for (const [name, ratio, target] of r.rows) {
    const ok = ratio >= target
    if (!ok) fail++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${ratio.toFixed(2)} : 1  (目标 ≥ ${target})`)
  }
}
console.log('\n--------\nFAIL 总数: ' + fail)
process.exit(fail > 0 ? 1 : 0)
