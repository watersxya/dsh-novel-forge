// 体检门槛判定：对指定章号跑 7 项门槛，输出 pass/fail 明细
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('audit-redlines.json', 'utf8')).filter((r) => !r.error);
const all = rows.filter((r) => r.no <= 58);
const avg = (k) => all.reduce((s, r) => s + r[k], 0) / all.length;

const GATES = [
  ['headRepeat', '叙述段起句同构率', '<=', 0.2],
  ['similePer1k', '比喻/千字', '<=', 3.0],
  ['sysDialogCharRatio', '播报字数占比', '<=', 0.045],
  ['humanDialogCharRatio', '人物对话字数占比', '>=', 0.15],
  ['narShortRatio', '叙述段短段占比', '<=', 0.35],
  ['tplPer1k', '模板句/千字', '<=', 2.5],
  ['cushionPer1k', '缓冲副词/千字', '<=', 1.0],
];

const nos = process.argv.slice(2).map(Number).filter(Number.isInteger);
const targets = nos.length ? rows.filter((r) => nos.includes(r.no)) : rows;
const results = [];
for (const r of targets) {
  const fails = [];
  for (const [k, label, op, lim] of GATES) {
    const v = r[k];
    const ok = op === '<=' ? v <= lim : v >= lim;
    if (!ok) fails.push({ key: k, label, value: v, limit: lim, baseline: +avg(k).toFixed(3) });
  }
  results.push({ no: r.no, title: r.title, chars: r.chars, pass: fails.length === 0, fails });
}
const passN = results.filter((r) => r.pass).length;
console.log(`判定：${passN}/${results.length} 通过`);
for (const r of results) {
  if (r.pass) {
    console.log(`  ✅ 第${r.no}章《${r.title}》 ${r.chars}字`);
  } else {
    console.log(`  ❌ 第${r.no}章《${r.title}》 ${r.chars}字 —— ${r.fails.map((f) => `${f.label}=${f.value}(限${f.limit} 基线${f.baseline})`).join('；')}`);
  }
}
fs.writeFileSync('gate-result.json', JSON.stringify(results, null, 1), 'utf8');
