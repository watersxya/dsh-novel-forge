/**
 * 书架首页视图：书卡网格（封面/书名/简介/进度）+ 搜索筛选 + 开书入口。
 * 进入小说工坊默认展示；点击书卡进入该书工作台，＋ 进入开书向导页。
 */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, Library, PenLine, Plus, Search } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import css from './panel.module.css'

/** 相对时间（人性化：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期）。 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/** 一本书的状态标签。 */
function bookStatus(book: BookshelfSnapshot['books'][number]): 'none' | 'done' | 'active' {
  if (!book.hasProject) return 'none'
  return book.total > 0 && book.done >= book.total ? 'done' : 'active'
}

/** 一张书卡（封面懒加载）。 */
function BookCard({
  api,
  book,
  active,
  onOpen,
  onRead,
}: {
  api: NovelApi
  book: BookshelfSnapshot['books'][number]
  active: boolean
  onOpen: () => void
  onRead: () => void
}) {
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    if (!book.hasCover) return
    let cancelled = false
    void api.coverGet(book.outputDir).then(result => {
      if (!cancelled) setCover(result.dataUrl)
    }).catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [api, book.hasCover, book.outputDir])

  const ratio = book.total > 0 ? Math.min(book.done / book.total, 1) : 0
  const status = bookStatus(book)
  const statusLabel = status === 'none' ? '未开书' : status === 'done' ? '已完结' : '进行中'

  return (
    <div
      className={`${css.bookCard} ${active ? css.bookCardActive : ''}`}
      onClick={onOpen}
      title={`打开《${book.bookName}》`}
    >
      <div className={css.bookCardCover}>
        {cover !== null ? (
          <img src={cover} alt={`《${book.bookName}》封面`} />
        ) : (
          <div className={css.bookCardCoverFallback}>
            <span className={css.bookCardCoverTitle}>{book.bookName.slice(0, 4)}</span>
            <span className={css.meta}>暂无封面</span>
          </div>
        )}
      </div>
      <div className={css.bookCardBody}>
        <div className={css.bookCardTitleRow}>
          <span className={css.bookCardName}>{book.bookName}</span>
          <span className={`${css.badge} ${status === 'none' ? css.badgePending : status === 'done' ? css.badgeDone : css.badgeWritten}`}>
            {statusLabel}
          </span>
        </div>
        <span className={`${css.meta} ${css.bookCardBlurb}`} title={book.blurb ?? ''}>
          {book.blurb !== undefined && book.blurb !== '' ? book.blurb : '暂无简介'}
        </span>
        <div className={css.bookCardProgressBar}>
          <div className={css.bookCardProgressFill} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <div className={css.bookCardMetaRow}>
          <span className={css.meta}>{book.total > 0 ? `已完成 ${book.done} / ${book.total} 章` : '尚未规划章节'}</span>
          {book.hasProject && <span className={css.meta} title="最近活动时间">更新于 {relativeTime(book.updatedAt)}</span>}
        </div>
        <div className={css.bookCardActions} onClick={e => { e.stopPropagation() }}>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
            onClick={onOpen}
            title="进入创作工作台（大纲/章节/审稿/设定）"
          >
            <PenLine size={13} style={{ verticalAlign: -2 }} /> 进入工作台
          </button>
          <button
            type="button"
            className={`${css.button} ${css.buttonSmall}`}
            disabled={!book.hasProject || book.done === 0}
            onClick={onRead}
            title={book.hasProject && book.done > 0 ? '沉浸式阅读已写章节' : '尚无已写章节，先去工作台创作'}
          >
            <BookOpen size={13} style={{ verticalAlign: -2 }} /> 阅读
          </button>
        </div>
      </div>
    </div>
  )
}

/** 书架首页。 */
export function ShelfView({
  api,
  shelf,
  onOpenBook,
  onReadBook,
  onAddBook,
  onImportBook,
}: {
  api: NovelApi
  shelf: BookshelfSnapshot
  /** 点击书卡：激活该书并进入工作台。 */
  onOpenBook: (id: string) => void
  /** 点击「阅读」：激活该书并进入沉浸式阅读页。 */
  onReadBook: (id: string) => void
  /** 点击＋：进入开书向导页。 */
  onAddBook: () => void
  /** 点击「导入」：打开导入弹窗（已有项目目录 / txt/md 全本）。 */
  onImportBook: () => void
}) {
  const [query, setQuery] = useState('')
  /** 筛选：all=全部 / active=进行中 / done=已完结 / none=未开书。 */
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'none'>('all')

  const stats = useMemo(() => {
    let active = 0, done = 0, none = 0
    for (const b of shelf.books) {
      const s = bookStatus(b)
      if (s === 'none') none++
      else if (s === 'done') done++
      else active++
    }
    return { active, done, none }
  }, [shelf.books])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shelf.books.filter(b => {
      if (filter !== 'all' && bookStatus(b) !== filter) return false
      if (q === '') return true
      return b.bookName.toLowerCase().includes(q) || (b.blurb ?? '').toLowerCase().includes(q)
    })
  }, [shelf.books, query, filter])

  return (
    <div className={css.shelfView}>
      <div className={css.shelfHero}>
        <div className={css.shelfTitleRow}>
          <h2 className={css.panelTitle} style={{ margin: 0 }}><Library size={20} style={{ verticalAlign: -3 }} /> AI小说工坊 · 书架</h2>
          <input
            className={`${css.input} ${css.shelfSearch}`}
            type="search"
            placeholder="🔍 搜索书名 / 简介…"
            value={query}
            onChange={e => { setQuery(e.target.value) }}
          />
        </div>
        {shelf.books.length > 0 && (
          <div className={css.shelfStats}>
            {[
              { id: 'all' as const, label: '总书数', value: shelf.books.length },
              { id: 'active' as const, label: '进行中', value: stats.active },
              { id: 'done' as const, label: '已完结', value: stats.done },
              { id: 'none' as const, label: '未开书', value: stats.none },
            ].map(s => (
              <div
                key={s.id}
                className={`${css.shelfStat} ${filter === s.id ? css.shelfStatActive : ''}`}
                title={s.id === 'all' ? '显示全部书籍' : `只看「${s.label}」的书（再点一次取消筛选）`}
                onClick={() => { setFilter(prev => prev === s.id ? 'all' : s.id) }}
              >
                <b>{s.value}</b><span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {shelf.books.length === 0 ? (
        /* 空书架引导卡 */
        <div className={css.shelfEmpty}>
          <span className={css.shelfEmptyIcon}><BookOpen size={34} /></span>
          <span className={css.shelfEmptyTitle}>你的创作从这里开始</span>
          <span className={css.meta}>开一本书：粘贴大纲或导入 docx，书名自动识别，开书即建项目</span>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={onAddBook}>
            ＋ 开第一本书
          </button>
          <button type="button" className={`${css.button}`} onClick={onImportBook}>
            📥 导入已有小说
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
          <span className={css.shelfEmptyIcon}><Search size={34} /></span>
          <span className={css.shelfEmptyTitle}>没有符合条件的书</span>
          <span className={css.meta}>换个关键词或筛选条件试试</span>
        </div>
      ) : (
        <div className={css.shelfGrid}>
          {visible.map(book => (
            <BookCard
              key={book.id}
              api={api}
              book={book}
              active={book.id === shelf.activeBookId}
              onOpen={() => { onOpenBook(book.id) }}
              onRead={() => { onReadBook(book.id) }}
            />
          ))}

          {/* 开书入口：进入独立向导页 */}
          <div className={`${css.bookCard} ${css.bookAddCard}`} onClick={onAddBook} role="button" tabIndex={0} aria-label="开一本新书" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAddBook() } }}>
            <div className={css.bookAddIcon}><Plus size={28} /></div>
            <span>开一本新书</span>
            <span className={css.meta}>书名 + 大纲，开书即建项目</span>
          </div>

          {/* 导入入口：已有项目目录 / txt/md 全本 */}
          <div className={`${css.bookCard} ${css.bookAddCard}`} onClick={onImportBook} role="button" tabIndex={0} aria-label="导入已有小说" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onImportBook() } }}>
            <div className={css.bookAddIcon}><Download size={28} /></div>
            <span>导入已有小说</span>
            <span className={css.meta}>项目目录或 txt/md 全本</span>
          </div>
        </div>
      )}
    </div>
  )
}
