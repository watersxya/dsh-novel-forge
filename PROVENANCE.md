# 借鉴与抄袭的边界：来源审计

本文记录本项目从外部项目**借鉴做法**时的边界与取证，供日后复核。

> **为什么这份文档在仓库根、而不在源码里**
> 本仓库有一条发布门禁 `scripts/check-third-party.mjs`：`src/`、`tests/`、`scripts/`、`README.md`、
> `CHANGELOG.md` 等**随包分发**的内容里，不得出现任何外部项目名、组织名或来源标注措辞，
> 也不得出现不相容的许可证标记。**代码里只留本插件自己的表述**；而"我们参考过什么、边界在哪"
> 这类取证必须留档，所以集中放在本文件——它不在门禁清单内，是刻意安排，不是漏网。
> 因此：**不要把本文件的内容抄进源码注释**，那会让门禁失败，也会把出处混进发行物。

审计对象：[ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant)（`Biz Novel Studio`，许可 **AGPL-3.0-only**）。
本项目许可：**Apache-2.0**（见 `LICENSE`）。

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
