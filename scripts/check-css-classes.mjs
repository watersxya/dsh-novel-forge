#!/usr/bin/env node
/**
 * TSX → CSS Module 类存在性检查：找出「TSX 里 `css.X` 引用了、但 CSS 里从未定义」的类名。
 *
 * 为什么需要（与 check-css-vars 同族，但覆盖面不同）：
 *   `className={css.homeHero}` 在 `homeHero` 未定义时**不报错** —— CSS Modules 给出
 *   `undefined`，React 原样写进 class 属性，页面只是"少一层样式"，看起来像设计稿没对齐。
 *   本项目踩过同款：`css.chWorkMainSurface`（该类从未定义，className 里直接是 "undefined"）。
 *   check-css-vars 只查 CSS 变量，覆盖不到类名 —— 这个脚本补的就是这一格。
 *
 * 场景：CSS 大改（换皮肤、合并冲突、删死类名）后，用它证明"没有任何组件失去样式"。
 *
 * 用法：node scripts/check-css-classes.mjs
 * 退出码 1 表示存在引用但未定义的类名（真 bug）。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PANEL_DIR = join(process.cwd(), 'src', 'client', 'panel')

/** 去掉注释，避免把注释里提到的 `css.xxx` 当成真实引用。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/[^\n]*$/gm, '')
}

function collectFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.bak') || name.includes('.bak-') || name.includes('.reference') || name.endsWith('.grafted')) continue
    if (name.endsWith('.css') || name.endsWith('.tsx')) out.push(join(dir, name))
  }
  return out
}

const files = collectFiles(PANEL_DIR)
const cssFiles = files.filter(f => f.endsWith('.css'))
const tsxFiles = files.filter(f => f.endsWith('.tsx'))

const defined = new Set()
for (const f of cssFiles) {
  const css = stripComments(readFileSync(f, 'utf8'))
  for (const m of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) defined.add(m[1])
}

const missing = new Map()
for (const f of tsxFiles) {
  const src = stripComments(readFileSync(f, 'utf8'))
  for (const m of src.matchAll(/css\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1]
    if (!defined.has(name)) {
      const list = missing.get(name) ?? []
      list.push(f.split(/[\\/]/).pop())
      missing.set(name, list)
    }
  }
}

if (missing.size === 0) {
  console.log(`✓ CSS 类闭合性检查通过：${tsxFiles.length} 个 TSX 引用的 ${defined.size} 个类名全部有定义。`)
  process.exit(0)
}

console.error(`✗ 有 ${missing.size} 个类名被 TSX 引用但 CSS 未定义（页面会渲染成 className="undefined"）：`)
for (const [name, files] of [...missing].sort()) {
  console.error(`  ${name}  ← ${[...new Set(files)].join(', ')}`)
}
process.exit(1)
