/**
 * 首页 AI 进度视图：书架级聚合进度——总览 + 每本书进度条 + 进行中高亮。
 * 读取 BookshelfSnapshot，不依赖打开某本书。
 */
import { useMemo } from 'react'
import { BarChart3, BookOpen, PenLine, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import type { BookshelfSnapshot } from '../../protocol.ts'
import css from './panel.module.css'

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' 小时前'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + ' 天前'
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function bookStatus(book: BookshelfSnapshot['books'][number]): 'none' | 'done' | 'active' {
  if (!book.hasProject) return 'none'
  return book.total > 0 && book.done >= book.total ? 'done' : 'active'
}

export function ProgressHomeView({ shelf, onOpenBook }: {
  shelf: BookshelfSnapshot;
  onOpenBook: (id: string) => void;
}) {
  const stats = useMemo(() => {
    let active = 0, done = 0, none = 0, chapters = 0, written = 0;
    for (const b of shelf.books) {
      const s = bookStatus(b)
      if (s === 'none') none++; else if (s === 'done') done++; else active++;
      chapters += b.total;
      written += b.done;
    }
    return { active, done, none, chapters, written }
  }, [shelf.books]);

  const progressPct = stats.chapters > 0 ? Math.round((stats.written / stats.chapters) * 100) : 0;

  return (
    <div className={css.authorPageBody}>
      <div className={css.authorPageHeader}><h2 className={css.panelTitle} style={{ margin: 0 }}>📊 AI 进度</h2><span className={css.meta}>跨书架聚合进度与最近活动</span></div>

      <div className={css.progressOverview}>
        <div className={css.progressOverviewCard}><span className={css.progressOverviewNum}>{shelf.books.length}</span><span className={css.meta}>总书数</span></div>
        <div className={css.progressOverviewCard}><span className={css.progressOverviewNum}>{stats.active}</span><span className={css.meta}>进行中</span></div>
        <div className={css.progressOverviewCard}><span className={css.progressOverviewNum}>{stats.done}</span><span className={css.meta}>已完结</span></div>
        <div className={css.progressOverviewCard}><span className={css.progressOverviewNum}>{stats.written}/{stats.chapters}</span><span className={css.meta}>已完成章节</span></div>
      </div>

      <div className={css.progressTotalBar}><div className={css.progressTotalFill} style={{ width: progressPct + '%' }} /><span className={css.meta}>全书架整体进度 {progressPct}%</span></div>

      {shelf.books.length === 0 ? (
        <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
          <span className={css.shelfEmptyIcon}><BarChart3 size={30} /></span>
          <span className={css.shelfEmptyTitle}>还没有书</span>
          <span className={css.meta}>去书架开一本书或导入全文后，这里会显示进度。</span>
        </div>
      ) : (
        <div className={css.progressBookList}>
          {shelf.books.map(book => {
            const s = bookStatus(book)
            const ratio = book.total > 0 ? Math.min(book.done / book.total, 1) : 0;
            const statusLabel = s === 'none' ? '未开书' : s === 'done' ? '已完结' : '进行中';
            return (
              <div key={book.id} className={css.progressBook + (s === 'active' ? ' ' + css.progressBookActive : '')}>
                <div className={css.progressBookHead}>
                  <span className={css.progressBookName} title={book.bookName}>{book.bookName}</span>
                  <span className={css.badge + (s === 'done' ? ' ' + css.badgeDone : s === 'active' ? ' ' + css.badgeWritten : ' ' + css.badgePending)}>{statusLabel}</span>
                  {s === 'active' && <span className={css.meta + ' ' + css.progressLive}><RefreshCw size={12} style={{ verticalAlign: -2 }} /> 创作中</span>}
                </div>
                <div className={css.progressBookBar}><div className={css.progressBookFill} style={{ width: Math.round(ratio * 100) + '%' }} /></div>
                <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
                  <span className={css.meta}>{book.total > 0 ? '已完成 ' + book.done + ' / ' + book.total + ' 章' : '尚未规划章节'} · 更新于 {relativeTime(book.updatedAt)}</span>
                  <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => onOpenBook(book.id)}><PenLine size={12} style={{ verticalAlign: -2 }} /> 进入</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
