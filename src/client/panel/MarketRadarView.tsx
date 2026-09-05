/**
 * 「热门题材雷达」：对齐上游市场雷达页（真实榜单扫榜 → 候选勾选 → AI 分析 → 信号卡片 → 影响模式 → 用信号创作）。
 */
import { useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { MarketRadarResult, MarketCreativeBrief, IdeaInspirationResult } from '../../protocol.ts'
import css from './panel.module.css'

const PLATFORMS = ['fanqie', 'qidian', 'jinjiang']
const PLATFORM_LABELS: Record<string, string> = { fanqie: '番茄小说', qidian: '起点中文网', jinjiang: '晋江文学城' }
const MAX_SIGNALS = 5

interface ScanItem { rank: number; title: string; author?: string; tags?: string[]; synopsis?: string; category?: string; heatLabel?: string }
interface ScanGroup { platform: string; platformLabel: string; listKey: string; listLabel: string; status: 'ok' | 'error'; error?: string; items: ScanItem[] }

const KIND_LABELS: Record<string, string> = {
  genre: '题材', protagonist: '主角', advantage: '金手指', opening: '开篇', relationship: '关系', title_pattern: '标题', opportunity: '机会', crowding: '拥挤',
}
const MODE_LABELS: Record<string, string> = {
  follow_hot: '跟随热门',
  differentiate: '差异化',
  light: '轻度参考',
}

export default function MarketRadarView({ api, bookId }: { api: NovelApi; bookId?: string }): JSX.Element {
  const [platforms, setPlatforms] = useState<string[]>(['fanqie', 'qidian', 'jinjiang'])
  const [feedText, setFeedText] = useState('')
  const [scanGroups, setScanGroups] = useState<ScanGroup[] | null>(null)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [viewPlatform, setViewPlatform] = useState('fanqie')
  const [scanning, setScanning] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MarketRadarResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [influenceMode, setInfluenceMode] = useState<'follow_hot' | 'differentiate' | 'light'>('differentiate')
  const [briefBusy, setBriefBusy] = useState(false)
  const [brief, setBrief] = useState<MarketCreativeBrief | null>(null)
  const [ideas, setIdeas] = useState<IdeaInspirationResult['ideas'] | null>(null)
  const [ideaBusy, setIdeaBusy] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [applied, setApplied] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncedMsg, setSyncedMsg] = useState('')

  const candKey = (g: ScanGroup, item: ScanItem): string => `${g.platform}:${g.listKey}:${item.rank}`
  const togglePlatform = (p: string): void => {
    setPlatforms(prev => prev.includes(p) ? (prev.length === 1 ? prev : prev.filter(x => x !== p)) : [...prev, p])
  }
  const platformList = useMemo(() => {
    const set = new Set((scanGroups ?? []).map(g => g.platform))
    return PLATFORMS.filter(p => set.has(p))
  }, [scanGroups])

  const scan = async (): Promise<void> => {
    setScanning(true)
    setError('')
    setResult(null)
    setBrief(null)
    try {
      const r = await api.marketRadarScan({ platforms })
      const groups = r.result.groups
      setScanGroups(groups)
      const firstP = PLATFORMS.find(p => groups.some(g => g.platform === p))
      if (firstP !== undefined) setViewPlatform(firstP)
      // 默认不自动全选，交给用户手动勾选或用「全选」按钮。
      setSelectedCandidates(new Set())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanning(false)
    }
  }

  const toggleCandidate = (key: string): void => {
    setSelectedCandidates(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = (): void => {
    const next = new Set<string>()
    for (const g of scanGroups ?? []) if (g.platform === viewPlatform && g.status === 'ok') for (const it of g.items) next.add(candKey(g, it))
    setSelectedCandidates(next)
  }

  const clearSelection = (): void => setSelectedCandidates(new Set())

  const selectGroup = (g: ScanGroup): void => {
    setSelectedCandidates(prev => {
      const next = new Set(prev)
      for (const it of g.items) next.add(candKey(g, it))
      return next
    })
  }

  const analyze = async (): Promise<void> => {
    if (scanGroups === null) return
    const candidates: Array<{ title: string; author?: string; tags?: string[]; synopsis?: string; category?: string }> = []
    for (const g of scanGroups) if (g.status === 'ok') for (const it of g.items) if (selectedCandidates.has(candKey(g, it))) candidates.push({ title: it.title, author: it.author, tags: it.tags, synopsis: it.synopsis, category: it.category })
    setAnalyzing(true)
    setError('')
    setBrief(null)
    try {
      const r = await api.marketRadar({ candidates, feedText: feedText.trim() })
      setResult(r.result)
      const rec = r.result.signals.filter(s => s.recommended === true).map(s => s.id)
      setSelectedIds(new Set(rec.slice(0, MAX_SIGNALS)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  const toggleSignal = (id: string): void => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_SIGNALS) next.add(id)
      return next
    })
  }

  const createBrief = async (): Promise<void> => {
    if (result === null) return
    const signals = result.signals.filter(s => selectedIds.has(s.id))
    setBriefBusy(true)
    setError('')
    try {
      const r = await api.marketRadarBrief({ influenceMode, signals })
      setBrief(r.creativeBrief)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBriefBusy(false)
    }
  }

  const createIdeas = async (): Promise<void> => {
    if (result === null) return
    const signals = result.signals.filter(s => selectedIds.has(s.id))
    setIdeaBusy(true)
    setError('')
    try {
      const r = await api.marketIdeaInspiration({ signals, foundation: result.productionFoundation, brief, count: 5 })
      setIdeas(r.result.ideas)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIdeaBusy(false)
    }
  }

  const apply = async (): Promise<void> => {
    if (result === null) return
    setApplyBusy(true)
    setError('')
    setApplied('')
    try {
      const r = await api.marketRadarApply({ bookId, foundation: result.productionFoundation })
      setApplied(`✅ 已应用到《${r.bookName}》：后续规划/生成将按此题材与推进模式。`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplyBusy(false)
    }
  }

  const sync = async (): Promise<void> => {
    if (result === null) return
    setSyncBusy(true)
    setError('')
    setSyncedMsg('')
    try {
      const r = await api.marketRadarSync({ foundation: result.productionFoundation })
      const parts: string[] = []
      if (r.synced.genre) parts.push('题材')
      if (r.synced.primaryMode) parts.push('主推进')
      if (r.synced.secondaryMode) parts.push('辅推进')
      setSyncedMsg(parts.length > 0 ? `✅ 已同步到全局资源库：${parts.join('、')}` : '已在资源库中，无新增。')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSyncBusy(false)
    }
  }

  const badge = (kind: string): string => (kind === 'opportunity' ? 'var(--nf-success)' : kind === 'crowding' ? 'var(--nf-error)' : 'var(--nf-accent)')

  return (
    <div className={css.authorPageBody}>
      {/* 平台扫榜 */}
      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-12)' }}>
        <span className={css.cardTitle}>📡 热门题材雷达</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
          {PLATFORMS.map(p => (
            <button key={p} type="button" onClick={() => togglePlatform(p)} style={{ padding: '4px 12px', borderRadius: 999, border: '1px solid var(--nf-border)', cursor: 'pointer', background: platforms.includes(p) ? 'var(--nf-accent-soft)' : 'var(--nf-bg-inset)', color: 'var(--nf-text)', fontWeight: platforms.includes(p) ? 600 : 400 }}>
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          <label className={css.fieldLabel}>榜单文本兜底（可选，粘贴公开榜单文本；扫榜失败时可用于人工候选）</label>
          <textarea className={css.input} style={{ minHeight: 90, resize: 'vertical' }} value={feedText} onChange={e => setFeedText(e.target.value)} placeholder="粘贴一份公开榜单文本…" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={scanning} onClick={() => { void scan() }}>
            {scanning ? '正在扫榜…' : '扫榜'}
          </button>
          {scanning && <span style={{ fontSize: 12, color: 'var(--nf-text-2)' }}>正在抓取公开榜单（{platforms.map(p => PLATFORM_LABELS[p]).join('、')}），多平台并行，约 10–30 秒…</span>}
          {scanGroups !== null && (
            <button type="button" className={css.button} style={{ marginLeft: 8 }} disabled={analyzing || selectedCandidates.size === 0} onClick={() => { void analyze() }}>
              {analyzing ? 'AI 分析中…' : `开始 AI 分析（${selectedCandidates.size} 本）`}
            </button>
          )}
        </div>
      </div>

      {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 13 }}>⚠ {error}</div>}

      {/* 榜单候选：平台 tabs 切换 + 平台内榜单横排(最多三列) + 每列 10 条可滚 */}
      {scanGroups !== null && (
        <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
          <span className={css.cardTitle}>公开榜单候选</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
            {platformList.map(p => {
              const active = viewPlatform === p
              const count = (scanGroups ?? []).filter(g => g.platform === p && g.status === 'ok').reduce((a, g) => a + g.items.length, 0)
              return (
                <button key={p} type="button" onClick={() => setViewPlatform(p)} style={{ padding: '4px 12px', borderRadius: 999, border: '1px solid ' + (active ? 'var(--nf-accent)' : 'var(--nf-border)'), cursor: 'pointer', background: active ? 'var(--nf-accent-soft)' : 'var(--nf-bg-inset)', color: 'var(--nf-text)', fontWeight: active ? 600 : 400 }}>
                  {PLATFORM_LABELS[p]} ({count})
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={selectAll}>全选当前平台</button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={clearSelection}>清空</button>
            <span style={{ fontSize: 11, color: 'var(--nf-text-2)' }}>已选 {selectedCandidates.size} 条</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--nf-space-10)' }}>
            {(scanGroups ?? []).filter(g => g.platform === viewPlatform).map(g => (
              <div key={`${g.platform}:${g.listKey}`} style={{ border: '1px solid var(--nf-border)', borderRadius: 10, padding: 'var(--nf-space-8)', background: 'var(--nf-bg-inset)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  {g.listLabel}
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, color: g.status === 'ok' ? 'var(--nf-success)' : 'var(--nf-error)', background: g.status === 'ok' ? 'rgba(79,191,139,0.14)' : 'rgba(212,99,79,0.16)' }}>{g.status === 'ok' ? `${g.items.length} 条` : '读取失败'}</span>
                  {g.status === 'ok' && <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => selectGroup(g)}>全选本榜</button>}
                </div>
                {g.status === 'error' && <div style={{ fontSize: 11, color: 'var(--nf-error)', marginTop: 4 }}>{g.error}</div>}
                {g.status === 'ok' && (
                  <div style={{ marginTop: 6, maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {g.items.map(it => {
                      const key = candKey(g, it)
                      const sel = selectedCandidates.has(key)
                      return (
                        <label key={key} onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') toggleCandidate(key) }} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 2px', fontSize: 13.5, cursor: 'pointer' }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleCandidate(key)} onClick={e => e.stopPropagation()} style={{ marginTop: 3 }} />
                          <span style={{ lineHeight: 1.5 }}>
                            <b style={{ fontSize: 14 }}>{it.rank}. {it.title}</b>
                            {it.author !== undefined && it.author !== '' ? <span style={{ color: 'var(--nf-text-2)', fontSize: 12.5 }}>（{it.author}）</span> : null}
                            {(it.tags ?? []).length > 0 ? <span style={{ color: 'var(--nf-info)', fontSize: 12.5 }}> [{it.tags!.slice(0, 3).join('、')}]</span> : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 本期判断 + 信号 */}
      {result !== null && (
        <>
          <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
            <span className={css.cardTitle}>本期判断</span>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div><span style={{ color: 'var(--nf-text-2)' }}>题材基底：</span>{result.productionFoundation.genre.name}（{result.productionFoundation.genre.description}）</div>
              <div><span style={{ color: 'var(--nf-text-2)' }}>主要推进：</span>{result.productionFoundation.primaryStoryMode.name} —— {result.productionFoundation.primaryStoryMode.driver}</div>
              {result.productionFoundation.secondaryStoryMode !== undefined && (
                <div><span style={{ color: 'var(--nf-text-2)' }}>辅助推进：</span>{result.productionFoundation.secondaryStoryMode.name} —— {result.productionFoundation.secondaryStoryMode.driver}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
              <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={applyBusy} onClick={() => { void apply() }}>
                {applyBusy ? '应用…' : '应用到当前书'}
              </button>
              <button type="button" className={css.button} disabled={syncBusy} onClick={() => { void sync() }}>
                {syncBusy ? '同步…' : '同步到全局资源库'}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {applied !== '' && <span style={{ fontSize: 12, color: 'var(--nf-success)' }}>{applied}</span>}
                {syncedMsg !== '' && <span style={{ fontSize: 12, color: 'var(--nf-info)' }}>{syncedMsg}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--nf-space-10)' }}>
            {result.signals.map(s => {
              const selected = selectedIds.has(s.id)
              return (
                <article key={s.id} onClick={() => toggleSignal(s.id)} style={{ border: '1px solid var(--nf-border)', borderRadius: 12, padding: 'var(--nf-space-12)', cursor: 'pointer', background: selected ? 'var(--nf-accent-soft)' : 'var(--nf-bg)', boxShadow: selected ? '0 0 0 2px var(--nf-accent)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99, color: '#fff', background: badge(s.kind) }}>{KIND_LABELS[s.kind] ?? s.kind}</span>
                    {selected && <span style={{ fontSize: 11, color: 'var(--nf-accent)', fontWeight: 600 }}>已选</span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600 }}>{s.title}</div>
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--nf-text-2)', lineHeight: 1.6 }}>{s.detail}</p>
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, fontSize: 11, color: 'var(--nf-text-2)' }}>
                    <span>{s.direction === 'rising' ? '正在升温' : s.direction === 'falling' ? '正在降温' : s.direction === 'stable' ? '相对稳定' : '当前高频'}</span>
                    {s.recommended === true && <span style={{ color: 'var(--nf-success)' }}>★推荐</span>}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {/* 底部：影响模式 + 用信号创作 */}
      {result !== null && (
        <div style={{ position: 'sticky', bottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 'var(--nf-space-10) var(--nf-space-12)', border: '1px solid var(--nf-accent)', borderRadius: 12, background: 'color-mix(in srgb, var(--nf-bg) 92%, transparent)', backdropFilter: 'blur(6px)', boxShadow: 'var(--nf-shadow)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>已选 {selectedIds.size}/{MAX_SIGNALS} 项市场信号</div>
            <div style={{ fontSize: 11, color: 'var(--nf-text-2)' }}>AI 推荐已自动勾选，可替换后再开书。</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className={css.input} style={{ width: 'auto', padding: '4px 8px' }} value={influenceMode} onChange={e => setInfluenceMode(e.target.value as 'follow_hot' | 'differentiate' | 'light')}>
              {Object.entries(MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={selectedIds.size === 0 || briefBusy} onClick={() => { void createBrief() }}>
              {briefBusy ? '生成中…' : '用这些信号创作'}
            </button>
          </div>
        </div>
      )}

      {brief !== null && (
        <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
          <span className={css.cardTitle}>✍ 开书创意简报</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', fontSize: 13, lineHeight: 1.7 }}>
            <div><b>创作约束</b>：{brief.promptBlock}</div>
            <div><b>开篇想法</b>：{brief.openingIdea}</div>
            <div><b>核心优势</b>：{brief.coreAdvantage}</div>
            <div><b>追读卖点</b>：{brief.bookSellingPoint}</div>
            <div><b>前30章承诺</b>：{brief.first30ChapterPromise}</div>
          </div>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={ideaBusy || selectedIds.size === 0} onClick={() => { void createIdeas() }}>
            {ideaBusy ? '生成灵感中…' : '✨ 用这些信号生成灵感'}
          </button>
        </div>
      )}

      {ideas !== null && ideas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--nf-space-10)' }}>
          {ideas.map((it, i) => (
            <div key={i} className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: 'var(--nf-success)' }}>{it.genre} · {it.pov}</div>
              <div style={{ fontSize: 13 }}>钩子：{it.hook}</div>
              <div style={{ fontSize: 12, color: 'var(--nf-text-2)' }}>兑现：{it.payoff}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
