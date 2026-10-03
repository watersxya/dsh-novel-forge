/**
 * localStorage 值的解析 / 校验（纯函数，零依赖，可离线单测）。
 *
 * ## 为什么单独成文件
 *
 * `usePersistentState.ts` 需要 React，而本插件的测试环境是 node
 * （vitest.config.ts `environment: 'node'`，无 jsdom），import React 会直接失败。
 * 但这个模块真正容易出错的地方**不在 hook 本身**（`useState` + `useCallback`
 * 是标准写法），而在**校验逻辑**：一旦校验写漏，脏数据会被写进 localStorage，
 * 之后每次启动都读到它，且没有恢复路径——作者只能手动清缓存。
 *
 * 所以把校验做成零依赖的纯函数，让「最容易错的部分」可以完整验证。
 */

/**
 * 受枚举约束的字符串。
 *
 * @param raw - localStorage 里的原始字符串。
 * @param allowed - 合法值集合。
 * @returns 合法则返回该值；否则 undefined（调用方应回落默认值）。
 */
export function parseEnum<T extends string>(raw: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(raw) ? raw as T : undefined
}

/**
 * 受上下界约束的整数。
 *
 * 先 `Number.isFinite` 再四舍五入——顺序很关键：先取整的话
 * `NaN` 会被 `Math.round` 变成 `NaN` 之外的怪值，或被 `||` 当成 0 误收。
 *
 * @param raw - localStorage 里的原始字符串。
 * @param min - 下界（含）。
 * @param max - 上界（含）。
 * @returns 合法则返回整数；否则 undefined。
 */
export function parseIntInRange(raw: string, min: number, max: number): number | undefined {
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  const i = Math.round(n)
  return i >= min && i <= max ? i : undefined
}

/**
 * 解析一个 JSON 对象，字段逐个校验，缺失/错类型回落默认值。
 *
 * 用于悬浮窗位置尺寸这类**结构固定但字段可能残缺**的数据。之所以不直接
 * `JSON.parse` 后强转（`as {x?: unknown}`），是因为那样 `NaN` / 字符串 / `null`
 * 都会被放过去，最终变成一个 `left: NaNpx` 的悬浮窗——不报错，只是不见了。
 *
 * @param raw - localStorage 里的原始字符串。
 * @param keys - 需要的字段名。
 * @param fallback - 各字段的默认值（与 keys 一一对应）。
 * @returns 校验通过的完整对象；解析失败返回 undefined。
 */
export function parseNumberRecord<K extends string>(
  raw: string,
  keys: readonly K[],
  fallback: Record<K, number>,
): Record<K, number> | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const out = {} as Record<K, number>
  for (const k of keys) {
    const v = (parsed as Record<string, unknown>)[k]
    // 只接受有限数字：NaN / Infinity 写进 style 会让元素直接消失
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : fallback[k]
  }
  return out
}
