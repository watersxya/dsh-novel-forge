/**
 * 章节「摘要 + 事实 + 时间线」合并抽取的**解析收敛层**。
 *
 * ## 为什么独立成文件
 *
 * 合并后一次 LLM 调用要parse 三个字段，最容易出错的地方不是「怎么调模型」，
 * 而是**「模型返回畸形 JSON 时怎么收敛」**：字段缺失、类型不对、数组里混null、
 * runaway 长文本。任何一项坏掉都不该拖垮另外两项。
 *
 * 这层逻辑必须能被离线验证，而 engine.ts 依赖宿主包 `@deepseek-ai/dsh-llm`
 * （脱离 dsh 环境直接import 失败）。所以规则层放这里，保持零依赖。
 */

/** 把 LLM 返回的原始 facts 收敛为合法事实条目（过滤过短项、截断超长项）。 */
export function parseFactLines(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 8)
        .map(v => v.trim().slice(0, 140))
    : []
}

/** 把 LLM 返回的原始 timeline 收敛为对象数组（剔除非对象成员）。 */
export function parseTimelineItems(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : []
}

/**
 * timeline 单项的字段映射：缺失/错类型一律回落到安全默认，绝不产出 undefined 字段。
 *
 * @param item - 模型给出的原始项。
 * @param index - 该项在数组中的下标；模型没给 `order` 时用它兜底，保证章内序号连续。
 */
export function mapTimelineItem(
  item: Record<string, unknown>,
  index: number,
): { time: string; order: number; place: string; characters: string[]; event: string } {
  return {
    time: typeof item.time === 'string' ? item.time : '',
    order: typeof item.order === 'number' ? item.order : index + 1,
    place: typeof item.place === 'string' ? item.place : '',
    characters: Array.isArray(item.characters)
      ? item.characters.filter((c): c is string => typeof c === 'string')
      : [],
    event: typeof item.event === 'string' ? item.event : '',
  }
}
