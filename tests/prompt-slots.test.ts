/**
 * 纯逻辑单测：提示词槽位（白名单 / 截断显式化 / 注入优先级声明）。
 *
 * 关键约束：槽位只追加"作者偏好"，不得覆盖道藏、红线、合规与反 AI 规则——
 * 这里用断言把这条边界固定下来。
 */
import { describe, it, expect } from 'vitest'
import type { ProjectState } from '../src/protocol.ts'
import { PROMPT_SLOTS, normalizeSlotValue, readPromptSlots, renderPromptSlots } from '../src/prompt-slots.ts'

/** 造一个只带槽位的项目。 */
function project(slots?: ProjectState['promptSlots']): ProjectState {
  return {
    bookName: '测试书',
    outline: '',
    chapters: [],
    foreshadows: [],
    facts: [],
    ...(slots !== undefined ? { promptSlots: slots } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ProjectState
}

describe('PROMPT_SLOTS 白名单', () => {
  it('只开放四个安全槽位，且都有上限与说明', () => {
    expect(PROMPT_SLOTS.map(s => s.id)).toEqual(['styleExtra', 'antiAiExtra', 'dialogueExtra', 'endingHookExtra'])
    for (const spec of PROMPT_SLOTS) {
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.hint.length).toBeGreaterThan(0)
      expect(spec.maxChars).toBeGreaterThan(0)
    }
  })
})

describe('normalizeSlotValue', () => {
  it('规整换行并去首尾空白', () => {
    expect(normalizeSlotValue('styleExtra', '  a\r\nb  ')).toBe('a\nb')
  })

  it('空串表示清空（原样返回空串）', () => {
    expect(normalizeSlotValue('styleExtra', '   ')).toBe('')
  })

  it('不在白名单的槽位直接报错', () => {
    expect(() => normalizeSlotValue('systemPrompt', 'x')).toThrow('未知提示词槽位')
  })
})

describe('readPromptSlots', () => {
  it('跳过空槽位，保持声明顺序', () => {
    const slots = readPromptSlots(project({ antiAiExtra: '别用比喻', styleExtra: '多用短句' }))
    expect(slots.map(s => s.id)).toEqual(['styleExtra', 'antiAiExtra'])
  })

  it('超长内容按上限截断并标记（截断显式化）', () => {
    const spec = PROMPT_SLOTS[0]!
    const slots = readPromptSlots(project({ [spec.id]: 'x'.repeat(spec.maxChars + 50) }))
    expect(slots[0]?.text).toHaveLength(spec.maxChars)
    expect(slots[0]?.truncated).toBe(true)
    expect(slots[0]?.chars).toBe(spec.maxChars + 50)
  })

  it('没有槽位时返回空数组', () => {
    expect(readPromptSlots(project())).toEqual([])
    expect(readPromptSlots(project({}))).toEqual([])
  })
})

describe('renderPromptSlots', () => {
  it('无槽位时返回空串（不污染提示词）', () => {
    expect(renderPromptSlots(project())).toBe('')
  })

  it('渲染出槽位内容与优先级声明', () => {
    const text = renderPromptSlots(project({ styleExtra: '多用短句', antiAiExtra: '别用比喻' }))
    expect(text).toContain('作者偏好')
    expect(text).toContain('【文风补充】多用短句')
    expect(text).toContain('【反 AI 补充】别用比喻')
    // 边界声明必须在（槽位不得覆盖规则类内容）
    expect(text).toContain('与道藏、写作红线、内容合规红线冲突时，一律以后者为准')
  })

  it('截断时在提示词里说明原长度', () => {
    const spec = PROMPT_SLOTS[1]!
    const text = renderPromptSlots(project({ [spec.id]: 'y'.repeat(spec.maxChars + 10) }))
    expect(text).toContain('已按')
    expect(text).toContain('截断')
  })
})
