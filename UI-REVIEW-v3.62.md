# UI 设计规范审查报告 — expense-tracker (yu-v3.62)

审查范围：`index.html`、`css/styles.css`、`js/app.yu-v3.62.js`
对照规范：WCAG 2.1 AA、响应式设计最佳实践、Apple HIG / Material Design
审查日期：2026-08-17

## 汇总
- 总计问题：**15 项**
- 🔴 关键（必须修）：**2 项**
- 🟡 重要（建议修，涉及合规）：**9 项**
- 🔵 建议（优化/一致性）：**4 项**

整体评价：视觉一致性、移动端布局、暗色模式完成度很高；主要短板在**键盘可访问性、屏幕阅读器支持、缩放与动效偏好、部分文字对比度**。

---

## 🔴 关键（Critical）

### 1. 禁用页面缩放 — `index.html:5`
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```
`maximum-scale=1.0, user-scalable=no` 禁止用户双指缩放，违反 **WCAG 2.1 SC 1.4.4（缩放文本）**，对低视力用户不友好，且 App Store / 部分合规审查会因此被拒。
**修复**：移除这两个参数（输入已用 16px 字体，不会触发 iOS 聚焦自动放大，可安全移除）：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

### 2. 弹窗无法用键盘关闭 / 无焦点管理 — `js/app.yu-v3.62.js:2352, 2411`
弹窗仅通过点击 `[data-close]` 关闭，存在：
- 无 **Esc 键**关闭（键盘用户无法关闭弹窗）；
- 打开弹窗时**未把所有焦点移入并约束在弹窗内**（焦点可“逃逸”到背景）；
- 仅部分弹窗（会员 L1435、分擔计算器 L1872、币别 L965）在打开时移入焦点，主记账/缴费/旅程等弹窗未移入。
违反 **WCAG 2.1.1（键盘）** 与 **2.4.3（焦点顺序）**。
**修复**：在 `bindEvents` 增加全局 Esc 关闭可见弹窗；打开弹窗时 `el.querySelector('input,select,textarea,button').focus()`，并为 `.modal` 增加焦点陷阱（Tab 循环）。
```js
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const m = document.querySelector('.modal:not([hidden])');
    if (m) m.hidden = true;
  }
});
```

---

## 🟡 重要（Important）

### 3. 图标按钮缺 `aria-label` — `index.html:71-73, 438`
- `#reminderBtn`（🔔）只有 `title="提醒"`，无 `aria-label`；
- `#fabAdd`（＋）无 `aria-label`。
屏幕阅读器读不出名称，违反 **WCAG 4.1.2（名称/角色/值）**。
**修复**：加 `aria-label`，如 `aria-label="提醒事項"`、`aria-label="新增記帳"`。

### 4. `iosHintClose` 可点击但不可聚焦 — `index.html:54`
`<span class="ios-hint-close" role="button" aria-label="關閉">` 缺 `tabindex="0"`，键盘无法聚焦/触发。
**修复**：加 `tabindex="0"`，并在 JS 补 `keydown`（Enter/Space）处理。

### 5. 搜索框无标签 — `index.html:136`
`<input type="search" id="searchKeyword" placeholder="…">` 仅有 placeholder，无 `<label>` 或 `aria-label`。
**修复**：加 `aria-label="搜尋交易"` 或视觉隐藏 label。

### 6. 必填项未声明 — `index.html:485,489,493,496,586,589,691` 等
必填以红色 `*` 提示，但 `<input>` 无 `required` / `aria-required="true"`，屏幕阅读器不宣告必填。违反 **WCAG 3.3.2（标签或说明）**。
**修复**：在必填 input 加 `aria-required="true"`（或 `required`）。

### 7. 错误讯息未关联输入 — `index.html:487,491,551,587,591,693` 等
`<small class="err" id="errXxx">` 显示错误，但 input 未用 `aria-describedby="errXxx"` 与 `aria-invalid="true"`。违反 **WCAG 3.3.1（错误识别）**。
**修复**：出错时为对应 input 设 `aria-invalid="true"` 与 `aria-describedby="errXxx"`。

### 8. Toast 无 `aria-live` — `js/app.yu-v3.62.js:149-154, index.html:861`
`#toast` 动态更新文字但无 `role="status"` / `aria-live="polite"`，屏幕阅读器用户收不到“已保存/已删除”等状态反馈。违反 **WCAG 4.1.3（状态消息）**。
**修复**：`<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`（保留 `hidden` 控制显隐）。

### 9. 未尊重 `prefers-reduced-motion` — `css/styles.css`（全局）
`shimmer`（L829，无限动画）、`slideUp`/`viewIn`/`toastIn`（L361,569,388）等在所有设备上播放，未包裹 `@media (prefers-reduced-motion: reduce)`。违反 **WCAG 2.3.3（交互动画）**。
**修复**：
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
```

### 10. 文字对比度不足（部分 #999 / `--text-3` / 红绿金额）— `css/styles.css`
- `.app-footer` 用 `--text-3, #999`（L394）：`#999` 在 `#f4f6fa` 约 **2.8:1**，低于 AA 4.5:1。
- `--text-3:#64748b`（L9）用于 11px 提示/脚注，在白底约 **4.0:1**，未达 4.5:1。
- `.txn-amount.expense`（L142，`#ef4444` 15px bold）在白底约 **3.3:1**；`.txn-amount.income`（L143，`#16a34a`）约 **2.8:1**——15px bold 不算“大文字”，需 4.5:1。
违反 **WCAG 1.4.3（对比度，最小）**。
**修复**：提示文字改用 `--text-2(#475569)` 或更深；金额红绿改用更深版本（如 `#dc2626` / `#15803d`）。

### 11. 仅靠颜色传达状态 — 多处
`.bill-item.overdue/.due-soon` 用左边框颜色、`status-tag` 用底色区分，但部分状态仅颜色差异。违反 **WCAG 1.4.1（用颜色编码）** 的精神。
**修复**：在状态旁补文字/图标（如 ⚠️ 逾期），现状 `status-tag` 已有文字，可保留；边框色状态建议加图标。

---

## 🔵 建议（Suggestion）

### 12. 交互元素缺 `:focus-visible` 样式 — `css/styles.css`
`.tab / .chip-btn / .ghost-btn / .icon-btn / .primary-btn` 仅 `:active` 态有反馈，键盘 `:focus` 无可见轮廓（部分浏览器默认轮廓也可能被其他规则覆盖）。违反 **WCAG 2.4.7（焦点可见）** 风险。
**修复**：统一加
```css
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
```

### 13. 重复内联样式 — `index.html:188,299,319,343,361,366,384` 等
多处 `style="margin-top:16px"` 内联，降低可维护性、且易与样式系统不一致。
**修复**：抽取为 class（如 `.stack-gap`）。

### 14. 触控目标略小 — `css/styles.css:536`
`.sel-check` 22×22px，略低于 WCAG 2.5.5 推荐的 24×24 最小触控尺寸。
**修复**：改为 24px 或更大。

### 15. 列表项状态变更无 `aria-live` — `js/app.yu-v3.62.js`
动态列表（记录/账单/账户）刷新时无 `aria-live` 区域播报，屏幕阅读器用户不易察觉内容更新（非必须，属增强项）。

---

## 优点（符合规范的部分）
- 语义结构完整：`<header>/<main>/<nav>/<footer>/<section>`，标题层级合理（h1→h2→h3）。
- 表单用 `<label>` 包裹 input，隐式关联正确；`lang="zh-Hant"` 正确。
- 暗色模式通过 CSS 变量完整实现，对比与层次处理良好。
- 触控目标多数 ≥40px，底部导航居中且 `max-width:520px` 适配移动端。
- 图表 SVG 有 `role="img" aria-label`（L1630）。
- 文本输入普遍用 16px，避免 iOS 聚焦自动放大。
- CSP 已限制资源来源，降低 XSS 面。

---

## 优先修复顺序
1. 🔴 #1 视口缩放、🔴 #2 弹窗键盘/Esc（合规与可用性强相关）
2. 🟡 #8 Toast aria-live、#3/#4/#5 aria-label、#6/#7 表单可访问性
3. 🟡 #9 reduced-motion、#10 对比度
4. 🔵 #12/#13/#14 视觉一致性与焦点样式
