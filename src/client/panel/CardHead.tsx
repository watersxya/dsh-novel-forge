/**
 * 卡片区块页头：「标题 + 计数 + 一句说明 + 右侧动作」的唯一样式源。
 *
 * 为什么需要它：审查发现同一个语义（卡片首行当页头）在面板里被手写了 19 遍，
 * 内联样式出现 8 种变体（`justifyContent: space-between` / 少 `flexWrap` /
 * 少 `alignItems` / `gap` 有 6、8、无 三档），导致同一层级的区块标题在垂直节奏上
 * 肉眼可见地参差不齐。收敛到这一个组件后，标题层级、对齐、换行策略只有一处定义。
 *
 * 与 `PageHeader` 的分工：
 *   - `PageHeader` = 视图级页头（每视图仅一个，大号衬线标题 + eyebrow）
 *   - `CardHead`   = 区块级页头（视图内多张卡的首行，小号、无 eyebrow）
 * 两级只此两级，不再有第三种「行内 span 当标题」的写法。
 */

import type { ReactNode } from 'react'
import css from './panel.module.css'

export interface CardHeadProps {
  /** 区块标题（必填）。用短语而非句子。 */
  title: ReactNode
  /** 计数后缀，例如 `（12）`。已含括号，避免调用方各写各的中英文标点。 */
  count?: string | number
  /** 标题右侧的一句 meta（弱色、12px、可省略）。 */
  note?: ReactNode
  /** 右侧动作区（按钮 / 下拉 / 切换）。 */
  actions?: ReactNode
  /** 大号标题（该卡片是本视图唯一主体时用，避免小标题显得寒酸）。 */
  large?: boolean
  /** 左侧 lucide 图标（16px 单色）。 */
  icon?: ReactNode
}

export function CardHead({ title, count, note, actions, large = false, icon }: CardHeadProps): JSX.Element {
  return (
    <div className={css.cardHead}>
      <div className={css.cardHeadLeft}>
        <span className={`${css.cardTitle} ${large ? css.cardTitleLg : ''}`}>
          {icon}
          {title}
          {count !== undefined && count !== '' && <span className={css.cardHeadCount}>{count}</span>}
        </span>
        {note !== undefined && note !== null && note !== '' && (
          <span className={css.cardHeadNote}>{note}</span>
        )}
      </div>
      {actions !== undefined && actions !== null && (
        <div className={css.cardHeadActions}>{actions}</div>
      )}
    </div>
  )
}

/**
 * 两端对齐行：把 8 种内联变体收成一个类。
 * 用于「左右两端放东西但左边不是标题」的场景（纯布局，不构成页头层级）。
 */
export function RowBetween({ wrap = false, align = 'center', gap, children }: {
  /** 窄容器下是否换行（默认换行：宁可两行也不裁切）。 */
  wrap?: boolean
  /** 垂直对齐方式。 */
  align?: 'center' | 'baseline' | 'flex-start'
  /** 间距档（默认 8）。 */
  gap?: 6 | 8 | 12
  children: ReactNode
}): JSX.Element {
  const cls = [
    css.row,
    css.rowBetween,
    wrap ? css.rowBetweenWrap : '',
    align === 'baseline' ? css.rowBetweenBaseline : '',
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} style={gap === undefined ? undefined : { gap: `var(--nf-space-${gap})` }}>
      {children}
    </div>
  )
}