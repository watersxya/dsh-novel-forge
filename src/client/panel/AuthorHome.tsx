/**
 * 作者级首页容器：书架页左侧导航 + 内容区。
 * 导航复用工作区 .panelNav 玻璃卡片样式（同款），导航项为作者级：书架/改编/资产库/全局资产库/AI 进度/设置。
 */
import { useState, useRef, useEffect } from 'react'
import { Library, Wand2, Boxes, Brush, Radar, FileSearch, Lightbulb, Settings } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import { ShelfView } from './ShelfView.tsx'
import { AdaptModeView } from './AdaptModeView.tsx'
import { AuthorAssetsView } from './AuthorAssetsView.tsx'
import { GlobalAssetLibraryView } from './GlobalAssetLibraryView.tsx'
import { ProgressConsole, type ProgressLine } from './ProgressConsole.tsx'
import { SettingsView } from './SettingsView.tsx'
import LiveFeedLog from './LiveFeedLog.tsx'
import MarketRadarView from './MarketRadarView.tsx'
import BookAnalysisView from './BookAnalysisView.tsx'
import IdeaInspirationView from './IdeaInspirationView.tsx'
import css from './panel.module.css'

/** 构建时注入的插件版本（tsdown define 替换为字符串字面量）。 */
declare const __NOVEL_FORGE_VERSION__: string | undefined
const PLUGIN_VERSION: string = typeof __NOVEL_FORGE_VERSION__ !== 'undefined' ? __NOVEL_FORGE_VERSION__ : '0.0.0'
/** GitHub 仓库地址（关于区块点击跳转）。 */
const REPO_URL = 'https://github.com/watersxya/dsh-novel-forge'

type AuthorNav = 'shelf' | 'adapt' | 'assets' | 'library' | 'marketRadar' | 'bookAnalysis' | 'ideaInspiration' | 'settings';
type AuthorSubNav = Exclude<AuthorNav, 'settings'>;

/** 顶层 tab（横向，墨案：创作 / 灵感策划 / 资产 / 设置）+ 组内二级页。 */
const NAV_TABS: Array<{
  id: 'shelf' | 'marketRadar' | 'assets';
  label: string;
  icon: JSX.Element;
  hint: string;
  /** 组内二级页（首项即该 tab 的默认页）。 */
  children: Array<{ id: AuthorSubNav; label: string; icon: JSX.Element }>;
}> = [
  {
    id: 'shelf', label: '创作', icon: <Library size={18} />, hint: '我的书 · 改编模式 · 库存',
    /* 改编模式入口移到书架页头（与「导入已有小说」并排），此处只留书架一个子页。 */
    children: [
      { id: 'shelf', label: '我的书', icon: <Library size={14} /> },
    ],
  },
  {
    id: 'marketRadar', label: '灵感策划', icon: <Radar size={18} />, hint: '题材雷达 · 创意灵感 · 书分析',
    children: [
      { id: 'marketRadar', label: '题材雷达', icon: <Radar size={14} /> },
      { id: 'ideaInspiration', label: '创意灵感', icon: <Lightbulb size={14} /> },
      { id: 'bookAnalysis', label: '书分析', icon: <FileSearch size={14} /> },
    ],
  },
  {
    id: 'assets', label: '资产', icon: <Boxes size={18} />, hint: '作者资产库 · 全局资产库',
    children: [
      { id: 'assets', label: '作者资产库', icon: <Brush size={14} /> },
      { id: 'library', label: '全局资产库', icon: <Boxes size={14} /> },
    ],
  },
];


export function AuthorHome({ api, shelf, onOpenBook, onReadBook, onAddBook, onImportBook, onOpenSettings, onBackground, adaptEnabled, progress, busy, busyLabel, liveBar, onClearProgress, onUseIdea, themeMode, themeDensity, onToggleMode, onChangeThemeMode, onChangeThemeDensity }: {
  /** 当前显示模式（顶栏「墨纸 / 纸白」切换用）。 */
  themeMode?: 'system' | 'light' | 'dark';
  /** 当前界面密度。 */
  themeDensity?: 'comfort' | 'compact' | 'spacious';
  /** 切换墨纸 / 纸白（由 NovelPanel 落 localStorage）。 */
  onToggleMode?: () => void;
  /** 改变全局显示模式（联动整个面板）。 */
  onChangeThemeMode: (m: 'system' | 'light' | 'dark') => void;
  /** 改变全局界面密度（联动整个面板）。 */
  onChangeThemeDensity: (d: 'comfort' | 'compact' | 'spacious') => void;
  api: NovelApi; shelf: BookshelfSnapshot;
  onOpenBook: (id: string) => void; onReadBook: (id: string) => void; onAddBook: () => void; onImportBook: () => void;
  /** 创意灵感 → 采纳某个灵感带入开书向导。 */
  onUseIdea?: (idea: import('../../protocol.ts').IdeaInspirationResult['ideas'][number]) => void;
  /** 兼容旧入口：首页设置现为独立设置页，此回调保留但不再使用。 */
  onOpenSettings?: () => void;
  /** 自定义背景变化回调。 */
  onBackground?: (bg: string | undefined, blur: number) => void;
  /** 是否启用改编模式（默认 false=隐藏入口）。 */
  adaptEnabled?: boolean;
  /** AI 进度实时状态（与书内共享同一份）。 */
  progress?: ProgressLine[];
  busy?: boolean;
  busyLabel?: string;
  liveBar?: { text: string; ratio?: number } | null;
  onClearProgress?: () => void;
}) {
  const [nav, setNav] = useState<AuthorNav>('shelf');
  /** 当前是否深色（墨纸）：显式 dark，或跟随系统且系统为深色。 */
  const darkNow = themeMode === 'dark'
    || (themeMode !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [updating, setUpdating] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressPos, setProgressPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.home.progress.float')
      if (raw !== null) { const p = JSON.parse(raw) as { x?: unknown; y?: unknown }; return { x: typeof p.x === 'number' ? p.x : 60, y: typeof p.y === 'number' ? p.y : 120 } }
    } catch { /* ignore */ }
    return { x: 60, y: 120 }
  });
  const [progressSize, setProgressSize] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.home.progress.size')
      if (raw !== null) { const p = JSON.parse(raw) as { w?: unknown; h?: unknown }; return { w: typeof p.w === 'number' ? p.w : 460, h: typeof p.h === 'number' ? p.h : 420 } }
    } catch { /* ignore */ }
    return { w: 460, h: 420 }
  });
  const dragState = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('dsh-novel-forge.home.progress.float', JSON.stringify(progressPos))
      window.localStorage.setItem('dsh-novel-forge.home.progress.size', JSON.stringify(progressSize))
    } catch { /* ignore */ }
  }, [progressPos, progressSize]);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const s = dragState.current
      if (s === null) return
      if (s.type === 'move') {
        setProgressPos({ x: Math.max(-340, Math.min(s.origX + e.clientX - s.startX, 3000)), y: Math.max(0, Math.min(s.origY + e.clientY - s.startY, 3000)) })
      } else {
        setProgressSize({ w: Math.max(320, Math.min(s.origW + e.clientX - s.startX, 1400)), h: Math.max(220, Math.min(s.origH + e.clientY - s.startY, 1200)) })
      }
    }
    const onUp = (): void => { dragState.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, []);

  /** npm 最新版本（更新检测；null = 未检测/检测失败）。 */
  const [npmLatest, setNpmLatest] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('https://registry.npmjs.org/@waterwx%2Fdsh-novel-forge/latest')
        if (!r.ok) return
        const data = (await r.json()) as { version?: unknown }
        if (!cancelled && typeof data.version === 'string') setNpmLatest(data.version)
      } catch { /* best-effort */ }
    })()
    return () => { cancelled = true }
  }, [])

  const doUpdate = async (): Promise<void> => {
    setUpdating(true)
    try {
      const res = await api.pluginUpdate()
      window.alert(res.message)
    } catch (err) {
      window.alert('更新失败：' + ((err as Error).message ?? String(err)))
    } finally {
      setUpdating(false)
    }
  };

  return (
    <div className={css.authorHome}>
      <nav className={css.authorTopNav} aria-label="作者级导航">
        <div className={css.navTitle}>
          <div className={css.navTitleLogo}>书</div>
          <div style={{ minWidth: 0 }}>
            <div className={css.navTitleName}>小说工坊</div>
            <div className={css.navTitleBook}>作者级 · 跨书</div>
          </div>
        </div>
        {/* 顶行右侧：4 个组入口（创作 / 灵感·策划 / 资产 / 设置），点击进该组第一页 */}
        <div className={css.navSpacer} />
        <div className={css.authorTopTabs}>
          {NAV_TABS.map(tab => {
            const inGroup = tab.children.some(c => c.id === nav)
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inGroup}
                data-active={inGroup ? '' : undefined}
                className={css.authorNavBtn}
                title={tab.hint}
                onClick={() => { const first = tab.children[0]; if (first !== undefined) setNav(first.id) }}
              >
                {tab.label}
              </button>
            )
          })}
          <button
            type="button"
            role="tab"
            aria-selected={nav === 'settings'}
            data-active={nav === 'settings' ? '' : undefined}
            className={css.authorNavBtn}
            title="设置"
            onClick={() => { setNav('settings') }}
          >
            设置
          </button>
        </div>
        <div className={css.navAbout}>
          <button type="button" className={css.navAboutRow} title="打开 GitHub 仓库" onClick={() => { window.open(REPO_URL, '_blank', 'noopener') }}>
            <span>ℹ v{PLUGIN_VERSION}</span>
            <span className={css.meta}>GitHub ↗</span>
          </button>
          {npmLatest !== null && npmLatest !== PLUGIN_VERSION && (
            <button type="button" className={css.navAboutUpdate} title="点击自动更新（下载最新 npm 版，完成后请重启 DSH）" disabled={updating} onClick={() => { void doUpdate() }}>
              {updating ? ' 更新中…' : ` 更新到 v${npmLatest}`}
            </button>
          )}
        </div>
        {/* 墨纸 / 纸白 切换（对齐 design-sample-workbench.html 的 #modeToggle） */}
        <button
          type="button"
          className={`${css.button} ${css.buttonSmall}`}
          title={darkNow ? '切换到纸白（浅色）' : '切换到墨纸（深色）'}
          onClick={() => { onToggleMode?.() }}
        >
          {darkNow ? '☀ 纸白' : '☾ 墨纸'}
        </button>
      </nav>
      {/* 第二行：当前组的子页按钮（仅在该组有多个子页时出现，对齐 demo 的 .group-nav） */}
      {(() => {
        const activeTab = NAV_TABS.find(t => t.children.some(c => c.id === nav))
        if (activeTab === undefined || activeTab.children.length <= 1) return null
        return (
          <nav className={css.authorNav} aria-label={`${activeTab.label}下的子页面`}>
            {activeTab.children.map(c => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={nav === c.id}
                data-active={nav === c.id ? '' : undefined}
                className={css.authorNavBtn}
                onClick={() => { setNav(c.id) }}
              >
                {c.label}
              </button>
            ))}
          </nav>
        )
      })()}
      <div className={css.authorContent}>
        {nav === 'shelf' && <ShelfView api={api} shelf={shelf} onOpenBook={onOpenBook} onReadBook={onReadBook} onAddBook={onAddBook} onImportBook={onImportBook} onOpenAdapt={() => { setNav('adapt') }} />}
        {nav === 'adapt' && <AdaptModeView api={api} onOpenBook={onOpenBook} />}
        {nav === 'assets' && <AuthorAssetsView api={api} />}
        {nav === 'library' && <GlobalAssetLibraryView api={api} />}
        {nav === 'marketRadar' && <MarketRadarView api={api} bookId={shelf?.activeBookId ?? undefined} />}
        {nav === 'ideaInspiration' && <IdeaInspirationView api={api} onUseIdea={onUseIdea} />}
        {nav === 'bookAnalysis' && <BookAnalysisView api={api} />}
        {nav === 'settings' && <SettingsView api={api} onBackground={onBackground} themeMode={themeMode ?? 'system'} themeDensity={themeDensity ?? 'comfort'} onChangeThemeMode={onChangeThemeMode} onChangeThemeDensity={onChangeThemeDensity} />}
      </div>
      {progressOpen && (
        <div className={css.assistantFloat} style={{ left: progressPos.x, top: progressPos.y, width: progressSize.w, height: progressSize.h }}>
          <div
            className={css.assistantFloatHeader}
            onMouseDown={e => {
              e.preventDefault()
              dragState.current = { type: 'move', startX: e.clientX, startY: e.clientY, origX: progressPos.x, origY: progressPos.y, origW: progressSize.w, origH: progressSize.h }
            }}
          >
            <span>
               AI 进度
              {busy && <span style={{ color: 'var(--nf-accent)' }}>  任务进行中</span>}
              <span className={css.meta}>（拖动标题栏移动 · 右下角拉大小）</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-4)' }}>
              {(progress ?? []).length > 0 && <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClearProgress} title="清空活动记录">清空</button>}
              <button type="button" className={css.iconButton} title="关闭" aria-label="关闭AI进度" onClick={() => setProgressOpen(false)}>×</button>
            </span>
          </div>
          <div className={css.assistantFloatBody} style={{ padding: 'var(--nf-space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', overflow: 'hidden', flex: 1, minHeight: 0 }}>
            <div style={{ flex: '0 2 auto', minHeight: 0, maxHeight: '42%', display: 'flex', flexDirection: 'column' }}>
              <ProgressConsole progress={progress ?? []} busy={busy ?? false} busyLabel={busyLabel ?? ''} liveBar={liveBar ?? null} onClear={() => onClearProgress?.()} />
            </div>
            <LiveFeedLog />
          </div>
          <div
            style={{ width: 14, height: 14, position: 'absolute', right: 0, bottom: 0, cursor: 'nwse-resize' }}
            onMouseDown={e => {
              e.preventDefault()
              dragState.current = { type: 'resize', startX: e.clientX, startY: e.clientY, origX: progressPos.x, origY: progressPos.y, origW: progressSize.w, origH: progressSize.h }
            }}
          />
        </div>
      )}
    </div>
  );
}
