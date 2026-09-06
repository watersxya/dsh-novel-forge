/**
 * 阅读页：沉浸式章节阅读（纯只读，零 LLM 消耗）。
 * 布局：顶部工具栏 + 左侧可折叠目录栏（按卷分组）+ 阅读区。
 * 轻量渲染：去掉 md 首行标题，按行分段；字号/主题/阅读进度 localStorage 记忆。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ProjectState, ChapterPlan } from '../../protocol.ts'
import css from './panel.module.css'

const FONT_SIZES = [
  { id: 'sm', px: 15, label: 'A-' },
  { id: 'md', px: 17, label: 'A' },
  { id: 'lg', px: 20, label: 'A+' },
] as const

const THEMES = [
  { id: 'paper', label: '📄 纸白', bg: '#f7f1e3', fg: '#3b3226', accent: '#8b6f47', dim: '#8a7d66' },
  { id: 'eye', label: '🌿 护眼', bg: '#e8f0e3', fg: '#2f3d2e', accent: '#5f7d5a', dim: '#6f836b' },
  { id: 'night', label: '🌙 夜间', bg: '#1d2226', fg: '#c9d1d9', accent: '#8aa5c0', dim: '#6d7882' },
] as const

type FontId = typeof FONT_SIZES[number]['id']
type ThemeId = typeof THEMES[number]['id']

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return fallback
}

function writePref(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

/** 章节状态小标（阅读视角）。 */
function statusBadge(ch: ChapterPlan): { label: string; cls: string } {
  switch (ch.status) {
    case 'approved': return { label: '✅', cls: css.badgeDone }
    case 'written': return { label: '📝', cls: css.badgeWritten }
    case 'rejected': return { label: '⚠️', cls: css.badgePending }
    default: return { label: '', cls: css.badgePending }
  }
}

/** 目录分组：按卷区间过滤可读章节；卷外章节归入「未分卷」。 */
function buildGroups(project: ProjectState, readable: ChapterPlan[]): Array<{ title: string; no: number; chapters: ChapterPlan[] }> {
  const vols = project.volumes ?? []
  if (vols.length === 0) return [{ title: '全部章节', no: 0, chapters: readable }]
  const groups: Array<{ title: string; no: number; chapters: ChapterPlan[] }> = []
  for (const v of vols) {
    const inVol = readable.filter(c => c.no >= v.chapterStart && c.no <= v.chapterEnd)
    if (inVol.length > 0) groups.push({ title: `第${v.no}卷 ${v.title}`, no: v.no, chapters: inVol })
  }
  const rest = readable.filter(c => !vols.some(v => c.no >= v.chapterStart && c.no <= v.chapterEnd))
  if (rest.length > 0) groups.push({ title: '未分卷', no: 0, chapters: rest })
  return groups
}

export function ReaderView({
  api,
  project,
  onBack,
  onOpenWorkspace,
}: {
  api: NovelApi
  project: ProjectState
  onBack: () => void
  onOpenWorkspace: () => void
}) {
  const prefKey = useMemo(() => {
    const id = project.bookName || 'book'
    return `dsh-novel-forge.reader.${id}`
  }, [project.bookName])

  /** 可读章节（有正文落盘）：approved / written / rejected。 */
  const readable = useMemo(() => project.chapters.filter(c =>
    c.status === 'approved' || c.status === 'written' || c.status === 'rejected',
  ), [project.chapters])

  const groups = useMemo(() => buildGroups(project, readable), [project, readable])

  const [currentNo, setCurrentNo] = useState<number>(() => {
    const saved = readPref<number | null>(`${prefKey}.no`, null)
    if (saved !== null && readable.some(c => c.no === saved)) return saved
    // 无记忆 → 最后一章已通过
    const lastApproved = [...readable].reverse().find(c => c.status === 'approved')
    return lastApproved?.no ?? readable[0]?.no ?? 0
  })
  const [markdown, setMarkdown] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>('')
  const [font, setFont] = useState<FontId>(() => readPref(`${prefKey}.font`, 'md'))
  const [theme, setTheme] = useState<ThemeId>(() => readPref(`${prefKey}.theme`, 'paper'))
  const [navOpen, setNavOpen] = useState<boolean>(() => readPref(`${prefKey}.nav`, true))
  /** 折叠的卷号（点击卷标题切换；记忆在 localStorage）。 */
  const [collapsedVols, setCollapsedVols] = useState<number[]>(() => readPref(`${prefKey}.collapsed`, []))
  const sidebarRef = useRef<HTMLDivElement>(null)

  const toggleVol = useCallback((no: number) => {
    setCollapsedVols(prev => {
      const next = prev.includes(no) ? prev.filter(v => v !== no) : [...prev, no]
      writePref(`${prefKey}.collapsed`, next)
      return next
    })
  }, [prefKey])

  const current = useMemo(() => project.chapters.find(c => c.no === currentNo), [project.chapters, currentNo])
  const idx = readable.findIndex(c => c.no === currentNo)
  const prevCh = idx > 0 ? readable[idx - 1] : undefined
  const nextCh = idx >= 0 && idx < readable.length - 1 ? readable[idx + 1] : undefined

  const load = useCallback(async (no: number) => {
    if (no === 0) return
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.chapter(no)
      setMarkdown(res.markdown)
      setCurrentNo(no)
      writePref(`${prefKey}.no`, no)
    } catch (err) {
      setLoadError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [api, prefKey])

  // 初始加载
  const initialNo = useRef<number>(0)
  useEffect(() => {
    if (initialNo.current === currentNo && markdown !== '') return
    if (currentNo === 0) return
    initialNo.current = currentNo
    void load(currentNo)
  }, [currentNo, load, markdown])

  // 键盘翻章
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && prevCh !== undefined) void load(prevCh.no)
      if (e.key === 'ArrowRight' && nextCh !== undefined) void load(nextCh.no)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevCh, nextCh, load])

  // 当前章滚动到可见（目录栏内）
  useEffect(() => {
    sidebarRef.current?.querySelector<HTMLElement>(`[data-no="${currentNo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentNo])

  const themeMeta = THEMES.find(t => t.id === theme) ?? THEMES[0]
  const fontMeta = FONT_SIZES.find(f => f.id === font) ?? FONT_SIZES[1]

  /** 轻量渲染：去标题行、按行分段（网文每行一段）。 */
  const paragraphs = useMemo(() => {
    return markdown
      .split(/\r?\n/)
      .map(l => l.replace(/^#{1,6}\s*/, '').trim())
      .filter(Boolean)
  }, [markdown])

  const itemBg = theme === 'night' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)'

  return (
    <div className={css.readerView} style={{ background: themeMeta.bg, color: themeMeta.fg }}>
      {/* 顶部栏 */}
      <div className={css.readerHeader} style={{ borderColor: themeMeta.dim }}>
        <button type="button" className={css.iconButton} title="返回书架" aria-label="返回书架" onClick={onBack}>←</button>
        <span className={css.readerTitle}>📖 《{project.bookName}》</span>
        <span className={css.meta} style={{ color: themeMeta.dim }}>
          {readable.length > 0 && currentNo > 0 ? `第 ${currentNo} 章 · ${idx + 1}/${readable.length}` : ''}
        </span>
        <button
          type="button"
          className={`${css.button} ${css.buttonSmall} ${navOpen ? css.buttonPrimary : ''}`}
          style={{ marginLeft: 'var(--nf-space-4)' }}
          onClick={() => { setNavOpen(v => { const next = !v; writePref(`${prefKey}.nav`, next); return next }) }}
          title={navOpen ? '收起目录' : '展开目录'}
        >
          ☰ 目录
        </button>
        <div style={{ flex: 1 }} />
        <span className={css.meta} style={{ color: themeMeta.dim }}>字号</span>
        <div className={css.readerSeg}>
          {FONT_SIZES.map(f => (
            <button
              key={f.id}
              type="button"
              className={`${css.readerSegBtn} ${font === f.id ? css.readerSegActive : ''}`}
              style={font === f.id ? { background: themeMeta.accent, color: themeMeta.bg } : undefined}
              onClick={() => { setFont(f.id); writePref(`${prefKey}.font`, f.id) }}
              title={`字号 ${f.label}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={css.readerSeg} style={{ marginLeft: 'var(--nf-space-8)' }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`${css.readerSegBtn} ${theme === t.id ? css.readerSegActive : ''}`}
              style={theme === t.id ? { background: themeMeta.accent, color: themeMeta.bg } : undefined}
              onClick={() => { setTheme(t.id); writePref(`${prefKey}.theme`, t.id) }}
              title={t.label}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ marginLeft: 'var(--nf-space-10)' }} onClick={onOpenWorkspace} title="回到创作工作台">
          ✏️ 去工作台
        </button>
      </div>

      {/* 主体：左目录 + 右阅读区 */}
      <div className={css.readerBody}>
        {navOpen && (
          <aside className={css.readerSidebar} style={{ borderColor: themeMeta.dim, background: theme === 'night' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)' }} ref={sidebarRef}>
            {groups.length === 0 ? (
              <div className={css.meta} style={{ color: themeMeta.dim, padding: 'var(--nf-space-12)' }}>还没有已写章节，先去工作台创作吧</div>
            ) : groups.map(g => {
              const collapsed = collapsedVols.includes(g.no)
              return (
                <div key={g.no} className={css.readerGroup}>
                  <button
                    type="button"
                    className={css.readerGroupTitle}
                    style={{ color: themeMeta.accent }}
                    onClick={() => { toggleVol(g.no) }}
                    title={collapsed ? `展开${g.title}` : `收起${g.title}`}
                  >
                    <span className={css.readerGroupArrow}>{collapsed ? '▸' : '▾'}</span>
                    <span>{g.title}</span>
                    <span className={css.readerGroupCount}>{g.chapters.length}</span>
                  </button>
                  {!collapsed && g.chapters.map(ch => {
                    const badge = statusBadge(ch)
                    const active = ch.no === currentNo
                    return (
                      <button
                        key={ch.no}
                        type="button"
                        data-no={ch.no}
                        className={`${css.readerItem} ${active ? css.readerItemActive : ''}`}
                        style={active ? { background: themeMeta.accent, color: themeMeta.bg, borderColor: themeMeta.accent } : { borderColor: 'transparent', color: themeMeta.fg }}
                        onClick={() => { void load(ch.no) }}
                        title={`第${ch.no}章 ${ch.title}`}
                      >
                        <span className={css.readerItemNo}>{ch.no}</span>
                        <span className={css.readerItemTitle}>{ch.title}</span>
                        {badge.label !== '' && <span className={css.readerItemBadge}>{badge.label}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </aside>
        )}

        {/* 阅读区 */}
        <div className={css.readerMain} style={{ background: itemBg }}>
          {loadError !== '' ? (
            <div className={css.readerError}>{loadError}</div>
          ) : loading && markdown === '' ? (
            <div className={css.readerLoading}>⏳ 加载中…</div>
          ) : current !== undefined && currentNo > 0 ? (
            <article className={css.readerArticle} style={{ maxWidth: 720 }}>
              <h1 className={css.readerChapterTitle} style={{ color: themeMeta.accent }}>{current.title}</h1>
              <div className={css.readerChapterMeta} style={{ color: themeMeta.dim }}>
                <span>{statusBadge(current).label}</span>
                <span>第 {current.no} 章</span>
                {current.chars !== undefined && <span> · {current.chars.toLocaleString()} 字</span>}
              </div>
              <div className={css.readerText} style={{ fontSize: fontMeta.px, lineHeight: 1.9 }}>
                {paragraphs.map((p, i) => <p key={i} className={css.readerPara}>{p}</p>)}
              </div>
              <div className={css.readerFoot}>
                {prevCh !== undefined && (
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ borderColor: themeMeta.dim, color: themeMeta.fg }} onClick={() => { void load(prevCh.no) }} title="← 上一章">
                    ← 第{prevCh.no}章
                  </button>
                )}
                <span className={css.meta} style={{ color: themeMeta.dim }}>← → 键盘翻章</span>
                {nextCh !== undefined && (
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ borderColor: themeMeta.accent, color: themeMeta.accent }} onClick={() => { void load(nextCh.no) }} title="下一章 →">
                    第{nextCh.no}章 →
                  </button>
                )}
              </div>
            </article>
          ) : (
            <div className={css.readerLoading}>暂无内容</div>
          )}
        </div>
      </div>
    </div>
  )
}
