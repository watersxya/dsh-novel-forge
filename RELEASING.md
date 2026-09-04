# 发布流程 / Release Guide（将 dsh-novel-forge 新版本推送到 GitHub / npm）

> 适用：把 alpha 版小说工坊新版本发布到 GitHub（watersxya/dsh-novel-forge）与 npm（@waterwx/dsh-novel-forge）。
> 版本线：V1.0 RC（1.10.1）为最终稳定版、已停止更新；唯一更新线为 V2.0 ALPHA（当前 **2.0.1-alpha**，修复：skill 注册缺 provider 导致 dsh >= 0.1.3 轮次崩溃）。

---

## 一、前置条件（一次性准备好）

| 项 | 说明 | 验证命令 |
|---|---|---|
| Node >= 24 / pnpm | 构建需要 | node -v / pnpm -v |
| Visual Studio C++ 构建工具 | 原生依赖 fs-ext 需要 MSVC 编译 | where cl（或 vswhere 能找到 VC 工具） |
| npm 登录 | 发布包需属主账号 | npm whoami（应返回 waterwx） |
| git 凭证 | 推送 GitHub 需要 | git credential fill（protocol=https,host=github.com 能返回 password） |
| GitHub 令牌(可选) | 设/改默认分支走 REST API 需要带 repo 管理的 PAT，或用 gh | gh auth status |

---

## 二、发布流程（推荐顺序）

### 1. 改版本号
编辑 package.json 的 version（例：2.0.1-alpha 改为 2.0.2-alpha）。

### 2. 更新 CHANGELOG
在 CHANGELOG.md 顶部加新版本条目（改动 + ALPHA 预发布 + 依赖 DSH >= 0.1.3-alpha.1）。

### 3. 更新 README 版本横幅（如有变化）
README.md 顶部"版本状态"块：若 latest / 分支变化需同步改。

### 4. 重新打包
    cd <repo-root>
    pnpm install            # 首次或依赖变化；需重装时加 --no-frozen-lockfile
    pnpm run build          # 重新生成 lib/index.js + lib/client.js + lib/types

> 确认 lib/ 是当前源码产物（lib/ 跟随仓库分发，npm files 也含 lib）。

### 5. git 提交 + 打 tag
    # 建议在发布分支（master 保持 V1.0 RC 冻结；新版本走 v2.0-alpha）
    git checkout -b v2.0-alpha      # 若不在该分支
    git add -A
    git commit --no-verify -m "v<版本>: <说明>"
    git tag v<版本>                 # 例：v2.0.1-alpha

> 若仓库默认分支就是 v2.0-alpha，直接在其上提交即可。
> 首次提交可用 --no-verify 跳过 lefthook（无 HEAD 时 lefthook 的 git stash create 会卡）。

### 6. 推送到 GitHub
    # 只推新分支 + 本次新 tag；不要用 --tags（会尝试推远端已存在的旧 tag 报 rejected）
    git push origin v2.0-alpha
    git push origin v2.0.1-alpha

### 7. (可选) 把 GitHub 默认分支设为发布分支
方式 A(gh CLI)： gh repo edit watersxya/dsh-novel-forge --default-branch v2.0-alpha

方式 B(GitHub REST API)：需要带 repo 管理的 PAT
    TOKEN=$(printf 'protocol=https
host=github.com

' | git credential fill | sed -n 's/^password=//p')
    curl -sS -X PATCH https://api.github.com/repos/watersxya/dsh-novel-forge       -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json"       -d '{"default_branch":"v2.0-alpha"}'

> 响应含 "default_branch": "v2.0-alpha" 即成功。注意不要打印 $TOKEN。

### 8. 发布到 npm
    # 预发布版本必须带 --tag
    npm publish --tag alpha
    # 方案 A（当前策略）：把 latest 指向这个 alpha，让"自动更新"跟 alpha
    npm dist-tag add @waterwx/dsh-novel-forge@<版本> latest
    npm dist-tag add @waterwx/dsh-novel-forge@<版本> alpha
    # 核对
    npm view @waterwx/dsh-novel-forge dist-tags --registry=https://registry.npmjs.org --json

### 9. 发布后验证
    npm view @waterwx/dsh-novel-forge dist-tags --registry=https://registry.npmjs.org --json
    git ls-remote --tags origin | grep <版本>

---

## 三、需要的 API / 令牌清单

| 用途 | 途径 | 需要什么 |
|---|---|---|
| 推送 git | git credential manager(或 PAT) | HTTPS 凭证，能 git push |
| 设默认分支 | GitHub REST PATCH /repos/{owner}/{repo} | PAT(repo 管理权限) 或 gh auth 登录 |
| 发布 npm 包 | npm publish | npm 登录态(npm whoami = waterwx) |
| 设置 npm dist-tag | npm dist-tag add | 同上 npm 登录态 |
| 查 npm 版本 | npm view(公开只读) | 无需登录 |

> 说明：本机 git credential fill 返回的 password 通常就是可用作 GitHub API 的 PAT(若确有 repo 作用域，即可设默认分支；否则需另配 PAT 或用 gh)。

---

## 四、常用坑 / 注意

- **供应链策略**：重新解析 lockfile 时，若新包发布太近会被 `minimumReleaseAge` 拒，用 `pnpm install --config.minimum-release-age=0 --no-frozen-lockfile`（在 profile 目录执行）绕过。
- 预发布版本 npm publish 必须带 --tag(如 alpha)，否则报：You must specify a tag...
- npm publish --dry-run 可先看包内容(约 153 文件 / 2.1MB，无 *.map)。
- lib/*.map、TODO-续接.md、docs/、backup/ 均已 gitignore，不会入库/入包。
- 首次 git commit 若被 lefthook 卡(需已有 HEAD)用 --no-verify。
- 不要用 git push --tags(会推远端已存在的旧 tag 报 rejected)，只推新分支+新 tag。
- 缺 VS Build Tools 会让 pnpm install 卡在原生 fs-ext；装"使用 C++ 的桌面开发"工作负载。
- **dsh 0.1.3+ 兼容**：运行时 skill `skillsService.register` 必须带 `provider`(必填)，缺省会令 web 轮次读 undefined.length 崩溃（2.0.1-alpha 修复）。
- 本插件仅适配 DSH >= 0.1.3-alpha.1(依赖 DSH 的 cosmokit)；V1.0 RC(1.10.1)已停更，需稳定旧版显式装 @1.10.1。

---

## 五、已用到的完整命令记录（2.0.1-alpha 为例）

- git checkout -b v2.0-alpha && git add -A && git commit --no-verify -m "v2.0.1-alpha: ..."
- git tag v2.0.1-alpha
- git push origin v2.0-alpha v2.0.1-alpha
- PATCH https://api.github.com/repos/watersxya/dsh-novel-forge  body {"default_branch":"v2.0-alpha"}
- npm publish --tag alpha
- npm dist-tag add @waterwx/dsh-novel-forge@2.0.1-alpha latest
- npm dist-tag add @waterwx/dsh-novel-forge@2.0.1-alpha alpha
