/**
 * 生产单面板：区间批量生产（计划补足 → 逐章生成 → 被拒分级处理 → 断点续跑）。
 * 与「AI进度」悬浮窗不同：这是标准流水线设备，一键下单、实时进度、日志可查。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { RunState } from '../../protocol.ts'
import css from './panel.module.css'

export function RunPanel({ api, totalChapters }: { api: NovelApi; totalChapters: number }) {
  const [run, setRun] = useState<RunState | null>(null)
  const [startNo, setStartNo] = useState<number>(1)
  const [endNo, setEndNo] = useState<number>(0)
  const [count, setCount] = useState<number>(30)
  const [mode, setMode] = useState<'count' | 'range'>('count')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // 默认起点：最后一章 + 1；count 模式终点 = 起点 + count - 1
  useEffect(() => {
    setStartNo(totalChapters + 1)
    setEndNo(totalChapters + 30)
  }, [totalChapters])

  const poll = useCallback(async () => {
    try {
      const s = await api.runStatus()
      setRun(s)
    } catch { /* 静默 */ }
  }, [api])

  // 运行期间每 5 秒轮询一次状态。
  useEffect(() => {
    void poll()
    const timer = window.setInterval(() => { void poll() }, 5000)
    return () => window.clearInterval(timer)
  }, [poll])

  // 日志自动滚底。
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [run?.log.length])

  const effectiveEnd = mode === 'count' ? startNo + count - 1 : endNo

  const handleStart = async (): Promise<void> => {
    setBusy(true)
    setErr('')
    try {
      const req = mode === 'count'
        ? { startNo, count }
        : { startNo, endNo }
      const s = await api.runStart(req)
      setRun(s)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleControl = async (action: 'pause' | 'resume' | 'stop'): Promise<void> => {
    setBusy(true)
    setErr('')
    try {
      const s = await api.runControl(action)
      if (s !== null) setRun(s)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const statusLabel = useMemo(() => {
    if (run === null) return '未启动'
    return {
      running: '🏭 生产中',
      paused: '⏸ 已暂停',
      done: '✅ 已完成',
      stopped: '⏹ 已停止',
      error: '❌ 异常',
    }[run.status] ?? run.status
  }, [run])

  const ratio = run !== null && run.endNo > run.startNo
    ? Math.min(Math.max((run.currentNo - run.startNo) / (run.endNo - run.startNo), 0), 1)
    : 0

  return (
    <div className={css.card} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle}>🏭 生产单（标准流水线：计划 → 生成 → 审稿 → 分级处理）</span>
        <span className={`${css.badge} ${run?.status === 'running' ? css.badgeWritten : run?.status === 'done' ? css.badgeDone : css.badgePending}`}>{statusLabel}</span>
      </div>

      <div className={css.meta}>
        一键下生产单：自动补计划 → 逐章生成（完整质量门：生成→摘要+事实→审稿→作者复盘）→ 被拒章分级处理（无 high 豁免 / 有 high 按意见修订+验证 / 两轮不过转待人工）。中断后可从断点继续。
      </div>

      {/* 下单区 */}
      <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-8)', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 'var(--nf-space-4)', alignItems: 'center' }}>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall} ${mode === 'count' ? css.buttonPrimary : ''}`}
            onClick={() => { setMode('count') }}
            title="从当前末章 +1 起，新增 N 章"
          >
            新增 N 章
          </button>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall} ${mode === 'range' ? css.buttonPrimary : ''}`}
            onClick={() => { setMode('range') }}
            title="指定起止章号区间"
          >
            指定区间
          </button>
        </div>
        {mode === 'count' ? (
          <>
            <div className={css.field} style={{ flex: 'none', minWidth: 90 }}>
              <label className={css.fieldLabel}>起始章</label>
              <input className={css.input} type="number" min={1} value={startNo} onChange={e => { setStartNo(Math.max(1, Number(e.target.value) || 1)) }} />
            </div>
            <div className={css.field} style={{ flex: 'none', minWidth: 90 }}>
              <label className={css.fieldLabel}>新增章数</label>
              <input className={css.input} type="number" min={1} max={200} value={count} onChange={e => { setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1))) }} />
            </div>
          </>
        ) : (
          <>
            <div className={css.field} style={{ flex: 'none', minWidth: 90 }}>
              <label className={css.fieldLabel}>起始章</label>
              <input className={css.input} type="number" min={1} value={startNo} onChange={e => { setStartNo(Math.max(1, Number(e.target.value) || 1)) }} />
            </div>
            <div className={css.field} style={{ flex: 'none', minWidth: 90 }}>
              <label className={css.fieldLabel}>结束章</label>
              <input className={css.input} type="number" min={1} value={endNo} onChange={e => { setEndNo(Math.max(1, Number(e.target.value) || 1)) }} />
            </div>
          </>
        )}
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || (run?.status === 'running')} onClick={() => { void handleStart() }} title="启动生产单">
          {run?.status === 'running' ? '生产中…' : run?.status === 'paused' ? '▶ 继续' : '▶ 下单生产'}
        </button>
        {run !== null && run.status !== 'done' && (
          <>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || run.status !== 'running'} onClick={() => { void handleControl('pause') }}>
              ⏸ 暂停
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || run.status === 'stopped'} onClick={() => { void handleControl('stop') }}>
              ⏹ 停止
            </button>
          </>
        )}
        {run !== null && run.status === 'paused' && (
          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleControl('resume') }}>
            ▶ 继续
          </button>
        )}
      </div>

      {err !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-12)' }}>{err}</div>}

      {/* 进度区 */}
      {run !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-8)' }}>
            <span className={css.meta}>范围：第 {run.startNo} - {run.endNo} 章 · 当前：第 {run.currentNo} 章</span>
            <span className={css.meta}>新生成 {run.stats?.generated ?? 0} · 修订通过 {run.stats?.revised ?? 0} · 豁免 {run.stats?.exempted ?? 0} · 重生成 {run.stats?.regenerated ?? 0} · 失败 {run.stats?.error ?? 0}</span>
          </div>
          <div className={css.bigProgressBar}>
            <div className={css.bigProgressBarFill} style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          {run.pendingManual.length > 0 && (
            <div className={css.meta} style={{ color: 'var(--nf-warn)' }}>
              ⚠️ 待人工：第 {run.pendingManual.join('、')} 章（两轮修订仍不过，保留草稿，可在章节列表处理）
            </div>
          )}
          {run.status === 'done' && <div className={css.meta} style={{ color: 'var(--nf-success)' }}>✅ 生产单完成：{run.startNo}-{run.endNo} 章处理完毕，待人工 {run.pendingManual.length} 章。</div>}
          {run.error !== undefined && <div className={css.meta} style={{ color: 'var(--nf-error)' }}>异常：{run.error}</div>}
        </div>
      )}

      {/* 日志区 */}
      <div className={css.meta} style={{ fontWeight: 600 }}>运行日志（{run?.log.length ?? 0}）</div>
      <div
        ref={logRef}
        style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', background: 'var(--nf-bg-inset)', padding: 'var(--nf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)', fontSize: 'var(--nf-fs-12)' }}
      >
        {run === null || run.log.length === 0 ? (
          <span className={css.meta}>尚无日志——下单后这里会实时显示每章进度。</span>
        ) : run.log.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 'var(--nf-space-6)', opacity: 0.85 }}>
            <span style={{ color: 'var(--nf-text-3)', flex: 'none' }}>{new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
