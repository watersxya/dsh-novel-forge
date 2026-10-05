/**
 * 生产单面板 —— **任务队列化**（2.1.6 起）。
 *
 * 与「AI进度」悬浮窗不同：这是标准流水线设备，一键下单、实时进度、日志可查。
 *
 * 本轮（方案 §8「生产单方案」）改了三件事：
 *   1. **章节队列**：区间内每章一行 —— 章节号 / 标题 / 当前阶段 / 字数 / 审稿结论 /
 *      失败次数 / 打开工作台。此前只有一行"N/M 章"的聚合数字，作者看不出卡在哪一章。
 *   2. **作者视图 / 详情分层**：默认只显示作者关心的东西（在生成第几章、完成几章、
 *      当前字数、失败与待人工），工具步骤、Prompt、token、耗时留在「运行详情」里。
 *   3. **失败恢复三段式**：发生了什么 / 可能原因 / 你可以 —— 失败态从死胡同变成出路
 *      （重试本章 / 打开工作台 / 查看详细日志）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, RunState } from '../../protocol.ts'
import css from './panel.module.css'
import { PageHeader } from './PageHeader.tsx'
import { CardHead } from './CardHead.tsx'
import { NoticeBar } from './NoticeBar.tsx'
import { statusBadgeClass } from './status-badge.ts'

/** 阶段的**作者口径**文案（色调仍由 status-badge 的唯一映射表决定，这里只补字）。 */
const STAGE_LABEL: Record<string, string> = {
  pending: '待生成',
  generating: '生成中',
  written: '待审稿',
  reviewing: '审稿中',
  approved: '已通过',
  rejected: '待修订',
  error: '失败',
}

/** 队列默认展开的行数：超过后折叠，避免一次渲染几百行。 */
const QUEUE_PREVIEW = 12

export function RunPanel({ api, totalChapters, onOpenChapter }: {
  api: NovelApi
  totalChapters: number
  /** 打开某章的章节工作台（队列行的「打开工作台」与失败态的重试入口共用）。 */
  onOpenChapter?: (no: number) => void
}) {
  const [run, setRun] = useState<RunState | null>(null)
  const [chapters, setChapters] = useState<ChapterPlan[]>([])
  const [queueAll, setQueueAll] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
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
    try {
      const st = await api.status()
      setChapters(st.project?.chapters ?? [])
    } catch { /* 静默 */ }
  }, [api])

  // 运行期间每 5 秒轮询一次状态；页面隐藏时暂停（切走标签页没必要继续拉）。
  useEffect(() => {
    void poll()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void poll()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [poll])

  // 日志自动滚底。
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [run?.log.length])


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
      running: '生产中',
      paused: '已暂停',
      done: '已完成',
      stopped: '已停止',
      error: '异常',
    }[run.status] ?? run.status
  }, [run])

  /**
   * 队列区间：有批次时用批次区间，否则用下单区当前填的区间 ——
   * 这样「下单前」也能先看一遍这批要跑哪些章、哪些已通过会被快进跳过。
   */
  const range = run !== null
    ? { from: run.startNo, to: run.endNo }
    : mode === 'count'
      ? { from: startNo, to: startNo + count - 1 }
      : { from: startNo, to: Math.max(startNo, endNo) }

  const queue = useMemo(() => {
    const inRange = chapters
      .filter(c => c.no >= range.from && c.no <= range.to)
      .sort((a, b) => a.no - b.no)
    return inRange
  }, [chapters, range.from, range.to])

  const queueShown = queueAll ? queue : queue.slice(0, QUEUE_PREVIEW)

  const ratio = run !== null && run.endNo > run.startNo
    ? Math.min(Math.max((run.currentNo - run.startNo) / (run.endNo - run.startNo), 0), 1)
    : 0

  /** 作者视图的完成计数：队列内已通过 / 总数。 */
  const approvedInRange = queue.filter(c => c.status === 'approved').length
  /** 失败章（error）与待人工章（两轮修订不过）—— 失败恢复动作的落点。 */
  const failed = queue.find(c => c.status === 'error')
  const manualNo = run !== null && run.pendingManual.length > 0 ? run.pendingManual[0] : undefined
  const failedNo = failed?.no ?? manualNo
  const failCount = run?.stats.error ?? 0
  const currentChapter = chapters.find(c => c.no === run?.currentNo)

  return (
    <div className={`${css.card} ${css.runSurface}`} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
      <PageHeader
        eyebrow="Production"
        title="生产单"
        actions={(
          <span className={`${css.badge} ${run?.status === 'running' ? css.badgeWritten : run?.status === 'done' ? css.badgeDone : css.badgePending}`}>{statusLabel}</span>
        )}
      />

      {/* ---- 作者视图：现在在做什么、做到哪、下一步 ---- */}
      {run !== null && (
        <div className={css.authorStrip}>
          <div className={css.authorStripMain}>
            <b>
              {run.status === 'running'
                ? `正在生成第 ${run.currentNo} 章${currentChapter !== undefined && currentChapter.title !== '' ? ` · ${currentChapter.title}` : ''}`
                : run.status === 'paused'
                  ? `已暂停在第 ${run.currentNo} 章（可从断点继续）`
                  : run.status === 'done'
                    ? `本批次已完成（第 ${run.startNo}-${run.endNo} 章）`
                    : run.status === 'error'
                      ? `本批次异常中止在第 ${run.currentNo} 章`
                      : `本批次已停止在第 ${run.currentNo} 章`}
            </b>
            <span className={css.meta}>
              {run.bookName !== undefined && run.bookName !== ''
                ? `《${run.bookName}》 · `
                : ''}
              范围第 {run.startNo}-{run.endNo} 章 · 区间内已过审 {approvedInRange}/{queue.length} 章
            </span>
          </div>
          <div className={css.authorStripStats}>
            <span title="本批次新生成并通过质量门的章数"><b>{run.stats.generated}</b><i>新生成</i></span>
            <span title="被拒后按意见修订通过的章数"><b>{run.stats.revised}</b><i>修订通过</i></span>
            <span title="被拒但无 high 意见，豁免通过"><b>{run.stats.exempted}</b><i>豁免</i></span>
            <span title="生成失败的章数" data-tone={failCount > 0 ? 'bad' : undefined}><b>{failCount}</b><i>失败</i></span>
            <span title="两轮修订仍不过、保留草稿等你处理的章数" data-tone={run.pendingManual.length > 0 ? 'warn' : undefined}><b>{run.pendingManual.length}</b><i>待人工</i></span>
          </div>
          <div className={css.bigProgressBar}>
            <div className={css.bigProgressBarFill} style={{ transform: `scaleX(${ratio})` }} />
          </div>
        </div>
      )}

      {/* ---- 失败恢复：发生了什么 / 可能原因 / 你可以 ---- */}
      {run !== null && failCount > 0 && (
        <NoticeBar
          kind="error"
          detail={(
            <>
              可能原因：模型响应超时、被内容策略拦截，或本章上下文超长。
              {failed?.error !== undefined && failed.error !== '' ? ` 原始错误：${failed.error}` : ''}
            </>
          )}
          actions={(
            <>
              {failedNo !== undefined && onOpenChapter !== undefined && (
                <button type="button" className={`${css.button} ${css.noticeBtn}`} onClick={() => { onOpenChapter(failedNo) }}>重试本章</button>
              )}
              <button type="button" className={`${css.button} ${css.noticeBtn}`} onClick={() => { setShowDetail(true) }}>查看详细日志</button>
            </>
          )}
        >
          第 {failedNo ?? run.currentNo} 章生成未完成，正文尚未写回。
        </NoticeBar>
      )}
      {run !== null && failCount === 0 && run.pendingManual.length > 0 && (
        <NoticeBar
          kind="warn"
          detail="两轮自动修订仍未达标，草稿已保留（原稿未被覆盖）。"
          actions={manualNo !== undefined && onOpenChapter !== undefined
            ? <button type="button" className={`${css.button} ${css.noticeBtn}`} onClick={() => { onOpenChapter(manualNo) }}>打开工作台处置</button>
            : undefined}
        >
          第 {run.pendingManual.join('、')} 章需要人工处理。
        </NoticeBar>
      )}

      {/* ---- 章节队列 ---- */}
      <div className={css.runQueue}>
        <div className={css.runQueueHead}>
          <CardHead
            title="章节队列"
            count={queue.length}
            note={run !== null ? `第 ${run.startNo}-${run.endNo} 章` : '下单前预览'}
          />
          {queue.length > QUEUE_PREVIEW && (
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setQueueAll(v => !v) }}>
              {queueAll ? `收起（只看前 ${QUEUE_PREVIEW} 章）` : `展开全部 ${queue.length} 章`}
            </button>
          )}
        </div>
        {queue.length === 0 ? (
          <span className={css.meta}>
            这个区间还没有章节计划 —— 先到「总编台 → 生成章节计划」，队列才有内容可跑。
          </span>
        ) : (
          <div className={css.runQueueList}>
            {queueShown.map(c => {
              const attempts = run?.failedAttempts?.[String(c.no)] ?? 0
              const manual = run?.pendingManual.includes(c.no) === true
              const review = c.review
              return (
                <div key={c.no} className={css.runQueueRow} data-current={run?.status === 'running' && c.no === run.currentNo ? '1' : undefined}>
                  <span className={css.runQueueNo}>第 {c.no} 章</span>
                  <span className={css.runQueueTitle} title={c.title}>{c.title !== '' ? c.title : '（未命名）'}</span>
                  <span className={`${css.badge} ${statusBadgeClass(c.status)}`}>{STAGE_LABEL[c.status] ?? c.status}</span>
                  <span className={css.runQueueMeta}>{c.chars !== undefined ? `${c.chars} 字` : '—'}</span>
                  <span className={css.runQueueMeta} title={review !== undefined ? review.verdict : '尚未审稿'}>
                    {review === undefined ? '未审' : `${review.score} 分${review.passed ? ' ✓' : ' ✗'}`}
                  </span>
                  <span className={css.runQueueMeta} data-tone={attempts > 0 ? 'bad' : undefined} title="本章连续失败次数（达上限转入待人工）">
                    {attempts > 0 ? `失败 ${attempts}` : manual ? '待人工' : ''}
                  </span>
                  <span className={css.runQueueActions}>
                    {onOpenChapter !== undefined && (
                      <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { onOpenChapter(c.no) }}>
                        打开工作台
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {!queueAll && queue.length > QUEUE_PREVIEW && (
          <span className={css.meta}>还有 {queue.length - QUEUE_PREVIEW} 章未显示。</span>
        )}
      </div>

      {/* ---- 运行控制 / 下单 ---- */}
      {run !== null && run.status === 'running' ? (
        <div className={`${css.row} ${css.rowBetween} ${css.rowBetweenWrap}`} style={{ gap: 'var(--nf-space-8)' }}>
          <span className={css.meta}>生产中 · 第 {run.startNo}-{run.endNo} 章 · 当前第 {run.currentNo} 章 · {Math.round(ratio * 100)}%</span>
          <div className={css.row} style={{ gap: 'var(--nf-space-6)' }}>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleControl('pause') }}>
              暂停
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleControl('stop') }}>
              停止
            </button>
          </div>
        </div>
      ) : (
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
        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          disabled={busy || run?.status === 'running'}
          onClick={() => { void (run?.status === 'paused' ? handleControl('resume') : handleStart()) }}
          title={run?.status === 'paused' ? '从断点继续当前生产单' : '启动生产单'}
        >
          {run?.status === 'running' ? '生产中…' : run?.status === 'paused' ? '从断点继续' : '下单生产'}
        </button>
        {run !== null && run.status !== 'done' && (
          <>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || run.status !== 'running'} onClick={() => { void handleControl('pause') }}>
              暂停
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || run.status === 'stopped'} onClick={() => { void handleControl('stop') }}>
              停止
            </button>
          </>
        )}
      </div>
      )}

      {err !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-12)' }}>{err}</div>}

      {run !== null && run.status === 'done' && (
        <div className={css.meta} style={{ color: 'var(--nf-success-ink)' }}>
          生产单完成：第 {run.startNo}-{run.endNo} 章处理完毕，待人工 {run.pendingManual.length} 章。
        </div>
      )}

      {/* ---- 运行说明（低频信息，收到底部） ---- */}
      <details className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}>
        <summary style={{ cursor: 'pointer' }}>运行说明（并发 · 绑定书目 · 暂停续跑）</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, lineHeight: 1.6 }}>
          <span>· <b>一次一本</b>：生产单是全局单实例，逐章串行；换书不会打断，也不会切换到别的批次。</span>
          <span>· <b>绑定下单时的书</b>：本批次只读写下单时那本书的目录，与当前激活书无关。</span>
          <span>· 起点默认 = 最后一章 +1；区间内<b>已通过审稿</b>的章会自动快进跳过。</span>
          <span>· <b>暂停</b>可随时续跑（从断点章继续）；<b>停止</b>会终结本批次，再次下单即新建批次。</span>
          <span>· 批次运行中仍可手动生成/修订<b>其它章</b>，但请勿对正在处理的<b>同一章</b>同时手动操作——两个写入会互相覆盖。</span>
        </div>
      </details>

      {/* ---- 运行详情（技术日志）：作者视图之外的第二层 ---- */}
      <details
        className={css.runLogDetails}
        open={showDetail}
        onToggle={e => { setShowDetail((e.currentTarget as HTMLDetailsElement).open) }}
      >
        <summary><CardHead title="运行详情" count={run?.log.length ?? 0} note="工具步骤 · token · 耗时 · 重试原因（技术日志）" /></summary>
        <div ref={logRef} className={css.runLog}>
          {run === null || run.log.length === 0 ? (
            <span className={css.meta}>尚无日志——下单后这里会实时显示每章的执行细节。</span>
          ) : run.log.map((l, i) => (
            <div key={i} className={css.runLogLine}>
              <span className={css.runLogTime}>{new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
