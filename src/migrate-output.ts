/**
 * 输出目录迁移（Migrate Output Dir）— 把一本书/默认输出目录的内容搬到新位置。
 *
 * 安全纪律（数据零丢失排序）：
 *  1. copy 全部内容到新目录（源目录始终原样保留）；
 *  2. 调用方完成配置写入 / 书架重指向后，最后一步才删源目录；
 *  3. 中途任何失败，最坏情况只是新目录多一份副本，源数据零丢失。
 */

import { existsSync, mkdirSync, readdirSync, cpSync, rmSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** 目录内容清单（相对路径 + 总字节）。 */
export interface DirContents {
  files: string[]
  bytes: number
}

/** 规范化路径用于比较（统一分隔符，Windows 忽略大小写）。 */
export function normalizeDir(dir: string): string {
  const r = resolve(dir.trim())
  return process.platform === 'win32' ? r.toLowerCase() : r
}

/** 列出目录全部内容（递归；子目录以 `name/` 形式占位列出）。 */
export function listDirContents(dir: string): DirContents {
  const files: string[] = []
  let bytes = 0
  const walk = (rel: string): void => {
    const abs = rel === '' ? dir : join(dir, rel)
    for (const name of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? name.name : `${rel}/${name.name}`
      if (name.isDirectory()) {
        files.push(`${childRel}/`)
        walk(childRel)
      } else {
        files.push(childRel)
        try { bytes += statSync(join(dir, childRel)).size } catch { /* 竞态删除则跳过 */ }
      }
    }
  }
  if (existsSync(dir)) walk('')
  return { files, bytes }
}

/**
 * 把 from 全部内容复制到 to（源目录保留，删除由调用方在收尾执行）。
 * 目标必须不存在或为空目录（防覆盖无关数据）；禁止互相嵌套的目录对。
 * @returns 复制的顶层条目数。
 */
export function copyDirContents(from: string, to: string): number {
  if (!existsSync(from)) throw new Error(`源目录不存在：${from}`)
  const nf = normalizeDir(from)
  const nt = normalizeDir(to)
  if (nf === nt) throw new Error('新目录与当前目录相同')
  // 嵌套防护：copy 进入自身会无限递归 / 自我复制。
  if (nt.startsWith(nf + sep.toLowerCase()) || nf.startsWith(nt + sep.toLowerCase()) ||
      nt.startsWith(nf + '/') || nf.startsWith(nt + '/')) {
    throw new Error('新目录不能是当前目录的子目录（或反之）')
  }
  if (existsSync(to)) {
    const entries = readdirSync(to)
    if (entries.length > 0) throw new Error(`目标目录非空（${entries.length} 个条目），为防覆盖已中止：${to}`)
  } else {
    mkdirSync(to, { recursive: true })
  }
  const entries = readdirSync(from)
  if (entries.length === 0) return 0
  cpSync(from, to, { recursive: true, errorOnExist: true, force: false })
  return entries.length
}

/** 删除源目录（仅复制 + 配置/书架重指向全部成功后调用）。 */
export function removeDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}
