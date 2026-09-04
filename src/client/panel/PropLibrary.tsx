/**
 * 道具库：从已写章节自动提炼「常驻道具」（跨镜头需保持一致）→ 注入每个分镜提示词。
 * 支持：AI 提炼 / 手动增删改 / 保存；道具一行统一外观描述，提示词按此外观保持跨镜头一致。
 */
import { useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ProjectState, Prop } from '../../protocol.ts'
import css from './panel.module.css'

export function PropLibrary({
  api,
  project,
  refresh,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  refresh: () => void | Promise<void>
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Prop | null>(null)
  const [extracted, setExtracted] = useState<Prop[] | null>(null)

  const notify = (msg: string): void => { setNotice(msg); setTimeout(() => { setNotice('') }, 3000) }
  const report = (text: string, kind: 'info' | 'done' | 'error' = 'info'): void => { onProgress?.(text, kind) }

  const props = (project?.props ?? []).map(p => ({ ...p }))

  /** AI 提炼：从已写章节识别常驻道具，暂存为候选，待保存采纳。 */
  const extract = async (): Promise<void> => {
    setBusy(true); setError('')
    report('从已写章节提炼常驻道具…')
    try {
      const res = await api.mangaProps({ op: 'extract' })
      setExtracted(res.props ?? [])
      await refresh()
      report('道具提炼完成：' + (res.props ?? []).length + ' 个常驻道具', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('道具提炼失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  /** 保存：整体替换道具库（候选 / 手动清单）。 */
  const save = async (list: Prop[]): Promise<void> => {
    const cleaned = list.map(p => ({ name: p.name.trim(), desc: p.desc.trim() })).filter(p => p.name !== '')
    if (cleaned.length === 0) { setError('道具名为空，无法保存'); return }
    setBusy(true); setError('')
    report('保存道具库…')
    try {
      await api.mangaProps({ op: 'save', props: cleaned })
      await refresh()
      setExtracted(null)
      setEditing(null)
      report('道具库已保存：' + cleaned.length + ' 个', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('保存道具库失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入道具库。</span></div>
  }

  const editingList: Prop[] = extracted ?? props

  return (
    <div className={css.card} style={{ flex: 1, minHeight: 0 }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>🎒 道具库</span>
        <span className={css.meta}>常驻道具（跨镜头需保持一致）：提炼自已写章节，自动注入每个分镜提示词</span>
      </div>
      <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-2)' }}>
        流程位置：道具库（选做） · 前置：已写章节 · 作用：分镜提示词里道具外观跨镜头统一
      </span>

      <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)', margin: '8px 0' }}>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void extract() }}>
          {busy ? '⏳ 提炼中…' : '✨ 提炼道具'}
        </button>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setEditing({ name: '', desc: '' }) }}>＋ 手动添加</button>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { void refresh(); report('道具库已刷新', 'done') }}>🔄 刷新</button>
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}
      {notice !== '' && <div className={css.importResult} style={{ padding: 'var(--nf-space-6) var(--nf-space-10)' }}>{notice}</div>}

      {/* 提炼候选：待保存 */}
      {extracted !== null && (
        <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-10)', marginBottom: 'var(--nf-space-10)' }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 'var(--nf-fs-14)' }}>✨ AI 提炼结果（确认/编辑后保存）</b>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setExtracted(null) }}>取消</button>
          </div>
          {extracted.length === 0
            ? <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-6)' }}>未识别到明显常驻道具（仅一次性出现的道具不列入）。可手动添加。</span>
            : <PropRows rows={editingList} setRows={setExtracted} />}
          {extracted.length > 0 && (
            <div className={css.row} style={{ marginTop: 'var(--nf-space-8)', gap: 'var(--nf-space-6)' }}>
              <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void save(extracted) }}>保存道具库</button>
              <span className={css.meta}>保存后会注入所有分镜提示词，跨镜头统一此道具外观</span>
            </div>
          )}
        </div>
      )}

      {/* 手动添加/编辑行 */}
      {editing !== null && extracted === null && (
        <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-10)', marginBottom: 'var(--nf-space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          <b style={{ fontSize: 'var(--nf-fs-14)' }}>编辑道具</b>
          <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} placeholder="道具名（如 外卖电动车）" value={editing.name} onChange={e => { setEditing({ ...editing, name: e.target.value }) }} />
          <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} placeholder="一行统一外观描述（颜色/材质/状态）" value={editing.desc} onChange={e => { setEditing({ ...editing, desc: e.target.value }) }} />
          <div className={css.row} style={{ gap: 'var(--nf-space-6)' }}>
            <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || editing.name.trim() === ''} onClick={() => {
              const list = props
              const idx = list.findIndex(p => p.name === editing.name)
              if (idx >= 0) list[idx] = editing
              else list.push(editing)
              void save(list)
            }}>保存</button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setEditing(null) }}>取消</button>
          </div>
        </div>
      )}

      {props.length === 0 && extracted === null ? (
        <div className={css.shelfEmpty} style={{ minHeight: 140, flex: 1 }}>
          <span className={css.shelfEmptyIcon}>🎒</span>
          <span className={css.shelfEmptyTitle}>道具库为空</span>
          <span className={css.meta}>点「✨ 提炼道具」自动识别，或「＋ 手动添加」</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          {props.map(p => (
            <div key={p.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', display: 'flex', alignItems: 'center', gap: 'var(--nf-space-10)' }}>
              <span style={{ fontSize: 'var(--nf-fs-14)', fontWeight: 600, minWidth: 110 }}>{p.name}</span>
              <span className={css.meta} style={{ flex: 1 }}>{p.desc}</span>
              <span className={css.row} style={{ gap: 'var(--nf-space-4)' }}>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setEditing({ ...p }) }}>✏️ 编辑</button>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ color: 'var(--nf-danger, #e05)' }} onClick={() => { void save(props.filter(x => x.name !== p.name)) }}>🗑</button>
              </span>
            </div>
          ))}
          <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ alignSelf: 'flex-start' }} onClick={() => { void refresh() }}>已是最新</button>
        </div>
      )}
    </div>
  )
}

/** 可编辑道具行（提炼候选用）。 */
function PropRows({ rows, setRows }: { rows: Prop[]; setRows: (r: Prop[]) => void }) {
  const set = (idx: number, patch: Partial<Prop>): void => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    setRows(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', marginTop: 'var(--nf-space-6)' }}>
      {rows.map((p, i) => (
        <div key={i} className={css.row} style={{ gap: 'var(--nf-space-6)' }}>
          <input className={css.input} style={{ flex: '0 0 140px', fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} value={p.name} onChange={e => { set(i, { name: e.target.value }) }} />
          <input className={css.input} style={{ flex: 1, fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} value={p.desc} onChange={e => { set(i, { desc: e.target.value }) }} />
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setRows(rows.filter((_, idx) => idx !== i)) }}>删</button>
        </div>
      ))}
      <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ alignSelf: 'flex-start' }} onClick={() => { setRows([...rows, { name: '', desc: '' }]) }}>＋ 添加</button>
    </div>
  )
}
