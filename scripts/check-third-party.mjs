/**
 * 来源卫生检查（长期门禁）：本仓库的源码、测试、脚本与说明文档里不得出现外部项目的
 * 名称、组织名、外部符号名、不相容的许可证标记，也不得把内容标注为外部来源。
 *
 * 为什么需要它：
 *   1) 本项目的内置种子数据与写作骨架**全部是自研表述**（结构上参考过同类工具的
 *      功能划分，但不搬运任何文本）。这条检查把「只学结构、不搬运文本」从口头约定
 *      变成发布前的硬门禁；
 *   2) 一旦有人再引入外部内容，许可与版权状态就会变复杂，而 npm 版本号不可回收，
 *      所以在 CI 与发布流程里直接拦住，比事后补救便宜。
 *
 * 用法：node scripts/check-third-party.mjs
 *   退出码 0 = 干净；1 = 命中（列出 文件:行:内容）
 *
 * 唯一的例外是本脚本自身——它必须写下这些特征串才能检测它们。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

/** 检查目标：源码 / 测试 / 脚本 / 配置 / 说明文档。 */
const TARGETS = [
  'src', 'tests', 'scripts',
  'README.md', 'CHANGELOG.md',
  'package.json', 'cordis.patch.yml', 'tsdown.config.ts', 'vitest.config.ts',
]

/** 本脚本自身（唯一例外）。 */
const SELF_BASENAME = 'check-third-party.mjs'

/** 拦截特征：外部项目名 / 组织名 / 外部符号名 / 不相容许可证标记 / 来源标注措辞。 */
const FORBIDDEN = [
  { pattern: /AI-Novel-Writing-Assistant/i, label: '外部项目名' },
  { pattern: /ExplosiveCoderflome/i, label: '外部组织名' },
  { pattern: /dsh-ai-novel-writer/i, label: '其它插件名' },
  { pattern: /DEFAULT_ANTI_AI_RULES|DEFAULT_STYLE_TEMPLATES|DEFAULT_STARTER_STYLE_PROFILES/, label: '外部符号名' },
  { pattern: /\bAGPL\b/i, label: '不相容许可证标记' },
  { pattern: /移植自|搬运自|ported from|derived from [A-Za-z]/i, label: '来源标注措辞' },
]

/** 参与检查的文本扩展名。 */
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
  if ((target.split(sep).pop() ?? '') === SELF_BASENAME) return
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
  console.error('✗ 来源卫生检查未通过：发现外部来源标记或来源标注措辞。')
  console.error('  原则是「只参考功能结构，不搬运文本」——请改写成本项目自己的说法。')
  console.error('')
  for (const hit of hits) console.error('  ' + hit)
  process.exit(1)
}

console.log(`✓ 来源卫生检查通过：${checked.length} 个文件，未发现外部来源标记。`)
