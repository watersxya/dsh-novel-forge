/**
 * 书分析/拆书：输入一本书/章节文本 → 卖点/结构/可借鉴点/风险。
 */
import { useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { BookAnalysisResult } from '../../protocol.ts'
import css from './panel.module.css'
import { SubPage } from './SubPage.tsx'

const SECTIONS: Array<{ key: keyof BookAnalysisResult; label: string; color: string }> = [
  { key: 'sellingPoints', label: '卖点', color: 'var(--nf-success)' },
  { key: 'structure', label: '结构', color: 'var(--nf-info)' },
  { key: 'lessons', label: '可借鉴', color: 'var(--nf-accent)' },
  { key: 'risks', label: '风险', color: 'var(--nf-error)' },
]

export default function BookAnalysisView({ api }: { api: NovelApi }): JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BookAnalysisResult | null>(null)

  const run = async (): Promise<void> => {
    if (text.trim().length < 50) { setError('文本过短（<50 字符），请粘贴一段书/章节内容'); return }
    setBusy(true); setError('')
    try {
      const r = await api.bookAnalysis(text.trim())
      setResult(r.result)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <SubPage
      title="书分析 / 拆书"
      meta="粘贴一本书/章节文本 → 提炼卖点、结构、可借鉴点与风险（不照搬具体作品）。"
      actions={(
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void run() }}>
          {busy ? '分析中…' : '开始分析'}
        </button>
      )}
    >
      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
        <span className={css.meta}>粘贴文本后点开始分析，结果按卖点/结构/可借鉴/风险分四区呈现。</span>
        <textarea className={css.input} style={{ minHeight: 180, resize: 'vertical' }} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴要分析的书/章节正文…" />
      </div>

      {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 13 }}> {error}</div>}

      {result !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--nf-space-10)' }}>
          {SECTIONS.map(s => (
            <div key={s.key} className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-8)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}（{(result[s.key] ?? []).length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(result[s.key] ?? []).length === 0 ? <span style={{ color: 'var(--nf-text-2)', fontSize: 12 }}>无</span> : (result[s.key] ?? []).map((x, i) => <div key={i} style={{ fontSize: 12, borderLeft: '3px solid ' + s.color, paddingLeft: 6 }}>{x}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </SubPage>
  )
}
