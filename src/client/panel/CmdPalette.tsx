/**
 * CmdPalette — 全局命令面板（⌘K / Ctrl+K，R3 微交互）。
 *
 * 纯受控组件：open/onClose 由 NovelPanel 管理，actions 由 NovelPanel 组装
 * （Tab 跳转 / 浮窗开关 / 设置直达）。键盘：↑↓ 选择、Enter 执行、Esc 关闭。
 * 样式走 panel.module.css 的 .cmd* 家族，完全跟随当前主题令牌。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import css from './panel.module.css'

export interface CmdAction {
  icon: string
  label: string
  hint?: string
  run: () => void
}

export function CmdPalette({ open, onClose, actions }: {
  open: boolean
  onClose: () => void
  actions: CmdAction[]
}): ReactElement | null {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return actions
    return actions.filter(a => a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q))
  }, [actions, query])

  // 打开时重置并聚焦；query/结果变化时钳制选中项
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1))
  }, [filtered, active])

  if (!open) return null

  const execute = (a: CmdAction | undefined): void => {
    if (a === undefined) return
    onClose()
    a.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); execute(filtered[active]); return }
  }

  return (
    <div
      className={css.cmdMask}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={onKeyDown}
    >
      <div className={css.cmdBox} role="dialog" aria-modal="true" aria-label="命令面板">
        <input
          ref={inputRef}
          className={css.cmdInput}
          value={query}
          placeholder="搜索命令：跳转、生成、审稿、设置……"
          onChange={e => setQuery(e.target.value)}
          spellCheck={false}
        />
        {filtered.length === 0 ? (
          <div className={css.cmdEmpty}>没有匹配的命令</div>
        ) : (
          <ul className={css.cmdList} ref={listRef} role="listbox">
            {filtered.map((a, i) => (
              <li
                key={a.label}
                className={css.cmdItem}
                data-active={i === active ? '' : undefined}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => execute(a)}
              >
                <span className={css.cmdIcon}>{a.icon}</span>
                <b>{a.label}</b>
                {a.hint !== undefined && <span className={css.cmdHint}>{a.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
