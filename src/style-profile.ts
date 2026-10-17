/**
 * 风格目标卡：把「这本书的写法」蒸馏成一份**作者显式确认**的确定性指标卡，
 * 作为生成端的风格锚点。
 *
 * ## 为什么生成端要一张卡，而审稿端实时算
 *
 * 审稿端的尺子是「本书已过审章节的中位数」（styleBaseline，engine.ts）——自适应：
 * 书写到哪，尺子量到哪。生成端如果也用同一把尺子，会出现**棘轮效应**：某一章
 * 对话占比偏高 → 进了中位数 → 下一章的目标跟着抬高 → 越写越偏且「生成符合目标、
 * 审稿也符合尺子」互相认证，没有任何一方报警。
 *
 * 所以两边刻意分开：
 *   * 审稿 = 自适应尺子（实时算，不落盘）；
 *   * 生成 = 外部锚点（本卡；只在作者点「蒸馏」时更新，是**决定**不是派生）。
 *
 * ## 卡的来源
 *
 * 1. `archived` —— 本书已过审章节等距抽样（≤12 章）的中位数：把「我现在实际
 *    写出来的样子」固化成目标，适合写了一定时量后收紧；
 * 2. `sample` —— 作者粘贴的参考样文本：开书阶段就想定调；
 * 3. 无卡 —— 回落绑定写法资产的样本文本（旧行为，保持兼容）。
 */

import type { StyleProfile, StyleProfileSource, StyleFingerprintData } from './protocol.ts'

/** 生成端实际生效的风格目标（判别联合：卡直给指纹，样本由调用方现算）。 */
export type EffectiveStyleTarget =
  | { kind: 'profile'; fingerprint: StyleFingerprintData; label: string }
  | { kind: 'sample'; sampleText: string; label: string }
  | { kind: 'none' }

/**
 * 解析生成端生效的风格目标。
 *
 * 优先级：显式卡 > 绑定资产的样本文本 > 无。样本文本取「第一个有 sourceText
 * 的资产」，指纹由调用方现算——本模块不依赖 style-fingerprint，保持纯数据。
 *
 * @param project 项目状态（只需 styleProfile 与 assets.styleAssets[].sourceText）。
 * @returns 生效目标。
 */
export function resolveStyleTarget(project: { styleProfile?: StyleProfile; assets?: { styleAssets?: Array<{ sourceText?: string }> } }): EffectiveStyleTarget {
  if (project.styleProfile !== undefined) {
    return { kind: 'profile', fingerprint: project.styleProfile.fingerprint, label: project.styleProfile.label }
  }
  for (const style of project.assets?.styleAssets ?? []) {
    const sample = style.sourceText
    if (sample !== undefined && sample !== '') {
      return { kind: 'sample', sampleText: sample, label: '绑定写法资产的样本文本' }
    }
  }
  return { kind: 'none' }
}

/** 用指纹数据构造一张目标卡。 */
export function makeStyleProfile(
  source: StyleProfileSource,
  label: string,
  fingerprint: StyleFingerprintData,
  sampleChapters?: number,
): StyleProfile {
  return { source, label, fingerprint, ...(sampleChapters !== undefined ? { sampleChapters } : {}), updatedAt: new Date().toISOString() }
}

/** 目标卡的中文来源名（面板用）。 */
export function styleProfileSourceLabel(source: StyleProfileSource): string {
  return source === 'archived' ? '本书已归档章节蒸馏' : '参考样本蒸馏'
}

/**
 * 校验一次 distilled-sample 请求的样本文本。
 * @returns 归一化后的文本。
 * @throws 文本过短时抛错（路由转 400）。
 */
export function normalizeSampleText(text: string | undefined): string {
  const value = (text ?? '').replace(/\r\n/g, '\n').trim()
  if (value.length < 200) throw new Error('样本文本过短（<200 字符），指标没有统计意义')
  return value.slice(0, 20000)
}
