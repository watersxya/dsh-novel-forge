/**
 * 全局资源库（跨书可复用的自定义题材/推进模式）。
 * 雷达「同步底座到全局资源库」写入此处；/assets 返回时与内置库合并展示。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { GenreNode, ProgressionMode } from './protocol.ts'

interface GlobalAssets {
  genres: GenreNode[]
  modes: ProgressionMode[]
}

const FILE = join(homedir(), '.dsh', 'novel-forge-global-assets.json')
let cache: GlobalAssets | null = null

function load(): GlobalAssets {
  if (cache !== null) return cache
  try {
    const raw = readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<GlobalAssets>
    cache = { genres: Array.isArray(parsed.genres) ? parsed.genres : [], modes: Array.isArray(parsed.modes) ? parsed.modes : [] }
  } catch {
    cache = { genres: [], modes: [] }
  }
  return cache
}

function persist(): void {
  if (cache === null) return
  mkdirSync(join(homedir(), '.dsh'), { recursive: true })
  writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8')
}

export function globalGenreLibrary(): GenreNode[] {
  return load().genres
}

export function globalProgressionLibrary(): ProgressionMode[] {
  return load().modes
}

/** 新增/已有则跳过；返回 true=新增。 */
export function addGlobalGenre(g: GenreNode): boolean {
  const lib = load()
  if (lib.genres.some(x => x.name === g.name)) return false
  lib.genres.push({ ...g, children: g.children ?? [] })
  persist()
  return true
}

export function addGlobalMode(m: ProgressionMode): boolean {
  const lib = load()
  if (lib.modes.some(x => x.name === m.name)) return false
  lib.modes.push({ ...m, payoffs: m.payoffs ?? [], risks: m.risks ?? [], primary: m.primary ?? false })
  persist()
  return true
}
