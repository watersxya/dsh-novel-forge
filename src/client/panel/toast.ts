/**
 * Toast — 完成时刻的轻确认（R3 微交互）。
 *
 * 函数式挂载到 document.body（与 run-status 芯片同一套模式：CSS Module 类 +
 * 自带令牌 + body[data-ds-dark-theme] 跟随宿主深浅色）。不依赖 React。
 *
 * 接入点：NovelPanel.pushProgress(kind='done'|'error') 自动弹 toast，
 * 全站「已保存 / 生成完毕 / 审稿完成」等反馈统一获得确认时刻。
 * 约束：最多同时 3 条（超过丢弃最旧），reduced-motion 下无入场动画（CSS 兜底）。
 */
import css from './panel.module.css'

let host: HTMLDivElement | null = null
const LIVE_MAX = 3
const TTL = 2800

function ensureHost(): HTMLDivElement {
  if (host !== null && host.isConnected) return host
  host = document.createElement('div')
  host.className = css.nfToastHost ?? 'nf-toast-host'
  document.body.appendChild(host)
  return host
}

/** 弹一条 toast。kind: 'done'（翡翠勾）/ 'error'（红叉）/ 'info'（中性）。 */
export function showToast(text: string, kind: 'done' | 'error' | 'info' = 'done'): void {
  try {
    const root = ensureHost()
    // 超量丢弃最旧
    while (root.children.length >= LIVE_MAX) root.firstElementChild?.remove()

    const el = document.createElement('div')
    el.className = css.nfToast ?? 'nf-toast'
    el.setAttribute('data-kind', kind)
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')

    const tick = document.createElement('span')
    tick.className = css.nfToastTick ?? 'nf-toast-tick'
    tick.textContent = kind === 'error' ? '✕' : '✓'
    const label = document.createElement('span')
    label.textContent = text
    el.append(tick, label)
    root.appendChild(el)

    window.setTimeout(() => {
      el.classList.add(css.nfToastOut ?? 'nf-toast-out')
      window.setTimeout(() => el.remove(), 320)
    }, TTL)
  } catch { /* DOM 不可用时静默降级（极端宿主环境） */ }
}
