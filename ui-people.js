/* ui-people.js - Person accounts: money lent to and borrowed from people.
   Not income, not expense. It only moves money between your account and the person.
   Net balance of a person: positive = the person owes you, negative = you owe the person. */
const PLABEL = { Lend: 'Lent to', Borrow: 'Borrowed from', Collect: 'Received back from', Repay: 'Paid back to' };
const PSHORT = { Lend: 'You lent', Borrow: 'You borrowed', Collect: 'Paid you back', Repay: 'You paid back' };
const PACT = { Lend: 'Lend: I gave money', Borrow: 'Borrow: I took money', Collect: 'Collect: they paid me back', Repay: 'Repay: I paid them back' };

function personName(id) { const p = D.people.find(x => x.ID === id); return p ? p.Name : ''; }
function personLabel(r) { return PLABEL[r.Type] + ' ' + (personName(r.Person) || 'unknown person'); }
function round2(n) { return Math.round(n * 100) / 100; }
function netText(b) { return b > 0.004 ? inr(b) + ' (owes you)' : b < -0.004 ? inr(-b) + ' (you owe)' : 'Settled'; }

function personBalances() {
  const m = {};
  D.people.forEach(p => { m[p.ID] = { p: p, bal: 0, lend: 0, collect: 0, borrow: 0, repay: 0 }; });
  D.records.forEach(r => {
    const x = m[r.Person], a = num(r.Amount);
    if (!x || PERSON_TYPES.indexOf(r.Type) < 0) return;
    if (r.Type === 'Lend') { x.bal += a; x.lend += a; }
    else if (r.Type === 'Repay') { x.bal += a; x.repay += a; }
    else if (r.Type === 'Collect') { x.bal -= a; x.collect += a; }
    else if (r.Type === 'Borrow') { x.bal -= a; x.borrow += a; }
  });
  Object.values(m).forEach(x => { x.bal = round2(x.bal); });
  return m;
}

function peopleTotals(m) {
  let rec = 0, pay = 0;
  Object.values(m).forEach(x => { if (x.bal > 0.004) rec += x.bal; else if (x.bal < -0.004) pay += -x.bal; });
  return { rec: rec, pay: pay };
}

function totalsCard(t) {
  return '<div class="two2"><div>To receive<b class="inc">' + inr(t.rec) + '</b></div><div>To pay<b class="neg">' + inr(t.pay) + '</b></div></div>';
}

// small summary for the Home screen
function peopleCard() {
  if (!D.people.length) return '';
  return '<h2>People</h2><div class="card" onclick="go(\'people\')">' + totalsCard(peopleTotals(personBalances())) + '</div>';
}

function viewPerson(id) { curPerson = id; go('people'); }

function personRow(x) {
  const b = x.bal, p = x.p;
  const right = Math.abs(b) < 0.005 ? '<div class="amt" style="color:var(--mu)">Settled</div>' :
    '<div class="amt ' + (b > 0 ? 'Income' : 'Expense') + '">' + inr(Math.abs(b)) + '</div>';
  const sub = [String(p.Phone || '').trim(), b > 0.004 ? 'owes you' : b < -0.004 ? 'you owe' : ''].filter(Boolean).join(' | ');
  return '<div class="rec" onclick="viewPerson(\'' + p.ID + '\')"><div class="dot Person"></div><div class="mid"><div class="t">' + esc(p.Name) + '</div>' +
    (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>' + right + '</div>';
}

function rPeople(v) {
  if (curPerson && !D.people.some(p => p.ID === curPerson)) curPerson = '';
  if (curPerson) return rPersonDetail(v);
  const m = personBalances();
  const list = Object.values(m).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal) || String(a.p.Name).localeCompare(String(b.p.Name)));
  let h = '<div class="card">' + totalsCard(peopleTotals(m)) + '</div>';
  h += list.length ? '<div class="hint">Tap a person to see the full ledger. Lending and borrowing are not income or expense.</div>' + list.map(personRow).join('') :
    '<div class="empty">No people yet. Add someone to track money you lent or borrowed.</div>';
  v.innerHTML = h + '<button class="btn add" onclick="openPerson()">+ Add person</button>';
}

function personLedger(id) {
  const rows = D.records.map((r, i) => Object.assign({ _i: i }, r))
    .filter(r => r.Person === id && PERSON_TYPES.indexOf(r.Type) >= 0)
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)) || a._i - b._i);
  let bal = 0;
  rows.forEach(r => { bal = round2(bal + ((r.Type === 'Lend' || r.Type === 'Repay') ? num(r.Amount) : -num(r.Amount))); r._bal = bal; });
  return rows.reverse();
}

function ledgerRow(r) {
  const note = String(r.Note || '').trim();
  return '<div class="rec" onclick="openRecord(\'' + r.ID + '\')"><div class="dot Person"></div><div class="mid"><div class="t">' + PSHORT[r.Type] + '</div>' +
    '<div class="s">' + esc(r.Account) + ' | ' + dmy(r.Date) + '</div>' + (note ? '<div class="n">' + esc(note) + '</div>' : '') +
    '<div class="s">Net after this: ' + netText(r._bal) + '</div></div><div class="amt Person">' + inr(num(r.Amount)) + '</div></div>';
}

function rPersonDetail(v) {
  const x = personBalances()[curPerson], p = x.p, b = x.bal;
  let h = '<button class="link" onclick="curPerson=\'\';render()">&larr; All people</button>';
  h += '<div class="card"><div class="row"><b>' + esc(p.Name) + '</b><button class="link" onclick="openPerson(\'' + p.ID + '\')">Edit</button></div>';
  if (p.Phone || p.Note) h += '<div class="sub">' + esc([String(p.Phone || '').trim(), String(p.Note || '').trim()].filter(Boolean).join(' | ')) + '</div>';
  h += '<div class="lbl">' + (b > 0.004 ? 'Owes you' : b < -0.004 ? 'You owe' : 'Balance') + '</div><div class="big ' + (b > 0.004 ? 'inc' : b < -0.004 ? 'neg' : '') + '">' + (Math.abs(b) < 0.005 ? 'Settled' : inr(Math.abs(b))) + '</div>';
  h += '<div class="stm"><div class="srow"><span>Total lent</span><b>' + inr(x.lend) + '</b></div><div class="srow"><span>Received back</span><b>' + inr(x.collect) + '</b></div>' +
    '<div class="srow"><span>Total borrowed</span><b>' + inr(x.borrow) + '</b></div><div class="srow"><span>Paid back</span><b>' + inr(x.repay) + '</b></div></div></div>';
  h += '<div class="pgrid"><button class="btn" onclick="openPersonRecord(\'Lend\')">I lent money</button><button class="btn" onclick="openPersonRecord(\'Borrow\')">I borrowed money</button>' +
    '<button class="btn" onclick="openPersonRecord(\'Collect\')">They paid me back</button><button class="btn" onclick="openPersonRecord(\'Repay\')">I paid back</button></div>';
  const led = personLedger(curPerson);
  h += '<h2>Ledger</h2>' + (led.length ? led.map(ledgerRow).join('') : '<div class="empty">No entries yet</div>');
  v.innerHTML = h;
}

/* ---------- person form ---------- */
function openPerson(id) {
  const p = id ? D.people.find(x => x.ID === id) : null;
  AF = p ? { ID: p.ID } : {};
  modal('<h3>' + (p ? 'Edit person' : 'New person') + '</h3>' +
    fld('Name', '<input type="text" id="p_name" maxlength="40" value="' + esc(p ? p.Name : '') + '">') +
    fld('Phone (optional)', '<input type="tel" id="p_phone" maxlength="20" value="' + esc(p ? String(p.Phone || '').trim() : '') + '">') +
    fld('Note (optional)', '<input type="text" id="p_note" maxlength="100" value="' + esc(p ? String(p.Note || '').trim() : '') + '">') +
    '<div id="err" class="err"></div><button class="btn" id="sv" onclick="savePerson()">Save</button>' +
    (p ? '<button class="btn ghost" onclick="delPerson(\'' + p.ID + '\')">Delete</button>' : ''));
}

function savePerson() {
  const name = $('p_name').value.trim();
  if (!name) return showErr('Enter a name');
  if (D.people.some(p => p.ID !== AF.ID && p.Name.toLowerCase() === name.toLowerCase())) return showErr('This person already exists');
  send('People', { ID: AF.ID, Name: name, Phone: $('p_phone').value.trim(), Note: $('p_note').value.trim() });
}

function delPerson(id) {
  if (D.records.some(r => r.Person === id)) { closeModal(); return toast('This person has entries, so cannot be deleted'); }
  askDelete('People', id, 'Delete this person?');
}

// opens the record form already set to a person entry
function openPersonRecord(action) {
  openRecord();
  RF.Type = 'Person'; RF.Action = action; RF.Person = curPerson;
  drawRecordForm();
}
