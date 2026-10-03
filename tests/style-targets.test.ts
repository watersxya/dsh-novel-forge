/**
 * 写法资产的**生成端**注入：数字风格目标（离线）。
 *
 * ## 这个测试在守什么
 *
 * 风格指纹有两个出口：审稿端的符合度比对（有 style-fingerprint 的单测覆盖），以及
 * **生成端的数字目标** —— 后者只在 renderStyleAssets 里接了一行，属于「接了线但没验」。
 * 这里把它锁住，顺带验证反向条件：**没有样本文本的写法资产不该被注入目标**，
 * 否则「0 字样本」会算出一堆零值区间，变成噪声。
 */
import { describe, it, expect } from 'vitest'
import { emptyProjectAssets, renderStyleAssets } from '../src/assets.ts'
import type { StyleAsset } from '../src/protocol.ts'

const sample = Array.from({ length: 30 }, () => '字'.repeat(20)).join('。') + '。'

const assetWith = (sourceText?: string): StyleAsset => ({
  name: '测试写法',
  proseRules: ['以短句为主'],
  dialogueRules: [],
  descriptionRules: [],
  boundaries: [],
  sourceText,
  createdAt: '2026-10-04T00:00:00.000Z',
})

describe('renderStyleAssets 的生成端风格目标', () => {
  it('带样本文本时注入数字区间', () => {
    const assets = emptyProjectAssets()
    assets.styleAssets = [assetWith(sample)]
    const block = renderStyleAssets(assets)
    expect(block).toContain('风格目标')
    expect(block).toContain('句均长')
    expect(block).toContain('对话占比')
    expect(block).toContain('以短句为主')
  })

  it('没有样本文本时只注入文字规则，不注入目标（否则是噪声）', () => {
    const assets = emptyProjectAssets()
    assets.styleAssets = [assetWith(undefined)]
    const block = renderStyleAssets(assets)
    expect(block).toContain('以短句为主')
    expect(block).not.toContain('风格目标')
  })

  it('样本文本过短时同样不注入目标（指标没有统计意义）', () => {
    const assets = emptyProjectAssets()
    assets.styleAssets = [assetWith('太短了。')]
    expect(renderStyleAssets(assets)).not.toContain('风格目标')
  })
})
