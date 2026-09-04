/**
 * AI 助手（编辑老师）：与 AI 编辑对话讨论剧情，助手通过动作指令直接修改
 * 大纲 / 道藏 / 章节。流式渲染回复；工具调用显示为步骤卡片（中文名 +
 * 状态 + 耗时），顶部状态条展示当前在做什么；支持清空对话记录。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { tt } from './helpers.ts'
import type { AssistantFrame, AssistantMessage } from '../../protocol.ts'
import css from './panel.module.css'

/** 工具中文名 + 图标映射（作者看得懂）。 */
const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  book_overview: { icon: '📖', label: '读取全书上下文' },
  impact_analysis: { icon: '🔗', label: '影响分析' },
  outline_text: { icon: '📄', label: '读取大纲' },
  outline_replace: { icon: '📝', label: '修改大纲' },
  bible_set_rule: { icon: '📖', label: '修改设定规则' },
  bible_set_redline: { icon: '🚫', label: '修改写作红线' },
  chapter_text: { icon: '📄', label: '读取章节' },
  chapter_rewrite: { icon: '✏️', label: '修订章节' },
  chapter_generate: { icon: '✨', label: '生成章节' },
  chapter_review: { icon: '🔍', label: 'AI 审稿' },
  foreshadow_add: { icon: '🪤', label: '新增伏笔' },
  foreshadow_update: { icon: '🪤', label: '更新伏笔' },
  export_txt: { icon: '📦', label: '导出 TXT' },
  assets_status: { icon: '🎨', label: '查看写作资产' },
  assets_set_genre: { icon: '🏷️', label: '设置题材' },
  assets_set_progression: { icon: '📈', label: '设置推进模式' },
  assets_add_rule: { icon: '🚫', label: '新增反AI规则' },
  error: { icon: '⚠️', label: '出错了' },
}

/** One chat bubble (either side). */
interface ChatLine {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Tool steps interleaved with the assistant reply. */
  tools: Array<{ name: string; status: 'start' | 'done' | 'error'; detail?: string; startedAt?: number; elapsedMs?: number }>
  /** Live output while a tool runs (generated text streamed into the bubble). */
  live?: string
}

/** Props. */
export interface AssistantTabProps {
  api: NovelApi
}

/** The assistant conversation tab. */
export function AssistantTab({ api }: AssistantTabProps) {
  const [lines, setLines] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 思考耗时（秒，busy 时每秒刷新）。 */
  const [thinkSeconds, setThinkSeconds] = useState(0)
  const idRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /** busy 计时：显示"已思考 Xs"，让作者知道在干活。 */
  useEffect(() => {
    if (!busy) {
      setThinkSeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      setThinkSeconds(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => { window.clearInterval(timer) }
  }, [busy])

  /** Append a bubble (or extend the current assistant bubble). */
  const pushLine = useCallback((line: Omit<ChatLine, 'id'>) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      // Extend the live assistant bubble while streaming.
      if (line.role === 'assistant' && last !== undefined && last.role === 'assistant' && last.tools.length === 0) {
        return [...prev.slice(0, -1), { ...last, text: last.text + line.text }]
      }
      return [...prev, { ...line, id: idRef.current++ }]
    })
  }, [])

  /** Push a tool event: start 创建步骤，done/error 更新同名步骤（含耗时）。 */
  const pushTool = useCallback((tool: ChatLine['tools'][number]) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      if (last === undefined || last.role !== 'assistant') {
        return [...prev, {
          id: idRef.current++,
          role: 'assistant',
          text: '',
          tools: [{ ...tool, startedAt: tool.status === 'start' ? Date.now() : undefined }],
        }]
      }
      const tools = [...last.tools]
      if (tool.status === 'start') {
        tools.push({ ...tool, startedAt: Date.now() })
      } else {
        // 找到同名未完成的步骤，更新状态与耗时。
        for (let i = tools.length - 1; i >= 0; i--) {
          const step = tools[i]!
          if (step.name === tool.name && step.status === 'start') {
            tools[i] = {
              ...step,
              status: tool.status,
              detail: tool.detail,
              elapsedMs: Date.now() - (step.startedAt ?? Date.now()),
            }
            break
          }
        }
      }
      return [...prev.slice(0, -1), { ...last, tools, live: undefined }]
    })
  }, [])

  /** Append live tool output onto the current assistant bubble. */
  const pushToolDelta = useCallback((text: string) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      if (last === undefined || last.role !== 'assistant') return prev
      return [...prev.slice(0, -1), { ...last, live: (last.live ?? '') + text }]
    })
  }, [])

  /** 当前进行中的工具（状态条显示）。 */
  const activeTool = (() => {
    if (!busy) return null
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!
      if (line.role !== 'assistant') continue
      for (let j = line.tools.length - 1; j >= 0; j--) {
        if (line.tools[j]!.status === 'start') return line.tools[j]!
      }
    }
    return null
  })()

  /** Load persisted history on mount. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const history = await api.assistantHistory()
        if (cancelled) return
        const restored: ChatLine[] = []
        for (const entry of history) {
          if (entry.role === 'user') {
            restored.push({ id: idRef.current++, role: 'user', text: entry.content, tools: [] })
          } else if (entry.role === 'assistant') {
            restored.push({ id: idRef.current++, role: 'assistant', text: entry.content, tools: [] })
          }
        }
        setLines(restored)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [api])

  /** Auto-scroll to the newest line. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  /** 清空对话记录（服务端删除历史 + 本地清空）。 */
  const handleClear = async (): Promise<void> => {
    if (!window.confirm('清空全部聊天记录？此操作不可恢复（不影响大纲/设定/章节）。')) return
    setBusy(true)
    setError('')
    try {
      await api.assistantClear()
      setLines([])
      setNotice('对话已清空，编辑老师会重新了解项目')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Send one message. */
  const handleSend = async (): Promise<void> => {
    const message = input.trim()
    if (message === '' || busy) return
    setInput('')
    setError('')
    setNotice('')
    pushLine({ role: 'user', text: message, tools: [] })
    // Start an empty assistant bubble.
    setLines(prev => [...prev, { id: idRef.current++, role: 'assistant', text: '', tools: [] }])
    setBusy(true)
    try {
      await api.assistant(message, (frame: AssistantFrame) => {
        if (frame.type === 'delta') {
          pushLine({ role: 'assistant', text: frame.text, tools: [] })
        } else if (frame.type === 'tool') {
          pushTool({
            name: frame.name,
            status: frame.status,
            detail: frame.detail,
          })
        } else if (frame.type === 'toolDelta') {
          pushToolDelta(frame.text)
        } else if (frame.type === 'error') {
          pushTool({ name: 'error', status: 'error', detail: frame.message })
        }
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.card} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={css.row} style={{ justifyContent: 'space-between' }}>
        <span className={css.cardTitle}>{tt('tab.assistant')}</span>
        <button type="button" className={css.iconButton} title="清空聊天记录" aria-label="清空聊天记录" onClick={() => { void handleClear() }}>
          🗑️
        </button>
      </div>
      <span className={css.meta}>{tt('assistant.hint')}</span>
      {notice !== '' && <span style={{ color: 'var(--nf-success)', fontSize: 'var(--nf-fs-12)' }}>{notice}</span>}
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-12)' }}>{tt('common.error')}: {error}</span>}
      {/* 状态条：编辑老师正在做什么 */}
      <div className={`${css.assistantStatus} ${busy ? css.assistantStatusBusy : ''}`}>
        {busy
          ? `🤖 编辑老师 · ${activeTool !== null ? `正在「${TOOL_LABELS[activeTool.name]?.label ?? activeTool.name}」` : `正在思考…（已 ${thinkSeconds}s）`}`
          : '💬 编辑老师 · 等你开口'}
      </div>
      <div
        ref={scrollRef}
        className={css.chatScroll}
      >
        {lines.length === 0 && <span className={css.meta}>{tt('assistant.empty')}</span>}
        {lines.map(line => (
          <div key={line.id} className={line.role === 'user' ? css.chatBubbleUser : css.chatBubbleAssistant}>
            {line.role === 'user' && <div className={css.chatRole}>你</div>}
            {line.text !== '' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line.text}</div>}
            {line.live !== undefined && line.live !== '' && (
              <div className={css.toolLive}>{line.live}</div>
            )}
            {/* 步骤卡片 */}
            {line.tools.length > 0 && (
              <div className={css.toolSteps}>
                {line.tools.map((tool, i) => {
                  const meta = TOOL_LABELS[tool.name] ?? { icon: '⚙️', label: tool.name }
                  return (
                    <div
                      key={i}
                      className={`${css.toolStep} ${tool.status === 'error' ? css.toolStepError : tool.status === 'start' ? css.toolStepActive : ''}`}
                    >
                      <span className={css.toolStepIcon}>{meta.icon}</span>
                      <span className={css.toolStepName}>{meta.label}</span>
                      <span className={css.toolStepStatus}>
                        {tool.status === 'start'
                          ? '⏳ 进行中'
                          : tool.status === 'done'
                            ? `✓ ${tool.elapsedMs !== undefined ? `${(tool.elapsedMs / 1000).toFixed(1)}s` : ''}`
                            : '✗ 失败'}
                      </span>
                      {tool.status === 'error' && tool.detail !== undefined && (
                        <span className={css.toolStepDetail}>{tool.detail}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {busy && <span className={css.meta} style={{ color: 'var(--nf-accent)' }}>…</span>}
      </div>
      <div className={css.row} style={{ marginTop: 'var(--nf-space-8)' }}>
        <textarea
          className={css.textarea}
          style={{ minHeight: 64, flex: 1 }}
          placeholder={tt('assistant.placeholder')}
          value={input}
          onChange={e => { setInput(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || input.trim() === ''} onClick={() => { void handleSend() }}>
          {tt('assistant.send')}
        </button>
      </div>
    </div>
  )
}
