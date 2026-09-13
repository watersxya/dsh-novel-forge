/**
 * LLM 实况 feed：以「每次 LLM 调用」为粒度，把生命周期事件（开始/流式正文/阶段变化/完成）
 * 推给订阅者，并提供环形缓冲供新连上的客户端重放。
 *
 * 同时承担三件与用量有关的事（进程内，不落盘）：
 *   1) **用量账本**：每次调用结束后按用途累计 token / 耗时，供 /status 展示；
 *   2) **Prompt 记录**：保存每次调用实际发送的 system + user（环形，按需查询）；
 *   3) **首字耗时**：调用方在拿到第一个文本增量时打点，用于观察模型响应速度。
 */

import type { BlockAssembler, TokenUsage } from '@deepseek-ai/dsh-llm'
import type {
  LlmLiveFrame,
  LlmPromptRecord,
  LlmTokenUsage,
  LlmUsageBucket,
  LlmUsageSummary,
} from './protocol.ts'

export type { LlmLiveFrame }

export type LlmLivePhase = 'requesting' | 'streaming' | 'completed' | 'failed'

/** 帧缓冲上限（新连接重放用）。 */
const MAX_BUFFER = 400
/** Prompt 记录上限（环形，避免长跑吃内存）。 */
const MAX_PROMPTS = 40
/** 单条 Prompt 记录的最大字符数（system + user 合计），超出截断并标记。 */
const MAX_PROMPT_CHARS = 60_000

let buffer: LlmLiveFrame[] = []
type Listener = (frame: LlmLiveFrame) => void
let listeners = new Set<Listener>()
let seq = 0

/** 进程内用量账本。 */
const usageTotals = {
  calls: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  elapsedMs: 0,
  callsWithoutUsage: 0,
  byLabel: new Map<string, LlmUsageBucket>(),
}

/** Prompt 记录（按 sessionId，保留最近 MAX_PROMPTS 条）。 */
const prompts = new Map<string, LlmPromptRecord>()

export function nextSessionId(): string {
  seq++
  return `ll-${Date.now().toString(36)}-${seq}`
}

export function subscribeLiveFeed(listener: Listener): () => void {
  // 先重放现有缓冲（新连接能立即看到最近调用），再进入实时。
  for (const frame of buffer) listener(frame)
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function emitLive(frame: LlmLiveFrame): void {
  if (frame.type === 'session_completed') recordUsage(frame)
  buffer.push(frame)
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER)
  for (const l of listeners) l(frame)
}

export function liveLatest(): LlmLiveFrame[] {
  return [...buffer]
}

export function clearLiveFeed(): void {
  buffer = []
}

// ------------------------------------------------------------------ 用量账本

/** 把 dsh-llm 的 usage 转成线上形状。 */
export function toLiveUsage(usage: TokenUsage | undefined): LlmTokenUsage | undefined {
  if (usage === undefined) return undefined
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    reasoningTokens: usage.reasoningTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
  }
}

/** 记一次已完成的调用（由 emitLive 内部调用）。 */
function recordUsage(frame: LlmLiveFrame): void {
  const failed = frame.phase === 'failed' ? 1 : 0
  const usage = frame.usage
  usageTotals.calls += 1
  usageTotals.failed += failed
  usageTotals.elapsedMs += frame.elapsedMs ?? 0
  if (usage === undefined) {
    usageTotals.callsWithoutUsage += 1
  } else {
    usageTotals.inputTokens += usage.inputTokens
    usageTotals.outputTokens += usage.outputTokens
    usageTotals.reasoningTokens += usage.reasoningTokens ?? 0
    usageTotals.totalTokens += usage.totalTokens ?? usage.inputTokens + usage.outputTokens
  }
  const label = frame.label ?? '未标注调用'
  const bucket = usageTotals.byLabel.get(label) ?? { label, calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, elapsedMs: 0 }
  bucket.calls += 1
  bucket.failed += failed
  bucket.elapsedMs += frame.elapsedMs ?? 0
  if (usage !== undefined) {
    bucket.inputTokens += usage.inputTokens
    bucket.outputTokens += usage.outputTokens
    bucket.reasoningTokens += usage.reasoningTokens ?? 0
  }
  usageTotals.byLabel.set(label, bucket)
}

/** 本次运行的用量汇总（按耗时降序排列用途，便于看谁最贵）。 */
export function liveUsage(): LlmUsageSummary {
  return {
    calls: usageTotals.calls,
    failed: usageTotals.failed,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    reasoningTokens: usageTotals.reasoningTokens,
    totalTokens: usageTotals.totalTokens,
    elapsedMs: usageTotals.elapsedMs,
    callsWithoutUsage: usageTotals.callsWithoutUsage,
    byLabel: [...usageTotals.byLabel.values()].sort((a, b) =>
      (b.inputTokens + b.outputTokens + b.reasoningTokens) - (a.inputTokens + a.outputTokens + a.reasoningTokens)),
  }
}

/** 清零用量账本（面板「重新计数」用）。 */
export function resetLiveUsage(): void {
  usageTotals.calls = 0
  usageTotals.failed = 0
  usageTotals.inputTokens = 0
  usageTotals.outputTokens = 0
  usageTotals.reasoningTokens = 0
  usageTotals.totalTokens = 0
  usageTotals.elapsedMs = 0
  usageTotals.callsWithoutUsage = 0
  usageTotals.byLabel.clear()
}

// ------------------------------------------------------------- Prompt 记录

/** 记一条 Prompt（超长截断并标记）。 */
export function recordPrompt(input: { sessionId: string; label?: string; model?: string; system?: string; user?: string }): LlmPromptRecord {
  const system = input.system ?? ''
  const user = input.user ?? ''
  const chars = system.length + user.length
  let record: LlmPromptRecord = {
    sessionId: input.sessionId,
    label: input.label,
    model: input.model,
    at: new Date().toISOString(),
    system,
    user,
    chars,
  }
  if (chars > MAX_PROMPT_CHARS) {
    // 优先保留 user（真正随调用变化的输入），system 按剩余预算截断。
    const userPart = user.slice(0, MAX_PROMPT_CHARS)
    const rest = MAX_PROMPT_CHARS - userPart.length
    record = { ...record, user: userPart, system: system.slice(0, Math.max(0, rest)), truncated: true }
  }
  prompts.set(record.sessionId, record)
  while (prompts.size > MAX_PROMPTS) {
    const oldest = prompts.keys().next().value
    if (oldest === undefined) break
    prompts.delete(oldest)
  }
  return record
}

/** 取一条 Prompt 记录（不存在返回 undefined）。 */
export function livePrompt(sessionId: string): LlmPromptRecord | undefined {
  return prompts.get(sessionId)
}

/** 清空 Prompt 记录。 */
export function clearLivePrompts(): void {
  prompts.clear()
}

// --------------------------------------------------------------- 调用打点

/** 一次调用的打点句柄。 */
export interface LiveCallHandle {
  sessionId: string
  startedAt: number
  /** 用途（用于 session_completed 的用量分组）。 */
  label: string
  /** 实际使用的模型。 */
  model: string
  /** 首字耗时（毫秒），由 markFirstToken 写入。 */
  firstTokenMs?: number
}

/**
 * 开始一次 LLM 调用：发 session_started、记 Prompt、起计时。
 *
 * @param input 用途/模型/实际发送的 system 与 user。
 * @returns 打点句柄（结束时交给 endLiveCall）。
 */
export function beginLiveCall(input: { label: string; model: string; system?: string; user?: string }): LiveCallHandle {
  const handle: LiveCallHandle = { sessionId: nextSessionId(), startedAt: Date.now(), label: input.label, model: input.model }
  const record = recordPrompt({ sessionId: handle.sessionId, label: input.label, model: input.model, system: input.system, user: input.user })
  emitLive({
    type: 'session_started',
    sessionId: handle.sessionId,
    label: input.label,
    model: input.model,
    at: new Date().toISOString(),
    context: { interactionId: handle.sessionId },
    hasPrompt: true,
    promptChars: record.chars,
  })
  emitLive({ type: 'phase_changed', sessionId: handle.sessionId, phase: 'streaming', phaseMessage: '模型正在返回内容', at: new Date().toISOString() })
  return handle
}

/** 首字打点（调用方在收到第一个文本增量时调用，只记第一次）。 */
export function markFirstToken(handle: LiveCallHandle): void {
  if (handle.firstTokenMs === undefined) handle.firstTokenMs = Date.now() - handle.startedAt
}

/**
 * 结束一次 LLM 调用：从 assembler 取用量，发 session_completed（含 token/耗时/首字）。
 *
 * @param handle beginLiveCall 的句柄。
 * @param assembler 本次调用的 BlockAssembler。
 * @param extra 字符数/预览/失败信息等。
 */
export function endLiveCall(
  handle: LiveCallHandle,
  assembler: BlockAssembler,
  extra: { chars?: number; preview?: string; phase?: 'completed' | 'failed'; error?: string } = {},
): void {
  const usage = toLiveUsage(assembler.usage)
  emitLive({
    type: 'session_completed',
    sessionId: handle.sessionId,
    label: handle.label,
    model: handle.model,
    at: new Date().toISOString(),
    totalChars: extra.chars,
    preview: extra.preview,
    phase: extra.phase ?? 'completed',
    error: extra.error,
    usage,
    elapsedMs: Date.now() - handle.startedAt,
    firstTokenMs: handle.firstTokenMs,
  })
}
