/* =========================================================
   雲端備份模組  ·  客戶端 OAuth2 PKCE（無後端、無密鑰暴露）
   支援 Google Drive（appDataFolder 私人空間）與 Dropbox
   v3.14 審計修復版（#3 憑證處理 / #12 併發鎖）→ v3.17 修復 disallowed_useragent（OAuth 改由系統瀏覽器 / Chrome Custom Tabs 開啟，回傳經 billingtracker:// scheme）
   ========================================================= */
(function () {
  'use strict';

  const STORE = 'billkeeper_cloud';
  // 雲端 OAuth 回傳網址必須是「託管的合法網址」（已在 Google Cloud 註冊）。
  // 自 v3.27 起 App 內 WebView 改以 https://tk101012000.github.io/expense-tracker/index.html
  // 為來源載入（由原生 shouldInterceptRequest 提供本地 assets），因此 location.origin+
  // location.pathname 會變成 .../expense-tracker/index.html（含 index.html），與 Google
  // 註冊的 .../expense-tracker/（結尾斜線）不符 → redirect_uri_mismatch。
  // 故 redirect_uri 一律固定用託管根網址（含結尾斜線），不隨載入路徑變動，
  // 由該頁 inline snippet 轉 billingtracker:// 回傳 App。
  const REDIRECT = 'https://tk101012000.github.io/expense-tracker/';

  // v3.28 診斷輔助：把雲端連線關鍵步驟經 BKNATIVE.log 輸出到 logcat，
  // 並在錯誤時把訊息寫入雲端狀態區（確保使用者一定看得到，不依賴 alert/Toast 是否彈出）。
  function nativeLog(m) {
    try { if (window.BKNATIVE && typeof window.BKNATIVE.log === 'function') window.BKNATIVE.log(String(m)); } catch (e) {}
  }
  function setStatus(t) {
    try { const el = document.getElementById('cloudStatus'); if (el) el.textContent = t; } catch (e) {}
  }

  const PROVIDERS = {
    drive: {
      name: 'Google Drive',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      extraAuth: 'access_type=offline&include_granted_scopes=true&prompt=consent',
    },
    dropbox: {
      name: 'Dropbox',
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      scope: '',
      extraAuth: 'token_access_type=offline',
    },
  };

  /* ---------- 工具 ---------- */
  const b64url = bytes => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const randomStr = n => {
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    let r = '';
    for (const v of arr) r += a[v % a.length];
    return r;
  };
  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }
  const toast = (m) => (window.toast ? window.toast(m) : alert(m));

  /* v3.57 — iOS 相容：將 PKCE verifier/provider 編碼進 OAuth state 參數，
     使授權跳轉回來時即使 localStorage 因 iOS 上下文切換而遺失，仍能完成 token 交換。 */
  function b64enc(str) { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return atob(str); }
  function encodeOAuthState(provider, verifier, stateKey) {
    return b64enc(JSON.stringify({ k: stateKey, v: verifier, p: provider }));
  }
  function decodeOAuthState(state) {
    try { const o = JSON.parse(b64dec(state)); if (o && o.v && o.p) return o; } catch (e) {}
    return null;
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- 狀態 ---------- */
  let state = loadState();
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }
  function saveState() { localStorage.setItem(STORE, JSON.stringify(state)); }

  function tokenValid() {
    return state.accessToken && state.expiresAt && Date.now() < state.expiresAt - 60000;
  }

  /* ---------- OAuth 流程 ---------- */
  async function connect() {
    clearOAuthFallback();
    const provider = $('#cloudProvider').value;
    const clientId = $('#cloudClientId').value.trim();
    // #3 修復：clientSecret 不寫入主雲端狀態（STORE）；
    // #7 修復：改用 localStorage（而非 sessionStorage）暫存，使其跨重新整理 / 新分頁不遺失，
    //         供 token 交換與日後 refresh 使用，斷線時清除。
    const clientSecret = $('#cloudClientSecret').value.trim();
    if (!clientId) { toast('請先填入 ' + PROVIDERS[provider].name + ' 的 Client ID / App Key'); return; }

    state.provider = provider; state.clientId = clientId;
    if (clientSecret) localStorage.setItem('bk_cs', clientSecret);
    else localStorage.removeItem('bk_cs');
    saveState();

    const verifier = randomStr(64);
    const challenge = await pkceChallenge(verifier);
    const stateKey = randomStr(24);
    // #7 修復：PKCE verifier 存 localStorage，確保授權回傳（即使落在不同瀏覽上下文）仍能完成交換
    localStorage.setItem('bk_oauth_' + stateKey, JSON.stringify({ provider, verifier }));

    const p = PROVIDERS[provider];
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // v3.57：verifier/provider 隨 state 往返（Google 原樣回傳），iOS 上下文切換後仍可不依賴 localStorage 完成交換
      state: encodeOAuthState(provider, verifier, stateKey),
    });
    if (p.scope) params.set('scope', p.scope);
    if (p.extraAuth) p.extraAuth.split('&').forEach(kv => { const [k, v] = kv.split('='); params.set(k, v); });

    const target = p.authUrl + '?' + params.toString();
    // 修復 disallowed_useragent：嵌入 WebView 的 UA 含 "; wv;"，Google 會阻擋 OAuth。
    // 改由 Android 端 BKNATIVE.openOAuth 以「系統瀏覽器 / Chrome Custom Tabs」開啟授權頁；
    // 非 App 環境（桌面瀏覽器）才退回原本的 location.href。
    if (window.BKNATIVE && typeof window.BKNATIVE.openOAuth === 'function') {
      // 把 PKCE verifier / provider / stateKey 一併交給原生層保存（SharedPreferences），
      // 回傳時即使 WebView 被重建也能找回 verifier 完成 token 交換（雲端登入失敗的主因）。
      nativeLog('openOAuth called provider=' + provider);
      window.BKNATIVE.openOAuth(target, stateKey, verifier, provider);
    } else {
      location.href = target;
    }
  }

  async function handleRedirect() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const stateKey = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    if (!code) return false;
    if (err) { const m = '授權失敗：' + err; setStatus(m); toast(m); if (stateKey) localStorage.removeItem('bk_oauth_' + stateKey); cleanup(); return true; }

    // v3.57：優先從 localStorage 取（同瀏覽上下文）；否則從 state 解碼（iOS 上下文切換後仍可用）
    let info = null;
    const raw = localStorage.getItem('bk_oauth_' + stateKey);
    if (raw) {
      try { info = JSON.parse(raw); } catch (e) { info = null; }
    }
    if (!info) {
      const decoded = decodeOAuthState(stateKey);
      if (decoded) { info = { provider: decoded.p, verifier: decoded.v }; if (decoded.k) localStorage.removeItem('bk_oauth_' + decoded.k); }
    }
    if (info) {
      const { provider, verifier } = info;
      // 清除網址列中的 code，避免重新整理重複交換
      history.replaceState({}, document.title, REDIRECT);
      try {
        const tok = await exchange(provider, code, verifier);
        applyToken(provider, tok);
        clearOAuthFallback();
        toast('已連接 ' + PROVIDERS[provider].name);
      } catch (e) {
        // v3.57：自動交換失敗時顯示可手動補救的兜底面板（verifier 已隨 state 帶回，貼回重導網址即可重試）
        const m = '連接失敗：' + (e.message || e);
        showOAuthFallback(code, m);
        setStatus(m + '（請見下方手動補救步驟）');
        toast(m);
      }
      return true;
    }

    // 仍取不到授權資訊：Android 交給原生層經 billingtracker:// 回傳；純網頁/iOS 顯示兜底面板
    if (window.BKNATIVE && typeof window.BKNATIVE.openOAuth === 'function') {
      const cb = 'billingtracker://oauth/callback?code=' + encodeURIComponent(code) +
                 '&state=' + encodeURIComponent(stateKey);
      cleanup();
      location.href = cb;
      return true;
    }
    showOAuthFallback(code, '找不到授權資訊，請重新連接；或貼上 Google 重導回來的網址以手動補救。');
    cleanup();
    return true;
  }
  function cleanup() { history.replaceState({}, document.title, REDIRECT); }

  /* v3.57 — 授權自動流程失敗時的兜底 UI：
     顯示授權碼供回報，並提供「貼回 Google 重導網址」手動完成連線（verifier 已隨 state 帶回，故可真正補救）。 */
  function showOAuthFallback(code, msg) {
    let box = document.getElementById('oauthFallback');
    if (!box) {
      box = document.createElement('div');
      box.id = 'oauthFallback';
      box.className = 'oauth-fallback';
      const statusEl = document.getElementById('cloudStatus');
      if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(box, statusEl.nextSibling);
    }
    box.innerHTML =
      '<div class="of-title">⚠️ 自動授權未完成</div>' +
      '<p class="of-msg"></p>' +
      '<p class="of-hint">若你手上有 Google 重導回來的網址（含 <code>code</code> 與 <code>state</code>），貼到下方可手動完成連線：</p>' +
      '<textarea id="ofUrl" class="of-textarea" placeholder="貼上 https://tk101012000.github.io/expense-tracker/?code=...&state=...&..."></textarea>' +
      '<div class="of-actions"><button class="primary-btn small" id="ofRetry">手動完成連線</button>' +
      '<button class="ghost-btn small" id="ofCopy">複製授權碼回報</button></div>' +
      '<pre class="of-code"></pre>';
    box.querySelector('.of-msg').textContent = msg;
    box.querySelector('.of-code').textContent = code || '(無授權碼)';
    const retry = box.querySelector('#ofRetry');
    if (retry) retry.onclick = () => {
      const val = (box.querySelector('#ofUrl').value || '').trim();
      if (!val) { toast('請先貼上重導網址'); return; }
      let u; try { u = new URL(val.includes('://') ? val : 'https://x/?' + val); } catch (e) { toast('網址格式無效'); return; }
      const c = u.searchParams.get('code'), s = u.searchParams.get('state');
      if (!c || !s) { toast('網址中找不到 code 或 state'); return; }
      const dec = decodeOAuthState(s);
      if (!dec || !dec.v) { toast('state 無法解析（可能非本 App 產生）'); return; }
      (async () => {
        try { const tok = await exchange(dec.p, c, dec.v); applyToken(dec.p, tok); clearOAuthFallback(); toast('已連接 ' + PROVIDERS[dec.p].name); }
        catch (e) { toast('連線失敗：' + (e.message || e)); }
      })();
    };
    const copy = box.querySelector('#ofCopy');
    if (copy) copy.onclick = () => {
      const txt = code || '';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('已複製授權碼'), () => toast('授權碼：' + txt));
      else toast('授權碼：' + txt);
    };
  }
  function clearOAuthFallback() { const b = document.getElementById('oauthFallback'); if (b) b.remove(); }
  function cleanup() { history.replaceState({}, document.title, REDIRECT); }

  async function exchange(provider, code, verifier) {
    const p = PROVIDERS[provider];
    const body = new URLSearchParams({
      code, client_id: state.clientId, code_verifier: verifier,
      grant_type: 'authorization_code', redirect_uri: REDIRECT,
    });
    // #7 修復：從 localStorage 讀取 secret（跨分頁 / 重新整理不遺失）
    const cs = localStorage.getItem('bk_cs');
    if (cs) body.append('client_secret', cs);
    const res = await fetch(p.tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!res.ok) { const t = await res.text(); throw new Error('token ' + res.status + ' ' + t); }
    return res.json();
  }
  function applyToken(provider, tok) {
    state.provider = provider;
    state.accessToken = tok.access_token;
    state.refreshToken = tok.refresh_token || state.refreshToken;
    state.expiresAt = Date.now() + (tok.expires_in || 3600) * 1000;
    // #3 修復：saveState 不再包含 clientSecret（因為根本沒存進去）
    saveState();
    refreshUI();
    // 連線成功後通知上層（App 可立即檢查是否該自動備份）
    try { if (window.BK && typeof window.BK.onCloudConnected === 'function') window.BK.onCloudConnected(); } catch (e) {}
  }

  /* #12 修復：ensureToken 加入 in-flight 鎖，防止並發 refresh 導致 refresh token 失效
     JS 是 single-threaded 但 async/await 之間會 yield 事件迴圈，
     快速連續觸發「上傳+下載」可能同時送出兩次 refresh 請求 */
  let _refreshing = null;

  async function ensureToken() {
    if (tokenValid()) return state.accessToken;
    if (_refreshing) return _refreshing;  // 已有刷新在飛行中，直接共用同一個 Promise

    if (!state.refreshToken) {
      await disconnect(false);
      throw new Error('憑證已過期，請重新連接');
    }

    // 啟動刷新，鎖定 _refreshing
    _refreshing = _doRefresh().finally(() => { _refreshing = null; });
    return _refreshing;
  }

  /** 實際執行 token 刷新的內部函數 */
  async function _doRefresh() {
    const p = PROVIDERS[state.provider];
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: state.refreshToken, client_id: state.clientId,
    });
    // #7 修復：secret 從 localStorage 取（跨分頁 / 重新整理不遺失）
    const cs = localStorage.getItem('bk_cs');
    if (cs) body.append('client_secret', cs);
    const res = await fetch(p.tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!res.ok) { await disconnect(false); throw new Error('重新整理失敗'); }
    const tok = await res.json();
    applyToken(state.provider, tok);
    return state.accessToken;
  }

  async function disconnect(notify = true) {
    state.accessToken = null; state.refreshToken = null; state.expiresAt = null;
    localStorage.removeItem('bk_cs');   // #7：斷線一併清除暫存的 client secret
    saveState();
    if (notify) toast('已斷線');
    refreshUI();
  }

  /* ---------- 上傳 / 下載 ---------- */
  let autoBacking = false;
  async function doUpload() {
    const tok = await ensureToken();
    const data = window.BK.exportData();
    if (state.provider === 'drive') await uploadDrive(tok, data);
    else await uploadDropbox(tok, data);
  }
  async function upload() {
    try {
      await doUpload();
      toast('備份已上傳至 ' + PROVIDERS[state.provider].name);
    } catch (e) { toast('上傳失敗：' + (e.message || e)); }
  }
  /** 自動備份：安靜執行，不彈成功 toast；失敗僅 logcat，避免干擾使用者。
   *  成功後經 window.BK.markCloudBackup() 記錄最後備份時間，供 UI 顯示「上次備份」。 */
  async function autoBackup() {
    if (autoBacking) return;
    autoBacking = true;
    try {
      await doUpload();
      try { if (window.BK && typeof window.BK.markCloudBackup === 'function') window.BK.markCloudBackup(); } catch (e) {}
      setStatus('已自動備份至 ' + PROVIDERS[state.provider].name + '（' + timeStr(new Date()) + '）');
      nativeLog('autoBackup ok');
    } catch (e) {
      nativeLog('autoBackup failed: ' + (e && (e.message || e.toString()) || 'unknown'));
    } finally { autoBacking = false; }
  }
  function isConnected() { return !!state.accessToken && !!state.provider; }
  function timeStr(d) {
    const p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  async function download() {
    let stage = '取得憑證';
    try {
      const tok = await ensureToken();
      stage = '讀取雲端檔案';
      const data = state.provider === 'drive' ? await downloadDrive(tok) : await downloadDropbox(tok);
      if (!data) { toast('雲端尚無備份檔，請先上傳一次'); return; }
      if (!confirm('從雲端還原將覆蓋目前本機資料，確定繼續？')) return;
      stage = '解析備份內容';
      window.BK.importData(data);
      toast('已從雲端還原');
    } catch (e) { toast('還原失敗（' + stage + '）：' + (e.message || e)); }
  }

  /* Google Drive */
  async function findDriveFile(tok) {
    const r = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
      { headers: { 'Authorization': 'Bearer ' + tok } });
    if (!r.ok) throw new Error('Drive 清單 ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const j = await r.json();
    return j.files || [];
  }
  async function uploadDrive(tok, data) {
    const files = await findDriveFile(tok);
    const existing = files.find(f => f.name === 'billkeeper_backup.json');
    let res;
    if (existing) {
      res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: data,
      });
    } else {
      const boundary = '----billerboundary';
      const meta = { name: 'billkeeper_backup.json', parents: ['appDataFolder'] };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}`
        + `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${boundary}--\r\n`;
      res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
    }
    if (!res.ok) throw new Error('Drive 上傳 ' + res.status + ' ' + (await res.text()).slice(0, 120));
  }
  async function downloadDrive(tok) {
    const files = await findDriveFile(tok);
    const f = files.find(x => x.name === 'billkeeper_backup.json');
    if (!f) return null;
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { 'Authorization': 'Bearer ' + tok } });
    if (!r.ok) throw new Error('Drive 下載 ' + r.status + ' ' + (await r.text()).slice(0, 120));
    return await r.text();
  }

  /* Dropbox */
  async function uploadDropbox(tok, data) {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: '/billkeeper_backup.json', mode: 'overwrite', mute: true }),
      }, body: data,
    });
    if (!res.ok) throw new Error('Dropbox 上傳 ' + res.status + ' ' + (await res.text()).slice(0, 120));
  }
  async function downloadDropbox(tok) {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: '/billkeeper_backup.json' }) },
    });
    if (r.status === 409) return null; // 檔案不存在
    if (!r.ok) throw new Error('Dropbox 下載 ' + r.status + ' ' + (await r.text()).slice(0, 120));
    return await r.text();
  }

  /* ---------- UI ---------- */
  function refreshUI() {
    const connected = !!state.accessToken && !!state.provider;
    const pName = state.provider ? PROVIDERS[state.provider].name : '';
    if ($('#cloudStatus')) $('#cloudStatus').textContent = connected ? `已連接：${pName}` : '尚未連接';
    if ($('#cloudConnectBtn')) $('#cloudConnectBtn').textContent = connected ? '重新連接' : '連接雲端';
    if ($('#cloudUploadBtn')) $('#cloudUploadBtn').disabled = !connected;
    if ($('#cloudDownloadBtn')) $('#cloudDownloadBtn').disabled = !connected;
    if ($('#cloudDisconnectBtn')) $('#cloudDisconnectBtn').disabled = !connected;
    if ($('#cloudProvider') && state.provider) $('#cloudProvider').value = state.provider;
    if ($('#cloudClientId') && state.clientId) $('#cloudClientId').value = state.clientId;
    if ($('#cloudRedirectHint')) $('#cloudRedirectHint').textContent = '重新導向網址：' + REDIRECT;
  }
  function bindUI() {
    $('#cloudConnectBtn').addEventListener('click', connect);
    $('#cloudUploadBtn').addEventListener('click', upload);
    $('#cloudDownloadBtn').addEventListener('click', download);
    $('#cloudDisconnectBtn').addEventListener('click', () => disconnect(true));
    refreshUI();
  }

  /* ---------- 供 Android 原生層回傳 OAuth 結果 ----------
     授權頁改由系統瀏覽器 / Chrome Custom Tabs 開啟（見 connect()），
     完成後 Google 重定向到 REDIRECT（本託管頁），該頁在「非 WebView」環境下
     會以自訂 scheme billingtracker://oauth/callback 把 code/state 回傳給 App，
     MainActivity.onNewIntent 收到後呼叫此函式完成 token 交換。 */
  window.BKOAuthBridge = async function (code, stateKey, err, verifier, provider) {
    nativeLog('BKOAuthBridge called code=' + (code ? code.slice(0,6) + '…' : 'null') + ' provider=' + provider);
    setStatus('授權處理中…請稍候');   // v3.29：一進入立刻顯示進度，確保使用者看得到（非靜默）
    if (!code) {
      const m = err ? ('授權失敗：' + err) : '授權已取消';
      setStatus(m); toast(m); cleanup(); return;
    }
    // 優先用原生層經 billingtracker:// 回傳時附帶的 verifier/provider（不依賴 WebView 儲存，
    // 即使回傳過程中 WebView 被重建也能完成 token 交換）。若原生未提供，退回 localStorage 中的 PKCE 暫存；
    // v3.57：再不行則從 state 解碼（iOS / 原生回傳缺失時的最後補救）。
    if (!verifier || !provider) {
      const raw = localStorage.getItem('bk_oauth_' + stateKey);
      if (raw) {
        const o = JSON.parse(raw);
        verifier = o.verifier; provider = o.provider;
        localStorage.removeItem('bk_oauth_' + stateKey);   // #7：用完清除 PKCE 暫存
      } else {
        const d = decodeOAuthState(stateKey);
        if (!d || !d.v || !d.p) { const m = '找不到授權資訊，請重新連接'; setStatus(m); alert(m); cleanup(); return; }
        verifier = d.v; provider = d.p; if (d.k) localStorage.removeItem('bk_oauth_' + d.k);
      }
    }
    try {
      nativeLog('exchange start provider=' + provider);
      const tok = await exchange(provider, code, verifier);
      nativeLog('exchange ok access_token=' + (!!tok && !!tok.access_token));
      applyToken(provider, tok);
      clearOAuthFallback();
      const m = '已連接 ' + PROVIDERS[provider].name;
      setStatus(m); toast(m);
    } catch (e) {
      // 錯誤同時寫入雲端狀態區（一定看得到）+ alert（截圖用）+ logcat，確保無論 alert 是否彈出都能定位。
      const msg = '連接失敗：' + (e && (e.message || e.toString()) || '未知錯誤');
      nativeLog('exchange error: ' + msg);
      setStatus(msg + '（請截圖回報）');
      alert(msg + '\n\n若持續失敗，請截圖此訊息回報。');
    }
  };

  window.Cloud = {
    async init() {
      const handled = await handleRedirect();
      if (!handled) refreshUI();
      bindUI();
    },
    refreshUI,
    isConnected,
    autoBackup,
  };
})();
