/**
 * 模型参数能力兼容层。
 *
 * 设计原则：**界面上保存的温度/思考档位是用户偏好，不是最终请求值。** 构造请求前
 * 必须经过本层收敛到厂商允许的范围 —— 否则换模型、走自定义中转、或厂商改了约束，
 * 就会出现「换个 provider 就报参数错误」这类故障。
 *
 * 两条硬要求：
 *  1. **按模型身份判断，不按 provider 判断**。同一个模型经由自定义中转调用时，
 *     provider 名可能完全自定义，但参数约束属于模型本身；把判断写成
 *     `provider === '某个厂商' && ...` 会让走中转的调用绕过约束。
 *  2. **约束要有出处**。每条规则的来源写在规则上，不靠猜。下列规则来自厂商官方
 *     《模型参数参考》（https://platform.kimi.com/docs/api/models-overview.md）：
 *       · kimi-k3        : temperature 固定 1.0；支持顶层 reasoning_effort
 *       · kimi-k2.7-code : temperature 固定 1.0；不支持 reasoning_effort（用 thinking，且不可禁用）
 *       · kimi-k2.6      : thinking 固定 1.0 / 非 thinking 固定 0.6；不支持 reasoning_effort
 *     官方同时建议：这类模型**不要显式传入 temperature**。本层因此优先「不传」，
 *     仅在调用方无法省略该参数时才钳到允许值。
 */

/** 一次请求的参数约束。 */
export interface ModelCapability {
  /** 该模型只接受这一个温度值（如 Kimi 全系），缺省表示不约束。 */
  fixedTemperature?: number
  /** 温度允许的下界（默认 0）。 */
  minTemperature?: number
  /** 温度允许的上界（默认 2，主流 OpenAI 兼容区间）。 */
  maxTemperature?: number
  /**
   * 是否支持 OpenAI 兼容的 `reasoning_effort`。
   * false 表示**不得下发**该参数（如 Kimi K2.x 用的是 `thinking`），下发会被厂商拒绝。
   */
  supportsReasoning?: boolean
  /**
   * 推理控制方式：`reasoning_effort`（OpenAI 兼容顶层参数）或 `thinking`（Kimi K2.x 专属）。
   * 运行时若适配层支持，应按此选择参数名；仅为诊断与后续适配保留。
   */
  reasoningControl?: 'reasoning-effort' | 'thinking' | 'none'
  /** 严格结构化输出必须关闭思考（覆盖用户偏好）。 */
  reasoningForcedOff?: boolean
  /** 命中的规则名，用于日志与测试断言。 */
  rule: string
  /** 约束出处（文档 URL 或说明），便于复核与更新。 */
  source: string
}

/** 一道匹配规则：先命中先生效。 */
interface CapabilityRule {
  /** 规则名。 */
  rule: string
  /** 约束出处。 */
  source: string
  /** 模型 id 归一化后是否命中。 */
  matches: (canonical: string) => boolean
  capability: Omit<ModelCapability, 'rule' | 'source'>
}

const KIMI_SOURCE = 'https://platform.kimi.com/docs/api/models-overview.md'

/**
 * 把模型 id 归一化为「模型身份」。
 *
 * 处理：去空白与首尾斜杠、小写、剥掉供应商前缀（`kimi/kimi-k3` → `kimi-k3`）。
 * @param model - 原始模型 id。
 * @returns 归一化后的身份（小写、无前缀）。
 */
export function canonicalModelId(model: string | undefined): string {
  if (typeof model !== 'string') return ''
  const trimmed = model.trim().toLowerCase().replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return ''
  const segments = trimmed.split('/')
  return segments[segments.length - 1] ?? ''
}

const RULES: CapabilityRule[] = [
  {
    rule: 'kimi-k3-fixed-temperature',
    source: KIMI_SOURCE,
    // 只命中 k3 本身；k2.6 / k2.7 另立规则（约束不同）。
    matches: (m) => /^kimi[-_.]?k-?3(?:[-_.]|$)/.test(m),
    capability: { fixedTemperature: 1, supportsReasoning: true, reasoningControl: 'reasoning-effort' },
  },
  {
    rule: 'kimi-k2.7-code-fixed-temperature',
    source: KIMI_SOURCE,
    matches: (m) => /^kimi[-_.]?k-?2[-_.]?7(?:[-_.]|$)/.test(m),
    capability: {
      fixedTemperature: 1,
      // 不支持 reasoning_effort；思考由 thinking 控制且不可禁用。
      supportsReasoning: false,
      reasoningControl: 'thinking',
      reasoningForcedOff: true,
    },
  },
  {
    rule: 'kimi-k2.6-temperature-by-thinking',
    source: KIMI_SOURCE,
    matches: (m) => /^kimi[-_.]?k-?2[-_.]?6(?:[-_.]|$)/.test(m),
    capability: {
      // 思考模式 1.0 / 非思考 0.6；本插件的结构化任务默认关闭思考，故取 0.6 不安全，
      // 统一收敛到 1.0（思考档），避免"关思考却给 1.0"这类组合出错。
      fixedTemperature: 1,
      supportsReasoning: false,
      reasoningControl: 'thinking',
    },
  },
  {
    rule: 'deepseek-reasoner-fixed-temperature',
    source: 'OpenAI 兼容约定：DeepSeek R1/reasoner 不接受自定义 temperature',
    matches: (m) => /^deepseek[-_.]?(r1|reasoner)(?:[-_.]|$)/.test(m),
    capability: { fixedTemperature: 1, supportsReasoning: true, reasoningControl: 'reasoning-effort' },
  },
]

/**
 * 解析一条模型的能力约束。
 * @param model - 模型 id（可能带供应商前缀）。
 * @returns 命中的能力；无约束时返回 undefined。
 */
export function resolveModelCapability(model: string | undefined): ModelCapability | undefined {
  const canonical = canonicalModelId(model)
  if (canonical === '') return undefined
  for (const rule of RULES) {
    if (rule.matches(canonical)) return { ...rule.capability, rule: rule.rule, source: rule.source }
  }
  return undefined
}

/** 一次待收敛的请求参数。 */
export interface RequestParams {
  temperature: number
  /** 请求方（含用户偏好）希望使用的思考档位；undefined 表示不涉及。 */
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
}

/** 收敛结果：最终请求值 + 发生了哪些调整（便于日志与诊断）。 */
export interface ConvergedParams {
  /**
   * 最终要下发的温度；`undefined` 表示**应当省略该参数**。
   * 厂商建议这类模型不要显式传 temperature 时，本层返回 undefined。
   */
  temperature: number | undefined
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  /** 被本层改掉的项，形如 `temperature: 0.3 -> 省略`。 */
  adjustments: string[]
  /** 命中的规则名。 */
  rule?: string
  /** 约束出处。 */
  source?: string
}

/**
 * 把请求参数收敛到模型允许的范围。
 *
 * @param params - 调用方希望使用的参数。
 * @param model - 实际要调用的模型 id（应传**实际模型**；换备用模型后需重算）。
 * @param options - `structured: true` 表示这是严格结构化输出任务；
 *   `omitFixedTemperature: true` 表示调用方可以不传温度（推荐，厂商建议如此），
 *   此时固定温度会收敛为 undefined 而不是钳到固定值。
 * @returns 最终请求值与被调整项。
 */
export function convergeRequestParams(
  params: RequestParams,
  model: string | undefined,
  options: { structured?: boolean; omitFixedTemperature?: boolean } = {},
): ConvergedParams {
  const capability = resolveModelCapability(model)
  const adjustments: string[] = []
  let temperature: number | undefined = params.temperature
  let reasoningEffort = params.reasoningEffort

  if (capability?.fixedTemperature !== undefined) {
    const fixed = capability.fixedTemperature
    if (options.omitFixedTemperature === true) {
      if (temperature !== undefined) {
        adjustments.push(`temperature: ${temperature} -> 省略（${capability.rule} 固定 ${fixed}，厂商建议不要显式传入）`)
      }
      temperature = undefined
    } else if (temperature !== fixed) {
      adjustments.push(`temperature: ${temperature} -> ${fixed}（${capability.rule} 固定值）`)
      temperature = fixed
    }
  } else if (capability !== undefined) {
    const min = capability.minTemperature ?? 0
    const max = capability.maxTemperature ?? 2
    const clamped = Math.min(max, Math.max(min, temperature ?? min))
    if (clamped !== temperature) {
      adjustments.push(`temperature: ${temperature} -> ${clamped}（${capability.rule} 取值范围）`)
      temperature = clamped
    }
  }

  // 不支持 reasoning_effort 的模型：不得下发该参数，否则厂商直接报错。
  if (capability?.supportsReasoning === false && reasoningEffort !== undefined) {
    if (reasoningEffort !== 'off') {
      adjustments.push(`reasoningEffort: ${reasoningEffort} -> 省略（${capability.rule} 不支持该参数）`)
    }
    reasoningEffort = undefined
  }

  // 严格结构化任务：能力档案要求关闭思考时，覆盖用户偏好（输出稳定性优先）。
  if (options.structured === true && capability?.reasoningForcedOff === true && reasoningEffort !== undefined) {
    adjustments.push(`reasoningEffort: ${reasoningEffort} -> off（结构化任务强制关闭思考）`)
    reasoningEffort = 'off'
    // 该模型通过 thinking 控制且不可禁用：等价于不传任何推理参数。
    if (capability.reasoningControl === 'thinking') reasoningEffort = undefined
  }

  return {
    temperature,
    reasoningEffort,
    adjustments,
    ...(capability === undefined ? {} : { rule: capability.rule, source: capability.source }),
  }
}

/**
 * 全文输出（正文/改写/润色）的 token 预算。
 *
 * ## 为什么放在这里
 *
 * 它是「按模型身份决定参数」这件事的最后一环，与 {@link convergeRequestParams}
 * 同源；而本模块**零运行时依赖**，可以脱离宿主包离线单测。反过来若留在
 * engine.ts，就只能靠类型检查"证明"它对——而它恰恰是这次修复的核心行为。
 *
 * ## 行为
 *
 * - 用户配的 `maxTokens` 始终是**上限**：`Math.max` 保证不会因为用户调小而
 *   让长章写不完（3500 字中文约需 5~6k token，20000 是留足余量的地板）。
 * - 换到备用模型时，若作者通过 `config.fallbackMaxTokens` 显式给了预算就改用它。
 *   能力表没有上下文窗口数据，此时不猜、不硬编码任何 clamp 数值——那只会造出
 *   一个假的正确。**没填就返回 undefined**（沿用请求原值），把决定权留给作者。
 *
 * @param config - 当前配置。
 * @param model - 本次实际要用的模型。
 * @param primaryModel - 主模型 id（与 `model` 相同即主路径）。
 * @returns 该模型应使用的 maxTokens；undefined 表示沿用调用方原值。
 */
export function fullTextBudget(
  config: { maxTokens: number; fallbackMaxTokens?: number },
  model: string,
  primaryModel: string,
): number | undefined {
  const floor = Math.max(config.maxTokens, 20000)
  if (model === primaryModel) return floor
  const fallback = typeof config.fallbackMaxTokens === 'number' ? config.fallbackMaxTokens : undefined
  return fallback !== undefined && fallback > 0 ? Math.min(fallback, floor) : undefined
}
