/**
 * 作者资产库/总数据（跨书）— 按作者维度聚合的可复用资产。
 * 与书架同惯例持久化到 ~/.dsh/dsh-novel-forge-author-assets.json。
 * 提供读取/持久化/新增或更新/删除，以及「导入默认」：把书架书的写作资产/角色 + 
 * 内置全局库（题材/反AI规则/风格模板/推进模式）批量沉淀成资产条目（默认库）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { AuthorAssetLibrary, AuthorStyleAsset, GenreNode, AntiAiRule, StyleTemplate, ProgressionMode } from './protocol.ts'
import { BUILTIN_ANTI_AI_RULES, BUILTIN_GENRE_LIBRARY, BUILTIN_PROGRESSION_MODES, BUILTIN_STYLE_TEMPLATES } from './assets.ts'
import { loadBookshelf } from './bookshelf.ts'
import { loadProject } from './engine.ts'

/** 作者资产库配置文件路径。 */
export function authorAssetsFile(): string {
  return join(homedir(), '.dsh', 'dsh-novel-forge-author-assets.json')
}

/** 默认空资产库。 */
function defaultLibrary(): AuthorAssetLibrary {
  return { version: 1, items: [] }
}

/** 读取作者资产库（不存在/损坏则返回空库，不抛错）。 */
export function loadAuthorAssets(): AuthorAssetLibrary {
  const file = authorAssetsFile()
  if (!existsSync(file)) return defaultLibrary()
  try {
    let raw = readFileSync(file, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    const parsed = JSON.parse(raw) as Partial<AuthorAssetLibrary>
    if (!Array.isArray(parsed.items)) return defaultLibrary()
    return { version: 1, items: parsed.items }
  } catch {
    return defaultLibrary()
  }
}

/** 持久化作者资产库。 */
export function saveAuthorAssets(library: AuthorAssetLibrary): void {
  const file = authorAssetsFile()
  mkdirSync(join(homedir(), '.dsh'), { recursive: true })
  writeFileSync(file, JSON.stringify(library, null, 2), 'utf8')
}

/** 新建一条资产（自动生成 id 与时间戳）。 */
export function createAuthorAsset(input: Omit<AuthorStyleAsset, 'id' | 'createdAt' | 'updatedAt'>): AuthorStyleAsset {
  const now = new Date().toISOString()
  const asset: AuthorStyleAsset = {
    ...input,
    id: 'aa-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex'),
    sourceBooks: input.sourceBooks ?? [],
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  }
  const library = loadAuthorAssets()
  library.items.push(asset)
  saveAuthorAssets(library)
  return asset
}

/** 按 id 更新一条资产；不存在则追加。 */
export function upsertAuthorAsset(input: AuthorStyleAsset): AuthorAssetLibrary {
  const library = loadAuthorAssets()
  const idx = library.items.findIndex(a => a.id === input.id)
  const now = new Date().toISOString()
  if (idx >= 0) {
    const prev = library.items[idx]
    if (prev !== undefined) {
      library.items[idx] = {
        ...prev,
        ...input,
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: now,
      }
    }
  } else {
    library.items.push({ ...input, createdAt: input.createdAt !== '' ? input.createdAt : now, updatedAt: now })
  }
  saveAuthorAssets(library)
  return library
}

/** 删除一条资产；返回更新后的资产库。 */
export function removeAuthorAsset(id: string): AuthorAssetLibrary {
  const library = loadAuthorAssets()
  library.items = library.items.filter(a => a.id !== id)
  saveAuthorAssets(library)
  return library
}

/**
 * 导入默认：把书架所有书的写作资产/角色 + 内置全局库批量沉淀到作者资产库。
 * 按 `kind:name` 去重（已存在则跳过），不覆盖用户已有条目。
 * @returns 更新后的资产库。
 */
export function importDefaultAuthorAssets(): AuthorAssetLibrary {
  const library = loadAuthorAssets()
  const seen = new Set(library.items.map(a => a.kind + ':' + a.name))
  const now = new Date().toISOString()
  const push = (kind: AuthorStyleAsset['kind'], name: string, summary: string, content: string, tags: string[], sourceBooks: string[], structured?: Record<string, unknown>): void => {
    const key = kind + ':' + name.trim()
    if (name.trim() === '' || seen.has(key)) return
    seen.add(key)
    library.items.push({
      id: 'aa-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex'),
      kind, name: name.trim(), summary: summary.trim(), content: content.trim(),
      sourceBooks, tags, structured, createdAt: now, updatedAt: now,
    });
  };

  // 1) 内置全局库
  for (const g of flattenGenres(BUILTIN_GENRE_LIBRARY)) {
    push('genre', g.name, g.description, g.description, ['内置', '题材'], [], { description: g.description, children: (g.children ?? []).map(c => c.name) });
  }
  for (const r of BUILTIN_ANTI_AI_RULES) {
    push('antiAi', r.name, r.avoid, '避免：' + r.avoid + '\n修正：' + r.fix, ['内置', '反AI'], [], { avoid: r.avoid, fix: r.fix, detectPatterns: r.detectPatterns });
  }
  for (const t of BUILTIN_STYLE_TEMPLATES) {
    push('style', t.name, t.description, 
      '分类：' + t.category + '\n适用：' + t.applicableGenres.join('、') + '\n叙述：' + t.proseRules.join('；') + '\n台词：' + t.dialogueRules.join('；') + '\n语言：' + t.languageRules.join('；') + '\n节奏：' + t.rhythmRules.join('；'),
      ['内置', '风格模板'], [], { category: t.category, applicableGenres: t.applicableGenres });
  }
  for (const p of BUILTIN_PROGRESSION_MODES) {
    push('progression', p.name, p.driver, '驱动：' + p.driver + '\n期待：' + p.readerExpectation + '\n兑现：' + p.payoffs.join('；') + '\n风险：' + p.risks.join('；'), ['内置', '推进'], [], { driver: p.driver, primary: p.primary });
  }

  // 2) 书架里的书：写作资产 + 角色模板
  const shelf = loadBookshelf()
  for (const book of shelf.books) {
    const project = loadProject(book.outputDir)
    if (project === undefined) continue
    const src = [project.bookName]
    const assets = project.assets
    if (assets !== undefined) {
      if (assets.genre !== undefined) push('genre', assets.genre.name, assets.genre.description, assets.genre.description, ['书', '题材'], src, { description: assets.genre.description });
      if (assets.primaryProgression !== undefined) push('progression', assets.primaryProgression.name, assets.primaryProgression.driver, '驱动：' + assets.primaryProgression.driver + '\n期待：' + assets.primaryProgression.readerExpectation, src, [], { driver: assets.primaryProgression.driver, primary: true });
      for (const p of assets.auxiliaryProgressions ?? []) push('progression', p.name, p.driver, '驱动：' + p.driver + '\n期待：' + p.readerExpectation, src, [], { driver: p.driver, primary: false });
      for (const r of assets.antiAiRules ?? []) push('antiAi', r.name, r.avoid, '避免：' + r.avoid + '\n修正：' + r.fix, src, [], { avoid: r.avoid, fix: r.fix, detectPatterns: r.detectPatterns });
      for (const s of assets.styleAssets ?? []) push('style', s.name, s.proseRules.join('；'), 
        '叙述：' + s.proseRules.join('；') + '\n台词：' + s.dialogueRules.join('；') + '\n描写：' + s.descriptionRules.join('；') + '\n边界：' + s.boundaries.join('；'), src, [], { sourceText: s.sourceText });
    }
    for (const role of project.roles ?? []) {
      const persona = ('身份：' + role.identity + '\n性格：' + role.traits.join('、') + '\n目标：' + role.goals + '\n关系：' + role.relations.join('、') + '\n成长线：' + (role.arc.length > 0 ? role.arc.join(' > ') : '—') + '\n知情度：' + role.knowledge.join('、')).trim();
      push('roleTemplate', role.name, role.identity, persona, src, [], { roleLabel: role.roleLabel, traits: role.traits, relations: role.relations, arc: role.arc, knowledge: role.knowledge });
    }
  }

  saveAuthorAssets(library)
  return library
}

/** 拍平题材库（含子题材，父级名称并入 tag）。 */
function flattenGenres(nodes: GenreNode[], parentName?: string): GenreNode[] {
  const out: GenreNode[] = []
  for (const n of nodes) {
    out.push({ ...n, name: parentName !== undefined ? parentName + '/' + n.name : n.name });
    if (n.children.length > 0) out.push(...flattenGenres(n.children, parentName !== undefined ? parentName + '/' + n.name : n.name));
  }
  return out
}
