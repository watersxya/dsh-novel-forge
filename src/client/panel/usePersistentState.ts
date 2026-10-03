/**
 * localStorage 背书的持久化 state。
 *
 * ## 为什么值得抽
 *
 * 面板里有 6 处「读 localStorage → 校验 → 兜底默认值 → 写回」的代码，
 * 结构几乎一模一样，只在**键名、解析方式、默认值**上不同。同一件事写六份，
 * 于是每写一份都要重新想一遍「校验失败怎么办」，而这里最容易出的错是
 * **校验写漏**——脏数据一旦写进去，之后每次启动都读到它，且没有恢复路径。
 *
 * 抽成hook 后「校验」成为**必填参数**：想新增一个持久化字段，
 * 不可能不给出它的合法性判断（编译期就会挡住）。
 *
 * ## 刻意的设计
 *
 * - **写入永不抛错**。隐私模式 / 配额满 / SSR 环境下 `localStorage` 可能直接抛，
 *   界面不该因此崩——只读得到、写不进去，退化成「本次会话内的临时状态」。
 * - **读取也永不抛错**，`parse` 失败一律回落默认值。
 * - **只在挂载时读一次**。localStorage 不是响应式源，setItem 不会通知 React；
 *   若在每次渲染读，会造成「读-改-写」循环。故写入由调用方显式调用 `set`。
 */
import { useCallback, useRef, useState } from 'react'

/** 安全拿 localStorage：非浏览器环境（SSR / 测试）为 undefined。 */
function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    // 某些浏览器在隐私模式下访问 localStorage 本身就抛 SecurityError。
    return undefined
  }
}

export interface PersistentStateOptions<T> {
  /** localStorage 键。 */
  key: string
  /** 读取时的解析与校验；返回 undefined 表示「数据不可用」，用默认值。 */
  parse: (raw: string) => T | undefined
  /** 写入时的序列化。 */
  serialize: (value: T) => string
  /** 读取失败 / 无数据 / 校验不过时的默认值。 */
  fallback: T
}

/**
 * 一个与 localStorage 同步的 state。
 *
 * @returns `[当前值, 设置函数]`。设置函数会同步写回 localStorage。
 */
export function usePersistentState<T>(
  options: PersistentStateOptions<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const { key, parse, serialize, fallback } = options
  // options 若由调用方内联创建（常见）则每次渲染都是新对象，
  // 所以下面的回调不能把它放进依赖数组，否则 setter 身份每渲染都变。
  const optsRef = useRef({ parse, serialize })
  optsRef.current = { parse, serialize }

  const [value, setValue] = useState<T>(() => {
    const store = safeStorage()
    if (store === undefined) return fallback
    try {
      const raw = store.getItem(key)
      if (raw === null) return fallback
      const parsed = optsRef.current.parse(raw)
      return parsed === undefined ? fallback : parsed
    } catch {
      return fallback
    }
  })

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      const store = safeStorage()
      if (store !== undefined) {
        try { store.setItem(key, optsRef.current.serialize(resolved)) } catch { /* 配额满/隐私模式：只留内存态 */ }
      }
      return resolved
    })
  }, [key])

  return [value, set]
}

export { parseEnum, parseIntInRange } from './storage-parse.ts'
