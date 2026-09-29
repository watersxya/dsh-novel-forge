// 批量输出指定章的叙述段重复开头信息
import fs from 'node:fs';
import path from 'node:path';
const DIR = 'H:\\novels\\还债疯了';
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const lo = Number(process.argv[2] || 1);
const hi = Number(process.argv[3] || 10);
for (const ch of proj.chapters) {
  if (!ch.file || ch.no < lo || ch.no > hi) continue;
  const t = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
  const paras = t.split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith('#'));
  const nar = paras.filter((p) => !/^[\u201C\u300C"]/.test(p));
  const heads = nar.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  const c = heads.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {});
  const rep = Object.entries(c).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]);
  const repN = rep.reduce((s, [, v]) => s + v, 0);
  const cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  const sim = (t.match(/像(?!象|样|话)/g) || []).length + (t.match(/仿佛|好像|如同|似的|宛如/g) || []).length;
  console.log(`第${String(ch.no).padStart(2)}章《${ch.title}》 ${cn}字 叙述段${nar.length} 同构率${(repN / nar.length).toFixed(3)} 比喻/千字${((sim / cn) * 1000).toFixed(2)} 重复开头: ${rep.map(([h, v]) => h + '×' + v).join(' ') || '无'}`);
}
