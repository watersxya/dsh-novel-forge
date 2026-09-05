/**
 * 客户端文件文本智能解码：兼容 UTF-8 BOM / UTF-16 / UTF-8 / GB18030(GBK)。
 * 浏览器 File.text() 固定按 UTF-8 解码，GBK 中文网文 txt 会乱码，这里兜底。
 */
/**
 * 读取一个 File 的文本，按编码探测兜底解码。
 * @returns 解码后的文本。
 */
export declare function readFileTextSmart(file: File): Promise<string>;
