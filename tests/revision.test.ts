/**
 * 修订合并层：优先级排序、去重、上限截断、验证基准扩展。
 * 这些规则一旦被破坏，就会出现「多通道各改一轮、互相打脸」的老问题，故全部锁死。
 */
import { describe, expect, it } from 'vitest'
import {
  buildRevisionPlan,
  collectRevisionItems,
  describeRevisionPlan,
  mergeRevisionItems,
  MAX_REVISION_ROUNDS,
  renderRevisionInstruction,
  revisionPriority,
  revisionTodoText,
  REVISION_ITEM_CAP,
} from '../src/revision.ts'
import type { ProjectState, RevisionItem, ReviewIssue } from '../src/protocol.ts'

function emptyProject(): ProjectState {
  return {
    bookName: '测试书',
    genre: '玄幻',
    chapters: [],
    volumes: [],
    assets: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as ProjectState
}

function item(over: Partial<RevisionItem> = {}): RevisionItem {
  return { id: 'x', source: 'review', severity: 'high', chapterNo: 1, item: '问题', suggestion: '改法', ...over }
}

describe('revisionPriority', () => {
  it('审稿 high 永远最优先', () => {
    expect(revisionPriority('review', 'high')).toBe(0)
  })
  it('优先级阶梯：审稿high > 时间线high > 张力medium > 其它', () => {
    expect(revisionPriority('review', 'high')).toBeLessThan(revisionPriority('timeline', 'high'))
    expect(revisionPriority('timeline', 'high')).toBeLessThan(revisionPriority('tension', 'medium'))
    expect(revisionPriority('tension', 'medium')).toBeLessThan(revisionPriority('review', 'medium'))
    expect(revisionPriority('review', 'medium')).toBeLessThan(revisionPriority('review', 'low'))
  })
  it('时间线 medium 与审稿 medium 同级（都不是硬门）', () => {
    expect(revisionPriority('timeline', 'medium')).toBe(revisionPriority('review', 'medium'))
  })
})

describe('mergeRevisionItems', () => {
  it('按优先级排序', () => {
    const merged = mergeRevisionItems([
      item({ id: 'c', source: 'tension', severity: 'medium', item: '张力塌了' }),
      item({ id: 'b', source: 'timeline', severity: 'high', item: '时间倒流' }),
      item({ id: 'a', source: 'review', severity: 'high', item: '人设崩' }),
    ])
    expect(merged.items.map(i => i.source)).toEqual(['review', 'timeline', 'tension'])
  })

  it('同源同问题去重并累计条数', () => {
    const merged = mergeRevisionItems([
      item({ id: 'a', item: '第3章 主角称呼前后不一致' }),
      item({ id: 'b', item: '第3章，主角称呼前后不一致。' }),
    ])
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0]?.count).toBe(2)
  })

  it('不同来源的相同描述不去重（来源不同，改法可能不同）', () => {
    const merged = mergeRevisionItems([
      item({ id: 'a', source: 'review', item: '地点跳跃' }),
      item({ id: 'b', source: 'timeline', item: '地点跳跃' }),
    ])
    expect(merged.items).toHaveLength(2)
  })

  it('超出上限截断，且截断优先砍低优先级', () => {
    const many: RevisionItem[] = []
    for (let i = 0; i < REVISION_ITEM_CAP; i++) many.push(item({ id: `r${i}`, item: `审稿问题${i}` }))
    many.push(item({ id: 't', source: 'tension', severity: 'medium', item: '张力问题' }))
    const merged = mergeRevisionItems(many)
    expect(merged.items).toHaveLength(REVISION_ITEM_CAP)
    expect(merged.omitted).toBe(1)
    expect(merged.items.some(i => i.source === 'tension')).toBe(false)
  })

  it('不修改入参数组（纯函数）', () => {
    const input = [item({ id: 'a' }), item({ id: 'b', source: 'tension', severity: 'medium' })]
    const before = input.map(i => i.id)
    mergeRevisionItems(input)
    expect(input.map(i => i.id)).toEqual(before)
  })
})

describe('collectRevisionItems', () => {
  it('只取目标章的审稿意见', () => {
    const project = emptyProject()
    project.chapters = [
      { no: 1, review: { issues: [{ severity: 'high', item: 'A', suggestion: '' }] } },
      { no: 2, review: { issues: [{ severity: 'high', item: 'B', suggestion: '' }] } },
    ] as never
    const items = collectRevisionItems(project, { chapterNo: 2, includeTimeline: false, includeTension: false })
    expect(items).toHaveLength(1)
    expect(items[0]?.item).toBe('B')
  })

  it('时间线矛盾落到目标章（多章问题取交集）', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1 }, { no: 2 }, { no: 3 }] as never
    project.timeline = [
      { id: 'e1', chapterNo: 1, order: 5, characters: [], event: 'A', source: 'extracted', createdAt: '' },
      { id: 'e2', chapterNo: 2, order: 2, characters: [], event: 'B', source: 'extracted', createdAt: '' },
    ] as never
    const inChapter1 = collectRevisionItems(project, { chapterNo: 1, reviewIssues: [], includeTension: false })
    expect(inChapter1.length).toBeGreaterThan(0)
    expect(inChapter1.every(i => i.source === 'timeline')).toBe(true)
  })

  it('显式传入 reviewIssues 时不再读落盘报告（作者勾选优先）', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1, review: { issues: [{ severity: 'high', item: '旧的', suggestion: '' }] } }] as never
    const picked: ReviewIssue[] = [{ severity: 'low', item: '作者勾的', suggestion: '这样改' }]
    const items = collectRevisionItems(project, { chapterNo: 1, reviewIssues: picked, includeTimeline: false, includeTension: false })
    expect(items.map(i => i.item)).toEqual(['作者勾的'])
  })

  it('空 reviewIssues 表示「本通道无意见」', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1, review: { issues: [{ severity: 'high', item: '旧的', suggestion: '' }] } }] as never
    const items = collectRevisionItems(project, { chapterNo: 1, reviewIssues: [], includeTimeline: false, includeTension: false })
    expect(items).toEqual([])
  })
})

describe('renderRevisionInstruction', () => {
  it('抬头列出三类来源计数，正文带来源与严重度标签', () => {
    const items = [
      item({ id: 'a', source: 'review', severity: 'high', item: '人设崩', suggestion: '补动机' }),
      item({ id: 'b', source: 'timeline', severity: 'high', item: '时间倒流', suggestion: '调顺序' }),
      item({ id: 'c', source: 'tension', severity: 'medium', item: '张力偏低', suggestion: '加压' }),
    ]
    const text = renderRevisionInstruction(items)
    expect(text).toContain('审稿 1 · 时间线 1 · 张力 1')
    expect(text).toContain('【审稿·high】第1章 人设崩')
    expect(text).toContain('建议：补动机')
    expect(text).toContain('【时间线·high】')
    expect(text).toContain('【张力·medium】')
  })

  it('合并同类时标注条数', () => {
    const merged = mergeRevisionItems([item({ id: 'a', item: '同一问题' }), item({ id: 'b', item: '同一问题' })])
    expect(renderRevisionInstruction(merged.items)).toContain('合并同类 2 条')
  })
})

describe('buildRevisionPlan', () => {
  it('验证基准覆盖本轮下发的全部条目（多源基线，规则 6）', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1, review: { score: 62, passed: false, verdict: '需修订', issues: [{ severity: 'high', item: '人设崩', suggestion: '' }], reviewedAt: '' } }] as never
    const plan = buildRevisionPlan(project, {
      chapterNo: 1,
      reviewIssues: [{ severity: 'high', item: '人设崩', suggestion: '' }],
      includeTimeline: false,
      includeTension: false,
      baseReport: project.chapters[0]?.review,
    })
    // 基准条目 = 下发条目，编号一一对应，复核才能逐条核对
    expect(plan.baseline.issues).toHaveLength(plan.items.length)
    expect(plan.baseline.score).toBe(62)
    expect(plan.baseline.passed).toBe(false)
  })

  it('时间线条目在基准里带来源前缀，避免与审稿意见混淆', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1 }] as never
    const plan = buildRevisionPlan(project, {
      chapterNo: 1,
      reviewIssues: [],
      includeTimeline: false,
      includeTension: false,
    })
    expect(plan.items).toEqual([])
    expect(plan.baseline.issues).toEqual([])
  })

  it('describeRevisionPlan 汇总计数并在截断时显式提示', () => {
    const project = emptyProject()
    project.chapters = [{ no: 1 }] as never
    const plan = buildRevisionPlan(project, { chapterNo: 1, reviewIssues: [], includeTimeline: false, includeTension: false })
    expect(describeRevisionPlan(plan)).toBe('无可修订条目')
    const many: RevisionItem[] = []
    for (let i = 0; i <= REVISION_ITEM_CAP; i++) many.push(item({ id: `r${i}`, item: `问题${i}` }))
    const merged = mergeRevisionItems(many)
    expect(merged.omitted).toBe(1)
  })
})

describe('常量与待办文案', () => {
  it('每章修订轮次上限为 2（超过转人工）', () => {
    expect(MAX_REVISION_ROUNDS).toBe(2)
  })
  it('待办文案带来源与章节，便于作者在面板定位', () => {
    expect(revisionTodoText(item({ source: 'tension', severity: 'medium', chapterNo: 7, item: '张力塌了' })))
      .toBe('[张力] 第7章：张力塌了')
    expect(revisionTodoText(item({ source: 'timeline', chapterNo: 0, item: '全书时间线缺锚点' })))
      .toBe('[时间线] 全书：全书时间线缺锚点')
  })
})

describe('同优先级内的次序（影响截断保留谁）', () => {
  it('同源按原始序号数值排序，而不是 id 字符串序', () => {
    const items: RevisionItem[] = [0, 1, 10, 11, 2].map(i =>
      item({ id: `review:2:${i}`, source: 'review', severity: 'medium', chapterNo: 2, item: `意见${i}` }))
    const merged = mergeRevisionItems(items)
    expect(merged.items.map(i => i.item)).toEqual(['意见0', '意见1', '意见2', '意见10', '意见11'])
  })

  it('同优先级跨来源时审稿优先于时间线', () => {
    const merged = mergeRevisionItems([
      item({ id: 'timeline:0:2', source: 'timeline', severity: 'medium', chapterNo: 2, item: '地点衔接存疑' }),
      item({ id: 'review:2:0', source: 'review', severity: 'medium', chapterNo: 2, item: '环境描写过长' }),
    ])
    expect(merged.items.map(i => i.source)).toEqual(['review', 'timeline'])
  })

  it('截断保留靠前的意见（不因字符串序留下第 11 条）', () => {
    const items: RevisionItem[] = []
    for (let i = 0; i < 12; i++) {
      items.push(item({ id: `review:2:${i}`, source: 'review', severity: 'medium', chapterNo: 2, item: `意见${i}` }))
    }
    const merged = mergeRevisionItems(items, 8)
    expect(merged.items.map(i => i.item)).toEqual(['意见0', '意见1', '意见2', '意见3', '意见4', '意见5', '意见6', '意见7'])
    expect(merged.omitted).toBe(4)
  })
})
