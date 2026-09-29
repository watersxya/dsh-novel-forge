import fs from 'node:fs';
const B = 'H:\\novels\\还债疯了\\第003章_右手不是我的.new.md';
const t = fs.readFileSync(B, 'utf8');
let l = t.replace(/\r\n/g, '\n').split('\n');
if (/^#/.test(l[0].trim())) l = l.slice(1);
const ps = l.map((s) => s.trim()).filter(Boolean);
ps.forEach((p, i) => {
  const h = p.slice(0, 2);
  if (['那叠', '它翻', '他的', '识海', '这回', '林安'].includes(h)) console.log(i, h, '|', p.slice(0, 22));
});
