/**
 * 改编模式：P0 分析 → P1 改编方案（勾选/填新值→映射表/规则/影响） → P2 术语替换执行。
 */
import { useRef, useState } from 'react'
import { FileText, Wand2, Upload, Download, ListChecks, Play } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { AdaptAnalyzeResponse, AdaptationProposal, AdaptExecuteResponse } from '../../protocol.ts'
import { readFileTextSmart } from '../text.ts'
import css from './panel.module.css'

const MUTABILITY_LABEL: Record<string, string> = {
  locked: '🔒 建议保留', big: '🟡 可改影响大', small: '🟢 可改影响小', free: '🟣 可自由改', visual: '📦 仅视觉包装',
};
const MUTABILITY_CLS: Record<string, string> = {
  locked: 'var(--nf-muted)', big: 'var(--nf-warn)', small: 'var(--nf-info)', free: 'var(--nf-accent)', visual: 'var(--nf-muted)',
};
const RISK_LABEL: Record<string, string> = { high: '高风险', medium: '中风险', low: '低风险' };

interface EditState { enabled: boolean; target: string }

export function AdaptModeView({ api }: { api: NovelApi }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AdaptAnalyzeResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [proposal, setProposal] = useState<AdaptationProposal | null>(null);
  const [executed, setExecuted] = useState<AdaptExecuteResponse | null>(null);
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
    setBusy(true); setBusyLabel('分析中…'); setError(''); setProposal(null); setExecuted(null);
    try {
      const res = await api.adaptAnalyze(text);
      setResult(res);
      const next: Record<string, EditState> = {};
      for (const d of res.dimensions) {
        next[d.key] = { enabled: d.mutability !== 'locked', target: d.candidates?.[0] ?? '' };
      }
      setEdits(next);
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
    setBusy(true); setBusyLabel('生成改编方案…'); setError(''); setExecuted(null);
    try {
      const res = await api.adaptPropose({ text, selections, dimensions: result.dimensions });
      setProposal(res.proposal);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const execute = async (): Promise<void> => {
    if (proposal === null || proposal.mappings.length === 0) { setError('请先生成改编方案'); return }
    setBusy(true); setBusyLabel('执行术语替换…'); setError('');
    try {
      const res = await api.adaptExecute({ text, mappings: proposal.mappings, mode: 'replace' });
      setExecuted(res);
    } catch (err) { setError((err as Error).message) } finally { setBusy(false); setBusyLabel('') }
  };

  const downloadAdapted = (): void => {
    if (executed === null) return;
    const blob = new Blob([executed.adaptedText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = result?.bookName !== undefined && result.bookName !== '' ? result.bookName + '·改编版.md' : '改编版.md';
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={css.authorPageBody}>
      <div className={css.card + ' ' + css.settingsCard} style={{ gap: 'var(--nf-space-6)' }}>
        <h2 className={css.panelTitle} style={{ margin: 0 }}>🎬 改编模式</h2>
        <span className={css.meta}>上传全文 → 分析可改范围 → 勾选/填新值 → 生成映射表 → 术语替换执行。</span>
      </div>

      <div className={css.adaptInputCard}>
        <div className={css.rowEnd} style={{ justifyContent: 'space-between' }}>
          <span className={css.meta}>粘贴全文，或上传 txt/md 文件</span>
          <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => fileRef.current?.click()}><Upload size={13} style={{ verticalAlign: -2 }} /> 上传文件</button>
        </div>
        <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" style={{ display: 'none' }} onChange={e => { void onFile(e) }} />
        <textarea className={css.input + ' ' + css.adaptTextarea} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴小说全文（含章节标题/分卷更好）…" />
        <div className={css.rowEnd}><span className={css.meta}>已输入 {text.length} 字</span><button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void analyze() }} disabled={busy}><Wand2 size={14} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '分析中…' ? '分析中…' : '开始分析'}</button></div>
      </div>

      {error !== '' && <div className={css.noticeError}>{error}</div>}

      {result === null ? (
        <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
          <span className={css.shelfEmptyIcon}><FileText size={30} /></span>
          <span className={css.shelfEmptyTitle}>等待分析</span>
          <span className={css.meta}>分析会读取全文并提炼「原文设定卡片」与「可改范围矩阵」。</span>
        </div>
      ) : (
        <div className={css.adaptResult}>
          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>《{result.bookName}》 · {result.chapters} 章</h3>
            <span className={css.meta}>{result.note}</span>
          </div>

          {result.outline !== undefined && result.outline !== '' && (
            <details className={css.adaptOutline}><summary>反推大纲（点击展开）</summary><pre className={css.adaptOutlinePre}>{result.outline}</pre></details>
          )}

          <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
            <b>可改范围矩阵（勾选要改 + 填新值）</b>
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
                      {(d.candidates ?? []).length > 0 && <span className={css.meta}>候选：{(d.candidates ?? []).join(' / ')}</span>}
                    </div>
                  )}
                  {(d.evidence !== undefined && d.evidence !== '') && <div className={css.meta}>证据：{d.evidence}</div>}
                  <div className={css.meta}>影响：{d.impact}</div>
                </div>
              );
            })}
          </div>

          {proposal !== null && (
            <div className={css.adaptProposal}>
              <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
                <b>改编方案</b>
                <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={() => { void execute() }} disabled={busy}><Play size={13} style={{ verticalAlign: -2 }} /> {busy && busyLabel === '执行术语替换…' ? '执行中…' : '执行改编（术语替换）'}</button>
              </div>

              <h4 style={{ margin: '10px 0 4px' }}>映射表</h4>
              <table className={css.adaptTable}><thead><tr><th>原值</th><th>新值</th><th>范围</th></tr></thead><tbody>
                {proposal.mappings.map((m, i2) => (<tr key={i2}><td>{m.source}</td><td>{m.target}</td><td>{m.scope}</td></tr>))}
              </tbody></table>

              <h4 style={{ margin: '10px 0 4px' }}>改编规则</h4>
              <div className={css.meta}><b>保留：</b>{proposal.rules.preserve.join('；') || '—'}</div>
              <div className={css.meta}><b>允许变：</b>{proposal.rules.change.join('；') || '—'}</div>
              <div className={css.meta}><b>红线：</b>{proposal.rules.constraints.join('；') || '—'}</div>

              <h4 style={{ margin: '10px 0 4px' }}>联动影响</h4>
              <div className={css.adaptImpacts}>
                {proposal.impacts.map((im, i3) => (<div key={i3} className={css.adaptImpact}><b style={{ color: im.risk === 'high' ? 'var(--nf-error)' : im.risk === 'medium' ? 'var(--nf-warn)' : 'var(--nf-info)' }}>[{RISK_LABEL[im.risk] ?? im.risk}]</b> {im.item}：{im.detail}{im.chapters !== undefined && im.chapters.length > 0 ? `（章：${im.chapters.join(',')}）` : ''}</div>))}
              </div>
            </div>
          )}

          {executed !== null && (
            <div className={css.adaptProposal}>
              <div className={css.authorPageHeader} style={{ alignItems: 'center' }}>
                <b>改编结果（术语替换）</b>
                <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={downloadAdapted}><Download size={13} style={{ verticalAlign: -2 }} /> 下载改编版</button>
              </div>
              <div className={css.meta}>命中：{executed.hits.filter(h => h.count > 0).map(h => h.source + '→' + h.target + '×' + h.count).join('，') || '无命中'}</div>
              <details className={css.adaptOutline}><summary>改编正文预览（点击展开）</summary><pre className={css.adaptOutlinePre}>{executed.adaptedText.slice(0, 8000)}</pre></details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
