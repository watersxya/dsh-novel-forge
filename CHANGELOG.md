## [1.10.0] - 2026-08-31

### 🎬 改编模式（上传全文主线）

- 改编方案可编辑：映射表/规则（保留/允许变/红线）可增删改；保留「仅术语替换」快速路径。
- 提炼新书资料：从源全文 + 编辑后方案提炼改编后总纲/设定圣经/角色库/大世界/卷计划/章节计划，预览后保存为「待写新书」（chapters=pending）。
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