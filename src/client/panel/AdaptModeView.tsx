/**
 * 改编模式 · 分步向导（上传全文主线）：
 * ① 导入全文 → ② 设定卡片/可改范围 → ③ 确认改编维度 → ④ 编辑改编方案 → ⑤ 提炼新书资料 → ⑥ 保存并开始写书。
 */
import { useRef, useState } from 'react'
import { FileText, Wand2, Upload, Download, ListChecks, Play, ArrowLeft, ArrowRight, FileDown, Save, Plus, Trash2, BookOpen } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type {
  AdaptAnalyzeResponse,
  AdaptationProposal,
  AdaptationMapping,
  AdaptationRules,
  AdaptExecuteResponse,
  AdaptSaveResponse,
  AdaptMaterializeResponse,
  AdaptMaterializeSaveResponse,
} from '../../protocol.ts'
import { readFileTextSmart } from '../text.ts'
import css from './panel.module.css'

const MUTABILITY_LABEL: Record<string, string> = {
  locked: '🔒 建议保留', big: '🟡 可改影响大', small: '🟢 可改影响小', free: '🟣 可自由改', visual: '📦 仅视觉包装',
};
const MUTABILITY_CLS: Record<string, string> = {
  locked: 'var(--nf-muted)', big: 'var(--nf-warn)', small: 'var(--nf-info)', free: 'var(--nf-accent)', visual: 'var(--nf-muted)',
};
const RISK_LABEL: Record<string, string> = { high: '高风险', medium: '中风险', low: '低风险' };
const SCOPE_LABEL: Record<string, string> = { name: '人名', realm: '境界/体系', faction: '势力/组织', term: '术语', other: '其他' };

const STEPS = [
  { n: 1, label: '导入全文' },
  { n: 2, label: '设定卡片' },
  { n: 3, label: '确认改编维度' },
  { n: 4, label: '编辑改编方案' },
  { n: 5, label: '提炼新书资料' },
  { n: 6, label: '保存并开始写书' },
] as const;

interface EditState { enabled: boolean; target: string }
type RuleKey = keyof AdaptationRules

export function AdaptModeView({ api, onOpenBook }: { api: NovelApi; onOpenBook?: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [text, setText] = useState('');
  const [result, setResult] = useState<AdaptAnalyzeResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [proposal, setProposal] = useState<AdaptationProposal | null>(null);
  const [executed, setExecuted] = useState<AdaptExecuteResponse | null>(null);
  const [saved, setSaved] = useState<AdaptSaveResponse | null>(null);
  const [materialized, setMaterialized] = useState<AdaptMaterializeResponse | null>(null);
  const [savedMaterialized, setSavedMaterialized] = useState<AdaptMaterializeSaveResponse | null>(null);
  const [chapterCount, setChapterCount] = useState(30);
  const [rewriteStart, setRewriteStart] = useState(1);
  const [rewriteEnd, setRewriteEnd] = useState(0);
  const [rewriteProgress, setRewriteProgress] = useState<{ completed: number; total: number; no: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    try { setText(await readFileTextSmart(file)) } catch (err) { setError((err as Error).message) }
    e.target.value = '';
  };

  const analyze = async (): Promise<void> => {
    if (text.trim().length < 200) { setError('请粘贴或上传完整小说全文（至少 200 字符）'); return }
    setBusy(true); setBusyLabel('分析中…'); setError(''); setProposal(null); setExecuted(null); setSaved(null); setMaterialized(null);
    try {
      const res = await api.adaptAnalyze(text);
      setResult(res);
      const next: Record<string, EditState> = {};
      for (const d of res.dimensions) {
        next[d.key] = { enabled: d.mutability !== 'locked', target: d.candidates?.[0] ?? '' };
      }
      setEdits(next);
      setStep(2);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const setEdit = (key: string, patch: Partial<EditState>): void => {
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const selectedDims = result === null ? [] : result.dimensions.filter(d => {
    const e = edits[d.key];
    return e?.enabled === true && (e.target ?? '').trim() !== '';
  });

  const buildSelections = () => selectedDims.map(d => ({ key: d.key, title: d.title, current: d.current, target: (edits[d.key]?.target ?? '').trim(), mutability: d.mutability }));

  const propose = async (): Promise<void> => {
    if (result === null || text.trim().length < 200) { setError('请先分析'); return }
    const selections = buildSelections();
    if (selections.length === 0) { setError('请至少选择一条要改的维度并填写新值'); return }
    setBusy(true); setBusyLabel('生成改编方案…'); setError(''); setExecuted(null); setSaved(null); setMaterialized(null);
    try {
      const res = await api.adaptPropose({ text, selections, dimensions: result.dimensions });
      setProposal(res.proposal);
      setStep(4);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const patchMapping = (idx: number, patch: Partial<AdaptationMapping>): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, mappings: prev.mappings.map((m, i) => i === idx ? { ...m, ...patch } : m) }));
  };
  const addMapping = (): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, mappings: [...prev.mappings, { source: '', target: '', scope: 'other', note: '' }] }));
  };
  const removeMapping = (idx: number): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, mappings: prev.mappings.filter((_, i) => i !== idx) }));
  };
  const patchRule = (key: RuleKey, idx: number, value: string): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, rules: { ...prev.rules, [key]: prev.rules[key].map((s, i) => i === idx ? value : s) } }));
  };
  const addRule = (key: RuleKey): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, rules: { ...prev.rules, [key]: [...prev.rules[key], ''] } }));
  };
  const removeRule = (key: RuleKey, idx: number): void => {
    setProposal(prev => prev === null ? prev : ({ ...prev, rules: { ...prev.rules, [key]: prev.rules[key].filter((_, i) => i !== idx) } }));
  };

  const execute = async (): Promise<void> => {
    if (proposal === null || proposal.mappings.length === 0) { setError('请先生成改编方案'); return }
    setBusy(true); setBusyLabel('执行术语替换…'); setError(''); setSaved(null);
    try {
      const res = await api.adaptExecute({ text, mappings: proposal.mappings, mode: 'replace' });
      setExecuted(res);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const executeRewrite = async (): Promise<void> => {
    if (proposal === null || proposal.mappings.length === 0) { setError('请先生成改编方案'); return }
    setBusy(true); setBusyLabel('深度改写（重写引擎）…'); setError(''); setSaved(null); setExecuted(null); setRewriteProgress(null);
    try {
      await api.adaptRewriteStream({ text, mappings: proposal.mappings, rules: proposal.rules, mode: 'rewrite', startNo: rewriteStart, endNo: rewriteEnd }, (frame) => {
        if (frame.type === 'progress') {
          setRewriteProgress({ completed: frame.completed, total: frame.total, no: frame.no, title: frame.title });
          setBusyLabel('深度改写中：第 ' + frame.completed + '/' + frame.total + ' 章…');
        } else if (frame.type === 'done') {
          setExecuted(frame.result);
          setRewriteProgress(null);
        } else if (frame.type === 'error') {
          setError(frame.message);
          setRewriteProgress(null);
        }
      });
    } catch (err) { setError((err as Error).message); setRewriteProgress(null) } finally { setBusy(false); setBusyLabel('') }
  };

  const saveBook = async (): Promise<void> => {
    if (executed === null) return;
    setBusy(true); setBusyLabel('保存为改编新书…'); setError(''); setSaved(null);
    try {
      const base = result?.bookName !== undefined && result.bookName !== '' ? result.bookName + '·改编版' : '改编版';
      const res = await api.adaptSave({ text: executed.adaptedText, bookName: base, outline: result?.outline });
      setSaved(res);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const materializeBook = async (): Promise<void> => {
    if (proposal === null || proposal.mappings.length === 0) { setError('方案缺少映射条目，请至少保留一条'); return }
    if (result === null || text.trim().length < 200) { setError('请先完成分析'); return }
    setBusy(true); setBusyLabel('提炼新书资料…'); setError(''); setMaterialized(null); setSavedMaterialized(null);
    try {
      const base = result.bookName !== '' ? result.bookName + '·改编版' : '改编版';
      const res = await api.adaptMaterialize({
        text,
        bookName: base,
        outline: result.outline,
        proposal,
        chapterCount,
      });
      setMaterialized(res);
      setStep(6);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const patchMaterial = (patch: Partial<AdaptMaterializeResponse>): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, ...patch }));
  };
  const patchBible = (patch: Partial<AdaptMaterializeResponse['bible']>): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, bible: { ...prev.bible, ...patch } }));
  };
  const patchBibleList = (key: 'worldRules' | 'redLines' | 'style', idx: number, value: string): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, bible: { ...prev.bible, [key]: prev.bible[key].map((s, i) => i === idx ? value : s) } }));
  };
  const addBibleList = (key: 'worldRules' | 'redLines' | 'style'): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, bible: { ...prev.bible, [key]: [...prev.bible[key], ''] } }));
  };
  const removeBibleList = (key: 'worldRules' | 'redLines' | 'style', idx: number): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, bible: { ...prev.bible, [key]: prev.bible[key].filter((_, i) => i !== idx) } }));
  };
  const patchRoleName = (idx: number, value: string): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, roles: prev.roles.map((r, i) => i === idx ? { ...r, name: value } : r) }));
  };
  const patchVolume = (idx: number, patch: Partial<AdaptMaterializeResponse['volumes'][number]>): void => {
    setMaterialized(prev => prev === null ? prev : ({ ...prev, volumes: prev.volumes.map((v, i) => i === idx ? { ...v, ...patch } : v) }));
  };
  const saveMaterialized = async (): Promise<void> => {
    if (materialized === null) return;
    setBusy(true); setBusyLabel('保存新书…'); setError(''); setSavedMaterialized(null);
    try {
      const res = await api.adaptMaterializeSave({
        bookName: materialized.bookName,
        outputDir: materialized.outputDir,
        outline: materialized.outline,
        bible: materialized.bible,
        roles: materialized.roles,
        world: materialized.world,
        volumes: materialized.volumes,
        chapters: materialized.chapters,
      });
      setSavedMaterialized(res);
      setMaterialized(prev => prev === null ? prev : ({ ...prev, book: res.book }));
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const downloadFile = (ext: 'md' | 'txt'): void => {
    if (executed === null) return;
    const blob = new Blob([executed.adaptedText], { type: ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = result?.bookName !== undefined && result.bookName !== '' ? result.bookName + '·改编版' : '改编版';
    a.download = base + '.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canGo = (n: number): boolean => {
    if (n === 1) return true;
    if (n === 2 || n === 3) return result !== null;
    if (n === 4) return selectedDims.length > 0;
    if (n === 5) return proposal !== null && proposal.mappings.length > 0;
    if (n === 6) return materialized !== null;
    return false;
  };

  return (
    <div className={css.authorPageBody}>
      <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-10)' }}>
        <h2 className={css.panelTitle} style={{ margin: 0 }}>🎬 改编模式</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STEPS.map(s => (
            <button key={s.n} type="button"
              className={css.button + ' ' + css.buttonSmall + (step === s.n ? ' ' + css.buttonPrimary : '')}
              disabled={!canGo(s.n)}
              onClick={() => setStep(s.n)}
              title={canGo(s.n) ? '第 ' + s.n + ' 步：' + s.label : '需先完成前置步骤'}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {error !== '' && <div className={css.noticeError}>{error}</div>}

      {step === 1 && (
        <div className={css.adaptInputCard}>
          <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
            <span className={css.meta}>① 粘贴全文，或上传 txt/md 文件</span>
            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => fileRef.current?.click()}><Upload size={13} style={{ verticalAlign: -2 }} /> 上传文件</button>
          </div>
          <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" style={{ display: 'none' }} onChange={e => { void onFile(e) }} />
          <textarea className={css.input + ' ' + css.adaptTextarea} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴小说全文（含章节标题/分卷更好）…" />
          <div className={css.rowEnd}><span className={css.meta}>已输入 {text.length} 字</span><button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void analyze() }} disabled={busy}><Wand2 size={14} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '分析中…' ? '分析中…' : '开始分析'}</button></div>
        </div>
      )}

      {step === 2 && result !== null && (
        <div className={css.adaptResult}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>② 《{result.bookName}》 · {result.chapters} 章</h3>
            <span className={css.meta}>{result.note}</span>
          </div>
          {result.outline !== undefined && result.outline !== '' && (
            <details className={css.adaptOutline}><summary>反推大纲（点击展开）</summary><pre className={css.adaptOutlinePre}>{result.outline}</pre></details>
          )}
          <div className={css.adaptMatrix}>
            {result.dimensions.map((d, i) => (
              <div key={d.key + '-' + i} className={css.dimCard}>
                <div className={css.dimCardHead}>
                  <span className={css.dimTitle}>{d.title}</span>
                  <span className={css.badge} style={{ color: MUTABILITY_CLS[d.mutability] ?? 'var(--nf-muted)' }}>{MUTABILITY_LABEL[d.mutability] ?? d.mutability}</span>
                  <span className={css.meta}>风险：{RISK_LABEL[d.risk] ?? d.risk}</span>
                </div>
                <div className={css.dimCurrent}><b>当前值</b>：{d.current}</div>
                {(d.evidence !== undefined && d.evidence !== '') && <div className={css.meta}>证据：{d.evidence}</div>}
                {(d.candidates ?? []).length > 0 && <div className={css.meta}>候选：{(d.candidates ?? []).join(' / ')}</div>}
                <div className={css.meta}>影响：{d.impact}</div>
              </div>
            ))}
          </div>
          <div className={css.rowEnd} style={{ justifyContent: 'flex-end' }}>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => setStep(3)}><ArrowRight size={14} style={{ verticalAlign: -2 }} /> 下一步：③ 确认改编维度</button>
          </div>
        </div>
      )}

      {step === 3 && result !== null && (
        <div className={css.adaptResult}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <b>③ 确认改编维度（勾选要改 + 填新值）</b>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void propose() }} disabled={busy}><ListChecks size={13} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '生成改编方案…' ? '生成中…' : '生成改编方案'} ({selectedDims.length})</button>
          </div>
          <div className={css.adaptMatrix}>
            {result.dimensions.map((d, i) => {
              const e = edits[d.key];
              const enabled = e?.enabled === true;
              const target = e?.target ?? '';
              return (
                <div key={d.key + '-' + i} className={css.dimCard + (enabled ? ' ' + css.dimCardSelected : '')}>
                  <div className={css.dimCardHead}>
                    <span className={css.dimTitle}>{d.title}</span>
                    <span className={css.badge} style={{ color: MUTABILITY_CLS[d.mutability] ?? 'var(--nf-muted)' }}>{MUTABILITY_LABEL[d.mutability] ?? d.mutability}</span>
                    <span className={css.meta}>风险：{RISK_LABEL[d.risk] ?? d.risk}</span>
                  </div>
                  <div className={css.dimCurrent}><b>当前值</b>：{d.current}</div>
                  {d.mutability !== 'locked' && (
                    <div className={css.dimEdit}>
                      <input type="checkbox" checked={enabled} onChange={e2 => setEdit(d.key, { enabled: e2.target.checked })} />
                      <input className={css.input} value={target} disabled={!enabled} placeholder="改为什么？" onChange={e2 => setEdit(d.key, { target: e2.target.value })} />
                    </div>
                  )}
                  {(d.candidates ?? []).length > 0 && <div className={css.meta}>候选：{(d.candidates ?? []).join(' / ')}</div>}
                  <div className={css.meta}>影响：{d.impact}</div>
                </div>
              );
            })}
          </div>
          <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
            <button type="button" className={css.button} onClick={() => setStep(2)}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> 上一步</button>
          </div>
        </div>
      )}

      {step === 4 && proposal !== null && (
        <div className={css.adaptProposal}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <b>④ 编辑改编方案（映射/规则可增删改）</b>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => setStep(5)}><ArrowRight size={14} style={{ verticalAlign: -2 }} /> 下一步：⑤ 提炼新书资料</button>
          </div>

          <h4 style={{ margin: '10px 0 4px' }}>映射表</h4>
          <div className={css.adaptTableScroll}>
            <table className={css.adaptTable}><thead><tr><th>原值</th><th>新值</th><th>范围</th><th>说明</th><th></th></tr></thead><tbody>
              {proposal.mappings.map((m, idx) => (
                <tr key={idx}>
                  <td><input className={css.input + ' ' + css.adaptCell} value={m.source} placeholder="原值" onChange={e => patchMapping(idx, { source: e.target.value })} /></td>
                  <td><input className={css.input + ' ' + css.adaptCell} value={m.target} placeholder="新值" onChange={e => patchMapping(idx, { target: e.target.value })} /></td>
                  <td>
                    <select className={css.input + ' ' + css.adaptCell} value={m.scope} onChange={e => patchMapping(idx, { scope: e.target.value as AdaptationMapping['scope'] })}>
                      {Object.keys(SCOPE_LABEL).map(s => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td><input className={css.input + ' ' + css.adaptCell} value={m.note ?? ''} placeholder="说明" onChange={e => patchMapping(idx, { note: e.target.value })} /></td>
                  <td><button type="button" className={css.iconBtn} onClick={() => removeMapping(idx)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <div className={css.rowEnd}>
            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={addMapping}><Plus size={13} style={{ verticalAlign: -2 }} /> 加一条映射</button>
          </div>

          <h4 style={{ margin: '10px 0 4px' }}>改编规则</h4>
          <div className={css.adaptRules}>
            {(['preserve', 'change', 'constraints'] as RuleKey[]).map(key => (
              <div key={key} className={css.adaptRule}>
                <b>{key === 'preserve' ? '📌 保留' : key === 'change' ? '✏️ 允许变' : '🚫 红线'}</b>
                {proposal.rules[key].map((s, idx) => (
                  <div key={idx} className={css.adaptRuleRow}>
                    <input className={css.input} value={s} onChange={e => patchRule(key, idx, e.target.value)} />
                    <button type="button" className={css.iconBtn} onClick={() => removeRule(key, idx)}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => addRule(key)}><Plus size={12} style={{ verticalAlign: -2 }} /> 加一条</button>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '10px 0 4px' }}>联动影响</h4>
          <div className={css.adaptImpacts}>
            {proposal.impacts.map((im, i3) => (<div key={i3} className={css.adaptImpact}><b style={{ color: im.risk === 'high' ? 'var(--nf-error)' : im.risk === 'medium' ? 'var(--nf-warn)' : 'var(--nf-info)' }}>[{RISK_LABEL[im.risk] ?? im.risk}]</b> {im.item}：{im.detail}{im.chapters !== undefined && im.chapters.length > 0 ? '（章：' + im.chapters.join(',') + '）' : ''}</div>))}
          </div>

          <details className={css.adaptOutline}>
            <summary>快速路径：仅术语替换 / 深度改写（重写引擎）（可选）</summary>
            <div className={css.rowEnd} style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={css.button} onClick={() => { void execute() }} disabled={busy}><Play size={13} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '执行术语替换…' ? '执行中…' : '执行术语替换'}</button>
              <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void executeRewrite() }} disabled={busy}><Wand2 size={13} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '深度改写（重写引擎）…' ? '改写中…' : '深度改写（重写引擎）'}</button>
              <span className={css.meta}>起始</span>
              <input type="number" className={css.input + ' ' + css.adaptCell} style={{ width: 64 }} value={rewriteStart} onChange={e => setRewriteStart(Math.max(1, Math.min(Number(e.target.value) || 1, 5000)))} />
              <span className={css.meta}>至</span>
              <input type="number" className={css.input + ' ' + css.adaptCell} style={{ width: 64 }} value={rewriteEnd} onChange={e => setRewriteEnd(Math.max(0, Math.min(Number(e.target.value) || 0, 5000)))} />
              <span className={css.meta}>章（0=到末尾）</span>
            </div>
            {rewriteProgress !== null && (
              <div className={css.meta}>⏳ 改写中：第 {rewriteProgress.completed}/{rewriteProgress.total} 章（当前：第 {rewriteProgress.no} 章《{rewriteProgress.title}》）</div>
            )}
            {executed !== null && (
              <>
                <div className={css.meta}>
                  {executed.mode === 'rewrite'
                    ? '重写完成：' + (executed.rewritten ?? []).length + ' 章；保留原章：' + ((executed.skipped ?? []).join('、') || '无')
                    : '命中：' + (executed.hits.filter(h => h.count > 0).map(h => h.source + '→' + h.target + '×' + h.count).join('，') || '无命中')}
                </div>
                <div className={css.rowEnd} style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => downloadFile('md')}><FileDown size={13} style={{ verticalAlign: -2 }} /> 下载 .md</button>
                  <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => downloadFile('txt')}><Download size={13} style={{ verticalAlign: -2 }} /> 下载 .txt</button>
                  {executed.mode === 'rewrite' ? (
                    <>
                      <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setText(executed.adaptedText); setExecuted(null); setSaved(null); setStep(5); }}><Wand2 size={13} style={{ verticalAlign: -2 }} /> 用改写结果继续提炼新书</button>
                      <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void saveBook() }} disabled={busy}><Save size={13} style={{ verticalAlign: -2 }} /> 保存为新书（改写全文）</button>
                    </>
                  ) : (
                    <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void saveBook() }} disabled={busy}><Save size={13} style={{ verticalAlign: -2 }} /> 保存为新书（全文替换）</button>
                  )}
                </div>
                <details className={css.adaptOutline}><summary>{executed.mode === 'rewrite' ? '改写后正文预览' : '替换后正文预览'}（点击展开）</summary><pre className={css.adaptOutlinePre}>{executed.adaptedText.slice(0, 8000)}</pre></details>
              </>
            )}
            {saved !== null && (
              <div className={css.noticeSuccess}>
                ✅ 已保存为新书《{saved.bookName}》（{saved.chapters} 章）。原书未改动。
                {onOpenBook !== undefined && <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => onOpenBook(saved.book.id)}>打开新书</button>}
              </div>
            )}
            <span className={css.meta}>提示：「深度改写」逐章 LLM 重写（耗额度，适合结构性改编）；「仅替换」更快但只换词。若想生成「待写新书」，请在上方继续「⑤ 提炼新书资料」；点「用改写结果继续提炼新书」则让提炼基于改写后正文。</span>
          </details>

          <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
            <button type="button" className={css.button} onClick={() => setStep(3)}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> 上一步</button>
          </div>
        </div>
      )}

      {step === 5 && proposal !== null && result !== null && (
        <div className={css.adaptProposal}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <b>⑤ 提炼新书资料（预览，暂不保存）</b>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void materializeBook() }} disabled={busy}><Wand2 size={14} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '提炼新书资料…' ? '提炼中…' : '提炼新书资料（预览）'}</button>
          </div>
          <span className={css.meta}>将基于编辑后的映射/规则，从源文提炼：改编后总纲、设定圣经（道藏）、角色库、大世界、卷计划、章节计划。生成后到第⑥步可微调，确认后再保存为《{result.bookName}·改编版》的待写新书（章节为 pending，随后可在小说工坊逐章生成）。</span>
          <div className={css.rowEnd} style={{ gap: 8 }}>
            <span className={css.meta}>拟规划章节数</span>
            <input type="number" className={css.input + ' ' + css.adaptCell} style={{ width: 90 }} value={chapterCount}
              onChange={e => setChapterCount(Math.max(1, Math.min(Number(e.target.value) || 30, 500)))} />
          </div>
          <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
            <button type="button" className={css.button} onClick={() => setStep(4)}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> 上一步</button>
          </div>
        </div>
      )}

      {step === 6 && materialized !== null && (
        <div className={css.adaptProposal}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <b>⑥ 预览与微调（保存为新书）</b>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void saveMaterialized() }} disabled={busy || savedMaterialized !== null}><Save size={14} style={{ verticalAlign: -2 }} /> {busy ? '保存中…' : '保存为新书'}</button>
          </div>
          {savedMaterialized !== null && (
            <div className={css.noticeSuccess}>
              ✅ 已保存为新书《{savedMaterialized.bookName}》（{savedMaterialized.chapters} 章待写）。原书未改动。
              {onOpenBook !== undefined && <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => onOpenBook(savedMaterialized.book.id)}><BookOpen size={14} style={{ verticalAlign: -2 }} /> 打开新书开始编写</button>}
            </div>
          )}
          <span className={css.meta}>可微调以下资料后再保存：总纲、道藏、角色名、卷计划。保存后即为「待写新书」，可到小说工坊逐章生成。</span>

          <h4 style={{ margin: '10px 0 4px' }}>改编后总纲</h4>
          <textarea className={css.input + ' ' + css.adaptTextarea} value={materialized.outline} onChange={e => patchMaterial({ outline: e.target.value })} />

          <h4 style={{ margin: '10px 0 4px' }}>设定圣经（道藏）</h4>
          <div className={css.adaptRules}>
            {(['worldRules', 'redLines', 'style'] as const).map(key => (
              <div key={key} className={css.adaptRule}>
                <b>{key === 'worldRules' ? '🌍 世界观规则' : key === 'redLines' ? '🚫 红线' : '✒️ 风格'}</b>
                {materialized.bible[key].map((s, i) => (
                  <div key={i} className={css.adaptRuleRow}>
                    <input className={css.input} value={s} onChange={e => patchBibleList(key, i, e.target.value)} />
                    <button type="button" className={css.iconBtn} onClick={() => removeBibleList(key, i)}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => addBibleList(key)}><Plus size={12} style={{ verticalAlign: -2 }} /> 加一条</button>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '10px 0 4px' }}>角色库（可改名）</h4>
          <div className={css.adaptRules}>
            {materialized.roles.map((r, i) => (
              <div key={i} className={css.adaptRuleRow}>
                <input className={css.input} value={r.name} onChange={e => patchRoleName(i, e.target.value)} />
                <span className={css.meta}>{r.identity.slice(0, 40)}</span>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '10px 0 4px' }}>卷计划</h4>
          {materialized.volumes.map((v, i) => (
            <div key={i} className={css.adaptRuleRow}>
              <input className={css.input} value={v.title} onChange={e => patchVolume(i, { title: e.target.value })} style={{ width: '40%' }} />
              <input className={css.input} value={v.summary} onChange={e => patchVolume(i, { summary: e.target.value })} />
            </div>
          ))}

          <h4 style={{ margin: '10px 0 4px' }}>章节计划（只读；可回第⑤步改章节数重新提炼）</h4>
          <div className={css.meta}>{materialized.chapters.map(c => '第' + c.no + '章 ' + c.title).join('、') || '—'}</div>

          <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
            <button type="button" className={css.button} onClick={() => setStep(5)}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> 上一步</button>
          </div>
        </div>
      )}
    </div>
  );
}
