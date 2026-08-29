# 記帳 APP 問題巡檢報告（v3.71）

> 巡檢方式：讀碼審查（語法、資料流、邊界條件、CSS 對應、持久化），未跑瀏覽器實測。
> 結論：**功能面無重大 bug，剩餘皆為低風險的一致性 / 邊界 / UX 問題**。

## ✅ 已確認正確（無需處理）
| 項目 | 說明 |
|------|------|
| 旅程資料持久化 | `load()` 第 192 行 `DB.trips ||= []`、`save()` 整個 `DB` 序列化 → 旅程不會在重整後遺失 |
| 結算數學 | `computeTripSettle` / `settleDebts` 驗算：多人合付 + 分擔模式（含付款人不在分擔名單）淨額正確 |
| v3.71 新功能 | `buildTripDaily`（每日花費）、`copyTripSettle`（剪貼簿 + `execCommand` 降級）邏輯正確 |
| 圖表渲染 | `canvas{width:100%!important}` 存在，新長條圖 canvas 會全寬；`drawBars` 空資料已 guard |
| 記帳列表付款人篩選 | 一般交易 `paidBy` 為字串（單一下拉），`t.paidBy !== payerF` 嚴格比對正確（多付款人陣列僅旅程獨立帳本使用，互不干擾） |
| 分帳入帳 | `recordSplitTxn` / `computeSplitAmounts`（equal & ratio）正確，含尾差修正 |
| OCR | `parseReceiptText` 純正則、不拋錯；金額/日期/店家解析邏輯合理 |
| git / 部署 | tracking ref 已同步；APK 不需重打包（讀 `window.APP_VERSION`=yu-v3.71） |

## ⚠️ 發現的問題（依嚴重度）

### P3（低，建議修）— CSS 版本號不同步
- 位置：`index.html` 第 17 行 `<link rel="stylesheet" href="css/styles.css?v=yu-v3.70" />`
- 現象：app 已 v3.71，但 CSS cache-buster 仍是 `yu-v3.70`。
- 影響：**功能不受影響**（v3.70→v3.71 未改 CSS 內容），但版本號不一致；未來若改 CSS 容易忘記刷新快取。
- 修法：改 `?v=yu-v3.71`（純字串）。

### P3（低，邊界）— 排序依賴 `createdAt`
- 位置：`renderDashboard` 第 409 行、`renderRecords` 第 468–472 行，使用 `(b.date + b.createdAt)` 做字串排序。
- 現象：若匯入的舊資料缺 `createdAt`，會變成 `"2026-08-29undefined"` 字串拼接，仍可排序但同日多筆的先後可能不精確。
- 修法：改用 `(b.date + (b.createdAt || 0))` 或在排序前補 `createdAt`。

### P4（極低，UX）— 旅程明細幣別顯示不一致
- 現象：`tripTxnRow` 顯示**原交易幣別**金額（`fmtMoneyCur(t.amount, t.currency)`），但上方預算 / 結算把金額用 `tripConvert` 轉成**旅程幣別**加總。當旅程幣別 ≠ 交易幣別且**未設匯率**時，`tripConvert` 直接回傳原值（不換算），使用者可能誤以為已自動換算。
- 修法（建議）：未設匯率時，在旅程明細頂部加一行提示「未設匯率，金額未按幣別換算」。

## 未發現
- 無 JS 語法錯誤（已逐段讀碼確認）。
- 無懸空函式引用、無對已刪除 v3.70 檔的引用（index.html / sw.js 只引用 app.yu-v3.71 + cloud.yu-v3.70）。
- 無會導致整頁崩潰的讀取路徑（load 有損壞備份 + 重置機制）。

## 建議處理順序
1. P3 CSS 版本號 → 一行改完即可，順手帶入下次發版。
2. P3 `createdAt` 排序 → 兩處加 `|| 0`。
3. P4 匯率提示 → 視需求，可等下次旅程相關改版一併做。

---

## ✅ 已修復（v3.72）
- **P3 #1 CSS 版本號**：`index.html` 第 17 行 cache-buster 由 `yu-v3.70` → `yu-v3.72`（隨本次發版一併修正）。
- **P3 #2 `createdAt` 排序**：`renderDashboard` 第 409 行、`renderRecords` 第 469 / 472 行三處 `b.createdAt` 均改為 `(b.createdAt || 0)`，匯入舊資料缺 `createdAt` 時不再拼接出 `undefined`，同日多筆維持穩定排序。
- **P4 旅程匯率提示**：`renderTripDetail` 計算 `missingRateCurs`（有外幣花費但未設匯率者），於明細頂部顯示琥珀色警示橫幅「未設匯率…結算以原值計入（幣別）」，並在 `styles.css` 新增 `.rate-warn` 樣式。
- 版本號同步：JS 檔改名 `app.yu-v3.71.js` → `app.yu-v3.72.js`，`APP_VERSION` → `yu-v3.72`，`index.html` / `sw.js` 引用同步更新。
- 語法驗證：`node --check` 通過，無剩餘 `v3.71` 懸空引用（除本報告與 `// v3.71` 註解外）。
