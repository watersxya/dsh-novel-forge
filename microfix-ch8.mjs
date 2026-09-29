// 第8章段首收口：同构 0.220 → ≤0.20（林安×8 → ×6）
import fs from 'node:fs';
const F = 'H:\\novels\\还债疯了\\第008章_小拇指危机.new.md';
const E = [
  ['林安之松开右手，走到床头', '他松开右手，走到床头'],
  ['林安之在小欠的指引下，用一个多小时', '他在小欠的指引下，用一个多小时'],
];
let n = 0;
for (const [o, w] of E) {
  const t = fs.readFileSync(F, 'utf8');
  const c = t.split(o).length - 1;
  if (c !== 1) { console.log(`✗ 出现 ${c} 次：${o.slice(0, 16)}…`); continue; }
  fs.writeFileSync(F, t.replace(o, w), 'utf8');
  n++;
}
console.log(`完成 ${n}/${E.length} 处`);
