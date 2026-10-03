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
 *    等同，会让所有正常章节的基线虚高。现按相对语料的覆盖率给权重（见 PATTERN_COVERAGE）。
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
  /** 作者生效规则里的确定性命中（按规则逐条统计；未传规则时为空） */
  ruleHits: AiScanRuleHit[]
  /** 各分项得分：便于自查「这章凭什么这么多分」，也是标定与单测的抓手 */
  scoreParts: AiScanScoreParts
  /** 问题摘要，可直接注入审稿提示词 */
  summary: string
}

/** 评分分项（每项满分与语料分位点的对应见 SCORE_SPEC）。 */
export interface AiScanScoreParts {
  /** 套话/模式：满分对应语料加权密度 p99（2.478/千字，63 模式并集口径） */
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

/** 扫描器需要的规则输入（结构类型，避免 ai-scan 反向依赖协议层）。 */
export interface AiScanRuleInput {
  name: string
  severity?: 'forbidden' | 'risk' | 'encourage'
  detectPatterns?: readonly string[]
}

/** 一条规则在本章的确定性命中（只报命中的规则）。 */
export interface AiScanRuleHit {
  name: string
  severity?: 'forbidden' | 'risk' | 'encourage'
  matches: Array<{ pattern: string; count: number }>
}

/**
 * 命中模式 -> 它在「已发布书稿语料」中被多少比例的章节命中过。
 *
 * ## 这张表是什么
 *
 * 它是**度量基线**，不是观点：覆盖率越高，说明该写法越接近作者/题材的常态表达，
 * 越不适合当作 AI 味证据。覆盖率 >= 50% 记权重 0（视为功能词），0% 记 1。
 *
 * ## 模式从哪来
 *
 * 并集共 **63 个** = 反 AI 规则里作者声明的 detectPatterns（42 个）+ 度量基线词表。
 * 实测「最后」(72.3%)、「然后」(70.1%) 的覆盖率比「微微」(48.2%) 还高 —— 它们是中文
 * 叙事的正常连接词，权重为 0；而「生活就是」「归根结底」「人总要学会」这类结构性升华句
 * 覆盖率是 **0.000**，才是真正的高价值信号。原先的实现根本没在看后者。
 *
 * ## 与规则的关系（刻意解耦）
 *
 * aiScore 是**独立标定的测量**：用户删掉一条规则，并不会让正文的 AI 味变少，
 * 所以度量不依赖规则的当前状态。规则命中另走 {@link AiScanResult.ruleHits}，
 * 按作者**生效的规则**逐条确定性统计。两者都注入审稿，但互不污染。
 *
 * 覆盖率为 0 的 17 个模式也显式列出，避免「表里没有 = 没在看」的误读。
 * 更换语料或题材后应重新统计。
 */
const PATTERN_COVERAGE: Readonly<Record<string, number>> = {
  '知道': 0.784, '最后': 0.723, '然后': 0.701, '微微': 0.482, '轻轻': 0.481,
  '感觉': 0.449, '气息': 0.392, '终于': 0.306, '接着': 0.304, '缓缓': 0.303,
  '嘴角': 0.292, '眼神': 0.174, '明白': 0.167, '眉头': 0.145, '似乎': 0.144,
  '身影': 0.142, '力量': 0.127, '光芒': 0.087, '好像': 0.084, '仿佛': 0.075,
  '其实': 0.07, '显然': 0.068, '脑海': 0.05, '这就是': 0.045, '告诉你': 0.041,
  '然而': 0.027, '默默': 0.025, '这说明': 0.02, '一时间': 0.019, '他感到': 0.011,
  '这意味着': 0.011, '心中': 0.01, '脑海中': 0.008, '不由自主': 0.007, '顿时': 0.005,
  '不禁': 0.005, '说到底': 0.005, '其实就是': 0.005, '心里想': 0.005, '他明白了': 0.003,
  '无法形容': 0.002, '他意识到': 0.002, '她意识到': 0.002, '她明白了': 0.002, '宛如': 0.002,
  '不由得': 0.001,
  '她感到': 0, '生活就是': 0, '命运总会': 0, '归根结底': 0, '我们都应该': 0,
  '人总要学会': 0, '真正重要的是': 0, '我们现在要': 0, '接下来就': 0, '首先': 0,
  '心中暗道': 0, '暗自思忖': 0, '心中暗想': 0, '心里暗道': 0, '犹如': 0,
  '好似': 0, '难以言喻': 0,
}

/** 覆盖率 -> 权重：覆盖率 >= 50% 记为功能词（权重 0），0% 记 1。 */
function patternWeight(coverage: number): number {
  return Math.max(0, 1 - coverage / 0.5)
}

/**
 * 对话引号：ASCII 双引号 + 全角弯引号（中文书稿主流）+ 单弯引号 + 角括号。
 * 历史实现只认第一种与后两种，漏掉弯引号 —— 那正是 5/6 本书在用的。
 */
const DIALOGUE_PATTERN = /(?:"[^"]*"|\u201C[^\u201D]*\u201D|\u2018[^\u2019]*\u2019|\u300C[^\u300D]*\u300D|\u300E[^\u300F]*\u300F)/g

/**
 * 对话字符数（含引号本身）。
 *
 * 导出供写法指纹复用：两处必须同一口径，否则「对话占比」在两个模块里会给出不同的数。
 * @param text - 任意正文。
 * @returns 对话部分的总字符数。
 */
export function dialogueCharsOf(text: string): number {
  return (text.match(DIALOGUE_PATTERN) ?? []).join('').length
}

/** 解释性叙事开头模式 */
const EXPOSITORY_STARTS = [
  '原来', '因为', '由于', '所以', '因此', '于是',
  '这就是', '也就是说', '换句话说', '事实上', '实际上',
]

/**
 * 分项满分与语料分位点的对应关系（重新标定时只改这里）。
 *
 * - clicheFullDensity 2.478 = 语料加权密度 p99（63 模式并集口径）；p50 为 0.61、p75 为 1.02
 * - cvTooUniform 0.45 低于语料 CV p5（0.55），即只把最整齐的 0.6% 判为问题
 * - repetitionZeroAt 0.37 = 语料句首重复率 p50；repetitionFullAt 0.63 = p99
 *   （中文「句首二字」天然高频，原来的固定阈值 0.15 几乎每章都命中、形同虚设）
 */
const SCORE_SPEC = {
  clicheMax: 40,
  clicheFullDensity: 2.478,
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
  /**
   * 规则命中的区分度门槛：只报「对该作者而言不常见」的模式。
   *
   * 实测必要性：「句式重复率偏高」这条规则的 detectPatterns 是
   * ['首先','然后','接着','最后']，而「最后」覆盖 72.3%、「然后」覆盖 70.1% 的已发布
   * 章节 —— 不设门槛时它会在 **94.4%** 的章上命中，等于每章都告诉模型「你违反了这条
   * 规则」，比不报还糟。该规则的本质是「比率偏高」，应由 sentenceRepetitionRate 度量。
   */
  ruleHitCoverageMax: 0.1,
}

/**
 * 按真实书稿的换行形态切自然段：单换行分隔，剔除 # 标题行。
 * @param text - 章节正文（可含标题行）。
 * @returns 自然段数组（已 trim、去空）。
 */
export function paragraphsOf(text: string): string[] {
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

export function scanAiFlavor(text: string, rules?: readonly AiScanRuleInput[]): AiScanResult {
  const paragraphs = paragraphsOf(text)
  const totalChars = text.length

  // 1. 模式统计（按语料稀有度加权；模式并集见 PATTERN_COVERAGE）
  const clicheHits: Array<{ word: string; count: number; weight: number }> = []
  let weightedTotal = 0
  for (const word of Object.keys(PATTERN_COVERAGE)) {
    const count = countOccurrences(text, word)
    if (count === 0) continue
    const weight = patternWeight(PATTERN_COVERAGE[word] ?? 0)
    clicheHits.push({ word, count, weight })
    weightedTotal += count * weight
  }
  clicheHits.sort((a, b) => b.count * b.weight - a.count * a.weight)

  // 1b. 作者生效规则的确定性命中
  //     把「让 LLM 逐条核对规则清单」换成本地算出来的事实：更确定，也更省 token。
  const ruleHits: AiScanRuleHit[] = []
  for (const rule of rules ?? []) {
    const matches: Array<{ pattern: string; count: number }> = []
    for (const pattern of rule.detectPatterns ?? []) {
      const count = countOccurrences(text, pattern)
      if (count === 0) continue
      // 常见的连接词/高频词不构成证据（理由见 SCORE_SPEC.ruleHitCoverageMax）。
      // 表里没有的模式按覆盖率 0 处理（未知 = 可能少见），照常上报。
      if ((PATTERN_COVERAGE[pattern] ?? 0) >= SCORE_SPEC.ruleHitCoverageMax) continue
      matches.push({ pattern, count })
    }
    if (matches.length > 0) ruleHits.push({ name: rule.name, severity: rule.severity, matches })
  }

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
  const dialogueChars = dialogueCharsOf(text)
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
  if (clicheDensity > 1.0) {
    const top = clicheHits.filter(h => h.weight > 0).slice(0, 5)
      .map(h => h.word + 'x' + h.count).join('、')
    issues.push('套话/模板句偏多（按语料稀有度加权 ' + clicheDensity.toFixed(2) + '/千字，p50 为 0.61）：' + top)
  }
  if (scoreParts.uniformParagraphs > 0) issues.push('段落长度过于整齐（CV ' + cv.toFixed(2) + ' < ' + SCORE_SPEC.cvTooUniform + '，已发布语料 p5 为 0.55）')
  if (maxConsecutive >= 3) issues.push('连续 ' + maxConsecutive + ' 段解释性叙事，缺少对话/动作')
  if (sentenceRepetitionRate > 0.5) issues.push('句式重复率 ' + (sentenceRepetitionRate * 100).toFixed(0) + '%，开头句式单一')
  if (longParagraphCount > 3) issues.push(longParagraphCount + ' 段超过 300 字，段落过长')
  if (scoreParts.lowDialogue > 0) issues.push('对话占比过低（' + (dialogueRatio * 100).toFixed(1) + '%），整章偏叙述')
  if (ruleHits.length > 0) {
    const brief = ruleHits.slice(0, 5)
      .map(h => h.name + '（' + h.matches.map(m => m.pattern + 'x' + m.count).join('、') + '）').join('；')
    issues.push('确定性规则命中 ' + ruleHits.length + ' 条：' + brief)
  }

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
    ruleHits,
    scoreParts,
    summary,
  }
}
