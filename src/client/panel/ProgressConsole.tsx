/**
 * 共享「AI 进度」实时控制台：当前任务大进度条 + 全量活动日志。
 * 书内与首页共用一个表现，内容来自同一份进度状态。
 */
import { useEffect, useRef } from 'react'
import css from './panel.module.css'

export interface ProgressLine {
  id: number;
  text: string;
  kind: 'info' | 'done' | 'error';
  live?: boolean;
  ratio?: number;
}

export function ProgressConsole({ progress, busy, busyLabel, liveBar, onClear }: {
  progress: ProgressLine[];
  busy: boolean;
  busyLabel: string;
  liveBar: { text: string; ratio?: number } | null;
  onClear: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [progress]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>📊 AI 进度</span>
        <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={onClear} title="清空活动记录">清空</button>
      </div>
      {(busy && (busyLabel !== '' || liveBar !== null)) && (
        <div style={{ border: '1px solid var(--nf-accent)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-8) var(--nf-space-12)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', background: 'color-mix(in srgb, var(--nf-accent) 6%, transparent)' }}>
          <span style={{ fontSize: 'var(--nf-fs-12)', fontWeight: 600, color: 'var(--nf-accent)' }}>✍ {busyLabel !== '' ? busyLabel : (liveBar?.text ?? '任务进行中')}…</span>
          {liveBar?.ratio !== undefined && (
            <div className={css.bigProgressBar}><div className={css.bigProgressBarFill} style={{ width: Math.round(liveBar.ratio * 100) + '%' }} /></div>
          )}
          {liveBar?.text !== undefined && <span className={css.liveText}>{liveBar.text}</span>}
        </div>
      )}
      <div className={css.progress} style={{ flex: '0 1 auto', maxHeight: '42%', minHeight: 0, overflowY: 'auto', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', background: 'var(--nf-bg-inset)', padding: 'var(--nf-space-8)', display: 'flex', flexDirection: 'column' }}>
        {progress.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', color: 'var(--nf-text-3)', fontSize: 'var(--nf-fs-12)', padding: 'var(--nf-space-4) 2px' }}>
            <span>📭</span>
            <span>暂无活动记录，生成、审稿等操作会显示在这里</span>
          </div>
        ) : (
          progress.map(line => (
            <div key={line.id} className={line.kind === 'done' ? css.progressLineDone : line.kind === 'error' ? css.progressLineError : line.live === true ? css.progressLineLive : css.progressLine}>
              {line.live === true && (
                <span className={css.progressBar}><span className={css.progressBarFill} style={{ width: Math.round((line.ratio ?? 0) * 100) + '%' }} /></span>
              )}
              {line.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
