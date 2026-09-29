// 改写稿校验库：单一事实源，stage-validate.mjs 与 batch-promote.mjs 共用
import fs from 'node:fs';
import path from 'node:path';

export const cn = (t) => (t.match(/[\u4e00-\u9fa5]/g) || []).length;
export const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
export const parasOf = (t) =>
  t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export function numbers(t) {
  const out = new Set();
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
  for (const m of t.matchAll(/百分之[零一二三四五六七八九十百千万两点\d]+/g)) out.add(m[0]);
  for (const m of t.matchAll(/[一二三四五六七八九十百千万零两\d]{1,4}(?:寸|尺|步|刻|息|成份|成|分|格子|格半|格|层|阶|缕|截|滴|遍|回|次)/g)) out.add(m[0]);
  return out;
}

export function blocks(t) {
  const out = [];
  for (const m of t.matchAll(/【[^】]{2,}】/g)) out.push(m[0]);
  for (const m of t.matchAll(/《[^》]{1,20}》/g)) out.push(m[0]);
  return out;
}

const NAMES = ['林安之','小欠','鲁未央','阿木','青囊','墨老','公输盘','桑落','鲁承梁','青梧','阿槐','程九','谢临','苏夜','舟容','莫问','零号','守木傀','醒木芯','千年养魂木','本愿归流','枯木回春','木偶围城'];
const SUBJ = '[他她林安之鲁未央阿木小欠苏夜桑落青囊墨老公输盘青梧阿槐程九谢临舟容]';

/** 主语后置句式：句首是 2–10 字的动词/状语小句 + 逗号 + 主语。
 *  第 1 章改造稿把这种句式复制了 15 次（原稿 0 次），是把「AI 味」换成「模板病」。 */
export function postposed(t) {
  const re = new RegExp(`(?:^|[。！？\\n])[^，。\\n]{2,10}，(?=${SUBJ})`, 'g');
  return (t.match(re) || []).length;
}

/** 「X 的，是 Y」判断句（同属倒装模板） */
export function judgment(t) {
  return (t.match(/的，是[^，。\n]{1,10}[。，]/g) || []).length;
}

/** 「修饰语＋的＋人名」倒装（第 14 章审稿发现的第三种规避模板）
 *  如「站直后的阿木」「松开手的阿木」「背起工具箱的阿木」「前面领路的林安之」 */
export function modifierName(t) {
  return (t.match(/[\u4e00-\u9fa5]{1,8}的(林安之|鲁未央|阿木|小欠|苏夜|桑落|青囊|墨老|公输盘|青梧|阿槐|程九|谢临|舟容)/g) || []).length;
}

/** 倒装句的原文（用于返工单） */
export function postposedSpans(t) {
  const re = new RegExp(`(?:^|[。！？\\n])([^，。\\n]{2,10}，)(?=${SUBJ})`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const start = m.index + m[0].length - m[1].length;
    let end = start;
    while (end < t.length && !/[。！？\n]/.test(t[end])) end++;
    out.push(t.slice(start, end + 1).replace(/\n/g, ' ').trim());
  }
  return out;
}

/** 判断句的原文 */
export function judgmentSpans(t) {
  const re = /[^。！？\n]{0,20}的，是[^，。\n]{1,10}[。，]/g;
  return t.match(re) || [];
}

/** 明喻保留率：不许把「像…」系统性地删成断言 */
export function simileMarks(t) {
  return (t.match(/像|似的|一样|仿佛|好像|宛如|如同/g) || []).length;
}

/** 校验候选稿。返回 { ok, fails[], warns[], stats } */
export function validate(origText, candText) {
  const fails = [];
  const warns = [];
  const co = cn(origText);
  const cc = cn(candText);
  const ratio = cc / co;
  if (ratio < 0.85 || ratio > 1.15) fails.push(`篇幅比 ${ratio.toFixed(3)}（原${co}→新${cc}字），要求 0.85–1.15`);
  else if (ratio < 0.92) warns.push(`篇幅缩到 ${(ratio * 100).toFixed(0)}%`);

  const no_ = numbers(origText);
  const nc = numbers(candText);
  const lost = [...no_].filter((x) => !nc.has(x));
  if (lost.length) fails.push(`数字丢失/变动：${lost.slice(0, 12).join('、')}`);

  for (const b of blocks(origText)) if (!candText.includes(b)) fails.push(`固定文本丢失：${b.slice(0, 30)}`);

  const cp = parasOf(candText).filter((p) => !p.startsWith('#'));
  const seen = new Map();
  for (const p of cp) {
    if (p.length < 12) continue;
    seen.set(p, (seen.get(p) || 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  if (dups.length) fails.push(`候选稿内出现重复段落 ${dups.length} 处（例：${dups[0][0].slice(0, 28)}…）`);

  const origSet = new Set(parasOf(origText));
  const unchanged = cp.filter((p) => p.length >= 20 && origSet.has(p)).length;
  const unchangedRatio = cp.length ? unchanged / cp.length : 0;
  if (unchangedRatio > 0.75) fails.push(`与原文逐字相同的段落占 ${(unchangedRatio * 100).toFixed(0)}%，几乎没有改写`);
  else if (unchangedRatio > 0.55) warns.push(`与原文逐字相同的段落占 ${(unchangedRatio * 100).toFixed(0)}%`);

  for (const n of NAMES) {
    const a = (origText.match(new RegExp(n, 'g')) || []).length;
    const b = (candText.match(new RegExp(n, 'g')) || []).length;
    if (a > 0 && b === 0) fails.push(`专名消失：${n}（原 ${a} 次 → 新 0 次）`);
  }

  // ── 主语保留率（第 2 章审稿的根因）─────────────
  // 换段首时把「林安之」删掉而代词数量不变 = 主语被删，而不是被替换。
  const SUBJECTS = /林安之|鲁未央|阿木|小欠|苏夜|桑落|青囊|墨老|公输盘|青梧|阿槐|程九|谢临|舟容|他|她/g;
  const so_ = (origText.match(SUBJECTS) || []).length;
  const sc_ = (candText.match(SUBJECTS) || []).length;
  const subjRatio = so_ ? sc_ / so_ : 1;
  if (so_ >= 20 && subjRatio < 0.88) {
    fails.push(`主语标记数 ${so_} → ${sc_}（${(subjRatio * 100).toFixed(0)}%）——靠删主语换段首，必须把主语补回句子（放在句中即可，不许消失）`);
  } else if (so_ >= 20 && subjRatio < 0.95) {
    warns.push(`主语标记数 ${so_} → ${sc_}（${(subjRatio * 100).toFixed(0)}%），请审稿人确认有无主语脱落`);
  }

  // ── 6. 倒装模板（第 1 章事故的直接教训）──────
  // 注意：正则无法区分「方位/时间状语＋主语」（正常中文）与「动词小句＋主语后置」（模板病），
  //       实测误报率约 70%。因此只在**确实系统性倒装**时才拦，平时只给警示。
  const po = postposed(origText);
  const pc = postposed(candText);
  const jo = judgment(origText);
  const jc = judgment(candText);
  if (pc > 2 * (po + 3)) fails.push(`主语后置倒装 ${pc} 处（原稿 ${po} 处）——已达到系统性模板化的量级`);
  else if (pc > po + 5) warns.push(`主语后置倒装 ${pc} 处（原稿 ${po} 处）——偏多，请审稿人重点看`);
  if (jc > jo + 1) fails.push(`「X的，是Y」判断句 ${jc} 处（原稿 ${jo} 处）——这类倒装正则可精确识别，属模板病`);
  const mo = modifierName(origText);
  const mc = modifierName(candText);
  if (mc > mo + 3) fails.push(`「修饰语＋的＋人名」倒装 ${mc} 处（原稿 ${mo} 处）——第 14 章审稿发现的第三种规避模板，须打散`);

  // ── 7. 明喻不许被系统性删成断言 ─────────────
  // 注意：只有当本章原稿比喻密度本身就不超标（无需削减）时才要求保留；
  //      原稿密度超标的章，砍比喻正是目标。
  const so = simileMarks(origText);
  const sc = simileMarks(candText);
  const origDensity = (so / co) * 1000;
  if (origDensity <= 3.0 && so >= 6 && sc < so * 0.7) {
    fails.push(`明喻标记 ${so} → ${sc} 处（原稿密度仅 ${origDensity.toFixed(2)}/千字，本不需要削减）`);
  }

  return {
    ok: fails.length === 0,
    fails,
    warns,
    stats: {
      origChars: co,
      candChars: cc,
      ratio: +ratio.toFixed(3),
      unchangedRatio: +unchangedRatio.toFixed(3),
      postposed: `${po}→${pc}`,
      judgment: `${jo}→${jc}`,
      simileMarks: `${so}→${sc}`,
    },
  };
}

export function loadChapter(dir, no) {
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'novel-project.json'), 'utf8'));
  return proj.chapters.find((c) => c.no === no);
}
