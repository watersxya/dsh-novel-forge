/**
 * 拆书与摘要域：源片段笔记、分节分析、单章摘要、书分析。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { PromptEntry } from './catalog.ts'

/** 拆书阶段一：单章正文 → 结构化笔记（供后续章节级分析复用）。 */
export function breakdownNoteSystemPrompt(): string {
  return [
    '你是中文网文拆书助手。把单章正文整理成结构化笔记，供后续章节级分析复用。',
    '只输出 JSON 对象：',
    '{"summary": "1-2句", "plotPoints": ["..."], "characters": ["..."], "worldbuilding": ["..."], "styleTechniques": ["..."], "marketHighlights": ["..."], "weaknessSignals": ["..."]}',
    '硬规则：只提取正文明确出现的信息；每数组最多 4 项；不要补写原文外的动机/意图；evidence 不在此阶段输出。',
    '重要：直接输出 JSON，不要输出其他文字；字符串内不含换行。',
  ].join('\n')
}

/** 拆书分节配置项。 */
export interface BreakdownSection {
  key: string
  title: string
  focus: string
  system: string
}

/**
 * 拆书阶段二：分节分析配置。
 *
 * @param preset - quick（总览/剧情/人物/文风）| standard（+ 商业化卖点）。
 */
export function breakdownSections(preset: 'quick' | 'standard'): BreakdownSection[] {
  const sections: BreakdownSection[] = [
    {
      key: 'overview',
      title: '拆书总览',
      focus: '一句话定位、题材标签、整体优势与短板',
      system: [
        '你是资深中文网文拆书分析师，负责《拆书总览》小节。',
        '基于给定章节笔记做低风险综合判断，输出 JSON：{"markdown": "可直接展示的分析稿（简体中文，先给结论再说明体现在哪、为何成立）", "structured": {"oneLinePositioning": "一句话定位", "genreTags": ["题材标签"], "sellingPointTags": ["卖点标签"], "strengths": ["整体优势"], "weaknesses": ["整体短板"]}}',
        '硬规则：只基于笔记归纳；推断用「更偏向/可能」等谨慎措辞；证据不足写「材料不足」；不虚构原文细节。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'plot',
      title: '剧情结构',
      focus: '主线梗概、阶段推进、冲突升级、节奏风险',
      system: [
        '你是资深中文网文拆书分析师，负责《剧情结构》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"mainlineSummary": "主线梗概", "phaseProgressions": ["阶段推进"], "escalationDesigns": ["冲突升级"], "paceRisks": ["节奏风险"], "reusablePatterns": ["可复用套路"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'character',
      title: '人物系统',
      focus: '主角定位、配角功能、关系网络、成长弧线、辨识度风险',
      system: [
        '你是资深中文网文拆书分析师，负责《人物系统》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"protagonistPositioning": "主角定位", "supportingFunctions": ["配角功能"], "relationshipNetwork": ["关系网络"], "growthArcs": ["成长弧线"], "clarityRisks": ["辨识度风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'style',
      title: '文风与技法',
      focus: '叙事视角、语言风格、描写方式、节奏控制、钩子设计、可复用写法',
      system: [
        '你是资深中文网文拆书分析师，负责《文风与技法》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"narrativePov": "叙事视角", "languageStyle": "语言风格", "dialoguePatterns": ["对话特征"], "rhythmControl": ["节奏控制"], "hookDesigns": ["钩子设计"], "reusableTechniques": ["可复用写法"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
  ]
  if (preset === 'standard') {
    sections.push({
      key: 'market',
      title: '商业化卖点',
      focus: '读者爽点、点击驱动、人物/题材卖点、商业化风险',
      system: [
        '你是资深中文网文拆书分析师，负责《商业化卖点》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"hookPoints": ["读者爽点"], "clickDrivers": ["点击驱动"], "characterSellingPoints": ["人物卖点"], "genreSellingPoints": ["题材卖点"], "commercialRisks": ["商业化风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    })
  }
  return sections
}

/** 单章摘要（叙事记忆）：供后续章节写作时保持连贯性。 */
export function chapterSummarySystemPrompt(): string {
  return [
    '你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。',
    '摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。',
    '用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。',
  ].join('\n')
}

/** 书分析/拆书：输入一本书/章节文本 → 卖点/结构/可借鉴点/风险。 */
export function bookAnalysisSystemPrompt(): string {
  return [
    '你是资深中文网文拆书编辑。分析输入的一本书或章节文本，提炼可复用的创作思路。',
    '严禁照搬具体作品的人名/专有设定/简介句子；只能提炼读者需求、结构手法和风险。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'digest.note', description: '拆书笔记：单章正文 → 结构化笔记（只提取明确出现的信息）' },
  { id: 'digest.sections', description: '拆书分节：总览/剧情/人物/文风（standard 加商业化卖点）' },
  { id: 'digest.chapter-summary', description: '单章摘要：120-200 字叙事记忆（客观陈述不评价）' },
  { id: 'digest.book-analysis', description: '书分析：一本书/章节文本 → 卖点/结构/手法/风险' },
]
