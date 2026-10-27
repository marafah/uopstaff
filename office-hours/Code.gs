/**
 * Office hours storage for the unofficial UoP site (marafah.github.io/uopstaff).
 *
 * A Google Apps Script web app bound to a Google Sheet. The site reads and writes office hours through it; the
 * data lives only in the Sheet (never in the site's files), so no update of the site can touch it.
 *   Sheet "الساعات المكتبية": one row per instructor (the current hours).
 *   Sheet "السجل": every change, appended and never deleted (any earlier version can be restored from it).
 *   The Sheet's own version history (File > Version history) keeps every state as well.
 *
 * Who may save: an instructor proves they own the university e-mail of their directory entry with a 6-digit code
 * sent to it; the browser then keeps a 30-day key. ADMIN_EMAIL (the site manager) may save for any instructor.
 *
 * Setup (once): see office-hours/README.md.
 *   Script properties: SITE = https://marafah.github.io/uopstaff/   ADMIN_EMAIL = the manager's e-mail
 */

const SHEET = 'الساعات المكتبية';
const LOG = 'السجل';
const HEAD = ['id', 'name', 'email', 'department', 'faculty', 'slots', 'place', 'mode', 'link', 'note', 'updated', 'updated_by'];
const CODE_MINUTES = 15, CODE_TRIES = 5, KEY_DAYS = 30;
const DAYS = ['ح', 'ن', 'ث', 'ر', 'خ', 'س'];

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
// the site's instructor list (to know each instructor's university e-mail); cached for an hour
function instructors_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ins');
  if (hit) return JSON.parse(hit);
  const site = prop_('SITE') || 'https://marafah.github.io/uopstaff/';
  const data = JSON.parse(UrlFetchApp.fetch(site + 'data/instructors.json', { muteHttpExceptions: true }).getContentText());
  const map = {};
  data.instructors.forEach(i => { map[i.id] = { id: i.id, name: i.name, email: (i.email || '').toLowerCase(), department: i.department || '', faculty: i.faculty || '', office: i.office || '' }; });
  try { cache.put('ins', JSON.stringify(map), 3600); } catch (e) { /* larger than the cache allows: fetched each time */ }
  return map;
}
function rows_() {
  const sh = sheet_(SHEET, HEAD);
  const v = sh.getDataRange().getValues();
  const head = v.shift();
  return v.map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, j) => { o[h] = r[j]; }); return o; });
}
function publicEntry_(r) {
  let slots = [];
  try { slots = JSON.parse(r.slots || '[]'); } catch (e) { slots = []; }
  return { id: r.id, name: r.name, department: r.department, faculty: r.faculty, slots, place: r.place, mode: r.mode, link: r.link, note: r.note,
    updated: r.updated instanceof Date ? r.updated.toISOString() : String(r.updated || '') };
}

// ---------------------------------------------------------------- read: everyone
function doGet(e) {
  const out = rows_().filter(r => r.id).map(publicEntry_);
  return json_({ ok: true, updated: new Date().toISOString(), count: out.length, entries: out });
}

// ---------------------------------------------------------------- write: the instructor (or the manager)
function doPost(e) {
  let q = {};
  try { q = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    if (q.action === 'request') return json_(request_(q));
    if (q.action === 'verify') return json_(verify_(q));
    if (q.action === 'save') return json_(save_(q));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  }
}

// who may edit instructor `id` with e-mail `email`: the instructor themself, or the manager
function allowed_(id, email) {
  const ins = instructors_()[id];
  if (!ins) return null;
  email = String(email || '').trim().toLowerCase();
  const admin = prop_('ADMIN_EMAIL').toLowerCase();
  if (email && (email === ins.email || (admin && email === admin))) return ins;
  return null;
}
// 1) send a 6-digit code to the e-mail
function request_(q) {
  const ins = allowed_(q.id, q.email);
  if (!ins) return { ok: false, error: 'not_allowed' };
  const cache = CacheService.getScriptCache();
  const sentKey = 'sent:' + q.id + ':' + q.email.toLowerCase();
  if (cache.get(sentKey)) return { ok: false, error: 'wait' };  // one code per minute
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('code:' + q.id + ':' + q.email.toLowerCase(), JSON.stringify({ h: hash_(code), tries: 0 }), CODE_MINUTES * 60);
  cache.put(sentKey, '1', 60);
  MailApp.sendEmail({
    to: q.email, name: 'دليل جامعة البترا (غير رسمي)', subject: 'رمز تعديل الساعات المكتبية: ' + code,
    htmlBody: `<div dir="rtl" style="font-family:Tahoma,Arial;font-size:15px">رمز التحقق لتعديل الساعات المكتبية لـ<b>${ins.name}</b>:<br>
      <div style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</div>صالح لمدة ${CODE_MINUTES} دقيقة. إن لم تطلبه فتجاهل هذه الرسالة.</div>`,
  });
  return { ok: true, minutes: CODE_MINUTES };
}
// 2) check the code; return a key the browser keeps for later edits
function verify_(q) {
  const ins = allowed_(q.id, q.email);
  if (!ins) return { ok: false, error: 'not_allowed' };
  const cache = CacheService.getScriptCache(), ck = 'code:' + q.id + ':' + q.email.toLowerCase();
  const c = JSON.parse(cache.get(ck) || 'null');
  if (!c) return { ok: false, error: 'expired' };
  if (c.tries >= CODE_TRIES) { cache.remove(ck); return { ok: false, error: 'too_many' }; }
  if (hash_(String(q.code || '').trim()) !== c.h) { c.tries++; cache.put(ck, JSON.stringify(c), CODE_MINUTES * 60); return { ok: false, error: 'wrong_code', left: CODE_TRIES - c.tries }; }
  cache.remove(ck);
  const key = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('key_' + hash_(key), JSON.stringify({ email: q.email.toLowerCase(), until: Date.now() + KEY_DAYS * 864e5 }));
  return { ok: true, key, days: KEY_DAYS };
}
function keyOk_(key, id) {
  if (!key) return null;
  const k = JSON.parse(PropertiesService.getScriptProperties().getProperty('key_' + hash_(key)) || 'null');
  if (!k || k.until < Date.now()) return null;
  return allowed_(id, k.email) ? k.email : null;
}
// 3) save (replace) the instructor's office hours; every change is also appended to the log
function clean_(slots) {
  if (!Array.isArray(slots)) return null;
  const ok = [], re = /^([01]\d|2[0-3]):[03]0$/;
  for (const s of slots.slice(0, 40)) {
    if (!s || DAYS.indexOf(s.day) < 0 || !re.test(s.start) || !re.test(s.end) || s.end <= s.start) return null;
    ok.push({ day: s.day, start: s.start, end: s.end });
  }
  return ok;
}
function save_(q) {
  const by = keyOk_(q.key, q.id);
  if (!by) return { ok: false, error: 'login' };
  const ins = instructors_()[q.id];
  const slots = clean_(q.slots);
  if (!slots) return { ok: false, error: 'bad_slots' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET, HEAD);
    const row = rows_().find(r => r.id === q.id);
    const now = new Date();
    const vals = [q.id, ins.name, ins.email, ins.department, ins.faculty, JSON.stringify(slots), String(q.place || '').slice(0, 80),
      ['وجاهي', 'عن بعد', 'وجاهي وعن بعد'].indexOf(q.mode) >= 0 ? q.mode : 'وجاهي', String(q.link || '').slice(0, 300), String(q.note || '').slice(0, 300), now, by];
    if (row) sh.getRange(row._row, 1, 1, HEAD.length).setValues([vals]); else sh.appendRow(vals);
    sheet_(LOG, ['time', 'id', 'name', 'by', 'slots', 'place', 'mode', 'link', 'note']).appendRow([now, q.id, ins.name, by, vals[5], vals[6], vals[7], vals[8], vals[9]]);
    return { ok: true, entry: publicEntry_({ id: q.id, name: ins.name, department: ins.department, faculty: ins.faculty, slots: vals[5], place: vals[6], mode: vals[7], link: vals[8], note: vals[9], updated: now }) };
  } finally {
    lock.releaseLock();
  }
}
