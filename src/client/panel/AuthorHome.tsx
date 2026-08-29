/**
 * 作者级首页容器：书架页左侧导航 + 内容区。
 * 导航复用工作区 .panelNav 玻璃卡片样式（同款），导航项为作者级：书架/改编/资产库/全局资产库/AI 进度/设置。
 */
import { useState } from 'react'
import { Library, Wand2, Boxes, Brush, BarChart3, Settings, Info } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import { ShelfView } from './ShelfView.tsx'
import { AdaptModeView } from './AdaptModeView.tsx'
import { AuthorAssetsView } from './AuthorAssetsView.tsx'
import { ProgressHomeView } from './ProgressHomeView.tsx'
import { SettingsView } from './SettingsView.tsx'
import css from './panel.module.css'

type AuthorNav = 'shelf' | 'adapt' | 'assets' | 'library' | 'progress' | 'settings';

const NAV_ITEMS: Array<{ id: Exclude<AuthorNav, 'settings'>; label: string; icon: JSX.Element; hint: string }> = [
  { id: 'shelf', label: '书架', icon: <Library size={18} />, hint: '我的书' },
  { id: 'adapt', label: '改编模式', icon: <Wand2 size={18} />, hint: '上传全文→可改范围' },
  { id: 'assets', label: '作者资产库', icon: <Boxes size={18} />, hint: '跨书总数据' },
  { id: 'library', label: '全局写作资产库', icon: <Brush size={18} />, hint: '内置题材/规则/模板' },
  { id: 'progress', label: 'AI 进度', icon: <BarChart3 size={18} />, hint: '书架级聚合进度' },
];

function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className={css.authorPageBody}>
      <div className={css.authorPageHeader}><h2 className={css.panelTitle} style={{ margin: 0 }}>{title}</h2><span className={css.meta}>{hint}</span></div>
      <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
        <span className={css.shelfEmptyIcon}><Info size={30} /></span>
        <span className={css.shelfEmptyTitle}>此入口为占位</span>
        <span className={css.meta}>后续版本实现。当前「全局写作资产库」可进入某本书「创作资产」页查看内置题材库/反AI规则库/风格模板；「设置」为独立设置页。</span>
      </div>
    </div>
  );
}

export function AuthorHome({ api, shelf, onOpenBook, onReadBook, onAddBook, onImportBook, onOpenSettings, onTheme, onBackground, onOpacity, adaptEnabled }: {
  api: NovelApi; shelf: BookshelfSnapshot;
  onOpenBook: (id: string) => void; onReadBook: (id: string) => void; onAddBook: () => void; onImportBook: () => void;
  /** 兼容旧入口：首页设置现为独立设置页，此回调保留但不再使用。 */
  onOpenSettings?: () => void;
  /** 主题/模式/密度变化回调（供面板根容器实时生效）。 */
  onTheme?: (theme: 'liquid' | 'neumorph' | 'macos' | 'clay', mode: 'system' | 'light' | 'dark', density: 'comfort' | 'compact' | 'spacious') => void;
  /** 自定义背景变化回调。 */
  onBackground?: (bg: string | undefined, blur: number) => void;
  /** 玻璃透明度变化回调。 */
  onOpacity?: (n: number) => void;
  /** 是否启用改编模式（默认 false=隐藏入口）。 */
  adaptEnabled?: boolean;
}) {
  const [nav, setNav] = useState<AuthorNav>('shelf');

  return (
    <div className={css.authorHome}>
      <nav className={css.panelNav} aria-label="作者级导航">
        <div className={css.navTitle}>
          <div className={css.navTitleLogo}>书</div>
          <div style={{ minWidth: 0 }}>
            <div className={css.navTitleName}>小说工坊</div>
            <div className={css.navTitleBook}>作者级 · 跨书</div>
          </div>
        </div>
        <div className={css.navGroup}>
          <div className={css.navGroupLabel}>作者</div>
          {NAV_ITEMS.filter(item => item.id !== 'adapt' || adaptEnabled).map(item => (
            <button key={item.id} type="button" role="tab" aria-selected={nav === item.id} data-active={nav === item.id ? '' : undefined} className={css.navTab} title={item.hint} onClick={() => setNav(item.id)}>
              <span className={css.navTabIcon}>{item.icon}</span>
              <span className={css.navTabLabel}>{item.label}</span>
            </button>
          ))}
        </div>
        <div className={css.navSpacer} />
        <button type="button" role="tab" aria-selected={nav === 'settings'} data-active={nav === 'settings' ? '' : undefined} className={css.navTab} title="设置" onClick={() => setNav('settings')}>
          <span className={css.navTabIcon}><Settings size={18} /></span>
          <span className={css.navTabLabel}>设置</span>
        </button>
        <div className={css.navAbout}>
          <div className={css.navAboutRow}><span>ℹ️ v1.7.3 · 改编/资产库</span></div>
        </div>
      </nav>
      <div className={css.authorContent}>
        {nav === 'shelf' && <ShelfView api={api} shelf={shelf} onOpenBook={onOpenBook} onReadBook={onReadBook} onAddBook={onAddBook} onImportBook={onImportBook} />}
        {nav === 'adapt' && <AdaptModeView api={api} />}
        {nav === 'assets' && <AuthorAssetsView api={api} />}
        {nav === 'library' && <Placeholder title="🎨 全局写作资产库" hint="内置题材基底库 / 反AI规则库 / 风格模板 / 推进模式（跨书）" />}
        {nav === 'progress' && <ProgressHomeView shelf={shelf} onOpenBook={onOpenBook} />}
        {nav === 'settings' && <SettingsView api={api} onTheme={onTheme} onBackground={onBackground} onOpacity={onOpacity} />}
      </div>
    </div>
  );
}
