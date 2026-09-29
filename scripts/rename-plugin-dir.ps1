<#
.SYNOPSIS
  把插件的磁盘目录名从临时命名（novel-forge-alpha）改为正式命名（novel-forge）。

.DESCRIPTION
  背景：`-alpha` 只存在于**磁盘路径**这一层。npm 包名（@waterwx/dsh-novel-forge）、
  profile 的 bundle 条目、cordis.patch.yml 里的行 id 都不含它，所以这是纯粹的目录改名。

  为什么必须停 DSH 再改：
    profile 的 node_modules 里有一个指向本目录的 **junction（Mount Point）**，DSH 启动时
    会解析它。热改名会让 junction 悬空，下一次重启就会以「bundle 解析失败」跳过整个插件 ——
    现象是没有路由、也没有 UI 入口。因此顺序不可省略：停 → 改名 → 改依赖 → 重建 junction → 重启复查。

  脚本各步都做了前置校验，失败即停并给出回滚指引；支持 -WhatIf 预演。

.PARAMETER PackageDir
  当前插件目录（默认为脚本上一级，即仓库根）。

.PARAMETER NewDirName
  目标目录名，最终路径 = PackageDir 的同级目录 + 该名字。

.PARAMETER ProfileDir
  要同步依赖路径的 DSH profile 目录（其 node_modules 下有指向本插件包的 junction）。

.PARAMETER SkipDshCheck
  跳过「DSH 是否在运行」的检查。仅当你确信端口未被占用时使用。

.EXAMPLE
  pwsh -File scripts/rename-plugin-dir.ps1 -WhatIf
  pwsh -File scripts/rename-plugin-dir.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$PackageDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$NewDirName = 'novel-forge',
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\web-alpha'),
  [int]$Port = 3812,
  [switch]$SkipDshCheck
)

$ErrorActionPreference = 'Stop'

# 包名从 package.json 读，不写死：改名只针对目录，包身份必须保持不变。
$pkgJson = Get-Content (Join-Path $PackageDir 'package.json') -Raw | ConvertFrom-Json
$packageName = $pkgJson.name
$newDir = Join-Path (Split-Path $PackageDir -Parent) $NewDirName
$profilePkgPath = Join-Path $ProfileDir 'package.json'
$scopeDir = Join-Path $ProfileDir ('node_modules\' + ($packageName -replace '/.*$', ''))
$junctionPath = Join-Path $ProfileDir ('node_modules\' + $packageName)

function Step([string]$text) { Write-Host "▶ $text" -ForegroundColor Cyan }
function Ok([string]$text) { Write-Host "  ✓ $text" -ForegroundColor Green }
function Warn([string]$text) { Write-Host "  ! $text" -ForegroundColor Yellow }
function Die([string]$text) { Write-Host "  ✗ $text" -ForegroundColor Red; exit 1 }

Write-Host "插件包名 : $packageName"
Write-Host "当前目录 : $PackageDir"
Write-Host "目标目录 : $newDir"
Write-Host "profile  : $ProfileDir"
Write-Host ''

# ---- 1) 前置校验 ---------------------------------------------------------
Step '前置校验'

if (-not (Test-Path $profilePkgPath)) { Die "找不到 profile package.json：$profilePkgPath（用 -ProfileDir 指定）" }
if ((Split-Path $PackageDir -Leaf) -eq $NewDirName) { Ok '目录名已是目标名，无需改名'; $alreadyNamed = $true } else { $alreadyNamed = $false }
if (Test-Path $newDir) { Die "目标已存在：$newDir —— 先人工确认它是不是同一份拷贝，脚本不会覆盖" }

if (-not $SkipDshCheck) {
  $listening = $null
  try { $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch { $listening = $null }
  if ($null -ne $listening) {
    Die "端口 $Port 仍在监听：DSH 还在运行。请先停掉 DSH 再执行本脚本（或确认后用 -SkipDshCheck）。"
  }
  Ok "端口 $Port 未被占用"
}

# junction 的存在与指向都要核实——它才是重启后能不能加载的关键。
$hasJunction = $false
if (Test-Path $junctionPath) {
  $hasJunction = $true
  $target = (Get-Item $junctionPath).Target
  if ($null -eq $target) { $target = (Get-Item $junctionPath -Force).Target }
  Ok "junction 存在：$junctionPath -> $target"
} else {
  Warn "profile 里没有 $packageName 的 junction；本步将新建一个"
}

# profile 依赖是否确实是 link 到当前目录
$profilePkg = Get-Content $profilePkgPath -Raw | ConvertFrom-Json
$dep = $profilePkg.dependencies.$packageName
if ($null -eq $dep) { Die "profile dependencies 里没有 $packageName" }
Ok "profile 依赖：$packageName = $dep"

$expectedLink = 'link:' + ($PackageDir -replace '\\', '/')
if (($dep -replace '\\', '/') -ne $expectedLink) {
  Warn "依赖值与当前目录不一致（期望 $expectedLink）——脚本会按当前目录重写"
}

# ---- 2) 改名 -------------------------------------------------------------
Step "改名目录"
if ($alreadyNamed) {
  Ok '已跳过'
} elseif ($PSCmdlet.ShouldProcess($PackageDir, "重命名为 $NewDirName")) {
  try {
    Rename-Item -LiteralPath $PackageDir -NewName $NewDirName
    Ok "已改名：$newDir"
  } catch {
    Die "改名失败：$($_.Exception.Message)。若提示被占用，请确认 DSH/编辑器/终端未停留在该目录。"
  }
}

# 之后的路径一律基于新位置（保留原参数以防不改名的情形）
$workDir = if ($alreadyNamed) { $PackageDir } else { $newDir }

# ---- 3) 同步 profile 依赖 ------------------------------------------------
Step '同步 profile 依赖路径'
$newLink = 'link:' + ($workDir -replace '\\', '/')
if (($dep -replace '\\', '/') -eq $newLink) {
  Ok "已是 $newLink，跳过"
} elseif ($PSCmdlet.ShouldProcess($profilePkgPath, "设置 $packageName -> $newLink")) {
  # 只改这一条依赖：保留 JSON 其余内容与缩进风格，避免整文件重排。
  $raw = Get-Content $profilePkgPath -Raw
  $escaped = [regex]::Escape($packageName)
  $pattern = '("' + $escaped + '"\s*:\s*")[^"]*(")'
  $updated = [regex]::Replace($raw, $pattern, ('$1' + $newLink.Replace('$', '$$') + '$2'), 1)
  if ($updated -eq $raw) { Die "未能在 profile package.json 中定位 $packageName 的依赖行" }
  Set-Content -LiteralPath $profilePkgPath -Value $updated -NoNewline
  Ok "已写入 $newLink"
}

# ---- 4) 重建 junction ----------------------------------------------------
Step '重建 profile 内的 junction'
if (-not (Test-Path $scopeDir)) {
  if ($PSCmdlet.ShouldProcess($scopeDir, '创建作用域目录')) { New-Item -ItemType Directory -Path $scopeDir -Force | Out-Null; Ok "已建 $scopeDir" }
}
if ($hasJunction) {
  if ($PSCmdlet.ShouldProcess($junctionPath, '删除旧 junction')) {
    # 只删链接本身：junction 是目录型链接，用 Remove-Item 不会删除目标内容。
    (Get-Item $junctionPath -Force).Delete()
    Ok '已移除旧 junction'
  }
}
if ($PSCmdlet.ShouldProcess($junctionPath, "创建 junction -> $workDir")) {
  New-Item -ItemType Junction -Path $junctionPath -Target $workDir | Out-Null
  $verify = (Get-Item $junctionPath -Force).Target
  Ok "junction 已重建 -> $verify"
}

# ---- 5) 收尾提示 ---------------------------------------------------------
Step '完成'
Write-Host ''
Write-Host '接下来必须做（否则新路径不会生效）：' -ForegroundColor Yellow
Write-Host "  1. 重启 DSH（profile: $(Split-Path $ProfileDir -Leaf)，端口 $Port）"
Write-Host '  2. 复查三项：'
Write-Host '       · 启动日志里没有 "skipping profile bundle"'
Write-Host '       · 小说工坊 UI 入口在'
Write-Host "       · GET /api/dsh-novel-forge/status 返回 200"
Write-Host ''
Write-Host '若启动后插件消失，回滚只需两步：' -ForegroundColor Yellow
Write-Host "  1. 把目录改回原名：Rename-Item -LiteralPath '$workDir' -NewName '$(Split-Path $PackageDir -Leaf)'"
Write-Host "  2. 把 profile 依赖改回 '$expectedLink'，并重建 junction 指向改回后的目录"
