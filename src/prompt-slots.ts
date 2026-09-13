/**
 * 提示词槽位：给作者留几个**安全可改**的位置，用来微调本书的写作偏好。
 *
 * 设计边界（很重要）：
 *   * 槽位只追加"作者偏好"，**不允许覆盖**规则工程与合规红线——道藏、写作红线、
 *     九条内容合规红线、反 AI 规则、阶段契约都由宿主锁定，槽位碰不到；
 *   * 槽位内容随项目保存（`novel-project.json`），换书即换槽位；
 *   * 每个槽位有长度上限，超长直接截断并标记（沿用「截断显式化」的规则）。
 */

import type { ProjectState, PromptSlotId } from './protocol.ts'

/** 单个槽位的元信息。 */
export interface PromptSlotSpec {
  id: PromptSlotId
  /** 面板显示名。 */
  label: string
  /** 一句话说明它影响什么。 */
  hint: string
  /** 示例（面板占位符）。 */
  placeholder: string
  /** 字符上限。 */
  maxChars: number
}

/** 允许作者编辑的槽位（白名单；不在此列表的提示词一律不可改）。 */
export const PROMPT_SLOTS: readonly PromptSlotSpec[] = [
  {
    id: 'styleExtra',
    label: '文风补充',
    hint: '追加到写作提示词末尾的风格偏好（句式、叙述习惯、用词倾向）。',
    placeholder: '例如：多用短句和对话推进，少用成语；环境描写只写能影响动作的部分。',
    maxChars: 1200,
  },
  {
    id: 'antiAiExtra',
    label: '反 AI 补充',
    hint: '本书额外的"别这么写"清单，与内置反 AI 规则叠加（不能覆盖内置规则）。',
    placeholder: '例如：不要每段都用比喻；不要用"空气中弥漫着"这类句式。',
    maxChars: 1200,
  },
  {
    id: 'dialogueExtra',
    label: '对话补充',
    hint: '角色说话方式的额外约束，写入时会与角色卡一起注入。',
    placeholder: '例如：长辈说话带方言词；主角对熟人用绰号称呼。',
    maxChars: 800,
  },
  {
    id: 'endingHookExtra',
    label: '章末钩子偏好',
    hint: '对结尾钩子的额外要求（与章节计划里的 endingHook 叠加）。',
    placeholder: '例如：结尾尽量落在一个未闭合的选择上，而不是新出现的敌人。',
    maxChars: 600,
  },
]

/** 槽位 id → 规格。 */
const SLOT_BY_ID = new Map(PROMPT_SLOTS.map(s => [s.id, s] as const))

/** 单个槽位的渲染结果。 */
export interface RenderedSlot {
  id: PromptSlotId
  label: string
  text: string
  /** 是否因超长被截断。 */
  truncated: boolean
  /** 原文长度（截断前）。 */
  chars: number
}

/**
 * 读取并规整项目里的槽位内容（去空白、按上限截断）。
 *
 * @param project 项目状态。
 * @returns 非空槽位列表（保持 PROMPT_SLOTS 的声明顺序）。
 */
export function readPromptSlots(project: ProjectState): RenderedSlot[] {
  const stored = project.promptSlots ?? {}
  const out: RenderedSlot[] = []
  for (const spec of PROMPT_SLOTS) {
    const raw = (stored[spec.id] ?? '').trim()
    if (raw === '') continue
    const truncated = raw.length > spec.maxChars
    out.push({
      id: spec.id,
      label: spec.label,
      text: truncated ? raw.slice(0, spec.maxChars) : raw,
      truncated,
      chars: raw.length,
    })
  }
  return out
}

/**
 * 把槽位渲染成注入提示词的段落。
 *
 * @param project 项目状态。
 * @returns 提示词片段；无槽位时返回空串。
 */
export function renderPromptSlots(project: ProjectState): string {
  const slots = readPromptSlots(project)
  if (slots.length === 0) return ''
  const lines = ['==================== 作者偏好（本书自定义，优先级低于道藏/红线/合规） ====================']
  for (const slot of slots) {
    lines.push(`【${slot.label}】${slot.text}${slot.truncated ? `（已按 ${SLOT_BY_ID.get(slot.id)?.maxChars ?? 0} 字上限截断，原 ${slot.chars} 字）` : ''}`)
  }
  lines.push('以上偏好只影响表达方式；与道藏、写作红线、内容合规红线冲突时，一律以后者为准。')
  return lines.join('\n')
}

/**
 * 校验并规整一次槽位写入。
 *
 * @param id 槽位 id。
 * @param value 内容（空串表示清空该槽位）。
 * @returns 归一化后的内容。
 * @throws 槽位 id 不在白名单时抛错。
 */
export function normalizeSlotValue(id: string, value: string): string {
  const spec = SLOT_BY_ID.get(id as PromptSlotId)
  if (spec === undefined) throw new Error(`未知提示词槽位：${id}`)
  return value.replace(/\r\n/g, '\n').trim()
}
