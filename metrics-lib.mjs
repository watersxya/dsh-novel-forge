// 七项门槛的指标计算库（从 audit-redlines.mjs 抽出，供落盘器前置判定）
const RE_DIALOG_TAG = /[\u201C\u201D\u300C\u300D\uFF02"]/;
const RE_QUOTED_SPAN = /[\u201C\u300C"][^\u201D\u300D"\n]{1,200}[\u201D\u300D"]/g;

export const GATES = [
  ['headRepeat', '叙述段起句同构率', '<=', 0.2],
  ['similePer1k', '比喻/千字', '<=', 3.0],
  ['sysDialogCharRatio', '播报字数占比', '<=', 0.045],
  ['humanDialogCharRatio', '人物对话字数占比', '>=', 0.15],
  ['narShortRatio', '叙述段短段占比', '<=', 0.35],
  ['tplPer1k', '模板句/千字', '<=', 2.5],
  ['cushionPer1k', '缓冲副词/千字', '<=', 1.0],
];

/** 经济模式（2026-09-21 起）：只卡两项主指标；其余五项只报不卡。
 *  理由：模板句/短段/播报这三项每章都要多跑 1–2 个返工代理，成本高；
 *  而它们对应的番茄红线（空洞水文）主要由"人物对话占比"和"主语完整"覆盖，
 *  这两项由免费的本地闸门 + 保真校验兜住。 */
export const GATES_ECONOMY = [
  ['headRepeat', '叙述段起句同构率', '<=', 0.2],
  ['similePer1k', '比喻/千字', '<=', 3.0],
];

export function gateFails(m, mode) {
  const list = mode === 'economy' ? GATES_ECONOMY : GATES;
  const out = [];
  for (const [k, label, op, lim] of list) {
    const v = m[k];
    const ok = op === '<=' ? v <= lim : v >= lim;
    if (!ok) out.push(`${label}=${v}（限 ${lim}）`);
  }
  return out;
}

export function metricsOf(raw0) {
  const raw = String(raw0).replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  if (lines[0] && /^#/.test(lines[0].trim())) lines = lines.slice(1);
  const paras = lines.map((s) => s.trim()).filter(Boolean);
  const body = paras.join('\n');
  const cn = (body.match(/[\u4e00-\u9fa5]/g) || []).length || 1;
  const per1k = (n) => +((n / cn) * 1000).toFixed(2);

  const spanRe = new RegExp(RE_QUOTED_SPAN.source, 'g');
  let m;
  let charsSys = 0;
  let charsHuman = 0;
  while ((m = spanRe.exec(body)) !== null) {
    // 说话人判定（v2，2026-09-21 修正）：原来的「邻近 N 字内出现小欠/系统」可被塞填充字绕开
    // ——第 10 章代理就是靠加「嗓门拔到最高」这类字把「小欠」推出 12 字窗口来骗过指标。
    // 现改为只认**明确的说话人标签**：
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 6);
    const before = body.slice(Math.max(0, m.index - 16), m.index);
    const isSysAfter = /^[，。、：:]?\s*(小欠|系统|提示音|播报)/.test(after);
    const isSysBefore = /(小欠|系统|提示音|播报)[^。！？\n]{0,3}[：:，,]\s*$/.test(before);
    if (isSysAfter || isSysBefore) charsSys += m[0].length;
    else charsHuman += m[0].length;
  }
  const humanDialogCharRatio = +(charsHuman / cn).toFixed(3);
  const sysDialogCharRatio = +(charsSys / cn).toFixed(3);

  const NAR = paras.filter((p) => !/^[\u201C\u300C"]/.test(p));
  const narShortRatio = +(NAR.filter((p) => p.replace(/[^\u4e00-\u9fa5]/g, '').length < 20).length / NAR.length).toFixed(3);

  const heads = NAR.map((p) => p.replace(/^[\u201C\u300C"]/, '').slice(0, 2));
  const headCount = {};
  for (const h of heads) headCount[h] = (headCount[h] || 0) + 1;
  const repeatedHeadParas = Object.values(headCount).filter((v) => v >= 3).reduce((a, b) => a + b, 0);
  const headRepeat = +(repeatedHeadParas / heads.length).toFixed(3);
  const topHead = Object.entries(headCount).sort((a, b) => b[1] - a[1])[0] || ['', 0];

  const simile = (body.match(/像(?!象|样|话)/g) || []).length + (body.match(/仿佛|好像|如同|似的|宛如/g) || []).length;
  const tpl =
    (body.match(/了一下/g) || []).length +
    (body.match(/把[^，。]{1,6}一[^，。]{1,3}/g) || []).length +
    (body.match(/得像/g) || []).length +
    (body.match(/不是[^。]{1,20}而是/g) || []).length;
  const cushion = (body.match(/缓缓|微微|淡淡|轻轻|慢慢|渐渐/g) || []).length;

  return {
    cn,
    paras: paras.length,
    narParas: NAR.length,
    headRepeat,
    topHead: `${topHead[0]}\u00D7${topHead[1]}`,
    similePer1k: per1k(simile),
    tplPer1k: per1k(tpl),
    cushionPer1k: per1k(cushion),
    humanDialogCharRatio,
    sysDialogCharRatio,
    narShortRatio,
  };
}
