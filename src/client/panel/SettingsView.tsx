/**
 * 共享设置页（作者首页「设置」与书内「设置」同入口）。
 * 自给自足：挂载时通过 api.status() 拉取全局配置，支持 model/writing/image/files/appearance 五组，
 * 保存走 api.patchConfig。不与某个书绑定，因此新装用户无书也能用。
 */
import { useEffect, useRef, useState } from 'react'
import { Brain, PenLine, Palette, Folder, Sparkles, RotateCcw, PlugZap, Plus, Trash2, Upload, X, Image } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { NovelConfig, ImageModelConfig } from '../../protocol.ts'
import { tt } from './helpers.ts'
import { ModelManager } from './ModelManager.tsx'
import { ReasoningSection } from './ReasoningSection.tsx'
import css from './panel.module.css'


const SETTINGS_SECTIONS: Array<{ id: 'model' | 'writing' | 'image' | 'files' | 'appearance'; label: string; icon: JSX.Element }> = [
  { id: 'model', label: '模型与推理', icon: <Brain size={16} /> },
  { id: 'writing', label: '写作与审稿', icon: <PenLine size={16} /> },
  { id: 'files', label: '路径与文件', icon: <Folder size={16} /> },
  { id: 'appearance', label: '外观与主题', icon: <Sparkles size={16} /> },
];

type SettingsTab = 'model' | 'writing' | 'image' | 'files' | 'appearance'
type ThemeMode = 'system' | 'light' | 'dark'
type ThemeName = 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield'
type EndfieldAccent = 'valley' | 'wuling'
type ThemeDensity = 'comfort' | 'compact' | 'spacious'

function readLS<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = window.localStorage.getItem(key) as T | null
    return v !== null && (allowed as readonly string[]).includes(v) ? v : fallback
  } catch { return fallback }
}

export function SettingsView({ api, onTheme, onSettingsTab, onEditorFontSize, onBackground, onOpacity, onEndfieldAccent }: {
  api: NovelApi;
  onTheme?: (theme: ThemeName, mode: ThemeMode, density: ThemeDensity) => void;
  onSettingsTab?: (tab: SettingsTab) => void;
  onEditorFontSize?: (n: number) => void;
  onBackground?: (bg: string | undefined, blur: number) => void;
  onOpacity?: (n: number) => void;
  onEndfieldAccent?: (accent: EndfieldAccent) => void;
}) {
  const [config, setConfig] = useState<NovelConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<NovelConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settingsTab, setSettingsTabState] = useState<SettingsTab>(() => readLS<SettingsTab>('dsh-novel-forge.settings.tab', 'model', ['model','writing','image','files','appearance'] as const));
  const [imageTestState, setImageTestState] = useState<Record<string, { testing: boolean; ok?: boolean; ms?: number; message?: string; modelFound?: boolean }>>({});
  const [editorFontSize, setEditorFontSize] = useState<number>(() => { try { const v = Number(window.localStorage.getItem('dsh-novel-forge.editor.fontSize')); return v >= 12 && v <= 24 ? v : 14 } catch { return 14 } });
  const [panelTheme, setPanelTheme] = useState<ThemeName>(() => readLS<ThemeName>('dsh-novel-forge.theme', 'liquid', ['liquid','neumorph','macos','clay','endfield'] as const));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readLS<ThemeMode>('dsh-novel-forge.theme.mode', 'system', ['system','light','dark'] as const));
  const [themeDensity, setThemeDensity] = useState<ThemeDensity>(() => readLS<ThemeDensity>('dsh-novel-forge.theme.density', 'comfort', ['comfort','compact','spacious'] as const));
  const [endfieldAccent, setEndfieldAccent] = useState<EndfieldAccent>(() => readLS<EndfieldAccent>('dsh-novel-forge.theme.endfield.accent', 'valley', ['valley','wuling'] as const));

  const loadConfig = async (): Promise<void> => {
    try {
      const res = await api.status();
      setConfig(res.config);
      setConfigDraft(res.config);
    } catch (err) { setError((err as Error).message) }
  };
  useEffect(() => { void loadConfig() }, []);

  useEffect(() => { try { window.localStorage.setItem('dsh-novel-forge.settings.tab', settingsTab) } catch { /* ignore */ } }, [settingsTab]);

  const changeSettingsTab = (next: SettingsTab): void => { setSettingsTabState(next); onSettingsTab?.(next) };

  const save = async (): Promise<void> => {
    if (configDraft === null) return;
    setBusy(true); setError(''); setNotice('');
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
        themeBackground: configDraft.themeBackground ?? '',
        themeBackgroundBlur: configDraft.themeBackgroundBlur ?? 0,
        themeOpacity: configDraft.themeOpacity ?? 100,
        imageModels: configDraft.imageModels ?? [],
        savedModels: configDraft.savedModels ?? [],
      });
      setConfig(result.config);
      setConfigDraft(result.config);
      setNotice(tt('settings.saved'));
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  };

  // 生图模型操作
  const patchImageModel = (id: string, patch: Partial<ImageModelConfig>): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).map(m => m.id === id ? { ...m, ...patch } : m) })
  };
  const addImageModel = (): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: [...(prev.imageModels ?? []), { id: 'img-' + Date.now().toString(36), name: '', baseURL: '', apiKey: '', model: '', enabled: (prev.imageModels ?? []).length === 0 }] })
  };
  const removeImageModel = (id: string): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).filter(m => m.id !== id) })
  };
  const enableImageModel = (id: string): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, imageModels: (prev.imageModels ?? []).map(m => ({ ...m, enabled: m.id === id })) })
  };
  const testImageModel = async (m: ImageModelConfig): Promise<void> => {
    if (m.baseURL.trim() === '' || m.apiKey.trim() === '') { setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: false, message: '请先填写接口地址和 API Key' } })); return }
    setImageTestState(prev => ({ ...prev, [m.id]: { testing: true } }));
    try { const r = await api.imageTest({ baseURL: m.baseURL, apiKey: m.apiKey, model: m.model }); setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: r.ok, ms: r.ms, message: r.message } })) } catch (err) { setImageTestState(prev => ({ ...prev, [m.id]: { testing: false, ok: false, message: (err as Error).message } })) }
  };

  // 主题/密度/字号（写 localStorage，可选通知父级）
  const changeTheme = (theme: ThemeName, mode: ThemeMode, density: ThemeDensity): void => {
    setPanelTheme(theme); setThemeMode(mode); setThemeDensity(density);
    try {
      window.localStorage.setItem('dsh-novel-forge.theme', theme);
      window.localStorage.setItem('dsh-novel-forge.theme.mode', mode);
      window.localStorage.setItem('dsh-novel-forge.theme.density', density);
    } catch { /* ignore */ }
    onTheme?.(theme, mode, density);
  };
  const changeEndfieldAccent = (accent: EndfieldAccent): void => {
    setEndfieldAccent(accent);
    try { window.localStorage.setItem('dsh-novel-forge.theme.endfield.accent', accent) } catch { /* ignore */ }
    onEndfieldAccent?.(accent);
  };
  const changeEditorFont = (n: number): void => {
    const v = Math.min(24, Math.max(12, n)); setEditorFontSize(v);
    try { window.localStorage.setItem('dsh-novel-forge.editor.fontSize', String(v)) } catch { /* ignore */ }
    onEditorFontSize?.(v);
  };
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const applyBackground = (bg: string | undefined): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, themeBackground: bg ?? '' });
    onBackground?.(bg ?? undefined, configDraft?.themeBackgroundBlur ?? 0);
  };
  const applyBlur = (blur: number): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, themeBackgroundBlur: blur });
    onBackground?.(configDraft?.themeBackground ?? undefined, blur);
  };
  const applyOpacity = (n: number): void => {
    setConfigDraft(prev => prev === null ? prev : { ...prev, themeOpacity: n });
    onOpacity?.(n);
  };
  const onBgFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error ?? new Error('读取失败'));
      fr.readAsDataURL(file);
    });
    try {
      // 上传到服务端存盘，返回可访问 URL（不往 settings.yaml 塞大 base64）。
      const res = await api.themeBackgroundUpload(dataUrl);
      applyBackground(res.url);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const resetTheme = (): void => {
    try {
      window.localStorage.removeItem('dsh-novel-forge.theme');
      window.localStorage.removeItem('dsh-novel-forge.theme.mode');
      window.localStorage.removeItem('dsh-novel-forge.theme.density');
      window.localStorage.removeItem('dsh-novel-forge.theme.endfield.accent');
    } catch { /* ignore */ }
    setEndfieldAccent('valley');
    onEndfieldAccent?.('valley');
    changeTheme('liquid', 'system', 'comfort');
  };

  if (configDraft === null) {
    return (
      <div className={css.authorPageBody}><div className={css.meta}>正在加载设置…</div>{error !== '' && <div className={css.noticeError}>{error}</div>}</div>
    );
  }

  return (
    <div className={css.authorPageBody} data-nf-theme={panelTheme} data-nf-mode={themeMode === 'system' ? undefined : themeMode} data-nf-density={themeDensity} data-nf-endfield-accent={endfieldAccent}>
      <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-6)' }}>
        <h2 className={css.panelTitle} style={{ margin: 0 }}>⚙️ 设置</h2>
        <span className={css.meta}>当前模型：{config?.provider} / {config?.model}</span>
        <span className={css.meta}>输出目录：{config?.outputDir}</span>
      </div>

      <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
        {SETTINGS_SECTIONS.map(s => (
          <button key={s.id} type="button" className={css.button + (settingsTab === s.id ? ' ' + css.buttonPrimary : '')} style={{ flex: 1, minWidth: 104, justifyContent: 'center' }} onClick={() => changeSettingsTab(s.id)}>{s.icon} {s.label}</button>
        ))}
      </div>

      {error !== '' && <div className={css.noticeError}>{error}</div>}
      {notice !== '' && <div className={css.meta}>{notice}</div>}

      {settingsTab === 'model' && (
        <>
          <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-24)' }}>
            <span className={css.cardTitle}><Brain size={18} style={{ verticalAlign: -3 }} /> 模型与推理</span>
            <ModelManager
              api={api}
              provider={configDraft.provider}
              model={configDraft.model}
              savedModels={configDraft.savedModels ?? []}
              onProvider={v => setConfigDraft({ ...configDraft, provider: v })}
              onModel={v => setConfigDraft({ ...configDraft, model: v })}
              onSavedModels={models => setConfigDraft({ ...configDraft, savedModels: models })}
            />
          </div>
          <ReasoningSection
            reasoningEffort={configDraft.reasoningEffort ?? 'off'}
            analysisReasoning={configDraft.analysisReasoning ?? 'low'}
            onChange={patch => setConfigDraft({ ...configDraft, ...patch })}
          />
        </>
      )}

      {settingsTab === 'writing' && (
        <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-24)' }}>
          <span className={css.cardTitle}><PenLine size={18} style={{ verticalAlign: -3 }} /> 写作与审稿</span>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.chapterChars')}</label><input className={css.input} type="number" min={1000} max={20000} value={configDraft.chapterChars} onChange={e => setConfigDraft({ ...configDraft, chapterChars: Number(e.target.value) })} /></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.maxTokens')}</label><input className={css.input} type="number" min={2000} max={64000} value={configDraft.maxTokens} onChange={e => setConfigDraft({ ...configDraft, maxTokens: Number(e.target.value) })} /></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.reviewPassScore')}</label><input className={css.input} type="number" min={0} max={100} value={configDraft.reviewPassScore} onChange={e => setConfigDraft({ ...configDraft, reviewPassScore: Number(e.target.value) })} /><span className={css.meta}>通过判定：综合评分 ≥ 此分数（默认 70），或无 high 级问题且评分 ≥ 60；建议设 60-80。</span></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.autoReview')}</label><select className={css.input} value={configDraft.autoReview ? '1' : '0'} onChange={e => setConfigDraft({ ...configDraft, autoReview: e.target.value === '1' })}><option value="1">✓ 是</option><option value="0">✗ 否</option></select></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.autoAuthorReview')}</label><select className={css.input} value={configDraft.autoAuthorReview ? '1' : '0'} onChange={e => setConfigDraft({ ...configDraft, autoAuthorReview: e.target.value === '1' })}><option value="1">✓ 是</option><option value="0">✗ 否</option></select><span className={css.meta}>{tt('settings.autoAuthorReviewHint')}</span></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.autoReviewAfterRevise')}</label><select className={css.input} value={configDraft.autoReviewAfterRevise ? '1' : '0'} onChange={e => setConfigDraft({ ...configDraft, autoReviewAfterRevise: e.target.value === '1' })}><option value="1">✓ 是</option><option value="0">✗ 否</option></select><span className={css.meta}>{tt('settings.autoReviewAfterReviseHint')}</span></div>
          <div className={css.field}><label className={css.fieldLabel}>编辑器字号（正文编辑 / 工作区）</label><select className={css.input} value={editorFontSize} onChange={e => changeEditorFont(Number(e.target.value))}>{[12,13,14,15,16,18,20,22,24].map(v => <option key={v} value={v}>{v}px</option>)}</select></div>
        </div>
      )}

      {settingsTab === 'files' && (
        <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-24)' }}>
          <span className={css.cardTitle}><Folder size={18} style={{ verticalAlign: -3 }} /> 路径与文件</span>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.outlinePath')}</label><input className={css.input} value={configDraft.outlinePath} onChange={e => setConfigDraft({ ...configDraft, outlinePath: e.target.value })} /></div>
          <div className={css.field}><label className={css.fieldLabel}>{tt('settings.outputDir')}</label><input className={css.input} value={configDraft.outputDir} onChange={e => setConfigDraft({ ...configDraft, outputDir: e.target.value })} /></div>
          <div className={css.row}><button type="button" className={css.button} onClick={() => { void api.openFolder() }}>{tt('settings.openFolder')}</button></div>
        </div>
      )}

      {settingsTab === 'appearance' && (
        <>
          <div className={css.card + ' ' + css.settingsCard}>
            <span className={css.cardTitle}><Sparkles size={18} style={{ verticalAlign: -3 }} /> 外观与主题</span>
            <div className={css.field}><label className={css.fieldLabel}>显示模式</label><select className={css.input} value={themeMode} onChange={e => changeTheme(panelTheme, e.target.value as ThemeMode, themeDensity)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
            <div className={css.field}><label className={css.fieldLabel}>主题风格</label><select className={css.input} value={panelTheme} onChange={e => changeTheme(e.target.value as ThemeName, themeMode, themeDensity)}><option value="liquid">液态玻璃 · 清新绿（默认）</option><option value="neumorph">新拟物 · 柔和浅色</option><option value="macos">macOS · 玻璃（蓝，随外观浅/深）</option><option value="clay">粘土拟态 · 柔和黏土</option><option value="endfield">终末地 · 纸墨工业风</option></select></div>
            {panelTheme === 'endfield' && (
              <div className={css.field}><label className={css.fieldLabel}>终末地强调色</label><select className={css.input} value={endfieldAccent} onChange={e => changeEndfieldAccent(e.target.value as EndfieldAccent)}><option value="valley">谷地黄（默认）</option><option value="wuling">武陵青</option></select><span className={css.meta}>参考明日方舟：终末地官网，亮色自动使用深色档保证可读性。</span></div>
            )}
            <div className={css.field}><label className={css.fieldLabel}>界面密度</label><select className={css.input} value={themeDensity} onChange={e => changeTheme(panelTheme, themeMode, e.target.value as ThemeDensity)}><option value="comfort">舒适（默认）</option><option value="compact">紧凑</option><option value="spacious">宽松</option></select></div>
            <div className={css.field}><label className={css.fieldLabel}>玻璃透明度（0-100）</label><input className={css.input} type="range" min={0} max={100} value={configDraft.themeOpacity ?? 100} onChange={e => applyOpacity(Number(e.target.value))} /><span className={css.meta}>100=当前主题原样；调低会让玻璃/卡片变透，新拟态、黏土等实色主题能透出背景图。</span></div>
            <div className={css.row} style={{ justifyContent: 'flex-end' }}><button type="button" className={css.button} onClick={resetTheme}><RotateCcw size={14} style={{ verticalAlign: -2 }} /> 恢复默认主题</button></div>
          </div>

          <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-12)' }}>
            <span className={css.cardTitle}><Image size={18} style={{ verticalAlign: -3 }} /> 自定义背景</span>
            <span className={css.meta}>填图片 URL 或上传图片作为小说工坊背景（首页 + 书内）。留空 = 使用主题默认背景。</span>
            <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
              <input className={css.input} style={{ flex: 1, minWidth: 220 }} placeholder="https://… 图片地址" value={(configDraft.themeBackground ?? '').startsWith('data:') ? '' : (configDraft.themeBackground ?? '')} onChange={e => applyBackground(e.target.value.trim() !== '' ? e.target.value.trim() : undefined)} />
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => bgFileRef.current?.click()}><Upload size={13} style={{ verticalAlign: -2 }} /> 上传图片</button>
              <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => applyBackground(undefined)}><X size={13} style={{ verticalAlign: -2 }} /> 清除</button>
            </div>
            <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { void onBgFile(e.target.files?.[0]); e.target.value = '' }} />
            {(configDraft.themeBackground ?? '') !== '' && (
              <div className={css.adaptInputCard} style={{ padding: 8 }}>
                <div style={{ width: 180, height: 100, borderRadius: 10, backgroundImage: 'url(' + configDraft.themeBackground + ')', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className={css.meta}>已设置背景（预览）</div>
              </div>
            )}
            <div className={css.field}><label className={css.fieldLabel}>遮罩 / 模糊强度（0-80）</label><input className={css.input} type="range" min={0} max={80} value={configDraft.themeBackgroundBlur ?? 0} onChange={e => applyBlur(Number(e.target.value))} /><span className={css.meta}>越大背景越暗，保证文字可读（图很花时调高）。</span></div>
          </div>
        </>
      )}

      <div className={css.row}><button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy} onClick={() => { void save() }}>{busy ? '保存中…' : tt('settings.save')}</button></div>
    </div>
  );
}
