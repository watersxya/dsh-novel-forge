import fs from 'node:fs';
import path from 'node:path';
const DIR = 'H:\\novels\\还债疯了';
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const no = process.argv[2] || '18';
const ch = proj.chapters.find((c) => String(c.no) === String(no));
const t = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
const re = /像(?!象)|仿佛|好像|如同|似的|宛如/g;
let m;
let i = 0;
while ((m = re.exec(t)) !== null) {
  i++;
  const seg = t.slice(Math.max(0, m.index - 18), m.index + 22).replace(/\n/g, ' / ');
  console.log(String(i).padStart(2) + '. [' + m[0] + ']  …' + seg + '…');
}
const cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
console.log('\n共 ' + i + ' 处 / ' + cn + ' 字 = ' + ((i / cn) * 1000).toFixed(2) + ' 每千字');
console.log('目标 <=2.0 每千字 => 最多 ' + Math.floor((cn / 1000) * 2.0) + ' 处');
