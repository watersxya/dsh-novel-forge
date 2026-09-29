/**
 * 配置持久化的段寻址与失败降级（离线）。
 *
 * 背景：Harness 0.2 由 Loader 从插件导出的 Config 推导 settings 段，段 id =
 * 该 entry 的 id，插件方**不可假定**它等于包名/声明的常量。旧实现写死
 * `'dsh-novel-forge'`，段不可寻址时 `settings.update` 抛错，/config 直接 400
 * ——设置看起来"保存失败"，实际是寻址错了。这里锁住三条契约：
 *   1. entry id 优先，声明名只在宿主真的登记了它时才用（绝不猜段名写入）；
 *   2. 无法寻址时改动仍在进程中生效，并如实告知未持久化（不是报错）；
 *   3. 写入失败同 2，不吞掉编辑、不误报成功。
 */
import { describe, expect, it } from 'vitest'
import {
  novelSettingsNamespace,
  persistConfigPatch,
  resolveSettingsTarget,
  type SettingsLike,
} from '../src/settings-persist.ts'

/** 造一个能枚举段、会记录写入的假 settings 服务。 */
function fakeSettings(names: string[], fail?: string): SettingsLike & { written: Array<{ ns: string; patch: Record<string, unknown> }> } {
  const written: Array<{ ns: string; patch: Record<string, unknown> }> = []
  return {
    written,
    describe: () => names.map(ns => ({ ns })),
    update: async (ns, patch) => {
      if (fail !== undefined && ns === fail) throw new Error(`No configurable plugin entry "${ns}"`)
      written.push({ ns, patch })
    },
  }
}

describe('novelSettingsNamespace', () => {
  it('从 ctx.fiber.entry.options.id 读段 id（不可假定等于声明常量）', () => {
    expect(novelSettingsNamespace({ fiber: { entry: { options: { id: 'k3f9a1bc' } } } })).toBe('k3f9a1bc')
    expect(novelSettingsNamespace({ fiber: { entry: { options: { id: '@waterwx/dsh-novel-forge' } } } }))
      .toBe('@waterwx/dsh-novel-forge')
  })

  it('没有 entry（手工构造的 ctx）时返回 undefined，而不是猜一个', () => {
    expect(novelSettingsNamespace({})).toBeUndefined()
    expect(novelSettingsNamespace({ fiber: {} })).toBeUndefined()
    expect(novelSettingsNamespace({ fiber: { entry: { options: {} } } })).toBeUndefined()
    expect(novelSettingsNamespace({ fiber: { entry: { options: { id: '   ' } } } })).toBeUndefined()
    expect(novelSettingsNamespace(undefined)).toBeUndefined()
  })
})

describe('resolveSettingsTarget', () => {
  it('entry id 在宿主登记的段里 → 用它', () => {
    const settings = fakeSettings(['ui-theme', 'k3f9a1bc'])
    expect(resolveSettingsTarget(settings, 'k3f9a1bc', 'dsh-novel-forge')).toBe('k3f9a1bc')
  })

  it('entry id 不在列表里，但声明名登记了 → 回退到声明名（0.1.x 接线）', () => {
    const settings = fakeSettings(['dsh-novel-forge'])
    expect(resolveSettingsTarget(settings, 'k3f9a1bc', 'dsh-novel-forge')).toBe('dsh-novel-forge')
    expect(resolveSettingsTarget(settings, undefined, 'dsh-novel-forge')).toBe('dsh-novel-forge')
  })

  it('两个都不在列表里 → undefined（绝不拿猜到的段名去写别人的配置）', () => {
    const settings = fakeSettings(['ui-theme', 'agent-default-model'])
    expect(resolveSettingsTarget(settings, 'k3f9a1bc', 'dsh-novel-forge')).toBeUndefined()
    expect(resolveSettingsTarget(settings, undefined, 'dsh-novel-forge')).toBeUndefined()
  })

  it('宿主没有 update → undefined（即使能枚举）', () => {
    expect(resolveSettingsTarget({ describe: () => [{ ns: 'k3f9a1bc' }] }, 'k3f9a1bc', 'dsh-novel-forge')).toBeUndefined()
    expect(resolveSettingsTarget(undefined, 'k3f9a1bc', 'dsh-novel-forge')).toBeUndefined()
  })

  it('宿主无法枚举（没有 describe）→ 信任它给出的 entry id', () => {
    expect(resolveSettingsTarget({ update: async () => undefined }, 'k3f9a1bc', 'dsh-novel-forge')).toBe('k3f9a1bc')
  })

  it('describe 抛错 → 退回 entry id（不能让枚举失败挡掉保存）', () => {
    const settings: SettingsLike = {
      update: async () => undefined,
      describe: () => { throw new Error('not available') },
    }
    expect(resolveSettingsTarget(settings, 'k3f9a1bc', 'dsh-novel-forge')).toBe('k3f9a1bc')
  })
})

describe('persistConfigPatch', () => {
  it('段可寻址时写入该段，并返回合并后的配置、不带告警', async () => {
    const settings = fakeSettings(['k3f9a1bc'])
    const result = await persistConfigPatch({ chapterChars: 3500 }, { chapterChars: 4000 }, settings, 'k3f9a1bc', 'dsh-novel-forge')
    expect(result.config.chapterChars).toBe(4000)
    expect(result.settingsWarning).toBeUndefined()
    expect(settings.written).toEqual([{ ns: 'k3f9a1bc', patch: { chapterChars: 4000 } }])
  })

  it('段不可寻址（0.2.x 的 entry id 对不上）→ 改动仍生效 + 如实告警，不抛错', async () => {
    const settings = fakeSettings(['ui-theme'])
    const result = await persistConfigPatch({ chapterChars: 3500 }, { chapterChars: 4000 }, settings, 'k3f9a1bc', 'dsh-novel-forge')
    expect(result.config.chapterChars).toBe(4000)
    expect(result.settingsWarning).toContain('未登记')
    // 告警要带诊断信息，否则作者无法区分「段 id 错了」与「段压根没登记」。
    expect(result.settingsWarning).toContain('k3f9a1bc')
    expect(result.settingsWarning).toContain('ui-theme')
    expect(settings.written).toEqual([])
  })

  it('宿主没有 settings 服务 → 只改内存 + 告警', async () => {
    const result = await persistConfigPatch({ model: 'a' }, { model: 'b' }, undefined, undefined, 'dsh-novel-forge')
    expect(result.config.model).toBe('b')
    expect(result.settingsWarning).toContain('settings.update')
  })

  it('写入抛错（段被 home/CLI patch 覆盖等）→ 保留编辑并说明原因', async () => {
    const settings = fakeSettings(['k3f9a1bc'], 'k3f9a1bc')
    const result = await persistConfigPatch({ model: 'a' }, { model: 'b' }, settings, 'k3f9a1bc', 'dsh-novel-forge')
    expect(result.config.model).toBe('b')
    expect(result.settingsWarning).toContain('失败')
    expect(result.settingsWarning).toContain('k3f9a1bc')
  })

  it('只合并给定字段，其它字段原样保留（patch 语义）', async () => {
    const settings = fakeSettings(['k3f9a1bc'])
    const result = await persistConfigPatch({ a: 1, b: 2 }, { b: 3 }, settings, 'k3f9a1bc', 'dsh-novel-forge')
    expect(result.config).toEqual({ a: 1, b: 3 })
  })
})
