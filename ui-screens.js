/* ui-screens.js - helpers, calculations and screens */
let tab = 'home', recMonth = '', recAcc = '', RF = {}, AF = {}, openGroups = {}, homeMonth = '', recQ = '';
const GROUPS = ['Cash', 'Bank', 'Credit Card'];
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v) || 0;
const pad = n => String(n).padStart(2, '0');
function inr(n) { return (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return ymd(new Date()); }
function dmy(s) { const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }
function opts(list, sel) { return list.map(x => '<option value="' + esc(x) + '"' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>').join(''); }
function fld(label, inner) { return '<label class="f">' + label + '</label>' + inner; }
function toast(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 2600); }
function modal(h) { $('sheet').innerHTML = h; $('ov').classList.add('show'); }
function closeModal() { $('ov').classList.remove('show'); }
function showErr(m) { if ($('err')) $('err').textContent = m; else toast(m); }

/* ---------- data ---------- */
function sortedRecords() {
  return D.records.map((r, i) => Object.assign({ _i: i }, r))
    .sort((a, b) => String(b.Date).localeCompare(String(a.Date)) || b._i - a._i);
}

function calc() {
  const m = {};
  D.accounts.forEach(a => m[a.Name] = { a: a, bal: num(a.OpeningBalance) });
  D.records.forEach(r => {
    const amt = num(r.Amount);
    if (r.Type === 'Income' && m[r.Account]) m[r.Account].bal += amt;
    else if (r.Type === 'Expense' && m[r.Account]) m[r.Account].bal -= amt;
    else if (r.Type === 'Transfer') {
      if (m[r.Account]) m[r.Account].bal -= amt;
      if (m[r.ToAccount]) m[r.ToAccount].bal += amt;
    }
  });
  return m;
}

function nextDue(day) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mk = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  let d = mk(t.getFullYear(), t.getMonth());
  if (d < t) d = mk(t.getFullYear(), t.getMonth() + 1);
  return Math.round((d - t) / 864e5);
}

function budgetCalc(b) {
  const t = new Date(); let s, e;
  if (b.Period === 'Weekly') {
    const st = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
    s = ymd(st); e = ymd(new Date(st.getFullYear(), st.getMonth(), st.getDate() + 6));
  } else if (b.Period === 'Yearly') {
    s = t.getFullYear() + '-01-01'; e = t.getFullYear() + '-12-31';
  } else {
    s = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-01'; e = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-31';
  }
  const cats = String(b.Categories || '').split(',').map(x => x.trim()).filter(Boolean);
  let spent = 0;
  D.records.forEach(r => {
    const d = String(r.Date).slice(0, 10);
    if (r.Type === 'Expense' && d >= s && d <= e && (!cats.length || cats.indexOf(r.Category) >= 0)) spent += num(r.Amount);
  });
  const amt = num(b.Amount);
  return { spent: spent, amt: amt, left: amt - spent, pct: amt > 0 ? Math.min(100, spent / amt * 100) : 0, over: spent > amt };
}

/* ---------- screens ---------- */
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

function viewAccount(id) {
  const a = D.accounts.find(x => x.ID === id);
  recAcc = a ? a.Name : '';
  recMonth = '';
  recQ = '';
  go('records');
}

function render() {
  const v = $('view');
  ({ home: rHome, records: rRecords, budgets: rBudgets, accounts: rAccounts })[tab](v);
  document.querySelectorAll('nav button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

// mode 'view' = open its records, mode 'edit' = open the edit form
function accCard(x, mode) {
  const a = x.a, b = x.bal, fn = (mode === 'edit' ? 'openAccount' : 'viewAccount') + '(\'' + a.ID + '\')';
  if (a.Type === 'Credit Card') {
    const out = Math.max(0, -b), lim = num(a.CreditLimit), pct = lim > 0 ? Math.min(100, out / lim * 100) : 0;
    let due = '';
    if (out > 0 && num(a.DueDay)) {
      const d = nextDue(num(a.DueDay));
      due = '<div class="sub ' + (d <= 5 ? 'warn' : '') + '">Bill due on day ' + a.DueDay + ' of every month (' + (d === 0 ? 'today' : d + (d === 1 ? ' day left' : ' days left')) + ')</div>';
    }
    return '<div class="card" onclick="' + fn + '"><div class="row"><b>' + esc(a.Name) + '</b><span class="tag">Credit Card</span></div>' +
      '<div class="lbl">Outstanding</div><div class="big neg">' + inr(out) + '</div>' +
      (lim > 0 ? '<div class="bar ' + (pct > 85 ? 'over' : '') + '"><i style="width:' + pct + '%"></i></div><div class="sub">Available ' + inr(lim - out) + ' | Limit ' + inr(lim) + '</div>' : '') + due + stmtHtml(a) + '</div>';
  }
  return '<div class="card" onclick="' + fn + '"><div class="row"><b>' + esc(a.Name) + '</b><span class="tag">' + esc(a.Type) + '</span></div>' +
    '<div class="lbl">Balance</div><div class="big ' + (b < 0 ? 'neg' : '') + '">' + inr(b) + '</div></div>';
}

// showDate: show date in the sub line; acct: when viewing one account, transfers show + / - for that account
function recRow(r, showDate, acct) {
  const t = r.Type;
  let sign = t === 'Income' ? '+' : t === 'Expense' ? '-' : '';
  if (t === 'Transfer' && acct) sign = r.Account === acct ? '-' : '+';
  const title = t === 'Transfer' ? esc(r.Account) + ' → ' + esc(r.ToAccount) : esc(r.Category || '-');
  const sub = [t === 'Transfer' ? 'Transfer' : esc(r.Account), showDate ? dmy(r.Date) : ''].filter(Boolean).join(' | ');
  const note = String(r.Note || '').trim();
  return '<div class="rec" onclick="openRecord(\'' + r.ID + '\')"><div class="dot ' + t + '"></div><div class="mid"><div class="t">' + title + '</div><div class="s">' + sub + '</div>' +
    (note ? '<div class="n">' + esc(note) + '</div>' : '') + '</div><div class="amt ' + t + '">' + sign + inr(num(r.Amount)) + '</div></div>';
}

function budgetRow(b) {
  const c = budgetCalc(b);
  return '<div class="card" onclick="openBudget(\'' + b.ID + '\')"><div class="row"><b>' + esc(b.Name) + '</b><span class="tag">' + esc(b.Period) + '</span></div>' +
    '<div class="bar ' + (c.over ? 'over' : '') + '"><i style="width:' + c.pct + '%"></i></div>' +
    '<div class="sub ' + (c.over ? 'warn' : '') + '">' + inr(c.spent) + ' spent of ' + inr(c.amt) + (c.over ? ' | ' + inr(-c.left) + ' over budget' : ' | ' + inr(c.left) + ' left') + '</div></div>';
}

function rHome(v) {
  const m = calc(); let net = 0, alerts = '';
  Object.values(m).forEach(x => {
    net += x.bal;
    if (x.a.Type === 'Credit Card' && x.bal < 0 && num(x.a.DueDay)) {
      const d = nextDue(num(x.a.DueDay));
      if (d <= 5) alerts += '<div class="alert">' + esc(x.a.Name) + ' bill of ' + inr(-x.bal) + ' is due ' + (d === 0 ? 'today' : 'in ' + d + (d === 1 ? ' day' : ' days')) + '</div>';
    }
  });
  const ym = homeMonth || today().slice(0, 7); let inc = 0, exp = 0;
  D.records.forEach(r => {
    if (String(r.Date).slice(0, 7) === ym) { if (r.Type === 'Income') inc += num(r.Amount); if (r.Type === 'Expense') exp += num(r.Amount); }
  });
  let h = '<div class="mrow"><span>Month</span><input type="month" value="' + ym + '" onchange="homeMonth=this.value;render()"></div><div class="hero"><div class="lbl">Total balance</div><div class="net">' + inr(net) + '</div><div class="note">Cash + Bank - Credit Card outstanding</div>' +
    '<div class="two"><div>Income<b>' + inr(inc) + '</b></div><div>Expense<b>' + inr(exp) + '</b></div></div></div>' + alerts;
  const sorted = sortAcc(Object.values(m));
  h += '<h2>Accounts</h2>' + (sorted.length ? '<div class="hint">Tap a group to expand it, then tap an account to see its records</div>' +
    GROUPS.map(t => { const it = sorted.filter(x => x.a.Type === t); return it.length ? groupCard(t, it) : ''; }).join('') :
    (cfg().url ? '<div class="empty">No accounts yet. If you already use the Sheet, tap Sync at the top. Otherwise add an account in the Accounts tab.</div>' : '<div class="card"><b>Welcome</b><div class="sub">To load your data from the Google Sheet, tap the gear icon at the top and enter your sync URL and secret key. You can also add accounts here without internet.</div></div>'));
  h += catChart(ym);
  if (D.budgets.length) h += '<h2>Budgets</h2>' + D.budgets.map(budgetRow).join('');
  const last = sortedRecords().slice(0, 10);
  h += '<h2>Last 10 records</h2>' + (last.length ? last.map(r => recRow(r, true, '')).join('') : '<div class="empty">No records yet. Tap + to add your first one.</div>');
  v.innerHTML = h;
}

function recFiltered() {
  let list = sortedRecords();
  if (recAcc) list = list.filter(r => r.Account === recAcc || r.ToAccount === recAcc);
  if (recMonth) list = list.filter(r => String(r.Date).slice(0, 7) === recMonth);
  const q = recQ.trim().toLowerCase();
  if (q) list = list.filter(r => [r.Note, r.Category, r.Account, r.ToAccount, r.Type, r.Amount].join(' ').toLowerCase().indexOf(q) >= 0);
  if (!recMonth && !q) list = list.slice(0, 300);
  return list;
}

function drawRecList() {
  const list = recFiltered(); let inc = 0, exp = 0, h = '';
  list.forEach(r => { if (r.Type === 'Income') inc += num(r.Amount); if (r.Type === 'Expense') exp += num(r.Amount); });
  if (!list.length) h = '<div class="empty">No records found</div>';
  else h = '<div class="hint">' + list.length + (list.length === 1 ? ' record' : ' records') + ' | Income ' + inr(inc) + ' | Expense ' + inr(exp) + '</div>';
  let cur = '';
  list.forEach(r => {
    const d = String(r.Date).slice(0, 10);
    if (d !== cur) { cur = d; h += '<div class="dayh">' + dmy(d) + '</div>'; }
    h += recRow(r, false, recAcc);
  });
  $('reclist').innerHTML = h;
}

function rRecords(v) {
  if (recAcc && !D.accounts.some(a => a.Name === recAcc)) recAcc = '';
  let h = '';
  const x = recAcc ? calc()[recAcc] : null;
  if (x) {
    const card = x.a.Type === 'Credit Card';
    h += '<div class="card"><div class="row"><b>' + esc(recAcc) + '</b><span class="tag">' + esc(x.a.Type) + '</span></div><div class="lbl">' + (card ? 'Outstanding' : 'Balance') + '</div><div class="big ' + (x.bal < 0 ? 'neg' : '') + '">' + inr(card ? Math.max(0, -x.bal) : x.bal) + '</div>' + (card ? stmtHtml(x.a) : '') + '</div>';
  }
  h += '<input type="search" id="rq" placeholder="Search note, category or amount" value="' + esc(recQ) + '" oninput="recQ=this.value;drawRecList()">';
  h += '<div class="filter"><select onchange="recAcc=this.value;render()"><option value="">All accounts</option>' + opts(D.accounts.map(a => a.Name), recAcc) + '</select>' +
    '<input type="month" value="' + esc(recMonth) + '" onchange="recMonth=this.value;render()"></div>';
  if (recAcc || recMonth || recQ) h += '<button class="link" onclick="recAcc=\'\';recMonth=\'\';recQ=\'\';render()">Clear filters</button>';
  h += '<div id="reclist"></div>';
  v.innerHTML = h;
  drawRecList();
}

function rBudgets(v) {
  v.innerHTML = (D.budgets.length ? D.budgets.map(budgetRow).join('') : '<div class="empty">No budgets yet. Add one with the button below.</div>') +
    '<button class="btn add" onclick="openBudget()">+ Add budget</button>';
}

function rAccounts(v) {
  const m = calc();
  let h = '<h2>Accounts</h2><div class="hint">Tap an account to edit it</div>' + sortAcc(Object.values(m)).map(x => accCard(x, 'edit')).join('');
  h += '<h2>Categories</h2>';
  ['Expense', 'Income'].forEach(t => {
    h += '<div class="card"><b>' + t + '</b>' + D.categories.filter(c => c.Type === t).map(c =>
      '<div class="row" style="padding:8px 0;border-top:1px solid var(--bd);margin-top:8px"><span>' + esc(c.Name) + '</span><button class="tag" style="border:0;color:var(--exp)" onclick="delCategory(\'' + c.ID + '\')">Remove</button></div>').join('') + '</div>';
  });
  h += '<div style="height:70px"></div><button class="fab2" onclick="openAddMenu()" aria-label="Add">+</button>';
  v.innerHTML = h;
}

/* ---------- statements and category chart ---------- */
function stmtCycle(day) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mk = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const nx = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  let e = mk(t.getFullYear(), t.getMonth());
  if (e < t) e = mk(t.getFullYear(), t.getMonth() + 1);
  const pe = mk(e.getFullYear(), e.getMonth() - 1);
  const ppe = mk(pe.getFullYear(), pe.getMonth() - 1);
  return { cur: [ymd(nx(pe)), ymd(e)], prev: [ymd(nx(ppe)), ymd(pe)] };
}

function spendOn(acc, s, e) {
  let t = 0;
  D.records.forEach(r => {
    const d = String(r.Date).slice(0, 10);
    if (r.Type === 'Expense' && r.Account === acc && d >= s && d <= e) t += num(r.Amount);
  });
  return t;
}

function stmtHtml(a) {
  const day = num(a.BillingDay);
  if (!day) return '';
  const c = stmtCycle(day);
  const line = (label, r) => '<div class="srow"><span>' + label + '<small>' + dmy(r[0]) + ' to ' + dmy(r[1]) + '</small></span><b>' + inr(spendOn(a.Name, r[0], r[1])) + '</b></div>';
  return '<div class="stm">' + line('Current statement spend', c.cur) + line('Last statement spend', c.prev) + '</div>';
}

const PAL = ['#0f3d3e', '#e8a33d', '#b83a2e', '#3b5ba5', '#1e7b4f', '#8a5a9e', '#7d8b84'];
function inr0(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

function catChart(ym) {
  const by = {}; let tot = 0;
  D.records.forEach(r => {
    if (r.Type === 'Expense' && String(r.Date).slice(0, 7) === ym) { const c = r.Category || 'Other'; by[c] = (by[c] || 0) + num(r.Amount); tot += num(r.Amount); }
  });
  let h = '<h2>Spending by category</h2>';
  if (!tot) return h + '<div class="card"><div class="empty" style="padding:10px">No expenses in this month</div></div>';
  let items = Object.keys(by).map(k => ({ n: k, v: by[k] })).sort((a, b) => b.v - a.v);
  if (items.length > 6) { const rest = items.slice(6).reduce((x, y) => x + y.v, 0); items = items.slice(0, 6); items.push({ n: 'Others', v: rest }); }
  let off = 25;
  let svg = '<svg viewBox="0 0 42 42" width="170" height="170"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#edf1f0" stroke-width="6"/>';
  items.forEach((x, i) => {
    const p = x.v / tot * 100;
    svg += '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + PAL[i] + '" stroke-width="6" stroke-dasharray="' + p + ' ' + (100 - p) + '" stroke-dashoffset="' + off + '"/>';
    off -= p;
  });
  svg += '<text x="21" y="20" text-anchor="middle" font-size="3" fill="#68766f">Expense</text><text x="21" y="24.5" text-anchor="middle" font-size="3.4" font-weight="700" fill="#18231f">' + inr0(tot) + '</text></svg>';
  return h + '<div class="card"><div class="pie">' + svg + '</div>' + items.map((x, i) =>
    '<div class="leg"><i style="background:' + PAL[i] + '"></i><span>' + esc(x.n) + '</span><b>' + inr(x.v) + '</b><em>' + Math.round(x.v / tot * 100) + '%</em></div>').join('') + '</div>';
}

/* ---------- groups and add menu ---------- */
function sortAcc(list) {
  return list.slice().sort((x, y) => GROUPS.indexOf(x.a.Type) - GROUPS.indexOf(y.a.Type) || String(x.a.Name).localeCompare(String(y.a.Name)));
}

function toggleGroup(t) { openGroups[t] = !openGroups[t]; render(); }

function groupCard(t, items) {
  const open = !!openGroups[t], card = t === 'Credit Card';
  let total = 0, out = 0, lim = 0;
  items.forEach(x => { total += x.bal; out += Math.max(0, -x.bal); lim += num(x.a.CreditLimit); });
  const pct = lim > 0 ? Math.min(100, out / lim * 100) : 0;
  let body;
  if (card) {
    body = '<div class="lbl">Total outstanding</div><div class="big neg">' + inr(out) + '</div>' +
      (lim > 0 ? '<div class="bar ' + (pct > 85 ? 'over' : '') + '"><i style="width:' + pct + '%"></i></div><div class="sub">Available ' + inr(lim - out) + ' | Total limit ' + inr(lim) + '</div>' : '');
  } else {
    body = '<div class="lbl">Total balance</div><div class="big ' + (total < 0 ? 'neg' : '') + '">' + inr(total) + '</div>';
  }
  return '<div class="card"><div class="ghead" onclick="toggleGroup(\'' + t + '\')"><div class="row"><b>' + t + '</b><span class="tag">' +
    items.length + (items.length === 1 ? ' account' : ' accounts') + ' ' + (open ? '▲' : '▼') + '</span></div>' + body + '</div>' +
    (open ? '<div class="inner">' + items.map(x => accCard(x, 'view')).join('') + '</div>' : '') + '</div>';
}

function openAddMenu() {
  modal('<h3>Add new</h3>' +
    '<button class="pick" onclick="openAccount()"><b>Account</b><span>Cash, Bank or Credit Card</span></button>' +
    '<button class="pick" onclick="openCategory()"><b>Category</b><span>Expense or Income category</span></button>');
}
