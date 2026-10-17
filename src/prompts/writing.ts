/**
 * 写作域：正文生成、整章修订、续写补齐的系统提示。
 *
 * ## 分层组装（缓存命中的纪律）
 *
 * 同一本书的连续多次调用里，输入的大部分是重复的，但各块的变化频率差着量级：
 * 固定层（写作硬性要求 + 合规红线）永不变；本书层（道藏/世界/大纲/资产/槽位）
 * 只随作者编辑变；本章层（伏笔/剧情线/骨架/时间线/张力）随创作进度逐章变。
 * 厂商的输入缓存按**前缀**命中——顺序写死在 prompt-cache.ts，调用方只标层。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { ProjectState } from '../protocol.ts'
import { assemblePromptBlocks, type PromptBlock } from '../prompt-cache.ts'
import { renderAllAssets } from '../assets.ts'
import { renderPromptSlots } from '../prompt-slots.ts'
import { renderNameBank } from '../name-forge.ts'
import { renderChapterWriterSkeleton } from '../prompting.ts'
import { renderTimelineBlock } from '../timeline.ts'
import { renderTensionBlock } from '../tension.ts'
import { COMPLIANCE_REDLINES } from './common.ts'
import { renderWorld } from './world.ts'
import type { PromptEntry } from './catalog.ts'

/** Build the writing system prompt (bible + outline + active foreshadows).
 *  `targetChars` 来自每章计划（规划时快照，= 设置的每章目标字数）；无则退回默认 3500。
 *  字数区间按目标动态生成（±15%，取整到百位），避免系统提示词与设置互相冲突。
 *  `lengthRule` 可覆盖第 1 条字数要求（整章修订/改编时按原文长度为准）。 */
export function writeSystemPrompt(project: ProjectState, targetChars?: number, lengthRule?: string, beforeChapter?: number): string {
  const bible = project.bible
  // 分层组装（见 prompt-cache.ts）：固定规则排最前、本书资料居中、本章动态内容垫尾，
  // 跨章调用时重复前缀才有机会命中厂商输入缓存。块内文案与原逐段组装完全一致，只调顺序。
  const blocks: PromptBlock[] = []

  // ---- 固定层：永不变，排最前 ----
  const target = targetChars !== undefined && targetChars > 0 ? targetChars : 3500
  const lo = Math.max(1000, Math.round((target * 0.85) / 100) * 100)
  const hi = Math.max(lo + 100, Math.round((target * 1.15) / 100) * 100)
  const rules: string[] = ['写作硬性要求：']
  rules.push(lengthRule ?? `1. 每章 ${lo}-${hi} 字（目标 ${target} 字，按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。`)
  rules.push('2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。')
  rules.push('3. 尊重大纲与道藏：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。')
  rules.push('4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。')
  rules.push('5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。')
  rules.push('6. 对话与冲突密度：每章至少 1 处实质对话或正面对抗/交锋场面；推理与心理活动必须用动作、环境细节、微表情、对话呈现，禁止整章纯内心独白铺陈（禁止"解说式"交代线索）。')
  rules.push('7. 反派与对手的行动力：本章出现的反派/对手必须有其行动、反制或压迫感（布局、试探、追索、交锋至少占其一），不得作为纯背景板存在。')
  rules.push('8. 配角辨识度：重要新登场配角应给姓名或可辨识的独有特征；禁止通篇用"瘦高个/灰衣人/戴面具者"等身形标签代称同一角色。')
  rules.push('9. 信息呈现方式：关键线索、设定、局势通过对话、动作、发现物呈现，禁止主角内心"讲解"给读者听。')
  blocks.push({ layer: 'fixed', text: rules.join('\n') })
  blocks.push({
    layer: 'fixed',
    text: [
      '==================== 内容合规红线（平台硬性要求，最高优先级，违反即失败） ====================',
      COMPLIANCE_REDLINES.join('\n'),
      '以上九条为硬性底线，任何情况下不得以任何形式出现或影射；若剧情确需涉及（如批判、反讽），只能以明确否定、揭露、批判的立场呈现，且不得展开细节。',
    ].join('\n'),
  })

  // ---- 本书层：只随作者编辑变，一章一次生成里不变 ----
  const book: string[] = []
  if (bible !== undefined) {
    book.push('==================== 道藏（写作时严格遵守） ====================')
    if (bible.genre !== '') book.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) book.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    // 角色上下文：角色库（主表）与道藏角色卡合并去重，避免两份重复注入、互相打架。
    const roleLib = project.roles ?? []
    const labelName = { protagonist: '主角', female_lead: '女主', female_support: '女配', support: '配角', antagonist: '反派', extra: '路人' }
    const seenRole = new Set<string>()
    const mergedRoles: string[] = []
    for (const r of roleLib) {
      seenRole.add(r.name)
      const card = bible.characters.find(c => c.name === r.name)
      const traits = card !== undefined ? card.traits : (Array.isArray(r.traits) ? r.traits : [])
      const goals = card !== undefined && card.goals !== '' ? card.goals : r.goals
      const relations = card !== undefined && card.relations !== '' ? card.relations : (Array.isArray(r.relations) && r.relations.length > 0 ? r.relations.join('、') : '')
      mergedRoles.push(`- ${r.name}（${labelName[r.roleLabel]}）：${r.identity}${traits.length > 0 ? `；性格：${traits.join('、')}` : ''}${goals !== '' ? `；目标：${goals}` : ''}${relations !== '' ? `；关系：${relations}` : ''}`)
      if (card !== undefined && Array.isArray(card.knowledge) && card.knowledge.length > 0) {
        mergedRoles.push(`  已知信息（该角色知道的：${card.knowledge.join('；')}；未列出的信息该角色一律不知道，不得写其知晓或提及）`)
      }
    }
    for (const card of bible.characters) {
      if (seenRole.has(card.name)) continue
      seenRole.add(card.name)
      const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
      mergedRoles.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
      if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
        mergedRoles.push(`  已知信息（该角色知道的：${card.knowledge.join('；')}；未列出的信息该角色一律不知道，不得写其知晓或提及）`)
      }
    }
    if (mergedRoles.length > 0) {
      book.push('角色卡（角色库与道藏已合并去重）：')
      book.push(...mergedRoles)
    }
    if (bible.redLines.length > 0) book.push('写作红线（违反即失败）：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) book.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  const worldBlock = renderWorld(project.world)
  if (worldBlock !== '') book.push(worldBlock)
  book.push('==================== 全书大纲 ====================')
  // 超长大纲截断保护（防止上下文超限）；完整大纲在总纲页查看。
  const outlineBlock = project.outline.length > 6000
    ? project.outline.slice(0, 6000) + '\n…（大纲过长已节选，完整内容见总纲页）'
    : project.outline
  book.push(outlineBlock)
  book.push('==================== 大纲结束 ====================')
  const assetsBlock = renderAllAssets(project.assets, project.styleProfile)
  if (assetsBlock !== '') book.push(assetsBlock)
  // 作者自定义槽位（只影响表达方式，不覆盖道藏/红线/合规）。
  const slotBlock = renderPromptSlots(project)
  if (slotBlock !== '') book.push(slotBlock)
  // 已定名资产（取名器采纳的名字）：本书层，只随作者采纳变。
  const nameBlock = renderNameBank(project)
  if (nameBlock !== '') book.push(nameBlock)
  blocks.push({ layer: 'book', text: book.join('\n') })

  // ---- 本章层：随创作进度逐章变，垫尾 ----
  const chapter: string[] = []
  const active = project.foreshadows.filter(f => f.status === 'planted' || f.status === 'progressing')
  if (active.length > 0) {
    chapter.push('==================== 活跃伏笔（近期需推进或回收的线索） ====================')
    for (const f of active) {
      chapter.push(`- [${f.status === 'planted' ? '已埋设' : '推进中'}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  if (lines.length > 0) {
    const kindName = { main: '主线', branch: '支线', character: '人物线', mystery: '悬念线' }
    chapter.push('==================== 剧情线（本章应推进至少一条活跃线） ====================')
    for (const l of lines) {
      chapter.push(`- [${kindName[l.kind]}${l.status === 'paused' ? '·暂停中' : ''}] ${l.name}：${l.goal}${l.progress !== '' ? `（当前进度：${l.progress}）` : ''}`)
    }
  }
  chapter.push(renderChapterWriterSkeleton({
    targetChars: target,
    minChars: lo,
    maxChars: hi,
    pov: '第三人称有限视角，严格跟随主角所见所知。',
    endingHookPreference: '章末留一个明确钩子（新信息、新风险或未闭合选择）。',
    tonePreference: '动作、对话、心理交替推进；重大信息用对话/动作/发现呈现。',
    antiAiRules: '严格遵循上方「反 AI 规则」与写法资产，避免套话与 AI 腔。',
  }))
  // 故事时间线锚点：只注入本章之前的事件（回写旧章时不被后续章节剧透）。
  const timelineBlock = renderTimelineBlock(project, beforeChapter ?? Number.MAX_SAFE_INTEGER)
  if (timelineBlock !== '') chapter.push(timelineBlock)
  // 本章张力（目标值 + 参考曲线位置）：写作时把握松紧。
  if (beforeChapter !== undefined) {
    const tensionBlock = renderTensionBlock(project, beforeChapter)
    if (tensionBlock !== '') chapter.push(tensionBlock)
  }
  blocks.push({ layer: 'chapter', text: chapter.join('\n') })

  return assemblePromptBlocks(blocks)
}

/** Build the rewrite system prompt (fix review issues / instructions). */
export function rewriteSystemPrompt(project: ProjectState, targetChars?: number, beforeChapter?: number): string {
  // 整章修订以「与原文相当」为准，不套用目标字数区间（避免与原文长度冲突）。
  const base = writeSystemPrompt(project, targetChars, '1. 输出完整的新正文（不要只输出修改片段、标题、章回名、作者的话或任何 Markdown 标记），字数与原章相当（允许 ±20%）。', beforeChapter)
  return base + '\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。'
}

/**
 * 正文续写补齐的附加要求（拼在 writeSystemPrompt 之后）。
 *
 * 触发场景：生成的正文不足目标字数 90% 时，最多补两轮。
 */
export function bodyContinuationSuffix(): string {
  return '\n\n【续写任务】严格承接已有正文往下写，不要重复已有内容、不要重写开头、不要总结前文，直接续写新情节，并在结尾留一个章末钩子。'
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'writing.chapter', description: '正文生成：三层组装（硬性要求/合规红线 → 道藏世界大纲资产 → 本章伏笔剧情线张力）' },
  { id: 'writing.rewrite', description: '整章修订：正文生成提示 + 「只改需改处、字数与原章相当」' },
  { id: 'writing.continuation', description: '续写补齐附加要求：承接已有正文、不重写不总结、留章末钩子' },
]
