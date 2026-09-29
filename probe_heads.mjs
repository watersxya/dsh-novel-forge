import fs from 'node:fs';
const A = 'H:\\novels\\还债疯了\\第003章_右手不是我的.md';
const B = 'H:\\novels\\还债疯了\\第003章_右手不是我的.new.md';
const f = (t) => {
  let l = t.replace(/\r\n/g, '\n').split('\n');
  if (/^#/.test(l[0].trim())) l = l.slice(1);
  const ps = l.map((s) => s.trim()).filter(Boolean);
  const N = ps.filter((p) => !/^[\u201C\u300C"]/.test(p));
  const c = {};
  for (const p of N) { const h = p.slice(0, 2); c[h] = (c[h] || 0) + 1; }
  return { n: N.length, c };
};
const ra = fs.readFileSync(A, 'utf8');
const rb = fs.readFileSync(B, 'utf8');
console.log('A', JSON.stringify(f(ra)));
console.log('B', JSON.stringify(f(rb)));
console.log('B first paras:');
let l = rb.replace(/\r\n/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
l.forEach((p, i) => { if (!/^[\u201C\u300C"]/.test(p)) console.log(i, p.slice(0, 18)); });
