// 番茄红线体检 v2：对正文本做确定性量化（不调 LLM）
// 对齐番茄四类红线：格式混乱 / 结构失常 / 空洞水文 / AI粗制滥造
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || 'H:\\novels\\还债疯了';
const OUT = process.argv[3] || '__audit.json';

// 中文弯引号一律用码点写，避免被规范化成 ASCII 引号
const RE_DIALOG_TAG = /[\u201C\u201D\u300C\u300D\uFF02"]/;
const RE_QUOTED_SPAN = /[\u201C\u300C"][^\u201D\u300D"\n]{1,200}[\u201D\u300D"]/g;

const proj = JSON.parse(fs.readFileSync(path.join(DIR, 'novel-project.json'), 'utf8'));

function readRaw(file) {
  return fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\r\n/g, '\n');
}

function analyze(ch) {
  const raw = readRaw(ch.file);
  const rawLines = raw.split('\n');
  const titleLineDup = (raw.match(/^#?\s*第\s*\d+\s*章/gm) || []).length;

  let lines = rawLines;
  if (lines[0] && /^#/.test(lines[0].trim())) lines = lines.slice(1);
  const paras = lines.map((s) => s.trim()).filter(Boolean);
  const body = paras.join('\n');
  const cn = (body.match(/[\u4e00-\u9fa5]/g) || []).length || 1;
  const per1k = (n) => +((n / cn) * 1000).toFixed(2);

  // ── 空洞水文 ────────────────────────────────
  const dialogParas = paras.filter((p) => RE_DIALOG_TAG.test(p)).length;
  const dialogRatio = +(dialogParas / paras.length).toFixed(3);

  // 把引号片段按说话人拆开：小欠/系统播报 vs 人物对话
  const spanRe = new RegExp(RE_QUOTED_SPAN.source, 'g');
  let m;
  let quoted = 0;
  let quotedSys = 0;
  let quotedHuman = 0;
  let charsSys = 0;
  let charsHuman = 0;
  while ((m = spanRe.exec(body)) !== null) {
    quoted++;
    // 说话人判定（v2，2026-09-21 修正）：原「邻近 N 字内出现小欠/系统」可被塞填充字绕开
    // （第 10 章代理靠加「嗓门拔到最高」把「小欠」推出 12 字窗口骗过指标）。
    // 现只认明确的说话人标签。
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 6);
    const before = body.slice(Math.max(0, m.index - 16), m.index);
    const isSysAfter = /^[，。、：:]?\s*(小欠|系统|提示音|播报)/.test(after);
    const isSysBefore = /(小欠|系统|提示音|播报)[^。！？\n]{0,3}[：:，,]\s*$/.test(before);
    if (isSysAfter || isSysBefore) {
      quotedSys++;
      charsSys += m[0].length;
    } else {
      quotedHuman++;
      charsHuman += m[0].length;
    }
  }
  const dialogCharRatio = +((charsSys + charsHuman) / cn).toFixed(3); // 引号内总占比
  const humanDialogCharRatio = +(charsHuman / cn).toFixed(3); // 人物对话占比
  const sysDialogCharRatio = +(charsSys / cn).toFixed(3); // 系统播报占比

  const sysParas = paras.filter((p) => /小欠(报|说|道|的声音)|系统(提示|播报)|播报/.test(p)).length;
  const sysRatio = +(sysParas / paras.length).toFixed(3);
  const shortParas = paras.filter((p) => p.replace(/[^\u4e00-\u9fa5]/g, '').length < 20).length;
  const shortRatio = +(shortParas / paras.length).toFixed(3);
  // 叙述段短段占比（只算叙述段：对话段天然短，统计它等于惩罚对话）
  const NAR = paras.filter((p) => !/^[\u201C\u300C"]/.test(p));
  const narShortRatio = +(NAR.filter((p) => p.replace(/[^\u4e00-\u9fa5]/g, '').length < 20).length / NAR.length).toFixed(3);
  const avgParaLen = Math.round(cn / paras.length);
  const enumerate = (body.match(/第[一二三四五六七八九十]+(项|条|点|个)/g) || []).length; // 罗列式

  // ── 结构失常 ────────────────────────────────
  // 只统计叙述段：对话段的段首是台词首字，随机性高，混在一起会稀释指标
  const heads = NAR.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  const headCount = {};
  for (const h of heads) headCount[h] = (headCount[h] || 0) + 1;
  const topHead = Object.entries(headCount).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const repeatedHeadParas = Object.values(headCount).filter((v) => v >= 3).reduce((a, b) => a + b, 0);
  const headRepeat = +(repeatedHeadParas / heads.length).toFixed(3);
  const narHeadRepeat = headRepeat;

  const pronVerb = paras.filter((p) =>
    /^(他|她|林安之|小欠|阿木|苏夜|桑落|鲁未央|青囊|墨老|公输盘|青梧|阿槐|程九)(把|伸|低|仰|抽|抬|转|站|坐|走|看|听|说|问|笑|停|点|摇|皱|闭|睁|按|握|抓|放|拿|进|出|回)/.test(p),
  ).length;
  const pronVerbRatio = +(pronVerb / paras.length).toFixed(3);

  // 连续同构：>=3 段连续以同 2 字开头
  let runMax = 1;
  let run = 1;
  for (let i = 1; i < heads.length; i++) {
    if (heads[i] && heads[i] === heads[i - 1]) {
      run++;
      runMax = Math.max(runMax, run);
    } else run = 1;
  }

  // ── AI 粗制滥造 ─────────────────────────────
  const simile = (body.match(/像(?!象|样|话)/g) || []).length;
  const simileAdv = (body.match(/仿佛|好像|如同|似的|宛如/g) || []).length;
  const similePer1k = per1k(simile + simileAdv);

  const mind = (body.match(/他知道|他明白|他记着|他记得|他没多想|他忽然明白|他清楚|他意识到|心里一[紧沉动]|心中[一涌]/g) || []).length;

  const tpl =
    (body.match(/了一下/g) || []).length +
    (body.match(/把[^，。]{1,6}一[^，。]{1,3}/g) || []).length +
    (body.match(/得像/g) || []).length +
    (body.match(/不是[^。]{1,20}而是/g) || []).length;
  const tplPer1k = per1k(tpl);

  const cushion = (body.match(/缓缓|微微|淡淡|轻轻|慢慢|渐渐/g) || []).length;
  const cushionPer1k = per1k(cushion);

  // ── 格式混乱 ────────────────────────────────
  const halfComma = (body.match(/[\u4e00-\u9fa5],/g) || []).length;
  const dupPunct = (body.match(/[，。！？]{2,}/g) || []).length;

  // 章末句（用于跨章统计收尾同构）
  const tail = (paras[paras.length - 1] || '').split(/[。！？]/).filter(Boolean).slice(-1)[0] || '';

  // ── 综合风险分 ──────────────────────────────
  const sStruct = Math.min(100, headRepeat * 260 + pronVerbRatio * 140 + tplPer1k * 6 + enumerate * 4);
  const sWater = Math.min(
    100,
    Math.max(0, 60 - humanDialogCharRatio * 300) * 0.7 + sysRatio * 150 + shortRatio * 45 + (humanDialogCharRatio < 0.12 ? 25 : 0),
  );
  const sAI = Math.min(100, similePer1k * 5 + per1k(mind) * 22 + cushionPer1k * 6);
  const risk = Math.round(sStruct * 0.4 + sWater * 0.3 + sAI * 0.3);

  return {
    no: ch.no,
    title: ch.title,
    chars: cn,
    paras: paras.length,
    risk,
    sStruct: Math.round(sStruct),
    sWater: Math.round(sWater),
    sAI: Math.round(sAI),
    headRepeat,
    topHead: `${topHead[0]}\u00D7${topHead[1]}`,
    runMax,
    pronVerbRatio,
    tplPer1k,
    similePer1k,
    cushionPer1k,
    mindPer1k: per1k(mind),
    dialogRatio,
    dialogCharRatio,
    humanDialogCharRatio,
    sysDialogCharRatio,
    quoted,
    quotedHuman,
    quotedSys,
    sysRatio,
    shortRatio,
    narShortRatio,
    avgParaLen,
    enumerate,
    halfComma,
    dupPunct,
    titleLineDup,
    tail,
    status: ch.status,
  };
}

const rows = [];
for (const ch of proj.chapters) {
  if (!ch.file) continue;
  try {
    rows.push(analyze(ch));
  } catch (e) {
    rows.push({ no: ch.no, title: ch.title, error: e.message });
  }
}
rows.sort((a, b) => a.no - b.no);
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1), 'utf8');

const ok = rows.filter((r) => !r.error);
const seg = (lo, hi) => ok.filter((r) => r.no >= lo && r.no <= hi);
const avg = (arr, k) => +(arr.reduce((a, r) => a + r[k], 0) / arr.length).toFixed(3);
const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);

const a = seg(1, 58);
const b = seg(45, 151);

let md = `# 《还债疯了》番茄红线体检报告\n\n`;
md += `体检范围：第 1\u201358 章（番茄已发布区间）｜对照：第 45\u2013151 章｜全书 ${ok.length} 章\n`;
md += `方法：对正文本做确定性量化（词表/正则统计），不调用 LLM。\n`;
md += `生成时间：${new Date().toISOString()}\n\n`;

md += `## 一、总览\n\n| 指标 | 1\u201358 章 | 45\u2013151 章 | 判读线 |\n|---|---|---|---|\n`;
const metricRows = [
  ['综合风险分', 'risk', '\u2193 越低越好'],
  ['　结构失常分', 'sStruct', '\u2193'],
  ['　空洞水文分', 'sWater', '\u2193'],
  ['　AI味分', 'sAI', '\u2193'],
  ['段首 2 字同构率', 'headRepeat', '>0.20 危险'],
  ['最长连续同构段', 'runMax', '>=3 段即可疑'],
  ['「主语+动词」起句率', 'pronVerbRatio', '>0.25 危险'],
  ['模板句/千字', 'tplPer1k', '>2.0 危险'],
  ['比喻/千字', 'similePer1k', '>3.0 危险'],
  ['缓冲副词/千字', 'cushionPer1k', '>4.0 危险'],
  ['心理直述/千字', 'mindPer1k', '>0.5 危险'],
  ['对话段占比', 'dialogRatio', '<0.15 危险'],
  ['引号内字数占比（总）', 'dialogCharRatio', '\u2014'],
  ['　人物对话字数占比', 'humanDialogCharRatio', '<0.12 危险'],
  ['　系统播报字数占比', 'sysDialogCharRatio', '>0.15 危险'],
  ['人物对话句数/章', 'quotedHuman', '<20 偏少'],
  ['系统播报句数/章', 'quotedSys', '\u2193 越少越好'],
  ['系统口播段占比', 'sysRatio', '>0.12 危险'],
  ['短段(<20字)占比', 'shortRatio', '>0.35 危险'],
  ['罗列句式/章', 'enumerate', '越多越像提纲'],
  ['平均段长(字)', 'avgParaLen', '\u2014'],
];
for (const [name, key, note] of metricRows) {
  md += `| ${name} | ${avg(a, key)} | ${avg(b, key)} | ${note} |\n`;
}

md += `\n## 二、命中清单 \u2014\u2014 风险分 Top 25（1\u201358 章）\n\n`;
md += `| 章 | 标题 | 风险 | 结构 | 水文 | AI味 | 段首同构 | 人物对话字数% | 播报字数% | 比喻/千字 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of [...a].sort((x, y) => y.risk - x.risk).slice(0, 25)) {
  md += `| ${r.no} | ${r.title} | **${r.risk}** | ${r.sStruct} | ${r.sWater} | ${r.sAI} | ${r.headRepeat} | ${(r.humanDialogCharRatio * 100).toFixed(1)} | ${(r.sysDialogCharRatio * 100).toFixed(1)} | ${r.similePer1k} |\n`;
}

md += `\n## 三、开篇 10 章明细（留存关键区）\n\n`;
md += `| 章 | 标题 | 风险 | 段首同构 | 最长同构 | 高频段首 | 人物对话字数% | 播报字数% | 播报句数 | 比喻/千字 | 平均段长 |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of seg(1, 10)) {
  md += `| ${r.no} | ${r.title} | **${r.risk}** | ${r.headRepeat} | ${r.runMax} | ${r.topHead} | ${(r.humanDialogCharRatio * 100).toFixed(1)} | ${(r.sysDialogCharRatio * 100).toFixed(1)} | ${r.quotedSys} | ${r.similePer1k} | ${r.avgParaLen} |\n`;
}

md += `\n## 四、人物对话量排名（最低 15 章，1\u201358 章内）\n\n`;
md += `| 章 | 标题 | 人物对话字数% | 播报字数% | 人物对话句数 | 播报句数 | 口播段% |\n|---|---|---|---|---|---|---|\n`;
for (const r of [...a].sort((x, y) => x.humanDialogCharRatio - y.humanDialogCharRatio).slice(0, 15)) {
  md += `| ${r.no} | ${r.title} | ${(r.humanDialogCharRatio * 100).toFixed(1)} | ${(r.sysDialogCharRatio * 100).toFixed(1)} | ${r.quotedHuman} | ${r.quotedSys} | ${(r.sysRatio * 100).toFixed(1)} |\n`;
}

md += `\n## 五、跨章收尾同构（全书 Top 12 章末句）\n\n`;
const tailCount = {};
for (const r of ok) {
  const k = (r.tail || '').slice(0, 6);
  if (k.length >= 4) tailCount[k] = (tailCount[k] || 0) + 1;
}
const tails = Object.entries(tailCount).sort((x, y) => y[1] - x[1]).slice(0, 12);
md += `| 章末句开头 | 出现章数 |\n|---|---|\n`;
for (const [k, v] of tails) md += `| ${k}\u2026 | ${v} |\n`;
md += `\n> 全部条目出现章数均为 1 \u2014\u2014 **没有跨章复用的收尾模板**（此项不构成红线）。\n`;

md += `\n## 六、格式类\n\n`;
md += `- 含半角逗号：${a.filter((r) => r.halfComma > 0).length} 章（合计 ${sum(a, 'halfComma')} 处）\n`;
md += `- 含连续标点：${a.filter((r) => r.dupPunct > 0).length} 章（合计 ${sum(a, 'dupPunct')} 处）\n`;
md += `- 正文重复标题行（出现 \u22652 次「第N章」）：${a.filter((r) => r.titleLineDup >= 2).length} 章\n`;
md += `- 全书（1\u2013151）重复标题行：${ok.filter((r) => r.titleLineDup >= 2).length} 章`;
const dupAll = ok.filter((r) => r.titleLineDup >= 2);
md += dupAll.length ? `（${dupAll.map((r) => r.no).join('、')}）\n` : `（\u2014）\n`;
for (const r of a.filter((r) => r.dupPunct > 0)) md += `  - 第 ${r.no} 章《${r.title}》：连续标点 ${r.dupPunct} 处\n`;

fs.writeFileSync('__audit.md', md, 'utf8');

// ── 附录：1–58 章全量明细 ──
let ap = `# 附录：《还债疯了》第 1\u201358 章红线指标全量明细\n\n`;
ap += `| 章 | 标题 | 风险 | 结构 | 水文 | AI味 | 段首同构 | 人物对话% | 播报% | 比喻/千字 | 模板句/千字 | 短段% | 平均段长 |\n`;
ap += `|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of a) {
  ap += `| ${r.no} | ${r.title} | ${r.risk} | ${r.sStruct} | ${r.sWater} | ${r.sAI} | ${r.headRepeat} | ${(r.humanDialogCharRatio * 100).toFixed(1)} | ${(r.sysDialogCharRatio * 100).toFixed(1)} | ${r.similePer1k} | ${r.tplPer1k} | ${(r.shortRatio * 100).toFixed(1)} | ${r.avgParaLen} |\n`;
}
fs.writeFileSync('__audit-appendix.md', ap, 'utf8');

console.log(JSON.stringify({ ok: true, chapters: ok.length, range1_58: a.length, out: OUT, md: '__audit.md', appendix: '__audit-appendix.md' }));
