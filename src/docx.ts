/**
 * docx outline extraction: a .docx is a zip whose word/document.xml holds the
 * body text in <w:t> runs inside <w:p> paragraphs. We unzip with fflate and
 * walk the XML with a tiny tokenizer — no heavyweight XML/DOM dependency.
 */

import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

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

/**
 * Extract plain text from a docx buffer: one line per <w:p> paragraph, with
 * <w:tab>/<w:br> preserved as whitespace. Tables and nested structures are
 * flattened in document order (their paragraphs are just <w:p> too).
 * @param buffer - the raw .docx bytes.
 * @returns the body text.
 */
export function extractDocxText(buffer: Uint8Array): string {
  let files: ReturnType<typeof unzipSync>
  try {
    files = unzipSync(buffer)
  } catch (error) {
    throw new Error(`not a valid docx (zip open failed): ${(error as Error).message}`)
  }
  const document = files['word/document.xml']
  if (document === undefined) {
    throw new Error('not a valid docx (word/document.xml missing)')
  }
  const xml = strFromU8(document)

  const paragraphs: string[] = []
  // Split on paragraph boundaries; keep the segment text of each.
  const parts = xml.split(/<w:p\b[^>]*>/)
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i]!
    // Runs <w:t ...>…</w:t>; also honor <w:tab/> and <w:br/> as spaces.
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
    const line = runs.join('').replace(/\u00a0/g, ' ').trimEnd()
    paragraphs.push(line)
  }

  // Collapse 3+ blank lines and trim.
  const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length === 0) {
    throw new Error('docx contains no extractable text')
  }
  return text
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
