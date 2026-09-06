/**
 * Tiny translation helper for the panel: reads the zh dict with the en dict
 * as fallback (the family plugins use a full locale registry; the panel keeps
 * a dependency-free helper so the client bundle stays self-contained).
 */
import { zh, en, type NovelKey } from '../locales.ts'

/** Translate one key with optional {placeholder} substitution. */
export function tt(key: NovelKey, params?: Record<string, string | number>): string {
  let text: string = zh[key] ?? en[key] ?? key
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
