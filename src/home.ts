/**
 * DeepSeek Harness home resolution for this plugin.
 *
 * Precedence mirrors `resolveDshHome` from `@deepseek-ai/dsh-home-paths`:
 * `$DSH_HOME` when set and non-blank, else `~/.dsh`. That package's remaining
 * input — the harness's own explicit override — is not reachable from a
 * plugin, so this reproduces the part a plugin can observe instead of taking
 * a dependency whose published range tracks a different harness line.
 *
 * State files must resolve through here rather than `~/.dsh` directly: the
 * desktop build points `DSH_HOME` at its own root, and a hardcoded path made
 * both builds share one store and lose it whenever that directory was cleaned.
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Absolute Harness home for this process.
 * @returns the normalized home directory.
 */
export function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  return resolve(configured !== undefined && configured.length > 0 ? configured : join(homedir(), '.dsh'))
}

/**
 * Join path segments onto the Harness home.
 * @param segments - path segments appended to the home.
 * @returns the normalized absolute joined path.
 */
export function dshHomePath(...segments: string[]): string {
  return join(dshHome(), ...segments)
}
