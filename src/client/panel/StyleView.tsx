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
 * 页面分两截，各管一把尺子：
 * - **风格目标卡**（上）：生成端的锚点，作者显式蒸馏后落盘；审稿不读它；
 * - **漂移曲线**（下）：审稿端的自适应尺子，实时算。两者刻意分开，见 style-profile.ts 文件头。
 *
 * 只画四项长度/比率指标：句长起伏与意象密度是诊断用的，画成曲线反而难读。
 */

import { useCallback, useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { StyleHistoryPoint, StyleHistoryResponse, StyleProfile, StyleProfileResponse } from '../../protocol.ts'
import { NoticeBar } from './NoticeBar.tsx'
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

/** 风格卡的六项指标展示（比率型转百分比）。 */
const CARD_METRICS: Array<{ key: keyof StyleProfile['fingerprint']; label: string; percent: boolean }> = [
  { key: 'avgSentenceLength', label: '句均长', percent: false },
  { key: 'sentenceLengthCv', label: '句长起伏', percent: false },
  { key: 'shortSentenceRatio', label: '短句占比', percent: true },
  { key: 'dialogueRatio', label: '对话占比', percent: true },
  { key: 'avgParagraphLength', label: '段落均长', percent: false },
  { key: 'imageryPer1000', label: '意象密度', percent: false },
]

function fmtCardValue(value: number, percent: boolean): string {
  return percent ? (value * 100).toFixed(1) + '%' : value.toFixed(2)
}

/** 风格目标卡（生成端锚点）：展示 + 蒸馏 + 清除。 */
function StyleProfileCard({ api, onChanged }: { api: NovelApi; onChanged: () => void }): JSX.Element {
  const [data, setData] = useState<StyleProfileResponse | null>(null)
  const [sampleText, setSampleText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      setData(await api.styleProfile())
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

  const run = useCallback(async (action: 'distill-archived' | 'distill-sample' | 'clear'): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'clear') {
        await api.styleProfileClear()
        setNotice('已恢复默认（回落绑定资产的样本文本）')
      } else {
        const r = await api.styleProfileDistill(action, action === 'distill-sample' ? sampleText : undefined)
        setNotice(r.profile === null ? '蒸馏失败' : `已蒸馏：${r.profile.label}——下一次生成/审稿生效`)
      }
      await refresh()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, sampleText, refresh, onChanged])

  const profile = data?.profile ?? null
  const approved = data?.approvedChapters ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
      <div className={`${css.row} ${css.rowBetween} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>风格目标卡（生成端）</span>
        <span className={css.meta}>当前生效：{data?.effectiveLabel ?? '—'}</span>
      </div>
      <span className={css.meta}>
        把「这本书的写法」固化成确定性指标区间，注入每一次正文生成。与下方漂移曲线（审稿尺子）**刻意分开**：
        尺子跟着书自适应，卡只在作者蒸馏时变——否则生成目标会跟着漂移一起走，越写越偏且互相认证。
      </span>

      {notice !== '' && <NoticeBar kind="ok">{notice}</NoticeBar>}
      {error !== '' && (
        <NoticeBar kind="error" detail="蒸馏失败时原卡不变，生成目标不受影响。重试会重新提交当前操作。" onRetry={() => { void refresh() }}>
          {error}
        </NoticeBar>
      )}

      {profile !== null && (
        <div style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={`${css.row} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
            <b style={{ fontSize: 'var(--nf-fs-12)' }}>{profile.label}</b>
            <span className={css.meta}>
              {profile.source === 'archived' ? '本书已归档章节蒸馏' : '参考样本蒸馏'}
              {profile.sampleChapters !== undefined ? ` · 采样 ${profile.sampleChapters} 章` : ''}
            </span>
          </div>
          <div className={`${css.row} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
            {CARD_METRICS.map(m => (
              <span key={m.key} className={css.meta}>
                {m.label} <b style={{ color: 'var(--nf-text-1)' }}>{fmtCardValue(profile.fingerprint[m.key], m.percent)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={`${css.row} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
        <button
          type="button"
          className={css.button + ' ' + css.buttonPrimary}
          disabled={busy || approved < 3}
          title={approved < 3 ? '至少需要 3 章已过审章节' : `用本书已过审的 ${approved} 章（等距抽样）蒸馏中位数风格`}
          onClick={() => { void run('distill-archived') }}
        >
          用已归档章节蒸馏（{approved} 章）
        </button>
        {profile !== null && (
          <button type="button" className={css.button} disabled={busy} onClick={() => { void run('clear') }}>
            恢复默认
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className={css.meta}>或粘贴一段参考样文本（≥200 字，取你想让全书靠近的写法）：</span>
        <textarea
          className={css.textarea}
          rows={3}
          value={sampleText}
          placeholder="粘贴参考正文（自己的旧作或对标作品的片段）……"
          onChange={e => setSampleText(e.target.value)}
          disabled={busy}
        />
        <div className={`${css.row} ${css.rowEnd}`}>
          <button type="button" className={css.button} disabled={busy || sampleText.trim().length < 200} onClick={() => { void run('distill-sample') }}>
            按样本蒸馏
          </button>
        </div>
      </div>
    </div>
  )
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
      <div className={`${css.row} ${css.rowBetween} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>风格漂移曲线</span>
        <span className={css.meta}>
          {points.length} 章 · 可测 {measured.length} 章 · 偏离 {offChapters.length} 章
          {data !== null && data.baselineLabel !== '' ? ' · 基线：' + data.baselineLabel : ''}
        </span>
      </div>

      <StyleProfileCard api={api} onChanged={refresh} />

      <div style={{ borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
      <div className={css.row}>
        <select className={css.input} value={metric} onChange={e => setMetric(e.target.value as MetricKey)}>
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <span className={css.meta}>虚线＝本书风格基线；红点＝该指标超出容忍度。基线与审稿同源。</span>
        <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void refresh() }}>刷新</button>
      </div>
      {error !== '' && (
        <NoticeBar
          kind="error"
          detail="风格漂移需要已有章节正文（每章 200 字以上）。若刚写完新章，重试通常就能算出指标。"
          onRetry={() => { void refresh() }}
        >
          {error}
        </NoticeBar>
      )}

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
    </div>
  )
}
