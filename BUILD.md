# 構建與發布指南（BUILD.md）

本檔案隨倉庫走，目的：在**任意電腦** clone 本 repo 後，都能照著把 APP 改好、發版、重打包 APK。
（本機 WorkBuddy 的「專案記憶」不會跟著換電腦，所以把關鍵流程寫在這裡。）

---

## 🤖 給 AI 助理 / 新電腦接手：先讀這裡

如果你是**剛被指派來改這個專案的 AI**，或是在**新電腦第一次開這個 repo**，請照這個順序：

1. 讀完**本檔案**（尤其 §3 程式邏輯陷阱）
2. 讀 `DESIGN.md`（UI 設計規範：色彩、間距、元件）
3. `git log --oneline -20` 看最近改了什麼

| 項目 | 內容 |
|---|---|
| Repo | `https://github.com/tk101012000/expense-tracker`（分支 `main`）|
| 型態 | 純前端 PWA，**無後端**，資料存 localStorage |
| 進入點 | `index.html` → `js/app.yu-vX.YZ.js` + `js/cloud.yu-vX.YZ.js` |
| 樣式 | `css/styles.css` |
| 離線快取 | `sw.js`（**JS 改名時必須同步 `CACHE` 與 `ASSETS`**，否則使用者會一直載到舊版）|
| 部署 | push `main` → GitHub Pages 自動上線，約 1 分鐘 |

**協作偏好（使用者指定，請務必遵守）**

- 改完程式碼**直接 commit + push，不用問**。
- 版本號：小改 `+0.01`（v3.86 → v3.87），大改 `+0.1`（v3.86 → v3.9），同步 `APP_BUILD_DATE` 為當天。
- 交付時附功能對照表；使用者用繁體中文（台灣），回覆與程式碼註解都用繁體。
- 使用者常以截圖回報視覺問題，回覆採編號式結構。

### 開場提示詞（換電腦時，複製這段貼給新的 AI）

> 這是我的記帳 PWA 專案。請先 `git clone https://github.com/tk101012000/expense-tracker`，
> 然後**完整讀一遍倉庫根目錄的 `BUILD.md` 和 `DESIGN.md`**——所有背景、已知陷阱、版本號規則
> 和我的協作偏好都寫在裡面，讀完你就具備完整上下文。
> 讀完先簡述你理解的現況，再開始動手。我要改的是：＿＿＿＿。

---

## 0. 這個專案是什麼

- **網頁（PWA）**：純前端，原始碼就在本 repo（`index.html` / `css/` / `js/`）。
- **APK（殼）**：`expense-tracker-*.apk` 只是一個 **WebView/TWA 殼**，載入
  `https://tk101012000.github.io/expense-tracker/`，**不含**網頁原始碼。
- **部署**：push 到 `main` 分支 → GitHub Pages 自動部署 → 手機 APP 打開即讀到最新網頁。

> 結論：大部分修改**只改網頁 + push** 就好，不用碰 APK。

---

## 1. 只改網頁（最常見，90% 的修改）

1. 在目標電腦 `git clone https://github.com/tk101012000/expense-tracker`
2. 用 WorkBuddy（或任何編輯器）開資料夾，改 `js/`、`index.html`、`css/`
3. `git add -A && git commit -m "..." && git push origin main`
4. 等 ~1 分鐘，GitHub Pages 自動上線。手機重新開 APP 即生效。

**不需要**工具鏈、不需要 keystore、不需要重打包。

---

## 2. 改「網頁版本號」（APP 內頁尾顯示的版本）

頁尾版本來自網頁 `APP_VERSION`，且已改成「讀網頁自身版本」。改版時同步以下 4 處：

| 位置 | 改什麼 |
|---|---|
| `js/app.yu-vX.YZ.js` 頂部 | `const APP_VERSION = 'yu-vX.YZ';` 與 `const APP_BUILD_DATE = 'YYYY-MM-DD';` |
| `js/app.yu-vX.YZ.js` 頂部 | 同檔需有 `window.APP_VERSION = APP_VERSION;`（原生 APP 靠這個讀版本） |
| `index.html` | `<script src="js/app.yu-vX.YZ.js?v=yu-vX.YZ">` 與 cloud 同款 |
| `sw.js` | `const CACHE = 'billkeeper-vN';`（每發版 +1，避免舊快取） |

**版本號規則（使用者指定）**：
- 小更新：`APP_VERSION` 尾數 **+0.01**（如 v3.46 → v3.47）
- 大版本：尾數 **+0.1**（如 v3.46 → v3.5）
- 改版同時把 `APP_BUILD_DATE` 設為當天。

> 自 v3.46 起 JS 檔名帶版本號（`app.yu-v3.47.js`）。這是保守保險做法，
> 因為本 APP 啟動網址已帶 `?nocache=<timestamp>`，網頁 JS 每次都是最新的，改名非必要但保留無妨。

---

## 3. 程式邏輯陷阱（改動前必讀）

> 這一節是 v3.82～v3.86 六個版本踩坑換來的。**動結算或勾選框之前先讀**，
> 否則別台電腦的 AI 會把同樣的 bug 再修一次。

### 3.1 結算語意：用「項目 ID 快照」，絕不要用時間戳

專案有兩套結算，**語意完全相同**：
- 帳戶「每人應付」→ `computePaySettle(period)`，快照存 `DB.paySettleSkip[成員id]`
- 旅程「團員結算」→ `computeTripSettle(trip)`，快照存 `trip.settleSkip[成員id]`

| 規則 | 說明 |
|---|---|
| 項目 key | 記帳/旅程花費 = `txn:<id>`；週期繳費 = `bill:<id>:<dueDate>`（**含到期日**，所以繳費滾到下一期會是新 key，才會重新計入） |
| 結清起點 | 標記已結算當下，把該成員「目前計入」的 key 快照起來，之後一律跳過 → 本輪金額立即歸零 |
| ⛔ 時間戳 | v3.82 用 `createdAt > since` 比對，**會漏**：缺 `createdAt` 的舊資料、未來到期的繳費都躲得過 → 勾了金額沒歸零。已廢除 |

### 3.2 「已結算」是動態判定，不是布林值

```js
const isSet = 曾結算過(hasHist) && 本輪未結清項目數(pending) === 0;
```

- `hasHist && pending === 0` → 綠勾「已結算」
- `hasHist && pending > 0` → **自動取消勾選**，改掛琥珀色「新費用 N 筆」徽章（`.settled-badge.pending`）

> v3.83 用單純布林快照，結果「結清後新增費用卻還掛著綠勾」，看起來像已結清其實沒有。

### 3.3 兩個 UI 陷阱（都發生過，別再踩）

1. **`rows` 過濾要保留已結算成員**：
   `filter(r => r.payable > 0 || r.paid > 0 || settledSet.has(r.id))`
   只看金額的話，結清歸零後整列消失 → **取消結算的入口跟著不見**。
2. **批次列要常駐**：`bar.hidden = !(pickable || s)`
   全數結清時若把工具列藏起來，就再也找不到「取消結算」。

### 3.4 勾選框（`.pick-box`）四大鐵則

```html
<!-- 未結算 -->
<label class="pick-box"><input type="checkbox" data-xxx="ID"><span class="tick">✓</span></label>
<!-- 已結算：改成可按的取消按鈕 -->
<button type="button" class="pick-box done" data-xxxunsettle="ID"><span class="tick">✓</span></button>
```

1. ⛔ **不能用 `textContent` 寫勾選狀態**——會連裡面的 `<input>` 一起移除（v3.81 的 bug）。只能切 class。
2. ⛔ **不要加「點 `.pick-box` 就手動切換」的後備邏輯**——`label` 的 activation behavior 是在事件冒泡「**之後**」才轉發給 input，兩邊都切換會**互相抵消**（勾了又馬上取消）。
3. ✅ input 本身已是 40px 透明實體點擊區（CSS `.pick-box input`），手指直接點得到，不需要後備。
4. ✅ 外層清單的 click 監聽要擋 **`.pick-box`**，不是 `[data-xxx]`——input 在 label 內層，`closest('[data-xxx]')` 抓不到，點空白處會誤觸「開啟編輯」。

### 3.5 監聽器不要累積

- `#paySettle` 只換 `innerHTML`、元素本身不重建 → 用 `el.__payWired` 旗標只掛一次（v3.80 修過累積 bug）。
- `renderTripDetail` 每次重建 `wrap.innerHTML` → 監聽器自然消失，**不需要**保護。

### 3.6 `computeSplitAmounts` 的 splitMode 只有兩種

```js
computeSplitAmounts(total, splitMode, shares)
// splitMode: 'equal' | 'ratio'      ← 沒有 'even'、沒有 'none'
```

- `'equal'`：`shares` 只需 `[{ memberId }, ...]`
- `'ratio'`：`shares` 需 `[{ memberId, ratio }, ...]`，ratio 總和應為 100
- ⚠️ 誤傳其他值（如 `'even'`）會掉進 ratio 分支 → `s.ratio` 未定義 → 每人 amount 都是 0
- ⚠️ 而且函式結尾會把差額補到最後一筆（`arr[last].amount += totalAmt - sum`）→ **全部金額集中在最後一個成員**，乍看像計算 bug，其實是資料格式錯了

### 3.7 沒手機時怎麼驗證

| 方法 | 做法 |
|---|---|
| 抽函式測邏輯 | Node 讀 app.js，用大括號平衡抓出 `function xxx(` 原始碼，再 `new Function('DB','save', code + '; return xxx')` 注入假 DB/save 即可跑**真實**程式碼 |
| jsdom 測 UI | **必須 `url: 'http://localhost:8099/'`**；用 `file://` 會因 opaque origin 讓 localStorage 拋 DOMException |
| 斷言別這樣寫 | ⛔ `textContent.match(/已結算/g)` —「標記已結算」按鈕（即使 `hidden`）與計數文字「已結算 3 位」都含這三字。改用 `querySelectorAll('.settled-badge').length` |

### 3.8 協作偏好（使用者指定）

- **改完程式碼直接 commit + push，不用問**。
- 推完用 `git ls-remote origin refs/heads/main` 驗證（E: 槽 junction 下 `git status` 顯示的 ahead 數是假象）。
- 交付時附上功能對照表；使用者習慣用截圖回報視覺問題。

---

## 4. 重打包 APK（改殼本身：tab、權限、設定版本號、全屏等）

### 4.1 前置需求（**不在倉庫內，需自備**）

| 項目 | 說明 |
|---|---|
| **簽名 keystore** | `expense-tracker-release.keystore`（本機實際在 `E:/NAS/記帳app/`，2026-08-30 確認存在。⚠️ 記憶與舊文件曾誤記為 `C:/Users/ASUS/Downloads/`，那是錯的；找不到時請全碟搜尋檔名）|
| **alias** | `expensekey` |
| **密碼** | 請見你另行妥善保管的記錄（**本倉庫不存放憑證**）|
| **證書 SHA-256** | `1B:78:56:90:63:62:66:7A:29:EC:81:F8:60:C7:4E:8B:79:1C:66:0C:44:56:E5:69:03:31:07:72:0D:75:06:DC` |
| **apktool** | 2.11.1（`java -jar apktool.jar`）|
| **JDK** | 17（`keytool` / `java` 所在）|
| **Android SDK build-tools** | 含 `aapt` / `zipalign` / `lib/apksigner.jar` |

> ⚠️ **keystore 檔 + 密碼務必備份**。弄丟就回到「每次都要卸載重裝」的原點。
> 用這把 keystore 簽的 APK 之間可**互相覆蓋安裝**；與原始 v3.41（不同 key）不能覆蓋，須先卸載。

### 4.2 重打包流程

```bash
# 環境變數（請改成你電腦上的實際路徑）
export JAVA_HOME=<JDK17路徑>
J=.../java.exe
SDK=<Android SDK>/build-tools/<版本>      # 含 aapt / zipalign / lib/apksigner.jar
KS=<keystore路徑>/expense-tracker-release.keystore
KS_ALIAS=expensekey
KS_PASS=<密碼>                            # 向使用者索取，勿硬寫進腳本/倉庫

# 1) 反編譯（第一次做；之後改 decoded/ 即可）
java -jar apktool.jar d -f <原APK> -o decoded

# 2) 改版本號：decoded/apktool.yml 的 versionInfo
#      versionCode: 須 > 上一版（v3.46=346，下次=347...）
#      versionName: 設成與網頁一致，如 yu-v3.47

# 3) （見 4.3）若從「原始 v3.41 APK」decode，需 patch smali 原生注入版本號

# 3.5) （見 4.4）重設桌面圖示為熊貓 ← 別忘了這步，否則桌面圖示會退回舊圖
python tools/build_launcher_icons.py decoded/res

# 4) 重打包
java -jar apktool.jar b decoded -o unsigned.apk

# 5) 對齊
$SDK/zipalign.exe -p 4 unsigned.apk aligned.apk

# 6) 簽名（同一把 keystore → 可覆蓋安裝）
java -jar $SDK/lib/apksigner.jar sign \
  --ks "$KS" --ks-key-alias $KS_ALIAS \
  --ks-pass pass:$KS_PASS --key-pass pass:$KS_PASS \
  aligned.apk

# 7) 產出
cp aligned.apk expense-tracker-yu-vX.YZ.apk
```

**驗證**：
```bash
$SDK/aapt dump badging expense-tracker-yu-vX.YZ.apk | grep -i version
java -jar $SDK/lib/apksigner.jar verify --print-certs expense-tracker-yu-vX.YZ.apk
# 確認 versionName 正確、簽名指紋 = 上方 SHA-256
```

**安裝給使用者**：
- 若使用者手機已是「同一把 keystore 簽的舊版」→ **直接覆蓋安裝**。
- 若仍是原始 v3.41（不同 key）→ 先「雲端備份」→ 解除安裝 → 裝新的。

### 4.3 ⚠️ 原生注入版本號的坑（關鍵，2026-08-15 查清）

APP 頁尾顯示的版本**不是網頁給的，是 APK 編譯時硬寫進 smali 的字串**：

- 檔案：`decoded/smali_classes3/com/billingtracker/MainActivity.smali`
- 函式：`injectVersionAndDate()`（在 `onPageFinished` 被呼叫），內含一段 `evaluateJavascript`：
  - `if(v)v.textContent='yu-v3.41';`
  - `if(d)d.textContent='更新於 2026-07-21';`
- 還有兩個常數欄位 `DISPLAY_VERSION` / `DISPLAY_DATE` 也是寫死值。

**症狀**：清快取、重裝 APP 都改不了頁尾數字（因為字串在 APK 裡）。
**修法（已做在 v3.46）**：把注入字串改成讀網頁版本——
```
if(v)v.textContent=(window.APP_VERSION||'yu-vX.YZ');
if(d)d.textContent=('更新於 '+(window.APP_BUILD_DATE||'YYYY-MM-DD'));
```
並把 `DISPLAY_VERSION`/`DISPLAY_DATE` 同步成備援值。

> **重要**：若你是從「原始 v3.41 APK」重新 `apktool d`，smali 會再次硬寫 v3.41，
> 必須重新套用上述 patch。若你是從「已修正的 v3.46+ APK」decode，則已含修正。
> 網頁端 `app.yu-vX.YZ.js` 必須保持 `window.APP_VERSION = APP_VERSION;`，否則頁尾會退回備援值。

### 4.4 ⚠️ APK 桌面圖示必須是熊貓（每次重打包都要做）

**症狀**：使用者回報「我的圖示原本是熊貓」，但手機桌面看到的不是。

**根因**：`decoded/` 是從**原始 v3.41 APK** 反編譯來的，它的
`res/mipmap-*/ic_launcher.png` 是那時候的「藍底 ¥ 符號」圖，**從來沒更新過**。
網頁的 `icons/*.png`（熊貓）跟 APK 的 mipmap 是**兩套獨立資源**，
改網頁圖示不會動到 APK 桌面圖示。v3.50 那次有手動換過（檔名
`expense-tracker-yu-v3.50-panda.apk`），但之後每次從 `decoded/` 重打包就打回原形。

**解法（已腳本化）**：重打包前先跑一次

```bash
python tools/build_launcher_icons.py <decoded的res目錄>
#   來源圖預設用 icons/icon-512.png（熊貓）
#   例：python tools/build_launcher_icons.py ../decoded/res
```

腳本產生 mdpi 48 / hdpi 72 / xhdpi 96 / xxhdpi 144 / xxxhdpi 192 五種密度的
`ic_launcher.png` 與 `ic_launcher_round.png`，**總是同步**更新（約 188KB）。

#### 為什麼不能直接把 `icons/icon-512.png` 塞進 mipmap？

網頁 icon-512.png 是**真實照片**：RGB 無 alpha，四角是雜亂的拍攝背景
（左上 `#7a7a5e`、左下 `#040406`、右上 `#764e20`、右下 `#968a72`）。
整張滿版當 launcher，Android 各廠牌遮罩（圓形／圓角方形／水滴）裁下去
就會露出那圈雜亂背景。

#### 構圖設計（勿任意改動）

本專案沒有 `mipmap-anydpi-v26/`，`AndroidManifest.xml` 直接指 `@mipmap/ic_launcher`，
所以走 **legacy PNG 路徑**——Android 8+ 會拿這張 PNG 直接套自家遮罩。
因此構圖必須「滿版可裁」：

| 元素 | 規格 | 理由 |
|---|---|---|
| 底色 | 品牌藍 `#2563eb` 滿版 | 沿用 `res/drawable/ic_launcher.xml`；與網頁 `icon-maskable-512.png` 一致 |
| 熊貓 | 圓形，直徑 = 圖示 **74%** | 大於 Android adaptive icon 的 66% 安全區，任何遮罩都裁不到主體 |
| 白環 | 寬度 2.8%，高斯模糊柔邊 | 讓主體從底色浮出，48px 小尺寸仍可辨識 |

**驗證**（打包後）：
```bash
# 四角必須是品牌藍 (37,99,235)，代表外圍是乾淨底色而非照片背景
# 用 Pillow 或任何看圖軟體開 res/mipmap-xxxhdpi/ic_launcher.png 確認
```

> 已於 2026-08-30 修復並出 `expense-tracker-yu-v3.86-panda.apk`
> （versionCode 386 / versionName yu-v3.86，簽名指紋與既有版本一致，可直接覆蓋安裝）。

---

## 5. GitHub Pages 注意事項

- **`.nojekyll`**：倉庫根已有空檔 `.nojekyll`，停用 Jekyll（否則 Jekyll 會忽略 `.well-known/` 導致 404）。**勿刪除**。
- **`assetlinks.json`**：位於 `.well-known/assetlinks.json`，用於 TWA 全屏驗證。
  - `target.package_name` = `com.billingtracker`
  - `sha256_cert_fingerprints` 含本專案 release keystore 指紋（見 4.1）
  - 若日後換 keystore，記得同步更新這裡的指紋，否則 APP 不會全屏（功能仍正常）。

---

## 6. 發布前檢查清單

- [ ] 網頁：`APP_VERSION` / `APP_BUILD_DATE` 已升版
- [ ] 網頁：`window.APP_VERSION = APP_VERSION;` 存在
- [ ] 網頁：`index.html` 的 script `?v=` 與 JS 檔名一致
- [ ] 網頁：`sw.js` 的 `CACHE` 版本已 +1
- [ ] `git push origin main` 成功，等 Pages 部署
- [ ] 用 `git ls-remote origin refs/heads/main` 確認遠端 hash == 本機 HEAD
- [ ] （若動到結算）勾選後本輪金額**真的歸零**、結清後新增費用會自動取消勾選
- [ ] （若動到勾選框）沒有用 `textContent` 寫勾選狀態、沒有手動切換後備邏輯
- [ ] （若要動 APK）keystore + 密碼就位、`apktool.yml` 版本號正確、必要時 patch smali、簽名後驗證指紋
- [ ] 交付 APK 給使用者，說明「覆蓋安裝」或「先備份→卸載→重裝」

---

## 7. 禁忌

- **勿對此 repo 做互動式 rebase（`git rebase -i`）**：曾把本地物件庫弄壞（missing blobs），需整個換掉 `.git` 才能救回。需要重排 commit 時改用 `git commit --amend` 或新開分支處理。
- **勿把 keystore 密碼寫進倉庫 / 腳本**。
- **勿刪除 `.nojekyll`**（會讓 `.well-known` 無法部署）。

---

## 8. 電腦 / 瀏覽器如何開啟（終端使用者）

這是一個網頁（PWA），電腦用瀏覽器開就能用，**不用安裝任何東西**。

### 8.1 直接用瀏覽器開

1. 打開 **Chrome** 或 **Edge**
2. 網址列貼上並 Enter：
   ```
   https://tk101012000.github.io/expense-tracker/
   ```
3. 即可使用。資料存在該瀏覽器的本機儲存（localStorage），與手機 APP 是**同一套網頁**。

### 8.2 安裝成電腦版 APP（可離線、像原生程式）

- **Chrome**：地址列左邊的安裝圖示 📥，或右上角 `⋯` →「安裝 繳費記帳…」
- **Edge**：右上角 `⋯` →「應用程式」→「將此網站安裝為應用程式」
- 安裝後會出現在桌面 / 開始選單，像一般程式一樣開啟，且可離線使用。

### 8.3 跨裝置同步

- 電腦版與手機版預設**各自獨立存**（localStorage 不跨裝置）。
- 要同步：在任一端用 APP 內的「雲端備份」上傳（Google Drive / Dropbox），另一端再「還原」即可。

> 想換桌面上的 APP 圖示 / 加到主畫面的捷徑圖示：見倉庫 `icons/` 目錄與「APP 圖標自訂」說明（改 `icons/` 後 push 即生效，免重裝）。
