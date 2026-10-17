/**
 * 总编台纯计算层（home-model）的离线单测。
 *
 * 守两件事：
 *  1. 章节统计的口径（done / pending / reviewPending / approved / writingNow）——
 *     这些数字直接显示在总编台的账目行与进度条上，错一位作者就会误判进度；
 *  2. 创作旅程 6 阶段的完成判定只认项目真实数据（不认 UI 当前页），
 *     否则作者在不同页之间切换会让旅程条自己变。
 */
import { describe, it, expect } from 'vitest'
import { computeChapterStats, computeJourneyStages } from '../src/client/panel/home-model.ts'
import type { ChapterPlan, ProjectState, Volume } from '../src/protocol.ts'

/** 最小章节 stub：只填统计用到的字段，其余靠断言转换。 */
function ch(no: number, status: ChapterPlan['status'], chars?: number): ChapterPlan {
  return { no, title: `第${no}章`, beats: '', status, chars } as ChapterPlan
}

function project(partial: Partial<ProjectState> = {}): ProjectState {
  return { bookName: '测试书', outline: '大纲', chapters: [], foreshadows: [], createdAt: '', updatedAt: '', ...partial } as ProjectState
}

describe('computeChapterStats', () => {
  it('空数组时全部归零', () => {
    expect(computeChapterStats([])).toEqual({
      done: 0, pending: 0, approved: 0, reviewPending: 0, totalChars: 0,
      writingNow: undefined, charSeries: [],
    })
  })

  it('按状态分类：有正文的章算 done，pending/error 算待处理', () => {
    const stats = computeChapterStats([
      ch(1, 'approved', 3000),
      ch(2, 'written', 2800),
      ch(3, 'rejected', 2600),
      ch(4, 'pending'),
      ch(5, 'error'),
      ch(6, 'generating'),
    ])
    expect(stats.done).toBe(3)
    expect(stats.pending).toBe(2)
    expect(stats.approved).toBe(1)
    expect(stats.reviewPending).toBe(2)
    expect(stats.writingNow?.no).toBe(6)
    expect(stats.totalChars).toBe(8400)
  })

  it('chars 缺省按 0 计，charSeries 顺序与输入一致', () => {
    const stats = computeChapterStats([ch(3, 'approved'), ch(1, 'pending'), ch(2, 'written', 1000)])
    expect(stats.totalChars).toBe(1000)
    expect(stats.charSeries).toEqual([
      { no: 3, chars: 0, approved: true },
      { no: 1, chars: 0, approved: false },
      { no: 2, chars: 1000, approved: false },
    ])
  })

  it('同刻只记最后一条 generating（防御坏数据：状态机保证至多一条）', () => {
    const stats = computeChapterStats([ch(1, 'generating'), ch(2, 'generating')])
    expect(stats.writingNow?.no).toBe(2)
  })
})

describe('computeJourneyStages', () => {
  it('没有项目：大纲一步都没完成', () => {
    expect(computeJourneyStages(undefined, [], 0).every(s => !s.done)).toBe(true)
  })

  it('有项目但没道藏：大纲完成、设定未完成', () => {
    const stages = computeJourneyStages(project(), [], 0)
    expect(stages.find(s => s.id === 'outline')?.done).toBe(true)
    expect(stages.find(s => s.id === 'bible')?.done).toBe(false)
  })

  it('六阶段全完成：有设定/卷/章/正文/过审', () => {
    const p = project({
      bible: { characters: [], worldRules: [], redLines: [], style: [], genre: '' } as ProjectState['bible'],
      volumes: [{ no: 1, title: '第一卷', summary: '', chapters: [] } as unknown as Volume],
      chapters: [],
    })
    const stages = computeJourneyStages(p, [ch(1, 'approved', 3200)], 1)
    expect(stages.map(s => s.done)).toEqual([true, true, true, true, true, true])
  })

  it('有正文章节但一篇都没过审：审稿阶段未完成', () => {
    const stages = computeJourneyStages(project(), [ch(1, 'written', 3000)], 0)
    expect(stages.find(s => s.id === 'write')?.done).toBe(true)
    expect(stages.find(s => s.id === 'review')?.done).toBe(false)
  })
})
