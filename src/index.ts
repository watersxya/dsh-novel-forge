/**
 * dsh-novel-forge — host half. Mounts the AI novel-forge workbench: docx
 * outline import, LLM chapter planning, chapter-by-chapter generation
 * (3000-4000 chars each), Markdown output into your chosen folder, and the
 * /api/dsh-novel-forge route family. The browser half (./client) renders the
 * workbench panel. Everything rides official NPM SDK packages — no dsh source
 * changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ConfigPatch, NovelConfig, ConfigResponse, SavedModel } from './protocol.ts'
import { makeRoutes } from './routes.ts'
import { ProductionRunner } from './run.ts'
import { activeBookOutputDir } from './bookshelf.ts'
import { loadProject } from './engine.ts'
import { dshHomePath } from './home.ts'
import { novelSettingsNamespace, persistConfigPatch, type SettingsLike } from './settings-persist.ts'

/** Stable cordis plugin name. */
export const name = 'novel-forge'

/** Services required before the novel-forge surfaces can mount. */
export const inject = ['webServer', 'llm', 'systemPrompt', 'settings']

/**
 * Settings namespace of the novel-forge capability — the section the web
 * settings surface edits.
 *
 * Legacy fallback only: from Harness 0.2 the Loader derives the section from this
 * plugin's exported `Config`, and addresses it by the **entry id** it assigned in
 * the active profile. That id is not guaranteed to be this name (bundle rows may
 * be given a generated id), so the live id is read from the context instead —
 * see {@link novelSettingsNamespace}. The constant stays for the browser half and
 * for installations whose entry id really is this spelling.
 */
export const NOVEL_SETTINGS_NAMESPACE = 'dsh-novel-forge' as const


/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** When true (default), a system-prompt section announces the plugin to every agent. */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, prompt section). */
  enabled?: boolean
  /** Absolute path of the default docx outline to load. */
  outlinePath?: string
  /** Absolute output directory for chapters + project state. */
  outputDir?: string
  /** LLM provider route. */
  provider?: string
  /** LLM model id. */
  model?: string
  /** 任务级模型路由：正文生成模型（留空则跟随 model）。 */
  generateModel?: string
  /** 任务级模型路由：审稿模型（留空则跟随 model）。 */
  reviewModel?: string
  /** 任务级模型路由：质检模型（留空则跟随 model）。 */
  auditModel?: string
  /** 备用模型：主模型失败时自动切换重试一次（留空 = 不切换）。 */
  fallbackModel?: string
  /** 备用模型的输出 token 上限（仅在设了 fallbackModel 时有意义；0/空 = 沿用主模型预算）。 */
  fallbackMaxTokens?: number
  /** 出章后自动抽取故事时间线（默认开）。 */
  autoTimeline?: boolean
  /** LLM reasoning effort (off/low/high/max). */
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  /** 分析类任务（提炼/拆书/反推大纲等）的推理档位；默认 low。 */
  analysisReasoning?: 'off' | 'low' | 'high' | 'max'
  /** Target characters per chapter. */
  chapterChars?: number
  /** Max output tokens per chapter call. */
  maxTokens?: number
  /** Review pass threshold (0-100). */
  reviewPassScore?: number
  /** Whether generation auto-runs review after writing. */
  autoReview?: boolean
  /** Whether generation auto-runs the author review (hook/continuity/trend). */
  autoAuthorReview?: boolean
  /** 修订/润色产出草稿后自动附带一次 AI 审查（默认开，可在设置页关闭省 token）。 */
  autoReviewAfterRevise?: boolean
  /** 自定义背景图（URL / dataURL / 服务端路径引用）。 */
  themeBackground?: string
  /** 自定义背景遮罩/模糊强度 0-80。 */
  themeBackgroundBlur?: number
  /** 玻璃透明度 0-100（100=当前原样）。 */
  themeOpacity?: number
  /** 是否启用改编模式（默认关闭）。 */
  enableAdaptMode?: boolean
  /** 手动添加的模型库（「我的模型」条目；只存插件内）。 */
  savedModels?: SavedModel[]
}

/**
 * Mark a config field as live-editable.
 *
 * From Harness 0.2 the settings surface builds its editable form from this
 * plugin's exported `Config` and only exposes fields whose nearest ancestor
 * declares volatility (`SettingsForms.schema` + `volatileForm`). Without the
 * marker the host refuses a write with `Plugin entry "…" has no volatile
 * fields`, so the plugin's own 保存设置 route could never persist anything.
 *
 * The canonical form is schemastery's `.volatile()` builder, but that builder
 * ships only in the Harness fork (`@deepseek-ai/schemastery`); the npm
 * `schemastery` this package depends on exposes the same switch as metadata
 * (`extra('volatile', true)`), which is what the fork's builder sets anyway.
 * Prefer the builder when the loaded copy has it, fall back to the metadata so
 * the schema is correct on either copy.
 * @param schema - the field schema.
 * @returns the same field marked live-editable.
 */
function live<T>(schema: T): T {
  const candidate = schema as unknown as {
    volatile?: () => unknown
    extra?: (key: string, value: boolean) => unknown
  }
  if (typeof candidate.volatile === 'function') return candidate.volatile() as T
  if (typeof candidate.extra === 'function') return candidate.extra('volatile', true) as T
  return schema
}

/**
 * Plugin config schema.
 *
 * Every field is live-editable (see {@link live}): the plugin re-reads the
 * settings section on every request, so a change must apply without remounting.
 */
export const Config: z<Config> = z.object({
  announceToAgent: live(z.boolean().default(true)),
  enabled: live(z.boolean().default(true)),
  outlinePath: live(z.string().default('')),
  outputDir: live(z.string().default(dshHomePath('novels'))),
  provider: live(z.string().default('deepseek-official')),
  model: live(z.string().default('deepseek-flash')),
  generateModel: live(z.string().default('')),
  reviewModel: live(z.string().default('')),
  auditModel: live(z.string().default('')),
  fallbackModel: live(z.string().default('')),
  fallbackMaxTokens: live(z.number().default(0)),
  autoTimeline: live(z.boolean().default(true)),
  reasoningEffort: live(z.union(['off', 'low', 'high', 'max']).default('off')),
  analysisReasoning: live(z.union(['off', 'low', 'high', 'max']).default('low')),
  chapterChars: live(z.number().default(3500)),
  maxTokens: live(z.number().default(12000)),
  reviewPassScore: live(z.number().default(70)),
  autoReview: live(z.boolean().default(true)),
  autoAuthorReview: live(z.boolean().default(true)),
  autoReviewAfterRevise: live(z.boolean().default(true)),
  themeBackground: live(z.string().default('')),
  themeBackgroundBlur: live(z.number().default(0)),
  themeOpacity: live(z.number().default(100)),
  enableAdaptMode: live(z.boolean().default(true)),
  savedModels: live(z.array(z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    model: z.string(),
  })).default([])),
})

/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true
const DEFAULT_OUTLINE_PATH = ''
const DEFAULT_OUTPUT_DIR = dshHomePath('novels')
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-flash'
const DEFAULT_REASONING_EFFORT = 'off' as const
const DEFAULT_ANALYSIS_REASONING = 'low' as const
const DEFAULT_FALLBACK_MODEL = ''
const DEFAULT_AUTO_TIMELINE = true
const DEFAULT_CHAPTER_CHARS = 3500
const DEFAULT_MAX_TOKENS = 12000
const DEFAULT_REVIEW_PASS_SCORE = 70
const DEFAULT_AUTO_REVIEW = true
const DEFAULT_AUTO_AUTHOR_REVIEW = true
const DEFAULT_AUTO_REVIEW_AFTER_REVISE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const NOVEL_GUIDANCE = '本机已安装 dsh-novel-forge 插件（AI 编译小说工作台）：侧边栏「小说工坊」入口。能力：读取 docx 大纲、粘贴大纲文本或把 txt 全本拆章导入；用 LLM 提炼道藏（人设/世界观/金手指规则/写作红线）与大世界（境界/区域/势力）；生成卷计划与结构化章节计划（本章目标/剧情要点/必达项/义务合约/章末钩子）；逐章生成 3000-4000 字正文并保存为 Markdown（默认输出到插件设置里「输出目录」指定的位置，未配置时落到 Harness 数据目录下的 novels/书名）；每章自动生成摘要与编年录事实、抽取故事时间线（故事内时间/地点/在场角色/事件）、自动 AI 审稿（人设/设定/红线/文笔/爽点/逻辑/反 AI/呈现/合规九维）与作者复盘；支持按审稿意见合并修订（审稿 high + 时间线矛盾 + 张力偏差合成一轮，每章最多两轮后转人工）、去 AI 味润色、章节历史版本回滚、暗线（伏笔）管理、剧情线与角色库、张力曲线、全书一致性质检与敏感词扫描、分范围导出与项目备份、批量连写（生产单，可暂停/续跑）。限制：所有 AI 操作消耗 LLM API 额度；输出目录与模型可在插件设置中修改；章节正文质量取决于大纲完整度；张力/时间线问题默认只是建议（写日志与待办），不会自动改正文。用户提到「小说 / 大纲 / 写小说 / 章节 / 审稿 / 润色」时即指本插件，请据此协作。'

/** Resolve a config-like value into the full runtime config. */
export function resolveConfig(value: Partial<Config> | undefined): NovelConfig {
  return {
    outlinePath: value?.outlinePath ?? DEFAULT_OUTLINE_PATH,
    outputDir: value?.outputDir ?? DEFAULT_OUTPUT_DIR,
    provider: value?.provider ?? DEFAULT_PROVIDER,
    model: value?.model ?? DEFAULT_MODEL,
    generateModel: value?.generateModel,
    reviewModel: value?.reviewModel,
    auditModel: value?.auditModel,
    fallbackModel: value?.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
    fallbackMaxTokens: value?.fallbackMaxTokens,
    autoTimeline: value?.autoTimeline ?? DEFAULT_AUTO_TIMELINE,
    reasoningEffort: value?.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    analysisReasoning: value?.analysisReasoning ?? DEFAULT_ANALYSIS_REASONING,
    chapterChars: value?.chapterChars ?? DEFAULT_CHAPTER_CHARS,
    maxTokens: value?.maxTokens ?? DEFAULT_MAX_TOKENS,
    reviewPassScore: value?.reviewPassScore ?? DEFAULT_REVIEW_PASS_SCORE,
    autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW,
    autoAuthorReview: value?.autoAuthorReview ?? DEFAULT_AUTO_AUTHOR_REVIEW,
    autoReviewAfterRevise: value?.autoReviewAfterRevise ?? DEFAULT_AUTO_REVIEW_AFTER_REVISE,
    themeBackground: value?.themeBackground ?? '',
    themeBackgroundBlur: value?.themeBackgroundBlur ?? 0,
    themeOpacity: value?.themeOpacity ?? 100,
    enableAdaptMode: value?.enableAdaptMode ?? true,
    savedModels: value?.savedModels ?? [],
  }
}

/**
 * Mount the routes and announcement.
 * @param ctx - host plugin context carrying webServer/llm/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The live source the routes read. Held as an explicit state object, not a
  // self-referential closure: `current = () => ({ ...current(), ...patch })`
  // re-reads `current` inside the function it is assigning, so the first save
  // recurses until the stack blows (`Maximum call stack size exceeded`).
  let currentState: Config = config ?? {}
  const current = (): Config => currentState
  const setCurrent = (next: Config): void => { currentState = next }
  const resolve = (): NovelConfig => {
    const resolved = resolveConfig(current())
    // 书架激活的书优先决定输出目录（settings 仍可改默认值）。
    const shelfDir = activeBookOutputDir()
    if (shelfDir === undefined) return resolved
    // 本书参数覆盖（novel-project.json.bookSettings；未设字段回退全局）。
    const bs = loadProject(shelfDir)?.bookSettings
    const book: NovelConfig = { ...resolved, outputDir: shelfDir }
    if (bs === undefined) return book
    if (bs.provider !== undefined) book.provider = bs.provider
    if (bs.model !== undefined) book.model = bs.model
    if (bs.reasoningEffort !== undefined) book.reasoningEffort = bs.reasoningEffort
    if (bs.analysisReasoning !== undefined) book.analysisReasoning = bs.analysisReasoning
    if (bs.chapterChars !== undefined) book.chapterChars = bs.chapterChars
    if (bs.maxTokens !== undefined) book.maxTokens = bs.maxTokens
    if (bs.reviewPassScore !== undefined) book.reviewPassScore = bs.reviewPassScore
    if (bs.autoReview !== undefined) book.autoReview = bs.autoReview
    if (bs.autoAuthorReview !== undefined) book.autoAuthorReview = bs.autoAuthorReview
    if (bs.autoReviewAfterRevise !== undefined) book.autoReviewAfterRevise = bs.autoReviewAfterRevise
    return book
  }

  /**
   * The settings section this instance is addressed by, resolved once at mount.
   * Undefined when the host exposes neither an entry id nor a registered section,
   * in which case config edits stay in memory (see {@link patchConfig}).
   */
  const settingsNs = novelSettingsNamespace(ctx)

  /**
   * Persist one config patch.
   *
   * Applies to the live config either way. Persistence goes through the host
   * settings section when that section is addressable; when it is not (unknown
   * entry id, or the section never registered), the patch is kept in memory and
   * the caller is told it will not survive a restart — a config save must never
   * fail the request just because the host does not offer persistence.
   * @param patch - the subset to merge.
   * @returns the config the host will read next, plus a persistence caveat.
   */
  const patchConfig = async (patch: ConfigPatch): Promise<ConfigResponse> => {
    const next: ConfigPatch = {}
    if (patch.outlinePath !== undefined) next.outlinePath = patch.outlinePath
    if (patch.outputDir !== undefined) next.outputDir = patch.outputDir
    if (patch.provider !== undefined) next.provider = patch.provider
    if (patch.model !== undefined) next.model = patch.model
    if (patch.generateModel !== undefined) next.generateModel = patch.generateModel
    if (patch.reviewModel !== undefined) next.reviewModel = patch.reviewModel
    if (patch.auditModel !== undefined) next.auditModel = patch.auditModel
    if (patch.fallbackModel !== undefined) next.fallbackModel = patch.fallbackModel
    if (patch.fallbackMaxTokens !== undefined) next.fallbackMaxTokens = patch.fallbackMaxTokens
    if (patch.autoTimeline !== undefined) next.autoTimeline = patch.autoTimeline
    if (patch.reasoningEffort !== undefined) next.reasoningEffort = patch.reasoningEffort
    if (patch.analysisReasoning !== undefined) next.analysisReasoning = patch.analysisReasoning
    if (patch.chapterChars !== undefined) next.chapterChars = patch.chapterChars
    if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
    if (patch.reviewPassScore !== undefined) next.reviewPassScore = patch.reviewPassScore
    if (patch.autoReview !== undefined) next.autoReview = patch.autoReview
    if (patch.autoAuthorReview !== undefined) next.autoAuthorReview = patch.autoAuthorReview
    if (patch.autoReviewAfterRevise !== undefined) next.autoReviewAfterRevise = patch.autoReviewAfterRevise
    if (patch.themeBackground !== undefined) next.themeBackground = patch.themeBackground
    if (patch.themeBackgroundBlur !== undefined) next.themeBackgroundBlur = patch.themeBackgroundBlur
    if (patch.themeOpacity !== undefined) next.themeOpacity = patch.themeOpacity
    if (patch.enableAdaptMode !== undefined) next.enableAdaptMode = patch.enableAdaptMode
    if (patch.savedModels !== undefined) next.savedModels = patch.savedModels
    // Apply + persist via the shared helper: the host section is addressed by the
    // entry id the Loader assigned, never by a guessed constant. (ctx.get is the
    // non-strict service access — same pattern the 0.1.x wiring used.)
    const settings = ctx.get('settings') as SettingsLike | undefined
    const persisted = await persistConfigPatch(
      current() as unknown as Record<string, unknown>,
      next as Record<string, unknown>,
      settings,
      settingsNs,
      NOVEL_SETTINGS_NAMESPACE,
    )
    // Keep the live source in sync even when persistence went through the host:
    // until the host reloads the plugin, the state object is still the old snapshot.
    setCurrent(persisted.config as Config)
    if (persisted.settingsWarning !== undefined) {
      ctx.logger('novel-forge').warn('%s', persisted.settingsWarning)
    }
    return { config: resolve(), ...(persisted.settingsWarning === undefined ? {} : { settingsWarning: persisted.settingsWarning }) }
  }

  let disposeSection: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined

  /**
   * 生产单 runner 单例：**必须在 makeRoutes 之外**持有。
   *
   * 此前 runner 在 makeRoutes 工厂体内 `new`，而 `sync()` 每次配置变更都会
   * 重新 makeRoutes + dispose 全部旧路由 —— 于是：
   * 1. 旧 runner 的 `loop()` 仍在跑并继续 saveProject（失去引用但不停止），同时
   * 2. 新 runner 的 `isWorking()` 恒为 false，`moveOutputDir` 的守卫失效 →
   *    可以边迁移目录边写盘。
   * 提到这里之后，sync() 只重建路由表，runner 及其内存状态（working / 当前章 /
   * 暂停标志）跨重注册保持连续。
   */
  const runner = new ProductionRunner({ ctx, getConfig: resolve })

  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    const value = resolve()
    if (!(current().enabled ?? true)) return
    if (current().announceToAgent ?? DEFAULT_ANNOUNCE) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-novel-forge',
        order: SECTION_ORDER,
        text: NOVEL_GUIDANCE,
      })
    }
    const routes = makeRoutes({ ctx, getConfig: resolve, patchConfig, rawConfig: () => current(), settingsNs, runner })
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-novel-forge: routes',
    )
    void value
  }

  // settings 接线做跨版本兼容（2026-09-30 适配 dsh 0.2.0-rc.2）：
  // 0.1.x 提供 installSection（注册配置段并回调 setSource/onChange），段 id 由
  // 调用方指定，因此用声明的常量；
  // 0.2.x 移除了它，改由 Loader 从本插件导出的 Config schema 推导配置段（段 id
  // = 该 entry 的 id），settings 服务只剩 configure/describe/update/replace/mutate。
  // 缺失时必须静默跳过，不能让整棵插件挂载失败（此前 novel-forge 因此整包不加载）。
  const settingsService = ctx.get('settings') as unknown as
    | { installSection?: (c: unknown, ns: string, schema: unknown, cfg: unknown, hooks: unknown) => void }
    | undefined
  if (settingsService !== undefined && typeof settingsService.installSection === 'function') {
    settingsService.installSection(ctx, settingsNs ?? NOVEL_SETTINGS_NAMESPACE, Config, config ?? {}, {
      setSource: (source: () => Config) => {
        // Snapshot the host-provided source. The live source is one state object
        // now, so a source that recomputed per call would have to be polled;
        // 0.1.x wiring is legacy and the composition entry is authoritative here.
        setCurrent(source())
        sync()
      },
      onChange: sync,
    })
  }


  // Initial registration from the composition entry.
  sync()
}
