/**
 * 润色域：整章去 AI 味润色、局部段落修订。
 *
 * 两者都按分层组装：润色口径与合规红线排最前（永不变），本书红线与写法
 * 资产排后面（只随作者编辑变）——见 prompt-cache.ts。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { ProjectState } from '../protocol.ts'
import { assemblePromptBlocks, type PromptBlock } from '../prompt-cache.ts'
import { renderAllAssets } from '../assets.ts'
import { COMPLIANCE_REDLINES } from './common.ts'
import type { PromptEntry } from './catalog.ts'

/** The de-AI-ify polish system prompt (with project writing assets injected). */
export function polishSystemPrompt(project: ProjectState): string {
  const assetsBlock = renderAllAssets(project.assets)
  const bible = project.bible
  // 分层组装（见 prompt-cache.ts）：润色口径与合规红线永不变，排最前；本书红线与
  // 写法资产只随作者编辑变，排后面。
  const blocks: PromptBlock[] = []
  const fixed: string[] = [
    '你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：',
    '1. 删除/替换 AI 高频套话与模式词：如"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""默默""似乎""终于"等滥用。',
    '2. 把书面翻译腔改成口语化的中文网文语感。',
    '3. 拆分过长的排比句与堆砌的修饰语。',
    '4. 保留全部情节、人物、对话内容、已确立事实不变，只改表达。',
    '5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。',
    '6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。',
    '7. 必须遵守下方「内容合规红线」与「本书红线」（如有），任何一条命中（含影射、暗示）都必须避免。',
    '内容合规红线（平台硬性要求，最高优先级）：',
    COMPLIANCE_REDLINES.join('\n'),
  ]
  blocks.push({ layer: 'fixed', text: fixed.join('\n') })
  const book: string[] = []
  if (bible !== undefined && bible.redLines.length > 0) {
    book.push('本书红线：\n' + bible.redLines.map(r => '- ' + r).join('\n'))
  }
  if (assetsBlock !== '') book.push(assetsBlock)
  blocks.push({ layer: 'book', text: book.join('\n') })
  return assemblePromptBlocks(blocks)
}

/**
 * 局部修订（只改一个自然段）的系统提示。
 *
 * 与整章修订的区别：不套用字数区间、不注入全书资料（大纲/资产/时间线），
 * 只带合规红线、本书红线、反 AI 套话口径与角色卡——局部改写要的是「表达
 * 卫生」，不是重新生成。同样按分层组装（约束口径排最前）。
 */
export function localRevisionSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const blocks: PromptBlock[] = []
  blocks.push({
    layer: 'fixed',
    text: [
      '你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。',
      '硬性约束：',
      '1. 只改表达，不改情节走向、人物设定、已确立事实、对话核心内容。',
      '2. 必须遵守下方「内容合规红线」，任何一条命中（含影射、暗示）都必须避免。',
      '3. 必须遵守下方「本书红线」（如有）。',
      '4. 避免 AI 套话：不禁、仿佛、一时间、不由得、顿时、然而、缓缓、轻轻、微微、默默、似乎、终于等滥用。',
      '5. 保留角色口吻与性格，角色行为需符合下方角色卡（如有）。',
      '6. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。',
      '内容合规红线（平台硬性要求，最高优先级）：',
      COMPLIANCE_REDLINES.join('\n'),
    ].join('\n'),
  })
  const book: string[] = []
  if (bible !== undefined) {
    if (bible.redLines.length > 0) book.push('本书红线：\n' + bible.redLines.map(r => '- ' + r).join('\n'))
    if (bible.characters.length > 0) {
      book.push('相关角色卡：')
      for (const card of bible.characters) {
        book.push('- ' + card.name + '（' + card.role + '）：' + card.traits.join('、'))
      }
    }
  }
  blocks.push({ layer: 'book', text: book.join('\n') })
  return assemblePromptBlocks(blocks)
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'polish.chapter', description: '整章去 AI 味润色：套话清理/翻译腔/排比拆分，情节事实不变' },
  { id: 'polish.local', description: '局部段落修订：只改表达不改情节，带红线与角色卡约束' },
]
