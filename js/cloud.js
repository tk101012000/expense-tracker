/* =========================================================
   雲端備份模組  ·  客戶端 OAuth2 PKCE（無後端、無密鑰暴露）
   支援 Google Drive（appDataFolder 私人空間）與 Dropbox
   ========================================================= */
(function () {
  'use strict';

  const STORE = 'billkeeper_cloud';
  const REDIRECT = location.origin + location.pathname;

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
    const provider = $('#cloudProvider').value;
    const clientId = $('#cloudClientId').value.trim();
    const clientSecret = $('#cloudClientSecret').value.trim();
    if (!clientId) { toast('請先填入 ' + PROVIDERS[provider].name + ' 的 Client ID / App Key'); return; }
    state.provider = provider; state.clientId = clientId;
    if (clientSecret) state.clientSecret = clientSecret;
    saveState();

    const verifier = randomStr(64);
    const challenge = await pkceChallenge(verifier);
    const stateKey = randomStr(24);
    sessionStorage.setItem('bk_oauth_' + stateKey, JSON.stringify({ provider, verifier }));

    const p = PROVIDERS[provider];
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: stateKey,
    });
    if (p.scope) params.set('scope', p.scope);
    if (p.extraAuth) p.extraAuth.split('&').forEach(kv => { const [k, v] = kv.split('='); params.set(k, v); });

    location.href = p.authUrl + '?' + params.toString();
  }

  async function handleRedirect() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const stateKey = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    if (!code) return false;
    if (err) { toast('授權失敗：' + err); cleanup(); return true; }
    const raw = sessionStorage.getItem('bk_oauth_' + stateKey);
    if (!raw) { toast('找不到授權資訊，請重新連接'); cleanup(); return true; }
    const { provider, verifier } = JSON.parse(raw);
    sessionStorage.removeItem('bk_oauth_' + stateKey);
    // 清除網址列中的 code，避免重新整理重複交換
    history.replaceState({}, document.title, REDIRECT);
    try {
      const tok = await exchange(provider, code, verifier);
      applyToken(provider, tok);
      toast('已連接 ' + PROVIDERS[provider].name);
    } catch (e) {
      toast('連接失敗：' + (e.message || e));
    }
    return true;
  }
  function cleanup() { history.replaceState({}, document.title, REDIRECT); }

  async function exchange(provider, code, verifier) {
    const p = PROVIDERS[provider];
    const body = new URLSearchParams({
      code, client_id: state.clientId, code_verifier: verifier,
      grant_type: 'authorization_code', redirect_uri: REDIRECT,
    });
    // Google Drive Web Application 類型使用 PKCE 時不需 client_secret
    const needSecret = state.clientSecret && provider !== 'drive';
    if (needSecret) body.append('client_secret', state.clientSecret);
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
    saveState();
    refreshUI();
  }

  async function ensureToken() {
    if (tokenValid()) return state.accessToken;
    if (!state.refreshToken) { await disconnect(false); throw new Error('憑證已過期，請重新連接'); }
    const p = PROVIDERS[state.provider];
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: state.refreshToken, client_id: state.clientId,
    });
    // Google Drive Web Application 類型使用 PKCE 時不需 client_secret
    const needSecret = state.clientSecret && state.provider !== 'drive';
    if (needSecret) body.append('client_secret', state.clientSecret);
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
    saveState();
    if (notify) toast('已斷線');
    refreshUI();
  }

  /* ---------- 上傳 / 下載 ---------- */
  async function upload() {
    try {
      const tok = await ensureToken();
      const data = window.BK.exportData();
      if (state.provider === 'drive') await uploadDrive(tok, data);
      else await uploadDropbox(tok, data);
      toast('備份已上傳至 ' + PROVIDERS[state.provider].name);
    } catch (e) { toast('上傳失敗：' + (e.message || e)); }
  }
  async function download() {
    try {
      const tok = await ensureToken();
      const data = state.provider === 'drive' ? await downloadDrive(tok) : await downloadDropbox(tok);
      if (!data) { toast('雲端尚無備份檔'); return; }
      if (!confirm('從雲端還原將覆蓋目前本機資料，確定繼續？')) return;
      window.BK.importData(data);
      toast('已從雲端還原');
    } catch (e) { toast('還原失敗：' + (e.message || e)); }
  }

  /* Google Drive */
  async function findDriveFile(tok) {
    const r = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
      { headers: { 'Authorization': 'Bearer ' + tok } });
    const j = await r.json();
    return j.files || [];
  }
  async function uploadDrive(tok, data) {
    const files = await findDriveFile(tok);
    const existing = files.find(f => f.name === 'billkeeper_backup.json');
    if (existing) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: data,
      });
    } else {
      const boundary = '----billerboundary';
      const meta = { name: 'billkeeper_backup.json', parents: ['appDataFolder'] };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}` +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${boundary}--\r\n`;
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
    }
  }
  async function downloadDrive(tok) {
    const files = await findDriveFile(tok);
    const f = files.find(x => x.name === 'billkeeper_backup.json');
    if (!f) return null;
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { 'Authorization': 'Bearer ' + tok } });
    return r.ok ? await r.text() : null;
  }

  /* Dropbox */
  async function uploadDropbox(tok, data) {
    await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: '/billkeeper_backup.json', mode: 'overwrite', mute: true }),
      }, body: data,
    });
  }
  async function downloadDropbox(tok) {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: '/billkeeper_backup.json' }) },
    });
    return r.ok ? await r.text() : null;
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

  window.Cloud = {
    async init() {
      const handled = await handleRedirect();
      if (!handled) refreshUI();
      bindUI();
    },
  };
})();
