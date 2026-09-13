/**
 * 模型失败恢复规则（纯逻辑，可离线单测）。
 *
 * 解决的问题：批量连写时，主模型偶发限流/超时/额度耗尽会让**整批中断**，
 * 而换一个模型重试一次往往就能过去。规则：
 *   1) 只对「可重试」错误切换模型——用户主动取消、参数/契约类错误不重试；
 *   2) 备用模型为空或与主模型相同则不切换；
 *   3) 备用模型也失败时，抛**原始错误**（保留主因，不掩盖现场）；
 *   4) 每次调用最多切换一次。
 */

/** 可重试错误特征（网络/超时/限流/服务端/额度类）。 */
const RETRYABLE_PATTERNS: readonly RegExp[] = [
  /失败/, /超时/, /timeout/i,
  /network|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|terminated/i,
  /频繁|限流|rate\s*limit|too many requests|\b429\b|\b5\d\d\b/i,
  /overload|unavailable|capacity|服务不可用|繁忙/i,
  /quota|balance|credit|insufficient|额度|余额/i,
]

/** 明确不可重试的特征（用户取消 / 契约类）。 */
const NON_RETRYABLE_PATTERNS: readonly RegExp[] = [
  /\baborted\b|已取消|用户取消/i,
  /不在计划中|尚未生成|参数|非法|无效|需要/i,
]

/**
 * 判断一次 LLM 失败是否值得换模型重试。
 *
 * @param error 捕获到的异常。
 * @returns 可重试时为 true。
 */
export function isRetryableLlmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (NON_RETRYABLE_PATTERNS.some(re => re.test(message))) return false
  return RETRYABLE_PATTERNS.some(re => re.test(message))
}

/**
 * 判断是否应当切换到备用模型。
 *
 * @param fallbackModel 配置的备用模型（空串 = 未配置）。
 * @param primaryModel 本次实际使用的主模型。
 * @param error 捕获到的异常。
 * @returns 应当切换时为 true。
 */
export function shouldSwitchModel(fallbackModel: string | undefined, primaryModel: string, error: unknown): boolean {
  const fallback = (fallbackModel ?? '').trim()
  if (fallback === '' || fallback === primaryModel) return false
  return isRetryableLlmError(error)
}

/**
 * 用主模型执行；失败且满足切换条件时，用备用模型再执行一次。
 *
 * @param input 主模型 / 备用模型 / 实际执行函数（接收本次要用的模型 id）。
 * @returns 执行结果（备用模型成功时返回其结果）。
 * @throws 主模型失败且未切换时抛原错误；切换后仍失败时同样抛**主模型的原始错误**。
 */
export async function withModelFallback<T>(
  input: { model: string; fallbackModel?: string; onSwitch?: (from: string, to: string, error: unknown) => void },
  run: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(input.model)
  } catch (error) {
    const fallback = (input.fallbackModel ?? '').trim()
    if (fallback === '' || fallback === input.model || !isRetryableLlmError(error)) throw error
    input.onSwitch?.(input.model, fallback, error)
    try {
      return await run(fallback)
    } catch {
      // 备用模型也失败：抛主模型的原始错误，避免掩盖第一现场。
      throw error
    }
  }
}
