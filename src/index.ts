/**
 * dsh-novel-forge — host half. Mounts the AI novel-forge workbench: docx
 * outline import, LLM chapter planning, chapter-by-chapter generation
 * (3000-4000 chars each), Markdown output into your chosen folder, and the
 * /api/dsh-novel-forge route family. The browser half (./client) renders the
 * workbench panel. Everything rides official NPM SDK packages — no dsh source
 * changes.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ConfigPatch, ImageModelConfig, NovelConfig } from './protocol.ts'
import { makeRoutes } from './routes.ts'
import { activeBookOutputDir } from './bookshelf.ts'

/** Stable cordis plugin name. */
export const name = 'novel-forge'

/** Services required before the novel-forge surfaces can mount. */
export const inject = ['webServer', 'llm', 'systemPrompt', 'settings']

/**
 * Settings namespace of the novel-forge capability — the section the web
 * settings surface edits. Spelled here rather than imported: the browser half
 * spells the same value and must not depend on a Host package.
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
  /** 生图模型库（多套并存，启用一条生效）。 */
  imageModels?: ImageModelConfig[]
  /** 豆包/Seedream 生图 API Key（旧字段，兼容迁移用）。 */
  imageApiKey?: string
  /** 豆包/Seedream 生图模型 ID（旧字段，兼容迁移用）。 */
  imageApiModel?: string
  /** 是否启用豆包生图（旧字段，兼容迁移用）。 */
  imageApiEnabled?: boolean
  /** 自定义背景图（URL / dataURL / 服务端路径引用）。 */
  themeBackground?: string
  /** 自定义背景遮罩/模糊强度 0-80。 */
  themeBackgroundBlur?: number
  /** 玻璃透明度 0-100（100=当前原样）。 */
  themeOpacity?: number
  /** 是否启用改编模式（默认关闭）。 */
  enableAdaptMode?: boolean
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  outlinePath: z.string().default(''),
  outputDir: z.string().default(join(homedir(), '.dsh', 'novels')),
  provider: z.string().default('deepseek-official'),
  model: z.string().default('deepseek-v4-flash'),
  reasoningEffort: z.union(['off', 'low', 'high', 'max']).default('off'),
  analysisReasoning: z.union(['off', 'low', 'high', 'max']).default('low'),
  chapterChars: z.number().default(3500),
  maxTokens: z.number().default(12000),
  reviewPassScore: z.number().default(70),
  autoReview: z.boolean().default(true),
  autoAuthorReview: z.boolean().default(true),
  autoReviewAfterRevise: z.boolean().default(true),
  imageModels: z.array(z.object({
    id: z.string().default(''),
    name: z.string().default(''),
    baseURL: z.string().default(''),
    apiKey: z.string().default(''),
    model: z.string().default(''),
    enabled: z.boolean().default(false),
  })).default([]),
  imageApiKey: z.string().default(''),
  imageApiModel: z.string().default(''),
  imageApiEnabled: z.boolean().default(false),
  themeBackground: z.string().default(''),
  themeBackgroundBlur: z.number().default(0),
  themeOpacity: z.number().default(100),
  enableAdaptMode: z.boolean().default(true),
})

/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true
const DEFAULT_OUTLINE_PATH = ''
const DEFAULT_OUTPUT_DIR = join(homedir(), '.dsh', 'novels')
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const DEFAULT_REASONING_EFFORT = 'off' as const
const DEFAULT_ANALYSIS_REASONING = 'low' as const
const DEFAULT_CHAPTER_CHARS = 3500
const DEFAULT_MAX_TOKENS = 12000
const DEFAULT_REVIEW_PASS_SCORE = 70
const DEFAULT_AUTO_REVIEW = true
const DEFAULT_AUTO_AUTHOR_REVIEW = true
const DEFAULT_AUTO_REVIEW_AFTER_REVISE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const NOVEL_GUIDANCE = '本机已安装 dsh-novel-forge 插件（AI 编译小说工作台）：侧边栏「小说工坊」入口。能力：读取 docx 大纲或粘贴大纲文本；用 LLM 提炼道藏（人设/世界观/金手指规则/写作红线）；生成卷计划与章节计划；逐章调用 LLM 生成 3000-4000 字正文并保存为 Markdown（默认输出到用户主目录 ~/.dsh/novels）；每章自动生成摘要（叙事记忆）、自动 AI 审稿（人设/设定/红线/文笔/爽点/逻辑），支持按审稿意见重写、去 AI 味润色、暗线（伏笔）管理、批量连写与全本导出（txt/md）。限制：生成消耗 LLM API 额度；输出目录与模型可在插件设置中修改；章节正文质量取决于大纲完整度。用户提到「小说 / 大纲 / 写小说 / 章节 / 审稿 / 润色」时即指本插件，请据此协作。'

/** Resolve a config-like value into the full runtime config. */
export function resolveConfig(value: Partial<Config> | undefined): NovelConfig {
  return {
    outlinePath: value?.outlinePath ?? DEFAULT_OUTLINE_PATH,
    outputDir: value?.outputDir ?? DEFAULT_OUTPUT_DIR,
    provider: value?.provider ?? DEFAULT_PROVIDER,
    model: value?.model ?? DEFAULT_MODEL,
    reasoningEffort: value?.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    analysisReasoning: value?.analysisReasoning ?? DEFAULT_ANALYSIS_REASONING,
    chapterChars: value?.chapterChars ?? DEFAULT_CHAPTER_CHARS,
    maxTokens: value?.maxTokens ?? DEFAULT_MAX_TOKENS,
    reviewPassScore: value?.reviewPassScore ?? DEFAULT_REVIEW_PASS_SCORE,
    autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW,
    autoAuthorReview: value?.autoAuthorReview ?? DEFAULT_AUTO_AUTHOR_REVIEW,
    autoReviewAfterRevise: value?.autoReviewAfterRevise ?? DEFAULT_AUTO_REVIEW_AFTER_REVISE,
    // 生图模型库：只有「从未保存过 imageModels」时才用旧配置迁移一条（豆包默认地址）；
    // 已保存为空数组 = 用户主动删光，保持空，不再复活。
    imageModels: value?.imageModels !== undefined
      ? value.imageModels
      : (value?.imageApiKey !== undefined && value.imageApiKey !== ''
          ? [{ id: 'img-legacy', name: '豆包（旧配置）', baseURL: DEFAULT_IMAGE_BASE, apiKey: value.imageApiKey, model: value.imageApiModel ?? '', enabled: true }]
          : []),
    // 运行时生效值 = 启用条目（兼容旧代码读取 imageApiKey/imageApiModel/imageApiEnabled）。
    imageBaseUrl: (() => {
      const active = (value?.imageModels ?? []).find(m => m.enabled) ?? (value?.imageModels ?? [])[0]
      return active?.baseURL !== undefined && active.baseURL !== '' ? active.baseURL : (value?.imageApiKey !== undefined && value.imageApiKey !== '' ? DEFAULT_IMAGE_BASE : undefined)
    })(),
    imageApiKey: (() => {
      const active = (value?.imageModels ?? []).find(m => m.enabled) ?? (value?.imageModels ?? [])[0]
      return active?.apiKey ?? value?.imageApiKey
    })(),
    imageApiModel: (() => {
      const active = (value?.imageModels ?? []).find(m => m.enabled) ?? (value?.imageModels ?? [])[0]
      return active?.model ?? value?.imageApiModel
    })(),
    // 生图启用：总开关打开，或模型库里存在启用条目，均视为已启用（避免用户只配模型忘了开总开关）。
    imageApiEnabled: value?.imageApiEnabled === true || (value?.imageModels ?? []).some(m => m.enabled === true),
    themeBackground: value?.themeBackground ?? '',
    themeBackgroundBlur: value?.themeBackgroundBlur ?? 0,
    themeOpacity: value?.themeOpacity ?? 100,
    enableAdaptMode: value?.enableAdaptMode ?? true,
  }
}

/** 生图默认接口地址（豆包 ark，OpenAI 兼容）。 */
const DEFAULT_IMAGE_BASE = 'https://ark.cn-beijing.volces.com/api/v3'

/**
 * Mount the routes and announcement.
 * @param ctx - host plugin context carrying webServer/llm/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The live source the routes read: the settings section once the web
  // settings surface is served, the composition entry otherwise.
  let current: () => Config = () => config ?? {}
  const resolve = (): NovelConfig => {
    const resolved = resolveConfig(current())
    // 书架激活的书优先决定输出目录（settings 仍可改默认值）。
    const shelfDir = activeBookOutputDir()
    if (shelfDir !== undefined) {
      return { ...resolved, outputDir: shelfDir }
    }
    return resolved
  }

  const patchConfig = async (patch: ConfigPatch): Promise<NovelConfig> => {
    const next: ConfigPatch = {}
    if (patch.outlinePath !== undefined) next.outlinePath = patch.outlinePath
    if (patch.outputDir !== undefined) next.outputDir = patch.outputDir
    if (patch.provider !== undefined) next.provider = patch.provider
    if (patch.model !== undefined) next.model = patch.model
    if (patch.reasoningEffort !== undefined) next.reasoningEffort = patch.reasoningEffort
    if (patch.analysisReasoning !== undefined) next.analysisReasoning = patch.analysisReasoning
    if (patch.chapterChars !== undefined) next.chapterChars = patch.chapterChars
    if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
    if (patch.reviewPassScore !== undefined) next.reviewPassScore = patch.reviewPassScore
    if (patch.autoReview !== undefined) next.autoReview = patch.autoReview
    if (patch.autoAuthorReview !== undefined) next.autoAuthorReview = patch.autoAuthorReview
    if (patch.autoReviewAfterRevise !== undefined) next.autoReviewAfterRevise = patch.autoReviewAfterRevise
    if (patch.imageApiKey !== undefined) next.imageApiKey = patch.imageApiKey
    if (patch.imageApiModel !== undefined) next.imageApiModel = patch.imageApiModel
    if (patch.imageApiEnabled !== undefined) next.imageApiEnabled = patch.imageApiEnabled
    if (patch.themeBackground !== undefined) next.themeBackground = patch.themeBackground
    if (patch.themeBackgroundBlur !== undefined) next.themeBackgroundBlur = patch.themeBackgroundBlur
    if (patch.themeOpacity !== undefined) next.themeOpacity = patch.themeOpacity
    if (patch.enableAdaptMode !== undefined) next.enableAdaptMode = patch.enableAdaptMode
    if (patch.imageModels !== undefined) next.imageModels = patch.imageModels
    // Persist through the settings seam when available; otherwise keep in memory.
    // (ctx.get is the non-strict service access — no inject requirement, same
    // pattern installSettingsSection itself uses.)
    const settings = ctx.get('settings')
    if (settings !== undefined) {
      await settings.update(NOVEL_SETTINGS_NAMESPACE, next as Record<string, unknown>)
    } else {
      current = () => ({ ...current(), ...next })
    }
    return resolve()
  }

  let disposeSection: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined

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
    const routes = makeRoutes({ ctx, getConfig: resolve, patchConfig })
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-novel-forge: routes',
    )
    void value
  }

  ctx.settings.installSection(ctx, NOVEL_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // 运行时 skill：章节批量生产与值守处理（只在本插件环境可用）。
  // 通过 ctx.get('skills') 获取注册表（服务存在时注册，缺失则跳过，不影响其他能力）。
  const skillsService = ctx.get('skills') as { register?: (skill: { name: string; provider: string; description: string; content: string }) => () => void } | undefined
  if (skillsService?.register !== undefined) {
    const disposeSkill = skillsService.register({
      name: 'novel-forge-chapter-batch',
      provider: 'dsh-novel-forge',
      description: '批量生成小说章节并值守处理审稿未过的章节（豁免/按意见修订/验证模式/重新生成），依赖 dsh-novel-forge 的 /api/dsh-novel-forge/* 路由。',
      content: [
        '# 小说章节批量生产与值守处理',
        '',
        '## 0. 值守纪律（最高优先级，违反即空转）',
        '1. 启动后台任务后立即停下，不轮询、不连续 wait、不做无意义动作——后台任务完成时运行时自动通知。',
        '2. 只有收到「任务完成」通知或用户新消息时，才继续下一步（读结果→处理未过→汇报）。',
        '3. 等待期间可做与当前任务无关的其他有用工作，但不得为等任务而空转。',
        '4. 任务因 web 重启中断时：待 3080 恢复后，复位卡死章节（generating/error → reset）再续跑，并向用户说明中断原因。',
        '',
        '## 1. 前置检查',
        '1. `GET /api/dsh-novel-forge/status` 确认服务在跑，读项目章节数。',
        '2. 列出目标区间 pending 章节号，避免重复生成已处理章节。',
        '3. **串行执行，禁止并行写 project.json**（并发会互相覆盖状态，实测教训）。',
        '',
        '## 2. 批量生成',
        '逐章串行调用 `POST /generate` `{ chapterNo, skipReview: false }`（走完整质量门：生成→摘要+编年录→审稿→复盘）。',
        '响应为 NDJSON，找 review 帧取 score/passed。每章 2-5 分钟；失败重试 1 次；后台跑并告知预计时长。',
        '用 Node 脚本（fetch 逐章循环），避免 PowerShell 转义坑，用完删除。',
        '',
        '## 3. 未过章节分级处理',
        '### A. 无 high → 豁免通过：`POST /chapter/approve`（主观项不磨）',
        '### B. 有 high 且明确 → 按意见修订 + 验证模式：',
        '1. 拼指令 `按审稿意见修订（优先处理）：\n[severity] item → suggestion`（high 优先，无 high 取前 3 medium）',
        '2. `POST /rewrite` 产草稿；3. `POST /chapter/check` 带 `previousReport` 走验证模式（只核对原意见解决+只挑新增 high）',
        '4. 判定 `passed || 无 high` 可接受；5. `POST /draft/apply` 带 passed 报告落盘 approved',
        '6. 不可接受 → 第二轮修订（指令更精确）→ 再验证；每章最多修 2 轮，仍不过保留草稿待人工',
        '### C. 结构性 high（修订改不好）→ `POST /draft/discard` 后 `POST /generate` 重写，剩主观项再走 A',
        '### D. error 状态 → `POST /chapter/reset` 后 `POST /generate`',
        '注意：approved 但 review 有 high 的保留不动；修订指令越精确越有效（具体数字/行为一次就过）。',
        '',
        '## 4. 收尾',
        '`GET /status` 验证目标区间全 approved；可选刷新剧情线（`POST /plotlines` op=refresh，注意只读最近 8 章摘要）；汇报通过/未过/失败与遗留项。',
        '',
        '## 5. 已知陷阱',
        '- 并发写 project.json 互相覆盖 → 必须串行',
        '- rewrite 草稿可能偶发不落盘 → 应用前检查 pendingDraft，不存在则重跑',
        '- PowerShell 调 API 引号/中文转义是坑 → 用 Node 脚本',
        '- 验证模式 500 偶发 → 重试一次',
      ].join('\n'),
    })
    ctx.effect(() => disposeSkill, 'dsh-novel-forge: skill')
  }

  // Initial registration from the composition entry.
  sync()
}
