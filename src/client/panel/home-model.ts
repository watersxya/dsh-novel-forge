/**
 * 总编台（首页）的纯计算层。
 *
 * 从 NovelPanel.tsx 抽出（2026-10 重构）：这些数字原先散在 6000+ 行组件的
 * useMemo 里，既没法单测，也让「同一件事在面板里说两遍」难以发现。抽成纯函数后：
 *   - 输入只有 project / chapters，输出是确定的结构；
 *   - 面板只负责渲染，数字口径集中在这里改；
 *   - `tests/home-model.test.ts` 直接覆盖边界（空书、全过审、生成中）。
 */
import type { ChapterPlan, ProjectState } from '../../protocol.ts'

/** 总编台用的章节统计（一次遍历算完，避免面板里重复过滤）。 */
export interface ChapterStats {
  /** 有正文的章数（approved / written / rejected）。 */
  done: number
  /** 待处理章数（pending / error）。 */
  pending: number
  /** 已过审章数。 */
  approved: number
  /** 待审章数（written / rejected）。 */
  reviewPending: number
  /** 全书已写字数（汉字口径，来自 chapter.chars）。 */
  totalChars: number
  /** 正在生成的章（同刻至多一章；undefined = 没有）。 */
  writingNow: ChapterPlan | undefined
  /** 逐章字数序列（Sparkline 用；顺序 = 章节数组顺序）。 */
  charSeries: Array<{ no: number; chars: number; approved: boolean }>
}

/**
 * 单次遍历统计全书章节。
 * @param chapters 全书章节计划（顺序无关，按数组顺序输出 charSeries）。
 */
export function computeChapterStats(chapters: ChapterPlan[]): ChapterStats {
  let done = 0
  let pending = 0
  let approved = 0
  let reviewPending = 0
  let totalChars = 0
  let writingNow: ChapterPlan | undefined
  const charSeries: Array<{ no: number; chars: number; approved: boolean }> = []
  for (const c of chapters) {
    const s = c.status
    if (s === 'approved' || s === 'written' || s === 'rejected') done++
    if (s === 'pending' || s === 'error') pending++
    if (s === 'approved') approved++
    if (s === 'rejected' || s === 'written') reviewPending++
    if (s === 'generating') writingNow = c
    const ch = c.chars ?? 0
    totalChars += ch
    charSeries.push({ no: c.no, chars: ch, approved: s === 'approved' })
  }
  return { done, pending, approved, reviewPending, totalChars, writingNow, charSeries }
}

/** 创作旅程的一个阶段。 */
export interface JourneyStage {
  id: string
  label: string
  done: boolean
}

/**
 * 创作旅程 6 阶段（大纲 → 设定 → 卷计划 → 章节计划 → 正文 → 审稿）。
 *
 * 「完成」的判定只看项目真实数据，不参考 UI 当前所在页；否则作者在
 * 「总纲」页多停留一会儿，旅程条就会自己变。
 *
 * @param project 当前书（undefined = 没有书）。
 * @param chapters 章节计划。
 * @param approvedCount 已过审章数（来自 {@link computeChapterStats}）。
 */
export function computeJourneyStages(
  project: ProjectState | undefined,
  chapters: ChapterPlan[],
  approvedCount: number,
): JourneyStage[] {
  return [
    { id: 'outline', label: '大纲', done: project !== undefined },
    { id: 'bible', label: '设定', done: project?.bible !== undefined },
    { id: 'volumes', label: '卷计划', done: project?.volumes !== undefined },
    { id: 'plan', label: '章节计划', done: chapters.length > 0 },
    { id: 'write', label: '正文', done: chapters.some(c => (c.chars ?? 0) > 0) },
    { id: 'review', label: '审稿', done: approvedCount > 0 },
  ]
}
