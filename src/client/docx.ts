/**
 * Browser-side docx outline extraction: a .docx is a zip whose
 * word/document.xml holds the body text in <w:t> runs inside <w:p> paragraphs.
 * Uses fflate (inlined into the client bundle) so the user can pick or drag a
 * docx without any server upload.
 *
 * Import from 'fflate/browser' (not 'fflate'): the default entry resolves to
 * the Node build (esm/index.mjs), which calls module.createRequire() for the
 * optional worker_threads path — inlining that into the browser bundle leaves
 * a bare require("module") the client-modules table cannot answer.
 */

import { unzipSync, strFromU8 } from 'fflate/browser'

/** Decode the handful of XML entities docx bodies actually use. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}

/** Extract plain text from a docx buffer: one line per <w:p> paragraph. */
export function extractDocxTextFromBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let files: ReturnType<typeof unzipSync>
  try {
    files = unzipSync(bytes)
  } catch (error) {
    throw new Error(`不是有效的 docx（zip 解压失败）：${(error as Error).message}`)
  }
  const document = files['word/document.xml']
  if (document === undefined) {
    throw new Error('不是有效的 docx（缺少 word/document.xml）')
  }
  const xml = strFromU8(document)

  const paragraphs: string[] = []
  const parts = xml.split(/<w:p\b[^>]*>/)
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i]!
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

  const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length === 0) {
    throw new Error('docx 中没有可提取的文本')
  }
  return text
}

/** Read a File as ArrayBuffer. */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}
