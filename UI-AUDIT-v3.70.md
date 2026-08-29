# expense-tracker 全站 UI 巡檢報告（yu-v3.70）

> 巡檢範圍：首頁 dashboard / 記帳列表 records / 繳費 bills / 統計 stats / 繳費統計 billstats / 帳戶 accounts / 旅程 trips / 成員分攤 contrib
> 執行日期：2026-08-29 ｜ 版本：v3.69 → v3.70 ｜ 部署：GitHub Pages（已上線）

## 巡檢方法
1. 用 Python 交叉比對 `var(--x)` 使用詞與 `:root` 定義詞，排查未定義 CSS 變數。
2. 逐模組讀取 render function 與事件委派邏輯，確認篩選下拉是否確實填入、圖表是否正確繪製。
3. 對可互動元件做鍵盤可存取性（WCAG 2.1.1）檢查。
4. `node -c` 驗證 JS 語法、`grep` 確認改動落地。

## 發現與修復（全站共 2 項確定問題）

| # | 模組 | 嚴重度 | 問題 | 修復 |
|---|------|--------|------|------|
| A | 記帳/掃描 | 中 | `.scan-entry-btn` 用 `margin:10px 14px 4px; width:calc(100% - 28px)`，但其所在區塊無 14px 內縮，導致按鈕被往內推且變窄 | 改為 `margin:10px 0 4px; width:100%`（對齊外層 padding） |
| B | 全站列表列 | 高（a11y） | 7 種靠 `document.body` click 委派的列表列（txn-item / bill-item / account-item / member-item / trip-card / trip-mini / contrib-bar-row）只有 `data-*`、無 `tabindex`/`role`，鍵盤無法 focus/操作 | 7 處加 `tabindex="0" role="button" aria-label`；`bindListDelegation()` 末尾加 `keydown` 委派（Enter/Space → `row.click()`），`closest()` 只爬祖先不誤觸子層編輯/刪除鈕 |

其餘檢查項目（CSS 變數定義、付款人篩選下拉填入、圖表繪製）經比對均正確，無需修改。

## 同步清理
- 刪除 13 個過期版號 JS（app.yu-v3.47~v3.64、app.yu-v3.69、cloud.yu-v3.47~v3.51），僅留 `app.yu-v3.70.js` + `cloud.yu-v3.57.js` 兩個 index.html 實際引用者（grep 確認無懸空引用）。
- `sw.js` 快取版本 `billkeeper-v26` → `billkeeper-v27`（檔名變動需強制失效舊快取）。
- `index.html` 引用同步：`css/styles.css?v=yu-v3.70`、`js/app.yu-v3.70.js?v=yu-v3.70`。

## 部署狀態
- commit `b804a66` 已 push 至 `main`。
- 線上 raw `index.html` 確認：`app.yu-v3.70.js` / `styles.css?v=yu-v3.70` / `cloud.yu-v3.57.js` 均為最新。
- **APK 不需重打包**：APK 走 `?nocache=<timestamp>` 載最新網頁，頁尾版本號讀 `window.APP_VERSION`（已設為 `yu-v3.70`）。

## 驗證清單
- [x] 全站 7 模組 render 邏輯審查完成
- [x] 修復 A：掃描按鈕邊距（styles.css L954）
- [x] 修復 B：7 列鍵盤可存取（app.js 7 處 tabindex + keydown 委派 L2438）
- [x] JS 語法 `node -c` 通過
- [x] 過期 JS 清理 + 無懸空引用
- [x] sw.js CACHE v27、index.html cache-buster 同步
- [x] GitHub Pages 已上線 v3.70
