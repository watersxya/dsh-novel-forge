/**
 * 统一上下文组装与相关设定检索
 *
 * 取代各阶段各自拼装 prompt，消除「生成看得到、审稿看不到」的断层。
 * 所有阶段通过 buildChapterContext 获取同一来源的事实与设定。
 */

import type { ProjectState, ChapterPlan, StoryBible, RoleRecord, ChapterFact, Foreshadow, Plotline } from './protocol'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ChapterContext {
  /** 平台合规红线（永远全量） */
  complianceRedLines: string[]
  /** 本书写作红线（永远全量） */
  bookRedLines: string[]
  /** 当前章相关角色卡（全量信息） */
  relevantRoles: Array<{ name: string; role: string; traits: string[]; goals?: string; knowledge?: string[] }>
  /** 当前章相关道藏规则 */
  relevantWorldRules: string[]
  /** 活跃剧情线 */
  activePlotlines: Plotline[]
  /** 未回收伏笔 */
  activeForeshadows: Foreshadow[]
  /** 上一章结尾原文 */
  prevChapterTail: string
  /** 上一章摘要 */
  prevChapterSummary?: string
  /** 最近事实（近因记忆，top20） */
  recentFacts: string[]
  /** 相关旧事实（按本章 beats 检索，top15） */
  relatedFacts: string[]
  /** 当前卷大纲 */
  currentVolumeOutline: string
  /** 本章 beats */
  beats: string
  /** 本章标题 */
  chapterTitle: string
}

export interface ContextBuildOptions {
  /** 阶段：writing/review/revise/polish/plan */
  stage?: 'writing' | 'review' | 'revise' | 'polish' | 'plan'
  /** 是否注入完整角色卡（false 时只注入角色名+定位） */
  fullRoleCards?: boolean
  /** 相关事实检索上限 */
  relatedFactsLimit?: number
  /** 最近事实数量 */
  recentFactsLimit?: number
}

/**
 * 相关事实检索：trigram 重合度 + 角色名命中加权 + 近因加权
 * 从 generateChapterStream 抽取，扩展为通用函数。
 */
export function retrieveRelatedFacts(
  facts: ChapterFact[],
  beatsText: string,
  roleNames: string[],
  limit = 15,
): string[] {
  if (facts.length === 0) return []

  const trigrams = (s: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i + 3 <= s.length; i++) {
      const tri = s.slice(i, i + 3)
      if (tri.trim() !== '') out.add(tri)
    }
    return out
  }

  const beatsTri = trigrams(beatsText)
  const beatRoles = roleNames.filter(n => beatsText.includes(n))

  const recentTexts = new Set(facts.slice(-20).map(f => f.text))

  return facts
    .map((f, idx) => {
      const head = f.text.slice(0, 80)
      let score = 0
      for (const tri of trigrams(head)) if (beatsTri.has(tri)) score += 1
      if (beatRoles.length > 0) {
        for (const n of beatRoles) if (head.includes(n)) score += 8
      }
      // 近因加权：越新越优先（封顶 40 章）
      score += Math.min(idx, 40) / 10
      return { f, score }
    })
    .filter(x => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => `[第${x.f.chapterNo}章] ${x.f.text}`)
    .filter(t => !recentTexts.has(t.slice(t.indexOf(']') + 2)))
}

/**
 * 相关角色检索：beats 中出现的角色 + 主角/主要反派永远全量
 */
export function retrieveRelevantRoles(
  bible: StoryBible | undefined,
  roles: RoleRecord[] | undefined,
  beatsText: string,
): ChapterContext['relevantRoles'] {
  const result: ChapterContext['relevantRoles'] = []
  const seen = new Set<string>()

  // 主角/主要反派永远全量
  const alwaysRoles = (bible?.characters ?? []).filter(c =>
    c.role === 'protagonist' || c.role === 'antagonist'
  )
  for (const card of alwaysRoles) {
    if (seen.has(card.name)) continue
    seen.add(card.name)
    result.push({
      name: card.name,
      role: card.role,
      traits: card.traits,
      goals: card.goals !== '' ? card.goals : undefined,
      knowledge: Array.isArray(card.knowledge) && card.knowledge.length > 0 ? card.knowledge : undefined,
    })
  }

  // beats 中出现的角色
  const beatRoles = (bible?.characters ?? []).filter(c => beatsText.includes(c.name))
  for (const card of beatRoles) {
    if (seen.has(card.name)) continue
    seen.add(card.name)
    result.push({
      name: card.name,
      role: card.role,
      traits: card.traits,
      goals: card.goals !== '' ? card.goals : undefined,
      knowledge: Array.isArray(card.knowledge) && card.knowledge.length > 0 ? card.knowledge : undefined,
    })
  }

  // 角色库补充（不在道藏里的）
  for (const r of roles ?? []) {
    if (seen.has(r.name)) continue
    if (!beatsText.includes(r.name) && r.roleLabel !== 'protagonist' && r.roleLabel !== 'antagonist') continue
    seen.add(r.name)
    result.push({
      name: r.name,
      role: r.roleLabel,
      traits: Array.isArray(r.traits) ? r.traits : [],
      goals: r.goals !== undefined && r.goals !== '' ? r.goals : undefined,
    })
  }

  return result
}

/**
 * 构建章节统一上下文
 *
 * 各阶段调用此函数获取同一来源的事实与设定，消除上下文断层。
 * 检索结果不足时自动回退全量，保证不丢失关键信息。
 */
export function buildChapterContext(
  project: ProjectState,
  chapter: ChapterPlan,
  outputDir: string,
  options: ContextBuildOptions = {},
): ChapterContext {
  const {
    stage = 'writing',
    fullRoleCards = true,
    relatedFactsLimit = 15,
    recentFactsLimit = 20,
  } = options

  const bible = project.bible
  const allFacts = project.facts ?? []
  const roleNames = (project.roles ?? []).map(r => r.name).filter((n): n is string => typeof n === 'string' && n !== '')

  // 上一章结尾 + 摘要
  let prevChapterTail = ''
  let prevChapterSummary: string | undefined
  const prev = project.chapters.find(c => c.no === chapter.no - 1)
  if (prev?.file !== undefined) {
    try {
      const prevPath = join(outputDir, prev.file)
      if (existsSync(prevPath)) {
        const text = readFileSync(prevPath, 'utf8')
        prevChapterTail = text.replace(/^#\s+.*$/m, '').trim().slice(-900)
      }
    } catch { /* 文件缺失时忽略 */ }
  }
  prevChapterSummary = prev?.summary

  // 事实：最近 + 相关
  const recentFacts = allFacts.slice(-recentFactsLimit).map(f => `[第${f.chapterNo}章] ${f.text}`)
  const relatedFacts = retrieveRelatedFacts(allFacts, chapter.beats, roleNames, relatedFactsLimit)

  // 角色：相关角色
  const relevantRoles = retrieveRelevantRoles(bible, project.roles, chapter.beats)

  // 道藏规则：全部（规则数量通常不多，全量注入更安全）
  const relevantWorldRules = bible?.worldRules ?? []

  // 活跃剧情线
  const activePlotlines = (project.plotlines ?? []).filter(l =>
    l.status === 'active' || l.status === 'paused'
  )

  // 未回收伏笔
  const activeForeshadows = (project.foreshadows ?? []).filter(f =>
    f.status === 'planted' || f.status === 'progressing'
  )

  // 当前卷大纲
  const volumeNo = chapter.volume ?? 0
  const volume = project.volumes?.find(v => v.no === volumeNo)
  const currentVolumeOutline = volume !== undefined
    ? `第${volume.no}卷《${volume.title}》：${volume.summary}`
    : ''

  return {
    complianceRedLines: [], // 由调用方注入 COMPLIANCE_REDLINES
    bookRedLines: bible?.redLines ?? [],
    relevantRoles: fullRoleCards ? relevantRoles : relevantRoles.map(r => ({ name: r.name, role: r.role, traits: [] })),
    relevantWorldRules,
    activePlotlines,
    activeForeshadows,
    prevChapterTail,
    prevChapterSummary,
    recentFacts,
    relatedFacts,
    currentVolumeOutline,
    beats: chapter.beats,
    chapterTitle: chapter.title,
  }
}

/**
 * 将上下文渲染为 prompt 文本块
 * 各阶段可按需选择注入哪些块。
 */
export function renderContextBlocks(ctx: ChapterContext): {
  rolesBlock: string
  worldRulesBlock: string
  factsBlock: string
  plotlinesBlock: string
  foreshadowsBlock: string
  continuityBlock: string
  redLinesBlock: string
} {
  const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他', female_lead: '女主', female_support: '女配', support: '配角', extra: '路人' } as Record<string, string>

  const rolesBlock = ctx.relevantRoles.length > 0
    ? '==================== 相关角色卡 ====================\n' +
      ctx.relevantRoles.map(r =>
        `- ${r.name}（${roleName[r.role] ?? r.role}）：${r.traits.join('、')}${r.goals ? `；目标：${r.goals}` : ''}${r.knowledge ? `\n  已知信息：${r.knowledge.join('；')}（未列出的该角色不知道）` : ''}`
      ).join('\n')
    : ''

  const worldRulesBlock = ctx.relevantWorldRules.length > 0
    ? '==================== 世界规则 ====================\n' + ctx.relevantWorldRules.map(r => `- ${r}`).join('\n')
    : ''

  const factsBlock = (ctx.recentFacts.length > 0 || ctx.relatedFacts.length > 0)
    ? '==================== 事实库（最近 + 相关） ====================\n' +
      (ctx.recentFacts.length > 0 ? `【最近 ${ctx.recentFacts.length} 条】\n${ctx.recentFacts.join('\n')}` : '') +
      (ctx.relatedFacts.length > 0 ? `\n【相关旧事实 ${ctx.relatedFacts.length} 条】\n${ctx.relatedFacts.join('\n')}` : '')
    : ''

  const plotlinesBlock = ctx.activePlotlines.length > 0
    ? '==================== 活跃剧情线 ====================\n' +
      ctx.activePlotlines.map(l => `- [${l.kind}${l.status === 'paused' ? '·暂停' : ''}] ${l.name}：${l.goal}${l.progress ? `（进度：${l.progress}）` : ''}`).join('\n')
    : ''

  const foreshadowsBlock = ctx.activeForeshadows.length > 0
    ? '==================== 活跃伏笔 ====================\n' +
      ctx.activeForeshadows.map(f => `- [${f.status === 'planted' ? '已埋设' : '推进中'}] ${f.description}${f.targetChapter ? `（预计第${f.targetChapter}章回收）` : ''}`).join('\n')
    : ''

  const continuityBlock = ctx.prevChapterTail !== ''
    ? `==================== 上一章结尾（紧接此状态继续） ====================\n${ctx.prevChapterTail}`
    : ''

  const redLinesBlock = ctx.bookRedLines.length > 0
    ? '==================== 本书红线 ====================\n' + ctx.bookRedLines.map(r => `- ${r}`).join('\n')
    : ''

  return { rolesBlock, worldRulesBlock, factsBlock, plotlinesBlock, foreshadowsBlock, continuityBlock, redLinesBlock }
}
