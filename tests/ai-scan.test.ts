/**
 * 本地 AI 味扫描器的度量口径（离线）。
 *
 * ## 这个测试在守什么
 *
 * 扫描结果是**事实锚点**：它被塞进审稿提示词，并明确告诉模型「你只需复核判断，
 * 不必再逐字统计」。所以它报错比不报更糟 —— 模型会把错数据当事实去推理。
 *
 * 这里每条断言都对应一个**实测过的真实缺陷**，不是风格偏好：
 *
 * 1. **段落**：书稿正文用**单换行**分自然段（run.ts 写盘即如此），而旧实现按
 *    /\n{2,}/ 切 —— 1279 章无一例外只切出 2 段，于是段落方差、过长段、
 *    连续解说段三项指标全部失效，其中「连续解说段 >= 3」永不成立。
 * 2. **对话**：中文书稿主流用全角弯引号（语料 6 本里 5 本如此），旧实现的字符类
 *    只认 ASCII 双引号与角括号，使这 5 本的对话占比**恒为 0** 并每章误加 10 分。
 * 3. **量纲**：方差的量纲是「字符平方」，随段长平方缩放；判定必须用 CV。
 * 4. **基线**：「知道」覆盖 78.4% 的已发布章节、「难以言喻」覆盖 0.0%，
 *    旧实现把两者等同计分，导致正常章节基线虚高。
 */
import { describe, it, expect } from 'vitest'
import { scanAiFlavor } from '../src/ai-scan.ts'

const lines = (...parts: string[]): string => parts.join('\n')

describe('段落口径：按真实书稿的单换行切段', () => {
  it('核心回归：单换行的 40 段被切成 40 段（旧口径恒为 2）', () => {
    const body = Array.from({ length: 40 }, (_, i) => '这是第' + i + '个自然段的正文。')
    const r = scanAiFlavor('# 第1章 标题\n' + body.join('\n'))
    expect(r.paragraphCount).toBe(40)
  })

  it('标题行不计入自然段', () => {
    const r = scanAiFlavor(lines('# 第一章 起', '正文一。', '正文二。', '## 小节', '正文三。'))
    expect(r.paragraphCount).toBe(3)
  })

  it('摘要里带上自然段数，口径可自查', () => {
    expect(scanAiFlavor(lines('甲。', '乙。', '丙。')).summary).toContain('3 个自然段')
  })

  it('空行分段（旧形态）仍然兼容', () => {
    expect(scanAiFlavor('甲。\n\n乙。\n\n丙。').paragraphCount).toBe(3)
  })
})

describe('对话口径：全角弯引号必须被认出来', () => {
  it('全角弯引号算对话（语料 6 本里 5 本在用，旧口径漏掉）', () => {
    const r = scanAiFlavor('他说：\u201C你来了。\u201D她点头。')
    expect(r.dialogueRatio).toBeGreaterThan(0)
  })

  it('角括号同样算对话', () => {
    expect(scanAiFlavor('他说：\u300C你来了。\u300D').dialogueRatio).toBeGreaterThan(0)
  })

  it('ASCII 直引号同样算对话（不得回归）', () => {
    expect(scanAiFlavor('他说："你来了。"').dialogueRatio).toBeGreaterThan(0)
  })

  it('完全没有对话时占比为 0（不误报）', () => {
    expect(scanAiFlavor('山风穿过松林，雪落了一夜。').dialogueRatio).toBe(0)
  })
})

describe('套话权重：按语料稀有度，而不是「重度/轻度」两档', () => {
  it('覆盖 78.4% 章节的功能词权重为 0', () => {
    const hit = scanAiFlavor('他知道了。').clicheHits.find(h => h.word === '知道')
    expect(hit).toBeDefined()
    expect(hit?.weight).toBe(0)
  })

  it('覆盖 0.0% 的稀有词权重为 1', () => {
    const hit = scanAiFlavor('那种感觉难以言喻。').clicheHits.find(h => h.word === '难以言喻')
    expect(hit?.weight).toBe(1)
  })

  it('权重为 0 的功能词不会进问题摘要', () => {
    const r = scanAiFlavor('他知道，他明白，可是他没有说。')
    expect(r.summary).not.toContain('套话偏多')
  })
})

describe('长度归一：短章不再爆炸', () => {
  it('两段都短于分母下限时，同样 1 次套话给出同样的套话分', () => {
    const a = scanAiFlavor('不禁。' + '字'.repeat(200))
    const b = scanAiFlavor('不禁。' + '字'.repeat(900))
    expect(a.scoreParts.cliche).toBe(b.scoreParts.cliche)
  })

  it('短章与长章之间不再有 8 倍权重差（看套话分项，排除其它项干扰）', () => {
    const short = scanAiFlavor('不禁。' + '字'.repeat(444)).scoreParts.cliche
    const long = scanAiFlavor('不禁。' + '字'.repeat(3576)).scoreParts.cliche
    // 旧口径：444 字里 1 次套话 = 18 分，3576 字里同样 1 次 = 2.2 分，差 8 倍。
    // 新口径分母有 2000 下限，两者之比不超过 长/下限 = 1.8 倍。
    expect(long).toBeGreaterThan(0)
    expect(short / long).toBeLessThan(2.5)
  })

  it('分项之和等于总分（可自查「这章凭什么这么多分」）', () => {
    const src = ['难以言喻。'].concat(Array.from({ length: 30 }, () => '甲。')).join('\n')
    const r = scanAiFlavor(src)
    const sum = r.scoreParts.cliche + r.scoreParts.uniformParagraphs + r.scoreParts.expository
      + r.scoreParts.repetition + r.scoreParts.lowDialogue
    expect(Math.round(sum)).toBe(r.aiScore)
  })
})

describe('段落整齐度：用 CV，不用方差', () => {
  it('长度完全一致的段落会被判出（CV 恰为 0 正是要抓的情况）', () => {
    const uniform = Array.from({ length: 40 }, () => '一'.repeat(50)).join('\n')
    const r = scanAiFlavor(uniform)
    expect(r.paragraphLengthCv).toBeLessThan(0.45)
    expect(r.summary).toContain('过于整齐')
  })

  it('长度参差的段落不误报（真实语料 CV p5 = 0.55）', () => {
    const messy = [10, 120, 30, 400, 20, 250, 60, 180, 15, 300, 40, 90, 500, 25, 70, 220]
      .map(n => '一'.repeat(n)).join('\n')
    const r = scanAiFlavor(messy)
    expect(r.paragraphLengthCv).toBeGreaterThan(0.45)
    expect(r.summary).not.toContain('过于整齐')
  })

  it('段数太少时不做整齐度判定（CV 无统计意义）', () => {
    const r = scanAiFlavor(lines('一'.repeat(50), '一'.repeat(50)))
    expect(r.summary).not.toContain('过于整齐')
  })
})

describe('连续解释性叙事：在正确段落模型下才可能成立', () => {
  it('三段连续解说会被识别（旧口径段数上限为 2，永不成立）', () => {
    const r = scanAiFlavor(lines('原来他早就知道。', '因为天在下雨。', '所以他没有出门。'))
    expect(r.consecutiveExpositoryParagraphs).toBe(3)
    expect(r.summary).toContain('解释性叙事')
  })
})

describe('健壮性', () => {
  it('空文本不抛错', () => {
    const r = scanAiFlavor('')
    expect(r.aiScore).toBe(0)
    expect(r.paragraphCount).toBe(0)
    expect(r.dialogueRatio).toBe(0)
  })

  it('评分始终落在 0..100', () => {
    const heavy = Array.from({ length: 60 }, () => '难以言喻，不由自主，无法形容。').join('\n')
    const r = scanAiFlavor(heavy)
    expect(r.aiScore).toBeGreaterThanOrEqual(0)
    expect(r.aiScore).toBeLessThanOrEqual(100)
  })

  it('保留 paragraphLengthVariance 字段（量纲随段长平方缩放，判定请用 cv）', () => {
    const r = scanAiFlavor(lines('一'.repeat(10), '一'.repeat(200)))
    expect(typeof r.paragraphLengthVariance).toBe('number')
    expect(typeof r.paragraphLengthCv).toBe('number')
  })
})
