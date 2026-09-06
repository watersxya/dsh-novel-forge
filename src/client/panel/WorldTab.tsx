/**
 * 大世界页签：境界体系 / 地理区域 / 势力分布 的结构化编辑 + AI 提炼。
 * 数据注入每章生成与审稿提示词（renderWorld），保证设定不写飞。
 */
import { useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { WorldFaction, WorldRealm, WorldRegion, WorldState } from '../../protocol.ts'
import css from './panel.module.css'

const EMPTY: WorldState = { realms: [], regions: [], factions: [] }

/** 一个可编辑条目行。 */
function EditableRow({
  name,
  detail,
  onName,
  onDetail,
  onRemove,
  namePlaceholder,
  detailPlaceholder,
}: {
  name: string
  detail: string
  onName: (v: string) => void
  onDetail: (v: string) => void
  onRemove: () => void
  namePlaceholder: string
  detailPlaceholder: string
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--nf-space-6)', alignItems: 'flex-start' }}>
      <input className={css.input} style={{ flex: 2, minWidth: 0 }} placeholder={namePlaceholder} value={name} onChange={e => { onName(e.target.value) }} />
      <input className={css.input} style={{ flex: 3, minWidth: 0 }} placeholder={detailPlaceholder} value={detail} onChange={e => { onDetail(e.target.value) }} />
      <button type="button" className={`${css.button} ${css.buttonSmall}`} title="删除" onClick={onRemove}>×</button>
    </div>
  )
}

/** 大世界页签。 */
export function WorldTab({
  api,
  world,
  onChanged,
}: {
  api: NovelApi
  /** 当前项目的大世界数据（可能为空）。 */
  world: WorldState | undefined
  /** 保存/提炼成功后由父组件刷新项目状态。 */
  onChanged: (world: WorldState) => void
}) {
  const [draft, setDraft] = useState<WorldState>(() => world ?? EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 外部数据变化时同步草稿（提炼/保存/切换书后）。
  useEffect(() => {
    setDraft(world ?? EMPTY)
  }, [world])

  const handleGenerate = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.world('generate')
      setDraft(result.world)
      onChanged(result.world)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.world('save', draft)
      onChanged(result.world)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setRealms = (realms: WorldRealm[]): void => setDraft(prev => ({ ...prev, realms }))
  const setRegions = (regions: WorldRegion[]): void => setDraft(prev => ({ ...prev, regions }))
  const setFactions = (factions: WorldFaction[]): void => setDraft(prev => ({ ...prev, factions }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-12)' }}>
      {error !== '' && <div className={css.card} style={{ borderColor: 'var(--nf-error)' }}><span style={{ color: 'var(--nf-error)' }}>{error}</span></div>}

      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between' }}>
          <span className={css.cardTitle}>大世界</span>
          <div className={css.row}>
            <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleGenerate() }}>
              ✨ AI 提炼
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleSave() }}>
              💾 保存
            </button>
          </div>
        </div>
        <span className={css.meta}>
          境界体系按由低到高排序注入章节生成提示词，模型不得随意跳级或自创境界；区域与势力约束地理/势力设定。AI 提炼不满意可逐条编辑后保存。
        </span>
      </div>

      {/* 境界体系 */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between' }}>
          <span className={css.cardTitle}>境界体系（{draft.realms.length}）</span>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setRealms([...draft.realms, { name: '', description: '' }]) }}>
            ＋ 新增境界
          </button>
        </div>
        {draft.realms.length === 0 ? (
          <span className={css.meta}>暂无境界体系 — 点击 ✨AI 提炼 或手动添加（由低到高）。</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
            {draft.realms.map((realm, i) => (
              <EditableRow
                key={i}
                name={realm.name}
                detail={realm.description}
                onName={v => { const next = [...draft.realms]; next[i] = { ...next[i]!, name: v }; setRealms(next) }}
                onDetail={v => { const next = [...draft.realms]; next[i] = { ...next[i]!, description: v }; setRealms(next) }}
                onRemove={() => { setRealms(draft.realms.filter((_, idx) => idx !== i)) }}
                namePlaceholder={`第 ${i + 1} 阶境界名`}
                detailPlaceholder="突破条件 / 寿命 / 标志…"
              />
            ))}
          </div>
        )}
      </div>

      {/* 地理区域 */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between' }}>
          <span className={css.cardTitle}>地理区域（{draft.regions.length}）</span>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setRegions([...draft.regions, { name: '', description: '' }]) }}>
            ＋ 新增区域
          </button>
        </div>
        {draft.regions.length === 0 ? (
          <span className={css.meta}>暂无地理区域 — 大陆 / 海域 / 秘境 / 遗迹…</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
            {draft.regions.map((region, i) => (
              <EditableRow
                key={i}
                name={region.name}
                detail={region.description}
                onName={v => { const next = [...draft.regions]; next[i] = { ...next[i]!, name: v }; setRegions(next) }}
                onDetail={v => { const next = [...draft.regions]; next[i] = { ...next[i]!, description: v }; setRegions(next) }}
                onRemove={() => { setRegions(draft.regions.filter((_, idx) => idx !== i)) }}
                namePlaceholder="区域名（如大荒 / 青云山脉）"
                detailPlaceholder="描述…"
              />
            ))}
          </div>
        )}
      </div>

      {/* 势力分布 */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between' }}>
          <span className={css.cardTitle}>势力分布（{draft.factions.length}）</span>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setFactions([...draft.factions, { name: '', kind: '宗门', description: '' }]) }}>
            ＋ 新增势力
          </button>
        </div>
        {draft.factions.length === 0 ? (
          <span className={css.meta}>暂无势力 — 宗门 / 家族 / 王朝 / 组织…</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
            {draft.factions.map((faction, i) => (
              <EditableRow
                key={i}
                name={`${faction.name}（${faction.kind}）`}
                detail={faction.description}
                onName={v => {
                  const next = [...draft.factions]
                  const match = /^(.*)（(.*)）$/.exec(v)
                  next[i] = { ...next[i]!, name: (match?.[1] ?? v).trim(), kind: (match?.[2] ?? next[i]!.kind).trim() || '宗门' }
                  setFactions(next)
                }}
                onDetail={v => { const next = [...draft.factions]; next[i] = { ...next[i]!, description: v }; setFactions(next) }}
                onRemove={() => { setFactions(draft.factions.filter((_, idx) => idx !== i)) }}
                namePlaceholder="势力名（类型）如：青云宗（宗门）"
                detailPlaceholder="描述…"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
