/**
 * The /api/dsh-novel-forge route family: status, docx outline loading, LLM
 * story-bible extraction, volume planning, chapter planning, streaming
 * generation / rewrite / polish (NDJSON frames), review, summaries,
 * foreshadows, export, chapter reading, config patching, and opening the
 * output folder. Every route carries the same loopback-only trust fence as
 * the family plugins — these endpoints invoke the LLM and write files on the
 * host machine.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { Context } from '@deepseek-ai/cordis'
import { ProductionRunner } from './run.ts'
import {
  NOVEL_API,
  type AssetsPatch,
  type AssetsResponse,
  type AssistantFrame,
  type AssistantHistoryResponse,
  type AssistantRequest,
  type AuditResponse,
  type AuditStatus,
  type AuthorReview,
  type BiblePatchRequest,
  type BibleRequest,
  type BlurbRequest,
  type CoverRequest,
  type CoverResponse,
  type RenameRequest,
  type WorldRequest,
  type BibleResponse,
  type BookActivateRequest,
  type BookCreateRequest,
  type BookImportDirRequest,
  type BookImportDirResponse,
  type BookImportTextRequest,
  type BookImportTextResponse,
  type BookImportTextPreviewRequest,
  type BookImportTextPreviewResponse,
  type BookRemoveRequest,
  type BookshelfSnapshot,
  type ChapterResponse,
  type ChapterPlan,
  type ChapterSaveResponse,
  type ChapterTextRequest,
  type ConfigPatch,
  type DraftDecisionRequest,
  type ExportRequest,
  type ExportResponse,
  type ForeshadowRequest,
  type ForeshadowResponse,
  type JobFrame,
  type LoadOutlineRequest,
  type MangaPlan,
  type MangaPlansRequest,
  type MangaPlansResponse,
  type MangaRoleCard,
  type MangaRolesRequest,
  type MangaRolesResponse,
  type LoadOutlineResponse,
  type NovelConfig,
  type PlotlinesRequest,
  type PlotlinesResponse,
  type PlanRequest,
  type PlanResponse,
  type PolishRequest,
  type ResetRequest,
  type ReviewReport,
  type ReviewRequest,
  type RunControlRequest,
  type RunStartRequest,
  type RunState,
  type RewriteRequest,
  type RolesRequest,
  type RolesResponse,
  type SceneCard,
  type ScenesRequest,
  type ScenesResponse,
  type VisualRulesRequest,
  type VisualRulesResponse,
  type OutlineSuggestRequest,
  type OutlineSuggestResponse,
  type BreakdownRequest,
  type BreakdownResponse,
  type SensitiveCheckRequest,
  type SensitiveCheckResponse,
  type SensitiveHit,
  type StatusResponse,
  type StoryBible,
  type StoryboardSkeletonRequest,
  type StoryboardSkeletonResponse,
  type StoryboardTableRequest,
  type StoryboardTableResponse,
  type StoryboardPromptsRequest,
  type ImageTestRequest,
  type ImageTestResponse,
  type StoryboardPromptsResponse,
  type StyleEngineRequest,
  type SummaryRequest,
  type VolumesRequest,
  type VolumesResponse,
  type AuthorAssetsResponse,
  type AuthorAssetUpsertRequest,
  type AuthorAssetRemoveRequest,
  type AdaptAnalyzeRequest,
  type AdaptAnalyzeResponse,
  type AdaptProposeRequest,
  type AdaptProposeResponse,
  type AdaptExecuteRequest,
  type AdaptExecuteResponse,
} from './protocol.ts'
import { readOutlineFromDocx } from './docx.ts'
import { clearAssistantHistory, loadAssistantHistory, runAssistantTurn } from './assistant.ts'
import { activateBook, bookshelfSnapshot, createBook, defaultOutputDirFor, importDir, loadBookshelf, removeBook, renameBook, seedBookshelfFromOutputDir } from './bookshelf.ts'
import { loadAuthorAssets, upsertAuthorAsset, removeAuthorAsset, importDefaultAuthorAssets } from './author-assets.ts'
import { BUILTIN_ANTI_AI_RULES, BUILTIN_GENRE_LIBRARY, BUILTIN_PROGRESSION_MODES, BUILTIN_STYLE_TEMPLATES, emptyProjectAssets } from './assets.ts'
import {
  chapterFileName,
  auditBook,
  authorReviewChapter,
  autoLinkPlotlines,
  backfillFacts,
  createProject,
  exportBook,
  importBookText,
  importBookTextFromText,
  previewBookText,
  extractBible,
  extractStyleAsset,
  extractWorld,
  generateBlurb,
  generateChapterStream,
  listChapterFiles,
  loadProject,
  markForeshadowPlanted,
  mergeVolatileFromDisk,
  planChapters,
  planVolumes,
  polishChapterStream,
  readChapterFile,
  refreshCharacters,
  refreshPlotlineProgress,
  reviewChapter,
  reviewChapterText,
  rewriteChapterStream,
  saveProject,
  analyzePlotlineHealth,
  designPlotlinePlan,
  extractRoles,
  extractScenes,
  generateRolePromptKit,
  generateMangaRolePromptKit,
  extractVisualRules,
  extractRoleVisual,
  extractMangaRoleVisual,
  nominateMangaRoles,
  suggestOutlines,
  reverseOutlineFromChapters,
  breakdownBook,
  analyzeAdaptation,
  proposeAdaptation,
  applyAdaptationReplacements,
  generateRoleReferenceImage,
  generateMangaRoleReferenceImage,
  testImageEndpoint,
  generateStoryboardSkeleton,
  generateStoryboardTable,
  generateStoryboardPrompts,
  checkSensitiveText,
  suggestForeshadows,
  suggestPlotlines,
  summarizeAndExtractFacts,
  summarizeChapter,
  syncProjectWithDisk,
} from './engine.ts'

/** Cap on JSON request bodies (generous: cover images travel as base64). */
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024

/** 包内置风格效果图目录（assets/styles，随 npm 包分发）。 */
const builtinStyleDir = fileURLToPath(new URL('../assets/styles/', import.meta.url))

/** Loopback-only fence (mirrors the family plugins' pairing routes). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body. */
async function readJsonBody<T>(req: IncomingMessage): Promise<T | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    return undefined
  }
}

/** Route deps. */
export interface NovelRoutesDeps {
  ctx: Context
  /** Resolve the live plugin config (settings-aware). */
  getConfig: () => NovelConfig
  /** Persist a config patch through the settings seam. */
  patchConfig: (patch: ConfigPatch) => Promise<NovelConfig>
}

/** Default chapter count for planning when the request omits it. */
const DEFAULT_PLAN_COUNT = 30

/**
 * Build every /api/dsh-novel-forge route.
 * @param deps - context, config resolver, config patcher.
 * @returns the route list.
 */
export function makeRoutes(deps: NovelRoutesDeps): WebRoute[] {
  const { ctx, getConfig, patchConfig } = deps

  /** 全书质检实时状态（内存态，重启后回到 idle；用于 /status 暴露进度）。 */
  let auditState: AuditStatus = { status: 'idle', totalBatches: 0, completedBatches: 0 }

  /** Guard helper: fence + method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed (expected ${method})` })
      return false
    }
    return true
  }

  /** Load (and sync) the project, or respond 400. */
  const requireProject = (res: ServerResponse): ReturnType<typeof loadProject> => {
    const config = getConfig()
    const project = loadProject(config.outputDir)
    if (project === undefined) {
      writeJson(res, 400, { error: '输出目录中没有项目，请先加载大纲' })
      return undefined
    }
    syncProjectWithDisk(project, config.outputDir)
    saveProject(config.outputDir, project)
    return project
  }

  // -------------------------------------------------------------- status
  const statusRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.status,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      // 书架为空时播种 settings 默认输出目录里的已有项目。
      seedBookshelfFromOutputDir(config.outputDir)
      const project = loadProject(config.outputDir)
      if (project !== undefined) {
        // 自动兜底：generating 超过 10 分钟（正常一章 2-5 分钟）视为卡死/中断，
        // 复位为 pending，避免"生成中"状态卡死无法重新生成。
        const staleMs = 10 * 60 * 1000
        for (const c of project.chapters) {
          if (c.status === 'generating' && c.generatingAt !== undefined) {
            const started = new Date(c.generatingAt).getTime()
            if (Number.isFinite(started) && Date.now() - started > staleMs) {
              c.status = 'pending'
              c.error = undefined
              c.generatingAt = undefined
            }
          }
        }
        syncProjectWithDisk(project, config.outputDir)
        saveProject(config.outputDir, project)
      }
      const response: StatusResponse = {
        config,
        // 瘦身：facts 只回最近 80 条（客户端最多展示 60），避免长篇后
        // status 响应体随编年录无限膨胀。
        project: project !== undefined
          ? { ...project, facts: (project.facts ?? []).slice(-80) }
          : undefined,
        generatedFiles: listChapterFiles(config.outputDir),
        audit: auditState,
      }
      writeJson(res, 200, response)
    },
  }

  // -------------------------------------------------------- load-outline
  const loadOutlineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.loadOutline,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<LoadOutlineRequest>(req)
      const config = getConfig()
      try {
        let outline: string
        let path: string | undefined
        if (body?.text !== undefined && body.text.trim() !== '') {
          outline = body.text.trim()
        } else {
          const target = body?.path?.trim() !== '' && body?.path !== undefined ? body.path : config.outlinePath
          outline = readOutlineFromDocx(target)
          path = target
        }
        if (outline.length < 50) {
          writeJson(res, 400, { error: '大纲内容过短（<50 字符），请检查文件或直接粘贴大纲文本' })
          return
        }
        const response: LoadOutlineResponse = {
          outline,
          bookName: createProject(outline).bookName,
          chars: outline.length,
          path,
        }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 400, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------- save-outline
  const saveOutlineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.saveOutline,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<LoadOutlineRequest>(req)
      const config = getConfig()
      const outline = body?.text ?? ''
      if (outline.trim().length < 50) {
        writeJson(res, 400, { error: '大纲内容过短（<50 字符）' })
        return
      }
      let project = loadProject(config.outputDir)
      const now = new Date().toISOString()
      if (project === undefined) {
        project = createProject(outline)
      } else {
        project.outline = outline
        project.bookName = createProject(outline).bookName
        project.updatedAt = now
      }
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, bookName: project.bookName })
    },
  }

  // --------------------------------------------------------------- bible
  const bibleRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bible,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BibleRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲' })
        return
      }
      try {
        const bible = await extractBible(ctx, config, outline, project)
        const now = new Date().toISOString()
        const next = project ?? createProject(outline)
        next.bible = bible
        next.updatedAt = now
        saveProject(config.outputDir, next)
        const response: BibleResponse = { bible }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- volumes
  const volumesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.volumes,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<VolumesRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲' })
        return
      }
      try {
        const volumes = await planVolumes(ctx, config, outline)
        const now = new Date().toISOString()
        const next = project ?? createProject(outline)
        next.volumes = volumes
        next.updatedAt = now
        saveProject(config.outputDir, next)
        const response: VolumesResponse = { volumes }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ----------------------------------------------------------------- plan
  const planRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.plan,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<PlanRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲（或粘贴大纲文本）' })
        return
      }
      const count = body?.chapterCount ?? DEFAULT_PLAN_COUNT
      if (!Number.isInteger(count) || count < 1 || count > 200) {
        writeJson(res, 400, { error: 'chapterCount 须为 1-200 的整数' })
        return
      }
      try {
        const next = project ?? createProject(outline)
        const chapters: ChapterPlan[] = await planChapters(ctx, config, next, count, body?.volume, config.outputDir)
        // 并发保护：长 LLM 调用期间磁盘可能已被其他请求更新（角色库/剧情线等），
        // 保存前合并磁盘最新易变字段，避免旧快照覆盖新修改。
        mergeVolatileFromDisk(config.outputDir, next)
        next.chapters.push(...chapters)
        next.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, next)
        const response: PlanResponse = { chapters, volumes: next.volumes }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- generate
  const generateRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.generate,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<{ chapterNo?: number; skipReview?: boolean }>(req)
      const rawNo = body?.chapterNo
      if (!Number.isInteger(rawNo) || rawNo === undefined || rawNo < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no: number = rawNo
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${no} 不在计划中` })
        return
      }
      if (chapter.status === 'generating') {
        writeJson(res, 409, { error: `章节 ${no} 正在生成中` })
        return
      }

      // NDJSON stream.
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      chapter.status = 'generating'
      chapter.error = undefined
      chapter.generatingAt = new Date().toISOString()
      // 并发保护：合并磁盘最新易变字段后保存，避免本请求覆盖并发修改（角色库/剧情线等）。
      mergeVolatileFromDisk(config.outputDir, project)
      saveProject(config.outputDir, project)

      const send = (frame: JobFrame): void => {
        res.write(JSON.stringify(frame) + '\n')
      }

      try {
        send({ type: 'start', no, title: chapter.title })
        for await (const step of generateChapterStream(ctx, config, project, config.outputDir, no)) {
          if (step.frame === 'delta') {
            send({ type: 'delta', text: step.text })
          } else if (step.frame === 'done') {
            send({ type: 'done', no, file: step.file, chars: step.chars, title: chapter.title })
          }
        }
        // Auto pipeline: summary + facts（一次调用）-> review（unless skipped）。
        try {
          await summarizeAndExtractFacts(ctx, config, project, config.outputDir, no)
        } catch (error) {
          console.warn('[dsh-novel-forge] summary/facts failed:', (error as Error).message)
        }
        // 伏笔落地标记：正文中命中 planned 伏笔关键词 → 自动标为 planted（暗线管理页与正文同步）。
        try {
          const marked = markForeshadowPlanted(project, config.outputDir, no)
          if (marked > 0) {
            console.log(`[dsh-novel-forge] 第${no}章已埋伏笔 ${marked} 条`)
          }
        } catch (error) {
          console.warn('[dsh-novel-forge] markForeshadowPlanted failed:', (error as Error).message)
        }
        if (!(body?.skipReview === true) && (config.autoReview ?? true)) {
          const report = await reviewChapter(ctx, config, project, config.outputDir, no)
          send({ type: 'review', no, report })
        } else {
          chapter.status = 'approved'
          mergeVolatileFromDisk(config.outputDir, project)
          saveProject(config.outputDir, project)
        }
        // 作者复盘：叙事结构检查（钩子兑现/结尾钩子/推进/连续性/趋势；不改变章节状态）。
        if (config.autoAuthorReview ?? true) {
          try {
            const currentBody = readChapterFile(config.outputDir, chapter)
            let prevTail = ''
            if (no > 1) {
              const prev = project.chapters.find(c => c.no === no - 1)
              if (prev !== undefined) {
                prevTail = (readChapterFile(config.outputDir, prev) ?? '').replace(/^#.*$/m, '').trim().slice(-600)
              }
            }
            if (currentBody !== undefined) {
              const review = await authorReviewChapter(ctx, config, project, no, currentBody, prevTail)
              chapter.authorReview = review
              // 复盘标记推进的剧情线 → 自动关联本章。
              if (review.advancedLines !== undefined) {
                autoLinkPlotlines(project, no, review.advancedLines)
              }
              mergeVolatileFromDisk(config.outputDir, project)
              saveProject(config.outputDir, project)
              send({ type: 'author-review', no, review })
            }
          } catch (error) {
            console.warn('[dsh-novel-forge] author review failed:', (error as Error).message)
          }
        }
        res.end()
      } catch (error) {
        chapter.status = 'error'
        chapter.error = (error as Error).message
        mergeVolatileFromDisk(config.outputDir, project)
        saveProject(config.outputDir, project)
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // --------------------------------------------------------------- review
  const reviewRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.review,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ReviewRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      try {
        const report = await reviewChapter(ctx, config, project, config.outputDir, no)
        writeJson(res, 200, { report })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- rewrite
  const rewriteRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.rewrite,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<RewriteRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of rewriteChapterStream(ctx, config, project, config.outputDir, no, body?.instructions ?? '', body?.target)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'drafted') send({ type: 'drafted', no, chars: step.chars, draft: step.draft })
        }
        // Draft mode: no auto re-review — the user reviews the diff and
        // decides; re-run review after applying if wanted.
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // --------------------------------------------------------------- polish
  const polishRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.polish,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<PolishRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of polishChapterStream(ctx, config, project, config.outputDir, no)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'drafted') send({ type: 'drafted', no, chars: step.chars, draft: step.draft })
        }
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // ---------------------------------------------------- draft apply/discard
  /** 采纳待确认草稿：覆盖正文文件 + 状态回 written + 清空草稿。 */
  const draftApplyRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.draftApply,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<DraftDecisionRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === body!.chapterNo!)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${body!.chapterNo} 不在计划中` })
        return
      }
      if (chapter.pendingDraft === undefined || chapter.pendingDraft === '') {
        writeJson(res, 400, { error: `章节 ${chapter.no} 没有待确认的草稿` })
        return
      }
      const draft = chapter.pendingDraft
      const fileName = chapterFileName(chapter)
      mkdirSync(config.outputDir, { recursive: true })
      const targetPath = join(config.outputDir, fileName)
      // 采纳前自动备份当前原稿为 .bak.md（每次应用都刷新为最新原稿），可随时回退。
      if (existsSync(targetPath)) {
        copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, '')}.bak.md`))
      }
      writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, 'utf8')
      chapter.pendingDraft = undefined
      chapter.chars = draft.length
      chapter.file = fileName
      // 携带审查报告则沿用结论定状态（修订后审查通过 → approved）；否则置 written 待审。
      const carried = body?.report
      if (carried !== undefined && typeof carried.score === 'number') {
        chapter.review = carried
        chapter.status = carried.passed ? 'approved' : 'rejected'
      } else {
        chapter.status = 'written'
        chapter.review = undefined
      }
      chapter.error = undefined
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, chars: draft.length, file: fileName, markdown: draft })
    },
  }

  /** 放弃待确认草稿：保留原稿，仅清空草稿字段。 */
  const draftDiscardRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.draftDiscard,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<DraftDecisionRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === body!.chapterNo!)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${body!.chapterNo} 不在计划中` })
        return
      }
      if (chapter.pendingDraft !== undefined) {
        chapter.pendingDraft = undefined
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
      }
      writeJson(res, 200, { ok: true })
    },
  }

  // -------------------------------------------------------------- summary
  const summaryRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.summary,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<SummaryRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      try {
        const summary = await summarizeChapter(ctx, config, project, config.outputDir, body!.chapterNo!)
        writeJson(res, 200, { summary })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- foreshadow
  const foreshadowRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.foreshadow,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ForeshadowRequest>(req)
      try {
        if (body?.suggest === true) {
          // AI suggestion pass: create several foreshadows from the outline.
          const created = await suggestForeshadows(ctx, config, project)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          const response: ForeshadowResponse = { foreshadows: created }
          writeJson(res, 200, response)
          return
        }
        if (body?.id !== undefined) {
          // Update an existing foreshadow.
          const target = project.foreshadows.find(f => f.id === body.id)
          if (target === undefined) {
            writeJson(res, 404, { error: `伏笔 ${body.id} 不存在` })
            return
          }
          if (body.description !== undefined) target.description = body.description
          if (body.plantedChapter !== undefined) target.plantedChapter = body.plantedChapter
          if (body.targetChapter !== undefined) target.targetChapter = body.targetChapter
          if (body.status !== undefined) target.status = body.status
          if (body.resolvedNote !== undefined) target.resolvedNote = body.resolvedNote
        } else {
          // Create one manually.
          const description = body?.description?.trim()
          if (description === undefined || description === '') {
            writeJson(res, 400, { error: 'description 必填' })
            return
          }
          project.foreshadows.push({
            id: `fs-${Date.now().toString(36)}`,
            description,
            plantedChapter: body?.plantedChapter,
            targetChapter: body?.targetChapter,
            status: body?.status ?? 'planned',
          })
        }
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        const response: ForeshadowResponse = { foreshadows: project.foreshadows }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- export
  const exportRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.exportBook,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ExportRequest>(req)
      const format = body?.format === 'md' ? 'md' : 'txt'
      try {
        const result = exportBook(config.outputDir, project, format)
        const response: ExportResponse = { ...result }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- chapter
  const chapterRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapter,
    handler: async (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rawNo = Number(url.searchParams.get('no') ?? '0')
      if (!Number.isInteger(rawNo) || rawNo < 1) {
        writeJson(res, 400, { error: 'no 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === rawNo)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${rawNo} 不在计划中` })
        return
      }
      const markdown = readChapterFile(config.outputDir, chapter)
      if (markdown === undefined) {
        writeJson(res, 404, { error: `章节 ${rawNo} 尚未生成` })
        return
      }
      const response: ChapterResponse = { no: chapter.no, title: chapter.title, markdown }
      writeJson(res, 200, response)
    },
  }

  // ------------------------------------------------------ chapter check/save
  /** 审查手动编辑的正文（不落盘，返回审稿报告）。 */
  const chapterCheckRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapterCheck,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ChapterTextRequest>(req)
      const text = body?.text?.trim() ?? ''
      if (text.length < 50) {
        writeJson(res, 400, { error: '正文过短（<50 字），请先编辑内容' })
        return
      }
      try {
        // 携带上一轮报告 → 验证模式（逐条核对原意见解决情况 + 只挑新增 high）。
        const report = await reviewChapterText(ctx, config, project, text, body?.previousReport)
        writeJson(res, 200, { report })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  /** 保存手动编辑的正文（自动备份 .bak，状态回 written）。 */
  const chapterSaveRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapterSave,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ChapterTextRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === body!.chapterNo!)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${body!.chapterNo} 不在计划中` })
        return
      }
      const text = body?.text?.trim() ?? ''
      if (text.length < 50) {
        writeJson(res, 400, { error: '正文过短（<50 字），未保存' })
        return
      }
      const fileName = chapterFileName(chapter)
      mkdirSync(config.outputDir, { recursive: true })
      const targetPath = join(config.outputDir, fileName)
      if (existsSync(targetPath)) {
        copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, '')}.bak.md`))
      }
      writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${text}\n`, 'utf8')
      chapter.status = 'written'
      chapter.chars = text.length
      chapter.file = fileName
      chapter.pendingDraft = undefined
      // 保存即审稿：携带工作区审查报告则沿用（不重复审）；否则自动正式审稿一次。
      let report: ReviewReport | undefined
      const carried = body?.report
      if (carried !== undefined && typeof carried.score === 'number') {
        report = carried
        chapter.review = report
        chapter.status = report.passed ? 'approved' : 'rejected'
      } else {
        report = await reviewChapter(ctx, config, project, config.outputDir, chapter.no)
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      const response: ChapterSaveResponse = { ok: true, chars: text.length, file: fileName, report }
      writeJson(res, 200, response)
    },
  }

  // ----------------------------------------------------------- assistant
  const assistantRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assistant,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<AssistantRequest>(req)
      const message = body?.message?.trim()
      if (message === undefined || message === '') {
        writeJson(res, 400, { error: '消息不能为空' })
        return
      }
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: AssistantFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of runAssistantTurn(ctx, config, project, config.outputDir, message)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'tool') send({ type: 'tool', name: step.name, status: step.status, detail: step.detail })
          else if (step.frame === 'toolDelta') send({ type: 'toolDelta', name: step.name, text: step.text })
        }
        send({ type: 'done' })
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // -------------------------------------------------- assistant-history
  const assistantHistoryRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assistantHistory,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      const response: AssistantHistoryResponse = { messages: loadAssistantHistory(config.outputDir) }
      writeJson(res, 200, response)
    },
  }

  // --------------------------------------------------- assistant-clear
  /** 清空助手对话记录。 */
  const assistantClearRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assistantClear,
    handler: (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      clearAssistantHistory(config.outputDir)
      writeJson(res, 200, { ok: true })
    },
  }

  // --------------------------------------------------------------- assets
  const assetsRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assets,
    handler: async (req, res) => {
      // GET (read) and POST (patch) are both allowed — check methods first,
      // then the loopback fence (guard() would 405 on POST, which is wrong).
      if (req.method !== 'GET' && req.method !== 'POST') {
        writeJson(res, 405, { error: 'method not allowed (expected GET or POST)' })
        return
      }
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const projectAssets = project?.assets ?? emptyProjectAssets()
      if (req.method === 'POST') {
        const body = await readJsonBody<AssetsPatch>(req)
        if (body === undefined) {
          writeJson(res, 400, { error: '无效的 JSON' })
          return
        }
        if (project === undefined) {
          writeJson(res, 400, { error: '请先加载大纲创建项目' })
          return
        }
        if (body.genre !== undefined) projectAssets.genre = body.genre
        if (body.primaryProgression !== undefined) projectAssets.primaryProgression = body.primaryProgression
        if (body.auxiliaryProgressions !== undefined) projectAssets.auxiliaryProgressions = body.auxiliaryProgressions
        if (body.antiAiRules !== undefined) projectAssets.antiAiRules = body.antiAiRules
        if (body.styleAssets !== undefined) projectAssets.styleAssets = body.styleAssets
        projectAssets.updatedAt = new Date().toISOString()
        project.assets = projectAssets
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
      }
      const response: AssetsResponse = {
        projectAssets,
        genreLibrary: BUILTIN_GENRE_LIBRARY,
        antiAiLibrary: BUILTIN_ANTI_AI_RULES,
        styleTemplates: BUILTIN_STYLE_TEMPLATES,
        progressionLibrary: BUILTIN_PROGRESSION_MODES,
      }
      writeJson(res, 200, response)
    },
  }

  // ----------------------------------------------------------- style-engine
  const styleEngineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.styleEngine,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const body = await readJsonBody<StyleEngineRequest>(req)
      const sample = body?.sampleText?.trim()
      if (sample === undefined || sample.length < 50) {
        writeJson(res, 400, { error: '样本文本过短（<50 字符），请粘贴一段能代表目标风格的文字' })
        return
      }
      try {
        const rules = await extractStyleAsset(ctx, config, sample)
        const name = body?.name?.trim() !== '' && body?.name !== undefined ? body.name : `风格资产 ${Date.now().toString(36)}`
        const styleAsset = {
          name: name.slice(0, 40),
          ...rules,
          sourceText: sample.slice(0, 3000),
          createdAt: new Date().toISOString(),
        }
        if (project !== undefined) {
          project.assets ??= emptyProjectAssets()
          project.assets.styleAssets ??= []
          project.assets.styleAssets.push(styleAsset)
          project.assets.updatedAt = new Date().toISOString()
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
        }
        writeJson(res, 200, { styleAsset })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- bookshelf
  const bookshelfRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bookshelf,
    handler: async (req, res) => {
      // GET = snapshot; POST = create book.
      if (req.method === 'GET') {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        // 书架为空时，把 settings 默认输出目录里已有的项目播种为第一本书。
        seedBookshelfFromOutputDir(getConfig().outputDir)
        const snapshot: BookshelfSnapshot = bookshelfSnapshot(loadBookshelf())
        writeJson(res, 200, snapshot)
        return
      }
      if (req.method === 'POST') {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        const body = await readJsonBody<BookCreateRequest>(req)
        const bookName = body?.bookName?.trim()
        if (bookName === undefined || bookName === '') {
          writeJson(res, 400, { error: 'bookName 不能为空' })
          return
        }
        const outputDir = body?.outputDir?.trim() !== '' && body?.outputDir !== undefined
          ? body.outputDir
          : defaultOutputDirFor(bookName)
        const book = createBook(bookName, outputDir)
        // 开书向导：创建时带大纲 → 立即建立项目（书名以大纲首行为准）。
        const outline = body?.outline?.trim()
        if (outline !== undefined && outline.length >= 50) {
          const project = createProject(outline)
          saveProject(outputDir, project)
          renameBook(book.id, project.bookName)
        }
        writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
        return
      }
      writeJson(res, 405, { error: 'method not allowed (expected GET or POST)' })
    },
  }

  // --------------------------------------------------------------- reset
  /** 重置项目：清空设定/卷/章节计划/正文/伏笔/资产/事实库（可携带新大纲）。 */
  const resetRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.reset,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = loadProject(config.outputDir)
      if (project === undefined) {
        writeJson(res, 400, { error: '输出目录中没有项目，无需重置' })
        return
      }
      const body = await readJsonBody<ResetRequest>(req)
      const outline = body?.outline?.trim()
      if (outline !== undefined && outline.length >= 50) {
        project.outline = outline
        project.bookName = createProject(outline).bookName
      }
      project.bible = undefined
      project.volumes = undefined
      project.chapters = []
      project.foreshadows = []
      project.assets = emptyProjectAssets()
      project.facts = []
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, bookName: project.bookName })
    },
  }

  // --------------------------------------------------- bookshelf activate
  const bookshelfActivateRoute: WebRoute = {
    kind: 'exact',
    path: '/api/dsh-novel-forge/bookshelf/activate',
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookActivateRequest>(req)
      if (body?.id === undefined || body.id === '') {
        writeJson(res, 400, { error: 'id 不能为空' })
        return
      }
      const book = activateBook(body.id)
      if (book === undefined) {
        writeJson(res, 404, { error: `书 ${body.id} 不存在` })
        return
      }
      writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
    },
  }

  // ---------------------------------------------------- bookshelf remove
  const bookshelfRemoveRoute: WebRoute = {
    kind: 'exact',
    path: '/api/dsh-novel-forge/bookshelf/remove',
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookRemoveRequest>(req)
      if (body?.id === undefined || body.id === '') {
        writeJson(res, 400, { error: 'id 不能为空' })
        return
      }
      const removed = removeBook(body.id)
      if (!removed) {
        writeJson(res, 404, { error: `书 ${body.id} 不存在` })
        return
      }
      writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
    },
  }

  // ------------------------------------------- bookshelf import-dir
  /** 导入已有项目目录（Mode A）：校验 novel-project.json，登记/激活书架。 */
  const bookshelfImportDirRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bookshelfImportDir,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookImportDirRequest>(req)
      const outputDir = body?.outputDir?.trim()
      if (outputDir === undefined || outputDir === '') {
        writeJson(res, 400, { error: 'outputDir 不能为空' })
        return
      }
      try {
        const { book, existed } = importDir(outputDir)
        writeJson(res, 200, { book, existed })
      } catch (err) {
        writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
      }
    },
  }

  // ------------------------------------------- bookshelf import-text
  /** 导入 txt/md 全本（Mode B）：拆章落盘建项目，登记书架。支持浏览器上传（text+fileName）与服务器本地文件（filePath）两种模式。 */
  const bookshelfImportTextRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bookshelfImportText,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookImportTextRequest>(req)
      try {
        // 模式二：浏览器上传全文内容
        if (body?.text !== undefined && body.text.length > 0) {
          const bookName = (body.fileName ?? '').replace(/\.[^.]+$/, '').trim().slice(0, 40) || '导入小说'
          const outDir = body?.outputDir?.trim() !== undefined && body.outputDir.trim() !== ''
            ? body.outputDir.trim()
            : defaultOutputDirFor(bookName)
          const result = importBookTextFromText(body.text, outDir, bookName)
          const { book } = importDir(outDir)
          writeJson(res, 200, { ...result, book })
          return
        }
        // 模式一：服务器本地文件
        const filePath = body?.filePath?.trim()
        if (filePath === undefined || filePath === '') {
          writeJson(res, 400, { error: 'filePath 不能为空（或请上传文件内容）' })
          return
        }
        if (!existsSync(filePath)) {
          writeJson(res, 400, { error: `文件不存在：${filePath}` })
          return
        }
        const bookName = basename(filePath, extname(filePath)).slice(0, 40) || '导入小说'
        const outDir = body?.outputDir?.trim() !== undefined && body.outputDir.trim() !== ''
          ? body.outputDir.trim()
          : defaultOutputDirFor(bookName)
        const result = importBookText(filePath, outDir)
        const { book } = importDir(outDir)
        writeJson(res, 200, { ...result, book })
      } catch (err) {
        writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
      }
    },
  }

  // --------------------------------------- bookshelf import-text preview
  /** 上传全文做拆章预览（不落盘、不登记书架）。 */
  const bookshelfImportTextPreviewRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bookshelfImportTextPreview,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookImportTextPreviewRequest>(req)
      if (body?.text === undefined || body.text.length === 0) {
        writeJson(res, 400, { error: 'text 不能为空' })
        return
      }
      try {
        const bookName = (body.fileName ?? '').replace(/\.[^.]+$/, '').trim().slice(0, 40) || '导入小说'
        const preview = previewBookText(body.text)
        writeJson(res, 200, { bookName, ...preview })
      } catch (err) {
        writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
      }
    },
  }

  // ---------------------------------------------------------------- audit
  /** 全书一致性质检。 */
  const auditRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.audit,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const startedAt = new Date().toISOString()
      auditState = { status: 'running', startedAt, totalBatches: 0, completedBatches: 0 }
      try {
        const issues = await auditBook(ctx, config, project, config.outputDir, (completed, total) => {
          auditState.totalBatches = total
          auditState.completedBatches = completed
        })
        const auditedChapters = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating').length
        auditState = {
          status: 'done',
          startedAt,
          finishedAt: new Date().toISOString(),
          totalBatches: auditState.totalBatches,
          completedBatches: auditState.totalBatches,
          auditedChapters,
          issuesCount: issues.length,
          issues,
        }
        const response: AuditResponse = {
          issues,
          auditedChapters,
          auditedAt: auditState.finishedAt!,
        }
        writeJson(res, 200, response)
      } catch (error) {
        auditState = {
          ...auditState,
          status: 'error',
          finishedAt: new Date().toISOString(),
          error: (error as Error).message,
        }
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ----------------------------------------------------- characters refresh
  /** 角色卡刷新（出场统计精确化 + LLM 聚合状态）。 */
  const charactersRefreshRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.charactersRefresh,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      try {
        const cards = await refreshCharacters(ctx, config, project, config.outputDir)
        // 存档：人物志聚合结果落盘，下次打开直接显示，无需重新计算。
        project.roleStatus = cards
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------- facts backfill
  /** 事实库回填：对历史已生成章节批量抽取事实。 */
  const factsBackfillRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.factsBackfill,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      try {
        const filled = await backfillFacts(ctx, config, project, config.outputDir)
        writeJson(res, 200, { ok: true, filled })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- bible patch
  /** 设定圣经局部修补（世界观规则/红线/风格）。 */
  const biblePatchRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.biblePatch,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      if (project.bible === undefined) {
        writeJson(res, 400, { error: '尚未生成道藏，请先生成' })
        return
      }
      const body = await readJsonBody<BiblePatchRequest>(req)
      if (Array.isArray(body?.worldRules)) project.bible.worldRules = body.worldRules.filter(r => r.trim() !== '')
      if (Array.isArray(body?.redLines)) project.bible.redLines = body.redLines.filter(r => r.trim() !== '')
      if (Array.isArray(body?.style)) project.bible.style = body.style.filter(r => r.trim() !== '')
      if (Array.isArray(body?.characters)) {
        project.bible.characters = body.characters
          .filter(c => c !== undefined && c !== null && typeof c.name === 'string' && c.name.trim() !== '')
          .map(c => ({
            name: c.name.trim(),
            role: (['protagonist', 'supporting', 'antagonist', 'other'] as const).includes(c.role as never)
              ? c.role as StoryBible['characters'][number]['role']
              : 'other',
            traits: Array.isArray(c.traits) ? c.traits.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [],
            goals: typeof c.goals === 'string' ? c.goals : '',
            relations: typeof c.relations === 'string' ? c.relations : '',
            knowledge: Array.isArray(c.knowledge)
              ? c.knowledge.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
              : undefined,
          }))
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { bible: project.bible })
    },
  }

  // ---------------------------------------------------------------- blurb
  /** 小说简介：AI 生成/补全，或手动保存。 */
  const blurbRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.blurb,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<BlurbRequest>(req)
      try {
        if (body?.action === 'save') {
          const text = body.text?.trim() ?? ''
          project.blurb = text
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { blurb: text })
          return
        }
        const partial = body?.partial?.trim() ?? ''
        const blurb = await generateBlurb(ctx, config, project, partial)
        project.blurb = blurb
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { blurb })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------------- cover
  /** 封面：GET 读取（dataUrl）；POST 上传（base64）或移除。 */
  const coverRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.cover,
    handler: async (req, res) => {
      const config = getConfig()
      if (req.method === 'GET') {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        // 书架页按书读取：?dir=<输出目录>；省略时用当前激活书目录。
        const url = new URL(req.url ?? '/', 'http://localhost')
        const dirParam = url.searchParams.get('dir')
        const targetDir = dirParam !== null && dirParam !== '' ? dirParam : config.outputDir
        const project = loadProject(targetDir)
        const coverPath = project?.coverPath
        if (coverPath === undefined || coverPath === '') {
          writeJson(res, 200, { dataUrl: null } satisfies CoverResponse)
          return
        }
        const file = join(targetDir, coverPath)
        if (!existsSync(file)) {
          writeJson(res, 200, { dataUrl: null } satisfies CoverResponse)
          return
        }
        const mime = coverPath.toLowerCase().endsWith('.png') ? 'image/png'
          : coverPath.toLowerCase().endsWith('.jpg') || coverPath.toLowerCase().endsWith('.jpeg') ? 'image/jpeg'
            : coverPath.toLowerCase().endsWith('.webp') ? 'image/webp'
              : 'image/png'
        const dataUrl = `data:${mime};base64,${readFileSync(file).toString('base64')}`
        writeJson(res, 200, { dataUrl } satisfies CoverResponse)
        return
      }
      if (req.method === 'POST') {
        if (!guard(req, res, 'POST')) return
        const project = requireProject(res)
        if (project === undefined) return
        const body = await readJsonBody<CoverRequest>(req)
        try {
          if (body?.action === 'remove') {
            if (project.coverPath !== undefined && project.coverPath !== '') {
              const oldFile = join(config.outputDir, project.coverPath)
              if (existsSync(oldFile)) rmSync(oldFile, { force: true })
            }
            project.coverPath = undefined
            project.updatedAt = new Date().toISOString()
            saveProject(config.outputDir, project)
            writeJson(res, 200, { ok: true, coverPath: null })
            return
          }
          const dataUrl = body?.dataUrl ?? ''
          const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/s.exec(dataUrl)
          if (match === null) {
            writeJson(res, 400, { error: '封面须为 PNG/JPEG/WebP 的 base64 data URL' })
            return
          }
          const mime = match[1]!
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
          const fileName = `cover.${ext}`
          const targetPath = join(config.outputDir, fileName)
          const oldPath = project.coverPath
          mkdirSync(config.outputDir, { recursive: true })
          writeFileSync(targetPath, Buffer.from(match[2]!, 'base64'))
          if (oldPath !== undefined && oldPath !== '' && oldPath !== fileName) {
            const oldFile = join(config.outputDir, oldPath)
            if (existsSync(oldFile)) rmSync(oldFile, { force: true })
          }
          project.coverPath = fileName
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { ok: true, coverPath: fileName })
        } catch (error) {
          writeJson(res, 500, { error: (error as Error).message })
        }
        return
      }
      writeJson(res, 405, { error: 'method not allowed (expected GET or POST)' })
    },
  }

  // ---------------------------------------------------------------- world
  /** 大世界：AI 提炼或手动保存（境界体系/区域/势力）。 */
  const worldRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.world,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<WorldRequest>(req)
      try {
        if (body?.action === 'save' && body.world !== undefined) {
          project.world = {
            realms: Array.isArray(body.world.realms) ? body.world.realms : [],
            regions: Array.isArray(body.world.regions) ? body.world.regions : [],
            factions: Array.isArray(body.world.factions) ? body.world.factions : [],
          }
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { world: project.world })
          return
        }
        const world = await extractWorld(ctx, config, project)
        project.world = world
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { world })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // --------------------------------------------------------------- rename
  /** 重命名当前书：同步项目 bookName 与书架条目。 */
  const renameRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.rename,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<RenameRequest>(req)
      const bookName = body?.bookName?.trim()
      if (bookName === undefined || bookName === '') {
        writeJson(res, 400, { error: '书名不能为空' })
        return
      }
      project.bookName = bookName.slice(0, 60)
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      const store = loadBookshelf()
      if (store.activeBookId !== null) renameBook(store.activeBookId, project.bookName)
      writeJson(res, 200, { bookName: project.bookName })
    },
  }

  // ------------------------------------------------------------- plotlines
  /** 剧情线管理：增删改 + 关联章节（主线/支线/人物线/悬念线）。 */
  const plotlinesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.plotlines,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<PlotlinesRequest>(req)
      if (project.plotlines === undefined) project.plotlines = []
      const op = body?.op
      if (op === 'add' && body?.line !== undefined) {
        const line = body.line
        project.plotlines.push({
          id: line.id !== '' ? line.id : `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: line.name.slice(0, 40),
          kind: line.kind,
          goal: line.goal.slice(0, 300),
          progress: line.progress.slice(0, 300),
          status: line.status,
          chapters: Array.isArray(line.chapters) ? line.chapters.filter((n): n is number => typeof n === 'number') : [],
          createdAt: line.createdAt !== '' ? line.createdAt : new Date().toISOString(),
        })
      } else if (op === 'update' && body?.line !== undefined && body.line.id !== '') {
        const idx = project.plotlines.findIndex(l => l.id === body.line!.id)
        if (idx !== -1) {
          const line = body.line
          project.plotlines[idx] = {
            ...project.plotlines[idx]!,
            name: line.name.slice(0, 40),
            kind: line.kind,
            goal: line.goal.slice(0, 300),
            progress: line.progress.slice(0, 300),
            status: line.status,
          }
        }
      } else if (op === 'remove' && body?.id !== undefined) {
        project.plotlines = project.plotlines.filter(l => l.id !== body.id)
      } else if (op === 'link' && body?.id !== undefined && typeof body.chapterNo === 'number' && body.chapterNo > 0) {
        const line = project.plotlines.find(l => l.id === body.id)
        if (line !== undefined && !line.chapters.includes(body.chapterNo)) {
          line.chapters.push(body.chapterNo)
          if (line.status === 'active' && line.progress === '') {
            line.progress = `推进至第 ${body.chapterNo} 章`
          }
        }
      } else if (op === 'suggest') {
        try {
          const suggestions = await suggestPlotlines(ctx, config, project)
          writeJson(res, 200, { plotlines: project.plotlines, suggestions } satisfies PlotlinesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `AI 建议失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'refresh' && body?.id !== undefined) {
        const line = project.plotlines.find(l => l.id === body.id)
        if (line === undefined) {
          writeJson(res, 404, { error: '剧情线不存在' })
          return
        }
        try {
          const progress = await refreshPlotlineProgress(ctx, config, project, line)
          line.progress = progress
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { plotlines: project.plotlines } satisfies PlotlinesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `刷新进度失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'health') {
        try {
          const health = await analyzePlotlineHealth(ctx, config, project)
          writeJson(res, 200, { plotlines: project.plotlines, health } satisfies PlotlinesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `健康检查失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'plan') {
        try {
          const health = await analyzePlotlineHealth(ctx, config, project)
          const plan = await designPlotlinePlan(ctx, config, project, health)
          writeJson(res, 200, { plotlines: project.plotlines, health, plan } satisfies PlotlinesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `剧情方案生成失败：${(error as Error).message}` })
          return
        }
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      const response: PlotlinesResponse = { plotlines: project.plotlines }
      writeJson(res, 200, response)
    },
  }

  // --------------------------------------------------------- sensitive
  /** 敏感词检查：指定章节 / 任意文本 / 全书已写章节。 */
  const sensitiveRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.sensitiveCheck,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<SensitiveCheckRequest>(req)
      const hits: SensitiveHit[] = []
      let scanned = 0
      if (body?.text !== undefined) {
        for (const hit of checkSensitiveText(body.text)) {
          hits.push({ chapterNo: 0, word: hit.word, category: hit.category, count: hit.count })
        }
      } else if (typeof body?.chapterNo === 'number') {
        const chapter = project.chapters.find(c => c.no === body.chapterNo)
        if (chapter !== undefined) {
          const text = readChapterFile(config.outputDir, chapter)
          if (text !== undefined) {
            scanned = 1
            for (const hit of checkSensitiveText(text)) {
              hits.push({ chapterNo: chapter.no, word: hit.word, category: hit.category, count: hit.count })
            }
          }
        }
      } else if (body?.all === true) {
        for (const chapter of project.chapters) {
          if (chapter.status === 'pending' || chapter.status === 'generating') continue
          const text = readChapterFile(config.outputDir, chapter)
          if (text === undefined) continue
          scanned++
          for (const hit of checkSensitiveText(text)) {
            hits.push({ chapterNo: chapter.no, word: hit.word, category: hit.category, count: hit.count })
          }
        }
      } else {
        writeJson(res, 400, { error: '请提供 chapterNo / text / all 之一' })
        return
      }
      const response: SensitiveCheckResponse = { hits, scannedChapters: scanned }
      writeJson(res, 200, response)
    },
  }

  // ---------------------------------------------------------------- roles
  /** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
  const rolesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.roles,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<RolesRequest>(req)
      if (project.roles === undefined) project.roles = []
      const op = body?.op
      if (op === 'extract') {
        try {
          const candidates = await extractRoles(ctx, config, project)
          writeJson(res, 200, { roles: project.roles, candidates } satisfies RolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `角色提炼失败：${(error as Error).message}` })
          return
        }
      } else if ((op === 'adopt' || op === 'update') && body?.role !== undefined) {
        const r = body.role
        const idx = project.roles.findIndex(x => x.name === r.name)
        if (idx === -1) project.roles.push(r)
        else project.roles[idx] = r
      } else if (op === 'remove' && body?.name !== undefined) {
        project.roles = project.roles.filter(x => x.name !== body.name)
      } else if (op === 'image') {
        const name = body?.name?.trim()
        const dataUrl = body?.dataUrl?.trim()
        if (name === undefined || name === '') {
          writeJson(res, 400, { error: 'name（角色名）必填' })
          return
        }
        if (dataUrl === undefined || dataUrl === '') {
          writeJson(res, 400, { error: 'dataUrl（参考图）必填' })
          return
        }
        const role = project.roles.find(r => r.name === name)
        if (role === undefined) {
          writeJson(res, 404, { error: `当前激活《${project.bookName}》，角色 ${name} 不存在——若期望的书不对，请先在书架切换该书并刷新` })
          return
        }
        const label = body?.label?.trim() ?? ''
        if (label !== '') {
          // 图集上传：带用途标签。标签「立绘」时同步为角色参考图（imageUrl）。
          role.gallery ??= []
          role.gallery = role.gallery.filter(g => g.label !== label)
          role.gallery.push({ label, dataUrl })
          if (label === '立绘' || label.includes('立绘')) role.imageUrl = dataUrl
        } else {
          // 兼容旧行为：不带标签 = 角色参考图。
          role.imageUrl = dataUrl
        }
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { roles: project.roles, imageUrl: role.imageUrl } satisfies RolesResponse)
        return
      } else if (op === 'removeImage') {
        const name = body?.name?.trim()
        const label = body?.label?.trim() ?? ''
        const role = project.roles.find(r => r.name === name)
        if (role !== undefined) {
          if (label !== '') {
            role.gallery = (role.gallery ?? []).filter(g => g.label !== label)
            if (label === '立绘' || label.includes('立绘')) role.imageUrl = undefined
          } else {
            role.imageUrl = undefined
          }
        }
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { roles: project.roles } satisfies RolesResponse)
        return
      } else if (op === 'imageGenerate') {
        const name = body?.name?.trim()
        if (name === undefined || name === '') {
          writeJson(res, 400, { error: 'name（角色名）必填' })
          return
        }
        try {
          const imageUrl = await generateRoleReferenceImage(ctx, config, project, config.outputDir, name, body?.style ?? '', body?.modelId)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { roles: project.roles, imageUrl } satisfies RolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `角色参考图生成失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'visual') {
        // 动漫形象描述词提炼：扫描正文外貌描写 → LLM 提炼 → 写入角色卡。
        const name = body?.name?.trim()
        if (name === undefined || name === '') {
          writeJson(res, 400, { error: 'name（角色名）必填' })
          return
        }
        try {
          const visual = await extractRoleVisual(ctx, config, project, config.outputDir, name, body?.styleId, body?.filterId)
          const role = project.roles.find(r => r.name === name)
          if (role !== undefined) {
            role.imagePrompt = visual
            if ((visual.expressions ?? []).length > 0) role.expressions = visual.expressions
            if (visual.promptKit !== undefined) role.promptKit = visual.promptKit
          }
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { roles: project.roles, visual } satisfies RolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `形象提炼失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'promptKit') {
        // 角色四类提示词精修包（立绘/四视图/表情/细节）
        const name = body?.name?.trim()
        if (name === undefined || name === '') {
          writeJson(res, 400, { error: 'name（角色名）必填' })
          return
        }
        try {
          const kit = await generateRolePromptKit(ctx, config, project, name, body?.styleId, body?.filterId)
          const role = project.roles.find(r => r.name === name)
          if (role !== undefined) role.promptKit = kit
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { roles: project.roles, promptKit: kit } satisfies RolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `提示词精修失败：${(error as Error).message}` })
          return
        }
      } else {
        writeJson(res, 400, { error: '未知的 roles op' })
        return
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      const response: RolesResponse = { roles: project.roles }
      writeJson(res, 200, response)
    },
  }

  // ------------------------------------------------------- manga roles
  /** 漫剧角色库：从分镜提名（规则+LLM 两段式）/ 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
  const mangaRolesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.mangaRoles,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<MangaRolesRequest>(req)
      if (project.mangaRoles === undefined) project.mangaRoles = []
      const op = body?.op
      if (op === 'nominate') {
        const chapterNo = body?.chapterNo
        if (typeof chapterNo !== 'number' || chapterNo <= 0) {
          writeJson(res, 400, { error: 'chapterNo（章号）必填' })
          return
        }
        try {
          const candidates = await nominateMangaRoles(ctx, config, project, config.outputDir, chapterNo)
          writeJson(res, 200, { cards: project.mangaRoles, candidates } satisfies MangaRolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `提名失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'adopt' || op === 'update') {
        const card = body?.card
        if (card === undefined || typeof card !== 'object') {
          writeJson(res, 400, { error: 'card（漫剧角色卡）必填' })
          return
        }
        const name = (card.name ?? '').trim()
        if (name === '') {
          writeJson(res, 400, { error: '漫剧角色名不能为空' })
          return
        }
        const now = new Date().toISOString()
        const existing = card.id !== '' ? project.mangaRoles.find(c => c.id === card.id) : undefined
        const next: MangaRoleCard = {
          id: card.id !== '' ? card.id : 'mr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          sourceRoleName: card.sourceRoleName !== undefined && card.sourceRoleName !== '' ? card.sourceRoleName : undefined,
          name,
          identity: card.identity ?? '',
          coreFunction: card.coreFunction ?? 'functional',
          protagonistRelation: card.protagonistRelation ?? 'neutral',
          speechStyle: card.speechStyle ?? '',
          traits: Array.isArray(card.traits) ? card.traits.map(t => String(t).slice(0, 20)).filter(t => t !== '').slice(0, 3) : [],
          appearance: card.appearance ?? '',
          keyScenes: Array.isArray(card.keyScenes) ? card.keyScenes.map(k => String(k).slice(0, 120)).filter(k => k !== '').slice(0, 6) : [],
          appearsInEpisodes: Array.isArray(card.appearsInEpisodes)
            ? [...new Set(card.appearsInEpisodes.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b).slice(0, 200)
            : [],
          status: card.status ?? 'imported',
          imagePrompt: card.imagePrompt,
          expressions: card.expressions,
          promptKit: card.promptKit,
          imageUrl: card.imageUrl,
          gallery: card.gallery,
          promptStyleId: card.promptStyleId,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        if (existing !== undefined) {
          const idx = project.mangaRoles.findIndex(c => c.id === card.id)
          project.mangaRoles[idx] = next
        } else {
          project.mangaRoles.push(next)
        }
        project.updatedAt = now
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards: project.mangaRoles } satisfies MangaRolesResponse)
        return
      } else if (op === 'remove') {
        const id = body?.id
        if (typeof id !== 'string' || id === '') {
          writeJson(res, 400, { error: 'id（漫剧卡 id）必填' })
          return
        }
        project.mangaRoles = project.mangaRoles.filter(c => c.id !== id)
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards: project.mangaRoles } satisfies MangaRolesResponse)
        return
      } else if (op === 'visual') {
        const id = body?.id?.trim()
        if (id === undefined || id === '') {
          writeJson(res, 400, { error: 'id（漫剧卡 id）必填' })
          return
        }
        try {
          const visual = await extractMangaRoleVisual(ctx, config, project, config.outputDir, id, body?.styleId, body?.filterId)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { cards: project.mangaRoles, visual } satisfies MangaRolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `形象锚点生成失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'promptKit') {
        const id = body?.id?.trim()
        if (id === undefined || id === '') {
          writeJson(res, 400, { error: 'id（漫剧卡 id）必填' })
          return
        }
        try {
          const kit = await generateMangaRolePromptKit(ctx, config, project, id, body?.styleId, body?.filterId)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { cards: project.mangaRoles, promptKit: kit } satisfies MangaRolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `提示词精修失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'image') {
        // 定妆图上传：带标签进图集；标签含「立绘」时同步为参考图（imageUrl）。
        const id = body?.id?.trim()
        const dataUrl = body?.dataUrl?.trim()
        if (id === undefined || id === '') {
          writeJson(res, 400, { error: 'id（漫剧卡 id）必填' })
          return
        }
        if (dataUrl === undefined || dataUrl === '') {
          writeJson(res, 400, { error: 'dataUrl（定妆图）必填' })
          return
        }
        const card = project.mangaRoles.find(c => c.id === id)
        if (card === undefined) {
          writeJson(res, 404, { error: '漫剧角色卡不存在' })
          return
        }
        const label = body?.label?.trim() ?? ''
        if (label !== '') {
          card.gallery ??= []
          card.gallery = card.gallery.filter(g => g.label !== label)
          card.gallery.push({ label, dataUrl })
          if (label.includes('立绘')) card.imageUrl = dataUrl
        } else {
          card.imageUrl = dataUrl
        }
        card.updatedAt = new Date().toISOString()
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards: project.mangaRoles, imageUrl: card.imageUrl } satisfies MangaRolesResponse)
        return
      } else if (op === 'removeImage') {
        const id = body?.id?.trim()
        const label = body?.label?.trim() ?? ''
        const card = project.mangaRoles.find(c => c.id === id)
        if (card !== undefined) {
          if (label !== '') {
            card.gallery = (card.gallery ?? []).filter(g => g.label !== label)
            if (label.includes('立绘')) card.imageUrl = undefined
          } else {
            card.imageUrl = undefined
          }
          card.updatedAt = new Date().toISOString()
        }
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards: project.mangaRoles } satisfies MangaRolesResponse)
        return
      } else if (op === 'imageGenerate') {
        const id = body?.id?.trim()
        if (id === undefined || id === '') {
          writeJson(res, 400, { error: 'id（漫剧卡 id）必填' })
          return
        }
        try {
          const imageUrl = await generateMangaRoleReferenceImage(ctx, config, project, config.outputDir, id, body?.style ?? '', body?.modelId)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { cards: project.mangaRoles, imageUrl } satisfies MangaRolesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `定妆图生成失败：${(error as Error).message}` })
          return
        }
      } else if (op === 'mode') {
        // 短剧精简模式开关（漫剧角色库 5-8 人 / 功能标签 / 关系闭环 / 人设极致化）。
        project.shortDramaMode = body?.shortDramaMode === true
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { cards: project.mangaRoles, shortDramaMode: project.shortDramaMode } satisfies MangaRolesResponse)
        return
      } else {
        writeJson(res, 400, { error: '未知的 manga/roles op' })
        return
      }
    },
  }

  // ------------------------------------------------------- chapter reset
  /** 章节复位：generating 卡死 → pending（可重新生成）。 */
  const chapterResetRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapterReset,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<{ chapterNo?: number }>(req)
      const no = body?.chapterNo
      if (!Number.isInteger(no) || no === undefined || no < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${no} 不在计划中` })
        return
      }
      chapter.status = 'pending'
      chapter.error = undefined
      chapter.generatingAt = undefined
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, no })
    },
  }

  // ------------------------------------------------------ chapter approve
  /** 章节直接通过：作者行使最终决定权（不重审，保留审稿记录）。 */
  const chapterApproveRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapterApprove,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<{ chapterNo?: number }>(req)
      const no = body?.chapterNo
      if (!Number.isInteger(no) || no === undefined || no < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${no} 不在计划中` })
        return
      }
      chapter.status = 'approved'
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, no })
    },
  }

  // ------------------------------------------------------ author review backfill
  /** 作者复盘补跑：对已写章节补齐 authorReview（body.chapterNo=单章 JSON，缺省=全书 NDJSON 流）。 */
  const reviewBackfillRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.reviewBackfill,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<{ chapterNo?: number }>(req)

      /** 对一章执行作者复盘（读取已落盘正文，不改变章节状态/正文）。 */
      const runOne = async (chapter: ChapterPlan): Promise<AuthorReview> => {
        const currentBody = readChapterFile(config.outputDir, chapter)
        if (currentBody === undefined) throw new Error(`章节 ${chapter.no} 的正文文件不存在`)
        let prevTail = ''
        if (chapter.no > 1) {
          const prev = project.chapters.find(c => c.no === chapter.no - 1)
          if (prev !== undefined) {
            prevTail = (readChapterFile(config.outputDir, prev) ?? '').replace(/^#.*$/m, '').trim().slice(-600)
          }
        }
        return authorReviewChapter(ctx, config, project, chapter.no, currentBody, prevTail)
      }

      // 单章：JSON 响应。
      if (typeof body?.chapterNo === 'number' && body.chapterNo > 0) {
        const chapter = project.chapters.find(c => c.no === body.chapterNo)
        if (chapter === undefined) {
          writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` })
          return
        }
        if (chapter.status === 'pending') {
          writeJson(res, 400, { error: '该章尚未生成正文，无法复盘' })
          return
        }
        try {
          const review = await runOne(chapter)
          chapter.authorReview = review
          if (review.advancedLines !== undefined) {
            autoLinkPlotlines(project, chapter.no, review.advancedLines)
          }
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { no: chapter.no, review } satisfies { no: number; review: AuthorReview })
          return
        } catch (error) {
          writeJson(res, 500, { error: (error as Error).message })
          return
        }
      }

      // 全书：NDJSON 流式补跑缺失复盘的已写章节。
      const missing = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error' && c.authorReview === undefined)
      if (missing.length === 0) {
        writeJson(res, 200, { count: 0 })
        return
      }
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => {
        res.write(JSON.stringify(frame) + '\n')
      }
      let done = 0
      for (const chapter of missing) {
        try {
          const review = await runOne(chapter)
          chapter.authorReview = review
          if (review.advancedLines !== undefined) {
            autoLinkPlotlines(project, chapter.no, review.advancedLines)
          }
          done++
          saveProject(config.outputDir, project)
          send({ type: 'author-review', no: chapter.no, review })
        } catch (error) {
          console.warn(`[dsh-novel-forge] author backfill ch.${chapter.no} failed:`, (error as Error).message)
        }
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      send({ type: 'author-backfill-done', count: done })
      res.end()
    },
  }

  // --------------------------------------------------------------- config
  const configRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.config,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<ConfigPatch>(req)
      if (body === undefined) {
        writeJson(res, 400, { error: '无效的配置 JSON' })
        return
      }
      try {
        const next = await patchConfig(body)
        writeJson(res, 200, { config: next })
      } catch (error) {
        writeJson(res, 400, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- open-folder
  const openFolderRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.openFolder,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const dir = config.outputDir
      const child = spawn('explorer', [dir], { shell: false })
      let responded = false
      child.on('error', (error) => {
        if (responded) return
        responded = true
        writeJson(res, 500, { ok: false, error: error.message })
      })
      child.on('exit', (code) => {
        if (responded) return
        responded = true
        if (code === 0) writeJson(res, 200, { ok: true })
        else writeJson(res, 500, { ok: false, error: `explorer 退出码 ${code}` })
      })
    },
  }

  // ------------------------------------------------------- outline suggest
  /** 开书想法 → AI 大纲：2-3 个可选方案（支持暂留换批：count 只补空槽 + exclude 避开已留方向）。 */
  const outlineSuggestRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.outlineSuggest,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const body = await readJsonBody<OutlineSuggestRequest>(req)
      const idea = body?.idea?.trim() ?? ''
      if (idea.length < 50) {
        writeJson(res, 400, { error: '想法太短（<50 字），请多写一两句：主角是谁、什么世界、想要什么爽点' })
        return
      }
      const count = body?.count !== undefined ? Math.max(1, Math.min(3, Math.floor(body.count))) : 3
      const exclude = Array.isArray(body?.exclude) ? body.exclude.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map(e => e.trim().slice(0, 200)) : []
      try {
        const candidates = await suggestOutlines(ctx, config, idea, count, exclude)
        const response: OutlineSuggestResponse = { candidates }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: `大纲方案生成失败：${(error as Error).message}` })
      }
    },
  }

  // ------------------------------------------------- outline reverse
  /** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流式进度）。 */
  const outlineReverseRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.outlineReverse,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => {
        res.write(JSON.stringify(frame) + '\n')
      }
      try {
        const outline = await reverseOutlineFromChapters(ctx, config, project, config.outputDir, (done, total, phase) => {
          send({ type: 'outline-progress', done, total, phase })
        })
        // 保存总纲（仅更新文本，不动书名/进度）。
        project.outline = outline
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        send({ type: 'outline-done', outline, chars: outline.length })
      } catch (error) {
        send({ type: 'error', no: 0, message: (error as Error).message })
      } finally {
        res.end()
      }
    },
  }

  // ------------------------------------------------- storyboard prompts
  /** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
  const storyboardPromptsRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.storyboardPrompts,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<StoryboardPromptsRequest>(req)
      const no = body?.chapterNo
      if (!Number.isInteger(no) || no === undefined || no < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      if (body?.table === undefined || (body.table.shots ?? []).length === 0) {
        writeJson(res, 400, { error: 'table 不能为空，请先生成分镜表' })
        return
      }
      try {
        const prompts = await generateStoryboardPrompts(ctx, config, project, config.outputDir, no, body.table, body?.styleId, body?.filterId)
        writeJson(res, 200, { prompts } satisfies StoryboardPromptsResponse)
      } catch (error) {
        writeJson(res, 500, { error: `视频提示词生成失败：${(error as Error).message}` })
      }
    },
  }

  // --------------------------------------------------------- image-test
  /** 生图接口连通性测试：GET {baseURL}/models + 计时（设置页模型条目用）。 */
  const imageTestRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.imageTest,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<ImageTestRequest>(req)
      if (body?.baseURL === undefined || body?.apiKey === undefined) {
        writeJson(res, 400, { error: 'baseURL 与 apiKey 必填' })
        return
      }
      try {
        const result = await testImageEndpoint(body.baseURL, body.apiKey, body.model)
        writeJson(res, 200, result satisfies ImageTestResponse)
      } catch (error) {
        writeJson(res, 500, { error: `测试失败：${(error as Error).message}` })
      }
    },
  }

  // ---------------------------------------------------- storyboard table
  /** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
  const storyboardTableRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.storyboardTable,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<StoryboardTableRequest>(req)
      const no = body?.chapterNo
      if (!Number.isInteger(no) || no === undefined || no < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      if (body?.skeleton === undefined || (body.skeleton.beats ?? []).length === 0) {
        writeJson(res, 400, { error: 'skeleton 不能为空，请先生成剧情骨架' })
        return
      }
      try {
        const table = await generateStoryboardTable(ctx, config, project, config.outputDir, no, body.skeleton, body?.styleId, body?.filterId)
        writeJson(res, 200, { table } satisfies StoryboardTableResponse)
      } catch (error) {
        writeJson(res, 500, { error: `分镜表生成失败：${(error as Error).message}` })
      }
    },
  }

  // ------------------------------------------------------ manhua plans
  /** 漫剧方案管理：create / remove / activate。 */
  const manhuaPlansRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.manhuaPlans,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<MangaPlansRequest>(req)
      if (project.mangaPlans === undefined) project.mangaPlans = []
      if (body?.op === 'create') {
        const name = body.name?.trim()
        const styleId = body.styleId?.trim()
        if (name === undefined || name === '' || styleId === undefined || styleId === '') {
          writeJson(res, 400, { error: 'name 与 styleId 不能为空' })
          return
        }
        if (project.mangaPlans.some(p => p.name === name)) {
          writeJson(res, 400, { error: `方案名「${name}」已存在` })
          return
        }
        const id = `manga-${Date.now().toString(36)}`
        project.mangaPlans.push({
          id,
          name: name.slice(0, 40),
          styleId,
          filterId: body.filterId?.trim() !== '' ? body.filterId?.trim() : undefined,
          active: project.mangaPlans.length === 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      } else if (body?.op === 'remove' && body.id !== undefined) {
        const removed = project.mangaPlans.find(p => p.id === body.id)
        project.mangaPlans = project.mangaPlans.filter(p => p.id !== body.id)
        if (removed?.active === true && project.mangaPlans.length > 0) {
          project.mangaPlans[0].active = true
        }
      } else if (body?.op === 'activate' && body.id !== undefined) {
        project.mangaPlans.forEach(p => { p.active = p.id === body.id })
      } else {
        writeJson(res, 400, { error: 'op 须为 create/remove/activate' })
        return
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { plans: project.mangaPlans } satisfies MangaPlansResponse)
    },
  }

  // ------------------------------------------------------ style image
  /** 风格库效果图：GET /styles/image?id=<styleId>，从 ~/.dsh/dsh-novel-forge-styles/<id>.png 读取。 */
  const styleImageRoute: WebRoute = {
    kind: 'exact',
    path: '/api/dsh-novel-forge/styles/image',
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      const url = new URL(req.url ?? '', 'http://localhost')
      const id = (url.searchParams.get('id') ?? '').replace(/[^a-z0-9-]/gi, '')
      if (id === '') {
        writeJson(res, 404, { error: 'style image not found' })
        return
      }
      // 图片来源：用户数据目录缩略图（自定义覆盖）→ 原图 → 包内置缩略图（随插件分发）。
      const base = join(homedir(), '.dsh', 'dsh-novel-forge-styles')
      const candidates: Array<{ file: string; type: string }> = [
        { file: join(base, 'thumbs', id + '.webp'), type: 'image/webp' },
        { file: join(base, id + '.png'), type: 'image/png' },
        { file: join(builtinStyleDir, id + '.webp'), type: 'image/webp' },
      ]
      for (const c of candidates) {
        if (existsSync(c.file)) {
          res.writeHead(200, { 'content-type': c.type, 'cache-control': 'public, max-age=86400' })
          res.end(readFileSync(c.file))
          return
        }
      }
      writeJson(res, 404, { error: 'style image not found' })
    },
  }

  // ------------------------------------------------------- storyboard
  /** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
  const storyboardSkeletonRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.storyboardSkeleton,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<StoryboardSkeletonRequest>(req)
      const no = body?.chapterNo
      if (!Number.isInteger(no) || no === undefined || no < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      try {
        const skeleton = await generateStoryboardSkeleton(ctx, config, project, config.outputDir, no)
        writeJson(res, 200, { skeleton } satisfies StoryboardSkeletonResponse)
      } catch (error) {
        writeJson(res, 500, { error: `剧情骨架生成失败：${(error as Error).message}` })
      }
    },
  }

  // ----------------------------------------------------------- breakdown
  /** 拆书分析：对已写章节做结构/人物/文风/卖点体检（两阶段：源笔记→分节分析）。 */
  const breakdownRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.breakdown,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<BreakdownRequest>(req)
      try {
        const result = await breakdownBook(
          ctx,
          config,
          project,
          config.outputDir,
          body?.scope ?? 'recent',
          body?.preset ?? 'quick',
          body?.budgetTokens ?? 50000,
        )
        writeJson(res, 200, result satisfies BreakdownResponse)
      } catch (error) {
        writeJson(res, 500, { error: `拆书分析失败：${(error as Error).message}` })
      }
    },
  }

  // --------------------------------------------------------------- scenes
  /** 场景库：AI 提炼 / 采纳 / 更新 / 删除 / 图集。 */
  const scenesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.scenes,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ScenesRequest>(req)
      if (project.scenes === undefined) project.scenes = []
      const op = body?.op
      if (op === 'extract') {
        try {
          const candidates = await extractScenes(ctx, config, project, body?.styleId, body?.filterId)
          writeJson(res, 200, { scenes: project.scenes, candidates } satisfies ScenesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `场景提炼失败：${(error as Error).message}` })
          return
        }
      } else if ((op === 'adopt' || op === 'update') && body?.scene !== undefined) {
        const s = body.scene
        const idx = project.scenes.findIndex(x => x.name === s.name)
        if (idx === -1) project.scenes.push(s)
        else project.scenes[idx] = s
      } else if (op === 'remove' && body?.name !== undefined) {
        project.scenes = project.scenes.filter(x => x.name !== body.name)
      } else if (op === 'image') {
        const name = body?.name?.trim()
        const dataUrl = body?.dataUrl?.trim()
        if (name === undefined || name === '' || dataUrl === undefined || dataUrl === '') {
          writeJson(res, 400, { error: 'name（场景名）与 dataUrl 必填' })
          return
        }
        const scene = project.scenes.find(x => x.name === name)
        if (scene === undefined) {
          writeJson(res, 404, { error: `当前激活《${project.bookName}》，场景 ${name} 不存在——若期望的书不对，请先在书架切换该书并刷新` })
          return
        }
        const label = body?.label?.trim() ?? '全景'
        scene.gallery ??= []
        scene.gallery = scene.gallery.filter(g => g.label !== label)
        scene.gallery.push({ label, dataUrl })
      } else if (op === 'removeImage') {
        const name = body?.name?.trim()
        const label = body?.label?.trim() ?? ''
        const scene = project.scenes.find(x => x.name === name)
        if (scene !== undefined && label !== '') {
          scene.gallery = (scene.gallery ?? []).filter(g => g.label !== label)
        }
      } else {
        writeJson(res, 400, { error: `未知操作 ${op}` })
        return
      }
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { scenes: project.scenes } satisfies ScenesResponse)
    },
  }

  // ----------------------------------------------------------- visual rules
  /** 视觉世界观规则：从道藏提炼（生图/生视频纠偏），或手动保存。 */
  const visualRulesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.visualRules,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<VisualRulesRequest>(req)
      if (body?.op === 'extract') {
        try {
          const rules = await extractVisualRules(ctx, config, project)
          project.visualRules = rules
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          writeJson(res, 200, { rules } satisfies VisualRulesResponse)
          return
        } catch (error) {
          writeJson(res, 500, { error: `视觉规则提炼失败：${(error as Error).message}` })
          return
        }
      } else if (body?.op === 'save' && Array.isArray(body.rules)) {
        project.visualRules = body.rules.filter(r => typeof r === 'string' && r.trim() !== '').map(r => r.trim().slice(0, 80)).slice(0, 12)
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        writeJson(res, 200, { rules: project.visualRules } satisfies VisualRulesResponse)
        return
      }
      writeJson(res, 400, { error: 'op 须为 extract 或 save' })
    },
  }

  // ----------------------------------------------------------- production run
  /** 生产单执行器（单例）：计划补足 → 逐章生成 → 被拒分级处理 → 断点续跑。 */
  const runner = new ProductionRunner({ ctx, getConfig })

  const runStartRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.runStart,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<RunStartRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      if (project === undefined) {
        writeJson(res, 400, { error: '输出目录中没有项目' })
        return
      }
      const startNo = Number.isInteger(body?.startNo) && (body!.startNo! >= 1) ? body!.startNo! : 1
      let endNo: number
      if (Number.isInteger(body?.endNo) && (body!.endNo! >= startNo)) {
        endNo = body!.endNo!
      } else if (Number.isInteger(body?.count) && (body!.count! >= 1) && (body!.count! <= 200)) {
        const last = Math.max(0, ...project.chapters.map(c => c.no))
        endNo = last + body!.count!
      } else {
        writeJson(res, 400, { error: '请提供 endNo 或 count（1-200）' })
        return
      }
      try {
        const state = await runner.start(startNo, endNo)
        writeJson(res, 200, state satisfies RunState)
      } catch (error) {
        writeJson(res, 409, { error: (error as Error).message })
      }
    },
  }

  const runControlRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.runControl,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<RunControlRequest>(req)
      const state = runner.status()
      if (state === null) {
        writeJson(res, 400, { error: '没有生产单' })
        return
      }
      if (body?.action === 'pause') runner.pause()
      else if (body?.action === 'resume') runner.resume()
      else if (body?.action === 'stop') runner.stop()
      else {
        writeJson(res, 400, { error: 'action 须为 pause / resume / stop' })
        return
      }
      writeJson(res, 200, runner.status())
    },
  }

  const runStatusRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.runStatus,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      writeJson(res, 200, runner.status())
    },
  }

  // -------------------------------------------------- author assets (总数据)
  const authorAssetsRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.authorAssets,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      const response: AuthorAssetsResponse = { assets: loadAuthorAssets() }
      writeJson(res, 200, response)
    },
  }

  const authorAssetsUpsertRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.authorAssetsUpsert,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<AuthorAssetUpsertRequest>(req)
      const asset = body?.asset
      if (asset === undefined || asset.name.trim() === '' || asset.content.trim() === '') {
        writeJson(res, 400, { error: 'asset 须含 name / content' })
        return
      }
      const response: AuthorAssetsResponse = { assets: upsertAuthorAsset(asset) }
      writeJson(res, 200, response)
    },
  }

  const authorAssetsRemoveRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.authorAssetsRemove,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<AuthorAssetRemoveRequest>(req)
      const id = body?.id ?? ''
      if (id === '') { writeJson(res, 400, { error: 'id 必填' }); return }
      const response: AuthorAssetsResponse = { assets: removeAuthorAsset(id) }
      writeJson(res, 200, response)
    },
  }

  const authorAssetsImportDefaultRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.authorAssetsImportDefault,
    handler: (req, res) => {
      if (!guard(req, res, 'POST')) return
      const response: AuthorAssetsResponse = { assets: importDefaultAuthorAssets() }
      writeJson(res, 200, response)
    },
  }

  // --------------------------------------------------- adaptation (改编 P0 分析)
  const adaptAnalyzeRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.adaptAnalyze,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      if (!getConfig().enableAdaptMode) { writeJson(res, 404, { error: '改编模式未开启' }); return }
      const body = await readJsonBody<AdaptAnalyzeRequest>(req)
      const config = getConfig()
      let text = body?.text?.trim() ?? ''
      if (text === '' && body?.filePath !== undefined && body.filePath !== '') {
        try {
          text = readFileSync(body.filePath, 'utf8')
        } catch (err) {
          writeJson(res, 400, { error: '读取文件失败：' + (err as Error).message })
          return
        }
      }
      if (text.length < 200) {
        writeJson(res, 400, { error: '全文内容过短（<200 字符），请上传完整小说文本' })
        return
      }
      try {
        const response: AdaptAnalyzeResponse = await analyzeAdaptation(ctx, config, text)
        writeJson(res, 200, response)
      } catch (err) {
        writeJson(res, 400, { error: (err as Error).message })
      }
    },
  }

  const adaptProposeRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.adaptPropose,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      if (!getConfig().enableAdaptMode) { writeJson(res, 404, { error: '改编模式未开启' }); return }
      const body = await readJsonBody<AdaptProposeRequest>(req)
      const config = getConfig()
      const text = (body?.text ?? '').trim()
      const selections = body?.selections ?? []
      if (text.length < 200 || selections.length === 0) {
        writeJson(res, 400, { error: '请提供全文与至少一条要改的维度' })
        return
      }
      try {
        const response: AdaptProposeResponse = await proposeAdaptation(ctx, config, text, selections, body?.dimensions)
        writeJson(res, 200, response)
      } catch (err) {
        writeJson(res, 400, { error: (err as Error).message })
      }
    },
  }

  const adaptExecuteRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.adaptExecute,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      if (!getConfig().enableAdaptMode) { writeJson(res, 404, { error: '改编模式未开启' }); return }
      const body = await readJsonBody<AdaptExecuteRequest>(req)
      const text = body?.text ?? ''
      const mappings = body?.mappings ?? []
      if (text.length < 200 || mappings.length === 0) {
        writeJson(res, 400, { error: '请提供全文与映射表' })
        return
      }
      if (body?.mode === 'rewrite') {
        writeJson(res, 400, { error: 'rewrite 模式尚未实现，请使用 replace（术语替换）' })
        return
      }
      const { adaptedText, hits } = applyAdaptationReplacements(text, mappings)
      const response: AdaptExecuteResponse = { adaptedText, mappings: mappings.length, hits }
      writeJson(res, 200, response)
    },
  }

  // ------------------------------------------ theme custom background (upload + serve)
  const THEME_BG_DIR = join(homedir(), '.dsh', 'dsh-novel-forge-assets')
  const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

  const themeBackgroundUploadRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.themeBackgroundUpload,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<{ dataUrl?: string }>(req)
      const dataUrl = body?.dataUrl ?? ''
      const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i.exec(dataUrl)
      if (m === null) { writeJson(res, 400, { error: '仅支持 PNG/JPG/WebP/GIF 图片' }); return }
      const ext = m[1]!.toLowerCase() === 'jpg' ? 'jpeg' : m[1]!.toLowerCase()
      const buf = Buffer.from(m[2]!, 'base64')
      if (buf.length === 0) { writeJson(res, 400, { error: '图片数据为空' }); return }
      mkdirSync(THEME_BG_DIR, { recursive: true })
      const name = 'theme-bg-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex') + '.' + ext
      writeFileSync(join(THEME_BG_DIR, name), buf)
      writeJson(res, 200, { url: NOVEL_API.themeBackgroundGet + '/' + name })
    },
  }

  const themeBackgroundGetRoute: WebRoute = {
    kind: 'prefix',
    path: NOVEL_API.themeBackgroundGet,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      let pathName = ''
      try { pathName = new URL(req.url ?? '', 'http://localhost').pathname } catch { /* ignore */ }
      const name = basename(pathName)
      if (!name.startsWith('theme-bg-')) { writeJson(res, 404, { error: 'not found' }); return }
      const file = join(THEME_BG_DIR, name)
      if (!existsSync(file)) { writeJson(res, 404, { error: 'not found' }); return }
      const ext = extname(file).slice(1)
      const type = MIME_BY_EXT[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000' })
      res.end(readFileSync(file))
    },
  }

  return [
    statusRoute,
    loadOutlineRoute,
    saveOutlineRoute,
    bibleRoute,
    volumesRoute,
    planRoute,
    generateRoute,
    reviewRoute,
    rewriteRoute,
    polishRoute,
    draftApplyRoute,
    draftDiscardRoute,
    summaryRoute,
    foreshadowRoute,
    exportRoute,
    chapterRoute,
    chapterCheckRoute,
    chapterSaveRoute,
    assetsRoute,
    styleEngineRoute,
    assistantRoute,
    assistantHistoryRoute,
    assistantClearRoute,
    bookshelfRoute,
    bookshelfActivateRoute,
    bookshelfRemoveRoute,
    bookshelfImportDirRoute,
    bookshelfImportTextRoute,
    bookshelfImportTextPreviewRoute,
    resetRoute,
    auditRoute,
    charactersRefreshRoute,
    factsBackfillRoute,
    biblePatchRoute,
    blurbRoute,
    coverRoute,
    worldRoute,
    renameRoute,
    plotlinesRoute,
    rolesRoute,
    mangaRolesRoute,
    scenesRoute,
    visualRulesRoute,
    sensitiveRoute,
    reviewBackfillRoute,
    chapterResetRoute,
    chapterApproveRoute,
    configRoute,
    openFolderRoute,
    outlineSuggestRoute,
    outlineReverseRoute,
    manhuaPlansRoute,
    styleImageRoute,
    storyboardSkeletonRoute,
    imageTestRoute,
    storyboardTableRoute,
    storyboardPromptsRoute,
    breakdownRoute,
    runStartRoute,
    runControlRoute,
    runStatusRoute,
    authorAssetsRoute,
    authorAssetsUpsertRoute,
    authorAssetsRemoveRoute,
    authorAssetsImportDefaultRoute,
    adaptAnalyzeRoute,
    adaptProposeRoute,
    adaptExecuteRoute,
    themeBackgroundUploadRoute,
    themeBackgroundGetRoute,
  ]
}

// Re-export for tests / type consumers.
export type {
  ConfigPatch,
  NovelConfig,
  StatusResponse,
  PlanResponse,
  LoadOutlineResponse,
  BibleResponse,
  VolumesResponse,
  ExportResponse,
}
export { chapterFileName }
