/**
 * 书架条：显示所有书，点击切换当前书（继续编译），＋ 新建。
 * 新建 = 开书向导：书名 + 大纲（拖拽/选择 docx 或粘贴文本），创建即建项目。
 */
import { useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { extractDocxTextFromBuffer } from '../docx.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import css from './panel.module.css'

/** Props. */
export interface BookshelfBarProps {
  api: NovelApi
  shelf: BookshelfSnapshot
  /** 刷新整个面板（切换书后重新拉状态）。 */
  onSwitch: () => void
}

/** 书架条。 */
export function BookshelfBar({ api, shelf, onSwitch }: BookshelfBarProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [outlineName, setOutlineName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const outlineFileRef = useRef<HTMLInputElement | null>(null)

  const handlePickOutlineFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    try {
      const buffer = await file.arrayBuffer()
      const text = extractDocxTextFromBuffer(buffer)
      if (text.length < 50) {
        setError('大纲内容过短（<50 字符），请检查文件')
        return
      }
      setOutlineText(text)
      setOutlineName(file.name)
      setError('')
    } catch (err) {
      setError(`读取大纲失败：${(err as Error).message}`)
    }
  }

  const handleCreate = async (): Promise<void> => {
    const bookName = name.trim()
    if (bookName === '') return
    setBusy(true)
    setError('')
    try {
      await api.bookCreate(bookName, undefined, outlineText.trim() !== '' ? outlineText.trim() : undefined)
      setCreating(false)
      setName('')
      setOutlineText('')
      setOutlineName('')
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleActivate = async (id: string): Promise<void> => {
    if (id === shelf.activeBookId) return
    setBusy(true)
    try {
      await api.bookActivate(id)
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await api.bookRemove(id)
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.bookshelf}>
      <span className={css.bookshelfLabel}>书架</span>
      <div className={css.bookshelfList}>
        {shelf.books.map(book => (
          <div
            key={book.id}
            className={`${css.bookChip} ${book.id === shelf.activeBookId ? css.bookChipActive : ''}`}
            onClick={() => { void handleActivate(book.id) }}
            title={book.outputDir}
          >
            <span className={css.bookChipName}>{book.bookName}</span>
            <span className={css.bookChipMeta}>{book.hasProject ? `${book.done}/${book.total} 章` : '未开书'}</span>
            <button
              type="button"
              className={css.bookChipRemove}
              title="从书架移除"
              onClick={(e) => { e.stopPropagation(); void handleRemove(book.id) }}
            >
              ×
            </button>
          </div>
        ))}
        {!creating ? (
          <button type="button" className={css.bookAdd} onClick={() => { setCreating(true) }}>
            ＋ 新书
          </button>
        ) : (
          <div className={css.bookCreateForm}>
            <input
              className={css.input}
              style={{ width: 140 }}
              placeholder="书名"
              value={name}
              onChange={e => { setName(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
              autoFocus
            />
            {/* 开书向导：大纲（可选，推荐） */}
            <div className={css.bookCreateOutline}>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                onClick={() => { outlineFileRef.current?.click() }}
              >
                {outlineName !== '' ? `✓ ${outlineName}` : '📄 选择大纲 docx'}
              </button>
              <input
                ref={outlineFileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: 'none' }}
                onChange={e => {
                  void handlePickOutlineFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <textarea
                className={css.input}
                style={{ width: 280, minHeight: 64, resize: 'vertical' }}
                placeholder="或直接粘贴大纲文本（提供大纲后开书即建立项目，书名自动从大纲首行识别）"
                value={outlineText}
                onChange={e => { setOutlineText(e.target.value) }}
              />
            </div>
            <div className={css.row}>
              <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || name.trim() === ''} onClick={() => { void handleCreate() }}>
                开书
              </button>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setCreating(false) }}>
                取消
              </button>
              <span className={css.meta}>{outlineText.length > 0 ? `大纲 ${outlineText.length} 字` : '未提供大纲（稍后在大纲页导入）'}</span>
            </div>
          </div>
        )}
      </div>
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-12)' }}>{error}</span>}
    </div>
  )
}
