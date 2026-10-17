/**
 * 改编域：原文设定卡片分析、改编方案生成、按映射表重写章节。
 *
 * 改编是「结构性改写」而非换词：分析出的可改矩阵 → 用户勾选 → 映射表 +
 * 保留/改变规则 → 逐章重写。提示词同域放一处，改口径时三份一起看。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { PromptEntry } from './catalog.ts'

/** 改编 P0 分析：system 侧只声明角色（指令主体在 user 侧，位置效应更不易被长上下文稀释）。 */
export function adaptationAnalyzeSystemPrompt(): string {
  return '你是改编策划分析助手。'
}

/** 改编 P0 分析：user 侧指令（原文设定卡片 + 可改范围矩阵）。 */
export function adaptationAnalyzeUser(sampleBodies: string[]): string {
  const user = [
    '你是一位资深网文编辑兼改编策划。下面给你一部已完结/连载小说的若干章正文节选。请通读并输出该书的「原文设定卡片」与「可改范围矩阵」。',
    '输出合法 JSON 对象：',
    '{"bookName": "书名", "outline": "一句话主线梗概（100字内）", "dimensions": [{"key":"realm","title":"大世界","mutability":"big|small|free|locked|visual","current":"当前值","evidence":"证据（出现章节/频次）","candidates":[{"name":"候选体系名","desc":"该体系一句话说明"}],"impact":"改了会影响什么","risk":"high|medium|low"}]}',
    'dimensions 至少覆盖以下维度（key/title）：realm 大世界、cultivation 修为体系、protagonist 主角、goldenFinger 金手指、supporting 配角与势力人物名、faction 势力/组织、style 文风与叙事、ending 结局走向、timeline 时间线/编年、foreshadow 伏笔/暗线。',
    'mutability 取值：locked=建议保留、big=可改影响大、small=可改影响小、free=可自由改、visual=仅视觉包装。',
    '每个 dimension.current 必须忠于文本，能引用原文就用原文（尤其角色名/境界名/势力名/金手指名）。',
    '重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。',
  ].join('\n')
  return user + '\n\n' + sampleBodies.join('\n\n---\n\n')
}

/** 改编方案：system 侧角色声明（指令主体在 user 侧）。 */
export function adaptationProposeSystemPrompt(): string {
  return '你是改编策划。'
}

/** 改编方案：user 侧指令 + 用户勾选的改动与已分析的可改矩阵。 */
export function adaptationProposeUser(selLines: string, dimLines: string): string {
  return [
    '下面给出改编决策：用户想改哪些维度、改成什么值。请生成一份可执行的「改编方案」。',
    '要求输出合法 JSON 对象：',
    '{"mappings": [{"source":"原值","target":"新值","scope":"name|realm|faction|term|other","note":"说明"}], "rules": {"preserve":["必须保留的要素"],"change":["允许改变的要素"],"constraints":["改编红线/一致性要求"]}, "impacts": [{"item":"受影响项","detail":"说明","risk":"high|medium|low","chapters":[章号]}]}',
    'mappings 需把用户确认的新值展开为「原→新」条目（如主角名/境界名/势力名/术语），并补充用户未填但关联的必改项（如改了修为体系名，相关的境界名一并列映射）。',
    'rules.preserve 至少包含：故事骨架、人物动机、伏笔逻辑、爽点结构。',
    'impacts 列出每个改动会影响的内容（术语/角色/章节/伏笔），能定位章号尽量定位；无法定位则给章节区间提示。',
    '重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。',
    '',
    '用户要改：',
    selLines,
    '',
    '原文可改矩阵（已分析）：',
    dimLines,
  ].join('\n')
}

/** 改编重写：按映射表与规则把一章正文结构性重写（不只是换词）。 */
export function adaptationRewriteSystemPrompt(): string {
  return [
    '你是一位资深网文改编编剧。你会收到某一章的正文，以及本书的改编映射表与改编规则。',
    '任务：把这一章按改编方案**重写**成新版本（结构性改编，不只是换词）。',
    '要求：',
    '1. 严格遵守映射表（原值→新值），正文中所有源值都要替换为新值；涉及改名/改体系/改势力时，相关表述一起调整，使上下文自洽。',
    '2. 改编规则：必须保留的内容不得破坏（故事骨架/人物动机/伏笔逻辑/爽点结构）；允许改变的内容可以放开调整；红线/一致性要求必须遵守。',
    '3. 若某个改动牵动叙事（如结局走向/时间线/世界观），要把这章的叙述顺势改得通顺、可信。',
    '4. 输出**只包含这一章重写后的正文**，不要重复标题，不要任何解释、开头或结尾。',
    '5. 字数与原章基本相当（允许 ±20%）。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'adapt.analyze', description: '改编 P0：正文节选 → 原文设定卡片 + 可改范围矩阵' },
  { id: 'adapt.propose', description: '改编方案：用户勾选 → 映射表 + 保留/改变规则 + 影响清单' },
  { id: 'adapt.rewrite', description: '改编重写：按映射表把一章结构性重写（非换词）' },
]
