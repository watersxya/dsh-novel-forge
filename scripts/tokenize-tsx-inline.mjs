/**
 * One-shot migration: replace numeric inline style literals in TSX panel
 * components with unified --nf-* token references.
 *  - fontSize: 9..12.5 -> var(--nf-fs-12), 13..15.5 -> var(--nf-fs-14),
 *    16/17 -> 16, 18 -> 18, 20/22/24 kept.
 *  - padding/gap: numeric px -> var(--nf-space-N) (same snap table as CSS).
 *  - borderRadius: -> var(--nf-radius-N).
 *  - Structural sizes (width/height/minWidth/minHeight/margin/top/right…)
 *    are LEFT UNTOUCHED — they are content/layout sizes, not style tokens.
 * Variable references (fontSize: editorFontSize etc.) are never matched.
 */
import fs from 'node:fs'
import path from 'node:path'

const FONT = { 9: 12, 10: 12, 10.5: 12, 11: 12, 11.5: 12, 12: 12, 12.5: 12, 13: 14, 13.5: 14, 14: 14, 15: 14, 15.5: 14, 16: 16, 17: 16, 18: 18, 20: 20, 22: 22, 24: 24, 34: 34, 42: 42 }
const SPACE = { 1: 2, 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 11: 12, 12: 12, 13: 14, 14: 14, 15: 16, 16: 16, 17: 18, 18: 18, 19: 20, 20: 20, 21: 24, 22: 24, 23: 24, 24: 24, 25: 24, 26: 24, 27: 28, 28: 28, 29: 28, 30: 32, 31: 32, 32: 32, 33: 32, 34: 34, 36: 34, 38: 38, 40: 40, 48: 48 }
const RADIUS = { 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 12: 12, 14: 14, 16: 16, 18: 16, 20: 20, 22: 22, 999: 999 }

function collectTsx(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) collectTsx(p, out)
    else if (ent.name.endsWith('.tsx')) out.push(p)
  }
  return out
}
const files = collectTsx(path.resolve(process.cwd(), 'src/client'), [])
const stats = {}
const skipped = []

function snap(value, map, label) {
  const n = Number(value)
  const tier = map[n]
  if (tier === undefined) { skipped.push(label + ':' + value); return null }
  stats[label] = (stats[label] ?? 0) + 1
  return String(tier)
}

for (const fp of files) {
  let src = fs.readFileSync(fp, 'utf8')
  let changed = false
  src = src.replace(/fontSize: (\d+(?:\.\d+)?)(?=\s*[,}])/g, (m, v) => {
    const t = snap(v, FONT, 'font')
    if (t === null) return m
    changed = true
    return "fontSize: 'var(--nf-fs-" + t + ")'"
  })
  src = src.replace(/\b(padding|gap): (\d+(?:\.\d+)?)(?=\s*[,}])/g, (m, prop, v) => {
    if (Number(v) === 0) return m
    const t = snap(v, SPACE, prop)
    if (t === null) return m
    changed = true
    return prop + ": 'var(--nf-space-" + t + ")'"
  })
  src = src.replace(/borderRadius: (\d+(?:\.\d+)?)(?=\s*[,}])/g, (m, v) => {
    const t = snap(v, RADIUS, 'radius')
    if (t === null) return m
    changed = true
    return "borderRadius: 'var(--nf-radius-" + t + ")'"
  })
  if (changed) {
    fs.writeFileSync(fp, src, 'utf8')
    console.log('updated', path.relative(process.cwd(), fp))
  }
}
console.log('counts:', JSON.stringify(stats, null, 2))
console.log('skipped (' + skipped.length + '):', skipped.slice(0, 80).join(' | '))
