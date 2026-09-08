/**
 * docx outline extraction: a .docx is a zip whose word/document.xml holds the
 * body text in <w:t> runs inside <w:p> paragraphs. We unzip with fflate and
 * walk the XML with a tiny tokenizer — no heavyweight XML/DOM dependency.
 * XML 解析共享核心在 ./docx-core.ts（与浏览器端同源）。
 */

import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { extractDocxTextFromXml } from './docx-core.ts'

/**
 * Extract plain text from a docx buffer: one line per <w:p> paragraph.
 * @param buffer - the raw .docx bytes.
 * @returns the body text.
 */
export function extractDocxText(buffer: Uint8Array): string {
  let files: ReturnType<typeof unzipSync>
  try {
    files = unzipSync(buffer)
  } catch (error) {
    throw new Error(`不是有效的 docx（zip 解压失败）：${(error as Error).message}`)
  }
  const document = files['word/document.xml']
  if (document === undefined) {
    throw new Error('不是有效的 docx（缺少 word/document.xml）')
  }
  return extractDocxTextFromXml(strFromU8(document))
}

/**
 * Read and extract a docx outline from disk.
 * @param path - absolute path to the .docx file.
 * @returns the extracted outline text.
 */
export function readOutlineFromDocx(path: string): string {
  let buffer: Buffer
  try {
    buffer = readFileSync(path)
  } catch (error) {
    throw new Error(`cannot read outline file "${path}": ${(error as Error).message}`)
  }
  return extractDocxText(new Uint8Array(buffer))
}
