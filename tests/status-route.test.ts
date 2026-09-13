/**
 * 路由级单测（离线、不调 LLM）：/status 必须返回宿主算出的阶段契约与截断声明。
 *
 * 规则来源：阶段由宿主计算（面板/助手/外部自动化共用同一结论）；任何被裁掉的
 * 字段都要显式声明，消费方不得把「看到的」当成「全部」。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, saveProject } from '../src/engine.ts'
import { makeRoutes } from '../src/routes.ts'
import type { NovelConfig, StatusResponse } from '../src/protocol.ts'
import { NOVEL_API } from '../src/protocol.ts'

/** 模块加载（= HOME 被改写之前）时的真实 HOME 与书架文件内容快照。 */
const REAL_HOME = homedir()
const realShelfBefore = readShelfAt(REAL_HOME)

/** 读某个 HOME 下的书架文件原文（不存在则为空串）。 */
function readShelfAt(home: string): string {
  const file = join(home, '.dsh', 'dsh-novel-forge-bookshelf.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

let dir: string
let previousHome: string | undefined
let previousUserProfile: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-status-'))
  // 书架等状态文件落在 homedir() 下：把 HOME/USERPROFILE 指到临时目录，
  // 保证测试既不读也不写用户真实的 ~/.dsh（否则空书架会被播种成临时书）。
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

/** 造一个只够 /status 用的最小依赖。 */
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

/** 发一次 GET /status，返回解析后的响应体。 */
async function callStatus(deps: Parameters<typeof makeRoutes>[0], query: string): Promise<{ status: number; body: StatusResponse }> {
  const route = makeRoutes(deps).find(r => r.path === NOVEL_API.status)
  if (route === undefined) throw new Error('/status route is not registered')
  const req = {
    method: 'GET',
    url: `${NOVEL_API.status}${query}`,
    headers: { host: '127.0.0.1:3812' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage
  let captured: { status: number; body: StatusResponse } | undefined
  const res = {
    writeHead: (status: number) => { captured = { status, body: undefined as unknown as StatusResponse } },
    end: (payload: string) => {
      if (captured !== undefined) captured.body = JSON.parse(payload) as StatusResponse
    },
  } as unknown as ServerResponse
  await route.handler(req, res)
  if (captured === undefined) throw new Error('/status did not respond')
  return captured
}

describe('GET /status', () => {
  it('非 loopback 请求被拒绝（403）', async () => {
    const deps = makeDeps()
    const route = makeRoutes(deps).find(r => r.path === NOVEL_API.status)!
    const req = {
      method: 'GET',
      url: NOVEL_API.status,
      headers: { host: '127.0.0.1:3812' },
      socket: { remoteAddress: '10.0.0.5' },
    } as unknown as IncomingMessage
    let status = 0
    const res = { writeHead: (s: number) => { status = s }, end: () => {} } as unknown as ServerResponse
    await route.handler(req, res)
    expect(status).toBe(403)
  })

  it('返回宿主算出的阶段契约', async () => {
    // 有项目、有足够长大纲、无道藏 → 立设定
    saveProject(dir, createProject('第一章 少年入城'.repeat(20)))
    const { status, body } = await callStatus(makeDeps(), '')
    expect(status).toBe(200)
    expect(body.stage).toBeDefined()
    expect(body.stage?.id).toBe('bible')
    expect(body.stage?.label).toBe('立设定')
    expect(body.stage?.reason).toBeTruthy()
  })

  it('无项目时阶段为开书', async () => {
    const { body } = await callStatus(makeDeps(), '')
    expect(body.stage?.id).toBe('outline')
    expect(body.project).toBeUndefined()
  })

  it('slim=1 时声明被裁掉的字段', async () => {
    saveProject(dir, createProject('第一章 少年入城'.repeat(20)))
    const { body } = await callStatus(makeDeps(), '?slim=1')
    expect(body.truncations).toBeDefined()
    expect(body.truncations?.some(t => t.includes('slim=1'))).toBe(true)
  })

  it('编年录超过 80 条时声明省略条数', async () => {
    const project = createProject('第一章 少年入城'.repeat(20))
    project.facts = Array.from({ length: 120 }, (_, i) => ({ chapterNo: i + 1, text: `事实 ${i + 1}` }))
    saveProject(dir, project)
    const { body } = await callStatus(makeDeps(), '')
    expect(body.project?.facts?.length).toBe(80)
    expect(body.truncations?.some(t => t.includes('共 120 条') && t.includes('最近 80 条'))).toBe(true)
  })

  it('未截断时不产生 truncations（避免噪声）', async () => {
    saveProject(dir, createProject('第一章 少年入城'.repeat(20)))
    const { body } = await callStatus(makeDeps(), '')
    expect(body.truncations).toBeUndefined()
  })

  it('书架状态写在临时 HOME 下，不触碰用户真实 ~/.dsh', async () => {
    saveProject(dir, createProject('第一章 少年入城'.repeat(20)))
    await callStatus(makeDeps(), '')
    // homedir 已被重定向到临时目录：真实 ~/.dsh 的书架文件不可能被本次调用改动。
    expect(homedir()).toBe(dir)
    expect(readShelfAt(REAL_HOME)).toBe(realShelfBefore)
  })
})
