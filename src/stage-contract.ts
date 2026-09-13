/**
 * 阶段契约（Stage Contract）——宿主计算的「当前阶段 → 本轮允许的动作」。
 *
 * 设计来源（借鉴 dsh-ai-novel-writer 的「作者请求中的当前阶段决定唯一允许命令」）：
 * 允许的动作必须由宿主根据真实项目状态算出，而不是指望模型记住或自律。
 * 宿主计算结果同时用于三处：
 *   1) 注入助手系统提示词：模型知道自己在哪一步、下一步该做什么；
 *   2) 通用续写指令（「继续 / 下一步」）下的写操作白名单强约束（阶段即唯一命令）；
 *   3) 拒绝写操作时给出可执行的、阶段相关的理由，而不是一句「不允许」。
 *
 * 注意：作者显式点名的写操作永远优先于阶段白名单（作者终审权）；
 * 阶段强约束只在作者没有指定具体对象（通用续写）时生效。
 */

import type { ChapterPlan, ProjectState, StageInfo } from './protocol.ts'

/** 创作阶段标识（线上形状见 protocol.ts 的 StageInfo）。 */
export type BookStageId = StageInfo['id']

/** 一个阶段契约。 */
export type BookStage = StageInfo

/** 大纲视为「已开书」的最短长度。 */
const MIN_OUTLINE_CHARS = 50

/** 通用续写指令（作者没有指定具体对象时，阶段白名单成为唯一命令）。 */
const GENERIC_CONTINUE = /^(继续|下一步|接着来|接着写|往下|往下走|继续吧|go\s*on|continue|next)[。.!！?？\s]*$/i

/**
 * 作者这一轮是否只说了「继续/下一步」这类没有具体对象的指令。
 *
 * @param message 本轮用户消息。
 * @returns 是通用续写指令时为 true。
 */
export function isGenericContinue(message: string): boolean {
  return GENERIC_CONTINUE.test((message ?? '').trim())
}

/**
 * 根据项目真实状态计算当前创作阶段。
 *
 * @param project 当前项目（未加载时为 undefined）。
 * @returns 阶段契约（推荐动作 + 写操作白名单 + 判定理由）。
 */
export function computeBookStage(project: ProjectState | undefined): BookStage {
  if (project === undefined || (project.outline ?? '').trim().length < MIN_OUTLINE_CHARS) {
    return {
      id: 'outline',
      label: '开书',
      recommend: ['outline_replace'],
      allow: ['outline_replace'],
      reason: project === undefined ? '尚无项目' : '大纲为空或过短',
    }
  }
  if (project.bible === undefined) {
    return {
      id: 'bible',
      label: '立设定',
      recommend: ['bible_set_rule', 'bible_set_redline'],
      allow: ['bible_set_rule', 'bible_set_redline'],
      reason: '已有大纲，尚未提炼道藏',
    }
  }
  const chapters = project.chapters ?? []
  if (chapters.length === 0) {
    return {
      id: 'plan',
      label: '排章节',
      recommend: [],
      // 章节规划不在助手的动作集里：通用「继续」不应被解释成改写总纲或设定。
      allow: [],
      reason: '有道藏但还没有章节计划（规划在「小说工坊」面板或生产单里执行）',
    }
  }
  const generating = chapters.filter(c => c.status === 'generating')
  if (generating.length > 0) {
    return {
      id: 'wait',
      label: '等待中',
      recommend: [],
      allow: [],
      reason: `第 ${generating.map(c => c.no).join('、')} 章正在生成，等它结束后再安排下一步`,
    }
  }
  const errored = chapters.filter(c => c.status === 'error')
  if (errored.length > 0) {
    return {
      id: 'write',
      label: '逐章编译',
      recommend: ['chapter_generate'],
      allow: ['chapter_generate', 'chapter_rewrite', 'chapter_review'],
      reason: `第 ${errored.map(c => c.no).join('、')} 章生成失败，需要重写`,
    }
  }
  const rejected = chapters.filter(c => c.status === 'rejected')
  if (rejected.length > 0) {
    return {
      id: 'revise',
      label: '修订循环',
      recommend: ['chapter_rewrite'],
      allow: ['chapter_rewrite', 'chapter_review'],
      reason: `第 ${rejected.map(c => c.no).join('、')} 章审稿未过，需要按意见修订`,
    }
  }
  const awaitingReview = chapters.filter(c => c.status === 'written' || c.status === 'reviewing')
  if (awaitingReview.length > 0) {
    return {
      id: 'review',
      label: '审稿',
      recommend: ['chapter_review'],
      allow: ['chapter_review', 'chapter_rewrite'],
      reason: `第 ${awaitingReview.map(c => c.no).join('、')} 章已写出但尚未审稿`,
    }
  }
  const pending = chapters.filter(c => c.status === 'pending')
  if (pending.length > 0) {
    return {
      id: 'write',
      label: '逐章编译',
      recommend: ['chapter_generate'],
      allow: ['chapter_generate', 'chapter_rewrite', 'chapter_review'],
      reason: `还有 ${pending.length} 章待写（下一章：第 ${pending[0]!.no} 章）`,
    }
  }
  return {
    id: 'export',
    label: '定稿导出',
    recommend: ['export_txt', 'blurb'],
    // 全部通过后不再允许在「继续」下改写正文：要改必须由作者点名章节。
    allow: ['export_txt', 'blurb'],
    reason: `全书 ${chapters.length} 章均已通过审稿`,
  }
}

/**
 * 判断某写操作是否在当前阶段的允许白名单内。
 *
 * @param stage 阶段契约。
 * @param tool 助手工具名。
 * @returns 允许时为 true。
 */
export function stageAllows(stage: BookStage, tool: string): boolean {
  return stage.allow.includes(tool)
}

/**
 * 按阶段把一组动作分成「本阶段可用」与「阶段外」。
 *
 * @param stage 阶段契约。
 * @param tools 动作名列表（通常是写操作登记表）。
 * @returns 两个保持输入顺序的子集。
 */
export function splitByStage(stage: BookStage, tools: readonly string[]): { available: string[]; outside: string[] } {
  const available: string[] = []
  const outside: string[] = []
  for (const tool of tools) {
    if (stageAllows(stage, tool)) available.push(tool)
    else outside.push(tool)
  }
  return { available, outside }
}

/**
 * 渲染阶段契约为可注入提示词的一段文字。
 *
 * @param stage 阶段契约。
 * @returns 多行文本。
 */
export function renderStageContract(stage: BookStage): string {
  const recommend = stage.recommend.length > 0 ? stage.recommend.join('、') : '无（等待或由作者指定）'
  const allow = stage.allow.length > 0 ? stage.allow.join('、') : '无'
  return [
    '==================== 当前创作阶段（宿主根据项目真实状态计算） ====================',
    `阶段：${stage.label}（${stage.id}）`,
    `判定依据：${stage.reason}`,
    `建议下一步：${recommend}`,
    `本阶段允许的写操作：${allow}`,
    '阶段纪律：作者只说了「继续/下一步」而没指定具体对象时，只有上面的写操作会被执行，其余写操作一律拒绝；作者显式点名某个操作时以作者指令为准。',
  ].join('\n')
}

/** 汇总章节状态计数（供面板/提示词展示，避免各处重复统计）。 */
export function summarizeChapters(chapters: ChapterPlan[]): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const chapter of chapters) {
    summary[chapter.status] = (summary[chapter.status] ?? 0) + 1
  }
  return summary
}
