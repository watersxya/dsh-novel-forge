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
 *
 * XML 解析共享核心在 ../docx-core.ts（与服务端同源）。
 */

import { unzipSync, strFromU8 } from 'fflate/browser'
import { extractDocxTextFromXml } from '../docx-core.ts'

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
  return extractDocxTextFromXml(strFromU8(document))
}

/** Read a File as ArrayBuffer. */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}
