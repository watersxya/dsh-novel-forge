/**
 * 客户端文件文本智能解码：兼容 UTF-8 BOM / UTF-16 / UTF-8 / GB18030(GBK)。
 * 浏览器 File.text() 固定按 UTF-8 解码，GBK 中文网文 txt 会乱码，这里兜底。
 */

/**
 * 读取一个 File 的文本，按编码探测兜底解码。
 * @returns 解码后的文本。
 */
export async function readFileTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const u8 = new Uint8Array(buf)
  // UTF-8 BOM
  if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(u8.subarray(3))
  }
  // UTF-16 LE / BE
  if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2))
  if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2))
  // UTF-8（宽松），含替换符则回退 GB18030
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(u8)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gb18030').decode(u8)
  } catch {
    return utf8
  }
}
