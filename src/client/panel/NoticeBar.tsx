/**
 * 通知条（notice / error 统一出口）——取代此前 4 个视图各写一处的内联 notice/error。
 *
 * 为什么要这个组件（不是又一层抽象）：
 *   1. 此前 TensionView / StyleView / TimelineView / PromptSlotsView 各写一套，
 *      且 success 与 error 共用同一个未定义的 var(--nf-text-12) → 字号静默失效，
 *      两者视觉权重完全一样，「成功」和「失败」在屏幕上长得一样。
 *   2. 错误态只有一行红字。作者最痛的时刻不是失败，是「失败了不知道还能怎么办」，
 *      所以这里强制 error 形态带上「发生了什么 + 怎么办」，并把重试摆在同一行。
 *   3. 颜色走 --nf-*-ink 文字版令牌（见 panel.module.css 注释）：图形版语义色
 *      （--nf-success #34c759 等）在浅色四档纸面上只有 1.98~3.20:1，不能当文字用。
 */
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, RotateCcw } from 'lucide-react'
import css from './panel.module.css'

export type NoticeKind = 'ok' | 'error' | 'warn' | 'info'

const ICON: Record<NoticeKind, ReactNode> = {
  ok: <CheckCircle2 size={14} />,
  error: <AlertTriangle size={14} />,
  warn: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

export function NoticeBar({ kind, children, onRetry, retryLabel = '重试', detail, actions }: {
  kind: NoticeKind
  /** 主文案：一句话说清发生了什么。 */
  children: ReactNode
  /** 次要说明：补充上下文（错误码、影响范围、下一步提示）。 */
  detail?: ReactNode
  /** 重试回调。给了就在同一行显示重试按钮 —— 不给才是真的没救。 */
  onRetry?: () => void
  retryLabel?: string
  /** 其他补救动作（如「换个模型再试」）。 */
  actions?: ReactNode
}): JSX.Element {
  return (
    <div
      className={`${css.noticeBar} ${css[`notice-${kind}`] ?? ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <span className={css.noticeIcon} aria-hidden="true">{ICON[kind]}</span>
      <div className={css.noticeBody}>
        <span className={css.noticeText}>{children}</span>
        {detail !== undefined && detail !== null && detail !== '' && (
          <span className={css.noticeDetail}>{detail}</span>
        )}
      </div>
      {(onRetry !== undefined || actions !== undefined) && (
        <span className={css.noticeActions}>
          {onRetry !== undefined && (
            <button type="button" className={`${css.button} ${css.noticeBtn}`} onClick={onRetry}>
              <RotateCcw size={13} aria-hidden="true" />
              {retryLabel}
            </button>
          )}
          {actions}
        </span>
      )}
    </div>
  )
}
