/**
 * 修订指令合并层（arbitration）。
 *
 * 问题：审稿、时间线、张力三条通道各自给建议，如果各自改一轮，会出现「改完 A 又违反 B」
 * 的互相打脸：同一章可能被改三遍，最后一轮的改动把第一轮的修正覆盖掉。
 *
 * 规则（与面板/生产单共享同一份实现，避免两头各写一套）：
 *  1. 同一章只交付**一份**修订指令（本模块负责汇总，调用方不得自行拼装）。
 *  2. 固定优先级，不做权重打分（可解释、可复现）：
 *       0 审稿 high（必改，是硬门）
 *       1 时间线 high（硬矛盾：时间倒流、地点瞬移）
 *       2 张力 medium（曲线偏差，建议性最强）
 *       3 其余（审稿 medium / 时间线 medium）
 *       4 低优先（审稿 low）
 *  3. 一次修订最多吃 REVISION_ITEM_CAP 条，超出按优先级截断；截断数量显式回传，不静默丢弃。
 *  4. 每章修订轮次上限 MAX_REVISION_ROUNDS，超出转人工待办。
 *  5. 验证基准 = 本轮实际下发的全部条目（审稿 + 时间线 + 张力），
 *     这样「复核」核对的就是「我们要求改的东西」，而不是只核对审稿那部分。
 */

import type {
  ProjectState,
  ReviewIssue,
  ReviewReport,
  RevisionItem,
  RevisionSource,
  Severity,
  TimelineIssue,
  TensionIssue,
} from './protocol.js'
import { detectTimelineIssues } from './timeline.js'
import { detectTensionIssues } from './tension.js'

/** 每章修订轮次上限：两轮仍不过即转人工，不做「无限自动修改」。 */
export const MAX_REVISION_ROUNDS = 2
/** 单次修订指令最多携带的条目数（防止指令过长把正文挤出上下文）。 */
export const REVISION_ITEM_CAP = 8

export const REVISION_SOURCE_LABELS: Record<RevisionSource, string> = {
  review: '审稿',
  timeline: '时间线',
  tension: '张力',
}

/** 固定优先级：数值越小越先改。 */
export function revisionPriority(source: RevisionSource, severity: Severity): number {
  if (source === 'review') return severity === 'high' ? 0 : severity === 'medium' ? 3 : 4
  if (source === 'timeline') return severity === 'high' ? 1 : 3
  // 张力只产出 medium（曲线偏差是建议，不是违规）。
  return severity === 'high' ? 2 : 2
}

/** 去重键：同源 + 归一化问题描述（忽略空白与标点差异）。 */
function dedupeKey(item: RevisionItem): string {
  return `${item.source}|${item.item.replace(/[\s，。、；：,.!?！？"'"'（）()【】\[\]]/g, '').slice(0, 60)}`
}

/** 排序 + 去重 + 截断。去重时保留优先级更高的那条，并累加 count。 */
export function mergeRevisionItems(
  items: RevisionItem[],
  cap = REVISION_ITEM_CAP,
): { items: RevisionItem[]; omitted: number } {
  const sorted = [...items].sort((a, b) => {
    const byPriority = revisionPriority(a.source, a.severity) - revisionPriority(b.source, b.severity)
    if (byPriority !== 0) return byPriority
    if (a.chapterNo !== b.chapterNo) return a.chapterNo - b.chapterNo
    return a.id.localeCompare(b.id)
  })
  const seen = new Map<string, RevisionItem>()
  const unique: RevisionItem[] = []
  for (const item of sorted) {
    const key = dedupeKey(item)
    const dup = seen.get(key)
    if (dup !== undefined) {
      dup.count = (dup.count ?? 1) + 1
      continue
    }
    seen.set(key, item)
    unique.push(item)
  }
  const kept = unique.slice(0, cap)
  return { items: kept, omitted: Math.max(0, unique.length - kept.length) }
}

/** 时间线/张力问题是否落在目标章上（chapters 为空视为全书级，跟随目标章）。 */
function matchesChapter(chapters: number[] | undefined, target: number | undefined): boolean {
  if (target === undefined) return true
  const list = chapters ?? []
  if (list.length === 0) return true
  return list.includes(target)
}

function pickChapterNo(chapters: number[] | undefined, target: number | undefined, fallback: number): number {
  if (target !== undefined && matchesChapter(chapters, target)) return target
  return chapters?.[0] ?? fallback
}

function timelineToItems(issues: TimelineIssue[], target: number | undefined): RevisionItem[] {
  const out: RevisionItem[] = []
  issues.forEach((issue, i) => {
    if (!matchesChapter(issue.chapters, target)) return
    out.push({
      id: `timeline:${i}:${pickChapterNo(issue.chapters, target, 0)}`,
      source: 'timeline',
      severity: issue.severity,
      chapterNo: pickChapterNo(issue.chapters, target, 0),
      item: issue.item,
      suggestion: issue.suggestion,
    })
  })
  return out
}

function tensionToItems(issues: TensionIssue[], target: number | undefined): RevisionItem[] {
  const out: RevisionItem[] = []
  issues.forEach((issue, i) => {
    if (!matchesChapter(issue.chapters, target)) return
    out.push({
      id: `tension:${i}:${pickChapterNo(issue.chapters, target, 0)}`,
      source: 'tension',
      severity: issue.severity,
      chapterNo: pickChapterNo(issue.chapters, target, 0),
      item: issue.item,
      suggestion: issue.suggestion,
    })
  })
  return out
}

export interface RevisionCollectOptions {
  /** 目标章；缺省表示全书（用于整本批量修订）。 */
  chapterNo?: number
  /** 显式指定的审稿意见；缺省取该章已落盘的审稿报告。 */
  reviewIssues?: ReviewIssue[]
  /** 是否纳入时间线矛盾（默认纳入）。 */
  includeTimeline?: boolean
  /** 是否纳入张力偏差（默认纳入）。 */
  includeTension?: boolean
}

/** 汇总一章（或全书）的三类建议。纯函数，不改项目状态。 */
export function collectRevisionItems(project: ProjectState, options: RevisionCollectOptions = {}): RevisionItem[] {
  const target = options.chapterNo
  const items: RevisionItem[] = []
  const chapters = (project.chapters ?? []).filter(c => target === undefined || c.no === target)

  const explicit = options.reviewIssues
  if (explicit !== undefined) {
    explicit.forEach((issue, i) => {
      items.push({
        id: `review:${target ?? 0}:${i}`,
        source: 'review',
        severity: issue.severity,
        chapterNo: target ?? 0,
        item: issue.item,
        suggestion: issue.suggestion,
      })
    })
  } else {
    for (const chapter of chapters) {
      for (const [i, issue] of (chapter.review?.issues ?? []).entries()) {
        items.push({
          id: `review:${chapter.no}:${i}`,
          source: 'review',
          severity: issue.severity,
          chapterNo: chapter.no,
          item: issue.item,
          suggestion: issue.suggestion,
        })
      }
    }
  }

  if (options.includeTimeline ?? true) items.push(...timelineToItems(detectTimelineIssues(project), target))
  if (options.includeTension ?? true) items.push(...tensionToItems(detectTensionIssues(project), target))
  return items
}

export interface RevisionPlan {
  /** 已排序、去重、截断后的条目。 */
  items: RevisionItem[]
  /** 下发给模型的修订指令（唯一入口，调用方不要自行拼装）。 */
  instruction: string
  counts: Record<RevisionSource, number>
  /** 因超出上限被截断的条数（显式回传，便于提示作者）。 */
  omitted: number
  /** 验证基准：把本轮下发的全部条目当作「上一轮意见」，复核时逐条核对。 */
  baseline: ReviewReport
}

export interface BuildRevisionPlanOptions extends RevisionCollectOptions {
  /** 审稿基线报告（提供后 baseline 会保留其分数与时间）。 */
  baseReport?: ReviewReport
  /** 指令抬头（默认「按合并建议修订」）。 */
  title?: string
  cap?: number
}

/** 渲染修订指令。格式与历史「按审稿意见修订」保持同族，模型无需重新学习。 */
export function renderRevisionInstruction(items: RevisionItem[], title = '按合并建议修订'): string {
  const counts: Record<RevisionSource, number> = { review: 0, timeline: 0, tension: 0 }
  for (const item of items) counts[item.source] += item.count ?? 1
  const header = `（审稿 ${counts.review} · 时间线 ${counts.timeline} · 张力 ${counts.tension}）`
  const lines = items.map(item => {
    const tag = `【${REVISION_SOURCE_LABELS[item.source]}·${item.severity}】`
    const where = item.chapterNo > 0 ? `第${item.chapterNo}章 ` : ''
    const repeat = (item.count ?? 1) > 1 ? `（合并同类 ${item.count} 条）` : ''
    const suggestion = item.suggestion.trim() === '' ? '' : `\n建议：${item.suggestion.trim()}`
    return `${tag}${where}${item.item}${repeat}${suggestion}`
  })
  return `${title}${header}：\n${lines.join('\n')}`
}

/**
 * 构造验证基准：把时间线/张力条目转成「上一轮意见」的编号项，
 * 与审稿意见合并成一份报告。复核模型据此逐条核对，避免
 * 「审稿说已解决、时间线说没改」这类互相打架的判定。
 */
export function buildRevisionBaseline(items: RevisionItem[], base?: ReviewReport): ReviewReport {
  const issues: ReviewIssue[] = items.map(item => ({
    severity: item.severity,
    item: item.source === 'review' ? item.item : `[${REVISION_SOURCE_LABELS[item.source]}] ${item.item}`,
    suggestion: item.suggestion,
  }))
  return {
    score: base?.score ?? 0,
    passed: false,
    verdict: base?.verdict ?? '本轮修订基准',
    issues,
    riskScore: base?.riskScore,
    aiFlavor: base?.aiFlavor,
    aiPhrases: base?.aiPhrases,
    reviewedAt: base?.reviewedAt ?? new Date().toISOString(),
  }
}

/** 汇总 → 排序 → 指令 → 基准。面板与生产单都走这里。 */
export function buildRevisionPlan(project: ProjectState, options: BuildRevisionPlanOptions = {}): RevisionPlan {
  const collected = collectRevisionItems(project, options)
  const merged = mergeRevisionItems(collected, options.cap ?? REVISION_ITEM_CAP)
  const counts: Record<RevisionSource, number> = { review: 0, timeline: 0, tension: 0 }
  for (const item of merged.items) counts[item.source] += item.count ?? 1
  return {
    items: merged.items,
    instruction: renderRevisionInstruction(merged.items, options.title),
    counts,
    omitted: merged.omitted,
    baseline: buildRevisionBaseline(merged.items, options.baseReport),
  }
}

/** 一行摘要，用于日志与面板提示（"审稿 3 · 时间线 1 · 张力 1，另截断 2 条"）。 */
export function describeRevisionPlan(plan: RevisionPlan): string {
  const parts: string[] = []
  if (plan.counts.review > 0) parts.push(`审稿 ${plan.counts.review}`)
  if (plan.counts.timeline > 0) parts.push(`时间线 ${plan.counts.timeline}`)
  if (plan.counts.tension > 0) parts.push(`张力 ${plan.counts.tension}`)
  const head = parts.length === 0 ? '无可修订条目' : parts.join(' · ')
  return plan.omitted > 0 ? `${head}（另截断 ${plan.omitted} 条）` : head
}

/** 待办文本（生产单只提示不阻塞时写入项目待办，供作者人工决定）。 */
export function revisionTodoText(item: RevisionItem): string {
  const where = item.chapterNo > 0 ? `第${item.chapterNo}章` : '全书'
  return `[${REVISION_SOURCE_LABELS[item.source]}] ${where}：${item.item}`
}
