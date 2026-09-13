/**
 * 「实时调用 / LIVE」—— 内嵌到 AI 进度窗的下半区（详情层），不再独立浮窗。
 * 连接 /llm-live/stream，按 LLM 调用分组展示模型实时输出。
 *
 * 除实时输出外，这里还承担两件与「花了多少」有关的事：
 *   1) 每次调用显示 token 用量（输入↑ / 输出↓ / 思考）与耗时、首字耗时；
 *   2) 「查看 Prompt」按 sessionId 拉取这次调用**实际发送**的 system / user。
 * 顶部另有一条「本次运行」累计条（进程内，重启归零）。
 *
 * 状态色全部走 panel.module.css 的 .lfPill / .lfDot（主题令牌 + --nf-streaming），
 * 不再内联硬编码色；布局性 inline style 保留（均为令牌引用或动态值）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLlmLiveFeed, type LlmLiveSession } from '../llmLive.ts'
import { NOVEL_API, type LlmPromptRecord, type LlmUsageSummary } from '../../protocol.ts'
import css from './panel.module.css'

/** 毫秒 → 紧凑可读（840ms / 1.2s）。 */
function fmtMs(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return ''
  return ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(1) + 's'
}

/** token 数 → 紧凑（12.3k）。 */
function fmtTokens(n: number | undefined): string {
  if (n === undefined || n <= 0) return '0'
  return n < 1000 ? String(n) : (n / 1000).toFixed(1) + 'k'
}

/** 一次调用的用量摘要（输入↑ / 输出↓ / 思考 / 缓存）。 */
function usageText(s: LlmLiveSession): string {
  const u = s.usage
  if (u === undefined) return '用量未上报'
  const parts = ['↑' + fmtTokens(u.inputTokens), '↓' + fmtTokens(u.outputTokens)]
  if ((u.reasoningTokens ?? 0) > 0) parts.push('思考 ' + fmtTokens(u.reasoningTokens))
  if ((u.cacheReadTokens ?? 0) > 0) parts.push('缓存 ' + fmtTokens(u.cacheReadTokens))
  return parts.join(' · ')
}

function PhasePill({ s }: { s: LlmLiveSession }): JSX.Element {
  return (
    <span className={css.lfPill} data-phase={s.phase}>
      {s.phase === 'requesting' ? '请求中' : s.phase === 'streaming' ? '生成中' : s.phase === 'failed' ? '失败' : '完成'}
    </span>
  )
}

/** 「查看 Prompt」弹层：拉取这次调用实际发送的 system + user。 */
function PromptDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }): JSX.Element {
  const [record, setRecord] = useState<LlmPromptRecord | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'user' | 'system'>('user')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(NOVEL_API.llmPrompt + '?sessionId=' + encodeURIComponent(sessionId))
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? 'HTTP ' + res.status)
        }
        const data = await res.json() as LlmPromptRecord
        if (!cancelled) setRecord(data)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])
  const text = record === null ? '' : (tab === 'user' ? (record.user ?? '') : (record.system ?? ''))
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--nf-bg)', border: '1px solid var(--nf-border)', borderRadius: 10, width: 'min(880px, 96vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ flex: 1, fontSize: 13 }}>实际发送的 Prompt{record?.label !== undefined ? ' · ' + record.label : ''}</b>
          {record !== null && <span className={css.meta}>共 {record.chars.toLocaleString()} 字符{record.truncated === true ? '（记录已截断）' : ''}</span>}
          <button type="button" className={css.iconButton} title="关闭" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={css.button + (tab === 'user' ? ' ' + css.buttonPrimary : '')} onClick={() => setTab('user')}>User / 输入</button>
          <button type="button" className={css.button + (tab === 'system' ? ' ' + css.buttonPrimary : '')} onClick={() => setTab('system')}>System / 系统提示</button>
        </div>
        {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 12 }}>{error}</span>}
        {record === null && error === '' && <span className={css.meta}>加载中…</span>}
        {record !== null && (
          <pre style={{ flex: 1, minHeight: 0, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.55, background: 'var(--nf-bg-inset)', borderRadius: 8, padding: 8, margin: 0 }}>
            {text === '' ? '（空）' : text}
          </pre>
        )}
      </div>
    </div>
  )
}

function SessionCard({ s, brief, onShowPrompt }: { s: LlmLiveSession; brief: boolean; onShowPrompt: (sessionId: string) => void }): JSX.Element {
  const active = s.phase === 'requesting' || s.phase === 'streaming'
  const dotState = active ? 'streaming' : s.phase
  return (
    <div style={{ borderBottom: '1px solid var(--nf-border)', padding: '7px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span className={css.lfDot} data-state={dotState} />
        <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</b>
        {s.model !== undefined && <span style={{ color: 'var(--nf-text-2)', fontSize: 10, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.model}</span>}
        <PhasePill s={s} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--nf-text-2)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{s.totalChars} 字符</span>
        <span title="输入 / 输出 token">{usageText(s)}</span>
        {s.elapsedMs !== undefined && <span title="总耗时">用时 {fmtMs(s.elapsedMs)}</span>}
        {s.firstTokenMs !== undefined && <span title="首个字返回耗时">首字 {fmtMs(s.firstTokenMs)}</span>}
        {s.phaseMessage !== '' && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.phaseMessage}</span>}
        {s.hasPrompt === true && (
          <button
            type="button"
            title="查看这次调用实际发送的 Prompt"
            onClick={() => onShowPrompt(s.sessionId)}
            style={{ border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '0 5px', cursor: 'pointer' }}
          >查看 Prompt</button>
        )}
      </div>
      {!brief && s.preview !== '' && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.5, color: 'var(--nf-text)', backgroundColor: 'var(--nf-bg-inset)', borderRadius: 8, padding: 6, marginTop: 6, marginBottom: 0 }}>{s.preview}</pre>
      )}
    </div>
  )
}

export default function LiveFeedLog(): JSX.Element {
  const [brief, setBrief] = useState(true)
  const [cleared, setCleared] = useState(false)
  const [promptId, setPromptId] = useState<string | null>(null)
  const { connected, sessions } = useLlmLiveFeed(true)
  const active = sessions.filter(s => s.phase === 'requesting' || s.phase === 'streaming').length
  const shown = useMemo(() => (cleared ? sessions.slice(-8) : sessions), [sessions, cleared])

  // 本次运行用量（进程内累计，来自 /status.usage）。
  const [usage, setUsage] = useState<LlmUsageSummary | null>(null)
  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch(NOVEL_API.status + '?slim=1')
      if (!res.ok) return
      const data = await res.json() as { usage?: LlmUsageSummary }
      setUsage(data.usage ?? null)
    } catch { /* 用量是尽力而为，不影响实况 */ }
  }, [])
  useEffect(() => {
    void loadUsage()
    const timer = window.setInterval(() => { void loadUsage() }, 15_000)
    return () => { window.clearInterval(timer) }
  }, [loadUsage])

  const resetUsage = useCallback(async (): Promise<void> => {
    try {
      await fetch(NOVEL_API.usageReset, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      await loadUsage()
    } catch { /* ignore */ }
  }, [loadUsage])

  return (
    <div style={{ borderTop: '1px solid var(--nf-border)', marginTop: 8, paddingTop: 6, flex: '1 1 auto', minHeight: 140, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '2px 4px' }}>
        <span className={css.lfDot} data-size="lg" data-state={connected ? 'ok' : 'idle'} />
        <b style={{ flex: 1 }}>实时调用 / LIVE</b>
        <span className={css.lfPill} data-phase={active > 0 ? 'streaming' : 'requesting'}>
          {active > 0 ? `${active} 项进行中` : connected ? '等待生成' : '正在连接'}
        </span>
        <button type="button" title={brief ? '详细' : '简略'} onClick={() => setBrief(b => !b)} style={{ border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>{brief ? '详细' : '简略'}</button>
        <button type="button" title="清空当前窗口" onClick={() => setCleared(true)} style={{ border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>清空</button>
      </div>
      {usage !== null && usage.calls > 0 && (
        <div
          title="本次运行累计（进程内，重启归零）"
          style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 10, color: 'var(--nf-text-2)', padding: '3px 4px', borderTop: '1px dashed var(--nf-border)' }}
        >
          <span>本次运行：{usage.calls} 次调用{usage.failed > 0 ? `（失败 ${usage.failed}）` : ''}</span>
          <span>↑{fmtTokens(usage.inputTokens)}</span>
          <span>↓{fmtTokens(usage.outputTokens)}</span>
          {usage.reasoningTokens > 0 && <span>思考 {fmtTokens(usage.reasoningTokens)}</span>}
          <span>用时 {fmtMs(usage.elapsedMs)}</span>
          {usage.callsWithoutUsage > 0 && <span>（{usage.callsWithoutUsage} 次未上报用量）</span>}
          <button
            type="button"
            title="清零本次运行用量"
            onClick={() => { void resetUsage() }}
            style={{ marginLeft: 'auto', border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}
          >重新计数</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {shown.length === 0 ? (
          <div style={{ padding: 10, fontSize: 12, color: 'var(--nf-text-2)' }}>{connected ? '暂无实时调用。开始一次生成/审稿/计划即可看到。' : '正在连接 AI 实况服务…'}</div>
        ) : shown.map(s => <SessionCard key={s.sessionId} s={s} brief={brief} onShowPrompt={setPromptId} />)}
      </div>
      {promptId !== null && <PromptDialog sessionId={promptId} onClose={() => setPromptId(null)} />}
    </div>
  )
}
