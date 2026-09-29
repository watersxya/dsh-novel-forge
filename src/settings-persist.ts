/**
 * Config-patch persistence for the novel-forge plugin.
 *
 * Historically the plugin only knew how to write through the host settings
 * service (`ctx.settings.update`) and treated the section's name as a constant.
 * From Harness 0.2 the section is inferred from this plugin's exported `Config`
 * and addressed by the **entry id** the Loader assigned — which the plugin does
 * not control. A wrong id makes every save fail, so this module keeps the split
 * explicit: apply the patch to the live config, then try to persist it, and
 * report (rather than throw) when the host cannot.
 */

/** Minimal structural view of the host settings service this plugin touches. */
export interface SettingsLike {
  /** Persist one section patch; absent on hosts that expose read APIs only. */
  update?: (ns: string, patch: Record<string, unknown>) => Promise<unknown>
  /** Live section registry; absence means the host cannot enumerate sections. */
  describe?: () => unknown
}

/** Where a config patch ended up. */
export interface ConfigPersistResult {
  /** The merged config (live in memory regardless of persistence). */
  config: Record<string, unknown>
  /**
   * Why persistence did not happen, when it did not. Callers surface this to the
   * author: a save that silently evaporates on restart is worse than a loud one.
   */
  settingsWarning?: string
}

/**
 * The Loader entry id the settings section is addressed by.
 * @param ctx - plugin context (structurally typed: only `fiber.entry.options.id` is read).
 * @returns the entry id, or undefined when the host exposes none.
 */
export function novelSettingsNamespace(ctx: unknown): string | undefined {
  const id = (ctx as { fiber?: { entry?: { options?: { id?: unknown } } } } | undefined)
    ?.fiber?.entry?.options?.id
  return typeof id === 'string' && id.trim() !== '' ? id : undefined
}

/**
 * Pick the settings section to write through.
 *
 * The entry id is authoritative; the declared legacy name is used only when the
 * host actually registered a section under it. Guessing an id is never allowed:
 * a write to a wrong section would persist another plugin's config.
 * @param settings - the settings service, when present.
 * @param entryNs - entry id resolved from the context, when available.
 * @param legacyNs - this plugin's declared section name (0.1.x wiring).
 * @returns the section id to write to, or undefined when none is addressable.
 */
export function resolveSettingsTarget(
  settings: SettingsLike | undefined,
  entryNs: string | undefined,
  legacyNs: string,
): string | undefined {
  const describe = settings?.describe
  if (settings?.update === undefined) return undefined
  if (describe === undefined) return entryNs
  try {
    const rows = describe() as Array<{ ns?: unknown }> | undefined
    const names = (rows ?? []).map(row => row?.ns).filter((ns): ns is string => typeof ns === 'string')
    if (entryNs !== undefined && names.includes(entryNs)) return entryNs
    return names.includes(legacyNs) ? legacyNs : undefined
  } catch {
    // A host that cannot be queried is assumed to accept the entry id it gave us.
    return entryNs
  }
}

/**
 * Merge one patch into the live config and persist it when the host allows.
 *
 * Never throws for a persistence failure: the edit is valid and already applied,
 * so failing the request would lose it and misreport a working save as an error.
 * @param current - the config as currently resolved.
 * @param patch - the subset to merge (`undefined` values are ignored by callers).
 * @param settings - the settings service, when present.
 * @param entryNs - entry id resolved from the context, when available.
 * @param legacyNs - this plugin's declared section name.
 * @returns the merged config plus a warning when it could not be persisted.
 */
export async function persistConfigPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  settings: SettingsLike | undefined,
  entryNs: string | undefined,
  legacyNs: string,
): Promise<ConfigPersistResult> {
  const next = { ...current, ...patch }
  const target = resolveSettingsTarget(settings, entryNs, legacyNs)
  if (settings?.update === undefined) {
    return { config: next, settingsWarning: '宿主未提供 settings.update，配置只在本次进程内生效。' }
  }
  if (target === undefined) {
    // List what the host did register: without it the author only sees "not
    // registered" and cannot tell a wrong entry id from a missing section.
    let registered = '不可枚举'
    try {
      const rows = settings.describe?.() as Array<{ ns?: unknown }> | undefined
      registered = (rows ?? []).map(row => row?.ns).filter((ns): ns is string => typeof ns === 'string').join('、') || '（空）'
    } catch { /* keep the neutral placeholder */ }
    return { config: next, settingsWarning: `宿主 settings 未登记本插件的配置段（entry id「${entryNs ?? '未知'}」，已登记的段：${registered}），配置只在本次进程内生效。` }
  }
  try {
    await settings.update(target, patch)
    return { config: next }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { config: next, settingsWarning: `写入宿主设置段「${target}」失败：${detail}；配置只在本次进程内生效。` }
  }
}
