/**
 * 作者级首页容器：书架页左侧导航 + 内容区。
 * 导航复用工作区 .panelNav 玻璃卡片样式（同款），导航项为作者级：书架/改编/资产库/全局资产库/AI 进度/设置。
 */
import { useState, useRef, useEffect } from 'react'
import { Library, Wand2, Boxes, Brush, BarChart3, Settings } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import { ShelfView } from './ShelfView.tsx'
import { AdaptModeView } from './AdaptModeView.tsx'
import { AuthorAssetsView } from './AuthorAssetsView.tsx'
import { GlobalAssetLibraryView } from './GlobalAssetLibraryView.tsx'
import { ProgressConsole, type ProgressLine } from './ProgressConsole.tsx'
import { SettingsView } from './SettingsView.tsx'
import css from './panel.module.css'

/** 构建时注入的插件版本（tsdown define 替换为字符串字面量）。 */
declare const __NOVEL_FORGE_VERSION__: string | undefined
const PLUGIN_VERSION: string = typeof __NOVEL_FORGE_VERSION__ !== 'undefined' ? __NOVEL_FORGE_VERSION__ : '0.0.0'
/** GitHub 仓库地址（关于区块点击跳转）。 */
const REPO_URL = 'https://github.com/watersxya/dsh-novel-forge'

type AuthorNav = 'shelf' | 'adapt' | 'assets' | 'library' | 'progress' | 'settings';

const NAV_ITEMS: Array<{ id: Exclude<AuthorNav, 'settings'>; label: string; icon: JSX.Element; hint: string }> = [
  { id: 'shelf', label: '书架', icon: <Library size={18} />, hint: '我的书' },
  { id: 'adapt', label: '改编模式', icon: <Wand2 size={18} />, hint: '上传全文→可改范围' },
  { id: 'assets', label: '作者资产库', icon: <Boxes size={18} />, hint: '跨书总数据' },
  { id: 'library', label: '全局写作资产库', icon: <Brush size={18} />, hint: '内置题材/规则/模板' },
  { id: 'progress', label: 'AI 进度', icon: <BarChart3 size={18} />, hint: '书架级聚合进度' },
];


export function AuthorHome({ api, shelf, onOpenBook, onReadBook, onAddBook, onImportBook, onOpenSettings, onTheme, onBackground, onOpacity, onEndfieldAccent, adaptEnabled, progress, busy, busyLabel, liveBar, onClearProgress }: {
  api: NovelApi; shelf: BookshelfSnapshot;
  onOpenBook: (id: string) => void; onReadBook: (id: string) => void; onAddBook: () => void; onImportBook: () => void;
  /** 兼容旧入口：首页设置现为独立设置页，此回调保留但不再使用。 */
  onOpenSettings?: () => void;
  /** 主题/模式/密度变化回调（供面板根容器实时生效）。 */
  onTheme?: (theme: 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield', mode: 'system' | 'light' | 'dark', density: 'comfort' | 'compact' | 'spacious') => void;
  /** 自定义背景变化回调。 */
  onBackground?: (bg: string | undefined, blur: number) => void;
  /** 玻璃透明度变化回调。 */
  onOpacity?: (n: number) => void;
  /** 终末地强调色变化回调。 */
  onEndfieldAccent?: (accent: 'valley' | 'wuling') => void;
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
            <button key={item.id} type="button" role="tab" aria-selected={nav === item.id} data-active={nav === item.id ? '' : undefined} className={css.navTab} title={item.hint} onClick={() => { if (item.id === 'progress') { setProgressOpen(o => !o); return } setNav(item.id) }}>
              <span className={css.navTabIcon}>{item.icon}</span>
              <span className={css.navTabLabel}>{item.label}</span>
              {item.id === 'progress' && busy === true && <span className={css.navTabDot} />}
            </button>
          ))}
        </div>
        <div className={css.navSpacer} />
        <button type="button" role="tab" aria-selected={nav === 'settings'} data-active={nav === 'settings' ? '' : undefined} className={css.navTab} title="设置" onClick={() => setNav('settings')}>
          <span className={css.navTabIcon}><Settings size={18} /></span>
          <span className={css.navTabLabel}>设置</span>
        </button>
        <div className={css.navAbout}>
          <button type="button" className={css.navAboutRow} title="打开 GitHub 仓库" onClick={() => { window.open(REPO_URL, '_blank', 'noopener') }}>
            <span>ℹ️ v{PLUGIN_VERSION}</span>
            <span className={css.meta}>GitHub ↗</span>
          </button>
          {npmLatest !== null && npmLatest !== PLUGIN_VERSION && (
            <button type="button" className={css.navAboutUpdate} title="点击自动更新（下载最新 npm 版，完成后请重启 DSH）" disabled={updating} onClick={() => { void doUpdate() }}>
              {updating ? '🔄 更新中…' : `🔄 更新到 v${npmLatest}`}
            </button>
          )}
        </div>
      </nav>
      <div className={css.authorContent}>
        {nav === 'shelf' && <ShelfView api={api} shelf={shelf} onOpenBook={onOpenBook} onReadBook={onReadBook} onAddBook={onAddBook} onImportBook={onImportBook} />}
        {nav === 'adapt' && <AdaptModeView api={api} onOpenBook={onOpenBook} />}
        {nav === 'assets' && <AuthorAssetsView api={api} />}
        {nav === 'library' && <GlobalAssetLibraryView api={api} />}
        {nav === 'settings' && <SettingsView api={api} onTheme={onTheme} onBackground={onBackground} onOpacity={onOpacity} onEndfieldAccent={onEndfieldAccent} />}
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
              📊 AI 进度
              {busy && <span style={{ color: 'var(--nf-accent)' }}> 🟢 任务进行中</span>}
              <span className={css.meta}>（拖动标题栏移动 · 右下角拉大小）</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-4)' }}>
              {(progress ?? []).length > 0 && <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClearProgress} title="清空活动记录">清空</button>}
              <button type="button" className={css.iconButton} title="关闭" aria-label="关闭AI进度" onClick={() => setProgressOpen(false)}>×</button>
            </span>
          </div>
          <div className={css.assistantFloatBody} style={{ padding: 'var(--nf-space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', overflow: 'hidden', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ProgressConsole progress={progress ?? []} busy={busy ?? false} busyLabel={busyLabel ?? ''} liveBar={liveBar ?? null} onClear={() => onClearProgress?.()} />
            </div>
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
