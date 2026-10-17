/**
 * 纯逻辑单测：取名器（类别表 / 候选解析 / 名字库容量纪律 / 注入边界）。
 *
 * 关键约束（用断言固定）：
 *   * 候选不落盘、采纳才入库——adopt 之外的路径不得写 nameBank；
 *   * 库有硬上限（每类 60 / 全书 300），超限**抛错**而不是静默截断；
 *   * 注入写作提示词的只有已采纳名字，且带「优先使用、不锁死」声明。
 */
import { describe, it, expect } from 'vitest'
import type { NameForgeEntry, ProjectState } from '../src/protocol.ts'
import {
  NAME_CATEGORIES,
  NAME_BANK_MAX_PER_CATEGORY,
  NAME_BANK_MAX_TOTAL,
  categorySpec,
  collectNameForgeContext,
  buildNameForgeUserPrompt,
  mutateNameBank,
  normalizeNameEntry,
  parseNameCandidates,
  readNameBank,
  renderNameBank,
} from '../src/name-forge.ts'

/** 造一个空项目（名字库按需注入）。 */
function project(bank?: NameForgeEntry[]): ProjectState {
  return {
    bookName: '测试书',
    outline: '',
    chapters: [],
    foreshadows: [],
    facts: [],
    ...(bank !== undefined ? { nameBank: bank } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ProjectState
}

/** 造一条库条目。 */
function entry(id: string, category: NameForgeEntry['category'], name: string, adopted = true): NameForgeEntry {
  return { id, category, name, note: '', adopted, createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('NAME_CATEGORIES 类别表', () => {
  it('五个类别，id/label/hint/brief 齐全且 id 不重复', () => {
    expect(NAME_CATEGORIES.map(c => c.id)).toEqual(['person', 'place', 'technique', 'faction', 'artifact'])
    const ids = new Set(NAME_CATEGORIES.map(c => c.id))
    expect(ids.size).toBe(NAME_CATEGORIES.length)
    for (const spec of NAME_CATEGORIES) {
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.hint.length).toBeGreaterThan(0)
      expect(spec.brief.length).toBeGreaterThan(0)
      expect(spec.placeholder.length).toBeGreaterThan(0)
      expect(spec.maxCount).toBeGreaterThan(0)
    }
  })

  it('未知类别直接报错（路由层转 400）', () => {
    expect(() => categorySpec('dragon')).toThrow('未知取名类别')
    expect(categorySpec('person').label).toBe('人名')
  })
})

describe('normalizeNameEntry', () => {
  it('折叠空白并截断超长', () => {
    const r = normalizeNameEntry({ name: '  云  晚  ', note: 'a'.repeat(200) })
    expect(r.name).toBe('云 晚')
    expect(r.note).toHaveLength(120)
  })

  it('非字符串字段回落为空（不把模型废话当数据）', () => {
    expect(normalizeNameEntry({ name: 42, note: null })).toEqual({ name: '', note: '' })
  })
})

describe('parseNameCandidates', () => {
  it('解析标准 JSON', () => {
    const out = parseNameCandidates('{"names":[{"name":"云晚","note":"晚云之意"}]}', 5)
    expect(out).toEqual([{ name: '云晚', note: '晚云之意' }])
  })

  it('容忍代码围栏与前后废话', () => {
    const fenced = '好的，结果如下：\n```json\n{"names":[{"name":"沈砚","note":"砚台"}]}\n```\n以上。'
    expect(parseNameCandidates(fenced, 5)).toEqual([{ name: '沈砚', note: '砚台' }])
  })

  it('按 count 截断、按 name 去重、丢空名', () => {
    const text = '{"names":[{"name":"甲","note":"a"},{"name":"甲","note":"dup"},{"name":"","note":"empty"},{"name":"乙","note":"b"},{"name":"丙","note":"c"}]}'
    expect(parseNameCandidates(text, 2)).toEqual([{ name: '甲', note: 'a' }, { name: '乙', note: 'b' }])
  })

  it('无法解析时返回空数组（由调用方报错，绝不瞎猜）', () => {
    expect(parseNameCandidates('模型挂了，没有名字', 5)).toEqual([])
    expect(parseNameCandidates('{"no_names_here":1}', 5)).toEqual([])
  })
})

describe('buildNameForgeUserPrompt', () => {
  const spec = categorySpec('faction')

  it('带上类别、数量与作者补充要求', () => {
    const text = buildNameForgeUserPrompt(spec, 10, '要堂皇但暗藏戾气', { genre: '玄幻', worldNames: [], bankNames: [] })
    expect(text).toContain('类别：势力')
    expect(text).toContain('请生成 10 个候选')
    expect(text).toContain('本书题材基调：玄幻')
    expect(text).toContain('作者补充要求：要堂皇但暗藏戾气')
  })

  it('有既有名称时列出避重名单，没有时明说自由发挥', () => {
    const withNames = buildNameForgeUserPrompt(spec, 5, '', { genre: '', worldNames: ['青云宗', '剑冢'], bankNames: ['沈砚'] })
    expect(withNames).toContain('- 青云宗')
    expect(withNames).toContain('已入库名字')
    expect(withNames).toContain('- 沈砚')
    const bare = buildNameForgeUserPrompt(spec, 5, '', {})
    expect(bare).toContain('（未提供题材基调，按通用中文网文气质发挥）')
    expect(bare).toContain('（暂无世界观设定，自由发挥）')
    expect(bare).not.toContain('避用名单')
  })
})

describe('collectNameForgeContext', () => {
  it('汇总题材、世界既有名与库内名', () => {
    const p = project([entry('person:沈砚', 'person', '沈砚')])
    p.assets = { genre: { name: '东方玄幻' }, auxiliaryProgressions: [], antiAiRules: [], styleAssets: [] } as unknown as ProjectState['assets']
    p.world = {
      realms: [{ name: '下界' }, { name: '' }],
      regions: [{ name: '南荒' }],
      factions: [{ name: '青云宗' }],
    } as unknown as ProjectState['world']
    p.roles = [{ name: '云晚' } as unknown as ProjectState['roles'] extends readonly (infer R)[] ? R : never]
    const ctx = collectNameForgeContext(p)
    expect(ctx.genre).toBe('东方玄幻')
    expect(ctx.worldNames).toContain('下界')
    expect(ctx.worldNames).toContain('南荒')
    expect(ctx.worldNames).toContain('青云宗')
    expect(ctx.worldNames).toContain('云晚')
    expect(ctx.bankNames).toEqual(['沈砚'])
  })

  it('什么都没有时不报错，返回空语境', () => {
    const ctx = collectNameForgeContext(project())
    expect(ctx.genre).toBe('')
    expect(ctx.worldNames).toEqual([])
    expect(ctx.bankNames).toEqual([])
  })
})

describe('readNameBank', () => {
  it('丢非法条目（坏类别/空名/重复），补默认 id', () => {
    const bank = readNameBank(project([
      entry('person:甲', 'person', '甲'),
      { id: 'x', category: 'dragon', name: '坏类别', note: '', adopted: true, createdAt: '' } as unknown as NameForgeEntry,
      { id: 'y', category: 'person', name: '  ', note: '', adopted: true, createdAt: '' },
      { id: 'person:甲', category: 'person', name: '甲', note: '', adopted: true, createdAt: '' },
      { id: '', category: 'person', name: '乙', note: '', adopted: false, createdAt: '' },
    ]))
    expect(bank.map(e => e.name)).toEqual(['甲', '乙'])
    expect(bank[1]?.id).toBe('person:乙')
    expect(bank[1]?.adopted).toBe(false)
  })
})

describe('mutateNameBank', () => {
  it('adopt 写入并避重（同名同类不重复入库）', () => {
    const p = project([entry('person:甲', 'person', '甲')])
    const out = mutateNameBank(p, { kind: 'adopt', category: 'person', candidates: [{ name: '甲' }, { name: '乙', note: 'b' }] })
    expect(out.map(e => e.name)).toEqual(['甲', '乙'])
    expect(out[1]?.note).toBe('b')
    expect(p.nameBank).toHaveLength(2)
  })

  it('全部候选已存在时原样返回（不写库）', () => {
    const p = project([entry('person:甲', 'person', '甲')])
    const out = mutateNameBank(p, { kind: 'adopt', category: 'person', candidates: [{ name: '甲' }] })
    expect(out).toHaveLength(1)
  })

  it('discard 按 id 移除，clear 清空', () => {
    const p = project([entry('person:甲', 'person', '甲'), entry('place:南荒', 'place', '南荒')])
    expect(mutateNameBank(p, { kind: 'discard', id: 'person:甲' }).map(e => e.name)).toEqual(['南荒'])
    expect(mutateNameBank(p, { kind: 'clear' })).toEqual([])
    expect(p.nameBank).toEqual([])
  })

  it('单类超上限抛错（不静默截断）', () => {
    const p = project()
    const candidates = Array.from({ length: NAME_BANK_MAX_PER_CATEGORY }, (_, i) => ({ name: `名${i}` }))
    expect(() => mutateNameBank(p, { kind: 'adopt', category: 'person', candidates: [...candidates, { name: '压垮' }] })).toThrow('已满')
  })

  it('全书超上限抛错（单类未满但总数超限，证明总上限不是死代码）', () => {
    // person/place/technique 各 60（单类满）+ faction 20 = 200（总数满）；
    // 再往 faction 采纳 1 条：单类 21 未超、总数 201 超 → 必须报总上限。
    const existing: NameForgeEntry[] = []
    for (const [spec, n] of [['person', 60], ['place', 60], ['technique', 60], ['faction', 20]] as const) {
      for (let i = 0; i < n; i++) existing.push(entry(`${spec}:${spec}${i}`, spec, `${spec}${i}`))
    }
    const p = project(existing)
    expect(p.nameBank).toHaveLength(NAME_BANK_MAX_TOTAL)
    expect(() => mutateNameBank(p, { kind: 'adopt', category: 'faction', candidates: [{ name: '压垮总线的最后一个' }] })).toThrow('名字库已满')
  })
})

describe('renderNameBank', () => {
  it('无库时返回空串（不污染提示词）', () => {
    expect(renderNameBank(project())).toBe('')
    expect(renderNameBank(project([entry('person:甲', 'person', '甲', false)]))).toBe('')
  })

  it('只渲染已采纳名字，按类别分组，带边界声明', () => {
    const text = renderNameBank(project([
      entry('person:甲', 'person', '甲'),
      entry('person:乙', 'person', '乙', false),
      entry('place:南荒', 'place', '南荒'),
    ]))
    expect(text).toContain('人名：甲')
    expect(text).not.toContain('乙')
    expect(text).toContain('地名：南荒')
    expect(text).toContain('优先直接从表中取')
    expect(text).toContain('不得与上表近音或重复')
  })
})
