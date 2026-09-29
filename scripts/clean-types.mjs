/**
 * 让声明产物**可重建**：先清掉 lib/types，再交给 tsc 生成。
 *
 * 为什么需要它：`tsc` 不会清理输出目录，删掉某个源文件后它的 `.d.ts` 会**留在原地**。
 * 而 `lib/` 是被 gitignore 的，没人会注意到残留；`package.json` 的 `files` 又包含
 * lib 下的全部 .d.ts，于是这些「幽灵声明」会被**发布到 npm**（曾实测：源码里早已
 * 删除的模块，其 .d.ts 仍出现在发布包的清单里）。
 *
 * 只用 Node 的 fs，不调 shell 命令 —— 保证 Windows / CI 行为一致。
 *
 * 注意：本文件是块注释，写 glob 时不要在注释里出现 `星号+斜杠` 的组合，
 * 那会提前结束注释（本文件第一版就踩了这个坑，脚本直接语法错误、静默没执行）。
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// 用 import.meta.dirname（Node ≥20.11）直接拿脚本所在目录，再上跳一级 —— 不要用
// new URL('..', import.meta.url) 手算：当目录名以 `-alpha` 这类形态结尾时，URL 解析
// 会把 `..` 接在尾部路径段之后，结果落到父目录的父目录（实测踩到，脚本静默不清理）。
const root = join(import.meta.dirname, '..')
const typesDir = join(root, 'lib', 'types')

if (existsSync(typesDir)) {
  rmSync(typesDir, { recursive: true, force: true })
  console.log('[dsh-novel-forge] 已清理旧声明产物：lib/types')
} else {
  console.log('[dsh-novel-forge] lib/types 不存在，跳过清理')
}
