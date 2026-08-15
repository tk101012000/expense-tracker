# 構建與發布指南（BUILD.md）

本檔案隨倉庫走，目的：在**任意電腦** clone 本 repo 後，都能照著把 APP 改好、發版、重打包 APK。
（本機 WorkBuddy 的「專案記憶」不會跟著換電腦，所以把關鍵流程寫在這裡。）

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

> 自 v3.46 起 JS 檔名帶版本號（`app.yu-v3.46.js`）。這是保守保險做法，
> 因為本 APP 啟動網址已帶 `?nocache=<timestamp>`，網頁 JS 每次都是最新的，改名非必要但保留無妨。

---

## 3. 重打包 APK（改殼本身：tab、權限、設定版本號、全屏等）

### 3.1 前置需求（**不在倉庫內，需自備**）

| 項目 | 說明 |
|---|---|
| **簽名 keystore** | `expense-tracker-release.keystore`（本機在 `C:/Users/ASUS/Downloads/`）|
| **alias** | `expensekey` |
| **密碼** | 請見你另行妥善保管的記錄（**本倉庫不存放憑證**）|
| **證書 SHA-256** | `1B:78:56:90:63:62:66:7A:29:EC:81:F8:60:C7:4E:8B:79:1C:66:0C:44:56:E5:69:03:31:07:72:0D:75:06:DC` |
| **apktool** | 2.11.1（`java -jar apktool.jar`）|
| **JDK** | 17（`keytool` / `java` 所在）|
| **Android SDK build-tools** | 含 `aapt` / `zipalign` / `lib/apksigner.jar` |

> ⚠️ **keystore 檔 + 密碼務必備份**。弄丟就回到「每次都要卸載重裝」的原點。
> 用這把 keystore 簽的 APK 之間可**互相覆蓋安裝**；與原始 v3.41（不同 key）不能覆蓋，須先卸載。

### 3.2 重打包流程

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

# 3) （見 3.3）若從「原始 v3.41 APK」decode，需 patch smali 原生注入版本號

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

### 3.3 ⚠️ 原生注入版本號的坑（關鍵，2026-08-15 查清）

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

---

## 4. GitHub Pages 注意事項

- **`.nojekyll`**：倉庫根已有空檔 `.nojekyll`，停用 Jekyll（否則 Jekyll 會忽略 `.well-known/` 導致 404）。**勿刪除**。
- **`assetlinks.json`**：位於 `.well-known/assetlinks.json`，用於 TWA 全屏驗證。
  - `target.package_name` = `com.billingtracker`
  - `sha256_cert_fingerprints` 含本專案 release keystore 指紋（見 3.1）
  - 若日後換 keystore，記得同步更新這裡的指紋，否則 APP 不會全屏（功能仍正常）。

---

## 5. 發布前檢查清單

- [ ] 網頁：`APP_VERSION` / `APP_BUILD_DATE` 已升版
- [ ] 網頁：`window.APP_VERSION = APP_VERSION;` 存在
- [ ] 網頁：`index.html` 的 script `?v=` 與 JS 檔名一致
- [ ] 網頁：`sw.js` 的 `CACHE` 版本已 +1
- [ ] `git push origin main` 成功，等 Pages 部署
- [ ] （若要動 APK）keystore + 密碼就位、`apktool.yml` 版本號正確、必要時 patch smali、簽名後驗證指紋
- [ ] 交付 APK 給使用者，說明「覆蓋安裝」或「先備份→卸載→重裝」

---

## 6. 禁忌

- **勿對此 repo 做互動式 rebase（`git rebase -i`）**：曾把本地物件庫弄壞（missing blobs），需整個換掉 `.git` 才能救回。需要重排 commit 時改用 `git commit --amend` 或新開分支處理。
- **勿把 keystore 密碼寫進倉庫 / 腳本**。
- **勿刪除 `.nojekyll`**（會讓 `.well-known` 無法部署）。
