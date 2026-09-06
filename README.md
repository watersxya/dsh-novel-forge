# dsh-novel-forge — AI 编译小说工作台 / AI Novel Writing Workbench

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.0.0--alpha-blue" />
  <img alt="DSH" src="https://img.shields.io/badge/DSH-%E2%89%A50.1.3--alpha.1-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
  <a href="https://github.com/watersxya/dsh-novel-forge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/watersxya/dsh-novel-forge/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
</p>

<p align="center">
  <img alt="纯文本小说" src="https://img.shields.io/badge/%E5%88%9B%E4%BD%9C%E5%B7%A5%E4%BD%9C%E6%B5%81-%E2%9C%93-blue" />
  <img alt="AI 编辑 Agent" src="https://img.shields.io/badge/AI%20%E7%BC%96%E8%BE%91%20Agent-%E2%9C%93-blue" />
  <img alt="自动编辑" src="https://img.shields.io/badge/%E8%87%AA%E5%8A%A8%E7%BC%96%E8%BE%91-%E2%9C%93-blue" />
  <img alt="知识库 RAG" src="https://img.shields.io/badge/%E7%9F%A5%E8%AF%86%E5%BA%93%20RAG-%E2%9C%93-blue" />
  <img alt="题材雷达→灵感" src="https://img.shields.io/badge/%E9%A2%98%E6%9D%90%E9%9B%B7%E8%BE%BE%E2%86%92%E7%81%B5%E6%84%9F-%E2%9C%93-blue" />
  <img alt="生产单" src="https://img.shields.io/badge/%E7%94%9F%E4%BA%A7%E5%8D%95-%E2%9C%93-blue" />
  <img alt="三套主题" src="https://img.shields.io/badge/%E4%B8%89%E5%A5%97%E4%B8%BB%E9%A2%98-%E2%9C%93-blue" />
  <img alt="全本导出" src="https://img.shields.io/badge/%E5%85%A8%E6%9C%AC%E5%AF%BC%E5%87%BA-%E2%9C%93-blue" />
</p>

你的专属 AI 小说写作插件：把一份大纲"编译"成一本完整的小说。

**版本：`1.0.0-alpha`** · 定位：**纯文本小说创作**。所有环节（写作、设定、规划、审校、质检、导出）均在侧边栏「小说工坊」面板内完成；不包含漫画/分镜/视频或图片生成能力。

---

## 功能一览 / Features

| 中文 | English |
|---|---|
| **创作工作流仪表盘**：主行动卡（推荐下一步）+ 创作旅程进度条 + 状态条 + 待办队列 + 资产健康 | **Workflow dashboard**: next-action hero card, journey progress bar, status strip, todo queue, asset health |
| **书架首页 + 开书向导**：书卡网格（封面/简介/进度），新建书一步导入大纲（docx / 粘贴），书名自动识别；另支持「想法 → AI 大纲」多方案 | **Bookshelf home + book wizard**: book card grid, one-step outline import, auto book-name; idea → AI outline suggestions |
| **开书即立项**：导入大纲自动建项目，书名以大纲首行为准；纳入书架并激活 | **Open-to-project**: outline import builds the project, registers on the shelf and activates it |
| **国风模块**：总纲 / 道藏 / 大世界 / 人物志 / 暗线 / 编年录 / 文戒 / 笔法帖 / 心法 | **Wuxia-flavored modules**: outline, story bible, world, characters, foreshadows, fact ledger, anti-AI rules, style templates, custom style |
| **道藏提炼**：从大纲与已写章节提炼人设 / 世界观 / 金手指规则 / 写作红线，注入生成与审稿 | **Story bible**: extract personas / world rules / golden-finger rules / red lines from the outline & chapters |
| **大世界**：境界体系 / 区域 / 势力结构化编辑 + AI 提炼，注入每章生成与审稿 | **World**: realms / regions / factions structured editing + AI extraction, injected per chapter |
| **卷计划 / 章节计划（结构化）**：每章含 本章目标 / 剧情要点 / 爽点·钩子 / 结尾钩子；**续写模式**自动读上一章结尾 + 编年录锚点 + 已发生情节禁令，不重头生成，重复标题自动去重 | **Volume / chapter planning (structured)**: goal / plot points / payoff-hook / ending hook per chapter; continuation mode reads the previous ending + fact anchors + banned-repeat list, never restarts |
| **逐章编译**：调用 LLM 生成 3000–4000 字正文并保存为 Markdown，流式输出实时进度 | **Chapter-by-chapter compile**: LLM writes 3000–4000-char bodies to Markdown with live stream |
| **摘要 + 编年录事实库**：每章自动抽取剧情摘要与已确立事实（人物状态/资源/关系/线索落地），注入后续章节，保证长期一致 | **Summary + fact ledger**: per-chapter auto-summary & extracted facts injected into later chapters for consistency |
| **相关事实全量检索**：生成时按本章剧情要点对全量编年录检索（角色名加权 + 近因加权 + 去重），旧设定不因窗口滑出而丢失 | **Full-ledger fact retrieval**: chapter-plot-based retrieval across the whole chronicle (character + recency weighting, dedup) |
| **自动 AI 审稿**：人设 / 设定 / 红线 / 文笔 / 节奏·爽点 / 逻辑 / 反 AI / 呈现 / 合规 九维打分，输出可勾选问题清单与建议 | **AI review**: 9-dimension scoring with a checkable issue list and suggestions |
| **修订循环**：审稿未过 → 按意见一键修订 / 选中局部改 / 去 AI 味润色 → 重审；「✔ 直接通过」行使作者终审权；未过章节自动按意见修订 + 验证模式 | **Revise loop**: revise by review / targeted local edits / de-AI polish → re-review; or approve directly |
| **审稿问题勾选修复**：每条问题可勾选（high 默认选），一键按所选问题修订 | **Selective review fixes**: check any issues (high pre-checked) and fix in one click |
| **作者复盘**：每章结构复盘（钩子兑现 / 结尾钩子 / 剧情线推进 / 连续性 / 节奏趋势），按卷分组，自动关联推进的剧情线 | **Author review**: per-chapter structural review (hook payoff / ending hook / arc progress / continuity / pacing), grouped by volume |
| **剧情线与神秘线管理**：主线 / 支线 / 人物线 / 悬念线，目标与进度追踪、章节关联；生成强制至少推进一条活跃线；健康检查 + AI 剧情方案 | **Plotlines**: main / branch / character / mystery arcs with goals, progress & linked chapters; generation must advance a line; health check + AI plan |
| **角色库（纯文本）**：AI 从全书提炼角色并自动分级（主角/女主/女配/配角/反派/路人），候选逐条采纳；定位 / 关系网 / 成长线 / 知情度编辑；**角色知情度**严格维护信息差 | **Role library (text)**: AI extraction with auto-tiering, adopt per candidate; edit identity / relations / arc / knowledge; strict information asymmetry |
| **人物志持久化**：角色当前状态（编年录聚合结果）落盘，打开即显示，可一键回填历史章节 | **Persistent character status**: aggregated status saved to disk, shown on open, backfill old chapters |
| **全书一致性质检**：LLM 扫描全本输出矛盾清单（定位到章），一键去修订 | **Book audit**: LLM scans all chapters for contradictions, locates them, one-click to revise |
| **敏感词检查**：内置违禁词库（政治/擦边/暴力/辱骂/广告/其他）全书一键扫描，命中定位到章并一键去修订 | **Sensitive-word check**: built-in banned-word library, scanned across the book, located per chapter with one-click fix |
| **知识库 / RAG**：书内自由参考文档，生成时按章节检索注入 | **Knowledge base / RAG**: in-book reference docs, retrieved & injected per chapter |
| **AI 编辑 Agent**：一句话代办——拆书、自动编辑、知识库（增/查/列）、剧情线、编辑待办、全书质检、简介、章节生成/审稿/修订、大纲/道藏/暗线/资产、导出；写操作有守卫 + 收敛规则 | **AI Editor Agent**: one line to delegate teardown / director / KB / plotlines / todos / audit / blurb / chapter ops / outline / bible / foreshadow / assets / export; write-guard + convergence |
| **题材雷达 → 灵感**：扫榜（番茄/起点/晋江）→ 题材信号 / 生产底座 / 开书简报 → 一键生成贴合市场的开书灵感 | **Market radar → inspiration**: scan public leaderboards → signals / production foundation / creative brief → generate market-fit book ideas |
| **自动编辑**：基于本书分卷/剧情线/伏笔/事实给出下一阶段节点、节奏板、风险与修复，可一键采纳为剧情线或待办 | **Auto-director**: next-arc nodes, pacing board, risks & fixes, adoptable into plotlines or todos |
| **书分析 / 拆书**：输入任意文本 → 卖点 / 结构 / 可借鉴 / 风险 | **Book analysis / teardown**: paste text → selling points / structure / lessons / risks |
| **创意灵感**：一句话/题材 → 多个差异化开书灵感，可「以此方向开书」 | **Creative inspiration**: one idea/genre → several differentiated book ideas, "start a book this way" |
| **生产单（批量连写）**：区间/新增 N 章一键下单，计划补足 + 逐章生成 + 被拒分级处理（豁免/修订+验证/待人工），支持暂停/继续/停止与断点续跑 | **Production run (batch)**: line up a range, auto-plan, generate chapter-by-chapter, tiered declined handling, pause/resume/stop & resume |
| **改编模式**：上传全文 → 设定卡片/可改范围 → 确认改编维度 → 生成映射表/规则/影响清单 → 替换/重写 → 保存为新书（原书保留） | **Adaptation mode**: upload full text → setting cards / mutability → confirm dimensions → mappings / rules / impacts → replace or rewrite → save as a new book |
| **全本导出**：TXT / MD（含卷首语与封面） | **Full-book export**: TXT / MD (with blurb & cover) |
| **并发安全保存**：计划/生成/审稿落盘前自动合并磁盘最新设定（道藏/角色库/剧情线/知情度） | **Concurrency-safe saves**: merge latest on-disk settings before save |
| **三套主题 + 玻璃 UI**：iOS 液态玻璃（绿）/ 经典毛玻璃（蓝）/ 新拟物双阴影，即时切换；分组导航 + 实时状态角标 | **Themes + frosted UI**: iOS liquid glass / classic frosted / neumorphism, grouped nav with live badges |
| **活动输出控制台**：实时记录生成/审稿/润色/质检等全部活动，自动滚动 + 一键清空 | **Activity console**: records every action, auto-scrolls, one-click clear |

---

## 工作流程 / Workflow

一条主线：**开书 → 立设定 → 排章节 → 逐章编译 → 质检定稿 → 导出**。所有步骤都在侧边栏「小说工坊」面板内完成。

```
① 开书（书架 → 开书向导：粘贴大纲文本 / 导入 docx，书名自动识别）
   ↓
② 立设定（总纲只读 → ✨ 提炼道藏【人设/世界观/金手指规则/写作红线】→ 大世界【境界/区域/势力】→ 写作资产【题材/推进/笔法帖/文戒/心法】）
   ↓
③ 排章节（卷计划 → 章节计划：AI 按大纲生成每章 目标/剧情要点/爽点钩子/结尾钩子；
            已有章节时自动进入「续写模式」——读取上一章结尾原文 + 编年录锚点，不会重头生成）
   ↓
④ 逐章编译（生成正文 3000-4000 字 → 自动抽取摘要 + 编年录事实 → 自动 AI 审稿打分 → 作者复盘）
   ↓
⑤ 修订循环（审稿未过 → 按意见一键修订 / 工作区选中局部修改 / 润色去 AI 味 → 重审；
            不满意可「✔ 直接通过」行使作者终审权）
   ↓
⑥ 全书定稿（全书质检【矛盾清单】→ 敏感词扫描 → 编年录/剧情线/角色库/复盘定期维护）
   ↓
⑦ 导出（全本 TXT / MD，含卷首语与封面）
```

**辅助旁路（任意阶段可用）**：💬 AI 编辑 Agent（拆书/自动编辑/知识库/质检/简介/待办）、🧵 剧情线管理（健康检查/设计剧情方案）、👥 角色库（AI 提炼/知情度维护）、📊 工作进度悬浮窗（任务实时进度与活动记录）、书架多书切换。

**推荐节奏**：先让 ②③ 完整落地（设定越全，章节质量越高）；④ 建议逐章或小批生成，便于在 ⑤ 及时修正；长篇小说每写 20-30 章跑一次 ⑥ 全书质检，防止设定漂移。

---

## 安装 / Installation

```sh
pnpm install        # 安装依赖 / install dependencies
pnpm build          # 重新构建 lib/ / rebuild lib/
```

挂载到 dsh web profile / Mount into the dsh web profile:

```sh
dsh plugin --profile web add link:"<此目录绝对路径>"
```

或 / or in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: novel-forge
      name: '@waterwx/dsh-novel-forge'
```

重启 dsh web 后，侧边栏出现「小说工坊」。

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @waterwx/dsh-novel-forge
```

npm 分发的是预构建产物，无需任何构建授权。
从 GitHub 安装需为 git 依赖的 `prepare` 构建授权（`pnpm-workspace.yaml` 的 `allowBuilds`）。

---

## 数据位置 / Data Locations

- 书架 / Bookshelf：`~/.dsh/dsh-novel-forge-bookshelf.json`
- 作者资产库 / Author assets：`~/.dsh/dsh-novel-forge-author-assets.json`
- 全局写作资产 / Global assets：`~/.dsh/novel-forge-global-assets.json`
- 每本书一个输出目录（含 `novel-project.json` + 各章 Markdown + 润色备份 `.bak.md`）
- AI 编辑 Agent 对话记录：`<输出目录>/novel-assistant.jsonl`
- 生产单状态：`<输出目录>/run-state.json`
- 设置：`~/.dsh/settings.yaml` 的 `dsh-novel-forge` 段；界面偏好（主题/字号/面板宽度）在浏览器 localStorage

---

## 影响与限制 / Impact & Limitations

- **LLM 额度消耗**：生成/审稿/润色/质检/提炼/复盘等所有 AI 操作都调用 LLM（默认 `deepseek-official / deepseek-v4-flash`）。参考：一章 3000-4000 字正文 ≈ 1-2 万 token（含推理）；审稿约 2000-3000 token；全书质检与角色提炼更贵（数万 token）。建议分小批执行。
- **写操作守卫**：AI 编辑 Agent 只在作者**明确要求**时执行写操作（生成/修订/删除章节、改设定等）；只提问不会误触发。
- **并发安全**：计划/生成/审稿落盘前会自动合并磁盘上的最新设定（道藏/角色库/剧情线/知情度），多窗口同时操作互不覆盖。
- **纯文本定位**：本插件不负责图片/视频生成；设定均为文字数据（角色卡仅含定位/性格/目标/关系/成长线/知情度等字段）。
- **章节质量**取决于大纲完整度；批量生成串行执行。
- **数据落盘**：每本书一个输出目录（默认 `~/.dsh/novels/<书名>`，可在设置页修改）；正文为 Markdown、项目状态为 `novel-project.json`。

---

## 目录结构 / Directory Layout

```
src/            插件源码（宿主半 + 浏览器半）
lib/            构建产物（lib/index.js 宿主 / lib/client.js 浏览器）
scripts/        工具脚本
package.json    包定义（dsh.bundle.patch + dsh.client 声明）
cordis.patch.yml  profile 挂载补丁
tsdown.config.ts  双面打包配置
```

---

## English

# AI Novel Forge

An AI novel-writing plugin for DeepSeek Harness (DSH). Feed it an outline (docx or pasted text) and it compiles it into a complete novel: open a book → build the setting → plan chapters → compile chapter by chapter → audit & finalize → export.

**Version `1.0.0-alpha` · Scope: pure-text novel writing.** Everything (writing, setting, planning, review, audit, export) happens inside the "Novel Forge" sidebar panel; no comic/storyboard/video or image generation.

## Main pipeline

1. **Open a book** (bookshelf → wizard): paste an outline or import docx; book name auto-detected; idea → AI outline supported.
2. **Build the setting** (read-only outline → extract story bible [personas / world rules / golden-finger rules / red lines] → world [realms / regions / factions] → writing assets [genre / progression / style templates / anti-AI rules / custom style]).
3. **Plan chapters** (volume plan → structured chapter plan with goal / plot points / payoff-hook / ending hook; continuation mode with existing chapters never restarts).
4. **Compile chapter by chapter** (generate 3000–4000 chars → auto summary + fact ledger → AI review → author review).
5. **Revise loop** (revise by review / targeted edits / de-AI polish → re-review; or approve directly).
6. **Finalize** (book audit for contradictions → sensitive-word scan → maintain chronicle / plotlines / roles / reviews).
7. **Export** (full book TXT / MD, with blurb & cover).

## Highlights

- **Story bible & world**: personas / world rules / golden-finger rules / red lines; realms / regions / factions.
- **Fact ledger (chronicle)**: per-chapter extracted facts injected into later chapters; full-ledger retrieval relevance for long serials.
- **Structured chapter plans + continuation planning**.
- **AI review** (9 dimensions) + one-click revise / local edits / de-AI polish; selective issue fixes.
- **Plotlines** (main / branch / character / mystery) with health check & AI plan; **role library** (text) with knowledge asymmetry; **persistent character status**.
- **Book audit** (contradiction list), **sensitive-word check**, **knowledge base / RAG**.
- **AI Editor Agent** with write-guard + convergence.
- **Market radar → inspiration**, **auto-director**, **book analysis / teardown**, **creative inspiration**.
- **Production run** (batch, resume).
- **Adaptation mode** (upload a full text, remap/rewrite, save as a new book).
- **Full-book export** TXT / MD.

## Install

```sh
dsh plugin --profile web add @waterwx/dsh-novel-forge
```
or link a local checkout and restart dsh web; the "Novel Forge" entry appears in the sidebar.

## Data

- Bookshelf: `~/.dsh/dsh-novel-forge-bookshelf.json`
- Per book: an output directory with `novel-project.json`, chapter Markdown, `.bak.md` backups, `novel-assistant.jsonl`
- Settings: `dsh-novel-forge` section of `~/.dsh/settings.yaml`

## Limitations

- All AI operations consume LLM quota (default `deepseek-official / deepseek-v4-flash`).
- Chapter quality depends on outline completeness; batch generation is serial.
- The plugin writes text only — no image/video generation.
