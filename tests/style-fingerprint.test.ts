/**
 * 写法资产的风格指纹（离线）。
 *
 * ## 这个测试在守什么
 *
 * 写法资产此前只有 LLM 写的**文字规则**，生成时注入、但从不校验成稿。加上确定性指纹后，
 * 它同时成了生成端的**数字目标**和审稿端的**符合度事实**。所以这里守两件事：
 *
 * 1. **指标是确定的**：同一文本两次结果一致；口径与 AI 味扫描共用（尤其对话引号，
 *    中文书稿主流是全角弯引号 —— 那边刚因为漏掉它错算了 5/6 本书）。
 * 2. **不可比的情况不许硬算**：样本里本来没有对话时，「对话占比相对偏差」是无穷大，
 *    硬报会制造假警报；样本过短时指标根本没有统计意义。
 *
 * 还有一条产品性质的断言：**没有显著偏差时必须明确写出来**。审稿模型收到一个
 * 「风格比对」区块却什么都没说时，最常见的失败模式是为了凑维度凭印象报一条
 * 「文风不符」——那正是这类审查最容易产出的假问题。
 */
import { describe, it, expect } from 'vitest'
import {
  compareStyleFingerprint,
  extractStyleFingerprint,
  mergeFingerprints,
  renderFingerprintComparison,
  renderFingerprintTargets,
} from '../src/style-fingerprint.ts'

/** 造 count 个长度为 len 的句子。 */
const makeText = (count: number, len: number): string =>
  Array.from({ length: count }, () => '字'.repeat(len)).join('。') + '。'

describe('抽取：指标必须确定且口径一致', () => {
  it('句均长与短句占比按实际算出', () => {
    const fp = extractStyleFingerprint(makeText(30, 10))
    expect(fp.sentences).toBe(30)
    expect(fp.avgSentenceLength).toBe(10)
    expect(fp.shortSentenceRatio).toBe(1)
  })

  it('句长参差时起伏（CV）上升', () => {
    const flat = extractStyleFingerprint(makeText(30, 20))
    const mixedSource = Array.from({ length: 30 }, (_, i) => '字'.repeat(i < 15 ? 5 : 60)).join('。') + '。'
    const mixed = extractStyleFingerprint(mixedSource)
    expect(mixed.sentenceLengthCv).toBeGreaterThan(flat.sentenceLengthCv)
    expect(mixed.shortSentenceRatio).toBeGreaterThan(0)
    expect(mixed.shortSentenceRatio).toBeLessThan(1)
  })

  it('全角弯引号算对话（与 AI 味扫描同一口径，那边刚因此错过 5/6 本书）', () => {
    // 注意文本要超过 MIN_CHARS（200），否则拿到的是零值指纹而不是指标。
    const fp = extractStyleFingerprint(makeText(30, 10) + '他说：\u201C你来了。\u201D')
    expect(fp.dialogueRatio).toBeGreaterThan(0)
  })

  it('同一文本两次结果一致（确定性，无隐藏状态）', () => {
    const t = makeText(25, 15)
    expect(extractStyleFingerprint(t)).toEqual(extractStyleFingerprint(t))
  })

  it('文本过短时返回零值，而不是用噪声充当指标', () => {
    const fp = extractStyleFingerprint('太短了。')
    expect(fp.chars).toBeLessThan(200)
    expect(fp.sentences).toBe(0)
    expect(fp.avgSentenceLength).toBe(0)
    expect(fp.dialogueRatio).toBe(0)
  })

  it('意象标记词计入密度', () => {
    const withSimile = extractStyleFingerprint(makeText(20, 10) + '仿佛。')
    const without = extractStyleFingerprint(makeText(20, 10))
    expect(withSimile.imageryPer1000).toBeGreaterThan(without.imageryPer1000)
  })
})

describe('比对：方向、幅度与容忍度', () => {
  const ref = extractStyleFingerprint(makeText(30, 20))

  it('偏高时方向为 higher 且给出相对幅度', () => {
    const d = compareStyleFingerprint(ref, extractStyleFingerprint(makeText(30, 40)))
      .find(x => x.metric === 'avgSentenceLength')
    expect(d?.direction).toBe('higher')
    expect(d?.relative).toBeCloseTo(1, 1)
    expect(d?.significant).toBe(true)
  })

  it('偏低时方向为 lower', () => {
    const d = compareStyleFingerprint(ref, extractStyleFingerprint(makeText(30, 10)))
      .find(x => x.metric === 'avgSentenceLength')
    expect(d?.direction).toBe('lower')
    expect(d?.significant).toBe(true)
  })

  it('容忍度内不算显著（句均长容忍度 0.42，取自实测 p90）', () => {
    const d = compareStyleFingerprint(ref, extractStyleFingerprint(makeText(30, 24)))
      .find(x => x.metric === 'avgSentenceLength')
    expect(d?.relative).toBeCloseTo(0.2, 1)
    expect(d?.significant).toBe(false)
  })

  it('意象密度用绝对阈值：多数章节本就没有意象词，相对 -100% 不该报警', () => {
    // 参照 1.0 次/千字，本章 0 —— 绝对差 1.0 小于阈值 1.39，不显著。
    const withOne = extractStyleFingerprint(makeText(40, 24) + '仿佛')
    const none = extractStyleFingerprint(makeText(40, 24))
    const d = compareStyleFingerprint(withOne, none).find(x => x.metric === 'imageryPer1000')
    expect(d?.relative).toBe(-1)
    expect(d?.significant).toBe(false)
  })

  it('参照值为 0 的指标直接跳过（样本没对话时相对偏差是无穷大）', () => {
    expect(ref.dialogueRatio).toBe(0)
    const actual = extractStyleFingerprint(makeText(30, 20) + '\u201C有对话。\u201D')
    const ds = compareStyleFingerprint(ref, actual)
    expect(ds.find(x => x.metric === 'dialogueRatio')).toBeUndefined()
  })

  it('参照样本过短时不做任何比对', () => {
    expect(compareStyleFingerprint(extractStyleFingerprint('短。'), ref)).toEqual([])
  })
})

describe('渲染：给生成端的目标与给审稿端的事实', () => {
  const ref = extractStyleFingerprint(makeText(30, 20))

  it('目标区间以参照值为中心（句均长容忍度 0.42，锁定标定值）', () => {
    const text = renderFingerprintTargets(ref)
    expect(text).toContain('句均长')
    expect(text).toContain('11.6–28.4')
  })

  it('样本过短时目标为空串（不注入噪声）', () => {
    expect(renderFingerprintTargets(extractStyleFingerprint('短。'))).toBe('')
  })

  it('没有显著偏差时**明确写出**没有可量化的偏离', () => {
    const actual = extractStyleFingerprint(makeText(30, 20))
    const text = renderFingerprintComparison(ref, actual, compareStyleFingerprint(ref, actual))
    expect(text).toContain('没有可量化的风格偏离')
    expect(text).not.toContain('超出容忍度')
  })

  it('有偏差时列出指标、参照值、本章值与方向', () => {
    const actual = extractStyleFingerprint(makeText(30, 40))
    const text = renderFingerprintComparison(ref, actual, compareStyleFingerprint(ref, actual))
    expect(text).toContain('句均长')
    expect(text).toContain('偏高')
    expect(text).toContain('+100%')
  })

  it('参照样本过短时比对为空串', () => {
    const actual = extractStyleFingerprint(makeText(30, 20))
    expect(renderFingerprintComparison(extractStyleFingerprint('短。'), actual, [])).toBe('')
  })
})

describe('过短文本：宁可不说，也不要给假偏离', () => {
  const ref = extractStyleFingerprint(makeText(30, 20))

  it('本章过短时不做比对（验证书里三章不足 200 字，曾被整片判成 -100% 极端偏离）', () => {
    const tooShort = extractStyleFingerprint('太短了。')
    expect(tooShort.sentences).toBe(0)
    expect(compareStyleFingerprint(ref, tooShort)).toEqual([])
    expect(renderFingerprintComparison(ref, tooShort, [])).toBe('')
  })
})

describe('目标区间：不能写出荒谬的边界', () => {
  it('比率型下限不会为负（参照 0.9% 时下限是 0.0%，不是 -3.3%）', () => {
    const ref = extractStyleFingerprint(makeText(30, 20) + '\u201C你来了。\u201D')
    const line = renderFingerprintTargets(ref).split('\n').find(l => l.includes('对话占比'))
    expect(line).toContain('0.0%–')
  })

  it('绝对阈值型指标参照为 0 时不出这一行（否则会得到「0.00–0.00」）', () => {
    expect(renderFingerprintTargets(extractStyleFingerprint(makeText(30, 20)))).not.toContain('意象密度')
  })
})

describe('多章合并：用本书已过审章节的中位数当基线', () => {
  it('逐指标取中位数', () => {
    const merged = mergeFingerprints([
      extractStyleFingerprint(makeText(30, 10)),
      extractStyleFingerprint(makeText(30, 20)),
      extractStyleFingerprint(makeText(30, 30)),
    ])
    expect(merged.avgSentenceLength).toBe(20)
    expect(merged.sentences).toBe(90)
  })

  it('离群章不拉偏中位数（同样输入若取平均值会变成 68）', () => {
    const normal = [10, 20, 20, 20].map(n => extractStyleFingerprint(makeText(30, n)))
    const outlier = extractStyleFingerprint(makeText(30, 300))
    expect(mergeFingerprints([...normal, outlier]).avgSentenceLength).toBe(20)
  })

  it('过短的指纹被剔除，不参与合并', () => {
    const merged = mergeFingerprints([extractStyleFingerprint(makeText(30, 20)), extractStyleFingerprint('太短。')])
    expect(merged.sentences).toBe(30)
  })

  it('没有可用输入时返回零值指纹（不抛错）', () => {
    expect(mergeFingerprints([extractStyleFingerprint('短。')]).sentences).toBe(0)
  })

  it('参照说明可自定义（中位数基线 vs 单一样本）', () => {
    const ref = extractStyleFingerprint(makeText(30, 20))
    const actual = extractStyleFingerprint(makeText(30, 40))
    const text = renderFingerprintComparison(ref, actual, compareStyleFingerprint(ref, actual), '本书已过审 12 章的中位数')
    expect(text).toContain('本书已过审 12 章的中位数')
  })
})
