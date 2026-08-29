## [1.8.0] - 2026-08-29

### 🚀 稳定版发布（暂关闭改编模式）

- ⚠️ **兼容性（重点）**：本版本**仅适配官方/稳定版 DSH**；**DSH Alpha / 预览版暂不适配**，请务必在稳定版 DSH 上使用。
- 🔒 「改编模式」已**暂时关闭**：首页不再显示改编模式入口，`/adapt/*` 接口也不开放（由配置 `enableAdaptMode` 控制，默认关闭）。
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