/**
 * 市场域：题材雷达（榜单信号 → 生产底座）、雷达灵感、作品简介。
 *
 * 三份提示词共享同一条纪律：**严禁复用榜单作品的人名/专有设定/简介句子/
 * 完整书名**，只能提炼读者需求、爽点机制与结构机会——市场雷达是拿来
 * 找方向的，不是拿来抄的。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { PromptEntry } from './catalog.ts'

/** 市场雷达系统提示（分析师角色与输出纪律）。 */
export function marketRadarSystemPrompt(): string {
  return [
    '你是中文网络文学市场分析师。只分析输入中的公开榜单元数据或用户给出的市场线索，不补写作品正文，不假装知道未提供的信息。',
    '只根据输入归纳热门题材和市场信号；对未提供的信息不要臆测。',
    '重点分析：热门题材组合、主角身份、金手指机制、开篇危机、关系卖点、标题句式、拥挤套路和差异化机会。',
    'kind 只能使用 genre、protagonist、advantage、opening、relationship、title_pattern、opportunity、crowding，不得创造近义枚举值。',
    '榜单高频不等于适合照搬。机会建议必须说明读者满足点，同时避开直接复制具体作品。',
    'productionFoundation 的题材/推进模式优先引用「资源库」中已有的 existingId（名称一字不差）；只有确无合适资产时才给出新资产（existingId 为 null）。',
    'creativeBrief 严禁复用榜单作品的人名、专有设定、简介句子和完整书名；只能提炼读者需求、爽点机制和结构机会，不得输出任何具体人名/作品名，一律使用身份或通用场景称谓。',
  ].join('\n')
}

/** 雷达→灵感：基于市场信号/生产底座/创意简报，生成贴合市场的开书灵感。 */
export function marketIdeaInspirationSystemPrompt(): string {
  return [
    '你是中文网文开书灵感策划，擅长从市场榜单分析中提炼可开书方向。',
    '严禁输出具体人名/作品名；用身份/通用称谓。每个创意都要有明确钩子、题材、视角、长期兑现，且要与市场分析呼应但做差异化。',
  ].join('\n')
}

/** 作品简介：面向读者的门面（卖点 + 开局钩子，不剧透）。 */
export function blurbSystemPrompt(): string {
  return [
    '你是一位网文平台编辑，擅长写抓人的作品简介。',
    '要求：',
    '1. 120-250 字，突出核心卖点（金手指/题材/爽点/人设反差），用一两句抛出开局钩子。',
    '2. 不剧透结局与关键反转；语气贴合题材（热血/悬疑/轻松/虐心）。',
    '3. 中文，直接输出简介正文，不要 Markdown、不要引号包裹、不要「简介：」前缀。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'market.radar', description: '题材雷达：榜单信号 → 生产底座 + 开书创意（禁抄作品）' },
  { id: 'market.idea-inspiration', description: '雷达灵感：市场信号 + 创意简报 → 差异化开书方向' },
  { id: 'market.blurb', description: '作品简介：120-250 字门面（卖点 + 钩子，不剧透）' },
]
