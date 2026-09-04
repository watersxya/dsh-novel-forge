/**
 * 审稿规则注册表
 *
 * 生成用 compact 模式（核心规则），审稿用 full 模式（全部规则），
 * 消除 reviewSystemPrompt 内嵌规则与 renderAllAssets() 两套打架的问题。
 */

/** 通用写作资产规则（兼容 ProjectAssets 中的各类规则） */
export interface WritingRule {
  name: string
  description: string
  type?: string
  enabled?: boolean
}

export interface ReviewRule {
  id: string
  /** 规则维度 */
  dimension: 'character' | 'setting' | 'redline' | 'writing' | 'pacing' | 'logic' | 'anti-ai' | 'presentation' | 'compliance'
  /** 严重度 */
  severity: 'high' | 'medium' | 'low'
  /** 规则类型：forbidden=禁止类（命中即问题），encourage=鼓励类（不命中不算错） */
  type: 'forbidden' | 'encourage'
  /** 规则描述 */
  description: string
  /** 是否启用 */
  enabled: boolean
  /** 作用域 */
  scope: Array<'writing' | 'review' | 'polish' | 'all'>
}

/** 内置审稿维度（结构化评分用） */
export const REVIEW_DIMENSIONS = [
  { id: 'character', name: '人设一致性', weight: 0.2 },
  { id: 'setting', name: '设定一致性', weight: 0.15 },
  { id: 'redline', name: '红线检查', weight: 0.15 },
  { id: 'writing', name: '文笔质量', weight: 0.15 },
  { id: 'pacing', name: '节奏与爽点', weight: 0.1 },
  { id: 'logic', name: '逻辑漏洞', weight: 0.1 },
  { id: 'anti-ai', name: '反 AI 规则', weight: 0.05 },
  { id: 'presentation', name: '呈现方式', weight: 0.05 },
  { id: 'compliance', name: '内容合规', weight: 0.05 },
] as const

export type ReviewDimensionId = typeof REVIEW_DIMENSIONS[number]['id']

/** 维度结构化评分 */
export interface DimensionScore {
  dimension: ReviewDimensionId
  score: number // 0-100
  note: string
}

/**
 * 渲染审稿规则（compact 或 full 模式）
 *
 * compact: 只渲染禁止类 + high 严重度（用于生成时的约束）
 * full: 渲染全部启用规则（用于审稿时的检查清单）
 */
export function renderReviewRules(
  assets: WritingRule[] | undefined,
  mode: 'compact' | 'full' = 'full',
): string {
  const lines: string[] = []

  // 内置核心规则（所有模式都注入）
  const coreRules = [
    { dimension: 'character', desc: '角色行为符合角色卡设定（性格/目标/知情度/说话方式）' },
    { dimension: 'setting', desc: '金手指规则、战力体系、世界观与道藏一致' },
    { dimension: 'redline', desc: '不触犯本书写作红线' },
    { dimension: 'compliance', desc: '不触犯内容合规红线（最高优先级）' },
    { dimension: 'logic', desc: '无前后矛盾、时间线错误、对话失真' },
    { dimension: 'presentation', desc: '不纯内心推理铺陈；反派有行动力；重要配角有辨识度' },
  ]

  if (mode === 'compact') {
    lines.push('写作约束（核心规则）：')
    for (const r of coreRules) {
      lines.push(`- ${r.desc}`)
    }
  } else {
    lines.push('审稿维度（逐条审查）：')
    REVIEW_DIMENSIONS.forEach((d, i) => {
      const core = coreRules.find(c => c.dimension === d.id)
      lines.push(`${i + 1}. ${d.name}：${core?.desc ?? '按维度标准审查'}`)
    })
    lines.push('')
    lines.push('反 AI 规则：逐条核对下方资产规则，命中即列为问题。')
    lines.push('呈现方式：整章是否纯内心推理铺陈（无对话/无对抗）；反派是否纯背景板；重要配角是否无名标签化——命中即列为问题。')
    lines.push('内容合规（最高优先级）：逐条核对合规红线，任何一条命中（含影射、暗示、详细描写）必须列为 high。')
  }

  // 注入用户自定义资产规则
  if (assets !== undefined && assets.length > 0) {
    const forbidden = assets.filter(a => a.type === 'forbidden' || a.type === 'rule')
    const encourage = assets.filter(a => a.type === 'encourage' || a.type === 'style')
    if (forbidden.length > 0) {
      lines.push('')
      lines.push('禁止类规则（命中即问题）：')
      for (const a of forbidden) {
        lines.push(`- ${a.name}：${a.description}`)
      }
    }
    if (encourage.length > 0 && mode === 'full') {
      lines.push('')
      lines.push('鼓励类规则（不命中不算错，作为低优先级建议）：')
      for (const a of encourage) {
        lines.push(`- ${a.name}：${a.description}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * 从审稿 issues 中按维度统计
 * 用于结构化评分和 UI 展示。
 */
export function groupIssuesByDimension(
  issues: Array<{ severity: string; item: string; dimension?: string }>,
): Record<string, Array<{ severity: string; item: string }>> {
  const result: Record<string, Array<{ severity: string; item: string }>> = {}
  for (const issue of issues) {
    const dim = issue.dimension ?? inferDimension(issue.item)
    if (result[dim] === undefined) result[dim] = []
    result[dim]!.push({ severity: issue.severity, item: issue.item })
  }
  return result
}

/** 根据问题描述推断维度（兼容旧报告，没有 dimension 字段时用） */
function inferDimension(item: string): ReviewDimensionId {
  if (/人设|角色|性格|口吻|知情|OOC/.test(item)) return 'character'
  if (/设定|世界观|战力|金手指|规则|道藏/.test(item)) return 'setting'
  if (/红线|后宫|擦边|碾压|圣母/.test(item)) return 'redline'
  if (/语病|翻译腔|套话|文笔|流水账|AI/.test(item)) return 'writing'
  if (/节奏|拖沓|灌水|爽点|钩子|悬念/.test(item)) return 'pacing'
  if (/矛盾|时间线|逻辑|对话失真/.test(item)) return 'logic'
  if (/合规|敏感|色情|暴力|政治|未成年/.test(item)) return 'compliance'
  if (/内心推理|背景板|标签化|瘦高个|灰衣人/.test(item)) return 'presentation'
  return 'writing'
}

/**
 * 计算维度加权总分
 * 用于审稿报告的结构化评分。
 */
export function calculateWeightedScore(
  dimensions: DimensionScore[],
): number {
  let total = 0
  let weightSum = 0
  for (const d of dimensions) {
    const def = REVIEW_DIMENSIONS.find(x => x.id === d.dimension)
    const weight = def?.weight ?? 0.1
    total += d.score * weight
    weightSum += weight
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 60
}
