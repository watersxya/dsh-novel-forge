/**
 * 导入小说弹窗：两种模式 ——
 *  A) 已有项目目录（含 novel-project.json）→ 登记/激活书架（粘贴服务器本地路径）；
 *  B) txt/md 全本 → 点击选择文件，浏览器读取内容 → 服务器拆章预览 → 确认后导入。
 *  Mode B 也保留「服务器本地路径」高级选项（大文件或服务器端已有文件时用）。
 */
import { useEffect, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { BookImportTextPreviewResponse } from '../../protocol.ts'
import { readFileTextSmart } from '../text.ts'
import css from './panel.module.css'

type ImportMode = 'dir' | 'text'

/** 导入结果（成功态展示）。 */
interface ImportResult {
  kind: 'dir' | 'text'
  bookName: string
  existed?: boolean
  chapters?: number
  skipped?: string[]
}

export function ImportModal({
  api,
  onClose,
  onImported,
}: {
  api: NovelApi
  onClose: () => void
  /** 导入成功并已激活该书后回调（刷新书架）。 */
  onImported: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<ImportMode>('dir')
  // Mode A
  const [dir, setDir] = useState('')
  // Mode B：文件选择 + 预览
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileText, setFileText] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<BookImportTextPreviewResponse | null>(null)
  // Mode B：服务器本地路径（高级）
  const [showPath, setShowPath] = useState(false)
  const [filePath, setFilePath] = useState('')
  // 通用
  const [outDir, setOutDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  /** 选择文件 → 读取内容 → 调服务器预览拆章。 */
  const onPickFile = async (file: File | undefined) => {
    if (file === undefined) return
    setError('')
    setResult(null)
    setPreview(null)
    setFileName(file.name)
    setPreviewing(true)
    try {
      const text = await readFileTextSmart(file)
      setFileText(text)
      const p = await api.bookImportTextPreview(text, file.name)
      setPreview(p)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  const runImport = async () => {
    setError('')
    setResult(null)
    if (mode === 'dir') {
      const d = dir.trim()
      if (d === '') { setError('请输入项目目录（含 novel-project.json 的文件夹）'); return }
      setBusy(true)
      try {
        const r = await api.bookImportDir(d)
        setResult({ kind: 'dir', bookName: r.book.bookName, existed: r.existed })
        await onImported()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    // Mode B：优先上传内容；未选文件时退回服务器路径
    if (fileText !== null && fileText.length > 0) {
      setBusy(true)
      try {
        const o = outDir.trim()
        const r = await api.bookImportTextContent(fileText, fileName, o !== '' ? o : undefined)
        setResult({ kind: 'text', bookName: r.bookName, chapters: r.chapters, skipped: r.skipped })
        await onImported()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    const f = filePath.trim()
    if (f === '') { setError('请先选择文件，或输入服务器本地文件路径'); return }
    setBusy(true)
    try {
      const o = outDir.trim()
      const r = await api.bookImportText(f, o !== '' ? o : undefined)
      setResult({ kind: 'text', bookName: r.bookName, chapters: r.chapters, skipped: r.skipped })
      await onImported()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (m: ImportMode) => { setMode(m); setError(''); setResult(null); setPreview(null) }

  // Esc 关闭弹窗。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className={css.importModalOverlay} role="dialog" aria-modal="true" aria-label="导入小说" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.importModal}>
        <div className={css.importModalHead}>
          <span className={css.panelTitle} style={{ margin: 0 }}>📥 导入小说</span>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClose} title="关闭">✕</button>
        </div>

        <div className={css.importModalTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'dir'}
            className={`${css.button} ${mode === 'dir' ? css.buttonPrimary : ''}`}
            onClick={() => { switchMode('dir') }}
          >
            📂 A · 已有项目目录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={`${css.button} ${mode === 'text' ? css.buttonPrimary : ''}`}
            onClick={() => { switchMode('text') }}
          >
            📄 B · txt/md 全本
          </button>
        </div>

        <div className={css.importModalBody}>
          {mode === 'dir' ? (
            <>
              <label className={css.importField}>
                <span>项目目录（绝对路径）</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="例如 D:\novels\我的小说"
                  value={dir}
                  onChange={e => { setDir(e.target.value) }}
                />
              </label>
              <div className={css.importHint}>
                目录需含 novel-project.json。已在书架中的目录会直接切换激活，不会重复登记。
              </div>
            </>
          ) : (
            <>
              {/* 文件选择 + 预览 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                style={{ display: 'none' }}
                onChange={e => { void onPickFile(e.target.files?.[0]); e.target.value = '' }}
              />
              <div className={css.importField}>
                <span>全本文本文件（txt / md）</span>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonPrimary}`}
                  onClick={() => { fileInputRef.current?.click() }}
                >
                  📄 选择文件
                </button>
              </div>
              {fileName !== '' && (
                <div className={css.importFileInfo}>
                  <span>已选择：{fileName}</span>
                  {previewing && <span className={css.meta}>正在拆章预览…</span>}
                </div>
              )}
              {preview !== null && (
                <div className={css.importPreview}>
                  <span>📖 《{preview.bookName}》 · 识别到 {preview.chapters.length} 章</span>
                  {preview.chapters.length > 0 && (
                    <ul className={css.importPreviewList}>
                      {preview.chapters.slice(0, 5).map(c => (
                        <li key={c.no}>第{c.no}章 {c.title}（{c.chars} 字）</li>
                      ))}
                      {preview.chapters.length > 5 && <li className={css.meta}>… 共 {preview.chapters.length} 章</li>}
                    </ul>
                  )}
                  {preview.skipped.length > 0 && (
                    <span className={css.meta}>
                      跳过 {preview.skipped.length} 个过短章节：{preview.skipped.slice(0, 5).join('、')}
                      {preview.skipped.length > 5 ? ' 等' : ''}
                    </span>
                  )}
                </div>
              )}

              {/* 输出目录 + 高级路径选项 */}
              <label className={css.importField}>
                <span>输出目录（可选，默认 ~/.dsh/novels/书名）</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="留空使用默认目录"
                  value={outDir}
                  onChange={e => { setOutDir(e.target.value) }}
                />
              </label>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                onClick={() => { setShowPath(!showPath) }}
              >
                {showPath ? '▾ 收起高级选项' : '▸ 高级：使用服务器本地文件路径'}
              </button>
              {showPath && (
                <label className={css.importField}>
                  <span>服务器本地文件绝对路径（大文件或服务器端已有文件时用）</span>
                  <input
                    className={css.input}
                    type="text"
                    placeholder="例如 D:\novels\全本.txt"
                    value={filePath}
                    onChange={e => { setFilePath(e.target.value) }}
                  />
                </label>
              )}
              <div className={css.importHint}>
                服务器按「第X章/第X回/第X节/第X卷」、中文数字章节（一、二、三…）、序章/楔子/尾声、英文 Chapter N 拆章；正文过短（&lt;50 字）的章节会跳过并列出。
              </div>
            </>
          )}

          {error !== '' && <div className={css.importError}>{error}</div>}

          {result !== null && (
            <div className={css.importResult}>
              {result.kind === 'dir' ? (
                <>
                  <span>✅ 已{result.existed === true ? '重新激活' : '登记'}《{result.bookName}》</span>
                  <span className={css.meta}>
                    {result.existed === true
                      ? '该目录已在书架中，现已切换为当前书；工作台数据按该书目录加载。'
                      : '已加入书架并设为当前书，进入工作台即可看到全部模块。'
                    }
                  </span>
                </>
              ) : (
                <>
                  <span>✅ 《{result.bookName}》导入完成：{result.chapters} 章</span>
                  {(result.skipped ?? []).length > 0 && (
                    <span className={css.meta}>
                      跳过 {result.skipped!.length} 个过短章节：{result.skipped!.slice(0, 8).join('、')}
                      {result.skipped!.length > 8 ? ` 等 ${result.skipped!.length} 个` : ''}
                    </span>
                  )}
                  <span className={css.meta}>章节已按「written」登记，进入工作台后逐章审稿/补设定即可。</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className={css.importModalActions}>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClose}>关闭</button>
          <button
            type="button"
            className={`${css.button} ${css.buttonPrimary}`}
            disabled={busy}
            onClick={runImport}
          >
            {busy ? '导入中…' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}