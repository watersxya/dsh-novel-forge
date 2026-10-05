/**
 * 总编台 hero（2.1.7 / 取自 prototype/NovelForge_总编台_Demo.html 的信息结构）。
 *
 * 为什么要有它：此前的首屏是「4 张指标卡 + 工序轨道」，作者看到的是**仪表盘**，
 * 得自己拼出"现在最该干什么"。hero 把这件事收敛成一条视线：
 *   在哪一章 → 该做什么 → 为什么现在做 → 做它的代价 → 边界（不会自动改写正文）。
 *
 * 与 demo 的差别（刻意保留）：demo 的大标题是一句文学化钩子（"旧钥已经发热…"），
 * 那需要"生成一句钩子"的数据源；这里用宿主**真实**的推荐动作标题，永远为真。
 * 虚线右侧的进度/节点也全部来自真实状态，不编造百分比。
 */
import type { ReactNode } from 'react'
import css from './panel.module.css'

export interface HomeHeroAction {
  /** 眉标：推荐下一步 / 需要你确认 / 阶段：等待中 … */
  eyebrow: string
  /** 主标题（一件具体的事）。 */
  title: string
  /** 为什么现在做。 */
  reason: string
  /** 主 CTA 文案（动词开头）。 */
  actionLabel: string
  onClick: () => void
}

export interface HomeHeroProps {
  /** 当前对象（如「第 8 章 · 雨夜之后」）。 */
  kicker: string
  /** 印章里的短标记（章号 / 阶段序号）。 */
  seal: string
  /** 印章下方说明。 */
  sealNote: string
  stageLabel?: string
  action: HomeHeroAction
  /** 次要动作（如「查看批注」）。 */
  secondary?: { label: string; onClick: () => void }
  busy: boolean
  busyLabel: string
  /** meta 行：只放**能真算出来**的事实。 */
  meta: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }>
  /** 本批次进度；无批次传 null。 */
  batch: { label: string; percent: number; caption: string } | null
  /** 章节节点：上一章 / 现在 / 下一步。 */
  nodes: Array<{ label: string; text: string; tone: 'done' | 'now' | 'next' }>
  children?: ReactNode
}

export function HomeHero({
  kicker, seal, sealNote, stageLabel, action, secondary, busy, busyLabel, meta, batch, nodes, children,
}: HomeHeroProps): JSX.Element {
  return (
    <section className={css.homeHero} aria-label="当前建议">
      {/* 工件池（2.1.14 签名元素）：章即工件，全宽一行压在 hero 顶部。
          把它放进 hero 是为了把"进度"从 5 处仪表（印章章号 / 过审百分比 / 刻度条 /
          工序轨道 / 状态池）收敛成一处**实物** —— 进度的本体是稿件，不是仪表。 */}
      {children !== undefined && <div className={css.homeHeroPool}>{children}</div>}
      <div className={css.homeHeroMain}>
        <div className={css.homeHeroKicker}>
          <span>{kicker}</span>
          <b>{action.eyebrow}</b>
        </div>
        <h2 className={css.homeHeroTitle}>{action.title}</h2>
        <p className={css.homeHeroWhy}>{action.reason}</p>
        <div className={css.homeHeroActs}>
          {/* 一屏一个朱砂主 CTA —— 其余动作一律次要样式。 */}
          <button type="button" className={css.homeHeroCta} disabled={busy} onClick={() => { action.onClick() }}>
            {busy ? busyLabel || '运行中…' : action.actionLabel}
          </button>
          {secondary !== undefined && (
            <button type="button" className={css.homeHeroAlt} onClick={() => { secondary.onClick() }}>
              {secondary.label}
            </button>
          )}
        </div>
        <div className={css.homeHeroMeta}>
          {meta.map(m => (
            <span key={m.label} data-tone={m.tone}>
              <i>{m.label}</i>
              <b>{m.value}</b>
            </span>
          ))}
        </div>
      </div>

      <aside className={css.homeHeroSide}>
        <div className={css.homeHeroSealRow}>
          <div className={css.homeHeroSeal}>
            <b>{seal}</b>
            <span>{sealNote}</span>
          </div>
          {stageLabel !== undefined && stageLabel !== '' && (
            <div className={css.homeHeroStage}>{stageLabel}</div>
          )}
        </div>

        {batch !== null && (
          <div className={css.homeHeroBatch}>
            <div className={css.homeHeroBatchHead}>
              <span>{batch.label}</span>
              <b>{Math.round(batch.percent * 100)}%</b>
            </div>
            <div className={css.homeHeroBatchBar}>
              <div className={css.homeHeroBatchFill} style={{ transform: `scaleX(${Math.min(Math.max(batch.percent, 0), 1)})` }} />
            </div>
            <div className={css.homeHeroBatchCap}>{batch.caption}</div>
          </div>
        )}

        {nodes.length > 0 && (
          <div className={css.homeHeroNodes}>
            {nodes.map(n => (
              <div key={n.label} className={css.homeHeroNode} data-tone={n.tone}>
                <span>{n.label}</span>
                <b>{n.text}</b>
              </div>
            ))}
          </div>
        )}
      </aside>
    </section>
  )
}
