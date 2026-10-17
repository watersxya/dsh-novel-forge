/**
 * 规划域：分卷规划、章节规划（含续写后缀）、自动导演编排。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { Volume } from '../protocol.ts'
import { renderLengthContract, STRUCTURED_FIELD_LIMITS } from '../output-budget.ts'
import type { PromptEntry } from './catalog.ts'

/** System prompt for volume planning. */
export function volumeSystemPrompt(): string {
  return [
    '你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。',
    '要求：',
    '1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。',
    '2. 卷定位一句话说明该卷的剧情重心。',
    '3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。',
    '输出必须是合法 JSON 数组，不要输出任何其他文字：',
    '[{"no": 1, "title": "卷名", "summary": "卷定位与剧情重心", "chapterStart": 1, "chapterEnd": 80}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    // 长度合同与 resolve 端的截断口径共用一份声明，避免 prompt 与解析漂移。
    renderLengthContract([
      ['卷名', STRUCTURED_FIELD_LIMITS.chapterTitle],
      ['每卷定位', STRUCTURED_FIELD_LIMITS.chapterSummary],
    ]),
  ].join('\n')
}

/** The chapter-planning prompt template. */
export function planSystemPrompt(volumes: Volume[] | undefined): string {
  const volumeBlock = volumes !== undefined && volumes.length > 0
    ? ['\n全书分卷结构（规划章节时需落在对应卷内）：']
      .concat(volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）` +
        (v.strategy !== undefined && v.strategy !== '' ? `\n  卷战略：${v.strategy}` : '') +
        (v.pacing !== undefined && v.pacing !== '' ? `\n  卷节奏板：${v.pacing}` : '')))
      .join('\n')
    : ''
  return [
    '你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。',
    '你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。',
    '要求：',
    '1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。',
    '2. 章节之间要衔接自然，前章结尾为后章埋下钩子。',
    '3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。',
    '4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。',
    '5. 数组每个元素格式：{"title": "章节标题（10字以内，有网文感）", "beats": "结构化剧情要点（150-250字，必须包含四段，段间用换行分隔）：\\n本章目标：本章要完成的核心推进；\\n剧情要点：主要情节的起承转合（2-4 句）；\\n爽点/钩子：本章的爽点兑现或情绪钩子；\\n结尾钩子：本章结尾为下一章埋下的悬念"}',
    '6. 每个章节对象可额外包含以下可选字段（尽量给出，缺失则跳过）：tension（0-100 整数：本章张力目标，对抗/揭示/抉择/代价的强度；铺垫与日常章明显偏低，与相邻章节形成起伏）、mustAdvance（数组，本章必须推进的局面/关系/信息/风险/决策变化）；mustPreserve（数组，本章必须保持不破坏的项）；characterHardFacts（数组，本章不可违背的人物硬事实：身份/阵营/境界/当前位置/知情度）；endingHook（字符串，本章结尾钩子要求）；obligation（字符串，本章义务合约一句话）。',
    '重要：beats 字段内部必须使用 \\n 转义表示换行（JSON 字符串内不得有真实换行符），其余字符串值也不得包含真实换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    volumeBlock,
  ].join('\n')
}

/**
 * 续写规划的附加要求（拼在 planSystemPrompt 之后）。
 *
 * 与 user 侧的「续写硬性要求」分工：这里管**标题与接续的唯一性**，
 * user 侧管「已发生事件不得重写」与全书进度感知。
 */
export function planContinuationSuffix(): string {
  return '\n重要：本次是**续写规划**——已有章节的剧情不得重写或重复，新章节标题不得与已有章节标题相同，新章节的剧情必须从上一章结尾自然接续（人物状态、时间线、地点衔接一致）。'
}

/** 自动导演：整本编排/节奏/风险/再平衡建议（不输出正文）。 */
export function directorSystemPrompt(): string {
  return '你是一位长篇网文自动导演，负责整本编排、节奏、风险与再平衡。只给出可执行建议，不输出正文。'
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'plan.volume', description: '分卷规划：大纲 → 卷计划（定位 + 章节区间）' },
  { id: 'plan.chapter', description: '章节规划：大纲 + 分卷结构 → 结构化章节计划' },
  { id: 'plan.continuation', description: '续写规划附加要求：标题唯一、从上一章结尾接续' },
  { id: 'plan.director', description: '自动导演：下一卷/阶段编排、节奏、风险与再平衡建议' },
]
