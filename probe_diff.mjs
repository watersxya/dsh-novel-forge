import fs from 'node:fs';
const B = 'H:\\novels\\还债疯了\\第003章_右手不是我的.new.md';
const src = 'J:\\harness\\plugins\\novel-forge-alpha\\stage_c_ref.md';
for (const [tag, path] of [['DST', B], ['SRC', src]]) {
  const t = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  let l = lines;
  if (/^#/.test(l[0].trim())) l = l.slice(1);
  const ps = l.map((s) => s.trim()).filter(Boolean);
  console.log(tag, 'paras', ps.length);
  console.log(tag, 'sleep', ps.findIndex((p) => p.includes('的床腿，正在变成')));
  console.log(tag, 'shut-eye', ps.findIndex((p) => p.includes('闭上眼，手指在膝盖上')));
  console.log(tag, 'comment', ps.findIndex((p) => p.includes('刚想开口吐槽')));
  console.log(tag, 'zheda', ps.findIndex((p) => p.includes('睡觉的床腿')));
}
