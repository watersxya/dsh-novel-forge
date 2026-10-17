/**
 * 提示词分层组装。
 *
 * 同一本书的连续多次调用（逐章正文、审稿、润色、修订…）里，输入的大部分是重复的，
 * 但各块的变化频率差着量级：
 *
 *   - **固定层（fixed）**：合规红线、写作硬性要求——永远不变，写死在代码里；
 *   - **本书层（book）**：道藏、世界、大纲、资产、提示词槽位——只随作者编辑变，
 *     一次章节生产循环里不变；
 *   - **本章层（chapter）**：活跃伏笔、剧情线、时间线锚点、张力、章节骨架——
 *     随创作进度逐章变。
 *
 * 厂商的输入缓存按**前缀**命中：只有排在前面的内容逐字节相同，后面的重复输入才有
 * 机会整段命中。所以组装顺序必须是「固定 → 本书 → 本章」，把次次都变的挤到末尾。
 * 反过来，若静态规则夹在书级内容中段，作者每改一次道藏，它后面的全部内容都跟着
 * 作废、重新计费——分层就是把「不变的内容」尽量往前固定住。
 *
 * 三条纪律由本模块强制，不靠调用方自觉：
 *   1. 三层顺序写死（LAYER_ORDER），调用方只标层、不决定顺序；
 *   2. 同层内稳定排序，保持调用方的书写顺序；
 *   3. 空白块直接丢弃——「无伏笔」时留一段空分隔，会让前后两次调用的前缀在这里分叉。
 *
 * 实话实说：分层只是给缓存命中**创造条件**。厂商是否命中、命中多少，以每次调用
 * 实际上报的用量为准（见 llm-live 的缓存统计），本模块不做任何承诺，也不做
 * 模型预热之类的玄学操作。
 */

/** 提示词分层：越靠前的内容越稳定。 */
export type PromptLayer = 'fixed' | 'book' | 'chapter'

/**
 * 分层顺序。写死不开放配置——「哪层在前」是缓存语义决定的，不是产品偏好。
 */
const LAYER_ORDER: readonly PromptLayer[] = ['fixed', 'book', 'chapter']

/** 一个待组装进系统提示词的文本块。 */
export interface PromptBlock {
  /** 该块的变化频率归属哪一层。 */
  layer: PromptLayer
  /** 块文本（内部可含多行）。 */
  text: string
}

/**
 * 按「固定 → 本书 → 本章」组装系统提示词。
 *
 * 同层内保持书写顺序（稳定排序）；空白块丢弃，不在结果里留空段。
 * @param blocks 调用方按书写顺序给出的块（层标可以乱，组装后一定分层有序）。
 * @param separator 块间分隔符（默认换行）。
 */
export function assemblePromptBlocks(blocks: readonly PromptBlock[], separator = '\n'): string {
  const rank = (layer: PromptLayer): number => LAYER_ORDER.indexOf(layer)
  return blocks
    .map((block, index) => ({ block, index }))
    .filter(entry => entry.block.text.trim() !== '')
    .sort((a, b) => rank(a.block.layer) - rank(b.block.layer) || a.index - b.index)
    .map(entry => entry.block.text)
    .join(separator)
}
