/**
 * 故事时间线：把逐章抽取的「时间点 / 地点 / 在场角色 / 事件」按章节顺序排开，
 * 带规则初筛 + AI 复核的矛盾清单，并支持就地修正（手改后标记为 manual）。
 *
 * 与「编年录」的分工：编年录记事实状态，这里记**顺序**——专门抓时间倒流、
 * 地点瞬移、跨度不合理这类长篇最容易崩的地方。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { TimelineEvent, TimelineIssue } from '../../protocol.ts'
import css from './panel.module.css'

type Severity = TimelineIssue['severity']

const SEVERITY_LABEL: Record<Severity, string> = { high: '高', medium: '中', low: '低' }

export interface TimelineViewProps {
  api: NovelApi
  /** 章节号列表（用于「抽取本章」下拉）。 */
  chapters: number[]
  /** 一键按建议修订（合并审稿/时间线/张力后改这一章；由父级统一发起）。 */
  onRevise?: (chapterNo: number) => void
  /** 外部忙碌态（修订进行中时禁用按钮）。 */
  busy?: boolean
}

export default function TimelineView({ api, chapters, onRevise, busy: outerBusy }: TimelineViewProps): JSX.Element {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [issues, setIssues] = useState<TimelineIssue[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [extractNo, setExtractNo] = useState<number | ''>(chapters[chapters.length - 1] ?? '')
  const [editing, setEditing] = useState<TimelineEvent | null>(null)

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      const r = await api.timeline()
      setEvents(r.events)
      setIssues(r.issues ?? [])
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

  const grouped = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>()
    for (const e of events) {
      const list = map.get(e.chapterNo) ?? []
      list.push(e)
      map.set(e.chapterNo, list)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [events])

  const run = useCallback(async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      await fn()
      setNotice(label)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleExtract = (): void => {
    if (extractNo === '') return
    void run(`已抽取第 ${extractNo} 章时间线`, async () => {
      await api.timelineExtract(Number(extractNo))
      await refresh()
    })
  }

  const handleCheck = (): void => {
    void run('时间线检查完成', async () => {
      const r = await api.timelineCheck()
      setIssues(r.issues ?? [])
    })
  }

  const handleSaveEdit = (): void => {
    if (editing === null) return
    void run('已保存修改', async () => {
      await api.timelineUpdate({ ...editing, source: 'manual' })
      setEditing(null)
      await refresh()
    })
  }

  const handleRemove = (id: string): void => {
    void run('已删除该事件', async () => {
      await api.timelineRemove(id)
      await refresh()
    })
  }

  return (
    <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>故事时间线</span>
        <span className={css.meta}>{events.length} 条事件 · {grouped.length} 章</span>
      </div>

      <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-8)', alignItems: 'center' }}>
        <select
          className={css.input}
          value={extractNo}
          onChange={e => setExtractNo(e.target.value === '' ? '' : Number(e.target.value))}
          title="选择要抽取时间线的章节"
        >
          <option value="">选择章节…</option>
          {chapters.map(no => <option key={no} value={no}>第 {no} 章</option>)}
        </select>
        <button type="button" className={css.button} disabled={busy || extractNo === ''} onClick={handleExtract}>抽取本章时间线</button>
        <button type="button" className={css.button} disabled={busy || events.length === 0} onClick={handleCheck}>检查时间线矛盾</button>
      </div>

      {notice !== '' && <span style={{ color: 'var(--nf-success)', fontSize: 'var(--nf-text-12)' }}>{notice}</span>}
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-text-12)' }}>{error}</span>}

      {issues.length > 0 && (
        <div style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8, background: 'var(--nf-bg-inset)' }}>
          <b style={{ fontSize: 'var(--nf-fs-12)' }}>发现 {issues.length} 处时间线问题</b>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 'var(--nf-fs-12)' }}>
                <span className={css.lfPill} data-phase={issue.severity === 'high' ? 'failed' : 'requesting'}>{SEVERITY_LABEL[issue.severity]}</span>
                <span style={{ marginLeft: 6 }}>{issue.chapters.length > 0 ? `第 ${issue.chapters.join('、')} 章：` : ''}{issue.item}</span>
                {issue.suggestion !== '' && <div className={css.meta} style={{ marginLeft: 6 }}>建议：{issue.suggestion}</div>}
                {onRevise !== undefined && issue.chapters.length > 0 && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall}`}
                    style={{ marginLeft: 6, marginTop: 2 }}
                    disabled={busy || outerBusy === true}
                    title="把该章的时间线矛盾与审稿意见、张力偏差合并成一轮修订（只改这一章，改完自动复核）"
                    onClick={() => { onRevise(issue.chapters[0]!) }}
                  >
                    一键按建议修订（第 {issue.chapters[0]} 章）
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: '52vh' }}>
        {events.length === 0 && <span className={css.meta}>还没有时间线事件。生成章节后会自动抽取，也可以在上面选一章手工抽取。</span>}
        {grouped.map(([no, list]) => (
          <div key={no}>
            <div className={css.meta} style={{ marginBottom: 4 }}>第 {no} 章 · {list.length} 条</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map(e => (
                <div key={e.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: '6px 8px', fontSize: 'var(--nf-fs-12)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b>{e.time !== '' ? e.time : '（未标注时间）'}</b>
                    {e.place !== '' && <span className={css.meta}>@{e.place}</span>}
                    {e.characters.length > 0 && <span className={css.meta}>{e.characters.join('、')}</span>}
                    {e.source === 'manual' && <span className={css.meta}>（手改）</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button type="button" className={css.iconButton} title="修正这条事件" onClick={() => setEditing({ ...e })}>✎</button>
                      <button type="button" className={css.iconButton} title="删除这条事件" onClick={() => handleRemove(e.id)}>×</button>
                    </span>
                  </div>
                  <div style={{ marginTop: 2 }}>{e.event}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setEditing(null)}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: 'var(--nf-bg)', border: '1px solid var(--nf-border)', borderRadius: 10, width: 'min(560px, 94vw)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 'var(--nf-fs-13)' }}>修正时间线事件 · 第 {editing.chapterNo} 章</b>
            <label className={css.field}>
              <span className={css.fieldLabel}>故事内时间</span>
              <input className={css.input} value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} placeholder="如：第三日黄昏 / 入宗三个月后" />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>地点</span>
              <input className={css.input} value={editing.place} onChange={e => setEditing({ ...editing, place: e.target.value })} />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>在场角色（顿号或逗号分隔）</span>
              <input className={css.input} value={editing.characters.join('、')} onChange={e => setEditing({ ...editing, characters: e.target.value.split(/[、,，\s]+/).filter(Boolean) })} />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>事件</span>
              <textarea className={css.textarea} rows={3} value={editing.event} onChange={e => setEditing({ ...editing, event: e.target.value })} />
            </label>
            <div className={css.row} style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" className={css.button} onClick={() => setEditing(null)}>取消</button>
              <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy} onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
