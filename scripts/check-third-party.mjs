/**
 * 来源卫生检查（长期门禁）：本仓库**随包分发**的内容里不得出现外部项目的名称、
 * 组织名、外部符号名、不相容的许可证标记，也不得把内容标注为外部来源。
 *
 * 为什么需要它：
 *   1) 本项目的内置种子数据与写作骨架**全部是自研表述**（结构上参考过同类工具的
 *      功能划分，但不搬运任何文本）。这条检查把「只学结构、不搬运文本」从口头约定
 *      变成发布前的硬门禁；
 *   2) 一旦有人再引入外部内容，许可与版权状态就会变复杂，而 npm 版本号不可回收，
 *      所以在 CI 与发布流程里直接拦住，比事后补救便宜。
 *
 * 排除规则是**显式**的：只有 ALLOWED 里列出的路径豁免；其余文件一律扫描（包括
 * README 与 CHANGELOG）。豁免必须写清理由，且脚本每次运行都会打印豁免清单 ——
 * 隐式豁免（"它恰好不在扫描清单里"）会让规则在无人察觉时失效。
 *
 * 用法：node scripts/check-third-party.mjs [--list]
 *   退出码 0 = 干净；1 = 命中（列出 文件:行:内容）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, sep } from 'node:path'

const ROOT = process.cwd()

/** 本脚本自身（必须写下这些特征串才能检测它们）。 */
const ALLOWED = new Map([
  ['scripts/check-third-party.mjs', '本脚本必须写下被拦截的特征串才能检测它们'],
  ['PROVENANCE.md', '来源审计记录：集中登记参考过的外部项目、许可与边界取证（刻意的单一出处）'],
  ['tests/repo-hygiene.test.ts', '门禁自身的判别力测试：夹具必须逐字构造这些字符串，才能断言它们会被拦下'],
])

/** 扫描范围：仓库内全部文本文件（node_modules/.git 除外）。 */
const TEXT_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.css', '.md', '.txt'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', '.dsh', 'coverage'])

/** 拦截特征：外部项目名 / 组织名 / 外部符号名 / 不相容许可证标记 / 来源标注措辞。 */
const FORBIDDEN = [
  { pattern: /AI-Novel-Writing-Assistant/i, label: '外部项目名' },
  { pattern: /ExplosiveCoderflome/i, label: '外部组织名' },
  { pattern: /dsh-ai-novel-writer/i, label: '其它插件名' },
  { pattern: /DEFAULT_ANTI_AI_RULES|DEFAULT_STYLE_TEMPLATES|DEFAULT_STARTER_STYLE_PROFILES/, label: '外部符号名' },
  { pattern: /\bAGPL\b/i, label: '不相容许可证标记' },
  { pattern: /移植自|搬运自/, label: '来源标注措辞' },
  /**
   * 英文来源标注措辞。
   *
   * 这里刻意收窄：`derived from <某物>` 是极常见的**中性技术表达**（例如"文件名由
   * URL 推导而来"），把它一律拦下会制造误报，而误报会诱使人去放宽规则、最终让
   * 门禁形同虚设。真正需要拦的是**跟着一个来源主体**的写法：`derived from <大写标识
   * 符/带分隔符的名字>` 或 `derived from the <...> project/repo/implementation`。
   */
  { pattern: /\b(?:ported|adapted|derived)\s+from\s+(?:(?:the|this|that)\s+)?(?:[A-Z][\w.-]*|[\w.-]+[-_/][\w.-]+)\b/, label: '来源标注措辞' },
  { pattern: /\b(?:ported|adapted|derived)\s+from\s+(?:the\s+)?(?:project|repo|repository|codebase|implementation|upstream)\b/i, label: '来源标注措辞' },
]

const listOnly = process.argv.includes('--list')
const hits = []
const checked = []
const allowedSeen = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const abs = `${dir}${sep}${entry}`
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) { walk(abs); continue }
    const dot = entry.lastIndexOf('.')
    if (dot === -1 || !TEXT_EXT.has(entry.slice(dot).toLowerCase())) continue
    const rel = relative(ROOT, abs).split(sep).join('/')
    if (ALLOWED.has(rel)) { allowedSeen.push(rel); continue }
    const text = readFileSync(abs, 'utf8')
    checked.push(rel)
    text.split(/\r?\n/).forEach((line, i) => {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) hits.push(`${rel}:${i + 1}: [${rule.label}] ${line.trim().slice(0, 140)}`)
      }
    })
  }
}

if (listOnly) {
  console.log(`扫描范围：仓库内全部文本文件（跳过 ${[...SKIP_DIRS].join(' / ')}）`)
  console.log('\n豁免清单：')
  for (const [file, reason] of ALLOWED) console.log(`  ${file}\n      ${reason}`)
  console.log('\n拦截特征：')
  for (const rule of FORBIDDEN) console.log(`  [${rule.label}] ${rule.pattern}`)
  process.exit(0)
}

walk(ROOT)

if (hits.length > 0) {
  console.error('✗ 来源卫生检查未通过：发现外部来源标记或来源标注措辞。')
  console.error('  原则是「只参考功能结构，不搬运文本」。处理方式：')
  console.error('    · 把该处改写成本项目自己的说法（默认，也是绝大多数情况的正确做法）；')
  console.error('    · 若确有署名需要（例如引入需保留归属的组件），请把出处**集中登记到')
  console.error('      PROVENANCE.md**，并在此脚本的 ALLOWED 中加入该文件与理由 ——')
  console.error('      不要为了让检查通过而删掉必要的署名，也不要扩大豁免范围。')
  console.error('')
  for (const hit of hits) console.error('  ' + hit)
  process.exit(1)
}

const exempt = allowedSeen.length === 0 ? '无' : allowedSeen.join('、')
console.log(`✓ 来源卫生检查通过：扫描 ${checked.length} 个文件，豁免 ${allowedSeen.length} 个（${exempt}）。`)
