/**
 * Browser-side API client for the /api/dsh-novel-forge route family. Plain
 * fetch, same origin; generation/rewrite/polish ride NDJSON streams read
 * incrementally.
 */
import { type AssetsPatch, type AssetsResponse, type BibleResponse, type ChapterResponse, type ConfigPatch, type ExportResponse, type ForeshadowRequest, type ForeshadowResponse, type JobFrame, type LoadOutlineResponse, type NovelConfig, type PlanResponse, type ReviewReport, type StatusResponse, type StyleEngineRequest, type StyleAsset, type VolumesResponse } from '../protocol.ts';
/** Error carrying the route's JSON error message. */
export declare class NovelApiError extends Error {
    constructor(message: string);
}
/** The browser half's only data entry point. */
export declare class NovelApi {
    status(): Promise<StatusResponse>;
    loadOutline(path?: string, text?: string): Promise<LoadOutlineResponse>;
    saveOutline(text: string): Promise<{
        ok: boolean;
        bookName: string;
    }>;
    /** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流）。 */
    outlineReverse(onFrame: (frame: JobFrame) => void): Promise<void>;
    /** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
    storyboardTable(chapterNo: number, skeleton: import('../protocol.ts').StoryboardSkeleton, styleId?: string, filterId?: string): Promise<import('../protocol.ts').StoryboardTableResponse>;
    /** 漫剧方案管理：create / remove / activate。 */
    manhuaPlans(req: import('../protocol.ts').MangaPlansRequest): Promise<import('../protocol.ts').MangaPlansResponse>;
    /** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
    storyboardPrompts(chapterNo: number, table: import('../protocol.ts').StoryboardTable, styleId?: string, filterId?: string): Promise<import('../protocol.ts').StoryboardPromptsResponse>;
    /** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
    storyboardSkeleton(chapterNo: number): Promise<import('../protocol.ts').StoryboardSkeletonResponse>;
    /** 开书想法 → AI 大纲：生成 count 个方案（换批时传 exclude 避开已暂留方向）。 */
    outlineSuggest(idea: string, count?: number, exclude?: string[]): Promise<import('../protocol.ts').OutlineSuggestResponse>;
    /** 拆书分析：对已写章节做结构/人物/文风/卖点体检。 */
    breakdown(scope?: string, preset?: 'quick' | 'standard', budgetTokens?: number): Promise<import('../protocol.ts').BreakdownResponse>;
    plan(outline?: string, chapterCount?: number, volume?: number): Promise<PlanResponse>;
    volumes(outline?: string): Promise<VolumesResponse>;
    bible(outline?: string): Promise<BibleResponse>;
    review(chapterNo: number): Promise<{
        report: ReviewReport;
    }>;
    summarize(chapterNo: number): Promise<{
        summary: string;
    }>;
    foreshadow(req: ForeshadowRequest): Promise<ForeshadowResponse>;
    exportBook(format: 'txt' | 'md'): Promise<ExportResponse>;
    chapter(no: number): Promise<ChapterResponse>;
    /** 审查手动编辑的正文（不落盘）。previousReport 传入时走「验证模式」（核对原意见解决 + 只挑新增 high）。 */
    chapterCheck(no: number, text: string, previousReport?: ReviewReport): Promise<{
        report: ReviewReport;
    }>;
    /** 保存手动编辑的正文（自动备份 .bak；带报告则沿用落盘，否则保存后自动审稿）。 */
    chapterSave(no: number, text: string, report?: ReviewReport): Promise<import('../protocol.ts').ChapterSaveResponse>;
    patchConfig(patch: ConfigPatch): Promise<{
        config: NovelConfig;
    }>;
    openFolder(): Promise<void>;
    /** 书架快照。 */
    bookshelf(): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 新建书并激活（开书向导：可携带大纲文本，创建即建项目）。 */
    bookCreate(bookName: string, outputDir?: string, outline?: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 重置项目（清空进度；可携带新大纲）。 */
    reset(outline?: string): Promise<{
        ok: boolean;
        bookName: string;
    }>;
    /** 全书一致性质检。 */
    audit(): Promise<import('../protocol.ts').AuditResponse>;
    /** 角色卡刷新（基于事实库聚合）。 */
    charactersRefresh(): Promise<{
        cards: import('../protocol.ts').RoleStatusCard[];
    }>;
    /** 事实库回填：对历史已生成章节批量抽取事实。 */
    factsBackfill(): Promise<{
        ok: boolean;
        filled: number;
    }>;
    /** 设定圣经局部修补。 */
    biblePatch(patch: import('../protocol.ts').BiblePatchRequest): Promise<{
        bible: import('../protocol.ts').StoryBible;
    }>;
    /** 剧情线管理：增删改 + 关联章节。 */
    plotlines(req: import('../protocol.ts').PlotlinesRequest): Promise<import('../protocol.ts').PlotlinesResponse>;
    /** 敏感词检查：指定章节 / 任意文本 / 全书。 */
    sensitiveCheck(req: import('../protocol.ts').SensitiveCheckRequest): Promise<import('../protocol.ts').SensitiveCheckResponse>;
    /** 作者复盘补跑：单章（JSON）。 */
    reviewBackfillChapter(no: number): Promise<{
        no: number;
        review: import('../protocol.ts').AuthorReview;
    }>;
    /** 作者复盘补跑：全书缺失章节（NDJSON 流）。 */
    reviewBackfillAll(onFrame: (frame: JobFrame) => void): Promise<void>;
    /** 章节复位：generating 卡死 → pending。 */
    chapterReset(no: number): Promise<{
        ok: boolean;
        no: number;
    }>;
    /** 章节直接通过（作者行使最终决定权）。 */
    chapterApprove(no: number): Promise<{
        ok: boolean;
        no: number;
    }>;
    /** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
    imageTest(req: import('../protocol.ts').ImageTestRequest): Promise<import('../protocol.ts').ImageTestResponse>;
    roles(req: import('../protocol.ts').RolesRequest): Promise<import('../protocol.ts').RolesResponse>;
    /** 漫剧角色库：从分镜提名 / 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
    mangaRoles(req: import('../protocol.ts').MangaRolesRequest): Promise<import('../protocol.ts').MangaRolesResponse>;
    /** 场景库：AI 提炼 / 采纳 / 更新 / 删除 / 图集。 */
    scenes(req: import('../protocol.ts').ScenesRequest): Promise<import('../protocol.ts').ScenesResponse>;
    /** 视觉世界观规则：提炼 / 保存。 */
    visualRules(req: import('../protocol.ts').VisualRulesRequest): Promise<import('../protocol.ts').VisualRulesResponse>;
    /** 小说简介：AI 生成/补全（partial 留空 = 全量），或手动保存。 */
    blurb(action: 'generate' | 'save', text?: string, partial?: string): Promise<{
        blurb: string;
    }>;
    /** 封面：读取（dataUrl；dir 指定某本书的输出目录，省略为当前书）。 */
    coverGet(dir?: string): Promise<import('../protocol.ts').CoverResponse>;
    /** 封面：上传（base64 data URL）或移除。 */
    coverPost(action: 'upload' | 'remove', dataUrl?: string): Promise<{
        ok: boolean;
        coverPath?: string | null;
    }>;
    /** 重命名当前书（同步项目与书架条目）。 */
    rename(bookName: string): Promise<{
        bookName: string;
    }>;
    /** 大世界：AI 提炼（generate）或手动保存（save）。 */
    world(action: 'generate' | 'save', world?: import('../protocol.ts').WorldState): Promise<{
        world: import('../protocol.ts').WorldState;
    }>;
    /** 切换当前书。 */
    bookActivate(id: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 移除书架条目。 */
    bookRemove(id: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 导入已有项目目录（Mode A）：校验 novel-project.json，登记/激活书架。 */
    bookImportDir(outputDir: string): Promise<import('../protocol.ts').BookImportDirResponse>;
    /** 导入 txt/md 全本（Mode B）：服务器本地文件路径模式。 */
    bookImportText(filePath: string, outputDir?: string): Promise<import('../protocol.ts').BookImportTextResponse>;
    /** 拆章预览（浏览器上传全文，不落盘）：返回识别到的章节与跳过清单。 */
    bookImportTextPreview(text: string, fileName?: string): Promise<import('../protocol.ts').BookImportTextPreviewResponse>;
    /** 导入 txt/md 全本（Mode B）：浏览器上传全文内容模式。 */
    bookImportTextContent(text: string, fileName: string, outputDir?: string): Promise<import('../protocol.ts').BookImportTextResponse>;
    /** 生产单：启动批量生产（区间或新增 N 章；计划不足自动补）。 */
    runStart(req: import('../protocol.ts').RunStartRequest): Promise<import('../protocol.ts').RunState>;
    /** 生产单控制：pause / resume / stop。 */
    runControl(action: 'pause' | 'resume' | 'stop'): Promise<import('../protocol.ts').RunState | null>;
    /** 生产单状态（无生产单返回 null）。 */
    runStatus(): Promise<import('../protocol.ts').RunState | null>;
    /** Get project writing assets + built-in libraries. */
    assets(): Promise<AssetsResponse>;
    /** Patch project writing assets. */
    patchAssets(patch: AssetsPatch): Promise<AssetsResponse>;
    /** Extract a style asset from sample text. */
    styleEngine(req: StyleEngineRequest): Promise<{
        styleAsset: StyleAsset;
    }>;
    /**
     * Consume an NDJSON job stream (generate / rewrite / polish).
     * @param path - the route to POST to.
     * @param payload - the JSON body.
     * @param onFrame - receives every frame as it lands.
     */
    private streamJob;
    /** Generate one chapter. */
    generate(chapterNo: number, skipReview: boolean, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** Rewrite one chapter (whole-chapter, or local when `target` is given). */
    rewrite(chapterNo: number, instructions: string, target: string, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** Polish (de-AI-ify) one chapter. */
    polish(chapterNo: number, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** 采纳待确认草稿（润色/重写产物），覆盖正文文件。返回采纳后的新正文（markdown）。
     *  可携带审查报告（沿用结论定状态：通过 → approved）。 */
    draftApply(chapterNo: number, report?: import('../protocol.ts').ReviewReport): Promise<{
        ok: boolean;
        chars: number;
        file: string;
        markdown: string;
    }>;
    /** 放弃待确认草稿，保留原稿。 */
    draftDiscard(chapterNo: number): Promise<{
        ok: boolean;
    }>;
    /** Run one assistant turn (NDJSON stream). */
    assistant(message: string, onFrame: (frame: import('../protocol.ts').AssistantFrame) => void): Promise<void>;
    /** Load the persisted assistant conversation. */
    assistantHistory(): Promise<import('../protocol.ts').AssistantMessage[]>;
    /** 清空助手对话记录。 */
    assistantClear(): Promise<{
        ok: boolean;
    }>;
    /** 作者资产库/总数据：读取跨书可复用资产。 */
    authorAssets(): Promise<import('../protocol.ts').AuthorAssetsResponse>;
    /** 作者资产库：新增/更新一条资产（upsert by id）。 */
    authorAssetsUpsert(asset: import('../protocol.ts').AuthorStyleAsset): Promise<import('../protocol.ts').AuthorAssetsResponse>;
    /** 作者资产库：删除一条资产。 */
    authorAssetsRemove(id: string): Promise<import('../protocol.ts').AuthorAssetsResponse>;
    /** 作者资产库：导入默认（书架书的写作资产/角色 + 内置全局库）批量沉淀。 */
    authorAssetsImportDefault(): Promise<import('../protocol.ts').AuthorAssetsResponse>;
    /** 改编模式 P0：上传全文 → 原文设定卡片 / 可改范围矩阵。 */
    adaptAnalyze(text: string, filePath?: string): Promise<import('../protocol.ts').AdaptAnalyzeResponse>;
    /** 改编模式 P1：确认要改的维度 → 生成映射表/改编规则/联动影响清单。 */
    adaptPropose(req: import('../protocol.ts').AdaptProposeRequest): Promise<import('../protocol.ts').AdaptProposeResponse>;
    /** 改编模式 P2：执行术语替换（全局替换 + 命中统计 + 改编文本预览）。 */
    adaptExecute(req: import('../protocol.ts').AdaptExecuteRequest): Promise<import('../protocol.ts').AdaptExecuteResponse>;
    /** 主题自定义背景：上传图片，服务端存盘并返回可访问 URL。 */
    themeBackgroundUpload(dataUrl: string): Promise<{
        url: string;
    }>;
}
