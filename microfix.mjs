// 精确微调：逐条做字符串替换，替换前校验原串唯一存在
import fs from 'node:fs';

const EDITS = [
  {
    file: 'H:\\novels\\还债疯了\\第006章_木工考试.new.md',
    old: '侧面的角度仔仔细细看了一遍那堆木纹，跟相面的似的看了一阵。',
    new: '侧面的角度仔仔细细把那堆木纹打量了一阵。',
    why: '删掉纯装饰比喻「跟相面的似的」，并消掉「看了一遍…看了一阵」的重复',
  },
  {
    file: 'H:\\novels\\还债疯了\\第013章_木屑大战.new.md',
    old: '朽木工们像接到什么讯号似的，齐齐转身钻回腐树的根须之间。',
    new: '朽木工们齐齐转身，钻回腐树的根须之间。',
    why: '删掉套话比喻「像接到什么讯号似的」，动作本身已足够',
  },
];

for (const e of EDITS) {
  const t = fs.readFileSync(e.file, 'utf8');
  const n = t.split(e.old).length - 1;
  if (n !== 1) {
    console.log(`✗ ${e.file}\n   原串出现 ${n} 次（需恰好 1 次），跳过。`);
    continue;
  }
  fs.writeFileSync(e.file, t.replace(e.old, e.new), 'utf8');
  console.log(`✓ ${e.file}\n   ${e.why}`);
}
