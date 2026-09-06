// Verify every var(--nf-fs/space/radius-N, Xpx) fallback maps to tier N.
import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/client/panel/panel.module.css'), 'utf8')
const FONT = { 9: 12, 10: 12, 10.5: 12, 11: 12, 11.5: 12, 12: 12, 12.5: 12, 13: 14, 13.5: 14, 14: 14, 15: 14, 15.5: 14, 16: 16, 17: 16, 18: 18, 20: 20, 22: 22, 24: 24, 34: 34, 42: 42 }
const RADIUS = { 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 12: 12, 14: 14, 16: 16, 18: 16, 20: 20, 22: 22, 999: 999 }
const SPACE = { 1: 2, 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 11: 12, 12: 12, 13: 14, 14: 14, 15: 16, 16: 16, 17: 18, 18: 18, 19: 20, 20: 20, 21: 24, 22: 24, 23: 24, 24: 24, 25: 24, 26: 24, 27: 28, 28: 28, 29: 28, 30: 32, 31: 32, 32: 32, 33: 32, 34: 34, 36: 34, 38: 38, 40: 40, 48: 48 }
let bad = 0
for (const m of css.matchAll(/var\(--nf-(fs|space|radius)-(\d+), ([\d.]+)px\)/g)) {
  const kind = m[1]
  const tier = Number(m[2])
  const fb = Number(m[3])
  const map = kind === 'fs' ? FONT : kind === 'space' ? SPACE : RADIUS
  if (map[fb] !== tier) {
    bad++
    console.log('MISMATCH', m[0], 'fallback maps to', map[fb], 'but tier is', tier)
  }
}
console.log('fallback mismatches:', bad)
process.exit(bad === 0 ? 0 : 1)
