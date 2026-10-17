/**
 * 提示词注册表（轻量版）。
 *
 * ## 它解决什么问题
 *
 * 提示词散落在 engine.ts 里时，有三件事会慢慢腐烂：
 *   1. **看不见总量**：没人说得清这个插件到底有多少份系统提示、各是干什么的；
 *   2. **改一处忘三处**：合规红线有四份注入点，「反 AI 套话口径」在润色和局部
 *      修订里各写一份，改一边漏一边，两个提示词悄悄漂移；
 *   3. **新人不敢动**：想改审稿维度，先得在 5000 行里 grep 出所有相关文案。
 *
 * 注册表把「有哪些提示词、各自负责什么」变成一份可检索、可测试的清单。
 * 域模块（`./*.ts`，catalog 自身除外）各自导出 `entries` 登记表，此处汇总。
 *
 * ## 纪律（由 tests/prompt-registry.test.ts 强制执行）
 *
 *   1. **目录完整**：src/prompts/ 下每个域文件都必须被本文件 import——
 *      新建了域文件却忘了登记，测试直接红；
 *   2. **双向完整**：登记表里的每条 id 必须以所在域的文件名开头（`域.名称`），
 *      域名与文件域一一对应，没有挂靠的孤条；
 *   3. **id 唯一**：全库不允许重复 id；
 *   4. **短描述**：description 是给人看的索引，不是第二份提示词——必须非空、
 *      不超长，且不得原文照抄提示词首句（那是重复维护两份）。
 *
 * 遥测（哪次调用用了哪条提示词）与导出器暂不做：那需要改调用点传 id，
 * 等真有度量需求再接，避免为假想的功能付出复杂度。
 */

import { entries as adaptEntries } from './adapt.ts'
import { entries as auditEntries } from './audit.ts'
import { entries as bibleEntries } from './bible.ts'
import { entries as charactersEntries } from './characters.ts'
import { entries as digestEntries } from './digest.ts'
import { entries as factsEntries } from './facts.ts'
import { entries as foreshadowEntries } from './foreshadow.ts'
import { entries as marketEntries } from './market.ts'
import { entries as nameforgeEntries } from './nameforge.ts'
import { entries as outlineEntries } from './outline.ts'
import { entries as planEntries } from './plan.ts'
import { entries as plotlinesEntries } from './plotlines.ts'
import { entries as polishEntries } from './polish.ts'
import { entries as reviewEntries } from './review.ts'
import { entries as worldEntries } from './world.ts'
import { entries as writingEntries } from './writing.ts'

/** 一条提示词登记。 */
export interface PromptEntry {
  /** 稳定标识：`域.名称`，全库唯一（域名与 src/prompts/ 下的文件名对应）。 */
  id: string
  /** 中文短描述：给人看的索引，不进提示词本身。 */
  description: string
}

/** 全库提示词清单（按域名字典序）。 */
export const PROMPT_CATALOG: readonly PromptEntry[] = [
  ...adaptEntries,
  ...auditEntries,
  ...bibleEntries,
  ...charactersEntries,
  ...digestEntries,
  ...factsEntries,
  ...foreshadowEntries,
  ...marketEntries,
  ...nameforgeEntries,
  ...outlineEntries,
  ...planEntries,
  ...plotlinesEntries,
  ...polishEntries,
  ...reviewEntries,
  ...worldEntries,
  ...writingEntries,
]

/** 查一条提示词的中文描述；未登记返回 undefined。 */
export function describePrompt(id: string): string | undefined {
  return PROMPT_CATALOG.find(entry => entry.id === id)?.description
}

/** 全库清单（供测试与将来的导出器使用）。 */
export function listPromptEntries(): readonly PromptEntry[] {
  return PROMPT_CATALOG
}
