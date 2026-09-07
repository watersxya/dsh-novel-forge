/**
 * 书架首页视图：书卡网格（封面/书名/简介/进度）+ 搜索筛选 + 开书入口。
 * 进入小说工坊默认展示；点击书卡进入该书工作台，＋ 进入开书向导页。
 */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, PenLine, Plus, Search, Wand2 } from 'lucide-react'
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
  onOpenAdapt,
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
  /** 点击「改编模式」：进入改编六步向导（入口收在书架页头，与导入并排）。 */
  onOpenAdapt?: () => void
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

  const activeName = shelf.books.find(b => b.id === shelf.activeBookId)?.bookName ?? ''

  return (
    <div className={css.subPage}>
      <div className={css.subPageHead}>
        <span className={css.subPageTitle}>书架</span>
        <span className={css.subPageMeta}>
          {shelf.books.length} 本书{activeName !== '' ? ` · 当前书《${activeName}》` : ''}
        </span>
        <div className={css.subPageActions}>
          {onOpenAdapt !== undefined && (
            <button type="button" className={css.button} onClick={onOpenAdapt} title="导入全文 → 六步改编成新书">
              <Wand2 size={13} style={{ verticalAlign: -2 }} /> 改编模式
            </button>
          )}
          <button type="button" className={css.button} onClick={onImportBook} title="导入已有项目目录或 txt / md 全本">
            <Download size={13} style={{ verticalAlign: -2 }} /> 导入已有小说
          </button>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={onAddBook} title="书名 + 大纲，开书即建项目">
            <Plus size={13} style={{ verticalAlign: -2 }} /> 开一本新书
          </button>
        </div>
      </div>
      <div className={css.subPageBody}>
      <div className={css.shelfToolbar}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--nf-text-3)', pointerEvents: 'none' }} />
          <input
            className={`${css.input} ${css.shelfSearch}`}
            type="search"
            placeholder="搜索书名 / 简介…"
            value={query}
            onChange={e => { setQuery(e.target.value) }}
            style={{ paddingLeft: 'var(--nf-space-30, 30px)' }}
          />
        </div>
        <div className={css.shelfTabs}>
          {[
            { id: 'all' as const, label: '全部' },
            { id: 'active' as const, label: '进行中' },
            { id: 'done' as const, label: '已完结' },
            { id: 'none' as const, label: '未开书' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={css.shelfTab}
              data-active={filter === t.id ? '' : undefined}
              onClick={() => { setFilter(t.id) }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {shelf.books.length > 0 && (
        <div className={css.shelfStatGrid}>
          {[
            { id: 'all' as const, label: '总书数', value: shelf.books.length },
            { id: 'active' as const, label: '进行中', value: stats.active },
            { id: 'done' as const, label: '已完结', value: stats.done },
            { id: 'none' as const, label: '未开书', value: stats.none },
          ].map(s => (
            <div
              key={s.id}
              className={css.shelfStatCard}
              title={s.id === 'all' ? '显示全部书籍' : `只看「${s.label}」的书`}
              onClick={() => { setFilter(s.id) }}
            >
              <span>{s.label}</span>
              <b className={`${css.numSerif} ${css.tabular}`}>{s.value}</b>
            </div>
          ))}
        </div>
      )}

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
             导入已有小说
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
        </div>
      )}
      </div>
    </div>
  )
}
