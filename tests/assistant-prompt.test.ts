/**
 * 提示词接线单测：动作可见性段必须随阶段变化（离线、不调 LLM）。
 *
 * 规则来源：允许的动作由宿主按阶段算出并直接告诉模型，模型不必靠试错
 * 去发现哪些动作会被守卫拒绝。
 */
import { describe, it, expect } from 'vitest'
import { renderActionVisibility, renderToolDocs } from '../src/assistant.ts'
import type { StageInfo } from '../src/protocol.ts'

/** 造一个阶段契约。 */
function stage(id: StageInfo['id'], allow: string[]): StageInfo {
  return { id, label: id, recommend: [], allow, reason: '测试用' }
}

describe('renderActionVisibility', () => {
  it('渲染三段可见性说明', () => {
    const text = renderActionVisibility(stage('write', ['chapter_generate', 'chapter_review']))
    expect(text).toContain('动作可见性')
    expect(text).toContain('本阶段可直接执行：chapter_generate、chapter_review')
    expect(text).toContain('本阶段外')
    expect(text).toContain('只读工具任何时候都可用')
  })

  it('阶段外的写操作被明确列出（而不是从提示词里静默消失）', () => {
    const text = renderActionVisibility(stage('write', ['chapter_generate']))
    expect(text).toContain('export_txt')
    expect(text).toContain('chapter_rewrite')
    expect(text).toContain('bible_set_rule')
  })

  it('等待阶段没有任何可直接执行的动作', () => {
    const text = renderActionVisibility(stage('wait', []))
    expect(text).toContain('本阶段可直接执行：无')
  })

  it('只读工具不受阶段影响', () => {
    const readonlyTools = ['book_overview', 'chapter_text', 'facts_query']
    for (const id of ['write', 'wait', 'export'] as const) {
      const text = renderActionVisibility(stage(id, []))
      for (const tool of readonlyTools) expect(text, `${id}/${tool}`).toContain(tool)
    }
  })
})

describe('renderToolDocs（真正的动作裁剪）', () => {
  const DOCS = [
    '- book_overview：读取全书上下文。',
    '- chapter_text：读取章节正文。',
    '- chapter_generate：重新生成该章。',
    '- chapter_review：对该章执行 AI 审稿。',
    '- export_txt：导出全本 TXT。',
    '- bible_set_rule：修改道藏的世界规则。',
  ]

  it('strict=false：作者点明了事情，说明书全量照给（作者有权指定任意动作）', () => {
    const out = renderToolDocs(DOCS, stage('write', ['chapter_generate']), false)
    expect(out).toEqual([...DOCS])
  })

  it('strict=true：阶段外的写操作说明书被真正移除，并说明本轮不可用', () => {
    const out = renderToolDocs(DOCS, stage('write', ['chapter_generate', 'chapter_review']), true)
    const text = out.join('\n')
    expect(text).toContain('chapter_generate')
    expect(text).toContain('chapter_review')
    expect(text).not.toContain('- export_txt：')
    expect(text).not.toContain('- bible_set_rule：')
    expect(text).toContain('本轮不可用：export_txt、bible_set_rule')
  })

  it('strict=true：只读工具永远不会被裁掉', () => {
    const out = renderToolDocs(DOCS, stage('wait', []), true).join('\n')
    expect(out).toContain('- book_overview：')
    expect(out).toContain('- chapter_text：')
    expect(out).not.toContain('- chapter_generate：')
  })

  it('strict=true 且全部写操作都在阶段外时，仍然把不可用清单说出来（而不是静默消失）', () => {
    const out = renderToolDocs(DOCS, stage('export', []), true).join('\n')
    expect(out).toContain('本轮不可用：')
    expect(out).toContain('export_txt')
  })
})
