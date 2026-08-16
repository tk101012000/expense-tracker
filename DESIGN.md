# DESIGN.md — 繳費記帳 App 設計規範

> 本文件定義「繳費記帳 · 家庭理財助手」的完整視覺設計系統。
> 所有 UI 修改（CSS / 圖表配色 / 新元件）均須遵循本規範，以確保跨電腦、跨版本一致性。

---

## 1. 設計哲學

- **冷調專業**：以 Slate 灰藍為基底，品牌藍（#2563eb）為主色，傳達「值得信賴的理財工具」感。
- **精緻但不花俏**：每個像素都有目的——陰影分四級、圓角分三檔、動效克制（≤0.28s）。
- **行動優先**：核心佈局以 375px–520px 為目標寬度，觸控熱區 ≥44px。
- **資訊層次**：金額 > 標題 > 標籤 > 提示文字，用字重+字號+顏色三軸共同建立。

---

## 2. 色彩系統

### 2.1 中性色階（Slate 冷調）

| 變數 | 色碼 | 用途 |
|------|------|------|
| `--bg` | `#f4f6fa` | 頁面背景 |
| `--surface` | `#ffffff` | 卡片/面板/彈窗背景 |
| `--surface-2` | `#f7f9fc` | 次級表面（輸入框背景、分隔區塊） |
| `--border` | `#e9edf3` | 邊框、分割線 |
| `--text` | `#0f172a` | 主文字（標題、金額） |
| `--text-2` | `#64748b` | 次文字（標籤、 meta 資訊） |
| `--text-3` | `#94a3b8` | 弱文字（提示、 placeholder、footer） |

### 2.2 品牌色

| 變數 | 色碼 | 用途 |
|------|------|------|
| `--primary` | `#2563eb` | 主按鈕、活躍 Tab、連結、圖表主色 |
| `--primary-dark` | `#1d4ed8` | 主按鈕按下狀態 |
| `--primary-soft` | `#e8f0fe` | 活躍 Tab 背景、標籤底色、badge 底色 |

### 2.3 語義色

| 變數 | 色碼 | 用途 |
|------|------|------|
| `--expense` | `#ef4444` | 支出金額、逾期/危險提示、刪除操作 |
| `--income` | `#16a34a` | 收入金額、成功/已繳狀態 |
| `--warn` | `#f59e0b` | 即將到期、警告提示 |

### 2.4 語義色延伸（背景搭配）

| 場景 | 背景色 | 文字色 |
|------|--------|--------|
| 逾期/危險 | `#fee2e2` | `--expense` (#ef4444) |
| 即將到期 | `#fef3c7` | `#b45309` |
| 正常/已繳 | `#dcfce7` | `--income` (#16a34a) |

### 2.5 圖表配色（CHART_COLORS）

依序使用，確保多圖表間一致性：

```js
const CHART_COLORS = [
  '#2563eb', // 品牌藍（主類別/最大值）
  '#dc2626', // 紅（支出相關）
  '#16a34a', // 綠（收入相關）
  '#f59e0b', // 琥珀（警告/注意）
  '#8b5cf6', // 紫
  '#06b6d4', // 青
  '#ec4899', // 粉
  '#84cc16', // 黃綠
  '#f97316', // 橘
  '#14b8a6', // 青綠
  '#6366f1', // 靛
  '#a855f7', // 淺紫
  '#eab308', // 黃
  '#64748b', // 灰（ fallback / 其他）
];
```

**使用規則**：
- Doughnut 圖：從 index 0 開始依資料順序套用
- 排行條：同上，與對應 doughnut 色一致
- Bar 圖：主色用 `--primary` (#2563eb)，漸層至 `#60a5fa`
- 空狀態文字：`#9ca3af`

---

## 3. 字型系統

### 3.1 字型族

```css
font-family: -apple-system, "Segoe UI", "PingFang TC",
             "Microsoft JhengHei", Roboto, sans-serif;
```

等寬用途（備註 textarea）：`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### 3.2 字型層次

| 層級 | 字號 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| Display | 26px | 400 | — | Logo emoji |
| H1（頂欄標題） | 20px | 700 | — | 頁面標題 |
| H2（卡片標題） | 15px | 700 | — | 區塊標題 |
| 金額大 | 24px | 800 | 1.0 | 總資產卡片值 |
| 金額中 | 20px | 800 | 1.0 | 帳戶餘額 |
| 金額小 | 19px | 800 | 1.0 | 迷你卡片值 |
| Body | 15px | 400 | 1.55 | 內文 |
| Body large（桌面） | 16px | 400 | 1.55 | ≥560px 螢幕 |
| Meta | 14px | 600 | — | 類別名、成員名 |
| Label | 13px | 600 | — | 表單 label、選項 |
| Caption | 12px | 400–700 | — | 卡片標籤、時間、帳戶類型 |
| Tiny | 11px | 400–700 | — | 提示文字、 badge、 footer |
| Micro | 10.5px | 700 | — | 幣別 badge |

**字母間距**：Body `letter-spacing: .1px`；H1 `.3px`；幣別 badge `.2px`  
**金額負字距**：`.card-value` 使用 `letter-spacing: -.5px` 避免大數字過寬

---

## 4. 間距系統

### 4.1 基礎單位

基準單位 = **4px**，所有間距為其倍數：

| 值 | 用途 |
|----|------|
| 4px | gap 微調、內部緊湊間隔 |
| 6px | chip 間距、icon 與文字間距 |
| 8px | 列表項間距、filter bar gap |
| 10px | field-row gap、小區塤 margin |
| 12px | card padding（縱向）、mini-cards gap、主要間距 |
| 14px | main padding（左右）、card padding（橫向）、topbar padding |
| 16px | card padding（完整）、modal-body padding |
| 18px | 桌面版 main padding（≥560px） |
| 20px | primary-btn padding（橫向） |
| 24px | toast bottom offset |
| 28px | main bottom padding（tabbar + 28px） |

### 4.2 區塊間距

```css
#main   { padding: 14px 14px calc(var(--tabbar-h) + 28px); }
.view    { display: flex; flex-direction: column; gap: 14px; }
.card    { padding: 16px; } /* 內部 */
```

---

## 5. 陰影系統

四級陰影，由輕到重：

| 變數 | 值 | 用途 |
|------|-----|------|
| `--shadow-xs` | `0 1px 2px rgba(15,23,42,.04)` | 按鈕、seg-tabs、微浮起元素 |
| `--shadow` | `0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` | 卡片預設陰影 |
| `--shadow-md` | `0 4px 14px rgba(15,23,42,.08)` | 卡片 hover 狀態 |
| `--shadow-lg` | `0 14px 30px rgba(15,23,42,.14), 0 4px 10px rgba(15,23,42,.08)` | FAB Tab、Modal 背景遮罩、Toast |

**頂欄專用**：`box-shadow: 0 2px 12px rgba(15,23,42,.12)`  
**iOS hint 專用**：`box-shadow: 0 2px 10px rgba(0,0,0,.15)`

---

## 6. 圓角系統

| 變數 | 值 | 用途 |
|------|-----|------|
| `--radius` | **18px** | 卡片、modal-card、FAB |
| `--radius-sm` | **12px** | 按鈕、輸入框、txn-icon、account-icon、seg |
| `--radius-xs` | **10px** | chip、filter panel、month-chip、mini-select |
| **22px** | — | modal-card 頂部圓角（`border-radius: 22px 22px 0 0`） |
| **9px** | — | seg 內按鈕、type-toggle 內按鈕 |
| **20px** | — | pill 標籤、pay-btn、badge |
| **999px** | — | 分擔進度條（全圓） |

---

## 7. 元件規範

### 7.1 頂欄（Topbar）

- **位置**：`position: sticky; top: 0; z-index: 30`
- **背景**：漸層 `linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)`
- **文字**：白色 `#fff`
- **高度**：自適應，padding `14px` + safe-area-inset-top
- **陰影**：`0 2px 12px rgba(15,23,42,.12)`
- **結構**：左側 logo(26px) + 標題(20px/700) + 副標題(12px)；右側 icon-btn(40px)

### 7.2 卡片（Card）

```css
.card {
  background: var(--surface);
  border-radius: var(--radius);       /* 18px */
  padding: 16px;
  box-shadow: var(--shadow);          /* 預設 */
  border: 1px solid var(--border);    /* 細邊框 */
  transition: transform .2s, box-shadow .2s;
}
/* hover（僅滑鼠裝置） */
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

**餘額卡片（balance-card）特例**：
- 背景：漸層 `linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)`
- 文字：白色；label/hint 用 `rgba(255,255,255,.8)`

**迷你卡片（mini）**：grid 2 欄，收入值用 `--income` 色，支出值用 `--expense` 色

### 7.3 按鈕

| 類型 | 背景 | 文字 | 圓角 | 陰影 | 互動 |
|------|------|------|------|------|------|
| Primary | `--primary` | 白 | 12px | `--shadow-xs` | active: `--primary-dark` + scale(.98) |
| Ghost | `--surface-2` | `--text` | 12px | 無 | active: scale(.98) |
| Danger | `#f1f5f9` | `--text-2` | 12px | 無 | active: scale(.98) |
| FAB | 透明 + `2px dashed --border` | `--primary` | 18px | 無 | active: border/bg 變 primary 色 |
| Icon Btn | `rgba(255,255,255,.15)` (頂欄) / `--surface-2` (一般) | 繼承 | 12px | — | — |
| Chip Btn | `--surface` + `1px solid --border` | `--text` | 12px | — | — |
| Pay Btn (未繳) | `--primary` | 白 | 20px | — | — |
| Pay Btn (已繳) | `--surface-2` | `--income` + border | 20px | — | — |

### 7.4 Tabbar

- **位置**：`position: fixed; bottom: 0; z-index: 40`
- **寬度**：100%, max-width 520px（與 #app 同）
- **高度**：62px + safe-area-inset-bottom
- **背景**：`--surface` + `border-top: 1px solid --border`
- **Tab**：icon(20px) + label(11px)，color `--text-3`，grayscale + opacity .7
- **Tab.active**：color `--primary`，bg `--primary-soft`（藥丸形），icon 取消 grayscale
- **FAB Tab**：52px 圓形，`--primary` 背景，白色，`margin-top: -20px` 浮起，`--shadow-lg`

Tab 順序：總覽 → 記帳 → 繳費 → **＋(FAB)** → 繳費統計 → 統計 → 帳戶

### 7.5 彈窗（Modal）

- **遮罩**：`rgba(15,23,42,.45)` + `backdrop-filter: blur(3px)`
- **面板**：從底部滑入（slideUp .25s），圓角頂部 22px，max-height 92vh
- **標題列**：sticky top，17px 標題，icon-btn 關閉
- **內容**：padding 18px，flex column，gap 14px
- **表單欄位**：label 13px/600，input 16px，padding 12px，圓角 12px
- **focus**：border 變 `--primary`，無 outline

### 7.6 Segment Tabs（分段切換）

- 容器：`--surface-2` 背景 + `--border` + `--shadow-xs`，圓角 12px，內 padding 4px
- 選項：圓角 9px，13px/600，active 時 `--primary` bg + 白字 + `--shadow-xs`

### 7.7 Type Toggle（收支切換）

- 容器：`--surface-2`，圓角 12px，padding 4px
- 按鈕：圓角 9px，10px padding，700 字重
- **支出 active**：`--expense` bg + 白字
- **收入 active**：`--income` bg + 白字

### 7.8 Month Chips（發生月份）

- 容器：flex wrap，gap 6px
- Chip：圓角 10px，`1px solid --border`，`--surface` bg，width ≈ 16.66%（一行 6 個）
- Hover：border 變 `--primary`
- Active（on）：`--primary` bg + border + 白字

### 7.9 列表項

**交易（txn-item）**：
- padding: 10px 8px，圓角 `--radius-sm`(12px)
- 結構：icon(42px, 圓角 12px) + main(flex:1) + amount(15px/700)
- Active：bg `--surface-2`

**繳費（bill-item）**：
- padding: 14px，圓角 `--radius`(18px)，`--shadow`
- 左邊框指示：overdue 4px `--expense`，due-soon 4px `--warn`
- paid: opacity .62；inactive: opacity .62

### 7.10 Toast

- 固定於 tabbar 上方 24px
- 背景 `#111827`，白字，圓角 24px
- `--shadow-lg`，toastIn .2s 動畫

### 7.11 Status Tag（狀態標籤）

- 11px，圓角 10px，700 字重，padding: 2px 8px
- overdue: `#fee2e2` bg + `--expense` 文字
- soon: `#fef3c7` bg + `#b45309` 文字
- ok: `#dcfce7` bg + `--income` 文字
- inactive: `#e5e7eb` bg + `--text-2` 文字

---

## 8. 動效原則

| 動效 | 時間 | Easing | 觸發 |
|------|------|--------|------|
| 頁面切入（viewIn） | 0.28s | ease | view 切換時 |
| Modal 滑入（slideUp） | 0.25s | ease | modal 打開 |
| Toast 彈入（toastIn） | 0.2s | ease | toast 顯示 |
| Card hover 浮起 | 0.2s | ease | 滑鼠懸停（僅 hover 裝置） |
| Button active 縮放 | 0.12s | — | 按下瞬間（scale .98） |
| Chip 切換 | 0.12s | ease | month-chip on/off |
| Tab 切換 | 0.2s | ease | tab active 切換 |
| FAB Tab 按下 | 0.15s | ease | scale(.9) |
| 一般背景/邊框过渡 | 0.15s | ease | button, fab 等 |

**原則**：
- 所有動效 ≤ 0.28s，不拖慢操作節奏
- hover 效果僅在 `@media (hover: hover)` 生效（不影響觸控裝置）
- 不使用 infinite loop 動畫

---

## 9. 圖表規範

### 9.1 Doughnut（環形圖）

- 尺寸：canvas height 220px（CSS），寬度自適應容器
- 外半徑 r = min(w,h)/2 - 10；內半徑 ir = r * 0.6（60% 中空）
- 配色：CHART_COLORS[i % length]，依資料順序
- 中心文字：總金額（18px/700）+ 標籤（11px/#6b7280）
- 空狀態：#9ca3af 文字居中
- Legend：swatch(10px 方塊, 圓角 3px) + 名稱 + 百分比

### 9.2 Bar Chart（長條圖）

- 軸線：#e5e7eb，1px
- 網格線：#f3f4f6（水平）
- 刻度文字：#9ca3af，10px
- Bar：#2563eb，圓角頂部 5px，寬度佔 55%
- 左 padding 44px（刻度），右 12px，上 14px，下 26px

### 9.3 Rank Bar（排行條）

- 軌道：`--surface-2` 背景，height 8px，圓角 4px
- 填充：CHART_COLORS 對應色，圓角 4px
- 標籤：13px，固定寬度 82px
- 數值：12px `--text-2`，固定寬度 88px 右對齊

---

## 10. 響應式斷點

| 斷點 | 條件 | 變化 |
|------|------|------|
| 窄螢幕 | ≤380px | 成員圖表改單欄堆疊、ios-hint 縮小 |
| 標準 | 381–559px | 預設樣式 |
| 寬螢幕 | ≥560px | body 字號 16px、main padding 加大到 18px |

容器最大寬度：`#app { max-width: 520px; margin: 0 auto; }`

---

## 11. 安全區域與瀏覽器相容

- Topbar：`padding-top: max(14px, env(safe-area-inset-top))`
- Tabbar：`padding-bottom: env(safe-area-inset-bottom)`，height 含 safe area
- Modal：`padding-bottom: env(safe-area-inset-bottom)`
- Viewport meta：`viewport-fit=cover`
- `-webkit-tap-highlight-color: transparent`（全域關閉點擊高亮）
- `overscroll-behavior-y: none`（防止下拉彈跳）
- Font smoothing：antialiased + grayscale（macOS 最佳呈現）

---

## 12. 暗色模式（預留）

> 目前未實作暗色模式。未來若加入，需新增 `[data-theme="dark"]` 或 `@media (prefers-color-scheme: dark)` 覆蓋以下變數：

| 變數 | 亮色值 | 建議暗色值 |
|------|--------|-----------|
| `--bg` | #f4f6fa | #0f172a |
| `--surface` | #ffffff | #1e293b |
| `--surface-2` | #f7f9fc | #334155 |
| `--border` | #e9edf3 | #334155 |
| `--text` | #0f172a | #f1f5f9 |
| `--text-2` | #64748b | #94a3b8 |
| `--text-3` | #94a3b8 | #64748b |
| `--primary-soft` | #e8f0fe | #1e3a5f |

語義色（--expense/--income/--warn）保持不變。

---

## 13. 版本對應

| 版本 | 設計變更 |
|------|---------|
| v3.47 | 建立精緻化基礎：slate 色階、四級陰影、細邊框卡片、頂欄漸層、tabbar 藥丸、微動效 |
| v3.48+ | 本規範之後的修改均應更新此文件 |

---

*此文件隨 repo 部署到 GitHub Pages，任何電腦 clone 後均可參考。*
