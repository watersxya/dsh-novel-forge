// 返工单：把候选稿没过关的地方逐条列出来，交给子代理做「定点返工」
// 用法: node rework-order.mjs <章号> [候选文件名]
import fs from 'node:fs';
import path from 'node:path';
import { read, loadChapter, postposedSpans, judgmentSpans } from './validate-lib.mjs';
import { metricsOf, gateFails } from './metrics-lib.mjs';

const DIR = 'H:\\novels\\还债疯了';
const no = Number(process.argv[2]);
const candArg = process.argv[3];
const ch = loadChapter(DIR, no);
const candPath = path.join(DIR, candArg || ch.file.replace(/\.md$/, '.new.md'));
const cand = read(candPath);
const orig = read(path.join(DIR, ch.file));

const paras = cand
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((s) => !s.startsWith('#'));
const nar = paras.filter((p) => !/^[\u201C\u300C"]/.test(p));
const heads = nar.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
const c = heads.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {});
const over = Object.entries(c).filter(([, v]) => v > 2);

const m = metricsOf(cand);
const gf = gateFails(m);

const lines = [];
lines.push(`# 第 ${no} 章《${ch.title}》返工单`);
lines.push('');
lines.push('## 一、必须改成主谓结构的倒装句（当前 ' + postposedSpans(cand).length + ' 处）');
lines.push('');
lines.push('原稿只有 ' + postposedSpans(orig).length + ' 处。下面每一句都要改写成「主语在前」的正常语序，**不许再出现倒装**。');
lines.push('');
postposedSpans(cand).forEach((s, i) => lines.push(`${i + 1}. \`${s}\``));
const js = judgmentSpans(cand);
if (js.length) {
  lines.push('');
  lines.push('## 二、「X 的，是 Y」判断句（当前 ' + js.length + " 处）");
  lines.push('');
  js.forEach((s, i) => lines.push(`${i + 1}. \`${s}\``));
}
lines.push('');
lines.push('## 三、开头太雷同的段落（每个前缀最多留 2 段）');
lines.push('');
lines.push('重复前缀：' + (over.map(([h, v]) => `「${h}」×${v}`).join('、') || '无'));
lines.push('');
if (over.length) {
  const shown = {};
  for (let i = 0; i < nar.length; i++) {
    const h = heads[i];
    if (!over.some(([x]) => x === h)) continue;
    shown[h] = (shown[h] || 0) + 1;
    if (shown[h] > 2) lines.push(`- 【${h}】${nar[i].slice(0, 46)}…`);
  }
}
lines.push('');
lines.push('## 四、未达标指标');
lines.push('');
lines.push(gf.length ? gf.map((x) => '- ' + x).join('\n') : '（七项全过）');
lines.push('');
lines.push('## 五、当前全部指标');
lines.push('');
lines.push('```');
lines.push(JSON.stringify(m, null, 1));
lines.push('```');

console.log(lines.join('\n'));
