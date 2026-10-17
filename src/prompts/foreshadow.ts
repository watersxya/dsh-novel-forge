/**
 * 伏笔（暗线）域：从大纲与已写信息建议值得埋设的伏笔。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { PromptEntry } from './catalog.ts'

/** System prompt for foreshadow suggestions. */
export function foreshadowSystemPrompt(): string {
  return [
    '你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。',
    '要求：',
    '1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。',
    '2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。',
    '3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。',
    '输出必须是合法 JSON 数组：',
    '[{"description": "伏笔描述", "plantedChapter": 章节号或null, "targetChapter": 章节号或null}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'foreshadow.suggest', description: '伏笔建议：大纲 + 已写信息 → 3-8 条有回收价值的暗线' },
]
