/* =========================================================
   繳費記帳 PWA  ·  純前端 / localStorage 持久化
   ========================================================= */
'use strict';

/* ---------- 常數 ---------- */
const STORE_KEY = 'billkeeper_v1';
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
const APP_VERSION = 'v3.3';
const APP_BUILD_DATE = '2026-07-20';

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
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
let DB = { accounts: [], txns: [], bills: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { DB = JSON.parse(raw); }
  } catch (e) { console.error('讀取失敗', e); }
  DB.accounts ||= []; DB.txns ||= []; DB.bills ||= [];
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch (e) { toast('儲存失敗：空間不足'); }
}
function seedDemo() {
  const cash = { id: uid(), name: '現金錢包', type: 'cash', balance: 3000, note: '' };
  const bank = { id: uid(), name: '中國信託', type: 'bank', balance: 58000, note: '主要帳戶' };
  const credit = { id: uid(), name: '玉山信用卡', type: 'credit', balance: 0, note: '' };
  DB.accounts = [cash, bank, credit];
  const t = todayISO(), m = monthKey();
  DB.txns = [
    { id: uid(), type: 'income', amount: 45000, date: `${m}-05`, category: '薪資', accountId: bank.id, note: '月薪', createdAt: Date.now() },
    { id: uid(), type: 'expense', amount: 1280, date: `${m}-08`, category: '水電費', accountId: bank.id, note: '台電', createdAt: Date.now() },
    { id: uid(), type: 'expense', amount: 620, date: `${m}-10`, category: '瓦斯費', accountId: bank.id, note: '', createdAt: Date.now() },
    { id: uid(), type: 'expense', amount: 350, date: t, category: '餐飲', accountId: cash.id, note: '午餐', createdAt: Date.now() },
    { id: uid(), type: 'expense', amount: 899, date: t, category: '電信網路', accountId: credit.id, note: '手機月租', createdAt: Date.now() },
  ];
  const due = `${m}-25`;
  DB.bills = [
    { id: uid(), name: '社區管理費', amount: 2500, category: '管理費', accountId: bank.id, cycle: 'monthly', dueDate: due, note: '', paid: {} },
    { id: uid(), name: '信用卡帳單', amount: 8600, category: '信用卡費', accountId: bank.id, cycle: 'monthly', dueDate: `${m}-15`, note: '玉山卡', paid: {} },
  ];
  save();
}

/* ---------- 餘額計算 ---------- */
function accountBalance(accId) {
  const acc = DB.accounts.find(a => a.id === accId);
  if (!acc) return 0;
  let bal = Number(acc.balance) || 0;
  DB.txns.forEach(t => {
    if (t.accountId !== accId) return;
    bal += t.type === 'income' ? Number(t.amount) : -Number(t.amount);
  });
  return bal;
}
const totalAssets = () => DB.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
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
function getReminders() {
  // 回傳本期未繳且到期在 7 天內或已逾期的帳單
  const now = new Date(todayISO() + 'T00:00:00');
  const list = [];
  DB.bills.forEach(b => {
    const occ = currentOccurrence(b);
    if (b.paid && b.paid[occ.periodKey]) return; // 本期已繳
    const dueD = new Date(occ.dueISO + 'T00:00:00');
    const diff = Math.round((dueD - now) / 86400000);
    if (diff <= 7) {
      list.push({ bill: b, dueISO: occ.dueISO, diff, periodKey: occ.periodKey, status: diff < 0 ? 'overdue' : 'soon' });
    }
  });
  return list.sort((a, b) => a.diff - b.diff);
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
  if (due < now) {
    while (true) {
      const next = new Date(due); next.setMonth(next.getMonth() + stepMonths);
      if (next > now) break;
      due = next;
    }
  }
  const dueISO = due.toISOString().slice(0, 10);
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
}

function txnRowHtml(t) {
  const acc = DB.accounts.find(a => a.id === t.accountId);
  const icon = CAT_ICON[t.category] || '📦';
  return `<div class="txn-item" data-txn="${t.id}">
    <div class="txn-icon">${icon}</div>
    <div class="txn-main">
      <div class="txn-cat">${escapeHtml(t.category)}</div>
      <div class="txn-meta">${fmtDate(t.date)} · ${acc ? escapeHtml(acc.name) : '未知帳戶'}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
    </div>
    <div class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount).replace(CURRENCY, CURRENCY)}</div>
  </div>`;
}

/* =========================================================
   記帳（搜尋 / 篩選 / 排序）
   ========================================================= */
function renderRecords() {
  const kw = $('#searchKeyword').value.trim().toLowerCase();
  const from = $('#filterFrom').value, to = $('#filterTo').value;
  const cat = $('#filterCategory').value, accF = $('#filterAccount').value, typeF = $('#filterType').value;
  const sort = $('#sortBy').value;

  let list = DB.txns.filter(t => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (cat && t.category !== cat) return false;
    if (accF && t.accountId !== accF) return false;
    if (typeF && t.type !== typeF) return false;
    if (kw) {
      const acc = DB.accounts.find(a => a.id === t.accountId);
      const hay = `${t.category} ${t.note || ''} ${t.amount} ${acc ? acc.name : ''}`.toLowerCase();
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
        <div class="bill-sub">${b.cycle ? cycleTxt[b.cycle] : '未設定期'} · ${b.dueDate ? `到期 ${b.occ.dueISO}` : '未設到期日'} · ${acc ? escapeHtml(acc.name) : (b.accountId ? '' : '未指定帳戶')}</div>
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
    DB.txns.push({
      id: uid(), type: 'expense', amount: Number(b.amount), date: todayISO(),
      category: b.category, accountId: b.accountId, note: `${b.name}（自動記帳）`, createdAt: Date.now(),
      _fromBill: billId,
    });
    toast('已標記繳費並自動記帳');
  } else {
    delete b.paid[periodKey];
    // 移除對應自動記帳（同帳單、同期最近一筆）
    const idx = DB.txns.map(t => t._fromBill).lastIndexOf(billId);
    if (idx >= 0) DB.txns.splice(idx, 1);
    toast('已取消繳費標記');
  }
  save(); render();
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
  for (let i = 5; i >= 0; i--) { const d = new Date(base); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
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
    const bal = accountBalance(a.id);
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
    const t = DB.txns.find(x => x.id === id);
    txnType = t.type;
    $('#txnAmount').value = t.amount;
    $('#txnDate').value = t.date;
    $('#txnNote').value = t.note || '';
    setTxnType(t.type);
    fillCategorySelect($('#txnCategory'), t.type, t.category);
    fillAccountSelect($('#txnAccount'), t.accountId);
  } else {
    txnType = 'expense';
    $('#txnAmount').value = '';
    $('#txnDate').value = todayISO();
    $('#txnNote').value = '';
    setTxnType('expense');
    fillAccountSelect($('#txnAccount'), DB.accounts[0] && DB.accounts[0].id);
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
  let ok = true;
  if (!(amount > 0)) { $('#errAmount').textContent = '請輸入大於 0 的金額'; ok = false; }
  if (!date) { $('#errDate').textContent = '請選擇日期'; ok = false; }
  if (!DB.accounts.length) { toast('請先新增帳戶'); ok = false; }
  if (!ok) return;
  const payload = {
    type: txnType, amount: Math.round(amount * 100) / 100, date,
    category: $('#txnCategory').value, accountId: $('#txnAccount').value,
    note: $('#txnNote').value.trim(),
  };
  if (editTxnId) {
    const t = DB.txns.find(x => x.id === editTxnId);
    Object.assign(t, payload);
    toast('已更新交易');
  } else {
    DB.txns.push({ id: uid(), createdAt: Date.now(), ...payload });
    toast('已新增交易');
  }
  save(); $('#txnModal').hidden = true; render();
}
function deleteTxn() {
  if (!editTxnId) return;
  if (!confirm('確定刪除這筆交易？')) return;
  DB.txns = DB.txns.filter(t => t.id !== editTxnId);
  save(); $('#txnModal').hidden = true; toast('已刪除'); render();
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
    const a = DB.accounts.find(x => x.id === id);
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
  if (editAccId) { Object.assign(DB.accounts.find(a => a.id === editAccId), payload); toast('已更新帳戶'); }
  else { DB.accounts.push({ id: uid(), ...payload }); toast('已新增帳戶'); }
  save(); $('#accountModal').hidden = true; render();
}
function deleteAccount() {
  if (!editAccId) return;
  const has = DB.txns.some(t => t.accountId === editAccId) || DB.bills.some(b => b.accountId === editAccId);
  if (has) { toast('此帳戶仍有交易或帳單，無法刪除'); return; }
  if (!confirm('確定刪除此帳戶？')) return;
  DB.accounts = DB.accounts.filter(a => a.id !== editAccId);
  save(); $('#accountModal').hidden = true; toast('已刪除帳戶'); render();
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
    const b = DB.bills.find(x => x.id === id);
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
  if (editBillId) { const b = DB.bills.find(x => x.id === editBillId); Object.assign(b, payload); toast('已更新繳費項目'); }
  else { DB.bills.push({ id: uid(), paid: {}, ...payload }); toast('已新增繳費項目'); }

  // 勾選「標記為已繳」→ 自動標記當期 + 記帳
  if ($('#billPaidNow').checked) {
    const bill = editBillId ? DB.bills.find(x => x.id === editBillId) : DB.bills[DB.bills.length - 1];
    if (bill) {
      try {
        const occ = currentOccurrence(bill);
        bill.paid ||= {};
        bill.paid[occ.periodKey] = true;
        DB.txns.push({
          id: uid(), type: 'expense', amount: Number(bill.amount), date: todayISO(),
          category: bill.category, accountId: bill.accountId, note: `${bill.name}（自動記帳）`, createdAt: Date.now(),
          _fromBill: bill.id,
        });
      } catch(e) { /* 無週期則跳過 */ }
    }
  }

  save(); $('#billModal').hidden = true; render();
}
function deleteBill() {
  if (!editBillId) return;
  if (!confirm('確定刪除此繳費項目？（已產生的記帳不會刪除）')) return;
  DB.bills = DB.bills.filter(b => b.id !== editBillId);
  save(); $('#billModal').hidden = true; toast('已刪除'); render();
}

/* =========================================================
   匯出 / 匯入
   ========================================================= */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJSON() {
  download(`繳費記帳_${todayISO()}.json`, JSON.stringify(DB, null, 2), 'application/json');
  toast('已匯出 JSON');
}
function exportCSV() {
  const accName = id => { const a = DB.accounts.find(x => x.id === id); return a ? a.name : ''; };
  const header = ['日期', '類型', '類別', '金額', '帳戶', '備註'];
  const rows = [...DB.txns].sort((a, b) => a.date.localeCompare(b.date)).map(t =>
    [t.date, t.type === 'income' ? '收入' : '支出', t.category, t.amount, accName(t.accountId), (t.note || '').replace(/"/g, '""')]
      .map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n'); // BOM 供 Excel 正確辨識中文
  download(`繳費記帳_${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('已匯出 CSV');
}
function doImport(parsed) {
  if (!parsed || !parsed.accounts || !parsed.txns) throw new Error('格式不符');
  if (!confirm('匯入將覆蓋目前所有資料，確定繼續？')) return false;
  DB = { accounts: parsed.accounts || [], txns: parsed.txns || [], bills: parsed.bills || [] };
  save(); render(); toast('匯入成功');
  return true;
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try { doImport(JSON.parse(reader.result)); }
    catch (e) { toast('匯入失敗：檔案格式錯誤'); }
  };
  reader.readAsText(file);
}
// WebView / 手機不支援 <input type=file>，改用貼上文字匯入
function importFromText() {
  const raw = ($('#importText').value || '').trim();
  if (!raw) { toast('請先貼上 JSON 文字'); return; }
  try { doImport(JSON.parse(raw)); }
  catch (e) { toast('匯入失敗：JSON 格式錯誤'); }
}

/* =========================================================
   事件綁定
   ========================================================= */
function bindEvents() {
  // tabbar
  $$('.tab[data-view]').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
  $('#fabAdd').addEventListener('click', () => openTxnModal());
  document.body.addEventListener('click', e => {
    const goto = e.target.closest('[data-goto]');
    if (goto) switchView(goto.dataset.goto);
  });

  // 交易彈窗
  $('#txnForm').addEventListener('submit', saveTxn);
  $('#deleteTxnBtn').addEventListener('click', deleteTxn);
  $$('.tt-btn').forEach(b => b.addEventListener('click', () => setTxnType(b.dataset.ttype)));

  // 帳戶
  $('#addAccountBtn').addEventListener('click', () => openAccountModal());
  $('#accountForm').addEventListener('submit', saveAccount);
  $('#deleteAccBtn').addEventListener('click', deleteAccount);

  // 繳費
  $('#addBillBtn').addEventListener('click', () => openBillModal());
  $('#billForm').addEventListener('submit', saveBill);
  $('#deleteBillBtn').addEventListener('click', deleteBill);
  $$('.seg[data-billfilter]').forEach(s => s.addEventListener('click', () => {
    billFilter = s.dataset.billfilter;
    $$('.seg[data-billfilter]').forEach(x => x.classList.toggle('active', x === s));
    renderBills();
  }));

  // 列表點擊委派
  document.body.addEventListener('click', e => {
    const txn = e.target.closest('[data-txn]');
    if (txn) return openTxnModal(txn.dataset.txn);
    const acc = e.target.closest('[data-accedit]');
    if (acc) return openAccountModal(acc.dataset.accedit);
    const togglePayBtn = e.target.closest('[data-togglepay]');
    if (togglePayBtn) { e.stopPropagation(); return togglePay(togglePayBtn.dataset.togglepay, togglePayBtn.dataset.period, !togglePayBtn.classList.contains('paid')); }
    const quick = e.target.closest('[data-quickpay]');
    if (quick) { const occ = currentOccurrence(DB.bills.find(b => b.id === quick.dataset.quickpay)); return togglePay(quick.dataset.quickpay, occ.periodKey, true); }
    const billEdit = e.target.closest('[data-billedit]');
    if (billEdit) return openBillModal(billEdit.dataset.billedit);
  });

  // 關閉彈窗
  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) m.hidden = true;
  }));

  // 記帳篩選
  $('#searchKeyword').addEventListener('input', renderRecords);
  ['filterFrom', 'filterTo', 'filterCategory', 'filterAccount', 'filterType', 'sortBy'].forEach(id =>
    $('#' + id).addEventListener('change', renderRecords));
  $('#toggleFilters').addEventListener('click', () => { $('#filterPanel').hidden = !$('#filterPanel').hidden; });
  $('#clearFilters').addEventListener('click', () => {
    ['filterFrom', 'filterTo', 'filterCategory', 'filterAccount', 'filterType'].forEach(id => $('#' + id).value = '');
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
    if (confirm('確定清空所有資料？此動作無法復原！')) { localStorage.removeItem(STORE_KEY); DB = { accounts: [], txns: [], bills: [] }; save(); render(); toast('已清空所有資料'); }
  });

  // 提醒鈕
  $('#reminderBtn').addEventListener('click', () => { switchView('bills'); billFilter = 'unpaid'; $$('.seg[data-billfilter]').forEach(x => x.classList.toggle('active', x.dataset.billfilter === 'unpaid')); renderBills(); });

  window.addEventListener('resize', () => { if (currentView === 'stats') renderStats(); if (currentView === 'dashboard') renderDashboard(); });
}
function shiftMonth(mk, n) {
  const d = new Date(mk + '-01T00:00:00'); d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}

/* =========================================================
   初始化
   ========================================================= */
function init() {
  load();
  fillFilterCategory();
  fillAccountSelect($('#filterAccount'), '', true);
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
    if (!d.accounts || !d.txns) throw new Error('檔案格式錯誤');
    DB = { accounts: d.accounts || [], txns: d.txns || [], bills: d.bills || [] };
    save(); render();
  },
};
