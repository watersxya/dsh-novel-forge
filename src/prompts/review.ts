/**
 * 审稿域：章节审稿（九维）、修订验证、作者复盘、验证模式道藏注入。
 *
 * 审稿是逐章连打的动作，固定层（审稿口径 + 合规红线）排最前、本书层
 * （道藏/资产）排后面——前缀稳定才有机会命中厂商输入缓存（见 prompt-cache.ts）。
 *
 * 本文件同时是提示词注册表的域模块之一（见 catalog.ts）。
 */

import type { ProjectState } from '../protocol.ts'
import { assemblePromptBlocks, type PromptBlock } from '../prompt-cache.ts'
import { renderAllAssets } from '../assets.ts'
import { COMPLIANCE_REDLINES } from './common.ts'
import type { PromptEntry } from './catalog.ts'

/** The review system prompt. */
export function reviewSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  // 分层组装（见 prompt-cache.ts）：审稿口径与合规红线永不变，排最前；道藏与资产
  // 只随作者编辑变，排后面——审稿是逐章连打的动作，前缀稳定才有机会命中输入缓存。
  const blocks: PromptBlock[] = []
  const fixed: string[] = [
    '你是一位严格的网文审稿编辑。你会收到一章正文以及本书的道藏与红线。',
    '请从以下维度审查本章：',
    '1. 人设一致性：角色行为是否符合下方角色卡的设定（性格/目标/知情度/说话方式）。',
    '2. 设定一致性：金手指规则、战力体系、世界观是否与道藏冲突。',
    '3. 红线检查：是否触犯下方「本书红线」与「内容合规红线」。',
    '4. 文笔质量：语病、翻译腔、AI 套话（"不禁""仿佛""一时间"等高频词滥用）、流水账。',
    '5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。',
    '6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。',
    '7. 反 AI 规则：下方「本地 AI 味扫描」里已给出**本轮确定性命中的规则与次数**，直接以它为事实依据判级（禁止类命中即列为问题；鼓励类只作低优先级建议、不阻塞通过）。未列出的规则说明本章无确定性命中，不必逐条复述，也不要凭印象补报。',
    '8. 呈现方式：整章是否纯内心推理铺陈（无对话/无对抗，推理全靠解说）；反派是否纯背景板无行动；重要配角是否无名标签化（瘦高个/灰衣人全程代称）——命中即列为问题。',
    '9. 内容合规（最高优先级）：逐条核对下方「内容合规红线」，任何一条命中（含影射、暗示、详细描写）必须列为 high，并给出改写建议。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"score": 0-100的整数, "riskScore": 0-100的整数(越高越需人工处理,可结合本地AI味指数), "tension": 0-100的整数(本章张力强度:对抗/揭示/抉择/代价;铺垫与日常章应明显偏低), "verdict": "一句话总评", "issues": [{"severity": "high|medium|low", "dimension": "character|setting|redline|writing|pacing|logic|anti-ai|presentation|compliance", "item": "问题描述", "suggestion": "修改建议", "ruleName": "命中的反AI规则名(见反AI规则清单)", "ruleType": "forbidden|risk|encourage", "category": "套话|句式|段落|心理|设定|节奏|对话|其他", "excerpt": "命中的原文摘录(不超过50字)", "reason": "判定理由", "canAutoRewrite": true|false}]}',
    'tension 是本章张力强度评分（不是质量分）：对决/揭秘/生死抉择偏高，铺垫章、日常章、过渡章偏低；同一本书内保持同一尺度。',
    '反 AI 类 issue 尽量给出 ruleName/ruleType/category/excerpt/reason/canAutoRewrite，便于统计与自动改写。',
    '风格符合度：若下方给出「风格指纹比对」，以它为准判断本章是否偏离绑定写法——偏差显著时按 writing 维度、category 用「风格」上报；比对里说没有显著偏差时，不要报风格问题。',
    'AI 套话高频模板词示例（集中出现必须整体降密度）：仿佛、似乎、极其、完美、深不见底、形成了、莫名、无法形容、难以言喻、精心雕琢、肤光胜雪、眉目如画、歌舞升平、觥筹交错、妙语连珠、不可名状、另一层真相、命运、真相。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
    '==================== 内容合规红线（平台硬性要求，最高优先级） ====================',
    COMPLIANCE_REDLINES.join('\n'),
    '以上九条为硬性底线：正文中任何一条命中（含影射、暗示、详细展开）都必须列为 high，并给出改写建议；作者自定义红线不得豁免这九条。',
  ]
  blocks.push({ layer: 'fixed', text: fixed.join('\n') })
  const book: string[] = []
  const assetsBlock = renderAllAssets(project.assets, project.styleProfile)
  if (assetsBlock !== '') book.push('\n' + assetsBlock)
  if (bible !== undefined) {
    book.push('\n==================== 道藏 ====================')
    if (bible.worldRules.length > 0) book.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      book.push('角色卡：')
      for (const card of bible.characters) {
        book.push(`- ${card.name}（${card.role}）：${card.traits.join('、')}`)
        if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
          book.push(`  该角色知道：${card.knowledge.join('；')}（未列出的信息该角色不知道）`)
        }
      }
    }
    if (bible.redLines.length > 0) book.push('红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  blocks.push({ layer: 'book', text: book.join('\n') })
  return assemblePromptBlocks(blocks)
}

/** 验证模式系统提示：修订后逐条核对原意见是否解决，只挑新增 high，不重复挑剔主观项。 */
export function verifySystemPrompt(project: ProjectState): string {
  return [
    '你是一位网文审稿验证员。作者已按上一轮审稿意见修订了本章，你需要验证修订效果。',
    '你的任务（严格按此执行）：',
    '1. 逐条核对「上一轮意见」中的每一条（按编号 1、2、3...）是否已在修订稿中解决。',
    '2. 只挑修订【新引入】的 high 级问题（设定矛盾/逻辑硬伤/事实错误）——新引入的 medium/low 主观项（文笔/套话/节奏）不要列。',
    '3. 禁止重复挑剔上一轮已指出且本次已解决的主观项（如"缓缓/微微"等套话、错别字）——即使换个说法再提也不行。',
    '4. 严禁为了显得专业而新增"换一批毛病"式的意见。',
    '输出必须是合法 JSON 对象，包含以下字段：',
    '- resolvedIds：已解决的上一轮意见编号数组（如 [1, 3, 5]）。',
    '- unresolvedIds：未解决或部分解决的上一轮意见编号数组（如 [2, 4]）。',
    '- issues：未解决的原意见 + 新引入的 high 级问题列表（格式同审稿：severity/item/suggestion）。未解决的原意见 item 需注明"未解决(编号N)：原意见摘要"。',
    '- score：按修订稿整体质量给 50-90 分（解决全部 high 且无新增 high 时给 70 以上）。',
    '- verdict：一句话结论。',
    '完整格式：{"resolvedIds": [1,3], "unresolvedIds": [2], "score": 75, "verdict": "一句话", "issues": [{"severity": "high", "dimension": "character|setting|redline|writing|pacing|logic|anti-ai|presentation|compliance", "item": "未解决(2)：xxx", "suggestion": "xxx"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
    renderBibleForVerify(project),
  ].join('\n')
}

/**
 * 验证模式下注入道藏。
 *
 * 原实现是 `JSON.stringify(project.bible).slice(0, 3000)`——有两个问题：
 * 1. **腰斩的 JSON 不是 JSON**：`slice` 从中间切断，审稿员会看到语法残缺的
 *    对象（字符串没闭合、数组没结尾），既浪费 token 又可能误读设定。
 * 2. **静默截断设定**：世界规则/角色卡排在后面的字段最先被切掉，而那恰恰是
 *    核对设定冲突最需要的部分。
 *
 * 改为结构化渲染 + 按「世界规则/角色/红线」分配独立预算。
 */
export function renderBibleForVerify(project: ProjectState): string {
  const bible = project.bible
  if (bible === undefined) return '本书道藏（核对设定冲突用）：\n（无）'
  const parts: string[] = []
  if (bible.worldRules.length > 0) parts.push(`世界规则：\n${bible.worldRules.map(r => `- ${r}`).join('\n')}`)
  if (bible.characters.length > 0) {
    parts.push(`角色卡：\n${bible.characters.map(c => {
      const goals = c.goals !== '' ? `；目标：${c.goals}` : ''
      const rel = c.relations !== '' ? `；关系：${c.relations}` : ''
      return `- ${c.name}：${c.traits.join('、')}${goals}${rel}`
    }).join('\n')}`)
  }
  if (bible.redLines.length > 0) parts.push(`红线：\n${bible.redLines.map(r => `- ${r}`).join('\n')}`)
  if (parts.length === 0) return '本书道藏（核对设定冲突用）：\n（无）'
  // 总预算兜底：道藏极端庞大时仍要防止撑爆上下文，但截断显式化而非静默腰斩。
  const block = parts.join('\n')
  const limit = 6000
  const body = block.length > limit
    ? block.slice(0, limit) + `\n…（道藏过长已节选，但角色名/世界规则已尽量保留；如需完整设定请查总纲页）`
    : block
  return `本书道藏（核对设定冲突用）：\n${body}`
}

/** Build the author-review system prompt (narrative structure, not prose). */
export function authorReviewSystemPrompt(): string {
  return [
    '你是一位网文作者复盘助手。你会收到：本章正文、上一章结尾（钩子）、上一章作者复盘（如有）、活跃剧情线与编年录近期事实。',
    '请从叙事结构层面复盘本章（不评文笔，那是审稿的事）：',
    '1. hookHonored：上一章结尾的钩子/悬念是否在本章兑现或推进（true/false）。',
    '2. hookNote：钩子兑现情况一句话；未兑现时说明并给出"建议在第几章补"的建议。',
    '3. endingHook：本章结尾钩子强度，0-10 的整数（低于 6 说明结尾平淡，读者可能不想看下一章）。',
    '4. plotlineProgress：本章推进了哪条剧情线（主线/支线名），或"无实质推进"（连续无推进要提醒）。',
    '5. advancedLines：本章实际推进的剧情线名称数组——从「活跃剧情线」清单中选出推进了的线（名称必须与清单中的线名一字不差；没推进任何线则输出空数组）。',
    '6. continuity：与上一章结尾的衔接检查（人物位置/时间/伤势/资源/对话状态），发现问题要指出。',
    '7. trend：结合上一章复盘看近期节奏趋势（是否连续拖沓、爽点密度是否下降、是否需要调整）。',
    '8. stateChanges：本章发生的关键状态变化数组（人物状态/世界局面/关系/资源，每条约 20 字，最多 6 条），供整本与事实库回灌。',
    '9. newConflicts：本章新引入或明显升级的冲突数组（最多 4 条）。',
    '10. clues：本章埋下或推进的新线索/伏笔数组（最多 4 条）。',
    '11. absentRisks：本章缺席但按卷级职责应出场/该推进关系的重要角色，及其缺席带来的风险（最多 4 条）。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"hookHonored": true或false, "hookNote": "一句话", "endingHook": 0-10整数, "plotlineProgress": "一句话", "advancedLines": ["线名"], "continuity": "一句话", "trend": "一句话", "stateChanges": ["状态变化"], "newConflicts": ["新冲突"], "clues": ["新线索"], "absentRisks": ["本章缺席但值得注意的角色及风险（卷级职责/缺席风险，最多4条）"]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
}

/** 本域提示词登记（注册表消费）。 */
export const entries: PromptEntry[] = [
  { id: 'review.chapter', description: '章节审稿：九维（人设/设定/红线/文笔/节奏/逻辑/反AI/呈现/合规）' },
  { id: 'review.verify', description: '修订验证：逐条核对原意见是否解决，只挑新增 high' },
  { id: 'review.bible-for-verify', description: '验证模式道藏注入：结构化渲染 + 显式截断' },
  { id: 'review.author', description: '作者复盘：钩子兑现/结尾强度/推进/连续性/趋势' },
]
