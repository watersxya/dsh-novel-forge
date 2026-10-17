/**
 * 大世界域：结构化设定（境界体系/地理区域/势力分布）的渲染与提炼。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { WorldState } from '../protocol.ts'
import type { PromptEntry } from './catalog.ts'

/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
export function renderWorld(world: WorldState | undefined): string {
  if (world === undefined) return ''
  const sections: string[] = ['==================== 大世界（结构化设定，写作时严格遵守） ====================']
  if (world.realms.length > 0) {
    sections.push('境界体系（由低到高，不得随意跳级或自创境界）：')
    world.realms.forEach((realm, i) => {
      sections.push(`${i + 1}. ${realm.name}${realm.description !== '' ? ` — ${realm.description}` : ''}`)
    })
  }
  if (world.regions.length > 0) {
    sections.push('地理区域：')
    for (const region of world.regions) {
      sections.push(`- ${region.name}${region.description !== '' ? `：${region.description}` : ''}${region.faction !== undefined && region.faction !== '' ? `（势力：${region.faction}）` : ''}`)
    }
  }
  if (world.factions.length > 0) {
    sections.push('势力分布：')
    for (const faction of world.factions) {
      sections.push(`- ${faction.name}（${faction.kind}）${faction.description !== '' ? `：${faction.description}` : ''}${faction.region !== undefined && faction.region !== '' ? `（驻地：${faction.region}）` : ''}`)
    }
  }
  return sections.join('\n')
}

/** 大世界提炼：从大纲 + 道藏生成结构化境界体系/区域/势力。 */
export function extractWorldSystemPrompt(): string {
  return [
    '你是一位网文世界观架构师。请根据小说大纲与道藏，提炼结构化「大世界」数据。',
    '输出必须是合法 JSON 对象：',
    '{"realms": [{"name": "境界名", "description": "突破条件/寿命/标志等"}], "regions": [{"name": "区域名", "description": "描述", "faction": "关联势力名或空"}], "factions": [{"name": "势力名", "kind": "宗门/家族/王朝/组织等", "description": "描述", "region": "驻地区域或空"}]}',
    '要求：',
    '1. realms 按由低到高顺序排列（修仙题材必须含完整境界链；无境界设定的题材可输出空数组）。',
    '2. 数量贴合大纲：realms 3-12 个，regions 2-10 个，factions 2-10 个。',
    '3. 内容严格来自大纲与道藏，不要凭空发明与大纲冲突的设定。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'world.render', description: '大世界结构化设定渲染为写作提示词块（境界按序强约束）' },
  { id: 'world.extract', description: '从大纲与道藏提炼结构化大世界（境界/区域/势力）' },
]
