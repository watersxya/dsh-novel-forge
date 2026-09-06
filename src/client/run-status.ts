/**
 * 运行状态芯片：固定在页面顶部的「小说工坊生成状态」小徽标。
 * 轮询 /run/status，实时显示 生成中/暂停/完成/停止/出错 + 当前章号；
 * 点击可打开/关闭小说工坊面板。独立 DOM 注入，不触碰主面板逻辑，挂载失败静默降级。
 */
import type { NovelApi } from './api.ts'
import type { PanelController } from './panel/controller.ts'
import type { RunState } from '../protocol.ts'

const REFRESH_MS = 4000

/** 各状态配色。 */
const STATUS_COLOR: Record<string, string> = {
  running: '#16a34a',
  paused: '#b45309',
  done: '#0284c7',
  stopped: '#64748b',
  error: '#dc2626',
}

/** 状态文案。 */
function label(s: RunState): string {
  const no = s.currentNo
  switch (s.status) {
    case 'running': return `⏳ 小说工坊 生成中 · 第${no}章`
    case 'paused': return `⏸ 小说工坊 已暂停 · 第${no}章`
    case 'done': return `✓ 小说工坊 批完成 ${s.startNo}–${s.endNo}`
    case 'stopped': return `⏹ 小说工坊 已停止 · 第${no}章`
    case 'error': return `⚠ 小说工坊 出错 · 第${no}章`
    default: return '小说工坊'
  }
}

/** 生成一个固定顶部的状态芯片并开始轮询。返回 dispose。 */
export function mountRunStatus(controller: PanelController, api: NovelApi): () => void {
  const chip = document.createElement('div')
  chip.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:14px',
    'z-index:2147483000',
    'display:none',
    'align-items:center',
    'gap:6px',
    'max-width:320px',
    'padding:5px 12px',
    'border-radius:999px',
    'font-size:12px',
    'font-weight:600',
    'font-family:inherit',
    'color:#fff',
    'cursor:pointer',
    'box-shadow:0 2px 12px rgba(0,0,0,.35)',
    'backdrop-filter:blur(6px)',
    'user-select:none',
    'white-space:nowrap',
  ].join(';')
  chip.setAttribute('role', 'button')
  chip.setAttribute('title', '小说工坊生成状态（点击打开工坊）')
  chip.addEventListener('click', () => { controller.toggle() })
  document.body.appendChild(chip)

  let disposed = false
  let timer: number | undefined

  const render = (s: RunState | null): void => {
    if (s === null) {
      chip.style.display = 'none'
      return
    }
    const col = STATUS_COLOR[s.status] ?? 'var(--nf-accent, #d97706)'
    let text = label(s)
    if (s.status === 'running' && s.stats.error > 0) text += ` · ⚠×${s.stats.error}`
    chip.style.display = 'flex'
    chip.style.background = col
    chip.textContent = text
  }

  const tick = async (): Promise<void> => {
    if (disposed) return
    try {
      const s = await api.runStatus()
      render(s)
    } catch { /* best-effort */ }
    if (!disposed) timer = window.setTimeout(() => { void tick() }, REFRESH_MS)
  }

  void tick()

  return () => {
    disposed = true
    if (timer !== undefined) window.clearTimeout(timer)
    chip.remove()
  }
}
