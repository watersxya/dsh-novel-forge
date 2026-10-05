/**
 * Tiny translation helper for the panel.
 *
 * 面板是中文单语界面：文案只在 `locales.ts` 定义一次，这里按类型化键位取值
 * （键位不匹配会在编译期报错），保持客户端 bundle 自包含、不引入运行时语言服务。
 * 需要多语言时再接入 DSH 的 locale 服务，届时只需替换本函数实现。
 */
import type { KeyboardEvent } from 'react'
import { zh, type NovelKey } from '../locales.ts'

/** Translate one key with optional {placeholder} substitution. */
export function tt(key: NovelKey, params?: Record<string, string | number>): string {
  let text: string = zh[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

// ------------------------------------------------------------ shared constants

/** 角色定位中文名（角色库/提炼候选共用，收敛自多份复制）。 */
export const ROLE_LABELS: Record<string, string> = {
  protagonist: '主角',
  female_lead: '女主',
  female_support: '女配',
  support: '配角',
  antagonist: '反派',
  extra: '路人',
}

/** 角色定位徽章颜色。 */
export function roleColor(label: string): string {
  if (label === 'protagonist') return 'var(--nf-success)'
  if (label === 'female_lead') return 'var(--nf-accent)'
  if (label === 'antagonist') return 'var(--nf-error)'
  return 'var(--nf-text-3)'
}

/** 剧情线类型中文名（与 locale 对齐）。 */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'main': return tt('plotlines.kindMain')
    case 'branch': return tt('plotlines.kindBranch')
    case 'character': return tt('plotlines.kindCharacter')
    case 'mystery': return tt('plotlines.kindMystery')
    default: return kind
  }
}

/** 剧情线状态中文名。 */
export function plotlineStatusLabel(status: string): string {
  switch (status) {
    case 'active': return tt('plotlines.statusActive')
    case 'paused': return tt('plotlines.statusPaused')
    case 'resolved': return tt('plotlines.statusResolved')
    case 'abandoned': return tt('plotlines.statusAbandoned')
    default: return status
  }
}

/** 剧情线状态颜色。 */
export function plotlineStatusColor(status: string): string {
  if (status === 'resolved') return 'var(--nf-success)'
  if (status === 'abandoned') return 'var(--nf-text-3)'
  if (status === 'paused') return 'var(--nf-warn)'
  return 'var(--nf-accent)'
}

/**
 * 上下键在同类条目之间移动焦点（设计方案 §12「上下键移动章节列表 / 审稿问题」）。
 *
 * 只管焦点移动，不接管 Enter / 空格：条目保持原生 button 与 checkbox，
 * 「空格勾选问题」「Enter 打开章节」继续由浏览器负责，不另造一套键盘语义。
 * 焦点不在列表条目上时直接放行，方向键仍然用来滚动页面。
 *
 * @param event 列表容器上收到的 keydown。
 * @param itemSelector 条目选择器，如 `.${css.wbIndexRow}` 或 `input[type="checkbox"]`。
 */
export function moveFocusByArrow(event: KeyboardEvent<HTMLElement>, itemSelector: string): void {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(itemSelector))
  const from = items.indexOf(document.activeElement as HTMLElement)
  if (from < 0) return
  const to = from + step
  // 首/尾越界时不拦截：让页面照常滚动，而不是把方向键吃掉。
  if (to < 0 || to >= items.length) return
  event.preventDefault()
  items[to]?.focus()
}
