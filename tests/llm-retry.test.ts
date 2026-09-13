/**
 * 纯逻辑单测：模型失败恢复规则（可离线跑）。
 *
 * 规则来源：批量连写时主模型偶发限流/超时/额度耗尽会让整批中断；
 * 换模型重试一次通常能过去，但必须排除「用户取消 / 参数错误」这类不该重试的情况。
 */
import { describe, it, expect } from 'vitest'
import { isRetryableLlmError, shouldSwitchModel, withModelFallback } from '../src/llm-retry.ts'

describe('isRetryableLlmError', () => {
  it('网络 / 超时 / 限流 / 服务端 / 额度类错误可重试', () => {
    const cases = [
      'LLM 调用失败（error）: socket hang up',
      'fetch failed',
      '请求超时',
      'rate limit exceeded (429)',
      '503 Service Unavailable',
      'model overloaded, try again later',
      'insufficient balance / quota exceeded',
      '账户额度不足',
    ]
    for (const message of cases) expect(isRetryableLlmError(new Error(message)), message).toBe(true)
  })

  it('用户取消与参数/契约类错误不可重试', () => {
    const cases = [
      'LLM 调用失败（aborted）: user aborted the request',
      '章节 3 不在计划中',
      '未知工具 foo',
      'chapter_text 需要 no',
    ]
    for (const message of cases) expect(isRetryableLlmError(new Error(message)), message).toBe(false)
  })
})

describe('shouldSwitchModel', () => {
  it('未配置备用模型 / 与主模型相同 → 不切换', () => {
    expect(shouldSwitchModel('', 'deepseek-flash', new Error('请求超时'))).toBe(false)
    expect(shouldSwitchModel(undefined, 'deepseek-flash', new Error('请求超时'))).toBe(false)
    expect(shouldSwitchModel('deepseek-flash', 'deepseek-flash', new Error('请求超时'))).toBe(false)
  })

  it('配置了不同的备用模型 + 可重试错误 → 切换', () => {
    expect(shouldSwitchModel('deepseek-v4-pro', 'deepseek-flash', new Error('请求超时'))).toBe(true)
  })

  it('不可重试错误即使配了备用模型也不切换', () => {
    expect(shouldSwitchModel('deepseek-v4-pro', 'deepseek-flash', new Error('章节 3 不在计划中'))).toBe(false)
  })
})

describe('withModelFallback', () => {
  it('主模型成功时只调用一次', async () => {
    const seen: string[] = []
    const result = await withModelFallback({ model: 'A', fallbackModel: 'B' }, async (model) => {
      seen.push(model)
      return `ok:${model}`
    })
    expect(result).toBe('ok:A')
    expect(seen).toEqual(['A'])
  })

  it('主模型失败且可重试时切到备用模型', async () => {
    const seen: string[] = []
    const result = await withModelFallback({ model: 'A', fallbackModel: 'B' }, async (model) => {
      seen.push(model)
      if (model === 'A') throw new Error('请求超时')
      return `ok:${model}`
    })
    expect(result).toBe('ok:B')
    expect(seen).toEqual(['A', 'B'])
  })

  it('备用模型也失败时抛主模型的原始错误（保留第一现场）', async () => {
    await expect(withModelFallback({ model: 'A', fallbackModel: 'B' }, async (model) => {
      throw new Error(model === 'A' ? '请求超时（主）' : '服务不可用（备）')
    })).rejects.toThrow('请求超时（主）')
  })

  it('不可重试错误不切换，直接抛错', async () => {
    const seen: string[] = []
    await expect(withModelFallback({ model: 'A', fallbackModel: 'B' }, async (model) => {
      seen.push(model)
      throw new Error('章节 3 不在计划中')
    })).rejects.toThrow('章节 3 不在计划中')
    expect(seen).toEqual(['A'])
  })

  it('未配置备用模型时只尝试一次', async () => {
    const seen: string[] = []
    await expect(withModelFallback({ model: 'A' }, async (model) => {
      seen.push(model)
      throw new Error('请求超时')
    })).rejects.toThrow('请求超时')
    expect(seen).toEqual(['A'])
  })

  it('切换时回调 onSwitch（供 UI/日志记录）', async () => {
    const switches: string[] = []
    await withModelFallback(
      { model: 'A', fallbackModel: 'B', onSwitch: (from, to, error) => { switches.push(`${from}->${to}:${(error as Error).message}`) } },
      async (model) => {
        if (model === 'A') throw new Error('请求超时')
        return 'ok'
      },
    )
    expect(switches).toEqual(['A->B:请求超时'])
  })
})
