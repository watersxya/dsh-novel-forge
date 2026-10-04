/**
 * 指标条内嵌迷你走势图（sparkline）：把「一堆数字」变成「一条形状」。
 *
 * 为什么需要它：总编台四个常驻指标原本全是纯数字。作者看到「全书字数 87,431」
 * 无法判断形状 —— 33 章是均匀分布的，还是前 5 章写了六成、中间塌了十章？
 * sparkline 让「节奏」变成一眼可见的形态，而不需要点进任何视图。
 *
 * 设计约束（避免图表挤进 12px 高的指标格后反而变噪）：
 *   - 不画坐标轴、不画网格、不画标签：只有形状；每根柱自带悬停提示给出该章字数，
 *     峰值等形态解读由 describeShape() 以文字提供。
 *   - 柱高按 max 归一化，0 字章节画成基线上的 1px 短横（"这一章还没写"）。
 *   - 已过审 / 未过审用两套填充区分，替代图例文字。
 *   - 纯装饰性趋势：aria-hidden，真正的数据在相邻的 <b> 数字里，已由读屏播报。
 */

export interface SparkPoint {
  /** 章节号（仅用于 title 提示）。 */
  no: number
  /** 该章字数。 */
  chars: number
  /** 是否已过审 —— 决定用「过审色」还是「待定色」填充。 */
  approved: boolean
}

export interface SparklineProps {
  points: SparkPoint[]
  /** 无数据时的替代文本（例如「尚未开写」）。 */
  emptyHint?: string
}

/** 迷你柱状走势。宽固定 132、高 26，用 viewBox 缩放以适配窄容器。 */
export function Sparkline({ points, emptyHint = '尚未开写' }: SparklineProps): JSX.Element {
  if (points.length === 0) {
    return <span className="nf-spark-empty">{emptyHint}</span>
  }
  const W = 132
  const H = 26
  const gap = 1
  // 单章时不留 gap，否则柱宽算出来是 0。
  const bw = points.length === 1 ? W : Math.max(1, (W - gap * (points.length - 1)) / points.length)
  const max = Math.max(1, ...points.map(p => p.chars))

  return (
    <svg
      className="nf-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--nf-border)" strokeWidth={1} />
      {points.map((p, i) => {
        const x = i * (bw + gap)
        // 0 字章节：留 1px 短横贴在基线上，表示「占位」而非「零高度不可见」。
        const h = p.chars === 0 ? 1 : Math.max(1.5, (p.chars / max) * (H - 3))
        const fill = p.approved ? 'var(--nf-success)' : 'var(--nf-border-2)'
        return (
          <rect
            key={p.no}
            x={x}
            y={H - h}
            width={bw}
            height={h}
            fill={fill}
            rx={bw > 3 ? 1 : 0}
          >
            <title>{`第 ${p.no} 章 · ${p.chars.toLocaleString()} 字${p.approved ? ' · 已过审' : ''}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

/**
 * 形态解读：把序列讲成一句人话，给 sparkline 当无障碍替代与悬停提示。
 * 不新增数据，只描述现有分布 —— 目的是让作者知道「该看哪里」而不是给结论。
 */
export function describeShape(points: SparkPoint[]): string {
  if (points.length === 0) return '尚未开写'
  const max = Math.max(...points.map(p => p.chars))
  if (max === 0) return '已排章节均未落笔'
  const avg = points.reduce((a, b) => a + b.chars, 0) / points.length
  const peak = points.reduce((a, b) => (b.chars > a.chars ? b : a), points[0]!)
  const empty = points.filter(p => p.chars === 0).length
  const bits: string[] = []
  if (empty > 0) bits.push(`${empty} 章空白`)
  bits.push(`峰值第 ${peak.no} 章 ${peak.chars.toLocaleString()} 字`)
  if (max > 0 && avg > 0) {
    const ratio = max / avg
    if (ratio >= 3) bits.push('分布很不均')
    else if (ratio <= 1.4) bits.push('分布均匀')
  }
  return bits.join(' · ')
}