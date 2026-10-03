/**
 * One-shot release script for dsh-novel-forge.
 *
 * "发布新版本" 一键流程（不在执行中追问；遇可见阻塞才停下上报）：
 *   1) 从 CHANGELOG.md 顶部解析目标版本号与变更正文
 *   2) 同步 package.json version
 *   3) typecheck + build + 样式校验（失败即中止）
 *   4) git add + commit + tag
 *   5) push commit + tag -> origin
 *   6) npm publish
 *   7) 创建/更新 GitHub Release（带变更正文）
 *
 * 用法：node scripts/release.mjs [--dry-run]
 */
import fs, { existsSync } from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const cwd = process.cwd()
const pkgPath = path.join(cwd, 'package.json')
const changelogPath = path.join(cwd, 'CHANGELOG.md')
const REPO = 'watersxya/dsh-novel-forge'
const NL = String.fromCharCode(10)
const DRY_RUN = process.argv.includes('--dry-run')

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}
function shLive(cmd) {
  if (DRY_RUN) { console.log('  [dry]', cmd); return }
  execSync(cmd, { cwd, stdio: 'inherit' })
}

/**
 * 断言 lib/types 下没有「源码已不存在」的声明文件。
 *
 * `.d.ts` 的路径与源码一一对应（lib/types/**.d.ts ← src/**.ts|tsx），因此可以据此反查。
 * 这是发布前的最后一道网：这些文件不会被任何人注意到，但会被打进 npm 包。
 * @throws 发现幽灵声明时抛出（中止发布）。
 */
function assertNoStaleDeclarations() {
  const typesDir = path.join(cwd, 'lib', 'types')
  if (!existsSync(typesDir)) return
  const stale = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      if (!entry.name.endsWith('.d.ts')) continue
      const rel = path.relative(typesDir, abs).replace(/\.d\.ts$/, '')
      const candidates = [path.join(cwd, 'src', `${rel}.ts`), path.join(cwd, 'src', `${rel}.tsx`)]
      if (!candidates.some(candidate => existsSync(candidate))) stale.push(`lib/types/${rel}.d.ts`)
    }
  }
  walk(typesDir)
  if (stale.length > 0) {
    console.error('✗ 发现幽灵声明（源码已删除，但 .d.ts 仍在，且会随 files 发布）：')
    for (const s of stale) console.error('  ' + s)
    console.error('  处理：重新执行 `pnpm build`（构建脚本会先清空 lib/types）后重试。')
    process.exit(1)
  }
}

// ---- 1) parse CHANGELOG top entry ----------------------------------------
const changelog = await readFile(changelogPath, 'utf8')
// `m` 是 `^## \[` 需要的，但它同时让 `$` 匹配到**每一行**行尾，于是懒惰的正文捕获
// 会在摘要行就停下 —— 发布正文只剩第一行，条目里的明细全部丢失。`(?![\s\S])` 是
// JS 里"文档绝对末尾"的写法（无 `\z`），用它替代 `$`。
const m = /^## \[(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\] - ([\d-]+)\r?\n\r?\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m.exec(changelog)
if (!m) {
  console.error('✗ 无法从 CHANGELOG.md 顶部解析版本。请在顶部添加 "## [x.y.z[-prerelease]] - date" 条目。')
  process.exit(1)
}
const version = m[1]
// 预发布版本（如 1.1.0-alpha / 1.1.0-beta.1）发布时必须显式指定 dist-tag；
// tag 取预发布标识符（alpha / beta 等），正式版本用 latest。
const npmTag = version.includes('-') ? version.slice(version.indexOf('-') + 1).split('.')[0] : 'latest'
let body = m[3].trim()
body = body.replace(/^-{4,}\s*$/gm, '').trim()
const title = (body.split(NL)[0] || '').replace(/^#+\s*/, '').trim()
console.log(NL + '▶ 目标版本: v' + version)

// ---- 2) sync package.json version ---------------------------------------
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
if (pkg.version !== version) {
  pkg.version = version
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + NL)
  console.log('  · package.json version -> ' + version)
} else {
  console.log('  · package.json version 已是最新 ' + version)
}

// ---- 3) verify + build ---------------------------------------------------
console.log(NL + '▶ 校验与构建')
shLive('pnpm typecheck')
shLive('node scripts/check-theme-sizes.mjs')
shLive('node scripts/check-fallback-tiers.mjs')
// 来源卫生：防止把外部来源的代码/文案带进本产物（细则见 scripts/check-third-party.mjs 头部说明）。
shLive('node scripts/check-third-party.mjs')
// 对比度：无障碍阈值一旦回退很难被肉眼发现，且发布后只能靠新版本修。
// 口径说明见 scripts/audit-contrast.mjs 头部（只审计运行时真正生效的令牌块）。
shLive('node scripts/audit-contrast.mjs')
shLive('pnpm build')
// 测试与 CI 对齐：带着失败用例发布过一次就很难收回（npm 版本号不可复用）。
shLive('pnpm test')
// 幽灵声明：`files` 包含 lib/**/*.d.ts，若 tsc 的旧产物没被清掉，源码已删除的模块
// 会以 .d.ts 形式**发布出去**（实测发生过）。构建脚本已先清 lib/types，这里再验一次。
assertNoStaleDeclarations()
console.log('  · typecheck / check-styles / third-party / contrast / build / test / 声明一致性 全部通过')

// ---- 4) commit + tag -----------------------------------------------------
console.log(NL + '▶ 提交与打 tag')
if (DRY_RUN) console.log('  [dry] git add -A')
else shLive('git add -A')
const commitMsg = 'release: v' + version + ' — ' + title
let alreadyCommitted = false
try { alreadyCommitted = sh('git log -1 --pretty=%s') === commitMsg } catch { /* ignore */ }
if (!alreadyCommitted) {
  if (DRY_RUN) console.log('  [dry] git commit -m ' + commitMsg)
  else sh('git commit -m ' + JSON.stringify(commitMsg))
  console.log('  · commit: ' + commitMsg)
} else {
  console.log('  · 已存在相同提交，跳过')
}
let tagExists = false
try { tagExists = sh('git tag -l v' + version) !== '' } catch { /* ignore */ }
if (!tagExists) {
  if (DRY_RUN) console.log('  [dry] git tag v' + version)
  else sh('git tag v' + version)
  console.log('  · tag: v' + version)
} else {
  console.log('  · tag v' + version + ' 已存在，跳过')
}

// ---- 5) push -------------------------------------------------------------
console.log(NL + '▶ 推送 origin')
if (!DRY_RUN) sh('git push origin HEAD')
if (!tagExists && !DRY_RUN) sh('git push origin v' + version)
console.log('  · push 完成')

// ---- 6) npm publish ------------------------------------------------------
console.log(NL + '▶ npm publish')
  if (DRY_RUN) {
    console.log('  [dry] npm publish --access public --tag ' + npmTag)
  } else {
    try {
      // `--access public` 不是可选项：本包是 scoped 包（@waterwx/…），
      // npm 规定 scoped 包**默认私有**，不带该参数直接发会被拒
      // （402Payment Required）。首版脚本漏了它，直到真要发布才暴露。
      shLive('npm publish --access public --tag ' + npmTag)
    } catch (e) {
    const err = String(e)
    if (/already published|You cannot publish over the previously published version/.test(err)) {
      console.log('  · 该版本已在 npm 上，跳过')
    } else {
      console.error('✗ npm publish 失败（非“已存在”错误），中止。')
      throw e
    }
  }
}
// 本线所有版本都是预发布：npm publish --tag alpha 不会动 latest，裸装
// （npm i @waterwx/dsh-novel-forge，不带标签）就会永远停在首个版本。
// 这里显式把 latest 同步到本次版本；将来若发布正式版，删掉这段即可。
if (!DRY_RUN) {
  try {
    shLive('npm dist-tag add ' + pkg.name + '@' + version + ' latest')
    console.log('  · latest -> ' + version)
  } catch (e) {
    console.error('✗ 同步 latest dist-tag 失败（npm 侧已完成，可稍后手动重试）：' + String(e))
  }
} else {
  console.log('  [dry] npm dist-tag add ' + pkg.name + '@' + version + ' latest')
}

// ---- 7) GitHub release ---------------------------------------------------
console.log(NL + '▶ GitHub Release')
const cred = spawnSync('git', ['credential', 'fill'], {
  input: ['protocol=https', 'host=github.com', '', ''].join(NL),
  encoding: 'utf8',
})
const TOKEN = (cred.stdout || '').split(NL).find(l => l.startsWith('password='))?.slice(9)
if (!TOKEN) {
  console.error('✗ 未取得 GitHub token（git credential fill 未返回 password）。请先在本机完成 GitHub 登录。')
  process.exit(1)
}
if (DRY_RUN) {
  console.log('  [dry] 将创建/更新 release v' + version)
} else {
  await ensureRelease(TOKEN, version, title, body)
  console.log(NL + '✅ release 完成: https://github.com/' + REPO + '/releases/tag/v' + version)
}

async function ensureRelease(token, ver, name, bodyText) {
  const list = await fetchJSON('https://api.github.com/repos/' + REPO + '/releases', token)
  const tag = 'v' + ver
  // 带预发布标识（-alpha / -beta）的版本在 GitHub 上也标成 prerelease。
  const isPrerelease = ver.includes('-')
  const rel = list.find((r) => r.tag_name === tag)
  if (rel) {
    console.log('  · release ' + tag + ' 已存在，更新正文')
    await fetchJSON('https://api.github.com/repos/' + REPO + '/releases/' + rel.id, token, 'PATCH', { body: bodyText, prerelease: isPrerelease })
  } else {
    await fetchJSON('https://api.github.com/repos/' + REPO + '/releases', token, 'POST', { tag_name: tag, name: name, body: bodyText, prerelease: isPrerelease })
    console.log('  · 已创建 release ' + tag)
  }
}

async function fetchJSON(url, token, method = 'GET', payload) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error('GitHub API ' + res.status + ': ' + (data?.message || res.statusText))
  }
  return data
}
