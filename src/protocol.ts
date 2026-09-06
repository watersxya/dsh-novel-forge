/**
 * dsh-novel-forge — shared protocol between the host half (Node) and the
 * browser half (web GUI). Route paths, request/response shapes, the project
 * state file format, and the NDJSON generation stream frames all live here so
 * both halves spell exactly one vocabulary.
 */

/** The /api/dsh-novel-forge route family (same-origin, loopback-fenced). */
export const NOVEL_API = {
  status: '/api/dsh-novel-forge/status',
  loadOutline: '/api/dsh-novel-forge/load-outline',
  saveOutline: '/api/dsh-novel-forge/save-outline',
  plan: '/api/dsh-novel-forge/plan',
  volumes: '/api/dsh-novel-forge/volumes',
  bible: '/api/dsh-novel-forge/bible',
  assets: '/api/dsh-novel-forge/assets',
  styleEngine: '/api/dsh-novel-forge/style-engine',
  styleFormula: '/api/dsh-novel-forge/style-formula',
  styleDetect: '/api/dsh-novel-forge/style-detect',
  knowledge: '/api/dsh-novel-forge/knowledge',
  bookAnalysis: '/api/dsh-novel-forge/book-analysis',
  ideaInspiration: '/api/dsh-novel-forge/idea-inspiration',
  ideaInspirationMarket: '/api/dsh-novel-forge/idea-inspiration/market',
  director: '/api/dsh-novel-forge/director',
  directorTodos: '/api/dsh-novel-forge/director/todos',
  llmLive: '/api/dsh-novel-forge/llm-live/stream',
  marketRadar: '/api/dsh-novel-forge/market-radar',
  marketRadarScan: '/api/dsh-novel-forge/market-radar/scan',
  marketRadarApply: '/api/dsh-novel-forge/market-radar/apply',
  marketRadarSync: '/api/dsh-novel-forge/market-radar/foundation-sync',
  marketRadarBrief: '/api/dsh-novel-forge/market-radar/brief',
  generate: '/api/dsh-novel-forge/generate',
  review: '/api/dsh-novel-forge/review',
  rewrite: '/api/dsh-novel-forge/rewrite',
  polish: '/api/dsh-novel-forge/polish',
  /** 采纳待确认草稿（润色/重写产物）覆盖正文文件。 */
  draftApply: '/api/dsh-novel-forge/draft/apply',
  /** 放弃待确认草稿，保留原稿。 */
  draftDiscard: '/api/dsh-novel-forge/draft/discard',
  summary: '/api/dsh-novel-forge/summary',
  foreshadow: '/api/dsh-novel-forge/foreshadow',
  exportBook: '/api/dsh-novel-forge/export',
  chapter: '/api/dsh-novel-forge/chapter',
  /** 审查任意正文文本（作者手动编辑后，不落盘）。 */
  chapterCheck: '/api/dsh-novel-forge/chapter/check',
  /** 保存手动编辑的正文（自动备份 .bak）。 */
  chapterSave: '/api/dsh-novel-forge/chapter/save',
  assistant: '/api/dsh-novel-forge/assistant',
  assistantHistory: '/api/dsh-novel-forge/assistant-history',
  /** 清空助手对话记录。 */
  assistantClear: '/api/dsh-novel-forge/assistant/clear',
  bookshelf: '/api/dsh-novel-forge/bookshelf',
  /** 导入已有项目目录（含 novel-project.json）到书架。 */
  bookshelfImportDir: '/api/dsh-novel-forge/bookshelf/import-dir',
  /** 导入 txt/md 全本：拆章建项目并登记书架。 */
  bookshelfImportText: '/api/dsh-novel-forge/bookshelf/import-text',
  /** 导入 txt/md 全本：拆章预览（不落盘）。 */
  bookshelfImportTextPreview: '/api/dsh-novel-forge/bookshelf/import-text/preview',
  /** LLM 模型连通性测试：真实最小调用，验证 Key / 端点 / 模型可用。 */
  llmTest: '/api/dsh-novel-forge/llm-test',
  /** 添加模型：厂商直填 key 或自定义路由，写进 DSH 凭据与 llm-pi-ai 路由。 */
  addModel: '/api/dsh-novel-forge/llm-add',
  /** 运行时厂商目录（DSH pi-ai 可配置提供方 + 内置适配器）。 */
  llmVendors: '/api/dsh-novel-forge/llm-vendors',
  /** 查询某个 provider 当前可用的模型（添加成功后可即时刷新）。 */
  llmModels: '/api/dsh-novel-forge/llm-models',
  /** 已注册的提供方路由列表（提供方管理）。 */
  llmProviders: '/api/dsh-novel-forge/llm-providers',
  /** 移除一个提供方。 */
  llmRemove: '/api/dsh-novel-forge/llm-remove',
  /** 重置项目（可选携带新大纲）：清空设定/卷/章节/伏笔/资产/事实库。 */
  reset: '/api/dsh-novel-forge/reset',
  /** 全书一致性质检：LLM 扫描已生成章节，输出矛盾问题清单。 */
  audit: '/api/dsh-novel-forge/audit',
  /** 角色卡刷新：基于事实库与各章摘要聚合角色当前状态。 */
  charactersRefresh: '/api/dsh-novel-forge/characters/refresh',
  /** 事实库回填：对历史已生成章节批量抽取事实（旧章节无事实记录时用）。 */
  factsBackfill: '/api/dsh-novel-forge/facts/backfill',
  /** 道藏局部修补（如世界观规则编辑）。 */
  biblePatch: '/api/dsh-novel-forge/bible/patch',
  /** 小说简介：生成（AI）/补全（AI）/保存。 */
  blurb: '/api/dsh-novel-forge/blurb',
  /** 重命名当前书（同步项目与书架条目）。 */
  rename: '/api/dsh-novel-forge/rename',
  /** 大世界：AI 提炼 / 保存结构化数据（境界/区域/势力）。 */
  world: '/api/dsh-novel-forge/world',
  /** 封面：GET 读取（dataUrl）/ POST 上传或移除。 */
  cover: '/api/dsh-novel-forge/blurb/cover',
  /** 剧情线管理：增删改 + 关联章节。 */
  plotlines: '/api/dsh-novel-forge/plotlines',
  /** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
  roles: '/api/dsh-novel-forge/roles',
  /** 作者复盘补跑：对已写章节补齐 authorReview（全书流式 / 单章 JSON）。 */
  reviewBackfill: '/api/dsh-novel-forge/review/backfill',
  /** 章节复位：generating 卡死 → pending（可重新生成）。 */
  chapterReset: '/api/dsh-novel-forge/chapter/reset',
  /** 章节直接通过：作者对 rejected/written 章节行使最终决定权。 */
  chapterApprove: '/api/dsh-novel-forge/chapter/approve',
  /** 敏感词检查：全书已写章节或指定文本。 */
  sensitiveCheck: '/api/dsh-novel-forge/sensitive-check',
  /** 开书想法 → AI 补全大纲：输入一句话想法，生成 2-3 个可选大纲方案。 */
  outlineSuggest: '/api/dsh-novel-forge/outline/suggest',
  /** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流）。 */
  outlineReverse: '/api/dsh-novel-forge/outline/reverse',
  /** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检（两阶段：源笔记→分节分析）。 */
  breakdown: '/api/dsh-novel-forge/breakdown',
  /** 生产单：启动批量生产（计划补足 + 逐章生成 + 被拒分级处理）。 */
  runStart: '/api/dsh-novel-forge/run/start',
  /** 生产单控制：pause / resume / stop。 */
  runControl: '/api/dsh-novel-forge/run/control',
  /** 生产单状态（含进度统计与日志）。 */
  runStatus: '/api/dsh-novel-forge/run/status',
  config: '/api/dsh-novel-forge/config',
  openFolder: '/api/dsh-novel-forge/open-folder',
  /** 插件自更新：在 DSH profile 目录拉取最新 npm 版（下载后需重启 DSH 生效）。 */
  pluginUpdate: '/api/dsh-novel-forge/plugin/update',
  /** 作者资产库/总数据：读取个人跨书资产（笔法/红线/套路/角色模板/世界观模板）。 */
  authorAssets: '/api/dsh-novel-forge/author-assets',
  /** 作者资产库：新增/更新一条资产（upsert by id）。 */
  authorAssetsUpsert: '/api/dsh-novel-forge/author-assets/upsert',
  /** 作者资产库：删除一条资产。 */
  authorAssetsRemove: '/api/dsh-novel-forge/author-assets/remove',
  /** 作者资产库：导入默认（书架书的写作资产/角色 + 内置全局库）批量沉淀。 */
  authorAssetsImportDefault: '/api/dsh-novel-forge/author-assets/import-default',
  /** 改编模式：上传全文 → 分析 → 原文设定卡片/可改范围矩阵。 */
  adaptAnalyze: '/api/dsh-novel-forge/adapt/analyze',
  /** 改编模式：确认要改的维度 → 生成映射表/改编规则/联动影响清单。 */
  adaptPropose: '/api/dsh-novel-forge/adapt/propose',
  /** 改编模式：执行术语替换（全局替换 + 命中统计 + 改编文本预览）。 */
  adaptExecute: '/api/dsh-novel-forge/adapt/execute',
  /** 改编模式：保存改编全文为新书（原书保留，登记书架）。 */
  adaptSave: '/api/dsh-novel-forge/adapt/save',
  /** 改编模式：从源全文 + 编辑后方案提炼新书资料并保存为「待写新书」。 */
  adaptMaterialize: '/api/dsh-novel-forge/adapt/materialize',
  /** 改编模式：rewrite 逐章重写（NDJSON 流式进度）。 */
  adaptRewriteStream: '/api/dsh-novel-forge/adapt/rewrite-stream',
  /** 改编模式：把预览/微调后的新书资料写入并登记书架。 */
  adaptMaterializeSave: '/api/dsh-novel-forge/adapt/materialize-save',
  /** 主题自定义背景：上传图片（POST，存盘并返回服务端 URL）。 */
  themeBackgroundUpload: '/api/dsh-novel-forge/theme/background',
  /** 主题自定义背景：读取已上传文件（GET prefix，/theme/background/<name>）。 */
  themeBackgroundGet: '/api/dsh-novel-forge/theme/background',
} as const

/** 书架：一本书的条目。 */
export interface BookEntry {
  /** 稳定 id。 */
  id: string
  /** 书名。 */
  bookName: string
  /** 该书输出目录（独立项目目录）。 */
  outputDir: string
  /** 创建时间。 */
  createdAt: string
  /** 最后活动时间。 */
  updatedAt: string
}

/** 书架快照（含每本书的进度摘要）。 */
export interface BookshelfSnapshot {
  books: Array<BookEntry & { done: number; total: number; hasProject: boolean; hasCover: boolean; blurb?: string }>
  /** 当前激活的书 id（无则 null）。 */
  activeBookId: string | null
}

/** POST /bookshelf 请求：创建新书。 */
export interface BookCreateRequest {
  bookName: string
  outputDir?: string
  /** 开书向导：创建时直接导入的大纲文本（提供则立即建立项目）。 */
  outline?: string
}

/** POST /reset 请求：重置项目（可选更新大纲）。 */
export interface ResetRequest {
  /** 新大纲文本；提供则替换 outline，否则保留原大纲。 */
  outline?: string
}

/** POST /bookshelf/activate 请求：切换当前书。 */
export interface BookActivateRequest {
  id: string
}

/** POST /bookshelf/remove 请求：移除书架条目。 */
export interface BookRemoveRequest {
  id: string
}

/** POST /bookshelf/import-dir 请求：导入已有项目目录。 */
export interface BookImportDirRequest {
  /** 项目目录（须含 novel-project.json）。 */
  outputDir: string
}

/** POST /bookshelf/import-dir 响应。 */
export interface BookImportDirResponse {
  book: BookEntry
  /** true = 目录已在书架中（本次为重新激活）。 */
  existed: boolean
}

/** POST /bookshelf/import-text 请求：导入 txt/md 全本。两种模式二选一：
 *  - filePath：服务器本地文件路径；
 *  - text + fileName：浏览器上传的全文内容（fileName 用于推断书名）。
 */
export interface BookImportTextRequest {
  /** 模式一：源文件绝对路径（txt 或 md）。 */
  filePath?: string
  /** 模式二：浏览器上传的全文内容。 */
  text?: string
  /** 模式二：原文件名（txt/md），用于推断书名与显示。 */
  fileName?: string
  /** 输出目录；缺省为 ~/.dsh/novels/书名。 */
  outputDir?: string
}

/** POST /bookshelf/import-text 响应。 */
export interface BookImportTextResponse {
  bookName: string
  /** 成功拆出的章节数。 */
  chapters: number
  /** 因内容过短被跳过的章节标题列表。 */
  skipped: string[]
  /** 登记后的书架条目。 */
  book: BookEntry
}

/** POST /bookshelf/import-text/preview 请求：上传全文做拆章预览（不落盘）。 */
export interface BookImportTextPreviewRequest {
  text: string
  /** 原文件名（txt/md），用于推断书名。 */
  fileName?: string
}

/** POST /bookshelf/import-text/preview 响应。 */
export interface BookImportTextPreviewResponse {
  /** 预计书名（fileName 去扩展名）。 */
  bookName: string
  /** 识别出的章节（已按正文长度过滤过短章节）。 */
  chapters: Array<{ no: number; title: string; chars: number }>
  /** 因内容过短被跳过的章节标题列表。 */
  skipped: string[]
}

/** Chapter lifecycle states (the writing pipeline's state machine). */
export type ChapterStatus =
  | 'pending'      // planned, not started
  | 'generating'   // LLM writing right now
  | 'written'      // body on disk, awaiting review
  | 'reviewing'    // review in progress
  | 'approved'     // passed review (or user-approved)
  | 'rejected'     // review found problems
  | 'error'        // generation failed

/** One chapter in the plan. */
export interface ChapterPlan {
  /** 1-based chapter number (stable identity; files are named from it). */
  no: number
  /** Volume this chapter belongs to (1-based; 0 = unassigned). */
  volume: number
  /** Chapter title, decided by the LLM plan step. */
  title: string
  /** Story beats / plot points for this chapter (model-facing guidance). */
  beats: string
  /** Target character count (defaults to the configured chapter size). */
  targetChars: number
  /** 本章必达项（必须推进的局面/关系/信息/风险/决策变化）。 */
  mustAdvance?: string[]
  /** 本章必须保持/不得破坏的项（如人物状态、已有伏笔不提前揭）。 */
  mustPreserve?: string[]
  /** 本章不可违背的人物硬事实（身份/阵营/境界/当前位置/知情度）。 */
  characterHardFacts?: string[]
  /** 伏笔操作指令（seed/touch/pressure/partial_reveal/payoff/forbid）。 */
  payoffDirectives?: Array<{ no?: number; operation?: 'seed' | 'touch' | 'pressure' | 'partial_reveal' | 'payoff' | 'forbid'; text?: string }>
  /** 章末钩子要求（悬念/反转/新线索/未闭合选择）。 */
  endingHook?: string
  /** 本章义务合约（人类可读摘要，供生成与审稿共同锚定）。 */
  obligation?: string
  /** Generation/review state. */
  status: ChapterStatus
  /** 进入 generating 的时间（用于超时自动复位；未在生成时无此字段）。 */
  generatingAt?: string
  /** Actual character count once generated. */
  chars?: number
  /** Failure message when status is 'error'. */
  error?: string
  /** Output file name once generated (relative to the output dir). */
  file?: string
  /** LLM summary of the chapter (narrative memory for later chapters). */
  summary?: string
  /** Latest review report (present once reviewed). */
  review?: ReviewReport
  /** 作者复盘：钩子兑现/结尾钩子/剧情线推进/连续性/节奏趋势（生成后自动）。 */
  authorReview?: AuthorReview
  /**
   * 待确认草稿：润色（去AI味）或整章重写的产物正文。生成时先存这里，
   * 用户看过对比后点「采纳」才覆盖正文文件；点「放弃」则丢弃。刷新页面不丢失。
   */
  pendingDraft?: string
}

/** 作者复盘：叙事结构层面的逐章检查（钩子/推进/连续性/趋势）。 */
export interface AuthorReview {
  /** 上一章结尾钩子是否在本章兑现。 */
  hookHonored: boolean
  /** 钩子兑现说明（未兑现时给出建议）。 */
  hookNote: string
  /** 本章结尾钩子强度 0-10。 */
  endingHook: number
  /** 剧情线推进情况（推进了哪条线/或未推进）。 */
  plotlineProgress: string
  /** 结构化：本章推进的剧情线名称列表（与项目剧情线 name 精确匹配，复盘后自动关联章节）。 */
  advancedLines?: string[]
  /** 连续性检查（人物位置/时间/伤势/资源是否与上章衔接）。 */
  continuity: string
  /** 近期节奏趋势提示（拖沓/爽点密度等）。 */
  trend: string
  /** 本章发生的关键状态变化（人物状态/世界局面/关系/资源），用于回灌整本与事实库。 */
  stateChanges?: string[]
  /** 本章新引入或升级的冲突（供整本控制层与后续卷节奏参考）。 */
  newConflicts?: string[]
  /** 本章埋下/推进的新线索（供知识与伏笔系统回灌）。 */
  clues?: string[]
  /** 本章缺席但值得注意的角色及风险（卷级职责/缺席风险）。 */
  absentRisks?: string[]
  /** 复盘时间。 */
  reviewedAt: string
}

/** 审稿维度（结构化定位问题类别；与 review-policy.ts 的 REVIEW_DIMENSIONS 对齐）。 */
export type ReviewDimension = 'character' | 'setting' | 'redline' | 'writing' | 'pacing' | 'logic' | 'anti-ai' | 'presentation' | 'compliance'

/** One review finding. */
export interface ReviewIssue {
  /** Severity: high = must fix, medium = should fix, low = suggestion. */
  severity: 'high' | 'medium' | 'low'
  /** 问题维度（可选；缺省由前端按 item 推断）。 */
  dimension?: ReviewDimension
  /** What the problem is. */
  item: string
  /** Concrete suggestion for fixing it. */
  suggestion: string
  /** 命中的反 AI 规则名（结构化，便于统计）。 */
  ruleName?: string
  /** 规则类别：forbidden / risk / encourage。 */
  ruleType?: 'forbidden' | 'risk' | 'encourage'
  /** 问题细分类（如 套话 句式 段落 心理 设定）。 */
  category?: string
  /** 命中的原文摘录。 */
  excerpt?: string
  /** 判定理由。 */
  reason?: string
  /** 是否可自动改写。 */
  canAutoRewrite?: boolean
}

/** AI review report for one chapter. */
export interface ReviewReport {
  /** Overall score 0-100. */
  score: number
  /** Pass threshold (config; 70 default). */
  passed: boolean
  /** One-line verdict. */
  verdict: string
  /** Individual findings. */
  issues: ReviewIssue[]
  /** 风险分 0-100（越高越需人工处理；源自 LLM 复核与本地扫描）。 */
  riskScore?: number
  /** 本地 AI 味指数 0-100（越高越像 AI；LLM 复核锚点，供 UI 展示）。 */
  aiFlavor?: number
  /** 本地扫描命中的高频套话（按次数降序，取前若干）。 */
  aiPhrases?: Array<{ word: string; count: number }>
  /** When the review ran. */
  reviewedAt: string
}

/** A volume of the book. */
export interface Volume {
  /** 1-based volume number. */
  no: number
  /** Volume title. */
  title: string
  /** Volume positioning / summary. */
  summary: string
  /** First chapter number of this volume. */
  chapterStart: number
  /** Last chapter number (inclusive). */
  chapterEnd: number
  /** 卷级战略（这一卷的定位/承转，如「立威卷」「冲突升级卷」）。 */
  strategy?: string
  /** 卷节奏板（这一卷的节奏安排：起-承-转-合/爽点密度/关键节点）。 */
  pacing?: string
}

/** 开书定盘：面向读者的承诺与流派定位（生成/规划均可引用）。 */
export interface BookContract {
  /** 一句话卖点/题材承诺。 */
  promise?: string
  /** 主推进模式名（从推进模式库选）。 */
  primaryModeName?: string
  /** 辅助推进模式名。 */
  secondaryModeNames?: string[]
  /** 整体文风基调（一句话）。 */
  tone?: string
  /** 目标平台（如「番茄」）。 */
  targetPlatform?: string
}

/** 书内知识库文档（供生成/规划时检索注入的参考资料）。 */
export interface KnowledgeDoc {
  id: string
  title: string
  content: string
  updatedAt: string
}

/** POST /knowledge request：增删改知识库文档。 */
export interface KnowledgeRequest {
  action: 'add' | 'remove' | 'replace'
  doc?: { id?: string; title: string; content: string }
  id?: string
}

/** POST /book-analysis request。 */
export interface BookAnalysisRequest {
  text: string
}

/** 书分析/拆书结果。 */
export interface BookAnalysisResult {
  sellingPoints: string[]
  structure: string[]
  lessons: string[]
  risks: string[]
}

/** POST /idea-inspiration request。 */
export interface IdeaInspirationRequest {
  idea: string
  count?: number
}

/** 创意灵感结果：多方向开书灵感。 */
export interface IdeaInspirationResult {
  ideas: Array<{ title: string; hook: string; genre: string; pov: string; payoff: string }>
}

/** POST /director request。 */
export interface DirectorRequest {
  focus?: string
}

/** 自动导演编排建议（下一卷/阶段编排 + 修复再平衡）。 */
export interface DirectorAdvice {
  summary: string
  nextArc: string[]
  pacing: string
  risks: string[]
  fixes: string[]
}

/** 自动导演「采纳」后生成的书内待办项。 */
export interface DirectorTodo {
  id: string
  text: string
  /** 来源：风险 或 修复。 */
  source: 'risk' | 'fix'
  done: boolean
  createdAt: string
}

/** 题材雷达：单条市场信号。 */
export interface MarketRadarSignal {
  id: string
  kind: 'genre' | 'protagonist' | 'advantage' | 'opening' | 'relationship' | 'title_pattern' | 'opportunity' | 'crowding'
  title: string
  detail: string
  /** 趋势：current / rising / stable / falling。 */
  direction?: 'current' | 'rising' | 'stable' | 'falling'
  /** 是否建议优先考虑。 */
  recommended?: boolean
}

/** 题材雷达：生产底座（引用内置题材/推进模式库，或给出新资产）。 */
export interface ProductionFoundation {
  genre: { existingId?: string; name: string; description: string; template?: string }
  primaryStoryMode: { existingId?: string; name: string; driver: string; readerExpectation: string }
  secondaryStoryMode?: { existingId?: string; name: string; driver: string; readerExpectation: string }
}

/** 题材雷达：开书创意简报（可执行，严禁照搬具体作品/命名）。 */
export interface MarketCreativeBrief {
  promptBlock: string
  openingIdea: string
  coreAdvantage: string
  bookSellingPoint: string
  first30ChapterPromise: string
}

/** 题材雷达结果。 */
export interface MarketRadarResult {
  signals: MarketRadarSignal[]
  productionFoundation: ProductionFoundation
  /** 开书创意简报（可选；用「用信号创作」接口单独生成）。 */
  creativeBrief?: MarketCreativeBrief
}

/** POST /market-radar request。 */
export interface MarketRadarRequest {
  platform?: string
  genre?: string
  keywords?: string
  feedText?: string
  /** 已扫描的上榜记录（来自真实榜单抓取），用于让分析基于真实榜单证据。 */
  candidates?: Array<{ title: string; author?: string; tags?: string[]; synopsis?: string; category?: string; heatLabel?: string }>
}

/** POST /market-radar/brief request：用选中的信号 + 影响模式生成开书创意。 */
export interface MarketRadarBriefRequest {
  influenceMode: 'follow_hot' | 'differentiate' | 'light'
  signals: MarketRadarSignal[]
}

/** A character card from the story bible. */
export interface CharacterCard {
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'other'
  /** Personality / traits (short lines). */
  traits: string[]
  /** Goals and motivations. */
  goals: string
  /** Key relations to other characters. */
  relations: string
  /** 知情度：该角色已经知道的事实/秘密（未列出的信息该角色不知道）。 */
  knowledge?: string[]
}

/** The structured story bible (worldbuilding extracted from the outline). */
export interface StoryBible {
  /** Genre + tone tags. */
  genre: string
  /** Worldbuilding rules (power system, geography, factions...). */
  worldRules: string[]
  /** Character cards. */
  characters: CharacterCard[]
  /** Writing red lines (forbidden content / must-avoid tropes). */
  redLines: string[]
  /** Style guidance (pacing, pov, tone). */
  style: string[]
  /** When the bible was generated. */
  generatedAt?: string
}

/** A planted/active/resolved foreshadowing thread. */
export interface Foreshadow {
  /** Stable id. */
  id: string
  /** What the foreshadow is. */
  description: string
  /** Chapter where it was planted (undefined = planned). */
  plantedChapter?: number
  /** Chapter where it should be paid off. */
  targetChapter?: number
  /** Lifecycle state. */
  status: 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned'
  /** Resolution note when resolved. */
  resolvedNote?: string
}

/** 一条已确立的叙事事实（事实库/时间线，注入后续章节生成）。 */
export interface ChapterFact {
  /** 来源章节号。 */
  chapterNo: number
  /** 事实文本（人物状态/境界资源/关系变化/伏笔落地等）。 */
  text: string
}

/** 一条全书质检发现的问题（一致性矛盾，定位到章）。 */
export interface AuditIssue {
  /** 问题所在章节号（无法定位时 0）。 */
  chapterNo: number
  severity: 'high' | 'medium' | 'low'
  /** 矛盾描述。 */
  item: string
  /** 修改建议。 */
  suggestion: string
}

/** POST /audit 响应。 */
export interface AuditResponse {
  issues: AuditIssue[]
  /** 参与质检的章节数。 */
  auditedChapters: number
  /** 质检时间。 */
  auditedAt: string
  /** 本次质检使用的模型（auditModel 或全局 model）。 */
  model?: string
}

/** 全书质检的实时状态（通过 /status 暴露给面板/外部读取）。 */
export interface AuditStatus {
  status: 'idle' | 'running' | 'done' | 'error'
  /** 开始时间（ISO）。 */
  startedAt?: string
  /** 结束时间（ISO）。 */
  finishedAt?: string
  /** 总批次数（0 = 尚未开始/无章节）。 */
  totalBatches: number
  /** 已完成批次数。 */
  completedBatches: number
  /** 参与质检的章节数。 */
  auditedChapters?: number
  /** 发现的问题数（done 后有效）。 */
  issuesCount?: number
  /** 最近一次质检的问题清单（done 后有效；error 时为空）。 */
  issues?: AuditIssue[]
  /** 失败信息（error 时有效）。 */
  error?: string
}

/** 一条剧情线（主线/支线/人物线/悬念线）。 */
export interface Plotline {
  /** 稳定 id。 */
  id: string
  /** 线名。 */
  name: string
  /** 类型：主线 / 支线 / 人物线 / 悬念线。 */
  kind: 'main' | 'branch' | 'character' | 'mystery'
  /** 目标/终点（这条线最终要完成什么）。 */
  goal: string
  /** 当前进度说明（最近推进到哪）。 */
  progress: string
  /** 生命周期状态。 */
  status: 'active' | 'paused' | 'resolved' | 'abandoned'
  /** 关联章节号（推进/落地的章节）。 */
  chapters: number[]
  /** 创建时间。 */
  createdAt: string
}

/** POST /plotlines 请求：剧情线增删改 + 关联章节 + AI 辅助。 */
export interface PlotlinesRequest {
  op: 'add' | 'update' | 'remove' | 'link' | 'suggest' | 'refresh' | 'health' | 'plan'
  /** add / update 时传入的完整剧情线。 */
  line?: Plotline
  /** remove / link / refresh 时的目标线 id。 */
  id?: string
  /** link 时关联的章节号。 */
  chapterNo?: number
}

/** 剧情线健康检查报告。 */
export interface PlotlineHealthReport {
  /** 是否需要新线（需要 / 暂不需要 / 再写 X 章后需要）。 */
  verdict: string
  /** 建议添加新线的时机说明。 */
  timing: string
  /** 依据（基于数据的理由，每条一句）。 */
  reasons: string[]
  /** 各线健康度。 */
  lines: Array<{
    name: string
    /** ok=健康 / warning=预警 / stale=搁置过久。 */
    health: 'ok' | 'warning' | 'stale'
    note: string
  }>
}

/** AI 剧情方案：下一阶段目标 + 建议新线。 */
export interface PlotlinePlan {
  /** 下一阶段（未来 5-10 章）剧情方向。 */
  direction: string
  /** 建议的新线（可逐条采纳）。 */
  suggestions: Plotline[]
}

/** POST /plotlines 响应。 */
export interface PlotlinesResponse {
  plotlines: Plotline[]
  /** op=suggest 时的 AI 建议候选线。 */
  suggestions?: Plotline[]
  /** op=health 时的健康检查报告。 */
  health?: PlotlineHealthReport
  /** op=plan 时的剧情方案。 */
  plan?: PlotlinePlan
}

/** 一条敏感词命中。 */
export interface SensitiveHit {
  /** 命中章节号（文本检测时为 0）。 */
  chapterNo: number
  /** 命中的违禁词。 */
  word: string
  /** 类别：政治 / 擦边 / 暴力 / 辱骂 / 广告 / 其他。 */
  category: string
  /** 出现次数。 */
  count: number
}

/** POST /sensitive-check 请求：检测指定章节/任意文本/全书。 */
export interface SensitiveCheckRequest {
  /** 检测该章正文。 */
  chapterNo?: number
  /** 检测任意文本（优先于 chapterNo）。 */
  text?: string
  /** 扫描全部已写章节。 */
  all?: boolean
}

/** POST /sensitive-check 响应。 */
export interface SensitiveCheckResponse {
  hits: SensitiveHit[]
  /** 参与扫描的章节数。 */
  scannedChapters: number
}

/** 开书想法 → AI 大纲方案（一个候选）。 */
export interface OutlineCandidate {
  /** 唯一 id（前端暂留/换批用）。 */
  id: string
  /** 推荐书名。 */
  bookName: string
  /** 题材（如 仙侠修真 / 都市）。 */
  genre: string
  /** 核心卖点一句话。 */
  sellingPoint: string
  /** 完整大纲文本（可直接用作项目大纲，≥800 字）。 */
  outline: string
}

/** POST /outline/suggest 请求：想法 → 2-3 个可选大纲。 */
export interface OutlineSuggestRequest {
  /** 作者想法（一两句话，≥50 字）。 */
  idea: string
  /** 本次要生成的候选数（默认 3，最多 3）。 */
  count?: number
  /** 已暂留方案的剧情方向摘要（换批时让 LLM 避开，防止与已留方案重复）。 */
  exclude?: string[]
}

/** POST /outline/suggest 响应。 */
export interface OutlineSuggestResponse {
  candidates: OutlineCandidate[]
}

/** 拆书分析：一个分析小节。 */
export interface BreakdownSection {
  /** 小节键：overview / plot / character / style / market。 */
  key: string
  /** 小节标题（如「拆书总览」）。 */
  title: string
  /** 可读分析稿（markdown）。 */
  markdown: string
  /** 结构化数据（程序可消费）。 */
  structured: Record<string, unknown>
}

/** 拆书分析：一条证据（结论→原文回溯）。 */
export interface BreakdownEvidence {
  label: string
  excerpt: string
  /** 来源章节号（0 = 未定位）。 */
  chapterNo: number
  /** 指向的结构化字段。 */
  fieldKey?: string
}

/** POST /breakdown 请求：对已写章节做拆书分析。 */
export interface BreakdownRequest {
  /** 分析范围：'recent'=最近 20 章 / 'volume:N'=第 N 卷 / 'all'=全书（默认 recent）。 */
  scope?: string
  /** 分析档位：'quick'=4 维（总览/剧情/人物/文风）/ 'standard'=5 维（+卖点）。 */
  preset?: 'quick' | 'standard'
  /** token 预算上限（默认 50000）。 */
  budgetTokens?: number
}

/** POST /breakdown 响应。 */
export interface BreakdownResponse {
  sections: BreakdownSection[]
  evidence: BreakdownEvidence[]
  /** 参与分析的章节数。 */
  chaptersScanned: number
  /** 估算消耗 token。 */
  usedTokens: number
}

/** 角色卡：角色当前状态（从事实库聚合）。 */
export interface RoleStatusCard {
  name: string
  /** protagonist / supporting / antagonist / other。 */
  role: string
  /** 当前状态一句话（境界/资源/伤势/心境）。 */
  status: string
  /** 最近出场章节。 */
  lastChapter: number
  /** 出场次数。 */
  appearances: number
}

/** 角色库条目（主表：作者维护 + AI 提炼 + 编年录自动聚合）。 */
export interface RoleRecord {
  /** 角色名（唯一键）。 */
  name: string
  /** 定位：主角 / 女主 / 女配 / 配角 / 反派 / 路人。 */
  roleLabel: 'protagonist' | 'female_lead' | 'female_support' | 'support' | 'antagonist' | 'extra'
  /** 身份一句话（如：祭族后裔、青云宗杂役）。 */
  identity: string
  /** 性格标签。 */
  traits: string[]
  /** 目标与动机。 */
  goals: string
  /** 关系网：[角色名]（关系）。 */
  relations: string[]
  /** 成长线：阶段 → 说明（可含章节）。 */
  arc: string[]
  /** 知情度：该角色已经知道的信息。 */
  knowledge: string[]
  /** 首次出场章节（编年录聚合，可手动修正）。 */
  firstChapter?: number
}

/** POST /roles 请求：角色库增删改 + AI 提炼 + 参考图上传。 */
export interface RolesRequest {
  op: 'extract' | 'adopt' | 'update' | 'remove'
  /** adopt / update 时传入的角色（adopt 可修改后采纳）。 */
  role?: RoleRecord
  /** remove 时的角色名。 */
  name?: string
}


/** POST /llm-test 请求：对选中的提供商/模型发一次最小真实调用。 */
export interface LlmTestRequest {
  provider: string
  model: string
}

/** POST /llm-test 响应。 */
export interface LlmTestResponse {
  ok: boolean
  /** 连通延迟（毫秒）。 */
  ms?: number
  /** 失败原因（已映射为人话）。 */
  message?: string
  /** 稳定错误码（LlmError code），便于排查。 */
  code?: string
}

/** POST /roles 响应。 */
export interface RolesResponse {
  roles: RoleRecord[]
  /** op=extract 时的 AI 候选角色。 */
  candidates?: RoleRecord[]
}

/** POST /bible/patch 请求：局部修补道藏。 */
export interface BiblePatchRequest {
  worldRules?: string[]
  redLines?: string[]
  style?: string[]
  /** 角色卡整体替换（人物志编辑知情度等）。 */
  characters?: CharacterCard[]
}

/** POST /blurb 请求：AI 生成/补全或手动保存小说简介。 */
export interface BlurbRequest {
  action: 'generate' | 'save'
  /** 已写好的开头（AI 补全时使用；留空 = 全量生成）。 */
  partial?: string
  /** 手动保存的完整简介（action=save 时）。 */
  text?: string
}

/** POST /chapter/check|save 请求：审查/保存手动编辑的正文。 */
export interface ChapterTextRequest {
  chapterNo: number
  /** 当前编辑中的正文全文。 */
  text: string
  /** 保存时携带：已在工作区审查过的报告（沿用落盘，不重复审）；缺省则保存后自动正式审稿一次。 */
  report?: ReviewReport
  /** 审查/验证时携带：上一轮审稿报告。传入后进入「验证模式」——逐条核对原意见是否解决、
   *  只挑新增 high，不再全新找茬（防止"越修 high 越多"）。 */
  previousReport?: ReviewReport
}

/** POST /chapter/save 响应。 */
export interface ChapterSaveResponse {
  ok: boolean
  chars: number
  file: string
  /** 落盘的审稿报告（沿用工作区报告或保存后自动审稿）。 */
  report?: ReviewReport
}

/** POST /cover 请求：上传或移除封面。 */
export interface CoverRequest {
  action: 'upload' | 'remove'
  /** 上传时：data:image/...;base64,... 格式的图片数据。 */
  dataUrl?: string
}

/** POST /rename 请求：重命名当前书。 */
export interface RenameRequest {
  bookName: string
}

/** 大世界：一个境界等级。 */
export interface WorldRealm {
  /** 境界名（练气/筑基/金丹…）。 */
  name: string
  /** 描述：突破条件/寿命/标志等。 */
  description: string
}

/** 大世界：一个地理区域。 */
export interface WorldRegion {
  name: string
  description: string
  /** 关联势力名（可空）。 */
  faction?: string
}

/** 大世界：一方势力。 */
export interface WorldFaction {
  name: string
  /** 类型：宗门/家族/王朝/组织… */
  kind: string
  description: string
  /** 驻地区域（可空）。 */
  region?: string
}

/** 大世界结构化数据。 */
export interface WorldState {
  realms: WorldRealm[]
  regions: WorldRegion[]
  factions: WorldFaction[]
}

/** POST /world 请求：AI 提炼或手动保存。 */
export interface WorldRequest {
  action: 'generate' | 'save'
  /** action=save 时的完整世界数据。 */
  world?: WorldState
}

/** GET /cover 响应：封面的 dataUrl（无封面为 null）。 */
export interface CoverResponse {
  dataUrl: string | null
}

/** The persisted project: outline + bible + plan + progress. */
export interface ProjectState {
  /** Book title (first non-empty line of the outline, usually). */
  bookName: string
  /** Full outline text (docx-extracted or pasted). */
  outline: string
  /** Source outline path when loaded from a docx. */
  outlinePath?: string
  /** Structured story bible (worldbuilding), if generated. */
  bible?: StoryBible
  /** Volumes, if planned. */
  volumes?: Volume[]
  /** Chapter plan. */
  chapters: ChapterPlan[]
  /** Foreshadowing threads. */
  foreshadows: Foreshadow[]
  /** 写作资产（题材基底/推进模式/反AI规则/写法资产）。 */
  assets?: ProjectAssets
  /** 事实库/时间线：每章生成后抽取，注入后续章节保持一致性。 */
  facts?: ChapterFact[]
  /** 书内知识库文档（可检索资料/设定/参考）。 */
  knowledgeDocs?: KnowledgeDoc[]
  /** 自动导演待办：风险/修复「采纳」后生成的随手清单。 */
  todos?: DirectorTodo[]
  /** 小说简介（面向读者的作品门面，AI 生成或手动保存）。 */
  blurb?: string
  /** 开书定盘：书籍级承诺与流派定位（前30章承诺/主副模式/文风/平台）。 */
  bookContract?: BookContract
  /** 封面文件名（相对输出目录，如 cover.png）。 */
  coverPath?: string
  /** 大世界结构化数据（境界体系/区域/势力）。 */
  world?: WorldState
  /** 剧情线（主线/支线/人物线/悬念线）。 */
  plotlines?: Plotline[]
  /** 角色库（作者维护 + AI 提炼的主表）。 */
  roles?: RoleRecord[]
  /** 人物志：角色当前状态聚合结果（从编年录刷新后存档，打开页面直接显示）。 */
  roleStatus?: RoleStatusCard[]
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

/** 手动添加的模型库条目（只存插件内，不改 DSH 全局）。 */
export interface SavedModel {
  /** 唯一 id（前端生成的短 id）。 */
  id: string
  /** 展示名（可为空，回退到 model）。 */
  name: string
  /** DSH 提供商路由（如 zai-coding-cn）。 */
  provider: string
  /** 模型 id（如 glm-5.3-flash）。 */
  model: string
}

/** DSH 模型添加：厂商预设（选择厂商，直接填 API Key）。 */
export interface LlmVendor {
  id: string
  name: string
  /** 该厂商对应的 provider 路由。 */
  route: string
  /** DSH 凭据引用名（写入 .credentials.yaml 的 refs）。 */
  apiKeyEnv: string
  /** 默认模型 id。 */
  defaultModel: string
  /** 建议可选模型 id 列表（下拉 data-list 用）。 */
  models: string[]
  /** 内置适配器（如 deepseek-official），无需注册 pi-ai 路由。 */
  builtin?: boolean
}

/** 预置的常见厂商（id=provider 路由；添加模型下拉兜底用，其余厂商由运行时目录动态补充）。 */
export const LLM_VENDORS: LlmVendor[] = [
  { id: 'deepseek-official', name: 'DeepSeek', route: 'deepseek-official', apiKeyEnv: 'DEEPSEEK_API_KEY', defaultModel: 'deepseek-v4-flash', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'], builtin: true },
  { id: 'zai-coding-cn', name: '智谱 GLM', route: 'zai-coding-cn', apiKeyEnv: 'ZAI_CODING_CN_API_KEY', defaultModel: 'glm-5.3-flash', models: ['glm-4.5-air', 'glm-4.7', 'glm-5-turbo', 'glm-5.1', 'glm-5.2', 'glm-5.3', 'glm-5.3-flash', 'glm-5v-turbo'] },
  { id: 'qwen-token-plan-cn', name: '千问百炼', route: 'qwen-token-plan-cn', apiKeyEnv: 'QWEN_TOKEN_PLAN_CN_API_KEY', defaultModel: 'qwen3.7-max', models: ['qwen3.6-flash', 'qwen3.6-plus', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.8-max', 'qwen3.8-max-preview'] },
  { id: 'openrouter', name: 'OpenRouter', route: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY', defaultModel: 'z-ai/glm-5.3-flash', models: ['z-ai/glm-4.6', 'z-ai/glm-4.7', 'z-ai/glm-5', 'z-ai/glm-5-turbo', 'z-ai/glm-5.1', 'z-ai/glm-5.2', 'z-ai/glm-5.3-flash', 'auto', 'deepseek/deepseek-v4-flash', 'anthropic/claude-sonnet-4.6'] },
]

/** 运行时厂商目录的一项（添加到模型下拉；由 DSH 的 pi-ai 可配置提供方动态生成）。 */
export interface LlmVendorOption {
  /** provider 路由 id（也是厂商下拉的值）。 */
  id: string
  /** 展示名。 */
  name: string
  /** 建议模型 id（可为空，用户手填）。 */
  models: string[]
  /** 已知 DSH 凭据引用名；为空时 host 生成 `PI_AI_<ID>_API_KEY`。 */
  apiKeyEnv?: string
  /** 内置适配器（只写凭据，不注册 pi-ai 路由）。 */
  builtin?: boolean
}

/** GET /llm-vendors 响应。 */
export interface LlmVendorsResponse {
  vendors: LlmVendorOption[]
}

/** /llm-models 里的一条模型。 */
export interface LlmModelOption { id: string; name: string }

/** GET /llm-models?provider=x 响应。 */
export interface LlmModelsResponse {
  models: LlmModelOption[]
}

/** GET /llm-providers 响应：当前已注册的提供方路由。 */
export interface LlmProvidersResponse {
  providers: { id: string; name: string }[]
}

/** POST /llm-remove 请求：移除一个提供方（unset key + 移除 llm-pi-ai 路由）。 */
export interface RemoveProviderRequest {
  provider: string
  /** 该提供方对应的 DSH 凭据引用名（用于 unset）。 */
  apiKeyEnv?: string
}

/** POST /llm-remove 响应。 */
export interface RemoveProviderResponse {
  ok: boolean
  message?: string
}

/** GET /llm-providers 响应：当前已注册的提供方路由。 */
export interface LlmProvidersResponse {
  providers: { id: string; name: string }[]
}

/** POST /llm-remove 请求：移除一个提供方（unset key + 移除 llm-pi-ai 路由）。 */
export interface RemoveProviderRequest {
  provider: string
  /** 该提供方对应的 DSH 凭据引用名（用于 unset）。 */
  apiKeyEnv?: string
}

/** POST /llm-remove 响应。 */
export interface RemoveProviderResponse {
  ok: boolean
  message?: string
}

/** POST /llm-add 请求：添加一个模型（厂商直填 key，或自定义路由）。 */
export interface AddModelRequest {
  mode: 'vendor' | 'custom'
  /** 厂商模式用：provider 路由 id（来自 /llm-vendors）。 */
  vendor?: string
  /** 厂商已知的 DSH 凭据引用名（可选；为空时 host 生成）。 */
  apiKeyEnv?: string
  /** 自定义模式用：provider 路由 id。 */
  provider?: string
  /** 模型 id。 */
  model: string
  /** API Key。 */
  apiKey: string
  /** 展示名（可选）。 */
  name?: string
  /** 自定义模式用：OpenAI 兼容 base URL。 */
  baseURL?: string
}

/** POST /llm-add 响应。 */
export interface AddModelResponse {
  ok: boolean
  saved: SavedModel
  provider: string
  message?: string
}

/** 手动添加的模型库条目（只存插件内，不改 DSH 全局）。 */
export interface NovelConfig {
  /** Absolute path of the default docx outline to load. */
  outlinePath: string
  /** Absolute output directory for chapters + project state. */
  outputDir: string
  /** LLM provider route (e.g. deepseek-official). */
  provider: string
  /** LLM model id (e.g. deepseek-v4-flash). */
  model: string
  /** 生成正文用模型（缺省用 model）。 */
  generateModel?: string
  /** 审稿用模型（缺省用 model；建议用更强的 reasoner/pro）。 */
  reviewModel?: string
  /** 全书质检(审计)用模型（缺省用 model）。 */
  auditModel?: string
  /** LLM reasoning effort: off = no thinking; low/high/max = thinking intensity. */
  reasoningEffort: 'off' | 'low' | 'high' | 'max'
  /** 分析类任务（提炼/拆书/反推大纲等）的推理档位；默认 low，不受上面写作档位影响。 */
  analysisReasoning: 'off' | 'low' | 'high' | 'max'
  /** Target characters per chapter. */
  chapterChars: number
  /** Max output tokens per chapter call. */
  maxTokens: number
  /** Review pass threshold (0-100). */
  reviewPassScore: number
  /** Whether generation auto-runs review after writing. */
  autoReview: boolean
  /** Whether generation auto-runs the author review (hook/continuity/trend) after writing. */
  autoAuthorReview: boolean
  /** 修订/润色产出草稿后是否自动附带一次 AI 审查（工作区显示新稿评分与剩余问题）。 */
  autoReviewAfterRevise: boolean
  /** 自定义背景图（URL 或 dataURL 或服务端路径引用；空 = 使用主题默认背景）。 */
  themeBackground?: string
  /** 自定义背景遮罩/模糊强度 0-80（0 = 不遮罩）。 */
  themeBackgroundBlur?: number
  /** 玻璃透明度 0-100（100=当前原样，越小越透，新拟态/黏土可见背景图）。 */
  themeOpacity?: number
  /** 是否启用改编模式（默认关闭；发布后开启）。 */
  enableAdaptMode?: boolean
  /** 手动添加的模型库（「我的模型」条目；只存插件内）。 */
  savedModels?: SavedModel[]
}

/** GET /status response. */
export interface StatusResponse {
  config: NovelConfig
  /** The persisted project, when one exists in the output dir. */
  project?: ProjectState
  /** Chapter files already on disk (basenames, sorted). */
  generatedFiles: string[]
  /** 全书质检实时状态（用于面板/外部读取进度）。 */
  audit?: AuditStatus
}

/** 生产单状态（生产单 = 区间批量生产执行器：计划补足 + 逐章生成 + 被拒分级处理）。 */
export interface RunState {
  runId: string
  /** 区间起点（含）。 */
  startNo: number
  /** 区间终点（含）。 */
  endNo: number
  status: 'running' | 'paused' | 'done' | 'stopped' | 'error'
  /** 当前处理到的章号（已 approved 的章会快进）。 */
  currentNo: number
  stats: {
    /** 新生成（含审稿）的章数。 */
    generated: number
    /** 被拒后按意见修订并通过的章数。 */
    revised: number
    /** 被拒后豁免通过（无 high）的章数。 */
    exempted: number
    /** error 后重新生成的章数。 */
    regenerated: number
    /** 生成失败的章数。 */
    error: number
  }
  /** 两轮修订仍不过、保留草稿待人工的章号。 */
  pendingManual: number[]
  /** 运行日志（保留最近 300 条）。 */
  log: Array<{ at: string; text: string }>
  startedAt: string
  updatedAt: string
  error?: string
}

/** POST /run/start request. */
export interface RunStartRequest {
  /** 起始章号（默认 1）。 */
  startNo?: number
  /** 结束章号（含；超出计划时自动补计划）。 */
  endNo?: number
  /** 或指定新增章数（从当前最后一章 +1 起）。 */
  count?: number
}

/** POST /run/control request. */
export interface RunControlRequest {
  action: 'pause' | 'resume' | 'stop'
}

/** POST /load-outline request: either a docx path or raw text. */
export interface LoadOutlineRequest {
  /** Absolute docx path; defaults to the configured outline path. */
  path?: string
  /** Raw outline text (takes precedence over path when present). */
  text?: string
}

/** POST /load-outline response. */
export interface LoadOutlineResponse {
  outline: string
  bookName: string
  chars: number
  path?: string
}

/** POST /plan request. */
export interface PlanRequest {
  /** Outline to plan from; defaults to the persisted project's outline. */
  outline?: string
  /** Number of chapters to plan (default: 30). */
  chapterCount?: number
  /** Volume to plan (1-based); when given, plans only that volume's chapters. */
  volume?: number
}

/** POST /plan response. */
export interface PlanResponse {
  chapters: ChapterPlan[]
  volumes?: Volume[]
}

/** POST /volumes request/response. */
export interface VolumesRequest {
  /** Outline to split into volumes; defaults to the project outline. */
  outline?: string
}
export interface VolumesResponse {
  volumes: Volume[]
}

/** POST /bible request/response. */
export interface BibleRequest {
  /** Outline to extract from; defaults to the project outline. */
  outline?: string
}
export interface BibleResponse {
  bible: StoryBible
}

/** POST /generate request: one chapter of the current project. */
export interface GenerateRequest {
  chapterNo: number
  /** When true, skips the auto-review step. */
  skipReview?: boolean
}

/** One NDJSON frame of a generation/review/rewrite stream. */
export type JobFrame =
  | { type: 'start'; no: number; title: string }
  | { type: 'delta'; text: string }
  | { type: 'progress'; chars: number }
  | { type: 'done'; no: number; file: string; chars: number; title: string; warn?: string }
  | { type: 'review'; no: number; report: ReviewReport }
  | { type: 'author-review'; no: number; review: AuthorReview }
  | { type: 'author-backfill-done'; count: number }
  | { type: 'rewritten'; no: number; file: string; chars: number }
  /** 润色/重写完成，产物作为待确认草稿（尚未覆盖正文）。 */
  | { type: 'drafted'; no: number; chars: number; draft: string }
  | { type: 'outline-progress'; done: number; total: number; phase: string }
  | { type: 'outline-done'; outline: string; chars: number }
  | { type: 'error'; no: number; message: string }

/** POST /review request: review one written chapter. */
export interface ReviewRequest {
  chapterNo: number
}

/** POST /rewrite request: rewrite one chapter (optionally per review issues). */
export interface RewriteRequest {
  chapterNo: number
  /** Free-form instructions; defaults to fixing the review's high issues. */
  instructions?: string
  /**
   * 局部修订：正文中的一段原文（无需完全精确，取一个自然段内的片段即可）。
   * 提供时只重写该段，其余正文保持不变；不提供时整章重写。
   */
  target?: string
}

/** POST /polish request: de-AI-ify one chapter. */
export interface PolishRequest {
  chapterNo: number
}

/** POST /draft/apply | /draft/discard request: 采纳或放弃待确认草稿。 */
export interface DraftDecisionRequest {
  chapterNo: number
  /** apply 时可携带审查报告（沿用结论定状态；不携带则置 written）。 */
  report?: ReviewReport
}

/** POST /summary request: (re)generate a chapter summary. */
export interface SummaryRequest {
  chapterNo: number
}

/** POST /foreshadow request: create, update, or AI-suggest foreshadows. */
export interface ForeshadowRequest {
  /** When true, runs the LLM suggestion pass (ignores other fields). */
  suggest?: boolean
  /** When given, updates that foreshadow instead of creating one. */
  id?: string
  description?: string
  plantedChapter?: number
  targetChapter?: number
  status?: Foreshadow['status']
  resolvedNote?: string
}
export interface ForeshadowResponse {
  foreshadows: Foreshadow[]
}

/** GET /chapter response. */
export interface ChapterResponse {
  no: number
  title: string
  markdown: string
}

/** POST /export request/response. */
export interface ExportRequest {
  format: 'txt' | 'md'
}
export interface ExportResponse {
  file: string
  chars: number
  chapters: number
}

/** POST /config request: patch any subset of the runtime config. */
export interface ConfigPatch {
  outlinePath?: string
  outputDir?: string
  provider?: string
  model?: string
  generateModel?: string
  reviewModel?: string
  auditModel?: string
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  analysisReasoning?: 'off' | 'low' | 'high' | 'max'
  chapterChars?: number
  maxTokens?: number
  reviewPassScore?: number
  autoReview?: boolean
  autoAuthorReview?: boolean
  autoReviewAfterRevise?: boolean
  /** 自定义背景图（URL / dataURL / 服务端路径引用）。 */
  themeBackground?: string
  /** 自定义背景遮罩/模糊强度 0-80。 */
  themeBackgroundBlur?: number
  /** 玻璃透明度 0-100（100=当前原样）。 */
  themeOpacity?: number
  enableAdaptMode?: boolean
  /** 手动添加的模型库（完整替换保存）。 */
  savedModels?: SavedModel[]
}

// ------------------------------------------------------------ assistant

/** One assistant conversation message (persisted per project). */
export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool'
  /** Message text (tool messages carry the tool result). */
  content: string
  /** ISO timestamp. */
  ts: string
  /** For tool messages: which tool ran. */
  tool?: string
}

/** POST /assistant request: one user turn. */
export interface AssistantRequest {
  message: string
}

/** One NDJSON frame of the assistant stream. */
export type AssistantFrame =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'done' | 'error'; detail?: string }
  /** Live output while a tool runs (e.g. chapter text being generated). */
  | { type: 'toolDelta'; name: string; text: string }
  /** 工具完整结果（供前端渲染成结构化卡片，如拆书/导演）。 */
  | { type: 'toolResult'; name: string; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** GET /assistant-history response. */
export interface AssistantHistoryResponse {
  messages: AssistantMessage[]
}

// ---------------------------------------------------------- writing assets

/** 题材基底库：一本书属于哪个阅读市场。树形（题材→子题材→下级）。 */
export interface GenreNode {
  /** 稳定标识（内置库交叉引用）。 */
  id?: string
  /** 题材名称（标签，如「仙侠修真」「都市异能」）。 */
  name: string
  /** 题材特征、常见爽点、叙事重心或读者期待。 */
  description: string
  /** 该题材的写法指引（开书定盘/卷计划用，区别于「读者期待」）。 */
  template?: string
  /** 子题材。 */
  children: GenreNode[]
}

/** 推进模式库：读者为什么继续看下一章。 */
export interface ProgressionMode {
  /** 稳定标识（与内置库交叉引用）。 */
  key?: string
  /** 模式名称（如「升级变强」「经营扩张」「解谜揭露」）。 */
  name: string
  /** 核心驱动力：靠什么制造追读动力。 */
  driver: string
  /** 读者期待：每隔几章获得什么变化或回报。 */
  readerExpectation: string
  /** 常见兑现方式（爽点如何落地）。 */
  payoffs: string[]
  /** 节奏风险：最怕什么（重复升级、冲突变弱、谜题拖太久…）。 */
  risks: string[]
  /** 主模式或辅助模式。 */
  primary: boolean
  /** 该模式的写法指引（开书定盘/卷计划用）。 */
  template?: string
  /** 推进单位序列（每章如何推进，如「立威→打破质疑→扩大影响→碾压」）。 */
  progressionUnits?: string[]
  /** 允许出现的冲突形态。 */
  allowedConflictForms?: string[]
  /** 应避免的冲突形态（跑偏信号）。 */
  forbiddenConflictForms?: string[]
  /** 冲突烈度上限（low/medium/high），用于卷/章计划和审稿对齐。 */
  conflictCeiling?: 'low' | 'medium' | 'high'
  /** 单章推进单位说明。 */
  chapterUnit?: string
  /** 卷末应兑现的回报。 */
  volumeReward?: string
  /** 主驱动必须持续出现的信号（读者期待确认）。 */
  mandatorySignals?: string[]
  /** 反信号：出现即跑偏。 */
  antiSignals?: string[]
  /** 优先用的问题解决方式。 */
  resolutionStyle?: string
}

/** 反 AI 规则：一条「要避免的问题 + 修正方向」。 */
export interface AntiAiRule {
  /** 规则名（如「禁止解释型心理描写」「AI 高频套话」）。 */
  name: string
  /** 稳定标识（与 defaultAntiAiRuleKeys 交叉引用；缺省用 name）。 */
  key?: string
  /** 要避免的表达问题，具体可检查。 */
  avoid: string
  /** 推荐修正方向。 */
  fix: string
  /** 命中即告警的具体表达模式（用于审稿逐条核对与去 AI 味检测）。 */
  detectPatterns?: string[]
  /** 是否内置全局规则（内置规则随插件发布，项目规则为用户自定义）。 */
  builtin?: boolean
  /** 规则类别：forbidden=禁止类（命中即问题）/ risk=风险类（需注意但不硬伤）/ encourage=鼓励类（不命中不算错，只作建议）。 */
  severity?: 'forbidden' | 'risk' | 'encourage'
  /** 问题严重度（用于审稿优先级；缺省按类别推断）。 */
  riskLevel?: 'low' | 'medium' | 'high'
  /** 生成时直接注入的约束指令（缺失时回退到 avoid）。 */
  promptInstruction?: string
  /** 是否允许自动改写（risk 类通常 false）。 */
  autoRewrite?: boolean
  /** 是否为全局基线规则（新书默认启用，防止规则丢失后降级）。 */
  globalBaselineEnabled?: boolean
  /** 是否启用（缺省 true）。 */
  enabled?: boolean
  /** 作用域（缺省 all）。 */
  scope?: Array<'writing' | 'review' | 'polish' | 'all'>
}

/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置数据，一键绑定无需样本文本）。 */
export interface StyleTemplateNarrativeRules {
  progressionMode?: string
  sceneUnitPattern?: string[]
  multiPov?: boolean
  looping?: boolean
  endingStyle?: string
  povSwitchStyle?: string
  summary?: string
}

export interface StyleTemplateCharacterRules {
  allowSelfReflection?: boolean
  emotionExpression?: string
  defenseMechanisms?: string[]
  facePriority?: boolean
  dialogueStyle?: string
  summary?: string
}

export interface StyleTemplateLanguageRules {
  register?: string
  roughness?: number
  allowIncompleteSentences?: boolean
  allowSwearing?: boolean
  sentenceVariation?: string
  allowUselessDetails?: boolean
  summary?: string
}

export interface StyleTemplateRhythmRules {
  pace?: string
  paragraphDensity?: string
  allowFragmentedFlow?: boolean
  actionOverExplanation?: boolean
  summary?: string
}

export interface StyleTemplate {
  /** 模板 key（如 power-up-escalation）。 */
  key: string
  /** 模板名（如「爽文递进推进流」）。 */
  name: string
  /** 模板说明。 */
  description: string
  /** 分类（如「爽文流」「悬疑流」）。 */
  category: string
  /** 适用题材。 */
  applicableGenres: string[]
  /** 标签（便于筛选）。 */
  tags?: string[]
  /** 一句话分析（模板定位说明）。 */
  analysisMarkdown?: string
  /** 叙述规则（结构化）。 */
  narrative?: StyleTemplateNarrativeRules
  /** 角色规则（结构化）。 */
  character?: StyleTemplateCharacterRules
  /** 语言规则（结构化）。 */
  language?: StyleTemplateLanguageRules
  /** 节奏规则（结构化）。 */
  rhythm?: StyleTemplateRhythmRules
  /** 叙述规则（扁平，兼容旧数据）。 */
  proseRules: string[]
  /** 角色/台词规则（扁平，兼容旧数据）。 */
  dialogueRules: string[]
  /** 语言规则（扁平，兼容旧数据）。 */
  languageRules: string[]
  /** 节奏规则（扁平，兼容旧数据）。 */
  rhythmRules: string[]
  /** 该模板默认绑定的反 AI 规则 key（内置规则名）。 */
  defaultAntiAiRuleKeys: string[]
}

/** 起始风格画像：无样本文本也能快速绑定一套写法（对齐上游 DEFAULT_STARTER_STYLE_PROFILES）。 */
export interface StarterStyleProfile {
  /** stable key（如 starter-power-up）。 */
  key: string
  /** 绑定到的写法模板 key。 */
  templateKey: string
  /** 画像名。 */
  name: string
  /** 画像说明。 */
  description: string
}

/** 剧情桥段库：可复用的情节套路/桥段（作者阅读经验沉淀，与书内 Plotline 不同层）。 */
export interface PlotBeatTemplate {
  /** 模板 key（如 face-slap / exit-wedding）。 */
  key: string
  /** 桥段名（如「打脸」「退婚」）。 */
  name: string
  /** 分类（如「装逼打脸」「身份逆袭」）。 */
  category: string
  /** 一句话说明。 */
  summary: string
  /** 适用位置（开局/前期/中期/后期/高潮/结尾）。 */
  position: string
  /** 前置条件。 */
  preconditions: string[]
  /** 爽点来源。 */
  payoffSource: string[]
  /** 常用组合（可搭配的桥段）。 */
  combos: string[]
  /** 禁忌（别用烂/别用死）。 */
  taboos: string[]
  /** 适用题材。 */
  applicableGenres: string[]
}

/** 写法引擎：从样本文本提取的叙事风格资产。 */
export interface StyleAsset {
  /** 资产名（如「林越式痞坏」「冷峻猎手风」）。 */
  name: string
  /** 叙述视角与句式节奏。 */
  proseRules: string[]
  /** 角色台词风格。 */
  dialogueRules: string[]
  /** 描写密度与情绪表达。 */
  descriptionRules: string[]
  /** 表达边界（不要做什么）。 */
  boundaries: string[]
  /** 来源样本文本（可空）。 */
  sourceText?: string
  /** 仿写预设：imitate=高保真仿写 / balanced=平衡 / transfer=迁移（去指纹）。 */
  preset?: 'imitate' | 'balanced' | 'transfer'
  /** 指纹风险：仿写时照搬原作独特表达的风险。 */
  fingerprintRisk?: 'low' | 'medium' | 'high'
  /** 净化后的写作指引（可安全用于生成，去掉了会暴露来源的具体细节）。 */
  writingGuidance?: string[]
  /** 禁止照搬的原作特有实体（人名/地名/核心设定句式），生成时需避开。 */
  forbiddenEntities?: string[]
  /** 创建时间。 */
  createdAt: string
}

/** 写作公式（从样本文本分层提取的"这套文怎么写"浓缩，供生成/改写复用）。 */
export interface StyleFormula {
  /** 稳定 key。 */
  key: string
  /** 公式名。 */
  name: string
  /** 提取深度：basic=骨架 / standard=完整 / deep=逐句细化。 */
  depth: 'basic' | 'standard' | 'deep'
  /** 重点聚焦域（如 开场/对话/节奏/爽点密度）。 */
  focusAreas: string[]
  /** 公式正文（Markdown）。 */
  formula: string
  /** 应用指引（生成/改写时如何套用）。 */
  applyGuidance: string
  /** 创建时间。 */
  createdAt: string
}

/** 项目写作资产（题材基底 + 推进模式 + 反 AI 规则 + 写法资产）。 */
export interface ProjectAssets {
  /** 本书选用的题材（可以是题材基底库中某节点名）。 */
  genre?: GenreNode
  /** 主推进模式。 */
  primaryProgression?: ProgressionMode
  /** 辅助推进模式。 */
  auxiliaryProgressions: ProgressionMode[]
  /** 生效的反 AI 规则（内置 + 自定义）。 */
  antiAiRules: AntiAiRule[]
  /** 绑定的写法资产。 */
  styleAssets: StyleAsset[]
  /** 写作公式（分层提取：basic/standard/deep）。 */
  styleFormulas?: StyleFormula[]
  /** 资产更新时间。 */
  updatedAt?: string
}

/** GET /assets response（含全局题材库与反 AI 规则库）。 */
export interface AssetsResponse {
  projectAssets: ProjectAssets
  /** 全局题材基底库（可复用资产，跨书）。 */
  genreLibrary: GenreNode[]
  /** 全局反 AI 规则库（内置默认规则）。 */
  antiAiLibrary: AntiAiRule[]
  /** 预置写法模板（一键绑定，无需样本文本）。 */
  styleTemplates: StyleTemplate[]
  /** 内置推进模式候选。 */
  progressionLibrary: ProgressionMode[]
  /** 起始风格画像（无样本文本快速绑定写法）。 */
  starterStyleProfiles: StarterStyleProfile[]
  /** 内置剧情桥段库（可复用套路）。 */
  plotBeatLibrary: PlotBeatTemplate[]
}

/** POST /assets request：更新项目写作资产（部分字段可选）。 */
export interface AssetsPatch {
  genre?: GenreNode
  primaryProgression?: ProgressionMode
  auxiliaryProgressions?: ProgressionMode[]
  antiAiRules?: AntiAiRule[]
  styleAssets?: StyleAsset[]
  styleFormulas?: StyleFormula[]
}

/** POST /style-engine request：从样本文本提取写法资产。 */
export interface StyleEngineRequest {
  /** 样本文本（风格来源）。 */
  sampleText: string
  /** 资产名（可选，默认「风格资产 N」）。 */
  name?: string
}

// ---------------------------------------------------------- author assets (总数据)

/** 作者资产库中一条可跨书复用的资产（笔法/红线/套路/角色模板/世界观模板等）。 */
export interface AuthorStyleAsset {
  /** 稳定 id（本地唯一）。 */
  id: string
  /** 资产名（如「短句快节奏爽文风」「林越式痞坏角色」）。 */
  name: string
  /** 资产类型。 */
  kind: 'style' | 'antiAi' | 'progression' | 'genre' | 'roleTemplate' | 'worldTemplate' | 'plotBeat' | 'custom'
  /** 一句话摘要。 */
  summary: string
  /** 资产正文内容（按 kind 约定解读的文本/JSON 描述）。 */
  content: string
  /** 结构化载荷（角色模板/世界观模板等可结构化字段；缺省为 null）。 */
  structured?: Record<string, unknown>
  /** 来源书名（哪本书提炼/收藏而来）。 */
  sourceBooks: string[]
  /** 标签。 */
  tags: string[]
  /** 来源样本文本（可选）。 */
  sourceText?: string
  /** 创建时间。 */
  createdAt: string
  /** 更新时间。 */
  updatedAt: string
}

/** 作者资产库（跨书总数据）：按作者维度聚合的可复用资产。 */
export interface AuthorAssetLibrary {
  /** 货架版本，便于未来迁移。 */
  version: 1
  items: AuthorStyleAsset[]
}

/** GET /author-assets 响应。 */
export interface AuthorAssetsResponse {
  assets: AuthorAssetLibrary
}

/** POST /author-assets/upsert 请求：新增或按 id 更新一条资产。 */
export interface AuthorAssetUpsertRequest {
  asset: AuthorStyleAsset
}

/** POST /author-assets/remove 请求：删除一条资产。 */
export interface AuthorAssetRemoveRequest {
  id: string
}

// ---------------------------------------------------------- adaptation (改编模式)

/** 改编可改范围的单个维度（矩阵的一行）。 */
export interface AdaptationDimension {
  /** 维度 key（如 realm/name/goldenFinger…）。 */
  key: string
  /** 维度名（如「大世界」「修为体系」「主角名」「金手指」）。 */
  title: string
  /** 可改度：保留 / 可改影响大 / 可改影响小 / 可自由改 / 仅视觉包装。 */
  mutability: 'locked' | 'big' | 'small' | 'free' | 'visual'
  /** 原文当前值（从正文提炼，附证据）。 */
  current: string
  /** 该值在正文中的出现证据（章节/频次，可空）。 */
  evidence?: string
  /** AI 建议的候选新值（可空，每套含名称与一句话说明）。 */
  candidates?: Array<{ name: string; desc?: string }>
  /** 联动影响说明（改了会影响哪些章节/角色/伏笔/术语）。 */
  impact: string
  /** 风险评级。 */
  risk: 'high' | 'medium' | 'low'
}

/** POST /adapt/analyze 请求：上传全文做改编分析。 */
export interface AdaptAnalyzeRequest {
  /** 全文文本（优先）。 */
  text: string
  /** 或服务器端全文文件路径。 */
  filePath?: string
}

/** POST /adapt/analyze 响应。 */
export interface AdaptAnalyzeResponse {
  /** 识别书名（文件名推断或正文首行）。 */
  bookName: string
  /** 拆出的章节数。 */
  chapters: number
  /** 反推的初始大纲（可空）。 */
  outline?: string
  /** 可改范围矩阵。 */
  dimensions: AdaptationDimension[]
  /** 分析消耗说明。 */
  note?: string
}

/** 一条改编映射（原值 → 新值）。 */
export interface AdaptationMapping {
  /** 原值（如「林尘」「练气」「青云宗」）。 */
  source: string
  /** 新值（如「楚风」「凝元」「天渊阁」）。 */
  target: string
  /** 适用范围。 */
  scope: 'name' | 'realm' | 'faction' | 'term' | 'other'
  /** 说明（可空）。 */
  note?: string
}

/** 改编规则：哪些必须保留、哪些允许改、一致性约束。 */
export interface AdaptationRules {
  /** 必须保留的要素（骨架/人物动机/伏笔逻辑/爽点结构…）。 */
  preserve: string[]
  /** 允许改变的要素。 */
  change: string[]
  /** 改编红线/一致性要求。 */
  constraints: string[]
}

/** 一组改编方案（映射表 + 规则 + 联动影响清单）。 */
export interface AdaptationProposal {
  /** 映射表（原→新）。 */
  mappings: AdaptationMapping[]
  /** 改编规则。 */
  rules: AdaptationRules
  /** 联动影响清单。 */
  impacts: Array<{ item: string; detail: string; risk: 'high' | 'medium' | 'low'; chapters?: number[] }>
}

/** POST /adapt/propose 请求：由用户勾选的维度 + 新值生成改编方案。 */
export interface AdaptProposeRequest {
  /** 原文全文（复用，便于 LLM 核对联动影响）。 */
  text: string
  /** 用户确认要改的维度（含原值与新值）。 */
  selections: Array<{ key: string; title: string; current: string; target: string; mutability: string }>
  /** 若已分析过，可携带完整矩阵作为上下文。 */
  dimensions?: AdaptationDimension[]
}

/** POST /adapt/propose 响应。 */
export interface AdaptProposeResponse {
  proposal: AdaptationProposal
}

/** POST /adapt/execute 请求：执行改编（replace=术语替换；rewrite=逐章 LLM 重写）。 */
export interface AdaptExecuteRequest {
  /** 原文全文。 */
  text: string
  /** 改编映射表。 */
  mappings: AdaptationMapping[]
  /** 改编规则（rewrite 模式生效：保留/允许变/红线）。 */
  rules?: AdaptationRules
  /** 执行模式：replace（术语替换）或 rewrite（逐章重写）。 */
  mode?: 'replace' | 'rewrite'
  /** rewrite 模式：只重写前 N 章（0/缺省 = 全部，且在 startNo/endNo 窗口内）。 */
  maxChapters?: number
  /** rewrite 模式：起始章号（含，默认 1）。 */
  startNo?: number
  /** rewrite 模式：结束章号（含；0/缺省 = 到全书末尾）。 */
  endNo?: number
}

/** POST /adapt/execute 响应。 */
export interface AdaptExecuteResponse {
  /** 改编后的全文。 */
  adaptedText: string
  /** 执行的映射数。 */
  mappings: number
  /** 命中统计：每条映射的替换次数。 */
  hits: Array<{ source: string; target: string; count: number }>
  /** 执行模式（replace / rewrite）。 */
  mode?: 'replace' | 'rewrite'
  /** rewrite 模式的逐章结果（no/title/chars）。 */
  rewritten?: Array<{ no: number; title: string; chars: number }>
  /** rewrite 模式下重写失败、保留原章的章节号。 */
  skipped?: number[]
}

/** POST /adapt/rewrite-stream 的 NDJSON 帧（逐章进度 + 结束结果）。 */
export type AdaptRewriteFrame =
  | { type: 'progress'; completed: number; total: number; no: number; title: string }
  | { type: 'done'; result: AdaptExecuteResponse }
  | { type: 'error'; message: string }

/** POST /adapt/save 请求：保存改编全文为新书（原书保留，登记书架）。 */
export interface AdaptSaveRequest {
  /** 改编后的全文。 */
  text: string
  /** 新书名（缺省为「改编新书」；建议用「<原著>·改编版」）。 */
  bookName?: string
  /** 新书输出目录（缺省 ~/.dsh/novels/书名）。 */
  outputDir?: string
  /** 可附带反推大纲（写进新项目，便于后续续写/编辑）。 */
  outline?: string
}

/** POST /adapt/save 响应。 */
export interface AdaptSaveResponse {
  /** 登记后的书架条目。 */
  book: BookEntry
  /** 新书名。 */
  bookName: string
  /** 成功拆出的章节数。 */
  chapters: number
  /** 因内容过短被跳过的章节标题列表。 */
  skipped: string[]
  /** 新书输出目录。 */
  outputDir: string
}

/** POST /adapt/materialize 请求：从源全文 + 用户编辑后的改编方案，提炼新书资料并保存为「待写新书」。 */
export interface AdaptMaterializeRequest {
  /** 源书全文。 */
  text: string
  /** 新书名（缺省为「<源书名>·改编版」）。 */
  bookName?: string
  /** 新书输出目录（缺省 ~/.dsh/novels/书名）。 */
  outputDir?: string
  /** 反推大纲（来自分析；缺少时用源文章题兜底）。 */
  outline?: string
  /** 用户编辑后的改编方案（映射表 + 规则）。 */
  proposal: AdaptationProposal
  /** 拟规划章节数（缺省 30，可在前端调整）。 */
  chapterCount?: number
}

/** POST /adapt/materialize 响应：提炼后的新书资料（预览，尚未落盘；保存走 /adapt/materialize-save）。 */
export interface AdaptMaterializeResponse {
  /** 书架条目（仅在已保存时存在；预览阶段为 undefined）。 */
  book?: BookEntry
  /** 新书名。 */
  bookName: string
  /** 改编后总纲。 */
  outline: string
  /** 改编后道藏。 */
  bible: StoryBible
  /** 改编后角色库。 */
  roles: RoleRecord[]
  /** 改编后大世界。 */
  world: WorldState
  /** 改编后卷计划。 */
  volumes: Volume[]
  /** 改编后章节计划（status=pending）。 */
  chapters: ChapterPlan[]
  /** 新书输出目录。 */
  outputDir: string
}

/** POST /adapt/materialize-save 请求：把预览/微调后的新书资料写入并登记书架。 */
export interface AdaptMaterializeSaveRequest {
  /** 新书名（缺省为「改编版」）。 */
  bookName?: string
  /** 新书输出目录（缺省 ~/.dsh/novels/书名）。 */
  outputDir?: string
  /** 改编后总纲。 */
  outline: string
  /** 改编后道藏。 */
  bible: StoryBible
  /** 改编后角色库。 */
  roles: RoleRecord[]
  /** 改编后大世界。 */
  world: WorldState
  /** 改编后卷计划。 */
  volumes: Volume[]
  /** 改编后章节计划（status=pending）。 */
  chapters: ChapterPlan[]
}

/** POST /adapt/materialize-save 响应。 */
export interface AdaptMaterializeSaveResponse {
  /** 登记后的书架条目。 */
  book: BookEntry
  /** 新书名。 */
  bookName: string
  /** 成功写入的章节数。 */
  chapters: number
  /** 新书输出目录。 */
  outputDir: string
}

/** POST /plugin/update 响应：插件自更新结果。 */
export interface PluginUpdateResponse {
  ok: boolean
  /** 更新结果说明（成功/失败/环境提示）。 */
  message: string
}
