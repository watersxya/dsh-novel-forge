/**
 * 纯逻辑单测：故事时间线的排序 / 注入渲染 / 规则初筛（不调模型，可离线跑）。
 */
import { describe, it, expect } from 'vitest'
import type { ProjectState, TimelineEvent } from '../src/protocol.ts'
import { detectTimelineIssues, normalizeTimelineEvent, renderTimelineBlock, sortTimeline, TIMELINE_CONTEXT_LIMIT } from '../src/timeline.ts'

/** 造一个事件。 */
function ev(partial: Partial<TimelineEvent> & { chapterNo: number }): TimelineEvent {
  return {
    id: `tl-${partial.chapterNo}-${partial.order ?? 0}-${partial.event ?? ''}`,
    time: '',
    place: '',
    characters: [],
    event: '',
    source: 'extracted',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

/** 造一个只带时间线的项目。 */
function project(timeline: TimelineEvent[]): ProjectState {
  return {
    bookName: '测试书',
    outline: '',
    chapters: [],
    foreshadows: [],
    facts: [],
    timeline,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ProjectState
}

describe('normalizeTimelineEvent', () => {
  it('清洗字符串、补 id 与来源、过滤空角色', () => {
    const e = normalizeTimelineEvent({ time: ' 第三日 ', place: ' 外门 ', characters: ['沈青', '', '  '], event: '被羞辱', order: 2 }, 3, 0)
    expect(e.chapterNo).toBe(3)
    expect(e.time).toBe('第三日')
    expect(e.place).toBe('外门')
    expect(e.characters).toEqual(['沈青'])
    expect(e.order).toBe(2)
    expect(e.source).toBe('extracted')
    expect(e.id).not.toBe('')
  })

  it('缺少 order 时保持 undefined（不编造顺序）', () => {
    expect(normalizeTimelineEvent({ event: 'x' }, 1, 0).order).toBeUndefined()
  })
})

describe('sortTimeline', () => {
  it('先按章号、再按章内 order，缺省 order 排在该章末尾', () => {
    const sorted = sortTimeline([
      ev({ chapterNo: 2, order: 1, event: 'b1' }),
      ev({ chapterNo: 1, order: 2, event: 'a2' }),
      ev({ chapterNo: 1, order: 1, event: 'a1' }),
      ev({ chapterNo: 1, event: 'a-none' }),
    ])
    expect(sorted.map(e => e.event)).toEqual(['a1', 'a2', 'a-none', 'b1'])
  })
})

describe('renderTimelineBlock', () => {
  it('无事件或没有更早事件时返回空串', () => {
    expect(renderTimelineBlock(project([]), 5)).toBe('')
    expect(renderTimelineBlock(project([ev({ chapterNo: 5, event: '未来' })]), 5)).toBe('')
  })

  it('只注入本章之前的事件（回写旧章不被剧透）', () => {
    const p = project([
      ev({ chapterNo: 1, time: '第一日', event: '入门' }),
      ev({ chapterNo: 9, time: '第九日', event: '大结局' }),
    ])
    const block = renderTimelineBlock(p, 2)
    expect(block).toContain('入门')
    expect(block).not.toContain('大结局')
  })

  it('超过上限时带显式截断声明（遵循截断显式化规则）', () => {
    const many = Array.from({ length: TIMELINE_CONTEXT_LIMIT + 5 }, (_, i) => ev({ chapterNo: i + 1, time: `第${i + 1}日`, event: `事件${i + 1}` }))
    const block = renderTimelineBlock(project(many), 100)
    expect(block).toContain(`共 ${many.length} 条`)
    expect(block).toContain(`只列最近 ${TIMELINE_CONTEXT_LIMIT} 条`)
    expect(block).toContain('未列出')
    expect(block).toContain('时间顺序')
  })
})

describe('detectTimelineIssues', () => {
  it('事件太少时不报警（避免噪声）', () => {
    expect(detectTimelineIssues(project([ev({ chapterNo: 1, order: 1, event: 'a' })]))).toEqual([])
  })

  it('抓同章内顺序倒退', () => {
    const issues = detectTimelineIssues(project([
      ev({ chapterNo: 1, order: 1, event: 'a' }),
      ev({ chapterNo: 1, order: 3, event: 'b' }),
      ev({ chapterNo: 1, order: 2, event: 'c' }),
      ev({ chapterNo: 2, order: 4, event: 'd' }),
    ]))
    expect(issues.some(i => i.item.includes('顺序倒退'))).toBe(true)
  })

  it('抓跨章时间倒流（后一章的整体时间早于前一章）', () => {
    const issues = detectTimelineIssues(project([
      ev({ chapterNo: 1, order: 10, time: '第十日', event: 'a' }),
      ev({ chapterNo: 2, order: 3, time: '第三日', event: 'b' }),
    ]))
    const flow = issues.find(i => i.item.includes('时间倒流'))
    expect(flow).toBeDefined()
    expect(flow?.severity).toBe('high')
    expect(flow?.chapters).toEqual([1, 2])
  })

  it('抓地点瞬移（同一角色未交代移动就出现在新地点）', () => {
    const issues = detectTimelineIssues(project([
      ev({ chapterNo: 1, order: 1, place: '青云宗', characters: ['沈青'], event: 'a' }),
      ev({ chapterNo: 2, order: 2, place: '落霞谷', characters: ['沈青'], event: 'b' }),
      ev({ chapterNo: 3, order: 3, place: '青云宗', characters: ['沈青'], event: 'c' }),
    ]))
    expect(issues.some(i => i.item.includes('地点衔接存疑'))).toBe(true)
  })

  it('顺序正常时不报警', () => {
    const issues = detectTimelineIssues(project([
      ev({ chapterNo: 1, order: 1, place: '青云宗', characters: ['沈青'], event: 'a' }),
      ev({ chapterNo: 2, order: 2, place: '青云宗', characters: ['沈青'], event: 'b' }),
      ev({ chapterNo: 3, order: 3, place: '青云宗', characters: ['沈青'], event: 'c' }),
      ev({ chapterNo: 4, order: 4, place: '青云宗', characters: ['沈青'], event: 'd' }),
    ]))
    expect(issues).toEqual([])
  })
})
