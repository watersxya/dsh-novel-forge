/**
 * 「取消 ≠ 失败」单测：作者关页面 / 主动中断在账本与面板上都不能被当成模型失败。
 *
 * 背景：中断曾经有三处说谎——用量账本计入 failed、实况会话停在「生成中」永不结案、
 * 章节留在 generating 让下一次生成撞上 409。三处各自的判定都收敛到 isCancellation。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emitLive, liveUsage, resetLiveUsage } from '../src/llm-live.ts'
import { applyFrame, isActivePhase, type LlmLiveSession } from '../src/client/llmLive.ts'
import type { LlmLiveFrame } from '../src/protocol.ts'

/** 构造一条 session_completed 帧。 */
function completedFrame(partial: Partial<LlmLiveFrame>): LlmLiveFrame {
  return { type: 'session_completed', sessionId: 'll-1', label: '正文生成', at: '2026-10-05T00:00:00.000Z', ...partial }
}

describe('用量账本', () => {
  beforeEach(() => { resetLiveUsage() })

  it('取消计入调用次数但不计入失败', () => {
    emitLive(completedFrame({ phase: 'cancelled', elapsedMs: 900, usage: { inputTokens: 10, outputTokens: 20 } }))
    const usage = liveUsage()
    expect(usage.calls).toBe(1)
    expect(usage.failed).toBe(0)
    expect(usage.outputTokens).toBe(20)
  })

  it('真实失败才计入失败', () => {
    emitLive(completedFrame({ phase: 'failed', error: '请求超时' }))
    expect(liveUsage().failed).toBe(1)
  })

  it('成功与取消混在一起时失败仍为 0', () => {
    emitLive(completedFrame({ phase: 'completed' }))
    emitLive(completedFrame({ phase: 'cancelled' }))
    emitLive(completedFrame({ phase: 'cancelled' }))
    expect(liveUsage()).toMatchObject({ calls: 3, failed: 0 })
  })
})

describe('实况面板会话归约', () => {
  /** 一次已开始的调用（处于生成中）。 */
  function streamingSession(): Record<string, LlmLiveSession> {
    let current: Record<string, LlmLiveSession> = {}
    current = applyFrame(current, { type: 'session_started', sessionId: 'll-9', label: '正文生成', at: '2026-10-05T00:00:00.000Z' })
    current = applyFrame(current, { type: 'output_delta', sessionId: 'll-9', content: '第一章', totalChars: 3, at: '2026-10-05T00:00:01.000Z' })
    return current
  }

  it('取消后阶段结案，不再算作进行中', () => {
    const current = applyFrame(streamingSession(), completedFrame({ sessionId: 'll-9', phase: 'cancelled', error: '客户端已断开，生成中止', at: '2026-10-05T00:00:02.000Z' }))
    const session = current['ll-9']
    if (session === undefined) throw new Error('会话应已存在')
    expect(session.phase).toBe('cancelled')
    expect(isActivePhase(session.phase)).toBe(false)
    expect(session.phaseMessage).toBe('客户端已断开，生成中止')
    expect(session.preview).toBe('第一章')
  })

  it('取消帧没带原因时也有可读说明，不会显示成「完成」', () => {
    const current = applyFrame(streamingSession(), completedFrame({ sessionId: 'll-9', phase: 'cancelled', at: '2026-10-05T00:00:02.000Z' }))
    expect(current['ll-9']?.phaseMessage).toBe('已取消（作者中断或页面关闭）')
  })

  it('结束后迟到的增量不会把会话拉回生成中', () => {
    const done = applyFrame(streamingSession(), completedFrame({ sessionId: 'll-9', phase: 'cancelled', at: '2026-10-05T00:00:02.000Z' }))
    const after = applyFrame(done, { type: 'output_delta', sessionId: 'll-9', content: '尾巴', at: '2026-10-05T00:00:03.000Z' })
    expect(after['ll-9']?.phase).toBe('cancelled')
  })
})

describe('isActivePhase', () => {
  it('只有请求中 / 生成中算进行中', () => {
    expect(isActivePhase('requesting')).toBe(true)
    expect(isActivePhase('streaming')).toBe(true)
    for (const phase of ['completed', 'failed', 'cancelled'] as const) {
      expect(isActivePhase(phase)).toBe(false)
    }
  })
})
