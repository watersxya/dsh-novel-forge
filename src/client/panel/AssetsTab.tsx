/**
 * 写作资产页签：题材基底库 / 推进模式库 / 反 AI 规则 / 写法引擎。
 * 学习自 AI-Novel-Writing-Assistant 的四大资产模块，注入到生成与审稿提示词中。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { tt } from './helpers.ts'
import type { AntiAiRule, AssetsResponse, GenreNode, ProgressionMode, StyleAsset, StyleTemplate } from '../../protocol.ts'
import css from './panel.module.css'

/** Props. */
export interface AssetsTabProps {
  api: NovelApi
  /** 初始子页（左侧导航直达对应资产分类）。 */
  initialTab?: AssetSubTab
}

/** 渲染题材树（带勾选当前题材）。 */
function GenreTree({ node, selected, onSelect }: { node: GenreNode; selected: string; onSelect: (node: GenreNode) => void }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--nf-space-6)', cursor: 'pointer' }}>
        <input type="radio" name="genre" checked={selected === node.name} onChange={() => { onSelect(node) }} />
        <span>
          <b>{node.name}</b>
          {node.description !== '' && (
            <span
              className={`${css.meta} ${css.genreDesc}`}
              title={node.description}
            >
              — {node.description}
            </span>
          )}
        </span>
      </label>
      {node.children.length > 0 && (
        <div style={{ marginLeft: 'var(--nf-space-24)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)' }}>
          {node.children.map(child => (
            <GenreTree key={child.name} node={child} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 写作资产子页签。 */
type AssetSubTab = 'genre' | 'progression' | 'templates' | 'rules' | 'style'

/** 子页签定义。 */
const SUB_TABS: ReadonlyArray<{ id: AssetSubTab; label: string }> = [
  { id: 'genre', label: '题材基底' },
  { id: 'progression', label: '推进模式' },
  { id: 'templates', label: '笔法帖' },
  { id: 'rules', label: '文戒' },
  { id: 'style', label: '心法' },
]

/** 写作资产页签。 */
export function AssetsTab({ api, initialTab = 'genre' }: AssetsTabProps) {
  const [assetTab, setAssetTab] = useState<AssetSubTab>(initialTab)
  const [data, setData] = useState<AssetsResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sampleText, setSampleText] = useState('')
  const [styleName, setStyleName] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newProgression, setNewProgression] = useState('')
  /** 正在行内编辑的自定义反 AI 规则（下标 + 草稿字段）。 */
  const [editingRule, setEditingRule] = useState<{ index: number; name: string; avoid: string; fix: string } | null>(null)
  const loadId = useRef(0)

  /** Load assets (or reset from a new call). */
  const refresh = useCallback(async () => {
    try {
      const result = await api.assets()
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Patch assets and refresh. */
  const patch = async (patch: Parameters<NovelApi['patchAssets']>[0]): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.patchAssets(patch)
      setData(result)
      setNotice('已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 提取写法资产。 */
  const handleExtractStyle = async (): Promise<void> => {
    if (sampleText.trim().length < 50) {
      setError(tt('settings.exported') === '' ? '样本文本过短' : '样本文本过短（<50 字符）')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.styleEngine({ sampleText, name: styleName })
      setData(prev => prev === null ? prev : {
        ...prev,
        projectAssets: {
          ...prev.projectAssets,
          styleAssets: [...(prev.projectAssets.styleAssets ?? []), result.styleAsset],
          updatedAt: new Date().toISOString(),
        },
      })
      setNotice(`写法资产「${result.styleAsset.name}」已提取并绑定`)
      setSampleText('')
      setStyleName('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 添加自定义反 AI 规则（一行 "名称：要避免的" 简单格式由用户填写 JSON）。 */
  const handleAddRule = async (): Promise<void> => {
    const text = newRule.trim()
    if (text === '') return
    let rule: AntiAiRule
    try {
      const parsed = JSON.parse(text) as AntiAiRule
      rule = { name: parsed.name ?? '自定义规则', avoid: parsed.avoid ?? '', fix: parsed.fix ?? '' }
    } catch {
      // Fallback: treat as "避免什么" text.
      rule = { name: `自定义规则 ${(data?.projectAssets.antiAiRules ?? []).length + 1}`, avoid: text, fix: '' }
    }
    if (rule.avoid === '' && rule.fix === '') return
    const next = [...(data?.projectAssets.antiAiRules ?? []), rule]
    await patch({ antiAiRules: next })
    setNewRule('')
  }

  /** 保存行内编辑的自定义规则。 */
  const handleSaveRuleEdit = async (): Promise<void> => {
    if (editingRule === null) return
    const rules = [...(data?.projectAssets.antiAiRules ?? [])]
    if (editingRule.index < 0 || editingRule.index >= rules.length) return
    const name = editingRule.name.trim() || rules[editingRule.index]!.name
    if (editingRule.avoid.trim() === '' && editingRule.fix.trim() === '') return
    rules[editingRule.index] = { name, avoid: editingRule.avoid.trim(), fix: editingRule.fix.trim() }
    await patch({ antiAiRules: rules })
    setEditingRule(null)
  }

  /** 删除一条自定义规则。 */
  const handleRemoveRule = async (index: number): Promise<void> => {
    const rules = [...(data?.projectAssets.antiAiRules ?? [])]
    rules.splice(index, 1)
    setEditingRule(null)
    await patch({ antiAiRules: rules })
  }

  /** 把内置规则复制为自定义副本（同名覆盖生效），并打开行内编辑。 */
  const handleOverrideBuiltin = (rule: AntiAiRule): void => {
    const rules = data?.projectAssets.antiAiRules ?? []
    const existing = rules.findIndex(r => r.name === rule.name)
    if (existing >= 0) {
      setEditingRule({ index: existing, name: rules[existing]!.name, avoid: rules[existing]!.avoid, fix: rules[existing]!.fix ?? '' })
    } else {
      const next = [...rules, { ...rule, fix: rule.fix ?? '' }]
      setEditingRule({ index: next.length - 1, name: rule.name, avoid: rule.avoid, fix: rule.fix ?? '' })
      void patch({ antiAiRules: next })
    }
  }

  /** 设置题材。 */
  const handleSelectGenre = (node: GenreNode): void => {
    void patch({ genre: node })
  }

  /** 添加推进模式（从内置库选择）。 */
  const handleAddProgression = async (mode: ProgressionMode): Promise<void> => {
    const current = data?.projectAssets
    const isPrimary = (data?.projectAssets.primaryProgression ?? undefined) === undefined
    if (isPrimary) {
      await patch({ primaryProgression: { ...mode, primary: true } })
    } else {
      await patch({ auxiliaryProgressions: [...(current?.auxiliaryProgressions ?? []), { ...mode, primary: false }] })
    }
  }

  if (data === null) {
    return <div className={css.card}><span className={css.meta}>{tt('common.loading')}</span></div>
  }

  const assets = data.projectAssets
  const builtinRules = data.antiAiLibrary
  const customRules = assets.antiAiRules ?? []
  const genreLibrary = data.genreLibrary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-12)', flex: 1, minHeight: 0 }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle} style={{ fontSize: 'var(--nf-fs-16)', fontWeight: 700 }}>🧰 创作资产</span>
        <span className={css.meta}>题材基底 / 推进模式 / 笔法帖 / 文戒 / 心法</span>
      </div>
      {error !== '' && <div className={css.card} style={{ borderColor: 'var(--nf-error)' }}><span style={{ color: 'var(--nf-error)' }}>{tt('common.error')}: {error}</span></div>}
      {notice !== '' && <div className={css.card}><span style={{ color: 'var(--nf-success)' }}>{notice}</span></div>}

      {/* 资产状态总览（参照 AI-Novel-Writing-Assistant 状态网格） */}
      <div className={css.assetGrid}>
        <div className={css.assetStat}>
          <span className={css.assetStatLabel}>当前题材</span>
          <span className={css.assetStatValue}>{assets.genre?.name ?? '未设置'}</span>
          {assets.genre !== undefined && <span className={css.assetStatDetail} title={assets.genre.description}>{assets.genre.description}</span>}
        </div>
        <div className={css.assetStat}>
          <span className={css.assetStatLabel}>主推进模式</span>
          <span className={css.assetStatValue}>{assets.primaryProgression?.name ?? '未设置'}</span>
          {assets.primaryProgression !== undefined && <span className={css.assetStatDetail} title={assets.primaryProgression.driver}>{assets.primaryProgression.driver}</span>}
        </div>
        <div className={css.assetStat}>
          <span className={css.assetStatLabel}>已绑定写法</span>
          <span className={css.assetStatValue}>{assets.styleAssets?.length ?? 0} 套</span>
          <span className={css.assetStatDetail} title={(assets.styleAssets ?? []).map(s => s.name).join('、')}>
            {(assets.styleAssets ?? []).map(s => s.name).join('、') || '未绑定（可在「笔法帖」一键选用）'}
          </span>
        </div>
        <div className={css.assetStat}>
          <span className={css.assetStatLabel}>文戒</span>
          <span className={css.assetStatValue}>{builtinRules.length} 内置 + {(assets.antiAiRules ?? []).length} 自定义</span>
          <span className={css.assetStatDetail}>全部生效于生成与审稿提示词</span>
        </div>
      </div>

      {/* 子页签：题材基底 / 推进模式 / 笔法帖 / 文戒 / 心法 */}
      <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${css.button} ${assetTab === t.id ? css.buttonPrimary : ''}`}
            style={{ fontSize: 'var(--nf-fs-14)', flex: 1 }}
            onClick={() => { setAssetTab(t.id) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 题材基底库 */}
      {assetTab === 'genre' && (
        <div className={css.card}>
          <span className={css.cardTitle}>题材基底库</span>
          <span className={css.meta}>这本书属于哪个阅读市场？题材定位会注入章节生成与审稿提示词。</span>
          {assets.genre !== undefined && (
            <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <b>当前题材：{assets.genre.name}</b> — {assets.genre.description}
            </div>
          )}
          {/* 题材基底库：自然展开，不套内部滚动条（描述两行截断，悬停看全文） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)' }}>
            {genreLibrary.map(root => <GenreTree key={root.name} node={root} selected={assets.genre?.name ?? ''} onSelect={handleSelectGenre} />)}
          </div>
        </div>
      )}

      {/* 推进模式库 */}
      {assetTab === 'progression' && (
        <div className={css.card} style={{ flex: 1, minHeight: 0 }}>
          <span className={css.cardTitle}>推进模式库</span>
          <span className={css.meta}>读者为什么继续看下一章？主模式 + 辅助模式注入卷规划与章节生成。</span>
          {assets.primaryProgression !== undefined && (
            <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)', color: 'var(--nf-accent)' }}>
              <b>主推进：{assets.primaryProgression.name}</b> — {assets.primaryProgression.driver}
            </div>
          )}
          {assets.auxiliaryProgressions.map(mode => (
            <div key={mode.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <b>{mode.name}</b> — {mode.driver}
            </div>
          ))}
          <span className={css.meta}>从内置推进模式库选择添加（第一个设为主推进）：</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {data.progressionLibrary.map(mode => {
              const alreadyPrimary = assets.primaryProgression?.name === mode.name
              const alreadyAux = assets.auxiliaryProgressions.some(m => m.name === mode.name)
              if (alreadyPrimary || alreadyAux) return null
              return (
                <button key={mode.name} className={css.button} disabled={busy} onClick={() => { void handleAddProgression(mode) }}>
                  ＋ {assets.primaryProgression === undefined ? `主推进：` : '辅助：'}{mode.name} — {mode.driver.slice(0, 40)}…
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 笔法帖（一键绑定） */}
      {assetTab === 'templates' && (
        <div className={css.card} style={{ flex: 1, minHeight: 0 }}>
          <span className={css.cardTitle}>笔法帖</span>
          <span className={css.meta}>从内置 8 套叙事风格模板中一键选用（来自 AI-Novel-Writing-Assistant 写法引擎），无需样本文本；绑定后生成与润色都遵循该风格。</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-8)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {data.styleTemplates.map(template => {
              const bound = assets.styleAssets.some(s => s.name === template.name)
              return (
                <div key={template.key} style={{ border: `1px solid ${bound ? 'var(--nf-accent)' : 'var(--nf-border)'}`, borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-8) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nf-space-8)' }}>
                    <span><b>{template.name}</b> <span className={css.badge} style={{ borderColor: 'var(--nf-text-3)', color: 'var(--nf-text-3)' }}>{template.category}</span></span>
                    <button
                      className={`${css.button} ${css.buttonSmall} ${bound ? '' : css.buttonPrimary}`}
                      disabled={busy || bound}
                      onClick={() => {
                        const styleAsset: StyleAsset = {
                          name: template.name,
                          proseRules: [...template.proseRules, ...template.rhythmRules.map(r => `节奏：${r}`)],
                          dialogueRules: template.dialogueRules,
                          descriptionRules: template.languageRules,
                          boundaries: [`模板「${template.name}」适用题材：${template.applicableGenres.join('、')}`, '不要违背模板的叙事单元结构与节奏约束'],
                          createdAt: new Date().toISOString(),
                        }
                        void patch({ styleAssets: [...(data.projectAssets.styleAssets ?? []), styleAsset] })
                      }}
                    >
                      {bound ? '✓ 已绑定' : '＋ 绑定'}
                    </button>
                  </div>
                  <div className={css.meta}>{template.description}</div>
                  <div className={css.meta}>叙述：{template.proseRules.slice(0, 2).join('；')}</div>
                  <div className={css.meta}>台词：{template.dialogueRules.slice(0, 1).join('；')}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 文戒 */}
      {assetTab === 'rules' && (
        <div className={css.card} style={{ flex: 1, minHeight: 0 }}>
        <span className={css.cardTitle}>文戒</span>
        <span className={css.meta}>写作时必须遵守的表达边界（内置全局 + 项目自定义），生成与审稿都会检查。内置规则可用「覆盖编辑」复制为自定义版本调整。</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {builtinRules.map(rule => {
            const overridden = customRules.some(r => r.name === rule.name)
            return (
              <div key={rule.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nf-space-8)' }}>
                  <span>
                    <b>{rule.name}</b>{' '}
                    <span className={css.badge} style={{ borderColor: overridden ? 'var(--nf-accent)' : 'var(--nf-text-3)', color: overridden ? 'var(--nf-accent)' : 'var(--nf-text-3)' }}>
                      {overridden ? '自定义覆盖中' : '内置'}
                    </span>
                  </span>
                  <button className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { handleOverrideBuiltin(rule) }}>
                    {overridden ? '✎ 编辑覆盖' : '＋ 覆盖编辑'}
                  </button>
                </div>
                <div className={css.meta}>避免：{rule.avoid}</div>
                <div className={css.meta}>修正：{rule.fix}</div>
              </div>
            )
          })}
          {customRules.map((rule, index) => (
            <div key={`${rule.name}-${index}`} style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nf-space-8)' }}>
                <span>
                  <b>{rule.name}</b>{' '}
                  <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>自定义</span>
                </span>
                <span style={{ display: 'flex', gap: 'var(--nf-space-6)' }}>
                  <button className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { setEditingRule({ index, name: rule.name, avoid: rule.avoid, fix: rule.fix ?? '' }) }}>
                    编辑
                  </button>
                  <button className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleRemoveRule(index) }}>
                    删除
                  </button>
                </span>
              </div>
              {editingRule !== null && editingRule.index === index ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginTop: 'var(--nf-space-6)' }}>
                  <input className={css.input} placeholder="规则名" value={editingRule.name} onChange={e => { setEditingRule({ ...editingRule, name: e.target.value }) }} />
                  <input className={css.input} placeholder="避免（要杜绝的表达）" value={editingRule.avoid} onChange={e => { setEditingRule({ ...editingRule, avoid: e.target.value }) }} />
                  <input className={css.input} placeholder="修正（改写方向，可留空）" value={editingRule.fix} onChange={e => { setEditingRule({ ...editingRule, fix: e.target.value }) }} />
                  <div className={css.row}>
                    <button className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || (editingRule.avoid.trim() === '' && editingRule.fix.trim() === '')} onClick={() => { void handleSaveRuleEdit() }}>
                      保存
                    </button>
                    <button className={`${css.button} ${css.buttonSmall}`} onClick={() => { setEditingRule(null) }}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={css.meta}>避免：{rule.avoid}</div>
                  {rule.fix !== '' && <div className={css.meta}>修正：{rule.fix}</div>}
                </>
              )}
            </div>
          ))}
        </div>
        <div className={css.row}>
          <input
            className={css.input}
            style={{ flex: 1 }}
            placeholder='新增规则（格式：{"name":"规则名","avoid":"要避免的","fix":"修正方向"}；或直接填要避免的问题）'
            value={newRule}
            onChange={e => { setNewRule(e.target.value) }}
          />
          <button className={`${css.button} ${css.buttonPrimary}`} disabled={busy || newRule.trim() === ''} onClick={() => { void handleAddRule() }}>＋ 添加</button>
        </div>
      </div>
      )}

      {/* 心法（自定义写法引擎） */}
      {assetTab === 'style' && (
        <div className={css.card}>
          <span className={css.cardTitle}>心法</span>
          <span className={css.meta}>粘贴一段你喜欢的样本文本，AI 提取叙事风格规则并绑定到本书，后续章节保持同一味道。</span>
          {assets.styleAssets.map(style => (
            <div key={style.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-6)', padding: 'var(--nf-space-6) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)' }}>
              <b>{style.name}</b>
              <div className={css.meta}>叙述：{style.proseRules.slice(0, 3).join('；')}</div>
              {style.dialogueRules.length > 0 && <div className={css.meta}>台词：{style.dialogueRules.slice(0, 2).join('；')}</div>}
            </div>
          ))}
          <textarea
            className={css.textarea}
            style={{ minHeight: 90 }}
            placeholder="粘贴样本文本（一段能代表目标风格的文字，50 字以上）…"
            value={sampleText}
            onChange={e => { setSampleText(e.target.value) }}
          />
          <div className={css.row}>
            <input
              className={css.input}
              style={{ flex: 1 }}
              placeholder="写法资产名（可选）"
              value={styleName}
              onChange={e => { setStyleName(e.target.value) }}
            />
            <button className={`${css.button} ${css.buttonPrimary}`} disabled={busy || sampleText.trim().length < 50} onClick={() => { void handleExtractStyle() }}>
              提取并绑定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
