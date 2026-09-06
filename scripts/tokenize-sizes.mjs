/**
 * One-shot migration: replace hardcoded sizes in panel.module.css with the
 * unified --nf-* size tokens (defined on .view/.panel).
 *
 * Conventions (decided with the user):
 *  - font: 12 = secondary text, 14 = primary text, 16+ = headings/hero.
 *    All sub-13 fractional sizes collapse to 12; 13..15.5 collapse to 14.
 *  - spacing / radius: nearest token tier (odd values snap to even tiers).
 *  - control heights: 28 -> --nf-ctrl-s, 32 -> --nf-ctrl-m, 38 -> --nf-ctrl-l.
 *  - structural sizes (covers, dots, bars, widths) are left untouched.
 *
 * Every replacement keeps a px fallback (var(--nf-fs-12, 12px)) so styles
 * used outside .view (e.g. the sidebar entry) still resolve.
 */
import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'src/client/panel/panel.module.css')
let css = fs.readFileSync(file, 'utf8')
const stats = {}
const unmapped = []

const FONT = { 9: 12, 10: 12, 10.5: 12, 11: 12, 11.5: 12, 12: 12, 12.5: 12, 13: 14, 13.5: 14, 14: 14, 15: 14, 15.5: 14, 16: 16, 17: 16, 18: 18, 20: 20, 22: 22, 24: 24, 34: 34, 42: 42 }
const RADIUS = { 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 12: 12, 14: 14, 16: 16, 18: 16, 20: 20, 22: 22, 999: 999 }
const SPACE = { 1: 2, 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 9: 10, 10: 10, 11: 12, 12: 12, 13: 14, 14: 14, 15: 16, 16: 16, 17: 18, 18: 18, 19: 20, 20: 20, 21: 24, 22: 24, 23: 24, 24: 24, 25: 24, 26: 24, 27: 28, 28: 28, 29: 28, 30: 32, 31: 32, 32: 32, 33: 32, 34: 34, 36: 34, 38: 38, 40: 40, 48: 48 }

function snapMap(value, map, label, fallbackOnly) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const tier = map[n]
  if (tier === undefined) {
    unmapped.push(`${label}: ${value}`)
    return null
  }
  stats[label] = (stats[label] ?? 0) + 1
  return `var(--nf-${fallbackOnly}-${tier}, ${value}px)`
}

// --- font-size -----------------------------------------------------------
css = css.replace(/font-size:\s*([\d.]+)px\s*;/g, (m, v) => {
  const r = snapMap(v, FONT, 'font', 'fs')
  return r === null ? m : `font-size: ${r};`
})

// --- border-radius (multi-value aware, px only) --------------------------
css = css.replace(/border-radius:\s*([^;]+);/g, (m, values) => {
  if (values.includes('var(') || values.includes('%') || values.includes('inherit')) return m
  const parts = values.trim().split(/\s+/).map((tok) => {
    const mm = /^([\d.]+)px$/.exec(tok.trim())
    if (mm === null) return tok.trim()
    const r = snapMap(mm[1], RADIUS, 'radius', 'radius')
    return r === null ? tok.trim() : r
  })
  return `border-radius: ${parts.join(' ')};`
})

// --- gap (flex/grid spacing) ----------------------------------------------
css = css.replace(/gap:\s*([\d.]+)px\s*;/g, (m, v) => {
  if (Number(v) === 0) return m
  const r = snapMap(v, SPACE, 'gap', 'space')
  return r === null ? m : `gap: ${r};`
})

// --- padding (multi-value aware, px only; skip var() rows) ----------------
css = css.replace(/padding:\s*([^;]+);/g, (m, values) => {
  if (values.includes('var(') || values.includes('inherit')) return m
  const parts = values.trim().split(/\s+/).map((tok) => {
    const mm = /^([\d.]+)px$/.exec(tok.trim())
    if (mm === null) return tok.trim()
    if (Number(mm[1]) === 0) return '0'
    const r = snapMap(mm[1], SPACE, 'padding', 'space')
    return r === null ? tok.trim() : r
  })
  return `padding: ${parts.join(' ')};`
})

// --- control heights (28/32/38 only; structural heights untouched) --------
css = css.replace(/height:\s*(28|32|38)px\s*;/g, (m, v) => {
  const tier = v === '28' ? 's' : v === '32' ? 'm' : 'l'
  stats['ctrl'] = (stats['ctrl'] ?? 0) + 1
  return `height: var(--nf-ctrl-${tier}, ${v}px);`
})

fs.writeFileSync(file, css, 'utf8')
console.log('replacement counts:', JSON.stringify(stats, null, 2))
console.log('unmapped (' + unmapped.length + '):', unmapped.slice(0, 60).join(' | '))
