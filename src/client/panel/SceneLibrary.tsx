/**
 * 场景库（完整版）：提炼 / 采纳 / 编辑 / 图集上传 / 详情浮窗。
 * 从 NovelPanel 左导航「场景库」搬入漫剧工作台场景区共用；
 * 浮窗用 createPortal 挂 body（避开 .view backdrop-filter 的 fixed 包含块问题），
 * 提示词全局中英切换 + 复制全部，视觉规则只在主页面显示一次。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NovelApi } from '../api.ts'
import type { ProjectState, SceneCard } from '../../protocol.ts'
import css from './panel.module.css'

export function SceneLibrary({
  api,
  project,
  refresh,
  styleId,
  filterId,
  chapterNo: externalChapter,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  /** 场景库变更已持久化后触发（刷新项目）。 */
  refresh: () => void | Promise<void>
  /** 提炼场景时的漫剧基底风格 id（提示词按方案风格措辞）。 */
  styleId?: string
  /** 可选滤镜风格 id。 */
  filterId?: string
  /** 全局当前章节（从工作台顶部导航条传入）。 */
  chapterNo?: number | null
  /** 上报到「AI进度」控制台。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [candidates, setCandidates] = useState<SceneCard[] | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [uploadLabel, setUploadLabel] = useState('全景')
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [draft, setDraft] = useState<SceneCard | null>(null)
  /** 场景分级筛选。 */
  const [tierFilter, setTierFilter] = useState<'all' | 'core' | 'secondary' | 'passing'>('all')
  /** 按章提取场景的章节号；undefined=全书提取（前4章）。 */
  const [chapterNo, setChapterNo] = useState<number | undefined>(externalChapter ?? undefined)

  // 外部章节变化时同步内部状态
  useEffect(() => {
    if (externalChapter !== undefined && externalChapter !== null) {
      setChapterNo(externalChapter)
    }
  }, [externalChapter])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 浮窗挂 body 时复制的面板主题变量（--nf-*）。 */
  const [portalVars, setPortalVars] = useState<Record<string, string>>({})

  const notify = (msg: string): void => { setNotice(msg); setTimeout(() => { setNotice('') }, 3000) }
  const report = (text: string, kind: 'info' | 'done' | 'error' = 'info'): void => { onProgress?.(text, kind) }

  // Esc 关闭详情浮窗。
  useEffect(() => {
    if (detailName === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDetailName(null)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [detailName])

  /** 打开场景详情：记录目标并复制面板主题变量（浮窗在 body 下渲染需要）。 */
  const openDetail = (name: string): void => {
    setDetailName(name)
    setUploadLabel('全景')
    if (rootRef.current !== null) {
      const cs = getComputedStyle(rootRef.current)
      const vars: Record<string, string> = {}
      for (let i = 0; i < cs.length; i++) {
        const key = cs[i]
        if (key.startsWith('--nf-')) {
          const v = cs.getPropertyValue(key).trim()
          if (v !== '') vars[key] = v
        }
      }
      setPortalVars(vars)
    }
  }

  const extract = async (): Promise<void> => {
    setBusy(true); setError('')
    report(chapterNo !== undefined ? '按第' + chapterNo + '章提炼场景…' : '按当前方案提炼场景…')
    try {
      const result = await api.scenes({ op: 'extract', chapterNo, styleId, filterId })
      const list = result.candidates ?? []
      // 自动采纳全部场景（傻瓜式操作，无需手动一个个点采纳）
      for (const s of list) {
        try { await api.scenes({ op: 'adopt', scene: s }) } catch { /* 单个采纳失败不阻塞 */ }
      }
      setCandidates(null)
      await refresh()
      report('场景提炼完成：已自动采纳 ' + list.length + ' 个场景', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('场景提炼失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const adopt = async (s: SceneCard): Promise<void> => {
    setBusy(true); setError('')
    report('采纳场景「' + s.name + '」…')
    try {
      await api.scenes({ op: 'adopt', scene: s })
      setCandidates(prev => (prev ?? []).filter(x => x.name !== s.name))
      await refresh()
      report('已采纳场景「' + s.name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('采纳场景「' + s.name + '」失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const saveDraft = async (): Promise<void> => {
    if (draft === null) return
    const name = draft.name.trim()
    if (name === '') return
    setBusy(true); setError('')
    report('保存场景「' + name + '」…')
    try {
      await api.scenes({ op: 'update', scene: { ...draft, name } })
      await refresh()
      setDraft(null)
      report('已保存场景「' + name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('保存场景「' + name + '」失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const removeScene = async (name: string): Promise<void> => {
    if (!window.confirm('确定删除场景「' + name + '」？')) return
    setBusy(true); setError('')
    report('删除场景「' + name + '」…')
    try {
      await api.scenes({ op: 'remove', name })
      await refresh()
      setDetailName(null)
      report('已删除场景「' + name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('删除场景「' + name + '」失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const uploadImage = async (file: File): Promise<void> => {
    const target = uploadTarget
    if (target === null) return
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
    const label = uploadLabel.trim() !== '' ? uploadLabel.trim() : '全景'
    setBusy(true); setError('')
    report('上传场景「' + target + '」' + label + '…')
    try {
      await api.scenes({ op: 'image', name: target, dataUrl, label })
      await refresh()
      report('已上传场景「' + target + '」' + label, 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('场景图上传失败：' + m, 'error')
    } finally {
      setBusy(false)
      setUploadTarget(null)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  const removeImage = async (name: string, label: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      await api.scenes({ op: 'removeImage', name, label })
      await refresh()
      report('已删除「' + name + '」' + label, 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('删除「' + name + '」' + label + ' 失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入场景库。</span></div>
  }

  const scenes = project.scenes ?? []
  const filteredScenes = tierFilter === 'all' ? scenes : scenes.filter(s => (s.tier ?? 'secondary') === tierFilter)
  const detail = detailName !== null ? scenes.find(s => s.name === detailName) : undefined

  return (
    <div ref={rootRef} className={css.card} style={{ flex: 1, minHeight: 0 }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>🏞️ 场景库</span>
        <span className={css.meta}>场景视觉锚点：提炼自正文，供漫剧分镜/生图锁定「在哪、什么氛围」</span>
        <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-2)' }}>流程位置：第④步场景底图 · 前置：一键生成已完成 · 下一步：第⑤步导出即梦脚本</span>
      </div>

      <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)', margin: '8px 0' }}>
        <span style={{ display: 'inline-flex', gap: 'var(--nf-space-2)', alignItems: 'center' }}>
          <span className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}>提取章节：</span>
          <select className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-2) var(--nf-space-6)', width: 'auto' }} value={chapterNo ?? ''} onChange={e => { setChapterNo(e.target.value === '' ? undefined : Number(e.target.value)) }}>
            <option value="">全书（前4章）</option>
            {(project?.chapters ?? []).filter(c => c.status !== 'pending' && c.status !== 'generating').map(c => (
              <option key={c.no} value={c.no}>第{c.no}章 {c.title ?? ''}</option>
            ))}
          </select>
        </span>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void extract() }}>
          {busy ? '⏳ 提炼中…' : '✨ 提炼场景'}
        </button>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { void refresh(); report('场景库已刷新', 'done') }}>🔄 刷新</button>

        <span style={{ display: 'inline-flex', gap: 'var(--nf-space-2)', alignItems: 'center' }}>
          <span className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}>分级：</span>
          {(['all', 'core', 'secondary', 'passing'] as const).map(t => (
            <button key={t} type="button" className={`${css.button} ${css.buttonSmall} ${tierFilter === t ? css.buttonPrimary : ''}`} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-2) var(--nf-space-6)' }} onClick={() => { setTierFilter(t) }}>
              {t === 'all' ? '全部' : t === 'core' ? '核心' : t === 'secondary' ? '次要' : '路过'}
            </button>
          ))}
        </span>
        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => {
          const text = scenes.map(s => '【' + s.name + '】\n' + s.zh + '\n负面词：' + (s.negativePrompt ?? 'no people, no characters, no text, no watermark, no logo')).join('\n\n')
          void navigator.clipboard?.writeText(text).then(() => { notify('已复制全部场景提示词') }).catch(() => { /* ignore */ })
        }}>📋 复制全部提示词</button>        {candidates !== null && (
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setCandidates(null) }}>收起候选</button>
        )}
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}
      {notice !== '' && <div className={css.importResult} style={{ padding: 'var(--nf-space-6) var(--nf-space-10)' }}>{notice}</div>}

      {/* 编辑场景 */}
      {draft !== null && (
        <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-10)', marginBottom: 'var(--nf-space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          <b style={{ fontSize: 'var(--nf-fs-14)' }}>编辑场景</b>
          <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} placeholder="场景名" value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }) }} />
          <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} placeholder="一句话定位" value={draft.summary} onChange={e => { setDraft({ ...draft, summary: e.target.value }) }} />
          <div className={css.row} style={{ gap: 'var(--nf-space-6)' }}>
            <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', flex: 1 }} placeholder="幕归属（第一幕后场…）" value={draft.act ?? ''} onChange={e => { setDraft({ ...draft, act: e.target.value }) }} />
            <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', flex: 1 }} placeholder="时间光态（雨夜/闭店后…）" value={draft.moment ?? ''} onChange={e => { setDraft({ ...draft, moment: e.target.value }) }} />
          </div>
          <textarea className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', minHeight: 48 }} placeholder="关键镜头（每行一条：人物动作+情绪+镜头）" value={(draft.beats ?? []).join('\n')} onChange={e => { setDraft({ ...draft, beats: e.target.value.split(/\n+/).map(x => x.trim()).filter(Boolean) }) }} />
          <input className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)' }} placeholder="人物在场状态（含标志物细节）" value={draft.characterState ?? ''} onChange={e => { setDraft({ ...draft, characterState: e.target.value }) }} />
          <textarea className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', minHeight: 60 }} placeholder="环境构成（每行一项）" value={(draft.elements ?? []).join('\n')} onChange={e => { setDraft({ ...draft, elements: e.target.value.split(/\n+/).map(x => x.trim()).filter(Boolean) }) }} />
          <textarea className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', minHeight: 60 }} placeholder="中文生图提示词" value={draft.zh} onChange={e => { setDraft({ ...draft, zh: e.target.value }) }} />
          <textarea className={css.input} style={{ fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-8)', minHeight: 60 }} placeholder="英文生图提示词" value={draft.en} onChange={e => { setDraft({ ...draft, en: e.target.value }) }} />
          <div className={css.row} style={{ gap: 'var(--nf-space-6)' }}>
            <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || draft.name.trim() === ''} onClick={() => { void saveDraft() }}>保存</button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setDraft(null) }}>取消</button>
          </div>
        </div>
      )}

      {/* 候选场景 */}
      {candidates !== null && candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginBottom: 'var(--nf-space-10)' }}>
          {candidates.map(s => (
            <div key={s.name} style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)', justifyContent: 'space-between' }}>
                <span><b>{s.name}</b> <span className={css.meta}>· {(s.moods ?? []).join('、')}</span>{s.styleId !== undefined && <span className={css.badge}>🎨 {s.styleId}</span>}</span>
                <span className={css.row} style={{ gap: 'var(--nf-space-4)' }}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void adopt(s) }}>采纳</button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setDraft(s); setCandidates(null) }}>修改后采纳</button>
                </span>
              </div>
              <div className={css.meta} style={{ marginTop: 'var(--nf-space-2)' }}>{s.summary}</div>
              <div className={css.meta} style={{ marginTop: 'var(--nf-space-2)', fontSize: 'var(--nf-fs-12)' }}>要素：{(s.elements ?? []).join('；')}</div>
            </div>
          ))}
        </div>
      )}

      {filteredScenes.length === 0 && candidates === null ? (
        <div className={css.shelfEmpty} style={{ minHeight: 140, flex: 1 }}>
          <span className={css.shelfEmptyIcon}>🏞️</span>
          <span className={css.shelfEmptyTitle}>场景库为空</span>
          <span className={css.meta}>点「✨ 按当前方案提炼场景」自动建立，或手动新增</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--nf-space-10)' }}>
          {filteredScenes.map(s => {
            const cover = (s.gallery ?? [])[0]
            return (
              <div key={s.name} onClick={() => { openDetail(s.name) }} role="button" tabIndex={0} aria-label={`打开场景 ${s.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(s.name) } }} style={{ cursor: 'pointer', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-12)', overflow: 'hidden', background: 'var(--nf-bg-inset)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--nf-bg-inset)', borderBottom: '1px solid var(--nf-border)', position: 'relative' }}>
                  {cover !== undefined
                    ? <img src={cover.dataUrl} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span className={css.meta}>暂无场景图</span>}
                  <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--nf-fs-12)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-2) var(--nf-space-6)' }}>🖼 {(s.gallery ?? []).length}</span>
                </div>
                <div style={{ padding: 'var(--nf-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-4)', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 'var(--nf-fs-14)' }}>{s.name}</b>
                    <span style={{ fontSize: 'var(--nf-fs-11)', padding: '1px 6px', borderRadius: 'var(--nf-radius-999)', background: (s.tier ?? 'secondary') === 'core' ? 'rgba(224,85,85,0.15)' : (s.tier ?? 'secondary') === 'passing' ? 'rgba(128,128,128,0.15)' : 'rgba(85,136,224,0.15)', color: (s.tier ?? 'secondary') === 'core' ? '#e05555' : (s.tier ?? 'secondary') === 'passing' ? '#888' : '#5588e0' }}>{(s.tier ?? 'secondary') === 'core' ? '核心' : (s.tier ?? 'secondary') === 'passing' ? '路过' : '次要'}</span>
                    {s.styleId !== undefined && <span className={css.badge} style={{ fontSize: 'var(--nf-fs-12)' }}>🎨 {s.styleId}</span>}
                  </div>
                  <div className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}>{(s.moods ?? []).join('、') || s.summary.slice(0, 16)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 场景详情浮窗（portal 到 body，避免 .view 的 backdrop-filter 破坏 fixed 定位） */}
      {detail !== undefined && createPortal(
        <div style={{ ...portalVars, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nf-space-24)' }} onClick={e => { if (e.target === e.currentTarget) setDetailName(null) }}>
          <div style={{ position: 'relative', background: 'var(--nf-bg)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-16)', padding: 'var(--nf-space-16)', width: 'min(860px, 100%)', maxHeight: '88vh', overflow: 'auto', marginTop: 'var(--nf-space-24)' }}>
            <button type="button" className={css.iconButton} style={{ position: 'absolute', top: 10, right: 10 }} title="关闭" aria-label="关闭" onClick={() => { setDetailName(null) }}>✕</button>
            <div style={{ marginBottom: 'var(--nf-space-12)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 'var(--nf-fs-20)' }}>{detail.name}</b>
                <span style={{ fontSize: 'var(--nf-fs-12)', padding: '2px 8px', borderRadius: 'var(--nf-radius-999)', background: (detail.tier ?? 'secondary') === 'core' ? 'rgba(224,85,85,0.15)' : (detail.tier ?? 'secondary') === 'passing' ? 'rgba(128,128,128,0.15)' : 'rgba(85,136,224,0.15)', color: (detail.tier ?? 'secondary') === 'core' ? '#e05555' : (detail.tier ?? 'secondary') === 'passing' ? '#888' : '#5588e0' }}>{(detail.tier ?? 'secondary') === 'core' ? '核心场景' : (detail.tier ?? 'secondary') === 'passing' ? '路过场景' : '次要场景'}</span>
                {detail.styleId !== undefined && <span className={css.badge}>🎨 {detail.styleId}</span>}
                {(detail.act !== undefined && detail.act !== '') && <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{detail.act}</span>}
                {(detail.moment !== undefined && detail.moment !== '') && <span className={css.meta}>{detail.moment}</span>}
              </div>
              <div className={css.meta} style={{ marginTop: 'var(--nf-space-4)' }}>{detail.summary}</div>
            </div>

            {/* 图集 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--nf-space-8)', marginBottom: 'var(--nf-space-12)' }}>
              {(detail.gallery ?? []).map(img => (
                <div key={img.label} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', overflow: 'hidden', position: 'relative' }}>
                  <img src={img.dataUrl} alt={img.label} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                  <div style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-2) var(--nf-space-6)', textAlign: 'center' }}>{img.label}</div>
                  <button type="button" className={css.iconButton} style={{ position: 'absolute', top: 2, right: 2, fontSize: 'var(--nf-fs-12)' }} title="删除" aria-label="删除" onClick={() => { void removeImage(detail.name, img.label) }}>×</button>
                </div>
              ))}
              {(detail.gallery ?? []).length === 0 && <span className={css.meta}>暂无场景图</span>}
            </div>

            {/* 场景信息（紧凑卡片） */}
            <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', marginBottom: 'var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <b style={{ fontSize: 'var(--nf-fs-12)' }}>场景信息</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 14px', marginTop: 'var(--nf-space-4)', lineHeight: 1.7 }}>
                <div>
                  <b style={{ fontSize: 'var(--nf-fs-12)' }}>关键镜头</b>
                  <div style={{ marginTop: 'var(--nf-space-2)' }}>{(detail.beats ?? []).map((b, i) => <div key={i} style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-2)', marginTop: 'var(--nf-space-2)' }}>🎬 {b}</div>)}</div>
                </div>
                <div>
                  {(detail.characterState !== undefined && detail.characterState !== '') && (
                    <div style={{ marginBottom: 'var(--nf-space-6)' }}>
                      <b style={{ fontSize: 'var(--nf-fs-12)' }}>人物状态</b>
                      <div className={css.meta} style={{ marginTop: 'var(--nf-space-2)' }}>{detail.characterState}</div>
                    </div>
                  )}
                  <b style={{ fontSize: 'var(--nf-fs-12)' }}>环境构成</b>
                  <div style={{ marginTop: 'var(--nf-space-2)' }}>{(detail.elements ?? []).map(e => <span key={e} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-999)', padding: 'var(--nf-space-2) var(--nf-space-8)', fontSize: 'var(--nf-fs-12)', margin: '0 4px 4px 0', display: 'inline-block' }}>{e}</span>)}</div>
                  <div style={{ marginTop: 'var(--nf-space-6)' }}><b style={{ fontSize: 'var(--nf-fs-12)' }}>色调光影</b> <span className={css.meta}>{(detail.palette ?? []).join('；') || '—'}</span></div>
                  <div style={{ marginTop: 'var(--nf-space-4)' }}><b style={{ fontSize: 'var(--nf-fs-12)' }}>氛围</b> <span className={css.meta}>{(detail.moods ?? []).join('、') || '—'}</span></div>
                  <div style={{ marginTop: 'var(--nf-space-4)' }}><b style={{ fontSize: 'var(--nf-fs-12)' }}>依据</b> <span className={css.meta}>{detail.source || '—'}</span></div>
                </div>
              </div>
            </div>

            {/* 生图提示词：全局中英 + 复制全部 */}
            <div style={{ marginBottom: 'var(--nf-space-12)' }}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 'var(--nf-space-6)' }}>
                <b style={{ fontSize: 'var(--nf-fs-14)' }}>🎨 生图提示词</b>
                <span className={css.row} style={{ gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => {
                    const text = '【中文】\n' + detail.zh
                    void navigator.clipboard?.writeText(text).then(() => { notify('已复制「' + detail.name + '」生图提示词') }).catch(() => { /* ignore */ })
                  }}>📋 复制全部</button>
                </span>
              </div>
              <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 'var(--nf-fs-12)' }}>🇨🇳 中文</b>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ padding: 'var(--nf-space-2) var(--nf-space-6)', fontSize: 'var(--nf-fs-12)' }} onClick={() => {
                    void navigator.clipboard?.writeText(detail.zh).then(() => { notify('已复制「' + detail.name + '」生图提示词') }).catch(() => { /* ignore */ })
                  }}>复制</button>
                </div>
                <div className={css.meta} style={{ fontSize: 'var(--nf-fs-12)', lineHeight: 1.6, marginTop: 'var(--nf-space-4)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail.zh}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-4)', marginTop: 'var(--nf-space-8)' }}>
                  {(detail.tags ?? []).map(t => <span key={t} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-999)', padding: 'var(--nf-space-2) var(--nf-space-8)', fontSize: 'var(--nf-fs-12)' }}>{t}</span>)}
                </div>
              </div>
              {/* 负面提示词 */}
              <div style={{ marginTop: 'var(--nf-space-8)', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-8)', padding: 'var(--nf-space-8)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 'var(--nf-fs-12)' }}>🚫 负面提示词（场景专用）</b>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ padding: 'var(--nf-space-2) var(--nf-space-6)', fontSize: 'var(--nf-fs-12)' }} onClick={() => {
                    void navigator.clipboard?.writeText(detail.negativePrompt ?? 'no people, no characters, no text, no watermark, no logo, no subtitles, blurry, low quality, distorted, deformed').then(() => { notify('已复制负面提示词') }).catch(() => { /* ignore */ })
                  }}>复制</button>
                </div>
                <div className={css.meta} style={{ fontSize: 'var(--nf-fs-12)', lineHeight: 1.6, marginTop: 'var(--nf-space-4)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail.negativePrompt ?? 'no people, no characters, no text, no watermark, no logo, no subtitles, blurry, low quality, distorted, deformed'}</div>
              </div>
            </div>

            {/* 即梦使用指引 */}
            <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-10)', marginBottom: 'var(--nf-space-12)', fontSize: 'var(--nf-fs-12)', background: 'rgba(85,136,224,0.05)' }}>
              <b style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-accent)' }}>🎬 即梦使用指引</b>
              <div style={{ marginTop: 'var(--nf-space-4)', lineHeight: 1.7, color: 'var(--nf-text-2)' }}>
                <div>1. 上方场景图可作为即梦「首帧参考图」或「背景参考图」上传</div>
                <div>2. 分镜提示词中已自动标注使用的场景名，导出时会附带场景图路径</div>
                <div>3. 核心场景建议生成多角度/多氛围图（全景/局部/氛围），提升视频一致性</div>
                <div>4. 资产库路径：manga-assets/场景/场景名-标签.png</div>
              </div>
            </div>

            {/* 操作条 */}
            <div style={{ borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-10)', display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)', alignItems: 'center' }}>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => {
                const text = detail.zh + (detail.negativePrompt !== undefined && detail.negativePrompt !== '' ? '\n负面词：' + detail.negativePrompt : '')
                void navigator.clipboard?.writeText(text).then(() => { notify('已复制「' + detail.name + '」生图提示词') }).catch(() => { /* ignore */ })
              }}>复制提示词</button>

                            <input className={css.input} style={{ width: 130, fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) var(--nf-space-6)' }} placeholder="图集标签" value={uploadLabel} onChange={e => { setUploadLabel(e.target.value) }} />
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file === undefined || uploadTarget === null) return
                  void uploadImage(file)
                }}
              />
              <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => {
                setUploadLabel(uploadLabel.trim() !== '' ? uploadLabel.trim() : '全景')
                setUploadTarget(detail.name)
                inputRef.current?.click()
              }}>📤 上传场景图</button>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setDraft(detail); setDetailName(null) }}>✏️ 编辑</button>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ color: 'var(--nf-danger, #e05)' }} onClick={() => { void removeScene(detail.name) }}>🗑 删除</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
