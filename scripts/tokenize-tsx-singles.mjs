// One-shot: convert one-sided spacing inline literals (marginTop etc.) in
// TSX to --nf-space-* token references, matching the CSS snap table.
import fs from 'node:fs'
import path from 'node:path'

const SPACE = { 1: 2, 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 11: 12, 12: 12, 13: 14, 14: 14, 15: 16, 16: 16, 17: 18, 18: 18, 19: 20, 20: 20, 21: 24, 22: 24, 23: 24, 24: 24, 25: 24, 26: 24, 27: 28, 28: 28, 29: 28, 30: 32, 31: 32, 32: 32, 33: 32, 34: 34, 36: 34, 38: 38, 40: 40, 48: 48 }

function collectTsx(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) collectTsx(p, out)
    else if (ent.name.endsWith('.tsx')) out.push(p)
  }
  return out
}
const files = collectTsx(path.resolve(process.cwd(), 'src/client'), [])
let total = 0
const skipped = []
const PROPS = ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
for (const fp of files) {
  let src = fs.readFileSync(fp, 'utf8')
  let changed = false
  for (const prop of PROPS) {
    const re = new RegExp('\\b' + prop + ': (\\d+(?:\\.\\d+)?)(?=\\s*[,}])', 'g')
    src = src.replace(re, (m, v) => {
      const n = Number(v)
      if (n === 0) return m
      const tier = SPACE[n]
      if (tier === undefined) { skipped.push(prop + ':' + v); return m }
      total++
      changed = true
      return prop + ": 'var(--nf-space-" + tier + ")'"
    })
  }
  if (changed) {
    fs.writeFileSync(fp, src, 'utf8')
    console.log('updated', path.relative(process.cwd(), fp))
  }
}
console.log('converted one-sided spacings:', total)
console.log('skipped:', skipped.slice(0, 40).join(' | ') || '(none)')
