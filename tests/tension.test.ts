/**
 * 纯逻辑单测：张力曲线（参考形状 / 提示词注入 / 规则核对），不调模型。
 */
import { describe, it, expect } from 'vitest'
import type { ChapterPlan, ProjectState } from '../src/protocol.ts'
import { buildCurveData, clampTension, detectTensionIssues, referenceCurve, renderTensionBlock } from '../src/tension.ts'

/** 造一章。 */
function chapter(no: number, extra: Partial<ChapterPlan> = {}): ChapterPlan {
  return { no, volume: 1, title: `第${no}章`, beats: '', targetChars: 3000, status: 'pending', ...extra }
}

/** 造一个项目。 */
function project(chapters: ChapterPlan[], preset?: ProjectState['tensionCurve']): ProjectState {
  return {
    bookName: '测试书',
    outline: '',
    chapters,
    foreshadows: [],
    facts: [],
    ...(preset !== undefined ? { tensionCurve: preset } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ProjectState
}

describe('clampTension', () => {
  it('收敛到 0-100 并取整', () => {
    expect(clampTension(-5)).toBe(0)
    expect(clampTension(120)).toBe(100)
    expect(clampTension(63.6)).toBe(64)
    expect(clampTension(Number.NaN)).toBe(0)
  })
})

describe('referenceCurve', () => {
  it('按章节数重采样且落在 0-100', () => {
    for (const preset of ['escalation', 'suspense', 'wave', 'frontLoad', 'flat'] as const) {
      const curve = referenceCurve(preset, 30)
      expect(curve, preset).toHaveLength(30)
      for (const v of curve) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('递进爬升整体上行，波浪呼吸有起伏', () => {
    const escalation = referenceCurve('escalation', 12)
    expect(escalation[11]!).toBeGreaterThan(escalation[0]!)
    const wave = referenceCurve('wave', 12)
    const ups = wave.filter((v, i) => i > 0 && v > wave[i - 1]!).length
    const downs = wave.filter((v, i) => i > 0 && v < wave[i - 1]!).length
    expect(ups).toBeGreaterThan(0)
    expect(downs).toBeGreaterThan(0)
  })

  it('custom 不生成参考线', () => {
    expect(referenceCurve('custom', 10)).toEqual([])
  })
})

describe('renderTensionBlock', () => {
  it('没有张力信息时返回空串', () => {
    expect(renderTensionBlock(project([chapter(1)]), 1)).toBe('')
  })

  it('注入目标张力、与上一章的走向和参考曲线位置', () => {
    const p = project([chapter(1, { tension: 30 }), chapter(2, { tension: 55 }), chapter(3, { tension: 52 })], { preset: 'escalation' })
    const block = renderTensionBlock(p, 2)
    expect(block).toContain('本章目标张力 55/100')
    expect(block).toContain('比上一章明显更紧')
    expect(block).toContain('参考曲线')
    const flat = renderTensionBlock(p, 3)
    expect(flat).toContain('与上一章持平')
  })

  it('章号不在计划中时返回空串', () => {
    expect(renderTensionBlock(project([chapter(1, { tension: 50 })]), 9)).toBe('')
  })
})

describe('detectTensionIssues', () => {
  it('章节太少时不报警', () => {
    expect(detectTensionIssues(project([chapter(1, { tension: 20 }), chapter(2, { tension: 30 })]))).toEqual([])
  })

  it('抓实际与目标偏差过大', () => {
    const p = project([
      chapter(1, { tension: 40, review: { score: 80, passed: true, verdict: '', issues: [], tension: 90, reviewedAt: '2026-01-01T00:00:00.000Z' } }),
      chapter(2, { tension: 45 }),
      chapter(3, { tension: 50 }),
    ])
    const issues = detectTensionIssues(p)
    expect(issues.some(i => i.item.includes('张力偏差'))).toBe(true)
  })

  it('抓连续同值的平台期', () => {
    const p = project([1, 2, 3, 4, 5].map(no => chapter(no, { tension: 50 })))
    expect(detectTensionIssues(p).some(i => i.item.includes('几乎无变化'))).toBe(true)
  })

  it('抓高位不回落', () => {
    const p = project([
      chapter(1, { tension: 85 }),
      chapter(2, { tension: 88 }),
      chapter(3, { tension: 90 }),
      chapter(4, { tension: 20 }),
    ])
    expect(detectTensionIssues(p).some(i => i.item.includes('缺少呼吸口'))).toBe(true)
  })

  it('抓长期低位', () => {
    const p = project([1, 2, 3, 4, 5, 6].map(no => chapter(no, { tension: 20 + no })))
    expect(detectTensionIssues(p).some(i => i.item.includes('推进可能偏慢'))).toBe(true)
  })

  it('健康的波浪曲线不报警', () => {
    const p = project([
      chapter(1, { tension: 30 }), chapter(2, { tension: 60 }), chapter(3, { tension: 35 }),
      chapter(4, { tension: 70 }), chapter(5, { tension: 40 }), chapter(6, { tension: 85 }),
    ])
    expect(detectTensionIssues(p)).toEqual([])
  })

  it('实际值缺省时回落到 review.tension', () => {
    const p = project([
      chapter(1, { tension: 50, review: { score: 80, passed: true, verdict: '', issues: [], tension: 52, reviewedAt: '2026-01-01T00:00:00.000Z' } }),
      chapter(2, { tension: 50 }),
      chapter(3, { tension: 50 }),
    ])
    const curve = buildCurveData(p)
    expect(curve.points[0]?.actual).toBe(52)
  })
})

describe('buildCurveData', () => {
  it('逐章给出目标/实际/参考三角数据', () => {
    const p = project([
      chapter(1, { tension: 30 }),
      chapter(2, { tension: 60, tensionActual: 58 }),
    ], { preset: 'wave' })
    const curve = buildCurveData(p)
    expect(curve.preset).toBe('wave')
    expect(curve.points).toHaveLength(2)
    expect(curve.points[0]?.target).toBe(30)
    expect(curve.points[1]?.actual).toBe(58)
    expect(typeof curve.points[0]?.reference).toBe('number')
  })

  it('custom 预设不产生参考值', () => {
    const curve = buildCurveData(project([chapter(1, { tension: 30 })], { preset: 'custom', custom: [] }))
    expect(curve.points[0]?.reference).toBeUndefined()
  })
})

describe('run 型问题的受影响章号', () => {
  it('平台期返回完整区间，中间章也能被定位（面板/合并层据此给建议）', () => {
    const p = project([1, 2, 3, 4, 5, 6].map(no => chapter(no, { tension: 55 })))
    const issue = detectTensionIssues(p).find(i => i.item.includes('几乎无变化'))
    expect(issue?.chapters).toEqual([1, 2, 3, 4])
  })

  it('高位不回落与长期低位同样返回完整区间', () => {
    const high = project([1, 2, 3].map(no => chapter(no, { tension: 85 })))
    expect(detectTensionIssues(high).find(i => i.item.includes('缺少呼吸口'))?.chapters).toEqual([1, 2, 3])
    const low = project([1, 2, 3, 4, 5, 6].map(no => chapter(no, { tension: 30 })))
    // 第 5 章凑满连续 5 章低位 → 受影响区间为 1-5（规则在恰好第 5 章触发）
    expect(detectTensionIssues(low).find(i => i.item.includes('推进可能偏慢'))?.chapters).toEqual([1, 2, 3, 4, 5])
  })
})
