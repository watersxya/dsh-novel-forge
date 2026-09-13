/**
 * 第三方来源卫生检查：代码里不得内联外部项目名称与来源标记。
 *
 * 为什么需要它：
 *   1) 本仓库是 Apache-2.0，而部分上游项目（如种子数据的来源仓库）在较新版本已改为
 *      AGPL-3.0-only —— 一旦有人从新版复制代码/文案，许可就会冲突。这条检查把"不要
 *      重新引入外部来源"变成发布前的硬门禁，而不是靠记忆。
 *   2) 归属声明应集中登记在 THIRD_PARTY_NOTICES.md（随 npm 包分发），源码保持自描述，
 *      不再散落"某某项目内置"之类的引用。
 *
 * 用法：node scripts/check-third-party.mjs
 *   退出码 0 = 干净；1 = 命中（列出文件:行:内容）
 *
 * 说明：注释里出现"借鉴/参考同类项目"的中文表述是允许的（不含项目名）；被拦截的是
 * 具体项目名、仓库名、组织名，以及 AGPL 相关标记。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

/** 需要检查的源码/配置目录与文件（产物 lib/ 与依赖 node_modules 不在内）。 */
const TARGETS = ['src', 'tests', 'scripts', 'cordis.patch.yml', 'package.json', 'tsdown.config.ts', 'vitest.config.ts']

/** 允许出现这些名称的**唯一**位置：归属声明文件本身。 */
const ALLOWED_FILES = new Set(['THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'README.md'])

/** 拦截规则：外部项目名 / 组织名 / 上游许可证标记。 */
const FORBIDDEN = [
  { pattern: /AI-Novel-Writing-Assistant/i, label: '上游项目名' },
  { pattern: /ExplosiveCoderflome/i, label: '上游组织名' },
  { pattern: /dsh-ai-novel-writer/i, label: '其它插件名' },
  { pattern: /DEFAULT_ANTI_AI_RULES|DEFAULT_STYLE_TEMPLATES|DEFAULT_STARTER_STYLE_PROFILES/, label: '上游符号名' },
  { pattern: /\bAGPL\b/i, label: '上游许可证标记' },
]

/** 检查的文本扩展名。 */
const TEXT_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.css', '.md'])

const hits = []
const checked = []

/** 递归遍历一个目标（文件或目录）。 */
function walk(target) {
  const abs = join(ROOT, target)
  let st
  try {
    st = statSync(abs)
  } catch {
    return // 目标不存在时跳过（配置可裁剪）
  }
  if (st.isDirectory()) {
    for (const entry of readdirSync(abs)) {
      if (entry === 'node_modules' || entry === 'lib' || entry === '.git') continue
      walk(join(target, entry))
    }
    return
  }
  const dot = target.lastIndexOf('.')
  if (dot === -1 || !TEXT_EXT.has(target.slice(dot))) return
  // 跳过本脚本自身与归属声明文件（它们按定义就要提到这些名称）。
  if (target === join('scripts', 'check-third-party.mjs')) return
  if (ALLOWED_FILES.has(target.split(sep).pop() ?? '')) return
  const text = readFileSync(abs, 'utf8')
  checked.push(target)
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(line)) {
        hits.push(`${relative(ROOT, abs)}:${i + 1}: [${rule.label}] ${line.trim().slice(0, 140)}`)
      }
    }
  })
}

for (const target of TARGETS) walk(target)

if (hits.length > 0) {
  console.error('✗ 第三方来源卫生检查未通过：代码/配置里出现了外部项目名称或来源标记。')
  console.error('  归属声明请集中写到 THIRD_PARTY_NOTICES.md，源码只描述"本仓库自己的东西"。')
  console.error('')
  for (const hit of hits) console.error('  ' + hit)
  process.exit(1)
}

console.log(`✓ 第三方来源卫生检查通过：${checked.length} 个文件，未发现外部项目名称或 AGPL 标记。`)
