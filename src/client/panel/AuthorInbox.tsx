/**
 * 作者批注栏（2.1.7 / 取自 demo 的「作者批注栏」）。
 *
 * 为什么需要：需要作者插手的信号此前散在四处 —— 审稿台（待裁决章）、待办、
 * 张力曲线、故事时间线。作者要改一章得先跑四个视图才能拼出"到底该改什么"。
 * 这一栏把它们**聚合成一个可处置列表**：每条 = 要做什么 + 来源 + 说明 + 动作。
 *
 * 设计红线（承 2.1.5）：**不用单侧色条**表达严重度 —— 用徽章 + 底色 + 文字版语义色。
 */
import { useState } from 'react'
import css from './panel.module.css'

export type InboxTone = 'high' | 'warn' | 'info'

export interface InboxItem {
  id: string
  /** 要做什么（动词开头的一句话）。 */
  title: string
  /** 来源：AI 审稿 · 高优 / 时间线 / 张力 / 待审 … */
  source: string
  /** 补充说明（原因、影响、原文摘录）。 */
  detail?: string
  tone: InboxTone
  actionLabel: string
  onAction: () => void
}

const TONE_LABEL: Record<InboxTone, string> = {
  high: '高优',
  warn: '待确认',
  info: '建议',
}

export function AuthorInbox({ items, total, shown, onOpenAll, empty }: {
  items: InboxItem[]
  /** 未截断的总条数（> items.length 时提示还有多少）。 */
  total: number
  /** 列表区最大高度由外层控制时用的展示条数说明。 */
  shown?: number
  onOpenAll?: () => void
  /** 空态文案。 */
  empty: string
}): JSX.Element {
  // 逐条展开状态（默认折叠）：长批注不再把整行撑高、让短批注下面空一片。
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  return (
    <div className={css.inbox}>
      <div className={css.inboxHead}>
        <span className={css.inboxTitle}>作者批注栏</span>
        <span className={css.inboxCount}>
          {total === 0 ? '全部清空' : `${total} 项待处理`}
        </span>
        {onOpenAll !== undefined && total > 0 && (
          <button type="button" className={css.inboxAll} onClick={onOpenAll}>全部待办 →</button>
        )}
      </div>
      {items.length === 0 ? (
        <div className={css.inboxEmpty}>{empty}</div>
      ) : (
        <div className={css.inboxList}>
          {items.map(it => {
            const isOpen = opened[it.id] === true
            // 说明默认收起；展开标记挂在**元素自己身上**（不靠祖先条件 —— 见 CSS 注释）
            const openMark = isOpen ? 'yes' : undefined
            return (
              <div key={it.id} className={css.inboxItem} data-tone={it.tone} data-open={isOpen ? 'yes' : undefined}>
                <span className={css.inboxBadge}>{TONE_LABEL[it.tone]}</span>
                <span className={css.inboxBody}>
                  <span className={css.inboxItemTitle} data-open={openMark}>{it.title}</span>
                  <span className={css.inboxSource}>{it.source}</span>
                  {it.detail !== undefined && it.detail !== '' && (
                    <span className={css.inboxDetail} data-open={openMark}>{it.detail}</span>
                  )}
                </span>
                <span className={css.inboxActs}>
                  {it.detail !== undefined && it.detail !== '' && (
                    <button
                      type="button"
                      className={css.inboxMoreBtn}
                      onClick={() => { setOpened(prev => ({ ...prev, [it.id]: !isOpen })) }}
                    >
                      {isOpen ? '收起' : '展开'}
                    </button>
                  )}
                  <button type="button" className={css.inboxAct} onClick={() => { it.onAction() }}>
                    {it.actionLabel}
                  </button>
                </span>
              </div>
            )
          })}
          {shown !== undefined && total > shown && (
            <div className={css.inboxMore}>还有 {total - shown} 项 —— 点「全部待办」逐条处理。</div>
          )}
        </div>
      )}
    </div>
  )
}
