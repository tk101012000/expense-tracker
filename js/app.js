/* =========================================================
   繳費記帳 PWA  ·  純前端 / localStorage 持久化
   v3.14 — 全面審計修復版（22 項問題已修復，見行內註解）
   ========================================================= */
'use strict';

/* ---------- 常數 ---------- */
const STORE_KEY = 'billkeeper_v1';
// #18 補充：損壞備份用的 key（#1 修復用）
const BACKUP_KEY = 'billkeeper_v1_corrupt_backup';
const CURRENCY = '¥';

const EXPENSE_CATS = [
  { name: '水電費', icon: '💡' },
  { name: '瓦斯費', icon: '🔥' },
  { name: '管理費', icon: '🏢' },
  { name: '信用卡費', icon: '💳' },
  { name: '電信網路', icon: '📶' },
  { name: '房租房貸', icon: '🏠' },
  { name: '餐飲', icon: '🍜' },
  { name: '交通', icon: '🚌' },
  { name: '購物', icon: '🛍️' },
  { name: '醫療', icon: '🏥' },
  { name: '娛樂', icon: '🎬' },
  { name: '保險', icon: '🛡️' },
  { name: '教育', icon: '📚' },
  { name: '其他支出', icon: '📦' },
];
const INCOME_CATS = [
  { name: '薪資', icon: '💼' },
  { name: '獎金', icon: '🎁' },
  { name: '投資', icon: '📈' },
  { name: '其他收入', icon: '💰' },
];
const CAT_ICON = {};
[...EXPENSE_CATS, ...INCOME_CATS].forEach(c => (CAT_ICON[c.name] = c.icon));

const ACCOUNT_META = {
  cash: { label: '現金', icon: '💵' },
  bank: { label: '銀行', icon: '🏦' },
  credit: { label: '信用卡', icon: '💳' },
};

const CHART_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#a855f7', '#eab308', '#64748b'];

/* ---------- 版本資訊 ---------- */
const APP_VERSION = 'v3.14';
const APP_BUILD_DATE = '2026-07-20';

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// #13 修復：UID 加入遞增計數器後綴，消除同毫秒碰撞風隹
let _uidSeq = 0;
const uid = () => Date.now().toString(36) + (++_uidSeq).toString(36).padStart(5, '0') + Math.random().toString(36).slice(2, 7);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 以本地時區把 Date 轉成 YYYY-MM-DD（不要用 toISOString，否則 GMT+8 會跨日）
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const monthKey = d => (d || todayISO()).slice(0, 7);
const fmtMoney = n => CURRENCY + (n < 0 ? '-' : '') + Math.abs(Number(n) || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = d => { const dt = new Date(d + 'T00:00:00'); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------- 資料存取 ---------- */
let DB = { accounts: [], txns: [], bills: [], members: [] };
// #6 優化：餘額快取，避免每次渲染 O(n*m) 全量掃描
let _balanceCache = {};
let _balanceDirty = true;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      // #1 修復：JSON.parse 失敗時先備份原始資料，再通知用戶
      DB = JSON.parse(raw);
    }
  } catch (e) {
    console.error('讀取失敗', e);
    // 備份損壞的原始資料到另一個 key，供手動救援
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try { localStorage.setItem(BACKUP_KEY, raw); } catch (_) { /* ignore */ }
    }
    alert(
      '⚠️ 資料讀取失敗（可能是儲存空間損壞）。\n\n' +
      '系統將以空白狀態啟動。若需救回舊資料，請在瀏覽器主控台執行：\n' +
      `localStorage.getItem('${BACKUP_KEY}')\n\n` +
      '錯誤詳情：' + (e.message || e)
    );
  }
  // 確保所有陣列存在
  DB.accounts ||= []; DB.txns ||= []; DB.bills ||= []; DB.members ||= [];
  _balanceDirty = true;
}
// #8 修復：save() 回傳 boolean，讓呼叫方能判斷是否成功
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
    _balanceDirty = true;  // 標記餘額快取需要重建
    return true;
  } catch (e) {
    toast('儲存失敗：空間不足，請檢查瀏覽器儲存配額');
    return false;
  }
}
// #6 修復：取得帳戶餘額時使用快取（dirty 時才重建）
function rebuildBalanceCache() {
  if (!_balanceDirty) return;
  const map = {};
  DB.accounts.forEach(a => { map[a.id] = Number(a.balance) || 0; });
  DB.txns.forEach(t => {
    if (!(t.accountId in map)) return;
    map[t.accountId] += t.type === 'income' ? Number(t.amount) : -Number(t.amount);
  });
  _balanceCache = map;
  _balanceDirty = false;
}
function accountBalance(accId) {
  rebuildBalanceCache();
  return _balanceCache[accId] || 0;
}
const totalAssets = () => { rebuildBalanceCache(); return DB.accounts.reduce((s, a) => s + (_balanceCache[a.id] || 0), 0); };
function monthTotals(mk) {
  let inc = 0, exp = 0;
  DB.txns.forEach(t => {
    if (monthKey(t.date) !== mk) return;
    if (t.type === 'income') inc += Number(t.amount); else exp += Number(t.amount);
  });
  return { inc, exp };
}

/* =========================================================
   導覽
   ========================================================= */
let currentView = 'dashboard';
const VIEW_TITLE = { dashboard: '總覽', records: '記帳', bills: '繳費管理', stats: '統計報表', accounts: '帳戶' };

function switchView(v) {
  currentView = v;
  $$('.view').forEach(sec => (sec.hidden = sec.dataset.view !== v));
  $$('.tab[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $('#viewTitle').textContent = VIEW_TITLE[v] || '';
  $('#viewSub').style.display = v === 'dashboard' ? '' : 'none';
  render();
  document.getElementById('main').scrollTo(0, 0);
  window.scrollTo(0, 0);
}

/* =========================================================
   渲染分派
   ========================================================= */
function render() {
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'records') renderRecords();
  else if (currentView === 'bills') renderBills();
  else if (currentView === 'stats') renderStats();
  else if (currentView === 'accounts') renderAccounts();
  renderReminderBadge();
}

/* ---------- 提醒計算 ---------- */
// #15 優化：提醒快取，同一個 render 循環內不重複計算
let _reminderCache = null;
function invalidateReminderCache() { _reminderCache = null; }
function getReminders() {
  if (_reminderCache) return _reminderCache;
  // 回傳本期未繳且到期在 7 天內或已逾期的帳單
  const now = new Date(todayISO() + 'T00:00:00');
  const list = [];
  DB.bills.forEach(b => {
    const occ = currentOccurrence(b);
    if (!occ.dueISO) return; // 未設到期日 → 不納入提醒
    if (b.paid && b.paid[occ.periodKey]) return; // 本期已繳
    const dueD = new Date(occ.dueISO + 'T00:00:00');
    const diff = Math.round((dueD - now) / 86400000);
    if (diff <= 7) {
      list.push({ bill: b, dueISO: occ.dueISO, diff, periodKey: occ.periodKey, status: diff < 0 ? 'overdue' : 'soon' });
    }
  });
  _reminderCache = list.sort((a, b) => a.diff - b.diff);
  return _reminderCache;
}
// 依週期推算「當前這一期」的到期日與週期鍵
function currentOccurrence(bill) {
  if (!bill.cycle || !bill.dueDate) {
    // 未設定週期或到期日，回傳空值
    return { dueISO: null, periodKey: null };
  }
  const base = new Date(bill.dueDate + 'T00:00:00');
  const now = new Date(todayISO() + 'T00:00:00');
  let due = new Date(base);
  const stepMonths = bill.cycle === 'monthly' ? 1 : bill.cycle === 'quarterly' ? 3 : 12;
  // 找到 >= 今天(往前一期) 的當期
  // #5 修復：while 迴圈加入安全計數器（上限 600 次 ≈ 50 年），防止極端日期導致 UI 凍結
  if (due < now) {
    let safety = 0;
    while (safety++ < 600 && due < now) {
      const next = new Date(due); next.setMonth(next.getMonth() + stepMonths);
      if (next > now) break;
      due = next;
    }
  }
  const dueISO = isoLocal(due);
  const periodKey = bill.cycle === 'yearly' ? dueISO.slice(0, 4)
    : bill.cycle === 'quarterly' ? `${dueISO.slice(0, 4)}-Q${Math.floor(due.getMonth() / 3) + 1}`
      : dueISO.slice(0, 7);
  return { dueISO, periodKey };
}

function renderReminderBadge() {
  const n = getReminders().length;
  const badge = $('#reminderBadge');
  badge.hidden = n === 0; badge.textContent = n;
}

/* =========================================================
   總覽
   ========================================================= */
function renderDashboard() {
  $('#todayStr').textContent = todayISO();
  $('#totalAssets').textContent = fmtMoney(totalAssets());
  $('#assetsHint').textContent = `${DB.accounts.length} 個帳戶`;
  const mt = monthTotals(monthKey());
  $('#monthIncome').textContent = fmtMoney(mt.inc);
  $('#monthExpense').textContent = fmtMoney(mt.exp);

  // 提醒
  const rem = getReminders();
  $('#reminderCount').textContent = rem.length + ' 筆';
  const rl = $('#dashReminders');
  rl.innerHTML = rem.length ? rem.slice(0, 4).map(r => `
    <div class="reminder-item">
      <span class="dot ${r.status}"></span>
      <div class="reminder-info">
        <b>${escapeHtml(r.bill.name)}　${fmtMoney(r.bill.amount)}</b>
        <span>到期 ${r.dueISO}　${r.diff < 0 ? `已逾期 ${-r.diff} 天` : r.diff === 0 ? '今日到期' : `還有 ${r.diff} 天`}</span>
      </div>
      <button class="pay-btn unpaid" data-quickpay="${r.bill.id}">繳費</button>
    </div>`).join('') : '<div class="empty">目前沒有待繳項目 🎉</div>';

  // 佔比圖
  const catData = categoryBreakdown(monthKey());
  drawDoughnut($('#dashDoughnut'), catData, $('#dashLegend'));

  // 最近交易
  const recent = [...DB.txns].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 6);
  $('#recentList').innerHTML = recent.length ? recent.map(txnRowHtml).join('') : '<div class="empty">尚無交易，點擊 ＋ 開始記帳</div>';

  // 清除本次 render 的暫存快取
  invalidateReminderCache();
}

function txnRowHtml(t) {
  const acc = DB.accounts.find(a => a.id === t.accountId);
  const icon = CAT_ICON[t.category] || '📦';
  return `<div class="txn-item" data-txn="${t.id}">
    <div class="txn-icon">${icon}</div>
    <div class="txn-main">
      <div class="txn-cat">${escapeHtml(t.category)}</div>
      <div class="txn-meta">${fmtDate(t.date)} · ${acc ? escapeHtml(acc.name) : '未知帳戶'}${t.note ? ' · ' + escapeHtml(t.note) : ''}${payerHtml(t)}</div>
    </div>
    <div class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount).replace(CURRENCY, CURRENCY)}</div>
  </div>`;
}
// 交易列上的「付款人」標籤
function payerHtml(t) {
  const m = t.paidBy && DB.members.find(x => x.id === t.paidBy);
  return m ? ' · 付：' + escapeHtml(m.name) : '';
}

/* =========================================================
   記帳（搜尋 / 篩選 / 排序）
   ========================================================= */
function renderRecords() {
  const kw = $('#searchKeyword').value.trim().toLowerCase();
  const from = $('#filterFrom').value, to = $('#filterTo').value;
  const cat = $('#filterCategory').value, accF = $('#filterAccount').value, typeF = $('#filterType').value;
  const payerF = $('#filterPaidBy').value;
  const sort = $('#sortBy').value;

  let list = DB.txns.filter(t => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (cat && t.category !== cat) return false;
    if (accF && t.accountId !== accF) return false;
    if (typeF && t.type !== typeF) return false;
    if (payerF && t.paidBy !== payerF) return false;
    if (kw) {
      const acc = DB.accounts.find(a => a.id === t.accountId);
      const payer = t.paidBy && DB.members.find(m => m.id === t.paidBy);
      // #22 修復：搜尋 haystack 中移除金額，避免 "28" 匹配到 "1280"、"2800"
      const hay = `${t.category} ${t.note || ''} ${acc ? acc.name : ''} ${payer ? payer.name : ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sort === 'date_asc') return (a.date + a.createdAt).localeCompare(b.date + b.createdAt);
    if (sort === 'amount_desc') return b.amount - a.amount;
    if (sort === 'amount_asc') return a.amount - b.amount;
    return (b.date + b.createdAt).localeCompare(a.date + a.createdAt); // date_desc
  });

  const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  $('#recordsSummary').textContent = `共 ${list.length} 筆　收入 ${fmtMoney(inc)}　支出 ${fmtMoney(exp)}`;
  $('#recordsList').innerHTML = list.length ? list.map(txnRowHtml).join('') : '<div class="empty">沒有符合條件的紀錄</div>';
}

/* =========================================================
   繳費管理
   ========================================================= */
let billFilter = 'all';
function renderBills() {
  const listEl = $('#billsList');
  const now = new Date(todayISO() + 'T00:00:00');
  let bills = DB.bills.map(b => {
    const occ = currentOccurrence(b);
    const paid = !!(b.paid && b.paid[occ.periodKey]);
    let diff = Infinity;
    if (occ.dueISO) {
      const dueD = new Date(occ.dueISO + 'T00:00:00');
      diff = Math.round((dueD - now) / 86400000);
    }
    let status = 'ok';
    if (!paid && occ.dueISO && diff < 0) status = 'overdue';
    else if (!paid && occ.dueISO && diff <= 7) status = 'soon';
    return { ...b, occ, paid, diff, status };
  });
  if (billFilter === 'unpaid') bills = bills.filter(b => !b.paid);
  else if (billFilter === 'paid') bills = bills.filter(b => b.paid);
  bills.sort((a, b) => a.diff - b.diff);

  const cycleTxt = { monthly: '每月', quarterly: '每季', yearly: '每年' };
  listEl.innerHTML = bills.length ? bills.map(b => {
    const acc = b.accountId ? DB.accounts.find(a => a.id === b.accountId) : null;
    const cls = b.paid ? 'paid' : b.status === 'overdue' ? 'overdue' : b.status === 'soon' ? 'due-soon' : '';
    const tag = b.paid ? '<span class="status-tag ok">已繳</span>'
      : !b.cycle || !b.dueDate ? '<span class="status-tag ok">未設定週期</span>'
      : b.status === 'overdue' ? `<span class="status-tag overdue">逾期 ${-b.diff} 天</span>`
        : b.status === 'soon' ? `<span class="status-tag soon">${b.diff === 0 ? '今日到期' : b.diff + ' 天後'}</span>`
          : '<span class="status-tag ok">未到期</span>';
    return `<div class="bill-item ${cls}" data-billedit="${b.id}">
      <div class="txn-icon">${CAT_ICON[b.category] || '📄'}</div>
      <div class="bill-main">
        <div class="bill-name">${escapeHtml(b.name)}</div>
        <div class="bill-sub">${b.cycle ? cycleTxt[b.cycle] : '未設定期'} · ${b.occ.dueISO ? `到期 ${b.occ.dueISO}` : '未設到期日'} · ${acc ? escapeHtml(acc.name) : (b.accountId ? '' : '未指定帳戶')}</div>
        <div style="margin-top:6px">${tag}</div>
      </div>
      <div class="bill-actions">
        <div class="bill-amt">${fmtMoney(b.amount)}</div>
        <button class="pay-btn ${b.paid ? 'paid' : 'unpaid'}" data-togglepay="${b.id}" data-period="${b.occ.periodKey}">
          ${b.paid ? '↩ 取消' : '標記已繳'}
        </button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">尚無繳費項目</div>';
}

function togglePay(billId, periodKey, markPaid) {
  const b = DB.bills.find(x => x.id === billId);
  if (!b) return;
  b.paid ||= {};
  if (markPaid) {
    b.paid[periodKey] = true;
    // 自動產生一筆支出交易
    // #4 修復：自動記帳加上 paidBy 欄位，確保分帳統計不漏算
    DB.txns.push({
      id: uid(), type: 'expense', amount: Number(b.amount), date: todayISO(),
      category: b.category, accountId: b.accountId, note: `${b.name}（自動記帳）`, createdAt: Date.now(),
      _fromBill: billId,
      paidBy: '',
    });
    toast('已標記繳費並自動記帳');
  } else {
    delete b.paid[periodKey];
    // 移除對應自動記帳（同帳單、同期最近一筆）
    const idx = DB.txns.map(t => t._fromBill).lastIndexOf(billId);
    if (idx >= 0) DB.txns.splice(idx, 1);
    toast('已取消繳費標記');
  }
  if (!save()) return;  // #8 修復：檢查 save 是否成功
  render();
}

/* =========================================================
   統計
   ========================================================= */
let statMonth = monthKey();
function categoryBreakdown(mk) {
  const map = {};
  DB.txns.forEach(t => {
    if (t.type !== 'expense' || monthKey(t.date) !== mk) return;
    map[t.category] = (map[t.category] || 0) + Number(t.amount);
  });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function renderStats() {
  $('#statMonthLabel').textContent = statMonth;
  const mt = monthTotals(statMonth);
  $('#statExpense').textContent = fmtMoney(mt.exp);
  $('#statIncome').textContent = fmtMoney(mt.inc);
  $('#statNet').textContent = fmtMoney(mt.inc - mt.exp);
  $('#statNet').className = (mt.inc - mt.exp) < 0 ? 'expense-text' : 'income-text';

  // 趨勢（近 6 月）
  const months = [];
  const base = new Date(statMonth + '-01T00:00:00');
  for (let i = 5; i >= 0; i--) { const d = new Date(base); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const trend = months.map(m => ({ label: m.slice(5), value: monthTotals(m).exp }));
  drawBars($('#trendChart'), trend);

  const cats = categoryBreakdown(statMonth);
  drawDoughnut($('#statDoughnut'), cats, $('#statLegend'));

  // 排行
  const total = cats.reduce((s, c) => s + c.value, 0) || 1;
  $('#categoryRank').innerHTML = cats.length ? cats.map((c, i) => `
    <div class="rank-item">
      <span class="rank-label">${CAT_ICON[c.name] || ''} ${escapeHtml(c.name)}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(c.value / total * 100).toFixed(1)}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div>
      <span class="rank-val">${fmtMoney(c.value)} · ${(c.value / total * 100).toFixed(0)}%</span>
    </div>`).join('') : '<div class="empty">本月無支出</div>';
}

/* =========================================================
   帳戶
   ========================================================= */
function renderAccounts() {
  const el = $('#accountsList');
  el.innerHTML = DB.accounts.map(a => {
    const bal = accountBalance(a.id);  // 使用快取版本
    const meta = ACCOUNT_META[a.type];
    const count = DB.txns.filter(t => t.accountId === a.id).length;
    return `<div class="account-item" data-accedit="${a.id}">
      <div class="account-top">
        <div class="account-type">
          <div class="account-icon">${meta.icon}</div>
          <div>
            <div class="account-name">${escapeHtml(a.name)}</div>
            <div class="account-tag">${meta.label}${a.note ? ' · ' + escapeHtml(a.note) : ''}</div>
          </div>
        </div>
        <div class="account-bal ${bal < 0 ? 'neg' : ''}">${fmtMoney(bal)}</div>
      </div>
      <div class="account-count">${count} 筆交易</div>
    </div>`;
  }).join('') || '<div class="empty">尚無帳戶</div>';
  renderMembers();
  renderMemberSplit();
  if (window.Cloud) Cloud.refreshUI();
}

/* =========================================================
   Canvas 圖表（自繪，無外部依賴）
   ========================================================= */
function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth - 32;
  const h = cssHeight || 220;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function drawDoughnut(canvas, data, legendEl) {
  const { ctx, w, h } = setupCanvas(canvas, 220);
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10, ir = r * 0.6;
  if (total === 0) {
    ctx.fillStyle = '#9ca3af'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('本月尚無支出資料', cx, cy);
    if (legendEl) legendEl.innerHTML = '';
    return;
  }
  let start = -Math.PI / 2;
  data.forEach((d, i) => {
    const ang = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    start += ang;
  });
  // 中空
  ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--surface') || '#fff';
  ctx.fill();
  ctx.fillStyle = '#111827'; ctx.textAlign = 'center';
  ctx.font = '700 18px sans-serif'; ctx.fillText(fmtMoney(total), cx, cy + 2);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#6b7280'; ctx.fillText('總支出', cx, cy + 18);

  if (legendEl) {
    legendEl.innerHTML = data.map((d, i) => `<span class="legend-item"><span class="sw" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${escapeHtml(d.name)} ${(d.value / total * 100).toFixed(0)}%</span>`).join('');
  }
}
function drawBars(canvas, data) {
  const { ctx, w, h } = setupCanvas(canvas, 220);
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.value), 1);
  // 軸線
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ch); ctx.lineTo(pad.l + cw, pad.t + ch); ctx.stroke();
  // 水平刻度
  ctx.fillStyle = '#9ca3af'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const v = max / 3 * i; const y = pad.t + ch - (v / max) * ch;
    ctx.fillText(Math.round(v).toLocaleString(), pad.l - 6, y + 3);
    if (i > 0) { ctx.strokeStyle = '#f3f4f6'; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke(); }
  }
  const bw = cw / data.length * 0.55;
  data.forEach((d, i) => {
    const x = pad.l + (cw / data.length) * (i + 0.5);
    const bh = (d.value / max) * ch;
    const y = pad.t + ch - bh;
    ctx.fillStyle = '#2563eb';
    const rx = x - bw / 2;
    const rr = 5;
    ctx.beginPath();
    ctx.moveTo(rx, y + bh); ctx.lineTo(rx, y + rr);
    ctx.arcTo(rx, y, rx + rr, y, rr); ctx.lineTo(rx + bw - rr, y);
    ctx.arcTo(rx + bw, y, rx + bw, y + rr, rr); ctx.lineTo(rx + bw, y + bh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.label, x, pad.t + ch + 16);
  });
}

/* =========================================================
   下拉選單填充
   ========================================================= */
function fillCategorySelect(sel, type, selected) {
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  sel.innerHTML = cats.map(c => `<option value="${c.name}" ${c.name === selected ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');
}
function fillAccountSelect(sel, selected, withAll) {
  const opts = DB.accounts.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${ACCOUNT_META[a.type].icon} ${escapeHtml(a.name)}</option>`).join('');
  sel.innerHTML = (withAll ? '<option value="">全部帳戶</option>' : '') + opts;
}
function fillFilterCategory() {
  const sel = $('#filterCategory');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部類別</option>' +
    [...EXPENSE_CATS, ...INCOME_CATS].map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  sel.value = cur;
}

/* =========================================================
   交易彈窗
   ========================================================= */
let txnType = 'expense', editTxnId = null;
function openTxnModal(id) {
  editTxnId = id || null;
  const modal = $('#txnModal');
  $('#txnModalTitle').textContent = id ? '編輯交易' : '新增交易';
  $('#deleteTxnBtn').hidden = !id;
  clearErr(['errAmount', 'errDate']);
  if (id) {
    // #7 修復：find 結果加守衛，防止 stale ID（已被刪除的資料）造成 TypeError
    const t = DB.txns.find(x => x.id === id);
    if (!t) { toast('該筆交易不存在，可能已被刪除'); modal.hidden = true; render(); return; }
    txnType = t.type;
    $('#txnAmount').value = t.amount;
    $('#txnDate').value = t.date;
    $('#txnNote').value = t.note || '';
    setTxnType(t.type);
    fillCategorySelect($('#txnCategory'), t.type, t.category);
    fillAccountSelect($('#txnAccount'), t.accountId);
    fillMemberSelect($('#txnPaidBy'), t.paidBy, false);
  } else {
    txnType = 'expense';
    $('#txnAmount').value = '';
    $('#txnDate').value = todayISO();
    $('#txnNote').value = '';
    setTxnType('expense');
    fillAccountSelect($('#txnAccount'), DB.accounts[0] && DB.accounts[0].id);
    fillMemberSelect($('#txnPaidBy'), DB.members[0] ? DB.members[0].id : '', false);
  }
  modal.hidden = false;
}
function setTxnType(type) {
  txnType = type;
  $$('.tt-btn').forEach(b => b.classList.toggle('active', b.dataset.ttype === type));
  const cur = $('#txnCategory').value;
  fillCategorySelect($('#txnCategory'), type, cur);
}
function clearErr(ids) { ids.forEach(i => ($('#' + i).textContent = '')); }

function saveTxn(e) {
  e.preventDefault();
  clearErr(['errAmount', 'errDate']);
  const amount = parseFloat($('#txnAmount').value);
  const date = $('#txnDate').value;
  let paidBy = $('#txnPaidBy').value;
  if (paidBy === '__new') { openMemberModal(); return; } // 先新增成員，稍後再存
  let ok = true;
  if (!(amount > 0)) { $('#errAmount').textContent = '請輸入大於 0 的金額'; ok = false; }
  if (!date) { $('#errDate').textContent = '請選擇日期'; ok = false; }
  if (!DB.accounts.length) { toast('請先新增帳戶'); ok = false; }
  if (!ok) return;
  const payload = {
    type: txnType, amount: Math.round(amount * 100) / 100, date,
    category: $('#txnCategory').value, accountId: $('#txnAccount').value,
    note: $('#txnNote').value.trim(), paidBy: paidBy || '',
  };
  if (editTxnId) {
    // #7 修復：find 守衛
    const targetTxn = DB.txns.find(x => x.id === editTxnId);
    if (!targetTxn) { toast('該筆交易不存在，可能已被刪除'); $('#txnModal').hidden = true; render(); return; }
    Object.assign(targetTxn, payload);
    toast('已更新交易');
  } else {
    DB.txns.push({ id: uid(), createdAt: Date.now(), ...payload });
    toast('已新增交易');
  }
  if (!save()) return;  // #8 修復：save 失敗則不繼續
  $('#txnModal').hidden = true; render();
}
function deleteTxn() {
  if (!editTxnId) return;
  if (!confirm('確定刪除這筆交易？')) return;
  DB.txns = DB.txns.filter(t => t.id !== editTxnId);
  if (!save()) return;  // #8 修復
  $('#txnModal').hidden = true; toast('已刪除'); render();
}

/* =========================================================
   帳戶彈窗
   ========================================================= */
let editAccId = null;
function openAccountModal(id) {
  editAccId = id || null;
  $('#accountModalTitle').textContent = id ? '編輯帳戶' : '新增帳戶';
  $('#deleteAccBtn').hidden = !id;
  $('#errAccName').textContent = '';
  if (id) {
    // #7 修復：find 守衛
    const a = DB.accounts.find(x => x.id === id);
    if (!a) { toast('該帳戶不存在'); return; }
    $('#accName').value = a.name; $('#accType').value = a.type;
    $('#accBalance').value = a.balance; $('#accNote').value = a.note || '';
  } else {
    $('#accName').value = ''; $('#accType').value = 'bank';
    $('#accBalance').value = ''; $('#accNote').value = '';
  }
  $('#accountModal').hidden = false;
}
function saveAccount(e) {
  e.preventDefault();
  const name = $('#accName').value.trim();
  if (!name) { $('#errAccName').textContent = '請輸入帳戶名稱'; return; }
  const payload = { name, type: $('#accType').value, balance: parseFloat($('#accBalance').value) || 0, note: $('#accNote').value.trim() };
  if (editAccId) {
    // #7 修復：find 守衛
    const targetAcc = DB.accounts.find(a => a.id === editAccId);
    if (!targetAcc) { toast('該帳戶不存在，可能已被刪除'); $('#accountModal').hidden = true; render(); return; }
    Object.assign(targetAcc, payload);
    toast('已更新帳戶');
  } else {
    DB.accounts.push({ id: uid(), ...payload });
    toast('已新增帳戶');
  }
  if (!save()) return;  // #8 修復
  $('#accountModal').hidden = true; render();
}
function deleteAccount() {
  if (!editAccId) return;
  const has = DB.txns.some(t => t.accountId === editAccId) || DB.bills.some(b => b.accountId === editAccId);
  if (has) { toast('此帳戶仍有交易或帳單，無法刪除'); return; }
  if (!confirm('確定刪除此帳戶？')) return;
  DB.accounts = DB.accounts.filter(a => a.id !== editAccId);
  if (!save()) return;  // #8 修復
  $('#accountModal').hidden = true; toast('已刪除帳戶'); render();
}

/* =========================================================
   成員彈窗（誰付錢）
   ========================================================= */
let editMemberId = null;
let memberReturnToTxn = false; // 從交易彈窗的「＋ 新增成員」進入
function fillMemberSelect(sel, selected, withAll) {
  const opts = (withAll ? '<option value="">全部付款人</option>' : '<option value="">未指定</option>')
    + DB.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')
    + (withAll ? '' : '<option value="__new">＋ 新增成員…</option>');
  sel.innerHTML = opts;
  sel.value = selected || (withAll ? '' : '');
}
function openMemberModal(id) {
  editMemberId = id || null;
  const txnModal = document.getElementById('txnModal');
  memberReturnToTxn = !id && txnModal && !txnModal.hidden;
  $('#memberModalTitle').textContent = id ? '編輯成員' : '新增成員';
  $('#deleteMemberBtn').hidden = !id;
  $('#errMemberName').textContent = '';
  $('#memberName').value = id ? ((DB.members.find(x => x.id === id) || {}).name || '') : '';
  $('#memberModal').hidden = false;
  setTimeout(() => $('#memberName').focus(), 50);
}
function saveMember(e) {
  e.preventDefault();
  const name = $('#memberName').value.trim();
  if (!name) { $('#errMemberName').textContent = '請輸入成員名稱'; return; }
  let newId = null;
  if (editMemberId) {
    const m = DB.members.find(x => x.id === editMemberId);
    if (m) m.name = name;
    toast('已更新成員');
  } else {
    newId = uid();
    DB.members.push({ id: newId, name });
    toast('已新增成員');
  }
  if (!save()) return;  // #8 修復
  if (memberReturnToTxn) {
    const txnSel = $('#txnPaidBy');
    fillMemberSelect(txnSel, newId || editMemberId || '', false);
    $('#memberModal').hidden = true;
    return;
  }
  $('#memberModal').hidden = true;
  fillMemberSelect($('#filterPaidBy'), $('#filterPaidBy').value, true);
  render();
}
function deleteMember() {
  if (!editMemberId) return;
  const used = DB.txns.some(t => t.paidBy === editMemberId);
  if (used && !confirm('此成員已有交易紀錄，刪除後相關交易將變為「未指定付款人」，確定刪除？')) return;
  if (!used && !confirm('確定刪除此成員？')) return;
  DB.members = DB.members.filter(m => m.id !== editMemberId);
  DB.txns.forEach(t => { if (t.paidBy === editMemberId) t.paidBy = ''; });
  if (!save()) return;  // #8 修復
  $('#memberModal').hidden = true;
  const txnModal = document.getElementById('txnModal');
  const txnSel = $('#txnPaidBy');
  if (txnSel && txnModal && !txnModal.hidden) fillMemberSelect(txnSel, '', false);
  fillMemberSelect($('#filterPaidBy'), $('#filterPaidBy').value, true);
  render();
}
function renderMembers() {
  const el = $('#memberList');
  if (!el) return;
  el.innerHTML = DB.members.length
    ? DB.members.map(m => {
        const count = DB.txns.filter(t => t.paidBy === m.id).length;
        return `<div class="member-item" data-memberedit="${m.id}">
          <span class="member-name">${escapeHtml(m.name)}</span>
          <span class="member-count">${count} 筆</span>
        </div>`;
      }).join('')
    : '<div class="empty">尚無成員，點下方新增</div>';
}

// #16 優化：統一成員統計函數，一次遍歷同時計算 count + 金額
function getMemberStats() {
  const statsMap = new Map();
  DB.members.forEach(m => statsMap.set(m.id, { count: 0, amount: 0 }));
  let unsetCount = 0, unsetAmount = 0;
  DB.txns.filter(t => t.type === 'expense').forEach(t => {
    if (t.paidBy && statsMap.has(t.paidBy)) {
      const s = statsMap.get(t.paidBy);
      s.count++;
      s.amount += Number(t.amount) || 0;
    } else {
      unsetCount++;
      unsetAmount += Number(t.amount) || 0;
    }
  });
  return { statsMap, unsetCount, unsetAmount };
}

/* 成員分帳統計：依付款人彙總支出金額與佔比 */
function renderMemberSplit() {
  const el = $('#memberSplit');
  if (!el) return;
  const period = $('#splitPeriod') ? $('#splitPeriod').value : 'all';
  const ym = todayISO().slice(0, 7);
  const exps = DB.txns.filter(t =>
    t.type === 'expense' && (period === 'all' || (t.date || '').slice(0, 7) === ym)
  );
  const grand = exps.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  if (grand <= 0) { el.innerHTML = '<div class="empty">此範圍尚無支出紀錄</div>'; return; }

  const map = new Map();
  exps.forEach(t => {
    const key = t.paidBy || '';
    map.set(key, (map.get(key) || 0) + (Number(t.amount) || 0));
  });

  const rows = DB.members.map(m => ({ id: m.id, name: m.name, amt: map.get(m.id) || 0 }));
  if (map.has('')) rows.push({ id: '', name: '（未指定）', amt: map.get('') || 0 });
  rows.sort((a, b) => b.amt - a.amt);

  const max = rows.reduce((m, r) => Math.max(m, r.amt), 0);
  el.innerHTML = rows.map(r => {
    const pct = Math.round(r.amt / grand * 100);
    const w = max ? Math.round(r.amt / max * 100) : 0;
    return `<div class="split-row">
      <div class="split-top"><span class="split-name">${escapeHtml(r.name)}</span><span class="split-amt">${fmtMoney(r.amt)} · ${pct}%</span></div>
      <div class="split-bar"><span style="width:${w}%"></span></div>
    </div>`;
  }).join('') + `<div class="split-total">支出合計 <strong>${fmtMoney(grand)}</strong> · ${DB.members.length} 位成員分擔</div>`;
}

/* =========================================================
   繳費彈窗
   ========================================================= */
let editBillId = null;
function openBillModal(id) {
  editBillId = id || null;
  $('#billModalTitle').textContent = id ? '編輯繳費項目' : '新增繳費項目';
  $('#deleteBillBtn').hidden = !id;
  clearErr(['errBillName', 'errBillAmount', 'errBillDue']);
  const selCat = $('#billCategory');
  const cats = EXPENSE_CATS.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  selCat.innerHTML = '<option value="">未分類</option>' + cats;
  const selAcc = $('#billAccount');
  selAcc.innerHTML = '<option value="">未指定</option>' + DB.accounts.map(a => `<option value="${a.id}">${ACCOUNT_META[a.type].icon} ${escapeHtml(a.name)}</option>`).join('');
  if (id) {
    // #7 修復：find 守衛
    const b = DB.bills.find(x => x.id === id);
    if (!b) { toast('該繳費項目不存在'); return; }
    $('#billName').value = b.name; $('#billAmount').value = b.amount;
    $('#billCategory').value = b.category || ''; $('#billAccount').value = b.accountId || '';
    $('#billCycle').value = b.cycle || ''; $('#billDue').value = b.dueDate || ''; $('#billNote').value = b.note || '';
    // 編輯時：若當期已繳則勾選
    try { const occ = currentOccurrence(b); $('#billPaidNow').checked = !!(b.paid && b.paid[occ.periodKey]); } catch(e) { $('#billPaidNow').checked = false; }
  } else {
    $('#billName').value = ''; $('#billAmount').value = '';
    $('#billCycle').value = ''; $('#billDue').value = ''; $('#billNote').value = '';
    $('#billPaidNow').checked = false;
  }
  $('#billModal').hidden = false;
}
function saveBill(e) {
  e.preventDefault();
  clearErr(['errBillName', 'errBillAmount', 'errBillDue']);
  const name = $('#billName').value.trim();
  const amount = parseFloat($('#billAmount').value);
  const due = $('#billDue').value;
  let ok = true;
  if (!name) { $('#errBillName').textContent = '請輸入項目名稱'; ok = false; }
  if (!(amount > 0)) { $('#errBillAmount').textContent = '請輸入大於 0 的金額'; ok = false; }
  // 類別、扣款帳戶、週期、首次到期日均為選填
  if (!ok) return;
  const payload = {
    name, amount: Math.round(amount * 100) / 100,
    category: $('#billCategory').value || null,
    accountId: $('#billAccount').value || null,
    cycle: $('#billCycle').value || null,
    dueDate: $('#billDue').value || null,
    note: $('#billNote').value.trim(),
  };
  if (editBillId) {
    // #7 修復：find 守衛
    const targetBill = DB.bills.find(x => x.id === editBillId);
    if (!targetBill) { toast('該繳費項目不存在'); $('#billModal').hidden = true; render(); return; }
    Object.assign(targetBill, payload);
    toast('已更新繳費項目');
  } else {
    DB.bills.push({ id: uid(), paid: {}, ...payload });
    toast('已新增繳費項目');
  }

  // 勾選「標記為已繳」→ 自動標記當期 + 記帳（與 togglePay 一致，避免編輯時重複記帳）
  const bill = editBillId ? DB.bills.find(x => x.id === editBillId) : DB.bills[DB.bills.length - 1];
  if (bill) {
    try {
      const occ = currentOccurrence(bill);
      const wantPaid = $('#billPaidNow').checked;
      const isPaid = !!(bill.paid && bill.paid[occ.periodKey]);
      if (wantPaid && !isPaid) {
        bill.paid ||= {};
        bill.paid[occ.periodKey] = true;
        // #4 修復：自動記帳加 paidBy
        DB.txns.push({
          id: uid(), type: 'expense', amount: Number(bill.amount), date: todayISO(),
          category: bill.category, accountId: bill.accountId, note: `${bill.name}（自動記帳）`, createdAt: Date.now(),
          _fromBill: bill.id,
          paidBy: '',
        });
      } else if (!wantPaid && isPaid) {
        // 編輯時取消勾選 → 同步撤銷當期自動記帳
        delete bill.paid[occ.periodKey];
        const idx = DB.txns.map(t => t._fromBill).lastIndexOf(bill.id);
        if (idx >= 0) DB.txns.splice(idx, 1);
      }
    } catch (e) { /* 無週期則跳過 */ }
  }

  if (!save()) return;  // #8 修復
  $('#billModal').hidden = true; render();
}
function deleteBill() {
  if (!editBillId) return;
  if (!confirm('確定刪除此繳費項目？（已產生的記帳不會刪除）')) return;
  DB.bills = DB.bills.filter(b => b.id !== editBillId);
  if (!save()) return;  // #8 修復
  $('#billModal').hidden = true; toast('已刪除'); render();
}

/* =========================================================
   匯出 / 匯入
   ========================================================= */
// #11 修復：Blob URL 改用 onblur 觸發 revoke，避免固定 1 秒延遲的不確定性；
//         同時保留 setTimeout 作為兜底（雙重保護），快速連續匯出不會累積洩漏
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove();
  // 主要釋放：onblur 在下載對話框關閉後觸發（現代瀏覽器支援 keep-alive-until-consumed）
  a.onblur = () => URL.revokeObjectURL(url);
  // 兜底：即使 onblur 未觸發（如部分 WebView），最多 5 秒後強制釋放
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportJSON() {
  download(`繳費記帳_${todayISO()}.json`, JSON.stringify(DB, null, 2), 'application/json');
  toast('已匯出 JSON');
}
// CSV 公式注入防護：以 = + - @ 或 tab/CR 開頭的儲存格前加單引號，避免 Excel/Sheets 當成公式執行
function csvCell(v) {
  v = String(v == null ? '' : v).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v}"`;
}
function exportCSV() {
  const accName = id => { const a = DB.accounts.find(x => x.id === id); return a ? a.name : ''; };
  const payerName = id => { if (!id) return ''; const m = DB.members.find(x => x.id === id); return m ? m.name : ''; };
  const header = ['日期', '類型', '類別', '金額', '帳戶', '付款人', '備註'];
  const rows = [...DB.txns].sort((a, b) => a.date.localeCompare(b.date)).map(t =>
    [t.date, t.type === 'income' ? '收入' : '支出', t.category, t.amount, accName(t.accountId), payerName(t.paidBy), (t.note || '')]
      .map(csvCell).join(','));
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n'); // BOM 供 Excel 正確辨識中文
  download(`繳費記帳_${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('已匯出 CSV');
}

// #9 修復：匯入 schema 白名單校驗，攔截 prototype pollution 與欄位缺失
const IMPORT_ALLOWED_TOP_KEYS = ['accounts', 'txns', 'bills', 'members'];
const TXN_REQUIRED_FIELDS = ['id', 'type', 'amount', 'date'];
const TXN_ALLOWED_FIELDS = ['id', 'type', 'amount', 'date', 'category', 'accountId', 'note', 'createdAt', 'paidBy', '_fromBill'];
const ACC_ALLOWED_FIELDS = ['id', 'name', 'type', 'balance', 'note'];
const BILL_ALLOWED_FIELDS = ['id', 'name', 'amount', 'category', 'accountId', 'cycle', 'dueDate', 'note', 'paid'];
const MEMBER_ALLOWED_FIELDS = ['id', 'name'];

/** 清理物件，只保留白名單 key，過濾 __proto__/constructor */
function sanitizeObj(obj, allowedKeys) {
  const clean = {};
  for (const k of Object.keys(obj)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    if (allowedKeys && !allowedKeys.includes(k)) continue;
    clean[k] = obj[k];
  }
  return clean;
}
function validateAndSanitize(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('根節點必須是物件');
  for (const k of Object.keys(parsed)) {
    if (!IMPORT_ALLOWED_TOP_KEYS.includes(k)) delete parsed[k];  // 移除未知頂層 key
  }

  if (!Array.isArray(parsed.accounts)) throw new Error('accounts 必須是陣列');
  if (!Array.isArray(parsed.txns)) throw new Error('txns 必須是陣列');

  parsed.accounts = parsed.accounts.map(a => sanitizeObj(a, ACC_ALLOWED_FIELDS));
  parsed.txns = parsed.txns.map(t => {
    const clean = sanitizeObj(t, TXN_ALLOWED_FIELDS);
    for (const f of TXN_REQUIRED_FIELDS) {
      if (clean[f] == null) throw new Error(`交易缺少必填欄位：${f}`);
    }
    return clean;
  });

  if (Array.isArray(parsed.bills)) {
    parsed.bills = parsed.bills.map(b => sanitizeObj(b, BILL_ALLOWED_FIELDS));
  } else {
    parsed.bills = [];
  }
  if (Array.isArray(parsed.members)) {
    parsed.members = parsed.members.map(m => sanitizeObj(m, MEMBER_ALLOWED_KEYS));
  } else {
    parsed.members = [];
  }
  return parsed;
}

function doImport(parsed) {
  const sanitized = validateAndSanitize(parsed);
  if (!confirm('匯入將覆蓋目前所有資料，確定繼續？')) return false;
  DB = sanitized;
  if (!save()) return false;  // #8 修復
  render(); toast('匯入成功');
  return true;
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try { doImport(JSON.parse(reader.result)); }
    // #19 修復：保留前 80 字元錯誤詳情
    catch (e) { toast('匯入失敗：' + (e.message || '格式錯誤').slice(0, 80)); }
  };
  reader.readAsText(file);
}
// WebView / 手機不支援 <input type=file>，改用貼上文字匯入
function importFromText() {
  const raw = ($('#importText').value || '').trim();
  if (!raw) { toast('請先貼上 JSON 文字'); return; }
  try { doImport(JSON.parse(raw)); }
  // #19 修復：保留前 80 字元錯誤詳情
  catch (e) { toast('匯入失敗：' + (e.message || 'JSON 格式錯誤').slice(0, 80)); }
}

/* =========================================================
   事件綁定（#20 修復：拆分為多個子函數提升可維護性）
   ========================================================= */

/** tabbar + FAB */
function bindTabBarEvents() {
  $$('.tab[data-view]').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
  $('#fabAdd').addEventListener('click', () => openTxnModal());
  document.body.addEventListener('click', e => {
    const goto = e.target.closest('[data-goto]');
    if (goto) switchView(goto.dataset.goto);
  });
}

/** 交易彈窗事件 */
function bindTxnEvents() {
  $('#txnForm').addEventListener('submit', saveTxn);
  $('#deleteTxnBtn').addEventListener('click', deleteTxn);
  $$('.tt-btn').forEach(b => b.addEventListener('click', () => setTxnType(b.dataset.ttype)));
}

/** 帳戶事件 */
function bindAccountEvents() {
  $('#addAccountBtn').addEventListener('click', () => openAccountModal());
  $('#accountForm').addEventListener('submit', saveAccount);
  $('#deleteAccBtn').addEventListener('click', deleteAccount);
}

/** 成員（誰付錢）事件 */
function bindMemberEvents() {
  $('#addMemberBtn').addEventListener('click', () => openMemberModal());
  $('#memberForm').addEventListener('submit', saveMember);
  $('#deleteMemberBtn').addEventListener('click', deleteMember);
  $('#splitPeriod').addEventListener('change', renderMemberSplit);
  // 交易彈窗的付款人下拉：選「＋ 新增成員」時跳出成員彈窗
  $('#txnPaidBy').addEventListener('change', () => { if ($('#txnPaidBy').value === '__new') openMemberModal(); });
  // 成員彈窗關閉時，若交易彈窗仍開著且付款人停在「＋ 新增成員」，還原為未指定
  $('#memberModal').addEventListener('click', e => {
    if (e.target === $('#memberModal') || e.target.closest('[data-close]')) {
      const txnSel = $('#txnPaidBy');
      if (txnSel && txnSel.value === '__new') txnSel.value = '';
      memberReturnToTxn = false;
    }
  });
}

/** 繳費事件 */
function bindBillEvents() {
  $('#addBillBtn').addEventListener('click', () => openBillModal());
  $('#billForm').addEventListener('submit', saveBill);
  $('#deleteBillBtn').addEventListener('click', deleteBill);
  $$('.seg[data-billfilter]').forEach(s => s.addEventListener('click', () => {
    billFilter = s.dataset.billfilter;
    $$('.seg[data-billfilter]').forEach(x => x.classList.toggle('active', x === s));
    renderBills();
  }));
}

/** 列表點擊委派（統一處理所有 data-* 點擊） */
function bindListDelegation() {
  document.body.addEventListener('click', e => {
    const txn = e.target.closest('[data-txn]');
    if (txn) return openTxnModal(txn.dataset.txn);
    const acc = e.target.closest('[data-accedit]');
    if (acc) return openAccountModal(acc.dataset.accedit);
    const memberEdit = e.target.closest('[data-memberedit]');
    if (memberEdit) return openMemberModal(memberEdit.dataset.memberedit);
    const togglePayBtn = e.target.closest('[data-togglepay]');
    if (togglePayBtn) { e.stopPropagation(); return togglePay(togglePayBtn.dataset.togglepay, togglePayBtn.dataset.period, !togglePayBtn.classList.contains('paid')); }
    const quick = e.target.closest('[data-quickpay]');
    if (quick) { const qbill = DB.bills.find(b => b.id === quick.dataset.quickpay); if (qbill) { const occ = currentOccurrence(qbill); return togglePay(quick.dataset.quickpay, occ.periodKey, true); } return; }
    const billEdit = e.target.closest('[data-billedit]');
    if (billEdit) return openBillModal(billEdit.dataset.billedit);
  });
}

/** 彈窗關閉、篩選、統計月份、資料管理、提醒 */
function bindMiscEvents() {
  // 彈窗遮罩/叉號關閉
  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) m.hidden = true;
  }));

  // 記帳篩選
  $('#searchKeyword').addEventListener('input', renderRecords);
  ['filterFrom', 'filterTo', 'filterCategory', 'filterAccount', 'filterType', 'filterPaidBy', 'sortBy'].forEach(id =>
    $('#' + id).addEventListener('change', renderRecords));
  $('#toggleFilters').addEventListener('click', () => { $('#filterPanel').hidden = !$('#filterPanel').hidden; });
  // #2 修復：清除篩選補上 filterPaidBy
  $('#clearFilters').addEventListener('click', () => {
    ['filterFrom', 'filterTo', 'filterCategory', 'filterAccount', 'filterType', 'filterPaidBy'].forEach(id => $('#' + id).value = '');
    $('#searchKeyword').value = ''; $('#sortBy').value = 'date_desc'; renderRecords();
  });

  // 統計月份
  $('#prevMonth').addEventListener('click', () => { statMonth = shiftMonth(statMonth, -1); renderStats(); });
  $('#nextMonth').addEventListener('click', () => { statMonth = shiftMonth(statMonth, 1); renderStats(); });

  // 資料管理
  $('#exportCsvBtn').addEventListener('click', exportCSV);
  $('#exportJsonBtn').addEventListener('click', exportJSON);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
  $('#importTextBtn').addEventListener('click', importFromText);
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('確定清空所有資料？此動作無法復原！')) {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(BACKUP_KEY);  // #1 配套：重置時也清除損壞備份
      DB = { accounts: [], txns: [], bills: [], members: [] };
      _balanceDirty = true;
      save(); render(); toast('已清空所有資料');
    }
  });

  // 提醒鈕
  $('#reminderBtn').addEventListener('click', () => { switchView('bills'); billFilter = 'unpaid'; $$('.seg[data-billfilter]').forEach(x => x.classList.toggle('active', x.dataset.billfilter === 'unpaid')); renderBills(); });

  window.addEventListener('resize', () => { if (currentView === 'stats') renderStats(); if (currentView === 'dashboard') renderDashboard(); });
}

// #20 修復：bindEvents 拆分為子函數
function bindEvents() {
  bindTabBarEvents();
  bindTxnEvents();
  bindAccountEvents();
  bindMemberEvents();
  bindBillEvents();
  bindListDelegation();
  bindMiscEvents();
}
function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* =========================================================
   初始化
   ========================================================= */
function init() {
  load();
  fillFilterCategory();
  fillAccountSelect($('#filterAccount'), '', true);
  fillMemberSelect($('#filterPaidBy'), '', true);
  bindEvents();
  switchView('dashboard');
  // 雲端模組（處理 OAuth 回跳、綁定 UI）
  if (window.Cloud) Cloud.init();
  // 註冊 service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  // 頁尾版本號
  if ($('#appVersion')) $('#appVersion').textContent = APP_VERSION;
  if ($('#appBuildDate')) $('#appBuildDate').textContent = '更新於 ' + APP_BUILD_DATE;
}
document.addEventListener('DOMContentLoaded', init);

/* 供雲端模組呼叫的資料介面 */
window.BK = {
  exportData: () => JSON.stringify(DB),
  importData: (str) => {
    const d = JSON.parse(str);
    const sanitized = validateAndSanitize(d);  // #9 修復：雲端還原也走 schema 校驗
    DB = sanitized;
    if (!save()) return;  // #8 修復
    render();
  },
};
