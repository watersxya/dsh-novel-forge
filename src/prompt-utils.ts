/**
 * 提示词共享常量与工具
 *
 * 所有 JSON 输出规则、通用约束集中在此，避免各阶段重复定义、互相打架。
 */

/** JSON 输出规则（所有要求模型输出 JSON 的地方共用） */
export const JSON_OUTPUT_RULES = [
  '输出必须是合法 JSON 对象或数组，不要输出任何其他文字、解释、Markdown 标记或代码块。',
  '所有字符串值内部不得包含换行符（用 \\n 转义），JSON 必须在一段内完整结束。',
  '直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  '数值字段必须是数字类型，不要用字符串包裹。',
  '数组为空时输出 []，对象为空时输出 {}。',
]

/** JSON 输出规则的紧凑版（适合放在提示词末尾） */
export const JSON_OUTPUT_RULES_COMPACT = JSON_OUTPUT_RULES.join(' ')

/**
 * 估算 prompt 的 token 数（粗略估算，用于上下文预算控制）
 * 中文约 1.7 字/token，英文约 4 字符/token
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const otherChars = text.length - chineseChars
  return Math.round(chineseChars / 1.7 + otherChars / 4)
}

/**
 * 按 token 预算截断文本（保留开头，末尾加省略标记）
 * 用于控制单块上下文不超预算。
 */
export function truncateByTokens(text: string, maxTokens: number, marker = '…（已截断）'): string {
  if (estimateTokens(text) <= maxTokens) return text
  // 二分查找最大可保留长度
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (estimateTokens(text.slice(0, mid)) <= maxTokens - estimateTokens(marker)) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return text.slice(0, lo) + marker
}

/** 通用「只改表达不改情节」约束（润色/局部修订共用） */
export const EXPRESSION_ONLY_RULE = [
  '只改表达，不改情节走向、人物设定、已确立事实、对话核心内容。',
  '保留角色口吻与性格，角色行为需符合角色卡。',
  '必须遵守内容合规红线与本书红线，任何一条命中（含影射、暗示）都必须避免。',
  '避免 AI 套话：不禁、仿佛、一时间、不由得、顿时、然而、缓缓、轻轻、微微、默默、似乎、终于等滥用。',
]

/** 章节上下文各阶段的 token 预算（粗略，用于控制注入量） */
export const CONTEXT_BUDGET = {
  /** 章节生成：道藏+角色+大纲+事实+伏笔 */
  writing: 12000,
  /** AI 审稿：道藏+角色+事实+正文 */
  review: 10000,
  /** 修订：原意见+相关事实+目标正文 */
  revise: 8000,
  /** 润色：风格资产+原正文 */
  polish: 6000,
  /** 分章规划：大纲+道藏+角色+近期事实 */
  plan: 15000,
} as const

export type ContextStage = keyof typeof CONTEXT_BUDGET
