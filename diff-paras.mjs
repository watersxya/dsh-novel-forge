import fs from 'node:fs';
const a = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
const b = fs.readFileSync(process.argv[3], 'utf8').replace(/\r\n/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
const setB = new Set(b);
const onlyA = a.filter((x) => !setB.has(x));
const setA = new Set(a);
const onlyB = b.filter((x) => !setA.has(x));
console.log('文件A段落', a.length, '｜文件B段落', b.length);
console.log('仅A有', onlyA.length, '｜仅B有', onlyB.length, '｜相同', a.length - onlyA.length);
if (onlyA.length) {
  console.log('\n--- 仅 A 有（前 5 段）---');
  for (const x of onlyA.slice(0, 5)) console.log('  ' + x.slice(0, 80));
}
if (onlyB.length) {
  console.log('\n--- 仅 B 有（前 5 段）---');
  for (const x of onlyB.slice(0, 5)) console.log('  ' + x.slice(0, 80));
}
