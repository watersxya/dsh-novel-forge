/**
 * 官方提示模板注册表（对齐上游 officialTemplates.ts 的轻量版）。
 *
 * 目标：把高频提示词从内联字符串升级为「可定位、可版本化、可诊断缺组」的资产，
 * 同时保留 writeSystemPrompt 的现有大段上下文注入（道藏/世界观/大纲/资产/伏笔/剧情线），
 * 只在其基础上补充「官方渲染骨架」的必达/禁止/自查块。
 */

export interface OfficialTemplate {
  id: string
  version: string
  /** 需要的 slot 变量（跨层注入点）。 */
  slots: string[]
  /** 需要的上下文分组（缺组时可诊断）。 */
  contextGroups: string[]
  /** system 提示模板（可用 {{slot.*}} 占位，运行时替换）。 */
  system: string[]
  /** human 提示模板（可用 {{context.*}} / {{input.*}} 占位）。 */
  human: string[]
}

/** 章节写作官方模板（system 侧骨架）。 */
const CHAPTER_WRITER_SYSTEM = [
  '你是中文长篇网络小说写作助手。',
  '你的任务是根据当前章节任务，生成可直接阅读的正文，而不是提纲或解释。',
  '',
  '【叙事视角】{{slot.writer.pov}}',
  '',
  '【任务边界】只输出章节正文，不输出标题、提纲、解释或任何额外文本。',
  '',
  '【核心约束】',
  '0. 以本章任务、人物状态、伏笔指令和连续性上下文为准，避免提前揭示未来答案或写到后续章节事件。',
  '1. 必须推进新的剧情动作，本章必须发生实质变化（局面、关系、信息、风险、决策至少一项）。',
  '2. 不得写成总结、复盘、解释性段落为主的章节，正文必须以「正在发生」的内容为主。',
  '3. 不得引入新的核心角色、世界规则或与上下文冲突的重大设定。',
  '',
  '【结构要求】',
  '1. 开头必须迅速进入当前情境，不得长时间铺垫背景或复述上一章。',
  '2. 中段必须出现推进、变化或对抗，不能平铺直叙维持同一状态。',
  '3. 本章至少出现一次明确的「状态变化」（信息反转、局面升级、关系变化、风险上升或计划转向）。',
  '4. {{slot.writer.endingHookPreference}}',
  '',
  '【篇幅要求】',
  '本章目标长度：约 {{input.targetWordCount}} 字；可接受区间：{{input.minWordCount}}-{{input.maxWordCount}} 字。',
  '篇幅不够时必须继续推进新的有效情节、冲突、对话和动作，而不是草率收尾。',
  '禁止靠重复回顾、空泛心理独白、无信息量描写硬凑字数。',
  '',
  '【连续性约束】',
  '1. 章节开头必须与 recent_chapters 明显区分，禁止复用相同开场模式。',
  '2. 允许短回调，但不得大段复述已发生事件，不得复制上下文原句。',
  '3. 必须延续当前人物状态与局面，不得让角色行为失去动机或连续性。',
  '',
  '【表达要求】',
  '1. {{slot.writer.tonePreference}}',
  '2. 优先使用具体动作、对话与可感知细节推进，而不是抽象概述。',
  '3. {{slot.writer.antiAiRules}}',
  '4. 对话应服务推进或冲突，不得成为填充内容。',
  '',
  '【输出前自查】',
  '在生成正文前，先内部确认：读者回报、关键转折和章末净变化是否可见，旧钩子责任是否回应，',
  '结尾钩子是否成立，义务合约是否兑现，人物硬事实是否违背。确认通过后再开始输出，不需要在正文中输出核查结果。',
].join('\n')

/** 章节写作官方模板（human 侧骨架，用于标注任务上下文分组）。 */
const CHAPTER_WRITER_HUMAN = [
  '小说：{{input.novelTitle}}',
  '章节：第 {{input.chapterOrder}} 章 {{input.chapterTitle}}',
  '',
  '【书级合约】{{context.book_contract}}',
  '【章节任务】{{context.chapter_mission}}',
  '【读者体验合同】{{context.reader_experience}}',
  '【人物硬事实】{{context.character_hard_facts}}',
  '【本章义务合约】{{context.obligation_contract}}',
  '【卷级窗口】{{context.volume_window}}',
  '【出场角色子集】{{context.participant_subset}}',
  '【当前局面】{{context.local_state}}',
  '【风格合约】{{context.style_contract}}',
  '【额外写法约束】{{slot.writer.customConstraints}}',
  '',
  '只输出章节正文。',
].join('\n')

export const OFFICIAL_TEMPLATES: Record<string, OfficialTemplate> = {
  'novel.chapter.writer': {
    id: 'novel.chapter.writer',
    version: 'v1',
    slots: [
      'writer.pov',
      'writer.tonePreference',
      'writer.antiAiRules',
      'writer.antiCliché',
      'writer.endingHookPreference',
      'writer.wordCountHint',
      'writer.customConstraints',
    ],
    contextGroups: [
      'book_contract',
      'chapter_mission',
      'reader_experience',
      'character_hard_facts',
      'obligation_contract',
      'volume_window',
      'participant_subset',
      'local_state',
      'style_contract',
    ],
    system: [CHAPTER_WRITER_SYSTEM],
    human: [CHAPTER_WRITER_HUMAN],
  },
}

export function getOfficialPromptTemplate(id: string): OfficialTemplate | null {
  return OFFICIAL_TEMPLATES[id] ?? null
}

export function getOfficialPromptTemplateVersion(id: string): string | null {
  return OFFICIAL_TEMPLATES[id]?.version ?? null
}

/** 轻量稳定哈希（与上游 sha1 对齐精神：内容变化→版本变化）。 */
export function hashPromptTemplate(id: string): string {
  const t = OFFICIAL_TEMPLATES[id]
  if (t === undefined) return ''
  const body = t.system.join('\n') + '\n' + t.human.join('\n')
  let h = 5381
  for (let i = 0; i < body.length; i++) h = ((h << 5) + h + body.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

export function getRequiredTemplateContextGroups(id: string): string[] {
  return OFFICIAL_TEMPLATES[id]?.contextGroups ?? []
}

/** 把官方 writer 骨架渲染成可附加到现有系统提示词末尾的约束/自查块。 */
export function renderOfficialChapterWriterSkeleton(meta: {
  targetChars: number
  minChars: number
  maxChars: number
  pov?: string
  tonePreference?: string
  endingHookPreference?: string
  antiAiRules?: string
}): string {
  const pov = meta.pov ?? '第三人称有限视角，严格跟随主角所见所知。'
  const tone = meta.tonePreference ?? '文风贴合本书设定，用具体细节与动作推进。'
  const hook = meta.endingHookPreference ?? '章末留一个明确的钩子（新信息、新风险或未闭合的选择）。'
  const antiAi = meta.antiAiRules ?? ''
  return [
    '==================== 官方生成骨架（必达 / 禁止 / 输出前自查） ====================',
    '【叙事视角】' + pov,
    '【本章必达】本章必须发生实质变化（局面、关系、信息、风险、决策至少一项）；开头迅速进入情境，禁止复述上一章。',
    '【禁止事项】不得写总结/复盘/解释性段落为主；不得引入新的核心角色或与上下文冲突的设定；不得为空凑字数。',
    '【篇幅】目标 ' + meta.targetChars + ' 字，区间 ' + meta.minChars + '-' + meta.maxChars + ' 字；不够就继续推进有效情节，禁止草草收尾。',
    '【结尾】' + hook,
    '【表达】优先用具体动作、对话与可感知细节推进；' + tone,
    '【反 AI】' + antiAi,
    '【输出前自查】先确认：读者回报、关键转折、章末净变化是否可见，旧钩子责任是否回应，人物硬事实是否违背；确认通过后再输出，正文中不要输出核查结果。',
  ].join('\n')
}
