/**
 * Enforce the theme/size contract for the novel-forge panel:
 *  主题 = 颜色质感，密度 = 尺寸，两者正交。
 *
 * Scans panel.module.css and fails when a data-nf-theme / data-nf-mode
 * block declares any size property (font-size, padding, height, width,
 * gap, margin, border-radius, min/max-*). Only color/shadow/backdrop
 * declarations are allowed there.
 *
 * Usage: node scripts/check-theme-sizes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const cssPath = path.resolve(process.cwd(), 'src/client/panel/panel.module.css')
const css = fs.readFileSync(cssPath, 'utf8')
const lines = css.split(/\r?\n/)

const SIZE_PROPS = new Set([
  'font-size', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'height', 'min-height', 'max-height', 'width', 'min-width', 'max-width',
  'gap', 'row-gap', 'column-gap', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'top', 'right', 'bottom', 'left', 'flex', 'flex-basis', 'inset', 'line-height',
])

let inBlock = false
let blockLabel = ''
const violations = []

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const trimmed = line.trim()
  // A theme/mode selector opens a tracked block.
  if (/data-nf-theme|data-nf-mode/.test(line) && trimmed.endsWith('{')) {
    inBlock = true
    blockLabel = trimmed.replace(/s*{s*$/, '')
    continue
  }
  if (!inBlock) continue
  // Closing brace of the tracked block.
  if (trimmed === '}') {
    inBlock = false
    blockLabel = ''
    continue
  }
  if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
  const propMatch = /^([a-zA-Z-]+)\s*:/.exec(trimmed)
  if (propMatch === null) continue
  const prop = propMatch[1].toLowerCase()
  // Nested selectors inside a block (CSS nesting) restart tracking at the child block.
  if (/^[.#\[&]/.test(trimmed)) {
    inBlock = false
    continue
  }
  if (SIZE_PROPS.has(prop)) {
    violations.push({ line: i + 1, selector: blockLabel, decl: trimmed })
  }
}

if (violations.length > 0) {
  console.error('✗ 主题块包含尺寸声明（违反“主题=颜色、密度=尺寸”约定）：')
  for (const v of violations) {
    console.error(`  L${v.line} [${v.selector}] ${v.decl}`)
  }
  process.exit(1)
}
console.log('✓ 主题块尺寸检查通过：data-nf-theme / data-nf-mode 块内无任何尺寸声明。')
