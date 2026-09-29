// 病灶卡：给每章输出原文的重复段首、比喻密度、倒装基线（子代理提示词要用）
import fs from 'node:fs';
import path from 'node:path';
import { postposed, judgment, simileMarks } from './validate-lib.mjs';
import { metricsOf } from './metrics-lib.mjs';

const DIR = 'H:\\novels\\还债疯了';
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const lo = Number(process.argv[2] || 1);
const hi = Number(process.argv[3] || 58);
for (const ch of proj.chapters) {
  if (!ch.file || ch.no < lo || ch.no > hi) continue;
  const t = fs.readFileSync(path.join(DIR, ch.file), 'utf8').replace(/\r\n/g, '\n');
  const paras = t.split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith('#'));
  const nar = paras.filter((p) => !/^[\u201C\u300C"]/.test(p));
  const heads = nar.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  const c = heads.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {});
  const rep = Object.entries(c).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]);
  const m = metricsOf(t);
  const po = postposed(t);
  const jo = judgment(t);
  const so = simileMarks(t);
  console.log(
    `第${String(ch.no).padStart(2)}章《${ch.title}》  汉字${m.cn} 叙述段${nar.length}\n` +
      `   同构率${m.headRepeat}  比喻/千字${m.similePer1k}（明喻标记${so}）  播报占比${m.sysDialogCharRatio}  对话占比${m.humanDialogCharRatio}  短段占比${m.narShortRatio}  模板句${m.tplPer1k}  缓冲副词${m.cushionPer1k}\n` +
      `   倒装基线：${po} 处 ｜ 判断句基线：${jo} 处 → 改写后上限 ${po + 2} / ${jo + 1}\n` +
      `   重复开头：${rep.map(([h, v]) => h + '×' + v).join(' ') || '无'}`,
  );
}
