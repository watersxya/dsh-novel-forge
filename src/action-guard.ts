/**
 * 动作失败分级（fail-stop 规则）——不依赖 LLM/宿主服务的纯逻辑模块，可离线单测。
 *
 * 规则来源（借鉴同类 DSH 小说插件的规则设计）：
 *  - 参数/契约类失败**不得重复同一调用**，解释一次即停；
 *  - 瞬时故障允许有限重试，同样禁止无限重试。
 * 规则必须可测试，否则只是文档。
 */

/**
 * 动作失败分级：
 * - `contract` 参数/契约类（参数缺失、片段未找到、章节不存在、非法取值…）：
 *   同一调用只允许修正一次，禁止原样重复。
 * - `transient` 瞬时故障（网络、模型中断、磁盘临时不可用…）：允许重试一次。
 */
export type ActionErrorKind = 'contract' | 'transient'

/** 带分级的动作失败（executeAction 抛出，供 fail-stop 判定）。 */
export class NovelActionError extends Error {
  readonly kind: ActionErrorKind
  constructor(kind: ActionErrorKind, message: string) {
    super(message)
    this.name = 'NovelActionError'
    this.kind = kind
  }
}

/** 瞬时故障特征（先判，避免被下面的契约词误伤）。 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /助手调用失败/,
  /生成失败|请求失败|调用失败/,
  /network|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|aborted|terminated/i,
  /超时|timeout/i,
  /频繁|限流|rate\s*limit|too many requests|\b429\b/i,
  /ENOSPC|EACCES|EBUSY|EPERM|EMFILE/,
]

/**
 * 参数/契约类失败特征（兜底识别）。
 *
 * 宿主自己的前置条件失败已在抛出点标成 {@link NovelActionError}（引擎与助手动作层），
 * 这里的正则只兜住漏标的历史消息与第三方错误。
 */
const CONTRACT_PATTERNS: readonly RegExp[] = [
  /动作参数不是合法 JSON/,
  /未知工具/,
  /需要/,
  /不存在/,
  /尚未生成/,
  /未找到/,
  /不在计划中/,
  /正文文件不存在/,
  /还没有已写章节/,
  /没有可分析的已写章节/,
  /非法/,
  /无效/,
  /必须是/,
  /无法识别/,
  /请先/,
]

/**
 * 判定一次动作失败的类别。
 *
 * @param error 捕获到的异常。
 * @returns `contract`（参数/契约，不重试原样调用）或 `transient`（瞬时，可重试一次）。
 */
export function classifyActionError(error: unknown): ActionErrorKind {
  if (error instanceof NovelActionError) return error.kind
  const message = error instanceof Error ? error.message : String(error)
  if (TRANSIENT_PATTERNS.some(re => re.test(message))) return 'transient'
  if (CONTRACT_PATTERNS.some(re => re.test(message))) return 'contract'
  // 未知错误默认按瞬时处理：允许一次重试，但同一调用签名仍有次数上限（见 fail-stop）。
  return 'transient'
}

/**
 * 同一调用签名允许的总尝试次数（含首次）。
 *
 * @param kind 失败类别。
 * @returns `contract` = 1（禁止原样重复），`transient` = 2（允许一次重试）。
 */
export function actionRetryLimit(kind: ActionErrorKind): number {
  return kind === 'contract' ? 1 : 2
}

/**
 * 把动作参数规范化为稳定签名（键排序），用于识别「同一个调用」。
 *
 * @param args 动作参数。
 * @returns 稳定字符串签名。
 */
export function safeArgsKey(args: Record<string, unknown> | undefined): string {
  if (args === undefined) return ''
  try {
    return JSON.stringify(Object.keys(args).sort().map(key => [key, args[key]]))
  } catch {
    return String(args)
  }
}

/**
 * 已失败调用记账：同一签名达到重试上限即 fail-stop。
 */
export class FailureLedger {
  private readonly counts = new Map<string, number>()

  /**
   * 记录一次失败并判断是否应当停止本轮。
   *
   * @param tool 工具名。
   * @param args 该次调用参数。
   * @param kind 失败类别。
   * @returns `attempts` 本次是第几次失败；`stop` 是否达到上限（true = 立即停止，不再喂回模型）。
   */
  record(tool: string, args: Record<string, unknown> | undefined, kind: ActionErrorKind): { attempts: number; stop: boolean } {
    const signature = `${tool}:${safeArgsKey(args)}`
    const attempts = (this.counts.get(signature) ?? 0) + 1
    this.counts.set(signature, attempts)
    return { attempts, stop: attempts >= actionRetryLimit(kind) }
  }

  /** 已登记的失败签名数量（测试/诊断用）。 */
  get size(): number {
    return this.counts.size
  }
}
