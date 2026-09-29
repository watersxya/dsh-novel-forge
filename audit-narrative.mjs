import fs from 'node:fs';
import path from 'node:path';
const DIR = 'H:\\novels\\还债疯了';
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const Q = /^[\u201C\u300C"]/;

let allRep = 0, allTot = 0, narRep = 0, narTot = 0, dlgParas = 0, leadN = 0;
const rows = [];
for (const ch of proj.chapters) {
  if (!ch.file || ch.no > 58) continue;
  const raw = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  if (lines[0] && /^#/.test(lines[0].trim())) lines = lines.slice(1);
  const paras = lines.map((s) => s.trim()).filter(Boolean);

  const heads = (ps) => ps.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  const repOf = (hs) => {
    const c = hs.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {});
    return Object.values(c).reduce((s, v) => s + (v >= 3 ? v : 0), 0);
  };

  const nars = paras.filter((p) => !Q.test(p));
  const hsAll = heads(paras);
  const hsNar = heads(nars);

  allRep += repOf(hsAll); allTot += hsAll.length;
  narRep += repOf(hsNar); narTot += hsNar.length;
  dlgParas += paras.length - nars.length;
  leadN += hsAll.filter((h) => h === '林安').length;

  rows.push({ no: ch.no, nar: hsNar.length, narRep: +(repOf(hsNar) / hsNar.length).toFixed(3) });
}

console.log('1-58 章段落构成：总段落', allTot, '｜以引号开头（对话行）', dlgParas, `(${((dlgParas / allTot) * 100).toFixed(1)}%)`, '｜叙述段', narTot, `(${((narTot / allTot) * 100).toFixed(1)}%)`);
console.log('');
console.log('段首同构率（重复 >=3 次的段首前缀覆盖率）：');
console.log('  全部段落          ', ((allRep / allTot) * 100).toFixed(1) + '%');
console.log('  仅叙述段（剔除对话）', ((narRep / narTot) * 100).toFixed(1) + '%');
console.log('  其中「林安」起句    ', ((leadN / allTot) * 100).toFixed(1) + '%');
console.log('');
console.log('叙述段段首同构率最高的 15 章：');
for (const r of rows.sort((a, b) => b.narRep - a.narRep).slice(0, 15)) {
  console.log(`  第${r.no}章  叙述段${r.nar}  同构率 ${(r.narRep * 100).toFixed(0)}%`);
}
