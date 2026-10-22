/* db.js - local database (IndexedDB) and automatic sync with the Google Sheet */
window.onerror = function (msg, src, line) {
  const v = document.getElementById('view');
  if (v) v.innerHTML = '<div class="empty">Error: ' + String(msg) + ' (line ' + line + ')</div>';
};

const STORES = ['Accounts', 'Categories', 'Records', 'Budgets'];
const KEYMAP = { Accounts: 'accounts', Categories: 'categories', Records: 'records', Budgets: 'budgets' };
const FIELDS = {
  Accounts: ['ID', 'Name', 'Type', 'OpeningBalance', 'CreditLimit', 'BillingDay', 'DueDay'],
  Categories: ['ID', 'Name', 'Type'],
  Records: ['ID', 'Date', 'Type', 'Amount', 'Account', 'ToAccount', 'Category', 'Note'],
  Budgets: ['ID', 'Name', 'Amount', 'Period', 'Categories']
};

let DB = null;
let ALL = { Accounts: {}, Categories: {}, Records: {}, Budgets: {} };
let D = { accounts: [], categories: [], records: [], budgets: [] };
let syncing = false, syncAgain = false, syncTimer = null, lastErr = '';

/* ---------- IndexedDB helpers ---------- */
function openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('mda', 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      STORES.forEach(s => db.createObjectStore(s, { keyPath: 'ID' }));
      db.createObjectStore('meta');
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function dbAll(store) { return reqP(DB.transaction(store).objectStore(store).getAll()); }
function dbPutMany(store, list) {
  return new Promise((res, rej) => {
    const t = DB.transaction(store, 'readwrite'), os = t.objectStore(store);
    list.forEach(o => os.put(o));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
function metaGet(k) { return reqP(DB.transaction('meta').objectStore('meta').get(k)); }
function metaSet(k, v) {
  return new Promise((res, rej) => {
    const t = DB.transaction('meta', 'readwrite'); t.objectStore('meta').put(v, k);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}

async function loadAll() {
  for (const s of STORES) {
    ALL[s] = {};
    (await dbAll(s)).forEach(o => { ALL[s][o.ID] = o; });
  }
  refreshD();
}

// D = what the screens use: only records that are not deleted
function refreshD() {
  const d = {};
  STORES.forEach(s => { d[KEYMAP[s]] = Object.values(ALL[s]).filter(o => !o.Deleted).sort((a, b) => a.ID < b.ID ? -1 : 1); });
  D = d;
}

function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

async function saveLocal(name, obj) {
  const old = obj.ID ? ALL[name][obj.ID] : null;
  const rec = {};
  FIELDS[name].forEach(f => { rec[f] = obj[f] === undefined ? '' : obj[f]; });
  rec.ID = obj.ID || newId();
  rec.Deleted = 0;
  rec.UpdatedAt = old ? old.UpdatedAt : 0;
  rec._dirty = 1;
  rec._v = (old ? old._v || 0 : 0) + 1;
  await dbPutMany(name, [rec]);
  ALL[name][rec.ID] = rec;
  refreshD(); updateStatus(); scheduleSync();
  return rec;
}

async function deleteLocal(name, id) {
  const old = ALL[name][id];
  if (!old) return;
  const rec = Object.assign({}, old, { Deleted: 1, _dirty: 1, _v: (old._v || 0) + 1 });
  await dbPutMany(name, [rec]);
  ALL[name][id] = rec;
  refreshD(); updateStatus(); scheduleSync();
}

/* ---------- sync ---------- */
function cfg() { return { url: localStorage.getItem('mda_url') || '', key: localStorage.getItem('mda_key') || '' }; }

function pendingCount() {
  let n = 0;
  STORES.forEach(s => Object.values(ALL[s]).forEach(o => { if (o._dirty) n++; }));
  return n;
}

function statusText() {
  const c = cfg(), p = pendingCount();
  if (!c.url || !c.key) return 'Set up sync';
  if (syncing) return 'Syncing...';
  if (!navigator.onLine) return p ? 'Offline, ' + p + ' pending' : 'Offline';
  if (lastErr) return 'Sync error' + (p ? ', ' + p + ' pending' : '');
  return p ? p + ' pending' : 'Synced';
}

function updateStatus() {
  const b = document.getElementById('syncbtn');
  if (!b) return;
  b.textContent = statusText();
  b.className = lastErr ? 'err' : (pendingCount() ? 'pend' : '');
}

function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 1500); }

async function syncNow(manual) {
  const c = cfg();
  if (!c.url || !c.key) { if (manual) toast('Open Settings and enter the sync URL and key'); updateStatus(); return; }
  if (syncing) { syncAgain = true; return; }
  if (!navigator.onLine) { if (manual) toast('You are offline. Entries are saved on this phone.'); updateStatus(); return; }
  syncing = true; lastErr = ''; updateStatus();
  try {
    const items = {}, sent = {};
    STORES.forEach(s => {
      items[s] = [];
      Object.values(ALL[s]).forEach(o => {
        if (!o._dirty) return;
        const x = {};
        FIELDS[s].forEach(f => { x[f] = o[f]; });
        x.Deleted = o.Deleted ? 1 : 0;
        items[s].push(x);
        sent[s + ':' + o.ID] = o._v || 0;
      });
    });
    const since = Number(await metaGet('since')) || 0;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 40000);
    let res;
    try {
      res = await fetch(c.url, { method: 'POST', body: JSON.stringify({ key: c.key, action: 'sync', since: since, items: items }), signal: ctl.signal });
    } finally { clearTimeout(to); }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Sync failed');

    let foreign = 0;
    for (const s of STORES) {
      const batch = [];
      (data.items[s] || []).forEach(it => {
        const key = s + ':' + it.ID, local = ALL[s][it.ID];
        // local item was edited again while syncing: keep it, it will be sent next time
        if (local && local._dirty && (local._v || 0) !== (sent[key] === undefined ? -1 : sent[key])) return;
        if (sent[key] === undefined) foreign++;
        const rec = {};
        FIELDS[s].forEach(f => { rec[f] = it[f] === undefined ? '' : it[f]; });
        rec.Deleted = it.Deleted ? 1 : 0; rec.UpdatedAt = it.UpdatedAt || 0; rec._dirty = 0; rec._v = 0;
        ALL[s][rec.ID] = rec; batch.push(rec);
      });
      if (batch.length) await dbPutMany(s, batch);
    }
    await metaSet('since', data.now);
    localStorage.setItem('mda_last', String(Date.now()));
    refreshD();
    const ae = document.activeElement;
    if (foreign && !(ae && /INPUT|SELECT/.test(ae.tagName))) render();
  } catch (e) {
    lastErr = (e && e.name === 'AbortError') ? 'Server took too long' : (e instanceof TypeError ? 'No internet or server unreachable' : String(e.message || e));
    if (manual) toast(lastErr);
  } finally {
    syncing = false; updateStatus();
    if (syncAgain) { syncAgain = false; syncNow(false); }
  }
}

window.addEventListener('online', () => syncNow(false));
window.addEventListener('offline', updateStatus);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(false); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(false); }, 120000);

function exportBackup() {
  const data = {};
  STORES.forEach(s => { data[s] = Object.values(ALL[s]).map(o => { const x = Object.assign({}, o); delete x._dirty; delete x._v; return x; }); });
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'accounts-backup-' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
