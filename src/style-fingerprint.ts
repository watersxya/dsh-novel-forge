/**
 * 写法资产的确定性风格指纹（离线）。
 *
 * ## 为什么需要它
 *
 * 写法资产（StyleAsset）目前只有一堆由 LLM 写出来的**文字规则** —— proseRules /
 * dialogueRules / descriptionRules。生成时整段注入，润色时要求「不得丢失」，
 * 但**全书没有任何一处检查成稿是否符合**：规则是定性描述，模型每次理解都可能不同，
 * 作者也无从判断「这一章到底偏离了多少」。
 *
 * 这里把风格拆成**可算的指标**：句均长、句长起伏、短句占比、对话占比、段落均长、
 * 意象密度。同一套指标两头用：
 *
 * 1. **生成端**当数字目标 —— 「句均长 18-24 字、短句占比 >= 35%」比「句式凝练」可执行得多；
 * 2. **审稿端**做符合度比对 —— 拿本章指标与写法样本的指标对照，给出偏差事实。
 *
 * ## 与 AI 味扫描的关系
 *
 * 两者共用段落与引号的**口径**（从 ai-scan.ts 引入，避免又出现两份拷贝），但目的相反：
 * ai-scan 抓「像 AI 写的」，这里算「像不像你绑定的写法」。同一份文本可以两者都算。
 *
 * ## 为什么从样本文本算，而不是再让 LLM 描述一遍
 *
 * StyleAsset.sourceText 已经把提取时用的样本持久化了（routes.ts 截前 3000 字）。
 * 从**同一份样本**算出的指标是确定的、可复算的、可解释的；再让模型「描述一下风格」，
 * 只会得到又一段无法校验的文字。
 */
import { dialogueCharsOf, paragraphsOf } from './ai-scan.ts'

/** 风格指标 key（同时是比对结果的稳定标识）。 */
export type StyleMetricKey =
  | 'avgSentenceLength'
  | 'sentenceLengthCv'
  | 'shortSentenceRatio'
  | 'dialogueRatio'
  | 'avgParagraphLength'
  | 'imageryPer1000'

/** 一份文本的风格指标。 */
export interface StyleFingerprint {
  /** 参与统计的字符数 */
  chars: number
  /** 句子数 */
  sentences: number
  /** 句均长（字符） */
  avgSentenceLength: number
  /** 句长变异系数（越小越平；节奏起伏的代理） */
  sentenceLengthCv: number
  /** 短句占比（句长 <= 12 字） */
  shortSentenceRatio: number
  /** 对话占比（0-1） */
  dialogueRatio: number
  /** 自然段均长（字符） */
  avgParagraphLength: number
  /** 意象密度：每千字的比喻/意象标记词次数 */
  imageryPer1000: number
}

/** 一个指标的比对结果。 */
export interface StyleDeviation {
  metric: StyleMetricKey
  /** 中文名，直接用于提示词 */
  label: string
  reference: number
  actual: number
  /** 相对偏差（actual - reference）/ reference */
  relative: number
  /** 偏高还是偏低 */
  direction: 'higher' | 'lower'
  /** 是否超出该指标的容忍度 */
  significant: boolean
}

/**
 * 各指标的容忍度 —— 取自**真实分布**的 p90，即每项指标约 10% 的章会被判偏离。
 *
 * 标定方式：对 6 本书各自取「第 1 章前 3000 字」当样本，算同书其余各章相对样本的
 * 相对偏差，取 p90。**手工拍的容忍度在两个方向上都错了**：
 *
 * - 对话占比：实测偏差 p50 就有 0.539、p90 达 1.25。原先定 0.50 —— 几乎每章都命中。
 * - 句长起伏：实测 p90 只有 0.159。原先定 0.35 —— 几乎不触发。
 *
 * 换语料或换题材后应重新标定（脚本见 CHANGELOG 2.1.3）。
 */
const TOLERANCE: Readonly<Record<StyleMetricKey, number>> = {
  avgSentenceLength: 0.42,
  sentenceLengthCv: 0.16,
  shortSentenceRatio: 0.66,
  dialogueRatio: 1.25,
  avgParagraphLength: 0.58,
  imageryPer1000: 1.39,
}

/**
 * 只用绝对阈值的指标（阈值单位同该指标本身）。
 *
 * 意象密度必须走这条：实测同一本书内**多数章节根本没有意象标记词**，相对偏差恒为
 * -100%，完全退化；而绝对差 p90 = 1.39 次/千字是有区分度的。
 */
const ABSOLUTE_ONLY: ReadonlySet<StyleMetricKey> = new Set<StyleMetricKey>(['imageryPer1000'])

/** 指标中文名（提示词里直接用）。 */
const LABEL: Readonly<Record<StyleMetricKey, string>> = {
  avgSentenceLength: '句均长',
  sentenceLengthCv: '句长起伏',
  shortSentenceRatio: '短句占比',
  dialogueRatio: '对话占比',
  avgParagraphLength: '段落均长',
  imageryPer1000: '意象密度',
}

/** 意象/比喻标记词（描写密度的确定性代理，不做语义判断）。 */
const IMAGERY_MARKERS = ['仿佛', '好像', '如同', '犹如', '宛如', '好似', '似的']

/** 短句阈值（字符）。 */
const SHORT_SENTENCE_CHARS = 12

/** 低于此字符数时指标没有统计意义，一律返回零值而不是噪声。 */
const MIN_CHARS = 200

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

/** 四舍五入到 n 位小数。 */
function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

/** 空指纹（文本过短时返回，避免用噪声做风格判断）。 */
function emptyFingerprint(chars: number): StyleFingerprint {
  return {
    chars,
    sentences: 0,
    avgSentenceLength: 0,
    sentenceLengthCv: 0,
    shortSentenceRatio: 0,
    dialogueRatio: 0,
    avgParagraphLength: 0,
    imageryPer1000: 0,
  }
}

/**
 * 从文本抽取风格指纹。
 * @param text - 任意正文（样本文本或章节正文；调用方需先剥掉标题行）。
 * @returns 风格指标；文本短于 {@link MIN_CHARS} 时返回零值。
 */
export function extractStyleFingerprint(text: string): StyleFingerprint {
  const chars = text.length
  if (chars < MIN_CHARS) return emptyFingerprint(chars)

  const sentences = text.split(/[。！？!?…]/).map(s => s.trim()).filter(s => s.length > 0)
  const lens = sentences.map(s => s.length)
  const avg = lens.length > 0 ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  const variance = lens.length > 0
    ? lens.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lens.length
    : 0
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 0
  const shortRatio = lens.length > 0 ? lens.filter(l => l <= SHORT_SENTENCE_CHARS).length / lens.length : 0

  const paragraphs = paragraphsOf(text)
  const paraAvg = paragraphs.length > 0 ? paragraphs.reduce((a, p) => a + p.length, 0) / paragraphs.length : 0

  let imagery = 0
  for (const marker of IMAGERY_MARKERS) imagery += countOccurrences(text, marker)

  return {
    chars,
    sentences: sentences.length,
    avgSentenceLength: round(avg, 1),
    sentenceLengthCv: round(cv, 2),
    shortSentenceRatio: round(shortRatio, 3),
    dialogueRatio: round(dialogueCharsOf(text) / chars, 3),
    avgParagraphLength: round(paraAvg, 1),
    imageryPer1000: round((imagery / chars) * 1000, 2),
  }
}

/**
 * 比对两份指纹。
 *
 * 参照值为 0 的指标直接跳过 —— 例如样本里本来就没有对话，此时「相对偏差」没有意义，
 * 硬算会得到无穷大，反而制造假警报。
 * @param reference - 参照指纹（写法样本）。
 * @param actual - 本章指纹。
 * @returns 每个可比指标一条结果（含是否显著）。
 */
export function compareStyleFingerprint(reference: StyleFingerprint, actual: StyleFingerprint): StyleDeviation[] {
  if (reference.chars < MIN_CHARS) return []
  // 本章文本过短时指纹被整体归零（见 extractStyleFingerprint 的 MIN_CHARS 分支），
  // 此时比对没有意义 —— 硬比会得到「句均长 -100%、段落均长 -100%」一整片假偏离。
  // 实测就是这么被抓出来的：验证书里三章不足 200 字，全被报成极端偏离。
  if (actual.sentences === 0) return []
  const out: StyleDeviation[] = []
  for (const metric of Object.keys(TOLERANCE) as StyleMetricKey[]) {
    const ref = reference[metric]
    if (ref <= 0) continue
    const act = actual[metric]
    const relative = (act - ref) / ref
    out.push({
      metric,
      label: LABEL[metric],
      reference: ref,
      actual: act,
      relative: round(relative, 3),
      direction: relative >= 0 ? 'higher' : 'lower',
      // 稀疏指标（意象密度）用绝对阈值：相对偏差在参照值接近 0 时退化。
      significant: ABSOLUTE_ONLY.has(metric)
        ? Math.abs(act - ref) > TOLERANCE[metric]
        : Math.abs(relative) > TOLERANCE[metric],
    })
  }
  return out
}

/** 按指标类型格式化数值（比率型用百分比）。 */
function formatMetric(metric: StyleMetricKey, value: number): string {
  if (metric === 'dialogueRatio' || metric === 'shortSentenceRatio') return (value * 100).toFixed(1) + '%'
  if (metric === 'sentenceLengthCv' || metric === 'imageryPer1000') return value.toFixed(2)
  return value.toFixed(1)
}

/**
 * 渲染**生成端**的风格目标（区间形式）。
 * @param reference - 写法样本的指纹。
 * @returns 可注入写作 prompt 的文本；样本过短时返回空串。
 */
export function renderFingerprintTargets(reference: StyleFingerprint): string {
  if (reference.chars < MIN_CHARS) return ''
  const items: string[] = []
  const add = (metric: StyleMetricKey, suffix: string): void => {
    const value = reference[metric]
    const tolerance = TOLERANCE[metric]
    if (ABSOLUTE_ONLY.has(metric)) {
      // 绝对阈值型：参照为 0 时给不出有意义的带宽，直接不出这一行。
      if (value <= 0) return
      items.push('- ' + LABEL[metric] + '：0–' + formatMetric(metric, value + tolerance) + suffix)
      return
    }
    // 下限夹到 0：参照值小的时候 value * (1 - tolerance) 会算出负数，
    // 而「对话占比 -3.3%–29.5%」这种目标写进提示词是荒谬的。
    const lo = Math.max(0, value * (1 - tolerance))
    const hi = value * (1 + tolerance)
    items.push('- ' + LABEL[metric] + '：' + formatMetric(metric, lo) + '–' + formatMetric(metric, hi) + suffix)
  }
  add('avgSentenceLength', ' 字')
  add('sentenceLengthCv', '（越大越参差）')
  add('shortSentenceRatio', '（<=' + SHORT_SENTENCE_CHARS + ' 字）')
  add('dialogueRatio', '')
  add('avgParagraphLength', ' 字')
  add('imageryPer1000', ' 次/千字')
  if (items.length === 0) return ''
  return [
    '==================== 风格目标（确定性指标，取自绑定的写法样本） ====================',
    '本章正文应落在这几个区间内。不是硬性红线，但明显越界会被审稿判为偏离绑定写法：',
    ...items,
  ].join('\n')
}

/**
 * 渲染**审稿端**的风格比对（事实锚点）。
 *
 * 没有显著偏差时会**明确写出「没有可量化的风格偏离」**——否则模型会为了凑维度而
 * 凭印象报一条「文风不符」，那正是这类审查最容易产出的假问题。
 * @param reference - 写法样本的指纹。
 * @param actual - 本章指纹。
 * @param deviations - {@link compareStyleFingerprint} 的结果。
 * @returns 可注入审稿 prompt 的文本；样本过短时返回空串。
 */
export function renderFingerprintComparison(
  reference: StyleFingerprint,
  actual: StyleFingerprint,
  deviations: StyleDeviation[],
): string {
  if (reference.chars < MIN_CHARS || actual.sentences === 0) return ''
  const lines = [
    '==================== 风格指纹比对（确定性事实） ====================',
    '参照物：绑定写法资产的样本文本（' + reference.chars + ' 字）；本章正文 ' + actual.chars + ' 字。',
  ]
  const significant = deviations.filter(d => d.significant)
  if (significant.length === 0) {
    lines.push('各项指标都在容忍度内：**本章没有可量化的风格偏离**。不要凭印象报「文风不符」。')
  } else {
    lines.push('以下指标超出容忍度（按此判定偏离，不要额外猜测）：')
    for (const d of significant) {
      lines.push('- ' + d.label + '：参照 ' + formatMetric(d.metric, d.reference)
        + ' → 本章 ' + formatMetric(d.metric, d.actual)
        + '（' + (d.relative >= 0 ? '+' : '') + (d.relative * 100).toFixed(0) + '%，'
        + (d.direction === 'higher' ? '偏高' : '偏低') + '）')
    }
  }
  return lines.join('\n')
}
