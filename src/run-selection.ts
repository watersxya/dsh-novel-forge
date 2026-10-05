/**
 * 生产单选章与失败熔断判定（纯逻辑，无 IO / 不调 LLM / 不 import engine）。
 *
 * ## 为什么单独成文件
 *
 * 1. **可离线测试**：`run.ts` 会 `import` engine.ts，而 engine.ts 依赖宿主包
 *    `@deepseek-ai/dsh-llm` / `@deepseek-ai/cordis`——脱离 dsh 宿主环境跑测试时
 *    解析失败，判定逻辑将完全无法被测试覆盖。放在这里即可纯逻辑单测。
 * 2. **分层清晰**：选章是策略，不该和执行器（磁盘读写、LLM 编排）混在一起。
 *
 * ## 熔断要解决的问题
 *
 * 主循环扫描时只跳过 `approved` 章，而失败章的 `status` 是 `error`——它会在下一轮
 * 被重新选中，构成「生成失败 → 重跑 → 再失败」的死循环。由于每轮要跑一次正文生成
 * （maxTokens 常在 20000），配置类错误（如 maxTokens 配得过小导致必然截断）会变成
 * **确定性烧钱**，唯一刹车是作者手动点停止。
 *
 * 策略：连败 {@link MAX_CHAPTER_FAILURES} 次 → 该章列入 `pendingManual`
 * 并快进到下一章，**不阻塞整批**（作者配错一次不该让剩下几十章全停摆）。
 */
import type { ChapterPlan } from './protocol.ts'

/**
 * 同一章连续失败多少次后放弃重试、转入待人工。
 *
 * 取 3 是权衡：瞬时网络抖动、限流通常 1~2 次可恢复，而配置类错误反复重试
 * 永远不会成功。放弃后该章进 `pendingManual`，全书其余章继续跑完。
 */
export const MAX_CHAPTER_FAILURES = 3

/** 熔断判定结果。 */
export interface PickNextResult {
  /** 待处理的章；undefined 表示本批已处理完毕。 */
  next: ChapterPlan | undefined
  /** 本次扫描中需熔断跳过的章（连败达上限）。 */
  circuitBroken: Array<{ chapter: ChapterPlan; attempts: number }>
  /** 扫描中最后一个已 approved 的章号，供调用方快进 `currentNo`；无则回退为 `currentNo - 1`。 */
  advanceTo: number
}

/**
 * 选出生产单下一章要处理的章。
 *
 * 四种章：已 `approved` 快进；已列入 `pendingManual` 的快进（人工已接管）；
 * 连败达上限的熔断跳过；其余为下一章。
 *
 * @param chapters - 全书章节计划。
 * @param currentNo - 当前章号（含）。
 * @param endNo - 区间终点（含）。
 * @param failedAttempts - 章号 → 已失败次数（来自 `RunState.failedAttempts`）。
 * @param pendingManual - 已列入待人工的章号（来自 `RunState.pendingManual`）。
 *   必须传入，否则重写 N 轮仍不过的章会被反复选中，每轮烧两次 rewrite + 两次 verify。
 */
export function pickNextChapter(
  chapters: ChapterPlan[],
  currentNo: number,
  endNo: number,
  failedAttempts: Record<string, number>,
  pendingManual: readonly number[] = [],
): PickNextResult {
  const circuitBroken: Array<{ chapter: ChapterPlan; attempts: number }> = []
  const manual = new Set(pendingManual)
  let advanceTo = currentNo - 1
  for (let no = currentNo; no <= endNo; no++) {
    const ch = chapters.find(c => c.no === no)
    if (ch === undefined) continue
    if (ch.status === 'approved') { advanceTo = no; continue }
    // 人工已接管的章不再自动重跑：它没有被改成 approved，若不快进会在这里死循环。
    if (manual.has(no)) { advanceTo = no; continue }
    const attempts = failedAttempts[String(no)] ?? 0
    if (attempts >= MAX_CHAPTER_FAILURES) {
      circuitBroken.push({ chapter: ch, attempts })
      continue
    }
    return { next: ch, circuitBroken, advanceTo }
  }
  return { next: undefined, circuitBroken, advanceTo }
}
