#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
panel.module.css 令牌重放：把本轮 UI 修复涉及的颜色/字号/间距令牌应用到 HEAD 版本。

为什么需要这个脚本（而不是逐条手工 Edit）：
  1. 本文件有 **四套**并列的颜色基准 —— .view 浅色 / .view 深色 /
     .panel[data-nf-mode='light'] / .panel[data-nf-mode='dark']。
     新增一个令牌必须四处同步，漏一处就出现「切主题后颜色不对」这种
     只在运行时才看得见的 bug —— 正是本轮审查要消灭的那类缺陷。
  2. 5800+ 行 CRLF 文件，Edit 工具传 LF 的 old_string 会匹配失败。
  3. 每条 edit 都断言命中次数，命中数不符立即中止且不写盘（原子性）。

幂等：对同一文件重复运行会因锚点已消失而中止，不会重复插入。
"""
import io, os, sys

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'client', 'panel', 'panel.module.css')

# ---------------------------------------------------------------- 四套基准锚点
# 四套基准的**选择器**（--nf-bg 值两两相同，不能拿值当锚点）。
BLOCK_MARKS = {
    'light':       "\n.view {",
    'dark':        "\n.panel[data-nf-mode='dark'],\n",
    'force-light': "\n.panel[data-nf-mode='light'] {",
    'force-dark':  "\n.panel[data-nf-mode='dark'] {",
}


def read():
    return io.open(P, 'r', encoding='utf-8', newline='').read()


# ---------------------------------------------------------------- 阶段 3：结构层
STRUCT_PATCHES = [
    # 密度档此前只覆盖内距与控件高度，不动字号与行高 —— 于是「紧凑模式」在
    # 长时段写作里等于「控件更小但字一样大、行一样松」，切了档几乎无感。
    # 补齐字号 / 行高 / 圆角，让三档之间的信息密度真的有梯度。
    ('density-compact',
     """  --nf-ctrl-l: 35px;
}""",
     """  --nf-ctrl-l: 35px;
  /* 紧凑：字更小、行更紧、圆角更收敛 —— 与控件高度一起构成真正的紧凑。 */
  --nf-fs-18: 16px;
  --nf-fs-16: 14px;
  --nf-fs-14: 13px;
  --nf-fs-body: 13px;
  --nf-fs-title: 14px;
  --nf-fs-display: 20px;
  --nf-lh-body: 1.5;
  --nf-lh-title: 1.3;
  --nf-card-radius: 8px;
  --nf-ctrl-radius: 6px;
}"""),

    ('density-spacious',
     """  --nf-ctrl-l: 41px;
}""",
     """  --nf-ctrl-l: 41px;
  /* 宽松：字更大、行更松，正文 14px / 行高 1.8。给视力疲劳或纯阅读场景。 */
  --nf-fs-18: 20px;
  --nf-fs-16: 17px;
  --nf-fs-14: 15px;
  --nf-fs-body: 14px;
  --nf-fs-title: 17px;
  --nf-fs-display: 26px;
  --nf-lh-body: 1.8;
  --nf-lh-title: 1.45;
  --nf-card-radius: 14px;
  --nf-ctrl-radius: 10px;
}"""),
]


def find_blocks(s, conv=lambda t: t):
    """返回 {块名: (start, end)}：从选择器找到 '{'，往后做花括号配对。
    conv 用于把 LF 写的锚点转成文件实际行尾（CRLF）。"""
    out = {}
    for name, mark in BLOCK_MARKS.items():
        i = s.find(conv(mark))
        if i < 0:
            print(f'!! 找不到基准块选择器: {name} ({mark!r})')
            sys.exit(1)
        sel = s.find('{', i)
        depth, j = 0, sel
        while j < len(s):
            if s[j] == '{':
                depth += 1
            elif s[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out[name] = (sel, j + 1)
    return out


# ---------------------------------------------------------------- :root 级补丁
ROOT_PATCHES = [
    ('fs-tiers', "  --nf-fs-caption: 11px;",
     """  --nf-fs-caption: 11px;
  /* 字号档补齐：此前 --nf-text-12 被多处内联引用却从未定义，var() 静默回落到继承值
   * → NoticeBar 的 success / error 共用同一字号，视觉权重完全相同，「这是一条错误」
   * 这件事就丢了。
   *
   * 注意**不要发明 `--nf-fs-13` 这种非规范档位**：规范档位是 10/12/14/16…（数字即标准
   * 档的 px）。非规范档位有两个后果：它不随密度档重映射（于是「紧凑模式」在它身上失效），
   * 且 `check-fallback-tiers` 会判 fallback 不匹配。需要「小一号」时用 `--nf-fs-14` —— 
   * 紧凑档下它本来就是 13px。 */
  --nf-fs-display: 24px;
  --nf-fs-title: 16px;
  --nf-fs-notice: 12px;
  --nf-fs-notice-strong: 13px;"""),

    ('space-tiers', "  --nf-space-28: 28px;",
     """  --nf-space-28: 28px;
  /* 大间距档：原先 32 之后直接跳裸值 40/48，三处靠 fallback 维持 ——
   * 改密度档时这三处不会跟着走。补齐后档位连续。 */
  --nf-space-30: 30px;
  --nf-space-36: 36px;
  --nf-space-40: 40px;
  --nf-space-48: 48px;"""),
]

# ---------------------------------------------------------------- 四套颜色补丁
COLOR_PATCHES = {
 'light': [
  ('text-1', "  --nf-text: #26221b;",
   """  --nf-text: #26221b;
  /* text-1 介于 text 与 text-2 之间。原被 .importFileInfo 引用但从未定义，
   * color 静默回落到继承色，那行与父级没有任何层级差。 */
  --nf-text-1: #453e33;"""),

  ('text-3-AA', "  --nf-text-3: #8f8679;",
   """  /* 长时段疲劳修复：--nf-text-3 用于 meta / 时间戳 / 次要说明，全文件 28 处引用，
   * 是眼睛最先累的一层。原 #8f8679 对 bg 仅 3.24:1，低于 WCAG AA 正文级。
   * 提到 #726858 后 bg 4.94 / bg-raise 5.25 / bg-inset 4.52，四种纸面全部 ≥4.5。
   * 与 text-2 的层级差改由字号（12 vs 14）+ 字重承担，不再单靠对比度。 */
  --nf-text-3: #726858;
  --nf-muted: var(--nf-text-3);
  --nf-muted-line: var(--nf-border);"""),

  ('border-2', "  --nf-border-strong: rgba(38, 34, 27, 0.3);",
   """  /* border-2 = 比 border 更实一档：需要可见但不抢眼的填充（如 sparkline 未过审柱）。 */
  --nf-border-2: rgba(38, 34, 27, 0.28);
  --nf-border-strong: rgba(38, 34, 27, 0.3);"""),

  # 本块里 --nf-warn 被定义两次（#c98a1f 在 --nf-ok 旁，#ff9500 在 --nf-error 旁），
  # 后者覆盖前者 → 单一数据源被自己废掉，读代码的人会以为暖褐是生效值。
  # 删掉第一处（#c98a1f），保留第二处。
  ('warn-dedup', "  --nf-warn: #c98a1f;", ""),

  ('danger-alias', "  --nf-success: #34c759;\n  --nf-error: #ff3b30;",
   """  --nf-success: #34c559;
  --nf-error: #e5484d;
  /* 同义别名：--nf-danger / --nf-toast-ok 此前只以 fallback 裸值散在 CSS 里
   * （#e5484d / #2ec27e），与 error / success 同义却不同名不同值，改主题必漏改。 */
  --nf-danger: var(--nf-error);
  --nf-toast-ok: var(--nf-success);"""),

  ('ink-layer', "  --nf-danger: var(--nf-error);",
   """  --nf-danger: var(--nf-error);
  /* 文字版语义色：--nf-error / --nf-success 等是**图形版**（圆点、进度条填充），
   * 直接拿来写正文只有 3.2:1，达不到 AA。下面四个 -ink 是同色相的深/浅变体，
   * 专供 notice / badge / 提示文字使用。审计脚本按这四组验 ≥4.5。 */
  --nf-success-ink: #1b7a3a;
  --nf-success-ink-soft: rgba(27, 122, 58, 0.1);
  --nf-error-ink: #b3271f;
  --nf-error-ink-soft: rgba(179, 39, 31, 0.1);
  --nf-warn-ink: #8a5a00;
  --nf-warn-ink-soft: rgba(138, 90, 0, 0.1);
  --nf-info-ink: #3c5b8a;
  --nf-info-ink-soft: rgba(60, 91, 138, 0.1);"""),
 ],

 'dark': [
  ('text-1', "  --nf-text: #eee7da;",
   """  --nf-text: #eee7da;
  --nf-text-1: #d3cab6;"""),

  ('text-3-AA', "  --nf-text-3: #8a7f6c;",
   """  /* 同浅色：#8a7f6c 对深色三档纸面为 4.66 / 4.30 / 3.90，bg-inset 档不达标。
   * 提到 #9d927b 后为 5.97 / 5.51 / 5.00，全档 ≥4.5。 */
  --nf-text-3: #9d927b;
  --nf-muted: var(--nf-text-3);
  --nf-muted-line: var(--nf-border);"""),

  ('border-2', "  --nf-border-strong: rgba(242, 233, 220, 0.24);",
   """  /* 深色画布上 border 本身已 0.12，故 border-2 取 0.18 而非 0.24 ——
   * 否则与 border-strong 拉不开档，「稍实一点」变成「一样实」。 */
  --nf-border-2: rgba(242, 233, 220, 0.18);
  --nf-border-strong: rgba(242, 233, 220, 0.24);"""),

  ('danger-alias', "  --nf-success: #79b372;\n  --nf-error: #d95753;",
   """  --nf-success: #79b372;
  --nf-error: #d95753;
  --nf-danger: var(--nf-error);
  --nf-toast-ok: var(--nf-success);"""),

  ('ink-layer', "  --nf-danger: var(--nf-error);",
   """  --nf-danger: var(--nf-error);
  /* 深色下的 -ink 要比 -error 本身更亮才够对比度。 */
  --nf-success-ink: #86c47f;
  --nf-success-ink-soft: rgba(134, 196, 127, 0.13);
  --nf-error-ink: #e8837e;
  --nf-error-ink-soft: rgba(232, 131, 126, 0.13);
  --nf-warn-ink: #edb44a;
  --nf-warn-ink-soft: rgba(237, 180, 74, 0.13);
  --nf-info-ink: #8aabd8;
  --nf-info-ink-soft: rgba(138, 171, 216, 0.13);"""),
 ],

 'force-light': [
  ('text-1', "  --nf-text: #26221b;",
   """  --nf-text: #26221b;
  --nf-text-1: #453e33;"""),
  ('text-3-AA', "  --nf-text-3: #8f8679;",
   """  --nf-text-3: #726858;
  --nf-muted: var(--nf-text-3);
  --nf-muted-line: var(--nf-border);"""),
  ('border-2', "  --nf-border-strong: rgba(38, 34, 27, 0.3);",
   """  --nf-border-2: rgba(38, 34, 27, 0.28);
  --nf-border-strong: rgba(38, 34, 27, 0.3);"""),
  ('danger-alias', "  --nf-success: #5f9656;\n  --nf-error: #b94a41;",
   """  --nf-success: #5f9656;
  --nf-error: #b94a41;
  --nf-danger: var(--nf-error);
  --nf-toast-ok: var(--nf-success);"""),
  ('ink-layer', "  --nf-danger: var(--nf-error);",
   """  --nf-danger: var(--nf-error);
  --nf-success-ink: #1b7a3a;
  --nf-success-ink-soft: rgba(27, 122, 58, 0.1);
  --nf-error-ink: #b3271f;
  --nf-error-ink-soft: rgba(179, 39, 31, 0.1);
  --nf-warn-ink: #8a5a00;
  --nf-warn-ink-soft: rgba(138, 90, 0, 0.1);
  --nf-info-ink: #3c5b8a;
  --nf-info-ink-soft: rgba(60, 91, 138, 0.1);"""),
 ],

 # 注意：强制深色块是**独立的第三套色板**（--nf-text-3: #9a917e、--nf-accent: #a63e2a，
 # 与 .view 深色基准不同），不是基准的复刻。数值需按这套纸面单独验算，不能抄基准。
 'force-dark': [
  ('text-1', "  --nf-text: #eee7da;",
   """  --nf-text: #eee7da;
  --nf-text-1: #d3cab6;"""),
  ('text-3-AA', "  --nf-text-3: #9a917e;",
   """  --nf-text-3: #a89d86;
  --nf-muted: var(--nf-text-3);
  --nf-muted-line: var(--nf-border);"""),
  ('border-2', "  --nf-border-strong: rgba(242, 233, 220, 0.24);",
   """  --nf-border-2: rgba(242, 233, 220, 0.18);
  --nf-border-strong: rgba(242, 233, 220, 0.24);"""),
  ('danger-alias', "  --nf-success: #79b372;\n  --nf-error: #d95753;",
   """  --nf-success: #79b372;
  --nf-error: #d95753;
  --nf-danger: var(--nf-error);
  --nf-toast-ok: var(--nf-success);"""),
  ('ink-layer', "  --nf-danger: var(--nf-error);",
   """  --nf-danger: var(--nf-error);
  --nf-success-ink: #86c47f;
  --nf-success-ink-soft: rgba(134, 196, 127, 0.13);
  --nf-error-ink: #e8837e;
  --nf-error-ink-soft: rgba(232, 131, 126, 0.13);
  --nf-warn-ink: #edb44a;
  --nf-warn-ink-soft: rgba(237, 180, 74, 0.13);
  --nf-info-ink: #8aabd8;
  --nf-info-ink-soft: rgba(138, 171, 216, 0.13);"""),
 ],
}


def load_append_payload():
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    with io.open(os.path.join(here, 'append-components.css.txt'), 'r', encoding='utf-8') as f:
        return f.read()


SENTINEL = '新组件族（NoticeBar / ConfirmDialog / Sparkline / CardHead）'


def main():
    s = read()
    if SENTINEL in s:
        print('已应用过本轮补丁，跳过（要重跑请先 git checkout 该文件）')
        return
    crlf = '\r\n' in s
    conv = (lambda t: t.replace('\n', '\r\n')) if crlf else (lambda t: t)
    print(f'行尾: {"CRLF" if crlf else "LF"}')

    # --- 阶段 1：:root 级（全局唯一）---
    for tag, anchor, payload in ROOT_PATCHES:
        a = conv(anchor)
        c = s.count(a)
        if c != 1:
            print(f'ABORT :root/{tag}: 锚点出现 {c} 次（应 1）')
            sys.exit(1)
        s = s.replace(a, conv(payload), 1)
        print(f'  OK :root/{tag}')

    # --- 阶段 2：四套颜色基准 ---
    for name in ['force-dark', 'force-light', 'dark', 'light']:
        blocks = find_blocks(s, conv)
        start, end = blocks[name]
        body = s[start:end]
        for tag, anchor, payload in COLOR_PATCHES[name]:
            a = conv(anchor)
            c = body.count(a)
            if c != 1:
                print(f'ABORT {name}/{tag}: 块内出现 {c} 次（应 1）')
                sys.exit(1)
            body = body.replace(a, conv(payload), 1)
        s = s[:start] + body + s[end:]
        print(f'  OK {name}: {len(COLOR_PATCHES[name])} 处')

    # --- 阶段 3：结构层（密度档 / 组件族 / 动画曲线）---
    for tag, anchor, payload in STRUCT_PATCHES:
        a = conv(anchor)
        c = s.count(a)
        if c != 1:
            print(f'ABORT struct/{tag}: 锚点出现 {c} 次（应 1）')
            sys.exit(1)
        s = s.replace(a, conv(payload), 1)
        print(f'  OK struct/{tag}')

    # --- 阶段 4：追加新组件族（NoticeBar / ConfirmDialog / Sparkline / CardHead）---
    payload = load_append_payload()
    if SENTINEL not in payload:
        print('ABORT append: payload 里找不到哨兵文本')
        sys.exit(1)
    s = s.rstrip('\r\n') + conv(payload)
    print('  OK append: 新组件族')

    io.open(P, 'w', encoding='utf-8', newline='').write(s)
    print('写入完成')


if __name__ == '__main__':
    main()