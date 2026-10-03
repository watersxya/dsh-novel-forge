/**
 * 本地 AI 味扫描器（不调 LLM，确定性检测）
 *
 * 用途：生成/润色后自动扫描，结果作为「事实锚点」注入审稿提示词，
 * 让 LLM 做判断而非机械统计。也可用于 UI 展示 AI 味指标。
 *
 * ## 度量口径
 *
 * 下面五条口径全部用 **1279 章 / 6 本已发布书稿**实测标定过。前两条是**已修复的
 * 真实缺陷**（不是调参偏好），后三条是把不可比的量纲换成可比的。
 *
 * 1. **段落**：书稿正文的自然段由**单换行**分隔（run.ts 写盘即如此），历史实现按
 *    /\n{2,}/ 切 —— 在真实书稿上整章只切出 **2 段**（1279 章无一例外），于是段落方差、
 *    过长段、连续解说段三项指标全部失效，其中「连续解说段 >= 3」永不成立。
 *    现按 /\n+/ 切，并剔除 # 标题行。实测每章 p50 = 68 段，段落均长 p50 = 50 字。
 * 2. **对话**：中文书稿主流用全角弯引号（语料 6 本里 **5 本**如此：番茄线上正文、
 *    还债疯了、我养的废柴师妹、归墟玉主、保质期），历史实现的字符类只认 ASCII 双引号
 *    与角括号，使这 5 本的对话占比**恒为 0**，并因此每章误加 10 分。
 * 3. **段落整齐度**：用变异系数 CV = sigma / mean，不用方差 —— 方差的量纲是「字符平方」，
 *    随段长平方缩放，段落均长 50 与均长 500 的章用同一个绝对阈值不可比。
 *    语料 CV：p5 0.55 / p50 0.69 / p95 0.87。
 * 4. **套话按稀有度加权**：历史实现把「重度 / 轻度」两档等同计分，而实测「知道」覆盖
 *    78.4% 的已发布章节、「微微」48.2%，「难以言喻」0.0%、「不由得」0.1%。把前者与后者
 *    等同，会让所有正常章节的基线虚高。现按相对语料的覆盖率给权重（见 CLICHE_COVERAGE）。
 * 5. **短章不再爆炸**：密度分母取 max(字数, 2000) —— 历史实现里同样「1 次套话」，在
 *    444 字的章值 18 分、在 3576 字的章值 2.2 分，同一现象 8 倍权重差。
 *
 * 分项满分与语料分位点的对应关系集中在 {@link SCORE_SPEC}，便于日后重新标定。
 */

export interface AiScanResult {
  /** 总评分 0-100，越高越像 AI 写的 */
  aiScore: number
  /** 命中的套话及次数（weight 为该词按语料稀有度折算的权重，0 = 功能词） */
  clicheHits: Array<{ word: string; count: number; weight: number }>
  /** 判定用的自然段数（口径可自查：真实书稿每章数十段） */
  paragraphCount: number
  /** 段落长度方差（保留原字段，注意其量纲随段长平方缩放，判定请用 cv） */
  paragraphLengthVariance: number
  /** 段落长度变异系数 sigma / mean：与段长规模无关，整齐度判定用这个 */
  paragraphLengthCv: number
  /** 连续解释性叙事段数（>=3 视为问题） */
  consecutiveExpositoryParagraphs: number
  /** 句式重复率（相同开头句式占比） */
  sentenceRepetitionRate: number
  /** 过长段落数（>300 字） */
  longParagraphCount: number
  /** 过短段落数（<20 字） */
  shortParagraphCount: number
  /** 对话占比（0-1） */
  dialogueRatio: number
  /** 各分项得分：便于自查「这章凭什么这么多分」，也是标定与单测的抓手 */
  scoreParts: AiScanScoreParts
  /** 问题摘要，可直接注入审稿提示词 */
  summary: string
}

/** 评分分项（每项满分与语料分位点的对应见 SCORE_SPEC）。 */
export interface AiScanScoreParts {
  /** 套话：满分对应语料加权密度 p99（2.16/千字） */
  cliche: number
  /** 段落过于整齐（CV 低于语料 p5） */
  uniformParagraphs: number
  /** 连续解释性叙事 */
  expository: number
  /** 句首重复率（零点取语料 p50 = 0.37，满分取 p99 = 0.63） */
  repetition: number
  /** 对话占比过低 */
  lowDialogue: number
}

/**
 * 套话词 -> 它在「已发布书稿语料」中被多少比例的章节命中过。
 *
 * 这张表是**基线**，不是观点：覆盖率越高，说明该词越接近作者/题材的常用表达，
 * 越不适合当作 AI 味证据。更换语料或题材后应重新统计（脚本思路见注释末尾）。
 */
const CLICHE_COVERAGE: Readonly<Record<string, number>> = {
  知道: 0.784, 微微: 0.482, 轻轻: 0.481, 感觉: 0.449, 气息: 0.392,
  终于: 0.306, 缓缓: 0.303, 嘴角: 0.292, 眼神: 0.174, 明白: 0.167,
  眉头: 0.145, 似乎: 0.144, 身影: 0.142, 力量: 0.127, 光芒: 0.087,
  仿佛: 0.075, 其实: 0.070, 显然: 0.068, 脑海: 0.050, 然而: 0.027,
  默默: 0.025, 一时间: 0.019, 心中: 0.010, 不由自主: 0.007, 顿时: 0.005,
  不禁: 0.005, 无法形容: 0.002, 不由得: 0.001, 难以言喻: 0,
}

/** 覆盖率 -> 权重：覆盖率 >= 50% 记为功能词（权重 0），0% 记 1。 */
function clicheWeight(coverage: number): number {
  return Math.max(0, 1 - coverage / 0.5)
}

/**
 * 对话引号：ASCII 双引号 + 全角弯引号（中文书稿主流）+ 单弯引号 + 角括号。
 * 历史实现只认第一种与后两种，漏掉弯引号 —— 那正是 5/6 本书在用的。
 */
const DIALOGUE_PATTERN = /(?:"[^"]*"|\u201C[^\u201D]*\u201D|\u2018[^\u2019]*\u2019|\u300C[^\u300D]*\u300D|\u300E[^\u300F]*\u300F)/g

/** 解释性叙事开头模式 */
const EXPOSITORY_STARTS = [
  '原来', '因为', '由于', '所以', '因此', '于是',
  '这就是', '也就是说', '换句话说', '事实上', '实际上',
]

/**
 * 分项满分与语料分位点的对应关系（重新标定时只改这里）。
 *
 * - clicheFullDensity 2.16 = 语料加权套话密度 p99；p50 为 0.51
 * - cvTooUniform 0.45 低于语料 CV p5（0.55），即只把最整齐的 0.6% 判为问题
 * - repetitionZeroAt 0.37 = 语料句首重复率 p50；repetitionFullAt 0.63 = p99
 *   （中文「句首二字」天然高频，原来的固定阈值 0.15 几乎每章都命中、形同虚设）
 */
const SCORE_SPEC = {
  clicheMax: 40,
  clicheFullDensity: 2.16,
  cvTooUniform: 0.45,
  cvMax: 15,
  expositoryMax: 20,
  expositoryPerParagraph: 5,
  repetitionMax: 15,
  repetitionZeroAt: 0.37,
  repetitionFullAt: 0.63,
  lowDialogueThreshold: 0.05,
  lowDialogueMax: 10,
  densityFloorChars: 2000,
}

/**
 * 按真实书稿的换行形态切自然段：单换行分隔，剔除 # 标题行。
 * @param text - 章节正文（可含标题行）。
 * @returns 自然段数组（已 trim、去空）。
 */
function paragraphsOf(text: string): string[] {
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !/^#{1,6}\s/.test(p))
}

/** 子串出现次数（不重叠）。 */
function countOccurrences(text: string, word: string): number {
  if (word.length === 0) return 0
  let count = 0
  let at = text.indexOf(word)
  while (at !== -1) {
    count += 1
    at = text.indexOf(word, at + word.length)
  }
  return count
}

/** 把 x 线性映射到 [0, 1] 并夹逼。 */
function ratio(x: number, zeroAt: number, fullAt: number): number {
  if (fullAt === zeroAt) return 0
  return Math.max(0, Math.min(1, (x - zeroAt) / (fullAt - zeroAt)))
}

export function scanAiFlavor(text: string): AiScanResult {
  const paragraphs = paragraphsOf(text)
  const totalChars = text.length

  // 1. 套话统计（按语料稀有度加权）
  const clicheHits: Array<{ word: string; count: number; weight: number }> = []
  let weightedTotal = 0
  for (const word of Object.keys(CLICHE_COVERAGE)) {
    const count = countOccurrences(text, word)
    if (count === 0) continue
    const weight = clicheWeight(CLICHE_COVERAGE[word] ?? 0.5)
    clicheHits.push({ word, count, weight })
    weightedTotal += count * weight
  }
  clicheHits.sort((a, b) => b.count * b.weight - a.count * a.weight)

  // 2. 段落长度：方差（保留）+ 变异系数（判定用）
  const paraLengths = paragraphs.map(p => p.length)
  const avgLen = paraLengths.length > 0 ? paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length : 0
  const variance = paraLengths.length > 0
    ? paraLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / paraLengths.length
    : 0
  const cv = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0

  // 3. 连续解释性叙事
  let maxConsecutive = 0
  let currentConsecutive = 0
  for (const p of paragraphs) {
    const isExpository = EXPOSITORY_STARTS.some(s => p.startsWith(s))
      || (p.length > 150 && !/["\u201C\u300C\u300E]/.test(p))
    if (isExpository) {
      currentConsecutive++
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
    } else {
      currentConsecutive = 0
    }
  }

  // 4. 句式重复率（相同句首二字）
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
  const dialogueChars = (text.match(DIALOGUE_PATTERN) ?? []).join('').length
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0

  // 7. 综合评分（各分项按语料分位点标定，见 SCORE_SPEC）
  const densityDenom = Math.max(totalChars, SCORE_SPEC.densityFloorChars)
  const clicheDensity = (weightedTotal / densityDenom) * 1000
  // 段数太少时 CV 没有统计意义（1 段必然 CV=0），故设段数下限；
  // 守卫不能写成 cv > 0 —— 段落长度完全一致时 CV 恰为 0，那正是要抓的情况。
  const scoreParts: AiScanScoreParts = {
    cliche: Math.min(SCORE_SPEC.clicheMax, (clicheDensity / SCORE_SPEC.clicheFullDensity) * SCORE_SPEC.clicheMax),
    uniformParagraphs: paragraphs.length >= 8 && cv < SCORE_SPEC.cvTooUniform ? SCORE_SPEC.cvMax : 0,
    expository: Math.min(SCORE_SPEC.expositoryMax, maxConsecutive * SCORE_SPEC.expositoryPerParagraph),
    repetition: SCORE_SPEC.repetitionMax * ratio(sentenceRepetitionRate, SCORE_SPEC.repetitionZeroAt, SCORE_SPEC.repetitionFullAt),
    lowDialogue: dialogueRatio < SCORE_SPEC.lowDialogueThreshold && totalChars > 1000 ? SCORE_SPEC.lowDialogueMax : 0,
  }
  const aiScore = Math.min(100, Math.round(
    scoreParts.cliche + scoreParts.uniformParagraphs + scoreParts.expository + scoreParts.repetition + scoreParts.lowDialogue,
  ))

  // 8. 问题摘要（注入审稿提示词的事实锚点）
  const issues: string[] = []
  if (clicheDensity > 0.75) {
    const top = clicheHits.filter(h => h.weight > 0).slice(0, 5)
      .map(h => h.word + 'x' + h.count).join('、')
    issues.push('套话偏多（按语料稀有度加权 ' + clicheDensity.toFixed(2) + '/千字，p50 为 0.51）：' + top)
  }
  if (scoreParts.uniformParagraphs > 0) issues.push('段落长度过于整齐（CV ' + cv.toFixed(2) + ' < ' + SCORE_SPEC.cvTooUniform + '，已发布语料 p5 为 0.55）')
  if (maxConsecutive >= 3) issues.push('连续 ' + maxConsecutive + ' 段解释性叙事，缺少对话/动作')
  if (sentenceRepetitionRate > 0.5) issues.push('句式重复率 ' + (sentenceRepetitionRate * 100).toFixed(0) + '%，开头句式单一')
  if (longParagraphCount > 3) issues.push(longParagraphCount + ' 段超过 300 字，段落过长')
  if (scoreParts.lowDialogue > 0) issues.push('对话占比过低（' + (dialogueRatio * 100).toFixed(1) + '%），整章偏叙述')

  const head = '本地 AI 味扫描（AI 味指数 ' + aiScore + '/100，共 ' + paragraphs.length + ' 个自然段）'
  const summary = issues.length > 0
    ? head + '：\n' + issues.map(i => '- ' + i).join('\n')
    : head + '：未发现明显问题。'

  return {
    aiScore,
    clicheHits,
    paragraphCount: paragraphs.length,
    paragraphLengthVariance: Math.round(variance),
    paragraphLengthCv: Math.round(cv * 100) / 100,
    consecutiveExpositoryParagraphs: maxConsecutive,
    sentenceRepetitionRate: Math.round(sentenceRepetitionRate * 1000) / 1000,
    longParagraphCount,
    shortParagraphCount,
    dialogueRatio: Math.round(dialogueRatio * 100) / 100,
    scoreParts,
    summary,
  }
}
