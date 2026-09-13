/**
 * 生产单状态恢复（离线，不调 LLM）：/run/status 的"这本书是哪本"必须永远有答案。
 *
 * 背景：`status()` 在内存没有批次时会扫书架，取第一个存在 run-state.json 的目录 ——
 * 因此恢复出来的状态很容易属于**另一本书**。旧文件没有 bookName 字段，
 * 必须能兜底解析（项目名 → 目录名），否则芯片/面板/409 报错都会显示一个无法归属的批次。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, saveProject } from '../src/engine.ts'
import { ProductionRunner } from '../src/run.ts'
import type { NovelConfig } from '../src/protocol.ts'

/** 模块加载时（= HOME 被改写之前）的真实书架快照。 */
const REAL_HOME = homedir()
function readShelfAt(home: string): string {
  const file = join(home, 'dsh-novel-forge-bookshelf.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}
const realShelfBefore = readShelfAt(REAL_HOME)

let dir: string
let previousHome: string | undefined
let previousUserProfile: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-runrec-'))
  previousHome = process.env.HOME
  previousUserProfile = process.env.USERPROFILE
  process.env.HOME = dir
  process.env.USERPROFILE = dir
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
  rmSync(dir, { recursive: true, force: true })
})

/** 造一个只会被 status() 用到的运行器（不启动 loop）。 */
function runnerFor(outputDir: string): ProductionRunner {
  const config = {
    outputDir,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    autoReview: true,
    autoAuthorReview: true,
  } as unknown as NovelConfig
  return new ProductionRunner({ ctx: {} as never, getConfig: () => config })
}

/** 写一份 run-state.json（bookName 可选，模拟旧文件）。 */
function writeRunState(dirPath: string, bookName?: string): void {
  writeFileSync(join(dirPath, 'run-state.json'), JSON.stringify({
    runId: 'run-legacy',
    ...(bookName === undefined ? {} : { bookName }),
    startNo: 1,
    endNo: 3,
    status: 'running',
    currentNo: 2,
    stats: { generated: 1, revised: 0, exempted: 0, regenerated: 0, error: 0 },
    pendingManual: [],
    log: [],
    startedAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  }, null, 2), 'utf8')
}

describe('生产单状态恢复', () => {
  it('内存为空时从磁盘恢复，并把残留的 running 视为可续跑的 paused', () => {
    writeRunState(dir, '剑归尘')
    const state = runnerFor(dir).status()
    expect(state?.status).toBe('paused')
    expect(state?.bookName).toBe('剑归尘')
    expect(state?.currentNo).toBe(2)
  })

  it('旧文件没有 bookName 时用项目名兜底', () => {
    const project = createProject('第一章 少年入城'.repeat(20))
    project.bookName = '归墟玉主'
    saveProject(dir, project)
    writeRunState(dir)
    expect(runnerFor(dir).status()?.bookName).toBe('归墟玉主')
  })

  it('既无 bookName 也无项目文件时退回目录名（绝不返回空串）', () => {
    writeRunState(dir)
    const name = runnerFor(dir).status()?.bookName
    expect(name).toBe(basename(dir))
    expect(name).not.toBe('')
  })

  it('没有 run-state.json 时返回 null（芯片据此隐藏）', () => {
    expect(runnerFor(dir).status()).toBeNull()
  })

  it('恢复结果可 JSON 往返（/run/status 直接返回该对象，芯片据此显示书名）', () => {
    const project = createProject('第一章 少年入城'.repeat(20))
    project.bookName = '还债疯了'
    saveProject(dir, project)
    writeRunState(dir)
    const state = runnerFor(dir).status()
    const roundTrip = JSON.parse(JSON.stringify(state)) as { bookName?: string; status?: string }
    expect(roundTrip.bookName).toBe('还债疯了')
    expect(roundTrip.status).toBe('paused')
  })

  it('不触碰用户真实 ~/.dsh 书架', () => {
    writeRunState(dir, '剑归尘')
    runnerFor(dir).status()
    expect(homedir()).toBe(dir)
    expect(readShelfAt(REAL_HOME)).toBe(realShelfBefore)
  })
})
