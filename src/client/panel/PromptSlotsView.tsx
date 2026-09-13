/**
 * 提示词槽位：给作者留几个**安全可改**的位置来微调本书表达偏好。
 *
 * 边界写在界面上：槽位只**追加偏好**，不能覆盖道藏、写作红线、九条内容合规红线、
 * 反 AI 规则与阶段契约 —— 这些由宿主锁定。清空即恢复默认。
 */

import { useCallback, useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { PromptSlotId, PromptSlotState } from '../../protocol.ts'
import css from './panel.module.css'

export interface PromptSlotsViewProps {
  api: NovelApi
}

export default function PromptSlotsView({ api }: PromptSlotsViewProps): JSX.Element {
  const [slots, setSlots] = useState<PromptSlotState[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (showError = true): Promise<void> => {
    try {
      const r = await api.promptSlots()
      setSlots(r.slots)
      setDrafts(Object.fromEntries(r.slots.map(s => [s.id, s.value])))
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void refresh(false) }, [refresh])

  const save = useCallback(async (id: PromptSlotId): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      await api.promptSlotSet(id, drafts[id] ?? '')
      await refresh()
      setNotice((drafts[id] ?? '').trim() === '' ? '已清空该槽位（恢复默认）' : '已保存，下一次生成/审稿生效')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, drafts, refresh])

  const dirty = (slot: PromptSlotState): boolean => (drafts[slot.id] ?? '') !== slot.value

  return (
    <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>提示词槽位（本书）</span>
        <span className={css.meta}>只追加偏好，不覆盖道藏 / 红线 / 合规</span>
      </div>
      <span className={css.meta}>
        这里的文字会追加到写作提示词末尾，用来微调表达方式。**规则类内容不可改**：
        道藏、写作红线、内容合规红线、反 AI 规则、阶段契约由宿主锁定，槽位碰不到。
      </span>

      {notice !== '' && <span style={{ color: 'var(--nf-success)', fontSize: 'var(--nf-text-12)' }}>{notice}</span>}
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-text-12)' }}>{error}</span>}

      {slots.map(slot => {
        const value = drafts[slot.id] ?? ''
        const over = value.length > slot.maxChars
        return (
          <div key={slot.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--nf-space-8)' }}>
              <b style={{ fontSize: 'var(--nf-fs-12)' }}>{slot.label}</b>
              <span className={css.meta} style={{ color: over ? 'var(--nf-error)' : undefined }}>
                {value.length} / {slot.maxChars}
              </span>
            </div>
            <span className={css.meta}>{slot.hint}</span>
            <textarea
              className={css.textarea}
              rows={3}
              value={value}
              placeholder={slot.placeholder}
              onChange={e => setDrafts(prev => ({ ...prev, [slot.id]: e.target.value }))}
            />
            <div className={css.row} style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" className={css.button} disabled={busy || value === ''} onClick={() => { void save(slot.id) }}>
                清空
              </button>
              <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy || !dirty(slot)} onClick={() => { void save(slot.id) }}>
                保存
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
