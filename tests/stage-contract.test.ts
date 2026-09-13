/**
 * 纯逻辑单测：阶段契约（当前阶段 → 本轮允许的动作）。
 *
 * 规则来源（借鉴 dsh-ai-novel-writer）：允许的动作必须由宿主根据真实项目状态算出，
 * 而不是指望模型记住。作者只说了「继续/下一步」时，阶段白名单成为唯一命令。
 */
import { describe, it, expect } from 'vitest'
import type { ChapterPlan, ChapterStatus, ProjectState } from '../src/protocol.ts'
import { emptyProjectAssets } from '../src/assets.ts'
import {
  computeBookStage,
  isGenericContinue,
  renderStageContract,
  splitByStage,
  stageAllows,
  summarizeChapters,
} from '../src/stage-contract.ts'

/** 造一个最小可用项目。 */
function makeProject(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    bookName: '测试书',
    outline: '第1章大纲'.repeat(20),
    chapters: [],
    foreshadows: [],
    assets: emptyProjectAssets(),
    facts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** 造一章计划。 */
function chapter(no: number, status: ChapterStatus): ChapterPlan {
  return { no, volume: 1, title: `第${no}章`, beats: '', targetChars: 3000, status }
}

/** 有项目 + 有道的道藏（结构只需存在即可）。 */
const BIBLE = { worldRules: [], characters: [], redLines: [], style: [] } as unknown as ProjectState['bible']

describe('isGenericContinue', () => {
  it('识别纯「继续/下一步」类指令', () => {
    for (const message of ['继续', '继续吧', '下一步', '接着来', '往下走', 'go on', 'Continue', '继续。']) {
      expect(isGenericContinue(message), message).toBe(true)
    }
  })

  it('带具体对象或动作的不算通用续写（作者指令优先）', () => {
    for (const message of ['继续写第 3 章', '生成第 120 章', '把第 5 章结尾改一下', '继续但先审第 2 章']) {
      expect(isGenericContinue(message), message).toBe(false)
    }
  })
})

describe('computeBookStage', () => {
  it('无项目 → 开书', () => {
    expect(computeBookStage(undefined).id).toBe('outline')
  })

  it('大纲过短 → 开书', () => {
    expect(computeBookStage(makeProject({ outline: '太短' })).id).toBe('outline')
  })

  it('有项目无道藏 → 立设定', () => {
    expect(computeBookStage(makeProject()).id).toBe('bible')
  })

  it('有道藏无章节 → 排章节', () => {
    expect(computeBookStage(makeProject({ bible: BIBLE })).id).toBe('plan')
  })

  it('有章节正在生成 → 等待，且不允许任何写操作', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'generating')] }))
    expect(stage.id).toBe('wait')
    expect(stage.allow).toEqual([])
    expect(stage.reason).toContain('第 1 章')
  })

  it('有生成失败章节 → 逐章编译，允许重新生成', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'error')] }))
    expect(stage.id).toBe('write')
    expect(stageAllows(stage, 'chapter_generate')).toBe(true)
  })

  it('有审稿未过章节 → 修订循环', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'approved'), chapter(2, 'rejected')] }))
    expect(stage.id).toBe('revise')
    expect(stageAllows(stage, 'chapter_rewrite')).toBe(true)
    expect(stageAllows(stage, 'chapter_generate')).toBe(false)
  })

  it('有已写未审章节 → 审稿', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'written')] }))
    expect(stage.id).toBe('review')
    expect(stageAllows(stage, 'chapter_review')).toBe(true)
  })

  it('有 pending 章节 → 逐章编译并指出下一章', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'approved'), chapter(2, 'pending')] }))
    expect(stage.id).toBe('write')
    expect(stage.reason).toContain('第 2 章')
  })

  it('全部 approved → 定稿导出', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'approved'), chapter(2, 'approved')] }))
    expect(stage.id).toBe('export')
    expect(stageAllows(stage, 'export_txt')).toBe(true)
  })

  it('生成中优先于其它状态（等待不能被当成可写）', () => {
    const stage = computeBookStage(makeProject({
      bible: BIBLE,
      chapters: [chapter(1, 'generating'), chapter(2, 'pending'), chapter(3, 'rejected')],
    }))
    expect(stage.id).toBe('wait')
  })
})

describe('renderStageContract', () => {
  it('渲染阶段名、判定依据与允许的写操作', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'pending')] }))
    const text = renderStageContract(stage)
    expect(text).toContain('逐章编译')
    expect(text).toContain('判定依据：')
    expect(text).toContain('chapter_generate')
    expect(text).toContain('阶段纪律')
  })

  it('无可用写操作时明确写「无」，不留空', () => {
    const text = renderStageContract(computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'generating')] })))
    expect(text).toContain('本阶段允许的写操作：无')
    expect(text).toContain('建议下一步：无')
  })
})

describe('splitByStage（动作可见性）', () => {
  const TOOLS = ['chapter_generate', 'chapter_review', 'export_txt', 'blurb'] as const

  it('按阶段把写操作分成可用/阶段外，并保持输入顺序', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'pending')] }))
    const { available, outside } = splitByStage(stage, TOOLS)
    expect(available).toEqual(['chapter_generate', 'chapter_review'])
    expect(outside).toEqual(['export_txt', 'blurb'])
  })

  it('等待阶段：全部写操作都在阶段外', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'generating')] }))
    const { available, outside } = splitByStage(stage, TOOLS)
    expect(available).toEqual([])
    expect(outside).toEqual([...TOOLS])
  })

  it('定稿阶段：只曝光导出与简介', () => {
    const stage = computeBookStage(makeProject({ bible: BIBLE, chapters: [chapter(1, 'approved')] }))
    const { available } = splitByStage(stage, TOOLS)
    expect(available).toEqual(['export_txt', 'blurb'])
  })
})

describe('summarizeChapters', () => {
  it('按状态计数', () => {
    expect(summarizeChapters([chapter(1, 'approved'), chapter(2, 'approved'), chapter(3, 'pending')]))
      .toEqual({ approved: 2, pending: 1 })
  })

  it('空数组返回空对象', () => {
    expect(summarizeChapters([])).toEqual({})
  })
})
