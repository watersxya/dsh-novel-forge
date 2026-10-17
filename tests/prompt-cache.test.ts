/**
 * 纯逻辑单测：提示词分层组装（固定 → 本书 → 本章）。
 *
 * 关键约束：顺序由模块强制、不由调用方书写顺序决定；空块不得在结果里留段——
 * 「无伏笔」时留个空分隔，会让前后两次调用的前缀在这里分叉，正是本模块要防的事。
 */
import { describe, it, expect } from 'vitest'
import { assemblePromptBlocks, type PromptBlock } from '../src/prompt-cache.ts'

describe('assemblePromptBlocks', () => {
  it('按「固定 → 本书 → 本章」排序，与书写顺序无关', () => {
    const blocks: PromptBlock[] = [
      { layer: 'chapter', text: '本章动态' },
      { layer: 'book', text: '本书资料' },
      { layer: 'fixed', text: '固定规则' },
    ]
    expect(assemblePromptBlocks(blocks)).toBe('固定规则\n本书资料\n本章动态')
  })

  it('同层内保持书写顺序（稳定排序）', () => {
    const blocks: PromptBlock[] = [
      { layer: 'book', text: '甲' },
      { layer: 'fixed', text: '规' },
      { layer: 'book', text: '乙' },
    ]
    expect(assemblePromptBlocks(blocks)).toBe('规\n甲\n乙')
  })

  it('丢弃空白块，不在结果里留空段', () => {
    const blocks: PromptBlock[] = [
      { layer: 'fixed', text: '规' },
      { layer: 'book', text: '   ' },
      { layer: 'chapter', text: '\n\t' },
    ]
    expect(assemblePromptBlocks(blocks)).toBe('规')
  })

  it('全部为空时返回空串', () => {
    expect(assemblePromptBlocks([{ layer: 'book', text: '' }])).toBe('')
  })

  it('分隔符可定制', () => {
    const blocks: PromptBlock[] = [
      { layer: 'fixed', text: 'A' },
      { layer: 'chapter', text: 'B' },
    ]
    expect(assemblePromptBlocks(blocks, '\n\n')).toBe('A\n\nB')
  })
})
