/**
 * 运行状态芯片：固定在页面顶部的「小说工坊生成状态」小徽标。
 * 轮询 /run/status，实时显示 生成中/暂停/完成/停止/出错 + 当前章号；
 * 点击可打开/关闭小说工坊面板。独立 DOM 注入，不触碰主面板逻辑，挂载失败静默降级。
 *
 * P0 重写说明（原实现的三个问题）：
 *   1. 整块背景染状态色 + 固定白字 → 浅色主题下「白字配亮底」对比度崩坏。
 *      现在改为「玻璃底 + 主题前景色文字 + 左侧状态色点」，状态只由色点承载，
 *      文字永远跟随主题，任何深浅色下都可读。
 *   2. 样式写死在 JS 的 inline style 里，切主题纹丝不动。
 *      现在改用 CSS Module class，配色走 --nf-chip-* 令牌，
 *      由 body[data-ds-dark-theme] 跟随宿主深浅色。
 *   3. role="button" 却没有 tabindex、没有键盘处理，键盘用户完全用不了。
 *      现在补 tabindex + Enter/Space 激活 + aria-label/live。
 */
import type { NovelApi } from './api.ts'
import type { PanelController } from './panel/controller.ts'
import type { RunState } from '../protocol.ts'
import css from './panel/panel.module.css'

const REFRESH_MS = 4000

/** 状态文案。状态语义由左侧色点承载，这里不再放 emoji（避免与色点重复表意）。 */
function label(s: RunState): string {
  const no = s.currentNo
  switch (s.status) {
    case 'running': return `小说工坊 生成中 · 第${no}章`
    case 'paused': return `小说工坊 已暂停 · 第${no}章`
    case 'done': return `小说工坊 批完成 ${s.startNo}–${s.endNo}`
    case 'stopped': return `小说工坊 已停止 · 第${no}章`
    case 'error': return `小说工坊 出错 · 第${no}章`
    default: return '小说工坊'
  }
}

/** 生成一个固定顶部的状态芯片并开始轮询。返回 dispose。 */
export function mountRunStatus(controller: PanelController, api: NovelApi): () => void {
  const chip = document.createElement('div')
  chip.className = css.runChip
  chip.setAttribute('role', 'button')
  // P0: role="button" 必须可聚焦、可键盘激活，否则对键盘/读屏用户等同不存在。
  chip.setAttribute('tabindex', '0')
  chip.setAttribute('title', '小说工坊生成状态（点击打开工坊）')
  // 状态是异步轮询出来的，用 aria-live 让读屏用户也能感知变化。
  chip.setAttribute('aria-live', 'polite')

  const dot = document.createElement('span')
  dot.className = css.runChipDot
  // 纯装饰，颜色信息已由文字表达，不要让读屏重复播报。
  dot.setAttribute('aria-hidden', 'true')

  const text = document.createElement('span')
  text.className = css.runChipText

  chip.append(dot, text)

  const toggle = (): void => { controller.toggle() }

  // 自由拖拽 + 位置记忆（与 AI 进度浮窗一致）
  const POS_KEY = 'dsh-novel-forge.runChip.pos'
  let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0
  const readPos = (): { x: number; y: number } | null => {
    try { const p = window.localStorage.getItem(POS_KEY); return p === null ? null : JSON.parse(p) as { x: number; y: number } } catch { return null }
  }
  const writePos = (x: number, y: number): void => {
    try { window.localStorage.setItem(POS_KEY, JSON.stringify({ x, y })) } catch { /* ignore */ }
  }
  const clampX = (x: number): number => Math.max(0, Math.min(Math.max(0, window.innerWidth - 40), x))
  const clampY = (y: number): number => Math.max(0, Math.min(Math.max(0, window.innerHeight - 40), y))
  const applyPos = (x: number, y: number): void => {
    chip.style.left = clampX(x) + 'px'
    chip.style.top = clampY(y) + 'px'
    chip.style.right = 'auto'
  }
  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY
    ox = chip.offsetLeft; oy = chip.offsetTop
    try { chip.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  })
  chip.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - sx, dy = e.clientY - sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true
    if (moved) {
      applyPos(ox + dx, oy + dy)
      writePos(chip.offsetLeft, chip.offsetTop)
    }
  })
  const endDrag = (): void => { dragging = false }
  chip.addEventListener('pointerup', endDrag)
  chip.addEventListener('pointercancel', endDrag)
  // 拖拽后松开不触发开合
  chip.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved = false; return }
    toggle()
  })
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      toggle()
    }
  })

  document.body.appendChild(chip)

  // 恢复上次拖拽位置（若曾移动过）
  const saved = readPos()
  if (saved !== null) applyPos(saved.x, saved.y)

  let disposed = false
  let timer: number | undefined

  const render = (s: RunState | null): void => {
    if (s === null) {
      chip.dataset.visible = 'false'
      return
    }
    let body = label(s)
    if (s.status === 'running' && s.stats.error > 0) body += ` · ×${s.stats.error}`
    text.textContent = body
    chip.dataset.status = s.status
    chip.dataset.visible = 'true'
    chip.setAttribute('aria-label', body)
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
