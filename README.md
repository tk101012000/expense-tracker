# 繳費記帳 · 家庭理財助手

一款可安裝於 Android 的**離線記帳 + 週期繳費提醒** Web App（PWA）。純前端實作，資料存在本機瀏覽器，可選擇備份到個人雲端硬碟（Google Drive / Dropbox）。

> 線上網址：https://tk101012000.github.io/expense-tracker/
> 在 Android Chrome 開啟後，點選單「加到主畫面」即可安裝成獨立 App，離線也能使用。

---

## 功能一覽

| 功能 | 說明 |
|------|------|
| 記帳 | 收支紀錄新增 / 編輯 / 刪除（金額、日期、類別、備註、帳戶） |
| 繳費管理 | 每月 / 每季 / 每年週期項目，已繳 / 未繳標記，**勾選「標記為已繳」會自動產生一筆支出** |
| 到期提醒 | 到期前 7 天或逾期，於頂部鈴鐺與總覽高亮提示 |
| 分類統計 | 依月份產生「類別佔比圖」+「近 6 月趨勢圖」+ 類別排行（Canvas 自繪，無外部依賴） |
| 帳戶管理 | 現金 / 銀行 / 信用卡多帳戶，即時計算餘額與交易明細 |
| 搜尋篩選 | 關鍵字、日期區間、類別、帳戶、類型篩選 + 日期 / 金額排序 |
| 資料儲存 | localStorage 本地持久化 + 匯出 **CSV**（含 BOM，Excel 中文正常）/ **JSON** + JSON 匯入還原 |
| 雲端備份 | 可連接 Google Drive / Dropbox，一鍵上傳 / 下載備份 |
| 輸入驗證 | 金額須 > 0、名稱必填，欄位即時錯誤提示 + toast；刪除二次確認；帳戶有交易則禁止刪除 |

---

## 技術架構

純靜態前端，**無任何框架、無建置步驟、可離線**：

```
expense-tracker/
├── index.html        # 頁面結構（底部 tab + 彈窗表單）
├── css/styles.css     # 回應式樣式（手機優先，淺色主題）
├── js/app.js          # 核心邏輯：資料層、CRUD、繳費、統計、圖表、搜尋、匯出
├── js/cloud.js        # 雲端備份（Google Drive / Dropbox OAuth2 PKCE，無後端）
├── manifest.json      # PWA 安裝設定（相對路徑，相容子目錄部署）
├── sw.js              # Service Worker（離線快取）
└── icons/             # PWA 圖示（192 / 512 / maskable-512）
```

- 資料層：`localStorage` 鍵 `billing_app_v1`，結構 `{ accounts, txns, bills }`
- 圖表：原生 Canvas 繪製，不依賴 Chart.js 等外部庫
- 幣別：依台灣習慣，支出紅、收入綠，符號 `¥`

---

## 本地預覽（開發用）

不需要安裝任何東西，用任意靜態伺服器即可：

```bash
# 方式一：Python
cd expense-tracker
python -m http.server 8080
# 瀏覽器開 http://localhost:8080

# 方式二：Node
npx serve expense-tracker
```

> 直接雙擊 `index.html` 也能開，但 Service Worker / 雲端 OAuth 等功能需要 `http(s)://` 環境，建議用上面的伺服器方式。

---

## 部署（GitHub Pages）

本專案已部署在 `tk101012000/expense-tracker`，網址：
**https://tk101012000.github.io/expense-tracker/**

日後要更新程式碼：

```bash
cd expense-tracker
# 修改檔案後
git add -A
git commit -m "描述這次修改"
git push
```

GitHub Pages 會在約 1 分鐘內自動重新發布。

### 首次從零部署（若換帳號 / 換 repo）

```bash
# 1. 在 GitHub 建立 public repo（例如 expense-tracker）
# 2. 在本機初始化並推送
cd expense-tracker
git init
git add -A
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/<你的帳號>/expense-tracker.git
git push -u origin main

# 3. 到 repo 的 Settings → Pages → Source 選 main 分支 / (root) → Save
# 4. 等候約 1 分鐘，網址即為 https://<你的帳號>.github.io/expense-tracker/
```

> 所有路徑皆為相對路徑，manifest 的 `start_url` / `scope` 為 `./`，因此放在 `/expense-tracker/` 子目錄也能正常運作（含 PWA 安裝、Service Worker、圖示）。

---

## 雲端備份 OAuth 設定

雲端備份功能使用**客戶端 OAuth 2.0 PKCE**——不需要後端伺服器、不暴露密鑰，資料直接進到你自己的雲端私人空間。

### 取得重新導向網址

打開 App →「帳戶」頁 →「☁️ 雲端備份」卡片下方會顯示目前的重新導向網址，例如：

```
https://tk101012000.github.io/expense-tracker/
```

請直接複製這個值，確保與你在下方開發者後台登記的完全一致（大小寫、結尾斜線都要相同）。

### Google Drive

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) → 建立專案
2. 「API 和服務」→「程式庫」→ 啟用 **Google Drive API**
3. 「憑證」→「建立憑證」→ **OAuth 2.0 用戶端 ID**（應用程式類型選 **Web 應用程式**）
4. 「已授權的重新導向 URI」加入上面複製的網址 → 儲存
5. 複製產生的 **Client ID**，貼進 App 的「Client ID / App Key」欄 → 按「連接雲端」

備份會寫入 Drive 的私人 `appDataFolder`，不會塞滿你的雲端根目錄。

### Dropbox

1. 前往 [Dropbox App Console](https://www.dropbox.com/developers/apps) → 「Create app」
2. 類型選 **Scoped App**，權限勾選檔案讀寫（`files.content.write` / `files.content.read`）
3. 設定「Redirect URIs」為上面複製的網址 → 儲存
4. 複製 **App key**，貼進 App → 按「連接雲端」

> 小提醒：Google Drive 的瀏覽器 CORS 支援最穩定，建議優先使用。Dropbox 的 token 交換端點偶有跨域限制，若連接報錯請改用 Google Drive。

---

## 資料匯出 / 匯入

- **CSV 匯出**：「帳戶 → 資料管理 → 匯出 CSV」，內含完整交易明細（UTF-8 BOM，Excel 直接開中文正常）
- **JSON 匯出**：匯出全部資料（帳戶 / 交易 / 繳費）備份檔
- **JSON 匯入**：選擇備份檔還原（會先二次確認再覆蓋本機）
- **清空資料**：「帳戶 → 資料管理 → 清空資料」（清成完全空白，不再塞回範例）

---

## 常見問題

**Q：打不開 / 顯示空白？**
先強制重新整理（手機 Chrome 選單 → 重新整理）。若從 CloudStudio 舊網址進入可能已休眠，請改用 GitHub Pages 網址。

**Q：彈窗關不掉？**
已修復（CSS `[hidden]{display:none!important}`）。若仍發生請強制重新整理清掉舊快取。

**Q：雲端連不上，報 `redirect_uri_mismatch`？**
Google Cloud Console 的重新導向 URI 跟 App 實際發出的不一致。請到 App 內複製「雲端備份」卡片下方的確切網址，貼到後台，注意結尾斜線與 `https` 都要相符。

**Q：換手機資料怎麼帶過去？**
先用「JSON 匯出」存一份，新手機安裝 App 後用「JSON 匯入」還原；或設定雲端備份後用上傳 / 下載。

---

## 自訂與維護

- **新增 / 修改類別**：編輯 `js/app.js` 頂部的 `EXPENSE_CATS` / `INCOME_CATS` 陣列
- **調整配色**：修改 `css/styles.css` 頂部的 CSS 變數（`--primary`、`--bg` 等）
- **改預設貨幣符號**：搜尋 `js/app.js` 中的 `¥` 字樣替換
- **類別圖示**：`CAT_ICON` 對照表（類別名稱 → emoji）

---

## 隱私說明

- 所有記帳資料僅存在**你裝置的瀏覽器 localStorage**，未連雲端前不會上傳任何資料
- 雲端備份僅在你主動點擊「上傳」時，經 OAuth 寫入**你自己的** Google Drive / Dropbox 私人空間
- 本專案無任何伺服器端程式碼，開發者無法看到你的資料
