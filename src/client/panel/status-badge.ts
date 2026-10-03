/**
 * 章节状态徽章的**唯一映射表**。
 *
 * ## 为什么必须共享
 *
 * 之前 `statusBadge` 在两处各写一份，且**映射不一致**：
 *
 * | 状态 | NovelPanel（工作台） | ReaderView（阅读器） |
 * |---|---|---|
 * | rejected | `badgeRejected` 红 | `badgePending` 灰 |
 * | error    | `badgeError` 红    | `badgePending` 灰 |
 *
 * 也就是说：作者在阅读器里看自己被驳回的稿子，徽章是**灰色**的，看着像"还没写"；
 * 切回工作台同一章却是**红色**。同一部书、同一个状态、两种颜色——
 * 这类不一致最难排查，因为它不会报错，只会让作者怀疑自己记错了。
 *
 * ## 为什么把「语义」和「样式类名」分开
 *
 * {@link statusTone} 是**纯数据**（可直接单测断言），CSS module 类名只在运行时
 * 解析。若把 `css.badgeRejected` 写进那张表，测试就得拉起整个 CSS module 加载链，
 * 于是「验证映射一致」这件最该被守住的事反而没法离线测。
 */
import css from './panel.module.css'

/** 徽章的语义色调——决定颜色，与具体 CSS 类名解耦。 */
export type StatusTone = 'pending' | 'active' | 'written' | 'done' | 'rejected' | 'error'

/** 各状态对应的色调。文案走 i18n（`tt`），故不在此表内。 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  pending: 'pending',
  generating: 'active',
  written: 'written',
  // reviewing 复用 active：两者都是"正在动"，作者不该看到第三种颜色。
  reviewing: 'active',
  approved: 'done',
  rejected: 'rejected',
  error: 'error',
}

/** 色调 → CSS module 类名（两处界面共用同一份，不再各写一遍）。 */
export const BADGE_CLASS: Record<StatusTone, string> = {
  pending: css.badgePending,
  active: css.badgeGenerating,
  written: css.badgeWritten,
  done: css.badgeDone,
  rejected: css.badgeRejected,
  error: css.badgeError,
}

/**
 * 取某章状态的色调。
 *
 * 未知状态一律按 `error` 处理：显式失败优于静默伪装成"正常/待写"。
 * 状态集合由 protocol 定义并可能扩展，所以这里不能写死穷尽分支。
 */
export function statusTone(status: string): StatusTone {
  return TONE_BY_STATUS[status] ?? 'error'
}

/** 取某章状态的徽章类名。 */
export function statusBadgeClass(status: string): string {
  return BADGE_CLASS[statusTone(status)]
}
