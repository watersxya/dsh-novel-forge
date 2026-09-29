// 列出一个章文件里的全部比喻，供微调
import fs from 'node:fs';
const f = process.argv[2];
const t = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const re = /像(?!象|样|话)|仿佛|好像|如同|似的|宛如/g;
let m;
let i = 0;
while ((m = re.exec(t)) !== null) {
  i++;
  const seg = t.slice(Math.max(0, m.index - 22), m.index + 26).replace(/\n/g, ' ');
  console.log(String(i).padStart(2) + '. [' + m[0] + '] …' + seg + '…');
}
const cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
console.log(`\n共 ${i} 处 / ${cn} 汉字 = ${((i / cn) * 1000).toFixed(2)} 每千字 ｜ 限 3.0 → 最多 ${Math.floor((cn / 1000) * 3.0)} 处`);
