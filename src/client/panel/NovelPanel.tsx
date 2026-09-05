/**
 * The novel-forge workbench panel: tabs — 工作流 (guided pipeline), 大纲
 * (outline), 章节 (chapter plan + per-chapter write/review/rewrite/polish),
 * 设定库 (story bible), 伏笔 (foreshadows), 设置 (config). Generation and
 * review streams land in the progress console.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { NovelApi } from '../api.ts'
import { setCurrentBook } from '../api.ts'
import type { PanelController } from './controller.ts'
import { tt } from './helpers.ts'
import { ModelManager } from './ModelManager.tsx'
import { ReasoningSection } from './ReasoningSection.tsx'
import LiveFeedLog from './LiveFeedLog.tsx'
import { BarChart3, Book, BookMarked, BookOpen, Brain, Clapperboard, Factory, FileText, Folder, GitBranch, Library, MessageSquare, Palette, PenLine, PlugZap, RotateCcw, ScrollText, Search, Settings, Sparkles, Wrench } from 'lucide-react'
import { AssistantTab } from './AssistantTab.tsx'
import { AssetsTab } from './AssetsTab.tsx'
import { ShelfView } from './ShelfView.tsx'
import { AuthorHome } from './AuthorHome.tsx'
import { ReaderView } from './ReaderView.tsx'
import { RunPanel } from './RunPanel.tsx'
import { CreateBookView } from './CreateBookView.tsx'
import { ImportModal } from './ImportModal.tsx'
import { WorldTab } from './WorldTab.tsx'
import { MangaWorkspace } from './MangaWorkspace.tsx'
import DirectorView from './DirectorView.tsx'
import KnowledgeBaseView from './KnowledgeBaseView.tsx'
import { AuditIssueRow, PlotlineCard, PlotlineHealthPanel, PlotlinePlanPanel, PlotlineSuggestionPanel, RoleCandidateRow, RoleCard, StatCell, TodoRow } from './views.tsx'
import { extractDocxTextFromBuffer } from '../docx.ts'
import type {
  AuditStatus,
  BookshelfSnapshot,
  ChapterPlan,
  Foreshadow,
  ImageModelConfig,
  JobFrame,
  NovelConfig,
  Plotline,
  PlotlineHealthReport,
  PlotlinePlan,
  ProjectState,
  ReviewReport,
  RoleRecord,
  SensitiveHit,
  StoryBible,
  Volume,
} from '../../protocol.ts'
import css from './panel.module.css'

/** The panel's tab identifiers. */
export type NovelTab =
  | 'workflow' | 'overview' | 'blurb' | 'plan' | 'bible' | 'world' | 'foreshadow' | 'assistant' | 'settings'
  | 'characters' | 'roles' | 'facts' | 'plotlines' | 'reviews' | 'progress' | 'breakdown' | 'director' | 'knowledge'
  | 'assetsGenre' | 'assetsProgression' | 'assetsTemplates' | 'assetsRules' | 'assetsStyle' | 'run' | 'manhua'
  | 'book' | 'assets'

/** Panel shell props. */
export interface NovelPanelProps {
  /** The panel state owner (open/close/toggle). */
  controller: PanelController
  /** The API client every tab operates through. */
  api: NovelApi
}

/** One progress console line. */
interface ProgressLine {
  id: number
  text: string
  kind: 'info' | 'done' | 'error'
  /** Live line: a single in-place-updating row (generation counter + bar). */
  live?: boolean
  /** 0..1 completion ratio for the live line's progress bar. */
  ratio?: number
}

/** The navigation groups (AI-Novel-Writing-Assistant style grouping). */
const NAV_GROUPS: ReadonlyArray<{ id: string; label: string; collapsible?: boolean; items: ReadonlyArray<{ id: NovelTab; label: string; icon: ReactElement }> }> = [
  {
    id: 'create',
    label: '创作',
    items: [
      { id: 'workflow', label: tt('tab.workflow'), icon: <Wrench size={18} /> },
      { id: 'overview', label: tt('tab.overview'), icon: <FileText size={18} /> },
      { id: 'blurb', label: '简介 / 封面', icon: <BookOpen size={18} /> },
      { id: 'plan', label: tt('tab.plan'), icon: <BookMarked size={18} /> },
      { id: 'plotlines', label: '长线管理', icon: <ScrollText size={18} /> },
      { id: 'book', label: '本书设定', icon: <Library size={18} /> },
    ],
  },
  {
    id: 'core',
    label: '核心',
    items: [
      { id: 'assistant', label: tt('tab.assistant'), icon: <MessageSquare size={18} /> },
      { id: 'progress', label: 'AI 进度', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    id: 'advanced',
    label: '进阶工具',
    collapsible: true,
    items: [
      { id: 'breakdown', label: '拆书分析', icon: <Search size={18} /> },
      { id: 'director', label: '自动导演', icon: <Brain size={18} /> },
      { id: 'knowledge', label: '知识库', icon: <BookOpen size={18} /> },
      { id: 'manhua', label: '漫剧工作台', icon: <Clapperboard size={18} /> },
      { id: 'run', label: '生产单', icon: <Factory size={18} /> },
    ],
  },
  {
    id: 'assets',
    label: '资产',
    items: [
      { id: 'assets', label: '创作资产', icon: <Wrench size={18} /> },
    ],
  },
]

/** Settings tab — pinned to the bottom of the nav rail. */
const SETTINGS_TAB: { id: NovelTab; label: string; icon: ReactElement } = { id: 'settings', label: tt('tab.settings'), icon: <Settings size={18} /> }

/** 审稿维度中文名（审稿问题按维度标注展示）。 */
const REVIEW_DIM_ZH: Record<string, string> = {
  character: '人设', setting: '设定', redline: '红线', writing: '文笔', pacing: '节奏', logic: '逻辑', 'anti-ai': '反AI', presentation: '呈现', compliance: '合规',
}


/** 设置页内子导航分组。 */
const SETTINGS_SECTIONS: ReadonlyArray<{ id: 'model' | 'writing' | 'image' | 'files' | 'appearance'; label: string; icon: ReactElement }> = [
  { id: 'model', label: '模型与推理', icon: <Brain size={16} /> },
  { id: 'writing', label: '写作与审稿', icon: <PenLine size={16} /> },
  { id: 'files', label: '路径与文件', icon: <Folder size={16} /> },
  { id: 'appearance', label: '外观与主题', icon: <Sparkles size={16} /> },
]

/** 构建时注入的插件版本（tsdown define 替换为字符串字面量）。 */
declare const __NOVEL_FORGE_VERSION__: string | undefined
const PLUGIN_VERSION: string = typeof __NOVEL_FORGE_VERSION__ !== 'undefined' ? __NOVEL_FORGE_VERSION__ : '0.0.0'
/** GitHub 仓库地址（关于区块点击跳转）。 */
const REPO_URL = 'https://github.com/watersxya/dsh-novel-forge'

/** Whether any chapter is being generated right now. */
function anyGenerating(chapters: ChapterPlan[] | undefined): boolean {
  return (chapters ?? []).some(c => c.status === 'generating' || c.status === 'reviewing')
}

/** Status badge class + label. */
function statusBadge(chapter: ChapterPlan): { cls: string; label: string } {
  switch (chapter.status) {
    case 'pending': return { cls: css.badgePending, label: tt('plan.pending') }
    case 'generating': return { cls: css.badgeGenerating, label: tt('plan.generating') }
    case 'written': return { cls: css.badgeWritten, label: tt('plan.written') }
    case 'reviewing': return { cls: css.badgeGenerating, label: tt('plan.reviewing') }
    case 'approved': return { cls: css.badgeDone, label: tt('plan.approved') }
    case 'rejected': return { cls: css.badgeRejected, label: tt('plan.rejected') }
    case 'error': return { cls: css.badgeError, label: tt('plan.error') }
    default: return { cls: css.badgeError, label: tt('plan.error') }
  }
}

/** One review issue line (severity-colored, theme-aware). */
function severityColor(severity: string): string {
  return severity === 'high' ? 'var(--nf-error)' : severity === 'medium' ? 'var(--nf-warn)' : 'var(--nf-info)'
}

/** One row of a chapter-level diff (paragraph granularity). */
type DiffRow =
  | { kind: 'same'; text: string }
  | { kind: 'change'; old: string; neu: string }
  | { kind: 'del'; text: string }
  | { kind: 'add'; text: string }

/**
 * Paragraph-level LCS diff between an original chapter body and its
 * rewrite/polish draft. Adjacent delete+add runs merge into "change" pairs
 * (the common case: a reworded paragraph shown as old → new).
 */
function paragraphDiff(oldText: string, newText: string): DiffRow[] {
  const split = (t: string): string[] =>
    t.replace(/^#\s+.*$/m, '').trim().split(/\n{2,}/).map(p => p.trim()).filter(p => p !== '')
  const a = split(oldText)
  const b = split(newText)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (i < n && (j >= m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else if (j < m) {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    } else if (i < n) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  // Merge adjacent del/add runs into change pairs.
  const merged: DiffRow[] = []
  let k = 0
  while (k < rows.length) {
    const row = rows[k]!
    if (row.kind !== 'del' && row.kind !== 'add') {
      merged.push(row)
      k++
      continue
    }
    const dels: string[] = []
    const adds: string[] = []
    while (k < rows.length && (rows[k]!.kind === 'del' || rows[k]!.kind === 'add')) {
      if (rows[k]!.kind === 'del') dels.push((rows[k] as { text: string }).text)
      else adds.push((rows[k] as { text: string }).text)
      k++
    }
    if (dels.length > 0 && adds.length > 0) {
      merged.push({ kind: 'change', old: dels.join('\n\n'), neu: adds.join('\n\n') })
    } else if (dels.length > 0) {
      for (const d of dels) merged.push({ kind: 'del', text: d })
    } else {
      for (const ad of adds) merged.push({ kind: 'add', text: ad })
    }
  }
  return merged
}

/** 把章节 beats 按结构标签渲染（本章目标/剧情要点/爽点/结尾钩子 等）。 */
function renderBeats(beats: string): ReactElement {
  const lines = beats.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)' }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        const match = /^([^：:]{2,14})[：:]/.exec(trimmed)
        if (match !== null) {
          return (
            <div key={i}>
              <b style={{ color: 'var(--nf-accent)' }}>{match[1]}</b>
              {trimmed.slice(match[0].length)}
            </div>
          )
        }
        return <div key={i}>{line}</div>
      })}
    </div>
  )
}

/** The diff list of a draft-vs-original comparison (scrollable). */
function DiffList({ original, draft, fontSize }: { original: string; draft: string; fontSize?: number }): ReactElement {  const rows = useMemo(() => paragraphDiff(original, draft), [original, draft])
  const changed = rows.filter(r => r.kind === 'change').length
  const added = rows.filter(r => r.kind === 'add').length
  const removed = rows.filter(r => r.kind === 'del').length
  const [onlyChanges, setOnlyChanges] = useState(false)
  const shown = onlyChanges ? rows.filter(r => r.kind !== 'same') : rows
  return (
    <>
      <div className={css.diffLegend}>
        <span className={css.legendOld}>■ 原稿</span>
        <span className={css.legendNew}>■ 新稿</span>
        <span className={css.meta}>
          原 {original.length} 字 → 新 {draft.length} 字 · 修改 {changed} · 新增 {added} · 删除 {removed}
        </span>
        <label className={css.onlyChanges}>
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={e => { setOnlyChanges(e.target.checked) }}
          />
          只看改动
        </label>
      </div>
      <div className={css.diffList} style={fontSize !== undefined ? { fontSize } : undefined}>
        {shown.map((row, idx) => {
          if (row.kind === 'same') {
            return (
              <details key={idx} className={css.diffSame}>
                <summary>第 {idx + 1} 段 · 未改动（点击展开）</summary>
                <div className={css.diffSameBody}>{row.text}</div>
              </details>
            )
          }
          if (row.kind === 'change') {
            return (
              <div key={idx} className={css.diffChange}>
                <div className={css.diffColumn}>
                  <span className={css.diffTagOld}>原稿</span>
                  <div className={css.diffOld}>{row.old}</div>
                </div>
                <div className={css.diffColumn}>
                  <span className={css.diffTagNew}>新稿</span>
                  <div className={css.diffNew}>{row.neu}</div>
                </div>
              </div>
            )
          }
          if (row.kind === 'del') {
            return (
              <div key={idx} className={css.diffDel}>
                <span className={css.diffTagOld}>原稿</span>
                <span className={css.diffText}>{row.text}</span>
              </div>
            )
          }
          return (
            <div key={idx} className={css.diffAdd}>
              <span className={css.diffTagNew}>新稿</span>
              <span className={css.diffText}>{row.text}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** The novel-forge panel. */
export function NovelPanel({ controller, api }: NovelPanelProps) {
  const [activeTab, setActiveTab] = useState<NovelTab>('workflow')
  const [config, setConfig] = useState<NovelConfig | null>(null)
  /** 自定义背景（URL / dataURL），覆盖主题默认背景。 */
  const [themeBg, setThemeBg] = useState<string | undefined>(undefined)
  /** 自定义背景遮罩/模糊强度 0-80。 */
  const [themeBgBlur, setThemeBgBlur] = useState(0)
  /** 玻璃透明度 0-100（100=主题原样）。 */
  const [themeOpacity, setThemeOpacity] = useState(100)
  const [project, setProject] = useState<ProjectState | null>(null)
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([])
  const [outlineText, setOutlineText] = useState('')
  const [customDocxPath, setCustomDocxPath] = useState('')
  const [shelf, setShelf] = useState<BookshelfSnapshot | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [planCount, setPlanCount] = useState(30)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<ProgressLine[]>([])
  const [configDraft, setConfigDraft] = useState<NovelConfig | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null)
  /** 复盘记录页：当前展开的章节号。 */
  const [expandedReviewChapter, setExpandedReviewChapter] = useState<number | null>(null)
  /** 复盘记录页：按卷折叠，卷号 → 是否展开（默认全部收起）。 */
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({})
  const [chapterText, setChapterText] = useState('')
  const progressId = useRef(0)
  /** 面板已绑定的书（打开即锁，不随全局 active 漂移，避免串书）。 */
  const bookBoundRef = useRef(false)
  /** id of the single live progress row (generation counter), if any. */
  const liveProgressId = useRef<number | null>(null)
  /** last chars value rendered into the live row (throttle for streaming). */
  const lastDeltaChars = useRef(0)
  /** cumulative chars received this job (delta frames carry increments). */
  const liveChars = useRef(0)
  /** chapter no of the job currently streaming (delta frames carry no `no`). */
  const currentJobNo = useRef(0)
  /** prominent top-of-panel progress bar while a chapter is being written. */
  const [liveBar, setLiveBar] = useState<{ text: string; ratio?: number } | null>(null)
  /** 润色/修订工作区：左栏原文（可选中局部目标）+ 右栏指令/预览/应用。 */
  const [workspace, setWorkspace] = useState<{
    no: number
    title: string
    original: string
    instruction: string
    draft: string | null
    /** 已采纳草稿（原地结论态）：显示已采纳横幅 + 自动审稿结果，返回时才关闭工作区。 */
    applied?: boolean
  } | null>(null)
  /** 工作区左栏当前选中的文字（局部修订目标）。 */
  const [wsSelected, setWsSelected] = useState('')
  /** 工作区预览区：diff 对比视图开关。 */
  const [wsShowDiff, setWsShowDiff] = useState(false)
  /** 工作区原文 textarea 引用（用于捕获选中文字）。 */
  const wsEditorRef = useRef<HTMLTextAreaElement | null>(null)
  /** 工作区：手动编辑后的 AI 审查结果（不落盘）。 */
  const [wsCheckReport, setWsCheckReport] = useState<ReviewReport | null>(null)
  /** 手动审查结果中作者勾选要修复的问题（issue 下标）。 */
  const [wsChecked, setWsChecked] = useState<number[]>([])
  /** 工作区「一键修订结果」模式：顶部显示「✅ 修订完成」横幅，不展示旧意见选择。 */
  const [wsResultMode, setWsResultMode] = useState(false)
  /** 编辑页字号（localStorage 记忆，仅影响显示）。 */
  const [editorFontSize, setEditorFontSize] = useState<number>(() => {
    try {
      const v = Number(window.localStorage.getItem('dsh-novel-forge.editor.fontSize'))
      return v >= 12 && v <= 24 ? v : 14
    } catch { return 14 }
  })
  const changeEditorFontSize = (next: number): void => {
    const v = Math.min(24, Math.max(12, next))
    setEditorFontSize(v)
    try { window.localStorage.setItem('dsh-novel-forge.editor.fontSize', String(v)) } catch { /* ignore */ }
  }
  /** 面板主题（localStorage 记忆）：'liquid'=iOS 液态玻璃（绿） / 'neumorph'=新拟物（浅色） / 'macos'=macOS 玻璃（蓝，随外观自动浅深） / 'clay'=粘土拟态 / 'endfield'=终末地纸墨工业风。 */
  const [panelTheme, setPanelTheme] = useState<'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.theme')
      return v === 'neumorph' || v === 'macos' || v === 'clay' || v === 'endfield' ? v : 'liquid'
    } catch { return 'liquid' }
  })
  const changePanelTheme = (next: 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield'): void => {
    setPanelTheme(next)
    try { window.localStorage.setItem('dsh-novel-forge.theme', next) } catch { /* ignore */ }
  }
  /** 终末地强调色（localStorage 记忆）：'valley'=谷地黄（默认） / 'wuling'=武陵青。 */
  const [endfieldAccent, setEndfieldAccent] = useState<'valley' | 'wuling'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.theme.endfield.accent')
      return v === 'wuling' ? v : 'valley'
    } catch { return 'valley' }
  })
  const changeEndfieldAccent = (next: 'valley' | 'wuling'): void => {
    setEndfieldAccent(next)
    try { window.localStorage.setItem('dsh-novel-forge.theme.endfield.accent', next) } catch { /* ignore */ }
  }
  /** 显示模式（跟随系统 / 强制浅色 / 强制深色），localStorage 记忆，只作用于小说工坊面板。 */
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.theme.mode')
      return v === 'light' || v === 'dark' ? v : 'system'
    } catch { return 'system' }
  })
  const changeThemeMode = (next: 'system' | 'light' | 'dark'): void => {
    setThemeMode(next)
    try { window.localStorage.setItem('dsh-novel-forge.theme.mode', next) } catch { /* ignore */ }
  }
  /** 界面密度（舒适 / 紧凑 / 宽松），localStorage 记忆。 */
  const [themeDensity, setThemeDensity] = useState<'comfort' | 'compact' | 'spacious'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.theme.density')
      return v === 'compact' || v === 'spacious' ? v : 'comfort'
    } catch { return 'comfort' }
  })
  const changeThemeDensity = (next: 'comfort' | 'compact' | 'spacious'): void => {
    setThemeDensity(next)
    try { window.localStorage.setItem('dsh-novel-forge.theme.density', next) } catch { /* ignore */ }
  }
  /** 恢复默认主题：清掉主题/模式/密度/终末地强调色记忆。 */
  const resetTheme = (): void => {
    try {
      window.localStorage.removeItem('dsh-novel-forge.theme')
      window.localStorage.removeItem('dsh-novel-forge.theme.mode')
      window.localStorage.removeItem('dsh-novel-forge.theme.density')
      window.localStorage.removeItem('dsh-novel-forge.theme.endfield.accent')
    } catch { /* ignore */ }
    setPanelTheme('liquid')
    setThemeMode('system')
    setThemeDensity('comfort')
    setEndfieldAccent('valley')
  }
  /** 设置页内子导航：当前分组（localStorage 记忆）。 */
  const [settingsTab, setSettingsTab] = useState<'model' | 'writing' | 'image' | 'files' | 'appearance'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.settings.tab')
      return v === 'writing' || v === 'image' || v === 'files' || v === 'appearance' ? v : 'model'
    } catch { return 'model' }
  })
  const changeSettingsTab = (next: 'model' | 'writing' | 'image' | 'files' | 'appearance'): void => {
    setSettingsTab(next)
    try { window.localStorage.setItem('dsh-novel-forge.settings.tab', next) } catch { /* ignore */ }
  }
  /** 有未采纳草稿的章节号（refresh 后检测到遗留草稿时提示）。 */
  const [draftNo, setDraftNo] = useState<number | null>(null)
  /** 大纲页「更新大纲」编辑区是否展开。 */
  const [updatingOutline, setUpdatingOutline] = useState(false)
  /** 全书质检结果（null = 未运行）。 */
  const [auditIssues, setAuditIssues] = useState<import('../../protocol.ts').AuditIssue[] | null>(null)
  /** 全书质检实时状态（来自 /status，用于显示进度）。 */
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null)
  /** 角色卡（从事实库聚合）。 */
  const [charCards, setCharCards] = useState<import('../../protocol.ts').RoleStatusCard[] | null>(null)
  /** 世界观规则编辑草稿（bible tab，每行一条）。 */
  const [worldRulesDraft, setWorldRulesDraft] = useState('')
  /** 小说简介编辑草稿。 */
  const [blurbDraft, setBlurbDraft] = useState('')
  /** 书名编辑草稿（简介页改名用）。 */
  const [bookNameDraft, setBookNameDraft] = useState('')
  /** 封面 dataUrl（无封面为 null）。 */
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  /** 封面文件选择。 */
  const coverFileRef = useRef<HTMLInputElement | null>(null)
  /** 章节列表按卷折叠（存已折叠的卷号）。 */
  const [collapsedVolumes, setCollapsedVolumes] = useState<number[]>([])
  /** 章节页当前选中的卷（'all' = 全部卷显示在一起）。 */
  const [selectedVolume, setSelectedVolume] = useState<number | 'all'>('all')
  /** 待办/主行动卡「定位章节」的目标章号（用于展开+滚动+高亮，消费后清空）。 */
  const [focusNo, setFocusNo] = useState<number | null>(null)
  /** 剧情线编辑草稿（null = 未在编辑）。 */
  const [plotlineDraft, setPlotlineDraft] = useState<{
    id: string
    name: string
    kind: Plotline['kind']
    goal: string
    progress: string
    status: Plotline['status']
  } | null>(null)
  /** 长线管理页：子页签（剧情线 / 伏笔），localStorage 记忆。 */
  const [longlineTab, setLonglineTab] = useState<'plotlines' | 'foreshadow'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.longline.tab')
      return v === 'foreshadow' ? 'foreshadow' : 'plotlines'
    } catch { return 'plotlines' }
  })
  const changeLonglineTab = (next: 'plotlines' | 'foreshadow'): void => {
    setLonglineTab(next)
    try { window.localStorage.setItem('dsh-novel-forge.longline.tab', next) } catch { /* ignore */ }
  }
  /** 编年 / 复盘页：子页签（编年录 / 复盘记录），localStorage 记忆。 */
  const [archiveTab, setArchiveTab] = useState<'facts' | 'reviews'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.archive.tab')
      return v === 'reviews' ? 'reviews' : 'facts'
    } catch { return 'facts' }
  })
  const changeArchiveTab = (next: 'facts' | 'reviews'): void => {
    setArchiveTab(next)
    try { window.localStorage.setItem('dsh-novel-forge.archive.tab', next) } catch { /* ignore */ }
  }
  /** 本书设定页：子页签（设定库 / 大世界 / 角色库 / 编年·复盘），localStorage 记忆。 */
  const [bookTab, setBookTab] = useState<'bible' | 'world' | 'roles' | 'facts'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.book.tab')
      return v === 'world' || v === 'roles' || v === 'facts' ? v : 'bible'
    } catch { return 'bible' }
  })
  const changeBookTab = (next: 'bible' | 'world' | 'roles' | 'facts'): void => {
    setBookTab(next)
    try { window.localStorage.setItem('dsh-novel-forge.book.tab', next) } catch { /* ignore */ }
  }
  /** 角色知情度编辑草稿（角色名 → 文本，每行一条）。 */
  const [knowledgeDraft, setKnowledgeDraft] = useState<Record<string, string>>({})
  /** 角色库：AI 提炼候选（null = 未运行；localStorage 持久化，刷新不丢）。 */
  const [roleCandidates, setRoleCandidates] = useState<RoleRecord[] | null>(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.role.candidates')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as RoleRecord[]
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
      }
    } catch { /* ignore */ }
    return null
  })
  /** 角色库：编辑草稿（null = 不在编辑）。 */
  const [roleDraft, setRoleDraft] = useState<RoleRecord | null>(null)
  /** 角色库候选持久化：提炼/采纳后写回 localStorage。 */
  useEffect(() => {
    try {
      if (roleCandidates !== null && roleCandidates.length > 0) {
        window.localStorage.setItem('dsh-novel-forge.role.candidates', JSON.stringify(roleCandidates))
      } else {
        window.localStorage.removeItem('dsh-novel-forge.role.candidates')
      }
    } catch { /* ignore */ }
  }, [roleCandidates])
  /** 全书敏感词检查结果（null = 未运行）。 */
  const [sensHits, setSensHits] = useState<SensitiveHit[] | null>(null)
  const [sensScanned, setSensScanned] = useState(0)
  /** 拆书分析结果（null = 未运行）。 */
  const [breakdownResult, setBreakdownResult] = useState<import('../../protocol.ts').BreakdownResponse | null>(null)
  const [breakdownScope, setBreakdownScope] = useState<'recent' | 'volume:2' | 'volume:3' | 'all'>('recent')
  const [breakdownPreset, setBreakdownPreset] = useState<'quick' | 'standard'>('quick')
  /** AI 建议的剧情线候选（null = 未运行）。 */
  const [plotlineSuggestions, setPlotlineSuggestions] = useState<Plotline[] | null>(null)
  /** 剧情健康检查报告（null = 未运行）。 */
  const [plotlineHealth, setPlotlineHealth] = useState<PlotlineHealthReport | null>(null)
  /** AI 剧情方案（null = 未运行）。 */
  const [plotlinePlan, setPlotlinePlan] = useState<PlotlinePlan | null>(null)
  /** npm 最新版本（更新检测；null = 未检测/检测失败）。 */
  const [npmLatest, setNpmLatest] = useState<string | null>(null)
  /** 活动输出容器：自动滚动锚点（有新活动时跟随到底部）。 */
  const progressEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [progress])

  /** 后台检测 npm 最新版本（失败静默，不打扰）。 */
  useEffect(() => {
    let cancelled = false
    void fetch('https://registry.npmjs.org/@waterwx%2Fdsh-novel-forge')
      .then(response => response.json() as Promise<{ 'dist-tags'?: { latest?: string } }>)
      .then(data => {
        if (!cancelled && data['dist-tags']?.latest !== undefined) setNpmLatest(data['dist-tags'].latest)
      })
      .catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [])
  /** AI 助手悬浮窗：是否打开。 */
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  /** AI进度悬浮窗：是否打开。 */
  const [progressOpen, setProgressOpen] = useState(false)
  /** AI进度悬浮窗位置（localStorage 记忆）。 */
  const [progressPos, setProgressPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.progress.float')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
        return { x: typeof parsed.x === 'number' ? parsed.x : 60, y: typeof parsed.y === 'number' ? parsed.y : 120 }
      }
    } catch { /* ignore */ }
    return { x: 60, y: 120 }
  })
  /** AI进度悬浮窗尺寸（localStorage 记忆）。 */
  const [progressSize, setProgressSize] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.progress.size')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown }
        return { w: typeof parsed.w === 'number' ? parsed.w : 460, h: typeof parsed.h === 'number' ? parsed.h : 420 }
      }
    } catch { /* ignore */ }
    return { w: 460, h: 420 }
  })
  /** 悬浮窗位置（相对面板，localStorage 记忆）。 */
  const [assistantPos, setAssistantPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.assistant.float')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
        return { x: typeof parsed.x === 'number' ? parsed.x : 260, y: typeof parsed.y === 'number' ? parsed.y : 60 }
      }
    } catch { /* ignore */ }
    return { x: 260, y: 60 }
  })
  /** 悬浮窗尺寸（localStorage 记忆）。 */
  const [assistantSize, setAssistantSize] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.assistant.size')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown }
        return { w: typeof parsed.w === 'number' ? parsed.w : 420, h: typeof parsed.h === 'number' ? parsed.h : 460 }
      }
    } catch { /* ignore */ }
    return { w: 420, h: 460 }
  })
  /** 拖拽/缩放状态（target 区分 AI 助手 / AI进度两个悬浮窗）。 */
  const dragState = useRef<{ type: 'move' | 'resize'; target: 'assistant' | 'progress'; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null)

  /** 悬浮窗位置/尺寸持久化。 */
  useEffect(() => {
    try {
      window.localStorage.setItem('dsh-novel-forge.assistant.float', JSON.stringify(assistantPos))
      window.localStorage.setItem('dsh-novel-forge.assistant.size', JSON.stringify(assistantSize))
      window.localStorage.setItem('dsh-novel-forge.progress.float', JSON.stringify(progressPos))
      window.localStorage.setItem('dsh-novel-forge.progress.size', JSON.stringify(progressSize))
    } catch { /* ignore */ }
  }, [assistantPos, assistantSize, progressPos, progressSize])

  /** 全局拖拽/缩放监听（挂一次，靠 dragState 判断）。 */
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const s = dragState.current
      if (s === null) return
      if (s.type === 'move') {
        const next = {
          x: Math.max(-340, Math.min(s.origX + e.clientX - s.startX, 3000)),
          y: Math.max(0, Math.min(s.origY + e.clientY - s.startY, 3000)),
        }
        if (s.target === 'assistant') setAssistantPos(next)
        else setProgressPos(next)
      } else {
        const next = {
          w: Math.max(320, Math.min(s.origW + e.clientX - s.startX, 1400)),
          h: Math.max(220, Math.min(s.origH + e.clientY - s.startY, 1200)),
        }
        if (s.target === 'assistant') setAssistantSize(next)
        else setProgressSize(next)
      }
    }
    const onUp = (): void => { dragState.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  /** 左侧导航折叠状态（localStorage 记忆，参照 AI-Novel-Writing-Assistant 侧边栏）。 */
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return window.localStorage.getItem('dsh-novel-forge.nav.collapsed') === 'true' } catch { return false }
  })
  /** 视图：shelf = 书架首页；create = 开书向导；workspace = 当前书工作台。 */
  const [viewMode, setViewMode] = useState<'shelf' | 'create' | 'workspace' | 'reader'>('shelf')
  /** 从「创意灵感」采纳后带入开书向导的预填（书名 + 一句话想法）。 */
  const [createPrefill, setCreatePrefill] = useState<{ name: string; idea: string } | null>(null)
  const [showImport, setShowImport] = useState(false)

  /** Refresh bookshelf. */
  const refreshShelf = useCallback(async () => {
    try {
      const snapshot = await api.bookshelf()
      setShelf(snapshot)
      if (!bookBoundRef.current) {
        bookBoundRef.current = true
        const initialId = snapshot.activeBookId ?? snapshot.books[0]?.id ?? null
        setCurrentBook(initialId)
      }
    } catch { /* shelf is best-effort */ }
  }, [api])

  /** Append a progress console line. */
  const pushProgress = useCallback((text: string, kind: ProgressLine['kind'] = 'info') => {
    setProgress(prev => [...prev.slice(-300), { id: progressId.current++, text, kind }])
  }, [])

  /** Update the single live progress row in place (create it on first call). */
  const setLiveProgress = useCallback((text: string, ratio?: number) => {
    setProgress(prev => {
      if (liveProgressId.current !== null) {
        return prev.map(l => l.id === liveProgressId.current ? { ...l, text, ratio } : l)
      }
      const id = progressId.current++
      liveProgressId.current = id
      return [...prev.slice(-300), { id, text, kind: 'info', live: true, ratio }]
    })
  }, [])

  /** Remove the live progress row (a job finished / failed). */
  const clearLiveProgress = useCallback(() => {
    if (liveProgressId.current === null) return
    const id = liveProgressId.current
    liveProgressId.current = null
    setProgress(prev => prev.filter(l => l.id !== id))
  }, [])

  /** Refresh status (config + project + files). */
  const refresh = useCallback(async (showError = true, forceOutline = false) => {
    try {
      const status = await api.status()
      setConfig(status.config)
      setConfigDraft(status.config)
      setAuditStatus(status.audit ?? null)
      setProject(status.project ?? null)
      // 人物志存档同步：有 roleStatus 存档直接显示，无需重新刷新计算。
      if (status.project?.roleStatus !== undefined) {
        setCharCards(status.project.roleStatus)
      } else {
        setCharCards(null)
      }
      setGeneratedFiles(status.generatedFiles)
      const withDraft = status.project?.chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
      setDraftNo(withDraft?.no ?? null)
      const nextOutline = status.project?.outline
      // forceOutline：切换书/开书后强制同步大纲（refresh 闭包里的
      // outlineText 可能是旧值，导致 `=== ''` 条件失效、大纲不同步、
      // 「生成章节计划」按钮被禁用）。
      if (forceOutline || (nextOutline !== undefined && outlineText === '')) {
        setOutlineText(nextOutline ?? '')
      }
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api, outlineText])

  /** 激活一本书（书架入口共用）：重置本地编辑状态 → 拉取目标书 → 进入工作台或阅读页。 */
  const activateBook = useCallback(async (id: string, mode: 'workspace' | 'reader') => {
    setBusy(true)
    setError('')
    try {
      await api.bookActivate(id)
      // 显式切书：重绑当前书（之后所有书级请求明确带 bookId，不再被全局 active 串书）。
      setCurrentBook(id)
      // 切换书后重置本地编辑状态，重新拉取目标书。
      setOutlineText('')
      setProject(null)
      setGeneratedFiles([])
      setChapterText('')
      setExpandedChapter(null)
      setProgress([])
      setAuditIssues(null)
      setCharCards(null)
      await refresh(false, true)
      await refreshShelf()
      setViewMode(mode)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, refresh, refreshShelf])

  /** 首页「设置」与书内设置同入口：激活当前/首选书并跳到设置页。 */
  const openSettingsFromHome = async (): Promise<void> => {
    const targetId = shelf?.activeBookId ?? shelf?.books[0]?.id ?? null
    if (targetId === null || targetId === undefined) {
      setError('请先在书架开一本书；设置页以书籍工作台为入口')
      return
    }
    await activateBook(targetId, 'workspace')
    setActiveTab('settings')
  }

  /** Handle a docx file (pick or drag): parse locally, save outline. */
  const handleDocxFile = useCallback(async (file: File) => {
    setBusy(true)
    setBusyLabel(tt('overview.loadingOutline'))
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const outline = extractDocxTextFromBuffer(buffer)
      if (outline.length < 50) {
        throw new Error('大纲内容过短（<50 字符），请检查文件')
      }
      setOutlineText(outline)
      await api.saveOutline(outline)
      await refresh(false)
      pushProgress(`已从「${file.name}」读取大纲（${outline.length} 字）`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`读取大纲失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }, [api, pushProgress, refresh])

  useEffect(() => {
    void refresh()
    void refreshShelf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 进入简介页时预填已保存的简介。 */
  useEffect(() => {
    if (activeTab === 'blurb') {
      if (blurbDraft === '' && project?.blurb !== undefined && project.blurb !== '') {
        setBlurbDraft(project.blurb)
      }
      if (bookNameDraft === '' && project?.bookName !== undefined && project.bookName !== '') {
        setBookNameDraft(project.bookName)
      }
      void loadCover()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, project?.blurb, project?.bookName])

  /** Load the outline from docx (default path or custom). */
  const handleLoadDocx = async (useCustom: boolean): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('overview.loadingOutline'))
    setError('')
    try {
      const result = await api.loadOutline(useCustom ? customDocxPath || undefined : undefined)
      setOutlineText(result.outline)
      // Persist into the project (load-or-create).
      await api.saveOutline(result.outline)
      await refresh(false)
      pushProgress(`大纲已读取（${result.chars} 字）：${result.bookName}${result.path !== undefined ? ` ← ${result.path}` : ''}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`读取大纲失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Save the edited outline. */
  const handleSaveOutline = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.saveOutline(outlineText)
      setNotice(tt('overview.saved'))
      pushProgress(tt('overview.saved'), 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 反推大纲：从已写章节正文反向生成全书总纲（流式进度）。 */
  const handleReverseOutline = async (): Promise<void> => {
    if (project === null) return
    if (!window.confirm('将从已写章节正文反推出全书总纲（覆盖当前大纲文本，不影响章节/设定/进度）。确定继续？')) return
    setBusy(true)
    setError('')
    try {
      await api.outlineReverse(frame => {
        if (frame.type === 'outline-progress') {
          pushProgress(`反推大纲：${frame.phase}（${frame.done}/${frame.total}）`, 'info')
        } else if (frame.type === 'outline-done') {
          setOutlineText(frame.outline)
          pushProgress(`反推大纲完成（${frame.chars} 字），已保存为当前总纲`, 'done')
        }
      })
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`反推大纲失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 大纲页「更新大纲」展开/收起（展开时预填当前大纲文本）。 */
  const handleToggleUpdateOutline = (): void => {
    if (!updatingOutline && project !== null) setOutlineText(project.outline)
    setUpdatingOutline(v => !v)
  }

  /** 重置项目：清空全部进度，从新大纲重新开始（二次确认）。 */
  const handleResetProject = async (): Promise<void> => {
    if (project === null) return
    if (!window.confirm('将清空本书全部进度（道藏/卷计划/章节计划/已生成章节/暗线/写作资产/编年录），且不可恢复。确定用新总纲重置？')) return
    setBusy(true)
    setError('')
    try {
      const result = await api.reset(outlineText)
      setUpdatingOutline(false)
      pushProgress(`已重置项目：${result.bookName}（从新大纲重新开始）`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`重置失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 全书一致性质检（LLM 扫描已生成章节）。 */
  const handleAudit = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('全书一致性质检中…')
    setError('')
    setAuditStatus({ status: 'running', totalBatches: 0, completedBatches: 0 })
    let stopped = false
    const poll = window.setInterval(async () => {
      if (stopped) return
      try {
        const s = await api.status()
        if (s.audit !== undefined) setAuditStatus(s.audit)
      } catch { /* 轮询失败忽略，主请求仍会给出最终结果 */ }
    }, 1000)
    try {
      const result = await api.audit()
      if (stopped) return
      setAuditIssues(result.issues)
      pushProgress(result.issues.length === 0
        ? `全书质检完成：${result.auditedChapters} 章未发现矛盾 🎉`
        : `全书质检完成：发现 ${result.issues.length} 处疑似矛盾`, result.issues.length === 0 ? 'done' : 'error')
    } catch (err) {
      if (stopped) return
      setError((err as Error).message)
      pushProgress(`全书质检失败：${(err as Error).message}`, 'error')
    } finally {
      stopped = true
      window.clearInterval(poll)
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 角色卡刷新。 */
  const handleCharactersRefresh = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('聚合角色状态中…')
    setError('')
    try {
      const result = await api.charactersRefresh()
      setCharCards(result.cards)
      // 同步到项目存档（角色库卡片显示当前状态）。
      setProject(prev => prev === null ? prev : { ...prev, roleStatus: result.cards, updatedAt: new Date().toISOString() })
      pushProgress(`角色状态已刷新：${result.cards.length} 个角色`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`角色状态刷新失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 事实库回填（历史章节批量抽取）。 */
  const handleFactsBackfill = async (): Promise<void> => {    if (doneCount === 0) return
    setBusy(true)
    setBusyLabel('回填历史章节事实中…')
    setError('')
    try {
      const result = await api.factsBackfill()
      pushProgress(result.filled > 0
        ? `事实库回填完成：${result.filled} 章已抽取事实`
        : '事实库无需回填（所有章节都已有事实记录）', 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`事实库回填失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 章节复位：generating 卡死 → pending（可重新生成）。 */
  const handleChapterReset = async (no: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.chapterReset(no)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === no ? { ...c, status: 'pending', error: undefined } : c),
      })
      pushProgress(`第 ${no} 章已复位为待生成，可重新生成`, 'info')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`复位失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 章节直接通过（作者行使最终决定权）。 */
  const handleChapterApprove = async (no: number): Promise<void> => {
    if (!window.confirm(`确定直接通过第 ${no} 章？（跳过审稿判定，保留审稿记录）`)) return
    setBusy(true)
    setError('')
    try {
      await api.chapterApprove(no)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === no ? { ...c, status: 'approved' } : c),
      })
      pushProgress(`第 ${no} 章已直接通过`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`操作失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：保存草稿（新增或更新）。 */
  const handlePlotlineSave = async (): Promise<void> => {
    if (plotlineDraft === null) return
    const line: Plotline = {
      id: plotlineDraft.id,
      name: plotlineDraft.name.trim(),
      kind: plotlineDraft.kind,
      goal: plotlineDraft.goal.trim(),
      progress: plotlineDraft.progress.trim(),
      status: plotlineDraft.status,
      chapters: plotlineDraft.id !== ''
        ? (project?.plotlines?.find(l => l.id === plotlineDraft.id)?.chapters ?? [])
        : [],
      createdAt: plotlineDraft.id !== ''
        ? (project?.plotlines?.find(l => l.id === plotlineDraft.id)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
    }
    if (line.name === '') {
      setError('剧情线名称不能为空')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: plotlineDraft.id !== '' ? 'update' : 'add', line })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      setPlotlineDraft(null)
      pushProgress(plotlineDraft.id !== '' ? `剧情线已更新：${line.name}` : `剧情线已创建：${line.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存剧情线失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：删除。 */
  const handlePlotlineRemove = async (id: string): Promise<void> => {
    if (!window.confirm('确定删除这条剧情线？关联章节记录会一并移除。')) return
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'remove', id })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      pushProgress('剧情线已删除', 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：把本章关联到某条线（推进节点）。 */
  const handlePlotlineLink = async (id: string, chapterNo: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'link', id, chapterNo })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      pushProgress(`已把第 ${chapterNo} 章关联到剧情线`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：AI 建议候选线。 */
  const handlePlotlineSuggest = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('AI 分析剧情线中…')
    setError('')
    try {
      const result = await api.plotlines({ op: 'suggest' })
      setPlotlineSuggestions(result.suggestions ?? [])
      pushProgress(result.suggestions !== undefined && result.suggestions.length > 0
        ? `AI 建议了 ${result.suggestions.length} 条剧情线，可逐条采纳`
        : 'AI 没有给出剧情线建议，请检查大纲是否已加载', 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`AI 建议剧情线失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 剧情线：采纳一条 AI 建议。 */
  const handlePlotlineAdopt = async (suggestion: Plotline): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'add', line: { ...suggestion, id: '' } })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      setPlotlineSuggestions(prev => prev === null ? prev : prev.filter(s => s !== suggestion))
      pushProgress(`已采纳剧情线：${suggestion.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：AI 刷新单条线进度。 */
  const handlePlotlineRefresh = async (id: string): Promise<void> => {
    setBusy(true)
    setBusyLabel('AI 刷新剧情线进度中…')
    setError('')
    try {
      const result = await api.plotlines({ op: 'refresh', id })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      const line = result.plotlines.find(l => l.id === id)
      pushProgress(`剧情线进度已刷新：${line?.progress ?? ''}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`刷新剧情线进度失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 🩺 剧情健康检查：判断是否需要新线、多少章后添加。 */
  const handlePlotlineHealth = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('🩺 剧情健康检查中…')
    setError('')
    try {
      const result = await api.plotlines({ op: 'health' })
      setPlotlineHealth(result.health ?? null)
      pushProgress(`剧情健康检查完成：${result.health?.verdict ?? '无结论'}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`剧情健康检查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** ✨ AI 设计剧情方案：下一阶段方向 + 建议新线（含健康检查）。 */
  const handlePlotlinePlan = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('✨ 设计剧情方案中…')
    setError('')
    try {
      const result = await api.plotlines({ op: 'plan' })
      setPlotlineHealth(result.health ?? null)
      setPlotlinePlan(result.plan ?? null)
      pushProgress(`剧情方案已生成：${result.plan?.suggestions.length ?? 0} 条建议新线`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`剧情方案生成失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 采纳方案里的一条建议线。 */
  const handlePlanAdopt = async (suggestion: Plotline): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'add', line: { ...suggestion, id: '' } })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      setPlotlinePlan(prev => prev === null ? prev : { ...prev, suggestions: prev.suggestions.filter(s => s !== suggestion) })
      pushProgress(`已采纳剧情线：${suggestion.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 全书敏感词检查（硬匹配内置词库）。 */
  const handleSensitiveScan = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('敏感词检查中…')
    setError('')
    try {
      const result = await api.sensitiveCheck({ all: true })
      setSensHits(result.hits)
      setSensScanned(result.scannedChapters)
      pushProgress(result.hits.length > 0
        ? `敏感词检查：${result.hits.length} 处命中（${new Set(result.hits.map(h => h.chapterNo)).size} 章受影响）`
        : `敏感词检查完成：扫描 ${result.scannedChapters} 章，未命中违禁词`, result.hits.length > 0 ? 'error' : 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`敏感词检查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 拆书分析：对已写章节做结构/人物/文风/卖点体检（两阶段 LLM 管道，约 1-3 分钟）。 */
  const handleBreakdown = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('拆书分析中…')
    setError('')
    try {
      const result = await api.breakdown(breakdownScope, breakdownPreset)
      setBreakdownResult(result)
      pushProgress(`拆书分析完成：${result.chaptersScanned} 章 · ${result.sections.length} 个小节 · 约 ${result.usedTokens} token`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`拆书分析失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 生成单个角色的形象锚点（复用角色库 visual 能力）。 */
  /** 作者复盘补跑：全书缺失章节（流式）。 */
  const handleAuthorBackfillAll = async (): Promise<void> => {
    const missing = chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error' && c.authorReview === undefined).length
    setBusy(true)
    setBusyLabel(`补齐历史章节作者复盘（${missing} 章）…`)
    setError('')
    try {
      await api.reviewBackfillAll(frame => { applyJobFrame(frame, () => '') })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`补齐作者复盘失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 作者复盘补跑：单章。 */
  const handleAuthorBackfillChapter = async (no: number): Promise<void> => {
    setBusy(true)
    setBusyLabel(`生成第 ${no} 章作者复盘…`)
    setError('')
    try {
      const result = await api.reviewBackfillChapter(no)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === result.no ? { ...c, authorReview: result.review } : c),
      })
      const r = result.review
      pushProgress(
        `📋 第${no}章作者复盘：钩子${r.hookHonored ? '已兑现 ✓' : '未兑现 ✗'} · 结尾钩子 ${r.endingHook}/10`,
        r.hookHonored && r.endingHook >= 6 ? 'done' : 'error',
      )
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成第 ${no} 章作者复盘失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 保存角色知情度（bible.characters 整体更新）。 */
  const handleKnowledgeSave = async (): Promise<void> => {
    if (bible === undefined) return
    const characters = bible.characters.map(card => ({
      ...card,
      knowledge: (knowledgeDraft[card.name] ?? (card.knowledge ?? []).join('\n'))
        .split('\n').map(l => l.trim()).filter(l => l !== ''),
    }))
    setBusy(true)
    setError('')
    try {
      const result = await api.biblePatch({ characters })
      setProject(prev => prev === null || prev.bible === undefined ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      pushProgress('角色知情度已保存（生成/审稿都会严格遵守信息差）', 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存知情度失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 角色库：AI 从全书提炼角色候选。 */
  const handleRolesExtract = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('✨ 提炼角色库中…')
    setError('')
    try {
      const result = await api.roles({ op: 'extract' })
      // 双保险：过滤掉已入库的同名角色（服务端已排除，这里兜底）。
      const inLibrary = new Set((project?.roles ?? []).map(r => r.name))
      const fresh = (result.candidates ?? []).filter(r => !inLibrary.has(r.name))
      setRoleCandidates(prev => {
        const merged = [...(prev ?? []).filter(p => !fresh.some(f => f.name === p.name)), ...fresh]
        return merged
      })
      pushProgress(`AI 提炼出 ${fresh.length} 个新角色（已排除 ${(result.candidates?.length ?? 0) - fresh.length} 个已收录）`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`角色提炼失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 角色库：采纳候选（或修改后采纳）。 */
  const handleRoleAdopt = async (role: RoleRecord): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.roles({ op: 'adopt', role })
      setProject(prev => prev === null ? prev : { ...prev, roles: result.roles, updatedAt: new Date().toISOString() })
      setRoleCandidates(prev => prev === null ? prev : prev.filter(r => r !== role))
      pushProgress(`已加入角色库：${role.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 角色库：保存编辑草稿。 */
  const handleRoleSave = async (): Promise<void> => {
    if (roleDraft === null) return
    if (roleDraft.name.trim() === '') {
      setError('角色名不能为空')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.roles({ op: 'update', role: roleDraft })
      setProject(prev => prev === null ? prev : { ...prev, roles: result.roles, updatedAt: new Date().toISOString() })
      setRoleDraft(null)
      pushProgress(`角色已保存：${roleDraft.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 角色库：删除角色。 */
  const handleRoleRemove = async (name: string): Promise<void> => {
    if (!window.confirm(`确定从角色库删除「${name}」？`)) return
    setBusy(true)
    setError('')
    try {
      const result = await api.roles({ op: 'remove', name })
      setProject(prev => prev === null ? prev : { ...prev, roles: result.roles, updatedAt: new Date().toISOString() })
      pushProgress(`已从角色库删除：${name}`, 'info')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 保存世界观规则编辑（bible tab，每行一条）。 */
  const handleSaveWorldRules = async (): Promise<void> => {
    if (bible === undefined) return
    const rules = worldRulesDraft.split('\n').map(line => line.trim()).filter(line => line !== '')
    setBusy(true)
    setError('')
    try {
      const result = await api.biblePatch({ worldRules: rules })
      setProject(prev => prev === null ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      pushProgress(`世界观规则已保存（${rules.length} 条）`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 简介：AI 全量生成。 */
  const handleBlurbGenerate = async (): Promise<void> => {
    if (project === null) return
    setBusy(true)
    setBusyLabel('AI 生成简介中…')
    setError('')
    try {
      const result = await api.blurb('generate')
      setBlurbDraft(result.blurb)
      pushProgress(`简介已生成（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`简介生成失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 简介：按已写开头 AI 补全。 */
  const handleBlurbComplete = async (): Promise<void> => {
    if (project === null) return
    if (blurbDraft.trim() === '') return
    setBusy(true)
    setBusyLabel('AI 补全简介中…')
    setError('')
    try {
      const result = await api.blurb('generate', undefined, blurbDraft)
      setBlurbDraft(result.blurb)
      pushProgress(`简介已补全（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`简介补全失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 简介：手动保存。 */
  const handleBlurbSave = async (): Promise<void> => {
    if (project === null) return
    setBusy(true)
    setError('')
    try {
      const result = await api.blurb('save', blurbDraft)
      pushProgress(`简介已保存（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 加载封面（进入简介页时）。 */
  const loadCover = useCallback(async (): Promise<void> => {
    try {
      const result = await api.coverGet()
      setCoverDataUrl(result.dataUrl)
    } catch { /* best-effort */ }
  }, [api])

  /** 封面上传（本地预览 + 落盘）。 */
  const handleCoverUpload = (file: File | undefined): void => {
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null
      if (dataUrl === null) return
      setCoverDataUrl(dataUrl)
      void (async () => {
        setBusy(true)
        setError('')
        try {
          await api.coverPost('upload', dataUrl)
          pushProgress(`封面已上传：${file.name}`, 'done')
          await refresh(false)
        } catch (err) {
          setError((err as Error).message)
          pushProgress(`封面上传失败：${(err as Error).message}`, 'error')
          await loadCover()
        } finally {
          setBusy(false)
        }
      })()
    }
    reader.readAsDataURL(file)
  }

  /** 工作区：AI 审查当前编辑的正文（不落盘）。 */
  const handleWsCheck = async (): Promise<void> => {
    if (workspace === null) return
    if (workspace.original.trim().length < 50) {
      setError('正文过短（<50 字），请先编辑内容')
      return
    }
    setBusy(true)
    setBusyLabel(`AI 审查 第${workspace.no}章`)
    setError('')
    try {
      const result = await api.chapterCheck(workspace.no, workspace.original)
      setWsCheckReport(result.report)
      // 默认勾选 high 问题（无 high 则勾选全部 medium），作者可自行增删。
      const highIdx = result.report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)
      const mediumIdx = result.report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'medium').map(x => x.i)
      setWsChecked(highIdx.length > 0 ? highIdx : mediumIdx)
      pushProgress(`审查完成：${result.report.score} 分 — ${result.report.verdict}`, result.report.passed ? 'done' : 'error')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`AI 审查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 工作区「应用并保存」：有草稿（修订/润色产物）→ 应用草稿落盘；无草稿（手动编辑）→ 保存原文。
   *  沿用已有审查报告（wsCheckReport）或后端自动审稿；成功后原地进入「已采纳」结论态，返回定位到该章。 */
  const handleWsSave = async (): Promise<void> => {
    if (workspace === null) return
    if (workspace.original.trim().length < 50) {
      setError('正文过短（<50 字），未保存')
      return
    }
    setBusy(true)
    setError('')
    const no = workspace.no
    try {
      let report: ReviewReport | undefined = undefined
      let chars = workspace.original.length
      if (workspace.draft !== null) {
        // 有草稿：应用草稿（draftApply 已返回新正文 markdown；携带审查报告沿用结论定状态）。
        setBusyLabel(`应用草稿 第${no}章`)
        const result = await api.draftApply(no, wsCheckReport ?? undefined)
        report = wsCheckReport ?? undefined
        chars = result.chars
        setWorkspace(prev => prev === null ? prev : {
          ...prev,
          original: result.markdown ?? prev.original,
          draft: null,
          applied: true,
        })
      } else {
        // 无草稿：保存当前原文（沿用报告或后端自动审稿，1-2 分钟）。
        setBusyLabel(`AI 审查 第${no}章`)
        const result = await api.chapterSave(no, workspace.original, wsCheckReport ?? undefined)
        report = result.report
        setWorkspace(prev => prev === null ? prev : { ...prev, applied: true })
      }
      setDraftNo(null)
      if (report !== undefined) {
        pushProgress(`已保存并审稿：${report.score} 分 — ${report.verdict}（${report.passed ? '通过' : '未通过'}）`, report.passed ? 'done' : 'error')
      } else {
        pushProgress(`已保存第 ${no} 章（${chars} 字，原稿已备份 .bak）`, 'done')
      }
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 移除封面。 */
  const handleCoverRemove = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.coverPost('remove')
      setCoverDataUrl(null)
      pushProgress('封面已移除', 'info')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 重命名当前书（同步项目与书架）。 */
  const handleRename = async (): Promise<void> => {
    const name = bookNameDraft.trim()
    if (name === '' || project === null || name === project.bookName) return
    setBusy(true)
    setError('')
    try {
      const result = await api.rename(name)
      pushProgress(`书名已改为《${result.bookName}》`, 'done')
      await refresh(false)
      await refreshShelf()
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`改名失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Extract the story bible. */
  const handleBible = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('bible.gen'))
    setError('')
    try {
      const result = await api.bible(outlineText || undefined)
      setProject(prev => prev === null ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      const bible: StoryBible = result.bible
      pushProgress(tt('workflow.bibleDone', {
        n: bible.worldRules.length,
        c: bible.characters.length,
        r: bible.redLines.length,
      }), 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`提炼道藏失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Plan volumes. */
  const handleVolumes = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('workflow.genVolumes'))
    setError('')
    try {
      const result = await api.volumes(outlineText || undefined)
      setProject(prev => prev === null ? prev : { ...prev, volumes: result.volumes, updatedAt: new Date().toISOString() })
      pushProgress(tt('workflow.volumesDone', { n: result.volumes.length }), 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成卷计划失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Generate the chapter plan via LLM. */
  const handlePlan = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('plan.generate'))
    setError('')
    try {
      const result = await api.plan(outlineText || undefined, planCount)
      let freshCount = 0
      setProject(prev => {
        const base = prev ?? {
          bookName: '', outline: outlineText, chapters: [] as ChapterPlan[],
          foreshadows: [] as Foreshadow[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }
        // 追加时按标题去重，避免重复生成计划导致剧情「重头再来」。
        const existingTitles = new Set(base.chapters.map(c => c.title))
        const fresh = result.chapters.filter(c => !existingTitles.has(c.title))
        freshCount = fresh.length
        if (fresh.length === 0) return base
        return { ...base, chapters: [...base.chapters, ...fresh], updatedAt: new Date().toISOString() }
      })
      pushProgress(tt('workflow.planDone', { n: freshCount }), 'done')
      if (freshCount < result.chapters.length) {
        pushProgress(`已跳过 ${result.chapters.length - freshCount} 个与已有章节同名的重复章节`, 'error')
      }
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成章节计划失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 打开某章的工作区（读取服务器原文；有遗留草稿时预载草稿；可预填修订指令）。 */
  const openWorkspace = useCallback(async (no: number, instruction?: string, mode?: 'pick' | 'result'): Promise<void> => {
    try {
      const [chapterRes, statusRes] = await Promise.all([api.chapter(no), api.status()])
      const chapter = statusRes.project?.chapters.find(c => c.no === no)
      if (chapter === undefined) return
      // 指令框只承载「显式传入的指令」（如按质检/敏感词意见修订）；
      // 审稿意见统一由下方可勾选列表承载，不再自动预填文字，避免重复。
      const autoInstruction = instruction ?? ''
      setWorkspace({
        no,
        title: chapter.title,
        original: chapterRes.markdown,
        instruction: autoInstruction,
        draft: chapter.pendingDraft !== undefined && chapter.pendingDraft !== '' ? chapter.pendingDraft : null,
      })
      setWsSelected('')
      setWsShowDiff(true)
      if (mode === 'result') {
        // 一键修订结果模式：不再加载旧审稿意见（修订已按意见执行完），
        // 直接展示草稿；wsResultMode 标记用于顶部「✅ 修订完成」横幅。
        setWsCheckReport(null)
        setWsChecked([])
        setWsResultMode(true)
      } else {
        // 意见统一为「当前意见」：进工作区即加载已有审稿意见为可勾选列表，
        // 默认勾选 high（无 high 则勾选全部 medium），作者可自行增删。
        setWsResultMode(false)
        const carried = chapter.review
        setWsCheckReport(carried ?? null)
        if (carried !== undefined && carried.issues.length > 0) {
          const highIdx = carried.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)
          const mediumIdx = carried.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'medium').map(x => x.i)
          setWsChecked(highIdx.length > 0 ? highIdx : mediumIdx)
        } else {
          setWsChecked([])
        }
      }
    } catch { /* best-effort */ }
  }, [api])

  /** 捕获工作区原文 textarea 中选中的文字（局部修订目标）。 */
  const captureWsSelection = (): void => {
    const el = wsEditorRef.current
    if (el === null) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (end > start) setWsSelected(el.value.slice(start, end).trim())
    else setWsSelected('')
  }

  /** 工作区：去 AI 味润色（流式 → 预览草稿）。 */
  const handleWsPolish = async (): Promise<void> => {
    if (workspace === null) return
    setBusy(true)
    setBusyLabel(`${tt('plan.polish')} 第${workspace.no}章`)
    setError('')
    try {
      await api.polish(workspace.no, frame => { applyJobFrame(frame, n => tt('progress.polishing', { no: n })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${workspace.no} 章润色失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 工作区：按指令修订（whole=true 整章，false 仅修订选中片段）。 */
  /** 工作区：对草稿自动跑一次 AI 审查（不落盘），刷新「当前意见」为草稿版本。 */
  /**
   * 主观项豁免判定（方案 B）：修订后审查中，剩余问题若没有 high（逻辑/设定/事实矛盾），
   * 即使分数未达阈值也视为可接受——主观项（文笔/节奏/套话）不再无限循环卡修订。
   */
  const reviseAcceptable = (report: ReviewReport): boolean =>
    report.passed || report.issues.every(i => i.severity !== 'high')

  const autoCheckDraft = async (no: number, previousReport?: ReviewReport | null): Promise<void> => {
    const draft = project?.chapters.find(c => c.no === no)?.pendingDraft
    if (draft === undefined || draft === '') return
    setBusyLabel(`AI 审查草稿 第${no}章`)
    try {
      // 携带上一轮审稿报告 → 后端走「验证模式」：核对原意见是否解决 + 只挑新增 high，防止越修越多。
      const result = await api.chapterCheck(no, draft, previousReport ?? undefined)
      // 主观项豁免：无 high 即视为通过（passed 置 true，供保存沿用与横幅展示）。
      const acceptable = reviseAcceptable(result.report)
      const report: ReviewReport = acceptable ? { ...result.report, passed: true } : result.report
      setWsCheckReport(report)
      const highIdx = report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)
      const mediumIdx = report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'medium').map(x => x.i)
      setWsChecked(highIdx.length > 0 ? highIdx : mediumIdx)
      if (acceptable && !result.report.passed) {
        pushProgress(`草稿审查：${report.score} 分 — 可接受（剩余均为主观项，无逻辑/设定矛盾）`, 'done')
      } else {
        pushProgress(`草稿审查：${report.score} 分 — ${report.verdict}`, report.passed ? 'done' : 'error')
      }
    } catch (err) {
      pushProgress(`草稿审查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusyLabel('')
    }
  }

  const handleWsRewrite = async (whole: boolean, overrideInstruction?: string): Promise<void> => {
    if (workspace === null) return
    const target = whole ? '' : wsSelected
    const instruction = overrideInstruction ?? workspace.instruction
    // 新一轮修订开始：清掉「已采纳」结论态（横幅只在采纳后短暂停留）。
    if (workspace.applied === true) {
      setWorkspace({ ...workspace, applied: false })
    }
    setBusy(true)
    setBusyLabel(`${tt('plan.rewrite')} 第${workspace.no}章`)
    setError('')
    const no = workspace.no
    try {
      await api.rewrite(no, instruction, target, frame => { applyJobFrame(frame, n => tt('progress.rewriting', { no: n })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章修订失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
      // 修订后自动审查（设置开关，默认开）：草稿 → 验证模式审查（携带本次修订所依据的报告），
      // 核对原意见解决情况 + 只挑新增 high，防止"越修 high 越多"。
      if (config?.autoReviewAfterRevise !== false) {
        setBusy(true)
        await autoCheckDraft(no, wsCheckReport)
        setBusy(false)
      }
    }
  }

  /** 工作区：按审查报告中勾选的问题一键修订（按勾选意见整章修订到草稿，不污染指令框）。 */
  const handleWsReviseByReport = async (): Promise<void> => {
    if (workspace === null || wsCheckReport === null) return
    const picked = wsChecked
      .map(i => wsCheckReport.issues[i])
      .filter((it): it is ReviewReport['issues'][number] => it !== undefined)
      .slice(0, 5)
    if (picked.length === 0) return
    const instruction = '按审稿意见修订（优先处理）：\n' + picked.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    await handleWsRewrite(true, instruction)
  }

  /** 列表页「按意见修订」一键直达：不进工作区，直接按该章审稿意见全部修订（high 优先，
   *  无 high 用 medium，不足取前 3 条），修订完自动打开工作区展示草稿 + 自动审查结果。 */
  const handleReviseNow = async (no: number): Promise<void> => {
    const chapter = chapters.find(c => c.no === no)
    if (chapter?.review === undefined || chapter.review.issues.length === 0) {
      openWorkspace(no)
      return
    }
    const issues = chapter.review.issues
    const high = issues.filter(i => i.severity === 'high')
    const medium = issues.filter(i => i.severity === 'medium')
    const picked = high.length > 0 ? high : medium.length > 0 ? medium : issues
    const top = picked.slice(0, 5)
    const instruction = '按审稿意见修订（优先处理）：\n' + top.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    setBusy(true)
    setBusyLabel(`${tt('plan.rewrite')} 第${no}章`)
    setError('')
    try {
      await api.rewrite(no, instruction, '', frame => { applyJobFrame(frame, n => tt('progress.rewriting', { no: n })) })
      await refresh(false)
      // 结果模式打开工作区：不展示旧意见，直接看草稿；开启自动审查时以「验证模式」跑一次
      // （携带本章原审稿报告：核对原意见解决情况 + 只挑新增 high，防止越修越多）。
      await openWorkspace(no, undefined, 'result')
      if (config?.autoReviewAfterRevise !== false) {
        setBusy(true)
        await autoCheckDraft(no, chapter.review)
      }
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章修订失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 放弃草稿：保留原稿，仅清空草稿。 */
  const handleDraftDiscard = async (no: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.draftDiscard(no)
      setWorkspace(null)
      setWsResultMode(false)
      setDraftNo(null)
      pushProgress(`已放弃第 ${no} 章草稿，保留原稿`, 'info')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`放弃第 ${no} 章草稿失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** Shared frame handler for generate/rewrite/polish streams. */
  const applyJobFrame = useCallback((frame: JobFrame, label: (no: number) => string) => {
    if (frame.type === 'start') {
      clearLiveProgress()
      setLiveBar(null)
      lastDeltaChars.current = 0
      liveChars.current = 0
      currentJobNo.current = frame.no
      // 任务开始：不自动弹出进度悬浮窗（导航「AI进度」显示呼吸绿点提示，
      // 想看进度时手动点导航打开；liveBar 数据照常累积）。
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'generating', error: undefined } : c),
      })
      pushProgress(label(frame.no))
    } else if (frame.type === 'delta') {
      // One live row updated in place — no per-token console spam. The
      // server streams incremental text, so accumulate locally.
      const chars = (liveChars.current += frame.text.length)
      const target = project?.chapters.find(c => c.no === currentJobNo.current)?.targetChars ?? 0
      if (chars < 50 || chars - lastDeltaChars.current >= 200) {
        lastDeltaChars.current = chars
        const text = target > 0 ? `已生成 ${chars} / ${target} 字` : `已生成 ${chars} 字`
        const ratio = target > 0 ? Math.min(chars / target, 1) : undefined
        setLiveProgress(text, ratio)
        setLiveBar({ text, ratio })
      }
    } else if (frame.type === 'done' || frame.type === 'rewritten') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'written', chars: frame.chars, file: frame.file, review: undefined } : c),
      })
      pushProgress(tt('progress.done', { no: frame.no, chars: frame.chars, file: frame.file }), 'done')
      if (frame.type === 'done' && frame.warn !== undefined && frame.warn !== '') {
        pushProgress(`⚠️ ${frame.warn}`, 'info')
      }
      setGeneratedFiles(prev => prev.includes(frame.file) ? prev : [...prev, frame.file])
    } else if (frame.type === 'review') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: frame.report.passed ? 'approved' : 'rejected', review: frame.report } : c),
      })
      pushProgress(tt('progress.reviewed', {
        no: frame.no,
        score: frame.report.score,
        verdict: frame.report.verdict,
      }), frame.report.passed ? 'done' : 'error')
    } else if (frame.type === 'author-review') {
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, authorReview: frame.review } : c),
      })
      const r = frame.review
      pushProgress(
        `📋 第${frame.no}章作者复盘：钩子${r.hookHonored ? '已兑现 ✓' : '未兑现 ✗'} · 结尾钩子 ${r.endingHook}/10 · ${r.plotlineProgress !== '' ? r.plotlineProgress : '无实质推进'}`,
        r.hookHonored && r.endingHook >= 6 ? 'done' : r.endingHook < 6 || !r.hookHonored ? 'error' : 'info',
      )
    } else if (frame.type === 'author-backfill-done') {
      clearLiveProgress()
      setLiveBar(null)
      pushProgress(`✅ 历史章节作者复盘补齐完成（共 ${frame.count} 章）`, 'done')
      void refresh(false)
    } else if (frame.type === 'drafted') {
      // 润色/重写完成：产物作为待确认草稿，展示在工作区预览，由用户决定。
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, pendingDraft: frame.draft } : c),
      })
      pushProgress(`第 ${frame.no} 章润色完成（${frame.chars} 字），请查看预览后应用或放弃`)
      setDraftNo(frame.no)
      setWsShowDiff(false)
      setWorkspace(prev => prev !== null && prev.no === frame.no ? { ...prev, draft: frame.draft } : prev)
    } else if (frame.type === 'error') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'error', error: frame.message } : c),
      })
      pushProgress(tt('progress.error', { no: frame.no, message: frame.message }), 'error')
    }
  }, [pushProgress, setLiveProgress, clearLiveProgress, project])

  /** Generate one chapter, streaming frames into the console. */
  const handleWriteChapter = async (no: number, skipReview: boolean): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.write')} 第${no}章`)
    setError('')
    try {
      await api.generate(no, skipReview, frame => { applyJobFrame(frame, n => tt('progress.generating', { no: n, title: (project?.chapters.find(c => c.no === n)?.title ?? '') })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** Batch-write all remaining chapters in sequence (auto-retry once per chapter). */
  const handleWriteAll = async (): Promise<void> => {
    const remaining = chapters.filter(c => c.status === 'pending' || c.status === 'error')
    if (remaining.length === 0) return
    setBusy(true)
    setBusyLabel(`${tt('plan.writeAllPending')}（共 ${remaining.length} 章）`)
    setError('')
    let failed = 0
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
    for (const chapter of remaining) {
      pushProgress(`▶ 开始生成第 ${chapter.no} 章《${chapter.title}》`)
      let lastError: unknown = null
      // 失败自动重试：最多尝试 2 次，间隔 3 秒（网络抖动/LLM 偶发失败自愈）。
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 批量连写也走完整质量门：生成 → 自动审稿 → 作者复盘（false = 不跳过审稿）。
          await api.generate(chapter.no, false, frame => { applyJobFrame(frame, n => tt('progress.generating', { no: n, title: (project?.chapters.find(c => c.no === n)?.title ?? '') })) })
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (attempt < 2) {
            pushProgress(`第 ${chapter.no} 章第 ${attempt} 次尝试失败（${(err as Error).message}），3 秒后自动重试…`, 'error')
            await sleep(3000)
          }
        }
      }
      if (lastError !== null) {
        failed++
        pushProgress(`第 ${chapter.no} 章失败：${(lastError as Error).message}`, 'error')
      }
    }
    setBusy(false)
    setBusyLabel('')
    await refresh(false)
    pushProgress(failed === 0
      ? `批量生成完成：${remaining.length} 章全部完成`
      : `批量生成结束：${remaining.length - failed} 章完成，${failed} 章失败`, failed === 0 ? 'done' : 'error')
  }

  /** Review one chapter. */
  const handleReview = async (no: number): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.review')} 第${no}章`)
    setError('')
    try {
      const result = await api.review(no)
      const report: ReviewReport = result.report
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === no ? { ...c, status: report.passed ? 'approved' : 'rejected', review: report } : c),
      })
      pushProgress(tt('progress.reviewed', { no, score: report.score, verdict: report.verdict }), report.passed ? 'done' : 'error')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Toggle chapter preview. */
  const handleToggleChapter = async (no: number): Promise<void> => {
    if (expandedChapter === no) {
      setExpandedChapter(null)
      setChapterText('')
      return
    }
    setExpandedChapter(no)
    setChapterText('')
    try {
      const result = await api.chapter(no)
      setChapterText(result.markdown)
    } catch (err) {
      setChapterText(`（${(err as Error).message}）`)
    }
  }

  /** Suggest foreshadows via LLM. */
  const handleSuggestForeshadows = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('foreshadow.suggest'))
    setError('')
    try {
      const result = await api.foreshadow({ suggest: true })
      setProject(prev => prev === null ? prev : { ...prev, foreshadows: [...(prev?.foreshadows ?? []), ...result.foreshadows], updatedAt: new Date().toISOString() })
      pushProgress(`AI 已建议 ${result.foreshadows.length} 条伏笔`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`伏笔建议失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Save the settings draft. */
  const handleSaveConfig = async (): Promise<void> => {
    if (configDraft === null) return
    setBusy(true)
    setError('')
    try {
      const result = await api.patchConfig({
        outlinePath: configDraft.outlinePath,
        outputDir: configDraft.outputDir,
        provider: configDraft.provider,
        model: configDraft.model,
        generateModel: configDraft.generateModel,
        reviewModel: configDraft.reviewModel,
        auditModel: configDraft.auditModel,
        reasoningEffort: configDraft.reasoningEffort ?? 'off',
        chapterChars: configDraft.chapterChars,
        maxTokens: configDraft.maxTokens,
        reviewPassScore: configDraft.reviewPassScore,
        autoReview: configDraft.autoReview,
        autoAuthorReview: configDraft.autoAuthorReview,
        autoReviewAfterRevise: configDraft.autoReviewAfterRevise,
        imageApiKey: configDraft.imageApiKey,
        imageApiModel: configDraft.imageApiModel,
        imageApiEnabled: configDraft.imageApiEnabled ?? false,
        imageModels: configDraft.imageModels ?? [],
        savedModels: configDraft.savedModels ?? [],
      })
      setConfig(result.config)
      setConfigDraft(result.config)
      setNotice(tt('settings.saved'))
      pushProgress(tt('settings.saved'), 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 生图接口测试状态（模型 id → 结果）。 */
  const [imageTestState, setImageTestState] = useState<Record<string, { testing: boolean; ok?: boolean; ms?: number; message?: string; modelFound?: boolean }>>({})
  /** 测试一条生图模型：连通 + 延迟。 */
  const testImageModel = async (m: ImageModelConfig): Promise<void> => {
    if (m.baseURL.trim() === '' || m.apiKey.trim() === '') {
      setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: false, message: '请先填写接口地址和 API Key' } }))
      return
    }
    setImageTestState(prev => ({ ...prev, [m.id]: { testing: true } }))
    try {
      const r = await api.imageTest({ baseURL: m.baseURL, apiKey: m.apiKey, model: m.model })
      setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: r.ok, ms: r.ms, message: r.message } }))
    } catch (err) {
      setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: false, message: (err as Error).message } }))
    }
  }
  /** 更新一条生图模型配置。 */
  const updateImageModel = (id: string, patch: Partial<ImageModelConfig>): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).map(m => m.id === id ? { ...m, ...patch } : m) })
  }
  /** 新增一条生图模型（第一条默认启用）。 */
  const addImageModel = (): void => {
    setConfigDraft(prev => prev === null ? prev : {
      ...prev,
      imageModels: [...(prev.imageModels ?? []), { id: 'img-' + Date.now().toString(36), name: '', baseURL: '', apiKey: '', model: '', enabled: (prev.imageModels ?? []).length === 0 }],
    })
  }
  /** 删除一条生图模型。 */
  const removeImageModel = (id: string): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).filter(m => m.id !== id) })
  }
  /** 启用一条（其余自动停用）。 */
  const enableImageModel = (id: string): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).map(m => ({ ...m, enabled: m.id === id })) })
  }

  /** Export the book. */
  const handleExport = async (format: 'txt' | 'md'): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.exportBook(format)
      setNotice(tt('settings.exported', { file: result.file, chars: result.chars, chapters: result.chapters }))
      pushProgress(tt('settings.exported', { file: result.file, chars: result.chars, chapters: result.chapters }), 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const busyAny = anyGenerating(project?.chapters)
  const chapters = project?.chapters ?? []
  const doneCount = chapters.filter(c => c.status === 'approved' || c.status === 'written' || c.status === 'rejected').length
  const pendingCount = chapters.filter(c => c.status === 'pending' || c.status === 'error').length
  const bible: StoryBible | undefined = project?.bible
  const volumes: Volume[] | undefined = project?.volumes
  const foreshadows: Foreshadow[] = project?.foreshadows ?? []

  /**
   * 定位章节：从待办/主行动卡跳到章节页的目标章——切 tab、解除卷筛选、
   * 展开所在卷，并滚动高亮（focusNo 驱动 useEffect 执行）。
   * 不强行展开章节详情：保持章节原有收起/展开状态，避免页面被撑开。
   */
  const gotoChapter = useCallback((no: number): void => {
    setActiveTab('plan')
    setSelectedVolume('all')
    // 展开目标章所在卷（从折叠列表移除该卷号）。
    const chapter = chapters.find(c => c.no === no)
    if (chapter !== undefined && chapter.volume > 0) {
      setCollapsedVolumes(prev => prev.filter(v => v !== chapter.volume))
    }
    setFocusNo(no)
  }, [chapters])

  /** focusNo 驱动：等 DOM 渲染后滚动到目标章并短暂高亮（3 秒后清除）。 */
  useEffect(() => {
    if (focusNo === null) return
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-chapter-no="${focusNo}"]`)
      if (el !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add(css.chapterFocus)
        window.setTimeout(() => { el.classList.remove(css.chapterFocus) }, 3000)
      }
      setFocusNo(null)
    }, 350)
    return () => { window.clearTimeout(timer) }
  }, [focusNo])

  /** 章节按卷分组（未分卷章节单独一组；章节多时可按卷折叠浏览）。 */
  const chapterGroups = useMemo(() => {
    const groups: Array<{ no: number; title: string; chapters: ChapterPlan[] }> = []
    if (volumes !== undefined) {
      for (const v of volumes) {
        const list = chapters.filter(c => c.volume === v.no)
        if (list.length > 0) groups.push({ no: v.no, title: `第${v.no}卷 · ${v.title}`, chapters: list })
      }
    }
    const unassigned = chapters.filter(c => c.volume === 0)
    if (unassigned.length > 0) groups.push({ no: 0, title: '未分卷', chapters: unassigned })
    if (groups.length === 0) groups.push({ no: 0, title: '全部章节', chapters })
    return groups
  }, [chapters, volumes])

  // --------------------------------------------------- dashboard (workflow)
  const approvedCount = chapters.filter(c => c.status === 'approved').length
  const reviewPendingCount = chapters.filter(c => c.status === 'written' || c.status === 'rejected').length
  const writingNow = chapters.find(c => c.status === 'generating' || c.status === 'reviewing')
  const totalChars = chapters.reduce((sum, c) => sum + (c.chars ?? 0), 0)
  const firstChapter = chapters[0]
  const currentVolumeName = (() => {
    if (firstChapter === undefined || volumes === undefined || volumes.length === 0) return '—'
    const vol = volumes.find(v => v.no === firstChapter.volume)
    return vol !== undefined ? vol.title : `第 ${firstChapter.volume} 卷`
  })()
  const lastUpdated = project?.updatedAt !== undefined
    ? new Date(project.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  /** 创作旅程 6 阶段（完成/当前/未到）。 */
  const journeyStages: Array<{ id: string; label: string; done: boolean }> = [
    { id: 'outline', label: '大纲', done: project !== null },
    { id: 'bible', label: '设定', done: bible !== undefined },
    { id: 'volumes', label: '卷计划', done: volumes !== undefined },
    { id: 'plan', label: '章节计划', done: chapters.length > 0 },
    { id: 'write', label: '正文', done: chapters.some(c => (c.chars ?? 0) > 0) },
    { id: 'review', label: '审稿', done: approvedCount > 0 },
  ]
  const journeyDoneCount = journeyStages.filter(s => s.done).length
  const journeyPercent = Math.round((journeyDoneCount / journeyStages.length) * 100)
  const currentStageId = journeyStages.find(s => !s.done)?.id

  /** 创作时间线阶段点击 → 跳转对应 tab。 */
  const jumpToStage = (id: string): void => {
    switch (id) {
      case 'outline': setActiveTab('overview'); break
      case 'bible': setActiveTab('book'); changeBookTab('bible'); break
      case 'volumes':
      case 'plan':
      case 'write': setActiveTab('plan'); break
      case 'review': setActiveTab('book'); changeBookTab('facts'); changeArchiveTab('reviews'); break
    }
  }

  /** 侧栏当前书卡（demo 风格）：书架激活书 → 封面首字 / 书名 / 进度。 */
  const activeBook = shelf?.books.find(b => b.id === shelf?.activeBookId) ?? null
  const activeBookName = activeBook?.bookName ?? project?.bookName ?? '未选书'
  const activeBookMeta = activeBook !== null ? `${activeBook.done}/${activeBook.total} 章 · 点按打开书架` : '点按打开书架'
  const activeBookLetter = activeBookName.trim().charAt(0) || '书'

  /** 主行动卡片：推荐下一步（AI-Novel-Writing-Assistant 首页主卡模式）。 */
  const nextAction = useMemo((): { eyebrow: string; title: string; reason: string; actionLabel: string; onClick: () => void } | null => {
    if (project === null) {
      return {
        eyebrow: '开始你的第一本书',
        title: '导入小说大纲',
        reason: '从 docx 文件或粘贴文本开始，AI 会把一份大纲「编译」成完整的小说。',
        actionLabel: '导入大纲',
        onClick: () => { setActiveTab('overview') },
      }
    }
    if (bible === undefined) {
      return {
        eyebrow: '推荐下一步',
        title: '提炼道藏',
        reason: '人设、世界观、金手指规则、写作红线是后续所有生成的地基，越完整质量越高。',
        actionLabel: '生成道藏',
        onClick: () => { void handleBible() },
      }
    }
    if (volumes === undefined) {
      return {
        eyebrow: '推荐下一步',
        title: '规划全书卷结构',
        reason: '按剧情弧线划分卷，章节计划才有骨架可依。',
        actionLabel: '生成卷计划',
        onClick: () => { void handleVolumes() },
      }
    }
    if (chapters.length === 0) {
      return {
        eyebrow: '推荐下一步',
        title: '生成章节计划',
        reason: 'LLM 根据大纲拆解每章标题与剧情要点，然后就可以逐章生成正文。',
        actionLabel: '生成章节计划',
        onClick: () => { void handlePlan() },
      }
    }
    const drafting = chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
    if (drafting !== undefined) {
      return {
        eyebrow: '需要你确认',
        title: `第 ${drafting.no} 章有未采纳的润色草稿`,
        reason: '打开工作区查看对比，决定采纳新稿或保留原稿（原稿未被改动）。',
        actionLabel: '打开工作区',
        onClick: () => { void openWorkspace(drafting.no) },
      }
    }
    if (pendingCount > 0) {
      return {
        eyebrow: '继续创作',
        title: `还有 ${pendingCount} 章待生成`,
        reason: '批量生成剩余章节，顶部进度条会实时显示每章字数与进度。',
        actionLabel: `批量生成（${pendingCount}）`,
        onClick: () => { void handleWriteAll() },
      }
    }
    if (reviewPendingCount > 0) {
      const firstPending = chapters.find(c => c.status === 'written' || c.status === 'rejected')
      return {
        eyebrow: '推荐下一步',
        title: `${reviewPendingCount} 章待审稿`,
        reason: '审稿通过后章节才算完成；不通过的可按意见在工作区修订。',
        actionLabel: '去审稿',
        onClick: () => { if (firstPending !== undefined) gotoChapter(firstPending.no) },
      }
    }
    if ((project?.todos ?? []).some(t => !t.done)) {
      const n = (project?.todos ?? []).filter(t => !t.done).length
      return {
        eyebrow: '需要你确认',
        title: `还有 ${n} 条导演待办未处理`,
        reason: '自动导演给出的风险/修复建议已加入待办，点进去逐条处理或勾掉。',
        actionLabel: '去处理',
        onClick: () => { setActiveTab('director') },
      }
    }
    return {
      eyebrow: '全部完成 🎉',
      title: '《' + project.bookName + '》已全部生成',
      reason: '可以去 AI 味润色（对比后采纳）、按卷复查或导出全本（TXT/MD）。',
      actionLabel: '导出全本',
      onClick: () => { void handleExport('txt') },
    }
  }, [project, bible, volumes, chapters, pendingCount, reviewPendingCount, openWorkspace, gotoChapter])

  /** 待办队列（失败/草稿/待审稿，点击直达）。 */
  const todos = useMemo(() => {
    const items: Array<{ tone: 'danger' | 'warning' | 'info' | 'success'; title: string; description: string; actionLabel: string; onClick: () => void }> = []
    for (const chapter of chapters) {
      if (chapter.status === 'error') {
        items.push({
          tone: 'danger',
          title: `第 ${chapter.no} 章《${chapter.title}》生成失败`,
          description: chapter.error ?? '',
          actionLabel: '去处理',
          onClick: () => { gotoChapter(chapter.no) },
        })
      }
      if (items.length >= 3) return items
    }
    const drafting = chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
    if (drafting !== undefined && items.length < 3) {
      items.push({
        tone: 'warning',
        title: `第 ${drafting.no} 章《${drafting.title}》有未采纳草稿`,
        description: '原稿未被改动，采纳或放弃由你决定',
        actionLabel: '打开工作区',
        onClick: () => { void openWorkspace(drafting.no) },
      })
    }
    for (const chapter of chapters) {
      if ((chapter.status === 'written' || chapter.status === 'rejected') && items.length < 3) {
        items.push({
          tone: 'info',
          title: `第 ${chapter.no} 章《${chapter.title}》待审稿`,
          description: chapter.status === 'rejected' ? '审稿未通过，可按意见修订' : '等待 AI 审稿确认',
          actionLabel: '去审稿',
          onClick: () => { gotoChapter(chapter.no) },
        })
      }
    }
    // 导演采纳的待办：风险/修复清单（来自「工具 → 自动导演」）
    if (project !== null) {
      for (const td of (project.todos ?? []).filter(t => !t.done)) {
        if (items.length >= 6) break
        items.push({
          tone: 'warning',
          title: `导演待办：${td.text.length > 26 ? td.text.slice(0, 26) + '…' : td.text}`,
          description: '自动导演给出的风险/修复，点进去逐条处理或勾掉',
          actionLabel: '去处理',
          onClick: () => { setActiveTab('director') },
        })
      }
    }
    return items
  }, [chapters, openWorkspace, gotoChapter, project])

  /** 资产健康（设定/卷/写作资产/伏笔）。 */
  const assetSummary = (() => {
    const assets = project?.assets
    const parts: string[] = []
    if (assets?.genre !== undefined) parts.push(`题材：${assets.genre.name}`)
    if (assets?.primaryProgression !== undefined) parts.push(`推进：${assets.primaryProgression.name}`)
    if ((assets?.styleAssets?.length ?? 0) > 0) parts.push(`写法：${assets!.styleAssets!.length} 套`)
    return parts.length > 0 ? parts.join(' · ') : '题材 / 推进 / 写法未绑定'
  })()
  const assetCount = (() => {
    const assets = project?.assets
    let n = 0
    if (assets?.genre !== undefined) n++
    if (assets?.primaryProgression !== undefined) n++
    n += assets?.auxiliaryProgressions?.length ?? 0
    n += assets?.styleAssets?.length ?? 0
    n += assets?.antiAiRules?.length ?? 0
    return n
  })()
  /** 自定义背景：优先用户显式选择（themeBg），否则用 config 里的持久化值。 */
  const effectiveBg = themeBg !== undefined && themeBg !== '' ? themeBg : (config?.themeBackground ?? '')
  const effectiveBgBlur = themeBgBlur > 0 ? themeBgBlur : (config?.themeBackgroundBlur ?? 0)
  const effectiveOpacity = themeOpacity > 0 ? themeOpacity : (config?.themeOpacity ?? 100)
  const panelBgStyle: Record<string, string> = {}
  if (effectiveBg !== '') panelBgStyle['--nf-glass-bg-image' as string] = 'url(' + effectiveBg + ')'
  if (effectiveBgBlur > 0) panelBgStyle['--nf-glass-bg-dim' as string] = String(effectiveBgBlur)
  panelBgStyle['--nf-glass-opacity' as string] = String(effectiveOpacity) + '%'

  return (
    <div className={css.panel} data-nf-theme={panelTheme} data-nf-mode={themeMode === 'system' ? undefined : themeMode} data-nf-density={themeDensity} data-nf-endfield-accent={endfieldAccent} style={panelBgStyle}>
      {viewMode === 'shelf' ? (
        /* 书架首页：作者级左侧导航 + 书架/改编/资产库/设置 */
        <AuthorHome
          api={api}
          shelf={shelf ?? { books: [], activeBookId: null }}
          onOpenBook={async (id) => {
            await activateBook(id, 'workspace')
          }}
          onReadBook={async (id) => {
            await activateBook(id, 'reader')
          }}
          onAddBook={() => { setCreatePrefill(null); setViewMode('create') }}
          onImportBook={() => { setShowImport(true) }}
          onUseIdea={(idea) => {
            setCreatePrefill({
              name: idea.title,
              idea: `《${idea.title}》\n题材：${idea.genre}\n视角：${idea.pov}\n钩子：${idea.hook}\n长期兑现：${idea.payoff}`,
            })
            setViewMode('create')
          }}
          onOpenSettings={() => { void openSettingsFromHome() }}
          onTheme={(t, m, d) => { changePanelTheme(t); changeThemeMode(m); changeThemeDensity(d) }}
          onBackground={(bg, blur) => { setThemeBg(bg); setThemeBgBlur(blur) }}
          onOpacity={(n) => { setThemeOpacity(n) }}
          onEndfieldAccent={(accent) => { changeEndfieldAccent(accent) }}
          adaptEnabled={config?.enableAdaptMode === true}
          progress={progress}
          busy={busy}
          busyLabel={busyLabel}
          liveBar={liveBar}
          onClearProgress={() => { setProgress([]) }}
        />
      ) : viewMode === 'create' ? (
        /* 开书向导：独立页面 */
        <CreateBookView
          api={api}
          initialName={createPrefill?.name}
          initialIdea={createPrefill?.idea}
          onBack={() => { setViewMode('shelf') }}
          onCreated={async (id) => {
            setBusy(true)
            try {
              setOutlineText('')
              setProject(null)
              setGeneratedFiles([])
              setChapterText('')
              setExpandedChapter(null)
              setProgress([])
              setAuditIssues(null)
              setCharCards(null)
              await refresh(false, true)
              await refreshShelf()
              setViewMode('workspace')
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : viewMode === 'reader' ? (
        /* 沉浸式阅读页：只读已写章节 */
        <ReaderView
          api={api}
          project={project ?? { bookName: '', outline: '', chapters: [], foreshadows: [], createdAt: '', updatedAt: '' }}
          onBack={() => { setViewMode('shelf') }}
          onOpenWorkspace={() => { setViewMode('workspace') }}
        />
      ) : (
        <>
      <div className={css.panelBody}>
        <nav className={`${css.panelNav} ${navCollapsed ? css.panelNavCollapsed : ''}`} role="tablist" aria-label="工作台导航">
          {/* 标题区：小说工坊 + 当前书名（顶部标题栏取消后移入侧栏） */}
          <div className={css.navTitle}>
            <div className={css.navTitleLogo}>书</div>
            {!navCollapsed && (
              <div style={{ minWidth: 0 }}>
                <div className={css.navTitleName}>小说工坊</div>
                <div className={css.navTitleBook} title={project?.bookName ?? ''}>
                  {project?.bookName !== undefined && project.bookName !== '' ? `📖 ${project.bookName}` : '未选书'}
                </div>
              </div>
            )}
          </div>
          {/* 分组导航（创作 / 工具 / 数据库） */}
          {NAV_GROUPS.map(group => (
            <div key={group.id} className={css.navGroup}>
              {!navCollapsed && <div className={css.navGroupLabel}>{group.label}</div>}
              {group.collapsible === true && (
                <button type="button" className={css.navTab} onClick={() => setAdvancedOpen(v => !v)} title={group.label}>
                  <span className={css.navTabIcon}>{advancedOpen ? '▾' : '▸'}</span>
                  {!navCollapsed && <span className={css.navTabLabel}>{advancedOpen ? '收起进阶' : '展开进阶'}</span>}
                </button>
              )}
              {(group.collapsible !== true || advancedOpen) && group.items.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id || (tab.id === 'assistant' && assistantOpen) || (tab.id === 'progress' && progressOpen)}
                  data-active={activeTab === tab.id || (tab.id === 'assistant' && assistantOpen) || (tab.id === 'progress' && progressOpen) ? '' : undefined}
                  className={css.navTab}
                  title={tab.label}
                  onClick={() => {
                    if (tab.id === 'assistant') {
                      setAssistantOpen(true)
                    } else if (tab.id === 'progress') {
                      setProgressOpen(v => !v)
                    } else {
                      setActiveTab(tab.id)
                    }
                  }}
                >
                  <span className={css.navTabIcon}>{tab.icon}</span>
                  {!navCollapsed && <span className={css.navTabLabel}>{tab.label}</span>}
                  {/* 状态角标：章节待办 / 伏笔待埋 / 工作流进度 */}
                  {tab.id === 'plan' && (pendingCount > 0 || reviewPendingCount > 0) && (
                    <span className={`${css.navTabBadge} ${chapters.some(c => c.status === 'error') ? css.navTabBadgeDanger : css.navTabBadgeWarn}`}>
                      {chapters.some(c => c.status === 'error') ? `!${pendingCount + reviewPendingCount}` : pendingCount + reviewPendingCount}
                    </span>
                  )}
                  {tab.id === 'plotlines' && foreshadows.some(f => f.status === 'planned') && (
                    <span className={css.navTabBadge}>{foreshadows.filter(f => f.status === 'planned').length}</span>
                  )}
                  {tab.id === 'workflow' && chapters.length > 0 && (
                    <span className={`${css.navTabBadge} ${css.navTabBadgeDone}`}>{journeyPercent}%</span>
                  )}
                  {/* 任务进行中：AI进度导航显示呼吸绿点（悬停看任务名），不自动弹窗 */}
                  {tab.id === 'progress' && busy && (
                    <span
                      className={`${css.navTabBadge} ${css.navTabBadgeLive}`}
                      title={busyLabel !== '' ? `任务中：${busyLabel}` : '任务进行中'}
                    >
                      ●
                    </span>
                  )}
                </button>
              ))}
              {!navCollapsed && <div className={css.navGroupSep} />}
            </div>
          ))}
          {/* 设置沉底 */}
          <div className={css.navSpacer} />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SETTINGS_TAB.id}
            data-active={activeTab === SETTINGS_TAB.id ? '' : undefined}
            className={css.navTab}
            title={SETTINGS_TAB.label}
            onClick={() => { setActiveTab(SETTINGS_TAB.id) }}
          >
            <span className={css.navTabIcon}>{SETTINGS_TAB.icon}</span>
            {!navCollapsed && <span className={css.navTabLabel}>{SETTINGS_TAB.label}</span>}
          </button>
          {/* 当前书切换卡（demo 风格底部内容卡：封面首字 + 书名 + 进度，点击回书架） */}
          {!navCollapsed && shelf !== null && (
            <button
              type="button"
              className={css.bookSwitch}
              title={activeBook !== null ? `当前书：${activeBook.bookName}（${activeBook.outputDir}）· 点击打开书架` : '打开书架'}
              onClick={() => { setViewMode('shelf') }}
            >
              <span className={css.bookSwitchCover}>{activeBookLetter}</span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span className={css.bookSwitchName}>{activeBookName}</span>
                <span className={css.bookSwitchMeta}>{activeBookMeta}</span>
              </span>
              <span className={css.bookSwitchArrow}>⌄</span>
            </button>
          )}
          {/* 关于：版本 + GitHub + 更新检测 */}
          <div className={css.navAbout}>
            <button
              type="button"
              className={css.navAboutRow}
              title="打开 GitHub 仓库"
              onClick={() => { window.open(REPO_URL, '_blank', 'noopener') }}
            >
              <span>ℹ️ v{PLUGIN_VERSION}</span>
              <span className={css.meta}>GitHub ↗</span>
            </button>
            {npmLatest !== null && npmLatest !== PLUGIN_VERSION && (
              <button
                type="button"
                className={css.navAboutUpdate}
                title="查看更新方法"
                onClick={() => {
                  window.alert(
                    `检测到新版本 v${npmLatest}（当前 v${PLUGIN_VERSION}）\n\n更新方式：\n\n【npm 安装】\ncd ~/.dsh/profiles/web && pnpm add @waterwx/dsh-novel-forge@latest\n然后重启 dsh web\n\n【GitHub 安装】\ndsh plugin --profile web add github:watersxya/dsh-novel-forge\n\n【本地开发】\n拉取最新代码 → pnpm install && pnpm build → 重启 dsh web`,
                  )
                }}
              >
                📦 有新版本 v{npmLatest}
              </button>
            )}
          </div>
          {/* 操作行：收起导航 / 关闭面板（原顶部按钮下放，收起态保留图标） */}
          <div className={css.navActions}>
            <button
              type="button"
              className={css.navActionBtn}
              title={navCollapsed ? '展开导航栏' : '收起导航栏'}
              aria-label={navCollapsed ? '展开导航栏' : '收起导航栏'}
              onClick={() => {
                setNavCollapsed(prev => {
                  const next = !prev
                  try { window.localStorage.setItem('dsh-novel-forge.nav.collapsed', String(next)) } catch { /* ignore */ }
                  return next
                })
              }}
            >
              {navCollapsed ? '▸' : '◂'}
            </button>
            <button
              type="button"
              className={css.navActionBtn}
              title={tt('common.close')}
              aria-label={tt('common.close')}
              onClick={() => { controller.close() }}
            >
              ×
            </button>
          </div>
        </nav>
        <div className={css.panelContent}>
        {error !== '' && <div className={css.card} style={{ borderColor: 'var(--nf-error)' }}><span style={{ color: 'var(--nf-error)' }}>{tt('common.error')}: {error}</span></div>}
        {notice !== '' && <div className={css.card}><span style={{ color: 'var(--nf-success)' }}>{notice}</span></div>}

        {/* 遗留草稿提示：刷新页面后仍有未采纳的润色/修订草稿 */}
        {workspace === null && draftNo !== null && (
          <div className={css.card} style={{ borderColor: 'var(--nf-info)' }}>
            <div className={css.busyRow}>
              <span style={{ color: 'var(--nf-info)' }}>第 {draftNo} 章有未采纳的润色/修订草稿（原稿未被改动）</span>
              <span style={{ display: 'flex', gap: 'var(--nf-space-8)' }}>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void openWorkspace(draftNo) }}>
                  打开工作区
                </button>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleDraftDiscard(draftNo) }}>
                  放弃
                </button>
              </span>
            </div>
          </div>
        )}

        {/* 章节编辑页（独占整页：点「编辑」进入，返回后回到原页面；无卡片盒子，撑满内容区） */}
        {workspace !== null && (
          <div className={css.wsPage}>
            <div className={css.wsPageHeader}>
              {workspace.applied === true ? (
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} onClick={() => { setWorkspace(null); setWsResultMode(false); gotoChapter(workspace.no) }} title="关闭工作区，返回章节页并定位到本章（滚动 + 高亮）">
                  ← 返回章节页
                </button>
              ) : (
                <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorkspace(null); setWsResultMode(false) }} title="返回章节列表（草稿不丢失）">
                  ← 返回
                </button>
              )}
              <span className={css.cardTitle}>第 {workspace.no} 章《{workspace.title}》</span>
              <span className={css.meta}>{workspace.original.length} 字</span>
              <span style={{ display: 'flex', gap: 'var(--nf-space-4)', alignItems: 'center', marginLeft: 'auto' }}>
                <button type="button" className={css.iconButton} title="减小字号" aria-label="减小字号" onClick={() => { changeEditorFontSize(editorFontSize - 1) }}>A−</button>
                <span className={css.meta}>{editorFontSize}px</span>
                <button type="button" className={css.iconButton} title="增大字号" aria-label="增大字号" onClick={() => { changeEditorFontSize(editorFontSize + 1) }}>A＋</button>
                <button type="button" className={css.iconButton} title="关闭工作区" aria-label="关闭工作区" onClick={() => { setWorkspace(null); setWsResultMode(false) }}>×</button>
              </span>
            </div>
            {workspace.applied === true && (
              <div className={css.wsAppliedBanner}>
                ✅ 已采纳第 {workspace.no} 章新稿（{workspace.original.length} 字）· 原稿已自动备份 .bak
                {wsCheckReport !== null ? (
                  <span style={{ color: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                    {' · '}修订时审查：{wsCheckReport.score} 分 — {wsCheckReport.passed ? '通过 ✓' : '未通过，可继续勾选意见修订'}
                  </span>
                ) : (
                  <span className={css.meta}>{' · '}需要结论？点「🔍 AI 审查」查看</span>
                )}
              </div>
            )}
            {workspace.applied !== true && wsResultMode && (
              <div className={css.wsAppliedBanner} style={{ borderColor: 'var(--nf-accent)', background: 'color-mix(in srgb, var(--nf-accent) 8%, transparent)' }}>
                ✅ 修订完成，请查看草稿对比
                {wsCheckReport !== null && (
                  <span style={{ color: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                    {' · '}草稿审查：{wsCheckReport.score} 分 — {wsCheckReport.passed ? '通过 ✓' : '未通过，可勾选意见继续修订'}
                  </span>
                )}
                <span className={css.meta}>{' · '}满意后点「✅ 应用并保存」落盘</span>
              </div>
            )}
            <div className={css.wsColumns}>
              <div className={css.wsColumn}>
                <div className={css.meta}>
                  原文（{workspace.original.length} 字）— 在正文中选中文字可作为「修订选中」的局部目标
                </div>
                <textarea
                  ref={wsEditorRef}
                  className={`${css.textarea} ${css.wsEditor}`}
                  style={{ fontSize: editorFontSize }}
                  value={workspace.original}
                  onChange={e => { setWorkspace({ ...workspace, original: e.target.value }) }}
                  onMouseUp={captureWsSelection}
                  onKeyUp={captureWsSelection}
                  onSelect={captureWsSelection}
                  spellCheck={false}
                />
              </div>
              <div className={css.wsColumn}>
                <div className={css.meta} style={{ fontWeight: 600 }}>AI 修正指令</div>
                <textarea
                  className={css.textarea}
                  style={{ minHeight: 60 }}
                  placeholder="输入修正要求，例如：压缩冗余、加强冲突、这段对话更口语化…（可留空）"
                  value={workspace.instruction}
                  onChange={e => { setWorkspace({ ...workspace, instruction: e.target.value }) }}
                />
                {wsSelected !== '' ? (
                  <div className={css.wsSelected}>
                    <div className={css.meta}>当前选中内容（将用于精准修订）</div>
                    <div className={css.wsSelectedText}>{wsSelected}</div>
                  </div>
                ) : (
                  <div className={css.meta}>未选中内容时仅支持整章润色/修订。</div>
                )}
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  {(wsCheckReport !== null && wsCheckReport.issues.length > 0) ? (
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                      disabled={busy || wsChecked.length === 0}
                      onClick={() => { void handleWsReviseByReport() }}
                      title="按下方勾选的意见自动修订整章；产出草稿后自动附带一次 AI 审查"
                    >
                      🔧 按意见修订（{wsChecked.length}）
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                      disabled={busy || workspace.instruction.trim() === ''}
                      onClick={() => { void handleWsRewrite(true) }}
                      title="按指令框内容整章修订"
                    >
                      🔧 整章修订
                    </button>
                  )}
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWsPolish() }}>
                    ✨ 去AI味润色
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { void handleWsSave() }} title="有草稿则应用草稿，无草稿则保存当前编辑；沿用审查结论或自动审稿，落盘后原地显示结果">
                    ✅ 应用并保存
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || wsSelected === ''} onClick={() => { void handleWsRewrite(false) }} title="只修订在左栏选中的文字片段">
                    📝 修订选中
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { void handleWsCheck() }} title="对当前正文跑一次 AI 审查（不落盘）">
                    🔍 AI 审查
                  </button>
                  {workspace.draft !== null && (
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleDraftDiscard(workspace.no) }} title="放弃草稿，保留原稿">
                      ↩️ 放弃草稿
                    </button>
                  )}
                </div>
                {/* 手动编辑后的 AI 审查结果 */}
                {wsCheckReport !== null && (
                  <div className={css.wsPreview} style={{ borderColor: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-warn)' }}>
                    <div className={css.busyRow}>
                      <span className={css.meta} style={{ fontWeight: 600 }}>AI 审查结果</span>
                      <span style={{ color: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                        {wsCheckReport.score} 分 — {wsCheckReport.passed ? '通过' : '未通过'}
                      </span>
                    </div>
                    <div className={css.meta}><b>总评：</b>{wsCheckReport.verdict}</div>
                    {wsCheckReport.issues.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 'var(--nf-space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', fontSize: editorFontSize - 1, maxHeight: '45vh', overflowY: 'auto' }}>
                        {wsCheckReport.issues.map((issue, i) => (
                          <li key={i} style={{ color: severityColor(issue.severity), display: 'flex', gap: 'var(--nf-space-6)', alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              style={{ marginTop: 'var(--nf-space-2)' }}
                              checked={wsChecked.includes(i)}
                              onChange={e => {
                                setWsChecked(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))
                              }}
                              title="勾选后由「按意见修订」一起修订"
                            />
                            <span>
                              [{issue.severity}{issue.dimension !== undefined ? ` · ${REVIEW_DIM_ZH[issue.dimension] ?? issue.dimension}` : ''}] {issue.item}
                              {issue.suggestion !== '' && <span style={{ color: 'var(--nf-text-2)' }}> → {issue.suggestion}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <span className={css.meta}>
                      {wsCheckReport.passed
                        ? '当前意见：已通过。勾选想微调的问题点「按意见修订」，或直接「✅ 应用并保存」。'
                        : '意见只读不落盘；勾选要修的问题点「🔧 按意见修订」一键修订（默认已勾 high），满意后点「✅ 应用并保存」写入文件（原稿自动备份 .bak）。'}
                    </span>
                  </div>
                )}
                {workspace.draft !== null && (
                  <div className={css.wsPreview} style={{ flex: 1, minHeight: 0 }}>
                    <div className={css.busyRow}>
                      <span className={css.meta}>优化预览（{workspace.draft.length} 字）</span>
                      <span style={{ display: 'flex', gap: 'var(--nf-space-8)' }}>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWsShowDiff(v => !v) }}>
                          {wsShowDiff ? '显示文本' : '查看对比'}
                        </button>
                      </span>
                    </div>
                    {wsShowDiff
                      ? <DiffList original={workspace.original} draft={workspace.draft} fontSize={editorFontSize} />
                      : <pre className={css.wsPreviewText} style={{ fontSize: editorFontSize }}>{workspace.draft}</pre>}
                    <span className={css.meta}>满意后点上方「✅ 应用并保存」落盘（原稿自动备份 .bak）；不满意可继续修订。</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 编辑页打开时独占整页：隐藏其余所有页面内容 */}
        {workspace === null && (<>
        {activeTab === 'workflow' && (
          <>
            {/* ⭐ 主行动大卡片 */}
            <div className={css.dashHero}>
              <div className={css.dashHeroEyebrow}>
                <span className={css.dashHeroSparkle}>✨</span>
                {nextAction?.eyebrow ?? '开始'}
              </div>
              {project !== null && (
                <div className={css.dashHeroTitle}>
                  <span className={css.meta}>正在创作</span>
                  <h3 className={css.dashHeroBook}>《{project.bookName}》</h3>
                </div>
              )}
              {nextAction !== null && (
                <div className={css.dashHeroAction}>
                  <span className={css.dashHeroArrow}>→</span>
                  <div className={css.dashHeroActionBody}>
                    <div className={css.dashHeroActionTitle}>{nextAction.title}</div>
                    <div className={css.meta}>{nextAction.reason}</div>
                  </div>
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { nextAction.onClick() }}>
                    {nextAction.actionLabel}
                  </button>
                </div>
              )}
              {/* 问编辑老师：把拆书/导演/知识库/待办交给 AI 编辑 Agent */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
                <button type="button" className={css.button} onClick={() => { setAssistantOpen(true) }}>💬 问 AI 编辑 Agent</button>
                <span className={css.meta}>拆书 / 自动导演 / 知识库 / 待办，一句话交给它帮你跑。</span>
              </div>
              {/* 创作旅程进度 */}
              <div className={css.dashJourney}>
                <div className={css.busyRow}>
                  <span className={css.meta} style={{ fontWeight: 600 }}>创作旅程</span>
                  <span className={css.meta}>{journeyPercent}% · 已完成 {journeyDoneCount}/{journeyStages.length} 步</span>
                </div>
                <div className={css.tlBar}>
                  {journeyStages.map(stage => (
                    <button
                      key={stage.id}
                      type="button"
                      className={`${css.tlSeg} ${stage.done ? css.tlSegDone : stage.id === currentStageId ? css.tlSegCurrent : css.tlSegTodo}`}
                      title={`${stage.label}${stage.done ? ' · 已完成' : stage.id === currentStageId ? ' · 进行中' : ' · 未开始'}（点击跳转）`}
                      onClick={() => { jumpToStage(stage.id) }}
                    >
                      <span className={css.tlSegTrack}><span className={css.tlSegFill} /></span>
                      <span className={css.tlSegLabel}>{stage.done ? '✓ ' : ''}{stage.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 统计卡（demo 风格：今日待写 / 写作中 / 已通过 / 待审稿） */}
            <div className={css.statRowD}>
              <div className={css.statCardD}>
                <div style={{ minWidth: 0 }}>
                  <div className={css.statCardDLabel}>今日待写</div>
                  <div className={css.statCardDValue}>{pendingCount} <span className={css.statCardDUnit}>章</span></div>
                  <div className={css.statCardDDetail}>
                    {chapters.some(c => c.status === 'error') ? `含 error ${chapters.filter(c => c.status === 'error').length} 章` : '待生成队列'}
                  </div>
                </div>
                <div className={css.statCardDIcon}>📝</div>
              </div>
              <div className={css.statCardD}>
                <div style={{ minWidth: 0 }}>
                  <div className={css.statCardDLabel}>写作中</div>
                  <div className={css.statCardDValue}>{chapters.filter(c => c.status === 'generating' || c.status === 'reviewing').length} <span className={css.statCardDUnit}>章</span></div>
                  <div className={css.statCardDDetail}>{writingNow !== undefined ? `第 ${writingNow.no} 章 · ${writingNow.title}` : '无进行中任务'}</div>
                </div>
                <div className={css.statCardDIcon}>✍️</div>
              </div>
              <div className={css.statCardD}>
                <div style={{ minWidth: 0 }}>
                  <div className={css.statCardDLabel}>已通过</div>
                  <div className={css.statCardDValue}>{approvedCount} <span className={css.statCardDUnit}>章</span></div>
                  <div className={css.statCardDDetail}>{chapters.length > 0 ? `占全书 ${Math.round((approvedCount / chapters.length) * 100)}%` : '尚无已通过章节'}</div>
                </div>
                <div className={css.statCardDIcon}>✅</div>
              </div>
              <div className={css.statCardD}>
                <div style={{ minWidth: 0 }}>
                  <div className={css.statCardDLabel}>待审稿</div>
                  <div className={css.statCardDValue}>{reviewPendingCount} <span className={css.statCardDUnit}>章</span></div>
                  <div className={`${css.statCardDDetail} ${reviewPendingCount > 0 ? css.statCardDDown : ''}`}>
                    {`written ${chapters.filter(c => c.status === 'written').length} · rejected ${chapters.filter(c => c.status === 'rejected').length}`}
                  </div>
                </div>
                <div className={`${css.statCardDIcon} ${css.statCardDIconRed}`}>⚠️</div>
              </div>
            </div>
            {/* 补充统计：总字数 / 当前卷 / 最近创作（原有数据保留） */}
            <div className={css.assetGrid}>
              <StatCell label="总字数" value={String(totalChars)} detail="已生成正文累计" />
              <StatCell label="当前卷" value={currentVolumeName} valueFontSize={13} detail="正在推进的卷" />
              <StatCell label="最近创作" value={lastUpdated} valueFontSize={13} detail="最近生成/编辑时间" />
            </div>

            {/* 资产健康：独占一行（道藏/卷计划/写作资产/伏笔 + 全书质检） */}
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between' }}>
                <span className={css.cardTitle}>资产健康</span>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || doneCount === 0} onClick={() => { void handleAudit() }} title="LLM 扫描全本已生成章节，检查人名/境界/资源/时间线矛盾">
                  🔍 全书质检
                </button>
              </div>
              {auditStatus?.status === 'running' && (
                <div className={css.meta} style={{ marginTop: 'var(--nf-space-8)' }}>
                  🔍 全书质检中：{auditStatus.completedBatches}/{auditStatus.totalBatches > 0 ? auditStatus.totalBatches : '…'} 批
                  {auditStatus.totalBatches > 0 && (
                    <div className={css.dashJourneyBar} style={{ marginTop: 'var(--nf-space-4)' }}>
                      <div className={css.dashJourneyFill} style={{ width: `${Math.round((auditStatus.completedBatches / auditStatus.totalBatches) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
              {auditStatus?.status === 'error' && auditStatus.error !== undefined && (
                <div className={css.meta} style={{ color: 'var(--nf-error)', marginTop: 'var(--nf-space-8)' }}>全书质检失败：{auditStatus.error}</div>
              )}
              <div className={css.assetGrid}>
                <StatCell
                  label="道藏"
                  value={bible !== undefined ? `✓ ${bible.worldRules.length} 条规则` : '未生成'}
                  valueColor={bible !== undefined ? 'var(--nf-success)' : 'var(--nf-text-3)'}
                  detail={bible !== undefined ? `${bible.characters.length} 人物 · ${bible.redLines.length} 红线` : '提炼人设 / 世界观 / 金手指'}
                />
                <StatCell
                  label="卷计划"
                  value={volumes !== undefined ? `${volumes.length} 卷` : '未生成'}
                  valueColor={volumes !== undefined ? 'var(--nf-success)' : 'var(--nf-text-3)'}
                  detail={volumes !== undefined ? volumes.map(v => v.title).join(' / ') : '按剧情弧线划分全书'}
                  detailTitle={volumes?.map(v => v.title).join(' / ')}
                />
                <StatCell
                  label="写作资产"
                  value={`${assetCount} 项`}
                  valueColor={assetCount > 0 ? 'var(--nf-success)' : 'var(--nf-text-3)'}
                  detail={assetSummary}
                  detailTitle={assetSummary}
                />
                <StatCell
                  label="伏笔"
                  value={`${foreshadows.length} 条`}
                  detail={`${foreshadows.filter(f => f.status === 'planned').length} 待埋 · ${foreshadows.filter(f => f.status === 'resolved').length} 已回收`}
                />
              </div>
            </div>

            {/* 剧情线进度 | 作者复盘趋势：精简摘要卡，并排（点击跳转详情页） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--nf-space-14)', alignItems: 'stretch' }}>
              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className={css.cardTitle}>🧵 {tt('plotlines.workflowTitle')}（{(project?.plotlines ?? []).length} 条）</span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setActiveTab('plotlines') }} title="查看完整剧情线管理页">
                    查看全部 →
                  </button>
                </div>
                {(() => {
                  const all = project?.plotlines ?? []
                  const active = all.filter(l => l.status === 'active').length
                  const paused = all.filter(l => l.status === 'paused').length
                  const resolved = all.filter(l => l.status === 'resolved').length
                  const main = all.find(l => l.kind === 'main' && l.status === 'active')
                  const withLinks = all.filter(l => l.chapters.length > 0)
                  const latest = withLinks.sort((a, b) => Math.max(...b.chapters) - Math.max(...a.chapters))[0]
                  if (all.length === 0) return <span className={css.meta}>{tt('plotlines.workflowEmpty')}</span>
                  return (
                    <span className={css.meta}>
                      {active} 推进中 · {paused} 暂停 · {resolved} 已完结
                      {main !== undefined && <> · 主线：{main.name}</>}
                      {latest !== undefined && <> · 最近推进：{latest.name}（第 {Math.max(...latest.chapters)} 章）</>}
                    </span>
                  )
                })()}
              </div>

              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className={css.cardTitle}>📋 作者复盘（最近 {Math.min(6, chapters.filter(c => c.authorReview !== undefined).length)} 章）</span>
                  <div className={css.row}>
                    {(() => {
                      const missing = chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error' && c.authorReview === undefined).length
                      return missing > 0 && (
                        <button
                          type="button"
                          className={`${css.button} ${css.buttonSmall}`}
                          disabled={busy}
                          onClick={() => { void handleAuthorBackfillAll() }}
                          title="对历史已写章节逐章补跑作者复盘（不重新生成正文，每章约 2000 token）"
                        >
                          ↻ 补齐（{missing}）
                        </button>
                      )
                    })()}
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setActiveTab('book'); changeBookTab('facts'); changeArchiveTab('reviews') }} title="查看按卷分组的全部复盘记录">
                      查看全部 →
                    </button>
                  </div>
                </div>
                {(() => {
                  const reviewed = chapters.filter(c => c.authorReview !== undefined)
                  if (reviewed.length === 0) {
                    return <span className={css.meta}>尚无作者复盘——生成/审稿后自动生成，或点「补齐」为已写章节补跑。</span>
                  }
                  const honored = reviewed.filter(c => c.authorReview!.hookHonored).length
                  const avg = Math.round(reviewed.reduce((s, c) => s + c.authorReview!.endingHook, 0) / reviewed.length * 10) / 10
                  const last = reviewed[reviewed.length - 1]!
                  return (
                    <span className={css.meta}>
                      钩子兑现 {honored}/{reviewed.length} · 结尾钩子均分 {avg} · 最近：第 {last.no} 章（钩子{last.authorReview!.hookHonored ? '✓' : '✗'} {last.authorReview!.endingHook}/10）
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* 全书质检结果 */}
            {auditIssues !== null && (
              <div className={css.card} style={{ borderColor: auditIssues.length > 0 ? 'var(--nf-error)' : 'var(--nf-success)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between' }}>
                  <span className={css.cardTitle}>
                    🔍 全书质检{auditIssues.length === 0 ? '：未发现矛盾 🎉' : `：${auditIssues.length} 处疑似矛盾`}
                  </span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setAuditIssues(null) }}>
                    收起
                  </button>
                </div>
                {auditIssues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
                    {auditIssues.map((issue, i) => (
                      <AuditIssueRow
                        key={i}
                        issue={issue}
                        disabled={busy}
                        onFix={() => { void openWorkspace(issue.chapterNo, `按质检意见修订：${issue.item}（建议：${issue.suggestion}）`) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 待办队列（活动输出已移入「工具 → AI进度」悬浮窗） */}
            <div className={css.card}>
              <span className={css.cardTitle}>待办队列</span>
              {todos.length === 0 ? (
                <span className={css.meta}>🎉 暂无待办，一切顺畅</span>
              ) : (
                todos.map((todo, i) => (
                  <TodoRow
                    key={i}
                    tone={todo.tone}
                    title={todo.title}
                    description={todo.description}
                    actionLabel={todo.actionLabel}
                    disabled={busy}
                    onAction={todo.onClick}
                  />
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'overview' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between' }}>
                <span className={css.cardTitle}>{tt('tab.overview')}</span>
                {project !== null && (
                  <div className={css.row}>
                    <span className={css.meta}>
                      {tt('overview.bookName')}: {project.bookName} · {project.outline.length} 字
                      {project.outlinePath !== undefined && <span> · {project.outlinePath}</span>}
                    </span>
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonPrimary}`}
                      disabled={busy || !(project.chapters ?? []).some(c => c.status === 'written' || c.status === 'approved' || c.status === 'rejected')}
                      onClick={() => { void handleReverseOutline() }}
                      title="从已写章节正文反向生成全书总纲（覆盖当前大纲文本）"
                    >
                      🔄 反推大纲
                    </button>
                    <button type="button" className={css.button} disabled={busy} onClick={() => { handleToggleUpdateOutline() }}>
                      {updatingOutline ? '收起' : '更新大纲'}
                    </button>
                  </div>
                )}
              </div>
              {project === null ? (
                <>
                  {/* 未开书：导入大纲（开书动作） */}
                  <div
                    className={`${css.dropzone} ${dragActive ? css.dropzoneActive : ''}`}
                    onClick={() => { fileInputRef.current?.click() }}
                    onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => { setDragActive(false) }}
                    onDrop={e => {
                      e.preventDefault()
                      setDragActive(false)
                      const file = e.dataTransfer.files?.[0]
                      if (file !== undefined) void handleDocxFile(file)
                    }}
                  >
                    <span className={css.dropzoneIcon}>📄</span>
                    <span>点击选择本机 docx 大纲，或将文件拖到这里</span>
                    <span className={css.meta}>也支持粘贴文本到下方编辑区</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file !== undefined) void handleDocxFile(file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                    <span className={css.meta}>{tt('overview.outlineChars')}: {outlineText.length}</span>
                    <button type="button" className={css.button} disabled={busy || outlineText.length < 50} onClick={() => { void handleSaveOutline() }}>
                      {tt('overview.saveOutline')}
                    </button>
                  </div>
                  <textarea
                    className={css.textarea}
                    value={outlineText}
                    placeholder={tt('overview.outlineHint')}
                    onChange={e => { setOutlineText(e.target.value) }}
                    spellCheck={false}
                  />
                </>
              ) : updatingOutline ? (
                <>
                  <div className={css.meta}>
                    大纲是本书的「出生证明」。更新时请二选一：<b>仅更新文本</b>（保留设定/章节/正文全部进度），或
                    <b>重置项目</b>（从新总纲重新开始，清空道藏/卷/章节/正文/暗线/资产/编年录，不可恢复）。
                  </div>
                  <textarea
                    className={css.textarea}
                    value={outlineText}
                    placeholder="粘贴新版大纲文本…"
                    onChange={e => { setOutlineText(e.target.value) }}
                    spellCheck={false}
                  />
                  <div className={css.row}>
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || outlineText.length < 50} onClick={() => { void handleSaveOutline() }}>
                      仅更新文本（保留进度）
                    </button>
                    <button type="button" className={`${css.button} ${css.buttonDanger}`} disabled={busy || outlineText.length < 50} onClick={() => { void handleResetProject() }}>
                      重置项目并更新（清空进度）
                    </button>
                    <span className={css.meta}>{outlineText.length} 字</span>
                  </div>
                </>
              ) : (
                /* 只读展示：大纲是开书时的出生证明 */
                <>
                <div className={css.meta} style={{ marginBottom: 'var(--nf-space-6)' }}>
                  大纲是本书的「出生证明」；已写章节可点右上角「🔄 反推大纲」从正文反推，或「更新大纲」手动修订。
                </div>
                <pre className={css.outlineReadonly}>{project.outline}</pre>
                </>
              )}
            </div>
            <div className={css.card}>
              <span className={css.cardTitle}>{tt('status.files')}（{generatedFiles.length}）</span>
              <div className={css.fileList}>
                {generatedFiles.length === 0 && <span>{tt('status.projectNone')}</span>}
                {generatedFiles.map(file => <span key={file}>{file}</span>)}
              </div>
            </div>
          </>
        )}

        {/* 卷首语：面向读者的作品门面 */}
        {activeTab === 'blurb' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>📖 简介 / 封面</span>
              <div className={css.row}>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || project === null} onClick={() => { void handleBlurbGenerate() }}>
                  ✨ AI 生成
                </button>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || project === null || blurbDraft.trim() === ''} onClick={() => { void handleBlurbComplete() }}>
                  ✍️ AI 补全
                </button>
                {project?.blurb !== undefined && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall}`}
                    disabled={busy || project === null}
                    onClick={() => {
                      if (window.confirm('重新生成会覆盖当前简介（可先复制保存），确定？')) void handleBlurbGenerate()
                    }}
                  >
                    🔄 重新生成
                  </button>
                )}
              </div>
            </div>
            {/* 书名（可改名，同步书架） */}
            <div className={css.row}>
              <input
                className={css.input}
                style={{ flex: 1, maxWidth: 320 }}
                placeholder="书名"
                value={bookNameDraft}
                onChange={e => { setBookNameDraft(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') void handleRename() }}
              />
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || bookNameDraft.trim() === '' || bookNameDraft.trim() === project?.bookName}
                onClick={() => { void handleRename() }}
              >
                💾 改书名
              </button>
            </div>
            {/* 封面 */}
            <div className={css.row} style={{ alignItems: 'flex-start', gap: 'var(--nf-space-14)' }}>
              <div className={css.coverPreview}>
                {coverDataUrl !== null ? (
                  <img src={coverDataUrl} alt="封面" />
                ) : (
                  <span className={css.coverPlaceholder}>暂无封面</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || project === null} onClick={() => { coverFileRef.current?.click() }}>
                    📤 上传封面
                  </button>
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      handleCoverUpload(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  {coverDataUrl !== null && (
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleCoverRemove() }}>
                      🗑️ 移除
                    </button>
                  )}
                </div>
                <span className={css.meta}>支持 PNG / JPG / WebP，建议 3:4 竖版；保存于输出目录 cover.*。</span>
              </div>
            </div>
            <span className={css.meta}>
              面向读者的作品门面（120-250 字）：突出核心卖点与开局钩子，不剧透。点击 ✨AI 生成全量生成；或先写几句再点 ✍️AI 补全续写完整；不满意可 🔄 重新生成。
            </span>
            {project === null ? (
              <span className={css.meta}>请先在大纲页导入大纲建立项目。</span>
            ) : (
              <>
                <textarea
                  className={css.textarea}
                  style={{ minHeight: 140 }}
                  placeholder="点击 ✨AI 生成，或先写下开头几句，再点 ✍️AI 补全…"
                  value={blurbDraft}
                  onChange={e => { setBlurbDraft(e.target.value) }}
                  spellCheck={false}
                />
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || blurbDraft.trim() === ''} onClick={() => { void handleBlurbSave() }}>
                    💾 保存简介
                  </button>
                  <span className={css.meta}>
                    {blurbDraft.length} 字 · 已保存：{project.blurb !== undefined ? `${project.blurb.length} 字` : '无'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className={css.cardTitle}>{tt('tab.plan')}</span>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>{tt('plan.generateHint')}</span>
                  <input
                    className={css.input}
                    style={{ width: 72 }}
                    type="number"
                    min={1}
                    max={200}
                    value={planCount}
                    onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v)) setPlanCount(v) }}
                  />
                  <span className={css.meta}>{tt('plan.count')}</span>
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || outlineText.length < 50} onClick={() => { void handlePlan() }}>
                    {tt('plan.generate')}
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || doneCount === 0} onClick={() => { void handleSensitiveScan() }} title={tt('sensitive.hint')}>
                    🔞 {tt('sensitive.scanAll')}
                  </button>
                </div>
              </div>
            </div>

            {sensHits !== null && (
              <div className={css.card} style={{ borderColor: sensHits.length > 0 ? 'var(--nf-warn)' : 'var(--nf-success)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className={css.cardTitle}>
                    {sensHits.length === 0
                      ? tt('sensitive.clean', { n: sensScanned })
                      : tt('sensitive.hits', { n: sensHits.length, chapters: new Set(sensHits.map(h => h.chapterNo)).size })}
                  </span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setSensHits(null) }}>收起</button>
                </div>
                <span className={css.meta}>{tt('sensitive.hint')}</span>
                {sensHits.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', maxHeight: 300, overflowY: 'auto', fontSize: 'var(--nf-fs-12)' }}>
                    {sensHits.map((hit, i) => (
                      <div key={i} style={{ display: 'flex', gap: 'var(--nf-space-8)', alignItems: 'flex-start', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-4) var(--nf-space-8)' }}>
                        <span className={css.badge} style={{ borderColor: 'var(--nf-warn)', color: 'var(--nf-warn)', flex: 'none' }}>
                          {hit.chapterNo > 0 ? `第${hit.chapterNo}章` : '文本'}
                        </span>
                        <span className={css.meta} style={{ flex: 1 }}>
                          <b style={{ color: 'var(--nf-error)' }}>{hit.word}</b> ×{hit.count} · [{hit.category}]
                        </span>
                        {hit.chapterNo > 0 && (
                          <button
                            type="button"
                            className={`${css.button} ${css.buttonSmall}`}
                            disabled={busy}
                            onClick={() => { void openWorkspace(hit.chapterNo, tt('sensitive.fixPrefill', { word: hit.word, category: hit.category })) }}
                          >
                            {tt('sensitive.goFix')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chapters.length > 0 && (
              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                    {(volumes !== undefined && volumes.length > 0) && (
                      <>
                        <button
                          type="button"
                          className={`${css.button} ${css.buttonSmall} ${selectedVolume === 'all' ? css.buttonPrimary : ''}`}
                          onClick={() => { setSelectedVolume('all') }}
                        >
                          全部卷
                        </button>
                        {volumes.map(v => (
                          <button
                            key={v.no}
                            type="button"
                            className={`${css.button} ${css.buttonSmall} ${selectedVolume === v.no ? css.buttonPrimary : ''}`}
                            onClick={() => { setSelectedVolume(v.no) }}
                            title={`第${v.no}卷 · ${v.chapterStart}-${v.chapterEnd} 章`}
                          >
                            {v.no}. {v.title}（{v.chapterStart}-{v.chapterEnd}）
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  {pendingCount > 0 && (
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWriteAll() }}>
                      {tt('plan.writeAllPending')}（{pendingCount}）
                    </button>
                  )}
                </div>
                <div className={css.chapterList}>
                  {chapterGroups.filter(g => selectedVolume === 'all' || g.no === selectedVolume).map(group => {
                    const collapsed = group.no !== 0 && collapsedVolumes.includes(group.no)
                    const groupDone = group.chapters.filter(c => c.status === 'approved' || c.status === 'written' || c.status === 'rejected').length
                    return (
                      <div key={group.no} className={css.volumeGroup}>
                        <div
                          className={css.volumeGroupHeader}
                          onClick={() => {
                            if (group.no !== 0) {
                              setCollapsedVolumes(prev => prev.includes(group.no) ? prev.filter(x => x !== group.no) : [...prev, group.no])
                            }
                          }}
                        >
                          <span className={css.volumeGroupToggle}>{group.no !== 0 ? (collapsed ? '▸' : '▾') : '📖'}</span>
                          <b>{group.title}</b>
                          <span className={css.meta}>（{group.chapters.length} 章 · 已完成 {groupDone}）</span>
                        </div>
                        {!collapsed && group.chapters.map(chapter => {
                    const badge = statusBadge(chapter)
                    const expanded = expandedChapter === chapter.no
                    const review: ReviewReport | undefined = chapter.review
                    return (
                      <div key={chapter.no} className={css.chapter} data-chapter-no={chapter.no}>
                        <span className={css.chapterNum}>{chapter.no}</span>
                        <div className={css.chapterMain}>
                          <div className={css.chapterTitle}>
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ padding: 'var(--nf-space-2) var(--nf-space-6)' }} onClick={() => { void handleToggleChapter(chapter.no) }}>
                              {expanded ? '−' : '+'}
                            </button>
                            <span>{chapter.title}</span>
                            {chapter.status === 'approved' && chapter.chars !== undefined && (
                              <span className={css.meta}>{chapter.chars}{tt('common.chars')}</span>
                            )}
                            {chapter.volume > 0 && <span className={css.meta}>{tt('plan.volumes')}{chapter.volume}</span>}
                          </div>
                          {!expanded && <div className={css.chapterBeats} title={chapter.beats}>{chapter.beats}</div>}
                          {expanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
                              <div className={css.meta}><b>{tt('plan.beats')}:</b></div>
                              <div className={css.meta}>{renderBeats(chapter.beats)}</div>
                              {chapter.summary !== undefined && chapter.summary !== '' && (
                                <div className={css.meta}><b>{tt('plan.summary')}:</b> {chapter.summary}</div>
                              )}
                              <pre className={css.chapterPreview}>{chapterText || `（${tt('common.loading')}）`}</pre>
                              {review !== undefined && (
                                <div className={css.reviewBox}>
                                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                                    <b>{tt('plan.reviewReport')}</b>
                                    <span style={{ color: review.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                                      {tt('plan.reviewScore')}: {review.score} — {review.passed ? tt('plan.reviewPass') : tt('plan.reviewFail')}
                                    </span>
                                  </div>
                                  <div className={css.meta}><b>{tt('plan.reviewVerdict')}:</b> {review.verdict}</div>
                                  {review.riskScore !== undefined && (
                                    <div className={css.meta}><b>风险分:</b> {review.riskScore}/100</div>
                                  )}
                                  {review.aiFlavor !== undefined && (
                                    <div className={css.meta}><b>AI 味指数:</b> {review.aiFlavor}/100{(review.aiPhrases?.length ?? 0) > 0 && ` · 套话：` + review.aiPhrases.map(p => `${p.word}×${p.count}`).join('、')}</div>
                                  )}
                                  {review.issues.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: 'var(--nf-space-18)', fontSize: 'var(--nf-fs-12)' }}>
                                      {review.issues.map((issue, i) => (
                                        <li key={i} style={{ color: severityColor(issue.severity) }}>
                                          [{issue.severity}{issue.dimension !== undefined ? ` · ${REVIEW_DIM_ZH[issue.dimension] ?? issue.dimension}` : ''}] {issue.item} → {issue.suggestion}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                              {chapter.authorReview === undefined && chapter.status !== 'pending' && chapter.status !== 'generating' && chapter.status !== 'error' && (
                                <div className={css.row}>
                                  <button
                                    type="button"
                                    className={`${css.button} ${css.buttonSmall}`}
                                    disabled={busy}
                                    onClick={() => { void handleAuthorBackfillChapter(chapter.no) }}
                                    title="对该章补跑一次作者复盘（读取已落盘正文，不重新生成）"
                                  >
                                    📋 生成作者复盘
                                  </button>
                                </div>
                              )}
                              {chapter.authorReview !== undefined && (
                                <div className={css.reviewBox} style={{ borderColor: 'color-mix(in srgb, var(--nf-info) 45%, transparent)' }}>
                                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                                    <b>📋 作者复盘</b>
                                    <span style={{ color: chapter.authorReview.hookHonored ? 'var(--nf-success)' : 'var(--nf-warn)' }}>
                                      钩子{chapter.authorReview.hookHonored ? '已兑现 ✓' : '未兑现 ✗'} · 结尾钩子 {chapter.authorReview.endingHook}/10
                                    </span>
                                  </div>
                                  {chapter.authorReview.hookNote !== '' && (
                                    <div className={css.meta}><b>钩子：</b>{chapter.authorReview.hookNote}</div>
                                  )}
                                  {chapter.authorReview.plotlineProgress !== '' && (
                                    <div className={css.meta}><b>推进：</b>{chapter.authorReview.plotlineProgress}</div>
                                  )}
                                  {chapter.authorReview.continuity !== '' && (
                                    <div className={css.meta}><b>衔接：</b>{chapter.authorReview.continuity}</div>
                                  )}
                                  {chapter.authorReview.trend !== '' && (
                                    <div className={css.meta}><b>趋势：</b>{chapter.authorReview.trend}</div>
                                  )}
                                </div>
                              )}
                              {(chapter.status === 'rejected' || chapter.status === 'written' || chapter.status === 'approved') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
                                  <div className={css.meta} style={{ fontWeight: 600 }}>
                                    润色 / 修订 — 在右上角打开工作区：左栏原文可直接选中文字做局部修订，右栏输入指令后预览，确认后再应用（未应用不改动原稿）
                                  </div>
                                  <div className={css.row}>
                                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }}>
                                      {tt('plan.rewrite')} / {tt('plan.polish')}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <span className={`${css.badge} ${badge.cls}`}>{badge.label}</span>
                        <div className={css.chapterActions}>
                          {(chapter.status === 'pending' || chapter.status === 'error') && (
                            <button
                              type="button"
                              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                              disabled={busy || busyAny}
                              onClick={() => { void handleWriteChapter(chapter.no, true) }}
                            >
                              {tt('plan.write')}
                            </button>
                          )}
                          {chapter.status === 'generating' && (
                            <button
                              type="button"
                              className={`${css.button} ${css.buttonSmall}`}
                              disabled={busy}
                              onClick={() => { void handleChapterReset(chapter.no) }}
                              title="生成卡死/中断时可复位为待生成，重新生成"
                            >
                              🔄 复位
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleReview(chapter.no) }}>
                              {tt('plan.review')}
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleChapterApprove(chapter.no) }} title="作者行使最终决定权：直接通过（不重审，保留审稿记录，落盘保存）">
                              ✔ 直接通过
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected' || chapter.status === 'approved') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }} title="手动编辑正文 → AI 审查 → 保存">
                              ✏️ 编辑
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected' || chapter.status === 'approved') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }}>
                              {tt('plan.polish')}
                            </button>
                          )}
                          {chapter.status === 'rejected' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleReviseNow(chapter.no) }} title="一键按该章审稿意见全部修订（high 优先，无需进工作区选择）；修订完自动打开工作区看草稿与审查">
                              按意见修订
                            </button>
                          )}
                          {chapter.status === 'rejected' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleWriteChapter(chapter.no, true) }} title="整章重新生成">
                              重新生成
                            </button>
                          )}
                        </div>
                      </div>
                    )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'book' && (
          <div className={css.card} style={{ gap: 'var(--nf-space-12)' }}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>📚 本书设定</span>
              <span className={css.meta}>结构化设定/道藏（世界观·角色·境界·红线）。零散补充资料请用「工具 → 知识库」。</span>
            </div>
            <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
              <button
                type="button"
                className={`${css.button} ${bookTab === 'bible' ? css.buttonPrimary : ''}`}
                style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                onClick={() => { changeBookTab('bible') }}
                title="设定库：题材 / 世界观规则 / 人物摘要 / 红线 / 文风"
              >
                📖 设定库
              </button>
              <button
                type="button"
                className={`${css.button} ${bookTab === 'world' ? css.buttonPrimary : ''}`}
                style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                onClick={() => { changeBookTab('world') }}
                title="大世界：境界体系 / 地理区域 / 势力分布（注入生成与审稿提示词）"
              >
                🌍 大世界
              </button>
              <button
                type="button"
                className={`${css.button} ${bookTab === 'roles' ? css.buttonPrimary : ''}`}
                style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                onClick={() => { changeBookTab('roles') }}
                title="角色库：全书角色主表（定位 / 关系网 / 成长线 / 知情度）"
              >
                👥 角色库（{project?.roles?.length ?? 0}）
              </button>
              <button
                type="button"
                className={`${css.button} ${bookTab === 'facts' ? css.buttonPrimary : ''}`}
                style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                onClick={() => { changeBookTab('facts') }}
                title="编年录与复盘记录"
              >
                📚 编年 / 复盘
              </button>
            </div>
          </div>
        )}
        {activeTab === 'book' && bookTab === 'bible' && (
          <>
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>{tt('bible.title')}</span>
              <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleBible() }}>
                {tt('bible.gen')}
              </button>
            </div>
            {bible === undefined ? (
              <span className={css.meta}>{tt('bible.none')}</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
                {bible.genre !== '' && (
                  <div><b>{tt('bible.genre')}:</b> <span className={css.meta}>{bible.genre}</span></div>
                )}
                {/* 世界观规则独立卡片（可编辑，每行一条） */}
                {bible.worldRules.length > 0 && (
                  <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)' }}>
                    <div className={css.row} style={{ justifyContent: 'space-between' }}>
                      <b>{tt('bible.worldRules')}（{bible.worldRules.length}）</b>
                      <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorldRulesDraft(bible.worldRules.join('\n')) }}>
                        编辑
                      </button>
                    </div>
                    {worldRulesDraft !== '' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginTop: 'var(--nf-space-6)' }}>
                        <textarea
                          className={css.textarea}
                          style={{ minHeight: 120 }}
                          value={worldRulesDraft}
                          onChange={e => { setWorldRulesDraft(e.target.value) }}
                          placeholder="每条规则一行…"
                        />
                        <div className={css.row}>
                          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSaveWorldRules() }}>
                            保存规则
                          </button>
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorldRulesDraft('') }}>
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {worldRulesDraft === '' && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 'var(--nf-space-18)', fontSize: 'var(--nf-fs-12)' }}>{bible.worldRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    )}
                  </div>
                )}
                {bible.characters.length > 0 && (
                  <div>
                    <b>{tt('bible.characters')}（{bible.characters.length}）</b>
                    {bible.characters.map(card => (
                      <div key={card.name} style={{ marginTop: 'var(--nf-space-4)', fontSize: 'var(--nf-fs-12)' }}>
                        <b>{card.name}</b> <span className={css.meta}>[{card.role}] {card.traits.join('、')}</span>
                        {card.goals !== '' && <div className={css.meta}>目标：{card.goals}</div>}
                        {card.relations !== '' && <div className={css.meta}>关系：{card.relations}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {bible.redLines.length > 0 && (
                  <div>
                    <b>{tt('bible.redLines')}（{bible.redLines.length}）</b>
                    <ul style={{ margin: 0, paddingLeft: 'var(--nf-space-18)', fontSize: 'var(--nf-fs-12)', color: 'var(--nf-error)' }}>{bible.redLines.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                {bible.style.length > 0 && (
                  <div>
                    <b>{tt('bible.style')}（{bible.style.length}）</b>
                    <ul style={{ margin: 0, paddingLeft: 'var(--nf-space-18)', fontSize: 'var(--nf-fs-12)' }}>{bible.style.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
        )}

        {/* 大世界：境界体系 / 区域 / 势力 */}
        {activeTab === 'book' && bookTab === 'world' && (
          <WorldTab
            api={api}
            world={project?.world}
            onChanged={w => {
              setProject(prev => prev === null ? prev : { ...prev, world: w, updatedAt: new Date().toISOString() })
              pushProgress(`大世界已保存：${w.realms.length} 境界 · ${w.regions.length} 区域 · ${w.factions.length} 势力`, 'done')
            }}
          />
        )}

        {/* 角色库：全书角色主表（独立导航页） */}
        {activeTab === 'book' && bookTab === 'roles' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>👥 角色库（{(project?.roles ?? []).length} 个）</span>
              <div className={css.row}>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || (project?.facts ?? []).length === 0}
                  onClick={() => { void handleCharactersRefresh() }}
                  title="从编年录聚合各角色当前状态（境界/伤势/心境/出场统计），显示在每张卡上"
                >
                  ↻ 从编年录刷新状态
                </button>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                  disabled={busy || doneCount === 0}
                  onClick={() => { void handleRolesExtract() }}
                  title="AI 扫描大纲/编年录/已写章节，提炼完整角色库（含女主/女配/反派定位）"
                >
                  ✨ 从全书提炼角色
                </button>
              </div>
            </div>
            <span className={css.meta}>角色库是全书角色主表：定位（女主/女配/配角/反派）、身份、关系网、成长线、知情度——生成与审稿都会按定位规格刻画互动。点「从编年录刷新状态」可在每张卡上显示角色当前状态。</span>

            {roleCandidates !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', border: '1px solid var(--nf-info)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <b>✨ AI 提炼候选（{roleCandidates.length}）</b>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setRoleCandidates(null) }}>收起</button>
                </div>
                {roleCandidates.length === 0 && <span className={css.meta}>未提炼到角色。</span>}
                {roleCandidates.map((r, i) => (
                  <RoleCandidateRow
                    key={i}
                    candidate={r}
                    disabled={busy}
                    onAdopt={() => { void handleRoleAdopt(r) }}
                    onEdit={() => { setRoleDraft(r) }}
                  />
                ))}
              </div>
            )}

            {roleDraft !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <div className={css.field} style={{ flex: 1, minWidth: 140 }}>
                    <label className={css.fieldLabel}>角色名</label>
                    <input className={css.input} value={roleDraft.name} onChange={e => { setRoleDraft({ ...roleDraft, name: e.target.value }) }} />
                  </div>
                  <div className={css.field} style={{ flex: 1 }}>
                    <label className={css.fieldLabel}>定位</label>
                    <select className={css.input} value={roleDraft.roleLabel} onChange={e => { setRoleDraft({ ...roleDraft, roleLabel: e.target.value as RoleRecord['roleLabel'] }) }}>
                      <option value="protagonist">主角</option>
                      <option value="female_lead">女主</option>
                      <option value="female_support">女配</option>
                      <option value="support">配角</option>
                      <option value="antagonist">反派</option>
                      <option value="extra">路人</option>
                    </select>
                  </div>
                  <div className={css.field} style={{ flex: 2 }}>
                    <label className={css.fieldLabel}>身份</label>
                    <input className={css.input} value={roleDraft.identity} onChange={e => { setRoleDraft({ ...roleDraft, identity: e.target.value }) }} />
                  </div>
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>目标</label>
                  <textarea className={css.textarea} style={{ minHeight: 44 }} value={roleDraft.goals} onChange={e => { setRoleDraft({ ...roleDraft, goals: e.target.value }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>关系网（每行一条：角色名（关系））</label>
                  <textarea className={css.textarea} style={{ minHeight: 44 }} value={roleDraft.relations.join('\n')} onChange={e => { setRoleDraft({ ...roleDraft, relations: e.target.value.split('\n').map(l => l.trim()).filter(l => l !== '') }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>成长线（每行一条：阶段：说明）</label>
                  <textarea className={css.textarea} style={{ minHeight: 44 }} value={roleDraft.arc.join('\n')} onChange={e => { setRoleDraft({ ...roleDraft, arc: e.target.value.split('\n').map(l => l.trim()).filter(l => l !== '') }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>知情度（每行一条该角色知道的信息）</label>
                  <textarea className={css.textarea} style={{ minHeight: 44 }} value={roleDraft.knowledge.join('\n')} onChange={e => { setRoleDraft({ ...roleDraft, knowledge: e.target.value.split('\n').map(l => l.trim()).filter(l => l !== '') }) }} />
                </div>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleRoleSave() }}>
                    保存
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setRoleDraft(null) }}>取消</button>
                </div>
              </div>
            )}

            {(project?.roles ?? []).length === 0 ? (
              <span className={css.meta}>角色库为空——点「✨ 从全书提炼角色」自动建立，或手动新增。</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
                {(project?.roles ?? []).map(r => (
                  <RoleCard
                    key={r.name}
                    role={r}
                    status={(project?.roleStatus ?? []).find(s => s.name === r.name)}
                    disabled={busy}
                    onEdit={() => { setRoleDraft(r) }}
                    onRemove={() => { void handleRoleRemove(r.name) }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 写作资产 5 个子分类（左侧导航直达） */}
        {activeTab === 'assets' && <AssetsTab api={api} />}

        {activeTab === 'settings' && configDraft !== null && (
          <>
            {/* 设置页内子导航（大容器） */}
            <div className={`${css.card} ${css.settingsCard}`}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--nf-space-8)' }}>
                <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 700 }}>⚙️ 设置</span>
                <span className={css.meta}>当前：{config?.provider} / {config?.model} · {config?.outputDir}</span>
              </div>
              <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
                {SETTINGS_SECTIONS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${css.button} ${settingsTab === s.id ? css.buttonPrimary : ''}`}
                    style={{ fontSize: 'var(--nf-fs-14)', padding: 'var(--nf-space-8) var(--nf-space-12)', flex: 1, minWidth: 104, justifyContent: 'center' }}
                    onClick={() => { changeSettingsTab(s.id) }}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {settingsTab === 'model' && (
              <>
                <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-24)' }}>
                  <span className={css.cardTitle}><Brain size={18} style={{ verticalAlign: -3 }} /> 模型与推理</span>
                  <ModelManager
                    api={api}
                    provider={configDraft.provider}
                    model={configDraft.model}
                    savedModels={configDraft.savedModels ?? []}
                    onProvider={v => { setConfigDraft({ ...configDraft, provider: v }) }}
                    onModel={v => { setConfigDraft({ ...configDraft, model: v }) }}
                    onSavedModels={models => setConfigDraft({ ...configDraft, savedModels: models })}
                  />
                </div>
                <ReasoningSection
                  reasoningEffort={configDraft.reasoningEffort ?? 'off'}
                  analysisReasoning={configDraft.analysisReasoning ?? 'low'}
                  onChange={patch => setConfigDraft({ ...configDraft, ...patch })}
                />
                <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-24)' }}>
                  <span className={css.cardTitle}><Settings size={18} style={{ verticalAlign: -3 }} /> 任务级模型路由</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-24)' }}>
                    <div className={css.field}>
                      <label className={css.fieldLabel}>正文生成模型</label>
                      <input className={css.input} value={configDraft.generateModel ?? ''} placeholder={configDraft.model} onChange={e => setConfigDraft({ ...configDraft, generateModel: e.target.value })} />
                      <span className={css.meta}>留空则跟随全局模型（当前 {configDraft.model}）</span>
                    </div>
                    <div className={css.field}>
                      <label className={css.fieldLabel}>审稿模型</label>
                      <input className={css.input} value={configDraft.reviewModel ?? ''} placeholder={configDraft.model} onChange={e => setConfigDraft({ ...configDraft, reviewModel: e.target.value })} />
                      <span className={css.meta}>留空则跟随全局模型</span>
                    </div>
                    <div className={css.field}>
                      <label className={css.fieldLabel}>AI 复核/质检模型</label>
                      <input className={css.input} value={configDraft.auditModel ?? ''} placeholder={configDraft.model} onChange={e => setConfigDraft({ ...configDraft, auditModel: e.target.value })} />
                      <span className={css.meta}>留空则跟随全局模型</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {settingsTab === 'writing' && (
              <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-24)' }}>
                <span className={css.cardTitle}><PenLine size={18} style={{ verticalAlign: -3 }} /> 写作与审稿</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-24)' }}>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.chapterChars')}</label>
                    <input className={css.input} type="number" min={1000} max={20000} value={configDraft.chapterChars} onChange={e => { setConfigDraft({ ...configDraft, chapterChars: Number(e.target.value) }) }} />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.maxTokens')}</label>
                    <input className={css.input} type="number" min={2000} max={64000} value={configDraft.maxTokens} onChange={e => { setConfigDraft({ ...configDraft, maxTokens: Number(e.target.value) }) }} />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.reviewPassScore')}</label>
                    <input className={css.input} type="number" min={0} max={100} value={configDraft.reviewPassScore} onChange={e => { setConfigDraft({ ...configDraft, reviewPassScore: Number(e.target.value) }) }} />
                    <span className={css.meta}>通过判定：综合评分 ≥ 此分数（默认 70），或无 high 级问题且评分 ≥ 60；建议设 60-80。</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.autoReview')}</label>
                    <select
                      className={css.input}
                      value={configDraft.autoReview ? '1' : '0'}
                      onChange={e => { setConfigDraft({ ...configDraft, autoReview: e.target.value === '1' }) }}
                    >
                      <option value="1">✓ 是</option>
                      <option value="0">✗ 否</option>
                    </select>
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.autoAuthorReview')}</label>
                    <select
                      className={css.input}
                      value={configDraft.autoAuthorReview ? '1' : '0'}
                      onChange={e => { setConfigDraft({ ...configDraft, autoAuthorReview: e.target.value === '1' }) }}
                    >
                      <option value="1">✓ 是</option>
                      <option value="0">✗ 否</option>
                    </select>
                    <span className={css.meta}>{tt('settings.autoAuthorReviewHint')}</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>{tt('settings.autoReviewAfterRevise')}</label>
                    <select
                      className={css.input}
                      value={configDraft.autoReviewAfterRevise ? '1' : '0'}
                      onChange={e => { setConfigDraft({ ...configDraft, autoReviewAfterRevise: e.target.value === '1' }) }}
                    >
                      <option value="1">✓ 是</option>
                      <option value="0">✗ 否</option>
                    </select>
                    <span className={css.meta}>{tt('settings.autoReviewAfterReviseHint')}</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel}>编辑器字号（正文编辑 / 工作区）</label>
                    <select
                      className={css.input}
                      value={editorFontSize}
                      onChange={e => { changeEditorFontSize(Number(e.target.value)) }}
                    >
                      {[12, 13, 14, 15, 16, 18, 20, 22, 24].map(v => (
                        <option key={v} value={v}>{v}px</option>
                      ))}
                    </select>
                    <span className={css.meta}>更改的是章节正文编辑区与润色/修订工作区（原稿 / 草稿 / diff）的显示字号，不影响面板主题。</span>
                  </div>
                </div>
              </div>
            )}


            {settingsTab === 'files' && (
              <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-24)' }}>
                <span className={css.cardTitle}><Folder size={18} style={{ verticalAlign: -3 }} /> 路径与文件</span>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('settings.outlinePath')}</label>
                  <input className={css.input} value={configDraft.outlinePath} onChange={e => { setConfigDraft({ ...configDraft, outlinePath: e.target.value }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('settings.outputDir')}</label>
                  <input className={css.input} value={configDraft.outputDir} onChange={e => { setConfigDraft({ ...configDraft, outputDir: e.target.value }) }} />
                </div>
                <div className={css.row}>
                  <button type="button" className={css.button} onClick={() => { void api.openFolder() }}>{tt('settings.openFolder')}</button>
                </div>

                <div style={{ borderTop: '1px solid var(--nf-border)', margin: '14px 0 12px' }} />

                <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-14)' }}>💾 保存与导出</span>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSaveConfig() }}>
                    {tt('settings.save')}
                  </button>
                </div>
                <div className={css.row}>
                  <button type="button" className={css.button} disabled={busy || chapters.length === 0} onClick={() => { void handleExport('txt') }}>
                    {tt('settings.exportTxt')}
                  </button>
                  <button type="button" className={css.button} disabled={busy || chapters.length === 0} onClick={() => { void handleExport('md') }}>
                    {tt('settings.exportMd')}
                  </button>
                </div>
              </div>
            )}

            {settingsTab === 'appearance' && (
              <div className={`${css.card} ${css.settingsCard}`}>
                <span className={css.cardTitle}><Sparkles size={18} style={{ verticalAlign: -3 }} /> 外观与主题</span>
                <span className={css.meta}>选择适合长时间创作的界面颜色和显示密度。主题只保存在当前设备，不影响小说内容和任务状态。</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-24)' }}>
                  <div className={css.field}>
                    <label className={css.fieldLabel} style={{ fontSize: 'var(--nf-fs-14)' }}>显示模式</label>
                    <select className={css.input} style={{ padding: 'var(--nf-space-10) var(--nf-space-12)', fontSize: 'var(--nf-fs-14)' }} value={themeMode} onChange={e => { changeThemeMode(e.target.value as 'system' | 'light' | 'dark') }}>
                      <option value="system">跟随系统</option>
                      <option value="light">浅色</option>
                      <option value="dark">深色</option>
                    </select>
                    <span className={css.meta}>强制浅色/深色只作用于小说工坊面板</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} style={{ fontSize: 'var(--nf-fs-14)' }}>主题风格</label>
                    <select className={css.input} style={{ padding: 'var(--nf-space-10) var(--nf-space-12)', fontSize: 'var(--nf-fs-14)' }} value={panelTheme} onChange={e => { changePanelTheme(e.target.value as 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield') }}>
                      <option value="liquid">液态玻璃 · 清新绿（默认）</option>
                      <option value="neumorph">新拟物 · 柔和浅色</option>
                      <option value="macos">macOS · 玻璃（蓝，随外观浅/深）</option>
                      <option value="clay">粘土拟态 · 柔和黏土</option>
                      <option value="endfield">终末地 · 纸墨工业风</option>
                    </select>
                    <span className={css.meta}>{tt('settings.themeHint')}</span>
                  </div>
                  {panelTheme === 'endfield' && (
                    <div className={css.field}>
                      <label className={css.fieldLabel} style={{ fontSize: 'var(--nf-fs-14)' }}>终末地强调色</label>
                      <select className={css.input} style={{ padding: 'var(--nf-space-10) var(--nf-space-12)', fontSize: 'var(--nf-fs-14)' }} value={endfieldAccent} onChange={e => { changeEndfieldAccent(e.target.value as 'valley' | 'wuling') }}>
                        <option value="valley">谷地黄（默认）</option>
                        <option value="wuling">武陵青</option>
                      </select>
                      <span className={css.meta}>参考明日方舟：终末地官网，亮色自动使用深色档保证可读性。</span>
                    </div>
                  )}
                  <div className={css.field}>
                    <label className={css.fieldLabel} style={{ fontSize: 'var(--nf-fs-14)' }}>界面密度</label>
                    <select className={css.input} style={{ padding: 'var(--nf-space-10) var(--nf-space-12)', fontSize: 'var(--nf-fs-14)' }} value={themeDensity} onChange={e => { changeThemeDensity(e.target.value as 'comfort' | 'compact' | 'spacious') }}>
                      <option value="comfort">舒适（默认）</option>
                      <option value="compact">紧凑</option>
                      <option value="spacious">宽松</option>
                    </select>
                    <span className={css.meta}>卡片 / 导航 / 内容的间距密度</span>
                  </div>
                </div>
                <div className={css.row} style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className={css.button} style={{ padding: 'var(--nf-space-10) var(--nf-space-18)', fontSize: 'var(--nf-fs-14)' }} onClick={resetTheme}>
                    <RotateCcw size={14} style={{ verticalAlign: -2 }} /> 恢复默认主题
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {activeTab === 'book' && bookTab === 'facts' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>📚 编年 / 复盘</span>
            </div>
            <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                <button
                  type="button"
                  className={`${css.button} ${archiveTab === 'facts' ? css.buttonPrimary : ''}`}
                  style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                  onClick={() => { changeArchiveTab('facts') }}
                  title="编年录：客观事实流水（第 N 章 · 事件），生成/审稿查证用"
                >
                  📜 编年录（{(project?.facts ?? []).length}）
                </button>
                <button
                  type="button"
                  className={`${css.button} ${archiveTab === 'reviews' ? css.buttonPrimary : ''}`}
                  style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                  onClick={() => { changeArchiveTab('reviews') }}
                  title="复盘记录：每章作者复盘（钩子 / 推进 / 衔接 / 趋势）"
                >
                  📋 复盘记录（{chapters.filter(c => c.authorReview !== undefined).length} 章）
                </button>
              </div>

            {archiveTab === 'reviews' ? (
              <>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>📋 复盘记录（{chapters.filter(c => c.authorReview !== undefined).length} 章已复盘）</span>
              <div className={css.row}>
                {(() => {
                  const missing = chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error' && c.authorReview === undefined).length
                  return missing > 0 && (
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                      disabled={busy}
                      onClick={() => { void handleAuthorBackfillAll() }}
                      title="对历史已写章节逐章补跑作者复盘"
                    >
                      ↻ 补齐缺失复盘（{missing}）
                    </button>
                  )
                })()}
              </div>
            </div>
            {(() => {
              const reviewed = chapters.filter(c => c.authorReview !== undefined)
              if (reviewed.length === 0) {
                return <span className={css.meta}>尚无作者复盘——生成/审稿后自动生成，或点「补齐缺失复盘」为已写章节补跑。</span>
              }
              const honored = reviewed.filter(c => c.authorReview!.hookHonored).length
              const avg = Math.round(reviewed.reduce((s, c) => s + c.authorReview!.endingHook, 0) / reviewed.length * 10) / 10
              return (
                <span className={css.meta} style={{ fontWeight: 600 }}>
                  钩子兑现 {honored}/{reviewed.length} · 结尾钩子均分 {avg}/10
                </span>
              )
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {(() => {
                const groupsWithReviews = chapterGroups.filter(group => group.chapters.some(c => c.authorReview !== undefined))
                if (groupsWithReviews.length === 0) return null
                return (
                  <div className={css.row} style={{ justifyContent: 'flex-end', gap: 'var(--nf-space-6)' }}>
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonSmall}`}
                      onClick={() => { setExpandedVolumes(Object.fromEntries(groupsWithReviews.map(g => [g.no, true]))) }}
                    >
                      全部展开
                    </button>
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonSmall}`}
                      onClick={() => { setExpandedVolumes({}) }}
                    >
                      全部折叠
                    </button>
                  </div>
                )
              })()}
              {chapterGroups.map(group => {
                const groupReviewed = group.chapters.filter(c => c.authorReview !== undefined)
                if (groupReviewed.length === 0) return null
                const volumeExpanded = expandedVolumes[group.no] === true
                return (
                  <div key={group.no} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 'var(--nf-space-8) var(--nf-space-12)', fontSize: 'var(--nf-fs-14)', display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}
                      onClick={() => { setExpandedVolumes(prev => ({ ...prev, [group.no]: !volumeExpanded })) }}
                    >
                      <span style={{ color: 'var(--nf-text-3)' }}>{volumeExpanded ? '▾' : '▸'}</span>
                      <b>{group.title}</b>
                      <span className={css.meta}>已复盘 {groupReviewed.length}/{group.chapters.length} 章</span>
                    </button>
                    {volumeExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', padding: 'var(--nf-space-4) var(--nf-space-8) var(--nf-space-8)', borderTop: '1px solid var(--nf-border)' }}>
                        {[...groupReviewed].reverse().map(c => {
                          const ar = c.authorReview!
                          const expanded = expandedReviewChapter === c.no
                          return (
                            <div key={c.no} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', overflow: 'hidden' }}>
                              <button
                                type="button"
                                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)', display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}
                                onClick={() => { setExpandedReviewChapter(expanded ? null : c.no) }}
                              >
                                <span style={{ color: 'var(--nf-text-3)' }}>{expanded ? '▾' : '▸'}</span>
                                <b>第{c.no}章《{c.title}》</b>
                                <span style={{ color: ar.hookHonored ? 'var(--nf-success)' : 'var(--nf-warn)' }}>钩子{ar.hookHonored ? '✓' : '✗'}</span>
                                <span style={{ color: ar.endingHook >= 6 ? 'var(--nf-success)' : 'var(--nf-error)' }}>结尾钩子 {ar.endingHook}/10</span>
                                {ar.plotlineProgress !== '' && <span className={css.meta} style={{ marginLeft: 'var(--nf-space-4)' }}>{ar.plotlineProgress.slice(0, 40)}{ar.plotlineProgress.length > 40 ? '…' : ''}</span>}
                              </button>
                              {expanded && (
                                <div style={{ padding: 'var(--nf-space-4) var(--nf-space-10) var(--nf-space-8)', fontSize: 'var(--nf-fs-12)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', borderTop: '1px solid var(--nf-border)' }}>
                                  {ar.hookNote !== '' && <span className={css.meta}><b>钩子：</b>{ar.hookNote}</span>}
                                  {ar.plotlineProgress !== '' && <span className={css.meta}><b>推进：</b>{ar.plotlineProgress}</span>}
                                  {ar.continuity !== '' && <span className={css.meta}><b>衔接：</b>{ar.continuity}</span>}
                                  {ar.trend !== '' && <span className={css.meta}><b>趋势：</b>{ar.trend}</span>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
              </>
            ) : (
              <>
            <div className={css.busyRow} style={{ flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>{tt('facts.title', { n: (project?.facts ?? []).length })}</span>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || chapters.length === 0}
                onClick={() => { void handleFactsBackfill() }}
                title="用 LLM 从历史章节正文重新抽取事实，补齐缺失的编年录条目"
              >
                📥 {tt('facts.backfill')}
              </button>
            </div>
            <span className={css.meta}>{tt('facts.hint')}</span>
            {(project?.facts ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', maxHeight: '60vh', overflowY: 'auto', fontSize: 'var(--nf-fs-12)' }}>
                {[...(project?.facts ?? [])].reverse().map((fact, i) => (
                  <div key={i} style={{ display: 'flex', gap: 'var(--nf-space-8)', alignItems: 'flex-start' }}>
                    <span className={css.badge} style={{ borderColor: 'var(--nf-text-3)', color: 'var(--nf-text-3)', flex: 'none', marginTop: 'var(--nf-space-2)' }}>
                      第 {fact.chapterNo} 章
                    </span>
                    <span className={css.meta}>{fact.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className={css.meta}>暂无事实条目——写一章后会自动生成，或点击上方「回填」。</span>
            )}
              </>
            )}
          </div>
        )}

        {activeTab === 'plotlines' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>📜 长线管理</span>
            </div>
            <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                <button
                  type="button"
                  className={`${css.button} ${longlineTab === 'plotlines' ? css.buttonPrimary : ''}`}
                  style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                  onClick={() => { changeLonglineTab('plotlines') }}
                  title="剧情线：故事明线（主线 / 支线 / 人物 / 悬念）"
                >
                  🧵 剧情线（{project?.plotlines?.length ?? 0}）
                </button>
                <button
                  type="button"
                  className={`${css.button} ${longlineTab === 'foreshadow' ? css.buttonPrimary : ''}`}
                  style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
                  onClick={() => { changeLonglineTab('foreshadow') }}
                  title="伏笔：道具 / 事件级暗线（埋设 → 回收）"
                >
                  🔮 伏笔（{foreshadows.length}）
                </button>
              </div>

            {longlineTab === 'foreshadow' ? (
              <>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className={css.cardTitle}>🔮 {tt('foreshadow.title')}（{foreshadows.length}）</span>
                <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSuggestForeshadows() }}>
                  {tt('foreshadow.suggest')}
                </button>
              </div>
              {foreshadows.length === 0 ? (
                <span className={css.meta}>{tt('foreshadow.none')}</span>
              ) : (
                <div className={css.chapterList}>
                  {foreshadows.map(f => {
                    const statusLabel = { planned: tt('foreshadow.planned'), planted: tt('foreshadow.planted'), progressing: tt('foreshadow.progressing'), resolved: tt('foreshadow.resolved'), abandoned: tt('foreshadow.abandoned') }[f.status]
                    const statusColor = f.status === 'resolved' ? 'var(--nf-success)' : f.status === 'planted' || f.status === 'progressing' ? 'var(--nf-accent)' : f.status === 'abandoned' ? 'var(--nf-text-3)' : 'var(--nf-info)'
                    return (
                      <div key={f.id} className={css.chapter}>
                        <div className={css.chapterMain}>
                          <div className={css.chapterTitle}>
                            <span>{f.description}</span>
                          </div>
                          <div className={css.meta}>
                            {f.plantedChapter !== undefined && <span>{tt('foreshadow.plantedAt')} 第{f.plantedChapter}章 · </span>}
                            {f.targetChapter !== undefined && <span>{tt('foreshadow.target')} 第{f.targetChapter}章 · </span>}
                            {f.resolvedNote !== undefined && f.resolvedNote !== '' && <span>回收：{f.resolvedNote} · </span>}
                          </div>
                        </div>
                        <span className={css.badge} style={{ borderColor: statusColor, color: statusColor }}>{statusLabel}</span>
                        <div className={css.row} style={{ gap: 'var(--nf-space-4)' }}>
                          {f.status === 'planned' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => {
                              void api.foreshadow({ id: f.id, status: 'planted', plantedChapter: doneCount + 1 }).then(r => setProject(prev => prev === null ? prev : { ...prev, foreshadows: r.foreshadows }))
                            }}>
                              {tt('foreshadow.setPlanted')}
                            </button>
                          )}
                          {(f.status === 'planted' || f.status === 'progressing') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => {
                              void api.foreshadow({ id: f.id, status: 'resolved', resolvedNote: `第${doneCount}章回收` }).then(r => setProject(prev => prev === null ? prev : { ...prev, foreshadows: r.foreshadows }))
                            }}>
                              {tt('foreshadow.setResolved')}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              </>
            ) : (
              <>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className={css.cardTitle}>🧵 {tt('tab.plotlines')}（{project?.plotlines?.length ?? 0}）</span>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || outlineText.length < 50}
                  onClick={() => { void handlePlotlineHealth() }}
                  title="根据已写章节数与各线推进情况，判断是否需要新增剧情线、建议多少章后添加"
                >
                  🩺 剧情健康检查
                </button>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || outlineText.length < 50}
                  onClick={() => { void handlePlotlinePlan() }}
                  title="AI 设计下一阶段剧情方案：未来 5-10 章方向 + 2-3 条建议新线"
                >
                  ✨ 设计剧情方案
                </button>
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || outlineText.length < 50}
                  onClick={() => { void handlePlotlineSuggest() }}
                  title="AI 根据大纲/卷计划/已写章节/编年录，提炼候选剧情线"
                >
                  ✨ AI 建议剧情线
                </button>
                {plotlineDraft === null && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                    onClick={() => { setPlotlineDraft({ id: '', name: '', kind: 'main', goal: '', progress: '', status: 'active' }) }}
                  >
                    {tt('plotlines.new')}
                  </button>
                )}
              </div>
            </div>
            <span className={css.meta}>{tt('plotlines.hint')}</span>

            {plotlineHealth !== null && (
              <PlotlineHealthPanel
                report={plotlineHealth}
                disabled={busy}
                onPlan={() => { void handlePlotlinePlan() }}
                onClose={() => { setPlotlineHealth(null) }}
              />
            )}

            {plotlinePlan !== null && (
              <PlotlinePlanPanel
                plan={plotlinePlan}
                disabled={busy}
                onAdopt={(s) => { void handlePlanAdopt(s) }}
                onClose={() => { setPlotlinePlan(null) }}
              />
            )}

            {plotlineSuggestions !== null && (
              <PlotlineSuggestionPanel
                suggestions={plotlineSuggestions}
                disabled={busy}
                onAdopt={(s) => { void handlePlotlineAdopt(s) }}
                onClose={() => { setPlotlineSuggestions(null) }}
              />
            )}

            {plotlineDraft !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-10)' }}>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <div className={css.field} style={{ flex: 2, minWidth: 160 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.name')}</label>
                    <input className={css.input} value={plotlineDraft.name} onChange={e => { setPlotlineDraft({ ...plotlineDraft, name: e.target.value }) }} placeholder="如：集齐古玉残片" />
                  </div>
                  <div className={css.field} style={{ flex: 1 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.kind')}</label>
                    <select className={css.input} value={plotlineDraft.kind} onChange={e => { setPlotlineDraft({ ...plotlineDraft, kind: e.target.value as Plotline['kind'] }) }}>
                      <option value="main">{tt('plotlines.kindMain')}</option>
                      <option value="branch">{tt('plotlines.kindBranch')}</option>
                      <option value="character">{tt('plotlines.kindCharacter')}</option>
                      <option value="mystery">{tt('plotlines.kindMystery')}</option>
                    </select>
                  </div>
                  <div className={css.field} style={{ flex: 1 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.status')}</label>
                    <select className={css.input} value={plotlineDraft.status} onChange={e => { setPlotlineDraft({ ...plotlineDraft, status: e.target.value as Plotline['status'] }) }}>
                      <option value="active">{tt('plotlines.statusActive')}</option>
                      <option value="paused">{tt('plotlines.statusPaused')}</option>
                      <option value="resolved">{tt('plotlines.statusResolved')}</option>
                      <option value="abandoned">{tt('plotlines.statusAbandoned')}</option>
                    </select>
                  </div>
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('plotlines.goal')}</label>
                  <textarea className={css.textarea} style={{ minHeight: 48 }} value={plotlineDraft.goal} onChange={e => { setPlotlineDraft({ ...plotlineDraft, goal: e.target.value }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('plotlines.progress')}</label>
                  <textarea className={css.textarea} style={{ minHeight: 40 }} value={plotlineDraft.progress} onChange={e => { setPlotlineDraft({ ...plotlineDraft, progress: e.target.value }) }} placeholder="如：已取得第二枚残片，正追踪第三枚线索" />
                </div>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handlePlotlineSave() }}>
                    {tt('plotlines.save')}
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setPlotlineDraft(null) }}>
                    {tt('plotlines.cancel')}
                  </button>
                </div>
              </div>
            )}

            {(project?.plotlines ?? []).length === 0 ? (
              <span className={css.meta}>{tt('plotlines.empty')}</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {(project?.plotlines ?? []).map(line => (
                  <PlotlineCard
                    key={line.id}
                    line={line}
                    disabled={busy}
                    onRefresh={() => { void handlePlotlineRefresh(line.id) }}
                    onEdit={() => { setPlotlineDraft({ id: line.id, name: line.name, kind: line.kind, goal: line.goal, progress: line.progress, status: line.status }) }}
                    onRemove={() => { void handlePlotlineRemove(line.id) }}
                  />
                ))}
              </div>
            )}
              </>
            )}
          </div>
        )}

        {activeTab === 'director' && <DirectorView api={api} todos={project?.todos ?? []} onTodosChange={(todos) => setProject(prev => prev === null ? prev : { ...prev, todos, updatedAt: new Date().toISOString() })} />}

        {activeTab === 'knowledge' && <KnowledgeBaseView api={api} />}

        {activeTab === 'run' && (
          <RunPanel api={api} totalChapters={chapters.length} />
        )}

        {activeTab === 'manhua' && (
          <MangaWorkspace api={api} project={project} chapters={chapters} onProjectChanged={() => refresh(false)} onProgress={(text, kind) => pushProgress(text, kind ?? 'info')} />
        )}

        {activeTab === 'breakdown' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>🔍 拆书分析</span>
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <select
                  className={css.input}
                  style={{ width: 160 }}
                  value={breakdownScope}
                  onChange={e => { setBreakdownScope(e.target.value as typeof breakdownScope) }}
                  title="分析范围"
                >
                  <option value="recent">最近 20 章</option>
                  {volumes !== undefined && volumes.map(v => (
                    <option key={v.no} value={`volume:${v.no}`}>第{v.no}卷</option>
                  ))}
                  <option value="all">全书</option>
                </select>
                <select
                  className={css.input}
                  style={{ width: 150 }}
                  value={breakdownPreset}
                  onChange={e => { setBreakdownPreset(e.target.value as 'quick' | 'standard') }}
                  title="分析档位"
                >
                  <option value="quick">快速（4 维）</option>
                  <option value="standard">标准+卖点</option>
                </select>
                <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleBreakdown() }} title="对已写章节做结构/人物/文风/卖点体检（约 1-3 分钟，消耗 LLM 额度）">
                  {busy ? '⏳ 分析中…' : '✨ 开始拆书'}
                </button>
              </div>
            </div>
            <span className={css.meta}>拆书分析 = 整卷复盘工具：定位、剧情结构、人物系统、文风技法（标准档加商业化卖点）。每条结论基于实际章节归纳，帮你发现「写偏了/人物变形/文风漂移」——与单章审稿互补。</span>

            {breakdownResult === null ? (
              <div className={css.shelfEmpty} style={{ minHeight: 140 }}>
                <span className={css.shelfEmptyIcon}>📖</span>
                <span className={css.shelfEmptyTitle}>尚未运行拆书分析</span>
                <span className={css.meta}>选择范围与档位，点「开始拆书」对已写章节做整卷体检</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
                <span className={css.meta}>
                  分析 {breakdownResult.chaptersScanned} 章 · {breakdownResult.sections.length} 个小节 · 约 {breakdownResult.usedTokens} token
                </span>
                {breakdownResult.sections.map(sec => (
                  <div key={sec.key} className={css.wsPreview} style={{ borderColor: 'var(--nf-info)' }}>
                    <div className={css.busyRow}>
                      <b>{sec.title}</b>
                    </div>
                    {Object.keys(sec.structured).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)', fontSize: 'var(--nf-fs-12)', marginBottom: 'var(--nf-space-6)' }}>
                        {Object.entries(sec.structured).map(([k, v]) => {
                          const label = (typeof v === 'string') ? v : Array.isArray(v) ? (v as string[]).join('、') : JSON.stringify(v)
                          return <div key={k} className={css.meta}><b>{k}：</b>{label}</div>
                        })}
                      </div>
                    )}
                    <div className={css.meta} style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--nf-fs-12)' }}>{sec.markdown}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </>)}
        </div>
      </div>
      </>
      )}

      {/* AI 助手悬浮窗：可拖动、可拉大小，不占用工作台 */}
      {assistantOpen && (
        <div
          className={css.assistantFloat}
          style={{ left: assistantPos.x, top: assistantPos.y, width: assistantSize.w, height: assistantSize.h }}
        >
          <div
            className={css.assistantFloatHeader}
            onMouseDown={e => {
              e.preventDefault()
              dragState.current = { type: 'move', target: 'assistant', startX: e.clientX, startY: e.clientY, origX: assistantPos.x, origY: assistantPos.y, origW: assistantSize.w, origH: assistantSize.h }
            }}
          >
            <span>💬 AI 编辑 Agent <span className={css.meta}>（拖动标题栏移动 · 右下角拉大小）</span></span>
            <button type="button" className={css.iconButton} title="关闭" aria-label="关闭 AI 编辑 Agent" onClick={() => { setAssistantOpen(false) }}>×</button>
          </div>
          <div className={css.assistantFloatBody}>
            <AssistantTab api={api} />
          </div>
          <div
            className={css.assistantResize}
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              dragState.current = { type: 'resize', target: 'assistant', startX: e.clientX, startY: e.clientY, origX: assistantPos.x, origY: assistantPos.y, origW: assistantSize.w, origH: assistantSize.h }
            }}
          />
        </div>
      )}

      {/* AI进度悬浮窗：可拖动、可拉大小（同 AI 助手），承接活动输出 + 当前任务进度 */}
      {progressOpen && (
        <div
          className={css.assistantFloat}
          style={{ left: progressPos.x, top: progressPos.y, width: progressSize.w, height: progressSize.h }}
        >
          <div
            className={css.assistantFloatHeader}
            onMouseDown={e => {
              e.preventDefault()
              dragState.current = { type: 'move', target: 'progress', startX: e.clientX, startY: e.clientY, origX: progressPos.x, origY: progressPos.y, origW: progressSize.w, origH: progressSize.h }
            }}
          >
            <span>
              📊 AI 进度
              {busy && <span style={{ color: 'var(--nf-accent)' }}> 🟢 任务进行中</span>}
              <span className={css.meta}>（拖动标题栏移动 · 右下角拉大小）</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-4)' }}>
              {progress.length > 0 && (
                <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setProgress([]) }} title="清空活动记录">
                  清空
                </button>
              )}
              <button type="button" className={css.iconButton} title="关闭" aria-label="关闭AI进度" onClick={() => { setProgressOpen(false) }}>×</button>
            </span>
          </div>
          <div className={css.assistantFloatBody} style={{ padding: 'var(--nf-space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', overflow: 'hidden', flex: 1, minHeight: 0 }}>
            {/* 当前任务大进度条：进行中显示 */}
            {(busy && (busyLabel !== '' || liveBar !== null)) && (
              <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-12)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', background: 'color-mix(in srgb, var(--nf-accent) 6%, transparent)' }}>
                <span style={{ fontSize: 'var(--nf-fs-12)', fontWeight: 600, color: 'var(--nf-accent)' }}>
                  ✍ {busyLabel !== '' ? busyLabel : (liveBar?.text ?? '任务进行中')}…
                </span>
                {liveBar?.ratio !== undefined && (
                  <div className={css.bigProgressBar}>
                    <div className={css.bigProgressBarFill} style={{ width: `${Math.round(liveBar.ratio * 100)}%` }} />
                  </div>
                )}
                {liveBar?.text !== undefined && <span className={css.liveText}>{liveBar.text}</span>}
              </div>
            )}
            {/* 活动记录列表（标题行已并入窗口标题栏，清空按钮在右上角） */}
            <div className={css.progress} style={{ flex: '0 1 auto', maxHeight: '42%', minHeight: 0, overflowY: 'auto', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', background: 'var(--nf-bg-inset)', padding: 'var(--nf-space-8)', display: 'flex', flexDirection: 'column' }}>
              {progress.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', color: 'var(--nf-text-3)', fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) 2px' }}>
                  <span>📭</span>
                  <span>暂无活动记录，生成、审稿等操作会显示在这里</span>
                </div>
              ) : (
                progress.map(line => (
                  <div key={line.id} className={line.kind === 'done' ? css.progressLineDone : line.kind === 'error' ? css.progressLineError : line.live === true ? css.progressLineLive : css.progressLine}>
                    {line.live === true && (
                      <span className={css.progressBar}>
                        <span className={css.progressBarFill} style={{ width: `${Math.round((line.ratio ?? 0) * 100)}%` }} />
                      </span>
                    )}
                    {line.text}
                  </div>
                ))
              )}
              <div ref={progressEndRef} />
            </div>
            <LiveFeedLog />
          </div>
          <div
            className={css.assistantResize}
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              dragState.current = { type: 'resize', target: 'progress', startX: e.clientX, startY: e.clientY, origX: progressPos.x, origY: progressPos.y, origW: progressSize.w, origH: progressSize.h }
            }}
          />
        </div>
      )}
      {showImport && (
        <ImportModal
          api={api}
          onClose={() => { setShowImport(false) }}
          onImported={async () => {
            await refreshShelf()
          }}
        />
      )}
    </div>
  )
}
