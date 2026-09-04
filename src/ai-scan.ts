/**
 * 本地 AI 味扫描器（不调 LLM，确定性检测）
 *
 * 用途：生成/润色后自动扫描，结果作为「事实锚点」注入审稿提示词，
 * 让 LLM 做判断而非机械统计。也可用于 UI 展示 AI 味指标。
 */

export interface AiScanResult {
  /** 总评分 0-100，越高越像 AI 写的 */
  aiScore: number
  /** 命中的套话及次数 */
  clicheHits: Array<{ word: string; count: number }>
  /** 段落长度方差（过高=段落过于整齐） */
  paragraphLengthVariance: number
  /** 连续解释性叙事段数（≥3 视为问题） */
  consecutiveExpositoryParagraphs: number
  /** 句式重复率（相同开头句式占比） */
  sentenceRepetitionRate: number
  /** 过长段落数（>300字） */
  longParagraphCount: number
  /** 过短段落数（<20字） */
  shortParagraphCount: number
  /** 对话占比（0-1） */
  dialogueRatio: number
  /** 问题摘要，可直接注入审稿提示词 */
  summary: string
}

/** 重灾区套话（高频出现即问题） */
const HEAVY_CLICHES = [
  '不禁', '仿佛', '一时间', '不由得', '顿时', '然而',
  '缓缓', '轻轻', '微微', '默默', '似乎', '终于',
  '显然', '其实', '无法形容', '难以言喻', '不由自主',
]

/** 轻微套话（偶尔出现可接受，高频才问题） */
const LIGHT_CLICHES = [
  '心中', '脑海', '眼神', '嘴角', '眉头', '身影',
  '气息', '光芒', '力量', '感觉', '知道', '明白',
]

/** 解释性叙事开头模式 */
const EXPOSITORY_STARTS = [
  '原来', '因为', '由于', '所以', '因此', '于是',
  '这就是', '也就是说', '换句话说', '事实上', '实际上',
]

export function scanAiFlavor(text: string): AiScanResult {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0)
  const totalChars = text.length

  // 1. 套话统计
  const clicheHits: Array<{ word: string; count: number }> = []
  let clicheTotal = 0
  for (const word of [...HEAVY_CLICHES, ...LIGHT_CLICHES]) {
    const count = countOccurrences(text, word)
    if (count > 0) {
      clicheHits.push({ word, count })
      clicheTotal += count
    }
  }
  clicheHits.sort((a, b) => b.count - a.count)

  // 2. 段落长度方差
  const paraLengths = paragraphs.map(p => p.length)
  const avgLen = paraLengths.length > 0 ? paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length : 0
  const variance = paraLengths.length > 0
    ? paraLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / paraLengths.length
    : 0

  // 3. 连续解释性叙事
  let maxConsecutive = 0
  let currentConsecutive = 0
  for (const p of paragraphs) {
    const isExpository = EXPOSITORY_STARTS.some(s => p.startsWith(s)) ||
      (p.length > 150 && !p.includes('"') && !p.includes('「') && !p.includes('『'))
    if (isExpository) {
      currentConsecutive++
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
    } else {
      currentConsecutive = 0
    }
  }

  // 4. 句式重复率（相同句首词）
  const sentences = text.split(/[。！？!?]/).map(s => s.trim()).filter(s => s.length > 0)
  const starterCounts = new Map<string, number>()
  for (const s of sentences) {
    const starter = s.slice(0, 2)
    starterCounts.set(starter, (starterCounts.get(starter) ?? 0) + 1)
  }
  const repeatedStarters = Array.from(starterCounts.values()).filter(c => c >= 3).reduce((a, b) => a + b, 0)
  const sentenceRepetitionRate = sentences.length > 0 ? repeatedStarters / sentences.length : 0

  // 5. 段落长度分布
  const longParagraphCount = paraLengths.filter(l => l > 300).length
  const shortParagraphCount = paraLengths.filter(l => l < 20).length

  // 6. 对话占比
  const dialogueChars = (text.match(/["「『][^"」』]*["」』]/g) ?? []).join('').length
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0

  // 7. 综合 AI 味评分（0-100，越高越像 AI）
  let aiScore = 0
  // 套话密度（每千字套话数）
  const clicheDensity = totalChars > 0 ? (clicheTotal / totalChars) * 1000 : 0
  aiScore += Math.min(40, clicheDensity * 8)
  // 段落过于整齐（方差小=AI特征）
  if (variance < 2000 && paraLengths.length >= 5) aiScore += 15
  // 连续解释性叙事
  aiScore += Math.min(20, maxConsecutive * 5)
  // 句式重复
  aiScore += Math.min(15, sentenceRepetitionRate * 30)
  // 对话过少
  if (dialogueRatio < 0.05 && totalChars > 1000) aiScore += 10
  aiScore = Math.min(100, Math.round(aiScore))

  // 8. 问题摘要
  const issues: string[] = []
  if (clicheDensity > 3) {
    const topCliches = clicheHits.slice(0, 5).map(h => `${h.word}×${h.count}`).join('、')
    issues.push(`套话密度偏高（每千字 ${clicheDensity.toFixed(1)} 次）：${topCliches}`)
  }
  if (maxConsecutive >= 3) issues.push(`连续 ${maxConsecutive} 段解释性叙事，缺少对话/动作`)
  if (sentenceRepetitionRate > 0.15) issues.push(`句式重复率 ${(sentenceRepetitionRate * 100).toFixed(0)}%，开头句式单一`)
  if (longParagraphCount > 3) issues.push(`${longParagraphCount} 段超过 300 字，段落过长`)
  if (dialogueRatio < 0.05 && totalChars > 1000) issues.push('对话占比过低，整章偏叙述')

  const summary = issues.length > 0
    ? `本地 AI 味扫描（AI 味指数 ${aiScore}/100）：\n` + issues.map(i => `- ${i}`).join('\n')
    : `本地 AI 味扫描（AI 味指数 ${aiScore}/100）：未发现明显问题。`

  return {
    aiScore,
    clicheHits,
    paragraphLengthVariance: Math.round(variance),
    consecutiveExpositoryParagraphs: maxConsecutive,
    sentenceRepetitionRate: Math.round(sentenceRepetitionRate * 100) / 100,
    longParagraphCount,
    shortParagraphCount,
    dialogueRatio: Math.round(dialogueRatio * 100) / 100,
    summary,
  }
}

function countOccurrences(text: string, word: string): number {
  if (word.length === 0) return 0
  let count = 0
  let idx = text.indexOf(word)
  while (idx !== -1) {
    count++
    idx = text.indexOf(word, idx + word.length)
  }
  return count
}

/** 扫描前后对比（润色时用） */
export function compareAiScan(before: AiScanResult, after: AiScanResult): {
  improved: boolean
  deltaScore: number
  details: string[]
} {
  const deltaScore = before.aiScore - after.aiScore
  const details: string[] = []
  if (deltaScore > 0) details.push(`AI 味指数下降 ${deltaScore} 分（${before.aiScore} → ${after.aiScore}）`)
  else if (deltaScore < 0) details.push(`AI 味指数上升 ${-deltaScore} 分（${before.aiScore} → ${after.aiScore}），需检查`)
  else details.push(`AI 味指数持平（${before.aiScore}）`)

  const beforeCliches = before.clicheHits.reduce((a, b) => a + b.count, 0)
  const afterCliches = after.clicheHits.reduce((a, b) => a + b.count, 0)
  if (afterCliches < beforeCliches) details.push(`套话减少 ${beforeCliches - afterCliches} 处`)
  else if (afterCliches > beforeCliches) details.push(`套话增加 ${afterCliches - beforeCliches} 处`)

  return {
    improved: deltaScore > 0,
    deltaScore,
    details,
  }
}
