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
import fs from 'node:fs'
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

// ---- 1) parse CHANGELOG top entry ----------------------------------------
const changelog = await readFile(changelogPath, 'utf8')
const m = /^## \[(\d+\.\d+\.\d+)\] - ([\d-]+)\r?\n\r?\n([\s\S]*?)(?=^## \[|$)/m.exec(changelog)
if (!m) {
  console.error('✗ 无法从 CHANGELOG.md 顶部解析版本。请在顶部添加 "## [x.y.z] - date" 条目。')
  process.exit(1)
}
const version = m[1]
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
shLive('pnpm build')
console.log('  · typecheck / check-styles / build 全部通过')

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
  console.log('  [dry] npm publish')
} else {
  try {
    shLive('npm publish')
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
  const rel = list.find((r) => r.tag_name === tag)
  if (rel) {
    console.log('  · release ' + tag + ' 已存在，更新正文')
    await fetchJSON('https://api.github.com/repos/' + REPO + '/releases/' + rel.id, token, 'PATCH', { body: bodyText })
  } else {
    await fetchJSON('https://api.github.com/repos/' + REPO + '/releases', token, 'POST', { tag_name: tag, name: name, body: bodyText })
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
