import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('audit-redlines.json', 'utf8')).filter((r) => !r.error);
const a = rows.filter((r) => r.no <= 58);
const b = rows.filter((r) => r.no >= 45);
const pct = (n, d) => ((n / d) * 100).toFixed(0) + '%';

const checks = [
  ['段首 2 字同构率 > 0.20', (r) => r.headRepeat > 0.2],
  ['段首 2 字同构率 > 0.35', (r) => r.headRepeat > 0.35],
  ['模板句/千字 > 2.0', (r) => r.tplPer1k > 2.0],
  ['比喻/千字 > 3.0', (r) => r.similePer1k > 3.0],
  ['比喻/千字 > 5.0', (r) => r.similePer1k > 5.0],
  ['短段(<20字)占比 > 0.35', (r) => r.shortRatio > 0.35],
  ['人物对话字数占比 < 0.15', (r) => r.humanDialogCharRatio < 0.15],
  ['系统播报句数 >= 10', (r) => r.quotedSys >= 10],
  ['系统播报句数 >= 20', (r) => r.quotedSys >= 20],
  ['心理直述/千字 > 0.5', (r) => r.mindPer1k > 0.5],
  ['综合风险分 >= 55', (r) => r.risk >= 55],
  ['综合风险分 >= 60', (r) => r.risk >= 60],
];
console.log('阈值命中：1-58章 / 45-151章');
for (const [name, f] of checks) {
  const na = a.filter(f).length;
  const nb = b.filter(f).length;
  console.log(`  ${name.padEnd(26)} ${String(na).padStart(2)}/${a.length} (${pct(na, a.length)})   ${String(nb).padStart(2)}/${b.length} (${pct(nb, b.length)})`);
}
const worst = [...a].sort((x, y) => y.risk - x.risk).slice(0, 8).map((r) => `${r.no}(${r.risk})`).join(' ');
console.log('风险 Top8:', worst);
const worstSim = [...a].sort((x, y) => y.similePer1k - x.similePer1k).slice(0, 8).map((r) => `${r.no}(${r.similePer1k})`).join(' ');
console.log('比喻 Top8:', worstSim);
const worstHead = [...a].sort((x, y) => y.headRepeat - x.headRepeat).slice(0, 8).map((r) => `${r.no}(${r.headRepeat})`).join(' ');
console.log('段首同构 Top8:', worstHead);
const worstSys = [...a].sort((x, y) => y.quotedSys - x.quotedSys).slice(0, 8).map((r) => `${r.no}(${r.quotedSys})`).join(' ');
console.log('播报句数 Top8:', worstSys);
console.log('开篇1-10风险:', a.filter((r) => r.no <= 10).map((r) => `${r.no}:${r.risk}`).join(' '));
