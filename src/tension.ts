/**
 * 张力曲线：把「每章该有多紧」显式化，并在出章后核对实际走向。
 *
 * 为什么要有它：长篇最常见的两种崩法——**一直高能没有呼吸**（读者疲劳）与
 * **长时间低位打转**（读者流失）；这两种都不是单章问题，而是"曲线"问题，
 * 单章审稿看不见。这里提供：
 *   1) 参考曲线（本项目自行设计，仅作形状参照）；
 *   2) 把「本章目标张力」注入写作提示词；
 *   3) 规则核对：实际 vs 目标偏差、连续同值、高潮后不回落、长期低位。
 *
 * 本模块只放纯逻辑（可离线单测）；模型交互与落盘在 engine/routes。
 */

import type { ChapterPlan, ProjectState, TensionCurvePreset, TensionIssue } from './protocol.ts'

/** 单章张力的取值范围。 */
export const TENSION_MIN = 0
export const TENSION_MAX = 100

/**
 * 本项目设计的参考曲线形状（0-100 的采样序列）。
 * 只描述"形状"，不含任何外部数值表。
 */
const REFERENCE_SHAPES: Record<Exclude<TensionCurvePreset, 'custom'>, readonly number[]> = {
  // 递进爬升：整体上行，波峰越来越大
  escalation: [20, 26, 34, 32, 44, 52, 48, 62, 70, 66, 82, 92],
  // 悬疑加压：中段起缓慢抬升，末段释放
  suspense: [30, 42, 38, 50, 46, 58, 62, 56, 70, 78, 86, 74],
  // 波浪呼吸：高低交替，给读者留呼吸口
  wave: [45, 30, 55, 34, 62, 40, 70, 46, 78, 52, 84, 60],
  // 前紧后稳：开篇抓人，中后段平缓推进
  frontLoad: [78, 66, 58, 50, 46, 44, 42, 44, 46, 48, 50, 52],
  // 平稳推进：几乎无起伏（适合日常/经营类）
  flat: [40, 42, 44, 42, 46, 44, 48, 46, 50, 48, 52, 50],
}

/** 参考曲线的中文标签（面板展示）。 */
export const TENSION_PRESET_LABELS: Record<TensionCurvePreset, string> = {
  escalation: '递进爬升',
  suspense: '悬疑加压',
  wave: '波浪呼吸',
  frontLoad: '前紧后稳',
  flat: '平稳推进',
  custom: '自定义',
}

/** 全部可选预设（UI 下拉用）。 */
export const TENSION_PRESETS: readonly TensionCurvePreset[] = ['escalation', 'suspense', 'wave', 'frontLoad', 'flat', 'custom']

/** 把参考形状按章节数重采样（最近邻，保持形状不引入平滑失真）。 */
export function referenceCurve(preset: TensionCurvePreset, chapterCount: number): number[] {
  if (chapterCount <= 0) return []
  if (preset === 'custom') return []
  const shape = REFERENCE_SHAPES[preset]
  if (chapterCount === 1) return [shape[Math.floor(shape.length / 2)] ?? 50]
  return Array.from({ length: chapterCount }, (_, i) => {
    const pos = (i / (chapterCount - 1)) * (shape.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(shape.length - 1, lo + 1)
    const t = pos - lo
    const a = shape[lo] ?? 50
    const b = shape[hi] ?? a
    return Math.round(a + (b - a) * t)
  })
}

/** 读一章的目标张力（未设置时返回 undefined）。 */
export function targetTension(chapter: ChapterPlan): number | undefined {
  return typeof chapter.tension === 'number' ? clampTension(chapter.tension) : undefined
}

/** 读一章的实际张力（审稿时模型打分，未设置时返回 undefined）。 */
export function actualTension(chapter: ChapterPlan): number | undefined {
  const fromReview = chapter.review?.tension
  if (typeof fromReview === 'number') return clampTension(fromReview)
  return typeof chapter.tensionActual === 'number' ? clampTension(chapter.tensionActual) : undefined
}

/** 收敛到合法区间并取整。 */
export function clampTension(value: number): number {
  if (!Number.isFinite(value)) return TENSION_MIN
  return Math.max(TENSION_MIN, Math.min(TENSION_MAX, Math.round(value)))
}

/**
 * 渲染注入写作提示词的「本章张力」块。
 *
 * @param project 项目状态。
 * @param chapterNo 本章章号。
 * @returns 提示词片段；没有张力信息时返回空串。
 */
export function renderTensionBlock(project: ProjectState, chapterNo: number): string {
  const preset = project.tensionCurve?.preset
  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.no - b.no)
  const idx = chapters.findIndex(c => c.no === chapterNo)
  if (idx === -1) return ''
  const target = targetTension(chapters[idx]!)
  const prev = idx > 0 ? targetTension(chapters[idx - 1]!) : undefined
  if (target === undefined && prev === undefined) return ''
  const ref = preset !== undefined && preset !== 'custom' ? referenceCurve(preset, chapters.length)[idx] : undefined
  const parts: string[] = []
  if (target !== undefined) parts.push(`本章目标张力 ${target}/100`)
  if (prev !== undefined && target !== undefined) {
    const delta = target - prev
    parts.push(delta >= 10 ? '比上一章明显更紧' : delta <= -10 ? '比上一章明显放松（给读者呼吸口）' : '与上一章持平')
  }
  if (ref !== undefined) parts.push(`参考曲线（${TENSION_PRESET_LABELS[preset ?? 'custom']}）在此处约为 ${ref}`)
  if (parts.length === 0) return ''
  return [
    '==================== 本章张力（写作时把握松紧） ====================',
    parts.join('；') + '。',
    '低张力段用于铺垫关系、交代信息、留呼吸；高张力段用于对抗、揭示、抉择与代价。',
    '同一章内可以有起伏，但整章的平均松紧要贴近目标值；不要连续多章都停在同一个紧张度。',
  ].join('\n')
}

/**
 * 规则核对张力曲线（不调模型）。
 *
 * 检查四类曲线级问题：
 *   1) 实际与目标偏差过大（>25）；
 *   2) 连续多章几乎同值（≥4 章落差 <6，平台期无起伏）；
 *   3) 高点之后没有回落（连续 ≥3 章处在高位 ≥80）；
 *   4) 长期低位（连续 ≥5 章 <40，容易拖沓）。
 *
 * @param project 项目状态。
 * @returns 问题清单（可能为空）。
 */
export function detectTensionIssues(project: ProjectState): TensionIssue[] {
  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.no - b.no)
  const values = chapters.map(c => ({ no: c.no, target: targetTension(c), actual: actualTension(c) }))
  const known = values.filter(v => v.target !== undefined || v.actual !== undefined)
  if (known.length < 3) return []
  const issues: TensionIssue[] = []

  // 1) 偏差
  for (const v of values) {
    if (v.target === undefined || v.actual === undefined) continue
    const gap = v.actual - v.target
    if (Math.abs(gap) > 25) {
      issues.push({
        severity: Math.abs(gap) > 40 ? 'high' : 'medium',
        chapters: [v.no],
        item: `第${v.no}章张力偏差较大：目标 ${v.target}，实际 ${v.actual}（${gap > 0 ? '比目标更紧' : '比目标更松'}）`,
        suggestion: gap > 0 ? '本章对抗/揭示密度偏高，考虑把部分冲突后移，留出呼吸段。' : '本章推进偏平，考虑加一处对抗、揭示或代价。',
      })
    }
  }

  // 2) 平台期（连续同值）
  let run = 1
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1]!.target ?? values[i - 1]!.actual
    const b = values[i]!.target ?? values[i]!.actual
    if (a !== undefined && b !== undefined && Math.abs(b - a) < 6) {
      run++
      if (run === 4) {
        const from = values[i - run + 1]!.no
        issues.push({
          severity: 'medium',
          chapters: [from, values[i]!.no],
          item: `第${from}-${values[i]!.no}章张力几乎无变化（连续 ${run} 章）`,
          suggestion: '安排一次明显抬升或一次释放，让曲线有起伏，避免读者疲劳。',
        })
      }
    } else {
      run = 1
    }
  }

  // 3) 高位不回落
  let highRun = 0
  for (const v of values) {
    const val = v.target ?? v.actual
    if (val !== undefined && val >= 80) {
      highRun++
      if (highRun === 3) {
        issues.push({
          severity: 'medium',
          chapters: [v.no - 2, v.no],
          item: `连续 ${highRun} 章处在高位（≥80），缺少呼吸口`,
          suggestion: '高潮之后补一章缓冲（关系推进、信息消化或日常），再进入下一轮对抗。',
        })
      }
    } else {
      highRun = 0
    }
  }

  // 4) 长期低位
  let lowRun = 0
  for (const v of values) {
    const val = v.target ?? v.actual
    if (val !== undefined && val < 40) {
      lowRun++
      if (lowRun === 5) {
        issues.push({
          severity: 'high',
          chapters: [v.no - 4, v.no],
          item: `连续 ${lowRun} 章张力低于 40，推进可能偏慢`,
          suggestion: '提前兑现一个目标、抛出一个新风险，或让配角线产生冲撞。',
        })
      }
    } else {
      lowRun = 0
    }
  }

  return issues
}

/**
 * 组装面板需要的曲线数据（章节号 / 目标 / 实际 / 参考）。
 *
 * @param project 项目状态。
 * @returns 逐章数据点与预设名。
 */
export function buildCurveData(project: ProjectState): {
  preset: TensionCurvePreset
  points: Array<{ no: number; title: string; target?: number; actual?: number; reference?: number }>
} {
  const preset: TensionCurvePreset = project.tensionCurve?.preset ?? 'escalation'
  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.no - b.no)
  const custom = project.tensionCurve?.custom ?? []
  const reference = preset === 'custom'
    ? custom
    : referenceCurve(preset, chapters.length)
  return {
    preset,
    points: chapters.map((c, i) => {
      const point: { no: number; title: string; target?: number; actual?: number; reference?: number } = { no: c.no, title: c.title }
      const t = targetTension(c)
      const a = actualTension(c)
      if (t !== undefined) point.target = t
      if (a !== undefined) point.actual = a
      if (reference[i] !== undefined) point.reference = reference[i]
      return point
    }),
  }
}
