/**
 * 开书向导：独立页面视图 —— 书名 + 大纲（选择 docx / 拖拽 / 粘贴），
 * 实时书名识别与题材提示，开书即建项目并进入工作台。
 * 另含「想法 → AI 大纲」：输入一句话想法生成 2-3 个方案，可暂留换批，选中后回填大纲框。
 */
import { useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { setCurrentBook } from '../api.ts'
import type { OutlineCandidate } from '../../protocol.ts'
import { extractDocxTextFromBuffer } from '../docx.ts'
import css from './panel.module.css'

/** 从大纲首行推断书名（与服务端 inferBookName 一致，供实时预览）。 */
function inferBookNamePreview(outline: string): string {
  const line = outline.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (line === undefined) return ''
  return line.replace(/^《/, '').replace(/》.*$/, '').slice(0, 40)
}

/** 简单题材识别（提示用）。 */
function guessGenre(outline: string): string | null {
  const map: Array<[string, string[]]> = [
    ['仙侠修真', ['仙', '修', '灵根', '元婴', '宗门', '飞升']],
    ['都市', ['都市', '公司', '外卖', '职场', '总裁']],
    ['玄幻', ['斗气', '魂力', '大陆', '斗罗', '神']],
    ['悬疑', ['悬疑', '密室', '案件', '推理', '凶']],
    ['科幻', ['机甲', '星舰', 'AI', '未来', '星际']],
    ['历史', ['朝代', '皇帝', '将军', '古代', '王朝']],
    ['游戏', ['游戏', '副本', '装备', '等级', '职业']],
  ]
  for (const [genre, keywords] of map) {
    if (keywords.some(k => outline.includes(k))) return genre
  }
  return null
}

/** 开书向导页。 */
export function CreateBookView({
  api,
  onBack,
  onCreated,
  initialIdea,
  initialName,
}: {
  api: NovelApi
  /** 返回书架。 */
  onBack: () => void
  /** 开书成功：进入新书工作台。 */
  onCreated: (id: string) => void
  /** 从「创意灵感」带过来的起步想法（预填到「一句话想法」输入框）。 */
  initialIdea?: string
  /** 从「创意灵感」带过来的初始书名。 */
  initialName?: string
}) {
  const [name, setName] = useState(initialName ?? '')
  const [outlineText, setOutlineText] = useState('')
  const [outlineName, setOutlineName] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const outlineFileRef = useRef<HTMLInputElement | null>(null)

  // ---- 想法 → AI 大纲状态 ----
  const hasPrefill = initialIdea !== undefined && initialIdea.trim() !== ''
  const [ideaOpen, setIdeaOpen] = useState(hasPrefill)
  const [idea, setIdea] = useState(initialIdea ?? '')
  const [suggesting, setSuggesting] = useState(false)
  const [candidates, setCandidates] = useState<OutlineCandidate[]>([])
  const [pinned, setPinned] = useState<string[]>([])
  /** 回填后提示（如「已填入方案A，可继续修改」）。 */
  const [fillNotice, setFillNotice] = useState('')
  /** 选定方案自带的题材（创建后自动预填到本书创作资产）。 */
  const [selectedGenre, setSelectedGenre] = useState('')

  const autoName = inferBookNamePreview(outlineText)
  const effectiveName = name.trim() !== '' ? name.trim() : autoName
  const genre = guessGenre(outlineText)

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
      if (name.trim() === '') setName(inferBookNamePreview(text))
      setError('')
    } catch (err) {
      setError(`读取大纲失败：${(err as Error).message}`)
    }
  }

  /** 生成/换批：只补未暂留的空槽；exclude 传已暂留方案的卖点方向。 */
  const handleSuggest = async (): Promise<void> => {
    if (idea.trim().length < 10) {
      setError('想法太短（<10 字）：至少写一句完整想法，如「男主穿越修仙界靠做菜无敌」')
      return
    }
    setSuggesting(true)
    setError('')
    try {
      const exclude = candidates
        .filter(c => pinned.includes(c.id))
        .map(c => `${c.bookName}：${c.sellingPoint}${c.genre !== '' ? `（${c.genre}）` : ''}`)
      const count = Math.max(1, 3 - pinned.length)
      const result = await api.outlineSuggest(idea.trim(), count, exclude)
      // 换批合并：已暂留的原地保留，新生成的补充进空槽。
      setCandidates(prev => {
        const kept = prev.filter(c => pinned.includes(c.id))
        return [...kept, ...result.candidates].slice(0, 3)
      })
      setFillNotice('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  /** 暂留/取消暂留。 */
  const togglePin = (id: string): void => {
    setPinned(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  /** 选中方案：回填大纲框 + 书名，滚动到上方。 */
  const handlePick = (candidate: OutlineCandidate): void => {
    setOutlineText(candidate.outline)
    setName(candidate.bookName)
    setSelectedGenre(candidate.genre ?? '')
    setFillNotice(`已填入方案《${candidate.bookName}》（${candidate.genre}），可继续修改后开书`)
    setIdeaOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCreate = async (): Promise<void> => {
    if (effectiveName === '') {
      setError('请填写书名，或提供大纲自动识别')
      return
    }
    setBusy(true)
    setError('')
    try {
      const snapshot = await api.bookCreate(effectiveName, undefined, outlineText.trim() !== '' ? outlineText.trim() : undefined)
      const created = snapshot.books.find(b => b.id === snapshot.activeBookId)
      if (created !== undefined) {
        // 选定方案自带题材，或从大纲关键词识别到题材 → 创建后自动预填到本书创作资产（失败不阻断开书）。
        const detectedGenre = selectedGenre.trim() !== '' ? selectedGenre.trim() : (guessGenre(outlineText) ?? '')
        if (detectedGenre !== '') {
          try {
            setCurrentBook(created.id)
            await api.patchAssets({ genre: { name: detectedGenre, description: '', children: [] } })
          } catch { /* ignore */ }
        }
        onCreated(created.id)
      } else {
        setError('开书失败：未找到新书')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.createBookView}>
      <div className={css.createBookTop}>
        <button type="button" className={css.iconButton} title="返回书架" aria-label="返回书架" onClick={onBack}>
          ← 书架
        </button>
      </div>

      <div className={css.createBookCard}>
        <span className={css.createBookIcon}>✒️</span>
        <h2 className={css.createBookTitle}>开书向导</h2>
        <span className={css.meta}>把一份大纲「编译」成一本完整的小说</span>

        {error !== '' && (
          <div className={css.card} style={{ borderColor: 'var(--nf-error)', padding: 'var(--nf-space-8) var(--nf-space-12)' }}>
            <span style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-12)' }}>{error}</span>
          </div>
        )}

        {fillNotice !== '' && (
          <div className={css.card} style={{ borderColor: 'var(--nf-success)', padding: 'var(--nf-space-8) var(--nf-space-12)' }}>
            <span style={{ color: 'var(--nf-success)', fontSize: 'var(--nf-fs-12)' }}>✅ {fillNotice}</span>
          </div>
        )}

        <div className={css.field}>
          <label className={css.fieldLabel}>书名</label>
          <input
            className={css.input}
            placeholder={autoName !== '' ? `自动识别：${autoName}` : '输入书名（提供大纲后自动识别）'}
            value={name}
            onChange={e => { setName(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
            autoFocus
          />
        </div>

        <div className={css.field}>
          <label className={css.fieldLabel}>大纲</label>
          <div
            className={`${css.dropzone} ${dragActive ? css.dropzoneActive : ''}`}
            role="button"
            tabIndex={0}
            aria-label="选择或拖入 docx 大纲文件"
            onClick={() => { outlineFileRef.current?.click() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); outlineFileRef.current?.click() } }}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => { setDragActive(false) }}
            onDrop={e => {
              e.preventDefault()
              setDragActive(false)
              void handlePickOutlineFile(e.dataTransfer.files?.[0])
            }}
          >
            <span className={css.dropzoneIcon}>📄</span>
            <span>{outlineName !== '' ? `已选择：${outlineName}` : '点击选择 docx 大纲，或将文件拖到这里'}</span>
            <span className={css.meta}>推荐提供大纲：开书即建立项目，书名自动识别</span>
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
          </div>
          <textarea
            className={css.textarea}
            style={{ minHeight: 130 }}
            placeholder="或直接粘贴大纲文本（50 字以上）…"
            value={outlineText}
            onChange={e => { setOutlineText(e.target.value) }}
            spellCheck={false}
          />
        </div>

        {(outlineText.trim().length > 0 || effectiveName !== '') && (
          <div className={css.row} style={{ flexWrap: 'wrap' }}>
            {outlineText.trim().length > 0 && <span className={css.meta}>大纲 {outlineText.length} 字</span>}
            {effectiveName !== '' && <span className={css.meta}>书名：{effectiveName}</span>}
            {genre !== null && <span className={css.meta}>题材：{genre}</span>}
          </div>
        )}

        {/* 想法 → AI 大纲（可折叠） */}
        <div className={css.ideaCard}>
          <button
            type="button"
            className={css.ideaToggle}
            onClick={() => { setIdeaOpen(v => !v) }}
            aria-expanded={ideaOpen}
          >
            ✨ {ideaOpen ? '▾' : '▸'} 没有大纲？用一句话想法让 AI 生成
          </button>
          {ideaOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
              <textarea
                className={css.textarea}
                style={{ minHeight: 60 }}
                placeholder="例如：现代外卖员被雷劈穿越到修仙世界，靠祖传古玉捡漏发育，苟着苟着成了大佬…（≥50 字）"
                value={idea}
                onChange={e => { setIdea(e.target.value) }}
                spellCheck={false}
              />
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                  disabled={suggesting || idea.trim().length < 10}
                  onClick={() => { void handleSuggest() }}
                  title="生成 3 个方向不同的大纲方案供选择（约消耗 6-8k token）"
                >
                  {suggesting ? '⏳ 生成中…' : candidates.length === 0 ? '✨ 生成大纲方案' : `↻ 换一批（${Math.max(1, 3 - pinned.length)} 个）`}
                </button>
                {candidates.length > 0 && (
                  <span className={css.meta}>
                    已暂留 {pinned.length}/3 · 换批保留已暂留，只补新方案
                  </span>
                )}
              </div>

              {/* 方案卡 */}
              {candidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
                  {candidates.map(candidate => {
                    const isPinned = pinned.includes(candidate.id)
                    return (
                      <div
                        key={candidate.id}
                        className={css.ideaCandidate}
                        style={isPinned ? { borderColor: 'var(--nf-accent)', boxShadow: '0 0 0 2px var(--nf-accent-soft)' } : undefined}
                      >
                        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
                            <b>《{candidate.bookName}》</b>
                            {candidate.genre !== '' && <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{candidate.genre}</span>}
                            {isPinned && <span className={css.badge} style={{ borderColor: 'var(--nf-warn)', color: 'var(--nf-warn)' }}>★ 已暂留</span>}
                          </span>
                          <span style={{ display: 'flex', gap: 'var(--nf-space-6)' }}>
                            <button
                              type="button"
                              className={`${css.button} ${css.buttonSmall} ${isPinned ? '' : css.buttonPrimary}`}
                              onClick={() => { togglePin(candidate.id) }}
                              title={isPinned ? '取消暂留：下次换批会覆盖此槽位' : '暂留此方案：换批时保留，继续对比新方案'}
                            >
                              {isPinned ? '★ 取消暂留' : '☆ 暂留'}
                            </button>
                            <button
                              type="button"
                              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                              onClick={() => { handlePick(candidate) }}
                              title="将这份大纲填入上方大纲框（可继续修改后开书）"
                            >
                              选这个
                            </button>
                          </span>
                        </div>
                        {candidate.sellingPoint !== '' && (
                          <div className={css.meta}><b>卖点：</b>{candidate.sellingPoint}</div>
                        )}
                        <div
                          className={css.meta}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            whiteSpace: 'pre-wrap',
                          }}
                          title={candidate.outline}
                        >
                          {candidate.outline}
                        </div>
                      </div>
                    )
                  })}
                  {pinned.length >= 3 && (
                    <span className={css.meta}>已暂留全部方案——直接挑一个「选这个」即可；换批需先取消某个暂留。</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          style={{ width: '100%', padding: 'var(--nf-space-10) 0', fontSize: 'var(--nf-fs-14)' }}
          disabled={busy || effectiveName === ''}
          onClick={() => { void handleCreate() }}
        >
          ✨ 开书并进入工作台
        </button>
        <span className={css.meta} style={{ textAlign: 'center' }}>
          未提供大纲也能开书，稍后可在大纲页导入
        </span>
      </div>
    </div>
  )
}
