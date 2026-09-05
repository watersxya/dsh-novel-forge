/**
 * Novel engine — the host half's core: LLM-driven story-bible extraction,
 * volume planning, chapter planning, chapter-by-chapter writing with
 * auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
 * tracking, project persistence, and whole-book export. Pure Node (no
 * web-server dependencies), so routes stay thin and logic is testable.
 */
/**
 * 内容合规红线（平台硬性要求）：所有书籍、所有章节无条件生效，
 * 优先级高于单书大纲/道藏中的任何设定与作者自定义红线。
 * 注入点：章节生成系统提示 + 审稿系统提示（命中即 high）。
 */
export declare const COMPLIANCE_REDLINES: ReadonlyArray<string>;
import type { Context } from '@deepseek-ai/cordis';
import type { AdaptationDimension, AdaptAnalyzeResponse, AdaptationMapping, AdaptationRules, AdaptProposeResponse, AuditIssue, AuthorReview, BreakdownResponse, ChapterPlan, Foreshadow, NovelConfig, OutlineCandidate, Plotline, PlotlineHealthReport, PlotlinePlan, ProjectState, ReviewReport, RoleRecord, RoleStatusCard, SceneCard, StoryBible, StoryboardSkeleton, StoryboardTable, StoryboardPrompt, AddModelRequest, AddModelResponse, LlmModelsResponse, LlmVendorsResponse, LlmProvidersResponse, RemoveProviderRequest, RemoveProviderResponse, LlmTestResponse, MangaRoleCandidate, Prop, Volume, WorldState, AdaptMaterializeRequest, AdaptMaterializeResponse, AdaptMaterializeSaveRequest, AdaptMaterializeSaveResponse } from './protocol.ts';
/** Project state file name inside the output dir. */
export declare const PROJECT_FILE = "novel-project.json";
/** Chapter output file name, e.g. 第001章_开篇.md */
export declare function chapterFileName(chapter: ChapterPlan): string;
/** Infer a book name from the outline's first non-empty line. */
export declare function inferBookName(outline: string): string;
/** Read the persisted project from the output dir (undefined when absent). */
export declare function loadProject(outputDir: string): ProjectState | undefined;
/** Persist the project state next to the chapters. */
export declare function saveProject(outputDir: string, project: ProjectState): void;
/**
 * 并发保护：长任务（章节计划生成/正文生成）在内存中持有旧快照，
 * 期间其他请求可能修改了「易变字段」（道藏/角色库/剧情线/人物志存档/简介/封面）。
 * 保存前用磁盘最新版本合并这些字段，避免旧快照覆盖新修改（曾导致角色卡丢失）。
 * 注意：调用方若自己修改了这些字段，不要使用本函数。
 */
export declare function mergeVolatileFromDisk(outputDir: string, project: ProjectState): void;
/** 对一段文本做违禁词硬匹配，返回命中（词/类别/次数）。 */
export declare function checkSensitiveText(text: string): Array<{
    word: string;
    category: string;
    count: number;
}>;
/** List generated chapter files in the output dir (sorted). */
export declare function listChapterFiles(outputDir: string): string[];
/** Re-sync chapter status against files on disk (a file may exist without state). */
export declare function syncProjectWithDisk(project: ProjectState, outputDir: string): void;
/** Read a chapter's markdown body from disk (undefined when missing). */
export declare function readChapterFile(outputDir: string, chapter: ChapterPlan): string | undefined;
/** Create a fresh project from an outline. */
export declare function createProject(outline: string, outlinePath?: string): ProjectState;
/** Extract the story bible from an outline. */
export declare function extractBible(ctx: Context, config: NovelConfig, outline: string, project?: ProjectState): Promise<StoryBible>;
/** Plan volumes from an outline. */
export declare function planVolumes(ctx: Context, config: NovelConfig, outline: string): Promise<Volume[]>;
/**
 * Plan chapters from an outline (optionally for one volume).
 */
export declare function planChapters(ctx: Context, config: NovelConfig, project: ProjectState, chapterCount: number, volumeNo?: number, outputDir?: string): Promise<ChapterPlan[]>;
/** Run the AI review on one chapter. */
export declare function reviewChapter(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<ReviewReport>;
/**
 * 审查「任意正文文本」（作者手动编辑后的草稿，不落盘）。
 * 复用审稿提示词与红线/道藏/反AI规则；仅返回报告，不改文件不改状态。
 */
export declare function reviewChapterText(ctx: Context, config: NovelConfig, project: ProjectState, text: string, previousReport?: ReviewReport): Promise<ReviewReport>;
/** 作者复盘：对一章做叙事结构复盘（钩子兑现/结尾钩子/推进/连续性/趋势）。 */
export declare function authorReviewChapter(ctx: Context, config: NovelConfig, project: ProjectState, chapterNo: number, body: string, prevTail: string): Promise<AuthorReview>;
/** 复盘后自动关联：把本章号写入复盘标记推进的剧情线（按名称匹配，去重）。 */
export declare function autoLinkPlotlines(project: ProjectState, chapterNo: number, advancedLines: string[]): void;
/** AI 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
export declare function suggestPlotlines(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Plotline[]>;
/** AI 刷新单条剧情线的进度：结合编年录与各章摘要分析该线推进到哪。 */
export declare function refreshPlotlineProgress(ctx: Context, config: NovelConfig, project: ProjectState, line: Plotline): Promise<string>;
/** ✨ AI 从全书提炼角色库：大纲 + 道藏 + 编年录 + 章节摘要 → 结构化角色清单。 */
export declare function extractRoles(ctx: Context, config: NovelConfig, project: ProjectState): Promise<RoleRecord[]>;
/** ✨ AI 从全书提炼场景库：正文/编年录 → 高频重要场景的结构化视觉锚点。 */
export declare function extractScenes(ctx: Context, config: NovelConfig, project: ProjectState, chapterNo?: number, styleId?: string, filterId?: string): Promise<SceneCard[]>;
/** 从 txt/md 全本文本拆章（纯逻辑，不落盘）：识别章节头、剥离重复标题、去重、排序并统一重新编号。 */
export declare function splitBookText(raw: string): Array<{
    no: number;
    title: string;
    body: string;
}>;
/** 拆章预览（不落盘）：章节编号/标题/字数 + 跳过清单。 */
export declare function previewBookText(raw: string): {
    chapters: Array<{
        no: number;
        title: string;
        chars: number;
    }>;
    skipped: string[];
};
/** 从全本文本导入（浏览器上传 / 服务器文件共用）：建项目、写章节文件、保存。 */
export declare function importBookTextFromText(raw: string, outputDir: string, bookName: string): {
    bookName: string;
    chapters: number;
    skipped: string[];
};
/** 从 txt/md 全本文件导入：编码自适应读取后拆章建项目，status=written（待审稿）。 */
export declare function importBookText(filePath: string, outputDir: string): {
    bookName: string;
    chapters: number;
    skipped: string[];
};
/** 动漫形象描述词（中文描述 + 英文 booru 标签 + 关键外貌标签）。 */
export interface RoleVisualPrompt {
    zh: string;
    en: string;
    tags: string[];
    source: string;
    /** 即梦/生图通用负面提示词。 */
    negativePrompt?: string;
    /** 该角色所需情绪表情清单（6-12 个，如 疲惫/麻木/压抑悲伤）。 */
    expressions?: string[];
    /** 四类精修提示词（立绘/四视图/表情/细节，一次提炼直接产出）。 */
    promptKit?: RoleRecord['promptKit'];
}
/** 小说角色库：提炼单个角色的形象锚点并写回角色卡。 */
export declare function extractRoleVisual(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, roleName: string, styleId?: string, filterId?: string): Promise<RoleVisualPrompt>;
/** 漫剧角色卡：提炼形象锚点并写回漫剧卡（status → anchored）。 */
export declare function extractMangaRoleVisual(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, cardId: string, styleId?: string, filterId?: string): Promise<RoleVisualPrompt>;
/** 小说角色库：角色四类生图提示词精修包（写回角色卡）。 */
export declare function generateRolePromptKit(ctx: Context, config: NovelConfig, project: ProjectState, roleName: string, styleId?: string, filterId?: string): Promise<RoleRecord['promptKit']>;
/** 漫剧角色卡：四类生图提示词精修包（写回漫剧卡，status → anchored）。 */
export declare function generateMangaRolePromptKit(ctx: Context, config: NovelConfig, project: ProjectState, cardId: string, styleId?: string, filterId?: string): Promise<RoleRecord['promptKit']>;
/**
 * 漫剧角色库·提名（两段式）：从某章分镜的 characters 提名候选角色名 →
 * 规则过滤（精确名 + 身份/简称匹配，短名单 ≤5）→ LLM 确认（是/否 + 选哪个，不做开放检索）→
 * 返回带漫剧卡建议的候选（未匹配时给出「回小说库补提炼 / 漫剧直接创建」判定）。
 */
export declare function nominateMangaRoles(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<MangaRoleCandidate[]>;
/** ✨ 从道藏/红线提炼「视觉世界观规则」：生图/生视频必须遵守的设定纠偏（如"商品=人，禁止常规超市商品"）。 */
export declare function extractVisualRules(ctx: Context, config: NovelConfig, project: ProjectState): Promise<string[]>;
/**
 * 开书想法 → AI 大纲：输入一句话想法，生成 2-3 个方向不同、可直接开书的完整大纲方案。
 * @param count 本次生成几个（默认 3，最多 3）
 * @param exclude 已暂留方案的剧情方向/卖点摘要（换批时避开，防止重复）
 */
export declare function suggestOutlines(ctx: Context, config: NovelConfig, idea: string, count?: number, exclude?: string[]): Promise<OutlineCandidate[]>;
/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检。
 *  两阶段管道（借鉴 AI-Novel-Writing-Assistant）：
 *  ① 源片段笔记：每章抽取结构化笔记（剧情/人物/设定/写法/卖点/短板信号）
 *  ② 分节分析：按维度各跑一次 LLM，输出可读分析稿 + 结构化数据 + 证据链。
 *  @param scope 'recent'(默认最近20章) | 'volume:N' | 'all'
 *  @param preset 'quick'(总览/剧情/人物/文风) | 'standard'(+卖点)
 *  @param budgetTokens token 预算上限（超过即截断章节取样）。
 */
export declare function breakdownBook(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, scope?: string, preset?: 'quick' | 'standard', budgetTokens?: number): Promise<BreakdownResponse>;
/** 对选中的提供商/模型发一次最小真实调用（maxTokens=16），验证 Key / 端点 / 模型可用。 */
export declare function testLlmModel(ctx: Context, provider: string, model: string): Promise<LlmTestResponse>;
/** 运行时厂商目录：DSH pi-ai 可配置提供方 + 内置适配器，作为「添加模型」下拉。 */
export declare function listLlmVendors(ctx: Context): Promise<LlmVendorsResponse>;
/** 查询某个 provider 当前可用模型（添加成功后可即时刷新下拉）。 */
export declare function listLlmModels(ctx: Context, provider: string): Promise<LlmModelsResponse>;
/** 当前已注册的提供方路由列表（提供方管理卡片）。 */
export declare function listLlmProviders(ctx: Context): Promise<LlmProvidersResponse>;
/** 移除一个提供方：unset 凭据 ref + 移除 llm-pi-ai providers 路由。 */
export declare function removeLlmProvider(ctx: Context, req: RemoveProviderRequest): Promise<RemoveProviderResponse>;
/**
 * 添加模型（DSH 同款体验）：厂商直填 API Key，或自定义 OpenAI 兼容路由。
 * 写入 DSH 凭据 refs，并（必要时）注册/更新 llm-pi-ai provider 路由。
 */
export declare function registerLlmModel(ctx: Context, req: AddModelRequest): Promise<AddModelResponse>;
/** 获取当前激活漫剧方案的风格（styleId + filterId），用于生图/提示词兜底。 */
export declare function getActiveMangaStyle(project: ProjectState): {
    styleId?: string;
    filterId?: string;
};
/** 🩺 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
export declare function analyzePlotlineHealth(ctx: Context, config: NovelConfig, project: ProjectState): Promise<PlotlineHealthReport>;
/** ✨ AI 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
export declare function designPlotlinePlan(ctx: Context, config: NovelConfig, project: ProjectState, health?: PlotlineHealthReport): Promise<PlotlinePlan>;
/**
 * Stream a chapter rewrite. With `target` (a passage of the body), only that
 * passage's paragraph is rewritten and spliced back — everything else stays
 * untouched (local revision). Without `target`, the whole chapter is
 * rewritten. Yields delta text; persists when done.
 */
export declare function rewriteChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number, instructions: string, target?: string): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'drafted';
    chars: number;
    draft: string;
}, void, unknown>;
/** Stream a chapter polish (de-AI-ify). Draft-mode: the polished body lands
 *  in `chapter.pendingDraft` and is only applied on draft/apply. */
export declare function polishChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'drafted';
    chars: number;
    draft: string;
}, void, unknown>;
/** Generate one chapter (streaming). Yields progress frames; persists when done. */
export declare function generateChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'done';
    file: string;
    chars: number;
    warn?: string;
}, void, unknown>;
/** Generate a chapter summary (narrative memory). */
export declare function summarizeChapter(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<string>;
/**
 * 分镜·导演级：剧情骨架 → 分镜表（镜头级）。
 * 只做画面层：景别/机位运镜/时长/画面/台词/音效/光效 + 状态连续；禁止改剧情（骨架只读）。
 */
export declare function generateStoryboardTable(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number, skeleton: StoryboardSkeleton, styleId?: string, filterId?: string): Promise<StoryboardTable>;
/**
 * 提炼常驻道具（跨镜头需一致）：从已写章节正文识别反复出现的关键道具 + 一行统一外观描述。
 * 生成分镜提示词前自动调用，若道具库为空则补齐；道具库存 project.props，注入提示词保持跨镜头一致。
 */
export declare function extractProps(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Prop[]>;
/**
 * 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。
 * 每镜头一段：风格词块（基底+滤镜）+ 画面内容（角色动作/服装标志物）+ 机位运镜 + 光效。
 * 提示词聚焦画面与镜头（视频模型无音频，台词/音效不注入）。
 */
export declare function generateStoryboardPrompts(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number, table: StoryboardTable, styleId?: string, filterId?: string): Promise<StoryboardPrompt[]>;
/**
 * 分镜·编剧级：单章 → 剧情骨架（节拍链）。
 * 只做故事层（事件/情绪/功能/因果），不做画面；导演级分镜在其上展开。
 */
export declare function generateStoryboardSkeleton(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<StoryboardSkeleton>;
/**
 * 反向推大纲：从已写章节正文反推出全书总纲（分卷 + 章节要点 + 主线/人物弧线/伏笔清单）。
 * 两阶段：分批提取章节事件摘要 → 汇总生成大纲。不修改章节/设定，只返回大纲文本。
 */
export declare function reverseOutlineFromChapters(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, onProgress?: (done: number, total: number, phase: string) => void): Promise<string>;
/**
 * 改编模式 P0：全文分析 → 原文设定卡片 / 可改范围矩阵。
 * 拆章统计 + 取样正文，让 LLM 一次输出结构化 JSON：
 * { bookName, outline, dimensions: [{key,title,mutability,current,evidence,candidates,impact,risk}] }。
 */
export declare function analyzeAdaptation(ctx: Context, config: NovelConfig, text: string): Promise<AdaptAnalyzeResponse>;
/** 改编方案：由用户勾选的维度与新值，生成 LLM 映射表/规则/影响清单。 */
export declare function proposeAdaptation(ctx: Context, config: NovelConfig, text: string, selections: Array<{
    key: string;
    title: string;
    current: string;
    target: string;
    mutability: string;
}>, dimensions?: AdaptationDimension[]): Promise<AdaptProposeResponse>;
/** 剧本术语替换执行：按映射表做精确替换并统计命中。 */
export declare function applyAdaptationReplacements(text: string, mappings: AdaptationMapping[]): {
    adaptedText: string;
    hits: Array<{
        source: string;
        target: string;
        count: number;
    }>;
};
/** 改编模式 rewrite：逐章 LLM 重写（结构性改写，不只是换词）。
 * @returns 改写后的全文 + 逐章结果 + 保留原章的章号。 */
export declare function rewriteAdaptationBook(ctx: Context, config: NovelConfig, text: string, mappings: AdaptationMapping[], rules?: AdaptationRules, options?: {
    maxChapters?: number;
    startNo?: number;
    endNo?: number;
    onProgress?: (info: {
        completed: number;
        total: number;
        no: number;
        title: string;
    }) => void;
}): Promise<{
    adaptedText: string;
    rewritten: Array<{
        no: number;
        title: string;
        chars: number;
    }>;
    skipped: number[];
    hits: Array<{
        source: string;
        target: string;
        count: number;
    }>;
}>;
/**
 * 改编模式 P3：从源全文 + 用户编辑后的改编方案，提炼新书资料并保存为「待写新书」。
 * 流程：源文导入临时项目 → 复用 extractBible/extractRoles/extractWorld 提炼 →
 * 按映射表把术语/人名/势力映射到新书命名层 → planVolumes/planChapters 生成待写计划 → 保存。
 * @returns 提炼后的新书资料（不含书架 book，由路由负责登记书架）。
 */
export declare function materializeAdaptedBook(ctx: Context, config: NovelConfig, args: Omit<AdaptMaterializeRequest, 'outputDir'> & {
    outputDir: string;
}): Promise<Omit<AdaptMaterializeResponse, 'book'>>;
/** 把预览/微调后的新书资料写入输出目录并返回摘要（书架登记由路由负责）。 */
export declare function saveMaterializedBook(outDir: string, bookName: string, data: Omit<AdaptMaterializeSaveRequest, 'bookName' | 'outputDir'>): Omit<AdaptMaterializeSaveResponse, 'book'>;
export declare function summarizeAndExtractFacts(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<{
    summary: string;
    factCount: number;
}>;
/**
 * 伏笔落地标记：检查刚生成的章节正文是否埋下了 planned 伏笔（关键词匹配），
 * 命中则将该伏笔标记为 planted 并记录 plantedChapter——保证暗线管理页与正文同步。
 * 纯关键词粗匹配，宁缺毋滥：仅处理「描述含可辨识关键词」的伏笔，无把握则不标。
 */
export declare function markForeshadowPlanted(project: ProjectState, outputDir: string, chapterNo: number): number;
/**
 * 抽取本章「已确立事实」追加到事实库/时间线（最多 300 条，最新优先）。
 * 事实注入后续章节生成提示词，保证人物状态/境界/资源/关系长期一致。
 * @returns 新增事实条数（失败返回 0，调用方 best-effort）。
 */
export declare function extractFacts(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<number>;
/** 全书一致性质检：LLM 分批扫描已生成章节 + 设定 + 事实库，聚合矛盾清单。 */
export declare function auditBook(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, onProgress?: (completedBatches: number, totalBatches: number) => void): Promise<AuditIssue[]>;
/** 小说简介：AI 生成或按已写开头补全（面向读者的作品门面）。 */
export declare function generateBlurb(ctx: Context, config: NovelConfig, project: ProjectState, partial?: string): Promise<string>;
/**
 * 组装全书上下文包（AI 助手 book_overview 工具）。
 * 分片策略：章节要点默认只给最近 30 章（避免超长后爆上下文）；
 * scope='full' 全量；scope=数字 只给该卷章节。
 */
export declare function bookOverview(project: ProjectState, scope?: 'recent' | 'full' | number): string;
/** 一条影响分析结果（改动波及处）。 */
export interface ImpactItem {
    /** 位置：章节号 / 大纲 / 道藏 / 大世界 / 事实库 / 简介。 */
    location: string;
    /** 原文片段（定位用）。 */
    quote: string;
    /** 修改建议。 */
    suggestion: string;
    /** must = 必须同步改；optional = 建议改；note = 备注（如保留旧称作古称）。 */
    kind: 'must' | 'optional' | 'note';
}
/**
 * 影响分析：LLM 扫描全书（大纲/设定/大世界/事实库/已写章节），
 * 定位一次改动波及的所有位置。助手在修改后主动调用，做连锁维护。
 */
export declare function analyzeImpact(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, change: string): Promise<ImpactItem[]>;
/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
export declare function renderWorld(world: WorldState | undefined): string;
/** AI 提炼大世界：从大纲 + 道藏生成结构化境界体系/区域/势力。 */
export declare function extractWorld(ctx: Context, config: NovelConfig, project: ProjectState): Promise<WorldState>;
/**
 * 事实库回填：对历史已生成章节批量抽取事实（无事实记录的旧章节）。
 * @returns 回填的章节数。
 */
export declare function backfillFacts(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string): Promise<number>;
/**
 * 角色卡刷新：出场统计由服务端从正文精确计算（角色名出现过的章节数、
 * 最近出现章节），LLM 只负责聚合「当前状态」一句话。
 */
export declare function refreshCharacters(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string): Promise<RoleStatusCard[]>;
/** Suggest foreshadows from the outline + plan. */
export declare function suggestForeshadows(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Foreshadow[]>;
/**
 * 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
 * @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
 */
export declare function extractStyleAsset(ctx: Context, config: NovelConfig, sampleText: string): Promise<{
    proseRules: string[];
    dialogueRules: string[];
    descriptionRules: string[];
    boundaries: string[];
}>;
/** Export the whole book as one txt/md file. */
export declare function exportBook(outputDir: string, project: ProjectState, format: 'txt' | 'md'): {
    file: string;
    chars: number;
    chapters: number;
};
/** 漫剧资产库根目录：outputDir/manga-assets */
export declare function mangaAssetsDir(outputDir: string): string;
/** 保存角色定妆图到资产库：manga-assets/角色/角色名/标签.png */
export declare function saveMangaRoleImage(outputDir: string, roleName: string, label: string, dataUrl: string): string;
/** 保存角色提示词到资产库：manga-assets/角色/角色名/提示词.txt */
export declare function saveMangaRolePrompt(outputDir: string, roleName: string, zh: string, en: string, negative?: string): string;
/** 保存场景底图到资产库：manga-assets/场景/场景名.png */
export declare function saveMangaSceneImage(outputDir: string, sceneName: string, label: string, dataUrl: string): string;
/** 保存分镜即梦脚本到资产库：manga-assets/分镜脚本/第N章-标题.md */
export declare function saveMangaStoryboardScript(outputDir: string, chapterNo: number, title: string, markdown: string): string;
/** 保存「即梦素材包」到资产库：manga-assets/素材包/第N章-标题·即梦素材包.md */
export declare function saveMangaAssetPackage(outputDir: string, chapterNo: number, title: string, markdown: string): string;
/** 保存场景中文生图提示词到资产库：manga-assets/场景/场景名/提示词.txt */
export declare function saveMangaScenePrompt(outputDir: string, sceneName: string, zh: string, negative?: string): string;
/** 保存逐镜即梦提示词到资产库：manga-assets/分镜脚本/第N章-标题-提示词.md */
export declare function saveMangaChapterPrompts(outputDir: string, chapterNo: number, title: string, markdown: string): string;
export interface AutoGenerateResult {
    chapterNo: number;
    skeletonBeats: number;
    shotCount: number;
    promptCount: number;
    importedRoles: number;
    needMakeupRoles: number;
    extraRoles: number;
    pendingCandidates: number;
    pendingRoleNames: string[];
}
/**
 * 一键生成：骨架 → 分镜表 → 角色提名 → 自动导入（匹配成功的）→ 自动分级 → 视频提示词。
 * 匹配模糊/小说库缺失的角色保留在候选列表，不自动导入。
 */
export declare function autoGenerateMangaChapter(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number, styleId?: string, filterId?: string): Promise<AutoGenerateResult>;
