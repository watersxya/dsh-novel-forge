/**
 * 剧情线域：建议提炼、进度刷新（批量）、健康检查、下一阶段方案。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { PromptEntry } from './catalog.ts'

/** 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
export function suggestPlotlinesSystemPrompt(): string {
  return [
    '你是一位网文剧情架构师。根据本书的大纲、卷计划、已写章节标题与编年录，为作者提炼建议的剧情线（主线/支线/人物线/悬念线）。',
    '每条线要：名称简洁有力；目标写清楚这条线最终要完成什么；progress 写当前推进到哪（没有就空字符串）。',
    '建议 4-8 条，覆盖：1 条主线、1-2 条人物线、1-2 条悬念线、1-3 条支线。避免与大纲明显重复的废话线。',
    '输出必须是合法 JSON 数组，格式：[{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": ""}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/**
 * 剧情线进度刷新（批量）。
 *
 * @param count - 本次要判断的线数。单条时问单线进度，多条时要求逐条判断、
 *   name 与输入逐字相同（用于对齐回写，见 plotline-align.ts）。
 */
export function refreshPlotlinesSystemPrompt(count: number): string {
  return [
    count === 1
      ? '你是一位网文剧情线管理员。请根据「剧情线信息」与「本书已写章节摘要/编年录」，判断这条线目前推进到了哪一步。'
      : `你是一位网文剧情线管理员。下面给了 ${count} 条剧情线，请**逐条**判断各自推进到了哪一步。`,
    '每条线输出一句话（30-60 字）：该线当前的状态、最近一次推进发生在第几章、下一步可能的方向。还没开始推进的线，明确说"尚未推进"。',
    count === 1
      ? '输出必须是合法 JSON 对象：{"progress": "一句话"}'
      : `输出必须是合法 JSON 对象：{"items": [{"name": "线名（与输入完全一致）", "progress": "一句话"}]}，items 的条数必须等于 ${count}，name 必须与输入里的线名逐字相同（用于对齐）`,
    '重要：不要输出任何其他文字。',
  ].join('\n')
}

/** 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
export function plotlineHealthSystemPrompt(): string {
  return [
    '你是一位网文剧情架构师。请对本书的「剧情线体系」做健康检查，判断当前是否需要新增剧情线、应在多少章后添加。',
    '评估维度：各线最近推进到第几章（已写章节与关联章节的差值越大越危险）、各线状态、已写章节总数、卷计划当前进度、编年录近期事实。',
    '输出规则：',
    '1. verdict：一句话结论——"需要新增线" / "暂不需要" / "再写 N 章后需要"（N 给出具体章数）。',
    '2. timing：说明建议添加的时机（如：第 25 章前引入新支线，因为主线预计第 22 章告一段落）。',
    '3. reasons：3-5 条依据（引用具体数据：哪条线多少章没推进、已写章节数、卷进度等）。',
    '4. lines：对每条线给健康度——ok（近期推进过）/ warning（超过 5 章未推进）/ stale（超过 10 章未推进或悬置过久）。',
    '输出必须是合法 JSON 对象：{"verdict": "...", "timing": "...", "reasons": ["..."], "lines": [{"name": "线名", "health": "ok|warning|stale", "note": "一句说明"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/** 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
export function plotlinePlanSystemPrompt(): string {
  return [
    '你是一位网文剧情架构师。请为本书设计「下一阶段的剧情方案」：给出未来 5-10 章的剧情方向，并建议 2-3 条值得新增的剧情线。',
    '要求：方向必须结合本书大纲/卷计划/现有线/编年录；新线要能落地（和当前主角处境、已有伏笔、下一阶段舞台相关），不得重复已有线。',
    '输出必须是合法 JSON 对象：{"direction": "下一阶段方向 60-120 字", "suggestions": [{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": "初始进度（可空）"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'plotlines.suggest', description: '剧情线建议：全书资料 → 4-8 条候选线（主/支/人物/悬念）' },
  { id: 'plotlines.refresh', description: '剧情线进度刷新：批量一次请求，name 逐字对齐回写' },
  { id: 'plotlines.health', description: '剧情线健康检查：是否需要新增线、多少章后加' },
  { id: 'plotlines.plan', description: '下一阶段剧情方案：方向 + 2-3 条可落地新线' },
]
