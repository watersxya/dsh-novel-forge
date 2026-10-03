/**
 * 流式生成的「主模型 → 备用模型」兜底执行器（三处共用）。
 *
 * ## 为什么要抽出来
 *
 * 正文生成、章节改写、去 AI 润色三处各自手写了一遍几乎相同的 `for (let attempt
 * = 0; attempt < 2; attempt++)` 循环：同样的备用模型选择、同样的
 * `applyModelCapability` 参数重算、同样的 `produced > 0` 保护、同样的
 * `max-tokens` 判定。同一件事写三份就必然漂移——事实上已经漂移过一次：
 * `complete()` 走的是另一套 `withModelFallback`，而流式三处是手写版。
 *
 * 现在统一到一处，另有一处顺带修掉：
 * **`maxTokens` 随备用模型重算**。此前 `applyModelCapability` 只收敛
 * `temperature` / `reasoningEffort`，`maxTokens` 原样沿用主模型的值——
 * 备用模型上下文窗口更小时，仍会撞 `max-tokens` 截断而失败。
 *
 * ## 与 complete() 的差异（有意为之）
 *
 * 非流式的 `complete()` 可以在失败后整段重来（调用方看不到中间产物）；
 * 流式路径已经把字吐给界面了，重来会重复显示，所以这里多了
 * 「**已产出正文就不换模型**」的规则。
 */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { beginLiveCall, endLiveCall, markFirstToken } from './llm-live.ts'
import { shouldSwitchModel } from './llm-retry.ts'
// 刻意只依赖零运行时依赖的 model-capability / model-request，而不是 engine.ts——
// 后者会 import 本模块，形成循环。参数收敛与预算重算本来就属于同一层。
import { fullTextBudget } from './model-capability.ts'
import { applyModelCapability } from './model-request.ts'
import type { NovelConfig } from './protocol.ts'

/** 三处流式路径共用的内部事件。 */
export type StreamFrame =
  | { frame: 'start' }
  | { frame: 'delta'; text: string }

/** 执行一次流式调用所需的参数。 */
export interface StreamWithFallbackOptions {
  /** 宿主上下文。 */
  ctx: Context
  /** 读取当前配置（备用模型、maxTokens 等）。 */
  config: NovelConfig
  /** 已拼好的请求（`applyModelCapability` 会在其基础上收敛参数）。 */
  request: GenerateOptions
  /** 实况面板标签，如「正文生成 · 第3章」。 */
  liveLabel: string
  /** 传给 `beginLiveCall` 的用户提示摘要（过长会被截断）。 */
  liveUser?: string
  /** 达到 maxTokens 上限时的错误文案。 */
  maxTokensError: string
  /** 产出文本的最小长度；不足则视为失败。 */
  minChars: number
}

/**
 * 执行流式生成，主模型失败且「一个字都没产出」时换备用模型重试一次。
 *
 * 第三泛型（`TNext`）取 `unknown` 而非 `void`：三处调用方的外层生成器都声明为
 * `AsyncGenerator<..., void, unknown>`，`yield*` 委托要求两者一致，否则
 * tsc 报 TS2766（运行时无碍，但类型上不干净）。
 *
 * @returns 拼好的完整文本。
 * @throws 两次都失败时抛最后一次的错误；成功但文本过短时抛「结果过短」。
 */
export async function* streamWithFallback(
  options: StreamWithFallbackOptions,
): AsyncGenerator<StreamFrame, string, unknown> {
  const { ctx, config, request, liveLabel, maxTokensError, minChars } = options
  const primaryModel = request.model ?? config.model
  let text = ''
  let lastError: Error | undefined

  // 最多两次尝试：主模型 → （未产出任何文字且失败可重试时）备用模型。
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = attempt === 0 ? primaryModel : (config.fallbackModel ?? '').trim()
    if (model === '') break

    const live = beginLiveCall({
      label: liveLabel,
      model,
      system: request.system,
      user: options.liveUser,
    })
    const assembler = new BlockAssembler()
    let produced = 0
    // 参数按**本次实际要用的模型**重算（换模型后约束随新模型变化）。
    // maxTokens 同样重算：换到窗口更小的备用模型时沿用主模型预算会必然截断。
    const converged = applyModelCapability(request, model, {
      maxTokensFor: m => fullTextBudget(config, m, primaryModel),
    })
    for await (const chunk of ctx.llm.stream(converged)) {
      assembler.push(chunk)
      if (chunk.type === 'text-delta') {
        produced += chunk.text.length
        markFirstToken(live)
        yield { frame: 'delta', text: chunk.text }
      }
    }

    const finish = assembler.finish
    lastError = undefined
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      lastError = new Error(`${liveLabel}失败（${finish.kind}）: ${finish.failure.message}`)
    } else if (finish.kind === 'max-tokens') {
      lastError = new Error(maxTokensError)
    }

    text = assembler
      .blocks()
      .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()

    endLiveCall(live, assembler, lastError === undefined
      ? { chars: text.length, preview: text.slice(0, 320), phase: text === '' ? 'failed' : 'completed' }
      : { chars: text.length, phase: 'failed', error: lastError.message })

    if (lastError === undefined) break
    // 只有「一个字都没产出」时才换模型重试——已有正文绝不能重复生成（会重复显示）。
    if (produced > 0 || !shouldSwitchModel(config.fallbackModel, model, lastError)) break
  }

  if (lastError !== undefined) throw lastError
  if (text.length < minChars) throw new Error(`${liveLabel}结果过短，可能失败，请重试`)
  return text
}
