/**
 * 统一子页骨架（1:1 对齐 demo-subpages.html 的 .subpage / .subpage-head / .subpage-body）。
 *
 * 所有作者级与书内子页都应套这层壳：
 *   - head：返回钮（可选）+ 大标题 + meta + 右侧操作区
 *   - body：页面内容（内部按 demo 用 .card / .box / .grid / .row 等块）
 * 业务逻辑继续留在各自的 View 组件里，这里只负责「壳」。
 */
import type { ReactNode } from 'react'
import css from './panel.module.css'

export function SubPage(props: {
  /** 页面大标题（衬线 display 档）。 */
  title: string
  /** 标题右侧的说明行（如「4 本书 · 当前书《X》」）。 */
  meta?: ReactNode
  /** 返回钮：作者级返回书架，书内返回总编台。 */
  back?: { label: string; onClick: () => void }
  /** 页头右侧操作区（主 CTA 放最右）。 */
  actions?: ReactNode
  /** 主题系统局部模式（透传到根 div 的 data-nf-mode，供设置页等预览明暗）。 */
  dataNfMode?: 'light' | 'dark'
  /** 主题系统局部密度（透传到根 div 的 data-nf-density）。 */
  dataNfDensity?: 'comfort' | 'compact' | 'spacious'
  children: ReactNode
}): JSX.Element {
  return (
    <div className={css.subPage} data-nf-mode={props.dataNfMode} data-nf-density={props.dataNfDensity}>
      <div className={css.subPageHead}>
        {props.back !== undefined && (
          <button type="button" className={css.subPageBack} onClick={props.back.onClick}>
            ← {props.back.label}
          </button>
        )}
        <span className={css.subPageTitle}>{props.title}</span>
        {props.meta !== undefined && <span className={css.subPageMeta}>{props.meta}</span>}
        {props.actions !== undefined && <div className={css.subPageActions}>{props.actions}</div>}
      </div>
      <div className={css.subPageBody}>{props.children}</div>
    </div>
  )
}
