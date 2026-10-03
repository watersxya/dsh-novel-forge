/**
 * `usePersistentState` 的解析器契约（离线）。
 *
 * ## 为什么只测解析器
 *
 * 插件的测试环境是 node（vitest.config.ts `environment: 'node'`），没有 jsdom，
 * React hook 跑不起来。但这个 hook 真正容易出错的地方不在 hook 本身
 * （`useState` + `useCallback` 是标准写法），而在**校验逻辑**：
 * 一旦校验写漏，脏数据会被写进 localStorage，之后每次启动都读到它，
 * 且没有恢复路径——作者只能手动清缓存。
 *
 * 所以把「校验」做成必填参数（编译期保证不会漏），并把两个解析器拆到零依赖的
 * {@link ../src/client/panel/storage-parse.ts}，在这里把它们的边界钉死。
 */
import { describe, it, expect } from 'vitest'
import { parseEnum, parseIntInRange, parseNumberRecord } from '../src/client/panel/storage-parse.ts'

describe('parseEnum', () => {
  const ALLOWED = ['system', 'light', 'dark'] as const

  it('合法值原样返回', () => {
    expect(parseEnum('light', ALLOWED)).toBe('light')
    expect(parseEnum('dark', ALLOWED)).toBe('dark')
    expect(parseEnum('system', ALLOWED)).toBe('system')
  })

  it('不在枚举内的值返回 undefined（必须被拒绝）', () => {
    expect(parseEnum('sepia', ALLOWED)).toBeUndefined()
    expect(parseEnum('', ALLOWED)).toBeUndefined()
  })

  it('大小写敏感：LIGHT 是脏数据，不接受', () => {
    // 宽容地接受大小写差异看似友好，实则会让「用户手改了 localStorage」
    // 这类脏数据静默生效，且两处界面可能因大小写不同而分歧。
    expect(parseEnum('LIGHT', ALLOWED)).toBeUndefined()
  })

  it('前后空白不被容忍（写盘时不该产生空白，这里也不该接受）', () => {
    expect(parseEnum(' light', ALLOWED)).toBeUndefined()
    expect(parseEnum('light ', ALLOWED)).toBeUndefined()
  })

  it('原型链上的属性名不会被误认（如 toString / constructor）', () => {
    // 若实现写成 allowed.includes(raw) 之外的宽松匹配，这类会漏进来。
    expect(parseEnum('toString', ALLOWED)).toBeUndefined()
    expect(parseEnum('constructor', ALLOWED)).toBeUndefined()
    expect(parseEnum('__proto__', ALLOWED)).toBeUndefined()
  })
})

describe('parseIntInRange', () => {
  it('区间内的整数原样返回', () => {
    expect(parseIntInRange('14', 12, 24)).toBe(14)
    expect(parseIntInRange('12', 12, 24)).toBe(12)
    expect(parseIntInRange('24', 12, 24)).toBe(24)
  })

  it('区间外返回 undefined', () => {
    expect(parseIntInRange('11', 12, 24)).toBeUndefined()
    expect(parseIntInRange('25', 12, 24)).toBeUndefined()
  })

  it('非数字 / NaN / Infinity 返回 undefined', () => {
    expect(parseIntInRange('', 12, 24)).toBeUndefined()
    expect(parseIntInRange('abc', 12, 24)).toBeUndefined()
    expect(parseIntInRange('NaN', 12, 24)).toBeUndefined()
    expect(parseIntInRange('Infinity', 12, 24)).toBeUndefined()
    expect(parseIntInRange('-Infinity', 12, 24)).toBeUndefined()
  })

  it('非数字字符串不会 Number() 成 NaN 后被Finite 漏过', () => {
    // 回归：曾用 truthy 判断，'0' 会被当成合法
    expect(parseIntInRange('0', 12, 24)).toBeUndefined()
    expect(parseIntInRange('null', 12, 24)).toBeUndefined()
    expect(parseIntInRange('undefined', 12, 24)).toBeUndefined()
  })

  it('小数四舍五入到整数后再判区间', () => {
    // 字号这类值存成 14.4 不应被拒（浏览器缩放不会产生，但手改可能）
    expect(parseIntInRange('14.4', 12, 24)).toBe(14)
    expect(parseIntInRange('14.6', 12, 24)).toBe(15)
    // 11.6 四舍五入为 12，仍落在闭区间内 → 接受（区间判定发生在取整之后）
    expect(parseIntInRange('11.6', 12, 24)).toBe(12)
    // 但 11.4 → 11 越界，必须拒
    expect(parseIntInRange('11.4', 12, 24)).toBeUndefined()
  })

  it('指数写法按其数值判区间（1e1 = 10）', () => {
    expect(parseIntInRange('1e1', 5, 15)).toBe(10)
    // 10 不在 [12,24] 内 → 必须拒。这条是刻意的：不能因为「看起来像整数」就收。
    expect(parseIntInRange('1e1', 12, 24)).toBeUndefined()
  })
})

describe('parseNumberRecord（悬浮窗位置/尺寸）', () => {
  const POS = ['x', 'y'] as const
  const POS_DEFAULT = { x: 60, y: 120 }

  it('正常对象逐字段返回', () => {
    expect(parseNumberRecord('{"x":10,"y":20}', POS, POS_DEFAULT)).toEqual({ x: 10, y: 20 })
  })

  it('小数与负偏移（拖拽可以拖出面板）都接受', () => {
    expect(parseNumberRecord('{"x":-12.5,"y":0}', POS, POS_DEFAULT)).toEqual({ x: -12.5, y: 0 })
  })

  it('字段缺失 → 回落默认值', () => {
    expect(parseNumberRecord('{"x":10}', POS, POS_DEFAULT)).toEqual({ x: 10, y: 120 })
  })

  it('字段类型错（字符串/布尔/null）→ 该字段回落默认，不影响其他字段', () => {
    expect(parseNumberRecord('{"x":"10","y":true}', POS, POS_DEFAULT)).toEqual({ x: 60, y: 120 })
    expect(parseNumberRecord('{"x":10,"y":null}', POS, POS_DEFAULT)).toEqual({ x: 10, y: 120 })
  })

  it('核心回归：NaN / Infinity 必须被拒', () => {
    // JSON.parse 本身产不出 NaN/Infinity，但脏数据或手改可能塞进来。
    // 放过去的后果不是报错，而是 style 里出现 left: NaNpx —— 元素直接消失，
    // 作者会以为面板坏了。
    expect(parseNumberRecord('{"x":1e999,"y":0}', POS, POS_DEFAULT)).toEqual({ x: 60, y: 0 })
    expect(parseNumberRecord('{"x":0,"y":-1e999}', POS, POS_DEFAULT)).toEqual({ x: 0, y: 120 })
  })

  it('非法 JSON / 非对象 / 数组 / null → undefined（调用方用 fallback）', () => {
    expect(parseNumberRecord('{bad json', POS, POS_DEFAULT)).toBeUndefined()
    expect(parseNumberRecord('null', POS, POS_DEFAULT)).toBeUndefined()
    expect(parseNumberRecord('[1,2]', POS, POS_DEFAULT)).toBeUndefined()
    expect(parseNumberRecord('"str"', POS, POS_DEFAULT)).toBeUndefined()
    expect(parseNumberRecord('', POS, POS_DEFAULT)).toBeUndefined()
  })

  it('多余的键被忽略（不泄漏到结果）', () => {
    expect(parseNumberRecord('{"x":1,"y":2,"z":999}', POS, POS_DEFAULT)).toEqual({ x: 1, y: 2 })
  })

  it('空对象 → 全部回落默认', () => {
    expect(parseNumberRecord('{}', POS, POS_DEFAULT)).toEqual({ x: 60, y: 120 })
  })
})
