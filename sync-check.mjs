// 对比本地第 1–58 章与番茄线上基线，找出差异章
import fs from 'node:fs';
import path from 'node:path';
const LOCAL = 'H:\\novels\\还债疯了';
const ONLINE = 'H:\\novels\\_番茄线上正文_20260921';
const proj = JSON.parse(fs.readFileSync(path.join(LOCAL, 'novel-project.json'), 'utf8'));
const norm = (f) => {
  if (!fs.existsSync(f)) return null;
  return fs
    .readFileSync(f, 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
};
const diffs = [];
let same = 0;
let missing = 0;
for (const ch of proj.chapters) {
  if (!ch.file || ch.no > 58) continue;
  const a = norm(path.join(ONLINE, ch.file));
  const b = norm(path.join(LOCAL, ch.file));
  if (a === null) {
    missing++;
    continue;
  }
  if (a === b) same++;
  else {
    const A = a.split('\n');
    const B = b.split('\n');
    const diffN = Math.abs(A.length - B.length) + A.filter((x, i) => B[i] !== x).length;
    diffs.push({ no: ch.no, title: ch.title, onlineParas: A.length, localParas: B.length, onlineChars: a.length, localChars: b.length });
  }
}
console.log(`第 1–58 章：完全一致 ${same} ｜有差异 ${diffs.length} ｜线上缺失 ${missing}`);
if (diffs.length) {
  console.log('\n有差异的章：');
  for (const d of diffs.slice(0, 20)) console.log(`  第${d.no}章《${d.title}》 线上${d.onlineParas}段/${d.onlineChars}字  本地${d.localParas}段/${d.localChars}字`);
}
fs.writeFileSync('sync-check.json', JSON.stringify({ same, diffs, missing }, null, 1), 'utf8');
