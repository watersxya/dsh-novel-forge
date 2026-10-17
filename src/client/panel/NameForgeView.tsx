/**
 * 取名器：按类别批量生成专有名字，逐条采纳入本书名字库。
 *
 * 边界写在界面上：候选不落盘，采纳后才注入写作提示词（本书层「已定名资产」块）；
 * 库有容量上限（每类 60 / 全书 200），满了会明确报错而不是静默丢弃。
 */

import { useCallback, useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { NameCategory, NameForgeCandidate, NameForgeEntry } from '../../protocol.ts'
import { NAME_CATEGORIES } from '../../name-forge.ts'
import { NoticeBar } from './NoticeBar.tsx'
import { SlideNav } from './views.tsx'
import css from './panel.module.css'

export interface NameForgeViewProps {
  api: NovelApi
}

/** 每次可选的生成条数。 */
const COUNT_OPTIONS = [5, 10, 15, 20] as const

export default function NameForgeView({ api }: NameForgeViewProps): JSX.Element {
  const [category, setCategory] = useState<NameCategory>('person')
  const [count, setCount] = useState<number>(10)
  const [hint, setHint] = useState('')
  const [candidates, setCandidates] = useState<NameForgeCandidate[]>([])
  const [justAdopted, setJustAdopted] = useState<Set<string>>(new Set())
  const [bank, setBank] = useState<NameForgeEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      const r = await api.nameForgeBank()
      setBank(r.entries)
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

  const generate = useCallback(async (): Promise<void> => {
    setBusy(true); setError(''); setNotice(''); setJustAdopted(new Set())
    try {
      const r = await api.nameForgeGenerate(category, count, hint)
      setCandidates(r.candidates)
      if (r.candidates.length === 0) setNotice('模型没给出可用候选，调整补充要求再试')
    } catch (err) {
      setCandidates([])
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, category, count, hint])

  const adopt = useCallback(async (items: NameForgeCandidate[]): Promise<void> => {
    if (items.length === 0) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.nameForgeAdopt(category, items)
      setJustAdopted(prev => {
        const next = new Set(prev)
        for (const it of items) next.add(it.name)
        return next
      })
      await refresh()
      setNotice(`已采纳 ${items.length} 个${specLabel(category)}，下一次生成/审稿生效`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, category, refresh])

  const discard = useCallback(async (id: string): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      await api.nameForgeDiscard(id)
      await refresh()
      setNotice('已从名字库移除')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, refresh])

  const pending = candidates.filter(c => !justAdopted.has(c.name))

  return (
    <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
      <div className={`${css.row} ${css.rowBetween} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>取名（本书）</span>
        <span className={css.meta}>采纳后才注入写作提示词</span>
      </div>

      <SlideNav
        ariaLabel="取名类别"
        items={NAME_CATEGORIES.map(c => ({ id: c.id, label: c.label }))}
        active={category}
        onSelect={id => { setCategory(id); setCandidates([]); setJustAdopted(new Set()) }}
      />
      <span className={css.meta}>{specHint(category)}</span>

      <div className={`${css.row} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
        <div className={css.row} style={{ gap: 'var(--nf-space-4)' }}>
          <span className={css.meta}>数量</span>
          {COUNT_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              className={count === n ? css.buttonPrimary : css.button}
              onClick={() => setCount(n)}
              disabled={busy}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" className={css.buttonPrimary} disabled={busy} onClick={() => { void generate() }}>
          {busy ? '生成中…' : `生成${specLabel(category)}`}
        </button>
      </div>

      <input
        className={css.input}
        value={hint}
        placeholder={specPlaceholder(category)}
        onChange={e => setHint(e.target.value)}
        disabled={busy}
      />

      {notice !== '' && <NoticeBar kind="ok">{notice}</NoticeBar>}
      {error !== '' && (
        <NoticeBar
          kind="error"
          detail="取名失败时本次候选未入账，名字库内容不受影响。重试会按当前类别与补充要求重新生成。"
          onRetry={() => { void generate() }}
        >
          {error}
        </NoticeBar>
      )}

      {candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
          <div className={`${css.row} ${css.rowBetween}`}>
            <span className={css.meta}>候选 {candidates.length} 个（采纳前不入库）</span>
            {pending.length > 1 && (
              <button type="button" className={css.button} disabled={busy} onClick={() => { void adopt(pending) }}>
                全部采纳（{pending.length}）
              </button>
            )}
          </div>
          {candidates.map(c => {
            const done = justAdopted.has(c.name)
            return (
              <div key={c.name} className={`${css.row} ${css.rowBetween}`} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: '6px 8px', gap: 'var(--nf-space-8)' }}>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 'var(--nf-fs-12)' }}>{c.name}</b>
                  {c.note !== '' && <span className={css.meta} style={{ marginLeft: 8 }}>{c.note}</span>}
                </span>
                <button
                  type="button"
                  className={done ? css.button : css.buttonPrimary}
                  disabled={busy || done}
                  onClick={() => { void adopt([c]) }}
                >
                  {done ? '已采纳' : '采纳'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
        <div className={`${css.row} ${css.rowBetween}`}>
          <span className={css.cardTitle}>名字库（{bank.length}）</span>
          <span className={css.meta}>每类上限 60 · 全书 200</span>
        </div>
        {bank.length === 0 && <span className={css.meta}>还没有采纳的名字。生成一批，挑顺眼的采纳。</span>}
        {NAME_CATEGORIES.map(spec => {
          const items = bank.filter(e => e.category === spec.id)
          if (items.length === 0) return null
          return (
            <div key={spec.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className={css.meta}>{spec.label} · {items.length}</span>
              <div className={`${css.row} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-4)' }}>
                {items.map(e => (
                  <span key={e.id} className={`${css.row}`} style={{ gap: 4, border: '1px solid var(--nf-border)', borderRadius: 6, padding: '2px 6px' }}>
                    <span style={{ fontSize: 'var(--nf-fs-12)' }}>{e.name}</span>
                    <button
                      type="button"
                      className={css.iconBtn}
                      title="从名字库移除"
                      aria-label={`移除 ${e.name}`}
                      disabled={busy}
                      onClick={() => { void discard(e.id) }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function specLabel(id: NameCategory): string {
  return NAME_CATEGORIES.find(c => c.id === id)?.label ?? '名字'
}

function specHint(id: NameCategory): string {
  return NAME_CATEGORIES.find(c => c.id === id)?.hint ?? ''
}

function specPlaceholder(id: NameCategory): string {
  return NAME_CATEGORIES.find(c => c.id === id)?.placeholder ?? ''
}
