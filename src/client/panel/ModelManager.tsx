/**
 * 模型管理（DSH 风格）：两块分区——
 * ① 模型（提供方管理）：提供方卡片（编辑/删除）+ 添加提供方 / 添加自定义提供方；
 * ② 当前写作模型：提供商/模型下拉 + 测试连通 + 推理强度。
 */
import { useCallback, useEffect, useState } from 'react'
import { PlugZap, Plus, Trash2, RefreshCw, X } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { SavedModel, AddModelRequest, LlmModelOption, LlmVendorOption } from '../../protocol.ts'
import { LLM_VENDORS } from '../../protocol.ts'
import { tt } from './helpers.ts'
import css from './panel.module.css'

/** 目录不可用时回退的内置预设（历史行为）。 */
export const FALLBACK_MODEL_PRESETS = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'] as const

const CUSTOM = '__custom__'
interface TestState { testing: boolean; ok?: boolean; ms?: number; message?: string }
interface ProviderInfo { id: string; name: string }
type AddPanel = 'none' | 'standard' | 'custom'

export interface ModelManagerProps {
  api: NovelApi
  provider: string
  model: string
  savedModels: SavedModel[]
  onProvider: (provider: string) => void
  onModel: (model: string) => void
  onSavedModels: (models: SavedModel[]) => void
}

function fallbackVendors(): LlmVendorOption[] {
  return LLM_VENDORS.map(v => ({ id: v.route, name: v.name, models: v.models, apiKeyEnv: v.apiKeyEnv, builtin: v.builtin }))
}

export function ModelManager({ api, provider, model, onProvider, onModel }: ModelManagerProps): JSX.Element {
  // ---- 当前写作模型
  const [configuredProviders, setConfiguredProviders] = useState<ProviderInfo[]>([])
  const [providerModels, setProviderModels] = useState<LlmModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [providerCustom, setProviderCustom] = useState(false)
  const [modelCustom, setModelCustom] = useState(false)
  const [test, setTest] = useState<TestState>({ testing: false })

  // ---- 提供方管理
  const [vendors, setVendors] = useState<LlmVendorOption[]>(fallbackVendors())
  const [addPanel, setAddPanel] = useState<AddPanel>('none')
  const [editTarget, setEditTarget] = useState('')
  const [vendorId, setVendorId] = useState('zai-coding-cn')
  const [addModel, setAddModel] = useState('')
  const [addApiKey, setAddApiKey] = useState('')
  const [addName, setAddName] = useState('')
  const [custProvider, setCustProvider] = useState('')
  const [custName, setCustName] = useState('')
  const [custBaseURL, setCustBaseURL] = useState('')
  const [custProtocol, setCustProtocol] = useState('openai-completions')
  const [custModel, setCustModel] = useState('')
  const [custApiKey, setCustApiKey] = useState('')
  const [savingAdd, setSavingAdd] = useState(false)
  const [addMsg, setAddMsg] = useState('')
  const [addErr, setAddErr] = useState('')


  const loadProviders = useCallback(async (): Promise<void> => {
    try { const r = await api.llmProviders(); if (r.providers.length > 0) setConfiguredProviders(r.providers) } catch { /* 兜底 */ }
  }, [api])
  const loadVendors = useCallback(async (): Promise<void> => {
    try { const r = await api.llmVendors(); if (r.vendors.length > 0) setVendors(r.vendors) } catch { /* 静态兜底 */ }
  }, [api])
  const loadProviderModels = useCallback(async (p: string): Promise<void> => {
    setModelsLoading(true)
    try { const r = await api.llmModels(p); setProviderModels(r.models) } catch { setProviderModels([]) } finally { setModelsLoading(false) }
  }, [api])

  useEffect(() => { void loadProviders(); void loadVendors() }, [api, loadProviders, loadVendors])
  useEffect(() => { if (provider !== '') void loadProviderModels(provider) }, [provider, loadProviderModels])

  const currentVendor = vendors.find(v => v.id === vendorId)

  const runTest = async (): Promise<void> => {
    const p = provider.trim(); const m = model.trim()
    if (p === '' || m === '' || test.testing) return
    setTest({ testing: true })
    try { const r = await api.llmTest(p, m); setTest({ testing: false, ok: r.ok, ms: r.ms, message: r.message }) }
    catch (err) { setTest({ testing: false, ok: false, message: (err as Error).message }) }
  }

  const openPanel = (panel: AddPanel, target = ''): void => {
    setAddPanel(panel); setEditTarget(target); setAddMsg(''); setAddErr('')
    if (panel === 'standard') { setVendorId(target !== '' ? target : 'zai-coding-cn'); setAddModel(''); setAddApiKey(''); setAddName('') }
    else if (panel === 'custom') { setCustProvider(target); setCustName(''); setCustBaseURL(''); setCustModel(''); setCustApiKey('') }
  }

  const saveStandard = async (): Promise<void> => {
    if (vendorId.trim() === '') { setAddErr('请选择提供方'); return }
    if (addApiKey.trim() === '') { setAddErr('请填写 API 密钥（或留空使用环境认证）'); return }
    const modelId = addModel.trim()
    setSavingAdd(true); setAddMsg(''); setAddErr('')
    try {
      const res = await api.addModel({ mode: 'vendor', vendor: vendorId, model: modelId || vendorId, apiKey: addApiKey.trim(), apiKeyEnv: currentVendor?.apiKeyEnv, name: addName.trim() || undefined })
      setAddMsg(res.message ?? '已保存'); setAddPanel('none'); setAddApiKey(''); setAddModel(''); setAddName(''); setEditTarget('')
      await loadProviders()
    } catch (err) { setAddErr((err as Error).message) } finally { setSavingAdd(false) }
  }

  const saveCustom = async (): Promise<void> => {
    if (custProvider.trim() === '') { setAddErr('请填 Provider ID'); return }
    if (custBaseURL.trim() === '') { setAddErr('请填 API 地址'); return }
    if (custApiKey.trim() === '') { setAddErr('请填 API 密钥（或留空使用环境认证）'); return }
    if (custModel.trim() === '') { setAddErr('请填模型 id（或点“获取可用模型”）'); return }
    setSavingAdd(true); setAddMsg(''); setAddErr('')
    try {
      const res = await api.addModel({ mode: 'custom', provider: custProvider.trim(), model: custModel.trim(), apiKey: custApiKey.trim(), baseURL: custBaseURL.trim(), name: custName.trim() || undefined })
      setAddMsg(res.message ?? '已创建提供方'); setAddPanel('none'); setCustProvider(''); setCustName(''); setCustBaseURL(''); setCustModel(''); setCustApiKey('')
      await loadProviders()
    } catch (err) { setAddErr((err as Error).message) } finally { setSavingAdd(false) }
  }

  const removeProvider = async (p: ProviderInfo): Promise<void> => {
    if (!window.confirm('删除提供方「' + (p.name !== '' ? p.name : p.id) + '」？将移除 DSH 配置与 API 密钥。')) return
    try { const vendor = vendors.find(v => v.id === p.id); await api.removeProvider({ provider: p.id, apiKeyEnv: vendor?.apiKeyEnv }); await loadProviders() }
    catch (err) { setAddErr((err as Error).message) }
  }


  const providerOptions: ProviderInfo[] = configuredProviders.some(p => p.id === provider) ? configuredProviders : (provider !== '' && provider !== CUSTOM ? [{ id: provider, name: provider }, ...configuredProviders] : configuredProviders)

  const modelOptions: LlmModelOption[] = modelCustom ? [] : (provider === 'deepseek-official'
    ? [...FALLBACK_MODEL_PRESETS.map(id => ({ id, name: id })), ...providerModels.filter(m => !(FALLBACK_MODEL_PRESETS as readonly string[]).includes(m.id))]
    : providerModels)
  const modelInList = modelOptions.some(m => m.id === model)
  const modelValue = modelCustom || (!modelInList && model !== '' && modelOptions.length > 0) ? CUSTOM : model
  const providerValue = providerCustom ? CUSTOM : provider


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-24)' }}>
      {/* ① 模型（提供方管理） */}
      <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-16)' }}>
        <span className={css.cardTitle}>模型</span>
        <span className={css.meta}>填入各提供方的 API 密钥即可使用其模型。</span>
        {configuredProviders.map(p => {
          const isBuiltin = p.id === 'deepseek-official'
          const isKnownVendor = vendors.some(v => v.id === p.id)
          return (
            <div key={p.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-12)', display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)' }}><span style={{ fontWeight: 600 }}>{p.name !== '' && p.name !== p.id ? p.name : p.id}</span><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--nf-success)' }} /></div>
              <div style={{ display: 'flex', gap: 'var(--nf-space-6)', alignItems: 'center' }}>
                {!isBuiltin && <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel(isKnownVendor ? 'standard' : 'custom', p.id)}>{tt('settings.edit')}</button>}
                {!isBuiltin && <button type="button" className={css.button + ' ' + css.buttonSmall} style={{ color: 'var(--nf-error)' }} onClick={() => { void removeProvider(p) }}>{tt('settings.delete')}</button>}
              </div>
            </div>
          )
        })}
        <div className={css.row} style={{ gap: 'var(--nf-space-10)', flexWrap: 'wrap' }}>
          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel('standard')}><Plus size={13} style={{ verticalAlign: -2 }} /> 添加提供方</button>
          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel('custom')}><Plus size={13} style={{ verticalAlign: -2 }} /> 添加自定义提供方</button>
        </div>

        {addPanel !== 'none' && (
          <div style={{ border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-12)', padding: 'var(--nf-space-12)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-12)' }}>
            <div className={css.row} style={{ justifyContent: 'space-between', alignItems: 'center' }}><span className={css.fieldLabel}>{addPanel === 'standard' ? (editTarget !== '' ? '编辑提供方' : '添加提供方') : '自定义提供方'}</span><button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel('none')}><X size={13} style={{ verticalAlign: -2 }} /> 关闭</button></div>
            {addPanel === 'standard' ? (
              <>
                <div className={css.field}><label className={css.fieldLabel}>提供方</label><select className={css.input} value={vendorId} onChange={e => setVendorId(e.target.value)}>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                <div className={css.field}><label className={css.fieldLabel}>API 密钥</label><input className={css.input} type="password" value={addApiKey} onChange={e => setAddApiKey(e.target.value)} placeholder="输入 API 密钥，或留空使用环境认证" /></div>
                <div className={css.field}><label className={css.fieldLabel}>模型 id（可选）</label><input className={css.input} value={addModel} onChange={e => setAddModel(e.target.value)} placeholder="例如 glm-5.3-flash" /></div>
                <div className={css.row} style={{ justifyContent: 'flex-end', gap: 'var(--nf-space-8)' }}><button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel('none')}>取消</button><button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} disabled={savingAdd} onClick={() => { void saveStandard() }}>{savingAdd ? '保存中…' : '保存'}</button></div>
              </>
            ) : (
              <>
                <div className={css.field}><label className={css.fieldLabel}>Provider ID</label><input className={css.input} value={custProvider} onChange={e => setCustProvider(e.target.value)} placeholder="acme-gateway" /></div>
                <div className={css.field}><label className={css.fieldLabel}>显示名称</label><input className={css.input} value={custName} onChange={e => setCustName(e.target.value)} placeholder="显示名称" /></div>
                <div className={css.field}><label className={css.fieldLabel}>API 地址</label><input className={css.input} value={custBaseURL} onChange={e => setCustBaseURL(e.target.value)} placeholder="https://gateway.example/v1" /></div>
                <div className={css.field}><label className={css.fieldLabel}>API 协议</label><select className={css.input} value={custProtocol} onChange={e => setCustProtocol(e.target.value)}><option value="openai-completions">openai-completions</option></select></div>
                <div className={css.field}><label className={css.fieldLabel}>API 密钥</label><input className={css.input} type="password" value={custApiKey} onChange={e => setCustApiKey(e.target.value)} placeholder="输入 API 密钥" /></div>
                <div className={css.field}><label className={css.fieldLabel}>模型目录 / 模型 id</label><input className={css.input} value={custModel} onChange={e => setCustModel(e.target.value)} placeholder="例如 glm-5.3-flash" /></div>
                <div className={css.row} style={{ justifyContent: 'flex-end', gap: 'var(--nf-space-8)' }}><button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => openPanel('none')}>取消</button><button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} disabled={savingAdd} onClick={() => { void saveCustom() }}>{savingAdd ? '创建中…' : '创建提供方'}</button></div>
              </>
            )}
          </div>
        )}
        {addMsg !== '' && <span className={css.meta} style={{ color: 'var(--nf-success)' }}>✓ {addMsg}</span>}
        {addErr !== '' && <span className={css.meta} style={{ color: 'var(--nf-error)' }}>✗ {addErr}</span>}
      </div>

      {/* ② 当前写作模型 */}
      <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-16)' }}>
        <span className={css.cardTitle}>当前写作模型</span>
        <div className={css.field}><label className={css.fieldLabel}>{tt('settings.provider')}</label><select className={css.input} value={providerValue} onChange={e => { const v = e.target.value; if (v === CUSTOM) setProviderCustom(true); else { setProviderCustom(false); onProvider(v) } }}>{providerOptions.map(p => <option key={p.id} value={p.id}>{p.name !== '' && p.name !== p.id ? p.name + '（' + p.id + '）' : p.id}</option>)}<option value={CUSTOM}>{tt('settings.customProvider')}</option></select>{providerCustom && <input className={css.input} style={{ marginTop: 'var(--nf-space-6)' }} value={provider} placeholder="provider 路由 id" onChange={e => onProvider(e.target.value)} />}</div>
        <div className={css.field}>
          <label className={css.fieldLabel}>{tt('settings.model')}</label>
          <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
            <select className={css.input} style={{ flex: 1, minWidth: 200 }} value={modelValue} onChange={e => { const v = e.target.value; if (v === CUSTOM) setModelCustom(true); else { setModelCustom(false); onModel(v) } }}>{modelOptions.map(m => <option key={m.id} value={m.id}>{m.name !== '' && m.name !== m.id ? m.name + '（' + m.id + '）' : m.id}</option>)}<option value={CUSTOM}>{tt('settings.modelCustom')}</option></select>
            <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={modelsLoading || provider === ''} title="刷新模型" onClick={() => { void loadProviderModels(provider) }}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> {modelsLoading ? '…' : tt('settings.refreshModels')}</button>
            <button type="button" className={css.button + ' ' + css.buttonSmall} disabled={test.testing || provider.trim() === '' || model.trim() === ''} onClick={() => { void runTest() }} title={tt('settings.testHint')}><PlugZap size={13} style={{ verticalAlign: -2 }} /> {test.testing ? tt('settings.testRunning') : tt('settings.testConnection')}</button>
          </div>
          {modelCustom && <input className={css.input} style={{ marginTop: 'var(--nf-space-6)' }} value={model} placeholder={tt('settings.modelCustomPlaceholder')} onChange={e => onModel(e.target.value)} />}
          <span className={css.meta} style={{ color: test.ok === true ? 'var(--nf-success)' : test.ok === false ? 'var(--nf-error)' : undefined }}>{test.testing ? tt('settings.testRunning') + '…' : test.ok === true ? '✓ ' + tt('settings.testOk') + ' · ' + (test.ms ?? '?') + 'ms' : test.ok === false ? '✗ ' + tt('settings.testFail') + (test.message !== undefined ? '：' + test.message : '') : tt('settings.testHint')}</span>
        </div>
      </div>
    </div>
  )
}

