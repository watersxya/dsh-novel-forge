// 第11章比喻收口：11 → 9 个标记
import fs from 'node:fs';
const F = 'H:\\novels\\还债疯了\\第011章_系统漏洞.md';
const E = [
  ['表情像吃了一记闷棍：', '表情僵在那里：'],
  ['他像是被人从店里请到店外又被塞回店里的一把老椅子', '他就是一把被人从店里请到店外又塞回去的老椅子'],
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
