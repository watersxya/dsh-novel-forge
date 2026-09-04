/**
 * 漫剧工作台（5步流程）：
 * 顶部常驻：方案切换器 + 全流程步骤条（唯一导航）；
 * 主体按步骤渲染独立页面：①创建方案 ②一键生成 ③角色定妆 ④场景底图 ⑤导出即梦脚本。
 * 每步页面只显示自己的内容；前置不足显示明确提示，不静默降级、不夹带别区内容。
 */
import { useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ImageModelConfig, MangaPlan, ProjectState } from '../../protocol.ts'
import { STYLE_CATEGORIES, STYLE_LIBRARY, findStyle, type StyleCategory } from '../../style-library.ts'
import { StyleCard } from './StyleCard.tsx'
import { GENRES } from '../../manga-genre-rules.ts'
import { StoryboardTab } from './StoryboardTab.tsx'
import { MangaRoleLibrary } from './MangaRoleLibrary.tsx'
import { SceneLibrary } from './SceneLibrary.tsx'
import { PropLibrary } from './PropLibrary.tsx'
import { FlowGuide, type FlowTarget } from './FlowGuide.tsx'
import css from './panel.module.css'

/** 步骤页编号：1建方案 2一键生成 3角色定妆 4场景底图 5分镜·提示词 6道具库。 */
type StepView = 1 | 2 | 3 | 4 | 5 | 6

const FLOW_TARGET_TO_VIEW: Record<FlowTarget, StepView> = {
  plan: 1,
  rules: 2,
  skeleton: 5,
  table: 5,
  import: 2,
  makeup: 3,
  scenes: 4,
  props: 6,
  prompts: 5,
  export: 5,
}

export function MangaWorkspace({
  api,
  project,
  chapters,
  onProjectChanged,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  chapters: ChapterPlan[]
  /** 方案/资产变更已持久化后触发（刷新项目）。 */
  onProjectChanged?: () => void | Promise<void>
  /** 是否启用生图（漫剧卡出定妆图）。 */
  /** 上报到「AI进度」控制台（漫剧工作台内所有 LLM/方案操作）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const plans = useMemo(() => project?.mangaPlans ?? [], [project?.mangaPlans])
  const activePlan = plans.find(p => p.active) ?? null

  const [view, setView] = useState<StepView>(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(false)
  // 全局当前章节（角色/场景/分镜/导出都基于此章节）
  const [currentChapter, setCurrentChapter] = useState<number | null>(null)
  // 章节选择面板
  const [showChapterPicker, setShowChapterPicker] = useState(false)
  const [chapterQuery, setChapterQuery] = useState('')
  // 一键生成状态
  const [autoGenChapter, setAutoGenChapter] = useState<number | null>(null)
  const [autoGenBusy, setAutoGenBusy] = useState(false)
  const [autoGenResult, setAutoGenResult] = useState<{ chapterNo: number; skeletonBeats: number; shotCount: number; promptCount: number; importedRoles: number; needMakeupRoles: number; extraRoles: number; pendingCandidates: number; pendingRoleNames: string[] } | null>(null)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [roleFocus, setRoleFocus] = useState<'import' | 'cards'>('cards')
  const [rulesDraft, setRulesDraft] = useState<string[]>([])

  // 风格选择表单（第①步页）
  const [cat, setCat] = useState<StyleCategory>('3d')
  const [selStyle, setSelStyle] = useState('')
  const [selFilter, setSelFilter] = useState('')
  const [selGenre, setSelGenre] = useState('')
  const [planName, setPlanName] = useState('')

  // 无方案时强制停在创建方案页。
  const effectiveView: StepView = plans.length === 0 ? 1 : view

  const baseStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable !== true).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)), [])
  const filterStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable === true), [])
  const activeStyle = activePlan !== null ? findStyle(activePlan.styleId) : undefined
  const activeFilter = activePlan?.filterId !== undefined ? findStyle(activePlan.filterId) : undefined

  const refresh = async (): Promise<void> => { await onProjectChanged?.() }

  // 章节状态：已完成（有分镜+有提示词+已导出）/ 进行中（有分镜）/ 未开始
  const chapterStatus = useMemo(() => {
    const map = new Map<number, 'done' | 'doing' | 'todo'>()
    const written = chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error')
    for (const c of written) {
      const sb = (project?.storyboards ?? []).find(e => e.chapterNo === c.no)
      const hasPrompts = (sb?.prompts ?? []).length > 0
      const hasTable = (sb?.table?.shots ?? []).length > 0
      if (hasPrompts && hasTable) map.set(c.no, 'done')
      else if (hasTable) map.set(c.no, 'doing')
      else map.set(c.no, 'todo')
    }
    return map
  }, [chapters, project?.storyboards])

  // 初始化 currentChapter 为第一个已写章节
  const writtenChapters = chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error')
  const effectiveChapter = currentChapter ?? writtenChapters[0]?.no ?? null

  /** 有视频提示词的章节列表（导出用）。 */

  /** 导出整章「即梦素材包」到剪贴板：素材编号(@图N) + 角色定妆图提示词 + 场景底图提示词 + 逐镜卡 + 整集画布脚本 + 步骤卡。 */
  const exportMangaPackage = (chapterNo: number): void => {
    const entry = (project?.storyboards ?? []).find(e => e.chapterNo === chapterNo)
    if (entry === undefined || entry.table === undefined || (entry.prompts ?? []).length === 0) return
    const chapter = chapters.find(c => c.no === chapterNo)
    const prompts = entry.prompts!
    const table = entry.table
    const mangaById = new Map((project?.mangaRoles ?? []).map(c => [c.id, c]))
    const sceneByName = new Map((project?.scenes ?? []).map(s => [s.name, s] as const))

    // 参考清单（按名字，供上传后手动@），保留收集角色/场景引用
    const roleIds: string[] = []
    for (const p of prompts) for (const id of p.mangaRoleIds ?? []) if (!roleIds.includes(id)) roleIds.push(id)
    const sceneNames: string[] = []
    for (const p of prompts) {
      const sn = p.sceneName
      if (sn !== undefined && sn !== '' && sn !== '（未标注）' && !sceneNames.includes(sn)) sceneNames.push(sn)
    }
    const rules = project?.visualRules ?? []

    const lines: string[] = []
    lines.push('# ' + (project?.bookName ?? '本书') + ' 第' + chapterNo + '章《' + (chapter?.title ?? '') + '》 · 即梦素材包')
    lines.push('生成时间：' + new Date().toLocaleString('zh-CN'))
    lines.push('镜头数：' + prompts.length)
    lines.push('')

    // 0. 参考素材清单（按名字，上传后手动@对应）
    lines.push('## 📌 参考素材清单（按名字，上传后手动@）')
    for (const id of roleIds) {
      const c = mangaById.get(id)
      if (c !== undefined) lines.push(`- ${c.name}（角色定妆图）${c.imageUrl !== undefined ? '·已有图' : '·待生成'}`)
    }
    for (const n of sceneNames) lines.push(`- ${n}（场景底图）`)
    lines.push('')

    // 1. 角色定妆图提示词
    lines.push('## 📌 角色定妆图提示词（复制去即梦生角色图）')
    for (const id of roleIds) {
      const c = mangaById.get(id)
      if (c === undefined) continue
      lines.push(`### ${c.name}（${c.identity ?? ''}）`)
      const zh = c.imagePrompt?.zh ?? c.appearance ?? ''
      if (zh !== '') {
        lines.push(zh)
        if (c.imagePrompt?.negativePrompt !== undefined && c.imagePrompt.negativePrompt !== '') lines.push('负面词：' + c.imagePrompt.negativePrompt)
      } else {
        lines.push('（尚未生成形象锚点，先到「③ 角色定妆」提炼）')
      }
      lines.push('')
    }

    // 2. 场景底图提示词
    if (sceneNames.length > 0) {
      lines.push('## 📌 场景底图提示词（复制去即梦生成场景图）')
      for (const n of sceneNames) {
        const s = sceneByName.get(n)
        const zh = s?.zh ?? ''
        lines.push(`### ${n}`)
        if (zh !== '') {
          lines.push(zh)
          if (s?.negativePrompt !== undefined && s.negativePrompt !== '') lines.push('负面词：' + s.negativePrompt)
        } else {
          lines.push('（尚未提炼场景，先到「④ 场景库」提炼）')
        }
        lines.push('')
      }
    }

    // 3. 逐镜提示词（时间轴 + 台词 + 名字参考）
    lines.push('## 📌 逐镜提示词（逐镜生成：粘贴画布对话框，手动@对应的角色/场景图）')
    let acc = 0
    for (const p of prompts) {
      const shot = table.shots.find(s => s.id === p.shotId)
      const dur = shot?.duration ?? 6
      const start = acc
      const end = acc + dur
      acc = end
      const roleNames = (p.mangaRoleIds ?? []).map(id => mangaById.get(id)?.name ?? id).join('、')
      const scn = p.sceneName !== undefined && p.sceneName !== '' && p.sceneName !== '（未标注）' ? p.sceneName : ''
      const lineText = (shot?.line ?? '').trim()
      lines.push(`### 镜头 ${p.shotId}`)
      lines.push('- **时间轴**：' + start + '-' + end + 's')
      if (p.camera !== undefined && p.camera !== '') lines.push('- **运镜**：' + p.camera)
      if (p.motion !== undefined) lines.push('- **运动幅度**：' + p.motion)
      lines.push('- **参考角色**：' + (roleNames !== '' ? roleNames : '（智能角色）'))
      if (scn !== '') lines.push('- **参考场景**：' + scn)
      if (lineText !== '') lines.push('- **台词**：' + lineText)
      lines.push('- **提示词**：' + p.text)
      if (p.negativePrompt !== undefined && p.negativePrompt !== '') lines.push('- **负面词**：' + p.negativePrompt)
      lines.push('')
    }

    // 4. 整集画布脚本（一次多镜）
    lines.push('## 📌 整集画布脚本（一次多镜：整段粘贴，手动@）')
    lines.push('【全局设定】')
    lines.push('- 风格：' + (activeStyle?.keywords ?? activeFilter?.keywords ?? '写实电影感'))
    if (activeFilter !== undefined) lines.push('- 滤镜：' + activeFilter.keywords)
    for (const id of roleIds) {
      const c = mangaById.get(id)
      if (c !== undefined) lines.push(`- 人物：${c.name}（${c.identity ?? ''}），参考定妆图，严格保持面孔一致`)
    }
    for (const n of sceneNames) lines.push(`- 场景：${n}`)
    if (rules.length > 0) lines.push('- 视觉规则：' + rules.join('；'))
    lines.push('- 禁止字幕、禁止水印、禁止变形。')
    lines.push('')
    for (const p of prompts) {
      const shot = table.shots.find(s => s.id === p.shotId)
      lines.push(`**镜头${p.shotId}（${shot?.duration ?? 6}s）**`)
      lines.push(p.text)
      lines.push('')
    }

    // 5. 步骤卡
    lines.push('## 📌 即梦出片 4 步')
    lines.push('1. 出图：复制上面【角色定妆图提示词】【场景底图提示词】去即梦生成人物图、场景图。')
    lines.push('2. 摆画布：把生成的人物图、场景图都拖进即梦「画布」。')
    lines.push('3. 出片：逐镜 → 复制每镜【提示词】粘贴画布对话框，手动@对应的角色/场景图；整集 → 复制【整集画布脚本】一次生成。')
    lines.push('4. 剪辑：剪映把镜头按顺序拼成一集（60-120s），加字幕、配音、BGM，导出 9:16 无黑边。')

    const markdown = lines.join('\n')
    void navigator.clipboard?.writeText(markdown)
    // 落盘到资产库 manga-assets/素材包/
    void api.exportPackage(chapterNo, chapter?.title ?? '', markdown).then(res => {
      onProgress?.('已保存素材包到资产库：' + res.file, 'done')
    }).catch(err => { onProgress?.('素材包落盘失败：' + (err as Error).message, 'error') })
    setExported(true)
    setTimeout(() => setExported(false), 2000)
  }

  /** 一键生成：骨架→分镜→角色提名→自动导入→自动分级→视频提示词。 */
  const autoGenerate = async (): Promise<void> => {
    if (autoGenChapter === null || activePlan === null) return
    setAutoGenBusy(true)
    setError('')
    setAutoGenResult(null)
    onProgress?.('一键生成：拆剧情→生镜头→导角色→写提示词…')
    try {
      const res = await api.mangaRoles({ op: 'autoGenerate', chapterNo: autoGenChapter, styleId: activePlan.styleId, filterId: activePlan.filterId })
      setAutoGenResult(res.autoGenerate ?? null)
      await refresh()
      onProgress?.('一键生成完成：' + (res.autoGenerate?.shotCount ?? 0) + '个镜头，' + (res.autoGenerate?.importedRoles ?? 0) + '个角色', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('一键生成失败：' + m, 'error')
    } finally {
      setAutoGenBusy(false)
    }
  }

  /** 打开漫剧资产库文件夹。 */
  const openAssets = async (): Promise<void> => {
    try {
      await api.mangaRoles({ op: 'openAssets' })
    } catch (err) {
      setError('打开资产库失败：' + (err as Error).message)
    }
  }

  const mutate = async (req: import('../../protocol.ts').MangaPlansRequest): Promise<boolean> => {
    const opLabel = req.op === 'create' ? '创建漫剧方案「' + (req.name ?? '') + '」' : req.op === 'activate' ? '切换漫剧方案' : '删除漫剧方案'
    setBusy(true)
    setError('')
    onProgress?.(opLabel + '…')
    try {
      await api.manhuaPlans(req)
      onProgress?.(opLabel + ' 完成', 'done')
      return true
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.(opLabel + ' 失败：' + m, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const createPlan = async (): Promise<void> => {
    const n = planName.trim()
    if (n === '' || selStyle === '') {
      setError('请选择基底风格并填写方案名')
      return
    }
    const ok = await mutate({ op: 'create', name: n, styleId: selStyle, filterId: selFilter !== '' ? selFilter : undefined, genre: selGenre !== '' ? selGenre : undefined })
    if (ok) {
      setPlanName('')
      setSelStyle('')
      setSelFilter('')
      setSelGenre('')
      await refresh()
      setView(2)
    }
  }

  const pickStyle = (id: string): void => {
    setSelStyle(id)
    if (planName.trim() === '') {
      const s = findStyle(id)
      setPlanName((project?.bookName ?? '本书') + ' · ' + (s?.name ?? '') + '版')
    }
  }

  /** 流程第②步：从道藏提炼视觉规则（注入所有提示词）。 */
  const extractRules = async (): Promise<void> => {
    setBusy(true)
    setError('')
    onProgress?.('从道藏提炼视觉规则…')
    try {
      const r = await api.visualRules({ op: 'extract' })
      await refresh()
      onProgress?.('已提炼 ' + r.rules.length + ' 条视觉规则（已注入所有提示词）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('提炼视觉规则失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 全流程步骤条导航：步骤 → 对应页面。 */
  const navigateFlow = (target: FlowTarget): void => {
    setError('')
    setView(FLOW_TARGET_TO_VIEW[target])
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入漫剧工作台。</span></div>
  }

  const rules = project.visualRules ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
      {/* 顶部常驻：方案切换器 + 全流程步骤条（唯一导航） */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎬 {activePlan?.name ?? '漫剧工作台'}</span>
          <div className={css.row}>
            <span className={css.badge}>🎨 {activeStyle?.name ?? activePlan?.styleId}</span>
            {activeFilter !== undefined && <span className={css.badge}>＋{activeFilter.name}</span>}
            <select
              className={css.input}
              style={{ width: 'auto', padding: 'var(--nf-space-4) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)', borderRadius: 'var(--nf-radius-8)' }}
              value={activePlan?.id ?? ''}
              onChange={async e => { if (await mutate({ op: 'activate', id: e.target.value })) await refresh() }}
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className={css.button + ' ' + css.buttonSmall} style={{ minWidth: 84 }} onClick={() => { setSelStyle(''); setPlanName(''); setView(1) }}>＋ 新建</button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              onClick={() => { void onProjectChanged?.() }}
              title="刷新项目数据（切换书后或章节未显示时点此）"
            >
              🔄 刷新
            </button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              onClick={() => { void openAssets() }}
              title="打开漫剧资产库（角色图/场景图/提示词自动保存到这里）"
            >
              📁 资产库
            </button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              onClick={() => { setRulesDraft([...(project?.visualRules ?? [])]); setShowRulesModal(true) }}
              title="视觉规则（从道藏提炼，生图/生视频时强制注入）"
            >
              📋 视觉规则{rules.length > 0 ? `(${rules.length})` : ''}
            </button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              disabled={busy}
              onClick={async () => {
                if (activePlan === null) return
                if (!window.confirm('删除方案「' + activePlan.name + '」？将同时清除该方案的分镜、提示词和角色卡（场景库保留）。')) return
                if (await mutate({ op: 'remove', id: activePlan.id })) {
                  setAutoGenResult(null)
                  setAutoGenChapter(null)
                  setExported(false)
                  setError('')
                  await refresh()
                  setView(1)
                }
              }}
            >
              🗑 删除当前方案
            </button>
          </div>
        </div>
        {/* 当前章节 + 选章节（长篇友好：不横排，用面板搜索/分页/按状态） */}
        {effectiveView !== 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)', padding: 'var(--nf-space-6) 0', borderTop: '1px solid var(--nf-border)', marginTop: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-dim, #888)' }}>当前章节：</span>
            <span className={css.badge} style={{ fontSize: 'var(--nf-fs-13)', padding: 'var(--nf-space-2) var(--nf-space-8)' }}>
              {effectiveChapter !== null
                ? '第' + effectiveChapter + '章 ' + (chapters.find(c => c.no === effectiveChapter)?.title ?? '')
                : '（未选章节）'}
            </span>
            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setShowChapterPicker(true) }}>📚 选章节</button>
            <span className={css.meta}>共 {writtenChapters.length} 章可出片</span>
          </div>
        )}
        <FlowGuide project={project} onNavigate={navigateFlow} exported={exported} />
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {/* ① 创建方案页 */}
      {effectiveView === 1 && (
        <div className={css.card}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className={css.cardTitle}>① 创建方案 · 选择视觉风格</span>
            {plans.length > 0 && <button type="button" className={css.button} disabled={busy} onClick={() => { setView(2) }}>返回工作台</button>}
          </div>
          <span className={css.meta}>选一个基底风格，下方可叠加影视滤镜（可选）。此后所有提示词按此风格生成。</span>

          <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap', margin: '10px 0' }}>
            {STYLE_CATEGORIES.map(c => (
              <button key={c.id} type="button" className={css.button + (cat === c.id ? ' ' + css.buttonPrimary : '')} style={{ flex: 1, minWidth: 120 }} onClick={() => { setCat(c.id) }}>
                {c.icon} {c.label}（{baseStyles.filter(s => s.category === c.id).length}）
              </button>
            ))}
          </div>
          <div className={css.meta}>{STYLE_CATEGORIES.find(c => c.id === cat)?.desc}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--nf-space-12)', margin: '10px 0' }}>
            {baseStyles.filter(s => s.category === cat).map(s => (
              <StyleCard key={s.id} style={s} selected={selStyle === s.id} onClick={() => { pickStyle(s.id) }} />
            ))}
          </div>

          {filterStyles.length > 0 && (
            <div className={css.field}>
              <label className={css.fieldLabel}>叠加滤镜（可选）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                <button type="button" className={css.button + ' ' + css.buttonSmall + (selFilter === '' ? ' ' + css.buttonPrimary : '')} onClick={() => { setSelFilter('') }}>无</button>
                {filterStyles.map(s => (
                  <button key={s.id} type="button" className={css.button + ' ' + css.buttonSmall + (selFilter === s.id ? ' ' + css.buttonPrimary : '')} onClick={() => { setSelFilter(s.id) }}>{s.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className={css.field}>
            <label className={css.fieldLabel}>题材（可选，注入对应题材规则）</label>
            <select className={css.input} value={selGenre} onChange={e => { setSelGenre(e.target.value) }}>
              <option value="">通用（不限定）</option>
              {GENRES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div className={css.field}>
            <label className={css.fieldLabel}>方案名</label>
            <input className={css.input} value={planName} placeholder="例如：《保质期》3D 皮克斯版" onChange={e => { setPlanName(e.target.value) }} />
          </div>
          <div className={css.row}>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy || selStyle === '' || planName.trim() === ''} onClick={() => { void createPlan() }}>
              {busy ? '创建中…' : '🎬 创建方案'}
            </button>
            <span className={css.meta}>{selStyle !== '' ? '已选：' + (findStyle(selStyle)?.name ?? selStyle) : '点击卡片选择基底风格'}</span>
          </div>
        </div>
      )}

      {/* ② 一键生成页 */}
      {effectiveView === 2 && (
        <div className={css.card}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className={css.cardTitle}>② 一键生成 · 剧情+分镜+角色+提示词</span>
          </div>
          <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-4)' }}>
            选一章，点一键生成——系统自动拆剧情、生镜头、提名角色、自动导入分级、写视频提示词。完成后直接去定妆。
          </span>

          <div className={css.row} style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 'var(--nf-space-8)' }}>
            <div className={css.field} style={{ flex: 1, minWidth: 200 }}>
              <label className={css.fieldLabel}>选择章节</label>
              <select
                className={css.input}
                value={autoGenChapter ?? ''}
                onChange={e => { setAutoGenChapter(e.target.value !== '' ? Number(e.target.value) : null) }}
              >
                <option value="">（选择章节）</option>
                {chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error').map(c => (
                  <option key={c.no} value={c.no}>第{c.no}章 {c.title}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={css.button + ' ' + css.buttonPrimary}
              disabled={autoGenChapter === null || autoGenBusy}
              onClick={() => { void autoGenerate() }}
            >
              {autoGenBusy ? '生成中…（约1-2分钟）' : '⚡ 一键生成'}
            </button>
          </div>

          {chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error').length === 0 && (
            <div style={{ marginTop: 'var(--nf-space-8)', padding: 'var(--nf-space-10)', background: 'rgba(250,173,20,0.08)', border: '1px solid rgba(250,173,20,0.3)', borderRadius: 'var(--nf-radius-8)' }}>
              <span style={{ fontSize: 'var(--nf-fs-13)', color: '#b45309' }}>⚠️ 暂无已完成章节。请先在「小说工坊」写完章节，或点顶部「🔄 刷新」重新加载。</span>
            </div>
          )}

          {autoGenBusy && (
            <div style={{ marginTop: 'var(--nf-space-8)', padding: 'var(--nf-space-8)', background: 'rgba(139,200,234,0.1)', borderRadius: 'var(--nf-radius-8)' }}>
              <span className={css.meta}>正在生成：拆剧情 → 生镜头 → 提名角色 → 自动导入 → 写提示词…</span>
            </div>
          )}

          {autoGenResult !== null && !autoGenBusy && (
            <div style={{ marginTop: 'var(--nf-space-10)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-10)' }}>
              <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-14)' }}>✅ 生成完成</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-6)' }}>
                <div><div style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 600 }}>{autoGenResult.shotCount}</div><span className={css.meta}>镜头数</span></div>
                <div><div style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 600 }}>{autoGenResult.importedRoles}</div><span className={css.meta}>导入角色</span></div>
                <div><div style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 600, color: '#52C41A' }}>{autoGenResult.needMakeupRoles}</div><span className={css.meta}>需定妆</span></div>
                <div><div style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 600, color: '#888' }}>{autoGenResult.extraRoles}</div><span className={css.meta}>路人（不做图）</span></div>
                <div><div style={{ fontSize: 'var(--nf-fs-20)', fontWeight: 600, color: '#FAAD14' }}>{autoGenResult.pendingCandidates}</div><span className={css.meta}>待确认</span></div>
              </div>
              {autoGenResult.pendingCandidates > 0 && (
                <div style={{ marginTop: 'var(--nf-space-6)', padding: 'var(--nf-space-8)', background: 'var(--nf-warning-soft, #fffbeb)', borderRadius: 'var(--nf-radius-8)', border: '1px solid var(--nf-warning-border, #fde68a)' }}>
                  <span style={{ color: '#b45309', fontSize: 'var(--nf-fs-12)', fontWeight: 600 }}>⚠️ {autoGenResult.pendingCandidates} 个角色待确认：</span>
                  <span style={{ color: '#b45309', fontSize: 'var(--nf-fs-12)' }}>{autoGenResult.pendingRoleNames.join('、')}</span>
                  <button type="button" className={css.button + ' ' + css.buttonSmall} style={{ marginLeft: 'var(--nf-space-6)' }} onClick={() => { setRoleFocus('import'); setView(3) }}>去处理 →</button>
                </div>
              )}
              <div className={css.row} style={{ marginTop: 'var(--nf-space-10)' }}>
                <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} onClick={() => { setRoleFocus('cards'); setView(3) }}>下一步：③ 角色定妆 →</button>

              </div>
            </div>
          )}

        </div>
      )}
{/* ⑤⑥ 角色页（同一实例，focus 切换） */}
      {(effectiveView === 3) && (
        <MangaRoleLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          focus={roleFocus}
          showCards={true}
          chapterNo={effectiveChapter}
          onProgress={onProgress}
        />
      )}

      {/* ⑧ 场景库页 */}
      {effectiveView === 4 && (
        <SceneLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          chapterNo={effectiveChapter}
          onProgress={onProgress}
        />
      )}

      {/* 道具库页 */}
      {effectiveView === 6 && (
        <PropLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          onProgress={onProgress}
        />
      )}

      {/* ⑥ 分镜·提示词（专注提示词 + 导出存档） */}
      {effectiveView === 5 && (
        <>
          <StoryboardTab
            api={api}
            project={project}
            chapters={chapters}
            onProjectChanged={onProjectChanged}
            styleId={activePlan?.styleId}
            filterId={activePlan?.filterId}
            mode="prompts"
            onProgress={onProgress}
          />
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>📦 导出整章（存档到资产库 + 复制剪贴板）</span>
              <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} disabled={effectiveChapter === null} onClick={() => { if (effectiveChapter !== null) exportMangaPackage(effectiveChapter) }}>
                {exported ? '✅ 已保存+复制' : '📋 导出即梦素材包'}
              </button>
            </div>
            <span className={css.meta}>导出的素材包：角色/场景提示词 + 逐镜提示词（时间轴/台词）+ 整集脚本 + 步骤卡，整章落盘资产库并复制。无提示词的章节先在上面「生成视频提示词」。</span>
          </div>
        </>
      )}

      {/* 章节选择面板（长篇友好：搜索 + 状态） */}
      {showChapterPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nf-space-16)' }} onClick={() => { setShowChapterPicker(false); setChapterQuery('') }}>
          <div style={{ background: 'var(--nf-bg, #fff)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-16)', maxWidth: 640, width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--nf-border, #e4e3dd)' }} onClick={e => e.stopPropagation()}>
            <div className={css.row} style={{ justifyContent: 'space-between', marginBottom: 'var(--nf-space-12)' }}>
              <span className={css.cardTitle}>📚 选择章节</span>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setShowChapterPicker(false); setChapterQuery('') }}>X</button>
            </div>
            <input className={css.input} style={{ marginBottom: 'var(--nf-space-8)' }} placeholder="输入章节号或标题搜索…" value={chapterQuery} onChange={e => { setChapterQuery(e.target.value) }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)' }}>
              {writtenChapters.filter(c => {
                const q = chapterQuery.trim().toLowerCase()
                if (q === '') return true
                return String(c.no).includes(q) || (c.title ?? '').toLowerCase().includes(q)
              }).map(c => {
                const status = chapterStatus.get(c.no) ?? 'todo'
                const isActive = effectiveChapter === c.no
                const icon = status === 'done' ? '✅' : status === 'doing' ? '🔵' : '⚪'
                const label = status === 'done' ? '已完成' : status === 'doing' ? '进行中(待提示词)' : '未开始'
                return (
                  <button key={c.no} type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--nf-space-8)', padding: 'var(--nf-space-6) var(--nf-space-10)', borderRadius: 'var(--nf-radius-8)', border: isActive ? '2px solid var(--nf-accent)' : '1px solid var(--nf-border)', background: isActive ? 'var(--nf-accent-soft, rgba(139,200,234,0.15))' : 'var(--nf-bg)', cursor: 'pointer', textAlign: 'left' }} onClick={() => { setCurrentChapter(c.no); setAutoGenChapter(c.no); setShowChapterPicker(false); setChapterQuery('') }}>
                    <span style={{ fontSize: 'var(--nf-fs-13)' }}>第{c.no}章 {c.title ?? ''}</span>
                    <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-dim, #888)' }}>{icon} {label}</span>
                  </button>
                )
              })}
            </div>
            {writtenChapters.length === 0 && <span className={css.meta}>暂无已写章节，请先在「小说工坊」写章节。</span>}
          </div>
        </div>
      )}

      {/* 视觉规则悬浮窗 */}
      {showRulesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nf-space-16)' }} onClick={() => setShowRulesModal(false)}>
          <div style={{ background: 'var(--nf-bg, #fff)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-16)', maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--nf-border, #e4e3dd)' }} onClick={e => e.stopPropagation()}>
            <div className={css.row} style={{ justifyContent: 'space-between', marginBottom: 'var(--nf-space-12)' }}>
              <span className={css.cardTitle}>视觉规则</span>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => setShowRulesModal(false)}>X</button>
            </div>
            <span className={css.meta} style={{ display: 'block', marginBottom: 'var(--nf-space-12)' }}>从道藏提炼，生图/生视频时强制注入，防止模型画错反常识设定。最多12条，每条80字内。</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
              {rulesDraft.map((r, i) => (
                <div key={i} className={css.row} style={{ gap: 'var(--nf-space-8)' }}>
                  <span style={{ minWidth: 24, color: 'var(--nf-text-secondary, #6b7280)', fontSize: 'var(--nf-fs-12)' }}>{i + 1}.</span>
                  <input
                    type="text"
                    className={css.input}
                    style={{ flex: 1 }}
                    value={r}
                    maxLength={80}
                    onChange={e => { const next = [...rulesDraft]; next[i] = e.target.value; setRulesDraft(next) }}
                  />
                  <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => setRulesDraft(rulesDraft.filter((_, idx) => idx !== i))}>删</button>
                </div>
              ))}
              {rulesDraft.length === 0 && <span className={css.meta}>暂无规则，点重新提炼从道藏生成，或添加手动添加。</span>}
            </div>
            <div className={css.row} style={{ marginTop: 'var(--nf-space-16)', gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => setRulesDraft([...rulesDraft, ''])}>+ 添加</button>
              <button
                type="button"
                className={css.button + ' ' + css.buttonSmall}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const res = await api.visualRules({ op: 'extract' })
                    setRulesDraft(res.rules ?? [])
                    await refresh()
                  } catch (err) { setError((err as Error).message) }
                  finally { setBusy(false) }
                }}
              >
                重新提炼
              </button>
              <button
                type="button"
                className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const cleaned = rulesDraft.map(r => r.trim()).filter(r => r !== '').slice(0, 12)
                    await api.visualRules({ op: 'save', rules: cleaned })
                    setRulesDraft(cleaned)
                    await refresh()
                    setShowRulesModal(false)
                  } catch (err) { setError((err as Error).message) }
                  finally { setBusy(false) }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
