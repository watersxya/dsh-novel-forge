/**
 * 润色 / 修订工作区（全页受控组件）。
 *
 * 从 NovelPanel.tsx 抽出（2026-10 重构第二步）：它是一整页编辑器，原先直接嵌在
 * 5600 行主组件的 return 里，任何一处改动都要翻过上百行 JSX。这里只做**受控渲染**：
 * 状态与请求逻辑仍留在面板（它要驱动全局 busy / 进度台 / 刷新），视图只负责把
 * props 接上——纯搬家，不搬行为。
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ReactElement } from 'react'
import type { ReviewReport } from '../../protocol.ts'
import { DiffList, REVIEW_DIM_ZH, severityColor } from './ChapterWorkbench.tsx'
import css from './panel.module.css'

/** 工作区状态（面板持有）。 */
export interface WorkspaceState {
  no: number
  title: string
  original: string
  instruction: string
  draft: string | null
  /** 打开工作区时的正文基线（用于判断"有未保存修改"）。 */
  baseline: string
  /** 已采纳草稿（原地结论态）：显示已采纳横幅 + 自动审稿结果，返回时才关闭工作区。 */
  applied?: boolean
}

/** 工作区视图的全部输入；状态与副作用都由面板提供。 */
export interface WorkspaceViewProps {
  workspace: WorkspaceState
  onWorkspaceChange: (next: WorkspaceState) => void
  onClose: () => void
  onGotoChapter: (no: number) => void
  backTo: string
  editorFontSize: number
  onEditorFontSizeChange: (n: number) => void
  editorRef: MutableRefObject<HTMLTextAreaElement | null>
  selected: string
  onCaptureSelection: () => void
  checkReport: ReviewReport | null
  checked: number[]
  onCheckedChange: Dispatch<SetStateAction<number[]>>
  showDiff: boolean
  onShowDiffChange: (next: boolean) => void
  resultMode: boolean
  busy: boolean
  onReviseByReport: () => void
  onRewrite: (whole: boolean) => void
  onPolish: () => void
  onSave: () => void
  onCheck: () => void
  onDiscardDraft: (no: number) => void
}

/** 工作区全页：左栏原文（可选中局部目标）+ 右栏指令 / 预览 / 应用。 */
export function WorkspaceView({
  workspace, onWorkspaceChange, onClose, onGotoChapter, backTo,
  editorFontSize, onEditorFontSizeChange, editorRef, selected, onCaptureSelection,
  checkReport, checked, onCheckedChange, showDiff, onShowDiffChange, resultMode, busy,
  onReviseByReport, onRewrite, onPolish, onSave, onCheck, onDiscardDraft,
}: WorkspaceViewProps): ReactElement {
  return (
    <div className={css.wsPage}>
      <div className={css.wsPageHeader}>
        {workspace.applied === true ? (
          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} onClick={() => { const no = workspace.no; onClose(); onGotoChapter(no) }} title="关闭工作区，返回章节页并定位到本章（滚动 + 高亮）；有未保存修改会先确认">
            ← 返回章节页
          </button>
        ) : (
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClose} title={`${backTo}；有未保存的修改会先确认（服务端草稿不受影响）`}>
            ← {backTo}
          </button>
        )}
        <span className={css.cardTitle}>第 {workspace.no} 章《{workspace.title}》</span>
        <span className={css.meta}>{workspace.original.length} 字</span>
        <span style={{ display: 'flex', gap: 'var(--nf-space-4)', alignItems: 'center', marginLeft: 'auto' }}>
          <button type="button" className={css.iconButton} title="减小字号" aria-label="减小字号" onClick={() => { onEditorFontSizeChange(editorFontSize - 1) }}>A−</button>
          <span className={css.meta}>{editorFontSize}px</span>
          <button type="button" className={css.iconButton} title="增大字号" aria-label="增大字号" onClick={() => { onEditorFontSizeChange(editorFontSize + 1) }}>A＋</button>
          <button type="button" className={css.iconButton} title={backTo} aria-label={backTo} onClick={onClose}>×</button>
        </span>
      </div>
      {workspace.applied === true && (
        <div className={css.wsAppliedBanner}>
           已采纳第 {workspace.no} 章新稿（{workspace.original.length} 字）· 原稿已自动备份 .bak
          {checkReport !== null ? (
            <span style={{ color: checkReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
              {' · '}修订时审查：{checkReport.score} 分 — {checkReport.passed ? '通过 ✓' : '未通过，可继续勾选意见修订'}
            </span>
          ) : (
            <span className={css.meta}>{' · '}需要结论？点「 AI 审查」查看</span>
          )}
        </div>
      )}
      {workspace.applied !== true && resultMode && (
        <div className={css.wsAppliedBanner} style={{ borderColor: 'var(--nf-accent)', background: 'color-mix(in srgb, var(--nf-accent) 8%, transparent)' }}>
           修订完成，请查看草稿对比
          {checkReport !== null && (
            <span style={{ color: checkReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
              {' · '}草稿审查：{checkReport.score} 分 — {checkReport.passed ? '通过 ✓' : '未通过，可勾选意见继续修订'}
            </span>
          )}
          <span className={css.meta}>{' · '}满意后点「 应用并保存」落盘</span>
        </div>
      )}
      <div className={css.wsColumns}>
        <div className={css.wsColumn}>
          <div className={css.meta}>
            原文（{workspace.original.length} 字）— 在正文中选中文字可作为「修订选中」的局部目标
          </div>
          <textarea
            ref={editorRef}
            className={`${css.textarea} ${css.wsEditor}`}
            style={{ fontSize: editorFontSize }}
            value={workspace.original}
            onChange={e => { onWorkspaceChange({ ...workspace, original: e.target.value }) }}
            onMouseUp={onCaptureSelection}
            onKeyUp={onCaptureSelection}
            onSelect={onCaptureSelection}
            spellCheck={false}
          />
        </div>
        <div className={css.wsColumn}>
          <div className={css.meta} style={{ fontWeight: 600 }}>修正指令</div>
          <textarea
            className={css.textarea}
            style={{ minHeight: 60 }}
            placeholder="输入修正要求，例如：压缩冗余、加强冲突、这段对话更口语化…（可留空）"
            value={workspace.instruction}
            onChange={e => { onWorkspaceChange({ ...workspace, instruction: e.target.value }) }}
          />
          {selected !== '' ? (
            <div className={css.wsSelected}>
              <div className={css.meta}>当前选中内容（将用于精准修订）</div>
              <div className={css.wsSelectedText}>{selected}</div>
            </div>
          ) : (
            <div className={css.meta}>未选中内容时仅支持整章润色/修订。</div>
          )}
          <div className={css.row}>
            {(checkReport !== null && checkReport.issues.length > 0) ? (
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || checked.length === 0}
                onClick={() => { onReviseByReport() }}
                title="修订下方勾选的意见（整章重写）；产出草稿后自动附带一次 AI 审查"
              >
                修订已选 {checked.length} 条
              </button>
            ) : (
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || workspace.instruction.trim() === ''}
                onClick={() => { onRewrite(true) }}
                title="按指令框内容整章修订"
              >
                 整章修订
              </button>
            )}
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { onPolish() }}>
               去AI味润色
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { onSave() }} title="有草稿则应用草稿，无草稿则保存当前编辑；沿用审查结论或自动审稿，落盘后原地显示结果">
               应用并保存
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || selected === ''} onClick={() => { onRewrite(false) }} title="只修订在左栏选中的文字片段">
               修订选中
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { onCheck() }} title="对当前正文跑一次 AI 审查（不落盘）">
               AI 审查
            </button>
            {workspace.draft !== null && (
              <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { onDiscardDraft(workspace.no) }} title="放弃草稿，保留原稿">
                ↩ 放弃草稿
              </button>
            )}
          </div>
          {/* 手动编辑后的 审查结果 */}
          {checkReport !== null && (
            <div className={css.wsPreview} style={{ borderColor: checkReport.passed ? 'var(--nf-success)' : 'var(--nf-warn)' }}>
              <div className={css.busyRow}>
                <span className={css.meta} style={{ fontWeight: 600 }}>审查结果</span>
                <span style={{ color: checkReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                  {checkReport.score} 分 — {checkReport.passed ? '通过' : '未通过'}
                </span>
              </div>
              <div className={css.meta}><b>总评：</b>{checkReport.verdict}</div>
              {checkReport.issues.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 'var(--nf-space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', fontSize: editorFontSize - 1, maxHeight: '45vh', overflowY: 'auto' }}>
                  {checkReport.issues.map((issue, i) => (
                    <li key={i} style={{ color: severityColor(issue.severity), display: 'flex', gap: 'var(--nf-space-6)', alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        style={{ marginTop: 'var(--nf-space-2)' }}
                        checked={checked.includes(i)}
                        onChange={e => {
                          onCheckedChange(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))
                        }}
                        title="勾选后由「按意见修订」一起修订"
                      />
                      <span>
                        [{issue.severity}{issue.dimension !== undefined ? ` · ${REVIEW_DIM_ZH[issue.dimension] ?? issue.dimension}` : ''}] {issue.item}
                        {issue.suggestion !== '' && <span style={{ color: 'var(--nf-text-2)' }}> → {issue.suggestion}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <span className={css.meta}>
                {checkReport.passed
                  ? '当前意见：已通过。勾选想微调的问题点「按意见修订」，或直接「 应用并保存」。'
                  : '意见只读不落盘；勾选要修的问题点「 按意见修订」一键修订（默认已勾 high），满意后点「 应用并保存」写入文件（原稿自动备份 .bak）。'}
              </span>
            </div>
          )}
          {workspace.draft !== null && (
            <div className={css.wsPreview} style={{ flex: 1, minHeight: 0 }}>
              <div className={css.busyRow}>
                <span className={css.meta}>优化预览（{workspace.draft.length} 字）</span>
                <span style={{ display: 'flex', gap: 'var(--nf-space-8)' }}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { onShowDiffChange(!showDiff) }}>
                    {showDiff ? '显示文本' : '查看对比'}
                  </button>
                </span>
              </div>
              {showDiff
                ? <DiffList original={workspace.original} draft={workspace.draft} fontSize={editorFontSize} />
                : <pre className={css.wsPreviewText} style={{ fontSize: editorFontSize }}>{workspace.draft}</pre>}
              <span className={css.meta}>满意后点上方「 应用并保存」落盘（原稿自动备份 .bak）；不满意可继续修订。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
