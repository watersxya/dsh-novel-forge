// Durable local fix: schemastery@3.18.x from npm has no "exports" field, which
// breaks tsx/Node ESM resolution when dsh loads novel-forge's lib/index.js.
// pnpm re-installs can overwrite the manual node_modules patch, so this script
// re-applies it on every `pnpm install` (postinstall).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)))
const pnpmDir = join(root, 'node_modules', '.pnpm')

if (!existsSync(pnpmDir)) {
  console.warn('[dsh-novel-forge] no node_modules/.pnpm found; skip schemastery patch')
  process.exit(0)
}

const candidates = readdirSync(pnpmDir)
  .filter((name) => name.startsWith('schemastery@'))
  .map((name) => join(pnpmDir, name, 'node_modules', 'schemastery', 'package.json'))
  .filter((file) => existsSync(file))

if (candidates.length === 0) {
  console.warn('[dsh-novel-forge] schemastery package not found; skip patch')
  process.exit(0)
}

let patched = 0
for (const file of candidates) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (pkg.exports) {
    console.log(`[dsh-novel-forge] schemastery exports already present: ${file}`)
    continue
  }
  pkg.exports = {
    '.': {
      types: './lib/index.d.ts',
      import: './lib/index.mjs',
      require: './lib/index.cjs',
    },
    './package.json': './package.json',
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  console.log(`[dsh-novel-forge] patched schemastery exports: ${file}`)
  patched++
}

if (patched === 0) console.log('[dsh-novel-forge] schemastery patch: nothing to do')
