/**
 * 单测：风格目标卡（生成端锚点）。
 *
 * 守住的口径：
 *  1. **优先级**：显式卡 > 资产样本文本 > 无——卡是作者的决定，样本只是参考；
 *  2. **两把尺子刻意分开**：审稿基线（styleBaseline）不读卡，蒸馏也不看审稿基线；
 *  3. **显式才变**：蒸馏只由 distillStyleProfile 触发（作者动作），没有隐式路径；
 *  4. 数据不足必须抛错（路由转 400），不返回半张卡。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, distillStyleProfile, saveProject, styleBaseline } from '../src/engine.ts'
import { makeStyleProfile, normalizeSampleText, resolveStyleTarget, styleProfileSourceLabel } from '../src/style-profile.ts'
import { renderStyleAssets } from '../src/assets.ts'
import { extractStyleFingerprint } from '../src/style-fingerprint.ts'
import type { ProjectState, StyleProfile } from '../src/protocol.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-style-profile-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 造一个带 N 章已过审正文的项目（章文件真落盘，供抽样读取）。 */
function projectWithApprovedChapters(n: number, outline = '大纲：主角下山'): ProjectState {
  const project = createProject(outline)
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  for (let i = 1; i <= n; i++) {
    const file = `chapters/${String(i).padStart(3, '0')}.md`
    // 交替两种句长风格，让中位数与单章都不同（防止「中位数恰好等于某一章」的巧合）。
    const body = i % 2 === 0
      ? '他站起身来，推门出去，看见院子里落满了雪。有人说，今冬来得格外早。他裹紧了外衣，走向街角那家还亮着灯的酒铺。'
      : '剑气纵横三万里，一刀斩落九天星。风停了。他收刀入鞘，转身离去，只留下满地的落叶和一个远去的背影。'
    writeFileSync(join(dir, file), body.repeat(6), 'utf8')
    project.chapters.push({
      no: i,
      volume: 1,
      title: `第${i}章`,
      beats: '',
      targetChars: 3500,
      status: 'approved',
      file,
      chars: body.length,
    })
  }
  saveProject(dir, project)
  return project
}

describe('resolveStyleTarget 优先级', () => {
  const base = { bookName: 'x', outline: '', chapters: [], foreshadows: [], facts: [], createdAt: '', updatedAt: '' } as unknown as ProjectState

  it('有卡时直给卡的指纹与标签', () => {
    const profile = makeStyleProfile('archived', '本书已过审 12 章的中位数', {
      chars: 3000, sentences: 100, avgSentenceLength: 20, sentenceLengthCv: 0.5,
      shortSentenceRatio: 0.4, dialogueRatio: 0.3, avgParagraphLength: 60, imageryPer1000: 1.5,
    }, 12)
    const target = resolveStyleTarget({ ...base, styleProfile: profile })
    expect(target).toEqual({ kind: 'profile', fingerprint: profile.fingerprint, label: '本书已过审 12 章的中位数' })
  })

  it('无卡时回落第一个有 sourceText 的资产样本', () => {
    const target = resolveStyleTarget({
      ...base,
      assets: { styleAssets: [{ sourceText: '' }, { sourceText: '样本正文'.repeat(80) }] } as ProjectState['assets'],
    })
    expect(target.kind).toBe('sample')
    if (target.kind === 'sample') {
      expect(target.sampleText.length).toBeGreaterThan(200)
      expect(target.label).toBe('绑定写法资产的样本文本')
    }
  })

  it('两者都没有时是 none', () => {
    expect(resolveStyleTarget({ ...base, assets: { styleAssets: [{ sourceText: '' }] } as ProjectState['assets'] })).toEqual({ kind: 'none' })
    expect(resolveStyleTarget(base)).toEqual({ kind: 'none' })
  })
})

describe('makeStyleProfile / normalizeSampleText', () => {
  it('卡带来源、标签、指纹、采样章数与时间戳', () => {
    const fp = extractStyleFingerprint('他站起身来。推门出去。看见院子里落满了雪。'.repeat(30))
    const profile = makeStyleProfile('archived', '本书已过审 3 章的中位数', fp, 3)
    expect(profile.source).toBe('archived')
    expect(profile.sampleChapters).toBe(3)
    expect(profile.updatedAt).not.toBe('')
    expect(styleProfileSourceLabel(profile.source)).toBe('本书已归档章节蒸馏')
    expect(styleProfileSourceLabel('sample')).toBe('参考样本蒸馏')
  })

  it('样本文本 <200 字抛错；超 2 万字截断', () => {
    expect(() => normalizeSampleText('太短了')).toThrow('样本文本过短')
    // CRLF 归一 + 去首尾空白（用足长文本绕过长度门）。
    const crlf = normalizeSampleText('  ' + '他站起身来。\r\n推门出去。'.repeat(30) + '  ')
    expect(crlf.startsWith('他站起身来')).toBe(true)
    expect(crlf).not.toContain('\r')
    const long = normalizeSampleText('x'.repeat(30000))
    expect(long).toHaveLength(20000)
  })
})

describe('distillStyleProfile', () => {
  it('archived：≥3 章过审才可蒸馏，产出中位数卡', () => {
    const project = projectWithApprovedChapters(4)
    const profile = distillStyleProfile(dir, project, 'archived')
    expect(profile.source).toBe('archived')
    expect(profile.sampleChapters).toBe(4)
    expect(profile.label).toContain('中位数')
    // 与审稿基线同源：同一批抽样算出的指纹必须一致。
    const baseline = styleBaseline(dir, project)
    expect(baseline).toBeDefined()
    expect(profile.fingerprint.avgSentenceLength).toBe(baseline!.fingerprint.avgSentenceLength)
  })

  it('archived：不足 3 章抛错（不返回半张卡）', () => {
    const project = projectWithApprovedChapters(2)
    expect(() => distillStyleProfile(dir, project, 'archived')).toThrow('已过审章节不足 3 章')
  })

  it('sample：按样文本蒸馏，写清字数来源', () => {
    const project = createProject('大纲')
    const profile = distillStyleProfile(dir, project, 'sample', '他站起身，推门出去，看见满院飞雪。有人说今冬来得格外早。'.repeat(20))
    expect(profile.source).toBe('sample')
    expect(profile.label).toContain('参考样本蒸馏')
    expect(profile.fingerprint.chars).toBeGreaterThan(200)
    expect(profile.sampleChapters).toBeUndefined()
  })

  it('sample：样文本过短抛错', () => {
    const project = createProject('大纲')
    expect(() => distillStyleProfile(dir, project, 'sample', '太短')).toThrow('样本文本过短')
  })
})

describe('renderStyleAssets 注入优先级', () => {
  const sample = '他站起身来，推门出去，看见院子里落满了雪。有人说，今冬来得格外早。'.repeat(40)
  const assets = {
    genre: undefined,
    primaryProgression: undefined,
    auxiliaryProgressions: [],
    antiAiRules: [],
    styleAssets: [{
      id: 's1', name: '测试写法', proseRules: ['多用短句'], dialogueRules: [], descriptionRules: [],
      boundaries: [], sourceText: sample, createdAt: '', updatedAt: '',
    }],
  } as unknown as ProjectState['assets']

  it('无卡时走样文本目标（旧行为不回归）', () => {
    const text = renderStyleAssets(assets)
    expect(text).toContain('风格目标')
    expect(text).toContain('取自绑定的写法样本')
  })

  it('有卡时卡的标签替换样本标签，且指标与卡一致', () => {
    const profile: StyleProfile = makeStyleProfile('archived', '本书已过审 9 章的中位数', extractStyleFingerprint(sample), 9)
    const text = renderStyleAssets(assets, profile)
    expect(text).toContain('取自本书已过审 9 章的中位数')
    expect(text).not.toContain('取自绑定的写法样本')
  })

  it('卡的文本过短时不出目标块，但文字规则仍在', () => {
    const profile = makeStyleProfile('sample', '参考样本蒸馏（10 字）', {
      chars: 10, sentences: 0, avgSentenceLength: 0, sentenceLengthCv: 0,
      shortSentenceRatio: 0, dialogueRatio: 0, avgParagraphLength: 0, imageryPer1000: 0,
    })
    const text = renderStyleAssets(assets, profile)
    expect(text).not.toContain('风格目标')
    expect(text).toContain('多用短句')
  })
})
