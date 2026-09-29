// 第13章比喻收口：15 个标记 → ≤12
import fs from 'node:fs';
const F = 'H:\\novels\\还债疯了\\第013章_木屑大战.md';
const E = [
  ['拖木头的人却像是从这堵墙里蒸发了。', '拖木头的人却没了踪影。'],
  ['这树看着不像树，更像一坨长了獠牙的腐肉。', '这树早就不是树了，是一坨长了獠牙的腐肉。'],
  ['小腿上有一道从膝盖延伸到脚踝的深紫色淤痕，像一条蜿蜒的蛇印在皮肤上。', '小腿上有一道从膝盖延伸到脚踝的深紫色淤痕，蜿蜒着贴在皮肤上。'],
];
let n = 0;
for (const [o, w] of E) {
  const t = fs.readFileSync(F, 'utf8');
  const c = t.split(o).length - 1;
  if (c !== 1) { console.log(`✗ 出现 ${c} 次：${o.slice(0, 20)}…`); continue; }
  fs.writeFileSync(F, t.replace(o, w), 'utf8');
  n++;
}
console.log(`完成 ${n}/${E.length} 处`);
