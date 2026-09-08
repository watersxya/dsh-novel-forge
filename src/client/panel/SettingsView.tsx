/**
 * 共享设置页（作者首页「设置」与书内「设置」同入口）。
 * 自给自足：挂载时通过 api.status() 拉取全局配置，支持 model/writing/image/files/appearance 五组，
 * 保存走 api.patchConfig。不与某个书绑定，因此新装用户无书也能用。
 */
import { useEffect, useRef, useState } from 'react'
import { Brain, Folder, Sparkles, RotateCcw, Upload, X, Image } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { MoveOutputDirResponse, NovelConfig } from '../../protocol.ts'
import { tt } from './helpers.ts'
import { ModelManager } from './ModelManager.tsx'
import { ReasoningSection } from './ReasoningSection.tsx'
import { SubPage } from './SubPage.tsx'
import css from './panel.module.css'


const SETTINGS_SECTIONS: Array<{ id: 'model' | 'files' | 'appearance'; label: string; icon: JSX.Element }> = [
  { id: 'model', label: '模型', icon: <Brain size={16} /> },
  { id: 'files', label: '路径与文件', icon: <Folder size={16} /> },
  { id: 'appearance', label: '外观与主题', icon: <Sparkles size={16} /> },
];

type SettingsTab = 'model' | 'files' | 'appearance'
type ThemeMode = 'system' | 'light' | 'dark'
type ThemeDensity = 'comfort' | 'compact' | 'spacious'

function readLS<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = window.localStorage.getItem(key) as T | null
    return v !== null && (allowed as readonly string[]).includes(v) ? v : fallback
  } catch { return fallback }
}

export function SettingsView({ api, variant = 'page', onSettingsTab, onEditorFontSize, onBackground, themeMode, themeDensity, onChangeThemeMode, onChangeThemeDensity }: {
  api: NovelApi;
  /** page = 全屏 SubPage（保留给旧入口）；drawer = 右滑抽屉内容（无壳）。 */
  variant?: 'page' | 'drawer';
  onSettingsTab?: (tab: SettingsTab) => void;
  onEditorFontSize?: (n: number) => void;
  onBackground?: (bg: string | undefined, blur: number) => void;
  /** 全局显示模式（联动整个面板，NovelPanel 落 localStorage）。 */
  themeMode: 'system' | 'light' | 'dark';
  /** 全局界面密度。 */
  themeDensity: 'comfort' | 'compact' | 'spacious';
  /** 改变全局显示模式。 */
  onChangeThemeMode: (m: 'system' | 'light' | 'dark') => void;
  /** 改变全局界面密度。 */
  onChangeThemeDensity: (d: 'comfort' | 'compact' | 'spacious') => void;
}) {
  const [config, setConfig] = useState<NovelConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<NovelConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // —— 输出目录迁移弹窗 ——
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [movePreview, setMovePreview] = useState<MoveOutputDirResponse | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [settingsTab, setSettingsTabState] = useState<SettingsTab>(() => readLS<SettingsTab>('dsh-novel-forge.settings.tab', 'model', ['model','files','appearance'] as const));
  const [editorFontSize, setEditorFontSize] = useState<number>(() => { try { const v = Number(window.localStorage.getItem('dsh-novel-forge.editor.fontSize')); return v >= 12 && v <= 24 ? v : 14 } catch { return 14 } });
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

  /** 打开输出目录迁移弹窗：先 dryRun 预览当前目录内容。 */
  const openMoveDialog = async (): Promise<void> => {
    setMoveOpen(true); setMoveTarget(''); setMovePreview(null); setMoveError('');
    try { setMovePreview(await api.moveOutputDir(undefined, true)) } catch (err) { setMoveError((err as Error).message) }
  };

  /** 确认迁移：搬迁文件 → 服务端联动书架/默认目录 → 刷新配置。 */
  const confirmMove = async (): Promise<void> => {
    const to = moveTarget.trim();
    if (to === '') { setMoveError('请填写新目录的完整路径'); return }
    setMoveBusy(true); setMoveError('');
    try {
      const r = await api.moveOutputDir(to);
      setMoveOpen(false);
      setNotice(`目录迁移完成：${r.files.length} 个条目 → ${r.to}${r.movedBooks > 0 ? `（书架联动重指向 ${r.movedBooks} 本）` : ''}`);
      await loadConfig();
    } catch (err) { setMoveError((err as Error).message) } finally { setMoveBusy(false) }
  };

  const formatBytes = (n: number): string => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

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
        themeBackground: configDraft.themeBackground ?? '',
        themeBackgroundBlur: configDraft.themeBackgroundBlur ?? 0,
        savedModels: configDraft.savedModels ?? [],
      });
      setConfig(result.config);
      setConfigDraft(result.config);
      setNotice(tt('settings.saved'));
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  };

  // 显示模式/密度由全局（NovelPanel）统一管理，设置页只调用 onChange 回调。
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
    onChangeThemeMode('system');
    onChangeThemeDensity('comfort');
  };

  if (configDraft === null) {
    if (variant === 'drawer') {
      return <div style={{ padding: 'var(--nf-space-16)' }}><div className={css.meta}>正在加载设置…</div>{error !== '' && <div className={css.noticeError}>{error}</div>}</div>
    }
    return (
      <SubPage title="设置" meta="正在加载…">
        <div className={css.meta}>正在加载设置…</div>
        {error !== '' && <div className={css.noticeError}>{error}</div>}
      </SubPage>
    );
  }

  const content = (
    <>
      <div className={css.shelfToolbar} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
        {SETTINGS_SECTIONS.map(s => (
          <button key={s.id} type="button" className={css.button + (settingsTab === s.id ? ' ' + css.buttonPrimary : '')} style={{ flex: 1, minWidth: 104, justifyContent: 'center' }} onClick={() => changeSettingsTab(s.id)}>{s.icon} {s.label}</button>
        ))}
        {variant === 'drawer' && (
          <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy} onClick={() => { void save() }}>{busy ? '保存中…' : tt('settings.save')}</button>
        )}
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

      {settingsTab === 'files' && (
        <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-24)' }}>
          <span className={css.cardTitle}><Folder size={18} style={{ verticalAlign: -3 }} /> 路径与文件</span>
          <div className={css.field}>
            <label className={css.fieldLabel}>{tt('settings.outputDir')}</label>
            <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap' }}>
              <input className={css.input} style={{ flex: 1, minWidth: 220 }} value={configDraft.outputDir} onChange={e => setConfigDraft({ ...configDraft, outputDir: e.target.value })} />
              <button type="button" className={css.button} onClick={() => { void openMoveDialog() }} title="把当前输出目录的全部文件搬到新位置，书架与配置自动联动">更改位置…</button>
            </div>
            <span className={css.meta}>含章节、项目状态、助手历史等；「更改位置」会整目录搬迁并联动书架，直接改路径仅更新默认值。</span>
          </div>
          <div className={css.row}><button type="button" className={css.button} onClick={() => { void api.openFolder() }}>{tt('settings.openFolder')}</button></div>
        </div>
      )}

      {settingsTab === 'appearance' && (
        <>
          <div className={css.card + ' ' + css.settingsCard}>
            <span className={css.cardTitle}><Sparkles size={18} style={{ verticalAlign: -3 }} /> 外观与主题</span>
            <div className={css.field}><label className={css.fieldLabel}>显示模式</label><select className={css.input} value={themeMode} onChange={e => onChangeThemeMode(e.target.value as ThemeMode)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
            <div className={css.field}><label className={css.fieldLabel}>主题风格</label><span className={css.input} style={{ display: 'inline-flex', alignItems: 'center' }}>墨纸 · 暖编辑案头</span><span className={css.meta}>统一墨纸风格，无需再选皮肤；切换明暗即达纸白/墨色。</span></div>
            <div className={css.field}><label className={css.fieldLabel}>界面密度</label><select className={css.input} value={themeDensity} onChange={e => onChangeThemeDensity(e.target.value as ThemeDensity)}><option value="comfort">舒适（默认）</option><option value="compact">紧凑</option><option value="spacious">宽松</option></select></div>
            <div className={css.field}><label className={css.fieldLabel}>编辑器字号（正文编辑 / 工作区）</label><select className={css.input} value={editorFontSize} onChange={e => changeEditorFont(Number(e.target.value))}>{[12,13,14,15,16,18,20,22,24].map(v => <option key={v} value={v}>{v}px</option>)}</select></div>
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

      {moveOpen && (
        <div className={css.importModalOverlay} role="dialog" aria-modal="true" aria-label="更改输出目录" onClick={e => { if (e.target === e.currentTarget && !moveBusy) setMoveOpen(false) }}>
          <div className={css.importModal}>
            <div className={css.importModalHead}>
              <span className={css.cardTitle}>更改输出目录</span>
              <button type="button" className={css.buttonSmall + ' ' + css.button} disabled={moveBusy} onClick={() => { setMoveOpen(false) }}><X size={14} /></button>
            </div>
            <div className={css.importModalBody}>
              <div className={css.field}>
                <label className={css.fieldLabel}>当前目录</label>
                <span className={css.meta}>{movePreview?.from ?? configDraft.outputDir}</span>
              </div>
              {movePreview !== null && (
                <div className={css.field}>
                  <label className={css.fieldLabel}>将被搬走的内容</label>
                  <span className={css.meta}>{movePreview.files.length} 个条目 · 约 {formatBytes(movePreview.bytes)}{movePreview.files.length > 0 ? `（如 ${movePreview.files.slice(0, 3).join('、')}${movePreview.files.length > 3 ? ' …' : ''}）` : '（空目录）'}</span>
                </div>
              )}
              <div className={css.field}>
                <label className={css.fieldLabel}>新目录（绝对路径）</label>
                <input className={css.input} placeholder="例如 D:\\Novels\\我的书" value={moveTarget} onChange={e => setMoveTarget(e.target.value)} disabled={moveBusy} autoFocus />
                <span className={css.meta}>目标必须为空或不存在；文件搬迁后书架与默认配置自动联动，成功后才删除旧目录，中途失败数据无损。</span>
              </div>
              {moveError !== '' && <span className={css.meta} style={{ color: 'var(--nf-danger, #e5484d)' }}>{moveError}</span>}
            </div>
            <div className={css.importModalActions}>
              <button type="button" className={css.button} disabled={moveBusy} onClick={() => { setMoveOpen(false) }}>取消</button>
              <button type="button" className={css.button} disabled={moveBusy || moveTarget.trim() === ''} onClick={() => { void confirmMove() }}>{moveBusy ? '搬迁中…' : '确认搬迁'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (variant === 'drawer') {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-12)', padding: 'var(--nf-space-16)' }}>{content}</div>;
  }
  return (
    <SubPage
      title="设置"
      meta={`当前模型：${config?.provider} / ${config?.model} · 输出目录：${config?.outputDir}`}
      actions={(
        <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy} onClick={() => { void save() }}>{busy ? '保存中…' : tt('settings.save')}</button>
      )}
    >
      {content}
    </SubPage>
  );
}
