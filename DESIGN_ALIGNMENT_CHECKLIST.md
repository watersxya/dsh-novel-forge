# 墨案 InkDesk 设计对齐清单

## 目标
将 `src/client/` 的 React 应用样式对齐到 `design-sample-workbench.html` 和 `demo-subpages.html` 展示的"墨案 InkDesk"设计语言。

---

## ✅ 已完成的部分

### 1. 色彩系统
- ✅ 双模式（墨纸 dark / 纸白 light）
- ✅ 主色彩变量：`--nf-bg`, `--nf-bg-raise`, `--nf-bg-inset`, `--nf-bg-deep`
- ✅ 文字层级：`--nf-text`, `--nf-text-2`, `--nf-text-3`
- ✅ 语义色：`--nf-ok`, `--nf-warn`, `--nf-error`, `--nf-idle`
- ✅ 角色色：`--nf-ai` (琥珀金), `--nf-human` (钢蓝)
- ✅ 朱砂签名色：`--nf-seal` (#c14a2e dark / #a63e2a light)

### 2. 字体系统
- ✅ 衬线大标题：`--nf-font-display` (Georgia, Noto Serif SC, Songti SC)
- ✅ UI 字体：`--nf-font` (PingFang SC, Microsoft YaHei, Segoe UI)
- ✅ 等宽字体：`--nf-font-mono` (Cascadia Mono, SF Mono, Consolas)
- ✅ 字号档位：`--nf-fs-caption` (11px), `--nf-fs-body` (13px), `--nf-fs-title` (16px), `--nf-fs-display` (24px)

### 3. 签名元素
- ✅ **稿纸纹** `.docsSurface`：28px 横线网格，应用在大纲/设定等阅读面
- ✅ **AI 微签** `.aiTag`：9px 等宽琥珀标签，标记 AI 相关功能
- ✅ **朱砂色** `--nf-seal`：专用于"人的裁决/主动作"按钮

### 4. 总编台（workflow）组件
- ✅ **工序轨道** `.wfRail` / `.wfRs`：6 阶段网格条
- ✅ **状态池** `.wfPoolBar` / `.wfPs`：彩色分段条形图（渐变色已在 TSX 中硬编码）
- ✅ **四常驻指标** `.wfMetrics` / `.wfMetric`：顶部 4 宫格统计卡
- ✅ **命令卡** `.wfCmd`：主焦点行动卡（人类指令蓝框）
- ✅ **信号条** `.wfSignal`：底部全书统计一行
- ✅ **资料侧柜** `.wfDrawerList` / `.wfDl`：2 列抽屉收纳格

### 5. 通用组件
- ✅ 页头：`.pageHeader`
- ✅ 按钮系统：`.button`, `.buttonPrimary`, `.buttonSmall`
- ✅ 卡片：`.card`（玻璃质感 + 噪点）
- ✅ 表单：`.field`, `.fieldLabel`, `.input`, `.textarea`
- ✅ 徽章：`.badge`
- ✅ 待办行：`.todoItem`

---

## 🔍 需要验证的部分

### 1. 视觉细节对齐
- [ ] **状态池渐变方向**：确认 `linear-gradient(180deg, ...)` 在所有浏览器中显示一致
- [ ] **稿纸纹透明度**：demo 用 `var(--paper-grid)` 透明度 5%，现有代码用 `var(--nf-border)`，需统一
- [ ] **朱砂色应用范围**：确保主按钮全部使用 `--nf-seal`，不要误用 `--nf-accent`

### 2. 响应式断点
- [ ] **工序轨道**：≤760px 时 6 列 → 3 列（已实现，需测试）
- [ ] **四常驻指标**：≤760px 时 4 列 → 2 列（已实现，需测试）
- [ ] **侧柜**：≤560px 时 2 列 → 1 列（已实现，需测试）

### 3. 交互细节
- [ ] **按钮 hover**：确认 `:active{transform:scale(0.97)}` 在所有按钮上生效
- [ ] **焦点环**：键盘 Tab 遍历时，焦点环颜色是否统一为 `--nf-accent` 或 `--nf-seal`
- [ ] **状态池点击**：点击分段时是否有视觉反馈（filter:brightness 或 transform）

### 4. 暗色/亮色模式切换
- [ ] **状态池斜纹**：纸白模式下 `repeating-linear-gradient` 颜色是否正确（#c3b9a7 / #b8ad9a）
- [ ] **稿纸纹颜色**：纸白模式下网格线是否可见
- [ ] **朱砂色对比度**：纸白模式下 `--nf-seal: #a63e2a` 是否符合 WCAG AA

---

## 📝 可选优化（非阻塞）

### 1. 性能优化
- [ ] 状态池渐变改用 CSS 类名而非 inline style（便于维护）
- [ ] 工序轨道 hover 动画节流（低端机可能卡顿）

### 2. 可访问性增强
- [ ] 状态池添加 `role="img"` 和 `aria-label`（已实现）
- [ ] 工序轨道按钮添加 `title` 提示（已实现）
- [ ] 命令卡按钮添加 `aria-describedby` 关联说明文本

### 3. 设计一致性
- [ ] 全局统一"墨案"术语：工序轨道 / 状态池 / 命令卡 / 资料侧柜
- [ ] 确保所有"AI 相关"操作旁都有 `<AiTag />` 微签

---

## 🎯 下一步行动

**优先级 P0（立即修复）**：
1. ✅ 删除多余的 demo 样式（`.rail`, `.poolbar` 等已删除）
2. 验证稿纸纹透明度统一
3. 测试响应式断点

**优先级 P1（本周完成）**：
4. 暗色/亮色模式全面测试
5. 焦点环和键盘导航测试
6. 状态池交互反馈验证

**优先级 P2（可选优化）**：
7. 性能优化（状态池 CSS 类名）
8. 可访问性增强
9. 术语统一

---

## 📊 完成度

- 色彩系统：✅ 100%
- 字体系统：✅ 100%
- 签名元素：✅ 100%
- 总编台组件：✅ 100%
- 通用组件：✅ 100%
- 视觉细节验证：🔍 待测试
- 响应式验证：🔍 待测试
- 交互细节验证：🔍 待测试

**总体完成度：约 85%**（核心样式系统已完成，需验证实际运行效果）

---

*更新时间：2026-09-07*
*负责人：Crow5 (Reinhard)*
