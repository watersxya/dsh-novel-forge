/**
 * 章节正文的标题剥离（唯一实现）。
 *
 * ## 为什么要抽
 *
 * 全项目有 21 处散落着「把正文里的 markdown 标题剥掉」，写成
 * `body.replace(/^#\s+.*$/m, '')`。这个写法**只删第一行**——
 * `String.replace` 无 `g` 修饰符时只替换第一个匹配，而 `m` 只影响 `^` 的语义
 * （让它匹配每一行的行首），**不控制替换次数**。于是同一份代码库里
 * 两种写法并存：
 *
 *   `replace(/^#.*$/gm, '')`  → 所有标题行都剥掉（正确）
 *   `replace(/^#\s+.*$/m, '')` → 只剥掉首行标题（漏）
 *
 * 漏掉的后果不是报错：
 *  - 送进 LLM 的正文里夹着 `# 中间插入的标题`，模型会以为那是结构指令；
 *  - diff 视图把标题当正文段落，段落 LCS 完全对不齐，作者看到满屏红绿。
 *
 * 现在只有一个实现，行为统一为「剥掉所有 markdown 标题行」，
 * 且**跳过围栏代码块**——否则 ```sh 里的 `# 这是注释` 会被当成标题剥掉，
 * 代码示例凭空少一行。
 */

/** 围栏代码块的起止行。 */
const FENCE = /^\s{0,3}(?:```|~~~)/

/**
 * 剥掉正文里的 markdown 标题行。
 *
 * 保留其他内容原样（含行内空白），调用方自行再 `trim()`。
 * 判为标题：行首 1-6 个 `#` + 空白 + 内容。`#tag` 这类无空白的行首井号
 * **不**算标题（那是标签，不是标题）。围栏代码块内的行一律不动。
 *
 * @param body - 原始正文。
 * @returns 去掉标题行后的正文。
 */
export function stripChapterHeadings(body: string): string {
  const out: string[] = []
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) { inFence = !inFence; out.push(line); continue }
    if (!inFence && /^#{1,6}\s+\S/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim()
}
