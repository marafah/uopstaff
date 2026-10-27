/* Office hours: shared by the instructor page and the office hours page.
   Reads the live list from the storage service (office-hours/Code.gs, a Google Sheet; its address is in
   data/office_hours_config.json) and falls back to the hourly copy data/office_hours.json. Writing needs the
   instructor's 30-day key (a code sent to their university e-mail). Unsaved edits are kept in the browser as a draft. */
window.OH = (function () {
  'use strict';
  const U = window.UOP;
  let CFG = null;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

  async function config() {
    if (!CFG) CFG = await U.getJSON('data/office_hours_config.json').catch(() => ({ api: '' }));
    return CFG;
  }
  // { map: {instructor id: entry}, live: true|false, updated }
  async function load() {
    const cfg = await config();
    if (cfg.api) {
      try {
        const d = await timeout(fetch(cfg.api + (cfg.api.includes('?') ? '&' : '?') + 't=' + Date.now()).then(r => r.json()), 9000);
        if (d && d.ok) return { map: Object.fromEntries(d.entries.map(e => [e.id, e])), live: true, updated: d.updated };
      } catch (e) { /* storage service unreachable: the hourly copy below */ }
    }
    const d = await U.getJSON('data/office_hours.json', true).catch(() => ({ entries: [] }));
    return { map: Object.fromEntries((d.entries || []).map(e => [e.id, e])), live: false, updated: d.updated };
  }
  async function post(body) {
    const cfg = await config();
    if (!cfg.api) return { ok: false, error: 'not_ready' };
    try {
      // text/plain: a simple request, no CORS preflight (Apps Script does not answer one)
      return await timeout(fetch(cfg.api, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()), 20000);
    } catch (e) { return { ok: false, error: 'network' }; }
  }
  // the key the browser keeps after the e-mail code (one per e-mail; the manager's key works for everyone)
  const keyFor = email => { const k = store.get('uop-oh-key:' + String(email || '').toLowerCase()); return k && k.until > Date.now() ? k : null; };
  const anyKey = () => { try { return Object.keys(localStorage).filter(k => k.startsWith('uop-oh-key:')).map(k => store.get(k)).filter(k => k && k.until > Date.now()); } catch (e) { return []; } };
  const keepKey = (email, key, days) => store.set('uop-oh-key:' + email.toLowerCase(), { email: email.toLowerCase(), key, until: Date.now() + days * 864e5 });
  const dropKey = email => store.del('uop-oh-key:' + String(email || '').toLowerCase());
  const draft = { get: id => store.get('uop-oh-draft:' + id), set: (id, v) => store.set('uop-oh-draft:' + id, { ...v, at: Date.now() }), del: id => store.del('uop-oh-draft:' + id) };

  // selected half hours ("ن|600") → [{day, start, end}] and back
  function toSlots(cells) {
    const by = {};
    [...cells].forEach(c => { const [d, t] = c.split('|'); (by[d] ||= []).push(+t); });
    const out = [];
    U.WEEK.forEach(d => {
      const ts = (by[d] || []).sort((a, b) => a - b);
      ts.forEach((t, i) => { const last = out[out.length - 1]; if (i && last && last.day === d && U.toMin(last.end) === t) last.end = U.toTime(t + 30); else out.push({ day: d, start: U.toTime(t), end: U.toTime(t + 30) }); });
    });
    return out;
  }
  function toCells(slots) {
    const s = new Set();
    (slots || []).forEach(x => { for (let t = U.toMin(x.start); t < U.toMin(x.end); t += 30) s.add(x.day + '|' + t); });
    return s;
  }
  const hours = slots => (slots || []).reduce((a, x) => a + (U.toMin(x.end) - U.toMin(x.start)), 0) / 60;
  const hoursText = h => Number.isInteger(h) ? U.count(h, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة') : `${h.toLocaleString('en-US')} ساعة`;
  const ERR = {
    not_allowed: 'هذا البريد لا يطابق بريد المدرس في دليل الموظفين.', wait: 'أُرسل رمز قبل أقل من دقيقة؛ انتظر قليلاً ثم أعد المحاولة.',
    expired: 'انتهت صلاحية الرمز؛ اطلب رمزاً جديداً.', too_many: 'محاولات كثيرة خاطئة؛ اطلب رمزاً جديداً.', wrong_code: 'الرمز غير صحيح.',
    login: 'انتهت صلاحية التحقق؛ أكّد بريدك مجدداً.', bad_slots: 'الأوقات غير صالحة.', not_ready: 'لم يُفعَّل حفظ الساعات المكتبية في الموقع بعد.',
    network: 'تعذّر الاتصال بخدمة الحفظ؛ مسودتك محفوظة في هذا المتصفح، أعد المحاولة لاحقاً.', server: 'خطأ في خدمة الحفظ؛ مسودتك محفوظة، أعد المحاولة لاحقاً.',
  };
  const msg = r => ERR[r.error] || ERR.server;
  return { config, load, post, keyFor, anyKey, keepKey, dropKey, draft, toSlots, toCells, hours, hoursText, msg };
})();
