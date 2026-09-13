/**
 * 浏览器端「AI 创作实况」钩子：连接 /llm-live/stream (SSE)，按 LLM 调用分组会话。
 * 轻量实现，不持久化缓存（对齐上游 useLlmLiveFeed 的核心行为）。
 */

import { useEffect, useMemo, useState } from 'react'
import { NOVEL_API, type LlmLiveFrame, type LlmTokenUsage } from '../protocol.ts'

// 帧结构定义在 protocol.ts（宿主与浏览器共用同一份线上形状），此处只再导出。
export type { LlmLiveFrame }

export interface LlmLiveSession {
  sessionId: string
  label: string
  model?: string
  phase: 'requesting' | 'streaming' | 'completed' | 'failed'
  phaseMessage: string
  preview: string
  totalChars: number
  startedAt: string
  updatedAt: string
  /** 本次调用的 token 用量（供应商未上报时缺省）。 */
  usage?: LlmTokenUsage
  /** 本次调用耗时（毫秒）。 */
  elapsedMs?: number
  /** 首字耗时（毫秒）。 */
  firstTokenMs?: number
  /** 是否保存了可查看的 Prompt。 */
  hasPrompt?: boolean
  /** Prompt 字符数（system + user）。 */
  promptChars?: number
}

const MAX_PREVIEW_CHARS = 20_000

function applyFrame(current: Record<string, LlmLiveSession>, frame: LlmLiveFrame): Record<string, LlmLiveSession> {
  const next = { ...current }
  const id = frame.sessionId
  let session = next[id]
  if (frame.type === 'session_started') {
    session = {
      sessionId: id,
      label: frame.label ?? 'LLM 调用',
      model: frame.model,
      phase: 'requesting',
      phaseMessage: '正在连接模型',
      preview: '',
      totalChars: 0,
      startedAt: frame.at,
      updatedAt: frame.at,
      hasPrompt: frame.hasPrompt,
      promptChars: frame.promptChars,
    }
    next[id] = session
    return next
  }
  if (session === undefined) return next
  if (frame.type === 'output_delta') {
    const preview = (session.preview + (frame.content ?? '')).slice(-MAX_PREVIEW_CHARS)
    session = { ...session, phase: session.phase === 'requesting' ? 'streaming' : session.phase, phaseMessage: session.phase === 'requesting' ? '模型正在返回内容' : session.phaseMessage, preview, totalChars: frame.totalChars ?? session.totalChars + (frame.content?.length ?? 0), updatedAt: frame.at }
    next[id] = session
  } else if (frame.type === 'reasoning_delta') {
    session = { ...session, phase: session.phase === 'requesting' ? 'streaming' : session.phase, updatedAt: frame.at }
    next[id] = session
  } else if (frame.type === 'phase_changed') {
    session = { ...session, phase: frame.phase ?? session.phase, phaseMessage: frame.phaseMessage ?? session.phaseMessage, updatedAt: frame.at }
    next[id] = session
  } else if (frame.type === 'session_completed') {
    session = {
      ...session,
      phase: frame.phase ?? 'completed',
      phaseMessage: frame.phase === 'failed' ? (frame.error ?? '调用失败') : '模型结果已准备完成',
      totalChars: frame.totalChars ?? session.totalChars,
      preview: session.preview || (frame.preview ?? ''),
      updatedAt: frame.at,
      usage: frame.usage ?? session.usage,
      elapsedMs: frame.elapsedMs ?? session.elapsedMs,
      firstTokenMs: frame.firstTokenMs ?? session.firstTokenMs,
    }
    next[id] = session
  }
  return next
}

export function useLlmLiveFeed(enabled = true): { connected: boolean; sessions: LlmLiveSession[] } {
  const [sessions, setSessions] = useState<Record<string, LlmLiveSession>>({})
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setSessions({})
      setConnected(false)
      return
    }
    const es = new EventSource(NOVEL_API.llmLive)
    es.onopen = () => setConnected(true)
    es.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as LlmLiveFrame
        setSessions(prev => applyFrame(prev, frame))
      } catch { /* ignore malformed frame */ }
    }
    // EventSource 断线会自动重连；这里只在断线瞬间标记未连接，重连成功后会再次 onopen。
    es.onerror = () => setConnected(false)
    return () => {
      es.close()
      setConnected(false)
    }
  }, [enabled])
  const list = useMemo(() => Object.values(sessions).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [sessions])
  return { connected, sessions: list }
}
