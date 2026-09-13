/**
 * 书级请求隔离单测：**每一个**书级请求都必须显式带 bookId。
 *
 * 背景（真机问题）：面板里 80 处书级请求都带 bookId，唯独助手的发送那一处没带，
 * 于是宿主退回「全局 active 书」。平时两者一致看不出问题，一旦切书与请求并发，
 * 就会出现「在 A 书界面聊天、回答写进 B 书」的串书。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NovelApi, setCurrentBook } from '../src/client/api.ts'

/** 抓取到的请求体。 */
let bodies: Array<Record<string, unknown>> = []

/** 装一个假的 fetch：记录请求体并返回一个空的 NDJSON 流。 */
function installFetchStub(): void {
  bodies = []
  vi.stubGlobal('fetch', async (_url: string, init?: { body?: unknown }) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"done"}\n'))
        controller.close()
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  })
}

beforeEach(() => {
  installFetchStub()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setCurrentBook(null)
})

describe('NovelApi.assistant', () => {
  it('发送对话时带上 bookId（与其它书级请求一致）', async () => {
    setCurrentBook('book-abc')
    await new NovelApi().assistant('继续', () => {})
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toEqual({ message: '继续', bookId: 'book-abc' })
  })

  it('未绑定书时不注入 bookId（保留宿主的 active 兜底）', async () => {
    setCurrentBook(null)
    await new NovelApi().assistant('继续', () => {})
    expect(bodies[0]).toEqual({ message: '继续' })
  })

  it('切书后按新书发送（不会沿用旧书的绑定）', async () => {
    setCurrentBook('book-a')
    await new NovelApi().assistant('第一条', () => {})
    setCurrentBook('book-b')
    await new NovelApi().assistant('第二条', () => {})
    expect(bodies.map(b => b.bookId)).toEqual(['book-a', 'book-b'])
  })
})

describe('NovelApi.assistantHistory', () => {
  it('读取历史也按当前书路由', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    setCurrentBook('book-xyz')
    await new NovelApi().assistantHistory()
    expect(urls[0]).toContain('bookId=book-xyz')
  })
})
