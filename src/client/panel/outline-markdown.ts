/**
 * 大纲 / 正文的轻量 Markdown 解析（零依赖、可离线单测）。
 *
 * ## 为什么不用现成的库
 *
 * 插件不引第三方依赖（`package.json` 只有宿主 peer），而大纲是**受控文本**：
 * 内容由本插件自己的 prompt 产出或作者手写，不是任意的用户 markdown。
 * 拉一个 markdown 库进来（marked / markdown-it ≈ 100KB+）只为一个只读预览，
 * 不划算；而自己写又必须**只实现真实用到的语法**，否则就是自造半吊子。
 *
 * ## 实际要支持什么（由真实产物倒推，不是凭想象）
 *
 * 看 `H:/novels/还债疯了/_outline.md` 的真实形态：
 *  - 大量**中文序号小标题**独立成行：「一、书名与题材定位」「二、金手指与核心机制」。
 *    旧解析器只认 `#`，这些全被塞进一个 `<p>`，整份大纲在页面上是一堵墙。
 *  - 顶格书名独占一行（《还债疯了》）后接空行。
 *  - 冒号开头的**定义式条目**：「人情债与识海：救人即触发…」。
 *  - LLM 被明确要求**不输出换行符**，所以段落内会挤很长的句子
 *    （实测最长 700+ 字），必须靠标点断句才读得下去。
 *
 * 加上作者手写时会用的：`- / * / 1.` 列表、`**加粗**`、`*斜体*`、`` `代码` ``、
 * `> 引用`、`|` 表格、`---` 分隔、` ``` ` 代码块。
 *
 * ## 设计约束
 *
 * 1. **永不抛错**：任何看不懂的输入都退化为普通段落，渲染器不能因为一个畸形
 *    字符整页白屏。
 * 2. **纯函数、无 React**：解析结果只含数据，渲染交给调用方。这样解析规则可以
 *    完全离线验证，不必拉起整个面板。
 * 3. **行内标记只做切分，不生成 HTML**：返回「片段数组」（普通文本 / 加粗 /
 *    斜体 / 行内代码），由 React 渲染成元素——绝不用 dangerouslySetInnerHTML。
 */

/** 行内片段：把一段文本按 `**粗**` / `*斜*` / `` `码` `` 切分。 */
export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }

/** 块级节点类型。 */
export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; spans: InlineSpan[]; id: string }
  | { type: 'para'; spans: InlineSpan[]; id: string }
  | { type: 'list'; ordered: boolean; items: MdListItem[]; id: string }
  | { type: 'quote'; spans: InlineSpan[]; id: string }
  | { type: 'code'; lang: string; text: string; id: string }
  | { type: 'table'; header: string[]; rows: string[][]; id: string }
  | { type: 'hr'; id: string }

/** 列表项：支持一层嵌套（`- 外层` / `  - 内层`），再深就压平。 */
export interface MdListItem {
  /** 主行内容（已解析行内标记）。 */
  spans: InlineSpan[]
  /** 嵌套子项。 */
  children: MdListItem[]
}

/** 解析结果。 */
export interface MdDoc {
  blocks: MdBlock[]
  /** 目录项（heading level<=3）。 */
  toc: Array<{ level: number; text: string; id: string }>
}

/**
 * 中文序号小标题：`一、` `二、` … `十、` `十一、` `二十三、`。
 *
 * **只认中文数字 + 顿号**，不认「1.」——那是有序列表项的语法。
 * 早先的正则含`\d{1,2}[.．]`，结果 `1. 升职加薪` 这类列表被当成 h2 标题，
 * 列表结构整个消失（实测被单测抓到）。
 */
const CN_SECTION = /^([一二三四五六七八九十百]{1,4})[、.．]\s*(\S.*)$/
/** Markdown 标题 1-4 级。 */
const ATX = /^(#{1,4})\s+(.*\S)\s*$/
/** 无序列表项。 */
const BULLET = /^(\s*)[-*+]\s+(.*)$/
/** 有序列表项。 */
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/
/** 引用。 */
const QUOTE = /^\s{0,3}>\s?(.*)$/
/** 分隔线。 */
const HR = /^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/
/** 围栏代码块。 */
const FENCE = /^\s{0,3}```\s*([A-Za-z0-9_+-]*)\s*$/
/** 表格分隔行：`| --- | :--- |`。 */
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
/** 顶格书名：整行被《》包住（如 `《还债疯了》`）。 */
const TITLE_ONLY = /^《[^》]{1,40}》[：:。]?$/

/** 生成稳定 id：块序号 + 可读前缀（中文保留，便于锚点自解释）。 */
function makeIdFactory(): (seed: string) => string {
  let n = 0
  return seed => {
    const clean = seed.replace(/[^\w一-龥]/g, '').slice(0, 18)
    return `md-${n++}-${clean}`
  }
}

/** 去掉 markdown 标记后的纯文本（用于生成目录文字与 slug）。 */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

/**
 * 解析行内标记为片段数组。
 *
 * 顺序有讲究：先剥行内代码（其内容不该再被解析），再剥加粗，最后剥斜体。
 * 未闭合的标记按普通文本处理——宁可少强调，不可渲染出残缺标签。
 */
export function parseInline(text: string): InlineSpan[] {
  const out: InlineSpan[] = []
  let buf = ''
  let i = 0
  const push = () => { if (buf !== '') { out.push({ kind: 'text', text: buf }); buf = '' } }

  while (i < text.length) {
    const ch = text[i]

    // 行内代码
    if (ch === '`') {
      const close = text.indexOf('`', i + 1)
      if (close > i + 1) {
        push()
        out.push({ kind: 'code', text: text.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    // 加粗 **…**（要求内容非空且不含换行）
    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2)
      if (close > i + 2) {
        const inner = text.slice(i + 2, close)
        if (inner.trim() !== '' && !inner.includes('\n')) {
          push()
          out.push({ kind: 'strong', text: inner })
          i = close + 2
          continue
        }
      }
    }

    // 斜体 *…*（单星，排除 ** 与列表符误匹配）
    if (ch === '*' && text[i + 1] !== '*') {
      const close = text.indexOf('*', i + 1)
      if (close > i + 1) {
        const inner = text.slice(i + 1, close)
        if (inner.trim() !== '' && !inner.includes('\n') && !inner.startsWith(' ')) {
          push()
          out.push({ kind: 'em', text: inner })
          i = close + 1
          continue
        }
      }
    }

    buf += ch
    i += 1
  }
  push()
  return out.length > 0 ? out : [{ kind: 'text', text }]
}

/** 把表格行拆成单元格数组（容忍首尾竖线与空单元格）。 */
function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

/** 判断一行是否是「顶格书名」——应升级为 h1。 */
function isBookTitle(line: string): boolean {
  return TITLE_ONLY.test(line.trim())
}

/**
 * 解析一段 Markdown 为块序列。
 *
 * @param text - 原始文本。
 * @returns 块序列 + 目录。
 */
export function parseMarkdown(text: string): MdDoc {
  const lines = text.split(/\r?\n/)
  const blocks: MdBlock[] = []
  const toc: MdDoc['toc'] = []
  const nextId = makeIdFactory()

  // 段落缓冲：连续非空行合并成一段
  let paraBuf: string[] = []
  const flushPara = (): void => {
    if (paraBuf.length === 0) return
    const raw = paraBuf.join('\n').trim()
    paraBuf = []
    if (raw === '') return
    const spans = parseInline(raw)
    const id = nextId(stripInline(raw))
    blocks.push({ type: 'para', spans, id })
  }

  // 列表缓冲
  type ListState = { ordered: boolean; items: MdListItem[] }
  let list: ListState | null = null
  const flushList = (): void => {
    if (list === null) return
    const cur = list
    list = null
    if (cur.items.length === 0) return
    blocks.push({ type: 'list', ordered: cur.ordered, items: cur.items, id: nextId('ul') })
  }

  const addItem = (indent: number, content: string, ordered: boolean): void => {
    if (list === null || list.ordered !== ordered) {
      flushList()
      list = { ordered, items: [] }
    }
    const spans = parseInline(content)
    const item: MdListItem = { spans, children: [] }
    if (indent >= 2 && list.items.length > 0) {
      list.items[list.items.length - 1].children.push(item)
    } else {
      list.items.push(item)
    }
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].replace(/\s+$/, '')

    // 围栏代码块
    const fence = FENCE.exec(line)
    if (fence !== null) {
      flushPara(); flushList()
      const lang = fence[1]
      const body: string[] = []
      let j = idx + 1
      for (; j < lines.length; j++) {
        if (FENCE.test(lines[j].replace(/\s+$/, ''))) break
        body.push(lines[j])
      }
      blocks.push({ type: 'code', lang, text: body.join('\n'), id: nextId('pre') })
      idx = j
      continue
    }

    if (line.trim() === '') { flushPara(); flushList(); continue }

    if (HR.test(line)) { flushPara(); flushList(); blocks.push({ type: 'hr', id: nextId('hr') }); continue }

    // 表格：当前行有竖线且下一行是分隔行
    if (line.includes('|') && idx + 1 < lines.length && TABLE_SEP.test(lines[idx + 1].replace(/\s+$/, ''))) {
      flushPara(); flushList()
      const header = splitTableRow(line)
      const rows: string[][] = []
      let j = idx + 2
      for (; j < lines.length; j++) {
        const r = lines[j].replace(/\s+$/, '')
        if (!r.includes('|') || r.trim() === '') break
        rows.push(splitTableRow(r))
      }
      blocks.push({ type: 'table', header, rows, id: nextId('tbl') })
      idx = j - 1
      continue
    }

    // Markdown 标题
    const atx = ATX.exec(line)
    if (atx !== null) {
      flushPara(); flushList()
      const level = atx[1].length as 1 | 2 | 3 | 4
      const t = stripInline(atx[2])
      const id = nextId(t)
      blocks.push({ type: 'heading', level, spans: parseInline(atx[2]), id })
      toc.push({ level, text: t, id })
      continue
    }

    // 顶格书名 → h1（真实大纲的第一行几乎都是它）
    if (isBookTitle(line)) {
      flushPara(); flushList()
      const t = stripInline(line)
      const id = nextId(t)
      blocks.push({ type: 'heading', level: 1, spans: parseInline(line), id })
      toc.push({ level: 1, text: t, id })
      continue
    }

    // 引用
    const q = QUOTE.exec(line)
    if (q !== null) {
      flushPara(); flushList()
      const spans = parseInline(q[1] ?? '')
      blocks.push({ type: 'quote', spans, id: nextId(stripInline(q[1] ?? '')) })
      continue
    }

    // 列表（须在中文序号标题之前判定：`一、` 与 `1.` 都以序号开头，
    // 但后者是列表；顺序颠倒会把列表吞成标题）
    const b = BULLET.exec(line)
    if (b !== null) {
      flushPara()
      addItem(b[1].length, b[2], false)
      continue
    }
    const o = ORDERED.exec(line)
    if (o !== null) {
      flushPara()
      addItem(o[1].length, o[3], true)
      continue
    }

    // 中文序号小标题：「一、书名与题材定位」——独立成行且较短时升级为 h2。
    // 判据收紧：必须**独占一行**且长度 <= 40 且不含冒号，
    // 避免把正文里「一、xxx：yyy」这类定义式条目误判成标题。
    const cn = CN_SECTION.exec(line.trim())
    if (cn !== null && line.trim().length <= 40 && !line.includes('：') && !line.includes(':')) {
      flushPara(); flushList()
      const t = stripInline(cn[2])
      const id = nextId(t)
      blocks.push({ type: 'heading', level: 2, spans: parseInline(cn[2]), id })
      toc.push({ level: 2, text: t, id })
      continue
    }

    flushList()
    paraBuf.push(line)
  }
  flushPara()
  flushList()
  return { blocks, toc }
}
