/**
 * 漫剧角色库（制作角色投影）：
 * 从本集分镜提名 → 小说角色库匹配（规则过滤 + LLM 确认两段式）→ 导入建卡。
 * 独立存储于 project.mangaRoles；sourceRoleName 只读追溯，禁止反向写回小说库。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NovelApi } from '../api.ts'
import type { ImageModelConfig, MangaRoleCandidate, MangaRoleCard, ProjectState } from '../../protocol.ts'
import css from './panel.module.css'

const CORE_FUNCTIONS: Array<{ id: MangaRoleCard['coreFunction']; label: string }> = [
  { id: 'protagonist', label: '主角' },
  { id: 'antagonist', label: '反派' },
  { id: 'love_interest', label: '感情线' },
  { id: 'mentor', label: '导师' },
  { id: 'sidekick', label: '搭档' },
  { id: 'informant', label: '线人' },
  { id: 'functional', label: '功能性' },
]

const RELATIONS: Array<{ id: MangaRoleCard['protagonistRelation']; label: string }> = [
  { id: 'enemy', label: '敌对' },
  { id: 'friend', label: '友方' },
  { id: 'mentor', label: '师徒' },
  { id: 'lover', label: '情感' },
  { id: 'exploit', label: '利用' },
  { id: 'neutral', label: '中立' },
]

const STATUS_LABEL: Record<MangaRoleCard['status'], string> = {
  pending_match: '待匹配',
  pending_confirm: '待确认',
  imported: '已导入',
  anchored: '已定妆',
  archived: '已归档',
}

const STATUS_CLASS: Record<MangaRoleCard['status'], string> = {
  pending_match: css.badgePending,
  pending_confirm: css.badgePending,
  imported: css.badgeWritten,
  anchored: css.badgeDone,
  archived: css.badgePending,
}

interface Draft {
  name: string
  identity: string
  coreFunction: MangaRoleCard['coreFunction']
  protagonistRelation: MangaRoleCard['protagonistRelation']
  speechStyle: string
  traits: string
  appearance: string
  keyScenes: string
  tier: 'protagonist' | 'supporting' | 'extra'
}

const emptyDraft = (): Draft => ({
  name: '',
  identity: '',
  coreFunction: 'functional',
  protagonistRelation: 'neutral',
  speechStyle: '',
  traits: '',
  appearance: '',
  keyScenes: '',
  tier: 'protagonist',
})

const draftFromSuggested = (s: MangaRoleCandidate['suggested'], tier?: MangaRoleCard['tier']): Draft => ({
  name: s.name,
  identity: s.identity,
  coreFunction: s.coreFunction,
  protagonistRelation: s.protagonistRelation,
  speechStyle: s.speechStyle,
  traits: s.traits.join('、'),
  appearance: s.appearance,
  keyScenes: s.keyScenes.join('；'),
  tier: tier ?? 'protagonist',
})

const draftFromCard = (c: MangaRoleCard): Draft => ({
  name: c.name,
  identity: c.identity,
  coreFunction: c.coreFunction,
  protagonistRelation: c.protagonistRelation,
  speechStyle: c.speechStyle,
  traits: c.traits.join('、'),
  appearance: c.appearance,
  keyScenes: c.keyScenes.join('；'),
  tier: c.tier ?? 'protagonist',
})

/** 草稿 → 漫剧卡（保留已有形象资产；新建时 id 为空由服务端分配）。 */
const draftToCard = (d: Draft, sourceRoleName: string | undefined, chapterNo: number | undefined, existing?: MangaRoleCard): MangaRoleCard => {
  const now = new Date().toISOString()
  const traits = d.traits.split(/[、,，]/).map(t => t.trim()).filter(t => t !== '').slice(0, 3)
  const keyScenes = d.keyScenes.split(/[；;]/).map(k => k.trim()).filter(k => k !== '').slice(0, 5)
  const episodes = existing !== undefined
    ? (chapterNo !== undefined && chapterNo > 0 && !existing.appearsInEpisodes.includes(chapterNo)
      ? [...existing.appearsInEpisodes, chapterNo].sort((a, b) => a - b)
      : existing.appearsInEpisodes)
    : (chapterNo !== undefined && chapterNo > 0 ? [chapterNo] : [])
  return {
    id: existing?.id ?? '',
    sourceRoleName,
    name: d.name.trim(),
    identity: d.identity.trim(),
    coreFunction: d.coreFunction,
    protagonistRelation: d.protagonistRelation,
    speechStyle: d.speechStyle.trim(),
    traits,
    appearance: d.appearance.trim(),
    tier: d.tier,
    keyScenes,
    appearsInEpisodes: episodes,
    status: existing?.status ?? 'imported',
    imagePrompt: existing?.imagePrompt,
    expressions: existing?.expressions,
    promptKit: existing?.promptKit,
    imageUrl: existing?.imageUrl,
    gallery: existing?.gallery,
    promptStyleId: existing?.promptStyleId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function MangaRoleLibrary({
  api,
  project,
  refresh,
  styleId,
  filterId,
  focus,
  showCards,
  chapterNo: externalChapter,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  refresh: () => void | Promise<void>
  styleId?: string
  filterId?: string
  /** 是否启用生图（豆包等出定妆图）。 */
  imageApiEnabled?: boolean
  /** 生图模型库（出定妆图时可选择用哪条）。 */
  imageModels?: ImageModelConfig[]
  /** 步骤页聚焦：import=展开并滚动到导入区；cards=滚动到已建漫剧卡列表。 */
  focus?: 'import' | 'cards'
  /** 是否显示「已建漫剧卡」列表（第⑤步导入页可隐藏，只留导入区）。 */
  showCards?: boolean
  /** 全局当前章节（从工作台顶部导航条传入）。 */
  chapterNo?: number | null
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const cards = useMemo(() => project?.mangaRoles ?? [], [project?.mangaRoles])
  /** 已生成过分镜的已写章节（提名入口按章选择）。 */
  const sbChapters = useMemo(() => {
    const withSb = new Set((project?.storyboards ?? []).map(e => e.chapterNo))
    return (project?.chapters ?? [])
      .filter(c => withSb.has(c.no) && c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error')
      .sort((a, b) => a.no - b.no)
  }, [project?.storyboards, project?.chapters])

  // 外部章节变化时同步内部状态
  useEffect(() => {
    if (externalChapter !== undefined && externalChapter !== null) {
      setChapterNo(externalChapter)
    }
  }, [externalChapter])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [chapterNo, setChapterNo] = useState<number>(externalChapter ?? 0)
  const [candidates, setCandidates] = useState<MangaRoleCandidate[] | null>(null)
  const [showExtraCandidates, setShowExtraCandidates] = useState(false)
  const [ignoredCandidates, setIgnoredCandidates] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft())
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  /** 定妆图上传目标卡 id（null=未打开）。 */
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [actingId, setActingId] = useState('')
  const [uploadLabel, setUploadLabel] = useState('立绘')
  /** 详情弹窗当前角色卡 id（null=未打开）。 */
  const [detailCardId, setDetailCardId] = useState<string | null>(null)
  /** tier 筛选：all/protagonist/supporting/extra。 */
  const [tierFilter, setTierFilter] = useState<'all' | 'protagonist' | 'supporting' | 'extra'>('all')
  const [showShortDramaCheck, setShowShortDramaCheck] = useState(false)
  const [showAdvancedPrompts, setShowAdvancedPrompts] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  /** 步骤页滚动目标（第⑤步导入区 / 第⑥步卡片列表）。 */
  const headerCardRef = useRef<HTMLDivElement | null>(null)
  const cardsCardRef = useRef<HTMLDivElement | null>(null)

  // 步骤页聚焦：变化时展开/滚动到对应区域。
  useEffect(() => {
    if (focus === 'import') {
      setImportOpen(true)
      // 自动选中第一个有分镜的章节
      if (chapterNo === 0 && sbChapters[0] !== undefined) setChapterNo(sbChapters[0].no)
      window.setTimeout(() => { headerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 60)
    } else if (focus === 'cards') {
      setImportOpen(false)
      window.setTimeout(() => { cardsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 60)
    }
  }, [focus])

  // 聚焦到导入页且章节已选、候选未加载时，自动提名（无需用户再点按钮）。
  useEffect(() => {
    if (focus === 'import' && chapterNo > 0 && candidates === null && !busy) {
      void runNominate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, chapterNo])

  const notify = (msg: string): void => { setNotice(msg); setTimeout(() => { setNotice('') }, 4000) }
  const report = (text: string, kind: 'info' | 'done' | 'error' = 'info'): void => { onProgress?.(text, kind) }
  const setDraft = (key: string, patch: Partial<Draft>): void => {
    setDrafts(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyDraft()), ...patch } }))
  }

  const runNominate = async (): Promise<void> => {
    if (chapterNo <= 0) return
    setBusy(true)
    setError('')
    report('第' + chapterNo + '章 漫剧角色提名中…')
    try {
      const res = await api.mangaRoles({ op: 'nominate', chapterNo })
      setCandidates(res.candidates ?? null)
      setIgnoredCandidates(new Set())
      const d: Record<string, Draft> = {}
      const c: Record<string, string> = {}
      for (const cand of res.candidates ?? []) {
        if (cand.verdict === 'already_imported') continue
        d[cand.rawName] = draftFromSuggested(cand.suggested, cand.tier)
        if (cand.matchedRoleName !== undefined) c[cand.rawName] = cand.matchedRoleName
      }
      setDrafts(d)
      setChosen(c)
      report('第' + chapterNo + '章 漫剧角色提名完成（' + (res.candidates ?? []).length + ' 个候选）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('第' + chapterNo + '章 漫剧角色提名失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  const adoptCandidate = async (cand: MangaRoleCandidate): Promise<void> => {
    const d = drafts[cand.rawName]
    if (d === undefined || d.name.trim() === '') {
      setError('角色名不能为空')
      return
    }
    const source = cand.verdict === 'matched' ? (chosen[cand.rawName] ?? cand.matchedRoleName) : undefined
    setBusy(true)
    setError('')
    report('导入漫剧角色「' + d.name.trim() + '」…')
    try {
      const card = draftToCard(d, source, chapterNo)
      await api.mangaRoles({ op: 'adopt', card })
      setCandidates(prev => (prev ?? []).filter(x => x.rawName !== cand.rawName))
      await refresh()
      report('已导入漫剧角色「' + d.name.trim() + '」', 'done')
      notify('已导入「' + d.name.trim() + '」——可继续生成形象锚点')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('导入漫剧角色失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  const genVisual = async (id: string, name: string): Promise<void> => {
    setActingId(id)
    setError('')
    report('生成「' + name + '」形象锚点…')
    try {
      await api.mangaRoles({ op: 'visual', id, styleId, filterId })
      await refresh()
      report('已生成「' + name + '」形象锚点', 'done')
      notify('「' + name + '」已定妆（锚点+精修包已写入）')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('「' + name + '」形象锚点生成失败：' + m, 'error')
    } finally {
      setActingId('')
    }
  }

  const genKit = async (id: string, name: string): Promise<void> => {
    setActingId(id)
    setError('')
    report('精修「' + name + '」四类生图提示词…')
    try {
      await api.mangaRoles({ op: 'promptKit', id, styleId, filterId })
      await refresh()
      report('已精修「' + name + '」提示词包', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('「' + name + '」提示词精修失败：' + m, 'error')
    } finally {
      setActingId('')
    }
  }

  const removeCard = async (c: MangaRoleCard): Promise<void> => {
    if (!window.confirm('删除漫剧角色「' + c.name + '」？只删漫剧卡，不影响小说角色库与分镜。')) return
    setActingId(c.id)
    setError('')
    try {
      await api.mangaRoles({ op: 'remove', id: c.id })
      await refresh()
      report('已删除漫剧角色「' + c.name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('删除漫剧角色失败：' + m, 'error')
    } finally {
      setActingId('')
    }
  }

  /** 定妆图上传：文件 → dataURL → op=image（带标签进图集，立绘同步为参考图）。 */
  const onUploadFile = async (cardId: string, file: File | null): Promise<void> => {
    if (file === null) return
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
    setActingId(cardId)
    setError('')
    const label = uploadLabel.trim() !== '' ? uploadLabel.trim() : '立绘'
    report('上传「' + label + '」定妆图…')
    try {
      await api.mangaRoles({ op: 'image', id: cardId, dataUrl, label })
      setUploadTarget(null)
      await refresh()
      report('已上传「' + label + '」定妆图', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('定妆图上传失败：' + m, 'error')
    } finally {
      setActingId('')
    }
  }

  const removeImage = async (c: MangaRoleCard, label: string): Promise<void> => {
    setActingId(c.id)
    setError('')
    try {
      await api.mangaRoles({ op: 'removeImage', id: c.id, label: label !== '' ? label : undefined })
      await refresh()
      report('已移除「' + c.name + '」的' + (label !== '' ? label + '图' : '参考图'), 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('移除定妆图失败：' + m, 'error')
    } finally {
      setActingId('')
    }
  }


  /** 一键复制所有角色提示词。 */
  const copyAllPrompts = async (): Promise<void> => {
    const lines: string[] = []
    for (const c of cards) {
      if (c.imagePrompt === undefined) continue
      lines.push('=== ' + c.name + '（' + (c.tier === 'extra' ? '路人' : c.tier === 'supporting' ? '配角' : '主角') + '）===')
      lines.push('正面：' + c.imagePrompt.zh)
      if (c.imagePrompt.negativePrompt !== undefined && c.imagePrompt.negativePrompt !== '') {
        lines.push('负面：' + c.imagePrompt.negativePrompt)
      }
      lines.push('')
    }
    if (lines.length === 0) {
      notify('还没有角色生成提示词')
      return
    }
    await navigator.clipboard?.writeText(lines.join('\n'))
    notify('已复制 ' + cards.filter(c => c.imagePrompt !== undefined).length + ' 个角色的提示词')
  }

  /** 短剧精简模式开关（5-8 上镜角色 / 功能标签 / 关系闭环 / 人设极致化）。 */
  const toggleShortDrama = async (): Promise<void> => {
    setBusy(true)
    setError('')
    const next = project?.shortDramaMode !== true
    report(next ? '开启短剧精简模式…' : '关闭短剧精简模式…')
    try {
      await api.mangaRoles({ op: 'mode', shortDramaMode: next })
      await refresh()
      report(next ? '已开启短剧精简模式' : '已关闭短剧精简模式', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('切换短剧精简模式失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  const createCard = async (): Promise<void> => {
    if (createDraft.name.trim() === '') {
      setError('角色名不能为空')
      return
    }
    setBusy(true)
    setError('')
    report('新建漫剧角色「' + createDraft.name.trim() + '」…')
    try {
      const card = draftToCard(createDraft, undefined, chapterNo > 0 ? chapterNo : undefined)
      await api.mangaRoles({ op: 'adopt', card })
      setCreateOpen(false)
      setCreateDraft(emptyDraft())
      await refresh()
      report('已新建漫剧角色「' + card.name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('新建漫剧角色失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (c: MangaRoleCard): void => {
    setEditId(c.id)
    setEditDraft(draftFromCard(c))
    setError('')
  }

  const saveEdit = async (): Promise<void> => {
    if (editId === null || editDraft === null) return
    if (editDraft.name.trim() === '') {
      setError('角色名不能为空')
      return
    }
    const existing = cards.find(c => c.id === editId)
    if (existing === undefined) return
    setBusy(true)
    setError('')
    try {
      const card = draftToCard(editDraft, existing.sourceRoleName, undefined, existing)
      await api.mangaRoles({ op: 'update', card })
      setEditId(null)
      setEditDraft(null)
      await refresh()
      report('已更新漫剧角色「' + card.name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('更新漫剧角色失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 漫剧卡通用编辑字段（提名候选 / 新建 / 编辑共用）。 */
  const draftFields = (d: Draft, onChange: (patch: Partial<Draft>) => void): ReactNode => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--nf-space-6)' }}>
      <div className={css.field}>
        <label className={css.fieldLabel}>漫剧用名</label>
        <input className={css.input} value={d.name} onChange={e => onChange({ name: e.target.value })} placeholder="可短剧化改名" />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>身份一句话</label>
        <input className={css.input} value={d.identity} onChange={e => onChange({ identity: e.target.value })} placeholder="如：超市收银员" />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>核心功能</label>
        <select className={css.input} value={d.coreFunction} onChange={e => onChange({ coreFunction: e.target.value as MangaRoleCard['coreFunction'] })}>
          {CORE_FUNCTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>与主角关系</label>
        <select className={css.input} value={d.protagonistRelation} onChange={e => onChange({ protagonistRelation: e.target.value as MangaRoleCard['protagonistRelation'] })}>
          {RELATIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>性格标签（≤3，顿号分隔）</label>
        <input className={css.input} value={d.traits} onChange={e => onChange({ traits: e.target.value })} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>辨识度外貌点</label>
        <input className={css.input} value={d.appearance} onChange={e => onChange({ appearance: e.target.value })} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>定妆级别</label>
        <select className={css.input} value={d.tier} onChange={e => onChange({ tier: e.target.value as Draft['tier'] })}>
          <option value="protagonist">主角（完整四件套）</option>
          <option value="supporting">配角（仅立绘）</option>
          <option value="extra">路人（不做定妆）</option>
        </select>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>口头禅/说话方式</label>
        <input className={css.input} value={d.speechStyle} onChange={e => onChange({ speechStyle: e.target.value })} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel}>关键剧情节点（；分隔）</label>
        <input className={css.input} value={d.keyScenes} onChange={e => onChange({ keyScenes: e.target.value })} placeholder="第3章 对峙；第11章 真相" />
      </div>
    </div>
  )

  const shortDrama = project?.shortDramaMode === true
  const presentFunctions = new Set(cards.map(c => c.coreFunction))
  const presentRelations = new Set(cards.map(c => c.protagonistRelation))

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入漫剧角色库。</span></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
      <div ref={headerCardRef} className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎭 漫剧角色库</span>
          <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall + (shortDrama ? ' ' + css.buttonPrimary : '')}
              disabled={busy}
              onClick={() => { void toggleShortDrama() }}
              title="短剧精简：漫剧角色库按 5-8 上镜角色 / 功能标签 / 关系闭环 / 人设极致化约束"
            >
              📺 短剧精简模式：{shortDrama ? '开' : '关'}
            </button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary}
              disabled={busy}
              onClick={() => {
                setImportOpen(!importOpen)
                if (chapterNo === 0 && sbChapters[0] !== undefined) setChapterNo(sbChapters[0].no)
                setError('')
              }}
            >
              📥 从本集分镜导入角色
            </button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              disabled={busy}
              onClick={() => { setCreateOpen(!createOpen); setError('') }}
            >
              ＋ 直接新建漫剧卡
            </button>
          </div>
        </div>
        <span className={css.meta}>漫剧角色库 = 上镜角色（要出定妆图/锁一致性）。由分镜提名导入，独立于小说角色库；来源只读追溯、不回写。</span>
        <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-2)' }}>流程位置：第③步角色定妆 · 前置：一键生成已完成（分镜+提名+提示词已自动生成）· 下一步：第④步场景底图 → 第⑤步导出即梦脚本</span>
        {styleId !== undefined && (
          <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-4)' }}>
            🎨 当前方案：{styleId}（锚点/精修按此风格生成）
          </span>
        )}
        {shortDrama && (
          <div style={{ marginTop: 'var(--nf-space-8)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', overflow: 'hidden' }}>
            <button type="button" onClick={() => { setShowShortDramaCheck(prev => !prev) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <b>📺 短剧精简检查</b>
              <span className={css.badge + (cards.length >= 5 && cards.length <= 8 ? ' ' + css.badgeDone : ' ' + css.badgePending)}>
                上镜角色 {cards.length}/5-8
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-secondary)' }}>{showShortDramaCheck ? '▲ 收起' : '▼ 展开'}</span>
            </button>
            {showShortDramaCheck && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', padding: '0 var(--nf-space-10) var(--nf-space-8)', borderTop: '1px solid var(--nf-border)' }}>
                {cards.length > 8 && <span className={css.meta}>⚠ 超员：建议把功能性/低戏份角色归档或删除</span>}
                {cards.length < 5 && cards.length > 0 && <span className={css.meta}>提示：5 人以下张力偏弱，可补关键角色</span>}
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>功能覆盖：</span>
                  {CORE_FUNCTIONS.filter(f => f.id !== 'functional').map(f => (
                    <span key={f.id} className={css.badge + (presentFunctions.has(f.id) ? ' ' + css.badgeDone : ' ' + css.badgePending)}>
                      {f.label}{presentFunctions.has(f.id) ? '' : '（缺）'}
                    </span>
                  ))}
                </div>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>关系闭环（与主角）：</span>
                  {RELATIONS.map(r => (
                    <span key={r.id} className={css.badge + (presentRelations.has(r.id) ? ' ' + css.badgeDone : ' ' + css.badgePending)}>
                      {r.label}{presentRelations.has(r.id) ? '' : '（缺）'}
                    </span>
                  ))}
                </div>
                <span className={css.meta}>人设极致化：提名只保留上镜角色；锚点/精修已注入「性格标签极致化、1-2 个最强辨识度外貌点」提示。</span>
              </div>
            )}
          </div>
        )}
        {error !== '' && <div className={css.importError}>{error}</div>}
        {notice !== '' && <span className={css.meta} style={{ color: 'var(--nf-accent)' }}>{notice}</span>}

        {importOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-10)' }}>
            <div className={css.row} style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className={css.field} style={{ flex: 1, minWidth: 220 }}>
                <label className={css.fieldLabel}>选择已生成分镜的章节</label>
                <select
                  className={css.input}
                  value={chapterNo === 0 ? '' : chapterNo}
                  onChange={e => { setChapterNo(Number(e.target.value)); setCandidates(null); setError('') }}
                >
                  {sbChapters.length === 0 && <option value="">（没有已生成分镜的章节）</option>}
                  {sbChapters.map(c => <option key={c.no} value={c.no}>第{c.no}章 {c.title}</option>)}
                </select>
              </div>
              <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy || chapterNo <= 0} onClick={() => { void runNominate() }}>
                {busy ? '提名中…' : '🔍 提名角色（规则过滤 + LLM 确认）'}
              </button>
            </div>
            <span className={css.meta}>流程：从本章分镜的结构化 characters 提名 → 与小说角色库匹配 → 确认后导入为漫剧卡。</span>

            {candidates !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-6)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <b>提名候选（{candidates.filter(c => !ignoredCandidates.has(c.rawName)).length}）· 主角 {candidates.filter(c => c.tier === 'protagonist' && !ignoredCandidates.has(c.rawName)).length} · 配角 {candidates.filter(c => c.tier === 'supporting' && !ignoredCandidates.has(c.rawName)).length} · 路人 {candidates.filter(c => (c.tier === 'extra' || c.tier === undefined) && !ignoredCandidates.has(c.rawName)).length}</b>
                  <div className={css.row} style={{ gap: 'var(--nf-space-4)' }}>
                    {candidates.some(c => (c.tier === 'extra' || c.tier === undefined) && !ignoredCandidates.has(c.rawName)) && (
                      <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => {
                        const extraNames = candidates.filter(c => (c.tier === 'extra' || c.tier === undefined)).map(c => c.rawName)
                        setIgnoredCandidates(prev => new Set([...prev, ...extraNames]))
                      }}>全部忽略路人</button>
                    )}
                    <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setCandidates(null) }}>收起</button>
                  </div>
                </div>
                {candidates.length === 0 && <span className={css.meta}>该章分镜的角色已全部导入漫剧角色库。</span>}
                {(() => {
                  const prot = candidates.filter(c => c.tier === 'protagonist' && !ignoredCandidates.has(c.rawName))
                  const supp = candidates.filter(c => c.tier === 'supporting' && !ignoredCandidates.has(c.rawName))
                  const extra = candidates.filter(c => (c.tier === 'extra' || c.tier === undefined) && !ignoredCandidates.has(c.rawName))
                  const renderCand = (cand: MangaRoleCandidate) => {
                  if (cand.verdict === 'already_imported') {
                    return (
                      <div key={cand.rawName} style={{ display: 'flex', gap: 'var(--nf-space-8)', alignItems: 'center', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-6) var(--nf-space-10)', opacity: 0.65 }}>
                        <b>{cand.rawName}</b>
                        <span className={css.badge + ' ' + css.badgeDone}>已导入</span>
                      </div>
                    )
                  }
                  const d = drafts[cand.rawName] ?? emptyDraft()
                  const isMatched = cand.verdict === 'matched'
                  const isAmbiguous = cand.verdict === 'ambiguous'
                  return (
                    <div key={cand.rawName} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)' }}>
                      <div className={css.row} style={{ flexWrap: 'wrap' }}>
                        <b>🎭 {cand.rawName}</b>
                        {cand.tier === 'protagonist' && <span className={css.badge + ' ' + css.badgePrimary}>主角</span>}
                        {cand.tier === 'supporting' && <span className={css.badge}>配角</span>}
                        {(cand.tier === 'extra' || cand.tier === undefined) && <span className={css.badge + ' ' + css.badgePending}>路人</span>}
                        {isMatched && <span className={css.badge + ' ' + css.badgeDone}>✓ 匹配：{chosen[cand.rawName] ?? cand.matchedRoleName ?? ''}</span>}
                        {isAmbiguous && <span className={css.badge + ' ' + css.badgePending}>？多个候选待定</span>}
                        {cand.verdict === 'not_in_library' && cand.novelHint === 'backfill' && (
                          <span className={css.badge + ' ' + css.badgePending}>⚠ 小说库未收录（正文有此称谓）</span>
                        )}
                        {cand.verdict === 'not_in_library' && cand.novelHint !== 'backfill' && (
                          <span className={css.badge}>＋ 漫剧新增角色</span>
                        )}
                      </div>
                      {(isMatched || isAmbiguous) && cand.matches.length > 1 && (
                        <div className={css.row} style={{ flexWrap: 'wrap' }}>
                          <span className={css.meta}>命中角色：</span>
                          <select
                            className={css.input}
                            style={{ width: 'auto', padding: 'var(--nf-space-4) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}
                            value={chosen[cand.rawName] ?? ''}
                            onChange={e => { setChosen(prev => ({ ...prev, [cand.rawName]: e.target.value })) }}
                          >
                            {cand.matches.map(m => <option key={m.roleName} value={m.roleName}>{m.roleName}（{m.reason}）</option>)}
                          </select>
                        </div>
                      )}
                      {cand.verdict === 'not_in_library' && cand.novelHint === 'backfill' && (
                        <span className={css.meta}>
                          提示：正文出现过「{cand.rawName}」但小说角色库没提炼到——可先去左侧「角色库」补提炼再重新提名；或直接以漫剧新增角色建卡。
                        </span>
                      )}
                      {draftFields(d, patch => { setDraft(cand.rawName, patch) })}
                      <div className={css.row}>
                        <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} disabled={busy} onClick={() => { void adoptCandidate(cand) }}>
                          📥 导入为漫剧卡
                        </button>
                        <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { setIgnoredCandidates(prev => new Set(prev).add(cand.rawName)) }}>
                          忽略
                        </button>
                        <span className={css.meta}>导入后可在下方卡片继续生成形象锚点</span>
                      </div>
                    </div>
                                    )
                  }
                  return (
                    <>
                      {prot.length > 0 && <div style={{ fontWeight: 600, fontSize: 'var(--nf-fs-13)', marginTop: 'var(--nf-space-4)' }}>⭐ 主角（{prot.length}）</div>}
                      {prot.map(renderCand)}
                      {supp.length > 0 && <div style={{ fontWeight: 600, fontSize: 'var(--nf-fs-13)', marginTop: 'var(--nf-space-4)' }}>👥 配角（{supp.length}）</div>}
                      {supp.map(renderCand)}
                      {extra.length > 0 && (
                        <div style={{ marginTop: 'var(--nf-space-4)' }}>
                          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setShowExtraCandidates(prev => !prev) }}>
                            {showExtraCandidates ? '▼ 收起路人' : '▶ 展开路人（' + extra.length + '）'}
                          </button>
                          {showExtraCandidates && extra.map(renderCand)}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {createOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-10)' }}>
            <b>＋ 新建漫剧卡（不关联小说角色库）</b>
            {draftFields(createDraft, patch => { setCreateDraft(prev => ({ ...prev, ...patch })) })}
            <div className={css.row}>
              <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} disabled={busy} onClick={() => { void createCard() }}>
                💾 保存漫剧卡
              </button>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setCreateOpen(false) }}>取消</button>
            </div>
          </div>
        )}
      </div>

      {showCards !== false && (
<div ref={cardsCardRef} className={css.card}>
  <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
    <b>已建漫剧卡（{cards.length}）· {cards.filter(c => c.status === 'anchored').length} 张已定妆</b>
    <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
      <select
        className={css.input}
        style={{ width: 'auto', padding: 'var(--nf-space-4) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}
        value={tierFilter}
        onChange={e => { setTierFilter(e.target.value as typeof tierFilter) }}
      >
        <option value="all">全部角色</option>
        <option value="protagonist">主角</option>
        <option value="supporting">配角</option>
        <option value="extra">路人</option>
      </select>
      <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void copyAllPrompts() }}>
        📋 复制全部提示词
      </button>
    </div>
  </div>
  <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-4)' }}>点击卡片查看详情和各图说明；路人角色不做定妆，仅保留提示词。</span>

  {(() => {
    const filtered = tierFilter === 'all' ? cards : cards.filter(c => (c.tier ?? 'protagonist') === tierFilter)
    if (filtered.length === 0) {
      return <div className={css.meta} style={{ marginTop: 'var(--nf-space-8)' }}>该分类下暂无角色。</div>
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-10)' }}>
        {filtered.map(c => {
          const isExtra = c.tier === 'extra'
          const hasImage = c.imageUrl !== undefined
          const tierLabel = c.tier === 'supporting' ? '配角' : c.tier === 'extra' ? '路人' : '主角'
          const tierColor = c.tier === 'extra' ? '#9ca3af' : c.tier === 'supporting' ? '#3b82f6' : '#ef4444'
          const funcLabel = CORE_FUNCTIONS.find(f => f.id === c.coreFunction)?.label ?? c.coreFunction
          const relLabel = RELATIONS.find(r => r.id === c.protagonistRelation)?.label ?? c.protagonistRelation
          return (
            <div
              key={c.id}
              onClick={() => { setDetailCardId(c.id) }}
              style={{
                cursor: 'pointer',
                border: '1px solid var(--nf-border)',
                borderRadius: 'var(--nf-radius-10)',
                padding: 'var(--nf-space-8)',
                display: 'flex',
                flexDirection: 'row',
                gap: 'var(--nf-space-8)',
                opacity: isExtra ? 0.55 : 1,
                background: hasImage ? 'rgba(82,196,26,0.04)' : 'transparent',
                transition: 'box-shadow 0.15s',
                alignItems: 'flex-start',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
            >
              <div style={{ width: 120, minWidth: 120, aspectRatio: '3/4', borderRadius: 'var(--nf-radius-8)', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasImage ? (
                  <img src={c.imageUrl} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : isExtra ? (
                  <span style={{ fontSize: 'var(--nf-fs-11)', color: '#9ca3af', textAlign: 'center' }}>路人·不做图</span>
                ) : (
                  <span style={{ fontSize: 'var(--nf-fs-11)', color: '#9ca3af', textAlign: 'center' }}>待定妆</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)' }}>
                <div className={css.row} style={{ gap: 'var(--nf-space-4)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--nf-fs-14)' }}>{c.name}</span>
                  <span style={{ fontSize: 'var(--nf-fs-11)', color: tierColor, border: '1px solid ' + tierColor + '40', borderRadius: 'var(--nf-radius-999)', padding: '0 var(--nf-space-6)' }}>{tierLabel}</span>
                </div>
                {c.identity !== '' && <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-secondary)' }}>{c.identity}</span>}
                <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-secondary)' }}>功能：{funcLabel} · 关系：{relLabel}</span>
                {c.traits.length > 0 && <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-secondary)' }}>性格：{c.traits.join('、')}</span>}
                {c.appearance !== '' && <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>外貌：{c.appearance}</span>}
                <span style={{ fontSize: 'var(--nf-fs-12)', color: hasImage ? '#52C41A' : '#9ca3af', marginTop: 'auto' }}>{hasImage ? '✅ 已定妆' : isExtra ? '— 跳过' : '⏳ 待生成'}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  })()}
</div>
)}

{/* 角色详情弹窗 */}
{detailCardId !== null && (() => {
  const c = cards.find(x => x.id === detailCardId)
  if (c === undefined) return null
  const isExtra = c.tier === 'extra'
  const tierLabel = c.tier === 'supporting' ? '配角' : c.tier === 'extra' ? '路人' : '主角'
  const tierColor = c.tier === 'extra' ? 'var(--nf-text-secondary)' : c.tier === 'supporting' ? '#3b82f6' : '#ef4444'
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nf-space-10)' }}
      onClick={() => { setDetailCardId(null) }}
    >
      <div
        className={css.card}
        style={{ maxWidth: 680, width: '100%', maxHeight: '85vh', overflowY: 'auto', margin: 0 }}
        onClick={e => { e.stopPropagation() }}
      >
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <span className={css.cardTitle}>🎭 {c.name}</span>
            <span style={{ marginLeft: 'var(--nf-space-6)', fontSize: 'var(--nf-fs-12)', color: tierColor }}>[{tierLabel}]</span>
            {c.identity !== '' && <span className={css.meta} style={{ marginLeft: 'var(--nf-space-6)' }}>{c.identity}</span>}
          </div>
          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setDetailCardId(null) }}>✕ 关闭</button>
        </div>

        {/* 基本信息 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--nf-space-4)', marginTop: 'var(--nf-space-8)' }}>
          <span className={css.meta}>功能：{CORE_FUNCTIONS.find(f => f.id === c.coreFunction)?.label ?? c.coreFunction}</span>
          <span className={css.meta}>与主角：{RELATIONS.find(r => r.id === c.protagonistRelation)?.label ?? c.protagonistRelation}</span>
          {c.traits.length > 0 && <span className={css.meta}>性格：{c.traits.join('、')}</span>}
          {c.appearance !== '' && <span className={css.meta}>外貌：{c.appearance}</span>}
          {c.speechStyle !== '' && <span className={css.meta}>说话：{c.speechStyle}</span>}
        </div>

        {/* 立绘 */}
        {!isExtra && (
          <div style={{ marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)' }}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>📌 立绘（即梦智能角色参考图）</span>
              <span className={css.meta}>上传到即梦「智能角色」，全片保持脸盲一致</span>
            </div>
            <div className={css.row} style={{ marginTop: 'var(--nf-space-6)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {c.imageUrl !== undefined ? (
                <img src={c.imageUrl} alt={c.name + ' 立绘'} style={{ maxHeight: 180, borderRadius: 'var(--nf-radius-8)', border: '1px solid var(--nf-border)' }} />
              ) : (
                <div style={{ width: 120, height: 160, background: 'var(--nf-bg)', borderRadius: 'var(--nf-radius-8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className={css.meta}>待定妆</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)' }}>
                <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setUploadTarget(c.id); setUploadLabel('立绘') }}>🖼 上传立绘</button>
                {c.imageUrl !== undefined && <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void removeImage(c, '') }}>移除立绘</button>}
              </div>
            </div>
          </div>
        )}

        {/* 上传区 */}
        {uploadTarget === c.id && !isExtra && (
          <div style={{ marginTop: 'var(--nf-space-8)', border: '1px dashed var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
            <div className={css.row} style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className={css.field} style={{ minWidth: 140 }}>
                <label className={css.fieldLabel}>用途标签</label>
                <input className={css.input} value={uploadLabel} onChange={e => { setUploadLabel(e.target.value) }} placeholder="立绘/四视图/表情-xx" />
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { void onUploadFile(c.id, e.target.files?.[0] ?? null); e.target.value = '' }} />
              <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={actingId === c.id} onClick={() => { fileInputRef.current?.click() }}>{actingId === c.id ? '上传中…' : '📤 选择图片'}</button>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setUploadTarget(null) }}>取消</button>
            </div>
          </div>
        )}

        {/* 精修提示词（立绘+负面词+表情图高级可选） */}
        {!isExtra && c.promptKit !== undefined && (
          <div style={{ marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)' }}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>🎨 精修提示词</span>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => {
                const kit = c.promptKit!
                const neg = c.imagePrompt?.negativePrompt ?? '低质量,模糊,变形,多指,断肢,文字,水印,丑陋,比例失调'
                const parts: string[] = []
                if (kit.portrait) parts.push('【立绘】\n' + kit.portrait.zh)
                parts.push('【负面词】\n' + neg)
                if (showAdvancedPrompts && kit.expressions) for (const e of kit.expressions) parts.push('【表情-' + e.name + '】\n' + e.zh)
                void navigator.clipboard?.writeText(parts.join('\n\n'))
              }}>📋 复制全部</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginTop: 'var(--nf-space-4)' }}>
              {c.promptKit.portrait !== undefined && (
                <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                    <b>📌 立绘（智能角色参考图）</b>
                    <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void navigator.clipboard?.writeText(c.promptKit!.portrait!.zh) }}>复制</button>
                  </div>
                  <div style={{ fontSize: 'var(--nf-fs-12)', marginTop: 'var(--nf-space-4)' }}>{c.promptKit.portrait.zh}</div>
                </div>
              )}
              {c.imagePrompt?.negativePrompt !== undefined && c.imagePrompt.negativePrompt !== '' ? (
                <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                    <b>🚫 负面词（复制到即梦反向提示词框）</b>
                    <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void navigator.clipboard?.writeText(c.imagePrompt!.negativePrompt!) }}>复制</button>
                  </div>
                  <div style={{ fontSize: 'var(--nf-fs-12)', marginTop: 'var(--nf-space-4)', color: 'var(--nf-text-secondary)' }}>{c.imagePrompt.negativePrompt}</div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                    <b>🚫 负面词（复制到即梦反向提示词框）</b>
                    <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void navigator.clipboard?.writeText('低质量,模糊,变形,多指,断肢,文字,水印,丑陋,比例失调') }}>复制</button>
                  </div>
                  <div style={{ fontSize: 'var(--nf-fs-12)', marginTop: 'var(--nf-space-4)', color: 'var(--nf-text-secondary)' }}>低质量,模糊,变形,多指,断肢,文字,水印,丑陋,比例失调</div>
                </div>
              )}
              {c.promptKit.expressions !== undefined && c.promptKit.expressions.length > 0 && (
                <div style={{ border: '1px dashed var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                  <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setShowAdvancedPrompts(prev => !prev) }} style={{ width: '100%', textAlign: 'left' }}>
                    {showAdvancedPrompts ? '▼ 高级可选：表情图（点击收起）' : '▶ 高级可选：表情图（' + c.promptKit.expressions.length + '个，点击展开）'}
                  </button>
                  {showAdvancedPrompts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', marginTop: 'var(--nf-space-4)' }}>
                      {c.promptKit.expressions.map((e, i) => (
                        <div key={i} style={{ fontSize: 'var(--nf-fs-12)' }}>
                          <div className={css.row} style={{ justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600 }}>😊 {e.name}</span>
                            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void navigator.clipboard?.writeText(e.zh) }}>复制</button>
                          </div>
                          <div style={{ marginTop: 'var(--nf-space-2)' }}>{e.zh}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 即梦使用指引 */}
        {!isExtra && c.promptKit !== undefined && (
          <div style={{ marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)' }}>
            <span style={{ fontWeight: 600 }}>💡 即梦使用指引</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)', marginTop: 'var(--nf-space-4)' }}>
              <span className={css.meta}>• <b>立绘</b> → 即梦「智能角色」上传（正面全身纯白背景，全片锁脸锁服装）</span>
              <span className={css.meta}>• <b>多角度</b> → 立绘上传即梦画布，用「多角度编辑」生成侧面/背面（无需单独生四视图）</span>
              <span className={css.meta}>• <b>负面词</b> → 复制到即梦「反向提示词」框（生图生视频都有），每次都粘贴</span>
              <span className={css.meta}>• <b>表情图</b>（高级可选）→ 特定情绪镜头时投喂对应表情图，锁脸部</span>
            </div>
          </div>
        )}

        {/* 底部操作 */}
        <div style={{ marginTop: 'var(--nf-space-10)', borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-8)', display: 'flex', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
          {!isExtra && <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={actingId === c.id} onClick={() => { void genVisual(c.id, c.name) }}>{actingId === c.id ? '生成中…' : '🎨 生成形象锚点'}</button>}
          {c.tier === 'protagonist' && <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={actingId === c.id || c.imagePrompt === undefined} onClick={() => { void genKit(c.id, c.name) }}>✨ 精修提示词</button>}
          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { startEdit(c); setDetailCardId(null) }}>✏️ 编辑</button>
          <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonDanger} disabled={actingId === c.id} onClick={() => { void removeCard(c); setDetailCardId(null) }}>🗑 删除</button>
        </div>
      </div>
    </div>
  )
})()}
    </div>
  )
}
