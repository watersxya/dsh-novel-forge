/**
 * 取名器：按类别批量生成中文网文专有名字，入每书「名字库」，采纳后注入写作提示词。
 *
 * 设计边界（与提示词槽位同一家风）：
 *   * 取名是**辅助资产**：候选由模型生成，作者逐条采纳才进库；未采纳的候选
 *     不落盘、不注入——作者保有最终决定权；
 *   * 库有容量上限（每类 60 / 全书 200 条），超限拒绝写入并要求先清理，防止
 *     「生成很爽、库变垃圾场」；
 *   * 注入写作提示词的名字块只列**已采纳**名字，且声明「新角色/地点优先
 *     使用下表；表外创新名须与下表气质一致」——不锁死创作，只防跑偏。
 */

import type { NameCategory, NameForgeCandidate, NameForgeEntry, ProjectState } from './protocol.ts'

/** 一个取名类别。 */
export interface NameCategorySpec {
  id: NameCategory
  /** 面板显示名。 */
  label: string
  /** 面板上的一句话说明。 */
  hint: string
  /** 送模型的类别定义（Prompt 内使用）。 */
  brief: string
  /** 示例（占位符）。 */
  placeholder: string
  /** 单次生成上限。 */
  maxCount: number
}

/** 取名类别表（顺序即面板顺序）。 */
export const NAME_CATEGORIES: readonly NameCategorySpec[] = [
  {
    id: 'person',
    label: '人名',
    hint: '主角、配角、反派、路人——姓与名都要有题材气质。',
    brief: '人物姓名（姓氏+名，或复姓/单名/字号），需有记忆点，避免烂大街的谐音梗',
    placeholder: '例如：冷僻复姓；主角名带孤勇感；反派名要雅致但有压迫感',
    maxCount: 20,
  },
  {
    id: 'place',
    label: '地名',
    hint: '宗门所在地、秘境、城池、山川——世界观的空间锚点。',
    brief: '地名（山川/城池/秘境/宗门所在），需与世界观地理层级自洽',
    placeholder: '例如：剑修宗门设在雪山；秘境名字要带蛊惑感',
    maxCount: 20,
  },
  {
    id: 'technique',
    label: '功法',
    hint: '招式、心法、神通、禁术——战力体系的门面。',
    brief: '功法/招式/神通名（心法、剑式、禁术），需体现运转机理或意境，避免空泛形容词堆砌',
    placeholder: '例如：偏雷法；名字要短促狠戾；禁术名字带反噬感',
    maxCount: 20,
  },
  {
    id: 'faction',
    label: '势力',
    hint: '宗门、家族、王朝、组织——派系斗争的名字牌。',
    brief: '势力/组织/宗门/家族名，需体现其立身之道与行事风格',
    placeholder: '例如：邪道宗门；名字要堂皇但暗藏戾气',
    maxCount: 20,
  },
  {
    id: 'artifact',
    label: '宝物',
    hint: '法宝、丹药、神器、材料——金手指与争夺战的载体。',
    brief: '宝物/法宝/丹药/材料名，需暗示品阶或异能，避免「XX神器」式敷衍',
    placeholder: '例如：主角本命法宝；名字与功法同源',
    maxCount: 20,
  },
]

/** 类别 id → 规格。 */
const CATEGORY_BY_ID = new Map(NAME_CATEGORIES.map(c => [c.id, c] as const))

/** 取一个类别规格；未知 id 抛错（路由层转 400）。 */
export function categorySpec(id: string): NameCategorySpec {
  const spec = CATEGORY_BY_ID.get(id as NameCategory)
  if (spec === undefined) throw new Error(`未知取名类别：${id}`)
  return spec
}

/**
 * 名字库容量纪律：单类 ≤ 60、全书 ≤ 200。
 *
 * 全书上限必须**小于**「类数 × 单类上限」（5×60=300）否则永远先被单类规则
 * 挡住、成为死代码——200 逼作者在囤积前清理，也足够一部 600 章的书用。
 */
export const NAME_BANK_MAX_PER_CATEGORY = 60
export const NAME_BANK_MAX_TOTAL = 200

/** 名字长度与理由长度上限（截断显式化）。 */
const NAME_MAX = 30
const NOTE_MAX = 120

/** 归一化一条候选/入库条目（裁剪 + 截断；去重由调用方处理）。 */
export function normalizeNameEntry(raw: { name?: unknown; note?: unknown }): { name: string; note: string } {
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  const note = typeof raw.note === 'string' ? raw.note.replace(/\r?\n/g, ' ').trim().slice(0, NOTE_MAX) : ''
  return { name, note }
}

/**
 * 解析取名 LLM 输出为候选列表。
 *
 * 宽容度分级：标准 JSON → 去围栏 → 截取首尾花括号；仍失败返回空数组（由
 * 调用方决定重试或报错），绝不把模型废话当名字。
 *
 * @param text 模型原始输出。
 * @param category 目标类别（用于校验字段完整性）。
 * @param count 期望条数（上限）。
 * @returns 候选列表（已去重、去空、截断）。
 */
export function parseNameCandidates(text: string, count: number): NameForgeCandidate[] {
  const raw = extractJsonObject(text)
  if (raw === undefined) return []
  const list = Array.isArray(raw.names) ? raw.names : []
  const out: NameForgeCandidate[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    const note = typeof rec.note === 'string' ? rec.note.trim().slice(0, NOTE_MAX) : ''
    out.push({ name: name.slice(0, NAME_MAX), note })
    if (out.length >= count) break
  }
  return out
}

/** 从模型输出里尽力挖出一个 JSON 对象（标准 / 围栏 / 截取三档）。 */
function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const attempts = [
    text.trim(),
    text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(),
  ]
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch { /* 下一档 */ }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch { /* 放弃 */ }
  }
  return undefined
}

/**
 * 构造取名请求的 user 提示词。
 *
 * 书籍语境三件套：题材基调、世界设定（境界/区域/势力既有名）、已入库名字
 * （避重）——三者都可缺省，缺省时明确告诉模型「无既有设定，自由发挥」。
 *
 * @param category 类别规格。
 * @param count 期望条数。
 * @param hint 作者补充要求（可空）。
 * @param context 书籍语境。
 */
export function buildNameForgeUserPrompt(
  category: NameCategorySpec,
  count: number,
  hint: string,
  context: { genre?: string; worldNames?: string[]; bankNames?: string[] },
): string {
  const genre = (context.genre ?? '').trim()
  const world = (context.worldNames ?? []).filter(n => n.trim() !== '').slice(0, 40)
  const bank = (context.bankNames ?? []).filter(n => n.trim() !== '').slice(0, 60)
  const lines = [
    `类别：${category.label}（${category.brief}）`,
    `请生成 ${count} 个候选。`,
    genre !== '' ? `本书题材基调：${genre}——名字气质必须贴合。` : '（未提供题材基调，按通用中文网文气质发挥）',
    world.length > 0
      ? '世界观既有名称（新名字须与它们同一语感，不得重复或近音）：\n' + world.map(n => `- ${n}`).join('\n')
      : '（暂无世界观设定，自由发挥）',
    bank.length > 0
      ? '已入库名字（一个都不得重复或变体）：\n' + bank.map(n => `- ${n}`).join('\n')
      : '',
    hint.trim() !== '' ? `作者补充要求：${hint.trim().slice(0, 300)}` : '',
    '输出必须是合法 JSON 对象：{"names":[{"name":"名字","note":"命名理由/意象（20字内）"}]}。',
  ]
  return lines.filter(s => s !== '').join('\n\n')
}

/** 从项目状态收集取名语境（题材 + 世界既有名 + 已入库名字）。 */
export function collectNameForgeContext(project: ProjectState): { genre: string; worldNames: string[]; bankNames: string[] } {
  const genre = project.assets?.genre?.name ?? project.bible?.genre ?? ''
  const worldNames: string[] = []
  for (const realm of project.world?.realms ?? []) {
    if (realm.name.trim() !== '') worldNames.push(realm.name.trim())
  }
  for (const region of project.world?.regions ?? []) {
    if (region.name.trim() !== '') worldNames.push(region.name.trim())
  }
  for (const faction of project.world?.factions ?? []) {
    if (faction.name.trim() !== '') worldNames.push(faction.name.trim())
  }
  for (const role of project.roles ?? []) {
    if (role.name.trim() !== '') worldNames.push(role.name.trim())
  }
  for (const card of project.bible?.characters ?? []) {
    if (card.name.trim() !== '') worldNames.push(card.name.trim())
  }
  const bankNames = readNameBank(project).map(e => e.name)
  return { genre, worldNames, bankNames }
}

/** 读取并规整名字库（按类别分组返回前先做一致性校验；非法条目丢弃）。 */
export function readNameBank(project: ProjectState): NameForgeEntry[] {
  const raw = Array.isArray(project.nameBank) ? project.nameBank : []
  const out: NameForgeEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as unknown as Record<string, unknown>
    const category = typeof rec.category === 'string' ? rec.category : ''
    if (!CATEGORY_BY_ID.has(category as NameCategory)) continue
    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    if (name === '') continue
    const key = `${category}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: typeof rec.id === 'string' && rec.id !== '' ? rec.id : `${category}:${name}`,
      category: category as NameCategory,
      name: name.slice(0, NAME_MAX),
      note: typeof rec.note === 'string' ? rec.note.slice(0, NOTE_MAX) : '',
      adopted: rec.adopted !== false,
      createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date(0).toISOString(),
    })
  }
  return out
}

/**
 * 写入名字库（采纳候选 / 弃用单条 / 清空）。
 *
 * 容量纪律：单类 ≤ 60、总数 ≤ 200；超限抛错由路由转 400，**不做静默截断**——
 * 让作者明确知道库满了，而不是疑惑「我刚取的名字去哪了」。
 */
export function mutateNameBank(
  project: ProjectState,
  op: { kind: 'adopt'; category: NameCategory; candidates: Array<{ name: string; note?: string }> }
    | { kind: 'discard'; id: string }
    | { kind: 'clear' },
): NameForgeEntry[] {
  const current = readNameBank(project)
  let next: NameForgeEntry[]
  if (op.kind === 'adopt') {
    const existing = new Set(current.map(e => `${e.category}:${e.name}`))
    const fresh = op.candidates
      .map(c => normalizeNameEntry(c))
      .filter(n => n.name !== '' && !existing.has(`${op.category}:${n.name}`))
      .map(n => ({
        id: `${op.category}:${n.name}`,
        category: op.category,
        name: n.name,
        note: n.note,
        adopted: true,
        createdAt: new Date().toISOString(),
      }))
    if (fresh.length === 0) return current
    next = [...current, ...fresh]
  } else if (op.kind === 'discard') {
    next = current.filter(e => e.id !== op.id)
  } else {
    next = []
  }
  const perCategory = new Map<NameCategory, number>()
  for (const e of next) perCategory.set(e.category, (perCategory.get(e.category) ?? 0) + 1)
  for (const [category, n] of perCategory) {
    if (n > NAME_BANK_MAX_PER_CATEGORY) {
      throw new Error(`名字库「${categorySpec(category).label}」已满（${n}/${NAME_BANK_MAX_PER_CATEGORY}），请先清理再采纳`)
    }
  }
  if (next.length > NAME_BANK_MAX_TOTAL) {
    throw new Error(`名字库已满（${next.length}/${NAME_BANK_MAX_TOTAL}），请先清理再采纳`)
  }
  project.nameBank = next
  return next
}

/**
 * 把已采纳名字渲染成写作提示词块（本书层注入）。
 *
 * 声明边界：优先使用、不锁死——「表外创新名须与下表气质一致」。
 *
 * @param project 项目状态。
 * @returns 提示词片段；无库时返回空串。
 */
export function renderNameBank(project: ProjectState): string {
  const entries = readNameBank(project).filter(e => e.adopted)
  if (entries.length === 0) return ''
  const lines = ['==================== 已定名资产（优先使用，不得另起同名） ====================']
  for (const spec of NAME_CATEGORIES) {
    const names = entries.filter(e => e.category === spec.id).map(e => e.name)
    if (names.length === 0) continue
    lines.push(`${spec.label}：${names.join('、')}`)
  }
  lines.push('正文涉及上表类别的新专有名字，优先直接从表中取；表外创新名须与上表同一语感，不得与上表近音或重复。')
  return lines.join('\n')
}
