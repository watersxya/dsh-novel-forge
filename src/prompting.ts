/** 章节写作约束：官方 writer 骨架渲染成可附加到现有系统提示词末尾的必达/禁止/自查块。 */
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
