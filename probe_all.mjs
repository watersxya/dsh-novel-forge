import fs from 'node:fs';
const B = 'H:\\novels\\还债疯了\\第003章_右手不是我的.new.md';
const t = fs.readFileSync(B, 'utf8');
let l = t.replace(/\r\n/g, '\n').split('\n');
if (/^#/.test(l[0].trim())) l = l.slice(1);
const ps = l.map((s) => s.trim()).filter(Boolean);
console.log('paras', ps.length);
ps.forEach((p, i) => {
  if (/^[\u201C\u300C"]/.test(p)) return;
  console.log(i, '|', p.slice(0, 16));
});
