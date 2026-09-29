/**
 * 模型参数能力兼容层（离线）。
 *
 * 核心契约：**界面上保存的温度是用户偏好，不是最终请求值**；构造请求前必须按
 * **模型身份**收敛到厂商允许范围。
 *
 * 约束来源：厂商官方《模型参数参考》
 * https://platform.kimi.com/docs/api/models-overview.md —— 该文档明确：
 *   · kimi-k3 / kimi-k2.7-code / kimi-k2.6(思考) 的 temperature 固定 1.0，传入其他值报错；
 *   · kimi-k2.6 非思考模式固定 0.6；
 *   · k2.6 / k2.7 用 `thinking` 控制思考，**不支持** `reasoning_effort`；
 *   · 官方建议这类模型不要显式传入 temperature。
 *
 * 一条关键回归：判断必须按模型身份做。若写成 `provider === '某厂商' && ...`，
 * 经由自定义中转调用同一模型就会绕过约束 —— 这里锁住「换 provider 不改变约束」。
 */
import { describe, expect, it } from 'vitest'
import { canonicalModelId, convergeRequestParams, resolveModelCapability } from '../src/model-capability.ts'
import { testLlmModel } from '../src/engine.ts'

describe('canonicalModelId', () => {
  it('剥掉供应商前缀、归一大小写与首尾斜杠', () => {
    expect(canonicalModelId('kimi/kimi-k3')).toBe('kimi-k3')
    expect(canonicalModelId('/Kimi-K3/')).toBe('kimi-k3')
    expect(canonicalModelId('  DeepSeek-Flash  ')).toBe('deepseek-flash')
    expect(canonicalModelId('a/b/c')).toBe('c')
  })

  it('空值与非法值返回空串，不抛错', () => {
    expect(canonicalModelId(undefined)).toBe('')
    expect(canonicalModelId('')).toBe('')
    expect(canonicalModelId('   ')).toBe('')
  })
})

describe('resolveModelCapability', () => {
  it('Kimi K3：固定温度 1.0，支持 reasoning_effort', () => {
    for (const id of ['kimi-k3', 'kimi/kimi-k3', 'Kimi-K3', 'kimi_k3', 'kimi-k-3']) {
      const capability = resolveModelCapability(id)
      expect(capability?.fixedTemperature, id).toBe(1)
      expect(capability?.supportsReasoning, id).toBe(true)
      expect(capability?.reasoningControl).toBe('reasoning-effort')
      expect(capability?.rule).toBe('kimi-k3-fixed-temperature')
      expect(capability?.source).toContain('platform.kimi.com')
    }
  })

  it('Kimi K2.7-code：固定温度且不支持 reasoning_effort（思考不可禁用）', () => {
    for (const id of ['kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi/kimi-k2.7-code']) {
      const capability = resolveModelCapability(id)
      expect(capability?.fixedTemperature, id).toBe(1)
      expect(capability?.supportsReasoning, id).toBe(false)
      expect(capability?.reasoningControl).toBe('thinking')
    }
  })

  it('Kimi K2.6：温度固定、thinking 控制、不支持 reasoning_effort', () => {
    const capability = resolveModelCapability('kimi-k2.6')
    expect(capability?.fixedTemperature).toBe(1)
    expect(capability?.supportsReasoning).toBe(false)
    expect(capability?.reasoningControl).toBe('thinking')
  })

  it('K2 系列不会被误判成 K3（两条规则约束不同）', () => {
    expect(resolveModelCapability('kimi-k2.6')?.rule).not.toBe('kimi-k3-fixed-temperature')
    expect(resolveModelCapability('kimi-k2.7-code')?.rule).not.toBe('kimi-k3-fixed-temperature')
  })

  it('非 Kimi / 无约束模型不被误伤', () => {
    for (const id of ['deepseek-flash', 'deepseek-v4-pro', 'glm-5.3-flash', 'qwen3.7-max', 'gpt-4o', 'auto', 'anthropic/claude-sonnet-4.6']) {
      expect(resolveModelCapability(id), id).toBeUndefined()
    }
  })

  it('deepseek reasoner 固定温度并声明支持思考', () => {
    expect(resolveModelCapability('deepseek-r1')?.fixedTemperature).toBe(1)
    expect(resolveModelCapability('deepseek-reasoner')?.supportsReasoning).toBe(true)
  })
})

describe('convergeRequestParams', () => {
  it('默认把固定温度收敛为「省略参数」（厂商建议不要显式传入）', () => {
    const result = convergeRequestParams({ temperature: 0.3 }, 'kimi-k3', { omitFixedTemperature: true })
    expect(result.temperature).toBeUndefined()
    expect(result.adjustments.join()).toContain('省略')
    expect(result.rule).toBe('kimi-k3-fixed-temperature')
  })

  it('适配层无法省略参数时，退化为钳到固定值', () => {
    const result = convergeRequestParams({ temperature: 0.3 }, 'kimi-k3')
    expect(result.temperature).toBe(1)
    expect(result.adjustments.join()).toContain('temperature: 0.3 -> 1')
  })

  it('温度已经是允许值时不做无谓调整', () => {
    expect(convergeRequestParams({ temperature: 1 }, 'kimi-k3').adjustments).toEqual([])
    // 省略模式下即便值正确也会省略，但仍要说明原因。
    const omitted = convergeRequestParams({ temperature: 1 }, 'kimi-k3', { omitFixedTemperature: true })
    expect(omitted.temperature).toBeUndefined()
    expect(omitted.adjustments.length).toBe(1)
  })

  it('K2.x 不支持 reasoning_effort：该参数被移除，而不是下发后报错', () => {
    const result = convergeRequestParams({ temperature: 0.3, reasoningEffort: 'high' }, 'kimi-k2.7-code')
    expect(result.reasoningEffort).toBeUndefined()
    expect(result.adjustments.join()).toContain('不支持该参数')
  })

  it('结构化任务遇到不可禁用的思考模型时不强行下发 off', () => {
    const result = convergeRequestParams({ temperature: 0.3, reasoningEffort: 'low' }, 'kimi-k2.7-code', {
      structured: true,
      omitFixedTemperature: true,
    })
    // thinking 不可禁用 → 等价于不传任何推理参数。
    expect(result.reasoningEffort).toBeUndefined()
  })

  /**
   * 关键回归：同一个模型经由**自定义中转 provider** 调用时，约束必须照样生效
   * —— 因为约束属于模型身份，不属于 provider。
   */
  it('换 provider / 走中转不改变约束（约束按模型身份生效）', () => {
    const viaRelay = convergeRequestParams({ temperature: 0.1 }, 'my-gateway/kimi-k3')
    expect(viaRelay.rule).toBe('kimi-k3-fixed-temperature')
    expect(viaRelay.temperature).toBe(1)
  })

  it('未命中的模型原样透传温度与思考档位', () => {
    const result = convergeRequestParams({ temperature: 0.85, reasoningEffort: 'high' }, 'deepseek-flash')
    expect(result.temperature).toBe(0.85)
    expect(result.reasoningEffort).toBe('high')
    expect(result.adjustments).toEqual([])
    expect(result.rule).toBeUndefined()
  })

  it('模型缺失时不做任何收敛（无身份可依据）', () => {
    const result = convergeRequestParams({ temperature: 0.7, reasoningEffort: 'low' }, undefined)
    expect(result.temperature).toBe(0.7)
    expect(result.reasoningEffort).toBe('low')
    expect(result.adjustments).toEqual([])
  })

  it('k3 支持思考：结构化任务不会因 structured 标志被改成 off', () => {
    const result = convergeRequestParams({ temperature: 0.3, reasoningEffort: 'high' }, 'kimi-k3', { structured: true })
    expect(result.reasoningEffort).toBe('high')
  })
})

/**
 * 「测试连通」也是真实调用，同样必须过能力层。
 *
 * 这条集成测试存在的原因：`testLlmModel` 为省 token 自己构造请求（拿到首块即停），
 * **不经过 `complete()`**，所以它一度绕过了收敛 —— 对固定温度的模型，"测试连通"
 * 会报参数错误，而那正是用户用来判断配置对不对的地方。这里用假 ctx 断言它实际
 * 下发的请求已经收敛。
 */
describe('testLlmModel 的请求收敛（集成）', () => {
  /** 造一个假 ctx，捕获真正下发给 llm.stream 的请求。 */
  function captureCtx(captured: Array<Record<string, unknown>>): never {
    return {
      llm: {
        // eslint-disable-next-line require-yield
        stream: async function* (request: Record<string, unknown>) {
          captured.push(request)
          throw Object.assign(new Error('stop after capture'), { code: 'TEST' })
        },
      },
    } as never
  }

  it('固定温度的模型：下发的请求里不再出现 temperature', async () => {
    const captured: Array<Record<string, unknown>> = []
    const result = await testLlmModel(captureCtx(captured), 'moonshot', 'kimi-k3')
    expect(result.ok).toBe(false) // 假 ctx 必然"失败"，这里只关心下发了什么
    expect(captured).toHaveLength(1)
    expect(captured[0]?.temperature).toBeUndefined()
    expect(captured[0]?.model).toBe('kimi-k3')
  })

  it('无约束的模型：原样保留调用方设定的温度', async () => {
    const captured: Array<Record<string, unknown>> = []
    await testLlmModel(captureCtx(captured), 'deepseek-official', 'deepseek-flash')
    expect(captured[0]?.temperature).toBe(0)
  })

  it('不支持 reasoning_effort 的模型：该参数不会被下发', async () => {
    const captured: Array<Record<string, unknown>> = []
    await testLlmModel(captureCtx(captured), 'moonshot', 'kimi-k2.7-code')
    expect(captured[0]?.reasoningEffort).toBeUndefined()
  })
})
