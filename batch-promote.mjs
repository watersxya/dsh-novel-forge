// 批量落盘：扫描所有 .new.md 候选稿 → 校验 → 通过则备份原稿并覆盖
// 用法: node batch-promote.mjs            （处理全部候选）
//       node batch-promote.mjs --dry      （只校验不落盘）
import fs from 'node:fs';
import path from 'node:path';
import { validate, read, loadChapter } from './validate-lib.mjs';
import { metricsOf, gateFails } from './metrics-lib.mjs';

const DIR = 'H:\\novels\\还债疯了';
const dry = process.argv.includes('--dry');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const cands = fs.readdirSync(DIR).filter((f) => f.endsWith('.new.md'));
if (!cands.length) {
  console.log('没有找到任何 .new.md 候选稿');
  process.exit(0);
}

const out = { stamp, dry, promoted: [], rejected: [] };
for (const cand of cands) {
  const no = Number((cand.match(/第(\d+)章/) || [])[1]);
  if (!Number.isInteger(no)) continue;
  const ch = loadChapter(DIR, no);
  if (!ch || !ch.file) {
    out.rejected.push({ no, cand, fails: ['项目里找不到该章'] });
    continue;
  }
  const origPath = path.join(DIR, ch.file);
  const candPath = path.join(DIR, cand);
  if (!fs.existsSync(origPath)) {
    out.rejected.push({ no, cand, fails: ['原稿文件不存在'] });
    continue;
  }
  const candText = read(candPath);
  const r = validate(read(origPath), candText);
  if (!r.ok) {
    out.rejected.push({ no, title: ch.title, cand, reason: '保真性', fails: r.fails, stats: r.stats });
    continue;
  }
  // 门槛必须前置：覆盖之前就判，避免"已落盘才发现不达标"
  // 经济模式（默认）：只卡段首同构率 + 比喻密度；其余五项只报不卡。
  const m = metricsOf(candText);
  const gf = gateFails(m, process.env.NOVEL_GATE === 'full' ? 'full' : 'economy');
  if (gf.length) {
    out.rejected.push({ no, title: ch.title, cand, reason: '七项门槛', fails: gf, metrics: m });
    continue;
  }
  if (!dry) {
    const bakPath = path.join(DIR, ch.file.replace(/\.md$/, `.orig-${stamp}.md`));
    fs.copyFileSync(origPath, bakPath);
    fs.renameSync(candPath, origPath);
    out.promoted.push({ no, title: ch.title, chars: r.stats.candChars, ratio: r.stats.ratio, unchangedRatio: r.stats.unchangedRatio, headRepeat: m.headRepeat, similePer1k: m.similePer1k, postposed: r.stats.postposed, backup: path.basename(bakPath) });
  } else {
    out.promoted.push({ no, title: ch.title, chars: r.stats.candChars, ratio: r.stats.ratio, headRepeat: m.headRepeat, similePer1k: m.similePer1k, dryRun: true });
  }
}
console.log(JSON.stringify(out, null, 1));
