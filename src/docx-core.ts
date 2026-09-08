/**
 * docx 文本提取共享核心：服务端（src/docx.ts）与浏览器端（src/client/docx.ts）
 * 共用 XML → 纯文本的解析逻辑，避免两份实现漂移。
 * zip 解压入口因运行时不同（fflate vs fflate/browser，浏览器端必须走 browser
 * 入口以避开 node:module 的 require 探测）留在两端各自处理。
 */

/** 解码 docx 正文实际会用到的少量 XML 实体。 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}

/**
 * 从 word/document.xml 的 XML 字符串提取纯文本：每个 <w:p> 段落一行，
 * <w:tab>/<w:br> 保留为空白符；表格与嵌套结构按文档顺序拍平
 * （它们的段落同样是 <w:p>）。
 * @param xml - document.xml 解码后的字符串。
 * @returns 正文文本（空文本时抛错）。
 */
export function extractDocxTextFromXml(xml: string): string {
  const paragraphs: string[] = []
  // 按段落边界切分；逐段取 run 文本。
  const parts = xml.split(/<w:p\b[^>]*>/)
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i]!
    // 匹配 <w:t ...>…</w:t>；同时把 <w:tab/> 与 <w:br/> 当作空白保留。
    const runs: string[] = []
    const runRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g
    for (const match of segment.matchAll(runRe)) {
      if (match[0].startsWith('<w:tab')) {
        runs.push('\t')
      } else if (match[0].startsWith('<w:br')) {
        runs.push('\n')
      } else {
        runs.push(decodeEntities(match[1] ?? ''))
      }
    }
    paragraphs.push(runs.join('').replace(/\u00a0/g, ' ').trimEnd())
  }

  // 折叠 3+ 连续空行并去首尾空白。
  const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length === 0) {
    throw new Error('docx 中没有可提取的文本')
  }
  return text
}
