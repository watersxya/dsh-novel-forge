// 紧凑状态表：每章一行，直接看出差什么
import fs from 'node:fs';
import path from 'node:path';
import { validate, read, loadChapter } from './validate-lib.mjs';
import { metricsOf, gateFails } from './metrics-lib.mjs';

const DIR = process.argv[2] || 'H:\\novels\\还债疯了';
const onlyNew = process.argv.includes('--new');
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const cands = fs.readdirSync(DIR).filter((f) => f.endsWith('.new.md'));
const set = new Map(cands.map((f) => [Number((f.match(/第(\d+)章/) || [])[1]), f]));

console.log('章  标题                  状态        差什么');
console.log('─'.repeat(100));
let pass = 0;
for (const ch of proj.chapters) {
  if (!ch.file) continue;
  const candFile = set.get(ch.no);
  if (onlyNew && !candFile) continue;
  const origText = read(path.join(DIR, ch.file));
  if (candFile) {
    const candText = read(path.join(DIR, candFile));
    const v = validate(origText, candText);
    const m = metricsOf(candText);
    const gf = gateFails(m);
    const all = [...v.fails, ...gf];
    if (!all.length) {
      pass++;
      console.log(`${String(ch.no).padStart(3)} ${ch.title.padEnd(18)} ✅ 可落盘     同构${m.headRepeat} 比喻${m.similePer1k}`);
    } else {
      console.log(`${String(ch.no).padStart(3)} ${ch.title.padEnd(18)} ❌ ${(v.fails.length ? '保真' : '门槛').padEnd(4)}    ${all.slice(0, 3).join(' ；')}`);
    }
  } else {
    const m = metricsOf(origText);
    const gf = gateFails(m);
    console.log(`${String(ch.no).padStart(3)} ${ch.title.padEnd(18)} ${gf.length ? '⬜ 待改' : '✅ 已达标'}   原稿：同构${m.headRepeat} 比喻${m.similePer1k}`);
  }
}
console.log('─'.repeat(100));
console.log(`候选可落盘：${pass} 章`);
