/**
 * Browser-side API client for the /api/dsh-novel-forge route family. Plain
 * fetch, same origin; generation/rewrite/polish ride NDJSON streams read
 * incrementally.
 */

import {
  NOVEL_API,
  type AssetsPatch,
  type AssetsResponse,
  type AddModelRequest,
  type AddModelResponse,
  type LlmModelsResponse,
  type LlmProvidersResponse,
  type LlmVendorsResponse,
  type RemoveProviderRequest,
  type RemoveProviderResponse,
  type BibleResponse,
  type ChapterResponse,
  type ConfigPatch,
  type ExportResponse,
  type ForeshadowRequest,
  type ForeshadowResponse,
  type JobFrame,
  type LoadOutlineResponse,
  type AdaptExecuteRequest,
  type AdaptExecuteResponse,
  type AdaptRewriteFrame,
  type AdaptMaterializeSaveRequest,
  type AdaptMaterializeSaveResponse,
  type PluginUpdateResponse,
  type LlmTestResponse,
  type NovelConfig,
  type PlanResponse,
  type ReviewReport,
  type StatusResponse,
  type StyleEngineRequest,
  type StyleAsset,
  type VolumesResponse,
} from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class NovelApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NovelApiError'
  }
}

/** Parse a JSON response or throw a NovelApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new NovelApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${response.status}`
    throw new NovelApiError(message)
  }
  return body as T
}

/** 面板所绑定的当前书（打开时锁定；每次书级请求带上，避免被全局 active 串书）。 */
let currentBookId: string | null = null
export function setCurrentBook(id: string | null): void {
  currentBookId = id
}

/** 给 GET 路径追加当前书 bookId（读接口也按书路由）。 */
function withBookId(path: string): string {
  if (currentBookId === null) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}bookId=${encodeURIComponent(currentBookId)}`
}

/** POST JSON, return parsed JSON. 若已绑定当前书，自动把 bookId 注入请求体。 */
async function postJson<T>(path: string, payload: unknown): Promise<T> {
  let body = payload
  if (currentBookId !== null && payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    body = { ...(payload as Record<string, unknown>), bookId: currentBookId }
  }
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readJson<T>(response)
}

/** The browser half's only data entry point. */
export class NovelApi {
  async status(): Promise<StatusResponse> {
    const response = await fetch(withBookId(NOVEL_API.status))
    return readJson<StatusResponse>(response)
  }

  async loadOutline(path?: string, text?: string): Promise<LoadOutlineResponse> {
    return postJson<LoadOutlineResponse>(NOVEL_API.loadOutline, { path, text })
  }

  async saveOutline(text: string): Promise<{ ok: boolean; bookName: string }> {
    return postJson<{ ok: boolean; bookName: string }>(NOVEL_API.saveOutline, { text })
  }

  /** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流）。 */
  async outlineReverse(onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.outlineReverse, {}, onFrame)
  }

  /** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
  async storyboardTable(chapterNo: number, skeleton: import('../protocol.ts').StoryboardSkeleton, styleId?: string, filterId?: string): Promise<import('../protocol.ts').StoryboardTableResponse> {
    return postJson<import('../protocol.ts').StoryboardTableResponse>(NOVEL_API.storyboardTable, { chapterNo, skeleton, styleId, filterId })
  }

  /** 漫剧方案管理：create / remove / activate。 */
  async manhuaPlans(req: import('../protocol.ts').MangaPlansRequest): Promise<import('../protocol.ts').MangaPlansResponse> {
    return postJson<import('../protocol.ts').MangaPlansResponse>(NOVEL_API.manhuaPlans, req)
  }

  /** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
  async storyboardPrompts(chapterNo: number, table: import('../protocol.ts').StoryboardTable, styleId?: string, filterId?: string): Promise<import('../protocol.ts').StoryboardPromptsResponse> {
    return postJson<import('../protocol.ts').StoryboardPromptsResponse>(NOVEL_API.storyboardPrompts, { chapterNo, table, styleId, filterId })
  }

  /** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
  async storyboardSkeleton(chapterNo: number): Promise<import('../protocol.ts').StoryboardSkeletonResponse> {
    return postJson<import('../protocol.ts').StoryboardSkeletonResponse>(NOVEL_API.storyboardSkeleton, { chapterNo })
  }

  /** 开书想法 → AI 大纲：生成 count 个方案（换批时传 exclude 避开已暂留方向）。 */
  async outlineSuggest(idea: string, count?: number, exclude?: string[]): Promise<import('../protocol.ts').OutlineSuggestResponse> {
    return postJson<import('../protocol.ts').OutlineSuggestResponse>(NOVEL_API.outlineSuggest, { idea, count, exclude })
  }

  /** 拆书分析：对已写章节做结构/人物/文风/卖点体检。 */
  async breakdown(scope?: string, preset?: 'quick' | 'standard', budgetTokens?: number): Promise<import('../protocol.ts').BreakdownResponse> {
    return postJson<import('../protocol.ts').BreakdownResponse>(NOVEL_API.breakdown, { scope, preset, budgetTokens })
  }

  async plan(outline?: string, chapterCount?: number, volume?: number): Promise<PlanResponse> {
    return postJson<PlanResponse>(NOVEL_API.plan, { outline, chapterCount, volume })
  }

  async volumes(outline?: string): Promise<VolumesResponse> {
    return postJson<VolumesResponse>(NOVEL_API.volumes, { outline })
  }

  async bible(outline?: string): Promise<BibleResponse> {
    return postJson<BibleResponse>(NOVEL_API.bible, { outline })
  }

  async review(chapterNo: number): Promise<{ report: ReviewReport }> {
    return postJson<{ report: ReviewReport }>(NOVEL_API.review, { chapterNo })
  }

  async summarize(chapterNo: number): Promise<{ summary: string }> {
    return postJson<{ summary: string }>(NOVEL_API.summary, { chapterNo })
  }

  async foreshadow(req: ForeshadowRequest): Promise<ForeshadowResponse> {
    return postJson<ForeshadowResponse>(NOVEL_API.foreshadow, req)
  }

  async exportBook(format: 'txt' | 'md'): Promise<ExportResponse> {
    return postJson<ExportResponse>(NOVEL_API.exportBook, { format })
  }

  async chapter(no: number): Promise<ChapterResponse> {
    const response = await fetch(withBookId(`${NOVEL_API.chapter}?no=${no}`))
    return readJson<ChapterResponse>(response)
  }

  /** 审查手动编辑的正文（不落盘）。previousReport 传入时走「验证模式」（核对原意见解决 + 只挑新增 high）。 */
  async chapterCheck(no: number, text: string, previousReport?: ReviewReport): Promise<{ report: ReviewReport }> {
    return postJson<{ report: ReviewReport }>(NOVEL_API.chapterCheck, { chapterNo: no, text, previousReport })
  }

  /** 保存手动编辑的正文（自动备份 .bak；带报告则沿用落盘，否则保存后自动审稿）。 */
  async chapterSave(no: number, text: string, report?: ReviewReport): Promise<import('../protocol.ts').ChapterSaveResponse> {
    return postJson<import('../protocol.ts').ChapterSaveResponse>(NOVEL_API.chapterSave, { chapterNo: no, text, report })
  }

  async patchConfig(patch: ConfigPatch): Promise<{ config: NovelConfig }> {
    return postJson<{ config: NovelConfig }>(NOVEL_API.config, patch)
  }

  async openFolder(): Promise<void> {
    await fetch(NOVEL_API.openFolder, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  }

  /** 插件自更新：在 DSH profile 目录拉取最新 npm 版（需重启 DSH 生效）。 */
  async pluginUpdate(): Promise<PluginUpdateResponse> {
    return postJson<PluginUpdateResponse>(NOVEL_API.pluginUpdate, {})
  }

  /** 书架快照。 */
  async bookshelf(): Promise<import('../protocol.ts').BookshelfSnapshot> {
    const response = await fetch(NOVEL_API.bookshelf)
    return readJson<import('../protocol.ts').BookshelfSnapshot>(response)
  }

  /** 新建书并激活（开书向导：可携带大纲文本，创建即建项目）。 */
  async bookCreate(bookName: string, outputDir?: string, outline?: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>(NOVEL_API.bookshelf, { bookName, outputDir, outline })
  }

  /** 重置项目（清空进度；可携带新大纲）。 */
  async reset(outline?: string): Promise<{ ok: boolean; bookName: string }> {
    return postJson<{ ok: boolean; bookName: string }>(NOVEL_API.reset, { outline })
  }

  /** 全书一致性质检。 */
  async audit(): Promise<import('../protocol.ts').AuditResponse> {
    return postJson<import('../protocol.ts').AuditResponse>(NOVEL_API.audit, {})
  }

  /** 热门题材雷达：信号 + 生产底座。 */
  async marketRadar(req: import('../protocol.ts').MarketRadarRequest): Promise<{ result: import('../protocol.ts').MarketRadarResult }> {
    return postJson<{ result: import('../protocol.ts').MarketRadarResult }>(NOVEL_API.marketRadar, req)
  }

  /** 真实榜单扫榜：抓取公开榜单，返回分组候选。 */
  async marketRadarScan(req: { platforms?: string[] }): Promise<{ result: { scannedAt: string; groups: any[] } }> {
    return postJson<{ result: { scannedAt: string; groups: any[] } }>(NOVEL_API.marketRadarScan, req)
  }

  /** 把雷达生产底座里的新资产同步进全局资源库（跨书复用；已有名字跳过）。 */
  async marketRadarSync(req: { foundation: import('../protocol.ts').ProductionFoundation }): Promise<{ ok: boolean; synced: { genre: boolean; primaryMode: boolean; secondaryMode: boolean } }> {
    return postJson<{ ok: boolean; synced: { genre: boolean; primaryMode: boolean; secondaryMode: boolean } }>(NOVEL_API.marketRadarSync, req)
  }

  /** 书内知识库：读取。 */
  async knowledgeList(): Promise<{ docs: import('../protocol.ts').KnowledgeDoc[] }> {
    const response = await fetch(withBookId(NOVEL_API.knowledge))
    return readJson<{ docs: import('../protocol.ts').KnowledgeDoc[] }>(response)
  }

  /** 书内知识库：新增。 */
  async knowledgeAdd(doc: { title: string; content: string }): Promise<{ docs: import('../protocol.ts').KnowledgeDoc[] }> {
    return postJson<{ docs: import('../protocol.ts').KnowledgeDoc[] }>(NOVEL_API.knowledge, { action: 'add', doc })
  }

  /** 书内知识库：删除。 */
  async knowledgeRemove(id: string): Promise<{ docs: import('../protocol.ts').KnowledgeDoc[] }> {
    return postJson<{ docs: import('../protocol.ts').KnowledgeDoc[] }>(NOVEL_API.knowledge, { action: 'remove', id })
  }

  /** 书分析/拆书。 */
  async bookAnalysis(text: string): Promise<{ result: import('../protocol.ts').BookAnalysisResult }> {
    return postJson<{ result: import('../protocol.ts').BookAnalysisResult }>(NOVEL_API.bookAnalysis, { text })
  }

  /** 创意灵感。 */
  async ideaInspiration(idea: string, count = 5): Promise<{ result: import('../protocol.ts').IdeaInspirationResult }> {
    return postJson<{ result: import('../protocol.ts').IdeaInspirationResult }>(NOVEL_API.ideaInspiration, { idea, count })
  }

  /** 雷达→灵感：基于市场信号/生产底座/创意简报生成开书灵感。 */
  async marketIdeaInspiration(req: { signals?: import('../protocol.ts').MarketRadarSignal[]; foundation?: import('../protocol.ts').ProductionFoundation; brief?: import('../protocol.ts').MarketCreativeBrief; count?: number }): Promise<{ result: import('../protocol.ts').IdeaInspirationResult }> {
    return postJson<{ result: import('../protocol.ts').IdeaInspirationResult }>(NOVEL_API.ideaInspirationMarket, req)
  }

  /** 自动导演编排建议：基于全书上下文。 */
  async director(focus?: string): Promise<{ result: import('../protocol.ts').DirectorAdvice }> {
    return postJson<{ result: import('../protocol.ts').DirectorAdvice }>(NOVEL_API.director, { focus })
  }

  /** 自动导演「采纳」出的书内待办：读取。 */
  async directorTodosList(): Promise<{ todos: import('../protocol.ts').DirectorTodo[] }> {
    const response = await fetch(withBookId(NOVEL_API.directorTodos))
    return readJson<{ todos: import('../protocol.ts').DirectorTodo[] }>(response)
  }

  /** 待办：新增（来源 risk/fix）。 */
  async directorTodosAdd(text: string, source: 'risk' | 'fix'): Promise<{ todos: import('../protocol.ts').DirectorTodo[] }> {
    return postJson<{ todos: import('../protocol.ts').DirectorTodo[] }>(NOVEL_API.directorTodos, { op: 'add', text, source })
  }

  /** 待办：勾选/取消。 */
  async directorTodosToggle(id: string): Promise<{ todos: import('../protocol.ts').DirectorTodo[] }> {
    return postJson<{ todos: import('../protocol.ts').DirectorTodo[] }>(NOVEL_API.directorTodos, { op: 'toggle', id })
  }

  /** 待办：删除。 */
  async directorTodosRemove(id: string): Promise<{ todos: import('../protocol.ts').DirectorTodo[] }> {
    return postJson<{ todos: import('../protocol.ts').DirectorTodo[] }>(NOVEL_API.directorTodos, { op: 'remove', id })
  }

  /** 用选中的市场信号 + 影响模式生成开书创意简报。 */
  async marketRadarBrief(req: import('../protocol.ts').MarketRadarBriefRequest): Promise<{ creativeBrief: import('../protocol.ts').MarketCreativeBrief }> {
    return postJson<{ creativeBrief: import('../protocol.ts').MarketCreativeBrief }>(NOVEL_API.marketRadarBrief, req)
  }

  /** 把雷达生产底座一键应用到某本书（写入项目资产/开书定盘）。 */
  async marketRadarApply(req: { bookId?: string; foundation: import('../protocol.ts').ProductionFoundation }): Promise<{ ok: boolean; bookName: string }> {
    return postJson<{ ok: boolean; bookName: string }>(NOVEL_API.marketRadarApply, req)
  }

  /** 角色卡刷新（基于事实库聚合）。 */
  async charactersRefresh(): Promise<{ cards: import('../protocol.ts').RoleStatusCard[] }> {
    return postJson<{ cards: import('../protocol.ts').RoleStatusCard[] }>(NOVEL_API.charactersRefresh, {})
  }

  /** 事实库回填：对历史已生成章节批量抽取事实。 */
  async factsBackfill(): Promise<{ ok: boolean; filled: number }> {
    return postJson<{ ok: boolean; filled: number }>(NOVEL_API.factsBackfill, {})
  }

  /** 道藏局部修补。 */
  async biblePatch(patch: import('../protocol.ts').BiblePatchRequest): Promise<{ bible: import('../protocol.ts').StoryBible }> {
    return postJson<{ bible: import('../protocol.ts').StoryBible }>(NOVEL_API.biblePatch, patch)
  }

  /** 剧情线管理：增删改 + 关联章节。 */
  async plotlines(req: import('../protocol.ts').PlotlinesRequest): Promise<import('../protocol.ts').PlotlinesResponse> {
    return postJson<import('../protocol.ts').PlotlinesResponse>(NOVEL_API.plotlines, req)
  }

  /** 敏感词检查：指定章节 / 任意文本 / 全书。 */
  async sensitiveCheck(req: import('../protocol.ts').SensitiveCheckRequest): Promise<import('../protocol.ts').SensitiveCheckResponse> {
    return postJson<import('../protocol.ts').SensitiveCheckResponse>(NOVEL_API.sensitiveCheck, req)
  }

  /** 作者复盘补跑：单章（JSON）。 */
  async reviewBackfillChapter(no: number): Promise<{ no: number; review: import('../protocol.ts').AuthorReview }> {
    return postJson<{ no: number; review: import('../protocol.ts').AuthorReview }>(NOVEL_API.reviewBackfill, { chapterNo: no })
  }

  /** 作者复盘补跑：全书缺失章节（NDJSON 流）。 */
  async reviewBackfillAll(onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.reviewBackfill, {}, onFrame)
  }

  /** 章节复位：generating 卡死 → pending。 */
  async chapterReset(no: number): Promise<{ ok: boolean; no: number }> {
    return postJson<{ ok: boolean; no: number }>(NOVEL_API.chapterReset, { chapterNo: no })
  }

  /** 章节直接通过（作者行使最终决定权）。 */
  async chapterApprove(no: number): Promise<{ ok: boolean; no: number }> {
    return postJson<{ ok: boolean; no: number }>(NOVEL_API.chapterApprove, { chapterNo: no })
  }

  /** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
  async imageTest(req: import('../protocol.ts').ImageTestRequest): Promise<import('../protocol.ts').ImageTestResponse> {
    return postJson<import('../protocol.ts').ImageTestResponse>(NOVEL_API.imageTest, req)
  }

  /** 对选中的提供商/模型发一次最小真实调用，验证连通性。 */
  async llmTest(provider: string, model: string): Promise<LlmTestResponse> {
    return postJson<LlmTestResponse>(NOVEL_API.llmTest, { provider, model })
  }

  /** 添加模型：厂商直填 key，或自定义 OpenAI 兼容路由（写 DSH 凭据 + 注册路由）。 */
  async addModel(req: AddModelRequest): Promise<AddModelResponse> {
    return postJson<AddModelResponse>(NOVEL_API.addModel, req)
  }

  /** 运行时厂商目录（DSH pi-ai 可配置提供方 + 内置适配器）。 */
  async llmVendors(): Promise<LlmVendorsResponse> {
    const response = await fetch(NOVEL_API.llmVendors)
    return readJson<LlmVendorsResponse>(response)
  }

  /** 查询某个 provider 当前可用的模型（添加成功后可即时刷新）。 */
  async llmModels(provider: string): Promise<LlmModelsResponse> {
    const response = await fetch(NOVEL_API.llmModels + '?provider=' + encodeURIComponent(provider))
    return readJson<LlmModelsResponse>(response)
  }

  /** 已注册的提供方路由列表（提供方管理卡片）。 */
  async llmProviders(): Promise<LlmProvidersResponse> {
    const response = await fetch(NOVEL_API.llmProviders)
    return readJson<LlmProvidersResponse>(response)
  }

  /** 移除一个提供方（unset key + 移除 llm-pi-ai 路由）。 */
  async removeProvider(req: RemoveProviderRequest): Promise<RemoveProviderResponse> {
    return postJson<RemoveProviderResponse>(NOVEL_API.llmRemove, req)
  }

  async roles(req: import('../protocol.ts').RolesRequest): Promise<import('../protocol.ts').RolesResponse> {
    return postJson<import('../protocol.ts').RolesResponse>(NOVEL_API.roles, req)
  }

  /** 漫剧角色库：从分镜提名 / 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
  async mangaRoles(req: import('../protocol.ts').MangaRolesRequest): Promise<import('../protocol.ts').MangaRolesResponse> {
    return postJson<import('../protocol.ts').MangaRolesResponse>(NOVEL_API.mangaRoles, req)
  }

  /** 导出「即梦素材包」落盘到资产库 manga-assets/素材包/。 */
  async exportPackage(chapterNo: number, title: string, markdown: string): Promise<{ ok: boolean; file: string }> {
    return postJson<{ ok: boolean; file: string }>(NOVEL_API.exportPackage, { chapterNo, title, markdown })
  }

  /** 场景库：AI 提炼 / 采纳 / 更新 / 删除 / 图集。 */
  async scenes(req: import('../protocol.ts').ScenesRequest): Promise<import('../protocol.ts').ScenesResponse> {
    return postJson<import('../protocol.ts').ScenesResponse>(NOVEL_API.scenes, req)
  }

  /** 视觉世界观规则：提炼 / 保存。 */
  async visualRules(req: import('../protocol.ts').VisualRulesRequest): Promise<import('../protocol.ts').VisualRulesResponse> {
    return postJson<import('../protocol.ts').VisualRulesResponse>(NOVEL_API.visualRules, req)
  }

  /** 道具库：从已写章节提炼常驻道具 / 保存清单。 */
  async mangaProps(req: import('../protocol.ts').MangaPropsRequest): Promise<import('../protocol.ts').MangaPropsResponse> {
    return postJson<import('../protocol.ts').MangaPropsResponse>(NOVEL_API.mangaProps, req)
  }

  /** 小说简介：AI 生成/补全（partial 留空 = 全量），或手动保存。 */
  async blurb(action: 'generate' | 'save', text?: string, partial?: string): Promise<{ blurb: string }> {
    return postJson<{ blurb: string }>(NOVEL_API.blurb, { action, text, partial })
  }

  /** 封面：读取（dataUrl；dir 指定某本书的输出目录，省略为当前书）。 */
  async coverGet(dir?: string): Promise<import('../protocol.ts').CoverResponse> {
    const query = dir !== undefined ? `?dir=${encodeURIComponent(dir)}` : ''
    const response = await fetch(NOVEL_API.cover + query)
    return readJson<import('../protocol.ts').CoverResponse>(response)
  }

  /** 封面：上传（base64 data URL）或移除。 */
  async coverPost(action: 'upload' | 'remove', dataUrl?: string): Promise<{ ok: boolean; coverPath?: string | null }> {
    return postJson<{ ok: boolean; coverPath?: string | null }>(NOVEL_API.cover, { action, dataUrl })
  }

  /** 重命名当前书（同步项目与书架条目）。 */
  async rename(bookName: string): Promise<{ bookName: string }> {
    return postJson<{ bookName: string }>(NOVEL_API.rename, { bookName })
  }

  /** 大世界：AI 提炼（generate）或手动保存（save）。 */
  async world(action: 'generate' | 'save', world?: import('../protocol.ts').WorldState): Promise<{ world: import('../protocol.ts').WorldState }> {
    return postJson<{ world: import('../protocol.ts').WorldState }>(NOVEL_API.world, { action, world })
  }

  /** 切换当前书。 */
  async bookActivate(id: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>('/api/dsh-novel-forge/bookshelf/activate', { id })
  }

  /** 移除书架条目。 */
  async bookRemove(id: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>('/api/dsh-novel-forge/bookshelf/remove', { id })
  }

  /** 导入已有项目目录（Mode A）：校验 novel-project.json，登记/激活书架。 */
  async bookImportDir(outputDir: string): Promise<import('../protocol.ts').BookImportDirResponse> {
    return postJson<import('../protocol.ts').BookImportDirResponse>(NOVEL_API.bookshelfImportDir, { outputDir })
  }

  /** 导入 txt/md 全本（Mode B）：服务器本地文件路径模式。 */
  async bookImportText(filePath: string, outputDir?: string): Promise<import('../protocol.ts').BookImportTextResponse> {
    return postJson<import('../protocol.ts').BookImportTextResponse>(NOVEL_API.bookshelfImportText, { filePath, outputDir })
  }

  /** 拆章预览（浏览器上传全文，不落盘）：返回识别到的章节与跳过清单。 */
  async bookImportTextPreview(text: string, fileName?: string): Promise<import('../protocol.ts').BookImportTextPreviewResponse> {
    return postJson<import('../protocol.ts').BookImportTextPreviewResponse>(NOVEL_API.bookshelfImportTextPreview, { text, fileName })
  }

  /** 导入 txt/md 全本（Mode B）：浏览器上传全文内容模式。 */
  async bookImportTextContent(text: string, fileName: string, outputDir?: string): Promise<import('../protocol.ts').BookImportTextResponse> {
    return postJson<import('../protocol.ts').BookImportTextResponse>(NOVEL_API.bookshelfImportText, { text, fileName, outputDir })
  }

  /** 生产单：启动批量生产（区间或新增 N 章；计划不足自动补）。 */
  async runStart(req: import('../protocol.ts').RunStartRequest): Promise<import('../protocol.ts').RunState> {
    return postJson<import('../protocol.ts').RunState>(NOVEL_API.runStart, req)
  }

  /** 生产单控制：pause / resume / stop。 */
  async runControl(action: 'pause' | 'resume' | 'stop'): Promise<import('../protocol.ts').RunState | null> {
    const response = await fetch(NOVEL_API.runControl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (response.status === 400) return null
    return readJson<import('../protocol.ts').RunState>(response)
  }

  /** 生产单状态（无生产单返回 null）。 */
  async runStatus(): Promise<import('../protocol.ts').RunState | null> {
    const response = await fetch(NOVEL_API.runStatus)
    if (response.status === 404) return null
    return readJson<import('../protocol.ts').RunState | null>(response)
  }

  /** Get project writing assets + built-in libraries. */
  async assets(): Promise<AssetsResponse> {
    const response = await fetch(withBookId(NOVEL_API.assets))
    return readJson<AssetsResponse>(response)
  }

  /** Patch project writing assets. */
  async patchAssets(patch: AssetsPatch): Promise<AssetsResponse> {
    return postJson<AssetsResponse>(NOVEL_API.assets, patch)
  }

  /** Extract a style asset from sample text. */
  async styleEngine(req: StyleEngineRequest): Promise<{ styleAsset: StyleAsset }> {
    return postJson<{ styleAsset: StyleAsset }>(NOVEL_API.styleEngine, req)
  }

  /**
   * Consume an NDJSON job stream (generate / rewrite / polish).
   * @param path - the route to POST to.
   * @param payload - the JSON body.
   * @param onFrame - receives every frame as it lands.
   */
  private async streamJob(path: string, payload: unknown, onFrame: (frame: JobFrame) => void): Promise<void> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      await readJson<{ error?: string }>(response)
      return
    }
    if (response.body === null) throw new NovelApiError('job: no response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        let frame: JobFrame
        try {
          frame = JSON.parse(line) as JobFrame
        } catch {
          continue
        }
        onFrame(frame)
        if (frame.type === 'error') {
          throw new NovelApiError(frame.message)
        }
      }
    }
  }

  /** Generate one chapter. */
  async generate(chapterNo: number, skipReview: boolean, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.generate, { chapterNo, skipReview }, onFrame)
  }

  /** Rewrite one chapter (whole-chapter, or local when `target` is given). */
  async rewrite(chapterNo: number, instructions: string, target: string, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.rewrite, { chapterNo, instructions, target }, onFrame)
  }

  /** Polish (de-AI-ify) one chapter. */
  async polish(chapterNo: number, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.polish, { chapterNo }, onFrame)
  }

  /** 采纳待确认草稿（润色/重写产物），覆盖正文文件。返回采纳后的新正文（markdown）。
   *  可携带审查报告（沿用结论定状态：通过 → approved）。 */
  async draftApply(chapterNo: number, report?: import('../protocol.ts').ReviewReport): Promise<{ ok: boolean; chars: number; file: string; markdown: string }> {
    return postJson<{ ok: boolean; chars: number; file: string; markdown: string }>(NOVEL_API.draftApply, { chapterNo, report })
  }

  /** 放弃待确认草稿，保留原稿。 */
  async draftDiscard(chapterNo: number): Promise<{ ok: boolean }> {
    return postJson<{ ok: boolean }>(NOVEL_API.draftDiscard, { chapterNo })
  }

  /** Run one assistant turn (NDJSON stream). */
  async assistant(message: string, onFrame: (frame: import('../protocol.ts').AssistantFrame) => void): Promise<void> {
    const response = await fetch(NOVEL_API.assistant, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!response.ok) {
      await readJson<{ error?: string }>(response)
      return
    }
    if (response.body === null) throw new NovelApiError('assistant: no response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        let frame: import('../protocol.ts').AssistantFrame
        try {
          frame = JSON.parse(line) as import('../protocol.ts').AssistantFrame
        } catch {
          continue
        }
        onFrame(frame)
        if (frame.type === 'error') throw new NovelApiError(frame.message)
      }
    }
  }

  /** Load the persisted assistant conversation. */
  async assistantHistory(): Promise<import('../protocol.ts').AssistantMessage[]> {
    const response = await fetch(withBookId(NOVEL_API.assistantHistory))
    const body = await readJson<{ messages: import('../protocol.ts').AssistantMessage[] }>(response)
    return body.messages
  }

  /** 清空助手对话记录。 */
  async assistantClear(): Promise<{ ok: boolean }> {
    return postJson<{ ok: boolean }>(NOVEL_API.assistantClear, {})
  }

  /** 作者资产库/总数据：读取跨书可复用资产。 */
  async authorAssets(): Promise<import('../protocol.ts').AuthorAssetsResponse> {
    const response = await fetch(NOVEL_API.authorAssets)
    return readJson<import('../protocol.ts').AuthorAssetsResponse>(response)
  }

  /** 作者资产库：新增/更新一条资产（upsert by id）。 */
  async authorAssetsUpsert(asset: import('../protocol.ts').AuthorStyleAsset): Promise<import('../protocol.ts').AuthorAssetsResponse> {
    return postJson<import('../protocol.ts').AuthorAssetsResponse>(NOVEL_API.authorAssetsUpsert, { asset })
  }

  /** 作者资产库：删除一条资产。 */
  async authorAssetsRemove(id: string): Promise<import('../protocol.ts').AuthorAssetsResponse> {
    return postJson<import('../protocol.ts').AuthorAssetsResponse>(NOVEL_API.authorAssetsRemove, { id })
  }

  /** 作者资产库：导入默认（书架书的写作资产/角色 + 内置全局库）批量沉淀。 */
  async authorAssetsImportDefault(): Promise<import('../protocol.ts').AuthorAssetsResponse> {
    return postJson<import('../protocol.ts').AuthorAssetsResponse>(NOVEL_API.authorAssetsImportDefault, {})
  }

  /** 改编模式 P0：上传全文 → 原文设定卡片 / 可改范围矩阵。 */
  async adaptAnalyze(text: string, filePath?: string): Promise<import('../protocol.ts').AdaptAnalyzeResponse> {
    return postJson<import('../protocol.ts').AdaptAnalyzeResponse>(NOVEL_API.adaptAnalyze, { text, filePath })
  }

  /** 改编模式 P1：确认要改的维度 → 生成映射表/改编规则/联动影响清单。 */
  async adaptPropose(req: import('../protocol.ts').AdaptProposeRequest): Promise<import('../protocol.ts').AdaptProposeResponse> {
    return postJson<import('../protocol.ts').AdaptProposeResponse>(NOVEL_API.adaptPropose, req)
  }

  /** 改编模式 P2：执行术语替换（全局替换 + 命中统计 + 改编文本预览）。 */
  async adaptExecute(req: import('../protocol.ts').AdaptExecuteRequest): Promise<import('../protocol.ts').AdaptExecuteResponse> {
    return postJson<import('../protocol.ts').AdaptExecuteResponse>(NOVEL_API.adaptExecute, req)
  }

  /** 改编模式 P3：保存改编全文为新书（原书保留，登记书架）。 */
  async adaptSave(req: import('../protocol.ts').AdaptSaveRequest): Promise<import('../protocol.ts').AdaptSaveResponse> {
    return postJson<import('../protocol.ts').AdaptSaveResponse>(NOVEL_API.adaptSave, req)
  }

  /** 改编模式 P4：从源全文 + 编辑后方案提炼新书资料并保存为「待写新书」。 */
  async adaptMaterialize(req: import('../protocol.ts').AdaptMaterializeRequest): Promise<import('../protocol.ts').AdaptMaterializeResponse> {
    return postJson<import('../protocol.ts').AdaptMaterializeResponse>(NOVEL_API.adaptMaterialize, req)
  }

  /** 改编模式：保存预览/微调后的新书资料为新书（原书保留，登记书架）。 */
  async adaptMaterializeSave(req: AdaptMaterializeSaveRequest): Promise<AdaptMaterializeSaveResponse> {
    return postJson<AdaptMaterializeSaveResponse>(NOVEL_API.adaptMaterializeSave, req)
  }

  /** 改编模式：rewrite 逐章重写（NDJSON 流式进度，支持分段 startNo/endNo）。 */
  async adaptRewriteStream(req: AdaptExecuteRequest, onFrame: (frame: AdaptRewriteFrame) => void): Promise<void> {
    const response = await fetch(NOVEL_API.adaptRewriteStream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!response.ok) {
      await readJson<{ error?: string }>(response)
      return
    }
    if (response.body === null) throw new NovelApiError('adapt rewrite: no response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        let frame: AdaptRewriteFrame
        try {
          frame = JSON.parse(line) as AdaptRewriteFrame
        } catch {
          continue
        }
        onFrame(frame)
        if (frame.type === 'error') throw new NovelApiError(frame.message)
      }
    }
  }

  /** 主题自定义背景：上传图片，服务端存盘并返回可访问 URL。 */
  async themeBackgroundUpload(dataUrl: string): Promise<{ url: string }> {
    return postJson<{ url: string }>(NOVEL_API.themeBackgroundUpload, { dataUrl })
  }
}
