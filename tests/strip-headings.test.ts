/**
 * 章节标题剥离（离线）。
 *
 * ## 这个测试在守什么
 *
 * 原代码是 `body.replace(/^#\s+.*$/m, '')`。这个写法看起来"对"（用了 `m`），
 * 实际只删第一行——`m` 只改 `^` 的语义（匹配每行行首），**不控制替换次数**，
 * 控制次数的是 `g`。少了 `g`，于是：
 *
 *  - 送进 LLM 的正文夹带 `# 中间插入的标题`，模型会当成结构指令；
 *  - diff 视图把标题当正文段落，段落 LCS 对不齐，作者看到满屏红绿。
 *
 * 而同一份代码库里还并存着正确写法 `replace(/^#.*$/gm, '')`——两种行为混在一起，
 * 谁也说不清某个调用点到底剥没剥干净。所以必须有一张明确的对照表。
 */
import { describe, it, expect } from 'vitest'
import { stripChapterHeadings } from '../src/strip-headings.ts'

describe('stripChapterHeadings', () => {
  it('剥掉首行标题', () => {
    expect(stripChapterHeadings('# 第 12 章 风雪山神庙\n\n正文第一段。')).toBe('正文第一段。')
  })

  it('核心回归：剥掉**所有**标题行，不只第一行', () => {
    // 旧写法 `replace(/^#\s+.*$/m, '')` 在这里会漏掉中间那个标题。
    const src = '# 第一章 标题\n\n正文一。\n\n# 中间插入的标题\n\n正文二。'
    const out = stripChapterHeadings(src)
    expect(out).not.toContain('第一章')
    expect(out).not.toContain('中间插入的标题')
    expect(out).toContain('正文一。')
    expect(out).toContain('正文二。')
  })

  it('多级标题（## / ### / ####）同样剥掉', () => {
    const src = '# 一\n\n正文。\n\n## 二级\n\n正文。\n\n### 三级\n\n正文。\n\n#### 四级'
    const out = stripChapterHeadings(src)
    expect(out).not.toContain('一级')
    expect(out).not.toContain('二级')
    expect(out).not.toContain('三级')
    expect(out).not.toContain('四级')
  })

  it('6 级标题也剥（7 级不是合法 markdown，保留）', () => {
    expect(stripChapterHeadings('###### 六级\n\n正文')).toBe('正文')
    expect(stripChapterHeadings('####### 七级\n\n正文')).toContain('七级')
  })

  it('无空白的行首井号不是标题（#tag 是标签）', () => {
    expect(stripChapterHeadings('#标签\n\n正文')).toContain('#标签')
  })

  it('缩进后的井号不是标题（代码块内的注释）', () => {
    expect(stripChapterHeadings('    # 缩进的井号\n\n正文')).toContain('缩进的井号')
  })

  it('代码块内的 # 行也不该被误剥——它看起来像标题但不是', () => {
    // 判据收紧为「行首 1-6 个 # + 空白」，代码块内的 shell 注释会被保留。
    // 这不是完美的 markdown 解析（真解析器会看 fence），但比剥掉强：
    // 剥掉会让代码示例消失，保留最多多一行井号。
    const src = '示例：\n\n```sh\n# 这是注释\nls\n```'
    expect(stripChapterHeadings(src)).toContain('# 这是注释')
  })

  it('行内的 # 不受影响', () => {
    expect(stripChapterHeadings('正文里有 # 号 和 C# 代码')).toBe('正文里有 # 号 和 C# 代码')
  })

  it('无标题时原样返回（只做 trim）', () => {
    expect(stripChapterHeadings('  只有正文。  ')).toBe('只有正文。')
  })

  it('空输入返回空串', () => {
    expect(stripChapterHeadings('')).toBe('')
    expect(stripChapterHeadings('   \n  \n')).toBe('')
  })

  it('全篇都是标题时返回空串，不抛错', () => {
    expect(stripChapterHeadings('# 一\n\n## 二\n\n### 三')).toBe('')
  })

  it('CRLF 与 LF 结果一致', () => {
    expect(stripChapterHeadings('# 标题\r\n\r\n正文一。\r\n\r\n# 二\r\n\r\n正文二。'))
      .toBe(stripChapterHeadings('# 标题\n\n正文一。\n\n# 二\n\n正文二。'))
  })

  it('保留正文内部的段落分隔（不压成一行）', () => {
    const out = stripChapterHeadings('# 标题\n\n第一段。\n\n第二段。')
    expect(out.split('\n').filter(l => l.trim() !== '')).toHaveLength(2)
  })
})
