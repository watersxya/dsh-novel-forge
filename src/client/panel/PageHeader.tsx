/** 墨案统一页头：eyebrow(11 大写窄) + 衬线大标题 + 一句说明 + 主/次动作。
 *  每个视图只用一个 PageHeader，消灭"各自为政"的页面标题。
 *  图标用 lucide 16 (单色)，标题旁禁止 emoji；标题用衬线 Display（书卷感）。 */
import type { ReactNode } from 'react'
import css from './panel.module.css'

export function PageHeader({ eyebrow, title, icon, sub, actions, right }: {
  /** 页眉小标（大写窄，可选，如 "BOOKSHELF"）。 */
  eyebrow?: string
  /** 页面大标题（衬线 Display）。 */
  title: string
  /** lucide 图标（单色，16px），可选。 */
  icon?: ReactNode
  /** 一句话辅助说明（meta）。 */
  sub?: string
  /** 右侧主/次按钮组。 */
  actions?: ReactNode
  /** 标题右上（如 AI 微签）。 */
  right?: ReactNode
}): JSX.Element {
  return (
    <div className={css.pageHeader}>
      <div className={css.pageHeaderMain}>
        {eyebrow !== undefined && eyebrow !== '' && (
          <div className={css.pageHeaderEyebrow}>{eyebrow}</div>
        )}
        <div className={css.pageHeaderTitle}>
          {icon}
          {title}
          {right}
        </div>
        {sub !== undefined && sub !== '' && <div className={css.pageHeaderSub}>{sub}</div>}
      </div>
      {actions !== undefined && actions !== null && <div className={css.pageHeaderActions}>{actions}</div>}
    </div>
  )
}
