/**
 * 创意灵感：一句话/题材 → 多方向开书灵感。
 */
import { useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { IdeaInspirationResult } from '../../protocol.ts'
import css from './panel.module.css'

export default function IdeaInspirationView({ api, onUseIdea }: { api: NovelApi; onUseIdea?: (idea: IdeaInspirationResult['ideas'][number]) => void }): JSX.Element {
  const [idea, setIdea] = useState('')
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<IdeaInspirationResult | null>(null)

  const copyText = (it: IdeaInspirationResult['ideas'][number]): string =>
    `《${it.title}》\n题材：${it.genre}\n视角：${it.pov}\n钩子：${it.hook}\n长期兑现：${it.payoff}`

  const copy = async (it: IdeaInspirationResult['ideas'][number]): Promise<void> => {
    try { await navigator.clipboard.writeText(copyText(it)); setError('') } catch (e) { setError('复制失败：' + (e as Error).message) }
  }

  const run = async (): Promise<void> => {
    if (idea.trim().length < 2) { setError('请填写你的方向/一句话想法'); return }
    setBusy(true); setError('')
    try {
      const r = await api.ideaInspiration(idea.trim(), count)
      setResult(r.result)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className={css.authorPageBody}>
      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
        <span className={css.cardTitle}>💡 创意灵感</span>
        <span className={css.meta}>输入一句话/题材方向 → 给出多个可开书的差异化创意（不照搬具体作品）。</span>
        <textarea className={css.input} style={{ minHeight: 120, resize: 'vertical' }} value={idea} onChange={e => setIdea(e.target.value)} placeholder="例：重生后我在城隍庙摆摊；反派每天都被打脸却越来越强…" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>数量</label>
          <select className={css.input} style={{ width: 'auto', padding: '4px 8px' }} value={count} onChange={e => setCount(Number(e.target.value))}>
            {[3, 5, 8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void run() }}>
            {busy ? '生成中…' : '生成灵感'}
          </button>
        </div>
      </div>

      {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 13 }}>⚠ {error}</div>}

      {result !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--nf-space-10)' }}>
          {(result.ideas ?? []).map((it, i) => (
            <div key={i} className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: 'var(--nf-success)' }}>{it.genre} · {it.pov}</div>
              <div style={{ fontSize: 13 }}>钩子：{it.hook}</div>
              <div style={{ fontSize: 12, color: 'var(--nf-text-2)' }}>兑现：{it.payoff}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { void copy(it) }} title="复制给开书向导/其他用到">复制</button>
                {onUseIdea !== undefined && (
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} onClick={() => onUseIdea(it)} title="带着这个灵感去开书（预填书名与想法）">以此方向开书</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
