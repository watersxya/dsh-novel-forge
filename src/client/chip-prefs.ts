/**
 * 右上角「小说工坊生成状态」芯片的显示偏好（纯客户端、localStorage）。
 *
 * 为什么是 localStorage 而不是插件配置：这是纯界面 chrome，与显示模式 / 界面密度 /
 * 编辑器字号 / 芯片自身的位置记忆同类；哪个浏览器想清屏就哪个浏览器清，不需要跨端同步。
 * 将来若要跨端，把键名沿用成 config 字段 `showRunChip` 即可平滑升级。
 *
 * 三态：
 *   off    关闭（同时停止 4 秒轮询，不白跑）
 *   active 只在生产单**运行中或已暂停**时显示（不想错过生成，也不想留残影）
 *   always 只要该目录有生产单状态就显示（默认，保持历史行为）
 */

import type { RunState } from '../protocol.ts'

export type RunChipMode = 'off' | 'active' | 'always'

/** localStorage 键（与芯片位置记忆同一命名空间）。 */
export const RUN_CHIP_MODE_KEY = 'dsh-novel-forge.runChip.mode'

/** 同页变更通知用的自定义事件名（跨标签页走原生 storage 事件）。 */
export const RUN_CHIP_MODE_EVENT = 'dsh-novel-forge:runchip-mode'

/** 默认值与历史行为一致：有生产单状态就显示。 */
export const DEFAULT_RUN_CHIP_MODE: RunChipMode = 'always'

/** 设置页下拉用的三态选项（顺序即用户看到的顺序）。 */
export const RUN_CHIP_MODE_OPTIONS: ReadonlyArray<{ value: RunChipMode; label: string }> = [
  { value: 'always', label: '总是显示' },
  { value: 'active', label: '仅生成中 / 暂停时显示' },
  { value: 'off', label: '关闭' },
]

const ALL_MODES: readonly RunChipMode[] = ['off', 'active', 'always']

function isMode(value: unknown): value is RunChipMode {
  return typeof value === 'string' && (ALL_MODES as readonly string[]).includes(value)
}

/** 安全拿 localStorage：隐私模式 / 非浏览器环境下为 undefined。 */
function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** 读取偏好（缺失 / 非法 / 存储不可用 → 默认值）。 */
export function readRunChipMode(): RunChipMode {
  try {
    const raw = storage()?.getItem(RUN_CHIP_MODE_KEY)
    return isMode(raw) ? raw : DEFAULT_RUN_CHIP_MODE
  } catch {
    return DEFAULT_RUN_CHIP_MODE
  }
}

/** 已注册的同页监听者（storage 事件只覆盖跨标签页，同页要靠这里）。 */
const listeners = new Set<(mode: RunChipMode) => void>()

/** 写入偏好并通知所有监听者；存储不可用时仍通知（本次会话内生效）。 */
export function writeRunChipMode(mode: RunChipMode): void {
  try {
    storage()?.setItem(RUN_CHIP_MODE_KEY, mode)
  } catch {
    /* 存储不可用：本次会话内仍然生效 */
  }
  for (const listener of [...listeners]) {
    try {
      listener(mode)
    } catch {
      /* 单个监听者出错不影响其他人 */
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(RUN_CHIP_MODE_EVENT, { detail: mode }))
    }
  } catch {
    /* 事件派发失败无关紧要 */
  }
}

/** 订阅偏好变化（同页 + 跨标签页 storage）；返回退订函数。 */
export function subscribeRunChipMode(listener: (mode: RunChipMode) => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== RUN_CHIP_MODE_KEY) return
    listener(readRunChipMode())
  }
  let attached = false
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
      attached = true
    }
  } catch {
    attached = false
  }
  return () => {
    listeners.delete(listener)
    if (!attached) return
    try {
      window.removeEventListener('storage', onStorage)
    } catch {
      /* ignore */
    }
  }
}

/**
 * 给定偏好与当前生产单状态，判断芯片是否应可见。
 * null（没有生产单状态）永远不显示——这是渲染层与测试共用的唯一判据。
 */
export function isRunChipVisible(mode: RunChipMode, state: RunState | null | undefined): boolean {
  if (state === null || state === undefined) return false
  if (mode === 'off') return false
  if (mode === 'active') return state.status === 'running' || state.status === 'paused'
  return true
}
