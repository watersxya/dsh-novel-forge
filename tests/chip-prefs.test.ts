/**
 * 右上角生成状态芯片的显示偏好（三态）。
 *
 * 这些用例锁住三件事：
 *  1. 存储缺失 / 非法 / 不可用时必须安全回落到默认值，绝不抛错（隐私模式下也要能开面板）；
 *  2. 三态判据 `isRunChipVisible` 的唯一真值表（含「没有生产单状态时永远不显示」）；
 *  3. 同页写入要通知订阅者（设置页下拉一改，芯片立刻响应，不必等下一轮询）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RUN_CHIP_MODE,
  isRunChipVisible,
  readRunChipMode,
  RUN_CHIP_MODE_KEY,
  RUN_CHIP_MODE_OPTIONS,
  subscribeRunChipMode,
  writeRunChipMode,
  type RunChipMode,
} from '../src/client/chip-prefs.ts'
import type { RunState } from '../src/protocol.ts'

/** 最小 localStorage 替身（记录写入，支持删除与异常注入）。 */
function fakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get length() { return data.size },
    clear: () => { data.clear() },
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k) },
    setItem: (k: string, v: string) => { data.set(k, String(v)) },
  } as Storage & { data: Map<string, string> }
}

function runState(status: RunState['status']): RunState {
  return {
    runId: 'r1', status, startNo: 1, endNo: 3, currentNo: 2, log: [],
    stats: { generated: 0, revised: 0, exempted: 0, regenerated: 0, error: 0 },
    pendingManual: [],
  } as unknown as RunState
}

let store: Storage & { data: Map<string, string> }

beforeEach(() => {
  store = fakeStorage()
  vi.stubGlobal('localStorage', store)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('读取偏好', () => {
  it('未设置时为默认（总是显示，与历史行为一致）', () => {
    expect(DEFAULT_RUN_CHIP_MODE).toBe('always')
    expect(readRunChipMode()).toBe('always')
  })

  it('非法值回落到默认', () => {
    store.setItem(RUN_CHIP_MODE_KEY, 'sometimes')
    expect(readRunChipMode()).toBe('always')
    expect(readRunChipMode()).not.toBe('sometimes')
  })

  it('localStorage 抛异常时不炸（隐私模式）', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(readRunChipMode()).toBe(DEFAULT_RUN_CHIP_MODE)
    expect(() => writeRunChipMode('off')).not.toThrow()
  })
})

describe('写入与订阅', () => {
  it('写入后可读回，并通知同页订阅者', () => {
    const seen: RunChipMode[] = []
    const off = subscribeRunChipMode(m => seen.push(m))
    writeRunChipMode('active')
    writeRunChipMode('off')
    off()
    writeRunChipMode('always')
    expect(store.data.get(RUN_CHIP_MODE_KEY)).toBe('always')
    expect(seen).toEqual(['active', 'off'])
  })

  it('退订之后不再收到通知', () => {
    let count = 0
    const off = subscribeRunChipMode(() => { count++ })
    writeRunChipMode('off')
    off()
    writeRunChipMode('always')
    expect(count).toBe(1)
  })

  it('单个订阅者抛错不影响其它订阅者', () => {
    const seen: RunChipMode[] = []
    const bad = subscribeRunChipMode(() => { throw new Error('boom') })
    const good = subscribeRunChipMode(m => seen.push(m))
    expect(() => writeRunChipMode('active')).not.toThrow()
    expect(seen).toEqual(['active'])
    bad(); good()
  })

  it('三个选项齐全且顺序稳定（设置页下拉依赖它）', () => {
    expect(RUN_CHIP_MODE_OPTIONS.map(o => o.value)).toEqual(['always', 'active', 'off'])
  })
})

describe('isRunChipVisible 真值表', () => {
  it('没有生产单状态时永远不显示（任何模式）', () => {
    for (const mode of ['off', 'active', 'always'] as const) {
      expect(isRunChipVisible(mode, null)).toBe(false)
      expect(isRunChipVisible(mode, undefined)).toBe(false)
    }
  })

  it('关闭时任何状态都不显示', () => {
    for (const s of ['running', 'paused', 'done', 'stopped', 'error'] as const) {
      expect(isRunChipVisible('off', runState(s))).toBe(false)
    }
  })

  it('仅运行中：只在 running / paused 显示', () => {
    expect(isRunChipVisible('active', runState('running'))).toBe(true)
    expect(isRunChipVisible('active', runState('paused'))).toBe(true)
    for (const s of ['done', 'stopped', 'error'] as const) {
      expect(isRunChipVisible('active', runState(s))).toBe(false)
    }
  })

  it('总是显示：有任何生产单状态就显示', () => {
    for (const s of ['running', 'paused', 'done', 'stopped', 'error'] as const) {
      expect(isRunChipVisible('always', runState(s))).toBe(true)
    }
  })
})
