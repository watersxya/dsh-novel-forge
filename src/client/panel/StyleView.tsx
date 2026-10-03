/**
 * 风格漂移曲线：把「每一章离本书自己的风格基线有多远」画出来。
 *
 * 图上三条信息：基线（虚线，本书已过审章节的中位数）、逐章实际（折线）、显著偏离的章（红点）。
 * 指标可切换：句均长 / 短句占比 / 对话占比 / 段落均长。
 *
 * 两点刻意的设计：
 * 1. **基线与审稿同源** —— 用的是同一份 styleBaseline，所以图上看到的就是审稿判偏离用的那把尺子。
 *    若各画各的，作者会看到两个不一致的结论。
 * 2. **数值即时算、不落盘** —— 数据源就是章节文件本身，存一份快照只会带来陈旧问题。
 *
 * 只画四项长度/比率指标：句长起伏与意象密度是诊断用的，画成曲线反而难读。
 */

import { useCallback, useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { StyleHistoryPoint, StyleHistoryResponse } from '../../protocol.ts'
import css from './panel.module.css'

/** 可画的四项指标。 */
type MetricKey = 'avgSentenceLength' | 'shortSentenceRatio' | 'dialogueRatio' | 'avgParagraphLength'

const METRICS: Array<{ key: MetricKey; label: string; percent: boolean }> = [
  { key: 'avgSentenceLength', label: '句均长', percent: false },
  { key: 'shortSentenceRatio', label: '短句占比', percent: true },
  { key: 'dialogueRatio', label: '对话占比', percent: true },
  { key: 'avgParagraphLength', label: '段落均长', percent: false },
]

/** 把服务端给的「指标 key + 方向箭头」显示成中文。 */
function labelOf(significant: string): string {
  const found = METRICS.find(m => significant.startsWith(m.key))
  return found === undefined ? significant : found.label + significant.slice(found.key.length)
}

/** 简易折线图（SVG，无依赖）：横轴按章节序号均分，纵轴按本图最大值归一。 */
function DriftChart({ points, metric, baseline, percent }: {
  points: StyleHistoryPoint[]
  metric: MetricKey
  baseline?: number
  percent: boolean
}): JSX.Element {
  const W = 720
  const H = 200
  const padX = 28
  const padY = 16
  const n = points.length
  const values = points.map(p => (p.measured ? p[metric] : undefined))
  const known = values.filter((v): v is number => v !== undefined)
  const maxRaw = Math.max(baseline ?? 0, ...known)
  const max = maxRaw > 0 ? maxRaw * 1.12 : 1
  const x = (i: number): number => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2))
  const y = (v: number): number => padY + (1 - v / max) * (H - padY * 2)
  const fmt = (v: number): string => (percent ? (v * 100).toFixed(1) + '%' : v.toFixed(1))
  const line = values
    .map((v, i) => (v === undefined ? null : x(i).toFixed(1) + ',' + y(v).toFixed(1)))
    .filter((s): s is string => s !== null)
    .join(' ')
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" height={H} role="img" aria-label="风格漂移曲线">
      {[0, 0.5].map(r => (
        <line key={r} x1={padX} x2={W - padX} y1={y(max * r)} y2={y(max * r)} stroke="var(--nf-border)" strokeWidth={0.5} strokeDasharray="3 4" />
      ))}
      <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="var(--nf-border)" strokeWidth={1} />
      <text x={4} y={y(max) + 10} fontSize={9} fill="var(--nf-text-2)">{fmt(max)}</text>
      <text x={4} y={y(0) + 3} fontSize={9} fill="var(--nf-text-2)">0</text>
      {baseline !== undefined && baseline > 0 && (
        <g>
          <line x1={padX} x2={W - padX} y1={y(baseline)} y2={y(baseline)} stroke="var(--nf-accent)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />
          <text x={W - padX} y={y(baseline) - 4} fontSize={9} textAnchor="end" fill="var(--nf-accent)">基线 {fmt(baseline)}</text>
        </g>
      )}
      {line !== '' && <polyline points={line} fill="none" stroke="var(--nf-text-2)" strokeWidth={1.5} />}
      {points.map((p, i) => {
        const v = values[i]
        if (v === undefined) return null
        const off = p.significant.some(s => s.startsWith(metric))
        return (
          <circle key={p.no} cx={x(i)} cy={y(v)} r={off ? 3.4 : 2} fill={off ? 'var(--nf-error)' : 'var(--nf-success)'}>
            <title>{'第' + p.no + '章 ' + p.title + '｜' + fmt(v) + (off ? '｜偏离：' + p.significant.map(labelOf).join('、') : '')}</title>
          </circle>
        )
      })}
    </svg>
  )
}

export interface StyleViewProps {
  api: NovelApi
}

export default function StyleView({ api }: StyleViewProps): JSX.Element {
  const [data, setData] = useState<StyleHistoryResponse | null>(null)
  const [error, setError] = useState('')
  const [metric, setMetric] = useState<MetricKey>('avgSentenceLength')

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      setData(await api.styleHistory())
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

  const points = data?.points ?? []
  const measured = points.filter(p => p.measured)
  const offChapters = points.filter(p => p.significant.length > 0)
  const current = METRICS.find(m => m.key === metric) ?? METRICS[0]!
  const baseline = data?.baseline === null || data?.baseline === undefined ? undefined : data.baseline[metric]

  return (
    <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>风格漂移曲线</span>
        <span className={css.meta}>
          {points.length} 章 · 可测 {measured.length} 章 · 偏离 {offChapters.length} 章
          {data !== null && data.baselineLabel !== '' ? ' · 基线：' + data.baselineLabel : ''}
        </span>
      </div>

      <div className={css.row} style={{ gap: 'var(--nf-space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className={css.input} value={metric} onChange={e => setMetric(e.target.value as MetricKey)}>
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <span className={css.meta}>虚线＝本书风格基线；红点＝该指标超出容忍度。基线与审稿同源。</span>
        <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void refresh() }}>刷新</button>
      </div>

      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-text-12)' }}>{error}</span>}

      {measured.length === 0
        ? <span className={css.meta}>还没有可测的章节正文（每章需 200 字以上才能算指标）。先在「总编台 → 生产单」写几章。</span>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
            <DriftChart points={points} metric={metric} baseline={baseline} percent={current.percent} />
            {offChapters.length > 0 && (
              <div style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8, background: 'var(--nf-bg-inset)', maxHeight: 220, overflowY: 'auto' }}>
                <b style={{ fontSize: 'var(--nf-fs-12)' }}>偏离章节 {offChapters.length} 章</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {offChapters.map(p => (
                    <div key={p.no} style={{ fontSize: 'var(--nf-fs-12)' }}>
                      <span className={css.lfPill} data-phase="requesting">第 {p.no} 章</span>
                      <span style={{ marginLeft: 6 }}>{p.title}</span>
                      <span className={css.meta} style={{ marginLeft: 6 }}>{p.significant.map(labelOf).join('、')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
