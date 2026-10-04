/**
 * 破坏性操作确认弹窗 —— 取代 9 处 window.confirm。
 *
 * 为什么必须换：window.confirm 是全项目唯一一处「从暖纸朱砂瞬间跳到 Windows 灰白」
 * 的视觉破口。它同时也是最该被认真设计的地方 —— 用户在这几个动作上押的是
 * 「不可恢复」：清空聊天记录、删除提供方与 API 密钥、用新总纲重置全书进度、
 * 删除剧情线、删除角色。而原生弹窗给不出两样东西：
 *   1. 后果清单（到底会删掉什么、保留什么）
 *   2. 承诺（哪些东西会先自动备份）
 * 这两样正是这个产品已有的正确做法 —— 采纳章节新稿时那句「原稿已自动备份 .bak」
 * （NovelPanel wsAppliedBanner）就很好，这里沿用同一套语言。
 *
 * 三档强度：
 *   danger —— 不可恢复，必须勾选知悉；requirePhrase 存在时需逐字输入确认词
 *   warn   —— 会覆盖或会丢数据，直接确认
 *   info   —— 跳过审稿 / 覆盖正文这类可回滚动作，直接确认
 *
 * 执行失败不停在「关掉弹窗 + 一句红字」：动作在弹窗内 await，失败时弹窗保持打开
 * 并就地显示错误 + 重试按钮 —— 这正是「失败了不知道还能怎么办」的正解。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, TriangleAlert } from 'lucide-react'
import { NoticeBar } from './NoticeBar.tsx'
import css from './panel.module.css'

export type ConfirmTone = 'danger' | 'warn' | 'info'

export interface ConfirmSpec {
  /** 弹窗标题：一句话说清要做什么。 */
  title: string
  /** 后果说明：到底会发生什么、什么会保留。 */
  body: React.ReactNode
  /** 逐条列出的影响面。 */
  effects?: string[]
  /** 承诺：如「原稿会先自动备份为 .bak，可再换回来」。 */
  assurance?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  /** 需要逐字输入的确认词；给出时用户必须输入一致才能确认。 */
  requirePhrase?: string
  /** 真正的动作。抛错时弹窗不关，就地显示错误并可重试。 */
  onConfirm: () => void | Promise<void>
}

const TONE_ICON: Record<ConfirmTone, React.ReactNode> = {
  danger: <AlertTriangle size={16} />,
  warn: <TriangleAlert size={16} />,
  info: <Info size={16} />,
}

export function ConfirmDialog({ spec, onCancel, onDone }: {
  spec: ConfirmSpec
  onCancel: () => void
  onDone: () => void
}): JSX.Element {
  const tone = spec.tone ?? 'warn'
  const [phrase, setPhrase] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  const phraseOk = spec.requirePhrase === undefined || phrase.trim() === spec.requirePhrase
  const ackOk = spec.requirePhrase !== undefined || tone !== 'danger' || ack
  const canConfirm = !busy && phraseOk && ackOk

  // 打开即聚焦确认钮：键盘用户不必再 Tab 一遍到底。
  useEffect(() => { confirmRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onCancel, busy])

  const run = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await spec.onConfirm()
      onDone()
    } catch (err) {
      // 不关弹窗：把错误就地摊在用户面前，重试按钮就在旁边。
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      className={css.confirmOverlay}
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className={css.confirmCard} role="alertdialog" aria-modal="true" aria-label={spec.title} data-tone={tone}>
        <div className={css.confirmHead}>
          <span className={css.confirmIcon} data-tone={tone} aria-hidden="true">{TONE_ICON[tone]}</span>
          <span className={css.confirmTitle}>{spec.title}</span>
        </div>

        <div className={css.confirmBody}>
          <p className={css.confirmText}>{spec.body}</p>
          {spec.effects !== undefined && spec.effects.length > 0 && (
            <ul className={css.confirmList}>
              {spec.effects.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
          {spec.assurance !== undefined && spec.assurance !== '' && (
            <p className={css.confirmAssurance}>{spec.assurance}</p>
          )}
        </div>

        {spec.requirePhrase !== undefined && (
          <label className={css.confirmPhraseRow}>
            <span className={css.confirmPhraseHint}>
              请输入 <b>{spec.requirePhrase}</b> 以确认
            </span>
            <input
              className={css.input}
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              onChange={e => { setPhrase(e.target.value) }}
              placeholder={spec.requirePhrase}
            />
          </label>
        )}

        {spec.requirePhrase === undefined && tone === 'danger' && (
          <label className={css.confirmAckRow}>
            <input type="checkbox" checked={ack} onChange={e => { setAck(e.target.checked) }} />
            <span>我已知悉这一步不可恢复。</span>
          </label>
        )}

        {error !== '' && (
          <NoticeBar
            kind="error"
            detail="弹窗不会自动关闭，改动如已部分生效请先核对再重试。"
            onRetry={() => { void run() }}
          >
            {error}
          </NoticeBar>
        )}

        <div className={css.confirmActions}>
          <button type="button" className={css.button} onClick={onCancel} disabled={busy}>
            {spec.cancelLabel ?? '取消'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`${css.button} ${css.confirmGo}`}
            data-tone={tone}
            disabled={!canConfirm}
            onClick={() => { void run() }}
          >
            {busy ? '处理中…' : (spec.confirmLabel ?? '确认')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 用法（替代 window.confirm）：
 *   const confirm = useConfirm()
 *   confirm({ title: '…', body: '…', tone: 'danger', onConfirm: async () => { await api.x() } })
 *   // …并在 JSX 里渲染 {confirm.dialog}
 *
 * 动作用回调传入（而不是 resolve(true) 后由调用方自己跑），这样执行失败时
 * 弹窗能留在原地显示错误并提供重试 —— 不会退化成「关掉弹窗 + 一句红字」。
 */
export function useConfirm(): {
  confirm: (spec: ConfirmSpec) => void
  dialog: JSX.Element | null
} {
  const [spec, setSpec] = useState<ConfirmSpec | null>(null)
  const confirm = useCallback((next: ConfirmSpec) => { setSpec(next) }, [])
  const dialog = useMemo(
    () => spec === null ? null : (
      <ConfirmDialog spec={spec} onCancel={() => { setSpec(null) }} onDone={() => { setSpec(null) }} />
    ),
    [spec],
  )
  return { confirm, dialog }
}
