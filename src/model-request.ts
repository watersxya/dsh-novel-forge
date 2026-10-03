/**
 * 请求参数收敛的**执行层**（model-capability.ts 是规则层）。
 *
 * ## 为什么独立成文件
 *
 * `applyModelCapability` 需要 `ReasoningEffortId` 这个 dsh-llm 运行时值，而
 * `model-capability.ts` 必须保持零运行时依赖（它有一组离线单测，且被大量结构化
 * 任务路径复用）。所以把「规则」留在 model-capability，把「把规则应用到请求上」
 * 挪到这里。
 *
 * 顺带解开了 engine.ts ↔ stream-fallback.ts 的循环依赖：
 * 流式兜底要重算参数，本模块正是它该依赖的东西，不需要绕回 engine。
 */
import { ReasoningEffortId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { convergeRequestParams } from './model-capability.ts'

/** `applyModelCapability` 的可选行为开关。 */
export interface ApplyModelCapabilityOptions {
  /** 严格结构化输出任务：能力档案要求时强制关闭思考。 */
  structured?: boolean
  /**
   * 按**本次实际模型**重算输出预算。
   *
   * 能力表（model-capability.ts）目前不含上下文窗口数据，所以这里不猜、
   * 不硬编码任何 clamp 数值——那只会造出一个假的正确。改为把决定权交给调用方：
   * 流式长文路径用它保证「备用模型不会沿用主模型的 20000 预算而撞 max-tokens」。
   */
  maxTokensFor?: (model: string) => number | undefined
}

/**
 * 把能力约束应用到一份请求上。
 *
 * @param base - 调用方拼好的原始请求。
 * @param model - **本次实际要调用的模型**（切换备用模型后必须重算，故在循环内调用）。
 * @param options - 附加行为开关。
 * @returns 收敛后的请求（固定温度的模型会省略 temperature / 不支持的参数会被移除）。
 */
export function applyModelCapability(
  base: GenerateOptions,
  model: string,
  options: ApplyModelCapabilityOptions = {},
): GenerateOptions {
  const converged = convergeRequestParams(
    {
      temperature: base.temperature ?? 0.7,
      reasoningEffort: base.reasoningEffort === undefined
        ? undefined
        : String(base.reasoningEffort) as 'off' | 'low' | 'high' | 'max',
    },
    model,
    { structured: options.structured === true, omitFixedTemperature: true },
  )
  const recomputed = options.maxTokensFor?.(model)
  return {
    ...base,
    model,
    // 重算优先：换备用模型后沿用主模型的 maxTokens 是真实的失败来源
    // （备用模型窗口更小 → 必然 max-tokens 截断 → 白跑一轮）。
    ...(recomputed !== undefined ? { maxTokens: recomputed } : {}),
    ...(converged.temperature === undefined ? { temperature: undefined } : { temperature: converged.temperature }),
    ...(converged.reasoningEffort === undefined ? { reasoningEffort: undefined } : { reasoningEffort: ReasoningEffortId(converged.reasoningEffort) }),
  }
}
