/**
 * dsh-novel-forge — shared protocol between the host half (Node) and the
 * browser half (web GUI). Route paths, request/response shapes, the project
 * state file format, and the NDJSON generation stream frames all live here so
 * both halves spell exactly one vocabulary.
 */
import type {
  ShotSizeId,
  CameraMoveId,
  CompositionId,
  LightingId,
} from './shot-language.ts'
import type {
  StoryFunctionId,
  EmotionId,
} from './story-beat-language.ts'

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
  /** 漫剧方案管理：create/remove/activate。 */
  manhuaPlans: '/api/dsh-novel-forge/manhua/plans',
  /** 漫剧角色库：从分镜提名（规则+LLM两段式）/ 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
  mangaRoles: '/api/dsh-novel-forge/manga/roles',
  /** 漫剧道具库：从已写章节提炼常驻道具（跨镜头需一致）/ 保存清单。 */
  mangaProps: '/api/dsh-novel-forge/manga/props',
  /** 导出「即梦素材包」落盘到资产库 manga-assets/素材包/。 */
  exportPackage: '/api/dsh-novel-forge/manga/export-package',
  /** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
  storyboardSkeleton: '/api/dsh-novel-forge/storyboard/skeleton',
  /** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
  storyboardTable: '/api/dsh-novel-forge/storyboard/table',
  /** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
  storyboardPrompts: '/api/dsh-novel-forge/storyboard/prompts',
  /** 生图接口连通性测试（设置页每个模型条目用）。 */
  imageTest: '/api/dsh-novel-forge/image-test',
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
  scenes: '/api/dsh-novel-forge/scenes',
  visualRules: '/api/dsh-novel-forge/visual-rules',
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
  /** 漫剧分镜生成：章节 → 角色锚点 + 分镜表（可适配豆包/Seedance/SD）。 */
  /** 漫剧分集计划：读一卷 → 按故事弧线分集（高潮拆集/过渡并章）。 */
  /** 漫画脚本：章节 → 分页分格漫画脚本（含角色视觉锚点）。 */
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

/** 分镜·编剧级：剧情骨架中的一节拍。 */
export interface StoryboardBeat {
  /** 节拍 id（如 b1、b2）。 */
  id: string
  /** 事件一句话（发生了什么）。 */
  event: string
  /** 情绪走向（情绪词 id 数组，来自 story-beat-language 词库，链式）。 */
  emotion: EmotionId[]
  /** 叙事功能（枚举 id，来自 story-beat-language 词库）。 */
  function: StoryFunctionId
  /** 因果：承接上一节拍的原因（可选）。 */
  cause?: string
}

/** 分镜·编剧级：单章剧情骨架。 */
export interface StoryboardSkeleton {
  chapterNo: number
  /** 本章弧线一句话（起承转合）。 */
  arc: string
  /** 剧情节拍链（时间顺序，因果连贯）。 */
  beats: StoryboardBeat[]
  /** 本章全部出镜角色（正文中的确切称谓，去重；漫剧角色库提名地基）。 */
  characters?: string[]
}

/** POST /storyboard/skeleton 请求：生成单章剧情骨架。 */
export interface StoryboardSkeletonRequest {
  chapterNo: number
}

/** POST /storyboard/skeleton 响应。 */
export interface StoryboardSkeletonResponse {
  skeleton: StoryboardSkeleton
}

/** 分镜·导演级：一个镜头。 */
export interface StoryboardShot {
  /** 镜头 id（如 s1、s2）。 */
  id: string
  /** 挂载的节拍 id（骨架中的 b1…）。 */
  beatId: string
  /** 景别（枚举 id，来自 shot-language 词库）。 */
  shot: ShotSizeId
  /** 机位与运镜（枚举 id 数组，来自 shot-language 词库）。 */
  camera: CameraMoveId[]
  /** 构图（可选，枚举 id）。 */
  composition?: CompositionId
  /** 时长（秒，即梦白名单：5/6/7/8/10）。 */
  duration: number
  /** 画面内容：角色动作 + 表情 + 服装/标志物 + 主体位置。 */
  visual: string
  /** 台词/旁白（无则空字符串）。 */
  line: string
  /** 音效（无则空字符串）。 */
  sound: string
  /** 光效（枚举 id 数组，来自 shot-language 词库）。 */
  light: LightingId[]
  /** 承接上一镜头结尾状态（位置/动作/情绪/服装）。 */
  prevState: string
  /** 本镜头结束状态。 */
  nextState: string
  /** 本镜头出镜角色（引用小说库规范名/漫剧卡名，1-4 个；漫剧角色库提名地基）。 */
  characters?: string[]
  /** 本镜头已绑定漫剧卡的 id（定妆图引用，供出图/生视频时按卡取参考图）。 */
  mangaRoleIds?: string[]
  /** 即梦自然语言运镜描述（如「镜头从中景缓慢推进到近景」），提示词层直接使用，无需再转换。 */
  jimengCamera?: string
  /** 本镜参考图 id 列表（角色定妆图+场景图），即梦图生视频时逐条投喂。 */
  referenceImageIds?: string[]
}

/** 分镜·导演级：单章分镜表。 */
export interface StoryboardTable {
  chapterNo: number
  shots: StoryboardShot[]
  /** 生成时注入的场景卡名称（前端标注消费关系）。 */
  usedScenes?: string[]
  /** 本章全部出镜角色（各镜头 characters 去重汇总；骨架有则兜底）。 */
  characters?: string[]
  /** 本章已绑定漫剧卡的 id（去重汇总，定妆图引用）。 */
  mangaRoleIds?: string[]
}

/** POST /storyboard/table 请求：骨架 → 分镜表。 */
export interface StoryboardTableRequest {
  chapterNo: number
  /** 编剧级骨架（前端已生成/编辑后的版本）。 */
  skeleton: StoryboardSkeleton
  /** 漫剧方案基底风格 id（style-library）；提供时按风格措辞画面描述。 */
  styleId?: string
  /** 可选滤镜风格 id（stackable）。 */
  filterId?: string
}

/** POST /storyboard/table 响应。 */
export interface StoryboardTableResponse {
  table: StoryboardTable
}

/** 分镜·提示词级：一个镜头的即梦视频提示词。 */
export interface StoryboardPrompt {
  /** 对应镜头 id（s1…）。 */
  shotId: string
  /** 即梦/视频模型可粘贴的中文提示词（画面+运镜+光效+风格词块）。 */
  text: string
  /** 本镜头绑定的漫剧卡 id（定妆图引用：出图/生视频时按卡取 imageUrl/立绘）。 */
  mangaRoleIds?: string[]
  /** Seedance 专用：运镜方式（推/拉/摇/移/跟/升降/固定，含具体起止）。 */
  camera?: string
  /** Seedance 专用：运动幅度（轻微/中等/强烈）。 */
  motion?: 'low' | 'medium' | 'high'
  /** 负面提示词（即梦末尾追加：不要文字/水印/变形/多手/多指等）。 */
  negativePrompt?: string
  /** 本镜头场景名（绑定场景底图参考）。 */
  sceneName?: string
}

/** 分镜持久化：单章的分镜产出（骨架 + 分镜表 + 视频提示词，可分别存在）。 */
export interface ChapterStoryboard {
  chapterNo: number
  skeleton?: StoryboardSkeleton
  table?: StoryboardTable
  prompts?: StoryboardPrompt[]
  updatedAt: string
}

/** POST /storyboard/prompts 请求：分镜表 → 视频提示词。 */
export interface StoryboardPromptsRequest {
  chapterNo: number
  /** 分镜表（前端已生成的镜头列表）。 */
  table: StoryboardTable
  /** 基底风格 id。 */
  styleId?: string
  /** 可选滤镜风格 id。 */
  filterId?: string
}

/** POST /storyboard/prompts 响应。 */
export interface StoryboardPromptsResponse {
  prompts: StoryboardPrompt[]
}

/** 漫剧方案：同一本书的多套视觉演绎（基底风格 + 可选滤镜）。 */
export interface MangaPlan {
  /** 方案 id。 */
  id: string
  /** 方案名（如《保质期》3D 皮克斯版）。 */
  name: string
  /** 基底风格 id（style-library 中非 stackable 风格）。 */
  styleId: string
  /** 可选滤镜风格 id（style-library 中 stackable 风格）。 */
  filterId?: string
  /** 可选题材（玄幻/武侠/二次元/都市/科幻...），注入对应题材生成规则。 */
  genre?: string
  /** 是否激活（分镜/角色图生成时使用）。 */
  active: boolean
  createdAt: string
  updatedAt: string
}

/** POST /manhua/plans 请求：漫剧方案管理。 */
export interface MangaPlansRequest {
  op: 'create' | 'remove' | 'activate'
  /** create：方案名。 */
  name?: string
  /** create：基底风格 id。 */
  styleId?: string
  /** create：可选滤镜风格 id。 */
  filterId?: string
  /** create：题材（注入对应题材规则）。 */
  genre?: string
  /** remove/activate：方案 id。 */
  id?: string
}

/** POST /manhua/plans 响应。 */
export interface MangaPlansResponse {
  plans: MangaPlan[]
}

/** 漫剧角色卡：制作角色（要建模/出图/锁一致性的「上镜角色」），与小说角色库弱关联。 */
export interface MangaRoleCard {
  /** 稳定 id。 */
  id: string
  /** 来源小说角色名（只读追溯，非强外键；禁止反向写回小说库）。 */
  sourceRoleName?: string
  /** 漫剧用名（可短剧化改名）。 */
  name: string
  /** 身份一句话。 */
  identity: string
  /** 核心功能：主角/导师/感情线/反派/搭档/线人/功能性。 */
  coreFunction: 'protagonist' | 'mentor' | 'love_interest' | 'antagonist' | 'sidekick' | 'informant' | 'functional'
  /** 与主角的关系。 */
  protagonistRelation: 'enemy' | 'friend' | 'mentor' | 'lover' | 'exploit' | 'neutral'
  /** 口头禅/说话方式（配音一致性）。 */
  speechStyle: string
  /** ≤3 个极致性格标签。 */
  traits: string[]
  /** 1-2 个辨识度外貌点。 */
  appearance: string
  /** 角色定妆级别：protagonist主角(完整四件套) / supporting配角(仅立绘) / extra路人(不做定妆)。默认 protagonist。 */
  tier?: 'protagonist' | 'supporting' | 'extra'
  /** 3-5 个关键剧情节点。 */
  keyScenes: string[]
  /** 上场集数（分镜提名导入时记录）。 */
  appearsInEpisodes: number[]
  /** 待匹配 → 待确认 → 已导入 → 已定妆 → 已归档。 */
  status: 'pending_match' | 'pending_confirm' | 'imported' | 'anchored' | 'archived'
  /** 形象资产（沿用小说角色库同款结构）。 */
  imagePrompt?: RoleRecord['imagePrompt']
  /** 情绪表情清单（锚点提炼时产出）。 */
  expressions?: string[]
  /** 四类精修生图提示词（立绘/四视图/表情/细节）。 */
  promptKit?: RoleRecord['promptKit']
  /** 角色参考图。 */
  imageUrl?: string
  /** 图集（图像锚点）。 */
  gallery?: RoleImage[]
  /** 生成锚点/精修时的方案风格 id（旧风格检测用）。 */
  promptStyleId?: string
  createdAt: string
  updatedAt: string
}

/** 分镜提名 → 小说角色库匹配的一条候选。 */
export interface MangaRoleCandidate {
  /** 分镜里的原始称谓（正文确切用法）。 */
  rawName: string
  /** matched=命中小说角色；ambiguous=多个候选待定；not_in_library=小说库没有；already_imported=已建漫剧卡（跳过）。 */
  verdict: 'matched' | 'ambiguous' | 'not_in_library' | 'already_imported'
  /** 规则阶段候选短名单（≤5，精确名优先 + 身份/简称匹配）。 */
  matches: Array<{ roleName: string; reason: string }>
  /** LLM/规则确认的命中角色名（ambiguous 时可能为空）。 */
  matchedRoleName?: string
  /** not_in_library 时给出建议：backfill=正文有该称谓但小说库漏提炼（回小说库补）；manga_new=漫剧新增角色（直接建卡）。 */
  novelHint?: 'backfill' | 'manga_new'
  /** 智能分级：protagonist=主角（必做定妆）、supporting=配角（建议做定妆）、extra=路人/功能性（默认不导入，折叠显示）。 */
  tier?: 'protagonist' | 'supporting' | 'extra'
  /** 采纳时预填的漫剧卡建议。 */
  suggested: {
    name: string
    identity: string
    coreFunction: MangaRoleCard['coreFunction']
    protagonistRelation: MangaRoleCard['protagonistRelation']
    speechStyle: string
    traits: string[]
    appearance: string
    keyScenes: string[]
  }
}

/** POST /manga/roles 请求：漫剧角色库操作。 */
export interface MangaRolesRequest {
  op: 'nominate' | 'adopt' | 'update' | 'remove' | 'visual' | 'promptKit' | 'image' | 'removeImage' | 'imageGenerate' | 'mode' | 'autoGenerate' | 'openAssets'
  /** op='mode'：短剧精简模式开关。 */
  shortDramaMode?: boolean
  /** op='nominate'：从哪章分镜提名角色。 */
  chapterNo?: number
  /** op='adopt' / op='update'：漫剧角色卡。 */
  card?: MangaRoleCard
  /** op='remove' / 'visual' / 'promptKit' / 'image' / 'removeImage' / 'imageGenerate'：漫剧卡 id。 */
  id?: string
  /** op='visual' / 'promptKit'：漫剧方案基底风格 id。 */
  styleId?: string
  /** 可选滤镜风格 id。 */
  filterId?: string
  /** op='image'：定妆图 dataURL。 */
  dataUrl?: string
  /** op='image'：图集用途标签（立绘/四视图/表情-x/场景/细节）；缺省视为角色参考图（imageUrl）。 */
  label?: string
  /** op='imageGenerate'：漫画风格预设 id（可选）。 */
  style?: string
  /** op='imageGenerate'：生图模型库条目 id（缺省用启用条目）。 */
  modelId?: string

  /** op='autoGenerate' 时返回一键生成结果。 */
  autoGenerate?: {
    chapterNo: number
    skeletonBeats: number
    shotCount: number
    promptCount: number
    importedRoles: number
    needMakeupRoles: number
    extraRoles: number
    pendingCandidates: number
    pendingRoleNames: string[]
  }}

/** POST /manga/roles 响应。 */
export interface MangaRolesResponse {
  cards: MangaRoleCard[]
  /** op='nominate' 时的 AI 提名候选。 */
  candidates?: MangaRoleCandidate[]
  /** op='visual' 时的形象锚点（已写入漫剧卡）。 */
  visual?: RoleRecord['imagePrompt']
  /** op='promptKit' 时的四类精修提示词包（已写入漫剧卡）。 */
  promptKit?: RoleRecord['promptKit']
  /** op='image' / 'imageGenerate' 时的定妆图 dataURL（已写入漫剧卡）。 */
  imageUrl?: string
  /** op='mode' 时的短剧精简模式状态。 */
  shortDramaMode?: boolean
  /** op='autoGenerate' 时返回一键生成结果。 */
  autoGenerate?: { chapterNo: number; skeletonBeats: number; shotCount: number; promptCount: number; importedRoles: number; needMakeupRoles: number; extraRoles: number; pendingCandidates: number; pendingRoleNames: string[] }
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
  /** 动漫形象描述词（AI 绘图用：中文描述 + 英文标签 + 关键外貌标签）。 */
  imagePrompt?: {
    /** 中文外貌描述：连贯一段（发色/瞳色/服装/气质/标志物）。 */
    zh: string
    /** 英文绘图标签：booru 风格逗号分隔。 */
    en: string
    /** 中文关键标签（发色/瞳色/服装/气质/标志物）。 */
    tags: string[]
    /** 依据来源说明（哪几章哪些描写）。 */
    source?: string
    /** 即梦/生图通用负面提示词（低质量/变形/多手/文字水印等）。 */
    negativePrompt?: string
  }
  /** 角色参考图（dataURL 或 URL）。用于漫画/漫剧出图时锁定角色一致性。 */
  imageUrl?: string
  /** 角色图集（图像锚点）：立绘/四视图/表情/场景/细节等，label 标注用途。 */
  gallery?: RoleImage[]
  /** 该角色所需的情绪表情清单（提炼时 LLM 补全 6-12 个，如"疲惫/麻木/压抑悲伤"）。 */
  expressions?: string[]
  /** LLM 精修的四类生图提示词包（前端拼装版之外的高质量版，promptKit 接口生成）。 */
  promptKit?: {
    /** 立绘：全身/半身正视图。 */
    portrait?: { zh: string; en: string }
    /** 四视图：正面/侧面/背面设定表。 */
    sheet?: { zh: string; en: string }
    /** 表情：同一脸部锚换情绪，每表情一段。 */
    expressions?: { name: string; zh: string; en: string }[]
    /** 细节：标志物局部特写。 */
    details?: { zh: string; en: string }
  }
  /** 生成形象锚点/精修提示词时的漫剧方案基底风格 id（= 方案 styleId；用于检测旧风格并提示重生成）。 */
  promptStyleId?: string
  /** 漫画/漫剧重要性：main=必须建卡保证一致；support=有锚点即可；extra=路人随机生成不约束。 */
  importance?: 'main' | 'support' | 'extra'
}

/** 角色图集条目：一张已定型的角色图（图像锚点）。 */
export interface RoleImage {
  /** 用途标签：立绘 / 四视图 / 表情-疲惫 / 场景 / 细节 等。 */
  label: string
  /** dataURL 或 URL。 */
  dataUrl: string
}

/** 道具卡：常驻道具（跨镜头需保持一致），含一行统一描述。 */
export interface Prop {
  /** 道具名（如「外卖电动车」）。 */
  name: string
  /** 外观/统一描述（注入提示词保持一致）。 */
  desc: string
}

/** POST /manga/props 请求。 */
export interface MangaPropsRequest {
  op: 'extract' | 'save'
  /** op=save 时的道具清单（整体替换）。 */
  props?: Prop[]
}

/** POST /manga/props 响应。 */
export interface MangaPropsResponse {
  props: Prop[]
}

/** 场景库条目：从正文提炼的「镜头场景」视觉锚点（漫剧分镜/生图用）。 */
export interface SceneCard {
  /** 场景名（唯一键），如「旧茶渡·地下石殿」。 */
  name: string
  /** 一句话定位：空间/氛围/功能。 */
  summary: string
  /** 幕归属：第一幕·后场 / 第二幕·卖场 / …（便于按剧情段落组织）。 */
  act?: string
  /** 时间光态：夜间闭店后 / 雨夜 / 凌晨 / 频闪灯… */
  moment?: string
  /** 关键情节镜头 1-3 条：该场景拍什么（人物动作+情绪+镜头推进）。 */
  beats?: string[]
  /** 人物在场状态：主角/关键角色在该场景的状态一句话。 */
  characterState?: string
  /** 环境构成：空间结构/陈设/标志物。 */
  elements: string[]
  /** 色调与光影（含 HEX 色板，可空）。 */
  palette: string[]
  /** 氛围关键词：压抑/神秘/空旷… */
  moods: string[]
  /** 中文生图提示词（连贯一段，写实电影感）。 */
  zh: string
  /** 英文生图提示词（逗号分隔标签）。 */
  en: string
  /** 关键标签。 */
  tags: string[]
  /** 依据来源（哪几章哪些描写）。 */
  source?: string
  /** 场景图集（图像锚点）：全景/局部/氛围 等。 */
  gallery?: RoleImage[]
  /** 生成时的漫剧方案基底风格 id（场景卡随方案风格措辞）。 */
  styleId?: string

  /** 场景分级：core核心场景（反复出现，精修多图）/ secondary次要场景（1-2次，一张图）/ passing路过场景（不做图）。 */
  tier?: 'core' | 'secondary' | 'passing'
  /** 负面提示词（场景生图/生视频用，默认无人物无文字无水印）。 */
  negativePrompt?: string
  /** 出场章节列表（用于自动分级统计）。 */
  appearsInChapters?: number[]}

/** POST /scenes 请求：场景库提炼 / 采纳 / 更新 / 删除 / 图集。 */
export interface ScenesRequest {
  op: 'extract' | 'adopt' | 'update' | 'remove' | 'image' | 'removeImage' | 'imageGenerate'
  /** op='extract' 时的漫剧基底风格 id（场景卡按方案风格措辞）。 */
  styleId?: string
  /** op='extract' 时的可选滤镜风格 id。 */
  filterId?: string
  /** op='extract' 时按章提取；不传则全书提取（前4章）。 */
  chapterNo?: number
  /** adopt / update 时传入的场景卡（adopt 可修改后采纳）。 */
  scene?: SceneCard
  /** remove / image 时的场景名。 */
  name?: string
  /** op='image' 时的图片 dataURL 与用途标签（全景/局部/氛围）。 */
  dataUrl?: string
  label?: string
  /** op='imageGenerate' 时的生图模型 id（缺省用启用模型）。 */
  modelId?: string
}

/** POST /visual-rules 请求：视觉世界观规则提炼 / 保存。 */
export interface VisualRulesRequest {
  op: 'extract' | 'save'
  /** op=save 时的规则数组。 */
  rules?: string[]
}

/** POST /visual-rules 响应。 */
export interface VisualRulesResponse {
  rules: string[]
}

/** POST /scenes 响应。 */
export interface ScenesResponse {
  scenes: SceneCard[]
  /** op=extract 时的 AI 候选场景。 */
  candidates?: SceneCard[]
  /** op=imageGenerate 时返回的生成图 dataURL。 */
  dataUrl?: string
}

/** POST /roles 请求：角色库增删改 + AI 提炼 + 参考图上传。 */
export interface RolesRequest {
  op: 'extract' | 'adopt' | 'update' | 'remove' | 'visual' | 'image' | 'removeImage' | 'imageGenerate' | 'promptKit'
  /** adopt / update 时传入的角色（adopt 可修改后采纳）。 */
  role?: RoleRecord
  /** remove 时的角色名。 */
  name?: string
  /** op='image' 时的参考图 dataURL。 */
  dataUrl?: string
  /** op='image' 时的图集用途标签（立绘/四视图/表情-x/场景/细节）；缺省视为角色参考图（imageUrl）。 */
  label?: string
  /** op='imageGenerate' 时的漫画风格预设 id（用于统一角色图与漫画页风格）。 */
  style?: string
  /** op='imageGenerate' 时指定生图模型库条目 id（缺省用启用条目）。 */
  modelId?: string
  /** op='visual' / op='promptKit' 时的漫剧基底风格 id（角色图按方案风格重出）。 */
  styleId?: string
  /** op='visual' / op='promptKit' 时的可选滤镜风格 id。 */
  filterId?: string
}

/** POST /image-test 请求：测一个生图接口的连通性与延迟（不落盘）。 */
export interface ImageTestRequest {
  /** OpenAI 兼容生图接口地址。 */
  baseURL: string
  /** API Key。 */
  apiKey: string
  /** 模型 id（顺带校验是否在接口模型列表里，可选）。 */
  model?: string
}

/** POST /image-test 响应。 */
export interface ImageTestResponse {
  ok: boolean
  /** 连通延迟（毫秒）。 */
  ms?: number
  /** 失败原因。 */
  message?: string
  /** 模型 id 是否出现在接口的模型列表（探测成功时才有）。 */
  modelFound?: boolean
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
  /** op=visual 时的动漫形象描述词（已写入角色卡）。 */
  visual?: RoleRecord['imagePrompt']
  /** op=promptKit 时的四类提示词精修包（已写入角色卡）。 */
  promptKit?: RoleRecord['promptKit']
  /** op=image 时的角色参考图 dataURL。 */
  imageUrl?: string
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
  /** 小说简介（面向读者的作品门面，AI 生成或手动保存）。 */
  blurb?: string
  /** 封面文件名（相对输出目录，如 cover.png）。 */
  coverPath?: string
  /** 大世界结构化数据（境界体系/区域/势力）。 */
  world?: WorldState
  /** 剧情线（主线/支线/人物线/悬念线）。 */
  plotlines?: Plotline[]
  /** 角色库（作者维护 + AI 提炼的主表）。 */
  roles?: RoleRecord[]
  /** 漫剧角色库（制作角色投影：从分镜提名导入，独立于小说角色库）。 */
  mangaRoles?: MangaRoleCard[]
  /** 短剧精简模式：漫剧角色库按 5-8 上镜角色 / 功能标签 / 关系闭环 / 人设极致化约束。 */
  shortDramaMode?: boolean
  /** 场景库（作者维护 + AI 提炼的主表）。 */
  scenes?: SceneCard[]
  /** 道具库：常驻道具（如外卖电动车/外卖箱），统一描述，注入提示词保持跨镜头一致。 */
  props?: Prop[]
  /** 视觉世界观规则（生图/生视频必须遵守，从道藏提炼，注入所有提示词）。 */
  visualRules?: string[]
  /** 分镜工作台产出（骨架/分镜表，按章持久化，刷新/切换不丢）。 */
  storyboards?: ChapterStoryboard[]
  /** 漫剧方案列表（同一本书的多套视觉演绎：基底风格 + 可选滤镜）。 */
  mangaPlans?: MangaPlan[]
  /** 人物志：角色当前状态聚合结果（从编年录刷新后存档，打开页面直接显示）。 */
  roleStatus?: RoleStatusCard[]
  /** 漫剧分镜结果缓存：章号 → 分镜（持久化，刷新不丢）。 */
  /** 漫剧分集计划缓存：卷号/0=全书 → 分集计划（持久化，刷新不丢）。 */
  /** 漫画脚本缓存：章号 → 漫画脚本（持久化，刷新不丢）。 */
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

/** 生图模型配置（模型库条目，可多套并存，启用一条生效）。 */
export interface ImageModelConfig {
  /** 条目 id（本地唯一）。 */
  id: string
  /** 展示名（如「豆包 Seedream」「即梦」）。 */
  name: string
  /** OpenAI 兼容生图接口地址（如 https://ark.cn-beijing.volces.com/api/v3）。 */
  baseURL: string
  /** API Key。 */
  apiKey: string
  /** 生图模型 id（如 doubao-seedream-5-0-pro-260628）。 */
  model: string
  /** 是否启用（同时只启用一条）。 */
  enabled: boolean
}

/** Runtime config surface exposed to the panel (subset of plugin Config). */
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
  /** 生图模型库（多套并存，启用一条生效；旧 imageApiKey/imageApiModel 自动迁移为一条）。 */
  imageModels?: ImageModelConfig[]
  /** 运行时生效的生图接口地址（= 启用条目，兼容旧代码读取）。 */
  imageBaseUrl?: string
  /** 运行时生效的生图 API Key（= 启用条目，兼容旧代码读取）。 */
  imageApiKey?: string
  /** 运行时生效的生图模型 id（= 启用条目，兼容旧代码读取）。 */
  imageApiModel?: string
  /** 是否启用生图（= 存在启用条目）。 */
  imageApiEnabled?: boolean
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
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  analysisReasoning?: 'off' | 'low' | 'high' | 'max'
  chapterChars?: number
  maxTokens?: number
  reviewPassScore?: number
  autoReview?: boolean
  autoAuthorReview?: boolean
  autoReviewAfterRevise?: boolean
  imageApiKey?: string
  imageApiModel?: string
  imageApiEnabled?: boolean
  /** 自定义背景图（URL / dataURL / 服务端路径引用）。 */
  themeBackground?: string
  /** 自定义背景遮罩/模糊强度 0-80。 */
  themeBackgroundBlur?: number
  /** 玻璃透明度 0-100（100=当前原样）。 */
  themeOpacity?: number
  enableAdaptMode?: boolean
  /** 生图模型库（完整替换保存）。 */
  imageModels?: ImageModelConfig[]
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
  | { type: 'done' }
  | { type: 'error'; message: string }

/** GET /assistant-history response. */
export interface AssistantHistoryResponse {
  messages: AssistantMessage[]
}

// ---------------------------------------------------------- writing assets

/** 题材基底库：一本书属于哪个阅读市场。树形（题材→子题材→下级）。 */
export interface GenreNode {
  /** 题材名称（标签，如「仙侠修真」「都市异能」）。 */
  name: string
  /** 题材特征、常见爽点、叙事重心或读者期待。 */
  description: string
  /** 子题材。 */
  children: GenreNode[]
}

/** 推进模式库：读者为什么继续看下一章。 */
export interface ProgressionMode {
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
}

/** 反 AI 规则：一条「要避免的问题 + 修正方向」。 */
export interface AntiAiRule {
  /** 规则名（如「禁止解释型心理描写」「AI 高频套话」）。 */
  name: string
  /** 要避免的表达问题，具体可检查。 */
  avoid: string
  /** 推荐修正方向。 */
  fix: string
  /** 命中即告警的具体表达模式（用于审稿逐条核对与去 AI 味检测）。 */
  detectPatterns?: string[]
  /** 是否内置全局规则（内置规则随插件发布，项目规则为用户自定义）。 */
  builtin?: boolean
  /** 规则类型：forbidden=禁止类（命中即问题）/ encourage=鼓励类（不命中不算错，只作建议）。缺省按名称「鼓励」前缀推断。 */
  severity?: 'forbidden' | 'encourage'
  /** 是否启用（缺省 true）。 */
  enabled?: boolean
  /** 作用域（缺省 all）。 */
  scope?: Array<'writing' | 'review' | 'polish' | 'all'>
}

/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置数据，一键绑定无需样本文本）。 */
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
  /** 叙述规则。 */
  proseRules: string[]
  /** 角色/台词规则。 */
  dialogueRules: string[]
  /** 语言规则。 */
  languageRules: string[]
  /** 节奏规则。 */
  rhythmRules: string[]
  /** 该模板默认绑定的反 AI 规则 key（内置规则名）。 */
  defaultAntiAiRuleKeys: string[]
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
  /** AI 建议的候选新值（可空）。 */
  candidates?: string[]
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
