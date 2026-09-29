// 通过小说工坊自带 /rewrite 路由改造一章：备份 → 请求 LLM 改写 → 落盘 → 跑体检门槛
// 用法: node rewrite-one.mjs <章号> [--dry]
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3812';
const API = BASE + '/api/dsh-novel-forge/rewrite';
const DIR = 'H:\\novels\\还债疯了';
const no = Number(process.argv[2]);
const dry = process.argv.includes('--dry');
if (!Number.isInteger(no)) {
  console.log(JSON.stringify({ ok: false, error: 'need chapter number' }));
  process.exit(1);
}

let instructions = fs.readFileSync(path.join(DIR, '_改造指令.txt'), 'utf8');
const focusFile = process.argv.slice(3).find((a) => a !== '--dry' && fs.existsSync(a));
if (focusFile) instructions += '\n\n【本次追加重点】\n' + fs.readFileSync(focusFile, 'utf8');
const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));
const ch = proj.chapters.find((c) => c.no === no);
if (!ch || !ch.file) {
  console.log(JSON.stringify({ ok: false, error: 'chapter not found: ' + no }));
  process.exit(1);
}
const file = path.join(DIR, ch.file);
const original = fs.readFileSync(file, 'utf8');

let draft = '';
let deltas = 0;
const res = await fetch(API, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chapterNo: no, instructions }),
});
if (!res.ok || !res.body) {
  console.log(JSON.stringify({ ok: false, error: 'http ' + res.status + ' ' + (await res.text()).slice(0, 300) }));
  process.exit(1);
}
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let errMsg = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let f;
    try {
      f = JSON.parse(line);
    } catch {
      continue;
    }
    if (f.type === 'delta') {
      deltas++;
      draft += f.text ?? '';
    } else if (f.type === 'drafted') {
      if (f.draft) draft = f.draft;
    } else if (f.type === 'error') {
      errMsg = f.message ?? 'unknown';
    }
  }
}

if (errMsg) {
  console.log(JSON.stringify({ ok: false, error: errMsg }));
  process.exit(1);
}
if (!draft.trim()) {
  console.log(JSON.stringify({ ok: false, error: 'empty draft', deltas }));
  process.exit(1);
}

// 统一首行标题
let text = draft.trim();
if (!/^#\s/.test(text)) text = `# 第${no}章 ${ch.title}\n\n` + text;
if (!text.endsWith('\n')) text += '\n';

const out = { ok: true, no, title: ch.title, deltas, origChars: original.length, draftChars: text.length };
if (!dry) {
  // 时间戳备份，绝不覆盖（上一次用同名 .bak.md 覆盖，导致原稿丢失）
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bak = file.replace(/\.md$/, `.bak-${stamp}.md`);
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, text, 'utf8');
  out.wrote = ch.file;
  out.backup = bak;
}
console.log(JSON.stringify(out));
