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
export const COMPLIANCE_REDLINES: ReadonlyArray<string> = [
  '1. 不得出现反对宪法所确定的基本原则的内容。',
  '2. 不得出现危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一的内容。',
  '3. 不得出现危害国家荣誉和利益的内容。',
  '4. 不得出现煽动民族仇恨、民族歧视、破坏民族团结的内容。',
  '5. 不得出现破坏国家宗教政策、宣扬邪教和愚昧迷信的内容（不得以真实宗教、邪教或迷信活动为背景进行宣扬）。',
  '6. 不得出现散布谣言、扰乱社会秩序、破坏社会稳定的内容。',
  '7. 不得出现淫秽色情、赌博、暴力、凶杀、恐怖或教唆犯罪的内容（网文语境：禁止露骨性描写、血腥暴力渲染、赌博教唆、犯罪手法详细教学）。',
  '8. 不得出现侮辱或者诽谤他人、侵害他人合法权益的内容（不得以真实人物、组织为原型进行侮辱或影射攻击）。',
  '9. 不得出现法律法规禁止的其他内容。',
]

/** 审稿维度取值（与 review-policy.ts 的 REVIEW_DIMENSIONS 对齐，用于归一化模型输出的 dimension 字段）。 */
const REVIEW_DIMENSION_IDS = new Set(['character', 'setting', 'redline', 'writing', 'pacing', 'logic', 'anti-ai', 'presentation', 'compliance'])

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, renameSync } from 'node:fs'
import { join, basename, extname, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { createUserMessage, BlockAssembler, ReasoningEffortId, type GenerateOptions, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { emptyProjectAssets, renderAllAssets, styleEngineSystemPrompt } from './assets.ts'
import { getComicStylePrompt } from './comic-presets.ts'
import { getGenreRules } from './manga-genre-rules.ts'
import { findStyle, styleKeywords } from './style-library.ts'
import { scanAiFlavor } from './ai-scan.ts'
import { buildChapterContext, renderContextBlocks } from './novel-context.ts'
import {
  normalizeShotSize,
  normalizeCameras,
  normalizeComposition,
  normalizeLightings,
  sizeZh,
  cameraZh,
  lightZh,
} from './shot-language.ts'
import {
  normalizeStoryFunction,
  normalizeEmotions,
  functionZh,
  emotionZh,
} from './story-beat-language.ts'
import type {
  AdaptationDimension,
  AdaptAnalyzeResponse,
  AdaptationMapping,
  AdaptationProposal,
  AdaptationRules,
  AdaptProposeResponse,
  AdaptExecuteResponse,
  AuditIssue,
  AuthorReview,
  BreakdownResponse,
  ChapterPlan,
  Foreshadow,
  NovelConfig,
  OutlineCandidate,
  Plotline,
  PlotlineHealthReport,
  PlotlinePlan,
  ProjectState,
  ReviewDimension,
  ReviewIssue,
  ReviewReport,
  RoleRecord,
  RoleStatusCard,
  SceneCard,
  StoryBible,
  StoryboardSkeleton,
  StoryboardBeat,
  StoryboardTable,
  StoryboardShot,
  StoryboardPrompt,
  ChapterStoryboard,
  AddModelRequest,
  AddModelResponse,
  SavedModel,
  LlmModelOption,
  LlmModelsResponse,
  LlmVendorOption,
  LlmVendorsResponse,
  LlmProvidersResponse,
  RemoveProviderRequest,
  RemoveProviderResponse,
  LlmTestRequest,
  LlmTestResponse,
  MangaRoleCandidate,
  MangaRoleCard,
  Prop,
  Volume,
  WorldState,
  AdaptMaterializeRequest,
  AdaptMaterializeResponse,
  AdaptMaterializeSaveRequest,
  AdaptMaterializeSaveResponse,
} from './protocol.ts'
import { LLM_VENDORS } from './protocol.ts'

/** Project state file name inside the output dir. */
export const PROJECT_FILE = 'novel-project.json'

// ------------------------------------------------------------------ helpers

/** 智能解码文本文件：UTF-8 BOM / UTF-16 BOM / UTF-8（严格校验）/ GB18030 回退。 */
function decodeTextSmart(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.subarray(3).toString('utf8')
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString('utf16le')
  const utf8 = buf.toString('utf8')
  const bad = countReplacementChars(utf8)
  if (bad === 0) return utf8
  try {
    // GBK/GB18030 常见于网文 txt（Windows 下载站）；UTF-8 解码出现替换符时回退。
    const gbk = new TextDecoder('gb18030').decode(buf)
    if (countReplacementChars(gbk) < bad) return gbk
  } catch { /* TextDecoder gb18030 不可用则保持 UTF-8 结果 */ }
  return utf8
}

/** 统计替换字符 U+FFFD 数量（UTF-8 乱码检测）。 */
function countReplacementChars(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xFFFD) n++
  return n
}



/** Sanitize a file name: keep CJK/alphanumerics/space/dash/underscore. */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Chapter output file name, e.g. 第001章_开篇.md */
export function chapterFileName(chapter: ChapterPlan): string {
  const title = safeFileName(chapter.title) || `第${chapter.no}章`
  return `第${String(chapter.no).padStart(3, '0')}章_${title}.md`
}

/** Infer a book name from the outline's first non-empty line. */
export function inferBookName(outline: string): string {
  const line = outline.split('\n').map(l => l.trim()).find(l => l.length > 0)
  return (line ?? '未命名小说').replace(/^《/, '').replace(/》.*$/, '').slice(0, 40)
}

// ------------------------------------------------------------------ project

/** Read the persisted project from the output dir (undefined when absent). */
export function loadProject(outputDir: string): ProjectState | undefined {
  const file = join(outputDir, PROJECT_FILE)
  if (!existsSync(file)) return undefined
  try {
    let rawText = readFileSync(file, 'utf8')
    // Tolerate a UTF-8 BOM (some editors / PowerShell writes add one).
    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1)
    const raw = JSON.parse(rawText) as ProjectState
    if (typeof raw.outline !== 'string' || !Array.isArray(raw.chapters)) return undefined
    // Normalize legacy projects (foreshadows / assets may be missing).
    if (!Array.isArray(raw.foreshadows)) raw.foreshadows = []
    if (raw.assets === undefined || typeof raw.assets !== 'object') raw.assets = emptyProjectAssets()
    if (!Array.isArray(raw.assets.antiAiRules)) raw.assets.antiAiRules = []
    if (!Array.isArray(raw.assets.auxiliaryProgressions)) raw.assets.auxiliaryProgressions = []
    if (!Array.isArray(raw.assets.styleAssets)) raw.assets.styleAssets = []
    if (!Array.isArray(raw.facts)) raw.facts = []
    if (!Array.isArray(raw.plotlines)) raw.plotlines = []
    return raw
  } catch {
    return undefined
  }
}

/** Persist the project state next to the chapters. */
export function saveProject(outputDir: string, project: ProjectState): void {
  mkdirSync(outputDir, { recursive: true })
  const target = join(outputDir, PROJECT_FILE)
  const data = JSON.stringify(project, null, 2)
  // no-op 检测：内容未变化则跳过写盘，减少连续保存的 I/O
  try {
    if (existsSync(target)) {
      const existing = readFileSync(target, 'utf8')
      if (existing === data) return
    }
  } catch { /* 读取失败时正常写入 */ }
  // 原子写：先写临时文件再 rename，降低中途崩溃导致项目文件损坏的风险
  const tmp = target + '.tmp'
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, target)
}
/**
 * 并发保护：长任务（章节计划生成/正文生成）在内存中持有旧快照，
 * 期间其他请求可能修改了「易变字段」（道藏/角色库/剧情线/人物志存档/简介/封面）。
 * 保存前用磁盘最新版本合并这些字段，避免旧快照覆盖新修改（曾导致角色卡丢失）。
 * 注意：调用方若自己修改了这些字段，不要使用本函数。
 */
export function mergeVolatileFromDisk(outputDir: string, project: ProjectState): void {
  try {
    const disk = loadProject(outputDir)
    if (disk === undefined) return
    project.bible = disk.bible
    project.roles = disk.roles
    project.mangaRoles = disk.mangaRoles
    project.plotlines = disk.plotlines
    project.roleStatus = disk.roleStatus
    project.blurb = disk.blurb
    project.coverPath = disk.coverPath
    project.facts = disk.facts
    project.assets = disk.assets
    project.world = disk.world
    project.volumes = disk.volumes
  } catch { /* 磁盘读取失败时保持原状 */ }
}

// ------------------------------------------------------------ sensitive words

/**
 * 内置违禁词库（网文平台常见审查类别）。只做硬匹配提示，不代替人工判断。
 * 词语刻意保持常见写法；作者可自行判断是否修改。
 */
const SENSITIVE_WORDS: ReadonlyArray<{ word: string; category: string }> = [
  // 政治敏感
  { word: '共匪', category: '政治' }, { word: '独裁', category: '政治' },
  { word: '法轮', category: '政治' }, { word: '六四', category: '政治' },
  { word: '天安门事件', category: '政治' }, { word: '翻墙', category: '政治' },
  { word: '政治敏感', category: '政治' },
  // 色情擦边
  { word: '乳沟', category: '擦边' }, { word: '酥胸', category: '擦边' },
  { word: '淫荡', category: '擦边' }, { word: '做爱', category: '擦边' },
  { word: '上床', category: '擦边' }, { word: '裸体', category: '擦边' },
  { word: '一丝不挂', category: '擦边' }, { word: '胴体', category: '擦边' },
  { word: '春药', category: '擦边' }, { word: '催情', category: '擦边' },
  { word: '迷奸', category: '擦边' }, { word: '强暴', category: '擦边' },
  { word: '轮奸', category: '擦边' }, { word: '援交', category: '擦边' },
  { word: '嫖娼', category: '擦边' }, { word: '卖淫', category: '擦边' },
  { word: '色情', category: '擦边' }, { word: '情色', category: '擦边' },
  { word: '撸管', category: '擦边' }, { word: '自慰', category: '擦边' },
  { word: '口交', category: '擦边' }, { word: '打炮', category: '擦边' },
  { word: '约炮', category: '擦边' }, { word: '一夜情', category: '擦边' },
  // 暴力血腥
  { word: '碎尸', category: '暴力' }, { word: '分尸', category: '暴力' },
  { word: '凌迟', category: '暴力' }, { word: '剥皮', category: '暴力' },
  { word: '开膛', category: '暴力' }, { word: '剖腹', category: '暴力' },
  { word: '挖心', category: '暴力' }, { word: '虐杀', category: '暴力' },
  { word: '凌辱', category: '暴力' }, { word: '血腥', category: '暴力' },
  { word: '大屠杀', category: '暴力' }, { word: '灭门', category: '暴力' },
  { word: '满门抄斩', category: '暴力' }, { word: '腰斩', category: '暴力' },
  { word: '活埋', category: '暴力' }, { word: '点天灯', category: '暴力' },
  // 辱骂攻击
  { word: '傻逼', category: '辱骂' }, { word: '傻B', category: '辱骂' },
  { word: '草泥马', category: '辱骂' }, { word: '妈的', category: '辱骂' },
  { word: '尼玛', category: '辱骂' }, { word: '去死', category: '辱骂' },
  { word: '废物', category: '辱骂' }, { word: '垃圾', category: '辱骂' },
  { word: '人渣', category: '辱骂' }, { word: '贱人', category: '辱骂' },
  { word: '婊子', category: '辱骂' }, { word: '狗日的', category: '辱骂' },
  // 广告引流
  { word: '加微信', category: '广告' }, { word: '加QQ', category: '广告' },
  { word: '微信公众号', category: '广告' }, { word: '淘宝', category: '广告' },
  { word: '拼多多', category: '广告' }, { word: '刷单', category: '广告' },
  { word: '充值返利', category: '广告' }, { word: '扫码领', category: '广告' },
  { word: '加群领', category: '广告' }, { word: 'vx', category: '广告' },
  { word: '扣扣', category: '广告' },
  // 其他违禁
  { word: '赌博', category: '其他' }, { word: '赌场', category: '其他' },
  { word: '毒品', category: '其他' }, { word: '冰毒', category: '其他' },
  { word: '摇头丸', category: '其他' }, { word: '自杀方法', category: '其他' },
  { word: '邪教', category: '其他' }, { word: '传销', category: '其他' },
  { word: '军火', category: '其他' }, { word: '枪支', category: '其他' },
  { word: '管制刀具', category: '其他' },
]

/** 对一段文本做违禁词硬匹配，返回命中（词/类别/次数）。 */
export function checkSensitiveText(text: string): Array<{ word: string; category: string; count: number }> {
  const hits: Array<{ word: string; category: string; count: number }> = []
  for (const entry of SENSITIVE_WORDS) {
    let count = 0
    let idx = text.indexOf(entry.word)
    while (idx !== -1) {
      count++
      idx = text.indexOf(entry.word, idx + entry.word.length)
    }
    if (count > 0) hits.push({ word: entry.word, category: entry.category, count })
  }
  return hits
}

/** List generated chapter files in the output dir (sorted). */
export function listChapterFiles(outputDir: string): string[] {
  if (!existsSync(outputDir)) return []
  try {
    return readdirSync(outputDir)
      .filter(name => /^第\d+章_.*\.md$/.test(name) && !name.endsWith('.bak.md'))
      .sort((a, b) => {
        const na = Number(/^第(\d+)章/.exec(a)?.[1] ?? 0)
        const nb = Number(/^第(\d+)章/.exec(b)?.[1] ?? 0)
        return na - nb
      })
  } catch {
    return []
  }
}

/** Re-sync chapter status against files on disk (a file may exist without state). */
export function syncProjectWithDisk(project: ProjectState, outputDir: string): void {
  const files = new Map<string, string>()
  for (const file of listChapterFiles(outputDir)) {
    const no = Number(/^第(\d+)章/.exec(file)?.[1] ?? 0)
    if (no > 0) files.set(String(no), file)
  }
  for (const chapter of project.chapters) {
    const file = files.get(String(chapter.no))
    if (file !== undefined && (chapter.status === 'pending' || chapter.status === 'generating')) {
      chapter.status = 'written'
      chapter.file = file
    }
  }
  project.updatedAt = new Date().toISOString()
}

/** Read a chapter's markdown body from disk (undefined when missing). */
export function readChapterFile(outputDir: string, chapter: ChapterPlan): string | undefined {
  if (chapter.file === undefined) return undefined
  const path = join(outputDir, chapter.file)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

/** Create a fresh project from an outline. */
export function createProject(outline: string, outlinePath?: string): ProjectState {
  const now = new Date().toISOString()
  return {
    bookName: inferBookName(outline),
    outline,
    outlinePath,
    chapters: [],
    foreshadows: [],
    assets: emptyProjectAssets(),
    facts: [],
    createdAt: now,
    updatedAt: now,
  }
}

// ------------------------------------------------------------------- llm

/** One complete non-streaming LLM call. */
async function complete(
  ctx: Context,
  config: NovelConfig,
  options: { system: string; user: string; temperature?: number; maxTokens?: number; reasoning?: 'off' | 'low' | 'high' | 'max' },
): Promise<string> {
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: options.user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: options.system,
    maxTokens: options.maxTokens ?? config.maxTokens,
    temperature: options.temperature ?? 0.7,
    reasoningEffort: ReasoningEffortId(options.reasoning ?? config.reasoningEffort ?? 'off'),
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`LLM 调用失败（${finish.kind}）: ${finish.failure.message}`)
  }
  if (finish.kind === 'max-tokens') {
    throw new Error('LLM 输出达到 maxTokens 上限，请增大配置后重试')
  }
  const blocks = assembler.blocks()
  // Diagnostics: log the assembled block shape (reasoning-only turns yield no
  // text blocks — the v4-flash model can answer entirely in the reasoning
  // channel, which the adapter surfaces as a reasoning block).
  if (process.env.DSH_NOVEL_DEBUG === '1') {
    console.error('[dsh-novel-forge] complete: finish=%j blocks=%j', JSON.stringify(finish), blocks.map(b => `${b.type}:${'text' in b ? b.text.length : '?'}`))
  }
  const textBlocks = blocks
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
  let text = textBlocks.join('\n').trim()
  // v4-flash can answer entirely in the reasoning channel (the adapter
  // surfaces that as a 'reasoning' block). Fall back to it when no text came
  // back — the reasoning content is the model's actual answer here.
  if (text === '') {
    const reasoning = blocks
      .filter((block): block is { type: 'reasoning'; text: string } => block.type === 'reasoning')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (reasoning !== '') text = reasoning
  }
  return text
}

/**
 * Parse a JSON value out of a model response. Multi-level tolerance because
 * models are sloppy: prose around the JSON, ```json fences, a truncated tail,
 * or raw newlines inside string values all defeat a single JSON.parse. We
 * walk candidates from strictest to loosest.
 */
function parseJson<T>(text: string, wantArray: boolean): T {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') candidates.push(value.trim())
  }

  // 1. Whole response, and any ```json fence body.
  push(text)
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  push(fenced?.[1])
  // 2. From the first opener to the last closer.
  const opener = wantArray ? '[' : '{'
  const closer = wantArray ? ']' : '}'
  const start = text.indexOf(opener)
  const end = text.lastIndexOf(closer)
  if (start !== -1 && end > start) push(text.slice(start, end + 1))
  // 3. Trim trailing prose (a "}..." tail after the last closer).
  const trimmed = text.replace(new RegExp(`${closer}[\\s\\S]*$`), closer)
  push(trimmed)
  const start2 = trimmed.indexOf(opener)
  if (start2 !== -1) push(trimmed.slice(start2))

  // Repair truncated JSON: find the last complete object/array element, close brackets.
  const repairTruncated = (value: string): string => {
    const firstOpen = value.indexOf(opener)
    if (firstOpen === -1) return value
    const body = value.slice(firstOpen)
    let inStr = false
    let depth = 0
    let lastComplete = -1
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!
      if (inStr) {
        if (ch === '\\') { i++; continue }
        if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') { inStr = true; continue }
      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') {
        depth--
        if (depth === 1) lastComplete = i
      }
    }
    if (lastComplete === -1 || depth <= 0) return value
    const truncated = body.slice(0, lastComplete + 1)
    let result = truncated
    let d = 0
    let inS = false
    for (let i = 0; i < result.length; i++) {
      const c = result[i]!
      if (inS) { if (c === '\\') { i++; continue } if (c === '"') inS = false; continue }
      if (c === '"') { inS = true; continue }
      if (c === '{' || c === '[') d++
      if (c === '}' || c === ']') d--
    }
    while (d > 0) { result += closer; d-- }
    return result
  }

  // Repair: models love raw newlines inside string values, which JSON forbids.
  const repair = (value: string): string => {
    let out = ''
    let inString = false
    for (let i = 0; i < value.length; i++) {
      const ch = value[i]!
      if (inString) {
        if (ch === '\\') {
          out += ch + (value[i + 1] ?? '')
          i++
          continue
        }
        if (ch === '"') {
          inString = false
          out += ch
          continue
        }
        if (ch === '\n' || ch === '\r') {
          out += '\\n'
          continue
        }
        out += ch
      } else {
        if (ch === '"') inString = true
        out += ch
      }
    }
    return out
  }

  for (const candidate of candidates) {
    for (const attempt of [candidate, repair(candidate), repairTruncated(candidate)]) {
      try {
        const value = JSON.parse(attempt) as unknown
        if (!wantArray || Array.isArray(value)) return value as T
        // wantArray but the model wrapped the list in an object, e.g.
        // {"chapters": [...]} — extract the first array-valued key.
        if (typeof value === 'object' && value !== null) {
          for (const key of Object.keys(value as Record<string, unknown>)) {
            const inner = (value as Record<string, unknown>)[key]
            if (Array.isArray(inner)) return inner as T
          }
        }
        // Not an array — keep trying the remaining candidates.
      } catch {
        // try the next candidate
      }
    }
  }
  const preview = text.length > 300 ? text.slice(0, 300) + '…' : text
  throw new Error(`模型输出中未找到 JSON 数据。模型原始输出：${preview}`)
}

/** Parse a JSON array (chapters, volumes, issues...). */
function parseJsonArray<T>(text: string): T[] {
  const value = parseJson<T[]>(text, true)
  return Array.isArray(value) ? value : []
}

/** Parse a JSON object. */
function parseJsonObject<T>(text: string): T {
  const value = parseJson<T>(text, false)
  if (typeof value !== 'object' || value === null) throw new Error('模型输出不是 JSON 对象')
  return value
}

// ------------------------------------------------------------------ bible

/** System prompt for story-bible extraction. */
function bibleSystemPrompt(): string {
  return [
    '你是一位资深网文编辑兼设定架构师。你会收到一份小说大纲，请把它提炼成结构化的「道藏」，供后续写作时严格引用。',
    '要求：',
    '1. 忠于大纲，不自行发明大纲之外的设定。',
    '2. 角色卡覆盖大纲明确出现的角色（主角必含），每个角色给出性格标签、目标、关键关系。',
    '3. 世界规则覆盖力量体系、金手指机制、势力、地理等所有硬性规则，逐条列出。',
    '4. 红线列出大纲中明确禁止的内容（如无后宫、不圣母、无无脑碾压等）。',
    '5. 风格列出叙事基调、节奏、POV 等写作风格要点。',
    '6. 角色名必须用正文/编年录中的真实姓名；若大纲只写「主角」未点名，而已写章节或编年录中有名字，则用该真实姓名；禁止输出「主角（描述）」这类把身份塞进名字的占位名。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字或 Markdown 代码块标记。',
    '重要：所有字符串值内部不得包含换行符（不要用多行字符串），JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    'JSON 结构：',
    '{"genre": "题材与基调一句话", "worldRules": ["规则1", "规则2", ...], "characters": [{"name": "角色名", "role": "protagonist|supporting|antagonist|other", "traits": ["标签1", ...], "goals": "目标与动机", "relations": "关键关系"}], "redLines": ["红线1", ...], "style": ["风格1", ...]}',
  ].join('\n')
}

/** Extract the story bible from an outline. */
export async function extractBible(ctx: Context, config: NovelConfig, outline: string, project?: ProjectState): Promise<StoryBible> {
  // 已写章节/编年录只在「确认真实姓名与已确立设定」时参考，仍忠于大纲、不新增大纲外设定。
  const written = (project?.chapters ?? []).filter(c => c.status !== 'pending' && c.status !== 'generating' && c.file !== undefined)
  const excerpts: string[] = []
  for (const chapter of written.slice(0, 3)) {
    const body = readChapterFile(config.outputDir, chapter)
    if (body === undefined) continue
    const text = body.replace(/^#.*$/gm, '').trim()
    if (text.length > 0) excerpts.push(`第${chapter.no}章《${chapter.title}》\n${text.slice(0, 2200)}`)
  }
  const facts = (project?.facts ?? []).slice(-40)
  const user = [
    `请为下面这部小说提炼道藏：\n\n${outline}`,
    facts.length > 0
      ? `\n\n【已写章节事实（编年录）】用于确认真实角色姓名与已确立设定；忠于大纲，不要新增大纲外设定：\n${facts.map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join('\n')}`
      : '',
    excerpts.length > 0
      ? `\n\n【已写章节正文摘录】角色姓名、身份以正文为准（大纲未点名时用正文里的真实姓名，禁止用「主角（描述）」占位名）：\n${excerpts.join('\n\n')}`
      : '',
  ].filter(s => s !== '').join('\n')
  const text = await complete(ctx, config, {
    system: bibleSystemPrompt(),
    user,
    temperature: 0.4,
    maxTokens: Math.max(config.maxTokens, 8000),
    reasoning: config.analysisReasoning ?? 'low',
  })
  const raw = parseJsonObject<{
    genre?: unknown
    worldRules?: unknown
    characters?: unknown
    redLines?: unknown
    style?: unknown
  }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const characters: StoryBible['characters'] = Array.isArray(raw.characters)
    ? raw.characters
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          name: typeof entry.name === 'string' ? entry.name.trim() : '未命名',
          role: (['protagonist', 'supporting', 'antagonist', 'other'] as const).includes(entry.role as never)
            ? entry.role as StoryBible['characters'][number]['role']
            : 'other',
          traits: strArray(entry.traits),
          goals: typeof entry.goals === 'string' ? entry.goals : '',
          relations: typeof entry.relations === 'string' ? entry.relations : '',
          knowledge: strArray(entry.knowledge),
        }))
        .filter(card => card.name !== '')
    : []
  // 占位名修复：大纲未点名主角时模型可能输出「主角（…）」，用角色库真实主角名替换。
  const realProtagonist = (project?.roles ?? []).find(r => r.roleLabel === 'protagonist')?.name?.trim()
  if (realProtagonist !== undefined && realProtagonist !== '') {
    for (const card of characters) {
      if (card.role === 'protagonist' && /^(主角|未命名)/.test(card.name)) card.name = realProtagonist
    }
  }
  const bible: StoryBible = {
    genre: typeof raw.genre === 'string' ? raw.genre : '',
    worldRules: strArray(raw.worldRules),
    characters,
    redLines: strArray(raw.redLines),
    style: strArray(raw.style),
    generatedAt: new Date().toISOString(),
  }
  if (bible.worldRules.length === 0 && bible.characters.length === 0 && bible.redLines.length === 0) {
    throw new Error('道藏生成失败：模型没有返回有效内容')
  }
  return bible
}

// ------------------------------------------------------------------ volumes

/** System prompt for volume planning. */
function volumeSystemPrompt(): string {
  return [
    '你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。',
    '要求：',
    '1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。',
    '2. 卷定位一句话说明该卷的剧情重心。',
    '3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。',
    '输出必须是合法 JSON 数组，不要输出任何其他文字：',
    '[{"no": 1, "title": "卷名", "summary": "卷定位与剧情重心", "chapterStart": 1, "chapterEnd": 80}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/** Plan volumes from an outline. */
export async function planVolumes(ctx: Context, config: NovelConfig, outline: string): Promise<Volume[]> {
  const user = `请为下面这部小说划分卷：\n\n${outline}`
  const text = await complete(ctx, config, { system: volumeSystemPrompt(), user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const volumes: Volume[] = []
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i]
    if (typeof entry !== 'object' || entry === null) continue
    const no = typeof entry.no === 'number' ? entry.no : i + 1
    const title = typeof entry.title === 'string' ? entry.title.trim() : `第${no}卷`
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const start = typeof entry.chapterStart === 'number' ? entry.chapterStart : undefined
    const end = typeof entry.chapterEnd === 'number' ? entry.chapterEnd : undefined
    volumes.push({
      no,
      title: title.slice(0, 40),
      summary: summary.slice(0, 300),
      chapterStart: start ?? 1,
      chapterEnd: end ?? 1,
    })
  }
  if (volumes.length === 0) throw new Error('卷计划生成失败：模型没有返回有效卷')
  return volumes
}

/** Assign a chapter to its volume by number. */
function volumeOf(chapterNo: number, volumes: Volume[] | undefined): number {
  if (volumes === undefined || volumes.length === 0) return 0
  for (const volume of volumes) {
    if (chapterNo >= volume.chapterStart && chapterNo <= volume.chapterEnd) return volume.no
  }
  return volumes[volumes.length - 1]?.no ?? 0
}

// ------------------------------------------------------------------- plan

/** The chapter-planning prompt template. */
function planSystemPrompt(volumes: Volume[] | undefined): string {
  const volumeBlock = volumes !== undefined && volumes.length > 0
    ? ['\n全书分卷结构（规划章节时需落在对应卷内）：']
      .concat(volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`))
      .join('\n')
    : ''
  return [
    '你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。',
    '你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。',
    '要求：',
    '1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。',
    '2. 章节之间要衔接自然，前章结尾为后章埋下钩子。',
    '3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。',
    '4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。',
    '5. 数组每个元素格式：{"title": "章节标题（10字以内，有网文感）", "beats": "结构化剧情要点（150-250字，必须包含四段，段间用换行分隔）：\\n本章目标：本章要完成的核心推进；\\n剧情要点：主要情节的起承转合（2-4 句）；\\n爽点/钩子：本章的爽点兑现或情绪钩子；\\n结尾钩子：本章结尾为下一章埋下的悬念"}',
    '重要：beats 字段内部必须使用 \\n 转义表示换行（JSON 字符串内不得有真实换行符），其余字符串值也不得包含真实换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    volumeBlock,
  ].join('\n')
}

/** Build the writing system prompt (bible + outline + active foreshadows).
 *  `targetChars` 来自每章计划（规划时快照，= 设置的每章目标字数）；无则退回默认 3500。
 *  字数区间按目标动态生成（±15%，取整到百位），避免系统提示词与设置互相冲突。
 *  `lengthRule` 可覆盖第 1 条字数要求（整章修订/改编时按原文长度为准）。 */
function writeSystemPrompt(project: ProjectState, targetChars?: number, lengthRule?: string): string {
  const bible = project.bible
  const sections: string[] = []
  if (bible !== undefined) {
    sections.push('==================== 道藏（写作时严格遵守） ====================')
    if (bible.genre !== '') sections.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    // 角色上下文：角色库（主表）与道藏角色卡合并去重，避免两份重复注入、互相打架。
    const roleLib = project.roles ?? []
    const labelName = { protagonist: '主角', female_lead: '女主', female_support: '女配', support: '配角', antagonist: '反派', extra: '路人' }
    const seenRole = new Set<string>()
    const mergedRoles: string[] = []
    for (const r of roleLib) {
      seenRole.add(r.name)
      const card = bible.characters.find(c => c.name === r.name)
      const traits = card !== undefined ? card.traits : (Array.isArray(r.traits) ? r.traits : [])
      const goals = card !== undefined && card.goals !== '' ? card.goals : r.goals
      const relations = card !== undefined && card.relations !== '' ? card.relations : (Array.isArray(r.relations) && r.relations.length > 0 ? r.relations.join('、') : '')
      mergedRoles.push(`- ${r.name}（${labelName[r.roleLabel]}）：${r.identity}${traits.length > 0 ? `；性格：${traits.join('、')}` : ''}${goals !== '' ? `；目标：${goals}` : ''}${relations !== '' ? `；关系：${relations}` : ''}`)
      if (card !== undefined && Array.isArray(card.knowledge) && card.knowledge.length > 0) {
        mergedRoles.push(`  已知信息（该角色知道的：${card.knowledge.join('；')}；未列出的信息该角色一律不知道，不得写其知晓或提及）`)
      }
    }
    for (const card of bible.characters) {
      if (seenRole.has(card.name)) continue
      seenRole.add(card.name)
      const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
      mergedRoles.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
      if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
        mergedRoles.push(`  已知信息（该角色知道的：${card.knowledge.join('；')}；未列出的信息该角色一律不知道，不得写其知晓或提及）`)
      }
    }
    if (mergedRoles.length > 0) {
      sections.push('角色卡（角色库与道藏已合并去重）：')
      sections.push(...mergedRoles)
    }
    if (bible.redLines.length > 0) sections.push('写作红线（违反即失败）：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) sections.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  const worldBlock = renderWorld(project.world)
  if (worldBlock !== '') sections.push(worldBlock)
  sections.push('==================== 全书大纲 ====================')
  // 超长大纲截断保护（防止上下文超限）；完整大纲在总纲页查看。
  const outlineBlock = project.outline.length > 6000
    ? project.outline.slice(0, 6000) + '\n…（大纲过长已节选，完整内容见总纲页）'
    : project.outline
  sections.push(outlineBlock)
  sections.push('==================== 大纲结束 ====================')
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push(assetsBlock)
  const active = project.foreshadows.filter(f => f.status === 'planted' || f.status === 'progressing')
  if (active.length > 0) {
    sections.push('==================== 活跃伏笔（近期需推进或回收的线索） ====================')
    for (const f of active) {
      sections.push(`- [${f.status === 'planted' ? '已埋设' : '推进中'}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  if (lines.length > 0) {
    const kindName = { main: '主线', branch: '支线', character: '人物线', mystery: '悬念线' }
    sections.push('==================== 剧情线（本章应推进至少一条活跃线） ====================')
    for (const l of lines) {
      sections.push(`- [${kindName[l.kind]}${l.status === 'paused' ? '·暂停中' : ''}] ${l.name}：${l.goal}${l.progress !== '' ? `（当前进度：${l.progress}）` : ''}`)
    }
  }
  sections.push('')
  sections.push('写作硬性要求：')
  const target = targetChars !== undefined && targetChars > 0 ? targetChars : 3500
  const lo = Math.max(1000, Math.round((target * 0.85) / 100) * 100)
  const hi = Math.max(lo + 100, Math.round((target * 1.15) / 100) * 100)
  sections.push(lengthRule ?? `1. 每章 ${lo}-${hi} 字（目标 ${target} 字，按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。`)
  sections.push('2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。')
  sections.push('3. 尊重大纲与道藏：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。')
  sections.push('4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。')
  sections.push('5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。')
  sections.push('6. 对话与冲突密度：每章至少 1 处实质对话或正面对抗/交锋场面；推理与心理活动必须用动作、环境细节、微表情、对话呈现，禁止整章纯内心独白铺陈（禁止"解说式"交代线索）。')
  sections.push('7. 反派与对手的行动力：本章出现的反派/对手必须有其行动、反制或压迫感（布局、试探、追索、交锋至少占其一），不得作为纯背景板存在。')
  sections.push('8. 配角辨识度：重要新登场配角应给姓名或可辨识的独有特征；禁止通篇用"瘦高个/灰衣人/戴面具者"等身形标签代称同一角色。')
  sections.push('9. 信息呈现方式：关键线索、设定、局势通过对话、动作、发现物呈现，禁止主角内心"讲解"给读者听。')
  sections.push('')
  sections.push('==================== 内容合规红线（平台硬性要求，最高优先级，违反即失败） ====================')
  sections.push(COMPLIANCE_REDLINES.join('\n'))
  sections.push('以上九条为硬性底线，任何情况下不得以任何形式出现或影射；若剧情确需涉及（如批判、反讽），只能以明确否定、揭露、批判的立场呈现，且不得展开细节。')
  return sections.join('\n')
}

/**
 * Plan chapters from an outline (optionally for one volume).
 */
export async function planChapters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterCount: number,
  volumeNo?: number,
  outputDir?: string,
): Promise<ChapterPlan[]> {
  const volume = project.volumes?.find(v => v.no === volumeNo)
  const existing = project.chapters
  const startNo = existing.length === 0 ? 1 : Math.max(...existing.map(c => c.no)) + 1
  const NL = String.fromCharCode(10)
  const continuation = existing.length > 0
  const latestFacts = continuation && Array.isArray(project.facts)
    ? project.facts.slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 150)}`).join('\n')
    : ''
  // 上一章（已写章节中章号最大者）结尾原文，作为续写剧情起点。
  let prevTail = ''
  if (continuation) {
    const written = existing.filter(c => c.status !== 'pending')
    const last = written[written.length - 1]
    if (last !== undefined && last.file !== undefined && outputDir !== undefined) {
      try {
        const raw = readFileSync(join(outputDir, last.file), 'utf8')
        prevTail = raw.replace(/^#.*$/m, '').trim().slice(-600)
      } catch { /* 文件缺失时忽略，仅依赖编年录 */ }
    }
  }
  // 续写模式大纲注入：精简大纲（≤2 万字）直接全量，避免误伤「分卷收官规划」（如第五卷双结局）；
  // 超大 docx 大纲才节选——截到「记忆梗」之前，保留分卷大纲与红线，去掉后续冗余。
  // 续写模式大纲注入：精简大纲（≤2 万字）直接全量；超大大纲按优先级裁剪——
  // 优先保留当前卷/红线/道藏规则，不绑定任何特定书的章节标题。
  const outlineBlock = continuation
    ? (() => {
        if (project.outline.length <= 20000) return project.outline
        // 找最后一个卷标记（支持「第X卷」「卷X」），截到该位置
        const volMarkers = ['第' + (volume?.no ?? '') + '卷', '卷' + (volume?.no ?? '')]
        let cut = -1
        for (const marker of volMarkers) {
          const idx = project.outline.lastIndexOf(marker)
          if (idx > cut) cut = idx
        }
        // 没找到卷标记时，截取前 15000 字（保留足够设定，去掉末尾冗余）
        if (cut < 2000) cut = Math.min(15000, project.outline.length)
        return project.outline.slice(0, cut).trimEnd() + '\n…（大纲过长，已保留当前卷及之前内容，后续从略）'
      })()
    : project.outline

  const user = [
    '请为下面这部小说规划章节。',
    volume !== undefined
      ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}`
      : continuation
        ? `本书已有 ${existing.length} 章已规划/已写作（见下方「已有章节」）。请规划**后续**章节：从第 ${startNo} 章开始。`
        : '请规划全书开篇章节。',
    continuation
      ? (() => {
          // 从最近章节摘要动态生成「已发生事件禁令」，不绑定任何特定书
          const recentChapters = existing.slice(-20)
          const eventLines = recentChapters
            .filter(c => c.summary !== undefined && c.summary.trim() !== '')
            .map(c => '第' + c.no + '章《' + c.title + '》：' + c.summary!.slice(0, 80))
          const eventsText = eventLines.length > 0
            ? '以下情节已在已有章节中发生过（最近 ' + eventLines.length + ' 章摘要），后续章节**绝对不得重写或重复**：\n' + eventLines.join('\n')
            : '已有章节的剧情不得重写或重复（无章节摘要时以编年录为准）。'
          return '【续写硬性要求】已有章节的剧情不得重写或重复，章节标题也不得与已有章节重复。' + NL + eventsText + NL + '若本次规划已进入大纲的收尾区间（接近全书规划总章数），最后 5-10 章必须按大纲推进到大结局（终极抉择/清算/双结局等），**禁止以悬念、逃离、未解之谜收尾**——收尾区间按大纲卷定位判断，不以当前剧情是否"感觉像结尾"为准。'
        })()
      : '',
    prevTail !== ''
      ? `【上一章（第 ${startNo - 1} 章）结尾原文】第 ${startNo} 章必须紧接此状态继续，从新的事件写起，不得回顾重述：\n${prevTail}`
      : '',
    latestFacts !== ''
      ? `【最新剧情状态（本书编年录，第 ${startNo - 1} 章结尾的事实）】规划续写时必须以此为起点，时间线、人物状态与地点衔接一致：\n${latestFacts}`
      : '',
    continuation
      ? '已有章节（共 ' + existing.length + ' 章；仅列最近 80 章，更早的以标题计数为准，剧情以「编年录」为权威）：\n'
        + existing.slice(-80).map(c => {
            const sm = c.summary !== undefined && c.summary !== '' ? `（${c.summary.slice(0, 120)}）` : ''
            return `第${c.no}章《${c.title}》${sm}`
          }).join('\n')
      : '',
    `全书大纲（设定参考，续写剧情不得与设定冲突）：\n${outlineBlock}`,
    '',
    `请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`,
  ].join('\n')
  const system = planSystemPrompt(project.volumes) + (continuation
    ? '\n重要：本次是**续写规划**——已有章节的剧情不得重写或重复，新章节标题不得与已有章节标题相同，新章节的剧情必须从上一章结尾自然接续（人物状态、时间线、地点衔接一致）。'
    : '')
  const text = await complete(ctx, config, { system, user, temperature: 0.7, maxTokens: Math.max(config.maxTokens, 40000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const chapters: ChapterPlan[] = []
  const existingNos = new Set(existing.map(c => c.no))
  const existingTitles = new Set(existing.map(c => c.title))
  let cursor = startNo
  for (const item of parsed) {
    if (chapters.length >= chapterCount) break
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 30) : ''
    const beats = typeof entry.beats === 'string' ? entry.beats.trim() : ''
    if (title === '' && beats === '') continue
    // 续写模式下，标题与已有章节重复的一律丢弃（模型可能复述旧章节）。
    if (title !== '' && existingTitles.has(title)) continue
    while (existingNos.has(cursor)) cursor++
    const no = cursor++
    chapters.push({
      no,
      volume: volumeOf(no, project.volumes),
      title: title || `第${no}章`,
      beats,
      targetChars: config.chapterChars,
      status: 'pending',
    })
  }
  if (chapters.length === 0) {
    throw new Error('章节计划生成失败：模型没有返回有效章节')
  }
  return chapters
}

// ------------------------------------------------------------------ writing

/** The review system prompt. */
function reviewSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const sections: string[] = [
    '你是一位严格的网文审稿编辑。你会收到一章正文以及本书的道藏与红线。',
    '请从以下维度审查本章：',
    '1. 人设一致性：角色行为是否符合下方角色卡的设定（性格/目标/知情度/说话方式）。',
    '2. 设定一致性：金手指规则、战力体系、世界观是否与道藏冲突。',
    '3. 红线检查：是否触犯下方「本书红线」与「内容合规红线」。',
    '4. 文笔质量：语病、翻译腔、AI 套话（"不禁""仿佛""一时间"等高频词滥用）、流水账。',
    '5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。',
    '6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。',
    '7. 反 AI 规则：逐条核对下方「反 AI 规则」清单——禁止类命中即列为问题，鼓励类只作低优先级建议、不阻塞通过。',
    '8. 呈现方式：整章是否纯内心推理铺陈（无对话/无对抗，推理全靠解说）；反派是否纯背景板无行动；重要配角是否无名标签化（瘦高个/灰衣人全程代称）——命中即列为问题。',
    '9. 内容合规（最高优先级）：逐条核对下方「内容合规红线」，任何一条命中（含影射、暗示、详细描写）必须列为 high，并给出改写建议。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"score": 0-100的整数, "verdict": "一句话总评", "issues": [{"severity": "high|medium|low", "dimension": "character|setting|redline|writing|pacing|logic|anti-ai|presentation|compliance", "item": "问题描述", "suggestion": "修改建议"}]}',
    '维度 dimension 与上方 9 个审查维度一一对应：人设=character、设定=setting、红线=redline、文笔=writing、节奏=pacing、逻辑=logic、反AI=anti-ai、呈现=presentation、合规=compliance。每条 issue 都必须填 dimension。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ]
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push('\n' + assetsBlock)
  if (bible !== undefined) {
    sections.push('\n==================== 道藏 ====================')
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        sections.push(`- ${card.name}（${card.role}）：${card.traits.join('、')}`)
        if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
          sections.push(`  该角色知道：${card.knowledge.join('；')}（未列出的信息该角色不知道）`)
        }
      }
    }
    if (bible.redLines.length > 0) sections.push('红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  sections.push('\n==================== 内容合规红线（平台硬性要求，最高优先级） ====================')
  sections.push(COMPLIANCE_REDLINES.join('\n'))
  sections.push('以上九条为硬性底线：正文中任何一条命中（含影射、暗示、详细展开）都必须列为 high，并给出改写建议；作者自定义红线不得豁免这九条。')
  return sections.join('\n')
}

/** Run the AI review on one chapter. */
export async function reviewChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<ReviewReport> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const bodyText = body.replace(/^#\s+.*$/m, '').trim()
  // 本地 AI 味扫描（事实锚点，让 LLM 复核判断而非逐字统计）
  const aiScan = scanAiFlavor(bodyText)
  // 跨章上下文：上一章结尾 + 最近/相关事实 + 活跃剧情线/伏笔（审稿不再只看本章内部）
  const chapterCtx = buildChapterContext(project, chapter, outputDir, { stage: 'review' })
  const blocks = renderContextBlocks(chapterCtx)
  const crossChapter = [blocks.continuityBlock, blocks.factsBlock, blocks.plotlinesBlock, blocks.foreshadowsBlock].filter(b => b !== '').join('\n')
  const user = [
    `本章标题：《${chapter.title}》`,
    `本章剧情要点：${chapter.beats}`,
    `==================== 本地 AI 味扫描（事实锚点，你只需复核判断，不必再逐字统计） ====================\n${aiScan.summary}`,
    crossChapter,
    '==================== 章节正文 ====================',
    bodyText,
  ].filter(line => line !== '').join('\n')
  const text = await complete(ctx, config, { system: reviewSystemPrompt(project), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 8000) })
  const raw = parseJsonObject<{ score?: unknown; verdict?: unknown; issues?: unknown; resolvedIds?: unknown; unresolvedIds?: unknown }>(text)
  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          severity: (['high', 'medium', 'low'] as const).includes(entry.severity as never)
            ? entry.severity as 'high' | 'medium' | 'low'
            : 'medium',
          dimension: (typeof entry.dimension === 'string' && REVIEW_DIMENSION_IDS.has(entry.dimension))
            ? entry.dimension as ReviewDimension
            : undefined,
          item: typeof entry.item === 'string' ? entry.item : '',
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
        }))
        .filter(issue => issue.item !== '')
    : []
  const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60
  // 通过条件：有 high 必须 ≥ reviewPassScore；无 high 可降 5 分但最低 65（避免低分稿直接放行）
  const hasHigh = issues.some(i => i.severity === 'high')
  const softThreshold = Math.max(65, config.reviewPassScore - 5)
  const passed = hasHigh ? score >= config.reviewPassScore : score >= softThreshold
  const report: ReviewReport = {
    score,
    passed,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 200) : '',
    issues,
    reviewedAt: new Date().toISOString(),
  }
  chapter.review = report
  chapter.status = report.passed ? 'approved' : 'rejected'
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return report
}

/**
 * 审查「任意正文文本」（作者手动编辑后的草稿，不落盘）。
 * 复用审稿提示词与红线/道藏/反AI规则；仅返回报告，不改文件不改状态。
 */
export async function reviewChapterText(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  text: string,
  previousReport?: ReviewReport,
): Promise<ReviewReport> {
  const bodyText = text.slice(0, 20000)
  const aiScan = scanAiFlavor(bodyText)
  const user = [
    `书名：《${project.bookName}》`,
    previousReport !== undefined
      ? '==================== 上一轮审稿意见（逐条核对是否已解决） ====================\n'
        + previousReport.issues.map((it, i) => `${i + 1}. [${it.severity}] ${it.item}${it.suggestion !== '' ? ` → ${it.suggestion}` : ''}`).join('\n')
      : '',
    previousReport !== undefined
      ? '==================== 修订稿（上一轮审稿后按意见修订的正文） ===================='
      : '==================== 待审查正文 ====================',
    `==================== 本地 AI 味扫描（事实锚点，你只需复核判断，不必再逐字统计） ====================\n${aiScan.summary}`,
    bodyText,
  ].join('\n')
  // 验证模式：携带上一轮报告时，逐条核对原意见是否解决 + 只挑新增 high，不再全新找茬。
  const system = previousReport !== undefined ? verifySystemPrompt(project) : reviewSystemPrompt(project)
  const raw = parseJsonObject<{ score?: unknown; verdict?: unknown; issues?: unknown; resolvedIds?: unknown; unresolvedIds?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 8000) }),
  )
  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          severity: (['high', 'medium', 'low'] as const).includes(entry.severity as never)
            ? entry.severity as 'high' | 'medium' | 'low'
            : 'medium',
          dimension: (typeof entry.dimension === 'string' && REVIEW_DIMENSION_IDS.has(entry.dimension))
            ? entry.dimension as ReviewDimension
            : undefined,
          item: typeof entry.item === 'string' ? entry.item : '',
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
        }))
        .filter(issue => issue.item !== '')
    : []
  const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60
  // 非验证模式：有 high 必须 ≥ reviewPassScore；无 high 可降 5 分但最低 65
  const hasHighAny = issues.some(i => i.severity === 'high')
  let passed = hasHighAny ? score >= config.reviewPassScore : score >= Math.max(65, config.reviewPassScore - 5)
  if (previousReport !== undefined) {
    const hasHigh = issues.some(i => i.severity === 'high')
    const prevHigh = previousReport.issues.filter(i => i.severity === 'high')
    // 优先用模型输出的 unresolvedIds 精确判定（按编号），兼容旧报告回退到增强字符串匹配
    const unresolvedIds = Array.isArray(raw.unresolvedIds) ? raw.unresolvedIds.filter((v: unknown): v is number => typeof v === 'number') : []
    const resolvedIds = Array.isArray(raw.resolvedIds) ? raw.resolvedIds.filter((v: unknown): v is number => typeof v === 'number') : []
    let prevHighResolved: boolean
    if (unresolvedIds.length > 0 || resolvedIds.length > 0) {
      prevHighResolved = prevHigh.every((_, idx) => !unresolvedIds.includes(idx + 1) || resolvedIds.includes(idx + 1))
    } else {
      prevHighResolved = prevHigh.every(p => !issues.some(i => i.item.replace(/^未解决\(\d+\)：/, '').includes(p.item.replace(/^未解决\(\d+\)：/, '').slice(0, 20))))
    }
    passed = !hasHigh && prevHighResolved
  }
  return {
    score,
    passed,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 200) : '',
    issues,
    reviewedAt: new Date().toISOString(),
  }
}

/** 验证模式系统提示：修订后逐条核对原意见是否解决，只挑新增 high，不重复挑剔主观项。 */
function verifySystemPrompt(project: ProjectState): string {
  return [
    '你是一位网文审稿验证员。作者已按上一轮审稿意见修订了本章，你需要验证修订效果。',
    '你的任务（严格按此执行）：',
    '1. 逐条核对「上一轮意见」中的每一条（按编号 1、2、3...）是否已在修订稿中解决。',
    '2. 只挑修订【新引入】的 high 级问题（设定矛盾/逻辑硬伤/事实错误）——新引入的 medium/low 主观项（文笔/套话/节奏）不要列。',
    '3. 禁止重复挑剔上一轮已指出且本次已解决的主观项（如"缓缓/微微"等套话、错别字）——即使换个说法再提也不行。',
    '4. 严禁为了显得专业而新增"换一批毛病"式的意见。',
    '输出必须是合法 JSON 对象，包含以下字段：',
    '- resolvedIds：已解决的上一轮意见编号数组（如 [1, 3, 5]）。',
    '- unresolvedIds：未解决或部分解决的上一轮意见编号数组（如 [2, 4]）。',
    '- issues：未解决的原意见 + 新引入的 high 级问题列表（格式同审稿：severity/item/suggestion）。未解决的原意见 item 需注明"未解决(编号N)：原意见摘要"。',
    '- score：按修订稿整体质量给 50-90 分（解决全部 high 且无新增 high 时给 70 以上）。',
    '- verdict：一句话结论。',
    '完整格式：{"resolvedIds": [1,3], "unresolvedIds": [2], "score": 75, "verdict": "一句话", "issues": [{"severity": "high", "dimension": "character|setting|redline|writing|pacing|logic|anti-ai|presentation|compliance", "item": "未解决(2)：xxx", "suggestion": "xxx"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
    `本书道藏（核对设定冲突用）：\n${project.bible !== undefined ? JSON.stringify(project.bible).slice(0, 3000) : '（无）'}`,
  ].join('\n')
}

/** Build the author-review system prompt (narrative structure, not prose). */
function authorReviewSystemPrompt(): string {
  return [
    '你是一位网文作者复盘助手。你会收到：本章正文、上一章结尾（钩子）、上一章作者复盘（如有）、活跃剧情线与编年录近期事实。',
    '请从叙事结构层面复盘本章（不评文笔，那是审稿的事）：',
    '1. hookHonored：上一章结尾的钩子/悬念是否在本章兑现或推进（true/false）。',
    '2. hookNote：钩子兑现情况一句话；未兑现时说明并给出"建议在第几章补"的建议。',
    '3. endingHook：本章结尾钩子强度，0-10 的整数（低于 6 说明结尾平淡，读者可能不想看下一章）。',
    '4. plotlineProgress：本章推进了哪条剧情线（主线/支线名），或"无实质推进"（连续无推进要提醒）。',
    '5. advancedLines：本章实际推进的剧情线名称数组——从「活跃剧情线」清单中选出推进了的线（名称必须与清单中的线名一字不差；没推进任何线则输出空数组）。',
    '6. continuity：与上一章结尾的衔接检查（人物位置/时间/伤势/资源/对话状态），发现问题要指出。',
    '7. trend：结合上一章复盘看近期节奏趋势（是否连续拖沓、爽点密度是否下降、是否需要调整）。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"hookHonored": true或false, "hookNote": "一句话", "endingHook": 0-10整数, "plotlineProgress": "一句话", "advancedLines": ["线名"], "continuity": "一句话", "trend": "一句话"}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
}

/** 作者复盘：对一章做叙事结构复盘（钩子兑现/结尾钩子/推进/连续性/趋势）。 */
export async function authorReviewChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterNo: number,
  body: string,
  prevTail: string,
): Promise<AuthorReview> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  const prevChapter = chapterNo > 1 ? project.chapters.find(c => c.no === chapterNo - 1) : undefined
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  const facts = (project.facts ?? []).slice(-10)
  const user = [
    `书名：《${project.bookName}》`,
    chapter !== undefined ? `本章：第 ${chapter.no} 章《${chapter.title}》` : `本章：第 ${chapterNo} 章`,
    prevTail !== ''
      ? `==================== 上一章（第 ${chapterNo - 1} 章）结尾（钩子） ====================\n${prevTail}`
      : '（本书第一章，无上一章钩子；hookHonored 视为 true，hookNote 写"开篇无前置钩子"）',
    prevChapter?.authorReview !== undefined
      ? `==================== 上一章作者复盘 ====================\n${JSON.stringify(prevChapter.authorReview)}`
      : '',
    lines.length > 0
      ? `==================== 活跃剧情线 ====================\n${lines.map(l => `- [${l.kind}] ${l.name}：${l.goal}${l.progress !== '' ? `（${l.progress}）` : ''}`).join('\n')}`
      : '',
    facts.length > 0
      ? `==================== 编年录近期事实 ====================\n${facts.map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')}`
      : '',
    '==================== 本章正文 ====================',
    body.slice(0, 16000),
    '',
    '只输出 JSON 对象。',
  ].join('\n')
  const raw = parseJsonObject<{
    hookHonored?: unknown
    hookNote?: unknown
    endingHook?: unknown
    plotlineProgress?: unknown
    advancedLines?: unknown
    continuity?: unknown
    trend?: unknown
  }>(
    await complete(ctx, config, { system: authorReviewSystemPrompt(), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000) }),
  )
  // 解析推进的线名（与项目线名精确匹配；过滤不存在的名字）。
  const knownLineNames = new Set((project.plotlines ?? []).map(l => l.name))
  const advancedLines = Array.isArray(raw.advancedLines)
    ? raw.advancedLines.filter((n): n is string => typeof n === 'string' && n.trim() !== '' && knownLineNames.has(n.trim())).map(n => n.trim())
    : []
  return {
    hookHonored: raw.hookHonored === true,
    hookNote: typeof raw.hookNote === 'string' ? raw.hookNote.slice(0, 200) : '',
    endingHook: typeof raw.endingHook === 'number' ? Math.max(0, Math.min(10, Math.round(raw.endingHook))) : 5,
    plotlineProgress: typeof raw.plotlineProgress === 'string' ? raw.plotlineProgress.slice(0, 200) : '',
    advancedLines,
    continuity: typeof raw.continuity === 'string' ? raw.continuity.slice(0, 200) : '',
    trend: typeof raw.trend === 'string' ? raw.trend.slice(0, 200) : '',
    reviewedAt: new Date().toISOString(),
  }
}

/** 复盘后自动关联：把本章号写入复盘标记推进的剧情线（按名称匹配，去重）。 */
export function autoLinkPlotlines(project: ProjectState, chapterNo: number, advancedLines: string[]): void {
  if (!Array.isArray(project.plotlines) || advancedLines.length === 0) return
  for (const line of project.plotlines) {
    if (advancedLines.includes(line.name) && !line.chapters.includes(chapterNo)) {
      line.chapters.push(chapterNo)
    }
  }
}

/** AI 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
export async function suggestPlotlines(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Plotline[]> {
  const system = [
    '你是一位网文剧情架构师。根据本书的大纲、卷计划、已写章节标题与编年录，为作者提炼建议的剧情线（主线/支线/人物线/悬念线）。',
    '每条线要：名称简洁有力；目标写清楚这条线最终要完成什么；progress 写当前推进到哪（没有就空字符串）。',
    '建议 4-8 条，覆盖：1 条主线、1-2 条人物线、1-2 条悬念线、1-3 条支线。避免与大纲明显重复的废话线。',
    '输出必须是合法 JSON 数组，格式：[{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": ""}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending')
  const user = [
    `书名：《${project.bookName}》`,
    `大纲（节选前 4000 字）：\n${project.outline.slice(0, 4000)}`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}`).join('\n')}`
      : '',
    written.length > 0
      ? `已写章节：\n${written.map(c => `第${c.no}章《${c.title}》${c.summary !== undefined && c.summary !== '' ? `：${c.summary.slice(0, 80)}` : ''}`).join('\n')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join('\n')}`
      : '',
    '只输出 JSON 数组。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.6, maxTokens: Math.max(config.maxTokens, 4000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonArray<Record<string, unknown>>(text)
  const lines: Plotline[] = []
  const kinds = new Set(['main', 'branch', 'character', 'mystery'])
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 40) : ''
    if (name === '') continue
    lines.push({
      id: '',
      name,
      kind: kinds.has(entry.kind as string) ? entry.kind as Plotline['kind'] : 'branch',
      goal: typeof entry.goal === 'string' ? entry.goal.trim().slice(0, 300) : '',
      progress: typeof entry.progress === 'string' ? entry.progress.trim().slice(0, 300) : '',
      status: 'active',
      chapters: [],
      createdAt: new Date().toISOString(),
    })
  }
  return lines
}

/** AI 刷新单条剧情线的进度：结合编年录与各章摘要分析该线推进到哪。 */
export async function refreshPlotlineProgress(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  line: Plotline,
): Promise<string> {
  const system = [
    '你是一位网文剧情线管理员。请根据「剧情线信息」与「本书已写章节摘要/编年录」，判断这条线目前推进到了哪一步。',
    '输出一句话（30-60 字）：这条线当前的状态、最近一次推进发生在第几章、下一步可能的方向。如果这条线还没开始推进，明确说"尚未推进"。',
    '输出必须是合法 JSON 对象：{"progress": "一句话"}',
    '重要：不要输出任何其他文字。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && (c.summary !== undefined && c.summary !== ''))
  const user = [
    `剧情线：${line.name}（${line.kind}）`,
    `目标：${line.goal}`,
    `已知进度：${line.progress !== '' ? line.progress : '（无）'}`,
    `已关联章节：${line.chapters.length > 0 ? line.chapters.map(n => `第${n}章`).join('、') : '（无）'}`,
    `章节摘要（最近 8 章）：\n${written.slice(-8).map(c => `第${c.no}章《${c.title}》：${c.summary!.slice(0, 120)}`).join('\n')}`,
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join('\n')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{ progress?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 2000) , reasoning: config.analysisReasoning ?? 'low' }),
  )
  return typeof raw.progress === 'string' ? raw.progress.trim().slice(0, 300) : ''
}

/** ✨ AI 从全书提炼角色库：大纲 + 道藏 + 编年录 + 章节摘要 → 结构化角色清单。 */
export async function extractRoles(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<RoleRecord[]> {
  const system = [
    '你是一位网文角色库管理员。请根据本书的大纲、设定、编年录与章节摘要，提炼完整的角色库。',
    '覆盖原则：所有在编年录/章节中实际出场或有名有姓的角色都应收录；无名的功能性人物（如"矮胖姑娘"）用其身份简称收录并标注；反复出现且有剧情作用的身份型角色（站长、律师、警察、法官、店主等）必须收录。',
    '数量控制：最多输出 20 个角色；覆盖优先——主角、主要反派、重要配角（女主/关键配角）必须全收，所有有名有姓者必收；只有真正一次性路人（无名字、无剧情作用）才可省略。',
    '重要：正常一部完整故事应提炼 8-20 个角色；若少于 6 个通常说明漏提炼，必须重新核对正文摘录。',
    '重要：正文中若有明确的主角与主要反派，必须分别以 protagonist / antagonist 收录，禁止遗漏；反派确实未出场时才可省略。',
    '输出优先级：主角（protagonist）与主要反派（antagonist）必须优先输出并完整刻画，其次女主/重要配角；判断不出名字时用正文中的身份称呼。',
    '每个角色输出：',
    '1. name：角色名（或身份简称）。主角/有名配角必须用正文中实际出现的人名（如「沈放」），禁止用「主角（38岁超市理货员）」这类把身份塞进名字的占位名；正文确实没点名时才可用身份简称（如「富商」「灰衣老人」）。',
    '2. roleLabel：定位——protagonist=主角；female_lead=女主（唯一知己/感情线核心，无后宫前提下只此一位）；female_support=重要女配；support=普通配角；antagonist=反派；extra=路人/背景。',
    '3. identity：身份一句话（宗门/势力/血脉/职业）。',
    '4. traits：3-6 个性格标签。',
    '5. goals：目标与动机一句话。',
    '6. relations：关系网数组，格式["角色名（关系）", ...]。',
    '7. arc：成长线数组，格式["阶段：说明", ...]（如"出场：祭品身份"/"转折：祭祀被中断脱身"）。',
    '8. knowledge：该角色已经知道的关键信息（3-8 条），不知道的信息不要写进去。',
    '精简要求：identity 控制在 30 字内；traits 3-6 个短标签；goals 60 字内；relations 2-5 条；arc 2-4 条；knowledge 每条 40 字内。整体输出量要紧凑，避免冗长。',
    '重要：用户消息里列出的「已收录角色」绝不要再次输出——这些角色已经在角色库里，跳过它们，只提炼未收录的。',
    '输出必须是合法 JSON 数组，不要输出其他文字：[{"name":"...", "roleLabel":"...", "identity":"...", "traits":[...], "goals":"...", "relations":[...], "arc":[...], "knowledge":[...]}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const existingRoles = project.roles ?? []
  // 正文摘录：均匀采样覆盖全书（开头/中间/结尾），避免只取前几章漏掉后期才出场的重要角色。
  const sampleChapters: ChapterPlan[] = written.length <= 10
    ? written
    : (() => {
      const picked = new Set<number>()
      for (let i = 0; i < 3 && i < written.length; i++) picked.add(i)
      const step = Math.max(1, Math.floor(written.length / 8))
      for (let i = step; i < written.length - 3; i += step) picked.add(i)
      for (let i = Math.max(0, written.length - 3); i < written.length; i++) picked.add(i)
      return [...picked].sort((a, b) => a - b).map(i => written[i])
    })()
  const excerptParts: string[] = []
  for (const chapter of sampleChapters) {
    const body = readChapterFile(config.outputDir, chapter)
    if (body === undefined) continue
    const text = body.replace(/^#.*$/gm, '').trim()
    if (text.length > 0) excerptParts.push(`第${chapter.no}章《${chapter.title}》\n${text.slice(0, 3000)}`)
  }
  // 出场频次统计：道藏角色名 + 已收录角色，扫全书统计出现次数，传给 LLM 做重要性判断参考
  const freqCandidates = new Set<string>()
  for (const c of project.bible?.characters ?? []) freqCandidates.add(c.name)
  for (const r of existingRoles) freqCandidates.add(r.name)
  const freqMap = new Map<string, number>()
  if (freqCandidates.size > 0) {
    for (const chapter of written) {
      const body = readChapterFile(config.outputDir, chapter)
      if (body === undefined) continue
      for (const name of freqCandidates) {
        let idx = 0, n = 0
        while ((idx = body.indexOf(name, idx)) !== -1) { n++; idx += name.length }
        if (n > 0) freqMap.set(name, (freqMap.get(name) ?? 0) + n)
      }
    }
  }
  const freqLines = [...freqMap.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, n]) => name + '(' + n + '次)')
  const user = [
    `书名：《${project.bookName}》`,
    existingRoles.length > 0
      ? `已收录角色（跳过，不要输出）：${existingRoles.map(r => r.name).join('、')}`
      : '',
    `大纲（节选前 3000 字）：\n${project.outline.slice(0, 3000)}`,
    excerptParts.length > 0
      ? `已写正文摘录（角色姓名/身份/关系以正文为准）：\n${excerptParts.join('\n\n')}`
      : '',
    project.bible !== undefined && project.bible.characters.length > 0
      ? `已有角色卡（补充信息）：\n${project.bible.characters.map(c => `- ${c.name}（${c.role}）：${c.traits.join('、')}${c.goals !== '' ? `；目标：${c.goals}` : ''}`).join('\n')}`
      : '',
    freqLines.length > 0
      ? `角色出场频次参考（全书统计，次数越多越重要，优先收录高频角色）：${freqLines.join('、')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录（最近 30 条）：\n${(project.facts ?? []).slice(-30).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 60)}`).join('\n')}`
      : '',
    written.length > 0
      ? `已写章节标题（${written.length} 章）：\n${written.map(c => `第${c.no}章《${c.title}》`).join('、')}`
      : '',
    '只输出 JSON 数组。',
  ].join('\n\n')
  let text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 16000), reasoning: config.analysisReasoning ?? 'low' })
  let raw = parseJsonArray<Record<string, unknown>>(text)
  const hasProtagonist = raw.some(e => typeof e === 'object' && e !== null && e.roleLabel === 'protagonist')
  const tooFew = raw.length > 0 && raw.length < 6
  if (raw.length === 0 || !hasProtagonist || tooFew) {
    // LLM 偶发输出非 JSON / 空数组 / 漏主角 / 角色过少：重试一次（追加明确指令），避免静默返回空或缺角色的候选。
    const hint = raw.length === 0
      ? '\n上一次输出为空或格式不正确。请直接输出 JSON 数组（即使只有一个角色也要输出），不要输出其他文字。'
      : tooFew
        ? '\n上一次输出角色过少（不足 6 个）。这是一部完整故事，请重新核对正文摘录：主角、主要反派、重要配角与所有有名有姓的角色都要收录（宁多勿漏），输出 8-20 个。'
        : '\n上一次输出中缺少主角（roleLabel 为 protagonist 的角色）。请重新输出完整 JSON 数组，务必包含正文中的主角。'
    text = await complete(ctx, config, { system: system + hint, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
    raw = parseJsonArray<Record<string, unknown>>(text)
  }
  const labels = new Set(['protagonist', 'female_lead', 'female_support', 'support', 'antagonist', 'extra'])
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const toRole = (entry: Record<string, unknown>): RoleRecord | undefined => {
    if (typeof entry !== 'object' || entry === null) return undefined
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 30) : ''
    if (name === '') return undefined
    return {
      name,
      roleLabel: labels.has(entry.roleLabel as string) ? entry.roleLabel as RoleRecord['roleLabel'] : 'support',
      identity: typeof entry.identity === 'string' ? entry.identity.slice(0, 100) : '',
      traits: strArr(entry.traits).map(t => t.slice(0, 20)).slice(0, 8),
      goals: typeof entry.goals === 'string' ? entry.goals.slice(0, 200) : '',
      relations: strArr(entry.relations).map(r => r.slice(0, 60)).slice(0, 10),
      arc: strArr(entry.arc).map(a => a.slice(0, 120)).slice(0, 10),
      knowledge: strArr(entry.knowledge).map(k => k.slice(0, 120)).slice(0, 12),
    }
  }
  const roles: RoleRecord[] = []
  for (const entry of raw) {
    const role = toRole(entry)
    if (role !== undefined) roles.push(role)
  }
  // 完整性补漏：通用第二轮——检查是否遗漏「身份型/功能性角色」（站长/律师/警察等反复出现者），不依赖任何名单。
  if (roles.length > 0) {
    const names = roles.map(r => r.name).join('、')
    const patchSystem = system + '\n上一次已提炼角色：' + names + '。\n现在只输出「遗漏的角色」JSON 数组：检查正文摘录中反复出现、有固定身份称呼（如站长、律师、警察、法官、店主、老师）且对剧情有作用的角色；一次性路人不要输出。没有遗漏就输出 []。字段与上面相同。'
    try {
      const patchText = await complete(ctx, config, { system: patchSystem, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
      const patchRaw = parseJsonArray<Record<string, unknown>>(patchText)
      const existing = new Set(roles.map(r => r.name))
      for (const entry of patchRaw) {
        const role = toRole(entry)
        if (role === undefined || existing.has(role.name)) continue
        existing.add(role.name)
        roles.push(role)
        if (roles.length >= 20) break
      }
    } catch { /* 补漏失败不阻塞主结果 */ }
  }
  // 确定性兜底：正文中反复出现的身份型称呼（站长/律师/警察等）若 LLM 仍漏掉，按出现次数直接补条（通用、不依赖名单）。
  const ROLE_TITLE_HINTS = ['站长', '律师', '检察官', '法官', '警察', '店主', '老板', '经理', '局长', '医生', '老师', '护士', '房东', '司机', '保安', '主管', '队长', '厂长', '董事长', '总裁', '市长', '道长', '掌门', '师父', '师傅', '管家', '长老', '宗主', '殿主', '宫主', '师兄', '师姐', '师弟', '师妹', '老祖', '魔尊', '妖王', '将军', '军师', '太监', '宫女', '嬷嬷', '宰相', '尚书', '巡抚', '都督', '祭司', '圣女', '圣子']
  const existingNames = new Set(roles.map(r => r.name))
  const titleCount = new Map<string, number>()
  for (const chapter of written) {
    const body = readChapterFile(config.outputDir, chapter)
    if (body === undefined) continue
    for (const t of ROLE_TITLE_HINTS) {
      let idx = 0
      let n = 0
      while ((idx = body.indexOf(t, idx)) !== -1) {
        n++
        idx += t.length
      }
      titleCount.set(t, (titleCount.get(t) ?? 0) + n)
    }
  }
  for (const t of ROLE_TITLE_HINTS) {
    if (roles.length >= 20) break
    const covered = existingNames.has(t) || [...existingNames].some(n => n.includes(t))
    if (!covered && (titleCount.get(t) ?? 0) >= 3) {
      existingNames.add(t)
      roles.push({ name: t, roleLabel: 'support', identity: '身份型角色（正文反复出现）', traits: [], goals: '', relations: [], arc: [], knowledge: [] })
    }
  }
  return roles
}

/** ✨ AI 从全书提炼场景库：正文/编年录 → 高频重要场景的结构化视觉锚点。 */
export async function extractScenes(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterNo?: number,
  styleId?: string,
  filterId?: string,
): Promise<SceneCard[]> {
  const styleWords = styleKeywords(styleId, filterId)
  const chapterLabel = chapterNo !== undefined ? '第' + chapterNo + '章' : '全书'
  const system = [
    '你是一位网文漫剧场景导演。根据指定章节的正文，提炼「镜头场景」——漫剧分镜/生图时每个镜头要知道"在哪、什么时间光态、拍什么情节、人物什么状态"。',
    '当前提取范围：' + chapterLabel + '。只提炼本章实际出现的场景，不要提前提取后续章节的场景。',
    '【当前视觉风格】（moment/palette/moods/zh/en 必须按此风格措辞，不能写中性描述）：' + styleWords,
    '重要：每个场景的 zh 提示词段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。',
    '每个场景必须是「镜头场景」而非仅场地：给出该场景的关键情节镜头（人物动作+情绪+镜头推进，只写进 beats，禁止写进 zh）；场景生图提示词 zh/en 必须是无人空镜。',
    '数量控制：本章输出 3-5 个场景；每个场景必须能对应到本章正文实际出现过的地点与情节，不得凭空虚构。',
    '每个场景输出：',
    '1. name：场景名（地点+光态，如「后场通道·装卸口（雨夜）」）。',
    '2. act：场景在本章的段落位置（开篇/发展/高潮/结局）。',
    '3. moment：时间光态（夜间闭店后/雨夜/凌晨/频闪灯…）。',
    '4. summary：一句话定位（空间类型/功能/氛围）。',
    '5. beats：关键情节镜头 1-3 条（人物动作+情绪+镜头推进，如"沈放佝偻站在货架过道，镜头推近，情绪从漠然过渡到压抑悲伤"）。',
    '6. characterState：主角/关键角色在该场景的状态一句话（含标志物细节如标签磨损、手腕红痕）。',
    '7. elements：环境构成数组 3-6 项（空间结构/陈设/标志物）。',
    '8. palette：色调与光影数组 2-4 项（颜色词，可附 HEX）。',
    '9. moods：氛围关键词 2-4 个（压抑/神秘/空旷/悲凉…）。',
    '10. zh：中文生图提示词（连贯一段，写实电影感），必须为【无人物空镜】——只写空间结构/材质/光线/氛围/标志物，严禁任何人物、动作、情节、台词、镜头调度（人物与情节由角色卡和分镜负责，场景底图必须是无人空镜）。',
    '11. en：英文生图提示词（booru 风格逗号分隔，含 photorealistic/cinematic）。',
    '12. tags：3-6 个关键标签。',
    '13. source：依据来源说明（哪几章哪些描写）。',

    '14. tier：场景分级——core（核心场景，反复出现≥3次或多章引用，需精修多图）/ secondary（次要场景，出现1-2次，一张全景图够）/ passing（路过场景，只被提到名字，不做图）。按出场重要性自动判断。',
    '15. negativePrompt：负面提示词（场景专用，必须包含 no people, no characters, no text, no watermark, no logo，可补充场景相关负面词）。',    '若本章存在关键转折或抉择，最后 1 个场景应为「转折场景」，beats 里写明关键画面（禁止写进 zh）。',
    '输出必须是合法 JSON 数组，不要输出其他文字：[{"name":"...", "act":"...", "moment":"...", "summary":"...", "beats":[...], "characterState":"...", "elements":[...], "palette":[...], "moods":[...], "zh":"...", "en":"...", "tags":[...], "source":"...", "tier":"...", "negativePrompt":"..."}]',
    '重要：所有字符串值内部不得包含换行符；直接输出 JSON 结果本身。',
  ].join('\n')
  const targetChapters = chapterNo !== undefined
    ? project.chapters.filter(c => c.no === chapterNo && c.status !== 'pending' && c.status !== 'generating')
    : project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating').slice(0, 4)
  const excerptParts: string[] = []
  for (const chapter of targetChapters) {
    const body = readChapterFile(config.outputDir, chapter)
    if (body === undefined) continue
    const text = body.replace(/^#.*$/gm, '').trim()
    if (text.length > 0) excerptParts.push('第' + chapter.no + '章《' + chapter.title + '》' + '\n' + text.slice(0, 3000))
  }
  const user = [
    '书名：《' + project.bookName + '》',
    (project.facts ?? []).length > 0
      ? '编年录（最近 80 条，场景地点以这里为准）：' + '\n' + (project.facts ?? []).slice(-80).map(f => '[第' + f.chapterNo + '章] ' + f.text.slice(0, 80)).join('\n')
      : '',
    excerptParts.length > 0
      ? '已写正文摘录（场景描写以正文为准）：' + '\n' + excerptParts.join('\n')
      : '',
    '只输出 JSON 数组。',
  ].filter(s => s !== '').join('\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 32000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonArray<Record<string, unknown>>(text)
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
  const scenes: SceneCard[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = str(entry.name).slice(0, 40)
    if (name === '') continue
    scenes.push({
      name,
      act: str(entry.act).slice(0, 40),
      moment: str(entry.moment).slice(0, 60),
      summary: str(entry.summary).slice(0, 120),
      beats: strArr(entry.beats).map(t => t.slice(0, 120)).slice(0, 3),
      characterState: str(entry.characterState).slice(0, 160),
      elements: strArr(entry.elements).map(t => t.slice(0, 60)).slice(0, 6),
      palette: strArr(entry.palette).map(t => t.slice(0, 40)).slice(0, 4),
      moods: strArr(entry.moods).map(t => t.slice(0, 20)).slice(0, 4),
      zh: ensureStyleEmbedded(str(entry.zh).slice(0, 800), styleWords, 'zh'),
      en: ensureStyleEmbedded(str(entry.en).slice(0, 600), styleWords, 'en'),
      tags: strArr(entry.tags).map(t => t.slice(0, 24)).slice(0, 6),
      source: str(entry.source).slice(0, 120),

      tier: (['core', 'secondary', 'passing'] as const).includes(str(entry.tier) as any) ? (str(entry.tier) as 'core' | 'secondary' | 'passing') : 'secondary',
      negativePrompt: str(entry.negativePrompt) !== '' ? str(entry.negativePrompt).slice(0, 300) : 'no people, no characters, no text, no watermark, no logo, no subtitles, blurry, low quality, distorted, deformed',      styleId,
    })
  }
  // 本地统计出场章节：自动补 tier 和 appearsInChapters（不依赖 LLM 判断，更准确）
  const sceneShort = (n: string): string => n.split('·')[0].split('（')[0].split('(')[0].trim()
  const writtenChapters = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  for (const sc of scenes) {
    const appears: number[] = []
    const short = sceneShort(sc.name)
    for (const ch of writtenChapters) {
      const body = readChapterFile(config.outputDir, ch)
      if (body === undefined) continue
      if (body.includes(sc.name) || (short.length >= 2 && body.includes(short))) {
        if (!appears.includes(ch.no)) appears.push(ch.no)
      }
    }
    appears.sort((a, b) => a - b)
    sc.appearsInChapters = appears.length > 0 ? appears : sc.appearsInChapters
    // tier 兜底：LLM 没给或给了 passing 但实际有出场时，按出场数重算
    if (sc.tier === undefined || (sc.tier === 'passing' && appears.length > 0)) {
      sc.tier = appears.length >= 3 ? 'core' : appears.length >= 1 ? 'secondary' : 'passing'
    }
    // negativePrompt 兜底
    if (sc.negativePrompt === undefined || sc.negativePrompt === '') {
      sc.negativePrompt = 'no people, no characters, no text, no watermark, no logo, no subtitles, blurry, low quality, distorted, deformed'
    }
  }
  // 去重：与已有场景短名重复的 candidate 不返回（避免多次提取后累积重复）
  const existingShorts = new Set((project.scenes ?? []).map(s => sceneShort(s.name)))
  let deduped = scenes.filter(sc => !existingShorts.has(sceneShort(sc.name)))
  // 数量控制：core≤5, secondary≤5, passing≤2，总计≤10
  const coreScenes = deduped.filter(s => s.tier === 'core').slice(0, 5)
  const secondaryScenes = deduped.filter(s => s.tier === 'secondary').slice(0, 5)
  const passingScenes = deduped.filter(s => s.tier === 'passing').slice(0, 2)
  deduped = [...coreScenes, ...secondaryScenes, ...passingScenes]
  // 落盘：把每个场景的中文生图提示词写入资产库 manga-assets/场景/场景名/提示词.txt
  for (const sc of deduped) {
    try { saveMangaScenePrompt(config.outputDir, sc.name, sc.zh, sc.negativePrompt) } catch { /* 落盘失败不阻塞 */ }
  }
  return deduped
}




/** 从 txt/md 全本文本拆章（纯逻辑，不落盘）：识别章节头、剥离重复标题、去重、排序并统一重新编号。 */
export function splitBookText(raw: string): Array<{ no: number; title: string; body: string }> {
  const lines = raw.split(/\r?\n/)
  // 拆章：中文「第X章/回/节/卷」、中文数字章节（一、二、三…）、特殊章节（序章/楔子/尾声/番外…）、英文 Chapter N（均可带 # 前缀）。
  const chapterHead = /^\s*(?:#\s*)?第\s*(\d+|[一二三四五六七八九十百千]+)\s*[章回节卷]\s*(.*?)\s*$/
  const cnOnlyHead = /^\s*(?:#\s*)?([一二三四五六七八九十百千万零〇]{1,6})(?:[、.．:：]\s*(.*?)\s*)?$/
  const specialHead = /^\s*(?:#\s*)?(序章|序言|楔子|引子|前言|开篇|尾声|终章|大结局|番外(?:篇|章)?|后记|完结感言|上架感言|作者的话)\s*[：:、.\s]*(.*?)\s*$/
  const enHead = /^\s*(?:#\s*)?chapter\s+(\d+)\s*[.:：、\-\s]*(.*?)\s*$/i
  const cnNum: Record<string, number> = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,百:100,千:1000 }
  const parseCn = (s: string): number => {
    if (/^\d+$/.test(s)) return Number(s)
    let total = 0; let section = 0
    for (const ch of s) {
      const v = cnNum[ch]
      if (v === undefined) return 0
      if (v >= 10) { total += (section > 0 ? section : 1) * v; section = 0 } else section = v
    }
    return total + section
  }
  interface Chunk { sortKey: number; title: string; body: string[] }
  const chunks: Chunk[] = []
  let current: Chunk | null = null
  let specialSeq = 0
  for (const line of lines) {
    const m = chapterHead.exec(line)
    if (m !== null) {
      const no = parseCn(m[1])
      if (current !== null) chunks.push(current)
      current = { sortKey: no > 0 ? no : chunks.length + 1, title: (m[2] ?? '').trim(), body: [] }
      continue
    }
    const mc = cnOnlyHead.exec(line)
    if (mc !== null) {
      const no = parseCn(mc[1])
      if (current !== null) chunks.push(current)
      const t = (mc[2] ?? '').trim()
      current = { sortKey: no > 0 ? no : chunks.length + 1, title: t !== '' ? t : '第' + mc[1] + '章', body: [] }
      continue
    }
    const ms = specialHead.exec(line)
    if (ms !== null) {
      specialSeq++
      const name = ms[1]
      const front = /序章|序言|楔子|引子|前言|开篇/.test(name)
      const title = (ms[2] ?? '').trim()
      if (current !== null) chunks.push(current)
      current = { sortKey: front ? specialSeq * 0.001 : 999999 + specialSeq * 0.001, title: title !== '' ? title : name, body: [] }
      continue
    }
    const me = enHead.exec(line)
    if (me !== null) {
      if (current !== null) chunks.push(current)
      current = { sortKey: Number(me[1]), title: (me[2] ?? '').trim(), body: [] }
      continue
    }
    if (current !== null) current.body.push(line)
  }
  if (current !== null) chunks.push(current)
  if (chunks.length === 0) throw new Error('未识别到章节（需要"第X章"格式、中文数字章节（一、二、三…）、序章/楔子/尾声等章节标题、英文 Chapter N，或带 # 的章节标题）')
  // 章节头重复行（如 "第1章 xxx" 与 "# 第1章 xxx" 同现、空行）先从正文剥离。
  const stripHead = (b: string[]): string => {
    let i = 0
    while (i < b.length) {
      const t = b[i].trim()
      if (t === '' || chapterHead.test(t) || cnOnlyHead.test(t) || specialHead.test(t) || enHead.test(t)) i++
      else break
    }
    return b.slice(i).join('\n').trim()
  }
  // 同编号（目录+正文重复）保留正文最长的一份，再按位置排序后统一重新编号。
  const byKey = new Map<number, Chunk>()
  for (const c of chunks) {
    const len = stripHead(c.body).length
    const ex = byKey.get(c.sortKey)
    if (ex === undefined || len > stripHead(ex.body).length) byKey.set(c.sortKey, c)
  }
  const ordered = [...byKey.values()].sort((a, b) => a.sortKey - b.sortKey)
  return ordered.map((c, i) => ({ no: i + 1, title: c.title, body: stripHead(c.body) }))
}

/** 拆章预览（不落盘）：章节编号/标题/字数 + 跳过清单。 */
export function previewBookText(raw: string): { chapters: Array<{ no: number; title: string; chars: number }>; skipped: string[] } {
  const chapters: Array<{ no: number; title: string; chars: number }> = []
  const skipped: string[] = []
  for (const c of splitBookText(raw)) {
    if (c.body.length < 50) {
      skipped.push('第' + c.no + '章' + (c.title !== '' ? '「' + c.title + '」' : '') + '（内容过短，已跳过）')
      continue
    }
    chapters.push({ no: c.no, title: c.title !== '' ? c.title : '第' + c.no + '章', chars: c.body.length })
  }
  return { chapters, skipped }
}

/** 从全本文本导入（浏览器上传 / 服务器文件共用）：建项目、写章节文件、保存。 */
export function importBookTextFromText(
  raw: string,
  outputDir: string,
  bookName: string,
): { bookName: string; chapters: number; skipped: string[] } {
  const project = createProject(bookName)
  mkdirSync(outputDir, { recursive: true })
  const skipped: string[] = []
  for (const c of splitBookText(raw)) {
    const body = c.body
    if (body.length < 50) { skipped.push('第' + c.no + '章' + (c.title !== '' ? '「' + c.title + '」' : '') + '（内容过短，已跳过）'); continue }
    const chapter: ChapterPlan = {
      no: c.no, volume: 0, title: c.title !== '' ? c.title : '第' + c.no + '章', beats: '', targetChars: 0,
      status: 'written', file: '', chars: 0,
    }
    chapter.file = chapterFileName(chapter)
    writeFileSync(join(outputDir, chapter.file), '# 第' + c.no + '章 ' + chapter.title + '\n\n' + body + '\n', 'utf8')
    chapter.chars = body.length
    project.chapters.push(chapter)
  }
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return { bookName, chapters: project.chapters.length, skipped }
}

/** 从 txt/md 全本文件导入：编码自适应读取后拆章建项目，status=written（待审稿）。 */
export function importBookText(
  filePath: string,
  outputDir: string,
): { bookName: string; chapters: number; skipped: string[] } {
  const raw = decodeTextSmart(readFileSync(filePath))
  const bookName = basename(filePath, extname(filePath)).slice(0, 40) || '导入小说'
  return importBookTextFromText(raw, outputDir, bookName)
}

/** 常见职业/身份尾缀：角色名如「周野律师」正文可能只写「周野」或「周野的律师」。 */
const ROLE_NAME_SUFFIXES = ['律师', '辩护律师', '医生', '老师', '教授', '先生', '女士', '小姐', '警官', '警察', '局长', '总经理', '经理', '老板', '师父', '师傅', '道长', '老祖', '长老', '掌门', '少主', '公主', '王子', '王妃', '皇后', '皇帝', '王爷', '公子', '姑娘', '夫人', '太太', '大人', '将军', '丞相', '尚书', '员外']

/**
 * 从角色名/身份拆出正文可能使用的检索词：
 * - specific：具体称谓（含职业尾缀或 3 字以上身份片段），如「周野的律师」「辩护律师」「律师」——优先用，避免误抓到同名主干（周野）的段落；
 * - stems：名字主干（如「周野」），最后兜底。
 */
function roleFallbackTokens(name: string, identity: string | undefined): { specific: string[]; stems: string[] } {
  const specific = new Set<string>()
  const stems = new Set<string>()
  const addName = (s: string): void => {
    const t = s.trim()
    if (t.length < 2) return
    specific.add(t)
    for (const q of ['辩护', '助理', '高级', '首席', '御用', '御前', '专职']) {
      if (t.includes(q)) specific.add(t.replace(q, ''))
    }
    for (const suf of ROLE_NAME_SUFFIXES) {
      if (t.endsWith(suf) && t.length > suf.length + 1) {
        const stem = t.slice(0, -suf.length)
        // 「周野律师」→「周野的律师」（正文常见写法）
        specific.add(stem + '的' + suf)
        specific.add(suf)
        if (stem.length >= 2) stems.add(stem)
      }
    }
  }
  addName(name)
  for (const part of (identity ?? '').split(/[的，,。\s]+/)) {
    const p = part.trim()
    if (p.length < 2) continue
    if (p.length >= 3 || ROLE_NAME_SUFFIXES.some(s => p.endsWith(s))) {
      specific.add(p)
      for (const suf of ROLE_NAME_SUFFIXES) {
        if (p.endsWith(suf) && p.length > suf.length + 1) {
          specific.add(suf)
          stems.add(p.slice(0, -suf.length))
        }
      }
    } else {
      stems.add(p)
    }
  }
  return { specific: [...specific].filter(t => t.length >= 2), stems: [...stems].filter(t => t.length >= 2) }
}

/** 保证风格词块已内嵌（LLM 偶发漏嵌时兜底）：zh 段首前缀，en 末尾追加。 */
function ensureStyleEmbedded(text: string, styleWords: string, lang: 'zh' | 'en'): string {
  const t = text.trim()
  if (styleWords === '' || t === '') return t
  if (t.includes(styleWords)) return t
  return lang === 'zh' ? styleWords + '，' + t : t + '，' + styleWords
}

/** 对 zh/en 一对提示词统一补风格词块。 */
function withStyle(pair: { zh: string; en: string }, styleWords: string): { zh: string; en: string } {
  return { zh: ensureStyleEmbedded(pair.zh, styleWords, 'zh'), en: ensureStyleEmbedded(pair.en, styleWords, 'en') }
}

/** 动漫形象描述词（中文描述 + 英文 booru 标签 + 关键外貌标签）。 */
export interface RoleVisualPrompt {
  zh: string
  en: string
  tags: string[]
  source: string
  /** 即梦/生图通用负面提示词。 */
  negativePrompt?: string
  /** 该角色所需情绪表情清单（6-12 个，如 疲惫/麻木/压抑悲伤）。 */
  expressions?: string[]
  /** 四类精修提示词（立绘/四视图/表情/细节，一次提炼直接产出）。 */
  promptKit?: RoleRecord['promptKit']
}

/** 可提炼形象的「角色源」：小说角色卡或漫剧角色卡的最小公共面。 */
interface RoleVisualSource {
  name: string
  identity?: string
  traits?: string[]
}

/**
 * 底层实现：为任意角色源提炼「动漫形象描述词」（不写库，写库由上层调用方负责）。
 * 扫描该角色出场的已写章节正文，截取含外貌描写的段落，交给 LLM 提炼中文描述 + 英文绘图标签。
 */
async function extractRoleVisualFrom(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  role: RoleVisualSource,
  styleId?: string,
  filterId?: string,
  shortDrama = false,
  tier: 'protagonist' | 'supporting' | 'extra' = 'protagonist',
): Promise<RoleVisualPrompt> {
  const roleName = role.name

  // 1. 扫描正文：收集该角色出场且可能含外貌描写的段落（最近 60 章内，每章最多 2 段，共 12 段）。
  // 支持“描述型角色名”（如「灰蓝工装女人」）：先精确匹配，匹配不到时用角色名拆分出的关键词兜底。
  const appearanceHints = /(发|眉|眼|眸|脸|肤|唇|身材|身高|衣|袍|裙|衫|靴|腰带|气质|模样|长相|容貌|披|束|扎|戴|佩|挂|绣|青|白|黑|红|蓝|紫|灰|银|金|少年|青年|少女|汉子|老者|中年|纤细|挺拔|瘦削|壮实|清秀|俊朗|英气|阴鸷|慈眉)/
  // 从角色名 + 身份描述中提取可检索关键词，支持“描述型角色名”（灰蓝工装女人）和“身份型角色名”（富商）。
  const roleText = `${role.name} ${role.identity ?? ''}`
  const colorWords = ['深灰', '灰蓝', '灰', '蓝', '白', '黑', '红', '青', '紫', '银', '金', '黄', '绿', '粉', '棕']
  const garmentWords = ['工装', '西装', '定制西装', '袍', '裙', '衫', '衣', '裤', '靴', '鞋', '帽', '腰带', '制服', '外套', '马甲', '夹克']
  const roleWords = ['女人', '男人', '老者', '老人', '中年', '青年', '少女', '姑娘', '男子', '女子', '工人', '路人', '购买者']
  const locationWords = ['别墅', '小区', '街区']
  const identityTokens = (role.identity ?? '').split(/[，,。\s]+/).filter(t => t.length >= 2)
  const searchTokens = Array.from(new Set([
    roleName,
    ...identityTokens,
    ...colorWords.filter(w => roleText.includes(w)),
    ...garmentWords.filter(w => roleText.includes(w)),
    ...roleWords.filter(w => roleText.includes(w)),
    ...locationWords.filter(w => roleText.includes(w)),
  ])).filter(t => t.length >= 2)
  const matchesRole = (para: string, tokens: string[]): boolean => para.includes(roleName) || tokens.some(tok => para.includes(tok))
  const excerpts: Array<{ no: number; text: string }> = []
  const written = project.chapters
    .filter(c => c.status !== 'pending' && c.status !== 'generating' && c.file !== undefined)
  /** 扫描一批章节，收集该角色出场且可能含外貌描写的段落（每章最多 2 段，共 12 段）。 */
  const scanChapters = (list: ChapterPlan[], tokens: string[]): void => {
    for (const chapter of list) {
      if (excerpts.length >= 12) break
      const body = readChapterFile(outputDir, chapter)
      if (body === undefined) continue
      const paras = body.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0)
      let perChapter = 0
      for (const para of paras) {
        if (perChapter >= 2 || excerpts.length >= 12) break
        if (!matchesRole(para, tokens)) continue
        // 优先外貌描写段（含外貌关键词），否则纯动作段也收（LLM 自己判断）。
        if (appearanceHints.test(para) || excerpts.length < 4) {
          excerpts.push({ no: chapter.no, text: para.slice(0, 220) })
          perChapter++
        }
      }
    }
  }
  // 第 1 优先：最近 60 章（快路径）。
  scanChapters(written.slice(-60), searchTokens)
  // 第 2 优先：角色可能只在早期出场（全书 >60 章时），全书回扫。
  if (excerpts.length === 0) scanChapters(written, searchTokens)
  // 第 3 优先：角色名/身份带职业尾缀（如「周野律师」→ 正文写「周野的律师/律师」），用具体称谓扫。
  if (excerpts.length === 0) {
    const fb = roleFallbackTokens(role.name, role.identity)
    if (fb.specific.length > 0) scanChapters(written, fb.specific)
  }
  // 第 4 兜底：具体称谓也没找到时，退回名字主干（如「周野」），交给 LLM 判断是否目标角色。
  if (excerpts.length === 0) {
    const fb = roleFallbackTokens(role.name, role.identity)
    if (fb.stems.length > 0) scanChapters(written, fb.stems)
  }
  if (excerpts.length === 0) {
    throw new Error(`正文中未找到「${roleName}」的出场描写（已扫描全书及角色名拆分词），请确认角色名与正文一致，或该角色尚未在正文出场`)
  }

  // 2. LLM 提炼：一次输出 锚点 + 表情清单 + 四类精修提示词。
  const rules = project.visualRules ?? []
  const styleWords = styleKeywords(styleId, filterId)
  const system = [
    '你是一位动漫角色设定师与 AI 绘图提示词工程师。根据网文正文中该角色的实际外貌描写，输出「形象锚点」与「四类生图提示词」——一次完成，用于 AI 绘图（NovelAI / Stable Diffusion / Midjourney / 豆包等）生成一致的角色立绘。',
    '【当前视觉风格】（portrait 立绘的「风格」字段必须原样使用，sheet/expressions/details 同样内嵌）：' + styleWords,
    '重要：每段 zh 提示词的段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。',
    '硬性要求（依据优先）：',
    '1. 发色/发型/瞳色/服装/气质/标志物必须来自提供的正文段落，不得凭空发明。',
    '2. 正文未明确写到的项目（如瞳色没写、身高没写），用「未定」标注或直接不写，不要编造数值。',
    '3. 服装优先取正文明确出现的（颜色+款式），多次出现取最常穿的组合；服装按分件组织（上身/下身/鞋/配饰）。',
    '4. 标志物（标签/印记/饰品）必须出现在每段提示词中——它们是一致性的命根子。',
    '5. 立绘/四视图/细节是「角色设定稿」：禁止写瞬间动作与道具使用状态（握手机、看屏幕、未接来电、走路、回头等），禁止写剧情状态与场景背景；只保留可长期存在的外貌、服装与常驻标志物（工牌、饰品等）。',
    ...(shortDrama ? ['6. 短剧精简模式·人设极致化：性格标签必须极致化（如「极端偏执」「绝对冷血」，单一维度拉到最满）；外貌只保留 1-2 个最强辨识度点，弱化平凡细节；服装/标志物更夸张醒目。'] : []),
    ...(tier === 'supporting' ? ['配角模式：只需输出立绘提示词(portrait)，不需要四视图/表情/细节，外貌描述精简到80字以内。'] : []),
    ...(tier === 'extra' ? ['路人模式：不需要输出精修提示词(promptKit)和表情清单(expressions)，只需基础外貌描述(40字以内)和英文标签。'] : []),
    '【本书视觉规则】（必须内嵌进每段提示词，保证设定不跑偏）：',
    ...rules.map(r => '- ' + r),
    '输出六部分：',
    '- zh：中文形象锚点，一段连贯文字（60-150 字）：发色发型、瞳色、脸型气质、服装（颜色款式）、身材、标志性物件。',
    '- en：英文形象锚点，booru 风格、逗号分隔、小写，30-50 个标签：含性别（1boy/1girl）、发色、发型、瞳色、服装、气质、标志物。不要输出负面提示词。',
    '- tags：中文关键标签数组，5-10 个（如 ["黑发","束发","青色道袍","清秀","腰悬古玉"]）。',
    '- source：说明依据（如"第1章/第8章外貌描写；瞳色未明确"）。',
    '- negativePrompt：即梦/生图通用负面提示词，中文逗号分隔，8-12个词：必须包含 低质量、模糊、变形、多指、断肢、文字、水印、丑陋、比例失调；可根据角色补充（如写实风加 卡通）。',
    '- expressions：该角色在本书剧情中需要的情绪表情清单数组，6-12 个（如 ["疲惫","麻木","压抑悲伤","皱眉","紧绷","放空"]），依据正文情绪描写与角色处境推断。',
    '- promptKit：四类精修提示词（字段化+出图约束，参考示例结构）：',
    '  · portrait 立绘：严格按字段顺序写（参考示例结构）：开头构图定位（正面站立全身人像）→ 风格（3D动漫，超精细建模）→ 背景（纯白纯色背景）→ 身份（男子，{角色名}，外表{年龄}，男性）→ 发型发色 → 胡茬 → 眼眸 → 面部 → 气质 → 上身服装分件（颜色款式+磨损细节）→ 下身 → 鞋 → 标志物（标签/印记，含细节如洇暗翘边）→ 收尾（角色设计稿，细节完整展示，无多余杂物，全身完整无裁切）。',
    '  · sheet 角色设定稿：专业角色设计参考图（character design sheet），纯白背景，最高品质细节丰富。结构：1.主视觉区（上方）：正面+侧面+背面三视图，直观呈现整体身形、服饰搭配和标志性特征；2.补充信息区（左侧）：面部特写+配色板（明确毛发/服饰色值），补充主视角没覆盖的细节与色彩标准；3.局部细节区（底部）：小模块单独展示关键部件设计（配饰、点缀、关键身份识别元素），把模糊细节拆分为精准制作参考；4.全身比例照（右侧）：黄金比例参考物与人物身高形成对比。画质要求：8K高清纹理，质感光照，自然光线，布料褶皱自然，皮肤纹理细节完整，艺术写实风格，营造震撼视觉效果。人物外观设定按字段：年龄、性别、发型发色、五官（眉/眼/鼻/唇）、脸型、身高、气质、服装分件、标志物。',
    '  · expressions 表情：每个表情一段，脸部特写（头部到锁骨），纯白背景，五官与角色定稿完全一致，只换情绪表达（眼神/嘴角/眉），皮肤纹理细节完整，无多余杂物。',
    '  · details 细节：多组局部细节集合参考图（一张图多个局部框），纯白背景；把该角色全部标志物逐项列出（如标签/印记/工牌/袖口磨损/鞋），每项一句特写描述；细节清晰锐利，角色细节参考稿，无多余杂物。',
    'promptKit 每段 zh：连贯中文 60-150 字；en：booru 标签 30-50 个。',
    '输出必须是合法 JSON 对象：{"zh": "...", "en": "...", "tags": [...], "source": "...", "negativePrompt": "...", "expressions": [...], "promptKit": {"portrait": {"zh":"...", "en":"..."}, "sheet": {"zh":"...", "en":"..."}, "expressions": [{"name":"疲惫","zh":"...","en":"..."}], "details": {"zh":"...", "en":"..."}}}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const user = [
    `书名：《${project.bookName}》`,
    `目标角色：${role.name}（${role.identity}）`,
    (role.traits ?? []).length > 0 ? `性格标签：${role.traits!.join('、')}` : '',
    `正文出场描写（含外貌线索的段落）：`,
    ...excerpts.map(e => `[第${e.no}章] ${e.text}`),
    '只输出 JSON 对象。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ zh?: unknown; en?: unknown; tags?: unknown; source?: unknown; negativePrompt?: unknown; expressions?: unknown; promptKit?: unknown }>(text)
  let zh = typeof raw.zh === 'string' ? raw.zh.trim().slice(0, 500) : ''
  let en = typeof raw.en === 'string' ? raw.en.trim().slice(0, 1500) : ''
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim().slice(0, 20)).slice(0, 12)
    : []
  const source = typeof raw.source === 'string' ? raw.source.trim().slice(0, 300) : ''
  const defaultNegative = '低质量,模糊,变形,多指,断肢,文字,水印,丑陋,比例失调'
  const negativePrompt = (typeof raw.negativePrompt === 'string' && raw.negativePrompt.trim() !== '') ? raw.negativePrompt.trim().slice(0, 300) : defaultNegative
  const expressions = Array.isArray(raw.expressions)
    ? raw.expressions.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map(e => e.trim().slice(0, 12)).slice(0, 12)
    : []
  // 四类精修提示词（一次提炼直接产出）
  const str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
  const pair = (v: unknown): { zh: string; en: string } => {
    const o = (typeof v === 'object' && v !== null) ? v as Record<string, unknown> : {}
    return { zh: str(o.zh).slice(0, 800), en: str(o.en).slice(0, 1200) }
  }
  const kitRaw = (typeof raw.promptKit === 'object' && raw.promptKit !== null) ? raw.promptKit as Record<string, unknown> : {}
  const kitExpr = Array.isArray(kitRaw.expressions) ? kitRaw.expressions.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : []
  let promptKit: RoleRecord['promptKit']
  try {
    promptKit = {
      portrait: pair(kitRaw.portrait),
      sheet: pair(kitRaw.sheet),
      expressions: kitExpr.map(e => ({
        name: str(e.name).slice(0, 12) || '表情',
        zh: str(e.zh).slice(0, 800),
        en: str(e.en).slice(0, 1200),
      })).slice(0, 12),
      details: pair(kitRaw.details),
    }
  } catch {
    promptKit = undefined
  }
  if (zh === '' || en === '') {
    throw new Error('形象描述提炼失败：LLM 未返回有效 JSON')
  }
  // 风格兜底：LLM 漏嵌时强制补上（zh 段首 / en 末尾），保证出图风格与当前方案一致。
  zh = ensureStyleEmbedded(zh, styleWords, 'zh')
  en = ensureStyleEmbedded(en, styleWords, 'en')
  if (promptKit !== undefined) {
    promptKit = {
      portrait: promptKit.portrait !== undefined ? withStyle(promptKit.portrait, styleWords) : undefined,
      sheet: promptKit.sheet !== undefined ? withStyle(promptKit.sheet, styleWords) : undefined,
      expressions: promptKit.expressions !== undefined ? promptKit.expressions.map(e => ({ ...e, ...withStyle(e, styleWords) })) : undefined,
      details: promptKit.details !== undefined ? withStyle(promptKit.details, styleWords) : undefined,
    }
  }
  // 按角色级别过滤输出深度：主角完整 / 配角仅立绘 / 路人仅基础描述
  if (tier === 'supporting') {
    return { zh: zh.slice(0, 100), en, tags, source, negativePrompt, expressions: [], promptKit: promptKit !== undefined ? { portrait: promptKit.portrait } : undefined }
  }
  if (tier === 'extra') {
    return { zh: zh.slice(0, 60), en, tags, source, negativePrompt, expressions: [], promptKit: undefined }
  }
  return { zh, en, tags, source, negativePrompt, expressions, promptKit }
}

/** 小说角色库：提炼单个角色的形象锚点并写回角色卡。 */
export async function extractRoleVisual(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  roleName: string,
  styleId?: string,
  filterId?: string,
): Promise<RoleVisualPrompt> {
  const role = (project.roles ?? []).find(r => r.name === roleName)
  if (role === undefined) throw new Error(`角色「${roleName}」不在角色库中`)
  role.promptStyleId = styleId
  return extractRoleVisualFrom(ctx, config, project, outputDir, role, styleId, filterId)
}

/** 漫剧角色卡：提炼形象锚点并写回漫剧卡（status → anchored）。 */
export async function extractMangaRoleVisual(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  cardId: string,
  styleId?: string,
  filterId?: string,
): Promise<RoleVisualPrompt> {
  const card = (project.mangaRoles ?? []).find(c => c.id === cardId)
  if (card === undefined) throw new Error(`漫剧角色卡 ${cardId} 不存在`)
  const visual = await extractRoleVisualFrom(ctx, config, project, outputDir, { name: card.name, identity: card.identity, traits: card.traits }, styleId, filterId, project.shortDramaMode === true, card.tier ?? 'protagonist')
  card.promptStyleId = styleId
  card.imagePrompt = visual
  if ((visual.expressions ?? []).length > 0) card.expressions = visual.expressions
  if (visual.promptKit !== undefined) card.promptKit = visual.promptKit
  if (card.status === 'imported' || card.status === 'pending_confirm') card.status = 'anchored'
  card.updatedAt = new Date().toISOString()

    try { saveMangaRolePrompt(outputDir, card.name, visual.zh, visual.en, visual.negativePrompt) } catch { /* 资产库保存失败不阻塞 */ }
  return visual
}

/** 可精修提示词包的「角色源」：小说角色卡或漫剧角色卡的最小公共面。 */
interface RoleKitSource {
  name: string
  identity?: string
  imagePrompt: NonNullable<RoleRecord['imagePrompt']>
  expressions?: string[]
}

/**
 * 底层实现：基于角色源的形象锚点 + 表情清单 + 视觉规则产出四类生图提示词（不写库）。
 */
async function generateRolePromptKitFrom(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  role: RoleKitSource,
  styleId?: string,
  filterId?: string,
  shortDrama = false,
  tier: 'protagonist' | 'supporting' | 'extra' = 'protagonist',
): Promise<RoleRecord['promptKit']> {
  const roleName = role.name
  const rules = project.visualRules ?? []
  const styleWords = styleKeywords(styleId, filterId)
  const system = [
    '你是一位 AI 绘图提示词工程师。基于给定角色的形象锚点、表情清单与本书视觉规则，输出立绘+表情两类生图提示词（每类 zh+en 各一段）。即梦画布支持多角度编辑，无需生成四视图设定稿。',
    '【当前视觉风格】（每类提示词必须内嵌）：' + styleWords,
    '重要：每段 zh 提示词的段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。',
    '两类：',
    '1. portrait 立绘：正面站立全身人像，纯白纯色背景；按即梦官方7维度公式组织：①[年龄/种族]具体岁数+国籍/人种+风格形容词+脸型名词；②[肤色/皮肤质感]冷暖色调+具体肤色+皮肤质感形容词+保留真实微细毛孔与肌肤纹理；③[面部细节特征]眼型+眉骨+鼻梁+唇形+下颌线（至少3-4点组合）；④[眼神/灵魂]眼神形容词+目光传达的信息+透出的底层情绪；⑤[发型/发色]具体发色+头发状态/质感+具体发型+环境互动；⑥[服装/服装质感]版型/剪裁+颜色+具体服装名词+布料材质/新旧状态+穿着细节；⑦[体型/情绪/气质]骨架/肩部特征+整体散发的氛围词。收尾：角色设计稿，细节完整展示，无多余杂物，全身完整无裁切。',
    '2. expressions 表情（高级可选）：每个表情一段，脸部特写（头部到锁骨），纯白背景，五官与角色定稿完全一致，只换情绪表达（眼神/嘴角/眉），皮肤纹理细节完整，无多余杂物。',
    '3. 立绘为「角色设定稿」：禁止瞬间动作、道具使用状态与剧情状态（握手机、看屏幕、未接来电等），只保留可长期存在的外貌、服装与常驻标志物（工牌、饰品等）。即梦画布多角度编辑可生成侧面/背面，无需生成四视图。',
    ...(shortDrama ? ['6. 短剧精简模式·人设极致化：性格标签必须极致化（单一维度拉到最满）；外貌只保留 1-2 个最强辨识度点；服装/标志物更夸张醒目，一眼可认。'] : []),
    '【本书视觉规则】（必须内嵌进每段提示词，保证设定不跑偏）：',
    ...rules.map(r => '- ' + r),
    'zh 要求：连贯中文，写实电影感，60-150 字/段；en 要求：booru 风格逗号分隔标签，30-50 个/段。',
    '输出必须是合法 JSON 对象：{"portrait": {"zh": "...", "en": "..."}, "expressions": [{"name": "疲惫", "zh": "...", "en": "..."}]}',
    '重要：所有字符串值内部不得包含换行符；直接输出 JSON 结果本身。',
  ].join('\n')
  const user = [
    `角色：${role.name}（${role.identity ?? ''}）`,
    `中文锚点：${role.imagePrompt.zh}`,
    `英文锚点：${role.imagePrompt.en}`,
    `关键标签：${role.imagePrompt.tags.join('、')}`,
    `表情清单：${(role.expressions ?? []).join('、') || '（未提供，按角色气质推断 6 个）'}`,
    '只输出 JSON 对象。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<Record<string, unknown>>(text)
  const str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
  const pair = (v: unknown): { zh: string; en: string } => {
    const o = (typeof v === 'object' && v !== null) ? v as Record<string, unknown> : {}
    return { zh: str(o.zh).slice(0, 800), en: str(o.en).slice(0, 1200) }
  }
  const expressionsRaw = Array.isArray(raw.expressions) ? raw.expressions.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : []
  const kit: RoleRecord['promptKit'] = {
    portrait: withStyle(pair(raw.portrait), styleWords),
    expressions: expressionsRaw.map(e => ({
      name: str(e.name).slice(0, 12) || '表情',
      ...withStyle({ zh: str(e.zh).slice(0, 800), en: str(e.en).slice(0, 1200) }, styleWords),
    })).slice(0, 12),
  }
  if (kit.portrait === undefined || kit.portrait.zh === '' || kit.portrait.en === '') {
    throw new Error('提示词精修失败：LLM 未返回有效 JSON')
  }
  // 按角色级别过滤精修包：主角立绘+表情 / 配角仅立绘 / 路人不输出
  if (tier === 'supporting') return { portrait: kit.portrait }
  if (tier === 'extra') return {}
  return kit
}

/** 小说角色库：角色四类生图提示词精修包（写回角色卡）。 */
export async function generateRolePromptKit(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  roleName: string,
  styleId?: string,
  filterId?: string,
): Promise<RoleRecord['promptKit']> {
  const role = (project.roles ?? []).find(r => r.name === roleName)
  if (role === undefined) throw new Error(`角色「${roleName}」不在角色库中`)
  if (role.imagePrompt === undefined) throw new Error(`角色「${roleName}」还没有形象锚点，请先生成锚点`)
  role.promptStyleId = styleId
  return generateRolePromptKitFrom(ctx, config, project, { name: role.name, identity: role.identity, imagePrompt: role.imagePrompt, expressions: role.expressions }, styleId, filterId)
}

/** 漫剧角色卡：四类生图提示词精修包（写回漫剧卡，status → anchored）。 */
export async function generateMangaRolePromptKit(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  cardId: string,
  styleId?: string,
  filterId?: string,
): Promise<RoleRecord['promptKit']> {
  const card = (project.mangaRoles ?? []).find(c => c.id === cardId)
  if (card === undefined) throw new Error(`漫剧角色卡 ${cardId} 不存在`)
  if (card.imagePrompt === undefined) throw new Error(`「${card.name}」还没有形象锚点，请先生成锚点`)
  const kit = await generateRolePromptKitFrom(ctx, config, project, { name: card.name, identity: card.identity, imagePrompt: card.imagePrompt, expressions: card.expressions }, styleId, filterId, project.shortDramaMode === true, card.tier ?? 'protagonist')
  card.promptStyleId = styleId
  card.promptKit = kit
  if (card.status === 'imported' || card.status === 'pending_confirm') card.status = 'anchored'
  card.updatedAt = new Date().toISOString()
  return kit
}

/**
 * 漫剧角色库·提名（两段式）：从某章分镜的 characters 提名候选角色名 →
 * 规则过滤（精确名 + 身份/简称匹配，短名单 ≤5）→ LLM 确认（是/否 + 选哪个，不做开放检索）→
 * 返回带漫剧卡建议的候选（未匹配时给出「回小说库补提炼 / 漫剧直接创建」判定）。
 */
export async function nominateMangaRoles(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<MangaRoleCandidate[]> {
  const entry = (project.storyboards ?? []).find(e => e.chapterNo === chapterNo)
  if (entry === undefined) throw new Error(`第 ${chapterNo} 章还没有分镜产出，请先在「分镜」页生成剧情骨架/分镜表`)

  // 收集该章分镜的结构化角色引用（骨架 + 表级 + 镜头级，去重）。
  const names: string[] = []
  const pushNames = (list: string[] | undefined): void => {
    for (const n of list ?? []) {
      const t = n.trim().slice(0, 20)
      if (t !== '' && !names.includes(t)) names.push(t)
    }
  }
  pushNames(entry.skeleton?.characters)
  pushNames(entry.table?.characters)
  for (const s of entry.table?.shots ?? []) pushNames(s.characters)
  if (names.length === 0) throw new Error(`第 ${chapterNo} 章的分镜还没有结构化角色（characters 为空），请重新生成剧情骨架/分镜表`)

  // 已建漫剧卡的直接标 already_imported（按漫剧名或来源名匹配）。
  const imported = new Set<string>()
  for (const c of project.mangaRoles ?? []) {
    imported.add(c.name)
    if (c.sourceRoleName !== undefined && c.sourceRoleName !== '') imported.add(c.sourceRoleName)
  }
  const already: MangaRoleCandidate[] = names.filter(n => imported.has(n)).map(n => {
      const card = (project.mangaRoles ?? []).find(c => c.name === n || c.sourceRoleName === n)
      return {
    rawName: n,
    verdict: 'already_imported' as const,
    matches: [],
    tier: card?.tier ?? 'supporting',
    suggested: emptyCandidateSuggestion(n),
  }})
  const fresh = names.filter(n => !imported.has(n))
  if (fresh.length === 0) return already

  const chapter = project.chapters.find(c => c.no === chapterNo)
  const body = chapter !== undefined ? readChapterFile(outputDir, chapter) : undefined
  const roles = project.roles ?? []

  // 规则阶段：精确名 + 身份/简称匹配，短名单 ≤5。
  const shortlists: Array<{ rawName: string; roleNames: string[] }> = fresh.map(rawName => {
    const shortlist: string[] = []
    const push = (n: string): void => { if (!shortlist.includes(n)) shortlist.push(n) }
    for (const r of roles) {
      if (shortlist.length >= 5) break
      const n = r.name
      if (n === rawName) { push(n); continue }
      if (n.includes(rawName) || rawName.includes(n)) { push(n); continue }
      const ident = r.identity ?? ''
      if (ident !== '' && (ident === rawName || ident.includes(rawName) || rawName.includes(ident))) push(n)
    }
    return { rawName, roleNames: shortlist }
  })

  // LLM 阶段：确认是/否 + 选哪个 + 漫剧卡建议（只能从短名单里选，不做开放检索）。
  const beats = (entry.skeleton?.beats ?? []).map(b => `[${b.id}] ${b.event}`).join('\n')
  const system = [
    '你是一位漫剧选角导演。下面给出「分镜角色提名」与「小说角色库候选名单」。',
    '任务：为每个提名判定它对应小说角色库中的哪一个候选（或判定小说库没有对应角色），并预填一张「漫剧角色卡」的建议信息。',
    '规则：',
    '1. roleName 优先从该提名的候选名单中选；若候选名单为空或都不像，允许从下方「全书角色库」中挑选最符合该身份代称的正式角色名，禁止虚构不存在的角色。',
    '2. verdict：matched=候选名单里确实有对应角色（选最像的那个）；ambiguous=名单里有多个候选且无法确定（此时 roleName 可留空或选最可能的一个）；not_in_library=候选名单为空或都不对应。',
    '3. matched/ambiguous 时给出漫剧卡建议：name（漫剧用名，默认与角色名一致）、identity（身份一句话，30 字内）、coreFunction（protagonist=主角/mentor=导师/love_interest=感情线/antagonist=反派/sidekick=搭档/informant=线人/functional=功能性）、protagonistRelation（enemy/friend/mentor/lover/exploit=利用/neutral）、speechStyle（口头禅或说话方式）、traits（不超过 3 个极致性格标签）、appearance（1-2 个辨识度外貌点）、keyScenes（本章该角色 1-2 个关键剧情节点，格式「第N章 xxx」）。',
    '4. 身份型提名（如「持枪者」「围观群众」）：候选名单有则匹配；名单没有且正文确有该称谓 → not_in_library；正文也没有 → not_in_library。',
    ...(project.shortDramaMode === true
      ? ['5. 短剧精简模式（本书已开启）：只保留 5-8 个上镜角色——主角/反派/感情线/关键配角；功能性路人不上卡（此类提名直接 not_in_library）。每个角色必须给出明确的 coreFunction 与 protagonistRelation；性格标签极致化；候选超过 8 个时按戏份重要性裁剪到最核心 8 个。']
      : []),
    '输出必须是合法 JSON 数组：[{"rawName": "...", "verdict": "...", "roleName": "...或省略", "suggested": {...}}]，每个提名都要有，数组长度必须等于提名数。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const user = [
    `章节：第 ${chapterNo} 章《${chapter?.title ?? ''}》`,
    '==== 剧情骨架（节拍） ====',
    beats !== '' ? beats : '（无骨架节拍）',
    '==== 角色提名与候选名单 ====',
    shortlists.map(s => s.roleNames.length > 0 ? `[提名] ${s.rawName} → 候选：${s.roleNames.join('、')}` : `[提名] ${s.rawName} → 候选：（无）`).join('\n'),
    '==== 全书角色库（身份代称归属判定以这里为准，正式名只能从这里取） ====\n' + roles.map(r => `${r.name}（${r.roleLabel}）：${r.identity ?? ''}；特征：${(r.traits ?? []).slice(0, 3).join('/')}`).join('\n'),
    body !== undefined ? '==== 章节正文（前 2500 字，判断称谓归属用） ====\n' + body.replace(/^#.*$/gm, '').trim().slice(0, 2500) : '',
    '只输出 JSON 数组。',
  ].filter(x => x !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 8000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonArray<Record<string, unknown>>(text)

  const verdicts = new Set(['matched', 'ambiguous', 'not_in_library'])
  const fnMap: Record<string, MangaRoleCard['coreFunction']> = { protagonist: 'protagonist', mentor: 'mentor', love_interest: 'love_interest', antagonist: 'antagonist', sidekick: 'sidekick', informant: 'informant', functional: 'functional' }
  const relMap: Record<string, MangaRoleCard['protagonistRelation']> = { enemy: 'enemy', friend: 'friend', mentor: 'mentor', lover: 'lover', exploit: 'exploit', neutral: 'neutral' }
  const byName = new Map<string, Record<string, unknown>>()
  for (const e of raw) {
    if (typeof e === 'object' && e !== null && typeof e.rawName === 'string') byName.set(e.rawName.trim(), e)
  }
  const str = (v: unknown): string => typeof v === 'string' ? v.trim().slice(0, 100) : ''
  const strArr = (v: unknown, n: number): string[] => Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim().slice(0, 20)).slice(0, n)
    : []

  // 智能分级：根据小说角色库 roleLabel + LLM 给出的 coreFunction 判断 tier
  const calcTier = (rawName: string, matched: string | undefined, fn: MangaRoleCard['coreFunction']): 'protagonist' | 'supporting' | 'extra' => {
    if (matched !== undefined) {
      const r = roles.find(x => x.name === matched)
      if (r?.roleLabel === 'protagonist' || r?.roleLabel === 'female_lead') return 'protagonist'
      if (r?.roleLabel === 'antagonist') return 'protagonist'
      if (r?.roleLabel === 'support' || r?.roleLabel === 'female_support') return 'supporting'
    }
    if (fn === 'protagonist') return 'protagonist'
    // 核心反派 / 感情线 → 主角级定妆（完整立绘+表情+细节），否则反派容易跨镜头崩脸。
    if (fn === 'antagonist' || fn === 'love_interest') return 'protagonist'
    // 功能性 / 出场即死 → 不做立绘。
    if (fn === 'functional') return 'extra'
    return 'supporting'
  }
  const out: MangaRoleCandidate[] = []
  for (const item of shortlists) {
    const judge = byName.get(item.rawName)
    const judgeVerdict = judge !== undefined ? str(judge.verdict) : ''
    let verdict = verdicts.has(judgeVerdict) ? judgeVerdict as MangaRoleCandidate['verdict'] : (item.roleNames.length > 0 ? 'ambiguous' : 'not_in_library')
    let roleName: string | undefined
    if (judge !== undefined) {
      const chosen = str(judge.roleName)
      // 接受范围放宽：候选名单内 或 全书角色库内的正式名均可（身份代称→角色名的语义桥，如「持枪男人」→「周野」）。
      if (chosen !== '' && (item.roleNames.includes(chosen) || roles.some(r => r.name === chosen))) roleName = chosen
    }
    if (verdict === 'matched' && roleName === undefined && item.roleNames.length === 1) roleName = item.roleNames[0]
    // LLM 从全书库认出代称对应正式角色（如「持枪男人」→「周野」）时，即使候选名单为空也视为 matched，不再漏。
    if (roleName !== undefined && verdict === 'not_in_library') verdict = 'matched'
    const sug = (typeof judge?.suggested === 'object' && judge?.suggested !== null) ? judge.suggested as Record<string, unknown> : {}
    const novelHint: MangaRoleCandidate['novelHint'] = verdict === 'not_in_library' && body !== undefined
      ? (body.includes(item.rawName) ? 'backfill' : 'manga_new')
      : undefined
    const suggested = {
      name: (str(sug.name) !== '' ? str(sug.name) : (roleName ?? item.rawName)).slice(0, 30),
      identity: str(sug.identity).slice(0, 60),
      coreFunction: fnMap[str(sug.coreFunction)] ?? 'functional',
      protagonistRelation: relMap[str(sug.protagonistRelation)] ?? 'neutral',
      speechStyle: str(sug.speechStyle).slice(0, 60),
      traits: strArr(sug.traits, 3),
      appearance: str(sug.appearance).slice(0, 100),
      keyScenes: strArr(sug.keyScenes, 3),
    }
    out.push({
      rawName: item.rawName,
      verdict,
      matches: item.roleNames.map(n => ({ roleName: n, reason: roleName === n ? 'LLM 确认' : '规则候选' })),
      matchedRoleName: roleName,
      novelHint,
      tier: calcTier(item.rawName, roleName, suggested.coreFunction),
      suggested,
    })
  }
  return [...already, ...out]
}

/** 空建议（already_imported 等无需 LLM 的候选用）。 */
function emptyCandidateSuggestion(name: string): MangaRoleCandidate['suggested'] {
  return { name, identity: '', coreFunction: 'functional', protagonistRelation: 'neutral', speechStyle: '', traits: [], appearance: '', keyScenes: [] }
}

/** ✨ 从道藏/红线提炼「视觉世界观规则」：生图/生视频必须遵守的设定纠偏（如"商品=人，禁止常规超市商品"）。 */
export async function extractVisualRules(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<string[]> {
  const system = [
    '你是一位 AI 绘图的视觉规则设计师。本书的设定是"反常识"的，生图/生视频模型默认会画成现实世界的样子，你需要提炼 3-6 条「视觉规则」钉住本书的视觉世界观。',
    '规则要求：',
    '1. 每条必须可执行：明确"画面里必须出现什么/禁止出现什么"（如"货架上的一切商品都是活人，禁止画成罐头/饮料/日用品"）。',
    '2. 覆盖本书最容易被模型画错的 2-4 个核心反常识点。',
    '3. 每条 40 字内，禁止泛泛而谈。',
    '输出必须是合法 JSON 数组：["规则1", "规则2", ...]，不要输出其他文字。',
  ].join('\n')
  const bible = project.bible
  const user = [
    `书名：《${project.bookName}》`,
    `题材：${bible?.genre ?? ''}`,
    bible !== undefined && bible.worldRules.length > 0
      ? `世界规则：\n${bible.worldRules.map(r => '- ' + r).join('\n')}`
      : '',
    bible !== undefined && bible.redLines.length > 0
      ? `红线：\n${bible.redLines.map(r => '- ' + r).join('\n')}`
      : '',
    '只输出 JSON 数组。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonArray<string>(text)
  return raw.map(r => typeof r === 'string' ? r.trim().slice(0, 80) : '').filter(r => r !== '').slice(0, 8)
}


/**
 * 开书想法 → AI 大纲：输入一句话想法，生成 2-3 个方向不同、可直接开书的完整大纲方案。
 * @param count 本次生成几个（默认 3，最多 3）
 * @param exclude 已暂留方案的剧情方向/卖点摘要（换批时避开，防止重复）
 */
export async function suggestOutlines(
  ctx: Context,
  config: NovelConfig,
  idea: string,
  count = 3,
  exclude: string[] = [],
): Promise<OutlineCandidate[]> {
  const n = Math.max(1, Math.min(3, Math.floor(count)))
  const system = [
    '你是一位资深网文策划。作者只给了一句「想法」，你需要把它扩展成 2-3 个【方向差异明显】的完整小说大纲方案，供作者挑选。',
    '每个方案必须满足：',
    '1. bookName：书名（6 字以内，抓眼球、点题）。',
    '2. genre：题材（如 仙侠修真 / 都市异能 / 玄幻 / 悬疑）。',
    '3. sellingPoint：核心卖点一句话（金手指/爽点/差异化，40 字内）。',
    '4. outline：完整大纲文本（至少 800 字，可直接作为开书大纲），结构包含：书名与题材、金手指/核心设定、主角人设与动机、主线剧情走向（至少 5 个阶段）、关键配角与势力、卖点与爽点设计、预计分卷（3-5 卷）。',
    '方向差异要求：',
    '- 方案之间的金手指/剧情走向必须明显不同（如：苟道发育流 vs 随身老爷爷流 vs 群像争霸流），不能只是换书名。',
    '- 忠实于作者想法的核心要素，但允许在不同方向上进行合理演绎。',
    '- 不输出任何与已列「需避开的方向」雷同的方案。',
    '输出必须是合法 JSON 数组，只输出数组本身：',
    '[{"id": "唯一id", "bookName": "...", "genre": "...", "sellingPoint": "...", "outline": "..."}]',
    `本次只输出 ${n} 个方案。`,
    '重要：所有字符串值内部不得包含换行符（大纲内部分段请用「。\n」或「；」自然断句），JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const user = [
    `作者的想法：${idea}`,
    idea.trim().length < 40
      ? '作者的想法非常简短（可能只有一句）。请基于通用网文套路合理扩展补全：为每个方案自洽地设计金手指/核心设定、主角人设与动机、主线走向，使其成为完整可开书的大纲；不同方案的方向仍须明显差异。'
      : '',
    exclude.length > 0
      ? `需避开的已暂留方案方向（新方案不得与之雷同）：\n${exclude.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      : '',
    `请生成 ${n} 个大纲方案。`,
    '只输出 JSON 数组。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.85, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const candidates: OutlineCandidate[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const bookName = typeof entry.bookName === 'string' ? entry.bookName.trim().slice(0, 30) : ''
    const outline = typeof entry.outline === 'string' ? entry.outline.trim() : ''
    if (bookName === '' || outline.length < 300) continue
    candidates.push({
      id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : `oc-${Date.now().toString(36)}-${candidates.length}`,
      bookName,
      genre: typeof entry.genre === 'string' ? entry.genre.trim().slice(0, 20) : '',
      sellingPoint: typeof entry.sellingPoint === 'string' ? entry.sellingPoint.trim().slice(0, 120) : '',
      outline,
    })
  }
  if (candidates.length === 0) {
    throw new Error('大纲方案生成失败：LLM 未返回有效 JSON（可重试）')
  }
  return candidates.slice(0, n)
}

/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检。
 *  两阶段管道（借鉴 AI-Novel-Writing-Assistant）：
 *  ① 源片段笔记：每章抽取结构化笔记（剧情/人物/设定/写法/卖点/短板信号）
 *  ② 分节分析：按维度各跑一次 LLM，输出可读分析稿 + 结构化数据 + 证据链。
 *  @param scope 'recent'(默认最近20章) | 'volume:N' | 'all'
 *  @param preset 'quick'(总览/剧情/人物/文风) | 'standard'(+卖点)
 *  @param budgetTokens token 预算上限（超过即截断章节取样）。
 */
export async function breakdownBook(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  scope = 'recent',
  preset: 'quick' | 'standard' = 'quick',
  budgetTokens = 50000,
): Promise<BreakdownResponse> {
  // 1. 选章节范围。
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.summary !== undefined && c.summary !== '')
  let selected = written
  if (scope === 'recent') selected = written.slice(-20)
  else if (/^volume:\d+$/.test(scope)) {
    const v = Number(scope.slice(7))
    selected = written.filter(c => c.volume === v)
  }
  if (selected.length === 0) throw new Error('没有可分析的已写章节（需要已生成并带摘要）')

  // 2. token 预算：估算每章正文+摘要成本，超预算则只取最近的章节。
  let budget = budgetTokens
  const chunks: Array<{ no: number; title: string; summary: string; body: string }> = []
  for (const c of selected.slice().reverse()) {
    const body = readChapterFile(outputDir, c) ?? ''
    // 粗估：每 4 字符 ≈ 1 token（中文），章节正文截 4000 字上限。
    const bodySlice = body.replace(/^#\s+.*$/m, '').trim().slice(0, 4000)
    const est = Math.ceil((bodySlice.length + (c.summary?.length ?? 0)) / 4) + 400
    if (est > budget && chunks.length > 0) break
    chunks.unshift({ no: c.no, title: c.title, summary: c.summary ?? '', body: bodySlice })
    budget -= est
  }

  // 3. 阶段一：源片段笔记（每章一次 LLM，串行控制 token）。
  const notes: string[] = []
  let usedTokens = 0
  const noteSystem = [
    '你是中文网文拆书助手。把单章正文整理成结构化笔记，供后续章节级分析复用。',
    '只输出 JSON 对象：',
    '{"summary": "1-2句", "plotPoints": ["..."], "characters": ["..."], "worldbuilding": ["..."], "styleTechniques": ["..."], "marketHighlights": ["..."], "weaknessSignals": ["..."]}',
    '硬规则：只提取正文明确出现的信息；每数组最多 4 项；不要补写原文外的动机/意图；evidence 不在此阶段输出。',
    '重要：直接输出 JSON，不要输出其他文字；字符串内不含换行。',
  ].join('\n')
  for (const ch of chunks) {
    const noteUser = [`第${ch.no}章《${ch.title}》`, '正文：', ch.body.slice(0, 3000)].join('\n')
    try {
      const text = await complete(ctx, config, { system: noteSystem, user: noteUser, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 3000), reasoning: config.analysisReasoning ?? 'low' })
      const raw = parseJsonObject<Record<string, unknown>>(text)
      const pick = (k: string): string[] => Array.isArray(raw[k]) ? raw[k].filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim().slice(0, 120)).slice(0, 4) : []
      notes.push(
        `【第${ch.no}章《${ch.title}》】\n`
        + `摘要：${typeof raw.summary === 'string' ? raw.summary.slice(0, 200) : ''}\n`
        + `剧情：${pick('plotPoints').join('；')}\n`
        + `人物：${pick('characters').join('；')}\n`
        + `设定：${pick('worldbuilding').join('；')}\n`
        + `写法：${pick('styleTechniques').join('；')}\n`
        + `卖点：${pick('marketHighlights').join('；')}\n`
        + `短板信号：${pick('weaknessSignals').join('；') || '（无明显短板信号）'}`,
      )
      usedTokens += 800
    } catch {
      // 单章笔记失败不致命——跳过继续。
    }
  }

  // 4. 阶段二：分节分析。
  const sectionsConfig: Array<{ key: string; title: string; focus: string; system: string }> = [
    {
      key: 'overview',
      title: '拆书总览',
      focus: '一句话定位、题材标签、整体优势与短板',
      system: [
        '你是资深中文网文拆书分析师，负责《拆书总览》小节。',
        '基于给定章节笔记做低风险综合判断，输出 JSON：{"markdown": "可直接展示的分析稿（简体中文，先给结论再说明体现在哪、为何成立）", "structured": {"oneLinePositioning": "一句话定位", "genreTags": ["题材标签"], "sellingPointTags": ["卖点标签"], "strengths": ["整体优势"], "weaknesses": ["整体短板"]}}',
        '硬规则：只基于笔记归纳；推断用「更偏向/可能」等谨慎措辞；证据不足写「材料不足」；不虚构原文细节。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'plot',
      title: '剧情结构',
      focus: '主线梗概、阶段推进、冲突升级、节奏风险',
      system: [
        '你是资深中文网文拆书分析师，负责《剧情结构》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"mainlineSummary": "主线梗概", "phaseProgressions": ["阶段推进"], "escalationDesigns": ["冲突升级"], "paceRisks": ["节奏风险"], "reusablePatterns": ["可复用套路"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'character',
      title: '人物系统',
      focus: '主角定位、配角功能、关系网络、成长弧线、辨识度风险',
      system: [
        '你是资深中文网文拆书分析师，负责《人物系统》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"protagonistPositioning": "主角定位", "supportingFunctions": ["配角功能"], "relationshipNetwork": ["关系网络"], "growthArcs": ["成长弧线"], "clarityRisks": ["辨识度风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'style',
      title: '文风与技法',
      focus: '叙事视角、语言风格、描写方式、节奏控制、钩子设计、可复用写法',
      system: [
        '你是资深中文网文拆书分析师，负责《文风与技法》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"narrativePov": "叙事视角", "languageStyle": "语言风格", "dialoguePatterns": ["对话特征"], "rhythmControl": ["节奏控制"], "hookDesigns": ["钩子设计"], "reusableTechniques": ["可复用写法"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
  ]
  if (preset === 'standard') {
    sectionsConfig.push({
      key: 'market',
      title: '商业化卖点',
      focus: '读者爽点、点击驱动、人物/题材卖点、商业化风险',
      system: [
        '你是资深中文网文拆书分析师，负责《商业化卖点》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"hookPoints": ["读者爽点"], "clickDrivers": ["点击驱动"], "characterSellingPoints": ["人物卖点"], "genreSellingPoints": ["题材卖点"], "commercialRisks": ["商业化风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    })
  }

  const notesText = notes.join('\n\n')
  const sections: BreakdownResponse['sections'] = []
  const evidence: BreakdownResponse['evidence'] = []
  for (const sec of sectionsConfig) {
    try {
      const text = await complete(ctx, config, {
        system: sec.system,
        user: `分析范围：${selected.length} 章（${scope === 'all' ? '全书' : scope === 'recent' ? '最近 20 章' : '指定卷'}）。\n\n章节笔记：\n${notesText}`,
        temperature: 0.3,
        maxTokens: Math.max(config.maxTokens, 6000),
        reasoning: config.analysisReasoning ?? 'low',
      })
      const raw = parseJsonObject<{ markdown?: unknown; structured?: unknown }>(text)
      sections.push({
        key: sec.key,
        title: sec.title,
        markdown: typeof raw.markdown === 'string' ? raw.markdown.trim() : '（生成失败）',
        structured: typeof raw.structured === 'object' && raw.structured !== null ? raw.structured as Record<string, unknown> : {},
      })
      usedTokens += 2000
    } catch {
      sections.push({ key: sec.key, title: sec.title, markdown: '（本节生成失败，可重试）', structured: {} })
    }
  }

  return {
    sections,
    evidence,
    chaptersScanned: chunks.length,
    usedTokens,
  }
}

// ---------------------------------------------------------- llm catalog/test

/** LLM 连通性失败的错误码 → 人话（供设置页“测试连通”回显）。 */
const LLM_TEST_ERROR_HINT: Record<string, string> = {
  NO_ADAPTER: '提供商路由不存在或未启用',
  UNKNOWN_MODEL: '模型不在该提供商的目录里',
  MISSING_CREDENTIAL: 'API Key 未配置（检查 DSH 凭据里的引用）',
  INVALID_CREDENTIAL: 'API Key 格式无效',
  AUTH: '认证失败：API Key 无效或无权限',
  RATE_LIMIT: '触发提供商限流，请稍后再试',
  QUOTA: '配额/余额不足',
  CONTEXT_WINDOW_EXCEEDED: '上下文超限（测试调用不应触发，请核实模型配置）',
  EMPTY_RESPONSE: '端点连通但返回空响应（模型可能暂不可用）',
  TIMEOUT: '连接超时',
  ABORTED: '测试超时（30 秒无响应）',
  UNSUPPORTED_REASONING_EFFORT: '推理档位不受此模型支持',
}

function describeLlmTestError(err: Error & { code?: string }): string {
  const code = typeof err.code === 'string' ? err.code : ''
  const hint = code !== '' ? LLM_TEST_ERROR_HINT[code] : undefined
  const detail = err.message !== '' ? err.message : '未知错误'
  return hint !== undefined ? `${hint}（${detail}）` : detail
}

/** 对选中的提供商/模型发一次最小真实调用（maxTokens=16），验证 Key / 端点 / 模型可用。 */
export async function testLlmModel(ctx: Context, provider: string, model: string): Promise<LlmTestResponse> {
  const start = Date.now()
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: '只回复两个字：OK' }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider,
    model,
    messages,
    maxTokens: 16,
    temperature: 0,
  }
  // 真实流式调用 + 30 秒超时（GenerateOptions.signal 由适配器响应并中止）。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const assembler = new BlockAssembler()
    let sawBlock = false
    for await (const chunk of ctx.llm.stream({ ...request, signal: controller.signal })) {
      assembler.push(chunk)
      // 拿到第一个完整块即判定连通并提前结束，省 token。
      if (chunk.type === 'block-end') { sawBlock = true; break }
    }
    if (sawBlock) return { ok: true, ms: Date.now() - start }
    const finish = assembler.finish
    if (finish !== undefined && (finish.kind === 'error' || finish.kind === 'aborted')) {
      const failure = finish.failure
      throw Object.assign(new Error(failure.message), { code: failure.code })
    }
    // 正常 finish（stop/max-tokens）但没有文本块，同样视为已连通。
    return { ok: true, ms: Date.now() - start }
  } catch (error) {
    const err = error as Error & { code?: string }
    return { ok: false, ms: Date.now() - start, code: err.code, message: describeLlmTestError(err) }
  } finally {
    clearTimeout(timer)
  }
}

/** 确保 pi-ai 的一条 provider 路由存在（settings seam 深度合并，保留已有字段）。 */
async function ensurePiAiProvider(ctx: Context, route: string, cfg: Record<string, unknown>): Promise<void> {
  const settings = ctx.get('settings') as { update: (ns: string, patch: object) => Promise<void> } | undefined
  if (settings === undefined) throw new Error('DSH settings 服务不可用，无法注册路由')
  await settings.update('llm-pi-ai', { providers: { [route]: cfg } })
}

/** 运行时厂商目录：DSH pi-ai 可配置提供方 + 内置适配器，作为「添加模型」下拉。 */
export async function listLlmVendors(ctx: Context): Promise<LlmVendorsResponse> {
  const map = new Map<string, LlmVendorOption>()
  // 预置厂商（有名称/模型建议/apiKeyEnv）
  for (const v of LLM_VENDORS) {
    map.set(v.route, { id: v.route, name: v.name, models: v.models, apiKeyEnv: v.apiKeyEnv, builtin: v.builtin })
  }
  // DSH pi-ai 可配置提供方目录（DSH 添加模型下拉的数据源）
  try {
    for (const p of ctx.llm.listConfigurableProviders()) {
      if (!map.has(p.provider)) {
        map.set(p.provider, {
          id: p.provider,
          name: p.displayName !== '' ? p.displayName : p.provider,
          models: [],
          apiKeyEnv: 'PI_AI_' + p.provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY',
        })
      }
    }
  } catch { /* 单个目录读取失败跳过 */ }
  // 已注册的适配器路由（如 deepseek-official）
  try {
    for (const p of ctx.llm.listProviders()) {
      if (!map.has(p.id)) {
        map.set(p.id, { id: p.id, name: p.name !== '' && p.name !== p.id ? p.name : p.id, models: [], builtin: true })
      }
    }
  } catch { /* ignore */ }
  return { vendors: [...map.values()] }
}

/** 查询某个 provider 当前可用模型（添加成功后可即时刷新下拉）。 */
export async function listLlmModels(ctx: Context, provider: string): Promise<LlmModelsResponse> {
  if (provider.trim() === '') return { models: [] }
  try {
    const models = await ctx.llm.listModels(provider.trim())
    return { models: models.map(m => ({ id: m.id, name: m.name })) }
  } catch {
    // provider 未激活/目录不可用 → 返回空，让前端回退到手填。
    return { models: [] }
  }
}

/** 当前已注册的提供方路由列表（提供方管理卡片）。 */
export async function listLlmProviders(ctx: Context): Promise<LlmProvidersResponse> {
  try {
    const providers = ctx.llm.listProviders().map(p => ({ id: p.id, name: p.name !== '' && p.name !== p.id ? p.name : p.id }))
    return { providers }
  } catch {
    // 兜底：至少总是有内置 DeepSeek。
    return { providers: [{ id: 'deepseek-official', name: 'DeepSeek' }] }
  }
}

/** 移除一个提供方：unset 凭据 ref + 移除 llm-pi-ai providers 路由。 */
export async function removeLlmProvider(ctx: Context, req: RemoveProviderRequest): Promise<RemoveProviderResponse> {
  const provider = (req.provider ?? '').trim()
  if (provider === '') throw new Error('缺少 provider')
  if (provider === 'deepseek-official') throw new Error('内置 DeepSeek 提供方不可删除')

  const creds = ctx.get('credentials') as { unset?: (ref: string) => Promise<void> } | undefined
  if (creds?.unset !== undefined && req.apiKeyEnv !== undefined && req.apiKeyEnv.trim() !== '') {
    await creds.unset(req.apiKeyEnv.trim())
  }

  const settings = ctx.get('settings') as { mutate?: (ns: string, ops: { op: 'unset'; path: string[] }[]) => Promise<void> } | undefined
  if (settings?.mutate !== undefined) {
    await settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', provider] }])
  }

  return { ok: true, message: '已移除提供方 ' + provider }
}

/**
 * 添加模型（DSH 同款体验）：厂商直填 API Key，或自定义 OpenAI 兼容路由。
 * 写入 DSH 凭据 refs，并（必要时）注册/更新 llm-pi-ai provider 路由。
 */
export async function registerLlmModel(ctx: Context, req: AddModelRequest): Promise<AddModelResponse> {
  const apiKey = req.apiKey?.trim() ?? ''
  const model = req.model?.trim() ?? ''
  if (apiKey === '') throw new Error('API Key 不能为空')
  if (model === '') throw new Error('模型 id 不能为空')

  const creds = ctx.get('credentials') as { set(ref: string, value: string): Promise<void> } | undefined
  if (creds === undefined) throw new Error('DSH credentials 服务不可用，无法写入 API Key')

  let route: string
  let env: string
  let displayName: string
  let message: string

  if (req.mode === 'vendor') {
    const vendorId = (req.vendor ?? '').trim()
    if (vendorId === '') throw new Error('请选择厂商')
    const v = LLM_VENDORS.find(x => x.route === vendorId)
    route = vendorId
    env = req.apiKeyEnv?.trim() || v?.apiKeyEnv || ('PI_AI_' + vendorId.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY')
    displayName = v?.name ?? vendorId
    const isBuiltin = v?.builtin === true || vendorId === 'deepseek-official'
    await creds.set(env, apiKey)
    // 内置适配器（如 deepseek-official）不需 pi-ai 路由；其余 catalog 路由写 apiKeyEnv 即可。
    if (isBuiltin) {
      message = '已写入 DSH 凭据（' + env + '）'
    } else {
      await ensurePiAiProvider(ctx, route, { apiKeyEnv: env })
      message = '已写入 DSH 凭据并注册路由 ' + route
    }
  } else {
    route = (req.provider ?? '').trim()
    const baseURL = (req.baseURL ?? '').trim()
    if (route === '') throw new Error('自定义模式需填提供商路由 id')
    if (baseURL === '') throw new Error('自定义模式需填接口地址 (baseURL)')
    env = 'NOVEL_CUSTOM_' + route.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
    displayName = req.name?.trim() || ('Custom ' + route)
    await creds.set(env, apiKey)
    await ensurePiAiProvider(ctx, route, {
      displayName,
      apiKeyEnv: env,
      api: 'openai-completions',
      baseURL,
      models: [{ id: model }],
      compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
    })
    message = '已写入 DSH 凭据并注册路由 ' + route
  }

  const saved: SavedModel = {
    id: 'saved-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    name: req.name?.trim() || (displayName + ' · ' + model),
    provider: route,
    model,
  }
  return { ok: true, saved, provider: route, message }
}

/** 获取当前激活漫剧方案的风格（styleId + filterId），用于生图/提示词兜底。 */
export function getActiveMangaStyle(project: ProjectState): { styleId?: string; filterId?: string } {
  const active = (project.mangaPlans ?? []).find(p => p.active === true)
  if (active === undefined) return {}
  return { styleId: active.styleId, filterId: active.filterId }
}

/** 🩺 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
export async function analyzePlotlineHealth(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<PlotlineHealthReport> {
  const system = [
    '你是一位网文剧情架构师。请对本书的「剧情线体系」做健康检查，判断当前是否需要新增剧情线、应在多少章后添加。',
    '评估维度：各线最近推进到第几章（已写章节与关联章节的差值越大越危险）、各线状态、已写章节总数、卷计划当前进度、编年录近期事实。',
    '输出规则：',
    '1. verdict：一句话结论——"需要新增线" / "暂不需要" / "再写 N 章后需要"（N 给出具体章数）。',
    '2. timing：说明建议添加的时机（如：第 25 章前引入新支线，因为主线预计第 22 章告一段落）。',
    '3. reasons：3-5 条依据（引用具体数据：哪条线多少章没推进、已写章节数、卷进度等）。',
    '4. lines：对每条线给健康度——ok（近期推进过）/ warning（超过 5 章未推进）/ stale（超过 10 章未推进或悬置过久）。',
    '输出必须是合法 JSON 对象：{"verdict": "...", "timing": "...", "reasons": ["..."], "lines": [{"name": "线名", "health": "ok|warning|stale", "note": "一句说明"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  const user = [
    `书名：《${project.bookName}》`,
    `已写章节数：${written.length}（最新章号 ${written.length > 0 ? written[written.length - 1]!.no : 0}）`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》（${v.chapterStart}-${v.chapterEnd}）：${v.summary.slice(0, 60)}`).join('\n')}`
      : '',
    `剧情线（${lines.length} 条）：\n${lines.length > 0
      ? lines.map(l => `- [${l.kind}] ${l.name}｜目标：${l.goal}｜进度：${l.progress !== '' ? l.progress : '未推进'}｜最近关联章节：${l.chapters.length > 0 ? '第' + Math.max(...l.chapters) + '章' : '无'}`).join('\n')
      : '（暂无剧情线）'}`,
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 10 条）：\n${(project.facts ?? []).slice(-10).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join('\n')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{
    verdict?: unknown
    timing?: unknown
    reasons?: unknown
    lines?: unknown
  }>(await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 3000) }))
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const lineArr = Array.isArray(raw.lines)
    ? raw.lines
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          name: typeof entry.name === 'string' ? entry.name.slice(0, 40) : '',
          health: (['ok', 'warning', 'stale'] as const).includes(entry.health as never) ? entry.health as 'ok' | 'warning' | 'stale' : 'ok',
          note: typeof entry.note === 'string' ? entry.note.slice(0, 150) : '',
        }))
        .filter(x => x.name !== '')
    : []
  return {
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 100) : '',
    timing: typeof raw.timing === 'string' ? raw.timing.slice(0, 200) : '',
    reasons: strArr(raw.reasons).map(r => r.slice(0, 200)),
    lines: lineArr,
  }
}

/** ✨ AI 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
export async function designPlotlinePlan(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  health?: PlotlineHealthReport,
): Promise<PlotlinePlan> {
  const system = [
    '你是一位网文剧情架构师。请为本书设计「下一阶段的剧情方案」：给出未来 5-10 章的剧情方向，并建议 2-3 条值得新增的剧情线。',
    '要求：方向必须结合本书大纲/卷计划/现有线/编年录；新线要能落地（和当前主角处境、已有伏笔、下一阶段舞台相关），不得重复已有线。',
    '输出必须是合法 JSON 对象：{"direction": "下一阶段方向 60-120 字", "suggestions": [{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": "初始进度（可空）"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const user = [
    `书名：《${project.bookName}》`,
    health !== undefined
      ? `健康检查结论：\n判定：${health.verdict}\n时机：${health.timing}\n依据：${health.reasons.join('；')}`
      : '',
    `大纲（节选前 3000 字）：\n${project.outline.slice(0, 3000)}`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary.slice(0, 60)}`).join('\n')}`
      : '',
    `现有剧情线：\n${(project.plotlines ?? []).map(l => `- [${l.kind}${l.status === 'resolved' ? '·已完结' : ''}] ${l.name}：${l.goal}`).join('\n') || '（无）'}`,
    written.length > 0
      ? `最近写的章节：\n${written.slice(-5).map(c => `第${c.no}章《${c.title}》`).join('、')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{ direction?: unknown; suggestions?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.6, maxTokens: Math.max(config.maxTokens, 3000) }),
  )
  const suggestions: Plotline[] = []
  const kinds = new Set(['main', 'branch', 'character', 'mystery'])
  if (Array.isArray(raw.suggestions)) {
    for (const entry of raw.suggestions) {
      if (typeof entry !== 'object' || entry === null) continue
      const e = entry as Record<string, unknown>
      const name = typeof e.name === 'string' ? e.name.trim().slice(0, 40) : ''
      if (name === '') continue
      suggestions.push({
        id: '',
        name,
        kind: kinds.has(e.kind as string) ? e.kind as Plotline['kind'] : 'branch',
        goal: typeof e.goal === 'string' ? e.goal.trim().slice(0, 300) : '',
        progress: typeof e.progress === 'string' ? e.progress.trim().slice(0, 300) : '',
        status: 'active',
        chapters: [],
        createdAt: new Date().toISOString(),
      })
    }
  }
  return {
    direction: typeof raw.direction === 'string' ? raw.direction.slice(0, 300) : '',
    suggestions,
  }
}

/** Build the rewrite system prompt (fix review issues / instructions). */
function rewriteSystemPrompt(project: ProjectState, targetChars?: number): string {
  // 整章修订以「与原文相当」为准，不套用目标字数区间（避免与原文长度冲突）。
  const base = writeSystemPrompt(project, targetChars, '1. 输出完整的新正文（不要只输出修改片段、标题、章回名、作者的话或任何 Markdown 标记），字数与原章相当（允许 ±20%）。')
  return base + '\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。'
}

/**
 * Stream a chapter rewrite. With `target` (a passage of the body), only that
 * passage's paragraph is rewritten and spliced back — everything else stays
 * untouched (local revision). Without `target`, the whole chapter is
 * rewritten. Yields delta text; persists when done.
 */
export async function* rewriteChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  instructions: string,
  target?: string,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'drafted'; chars: number; draft: string }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)

  const reviewBlock = chapter.review !== undefined
    ? '审稿意见：\n' + chapter.review.issues.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    : ''

  // Local revision: find the paragraph containing `target` and only rewrite it.
  const bodyText = body.replace(/^#\s+.*$/m, '').trim()
  let localTarget: { paragraph: string; before: string; after: string } | undefined
  if (target !== undefined && target.trim() !== '') {
    const wanted = target.trim()
    // Normalize whitespace so multi-line / quoted snippets still match:
    // the assistant often copies a passage with line breaks and quotes.
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').replace(/[“”"'‘’]/g, '')
    const wantedFlat = normalize(wanted)
    // Split into paragraphs on blank lines (or double newlines).
    const paragraphs = bodyText.split(/\n{2,}/)
    const idx = paragraphs.findIndex(p => normalize(p).includes(wantedFlat))
    if (idx === -1) {
      throw new Error(`在正文中未找到要修改的片段：「${wanted.slice(0, 40)}…」。请从正文中复制原文片段（无需整段，取片段即可）。`)
    }
    localTarget = {
      paragraph: paragraphs[idx]!,
      before: paragraphs.slice(0, idx).join('\n\n'),
      after: paragraphs.slice(idx + 1).join('\n\n'),
    }
  }

  const user = localTarget === undefined
    ? [
        `请修订第 ${chapter.no} 章《${chapter.title}》。`,
        reviewBlock,
        instructions !== '' ? `本次修订重点：${instructions}` : '',
        '==================== 原正文 ====================',
        bodyText,
      ].filter(line => line !== '').join('\n')
    : [
        `请修订第 ${chapter.no} 章《${chapter.title}》中的一个自然段。`,
        instructions !== '' ? `修改要求：${instructions}` : '',
        '==================== 需要修改的原文段落 ====================',
        localTarget.paragraph,
        '',
        '要求：',
        '1. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。',
        '2. 保留该段的情节走向与角色口吻，只按修改要求调整。',
        '3. 段落长度与原文相当。',
      ].filter(line => line !== '').join('\n')

  const system = localTarget === undefined
    ? rewriteSystemPrompt(project, chapter.targetChars || config.chapterChars)
    : (() => {
        // 局部修订：补齐合规红线/本书红线/反AI规则/角色卡，加「只改表达不改情节」约束
        const bible = project.bible
        const lines = [
          '你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。',
          '硬性约束：',
          '1. 只改表达，不改情节走向、人物设定、已确立事实、对话核心内容。',
          '2. 必须遵守下方「内容合规红线」，任何一条命中（含影射、暗示）都必须避免。',
          '3. 必须遵守下方「本书红线」（如有）。',
          '4. 避免 AI 套话：不禁、仿佛、一时间、不由得、顿时、然而、缓缓、轻轻、微微、默默、似乎、终于等滥用。',
          '5. 保留角色口吻与性格，角色行为需符合下方角色卡（如有）。',
          '6. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。',
        ]
        if (bible !== undefined) {
          if (bible.redLines.length > 0) lines.push('本书红线：\n' + bible.redLines.map(r => '- ' + r).join('\n'))
          if (bible.characters.length > 0) {
            lines.push('相关角色卡：')
            for (const card of bible.characters) {
              lines.push('- ' + card.name + '（' + card.role + '）：' + card.traits.join('、'))
            }
          }
        }
        lines.push('内容合规红线（平台硬性要求，最高优先级）：')
        lines.push(COMPLIANCE_REDLINES.join('\n'))
        return lines.join('\n')
      })()

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system,
    // Rewriting outputs a full chapter: budget generously and skip
    // reasoning (a transform task) so the whole budget goes to the body.
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.7,
    reasoningEffort: ReasoningEffortId('off'),
  }

  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`修订失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('修订输出达到 maxTokens 上限，请增大配置后重试')
  }
  const rewritten = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (rewritten.length < 20) throw new Error('修订结果过短，可能失败，请重试')

  // Splice: local -> replace the paragraph; whole -> replace the body.
  let newBody: string
  if (localTarget !== undefined) {
    newBody = [localTarget.before, rewritten, localTarget.after].filter(part => part !== '').join('\n\n')
  } else {
    newBody = rewritten
  }
  if (newBody.length < 100) throw new Error('修订结果过短，可能失败，请重试')

  // Draft mode: do NOT overwrite the file yet. Store the new body as a
  // pending draft; the user reviews the diff and decides to apply or
  // discard. File overwrite + status change happen on draft/apply.
  chapter.pendingDraft = newBody
  chapter.error = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'drafted', chars: newBody.length, draft: newBody }
}

/** The de-AI-ify polish system prompt (with project writing assets injected). */
function polishSystemPrompt(project: ProjectState): string {
  const assetsBlock = renderAllAssets(project.assets)
  const bible = project.bible
  const lines = [
    '你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：',
    '1. 删除/替换 AI 高频套话与模式词：如"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""默默""似乎""终于"等滥用。',
    '2. 把书面翻译腔改成口语化的中文网文语感。',
    '3. 拆分过长的排比句与堆砌的修饰语。',
    '4. 保留全部情节、人物、对话内容、已确立事实不变，只改表达。',
    '5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。',
    '6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。',
    '7. 必须遵守下方「内容合规红线」与「本书红线」（如有），任何一条命中（含影射、暗示）都必须避免。',
  ]
  if (bible !== undefined && bible.redLines.length > 0) {
    lines.push('本书红线：\n' + bible.redLines.map(r => '- ' + r).join('\n'))
  }
  lines.push('内容合规红线（平台硬性要求，最高优先级）：')
  lines.push(COMPLIANCE_REDLINES.join('\n'))
  if (assetsBlock !== '') lines.push(assetsBlock)
  return lines.join('\n')
}

/** Stream a chapter polish (de-AI-ify). Draft-mode: the polished body lands
 *  in `chapter.pendingDraft` and is only applied on draft/apply. */
export async function* polishChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'drafted'; chars: number; draft: string }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: body.replace(/^#\s+.*$/m, '').trim() }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: polishSystemPrompt(project),
    // Polish rewrites the whole chapter: generous budget, no reasoning
    // (transform task — the entire budget should go to the body).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.5,
    reasoningEffort: ReasoningEffortId('off'),
  }
  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`润色失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('润色输出达到 maxTokens 上限')
  }
  const newBody = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (newBody.length < 100) throw new Error('润色结果过短，可能失败，请重试')

  // Draft mode: keep the original file untouched until the user decides.
  chapter.pendingDraft = newBody
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'drafted', chars: newBody.length, draft: newBody }
}

/** Generate one chapter (streaming). Yields progress frames; persists when done. */
export async function* generateChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number; warn?: string }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  // Note: the route layer owns the 'generating' status + concurrency guard;
  // this function must not refuse when status is 'generating' (the route sets
  // it before calling us).

  // Continuity: previous chapter's ending + its summary (narrative memory).
  let continuity = ''
  const prev = project.chapters.find(c => c.no === chapterNo - 1)
  if (prev?.file !== undefined) {
    const prevPath = join(outputDir, prev.file)
    if (existsSync(prevPath)) {
      const text = readFileSync(prevPath, 'utf8')
      continuity = text.slice(-900)
    }
  }
  const prevSummary = prev?.summary
  // 事实注入：最近 20 条（近因记忆）+ 按本章剧情要点检索的「相关旧事实」。
  // 长篇后旧设定可能被挤出近期窗口，故检索覆盖全部事实库：trigram 重合度 +
  // 角色名命中加权 + 近因加权，取 top 15，与近期事实去重，保证关键状态不写飞。
  const allFacts = project.facts ?? []
  const recentFacts = allFacts.slice(-20).map(f => f.text)
  const recentSet = new Set(recentFacts)
  const beatsText = chapter.beats
  const roleNames = (project.roles ?? [])
    .map(r => r.name)
    .filter((n): n is string => typeof n === 'string' && n !== '')
  const trigrams = (s: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i + 3 <= s.length; i++) {
      const tri = s.slice(i, i + 3)
      if (tri.trim() !== '') out.add(tri)
    }
    return out
  }
  const beatsTri = trigrams(beatsText)
  const beatRoles = roleNames.filter(n => beatsText.includes(n))
  const relatedFacts = allFacts
    .map((f, idx) => {
      const head = f.text.slice(0, 80)
      let score = 0
      for (const tri of trigrams(head)) if (beatsTri.has(tri)) score += 1
      if (beatRoles.length > 0) {
        for (const n of beatRoles) if (head.includes(n)) score += 8
      }
      // 近因加权：越新越优先（封顶 40 章）
      score += Math.min(idx, 40) / 10
      return { f, score }
    })
    .filter(x => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(x => `[第${x.f.chapterNo}章] ${x.f.text}`)
    .filter(t => !recentSet.has(t.slice(t.indexOf(']') + 2)))

  // 暗线（伏笔）埋点注入：检索「目标章在当前章附近 + 尚未回收」的 planned 伏笔，
  // 把埋点细节要求注入本次生成，保证正文按规划埋线（否则伏笔列表与正文脱节）。
  const foreshadowHints = (project.foreshadows ?? [])
    .filter(f => f.status === 'planned' && f.targetChapter !== undefined && f.targetChapter > 0)
    .filter(f => Math.abs((f.targetChapter as number) - chapterNo) <= 12)
    .map(f => `- ${f.description.slice(0, 120)}${f.targetChapter !== undefined ? `（计划回收于第 ${f.targetChapter} 章）` : ''}`)
  const user = [
    `现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
    `本章剧情要点：${chapter.beats}`,
    '',
    foreshadowHints.length > 0
      ? `本章附近需顺势埋下以下暗线（自然带过，不喧宾夺主，1-2 句即可，但细节要可辨识、与描述吻合）：\n${foreshadowHints.join('\n')}`
      : '',
    recentFacts.length > 0
      ? `本书已确立的事实（新写内容不得与之矛盾）：\n${recentFacts.join('\n')}`
      : '',
    relatedFacts.length > 0
      ? `本章相关的既往事实（同样不得违背）：\n${relatedFacts.join('\n')}`
      : '',
    prevSummary !== undefined && prevSummary !== ''
      ? `上一章摘要：${prevSummary}`
      : '',
    continuity !== ''
      ? `上一章结尾（用于衔接，不要复述）：\n${continuity}`
      : '这是第一章，注意开篇要有吸引力。',
    '',
    `请写 ${chapter.targetChars} 字左右的正文，只输出正文。`,
  ].filter(line => line !== '').join('\n')

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: writeSystemPrompt(project, chapter.targetChars || config.chapterChars),
    // Full-chapter output: budget generously (4000 chars ≈ 8-12k tokens,
    // plus the model's reasoning channel).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.85,
  }

  yield { frame: 'start' }

  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') {
      yield { frame: 'delta', text: chunk.text }
    }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`生成失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('达到 maxTokens 上限，正文可能不完整，请增大 maxTokens 后重试')
  }
  const body = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (body.length < 100) throw new Error('生成内容过短，可能失败，请重试')

  // Write the chapter file.
  const fileName = chapterFileName(chapter)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${body}\n`, 'utf8')

  chapter.status = 'written'
  chapter.chars = body.length
  chapter.file = fileName
  chapter.error = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)

  const target = chapter.targetChars > 0 ? chapter.targetChars : config.chapterChars
  const warn = target > 0
    ? (body.length < target * 0.8
        ? `第${chapter.no}章实际 ${body.length} 字，明显少于目标 ${target} 字`
        : body.length > target * 1.25
          ? `第${chapter.no}章实际 ${body.length} 字，明显多于目标 ${target} 字`
          : undefined)
    : undefined
  yield { frame: 'done', file: fileName, chars: body.length, warn }
}

/** Generate a chapter summary (narrative memory). */
export async function summarizeChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<string> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const system = [
    '你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。',
    '摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。',
    '用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  const summary = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000) })
  chapter.summary = summary.slice(0, 500)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return chapter.summary
}

/** 把分镜产出写入项目持久化（按章 upsert）。重新生成上游时级联清掉下游旧产物：
 * 新骨架 → 清分镜表+提示词；新分镜表 → 清提示词；新提示词不动上游。 */
function saveChapterStoryboard(project: ProjectState, outputDir: string, entry: ChapterStoryboard): void {
  if (project.storyboards === undefined) project.storyboards = []
  const idx = project.storyboards.findIndex(e => e.chapterNo === entry.chapterNo)
  const prev = idx === -1 ? undefined : project.storyboards[idx]
  const next: ChapterStoryboard = { ...(prev ?? {}), ...entry }
  if (entry.skeleton !== undefined) {
    next.table = undefined
    next.prompts = undefined
  }
  if (entry.table !== undefined) {
    next.prompts = undefined
  }
  if (idx === -1) project.storyboards.push(next)
  else project.storyboards[idx] = next
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
}

/** 确定性兜底：正文中出现的角色库角色名（LLM 漏填 characters 时使用）。 */
function guessCharactersFromRoles(project: ProjectState, body: string, limit = 12): string[] {
  const out: string[] = []
  for (const r of project.roles ?? []) {
    if (out.length >= limit) break
    if (r.name !== '' && !out.includes(r.name) && body.includes(r.name)) out.push(r.name)
  }
  return out
}

/** 清洗 LLM 输出的角色名数组：去空 / 去重 / 限长 / 限字数。 */
function sanitizeCharacters(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const name = v.trim().slice(0, 20)
    if (name === '' || out.includes(name)) continue
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}

/** 漫剧卡绑定索引：按分镜称谓（正文确切名）解析漫剧卡（卡名/来源名精确优先，包含兜底）。 */
interface MangaRoleBindingIndex {
  byId: Map<string, MangaRoleCard>
  resolve: (name: string) => MangaRoleCard | undefined
}
function buildMangaRoleBindings(project: ProjectState): MangaRoleBindingIndex {
  const cards = project.mangaRoles ?? []
  const byName = new Map<string, MangaRoleCard>()
  for (const c of cards) {
    if (c.name !== '') byName.set(c.name, c)
    if (c.sourceRoleName !== undefined && c.sourceRoleName !== '') byName.set(c.sourceRoleName, c)
  }
  const byId = new Map<string, MangaRoleCard>(cards.map(c => [c.id, c]))
  return {
    byId,
    resolve: (name: string): MangaRoleCard | undefined => {
      const exact = byName.get(name)
      if (exact !== undefined) return exact
      for (const c of cards) {
        if (c.name !== '' && (c.name.includes(name) || name.includes(c.name))) return c
        if (c.sourceRoleName !== undefined && c.sourceRoleName !== '' && (c.sourceRoleName.includes(name) || name.includes(c.sourceRoleName))) return c
      }
      return undefined
    },
  }
}

/**
 * 分镜·导演级：剧情骨架 → 分镜表（镜头级）。
 * 只做画面层：景别/机位运镜/时长/画面/台词/音效/光效 + 状态连续；禁止改剧情（骨架只读）。
 */
export async function generateStoryboardTable(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  skeleton: StoryboardSkeleton,
  styleId?: string,
  filterId?: string,
): Promise<StoryboardTable> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  if ((skeleton.beats ?? []).length === 0) throw new Error('骨架为空，请先生成剧情骨架')


  // 出场角色锚点：正文中出现过的角色名 + 身份（简短）。
  const roles = (project.roles ?? [])
    .filter(r => body.includes(r.name))
    .slice(0, 8)
    .map(r => `${r.name}（${r.roleLabel === 'protagonist' ? '主角' : r.roleLabel === 'antagonist' ? '反派' : r.roleLabel === 'female_lead' ? '女主' : '配角'}）：${r.identity ?? ''}`)
  // 场景卡：仅列名称与定位（正文命中优先，至多 6 个）。
  // 匹配策略：完整场景名 或 短名（"·"前的区域名），避免"八折区·货架过道（清晨）"这类长名匹配失败
  const sceneShortName = (n: string): string => n.split('·')[0].split('（')[0].split('(')[0].trim()
  const usedScenes = (project.scenes ?? []).filter(s => body.includes(s.name) || body.includes(sceneShortName(s.name))).slice(0, 6)
  const scenes = usedScenes.map(s => `${s.name}：${s.summary ?? ''}`)
  // 漫剧定妆卡：本章正文命中漫剧卡（卡名或来源名），注入定妆锚点供画面遵守。
  const bindings = buildMangaRoleBindings(project)
  const mangaCardsInBody = bindings.byId.size > 0
    ? [...bindings.byId.values()].filter(c => body.includes(c.name) || (c.sourceRoleName !== undefined && body.includes(c.sourceRoleName))).slice(0, 8)
    : []
  const mangaLines = mangaCardsInBody.map(c => {
    const anchor = c.imagePrompt !== undefined ? c.imagePrompt.zh.slice(0, 90) : (c.appearance !== '' ? c.appearance : '')
    const ref = c.imageUrl !== undefined ? '；参考图：有' : (c.gallery ?? []).some(g => g.label.includes('立绘')) ? '；参考图：有（立绘）' : ''
    return `${c.name}（${c.identity ?? ''}）：定妆${anchor !== '' ? '「' + anchor + '」' : '（锚点未生成）'}${ref}`
  })
  const rules = (project.visualRules ?? []).map(r => '- ' + r)

  const baseStyle = styleId !== undefined ? findStyle(styleId) : undefined
  const filterStyle = filterId !== undefined ? findStyle(filterId) : undefined
  const styleLines: string[] = []
  if (baseStyle !== undefined) styleLines.push('- 基底风格「' + baseStyle.name + '」：' + baseStyle.keywords)
  if (filterStyle !== undefined) styleLines.push('- 叠加滤镜「' + filterStyle.name + '」：' + filterStyle.keywords)
  if (styleLines.length === 0) styleLines.push('- （未选择风格，默认 3D 动漫超精细建模质感）')

  const system = [
    '你是一位从业 10 年的电影导演兼分镜师，专长网文改编影视化。',
    '任务：把「剧情骨架」的每一个节拍展开为 1-3 个电影镜头，输出分镜表——只做画面层，禁止新增或改变剧情（骨架是只读输入）。',
    '输出合法 JSON 对象：{"shots": [{"beatId": "骨架节拍id", "shot": "景别", "camera": "机位与运镜", "composition": "构图", "duration": 秒数, "visual": "画面内容", "line": "台词/旁白", "sound": "音效", "light": "光效", "prevState": "承接上一镜头结尾状态", "nextState": "本镜头结束状态", "jimengCamera": "即梦运镜自然语言描述", "characters": ["出镜角色名"]}]}',
    '景别取值（只能从这些词中选一）：大远景/远景/全景/中景/中近景/近景/特写/大特写。',
    '运镜取值（可组合，用加号连接）：固定机位/推近/拉远/左摇/右摇/左横移/右横移/跟随/升镜/降镜/环绕/手持晃动/低机位仰拍/高机位俯拍/过肩镜头。',
    '光效取值（可组合，用加号连接）：顺光/侧光/逆光/顶光/伦勃朗光/霓虹光/硬光/柔光/氛围光/高反差。',
    '构图取值（可选，只能从这些词中选一）：三分法/中心对称/引导线/前景遮挡/低机位/俯拍/对称构图。',
    '硬性要求：',
    '【视觉风格】（必须内嵌进 visual/light 的画面措辞与光效描述）：',
    ...styleLines,
    '1. 按骨架节拍顺序输出镜头，每个节拍至少 1 个镜头，总镜头数 8-15。',
    '2. 镜头间连续：下一镜头的 prevState 必须与上一镜头的 nextState 一致（人物位置/动作/情绪/服装），禁止瞬移、服装消失、情绪跳变。',
    '3. visual 必须写明：主体位置（左/中/右/前景/背景）+ 角色动作 + 表情 + 服装/标志物（标志物来自下方视觉规则与角色锚点，逐镜头保持）。',
    '4. 台词/音效/光效无则空字符串，不要编造。',
    '5. duration 只能取 5/6/7/8/10 五个值（即梦单条视频时长上限）。',
    '6. 所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束，不要输出其他文字。',
    '7. 每个镜头必须输出 characters：本镜头出镜角色名数组（1-4 个），从「出场角色锚点」或正文中选取，使用正文里的确切称谓（如「周野」「周野的律师」），禁止自造名/缩写；路人或群像可用身份词（如「围观群众」）。',
    '8. 人物外观/服装/标志物必须遵守「漫剧定妆卡」与「出场角色锚点」：同一角色逐镜头保持完全一致（服装、发色、标志物禁止更换）；定妆卡未覆盖的路人可用通用描述。',
    '9. jimengCamera：即梦运镜自然语言描述，必须写具体起止（如「镜头从中景缓慢推进到近景」「镜头从左向右缓慢横移」），禁止只写「推近」「拉远」；静止镜头写「固定机位」。',
    '10. 单镜只承载一个连续动作，动作必须在5-10秒内可完成；禁止复杂打斗、多人群舞、快速切换场景。',
    '11. 画面禁止出现任何文字、字幕、水印、符号、UI界面、屏幕显示内容。',
    '12. 单镜出镜角色不超过2个主要角色，多人同框时必须明确谁是画面主体。',
  ].join('\n')
  const user = [
    `章节《${chapter.title}》（第 ${chapter.no} 章）`,
    '==== 剧情骨架（只读，禁止改动） ====',
    `弧线：${skeleton.arc}`,
    skeleton.beats.map(b => `[${b.id}] [${b.function}] ${b.event}（情绪：${b.emotion}${b.cause !== undefined ? '；承接：' + b.cause : ''}）`).join('\n'),
    roles.length > 0 ? '==== 出场角色锚点 ====\n' + roles.join('\n') : '',
    mangaLines.length > 0 ? '==== 漫剧定妆卡（角色外观以此为准，禁止改换服装/发色/标志物） ====\n' + mangaLines.join('\n') : '',
    scenes.length > 0 ? '==== 相关场景 ====\n' + scenes.join('\n') : '',
    rules.length > 0 ? '==== 本书视觉规则（必须内嵌进 visual） ====\n' + rules.join('\n') : '',
    '==== 章节正文（画面细节以此为准） ====',
    body.replace(/^#\s+.*$/m, '').trim().slice(0, 3000),
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 16000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ shots?: unknown }>(text)
  const beatIds = new Set(skeleton.beats.map(b => b.id))
  const shots: StoryboardShot[] = Array.isArray(raw.shots)
    ? raw.shots
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map((entry, i) => ({
          id: 's' + (i + 1),
          beatId: beatIds.has(entry.beatId as string) ? entry.beatId as string : skeleton.beats[0]!.id,
          shot: normalizeShotSize(entry.shot as string | undefined),
          camera: normalizeCameras(entry.camera as string | undefined),
          composition: normalizeComposition(entry.composition as string | undefined),
          duration: (() => { const d = typeof entry.duration === 'number' ? Math.round(entry.duration) : 0; return [5,6,7,8,10].includes(d) ? d : 6; })(),
          visual: typeof entry.visual === 'string' ? entry.visual.trim().slice(0, 300) : '',
          line: typeof entry.line === 'string' ? entry.line.trim().slice(0, 120) : '',
          sound: typeof entry.sound === 'string' ? entry.sound.trim().slice(0, 80) : '',
          light: normalizeLightings(entry.light as string | undefined),
          prevState: typeof entry.prevState === 'string' ? entry.prevState.trim().slice(0, 150) : '',
          nextState: typeof entry.nextState === 'string' ? entry.nextState.trim().slice(0, 150) : '',
          characters: sanitizeCharacters(entry.characters, 4),
          jimengCamera: typeof entry.jimengCamera === 'string' && entry.jimengCamera.trim() !== '' ? entry.jimengCamera.trim().slice(0, 80) : undefined,
        }))
        .filter(s => s.visual !== '')
    : []
  if (shots.length === 0) throw new Error('模型未输出有效镜头，请重试')
  // 覆盖自检：每个节拍至少 1 个镜头（缺失节拍告警）。
  const covered = new Set(shots.map(s => s.beatId))
  const missing = skeleton.beats.filter(b => !covered.has(b.id)).map(b => b.id)
  if (missing.length > 0) {
    console.warn(`[dsh-novel-forge] storyboard: beat ${missing.join(',')} 无镜头覆盖`)
  }
  // 表级 characters：各镜头去重汇总；LLM 漏标时用骨架/角色库兜底。
  const tableChars: string[] = []
  const tableRoleIds: string[] = []
  for (const s of shots) {
    // 定妆绑定：镜头 characters 称谓 → 漫剧卡 id（供出图/生视频时按卡取定妆图）。
    const ids: string[] = []
    for (const n of s.characters ?? []) {
      const card = bindings.resolve(n)
      if (card !== undefined && !ids.includes(card.id)) ids.push(card.id)
    }
    s.mangaRoleIds = ids.length > 0 ? ids : undefined
    for (const c of s.characters ?? []) {
      if (!tableChars.includes(c)) tableChars.push(c)
      if (tableChars.length >= 12) break
    }
    for (const id of ids) {
      if (!tableRoleIds.includes(id)) tableRoleIds.push(id)
    }
  }
  const fallbackChars = (skeleton.characters ?? guessCharactersFromRoles(project, body, 12)).slice(0, 12)
  const table: StoryboardTable = {
    chapterNo,
    shots,
    usedScenes: usedScenes.map(s => s.name),
    characters: tableChars.length > 0 ? tableChars : fallbackChars,
    mangaRoleIds: tableRoleIds.length > 0 ? tableRoleIds : undefined,
  }
  saveChapterStoryboard(project, outputDir, { chapterNo, table, updatedAt: new Date().toISOString() })
  return table
}

/**
 * 提炼常驻道具（跨镜头需一致）：从已写章节正文识别反复出现的关键道具 + 一行统一外观描述。
 * 生成分镜提示词前自动调用，若道具库为空则补齐；道具库存 project.props，注入提示词保持跨镜头一致。
 */
export async function extractProps(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<Prop[]> {
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const excerpt = written.slice(0, 6).map(c => {
    const body = readChapterFile(config.outputDir, c)
    return body !== undefined ? '第' + c.no + '章《' + c.title + '》\n' + body.replace(/^#.*$/gm, '').trim().slice(0, 1500) : ''
  }).filter(s => s !== '').join('\n\n')
  if (excerpt.length < 200) return []
  const system = [
    '你是一位网文漫剧道具导演。从下面的已写章节正文中，识别「常驻道具」——跨多个镜头/场景反复出现、需要保持外观一致的关键道具（如外卖电动车、外卖箱、手机、名片；一次性出现的忽略）。',
    '每个道具给一行统一外观描述（可辨识、具体的颜色/材质/状态），供每个镜头遵循。',
    '输出必须是合法 JSON 数组：[{"name":"道具名","desc":"一行统一外观描述"}]，3-8 个。',
    '重要：字符串内不含换行符；直接输出 JSON 结果本身。',
  ].join('\n')
  const text = await complete(ctx, config, { system, user: excerpt, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 8000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonArray<Record<string, unknown>>(text)
  const props: Prop[] = []
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue
    const n = typeof e.name === 'string' ? e.name.trim().slice(0, 20) : ''
    const d = typeof e.desc === 'string' ? e.desc.trim().slice(0, 120) : ''
    if (n !== '' && d !== '' && !props.some(p => p.name === n)) props.push({ name: n, desc: d })
  }
  return props.slice(0, 8)
}

/**
 * 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。
 * 每镜头一段：风格词块（基底+滤镜）+ 画面内容（角色动作/服装标志物）+ 机位运镜 + 光效。
 * 提示词聚焦画面与镜头（视频模型无音频，台词/音效不注入）。
 */
export async function generateStoryboardPrompts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  table: StoryboardTable,
  styleId?: string,
  filterId?: string,
): Promise<StoryboardPrompt[]> {
  if ((table.shots ?? []).length === 0) throw new Error('分镜表为空，请先生成分镜表')
  const chapter = project.chapters.find(c => c.no === chapterNo)
  const baseStyle = styleId !== undefined ? findStyle(styleId) : undefined
  const filterStyle = filterId !== undefined ? findStyle(filterId) : undefined
  const stylePrefix = [
    baseStyle?.keywords,
    filterStyle?.keywords,
  ].filter((v): v is string => v !== undefined && v !== '').join('，') || '3D动漫，超精细建模，电影光影'
  const rules = (project.visualRules ?? []).map(r => '- ' + r)
  const bindings = buildMangaRoleBindings(project)
  // 常驻道具：道具库为空时从已写章节自动提炼一次并回存，此后跨镜头统一注入
  let props = project.props ?? []
  if (props.length === 0) {
    try {
      props = await extractProps(ctx, config, project)
      if (props.length > 0) {
        project.props = props
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
      }
    } catch { /* 提炼失败不阻塞生成 */ }
  }
  const propsBlock = (props.length > 0)
    ? '常驻道具（每个镜头必须按此外观/状态呈现，保持跨镜头一致）：\n' + props.map(p => `- ${p.name}：${p.desc}`).join('\n') : ''
  let accTime = 0
  const shotLines = table.shots.map(s => {
    const startSec = accTime
    const endSec = accTime + s.duration
    accTime = endSec
    const bound = (s.characters ?? []).map(n => bindings.resolve(n)).filter((c): c is MangaRoleCard => c !== undefined)
    const makeUp = bound.map(c => {
      const anchor = c.imagePrompt !== undefined ? c.imagePrompt.zh.slice(0, 60) : (c.appearance !== '' ? c.appearance : '')
      const ref = c.imageUrl !== undefined ? '（参考图）' : ''
      return c.name + '：' + anchor + ref
    }).join('；')
    return `[${s.id}] 时间戳 ${startSec}s-${endSec}s · 节拍${s.beatId} · ${sizeZh(s.shot)} · ${cameraZh(s.camera)} · 时长${s.duration}s
出场：${s.characters !== undefined && s.characters.length > 0 ? s.characters.join('、') : '（未标注）'}
定妆：${makeUp !== '' ? makeUp : '（未绑定漫剧卡）'}
画面：${s.visual}
台词：${s.line !== '' ? s.line : '（无）'}
光效：${lightZh(s.light) !== '' ? lightZh(s.light) : '（无）'}
运镜（即梦）：${s.jimengCamera !== undefined ? s.jimengCamera : cameraZh(s.camera)}
承接：${s.prevState} → ${s.nextState}`
  }).join('\n\n')
  const system = [
    '你是一位资深影视分镜提示词工程师，精通即梦 Seedance 2.5 视频生成模型的提示词写法与参数调优。',
    '任务：把分镜表的每个镜头写成「可直接粘贴到即梦」的视频提示词——精简、只留能生成画面的内容，不要混入给用户的说明/元信息（如模型版本、画幅、参考图是否上传）。',
    '每镜 text 按以下段序组织（内容精简）：',
    '① 风格段：' + stylePrefix + '（一句，放最前）。',
    '② 场景段：写"场景：<地点名> — <环境/光线/氛围>"（如"场景：雨夜道路 — 暴雨积水、昏黄路灯、雨幕"）；场景名标清楚（供用户@对应场景图），不写@。场景名优先复用下方「可用场景名清单」里已有的名字（按镜头地点/氛围就近匹配），只有清单里确实没有该地点时才新建场景名；新建名也要简短、能同时指示地点与氛围。',
    '③ 人物段：主体写"@角色名"（智能角色，如"@林深"）+ 位置/朝向/简短动作，不写外貌细节（角色一致性靠智能主体多角度），多角色明确谁是主体。',
    '④ 时间轴段：必须把单镜按动作拆成 2~3 段（每段 3~5s，如"0s-3s / 3s-7s"），每段写清画面+动作+运镜，不要整镜单段；有台词用『台词(声音层)："…"（音色：…）』；音效用 [SFX: …]。',
    '⑤ 结尾负面：不要字幕、不要水印、禁止变形 + 行为级禁止项（按镜头定）。',
    ...(getGenreRules((project.mangaPlans ?? []).find(p => p.active)?.genre).length > 0
      ? ['题材专用规则（本题材必须遵守）：', ...getGenreRules((project.mangaPlans ?? []).find(p => p.active)?.genre).map(r => '- ' + r), '']
      : []),
    '题材无关硬性要求：',
    '1. 台词走声音层，不写进画面提示词当口型（避免即梦硬配口型）；台词用『台词(声音层)："……"（音色：低沉平静）』单独标注在时间轴段，画面描述不重复人声。',
    '2. 音效用原生 [SFX: 具体音效] 标记（如 [SFX: 雨声，心跳声]），叠在对应时间轴段，禁空泛"震撼音效"。',
    '3. 时长预算：单镜 4~15s；text 完整覆盖该镜全部秒数，时间轴写起止。',
    '4. 服装/发色/标志物沿用镜头表、定妆卡、视觉规则，禁止自行更换（同一角色跨镜一致）。',
    '4b. 若用户给出「常驻道具」清单，每个涉及该道具的镜头必须按清单里那行统一外观/状态呈现（颜色/材质/特征完全一致），禁止换成别的样子；只出现台词不提道具的镜头可忽略。',
    '5. 每镜主体锚定：画面主体是[角色名]，位于画面[左/中/右/前景]，多角色明确谁是主体。',
    '6. 高动态/动作镜头：时间轴可细化到 0.5s~1s 微步进（运镜/动作/粒子/环境受力四要素）。',
    '7. text 结尾含"不要字幕、不要水印、禁止变形"。',
    '8. 输出合法 JSON 对象：{"prompts": [{"shotId":"s1","text":"...","camera":"...","motion":"low|medium|high","negativePrompt":"...","sceneName":"..."}]}，所有镜头都有，顺序一致。',
    '9. 字符串内不得含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const speechLines = [...bindings.byId.values()]
    .map(c => `${c.name}：${(c.speechStyle ?? '').trim()}`)
    .filter(x => !x.endsWith('：'))
  // 场景库：场景名须与场景库对齐（供用户按名字@场景图）
  const sceneLibLines = (project.scenes ?? []).map(s => {
    const moods = (s.moods ?? []).join('、')
    const extra = (s.moment !== undefined && s.moment !== '' ? '时间光态：' + s.moment : '')
    const tag = [moods, extra].filter(x => x !== '').join('；')
    return `- ${s.name}${s.summary !== '' ? '：' + s.summary : ''}${tag !== '' ? '（' + tag + '）' : ''}`
  })
  const sceneLibBlock = sceneLibLines.length > 0
    ? '可用场景名清单（场景名只允许从这里选，或确无此地点时新建）：\n' + sceneLibLines.join('\n') : ''
  const user = [
    `章节《${chapter?.title ?? ''}》（第 ${chapterNo} 章）`,
    rules.length > 0 ? '本书视觉规则（必须遵守）：\n' + rules.join('\n') : '',
    propsBlock,
    sceneLibBlock,
    speechLines.length > 0 ? '出场角色说话方式（写台词音色参考时用）：\n' + speechLines.join('\n') : '',
    '==== 分镜表 ====',
    shotLines,
    '只输出 JSON 对象。',
  ].filter(x => x !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 16000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ prompts?: unknown }>(text)
  const shotIds = new Set(table.shots.map(s => s.id))
  // 实时绑定：用当前漫剧卡库解析每镜角色，不依赖分镜表预存的 mangaRoleIds（角色可能在分镜表之后才导入）
  const shotBinding = new Map<string, string[]>(table.shots.map(s => {
    const ids: string[] = []
    for (const n of s.characters ?? []) {
      const card = bindings.resolve(n)
      if (card !== undefined && !ids.includes(card.id)) ids.push(card.id)
    }
    return [s.id, ids]
  }))
  const prompts: StoryboardPrompt[] = Array.isArray(raw.prompts)
    ? raw.prompts
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => {
          const shotId = shotIds.has(entry.shotId as string) ? entry.shotId as string : ''
          const ids = shotBinding.get(shotId) ?? []
          const motionVal = typeof entry.motion === 'string' ? entry.motion.trim().toLowerCase() : ''
          return {
            shotId,
            text: ensureStyleEmbedded(typeof entry.text === 'string' ? entry.text.trim().slice(0, 400) : '', stylePrefix, 'zh'),
            mangaRoleIds: ids.length > 0 ? ids : undefined,
            camera: typeof entry.camera === 'string' && entry.camera.trim() !== '' ? entry.camera.trim().slice(0, 100) : undefined,
            motion: motionVal in {'low':1,'medium':1,'high':1} ? motionVal as 'low'|'medium'|'high' : undefined,
            negativePrompt: typeof entry.negativePrompt === 'string' && entry.negativePrompt.trim() !== '' ? entry.negativePrompt.trim().slice(0, 200) : undefined,
            sceneName: typeof entry.sceneName === 'string' && entry.sceneName.trim() !== '' && entry.sceneName.trim() !== '（未标注）' ? entry.sceneName.trim().slice(0, 50) : undefined,
          }
        })
        .filter(x => x.shotId !== '' && x.text !== '')
    : []
  if (prompts.length === 0) throw new Error('模型未输出有效提示词，请重试')
  saveChapterStoryboard(project, outputDir, { chapterNo, prompts, updatedAt: new Date().toISOString() })
  // 落盘：逐镜即梦提示词 → 资产库（manga-assets/分镜脚本/第N章-标题-提示词.md）
  try {
    const chTitle = (project.chapters.find(c => c.no === chapterNo)?.title ?? '')
    const pLines: string[] = []
    for (const p of prompts) pLines.push('### 镜头 ' + p.shotId + '\n' + (p.text ?? ''))
    saveMangaChapterPrompts(outputDir, chapterNo, chTitle, pLines.join('\n\n'))
  } catch { /* 落盘失败不阻塞 */ }
  // 回写实时绑定到分镜表（直接操作 project 对象，不触发级联清除）
  const sbEntry = (project.storyboards ?? []).find(e => e.chapterNo === chapterNo)
  if (sbEntry !== undefined && sbEntry.table !== undefined) {
    for (const s of sbEntry.table.shots) {
      const ids = shotBinding.get(s.id) ?? []
      s.mangaRoleIds = ids.length > 0 ? ids : undefined
    }
    project.updatedAt = new Date().toISOString()
    saveProject(outputDir, project)
  }
  return prompts
}


/**
 * 分镜·编剧级：单章 → 剧情骨架（节拍链）。
 * 只做故事层（事件/情绪/功能/因果），不做画面；导演级分镜在其上展开。
 */
export async function generateStoryboardSkeleton(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<StoryboardSkeleton> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const system = [
    '你是一位从业 15 年的电影编剧，专长网文改编影视化，深谙三幕结构与节拍（beat）写作。',
    '任务：把这一章改编成影视化「剧情骨架」——只做故事层，不做画面。',
    '输出合法 JSON 对象：{"arc": "本章弧线一句话（起承转合，20-60字）", "beats": [{"event": "事件一句话（发生了什么）", "emotion": "人物情绪走向（情绪词数组）", "function": "铺垫|冲突|转折|高潮|收束|伏笔|人物塑造", "cause": "承接上一节拍的原因（可省略）"}], "characters": ["出镜角色名1", "出镜角色名2"]}',
    '情绪词取值（从这些词中选 1-3 个，用数组输出，按情绪发展顺序）：平静/淡然/期待/好奇/警觉/压抑/隐忍/担忧/焦躁/不安/惊惧/愤怒/崩溃/决绝/痛心/释然/悲凉/得意/重生/麻木。',
    '功能取值（只能从这些词中选一）：铺垫/冲突/转折/高潮/收束/伏笔/人物塑造。',
    '硬性要求：',
    '1. beats 数量 4-9 个，严格按时间顺序，因果链完整：前一个 beat 的结果是后一个 beat 的原因。',
    '2. 必须覆盖本章全部剧情要点与正文关键事件，遗漏关键事件视为失败。',
    '3. 只输出剧情骨架，禁止写画面描写、机位运镜、台词细节、音效（那是导演阶段的事）。',
    '4. 所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '5. 直接输出 JSON 本身，不要输出思考过程或其他文字。',
    '6. 额外输出 characters：本章真正出镜（说话/行动/被正面描写）的角色名数组，全部使用正文中的确切称谓（如「周野」「周野的律师」，不要改名或拼接），去重，3-10 个；路人或群像可用身份词（如「围观群众」）。',
  ].join('\n')
  const user = [
    `章节《${chapter.title}》（第 ${chapter.no} 章）`,
    `剧情要点：${chapter.beats !== undefined && chapter.beats !== '' ? chapter.beats : '（未填写）'}`,
    '==================== 章节正文 ====================',
    body.replace(/^#\s+.*$/m, '').trim(),
  ].join('\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ arc?: unknown; beats?: unknown; characters?: unknown }>(text)
  const arc = typeof raw.arc === 'string' ? raw.arc.trim().slice(0, 200) : ''
  const beats: StoryboardBeat[] = Array.isArray(raw.beats)
    ? raw.beats
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map((entry, i) => ({
          id: 'b' + (i + 1),
          event: typeof entry.event === 'string' ? entry.event.trim().slice(0, 200) : '',
          emotion: Array.isArray(entry.emotion)
            ? normalizeEmotions(entry.emotion.filter((x): x is string => typeof x === 'string').join('→'))
            : normalizeEmotions(typeof entry.emotion === 'string' ? entry.emotion : undefined),
          function: normalizeStoryFunction(typeof entry.function === 'string' ? entry.function : undefined),
          cause: typeof entry.cause === 'string' && entry.cause.trim() !== '' ? entry.cause.trim().slice(0, 150) : undefined,
        }))
        .filter(b => b.event !== '')
    : []
  if (beats.length === 0) throw new Error('模型未输出有效节拍链，请重试')
  // 出场角色：LLM 结构化输出优先，漏填时用角色库命中正文兜底。
  const skeletonChars = sanitizeCharacters(raw.characters, 12)
  const chars = skeletonChars.length > 0 ? skeletonChars : guessCharactersFromRoles(project, body, 12)
  const skeleton: StoryboardSkeleton = {
    chapterNo,
    arc: arc !== '' ? arc : '（本章弧线未生成）',
    beats,
    characters: chars.length > 0 ? chars : undefined,
  }
  saveChapterStoryboard(project, outputDir, { chapterNo, skeleton, updatedAt: new Date().toISOString() })
  return skeleton
}

/**
 * 反向推大纲：从已写章节正文反推出全书总纲（分卷 + 章节要点 + 主线/人物弧线/伏笔清单）。
 * 两阶段：分批提取章节事件摘要 → 汇总生成大纲。不修改章节/设定，只返回大纲文本。
 */
export async function reverseOutlineFromChapters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  onProgress?: (done: number, total: number, phase: string) => void,
): Promise<string> {
  const written = project.chapters
    .filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error')
    .filter(c => readChapterFile(outputDir, c) !== undefined)
    .sort((a, b) => a.no - b.no)
  if (written.length === 0) throw new Error('本书还没有已写章节，无法反推大纲')

  // 阶段 1：分批提取章节事件摘要（每批 10 章，正文各取前 1000 字控制成本）。
  const BATCH = 10
  const notes: string[] = []
  const total = written.length
  for (let i = 0; i < written.length; i += BATCH) {
    const batch = written.slice(i, i + BATCH)
    const bodies = batch.map(c => {
      const body = readChapterFile(outputDir, c) ?? ''
      return '第' + c.no + '章《' + (c.title || '无题') + '》\n' + body.replace(/^#\s+.*$/m, '').trim().slice(0, 1000)
    }).join('\n\n---\n\n')
    const system = '你是一位网文编辑。下面是一本书若干章正文的节选。请为每一章输出一行「事件摘要」，格式严格为：第N章《标题》：关键事件+主角状态变化+新增伏笔或线索。每章恰好一行，不要空行，不要评价，不要输出其他内容。'
    const note = await complete(ctx, config, { system, user: bodies, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 3000), reasoning: config.analysisReasoning ?? 'low' })
    notes.push(note.trim())
    onProgress?.(Math.min(i + BATCH, total), total, '章节摘要')
  }

  // 阶段 2：汇总反推总纲。
  onProgress?.(total, total, '生成大纲')
  const system2 = [
    '你是一位经验丰富的小说主编。根据下面全书各章事件摘要，反推出这本书的总纲（大纲），可直接作为后续写作依据。要求：',
    '1. 第一行写《书名》（从摘要中的书名或内容推断，若无则用《未命名》）。',
    '2. 按故事弧线划分卷/部分：每卷给出卷名与主旨（标注覆盖章节范围）。',
    '3. 每一章列出：章节号 + 标题 + 一句话核心情节（若原章无标题可自拟）。',
    '4. 最后给出：全书主线、主要人物弧线、已埋设待回收的伏笔清单。',
    '5. 输出为纯文本 Markdown 结构（# 一级标题、## 二级标题、- 列表），不要多余寒暄。',
  ].join('\n')
  const outline = await complete(ctx, config, { system: system2, user: notes.join('\n\n'), temperature: 0.4, maxTokens: Math.max(config.maxTokens, 6000), reasoning: config.analysisReasoning ?? 'low' })
  onProgress?.(total, total, '完成')
  return outline.trim()
}

/**
 * 改编模式 P0：全文分析 → 原文设定卡片 / 可改范围矩阵。
 * 拆章统计 + 取样正文，让 LLM 一次输出结构化 JSON：
 * { bookName, outline, dimensions: [{key,title,mutability,current,evidence,candidates,impact,risk}] }。
 */
export async function analyzeAdaptation(
  ctx: Context,
  config: NovelConfig,
  text: string,
): Promise<AdaptAnalyzeResponse> {
  const chapters = splitBookText(text).filter(c => c.body.length >= 50)
  if (chapters.length === 0) throw new Error('未能从全文拆出章节（内容过短或无章节结构）')

  // 取样：取首/1/3/2/3/尾各章正文节选，控制 token 预算。
  const sampleBodies: string[] = []
  const n = chapters.length
  const pick = (i: number): void => {
    const c = chapters[i]
    if (c !== undefined) sampleBodies.push('第' + c.no + '章《' + (c.title || '无题') + '》\n' + c.body.slice(0, 1200))
  }
  pick(0)
  if (n > 3) { pick(Math.floor(n / 3)); pick(Math.floor((2 * n) / 3)) }
  if (n > 1) pick(n - 1)

  const system = '你是改编策划分析助手。'
  const user = [
    '你是一位资深网文编辑兼改编策划。下面给你一部已完结/连载小说的若干章正文节选。请通读并输出该书的「原文设定卡片」与「可改范围矩阵」。',
    '输出合法 JSON 对象：',
    '{"bookName": "书名", "outline": "一句话主线梗概（100字内）", "dimensions": [{"key":"realm","title":"大世界","mutability":"big|small|free|locked|visual","current":"当前值","evidence":"证据（出现章节/频次）","candidates":["候选1","候选2"],"impact":"改了会影响什么","risk":"high|medium|low"}]}',
    'dimensions 至少覆盖以下维度（key/title）：realm 大世界、cultivation 修为体系、protagonist 主角、goldenFinger 金手指、supporting 配角与势力人物名、faction 势力/组织、style 文风与叙事、ending 结局走向、timeline 时间线/编年、foreshadow 伏笔/暗线。',
    'mutability 取值：locked=建议保留、big=可改影响大、small=可改影响小、free=可自由改、visual=仅视觉包装。',
    '每个 dimension.current 必须忠于文本，能引用原文就用原文（尤其角色名/境界名/势力名/金手指名）。',
    '重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。',
  ].join('\n')
  const textOut = await complete(ctx, config, {
    system,
    user: user + '\n\n' + sampleBodies.join('\n\n---\n\n'),
    temperature: 0.3,
    maxTokens: Math.max(config.maxTokens, 6000),
    reasoning: config.analysisReasoning ?? 'low',
  })
  const raw = parseJsonObject<{ bookName?: unknown; outline?: unknown; dimensions?: unknown }>(textOut)
  const bookName = typeof raw.bookName === 'string' ? raw.bookName.trim() : '未命名'
  const dims = Array.isArray(raw.dimensions)
    ? raw.dimensions
        .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
        .map(d => normalizeAdaptationDimension(d))
        .filter((d): d is AdaptationDimension => d !== null)
    : []
  // 反推大纲：独立 LLM 调用，从章节正文节选生成全书总纲（Markdown）。
  let outline: string | undefined
  try {
    outline = await reverseOutlineFromAdaptationText(ctx, config, chapters)
  } catch {
    outline = typeof raw.outline === 'string' && raw.outline.trim() !== '' ? raw.outline.trim() : undefined
  }
  return {
    bookName,
    chapters: chapters.length,
    outline,
    dimensions: dims,
    note: '基于节选分析（首/中/末取样）+ 反推大纲。如需逐章全文级深度分析请后续启用全文流式入口。',
  }
}

/** 校验并归一化一行的改编维度数据（来自 LLM）。 */
function normalizeAdaptationDimension(d: Record<string, unknown>): AdaptationDimension | null {
  const key = typeof d.key === 'string' ? d.key : ''
  const title = typeof d.title === 'string' ? d.title : ''
  if (key === '' || title === '') return null
  const mutability = (['locked', 'big', 'small', 'free', 'visual'] as const).includes(d.mutability as AdaptationDimension['mutability'])
    ? d.mutability as AdaptationDimension['mutability']
    : 'small'
  const risk = (['high', 'medium', 'low'] as const).includes(d.risk as AdaptationDimension['risk'])
    ? d.risk as AdaptationDimension['risk']
    : 'medium'
  return {
    key,
    title,
    mutability,
    current: typeof d.current === 'string' ? d.current : '',
    evidence: typeof d.evidence === 'string' ? d.evidence : undefined,
    candidates: Array.isArray(d.candidates) ? d.candidates.filter((x): x is string => typeof x === 'string') : [],
    impact: typeof d.impact === 'string' ? d.impact : '',
    risk,
  }
}

/** 从全文拆出的章节节选反推全书总纲（Markdown），用于改编 P0 的「反推大纲」。 */
async function reverseOutlineFromAdaptationText(
  ctx: Context,
  config: NovelConfig,
  chapters: Array<{ no: number; title: string; body: string }>,
): Promise<string> {
  // 均匀采样最多 20 章，每章正文前 600 字，控制成本。
  const n = chapters.length
  const sample: string[] = []
  const count = Math.min(n, 20)
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i * n) / count)
    const c = chapters[idx]
    if (c === undefined) continue
    sample.push('第' + c.no + '章《' + (c.title || '无题') + '》\n' + c.body.slice(0, 600))
  }
  const system = [
    '你是一位经验丰富的小说主编。根据下面若干章节的正文节选，反推出这本书的总纲（可作为后续改编与章节续写的骨架）。',
    '要求：',
    '1. 第一行写《书名》（可从正文推断，否则《未命名》）。',
    '2. 按故事弧线划分卷/部分：每卷给卷名与主旨（标注覆盖章节范围）。',
    '3. 对每章列出：章节号 + 标题 + 一句话核心情节。',
    '4. 最后给出：全书主线、主要人物弧线、已埋设待回收的伏笔清单。',
    '5. 输出纯文本 Markdown 结构（# 一级标题、## 二级标题、- 列表），不要寒暄，不要其他输出。',
  ].join('\n')
  const user = sample.join('\n\n---\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 6000), reasoning: config.analysisReasoning ?? 'low' })
  return text.trim()
}

/** 改编方案：由用户勾选的维度与新值，生成 LLM 映射表/规则/影响清单。 */
export async function proposeAdaptation(
  ctx: Context,
  config: NovelConfig,
  text: string,
  selections: Array<{ key: string; title: string; current: string; target: string; mutability: string }>,
  dimensions?: AdaptationDimension[],
): Promise<AdaptProposeResponse> {
  const selLines = selections.map(s => '- ' + s.title + '（' + s.key + '）：' + s.current + ' → ' + s.target).join('\n')
  const dimLines = (dimensions ?? []).map(d => '- ' + d.title + '：' + d.current + '（可改度：' + d.mutability + '，风险：' + d.risk + '）').join('\n')
  const system = '你是改编策划。'
  const user = [
    '下面给出改编决策：用户想改哪些维度、改成什么值。请生成一份可执行的「改编方案」。',
    '要求输出合法 JSON 对象：',
    '{"mappings": [{"source":"原值","target":"新值","scope":"name|realm|faction|term|other","note":"说明"}], "rules": {"preserve":["必须保留的要素"],"change":["允许改变的要素"],"constraints":["改编红线/一致性要求"]}, "impacts": [{"item":"受影响项","detail":"说明","risk":"high|medium|low","chapters":[章号]}]}',
    'mappings 需把用户确认的新值展开为「原→新」条目（如主角名/境界名/势力名/术语），并补充用户未填但关联的必改项（如改了修为体系名，相关的境界名一并列映射）。',
    'rules.preserve 至少包含：故事骨架、人物动机、伏笔逻辑、爽点结构。',
    'impacts 列出每个改动会影响的内容（术语/角色/章节/伏笔），能定位章号尽量定位；无法定位则给章节区间提示。',
    '重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。',
    '',
    '用户要改：',
    selLines,
    '',
    '原文可改矩阵（已分析）：',
    dimLines,
  ].join('\n')
  const out = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 6000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ mappings?: unknown; rules?: unknown; impacts?: unknown }>(out)
  const mappings = Array.isArray(raw.mappings)
    ? raw.mappings
        .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
        .map(m => normalizeAdaptationMapping(m))
        .filter((m): m is AdaptationMapping => m !== null)
    : []
  const rules = normalizeAdaptationRules(raw.rules)
  const impacts = Array.isArray(raw.impacts)
    ? raw.impacts
        .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
        .map(i => normalizeAdaptationImpact(i))
    : []
  return { proposal: { mappings, rules, impacts } }
}

/** 剧本术语替换执行：按映射表做精确替换并统计命中。 */
export function applyAdaptationReplacements(
  text: string,
  mappings: AdaptationMapping[],
): { adaptedText: string; hits: Array<{ source: string; target: string; count: number }> } {
  const seen = new Set<string>()
  const unique = mappings.filter(m => {
    const s = m.source.trim()
    if (s === '' || s === m.target.trim()) return false
    if (seen.has(s)) return false
    seen.add(s)
    return true
  }).sort((a, b) => b.source.length - a.source.length)
  let adapted = text
  const hits: Array<{ source: string; target: string; count: number }> = []
  for (const m of unique) {
    const count = adapted.split(m.source).length - 1
    if (count > 0) adapted = adapted.split(m.source).join(m.target)
    hits.push({ source: m.source, target: m.target, count })
  }
  return { adaptedText: adapted, hits }
}

/** 校验归一化一条映射（来自 LLM）。 */
function normalizeAdaptationMapping(m: Record<string, unknown>): AdaptationMapping | null {
  const source = typeof m.source === 'string' ? m.source.trim() : ''
  const target = typeof m.target === 'string' ? m.target.trim() : ''
  if (source === '' || target === '') return null
  const scope = (['name', 'realm', 'faction', 'term', 'other'] as const).includes(m.scope as AdaptationMapping['scope'])
    ? m.scope as AdaptationMapping['scope']
    : 'other'
  return { source, target, scope, note: typeof m.note === 'string' ? m.note : undefined }
}

/** 校验归一化改编规则（来自 LLM）。 */
function normalizeAdaptationRules(r: unknown): AdaptationRules {
  const obj = typeof r === 'object' && r !== null ? r as Record<string, unknown> : {}
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return { preserve: arr(obj.preserve), change: arr(obj.change), constraints: arr(obj.constraints) }
}

/** 校验归一化一条影响项（来自 LLM）。 */
function normalizeAdaptationImpact(i: Record<string, unknown>): { item: string; detail: string; risk: 'high' | 'medium' | 'low'; chapters?: number[] } {
  const risk = (['high', 'medium', 'low'] as const).includes(i.risk as 'high' | 'medium' | 'low') ? i.risk as 'high' | 'medium' | 'low' : 'medium'
  const chapters = Array.isArray(i.chapters) ? i.chapters.filter((x): x is number => typeof x === 'number') : undefined
  return {
    item: typeof i.item === 'string' ? i.item : '',
    detail: typeof i.detail === 'string' ? i.detail : '',
    risk,
    chapters: chapters !== undefined && chapters.length > 0 ? chapters : undefined,
  }
}

/** 改编模式 rewrite：逐章 LLM 重写（结构性改写，不只是换词）。
 * @returns 改写后的全文 + 逐章结果 + 保留原章的章号。 */
export async function rewriteAdaptationBook(
  ctx: Context,
  config: NovelConfig,
  text: string,
  mappings: AdaptationMapping[],
  rules?: AdaptationRules,
  options: { maxChapters?: number; startNo?: number; endNo?: number; onProgress?: (info: { completed: number; total: number; no: number; title: string }) => void } = {},
): Promise<{ adaptedText: string; rewritten: Array<{ no: number; title: string; chars: number }>; skipped: number[]; hits: Array<{ source: string; target: string; count: number }> }> {
  const chapters = splitBookText(text).filter(c => c.body.length >= 50)
  if (chapters.length === 0) throw new Error('未能从全文拆出章节（内容过短或无章节结构）')
  const startNo = options.startNo ?? 1
  const endNo = options.endNo ?? 0
  const inWindow = (c: { no: number }): boolean => c.no >= startNo && (endNo <= 0 || c.no <= endNo)
  const windowChapters = chapters.filter(inWindow)
  const cap = options.maxChapters !== undefined && options.maxChapters > 0 ? Math.min(options.maxChapters, windowChapters.length) : windowChapters.length
  const toRewrite = windowChapters.slice(0, cap)
  const toRewriteNos = new Set(toRewrite.map(c => c.no))
  const total = toRewrite.length
  let completed = 0
  const mappingBlock = mappings.length > 0
    ? '映射表（原值 → 新值）：\n' + mappings.map(m => `- ${m.source} → ${m.target}（${m.scope}）${m.note !== undefined && m.note !== '' ? '：' + m.note : ''}`).join('\n')
    : ''
  const ruleBlock = rules !== undefined
    ? [
        rules.preserve.length > 0 ? '必须保留：\n' + rules.preserve.map(x => `- ${x}`).join('\n') : '',
        rules.change.length > 0 ? '允许改变：\n' + rules.change.map(x => `- ${x}`).join('\n') : '',
        rules.constraints.length > 0 ? '改编红线/一致性要求：\n' + rules.constraints.map(x => `- ${x}`).join('\n') : '',
      ].filter(s => s !== '').join('\n')
    : ''
  const system = [
    '你是一位资深网文改编编剧。你会收到某一章的正文，以及本书的改编映射表与改编规则。',
    '任务：把这一章按改编方案**重写**成新版本（结构性改编，不只是换词）。',
    '要求：',
    '1. 严格遵守映射表（原值→新值），正文中所有源值都要替换为新值；涉及改名/改体系/改势力时，相关表述一起调整，使上下文自洽。',
    '2. 改编规则：必须保留的内容不得破坏（故事骨架/人物动机/伏笔逻辑/爽点结构）；允许改变的内容可以放开调整；红线/一致性要求必须遵守。',
    '3. 若某个改动牵动叙事（如结局走向/时间线/世界观），要把这章的叙述顺势改得通顺、可信。',
    '4. 输出**只包含这一章重写后的正文**，不要重复标题，不要任何解释、开头或结尾。',
    '5. 字数与原章基本相当（允许 ±20%）。',
  ].join('\n')
  const adaptedParts: string[] = []
  const rewritten: Array<{ no: number; title: string; chars: number }> = []
  const skipped: number[] = []
  const hits = applyAdaptationReplacements(text, mappings).hits
  for (const c of chapters) {
    const title = (applyAdaptationMappings(c.title, mappings) || c.title)
    if (!toRewriteNos.has(c.no)) {
      adaptedParts.push('# 第' + c.no + '章 ' + title + '\n\n' + c.body.trim() + '\n')
      continue
    }
  const user = [
      mappingBlock,
      ruleBlock,
      '第 ' + c.no + ' 章《' + c.title + '》：',
      c.body,
    ].filter(s => s !== '').join('\n\n')
    let body = ''
    try {
      const out = await complete(ctx, config, {
        system,
        user,
        temperature: 0.7,
        maxTokens: Math.max(config.maxTokens, Math.min(16000, c.body.length * 3)),
        reasoning: config.analysisReasoning ?? 'low',
      })
      body = stripRewriteHeading(out)
      if (body.length < 50) body = ''
    } catch {
      body = ''
    }
    if (body === '') {
      skipped.push(c.no)
      body = c.body
    }
    adaptedParts.push('# 第' + c.no + '章 ' + title + '\n\n' + body.trim() + '\n')
    rewritten.push({ no: c.no, title, chars: body.length })
    completed++
    options.onProgress?.({ completed, total, no: c.no, title })
  }
  return { adaptedText: adaptedParts.join('\n'), rewritten, skipped, hits }
}

/** 去掉 LLM 输出可能带上的 Markdown 标题行。 */
function stripRewriteHeading(out: string): string {
  return out.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n').trim()
}

/**
 * 改编模式 P3：从源全文 + 用户编辑后的改编方案，提炼新书资料并保存为「待写新书」。
 * 流程：源文导入临时项目 → 复用 extractBible/extractRoles/extractWorld 提炼 →
 * 按映射表把术语/人名/势力映射到新书命名层 → planVolumes/planChapters 生成待写计划 → 保存。
 * @returns 提炼后的新书资料（不含书架 book，由路由负责登记书架）。
 */
export async function materializeAdaptedBook(
  ctx: Context,
  config: NovelConfig,
  args: Omit<AdaptMaterializeRequest, 'outputDir'> & { outputDir: string },
): Promise<Omit<AdaptMaterializeResponse, 'book'>> {
  const bookName = (args.bookName ?? '').trim().slice(0, 40) || '改编新书'
  const outDir = (args.outputDir ?? '').trim()
  if (outDir === '') throw new Error('未指定新书输出目录')
  const mappings = args.proposal?.mappings ?? []
  // 源文导入临时项目（复用角色/道藏/世界提炼：这些函数读取 config.outputDir 下的章节文件）。
  const tmpDir = join(tmpdir(), 'dsh-novel-forge-adapt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8))
  try {
    importBookTextFromText(args.text, tmpDir, bookName)
    const sourceProject = loadProject(tmpDir)
    if (sourceProject === undefined) throw new Error('临时项目创建失败')
    const sourceConfig: NovelConfig = { ...config, outputDir: tmpDir }

    // 源书道藏 + 角色库 + 大世界。
    // 注意：extractWorld/extractRoles 内部读取 project.outline，所以要先把源文大纲写进临时项目。
    const srcOutline = (args.outline ?? '').trim() !== '' ? (args.outline ?? '').trim() : fallbackSourceOutline(sourceProject)
    sourceProject.outline = srcOutline
    let bible = await extractBible(ctx, sourceConfig, srcOutline, sourceProject)
    sourceProject.bible = bible
    const roles = await extractRoles(ctx, sourceConfig, sourceProject)
    const world = await extractWorld(ctx, sourceConfig, sourceProject)

    // 映射到新书命名/术语层（骨架/伏笔/红线保留）。
    const adaptedOutline = applyAdaptationMappings(srcOutline, mappings)
    bible = applyMappingsToBible(bible, mappings)
    const adaptedRoles = applyMappingsToRoles(roles, mappings)
    const adaptedWorld = applyMappingsToWorld(world, mappings)

    // 组装待写新书项目。
    const project = createProject(bookName)
    project.bookName = bookName
    project.outline = adaptedOutline
    project.bible = bible
    project.roles = adaptedRoles
    project.world = adaptedWorld
    project.volumes = await planVolumes(ctx, config, adaptedOutline)
    const chapterCount = Math.max(1, Math.min(args.chapterCount ?? 30, 500))
    project.chapters = await planChapters(ctx, config, project, chapterCount)

    // 不在此落盘：返回材料供前端预览/微调，随后由「保存为新书」接口写入。
    return {
      bookName,
      outline: adaptedOutline,
      bible,
      roles: adaptedRoles,
      world: adaptedWorld,
      volumes: project.volumes ?? [],
      chapters: project.chapters,
      outputDir: outDir,
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* 清理失败忽略 */ }
  }
}

/** 把预览/微调后的新书资料写入输出目录并返回摘要（书架登记由路由负责）。 */
export function saveMaterializedBook(
  outDir: string,
  bookName: string,
  data: Omit<AdaptMaterializeSaveRequest, 'bookName' | 'outputDir'>,
): Omit<AdaptMaterializeSaveResponse, 'book'> {
  const project = createProject(bookName)
  project.bookName = bookName
  project.outline = data.outline
  project.bible = data.bible
  project.roles = data.roles
  project.world = data.world
  project.volumes = data.volumes
  project.chapters = data.chapters
  saveProject(outDir, project)
  return { bookName, chapters: data.chapters.length, outputDir: outDir }
}

/** 把一份文本按映射表做全局替换（复用术语替换执行器）。 */
function applyAdaptationMappings(text: string, mappings: AdaptationMapping[]): string {
  return applyAdaptationReplacements(text, mappings).adaptedText
}

/** 改编道藏：把人名/术语/势力按映射表替换。 */
function applyMappingsToBible(bible: StoryBible, mappings: AdaptationMapping[]): StoryBible {
  const t = (s: string): string => applyAdaptationMappings(s, mappings)
  return {
    ...bible,
    genre: t(bible.genre),
    worldRules: bible.worldRules.map(t),
    redLines: bible.redLines.map(t),
    style: bible.style.map(t),
    characters: bible.characters.map(c => ({ ...c, name: t(c.name), traits: c.traits.map(t), goals: t(c.goals), relations: t(c.relations), knowledge: c.knowledge?.map(t) })),
  }
}

/** 改编角色库：把人名/身份/标签/关系/成长/知情度按映射表替换。 */
function applyMappingsToRoles(roles: RoleRecord[], mappings: AdaptationMapping[]): RoleRecord[] {
  const t = (s: string): string => applyAdaptationMappings(s, mappings)
  return roles.map(role => ({
    ...role,
    name: t(role.name),
    identity: t(role.identity),
    traits: role.traits.map(t),
    goals: t(role.goals),
    relations: role.relations.map(t),
    arc: role.arc.map(t),
    knowledge: role.knowledge.map(t),
    imagePrompt: role.imagePrompt !== undefined
      ? { ...role.imagePrompt, zh: t(role.imagePrompt.zh), en: t(role.imagePrompt.en), tags: role.imagePrompt.tags.map(t), source: role.imagePrompt.source !== undefined ? t(role.imagePrompt.source) : undefined }
      : undefined,
    expressions: role.expressions?.map(t),
    promptKit: role.promptKit !== undefined
      ? {
        ...role.promptKit,
        portrait: role.promptKit.portrait !== undefined ? { ...role.promptKit.portrait, zh: t(role.promptKit.portrait.zh), en: t(role.promptKit.portrait.en) } : undefined,
        sheet: role.promptKit.sheet !== undefined ? { ...role.promptKit.sheet, zh: t(role.promptKit.sheet.zh), en: t(role.promptKit.sheet.en) } : undefined,
        expressions: role.promptKit.expressions !== undefined ? role.promptKit.expressions.map(e => ({ ...e, zh: t(e.zh), en: t(e.en) })) : undefined,
        details: role.promptKit.details !== undefined ? { ...role.promptKit.details, zh: t(role.promptKit.details.zh), en: t(role.promptKit.details.en) } : undefined,
      }
      : undefined,
  }))
}

/** 改编大世界：境界/区域/势力名按映射表替换。 */
function applyMappingsToWorld(world: WorldState, mappings: AdaptationMapping[]): WorldState {
  const t = (s: string): string => applyAdaptationMappings(s, mappings)
  return {
    realms: world.realms.map(x => ({ name: t(x.name), description: t(x.description) })),
    regions: world.regions.map(x => ({ name: t(x.name), description: t(x.description), faction: x.faction !== undefined ? t(x.faction) : undefined })),
    factions: world.factions.map(x => ({ name: t(x.name), kind: t(x.kind), description: t(x.description), region: x.region !== undefined ? t(x.region) : undefined })),
  }
}

/** 反推大纲缺失时的兜底：用源书章节标题占位（可到工作区重新生成）。 */
function fallbackSourceOutline(project: ProjectState): string {
  const heads = project.chapters.map(c => `第${c.no}章《${c.title}》：${c.beats !== undefined && c.beats !== '' ? c.beats : ''}`).join('\n')
  return `# 《${project.bookName}》\n\n（反推大纲缺失，以下为章节标题占位，可在小说工坊重新生成大纲。）\n\n${heads}`
}

/**
 * 摘要 + 事实抽取合并为一次 LLM 调用（省一次调用与一次正文输入，
 * 批量生成时整体开销约省 25%）。
 * @returns 摘要与新增事实条数（失败返回空，调用方 best-effort）。
 */

/**
 * 事实库去重：新事实加入前检查与已有事实的相似度，
 * 状态类事实（如"主角受伤"→"主角痊愈"）覆盖旧状态。
 */
function dedupAndAddFacts(project: ProjectState, chapterNo: number, newFacts: string[]): number {
  const list = project.facts ?? []
  const existingTexts = new Set(list.map(f => f.text))
  let added = 0
  for (const fact of newFacts.slice(0, 8)) {
    if (existingTexts.has(fact)) continue
    const isDuplicate = list.some(f => {
      const a = f.text.slice(0, 30)
      const b = fact.slice(0, 30)
      if (a.length === 0 || b.length === 0) return false
      let common = 0
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) common++
      return common / Math.max(a.length, b.length) > 0.7
    })
    if (isDuplicate) continue
    list.push({ chapterNo, text: fact })
    existingTexts.add(fact)
    added++
  }
  project.facts = list.slice(-300)
  return added
}
export async function summarizeAndExtractFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<{ summary: string; factCount: number }> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return { summary: '', factCount: 0 }
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return { summary: '', factCount: 0 }
  const system = [
    '你是一位网文编辑。请为下面一章做两件事，输出合法 JSON 对象：',
    '{"summary": "120-200字摘要，含关键事件/主角状态变化（境界资源伤势心境）/新增伏笔线索/角色关系变化，客观陈述不评价", "facts": ["已确立事实1", "…3-6条"]}',
    'facts 指：本章明确写出的、对后续有约束力的事实——人物当前状态、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 5000) })
  const raw = parseJsonObject<{ summary?: unknown; facts?: unknown }>(text)
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : ''
  const factLines = Array.isArray(raw.facts)
    ? raw.facts
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 8)
        .map(v => v.trim().slice(0, 140))
    : []
  if (summary !== '') chapter.summary = summary
  const added = dedupAndAddFacts(project, chapterNo, factLines)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return { summary, factCount: factLines.length }
}

/**
 * 伏笔落地标记：检查刚生成的章节正文是否埋下了 planned 伏笔（关键词匹配），
 * 命中则将该伏笔标记为 planted 并记录 plantedChapter——保证暗线管理页与正文同步。
 * 纯关键词粗匹配，宁缺毋滥：仅处理「描述含可辨识关键词」的伏笔，无把握则不标。
 */
export function markForeshadowPlanted(
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): number {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return 0
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return 0
  let marked = 0
  for (const f of project.foreshadows ?? []) {
    if (f.status !== 'planned') continue
    if (f.plantedChapter !== undefined) continue
    // 从描述中提取关键词：书名号/引号内容优先（专有名词），否则取 2-4 字名词片段。
    const quoted = f.description.match(/[「“『《]([^」”』》]{2,12})[」”』》]/g)
    const keywords = (quoted !== null ? quoted : [])
      .map(q => q.slice(1, -1))
      .filter(k => k.length >= 2)
    // 无引号关键词时，退而求其次：用「本章附近注入过该伏笔」的信号（targetChapter 接近当前章）。
    const nearTarget = f.targetChapter !== undefined && Math.abs(f.targetChapter - chapterNo) <= 12
    if (keywords.length === 0 && !nearTarget) continue
    const hit = keywords.length === 0
      ? false
      : keywords.some(k => body.includes(k))
    if (hit || (keywords.length === 0 && nearTarget)) {
      // 命中或（无关键词但恰好在目标章附近被注入埋点要求）→ 保守起见，只有明确命中才标记。
      if (hit) {
        f.status = 'planted'
        f.plantedChapter = chapterNo
        marked++
      }
    }
  }
  if (marked > 0) {
    project.updatedAt = new Date().toISOString()
    saveProject(outputDir, project)
  }
  return marked
}

/**
 * 抽取本章「已确立事实」追加到事实库/时间线（最多 300 条，最新优先）。
 * 事实注入后续章节生成提示词，保证人物状态/境界/资源/关系长期一致。
 * @returns 新增事实条数（失败返回 0，调用方 best-effort）。
 */
export async function extractFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<number> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return 0
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return 0
  const system = [
    '你是一位网文编辑。请从本章正文中抽取「已确立事实」，供后续章节保持一致。',
    '事实指：人物当前状态（境界/修为/伤势/资源/心境）、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。',
    '要求：',
    '1. 只抽取本章明确写出的、对后续有约束力的内容；纯心理活动与无关细节不要。',
    '2. 每行一条事实，用客观陈述句，不含主观评价。',
    '3. 输出 3-6 条，每行一条，不要编号、不要前缀、不要解释。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  // v4-flash 推理模型：reasoning channel 也占 maxTokens，预算给足避免截断。
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 4000) })
  const lines = text.split('\n')
    .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(line => line.length > 8)
    .slice(0, 8)
  if (lines.length === 0) return 0
  const facts = project.facts ?? []
  for (const line of lines) facts.push({ chapterNo, text: line.slice(0, 140) })
  project.facts = facts.slice(-300)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return lines.length
}

// ------------------------------------------------------------ book audit

const AUDIT_BATCH_SIZE = 10

/** 单批质检：设定 + 事实库 + 该批章节节选 → 矛盾清单。 */
async function auditBatch(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  batch: ChapterPlan[],
): Promise<AuditIssue[]> {
  const system = [
    '你是一位严谨的网文连续性审校编辑。你会收到一本小说的道藏、事实库和一批章节正文节选。',
    '请找出这批章节中的一致性矛盾，例如：',
    '- 人物状态冲突：境界/修为/伤势/资源在同一章内或跨章前后矛盾。',
    '- 设定违背：正文与世界观规则、金手指规则、写作红线冲突。',
    '- 时间线错乱：事件顺序、时间跨度、地点移动不合逻辑。',
    '- 细节穿帮：人名/地名/物品/数字前后不一致。',
    '要求：',
    '1. 只报告有实质证据的矛盾，不要泛泛而谈写作质量问题。',
    '2. 每条必须定位到具体章节号。',
    '3. 输出必须是合法 JSON 数组，格式：[{"chapterNo": 章节号, "severity": "high|medium|low", "item": "矛盾描述", "suggestion": "修改建议"}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const factsBlock = (project.facts ?? []).slice(-60).map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')
  const chapterBlocks = batch.map(c => {
    const body = readChapterFile(outputDir, c)
    const excerpt = (body ?? '').replace(/^#\s+.*$/m, '').trim().slice(0, 700)
    return `【第${c.no}章《${c.title}》】\n${excerpt}`
  }).join('\n\n')
  const user = [
    '请对以下小说做一致性质检。',
    project.bible !== undefined
      ? '道藏：\n' + [
          project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map(r => `- ${r}`).join('\n')}` : '',
          project.bible.redLines.length > 0 ? `写作红线：\n${project.bible.redLines.map(r => `- ${r}`).join('\n')}` : '',
          project.bible.characters.length > 0 ? `角色：\n${project.bible.characters.map(ch => `- ${ch.name}（${ch.traits.join('、')}）`).join('\n')}` : '',
        ].filter(s => s !== '').join('\n')
      : '',
    factsBlock !== '' ? `已确立事实库：\n${factsBlock}` : '',
    `正文节选（每章前 700 字）：\n${chapterBlocks}`,
    '只输出 JSON 数组。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const issues: AuditIssue[] = []
  for (const entry of parsed) {
    const item = typeof entry.item === 'string' ? entry.item : ''
    if (item === '') continue
    issues.push({
      chapterNo: Number(entry.chapterNo) || 0,
      severity: ['high', 'medium', 'low'].includes(entry.severity as string)
        ? entry.severity as AuditIssue['severity']
        : 'medium',
      item,
      suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
    })
  }
  return issues
}

/** 全书一致性质检：LLM 分批扫描已生成章节 + 设定 + 事实库，聚合矛盾清单。 */
export async function auditBook(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  onProgress?: (completedBatches: number, totalBatches: number) => void,
): Promise<AuditIssue[]> {
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  if (written.length === 0) {
    onProgress?.(0, 0)
    return []
  }
  // 分批：每批 AUDIT_BATCH_SIZE 章，避免超长后单次爆上下文。
  const totalBatches = Math.ceil(written.length / AUDIT_BATCH_SIZE)
  const all: AuditIssue[] = []
  onProgress?.(0, totalBatches)
  for (let i = 0; i < written.length; i += AUDIT_BATCH_SIZE) {
    const batch = written.slice(i, i + AUDIT_BATCH_SIZE)
    try {
      all.push(...await auditBatch(ctx, config, project, outputDir, batch))
    } catch { /* 单批失败不阻断其余批次 */ }
    onProgress?.(Math.min(Math.ceil((i + AUDIT_BATCH_SIZE) / AUDIT_BATCH_SIZE), totalBatches), totalBatches)
  }
  return all.slice(0, 50)
}

/** 小说简介：AI 生成或按已写开头补全（面向读者的作品门面）。 */
export async function generateBlurb(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  partial = '',
): Promise<string> {
  const system = [
    '你是一位网文平台编辑，擅长写抓人的作品简介。',
    '要求：',
    '1. 120-250 字，突出核心卖点（金手指/题材/爽点/人设反差），用一两句抛出开局钩子。',
    '2. 不剧透结局与关键反转；语气贴合题材（热血/悬疑/轻松/虐心）。',
    '3. 中文，直接输出简介正文，不要 Markdown、不要引号包裹、不要「简介：」前缀。',
  ].join('\n')
  const genreBlock = project.bible?.genre !== undefined ? `题材：${project.bible.genre}` : ''
  const volumeBlock = (project.volumes ?? []).slice(0, 3).map(v => v.title).join('、')
  const user = [
    `书名：《${project.bookName}》`,
    genreBlock,
    volumeBlock !== '' ? `卷结构：${volumeBlock}` : '',
    `已写章节数：${project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating').length}`,
    '大纲节选：\n' + project.outline.slice(0, 2500),
    partial.trim() !== ''
      ? `已有开头草稿（请保留其内容与语气，续写补全为完整简介）：\n${partial.trim()}`
      : '请全量生成一份完整简介。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.7, maxTokens: Math.max(config.maxTokens, 4000), reasoning: config.analysisReasoning ?? 'low' })
  const blurb = text.replace(/^["'「『]|["'」』]$/g, '').replace(/^简介[：:]\s*/, '').trim().slice(0, 600)
  return blurb
}

// ---------------------------------------------------------------- world

/**
 * 组装全书上下文包（AI 助手 book_overview 工具）。
 * 分片策略：章节要点默认只给最近 30 章（避免超长后爆上下文）；
 * scope='full' 全量；scope=数字 只给该卷章节。
 */
export function bookOverview(project: ProjectState, scope: 'recent' | 'full' | number = 'recent'): string {
  const s: string[] = []
  s.push(`书名：${project.bookName}`)
  s.push(`【大纲全文】\n${project.outline}`)
  if (project.bible !== undefined) {
    const bible = project.bible
    s.push('【道藏】')
    if (bible.genre !== '') s.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) s.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      s.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        s.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) s.push('写作红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) s.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  const worldBlock = renderWorld(project.world)
  if (worldBlock !== '') s.push(worldBlock)
  if (project.volumes !== undefined && project.volumes.length > 0) {
    s.push('【卷结构】')
    for (const v of project.volumes) {
      s.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)
    }
  }
  if (project.chapters.length > 0) {
    // 分片：默认最近 30 章；full 全量；数字 = 指定卷。
    const maxNo = project.chapters.reduce((m, c) => Math.max(m, c.no), 0)
    const shown = project.chapters.filter(c => {
      if (scope === 'full') return true
      if (typeof scope === 'number') return c.volume === scope
      return c.no > Math.max(0, maxNo - 30)
    })
    const label = scope === 'full' ? '全部章节（标题/状态/剧情要点/摘要）' : typeof scope === 'number' ? `第 ${scope} 卷章节（标题/状态/剧情要点/摘要）` : `最近 ${shown.length} 章（标题/状态/剧情要点/摘要）`
    s.push(`【${label}】`)
    const statusText: Record<string, string> = { pending: '待生成', generating: '生成中', written: '待审稿', reviewing: '审稿中', approved: '已通过', rejected: '待修订', error: '失败' }
    for (const c of shown) {
      s.push(`第${c.no}章《${c.title}》[${statusText[c.status] ?? c.status}]${c.chars !== undefined ? ` ${c.chars}字` : ''}\n剧情要点：${c.beats}\n摘要：${c.summary ?? '无'}`)
    }
    if (scope !== 'full' && project.chapters.length > shown.length) {
      s.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 scope=volume:N 查看指定卷）`)
    }
  }
  if ((project.facts ?? []).length > 0) {
    s.push('【事实库（最近 40 条；更多用 facts_query 检索）】')
    for (const f of (project.facts ?? []).slice(-40)) {
      s.push(`- [第${f.chapterNo}章] ${f.text}`)
    }
  }
  if (project.foreshadows.length > 0) {
    s.push('【伏笔】')
    for (const f of project.foreshadows) {
      s.push(`- [${f.status}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  if (project.blurb !== undefined && project.blurb !== '') s.push(`【小说简介】${project.blurb}`)
  return s.join('\n\n')
}

/** 一条影响分析结果（改动波及处）。 */
export interface ImpactItem {
  /** 位置：章节号 / 大纲 / 道藏 / 大世界 / 事实库 / 简介。 */
  location: string
  /** 原文片段（定位用）。 */
  quote: string
  /** 修改建议。 */
  suggestion: string
  /** must = 必须同步改；optional = 建议改；note = 备注（如保留旧称作古称）。 */
  kind: 'must' | 'optional' | 'note'
}

/**
 * 影响分析：LLM 扫描全书（大纲/设定/大世界/事实库/已写章节），
 * 定位一次改动波及的所有位置。助手在修改后主动调用，做连锁维护。
 */
export async function analyzeImpact(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  change: string,
): Promise<ImpactItem[]> {
  const system = [
    '你是一位网文一致性审校。作者要做一处修改，请找出这次改动会波及的所有位置（设定、大纲、已写章节正文、事实库、简介中可能因此过时或矛盾的内容）。',
    '输出必须是合法 JSON 数组，格式：[{"location": "位置（第N章/大纲/道藏-世界规则/大世界-境界/事实库/简介）", "quote": "原文片段（20-60字）", "suggestion": "修改建议", "kind": "must|optional|note"}]',
    'kind 含义：must=必须同步改否则矛盾；optional=建议改（影响观感）；note=备注（如旧称保留为古称、或无需改但需知晓）。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  // 轻量 base：大纲节选 + 道藏要点 + 编年录最近 40 条（替代全量 bookOverview，
  // 定位主要靠各批章节节选原文）。
  const base = [
    `要做的修改：${change}`,
    '以下为全书设定与规则要点（章节为分批节选）：',
    `大纲节选：\n${project.outline.slice(0, 2000)}`,
    project.bible !== undefined
      ? `道藏：${project.bible.worldRules.length} 条世界规则 / ${project.bible.redLines.length} 条红线 / 人物 ${project.bible.characters.map(c => c.name).join('、')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录最近 40 条：\n${(project.facts ?? []).slice(-40).map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')}`
      : '',
  ].filter(s => s !== '').join('\n\n')
  const items: ImpactItem[] = []
  // 分批扫描章节正文（每批 8 章），聚合影响清单，避免超长后爆上下文。
  const IMPACT_BATCH_SIZE = 8
  for (let i = 0; i < written.length; i += IMPACT_BATCH_SIZE) {
    const batch = written.slice(i, i + IMPACT_BATCH_SIZE)
    const chapterBlock = batch.map(c => {
      const body = readChapterFile(outputDir, c)
      const excerpt = (body ?? '').replace(/^#\s+.*$/m, '').trim().slice(0, 500)
      return `【第${c.no}章《${c.title}》】\n${excerpt}`
    }).join('\n\n')
    const user = `${base}\n\n本批章节（第 ${batch[0]!.no}-${batch[batch.length - 1]!.no} 章）：\n${chapterBlock}\n\n只输出 JSON 数组。`
    try {
      const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 12000) })
      for (const entry of parseJsonArray<Record<string, unknown>>(text)) {
        const quote = typeof entry.quote === 'string' ? entry.quote.trim() : ''
        if (quote === '') continue
        items.push({
          location: typeof entry.location === 'string' ? entry.location : '未定位',
          quote: quote.slice(0, 120),
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
          kind: entry.kind === 'must' || entry.kind === 'optional' || entry.kind === 'note' ? entry.kind : 'optional',
        })
      }
    } catch { /* 单批失败不阻断其余批次 */ }
  }
  return items.slice(0, 30)
}

/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
export function renderWorld(world: WorldState | undefined): string {
  if (world === undefined) return ''
  const sections: string[] = ['==================== 大世界（结构化设定，写作时严格遵守） ====================']
  if (world.realms.length > 0) {
    sections.push('境界体系（由低到高，不得随意跳级或自创境界）：')
    world.realms.forEach((realm, i) => {
      sections.push(`${i + 1}. ${realm.name}${realm.description !== '' ? ` — ${realm.description}` : ''}`)
    })
  }
  if (world.regions.length > 0) {
    sections.push('地理区域：')
    for (const region of world.regions) {
      sections.push(`- ${region.name}${region.description !== '' ? `：${region.description}` : ''}${region.faction !== undefined && region.faction !== '' ? `（势力：${region.faction}）` : ''}`)
    }
  }
  if (world.factions.length > 0) {
    sections.push('势力分布：')
    for (const faction of world.factions) {
      sections.push(`- ${faction.name}（${faction.kind}）${faction.description !== '' ? `：${faction.description}` : ''}${faction.region !== undefined && faction.region !== '' ? `（驻地：${faction.region}）` : ''}`)
    }
  }
  return sections.join('\n')
}

/** AI 提炼大世界：从大纲 + 道藏生成结构化境界体系/区域/势力。 */
export async function extractWorld(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<WorldState> {
  const system = [
    '你是一位网文世界观架构师。请根据小说大纲与道藏，提炼结构化「大世界」数据。',
    '输出必须是合法 JSON 对象：',
    '{"realms": [{"name": "境界名", "description": "突破条件/寿命/标志等"}], "regions": [{"name": "区域名", "description": "描述", "faction": "关联势力名或空"}], "factions": [{"name": "势力名", "kind": "宗门/家族/王朝/组织等", "description": "描述", "region": "驻地区域或空"}]}',
    '要求：',
    '1. realms 按由低到高顺序排列（修仙题材必须含完整境界链；无境界设定的题材可输出空数组）。',
    '2. 数量贴合大纲：realms 3-12 个，regions 2-10 个，factions 2-10 个。',
    '3. 内容严格来自大纲与道藏，不要凭空发明与大纲冲突的设定。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const bibleBlock = project.bible !== undefined
    ? [
        project.bible.genre !== '' ? `题材：${project.bible.genre}` : '',
        project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map(r => `- ${r}`).join('\n')}` : '',
      ].filter(s => s !== '').join('\n')
    : ''
  const user = [
    '请为这部小说提炼大世界数据。',
    `书名：《${project.bookName}》`,
    bibleBlock !== '' ? bibleBlock : '',
    '大纲：\n' + project.outline.slice(0, 5000),
    '只输出 JSON 对象。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
  const raw = parseJsonObject<{ realms?: unknown; regions?: unknown; factions?: unknown }>(text)
  const str = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
  const objArray = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : []
  const world: WorldState = {
    realms: objArray(raw.realms).map(entry => ({
      name: str(entry.name).slice(0, 20) || '未命名境界',
      description: str(entry.description).slice(0, 200),
    })).filter(r => r.name !== '未命名境界' || r.description !== ''),
    regions: objArray(raw.regions).map(entry => ({
      name: str(entry.name).slice(0, 30) || '未命名区域',
      description: str(entry.description).slice(0, 200),
      faction: str(entry.faction).slice(0, 30),
    })).filter(r => r.name !== '未命名区域' || r.description !== ''),
    factions: objArray(raw.factions).map(entry => ({
      name: str(entry.name).slice(0, 30) || '未命名势力',
      kind: str(entry.kind).slice(0, 20) || '组织',
      description: str(entry.description).slice(0, 200),
      region: str(entry.region).slice(0, 30),
    })).filter(f => f.name !== '未命名势力' || f.description !== ''),
  }
  return world
}

/**
 * 事实库回填：对历史已生成章节批量抽取事实（无事实记录的旧章节）。
 * @returns 回填的章节数。
 */
export async function backfillFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
): Promise<number> {
  const have = new Set((project.facts ?? []).map(f => f.chapterNo))
  let filled = 0
  for (const chapter of project.chapters) {
    if (chapter.status === 'pending' || chapter.status === 'generating') continue
    if (chapter.file === undefined || have.has(chapter.no)) continue
    try {
      const n = await extractFacts(ctx, config, project, outputDir, chapter.no)
      if (n > 0) filled++
    } catch { /* best-effort per chapter */ }
    have.add(chapter.no)
  }
  return filled
}

/**
 * 角色卡刷新：出场统计由服务端从正文精确计算（角色名出现过的章节数、
 * 最近出现章节），LLM 只负责聚合「当前状态」一句话。
 */
export async function refreshCharacters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
): Promise<RoleStatusCard[]> {
  // 名单优先用角色库（主表）；无角色库时退回道藏角色卡。
  const rawRoster = (((project.roles ?? []).length > 0 ? project.roles : project.bible?.characters) ?? []) as Array<{ name: string; traits?: string[]; role?: string; roleLabel?: string }>
  const roster = rawRoster.map(r => ({
    name: r.name,
    traits: r.traits ?? [],
    role: r.roleLabel !== undefined ? r.roleLabel : (r.role ?? 'other'),
  }))
  const facts = project.facts ?? []
  if (roster.length === 0 && facts.length === 0) return []

  // 服务端精确出场统计：遍历已写章节正文，统计每个角色名出现过的章节。
  const stat = new Map<string, { chapters: Set<number>; last: number }>()
  const known = roster.map(card => card.name)
  for (const chapter of project.chapters) {
    if (chapter.status === 'pending' || chapter.status === 'generating') continue
    const body = readChapterFile(outputDir, chapter)
    if (body === undefined) continue
    for (const name of known) {
      if (body.includes(name)) {
        const entry = stat.get(name) ?? { chapters: new Set<number>(), last: 0 }
        entry.chapters.add(chapter.no)
        if (chapter.no > entry.last) entry.last = chapter.no
        stat.set(name, entry)
      }
    }
  }

  // LLM 只聚合状态：名单（含 traits）+ 事实库 → [{name, status}]
  let statuses = new Map<string, string>()
  if (facts.length > 0) {
    const system = [
      '你是一位网文角色档案管理员。请根据「角色名单」与「已确立事实库」，为每个角色输出「当前状态」一句话（境界/修为/伤势/资源/心境）。',
      '输出必须是合法 JSON 数组，格式：[{"name": "角色名", "status": "当前状态一句话"}]',
      '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    ].join('\n')
    const rosterBlock = roster.map(ch => `- ${ch.name}（${ch.traits.join('、')}）`).join('\n')
    const factsBlock = facts.map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')
  const user = [
      `角色名单：\n${rosterBlock}`,
      `已确立事实库（${facts.length} 条）：\n${factsBlock.slice(-6000)}`,
      '只输出 JSON 数组。',
    ].join('\n\n')
    try {
      const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 8000) })
      for (const entry of parseJsonArray<Record<string, unknown>>(text)) {
        const name = typeof entry.name === 'string' ? entry.name : ''
        if (name !== '' && typeof entry.status === 'string') statuses.set(name, entry.status)
      }
    } catch { /* status 聚合失败则只给出场统计 */ }
  }

  // 合并：出场统计（精确）+ 状态（LLM）+ 名单角色补全。
  const cards: RoleStatusCard[] = []
  const roleOf = (name: string): string => roster.find(c => c.name === name)?.role ?? 'other'
  for (const card of roster) {
    const entry = stat.get(card.name)
    cards.push({
      name: card.name,
      role: card.role,
      status: statuses.get(card.name) ?? '',
      lastChapter: entry?.last ?? 0,
      appearances: entry?.chapters.size ?? 0,
    })
  }
  // 名单外的角色（从事实库中识别到但不在道藏名单）仅当有出场统计时补充。
  for (const [name, entry] of stat) {
    if (!cards.some(c => c.name === name)) {
      cards.push({
        name,
        role: roleOf(name),
        status: statuses.get(name) ?? '',
        lastChapter: entry.last,
        appearances: entry.chapters.size,
      })
    }
  }
  return cards
}

// ------------------------------------------------------------- foreshadows

/** System prompt for foreshadow suggestions. */
function foreshadowSystemPrompt(): string {
  return [
    '你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。',
    '要求：',
    '1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。',
    '2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。',
    '3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。',
    '输出必须是合法 JSON 数组：',
    '[{"description": "伏笔描述", "plantedChapter": 章节号或null, "targetChapter": 章节号或null}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
}

/** Suggest foreshadows from the outline + plan. */
export async function suggestForeshadows(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<Foreshadow[]> {
  const user = [
    '请为下面这部小说设计伏笔。',
    `大纲：\n${project.outline}`,
    `已规划章节数：${project.chapters.length}`,
  ].join('\n')
  const text = await complete(ctx, config, { system: foreshadowSystemPrompt(), user, temperature: 0.5, maxTokens: Math.max(config.maxTokens, 12000), reasoning: config.analysisReasoning ?? 'low' })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const existing = new Set(project.foreshadows.map(f => f.description))
  const created: Foreshadow[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (description === '' || existing.has(description)) continue
    existing.add(description)
    created.push({
      id: `fs-${Date.now().toString(36)}-${created.length}`,
      description: description.slice(0, 200),
      plantedChapter: typeof entry.plantedChapter === 'number' ? entry.plantedChapter : undefined,
      targetChapter: typeof entry.targetChapter === 'number' ? entry.targetChapter : undefined,
      status: 'planned',
    })
  }
  project.foreshadows.push(...created)
  project.updatedAt = new Date().toISOString()
  return created
}

// -------------------------------------------------------------- style asset

/**
 * 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
 * @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
 */
export async function extractStyleAsset(
  ctx: Context,
  config: NovelConfig,
  sampleText: string,
): Promise<{ proseRules: string[]; dialogueRules: string[]; descriptionRules: string[]; boundaries: string[] }> {
  const user = `请分析下面这段样本文本，提炼其叙事风格规则：\n\n${sampleText}`
  const text = await complete(ctx, config, { system: styleEngineSystemPrompt(), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000) })
  const raw = parseJsonObject<{ proseRules?: unknown; dialogueRules?: unknown; descriptionRules?: unknown; boundaries?: unknown }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const result = {
    proseRules: strArray(raw.proseRules),
    dialogueRules: strArray(raw.dialogueRules),
    descriptionRules: strArray(raw.descriptionRules),
    boundaries: strArray(raw.boundaries),
  }
  if (result.proseRules.length + result.dialogueRules.length + result.descriptionRules.length + result.boundaries.length === 0) {
    throw new Error('写法提取失败：模型没有返回有效规则')
  }
  return result
}

// ------------------------------------------------------------------ export

/** Export the whole book as one txt/md file. */
export function exportBook(outputDir: string, project: ProjectState, format: 'txt' | 'md'): { file: string; chars: number; chapters: number } {
  const parts: string[] = []
  if (format === 'md') {
    parts.push(`# ${project.bookName}\n`)
  } else {
    parts.push(project.bookName, '')
  }
  const done = project.chapters.filter(c => c.file !== undefined)
  for (const chapter of done) {
    const body = readChapterFile(outputDir, chapter) ?? ''
    if (format === 'md') {
      parts.push(`\n## 第${chapter.no}章 ${chapter.title}\n`, body.trim(), '')
    } else {
      parts.push('', `第${chapter.no}章 ${chapter.title}`, '', body.trim(), '')
    }
  }
  const content = parts.join('\n')
  const ext = format === 'md' ? 'md' : 'txt'
  const file = `《${safeFileName(project.bookName)}》全本.${ext}`
  writeFileSync(join(outputDir, file), content, 'utf8')
  return { file, chars: content.length, chapters: done.length }
}


// ==================== 漫剧资产库（manga-assets） ====================

/** 漫剧资产库根目录：outputDir/manga-assets */
export function mangaAssetsDir(outputDir: string): string {
  return join(outputDir, 'manga-assets')
}

/** 确保子目录存在，返回完整路径。 */
function ensureAssetDir(outputDir: string, ...sub: string[]): string {
  const dir = join(mangaAssetsDir(outputDir), ...sub)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 清理文件名中的非法字符。 */
function safeAssetName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

/** 保存角色定妆图到资产库：manga-assets/角色/角色名/标签.png */
export function saveMangaRoleImage(outputDir: string, roleName: string, label: string, dataUrl: string): string {
  const dir = ensureAssetDir(outputDir, '角色', safeAssetName(roleName))
  const safeLabel = safeAssetName(label !== '' ? label : '定妆图')
  const file = join(dir, safeLabel + '.png')
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  writeFileSync(file, Buffer.from(base64, 'base64'))
  return file
}

/** 保存角色提示词到资产库：manga-assets/角色/角色名/提示词.txt */
export function saveMangaRolePrompt(outputDir: string, roleName: string, zh: string, en: string, negative?: string): string {
  const dir = ensureAssetDir(outputDir, '角色', safeAssetName(roleName))
  const file = join(dir, '提示词.txt')
  const content = [
    '【正面提示词（中文）】', zh, '',
    '【正面提示词（英文）】', en, '',
    negative !== undefined && negative !== '' ? ['【负面提示词】', negative, ''].join('\n') : '',
  ].filter(x => x !== '').join('\n')
  writeFileSync(file, content, 'utf8')
  return file
}

/** 保存场景底图到资产库：manga-assets/场景/场景名.png */
export function saveMangaSceneImage(outputDir: string, sceneName: string, label: string, dataUrl: string): string {
  const dir = ensureAssetDir(outputDir, '场景')
  const file = join(dir, safeAssetName(sceneName + '-' + label) + '.png')
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  writeFileSync(file, Buffer.from(base64, 'base64'))
  return file
}

/** 保存分镜即梦脚本到资产库：manga-assets/分镜脚本/第N章-标题.md */
export function saveMangaStoryboardScript(outputDir: string, chapterNo: number, title: string, markdown: string): string {
  const dir = ensureAssetDir(outputDir, '分镜脚本')
  const file = join(dir, '第' + chapterNo + '章-' + safeAssetName(title) + '.md')
  writeFileSync(file, markdown, 'utf8')
  return file
}

/** 保存「即梦素材包」到资产库：manga-assets/素材包/第N章-标题·即梦素材包.md */
export function saveMangaAssetPackage(outputDir: string, chapterNo: number, title: string, markdown: string): string {
  const dir = ensureAssetDir(outputDir, '素材包')
  const file = join(dir, '第' + chapterNo + '章-' + safeAssetName(title) + '·即梦素材包.md')
  writeFileSync(file, markdown, 'utf8')
  return file
}

/** 保存场景中文生图提示词到资产库：manga-assets/场景/场景名/提示词.txt */
export function saveMangaScenePrompt(outputDir: string, sceneName: string, zh: string, negative?: string): string {
  const dir = ensureAssetDir(outputDir, '场景', safeAssetName(sceneName))
  const file = join(dir, '提示词.txt')
  const content = [
    '【场景生图提示词（中文）】', zh, '',
    negative !== undefined && negative !== '' ? ['【负面提示词】', negative, ''].join('\n') : '',
  ].filter(x => x !== '').join('\n')
  writeFileSync(file, content, 'utf8')
  return file
}

/** 保存逐镜即梦提示词到资产库：manga-assets/分镜脚本/第N章-标题-提示词.md */
export function saveMangaChapterPrompts(outputDir: string, chapterNo: number, title: string, markdown: string): string {
  const dir = ensureAssetDir(outputDir, '分镜脚本')
  const file = join(dir, '第' + chapterNo + '章-' + safeAssetName(title) + '-提示词.md')
  writeFileSync(file, markdown, 'utf8')
  return file
}

// ==================== 一键生成（全自动流水线） ====================

export interface AutoGenerateResult {
  chapterNo: number
  skeletonBeats: number
  shotCount: number
  promptCount: number
  importedRoles: number
  needMakeupRoles: number
  extraRoles: number
  pendingCandidates: number
  pendingRoleNames: string[]
}

/**
 * 一键生成：骨架 → 分镜表 → 角色提名 → 自动导入（匹配成功的）→ 自动分级 → 视频提示词。
 * 匹配模糊/小说库缺失的角色保留在候选列表，不自动导入。
 */
export async function autoGenerateMangaChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  styleId?: string,
  filterId?: string,
): Promise<AutoGenerateResult> {
  // 1. 剧情骨架（已有则跳过）
  let entry = (project.storyboards ?? []).find(e => e.chapterNo === chapterNo)
  if (entry === undefined) {
    entry = { chapterNo, skeleton: undefined, table: undefined, prompts: undefined, updatedAt: new Date().toISOString() }
    if (project.storyboards === undefined) project.storyboards = []
    project.storyboards.push(entry)
  }
  const sb = entry
  if (sb.skeleton === undefined) {
    sb.skeleton = await generateStoryboardSkeleton(ctx, config, project, outputDir, chapterNo)
  }

  // 2. 分镜表（已有则跳过）
  if (sb.table === undefined) {
    sb.table = await generateStoryboardTable(ctx, config, project, outputDir, chapterNo, sb.skeleton, styleId, filterId)
  }

  // 3. 角色提名
  const candidates = await nominateMangaRoles(ctx, config, project, outputDir, chapterNo)

  // 4. 为分镜中每个上镜角色建卡，绝不留白：
  //    matched → 自动定型(imported，用正式角色名)；ambiguous/not_in_library → 建「待确认」卡(pending_confirm，用代为名，供改名映射)。
  let imported = 0
  for (const cand of candidates) {
    if (cand.verdict === 'already_imported') continue
    // 已导入跳过（按名或来源名）
    if ((project.mangaRoles ?? []).some(c => c.name === cand.rawName || (cand.matchedRoleName !== undefined && c.sourceRoleName === cand.matchedRoleName))) continue
    const sug = cand.suggested
    const matched = cand.verdict === 'matched' && cand.matchedRoleName !== undefined && cand.matchedRoleName !== ''
    const baseName = (cand.matchedRoleName !== undefined && cand.matchedRoleName !== '' ? cand.matchedRoleName : sug.name) || cand.rawName
    const name = baseName.trim().slice(0, 30) || cand.rawName.trim().slice(0, 30)
    // 分级：matched 用脚本 tier（来自 nominate 的 calcTier）；代称/存疑按功能定级，避免把反派/关键角色误降成 extra。
    const tier: MangaRoleCard['tier'] =
      cand.tier ?? (sug.coreFunction === 'functional' && cand.matchedRoleName === undefined ? 'extra' : 'supporting')
    const card: MangaRoleCard = {
      id: 'mr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      sourceRoleName: cand.matchedRoleName,
      name,
      identity: sug.identity,
      coreFunction: sug.coreFunction,
      protagonistRelation: sug.protagonistRelation,
      speechStyle: sug.speechStyle,
      traits: sug.traits,
      appearance: sug.appearance,
      keyScenes: sug.keyScenes,
      appearsInEpisodes: [chapterNo],
      status: matched ? 'imported' : 'pending_confirm',
      tier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (project.mangaRoles === undefined) project.mangaRoles = []
    project.mangaRoles.push(card)
    if (matched) imported++
  }

  // 5. 视频提示词：不在「一键生成」里自动产，留到「分镜·提示词」页生成（角色/场景定妆就绪后再产，@引用才完整）。

  // 落盘：骨架 + 分镜表 → 资产库（manga-assets/分镜脚本/第N章-标题.md）
  try {
    if (sb.table !== undefined) {
      const chTitle = (project.chapters.find(c => c.no === chapterNo)?.title ?? '')
      const mdLines: string[] = []
      mdLines.push('# 第' + chapterNo + '章《' + chTitle + '》· 分镜')
      if (sb.skeleton !== undefined) {
        mdLines.push('', '## 剧情骨架')
        mdLines.push('弧线：' + (sb.skeleton.arc ?? ''))
        for (const b of sb.skeleton.beats ?? []) mdLines.push(`- [${b.id}] ${b.event}（情绪：${emotionZh(b.emotion)}）`)
      }
      mdLines.push('', '## 分镜表')
      for (const s of sb.table.shots ?? []) mdLines.push(`- s${s.id} ${sizeZh(s.shot)} · ${cameraZh(s.camera)} · ${s.duration}s · ${s.visual}`)
      saveMangaStoryboardScript(outputDir, chapterNo, chTitle, mdLines.join('\n'))
    }
  } catch { /* 落盘失败不阻塞 */ }

  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)

  const allCards = project.mangaRoles ?? []
  const needMakeup = allCards.filter(c => c.tier !== 'extra' && (c.appearsInEpisodes ?? []).includes(chapterNo)).length
  const extra = allCards.filter(c => c.tier === 'extra' && (c.appearsInEpisodes ?? []).includes(chapterNo)).length
  const pendingList = candidates.filter(c => c.verdict === 'ambiguous' || c.verdict === 'not_in_library')
  const pending = pendingList.length
  const pendingRoleNames = pendingList.map(c => c.rawName).slice(0, 10)

  return {
    chapterNo,
    skeletonBeats: sb.skeleton?.beats?.length ?? 0,
    shotCount: sb.table?.shots?.length ?? 0,
    promptCount: sb.prompts?.length ?? 0,
    importedRoles: imported,
    needMakeupRoles: needMakeup,
    extraRoles: extra,
    pendingCandidates: pending,
    pendingRoleNames,
  }
}