/**
 * 纯展示组件（views）：所有状态与事件处理器都留在 NovelPanel，
 * 这里只接收 props 渲染。便于单独维护与复用。
 */
import type { ReactElement } from 'react'
import type { AuditIssue, Plotline, PlotlineHealthReport, PlotlinePlan, RoleRecord, RoleStatusCard } from '../../protocol.ts'
import { tt, ROLE_LABELS, roleColor, kindLabel, plotlineStatusLabel, plotlineStatusColor } from './helpers.ts'
import css from './panel.module.css'

/** 统计格：状态摘要条 / 资产健康通用。 */
export function StatCell(props: {
  label: string
  value: string
  detail: string
  /** 值颜色（可选）。 */
  valueColor?: string
  /** 值字号覆盖（如长文本用 13）。 */
  valueFontSize?: number
  /** detail 悬浮提示（可选）。 */
  detailTitle?: string
}): ReactElement {
  return (
    <div className={css.assetStat}>
      <span className={css.assetStatLabel}>{props.label}</span>
      <span className={css.assetStatValue} style={{ color: props.valueColor, fontSize: props.valueFontSize }}>
        {props.value}
      </span>
      <span className={css.assetStatDetail} title={props.detailTitle}>{props.detail}</span>
    </div>
  )
}

/** 待办队列行。 */
export function TodoRow(props: {
  tone: 'danger' | 'warning' | 'info' | 'success'
  title: string
  description: string
  actionLabel: string
  disabled: boolean
  onAction: () => void
}): ReactElement {
  return (
    <div className={`${css.todoItem} ${props.tone === 'danger' ? css.todoDanger : props.tone === 'warning' ? css.todoWarning : css.todoInfo}`}>
      <span className={css.todoText}>
        {props.title}
        {props.description !== '' && <span className={css.meta}> — {props.description}</span>}
      </span>
      <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onAction}>
        {props.actionLabel}
      </button>
    </div>
  )
}

/** 全书质检问题行。 */
export function AuditIssueRow(props: {
  issue: AuditIssue
  disabled: boolean
  onFix: () => void
}): ReactElement {
  const { issue } = props
  return (
    <div className={`${css.todoItem} ${issue.severity === 'high' ? css.todoDanger : issue.severity === 'medium' ? css.todoWarning : css.todoInfo}`}>
      <span className={css.todoText}>
        <span>
          {issue.chapterNo > 0 ? `第 ${issue.chapterNo} 章` : '未定位章节'} · [{issue.severity}] {issue.item}
        </span>
        {issue.suggestion !== '' && <span className={css.meta}>建议：{issue.suggestion}</span>}
      </span>
      {issue.chapterNo > 0 && (
        <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onFix}>
          去修订
        </button>
      )}
    </div>
  )
}

/** 剧情线卡片（列表主体）。 */
export function PlotlineCard(props: {
  line: Plotline
  disabled: boolean
  onRefresh: () => void
  onEdit: () => void
  onRemove: () => void
}): ReactElement {
  const { line } = props
  return (
    <div key={line.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-12)', fontSize: 'var(--nf-fs-12)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
          <b>{line.name}</b>
          <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{kindLabel(line.kind)}</span>
          <span className={css.badge} style={{ borderColor: plotlineStatusColor(line.status), color: plotlineStatusColor(line.status) }}>{plotlineStatusLabel(line.status)}</span>
        </span>
        <span style={{ display: 'flex', gap: 'var(--nf-space-6)' }}>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall}`}
            disabled={props.disabled}
            onClick={props.onRefresh}
            title="AI 结合编年录与章节摘要，自动更新这条线的当前进度"
          >
            ↻ AI 刷新进度
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onEdit}>
            {tt('plotlines.edit')}
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onRemove}>
            {tt('plotlines.remove')}
          </button>
        </span>
      </div>
      {line.goal !== '' && <div className={css.meta}><b>{tt('plotlines.goal')}：</b>{line.goal}</div>}
      {line.progress !== '' && <div className={css.meta}><b>{tt('plotlines.progress')}：</b>{line.progress}</div>}
      <div className={css.meta}>
        {tt('plotlines.chapters')}：{line.chapters.length > 0 ? line.chapters.map(n => `第${n}章`).join('、') : '—'}
      </div>
    </div>
  )
}

/** AI 候选角色行（提炼结果，可采纳/修改后采纳）。 */
export function RoleCandidateRow(props: {
  candidate: RoleRecord
  disabled: boolean
  onAdopt: () => void
  onEdit: () => void
}): ReactElement {
  const { candidate: r } = props
  const label = ROLE_LABELS[r.roleLabel] ?? r.roleLabel
  const color = roleColor(r.roleLabel)
  return (
    <div key={r.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
          <b>{r.name}</b>
          <span className={css.badge} style={{ borderColor: color, color }}>{label}</span>
          {r.identity !== '' && <span className={css.meta}>{r.identity}</span>}
        </span>
        <span style={{ display: 'flex', gap: 'var(--nf-space-6)' }}>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={props.disabled} onClick={props.onAdopt}>
            ＋ 采纳
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onEdit} title="修改后再采纳（候选列表保留）">
            ✏️ 修改后采纳
          </button>
        </span>
      </div>
      {r.goals !== '' && <div className={css.meta}>目标：{r.goals}</div>}
      {r.relations.length > 0 && <div className={css.meta}>关系：{r.relations.join('、')}</div>}
    </div>
  )
}

/** 已收录角色卡（含从编年录刷新的当前状态行）。 */
export function RoleCard(props: {
  role: RoleRecord
  status?: RoleStatusCard
  disabled: boolean
  onEdit: () => void
  onRemove: () => void
}): ReactElement {
  const { role: r, status: st } = props
  const label = ROLE_LABELS[r.roleLabel] ?? r.roleLabel
  const color = roleColor(r.roleLabel)
  return (
    <div key={r.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
          <b>{r.name}</b>
          <span className={css.badge} style={{ borderColor: color, color }}>{label}</span>
          {r.identity !== '' && <span className={css.meta}>{r.identity}</span>}
        </span>
        <span style={{ display: 'flex', gap: 'var(--nf-space-6)' }}>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onEdit}>编辑</button>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={props.disabled} onClick={props.onRemove}>删除</button>
        </span>
      </div>
      {r.goals !== '' && <div className={css.meta}>目标：{r.goals}</div>}
      {st !== undefined && (
        <div className={css.meta} style={{ color: 'var(--nf-accent)' }}>
          <b>当前状态：</b>{st.status !== '' ? st.status : '（编年录暂无该角色记录）'}
          {' · 出场 '}{st.appearances} 次 · 最近 第 {st.lastChapter} 章
        </div>
      )}
      {r.relations.length > 0 && <div className={css.meta}>关系：{r.relations.join('、')}</div>}
      {r.arc.length > 0 && <div className={css.meta}>成长线：{r.arc.join(' → ')}</div>}
      {r.knowledge.length > 0 && <div className={css.meta}>知情度：{r.knowledge.join('；')}</div>}
    </div>
  )
}

/** 🩺 剧情健康检查报告面板。 */
export function PlotlineHealthPanel(props: {
  report: PlotlineHealthReport
  disabled: boolean
  onPlan: () => void
  onClose: () => void
}): ReactElement {
  const { report } = props
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', border: '1px solid var(--nf-info)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <b>🩺 剧情健康检查</b>
        <span style={{ display: 'flex', gap: 'var(--nf-space-8)' }}>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall}`}
            disabled={props.disabled}
            onClick={props.onPlan}
            title="基于本次诊断生成下一阶段剧情方案"
          >
            ✨ 基于此设计方案
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={props.onClose}>收起</button>
        </span>
      </div>
      <div style={{ fontSize: 'var(--nf-fs-12)', fontWeight: 700, color: 'var(--nf-accent)' }}>判定：{report.verdict}</div>
      {report.timing !== '' && <div className={css.meta}><b>建议时机：</b>{report.timing}</div>}
      {report.reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)', fontSize: 'var(--nf-fs-12)' }}>
          {report.reasons.map((r, i) => <div key={i} className={css.meta}>· {r}</div>)}
        </div>
      )}
      {report.lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', fontSize: 'var(--nf-fs-12)' }}>
          {report.lines.map((l, i) => {
            const color = l.health === 'ok' ? 'var(--nf-success)' : l.health === 'warning' ? 'var(--nf-warn)' : 'var(--nf-error)'
            const label = l.health === 'ok' ? '健康' : l.health === 'warning' ? '预警' : '搁置过久'
            return (
              <div key={i} style={{ display: 'flex', gap: 'var(--nf-space-8)', alignItems: 'flex-start' }}>
                <span className={css.badge} style={{ borderColor: color, color, flex: 'none', marginTop: 'var(--nf-space-2)' }}>{label}</span>
                <span className={css.meta}><b>{l.name}</b>：{l.note}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** ✨ AI 剧情方案面板。 */
export function PlotlinePlanPanel(props: {
  plan: PlotlinePlan
  disabled: boolean
  onAdopt: (suggestion: Plotline) => void
  onClose: () => void
}): ReactElement {
  const { plan } = props
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <b>✨ AI 剧情方案</b>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={props.onClose}>收起</button>
      </div>
      {plan.direction !== '' && (
        <div className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}><b>下一阶段方向：</b>{plan.direction}</div>
      )}
      {plan.suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', fontSize: 'var(--nf-fs-12)' }}>
          {plan.suggestions.map((s, i) => (
            <div key={i} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-6) var(--nf-space-10)' }}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
                  <b>{s.name}</b>
                  <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{kindLabel(s.kind)}</span>
                </span>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={props.disabled} onClick={() => { props.onAdopt(s) }}>
                  ＋ 采纳
                </button>
              </div>
              {s.goal !== '' && <div className={css.meta}>{s.goal}</div>}
              {s.progress !== '' && <div className={css.meta}>初始进度：{s.progress}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** ✨ AI 建议剧情线面板。 */
export function PlotlineSuggestionPanel(props: {
  suggestions: Plotline[]
  disabled: boolean
  onAdopt: (suggestion: Plotline) => void
  onClose: () => void
}): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', border: '1px solid var(--nf-info)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <b>✨ AI 建议（{props.suggestions.length} 条）</b>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={props.onClose}>收起</button>
      </div>
      {props.suggestions.length === 0 && <span className={css.meta}>没有候选线。</span>}
      {props.suggestions.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
              <b>{s.name}</b>
              <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{kindLabel(s.kind)}</span>
            </span>
            <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={props.disabled} onClick={() => { props.onAdopt(s) }}>
              ＋ 采纳
            </button>
          </div>
          {s.goal !== '' && <div className={css.meta}>{s.goal}</div>}
        </div>
      ))}
    </div>
  )
}
