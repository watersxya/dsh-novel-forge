## [2.1.2-alpha] - 2026-09-05

### ✏️ 改名

- 用户可见的「自动导演」统一改为「**自动编辑**」（书内导航 / 功能页 / 助手步骤卡 / 工作流待办文案 / README 徽章）。内部路由/类型（`/director`、`runDirectorAdvice`、`DirectorAdvice`）保持不变。

---

## [2.1.1-alpha] - 2026-09-05

### 🧹 类型修复 + CI + 元数据

- 修复若干 `tsc` 类型错误：`AuthorHome` 导航残留 `progress` 判断、`CreateBookView` 题材 `children`、`MarketRadarView` `brief` null 传入、`NovelPanel` `aiPhrases` 可能 undefined、`index.ts` `skillsService` 收窄。
- 新增 **GitHub Actions CI**（`.github/workflows/ci.yml`：typecheck + build + 样式校验 + 单测，pnpm 11），并在 README 加 CI 徽章。
- 新增 `tests/assets.test.ts`（写作资产/内置规则纯逻辑单测）。
- `package.json` 补充 `author` / `keywords`（dsh、dsh-plugin、小说工坊等社区检索词）。

---

## [2.1.0-alpha] - 2026-09-05

### ✨ 新增能力

- **AI 编辑 Agent**：书内助手改名并升级，一句话即可代办——拆书、自动导演、知识库（增/查/列）、剧情线、导演待办、全书质检、简介、章节生成·审稿·修订、大纲·道藏·暗线·资产、导出；工具扩展 + 前端结构化结果卡片。
- **题材雷达 → 灵感**：扫榜（番茄/起点/晋江）→ 题材信号/生产底座/开书简报 → 一键「用这些信号生成灵感」。
- **自动导演**：基于本书分卷/剧情线/伏笔/事实，输出下一阶段节点/节奏板/风险/修复，可一键采纳为剧情线或导演待办。
- **知识库 / RAG**：书内自由参考文档，生成时按章节检索注入。
- **书分析 / 拆书**（输入任意文本 → 卖点/结构/可借鉴/风险）、**创意灵感**（多方向开书，可「以此方向开书」）。
- **进阶工具折叠**：默认只露创作流水线 + 核心（助手/AI进度）+ 资产，进阶工具收进折叠组；创作页新增「问 AI 编辑 Agent」入口。

### 🧭 规则 / 体验升级

- **AI 编辑 Agent 规则**：新增「收敛执行」（每轮只做一件事、做完即停）、收敛「连锁维护」适用范围、写操作关键词放行（`WRITE_TOOL_KEYS`）+ 轮次上限收紧，避免工具循环与乱改。
- **助手体验**：消息区撑满、气泡收窄、结构化结果卡片、去重标题；「AI 助手」改名 **AI 编辑 Agent**。
- **知识库 / 自动导演移入书内**（原本误放作者级跨书页）。
- **改编模式**：P0 候选改为结构化 `{ name, desc }`，前端候选可点选多选一（像灵感一样）。
- **开书向导**：选定大纲候选后，自动把候选题材预填为本书创作资产。

### 📝 其他

- README 补充「最近更新 / What's New」、shields.io 徽章（DSH 版本 / License）、Mermaid 工作流图。

---

## [2.0.1-alpha] - 2026-09-05

### 🐛 修复：skill 注册缺 `provider` 导致 dsh ≥0.1.3 轮次崩溃

- 运行时 skill `novel-forge-chapter-batch` 的 `skillsService.register` 补齐 `provider: 'dsh-novel-forge'`。
- dsh `SkillSummary` 要求 `provider: string`（必填），缺省会令 web 轮次发起时读 `undefined.length` 而失败（headless/旧版不受影响）。
- 同步更新 `skillsService` 类型声明。

---

## [2.0.0-alpha.1] - 2026-09-04

### 🎬 漫剧工作台（V2.0 大改版 · ALPHA 预发布）

- 全流程：创建漫剧方案（风格库/滤镜/题材）→ 一键生成（拆剧情→分镜→提名角色→自动导入分级→视频提示词）→ 分镜工作台（剧情骨架/分镜表/视频提示词）→ 角色定妆（形象锚点/精修提示词/定妆图）→ 场景底图（场景卡/参考图）→ 导出即梦素材包。
- 全流程步骤条（唯一导航），完成度自动判定；每步独立页面，前置不足明确提示、不静默降级。
- 新增模块：`ai-scan.ts`、`PropLibrary.tsx`、`manga-genre-rules.ts`、`novel-context.ts`、`prompt-utils.ts`、`review-policy.ts`，场景/道具库、风格库扩充、即梦化（运镜/时长/定妆绑定/整集画布脚本）。
- **V2.0 ALPHA 仅适用于 DSH ≥ 0.1.3-alpha.1**（依赖 DSH 提供的 `cosmokit`，非纯 Node 独立包）。
- **V1.0 RC（`1.10.1`）为最终稳定版，已停止更新**；需要稳定版请显式安装 `@waterwx/dsh-novel-forge@1.10.1`。

---

## [1.10.1] - 2026-08-31

### 🔒 隐私清理

- 关闭客户端与服务端 sourcemap，构建产物不再泄漏源码与开发机绝对路径。
- 移除发布包中的 `lib/*.map`（sourcemap 含源码与绝对路径）。
- CSS 虚拟模块改用项目相对路径，bundle 不再携带 `D:\…` 绝对路径。
- 仓库移除 `TODO-续接.md` 与 `docs/*.md` 开发笔记（含个人书名/路径），改为 `.gitignore`。

---

## [1.10.0] - 2026-08-31

### 🎬 改编模式（上传全文主线）

- 改编方案可编辑：映射表/规则（保留/允许变/红线）可增删改；保留「仅术语替换」快速路径。
- 提炼新书资料：从源全文 + 编辑后方案提炼改编后总纲/道藏/角色库/大世界/卷计划/章节计划，预览后保存为「待写新书」（chapters=pending）。
- 深度改写（重写引擎）：逐章 LLM 重写 + NDJSON 流式进度 + 「起始～结束章」分段/继续；改写结果可继续提炼新书。

### 🎨 全局资产库 / 作者资产库

- 新增内置「剧情桥段库」（扮猪吃虎/打脸/退婚/拍卖/秘境/误会/绝境翻盘/大比/身份揭露）。
- 内置库与作者库解耦：不再互相复制；内置库只读浏览/套用，作者库只沉淀个人资产。
- 作者库角色默认只收男主/女主（protagonist/female_lead），避免刷屏。

### 🧭 首页

- 「AI 进度」由单页改为可拖动/可缩放悬浮窗（与书内一致），位置/尺寸记忆，任务中呼吸绿点。
- 左下角版本信息可点击打开 GitHub；新增 npm 最新版检测 + 「🔄 一键更新」（下载新版，重启 DSH 生效）。
- 全局库题材卡片样式统一。

### 📌 其他

- README 顶部新增 DSH 版本适配说明（适配官方稳定版 DSH 0.1.1-rc.2，不兼容 Alpha/预览版）。

---

## [1.9.0] - 2026-08-29

### 🧠 模型管理大改版（DSH 风格）

- **模型与推理页重排**：拆成「模型（提供方管理）」「当前写作模型」「推理强度」三张卡片。
- **提供方管理**：提供方卡片列表 + 编辑/删除；「添加提供方」选厂商直填 API Key；「添加自定义提供方」填 Provider ID/API 地址/API 协议/API 密钥/模型 id。
- **动态厂商目录**：厂商下拉直连 DSH 的 pi-ai 可配置提供方（智谱/千问/OpenRouter/OpenAI/…）；模型下拉联动；添加成功后即时刷新可用模型。
- **当前写作模型**：提供商下拉只显示已添加厂商，模型下拉联动具体模型；⚡ 一键测试连通（真实最小调用）。
- **千问（通义）固定路由**：新增 `qwen` 提供方（`https://dashscope.aliyuncs.com/compatible-mode/v1`），附带 qwen-plus/max/turbo/qwen3.7-max 等模型。
- **设置页合并**：「自定义背景」并入「外观与主题」成为独立卡片；「生图模型」补回启用/关闭滑块（与书内设置一致）。
- **顶部容器统一**：设置/改编模式/AI 进度/全局写作资产库等页面顶部标题统一为卡片样式。

### 🔧 其他

- 移除旧的「我的模型快捷切换」模块。
- 完善 `/llm-vendors`、`/llm-models`、`/llm-add`、`/llm-remove`、`/llm-test` 端点。
- 新增调试重启脚本（`scripts/restart-dsh-web.mjs`）。

---
## [1.8.0] - 2026-08-29

### 🚀 稳定版发布（暂关闭改编模式）

- ⚠️ **兼容性（重点）**：本版本**仅适配官方/稳定版 DSH**；**DSH Alpha / 预览版暂不适配**，请务必在稳定版 DSH 上使用。
- 🎨 主题增强：新增「自定义背景」（服务端存盘 + URL 引用，大小不受限）与「玻璃透明度」滑块；新拟态/黏土可调透，透出背景图。
- 🧭 首页重构：作者级左侧导航复用工作区玻璃卡片样式；新增「作者资产库 / 全局写作资产库 / AI 进度 / 设置」。
- 🗂️ 作者资产库/总数据：从书架书与内置全局库批量沉淀；按分类分组。
- ⚙️ 其它：章节导入 txt 编码兜底（GBK/GB18030），配置持久化等改进。

---
## [1.7.3] - 2026-08-25

### 🛠 整体体检与修复

- 修复章节列表潜在崩溃：`NovelPanel.statusBadge` 遇未知 `chapter.status` 返回 `undefined`，补 `default` 错误徽章
- 修复 `/config` 丢字段：`patchConfig` 现在会拷贝 `imageModels`（多生图模型库可持久化）
- 修复运行中换书写错目录：`applyDraft` 改用生产单绑定目录（`bookDir`）
- `open-folder` 改用 `spawn('explorer',[dir])`，规避 Windows cmd 元字符注入
- 构建产物对齐：重跑 `pnpm build`，`lib` 与 `src` 同快照（补 `story-beat-language.d.ts`、`protocol` 用 `EmotionId[]/StoryFunctionId`、清除孤儿 `RoleVisualPanel.d.ts`）
- 发布：`files` 补 `skills/`、去掉从不存在的 `*.d.ts.map`
- 文档：README 更新为“可配置内置生图模型”；CHANGELOG 版本排序修正、移除游离标题
- 测试：新增 smoke 测试（`story-beat-language` / `shot-language`），`pnpm test` 通过
- 可访问性：ShelfView 开书/导入卡、SceneLibrary 场景卡、CreateBookView 大纲拖拽区补 `role/tabIndex/aria-label/键盘`；ImportModal 支持 Esc 关闭（`role=dialog`）
- 健壮性：RunPanel 统计字段改可选链（`run.stats?.x ?? 0`）

---

## [1.7.2] - 2026-08-22

### ✨ 新增「粘土拟态」主题（Claymorphism）