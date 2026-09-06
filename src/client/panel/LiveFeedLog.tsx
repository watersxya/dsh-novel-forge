/**
 * 「实时调用 / LIVE」—— 内嵌到 AI 进度窗的下半区（详情层），不再独立浮窗。
 * 连接 /llm-live/stream，按 LLM 调用分组展示模型实时输出。
 */

import { useMemo, useState } from 'react'
import { useLlmLiveFeed, type LlmLiveSession } from '../llmLive.ts'

const PHASE_COLOR: Record<string, string> = {
  requesting: '#9aa8c0',
  streaming: '#e891b5',
  completed: '#4fbf8b',
  failed: '#d4634f',
}

const PHASE_BG: Record<string, string> = {
  requesting: 'rgba(154,168,192,0.14)',
  streaming: 'rgba(232,145,181,0.16)',
  completed: 'rgba(79,191,139,0.16)',
  failed: 'rgba(212,99,79,0.18)',
}

function PhasePill({ s }: { s: LlmLiveSession }): JSX.Element {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, color: PHASE_COLOR[s.phase] ?? '#b0b7c3', backgroundColor: PHASE_BG[s.phase] ?? 'rgba(154,168,192,0.14)' }}>
      {s.phase === 'requesting' ? '请求中' : s.phase === 'streaming' ? '生成中' : s.phase === 'failed' ? '失败' : '完成'}
    </span>
  )
}

function SessionCard({ s, brief }: { s: LlmLiveSession; brief: boolean }): JSX.Element {
  const active = s.phase === 'requesting' || s.phase === 'streaming'
  return (
    <div style={{ borderBottom: '1px solid var(--nf-border)', padding: '7px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: active ? '#e891b5' : (s.phase === 'failed' ? '#d4634f' : '#4fbf8b'), flexShrink: 0 }} />
        <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</b>
        {s.model !== undefined && <span style={{ color: 'var(--nf-text-2)', fontSize: 10, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.model}</span>}
        <PhasePill s={s} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--nf-text-2)', marginTop: 2, display: 'flex', gap: 8 }}>
        <span>{s.totalChars} 字符</span>
        {s.phaseMessage !== '' && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.phaseMessage}</span>}
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
  const { connected, sessions } = useLlmLiveFeed(true)
  const active = sessions.filter(s => s.phase === 'requesting' || s.phase === 'streaming').length
  const shown = useMemo(() => (cleared ? sessions.slice(-8) : sessions), [sessions, cleared])
  return (
    <div style={{ borderTop: '1px solid var(--nf-border)', marginTop: 8, paddingTop: 6, flex: '1 1 auto', minHeight: 140, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '2px 4px' }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: connected ? '#4fbf8b' : '#b0b7c3' }} />
        <b style={{ flex: 1 }}>实时调用 / LIVE</b>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, color: active > 0 ? '#e891b5' : '#9aa8c0', backgroundColor: active > 0 ? 'rgba(232,145,181,0.14)' : 'rgba(154,168,192,0.14)' }}>
          {active > 0 ? `${active} 项进行中` : connected ? '等待生成' : '正在连接'}
        </span>
        <button type="button" title={brief ? '详细' : '简略'} onClick={() => setBrief(b => !b)} style={{ border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>{brief ? '详细' : '简略'}</button>
        <button type="button" title="清空当前窗口" onClick={() => setCleared(true)} style={{ border: '1px solid var(--nf-border)', background: 'var(--nf-bg)', color: 'var(--nf-text)', borderRadius: 6, fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>清空</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {shown.length === 0 ? (
          <div style={{ padding: 10, fontSize: 12, color: 'var(--nf-text-2)' }}>{connected ? '暂无实时调用。开始一次生成/审稿/计划即可看到。' : '正在连接 AI 实况服务…'}</div>
        ) : shown.map(s => <SessionCard key={s.sessionId} s={s} brief={brief} />)}
      </div>
    </div>
  )
}
