#!/usr/bin/env node
/**
 * CSS 变量闭合性检查：找出「被 var() 引用但从未定义」的令牌。
 *
 * 为什么需要：CSS 里 `var(--nf-typo, #333)` 在变量缺失时会**静默**回落到 fallback ——
 * 不报错、不报警、只在页面上表现为「这一行的颜色/字号跟设计稿不一样」。
 * 本项目历史上因此踩过三次：
 *   1. --nf-text-12   四个视图各自内联，success 与 error 共用同一个未定义变量 → 字号全部失效
 *   2. --nf-muted     TSX 侧 borderColor 拿到 undefined → 整条描边消失
 *   3. --nf-text-1    .importFileInfo 引用但从未定义 → color 回落到继承色
 * 三处都是「编译通过、运行时无提示、视觉悄悄跑偏」。这个脚本就是那道缺失的提示。
 *
 * 用法：node scripts/check-css-vars.mjs
 * 退出码 1 表示有「无 fallback 的未定义变量」（真 bug）；仅有 fallback 的只报告不失败
 * （fallback 说明作者知道它可能缺失，但仍然是应当补档的技术债）。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PANEL_DIR = join(process.cwd(), 'src', 'client', 'panel')
const VAR_PREFIX = '--nf-'

/** 收集面板目录下所有源码文件（CSS Modules + TSX）。 */
function collectFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.bak') || name.includes('.bak-')) continue // 备份文件不算活代码
    if (name.endsWith('.css') || name.endsWith('.tsx')) out.push(join(dir, name))
  }
  return out
}

const files = collectFiles(PANEL_DIR)

/** 令牌定义点：只看 CSS（TSX 不会定义 CSS 变量，除非走 style 注入，那是运行时局部值）。 */
const defined = new Set()
const sources = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (f.endsWith('.css')) {
    for (const m of src.matchAll(/(--nf-[A-Za-z0-9-]+)\s*:/g)) defined.add(m[1])
  }
  sources.push([f, src])
}

/** 令牌使用点：记录有无 fallback。 */
const uses = new Map() // name -> { total, withFallback, sites: string[] }

/** 注释里的 var() 是「说明文字」，不是真实引用（历史注释提到过未定义变量名）。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')) // 保留行数，便于定位
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(Math.max(0, m.length - p1.length)))
}

/** 模板字符串里拼接的令牌（如 `var(--nf-space-${gap})`）静态不可判定，跳过。 */
function isTemplated(name) {
  return /var\(--nf-[A-Za-z0-9-]*\$\{/.test(`${name} `) || name.endsWith('-')
}

for (const [f, raw] of sources) {
  const src = stripComments(raw)
  for (const m of src.matchAll(/var\((--nf-[A-Za-z0-9-]+)([^)]*)\)/g)) {
    const name = m[1]
    if (!name.startsWith(VAR_PREFIX)) continue
    // 拼接型令牌名（如 `--nf-space-` 后接 ${}）不是真引用。
    if (name.endsWith('-')) continue
    // var(--x, red) → 有 fallback；var(--x) → 无。注意 fallback 里可能还有嵌套 var()。
    const rest = m[2]
    const hasFallback = rest.trimStart().startsWith(',')
    const rec = uses.get(name) ?? { total: 0, withFallback: 0, sites: [] }
    rec.total++
    if (hasFallback) rec.withFallback++
    else if (rec.sites.length < 4) {
      const line = src.slice(0, m.index).split('\n').length
      rec.sites.push(`${f.replace(PANEL_DIR, 'panel')}:${line}`)
    }
    uses.set(name, rec)
  }
}

const missing = [...uses.entries()]
  .filter(([name]) => !defined.has(name))
  .sort((a, b) => a[0].localeCompare(b[0]))

const hardFail = missing.filter(([, r]) => r.withFallback < r.total) // 存在「无 fallback」的引用
const softFail = missing.filter(([, r]) => r.withFallback > 0 && r.withFallback === r.total)

if (hardFail.length > 0) {
  console.error('\n✗ 有令牌被引用但从未定义，且未写 fallback —— 样式会静默回落到继承值：\n')
  for (const [name, r] of hardFail) {
    console.error(`  ${name}`)
    console.error(`    引用 ${r.total} 处，其中 ${r.total - r.withFallback} 处无 fallback`)
    for (const s of r.sites) console.error(`    ↳ ${s}`)
  }
  console.error('')
}

if (softFail.length > 0) {
  console.log('△ 以下令牌未定义，但全部写了 fallback（能兜住，应补档）：')
  for (const [name, r] of softFail) {
    console.log(`  ${name.padEnd(24)} 引用 ${String(r.total).padStart(4)} 处（均有 fallback）`)
  }
  console.log('')
}

const ok = hardFail.length === 0
console.log(`定义令牌 ${defined.size} 个 · 引用令牌 ${uses.size} 个 · 未定义 ${missing.length} 个`)
console.log(ok
  ? '✓ CSS 变量闭合性检查通过：无「无 fallback 的未定义令牌」。'
  : `✗ CSS 变量检查失败：${hardFail.length} 个令牌会静默失效。`)

process.exit(ok ? 0 : 1)