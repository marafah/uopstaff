/* «إعلانات الشاشات» (screen-posts.html): faculties and departments post announcements to the building and service
   screens; the site admin approves them and controls every screen.

   Security (what the browser does; scripts/screen_posts.py checks everything again on GitHub's side):
   - each account has its own key pair. Its private key, and the shared key that opens the publishing key, are kept in
     data/screens/accounts.json encrypted with the account's password (PBKDF2 310,000 rounds + AES-GCM). The password
     never leaves the device and nothing is stored on it: closing the page signs out.
   - every request is signed with the account's private key; GitHub accepts it only for that account, only with its
     permissions, only once and only within 30 minutes. Posts of accounts that are not «trusted» wait for approval.
   - the publishing key (GitHub, this repository only, Actions read and write) can start workflows, but cannot change a
     file; what is written is decided by the workflow after the checks.
   Requests go to .github/workflows/screen-posts.yml; the result comes back through data/screens/log.json. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc } = U, PP = window.UOP_PP;
  const REPO = 'marafah/uopstaff', WF = `https://api.github.com/repos/${REPO}/actions/workflows/screen-posts.yml/dispatches`;
  const MAXREQ = 65000, MAXIMG = 46000, ITER = 310000;
  const TE = new TextEncoder(), TD = new TextDecoder();
  const app = $('#pp-app');
  let ACC, DATA, LOGF, BLDS = [], S = null, tab = 'new', draft = null, img = null, edit = null, wait = [], form = null, flash = '';

  // ---------------------------------------------------------------- small helpers
  const noCache = u => fetch(u + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : (r.status === 404 ? null : Promise.reject(new Error(r.status)))).catch(e => { if (e.message === '404') return null; throw e; });
  const b64 = b => { b = new Uint8Array(b); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
  const today = () => U.amman().iso;
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const label = k => PP.LABEL[k] || k;
  const ALPH = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newPassword = () => Array.from({ length: 4 }, () => Array.from(crypto.getRandomValues(new Uint8Array(4)), x => ALPH[x % ALPH.length]).join('')).join('-');
  async function pwKey(user, pw, salt) {
    const base = await crypto.subtle.importKey('raw', TE.encode('uopstaff-screens|' + user + '|' + pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const aesRaw = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function enc(key, bytes) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) }; }
  const dec = async (key, o) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct)));
  // the account's box: {k: private key (PKCS8), t: the shared key that opens the publishing key}, sealed with the password
  async function seal(user, pw, inner) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { salt: b64(salt), ...(await enc(await pwKey(user, pw, salt), TE.encode(JSON.stringify(inner)))) };
  }
  async function identity(user, pw, tk) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey), k = b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    return { pub: { x: jwk.x, y: jwk.y }, box: await seal(user, pw, { k, t: b64(tk) }), priv: kp.privateKey, k };
  }
  const signKey = k => crypto.subtle.importKey('pkcs8', unb64(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sign = async (priv, s) => b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, TE.encode(s)));
  const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');

  // ---------------------------------------------------------------- «وضع التجربة» (screen-posts.html?demo=1)
  // For trying the system without an account: made-up data, a switch between «جهة» and «مسؤول», and a demo screen
  // (screen.html?b=...&demo=1). Nothing is sent to GitHub and no key or password is used: everything stays in this
  // browser (localStorage) until «ابدأ من جديد».
  const DEMO = new URLSearchParams(location.search).has('demo'), DKEY = 'uop-pp-demo';
  let DS = '';   // the demo faculty's screen
  const dSave = () => { try { localStorage.setItem(DKEY, JSON.stringify({ ACC, DATA, LOG: LOGF })); } catch (e) { /* storage unavailable: the demo still works on this page */ } };
  const dLoad = () => { try { return JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (e) { return null; } };
  const POSTER = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b4a66"/><stop offset="1" stop-color="#6e151a"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><circle cx="1350" cy="160" r="260" fill="#fbbf24" opacity=".18"/><circle cx="220" cy="760" r="320" fill="#fff" opacity=".07"/>
    <g font-family="Tahoma, Arial, sans-serif" text-anchor="middle" fill="#fff"><text x="800" y="300" font-size="64" fill="#fde68a">بوستر تجريبي</text>
    <text x="800" y="450" font-size="110" font-weight="bold">المعرض السنوي لمشاريع الطلبة</text>
    <text x="800" y="580" font-size="56">١٥ – ١٧ من الشهر القادم · ساحة الجامعة</text><text x="800" y="760" font-size="40" fill="#cbd5e1">مثال فقط — ليس إعلاناً حقيقياً</text></g></svg>`)));
  function demoSeed() {
    const t = today(), base = { owner: 'demo', ownerName: 'كلية تجريبية', screens: [DS], start: t, end: addDays(t, 14), days: [], from: '', to: '', pin: false, created: new Date().toISOString() };
    const posts = [
      { ...base, id: 'd1', type: 'ticker', title: '', text: 'التسجيل مفتوح في دورة الإسعافات الأولية — المقاعد محدودة (مثال)', status: 'live' },
      { ...base, id: 'd2', type: 'notice', title: 'محاضرة عامة: الذكاء الاصطناعي في التعليم', text: 'يدعوكم القسم لحضور محاضرة عامة يوم الخميس الساعة 11:00 في القاعة 101.\nالدعوة عامة.', icon: 'bi-lightbulb', tone: 'gold', link: 'https://example.com/lecture', status: 'live' },
      { ...base, id: 'd3', type: 'event', title: 'يوم الإبداع الطلابي', text: 'معرض مشاريع ومسابقات وجوائز', place: 'ساحة الجامعة', at: addDays(t, 3) + 'T10:00', icon: 'bi-trophy', tone: 'maroon', link: 'https://example.com/event', status: 'live' },
      { ...base, id: 'd4', type: 'poster', title: 'المعرض السنوي', text: 'مثال على بوستر', image: POSTER, link: '', status: 'live' },
      { ...base, id: 'd6', type: 'urgent', owner: 'admin', ownerName: 'المسؤول (تجربة)', title: 'تنبيه', text: 'إغلاق موقف السيارات الشرقي اليوم للصيانة (مثال)', status: 'live' },
      { ...base, id: 'd5', type: 'notice', title: 'ورشة عمل: كتابة السيرة الذاتية', text: 'ورشة لطلبة السنة الرابعة؛ التسجيل لدى سكرتيرة الكلية.', icon: 'bi-briefcase', tone: 'info', link: '', status: 'pending' }];
    ACC = { users: { demo: { name: 'كلية تجريبية', role: 'unit', screens: [DS], types: ['ticker', 'notice', 'event', 'poster'], trusted: false, max: 6, maxDays: 30, active: true },
      admin: { name: 'المسؤول (تجربة)', role: 'admin', screens: ['*'], types: ['ticker', 'notice', 'event', 'poster'], trusted: true, active: true } } };
    DATA = { v: 1, settings: { default: { every: 1, secs: 12 }, screens: {} }, alert: null, posts };
    LOGF = { log: [] };
    dSave();
  }
  function demoApply(a, d) {
    const u = S.u, acc = ACC.users[u], admin = acc.role === 'admin', P = DATA.posts, find = id => P.find(p => p.id === id);
    const no = why => ({ ok: false, why }), adminOnly = () => admin ? null : no('هذا الإجراء للمسؤول فقط');
    if (a === 'submit') {
      const old = d.id ? find(d.id) : null;
      if (old && old.owner !== u && !admin) return no('ليس إعلانك');
      if (!d.screens.length || d.screens.some(k => !may(acc, k))) return no('لا يحق لحسابك النشر على هذه الشاشات');
      if (!admin && !typesOf(acc).includes(d.type)) return no('هذا النوع غير مسموح لحسابك');
      if (d.end < today() || d.end < d.start) return no('تحقق من التاريخين');
      if (!admin && (Date.parse(d.end) - Date.parse(d.start)) / 864e5 + 1 > (acc.maxDays || 30)) return no(`مدة الإعلان ${acc.maxDays || 30} يوماً على الأكثر`);
      const mine = P.filter(p => p.owner === u && ['pending', 'live'].includes(p.status) && p.end >= today() && p.id !== d.id);
      if (!admin && mine.length >= (acc.max || 6)) return no(`لديك ${mine.length} إعلانات نشطة؛ الحد ${acc.max || 6}`);
      const rec = Object.assign({}, old || {}, d, { id: old ? old.id : 'd' + Date.now(), owner: old ? old.owner : u, ownerName: old ? old.ownerName : acc.name,
        status: admin || acc.trusted ? 'live' : 'pending', updated: new Date().toISOString() });
      if (d.image) rec.image = (d.image.startsWith('/9j/') ? 'data:image/jpeg;base64,' : d.image.startsWith('iVBOR') ? 'data:image/png;base64,' : 'data:image/webp;base64,') + d.image;
      if (rec.type !== 'poster') delete rec.image; else if (!rec.image) return no('البوستر يحتاج صورة');
      if (rec.status === 'pending') delete rec.review;
      if (old) P[P.indexOf(old)] = rec; else P.unshift(rec);
      return { ok: true, id: rec.id, note: rec.status === 'live' ? 'نُشر (تجربة)' : 'بانتظار الموافقة — بدّل إلى «مسؤول» لتوافق عليه' };
    }
    if (a === 'withdraw' || a === 'delete') { const p = find(d.id); if (!p) return no('غير موجود'); if (a === 'delete' && !admin) return adminOnly(); P.splice(P.indexOf(p), 1); return { ok: true }; }
    if (a === 'review') { if (!admin) return adminOnly(); d.ids.forEach(id => { const p = find(id); if (p) { p.status = d.ok ? 'live' : 'rejected'; p.review = { by: u, ok: d.ok, note: d.note }; } }); return { ok: true, note: d.ok ? 'موافقة' : 'رفض' }; }
    if (a === 'stop' || a === 'resume' || a === 'pin') { const p = find(d.id); if (!p) return no('غير موجود'); if (!(a === 'stop' && p.owner === u) && !admin) return adminOnly();
      if (a === 'stop') { p.status = 'stopped'; p.review = { by: u, ok: false, note: 'أوقف' }; } else if (a === 'resume') p.status = 'live'; else p.pin = !!d.on; return { ok: true }; }
    if (a === 'settings') { if (!admin) return adminOnly(); DATA.settings = { default: d.default, screens: d.screens }; return { ok: true }; }
    if (a === 'alert') { if (!admin) return adminOnly(); DATA.alert = d.on ? { title: d.title, text: d.text, screens: d.screens, until: new Date(Date.now() + d.hours * 3600e3).toISOString() } : null; return { ok: true }; }
    if (a === 'account') { if (!admin) return adminOnly(); if (d.remove) delete ACC.users[d.user]; else ACC.users[d.user] = Object.assign({}, ACC.users[d.user] || {}, pick(d)); return { ok: true, note: 'لا يُنشأ حساب حقيقي في التجربة' }; }
    return no('غير متاح في وضع التجربة');
  }
  function demoBar() {
    const other = S.u === 'admin' ? 'demo' : 'admin', SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    return `<div class="pp-demo"><div><i class="bi bi-cone-striped"></i> <b>وضع التجربة</b> — بيانات وهمية؛ لا يُنشر أي شيء على الشاشات الحقيقية، وكل شيء يبقى في هذا المتصفح فقط.</div>
      <div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-dark" id="pp-role"><i class="bi bi-arrow-left-right"></i> جرّب بصفة ${other === 'admin' ? '«المسؤول»' : '«الجهة»'}</button>
        <a class="btn btn-sm btn-outline-dark" target="_blank" href="${SITE}screen.html?b=${encodeURIComponent(DS)}&demo=1"><i class="bi bi-display"></i> الشاشة التجريبية</a>
        <button class="btn btn-sm btn-outline-danger" id="pp-reset"><i class="bi bi-arrow-counterclockwise"></i> ابدأ من جديد</button></div></div>`;
  }

  // ---------------------------------------------------------------- sending a request
  async function dispatch(tok, req) {
    const r = await fetch(WF, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'main', inputs: { req } }) });
    if (r.status === 204) return;
    throw new Error(r.status === 401 ? 'expired' : r.status === 403 || r.status === 404 ? 'denied' : r.status === 422 ? 'toolarge' : 'net');
  }
  const errText = e => ({ expired: 'مفتاح النشر منتهي الصلاحية أو أُلغي. على المسؤول تجديده من «المفتاح وكلمة المرور».',
    denied: 'مفتاح النشر لا يملك صلاحية تشغيل النشر. على المسؤول تجديده.', toolarge: 'الطلب أكبر من المسموح؛ صغّر الصورة أو النص.',
    big: 'الطلب أكبر من المسموح (65 ألف حرف)؛ اختر صورة أبسط.' }[e.message] || 'تعذّر الاتصال بـ GitHub. تأكد من الإنترنت وحاول مرة أخرى.');
  async function send(a, d, what, opt = {}) {
    if (DEMO) {
      const r = demoApply(a, JSON.parse(JSON.stringify(d)));
      LOGF.log.unshift(Object.assign({ at: new Date().toISOString(), u: S.u, a }, r));
      dSave();
      flash = r.ok ? `<div class="alert alert-success py-2 mb-2"><i class="bi bi-check-circle-fill"></i> تم (تجربة): ${esc(what)}${r.note ? ' — ' + esc(r.note) : ''}</div>`
        : `<div class="alert alert-danger py-2 mb-2"><i class="bi bi-x-octagon-fill"></i> رُفض «${esc(what)}»: ${esc(r.why)}</div>`;
      return;
    }
    const p = JSON.stringify({ v: 1, u: opt.user || S.u, ts: Date.now(), n: nonce(), a, d });
    const req = JSON.stringify({ p, s: await sign(opt.priv || S.priv, p) });
    if (req.length > MAXREQ) throw new Error('big');
    await dispatch(opt.tok || S.tok, req);
    wait.push({ n: JSON.parse(p).n, what, at: Date.now() });
    watch();
  }
  // the workflow's answer appears in data/screens/log.json, usually within a minute
  let watching = null;
  function watch() {
    bar();
    if (watching) return;
    watching = setInterval(async () => {
      const L = await noCache('data/screens/log.json').catch(() => null);
      const done = [];
      wait = wait.filter(w => {
        const e = L && (L.log || []).find(x => x.n === w.n);
        if (e) { done.push({ w, e }); return false; }
        if (Date.now() - w.at > 8 * 60000) { done.push({ w, e: null }); return false; }
        return true;
      });
      if (done.length) {
        LOGF = L;
        flash = done.map(({ w, e }) => !e ? `<div class="alert alert-warning py-2 mb-2"><i class="bi bi-hourglass"></i> «${esc(w.what)}»: لم يصل الرد بعد. تحقق من «السجل» بعد قليل.</div>`
          : e.ok ? `<div class="alert alert-success py-2 mb-2"><i class="bi bi-check-circle-fill"></i> تم: ${esc(w.what)}${e.note ? ' — ' + esc(e.note) : ''}</div>`
          : `<div class="alert alert-danger py-2 mb-2"><i class="bi bi-x-octagon-fill"></i> رُفض «${esc(w.what)}»: ${esc(e.why || '')}</div>`).join('');
        await reload();
      }
      if (!wait.length) { clearInterval(watching); watching = null; }
      bar();
    }, 10000);
  }
  function bar() {
    const el = $('#pp-wait'); if (!el) return;
    el.innerHTML = wait.length ? `<div class="pp-waitbar"><span class="spinner-border spinner-border-sm"></span> قيد التنفيذ على GitHub: ${wait.map(w => esc(w.what)).join('، ')} · عادةً أقل من دقيقتين، ثم تتحدّث الشاشات خلال 3 دقائق</div>` : '';
  }
  async function reload() {
    if (DEMO) { render(); return; }
    [ACC, DATA] = await Promise.all([noCache('data/screens/accounts.json'), noCache('data/screen_posts.json')]);
    DATA = DATA || { posts: [], settings: { default: {}, screens: {} }, alert: null };
    if (S && ACC && ACC.users[S.u]) S.a = ACC.users[S.u];
    render();
  }

  // ---------------------------------------------------------------- screens and permissions
  const ALL = () => ['*', 'g:buildings', 'g:services', ...BLDS, 'others', ...PP.SERVICES, 'exams'];
  const CONCRETE = () => [...BLDS, 'others', ...PP.SERVICES, 'exams'];
  const isAdmin = () => S && S.a.role === 'admin';
  function may(a, t) {
    const h = a.screens || [];
    if (a.role === 'admin' || h.includes('*') || h.includes(t)) return true;
    if (PP.SERVICES.includes(t)) return h.includes('g:services');
    return !t.startsWith('g:') && t !== '*' && t !== 'exams' && h.includes('g:buildings');
  }
  const typesOf = a => a.role === 'admin' ? Object.keys(PP.TYPES) : (a.types || []).filter(t => PP.TYPES[t]);
  function state(p) {
    const t = today();
    if (p.status === 'pending') return ['pending', 'بانتظار الموافقة', 'bi-hourglass-split'];
    if (p.status === 'rejected') return ['rejected', 'مرفوض', 'bi-x-circle'];
    if (p.status === 'stopped') return ['stopped', 'موقوف', 'bi-pause-circle'];
    if (p.end < t) return ['ended', 'منتهي', 'bi-clock-history'];
    if (p.start > t) return ['soon', 'مجدول من ' + U.numDate(p.start), 'bi-calendar-check'];
    return ['live', 'معروض الآن', 'bi-broadcast'];
  }

  // ---------------------------------------------------------------- page
  function render() {
    if (ACC === undefined) return;
    if (!ACC || !ACC.users || !Object.keys(ACC.users).length) { setup(); return; }
    if (!S) { login(); return; }
    const pend = (DATA.posts || []).filter(p => p.status === 'pending').length;
    const T = [['new', 'bi-plus-circle', edit ? 'تعديل إعلان' : 'إعلان جديد'], ['examples', 'bi-grid-1x2', 'أمثلة الإعلانات'], ['mine', 'bi-collection', 'إعلاناتي']]
      .concat(isAdmin() ? [['queue', 'bi-inbox', `بانتظار الموافقة${pend ? ` <span class="badge text-bg-danger">${pend}</span>` : ''}`], ['all', 'bi-list-check', 'كل الإعلانات'],
        ['now', 'bi-display', 'الشاشات الآن'], ['settings', 'bi-sliders', 'إعدادات الشاشات'], ['alert', 'bi-exclamation-octagon', 'رسالة طوارئ'],
        ['accounts', 'bi-people', 'الحسابات'], ['log', 'bi-journal-text', 'السجل']] : [['now', 'bi-display', 'الشاشات الآن']])
      .concat([['me', 'bi-key', isAdmin() ? 'المفتاح وكلمة المرور' : 'كلمة المرور']]);
    app.innerHTML = (DEMO ? demoBar() : '') + `<div class="pp-top"><div><i class="bi bi-person-circle"></i> <b>${esc(S.a.name)}</b> <small class="text-muted" dir="ltr">${esc(S.u)}</small>
        ${isAdmin() ? '<span class="badge text-bg-dark">مسؤول</span>' : S.a.trusted ? '<span class="badge text-bg-success">نشر مباشر</span>' : '<span class="badge text-bg-secondary">بموافقة المسؤول</span>'}</div>
        <button class="btn btn-sm btn-outline-secondary" id="pp-out"><i class="bi bi-box-arrow-right"></i> خروج</button></div>
      <div id="pp-wait"></div>${flash}
      <ul class="nav nav-pills pp-tabs mb-3">${T.map(([k, ic, t]) => `<li class="nav-item"><a href="#" class="nav-link ${tab === k ? 'active' : ''}" data-tab="${k}"><i class="bi ${ic}"></i> ${t}</a></li>`).join('')}</ul>
      <div id="pp-body"></div>`;
    flash = '';
    bar();
    $('#pp-out').onclick = () => { if (DEMO) { location.href = location.pathname; return; } S = null; edit = null; draft = null; img = null; render(); };
    if (DEMO) {
      $('#pp-role').onclick = () => { const o = S.u === 'admin' ? 'demo' : 'admin'; S = { u: o, a: ACC.users[o], demo: true }; edit = null; draft = null; img = null;
        tab = o === 'admin' && DATA.posts.some(p => p.status === 'pending') ? 'queue' : 'new'; render(); };
      $('#pp-reset').onclick = () => { demoSeed(); S = { u: 'demo', a: ACC.users.demo, demo: true }; tab = 'new'; edit = null; draft = null; img = null; render(); };
    }
    app.querySelectorAll('[data-tab]').forEach(a => a.onclick = e => { e.preventDefault(); tab = a.dataset.tab; if (tab !== 'new') { edit = null; } render(); });
    ({ new: compose, examples, mine: () => list('mine'), queue: () => list('queue'), all: () => list('all'), now: screensNow, settings, alert: alertTab, accounts, log: logTab, me }[tab] || compose)();
  }
  const body = () => $('#pp-body');
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.html = btn.innerHTML; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> …'; } else if (btn.dataset.html) btn.innerHTML = btn.dataset.html; };
  async function act(btn, a, d, what, after) {
    busy(btn, true);
    try { await send(a, d, what); if (after) after(); else render(); } catch (e) { busy(btn, false); say(errText(e), 'danger'); }
  }
  function say(t, kind = 'danger') { const m = $('#pp-msg'), el = m || $('#pp-wait'); if (!el) return; const h = `<div class="alert alert-${kind} py-2">${t}</div>`; if (m) m.innerHTML = h; else el.insertAdjacentHTML('afterbegin', h); }

  // ---------------------------------------------------------------- first set-up (the site owner, once)
  function setup() {
    const NEWTOK = 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent('إعلانات الشاشات') + '&description=' + encodeURIComponent('Screen posts page: start the Screen posts workflow only') + '&expires_in=366&target_name=marafah&actions=write';
    app.innerHTML = `<div class="card pp-card0"><div class="card-body">
      <h5 class="fw-bold"><i class="bi bi-gear"></i> إعداد إعلانات الشاشات (مرة واحدة، لصاحب الموقع)</h5>
      <p class="small text-muted">تنشئ هنا حساب المسؤول الأول. كلمة المرور لا تُرسل ولا تُحفظ في أي مكان؛ تُستعمل على جهازك فقط لتشفير مفاتيحك. احفظها في مكان آمن: لا يمكن استعادتها.</p>
      <ol class="small"><li>افتح <a href="${NEWTOK}" target="_blank" rel="noopener">إنشاء مفتاح GitHub</a> (تسجيل الدخول بحساب marafah).</li>
        <li>في <b>Repository access</b> اختر <b>Only select repositories</b> ثم <b>uopstaff</b> فقط.</li>
        <li>في <b>Permissions</b> اضغط <b>+ Add permissions</b> واختر <b>Actions</b> ثم <b>Read and write</b> (ولا شيء غيره؛ يُضاف Metadata وحده). ثم <b>Generate token</b> وانسخه والصقه هنا.</li></ol>
      <form id="pp-setup" class="row g-2">
        <div class="col-md-4"><label class="form-label small">اسم المستخدم (إنجليزي)</label><input name="u" class="form-control" dir="ltr" value="admin" required></div>
        <div class="col-md-8"><label class="form-label small">الاسم الظاهر</label><input name="name" class="form-control" value="مسؤول الموقع" required></div>
        <div class="col-md-6"><label class="form-label small">كلمة المرور (12 حرفاً على الأقل)</label><div class="input-group"><input name="p" class="form-control" dir="ltr" minlength="12" required autocomplete="new-password">
          <button type="button" class="btn btn-outline-secondary" id="pp-gen">توليد</button></div></div>
        <div class="col-md-6"><label class="form-label small">أعد كتابتها</label><input name="p2" class="form-control" dir="ltr" required autocomplete="new-password"></div>
        <div class="col-12"><label class="form-label small">مفتاح GitHub</label><input name="tok" class="form-control" dir="ltr" placeholder="github_pat_…" required></div>
        <div class="col-12" id="pp-msg"></div>
        <div class="col-12"><button class="btn btn-maroon"><i class="bi bi-shield-lock"></i> إنشاء حساب المسؤول</button></div></form></div></div>`;
    const f = $('#pp-setup');
    $('#pp-gen').onclick = () => { f.p.value = f.p2.value = newPassword(); f.p.type = 'text'; };
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('button.btn-maroon'), u = f.u.value.trim().toLowerCase(), tok = f.tok.value.trim();
      if (f.p.value !== f.p2.value) return say('كلمتا المرور غير متطابقتين');
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)) return say('هذا لا يبدو مفتاح GitHub');
      busy(btn, true);
      try {
        const tk = crypto.getRandomValues(new Uint8Array(32)), id = await identity(u, f.p.value, tk);
        const tokBox = await enc(await aesRaw(tk), TE.encode(tok));
        await send('init', { account: { name: f.name.value.trim(), pub: id.pub, box: id.box }, tok: tokBox }, 'إعداد حساب المسؤول', { user: u, priv: id.priv, tok });
        app.innerHTML = `<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i> أُرسل الإعداد. بعد دقيقة أو اثنتين أعد تحميل الصفحة وادخل باسم <b dir="ltr">${esc(u)}</b> وكلمة المرور.</div><div id="pp-wait"></div>`;
        bar();
      } catch (e2) { busy(btn, false); say(errText(e2)); }
    };
  }

  // ---------------------------------------------------------------- sign in
  function login() {
    app.innerHTML = `<div class="pp-login card"><div class="card-body">
      <div class="text-center mb-2"><i class="bi bi-megaphone-fill text-maroon fs-1"></i><h5 class="fw-bold mt-1">إعلانات الشاشات</h5>
        <p class="small text-muted mb-0">للكليات والدوائر: انشر إعلاناً على شاشات المباني. الحسابات يُنشئها مسؤول الموقع.</p></div>
      <form id="pp-login" class="d-grid gap-2"><input name="u" class="form-control" dir="ltr" placeholder="اسم المستخدم" autocomplete="username" autocapitalize="off" required>
        <input name="p" type="password" class="form-control" dir="ltr" placeholder="كلمة المرور" autocomplete="current-password" required>
        <div id="pp-msg"></div><button class="btn btn-maroon"><i class="bi bi-box-arrow-in-left"></i> دخول</button></form>
      <a class="btn btn-outline-secondary w-100 mt-3" href="?demo=1"><i class="bi bi-cone-striped"></i> جرّب النظام دون حساب (وضع تجربة)</a>
      <p class="small text-muted mt-3 mb-0"><i class="bi bi-shield-check"></i> كلمة المرور لا تغادر جهازك، ولا يُحفظ شيء بعد إغلاق الصفحة.</p></div></div>`;
    const f = $('#pp-login');
    f.onsubmit = async e => {
      e.preventDefault();
      const u = f.u.value.trim().toLowerCase(), a = ACC.users[u], btn = f.querySelector('button');
      busy(btn, true);
      try {
        if (!a) throw new Error('x');
        const inner = JSON.parse(TD.decode(await dec(await pwKey(u, f.p.value, unb64(a.box.salt)), a.box)));
        if (a.active === false) { busy(btn, false); return say('هذا الحساب موقوف. تواصل مع مسؤول الموقع.'); }
        const tk = unb64(inner.t);
        S = { u, a, k: inner.k, priv: await signKey(inner.k), tk, tok: TD.decode(await dec(await aesRaw(tk), ACC.tok)) };
        tab = 'new';
        render();
      } catch (e2) { busy(btn, false); f.p.value = ''; say('اسم المستخدم أو كلمة المرور غير صحيحة'); }
    };
  }

  // ---------------------------------------------------------------- examples of every kind, with their preview
  const SAMPLE = {
    ticker: { text: 'التسجيل مفتوح في دورة الإسعافات الأولية — المقاعد محدودة', use: 'خبر قصير في سطر واحد: تذكير بموعد، تغيير قاعة، فتح تسجيل. يبقى ظاهراً أسفل الشاشة طوال مدته.' },
    notice: { title: 'محاضرة عامة: الذكاء الاصطناعي في التعليم', text: 'يدعوكم القسم لحضور محاضرة عامة يوم الخميس الساعة 11:00 في القاعة 101.\nالدعوة عامة للطلبة والمدرسين.',
      icon: 'bi-lightbulb', tone: 'gold', link: 'https://example.com/lecture', use: 'إعلان بعنوان وتفاصيل: محاضرة، تعليمات، دعوة. يظهر دورياً في وسط الشاشة 15 ثانية، ومع رابط يظهر رمز QR.' },
    event: { title: 'يوم الإبداع الطلابي', text: 'معرض مشاريع الطلبة ومسابقات وجوائز', place: 'ساحة الجامعة', icon: 'bi-trophy', tone: 'maroon', link: 'https://example.com/register',
      use: 'فعالية بموعد محدد: يظهر عدّ تنازلي (بعد 3 أيام، غداً، اليوم) ورمز QR للتسجيل. تختفي بعد الفعالية وحدها.' },
    poster: { title: 'المعرض السنوي', text: '15 – 17 من الشهر القادم', use: 'ملصق جاهز التصميم (صورة JPG أو PNG). يملأ وسط الشاشة دورياً؛ الأفضل صورة عرضية بخطوط كبيرة.' },
    urgent: { title: 'تنبيه', text: 'إغلاق موقف السيارات الشرقي اليوم للصيانة', use: 'للمسؤول فقط: شريط أحمر ثابت تحت عنوان الشاشة طوال مدته، لأمر مهم يجب أن يراه الجميع.' },
    alert: { title: 'إخلاء المبنى', text: 'يرجى التوجه إلى أقرب مخرج بهدوء واتباع تعليمات الأمن', use: 'للمسؤول فقط (من «رسالة طوارئ»): تغطي وسط الشاشة بالكامل حتى تُلغى، حتى على الشاشات المضبوطة «كما هي».' } };
  const sample = type => { const x = Object.assign({}, SAMPLE[type]); delete x.use; if (type === 'event') x.at = addDays(today(), 3) + 'T10:00'; if (type === 'poster') x.image = POSTER; return x; };
  function examples() {
    const scr = (DEMO && DS) || (S && ALL().filter(k => may(S.a, k)).find(k => !k.startsWith('g:') && k !== '*')) || DS || BLDS[0], allowed = typesOf(S.a);
    body().innerHTML = `<p class="small text-muted"><i class="bi bi-info-circle"></i> كل أنواع الإعلانات كما تظهر على الشاشة، ببيانات مثال. اضغط «استعمل هذا المثال» لتبدأ إعلاناً من النوع نفسه وتعدّل نصه.</p>
      <div class="pp-exs">${['ticker', 'notice', 'event', 'poster', 'urgent', 'alert'].map(t => {
        const T = t === 'alert' ? { t: 'رسالة طوارئ', ic: 'bi-exclamation-octagon-fill' } : PP.TYPES[t], ok = t === 'alert' ? isAdmin() : allowed.includes(t);
        return `<div class="pp-ex card"><div class="card-body"><h6 class="fw-bold"><i class="bi ${T.ic} text-maroon"></i> ${T.t}${['urgent', 'alert'].includes(t) ? ' <span class="badge text-bg-dark">للمسؤول</span>' : ''}</h6>
          <p class="small text-muted">${SAMPLE[t].use}</p>
          ${PP.mock({ title: label(scr), p: Object.assign(sample(t), { type: t, status: 'live', ownerName: S.a.name }), img: t === 'poster' ? POSTER : '', now: U.amman() })}
          ${ok ? `<button class="btn btn-sm btn-outline-dark mt-2" data-ex="${t}"><i class="bi bi-pencil-square"></i> استعمل هذا المثال</button>` : ''}</div></div>`; }).join('')}</div>`;
    body().querySelectorAll('[data-ex]').forEach(b => b.onclick = () => {
      if (b.dataset.ex === 'alert') { tab = 'alert'; render(); const f = $('#pp-af'); if (f) { f.title.value = SAMPLE.alert.title; f.text.value = SAMPLE.alert.text; f.oninput(); } return; }
      edit = null; img = null; draft = Object.assign(blank(b.dataset.ex), sample(b.dataset.ex));
      if (draft.type === 'poster' && DEMO) img = { b64: POSTER.split(',')[1], url: POSTER, info: 'صورة المثال (يمكنك اختيار صورة أخرى)' };
      if (draft.type === 'poster' && !DEMO) delete draft.image;
      tab = 'new'; render(); });
  }

  // ---------------------------------------------------------------- compose (new / edit) with live preview
  function blank(type) {
    const t = today(), a = S.a, scr = ALL().filter(k => may(a, k));
    return { type, title: '', text: '', icon: type === 'event' ? 'bi-calendar-event' : 'bi-megaphone', tone: 'maroon', link: '', place: '', at: addDays(t, 3) + 'T10:00',
      screens: scr.length === 1 ? scr : [], start: t, end: addDays(t, Math.min(6, (a.maxDays || 30) - 1)), days: [], from: '', to: '', pin: false, ownerName: a.name,
      ...(DEMO ? sample(type) : {}) };
  }
  function compose() {
    const types = typesOf(S.a);
    if (!types.length) { body().innerHTML = '<div class="alert alert-warning">لا أنواع إعلانات مسموحة لحسابك. تواصل مع مسؤول الموقع.</div>'; return; }
    if (!draft) draft = blank(types[0]);
    const d = draft, scr = ALL().filter(k => may(S.a, k)), t = d.type, maxD = isAdmin() ? 365 : (S.a.maxDays || 30);
    const groups = [['المجموعات', scr.filter(k => k === '*' || k.startsWith('g:'))], ['شاشات المباني', scr.filter(k => BLDS.includes(k) || k === 'others')],
      ['شاشات الخدمات', scr.filter(k => PP.SERVICES.includes(k) || k === 'exams')]].filter(g => g[1].length);
    body().innerHTML = `<div class="row g-3"><div class="col-lg-6"><form id="pp-form" class="card"><div class="card-body d-grid gap-3">
      ${edit ? `<div class="alert alert-info py-2 mb-0"><i class="bi bi-pencil"></i> تعدّل إعلاناً قائماً${isAdmin() || S.a.trusted ? '' : '؛ سيعود إلى «بانتظار الموافقة» بعد الحفظ'}. <a href="#" id="pp-cancel">إلغاء التعديل</a></div>` : ''}
      <div><label class="form-label fw-bold small">النوع</label><div class="pp-types">${types.map(k => `<label class="${t === k ? 'on' : ''}"><input type="radio" name="type" value="${k}" ${t === k ? 'checked' : ''} ${edit ? 'disabled' : ''}>
        <i class="bi ${PP.TYPES[k].ic}"></i><b>${PP.TYPES[k].t}</b><small>${PP.TYPES[k].d}</small></label>`).join('')}</div></div>
      ${t !== 'ticker' ? `<div><label class="form-label fw-bold small">العنوان ${t === 'poster' ? '<span class="text-muted fw-normal">(اختياري، يظهر أسفل الصورة)</span>' : ''}</label><input name="title" class="form-control" maxlength="90" value="${esc(d.title)}"></div>` : ''}
      <div><label class="form-label fw-bold small">${t === 'ticker' ? 'نص الخبر (سطر واحد)' : 'النص'} <span class="text-muted fw-normal" id="pp-cnt"></span></label>
        ${['notice', 'event'].includes(t) ? `<textarea name="text" class="form-control" rows="3" maxlength="300">${esc(d.text)}</textarea>` : `<input name="text" class="form-control" maxlength="${t === 'ticker' ? 160 : t === 'urgent' ? 200 : 160}" value="${esc(d.text)}">`}</div>
      ${t === 'event' ? `<div class="row g-2"><div class="col-sm-6"><label class="form-label fw-bold small">موعد الفعالية</label><input name="at" type="datetime-local" class="form-control" value="${esc(d.at)}"></div>
        <div class="col-sm-6"><label class="form-label fw-bold small">المكان</label><input name="place" class="form-control" maxlength="80" value="${esc(d.place)}"></div></div>` : ''}
      ${t === 'poster' ? `<div><label class="form-label fw-bold small">الصورة</label><input name="image" type="file" accept="image/*" class="form-control">
        <div class="small text-muted mt-1" id="pp-imginfo">${img ? esc(img.info) : edit && d.image ? 'الصورة الحالية محفوظة؛ اختر صورة أخرى لاستبدالها.' : 'أي صورة (JPG / PNG / WebP)؛ تُصغَّر وتُضغط على جهازك تلقائياً. الأفضل بنسبة 16:9 (عرضية).'}</div></div>` : ''}
      ${['notice', 'event', 'poster'].includes(t) ? `<div class="row g-2"><div class="col-sm-8"><label class="form-label fw-bold small">رابط (يظهر رمز QR) <span class="text-muted fw-normal">اختياري</span></label><input name="link" class="form-control" dir="ltr" placeholder="https://" value="${esc(d.link)}"></div>
        <div class="col-sm-4"><label class="form-label fw-bold small">اللون</label><div class="pp-tones">${Object.entries(PP.TONES).map(([k, [c, n]]) => `<label title="${n}" style="--c:${c}" class="${d.tone === k ? 'on' : ''}"><input type="radio" name="tone" value="${k}" ${d.tone === k ? 'checked' : ''}></label>`).join('')}</div></div></div>` : ''}
      ${['notice', 'event'].includes(t) ? `<div><label class="form-label fw-bold small">الأيقونة</label><div class="pp-icons">${PP.ICONS.map(i => `<label class="${d.icon === i ? 'on' : ''}"><input type="radio" name="icon" value="${i}" ${d.icon === i ? 'checked' : ''}><i class="bi ${i}"></i></label>`).join('')}</div></div>` : ''}
      <div><label class="form-label fw-bold small">أين يظهر؟</label>${groups.map(([g, L]) => `<div class="pp-scr"><small>${g}</small>${L.map(k => `<label class="${d.screens.includes(k) ? 'on' : ''}"><input type="checkbox" name="screens" value="${esc(k)}" ${d.screens.includes(k) ? 'checked' : ''}> ${esc(label(k))}</label>`).join('')}</div>`).join('')}</div>
      <div class="row g-2"><div class="col-6"><label class="form-label fw-bold small">من تاريخ</label><input name="start" type="date" class="form-control" value="${d.start}" min="${edit ? '' : today()}"></div>
        <div class="col-6"><label class="form-label fw-bold small">حتى تاريخ <span class="text-muted fw-normal">(${maxD} يوماً على الأكثر)</span></label><input name="end" type="date" class="form-control" value="${d.end}" min="${today()}"></div></div>
      <details ${d.days.length || d.from || d.to ? 'open' : ''}><summary class="small fw-bold">أيام وساعات محددة (اختياري)</summary>
        <div class="pp-days mt-2">${PP.DAYL.map(x => `<label class="${d.days.includes(x) ? 'on' : ''}"><input type="checkbox" name="days" value="${x}" ${d.days.includes(x) ? 'checked' : ''}> ${esc(U.DAYS[x] || x)}</label>`).join('')}</div>
        <div class="row g-2 mt-1"><div class="col-6"><label class="form-label small">من الساعة</label><input name="from" type="time" class="form-control" value="${d.from}"></div>
          <div class="col-6"><label class="form-label small">حتى الساعة</label><input name="to" type="time" class="form-control" value="${d.to}"></div></div></details>
      ${isAdmin() ? `<label class="form-check"><input class="form-check-input" type="checkbox" name="pin" ${d.pin ? 'checked' : ''}> <span class="form-check-label small">مثبّت (يُعرض أولاً)</span></label>` : ''}
      <div id="pp-msg"></div>
      <button class="btn btn-maroon btn-lg"><i class="bi bi-send"></i> ${isAdmin() || S.a.trusted ? 'نشر على الشاشات' : 'إرسال للموافقة'}</button>
      </div></form></div>
      <div class="col-lg-6"><div class="pp-sticky"><div class="d-flex justify-content-between align-items-baseline"><b class="small"><i class="bi bi-eye"></i> معاينة كما ستظهر على الشاشة</b><small class="text-muted">${t === 'ticker' || t === 'urgent' ? 'يبقى طوال المدة' : 'يظهر دورياً لـ 15 ثانية ثم تعود الشاشة كما هي'}</small></div>
        <div id="pp-prev" class="mt-2"></div>
        ${DEMO ? `<a class="btn btn-sm btn-outline-dark mt-2" target="_blank" href="screen.html?b=${encodeURIComponent(DS)}&demo=1"><i class="bi bi-display"></i> افتح الشاشة التجريبية كاملة</a>` : ''}
        <p class="small text-muted mt-2 mb-0"><i class="bi bi-info-circle"></i> النصوص تُعرض كما هي (دون تنسيق أو روابط قابلة للنقر). الشاشات التي ضبطها المسؤول على «كما هي» لا تعرض أي إعلان.</p></div></div></div>`;
    form = $('#pp-form');
    const read = () => {
      const f = form, v = n => f[n] ? f[n].value : d[n];
      Object.assign(d, { title: v('title') || '', text: v('text') || '', at: v('at'), place: v('place') || '', link: (v('link') || '').trim(), start: v('start'), end: v('end'), from: v('from'), to: v('to'),
        tone: (f.querySelector('[name=tone]:checked') || {}).value || d.tone, icon: (f.querySelector('[name=icon]:checked') || {}).value || d.icon,
        screens: [...f.querySelectorAll('[name=screens]:checked')].map(x => x.value), days: [...f.querySelectorAll('[name=days]:checked')].map(x => x.value), pin: !!(f.pin && f.pin.checked) });
      f.querySelectorAll('.pp-tones label, .pp-icons label, .pp-scr label, .pp-days label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
      const n = (d.text || '').length, mx = f.text && f.text.maxLength; $('#pp-cnt').textContent = mx ? `${n}/${mx}` : '';
      preview();
    };
    form.addEventListener('input', read);
    form.addEventListener('change', e => {
      if (e.target.name === 'type') { const nt = blank(e.target.value); draft = DEMO ? Object.assign(nt, { screens: d.screens, start: d.start, end: d.end }) : Object.assign(nt, { title: d.title, text: d.text, screens: d.screens, start: d.start, end: d.end });
        img = DEMO && nt.type === 'poster' ? { b64: POSTER.split(',')[1], url: POSTER, info: 'صورة المثال (يمكنك اختيار صورة أخرى)' } : null; compose(); return; }
      if (e.target.name === 'image' && e.target.files[0]) shrink(e.target.files[0]);
      read();
    });
    if ($('#pp-cancel')) $('#pp-cancel').onclick = e => { e.preventDefault(); edit = null; draft = null; img = null; tab = 'mine'; render(); };
    form.onsubmit = submit;
    read();
  }
  function preview() {
    const d = draft, k = d.screens.find(x => !x.startsWith('g:') && x !== '*') || BLDS[0];
    $('#pp-prev').innerHTML = PP.mock({ title: label(k), p: Object.assign({}, d, { status: 'live' }), img: img ? img.url : (d.image || ''), now: U.amman() });
  }
  // the image is made small on this device: at most 1920x1080 and about 45 KB (WebP; JPEG where WebP cannot be made)
  async function shrink(file) {
    const info = $('#pp-imginfo');
    info.innerHTML = '<span class="spinner-border spinner-border-sm"></span> تجهيز الصورة…';
    try {
      const bmp = await createImageBitmap(file);
      // sharper at a smaller size beats blurry at a big one: try in this order, keep the first that fits
      let best = null;
      const cvs = {}, at = w => { if (cvs[w]) return cvs[w];
        const s = Math.min(1, w / bmp.width, (w * 9 / 16) / bmp.height), cv = document.createElement('canvas');
        cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); return (cvs[w] = cv); };
      for (const [w, q] of [[1920, .8], [1600, .8], [1280, .82], [1600, .65], [1280, .7], [1024, .78], [1280, .55], [1024, .6], [800, .7], [1024, .45], [800, .5], [640, .55]]) {
        const cv = at(w);
        let b = await new Promise(r => cv.toBlob(r, 'image/webp', q));
        if (!b || b.type !== 'image/webp') b = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
        if (b && b.size <= MAXIMG) { best = { b, w: cv.width, h: cv.height, q }; break; }
      }
      if (!best) throw new Error('big');
      const buf = new Uint8Array(await best.b.arrayBuffer());
      if (img && img.url) URL.revokeObjectURL(img.url);
      img = { b64: b64(buf), url: URL.createObjectURL(best.b), info: `جاهزة: ${best.w}×${best.h} · ${Math.round(buf.length / 1024)} ك.ب${best.w < 1024 ? ' · صورة مزدحمة بالتفاصيل فخُفّضت جودتها؛ الأوضح تصميم بخطوط كبيرة وألوان واضحة' : ''}` };
      info.textContent = img.info;
      preview();
    } catch (e) { img = null; info.innerHTML = '<span class="text-danger">تعذّر تجهيز هذه الصورة. جرّب صورة أخرى (JPG أو PNG).</span>'; }
  }
  async function submit(e) {
    e.preventDefault();
    const d = draft, btn = form.querySelector('button.btn-maroon');
    const bad = d.type === 'ticker' && !d.text.trim() ? 'اكتب نص الخبر' : ['notice', 'event', 'urgent'].includes(d.type) && !d.title.trim() ? 'اكتب العنوان'
      : d.type === 'poster' && !img && !(edit && d.image) ? 'اختر صورة' : !d.screens.length ? 'اختر شاشة واحدة على الأقل' : !d.start || !d.end || d.end < d.start ? 'تحقق من التاريخين'
      : d.link && !PP.safeLink(d.link) ? 'الرابط يجب أن يبدأ بـ https://' : d.type === 'event' && !d.at ? 'حدّد موعد الفعالية' : '';
    if (bad) return say(bad);
    const out = { id: edit || undefined, type: d.type, title: d.title, text: d.text, icon: d.icon, tone: d.tone, link: d.link, place: d.place, at: d.at, screens: d.screens,
      start: d.start, end: d.end, days: d.days, from: d.from, to: d.to, pin: d.pin };
    if (d.type === 'poster' && img) out.image = img.b64;
    await act(btn, 'submit', out, (edit ? 'تعديل: ' : '') + (d.title || d.text).slice(0, 40), () => { draft = null; img = null; edit = null; tab = 'mine'; render(); });
  }

  // ---------------------------------------------------------------- lists
  function row(p, mode) {
    const [k, st, ic] = state(p), own = p.owner === S.u, A = isAdmin();
    const btns = [];
    if (mode === 'queue') btns.push(`<input class="form-control form-control-sm pp-note" placeholder="ملاحظة / سبب الرفض (اختياري)">`, `<button class="btn btn-sm btn-success" data-do="ok"><i class="bi bi-check-lg"></i> موافقة</button>`,
      `<button class="btn btn-sm btn-outline-danger" data-do="no"><i class="bi bi-x-lg"></i> رفض</button>`);
    if ((own || A) && mode !== 'queue' && k !== 'ended') btns.push(`<button class="btn btn-sm btn-outline-secondary" data-do="edit"><i class="bi bi-pencil"></i> تعديل</button>`);
    if (k === 'live' || k === 'soon') btns.push(`<button class="btn btn-sm btn-outline-warning" data-do="stop"><i class="bi bi-pause-fill"></i> إيقاف فوري</button>`);
    if (A && k === 'stopped') btns.push(`<button class="btn btn-sm btn-outline-success" data-do="resume"><i class="bi bi-play-fill"></i> استئناف</button>`);
    if (A && mode !== 'queue') btns.push(`<button class="btn btn-sm btn-outline-secondary" data-do="pin">${p.pin ? '<i class="bi bi-pin-angle-fill"></i> إلغاء التثبيت' : '<i class="bi bi-pin-angle"></i> تثبيت'}</button>`);
    if (own && !A) btns.push(`<button class="btn btn-sm btn-outline-danger" data-do="withdraw"><i class="bi bi-trash"></i> سحب</button>`);
    if (A && mode !== 'queue') btns.push(`<button class="btn btn-sm btn-outline-danger" data-do="delete"><i class="bi bi-trash"></i> حذف</button>`);
    const T = PP.TYPES[p.type] || { t: p.type, ic: 'bi-megaphone' };
    return `<div class="pp-item ${k}" data-id="${esc(p.id)}"><div class="pp-ii"><i class="bi ${T.ic}"></i><small>${T.t}</small></div>
      <div class="pp-ib"><b>${p.pin ? '<i class="bi bi-pin-angle-fill text-maroon"></i> ' : ''}${esc(p.title || p.text)}</b>
        ${p.title && p.text ? `<div class="small text-muted pp-clip">${esc(p.text)}</div>` : ''}
        <div class="small"><span class="pp-st ${k}"><i class="bi ${ic}"></i> ${st}</span> · ${esc(p.ownerName || p.owner)} · ${U.numDate(p.start)} – ${U.numDate(p.end)}${p.days && p.days.length ? ' · ' + p.days.map(x => U.DAYS[x] || x).join('، ') : ''}${p.from || p.to ? ` · <bdi dir="ltr">${esc(p.from || '…')}–${esc(p.to || '…')}</bdi>` : ''}</div>
        <div class="small text-muted"><i class="bi bi-display"></i> ${p.screens.map(label).map(esc).join('، ')}</div>
        ${p.review && p.review.note ? `<div class="small ${p.review.ok ? 'text-success' : 'text-danger'}"><i class="bi bi-chat-left-text"></i> ${esc(p.review.note)}</div>` : ''}
        <div class="pp-acts">${btns.join('')}<button class="btn btn-sm btn-link" data-do="prev"><i class="bi bi-eye"></i> معاينة</button></div><div class="pp-iprev"></div></div></div>`;
  }
  function list(mode) {
    const P = DATA.posts || [], f = list.f || 'active';
    let L = mode === 'mine' ? P.filter(p => p.owner === S.u) : mode === 'queue' ? P.filter(p => p.status === 'pending') : P;
    if (mode === 'all' && f !== 'every') L = L.filter(p => f === 'active' ? ['live', 'soon', 'pending'].includes(state(p)[0]) : state(p)[0] === f);
    body().innerHTML = `${mode === 'all' ? `<div class="d-flex gap-2 mb-2 align-items-center"><small>عرض:</small><select class="form-select form-select-sm w-auto" id="pp-f">${[['active', 'الحالية والمجدولة'], ['live', 'معروض الآن'], ['pending', 'بانتظار الموافقة'],
      ['stopped', 'موقوف'], ['rejected', 'مرفوض'], ['ended', 'منتهي'], ['every', 'الكل']].map(([k, t]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
      ${mode === 'queue' && L.length > 1 ? `<div class="mb-2"><button class="btn btn-sm btn-success" id="pp-okall"><i class="bi bi-check-all"></i> الموافقة على الكل (${L.length})</button></div>` : ''}
      <div id="pp-msg"></div>${L.map(p => row(p, mode)).join('') || `<div class="text-muted text-center p-4"><i class="bi bi-inbox fs-2 d-block"></i>${mode === 'queue' ? 'لا إعلانات تنتظر الموافقة' : 'لا إعلانات'}</div>`}
      ${mode === 'mine' ? '<p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> الإعلانات المنتهية والمرفوضة تُحذف تلقائياً بعد 14 يوماً.</p>' : ''}`;
    if ($('#pp-f')) $('#pp-f').onchange = e => { list.f = e.target.value; list(mode); };
    if ($('#pp-okall')) $('#pp-okall').onclick = e => act(e.currentTarget, 'review', { ids: L.map(p => p.id), ok: true, note: '' }, `الموافقة على ${L.length} إعلانات`);
    body().querySelectorAll('[data-do]').forEach(b => b.onclick = e => {
      const it = b.closest('.pp-item'), p = P.find(x => x.id === it.dataset.id), x = b.dataset.do, note = (it.querySelector('.pp-note') || {}).value || '';
      const nm = '«' + (p.title || p.text).slice(0, 30) + '»';
      if (x === 'prev') { const pv = it.querySelector('.pp-iprev'); pv.innerHTML = pv.innerHTML ? '' : PP.mock({ title: label(p.screens.find(k => !k.startsWith('g:') && k !== '*') || BLDS[0]), p: Object.assign({}, p, { status: 'live' }), img: p.image, now: U.amman() }); return; }
      if (x === 'edit') { edit = p.id; draft = JSON.parse(JSON.stringify(Object.assign(blank(p.type), p))); img = null; tab = 'new'; render(); return; }
      if ((x === 'delete' || x === 'withdraw') && !b.dataset.sure) { b.dataset.sure = 1; b.innerHTML = '<i class="bi bi-exclamation-triangle"></i> تأكيد؟'; return; }
      const map = { ok: ['review', { ids: [p.id], ok: true, note }, 'موافقة على ' + nm], no: ['review', { ids: [p.id], ok: false, note }, 'رفض ' + nm], stop: ['stop', { id: p.id }, 'إيقاف ' + nm],
        resume: ['resume', { id: p.id }, 'استئناف ' + nm], pin: ['pin', { id: p.id, on: !p.pin }, (p.pin ? 'إلغاء تثبيت ' : 'تثبيت ') + nm], withdraw: ['withdraw', { id: p.id }, 'سحب ' + nm], delete: ['delete', { id: p.id }, 'حذف ' + nm] }[x];
      act(b, ...map);
    });
  }

  // ---------------------------------------------------------------- what each screen shows now
  function screensNow() {
    const n = U.amman(), P = DATA.posts || [], SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    const rows = CONCRETE().filter(k => isAdmin() || may(S.a, k)).map(k => {
      const s = PP.settingsFor(DATA, k), L = P.filter(p => PP.matches(p, k, n)), c = t => L.filter(p => p.type === t).length;
      const al = DATA.alert && DATA.alert.title && (DATA.alert.screens || ['*']).some(t => PP.inTarget(t, k));
      return `<tr><td><b>${esc(label(k))}</b></td><td>${s.mode === 'off' ? '<span class="badge text-bg-secondary">كما هي (بلا إعلانات)</span>' : '<span class="badge text-bg-success">تعرض الإعلانات</span>'}${al ? ' <span class="badge text-bg-danger">طوارئ</span>' : ''}</td>
        <td>${c('ticker')}</td><td>${c('notice') + c('event') + c('poster')}</td><td>${c('urgent')}</td>
        <td class="text-nowrap"><a class="btn btn-sm btn-outline-secondary" target="_blank" href="${SITE}screen.html?b=${encodeURIComponent(k)}${DEMO ? '&demo=1' : ''}"><i class="bi bi-box-arrow-up-left"></i> افتح</a>
          <button class="btn btn-sm btn-outline-secondary" data-np="${esc(SITE + 'screen.html?b=' + encodeURIComponent(k) + '&posts=off')}"><i class="bi bi-link-45deg"></i> رابط بلا إعلانات</button></td></tr>`;
    }).join('');
    body().innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>الشاشة</th><th>الحالة</th><th>أخبار</th><th>إعلانات وفعاليات وبوسترات</th><th>عاجل</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small text-muted"><i class="bi bi-info-circle"></i> ما يُعرض في هذه اللحظة. «رابط بلا إعلانات» لجهاز عرض يجب أن يبقى كما هو تماماً دون أي إعلان (ولا حتى الطوارئ): انسخه وافتحه على ذلك الجهاز.</p>`;
    body().querySelectorAll('[data-np]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.np).then(() => { b.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; }));
  }

  // ---------------------------------------------------------------- screen settings (admin)
  function settings() {
    const st = DATA.settings || { default: {}, screens: {} }, df = Object.assign({}, PP.DEF, st.default || {});
    const line = (k, s, isDef) => `<tr data-k="${esc(k)}"><td><b>${isDef ? 'الافتراضي لكل الشاشات' : esc(label(k))}</b></td>
      <td><select class="form-select form-select-sm" name="mode">${isDef ? '' : `<option value="">كالافتراضي</option>`}<option value="on" ${s.mode === 'on' ? 'selected' : ''}>تعرض الإعلانات</option><option value="off" ${s.mode === 'off' ? 'selected' : ''}>كما هي (بلا إعلانات)</option></select></td>
      <td><input class="form-control form-control-sm" name="every" type="number" min="1" max="30" value="${s.every || ''}" placeholder="${isDef ? '' : df.every}"></td>
      <td><input class="form-control form-control-sm" name="secs" type="number" min="5" max="60" value="${s.secs || ''}" placeholder="${isDef ? '' : df.secs}"></td>
      <td>${k === 'exams' || PP.SERVICES.includes(k) ? '' : `<select class="form-select form-select-sm" name="exams">${isDef ? '' : '<option value="">كالافتراضي</option>'}<option value="0" ${s.exams === false ? 'selected' : ''}>لا تعرض</option><option value="1" ${s.exams === true ? 'selected' : ''}>تعرض</option></select>`}</td>
      <td><select class="form-select form-select-sm" name="map">${isDef ? '' : '<option value="">كالافتراضي</option>'}<option value="0" ${s.map === false || (isDef && !s.map) ? 'selected' : ''}>لا</option><option value="1" ${s.map === true ? 'selected' : ''}>نعم</option></select></td></tr>`;
    body().innerHTML = `<p class="small text-muted"><i class="bi bi-info-circle"></i> «كما هي» تعني أن الشاشة تبقى تماماً كما كانت قبل الإعلانات (تظهر رسالة الطوارئ فقط). «كل كم دقيقة» و«مدة الظهور» للإعلانات والفعاليات والبوسترات؛ شريط الأخبار والتنبيه العاجل دائمان. «خريطة الحرم» تضيف شريحة «أنت هنا» تُظهر مكان المبنى على مخطط الجامعة مع رمز QR للخريطة الحيّة.</p>
      <div class="table-responsive"><table class="table table-sm align-middle pp-set"><thead><tr><th>الشاشة</th><th>الإعلانات</th><th>كل كم دقيقة</th><th>مدة الظهور (ثانية)</th><th>أيام الامتحانات</th><th>خريطة الحرم <small class="fw-normal">(أنت هنا + QR)</small></th></tr></thead>
      <tbody>${line('default', df, true)}${CONCRETE().map(k => line(k, (st.screens || {})[k] || {}, false)).join('')}</tbody></table></div>
      <div id="pp-msg"></div><button class="btn btn-maroon" id="pp-save"><i class="bi bi-save"></i> حفظ الإعدادات</button>`;
    $('#pp-save').onclick = e => {
      const get = tr => { const o = {}, v = n => tr.querySelector(`[name=${n}]`); if (v('mode').value) o.mode = v('mode').value; if (v('every').value) o.every = +v('every').value;
        if (v('secs').value) o.secs = +v('secs').value; if (v('exams') && v('exams').value) o.exams = v('exams').value === '1'; if (v('map') && v('map').value) o.map = v('map').value === '1'; return o; };
      const trs = [...body().querySelectorAll('tr[data-k]')], screens = {};
      trs.slice(1).forEach(tr => { const o = get(tr); if (Object.keys(o).length) screens[tr.dataset.k] = o; });
      act(e.currentTarget, 'settings', { default: get(trs[0]), screens }, 'إعدادات الشاشات');
    };
  }

  // ---------------------------------------------------------------- emergency message (admin)
  function alertTab() {
    const a = DATA.alert;
    body().innerHTML = `${a && a.title ? `<div class="alert alert-danger"><b><i class="bi bi-exclamation-octagon-fill"></i> رسالة طوارئ معروضة الآن:</b> ${esc(a.title)}<div class="small">${esc(a.text || '')}${a.evac ? ' · مع خريطة الإخلاء' : ''}</div>
        <div class="small">على: ${(a.screens || ['*']).map(label).map(esc).join('، ')} · حتى ${esc(new Date(a.until).toLocaleString('ar-JO', { timeZone: 'Asia/Amman' }))}</div>
        <button class="btn btn-light btn-sm mt-2" id="pp-aoff"><i class="bi bi-x-circle"></i> إلغاء رسالة الطوارئ</button></div>` : ''}
      <div class="row g-3"><div class="col-lg-6"><form id="pp-af" class="card"><div class="card-body d-grid gap-2">
        <p class="small text-muted mb-0">تغطي وسط الشاشة بالكامل على الشاشات المختارة — حتى الشاشات المضبوطة على «كما هي» — حتى تلغيها أو تنتهي مدتها. للطوارئ فقط.</p>
        <input name="title" class="form-control" maxlength="80" placeholder="العنوان (مثال: إخلاء المبنى)" required>
        <textarea name="text" class="form-control" rows="3" maxlength="300" placeholder="التعليمات"></textarea>
        <div class="pp-scr"><label class="on"><input type="checkbox" name="screens" value="*" checked> كل الشاشات</label>${CONCRETE().map(k => `<label><input type="checkbox" name="screens" value="${esc(k)}"> ${esc(label(k))}</label>`).join('')}</div>
        <label class="small d-flex gap-2 align-items-start"><input type="checkbox" name="evac" checked class="mt-1"> <span>أظهر معها <b>خريطة الإخلاء</b>: موقع كل مبنى وأقرب نقطة تجمع إليه (من «خريطة الحرم»)</span></label>
        <label class="small">تنتهي تلقائياً بعد <input name="hours" type="number" min="1" max="72" value="6" class="form-control form-control-sm d-inline-block" style="width:5em"> ساعات</label>
        <div id="pp-msg"></div><button class="btn btn-danger"><i class="bi bi-broadcast"></i> اعرضها الآن</button></div></form></div>
        <div class="col-lg-6" id="pp-aprev"></div></div>`;
    const f = $('#pp-af'), pv = () => { $('#pp-aprev').innerHTML = PP.mock({ title: 'شاشة المبنى', p: { type: 'alert', title: f.title.value || 'العنوان', text: f.text.value }, now: U.amman() }); };
    f.oninput = pv; pv();
    f.onchange = e => { if (e.target.name === 'screens') { if (e.target.value === '*' && e.target.checked) f.querySelectorAll('[name=screens]').forEach(x => { x.checked = x.value === '*'; });
      else if (e.target.checked) f.querySelector('[name=screens][value="*"]').checked = false; f.querySelectorAll('.pp-scr label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); } };
    f.onsubmit = e => { e.preventDefault(); const scr = [...f.querySelectorAll('[name=screens]:checked')].map(x => x.value);
      if (!scr.length) return say('اختر الشاشات');
      act(f.querySelector('button'), 'alert', { on: true, title: f.title.value, text: f.text.value, screens: scr, hours: +f.hours.value, evac: f.evac.checked }, 'رسالة طوارئ'); };
    if ($('#pp-aoff')) $('#pp-aoff').onclick = e => act(e.currentTarget, 'alert', { on: false }, 'إلغاء رسالة الطوارئ');
  }

  // ---------------------------------------------------------------- accounts (admin)
  function accounts(open) {
    const U2 = ACC.users;
    body().innerHTML = `<div id="pp-msg"></div><div id="pp-cred"></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>المستخدم</th><th>الجهة</th><th>الشاشات</th><th>الأنواع</th><th>النشر</th><th>الحد</th><th></th></tr></thead><tbody>
      ${Object.entries(U2).sort((a, b) => (a[1].role === 'admin' ? 0 : 1) - (b[1].role === 'admin' ? 0 : 1) || a[0].localeCompare(b[0])).map(([u, a]) => `<tr class="${a.active === false ? 'text-muted' : ''}" data-u="${esc(u)}">
        <td dir="ltr" class="text-end"><b>${esc(u)}</b></td><td>${esc(a.name)} ${a.role === 'admin' ? '<span class="badge text-bg-dark">مسؤول</span>' : ''}${a.active === false ? ' <span class="badge text-bg-secondary">موقوف</span>' : ''}</td>
        <td class="small">${(a.screens || []).map(label).map(esc).join('، ')}</td><td class="small">${a.role === 'admin' ? 'الكل' : (a.types || []).map(t => PP.TYPES[t].t).join('، ')}</td>
        <td class="small">${a.role === 'admin' || a.trusted ? 'مباشر' : 'بموافقة'}</td><td class="small">${a.role === 'admin' ? '—' : `${a.max || 6} إعلانات · ${a.maxDays || 30} يوماً`}</td>
        <td class="text-nowrap">${u === S.u ? '<small class="text-muted">أنت</small>' : `<button class="btn btn-sm btn-outline-secondary" data-a="edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-secondary" data-a="reset" title="كلمة مرور جديدة"><i class="bi bi-key"></i></button>
          <button class="btn btn-sm btn-outline-${a.active === false ? 'success' : 'warning'}" data-a="toggle" title="${a.active === false ? 'تفعيل' : 'إيقاف'}"><i class="bi bi-${a.active === false ? 'play' : 'pause'}-fill"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-a="remove" title="حذف"><i class="bi bi-trash"></i></button>`}</td></tr>`).join('')}</tbody></table></div>
      <button class="btn btn-maroon mb-3" id="pp-add"><i class="bi bi-person-plus"></i> إضافة حساب كلية أو دائرة</button><div id="pp-accf"></div>`;
    $('#pp-add').onclick = () => accForm(null);
    if (open !== undefined) accForm(open);
    body().querySelectorAll('[data-a]').forEach(b => b.onclick = async e => {
      const u = b.closest('tr').dataset.u, a = U2[u], x = b.dataset.a;
      if (x === 'edit') return accForm(u);
      if (x === 'remove' && !b.dataset.sure) { b.dataset.sure = 1; b.innerHTML = 'تأكيد؟'; return; }
      if (x === 'reset') return saveAcc(b, u, a, true);
      act(b, 'account', x === 'remove' ? { user: u, remove: true } : Object.assign(pick(a), { user: u, active: a.active === false }), (x === 'remove' ? 'حذف ' : a.active === false ? 'تفعيل ' : 'إيقاف ') + u);
    });
  }
  const pick = a => ({ name: a.name, role: a.role, screens: a.screens || [], types: a.types || [], trusted: !!a.trusted, max: a.max || 6, maxDays: a.maxDays || 30, active: a.active !== false });
  function accForm(u) {
    const a = u ? ACC.users[u] : { name: '', role: 'unit', screens: [], types: ['ticker', 'notice', 'event', 'poster'], trusted: false, max: 6, maxDays: 30 };
    $('#pp-accf').innerHTML = `<form class="card" id="pp-af2"><div class="card-body d-grid gap-2"><h6 class="fw-bold mb-0">${u ? 'تعديل صلاحيات ' + esc(u) : 'حساب جديد'}</h6>
      <div class="row g-2"><div class="col-sm-4"><label class="form-label small">اسم المستخدم (إنجليزي)</label><input name="u" class="form-control" dir="ltr" value="${esc(u || '')}" ${u ? 'disabled' : ''} placeholder="engineering" required></div>
        <div class="col-sm-5"><label class="form-label small">اسم الجهة (يظهر على الإعلان)</label><input name="name" class="form-control" value="${esc(a.name)}" placeholder="كلية الهندسة" required></div>
        <div class="col-sm-3"><label class="form-label small">الدور</label><select name="role" class="form-select"><option value="unit">كلية / دائرة</option><option value="admin" ${a.role === 'admin' ? 'selected' : ''}>مسؤول (كل الصلاحيات)</option></select></div></div>
      <div><label class="form-label small fw-bold">الشاشات المسموحة</label><div class="pp-scr">${ALL().map(k => `<label class="${(a.screens || []).includes(k) ? 'on' : ''}"><input type="checkbox" name="screens" value="${esc(k)}" ${(a.screens || []).includes(k) ? 'checked' : ''}> ${esc(label(k))}</label>`).join('')}</div></div>
      <div><label class="form-label small fw-bold">الأنواع المسموحة</label><div class="pp-scr">${['ticker', 'notice', 'event', 'poster'].map(t => `<label class="${(a.types || []).includes(t) ? 'on' : ''}"><input type="checkbox" name="types" value="${t}" ${(a.types || []).includes(t) ? 'checked' : ''}> ${PP.TYPES[t].t}</label>`).join('')}</div></div>
      <div class="row g-2 align-items-end"><div class="col-sm-4"><label class="form-check"><input type="checkbox" class="form-check-input" name="trusted" ${a.trusted ? 'checked' : ''}> <span class="small">نشر مباشر دون موافقة (جهة موثوقة)</span></label></div>
        <div class="col-sm-4"><label class="form-label small">أقصى عدد إعلانات نشطة</label><input name="max" type="number" min="1" max="30" class="form-control" value="${a.max || 6}"></div>
        <div class="col-sm-4"><label class="form-label small">أطول مدة لإعلان (أيام)</label><input name="maxDays" type="number" min="1" max="90" class="form-control" value="${a.maxDays || 30}"></div></div>
      <div id="pp-msg2"></div><div><button class="btn btn-maroon"><i class="bi bi-save"></i> ${u ? 'حفظ' : 'إنشاء الحساب وكلمة المرور'}</button> <button type="button" class="btn btn-link" id="pp-x">إلغاء</button></div></div></form>`;
    const f = $('#pp-af2');
    f.onchange = () => f.querySelectorAll('.pp-scr label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    $('#pp-x').onclick = () => { $('#pp-accf').innerHTML = ''; };
    f.onsubmit = e => {
      e.preventDefault();
      const nu = (u || f.u.value.trim().toLowerCase());
      if (!u && ACC.users[nu]) return void ($('#pp-msg2').innerHTML = '<div class="alert alert-danger py-2">اسم المستخدم موجود</div>');
      const v = { name: f.name.value.trim(), role: f.role.value, screens: [...f.querySelectorAll('[name=screens]:checked')].map(x => x.value), types: [...f.querySelectorAll('[name=types]:checked')].map(x => x.value),
        trusted: f.trusted.checked, max: +f.max.value, maxDays: +f.maxDays.value, active: u ? ACC.users[u].active !== false : true };
      if (v.role !== 'admin' && (!v.screens.length || !v.types.length)) return void ($('#pp-msg2').innerHTML = '<div class="alert alert-danger py-2">اختر شاشة ونوعاً واحداً على الأقل</div>');
      saveAcc(f.querySelector('.btn-maroon'), nu, v, !u);
    };
  }
  // a new account or a new password: the key pair and the box are made here; the password is shown once, to hand over
  async function saveAcc(btn, u, a, withKey) {
    busy(btn, true);
    try {
      const d = Object.assign(pick(a), { user: u });
      let pw = null;
      if (withKey) { pw = newPassword(); const id = await identity(u, pw, S.tk); d.pub = id.pub; d.box = id.box; }
      await send('account', d, (withKey ? (ACC.users[u] ? 'كلمة مرور جديدة لـ ' : 'إنشاء حساب ') : 'تعديل حساب ') + u);
      accounts();
      if (pw) {
        const site = location.origin + location.pathname, txt = `إعلانات الشاشات – جامعة البترا\nالرابط: ${site}\nاسم المستخدم: ${u}\nكلمة المرور: ${pw}`;
        $('#pp-cred').innerHTML = `<div class="alert alert-warning"><b><i class="bi bi-key-fill"></i> بيانات دخول ${esc(a.name)}</b> — تظهر مرة واحدة فقط؛ انسخها وسلّمها للجهة (يمكنها تغييرها لاحقاً):
          <pre class="pp-pre mt-2 mb-2" dir="ltr">${esc(txt)}</pre><button class="btn btn-sm btn-dark" id="pp-copy"><i class="bi bi-clipboard"></i> نسخ</button>
          <span class="small ms-2">يعمل الحساب بعد اكتمال التنفيذ (دقيقة تقريباً).</span></div>`;
        $('#pp-copy').onclick = e => navigator.clipboard.writeText(txt).then(() => { e.target.textContent = 'تم النسخ'; });
      }
    } catch (e) { busy(btn, false); say(errText(e)); }
  }

  // ---------------------------------------------------------------- log (admin)
  async function logTab() {
    body().innerHTML = '<div class="text-muted"><span class="spinner-border spinner-border-sm"></span> …</div>';
    if (!DEMO) LOGF = await noCache('data/screens/log.json').catch(() => null);
    const A = { init: 'إعداد', submit: 'نشر/تعديل', withdraw: 'سحب', review: 'مراجعة', stop: 'إيقاف', resume: 'استئناف', pin: 'تثبيت', delete: 'حذف', settings: 'إعدادات', alert: 'طوارئ', account: 'حساب', passwd: 'كلمة مرور', token: 'مفتاح النشر' };
    body().innerHTML = `<div class="table-responsive"><table class="table table-sm small align-middle"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>النتيجة</th></tr></thead><tbody>
      ${((LOGF && LOGF.log) || []).slice(0, 300).map(e => `<tr><td dir="ltr" class="text-end text-nowrap">${esc(new Date(e.at).toLocaleString('en-GB', { timeZone: 'Asia/Amman' }))}</td><td dir="ltr" class="text-end">${esc(e.u)}</td>
        <td>${esc(A[e.a] || e.a)}${e.id ? ` <small class="text-muted" dir="ltr">${esc(e.id)}</small>` : ''}</td><td class="${e.ok ? 'text-success' : 'text-danger'}">${e.ok ? '✓ ' + esc(e.note || '') : '✗ ' + esc(e.why || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">لا شيء بعد</td></tr>'}</tbody></table></div>
      <p class="small text-muted">السجل الكامل وكل تغيير محفوظ أيضاً في تاريخ المستودع على GitHub (لا يمكن حذفه من هذه الصفحة).</p>`;
  }

  // ---------------------------------------------------------------- my password; the publishing key (admin)
  function me() {
    if (DEMO) { body().innerHTML = '<div class="alert alert-info">تغيير كلمة المرور ومفتاح النشر غير متاحين في وضع التجربة؛ لا توجد كلمة مرور هنا أصلاً.</div>'; return; }
    body().innerHTML = `<div class="row g-3"><div class="col-lg-6"><form class="card" id="pp-pw"><div class="card-body d-grid gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-key"></i> تغيير كلمة المرور</h6>
        <div class="input-group"><input name="p" class="form-control" dir="ltr" minlength="12" required placeholder="كلمة المرور الجديدة (12 حرفاً على الأقل)" autocomplete="new-password"><button type="button" class="btn btn-outline-secondary" id="pp-gen">توليد</button></div>
        <input name="p2" class="form-control" dir="ltr" required placeholder="أعد كتابتها" autocomplete="new-password">
        <div id="pp-msg"></div><button class="btn btn-maroon">حفظ كلمة المرور</button></div></form></div>
      ${isAdmin() ? `<div class="col-lg-6"><form class="card" id="pp-tk"><div class="card-body d-grid gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-github"></i> مفتاح النشر</h6>
        <p class="small text-muted mb-0">آخر تجديد: ${ACC.tok && ACC.tok.at ? U.numDate(ACC.tok.at) : '—'}. صلاحيته سنة؛ جدّده قبل انتهائه (نفس خطوات الإعداد: هذا المستودع فقط، ثم Add permissions ← Actions: Read and write). التجديد هنا يكفي لكل الحسابات.</p>
        <input name="tok" class="form-control" dir="ltr" placeholder="github_pat_…" required><button class="btn btn-outline-dark">تجديد المفتاح</button></div></form></div>` : ''}</div>`;
    const f = $('#pp-pw');
    $('#pp-gen').onclick = () => { f.p.value = f.p2.value = newPassword(); };
    f.onsubmit = async e => {
      e.preventDefault();
      if (f.p.value !== f.p2.value) return say('كلمتا المرور غير متطابقتين');
      const btn = f.querySelector('.btn-maroon'); busy(btn, true);
      try { const box = await seal(S.u, f.p.value, { k: S.k, t: b64(S.tk) }); await send('passwd', { box }, 'تغيير كلمة المرور'); render(); } catch (e2) { busy(btn, false); say(errText(e2)); }
    };
    if ($('#pp-tk')) $('#pp-tk').onsubmit = async e => {
      e.preventDefault();
      const t = e.target.tok.value.trim(), btn = e.target.querySelector('button'); busy(btn, true);
      try { const tok = await enc(await aesRaw(S.tk), TE.encode(t)); await send('token', { tok }, 'تجديد مفتاح النشر', { tok: t }); S.tok = t; render(); } catch (e2) { busy(btn, false); say(errText(e2)); }
    };
  }

  // ---------------------------------------------------------------- style and start
  document.head.insertAdjacentHTML('beforeend', `<style>
    #pp-app { padding-bottom: 2rem; }
    .pp-login { max-width: 420px; margin: 1rem auto; } .pp-card0 { max-width: 760px; margin: 0 auto; }
    .pp-top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .pp-tabs { gap: .25rem; flex-wrap: wrap; } .pp-tabs .nav-link { padding: .35rem .7rem; font-size: .92rem; } .pp-tabs .nav-link.active { background: #901d23; }
    .pp-waitbar { background: #fff8e6; border: 1px solid #f5d38a; border-radius: 10px; padding: .45rem .75rem; margin-bottom: .6rem; font-size: .9rem; }
    .pp-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .5rem; }
    .pp-types label { border: 1.5px solid var(--bs-border-color); border-radius: 12px; padding: .5rem .6rem; cursor: pointer; display: grid; gap: .1rem; }
    .pp-types label.on { border-color: #901d23; background: #fbf0f0; } .pp-types input { display: none; } .pp-types i { font-size: 1.3rem; color: #901d23; }
    .pp-types small { color: var(--bs-secondary-color); font-size: .75rem; line-height: 1.3; }
    .pp-tones { display: flex; gap: .35rem; padding-top: .2rem; } .pp-tones label { width: 2rem; height: 2rem; border-radius: 50%; background: var(--c); cursor: pointer; box-shadow: 0 0 0 2px #fff, 0 0 0 3px transparent; }
    .pp-tones label.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--c); } .pp-tones input, .pp-icons input, .pp-scr input, .pp-days input { display: none; }
    .pp-icons { display: flex; flex-wrap: wrap; gap: .3rem; } .pp-icons label { width: 2.3rem; height: 2.3rem; display: grid; place-items: center; border: 1px solid var(--bs-border-color); border-radius: 8px; cursor: pointer; font-size: 1.1rem; }
    .pp-icons label.on { background: #901d23; color: #fff; border-color: #901d23; }
    .pp-scr, .pp-days { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; margin-bottom: .3rem; } .pp-scr small { width: 100%; color: var(--bs-secondary-color); }
    .pp-scr label, .pp-days label { border: 1px solid var(--bs-border-color); border-radius: 999px; padding: .2rem .7rem; cursor: pointer; font-size: .85rem; }
    .pp-scr label.on, .pp-days label.on { background: #901d23; color: #fff; border-color: #901d23; }
    .pp-sticky { position: sticky; top: 4.5rem; }
    .pp-item { display: flex; gap: .75rem; border: 1px solid var(--bs-border-color); border-radius: 12px; padding: .65rem .8rem; margin-bottom: .5rem; background: var(--bs-body-bg); }
    .pp-item.live { border-inline-start: 5px solid #15803d; } .pp-item.pending { border-inline-start: 5px solid #d97706; } .pp-item.rejected, .pp-item.stopped { border-inline-start: 5px solid #b91c1c; opacity: .85; }
    .pp-item.ended { opacity: .6; } .pp-item.soon { border-inline-start: 5px solid #0e7490; }
    .pp-ii { flex: none; width: 4rem; text-align: center; color: #901d23; } .pp-ii i { font-size: 1.5rem; display: block; } .pp-ii small { font-size: .72rem; color: var(--bs-secondary-color); }
    .pp-ib { flex: 1; min-width: 0; display: grid; gap: .15rem; } .pp-clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pp-st { font-weight: 700; } .pp-st.live { color: #15803d; } .pp-st.pending { color: #b45309; } .pp-st.rejected, .pp-st.stopped { color: #b91c1c; } .pp-st.soon { color: #0e7490; }
    .pp-acts { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .3rem; align-items: center; } .pp-acts .pp-note { max-width: 260px; }
    .pp-iprev { max-width: 640px; } .pp-iprev:not(:empty) { margin-top: .5rem; }
    .pp-pre { background: #fff; border-radius: 8px; padding: .6rem; white-space: pre-wrap; font-size: .95rem; }
    .pp-set td { min-width: 6rem; }
    .pp-exs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 1rem; }
    .pp-demo { display: flex; justify-content: space-between; align-items: center; gap: .6rem; flex-wrap: wrap; background: #fff3cd; border: 2px dashed #d39e00; border-radius: 12px; padding: .6rem .9rem; margin-bottom: .8rem; }
  </style>`);
  Promise.all([noCache('data/screens/accounts.json'), noCache('data/screen_posts.json'), U.getJSON('data/timetable.json')]).then(([a, d, tt]) => {
    ACC = a; DATA = d || { posts: [], settings: { default: {}, screens: {} }, alert: null };
    BLDS = [...new Set(tt.sections.map(s => s.building).filter(b => b && !/^-+$/.test(b)))].sort((x, y) => x.localeCompare(y, 'ar'));
    U.setDays(tt.days);
    const up = $('#pg-updated'); if (up) up.textContent = DEMO ? 'وضع التجربة: لا يُنشر شيء' : 'تُنشر الإعلانات بعد موافقة مسؤول الموقع';
    if (DEMO) {
      DS = BLDS.find(b => /الهندسة/.test(b)) || BLDS[0];
      const k = dLoad();
      if (k && k.ACC && k.DATA) { ACC = k.ACC; DATA = k.DATA; LOGF = k.LOG || { log: [] }; DS = (ACC.users.demo && ACC.users.demo.screens[0]) || DS; } else demoSeed();
      S = { u: 'demo', a: ACC.users.demo, demo: true };
    }
    render();
  }).catch(e => { app.innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
