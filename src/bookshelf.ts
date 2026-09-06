/**
 * 书架（Bookshelf）— 多书管理：一本书记录一个独立输出目录。
 * 状态持久化到 ~/.dsh/dsh-novel-forge-bookshelf.json（跟随 dsh 配置惯例）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { BookEntry, BookshelfSnapshot } from './protocol.ts'
import { loadProject } from './engine.ts'

/** 书架配置文件路径。 */
export function bookshelfFile(): string {
  return join(homedir(), '.dsh', 'dsh-novel-forge-bookshelf.json')
}

interface BookshelfStore {
  books: BookEntry[]
  activeBookId: string | null
}

function defaultStore(): BookshelfStore {
  return { books: [], activeBookId: null }
}

/** 读取书架（无则返回空）。 */
export function loadBookshelf(): BookshelfStore {
  const file = bookshelfFile()
  if (!existsSync(file)) return defaultStore()
  try {
    let raw = readFileSync(file, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    const parsed = JSON.parse(raw) as BookshelfStore
    if (!Array.isArray(parsed.books)) return defaultStore()
    return { books: parsed.books, activeBookId: parsed.activeBookId ?? null }
  } catch {
    return defaultStore()
  }
}

/** 持久化书架。 */
function saveBookshelf(store: BookshelfStore): void {
  const file = bookshelfFile()
  mkdirSync(join(homedir(), '.dsh'), { recursive: true })
  writeFileSync(file, JSON.stringify(store, null, 2), 'utf8')
}

/** 当前激活的书。 */
export function activeBook(store: BookshelfStore): BookEntry | undefined {
  return store.books.find(b => b.id === store.activeBookId)
}

/** 书架快照（含每本书的进度摘要）。 */
export function bookshelfSnapshot(store: BookshelfStore): BookshelfSnapshot {
  return {
    books: store.books.map(book => {
      const project = loadProject(book.outputDir)
      const done = project === undefined ? 0 : project.chapters.filter(c => c.status === 'approved' || c.status === 'written' || c.status === 'rejected').length
      const hasCover = project?.coverPath !== undefined && project.coverPath !== '' && existsSync(join(book.outputDir, project.coverPath))
      return {
        ...book,
        done,
        total: project?.chapters.length ?? 0,
        hasProject: project !== undefined,
        hasCover,
        blurb: project?.blurb,
      }
    }),
    activeBookId: store.activeBookId,
  }
}

/** 新建一本书（自动成为当前书）。 */
export function createBook(bookName: string, outputDir: string): BookEntry {
  const store = loadBookshelf()
  const id = `book-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const now = new Date().toISOString()
  const book: BookEntry = { id, bookName, outputDir, createdAt: now, updatedAt: now }
  store.books.push(book)
  store.activeBookId = id
  saveBookshelf(store)
  return book
}

/** 更新某本书的书名（开书向导导入大纲后书名以大纲首行为准）。 */
export function renameBook(id: string, bookName: string): boolean {
  const store = loadBookshelf()
  const book = store.books.find(b => b.id === id)
  if (book === undefined) return false
  book.bookName = bookName
  book.updatedAt = new Date().toISOString()
  saveBookshelf(store)
  return true
}

/**
 * 播种：书架为空时，把指定输出目录下已有的项目自动登记为第一本书。
 * 兼容升级场景 —— 旧版插件直接在输出目录写项目，从未登记书架。
 * @param outputDir - 候选输出目录（通常为 settings 的默认输出目录）。
 * @returns 是否发生了播种。
 */
export function seedBookshelfFromOutputDir(outputDir: string): boolean {
  const store = loadBookshelf()
  if (store.books.length > 0) return false
  if (!existsSync(outputDir)) return false
  // 有项目文件，或至少有章节文件，才视为"已有的书"。
  const hasProject = existsSync(join(outputDir, 'novel-project.json'))
  const hasChapters = existsSync(outputDir)
  if (!hasProject && !hasChapters) return false
  const project = loadProject(outputDir)
  const bookName = project?.bookName ?? outputDir.split(/[\\/]/).pop() ?? '未命名小说'
  createBook(bookName, outputDir)
  return true
}

/** 导入已有项目目录到书架：校验 novel-project.json，已存在则直接激活。 */
export function importDir(outputDir: string): { book: BookEntry; existed: boolean } {
  const project = loadProject(outputDir)
  if (project === undefined) throw new Error(`目录中未找到有效的 novel-project.json：${outputDir}`)
  const store = loadBookshelf()
  const existed = store.books.find(b => b.outputDir === outputDir)
  if (existed !== undefined) {
    store.activeBookId = existed.id
    saveBookshelf(store)
    return { book: existed, existed: true }
  }
  const bookName = project.bookName !== '' ? project.bookName : (outputDir.split(/[\\/]/).pop() ?? '未命名小说')
  const book = createBook(bookName, outputDir)
  return { book, existed: false }
}

/** 激活一本书。 */
export function activateBook(id: string): BookEntry | undefined {
  const store = loadBookshelf()
  const book = store.books.find(b => b.id === id)
  if (book === undefined) return undefined
  store.activeBookId = id
  book.updatedAt = new Date().toISOString()
  saveBookshelf(store)
  return book
}

/** 移除一本书。 */
export function removeBook(id: string): boolean {
  const store = loadBookshelf()
  const idx = store.books.findIndex(b => b.id === id)
  if (idx === -1) return false
  store.books.splice(idx, 1)
  if (store.activeBookId === id) {
    store.activeBookId = store.books[0]?.id ?? null
  }
  saveBookshelf(store)
  return true
}

/** 当前书输出目录（无书架则 undefined，回退 settings）。 */
export function activeBookOutputDir(): string | undefined {
  const book = activeBook(loadBookshelf())
  return book?.outputDir
}

/** 默认输出目录推断：~/.dsh/novels/书名。 */
export function defaultOutputDirFor(bookName: string): string {
  const clean = bookName.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '未命名小说'
  return join(homedir(), '.dsh', 'novels', clean)
}
