/**
 * 章节工作台左栏：本章计划。
 *
 * 为什么重写这一块（方案 §7）：原先左栏只渲染 `beats` 原文 + 摘要，而
 * `obligation`（义务合约）、`mustAdvance`（必达项）、`mustPreserve`（不得破坏）、
 * `characterHardFacts`（人物硬事实）、`endingHook`（结尾钩子）**一项都没有显示过** ——
 * 可它们全被宿主逐条拼进生成与审稿提示词（见 engine 的「本章义务合约」）。
 * 也就是说：AI 按这些字段写、按这些字段审，作者却看不见它们，更没地方纠正排偏的计划。
 *
 * 现在按 §7 的固定顺序渲染六项，空项说清「缺了什么 / 用在哪 / 怎么补」，
 * 并可就地补写（POST /chapter/plan）。上限与宿主一致，超限由宿主回写截断声明。
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ChapterPlanPatchRequest, Plotline } from '../../protocol.ts'
import { kindLabel } from './helpers.ts'
import { NoticeBar } from './NoticeBar.tsx'
import css from './panel.module.css'

/** 可编辑字段（与 /chapter/plan 的 patch 键一一对应）。 */
type FieldKey = 'obligation' | 'beats' | 'mustAdvance' | 'mustPreserve' | 'characterHardFacts' | 'endingHook'

interface Field {
  key: FieldKey
  label: string
  /** text = 自由文本；list = 每行一条。 */
  kind: 'text' | 'list'
  /** 宿主上限，写进编辑框提示，避免作者写完才发现被裁。 */
  max: number
  rows: number
  placeholder: string
}

/** 目标与钩子是「一句话合约」，剧情要点允许多段。 */
const OBLIGATION: Field = { key: 'obligation', label: '本章目标', kind: 'text', max: 200, rows: 3, placeholder: '这一章必须完成的核心推进，一句话说清' }
const BEATS: Field = { key: 'beats', label: '剧情要点', kind: 'text', max: 2000, rows: 7, placeholder: '主要情节的起承转合，可按「本章目标：/ 剧情要点：/ 爽点：/ 结尾钩子：」分段写' }
const ADVANCE: Field = { key: 'mustAdvance', label: '本章必达项', kind: 'list', max: 4, rows: 4, placeholder: '每行一条：局面 / 关系 / 信息 / 风险 / 决策的变化' }
const PRESERVE: Field = { key: 'mustPreserve', label: '不得破坏', kind: 'list', max: 4, rows: 4, placeholder: '每行一条：伏笔不提前揭、人物状态不倒退……' }
const HARD_FACTS: Field = { key: 'characterHardFacts', label: '人物硬事实', kind: 'list', max: 6, rows: 5, placeholder: '每行一条：身份 / 阵营 / 境界 / 当前位置 / 知情度' }
const HOOK: Field = { key: 'endingHook', label: '结尾钩子', kind: 'text', max: 120, rows: 2, placeholder: '本章结尾要为下一章留下什么悬念' }

interface PlanGroup {
  id: FieldKey | 'lines'
  title: string
  /** 空状态里的「这一项用在哪」：让作者知道补它不是为了好看。 */
  why: string
  fields: Field[]
  /** 本章是否已给出这一项的内容（决定显示正文还是空状态）。 */
  filled: (chapter: ChapterPlan, plotlines: Plotline[]) => boolean
  /** 已有内容的展示形态。 */
  body: (chapter: ChapterPlan, plotlines: Plotline[]) => ReactNode
}

/** 六项的固定顺序（方案 §7）：目标 → 推进 → 保持 → 硬事实 → 钩子 → 剧情线。 */
const GROUPS: ReadonlyArray<PlanGroup> = [
  {
    id: 'obligation',
    title: '本章目标',
    why: '目标会写进生成提示词，并作为审稿判断「这章完成了吗」的依据。',
    fields: [OBLIGATION],
    filled: c => c.obligation !== undefined && c.obligation !== '',
    body: c => <p className={css.planGroupText}>{c.obligation}</p>,
  },
  {
    id: 'beats',
    title: '剧情推进',
    why: '剧情要点决定本章写什么，必达项决定审稿算不算「有推进」。',
    fields: [BEATS, ADVANCE],
    filled: c => c.beats !== '' || (c.mustAdvance?.length ?? 0) > 0,
    body: c => (
      <>
        {c.beats !== '' && <div className={css.planGroupText}>{renderBeats(c.beats)}</div>}
        {(c.mustAdvance?.length ?? 0) > 0 && <PlanList label="本章必达项" items={c.mustAdvance ?? []} />}
      </>
    ),
  },
  {
    id: 'mustPreserve',
    title: '必须保持',
    why: '列在这里的东西，AI 会被明确要求本章不得破坏（伏笔不提前揭、状态不倒退）。',
    fields: [PRESERVE],
    filled: c => (c.mustPreserve?.length ?? 0) > 0,
    body: c => <PlanList items={c.mustPreserve ?? []} />,
  },
  {
    id: 'characterHardFacts',
    title: '人物硬事实',
    why: '身份 / 阵营 / 境界 / 位置 / 知情度。违背其中任何一条就是硬伤，审稿会按它来判。',
    fields: [HARD_FACTS],
    filled: c => (c.characterHardFacts?.length ?? 0) > 0,
    body: c => <PlanList items={c.characterHardFacts ?? []} />,
  },
  {
    id: 'endingHook',
    title: '结尾钩子',
    why: '钩子要求会写进生成提示词，作者复盘再核对它有没有兑现。',
    fields: [HOOK],
    filled: c => c.endingHook !== undefined && c.endingHook !== '',
    body: c => <p className={css.planGroupText}>{c.endingHook}</p>,
  },
  {
    id: 'lines',
    title: '关联剧情线',
    why: '关联之后，AI 才知道本章该推进哪条线、伏笔该在哪一章动手。',
    fields: [],
    filled: (c, plotlines) => (c.payoffDirectives?.length ?? 0) > 0
      || plotlines.some(l => l.chapters.includes(c.no))
      || (c.authorReview?.advancedLines?.length ?? 0) > 0,
    body: (c, plotlines) => <LinkedLines chapter={c} plotlines={plotlines} />,
  },
]

/** 空状态文案：缺什么（标题）由分组名给出，这里补「用在哪」和动作。 */
const VERB: Record<FieldKey, string> = {
  obligation: '补充目标',
  beats: '补充剧情推进',
  mustAdvance: '补充剧情推进',
  mustPreserve: '补充保持项',
  characterHardFacts: '补充硬事实',
  endingHook: '补充钩子',
}

/** 本章计划 → 编辑框初值。 */
function initialValues(chapter: ChapterPlan): Record<FieldKey, string> {
  return {
    obligation: chapter.obligation ?? '',
    beats: chapter.beats,
    mustAdvance: (chapter.mustAdvance ?? []).join('\n'),
    mustPreserve: (chapter.mustPreserve ?? []).join('\n'),
    characterHardFacts: (chapter.characterHardFacts ?? []).join('\n'),
    endingHook: chapter.endingHook ?? '',
  }
}

function PlanList({ items, label }: { items: string[]; label?: string }): JSX.Element {
  return (
    <div className={css.planListWrap}>
      {label !== undefined && <span className={css.planListLabel}>{label}</span>}
      <ul className={css.planList}>
        {items.map((item, i) => <li key={i} className={css.planListItem}>{item}</li>)}
      </ul>
    </div>
  )
}

/** 伏笔指令的操作中文名（与规划提示词里的 seed/touch/… 对齐）。 */
const OPERATION_LABEL: Record<string, string> = {
  seed: '埋',
  touch: '碰',
  pressure: '施压',
  partial_reveal: '部分揭示',
  payoff: '兑现',
  forbid: '禁止触碰',
}

/** 关联剧情线：已关联的线 + 本章的伏笔指令。 */
function LinkedLines({ chapter, plotlines }: { chapter: ChapterPlan; plotlines: Plotline[] }): JSX.Element {
  const linked = plotlines.filter(l => l.chapters.includes(chapter.no))
  const directives = chapter.payoffDirectives ?? []
  return (
    <>
      {linked.length > 0 && (
        <div className={css.planListWrap}>
          <span className={css.planListLabel}>推进中的线</span>
          <ul className={css.planList}>
            {linked.map(l => (
              <li key={l.id} className={css.planListItem}>
                <b>{l.name}</b>
                <span className={css.meta}> · {kindLabel(l.kind)} · {l.nextGoal !== undefined && l.nextGoal !== '' ? l.nextGoal : l.goal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {directives.length > 0 && (
        <div className={css.planListWrap}>
          <span className={css.planListLabel}>伏笔指令</span>
          <ul className={css.planList}>
            {directives.map((d, i) => (
              <li key={i} className={css.planListItem}>
                {d.operation !== undefined && <b className={css.planOpTag}>{OPERATION_LABEL[d.operation] ?? d.operation}</b>}
                {d.no !== undefined && <span className={css.meta}>第 {d.no} 章的伏笔</span>}
                {d.text !== undefined && d.text !== '' && <span> {d.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {linked.length === 0 && directives.length === 0 && (
        <p className={css.planGroupText}>
          {chapter.authorReview?.advancedLines !== undefined && chapter.authorReview.advancedLines.length > 0
            ? `复盘认为本章推进了：${chapter.authorReview.advancedLines.join('、')}（尚未在长线管理里登记）`
            : ''}
        </p>
      )}
    </>
  )
}

/** 把章节 beats 按结构标签渲染（本章目标 / 剧情要点 / 爽点 / 结尾钩子 等前缀加粗）。 */
export function renderBeats(beats: string): JSX.Element {
  const lines = beats.split('\n')
  return (
    <div className={css.planBeatLines}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        const match = /^([^：:]{2,14})[：:]/.exec(trimmed)
        if (match !== null) {
          return (
            <div key={i} className={css.planBeatLine}>
              <b className={css.planBeatRole}>{match[1]}</b>
              {trimmed.slice(match[0].length)}
            </div>
          )
        }
        return <div key={i} className={css.planBeatLine}>{line}</div>
      })}
    </div>
  )
}

export interface ChapterPlanPanelProps {
  chapter: ChapterPlan
  /** 全部剧情线：内部按 `chapters` 是否含本章来筛关联项。 */
  plotlines: Plotline[]
  api: NovelApi
  busy: boolean
  /** 保存成功后回传合并结果，由外层并入 project.chapters（工作台的唯一数据源）。 */
  onSaved: (chapter: ChapterPlan) => void
  /** 截断声明汇入外层（不静默吞掉：作者写了 6 条只留 4 条时必须看见）。 */
  onNotice: (message: string) => void
  /** 关联剧情线的动作入口：打开「长线管理」抽屉。 */
  onLinkLines: () => void
}

/**
 * 左栏计划面板：六项固定分组 + 就地补写。
 *
 * 编辑态一次只开一个分组：`patch` 只覆盖传入字段，同时开两处会让两个
 * 草稿互相看不见，保存时机也变得含混。
 */
export function ChapterPlanPanel({ chapter, plotlines, api, busy, onSaved, onNotice, onLinkLines }: ChapterPlanPanelProps): JSX.Element {
  const [editing, setEditing] = useState<PlanGroup | null>(null)
  const [values, setValues] = useState<Record<FieldKey, string>>(() => initialValues(chapter))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const open = (group: PlanGroup): void => {
    setError('')
    setValues(initialValues(chapter))
    setEditing(group)
  }
  const cancel = (): void => {
    setEditing(null)
    setError('')
  }

  const save = async (): Promise<void> => {
    const group = editing
    if (group === null) return
    const built: Partial<Record<FieldKey, string | string[]>> = {}
    for (const field of group.fields) {
      const raw = values[field.key]
      built[field.key] = field.kind === 'list'
        ? raw.split('\n').map(s => s.trim()).filter(s => s !== '')
        : raw.trim()
    }
    // 联合键逐个写入时 TS 只能取到「string & string[]」，所以先聚成 Partial 再整体交出去；
    // 每个键的形态由 Field.kind 定死（本文件唯一构造 patch 的地方，六条声明一眼可核）。
    const patch = built as ChapterPlanPatchRequest['patch']
    setSaving(true)
    setError('')
    try {
      const response = await api.chapterPlan(chapter.no, patch)
      onSaved(response.chapter)
      for (const notice of response.notices ?? []) {
        onNotice(`本章计划已存，但 ${notice}`)
      }
      setEditing(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={css.planGroups}>
      {GROUPS.map(group => {
        const has = group.filled(chapter, plotlines)
        const isEditing = editing?.id === group.id
        return (
          <section key={group.id} className={css.planGroup}>
            <div className={css.planGroupHead}>
              <span className={css.planGroupTitle}>{group.title}</span>
              <span className={css.planGroupSpacer} />
              {group.fields.length > 0 && !isEditing && (
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || saving}
                  onClick={() => { open(group) }}
                >
                  {has ? '编辑' : VERB[group.fields[0].key]}
                </button>
              )}
              {group.id === 'lines' && !isEditing && (
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  disabled={busy || saving}
                  onClick={onLinkLines}
                  title="在长线管理里把剧情线关联到本章"
                >
                  去长线管理
                </button>
              )}
            </div>

            {isEditing ? (
              <div className={css.planGroupEdit}>
                {group.fields.map(field => (
                  <label key={field.key} className={css.planEditField}>
                    <span className={css.fieldLabel}>{field.label}</span>
                    <textarea
                      className={css.textarea}
                      rows={field.rows}
                      value={values[field.key]}
                      placeholder={field.placeholder}
                      onChange={e => { setValues(prev => ({ ...prev, [field.key]: e.target.value })) }}
                    />
                    <span className={css.meta}>
                      {field.kind === 'list' ? '每行一条' : '可分行写'}
                      {` · 上限 ${field.max}${field.kind === 'list' ? ' 条' : ' 字'}，超出部分宿主会裁掉并回写说明`}
                    </span>
                  </label>
                ))}
                {error !== '' && (
                  <NoticeBar kind="error" detail="输出目录不可写、或本章刚被重排（重新打开编辑器可读到最新计划）。" actions={
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { void save() }} disabled={saving}>重试保存</button>
                  }>
                    本章计划没存上：{error}
                  </NoticeBar>
                )}
                <div className={css.planEditActions}>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} onClick={() => { void save() }} disabled={saving || busy}>
                    {saving ? '保存中…' : '保存本章计划'}
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={cancel} disabled={saving}>取消</button>
                </div>
              </div>
            ) : has ? (
              group.body(chapter, plotlines)
            ) : (
              <div className={css.planGroupEmpty}>
                <span className={css.planGroupEmptyTitle}>尚未填写{group.title}</span>
                <span className={css.planGroupEmptyHint}>{group.why}</span>
              </div>
            )}
          </section>
        )
      })}

      {chapter.summary !== undefined && chapter.summary !== '' && (
        <section className={css.planGroup}>
          <div className={css.planGroupHead}>
            <span className={css.planGroupTitle}>本章摘要</span>
          </div>
          <p className={css.planGroupText}>{chapter.summary}</p>
        </section>
      )}
    </div>
  )
}
