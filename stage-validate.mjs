// 单章校验 CLI（逻辑在 validate-lib.mjs）
// 用法: node stage-validate.mjs <章号> [候选文件名]
import fs from 'node:fs';
import path from 'node:path';
import { validate, read, loadChapter } from './validate-lib.mjs';

const DIR = 'H:\\novels\\还债疯了';
const no = Number(process.argv[2]);
const candArg = process.argv[3];
const ch = loadChapter(DIR, no);
if (!ch || !ch.file) {
  console.log(JSON.stringify({ ok: false, error: 'chapter not found: ' + no }));
  process.exit(1);
}
// --orig <文件名> 指定基准（用于校验已落盘稿 vs 其备份）
const origIdx = process.argv.indexOf('--orig');
const origArg = origIdx > 0 ? process.argv[origIdx + 1] : undefined;
const origPath = path.join(DIR, origArg || ch.file);
const candPath = path.join(DIR, candArg || ch.file.replace(/\.md$/, '.new.md'));
if (!fs.existsSync(candPath)) {
  console.log(JSON.stringify({ ok: false, error: '候选稿不存在: ' + candPath }));
  process.exit(1);
}
const r = validate(read(origPath), read(candPath));
console.log(JSON.stringify({ no, title: ch.title, ...r }, null, 1));
process.exit(r.ok ? 0 : 1);
