/**
 * 剧情线批量刷新的**结果对齐**。
 *
 * ## 为什么单独成文件
 *
 * 批量刷新让模型一次返回 `{items: [{name, progress}]}`，再按 name 对齐回原线。
 * 这里最容易出的错是**错位**：一旦线名对不上，模型给 A 线的进度就会被写到
 * B 线上。这种 bug 不报错、界面也正常显示，只是内容全错了，作者很难发现。
 *
 * 所以必须能离线验证。而对齐逻辑所在的 engine.ts 依赖宿主包
 * `@deepseek-ai/dsh-llm`，脱离 dsh 环境 import 就失败——故规则层放这里。
 */

/** 一条待刷新的线（对齐只需要 id 与 name）。 */
export interface AlignLine {
  id: string
  name: string
}

/** 对齐结果：text 为空串表示这条线没拿到进度。 */
export interface AlignedProgress extends AlignLine {
  text: string
}

/** 进度文本的最大长度（与写入 plotline.progress 的截断一致）。 */
const MAX_PROGRESS = 300

/**
 * 把模型返回的 items 对齐回原始线列表。
 *
 * 对齐规则（按优先级）：
 * 1. **线名逐字匹配**——模型原样回显 name，最可靠；
 * 2. name 缺失或重复时，按**出现顺序**兜给尚未匹配的线
 *    （宁可可能错位，也不能让作者看到一片空白）；
 * 3. 模型漏项的线**留空**，绝不拿别人的进度填。
 *
 * @param items - 模型返回的原始 items（不保证是数组/对象）。
 * @param lines - 原始线列表，顺序即最终返回顺序。
 * @returns 与 `lines` 一一对应的结果（长度恒等）。
 */
export function alignPlotlineProgress(
  items: unknown,
  lines: AlignLine[],
): AlignedProgress[] {
  const byName = new Map<string, string>()
  const arr = Array.isArray(items) ? items : []
  for (const it of arr) {
    if (typeof it !== 'object' || it === null) continue
    const e = it as Record<string, unknown>
    const p = typeof e.progress === 'string' ? e.progress.trim().slice(0, MAX_PROGRESS) : ''
    if (p === '') continue
    const nm = typeof e.name === 'string' ? e.name.trim() : ''
    if (nm !== '' && !byName.has(nm)) { byName.set(nm, p); continue }
    const spare = lines.find(l => !byName.has(l.name))
    if (spare !== undefined) byName.set(spare.name, p)
  }
  return lines.map(l => ({ id: l.id, name: l.name, text: byName.get(l.name) ?? '' }))
}
