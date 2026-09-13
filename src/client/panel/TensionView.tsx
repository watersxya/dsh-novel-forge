/**
 * 张力曲线：把「每章该有多紧」画出来并可逐章调整。
 *
 * 图上是三条线：
 *   参考（虚线，形状预设） / 目标（实线，作者或规划设定） / 实际（散点，审稿打分）。
 * 下方列出规则核对发现的曲线级问题（连续同值、高位不回落、长期低位、实际偏离目标）。
 *
 * 张力只影响写作提示词里的"松紧"指引，不改变任何校验规则。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { TensionCurvePoint, TensionCurvePreset, TensionIssue, TensionResponse } from '../../protocol.ts'
import { TENSION_PRESET_LABELS } from '../../tension.ts'
import css from './panel.module.css'

const PRESETS: TensionCurvePreset[] = ['escalation', 'suspense', 'wave', 'frontLoad', 'flat', 'custom']

/** 简易折线图（SVG，无依赖）：宽高固定，按章节数均分横轴。 */
function CurveChart({ points, onPick }: { points: TensionCurvePoint[]; onPick: (no: number) => void }): JSX.Element {
  const W = 720
  const H = 200
  const padX = 28
  const padY = 16
  const n = points.length
  const x = (i: number): number => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2))
  const y = (v: number): number => padY + (1 - v / 100) * (H - padY * 2)
  const line = (pick: (p: TensionCurvePoint) => number | undefined): string => points
    .map((p, i) => {
      const v = pick(p)
      return v === undefined ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    .filter((s): s is string => s !== null)
    .join(' ')
  const refLine = line(p => p.reference)
  const targetLine = line(p => p.target)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="张力曲线">
      {/* 网格：0 / 40 / 80 三条参考线 */}
      {[0, 40, 80, 100].map(v => (
        <g key={v}>
          <line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="var(--nf-border)" strokeWidth={v === 0 || v === 100 ? 1 : 0.5} strokeDasharray={v === 0 || v === 100 ? '' : '3 4'} />
          <text x={4} y={y(v) + 3} fontSize={9} fill="var(--nf-text-2)">{v}</text>
        </g>
      ))}
      {refLine !== '' && <polyline points={refLine} fill="none" stroke="var(--nf-text-2)" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />}
      {targetLine !== '' && <polyline points={targetLine} fill="none" stroke="var(--nf-accent)" strokeWidth={2} />}
      {points.map((p, i) => (
        <g key={p.no}>
          {p.actual !== undefined && <circle cx={x(i)} cy={y(p.actual)} r={3} fill="var(--nf-success)" />}
          {p.target !== undefined && <circle cx={x(i)} cy={y(p.target)} r={2.5} fill="var(--nf-accent)" />}
          <rect
            x={x(i) - 6}
            y={padY}
            width={12}
            height={H - padY * 2}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onPick(p.no)}
          >
            <title>{`第${p.no}章 ${p.title}｜目标 ${p.target ?? '—'}｜实际 ${p.actual ?? '—'}｜参考 ${p.reference ?? '—'}`}</title>
          </rect>
        </g>
      ))}
    </svg>
  )
}

export interface TensionViewProps {
  api: NovelApi
  /** 一键按建议修订（合并审稿/张力/时间线后改这一章；由父级统一发起）。 */
  onRevise?: (chapterNo: number) => void
  /** 外部忙碌态（修订进行中时禁用按钮）。 */
  busy?: boolean
}

export default function TensionView({ api, onRevise, busy: outerBusy }: TensionViewProps): JSX.Element {
  const [data, setData] = useState<TensionResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState(50)

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      setData(await api.tension())
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

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

  const changePreset = (preset: TensionCurvePreset): void => {
    void run(`已切换参考曲线：${TENSION_PRESET_LABELS[preset]}`, async () => {
      await api.tensionPreset(preset)
      await refresh()
    })
  }

  const saveEdit = (): void => {
    if (editing === null) return
    void run(`第 ${editing} 章目标张力已设为 ${draft}`, async () => {
      await api.tensionSet(editing, draft)
      setEditing(null)
      await refresh()
    })
  }

  const clearEdit = (): void => {
    if (editing === null) return
    void run(`已清除第 ${editing} 章的目标张力`, async () => {
      await api.tensionSet(editing)
      setEditing(null)
      await refresh()
    })
  }

  const issues: TensionIssue[] = data?.issues ?? []
  const points = data?.points ?? []
  const stat = useMemo(() => {
    const targets = points.map(p => p.target).filter((v): v is number => v !== undefined)
    const actuals = points.map(p => p.actual).filter((v): v is number => v !== undefined)
    const avg = (xs: number[]): string => (xs.length === 0 ? '—' : String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)))
    return { targetAvg: avg(targets), actualAvg: avg(actuals), rated: actuals.length, total: points.length }
  }, [points])

  return (
    <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>张力曲线</span>
        <span className={css.meta}>{points.length} 章 · 已评 {stat.rated} 章 · 目标均 {stat.targetAvg} / 实际均 {stat.actualAvg}</span>
      </div>

      <div className={css.row} style={{ gap: 'var(--nf-space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className={css.input} value={data?.preset ?? 'escalation'} disabled={busy} onChange={e => changePreset(e.target.value as TensionCurvePreset)}>
          {PRESETS.map(p => <option key={p} value={p}>{TENSION_PRESET_LABELS[p]}</option>)}
        </select>
        <span className={css.meta}>虚线＝参考曲线形状；实线＝目标；绿点＝审稿实际。点图中任意一章可改目标张力。</span>
      </div>

      {notice !== '' && <span style={{ color: 'var(--nf-success)', fontSize: 'var(--nf-text-12)' }}>{notice}</span>}
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-text-12)' }}>{error}</span>}

      {points.length === 0
        ? <span className={css.meta}>还没有章节计划。先在「总编台 → 卷/章节计划」排出章节，这里才有曲线可看。</span>
        : <CurveChart points={points} onPick={no => {
            const p = points.find(x => x.no === no)
            setEditing(no)
            setDraft(p?.target ?? p?.actual ?? 50)
          }} />}

      {issues.length > 0 && (
        <div style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8, background: 'var(--nf-bg-inset)' }}>
          <b style={{ fontSize: 'var(--nf-fs-12)' }}>曲线级问题 {issues.length} 条</b>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 'var(--nf-fs-12)' }}>
                <span className={css.lfPill} data-phase={issue.severity === 'high' ? 'failed' : 'requesting'}>{issue.severity === 'high' ? '高' : issue.severity === 'medium' ? '中' : '低'}</span>
                <span style={{ marginLeft: 6 }}>{issue.chapters.length > 0 ? `第 ${issue.chapters.join('、')} 章：` : ''}{issue.item}</span>
                {issue.suggestion !== '' && <div className={css.meta} style={{ marginLeft: 6 }}>建议：{issue.suggestion}</div>}
                {onRevise !== undefined && issue.chapters.length > 0 && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall}`}
                    style={{ marginLeft: 6, marginTop: 2 }}
                    disabled={busy || outerBusy === true}
                    title="把该章的张力偏差与审稿意见、时间线矛盾合并成一轮修订（只改这一章，改完自动复核）"
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

      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--nf-bg)', border: '1px solid var(--nf-border)', borderRadius: 10, width: 'min(420px, 92vw)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 'var(--nf-fs-13)' }}>第 {editing} 章 · 目标张力</b>
            <input type="range" min={0} max={100} value={draft} onChange={e => setDraft(Number(e.target.value))} />
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.meta}>{draft} / 100（{draft < 40 ? '偏松：铺垫、日常、消化信息' : draft > 80 ? '偏紧：对抗、揭示、抉择、代价' : '中等：推进为主' }）</span>
              <input className={css.input} style={{ width: 72 }} type="number" min={0} max={100} value={draft} onChange={e => setDraft(Math.max(0, Math.min(100, Number(e.target.value))))} />
            </div>
            <div className={css.row} style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" className={css.button} onClick={clearEdit} disabled={busy}>清除</button>
              <button type="button" className={css.button} onClick={() => setEditing(null)}>取消</button>
              <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={saveEdit} disabled={busy}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
