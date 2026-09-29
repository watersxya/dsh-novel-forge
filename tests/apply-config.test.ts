/**
 * `apply()` 的配置接线回归（离线，不调 LLM）。
 *
 * 锁住的是一类靠单测看不见的接线错误：把「当前配置」实现成引用自身的闭包
 * （`current = () => ({ ...current(), ...patch })`）时，赋值后函数体内读到的
 * 就是它自己，**第一次保存就无限递归**，路由层只会回一句
 * `Maximum call stack size exceeded`。所以这里不测桩，直接驱动真实的 `apply()`，
 * 并且**连打两次保存**。
 *
 * 说明一下这条测试的边界：修复后 `current` 是 `const` 绑定的状态对象，「把
 * 状态实现成递归闭包」这种写法已经**过不了类型检查**，因此无法在测试里还原成
 * 一个必然失败的版本。它守的是行为（连续保存不爆栈、字段合并正确、段 id 用
 * entry id），而不是那种已经无法表达的错误写法。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, Config } from '../src/index.ts'
import type { NovelConfig } from '../src/protocol.ts'
import { NOVEL_API } from '../src/protocol.ts'

let dir: string
const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, DSH_HOME: process.env.DSH_HOME }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-apply-'))
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  delete process.env.DSH_HOME
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

/** Capture the routes a real apply() registers, plus what it wrote to settings. */
function makeContext(): {
  ctx: never
  routes: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void }>
  writes: Array<{ ns: string; patch: Record<string, unknown> }>
  warns: string[]
} {
  const routes: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void }> = []
  const writes: Array<{ ns: string; patch: Record<string, unknown> }> = []
  const warns: string[] = []
  const ctx = {
    // No describe() → the plugin trusts the entry id it was mounted under.
    get: (name: string) => name === 'settings'
      ? { update: async (ns: string, patch: Record<string, unknown>) => { writes.push({ ns, patch }) } }
      : undefined,
    logger: () => ({ warn: (...args: unknown[]) => { warns.push(args.map(String).join(' ')) } }),
    systemPrompt: { section: () => () => {} },
    effect: (fn: () => unknown) => { const dispose = fn(); void dispose; return () => {} },
    webServer: { register: (route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void }) => { routes.push(route); return () => {} } },
    // The Loader-assigned entry id this instance is addressed by.
    fiber: { entry: { options: { id: 'k3f9a1bc' } } },
  }
  return { ctx: ctx as never, routes, writes, warns }
}

async function callConfig(
  routes: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void }>,
  patch: Record<string, unknown>,
): Promise<{ status: number; body: { config?: NovelConfig; settingsWarning?: string; error?: string } }> {
  const route = routes.find(r => r.path === NOVEL_API.config)
  if (route === undefined) throw new Error('/config route was not registered by apply()')
  const payload = JSON.stringify(patch)
  const req = {
    method: 'POST',
    url: NOVEL_API.config,
    headers: { host: '127.0.0.1:3812' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(payload, 'utf8') },
  } as unknown as IncomingMessage
  let captured: { status: number; body: { config?: NovelConfig; settingsWarning?: string; error?: string } } | undefined
  const res = {
    writeHead: (status: number) => { captured = { status, body: {} } },
    end: (body: string) => { if (captured !== undefined) captured.body = JSON.parse(body) as typeof captured.body },
  } as unknown as ServerResponse
  await route.handler(req, res)
  if (captured === undefined) throw new Error('/config did not respond')
  return captured
}

describe('apply() 的配置接线', () => {
  it('连续两次保存都不爆栈，且两次都写入同一个段', async () => {
    const { ctx, routes, writes } = makeContext()
    apply(ctx, { reviewPassScore: 70 } as never)
    expect(routes.some(r => r.path === NOVEL_API.config)).toBe(true)

    const first = await callConfig(routes, { reviewPassScore: 71 })
    expect(first.status).toBe(200)

    // 自引用闭包在这里就已经爆栈了；修复后必须正常返回。
    const second = await callConfig(routes, { reviewPassScore: 72 })
    expect(second.status).toBe(200)
    expect(second.body.error).toBeUndefined()

    // 段 id 用的是 entry id，不是写死的常量。
    expect(writes).toEqual([
      { ns: 'k3f9a1bc', patch: { reviewPassScore: 71 } },
      { ns: 'k3f9a1bc', patch: { reviewPassScore: 72 } },
    ])
    // 保存后立即读回新值（同一 ctx 内生效）。
    expect(second.body.config?.reviewPassScore).toBe(72)
    expect(second.body.settingsWarning).toBeUndefined()
  })

  it('段不可寻址时仍改内存并回告警，而不是 400', async () => {
    const { ctx, routes } = makeContext()
    // 宿主没有 settings 服务：更新无处可去。
    ;(ctx as unknown as { get: (n: string) => unknown }).get = () => undefined
    apply(ctx, { reviewPassScore: 70 } as never)

    const result = await callConfig(routes, { reviewPassScore: 80 })
    expect(result.status).toBe(200)
    expect(result.body.config?.reviewPassScore).toBe(80)
    expect(result.body.settingsWarning).toContain('settings.update')
  })

  it('同一实例重复保存不会丢字段（合并语义）', async () => {
    const { ctx, routes } = makeContext()
    apply(ctx, { reviewPassScore: 70, chapterChars: 3500 } as never)
    await callConfig(routes, { reviewPassScore: 75 })
    const result = await callConfig(routes, { chapterChars: 4000 })
    expect(result.body.config?.reviewPassScore).toBe(75)
    expect(result.body.config?.chapterChars).toBe(4000)
  })
})

/**
 * 宿主只把打了 volatile 标记的字段纳入设置表单，其余字段被视为「挂载期配置」，
 * 写入时直接拒绝：`Plugin entry "…" has no volatile fields`。这条回归实测过：
 * 未标记时面板「保存设置」永远失败（且此前还先撞上 self-reference 爆栈）。
 */
describe('Config 的 volatile 标记', () => {
  it('每个字段都带 meta.volatile（宿主据此放行写入）', () => {
    const dict = (Config as unknown as { dict?: Record<string, { meta?: { volatile?: boolean } }> }).dict ?? {}
    const keys = Object.keys(dict)
    expect(keys.length).toBeGreaterThan(0)
    const missing = keys.filter(key => dict[key]?.meta?.volatile !== true)
    expect(missing).toEqual([])
  })

  it('整表（object 根）本身不是 volatile —— volatileForm 要按字段逐个收集', () => {
    const meta = (Config as unknown as { meta?: { volatile?: boolean } }).meta
    expect(meta?.volatile).not.toBe(true)
  })
})
