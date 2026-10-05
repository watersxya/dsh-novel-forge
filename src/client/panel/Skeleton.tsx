/**
 * 加载骨架（2.1.8 / 方案 §13 组件清单 + §10「加载状态」）。
 *
 * 为什么要有它：此前各处加载态是一行「加载中…」。作者看不出**在等什么**、还要多久，
 * 也无法区分「正在读」和「读完了但是空的」—— 后者是空状态，前者不该长得一样。
 * 骨架给出形状（几行占位）+ 一句具体动作（"正在读取写作资产…"）。
 *
 * 无障碍：容器 aria-busy，动画尊重 prefers-reduced-motion（见 .skeletonLine）。
 */
import css from './panel.module.css'

/** 骨架行宽度序列（循环取用，避免每行等宽显得像表格）。 */
const WIDTHS = [92, 100, 86, 95, 72, 88]

export function SkeletonLines({ label, lines = 6 }: {
  /** 说清「在等什么」，如「正在读取写作资产…」。 */
  label: string
  /** 占位行数。 */
  lines?: number
}): JSX.Element {
  return (
    <div className={css.skeletonBlock} aria-busy="true" aria-live="polite">
      <span className={css.meta}>{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={css.skeletonLine} style={{ width: String(WIDTHS[i % WIDTHS.length]) + '%' }} />
      ))}
    </div>
  )
}
