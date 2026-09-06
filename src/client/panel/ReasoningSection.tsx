/**
 * 推理强度（思考强度）独立容器：写作类/分析类两个 reasoningEffort 下拉。
 */
import { Brain } from 'lucide-react'
import type { NovelConfig } from '../../protocol.ts'
import { tt } from './helpers.ts'
import css from './panel.module.css'

const REASONING_OPTIONS = ['off', 'low', 'high', 'max'] as const
const REASONING_LABEL: Record<string, string> = {
  off: tt('settings.reasoning.off'),
  low: tt('settings.reasoning.low'),
  high: tt('settings.reasoning.high'),
  max: tt('settings.reasoning.max'),
}

export interface ReasoningSectionProps {
  reasoningEffort: NovelConfig['reasoningEffort']
  analysisReasoning: NovelConfig['analysisReasoning']
  onChange: (patch: { reasoningEffort?: NovelConfig['reasoningEffort']; analysisReasoning?: NovelConfig['analysisReasoning'] }) => void
}

export function ReasoningSection({ reasoningEffort, analysisReasoning, onChange }: ReasoningSectionProps): JSX.Element {
  return (
    <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-24)' }}>
      <span className={css.cardTitle}><Brain size={18} style={{ verticalAlign: -3 }} /> {tt('settings.reasoningSection')}</span>
      <div className={css.field}><label className={css.fieldLabel}>{tt('settings.reasoningEffort')}</label><select className={css.input} value={reasoningEffort ?? 'off'} onChange={e => onChange({ reasoningEffort: e.target.value as NovelConfig['reasoningEffort'] })}>{REASONING_OPTIONS.map(v => <option key={v} value={v}>{REASONING_LABEL[v]}</option>)}</select><span className={css.meta}>{tt('settings.reasoningHint')}</span></div>
      <div className={css.field}><label className={css.fieldLabel}>{tt('settings.analysisReasoning')}</label><select className={css.input} value={analysisReasoning ?? 'low'} onChange={e => onChange({ analysisReasoning: e.target.value as NovelConfig['analysisReasoning'] })}>{REASONING_OPTIONS.map(v => <option key={v} value={v}>{REASONING_LABEL[v]}</option>)}</select><span className={css.meta}>{tt('settings.analysisReasoningHint')}</span></div>
    </div>
  )
}