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
/**
 * 真实存在的上下文只有 2 套：1 套色板（墨案 / 墨纸）× 2 明暗。
 *
 * 历史遗留（已修）：本表曾列出 11 套（liquid / neumorph / macos / clay / endfield
 * × 各档），但 panel.module.css 里 `data-nf-theme` 作为选择器出现 0 次 ——
 * 那 9 套主题的令牌覆盖块从未存在（连空注释桩都已删除）。脚本找不到对应块时
 * 会「继承种子值」，于是同一套色板被重复审计 6 遍，输出 66 项全 PASS 的假绿灯
 * （6 套浅色主题的 text/bg 全是 14.28:1，正是同一色板的指纹）。
 *
 * 增删主题时必须同步本表与 CSS 的 data-nf-theme 块，否则审计范围与真实交付脱节。
 */
// 四个上下文 = 四套**实际会生效**的色板：
//   .view 浅 / .view 深（跟随系统时的基准）
//   .panel[data-nf-mode=light] / [data-nf-mode=dark]（用户强制时的覆盖板）
// 后两套与前两套并非复刻（值不同），必须分开验，否则审计量到的不是界面真实色值。
const contexts = [
  { id: '墨纸·浅（跟随系统 · .view 基准）', canvas: { r: 255, g: 255, b: 255 }, theme: null, dark: false },
  { id: '墨纸·深（跟随系统 · .view 基准）', canvas: { r: 10, g: 11, b: 13 }, theme: 'mode-dark', dark: true },
  { id: '墨纸·浅（强制浅色 · 覆盖板）', canvas: { r: 255, g: 255, b: 255 }, theme: 'force-light', dark: false },
  { id: '墨纸·深（强制深色 · 覆盖板）', canvas: { r: 10, g: 11, b: 13 }, theme: 'force-dark', dark: true },
]

/** 判断一个规则块属于哪个 (theme, dark) 的「根」令牌块；不属于返回 null。
 *  根块 = 每个逗号分段都以 .panel/.view 自身结尾（子规则如 `.panel[…] .button` 被排除）。
 *
 *  注意 `.panel[data-nf-mode='light'|'dark']` 是**显式模式覆盖块**：它们比 `.view` 种子
 *  更具体，运行时真正生效的是它们。这里把它们识别为对应明暗的种子，按文件顺序覆盖，
 *  这样审计量到的就是界面实际使用的值 —— 否则会出现「审计通过、界面仍不达标」。 */
function blockContext(selector) {
  if (selector === '.view') return { theme: null, dark: false }
  if (/endfield-accent/.test(selector)) return null // 历史主题残留选择器，本审计无对应色板
  // 显式模式覆盖块：只在整块就是该选择器时认（带子选择器的排除）。
  //
  // 关键：这两个块**不是 .view 基准的复刻**，而是各自独立的色板
  // （例：.view 深色 text-3 = #9d927b，而强制深色 = #9a917e → 调至 #a89d86；
  //   强制深色 accent = #a63e2a，.view 深色 = #c0492d）。
  // 所以它们必须各自成一个审计上下文，单独验算 —— 若与基准合并，
  // 后写入的值会覆盖前者，审计量到的就不是界面真实使用的值，
  // 就会出现「审计全 PASS、界面仍不达标」。theme 字段用 'force-*' 区分。
  if (/^\.panel\[data-nf-mode='light'\]$/.test(selector.trim())) return { theme: 'force-light', dark: false }
  if (/^\.panel\[data-nf-mode='dark'\]$/.test(selector.trim())) return { theme: 'force-dark', dark: true }
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
/* 审计覆盖的颜色令牌：基础 7 项 + bg-inset（抽屉/凹陷区实际底色）
 * + 文字版语义色 4 项（图形版当文字色在浅色下不可读，见 -ink 注释）
 * + 焦点环 1 项（非文本对比，阈值按 WCAG 1.4.11 / 2.4.11 的 3:1，不是 4.5）。 */
const TOKEN_KEYS = '--nf-text|--nf-text-2|--nf-text-3|--nf-bg|--nf-bg-raise|--nf-bg-inset|--nf-accent|--nf-accent-fg|--nf-focus|--nf-success-ink|--nf-error-ink|--nf-warn-ink|--nf-info-ink'
const TOKEN_RE = new RegExp('(?:' + TOKEN_KEYS + ')\\s*:')
const TOKEN_CAP = new RegExp('(' + TOKEN_KEYS + ')\\s*:\\s*([^;]+)')

/** 收集某 (theme, dark) 的完整令牌表：先取 .view 基准（同 dark），再叠加该 theme 的覆盖块。
 *  theme=null 的上下文本身就是基准，无需叠加；其余按 specificity 由后写入者覆盖。 */
function tokensFor(ctx) {
  const out = {}
  // 1) 同明暗的 .view 基准
  if (ctx.theme === null) {
    for (const b of blocks) {
      const c = blockContext(b.selector)
      if (!c || c.theme !== null) continue
      if (String(c.dark) !== String(ctx.dark)) continue
      for (const line of b.body.split(';')) {
        if (!TOKEN_RE.test(line)) continue
        const m = line.match(TOKEN_CAP)
        if (m) out[m[1]] = m[2].trim()
      }
    }
    return out
  }
  // 2) 覆盖板是完整独立色板，不继承基准（实测值不同，继承会产生误导）
  for (const b of blocks) {
    const c = blockContext(b.selector)
    if (!c || c.theme !== ctx.theme || c.dark !== ctx.dark) continue
    for (const line of b.body.split(';')) {
      if (!TOKEN_RE.test(line)) continue
      const m = line.match(TOKEN_CAP)
      if (m) out[m[1]] = m[2].trim()
    }
  }
  return out
}

const results = []
for (const ctx of contexts) {
  const tokens = tokensFor(ctx)
  const need = ['--nf-text', '--nf-text-2', '--nf-text-3', '--nf-bg', '--nf-bg-raise', '--nf-bg-inset',
    '--nf-accent', '--nf-accent-fg', '--nf-focus',
    '--nf-success-ink', '--nf-error-ink', '--nf-warn-ink', '--nf-info-ink']
  const missing = need.filter(k => tokens[k] === undefined)
  if (missing.length > 0) {
    results.push({ id: ctx.id + '（令牌不全，跳过: ' + missing.join(',') + '）', rows: [] })
    continue
  }
  const canvas = ctx.canvas
  // 令牌允许写成一层 var() 间接（如 --nf-focus: var(--nf-accent)）：按同一张表 deref，
  // 否则这类令牌会被算成「解析失败」而静默跳过 —— 审计通过但界面值从未被验过。
  const deref = (v) => {
    const m = /^var\((--[\w-]+)\)$/.exec(v)
    return m ? (tokens[m[1]] ?? v) : v
  }
  const bg = parseColor(deref(tokens['--nf-bg']))
  const bgRaise = parseColor(deref(tokens['--nf-bg-raise']))
  if (!bg || !bgRaise) {
    results.push({ id: ctx.id + '（bg/bg-raise 解析失败，跳过）', rows: [] })
    continue
  }
  const BG = over(bg, canvas)
  const BGraise = over(bgRaise, canvas)
  const resolve = (name) => over(parseColor(deref(tokens[name])), BG)
  const accentSolid = over(parseColor(deref(tokens['--nf-accent'])), BG)
  // bg-inset 也要审：它是抽屉 / 凹陷区的实际底色，浅色下比 bg 更暗一档。
  const bgInset = over(parseColor(deref(tokens['--nf-bg-inset'] ?? tokens['--nf-bg'])), canvas)
  const focusColor = parseColor(deref(tokens['--nf-focus']))
  if (!focusColor) {
    results.push({ id: ctx.id + '（--nf-focus 解析失败，跳过）', rows: [] })
    continue
  }
  const rows = [
    ['text / bg', contrast(resolve('--nf-text'), BG), 4.5],
    ['text-2 / bg', contrast(resolve('--nf-text-2'), BG), 4.5],
    // 目标由 3.0 提到 4.5：--nf-text-3 用于 meta / 时间戳 / 次要说明（全文件 28 处），
    // 是长时段使用中最先疲劳的一层，按 WCAG AA 正文级要求，不再放行大字专用阈值。
    ['text-3 / bg', contrast(resolve('--nf-text-3'), BG), 4.5],
    ['text / bg-raise', contrast(resolve('--nf-text'), BGraise), 4.5],
    ['text-2 / bg-raise', contrast(resolve('--nf-text-2'), BGraise), 4.5],
    ['text-3 / bg-raise', contrast(resolve('--nf-text-3'), BGraise), 4.5],
    ['text-3 / bg-inset', contrast(over(parseColor(tokens['--nf-text-3']), bgInset), bgInset), 4.5],
    ['accent-fg / accent', contrast(over(parseColor(tokens['--nf-accent-fg']), BG), accentSolid), 4.5],
    // 文字版语义色：图形版（--nf-success #34c759 等）在浅色下仅 2.00:1，
    // 当文字色用完全不可读，因此另立 -ink 一层，这几项是它的验收门。
    ['success-ink / bg', contrast(resolve('--nf-success-ink'), BG), 4.5],
    ['error-ink / bg', contrast(resolve('--nf-error-ink'), BG), 4.5],
    ['warn-ink / bg', contrast(resolve('--nf-warn-ink'), BG), 4.5],
    ['info-ink / bg', contrast(resolve('--nf-info-ink'), BG), 4.5],
    ['error-ink / bg-inset', contrast(over(parseColor(deref(tokens['--nf-error-ink'])), bgInset), bgInset), 4.5],
    // 焦点环是非文本元素，按 WCAG 1.4.11 / 2.4.11 的 3:1 验收（不是正文的 4.5）。
    // 三种纸面都要过：环会画在卡片、抽屉底与画布上，浅色档 accent 单独用只有在
    // 深色档勉强（2.45:1），所以 --nf-focus 独立成令牌并由这里拦住回退。
    ['focus / bg', contrast(focusColor, BG), 3.0],
    ['focus / bg-raise', contrast(focusColor, BGraise), 3.0],
    ['focus / bg-inset', contrast(focusColor, bgInset), 3.0],
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

// 覆盖率说明：避免"通过"被误读成"所有主题都验过了"。
const audited = results.filter(r => r.rows.length > 0).length
const skipped = results.length - audited
console.log('\n--------')
console.log(`覆盖：${audited} 套实际算过；${skipped} 套因令牌不全跳过（未验证）。`)
if (skipped > 0) {
  console.log('  跳过的上下文不是"通过"——它们的对比度尚未被验证。')
  console.log('  常见原因：该主题没有独立的令牌覆盖块（此时它继承种子值），')
  console.log('  或令牌链引用了本脚本无法解析的颜色写法（如 oklch）。')
}
console.log(`FAIL 总数: ${fail}${fail === 0 && skipped > 0 ? '（注意：仍有未验证的上下文）' : ''}`)
process.exit(fail > 0 ? 1 : 0)
