/**
 * Browser-half entry for the dsh-novel-forge plugin — runs inside the dsh web
 * GUI. Registers the sidebar entry row and the workbench panel. DOM mounting
 * problems are logged, never thrown — the web shell fails the whole boot when
 * a plugin apply throws.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { NovelApi } from './api.ts'
import { mountPanel } from './mount.tsx'
import { PanelController } from './panel/controller.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'

/** Required services (fiber inject waiting). */
export const inject = ['slots', 'locale']

/**
 * Mount the novel-forge workbench.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new PanelController()
  const api = new NovelApi()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, api))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-novel-forge] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-novel-forge: ui mounts')
}
