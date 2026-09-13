/**
 * 故事时间线：把「章节正文」压成可排序的时间事件，用于后续章节的时间连续性。
 *
 * 与编年录的分工：编年录记「事实」（人物状态/资源/关系），时间线记「顺序」
 * （什么时候、在哪里、谁在场、发生了什么），专门用来抓时间倒流、地点瞬移与
 * 跨越章节的时序矛盾。
 *
 * 本模块只放纯逻辑（可离线单测）：排序、注入渲染、规则初筛、事件归一化；
 * 模型交互（抽取/复核）在 engine.ts，落盘与路由在 routes.ts。
 */

import type { ProjectState, TimelineEvent, TimelineIssue } from './protocol.ts'

/** 注入后续章节的时间线锚点条数（超过则显式声明省略，遵循截断显式化规则）。 */
export const TIMELINE_CONTEXT_LIMIT = 12

/** 时间线矛盾初筛的最少事件数（太少没有意义）。 */
const MIN_EVENTS_FOR_CHECK = 2

/** 归一化事件（清洗字符串、补 id/时间戳）。 */
export function normalizeTimelineEvent(raw: Partial<TimelineEvent>, chapterNo: number, index: number, now = new Date().toISOString()): TimelineEvent {
  const characters = Array.isArray(raw.characters) ? raw.characters.filter(c => typeof c === 'string' && c.trim() !== '') : []
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `tl-${chapterNo}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    chapterNo: typeof raw.chapterNo === 'number' ? raw.chapterNo : chapterNo,
    time: (raw.time ?? '').trim(),
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
    place: (raw.place ?? '').trim(),
    characters: characters.map(c => c.trim()),
    event: (raw.event ?? '').trim(),
    source: raw.source === 'manual' ? 'manual' : 'extracted',
    createdAt: raw.createdAt ?? now,
  }
}

/** 时间线排序：先章节、再 order（缺省排在该章末尾）、最后 createdAt。 */
export function sortTimeline(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.chapterNo !== b.chapterNo) return a.chapterNo - b.chapterNo
    const ao = a.order ?? Number.MAX_SAFE_INTEGER
    const bo = b.order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/**
 * 渲染注入到「写作/规划」提示词的时间线锚点块。
 *
 * @param project 项目状态。
 * @param beforeChapter 只注入该章之前的锚点（含该章本身不注入，避免剧透）。
 * @returns 提示词片段（无事件时返回空串）。带显式截断声明。
 */
export function renderTimelineBlock(project: ProjectState, beforeChapter: number): string {
  const all = sortTimeline(project.timeline ?? []).filter(e => e.chapterNo < beforeChapter)
  if (all.length === 0) return ''
  const shown = all.slice(-TIMELINE_CONTEXT_LIMIT)
  const omitted = all.length - shown.length
  const head = omitted > 0
    ? `【故事时间线（共 ${all.length} 条，此处只列最近 ${shown.length} 条；更早 ${omitted} 条未列出）】`
    : `【故事时间线（共 ${shown.length} 条）】`
  const lines = shown.map(e => {
    const parts = [`[第${e.chapterNo}章]`]
    if (e.time !== '') parts.push(e.time)
    if (e.place !== '') parts.push(`@${e.place}`)
    if (e.characters.length > 0) parts.push(`(${e.characters.join('、')})`)
    parts.push(e.event)
    return '- ' + parts.join(' ')
  })
  return `${head}\n${lines.join('\n')}\n写作时必须与前文时间顺序、地点衔接一致；不得让时间倒流或让人物瞬移。`
}

/**
 * 规则初筛时间线矛盾（不调模型，瞬时计算）。
 *
 * 覆盖三类最容易犯又最容易用规则抓到的错：
 *   1) 同一章内事件顺序号倒退；
 *   2) 全书顺序号在章节推进后倒退（时间倒流）；
 *   3) 相邻两章之间地点瞬移（同一角色在未交代移动的情况下跨地点）。
 *
 * @param project 项目状态。
 * @returns 问题清单（可能为空）。
 */
export function detectTimelineIssues(project: ProjectState): TimelineIssue[] {
  // 注意：这里用**原始数组顺序**分组（= 模型/作者的叙述顺序），而不是按 order 排序后的顺序。
  // 否则「模型自报 order 与叙述顺序打架」这一类问题会被排序抹平，永远查不出来。
  const stored = project.timeline ?? []
  if (stored.length < MIN_EVENTS_FOR_CHECK) return []
  const issues: TimelineIssue[] = []

  // 1) 同章内顺序倒退（叙述顺序 vs 自报 order）
  const byChapter = new Map<number, TimelineEvent[]>()
  for (const e of stored) {
    const list = byChapter.get(e.chapterNo) ?? []
    list.push(e)
    byChapter.set(e.chapterNo, list)
  }
  for (const [no, list] of byChapter) {
    let lastOrder: number | undefined
    for (const e of list) {
      if (e.order === undefined) continue
      if (lastOrder !== undefined && e.order < lastOrder) {
        issues.push({
          severity: 'medium',
          chapters: [no],
          item: `第${no}章内时间顺序倒退：事件「${e.event}」的顺序号 ${e.order} 小于前一条 ${lastOrder}`,
          suggestion: '检查这两条事件的先后关系，修正 order 或改写正文的时间描述。',
        })
      }
      lastOrder = e.order
    }
  }

  // 2) 跨章时间倒流（用每章最大 order 与上一章比较）
  const chapterMax: Array<{ no: number; max: number; event: TimelineEvent }> = []
  for (const [no, list] of [...byChapter].sort((a, b) => a[0] - b[0])) {
    const withOrder = list.filter(e => e.order !== undefined)
    if (withOrder.length === 0) continue
    const maxEvent = withOrder.reduce((best, e) => ((e.order ?? 0) > (best.order ?? 0) ? e : best), withOrder[0]!)
    chapterMax.push({ no, max: maxEvent.order ?? 0, event: maxEvent })
  }
  for (let i = 1; i < chapterMax.length; i++) {
    const prev = chapterMax[i - 1]!
    const cur = chapterMax[i]!
    if (cur.max < prev.max) {
      issues.push({
        severity: 'high',
        chapters: [prev.no, cur.no],
        item: `时间倒流：第${cur.no}章（${cur.event.time || '未标注时间'}）早于第${prev.no}章（${prev.event.time || '未标注时间'}）`,
        suggestion: '确认是否需要补写过渡（回忆/插叙）或调整章节顺序；若是有意插叙，请在正文中明确标注。',
      })
    }
  }

  // 3) 相邻章地点瞬移（同一角色、地点变化且新地点首次出现）
  const seenPlaces = new Set<string>()
  let prevPlace = ''
  const lastChapterOf = new Map<string, string>()
  for (const e of sortTimeline(stored)) {
    if (e.place !== '') {
      if (prevPlace !== '' && e.place !== prevPlace && !seenPlaces.has(e.place)) {
        // 新地点首次出现：只有在同一角色上一章还在别处时才提示
        const moved = e.characters.filter(c => lastChapterOf.get(c) !== undefined && lastChapterOf.get(c) !== e.place)
        if (moved.length > 0) {
          issues.push({
            severity: 'medium',
            chapters: [e.chapterNo],
            item: `地点衔接存疑：${moved.join('、')} 上一场景在「${lastChapterOf.get(moved[0]!) ?? '?'}」，本章直接出现在「${e.place}」`,
            suggestion: '补一句移动/时间流逝的交代，或确认是否漏写了赶路段落。',
          })
        }
      }
      seenPlaces.add(e.place)
      prevPlace = e.place
      for (const c of e.characters) lastChapterOf.set(c, e.place)
    }
  }
  return issues
}
