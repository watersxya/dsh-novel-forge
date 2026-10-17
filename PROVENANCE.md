# 借鉴与抄袭的边界：来源审计

本文记录本项目从外部项目**借鉴做法**时的边界与取证，供日后复核。

> **为什么这份文档在仓库根、而不在源码里**
> 本仓库有一条发布门禁 `scripts/check-third-party.mjs`：`src/`、`tests/`、`scripts/`、`README.md`、
> `CHANGELOG.md` 等**随包分发**的内容里，不得出现任何外部项目名、组织名或来源标注措辞，
> 也不得出现不相容的许可证标记。**代码里只留本插件自己的表述**；而"我们参考过什么、边界在哪"
> 这类取证必须留档，所以集中放在本文件——它不在门禁清单内，是刻意安排，不是漏网。
> 因此：**不要把本文件的内容抄进源码注释**，那会让门禁失败，也会把出处混进发行物。

审计对象：[ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant)（`Biz Novel Studio`，许可 **AGPL-3.0-only**）。
本项目许可：**AGPL-3.0-only**（见 `LICENSE`，2026-10-17 由 Apache-2.0 切换，决策记录见文末「许可证变更决策」一节）。

## 结论

**存在且仅存在过一处"贴合对方 API 形状"的写法，已重写；其余为独立实现。**

AGPL 是传染性许可，因此本项目**不得包含该项目的代码**。本轮只借鉴其**已公开的做法与文档**，并且：

- 约束类事实（模型参数约束）取自**厂商官方文档**，不是该仓库；
- 业务命名沿用**本项目既有命名**（`MarketRadar*` 系列早于本轮存在，见下）；
- 未复制其任何源文件、注释、测试或数据。

## 已发现问题并修正：雷达界面状态函数

初次实现时，`src/client/panel/market-radar-state.ts` 导出的两个函数与对方 `shared/types/marketRadar.ts` 中的
`resolveMarketRadarAnalysisAvailability` / `shouldResetMarketRadarSignalSelection`
**函数名近乎同名、入参字段同名、语义一致**。

即使逻辑仅一行、不受版权保护，**贴合对方 API 形状本身即不可接受**——那也是"抄"的样子。已按下述方式重写：

| 维度 | 重写前 | 重写后 |
|---|---|---|
| 函数名 | `resolveMarketRadarAvailability` / `shouldResetSignalSelection` | `radarControls` / `isDifferentReport` |
| 入参 | `selectedCount` / `previousReportId`, `nextReportId` | `pickedCount` / `selectionBasis`, `incoming` |
| 返回 | `{ canAnalyze, selectionEnabled, action }` | `{ canScan, canSelectCandidates, canAnalyze, analyzeLabel }` |

并且把需求改写成**独立表述的验收条件**（R1-R4，写在 `market-radar-state.ts` 文件头），测试直接断言这些条件而不是对方的结构。

## 未构成抄袭的三项及其依据

### 1. 结构化输出预算按规模推算（`src/output-budget.ts`）

- 对方：`resolveVolumeStrategyOutputTokenBudget(expectedVolumeCount)`，单一函数、仅用于卷战略，常量 `1800 / 1200 / 160 / 5200`。
- 本项目：`resolveOutputBudget(kind, scope)`，按 5 种任务类型查询 `SPECS` 表；**常量按本插件真实字段体积折算**（单章 ≈350 token），与对方数值不同。
- **区间夹逼**（`min(ceiling, max(floor, x))`）是通用算术写法，不构成表达抄袭。
- 对方文档中"不要用 JSON repair 补被截断的结构"这一**结论**被采纳为纪律，属事实性观点，未复制其文字。

### 2. 模型参数能力兼容层（`src/model-capability.ts`）

- 对方：`getModelParameterCompatibility` / `resolveModelTemperature`，`fixedTemperature` + `minimum/maximumTemperature`。
- 本项目：`resolveModelCapability` / `convergeRequestParams`，额外含 `supportsReasoning`、`reasoningControl`、`reasoningForcedOff`、`adjustments`、`source` 字段。
- **约束事实来源是厂商官方文档**（`https://platform.kimi.com/docs/api/models-overview.md`），已在规则的 `source` 字段写明。核对过程中还发现对方对该厂商的规则**不准确**（详见 CHANGELOG），本项目按官方文档自行推导。
- "按模型身份而非 provider 判断"这一**教训**被采纳，属工程经验，未复制其实现。

### 3. 雷达分析产物复用（`src/client/panel/` 与 `reportId`）

- 需求（连续分析不同作品、勾选不被重渲染冲掉）是**从对方发布说明中获知的行为要求**，实现为本项目自行设计。
- 服务端 `MarketRadarResult.reportId` 为本项目自定义字段。

## 第二轮参考：提示词前缀分层（2026-10-17）

调研对方服务端提示词框架后的落地。**只采纳「按变化频率分层、稳定内容前置」这一工程结论**，
实现、命名、文案全部自拟。

| 维度 | 对方 | 本项目 |
|---|---|---|
| 分层模型 | 块带 `book`/`volume`/`request` 三档复用范围 | `PromptLayer = fixed/book/chapter`（固定/本书/本章），常量表写死顺序 |
| 排序 | 渲染时按范围过滤重排 | `assemblePromptBlocks`：分层排序 + 同层稳定排序 + 空块丢弃 |
| 边界声明 | 资产级声明缓存边界并对齐最终消息数组 | 无对应物——本项目不接厂商缓存 API，排序纪律即全部手段 |
| 局部修文 | 修复指令块移到正文之后 | 同一结论已在改法里（指令在 user 侧，system 侧只保分层） |

- 落地文件：`src/prompt-cache.ts`（新模块）+ `src/engine.ts` 五个组装点重排
  （正文生成/审稿/润色/局部修订/整章重写链路）。**块内文案逐字未动，纯位置变更**；
  对方文件中的任何符号名未在本仓库出现。
- 顺带把缓存用量接入实况账本与面板汇总（`llm-live.ts` / `protocol.ts` / `LiveFeedLog.tsx`），
  展示口径自拟：命中属于输入的一部分、不额外相加、不承诺比例。
- 对方文档中「复用范围不是快照缓存，每次仍读最新内容」「字符前缀测试不能证明厂商命中」
  两句**结论**被采纳为模块注释里的实话声明，属工程观点，未复制其文字。

### 本轮踩到自己的门禁（留档）

`.workbuddy/memory/2026-10-17.md` 初稿带有对方项目名与许可证字样，被
`scripts/check-third-party.mjs` 拦下——该门禁扫描范围含 `.workbuddy/`（不在 SKIP_DIRS）。
处置：记忆日志改为通用表述，来源登记集中到本文件。教训：**工作笔记里也别写外部项目名**，
门禁不管你是不是在「随便记记」。

## 命名重叠的取证

对方三个相关源文件中的 53 个标识符已对全仓（100 个 `.ts/.tsx/.mjs` 文件）做过文本检索。剩余重叠项及说明：

| 标识符 | 位置 | 说明 |
|---|---|---|
| `MarketRadarSignal` / `MarketCreativeBrief` / `MarketRadarPlatform` / `MarketRadarListSource` | `src/protocol.ts`、`src/market-radar-*.ts`、`src/client/` | **本轮之前即存在**：`git log` 显示 `src/market-radar-sources.ts` 最近一次改动为 9 月 15 日，非本轮引入 |
| `profile` / `satisfies` | 全仓 | 通用词 / TS 关键字 |

**本轮唯一引入的重名 `normalizeModel` / `normalizedModel` 已重命名为 `canonicalModelId` / `canonical`。**

复核方式见 `docs/`外的一次性脚本思路：拉取对方三个源文件的导出名与常量名，在全仓检索。该脚本为临时诊断工具，未入库。

## 顺带说明：两者不是同类产品

该仓库是 Electron 桌面版 + Web 的 monorepo（Express / Prisma / SQLite / Qdrant / LangGraph），
本项目是 DSH 插件（无独立数据库、文件制索引）。**形态不同**，因此本轮未尝试移植其架构或依赖。

功能上两者大面积重叠（市场雷达、自动导演、写法引擎/反 AI、拆书、世界手册、章节执行/审核/修复、
状态回灌/伏笔、张力节奏、模型路由）——这些能力本项目此前已具备，本轮**未新增功能**，只改进工程做法。

## 许可证变更决策（2026-10-17）

**Apache-2.0 → AGPL-3.0-only**，自 2.4.0 起生效。2.3.0 及更早版本仍为 Apache-2.0（版本边界同时写在
`CHANGELOG.md` 的 2.4.0 条目内，随包分发）。

### 换证理由

1. **对等性**：本项目作为 DSH（DeepSeek Harness）社区插件发布与流传，AGPL-3.0-only 保证任何再分发者
   （含把插件改头换面放进自己产品的人）必须同样开源，与插件「寄生宿主运行」的形态匹配。
2. **生态惯例**：对 npm 上全部 DSH 插件做过分页普查（35 页 5250 个去重条目，并对 tarball 抽验了真实
   LICENSE 文件），AGPL 家族 38 个（约 0.72%），是生态内成熟实践而非孤例。
3. **不损既有用户**：本插件是作者自用的本地工具链，向来随源码分发；换证不影响「自己跑」这一核心场景。

### 兼容性审计（直接依赖，24 个）

MIT ×19 / ISC ×1 / Apache-2.0 ×1 / MPL-2.0 ×1——与 AGPL-3.0 组合分发全部兼容。
无 Copyleft 直接依赖；间接依赖见 npm 依赖树，按同许可证条款分发即可。

### 发布门禁的同步收窄（留档）

`scripts/check-third-party.mjs` 原有一条规则：随包分发内容出现 `\bAGPL\b`（不分大小写）一律拦截
——本意是拦「外部不相容许可证标记」，换证后会误伤本项目自己的许可证指纹。
处置**不是**加豁免名单，而是把规则收窄为：

- 出现 `AGPL-3.0-only` / `AGPL_3.0_only` / `AGPL-3.0_only` 形式 → 放行（本项目自身许可证指纹）；
- 裸 `AGPL`（无版本、无 `-only` 后缀）→ 仍拦截。

判别力没有塌：真正要拦的「含糊引用外部 AGPL 项目」依然是裸词形式。测试（`tests/repo-hygiene.test.ts`）
同步镜像该规则并配了双向用例（4 放行 / 3 拦截 / 1 跨规则测试）。
另注意：本门禁的扫描范围含 `.workbuddy/`，**工作笔记里写本许可证也必须用完整形式**，否则日志本身会被拦。

### 署名补全（`NOTICE`）

换证同时补齐了第三方署名：lucide-react（ISC，Copyright (c) 2026 Lucide Icons and Contributors）、
fflate（MIT，Copyright (c) 2026 Arjun Barrett）为打包进发行物的运行时依赖；
schemastery（MIT）为安装期依赖，其包内无 LICENSE 文件，NOTICE 中只写可查的 author 字段、不编年份。
