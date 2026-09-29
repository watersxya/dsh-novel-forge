// 第17章段首微调：林安×11 → ×7
import fs from 'node:fs';
const F = 'H:\\novels\\还债疯了\\第017章_木偶围城.md';
const E = [
  ['林安之低头看掌心。木牌上的字在动', '他低头看掌心。木牌上的字在动'],
  ['林安之侧身躲过第一枪。', '他侧身躲过第一枪。'],
  ['林安之的身体想往西跑，腿却开始打摆子。', '他的身体想往西跑，腿却开始打摆子。'],
  ['林安之跑出西门，身后城墙轰然合拢。', '他跑出西门，身后城墙轰然合拢。'],
];
let n = 0;
for (const [o, w] of E) {
  const t = fs.readFileSync(F, 'utf8');
  const c = t.split(o).length - 1;
  if (c !== 1) { console.log(`✗ 出现 ${c} 次：${o.slice(0, 18)}…`); continue; }
  fs.writeFileSync(F, t.replace(o, w), 'utf8');
  n++;
}
console.log(`完成 ${n}/${E.length} 处`);
