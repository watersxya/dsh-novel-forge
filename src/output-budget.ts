/**
 * 结构化输出预算与字段长度合同。
 *
 * 背景：本插件此前给每个 LLM 调用写死一个 `Math.max(config.maxTokens, N)`。短任务
 * 与长任务拿到同一个额度，长任务（分卷、拆章、逐章规划）**额度不随规模增长**，
 * 截断后只能抛「请增大 maxTokens」。这里把额度改成按规模推算，并给结构化字段
 * 定长度上限，让预算花在结构上而不是被自由发挥吃光。
 *
 * 设计取舍：结构化输出的额度应当**随本次要产出的条目数增长**，并由硬上限兜住，
 * 否则要么短任务浪费额度，要么长任务写到一半被截断。字段长度上限同时写进提示词
 * 与解析端，两处共用一张表，避免漂移。
 *
 * 一条硬纪律：**不要用 JSON repair 去补被截断的结构**。repair 只能修已有结构，
 * 补不出尚未输出的条目；在服务层手工补齐缺失项，等于把不完整的规划伪装成可用
 * 资产。预算给够 + 输出够紧凑，才是正解。
 */

/** 一次调用的输出规模描述：给出能决定输出体量的那个量。 */
export interface OutputScope {
  /** 预期卷数（分卷/卷战略类）。 */
  volumes?: number
  /** 预期章节数（章节列表/批量拆章类）。 */
  chapters?: number
  /** 预期角色数（角色阵容/资产提炼类）。 */
  characters?: number
  /** 预期条目数（伏笔、题材、资产等清单类）。 */
  items?: number
  /** 需要覆盖的正文规模（字），用于拆书/反推这类按输入体量走的任务。 */
  sourceChars?: number
}

/** 一类结构化任务的预算规格。 */
export interface OutputBudgetSpec {
  /** 无视规模也要给到的下限。 */
  floor: number
  /** 规模为 0 时的起步额度。 */
  base: number
  /** 每单位规模追加的额度。 */
  perUnit: number
  /** 硬上限：超过它只会让模型啰嗦，不会让结构更完整。 */
  ceiling: number
}

/** 结构化任务分组——按"输出里每个单位要写多少字段"分档，而不是按业务名。 */
export type OutputBudgetKind =
  | 'volume-strategy'
  | 'chapter-list'
  | 'character-cast'
  | 'item-list'
  | 'analysis'

/**
 * 数值口径：以**本插件真实产出字段的体积**折算，不是照搬参考项目的数字
 * （它的卷战略字段与本插件的章节字段结构不同，直接套用会造成新的截断）。
 *
 * 折算假设：中文约 1.5-2 token/字；账本式 JSON 的键名与括号再占约 15%。
 * 例如单章条目 = 标题(≤40) + 摘要(≤300) + 本章目标(≤200) + beats + 最多 4 条
 * payoff 指令 → 约 250-400 字 → **约 350 token/章**。若字段合同调整，这里必须同步。
 */
const SPECS: Record<OutputBudgetKind, OutputBudgetSpec> = {
  // 每卷：roleLabel(≤32) + coreReward(≤64) + escalationFocus(≤64) + uncertainty，
  // 再加书级阶梯字段（readerRewardLadder/escalationLadder/midpointShift/notes）。
  'volume-strategy': { floor: 1_800, base: 1_200, perUnit: 220, ceiling: 6_000 },
  // 每章 ≈350 token（见上方折算说明），另留写作余量；上限对齐单次调用能力。
  'chapter-list': { floor: 2_500, base: 2_000, perUnit: 350, ceiling: 20_000 },
  // 每角色：名字 + roleLabel + 定位 + 关系 + 弧线 ≈150 token。
  'character-cast': { floor: 1_500, base: 1_000, perUnit: 150, ceiling: 8_000 },
  // 清单类，每条几个短字段。
  'item-list': { floor: 1_000, base: 800, perUnit: 60, ceiling: 4_000 },
  // 拆书/反推：按输入正文体量走，每千字约 120 token。
  analysis: { floor: 3_000, base: 2_000, perUnit: 12, ceiling: 16_000 },
}

/**
 * 取出与任务类型相关的那一个规模量。
 * @param kind - 任务类型。
 * @param scope - 规模描述。
 * @returns 单位数；分析类返回千字单位（向上取整）。
 */
export function scopeUnits(kind: OutputBudgetKind, scope: OutputScope): number {
  const positive = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  switch (kind) {
    case 'volume-strategy':
      return positive(scope.volumes)
    case 'chapter-list':
      return positive(scope.chapters)
    case 'character-cast':
      return positive(scope.characters)
    case 'item-list':
      return positive(scope.items)
    case 'analysis':
      // 输入正文每 1000 字算一个单位。
      return Math.ceil(positive(scope.sourceChars) / 1_000)
  }
}

/**
 * 按规模推算输出额度。
 * @param kind - 结构化任务类型。
 * @param scope - 本次任务的规模（缺省时按最小规模处理）。
 * @returns 建议的 `maxTokens`，落在该类型的 [floor, ceiling] 内。
 */
export function resolveOutputBudget(kind: OutputBudgetKind, scope: OutputScope = {}): number {
  const spec = SPECS[kind]
  const raw = spec.base + scopeUnits(kind, scope) * spec.perUnit
  return Math.min(spec.ceiling, Math.max(spec.floor, Math.round(raw)))
}

/** 读取某类任务的规格（供诊断与测试断言）。 */
export function outputBudgetSpec(kind: OutputBudgetKind): OutputBudgetSpec {
  return { ...SPECS[kind] }
}

/**
 * 结构化字段长度合同 —— 与 prompt 里的长度声明必须逐项一致。
 *
 * 两边同步的理由：只写进 schema，模型不知道就会超长被拒；只写进 prompt，模型
 * 偶尔超长没人拦。本表是单一数据源。
 */
export const STRUCTURED_FIELD_LIMITS = {
  /** 分卷战略：书级阶梯类字段。 */
  volumeLadder: 160,
  /** 分卷战略：每卷定位标签。 */
  volumeRoleLabel: 32,
  /** 分卷战略：每卷核心回报 / 升级焦点。 */
  volumeReward: 64,
  /** 分卷战略：不确定项原因。 */
  volumeUncertaintyReason: 64,
  /** 章节计划：单章标题。 */
  chapterTitle: 40,
  /** 章节计划：单章摘要。 */
  chapterSummary: 300,
  /** 章节计划：本章目标。 */
  chapterGoal: 200,
} as const

/**
 * 把长度合同渲染成可直接塞进 system prompt 的一句话，避免 prompt 与表漂移。
 * @param entries - 要声明的字段（描述 + 上限），按声明顺序渲染。
 * @returns 形如「为保证输出完整：A 不超过 160 字；B 不超过 64 字。」的中文说明。
 */
export function renderLengthContract(entries: ReadonlyArray<readonly [string, number]>): string {
  if (entries.length === 0) return ''
  const parts = entries.map(([label, limit]) => `${label}不超过 ${limit} 字`)
  return `为保证输出完整：${parts.join('；')}。每个字段只保留完成本阶段决策所需的信息，写完后立即结束输出，不要展开细纲或重复说明。`
}
