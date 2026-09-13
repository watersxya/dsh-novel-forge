/**
 * 路由级单测（离线、不调 LLM）：POST /revision/plan
 *
 * 这是面板与生产单共用的**唯一**修订指令入口，必须守住三件事：
 *  1. 各来源计数、排序、上限与截断数如实回传；
 *  2. 验证基准覆盖本轮下发的全部条目（多源基线）；
 *  3. 章节不存在时明确报错，不得静默返回空指令（否则会发起一次无意义重写）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, saveProject } from '../src/engine.ts'
import { makeRoutes } from '../src/routes.ts'
import type { ChapterPlan, NovelConfig, ProjectState, ReviewReport, RevisionPlanResponse } from '../src/protocol.ts'
import { NOVEL_API } from '../src/protocol.ts'

const REAL_HOME = homedir()

function readShelfAt(home: string): string {
  const file = join(home, '.dsh', 'dsh-novel-forge-bookshelf.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const realShelfBefore = readShelfAt(REAL_HOME)

let dir: string
let previousHome: string | undefined
let previousUserProfile: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-revplan-'))
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

function makeDeps(): Parameters<typeof makeRoutes>[0] {
  const config = {
    outputDir: dir,
    outlinePath: '',
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    reasoningEffort: 'off',
    analysisReasoning: 'low',
    chapterChars: 3500,
    maxTokens: 12000,
    reviewPassScore: 70,
    autoReview: true,
    autoAuthorReview: true,
    autoReviewAfterRevise: true,
    themeBackground: '',
    themeBackgroundBlur: 0,
    themeOpacity: 100,
    enableAdaptMode: true,
  } as unknown as NovelConfig
  return {
    ctx: {} as never,
    getConfig: () => config,
    patchConfig: async () => config,
    rawConfig: () => config,
  } as Parameters<typeof makeRoutes>[0]
}

function chapter(no: number, over: Partial<ChapterPlan> = {}): ChapterPlan {
  return {
    no,
    volume: 1,
    title: `第${no}章`,
    beats: '',
    targetChars: 3500,
    status: 'approved',
    ...over,
  } as ChapterPlan
}

/** 造一个有章节 + 审稿报告的项目文件。 */
function seedProject(review?: ReviewReport): ProjectState {
  const project = createProject('第一章 少年入城'.repeat(20))
  project.chapters = [chapter(1, { review }), chapter(2)]
  saveProject(dir, project)
  return project
}

async function callPlan(body: unknown, deps = makeDeps()): Promise<{ status: number; body: RevisionPlanResponse & { error?: string } }> {
  const route = makeRoutes(deps).find(r => r.path === NOVEL_API.revisionPlan)
  if (route === undefined) throw new Error('/revision/plan route is not registered')
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  const req = {
    method: 'POST',
    url: NOVEL_API.revisionPlan,
    headers: { host: '127.0.0.1:3812' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield payload },
  } as unknown as IncomingMessage
  let captured: { status: number; body: RevisionPlanResponse & { error?: string } } | undefined
  const res = {
    writeHead: (status: number) => { captured = { status, body: undefined as unknown as RevisionPlanResponse } },
    end: (text: string) => { if (captured !== undefined) captured.body = JSON.parse(text) },
  } as unknown as ServerResponse
  await route.handler(req, res)
  if (captured === undefined) throw new Error('/revision/plan did not respond')
  return captured
}

describe('POST /revision/plan', () => {
  it('非 loopback 请求被拒绝（403）', async () => {
    seedProject()
    const route = makeRoutes(makeDeps()).find(r => r.path === NOVEL_API.revisionPlan)!
    let status = 0
    const req = {
      method: 'POST',
      url: NOVEL_API.revisionPlan,
      headers: { host: '127.0.0.1:3812' },
      socket: { remoteAddress: '10.0.0.5' },
      async *[Symbol.asyncIterator]() { yield Buffer.from('{}') },
    } as unknown as IncomingMessage
    const res = { writeHead: (s: number) => { status = s }, end: () => {} } as unknown as ServerResponse
    await route.handler(req, res)
    expect(status).toBe(403)
  })

  it('GET 被拒绝（405）', async () => {
    seedProject()
    const route = makeRoutes(makeDeps()).find(r => r.path === NOVEL_API.revisionPlan)!
    let status = 0
    const req = {
      method: 'GET',
      url: NOVEL_API.revisionPlan,
      headers: { host: '127.0.0.1:3812' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage
    const res = { writeHead: (s: number) => { status = s }, end: () => {} } as unknown as ServerResponse
    await route.handler(req, res)
    expect(status).toBe(405)
  })

  it('章节不在计划中 → 404（不返回空指令）', async () => {
    seedProject()
    const { status, body } = await callPlan({ op: 'plan', chapterNo: 99 })
    expect(status).toBe(404)
    expect(body.error).toContain('不在计划中')
  })

  it('无项目 → 400', async () => {
    rmSync(join(dir, 'novel-project.json'), { force: true })
    const { status, body } = await callPlan({ op: 'plan', chapterNo: 1 })
    expect(status).toBe(400)
    expect(body.error).toContain('没有项目')
  })

  it('显式传入的审稿意见优先于落盘报告，并按严重度排序', async () => {
    seedProject({
      score: 60, passed: false, verdict: '需改', reviewedAt: '',
      issues: [{ severity: 'low', item: '落盘的旧意见', suggestion: '' }],
    })
    const { status, body } = await callPlan({
      op: 'plan',
      chapterNo: 1,
      includeTimeline: false,
      includeTension: false,
      reviewIssues: [
        { severity: 'low', item: '可以更好', suggestion: '' },
        { severity: 'high', item: '人设崩了', suggestion: '补动机' },
      ],
    })
    expect(status).toBe(200)
    expect(body.items.map(i => i.item)).toEqual(['人设崩了', '可以更好'])
    expect(body.counts.review).toBe(2)
    expect(body.instruction).toContain('【审稿·high】第1章 人设崩了')
    expect(body.instruction).not.toContain('落盘的旧意见')
  })

  it('验证基准覆盖全部下发条目（多源基线）', async () => {
    seedProject()
    const { body } = await callPlan({
      op: 'plan',
      chapterNo: 1,
      includeTimeline: false,
      includeTension: false,
      reviewIssues: [{ severity: 'high', item: '逻辑跳跃', suggestion: '补一段过渡' }],
    })
    expect(body.baseline.issues).toHaveLength(body.items.length)
    expect(body.baseline.passed).toBe(false)
    expect(body.baseline.issues[0]?.item).toContain('逻辑跳跃')
  })

  it('没有可修订条目时返回空指令与摘要（面板据此不开修订）', async () => {
    seedProject()
    const { status, body } = await callPlan({
      op: 'plan',
      chapterNo: 2,
      includeTimeline: false,
      includeTension: false,
    })
    expect(status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.summary).toBe('无可修订条目')
    expect(body.baseline.issues).toEqual([])
  })

  it('截断显式声明：条数超出上限时 omitted > 0', async () => {
    seedProject()
    const reviewIssues = Array.from({ length: 11 }, (_, i) => ({
      severity: 'high' as const,
      item: `问题 ${i + 1}`,
      suggestion: '',
    }))
    const { body } = await callPlan({ op: 'plan', chapterNo: 1, includeTimeline: false, includeTension: false, reviewIssues })
    expect(body.items).toHaveLength(8)
    expect(body.omitted).toBe(3)
    expect(body.summary).toContain('另截断 3 条')
  })

  it('不写用户真实 ~/.dsh 书架', async () => {
    seedProject()
    await callPlan({ op: 'plan', chapterNo: 1, includeTimeline: false, includeTension: false })
    expect(homedir()).toBe(dir)
    expect(readShelfAt(REAL_HOME)).toBe(realShelfBefore)
  })
})

// ---------------------------------------------------------------- 生产单归属
import { describeRunningBatch, resolveRunBookName } from '../src/run.ts'

describe('生产单的书目归属（芯片/面板/409 都要能说清是哪本书）', () => {
  it('resolveRunBookName 优先项目文件名，其次目录名', () => {
    const project = createProject('第一章 少年入城'.repeat(20))
    project.bookName = '剑归尘'
    saveProject(dir, project)
    expect(resolveRunBookName(dir)).toBe('剑归尘')

    // 目录里没有项目文件时退回目录名（旧 run-state.json 只有目录可用）
    const empty = mkdtempSync(join(tmpdir(), 'nf-nobook-'))
    try {
      expect(resolveRunBookName(empty)).toBe(basename(empty))
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('describeRunningBatch 带书名与当前章', () => {
    const state = { bookName: '剑归尘', currentNo: 7 } as unknown as Parameters<typeof describeRunningBatch>[0]
    expect(describeRunningBatch(state)).toBe('《剑归尘》第7章')
  })

  it('旧状态没有书名时明确写"未标注书目"，不静默变成空串', () => {
    const state = { currentNo: 3 } as unknown as Parameters<typeof describeRunningBatch>[0]
    expect(describeRunningBatch(state)).toBe('未标注书目第3章')
    const blank = { bookName: '   ', currentNo: 3 } as unknown as Parameters<typeof describeRunningBatch>[0]
    expect(describeRunningBatch(blank)).toBe('未标注书目第3章')
  })
})
