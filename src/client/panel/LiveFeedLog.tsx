/**
 * 「实时调用 / LIVE」—— 内嵌到 AI 进度窗的下半区（详情层），不再独立浮窗。
 * 连接 /llm-live/stream，按 LLM 调用分组展示模型实时输出。
 *
 * 状态色全部走 panel.module.css 的 .lfPill / .lfDot（主题令牌 + --nf-streaming），
 * 不再内联硬编码色；布局性 inline style 保留（均为令牌引用或动态值）。
 */

import { useMemo, useState } from 'react'
import { useLlmLiveFeed, type LlmLiveSession } from '../llmLive.ts'
import css from './panel.module.css'

function PhasePill({ s }: { s: LlmLiveSession }): JSX.Element {
  return (
    <span className={css.lfPill} data-phase={s.phase}>
      {s.phase === 'requesting' ? '请求中' : s.phase === 'streaming' ? '生成中' : s.phase === 'failed' ? '失败' : '完成'}
    </span>
  )
}

function SessionCard({ s, brief }: { s: LlmLiveSession; brief: boolean }): JSX.Element {
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
        <span className={css.lfDot} data-size="lg" data-state={connected ? 'ok' : 'idle'} />
        <b style={{ flex: 1 }}>实时调用 / LIVE</b>
        <span className={css.lfPill} data-phase={active > 0 ? 'streaming' : 'requesting'}>
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
