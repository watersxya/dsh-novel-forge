/** 章节写作约束：把写作骨架渲染成可附加到系统提示词末尾的必达/禁止/自查块。 */
export function renderChapterWriterSkeleton(meta: {
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
    '==================== 章节生成骨架（必达 / 禁止 / 输出前自查） ====================',
    '【叙事视角】' + pov,
    '【本章必达】本章必须发生实质变化——局面、关系、信息、风险、决策至少动一项；开篇直接进入情境，不复述上一章。',
    '【禁止事项】不写以总结、复盘、解释为主的段落；不新增核心角色，不写入与上下文冲突的设定；不为凑字数注水。',
    '【篇幅】目标 ' + meta.targetChars + ' 字，区间 ' + meta.minChars + '-' + meta.maxChars + ' 字；不够就继续推进有效情节，不许草草收尾。',
    '【结尾】' + hook,
    '【表达】用具体动作、对话与可感知细节往前推；' + tone,
    '【反 AI】' + antiAi,
    '【输出前自查】逐项确认：读者的回报、关键转折、章末净变化是否看得见？上一章留下的钩子有没有交代？人物的硬事实有没有被写反？确认无误再输出，正文里不要出现核查过程。',
  ].join('\n')
}
