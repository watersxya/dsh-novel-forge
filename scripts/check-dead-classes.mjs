#!/usr/bin/env node
/**
 * 死类名检查：找出「CSS 里定义了但 TSX 从未引用」的类。
 *
 * 为什么需要：CSS Modules 会把每个类名编译成独立哈希，不引用就不占体积 ——
 * 所以死类名不会报错、不会警告、也不会拖慢构建，它只是安静地躺在那里，
 * 等着某天有人「参考这个已有的类名」把一个已经废弃的样式复活。
 * 本项目历史上就有两处主题桩（11 套新拟物主题的占位）在主题改版后成了纯注释残留。
 *
 * 判定规则（刻意保守，宁可漏报不可误报）：
 *   1. 只报「纯选择器类」—— 出现在 `.foo` 或 `.foo,` 或 `.foo {` 位置的标识符。
 *      `.foo .bar` / `.foo:hover` 里的 foo 是修饰用法，不单独算定义。
 *   2. 跳过 CSS Modules 组合引用（`composes`）与 `@keyframes` 名字。
 *   3. 跳过状态属性驱动类（`[data-x] .foo` 这类由 data 属性切换、TSX 侧只写 data-x）——
 *      这类会额外白名单化 data 属性里出现的名字。
 *   4. 跳过局部变量（`--foo`）、以及 `.view` / `.panel` 这类宿主契约类。
 *
 * 用法：node scripts/check-dead-classes.mjs [--list]
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PANEL_DIR = join(process.cwd(), 'src', 'client', 'panel')
const files = readdirSync(PANEL_DIR)
  .filter(n => (n.endsWith('.css') || n.endsWith('.tsx')) && !n.includes('.bak'))
  .map(n => join(PANEL_DIR, n))

const cssFiles = files.filter(f => f.endsWith('.css'))
const tsxFiles = files.filter(f => f.endsWith('.tsx'))

/** 宿主契约类：由外部宿主或 data 属性控制，不在 TSX 里直接引用。 */
const HOST_CLASSES = new Set(['view', 'panel', 'nfToast'])

/** 动态拼接的类名：写成 `css['notice-' + kind]`，静态扫不到，需人工白名单。 */
const DYNAMIC_CLASSES = new Set([
  // NoticeBar 的四态：css[`notice-${kind}`]
  'notice-ok', 'notice-info', 'notice-warn', 'notice-error',
  // toast 模块按 kind 切图标容器/刻度
  'nfToastHost', 'nfToastTick',
])

/** CSS 里定义的类名（含单类与逗号列表末尾的类）。 */
const defined = new Map() // name -> [files]
for (const f of cssFiles) {
  const src = readFileSync(f, 'utf8')
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')) // 去注释
    .replace(/@keyframes\s+[\w-]+/g, '@kf ')
  for (const m of stripped.matchAll(/(^|[\s,}])\.(-?[_A-Za-z][\w-]*)/g)) {
    const name = m[2]
    if (!defined.has(name)) defined.set(name, [])
    defined.get(name).push(f)
  }
}

/** data 属性值里出现的类名（data-nf-mode='light' 这类切换器的语义）。 */
const dataTokens = new Set()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/data-[\w-]+(?:=|\s*=)\s*\{?'?([\w -]+)'?\}?/g)) {
    for (const t of m[1].split(/\s+/)) if (t) dataTokens.add(t)
  }
  for (const m of src.matchAll(/data-([\w-]+)(?!=)[^\n]*?[\s{>]/g)) dataTokens.add(m[1].replace(/^nf-/, ''))
}

/** TSX / TS 里通过 css.xxx 引用的类名 + 模板字符串里的拼接。 */
const used = new Set()
for (const f of tsxFiles) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\bcss\.([A-Za-z_][\w]*)/g)) used.add(m[1])
}

/** 其他 CSS 里 @container/@media 内通过组合选择器引用到的 —— 上面已覆盖定义侧，这里补 template literal。 */
for (const f of tsxFiles) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\$\{css\.([A-Za-z_][\w]*)\}/g)) used.add(m[1])
}

const dead = [...defined.entries()]
  .filter(([name]) => !used.has(name) && !HOST_CLASSES.has(name) && !DYNAMIC_CLASSES.has(name) && !dataTokens.has(name))
  .sort((a, b) => a[0].localeCompare(b[0]))

const showAll = process.argv.includes('--list')
if (showAll) {
  console.log('全部已定义类名（' + defined.size + '）：')
  console.log([...defined.keys()].sort().join(' '))
  console.log('')
}

if (dead.length === 0) {
  console.log(`✓ 死类名检查通过：${defined.size} 个类全部有引用。`)
  process.exit(0)
}

console.log(`△ ${dead.length} 个类已定义但未被 TSX 直接引用（可能是死代码，也可能是 data 属性驱动 / 组合基类）：\n`)
for (const [name, fs] of dead) {
  console.log(`  .${name.padEnd(26)} ${[...new Set(fs.map(f => f.replace(PANEL_DIR, 'panel')))].join(', ')}`)
}
console.log('\n提示：确认无用后请删除 CSS 定义；若由 data-* 属性或组合选择器驱动，加进脚本顶部的 HOST_CLASSES 白名单。')
process.exit(0)