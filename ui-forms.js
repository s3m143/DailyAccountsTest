/* ui-forms.js - forms, settings and app start */
/* ---------- record form ---------- */
const PERSON_ACTS = ['Lend', 'Borrow', 'Collect', 'Repay'];

function openRecord(id) {
  const r = id ? D.records.find(x => x.ID === id) : null;
  if (r) {
    const isP = PERSON_TYPES.indexOf(r.Type) >= 0;
    RF = { ID: r.ID, Type: isP ? 'Person' : r.Type, Action: isP ? r.Type : 'Lend', Person: r.Person || '', PName: '', Date: String(r.Date).slice(0, 10), Amount: r.Amount, Account: r.Account, ToAccount: r.ToAccount, Category: r.Category, Note: r.Note };
  } else {
    RF = { Type: 'Expense', Action: 'Lend', Person: '', PName: '', Date: today(), Amount: '', Account: recAcc || (D.accounts[0] || {}).Name || '', ToAccount: '', Category: '', Note: '' };
  }
  drawRecordForm();
}

function readRF() {
  const g = id => $(id) ? $(id).value : undefined;
  if (!$('f_amt')) return;
  RF.Date = g('f_date') || RF.Date; RF.Amount = g('f_amt'); RF.Account = g('f_acc'); RF.Note = g('f_note');
  if ($('f_to')) RF.ToAccount = g('f_to');
  if ($('f_cat')) RF.Category = g('f_cat');
  if ($('f_act')) RF.Action = g('f_act');
  if ($('f_person')) RF.Person = g('f_person');
  if ($('f_pname')) RF.PName = g('f_pname');
}

function redrawRF() { readRF(); drawRecordForm(); }
function setType(t) { readRF(); RF.Type = t; RF.Category = ''; drawRecordForm(); }

function drawRecordForm() {
  const t = RF.Type, accs = D.accounts.map(a => a.Name), cats = D.categories.filter(c => c.Type === t).map(c => c.Name);
  const out = RF.Action === 'Lend' || RF.Action === 'Repay';
  let h = '<h3>' + (RF.ID ? 'Edit record' : 'New record') + '</h3><div class="seg">' +
    ['Expense', 'Income', 'Transfer', 'Person'].map(x => '<button class="' + (x === t ? 'on ' + x : '') + '" onclick="setType(\'' + x + '\')">' + x + '</button>').join('') + '</div>';
  if (t === 'Person') {
    h += fld('What happened', '<select id="f_act" onchange="redrawRF()">' + PERSON_ACTS.map(a => '<option value="' + a + '"' + (a === RF.Action ? ' selected' : '') + '>' + PACT[a] + '</option>').join('') + '</select>');
    h += fld('Person', '<select id="f_person" onchange="redrawRF()"><option value="">Select</option>' + D.people.map(p => '<option value="' + esc(p.ID) + '"' + (p.ID === RF.Person ? ' selected' : '') + '>' + esc(p.Name) + '</option>').join('') +
      '<option value="__new"' + (RF.Person === '__new' ? ' selected' : '') + '>+ New person</option></select>');
    if (RF.Person === '__new') h += fld('New person name', '<input type="text" id="f_pname" maxlength="40" value="' + esc(RF.PName) + '">');
    h += '<div class="hint">This is not income or expense. It only moves money between your account and this person.</div>';
  }
  h += fld('Date', '<input type="date" id="f_date" value="' + esc(RF.Date) + '">');
  h += fld('Amount (₹)', '<input type="number" inputmode="decimal" step="0.01" min="0" id="f_amt" placeholder="0" value="' + esc(RF.Amount) + '">');
  h += fld(t === 'Transfer' ? 'From account' : t === 'Person' ? (out ? 'Paid from account' : 'Received in account') : 'Account', '<select id="f_acc">' + opts(accs, RF.Account) + '</select>');
  if (t === 'Person') h += '<div class="hint">If this person paid your credit card bill, choose Borrow and select your credit card here.</div>';
  if (t === 'Income') h += '<div class="hint">Cashback or refund on a credit card: select the card here. It reduces the outstanding and the due amount.</div>';
  if (t === 'Transfer') h += fld('To account (choose the card to pay a credit card bill)', '<select id="f_to"><option value="">Select</option>' + opts(accs, RF.ToAccount) + '</select>');
  else if (t !== 'Person') h += fld('Category', '<select id="f_cat"><option value="">Select</option>' + opts(cats, RF.Category) + '</select>');
  h += fld('Note', '<input type="text" id="f_note" maxlength="120" value="' + esc(RF.Note) + '">');
  h += '<div id="err" class="err"></div><button class="btn" id="sv" onclick="saveRecord()">Save</button>';
  if (RF.ID) h += '<button class="btn ghost" onclick="askDelete(\'Records\',\'' + RF.ID + '\',\'Delete this record?\')">Delete</button>';
  modal(h);
}

async function saveRecord() {
  readRF();
  const t = RF.Type, amt = num(RF.Amount);
  if (amt <= 0) return showErr('Enter a valid amount');
  if (!RF.Account) return showErr('Select an account');
  const rec = { ID: RF.ID, Date: RF.Date, Type: t, Amount: amt, Account: RF.Account, ToAccount: '', Category: '', Note: (RF.Note || '').trim(), Person: '' };
  if (t === 'Transfer') {
    if (!RF.ToAccount) return showErr('Select the account to transfer to');
    if (RF.ToAccount === RF.Account) return showErr('From and To accounts must be different');
    rec.ToAccount = RF.ToAccount;
  } else if (t === 'Person') {
    if (!RF.Person) return showErr('Select a person');
    rec.Type = RF.Action;
    if (RF.Person === '__new') {
      const nm = (RF.PName || '').trim();
      if (!nm) return showErr('Enter the new person name');
      if (D.people.some(p => p.Name.toLowerCase() === nm.toLowerCase())) return showErr('This person already exists, choose them from the list');
      rec.Person = (await saveLocal('People', { Name: nm, Phone: '', Note: '' })).ID;
    } else rec.Person = RF.Person;
  } else {
    if (!RF.Category) return showErr('Select a category');
    rec.Category = RF.Category;
  }
  send('Records', rec);
}

/* ---------- account form ---------- */
function openAccount(id) {
  const a = id ? D.accounts.find(x => x.ID === id) : null;
  AF = a ? Object.assign({}, a) : { Type: 'Bank', Name: '', OpeningBalance: 0, CreditLimit: '', BillingDay: '', DueDay: '' };
  const card = AF.Type === 'Credit Card';
  let h = '<h3>' + (a ? 'Edit account' : 'New account') + '</h3>';
  h += fld('Name', '<input type="text" id="a_name" maxlength="40" value="' + esc(AF.Name) + '"' + (a ? ' readonly' : '') + '>' + (a ? '<div class="hint">The name cannot be changed, so that old records stay linked.</div>' : ''));
  h += fld('Type', '<select id="a_type" onchange="toggleCard()">' + opts(['Cash', 'Bank', 'Credit Card'], AF.Type) + '</select>');
  h += fld('<span id="a_oblbl"></span>', '<input type="number" inputmode="decimal" step="0.01" id="a_open" value="' + esc(card ? -num(AF.OpeningBalance) : num(AF.OpeningBalance)) + '">');
  h += '<div id="a_card">' + fld('Credit limit (₹)', '<input type="number" inputmode="decimal" id="a_lim" value="' + esc(AF.CreditLimit) + '">') +
    fld('Billing date (1-31): statement closes on this day', '<input type="number" inputmode="numeric" min="1" max="31" id="a_bill" value="' + esc(AF.BillingDay) + '">') +
    fld('Payment due date (1-31)', '<input type="number" inputmode="numeric" min="1" max="31" id="a_due" value="' + esc(AF.DueDay) + '">') + '</div>';
  h += '<div id="err" class="err"></div><button class="btn" id="sv" onclick="saveAccount()">Save</button>';
  if (a) h += '<button class="btn ghost" onclick="delAccount(\'' + a.ID + '\')">Delete</button>';
  modal(h); toggleCard();
}

function toggleCard() {
  const card = $('a_type').value === 'Credit Card';
  $('a_card').style.display = card ? 'block' : 'none';
  $('a_oblbl').textContent = card ? 'Current outstanding (unpaid bill)' : 'Opening balance (₹)';
}

function saveAccount() {
  const name = $('a_name').value.trim(), type = $('a_type').value, card = type === 'Credit Card';
  if (!name) return showErr('Enter a name');
  if (!AF.ID && D.accounts.some(a => a.Name.toLowerCase() === name.toLowerCase())) return showErr('This name already exists');
  const open = num($('a_open').value);
  send('Accounts', {
    ID: AF.ID, Name: name, Type: type, OpeningBalance: card ? -open : open,
    CreditLimit: card ? num($('a_lim').value) : '', BillingDay: card ? $('a_bill').value : '', DueDay: card ? $('a_due').value : ''
  });
}

function delAccount(id) {
  const a = D.accounts.find(x => x.ID === id);
  if (D.records.some(r => r.Account === a.Name || r.ToAccount === a.Name)) { closeModal(); return toast('This account has records, so it cannot be deleted'); }
  askDelete('Accounts', id, 'Delete account ' + a.Name + '?');
}

/* ---------- category form ---------- */
function openCategory() {
  modal('<h3>New category</h3>' + fld('Name', '<input type="text" id="c_name" maxlength="30">') +
    fld('Type', '<select id="c_type">' + opts(['Expense', 'Income'], 'Expense') + '</select>') +
    '<div id="err" class="err"></div><button class="btn" id="sv" onclick="saveCategory()">Save</button>');
}

function saveCategory() {
  const name = $('c_name').value.replace(/,/g, ' ').trim(), type = $('c_type').value;
  if (!name) return showErr('Enter a name');
  if (D.categories.some(c => c.Type === type && c.Name.toLowerCase() === name.toLowerCase())) return showErr('This category already exists');
  send('Categories', { Name: name, Type: type });
}

function delCategory(id) {
  const c = D.categories.find(x => x.ID === id);
  if (D.records.some(r => r.Category === c.Name)) return toast('This category has records, so it cannot be removed');
  askDelete('Categories', id, 'Remove category ' + c.Name + '?');
}

/* ---------- budget form ---------- */
function openBudget(id) {
  const b = id ? D.budgets.find(x => x.ID === id) : null;
  const sel = b ? String(b.Categories || '').split(',').map(x => x.trim()) : [];
  AF = b ? { ID: b.ID } : {};
  let h = '<h3>' + (b ? 'Edit budget' : 'New budget') + '</h3>';
  h += fld('Name', '<input type="text" id="b_name" maxlength="40" value="' + esc(b ? b.Name : '') + '">');
  h += fld('Budget amount (₹)', '<input type="number" inputmode="decimal" id="b_amt" value="' + esc(b ? b.Amount : '') + '">');
  h += fld('Period', '<select id="b_per">' + opts(['Monthly', 'Weekly', 'Yearly'], b ? b.Period : 'Monthly') + '</select>');
  h += fld('Categories to count', D.categories.filter(c => c.Type === 'Expense').map(c =>
    '<label class="chk"><input type="checkbox" class="bc" value="' + esc(c.Name) + '"' + (sel.indexOf(c.Name) >= 0 ? ' checked' : '') + '>' + esc(c.Name) + '</label>').join('') +
    '<div class="hint">If none is selected, all expenses are counted.</div>');
  h += '<div id="err" class="err"></div><button class="btn" id="sv" onclick="saveBudget()">Save</button>';
  if (b) h += '<button class="btn ghost" onclick="askDelete(\'Budgets\',\'' + b.ID + '\',\'Delete this budget?\')">Delete</button>';
  modal(h);
}

function saveBudget() {
  const name = $('b_name').value.trim(), amt = num($('b_amt').value);
  if (!name) return showErr('Enter a name');
  if (amt <= 0) return showErr('Enter a valid amount');
  const cats = Array.from(document.querySelectorAll('.bc:checked')).map(x => x.value).join(',');
  send('Budgets', { ID: AF.ID, Name: name, Amount: amt, Period: $('b_per').value, Categories: cats });
}

/* ---------- save / delete (local first, sync in background) ---------- */
async function send(name, obj) {
  const b = $('sv');
  if (b) { b.disabled = true; b.textContent = 'Saving...'; }
  try {
    await saveLocal(name, obj);
    closeModal(); render(); toast('Saved');
  } catch (e) {
    if (b) { b.disabled = false; b.textContent = 'Save'; }
    showErr(e.message || String(e));
  }
}

function askDelete(name, id, msg) {
  modal('<h3>' + esc(msg) + '</h3><div id="err" class="err"></div><button class="btn" id="sv" style="background:var(--exp)" onclick="doDelete(\'' + name + '\',\'' + id + '\')">Yes, delete</button><button class="btn add" onclick="closeModal()">Cancel</button>');
}

async function doDelete(name, id) {
  const b = $('sv'); b.disabled = true; b.textContent = 'Deleting...';
  try { await deleteLocal(name, id); closeModal(); render(); toast('Deleted'); }
  catch (e) { b.disabled = false; b.textContent = 'Yes, delete'; showErr(e.message || String(e)); }
}

/* ---------- settings ---------- */
function openSettings() {
  const c = cfg(), last = Number(localStorage.getItem('mda_last')) || 0;
  modal('<h3>Settings</h3>' +
    '<div class="hint">Status: ' + esc(statusText()) + (lastErr ? ' (' + esc(lastErr) + ')' : '') + '</div>' +
    fld('Sync URL (Apps Script Web app URL)', '<input type="url" id="s_url" value="' + esc(c.url) + '" autocapitalize="off" autocomplete="off">') +
    fld('Secret key', '<input type="password" id="s_key" value="' + esc(c.key) + '" autocomplete="off">') +
    '<div class="hint">Last sync: ' + (last ? new Date(last).toLocaleString('en-IN') : 'never') + ' | Pending: ' + pendingCount() + '</div>' +
    '<div id="err" class="err"></div><button class="btn" id="sv" onclick="saveSettings()">Save and sync now</button>' +
    '<button class="btn add" onclick="exportBackup()">Download backup file</button>');
}

async function saveSettings() {
  const url = $('s_url').value.trim(), key = $('s_key').value.trim();
  if (url.indexOf('https://script.google.com/') !== 0) return showErr('Enter the full Web app URL (starts with https://script.google.com/)');
  if (key.length < 20) return showErr('Enter the secret key');
  localStorage.setItem('mda_url', url); localStorage.setItem('mda_key', key);
  const b = $('sv'); b.disabled = true; b.textContent = 'Syncing...';
  await syncNow(true);
  if (lastErr) { b.disabled = false; b.textContent = 'Save and sync now'; return showErr(lastErr); }
  closeModal(); render(); toast('Sync done');
}

/* ---------- start ---------- */
(async function boot() {
  try { DB = await openDB(); await loadAll(); }
  catch (e) { $('view').innerHTML = '<div class="empty">Storage error: ' + esc(e.message || e) + '</div>'; return; }
  render(); updateStatus();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  syncNow(false);
})();
