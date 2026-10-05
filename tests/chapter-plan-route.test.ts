/**
 * 路由级单测（离线、不调 LLM）：POST /chapter/plan
 *
 * 这是作者补写「本章计划六项」的唯一入口（方案 §7 的空状态动作要有落点）。
 * 守住的口径：
 *  1. 只覆盖传入字段 —— 传 obligation 不能把 beats 清空；
 *  2. 上限与规划步骤一致，超限**必须**回写截断声明（静默裁 = 作者以为 6 条都生效）；
 *  3. 写完落盘，回传合并后的章节（面板以此并入 project.chapters，不再拉全量 status）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, saveProject } from '../src/engine.ts'
import { makeRoutes } from '../src/routes.ts'
import type { ChapterPlan, ChapterPlanPatchResponse, NovelConfig, ProjectState } from '../src/protocol.ts'
import { NOVEL_API } from '../src/protocol.ts'

let dir: string
let previousHome: string | undefined
let previousUserProfile: string | undefined
let previousDshHome: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-chplan-'))
  // 状态文件走 dshHome()：优先 DSH_HOME，测试进程会继承宿主的值，一并改写指向临时目录。
  previousHome = process.env.HOME
  previousUserProfile = process.env.USERPROFILE
  previousDshHome = process.env.DSH_HOME
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  delete process.env.DSH_HOME
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
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
    patchConfig: async () => ({ config }),
    rawConfig: () => config,
  } as Parameters<typeof makeRoutes>[0]
}

function chapter(no: number, over: Partial<ChapterPlan> = {}): ChapterPlan {
  return {
    no,
    volume: 1,
    title: `第${no}章`,
    beats: '本章目标：主角进城\n爽点：亮明身份',
    targetChars: 3500,
    status: 'pending',
    mustAdvance: ['确认城防布图'],
    mustPreserve: ['主角尚未暴露师门来历'],
    characterHardFacts: ['炼气三层'],
    endingHook: '有人在城门口等他',
    obligation: '让主角第一次见到秩序失效的城',
    ...over,
  } as ChapterPlan
}

/** 造一个两章的项目文件。 */
function seedProject(): ProjectState {
  const project = createProject('第一章 少年入城'.repeat(20))
  project.chapters = [chapter(1), chapter(2, { obligation: undefined, mustPreserve: [] })]
  saveProject(dir, project)
  return project
}

async function callPlan(body: unknown): Promise<{ status: number; body: ChapterPlanPatchResponse & { error?: string } }> {
  const route = makeRoutes(makeDeps()).find(r => r.path === NOVEL_API.chapterPlan)
  if (route === undefined) throw new Error('/chapter/plan route is not registered')
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  const req = {
    method: 'POST',
    url: NOVEL_API.chapterPlan,
    headers: { host: '127.0.0.1:3812' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield payload },
  } as unknown as IncomingMessage
  let captured: { status: number; body: ChapterPlanPatchResponse & { error?: string } } | undefined
  const res = {
    writeHead: (status: number) => { captured = { status, body: undefined as unknown as ChapterPlanPatchResponse } },
    end: (text: string) => { if (captured !== undefined) captured.body = JSON.parse(text) as ChapterPlanPatchResponse },
  } as unknown as ServerResponse
  await route.handler(req, res)
  if (captured === undefined) throw new Error('/chapter/plan did not respond')
  return captured
}

/** 读回落盘项目里的某一章（验证「写完即存」）。 */
function savedChapter(no: number): ChapterPlan {
  const raw = JSON.parse(readFileSync(join(dir, 'novel-project.json'), 'utf8')) as ProjectState
  const found = raw.chapters.find(c => c.no === no)
  if (found === undefined) throw new Error(`章节 ${no} 未落盘`)
  return found
}

describe('POST /chapter/plan', () => {
  it('非 loopback 请求被拒绝（403）', async () => {
    seedProject()
    const route = makeRoutes(makeDeps()).find(r => r.path === NOVEL_API.chapterPlan)!
    let status = 0
    const req = {
      method: 'POST',
      url: NOVEL_API.chapterPlan,
      headers: { host: '127.0.0.1:3812' },
      socket: { remoteAddress: '10.0.0.5' },
      async *[Symbol.asyncIterator]() { yield Buffer.from('{}') },
    } as unknown as IncomingMessage
    const res = { writeHead: (s: number) => { status = s }, end: () => {} } as unknown as ServerResponse
    await route.handler(req, res)
    expect(status).toBe(403)
  })

  it('章节不在计划中 → 404（不静默新建一章）', async () => {
    seedProject()
    const { status, body } = await callPlan({ chapterNo: 99, patch: { obligation: 'x' } })
    expect(status).toBe(404)
    expect(body.error).toContain('不在计划中')
  })

  it('patch 缺失 → 400', async () => {
    seedProject()
    const { status, body } = await callPlan({ chapterNo: 1 })
    expect(status).toBe(400)
    expect(body.error).toContain('patch')
  })

  it('只覆盖传入字段：改目标不动剧情推进与硬事实，且落盘', async () => {
    const before = seedProject()
    const { status, body } = await callPlan({ chapterNo: 1, patch: { obligation: '把城写成一座会吃人的机器' } })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.chapter.obligation).toBe('把城写成一座会吃人的机器')
    expect(body.chapter.beats).toBe(before.chapters[0]!.beats)
    expect(body.chapter.characterHardFacts).toEqual(['炼气三层'])
    expect(body.notices ?? []).toEqual([])
    expect(savedChapter(1).obligation).toBe('把城写成一座会吃人的机器')
    expect(savedChapter(1).endingHook).toBe('有人在城门口等他')
  })

  it('空串 / 空数组是明确的「清空」，不是「保持原值」', async () => {
    seedProject()
    const { body } = await callPlan({ chapterNo: 1, patch: { obligation: '', mustPreserve: [] } })
    expect(body.chapter.obligation).toBeUndefined()
    expect(body.chapter.mustPreserve).toEqual([])
    expect(savedChapter(1).obligation).toBeUndefined()
  })

  it('超限裁剪必须回写截断声明（条数与字数两条路径）', async () => {
    seedProject()
    const long = '目标'.repeat(120)  // 240 字 > 上限 200
    const { status, body } = await callPlan({
      chapterNo: 1,
      patch: {
        obligation: long,
        mustAdvance: ['一', '二', '三', '四', '五', '六'],
        characterHardFacts: ['   ', '', '  只有这条有效  '],
      },
    })
    expect(status).toBe(200)
    expect(body.chapter.obligation).toHaveLength(200)
    expect(body.chapter.mustAdvance).toEqual(['一', '二', '三', '四'])
    expect(body.chapter.characterHardFacts).toEqual(['只有这条有效'])
    expect(body.notices?.some(n => n.includes('本章目标'))).toBe(true)
    expect(body.notices?.some(n => n.includes('本章必达项'))).toBe(true)
  })

  it('空白条目被过滤：整段空白视为清空', async () => {
    seedProject()
    const { body } = await callPlan({ chapterNo: 1, patch: { mustPreserve: ['', '   ', '\n'] } })
    expect(body.chapter.mustPreserve).toEqual([])
  })

  it('无项目 → 400', async () => {
    if (!existsSync(join(dir, 'novel-project.json'))) saveProject(dir, createProject('占位大纲占位大纲'))
    rmSync(join(dir, 'novel-project.json'), { force: true })
    const { status, body } = await callPlan({ chapterNo: 1, patch: { obligation: 'x' } })
    expect(status).toBe(400)
    expect(body.error).toContain('没有项目')
  })
})
