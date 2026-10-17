/**
 * 纯逻辑单测：提示词注册表纪律 + 分层组装口径抽查。
 *
 * 关键约束：注册表不是文档是契约——新建域文件忘了登记、id 挂错域、
 * 空域文件（import 了却零提示词，比不登记更隐蔽）、描述抄成第二份
 * 提示词、固定层被排到本书层之后（前缀缓存命中的前提），都在这里红。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PROMPT_CATALOG, describePrompt, listPromptEntries } from '../src/prompts/catalog.ts'
import { COMPLIANCE_REDLINES } from '../src/prompts/common.ts'
import { writeSystemPrompt } from '../src/prompts/writing.ts'
import type { ProjectState } from '../src/protocol.ts'

const PROMPTS_DIR = 'src/prompts'
/** 不参与「目录完整」登记的域文件：catalog 自身（汇总处）与 common（共享红线，非独立提示词）。 */
const EXEMPT = new Set(['catalog.ts', 'common.ts'])

/** 域文件名清单（去扩展名）。 */
function domains(): string[] {
  return readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith('.ts') && !EXEMPT.has(f))
    .map(f => f.replace(/\.ts$/, ''))
}

/** 造一个最小项目（分层抽查用）。 */
function project(extra: Partial<ProjectState> = {}): ProjectState {
  return {
    bookName: '测试书',
    outline: '',
    chapters: [],
    foreshadows: [],
    facts: [],
    ...extra,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ProjectState
}

describe('注册表纪律一：目录完整', () => {
  it('src/prompts/ 下每个域文件都被 catalog import', () => {
    const catalogSrc = readFileSync(`${PROMPTS_DIR}/catalog.ts`, 'utf8')
    for (const d of domains()) {
      expect(catalogSrc, `${d}.ts 未在 catalog.ts 登记`).toContain(`from './${d}.ts'`)
    }
    // 下限防「文件被删光」时测试假绿
    expect(domains().length).toBeGreaterThanOrEqual(15)
  })
})

describe('注册表纪律二：双向完整', () => {
  it('每条 id 都以某个域文件名开头，且形如「域.名称」', () => {
    const domainSet = new Set(domains())
    for (const entry of PROMPT_CATALOG) {
      const domain = entry.id.split('.')[0] ?? ''
      expect(domainSet, `${entry.id} 的域名不对应任何域文件`).toContain(domain)
      expect(entry.id, `${entry.id} 不是「域.名称」两段以上结构`).toMatch(/^[a-z]+(\.[A-Za-z0-9-]+)+$/)
    }
  })

  it('每个域至少有一条登记（import 了但 entries 为空，比不登记更隐蔽）', () => {
    const withEntries = new Set(PROMPT_CATALOG.map(e => e.id.split('.')[0] ?? ''))
    for (const d of domains()) {
      expect(withEntries, `${d}.ts 的 entries 为空`).toContain(d)
    }
  })
})

describe('注册表纪律三：id 唯一', () => {
  it('全库无重复 id', () => {
    const seen = new Set<string>()
    for (const entry of PROMPT_CATALOG) {
      expect(seen.has(entry.id), `重复 id: ${entry.id}`).toBe(false)
      seen.add(entry.id)
    }
  })

  it('describePrompt 与 listPromptEntries 同目录一致', () => {
    expect(listPromptEntries()).toHaveLength(PROMPT_CATALOG.length)
    for (const entry of PROMPT_CATALOG) {
      expect(describePrompt(entry.id)).toBe(entry.description)
    }
    expect(describePrompt('nope.nope')).toBeUndefined()
  })
})

describe('注册表纪律四：短描述', () => {
  it('非空、不过长、且不是提示词原文的复印件', () => {
    // 只取各域文件中 entries 登记段之前的提示词正文——描述本身就住在
    // entries 里，不切开会自己撞自己。
    const promptText = readdirSync(PROMPTS_DIR)
      .filter(f => f.endsWith('.ts') && f !== 'catalog.ts')
      .map(f => {
        const src = readFileSync(`${PROMPTS_DIR}/${f}`, 'utf8')
        const cut = src.search(/export const entries/)
        return cut >= 0 ? src.slice(0, cut) : src
      })
      .join('\n')
    for (const entry of PROMPT_CATALOG) {
      expect(entry.description.length, `${entry.id} 描述过短`).toBeGreaterThan(4)
      expect(entry.description.length, `${entry.id} 描述 ${entry.description.length} 字，超 60 字上限——那是第二份提示词`).toBeLessThanOrEqual(60)
      expect(promptText.includes(entry.description), `${entry.id} 的描述照抄了提示词原文，改文案要改两处`).toBe(false)
    }
  })
})

describe('分层口径抽查：固定层排在本书层之前', () => {
  it('正文提示里，合规红线出现在本书红线之前', () => {
    const withBible = project({
      bible: { genre: '', worldRules: [], characters: [], redLines: ['本书专属红线甲'], style: [] },
    })
    const text = writeSystemPrompt(withBible)
    const fixedAt = text.indexOf(COMPLIANCE_REDLINES[0]!)
    const bookAt = text.indexOf('本书专属红线甲')
    expect(fixedAt, '固定层缺失：合规红线没进提示词').toBeGreaterThanOrEqual(0)
    expect(bookAt, '本书层缺失：道藏红线没进提示词').toBeGreaterThanOrEqual(0)
    expect(fixedAt, '固定层必须排在本书层之前——前缀缓存命中的前提').toBeLessThan(bookAt)
  })

  it('无道藏项目也能独立成立（不崩、固定层仍在）', () => {
    const text = writeSystemPrompt(project())
    expect(text).toContain(COMPLIANCE_REDLINES[0]!)
    expect(text).toContain('==================== 内容合规红线')
  })
})
