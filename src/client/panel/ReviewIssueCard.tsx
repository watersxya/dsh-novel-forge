/**
 * 审稿问题卡片（2.1.6 / 方案 §7「审稿问题卡片化」）。
 *
 * 为什么单独成卡而不是继续用 `<ul><li>`：
 *   1. 此前每条意见被压成一行带色文字 —— 「问题」和「建议」用同一个色号、同一种排版，
 *      作者扫读时无法快速分辨"哪句是诊断、哪句是处方"。
 *   2. 勾选框与文字在同一行内联，窄容器下换行会把勾选框甩到行尾，勾错是常事。
 *   3. 卡片把三件事固定成三层：**严重度徽章 + 维度** / **问题** / **建议**，
 *      颜色只承担严重度（图形版语义色 → 文字版 -ink，保证对比度）。
 */
import type { ReactNode } from 'react'
import type { ReviewIssue } from '../../protocol.ts'
import css from './panel.module.css'

/** 严重度的作者口径文案（与 Severity 类型一一对应）。 */
export const SEV_LABEL: Record<string, string> = {
  high: '高优',
  medium: '中',
  low: '低',
}

export function ReviewIssueCard({ issue, dimensionLabel, checked, onToggle, disabled }: {
  issue: ReviewIssue
  /** 维度中文名（由调用方查表，避免把文案表搬进组件）。 */
  dimensionLabel?: string
  checked: boolean
  onToggle: (next: boolean) => void
  disabled?: boolean
  /** 预留：卡片右上角的附加动作（如「单条重写」）。 */
  actions?: ReactNode
}): JSX.Element {
  return (
    <label className={css.reviewIssue} data-sev={issue.severity} data-on={checked ? '1' : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled === true}
        onChange={e => { onToggle(e.target.checked) }}
        aria-label={`${SEV_LABEL[issue.severity] ?? issue.severity}问题：${issue.item}`}
      />
      <span className={css.reviewIssueBody}>
        <span className={css.reviewIssueHead}>
          <span className={css.reviewIssueSev}>{SEV_LABEL[issue.severity] ?? issue.severity}</span>
          {dimensionLabel !== undefined && dimensionLabel !== '' && (
            <span className={css.reviewIssueDim}>{dimensionLabel}</span>
          )}
          {issue.ruleName !== undefined && issue.ruleName !== '' && (
            <span className={css.reviewIssueDim}>{issue.ruleName}</span>
          )}
        </span>
        <span className={css.reviewIssueItem}>{issue.item}</span>
        {issue.suggestion !== '' && (
          <span className={css.reviewIssueFix}>建议：{issue.suggestion}</span>
        )}
        {issue.excerpt !== undefined && issue.excerpt !== '' && (
          <span className={css.reviewIssueExcerpt}>原文：{issue.excerpt}</span>
        )}
        {/* 勾选框本身不说明「勾了会发生什么」；补一行动作口径（方案 §7 的卡片末行），
            与底部主按钮「修订已选 N 条」是同一句话的两端。整张卡是 <label>，点这里即勾选。 */}
        <span className={css.reviewIssuePick}>纳入本轮修订</span>
      </span>
    </label>
  )
}
