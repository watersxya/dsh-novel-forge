/**
 * 大纲 Markdown 解析（离线）。
 *
 * ## 为什么要这个测试
 *
 * 解析器是「永不抛错」的设计——这很危险：一个把所有内容都归为普通段落的解析器
 * 同样永不抛错，只是把大纲渲染成一堵墙，看不出错。所以必须用**真实产物**验证
 * 「该认出来的确实被认出来」，而不只是「不崩」。
 *
 * fixture 直接取自真实项目 `H:/novels/还债疯了/_outline.md` 的真实形态：
 * 顶格书名《…》独占一行、中文序号小标题「一、…」、超长无换行段落。
 * 那份大纲的 prompt 明确禁止输出换行符，所以段落会挤到 700+ 字——
 * 旧解析器把它们全塞进一个 `<p>`，整份文档在页面上没有层次。
 */
import { describe, it, expect } from 'vitest'
import { parseInline, parseMarkdown, stripInline } from '../src/client/panel/outline-markdown.ts'

/** 真实大纲的典型片段（逐字取自 _outline.md）。 */
const REAL_HEAD = `《还债疯了》

一、书名与题材定位

《还债疯了》：22 岁的林安之只想通关副本，顺手救了濒死木匠，就被迫在识海里给一群满级大佬当宿主、替他们还人情。标签：无限流副本＋随身老爷爷＋系统流。

二、金手指与核心机制

人情债与识海：救人即触发，债主神魂被金链锁入识海，靠向宿主报恩攒功德，满百分之百方能脱离。`

describe('parseInline 行内标记', () => {
  it('纯文本原样返回单个 text 片段', () => {
    expect(parseInline('普通一段话')).toEqual([{ kind: 'text', text: '普通一段话' }])
  })

  it('加粗 / 斜体 / 行内代码分别切分', () => {
    expect(parseInline('这是**重点**内容')).toEqual([
      { kind: 'text', text: '这是' },
      { kind: 'strong', text: '重点' },
      { kind: 'text', text: '内容' },
    ])
    expect(parseInline('这是*强调*内容')[1]).toEqual({ kind: 'em', text: '强调' })
    expect(parseInline('调用 `parse()` 函数')[1]).toEqual({ kind: 'code', text: 'parse()' })
  })

  it('混合多个标记时顺序正确', () => {
    const r = parseInline('**粗**与*斜*与`码`')
    expect(r.map(s => s.kind)).toEqual(['strong', 'text', 'em', 'text', 'code'])
    expect(r.filter(s => s.kind !== 'text').map(s => s.text)).toEqual(['粗', '斜', '码'])
  })

  it('未闭合的标记按普通文本处理（宁少强调，不可渲染残缺标签）', () => {
    expect(parseInline('这是**未闭合')).toEqual([{ kind: 'text', text: '这是**未闭合' }])
    expect(parseInline('这是*未闭合')).toEqual([{ kind: 'text', text: '这是*未闭合' }])
    expect(parseInline('这是`未闭合')).toEqual([{ kind: 'text', text: '这是`未闭合' }])
  })

  it('空输入不产生空数组（调用方无需特判）', () => {
    expect(parseInline('')).toEqual([{ kind: 'text', text: '' }])
  })

  it('行内代码内的星号不被当作强调', () => {
    const r = parseInline('`a ** b`')
    expect(r).toEqual([{ kind: 'code', text: 'a ** b' }])
  })
})

describe('stripInline', () => {
  it('去掉所有标记只留纯文本', () => {
    expect(stripInline('**粗**与*斜*与`码`')).toBe('粗与斜与码')
  })

  it('无标记时原样返回', () => {
    expect(stripInline('一、书名与题材定位')).toBe('一、书名与题材定位')
  })
})

describe('parseMarkdown · 真实大纲形态（核心回归）', () => {
  const { blocks, toc } = parseMarkdown(REAL_HEAD)

  it('顶格书名《还债疯了》被识别为 h1', () => {
    const h1 = blocks.find(b => b.type === 'heading' && b.level === 1)
    expect(h1).toBeDefined()
    expect(stripInline((h1 as { spans: Array<{ text: string }> }).spans.map(s => s.text).join(''))).toBe('《还债疯了》')
  })

  it('中文序号小标题「一、」「二、」被识别为 h2（旧解析器全塞进 p）', () => {
    const h2s = blocks.filter(b => b.type === 'heading' && b.level === 2)
    expect(h2s).toHaveLength(2)
    expect(stripInline((h2s[0] as { spans: Array<{ text: string }> }).spans.map(s => s.text).join(''))).toBe('书名与题材定位')
    expect(stripInline((h2s[1] as { spans: Array<{ text: string }> }).spans.map(s => s.text).join(''))).toBe('金手指与核心机制')
  })

  it('超长无换行段落仍完整保留为 para（不被截断、不丢内容）', () => {
    const paras = blocks.filter(b => b.type === 'para')
    const joined = paras.map(p => stripInline((p as { spans: Array<{ text: string }> }).spans.map(s => s.text).join(''))).join('')
    expect(joined).toContain('22 岁的林安之只想通关副本')
    expect(joined).toContain('满百分之百方能脱离')
  })

  it('目录收录 h1+h2，顺序与正文一致', () => {
    expect(toc.map(t => t.level)).toEqual([1, 2, 2])
    expect(toc.map(t => t.text)).toEqual(['《还债疯了》', '书名与题材定位', '金手指与核心机制'])
  })

  it('每个块都有可用于锚点的唯一 id', () => {
    const ids = blocks.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(i => i.startsWith('md-'))).toBe(true)
  })
})

describe('parseMarkdown · 中文序号误判防护', () => {
  it('含冒号的「一、xxx：yyy」不被当作标题（那是定义式条目）', () => {
    const { blocks } = parseMarkdown('一、机制说明：救人即触发，债主神魂被锁入识海。')
    expect(blocks.some(b => b.type === 'heading')).toBe(false)
    expect(blocks[0].type).toBe('para')
  })

  it('过长的中文序号句（>40字）不被当作标题', () => {
    const long = `一、这是一个非常长的句子，它包含了大量的内容${'填充'.repeat(30)}。`
    const { blocks } = parseMarkdown(long)
    expect(blocks.some(b => b.type === 'heading')).toBe(false)
  })

  it('正常短标题仍然被识别', () => {
    const { blocks } = parseMarkdown('三、预计分卷')
    expect(blocks[0].type).toBe('heading')
  })

  it('阿拉伯数字 + 顿号（1、）不是列表语法，按普通段落处理', () => {
    // 「1、」在中文语境里也可能是序号，但它与「1.」不同：后者是列表。
    // 这里保持保守——不识别为标题，也不误当列表，交给段落处理。
    const { blocks } = parseMarkdown('1、起始阶段')
    expect(blocks[0].type).toBe('para')
  })
})

describe('parseMarkdown · 列表', () => {
  it('无序列表项被识别为 list 而不是段落', () => {
    const { blocks } = parseMarkdown('- 第一项\n- 第二项\n- 第三项')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('list')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'list' }>
    expect(b.ordered).toBe(false)
    expect(b.items).toHaveLength(3)
  })

  it('有序列表 ordered=true 且内容不含序号前缀', () => {
    const { blocks } = parseMarkdown('1. 升职加薪\n2. 走上人生巅峰')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'list' }>
    expect(b.ordered).toBe(true)
    expect(stripInline(b.items[0].spans.map(s => s.text).join(''))).toBe('升职加薪')
  })

  it('缩进子项挂到父项 children（支持一层嵌套）', () => {
    const { blocks } = parseMarkdown('- 外层一\n  - 内层一\n- 外层二')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'list' }>
    expect(b.items).toHaveLength(2)
    expect(b.items[0].children).toHaveLength(1)
    expect(stripInline(b.items[0].children[0].spans.map(s => s.text).join(''))).toBe('内层一')
    expect(b.items[1].children).toHaveLength(0)
  })

  it('无序与有序列表切换时分成两个块', () => {
    const { blocks } = parseMarkdown('- a\n- b\n1. c\n2. d')
    expect(blocks).toHaveLength(2)
    expect((blocks[0] as { ordered: boolean }).ordered).toBe(false)
    expect((blocks[1] as { ordered: boolean }).ordered).toBe(true)
  })

  it('列表项内支持行内标记', () => {
    const { blocks } = parseMarkdown('- **重要**：这里要强调')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'list' }>
    expect(b.items[0].spans.map(s => s.kind)).toEqual(['strong', 'text'])
    expect(b.items[0].spans.map(s => s.text).join('')).toBe('重要：这里要强调')
  })

  it('回归：有序列表不得被中文序号规则吞成标题', () => {
    // 曾经的 bug：CN_SECTION 允许 \d+[.．]，于是 "1. 升职加薪" 变成 h2 标题，
    // 列表结构整个消失。列表判定必须排在中文序号之前。
    const { blocks } = parseMarkdown('1. 升职加薪\n2. 走上人生巅峰')
    expect(blocks.every(b => b.type === 'list')).toBe(true)
    expect(blocks.some(b => b.type === 'heading')).toBe(false)
  })
})

describe('parseMarkdown · 其余语法', () => {
  it('分隔线', () => {
    const { blocks } = parseMarkdown('a\n\n---\n\nb')
    expect(blocks.some(b => b.type === 'hr')).toBe(true)
  })

  it('引用块', () => {
    const { blocks } = parseMarkdown('> 这是引用')
    expect(blocks[0].type).toBe('quote')
  })

  it('表格：表头 + 数据行', () => {
    const { blocks } = parseMarkdown('| 阶段 | 目标 |\n| --- | --- |\n| 前期 | 存活 |\n| 后期 | 封神 |')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'table' }>
    expect(b.type).toBe('table')
    expect(b.header).toEqual(['阶段', '目标'])
    expect(b.rows).toEqual([['前期', '存活'], ['后期', '封神']])
  })

  it('含竖线但下一行不是分隔行 → 仍是段落（不误判成表格）', () => {
    const { blocks } = parseMarkdown('时间 | 地点 | 事件')
    expect(blocks[0].type).toBe('para')
  })

  it('围栏代码块：内容原样保留，不解析内部 markdown', () => {
    const { blocks } = parseMarkdown('```ts\nconst a = **1**\n```')
    const b = blocks[0] as Extract<typeof blocks[0], { type: 'code' }>
    expect(b.type).toBe('code')
    expect(b.lang).toBe('ts')
    expect(b.text).toBe('const a = **1**')
  })

  it('未闭合的围栏也要把剩余内容当代码块（不吞掉整篇）', () => {
    const { blocks } = parseMarkdown('```\n未闭合的代码')
    expect(blocks[0].type).toBe('code')
    expect((blocks[0] as { text: string }).text).toBe('未闭合的代码')
  })
})

describe('parseMarkdown · 健壮性（永不抛错）', () => {
  const nasty = [
    '',
    '   ',
    '\n\n\n',
    '#',
    '# ',
    '##### 五级标题（只支持到 4级）',
    '- ',
    '1.',
    '>',
    '```',
    '|',
    '| --- |',
    '****',
    '**',
    '*',
    '`',
    ' ',
    '一、',
    '一、 ',
    '中文段落没有任何标点也没有换行'.repeat(30),
  ]
  for (const [i, sample] of nasty.entries()) {
    it(`畸形输入 #${i + 1} 不抛错`, () => {
      expect(() => parseMarkdown(sample)).not.toThrow()
    })
  }

  it('全部畸形输入连跑仍不抛错', () => {
    expect(() => nasty.join('\n')).not.toThrow()
    const { blocks } = parseMarkdown(nasty.join('\n'))
    expect(Array.isArray(blocks)).toBe(true)
  })

  it('超长单行（10万字）能处理且不爆栈', () => {
    const huge = '长文本'.repeat(25000)
    const { blocks } = parseMarkdown(huge)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('CRLF 换行与 LF 结果一致', () => {
    const lf = parseMarkdown('# 标题\n\n正文一\n\n正文二')
    const crlf = parseMarkdown('# 标题\r\n\r\n正文一\r\n\r\n正文二')
    expect(crlf.blocks.length).toBe(lf.blocks.length)
    const p1 = crlf.blocks.find(b => b.type === 'para')
    expect(p1).toBeDefined()
    expect(stripInline((p1 as Extract<typeof p1, { type: 'para' }>).spans.map(s => s.text).join(''))).toBe('正文一')
  })
})
