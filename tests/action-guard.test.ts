/**
 * 纯逻辑单测：动作失败分级 / fail-stop 规则（不依赖 LLM，可离线跑）。
 *
 * 规则来源：参数/契约类失败不得原样重复调用；
 * 瞬时故障允许有限重试。规则必须可测试，否则只是文档。
 */
import { describe, it, expect } from 'vitest'
import {
  NovelActionError,
  classifyActionError,
  actionRetryLimit,
  safeArgsKey,
  FailureLedger,
} from '../src/action-guard.ts'

describe('classifyActionError', () => {
  it('显式带分级的错误按声明分级', () => {
    expect(classifyActionError(new NovelActionError('contract', '任意'))).toBe('contract')
    expect(classifyActionError(new NovelActionError('transient', '任意'))).toBe('transient')
  })

  it('参数/契约类错误识别为 contract（不重试）', () => {
    const cases = [
      '动作参数不是合法 JSON：{"no":',
      '未知工具 foo_bar',
      'chapter_text 需要 no',
      '章节 3 不存在',
      '章节 3 尚未生成',
      '总纲中未找到片段「……',
      '非法状态 published',
      '章节 1 不在计划中',
      '章节 3 的正文文件不存在',
      '本书还没有已写章节，无法反推大纲',
      '没有可分析的已写章节（需要已生成并带摘要）',
      '输出目录中没有项目，请先加载大纲',
    ]
    for (const message of cases) {
      expect(classifyActionError(new Error(message)), message).toBe('contract')
    }
  })

  it('瞬时故障识别为 transient（允许重试一次）', () => {
    const cases = [
      '助手调用失败（error）: socket hang up',
      'fetch failed',
      '请求超时',
      'rate limit exceeded (429)',
      'ENOSPC: no space left on device',
    ]
    for (const message of cases) {
      expect(classifyActionError(new Error(message)), message).toBe('transient')
    }
  })

  it('引擎前置条件被显式标注为 contract（不靠正则猜）', () => {
    expect(classifyActionError(new NovelActionError('contract', '章节 9 不在计划中'))).toBe('contract')
  })

  it('契约词优先于默认值：未知错误默认按瞬时处理（仍有次数上限兜底）', () => {
    expect(classifyActionError(new Error('something entirely unexpected'))).toBe('transient')
    expect(classifyActionError('非 Error 值')).toBe('transient')
  })
})

describe('actionRetryLimit', () => {
  it('contract 只允许 1 次尝试，transient 允许 2 次', () => {
    expect(actionRetryLimit('contract')).toBe(1)
    expect(actionRetryLimit('transient')).toBe(2)
  })
})

describe('safeArgsKey', () => {
  it('键顺序不影响签名（同一个调用应被识别为同一个）', () => {
    expect(safeArgsKey({ no: 3, text: 'x' })).toBe(safeArgsKey({ text: 'x', no: 3 }))
  })

  it('参数不同则签名不同', () => {
    expect(safeArgsKey({ no: 3 })).not.toBe(safeArgsKey({ no: 4 }))
    expect(safeArgsKey({ no: 3 })).not.toBe(safeArgsKey({ no: 3, target: 'a' }))
  })

  it('undefined 参数返回空签名', () => {
    expect(safeArgsKey(undefined)).toBe('')
  })
})

describe('FailureLedger（fail-stop 记账）', () => {
  it('契约类：第一次失败即达到上限，禁止原样重复', () => {
    const ledger = new FailureLedger()
    const first = ledger.record('chapter_rewrite', { no: 3, target: '不存在的一段' }, 'contract')
    expect(first).toEqual({ attempts: 1, stop: true })
  })

  it('瞬时类：允许一次重试，第二次失败才停止', () => {
    const ledger = new FailureLedger()
    expect(ledger.record('chapter_generate', { no: 5 }, 'transient').stop).toBe(false)
    expect(ledger.record('chapter_generate', { no: 5 }, 'transient').stop).toBe(true)
  })

  it('换了参数视为新调用，重新计数', () => {
    const ledger = new FailureLedger()
    expect(ledger.record('chapter_text', { no: 3 }, 'contract').stop).toBe(true)
    const corrected = ledger.record('chapter_text', { no: 4 }, 'contract')
    expect(corrected).toEqual({ attempts: 1, stop: true })
    expect(ledger.size).toBe(2)
  })

  it('键顺序不同但内容相同的调用共享计数', () => {
    const ledger = new FailureLedger()
    ledger.record('x', { a: 1, b: 2 }, 'transient')
    expect(ledger.record('x', { b: 2, a: 1 }, 'transient').stop).toBe(true)
  })
})
