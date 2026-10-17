/**
 * 章节工作台（独立全页）：左「本章计划」/ 中正文 / 右「对比·审稿·复盘·历史版本」。
 *
 * 从 NovelPanel.tsx 抽出（2026-10 重构）：它是全页视图，不该继续挂在 6000+ 行的
 * 主组件里；全部输入走 props，内部只持自己的页签/筛选/勾选状态。
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { stripChapterHeadings } from '../../strip-headings.ts'
import type { NovelApi } from '../api.ts'
import { moveFocusByArrow, tt } from './helpers.ts'
import type { NovelKey } from '../locales.ts'
import { statusBadgeClass } from './status-badge.ts'
import { usePersistentState } from './usePersistentState.ts'
import { ReviewIssueCard } from './ReviewIssueCard.tsx'
import { NoticeBar } from './NoticeBar.tsx'
import { ChapterPlanPanel } from './ChapterPlanPanel.tsx'
import { SlideNav } from './views.tsx'
import type { ChapterPlan, ChapterStatus, ChapterSnapshot, Plotline, ReviewReport } from '../../protocol.ts'
import css from './panel.module.css'

/** 审稿维度中文名（工作台与主面板共用）。 */
export const REVIEW_DIM_ZH: Record<string, string> = {
  character: '人设', setting: '设定', redline: '红线', writing: '文笔', pacing: '节奏', logic: '逻辑', 'anti-ai': '反AI', presentation: '呈现', compliance: '合规',
}

const STATUS_LABEL_KEY: Record<ChapterStatus, NovelKey> = {
  pending: 'plan.pending',
  generating: 'plan.generating',
  written: 'plan.written',
  approved: 'plan.approved',
  rejected: 'plan.rejected',
  error: 'plan.error',
}
export function statusBadge(chapter: ChapterPlan): { cls: string; label: string } {
  return {
    cls: statusBadgeClass(chapter.status),
    label: tt(STATUS_LABEL_KEY[chapter.status] ?? STATUS_LABEL_KEY.error),
  }
}

/** One review issue line (severity-colored, theme-aware). */
export function severityColor(severity: string): string {
  return severity === 'high' ? 'var(--nf-error)' : severity === 'medium' ? 'var(--nf-warn)' : 'var(--nf-info)'
}

/** One row of a chapter-level diff (paragraph granularity). */
type DiffRow =
  | { kind: 'same'; text: string }
  | { kind: 'change'; old: string; neu: string }
  | { kind: 'del'; text: string }
  | { kind: 'add'; text: string }

/**
 * Paragraph-level LCS diff between an original chapter body and its
 * rewrite/polish draft. Adjacent delete+add runs merge into "change" pairs
 * (the common case: a reworded paragraph shown as old → new).
 */
function paragraphDiff(oldText: string, newText: string): DiffRow[] {
  const split = (t: string): string[] =>
    stripChapterHeadings(t).split(/\n{2,}/).map(p => p.trim()).filter(p => p !== '')
  const a = split(oldText)
  const b = split(newText)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (i < n && (j >= m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else if (j < m) {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    } else if (i < n) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  // Merge adjacent del/add runs into change pairs.
  const merged: DiffRow[] = []
  let k = 0
  while (k < rows.length) {
    const row = rows[k]!
    if (row.kind !== 'del' && row.kind !== 'add') {
      merged.push(row)
      k++
      continue
    }
    const dels: string[] = []
    const adds: string[] = []
    while (k < rows.length && (rows[k]!.kind === 'del' || rows[k]!.kind === 'add')) {
      if (rows[k]!.kind === 'del') dels.push((rows[k] as { text: string }).text)
      else adds.push((rows[k] as { text: string }).text)
      k++
    }
    if (dels.length > 0 && adds.length > 0) {
      merged.push({ kind: 'change', old: dels.join('\n\n'), neu: adds.join('\n\n') })
    } else if (dels.length > 0) {
      for (const d of dels) merged.push({ kind: 'del', text: d })
    } else {
      for (const ad of adds) merged.push({ kind: 'add', text: ad })
    }
  }
  return merged
}

/** 把章节 beats 按结构标签渲染的实现见 ChapterPlanPanel.renderBeats（左栏与计划抽屉共用）。 */

/** The diff list of a draft-vs-original comparison (scrollable). */
export function DiffList({ original, draft, fontSize }: { original: string; draft: string; fontSize?: number }): ReactElement {  const rows = useMemo(() => paragraphDiff(original, draft), [original, draft])
  const changed = rows.filter(r => r.kind === 'change').length
  const added = rows.filter(r => r.kind === 'add').length
  const removed = rows.filter(r => r.kind === 'del').length
  const [onlyChanges, setOnlyChanges] = useState(false)
  const shown = onlyChanges ? rows.filter(r => r.kind !== 'same') : rows
  return (
    <>
      <div className={css.diffLegend}>
        <span className={css.legendOld}>■ 原稿</span>
        <span className={css.legendNew}>■ 新稿</span>
        <span className={css.meta}>
          原 {original.length} 字 → 新 {draft.length} 字 · 修改 {changed} · 新增 {added} · 删除 {removed}
        </span>
        <label className={css.onlyChanges}>
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={e => { setOnlyChanges(e.target.checked) }}
          />
          只看改动
        </label>
      </div>
      <div className={css.diffList} style={fontSize !== undefined ? { fontSize } : undefined}>
        {shown.map((row, idx) => {
          if (row.kind === 'same') {
            return (
              <details key={idx} className={css.diffSame}>
                <summary>第 {idx + 1} 段 · 未改动（点击展开）</summary>
                <div className={css.diffSameBody}>{row.text}</div>
              </details>
            )
          }
          if (row.kind === 'change') {
            return (
              <div key={idx} className={css.diffChange}>
                <div className={css.diffColumn}>
                  <span className={css.diffTagOld}>原稿</span>
                  <div className={css.diffOld}>{row.old}</div>
                </div>
                <div className={css.diffColumn}>
                  <span className={css.diffTagNew}>新稿</span>
                  <div className={css.diffNew}>{row.neu}</div>
                </div>
              </div>
            )
          }
          if (row.kind === 'del') {
            return (
              <div key={idx} className={css.diffDel}>
                <span className={css.diffTagOld}>原稿</span>
                <span className={css.diffText}>{row.text}</span>
              </div>
            )
          }
          return (
            <div key={idx} className={css.diffAdd}>
              <span className={css.diffTagNew}>新稿</span>
              <span className={css.diffText}>{row.text}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** 章节工作台右侧页签：对比（草稿 diff）/ 审稿（AI 审稿报告）/ 复盘（作者复盘）。 */
export type ChapterSideTab = 'diff' | 'review' | 'author' | 'versions'

/** 章节工作台（独立全页）需要的全部输入；所有数据来自真实 project.chapters。 */
interface ChapterWorkbenchProps {
  chapter: ChapterPlan
  bookKey: string
  /** 已加载的正文 markdown；'' 表示未加载 / 尚未生成。 */
  text: string
  /** 润色 / 修订草稿；存在时「对比」页可做逐段 diff。 */
  draft?: string
  fontSize: number
  busy: boolean
  busyAny: boolean
  onBack: () => void
  onWrite: () => void
  onReview: () => void
  onApprove: () => void
  onEdit: () => void
  /** 按作者勾选的审稿意见修订（不传则内部自动挑 high）。 */
  onRevisePicked: (issues: ReviewReport['issues']) => void
  onReset: () => void
  onRegenerate: () => void
  onBackfillAuthor: () => void
  /** 右栏当前页签（受控：修订完成后由外层自动切到「对比」）。 */
  tab: ChapterSideTab
  onTabChange: (tab: ChapterSideTab) => void
  /** 草稿审查报告（验证模式产物，针对草稿本身）；null = 还没审查过。 */
  draftReport: ReviewReport | null
  onApplyDraft: () => void
  onDiscardDraft: () => void
  onCheckDraft: () => void
  /** 本章历史版本（快照）与回滚/存档动作。 */
  snapshots: ChapterSnapshot[]
  onRestoreSnapshot: (id: string) => void
  onCreateSnapshot: () => void
  /** 左栏「本章计划」：剧情线用于关联项，api + onPlanSaved 提供就地补写通道。 */
  plotlines: Plotline[]
  api: NovelApi
  onPlanSaved: (chapter: ChapterPlan) => void
  /** 截断声明汇入外层进度台。 */
  onNotice: (message: string) => void
  onLinkLines: () => void
  /** 失败态的出路之一：打开「AI 进度」浮窗看这一章的运行详情（Prompt / 耗时 / 原始错误）。 */
  onOpenRunLog: () => void
}

/**
 * 章节工作台：**独立全页**（不塞进抽屉或主从布局，内容太重）。
 * 三栏并发 —— 左：本章计划（六项固定分组，见 ChapterPlanPanel）；中：正文；右：对比 / 审稿 / 复盘 / 历史。
 */
export function ChapterWorkbench({
  chapter, bookKey, text, draft, fontSize, busy, busyAny,
  onBack, onWrite, onReview, onApprove, onEdit, onRevisePicked, onReset, onRegenerate, onBackfillAuthor,
  tab, onTabChange, draftReport, onApplyDraft, onDiscardDraft, onCheckDraft,
  snapshots, onRestoreSnapshot, onCreateSnapshot,
  plotlines, api, onPlanSaved, onNotice, onLinkLines, onOpenRunLog,
}: ChapterWorkbenchProps): ReactElement {
  const badge = statusBadge(chapter)
  const review: ReviewReport | undefined = chapter.review
  const author = chapter.authorReview
  const hasDraft = draft !== undefined && draft !== ''
  const notWritten = chapter.status === 'pending' || chapter.status === 'generating'
  /** 已有落盘正文（生成为异步，只有这三个状态才有正文可读、可处置）。 */
  const hasBody = chapter.status === 'written' || chapter.status === 'rejected' || chapter.status === 'approved'
  /** 可处置：有正文即可，不再要求 rejected —— 已通过的章也允许推翻重写 / 去AI味。 */
  const disposable = hasBody && text !== ''
  const canRevise = disposable && review !== undefined && review.issues.length > 0
  /** 作者勾选「要修哪几条意见」；默认勾 high，无 high 则勾 medium（与工作区一致）。 */
  const [picked, setPicked] = useState<number[]>([])
  /** 专注阅读模式（2.1.6 / 方案 §7）：隐藏左右辅助栏，正文居中锁阅读列宽。 */
  const [focus, setFocus] = useState(false)
  /** 审稿页签的严重度过滤：false = 全部，true = 仅高优。 */
  const [reviewFilter, setReviewFilter] = useState<'all' | 'high' | 'unhandled'>('all')
  const issueKey = (issue: ReviewReport['issues'][number]): string => JSON.stringify([review?.reviewedAt, issue])
  const [handledIssues, setHandledIssues] = usePersistentState<Record<string, boolean>>({
    key: `dsh-novel-forge.review-handled.${bookKey}.${chapter.no}`,
    parse: raw => {
      try {
        const value: unknown = JSON.parse(raw)
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
        const result: Record<string, boolean> = {}
        for (const [key, state] of Object.entries(value)) if (typeof state === 'boolean') result[key] = state
        return result
      } catch { return undefined }
    },
    serialize: value => JSON.stringify(value),
    fallback: {},
  })
  /**
   * 专注阅读下 Esc **先退出专注**，而不是直接关掉整个工作台。
   *
   * 用捕获阶段 + stopPropagation：外层的「Esc 关闭工作台」监听在 window 冒泡阶段，
   * 捕获先跑并掐断传播，作者按一次 Esc 只退一层 —— 与浮层「由最上层响应」的约定一致。
   */
  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setFocus(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [focus])
  const issueSig = review === undefined ? '' : `${review.score}/${review.issues.length}/${review.issues.map(issueKey).join('\u0001')}`
  useEffect(() => {
    if (review === undefined) { setPicked([]); return }
    const high = review.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)
    const medium = review.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'medium').map(x => x.i)
    setPicked(high.length > 0 ? high : medium)
    // 只依赖「报告签名」而非 review 对象引用：刷新不会打断作者的手选结果。
  }, [issueSig])
  /** 处置动作（跟随当前页签）：页签决定「看什么」，动作条决定「能做什么」。 */
  const footActions: ReactElement[] = []
  if (tab === 'review') {
    if (disposable) {
      footActions.push(
        <button key="rv" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onReview} title="重新跑一次 AI 审稿，覆盖现有报告">
          审稿 / 重审
        </button>
      )
    }
    if (canRevise && review !== undefined) {
      const r = review
      footActions.push(
        <button
          key="fix"
          type="button"
          className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
          disabled={busy || busyAny || picked.length === 0}
          onClick={() => { onRevisePicked(r.issues.filter((_, i) => picked.includes(i))) }}
          title={`修订上方勾选的 ${picked.length} 条意见（整章重写，产出草稿后自动附带一次 AI 审查；最多取前 5 条）`}
        >
          修订已选 {picked.length} 条
        </button>
      )
    }
    if (disposable) {
      footActions.push(
        <button key="polish" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onEdit} title="打开工作区：指令框可填「去AI味 / 去套话」，左栏原文可选中局部处理">
          去AI味
        </button>
      )
      footActions.push(
        <button key="regen" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onRegenerate} title="整章重新生成，覆盖现有正文与审稿报告">
          重新生成
        </button>
      )
    }
  } else if (tab === 'diff') {
    if (hasDraft) {
      footActions.push(
        <button
          key="apply"
          type="button"
          className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
          disabled={busy || busyAny}
          onClick={onApplyDraft}
          title="把草稿写回正文并落盘（原稿自动备份 .bak）；沿用草稿审查结论更新章节状态"
        >
          ✓ 应用草稿
        </button>
      )
      footActions.push(
        <button key="discard" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onDiscardDraft} title="丢弃这份草稿，原稿一字不动">
          ↩ 放弃草稿
        </button>
      )
      footActions.push(
        <button
          key="check"
          type="button"
          className={`${css.button} ${css.buttonSmall}`}
          disabled={busy || busyAny}
          onClick={onCheckDraft}
          title="对草稿跑一次 AI 审查（验证模式：核对原意见是否解决 + 只挑新增 high），不落盘"
        >
          {draftReport === null ? 'AI 审查草稿' : '重新审查草稿'}
        </button>
      )
    }
    if (disposable) {
      footActions.push(
        <button key="edit" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onEdit} title="打开工作区：手动微调 / 选中局部修订 / 整章重写">
          在工作区微调
        </button>
      )
    }
  } else if (author === undefined && hasBody) {
    footActions.push(
      <button key="bf" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={onBackfillAuthor} title="对该章补跑一次作者复盘（读取已落盘正文，不重新生成）">
        生成作者复盘
      </button>
    )
  }
  if (author !== undefined && tab === 'author') {
    footActions.push(
      <button key="bf2" type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={onBackfillAuthor} title="读取最新正文重跑复盘，覆盖当前结论">
        重跑复盘
      </button>
    )
  }
  return (
    <div className={`${css.chWork} ${css.chWorkSurface}`}>
      {/* 2.1.6 顶栏两行化：第一行「在哪一章」，第二行「什么状态 / 能做什么」。 */}
      <div className={css.chWorkBarStack}>
        <div className={css.chWorkBarRow}>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onBack} title="返回上一页（Esc）">
            ← 返回
          </button>
          <span className={css.chWorkTitle}>第 {chapter.no} 章 · {chapter.title}</span>
          {chapter.volume > 0 && <span className={css.meta}>第 {chapter.volume} 卷</span>}
          {/*
            专注阅读按钮**贴标题放**，不用 margin-left:auto 推到最右：
            面板右上角常驻着悬浮的「生产状态芯片」（runChip），它是 fixed 定位、
            z 序在上面 —— 放最右会被完全盖住（实测 elementFromPoint 命中的是芯片）。
          */}
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall}${focus ? ` ${css.buttonPrimary}` : ''}`}
            aria-pressed={focus}
            onClick={() => { setFocus(v => !v) }}
            title="专注阅读：隐藏左右辅助栏，正文居中锁到阅读列宽（Esc 退出）"
          >
            {focus ? '退出专注' : '专注阅读'}
          </button>
        </div>
        {/* 状态行是本章结论所在：做成 live region，读屏用户不必重新 Tab 一遍
            也能听到「生成中 → 已生成，等待审稿」这类变化（方案 §12）。 */}
        <div className={css.chWorkBarRow} role="status" aria-live="polite">
          <span className={`${css.badge} ${badge.cls}`}>{badge.label}</span>
          <span className={css.meta}>
            {chapter.chars !== undefined ? `${chapter.chars} 字` : '未生成'}
          </span>
          <div className={css.chWorkActions}>
          {(chapter.status === 'pending' || chapter.status === 'error') && (
            <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || busyAny} onClick={onWrite}>
              生成正文
            </button>
          )}
          {chapter.status === 'generating' && (
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={onReset} title="生成卡死 / 中断时可复位为待生成，重新生成">
              复位
            </button>
          )}
          {hasBody && chapter.status !== 'approved' && (
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onApprove} title="作者行使最终决定权：直接通过（不重审，保留审稿记录，落盘保存）">
              ✔ 直接通过
            </button>
          )}
        </div>
        </div>
      </div>

      {/*
        失败态给三条出路（方案 §8：发生了什么 / 可能原因 / 你可以），
        不让作者停在一个红色徽章前面不知道下一步。
      */}
      {chapter.status === 'error' && (
        <NoticeBar
          kind="error"
          detail={
            <>
              可能原因：模型响应超时、网络或额度中断、输出目录不可写。
              {chapter.error !== undefined && chapter.error !== '' && <> 原始错误：{chapter.error}</>}
            </>
          }
          onRetry={onWrite}
          retryLabel="重试本章"
          actions={
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onOpenRunLog}>
              查看运行详情
            </button>
          }
        >
          第 {chapter.no} 章生成未完成，正文尚未写回。
        </NoticeBar>
      )}

      <div className={`${css.chWorkGrid}${focus ? ` ${css.chWorkGridFocus}` : ''}`}>
        <aside className={`${css.chWorkAside} ${css.chWorkAsideSurface}`}>
          <div className={css.chWorkAsideTitle}>本章计划</div>
          <div className={css.chWorkAsideBody}>
            <ChapterPlanPanel
              chapter={chapter}
              plotlines={plotlines}
              api={api}
              busy={busy}
              onSaved={onPlanSaved}
              onNotice={onNotice}
              onLinkLines={onLinkLines}
            />
          </div>
        </aside>

        <main className={`${css.chWorkMain} ${css.chWorkMainSurface}${focus ? ` ${css.chWorkMainFocus}` : ''}`}>
          <div className={css.chWorkToolbar}>
            <span className={css.meta}>正文 · {text === '' ? (notWritten ? '尚未生成' : '加载中') : `${text.length} 字`}</span>
            <span className={css.chWorkToolActions}>
              {disposable && (
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onEdit} title="打开工作区：手动编辑正文 → AI 审查 → 保存">
                  编辑
                </button>
              )}
              {disposable && (
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={onEdit} title="打开工作区去AI味：指令框针对表达层面（去套话 / 去AI腔），左栏可选中局部处理">
                  去AI味
                </button>
              )}
            </span>
          </div>
          {!notWritten && text === '' ? (
            /* 2.1.6：加载态说清「在等什么」，并用骨架占位代替裸的「（加载中…）」。 */
            <div className={css.chWorkSkeleton} aria-busy="true" aria-live="polite">
              <span className={css.meta}>正在读取第 {chapter.no} 章正文…</span>
              {[92, 100, 86, 95, 72, 88].map((w, i) => (
                <span key={i} className={css.skeletonLine} style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <pre className={css.chWorkText} style={{ fontSize }}>
              {text === '' ? '（本章尚未生成正文）' : text}
            </pre>
          )}
        </main>

        <aside className={`${css.chWorkSide} ${css.chWorkSideSurface}`}>
          <div className={css.chWorkSideHead}>
            <SlideNav
              ariaLabel="章节工作台"
              items={[
                { id: 'review', label: review !== undefined && review.issues.length > 0 ? `审稿 · ${review.issues.length}` : '审稿' },
                { id: 'diff', label: hasDraft ? '对比 · 草稿' : '对比' },
                { id: 'author', label: '复盘' },
                { id: 'versions', label: snapshots.length > 0 ? `历史版本 · ${snapshots.length}` : '历史版本' },
              ]}
              active={tab}
              onSelect={onTabChange}
            />
          </div>
          <div className={css.chWorkSideBody}>
            {tab === 'versions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
                <div className={`${css.row} ${css.rowBetween}`}>
                  <span className={css.meta}>覆盖写入前会自动留存；回滚也可再撤销。</span>
                  <button type="button" className={css.button} onClick={onCreateSnapshot}>存档当前正文</button>
                </div>
                {snapshots.length === 0 && <span className={css.meta}>这一章还没有历史版本。</span>}
                {snapshots.slice().sort((a, b) => b.at.localeCompare(a.at)).map(snapshot => (
                  <div key={snapshot.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: '6px 8px', fontSize: 'var(--nf-fs-12)' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <b>{new Date(snapshot.at).toLocaleString()}</b>
                      <span className={css.meta}>{snapshot.reason}</span>
                      <span className={css.meta}>{snapshot.chars} 字</span>
                      <button
                        type="button"
                        className={css.button}
                        style={{ marginLeft: 'auto' }}
                        disabled={busyAny}
                        onClick={() => onRestoreSnapshot(snapshot.id)}
                        title="用这一版覆盖当前正文（回滚前会先留存当前正文）"
                      >回滚到这一版</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'diff' && (hasDraft ? (
              <>
                <div className={css.chWorkDraftBar}>
                  <div className={`${css.row} ${css.rowBetween}`}>
                    <b>草稿待处置</b>
                    <span className={css.meta}>
                      字数 {text.length} → {draft?.length ?? 0}
                      （{(draft?.length ?? 0) - text.length >= 0 ? '+' : ''}{(draft?.length ?? 0) - text.length}）
                    </span>
                  </div>
                  {draftReport !== null ? (
                    <div className={css.meta}>
                      草稿审查：
                      <span style={{ color: draftReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                        {draftReport.score} 分 — {draftReport.passed ? '通过 ✓' : '未通过'}
                      </span>
                      {` · ${draftReport.verdict}`}
                      {draftReport.issues.length > 0 && ` · 剩 ${draftReport.issues.filter(i => i.severity === 'high').length} 条 high（共 ${draftReport.issues.length} 条）`}
                    </div>
                  ) : (
                    <div className={css.meta}>还没审查过这份草稿，点下方「AI 审查草稿」看有没有修好。</div>
                  )}
                </div>
                <DiffList original={text} draft={draft ?? ''} fontSize={fontSize} />
              </>
            ) : (
              <div className={css.meta}>
                本章还没有草稿。到「审稿」页勾选意见后点「按意见修订」，改完会自动跳回这里看改了什么。
              </div>
            ))}

            {tab === 'review' && (review !== undefined ? (
              <div className={css.reviewBox}>
                <div className={`${css.row} ${css.rowBetween}`}>
                  <b>审稿报告</b>
                  <span style={{ color: review.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                    评分 {review.score} — {review.passed ? '通过' : '未通过'}
                  </span>
                </div>
                <div className={css.meta}><b>结论：</b>{review.verdict}</div>
                {review.riskScore !== undefined && (
                  <div className={css.meta}><b>风险分：</b>{review.riskScore}/100</div>
                )}
                {review.aiFlavor !== undefined && (
                  <div className={css.meta}>
                    <b>AI 味指数：</b>{review.aiFlavor}/100
                    {(review.aiPhrases ?? []).length > 0 && ` · 套话：` + (review.aiPhrases ?? []).map(p => `${p.word}×${p.count}`).join('、')}
                  </div>
                )}
                 {review.issues.length > 0 && (
                  <>
                    {/* 2.1.6 意见卡片化 + 严重度过滤：问题与建议分两层，勾选框固定在最左。 */}
                    <div className={css.chWorkPickBar}>
                      <span className={css.meta}>
                        勾选要修的意见（{picked.length}/{review.issues.length}
                         {reviewFilter === 'high' ? ` · 仅显示高优 ${review.issues.filter(x => x.severity === 'high').length} 条` : reviewFilter === 'unhandled' ? ` · 仅显示未处理 ${review.issues.filter(x => !handledIssues[issueKey(x)]).length} 条` : ''}）· ↑↓ 逐条移动，空格勾选
                      </span>
                      <span className={css.chWorkPickBtns}>
                         <button type="button" className={`${css.button} ${css.buttonSmall}${reviewFilter === 'all' ? ` ${css.buttonPrimary}` : ''}`} aria-pressed={reviewFilter === 'all'} onClick={() => { setReviewFilter('all') }} title="显示全部意见">
                           全部
                         </button>
                         <button type="button" className={`${css.button} ${css.buttonSmall}${reviewFilter === 'high' ? ` ${css.buttonPrimary}` : ''}`} aria-pressed={reviewFilter === 'high'} onClick={() => { setReviewFilter('high') }} title="只看高优问题">
                           仅高优
                         </button>
                         <button type="button" className={`${css.button} ${css.buttonSmall}${reviewFilter === 'unhandled' ? ` ${css.buttonPrimary}` : ''}`} aria-pressed={reviewFilter === 'unhandled'} onClick={() => { setReviewFilter('unhandled') }} title="只看尚未标记处理的问题">
                           仅未处理
                         </button>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setPicked(review.issues.map((_, i) => i)) }} title="勾选全部意见">
                          全选
                        </button>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setPicked(review.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)) }} title="只勾选 high 级问题">
                          只选 high
                        </button>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setPicked([]) }} title="清空勾选">
                          清空
                        </button>
                      </span>
                    </div>
                    <div className={css.reviewIssues} onKeyDown={e => { moveFocusByArrow(e, 'input[type="checkbox"]') }}>
                      {review.issues
                        .map((issue, i) => ({ issue, i }))
                         .filter(x => reviewFilter === 'all' || (reviewFilter === 'high' ? x.issue.severity === 'high' : !handledIssues[issueKey(x.issue)]))
                         .map(({ issue, i }) => (
                           <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)' }}>
                             <ReviewIssueCard
                               issue={issue}
                               dimensionLabel={issue.dimension !== undefined ? (REVIEW_DIM_ZH[issue.dimension] ?? issue.dimension) : undefined}
                               checked={picked.includes(i)}
                               onToggle={next => { setPicked(prev => next ? [...prev, i] : prev.filter(x => x !== i)) }}
                             />
                             <button type="button" className={`${css.button} ${css.buttonSmall}`} aria-pressed={handledIssues[issueKey(issue)] === true} onClick={() => { setHandledIssues(prev => ({ ...prev, [issueKey(issue)]: !prev[issueKey(issue)] })) }} title="记录作者已处理状态，不会自动修改正文">
                               {handledIssues[issueKey(issue)] === true ? '已处理' : '标记已处理'}
                             </button>
                           </div>
                         ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className={css.meta}>
                {chapter.status === 'written' || chapter.status === 'rejected'
                  ? '本章还没有审稿报告，点下方「审稿」生成。'
                  : '本章生成正文并落盘后才会产出审稿报告。'}
              </div>
            ))}

            {tab === 'author' && (author !== undefined ? (
              <div className={css.reviewBox} style={{ borderColor: 'color-mix(in srgb, var(--nf-info) 45%, transparent)' }}>
                <div className={`${css.row} ${css.rowBetween}`}>
                  <b>作者复盘</b>
                  <span style={{ color: author.hookHonored ? 'var(--nf-success)' : 'var(--nf-warn)' }}>
                    钩子{author.hookHonored ? '已兑现 ✓' : '未兑现 ✗'} · 结尾钩子 {author.endingHook}/10
                  </span>
                </div>
                {author.hookNote !== '' && <div className={css.meta}><b>钩子：</b>{author.hookNote}</div>}
                {author.plotlineProgress !== '' && <div className={css.meta}><b>推进：</b>{author.plotlineProgress}</div>}
                {author.continuity !== '' && <div className={css.meta}><b>衔接：</b>{author.continuity}</div>}
                {author.trend !== '' && <div className={css.meta}><b>趋势：</b>{author.trend}</div>}
              </div>
            ) : (
              <div className={css.row}>
                {chapter.status !== 'pending' && chapter.status !== 'generating' && chapter.status !== 'error' && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall}`}
                    disabled={busy}
                    onClick={onBackfillAuthor}
                    title="对该章补跑一次作者复盘（读取已落盘正文，不重新生成）"
                  >
                    生成作者复盘
                  </button>
                )}
              </div>
            ))}
          </div>
          {footActions.length > 0 && (
            <div className={css.chWorkSideFoot}>
              <div className={css.chWorkFootRow}>{footActions}</div>
              <span className={css.meta}>
                {tab === 'review'
                  ? '修订 / 去AI味 / 重新生成都会先进工作区预览，确认后才写回原稿。'
                  : tab === 'diff'
                    ? '草稿只有一份，新一轮修订会直接覆盖它。应用后原稿自动备份 .bak，放弃则原稿一字不动。'
                    : '复盘只读取已落盘正文，不重新生成正文。'}
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

