import fs from 'node:fs';
import path from 'node:path';
const DIR = 'H:\\novels\\还债疯了';
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));

const agg = {};
let total = 0;
const perChapter = [];
for (const ch of proj.chapters) {
  if (!ch.file || ch.no > 58) continue;
  const raw = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  if (lines[0] && /^#/.test(lines[0].trim())) lines = lines.slice(1);
  const paras = lines.map((s) => s.trim()).filter(Boolean);
  const heads = paras.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  total += heads.length;
  const c = {};
  for (const h of heads) {
    agg[h] = (agg[h] || 0) + 1;
    c[h] = (c[h] || 0) + 1;
  }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  perChapter.push({ no: ch.no, paras: heads.length, top: top[0], topN: top[1], topShare: +(top[1] / heads.length).toFixed(3) });
}

const top20 = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('1-58 章段首 2 字前缀总览（总段落 ' + total + '）');
for (const [h, n] of top20) console.log(`  「${h}」 ${n} 次  ${((n / total) * 100).toFixed(1)}%`);

// 剔除最高频前缀（通常是主角名）后的同构率
const lead = top20[0][0];
let noLeadRepeat = 0;
let noLeadTotal = 0;
for (const ch of proj.chapters) {
  if (!ch.file || ch.no > 58) continue;
  const raw = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  if (lines[0] && /^#/.test(lines[0].trim())) lines = lines.slice(1);
  const heads = lines
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  noLeadTotal += heads.length;
  noLeadRepeat += Object.values(heads.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {})).filter((v) => v >= 3).length &&
    Object.values(heads.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {})).reduce((s, v) => s + (v >= 3 ? v : 0), 0);
}
console.log('\n剔除「' + lead + '」后，段首重复(>=3次)覆盖率：', ((noLeadRepeat / noLeadTotal) * 100).toFixed(1) + '%');

console.log('\n各章「最高频段首」占该章段落比 Top 20：');
for (const r of perChapter.sort((a, b) => b.topShare - a.topShare).slice(0, 20)) {
  console.log(`  第${r.no}章  段${r.paras}  「${r.top}」${r.topN} 次  = ${(r.topShare * 100).toFixed(0)}%`);
}
