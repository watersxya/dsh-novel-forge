/**
 * 分镜工作台：① 编剧级剧情骨架 → ② 导演级分镜表（镜头级）→ ③ 视频提示词（后续版本）。
 * 定位：辅助人工——每级可重新生成、可复制，产出可导出。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ProjectState, StoryboardPrompt, StoryboardSkeleton, StoryboardTable } from '../../protocol.ts'
import {
  sizeZh, cameraZh, compoZh, lightZh,
  normalizeShotSize, normalizeCameras, normalizeComposition, normalizeLightings,
} from '../../shot-language.ts'
import { functionZh, emotionZh, normalizeStoryFunction, normalizeEmotions } from '../../story-beat-language.ts'
import type { StoryboardShot } from '../../protocol.ts'
import css from './panel.module.css'

/** 归一化旧分镜数据：把自由文本 shot/camera/light/composition 转成词库枚举。 */
function normalizeStoryboardShot(s: StoryboardShot): StoryboardShot {
  return {
    ...s,
    shot: normalizeShotSize(typeof s.shot === 'string' ? s.shot : undefined),
    camera: normalizeCameras(typeof s.camera === 'string' ? s.camera : undefined),
    composition: typeof s.composition === 'string' ? normalizeComposition(s.composition) : s.composition,
    light: normalizeLightings(typeof s.light === 'string' ? s.light : undefined),
  }
}

export function StoryboardTab({
  api,
  project,
  chapters,
  onProjectChanged,
  styleId,
  filterId,
  mode,
  onGoStep,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  chapters: ChapterPlan[]
  /** 生成成功且已持久化后触发（刷新项目，切章/重进可恢复）。 */
  onProjectChanged?: () => void | Promise<void>
  /** 漫剧基底风格 id（画面措辞随风格）。 */
  styleId?: string
  /** 可选滤镜风格 id。 */
  filterId?: string
  /** 页面模式：auto=按本章实际进度显示；skeleton/table/prompts=固定显示该步骤（前置不足显示提示，不降级）。 */
  mode?: 'auto' | 'skeleton' | 'table' | 'prompts'
  /** 「下一步」按钮回调（1=骨架→2=分镜表→3=提示词），供外层切步骤页。 */
  onGoStep?: (n: 1 | 2 | 3) => void
  /** 上报到「AI进度」控制台（分镜三步生成）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const written = useMemo(() => chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error').sort((a, b) => a.no - b.no), [chapters])
  /** 漫剧卡 id → 卡名/参考图（定妆绑定展示）。 */
  const mangaById = useMemo(() => {
    const m = new Map<string, { name: string; imageUrl?: string }>()
    for (const c of project?.mangaRoles ?? []) m.set(c.id, { name: c.name, imageUrl: c.imageUrl })
    return m
  }, [project?.mangaRoles])
  const bindingNames = (ids: string[] | undefined): string => (ids ?? []).map(id => mangaById.get(id)?.name ?? id).join('、')
  const [chapterNo, setChapterNo] = useState<number | null>(written[0]?.no ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [skeleton, setSkeleton] = useState<StoryboardSkeleton | null>(null)
  const [table, setTable] = useState<StoryboardTable | null>(null)
  const [tableBusy, setTableBusy] = useState(false)
  const [prompts, setPrompts] = useState<StoryboardPrompt[] | null>(null)
  const [promptsBusy, setPromptsBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set())
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  /** 重新生成期间抑制「从持久化恢复旧缓存」的回填（防旧产物复活）。 */
  const suppressRestoreRef = useRef(false)
  const markRestoreSuppressed = (): void => {
    suppressRestoreRef.current = true
    window.setTimeout(() => { suppressRestoreRef.current = false }, 500)
  }

  // 章节列表变化时保持选中有效章节
  useEffect(() => {
    if (chapterNo === null || !written.some(c => c.no === chapterNo)) {
      setChapterNo(written[0]?.no ?? null)
      setSkeleton(null)
      setTable(null)
      setPrompts(null)
    }
  }, [written, chapterNo])

  // 从项目持久化恢复：切章节 / 重新进入本页时，读回已保存的骨架与分镜表（本地已有则不覆盖）。
  // 重新生成期间（markRestoreSuppressed）跳过恢复，避免旧的下游产物（分镜表/提示词）被拉回来。
  useEffect(() => {
    if (chapterNo === null) return
    if (suppressRestoreRef.current === true) return
    const entry = (project?.storyboards ?? []).find(e => e.chapterNo === chapterNo)
    setSkeleton(prev => {
      if (prev !== null) return prev
      if (entry?.skeleton === undefined) return null
      return {
        ...entry.skeleton,
        beats: (entry.skeleton.beats ?? []).map(b => ({
          ...b,
          function: normalizeStoryFunction(typeof b.function === 'string' ? b.function : undefined),
          emotion: normalizeEmotions(typeof b.emotion === 'string' ? b.emotion : b.emotion?.join('→')),
        })),
      }
    })
    setTable(prev => {
      if (prev !== null) return prev
      if (entry?.table === undefined) return null
      return { ...entry.table, shots: (entry.table.shots ?? []).map(normalizeStoryboardShot) }
    })
    setPrompts(prev => prev ?? entry?.prompts ?? null)
  }, [chapterNo, project?.storyboards])

  const generate = async (chain: boolean): Promise<void> => {
    if (chapterNo === null) return
    setBusy(true)
    setError('')
    setSkeleton(null)
    setTable(null)
    setPrompts(null)
    setStepState(1)
    onProgress?.('第' + chapterNo + '章 剧情骨架生成中…')
    try {
      const result = await api.storyboardSkeleton(chapterNo)
      setSkeleton(result.skeleton)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 剧情骨架已生成（' + result.skeleton.beats.length + ' 个节拍）', 'done')
      // 重新生成：骨架已变、下游已清空，级联自动进入第 ② 步并重算分镜表。
      if (chain) await generateTable(result.skeleton)
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 剧情骨架生成失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** ② 生成分镜表（骨架 → 镜头级）。forceSkeleton 供①级联重算时传入新骨架。 */
  const generateTable = async (forceSkeleton?: StoryboardSkeleton): Promise<void> => {
    if (chapterNo === null) return
    const sk = forceSkeleton ?? skeleton
    if (sk === null) return
    setStepState(2)
    setTableBusy(true)
    setError('')
    setTable(null)
    setPrompts(null)
    onProgress?.('第' + chapterNo + '章 分镜表生成中…')
    try {
      const result = await api.storyboardTable(chapterNo, sk, styleId, filterId)
      setTable(result.table)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 分镜表已生成（' + result.table.shots.length + ' 个镜头）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 分镜表生成失败：' + m, 'error')
    } finally {
      setTableBusy(false)
    }
  }

  /** ③ 生成视频提示词（分镜表 → 即梦可粘贴）。 */
  const generatePrompts = async (): Promise<void> => {
    if (chapterNo === null || table === null) return
    setStepState(3)
    setPromptsBusy(true)
    setError('')
    setPrompts(null)
    onProgress?.('第' + chapterNo + '章 视频提示词生成中…')
    try {
      const result = await api.storyboardPrompts(chapterNo, table, styleId, filterId)
      setPrompts(result.prompts)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 视频提示词已生成（' + result.prompts.length + ' 条）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 视频提示词生成失败：' + m, 'error')
    } finally {
      setPromptsBusy(false)
    }
  }

  const [stepState, setStepState] = useState(1)

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入分镜工作台。</span></div>
  }
  const maxStep = prompts !== null ? 3 : table !== null ? 2 : skeleton !== null ? 1 : 0
  // 固定模式：只显示指定步骤（前置不足由黄条提示，不降级）；auto：按本章实际进度显示。
  const modeStep = mode === 'skeleton' ? 1 : mode === 'table' ? 2 : mode === 'prompts' ? 3 : null
  const step = modeStep !== null ? modeStep : Math.min(stepState, Math.max(maxStep, 1))

  return (
    <div className={css.card}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle}>🎬 分镜工作台</span>
        <span className={css.meta}>三步向导 · {styleId !== undefined ? '按当前方案风格生成' : '未选方案风格'}</span>
      </div>

      <span className={css.meta} style={{ display: 'block', marginBottom: 'var(--nf-space-6)' }}>
        {step === 1
          ? '这步：从章节正文提炼剧情骨架（弧线/节拍/出场角色）· 前置：已写章节 · 下一步：生成分镜表'
          : step === 2
            ? '这步：骨架展开为镜头级分镜表（景别/机位/台词/每镜头角色+定妆绑定）· 前置：剧情骨架 · 下一步：视频提示词'
            : '这步：分镜表 → 即梦可粘贴视频提示词（带风格词块与定妆绑定）· 前置：分镜表（建议先完成角色定妆）· 下一步：复制到即梦/豆包'}
      </span>

      <div className={css.row} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className={css.field} style={{ flex: 1, minWidth: 200 }}>
          <label className={css.fieldLabel}>选择章节</label>
          <select
            className={css.input}
            value={chapterNo ?? ''}
            onChange={e => { setChapterNo(Number(e.target.value)); setError('') }}
          >
            {written.length === 0 && <option value="">（没有已写章节）</option>}
            {written.map(c => (
              <option key={c.no} value={c.no}>第{c.no}章 {c.title}</option>
            ))}
          </select>
        </div>
        {/* 生成/重新生成骨架只属于骨架页（③）；分镜表/提示词页由各自内容区的按钮负责 */}
        {mode !== 'table' && mode !== 'prompts' && (
          <>
            <button
              type="button"
              className={`${css.button} ${css.buttonPrimary}`}
              disabled={busy || chapterNo === null}
              onClick={() => { void generate(false) }}
            >
              {busy ? '编剧分析中…' : '✍️ 生成剧情骨架'}
            </button>
            {skeleton !== null && (
              <button type="button" className={css.button} disabled={busy} onClick={() => { void generate(true) }}>
                🔄 重新生成（并继续生成分镜表）
              </button>
            )}
          </>
        )}
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {/* 固定模式下的前置不足提示（不静默降级） */}
      {mode === 'table' && skeleton === null && (
        <div style={{ border: '1px solid var(--nf-warn, #b8860b)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', marginTop: 'var(--nf-space-6)' }}>
          <span className={css.meta}>⚠ 本章还没有剧情骨架——请先到「③ 剧情骨架」页生成骨架，再回来生成分镜表。</span>
        </div>
      )}
      {mode === 'prompts' && table === null && (
        <div style={{ border: '1px solid var(--nf-warn, #b8860b)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', marginTop: 'var(--nf-space-6)' }}>
          <span className={css.meta}>⚠ 本章还没有分镜表——请先完成「③ 剧情骨架」「④ 分镜表」，再回来生成视频提示词。</span>
        </div>
      )}
      {/* 固定模式：前置已满足但本步产物缺失 → 直接给生成按钮 */}
      {mode === 'table' && skeleton !== null && table === null && (
        <div className={css.row} style={{ marginTop: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={tableBusy} onClick={() => { void generateTable() }}>
            {tableBusy ? '生成中…' : '🎬 生成分镜表'}
          </button>
          <span className={css.meta}>骨架已就绪，本章还没有分镜表——点按钮生成。</span>
        </div>
      )}
      {mode === 'prompts' && table !== null && prompts === null && (
        <div className={css.row} style={{ marginTop: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={promptsBusy} onClick={() => { void generatePrompts() }}>
            {promptsBusy ? '生成中…' : '🎬 生成视频提示词'}
          </button>
          <span className={css.meta}>分镜表已就绪，本章还没有视频提示词——点按钮生成。</span>
        </div>
      )}

      {step === 1 && (skeleton === null ? (
        <div className={css.meta} style={{ marginTop: 'var(--nf-space-8)' }}>
          生成后这里显示本章剧情骨架：弧线 + 节拍链（事件 / 情绪走向 / 叙事功能 / 因果）。
          骨架是「完整剧情」的根——确认骨架没问题后，进入下一步展开为分镜表。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-8)' }}>
          <div className={css.importPreview}>
            <span>📖 本章弧线：{skeleton.arc}</span>
          </div>
          {skeleton.characters !== undefined && skeleton.characters.length > 0 && (
            <div className={css.row} style={{ flexWrap: 'wrap' }}>
              <span className={css.meta}>👥 出场角色：</span>
              {skeleton.characters.map(c => (
                <span key={c} className={css.badge}>{c}</span>
              ))}
            </div>
          )}
          {skeleton.beats.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)' }}>
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <b>节拍 {i + 1}</b>
                <span className={`${css.badge} ${b.function === 'climax' ? css.badgeDone : b.function === 'turn' ? css.badgeWritten : css.badgePending}`}>{functionZh(b.function)}</span>
                <span className={css.meta}>💭 {emotionZh(b.emotion)}</span>
              </div>
              <span>{b.event}</span>
              {b.cause !== undefined && <span className={css.meta}>承接：{b.cause}</span>}
            </div>
          ))}
          <div className={css.row}>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = `第${skeleton.chapterNo}章 弧线：${skeleton.arc}\n出场角色：${skeleton.characters !== undefined && skeleton.characters.length > 0 ? skeleton.characters.join('、') : '（未标注）'}\n\n` + skeleton.beats.map((b, i) => `${i + 1}. [${functionZh(b.function)}] ${b.event}（情绪：${emotionZh(b.emotion)}）${b.cause !== undefined ? `［承接：${b.cause}］` : ''}`).join('\n')
                void navigator.clipboard?.writeText(text)
              }}
            >
              📋 复制骨架
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
              onClick={() => { if (table === null) void generateTable(); onGoStep?.(2) }}
            >
              🎬 下一步：生成分镜表
            </button>
            <span className={css.meta}>共 {skeleton.beats.length} 个节拍 · 骨架可重新生成（后续版本支持直接编辑）</span>
          </div>
        </div>
      ))}

      {step === 2 && table !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)', marginTop: 'var(--nf-space-10)' }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 分镜表（{table.shots.length} 个镜头）</b>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                if (expandedShots.size > 0) setExpandedShots(new Set())
                else setExpandedShots(new Set(table.shots.map(s => s.id)))
              }}
            >
              {expandedShots.size > 0 ? '▴ 收起全部' : '▾ 展开全部'}
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = table.shots.map(s => {
                  const beat = skeleton?.beats.find(b => b.id === s.beatId)
                  return `镜头 ${s.id}（节拍 ${beat?.id ?? s.beatId} · ${sizeZh(s.shot)} · ${cameraZh(s.camera)} · ${s.duration}s）\n出场：${s.characters !== undefined && s.characters.length > 0 ? s.characters.join('、') : '（未标注）'}\n定妆：${s.mangaRoleIds !== undefined && s.mangaRoleIds.length > 0 ? bindingNames(s.mangaRoleIds) : '（未绑定漫剧卡）'}\n画面：${s.visual}\n台词：${s.line !== '' ? s.line : '（无）'}\n音效：${s.sound !== '' ? s.sound : '（无）'}\n光效：${lightZh(s.light) !== '' ? lightZh(s.light) : '（无）'}\n承接：${s.prevState} → ${s.nextState}`
                }).join('\n\n')
                void navigator.clipboard?.writeText(`第${table.chapterNo}章分镜表\n\n` + text)
              }}
            >
              📋 复制分镜表
            </button>
            <span className={css.meta}>按骨架节拍展开 · 镜头间状态连续</span>
            {table.characters !== undefined && table.characters.length > 0 && (
              <span className={css.meta}>👥 出场角色：{table.characters.join('、')}</span>
            )}
            {table.mangaRoleIds !== undefined && table.mangaRoleIds.length > 0 && (
              <span className={css.meta}>🎨 定妆绑定：{bindingNames(table.mangaRoleIds)}</span>
            )}
            {table.usedScenes !== undefined && table.usedScenes.length > 0 && (
              <span className={css.meta}>🏞️ 使用场景：{table.usedScenes.join('、')}</span>
            )}
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              disabled={tableBusy}
              onClick={() => { void generateTable() }}
            >
              🔄 重新生成分镜表
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
              onClick={() => { if (prompts === null) void generatePrompts(); onGoStep?.(3) }}
            >
              🎬 下一步：生成视频提示词
            </button>
          </div>
          {table.shots.map(s => {
            const beat = skeleton?.beats.find(b => b.id === s.beatId)
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)' }}>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <b>镜头 {s.id}</b>
                  <span className={css.badge}>{sizeZh(s.shot)}</span>
                  <span className={css.meta}>{cameraZh(s.camera)}{compoZh(s.composition) !== '' ? ' · ' + compoZh(s.composition) : ''} · {s.duration}s</span>
                  {beat !== undefined && <span className={css.meta}>节拍 {beat.id}「{functionZh(beat.function)}」</span>}
                  {s.characters !== undefined && s.characters.length > 0 && (
                    <span className={css.meta}>👥 {s.characters.join('、')}</span>
                  )}
                  {s.mangaRoleIds !== undefined && s.mangaRoleIds.length > 0 && (
                    <span className={css.badge + ' ' + css.badgeDone}>🎨 定妆 {bindingNames(s.mangaRoleIds)}</span>
                  )}
                </div>
                {s.jimengCamera !== undefined && s.jimengCamera !== '' && (
                  <span className={css.meta}>🎥 即梦运镜：{s.jimengCamera}</span>
                )}
                <span>🎞️ {s.visual}</span>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>💬 {s.line !== '' ? s.line : '（无台词）'}</span>
                  <span className={css.meta}>🔊 {s.sound !== '' ? s.sound : '（无音效）'}</span>
                  <span className={css.meta}>💡 {lightZh(s.light) !== '' ? lightZh(s.light) : '（无光效）'}</span>
                </div>
                <span className={css.meta}>承接：{s.prevState} → {s.nextState}</span>
              </div>
            )
          })}
        </div>
      )}

      {step === 3 && prompts !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-10)' }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 视频提示词（{prompts.length} 个镜头）</b>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              disabled={promptsBusy}
              onClick={() => { void generatePrompts() }}
            >
              🔄 重新生成视频提示词
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = prompts.map(x => `【镜头 ${x.shotId}】${x.mangaRoleIds !== undefined && x.mangaRoleIds.length > 0 ? '定妆：' + bindingNames(x.mangaRoleIds) + ' ' : ''}${x.text}`).join('\n\n')
                void navigator.clipboard?.writeText(`第${table?.chapterNo ?? ''}章视频提示词\n\n` + text)
              }}
            >
              📋 复制全部（即梦可逐条粘贴）
            </button>
          </div>
          {prompts.map(x => (
            <div key={x.shotId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)' }}>
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <b>镜头 {x.shotId}</b>
                <span className={css.meta}>即梦/Seedance 提示词</span>
                {(() => { const shot = table?.shots.find(s => s.id === x.shotId); return shot !== undefined ? (
                  <span className={css.meta}>{shot.duration}s · {shot.jimengCamera !== undefined && shot.jimengCamera !== '' ? shot.jimengCamera : cameraZh(shot.camera)}</span>
                ) : null })()}
                {x.mangaRoleIds !== undefined && x.mangaRoleIds.length > 0 && (
                  <span className={css.badge + ' ' + css.badgeDone}>🎨 定妆 {bindingNames(x.mangaRoleIds)}</span>
                )}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(x.text)
                    setCopied(x.shotId)
                    setTimeout(() => { setCopied('') }, 1500)
                  }}
                >
                  {copied === x.shotId ? '✅ 已复制' : '📋 复制'}
                </button>
              </div>
              <span style={{ fontSize: 'var(--nf-fs-14)', lineHeight: 1.7 }}>{x.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}