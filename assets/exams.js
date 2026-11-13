/* «جدول الامتحانات»: plans the exams of a faculty (finals, midterms, make-ups) from the published timetable.
   Each course is one exam (all its sections at the same time). Who sits together comes from the study plans (each
   major × year is a cohort whose courses must not clash) and, when the committee uploads it, from the registration
   list (anonymous student number + course code: exact). A solver places every course, then a local search removes
   clashes, more than N exams a day for a cohort / student, back-to-back exams, instructor clashes and seat shortages.
   The committee moves exams by drag and drop (or tap, then tap a cell; cells show how good each move is), pins
   them, and keeps drafts. Rooms are filled per period and proctors shared out fairly. Everything stays in this
   browser (drafts can be exported as a file for the committee); nothing is sent anywhere.
   Behind the research pages' sign-in, or an exams-only account (EX_USERS). */
(function () {
  'use strict';
  const U = window.UOP, { $, esc } = U;
  const APP = '#ex-app';

  // ---------- sign-in (same account as the research pages) ----------
  const GATE = '15d12ce11e3c3bda9774ef2909a61065e35cedc2a575fa63a9632d0df823aa1a';
  const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(x => x.toString(16).padStart(2, '0')).join('');
  // accounts for this page only (exams committee): sha256('uopstaff-exams|' + user + '|' + password); they do not open the research pages
  const EX_USERS = ['51b45402b30455c5641c82cd1ffe05c1907bfaae0a69b7b03900105796bdd985'];
  const authed = () => { try { return [localStorage, sessionStorage].some(st => st.getItem('rs-auth') === GATE || EX_USERS.includes(st.getItem('ex-auth'))); } catch (e) { return false; } };
  const gate = new Promise(res => {
    if (authed()) { res(); return; }
    document.documentElement.classList.add('ex-locked');
    const d = document.createElement('div'); d.className = 'ex-gate'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<form class="box" autocomplete="on"><div class="ic"><i class="bi bi-shield-lock-fill"></i></div><h2>جدول الامتحانات — دخول</h2><p>هذه الأداة للجنة الامتحانات. أدخل اسم المستخدم وكلمة المرور (حساب لجنة الامتحانات أو حساب البحث العلمي).</p>
      <label>اسم المستخدم<input name="u" class="form-control" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></label>
      <label>كلمة المرور<input name="p" type="password" class="form-control" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></label>
      <label class="rem"><input type="checkbox" name="r" checked> تذكّرني على هذا الجهاز</label>
      <div class="err" hidden><i class="bi bi-exclamation-triangle-fill"></i> اسم المستخدم أو كلمة المرور غير صحيحة</div>
      <button class="btn btn-ex w-100" type="submit"><i class="bi bi-box-arrow-in-left"></i> دخول</button>
      <a class="back" href="./"><i class="bi bi-arrow-right"></i> العودة إلى الصفحة الرئيسية</a></form>`;
    const show = () => {
      document.body.appendChild(d);
      const f = d.querySelector('form'); f.u.focus();
      f.onsubmit = async e => {
        e.preventDefault();
        const u = f.u.value.trim(), eu = u.toLowerCase(), main = await sha('uopstaff-research|' + u + '|' + f.p.value) === GATE, exh = await sha('uopstaff-exams|' + eu + '|' + f.p.value), ex = EX_USERS.includes(exh);
        if (!main && !ex) { d.querySelector('.err').hidden = false; f.p.value = ''; f.p.focus(); return; }
        try { (f.r.checked ? localStorage : sessionStorage).setItem(main ? 'rs-auth' : 'ex-auth', main ? GATE : exh); } catch (e2) { /* session only */ }
        d.remove(); document.documentElement.classList.remove('ex-locked'); res();
      };
    };
    document.body ? show() : document.addEventListener('DOMContentLoaded', show);
  });

  // ---------- state ----------
  const KEY = 'ex-plan-v1';
  const TYPES = {
    mid1: { name: 'الامتحان الأول', periods: [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']], days: 6 },
    mid2: { name: 'الامتحان الثاني', periods: [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']], days: 6 },
    midterm: { name: 'امتحان منتصف الفصل', periods: [['08:30', '10:00'], ['10:30', '12:00'], ['12:30', '14:00'], ['14:30', '16:00']], days: 6 },
    final: { name: 'الامتحان النهائي', periods: [['09:00', '11:00'], ['11:30', '13:30'], ['14:00', '16:00']], days: 12 },
    makeup: { name: 'الامتحان التكميلي', periods: [['10:00', '12:00'], ['12:30', '14:30']], days: 3 },
  };
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const hourly = (a, b) => Array.from({ length: b - a }, (_, k) => [U.toTime((a + k) * 60), U.toTime((a + k + 1) * 60)]);
  // A faculty's standing answers (what its exams committee decided once), applied to every new plan of that faculty alone so
  // they are not asked again; each stays editable in «الإعداد». all: every exam type; <type>: that type only.
  // halls / labs: the rooms suggested (hall capacity fixed; a lab's = its largest lab section); cal: the exam days from the
  // university calendar, from its first Sunday, without its last day.
  const PROFILES = {
    'تكنولوجيا المعلومات': {
      halls: { bld: ['مبنى كلية تكنولوجيا المعلومات'], re: /^7[0-3]\d\d$/, cap: 24, label: 'قاعات 7000–7399 في مبنى الكلية، 24 طالباً في القاعة' },
      labs: { bld: ['مبنى كلية تكنولوجيا المعلومات', 'مبنى المكتبة'], label: 'مختبرات مبنى الكلية ومبنى المكتبة' },
      all: { splitOver: 30, splitPer: 24, blankHall: true, practical: true, near: false, off: [5, 6] },
      midterm: { periods: hourly(8, 16), firstStart: '08:00', lastEnd: '16:00', maxDay: 2, b2b: false, insClash: false, busy: true, depth: 'deep', labelT: 'جدول امتحانات MID', cal: { sunday: true, dropLast: true } },
    } };
  // the committee can change its saved answers («حفظها للخطط القادمة»): kept on this device over the built-in ones
  const PKEY = 'ex-profiles-v1', PSAVE = ['periods', 'firstStart', 'lastEnd', 'maxDay', 'b2b', 'near', 'insClash', 'early', 'busy', 'depth', 'off', 'practical', 'splitOver', 'splitPer', 'blankHall', 'roomPolicy', 'headsOwn', 'deanNo', 'procMode', 'perProc', 'minProc', 'maxDuty', 'maxDutyDay'];
  const pOver = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) { return {}; } };
  const profOf = o => { if ((o.facs || []).length !== 1) return null; const f = o.facs[0], base = PROFILES[f], ov = pOver()[f]; if (!base && !ov) return null;
    const pr = Object.assign({ halls: null, labs: null }, base || {}); if (ov) Object.keys(ov).forEach(t => { pr[t] = Object.assign({}, pr[t] || {}, ov[t]); pr.saved = ov._at; }); return pr; };
  function profSave() {
    const f = S.facs[0], all = pOver(), o = all[f] = all[f] || {}, t = o[S.type] = {};
    PSAVE.forEach(k => { if (S[k] !== undefined) t[k] = JSON.parse(JSON.stringify(S[k])); }); o._at = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch (e) { alert('تعذّر الحفظ في هذا المتصفح.'); return; }
    alert(`حُفظت إعدادات هذه الخطة (الفترات والقواعد والقاعات والمراقبون) لخطط «${TYPES[S.type].name}» القادمة لـ${f} على هذا الجهاز.`);
  }
  // the exam window of a type in the university calendar (data/calendar.json)
  let CALJ = null, ORGJ = null;
  const CALRE = { midterm: /منتصف الفصل/, mid1: /الامتحان الأول/, mid2: /الاختبار الثاني|الامتحان الثاني/, final: /الامتحانات النهائية/ };
  function calWin(type, rule) {
    if (!CALJ || !CALRE[type]) return null;
    const evs = (CALJ.semesters || []).flatMap(s => s.events || []), t = today();
    const ev = evs.filter(e => e.category === 'exams' && CALRE[type].test(e.title) && e.end >= t).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!ev) return null;
    const d = new Date(ev.start + 'T12:00:00Z'), e = new Date(ev.end + 'T12:00:00Z');
    if (rule && rule.sunday) while (d.getUTCDay() !== 0 && d < e) d.setUTCDate(d.getUTCDate() + 1);
    if (rule && rule.dropLast) e.setUTCDate(e.getUTCDate() - 1);
    const start = d.toISOString().slice(0, 10), end = e.toISOString().slice(0, 10);
    const hol = evs.filter(x => x.category === 'holiday' && x.start <= end && x.end >= start).map(x => x.start).filter(x => x >= start && x <= end);
    return { start, end, hol: [...new Set(hol)].join(' '), title: ev.title, from: ev.start, to: ev.end };
  }
  // the type's own defaults, then the faculty's answers for it, then its days from the calendar
  function typeSet(o, type) {
    const t = TYPES[type], pr = profOf(o), p = pr ? Object.assign({}, pr.all || {}, pr[type] || {}) : {};
    Object.assign(o, { type, periods: t.periods.map(x => x.slice()), days: t.days, busy: type === 'mid1' || type === 'mid2' || type === 'midterm' });
    Object.entries(p).forEach(([k, v]) => { if (k !== 'labelT' && k !== 'cal') o[k] = JSON.parse(JSON.stringify(v)); });
    const w = calWin(type, p.cal);
    if (w) Object.assign(o, { start: w.start, end: w.end, hol: w.hol, calNote: `${w.title}: ${dLong(w.from)} – ${dLong(w.to)}` }); else o.calNote = '';
    if (pr) { o.profile = o.facs[0]; if ((!o.label || o.labelAuto || o.label === 'خطة جديدة') && p.labelT) { o.label = `${p.labelT} – ${o.facs[0]}${CALJ && CALJ.year ? ' ' + CALJ.year : ''}`; o.labelAuto = true; } }
    return o;
  }
  function fresh(type, facs) {
    const t = TYPES[type || 'final'];   // the default exam is the final
    const o = { type: type || 'final', start: today(), days: t.days, off: [5, 6], hol: '', end: '', procMode: 'room', procFix: {}, firstStart: '08:00', lastEnd: '16:00', dayWin: {}, periods: t.periods.map(p => p.slice()), maxDay: 2, perProc: 30, minProc: 1, maxDuty: 0, maxDutyDay: 2, busy: type === 'mid1' || type === 'mid2' || type === 'midterm', b2b: true, near: true, insClash: true, early: true, depth: 'normal', noProc: '', label: '', gview: 'matrix', setupDone: false,
      faculty: facs ? facs[0] || '' : 'تكنولوجيا المعلومات', facs: facs || ['تكنولوجيا المعلومات'], flt: {}, practical: false, grad: true, src: 'plans', rooms: null, excl: {}, pins: {}, slot: {}, reg: null, regInfo: '', extraProc: '', drafts: [], approved: null,
      splitOver: 0, splitPer: 24, blankHall: false, fixed: [], procList: [], procOnly: false, roomPolicy: 'ownFirst', headsOwn: true, deanNo: true };
    return typeSet(o, o.type);
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.type) S = fresh();
  const OLDMID = '09:00-10:30,11:00-12:30,13:00-14:30,15:00-16:30';
  const migrate = () => { if (!Array.isArray(S.facs)) S.facs = S.faculty ? [S.faculty] : []; if (!S.flt) S.flt = {}; if (!Array.isArray(S.off)) S.off = [5, 6];
    if (!S.off.includes(5)) S.off.push(5);   // Friday is the official weekly holiday
    if (!S.procMode) S.procMode = 'room'; if (!S.procFix) S.procFix = {};
    if (S.firstStart == null) S.firstStart = '08:00'; if (!S.dayWin) S.dayWin = {}; if (S.end == null) S.end = '';
    if (S.splitPer == null) { S.splitPer = 24; S.splitOver = S.splitOver || 0; } if (!Array.isArray(S.fixed)) S.fixed = []; if (!Array.isArray(S.procList)) S.procList = []; if (!S.roomPolicy) S.roomPolicy = 'free'; if (S.headsOwn == null) S.headsOwn = false; if (S.deanNo == null) S.deanNo = false;
    if (S.lastEnd == null) { S.lastEnd = '16:00'; delete S.noFrom; delete S.noTo;
      if (S.type === 'midterm' && S.periods.map(p => p.join('-')).join(',') === OLDMID) { S.periods = TYPES.midterm.periods.map(p => p.slice()); S.slot = {}; S.pins = {}; } } };
  // a period that ends after the latest allowed time (a user setting, 16:00 by default)
  const late = p => (!!S.lastEnd && U.toMin(p[1]) > U.toMin(S.lastEnd)) || (!!S.firstStart && U.toMin(p[0]) < U.toMin(S.firstStart));
  // the hours allowed on a weekday: the general window, narrowed by that day's own window (e.g. Thursday until 13:00)
  const winOf = wd => { const w = (S.dayWin || {})[wd] || {}; return [w.from || S.firstStart || '00:00', w.to || S.lastEnd || '23:59']; };
  const outWin = (wd, p) => { const [a, b] = winOf(wd); return U.toMin(p[0]) < U.toMin(a) || U.toMin(p[1]) > U.toMin(b); };
  migrate();
  const inFac = f => !S.facs.length || S.facs.includes(f);
  const facLabel = () => !S.facs.length ? 'كل الكليات' : S.facs.length === 1 ? S.facs[0] : S.facs.length + ' كليات';
  // Nothing is kept on this device until «حفظ»: changes live in the page; save() only marks them unsaved, store() keeps them.
  let DIRTY = false, READY = false, HAS = false, SAVED_AT = 0;
  try { HAS = !!localStorage.getItem(KEY); } catch (e) { /* */ }
  // (viewing — moving between sections, views and filters — changes nothing worth a warning; only edits do)
  let EDITED = false;
  const save = () => { if (READY) { DIRTY = true; EDITED = true; savebar(); } };
  // other plans kept on this device: when a plan opened from a link, a file or this list is saved, the plan saved before it
  // is moved here (never lost); «فتح» swaps them
  const LIB = 'ex-plans-lib';
  let SWAPPED = false;
  const libGet = () => { try { return JSON.parse(localStorage.getItem(LIB) || '[]') || []; } catch (e) { return []; } };
  const libSet = l => { try { localStorage.setItem(LIB, JSON.stringify(l)); return true; } catch (e) { alert('تعذّر الحفظ: مساحة التخزين في هذا المتصفح ممتلئة.'); return false; } };
  const planName = o => o.label || `${(TYPES[o.type] || {}).name || 'خطة امتحانات'}${o.facs && o.facs.length === 1 ? ' – ' + o.facs[0] : o.facs && !o.facs.length ? ' – كل الكليات' : ''}`;
  const libEntry = (raw, o) => ({ name: planName(o), type: (TYPES[o.type] || {}).name || '', n: Object.keys(o.slot || {}).length, approved: o.approved || '', at: new Date().toISOString().slice(0, 16).replace('T', ' '), plan: raw });
  function stash() {   // keep the plan now saved on this device in the list
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { /* */ }
    if (!raw) return true; let o; try { o = JSON.parse(raw); } catch (e) { return true; }
    const l = libGet().filter(x => x.plan !== raw); l.unshift(libEntry(raw, o)); return libSet(l.slice(0, 12));
  }
  function store() {
    if (SWAPPED && !stash()) return;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('تعذّر الحفظ في هذا المتصفح (المساحة ممتلئة أو التخزين محظور).'); return; }
    SWAPPED = false; DIRTY = false; EDITED = false; HAS = true; SAVED_AT = Date.now(); savebar(); if (READY) render();
  }
  function savebar() {
    let b = document.getElementById('ex-savebar');
    if (!b) { b = document.createElement('div'); b.id = 'ex-savebar'; b.setAttribute('role', 'status'); document.body.appendChild(b);
      b.addEventListener('click', e => { if (e.target.closest('[data-store]')) store(); }); }
    const just = Date.now() - SAVED_AT < 2500;
    b.className = DIRTY ? 'on' : just ? 'on ok' : '';
    b.innerHTML = DIRTY ? '<i class="bi bi-exclamation-circle-fill"></i><span><b>تغييرات غير محفوظة</b><small>لا يُحفظ شيء على هذا الجهاز إلا عند الضغط على «حفظ»</small></span><button class="btn btn-light btn-sm" data-store><i class="bi bi-save-fill"></i> حفظ</button>'
      : just ? '<i class="bi bi-check-circle-fill"></i><span><b>حُفظ على هذا الجهاز</b></span>' : '';
    if (just && !DIRTY) setTimeout(savebar, 2600);
  }
  window.addEventListener('beforeunload', e => { if (DIRTY && EDITED) { e.preventDefault(); e.returnValue = ''; } });
  let repCache = [], repFilter = '';
  let REGMEM = null;   // the registration report's names: read when uploaded, never saved
  let TT, PLANS, tab = new URLSearchParams(location.search).get('tab') || (S.setupDone ? 'grid' : 'set'), sel = null, outView = 'all', undo = [];

  // ---------- model ----------
  let C = [], BY = {}, G = [], INS = {}, NS = 0, P = 0, DAYS = [], PARTS = {}, PARTOF = {}, RQ = [];
  const level = c => {
    if (c.degree === 'الماجستير') return 5;
    const d = String(c.code).replace(/\D/g, ''), l = /^[1-8]\d{5}$/.test(d) ? +d[3] : /^1001\d{3}$/.test(d) ? +d[4] : 0;
    return l > 4 ? 5 : l;
  };
  const LV = l => l === 5 ? 'الماجستير' : l ? `السنة ${['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة'][l] || l}` : 'غير محددة';
  function merged(list) {
    const seen = {};
    return list.filter(s => { const k = [s.code, s.section, s.activity, s.instructor, JSON.stringify(s.meetings)].join('|'); if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function examDays() {
    const hol = new Set((S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []));
    const out = []; const d = new Date(S.start + 'T12:00:00Z');
    for (let guard = 0; (S.end ? true : out.length < S.days) && guard < 120; guard++, d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10); if (S.end && iso > S.end) break;
      if (d.getUTCDay() === 5 || S.off.includes(d.getUTCDay()) || hol.has(iso)) continue;
      out.push({ iso, n: d.getUTCDay(), dl: U.JS_DAY[d.getUTCDay()], wd: WD[d.getUTCDay()], label: `${WD[d.getUTCDay()]} ${+iso.slice(8)}/${+iso.slice(5, 7)}` });
    }
    return out;
  }
  // a time of an exam day → its slot (the period it starts in), or -1 when the day is not an exam day
  function slotAt(date, from) {
    const di = DAYS.findIndex(d => d.iso === date); if (di < 0 || !from) return -1;
    const t = U.toMin(from); let k = S.periods.findIndex(p => U.toMin(p[0]) <= t && t < U.toMin(p[1]));
    if (k < 0) k = S.periods.findIndex(p => U.toMin(p[1]) > t);
    return k < 0 ? -1 : di * P + k;
  }
  // exams other departments hold at fixed times (S.fixed: the basic sciences' maths, the university requirements…): one row per
  // course and sections at a date and time, with the rooms they take. In the exam days, each joins the plan at its time (a course
  // sat at several times becomes one part per time, by sections), keeps its students from other exams then, takes no seats or
  // proctors here, and its rooms are taken at that time. Only those that share students with this plan's courses join.
  let FX = { codes: new Set(), parts: {}, pin: {}, until: {}, out: [], blocks: [], inPlan: new Set() };
  function fixedPrep() {
    const F = { codes: new Set(), parts: {}, pin: {}, until: {}, out: [], blocks: [] }, by = {};
    (S.fixed || []).forEach(x => (by[x.code] = by[x.code] || []).push(x));
    Object.entries(by).forEach(([code, L]) => {
      const ses = {};
      L.filter(x => DAYS.some(d => d.iso === x.date)).forEach(x => { const k = x.date + ' ' + x.from, o = ses[k] = ses[k] || { date: x.date, from: x.from, to: x.to, secs: [], all: false };
        if (!x.secs || !x.secs.length) o.all = true; else o.secs.push(...x.secs.map(String)); if (U.toMin(x.to || x.from) > U.toMin(o.to || o.from)) o.to = x.to; });
      const list = Object.values(ses).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
      if (!list.length) { F.out.push(code); return; }
      F.codes.add(code);
      const whole = list.find(o => o.all) || (L.length === 1 ? list[0] : null);
      if (whole) { F.pin[code] = slotAt(whole.date, whole.from); F.until[code] = whole.to; return; }
      F.parts[code] = list.map(o => [...new Set(o.secs)]);
      list.forEach((o, k) => { const pc = list.length > 1 ? `${code}/${k + 1}` : code; F.pin[pc] = slotAt(o.date, o.from); F.until[pc] = o.to; });
    });
    const bl = {}; (S.fixed || []).forEach(x => { if (!x.rooms || !x.rooms.length || !x.date) return; const k = [x.date, x.from, x.to || x.from].join('|'); (bl[k] = bl[k] || new Set()); x.rooms.forEach(r => bl[k].add(String(r))); });
    F.blocks = Object.entries(bl).map(([k, set]) => { const [date, from, to] = k.split('|'); return { date, from, to, rooms: [...set] }; });
    return F;
  }
  function build() {
    const MK = S.type === 'makeup' && S.mk && S.mk.n ? S.mk : null;   // make-up: only the courses (and students) of the uploaded list
    const ONLY = !MK && S.only && S.only.length ? new Set(S.only) : null;
    DAYS = examDays(); P = S.periods.length; NS = DAYS.length * P;
    FX = MK ? { codes: new Set(), parts: {}, pin: {}, until: {}, out: [], blocks: [] } : fixedPrep();
    // a fixed exam joins only when some student of this plan's own courses sits it (with a registration list); else all do
    let FXIN = FX.codes;
    if (FX.codes.size && S.reg && S.src !== 'plans') {
      const facOf = {}; TT.sections.forEach(s => { facOf[s.code] = s.faculty; });
      const core = k => !FX.codes.has(k) && (ONLY ? ONLY.has(k) : inFac(facOf[k])), linked = new Set();
      S.reg.forEach(g => { const b = g.c.map(k => k.split('#')[0]); if (b.some(core)) b.forEach(k => linked.add(k)); });
      FXIN = new Set([...FX.codes].filter(k => linked.has(k)));
    }
    FX.inPlan = FXIN;
    const secs = merged(TT.sections.filter(s => (MK ? !!MK.n[s.code] : FXIN.has(s.code) || (ONLY ? ONLY.has(s.code) : inFac(s.faculty))) && (MK || S.practical || s.activity === 'نظري') && (MK || S.grad || s.degree !== 'الماجستير')));
    const m = {};
    secs.forEach(s => {
      const c = m[s.code] || (m[s.code] = { code: s.code, name: s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), dept: s.department, fac: s.faculty, degree: s.degree, students: 0, secs: 0, ins: new Set(), sl: [] });
      c.students += s.registered || 0; c.secs++; if (s.instructor) c.ins.add(s.instructor);
      if (s.registered) c.sl.push({ s: s.section, n: s.registered, ins: s.instructor || '' });
    });
    if (MK) {   // a course of the list not taught this term: its name from the list, no section, no instructor
      Object.entries(MK.n).forEach(([code, n]) => { const c = m[code] || (m[code] = { code, name: MK.names[code] || code, dept: MK.dept[code] || '—', fac: MK.fac[code] || '—', degree: '', students: 0, secs: 0, ins: new Set(), sl: [] });
        c.students = n; c.sl = []; c.fromReg = true; });
      Object.keys(m).forEach(k => { if (!MK.n[k]) delete m[k]; });
    }
    // a registration report gives the real number of students per course and per section (it replaces the timetable's counts)
    else if (S.regN && S.src !== 'plans') Object.values(m).forEach(c => { const n = S.regN[c.code]; if (!n) return; c.students = n; c.fromReg = true;
      const sec = S.regSec && S.regSec[c.code]; if (sec) { const old = Object.fromEntries(c.sl.map(x => [String(x.s), x.ins])); c.sl = Object.entries(sec).map(([k, v]) => ({ s: k, n: v, ins: old[k] || '' })); } });
    // courses sat in parts (by sections, each part its own exam): the committee's (S.parts) and the fixed exams' (one part per time)
    PARTS = {}; PARTOF = {};
    const PL = MK ? {} : Object.assign({}, S.parts || {}, FX.parts);
    Object.entries(PL).forEach(([code, list]) => { const c = m[code], fx = !!FX.parts[code]; if (!c || !Array.isArray(list) || !list.length || (list.length < 2 && !fx)) return;
      const po = PARTOF[code] = {};
      if (list.length === 1) {   // a fixed exam for some sections only (the others sit it outside the exam days)
        const set = new Set(list[0].map(String)), sl = c.sl.filter(x => set.has(String(x.s))); set.forEach(x => { po[x] = code; });
        if (sl.length) Object.assign(c, { sl, students: sl.reduce((a, x) => a + x.n, 0), secs: sl.length, ins: new Set(sl.map(x => x.ins).filter(Boolean)) }); return; }
      delete m[code]; PARTS[code] = [];
      list.forEach((secs, k) => { const set = new Set(secs.map(String)), sl = c.sl.filter(x => set.has(String(x.s))), pc = `${code}/${k + 1}`; set.forEach(x => { po[x] = pc; }); if (!sl.length && !fx) return;
        PARTS[code].push(pc);
        m[pc] = { ...c, code: pc, base: code, part: k + 1, parts: list.length, name: `${c.name} (${k + 1} من ${list.length})`, baseName: c.name, sl, students: sl.reduce((a, x) => a + x.n, 0), secs: sl.length, ins: new Set(sl.map(x => x.ins).filter(Boolean)) }; }); });
    C = Object.values(m).filter(c => !S.excl[c.code] && !S.excl[c.base]).sort((a, b) => a.code.localeCompare(b.code));
    C.forEach((c, i) => { c.i = i; c.lv = level(c); c.ins = [...c.ins]; });
    BY = Object.fromEntries(C.map(c => [c.code, c]));
    // a slot is day × period: when periods are added or removed, each exam keeps its day and period number (or is unscheduled)
    if (S.slotP && S.slotP !== P) { const re = v => { if (!Number.isInteger(v) || v < 0) return v; const d = Math.floor(v / S.slotP), k = v % S.slotP; return k < P ? d * P + k : -1; };
      Object.keys(S.slot).forEach(c => { S.slot[c] = re(S.slot[c]); if (S.slot[c] < 0) delete S.slot[c]; }); Object.keys(S.pins).forEach(c => { S.pins[c] = re(S.pins[c]); if (S.pins[c] < 0) delete S.pins[c]; }); }
    S.slotP = P;
    RQ = C.map(effReq);
    const multi = new Set(C.map(c => c.fac)).size > 1, keys = [...new Set(C.map(c => multi ? c.fac : c.dept))].sort();
    C.forEach(c => { c.col = U.PALETTE[keys.indexOf(multi ? c.fac : c.dept) % U.PALETTE.length]; });
    COLBY = multi ? 'fac' : 'dept';
    // instructors → their courses
    INS = {}; C.forEach(c => c.ins.forEach(n => (INS[n] = INS[n] || []).push(c.i)));
    // who sits together. A registration group lists «code#section» (or the code alone): a course sat in parts counts only the
    // part of the student's section; a section outside every fixed time has no exam in these days
    G = [];
    const exOf = k => { const h = k.indexOf('#'), code = h < 0 ? k : k.slice(0, h), sec = h < 0 ? '' : k.slice(h + 1), po = PARTOF[code];
      if (!po) return [code]; if (!sec) return PARTS[code] || [code]; return po[sec] ? [po[sec]] : FX.parts[code] ? [] : PARTS[code] || [code]; };
    const add = (name, codes, w, hard, kind) => { const ix = [...new Set(codes.flatMap(exOf))].filter(k => BY[k]).map(k => BY[k].i); if (ix.length > 1) G.push({ name, c: ix, w, hard, kind }); };
    if (MK) MK.reg.forEach(g => add(`${g.w} طالب (قائمة التكميلي)`, g.c, g.w, true, 'students'));
    else if (S.src !== 'reg' || !S.reg) {
      const inPlan = new Set();
      (PLANS.plans || []).filter(p => inFac(p.faculty) || p.groups.some(g => g.courses.some(x => BY[x.code]))).forEach(p => {
        const codes = p.groups.flatMap(g => g.courses.map(x => x.code)).filter(k => BY[k]);
        codes.forEach(k => inPlan.add(k));
        const byL = {}; codes.forEach(k => (byL[BY[k].lv] = byL[BY[k].lv] || []).push(k));
        const major = p.major || p.dept;
        Object.keys(byL).forEach(l => {
          add(`${major} · ${LV(+l)}`, byL[l], 10, +l > 0, 'cohort');
          if (S.near !== false && byL[+l + 1] && +l < 4) add(`${major} · ${LV(+l)} و${LV(+l + 1)}`, byL[l].concat(byL[+l + 1]), 2, false, 'near');
        });
      });
      const rest = {}; C.filter(c => !inPlan.has(c.code)).forEach(c => { const k = c.dept + '|' + c.lv; (rest[k] = rest[k] || []).push(c.code); });
      Object.entries(rest).forEach(([k, codes]) => { const [d, l] = k.split('|'); add(`${d} · ${LV(+l)}`, codes, 10, true, 'cohort'); });
    }
    if (!MK && S.reg && S.src !== 'plans') S.reg.forEach(g => add(`${g.w} طالب`, g.c, g.w, true, 'students'));
    G.forEach((g, i) => { g.i = i; });
    C.forEach(c => { c.g = []; });
    G.forEach(g => g.c.forEach(i => C[i].g.push(g.i)));
    // slots: keep the saved ones that still exist. Pinned: a fixed exam at its time, then the committee's pins, then a course's
    // fixed time from its requirements (S.req[code].at)
    C.forEach(c => { const s = S.slot[c.code]; c.s = Number.isInteger(s) && s >= 0 && s < NS ? s : -1;
      const at = RQ[c.i].at, fp = FX.pin[c.code], p = fp != null && fp >= 0 ? fp : Number.isInteger(S.pins[c.code]) ? S.pins[c.code] : at ? slotAt(at.date, at.from) : null;
      c.pin = Number.isInteger(p) && p >= 0 && p < NS ? p : null; if (c.pin != null) c.s = c.pin; });
    capTotal = rooms().filter(r => r.on && usable(r)).reduce((a, r) => a + r.c, 0);
    // rooms and instructors taken by lectures at an exam's time (when exams run during teaching weeks, e.g. midterms)
    const busyR = {}, busyI = {};
    if (S.busy) TT.sections.forEach(x => x.meetings.forEach(m => {
      if (!m.start || m.mode === 'غير متزامن') return;
      const a = U.toMin(m.start), b = U.toMin(m.end);
      for (let s = 0; s < NS; s++) {
        const d = DAYS[dayOf(s)], p = S.periods[s % P];
        if (d.dl !== m.day || !(a < U.toMin(p[1]) && U.toMin(p[0]) < b)) continue;
        if (x.room && x.room !== '0') (busyR[s] = busyR[s] || new Set()).add(x.room);
        if (x.instructor) (busyI[s] = busyI[s] || new Set()).add(x.instructor);
      }
    }));
    (S.block || []).concat(FX.blocks || []).forEach(b => { for (let s = 0; s < NS; s++) { const d = DAYS[dayOf(s)], p = S.periods[s % P];
      if (d.iso === b.date && U.toMin(b.from) < U.toMin(p[1]) && U.toMin(p[0]) < U.toMin(b.to)) b.rooms.forEach(r => (busyR[s] = busyR[s] || new Set()).add(String(r))); } });
    AV = []; CAP = []; BUSYI = busyI; BLK = [];
    for (let s = 0; s < NS; s++) BLK[s] = outWin(DAYS[dayOf(s)].n, S.periods[s % P]);
    for (let s = 0; s < NS; s++) { AV[s] = rooms().filter(r => r.on && usable(r) && !(busyR[s] && busyR[s].has(r.n))); CAP[s] = AV[s].reduce((a, r) => a + r.c, 0); CAPO[s] = AV[s].filter(r => mineR(r.n)).reduce((a, r) => a + r.c, 0); CAPL[s] = AV[s].filter(r => r.t === LAB).reduce((a, r) => a + r.c, 0); }
    lecPrep();
  }
  // rooms: by default the rooms the faculty teaches in, with an exam capacity of half the largest class seen there
  // rooms: by default the rooms the faculty teaches in. A hall's exam capacity is ~60% of the largest class seen there (an empty
  // seat between students); a lab's is the largest lab section seen there (one student per computer)
  const LAB = 'مختبر', HALL = 'قاعة';
  function roomKinds() { const k = {}; TT.sections.forEach(s => { if (!s.room || s.room === '0') return; const o = k[s.room] = k[s.room] || { t: 0, l: 0, mt: 0, ml: 0 };
    if (s.activity === 'عملي') { o.l++; o.ml = Math.max(o.ml, s.registered || 0); } else { o.t++; o.mt = Math.max(o.mt, s.registered || 0); } }); return k; }
  let KINDS = null; const kindOf = n => { KINDS = KINDS || roomKinds(); const o = KINDS[n]; return o && o.l > 0 ? LAB : HALL; };   // a room that hosts any lab section is a lab (computer labs also host lectures)
  function labRooms(have) {
    KINDS = KINDS || roomKinds(); const m = {};
    TT.sections.filter(s => inFac(s.faculty) && s.room && s.room !== '0' && s.activity === 'عملي').forEach(s => { m[s.room] = Math.max(m[s.room] || 0, s.registered || 0); });
    return Object.entries(m).filter(([n, c]) => c >= 8 && !have.has(n) && kindOf(n) === LAB).sort((a, b) => b[1] - a[1]).slice(0, S.facs.length === 1 ? 16 : 200).map(([n, c]) => ({ n, c: Math.max(10, c), on: true, t: LAB }));
  }
  // the rooms of a faculty's profile: its halls (fixed capacity) and the labs of its buildings (a lab's largest lab section)
  function profRooms(pr) {
    KINDS = KINDS || roomKinds(); const bld = {}, th = {};
    TT.sections.forEach(s => { if (!s.room || s.room === '0') return; bld[s.room] = s.building; if (s.activity !== 'عملي') th[s.room] = Math.max(th[s.room] || 0, s.registered || 0); });
    const labs = Object.entries(KINDS).filter(([n, o]) => o.l > 0 && pr.labs.bld.includes(bld[n])).sort((a, b) => b[1].ml - a[1].ml || a[0].localeCompare(b[0]))
      .map(([n, o]) => ({ n, c: Math.max(10, o.ml), on: true, t: LAB }));
    const isLab = new Set(labs.map(r => r.n));
    const halls = Object.keys(th).filter(n => pr.halls.bld.includes(bld[n]) && pr.halls.re.test(n) && th[n] >= 10 && !isLab.has(n) && kindOf(n) === HALL).sort()
      .map(n => ({ n, c: pr.halls.cap, on: true, t: HALL }));
    return halls.concat(labs);
  }
  function rooms() {
    const pr = !S.rooms && profOf(S);
    if (pr && pr.halls && pr.labs) S.rooms = profRooms(pr);
    if (!S.rooms) {
      const m = {};
      TT.sections.filter(s => inFac(s.faculty) && s.room && s.room !== '0' && s.activity === 'نظري').forEach(s => { m[s.room] = Math.max(m[s.room] || 0, s.registered || 0); });
      S.rooms = Object.entries(m).filter(([n, c]) => c >= 10 && kindOf(n) === HALL).sort((a, b) => b[1] - a[1]).slice(0, S.facs.length === 1 ? 24 : 400)
        .map(([n, c]) => ({ n, c: Math.max(15, Math.round(c * 0.6 / 5) * 5), on: true, t: HALL }));
      S.rooms = S.rooms.concat(labRooms(new Set(S.rooms.map(r => r.n))));
    }
    S.rooms.forEach(r => { if (!r.t) r.t = kindOf(r.n); });
    return S.rooms;
  }
  // what the exams coordinator asked for each course: room type, number of rooms, proctors, notes
  // (a part of a course: the course's entry, with the part's own on top)
  const rawReq = c => { const R = S.req || {}; return c.base ? Object.assign({}, R[c.base] || {}, R[c.code] || {}) : R[c.code] || {}; };
  // what applies to an exam: the coordinator's entry, with the plan's rules filled in (a course with no room type sits in halls;
  // a hall exam over S.splitOver students is spread over halls of S.splitPer each), and a fixed exam's time. Worked out once per
  // build (RQ), as the solver asks for it at every move.
  function effReq(c) {
    const q = Object.assign({}, rawReq(c));
    if (FX.codes.has(c.base || c.code)) { q.ext = true; q.until = FX.until[c.code] || q.until; q.fixedBy = ((S.fixed || []).find(x => x.code === (c.base || c.code)) || {}).who || ''; return q; }
    if (q.ext) return q;
    if (q.at && q.at.to) q.until = q.at.to;
    if (!q.type && S.blankHall) q.type = HALL;
    if (q.type === HALL && S.splitOver > 0 && S.splitPer > 0 && c.students > S.splitOver) { q.rooms = Math.ceil(c.students / S.splitPer); q.split = true; }
    return q;
  }
  const REQ = c => (c && c.i != null && C[c.i] === c && RQ[c.i]) || effReq(c);
  const needLab = c => REQ(c).type === LAB;
  // an exam another department holds at a fixed time (e.g. the basic sciences' maths exams): it keeps its students from other
  // exams at that time, but takes no seats, rooms or proctors here (S.req[code].ext, or a fixed exam of S.fixed)
  const EXT = c => !!REQ(c).ext;
  // an exam longer than its period (S.req[code].until, e.g. 2:00–3:30 in hourly periods) also takes the next period from its students
  const overrun = (i, s) => { const u = REQ(C[i]).until; if (!u || s < 0) return -1; const k = s % P; return k + 1 < P && U.toMin(S.periods[k + 1][0]) < U.toMin(u) ? s + 1 : -1; };
  let capTotal = 0, AV = [], CAP = [], CAPL = [], CAPO = [], BUSYI = {}, BLK = [], COLBY = 'dept';
  // whose a room is: the faculty that teaches most in it (the timetable). Rooms of another faculty in the same building (e.g. the
  // sciences' halls in the IT building) are used by S.roomPolicy: 'ownFirst' (default: this faculty's rooms first, another's only
  // when needed and free), 'own' (never), 'free' (like any room, when free)
  let OWNER = null;
  const ownerOf = n => { if (!OWNER) { const m = {}; TT.sections.forEach(x => { if (!x.room || x.room === '0') return; const o = m[x.room] = m[x.room] || {}; o[x.faculty] = (o[x.faculty] || 0) + 1; });
    OWNER = {}; Object.entries(m).forEach(([r, o]) => { OWNER[r] = Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]; }); } return OWNER[n] || ''; };
  const mineR = n => { const o = ownerOf(n); return !o || !S.facs.length || !!S.only && !S.reqOnly || S.facs.includes(o); };
  const usable = r => S.roomPolicy !== 'own' || mineR(r.n);
  const capOf = s => CAP[s] == null ? capTotal : CAP[s];

  // ---------- cost ----------
  const W = { blocked: 20000, clash: 1000, softClash: 60, overDay: 45, sameDay: 4, backToBack: 12, ins: 150, seat: 80, spread: 0.08, early: 0.0005, lec: 6, late: 30, borrow: 1 };
  // students' own lectures at an exam's time (midterms run during teaching weeks). S.lec, from the registration report: per course,
  // per weekday, the lecture times of its students' OTHER in-person courses with how many of them ([from, to, students] in minutes);
  // counts only, no student. LEC[i][s] = students of exam i who would miss a lecture if it is at slot s.
  let LEC = [];
  function lecPrep() {
    LEC = C.map(c => { const L = (S.lec || {})[c.base || c.code]; if (!L || S.lecOn === false) return null; const a = new Array(NS).fill(0);
      for (let s = 0; s < NS; s++) { const d = DAYS[dayOf(s)], p = S.periods[s % P], x = U.toMin(p[0]), y = U.toMin(p[1]); (L[d.dl] || []).forEach(([la, lb, n]) => { if (la < y && x < lb) a[s] += n; }); }
      return a; });
  }
  const lecAt = (i, s) => s >= 0 && LEC[i] ? LEC[i][s] : 0;
  // S.req[code].late: the committee wants this exam near the end of the period (each day earlier than the last costs W.late)
  const lateAt = (i, s) => s >= 0 && REQ(C[i]).late ? (DAYS.length - 1 - dayOf(s)) * W.late : 0;
  const dayOf = s => Math.floor(s / P);
  function groupCost(g, sl) {
    const per = {}, day = {};
    g.c.forEach(i => { const s = sl[i]; if (s < 0) return; per[s] = (per[s] || 0) + 1; const e = overrun(i, s); if (e >= 0) per[e] = (per[e] || 0) + 1; const d = dayOf(s); (day[d] = day[d] || []).push(s); });
    let cost = 0;
    for (const s in per) if (per[s] > 1) cost += (per[s] - 1) * (g.hard ? W.clash : W.softClash);
    for (const d in day) {
      const n = new Set(day[d]).size;
      if (n > S.maxDay) cost += (n - S.maxDay) * W.overDay;
      if (n > 1) cost += (n - 1) * W.sameDay;
      const ks = [...new Set(day[d])].sort((a, b) => a - b);
      if (S.b2b !== false) for (let k = 1; k < ks.length; k++) if (ks[k] - ks[k - 1] === 1) cost += W.backToBack;
    }
    return cost * g.w;
  }
  const seatF = (s, n) => { if (s < 0) return 0; const cap = capOf(s); return Math.max(0, n - cap) * W.seat + (cap ? n * n / cap * W.spread : n * W.spread) + (S.roomPolicy === 'ownFirst' && CAPO[s] != null ? Math.max(0, n - CAPO[s]) * W.borrow : 0); };
  let WORK = null, SEAT = [], SEATL = [];
  const labF = (s, n) => s < 0 || !n ? 0 : Math.max(0, n - (CAPL[s] || 0)) * W.seat;
  const labAt = (s, sl) => { if (s < 0) return 0; if (sl === WORK) return SEATL[s]; let n = 0; for (const c of C) if (sl[c.i] === s && needLab(c)) n += c.students; return n; };
  const seatsAt = (s, sl) => { if (s < 0) return 0; if (sl === WORK) return SEAT[s]; let n = 0; for (const c of C) if (sl[c.i] === s && !EXT(c)) n += c.students; return n; };
  const seatCost = (s, sl) => seatF(s, seatsAt(s, sl));
  function insCost(i, sl) {
    let cost = 0; if (S.insClash === false) return 0;
    C[i].ins.forEach(n => { const mine = sl[i]; if (mine < 0) return; INS[n].forEach(j => { if (j !== i && sl[j] === mine) cost += W.ins; }); });
    return cost;
  }
  // the part of the total that depends on course i (seats are counted per period in delta)
  function local(i, sl) {
    let cost = 0;
    C[i].g.forEach(g => { cost += groupCost(G[g], sl); });
    return cost + (sl[i] >= 0 && BLK[sl[i]] ? W.blocked : 0) + insCost(i, sl) * 2 + (sl[i] >= 0 && S.early !== false ? C[i].students * dayOf(sl[i]) * W.early : 0) + lecAt(i, sl[i]) * W.lec + lateAt(i, sl[i]);
  }
  function delta(i, to, sl) {
    const from = sl[i]; if (from === to) return 0;
    const n = EXT(C[i]) ? 0 : C[i].students, a = seatsAt(from, sl), b = seatsAt(to, sl);
    let seatD = seatF(from, a - n) + seatF(to, b + n) - seatF(from, a) - seatF(to, b);
    if (needLab(C[i])) { const la = labAt(from, sl), lb = labAt(to, sl); seatD += labF(from, la - n) + labF(to, lb + n) - labF(from, la) - labF(to, lb); }
    const before = local(i, sl);
    sl[i] = to;
    const after = local(i, sl);
    sl[i] = from;
    return after - before + seatD;
  }
  function total(sl) {
    let cost = 0;
    G.forEach(g => { cost += groupCost(g, sl); });
    for (let s = 0; s < NS; s++) cost += seatCost(s, sl) + labF(s, labAt(s, sl));
    C.forEach(c => { cost += (sl[c.i] >= 0 && BLK[sl[c.i]] ? W.blocked : 0) + insCost(c.i, sl) + (sl[c.i] >= 0 && S.early !== false ? c.students * dayOf(sl[c.i]) * W.early : 0) + lecAt(c.i, sl[c.i]) * W.lec + lateAt(c.i, sl[c.i]); });
    return cost;
  }

  // ---------- solver ----------
  function solve(keep) {
    const sl = C.map(c => c.pin != null ? c.pin : keep && c.s >= 0 ? c.s : -1);
    WORK = sl; SEAT = new Array(NS).fill(0); SEATL = new Array(NS).fill(0); C.forEach(c => { if (sl[c.i] >= 0 && !EXT(c)) { SEAT[sl[c.i]] += c.students; if (needLab(c)) SEATL[sl[c.i]] += c.students; } });
    const set = (i, s) => { const L = needLab(C[i]), n = EXT(C[i]) ? 0 : C[i].students; if (sl[i] >= 0) { SEAT[sl[i]] -= n; if (L) SEATL[sl[i]] -= n; } sl[i] = s; if (s >= 0) { SEAT[s] += n; if (L) SEATL[s] += n; } };
    const free = C.filter(c => c.pin == null);
    const weight = c => c.g.reduce((a, g) => a + (G[g].hard ? G[g].w * G[g].c.length : 0), 0) * 10 + c.students;
    free.filter(c => sl[c.i] < 0).sort((a, b) => weight(b) - weight(a)).forEach(c => {
      let best = 0, bd = Infinity;
      for (let s = 0; s < NS; s++) { const d = delta(c.i, s, sl) + Math.random() * 0.01; if (d < bd) { bd = d; best = s; } }
      set(c.i, best);
    });
    const t0 = performance.now(), budget = (900 + Math.min(4000, C.length * 12)) * ({ quick: 0.5, normal: 1, deep: 3 }[S.depth] || 1);
    let cur = total(sl), bestSl = sl.slice(), bestCost = cur, T = 30;
    while (performance.now() - t0 < budget && free.length) {
      const c = free[Math.floor(Math.random() * free.length)];
      if (Math.random() < 0.75) {
        let best = sl[c.i], bd = 0;
        for (let s = 0; s < NS; s++) { const d = delta(c.i, s, sl); if (d < bd || (d < T * Math.random() && Math.random() < 0.08)) { bd = d; best = s; } }
        if (best !== sl[c.i]) { cur += delta(c.i, best, sl); set(c.i, best); }
      } else {  // swap two exams
        const o = free[Math.floor(Math.random() * free.length)]; if (o === c || sl[o.i] === sl[c.i]) continue;
        const a = sl[c.i], b = sl[o.i];
        const d1 = delta(c.i, b, sl); set(c.i, b); const d2 = delta(o.i, a, sl);
        if (d1 + d2 <= 0 || d1 + d2 < T * Math.random() * 0.2) { set(o.i, a); cur += d1 + d2; } else set(c.i, a);
      }
      T = Math.max(0.5, T * 0.9995);
      if (cur < bestCost - 1e-9) { bestCost = cur; bestSl = sl.slice(); }
    }
    WORK = null;
    C.forEach(c => { c.s = bestSl[c.i]; S.slot[c.code] = c.s; });
    save();
  }
  const SL = () => C.map(c => c.s);

  // ---------- rooms & proctors ----------
  // who proctors, with their limits: the instructors of this plan's own exams (not those whose only exams here are other
  // departments' fixed ones), the extra names and the uploaded proctors list (S.procList: a person's own limits and days off),
  // minus the exempted (or, with «من القائمة فقط», everyone not on the list). A listed name is matched to the timetable's name.
  const nameKeys = n => { const t = U.norm(U.shortName(n)).replace(/\s+/g, ' ').trim().split(' '); return [t.join(' '), t.length > 1 ? t[0] + ' ' + t[t.length - 1] : '']; };
  // heads of department and deans (the organisation chart, or «رئيس قسم» / «عميد» in the proctors list)
  let HEADS = null;
  function headsSet() {
    if (HEADS) return HEADS; const out = [];
    const walk = n => { (n.people || []).forEach(p => { const j = (p.role || '') + ' ' + (p.job || ''); if (p.type !== 'academic') return;
      if (/عميد/.test(j)) out.push({ n: p.name, job: p.job || p.role, unit: n.name, dean: true }); else if (/رئيس\s*قسم/.test(j)) out.push({ n: p.name, job: p.job || p.role, unit: n.name, dean: false }); }); (n.children || []).forEach(walk); };
    if (ORGJ && ORGJ.tree) (Array.isArray(ORGJ.tree) ? ORGJ.tree : [ORGJ.tree]).forEach(walk);
    return (HEADS = out);
  }
  function procRules() {
    const own = Object.keys(INS).filter(n => INS[n].some(i => !EXT(C[i]))), km = {};
    own.forEach(n => nameKeys(n).forEach((k, j) => { if (!k) return; const key = j + k; km[key] = km[key] === undefined ? n : km[key] === n ? n : null; }));
    const canon = n => { const [a, b] = nameKeys(n); return own.includes(n) ? n : km['0' + a] || (b && km['1' + b]) || (b && km['1' + a]) || n; };
    const L = (S.procList || []).map(p => Object.assign({}, p, { n: canon(p.n) })), info = {}; L.forEach(p => { info[p.n] = p; });
    const exempt = new Set((S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean));
    const isEx0 = n => exempt.has(n) || exempt.has(U.shortName(n)) || !!(info[n] || {}).ex || (!!S.procOnly && L.length > 0 && !info[n]);
    // a head of department proctors only his own courses' exams (S.headsOwn): never drawn for others
    const hk = new Set(), dk = new Set();
    headsSet().forEach(h => (h.dean ? dk : hk).add(canon(h.n))); L.forEach(p => { if (/عميد/.test(p.role || '')) dk.add(p.n); else if (/رئيس\s*قسم/.test(p.role || '')) hk.add(p.n); });
    const isHead = n => !!S.headsOwn && hk.has(n), isDean = n => !!S.deanNo && dk.has(n), isEx = n => isEx0(n) || isDean(n);   // deans: not at all (S.deanNo)
    const names = [...new Set(own.concat((S.extraProc || '').split(/\n/).map(x => x.trim()).filter(Boolean).map(canon), L.map(p => p.n)))];
    const offOn = (n, dd) => { const p = info[n], d = DAYS[dd]; return !!p && !!d && ((p.offD || []).includes(d.iso) || (p.offW || []).includes(d.n)); };
    return { info, isEx, isHead, isDean, offOn, names, pool: names.filter(n => !isEx(n) && !isHead(n)), maxOf: n => (info[n] && info[n].max) || S.maxDuty, dayOf: n => (info[n] && info[n].maxDay) || S.maxDutyDay };
  }
  function seating() {
    const out = {}, load = {}, unseated = [], short = [], dayLoad = {}, roomReq = [];
    const R = procRules(), isEx = R.isEx, pool = R.pool;
    pool.forEach(n => { load[n] = 0; });
    for (let s = 0; s < NS; s++) {
      const list = C.filter(c => c.s === s).sort((a, b) => b.students - a.students);
      const freeR = (AV[s] || rooms().filter(r => r.on)).slice().sort((a, b) => b.c - a.c), busy = new Set(BUSYI[s] || []), dd = dayOf(s);
      DAYS[dd] && pool.forEach(n => { if (R.offOn(n, dd)) busy.add(n); });   // a day the person is not available
      const can = n => !busy.has(n) && (!R.maxOf(n) || (load[n] || 0) < R.maxOf(n)) && (!R.dayOf(n) || ((dayLoad[n] || {})[dd] || 0) < R.dayOf(n));
      const take = n => { load[n] = (load[n] || 0) + 1; (dayLoad[n] = dayLoad[n] || {})[dd] = ((dayLoad[n] || {})[dd] || 0) + 1; };
      out[s] = list.map(c => {
        if (EXT(c)) return { c, rooms: [], left: 0, ext: true };
        // each section goes whole into the smallest free room it fits (or the room its course already uses, if there is
        // space), so a section stays together with its own instructor; only a section larger than every room is split
        const got = [], parts = c.sl.length ? c.sl.slice().sort((a, b) => b.n - a.n) : [{ s: '', n: c.students, ins: '' }], q = REQ(c);
        let left = 0;
        const fits = r => !q.type || r.t === q.type;
        const put = (r, x, k) => { r.n += k; r.free -= k; r.parts.push({ s: x.s, k }); r.secs.push(x.s ? x.s + (k < x.n ? ` (${k} من ${x.n})` : '') : ''); if (x.ins && !r.ins.includes(x.ins)) r.ins.push(x.ins); };
        const pick = (cap, pref) => freeR.reduce((b, r, j) => fits(r) && (!pref || mineR(r.n)) && (cap == null ? b < 0 : r.c >= cap && (b < 0 || r.c < freeR[b].c)) ? j : b, -1);
        const open = (cap, lim) => { let k = S.roomPolicy === 'ownFirst' ? pick(cap, true) : -1; if (k < 0) k = pick(cap, false); if (k < 0) return null;   // this faculty's rooms first
          const r = freeR.splice(k, 1)[0], o = { room: r.n, t: r.t, n: 0, cap: r.c, free: Math.min(r.c, lim || r.c), proc: [], secs: [], parts: [], ins: [], borrow: mineR(r.n) ? '' : ownerOf(r.n) }; got.push(o); return o; };
        // the coordinator asked for N rooms: spread the students evenly over N rooms of the asked type (e.g. 80 students → 4 × 20)
        if (q.rooms > 1) { const per = Math.ceil(c.students / q.rooms); for (let k = 0; k < q.rooms; k++) if (!open(per, per) && !open(null, per)) break; }
        parts.forEach(x => {
          let rest = x.n;
          const share = got.filter(o => o.free >= rest).sort((a, b) => a.free - b.free)[0] || open(rest);
          if (share) { put(share, x, rest); return; }
          while (rest > 0) { const o = got.filter(g => g.free > 0).sort((a, b) => b.free - a.free)[0] || open(null); if (!o) break; const k = Math.min(rest, o.free); put(o, x, k); rest -= k; }
          left += rest;
        });
        got.forEach(o => { o.secs = o.secs.filter(Boolean); });
        if (left > 0) unseated.push({ c, n: left, s });
        if (q.rooms > 1 && got.length < q.rooms) roomReq.push({ c, s, want: q.rooms, got: got.length, type: q.type || 'قاعة أو مختبر' });
        return { c, rooms: got, left };
      });
      // proctors: the course's own instructors first, then whoever has proctored least
      // (an instructor whose own exam is now is kept for it; one teaching a lecture now is not available)
      const ownNow = new Set(); out[s].forEach(x => x.c.ins.forEach(n => { if (!busy.has(n) && !isEx(n)) ownNow.add(n); }));
      // rooms whose proctors were chosen by hand (after generation) keep them; they are counted before the automatic ones
      const FIX = S.procFix || {};
      // (if «تحسين» moved the exam to other rooms, the hand-picked proctors follow it to its new rooms, unless they teach at the new time)
      out[s].forEach(x => {
        const mine = Object.keys(FIX).filter(k => k.startsWith(x.c.code + '|')), here = new Set(x.rooms.map(r => r.room));
        const loose = mine.filter(k => !here.has(k.slice(x.c.code.length + 1)));
        x.rooms.forEach(r => { const k = FIX[x.c.code + '|' + r.room] ? x.c.code + '|' + r.room : loose.shift(); if (!k) return;
          const f = FIX[k].filter(n => !busy.has(n)); if (k !== x.c.code + '|' + r.room) { FIX[x.c.code + '|' + r.room] = FIX[k]; delete FIX[k]; }
          r.proc = f.slice(); r.fixed = true; r.need = f.length; f.forEach(n => { busy.add(n); ownNow.delete(n); take(n); }); });
      });
      out[s].forEach(x => {
        const used = new Set(), want = REQ(x.c).proc || 0;
        x.rooms.forEach(r => {
          if (r.fixed) return;
          // one proctor per exam room by default; or by the number of students (the «طالب لكل مراقب» setting)
          const need = Math.max(S.minProc || 1, S.procMode === 'ratio' ? Math.ceil(r.n / S.perProc) : 1, want ? Math.ceil(want / Math.max(1, x.rooms.length)) : 0);
          const mine = (r.ins || []).concat(x.c.ins).filter(n => ownNow.has(n) && !used.has(n));
          while (r.proc.length < need) {
            let n = mine.shift();
            if (n) { used.add(n); ownNow.delete(n); busy.add(n); }
            else { n = pool.filter(p => can(p) && !ownNow.has(p)).sort((a, b) => (load[a] || 0) - (load[b] || 0) || a.localeCompare(b))[0]; if (!n) break; busy.add(n); }
            r.proc.push(n); take(n);
          }
          r.need = need;
          if (r.proc.length < need) short.push({ c: x.c, s, room: r.room, miss: need - r.proc.length });
        });
      });
    }
    return { out, load, unseated, short, roomReq };
  }

  // ---------- checks ----------
  function issues() {
    const sl = SL(), list = [];
    G.forEach(g => {
      const per = {}, day = {};
      g.c.forEach(i => { const s = sl[i]; if (s < 0) return; (per[s] = per[s] || []).push(i); const e = overrun(i, s); if (e >= 0) (per[e] = per[e] || []).push(i); (day[dayOf(s)] = day[dayOf(s)] || new Set()).add(s); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: g.hard ? 'clash' : 'soft', g, cs: v, txt: `${g.hard ? 'تعارض' : 'تعارض محتمل'}: ${v.map(i => C[i].code).join(' و ')} في الفترة نفسها` }));
      Object.entries(day).filter(([, v]) => v.size > S.maxDay).forEach(([d, v]) => list.push({ k: 'day', g, cs: g.c.filter(i => v.has(sl[i])), txt: `${v.size} امتحانات يوم ${DAYS[d].label}` }));
      if (S.b2b !== false) Object.entries(day).forEach(([d, v]) => { const ks = [...v].sort((a, b) => a - b); for (let k = 1; k < ks.length; k++) if (ks[k] - ks[k - 1] === 1 && g.kind !== 'near') list.push({ k: 'b2b', g, cs: g.c.filter(i => sl[i] === ks[k] || sl[i] === ks[k - 1]), txt: `امتحانان متتاليان يوم ${DAYS[d].label}` }); });
    });
    if (S.insClash !== false) Object.entries(INS).forEach(([n, ix]) => {
      const per = {}; ix.forEach(i => { if (sl[i] >= 0) (per[sl[i]] = per[sl[i]] || []).push(i); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: 'ins', cs: v, txt: `${U.shortName(n)}: امتحانان لمقرريه في الفترة نفسها (${v.map(i => C[i].code).join('، ')})` }));
    });
    C.forEach(c => { if (c.s >= 0 && BLK[c.s]) list.push({ k: 'blk', cs: [c.i], txt: `${c.code} في ${slotLabel(c.s)}: خارج وقت الامتحانات لهذا اليوم` }); });
    C.forEach(c => { const n = lecAt(c.i, c.s); if (n && c.pin == null) list.push({ k: 'lec', cs: [c.i], n, txt: `${c.code}: ${n} طالباً لديهم محاضرة أخرى وقت الامتحان` }); });
    return list;
  }
  // every problem as one detailed, de-duplicated row: severity, type, when, which exams, who is affected, why, and a fix
  const KIND = {
    clash: ['حرج', 'تعارض طالب', 'bi-x-octagon-fill'], unseated: ['حرج', 'نقص مقاعد', 'bi-door-closed-fill'], ins: ['مرتفع', 'تعارض مدرّس', 'bi-person-x-fill'],
    short: ['مرتفع', 'نقص مراقبين', 'bi-person-dash-fill'], day: ['متوسط', 'ضغط يومي', 'bi-calendar-x-fill'], b2b: ['منخفض', 'امتحانان متتاليان', 'bi-arrow-left-right'],
    soft: ['منخفض', 'تعارض محتمل', 'bi-question-circle-fill'], blk: ['حرج', 'خارج وقت الامتحانات', 'bi-slash-circle-fill'], room: ['مرتفع', 'نوع القاعة', 'bi-pc-display'], lec: ['منخفض', 'محاضرة وقت الامتحان', 'bi-easel2'] };
  const SEV = { 'حرج': 0, 'مرتفع': 1, 'متوسط': 2, 'منخفض': 3 };
  function bestFix(cs) {
    const sl = SL(); let best = null;
    cs.filter(i => C[i].pin == null).forEach(i => { for (let s = 0; s < NS; s++) { const d = delta(i, s, sl); if (d < -0.5 && (!best || d < best.d)) best = { i, s, d }; } });
    return best;
  }
  function report(st) {
    const rows = {}, add = (k, cs, when, who, n, exact, why) => {
      const key = k + '|' + cs.slice().sort((a, b) => a - b).join(',') + '|' + when;
      const r = rows[key] || (rows[key] = { k, cs, when, who: [], n: 0, exact, why });
      if (who && !r.who.includes(who)) r.who.push(who);
      r.n = exact ? r.n + n : Math.max(r.n, n);
    };
    const slotOf = cs => [...new Set(cs.map(i => C[i].s))].map(slotLabel).join(' / ');
    const est = cs => Math.min(...cs.map(i => C[i].students));
    st.is.forEach(x => {
      const exact = (x.g && x.g.kind === 'students') || x.k === 'lec', n = x.k === 'ins' ? 0 : x.k === 'lec' ? x.n : x.k === 'blk' ? C[x.cs[0]].students : exact ? x.g.w : est(x.cs);
      const who = x.k === 'ins' ? U.shortName(x.txt.split(':')[0]) : x.k === 'lec' ? 'طلبة من كشف التسجيل' : x.g ? (exact ? 'طلبة من كشف التسجيل' : x.g.name) : '';
      const why = {
        clash: 'امتحانان أو أكثر في الفترة نفسها لطلبة يدرسون المقررات معاً — لا يمكن للطالب حضورهما.',
        soft: 'المقرران من سنتين متتاليتين في التخصص نفسه؛ قد يجمعهما بعض الطلبة المتأخرين أو المتقدمين.',
        day: `أكثر من ${S.maxDay} امتحان في اليوم نفسه للفئة نفسها من الطلبة.`,
        b2b: 'امتحانان في فترتين متتاليتين من اليوم نفسه بلا استراحة.',
        ins: 'المدرّس نفسه يدرّس المقررين وامتحاناهما في الوقت نفسه؛ لا يستطيع الحضور في القاعتين.',
        blk: 'الفترة خارج وقت الامتحانات المحدد لهذا اليوم في «الإعداد ← الفترات اليومية».',
        lec: 'من كشف التسجيل: لهؤلاء الطلبة محاضرة وجاهية لمقرر آخر في وقت الامتحان (الامتحانات في أسابيع الدوام). يحضرون الامتحان ويُعذرون من المحاضرة، أو يُنقل الامتحان.' }[x.k];
      add(x.k, x.cs, x.k === 'day' || x.k === 'b2b' ? x.txt.replace(/^.*يوم /, '') : slotOf(x.cs), who, n, exact, why);
    });
    st.seat.unseated.forEach(u => add('unseated', [u.c.i], slotLabel(u.s), '', u.n, true, `لا تتسع القاعات المتاحة في هذه الفترة لكل الطلبة (${u.n} طالب بلا مقعد).`));
    (st.seat.roomReq || []).forEach(u => add('room', [u.c.i], slotLabel(u.s), REQ(u.c).coord || '', u.c.students, true, `طُلب ${u.want} من نوع «${u.type}» ولم يتوفر في هذه الفترة إلا ${u.got}؛ انقل الامتحان إلى فترة فيها ${u.type === LAB ? 'مختبرات' : 'قاعات'} أكثر أو أضفها في «القاعات».`));
    st.seat.short.forEach(u => add('short', [u.c.i], slotLabel(u.s), 'القاعة ' + u.room, u.miss, true, `ينقص ${u.miss} مراقب في القاعة ${u.room}: كل المتاحين مشغولون أو بلغوا حدّ المراقبات.`));
    return Object.values(rows).map(r => ({ ...r, sev: KIND[r.k][0], fix: r.k === 'short' ? null : bestFix(r.cs) }))
      .sort((a, b) => SEV[a.sev] - SEV[b.sev] || a.when.localeCompare(b.when));
  }
  const fixTxt = f => f ? `انقل ${C[f.i].code} إلى ${slotLabel(f.s)}` : '';
  const repLine = (r, k) => [k + 1, r.sev, KIND[r.k][1], r.when, r.cs.map(i => `${C[i].code} ${C[i].name} (${C[i].students})`).join(' | '), r.who.join('، '),
    r.k === 'ins' ? '' : r.exact ? r.n : r.n ? `حتى ${r.n} (تقدير)` : '', r.why, fixTxt(r.fix) || (r.k === 'short' ? 'أضف مراقبين أو ارفع حد المراقبات' : 'لا يوجد نقل أفضل؛ عدّل الأيام أو القاعات')];
  const REP_H = ['#', 'الخطورة', 'النوع', 'الموعد', 'الامتحانات (عدد الطلبة)', 'الفئة المتأثرة', 'الطلبة المتأثرون', 'السبب', 'الحل المقترح'];
  function stats() {
    const is = issues(), seat = seating(), reg = G.filter(g => g.kind === 'students');
    const stu = k => is.filter(x => x.k === k && x.g && x.g.kind === 'students').reduce((a, x) => a + x.g.w, 0);
    return { is, seat, clash: is.filter(x => x.k === 'clash').length, day: is.filter(x => x.k === 'day').length, b2b: is.filter(x => x.k === 'b2b').length,
      ins: is.filter(x => x.k === 'ins').length, soft: is.filter(x => x.k === 'soft').length, unseated: seat.unseated.reduce((a, u) => a + u.n, 0), short: seat.short.reduce((a, u) => a + u.miss, 0),
      stuClash: stu('clash'), stuDay: stu('day'), lec: is.filter(x => x.k === 'lec').reduce((a, x) => a + x.n, 0), reg: reg.length, placed: C.filter(c => c.s >= 0).length };
  }

  // ---------- views ----------
  const slotLabel = s => s < 0 ? '—' : `${DAYS[dayOf(s)].label} · ${S.periods[s % P][0]}–${S.periods[s % P][1]}`;
  const LVS = l => l === 5 ? 'دراسات عليا' : l ? `<bdi>سنة ${l}</bdi>` : '—';
  const nDays = n => n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يوماً`;
  const nPer = n => n === 1 ? 'فترة واحدة' : n === 2 ? 'فترتان' : n <= 10 ? `${n} فترات` : `${n} فترة`;
  const F = () => S.flt || (S.flt = {});
  // the filter shared by every view: faculty, department, year, text, only exams with a problem
  let PROB = new Set();
  const match = c => { const f = F(), q = U.norm((f.q || '').trim());
    return (!f.fac || c.fac === f.fac) && (!f.dept || c.dept === f.dept) && (f.lv === undefined || f.lv === '' || c.lv === +f.lv)
      && (!q || U.norm(c.code + ' ' + c.name + ' ' + c.ins.join(' ')).includes(q)) && (!f.prob || PROB.has(c.i)); };
  const card = (c, bad) => `<div class="ex-card${sel === c.i ? ' sel' : ''}${c.pin != null ? ' pinned' : ''}${bad ? ' bad' : ''}" draggable="true" data-c="${c.i}" style="--c:${c.col[0]};--b:${c.col[1]}" title="${esc(c.code + ' ' + c.name)} · ${esc(c.dept)} · ${c.students} طالب · ${c.secs} شعبة">
    <div class="t"><b>${esc(c.code)}</b>${c.pin != null ? '<i class="bi bi-pin-angle-fill" title="مثبّت"></i>' : ''}${bad ? '<i class="bi bi-exclamation-triangle-fill wr" title="عليه ملاحظة"></i>' : ''}</div>
    <div class="n">${esc(c.name)}</div>
    <div class="m"><span class="bd"><i class="bi bi-people-fill"></i> ${c.students}</span><span class="bd">${LVS(c.lv)}</span>${c.secs > 1 ? `<span class="bd">${c.secs} شعب</span>` : ''}</div></div>`;
  const STEPS = [['set', 'bi-sliders', 'الإعداد', 'الأيام والفترات والقاعات والقواعد'], ['grid', 'bi-magic', 'التوليد والتعديل', 'ولّد الجدول ثم عدّله'],
    ['check', 'bi-clipboard2-check', 'فحص الجودة', 'التعارضات وحلولها'], ['out', 'bi-patch-check', 'الاعتماد والطباعة', 'نسخ واعتماد ونشر وطباعة']];
  function stepState(k, st) {
    if (k === 'set') return S.setupDone ? ['done', `${C.length} مقرراً · ${nDays(DAYS.length)}`] : ['todo', 'ابدأ من هنا'];
    if (k === 'grid') return st.placed ? ['done', `${st.placed} امتحاناً مجدولاً`] : ['todo', 'لم يُولَّد بعد'];
    if (k === 'check') return !st.placed ? ['todo', '—'] : st.clash || st.unseated ? ['bad', `${st.clash} تعارض · ${st.unseated} بلا مقعد`] : ['done', 'بلا تعارض'];
    return S.approved ? ['done', 'معتمدة: ' + S.approved] : ['todo', S.drafts.length ? `${S.drafts.length} نسخة · لم تُعتمد` : 'احفظ نسخة واعتمدها'];
  }
  function head(st) {
    const i = STEPS.findIndex(x => x[0] === tab);
    return `<nav class="ex-steps" aria-label="خطوات إعداد الجدول">${STEPS.map(([k, ic, t, sub], n) => { const [s, txt] = stepState(k, st);
      return `<button class="ex-step ${s}${tab === k ? ' on' : ''}" data-tab="${k}"><span class="num">${s === 'done' ? '<i class="bi bi-check-lg"></i>' : s === 'bad' ? '<i class="bi bi-exclamation-lg"></i>' : n + 1}</span>
        <span class="tx"><b><i class="bi ${ic}"></i> ${t}</b><small>${esc(txt)}</small></span></button>`; }).join('<i class="bi bi-chevron-left sep"></i>')}</nav>
      ${i >= 0 ? '' : ''}`;
  }
  const navBtns = () => { const i = STEPS.findIndex(x => x[0] === tab), p = STEPS[i - 1], n = STEPS[i + 1];
    return `<div class="ex-nav">${p ? `<button class="btn btn-outline-secondary" data-tab="${p[0]}"><i class="bi bi-arrow-right"></i> السابق: ${p[2]}</button>` : '<span></span>'}
      ${n ? `<button class="btn btn-ex btn-lg" ${tab === 'set' ? 'id="ex-setdone"' : `data-tab="${n[0]}"`}>التالي: ${n[2]} <i class="bi bi-arrow-left"></i></button>` : ''}</div>`; };
  // filter bar (every table and view)
  // faculty → department scope: one tidy row of faculties; the departments of the chosen faculty appear under it
  function chips(key, ic, label, allTxt, list, cur) {
    const dot = x => { const c = C.find(y => y[key] === x); return c && (key === COLBY || COLBY === 'dept') ? c.col[0] : U.PALETTE[list.indexOf(x) % U.PALETTE.length][0]; };
    const cnt = x => C.filter(c => c[key] === x && (key === 'fac' || !F().fac || c.fac === F().fac)).length;
    return `<div class="ex-scope-row"><span class="ex-scope-lb"><i class="bi ${ic}"></i> ${label}</span><div class="ex-seg" role="group" aria-label="${label}">
      <button class="ex-lg${cur ? '' : ' on'}" data-fk="${key}" data-fv="">${allTxt}</button>
      ${list.map(x => `<button class="ex-lg${cur === x ? ' on' : ''}" data-fk="${key}" data-fv="${esc(x)}" title="${esc(x)}"><i class="d" style="background:${dot(x)}"></i>${esc(x)}<span class="k">${cnt(x)}</span></button>`).join('')}</div></div>`;
  }
  function filterBar(extra) {
    const f = F(), facs = [...new Set(C.map(c => c.fac))].sort(), depts = [...new Set(C.filter(c => !f.fac || c.fac === f.fac).map(c => c.dept))].sort(), lvs = [...new Set(C.map(c => c.lv))].sort();
    const n = C.filter(match).length, cnt = (k, x) => C.filter(c => c[k] === x && (k === 'fac' || !f.fac || c.fac === f.fac)).length;
    return `<div class="ex-filter"><i class="bi bi-funnel-fill"></i>
      <input class="form-control" data-f="q" placeholder="ابحث: رمز، مقرر، مدرّس…" value="${esc(f.q || '')}">
      ${facs.length > 1 ? `<select class="form-select" data-f="fac" title="الكلية"><option value="">كل الكليات</option>${facs.map(x => `<option value="${esc(x)}" ${f.fac === x ? 'selected' : ''}>${esc(x)} (${cnt('fac', x)})</option>`).join('')}</select>` : ''}
      ${depts.length > 1 ? `<select class="form-select" data-f="dept" title="القسم"><option value="">كل الأقسام</option>${depts.map(x => `<option value="${esc(x)}" ${f.dept === x ? 'selected' : ''}>${esc(x)} (${cnt('dept', x)})</option>`).join('')}</select>` : ''}
      <select class="form-select" data-f="lv" title="السنة"><option value="">كل السنوات</option>${lvs.map(l => `<option value="${l}" ${String(f.lv) === String(l) && f.lv !== '' && f.lv != null ? 'selected' : ''}>${LV(l)}</option>`).join('')}</select>
      <label class="ex-switch"><input type="checkbox" data-f="prob" ${f.prob ? 'checked' : ''}><span></span> ذات الملاحظات</label>
      ${extra || ''}<span class="ex-count"><b>${n}</b> / ${C.length}</span>${n < C.length ? '<button class="btn btn-sm btn-link" data-fclear>مسح</button>' : ''}
      <details class="ex-help"><summary title="كيف أعدّل؟"><i class="bi bi-question-circle-fill"></i></summary><div class="pop">للتعديل: اسحب الامتحان إلى خانة أخرى، أو اضغطه ثم اضغط الخانة الجديدة؛ تتلوّن الخانات حسب أثر النقل (أخضر أفضل، أحمر تعارض). في «القائمة» يمكن النقل من قائمة منسدلة. الألوان حسب ${COLBY === 'fac' ? 'الكلية' : 'القسم'}.</div></details></div>`;
  }
  const GV = [['matrix', 'bi-grid-3x3-gap', 'المصفوفة'], ['days', 'bi-calendar-week', 'حسب اليوم'], ['list', 'bi-table', 'القائمة'], ['cohort', 'bi-mortarboard', 'التخصصات والسنوات'], ['dept', 'bi-diagram-3', 'الأقسام'], ['proc', 'bi-person-badge', 'المراقبون']];
  function gridView(st) {
    if (!DAYS.length) return '<div class="ex-empty warn"><i class="bi bi-calendar-x"></i> لا توجد أيام امتحانات: راجع تاريخ البداية وعدد الأيام في «الإعداد».<br><button class="btn btn-ex mt-2" data-tab="set">فتح الإعداد</button></div>';
    if (!st.placed) return `<div class="ex-start"><i class="bi bi-magic"></i><h3>الخطوة 2: ولّد الجدول</h3><p>سيوزّع النظام ${C.length} امتحاناً على ${nDays(DAYS.length)} و${P} فترات يومياً، مع منع التعارض ومراعاة القاعات والقواعد التي اخترتها.</p>
      <button class="btn btn-ex btn-lg" id="ex-solve"><i class="bi bi-magic"></i> ولّد الجدول الآن</button><button class="btn btn-link" data-tab="set">تعديل الإعداد أولاً</button>${undo.length ? '<button class="btn btn-outline-secondary" id="ex-undo"><i class="bi bi-arrow-counterclockwise"></i> تراجع عن الحذف</button>' : ''}</div>`;
    const v = S.gview || 'matrix';
    PROB = new Set(st.is.flatMap(x => x.cs).concat(st.seat.unseated.map(u => u.c.i), st.seat.short.map(u => u.c.i)));
    const keys = [...new Set(C.map(c => c[COLBY]))].sort();
    return `<div class="ex-toolbar">
        <div class="ex-views">${GV.map(([k, ic, t]) => `<button class="ex-vbtn${v === k ? ' on' : ''}" data-gv="${k}"><i class="bi ${ic}"></i> ${t}</button>`).join('')}</div>
        <div class="ex-acts"><button class="btn btn-ex" id="ex-solve" title="توليد جدول جديد من البداية (المثبّت يبقى)"><i class="bi bi-magic"></i> توليد من جديد</button>
          <button class="btn btn-outline-primary" id="ex-improve" title="تحسين الجدول الحالي دون البدء من جديد"><i class="bi bi-stars"></i> تحسين</button>
          <button class="btn btn-outline-secondary" id="ex-undo" ${undo.length ? '' : 'disabled'} title="تراجع عن آخر تعديل"><i class="bi bi-arrow-counterclockwise"></i> تراجع</button>
          <button class="btn btn-outline-danger" id="ex-clear" title="حذف التوزيع المولَّد والبدء من جدول فارغ"><i class="bi bi-trash3"></i> حذف الجدول</button></div></div>
      ${filterBar(v === 'cohort' || v === 'dept' ? `<label class="ex-switch"><input type="checkbox" data-f="names" ${F().names ? 'checked' : ''}><span></span> إظهار أسماء المقررات</label>` : '')}
      ${v === 'matrix' ? matrixView(st) : v === 'days' ? daysView(st) : v === 'list' ? listView(st) : v === 'cohort' ? cohortView(st) : v === 'proc' ? procView(st) : deptView(st)}
      ${C.some(c => c.s < 0) ? `<h5 class="ex-h"><i class="bi bi-inbox"></i> غير مجدولة</h5><div class="ex-pool ex-cell" data-s="-1">${C.filter(c => c.s < 0).map(c => card(c)).join('')}</div>` : ''}`;
  }
  // the proctor pool before generation: everyone who can proctor, by department (a click exempts or brings back)
  function pool() {
    const R = procRules(), by = {};
    R.names.forEach(n => { const ix = (INS[n] || []).filter(i => !EXT(C[i])), p = R.info[n], m = {}; ix.forEach(i => { m[C[i].dept] = (m[C[i].dept] || 0) + 1; });
      const d = ix.length ? Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] : p ? p.dept || p.role || 'من قائمة المراقبين' : 'مراقبون إضافيون';
      (by[d] = by[d] || []).push({ n, k: ix.length, off: R.isEx(n), dean: R.isDean(n), head: R.isHead(n), extra: !ix.length, tag: p ? p.role || 'من القائمة' : '' }); });
    return by;
  }
  function poolView() {
    const by = pool(), all = Object.values(by).flat(), on = all.filter(p => !p.off).length, q = U.norm(F().pq || '');
    const deps = Object.entries(by).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ar'));
    return `<div class="ex-pool3"><div class="h"><b class="t"><i class="bi bi-people-fill"></i> المراقبون المتاحون</b>
        <span class="bdg green">${on} متاح</span>${all.length - on ? `<span class="bdg">${all.length - on} معفى</span>` : ''}<span class="bdg">${deps.length} أقسام</span>
        <input class="form-control form-control-sm" data-f="pq" placeholder="ابحث عن اسم…" value="${esc(F().pq || '')}"></div>
      <p class="hint"><i class="bi bi-hand-index"></i> اضغط الاسم لإعفائه من المراقبة أو إعادته. الرقم = عدد مقرراته في هذه الدورة.</p>
      <div class="rows">${deps.map(([d, ps]) => { const list = ps.filter(p => !q || U.norm(p.n).includes(q)).sort((a, b) => U.shortName(a.n).localeCompare(U.shortName(b.n), 'ar'));
        if (!list.length) return ''; const n = ps.filter(p => !p.off).length;
        return `<div class="dr"><div class="dh"><b>${esc(d)}</b><span class="n">${n} من ${ps.length}</span><button class="btn btn-sm btn-link p-0" data-exd="${esc(d)}">${n ? 'إعفاء الكل' : 'إعادة الكل'}</button></div>
          <div class="nm">${list.map(p => `<button class="pc${p.off ? ' off' : ''}" data-exm="${esc(p.n)}" title="${esc(p.n)}${p.off ? ' — معفى' : ''}"><i class="bi ${p.off ? 'bi-slash-circle' : 'bi-check-circle-fill'}"></i><span>${esc(U.shortName(p.n))}${p.head && !p.off ? ' <small>· مواده فقط</small>' : p.dean ? ' <small>· عميد</small>' : ''}</span><span class="k">${p.extra ? esc(p.tag || 'إضافي') : p.k}</span></button>`).join('')}</div></div>`; }).join('')}</div></div>`;
  }
  // the add/swap lists are filled only when opened (thousands of rooms × hundreds of names would slow the page)
  let PV = null;
  function fillProcSel(el) {
    if (!PV || el.dataset.filled) return; el.dataset.filled = '1';
    const s = +el.dataset.ps, key = el.dataset.pfadd || el.dataset.pfswap, cur = curProc(key), b = PV.busyAt(s), cnt = PV.cnt;
    const opts = PV.names.filter(n => !cur.includes(n)).sort((a, c) => (b.has(a) - b.has(c)) || cnt(a) - cnt(c) || U.shortName(a).localeCompare(U.shortName(c), 'ar'));
    el.insertAdjacentHTML('beforeend', el.dataset.pfadd
      ? opts.map(n => `<option value="${esc(n)}" ${b.has(n) ? 'disabled' : ''}>${esc(U.shortName(n))} — ${cnt(n)} مراقبة${b.has(n) ? ' (مشغول في هذا الوقت)' : ''}</option>`).join('')
      : opts.filter(n => !b.has(n)).map(n => `<option value="${esc(n)}">${esc(U.shortName(n))} — ${cnt(n)}</option>`).join(''));
  }
  ['focusin', 'mousedown', 'touchstart'].forEach(ev => document.addEventListener(ev, e => { const el = e.target.closest && e.target.closest('select[data-ps]'); if (el) fillProcSel(el); }, true));
  // after generation: every exam room's proctors, editable; each name shows how many duties the person has
  function procView(st) {
    const { out, load } = st.seat, ex = new Set((S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean));
    const names = Object.values(pool()).flat().filter(p => !p.off).map(p => p.n);
    const cnt = n => load[n] || 0, all = names.map(cnt), avg = all.reduce((a, b) => a + b, 0) / Math.max(1, names.length), mx = Math.max(0, ...all);
    const rows = [];
    for (let s = 0; s < NS; s++) (out[s] || []).filter(x => match(x.c)).forEach(x => x.rooms.forEach(r => rows.push({ s, x, r })));
    const busyAt = s => { const b = new Set(); (out[s] || []).forEach(x => x.rooms.forEach(r => r.proc.forEach(n => b.add(n)))); (BUSYI[s] || []).forEach(n => b.add(n)); return b; };
    const tone = n => cnt(n) > avg + 1.5 ? 'hi' : cnt(n) < avg - 1.5 ? 'lo' : '';
    const top = names.slice().sort((a, b) => cnt(b) - cnt(a) || U.shortName(a).localeCompare(U.shortName(b), 'ar'));
    PV = { names, cnt, busyAt };
    return `<div class="ex-pv-sum"><span class="bdg"><i class="bi bi-door-open"></i> ${rows.length} جلسة امتحان</span><span class="bdg"><i class="bi bi-person-check"></i> ${rows.reduce((a, o) => a + o.r.proc.length, 0)} مراقبة</span>
        <span class="bdg"><i class="bi bi-people"></i> ${names.filter(n => cnt(n)).length} من ${names.length} مراقباً مشاركاً</span><span class="bdg"><i class="bi bi-bar-chart"></i> المتوسط ${avg.toFixed(1)} · الأعلى ${mx}</span>
        <span class="bdg amber"><i class="bi bi-hand-index"></i> ${Object.keys(S.procFix || {}).length} قاعة عُدّلت يدوياً</span>${Object.keys(S.procFix || {}).length ? '<button class="btn btn-sm btn-link text-danger" data-pfall>إلغاء كل التعديلات اليدوية</button>' : ''}</div>
      <details class="ex-pv-load" open><summary><span class="t"><i class="bi bi-person-lines-fill"></i> عدد المراقبات لكل مراقب <i class="bi bi-chevron-down ch"></i></span>
        <span class="lg"><span class="hi">أعلى من المتوسط</span><span class="mid">ضمن المتوسط</span><span class="lo">أقل من المتوسط</span></span></summary>
        <div class="ex-ldg">${[...new Set(top.map(cnt))].map(k => { const list = top.filter(n => cnt(n) === k), t = !k ? 'zero' : k > avg + 1.5 ? 'hi' : k < avg - 1.5 ? 'lo' : 'mid';
          return `<div class="ex-ldrow ${t}"><div class="ex-ldk"><div><b>${k}</b> <small>${k === 1 ? 'مراقبة' : k === 2 ? 'مراقبتان' : k >= 3 && k <= 10 ? 'مراقبات' : 'مراقبة'}</small></div><span>${list.length} ${list.length === 1 ? 'مراقب' : 'مراقبين'}</span></div>
            <div class="ex-ldnames">${list.map(n => `<span class="ex-ldn" title="${esc(n)}">${esc(U.shortName(n))}</span>`).join('')}</div></div>`; }).join('')}</div></details>
      <div class="table-responsive ex-tbl"><table class="table align-middle ex-pv"><thead><tr><th>اليوم والوقت</th><th>المقرر</th><th>القاعة</th><th>المراقبون (عدد مراقبات كلٍّ منهم)</th><th>إضافة / تغيير</th></tr></thead><tbody>
      ${rows.map(({ s, x, r }, k) => { const key = x.c.code + '|' + r.room, si = slotInfo(s), nd = k && rows[k - 1].s !== s;
        return `<tr class="${nd ? 'nd' : ''}${r.fixed ? ' fx' : ''}"><td><b>${esc(si.d.wd)} ${+si.d.iso.slice(8)}/${+si.d.iso.slice(5, 7)}</b><small dir="ltr" class="d-block">${si.time}</small></td>
          <td><span class="ex-code" style="--c:${x.c.col[0]};--b:${x.c.col[1]}">${esc(x.c.code)}</span> ${esc(x.c.name)}<small class="d-block text-muted">${esc(x.c.dept)}</small></td>
          <td><b>${esc(r.room)}</b>${r.t === LAB ? ' <i class="bi bi-pc-display" title="مختبر"></i>' : ''}<small class="d-block">${r.n} طالب</small></td>
          <td><div class="ex-chips">${r.proc.map(n => `<span class="ex-pp ${x.c.ins.includes(n) ? 'own' : ''}" title="${esc(n)}"><i class="bi bi-person-fill"></i> ${esc(U.shortName(n))} <b class="c">${cnt(n)}</b><button data-pfrm="${esc(key)}|${esc(n)}" aria-label="إزالة"><i class="bi bi-x"></i></button></span>`).join('')}${r.proc.length < (r.need || 1) ? `<span class="ex-pp miss"><i class="bi bi-exclamation-triangle-fill"></i> ${r.proc.length ? `ينقص ${(r.need || 1) - r.proc.length}` : 'بلا مراقب'}: أضف من القائمة</span>` : ''}</div>
            ${r.fixed ? `<button class="btn btn-sm btn-link p-0" data-pfauto="${esc(key)}"><i class="bi bi-arrow-counterclockwise"></i> تلقائي</button>` : ''}</td>
          <td><select class="form-select form-select-sm ex-pfsel" data-pfadd="${esc(key)}" data-ps="${s}"><option value="">+ مراقب…</option></select>
            ${r.proc.length ? `<select class="form-select form-select-sm ex-pfsel mt-1" data-pfswap="${esc(key)}" data-ps="${s}"><option value="">⇄ استبدال ${esc(U.shortName(r.proc[0]))} بـ…</option></select>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <small class="text-muted">الأسماء الخضراء: مدرّس المقرر. الرقم بجانب كل اسم عدد مراقباته في الدورة كلها. القاعة التي تعدّل مراقبيها يدوياً تبقى كما اخترت حتى بعد «تحسين» الجدول، ما دام الامتحان في القاعة نفسها.</small>`;
  }
  const curProc = key => { const [code, room] = key.split('|'), { out } = seating(); for (const xs of Object.values(out)) for (const x of xs) if (x.c.code === code) { const r = x.rooms.find(o => o.room === room); if (r) return r.proc.slice(); } return []; };
  function moveHint() {
    const c = sel != null ? C[sel] : null;
    return c ? `<div class="ex-hint"><i class="bi bi-hand-index-thumb-fill"></i> <span>نقل <b>${esc(c.code)} ${esc(c.name)}</b> (الآن: ${esc(slotLabel(c.s))}) — اضغط الخانة المطلوبة:</span>
        <span class="h-good">أفضل</span><span class="h-ok">مقبول</span><span class="h-warn">يزيد الضغط</span><span class="h-bad">تعارض</span>
        <button class="btn btn-sm btn-outline-secondary" data-pin="${sel}"><i class="bi bi-pin-angle"></i> ${c.pin != null ? 'إلغاء التثبيت' : 'تثبيت هنا'}</button><button class="btn btn-sm btn-link" data-unsel>إلغاء</button></div>`
      : '';
  }
  function matrixView() {
    const sl = SL(), heat = {};
    if (sel != null) for (let s = 0; s < NS; s++) heat[s] = delta(sel, s, sl);
    const cls = d => d == null ? '' : d <= -1 ? 'h-good' : d < 1 ? 'h-ok' : d < 200 ? 'h-warn' : 'h-bad';
    return `${moveHint()}<div class="ex-grid-wrap"><table class="ex-grid"><thead><tr><th class="corner">اليوم</th>${S.periods.map((p, k) => `<th><span class="pn">الفترة ${k + 1}</span><small dir="ltr">${p[0]} – ${p[1]}</small></th>`).join('')}</tr></thead><tbody>
      ${DAYS.map((d, di) => `<tr><th class="day"><b>${esc(d.wd)}</b><small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>${S.periods.map((p, k) => {
        const s = di * P + k, all = C.filter(c => c.s === s), list = all.filter(match), seats = all.reduce((a, c) => a + c.students, 0), cap = capOf(s);
        if (BLK[s] && !all.length) return `<td class="ex-cell blk" data-s="${s}"><div class="blkt"><i class="bi bi-slash-circle"></i> خارج أوقات الامتحانات</div></td>`;
        return `<td class="ex-cell ${cls(heat[s])}${BLK[s] ? ' blk' : ''}" data-s="${s}">${BLK[s] ? '<div class="blkt bad"><i class="bi bi-exclamation-octagon-fill"></i> خارج أوقات الامتحانات</div>' : ''}<div class="cap ${seats > cap ? 'over' : seats > cap * 0.85 ? 'hi' : ''}" title="مقاعد مستخدمة / متاحة"><i class="bi bi-person-workspace"></i> ${seats}/${cap}${all.length ? ` · ${all.length} امتحان` : ''}</div>
          ${list.map(c => card(c, PROB.has(c.i))).join('')}${all.length > list.length ? `<div class="more">+${all.length - list.length} خارج التصفية</div>` : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function daysView(st) {
    const out = st.seat.out;
    return `${moveHint()}<div class="ex-days-v">${DAYS.map((d, di) => {
      const all = C.filter(c => c.s >= 0 && dayOf(c.s) === di), list = all.filter(match);
      return `<section class="ex-day"><header><span class="dw">${esc(d.wd)}</span><span class="dd">${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}/${d.iso.slice(0, 4)}</span>
        <span class="bdg"><i class="bi bi-journal-check"></i> ${all.length} امتحان</span><span class="bdg"><i class="bi bi-people-fill"></i> ${all.reduce((a, c) => a + c.students, 0)} طالب</span></header>
        ${S.periods.map((p, k) => { const s = di * P + k, xs = (out[s] || []).filter(x => match(x.c));
          return `<div class="ex-per ex-cell" data-s="${s}"><div class="pt"><b>الفترة ${k + 1}</b><span dir="ltr">${p[0]} – ${p[1]}</span></div>
            <div class="pl">${xs.map(x => `<div class="ex-row${PROB.has(x.c.i) ? ' bad' : ''}${sel === x.c.i ? ' sel' : ''}" data-c="${x.c.i}" draggable="true" style="--c:${x.c.col[0]};--b:${x.c.col[1]}">
              <span class="cd">${esc(x.c.code)}</span><span class="nm">${esc(x.c.name)}<small>${esc(x.c.dept)} · ${LV(x.c.lv)}</small></span>
              <span class="bd"><i class="bi bi-people-fill"></i> ${x.c.students}</span>
              <span class="rm">${x.ext ? '<small>قاعاته من القسم المختص</small>' : ''}${x.rooms.map(r => `<i class="bi bi-door-open"></i> ${esc(r.room)} <small>(${r.n})</small>`).join(' ')}${x.left ? ` <span class="text-danger">+${x.left} بلا مقعد</span>` : ''}</span></div>`).join('') || '<span class="none">—</span>'}</div></div>`; }).join('')}
        ${list.length < all.length ? `<div class="more">+${all.length - list.length} خارج التصفية</div>` : ''}</section>`; }).join('')}</div>`;
  }
  let sortK = 's', sortD = 1;
  function listView(st) {
    const rooms = {}; Object.values(st.seat.out).flat().forEach(x => { rooms[x.c.i] = x; });
    const cols = [['s', 'الموعد'], ['code', 'الرمز'], ['name', 'المقرر'], ['dept', 'القسم'], ['lv', 'السنة'], ['students', 'الطلبة'], ['secs', 'الشعب']];
    const list = C.filter(match).sort((a, b) => { const x = a[sortK], y = b[sortK]; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ar')) * sortD || a.s - b.s; });
    const opts = c => `<option value="-1">— غير مجدول —</option>` + DAYS.map((d, di) => `<optgroup label="${esc(d.label)}">${S.periods.map((p, k) => { const s = di * P + k; return `<option value="${s}" ${c.s === s ? 'selected' : ''}>${esc(d.wd)} ${+d.iso.slice(8)}/${+d.iso.slice(5, 7)} · ${p[0]}</option>`; }).join('')}</optgroup>`).join('');
    return `<div class="table-responsive ex-tbl"><table class="table align-middle"><thead><tr>${cols.map(([k, t]) => `<th data-sort="${k}" class="sortable">${t} ${sortK === k ? `<i class="bi bi-caret-${sortD > 0 ? 'up' : 'down'}-fill"></i>` : ''}</th>`).join('')}<th>القاعات</th><th>المدرسون</th><th>الحالة</th><th>نقل إلى</th></tr></thead>
      <tbody>${list.map(c => { const x = rooms[c.i]; return `<tr class="${PROB.has(c.i) ? 'bad' : ''}"><td><span class="ex-when">${esc(slotLabel(c.s))}</span></td><td><span class="ex-code" style="--c:${c.col[0]};--b:${c.col[1]}">${esc(c.code)}</span></td><td><b>${esc(c.name)}</b></td>
        <td>${esc(c.dept)}</td><td><span class="bdg">${LV(c.lv)}</span></td><td><span class="bdg blue"><i class="bi bi-people-fill"></i> ${c.students}</span></td><td>${c.secs}</td>
        <td class="small">${x ? (x.ext ? 'القسم المختص' : x.rooms.map(r => `${esc(r.room)} (${r.n})`).join('، ')) : '—'}</td><td class="small">${esc(c.ins.map(U.shortName).join('، '))}</td>
        <td>${PROB.has(c.i) ? '<span class="bdg red"><i class="bi bi-exclamation-triangle-fill"></i> ملاحظة</span>' : '<span class="bdg green"><i class="bi bi-check2"></i> سليم</span>'}${c.pin != null ? ' <span class="bdg"><i class="bi bi-pin-angle-fill"></i> مثبّت</span>' : ''}</td>
        <td><select class="form-select form-select-sm" data-mv="${c.i}">${opts(c)}</select></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function cohortView() {
    const cs = G.filter(g => g.kind === 'cohort' && g.c.some(i => match(C[i])));
    return `<p class="ex-note"><i class="bi bi-info-circle-fill"></i> كل صف تخصص وسنة دراسية: امتحاناته موزعة على الأيام. <span class="bdg red">أحمر</span> = تعارض في الفترة نفسها، <span class="bdg amber">برتقالي</span> = أكثر من ${S.maxDay} في اليوم.</p>
      <div class="ex-grid-wrap"><table class="ex-mx${F().names ? ' named' : ''}"><thead><tr><th>التخصص · السنة</th>${DAYS.map(d => `<th>${esc(d.wd)}<small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>`).join('')}<th>المجموع</th></tr></thead><tbody>
      ${cs.map(g => `<tr><th class="rh">${esc(g.name)}</th>${DAYS.map((d, di) => { const xs = g.c.filter(i => C[i].s >= 0 && dayOf(C[i].s) === di), per = {}; xs.forEach(i => { per[C[i].s] = (per[C[i].s] || 0) + 1; });
        const cl = Object.values(per).some(n => n > 1) ? 'clash' : xs.length > S.maxDay ? 'over' : xs.length ? 'ok' : '';
        return `<td class="${cl}">${xs.sort((a, b) => C[a].s - C[b].s).map(i => `<span class="ex-code sm" data-go="${i}" style="--c:${C[i].col[0]};--b:${C[i].col[1]}" title="${esc(C[i].name)} · ${esc(slotLabel(C[i].s))}">${esc(C[i].code)}<sub><bdi>ف${C[i].s % P + 1}</bdi></sub>${F().names ? `<small>${esc(C[i].name)}</small>` : ''}</span>`).join('')}</td>`; }).join('')}
        <td class="tot">${g.c.length}</td></tr>`).join('') || `<tr><td colspan="${DAYS.length + 2}">لا توجد تخصصات ضمن التصفية</td></tr>`}</tbody></table></div>`;
  }
  function deptView() {
    const ds = [...new Set(C.filter(match).map(c => c.dept))].sort();
    return `<div class="ex-grid-wrap"><table class="ex-mx${F().names ? ' named' : ''}"><thead><tr><th>القسم</th>${DAYS.map(d => `<th>${esc(d.wd)}<small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>`).join('')}<th>المجموع</th></tr></thead><tbody>
      ${ds.map(dp => { const mine = C.filter(c => c.dept === dp && match(c)); return `<tr><th class="rh">${esc(dp)}</th>${DAYS.map((d, di) => { const xs = mine.filter(c => c.s >= 0 && dayOf(c.s) === di);
        return `<td class="${xs.length ? 'ok' : ''}">${xs.sort((a, b) => a.s - b.s).map(c => `<span class="ex-code sm" data-go="${c.i}" style="--c:${c.col[0]};--b:${c.col[1]}" title="${esc(c.name)} · ${c.students} طالب · ${esc(slotLabel(c.s))}">${esc(c.code)}<sub><bdi>ف${c.s % P + 1}</bdi></sub>${F().names ? `<small>${esc(c.name)}</small>` : ''}</span>`).join('')}</td>`; }).join('')}
        <td class="tot">${mine.length}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function checkView(st) {
    // one row of compact indicators (red = must fix, amber = to review, green = fine)
    const k = (n, t, ic, soft) => `<div class="ex-qk ${n ? (soft ? 'warn' : 'bad') : 'ok'}" title="${esc(t)}"><i class="bi ${ic}"></i><b>${n}</b><span>${t}</span></div>`;
    const loads = Object.values(st.seat.load).filter(Boolean), mx = Math.max(0, ...loads), mn = loads.length ? Math.min(...loads) : 0;
    const need = C.reduce((x, c) => x + c.students, 0), have = CAP.reduce((x, n) => x + n, 0), full = NS * capTotal;
    const tips = [
      st.unseated ? `<li><i class="bi bi-door-closed"></i> <span>المقاعد في كل الفترات <b>${have.toLocaleString('en-US')}</b>${S.busy && have < full ? ` (من ${full.toLocaleString('en-US')} لولا المحاضرات القائمة)` : ''} مقابل <b>${need.toLocaleString('en-US')}</b> مطلوباً: زد الأيام أو الفترات، أو أضف قاعات أو ارفع سعتها${S.busy ? '، أو ألغِ «مراعاة المحاضرات القائمة» إن كانت المحاضرات معلّقة' : ''}.</span></li>` : '',
      st.short ? '<li><i class="bi bi-person-dash"></i> <span>لنقص المراقبين: أضف مراقبين إضافيين في «الإعداد ← المراقبون» أو ارفع حد المراقبات اليومي.</span></li>' : '',
      (b => b.length ? `<li><i class="bi bi-building-exclamation"></i> <span><b>${b.length}</b> جلسة امتحان في قاعات كليات أخرى (${[...new Set(b.map(r => r.room))].map(esc).join('، ')}): نسّق حجزها مع ${[...new Set(b.map(r => r.borrow))].map(esc).join('، ')}.</span></li>` : '')(Object.values(st.seat.out).flat().flatMap(x => x.rooms.filter(r => r.borrow))),
      S.src === 'plans' || !S.reg ? '<li><i class="bi bi-info-circle"></i> <span>تعارض الطلبة مقدّر من الخطط الدراسية (التخصص × السنة)؛ لنتيجة دقيقة لكل طالب ارفع كشف التسجيل من «الإعداد».</span></li>' : ''].filter(Boolean);
    return `<div class="ex-qrow">${k(st.clash, 'تعارض إلزامي', 'bi-x-octagon')}${k(st.unseated, 'طالب بلا مقعد', 'bi-door-closed')}${k(st.ins, 'تعارض مدرّس', 'bi-person-x', 1)}
      ${k(st.day, `يوم بأكثر من ${S.maxDay} امتحان`, 'bi-calendar-x', 1)}${k(st.b2b, 'امتحانان متتاليان', 'bi-arrow-left-right', 1)}${k(st.soft, 'تعارض محتمل', 'bi-question-circle', 1)}
      ${k(st.short, 'نقص مراقبين', 'bi-person-dash', 1)}<div class="ex-qk info" title="مراقبات لكل مدرّس"><i class="bi bi-person-badge"></i><b>${mn}–${mx}</b><span>مراقبات لكل مدرّس</span></div>
      ${st.reg ? `${k(st.stuClash, 'طالب لديه تعارض', 'bi-people')}${k(st.stuDay, `طالب بأكثر من ${S.maxDay} في اليوم`, 'bi-people', 1)}` : ''}</div>
      ${tips.length ? `<ul class="ex-qtips">${tips.join('')}</ul>` : ''}
      ${(() => { const rep = report(st); if (!rep.length) return ''; repCache = rep;
        const types = [...new Set(rep.map(r => r.k))], f = repFilter && types.includes(repFilter) ? repFilter : '';
        const list = rep.filter(r => !f || r.k === f);
        return `<section class="ex-qrep"><div class="ex-rephead"><h6 class="m-0"><i class="bi bi-list-check"></i> الملاحظات <span class="ex-n ${st.clash ? 'bad' : ''}">${rep.length}</span></h6>
          <div class="ex-rtabs" role="tablist"><button class="${f ? '' : 'on'}" data-rf="">الكل <em>${rep.length}</em></button>${types.map(k => `<button class="${f === k ? 'on' : ''}" data-rf="${k}"><i class="bi ${KIND[k][2]}"></i> ${KIND[k][1]} <em>${rep.filter(r => r.k === k).length}</em></button>`).join('')}</div>
          <span class="ex-racts">${rep.some(r => r.fix) ? '<button class="btn btn-sm btn-ex" id="ex-fixall"><i class="bi bi-magic"></i> طبّق كل الحلول</button>' : ''}<button class="btn btn-sm btn-outline-secondary" id="ex-rprint" title="طباعة التقرير"><i class="bi bi-printer"></i></button><button class="btn btn-sm btn-outline-secondary" id="ex-rxlsx" title="Excel"><i class="bi bi-file-earmark-excel"></i></button></span></div>
          <div class="table-responsive ex-rtw"><table class="ex-rtbl ex-rt2"><thead><tr><th>الملاحظة</th><th>الموعد</th><th>المقررات</th><th>السبب</th><th>الحل المقترح</th></tr></thead><tbody>
          ${list.map(r => `<tr class="sev${SEV[r.sev]}">
            <td class="ty"><span class="ex-sevb sev${SEV[r.sev]}">${esc(r.sev)}</span><b><i class="bi ${KIND[r.k][2]}"></i> ${KIND[r.k][1]}</b>${r.k !== 'ins' && r.n ? `<span class="n">${r.exact ? r.n : 'حتى ' + r.n} ${r.n === 1 ? 'طالب' : 'طالباً'}${r.exact ? '' : ' (تقدير)'}</span>` : ''}</td>
            <td class="wh">${esc(r.when).replace(' · ', '<br>')}</td>
            <td class="cs">${r.cs.map(i => `<div class="ex-cc" style="--c:${C[i].col[0]}" title="${esc(C[i].dept + ' · ' + (C[i].ins.map(U.shortName).join('، ') || '—'))}"><b dir="ltr">${esc(C[i].code)}</b><span>${esc(C[i].name)}</span><em>${C[i].students} طالباً</em></div>`).join('')}</td>
            <td class="why"><div>${esc(r.why)}</div>${r.who.length ? `<div class="who"><span class="lb">${r.k === 'short' ? 'القاعات' : r.k === 'ins' ? 'المدرّس' : 'الطلبة'}:</span>${r.who.map(w => `<span class="wc">${esc(String(w).replace(/^القاعة\s*/, ''))}</span>`).join('')}</div>` : ''}</td>
            <td class="act">${r.fix ? `<div class="fx">${esc(fixTxt(r.fix))}</div><button class="btn btn-sm btn-ex" data-fix="${r.fix.i},${r.fix.s}"><i class="bi bi-magic"></i> تطبيق</button>`
              : `<div class="nofx">${r.k === 'short' ? 'أضف مراقبين أو ارفع حد المراقبات اليومي' : 'لا يوجد نقل أفضل؛ زد الأيام أو الفترات أو القاعات'}</div>`}
              <button class="btn btn-sm btn-outline-secondary" data-go="${r.cs[0]}"><i class="bi bi-box-arrow-up-left"></i> عرض في الجدول</button></td></tr>`).join('')}</tbody></table></div></section>`; })()}
      ${!st.is.length && !st.unseated ? '<div class="ex-empty"><i class="bi bi-patch-check-fill"></i> الجدول نظيف: لا تعارض ولا ضغط زائد ولا نقص مقاعد.</div>' : ''}`;
  }
  // ---------- outputs ----------
  const OUT = { all: 'الجدول الكامل', day: 'حسب اليوم', dept: 'حسب القسم', cohort: 'حسب التخصص والسنة (للطلبة)', ins: 'حسب المدرّس (امتحانات ومراقبات)', room: 'حسب القاعة' };
  function outData() {
    const { out } = seating(), rows = [];
    for (let s = 0; s < NS; s++) (out[s] || []).forEach(x => { if (match(x.c)) rows.push({ s, c: x.c, rooms: x.rooms, left: x.left }); });
    rows.sort((a, b) => a.s - b.s || a.c.code.localeCompare(b.c.code));
    const d = r => DAYS[dayOf(r.s)], tm = r => `${S.periods[r.s % P][0]}–${S.periods[r.s % P][1]}`;
    const base = r => [d(r).wd, d(r).iso, tm(r), r.c.code, r.c.name];
    const rm = r => r.rooms.map(x => `${x.room}${x.t === LAB ? ' (مختبر)' : ''}: ${x.n} طالب${x.secs && x.secs.length && r.c.sl.length > 1 ? ' – شعبة ' + x.secs.join(' و') : ''}`).join(' ؛ ') + (r.left ? ` ؛ ${r.left} بلا قاعة` : '');
    const pr = r => { const t = [...new Set(r.rooms.flatMap(x => x.proc))].map(U.shortName).join('، '), m = r.rooms.reduce((a, x) => a + Math.max(0, (x.need || 1) - x.proc.length), 0); return m ? (t ? t + '، ' : '') + `⚠ ينقص ${m === 1 ? 'مراقب' : m + ' مراقبين'}` : t; };
    const H = ['اليوم', 'التاريخ', 'الوقت', 'الرمز', 'المقرر'];
    const sec = (title, columns, list) => ({ title, columns, rows: list });
    // each room with its students, sections and proctors (one line per room: clear on paper and in Excel)
    const miss = x => Math.max(0, (x.need || 1) - x.proc.length);
    const rp = r => r.rooms.map(x => `${x.room}${x.t === LAB ? ' (مختبر)' : ''}: ${x.n} طالب${x.secs && x.secs.length && r.c.sl.length > 1 ? ' – شعبة ' + x.secs.join(' و') : ''} — المراقبة: ${x.proc.map(U.shortName).join('، ') || '—'}${miss(x) ? ` (⚠ ينقص ${miss(x) === 1 ? 'مراقب' : miss(x) + ' مراقبين'})` : ''}`).join(' ؛ ')
      + (r.left ? ` ؛ ${r.left} بلا قاعة` : '') + (!r.rooms.length && EXT(r.c) ? `يعقده ${REQ(r.c).fixedBy || 'القسم المختص'}` : '');
    const withM = (row, r) => { row.meta = r; return row; };
    if (outView === 'all') return [sec('', H.concat(['القسم', 'الطلبة', 'القاعات والمراقبون']), rows.map(r => withM(base(r).concat([r.c.dept, r.c.students, rp(r)]), r)))];
    if (outView === 'day') return DAYS.map((dd, di) => sec(`${dd.wd} ${dd.iso}`, ['الوقت', 'الرمز', 'المقرر', 'القسم', 'الطلبة', 'القاعات والمراقبون'], rows.filter(r => dayOf(r.s) === di).map(r => withM([tm(r), r.c.code, r.c.name, r.c.dept, r.c.students, rp(r)], r)))).filter(x => x.rows.length);
    if (outView === 'dept') return [...new Set(rows.map(r => r.c.dept))].sort().map(dp => sec(dp, H.concat(['المدرسون', 'الطلبة', 'القاعات']), rows.filter(r => r.c.dept === dp).map(r => base(r).concat([r.c.ins.map(U.shortName).join('، '), r.c.students, rm(r)]))));
    if (outView === 'cohort') return G.filter(g => g.kind === 'cohort').map(g => sec(g.name, H, rows.filter(r => g.c.includes(r.c.i)).map(base))).filter(x => x.rows.length);
    if (outView === 'room') {
      const byR = {}; rows.forEach(r => r.rooms.forEach(x => (byR[x.room] = byR[x.room] || []).push([d(r).wd, d(r).iso, tm(r), r.c.code, r.c.name, (x.secs || []).join('، '), x.n, x.proc.map(U.shortName).join('، ') + (x.proc.length < (x.need || 1) ? `${x.proc.length ? '، ' : ''}⚠ ينقص ${(x.need || 1) - x.proc.length === 1 ? 'مراقب' : (x.need || 1) - x.proc.length + ' مراقبين'}` : '')])));
      return Object.keys(byR).sort().map(k => sec(`القاعة ${k}`, H.concat(['الشعب', 'الطلبة في القاعة', 'المراقبون']), byR[k]));
    }
    const byI = {};
    rows.forEach(r => {
      r.c.ins.forEach(n => (byI[n] = byI[n] || []).push(base(r).concat(['امتحان مقرره', rm(r)])));
      r.rooms.forEach(x => x.proc.forEach(n => { if (!r.c.ins.includes(n)) (byI[n] = byI[n] || []).push(base(r).concat(['مراقبة', `${x.room} (${x.n})`])); }));
    });
    return Object.keys(byI).sort((a, b) => U.shortName(a).localeCompare(U.shortName(b), 'ar')).map(n => sec(U.shortName(n), H.concat(['المهمة', 'القاعة']), byI[n].sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]))));
  }
  // for paper and Excel: the «القاعات والمراقبون» column becomes one row per room (القاعة، طلبتها، الشعبة، المراقبون); the
  // course's cells are on its first room row (rows.span = how many rows the course takes, for merging)
  function expandRooms(sec) {
    const j = sec.columns.indexOf('القاعات والمراقبون'); if (j < 0) return sec;
    const columns = sec.columns.slice(0, j).concat(['القاعة', 'طلبة القاعة', 'الشعبة', 'المراقبون'], sec.columns.slice(j + 1)), rows = [];
    sec.rows.forEach(row => { const r = row.meta, head = row.slice(0, j), tail = row.slice(j + 1);
      const subs = r && r.rooms.length ? r.rooms.map(x => { const m = Math.max(0, (x.need || 1) - x.proc.length);
        return [x.room + (x.t === LAB ? ' (مختبر)' : ''), x.n, x.secs && x.secs.length && r.c.sl.length > 1 ? x.secs.join('، ') : '', x.proc.map(U.shortName).join('، ') + (m ? `${x.proc.length ? '، ' : ''}⚠ ينقص ${m === 1 ? 'مراقب' : m + ' مراقبين'}` : '')]; }) : [[row[j] || '—', '', '', '']];
      if (r && r.left) subs.push([`${r.left} طالباً بلا قاعة`, '', '', '']);
      subs.forEach((x, k) => { const nr = (k ? head.map(() => '') : head).concat(x, k ? tail.map(() => '') : tail); nr.span = k ? 0 : subs.length; nr.first = !k; rows.push(nr); }); });
    return { title: sec.title, columns, rows, expanded: true, nhead: j, ntail: sec.columns.length - j - 1 };
  }
  const OUTIC = { all: 'bi-table', day: 'bi-calendar-week', dept: 'bi-diagram-3', cohort: 'bi-mortarboard', ins: 'bi-person-badge', room: 'bi-door-open' };
  // on screen, the plain cells of the reports become clear chips and badges (print and Excel keep the text)
  const COLS = { 'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'الرمز': 'code', 'المقرر': 'name', 'القسم': 'dept', 'الطلبة': 'num', 'الطلبة في القاعة': 'num', 'الشعب': 'secs',
    'القاعات': 'rooms', 'القاعة': 'rooms', 'القاعات والمراقبون': 'rp', 'المراقبون': 'ppl', 'المدرسون': 'ppl', 'المهمة': 'task' };
  const colCls = h => COLS[h] || 'txt';
  const dayKey = (cols, r) => { const j = cols.indexOf('التاريخ'); return j < 0 ? '' : r[j]; };
  function cellHtml(h, v, row) {
    const k = colCls(h), s = String(v == null ? '' : v);
    if (k === 'rp' && row && row.meta) { const r = row.meta;
      if (!r.rooms.length) return `<span class="ex-rpx">${esc(s || '—')}</span>`;
      return `<div class="ex-rp">${r.rooms.map(x => { const m = Math.max(0, (x.need || 1) - x.proc.length);
        return `<div class="l"><span class="rm"><i class="bi ${x.t === LAB ? 'bi-pc-display' : 'bi-door-open-fill'}"></i><b>${esc(x.room)}</b></span><span class="n">${x.n} طالباً</span><span class="sc">${x.secs && x.secs.length && r.c.sl.length > 1 ? 'ش ' + esc(x.secs.join('، ')) : ''}</span>
          <span class="pp">${x.proc.map(n => `<span class="ex-pp${r.c.ins.includes(n) ? ' own' : ''}"><i class="bi bi-person-fill"></i> ${esc(U.shortName(n))}</span>`).join('')}${m ? `<span class="ex-pp miss"><i class="bi bi-exclamation-triangle-fill"></i> ${x.proc.length ? 'ينقص ' + m : 'بلا مراقب'}</span>` : ''}</span></div>`; }).join('')}${r.left ? `<div class="l bad">${r.left} طالباً بلا قاعة</div>` : ''}</div>`; }
    if (!s) return '<span class="text-muted">—</span>';
    if (k === 'date') return `<span class="ex-dt">${+s.slice(8)}/${+s.slice(5, 7)}<small>${s.slice(0, 4)}</small></span>`;
    if (k === 'day') return `<b class="ex-dw">${esc(s)}</b>`;
    if (k === 'time') return `<span class="ex-tm" dir="ltr"><i class="bi bi-clock"></i> ${esc(s.replace('–', ' – '))}</span>`;
    if (k === 'code') { const c = BY[s]; return `<span class="ex-code" ${c ? `style="--c:${c.col[0]};--b:${c.col[1]}"` : ''}>${esc(s)}</span>`; }
    if (k === 'name') return `<b class="ex-nm">${esc(s)}</b>`;
    if (k === 'num') return `<span class="bdg blue"><i class="bi bi-people-fill"></i> ${esc(s)}</span>`;
    if (k === 'rooms') return `<div class="ex-chips">${s.split(/\s*؛\s*/).map(x => { const m = x.match(/^(.+?):\s*(\d+) طالب(?:\s*–\s*(.+))?$/);
      return m ? `<span class="ex-rm"><i class="bi bi-door-open-fill"></i> <b>${esc(m[1])}</b><span class="n">${m[2]}</span>${m[3] ? `<small>${esc(m[3])}</small>` : ''}</span>` : `<span class="ex-rm ${/بلا قاعة/.test(x) ? 'bad' : ''}">${esc(x)}</span>`; }).join('')}</div>`;
    if (k === 'ppl') return `<div class="ex-chips">${s.split(/\s*،\s*/).filter(Boolean).map(n => /^⚠/.test(n) ? `<span class="ex-pp miss"><i class="bi bi-exclamation-triangle-fill"></i> ${esc(n.replace(/^⚠\s*/, ''))}</span>` : `<span class="ex-pp"><i class="bi bi-person-fill"></i> ${esc(n)}</span>`).join('')}</div>`;
    if (k === 'task') return s === 'مراقبة' ? '<span class="bdg amber"><i class="bi bi-eye-fill"></i> مراقبة</span>' : '<span class="bdg green"><i class="bi bi-journal-check"></i> امتحان مقرره</span>';
    return esc(s);
  }
  function outView_() {
    const secs = outData(), n = secs.reduce((a, s) => a + s.rows.length, 0);
    return `${versBar()}<div class="ex-outbar"><div class="ex-views">${Object.entries(OUT).map(([k, t]) => `<button class="ex-vbtn${outView === k ? ' on' : ''}" data-ov="${k}"><i class="bi ${OUTIC[k]}"></i> ${t}</button>`).join('')}</div>
      <div class="ex-acts"><button class="btn btn-ex" id="ex-print" title="الطباعة والتصدير تأخذ العرض والتصفية الحاليين؛ في Excel كل جدول في ورقة"><i class="bi bi-printer-fill"></i> طباعة / PDF</button><button class="btn btn-success" id="ex-xlsx"><i class="bi bi-file-earmark-excel-fill"></i> Excel</button>
      <button class="btn btn-outline-secondary" id="ex-csv" title="ملف بيانات خام لنظام آخر (بلا تنسيق ولا عرض أعمدة). للقراءة والطباعة استخدم Excel."><i class="bi bi-filetype-csv"></i> CSV</button></div></div>
      <div class="ex-o2">${pubPanel()}
      <div class="ex-docs"><b><i class="bi bi-folder2-open"></i> كشوف ومستندات</b>
        <button class="btn btn-outline-primary" id="ex-plists"><i class="bi bi-people-fill"></i> قوائم الطلبة لكل قاعة <small>QR</small></button>
        <button class="btn btn-outline-primary" id="ex-psheets"><i class="bi bi-person-badge-fill"></i> كشف كل مراقب <small>QR</small></button>
        <button class="btn btn-outline-primary" id="ex-prep"><i class="bi bi-clipboard-data-fill"></i> تقرير المراقبات</button>
        <input type="file" id="ex-reg2" accept=".xls,.xlsx,.csv,.htm,.html" hidden>
        <small class="text-muted">تأخذ التصفية الحالية. ${REGMEM ? `أسماء الطلبة من ${esc(REGMEM.file)} (في هذه الصفحة فقط).` : 'قوائم الطلبة تحتاج كشف التسجيل؛ يُطلب رفعه ولا يُحفظ.'}</small></div></div>
      ${filterBar()}

      ${secs.map(s => `${s.title ? `<h5 class="ex-h"><i class="bi ${OUTIC[outView]}"></i> ${esc(s.title)} <span class="ex-n">${s.rows.length}</span></h5>` : ''}<div class="table-responsive ex-tbl"><table class="table table-striped align-middle"><thead><tr>${s.columns.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map((r, k) => `<tr class="${k && dayKey(s.columns, r) !== dayKey(s.columns, s.rows[k - 1]) ? 'nd' : ''}">${r.map((v, j) => `<td class="c-${colCls(s.columns[j])}">${cellHtml(s.columns[j], v, r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.columns.length}" class="text-muted">لا شيء</td></tr>`}</tbody></table></div>`).join('')}`;
  }
  const title = () => (S.label || TYPES[S.type].name) + ' – ' + facLabel();
  function doPrint() {
    const st = stats();
    window.printReport({ title: title(), subtitle: `${OUT[outView]} · ${TT.term}`, orientation: 'landscape', fit: false,
      filters: [['الفترة', DAYS.length ? `${DAYS[0].label} – ${DAYS[DAYS.length - 1].label}` : '—'], ['الحالة', S.approved ? 'معتمدة: ' + S.approved : 'مسودة']],
      stats: [['مقرراً', C.length], ['مقعد امتحان', C.reduce((a, c) => a + c.students, 0)], ['يوماً', DAYS.length], ['تعارض', st.clash]],
      sections: outData().map(expandRooms), note: 'أُعدّ الجدول بأداة «جدول الامتحانات» في بوصلة البترا؛ القاعات والمراقبون مقترحة وتُعتمد من لجنة الامتحانات.', qr: false });
  }
  const loadXLSX = () => window.XLSX ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  // Excel: a cover/matrix sheet (days × periods) and one sheet per table, laid out like an official timetable
  function doXLSX() {
    loadXLSX().then(() => {
      const wb = XLSX.utils.book_new(), used = {}, E = XLSX.utils.encode_cell;
      const B = { style: 'thin', color: { rgb: 'C9D2D8' } }, BOX = { top: B, bottom: B, left: B, right: B };
      const ST = {
        title: { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '901D23' } }, alignment: { horizontal: 'center', vertical: 'center' } },
        sub: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '091B22' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
        info: { font: { sz: 10, color: { rgb: '4A5A62' } }, alignment: { horizontal: 'center', vertical: 'center' } },
        head: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0B4A66' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BOX },
        band: { font: { bold: true, sz: 12, color: { rgb: '901D23' } }, fill: { fgColor: { rgb: 'F6E7E8' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
        day: { font: { bold: true, sz: 11, color: { rgb: '091B22' } }, fill: { fgColor: { rgb: 'EEF2F4' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BOX },
        note: { font: { italic: true, sz: 9, color: { rgb: '6B7A82' } }, alignment: { horizontal: 'right', wrapText: true } } };
      const cell = (zebra, center, bold) => ({ font: { sz: 10.5, bold: !!bold, color: { rgb: '1C2B31' } }, fill: { fgColor: { rgb: zebra ? 'F7F9FA' : 'FFFFFF' } },
        alignment: { horizontal: center ? 'center' : 'right', vertical: 'center', wrapText: true }, border: BOX });
      const W = { 'اليوم': 11, 'التاريخ': 12, 'الوقت': 13, 'الرمز': 11, 'المقرر': 38, 'القسم': 24, 'الطلبة': 9, 'الطلبة في القاعة': 10, 'الشعب': 12, 'القاعات': 34, 'القاعات والمراقبون': 70, 'طلبة القاعة': 10, 'الشعبة': 12, 'القاعة': 20, 'المراقبون': 34, 'المدرسون': 30, 'المهمة': 13 };
      const CENTER = new Set(['اليوم', 'التاريخ', 'الوقت', 'الرمز', 'الطلبة', 'الطلبة في القاعة', 'الشعب', 'المهمة', 'القاعة', 'طلبة القاعة', 'الشعبة']);
      const span = DAYS.length ? `${DAYS[0].label} – ${DAYS[DAYS.length - 1].label}` : '';
      const info = `${TT.term || ''} · ${span} · ${S.approved ? 'معتمدة: ' + S.approved : 'مسودة'} · أُعدّ في ${new Date().toLocaleDateString('ar-JO')}`;
      const sheetName = t => { let n = String(t).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'ورقة'; let k = 2; const b0 = n; while (used[n]) n = b0.slice(0, 25) + ' ' + k++; used[n] = 1; return n; };
      const header = (ws, aoa, ncol, sub) => { aoa.push([title()], [sub], [info], []); ws.merges.push(...[0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: ncol - 1 } }))); ws.rows.push({ hpt: 30 }, { hpt: 22 }, { hpt: 18 }, { hpt: 6 }); };
      const finish = (ws, aoa, styles, cols, name) => {
        const sh = XLSX.utils.aoa_to_sheet(aoa); sh['!merges'] = ws.merges; sh['!rows'] = ws.rows; sh['!cols'] = cols; sh['!views'] = [{ RTL: true }];
        sh['!margins'] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
        Object.entries(styles).forEach(([a, st]) => { if (!sh[a]) sh[a] = { t: 's', v: '' }; sh[a].s = st; });
        ['A1', 'A2', 'A3'].forEach((a, i) => { if (sh[a]) sh[a].s = [ST.title, ST.sub, ST.info][i]; });
        XLSX.utils.book_append_sheet(wb, sh, sheetName(name));
      };
      // 1) the timetable at a glance: one row per day, one column per period
      { const { out } = seating(), aoa = [], ws = { merges: [], rows: [] }, styles = {}, nc = P + 1;
        header(ws, aoa, nc, 'الجدول العام: الأيام × الفترات');
        aoa.push(['اليوم'].concat(S.periods.map((p, k) => `الفترة ${k + 1}\n${p[0]} – ${p[1]}`))); ws.rows.push({ hpt: 34 });
        for (let j = 0; j < nc; j++) styles[E({ r: 4, c: j })] = ST.head;
        DAYS.forEach((d, di) => {
          const r = aoa.length, cells = S.periods.map((p, k) => (out[di * P + k] || []).filter(x => match(x.c)).sort((a, b) => a.c.code.localeCompare(b.c.code))
            .map(x => `${x.c.code}  ${x.c.name}  (${x.c.students})`));
          aoa.push([`${d.wd}\n${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}/${d.iso.slice(0, 4)}`].concat(cells.map(c => c.join('\n'))));
          ws.rows.push({ hpt: Math.max(36, 15 * Math.max(1, ...cells.map(c => c.length)) + 6) });
          styles[E({ r, c: 0 })] = ST.day; for (let k = 0; k < P; k++) styles[E({ r, c: k + 1 })] = cell(di % 2, false);
        });
        aoa.push([], ['الرقم بين القوسين عدد الطلبة. القاعات والمراقبون في الأوراق التالية.']); ws.merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: nc - 1 } }); styles[E({ r: aoa.length - 1, c: 0 })] = ST.note;
        finish(ws, aoa, styles, [{ wch: 13 }].concat(S.periods.map(() => ({ wch: P > 3 ? 40 : 52 }))), 'الجدول العام'); }
      // 2) the current output view: one sheet per table, a coloured band for each new day
      outData().map(expandRooms).forEach(sec => {
        const cols = sec.columns, nc = cols.length, aoa = [], ws = { merges: [], rows: [] }, styles = {}, jd = cols.indexOf('التاريخ'), jw = cols.indexOf('اليوم');
        header(ws, aoa, nc, OUT[outView] + (sec.title ? ' · ' + sec.title : ''));
        aoa.push(cols.slice()); ws.rows.push({ hpt: 26 }); cols.forEach((h, j) => { styles[E({ r: 4, c: j })] = ST.head; });
        let last = null, z = 0;
        sec.rows.forEach(row => {
          const dk = jd >= 0 ? row[jd] : null;
          if (dk && dk !== last && outView !== 'day' && row.first !== false) { const r = aoa.length; aoa.push([`${jw >= 0 ? row[jw] + ' ' : ''}${+dk.slice(8)}/${+dk.slice(5, 7)}/${dk.slice(0, 4)}`]); ws.merges.push({ s: { r, c: 0 }, e: { r, c: nc - 1 } }); ws.rows.push({ hpt: 20 });
            for (let j = 0; j < nc; j++) styles[E({ r, c: j })] = ST.band; z = 0; }
          if (row.first !== false) last = dk;
          const r = aoa.length;
          // a course over several room rows: its own cells merged down
          if (sec.expanded && row.span > 1) cols.forEach((h, j) => { if (j < sec.nhead || j >= cols.length - sec.ntail) ws.merges.push({ s: { r, c: j }, e: { r: r + row.span - 1, c: j } }); });
          const vals = row.map((v, j) => cols[j] === 'القاعات' ? String(v ?? '').split(/\s*؛\s*/).join('\n') : cols[j] === 'المراقبون' || cols[j] === 'المدرسون' ? String(v ?? '').split(/\s*،\s*/).join('\n') : v);
          aoa.push(vals); const lines = Math.max(1, ...vals.map(v => String(v ?? '').split('\n').length)); ws.rows.push({ hpt: Math.max(20, 14 * lines + 4) });
          if (row.first !== false) z++;   // (the rooms of one course share its shade)
          cols.forEach((h, j) => { styles[E({ r, c: j })] = cell(z % 2, CENTER.has(h), h === 'الرمز' || h === 'المقرر' || h === 'القاعة'); });
        });
        if (!sec.rows.length) { aoa.push(['لا شيء']); }
        aoa.push([], ['أُعدّ الجدول بأداة «جدول الامتحانات» في بوصلة البترا؛ القاعات والمراقبون مقترحة وتُعتمد من لجنة الامتحانات.']);
        ws.merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: nc - 1 } }); styles[E({ r: aoa.length - 1, c: 0 })] = ST.note;
        finish(ws, aoa, styles, cols.map(h => ({ wch: W[h] || 16 })), sec.title || OUT[outView]);
      });
      XLSX.writeFile(wb, `${title()}_${OUT[outView]}.xlsx`.replace(/\s+/g, '_'));
    }).catch(e => { console.error(e); alert('تعذّر تحميل مكتبة Excel؛ تحقق من الاتصال.'); });
  }
  // ---------- documents: student lists, proctor sheets, proctor report, publishing ----------
  let WANT = null;
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const qrSvg = (url, cell) => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: cell || 3, margin: 0, scalable: true }); } catch (e) { return ''; } };
  const dLong = iso => { const d = new Date(iso + 'T12:00:00Z'); return `${WD[d.getUTCDay()]} ${+iso.slice(8)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`; };
  const slotInfo = s => { const d = DAYS[dayOf(s)], p = S.periods[s % P]; return { d, p, date: dLong(d.iso), time: `${p[0]} – ${p[1]}` }; };
  // printable A4 documents, each sheet on its own page, with the university header and a QR code
  function printDocs(sheets, docTitle, orient) {
    const css = `@page { size: A4 ${orient || 'portrait'}; margin: 11mm 11mm 13mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { margin: 0; font-family: Tajawal, 'Segoe UI', Tahoma, sans-serif; color: #1c2b31; font-size: 10.5pt; direction: rtl; }
      .sh { break-after: page; } .sh:last-child { break-after: auto; }
      .hd { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #901d23; padding-bottom: 8px; } .hd img { height: 52px; } .hd .t { flex: 1; } .hd small { color: #1f2a30; font-size: 8.5pt; display: block; }
      .hd h1 { margin: 2px 0 0; font-size: 16pt; color: #091b22; } .hd h2 { margin: 2px 0 0; font-size: 10.5pt; color: #901d23; }
      .qr { text-align: center; } .qr svg { width: 78px; height: 78px; display: block; margin: auto; } .qr span { display: block; font-size: 7pt; color: #901d23; font-weight: 700; margin-top: 2px; }
      .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; } .info div { border: 1px solid #e3dccb; border-top: 3px solid #091b22; border-radius: 7px; padding: 5px 8px; }
      .info span { display: block; font-size: 8pt; color: #1f2a30; } .info b { font-size: 11pt; color: #091b22; } .info .w2 { grid-column: span 2; } .info .w4 { grid-column: span 4; }
      table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; } th { background: #091b22; color: #fff; font-size: 9pt; padding: 5px; border: 1px solid #091b22; }
      td { border: 1px solid #d9dfe3; padding: 4px 6px; font-size: 9.5pt; height: 22px; } tbody tr:nth-child(even) td { background: #f7f9fa; } tr { break-inside: avoid; }
      td.n { text-align: center; width: 30px; color: #1f2a30; } td.id { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; width: 90px; } td.sg { width: 110px; } td.c { text-align: center; }
      .band td { background: #f6e7e8 !important; color: #901d23; font-weight: 800; }
      .sig { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 16px; } .sig div { border-top: 1px dashed #9aa6ac; padding-top: 4px; font-size: 8.5pt; color: #1f2a30; text-align: center; }
      .tot { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; } .tot span { background: #f6f3ec; border: 1px solid #e3dccb; border-radius: 999px; padding: 2px 10px; font-size: 8.5pt; }
      .ft { margin-top: 8px; font-size: 7.5pt; color: #1f2a30; display: flex; justify-content: space-between; }`;
    const logo = SITE + 'assets/logo-print.png';
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${css}</style></head><body>${sheets.map(x => `<section class="sh">
      <div class="hd"><img src="${logo}" alt=""><div class="t"><small>جامعة البترا · لجنة الامتحانات · ${esc(TT.term || '')}</small><h1>${esc(x.title)}</h1><h2>${esc(x.sub || '')}</h2></div>${x.qr ? `<div class="qr">${qrSvg(x.qr)}<span>${esc(x.qrLabel || 'امسح للتفاصيل')}</span></div>` : ''}</div>
      ${x.info ? `<div class="info">${x.info.map(([l, v, w]) => `<div class="${w || ''}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${x.body}<div class="ft"><span>${esc(title())} · ${S.approved ? 'معتمدة: ' + esc(S.approved) : 'مسودة'}</span><span>بوصلة البترا · أُعدّ ${new Date().toLocaleDateString('ar-JO-u-nu-latn')}</span></div></section>`).join('')}</body></html>`;
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
    const img = f.contentDocument.querySelector('img'); if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 200);
  }
  // who sits in which room: each room's share of each section, in name order
  function roomStudents(c, rooms) {
    const M = (REGMEM && REGMEM.mine) || {}, who = (REGMEM && REGMEM.who) || {};
    // a part of a course (sat in several sessions by sections): the students of its own sections
    let mine = M[c.code]; if (!mine && c.base && M[c.base]) { const secs = new Set(c.sl.map(x => String(x.s))); mine = Object.fromEntries(Object.entries(M[c.base]).filter(([, sc]) => secs.has(String(sc)))); }
    mine = mine || {};
    const pool = {}; Object.entries(mine).forEach(([id, sec]) => (pool[sec] = pool[sec] || []).push(id));
    const byName = (a, b) => (who[a] && who[a].name || '').localeCompare(who[b] && who[b].name || '', 'ar') || a.localeCompare(b);
    Object.values(pool).forEach(v => v.sort(byName));
    const anyLeft = () => Object.keys(pool).find(k => pool[k].length);
    const res = rooms.map(r => { const ids = [];
      (r.parts && r.parts.length ? r.parts : [{ s: '', k: r.n }]).forEach(x => { let k = x.k; const key = String(x.s || '');
        while (k > 0) { const from = pool[key] && pool[key].length ? key : anyLeft(); if (from == null) break; ids.push(pool[from].shift()); k--; } });
      return ids; });
    const rest = Object.values(pool).flat(); if (rest.length && res.length) res[res.length - 1].push(...rest.sort(byName));
    return res.map(ids => ids.map(id => ({ id, name: (who[id] && who[id].name) || '', major: (who[id] && who[id].major) || '', sec: mine[id] || '' })));
  }
  function printLists() {
    if (!REGMEM) return alert('ارفع كشف التسجيل أولاً لطباعة قوائم الطلبة.');
    const { out } = seating(), sheets = [];
    for (let s = 0; s < NS; s++) (out[s] || []).filter(x => match(x.c)).sort((a, b) => a.c.code.localeCompare(b.c.code)).forEach(x => {
      const lists = roomStudents(x.c, x.rooms), si = slotInfo(s);
      x.rooms.forEach((r, k) => { const st = lists[k] || [];
        sheets.push({ title: `كشف حضور امتحان: ${x.c.name}`, sub: `${TYPES[S.type].name} · ${x.c.dept}`, qr: SITE + 'myexams.html?c=' + encodeURIComponent(x.c.base || x.c.code), qrLabel: 'تفاصيل الامتحان للطلبة',
          info: [['رمز المادة', x.c.code], ['التاريخ', si.date], ['الوقت', si.time], ['القاعة', r.room + (r.t === LAB ? ' (مختبر)' : '')], ['الشعب', r.secs.join('، ') || '—', 'w2'], ['عدد الطلبة في القاعة', `${st.length || r.n}`], ['القاعة ' + (k + 1) + ' من', String(x.rooms.length)],
            ['المراقبون', r.proc.map(U.shortName).join('، ') + (r.proc.length < (r.need || 1) ? `${r.proc.length ? '، ' : ''}⚠ ينقص ${(r.need || 1) - r.proc.length === 1 ? 'مراقب' : (r.need || 1) - r.proc.length + ' مراقبين'}` : ''), 'w4']],
          body: st.length ? `<table><thead><tr><th>#</th><th>رقم الطالب</th><th>اسم الطالب</th><th>التخصص</th><th>الشعبة</th><th>التوقيع</th><th>ملاحظات</th></tr></thead><tbody>${st.map((u, i) => `<tr><td class="n">${i + 1}</td><td class="id">${esc(u.id)}</td><td>${esc(u.name)}</td><td>${esc(u.major.replace(/\s*\/\s*البكالوريوس$/, ''))}</td><td class="c">${esc(u.sec)}</td><td class="sg"></td><td></td></tr>`).join('')}</tbody></table>
            <div class="tot"><span>الحاضرون: ______</span><span>الغائبون: ______</span><span>المجموع: ${st.length}</span></div>
            <div class="sig">${(r.proc.length ? r.proc : ['', '']).map(n => `<div>المراقب: ${esc(U.shortName(n))}<br>التوقيع</div>`).join('')}<div>منسق الامتحان<br>التوقيع</div></div>`
            : '<p style="color:#8f1f1f">لا أسماء لهذا المقرر في كشف التسجيل المرفوع.</p>' });
      });
    });
    if (!sheets.length) return alert('لا امتحانات مجدولة ضمن التصفية الحالية.');
    printDocs(sheets, 'قوائم الطلبة – ' + title());
  }
  // proctors: each person's duties (their own course's exam, or proctoring), with the person's department
  function duties() {
    const { out, load } = seating(), by = {};
    const deptOf = n => { const ix = INS[n] || []; const m = {}; ix.forEach(i => { m[C[i].dept] = (m[C[i].dept] || 0) + 1; }); const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : 'مراقب إضافي'; };
    const facOf = n => { const ix = INS[n] || []; return ix.length ? C[ix[0]].fac : ''; };
    for (let s = 0; s < NS; s++) (out[s] || []).forEach(x => x.rooms.forEach(r => r.proc.forEach(n => {
      (by[n] = by[n] || { n, dept: deptOf(n), fac: facOf(n), list: [] }).list.push({ s, c: x.c, room: r.room + (r.t === LAB ? ' (مختبر)' : ''), n: r.n, own: x.c.ins.includes(n), with: r.proc.filter(o => o !== n) });
    })));
    const f = F();
    return Object.values(by).filter(p => (!f.fac || p.fac === f.fac) && (!f.dept || p.dept === f.dept) && (!f.q || U.norm(p.n).includes(U.norm(f.q)) || p.list.some(d => match(d.c))))
      .sort((a, b) => a.dept.localeCompare(b.dept, 'ar') || U.shortName(a.n).localeCompare(U.shortName(b.n), 'ar'));
  }
  function printProctors() {
    const ps = duties(); if (!ps.length) return alert('لا مراقبين ضمن التصفية الحالية.');
    printDocs(ps.map(p => { const L = p.list.sort((a, b) => a.s - b.s), days = new Set(L.map(d => dayOf(d.s))).size;
      return { title: `كشف المراقبة: ${U.shortName(p.n)}`, sub: `${p.dept}${p.fac ? ' · ' + p.fac : ''}`, qr: SITE + 'myexams.html?ins=' + encodeURIComponent(p.n), qrLabel: 'مراقباتي على الهاتف',
        info: [['عدد المهام', String(L.length)], ['امتحانات مقرراته', String(L.filter(d => d.own).length)], ['مراقبات أخرى', String(L.filter(d => !d.own).length)], ['عدد الأيام', String(days)]],
        body: `<table><thead><tr><th>#</th><th>اليوم والتاريخ</th><th>الوقت</th><th>المقرر</th><th>القاعة</th><th>الطلبة</th><th>المهمة</th><th>مع</th></tr></thead><tbody>${L.map((d, i) => { const si = slotInfo(d.s);
          return `<tr><td class="n">${i + 1}</td><td>${esc(si.date)}</td><td class="c" dir="ltr">${esc(si.time)}</td><td><b>${esc(d.c.code)}</b> ${esc(d.c.name)}</td><td class="c"><b>${esc(d.room)}</b></td><td class="c">${d.n}</td><td class="c">${d.own ? 'امتحان مقرره' : 'مراقبة'}</td><td>${esc(d.with.map(U.shortName).join('، '))}</td></tr>`; }).join('')}</tbody></table>
          <div class="tot"><span>يُرجى الحضور إلى القاعة قبل موعد الامتحان بـ15 دقيقة واستلام الكشوف من المنسق.</span></div>
          <div class="sig"><div>المراقب<br>التوقيع</div><div>رئيس القسم</div><div>لجنة الامتحانات</div></div>` }; }), 'كشوف المراقبين – ' + title(), 'landscape');
  }
  function procReport() {
    const ps = duties(); if (!ps.length) return alert('لا مراقبين ضمن التصفية الحالية.');
    const n = ps.map(p => p.list.length), avg = n.reduce((a, b) => a + b, 0) / n.length;
    const byDept = {}; ps.forEach(p => { const o = byDept[p.dept] = byDept[p.dept] || { ppl: 0, d: 0 }; o.ppl++; o.d += p.list.length; });
    window.printReport({ title: 'تقرير المراقبات – ' + title(), subtitle: TT.term, orientation: 'portrait', qr: false,
      filters: [['الكلية', F().fac || 'الكل'], ['القسم', F().dept || 'الكل'], ['الحالة', S.approved ? 'معتمدة: ' + S.approved : 'مسودة']],
      stats: [['مراقباً', ps.length], ['مهمة مراقبة', n.reduce((a, b) => a + b, 0)], ['المتوسط للشخص', avg.toFixed(1)], ['الأعلى', Math.max(...n)], ['الأقل', Math.min(...n)]],
      sections: [{ title: 'حسب القسم', columns: ['القسم', 'المراقبون', 'المهام', 'المتوسط'], rows: Object.entries(byDept).sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([d, o]) => [d, o.ppl, o.d, (o.d / o.ppl).toFixed(1)]) },
        { title: 'حسب المراقب', columns: ['المراقب', 'القسم', 'المهام', 'امتحانات مقرراته', 'مراقبات أخرى', 'الأيام', 'أكثر يوم'], rows: ps.map(p => { const per = {}; p.list.forEach(d => { const k = dayOf(d.s); per[k] = (per[k] || 0) + 1; });
          return [U.shortName(p.n), p.dept, p.list.length, p.list.filter(d => d.own).length, p.list.filter(d => !d.own).length, Object.keys(per).length, Math.max(...Object.values(per))]; }) }],
      note: 'العدالة: كلما اقترب «الأعلى» من «الأقل» كان التوزيع أعدل. يمكن تحديد حد للمراقبات في «الإعداد ← المراقبون».' });
  }
  // the approved timetable as one public file (data/exam_schedule.json): read by «امتحاناتي» and the building screens
  // ---------- publishing to the site (students' «امتحاناتي», building screens, calendar subscriptions) ----------
  // The committee publishes with the sign-in username and password only. Behind it: a GitHub key that can only start
  // the workflow «Publish the exam timetable» (fine-grained, this repository, Actions: read and write — it cannot change
  // any file itself). The site owner sets it up once; it is kept in data/exams/key.json encrypted with the password
  // (AES-GCM, key from PBKDF2), so any device can publish after the password, and no device keeps anything.
  // The workflow (exam-publish.yml → scripts/exam_inbox.py) writes data/exam_schedule.json or removes it.
  const REPO_API = 'https://api.github.com/repos/marafah/uopstaff';
  const WF = REPO_API + '/actions/workflows/exam-publish.yml/dispatches';
  const MAGIC = 'UOPEXAMS2:', MAXIN = 64000;
  let LIVE = null;   // what the site shows now (read from the published file)
  let KEYF = null;   // the encrypted publishing key on the site (null = checking, false = not set up)
  let WATCH = null;
  const noCache = u => fetch(u + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  function liveCheck() {
    return Promise.all([noCache('data/exam_schedule.json'), noCache('data/exams/key.json')]).then(([x, k]) => {
      LIVE = x && x.exams && x.exams.length ? x : false; KEYF = k && k.ct ? k : false;
      if (tab === 'out' && !document.querySelector('#pgModal.show')) render(); return LIVE; });
  }
  function pubDoc() {
    const { out } = seating(), exams = [];
    for (let s = 0; s < NS; s++) (out[s] || []).forEach(x => { const d = DAYS[dayOf(s)], p = S.periods[s % P];
      exams.push({ code: x.c.base || x.c.code, name: x.c.baseName || x.c.name, dept: x.c.dept, fac: x.c.fac, date: d.iso, from: p[0], to: p[1], students: x.c.students, ins: x.c.ins,
        rooms: x.rooms.map(r => ({ room: r.room, lab: r.t === LAB, n: r.n, secs: (r.parts || []).map(q => q.s).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i), proc: r.proc })) }); });
    const now = new Date().toISOString();
    return { id: now, title: title(), type: TYPES[S.type].name, term: TT.term || '', faculties: S.facs.length ? S.facs : ['كل الكليات'], approved: S.approved || null,
      published: now, periods: S.periods, days: DAYS.map(d => d.iso), exams };
  }
  const sig = doc => { const t = JSON.stringify(doc.exams); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h.toString(36); };
  const b64u8 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const u8b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  // indexed + gzip: the whole university's timetable (≈940 exams) is ≈48 KB, inside GitHub's 65 KB limit for one request
  async function pack(doc) {
    const ix = () => { const a = [], m = new Map(); return { a, i: v => { v = v == null ? '' : v; if (!m.has(v)) { m.set(v, a.length); a.push(v); } return m.get(v); } }; };
    const P_ = ix(), R_ = ix(), D_ = ix(), F_ = ix(), from = doc.periods.map(p => p[0]);
    const E = doc.exams.map(e => [e.code, e.name, D_.i(e.dept), F_.i(e.fac), (e.ins || []).map(P_.i), doc.days.indexOf(e.date), from.indexOf(e.from), e.students,
      e.rooms.map(r => [R_.i(r.room), r.lab ? 1 : 0, r.n, r.secs, (r.proc || []).map(P_.i)])]);
    const H = { ...doc }; delete H.exams;
    const gz = await new Response(new Blob([JSON.stringify({ H, P: P_.a, R: R_.a, D: D_.a, F: F_.a, E })]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return MAGIC + b64u8(new Uint8Array(gz));
  }
  async function aesKey(u, p, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('uopstaff-exams-publish|' + u.trim() + '|' + p), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(tok, u, p) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(u, p, salt), new TextEncoder().encode(tok));
    return { v: 1, salt: b64u8(salt), iv: b64u8(iv), ct: b64u8(new Uint8Array(ct)), at: new Date().toISOString() };
  }
  async function unseal(k, u, p) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8b64(k.iv) }, await aesKey(u, p, u8b64(k.salt)), u8b64(k.ct));
    return new TextDecoder().decode(pt);
  }
  const dispatch = (tok, action, data) => fetch(WF, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { action, data: data || '' } }) }).then(r => { if (r.status === 204) return true;
      throw new Error(r.status === 401 ? 'expired' : r.status === 403 || r.status === 404 ? 'denied' : 'http ' + r.status); });
  const keyErr = e => e.message === 'expired' ? 'مفتاح النشر منتهي الصلاحية أو أُلغي. يحتاج صاحب الموقع إلى «إعداد النشر» من جديد (دقيقتان).'
    : e.message === 'denied' ? 'مفتاح النشر لا يملك صلاحية تشغيل النشر. يحتاج صاحب الموقع إلى «إعداد النشر» من جديد.' : 'تعذّر الاتصال بـ GitHub. تأكد من الإنترنت وحاول مرة أخرى.';
  function pubPanel() {
    const L = LIVE, mine = S.pub, changed = L && mine && C.some(c => c.s >= 0) && sig(pubDoc()) !== mine.sig;
    const st = L === null ? '<span class="bdg"><span class="spinner-border spinner-border-sm"></span> يتحقق من الموقع…</span>'
      : L ? `<span class="bdg green"><i class="bi bi-broadcast"></i> منشور الآن: ${esc(L.title)} · ${L.exams.length} امتحاناً · ${L.published ? (U.ago ? U.ago(L.published) : String(L.published).slice(0, 10)) : ''}</span>`
      : '<span class="bdg"><i class="bi bi-eye-slash"></i> لا جدول منشوراً على الموقع</span>';
    return `<div class="ex-pub"><div class="t"><i class="bi bi-display"></i> النشر على شاشات المباني وصفحة «امتحاناتي»</div>${st}
      ${changed ? '<span class="bdg amber"><i class="bi bi-arrow-repeat"></i> عدّلت الجدول بعد آخر نشر</span>' : ''}
      ${KEYF === false ? '<span class="bdg amber"><i class="bi bi-gear"></i> النشر غير مُعدّ بعد</span>' : ''}
      <span class="sp"></span>
      <button class="btn btn-ex" id="ex-publish"><i class="bi bi-cloud-arrow-up-fill"></i> ${L ? 'تحديث النشر' : 'نشر الآن'}</button>
      ${L ? '<button class="btn btn-outline-danger" id="ex-unpub"><i class="bi bi-cloud-slash"></i> إيقاف النشر</button>' : ''}
      <button class="btn btn-sm btn-link" id="ex-pubset"><i class="bi bi-gear"></i> ${KEYF ? 'إعداد النشر' : 'إعداد النشر (مرة واحدة)'}</button></div>`;
  }
  // the dialog follows the site until the change shows (the workflow takes ≈30 s, the site ≈1 min more)
  function watch(test, el, okHtml) {
    clearInterval(WATCH); const t0 = Date.now();
    WATCH = setInterval(() => liveCheck().then(L => {
      const box = document.getElementById(el); if (!box) { clearInterval(WATCH); return; }
      if (test(L)) { clearInterval(WATCH); box.className = 'ex-pubst ok'; box.innerHTML = okHtml; render(); return; }
      if (Date.now() - t0 > 6 * 60000) { clearInterval(WATCH); box.className = 'ex-pubst'; box.innerHTML = '<i class="bi bi-hourglass-split"></i> يأخذ وقتاً أطول من المعتاد. سيظهر تلقائياً عند اكتماله؛ يمكنك إغلاق هذه النافذة.'; }
    }), 10000);
  }
  // nothing reaches the screens without the committee's approval: the same username and password as the sign-in
  function approve(what, info, then) {
    U.modal('<i class="bi bi-shield-lock-fill"></i> موافقة على ' + what, `<form id="ex-apf" autocomplete="on">
      <p class="mb-2">${info}</p>
      <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1">اسم المستخدم</label><input name="u" class="form-control" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></div>
      <div class="col-sm-6"><label class="form-label small mb-1">كلمة المرور</label><input name="p" type="password" class="form-control" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></div></div>
      <div class="text-danger small mt-2" id="ex-aperr" hidden></div>
      <button class="btn btn-ex w-100 mt-3" type="submit"><i class="bi bi-check2-circle"></i> أوافق على ${what}</button></form>`);
    const f = document.getElementById('ex-apf'), err = document.getElementById('ex-aperr'); setTimeout(() => f.u.focus(), 300);
    const fail = m => { err.hidden = false; err.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> ' + m; f.querySelector('[type=submit]').disabled = false; };
    f.onsubmit = async e => { e.preventDefault(); err.hidden = true;
      if (await sha('uopstaff-research|' + f.u.value.trim() + '|' + f.p.value) !== GATE) { fail('اسم المستخدم أو كلمة المرور غير صحيحة'); f.p.value = ''; f.p.focus(); return; }
      f.querySelector('[type=submit]').disabled = true; then(f.u.value, f.p.value, fail); };
  }
  async function keyFor(u, p) {
    await liveCheck();
    if (!KEYF) throw new Error('nokey');
    try { return await unseal(KEYF, u, p); } catch (e) { throw new Error('nokey'); }
  }
  const noKeyHtml = '<div class="alert alert-warning mb-0"><i class="bi bi-gear"></i> النشر لم يُعدّ بعد على هذا الموقع (أو تغيّرت كلمة المرور منذ إعداده). يحتاج صاحب الموقع إلى «إعداد النشر» مرة واحدة — دقيقتان فقط.<div class="mt-2"><button class="btn btn-sm btn-ex" data-gosetup>إعداد النشر الآن</button></div></div>';
  function progress(title, msg) {
    U.modal(title, `<div id="ex-pubst" class="ex-pubst wait"><span class="spinner-border spinner-border-sm"></span> ${msg}</div>`);
    document.getElementById('pgModalB').onclick = e => { if (e.target.closest('[data-gosetup]')) setupDlg(); };
  }
  function publish() {
    if (!C.some(c => c.s >= 0)) return alert('ولّد الجدول أولاً.');
    const doc0 = pubDoc();
    approve('النشر', `سيُنشر <b>${esc(doc0.title)}</b> (${doc0.exams.length} امتحاناً) على شاشات المباني وصفحة «امتحاناتي».${S.approved ? ` النسخة المعتمدة: ${esc(S.approved)}.` : ' <span class="text-danger">هذه النسخة مسودة غير معتمدة</span> (يمكنك اعتمادها من «الحفظ والاعتماد» أولاً).'}`, async (u, p, fail) => {
      const doc = pubDoc(); let tok, data;
      try { tok = await keyFor(u, p); } catch (e) { const b = document.getElementById('pgModalB'); b.innerHTML = noKeyHtml; b.onclick = ev => { if (ev.target.closest('[data-gosetup]')) setupDlg(); }; return; }
      try { data = await pack(doc); } catch (e) { return fail('هذا المتصفح لا يدعم النشر. استخدم Chrome أو Edge حديثاً.'); }
      if (data.length > MAXIN) return fail(`الجدول كبير جداً لنشره دفعة واحدة (${Math.round(data.length / 1000)} ألف حرف). انشر كل مجموعة كليات على حدة.`);
      progress('<i class="bi bi-cloud-arrow-up-fill"></i> نشر الجدول', 'يُنشر الجدول… (دقيقة إلى دقيقتين)');
      dispatch(tok, 'publish', data).then(() => {
        S.pub = { at: doc.published, sig: sig(doc), title: doc.title, n: doc.exams.length };
        watch(L => L && L.id === doc.id, 'ex-pubst', `<i class="bi bi-check-circle-fill"></i> <b>نُشر الجدول</b> (${doc.exams.length} امتحاناً). يظهر على شاشات المباني خلال 3 دقائق.
          <div class="d-flex flex-wrap gap-2 mt-2"><a class="btn btn-sm btn-outline-primary" href="screen.html?b=exams" target="_blank"><i class="bi bi-display"></i> شاشة الامتحانات</a><a class="btn btn-sm btn-outline-primary" href="myexams.html" target="_blank"><i class="bi bi-phone"></i> «امتحاناتي»</a></div>`);
      }).catch(e => { const b = document.getElementById('ex-pubst'); if (b) { b.className = 'ex-pubst'; b.innerHTML = '<i class="bi bi-x-octagon-fill text-danger"></i> ' + keyErr(e) + (e.message === 'expired' || e.message === 'denied' ? '<div class="mt-2"><button class="btn btn-sm btn-ex" data-gosetup>إعداد النشر</button></div>' : ''); } });
    });
  }
  // take the timetable off the screens and the students' page
  function unpublish(after) {
    approve('إزالة الجدول من الشاشات', 'سيُزال الجدول المنشور من شاشات المباني وصفحة «امتحاناتي»، وتعود الشاشات إلى عرض المحاضرات.', async (u, p) => {
      let tok;
      try { tok = await keyFor(u, p); } catch (e) { const b = document.getElementById('pgModalB'); b.innerHTML = noKeyHtml; b.onclick = ev => { if (ev.target.closest('[data-gosetup]')) setupDlg(); }; return; }
      progress('<i class="bi bi-cloud-slash"></i> إزالة الجدول', 'يُزال الجدول من الشاشات…');
      dispatch(tok, 'unpublish').then(() => { S.pub = null; if (after) after();
        watch(L => L === false, 'ex-pubst', '<i class="bi bi-check-circle-fill"></i> <b>أُزيل الجدول.</b> تعود الشاشات إلى المحاضرات خلال 3 دقائق.');
      }).catch(e => { const b = document.getElementById('ex-pubst'); if (b) { b.className = 'ex-pubst'; b.innerHTML = '<i class="bi bi-x-octagon-fill text-danger"></i> ' + keyErr(e); } });
    });
  }
  // one time, by the site owner: create the key on GitHub, paste it here; it is stored on the site encrypted with the password
  function setupDlg() {
    const NEWTOK = 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent('نشر جدول الامتحانات') + '&description=' + encodeURIComponent('Exams page: start the Publish the exam timetable workflow only') + '&expires_in=366&target_name=marafah&actions=write';
    U.modal('<i class="bi bi-gear-fill"></i> إعداد النشر — مرة واحدة لصاحب الموقع', `<form id="ex-suf" autocomplete="off">
      <p class="mb-2">بعد هذا الإعداد ينشر أي عضو في اللجنة، من أي جهاز، بكلمة المرور فقط.</p>
      <ol class="ex-pubsteps">
        <li><a href="${NEWTOK}" target="_blank" rel="noopener"><b>افتح صفحة إنشاء المفتاح على GitHub</b> <i class="bi bi-box-arrow-up-left"></i></a> (بحساب marafah).</li>
        <li>في <b>Repository access</b> اختر <b>Only select repositories</b> ثم <b>marafah/uopstaff</b>.</li>
        <li>في <b>Permissions</b> اضغط <b>Add permissions</b> واختر <b>Actions</b>، واجعلها <b>Read and write</b>. (لا تختر غيرها.)</li>
        <li>اضغط <b>Generate token</b> ثم <b>Copy</b>، والصق المفتاح هنا:</li></ol>
      <input name="t" class="form-control mb-2" placeholder="github_pat_…" autocomplete="off" spellcheck="false" required>
      <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1">اسم المستخدم (نفس الدخول)</label><input name="u" class="form-control" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></div>
      <div class="col-sm-6"><label class="form-label small mb-1">كلمة المرور (نفس الدخول)</label><input name="p" type="password" class="form-control" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" required></div></div>
      <div id="ex-sust" class="small mt-2" hidden></div>
      <button class="btn btn-ex w-100 mt-3" type="submit"><i class="bi bi-check2-circle"></i> حفظ الإعداد</button>
      <p class="small text-muted mt-2 mb-0"><i class="bi bi-shield-lock"></i> المفتاح يُحفظ على الموقع مشفّراً بكلمة المرور، ولا يُحفظ على هذا الجهاز. يستطيع فقط تشغيل النشر، ولا يعدّل أي ملف في الموقع.</p></form>`);
    const f = document.getElementById('ex-suf'), st = document.getElementById('ex-sust'), btn = f.querySelector('[type=submit]');
    const say = (cls, m) => { st.hidden = false; st.className = 'small mt-2 ' + cls; st.innerHTML = m; };
    f.onsubmit = async e => { e.preventDefault();
      const tok = f.t.value.trim(), u = f.u.value, p = f.p.value;
      if (await sha('uopstaff-research|' + u.trim() + '|' + p) !== GATE) return say('text-danger', '<i class="bi bi-exclamation-triangle-fill"></i> اسم المستخدم أو كلمة المرور غير صحيحة');
      if (!/^(github_pat_|ghp_)\w{20,}$/.test(tok)) return say('text-danger', '<i class="bi bi-exclamation-triangle-fill"></i> هذا لا يبدو مفتاح GitHub. انسخه كاملاً (يبدأ بـ github_pat_).');
      btn.disabled = true; say('text-muted', '<span class="spinner-border spinner-border-sm"></span> يحفظ الإعداد…');
      try { const k = await seal(tok, u, p); await dispatch(tok, 'setkey', JSON.stringify(k));
        say('text-muted', '<span class="spinner-border spinner-border-sm"></span> تم. يتأكد من وصول الإعداد إلى الموقع (دقيقة تقريباً)…');
        const t0 = Date.now(), ct = k.ct;
        const poll = setInterval(() => liveCheck().then(() => { if (!document.getElementById('ex-sust')) return clearInterval(poll);
          if (KEYF && KEYF.ct === ct) { clearInterval(poll); say('text-success', '<i class="bi bi-check-circle-fill"></i> <b>اكتمل الإعداد.</b> يمكن الآن النشر بكلمة المرور من أي جهاز.'); render(); }
          else if (Date.now() - t0 > 5 * 60000) { clearInterval(poll); say('text-warning', 'يأخذ وقتاً أطول من المعتاد؛ جرّب النشر بعد دقائق.'); } }), 8000);
      } catch (x) { btn.disabled = false; say('text-danger', '<i class="bi bi-x-octagon-fill"></i> ' + (x.message === 'denied' ? 'المفتاح لا يملك صلاحية Actions: Read and write على marafah/uopstaff. أنشئه من جديد بالخطوات أعلاه.' : x.message === 'expired' ? 'المفتاح غير صحيح. انسخه كاملاً من GitHub.' : keyErr(x))); }
    };
  }
  function doCSV() {
    // plain numbers stay numbers; everything else is text written right-to-left (a leading RLM mark), so Excel neither turns a
    // date into ##### nor scrambles «2 (26 من 85)»; dates as d/m/yyyy
    const q = v => { let t = String(v == null ? '' : v); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t = `${+t.slice(8)}/${+t.slice(5, 7)}/${t.slice(0, 4)}`;
      if (t && !/^\d+$/.test(t)) t = '\u200F' + t; return `"${t.replace(/"/g, '""')}"`; }, lines = [];
    outData().map(expandRooms).forEach(s => { if (s.title) lines.push(q(s.title)); lines.push(s.columns.map(q).join(',')); s.rows.forEach(r => lines.push(r.map(q).join(','))); lines.push(''); });
    U.download(`${title()}_${OUT[outView]}.csv`.replace(/\s+/g, '_'), '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function repExport(xl) {
    const st = stats(), rep = report(st), rows = rep.map(repLine);
    if (!xl) return window.printReport({ title: 'تقرير التعارضات – ' + title(), subtitle: TT.term, orientation: 'landscape', qr: false,
      filters: [['الحالة', S.approved ? 'معتمدة: ' + S.approved : 'مسودة'], ['مصدر بيانات الطلبة', S.reg && S.src !== 'plans' ? 'كشف التسجيل' : 'الخطط الدراسية (تقدير)']],
      stats: [['تعارض طالب', st.clash], ['بلا مقعد', st.unseated], ['تعارض مدرّس', st.ins], ['نقص مراقبين', st.short], ['ضغط يومي', st.day], ['متتالية', st.b2b]],
      sections: [{ columns: REP_H, widths: ['3%', '6%', '8%', '11%', '24%', '12%', '7%', '17%', '12%'], rows }],
      note: rows.length ? 'الخطورة: حرج = يجب حلّه قبل الاعتماد؛ مرتفع = يُفضّل حلّه؛ متوسط ومنخفض = تحسينات.' : 'لا توجد تعارضات.' });
    loadXLSX().then(() => {
      const ws = XLSX.utils.aoa_to_sheet([['تقرير التعارضات – ' + title()], [], REP_H].concat(rows)); ws['!views'] = [{ RTL: true }];
      ws['!cols'] = [4, 8, 14, 22, 60, 30, 12, 50, 36].map(w => ({ wch: w }));
      REP_H.forEach((h, j) => { const c = ws[XLSX.utils.encode_cell({ r: 2, c: j })]; if (c) c.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '901D23' } }, alignment: { horizontal: 'center', wrapText: true } }; });
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'التعارضات'); XLSX.writeFile(wb, `تقرير_التعارضات_${title()}.xlsx`.replace(/\s+/g, '_'));
    }).catch(() => alert('تعذّر تحميل مكتبة Excel.'));
  }
  // ---------- settings ----------
  const sw = (k, label, help) => `<label class="ex-sw"><input type="checkbox" data-k="${k}" ${(['b2b', 'near', 'insClash', 'early'].includes(k) ? S[k] !== false : !!S[k]) ? 'checked' : ''}><span class="tg"></span><span><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span></label>`;
  const num = (k, label, min, max, help, def) => `<label class="ex-fld"><span>${label}</span><input type="number" class="form-control" data-k="${k}" min="${min}" max="${max}" value="${S[k] ?? def}">${help ? `<small>${help}</small>` : ''}</label>`;
  const box = (n, ic, color, t, sub, body, wide) => `<section class="ex-box${wide ? ' wide' : ''}" style="--a:${color}"><header><span class="bn">${n}</span><i class="bi ${ic}"></i><div><h4>${t}</h4><small>${sub}</small></div></header><div class="bb">${body}</div></section>`;
  const PRESETS = [['3 فترات × ساعتان', [['09:00', '11:00'], ['11:30', '13:30'], ['14:00', '16:00']]], ['4 فترات × ساعة', [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']]],
    ['فترتان × ساعتان', [['10:00', '12:00'], ['12:30', '14:30']]], ['4 فترات × ساعة ونصف', [['08:30', '10:00'], ['10:30', '12:00'], ['12:30', '14:00'], ['14:30', '16:00']]]];
  const mins = (a, b) => U.toMin(b) - U.toMin(a);
  // the exam period on a month calendar: exam days numbered, weekly days off, holidays; a click on a day adds / removes a holiday
  // one day from 7:00 to 18:00: the exam window, each period, the breaks between them
  function timeline() {
    const ps = S.periods.map(p => [U.toMin(p[0]), U.toMin(p[1])]).sort((a, b) => a[0] - b[0]);
    const win = [U.toMin(S.firstStart || '07:00'), U.toMin(S.lastEnd || '18:00')];
    const A = Math.max(0, Math.floor(Math.min(win[0], ...ps.map(p => p[0])) / 60) * 60 - 60), Z = Math.min(1440, Math.ceil(Math.max(win[1], ...ps.map(p => p[1])) / 60) * 60 + 60);
    const X = m => ((m - A) / (Z - A) * 100).toFixed(2) + '%', W = (a, b) => ((b - a) / (Z - A) * 100).toFixed(2) + '%';
    const gaps = ps.slice(1).map((p, k) => [ps[k][1], p[0]]).filter(([a, b]) => b > a);
    return `<div class="ex-tl"><div class="bar"><span class="win" style="right:${X(win[0])};width:${W(win[0], win[1])}"></span>
      ${ps.map(([a, b], k) => `<span class="p${late([U.toTime(a), U.toTime(b)]) ? ' bad' : ''}" style="right:${X(a)};width:${W(a, b)}"><b>الفترة ${k + 1}</b><small dir="ltr">${U.toTime(a)}–${U.toTime(b)}</small></span>`).join('')}
      ${gaps.map(([a, b]) => `<span class="g" style="right:${X(a)};width:${W(a, b)}" title="استراحة ${b - a} دقيقة"></span>`).join('')}</div>
      <div class="ax">${Array.from({ length: (Z - A) / 60 + 1 }, (_, k) => A / 60 + k).map(h => `<i style="right:${X(h * 60)}">${h}:00</i>`).join('')}</div>
      <div class="lgd"><span><i class="d win"></i> وقت الامتحانات المسموح <bdi dir="ltr">${U.toTime(win[0])} – ${U.toTime(win[1])}</bdi></span><span><i class="d p"></i> فترة امتحان</span>${gaps.length ? '<span><i class="d g"></i> استراحة بين فترتين</span>' : ''}</div></div>`;
  }
  function calKpis() {
    if (!DAYS.length) return '<div class="alert alert-warning">لا توجد أيام امتحانات: راجع التاريخين وأيام التعطيل.</div>';
    const a = DAYS[0].iso, z = DAYS[DAYS.length - 1].iso, span = Math.round((Date.parse(z) - Date.parse(a)) / 864e5) + 1, hol = (S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).filter(h => h >= a && h <= z).length;
    return `<div class="ex-kp2"><span class="ex"><b>${DAYS.length}</b> يوم امتحانات</span><span><b>${esc(DAYS[0].wd)} ${+a.slice(8)}/${+a.slice(5, 7)}</b> ← <b>${esc(DAYS[DAYS.length - 1].wd)} ${+z.slice(8)}/${+z.slice(5, 7)}</b></span>
      <span><b>${span - DAYS.length}</b> يوم بلا امتحانات${hol ? ` (منها ${hol} عطلة)` : ''}</span><span class="lg"><i class="d ex"></i> امتحانات <i class="d off"></i> بلا <i class="d hol"></i> عطلة</span></div>`;
  }
  // the exam days one by one, week by week (with how many exams each has once the timetable is generated)
  function daysList() {
    if (!DAYS.length) return '';
    let wk = null;
    return `<div class="ex-dlist"><h6><i class="bi bi-list-ol"></i> أيام الامتحانات</h6><ol>${DAYS.map((d, i) => {
      const w = Math.floor((Date.parse(d.iso) - Date.parse(DAYS[0].iso)) / 864e5 / 7 + ((new Date(DAYS[0].iso).getUTCDay() + 1) % 7) / 7), head = w !== wk ? `<li class="wk">الأسبوع ${w + 1}</li>` : ''; wk = w;
      const n = C.filter(c => c.s >= 0 && dayOf(c.s) === i).length;
      return `${head}<li><span class="no">${i + 1}</span><span class="wd">${esc(d.wd)}</span><span class="dt">${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}/${d.iso.slice(0, 4)}</span>${n ? `<span class="ct">${n} امتحان</span>` : `<span class="ct mut">${P} فترات</span>`}<button class="btn btn-sm btn-link" data-tgl="${d.iso}" title="تعيين هذا اليوم عطلة"><i class="bi bi-calendar-x"></i></button></li>`; }).join('')}</ol></div>`;
  }
  function monthsView() {
    if (!DAYS.length) return '';
    const hol = new Set(S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []), ex = new Map(DAYS.map((d, i) => [d.iso, i + 1]));
    const first = new Date(S.start + 'T12:00:00Z'), last = new Date(DAYS[DAYS.length - 1].iso + 'T12:00:00Z'), out = [];
    for (let m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1, 12)); m <= last; m.setUTCMonth(m.getUTCMonth() + 1)) {
      const y = m.getUTCFullYear(), mo = m.getUTCMonth(), n = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 1) % 7;   // weeks start on Saturday
      const cells = Array.from({ length: lead }, () => ({ h: '<span></span>' }));
      for (let d = 1; d <= n; d++) {
        const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, wd = new Date(iso + 'T12:00:00Z').getUTCDay(), inR = iso >= S.start && iso <= DAYS[DAYS.length - 1].iso;
        const cls = ex.has(iso) ? 'ex' : hol.has(iso) ? 'hol' : inR && (wd === 5 || S.off.includes(wd)) ? 'off' : inR ? 'off' : 'out';
        cells.push({ iso, h: `<button class="${cls}${iso === U.amman().iso ? ' today' : ''}" ${inR && wd !== 5 && !S.off.includes(wd) ? `data-tgl="${iso}" title="${hol.has(iso) ? 'إلغاء العطلة' : 'تعيين عطلة'}"` : 'disabled'}><b>${d}</b>${ex.has(iso) ? `<small>${(n => n ? n + ' امتحاناً' : 'يوم ' + ex.get(iso))(C.filter(c => c.s >= 0 && DAYS[dayOf(c.s)].iso === iso).length)}</small>` : hol.has(iso) ? '<small>عطلة</small>' : ''}</button>` });
      }
      // only the weeks of the exam period (the rest of the month is left out)
      const wk = []; for (let k = 0; k < cells.length; k += 7) wk.push(cells.slice(k, k + 7));
      const keep = wk.filter(w => w.some(x => x.iso && x.iso >= S.start && x.iso <= DAYS[DAYS.length - 1].iso)).flat().map(x => x.h);
      if (!keep.length) continue;
      out.push(`<div class="ex-month"><h6>${new Date(Date.UTC(y, mo, 15)).toLocaleDateString('ar-JO-u-nu-latn', { month: 'long', year: 'numeric' })}</h6><div class="g">${['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(x => `<i>${x}</i>`).join('')}${keep.join('')}</div></div>`);
    }
    return `<div class="ex-months">${out.join('')}</div>`;
  }
  // every setting of the plan on one screen
  function summaryBox() {
    const bld = {}; TT.sections.forEach(x => { if (x.room && x.room !== '0' && x.building) bld[x.room] = x.building.replace(/^مبنى\s*/, ''); });
    const on = rooms().filter(r => r.on), byB = {}; on.forEach(r => (byB[bld[r.n] || 'أخرى'] = byB[bld[r.n] || 'أخرى'] || []).push(r));
    const dl = d => `${d.wd} ${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}/${d.iso.slice(0, 4)}`;
    const base = {}; C.forEach(c => { const k = c.base || c.code; (base[k] = base[k] || { name: c.baseName || c.name, n: 0, parts: [] }); base[k].n += c.students; if (c.base) base[k].parts.push(c); });
    const rules = [S.busy ? 'مراعاة المحاضرات القائمة (القاعات والمدرسون المشغولون)' : '', S.insClash ? 'منع تعارض المدرّس' : '', S.b2b ? 'تجنّب امتحانين متتاليين للطالب' : '', S.maxDay ? `حتى ${S.maxDay} امتحانات للطالب في اليوم` : '',
      S.procMode === 'ratio' ? `مراقب لكل ${S.perProc} طالباً` : 'مراقب لكل قاعة', S.maxDutyDay ? `حتى ${S.maxDutyDay} مراقبة للمدرّس في اليوم` : ''].filter(Boolean);
    const row = (ic, t, v, sec) => `<div class="ex-sum-r"><i class="bi ${ic}"></i><b>${t}</b><div>${v}</div>${sec ? `<button type="button" class="btn btn-sm btn-link" data-st="${sec}">تعديل</button>` : ''}</div>`;
    return `<details class="ex-sum" ${S.only && S.only.length ? 'open' : ''}><summary><i class="bi bi-card-checklist"></i> ملخص إعدادات الخطة <small>${esc(planName(S))}</small></summary>
      ${S.note ? `<div class="ex-sum-note"><i class="bi bi-info-circle-fill"></i> ${esc(S.note)}</div>` : ''}
      ${row('bi-journal-bookmark', 'الدورة', `${esc((TYPES[S.type] || {}).name || '')}${S.label ? ' · العنوان: ' + esc(S.label) : ''} · ${S.only && S.only.length ? `مقصورة على ${S.only.length} مقرراً` : esc(facLabel())}`, 1)}
      ${row('bi-calendar3', 'الأيام', `${DAYS.length} ${DAYS.length > 2 && DAYS.length < 11 ? 'أيام' : 'يوماً'}: ${DAYS.map(dl).join('، ')}`, 2)}
      ${row('bi-clock', 'الفترات', `${S.periods.length} فترات يومياً (${U.toMin(S.periods[0][1]) - U.toMin(S.periods[0][0])} دقيقة): ${S.periods.map((p, k) => `<span class="ex-sum-c">${k + 1}) <bdi dir="ltr">${p[0]}–${p[1]}</bdi></span>`).join(' ')}${S.firstStart || S.lastEnd ? ` · المسموح من <bdi dir="ltr">${S.firstStart || '—'}</bdi> إلى <bdi dir="ltr">${S.lastEnd || '—'}</bdi>` : ''}`, 3)}
      ${row('bi-rulers', 'القواعد', rules.join(' · '), 4)}
      ${row('bi-people', 'أعداد الطلبة', S.reg && S.src !== 'plans' ? esc(S.regInfo) : S.regN && S.src !== 'plans' ? esc(S.regInfo || 'من ملف مرفوع') : 'من الجدول الدراسي، والتعارض مقدّر من الخطط الدراسية', 5)}
      ${row('bi-door-open', 'القاعات', `${on.length} ${on.some(r => r.t === LAB) && on.every(r => r.t === LAB) ? 'مختبراً' : 'قاعة'} · ${on.reduce((a, r) => a + r.c, 0)} مقعداً في الفترة${(L => on.length > 40 ? `<div class="ex-sum-b"><div>${Object.entries(byB).map(([b, rs]) => `<span class="ex-sum-c">${esc(b)} <small>${rs.length} · ${rs.reduce((a, r) => a + r.c, 0)} مقعداً</small></span>`).join(' ')}</div></div><details class="ex-sum-more"><summary>عرض القاعات (${on.length})</summary>${L}</details>` : L)(`<div class="ex-sum-b">${Object.entries(byB).map(([b, rs]) => `<div><b>${esc(b)}</b> (${rs.reduce((a, r) => a + r.c, 0)}): ${rs.map(r => `<span class="ex-sum-c">${esc(r.n)} <small>${r.c}</small></span>`).join(' ')}</div>`).join('')}</div>`)}`, 6)}
      ${row('bi-list-check', 'المقررات', `${Object.keys(base).length} مقرراً · ${C.length} امتحاناً · ${C.reduce((a, c) => a + c.students, 0).toLocaleString('en-US')} طالباً${Object.values(base).some(b => b.parts.length) ? `<div class="ex-sum-b"><div><b>مقسومة على أكثر من فترة:</b> ${Object.entries(base).filter(([, b]) => b.parts.length).map(([k, b]) => `<span class="ex-sum-c">${esc(k)} ${esc(b.name)} <small>${b.parts.map(c => c.students).join(' + ')}</small></span>`).join(' ')}</div></div>` : ''}`, 8)}
    </details>`;
  }
  // one file the committee uploads: what it is, its state, its template
  const upCard = (k, ic, t, desc, state, tpl) => `<div class="ex-up${state ? ' ok' : ''}"><i class="bi ${ic} ic"></i><div class="tx"><b>${t}</b><small>${desc}</small>
      ${state ? `<span class="st"><i class="bi bi-check-circle-fill"></i> ${esc(state)}</span>` : '<span class="st no"><i class="bi bi-circle"></i> لم يُرفع بعد</span>'}</div>
    <div class="ac">${tpl ? `<button class="btn btn-sm btn-outline-primary" data-tpl="${tpl}"><i class="bi bi-file-earmark-arrow-down"></i> النموذج</button>` : ''}<label class="btn btn-sm ${state ? 'btn-outline-secondary' : 'btn-ex'} mb-0"><i class="bi bi-upload"></i> ${state ? 'استبدال' : 'رفع'}<input type="file" data-up="${k}" accept=".xlsx,.xls,.csv,.htm,.html" hidden></label></div></div>`;
  const fixedInfo = () => { const f = S.fixed || []; if (!f.length) return ''; const srcs = [...new Set(f.map(x => x.src))]; return `${new Set(f.map(x => x.code)).size} مقرراً، ${f.length} موعداً (${srcs.length} ${srcs.length === 1 ? 'ملف' : 'ملفات'})`; };
  function filesPanel() {
    return `<div class="ex-files"><div class="h"><i class="bi bi-folder2-open"></i> ملفات الدورة <small>ترفعها اللجنة مرة لكل دورة؛ كل ما عداها محفوظ</small></div>
      ${upCard('reg', 'bi-people-fill', 'كشف تسجيل الطلبة', 'كما يخرج من نظام التسجيل (Excel): الطلبة ومقرراتهم وشعبهم وأوقات محاضراتهم', S.reg ? S.regInfo : '', 'reg')}
      ${upCard('req', 'bi-list-check', 'متطلبات المقررات', 'قائمة المنسق: مواد الخطة، قاعة/مختبر، عدد القاعات والمراقبين، الموعد الثابت، «في آخر الجدول» (أو صف مظلل بالبرتقالي)', Object.keys(S.req || {}).length ? S.reqInfo || `${Object.keys(S.req).length} مقرراً` : '', 'req')}
      ${upCard('fixed', 'bi-pin-angle-fill', 'المواعيد الثابتة للجهات الأخرى', 'امتحانات الرياضيات ومتطلبات الجامعة…: الشعب والتاريخ والوقت والقاعات (يُقبل جدول الجهة كما هو)', fixedInfo(), 'fixed')}
      ${upCard('proc', 'bi-person-badge-fill', 'المراقبون (اختياري)', 'مشرفو المختبرات والإداريون، وحدود كل شخص وأيامه غير المتاحة والمعفَون', (S.procList || []).length ? S.procInfo || `${S.procList.length} اسماً` : '', 'proc')}</div>`;
  }
  function profBox() {
    const pr = profOf(S); if (!pr) return '';
    const p = Object.assign({}, pr.all || {}, pr[S.type] || {}), bits = [];
    if (p.periods) bits.push(`الفترات: ${nPer(p.periods.length)} من ${p.periods[0][0]} إلى ${p.periods[p.periods.length - 1][1]}`);
    if (p.maxDay) bits.push(`حتى ${p.maxDay === 2 ? 'امتحانين' : p.maxDay} للطالب في اليوم`);
    if (p.busy) bits.push('مراعاة المحاضرات القائمة');
    if (pr.halls) bits.push(pr.halls.label); if (pr.labs) bits.push(pr.labs.label);
    if (p.splitOver) bits.push(`امتحان القاعة فوق ${p.splitOver} طالباً يتوزع على قاعات بـ${p.splitPer}`);
    if (p.blankHall) bits.push('المقرر بلا نوع قاعة يُمتحن في قاعة');
    if (p.cal) bits.push('الأيام من التقويم الجامعي، الأحد–الخميس');
    return `<div class="ex-prof"><i class="bi bi-bookmark-check-fill"></i><div><b>إعدادات ${esc(S.facs[0])} المحفوظة${pr[S.type] ? '' : ' (العامة)'} مطبّقة على الخطط الجديدة${pr.saved ? ` <small>(عُدّلت ${esc(pr.saved)})</small>` : ''}</b><small>${bits.map(esc).join(' · ')}</small></div>
      <span class="d-flex flex-wrap gap-1"><button class="btn btn-sm btn-outline-primary" data-profapply title="يعيد الفترات والقواعد والقاعات والتواريخ إلى المحفوظ">إعادة تطبيقها</button><button class="btn btn-sm btn-outline-secondary" data-profsave title="تصبح إعدادات هذه الخطة هي المحفوظة للخطط القادمة من النوع نفسه (على هذا الجهاز)">حفظ الحالية للخطط القادمة</button></span></div>`;
  }
  function fixedView() {
    if (!(S.fixed || []).length) return '';
    const by = {}; S.fixed.forEach(x => (by[x.code] = by[x.code] || []).push(x));
    const nm = {}; TT.sections.forEach(x => { nm[x.code] = nm[x.code] || x.name.replace(/\s*-\s*(نظري|عملي)$/, ''); });
    const srcs = [...new Set(S.fixed.map(x => x.src))], blocked = (FX.blocks || []).filter(b => DAYS.some(d => d.iso === b.date));
    const tag = c => FX.inPlan.has(c) ? '<span class="bdg green">في الجدول بموعده</span>' : FX.codes.has(c) ? '<span class="bdg">لا طلبة مشتركون</span>' : '<span class="bdg">خارج أيام الامتحانات</span>';
    return `<details class="ex-fold ex-fixd"><summary><i class="bi bi-pin-angle-fill"></i> <b>المواعيد الثابتة للجهات الأخرى</b><small>${FX.inPlan.size} امتحاناً في الجدول بمواعيدها · ${blocked.length} حجز قاعات · ${srcs.length} ${srcs.length === 1 ? 'ملف' : 'ملفات'}</small></summary>
      <p class="small mb-2">كل امتحان هنا يشترك طلبته مع مواد الخطة يدخل الجدول <b>بموعده الثابت</b>: يمنع وضع امتحان آخر لطلبته في ذلك الوقت، ولا يأخذ مقاعد ولا مراقبين من الكلية، وقاعاته محجوزة في وقته.</p>
      <div class="ex-chipset mb-2">${srcs.map(f => `<span class="ex-tagx"><i class="bi bi-file-earmark-spreadsheet"></i> ${esc(f)}<button data-fxdel="${esc(f)}" title="حذف مواعيد هذا الملف" aria-label="حذف"><i class="bi bi-x"></i></button></span>`).join('')}</div>
      <div class="ex-rooms"><table class="table table-sm align-middle"><thead><tr><th>الرمز</th><th>المقرر</th><th>المواعيد (الشعب · القاعات)</th><th>الجهة</th><th>الحالة</th></tr></thead><tbody>
        ${Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([c, L]) => `<tr><td><b>${esc(c)}</b></td><td>${esc(nm[c] || '—')}</td>
          <td class="small">${L.map(x => `${dLong(x.date).replace(/\/\d{4}$/, '')} ${x.from}–${x.to}${x.secs.length ? ` · ش ${x.secs.join('، ')}` : ''}${x.rooms.length ? ` · ${x.rooms.length > 4 ? x.rooms.length + ' قاعات' : x.rooms.join('، ')}` : ''}`).join('<br>')}</td>
          <td class="small">${esc(L[0].who || '')}</td><td>${tag(c)}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function setView() {
    const facs = [...new Set(TT.sections.map(s => s.faculty))].sort();
    const ONLY = S.only && S.only.length ? new Set(S.only) : null;
    const all = (() => { const m = {}; merged(TT.sections.filter(s => (ONLY ? ONLY.has(s.code) : inFac(s.faculty)) && (S.practical || s.activity === 'نظري') && (S.grad || s.degree !== 'الماجستير'))).forEach(s => {
      const c = m[s.code] || (m[s.code] = { code: s.code, name: s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), dept: s.department, fac: s.faculty, n: 0, k: 0 }); c.n += s.registered || 0; c.k++; }); return Object.values(m).sort((a, b) => a.code.localeCompare(b.code)); })();
    const f = F(), cq = U.norm((f.cq || '').trim());
    const shown = all.filter(c => (!cq || U.norm(c.code + ' ' + c.name + ' ' + c.dept).includes(cq)));
    const R = rooms(), on = R.filter(r => r.on);
    const slots = DAYS.flatMap((d, di) => S.periods.map((p, k) => [di * P + k, `${d.wd} ${+d.iso.slice(8)}/${+d.iso.slice(5, 7)} · ${p[0]}`]));
    const parts = [], bx = (...a) => { parts.push(a); return ''; };
    const _ = `<div class="ex-intro"><i class="bi bi-1-circle-fill"></i><div><b>الخطوة 1: الإعداد.</b> راجع الأقسام أدناه بالترتيب (كلها مقترحة مسبقاً ويمكن تركها كما هي)، ثم اضغط <b>«التالي: التوليد والتعديل»</b> في الأسفل. كل تغيير يُحفظ تلقائياً على هذا الجهاز.</div></div>
    <div class="ex-set">
    ${bx(1, 'bi-journal-bookmark-fill', '#901d23', 'الدورة', 'نوع الامتحانات والكليات المشمولة', `
      <div class="ex-types">${Object.entries(TYPES).map(([k, t]) => `<label class="ex-type${S.type === k ? ' on' : ''}"><input type="radio" name="ty" data-ty="${k}" ${S.type === k ? 'checked' : ''}><i class="bi ${{ final: 'bi-mortarboard-fill', mid1: 'bi-1-square-fill', midterm: 'bi-hourglass-split', mid2: 'bi-2-square-fill', makeup: 'bi-arrow-repeat' }[k]}"></i><b>${t.name}</b></label>`).join('')}</div>
      ${S.type === 'makeup' ? `<div class="ex-mk"><div class="h"><i class="bi bi-arrow-repeat"></i> قائمة طلبة الامتحان التكميلي</div>
        <p>الجدول التكميلي يُبنى من قائمة الطلبة الذين لهم إكمال فقط: صف لكل طالب في كل مقرر. نزّل النموذج، املأه، ثم ارفعه.</p>
        <div class="ex-acts"><button class="btn btn-outline-primary" data-tpl="mk"><i class="bi bi-file-earmark-arrow-down"></i> تنزيل النموذج (Excel)</button>
          <label class="btn btn-ex mb-0"><i class="bi bi-upload"></i> رفع القائمة<input type="file" id="ex-mk" accept=".xlsx,.xls,.csv" hidden></label>
          ${S.mk ? '<button class="btn btn-sm btn-link text-danger" data-clrmk>حذف القائمة</button>' : ''}</div>
        ${S.mk ? `<div class="ex-rule ok mt-2"><i class="bi bi-check-circle-fill"></i> ${esc(S.mk.info)}${REGMEM ? '' : ' · <span class="text-muted">لطباعة كشوف الحضور بالأسماء أعد رفع القائمة (الأسماء لا تُحفظ)</span>'}</div>` : '<div class="ex-rule mt-2"><i class="bi bi-info-circle-fill"></i> لم تُرفع قائمة بعد: بدونها يُعامل التكميلي كامتحان لكل مقررات الكليات المختارة.</div>'}</div>` : ''}
      ${profBox()}${filesPanel()}${fixedView()}
      <div class="ex-row2b"><label class="ex-fld"><span>عنوان الجدول (يظهر في الطباعة)</span><input class="form-control" data-k="label" placeholder="${esc(TYPES[S.type].name)} – ${esc(TT.term)}" value="${esc(S.label || '')}"></label>
      <div class="ex-fld"><span>الكليات المشمولة</span><div class="ex-chipset ex-facs"><label class="ex-chk${!S.facs.length ? ' on' : ''}"><input type="checkbox" data-facall ${!S.facs.length ? 'checked' : ''}> <i class="bi bi-buildings-fill"></i> كل الكليات</label>
        ${facs.map(x => `<label class="ex-chk${S.facs.includes(x) ? ' on' : ''}"><input type="checkbox" data-fac="${esc(x)}" ${S.facs.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
        <small>جدول واحد لعدة كليات يمنع تعارض المواد المشتركة (متطلبات الجامعة والمواد الخدمية).</small></div></div>
      <details class="ex-mk ex-list ex-fold" ${S.listMax ? 'open' : ''}><summary class="h"><i class="bi bi-list-columns-reverse"></i> جدول لقائمة مواد من ملف (مثل متطلبات الجامعة) <small>خطة جديدة منفصلة</small></summary>
        <p>نزّل النموذج، اكتب فيه موادك (صف لكل شعبة مع عدد طلبتها)، ثم ارفعه: تُنشأ <b>خطة جديدة</b> لهذه المواد فقط بأعداد الملف، ولا تتأثر خطتك الحالية (تبقى في قائمة الخطط).</p>
        <div class="table-responsive"><table class="table table-sm ex-tplprev"><caption>شكل النموذج — <b>عينة غير حقيقية</b></caption><thead><tr>${TPL.list.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${TPL.list.ex.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="ex-acts"><button class="btn btn-outline-primary" data-tpl="list"><i class="bi bi-file-earmark-arrow-down"></i> تنزيل النموذج (Excel)</button>
          <label class="btn btn-ex mb-0"><i class="bi bi-upload"></i> رفع الملف وإنشاء الخطة<input type="file" id="ex-list" accept=".xlsx,.xls,.csv" hidden></label>
          ${S.only && S.only.length && S.regSec ? `<label class="ex-lmax">أقصى عدد طلبة في الفترة <input type="number" min="0" step="10" class="form-control form-control-sm" data-lmax value="${S.listMax || ''}" placeholder="بلا حد"></label>` : ''}</div>
        ${S.only && S.only.length && S.regInfo ? `<div class="ex-rule ok mt-2"><i class="bi bi-check-circle-fill"></i> ${esc(S.regInfo)}${Object.keys(S.parts || {}).length ? ` · ${Object.keys(S.parts).length} مقررات مقسومة لتبقى كل فترة ضمن ${S.listMax || '—'} طالباً` : ''}</div>` : ''}</details>`)}
    ${bx(2, 'bi-calendar-range-fill', '#0b4a66', 'التقويم', 'أيام الامتحانات والعطل', `
      <div class="ex-cal2"><div class="ex-calf">
        <section><h6><i class="bi bi-calendar-event"></i> المدة</h6>
          <div class="g2"><label><span>أول يوم</span><input type="date" class="form-control form-control-sm" data-k="start" value="${S.start}"></label>
            <label><span>آخر يوم</span><input type="date" class="form-control form-control-sm" data-k="end" value="${S.end || ''}" min="${S.start}"></label></div>
          ${S.end ? '' : `<label class="mt-1"><span>أو عدد الأيام</span><input type="number" class="form-control form-control-sm" data-k="days" min="1" max="40" value="${S.days}"></label>`}
          ${S.calNote ? `<small class="src"><i class="bi bi-calendar-check"></i> من التقويم الجامعي (${esc(S.calNote)}) · <button class="btn btn-link btn-sm p-0" data-calset>إعادتها منه</button></small>` : ''}
          ${S.end ? '<button class="btn btn-sm btn-link p-0 mt-1" data-noend>أو حدّد عدد الأيام بدل آخر يوم</button>' : ''}</section>
        <section><h6><i class="bi bi-calendar-week"></i> أيام الأسبوع بلا امتحانات <small class="fw-normal">(اضغط اليوم)</small></h6>
          <div class="ex-wk">${[6, 0, 1, 2, 3, 4, 5].map(i => i === 5 ? `<label class="ex-chk on lock" title="عطلة رسمية دائماً"><input type="checkbox" checked disabled> ${WD[i]}</label>` : `<label class="ex-chk${S.off.includes(i) ? ' on' : ''}"><input type="checkbox" data-off="${i}" ${S.off.includes(i) ? 'checked' : ''}> ${WD[i]}</label>`).join('')}</div></section>
        <section><h6><i class="bi bi-calendar-x"></i> العطل والأيام المستثناة</h6>
          <div class="ex-add"><input type="date" class="form-control form-control-sm" id="ex-holin"><button class="btn btn-sm btn-outline-primary" data-addhol><i class="bi bi-plus-lg"></i> إضافة</button></div>
          <div class="ex-chipset mt-1">${(S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).map(h => `<span class="ex-tagx">${dLong(h)}<button data-delhol="${h}" aria-label="حذف"><i class="bi bi-x"></i></button></span>`).join('') || '<small class="hint">لا عطل. يمكن أيضاً الضغط على اليوم في التقويم.</small>'}</div></section>
      </div>
      <div class="ex-calm">${calKpis()}${monthsView()}</div></div>`)}
    ${bx(3, 'bi-clock-fill', '#0f766e', 'الفترات اليومية', 'مواعيد الامتحانات في اليوم', `
      <div class="ex-p4">
        <div class="r1"><div class="ex-cap"><span><b>${nDays(DAYS.length)}</b></span><i>×</i><span><b>${nPer(P)}</b> في اليوم</span><i>=</i><span class="t"><b>${BLK.filter(x => !x).length}</b> موعداً متاحاً</span><i>لـ</i><span><b>${C.length}</b> امتحاناً</span>
          <span class="avg">≈ ${(C.length / Math.max(1, BLK.filter(x => !x).length)).toFixed(1)} في كل موعد</span></div>
          <details class="ex-help"><summary title="ما هي الفترة؟"><i class="bi bi-question-circle-fill"></i> ما هي «الفترة»؟</summary><div class="pop">
            <p>الفترة <b>موعد امتحان ثابت يتكرر كل يوم</b> (مثلاً 9:00–11:00). كل امتحان يأخذ فترة واحدة في يوم واحد، والامتحانات في الفترة نفسها تُعقد معاً في قاعات مختلفة. المواعيد المتاحة = الأيام × الفترات.</p>
            <ul><li>طول الفترة = مدة الامتحان.</li><li>اترك 30 دقيقة بين فترتين إن احتجت تبديل القاعات.</li><li>تعارضات كثيرة؟ زِد الأيام أو أضف فترة.</li></ul></div></details></div>
        <div class="r2">${timeline()}</div>
        <div class="r34"><section class="cd"><h6><i class="bi bi-clock-history"></i> وقت الامتحانات اليومي</h6>
            <div class="win"><label><span>من</span><input type="time" class="form-control form-control-sm" data-k="firstStart" value="${S.firstStart || ''}"></label><label><span>إلى</span><input type="time" class="form-control form-control-sm" data-k="lastEnd" value="${S.lastEnd || ''}"></label></div>
            <details class="ex-dw" ${Object.keys(S.dayWin || {}).length ? 'open' : ''}><summary>وقت مختلف لبعض الأيام${Object.keys(S.dayWin || {}).length ? ` (${Object.keys(S.dayWin).length})` : ''}</summary>
              <div class="dws">${[0, 1, 2, 3, 4, 6].filter(i => !S.off.includes(i)).map(i => { const w = (S.dayWin || {})[i] || {};
                return `<div class="dwr${w.from || w.to ? ' on' : ''}"><b>${WD[i]}</b><input type="time" class="form-control form-control-sm" data-dw="${i}" data-e="from" value="${w.from || ''}" title="من"><span>–</span><input type="time" class="form-control form-control-sm" data-dw="${i}" data-e="to" value="${w.to || ''}" title="إلى">${w.from || w.to ? `<button class="btn btn-sm btn-link p-0" data-dwclr="${i}" title="مسح"><i class="bi bi-x-lg"></i></button>` : '<small>كالعام</small>'}</div>`; }).join('')}</div>
              <small class="d-block mt-1">فترة خارج وقت اليوم تُعطَّل في ذلك اليوم فقط.</small></details></section>
          <section class="cd"><h6><i class="bi bi-list-ol"></i> الفترات <span class="n">${nPer(P)}</span>
              <span class="ms-auto d-flex gap-1"><button class="btn btn-sm btn-outline-primary" data-addp><i class="bi bi-plus-lg"></i> فترة</button>
              <span class="dropdown"><button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-lightning-charge"></i> قوالب</button><ul class="dropdown-menu">${PRESETS.map(([t], k) => `<li><button class="dropdown-item" data-preset="${k}">${t}</button></li>`).join('')}</ul></span></span></h6>
            <div class="pl">${S.periods.map((p, k) => { const bad = !(mins(p[0], p[1]) > 0 && !late(p)); return `<div class="pp${bad ? ' bad' : ''}"><b>${k + 1}</b><input type="time" class="form-control form-control-sm" data-p="${k}" data-e="0" value="${p[0]}" aria-label="بداية الفترة ${k + 1}"><span>–</span><input type="time" class="form-control form-control-sm" data-p="${k}" data-e="1" value="${p[1]}" aria-label="نهاية الفترة ${k + 1}"><small>${(m => m <= 0 ? 'وقت غير صحيح' : late(p) ? 'خارج الوقت' : m < 60 ? m + ' دقيقة' : Math.floor(m / 60) + ' س' + (m % 60 ? ' ' + m % 60 + ' د' : ''))(mins(p[0], p[1]))}</small><button class="btn btn-sm del" data-delp="${k}" ${P < 2 ? 'disabled' : ''} title="حذف الفترة"><i class="bi bi-x-lg"></i></button></div>`; }).join('')}</div></section></div>
      </div>
      ${P === 1 ? '<div class="ex-note1"><i class="bi bi-info-circle-fill"></i> فترة واحدة فقط: كل الامتحانات في الساعة نفسها من كل يوم. أضف فترة ثانية لتقليل الضغط.</div>' : ''}
      ${S.periods.some(p => mins(p[0], p[1]) > 180) ? '<div class="ex-note1 warn"><i class="bi bi-exclamation-triangle-fill"></i> فترة أطول من 3 ساعات: الفترة = مدة امتحان واحد، لا يوم الامتحانات كله.</div>' : ''}
      ${S.periods.some(late) ? `<div class="alert alert-danger py-2 d-flex flex-wrap align-items-center gap-2 mt-2"><i class="bi bi-exclamation-octagon-fill"></i> فترة أو أكثر خارج وقت الامتحانات (${S.firstStart || '—'}–${S.lastEnd || '—'}).<button class="btn btn-sm btn-danger" data-fixno>حذف الفترات الخارجة</button></div>` : ''}`)}
    ${bx(4, 'bi-rulers', '#9a5b00', 'قواعد الجدولة', 'ما يمنعه النظام وما يحاول تجنّبه', `
      <div class="ex-rule hard"><i class="bi bi-shield-fill-check"></i> دائماً: لا يجتمع امتحانان لطالب في الفترة نفسها، ولا يتجاوز عدد الطلبة مقاعد القاعات.</div>
      <div class="row2">${num('maxDay', 'أقصى عدد امتحانات للطالب في اليوم', 1, 4)}<label class="ex-fld"><span>عمق البحث عن أفضل جدول</span><select class="form-select" data-k="depth">${[['quick', 'سريع (ثوانٍ)'], ['normal', 'متوازن'], ['deep', 'عميق (أبطأ وأدق)']].map(([k, t]) => `<option value="${k}" ${S.depth === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="ex-rules2">${sw('b2b', 'تجنّب امتحانين متتاليين في اليوم نفسه', 'يترك فترة راحة بين امتحاني الطالب')}${sw('near', 'مراعاة طلبة السنتين المتتاليتين', 'تجنّب تزامن مواد السنة الثانية والثالثة مثلاً في التخصص نفسه')}${sw('insClash', 'منع تزامن امتحانين لمدرّس واحد', 'ليحضر المدرّس امتحان كل مقرر يدرّسه')}${sw('early', 'المقررات الكبيرة في الأيام الأولى', 'ليتسع وقت التصحيح')}${sw('headsOwn', 'رئيس القسم يراقب مواده فقط', `لا يُكلَّف بمراقبة امتحانات غير مقرراته (${headsSet().filter(h => !h.dean).length} رئيس قسم في الهيكل التنظيمي، ومن صفته «رئيس قسم» في قائمة المراقبين)`)}${sw('deanNo', 'العميد ونوابه لا يراقبون', 'معفَون من المراقبة كلياً، حتى في مقرراتهم')}${sw('busy', 'مراعاة المحاضرات القائمة', 'لا تُستخدم قاعة فيها محاضرة وقت الامتحان ولا يراقب مدرّس عنده محاضرة (للامتحانات خلال الفصل)')}${sw('practical', 'تضمين الشعب العملية', '')}${sw('grad', 'تضمين الماجستير', '')}</div>`)}
    ${bx(5, 'bi-people-fill', '#6d28d9', 'بيانات الطلبة', 'من يجلس مع من؟', `
      <div class="ex-srcs">${[['plans', 'bi-diagram-3-fill', 'الخطط الدراسية', 'تقدير حسب التخصص والسنة'], ['reg', 'bi-file-earmark-spreadsheet-fill', 'كشف التسجيل', 'دقيق لكل طالب'], ['both', 'bi-intersect', 'الاثنان معاً', 'الأدق والأشمل']]
        .map(([k, ic, t, d]) => `<label class="ex-type${S.src === k ? ' on' : ''}"><input type="radio" name="src" data-src="${k}" ${S.src === k ? 'checked' : ''}><i class="bi ${ic}"></i><b>${t}</b><small>${d}</small></label>`).join('')}</div>
      <label class="ex-fld"><span>رفع كشف التسجيل: تقرير «كشف تسجيل الطلبة» من نظام التسجيل كما هو (.xls)، لقسم أو كلية أو الجامعة كلها؛ أو أي ملف Excel / CSV فيه رقم الطالب ورمز المادة</span><input type="file" class="form-control" id="ex-reg" accept=".csv,.xlsx,.xls,.htm,.html"></label>
      <div class="ex-tplbar"><i class="bi bi-table"></i><span>ليس لديك التقرير؟ استخدم النموذج بأعمدة واضحة: <b>رقم الطالب</b>، اسم الطالب، <b>رمز المادة</b>، اسم المادة، الشعبة، التخصص.</span><button class="btn btn-sm btn-outline-primary" data-tpl="reg"><i class="bi bi-file-earmark-arrow-down"></i> تنزيل النموذج</button></div>
      <div id="ex-regmsg" class="small text-muted"></div>
      <div class="ex-rule ${S.reg ? 'ok' : ''}">${S.reg ? `<i class="bi bi-check-circle-fill"></i> ${esc(S.regInfo)}${S.regN ? ` · <b>${C.filter(c => c.fromReg).length}</b> من ${C.length} مقرراً في نطاق الجدول أعدادها من الكشف${C.some(c => !c.fromReg) ? ' (البقية من الجدول الدراسي)' : ''}` : ''} <button class="btn btn-sm btn-link text-danger" data-clrreg>حذف الكشف</button>` : '<i class="bi bi-lock-fill"></i> لا يُحفظ رقم أي طالب: تُحفظ فقط مجموعات المواد وعدد طلبتها، على هذا الجهاز وحده.'}</div>`)}
    ${bx(6, 'bi-door-open-fill', '#15803d', 'القاعات', `${on.length} قاعة مفعّلة · ${capTotal} مقعد في الفترة`, `
      <div class="ex-two"><aside class="ex-side">
        <h6><i class="bi bi-sliders"></i> قواعد القاعات</h6>
        <div class="ex-opts">${[['ownFirst', 'قاعات الكلية أولاً ثم غيرها', 'قاعة كلية أخرى عند الحاجة وفي وقت فراغها فقط'], ['own', 'قاعات الكلية وحدها', 'لا تُستعمل قاعات الكليات الأخرى'], ['free', 'كل القاعات سواء', 'كل قاعة مفعّلة في وقت فراغها']]
          .map(([k, t, d]) => `<label class="${S.roomPolicy === k ? 'on' : ''}"><input type="radio" name="rp" data-rp="${k}" ${S.roomPolicy === k ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
        <div class="ex-sent">امتحان القاعة فوق <input type="number" class="form-control form-control-sm" data-k="splitOver" min="0" max="500" value="${S.splitOver || 0}"> طالباً يتوزع على قاعات، <input type="number" class="form-control form-control-sm" data-k="splitPer" min="5" max="200" value="${S.splitPer || 24}"> في كل قاعة <small>(0 = حسب السعة)</small></div>
        ${sw('blankHall', 'المقرر بلا نوع قاعة يُمتحن في قاعة', 'لا في مختبر')}
        ${(o => o.length && S.roomPolicy !== 'own' ? `<div class="ex-rule ${S.busy ? '' : 'warn'} mt-2"><i class="bi bi-info-circle-fill"></i> ${o.length} قاعة مفعّلة تابعة لـ${[...new Set(o.map(r => ownerOf(r.n)))].map(esc).join('، ')}: مشغولة في أوقات محاضراتها${S.busy ? '' : ' (الخيار متوقف)'} وامتحانات «المواعيد الثابتة». ${S.busy ? '' : 'في النهائي '}ارفع جدول امتحانات تلك الكلية ليُتجنّب التداخل.</div>` : '')(on.filter(r => !mineR(r.n)))}
      </aside><div class="ex-main2">
        <div class="ex-tbar"><span class="bdg"><i class="bi bi-easel2"></i> ${on.filter(r => r.t !== LAB).length} قاعة · ${on.filter(r => r.t !== LAB).reduce((a, r) => a + r.c, 0)} مقعد</span><span class="bdg teal"><i class="bi bi-pc-display"></i> ${on.filter(r => r.t === LAB).length} مختبر · ${on.filter(r => r.t === LAB).reduce((a, r) => a + r.c, 0)} جهاز</span>${on.some(r => !mineR(r.n)) ? `<span class="bdg amber">${on.filter(r => !mineR(r.n)).length} لكليات أخرى</span>` : ''}
          <span class="ms-auto d-flex flex-wrap gap-1"><button class="btn btn-sm btn-outline-primary" data-addr><i class="bi bi-plus-lg"></i> قاعة</button><button class="btn btn-sm btn-outline-success" data-addlabs><i class="bi bi-pc-display"></i> مختبرات الكلية</button>
          <span class="dropdown"><button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">المزيد</button><ul class="dropdown-menu">
            <li><button class="dropdown-item" data-allr="1">تفعيل الكل</button></li><li><button class="dropdown-item" data-allr="0">تعطيل الكل</button></li><li><button class="dropdown-item" data-scaler="1.1">السعة +10%</button></li><li><button class="dropdown-item" data-scaler="0.9">السعة −10%</button></li><li><button class="dropdown-item" data-resetr>إعادة الاقتراح</button></li></ul></span></span></div>
        <div class="ex-rooms tall"><table class="table table-sm align-middle"><thead><tr><th>مفعّلة</th><th>القاعة</th><th>النوع</th><th>السعة</th><th>تابعة لـ</th><th></th></tr></thead><tbody>
          ${R.map((r, k) => `<tr class="${r.on ? '' : 'off'}"><td><input type="checkbox" class="form-check-input" data-ron="${k}" ${r.on ? 'checked' : ''}></td><td><input class="form-control form-control-sm" data-rn="${k}" value="${esc(r.n)}"></td>
            <td><select class="form-select form-select-sm ex-rt ${r.t === LAB ? 'lab' : ''}" data-rt="${k}"><option ${r.t !== LAB ? 'selected' : ''}>${HALL}</option><option ${r.t === LAB ? 'selected' : ''}>${LAB}</option></select></td><td><input type="number" class="form-control form-control-sm" data-rc="${k}" value="${r.c}" min="1"></td><td class="small">${mineR(r.n) ? 'الكلية' : `<span class="bdg amber">${esc(ownerOf(r.n))}</span>`}</td><td><button class="btn btn-sm btn-outline-danger" data-delr="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>
        <details class="ex-fold mt-2"><summary class="small fw-bold">إضافة قاعات دفعة واحدة</summary><textarea class="form-control mt-1" rows="2" id="ex-bulkr" placeholder="B101, 40&#10;مختبر 3, 25, مختبر"></textarea><button class="btn btn-sm btn-outline-primary mt-1" data-bulkr>إضافة</button> <small>سطر لكل قاعة: الاسم، السعة (واكتب «مختبر» للمختبر).</small></details>
      </div></div>`)}
    ${bx(7, 'bi-person-badge-fill', '#be185d', 'المراقبون', 'العدد والحدود والاستثناءات', `
      <div class="ex-pset">
        <div class="f"><span>طريقة التوزيع</span><div class="seg">${[['room', 'مراقب لكل قاعة'], ['ratio', 'حسب عدد الطلبة']].map(([k, t]) => `<label class="${S.procMode === k ? 'on' : ''}"><input type="radio" name="pm" data-pm="${k}" ${S.procMode === k ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
        ${S.procMode === 'ratio' ? `<div class="f"><span>طالب لكل مراقب</span><input type="number" class="form-control form-control-sm" data-k="perProc" min="10" max="80" value="${S.perProc}"></div>
          <div class="f"><span>أقل عدد في القاعة</span><input type="number" class="form-control form-control-sm" data-k="minProc" min="1" max="5" value="${S.minProc || 1}"></div>` : ''}
        <div class="f"><span>أقصى في اليوم</span><input type="number" class="form-control form-control-sm" data-k="maxDutyDay" min="0" max="6" value="${S.maxDutyDay ?? 2}"></div>
        <div class="f"><span>أقصى في الدورة</span><input type="number" class="form-control form-control-sm" data-k="maxDuty" min="0" max="60" value="${S.maxDuty || 0}" title="0 = بلا حد"></div>
        <div class="f grow"><span>قائمة المراقبين <small>(اختياري: مشرفو المختبرات، الإداريون، الحدود الخاصة، المعفَون)</small></span>
          <div class="up">${(S.procList || []).length ? `<span class="st ok"><i class="bi bi-check-circle-fill"></i> ${esc(S.procInfo || S.procList.length + ' اسماً')}</span>` : '<span class="st">لم تُرفع</span>'}
            <button class="btn btn-sm btn-outline-primary" data-tpl="proc"><i class="bi bi-file-earmark-arrow-down"></i> النموذج</button>
            <label class="btn btn-sm ${(S.procList || []).length ? 'btn-outline-secondary' : 'btn-ex'} mb-0"><i class="bi bi-upload"></i> ${(S.procList || []).length ? 'استبدال' : 'رفع'}<input type="file" data-up="proc" accept=".xlsx,.xls,.csv" hidden></label>
            ${(S.procList || []).length ? '<button class="btn btn-sm btn-link text-danger p-0" data-procclr title="حذف القائمة"><i class="bi bi-trash"></i></button>' : ''}</div></div>
      </div>
      <div class="ex-pmore"><small><i class="bi bi-info-circle"></i> 0 = بلا حد · رئيس القسم والعميد في «قواعد الجدولة»</small>
        ${(S.procList || []).length ? sw('procOnly', 'المراقبة من القائمة فقط', '') : ''}
        <details class="ex-fold"><summary class="small fw-bold">إضافة أو إعفاء بالأسماء يدوياً${(S.extraProc || S.noProc) ? ' ●' : ''}</summary>
          <div class="row2 mt-1"><label class="ex-fld"><span>مراقبون إضافيون (اسم في كل سطر)</span><textarea class="form-control" rows="2" data-k="extraProc">${esc(S.extraProc)}</textarea></label>
          <label class="ex-fld"><span>معفَون من المراقبة (اسم في كل سطر)</span><textarea class="form-control" rows="2" data-k="noProc">${esc(S.noProc || '')}</textarea></label></div></details>
        ${(S.procList || []).length ? `<details class="ex-fold"><summary class="small fw-bold">عرض القائمة المرفوعة (${S.procList.length})</summary><div class="ex-rooms mt-1"><table class="table table-sm align-middle"><thead><tr><th>الاسم</th><th>الصفة</th><th>القسم</th><th>أقصى/الدورة</th><th>أقصى/اليوم</th><th>غير متاح</th><th></th></tr></thead><tbody>
          ${S.procList.map(p => `<tr class="${p.ex ? 'off' : ''}"><td>${esc(p.n)}</td><td class="small">${esc(p.role || '')}</td><td class="small">${esc(p.dept || '')}</td><td>${p.max || '—'}</td><td>${p.maxDay || '—'}</td>
            <td class="small">${(p.offW || []).map(i => WD[i]).concat((p.offD || []).map(d => dLong(d).replace(/\/\d{4}$/, ''))).join('، ') || '—'}</td><td>${p.ex ? '<span class="bdg">معفى</span>' : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</div>
      ${poolView()}`)}
    ${bx(8, 'bi-list-check', '#1d4ed8', 'المقررات', `${all.length - Object.keys(S.excl).filter(k => all.some(c => c.code === k)).length} من ${all.length} مقرراً لها امتحان`, `
      <div class="ex-reqbar"><label class="btn btn-sm btn-outline-primary mb-0"><i class="bi bi-file-earmark-arrow-up"></i> رفع قائمة المتطلبات<input type="file" data-up="req" accept=".xlsx,.xls,.csv" hidden></label>
        <button class="btn btn-sm btn-outline-secondary" data-tpl="req"><i class="bi bi-file-earmark-arrow-down"></i> النموذج</button>
        <span class="tx" title="رمز المادة، المنسق، قاعة / مختبر، عدد القاعات، عدد المراقبين، موعد ثابت، في آخر الجدول (أو تظليل الصف بالبرتقالي)، ملاحظات">رمز المادة، المنسق، قاعة / مختبر، عدد القاعات، عدد المراقبين، موعد ثابت، في آخر الجدول (أو تظليل الصف بالبرتقالي)، ملاحظات</span>
        ${S.reqOnly && !S.listMax ? `<label class="ex-chk${S.only && S.only.length ? ' on' : ''}"><input type="checkbox" data-reqonly ${S.only && S.only.length ? 'checked' : ''}> مواد القائمة فقط</label>` : ''}
        ${Object.keys(S.req || {}).length ? `<span class="bdg green"><i class="bi bi-check2-circle"></i> ${Object.keys(S.req).length} مقرراً لها متطلبات</span><button class="btn btn-sm btn-link text-danger p-0" data-clrreq title="مسح المتطلبات"><i class="bi bi-trash"></i> مسح</button>` : ''}</div>
      <div class="ex-add"><input class="form-control" data-f="cq" placeholder="ابحث في المقررات…" value="${esc(f.cq || '')}"><button class="btn btn-sm btn-outline-secondary" data-inclall="1">تضمين الكل</button><button class="btn btn-sm btn-outline-secondary" data-inclall="0">استبعاد الكل</button></div>
      <div class="ex-rooms tall"><table class="table table-sm align-middle"><thead><tr><th>امتحان</th><th>الرمز</th><th>المقرر</th><th>القسم</th><th>الطلبة</th><th>الشعب</th><th>نوع القاعة</th><th title="0 = حسب عدد الطلبة">عدد القاعات</th><th>مراقبون</th><th title="قرب نهاية أيام الامتحانات">آخر الجدول</th><th>ملاحظات المنسق</th><th>موعد ثابت</th></tr></thead><tbody>
        ${shown.map(c => `<tr class="${S.excl[c.code] ? 'off' : ''}"><td><input type="checkbox" class="form-check-input" data-incl="${esc(c.code)}" ${S.excl[c.code] ? '' : 'checked'}></td><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td class="small">${esc(c.dept)}</td><td>${c.n}</td><td>${c.k}</td>
          ${(q => `<td><select class="form-select form-select-sm ex-rt ${q.type === LAB ? 'lab' : q.type ? 'hall' : ''}" data-qt="${esc(c.code)}"><option value="">${S.blankHall ? 'قاعة (تلقائي)' : 'أي قاعة'}</option><option ${q.type === HALL ? 'selected' : ''}>${HALL}</option><option ${q.type === LAB ? 'selected' : ''}>${LAB}</option></select>${q.typeSrc ? '<small class="d-block text-muted" title="«جدول» في قائمة المنسق: حسب مكان تدريس المقرر في الجدول الدراسي؛ غيّره إن كان خطأ">حسب الجدول الدراسي</small>' : ''}</td>
          <td><input type="number" min="0" max="20" class="form-control form-control-sm ex-qn" data-qn="${esc(c.code)}" value="${q.rooms || ''}" placeholder="${(e => e && e.split ? e.rooms + ' تلقائياً' : 'تلقائي')(BY[c.code] && REQ(BY[c.code]))}"></td>
          <td><input type="number" min="0" max="20" class="form-control form-control-sm ex-qn" data-qp="${esc(c.code)}" value="${q.proc || ''}" placeholder="تلقائي"></td>
          <td class="text-center"><input type="checkbox" class="form-check-input" data-ql="${esc(c.code)}" ${q.late ? 'checked' : ''}></td>
          <td><input class="form-control form-control-sm ex-qnote" data-qx="${esc(c.code)}" value="${esc(q.note || '')}" placeholder="${q.coord ? esc(q.coord) : ''}"></td>`)((S.req || {})[c.code] || {})}
          <td>${((S.req || {})[c.code] || {}).at && S.pins[c.code] == null ? (a => `<span class="bdg amber" title="من قائمة المتطلبات">${esc(dLong(a.date).replace(/\/\d{4}$/, ''))} ${a.from}–${a.to}</span><button class="btn btn-sm btn-link p-0" data-qat="${esc(c.code)}">إلغاء</button>`)(S.req[c.code].at) : `<select class="form-select form-select-sm" data-pinc="${esc(c.code)}" ${S.excl[c.code] ? 'disabled' : ''}><option value="">تلقائي</option>${slots.map(([s, l]) => `<option value="${s}" ${S.pins[c.code] === s ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></div>
      <small class="text-muted">أزل علامة المقرر الذي لا امتحان له (مشروع، تدريب…). «نوع القاعة» و«عدد القاعات» كما يطلبها المدرّس أو المنسق: مثلاً 80 طالباً في 4 مختبرات = 20 في كل مختبر. «موعد ثابت» يثبّت المقرر في موعد لا يغيّره التوليد.</small>`, true)}
    </div>`;
    const sum = [`${TYPES[S.type].name} · ${facLabel()}`, `${nDays(DAYS.length)} من ${DAYS[0] ? DAYS[0].label : '—'}`, `${nPer(P)} يومياً`, `حتى ${S.maxDay} امتحان/يوم`,
      S.reg && S.src !== 'plans' ? 'كشف التسجيل' : S.regN && S.src !== 'plans' ? 'أعداد من ملف' : 'الخطط الدراسية', `${on.length} قاعة · ${capTotal} مقعد`, (S.procMode === 'ratio' ? `طالب/مراقب: ${S.perProc}` : 'مراقب لكل قاعة'), `${C.length} من ${all.length} مقرراً`];
    const k = Math.min(parts.length - 1, Math.max(0, (S.setTab || 1) - 1)), [n, ic, color, ti, sub, bodyHtml] = parts[k];
    return `<div class="ex-intro"><i class="bi bi-1-circle-fill"></i><div><b>الخطوة 1: الإعداد.</b> اختر قسماً من القائمة، أو تنقّل بزرّي «القسم التالي/السابق». الإعدادات كلها مقترحة مسبقاً ويمكن تركها كما هي، ثم اضغط <b>«التالي: التوليد والتعديل»</b>. كل تغيير يُحفظ تلقائياً.</div></div>
      <div class="ex-setwrap"><nav class="ex-setnav" aria-label="أقسام الإعداد">${parts.map((p, x) => `<button class="ex-sn${x === k ? ' on' : ''}" data-st="${x + 1}" style="--a:${p[2]}"><span class="bn">${p[0]}</span><i class="bi ${p[1]}"></i><span class="tx"><b>${p[3]}</b><small>${esc(sum[x] || '')}</small></span></button>`).join('')}</nav>
      <div class="ex-setmain">${box(n, ic, color, ti, sub, bodyHtml, true)}
        <div class="ex-subnav">${k > 0 ? `<button class="btn btn-outline-secondary" data-st="${k}"><i class="bi bi-arrow-right"></i> ${parts[k - 1][3]}</button>` : '<span></span>'}
        ${k < parts.length - 1 ? `<button class="btn btn-outline-primary" data-st="${k + 2}">القسم التالي: ${parts[k + 1][3]} <i class="bi bi-arrow-left"></i></button>` : `<button class="btn btn-ex" id="ex-setdone">انتهيت — ولّد الجدول <i class="bi bi-magic"></i></button>`}</div></div></div>`;

  }
  // saved versions of this plan and which one is approved: one row above the outputs
  function versBar() {
    const app = S.approved;
    return `<div class="ex-vers"><span class="st ${app ? 'ok' : ''}"><i class="bi ${app ? 'bi-patch-check-fill' : 'bi-patch-exclamation'}"></i> ${app ? `معتمدة: <b>${esc(app)}</b>` : 'غير معتمدة بعد'}</span>
      <span class="new"><input class="form-control form-control-sm" id="ex-dname" placeholder="اسم النسخة، مثل: مسودة ${S.drafts.length + 1}"><button class="btn btn-sm btn-ex" id="ex-dsave"><i class="bi bi-save"></i> حفظ نسخة</button></span>
      <span class="list">${S.drafts.map((d, k) => `<span class="v${app === d.name ? ' app' : ''}" title="${esc(d.at)} · ${d.n} مقرراً"><i class="bi ${app === d.name ? 'bi-patch-check-fill' : 'bi-file-earmark-text'}"></i> ${esc(d.name)}
        <button data-dload="${k}" title="فتح هذه النسخة"><i class="bi bi-folder2-open"></i></button><button data-dapp="${k}" title="${app === d.name ? 'إلغاء الاعتماد' : 'اعتماد هذه النسخة'}"><i class="bi ${app === d.name ? 'bi-x-circle' : 'bi-patch-check'}"></i></button><button data-ddel="${k}" title="حذف"><i class="bi bi-trash"></i></button></span>`).join('') || '<small>لا نسخ محفوظة بعد: احفظ نسخة ثم اعتمدها.</small>'}</span></div>`;
  }
  function draftsView() {
    return `<div class="ex-set">
      ${box(1, 'bi-save-fill', '#0b4a66', 'حفظ نسخة', 'لا يُحفظ شيء على هذا الجهاز إلا بزر «حفظ» (هنا أو في الشريط السفلي)', `
        <div class="ex-add"><input class="form-control" id="ex-dname" placeholder="اسم النسخة، مثل: مسودة 1"><button class="btn btn-ex" id="ex-dsave"><i class="bi bi-save"></i> حفظ</button></div>
        <ul class="ex-drafts">${S.drafts.map((d, k) => `<li class="${S.approved === d.name ? 'app' : ''}"><i class="bi ${S.approved === d.name ? 'bi-patch-check-fill' : 'bi-file-earmark-text'}"></i><span><b>${esc(d.name)}</b><small>${esc(d.at)} · ${d.n} مقرر</small></span>
          ${S.approved === d.name ? '<span class="bdg green">معتمدة</span>' : ''}<span class="acts"><button class="btn btn-sm btn-outline-primary" data-dload="${k}"><i class="bi bi-folder2-open"></i> فتح</button><button class="btn btn-sm btn-outline-success" data-dapp="${k}"><i class="bi bi-patch-check"></i> ${S.approved === d.name ? 'إلغاء الاعتماد' : 'اعتماد'}</button><button class="btn btn-sm btn-outline-danger" data-ddel="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></span></li>`).join('') || '<li class="empty">لا نسخ محفوظة بعد.</li>'}</ul>`)}
      ${box(2, 'bi-share-fill', '#6d28d9', 'المشاركة مع اللجنة', 'ملف واحد يحمل الجدول وكل الإعدادات', `
        <p>صدّر الخطة كملف وأرسله لأعضاء اللجنة؛ يفتحونه هنا بـ«استيراد» ليروا الجدول نفسه ويعدّلوا عليه.</p>
        <div class="ex-acts"><button class="btn btn-outline-primary" id="ex-export"><i class="bi bi-download"></i> تصدير ملف الخطة</button>
        <label class="btn btn-outline-primary mb-0"><i class="bi bi-upload"></i> استيراد ملف<input type="file" id="ex-import" accept=".json" hidden></label></div>
        <hr><div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-danger" id="ex-reset"><i class="bi bi-trash"></i> بدء خطة جديدة</button>
        ${HAS ? '<button class="btn btn-outline-secondary" id="ex-forget"><i class="bi bi-eraser"></i> مسح المحفوظ من هذا الجهاز</button>' : ''}</div>`)}
      ${box(3, 'bi-collection-fill', '#0f766e', 'الخطط', 'كل خطط الامتحانات على هذا الجهاز، والخطط الجاهزة على الموقع', plansBox())}</div>`;
  }
  // leaving the open plan (to another one): its unsaved changes are saved first, or dropped, as the user says
  function leaveCur(go) {
    if (DIRTY) { if (confirm('في الخطة المفتوحة تغييرات غير محفوظة. اضغط «موافق» لحفظها قبل الانتقال، أو «إلغاء» للانتقال دون حفظها.')) store(); else { DIRTY = false; EDITED = false; } }
    if (HAS && !SWAPPED && !stash()) return;   // the saved plan goes to the list
    go();
  }
  function openLib(k) {
    const lib = libGet(), x = lib[k]; if (!x) return;
    let o; try { o = JSON.parse(x.plan); } catch (e) { alert('تعذّر فتح الخطة.'); return; }
    leaveCur(() => {
      const l = libGet().filter(y => y.plan !== x.plan); if (!libSet(l)) return;
      try { localStorage.setItem(KEY, x.plan); } catch (e) { alert('تعذّر الفتح: مساحة التخزين ممتلئة.'); return; }
      S = o; migrate(); SWAPPED = false; DIRTY = false; HAS = true; tab = S.setupDone ? 'grid' : 'set'; build(); render(); savebar();
    });
  }
  // the plans bar above every step: which plan is open, the others on this device, a new plan, a copy
  function planBar() {
    let cur = null; try { cur = localStorage.getItem(KEY); } catch (e) { /* */ }
    const lib = libGet().map((x, k) => ({ ...x, k })).filter(x => x.plan !== cur);
    return `<div class="ex-pbar"><i class="bi bi-collection-fill"></i><span class="ex-pbar-l">الخطة المفتوحة:</span>
      <div class="dropdown"><button class="btn btn-sm ex-pbar-cur dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><b>${esc(planName(S))}</b><small>${esc((TYPES[S.type] || {}).name || '')} · ${C.length} امتحاناً${S.approved ? ' · معتمدة' : ''}${DIRTY || SWAPPED ? ' · غير محفوظة' : ''}</small></button>
        <ul class="dropdown-menu ex-pbar-menu">${lib.length ? lib.map((x, k) => `<li><button class="dropdown-item" data-libopen="${x.k}"><i class="bi bi-file-earmark-text"></i> <span><b>${esc(x.name)}</b><small>${esc(x.type)} · ${x.n} امتحاناً${x.approved ? ' · معتمدة' : ''}</small></span></button></li>`).join('')
          : '<li><span class="dropdown-item-text small text-muted">لا خطط أخرى على هذا الجهاز بعد</span></li>'}
          ${(SITEPLANS || []).length ? '<li><hr class="dropdown-divider"></li><li><h6 class="dropdown-header">جاهزة على الموقع</h6></li>' + SITEPLANS.map(x => `<li><a class="dropdown-item" href="?plan=${encodeURIComponent(x.name)}"><i class="bi bi-cloud-download"></i> <span><b>${esc(x.label)}</b></span></a></li>`).join('') : ''}
          <li><hr class="dropdown-divider"></li><li><h6 class="dropdown-header">مشاركة مع اللجنة (ملف)</h6></li>
          <li><button class="dropdown-item" id="ex-export"><i class="bi bi-download"></i> <span><b>تصدير ملف الخطة</b><small>ملف واحد بالجدول وكل الإعدادات</small></span></button></li>
          <li><label class="dropdown-item mb-0"><i class="bi bi-upload"></i> <span><b>استيراد ملف خطة</b><small>يفتح خطة أرسلها عضو في اللجنة</small></span><input type="file" id="ex-import" accept=".json" hidden></label></li>
          ${lib.length ? lib.map(x => `<li><button class="dropdown-item text-danger" data-libdel="${x.k}"><i class="bi bi-trash"></i> <span>حذف «${esc(x.name)}» من الجهاز</span></button></li>`).join('') : ''}
          ${HAS ? '<li><button class="dropdown-item text-danger" id="ex-forget"><i class="bi bi-eraser"></i> <span>مسح المحفوظ من هذا الجهاز</span></button></li>' : ''}</ul></div>
      <input class="form-control form-control-sm ex-pbar-name" data-k="label" value="${esc(S.label || '')}" placeholder="اسم الخطة" aria-label="اسم الخطة">
      <span class="ex-pbar-k" title="الكليات · المقررات · الأيام والفترات · القاعات"><i class="bi bi-building"></i> ${esc(facLabel())} · ${C.length} مقرراً · ${nDays(DAYS.length)} × ${nPer(P)} · ${rooms().filter(r => r.on).length} قاعة (${capTotal} مقعد/فترة)</span>
      ${S.only && S.only.length ? `<span class="ex-pbar-only" title="${S.reqOnly && !S.listMax ? 'الخطة لمواد قائمة المتطلبات ومعها الامتحانات الثابتة للجهات الأخرى' : 'الخطة مقصورة على مواد الملف، بصرف النظر عن الكلية'}${Object.keys(PARTS).length ? ` · ${Object.keys(PARTS).length} مقررات مقسومة على أكثر من جلسة` : ''}"><i class="bi bi-funnel-fill"></i> مقصورة على ${S.only.length} مقرراً${FX.inPlan.size ? ` + ${FX.inPlan.size} ثابتاً` : ''}<button data-noonly title="إلغاء القصر" aria-label="إلغاء القصر"><i class="bi bi-x"></i></button></span>` : ''}
      <span class="ms-auto d-flex gap-1"><button class="btn btn-sm btn-outline-primary" data-plannew title="خطة جديدة"><i class="bi bi-plus-lg"></i> جديدة</button><button class="btn btn-sm btn-outline-secondary" data-plancopy title="نسخة من هذه الخطة"><i class="bi bi-copy"></i> نسخة</button></span></div>`;
  }
  let SITEPLANS = null;
  function plansBox() {
    const lib = libGet(), cur = planName(S);
    return `<h6 class="small fw-bold text-muted mb-1"><i class="bi bi-laptop"></i> على هذا الجهاز</h6><ul class="ex-drafts">
      <li class="app"><i class="bi bi-check-circle-fill"></i><span><b>${esc(cur)}</b><small>مفتوحة الآن · ${C.length} امتحاناً${HAS && !SWAPPED ? ' · محفوظة' : ' · <b class="text-danger">غير محفوظة</b>'}</small></span></li>
      ${lib.map((x, k) => x.plan === (() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } })() ? '' : `<li><i class="bi bi-file-earmark-text"></i><span><b>${esc(x.name)}</b><small>${esc(x.type)} · ${x.n} امتحاناً${x.approved ? ' · معتمدة: ' + esc(x.approved) : ''} · نُقلت إلى القائمة ${esc(x.at)}</small></span>
        <span class="acts"><button class="btn btn-sm btn-outline-primary" data-libopen="${k}"><i class="bi bi-folder2-open"></i> فتح</button><button class="btn btn-sm btn-outline-danger" data-libdel="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></span></li>`).join('')}</ul>
      ${lib.length ? '' : '<p class="small text-muted mb-2">عند حفظ خطة مفتوحة من رابط أو ملف تُنقل الخطة المحفوظة قبلها إلى هنا، فلا تضيع.</p>'}
      ${SITEPLANS.length ? `<h6 class="small fw-bold text-muted mt-3 mb-1"><i class="bi bi-globe2"></i> خطط جاهزة على الموقع</h6><ul class="ex-drafts">${SITEPLANS.map(x => `<li><i class="bi bi-cloud-download"></i><span><b>${esc(x.label)}</b><small>${esc(x.note || '')}</small></span>
        <span class="acts"><a class="btn btn-sm btn-outline-primary" href="?plan=${encodeURIComponent(x.name)}"><i class="bi bi-folder2-open"></i> فتح</a></span></li>`).join('')}</ul>` : ''}`;
  }

  // ---------- render & events ----------
  const onlyBar = () => S.only && S.only.length ? `<div class="alert alert-info small d-flex flex-wrap align-items-center gap-2 py-2 mb-2"><i class="bi bi-funnel-fill"></i>
    <span>${S.reqOnly && !S.listMax ? `الخطة لمواد قائمة المتطلبات: <b>${S.only.length}</b> مقرراً${FX.inPlan.size ? `، ومعها <b>${FX.inPlan.size}</b> امتحاناً ثابتاً لجهات أخرى` : ''}` : `الخطة مقصورة على <b>${S.only.length}</b> مقرراً${S.label ? ` (${esc(S.label)})` : ''}، بصرف النظر عن الكلية`}${Object.keys(PARTS).length ? ` · ${Object.keys(PARTS).length} مقررات مقسومة شعبُها على أكثر من جلسة` : ''}.</span>
    <button class="btn btn-sm btn-link ms-auto" data-noonly>إلغاء القصر</button></div>` : '';
  function render() {
    if (tab === 'drafts') tab = 'out';   // (the old «الحفظ والاعتماد» step is now part of this one)
    const st = stats();
    PROB = new Set(st.is.flatMap(x => x.cs).concat(st.seat.unseated.map(u => u.c.i), st.seat.short.map(u => u.c.i)));
    const body = tab === 'grid' ? gridView(st) : tab === 'check' ? checkView(st) : tab === 'out' ? outView_() : tab === 'set' ? setView() : draftsView();
    const y = window.scrollY, focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f;
    if (SITEPLANS === null) { SITEPLANS = []; U.getJSON('data/exams/plans/index.json').then(x => { SITEPLANS = Array.isArray(x) ? x : []; render(); }).catch(() => {}); }
    $(APP).innerHTML = planBar() + head(st) + `<div class="ex-body">${body}</div>` + navBtns();
    if (focus) { const el = $(APP).querySelector(`[data-f="${focus}"]`); if (el && el.focus) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }
    const sn = $(APP).querySelector('.ex-sn.on'), nav = sn && sn.parentElement;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = sn.offsetLeft - (nav.clientWidth - sn.offsetWidth) / 2;
    window.scrollTo(0, y);
  }
  const push = () => { undo.push(JSON.stringify({ slot: S.slot, pins: S.pins })); if (undo.length > 40) undo.shift(); };
  function move(i, s) {
    if (C[i].s === s) return;
    push(); C[i].s = s; S.slot[C[i].code] = s; if (C[i].pin != null) { C[i].pin = s; S.pins[C[i].code] = s; }
    save(); sel = null; render();
  }
  function busy(fn) {
    const b = $(APP).querySelector('.ex-body');
    if (b) b.insertAdjacentHTML('afterbegin', `<div class="ex-busy"><div class="spinner-border spinner-border-sm"></div> يبحث عن أفضل توزيع لـ${C.length} امتحاناً…</div>`);
    setTimeout(() => { fn(); render(); }, 40);
  }
  const rebuild = () => { save(); build(); render(); };
  // the registration report: «كشف تسجيل الطلبة» from the registration system (an HTML page saved as .xls, one block per student),
  // or any Excel / CSV sheet with a student-number column and a course-code column; it may cover a department, a faculty or the whole university
  function parseReport(text, known) {
    const toks = text.replace(/&nbsp;/g, ' ').split(/<[^>]+>/).map(x => x.trim()).filter(Boolean);
    const by = {}, sec = {}, fac = {}, who = {}, mine = {}, isNum = x => /^\d+$/.test(x);
    let stu = null;
    const val = i => { let j = i + 1; while (j < toks.length && toks[j] === ':') j++; return toks[j] || ''; };
    for (let i = 0; i < toks.length; i++) {
      const x = toks[i];
      if (x === 'إسم الطالب' || x === 'اسم الطالب') { const nm = val(i); let j = i + 1; while (j < toks.length && toks[j] !== 'رقم الطالب' && j < i + 6) j++; who[toks[j] === 'رقم الطالب' ? val(j) : '?'] = { name: nm }; continue; }
      if (x === 'رقم الطالب') { stu = val(i); who[stu] = who[stu] || { name: '' }; continue; }
      if (stu && /^التخص[ـ]*ص$/.test(x)) { who[stu].major = val(i); continue; }
      if (stu && /^الكل[ـ]*ية$/.test(x)) { fac[stu] = val(i); continue; }
      if (stu && /^\d{6,7}$/.test(x) && known.has(x) && x !== stu) {
        (by[stu] = by[stu] || new Set()).add(x);
        const h = toks[i + 2], sn = toks[i + 3], act = toks[i + 4];
        if (isNum(h || '') && isNum(sn || '') && act === 'نظري') { const k = x; (sec[k] = sec[k] || {})[String(+sn)] = ((sec[k] || {})[String(+sn)] || 0) + 1; ((mine[k] = mine[k] || {})[stu] = String(+sn)); }
        else if (!(mine[x] && mine[x][stu])) (mine[x] = mine[x] || {})[stu] = '';
      }
    }
    return { by, sec, fac, who, mine };
  }
  // a sheet with named columns (the site's template or the user's own): which column is which, by its header
  const COLN = { id: /رقم\s*الطالب|الرقم\s*الجامعي|student\s*(id|no|number)/i, name: /[إا]سم\s*الطالب|student\s*name/i, code: /رمز\s*الماد|رمز\s*المقرر|رقم\s*الماد|رقم\s*المقرر|course\s*(code|no|id)|^رمز$/i,
    cname: /[إا]سم\s*الماد|[إا]سم\s*المقرر|course\s*(name|title)/i, sec: /شعب|section/i, major: /تخصص|major/i, note: /ملاحظ|note/i };
  function headerMap(rows) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const h = (rows[i] || []).map(v => String(v || '').replace(/\s+/g, ' ').trim()), m = { row: i };
      Object.entries(COLN).forEach(([k, re]) => { m[k] = h.findIndex(x => re.test(x)); });
      if (m.id >= 0 && m.code >= 0) return m;
    }
    return null;
  }
  function fromTable(rows, H, known) {
    const by = {}, who = {}, mine = {}, sec = {}, names = {}, lec = {}, labOf = new Set();
    rows.forEach(r => {
      const id = String(r[H.id] == null ? '' : r[H.id]).trim(), code = String(r[H.code] == null ? '' : r[H.code]).trim().replace(/\.0$/, '');
      if (!/^\d{4,12}$/.test(id) || !/^\d{4,8}$/.test(code) || (known && !known.has(code))) return;
      (by[id] = by[id] || new Set()).add(code);
      const w = who[id] = who[id] || { name: '' };
      if (H.name >= 0 && r[H.name]) w.name = String(r[H.name]).trim();
      if (H.major >= 0 && r[H.major]) w.major = String(r[H.major]).trim();
      if (H.fac >= 0 && r[H.fac]) w.fac = String(r[H.fac]).trim();
      const sn = H.sec >= 0 && r[H.sec] != null && String(r[H.sec]).trim() !== '' ? String(+r[H.sec] || String(r[H.sec]).trim()) : '';
      // a course with a lecture and a lab: the student's section is the lecture's
      const lab = H.act >= 0 && /عملي/.test(String(r[H.act] || '')), key = id + '|' + code, o = mine[code] = mine[code] || {}, prev = o[id];
      if (prev === undefined || (!prev && sn) || (sn && labOf.has(key) && !lab)) {
        if (prev && sec[code] && sec[code][prev]) { sec[code][prev]--; if (!sec[code][prev]) delete sec[code][prev]; }
        o[id] = sn; if (sn) { const so = sec[code] = sec[code] || {}; so[sn] = (so[sn] || 0) + 1; }
        if (lab) labOf.add(key); else labOf.delete(key);
      }
      // «( 08:00_09:30 , ن وجاهي, ر وجاهي )»: the in-person meetings of this course
      if (H.time >= 0 && r[H.time]) for (const m of String(r[H.time]).matchAll(/\(\s*(\d{1,2}:\d{2})\s*_\s*(\d{1,2}:\d{2})\s*,([^)]*)\)/g))
        for (const d of m[3].matchAll(/([حنثرخسج])\s+(وجاهي|مدمج)/g)) (lec[id] = lec[id] || []).push([d[1], U.toMin(m[1]), U.toMin(m[2]), code]);
      if (H.cname >= 0 && r[H.cname]) names[code] = names[code] || String(r[H.cname]).trim();
    });
    const fac = {}; Object.entries(who).forEach(([id, w]) => { if (w.fac) fac[id] = w.fac; });
    return { by, sec, fac, who, mine, names, lec };
  }
  // the registration system's «كشف تسجيل الطلبة» saved as Excel: one row per student and course, the labels repeated in each
  // row (رقم المقرر … إسم المدرس) and the values right after them; the student's name, number, major and faculty first
  function flatHeader(rows) {
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const r = rows[i] || [], h = r.map(v => String(v || '').replace(/\s+/g, ' ').trim());
      const j = h.findIndex(x => /^(رقم|رمز)\s*(المقرر|المادة)$/.test(x)); if (j < 0) continue;
      const k = h.findIndex((x, n) => n > j && /[إا]سم\s*المدرس|^المدرس$/.test(x)); if (k < 0) continue;
      const L = k - j + 1, lab = h.slice(j, k + 1), at = re => { const x = lab.findIndex(y => re.test(y)); return x < 0 ? -1 : j + L + x; };
      if (!/^\d{4,8}$/.test(String(r[j + L] || '').trim())) continue;
      const id = r.findIndex((v, n) => n < j && /^\d{6,12}$/.test(String(v).trim())); if (id < 0) continue;
      const txt = n => n >= 0 && n < j && /[؀-ۿ]/.test(String(r[n] || '')) && !/[:：]$|^:$|التخص|الكل/.test(String(r[n]).trim());
      return { row: i, id, name: txt(id - 1) ? id - 1 : -1, major: txt(id + 1) ? id + 1 : -1, fac: txt(id + 2) ? id + 2 : -1, code: j + L,
        cname: at(/[إا]سم\s*(المقرر|المادة)/), sec: at(/الشعبة/), act: at(/النشاط/), time: at(/الوقت/) };
    }
    return null;
  }
  // dates and times as committees write them: 2026/12/10, 10/12/2026, a date cell; «10.00 - 10.50», «2-3:30» (afternoon), 14:00
  const digits = v => String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  function pDate(v, yr) {
    const x = digits(v), z = n => String(n).padStart(2, '0'), ok = (y, m, d) => +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 ? `${y}-${z(+m)}-${z(+d)}` : '';
    let m;
    if ((m = x.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/))) return ok(m[1], m[2], m[3]);
    if ((m = x.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/))) return ok(m[3], m[2], m[1]);
    if ((m = x.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})\b/))) return ok('20' + m[3], m[2], m[1]);
    if (/^\d{5}(\.\d+)?$/.test(x)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+x) * 864e5).toISOString().slice(0, 10);
    if (yr && (m = x.match(/^(\d{1,2})[/\-.](\d{1,2})$/))) return ok(yr, m[2], m[1]);
    return '';
  }
  const hm = (h, mi) => { h = +h; if (h <= 7) h += 12; return h * 60 + (+mi || 0); };   // an hour before 8 is in the afternoon
  function pTimes(v) {
    const x = digits(v); if (/^0?\.\d+$/.test(x)) { const t = Math.round(+x * 1440); return [U.toTime(t), U.toTime(t + 60)]; }
    const ts = [...x.matchAll(/(\d{1,2})(?:[:.](\d{2}))?/g)].map(m => hm(m[1], m[2])).filter(t => t >= 420 && t <= 1380);
    if (!ts.length) return null;
    const a = Math.min(...ts), b = ts.length > 1 ? Math.max(...ts) : a + 60;
    return [U.toTime(a), U.toTime(b > a ? b : a + 60)];
  }
  // a date and a time range written in a note, e.g. «Tues. (2-3:30)-22/12/2026»
  function noteAt(note, yr) {
    const x = digits(note), dm = x.match(/\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/); if (!dm) return null;
    const date = pDate(dm[0], yr), rest = x.replace(dm[0], ' '), tm = rest.match(/(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?/);
    if (!date || !tm) return null;
    const a = hm(tm[1], tm[2]), b = hm(tm[3], tm[4]);
    return { date, from: U.toTime(Math.min(a, b)), to: U.toTime(Math.max(a, b)) };
  }
  const secList = v => { const x = digits(v); if (!x || /كل|جميع|all/i.test(x)) return [];
    const m = x.match(/^(\d+)\s*[-–]\s*(\d+)$/); if (m && +m[2] > +m[1] && +m[2] - +m[1] < 40) return Array.from({ length: +m[2] - +m[1] + 1 }, (_, k) => String(+m[1] + k));
    return [...new Set((x.match(/\d+/g) || []).map(n => String(+n)))]; };
  const yes = v => /^(نعم|ن|✓|✔|x|yes|y|1|true|صح)$/i.test(String(v == null ? '' : v).trim());
  // ---------- reading Excel files here (no library needed): the first sheet's cells as text, dates as YYYY-MM-DD, times as HH:MM,
  // and which rows are filled orange (the committee marks courses that way) ----------
  async function unzip(buf, want) {
    const v = new DataView(buf), u8 = new Uint8Array(buf), out = {};
    let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip');
    let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true), td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (!want.test(name)) continue;
      const at = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = u8.subarray(at, at + size);
      out[name] = method === 0 ? td.decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    return out;
  }
  const xmlT = x => String(x || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
  const runs = x => xmlT((String(x).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
  const attr = (tag, a) => { const m = tag.match(new RegExp('\\b' + a + '="([^"]*)"')); return m ? m[1] : null; };
  // orange: hue 15°–45°, clearly coloured (Excel's «orange, accent 2» and its lighter tints)
  function orangeHex(hex, tint) {
    if (!hex || hex.length < 6) return false; hex = hex.slice(-6);
    let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); const t = +tint || 0;
    if (t) [r, g, b] = [r, g, b].map(c => t > 0 ? c + (255 - c) * t : c * (1 + t));
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = (mx - mn) / 255; if (!d) return false;
    const sat = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4);
    return sat > 0.4 && l < 0.95 && h >= 15 && h <= 45;
  }
  async function readXlsx(buf) {
    const F = await unzip(buf, /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|theme\/theme1\.xml)$/i);
    const wbx = F['xl/workbook.xml']; if (!wbx) throw new Error('not xlsx');
    let target = 'worksheets/sheet1.xml'; const rid = attr((wbx.match(/<sheet\b[^>]*>/) || [''])[0], 'r:id'), rels = F['xl/_rels/workbook.xml.rels'] || '';
    const rel = rid && (rels.match(new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>')) || [])[0]; if (rel && attr(rel, 'Target')) target = attr(rel, 'Target').replace(/^\/?xl\//, '');
    const sheet = Object.values(await unzip(buf, new RegExp('^xl/' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')))[0];
    if (sheet == null) throw new Error('no sheet');
    const sst = (F['xl/sharedStrings.xml'] || '').match(/<si\b[\s\S]*?<\/si>/g) || [], SST = sst.map(runs);
    const st = F['xl/styles.xml'] || '', part = tag => (st.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>')) || [])[1] || '';
    const fmts = {}; (part('numFmts').match(/<numFmt\b[^>]*>/g) || []).forEach(x => { fmts[+attr(x, 'numFmtId')] = xmlT(attr(x, 'formatCode')); });
    const theme = {}, TH = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    TH.forEach((k, j) => { const m = (F['xl/theme/theme1.xml'] || '').match(new RegExp('<a:' + k + '>[\\s\\S]*?(?:val|lastClr)="([0-9A-Fa-f]{6})"')); theme[j] = m ? m[1] : ''; });
    const fills = (part('fills').match(/<fill\b[^>]*\/>|<fill\b[\s\S]*?<\/fill>/g) || []).map(f => { const fg = (f.match(/<fgColor\b[^>]*>/) || [])[0];
      if (!fg || !/patternType="solid"/.test(f)) return false; const th = attr(fg, 'theme'); return orangeHex(attr(fg, 'rgb') || (th != null ? theme[+th] : ''), attr(fg, 'tint')); });
    const xfs = (part('cellXfs').match(/<xf\b[^>]*>/g) || []).map(x => { const id = +(attr(x, 'numFmtId') || 0), code = (fmts[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
      return { orange: !!fills[+(attr(x, 'fillId') || 0)], date: (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmyhs]/i.test(code), dayless: (id >= 18 && id <= 21) || (id >= 45 && id <= 47) || (/[hs]/i.test(code) && !/[dy]/i.test(code)) }; });
    const col = r => { let n = 0; for (const ch of r.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const rows = [], orange = new Set(), reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m, ri = 0;
    while ((m = reRow.exec(sheet))) {
      const rr = attr(m[1], 'r'); ri = rr ? +rr - 1 : ri; const row = []; let ci = 0, c;
      reC.lastIndex = 0;
      while (m[2] && (c = reC.exec(m[2]))) {
        const a = c[1], ref = attr(a, 'r'), t = attr(a, 't'), x = xfs[+(attr(a, 's') || 0)] || {}, body = c[2] || '';
        ci = ref ? col(ref) : ci; const vv = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (t === 's') val = SST[+vv] || ''; else if (t === 'inlineStr') val = runs(body); else if (t === 'b') val = vv === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e' || t === 'd') val = xmlT(vv);
        else if (vv != null && vv !== '') { const n = +vv;
          if (x.date && !isNaN(n)) { const mins = Math.round((n % 1) * 1440); val = x.dayless || n < 1 ? U.toTime(mins % 1440) : new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5).toISOString().slice(0, 10); }
          else val = String(n); }
        if (x.orange && val !== '') orange.add(ri);
        while (row.length < ci) row.push(''); row[ci] = val; ci++;
      }
      while (rows.length < ri) rows.push([]); rows[ri] = row; ri++;
    }
    return { rows, orange };
  }
  const csvRows = buf => decode(buf).replace(/^\ufeff/, '').split(/\r?\n/).map(l => l.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, '')));
  // any uploaded table: CSV, .xlsx (read here), else the Excel library (.xls…)
  const sheetOf = (file, buf) => /\.(csv|txt)$/i.test(file.name) ? Promise.resolve({ rows: csvRows(buf), orange: new Set() })
    : readXlsx(buf).catch(() => loadXLSX().then(() => { const wb = XLSX.read(buf, { type: 'array', cellDates: true }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      return { rows: rows.map(r => r.map(v => v instanceof Date ? (v.getFullYear() < 1901 ? U.toTime(v.getHours() * 60 + v.getMinutes()) : new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10)) : v == null ? '' : String(v))), orange: new Set() }; }));
  const tableOf = (file, buf) => sheetOf(file, buf).then(x => x.rows);
  // templates with clear column names (Excel; the instructions sheet explains each column)
  const TPL = {
    reg: { file: 'نموذج_كشف_التسجيل.xlsx', cols: ['رقم الطالب', 'اسم الطالب', 'رمز المادة', 'اسم المادة', 'الشعبة', 'التخصص'],
      ex: [['202410001', 'مثال: أحمد محمد علي', '601222', 'تراكيب البيانات والخوارزميات', '1', 'علم الحاسوب'], ['202410001', 'مثال: أحمد محمد علي', '603385', 'إدارة قواعد البيانات', '2', 'علم الحاسوب']],
      help: [['رقم الطالب', 'إجباري', 'الرقم الجامعي كما في نظام التسجيل'], ['اسم الطالب', 'اختياري', 'يظهر في كشوف الحضور فقط، ولا يُحفظ'], ['رمز المادة', 'إجباري', 'رمز المقرر كما في الجدول الدراسي، مثل 601222'],
        ['اسم المادة', 'اختياري', 'للتوضيح'], ['الشعبة', 'اختياري', 'رقم الشعبة؛ يوزّع الطلبة على القاعات حسب شعبهم'], ['التخصص', 'اختياري', 'يظهر في كشوف الحضور']] },
    mk: { file: 'نموذج_الامتحان_التكميلي.xlsx', cols: ['رقم الطالب', 'اسم الطالب', 'رمز المادة', 'اسم المادة', 'الشعبة', 'التخصص', 'ملاحظات'],
      ex: [['202310045', 'مثال: سارة خالد يوسف', '601281', 'قواعد البيانات (1)', '2', 'علم الحاسوب', 'غياب بعذر عن النهائي'], ['202210133', 'مثال: محمد سامي حسن', '601222', 'تراكيب البيانات والخوارزميات', '1', 'هندسة البرمجيات', '']],
      help: [['رقم الطالب', 'إجباري', 'الرقم الجامعي'], ['اسم الطالب', 'اختياري', 'يظهر في كشوف الحضور فقط، ولا يُحفظ'], ['رمز المادة', 'إجباري', 'المقرر الذي للطالب فيه امتحان تكميلي؛ صف لكل طالب ومقرر'],
        ['اسم المادة', 'مُستحسن', 'يلزم إن لم يكن المقرر مطروحاً هذا الفصل'], ['الشعبة', 'اختياري', 'رقم الشعبة'], ['التخصص', 'اختياري', 'يظهر في كشوف الحضور'], ['ملاحظات', 'اختياري', 'مثل سبب التأجيل']] },
    // a list of courses and sections with their numbers of students (e.g. the university requirements): the sample is not real
    list: { file: 'نموذج_قائمة_مواد_متطلبات_الجامعة.xlsx', sheet: 'المواد', cols: ['التسلسل', 'رقم المادة', 'ش', 'اسم المادة', 'اسم المحاضر', 'عدد الطلبة'],
      ex: [['1', '9900101', '1', 'مادة تجريبية أ (مثال)', 'د. مدرس أول (مثال)', '85'], ['2', '9900101', '2', 'مادة تجريبية أ (مثال)', 'د. مدرس ثانٍ (مثال)', '78'],
        ['3', '9900202', '1', 'مادة تجريبية ب (مثال)', 'د. مدرس ثالث (مثال)', '90'], ['4', '9900303', '1', 'مادة تجريبية ج (مثال)', 'د. مدرس أول (مثال)', '42']],
      help: [['التسلسل', 'اختياري', 'رقم الصف'], ['رقم المادة', 'إجباري', 'رمز المقرر كما في الجدول الدراسي، مثل 9400107'], ['ش', 'مُستحسن', 'رقم الشعبة؛ صف لكل شعبة'],
        ['اسم المادة', 'اختياري', 'للتوضيح'], ['اسم المحاضر', 'اختياري', 'للتوضيح (المدرسون من الجدول الدراسي)'], ['عدد الطلبة', 'إجباري', 'عدد طلبة الشعبة؛ يحل محل عدد الجدول الدراسي']],
      note: 'العينة غير حقيقية: احذف صفوف المثال واكتب موادك، صف لكل شعبة. لا تغيّر أسماء الأعمدة.' },
    // what each course's coordinator asks for (one row per course); the list is also the plan's courses
    req: { file: 'نموذج_متطلبات_امتحانات_المقررات.xlsx', sheet: 'المقررات', cols: ['رمز المادة', 'اسم المادة', 'المنسق', 'قاعة / مختبر', 'عدد القاعات أو المختبرات', 'عدد المراقبين', 'موعد ثابت: التاريخ', 'موعد ثابت: من', 'موعد ثابت: إلى', 'في آخر الجدول', 'ملاحظات'],
      ex: [['9900101', 'مادة تجريبية أ (مثال)', 'د. منسق أول (مثال)', 'قاعة', '', '', '', '', '', 'نعم', 'ورقي'], ['9900202', 'مادة تجريبية ب (مثال)', 'د. منسق ثانٍ (مثال)', 'مختبر', '2', '3', '', '', '', '', 'محوسب'],
        ['9900303', 'مادة تجريبية ج (مثال)', 'د. منسق ثالث (مثال)', 'قاعة', '', '', '2026-12-22', '14:00', '15:30', '', 'بطلب المنسق']],
      help: [['رمز المادة', 'إجباري', 'رمز المقرر كما في الجدول الدراسي. مواد الملف هي مواد الخطة (يمكن إلغاء ذلك من «المقررات»)'], ['اسم المادة', 'اختياري', 'للتوضيح'], ['المنسق', 'اختياري', 'يظهر للجنة'],
        ['قاعة / مختبر', 'مُستحسن', '«قاعة» (ورقي) أو «مختبر» (محوسب). الفارغ يُعامل حسب إعداد «القاعات» (قاعة في كلية تكنولوجيا المعلومات)'],
        ['عدد القاعات أو المختبرات', 'اختياري', 'رقم. الفارغ = حسب عدد الطلبة؛ امتحان القاعة الكبير يتوزع تلقائياً حسب قاعدة «القاعات» (مثلاً فوق 30 طالباً: 24 في كل قاعة)'],
        ['عدد المراقبين', 'اختياري', 'مجموع مراقبي الامتحان. الفارغ = مراقب لكل قاعة'], ['موعد ثابت: التاريخ', 'اختياري', 'إن طلب المنسق موعداً محدداً، مثل 2026-12-22'],
        ['موعد ثابت: من / إلى', 'اختياري', 'مثل 14:00 و15:30 (أو 2:00 و3:30 تُفهم بعد الظهر)'], ['في آخر الجدول', 'اختياري', '«نعم» ليكون الامتحان قرب نهاية الأيام. تظليل صف المادة باللون البرتقالي يعني الشيء نفسه'],
        ['ملاحظات', 'اختياري', 'أي ملاحظة (مثلاً «محوسب» أو «ورقي» أو «3 مراقبين»)']],
      note: 'العينة غير حقيقية: احذف صفوف المثال واكتب موادك، صف لكل مقرر. لا تغيّر أسماء الأعمدة.' },
    // exams other departments hold at fixed times (maths, university requirements…): one row per course, sections and time
    fixed: { file: 'نموذج_المواعيد_الثابتة.xlsx', sheet: 'المواعيد', cols: ['رمز المادة', 'اسم المادة', 'الشعب', 'التاريخ', 'من', 'إلى', 'القاعات', 'الجهة'],
      ex: [['9900101', 'مادة تجريبية أ (مثال)', '1، 2', '2026-12-10', '10:00', '10:50', '7419-7420', 'متطلبات الجامعة'], ['9900101', 'مادة تجريبية أ (مثال)', '3', '2026-12-10', '11:00', '11:50', '7422', 'متطلبات الجامعة'],
        ['9900202', 'مادة تجريبية ب (مثال)', '', '2026-12-13', '15:00', '16:00', '7201-7202', 'قسم الرياضيات']],
      help: [['رمز المادة', 'إجباري', 'رمز المقرر كما في الجدول الدراسي'], ['اسم المادة', 'اختياري', 'للتوضيح'], ['الشعب', 'اختياري', 'الشعب التي تمتحن في هذا الموعد، مثل «1، 2» أو «1-5». الفارغ = كل الشعب'],
        ['التاريخ', 'إجباري', 'مثل 2026-12-10 أو 10/12/2026'], ['من / إلى', 'إجباري', 'وقت الامتحان، مثل 10:00 و10:50 (أو عمود واحد «الوقت»: 10.00 - 10.50)'],
        ['القاعات', 'مُستحسن', 'القاعات أو المختبرات التي يأخذها الامتحان، مفصولة بـ - أو ،: تُحجز في وقته فلا يوضع فيها امتحان آخر'], ['الجهة', 'اختياري', 'القسم الذي يعقده (قاعاته ومراقبوه منه)']],
      note: 'العينة غير حقيقية. يُقبل أيضاً جدول الجهة كما هو إن كان فيه رقم المادة والشعبة والتاريخ والوقت (مثل جدول متطلبات الجامعة). صف بلا تاريخ ووقت يأخذ تاريخ ووقت الصف الذي فوقه.' },
    // the proctors: who may proctor and each one's limits (the course instructors are added by themselves)
    proc: { file: 'نموذج_المراقبين.xlsx', sheet: 'المراقبون', cols: ['الاسم', 'الصفة', 'القسم', 'أقصى مراقبات في الدورة', 'أقصى مراقبات في اليوم', 'أيام غير متاح', 'معفى من المراقبة', 'ملاحظات'],
      ex: [['د. مثال أول', 'عضو هيئة تدريس', 'علم الحاسوب', '6', '2', '', '', ''], ['م. مثال ثانٍ', 'مشرف مختبر', 'تكنولوجيا المعلومات', '', '3', 'الخميس', '', ''],
        ['أ. مثال ثالث', 'إداري', 'عمادة الكلية', '4', '1', '2026-12-10، 2026-12-17', '', ''], ['د. مثال رابع', 'رئيس قسم', 'هندسة البرمجيات', '', '', '', 'نعم', '']],
      help: [['الاسم', 'إجباري', 'كما في الجدول الدراسي إن كان مدرّساً (يكفي الاسم الأول والأخير)'], ['الصفة', 'اختياري', 'عضو هيئة تدريس، مشرف مختبر، إداري…'], ['القسم', 'اختياري', 'لتجميع الأسماء'],
        ['أقصى مراقبات في الدورة', 'اختياري', 'فارغ = الحد العام في «المراقبون»'], ['أقصى مراقبات في اليوم', 'اختياري', 'فارغ = الحد العام'],
        ['أيام غير متاح', 'اختياري', 'تواريخ أو أيام أسبوع مفصولة بـ ،  (مثل «الخميس» أو «2026-12-10»)'], ['معفى من المراقبة', 'اختياري', '«نعم» = لا يراقب (العميد، رؤساء الأقسام…)'], ['ملاحظات', 'اختياري', '']],
      note: 'مدرّسو المقررات يُضافون تلقائياً من الجدول الدراسي؛ اكتب هنا من يُضاف إليهم (مشرفو المختبرات، الإداريون) ومن له حدود خاصة أو معفى. العينة غير حقيقية.' } };
  function downloadTemplate(k) {
    const t = TPL[k];
    loadXLSX().then(() => {
      const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([t.cols].concat(t.ex));
      ws['!cols'] = t.cols.map(c => ({ wch: /اسم/.test(c) ? 30 : 16 })); ws['!views'] = [{ RTL: true }];
      t.cols.forEach((c, j) => { const a = XLSX.utils.encode_cell({ r: 0, c: j }); ws[a].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '901D23' } }, alignment: { horizontal: 'center' } }; });
      t.ex.forEach((r, i) => r.forEach((v, j) => { const a = XLSX.utils.encode_cell({ r: i + 1, c: j }); ws[a].s = { font: { color: { rgb: '8A8A8A' }, italic: true } }; ws[a].t = 's'; }));
      XLSX.utils.book_append_sheet(wb, ws, t.sheet || 'الطلبة');
      const h = XLSX.utils.aoa_to_sheet([['العمود', 'إجباري؟', 'الشرح']].concat(t.help).concat([[], [t.note || 'احذف صفّي المثال واكتب بياناتك: صف لكل طالب في كل مقرر. لا تغيّر أسماء الأعمدة.']]));
      h['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 60 }]; h['!views'] = [{ RTL: true }];
      ['A1', 'B1', 'C1'].forEach(a => { h[a].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0B4A66' } } }; });
      XLSX.utils.book_append_sheet(wb, h, 'تعليمات');
      XLSX.writeFile(wb, t.file);
    }).catch(() => { U.download(t.file.replace('.xlsx', '.csv'), '﻿' + [t.cols].concat(t.ex).map(r => r.join(',')).join('\r\n'), 'text/csv;charset=utf-8'); });
  }
  // a course list (university requirements…): one row per section with its number of students → a new plan of those
  // courses only, their numbers from the file, and a course larger than «أقصى عدد في الفترة» split by sections
  function autoParts(regSec, codes, max) {
    const out = {};
    codes.forEach(code => { const secs = Object.entries(regSec[code] || {}).map(([s, n]) => ({ s, n })).sort((a, b) => b.n - a.n), tot = secs.reduce((a, x) => a + x.n, 0);
      if (!max || tot <= max || secs.length < 2) return;
      for (let k = Math.ceil(tot / max); k <= secs.length; k++) {
        const P = Array.from({ length: k }, () => ({ n: 0, s: [] }));
        secs.forEach(x => { const p = P.reduce((a, b) => b.n < a.n ? b : a); p.n += x.n; p.s.push(x.s); });
        if (P.every(p => p.n <= max) || k === secs.length) { out[code] = P.map(p => p.s.sort((a, b) => +a - +b)); break; }
      } });
    return out;
  }
  function readList(file) {
    file.arrayBuffer().then(buf => tableOf(file, buf)).then(rows => {
      let H = null;
      for (let i = 0; i < Math.min(15, rows.length) && !H; i++) {
        const h = (rows[i] || []).map(v => String(v || '').replace(/\s+/g, ' ').trim()), f = re => h.findIndex(x => re.test(x));
        const m = { row: i, code: f(/رقم المادة|رمز المادة|رقم المقرر|رمز المقرر/), sec: f(/^ش\.?$|الشعبة|^شعبة/), n: f(/عدد الطلبة|عدد الطلاب|المسجلين|^العدد$/), name: f(/اسم المادة|اسم المقرر/) };
        if (m.code >= 0 && m.n >= 0) H = m;
      }
      if (!H) throw new Error('لم أجد عمودَي «رقم المادة» و«عدد الطلبة». استخدم النموذج.');
      const regN = {}, regSec = {}, names = {};
      rows.slice(H.row + 1).forEach(r => { const code = String(r[H.code] || '').replace(/\D/g, ''), n = parseInt(String(r[H.n] || '').replace(/[^\d]/g, ''), 10);
        if (!code || !n) return; const sec = H.sec >= 0 ? String(r[H.sec] || '').replace(/\D/g, '') || '1' : '1';
        (regSec[code] = regSec[code] || {})[sec] = (regSec[code][sec] || 0) + n; regN[code] = (regN[code] || 0) + n; if (H.name >= 0 && r[H.name]) names[code] = String(r[H.name]).trim(); });
      const codes = Object.keys(regN);
      if (!codes.length) throw new Error('لا توجد صفوف فيها رقم مادة وعدد طلبة.');
      if (codes.every(c => /^99/.test(c))) throw new Error('هذه صفوف المثال من النموذج (غير حقيقية). اكتب موادك مكانها ثم ارفع الملف.');
      const inTT = new Set(TT.sections.map(x => x.code)), miss = codes.filter(c => !inTT.has(c));
      const secs = codes.reduce((a, c) => a + Object.keys(regSec[c]).length, 0), tot = codes.reduce((a, c) => a + regN[c], 0);
      leaveCur(() => {
        const o = fresh('midterm', []); o.planId = 'p' + Date.now(); o.label = 'متطلبات الجامعة'; o.facs = []; o.faculty = ''; o.only = codes; o.regN = regN; o.regSec = regSec; o.src = 'both'; o.b2b = false;
        o.listMax = 400; o.parts = autoParts(regSec, codes, o.listMax); o.drafts = [];
        o.regInfo = `${file.name}: ${codes.length} مقرراً · ${secs} شعبة · ${tot.toLocaleString('en-US')} طالباً`;
        S = o; migrate(); SWAPPED = true; tab = 'set'; S.setTab = 1; build(); render(); DIRTY = true; savebar();
        alert(`أُنشئت خطة جديدة «متطلبات الجامعة» من ${codes.length} مقرراً (${secs} شعبة، ${tot.toLocaleString('en-US')} طالباً).${miss.length ? `\n\n${miss.length} مقرراً غير موجود في الجدول الدراسي ولن يظهر: ${miss.join('، ')}` : ''}\n\nراجع الأيام والفترات والقاعات في «الإعداد»، ثم اضغط «حفظ». خطتك السابقة محفوظة في قائمة الخطط.`);
      });
    }).catch(e => alert(e.message || 'تعذّر قراءة الملف.'));
  }
  // the make-up list: who sits which course; counts and student groups saved, names kept in this page only
  function readMk(file) {
    file.arrayBuffer().then(buf => tableOf(file, buf)).then(rows => {
      const H = headerMap(rows); if (!H) throw new Error('لم أجد عمودَي «رقم الطالب» و«رمز المادة». استخدم النموذج.');
      const { by, who, mine, names } = fromTable(rows.slice(H.row + 1), H, null), ids = Object.keys(by);
      if (!ids.length) throw new Error('لا صفوف فيها رقم طالب ورمز مادة.');
      const n = {}, dept = {}, fac = {}, nm = {};
      ids.forEach(id => by[id].forEach(c => { n[c] = (n[c] || 0) + 1; }));
      Object.keys(n).forEach(c => { const s = TT.sections.find(x => x.code === c), pl = (PLANS.plans || []).find(p => p.groups.some(g => g.courses.some(x => x.code === c)));
        nm[c] = (s && s.name.replace(/\\s*-\\s*(نظري|عملي)$/, '')) || names[c] || (pl && pl.groups.flatMap(g => g.courses).find(x => x.code === c).name) || c;
        dept[c] = (s && s.department) || (pl && pl.dept) || '—'; fac[c] = (s && s.faculty) || (pl && pl.faculty) || '—'; });
      const agg = {}; ids.forEach(id => { const set = by[id]; if (set.size < 2) return; const k = [...set].sort().join(','); agg[k] = (agg[k] || 0) + 1; });
      S.mk = { n, names: nm, dept, fac, reg: Object.entries(agg).map(([k, w]) => ({ c: k.split(','), w })), info: `${file.name} · الطلبة: ${ids.length} · الامتحانات التكميلية: ${Object.values(n).reduce((a, b) => a + b, 0)} · المقررات: ${Object.keys(n).length}`, at: new Date().toISOString().slice(0, 10) };
      REGMEM = { who, mine, file: file.name };
      S.slot = {}; S.pins = {}; rebuild();
    }).catch(e => alert('تعذّرت قراءة القائمة: ' + (e.message || e)));
  }
  function decode(buf) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1256').decode(buf); } }
  function readReg(file) {
    const known = new Set(TT.sections.map(s => s.code)), note = $(APP).querySelector('#ex-regmsg');
    if (note) note.innerHTML = '<div class="spinner-border spinner-border-sm"></div> يقرأ الكشف… (قد يستغرق الكشف الكامل للجامعة بضع ثوانٍ)';
    file.arrayBuffer().then(buf => {
      const head = new TextDecoder('latin1').decode(buf.slice(0, 2000)).toLowerCase();
      if (head.includes('<html') || head.includes('<table')) return parseReport(decode(buf), known);
      return tableOf(file, buf).then(rows => {
        const H = headerMap(rows);
        if (H && H.id >= 0 && H.code >= 0) return fromTable(rows.slice(H.row + 1), H, known);
        const FH = flatHeader(rows); if (FH) return fromTable(rows.slice(FH.row), FH, known);
        const w = Math.max(...rows.slice(0, 50).map(r => r.length)); let codeCol = -1, best = 0;
        for (let j = 0; j < w; j++) { const n = rows.slice(0, 300).filter(r => known.has(String(r[j] || '').trim())).length; if (n > best) { best = n; codeCol = j; } }
        if (codeCol < 0) throw new Error('لم أجد عموداً فيه رموز مواد معروفة. استخدم النموذج (زر «تنزيل النموذج»).');
        let stuCol = -1; best = 0;
        for (let j = 0; j < w; j++) { if (j === codeCol) continue; const n = rows.slice(0, 300).filter(r => /^\d{6,10}$/.test(String(r[j] || '').trim())).length; if (n > best) { best = n; stuCol = j; } }
        if (stuCol < 0) stuCol = codeCol === 0 ? 1 : 0;
        return fromTable(rows, { id: stuCol, code: codeCol, name: -1, sec: -1, major: -1, cname: -1 }, known);
      });
    }).then(({ by, sec, fac, who, mine, lec }) => {
      sec = sec || {};
      REGMEM = who && mine && Object.keys(who).length ? { who, mine, file: file.name } : null;   // names stay in this page's memory only
      if (WANT === 'lists') { WANT = null; if (note) note.textContent = ''; if (!REGMEM) throw new Error('لم أجد أسماء طلبة في الملف.'); render(); setTimeout(printLists, 200); return; }   // for the lists: the names only, the plan unchanged
      const studs = Object.keys(by); if (!studs.length) throw new Error('لم أجد طلبة ومقررات معروفة في الملف.');
      // per student the courses with his section («601222#2»): a course sat in parts counts only his part
      const agg = {}, n = {}; let pairs = 0;
      studs.forEach(st => { const set = by[st]; pairs += set.size; set.forEach(c => { n[c] = (n[c] || 0) + 1; }); if (set.size < 2) return;
        const k = [...set].map(c => { const x = mine && mine[c] && mine[c][st]; return x ? c + '#' + x : c; }).sort().join(','); agg[k] = (agg[k] || 0) + 1; });
      S.reg = Object.entries(agg).map(([k, w]) => ({ c: k.split(','), w })); S.regN = n; S.regSec = sec;
      // the students' other in-person lectures at each time, per course of this plan (counts only, no student)
      S.lec = null;
      if (lec && Object.keys(lec).length) {
        const scope = new Set(C.map(c => c.base || c.code).concat(S.only || [])), L = {};
        studs.forEach(st => { const ls = lec[st]; if (!ls) return; by[st].forEach(c => { if (!scope.has(c)) return; const seen = new Set(), o = L[c] = L[c] || {};
          ls.forEach(([d, a, b, oc]) => { if (oc === c) return; const k = d + '|' + a + '|' + b; if (seen.has(k)) return; seen.add(k); o[k] = (o[k] || 0) + 1; }); }); });
        S.lec = {}; Object.entries(L).forEach(([c, o]) => { const per = {}; Object.keys(o).sort().forEach(k => { const [d, a, b] = k.split('|'); (per[d] = per[d] || []).push([+a, +b, o[k]]); }); S.lec[c] = per; });
      }
      const fc = {}; Object.values(fac).forEach(f => { fc[f] = (fc[f] || 0) + 1; });
      const facs = Object.entries(fc).sort((a, b) => b[1] - a[1]);
      S.regInfo = `${file.name}: ${studs.length.toLocaleString('ar')} طالباً، ${pairs.toLocaleString('ar')} تسجيلاً في ${Object.keys(n).length} مقرراً` + (facs.length ? ` · ${facs.length === 1 ? 'كلية ' + facs[0][0] : facs.length + ' كليات'}` : '') + (S.lec ? ' · مع أوقات المحاضرات' : '');
      S.regAt = new Date().toISOString().slice(0, 10);
      if (WANT === 'lists') { WANT = null; setTimeout(printLists, 300); }
      if (S.src === 'plans') S.src = 'reg';
      rebuild();
    }).catch(e => { if (note) note.textContent = ''; alert('تعذّرت قراءة الكشف: ' + (e.message || e)); });
  }
  // the coordinator's list (one row per course): رمز المادة | اسم المادة | المنسق | قاعة / مختبر | عدد القاعات | عدد المراقبين |
  // موعد ثابت (التاريخ، من، إلى) | في آخر الجدول | ملاحظات. A row filled orange = «في آخر الجدول». The list is the plan's courses.
  // «جدول» in the coordinator's list: where the course is taught in the timetable, a lab if most of its sections meet in labs
  function ttType(code) {
    const L = TT.sections.filter(x => x.code === code && x.room && x.room !== '0'); if (!L.length) return HALL;
    return L.filter(x => kindOf(x.room) === LAB).length * 2 > L.length ? LAB : HALL;
  }
  function readReq(file) {
    file.arrayBuffer().then(buf => sheetOf(file, buf)).then(({ rows, orange }) => {
      const hi = rows.findIndex(r => r.some(v => /رمز|رقم\s*الماد/.test(String(v)))); if (hi < 0) throw new Error('لم أجد صف العناوين (عمود «رمز المادة»).');
      const H = rows[hi].map(v => String(v || '').replace(/\s+/g, ' ').trim()), col = re => H.findIndex(h => re.test(h));
      const jc = col(/رمز|رقم\s*الماد/), jo = col(/منسق|مدرس/), jt = col(/قاعة\s*\/\s*مختبر|نوع/), jp = col(/مراقب/), jn = H.findIndex(h => /عدد/.test(h) && !/مراقب|طلب|طالب/.test(h)),
        jx = col(/ملاحظ/), jd = col(/تاريخ/), jf = col(/(^|\s|:)من(\s|$)/), jto = col(/(^|\s|:)(إلى|الى)(\s|$)/), jl = col(/(آخر|اخر)\s*الجدول/);
      const req = S.req = S.req || {}, yr = (S.start || today()).slice(0, 4), codes = []; let nl = 0, na = 0;
      rows.slice(hi + 1).forEach((r, k) => {
        const code = String(r[jc] || '').replace(/\D/g, ''); if (!/^\d{5,8}$/.test(code)) return;
        const tt = String(jt >= 0 ? r[jt] : ''), nn = String(jn >= 0 ? r[jn] : ''), note = String(jx >= 0 ? r[jx] : '').replace(/ /g, ' ').trim();
        const q = req[code] = { ...(req[code] && req[code].ext ? { ext: true } : {}) }; codes.push(code);
        q.type = /جدول/.test(tt) ? ttType(code) : /مختبر|محوسب|\blab/i.test(tt + ' ' + note) ? LAB : /قاع|ورق|\broom|\bhall/i.test(tt + ' ' + note) ? HALL : '';
        if (/جدول/.test(tt)) q.typeSrc = 'جدول';
        const m = digits(nn).match(/\d+/); q.rooms = m ? +m[0] : /مختبرين|قاعتين|\btwo\b/i.test(nn + tt) ? 2 : /\bone\b/i.test(nn) ? 1 : 0;
        const pv = jp >= 0 ? digits(r[jp]).match(/\d+/) : null, pm = note.match(/(\d+)\s*مراقب|مراقب\S*\s*(\d+)|زملاء\D*(\d+)/);
        if (pv) q.proc = +pv[0]; else if (pm) q.proc = +(pm[1] || pm[2] || pm[3]);
        if (jo >= 0 && r[jo]) q.coord = String(r[jo]).replace(/ /g, ' ').trim(); q.note = note;
        // a fixed time: its own columns, else a date and hours written in the note
        const d = jd >= 0 ? pDate(r[jd], yr) : '', t1 = jf >= 0 ? pTimes(r[jf]) : null, t2 = jto >= 0 ? pTimes(r[jto]) : null;
        const at = d && t1 ? { date: d, from: t1[0], to: t2 ? t2[0] : t1[1] } : noteAt(note, yr);
        if (at) { q.at = at; na++; }
        if ((jl >= 0 && yes(r[jl])) || orange.has(hi + 1 + k)) { q.late = true; nl++; }
        if (!q.type && !q.rooms && !q.proc && !q.note && !q.coord && !q.at && !q.late) delete req[code];
      });
      if (!codes.length) throw new Error('لا توجد صفوف برموز مواد.');
      if (codes.every(c => /^99/.test(c))) throw new Error('هذه صفوف المثال من النموذج (غير حقيقية). اكتب موادك مكانها ثم ارفع الملف.');
      // the list is the plan's courses (unless this plan is a list of its own, e.g. the university requirements)
      const scoped = !S.listMax && S.reqOnly !== false;
      if (scoped) { S.only = [...new Set(codes)]; S.reqOnly = true; }
      S.reqInfo = `${file.name}: ${codes.length} مقرراً${nl ? ` · ${nl} في آخر الجدول` : ''}${na ? ` · ${na} بموعد ثابت` : ''}`;
      const inTT = new Set(TT.sections.map(x => x.code)), miss = codes.filter(c => !inTT.has(c));
      rebuild();
      alert(`قُرئت متطلبات ${codes.length} مقرراً من ${file.name}.${nl ? `\n${nl} مقرراً في آخر الجدول (مظللة بالبرتقالي أو «نعم»).` : ''}${na ? `\n${na} مقرراً بموعد ثابت.` : ''}${scoped ? '\nالخطة الآن لمواد هذه القائمة (ومعها الامتحانات الثابتة للجهات الأخرى).' : ''}${miss.length ? `\n\n${miss.length} مقرراً غير موجود في الجدول الدراسي: ${miss.join('، ')}` : ''}`);
    }).catch(e => alert('تعذّرت قراءة الملف: ' + (e.message || e)));
  }
  // exams of other departments at fixed times: the site's template, or the department's own table (رقم المادة، ش، التاريخ،
  // الوقت، المختبرات…). A row without a date or time takes the row above's; a session's rooms are often on its first row only.
  function readFixed(file) {
    file.arrayBuffer().then(buf => sheetOf(file, buf)).then(({ rows }) => {
      let H = null;
      for (let i = 0; i < Math.min(15, rows.length) && !H; i++) {
        const h = (rows[i] || []).map(v => String(v || '').replace(/\s+/g, ' ').trim()), f = re => h.findIndex(x => re.test(x));
        const m = { row: i, code: f(/(رمز|رقم)\s*(الماد|المقرر)|^الرمز$/), sec: f(/^ش\.?$|الشعب|^شعبة/), date: f(/التاريخ/), time: f(/^الوقت|^الساعة/), from: f(/^من(\s|$)|وقت البد|البداية/), to: f(/^(إلى|الى)(\s|$)|وقت الانتهاء|النهاية/),
          rooms: f(/القاعات|المختبرات|^القاعة|^المختبر/), who: f(/الجهة|القسم المسؤول/), name: f(/(اسم|عنوان)\s*(الماد|المقرر)/) };
        if (m.code >= 0 && m.date >= 0 && (m.time >= 0 || m.from >= 0)) H = m;
      }
      if (!H) throw new Error('لم أجد أعمدة «رمز المادة» و«التاريخ» و«الوقت» (أو «من»). استخدم النموذج.');
      const yr = (S.start || today()).slice(0, 4), base = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim(), out = [], roomsAt = {};
      let last = null;
      rows.slice(H.row + 1).forEach(r => {
        const code = String(r[H.code] || '').replace(/\D/g, ''); if (!/^\d{5,8}$/.test(code)) return;
        let date = pDate(r[H.date], yr), tt = H.time >= 0 ? pTimes(r[H.time]) : null;
        if (H.from >= 0 && String(r[H.from] || '').trim()) { const x = pTimes(r[H.from]), y = H.to >= 0 ? pTimes(r[H.to]) : null; if (x) tt = [x[0], y ? y[0] : x[1]]; }
        if (!date && last) date = last.date; if (!tt && last && date === last.date) tt = [last.from, last.to];
        if (!date || !tt) return;
        const rm = H.rooms >= 0 ? String(r[H.rooms] || '').split(/[-–,،+/\s]+/).map(x => x.trim()).filter(x => /\d/.test(x)) : [];
        if (rm.length) roomsAt[date + ' ' + tt[0]] = rm;
        out.push({ code, secs: H.sec >= 0 ? secList(r[H.sec]) : [], date, from: tt[0], to: tt[1], rooms: rm, who: (H.who >= 0 && String(r[H.who] || '').trim()) || base, src: file.name });
        last = { date, from: tt[0], to: tt[1] };
      });
      out.forEach(x => { if (!x.rooms.length) x.rooms = roomsAt[x.date + ' ' + x.from] || []; });
      if (!out.length) throw new Error('لا صفوف فيها رمز مادة وتاريخ ووقت.');
      if (out.every(x => /^99/.test(x.code))) throw new Error('هذه صفوف المثال من النموذج (غير حقيقية). اكتب المواعيد مكانها ثم ارفع الملف.');
      S.fixed = (S.fixed || []).filter(x => x.src !== file.name).concat(out);
      rebuild();
      const codes = new Set(out.map(x => x.code)), inW = [...codes].filter(c => FX.codes.has(c)), joined = inW.filter(c => FX.inPlan.has(c));
      alert(`قُرئ ${out.length} موعداً لـ${codes.size} مقرراً من ${file.name}.\n${inW.length} مقرراً في أيام الامتحانات، منها ${joined.length} يشترك طلبتها مع مواد الخطة فدخلت الجدول بمواعيدها الثابتة.\nقاعاتها محجوزة في أوقاتها.`);
    }).catch(e => alert('تعذّرت قراءة الملف: ' + (e.message || e)));
  }
  // the proctors list: names (with role and department), each one's own limits and days off, the exempted
  const WDN = ['احد', 'اثنين', 'ثلاثاء', 'اربعاء', 'خميس', 'جمعه', 'سبت'];
  function readProc(file) {
    file.arrayBuffer().then(buf => sheetOf(file, buf)).then(({ rows }) => {
      let H = null;
      for (let i = 0; i < Math.min(15, rows.length) && !H; i++) {
        const h = (rows[i] || []).map(v => String(v || '').replace(/\s+/g, ' ').trim()), f = re => h.findIndex(x => re.test(x));
        const m = { row: i, n: f(/^الاسم|اسم\s*المراقب|^name/i), role: f(/الصفة|الوظيفة|المسمى/), dept: f(/القسم|الجهة|الوحدة/), max: f(/(أقصى|الحد).*(الدورة|المجموع)/), day: f(/(أقصى|الحد).*اليوم/), off: f(/غير\s*متاح|اعتذار/), ex: f(/معف/) };
        if (m.n >= 0) H = m;
      }
      if (!H) throw new Error('لم أجد عمود «الاسم». استخدم النموذج.');
      const yr = (S.start || today()).slice(0, 4), list = [];
      rows.slice(H.row + 1).forEach(r => {
        const n = String(r[H.n] || '').replace(/\s+/g, ' ').trim(); if (!n || /مثال/.test(n)) return;
        const num = j => { const m = j >= 0 ? digits(r[j]).match(/\d+/) : null; return m ? +m[0] : 0; }, offD = [], offW = [];
        (H.off >= 0 ? String(r[H.off] || '') : '').split(/[,،;\n]+|\s+و/).map(x => x.trim()).filter(Boolean).forEach(x => { const d = pDate(x, yr); if (d) { offD.push(d); return; }
          const k = WDN.findIndex(w => U.norm(x).replace(/^ال/, '').includes(w)); if (k >= 0) offW.push(k); });
        list.push({ n, role: H.role >= 0 ? String(r[H.role] || '').trim() : '', dept: H.dept >= 0 ? String(r[H.dept] || '').trim() : '', max: num(H.max), maxDay: num(H.day), offD, offW, ex: H.ex >= 0 && yes(r[H.ex]) });
      });
      if (!list.length) throw new Error('لا أسماء في الملف (صفوف المثال لا تُقرأ).');
      S.procList = list; S.procInfo = `${file.name}: ${list.length} اسماً`; rebuild();
      alert(`قُرئ ${list.length} اسماً من ${file.name}: ${list.filter(p => p.ex).length} معفى، ${list.filter(p => p.max || p.maxDay).length} بحدود خاصة، ${list.filter(p => p.offD.length || p.offW.length).length} لهم أيام غير متاحين فيها.`);
    }).catch(e => alert('تعذّرت قراءة الملف: ' + (e.message || e)));
  }
  function wire() {
    const app = $(APP);
    let tmr;
    app.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f === 'q' || t.dataset.f === 'cq' || t.dataset.f === 'pq') { F()[t.dataset.f] = t.value; clearTimeout(tmr); tmr = setTimeout(() => { render(); }, 250); }
    });
    app.addEventListener('click', e => {
      const t = e.target.closest('button,[data-c],.ex-cell,[data-tab],[data-go],th[data-sort]'); if (!t) return;
      if (t.id === 'ex-setdone') { S.setupDone = true; save(); tab = 'grid'; render(); if (!C.some(c => c.s >= 0) && C.length) busy(() => solve(false)); window.scrollTo(0, 0); return; }
      if (t.dataset.tab) { tab = t.dataset.tab; sel = null; if (tab === 'out' && LIVE === null) liveCheck(); render(); if (t.closest('.ex-nav')) window.scrollTo(0, 0); return; }
      if (t.dataset.st) { S.setTab = +t.dataset.st; render(); const m = app.querySelector('.ex-setwrap'); if (m && m.getBoundingClientRect().top < 0) m.scrollIntoView({ behavior: 'smooth' }); return; }
      if (t.dataset.fk) { const f = F(), k = t.dataset.fk, v = t.dataset.fv; f[k] = f[k] === v ? '' : v; if (k === 'fac') f.dept = ''; render(); return; }
      if (t.dataset.gv) { S.gview = t.dataset.gv; render(); return; }
      if (t.dataset.ov) { outView = t.dataset.ov; render(); return; }
      if (t.dataset.sort) { const k = t.dataset.sort; sortD = sortK === k ? -sortD : 1; sortK = k; render(); return; }
      if (t.hasAttribute('data-fclear')) { const cq = F().cq; S.flt = { cq }; render(); return; }
      if (t.id === 'ex-solve') { push(); busy(() => solve(false)); return; }
      if (t.id === 'ex-improve') { push(); busy(() => solve(true)); return; }
      if (t.dataset.tgl) { const h = new Set(S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []); h.has(t.dataset.tgl) ? h.delete(t.dataset.tgl) : h.add(t.dataset.tgl); S.hol = [...h].sort().join(' '); rebuild(); return; }
      if (t.hasAttribute('data-noend')) { S.end = ''; rebuild(); return; }
      if (t.dataset.dwclr != null) { delete S.dayWin[t.dataset.dwclr]; rebuild(); return; }
      if (t.id === 'ex-clear') { const np = Object.keys(S.pins).length, live = LIVE || S.pub;
        const wipe = () => { push(); S.slot = {}; S.pins = {}; S.approved = null; rebuild(); };
        U.modal('<i class="bi bi-trash3-fill text-danger"></i> حذف الجدول المولَّد', `<p>ستعود كل الامتحانات غير مجدولة${np ? ` (ومعها ${np} امتحاناً مثبّتاً)` : ''}. يمكنك التراجع عن الحذف بزر «تراجع».</p>
          ${live ? `<div class="alert alert-warning"><i class="bi bi-broadcast"></i> الجدول <b>منشور الآن</b> على شاشات المباني وصفحة «امتحاناتي»${LIVE ? ` (${esc(LIVE.title)})` : ''}.</div>` : ''}
          <div class="d-flex flex-wrap gap-2">${live ? '<button class="btn btn-danger" data-clr="both"><i class="bi bi-cloud-slash"></i> حذف الجدول وإزالته من الشاشات</button><button class="btn btn-outline-danger" data-clr="local">حذف الجدول هنا فقط (يبقى المنشور)</button>' : '<button class="btn btn-danger" data-clr="local"><i class="bi bi-trash3"></i> حذف الجدول</button>'}
          <button class="btn btn-outline-secondary" data-bs-dismiss="modal">إلغاء</button></div>`);
        document.getElementById('pgModalB').onclick = e => { const b = e.target.closest('[data-clr]'); if (!b) return;
          bootstrap.Modal.getInstance(document.getElementById('pgModal')).hide();
          if (b.dataset.clr === 'both') setTimeout(() => unpublish(wipe), 350); else wipe(); };
        return; }
      if (t.id === 'ex-undo') { const u = undo.pop(); if (u) { Object.assign(S, JSON.parse(u)); rebuild(); } return; }
      if (t.id === 'ex-print') return doPrint();
      if (t.dataset.rf != null) { repFilter = t.dataset.rf; render(); return; }
      if (t.dataset.fix) { const [i, s] = t.dataset.fix.split(',').map(Number); move(i, s); return; }
      if (t.id === 'ex-fixall') { push(); for (let n = 0; n < 80; n++) { const r = report(stats()).find(x => x.fix); if (!r) break; C[r.fix.i].s = r.fix.s; S.slot[C[r.fix.i].code] = r.fix.s; } save(); render(); return; }
      if (t.id === 'ex-rprint' || t.id === 'ex-rxlsx') return repExport(t.id === 'ex-rxlsx');
      if (t.id === 'ex-xlsx') return doXLSX();
      if (t.id === 'ex-csv') return doCSV();
      if (t.id === 'ex-plists') { if (REGMEM) { printLists(); return; }
        U.modal('<i class="bi bi-people-fill"></i> قوائم الطلبة لكل قاعة', `<p>القوائم تُطبع بأسماء الطلبة، والأسماء لا تُحفظ في الخطة. اختر ملف <b>كشف تسجيل الطلبة</b> (الملف نفسه الذي يُرفع في «الإعداد ← بيانات الطلبة»).</p>
          <p class="small">يُقرأ الملف للأسماء فقط، في هذه الصفحة، ولا يغيّر شيئاً في الخطة. بعد قراءته تُفتح القوائم للطباعة: ورقة لكل قاعة بأسماء طلبتها وشعبهم ومراقبيها.</p>
          <div class="d-flex gap-2"><button class="btn btn-ex" data-pick><i class="bi bi-file-earmark-arrow-up"></i> اختيار ملف الكشف</button><button class="btn btn-outline-secondary" data-bs-dismiss="modal">إلغاء</button></div>`);
        document.getElementById('pgModalB').onclick = e => { if (!e.target.closest('[data-pick]')) return; WANT = 'lists'; $('#ex-reg2').click(); bootstrap.Modal.getInstance(document.getElementById('pgModal')).hide(); };
        return; }
      if (t.id === 'ex-psheets') return printProctors();
      if (t.id === 'ex-prep') return procReport();
      if (t.id === 'ex-publish') return publish();
      if (t.id === 'ex-unpub') { unpublish(); return; }
      if (t.id === 'ex-pubset') return setupDlg();
      if (t.dataset.go != null) { tab = 'grid'; S.gview = 'matrix'; sel = +t.dataset.go; render(); const el = app.querySelector(`.ex-card[data-c="${sel}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (t.dataset.c != null && tab === 'grid') {
        const i = +t.dataset.c, cell = t.closest('.ex-cell');
        if (sel != null && sel !== i && cell) { move(sel, +cell.dataset.s); return; }  // with an exam picked, a tap anywhere in a cell moves it there
        sel = sel === i ? null : i; render(); return;
      }
      if (t.classList.contains('ex-cell') && sel != null) { move(sel, +t.dataset.s); return; }
      if (t.dataset.pin != null) { const c = C[+t.dataset.pin]; push(); if (c.pin != null) { c.pin = null; delete S.pins[c.code]; } else { c.pin = c.s; S.pins[c.code] = c.s; } save(); render(); return; }
      if (t.hasAttribute('data-unsel')) { sel = null; render(); return; }
      if (t.hasAttribute('data-addp')) { const l = S.periods[P - 1] || ['09:00', '11:00'], d = P ? mins(l[0], l[1]) : 120; const m = U.toMin(l[1]) + 30, q = [U.toTime(m), U.toTime(m + d)]; if (late(q)) { alert(`لا يتسع اليوم لفترة أخرى قبل ${S.lastEnd}. قصّر الفترات أو غيّر «آخر وقت».`); return; } S.periods.push(q); rebuild(); return; }
      if (t.hasAttribute('data-fixno')) { const k = S.periods.filter(p => !late(p)); if (!k.length) { alert('كل الفترات متأخرة: عدّل أوقاتها.'); return; } S.periods = k; S.slot = {}; S.pins = {}; rebuild(); return; }
      if (t.dataset.delp != null) { S.periods.splice(+t.dataset.delp, 1); S.slot = {}; S.pins = {}; rebuild(); return; }
      if (t.dataset.preset != null) { S.periods = PRESETS[+t.dataset.preset][1].map(p => p.slice()); S.slot = {}; S.pins = {}; rebuild(); return; }
      if (t.hasAttribute('data-addhol')) { const v = $('#ex-holin').value; if (v && !S.hol.includes(v)) { S.hol = (S.hol + '\n' + v).trim(); rebuild(); } return; }
      if (t.dataset.delhol) { S.hol = S.hol.split(/\s+/).filter(x => x && x !== t.dataset.delhol).join('\n'); rebuild(); return; }
      if (t.hasAttribute('data-addr')) { rooms().unshift({ n: 'قاعة جديدة', c: 30, on: true }); rebuild(); return; }
      if (t.dataset.delr != null) { rooms().splice(+t.dataset.delr, 1); rebuild(); return; }
      if (t.dataset.allr != null) { rooms().forEach(r => { r.on = t.dataset.allr === '1'; }); rebuild(); return; }
      if (t.dataset.scaler) { rooms().forEach(r => { r.c = Math.max(1, Math.round(r.c * +t.dataset.scaler)); }); rebuild(); return; }
      if (t.hasAttribute('data-bulkr')) { $('#ex-bulkr').value.split('\n').forEach(l => { const [n, c] = l.split(/[,،\t;]/).map(x => x.trim()); if (n) rooms().push({ n, c: Math.max(1, +c || 30), on: true, t: /مختبر|lab/i.test(l) ? LAB : HALL }); }); rebuild(); return; }
      if (t.hasAttribute('data-resetr')) { S.rooms = null; rebuild(); return; }
      if (t.hasAttribute('data-addlabs')) { const have = new Set(rooms().map(r => r.n)), pr = profOf(S), add = pr && pr.labs ? profRooms(pr).filter(r => r.t === LAB && !have.has(r.n)) : labRooms(have); if (!add.length) alert('كل مختبرات الكلية موجودة في القائمة.'); else { S.rooms = rooms().concat(add); rebuild(); } return; }
      if (t.dataset.inclall != null) { const on = t.dataset.inclall === '1'; TT.sections.filter(s => inFac(s.faculty)).forEach(s => { if (on) delete S.excl[s.code]; else S.excl[s.code] = 1; }); rebuild(); return; }
      if (t.dataset.tpl) return downloadTemplate(t.dataset.tpl);
      if (t.hasAttribute('data-profsave')) { profSave(); render(); return; }
      if (t.hasAttribute('data-profapply')) { if (!confirm('إعادة الفترات والقواعد والقاعات والتواريخ إلى إعدادات الكلية المحفوظة؟ (المقررات والملفات المرفوعة تبقى)')) return; typeSet(S, S.type); S.rooms = null; rebuild(); return; }
      if (t.hasAttribute('data-calset')) { const pr = profOf(S), w = calWin(S.type, pr && Object.assign({}, pr.all || {}, pr[S.type] || {}).cal); if (w) { Object.assign(S, { start: w.start, end: w.end, hol: w.hol }); rebuild(); } return; }
      if (t.dataset.qat) { const q = (S.req || {})[t.dataset.qat]; if (q) delete q.at; rebuild(); return; }
      if (t.dataset.fxdel) { S.fixed = (S.fixed || []).filter(x => x.src !== t.dataset.fxdel); rebuild(); return; }
      if (t.hasAttribute('data-procclr')) { if (confirm('حذف قائمة المراقبين؟')) { S.procList = []; S.procInfo = ''; S.procOnly = false; rebuild(); } return; }
      if (t.dataset.exd) { const ps = pool()[t.dataset.exd] || [], L = (S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean), anyOn = ps.some(p => !p.off);
        ps.forEach(p => { const i = L.indexOf(p.n); if (anyOn && i < 0) L.push(p.n); if (!anyOn && i >= 0) L.splice(i, 1); }); S.noProc = L.join('\n'); rebuild(); return; }
      if (t.dataset.exm && (S.procList || []).some(p => p.ex && p.n === t.dataset.exm)) { S.procList.forEach(p => { if (p.n === t.dataset.exm) p.ex = false; }); rebuild(); return; }
      if (t.dataset.exm) { const n = t.dataset.exm, L = (S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean), i = L.indexOf(n); i >= 0 ? L.splice(i, 1) : L.push(n); S.noProc = L.join('\n'); rebuild(); return; }
      if (t.dataset.pfrm) { const [code, room, n] = t.dataset.pfrm.split('|'), key = code + '|' + room, cur = curProc(key); S.procFix[key] = cur.filter(x => x !== n); save(); render(); return; }
      if (t.dataset.pfauto) { delete S.procFix[t.dataset.pfauto]; save(); render(); return; }
      if (t.hasAttribute('data-pfall')) { if (confirm('إلغاء كل التعديلات اليدوية على المراقبين؟')) { S.procFix = {}; save(); render(); } return; }
      if (t.hasAttribute('data-clrmk')) { if (confirm('حذف قائمة التكميلي؟')) { S.mk = null; S.slot = {}; S.pins = {}; rebuild(); } return; }
      if (t.hasAttribute('data-clrreq')) { if (confirm('مسح متطلبات كل المقررات؟')) { S.req = {}; rebuild(); } return; }
      if (t.dataset.libopen != null) { openLib(+t.dataset.libopen); return; }
      if (t.hasAttribute('data-plannew')) { leaveCur(() => { S = fresh('final'); S.drafts = []; S.label = 'خطة جديدة'; S.planId = 'p' + Date.now(); SWAPPED = true; tab = 'set'; S.setTab = 1; build(); render(); DIRTY = true; savebar(); }); return; }
      if (t.hasAttribute('data-plancopy')) { const o = JSON.parse(JSON.stringify(S)); o.label = planName(S) + ' (نسخة)'; o.planId = 'p' + Date.now(); o.approved = null;
        leaveCur(() => { S = o; migrate(); SWAPPED = true; build(); render(); DIRTY = true; savebar(); }); return; }
      if (t.dataset.libdel != null) { const lib = libGet(), x = lib[+t.dataset.libdel]; if (x && confirm(`حذف «${x.name}» من هذا الجهاز نهائياً؟`)) { lib.splice(+t.dataset.libdel, 1); libSet(lib); render(); } return; }
      if (t.hasAttribute('data-noonly')) { S.only = null; S.parts = null; rebuild(); return; }
      if (t.hasAttribute('data-clrreg')) { S.reg = null; S.regN = null; S.regSec = null; S.regInfo = ''; S.src = 'plans'; rebuild(); return; }
      if (t.id === 'ex-dsave') { const n = ($('#ex-dname').value || '').trim() || `نسخة ${S.drafts.length + 1}`; S.drafts.unshift({ name: n, at: new Date().toLocaleString('ar-JO'), n: C.length, slot: { ...S.slot }, pins: { ...S.pins } }); store(); render(); return; }
      if (t.dataset.dload != null) { const d = S.drafts[+t.dataset.dload]; push(); S.slot = { ...d.slot }; S.pins = { ...d.pins }; tab = 'grid'; rebuild(); return; }
      if (t.dataset.dapp != null) { const d = S.drafts[+t.dataset.dapp]; S.approved = S.approved === d.name ? null : d.name; S.slot = { ...d.slot }; S.pins = { ...d.pins }; rebuild(); store(); return; }
      if (t.dataset.ddel != null) { if (confirm('حذف هذه النسخة؟')) { S.drafts.splice(+t.dataset.ddel, 1); store(); render(); } return; }
      if (t.id === 'ex-export') { U.download(`خطة_${title()}.json`.replace(/\s+/g, '_'), JSON.stringify(S), 'application/json'); return; }
      if (t.id === 'ex-forget') { if (confirm('مسح الخطة والنسخ المحفوظة من هذا الجهاز؟ (يبقى ما على الشاشة حتى تغلق الصفحة)')) { try { localStorage.removeItem(KEY); } catch (x) { /* */ } HAS = false; DIRTY = true; render(); savebar(); } return; }
      if (t.id === 'ex-reset') { if (confirm('بدء خطة جديدة؟ ستُحذف الخطة الحالية (تبقى النسخ المحفوظة).')) { const d = S.drafts; S = fresh(S.type); S.drafts = d; migrate(); tab = 'set'; SWAPPED = true; rebuild(); } }
    });
    app.addEventListener('change', e => {
      const t = e.target, k = t.dataset.k;
      if (t.dataset.f && t.dataset.f !== 'q' && t.dataset.f !== 'cq' && t.dataset.f !== 'pq') { F()[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f === 'fac') F().dept = ''; render(); return; }
      if (t.dataset.mv != null) { move(+t.dataset.mv, +t.value); return; }
      if (t.dataset.ty) { typeSet(S, t.dataset.ty); Object.assign(S, { slot: {}, pins: {}, approved: null }); if (profOf(S)) S.rooms = null; rebuild(); return; }
      if (t.hasAttribute('data-facall')) { S.facs = t.checked ? [] : ['تكنولوجيا المعلومات']; S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.fac) { const x = t.dataset.fac; S.facs = t.checked ? [...new Set(S.facs.concat(x))] : S.facs.filter(y => y !== x); S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.pfadd != null && t.value) { const key = t.dataset.pfadd; S.procFix[key] = curProc(key).concat(t.value); save(); render(); return; }
      if (t.dataset.pfswap != null && t.value) { const key = t.dataset.pfswap, cur = curProc(key); cur[0] = t.value; S.procFix[key] = cur; save(); render(); return; }
      if (t.dataset.pinc) { const v = t.value; if (v === '') delete S.pins[t.dataset.pinc]; else { S.pins[t.dataset.pinc] = +v; S.slot[t.dataset.pinc] = +v; } rebuild(); return; }
      if (k) { if (k === 'label') S.labelAuto = false; S[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(+t.min || 0, +t.value || 0) : t.value; rebuild(); return; }
      if (t.dataset.off != null) { const i = +t.dataset.off; S.off = t.checked ? S.off.concat(i) : S.off.filter(x => x !== i); rebuild(); return; }
      if (t.dataset.dw != null) { const w = S.dayWin[t.dataset.dw] = S.dayWin[t.dataset.dw] || {}; w[t.dataset.e] = t.value; if (!w.from && !w.to) delete S.dayWin[t.dataset.dw]; rebuild(); return; }
      if (t.dataset.p != null) { S.periods[+t.dataset.p][+t.dataset.e] = t.value; rebuild(); return; }
      if (t.dataset.pm) { S.procMode = t.dataset.pm; rebuild(); return; }
      if (t.dataset.rp) { S.roomPolicy = t.dataset.rp; rebuild(); return; }
      if (t.dataset.src) { S.src = t.dataset.src; rebuild(); return; }
      if (t.dataset.ron != null) { rooms()[+t.dataset.ron].on = t.checked; rebuild(); return; }
      if (t.dataset.rn != null) { rooms()[+t.dataset.rn].n = t.value.trim(); rebuild(); return; }
      if (t.dataset.qt != null || t.dataset.qn != null || t.dataset.qp != null || t.dataset.qx != null) {
        const code = t.dataset.qt ?? t.dataset.qn ?? t.dataset.qp ?? t.dataset.qx, q = (S.req = S.req || {})[code] = (S.req || {})[code] || {};
        if (t.dataset.qt != null) { q.type = t.value; delete q.typeSrc; } else if (t.dataset.qn != null) q.rooms = Math.max(0, +t.value || 0); else if (t.dataset.qp != null) q.proc = Math.max(0, +t.value || 0); else q.note = t.value.trim();
        if (!q.type && !q.rooms && !q.proc && !q.note && !q.coord && !q.late && !q.at) delete S.req[code]; rebuild(); return; }
      if (t.dataset.rt != null) { rooms()[+t.dataset.rt].t = t.value; rebuild(); return; }
      if (t.dataset.rc != null) { rooms()[+t.dataset.rc].c = Math.max(1, +t.value || 1); rebuild(); return; }
      if (t.dataset.incl) { if (t.checked) delete S.excl[t.dataset.incl]; else S.excl[t.dataset.incl] = 1; rebuild(); return; }
      if (t.dataset.up && t.files[0]) { const f = t.files[0]; ({ reg: readReg, req: readReq, fixed: readFixed, proc: readProc })[t.dataset.up](f); t.value = ''; return; }
      if (t.hasAttribute('data-reqonly')) { S.only = t.checked ? Object.keys(S.req || {}).filter(k => !(S.req[k] || {}).ext) : null; S.reqOnly = true; rebuild(); return; }
      if (t.dataset.ql) { const q = (S.req = S.req || {})[t.dataset.ql] = (S.req || {})[t.dataset.ql] || {}; if (t.checked) q.late = true; else delete q.late; rebuild(); return; }
      if (t.id === 'ex-reg' && t.files[0]) { readReg(t.files[0]); return; }
      if (t.id === 'ex-mk' && t.files[0]) { readMk(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-list' && t.files[0]) { readList(t.files[0]); t.value = ''; return; }
      if (t.hasAttribute && t.hasAttribute('data-lmax')) { const v = Math.max(0, parseInt(t.value, 10) || 0), old = JSON.stringify(S.parts || {});
        S.listMax = v; S.parts = autoParts(S.regSec || {}, S.only || [], v);
        if (JSON.stringify(S.parts) !== old) { Object.keys(S.slot).forEach(k => { if (k.includes('/') || S.parts[k]) delete S.slot[k]; }); Object.keys(S.pins).forEach(k => { if (k.includes('/') || S.parts[k]) delete S.pins[k]; }); }
        rebuild(); return; }
      if (t.id === 'ex-reg2' && t.files[0]) { readReg(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-req' && t.files[0]) { readReq(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-import' && t.files[0]) { t.files[0].text().then(x => { const o = JSON.parse(x); if (!o.type || !o.periods) throw 0; S = o; migrate(); tab = 'grid'; SWAPPED = true; rebuild(); }).catch(() => alert('الملف ليس خطة امتحانات صالحة.')); }
    });
    // drag and drop (mouse); touch uses tap-then-tap
    app.addEventListener('dragstart', e => { const c = e.target.closest('[data-c]'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.c); e.dataTransfer.effectAllowed = 'move'; sel = +c.dataset.c; setTimeout(render, 0); });
    app.addEventListener('dragover', e => { if (e.target.closest('.ex-cell')) e.preventDefault(); });
    app.addEventListener('drop', e => { const cell = e.target.closest('.ex-cell'); if (!cell) return; e.preventDefault(); const i = +e.dataTransfer.getData('text/plain'); if (!isNaN(i)) move(i, +cell.dataset.s); });
    app.addEventListener('dragend', () => { if (sel != null) { sel = null; render(); } });
  }

  const CSS = `
  html.ex-locked #ex-app, html.ex-locked .uop-hero { visibility: hidden; }
  .ex-gate { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 16px; background: radial-gradient(circle at 50% 30%, rgba(144,29,35,.92), rgba(9,27,34,.97)); }
  .ex-gate .box { width: min(100%, 420px); background: #fff; color: #091b22; border-radius: 18px; padding: 1.6rem; display: flex; flex-direction: column; gap: .75rem; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.35); font-size: 1rem; }
  .ex-gate .ic { width: 64px; height: 64px; margin: 0 auto; border-radius: 50%; background: #f8e3e5; color: #901d23; display: grid; place-items: center; font-size: 1.8rem; }
  .ex-gate h2 { font-size: 1.35rem; font-weight: 800; margin: 0; } .ex-gate p { color: #1f2a30; margin: 0; } .ex-gate label { text-align: start; font-weight: 700; }
  .ex-gate .err { color: #b42318; } .ex-gate .back { font-size: .9rem; color: #1f2a30; } .ex-gate .rem { font-weight: 400; }
  #ex-app { font-size: 1rem; color: #0f1f26; }
  .btn-ex { background: #901d23; color: #fff; border: 0; font-weight: 700; } .btn-ex:hover, .btn-ex:focus { background: #6f151a; color: #fff; }
  #ex-app .btn { font-weight: 700; }
  /* steps */
  .ex-steps { display: flex; align-items: stretch; gap: .35rem; margin: .6rem 0 .6rem; overflow-x: auto; padding-bottom: 2px; }
  .ex-steps .sep { align-self: center; color: #9aa8ae; font-size: 1.1rem; flex: none; }
  .ex-step { flex: 1 1 0; min-width: 150px; display: flex; gap: .55rem; align-items: center; text-align: start; border: 2px solid #e2e8ec; background: #fff; border-radius: 14px; padding: .55rem .7rem; color: #0f1f26; }
  .ex-step .num { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1.05rem; background: #eef2f4; color: #1f2a30; }
  .ex-step .tx b { display: block; font-size: 1rem; } .ex-step .tx small { display: block; font-size: .82rem; color: #1f2a30; }
  .ex-step.done .num { background: #15803d; color: #fff; } .ex-step.bad .num { background: #b42318; color: #fff; }
  .ex-step.on { border-color: #901d23; background: #fff6f6; box-shadow: 0 4px 14px rgba(144,29,35,.15); } .ex-step.on .num { box-shadow: 0 0 0 3px rgba(144,29,35,.25); }
  .ex-status { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .8rem; }
  .ex-pill { display: inline-flex; gap: .35rem; align-items: center; background: #eef3f6; color: #0b3a50; border-radius: 999px; padding: .28rem .75rem; font-size: .9rem; font-weight: 700; }
  .ex-pill.ok { background: #e4f5e9; color: #15803d; } .ex-pill.bad { background: #fde8e8; color: #b42318; }
  .ex-list { border-color: #cfe3dc !important; } .ex-tplprev { font-size: .8rem; margin: .4rem 0; background: #fff; } .ex-tplprev caption { caption-side: top; font-size: .78rem; color: #1f2a30; padding: 0 0 .2rem; }
  .ex-tplprev th { background: #901d23 !important; color: #fff !important; white-space: nowrap; } .ex-tplprev td { color: #4a4a4a; font-style: italic; }
  .ex-lmax { display: inline-flex; align-items: center; gap: .4rem; font-size: .85rem; font-weight: 700; } .ex-lmax input { width: 6.5rem; }
  .ex-qrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: .4rem; margin-bottom: .6rem; }
  .ex-qk { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: .45rem; align-items: center; background: #fff; border: 1px solid #e3e8eb; border-top: 3px solid #16a34a; border-radius: 10px; padding: .4rem .55rem; min-width: 0; }
  .ex-qk i { grid-row: span 2; font-size: 1.15rem; color: #16a34a; } .ex-qk b { font-size: 1.15rem; line-height: 1.15; color: #0d4f25; font-variant-numeric: tabular-nums; }
  .ex-qk span { font-size: .72rem; color: #1f2a30; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ex-qk.warn { border-top-color: #d97706; } .ex-qk.warn i, .ex-qk.warn b { color: #b45309; } .ex-qk.bad { border-top-color: #b42318; background: #fff8f7; } .ex-qk.bad i, .ex-qk.bad b { color: #b42318; }
  .ex-qk.info { border-top-color: #0b4a66; } .ex-qk.info i, .ex-qk.info b { color: #0b4a66; }
  #ex-app .text-muted, #ex-app .form-text, #ex-app .dropdown-header { color: #1f2a30 !important; } #ex-app .ex-pp.miss, #ex-app .text-danger { color: #b42318 !important; } #ex-app .ex-rule.ok, #ex-app .ex-rule.ok small, #ex-app .ex-up .st { color: #15803d !important; }
  .ex-pp.miss { background: #fde8e8 !important; color: #b42318 !important; font-weight: 800; }
  .ex-qtips { list-style: none; margin: 0 0 .8rem; padding: .45rem .8rem; background: #fbf9f5; border: 1px solid #ece6da; border-radius: 10px; display: grid; gap: .2rem; font-size: .82rem; color: #1f2a30; }
  .ex-qtips li { display: flex; gap: .45rem; align-items: baseline; } .ex-qtips i { color: #901d23; }
  .ex-qrep { background: #fff; border: 1px solid #e3dccd; border-radius: 12px; padding: .6rem .7rem; }
  .ex-qrep .ex-rephead { margin: 0 0 .6rem; padding-bottom: .5rem; border-bottom: 1px solid #ece6da; justify-content: flex-start; }
  .ex-qrep .ex-rephead h6 { font-weight: 800; color: #091b22; font-size: .98rem; white-space: nowrap; }
  .ex-rtabs { display: inline-flex; flex-wrap: wrap; border: 1px solid #d5cdbd; border-radius: 8px; overflow: hidden; background: #fff; }
  .ex-rtabs button { border: 0; background: none; padding: .28rem .7rem; font-size: .8rem; font-weight: 700; color: #1f2a30; white-space: nowrap; }
  .ex-rtabs button + button { border-inline-start: 1px solid #e2d9c8; } .ex-rtabs button.on { background: #fbf0f0; color: #7a1a1f; box-shadow: inset 0 -2px 0 #901d23; }
  .ex-rtabs em { font-style: normal; font-size: .72rem; background: #f1ede4; border-radius: 999px; padding: 0 .4rem; margin-inline-start: .15rem; } .ex-rtabs button.on em { background: #901d23; color: #fff; }
  .ex-racts { margin-inline-start: auto; display: inline-flex; gap: .3rem; }
  @media (max-width: 767.98px) { .ex-qrow { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ex-racts { margin-inline-start: 0; } }
  .ex-rtw { border: 1px solid #ece6da; border-radius: 10px; }
  .ex-rtbl { width: 100%; border-collapse: collapse; font-size: .83rem; }
  .ex-rtbl th { background: #f6f1e7; color: #5b4a2f; font-weight: 800; font-size: .76rem; padding: .45rem .6rem; white-space: nowrap; border-bottom: 1px solid #e3dccd; text-align: start; position: sticky; top: 0; }
  .ex-rtbl td { padding: .45rem .6rem; border-bottom: 1px solid #f0ebe0; vertical-align: top; }
  .ex-rtbl tbody tr:last-child td { border-bottom: 0; } .ex-rtbl tbody tr:hover td { background: #fcfaf6; }
  .ex-rtbl tr.sev0 td:first-child { box-shadow: inset 4px 0 0 #b42318; } .ex-rtbl tr.sev1 td:first-child { box-shadow: inset 4px 0 0 #d9480f; } .ex-rtbl tr.sev2 td:first-child { box-shadow: inset 4px 0 0 #d97706; } .ex-rtbl tr.sev3 td:first-child { box-shadow: inset 4px 0 0 #94a3b8; }
  .ex-sevb { display: inline-block; font-size: .72rem; font-weight: 800; padding: .05rem .55rem; border-radius: 999px; white-space: nowrap; }
  .ex-sevb.sev0 { background: #fde8e8; color: #b42318; } .ex-sevb.sev1 { background: #fff0e6; color: #c2410c; } .ex-sevb.sev2 { background: #fef6e0; color: #a16207; } .ex-sevb.sev3 { background: #eef2f6; color: #1f2a30; }
  .ex-rtbl .ty { font-weight: 800; color: #091b22; white-space: nowrap; } .ex-rtbl .ty i { color: #901d23; } .ex-rtbl .ty small { display: block; font-weight: 600; color: #1f2a30; font-size: .72rem; }
  .ex-rtbl .wh { white-space: nowrap; color: #1f2a30; font-variant-numeric: tabular-nums; }
  .ex-rtbl .cs { min-width: 14rem; } .ex-cchip { display: flex; align-items: baseline; gap: .3rem; border-inline-start: 3px solid var(--c); padding-inline-start: .4rem; margin: 1px 0; line-height: 1.35; }
  .ex-cchip b { color: #091b22; } .ex-cchip small { color: #1f2a30; margin-inline-start: auto; padding-inline-start: .3rem; }
  .ex-rtbl .why { color: #2f3f46; min-width: 13rem; } .ex-rtbl .why details { margin-top: .2rem; font-size: .76rem; color: #0b4a66; } .ex-rtbl .why summary { cursor: pointer; font-weight: 700; }
  .ex-rtbl .act { min-width: 10rem; } .ex-rtbl .act small { display: block; color: #15803d; font-weight: 700; font-size: .74rem; margin: .2rem 0; } .ex-rtbl .act small.muted { color: #1f2a30; font-weight: 500; }
  @media (max-width: 767.98px) { .ex-rtbl thead { display: none; } .ex-rtbl tr { display: grid; grid-template-columns: auto 1fr; gap: .2rem .5rem; padding: .5rem; border-bottom: 1px solid #ece6da; }
    .ex-rtbl td { border: 0; padding: 0; } .ex-rtbl td.cs, .ex-rtbl td.why, .ex-rtbl td.act { grid-column: 1 / -1; min-width: 0; } .ex-rtbl tr td:first-child { box-shadow: none !important; } }
  .ex-qrep .ex-rep { gap: .45rem; } .ex-qrep .ex-ri { padding: .5rem .7rem; border-radius: 10px; border-inline-start-width: 4px; }
  .ex-qrep .ex-ri header { font-size: .88rem; gap: .25rem .7rem; } .ex-qrep .ex-ri .when, .ex-qrep .ex-ri .aff { font-size: .8rem; } .ex-qrep .ex-ri .sev { font-size: .7rem; }
  .ex-qrep .ex-ri .cs { margin: .3rem 0; } .ex-qrep .ex-ri .cs li { font-size: .84rem; } .ex-qrep .ex-ri .cs small { font-size: .76rem; }
  .ex-qrep .ex-ri .why { font-size: .82rem; margin: .2rem 0; } .ex-qrep .ex-ri .who { font-size: .8rem; }
  .ex-qrep .ex-ri footer { padding-top: .3rem; } .ex-qrep .ex-ri .fix { font-size: .82rem; }
  .ex-pbar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; background: #fff; border: 1px solid #e3dccd; border-radius: 12px; padding: .4rem .65rem; margin-bottom: .4rem; }
  .ex-pbar > i { color: #0f766e; } .ex-pbar-l { font-size: .8rem; font-weight: 700; color: #1f2a30; }
  .ex-pbar-cur { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid #b9ddd0; background: #effaf5; color: #0d4f3a; } .ex-pbar-cur small { color: #1f2a30; font-weight: 600; }
  .ex-pbar-menu { min-width: 20rem; } .ex-pbar-menu .dropdown-item { display: flex; gap: .5rem; align-items: flex-start; white-space: normal; } .ex-pbar-menu small { display: block; color: #1f2a30; }
  .ex-pbar-name { max-width: 16rem; }
  @media (max-width: 767.98px) { .ex-pbar-name { max-width: none; flex: 1 1 100%; } .ex-pbar .ms-auto { margin-inline-start: 0 !important; } }
  .ex-sum { background: #fff; border: 1px solid #cfe3dc; border-radius: 14px; margin-bottom: .9rem; overflow: hidden; }
  .ex-sum > summary { cursor: pointer; list-style: none; padding: .65rem 1rem; background: #effaf5; font-weight: 800; color: #0d4f3a; display: flex; align-items: center; gap: .5rem; }
  .ex-sum > summary::-webkit-details-marker { display: none; } .ex-sum > summary small { font-weight: 600; color: #1f2a30; }
  .ex-sum > summary::after { content: '\\F282'; font-family: bootstrap-icons; margin-inline-start: auto; transition: transform .15s; } .ex-sum[open] > summary::after { transform: rotate(180deg); }
  .ex-sum-note { margin: .6rem 1rem 0; padding: .45rem .7rem; border-radius: 9px; background: #fff8e1; border: 1px solid #f1d48a; font-size: .86rem; color: #5c4400; }
  .ex-sum-r { display: grid; grid-template-columns: 1.3rem 7.5rem minmax(0, 1fr) auto; gap: .5rem; align-items: start; padding: .5rem 1rem; border-top: 1px dashed #e3ece8; font-size: .88rem; }
  .ex-sum-r:first-of-type { border-top: 0; } .ex-sum-r > i { color: #0f766e; margin-top: .15rem; } .ex-sum-r > b { color: #091b22; } .ex-sum-r .btn-link { padding: 0 .3rem; font-size: .8rem; }
  .ex-sum-c { display: inline-block; border: 1px solid #d9e6e1; background: #f7fbf9; border-radius: 6px; padding: 0 .4rem; margin: 1px 0; font-size: .8rem; white-space: nowrap; } .ex-sum-c small { color: #1f2a30; }
  .ex-sum-more summary { cursor: pointer; color: #0f766e; font-size: .8rem; font-weight: 700; margin-top: .25rem; }
  .ex-sum-b { margin-top: .25rem; display: flex; flex-direction: column; gap: .2rem; } .ex-sum-b b { font-size: .8rem; }
  @media (max-width: 767.98px) { .ex-sum-r { grid-template-columns: 1.3rem minmax(0, 1fr) auto; } .ex-sum-r > div { grid-column: 2 / -1; } }
  .ex-intro { display: flex; gap: .7rem; align-items: flex-start; background: linear-gradient(90deg, #fff6f6, #fff); border: 1px solid #f1c9cc; border-radius: 14px; padding: .8rem 1rem; margin-bottom: .9rem; font-size: 1rem; }
  .ex-intro > i { font-size: 1.8rem; color: #901d23; line-height: 1; }
  .ex-nav { display: flex; justify-content: space-between; gap: .6rem; flex-wrap: wrap; margin: 1.4rem 0 .5rem; padding-top: 1rem; border-top: 2px dashed #e2e8ec; }
  /* toolbar, filter, legend */
  .ex-toolbar, .ex-outbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; justify-content: space-between; margin-bottom: .6rem; }
  .ex-views { display: flex; flex-wrap: wrap; gap: .3rem; background: #eef2f4; padding: .25rem; border-radius: 12px; }
  .ex-vbtn { border: 0; background: transparent; border-radius: 9px; padding: .4rem .8rem; font-weight: 700; font-size: .95rem; color: #2b3b42; }
  .ex-vbtn.on { background: #fff; color: #901d23; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  .ex-acts { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
  .ex-filter { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; background: #f7f9fa; border: 1px solid #e2e8ec; border-radius: 12px; padding: .5rem .65rem; margin-bottom: .6rem; }
  .ex-filter > i { color: #901d23; font-size: 1.1rem; } .ex-filter .form-control { flex: 1 1 200px; width: auto; } .ex-filter .form-select { width: auto; max-width: 100%; flex: 0 1 auto; }
  .ex-count { font-size: .9rem; color: #1f2a30; } .ex-count b { color: #091b22; font-size: 1.05rem; }
  .ex-switch { display: inline-flex; align-items: center; gap: .35rem; font-weight: 700; font-size: .92rem; cursor: pointer; }
  .ex-switch input { display: none; } .ex-switch span { width: 38px; height: 22px; border-radius: 999px; background: #cbd5da; position: relative; transition: .2s; }
  .ex-switch span::after { content: ''; position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: .2s; } .ex-switch input:checked + span { background: #901d23; } .ex-switch input:checked + span::after { right: 19px; }
  .ex-scope { background: #fff; border: 1px solid #e2e8ec; border-radius: 12px; padding: .35rem .65rem; margin-bottom: .7rem; }
  .ex-scope-row { display: flex; align-items: center; gap: .6rem; padding: .3rem 0; }
  .ex-scope-row + .ex-scope-row { border-top: 1px dashed #e2e8ec; }
  .ex-scope-lb { flex: 0 0 5.2rem; font-weight: 800; color: #091b22; font-size: .95rem; white-space: nowrap; } .ex-scope-lb i { color: #901d23; }
  .ex-scope-hint { color: #1f2a30; font-size: .92rem; }
  .ex-seg { display: flex; flex-wrap: wrap; gap: .3rem; padding: .15rem .05rem; min-width: 0; flex: 1; }
  .ex-lg { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .4rem; background: #f4f6f8; color: #26353c; border: 1px solid #dde3e7; border-radius: 8px; padding: .3rem .7rem; font-size: .92rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s; }
  .ex-lg .d { width: .55rem; height: .55rem; border-radius: 50%; display: inline-block; }
  .ex-lg .k { color: #1f2a30; font-size: .8rem; font-weight: 700; }
  .ex-lg:hover { background: #fff; border-color: #901d23; }
  .ex-lg.on { background: #901d23; border-color: #901d23; color: #fff; } .ex-lg.on .k { color: rgba(255,255,255,.8); } .ex-lg.on .d { box-shadow: 0 0 0 2px #fff; }
  [data-theme=dark] .ex-scope { background: #13232a; border-color: #2c4048; } [data-theme=dark] .ex-lg { background: #1b2e35; color: #e8eef0; border-color: #2c4048; } [data-theme=dark] .ex-scope-lb { color: #e8eef0; }
  @media (max-width: 700px) { .ex-scope-row { flex-direction: column; align-items: stretch; gap: .25rem; } .ex-scope-lb { flex: none; } .ex-seg { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .ex-lg { font-size: .88rem; padding: .28rem .6rem; } }
  .ex-hint { background: #fff8e6; border: 1px solid #f3d38b; border-radius: 12px; padding: .55rem .8rem; font-size: .95rem; margin-bottom: .6rem; display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; } .ex-hint.soft { background: #f1f6f9; border-color: #d8e3ea; }
  .ex-hint > i { font-size: 1.15rem; color: #9a5b00; } .ex-hint.soft > i { color: #0b4a66; } .ex-hint span[class^=h-] { padding: .05rem .5rem; border-radius: 6px; font-weight: 700; font-size: .85rem; }
  .ex-note { font-size: .93rem; color: #1f2a30; background: #f1f6f9; border-radius: 10px; padding: .45rem .7rem; }
  /* matrix */
  .ex-grid-wrap { overflow-x: auto; } .ex-grid { width: 100%; border-collapse: separate; border-spacing: 6px; min-width: 640px; table-layout: fixed; }
  .ex-grid thead th { background: #091b22; color: #fff; border-radius: 10px; padding: .5rem; text-align: center; } .ex-grid .pn { font-size: 1rem; font-weight: 800; } .ex-grid th small { display: block; font-weight: 400; opacity: .85; font-size: .88rem; }
  .ex-grid th.day { background: #eef2f4; color: #091b22; border-radius: 10px; width: 92px; text-align: center; } .ex-grid th.day b { display: block; font-size: 1rem; } .ex-grid th.day small { font-size: .88rem; color: #1f2a30; } .ex-grid .corner { width: 92px; }
  .ex-cell { background: #fbfcfd; border: 1.5px dashed #d3dbe0; border-radius: 12px; padding: 5px; vertical-align: top; min-height: 80px; height: 84px; cursor: pointer; }
  .ex-cell .cap { font-size: .8rem; color: #1f2a30; margin-bottom: 3px; } .ex-cell .cap.hi { color: #9a5b00; font-weight: 700; } .ex-cell .cap.over { color: #b42318; font-weight: 800; }
  .ex-cell .more, .ex-day .more { font-size: .8rem; color: #1f2a30; text-align: center; }
  .ex-cell.h-good, span.h-good { background: #d3f0dc; } .ex-cell.h-ok, span.h-ok { background: #eef6f0; } .ex-cell.h-warn, span.h-warn { background: #ffecc7; } .ex-cell.h-bad, span.h-bad { background: #fbd5d5; }
  .ex-card { background: var(--b); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); border-inline-start: 5px solid var(--c); border-radius: 9px; padding: 5px 7px; margin: 4px 0; line-height: 1.35; cursor: grab; user-select: none; }
  .ex-card .t { display: flex; gap: .3rem; align-items: center; } .ex-card .t b { color: var(--c); font-size: .98rem; } .ex-card .t .wr { color: #b42318; margin-inline-start: auto; }
  .ex-card .n { font-size: .9rem; font-weight: 600; color: #0f1f26; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ex-card .m { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; } .ex-card .bd { background: #fff; border-radius: 6px; padding: 0 .35rem; font-size: .78rem; font-weight: 700; color: #1f2a30; }
  .ex-card.sel { outline: 3px solid #091b22; box-shadow: 0 4px 12px rgba(0,0,0,.25); } .ex-card.bad { box-shadow: 0 0 0 2px #e05252; } .ex-card.pinned { background-image: linear-gradient(135deg, rgba(0,0,0,.04) 25%, transparent 25%, transparent 50%, rgba(0,0,0,.04) 50%, rgba(0,0,0,.04) 75%, transparent 75%); background-size: 10px 10px; }
  .ex-pool { display: flex; flex-wrap: wrap; gap: 6px; height: auto; } .ex-pool .ex-card { width: 200px; }
  .ex-busy { position: sticky; top: 76px; z-index: 5; background: #091b22; color: #fff; border-radius: 12px; padding: .55rem 1rem; margin-bottom: .6rem; display: inline-flex; gap: .55rem; align-items: center; font-weight: 700; }
  .ex-start, .ex-empty { text-align: center; padding: 2.5rem 1rem; border: 2px dashed #e2c6c8; border-radius: 18px; background: #fffafa; }
  .ex-start > i { font-size: 3rem; color: #901d23; } .ex-start h3 { font-weight: 800; margin: .5rem 0; } .ex-start p { font-size: 1.05rem; color: #1f2a30; max-width: 620px; margin: 0 auto 1rem; }
  /* days view */
  .ex-days-v { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: .8rem; }
  .ex-day { border: 1px solid #e2e8ec; border-radius: 16px; overflow: hidden; background: #fff; }
  .ex-day header { display: flex; flex-wrap: wrap; gap: .4rem .7rem; align-items: center; background: linear-gradient(90deg, #091b22, #163746); color: #fff; padding: .6rem .9rem; }
  .ex-day .dw { font-size: 1.15rem; font-weight: 800; } .ex-day .dd { opacity: .85; } .ex-day header .bdg { background: rgba(255,255,255,.15); color: #fff; }
  .ex-per { display: grid; grid-template-columns: 96px 1fr; gap: .5rem; border: 0; border-bottom: 1px solid #edf1f3; border-radius: 0; height: auto; min-height: 0; background: #fff; padding: .5rem .7rem; }
  .ex-per .pt b { display: block; color: #0f766e; } .ex-per .pt span { font-size: .88rem; color: #1f2a30; } .ex-per .none { color: #9aa8ae; }
  .ex-row { display: grid; grid-template-columns: auto 1fr auto; gap: .2rem .5rem; align-items: center; background: var(--b); border-inline-start: 5px solid var(--c); border-radius: 9px; padding: .35rem .55rem; margin-bottom: 4px; cursor: grab; }
  .ex-row .cd { font-weight: 800; color: var(--c); } .ex-row .nm { font-weight: 600; } .ex-row .nm small { display: block; font-weight: 400; color: #1f2a30; font-size: .82rem; }
  .ex-row .rm { grid-column: 1 / -1; font-size: .84rem; color: #1f2a30; } .ex-row.bad { box-shadow: 0 0 0 2px #e05252; } .ex-row.sel { outline: 3px solid #091b22; }
  /* list / tables */
  .ex-tbl { border: 1px solid #e2e8ec; border-radius: 12px; } .ex-tbl table { margin: 0; font-size: .95rem; }
  .ex-tbl thead th { background: #091b22; color: #fff; font-size: .9rem; white-space: nowrap; position: sticky; top: 0; } .ex-tbl th.sortable { cursor: pointer; } .ex-tbl th.sortable:hover { background: #163746; }
  .ex-tbl tr.bad td { background: #fff4f4; }
  .ex-tbl td { vertical-align: middle; padding: .6rem .55rem; } .ex-tbl tr.nd td { border-top: 3px solid #901d23; }
  .ex-tbl .c-day, .ex-tbl .c-date, .ex-tbl .c-time, .ex-tbl .c-code, .ex-tbl .c-num { white-space: nowrap; width: 1%; }
  .ex-tbl .c-name { min-width: 170px; } .ex-tbl .c-rooms { min-width: 220px; } .ex-tbl .c-ppl { min-width: 220px; }
  .ex-dw { color: #091b22; } .ex-dt { font-weight: 800; color: #0b4a66; font-size: 1rem; } .ex-dt small { display: block; font-weight: 400; color: #1f2a30; font-size: .75rem; }
  .ex-tm { display: inline-flex; gap: .3rem; align-items: center; background: #e0f4f1; color: #0f766e; border-radius: 8px; padding: .15rem .5rem; font-weight: 700; font-size: .88rem; }
  .ex-nm { font-size: .97rem; }
  .ex-chips { display: flex; flex-wrap: wrap; gap: .3rem; }
  .ex-rm { display: inline-flex; align-items: center; gap: .3rem; background: #eef6f0; color: #14532d; border: 1px solid #cfe8d6; border-radius: 9px; padding: .15rem .5rem; font-size: .88rem; }
  .ex-rm .n { background: #15803d; color: #fff; border-radius: 999px; padding: 0 .4rem; font-size: .78rem; font-weight: 700; } .ex-rm small { color: #1f2a30; } .ex-rm.bad { background: #fde8e8; color: #b42318; border-color: #f5c2c2; }
  .ex-pp { display: inline-flex; align-items: center; gap: .25rem; background: #f3eefe; color: #5b21b6; border-radius: 999px; padding: .12rem .55rem; font-size: .86rem; font-weight: 600; }
  [data-theme=dark] .ex-dw, [data-theme=dark] .ex-nm { color: #e8eef0; } .ex-tbl select { min-width: 170px; }
  .ex-when { font-weight: 700; white-space: nowrap; font-size: .9rem; }
  .ex-code { display: inline-block; background: var(--b); color: var(--c); border: 1px solid var(--c); border-radius: 7px; padding: .05rem .45rem; font-weight: 800; cursor: pointer; }
  .ex-code.sm { font-size: .85rem; margin: 2px; } .ex-code small { display: none; } .ex-mx.named .ex-code.sm { display: block; text-align: start; } .ex-mx.named .ex-code small { display: block; font-weight: 600; color: #0f1f26; font-size: .82rem; line-height: 1.3; } .ex-mx.named td { min-width: 150px; } .ex-code sub { font-weight: 600; opacity: .8; margin-inline-start: 2px; bottom: 0; }
  .bdg { display: inline-flex; gap: .25rem; align-items: center; border-radius: 999px; padding: .08rem .55rem; font-size: .82rem; font-weight: 700; background: #eef2f4; color: #2b3b42; white-space: nowrap; }
  .bdg.blue { background: #e6edfd; color: #1d4ed8; } .bdg.green { background: #e4f5e9; color: #15803d; } .bdg.red { background: #fde8e8; color: #b42318; } .bdg.amber { background: #fdf1dc; color: #9a5b00; } .bdg.teal { background: #e0f4f1; color: #0f766e; }
  /* cohort / dept matrix */
  .ex-mx { border-collapse: separate; border-spacing: 3px; min-width: 100%; font-size: .9rem; }
  .ex-mx thead th { background: #091b22; color: #fff; border-radius: 8px; padding: .35rem .4rem; text-align: center; white-space: nowrap; } .ex-mx thead th small { display: block; font-weight: 400; opacity: .85; }
  .ex-mx th.rh { background: #eef2f4; border-radius: 8px; padding: .35rem .5rem; min-width: 210px; text-align: start; font-weight: 700; }
  .ex-mx td { background: #fafbfc; border-radius: 8px; vertical-align: top; min-width: 80px; padding: 2px; } .ex-mx td.ok { background: #f2faf5; } .ex-mx td.over { background: #fff1d6; } .ex-mx td.clash { background: #fbd5d5; } .ex-mx td.tot { text-align: center; font-weight: 800; background: #eef2f4; }
  /* quality */
  .ex-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .6rem; margin-bottom: .9rem; }
  .ex-kpi { border-radius: 14px; padding: .75rem .85rem; display: grid; grid-template-columns: auto 1fr; gap: 0 .6rem; align-items: center; border: 1px solid #e3e8eb; }
  .ex-kpi i { grid-row: span 2; font-size: 1.7rem; } .ex-kpi b { font-size: 1.55rem; line-height: 1.1; } .ex-kpi span { font-size: .9rem; color: #1f2a30; }
  .ex-kpi.ok { background: #effaf2; color: #15803d; } .ex-kpi.bad { background: #fdeeee; color: #b42318; } .ex-kpi.warn { background: #fff6e4; color: #9a5b00; } .ex-kpi.info { background: #eef4f8; color: #0b4a66; }
  .ex-h { margin: 1rem 0 .5rem; font-weight: 800; color: #091b22; font-size: 1.1rem; } .ex-n { display: inline-block; min-width: 1.6em; padding: 0 .4em; border-radius: 999px; background: #e9ecef; color: #091b22; font-size: .82rem; text-align: center; } .ex-n.bad { background: #b42318; color: #fff; }
  .ex-rephead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; margin: 1.1rem 0 .5rem; }
  .ex-filters { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .7rem; }
  .ex-rep { display: grid; gap: .65rem; }
  .ex-ri { border: 1px solid #e3e8eb; border-inline-start: 6px solid #94a3b8; border-radius: 14px; padding: .75rem .9rem; background: #fff; }
  .ex-ri.sev0 { border-inline-start-color: #b42318; background: #fffafa; } .ex-ri.sev1 { border-inline-start-color: #c2410c; } .ex-ri.sev2 { border-inline-start-color: #b7791f; } .ex-ri.sev3 { border-inline-start-color: #64748b; }
  .ex-ri header { display: flex; flex-wrap: wrap; gap: .35rem .8rem; align-items: center; font-size: 1rem; }
  .ex-ri .sev { font-size: .8rem; font-weight: 800; padding: .1rem .6rem; border-radius: 999px; background: #e2e8f0; }
  .ex-ri.sev0 .sev { background: #b42318; color: #fff; } .ex-ri.sev1 .sev { background: #fde5d4; color: #9a3412; } .ex-ri.sev2 .sev { background: #fdf1dc; color: #9a5b00; }
  .ex-ri .when, .ex-ri .aff { font-size: .92rem; color: #1f2a30; }
  .ex-ri .cs { list-style: none; padding: 0; margin: .5rem 0; display: grid; gap: .25rem; } .ex-ri .cs li { border-inline-start: 4px solid var(--c); padding-inline-start: .55rem; font-size: .95rem; } .ex-ri .cs small { color: #1f2a30; font-size: .85rem; }
  .ex-ri .who { font-size: .9rem; color: #0b4a66; } .ex-ri .why { font-size: .93rem; color: #2f3f46; margin: .35rem 0; }
  .ex-ri footer { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; border-top: 1px dashed #e3e8eb; padding-top: .45rem; }
  .ex-ri .fix { font-size: .93rem; font-weight: 700; color: #15803d; } .ex-ri .fix.muted { color: #1f2a30; font-weight: 400; }
  .ex-empty.warn { border-color: #f3d38b; background: #fffaf0; } .ex-empty > i { font-size: 2.4rem; display: block; color: #15803d; } .ex-empty { color: #15803d; font-weight: 700; font-size: 1.1rem; }
  /* settings */
  .ex-set { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1rem; }
  .ex-setwrap { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 1rem; align-items: start; }
  .ex-setnav { display: flex; flex-direction: column; gap: .35rem; position: sticky; top: 80px; }
  .ex-sn { display: flex; gap: .55rem; align-items: center; text-align: start; border: 1.5px solid #e2e8ec; background: #fff; border-radius: 12px; padding: .55rem .65rem; color: #0f1f26; }
  .ex-sn .bn { width: 26px; height: 26px; border-radius: 50%; background: #eef2f4; color: #1f2a30; display: grid; place-items: center; font-weight: 800; font-size: .85rem; flex: none; }
  .ex-sn > i { font-size: 1.3rem; color: var(--a); } .ex-sn .tx b { display: block; font-size: 1rem; } .ex-sn .tx small { display: block; font-size: .8rem; color: #1f2a30; }
  .ex-sn:hover { border-color: var(--a); } .ex-sn.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 8%, #fff); box-shadow: inset -4px 0 0 var(--a); } .ex-sn.on .bn { background: var(--a); color: #fff; }
  .ex-setmain { min-width: 0; } .ex-setmain .ex-box { width: 100%; }
  .ex-subnav { display: flex; justify-content: space-between; gap: .5rem; flex-wrap: wrap; margin-top: .8rem; }
  @media (max-width: 900px) { .ex-setwrap { grid-template-columns: 1fr; } .ex-setnav { position: static; flex-direction: row; overflow-x: auto; padding-bottom: 4px; } .ex-sn { flex: none; } .ex-sn .tx small { display: none; } }
  [data-theme=dark] .ex-sn { background: #13232a; color: #e8eef0; border-color: #2c4048; }
  .ex-box { border: 1px solid #e2e8ec; border-radius: 18px; background: #fff; overflow: hidden; box-shadow: 0 2px 10px rgba(9,27,34,.05); } .ex-box.wide { grid-column: 1 / -1; }
  .ex-box > header { display: flex; gap: .6rem; align-items: center; padding: .75rem 1rem; background: color-mix(in srgb, var(--a) 9%, #fff); border-bottom: 3px solid var(--a); }
  .ex-box > header .bn { width: 30px; height: 30px; border-radius: 50%; background: var(--a); color: #fff; display: grid; place-items: center; font-weight: 800; flex: none; }
  .ex-box > header > i { font-size: 1.5rem; color: var(--a); } .ex-box h4 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #091b22; } .ex-box header small { color: #1f2a30; font-size: .9rem; }
  .ex-box .bb { padding: .9rem 1rem; display: flex; flex-direction: column; gap: .7rem; }
  .ex-fld { display: flex; flex-direction: column; gap: .3rem; margin: 0; } .ex-fld > span { font-weight: 700; font-size: .95rem; } .ex-fld small { color: #1f2a30; font-size: .85rem; }
  .ex-set .row2, .ex-setwrap .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; align-items: start; }
  .ex-types, .ex-srcs { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .45rem; }
  .ex-type { border: 2px solid #e2e8ec; border-radius: 12px; padding: .6rem; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: .15rem; margin: 0; }
  .ex-type input { display: none; } .ex-type i { font-size: 1.5rem; color: #1f2a30; } .ex-type b { font-size: .92rem; } .ex-type small { font-size: .8rem; color: #1f2a30; }
  .ex-type.on { border-color: var(--a, #901d23); background: color-mix(in srgb, var(--a, #901d23) 7%, #fff); } .ex-type.on i { color: var(--a, #901d23); }
  .ex-chipset { display: flex; flex-wrap: wrap; gap: .35rem; }
  .ex-facs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; } .ex-facs .ex-chk { flex: none; white-space: nowrap; padding: .22rem .6rem; font-size: .88rem; }
  .ex-rules2 { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem 1.4rem; } @media (max-width: 900px) { .ex-rules2 { grid-template-columns: 1fr; } }
  .ex-chk { display: inline-flex; gap: .35rem; align-items: center; border: 1.5px solid #d6dee3; border-radius: 999px; padding: .25rem .7rem; font-size: .92rem; cursor: pointer; margin: 0; background: #fff; }
  .ex-chk input { accent-color: #901d23; } .ex-chk.on { border-color: #901d23; background: #fff3f3; color: #901d23; font-weight: 700; }
  .ex-tagx { display: inline-flex; align-items: center; gap: .2rem; background: #e6edfd; color: #1d4ed8; border-radius: 999px; padding: .15rem .3rem .15rem .6rem; font-weight: 700; font-size: .88rem; } .ex-tagx button { border: 0; background: transparent; color: inherit; padding: 0 .2rem; }
  .ex-add { display: flex; gap: .4rem; flex-wrap: wrap; } .ex-add .form-control { flex: 1 1 180px; width: auto; }
  .ex-days { display: flex; flex-wrap: wrap; gap: .3rem; } .ex-days span { background: #eef4f8; color: #0b4a66; border-radius: 8px; padding: .1rem .5rem; font-size: .85rem; font-weight: 600; }
  .ex-presets { display: flex; flex-wrap: wrap; gap: .35rem; }
  .ex-plist { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: .5rem; margin-bottom: .6rem; }
  .ex-prow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) 6.5rem auto; gap: .45rem; align-items: center; background: #f7fbfa; border: 1px solid #d5ebe6; border-radius: 10px; padding: .4rem .5rem; } .ex-prow .form-control { min-width: 0; padding-inline: .4rem; } .ex-prow > .bdg:not(.teal) { justify-self: stretch; text-align: center; }
  .ex-note1 { margin-top: .5rem; background: #fff; border: 1px solid #b6e0da; border-radius: 9px; padding: .4rem .6rem; color: #1f3b38; font-size: .92rem; } .ex-note1 i { color: #0f766e; } .ex-note1.warn { border-color: #f3d58a; background: #fffaf0; color: #5b4a20; } .ex-note1.warn i { color: #b7791f; }
  .ex-prow.ex-nowin { grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); background: #fdf1f1; border: 1px solid #f3c9c9; border-radius: 10px; padding: .45rem .55rem; margin-bottom: .6rem; } .ex-prow.ex-nowin .bdg { grid-column: auto; } .ex-nowin small { grid-column: 3 / -1; color: #7a2a2a; } .ex-prow.ex-nowin { grid-template-columns: auto minmax(0, 10rem) 1fr; } .ex-chk.lock { cursor: not-allowed; opacity: .9; }
  .ex-pub { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: linear-gradient(90deg, #f1f7fb, #fff); border: 1px solid #bcd3e3; border-inline-start: 5px solid #0b4a66; border-radius: 12px; padding: .6rem .8rem; margin-bottom: .6rem; }
  .ex-pub .t { font-weight: 800; color: #0b4a66; margin-inline-end: .4rem; } .ex-pub .sp { flex: 1; }
  #ex-savebar { position: fixed; inset-inline-start: 16px; bottom: 16px; z-index: 1040; display: none; align-items: center; gap: .6rem; background: #7a1d24; color: #fff; border-radius: 14px; padding: .55rem .7rem .55rem .9rem; box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: calc(100vw - 32px); }
  #ex-savebar.on { display: flex; } #ex-savebar.ok { background: #146c43; } #ex-savebar > i { font-size: 1.3rem; }
  #ex-savebar span { display: flex; flex-direction: column; line-height: 1.25; } #ex-savebar small { opacity: .85; font-size: .78rem; }
  @media print { #ex-savebar { display: none !important; } }
  .ex-pubsteps { padding-inline-start: 1.3rem; margin-bottom: .8rem; } .ex-pubsteps li { margin-bottom: .25rem; }
  .ex-pubsteps kbd { background: #eef2f6; color: #222; border: 1px solid #c9d3dd; padding: 0 .35rem; font-size: .85em; }
  .ex-pubst { margin-top: .8rem; padding: .6rem .8rem; border-radius: 10px; background: #f4f6f8; color: #1f2a30; font-size: .92rem; }
  .ex-pubst.wait { background: #fff8e6; color: #6a4b00; border: 1px solid #f0d58c; } .ex-pubst.ok { background: #e9f7ef; color: #135d32; border: 1px solid #a8dcbc; }
  .ex-srcs.two { grid-template-columns: 1fr 1fr; }
  .ex-pool2 { border: 1px solid #ecd3e0; background: #fdf8fb; border-radius: 14px; padding: .75rem .8rem; margin-top: .8rem; }
  .ex-pool2 .h { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; } .ex-pool2 .h .t { font-weight: 800; color: #9d174d; font-size: 1.08rem; margin-inline-end: .3rem; }
  .ex-pool2 .h input { max-width: 15rem; margin-inline-start: auto; } .ex-pool2 .hint { color: #1f2a30; font-size: .86rem; margin: .4rem 0 .6rem; }
  .ex-pool2 .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: .7rem; align-items: start; }
  .ex-pool2 .dc { background: #fff; border: 1px solid #e8d6e0; border-top: 4px solid #be185d; border-radius: 12px; overflow: hidden; }
  .ex-pool2 .dc header { display: flex; align-items: center; gap: .5rem; padding: .5rem .7rem; background: #fbf1f6; border-bottom: 1px solid #f0dde7; }
  .ex-pool2 .dc header b { flex: 1; color: #091b22; font-size: 1rem; } .ex-pool2 .dc header .n { background: #be185d; color: #fff; border-radius: 999px; padding: 0 .55rem; font-weight: 800; font-size: .85rem; } .ex-pool2 .dc header .n small { opacity: .8; font-weight: 600; }
  .ex-pool2 .dc header .btn { padding: 0; font-size: .8rem; }
  .ex-pool2 .ls { display: grid; grid-template-columns: 1fr; max-height: 20rem; overflow: auto; }
  .ex-pool2 .pr { display: grid; grid-template-columns: 1.3rem minmax(0, 1fr) 2.6rem; align-items: center; gap: .45rem; width: 100%; border: 0; border-bottom: 1px solid #f3edf0; background: #fff; padding: .38rem .7rem; text-align: start; font-size: .93rem; color: #1c2b31; }
  .ex-pool2 .pr:nth-child(even) { background: #fcfafb; } .ex-pool2 .pr:hover { background: #fdeef5; } .ex-pool2 .pr i { color: #15803d; }
  .ex-pool2 .pr .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ex-pool2 .pr .k { justify-self: end; min-width: 2rem; text-align: center; background: #eef2f4; color: #1f2a30; border-radius: 6px; font-size: .78rem; font-weight: 700; padding: .05rem .3rem; }
  .ex-pool2 .pr.off { color: #9aa6ac; } .ex-pool2 .pr.off .nm { text-decoration: line-through; } .ex-pool2 .pr.off i { color: #b42318; }
  [data-theme=dark] .ex-pool2, [data-theme=dark] .ex-pool2 .dc, [data-theme=dark] .ex-pool2 .pr { background: #13232a; border-color: #2c4048; color: #e8eef0; } [data-theme=dark] .ex-pool2 .dc header { background: #1b2e35; } [data-theme=dark] .ex-pool2 .dc header b { color: #e8eef0; }
  .ex-pv-sum { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .5rem; }
  .ex-pv-load { border: 1px solid #e2e8ec; border-radius: 14px; padding: .6rem .75rem; margin-bottom: .7rem; background: #fff; }
  .ex-pv-load summary { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; cursor: pointer; list-style: none; } .ex-pv-load summary::-webkit-details-marker { display: none; }
  .ex-pv-load summary .t { font-weight: 800; color: #0b4a66; } .ex-pv-load summary .ch { display: inline-block; font-size: .8em; margin-inline-start: .3rem; transition: transform .2s; }
  .ex-pv-load[open] summary .ch { transform: rotate(180deg); }
  .ex-pv-load .lg { display: flex; flex-wrap: wrap; gap: .8rem; margin-inline-start: auto; font-size: .8rem; color: #1f2a30; }
  .ex-pv-load .lg span::before { content: ''; display: inline-block; width: .7rem; height: .7rem; border-radius: 3px; margin-inline-end: .3rem; vertical-align: -1px; background: var(--t); }
  .ex-pv-load .lg .hi, .ex-ldrow.hi { --t: #b42318; --tb: #fdecea; } .ex-pv-load .lg .mid, .ex-ldrow.mid { --t: #0b4a66; --tb: #e8f1f6; } .ex-pv-load .lg .lo, .ex-ldrow.lo { --t: #9a6b00; --tb: #fff4d6; } .ex-ldrow.zero { --t: #6c757d; --tb: #f1f3f5; }
  .ex-ldg { display: flex; flex-direction: column; gap: .45rem; margin-top: .65rem; max-height: 24rem; overflow-y: auto; padding-inline-end: .2rem; }
  .ex-ldrow { display: grid; grid-template-columns: 7.2rem minmax(0, 1fr); gap: .6rem; align-items: start; border: 1px solid #e8edf1; border-inline-start: 4px solid var(--t); border-radius: 10px; padding: .45rem; background: #fbfcfd; }
  .ex-ldk { display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--tb); color: var(--t); border-radius: 8px; padding: .2rem .3rem; text-align: center; line-height: 1.2; min-height: 2.15rem; }
  .ex-ldk b { font-size: 1.15rem; font-variant-numeric: tabular-nums; } .ex-ldk small { font-weight: 700; font-size: .78rem; } .ex-ldk span { font-size: .7rem; opacity: .85; }
  .ex-ldnames { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: .3rem .45rem; align-content: start; }
  .ex-ldn { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .87rem; line-height: 1.5; padding: .2rem .55rem; border-radius: 7px; background: #fff; border: 1px solid #edf1f4; }
  @media (max-width: 576px) { .ex-ldrow { grid-template-columns: 1fr; } .ex-ldk { flex-direction: row; gap: .6rem; } #ex-savebar small { display: none; } .ex-ldnames { grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); } }
  .ex-ld { border: 1px solid #dde3e7; border-radius: 8px; padding: .1rem .2rem .1rem .5rem; font-size: .85rem; background: #f7f9fa; } .ex-ld b { display: inline-block; min-width: 1.5rem; text-align: center; background: #0b4a66; color: #fff; border-radius: 6px; margin-inline-start: .35rem; }
  .ex-ld.hi b { background: #b42318; } .ex-ld.lo b { background: #15803d; }
  .ex-pv td { vertical-align: top; } .ex-pv tr.fx td { background: #fffaf0 !important; } .ex-pv .ex-pp { position: relative; } .ex-pv .ex-pp.own { background: #e7f6ec; border-color: #86c99b; } .ex-pv .ex-pp b.c { background: #0b4a66; color: #fff; border-radius: 5px; padding: 0 .3rem; font-size: .75rem; margin-inline-start: .2rem; }
  .ex-pv .ex-pp button { border: 0; background: none; color: #b42318; padding: 0 0 0 .1rem; } .ex-pfsel { min-width: 13rem; }
  .ex-cal3 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.25fr) minmax(0, 1fr); gap: .75rem; align-items: stretch; }
  .ex-cal3 section { border: 1px solid #e2e8ec; border-radius: 12px; padding: .65rem .75rem; background: #fbfcfd; display: flex; flex-direction: column; gap: .35rem; }
  .ex-cal3 h6 { font-weight: 800; color: #0b4a66; margin: 0 0 .2rem; } .ex-cal3 small { color: #1f2a30; } .ex-cal3 .ex-fld { margin: 0; }
  .ex-cal3 .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; align-items: start; }
  .ex-cal3 .calc { border: 1px solid #c9d8e3; background: #eef5fa; border-radius: 8px; padding: .38rem .6rem; font-weight: 800; font-size: 1.1rem; color: #0b4a66; } .ex-cal3 .calc small { font-size: .72rem; font-weight: 600; }
  .ex-wk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; } .ex-wk .ex-chk { justify-content: center; }
  .ex-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) auto; gap: .6rem; margin: .8rem 0; align-items: stretch; }
  .ex-kpis .k { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: .55rem; align-items: center; background: #fff; border: 1px solid #e2e8ec; border-top: 3px solid #0b4a66; border-radius: 12px; padding: .5rem .7rem; }
  .ex-kpis .k i { grid-row: span 2; font-size: 1.45rem; color: #0b4a66; } .ex-kpis .k b { font-size: 1.15rem; color: #091b22; line-height: 1.2; } .ex-kpis .k span { font-size: .8rem; color: #1f2a30; }
  .ex-kpis .k.ex { border-top-color: #901d23; } .ex-kpis .k.ex i, .ex-kpis .k.ex b { color: #901d23; } .ex-kpis .k.hol { border-top-color: #b7791f; } .ex-kpis .k.hol i { color: #b7791f; }
  .ex-kpis .lg { display: flex; flex-direction: column; justify-content: center; gap: .25rem; font-size: .82rem; color: #1f2a30; padding-inline-start: .3rem; } .ex-kpis .lg span { white-space: nowrap; }
  .d { display: inline-block; width: .9rem; height: .9rem; border-radius: 4px; vertical-align: -2px; margin-inline-end: .25rem; } .d.ex { background: #901d23; } .d.off { background: #e5e8eb; } .d.hol { background: repeating-linear-gradient(135deg, #f87171 0 3px, #fee2e2 3px 6px); }
  .ex-calbody { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 22rem); gap: .8rem; align-items: start; }
  .ex-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: .8rem; }
  .ex-month { border: 1px solid #e2e8ec; border-radius: 14px; padding: .65rem .75rem; background: #fff; } .ex-month h6 { text-align: center; font-weight: 800; font-size: 1.1rem; margin: 0 0 .5rem; color: #091b22; }
  .ex-month .g { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; } .ex-month .g > i { text-align: center; font-style: normal; font-weight: 800; color: #1f2a30; font-size: .8rem; padding-bottom: .2rem; border-bottom: 2px solid #eef2f4; }
  .ex-month .g button { border: 0; border-radius: 9px; min-height: 3.3rem; background: #f7f8fa; color: #9aa6ac; padding: .2rem; line-height: 1.1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem; }
  .ex-month .g button b { font-size: 1.05rem; } .ex-month .g button small { font-size: .66rem; } .ex-month .g button.ex { background: #901d23; color: #fff; box-shadow: 0 2px 5px rgba(144,29,35,.25); } .ex-month .g button.ex small { color: #fde2e3; background: rgba(255,255,255,.15); border-radius: 999px; padding: 0 .4rem; }
  .ex-month .g button.off { background: #e9ecef; color: #1f2a30; } .ex-month .g button.hol { background: repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px); color: #b42318; } .ex-month .g button.out { background: transparent; color: #c4ccd1; }
  .ex-month .g button.today { outline: 2px solid #0b4a66; outline-offset: 1px; } .ex-month .g button[data-tgl]:hover { outline: 2px solid #b7791f; }
  .ex-dlist { border: 1px solid #e2e8ec; border-radius: 14px; background: #fff; padding: .6rem .7rem; max-height: 30rem; overflow: auto; } .ex-dlist h6 { font-weight: 800; color: #091b22; margin: 0 0 .4rem; }
  .ex-dlist ol { list-style: none; margin: 0; padding: 0; } .ex-dlist li { display: grid; grid-template-columns: 1.9rem 4.6rem 1fr auto auto; align-items: center; gap: .45rem; padding: .32rem .2rem; border-bottom: 1px solid #f1f3f5; font-size: .92rem; }
  .ex-dlist li.wk { display: block; border: 0; font-size: .78rem; font-weight: 800; color: #0b4a66; padding: .5rem .2rem .15rem; }
  .ex-dlist .no { background: #901d23; color: #fff; border-radius: 7px; text-align: center; font-weight: 800; font-size: .82rem; } .ex-dlist .wd { font-weight: 800; } .ex-dlist .dt { color: #1f2a30; font-variant-numeric: tabular-nums; }
  .ex-dlist .ct { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 0 .5rem; font-size: .78rem; font-weight: 700; white-space: nowrap; } .ex-dlist .ct.mut { background: #f1f3f5; color: #1f2a30; } .ex-dlist .btn { color: #b42318; padding: 0 .2rem; }
  @media (max-width: 1200px) { .ex-cal3 { grid-template-columns: 1fr 1fr; } .ex-cal3 .dur { grid-column: 1 / -1; } .ex-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ex-kpis .lg { grid-column: 1 / -1; flex-direction: row; gap: 1rem; } .ex-calbody { grid-template-columns: 1fr; } }
  @media (max-width: 700px) { .ex-cal3, .ex-cal3 .g3 { grid-template-columns: 1fr; } .ex-kpis { grid-template-columns: 1fr 1fr; } .ex-months { grid-template-columns: 1fr; } .ex-month .g button { min-height: 2.6rem; } .ex-month .g > i { font-size: .62rem; } }
  .ex-what { border: 1px solid #b6e0da; background: #f1fbf9; border-radius: 12px; padding: .65rem .8rem; margin-bottom: .8rem; } .ex-what .q { font-weight: 800; color: #0f766e; font-size: 1.05rem; } .ex-what p { margin: .25rem 0 .5rem; color: #1f3b38; }
  .ex-what ul { margin: .5rem 0 0; padding-inline-start: 1.1rem; color: #1f2a30; font-size: .9rem; }
  .ex-cap { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; } .ex-cap span { background: #fff; border: 1px solid #b6e0da; border-radius: 8px; padding: .15rem .55rem; } .ex-cap span.t { background: #0f766e; color: #fff; border-color: #0f766e; } .ex-cap i { font-style: normal; color: #0f766e; font-weight: 800; } .ex-cap .avg { background: transparent; border: 0; color: #1f2a30; }
  .ex-tl { margin-top: .7rem; } .ex-tl .bar { position: relative; height: 3.1rem; background: #eef2f4; border-radius: 10px; overflow: hidden; }
  .ex-tl .win { position: absolute; top: 0; bottom: 0; background: #d5efe9; } .ex-tl .p { position: absolute; top: .3rem; bottom: .3rem; background: #0f766e; color: #fff; border-radius: 7px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .75rem; line-height: 1.1; overflow: hidden; white-space: nowrap; }
  .ex-tl .p.bad { background: #b42318; } .ex-tl .p small { font-size: .68rem; opacity: .9; } .ex-tl .g { position: absolute; top: 1.2rem; height: .7rem; background: repeating-linear-gradient(90deg, #b7791f 0 4px, transparent 4px 8px); }
  .ex-tl .ax { position: relative; height: 1.1rem; } .ex-tl .ax i { position: absolute; transform: translateX(50%); font-style: normal; font-size: .72rem; color: #1f2a30; }
  .ex-tl .lgd { display: flex; flex-wrap: wrap; gap: .8rem; font-size: .8rem; color: #1f2a30; } .d.win { background: #d5efe9; } .d.p { background: #0f766e; } .d.g { background: repeating-linear-gradient(90deg, #b7791f 0 3px, transparent 3px 6px); }
  @media (max-width: 900px) { .ex-cal3 { grid-template-columns: 1fr; } }
  .ex-mk { border: 2px dashed #b7791f; background: #fffaf0; border-radius: 12px; padding: .7rem .85rem; margin-bottom: .8rem; } .ex-mk .h { font-weight: 800; color: #7a4b00; font-size: 1.05rem; } .ex-mk p { margin: .2rem 0 .5rem; color: #5b4a20; }
  .ex-tplbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: #f2f6fb; border: 1px dashed #9db4d0; border-radius: 10px; padding: .45rem .65rem; margin: -.3rem 0 .6rem; } .ex-tplbar > i { color: #0b4a66; } .ex-tplbar span { flex: 1 1 240px; font-size: .92rem; }
  .ex-docs { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; background: #fbf7ef; border: 1px solid #ecdcbc; border-radius: 12px; padding: .55rem .7rem; margin-bottom: .6rem; }
  .ex-docs > b { color: #7a4b00; margin-inline-end: .3rem; } .ex-docs small { flex-basis: 100%; } .ex-docs .btn small { font-size: .7rem; background: #fff3; border: 1px solid currentColor; border-radius: 4px; padding: 0 .25rem; margin-inline-start: .2rem; }
  .ex-reqbar { display: flex; flex-wrap: nowrap; gap: .5rem; align-items: center; background: #f2f6fb; border: 1px dashed #9db4d0; border-radius: 10px; padding: .5rem .65rem; margin-bottom: .6rem; }
  .ex-rt { min-width: 6.5rem; } .ex-rt.lab { background-color: #e6f6f4; border-color: #0f766e; color: #0f766e; font-weight: 700; } .ex-rt.hall { background-color: #eef2ff; border-color: #4f46e5; color: #3730a3; font-weight: 700; }
  .ex-qn { width: 4.6rem; } .ex-qnote { min-width: 9rem; }
  .ex-win { border: 1px solid #f3c9c9; background: #fdf6f6; border-radius: 12px; padding: .6rem .75rem; margin-bottom: .7rem; } .ex-win-h { font-weight: 800; color: #901d23; margin-bottom: .4rem; }
  .ex-win-g { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; } .ex-win-g label span { display: block; font-size: .9rem; font-weight: 700; margin-bottom: .15rem; }
  .ex-win details { margin-top: .5rem; } .ex-win summary { cursor: pointer; font-weight: 700; color: #0b4a66; }
  .ex-win-d { display: grid; gap: .3rem; margin-top: .4rem; } .ex-win-d .r { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto minmax(0, 1fr) 4rem; gap: .35rem; align-items: center; } .ex-win-d .r.on b { color: #901d23; } .ex-win-d small { color: #1f2a30; }
  .ex-cell.blk { background: repeating-linear-gradient(135deg, #f4f5f7 0 8px, #eceef1 8px 16px) !important; } .blkt { font-size: .8rem; color: #1f2a30; text-align: center; padding: .4rem 0; } .blkt.bad { color: #b42318; font-weight: 700; } .ex-chk.lock small { font-size: .75rem; opacity: .85; }
  .ex-sw { display: grid; grid-template-columns: auto 1fr; gap: .6rem; align-items: center; margin: 0; cursor: pointer; } .ex-sw input { display: none; }
  .ex-sw .tg { width: 44px; height: 24px; border-radius: 999px; background: #cbd5da; position: relative; transition: .2s; } .ex-sw .tg::after { content: ''; position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: .2s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
  .ex-sw input:checked + .tg { background: #15803d; } .ex-sw input:checked + .tg::after { right: 23px; } .ex-sw b { display: block; font-size: .95rem; } .ex-sw small { display: block; color: #1f2a30; font-size: .84rem; }
  .ex-rule { background: #f1f6f9; border-radius: 10px; padding: .5rem .7rem; font-size: .92rem; } .ex-rule.hard { background: #e4f5e9; color: #14532d; font-weight: 600; } .ex-rule.ok { background: #e4f5e9; color: #15803d; } .ex-rule.warn { background: #fff4e0; color: #8a4b00; }
  .ex-rooms { max-height: 320px; overflow: auto; border: 1px solid #e2e8ec; border-radius: 10px; } .ex-rooms.tall { max-height: 460px; } .ex-rooms table { margin: 0; font-size: .92rem; } .ex-rooms thead th { position: sticky; top: 0; background: #eef2f4; z-index: 1; } .ex-rooms tr.off td { opacity: .55; }
  .ex-drafts { list-style: none; padding: 0; margin: 0; display: grid; gap: .4rem; } .ex-drafts li { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; border: 1px solid #e2e8ec; border-radius: 12px; padding: .5rem .7rem; }
  .ex-drafts li > i { font-size: 1.4rem; color: #0b4a66; } .ex-drafts li.app { border-color: #15803d; background: #f2faf5; } .ex-drafts li.app > i { color: #15803d; } .ex-drafts li span small { display: block; color: #1f2a30; } .ex-drafts .acts { margin-inline-start: auto; display: flex; gap: .3rem; flex-wrap: wrap; } .ex-drafts li.empty { color: #1f2a30; }
  [data-theme=dark] #ex-app { color: #e8eef0; }
  [data-theme=dark] .ex-step, [data-theme=dark] .ex-box, [data-theme=dark] .ex-day, [data-theme=dark] .ex-ri, [data-theme=dark] .ex-per, [data-theme=dark] .ex-type, [data-theme=dark] .ex-chk { background: #13232a; color: #e8eef0; border-color: #2c4048; }
  [data-theme=dark] .ex-cell, [data-theme=dark] .ex-mx td, [data-theme=dark] .ex-filter { background: #13232a; border-color: #2c4048; } [data-theme=dark] .ex-card .n, [data-theme=dark] .ex-h, [data-theme=dark] .ex-box h4 { color: #e8eef0; }
  [data-theme=dark] .ex-card, [data-theme=dark] .ex-row { background: #1b2f37; } [data-theme=dark] .ex-grid th.day, [data-theme=dark] .ex-mx th.rh, [data-theme=dark] .ex-views { background: #1b2f37; color: #e8eef0; }
  @media (max-width: 700px) {
    .ex-step { min-width: 120px; padding: .45rem; } .ex-step .tx small { display: none; } .ex-steps .sep { display: none; }
    .ex-set { grid-template-columns: 1fr; } .ex-set .row2, .ex-setwrap .row2 { grid-template-columns: 1fr; } .ex-days-v { grid-template-columns: 1fr; }
    .ex-grid { min-width: 0; border-spacing: 3px; } .ex-grid .corner, .ex-grid th.day { width: 56px; } .ex-grid th small { font-size: .75rem; }
    .ex-card { padding: 3px 4px; } .ex-card .n, .ex-card .m { display: none; } .ex-card .t b { font-size: .82rem; } .ex-cell { height: 56px; } .ex-cell .cap { display: none; }
    .ex-prow { grid-template-columns: auto 1fr auto 1fr; } .ex-prow > .bdg:not(.teal) { grid-column: 1 / 4; } .ex-prow > .btn { grid-column: 4; } .ex-per { grid-template-columns: 1fr; } .ex-filter .form-select { flex: 1 1 45%; }
  }
  .ex-type { display: grid !important; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: .55rem; row-gap: 0; text-align: start !important; align-items: center !important; padding: .45rem .6rem !important; }
  .ex-type i { grid-row: 1 / 3; font-size: 1.25rem !important; } .ex-type b { line-height: 1.25; } .ex-type small { grid-column: 2; line-height: 1.25; }
  .ex-fold > summary { cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; gap: .4rem; align-items: baseline; } .ex-fold > summary::-webkit-details-marker { display: none; }
  .ex-fold > summary::after { content: '▾'; margin-inline-start: auto; color: #1f2a30; } .ex-fold[open] > summary::after { content: '▴'; } .ex-fold > summary small { font-weight: 400; color: #1f2a30; }
  .ex-fold:not([open]) { padding-bottom: .55rem !important; }
  .ex-pool2 .pr .hd { color: #9d174d; font-size: .75rem; }
  @media (min-width: 1100px) { .ex-files { grid-template-columns: 1fr 1fr; } .ex-files > .h { grid-column: 1 / -1; } .ex-files .ex-up { margin: 0; } }
  .ex-row2b { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: .8rem; align-items: start; margin: .6rem 0; } @media (max-width: 900px) { .ex-row2b { grid-template-columns: 1fr; } }
  .ex-fixd { border: 1px solid #f0d9c8; background: #fffaf5; border-radius: 12px; padding: .55rem .7rem; margin: .5rem 0; } .ex-fixd > summary i { color: #9a3412; }
  .ex-two { display: grid; grid-template-columns: minmax(250px, 320px) minmax(0, 1fr); gap: 1rem; align-items: start; } @media (max-width: 900px) { .ex-two { grid-template-columns: 1fr; } }
  .ex-side { border: 1px solid #e2e8ec; border-radius: 12px; padding: .65rem .75rem; background: #fbfcfd; display: grid; gap: .55rem; } .ex-side h6 { font-size: .92rem; font-weight: 800; margin: 0; color: #0b4a66; }
  .ex-opts { display: grid; gap: .3rem; } .ex-opts label { display: flex; gap: .45rem; align-items: flex-start; border: 1.5px solid #e2e8ec; border-radius: 9px; padding: .35rem .5rem; margin: 0; cursor: pointer; background: #fff; }
  .ex-opts label.on { border-color: #901d23; background: #fff6f6; } .ex-opts input { margin-top: .25rem; accent-color: #901d23; } .ex-opts b { display: block; font-size: .88rem; } .ex-opts small { display: block; font-size: .78rem; color: #1f2a30; }
  .ex-sent { font-size: .88rem; line-height: 2.1; } .ex-sent input { display: inline-block; width: 4.2rem; padding: .1rem .3rem; text-align: center; } .ex-sent small { color: #1f2a30; }
  .ex-tbar { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin-bottom: .45rem; }
  .ex-main2 .ex-pool2 { margin-top: .5rem; }
  .ex-row2b .ex-chipset { display: flex; flex-wrap: wrap; gap: .3rem; } .ex-up .st { display: block !important; white-space: normal; }
  .ex-reqbar > * { flex: none; white-space: nowrap; } .ex-reqbar .tx { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: .85rem; color: #1f2a30; }
  @media (max-width: 760px) { .ex-reqbar { flex-wrap: wrap; } .ex-reqbar .tx { flex-basis: 100%; white-space: normal; } }
  .ex-pset { display: flex; flex-wrap: wrap; gap: .6rem .9rem; align-items: flex-end; border: 1px solid #ecd3e0; background: #fdf8fb; border-radius: 12px; padding: .6rem .75rem; }
  .ex-pset .f { display: flex; flex-direction: column; gap: .2rem; } .ex-pset .f > span { font-size: .8rem; font-weight: 800; color: #1f2a30; } .ex-pset .f > span small { font-weight: 400; }
  .ex-pset .f input[type=number] { width: 5.5rem; } .ex-pset .f.grow { flex: 1 1 320px; } .ex-pset .up { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; min-height: 31px; }
  .ex-pset .st { font-size: .85rem; color: #1f2a30; } .ex-pset .st.ok { color: #15803d; font-weight: 700; }
  .ex-pset .seg { display: inline-flex; border: 1.5px solid #d6dee3; border-radius: 9px; overflow: hidden; background: #fff; } .ex-pset .seg label { margin: 0; padding: .28rem .7rem; font-size: .86rem; font-weight: 700; cursor: pointer; }
  .ex-pset .seg label + label { border-inline-start: 1.5px solid #d6dee3; } .ex-pset .seg label.on { background: #be185d; color: #fff; } .ex-pset .seg input { display: none; }
  .ex-pmore { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; align-items: center; margin: .45rem 0 .2rem; } .ex-pmore > details { flex: 1 1 100%; }
  .ex-pool3 { border: 1px solid #ecd3e0; border-radius: 12px; margin-top: .6rem; overflow: hidden; }
  .ex-pool3 .h { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; padding: .5rem .7rem; background: #fbf1f6; border-bottom: 1px solid #f0dde7; }
  .ex-pool3 .h .t { color: #9d174d; font-size: 1.02rem; margin-inline-end: .3rem; } .ex-pool3 .h input { max-width: 14rem; margin-inline-start: auto; }
  .ex-pool3 .hint { margin: 0; padding: .35rem .7rem; font-size: .82rem; color: #1f2a30; border-bottom: 1px solid #f3e7ee; }
  .ex-pool3 .dr { display: grid; grid-template-columns: 210px minmax(0, 1fr); border-bottom: 1px solid #f3e7ee; } .ex-pool3 .dr:last-child { border-bottom: 0; }
  .ex-pool3 .dh { padding: .5rem .7rem; background: #fff; border-inline-end: 3px solid #be185d; display: flex; flex-direction: column; gap: .15rem; } .ex-pool3 .dh b { font-size: .92rem; line-height: 1.3; }
  .ex-pool3 .dh .n { font-size: .78rem; font-weight: 700; color: #9d174d; } .ex-pool3 .dh .btn { font-size: .78rem; align-self: flex-start; }
  .ex-pool3 .nm { display: flex; flex-wrap: wrap; gap: .3rem; padding: .45rem .6rem; align-content: flex-start; background: #fffdfe; }
  .ex-pool3 .pc { display: inline-flex; align-items: center; gap: .3rem; border: 1px solid #e6d5de; background: #fff; border-radius: 8px; padding: .2rem .45rem; font-size: .86rem; color: #1f2a30; }
  .ex-pool3 .pc i { color: #15803d; font-size: .8rem; } .ex-pool3 .pc small { color: #9d174d; font-size: .72rem; } .ex-pool3 .pc .k { background: #eef2f4; border-radius: 5px; padding: 0 .3rem; font-size: .74rem; font-weight: 700; }
  .ex-pool3 .pc.off { opacity: .55; text-decoration: line-through; } .ex-pool3 .pc.off i { color: #b42318; } .ex-pool3 .pc:hover { border-color: #be185d; }
  @media (max-width: 700px) { .ex-pool3 .dr { grid-template-columns: 1fr; } .ex-pool3 .dh { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: .5rem; border-inline-end: 0; border-bottom: 2px solid #be185d; } }
  .ex-p4 { border: 1px solid #b6e0da; background: #f6fcfb; border-radius: 12px; padding: .55rem .7rem; display: grid; gap: .45rem; }
  .ex-p4 .r1 { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; } .ex-p4 .ex-cap { margin: 0; flex: 1 1 auto; } .ex-p4 .ex-tl { margin: 0; } .ex-p4 .ex-tl .lgd { display: none; } .ex-p4 .ex-tl .bar { height: 2.6rem; }
  .ex-help { position: relative; } .ex-help > summary { list-style: none; cursor: pointer; color: #0f766e; font-weight: 800; font-size: .88rem; } .ex-help > summary::-webkit-details-marker { display: none; }
  .ex-help .pop { position: absolute; inset-inline-end: 0; top: 1.6rem; z-index: 5; width: min(420px, 85vw); background: #fff; border: 1px solid #b6e0da; border-radius: 10px; padding: .6rem .8rem; box-shadow: 0 8px 24px rgba(0,0,0,.12); font-size: .86rem; }
  .ex-help .pop p { margin: 0 0 .3rem; } .ex-help .pop ul { margin: 0; padding-inline-start: 1.1rem; }
  .ex-p4 .r3 { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; font-size: .9rem; } .ex-p4 .r3 > i { color: #0f766e; } .ex-p4 .r3 input[type=time] { width: 7.2rem; }
  .ex-dw { margin-inline-start: .6rem; } .ex-dw > summary { cursor: pointer; font-size: .85rem; font-weight: 700; color: #0b4a66; } .ex-dw[open] { flex: 1 1 100%; margin: 0; } .ex-dw .ex-win-d { display: flex; flex-wrap: wrap; gap: .3rem .8rem; margin: .3rem 0; }
  .ex-dw .ex-win-d .r { display: inline-flex; gap: .3rem; align-items: center; } .ex-dw .ex-win-d input { width: 6.6rem; }
  .ex-p4 .r4 { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
  .ex-p4 .pp { display: inline-flex; align-items: center; gap: .2rem; border: 1.5px solid #9fd3cb; background: #fff; border-radius: 9px; padding: .15rem .25rem .15rem .15rem; }
  .ex-p4 .pp > b { background: #0f766e; color: #fff; border-radius: 6px; min-width: 1.4rem; text-align: center; font-size: .8rem; } .ex-p4 .pp input { width: 5.7rem; padding: .1rem .25rem; font-size: .85rem; }
  .ex-p4 .pp .btn { padding: 0 .3rem; color: #b42318; } .ex-p4 .pp.bad { border-color: #b42318; background: #fff4f4; } .ex-p4 .pp.bad > b { background: #b42318; }
  .ex-steps { margin: .4rem 0 !important; gap: .25rem !important; } .ex-steps .sep { font-size: .8rem !important; }
  .ex-step { padding: .3rem .55rem !important; border-radius: 10px !important; min-width: 0 !important; gap: .4rem !important; }
  .ex-step .num { width: 24px !important; height: 24px !important; font-size: .8rem !important; } .ex-step .tx { min-width: 0; line-height: 1.25; }
  .ex-step .tx b { display: inline !important; font-size: .9rem !important; } .ex-step .tx small { display: block; font-size: .74rem !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ex-pbar-k { font-size: .82rem; color: #1f2a30; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .ex-pbar-only { display: inline-flex; align-items: center; gap: .3rem; background: #e0f2fe; color: #0b4a66; border-radius: 999px; padding: .1rem .2rem .1rem .6rem; font-size: .8rem; font-weight: 700; white-space: nowrap; }
  .ex-pbar-only button { border: 0; background: transparent; color: #0b4a66; padding: 0 .2rem; }
  .ex-filter { flex-wrap: wrap; } .ex-filter .form-select { width: auto; max-width: 15rem; } .ex-filter .form-control { flex: 1 1 14rem; min-width: 10rem; }
  .ex-filter .ex-help .pop { top: 1.8rem; }
  .ex-vers { display: flex; flex-wrap: wrap; gap: .45rem .7rem; align-items: center; border: 1px solid #d9e6ee; background: #f6fafc; border-radius: 12px; padding: .45rem .65rem; margin-bottom: .55rem; }
  .ex-vers .st { font-weight: 800; color: #8a4b00; font-size: .9rem; } .ex-vers .st.ok { color: #15803d; }
  .ex-vers .new { display: inline-flex; gap: .3rem; } .ex-vers .new input { width: 13rem; }
  .ex-vers .list { display: flex; flex-wrap: wrap; gap: .3rem; flex: 1 1 auto; } .ex-vers .v { display: inline-flex; align-items: center; gap: .2rem; border: 1px solid #d6dee3; background: #fff; border-radius: 8px; padding: .12rem .2rem .12rem .45rem; font-size: .86rem; font-weight: 700; }
  .ex-vers .v.app { border-color: #15803d; background: #effaf3; color: #15803d; } .ex-vers .v button { border: 0; background: transparent; padding: 0 .25rem; color: #0b4a66; } .ex-vers .v button[data-ddel] { color: #b42318; }
  .ex-p4 .r34 { display: grid; grid-template-columns: minmax(260px, 330px) minmax(0, 1fr); gap: .7rem; align-items: start; } @media (max-width: 900px) { .ex-p4 .r34 { grid-template-columns: 1fr; } }
  .ex-p4 .cd { background: #fff; border: 1px solid #cfe9e4; border-radius: 11px; padding: .55rem .7rem; } .ex-p4 .cd h6 { display: flex; align-items: center; gap: .4rem; font-size: .92rem; font-weight: 800; color: #0f766e; margin: 0 0 .5rem; }
  .ex-p4 .cd h6 .n { background: #e6f4f1; color: #0f766e; border-radius: 999px; padding: 0 .5rem; font-size: .78rem; }
  .ex-p4 .win { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; } .ex-p4 .win label { margin: 0; display: flex; flex-direction: column; gap: .15rem; } .ex-p4 .win span { font-size: .8rem; font-weight: 700; color: #1f2a30; }
  .ex-p4 .ex-dw { margin: .5rem 0 0; } .ex-p4 .ex-dw > summary { font-size: .84rem; }
  .ex-p4 .dws { display: grid; gap: .3rem; margin-top: .4rem; } .ex-p4 .dwr { display: grid; grid-template-columns: 4.2rem 1fr auto 1fr 3rem; gap: .3rem; align-items: center; font-size: .84rem; }
  .ex-p4 .dwr input { width: 100% !important; } .ex-p4 .dwr small { color: #1f2a30; font-size: .74rem; } .ex-p4 .dwr.on b { color: #0f766e; }
  .ex-p4 .pl { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: .4rem; }
  .ex-p4 .pp { display: grid !important; grid-template-columns: 1.6rem minmax(6rem, 1fr) auto minmax(6rem, 1fr) 4.4rem 1.4rem; gap: .3rem; align-items: center; border: 1px solid #cfe9e4 !important; background: #f8fcfb !important; border-radius: 9px !important; padding: .3rem .4rem !important; }
  .ex-p4 .pp > b { background: #0f766e; color: #fff; border-radius: 6px; text-align: center; font-size: .8rem; line-height: 1.6; } .ex-p4 .pp input { width: 100% !important; min-width: 0; padding: .15rem .3rem; font-size: .86rem; }
  .ex-p4 .pp > span { color: #1f2a30; } .ex-p4 .pp small { font-size: .75rem; color: #1f2a30; text-align: center; white-space: nowrap; } .ex-p4 .pp .del { padding: 0; color: #b42318; border: 0; }
  .ex-p4 .pp.bad { border-color: #b42318 !important; background: #fff4f4 !important; } .ex-p4 .pp.bad > b { background: #b42318; } .ex-p4 .pp.bad small { color: #b42318; font-weight: 700; }
  .ex-p4 .ex-tl .bar { height: 3.3rem !important; } .ex-p4 .ex-tl .p { font-size: .92rem !important; font-weight: 700; } .ex-p4 .ex-tl .p small { font-size: .84rem !important; opacity: 1 !important; font-weight: 600; }
  .ex-p4 .ex-tl .ax { height: 1.4rem !important; } .ex-p4 .ex-tl .ax i { font-size: .86rem !important; font-weight: 700; }
  .ex-p4 .ex-cap { font-size: 1rem; } .ex-p4 .cd h6 { font-size: 1.05rem !important; } .ex-p4 .win span, .ex-p4 .ex-dw > summary { font-size: .95rem !important; }
  .ex-p4 input[type=time] { font-size: 1.02rem !important; font-weight: 600; color: #0f1f26; }
  .ex-p4 .pp > b { font-size: .95rem !important; line-height: 1.8 !important; } .ex-p4 .pp small { font-size: .9rem !important; font-weight: 600; } .ex-p4 .pp > span { font-size: 1rem; }
  .ex-p4 .dwr { font-size: .95rem !important; } .ex-p4 .dwr small { font-size: .85rem !important; }
  .ex-pool3 .nm { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: .35rem !important; padding: .5rem .6rem !important; }
  .ex-pool3 .pc { display: grid !important; grid-template-columns: 1rem minmax(0, 1fr) auto; gap: .4rem !important; width: 100%; text-align: start; padding: .32rem .5rem !important; font-size: .92rem !important; font-weight: 600; border-radius: 8px !important; }
  .ex-pool3 .pc > :nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ex-pool3 .pc .k { min-width: 1.6rem; text-align: center; font-size: .8rem !important; }
  .ex-pool3 .dh b { font-size: 1rem !important; } .ex-pool3 .dh .n { font-size: .85rem !important; }
  .ex-pmore { justify-content: space-between; } .ex-pmore > small { font-size: .85rem; }
  .ex-pmore .ex-fold > summary::after { margin-inline-start: .35rem !important; } .ex-pmore > details { flex: 0 1 auto !important; } .ex-pmore > details[open] { flex: 1 1 100% !important; }
  .ex-rt2 { font-size: .98rem !important; color: #0f1f26; border: 1px solid #e3dccd; border-radius: 12px; overflow: hidden; }
  .ex-rt2 th { font-size: .9rem !important; color: #0f1f26 !important; background: #f3ede1 !important; padding: .6rem .75rem !important; }
  .ex-rt2 td { padding: .65rem .75rem !important; border-bottom: 1px solid #ebe4d6 !important; color: #0f1f26; } .ex-rt2 tbody tr:nth-child(even) td { background: #fcfbf8; }
  .ex-rt2 .ty { white-space: normal !important; min-width: 9.5rem; } .ex-rt2 .ty .ex-sevb { font-size: .8rem; margin-bottom: .25rem; } .ex-rt2 .ty b { display: block; font-size: 1rem; } .ex-rt2 .ty .n { display: block; font-size: .88rem; font-weight: 700; color: #0f1f26; }
  .ex-rt2 .wh { font-weight: 700; font-size: .95rem; color: #0f1f26 !important; line-height: 1.5; }
  .ex-rt2 .cs { min-width: 24rem !important; width: 30%; } .ex-rt2 .why { width: 32%; } .ex-cc { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .45rem; align-items: baseline; border-inline-start: 4px solid var(--c); padding: .15rem .5rem; margin: .15rem 0; background: #fff; border-radius: 4px; }
  .ex-cc b { font-size: .95rem; } .ex-cc span { font-size: .95rem; } .ex-cc em { font-style: normal; font-size: .85rem; font-weight: 700; white-space: nowrap; }
  .ex-rt2 .why { color: #0f1f26 !important; font-size: .95rem; min-width: 15rem !important; } .ex-rt2 .why details { font-size: .88rem !important; }
  .ex-rt2 .act { min-width: 12rem !important; } .ex-rt2 .act .fx { color: #15803d; font-weight: 800; font-size: .9rem; margin-bottom: .3rem; } .ex-rt2 .act .nofx { font-size: .9rem; margin-bottom: .3rem; }
  .ex-rt2 .act .btn { margin: .1rem 0 .1rem .3rem; font-size: .85rem; }
  .ex-qtips { font-size: .92rem !important; color: #0f1f26 !important; } .ex-qk span { font-size: .85rem !important; color: #0f1f26 !important; } .ex-qk b { font-size: 1.3rem !important; }
  .ex-rtabs button { font-size: .9rem !important; color: #0f1f26 !important; } .ex-rtabs em { font-size: .8rem !important; }
  .ex-rt2 .why .who { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; margin-top: .4rem; } .ex-rt2 .why .who .lb { font-weight: 800; font-size: .88rem; }
  .ex-rt2 .why .wc { background: #eef4f8; border: 1px solid #cfdde7; color: #0b3a50; border-radius: 6px; padding: .05rem .45rem; font-size: .88rem; font-weight: 700; }
  .ex-o2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .6rem; margin: .5rem 0; } @media (max-width: 1100px) { .ex-o2 { grid-template-columns: 1fr; } }
  .ex-o2 > * { margin: 0 !important; } .ex-o2 .ex-pub { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; } .ex-o2 .ex-pub .t { flex: 1 1 100%; font-weight: 800; }
  .ex-o2 .ex-docs { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; } .ex-o2 .ex-docs > b { flex: 1 1 100%; } .ex-o2 .ex-docs .btn { font-size: .9rem; } .ex-o2 .ex-docs small { flex: 1 1 100%; color: #0f1f26 !important; }
  .ex-rp { display: grid; gap: .3rem; min-width: 30rem; } .ex-rp .l { display: grid; grid-template-columns: 6rem 5.2rem auto minmax(0, 1fr); gap: .5rem; align-items: center; padding: .25rem .45rem; background: #f7fafb; border: 1px solid #e3ebef; border-radius: 8px; }
  .ex-rp .rm { display: inline-flex; gap: .35rem; align-items: center; } .ex-rp .rm i { color: #15803d; } .ex-rp .rm b { font-size: 1rem; }
  .ex-rp .n { font-weight: 800; font-size: .92rem; color: #0b3a50; } .ex-rp .sc { font-size: .85rem; font-weight: 700; color: #0f1f26; white-space: nowrap; } .ex-rp .pp { display: flex; flex-wrap: wrap; gap: .25rem; }
  .ex-rp .pp .ex-pp { font-size: .86rem; } .ex-rp .l.bad { display: block; background: #fde8e8; color: #b42318; font-weight: 800; border-color: #f5c2c0; } .ex-rpx { font-weight: 700; color: #0b4a66; }
  .ex-tbl table td { color: #0f1f26; font-size: .95rem; } .ex-tbl table td.c-name b { font-size: 1rem; }
  .ex-cal2 { display: grid; grid-template-columns: minmax(250px, 330px) minmax(0, 1fr); gap: 1rem; align-items: start; }
  .ex-calf { display: grid; gap: .6rem; } .ex-calf section { border: 1px solid #e2e8ec; border-radius: 12px; padding: .55rem .7rem; background: #fbfcfd; }
  .ex-calf h6 { font-size: .9rem; font-weight: 800; margin: 0 0 .4rem; color: #0b4a66; } .ex-calf label { display: block; margin: 0; } .ex-calf label > span { font-size: .8rem; font-weight: 700; color: #1f2a30; }
  .ex-calf .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem; } .ex-calf .src { display: block; margin-top: .35rem; color: #15803d; font-size: .78rem; }
  .ex-calf .ex-wk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; }
  .ex-calf .ex-wk .ex-chk { display: flex; align-items: center; justify-content: center; gap: .25rem; margin: 0; height: 2rem; padding: 0 .2rem; font-size: .82rem; font-weight: 700; border-radius: 8px; white-space: nowrap; }
  .ex-calf .ex-wk .ex-chk input { display: none; } .ex-calf .ex-wk .ex-chk.on::before { content: '✕'; font-size: .7rem; }
  .ex-calf .ex-wk .ex-chk.lock { opacity: .6; cursor: default; }
  .ex-calf .ex-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .35rem; align-items: stretch; } .ex-calf .ex-add .btn { white-space: nowrap; }
  .ex-calf .g2 label { display: flex; flex-direction: column; gap: .15rem; } .ex-calf [data-noend], .ex-calf [data-calset] { font-size: .78rem; font-weight: 600; text-decoration: none; }
  .ex-calf .hint { display: block; margin-top: .3rem; font-size: .78rem; }
  .ex-kp2 { display: flex; flex-wrap: wrap; gap: .35rem .9rem; align-items: center; font-size: .88rem; color: #1f2a30; margin-bottom: .5rem; } .ex-kp2 .ex b { color: #901d23; font-size: 1.1rem; }
  .ex-kp2 .lg { margin-inline-start: auto; font-size: .78rem; display: inline-flex; gap: .3rem; align-items: center; } .ex-kp2 .d { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }
  .ex-kp2 .d.ex { background: #901d23; } .ex-kp2 .d.off { background: #e2e8ec; } .ex-kp2 .d.hol { background: repeating-linear-gradient(45deg, #f6b0b0 0 3px, #fff 3px 6px); border: 1px solid #f0a0a0; }
  .ex-calm .ex-months { margin: 0; } .ex-calm .ex-month small { font-size: .68rem; }
  @media (max-width: 900px) { .ex-cal2 { grid-template-columns: 1fr; } }
  .ex-files { border: 1px solid #e2e8ec; border-radius: 14px; padding: .7rem; margin: .7rem 0; background: #fbfcfd; display: grid; gap: .45rem; }
  .ex-files > .h { font-weight: 800; display: flex; flex-wrap: wrap; gap: .4rem; align-items: baseline; } .ex-files > .h small { font-weight: 400; color: #1f2a30; }
  .ex-up { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .6rem; align-items: center; background: #fff; border: 1px solid #e2e8ec; border-inline-start: 4px solid #c8d2d7; border-radius: 10px; padding: .5rem .7rem; margin: .35rem 0; }
  .ex-up.ok { border-inline-start-color: #15803d; } .ex-up .ic { font-size: 1.35rem; color: #0b4a66; } .ex-up .tx b { display: block; } .ex-up .tx small { display: block; color: #1f2a30; font-size: .82rem; }
  .ex-up .st { display: inline-flex; gap: .3rem; align-items: center; font-size: .82rem; font-weight: 700; color: #15803d; margin-top: .15rem; } .ex-up .st.no { color: #1f2a30; font-weight: 400; }
  .ex-up .ac { display: flex; flex-wrap: wrap; gap: .3rem; justify-content: flex-end; }
  .ex-prof { display: flex; gap: .6rem; align-items: center; background: #eef6f2; border: 1px solid #cfe3dc; border-radius: 12px; padding: .55rem .75rem; margin: .5rem 0; }
  .ex-prof > i { font-size: 1.4rem; color: #15803d; } .ex-prof > div { flex: 1; min-width: 0; } .ex-prof b { display: block; } .ex-prof small { color: #1f2a30; font-size: .82rem; }
  .ex-split { border: 1px dashed #cfd8dc; border-radius: 10px; padding: .5rem .7rem; margin-bottom: .6rem; background: #fcfcfa; }
  @media (max-width: 640px) { .ex-up { grid-template-columns: auto minmax(0, 1fr); } .ex-up .ac { grid-column: 1 / -1; justify-content: flex-start; } .ex-prof { flex-wrap: wrap; } }
  @media print { .ex-steps, .ex-status, .ex-toolbar, .ex-filter, .ex-hint, .ex-nav { display: none; } }`;
  document.head.insertAdjacentHTML('beforeend', `<style id="ex-css">${CSS}</style>`);

  gate.then(() => Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/study_plans.json'), U.getJSON('data/calendar.json').catch(() => null), U.getJSON('data/org.json').catch(() => null)])).then(([tt, plans, cal, org]) => {
    TT = tt; PLANS = plans; CALJ = cal; ORGJ = org; setTimeout(liveCheck, 500);
    if (!HAS && !S.setupDone) S = fresh(S.type);   // a first plan: the faculty's settings and the calendar's days
    U.updatedLine(tt.updated, tt.term);
    const q = $('#pg-q');
    if (q) q.addEventListener('input', () => { F().q = q.value; if (tab !== 'grid' && tab !== 'out') tab = 'grid'; clearTimeout(window.__exq); window.__exq = setTimeout(render, 250); });
    const planName = new URLSearchParams(location.search).get('plan');
    const go = () => { build(); wire(); render(); READY = true; };
    if (planName && /^[\w-]+$/.test(planName)) U.getJSON(`data/exams/plans/${planName}.json`).then(o => {
      if (!o || !o.type || !o.periods) throw new Error('bad plan');
      const same = S && S.planId === o.planId;
      if (HAS && !same && !confirm(`ستفتح «${o.label || 'خطة امتحانات'}» مكان الخطة المحفوظة على هذا الجهاز. لا يُستبدل المحفوظ إلا إذا ضغطت «حفظ». متابعة؟`)) { go(); return; }
      if (!(same && HAS)) { S = o; migrate(); tab = 'grid'; SWAPPED = true; }
      go(); if (!(same && HAS)) { DIRTY = true; savebar(); }
    }).catch(() => { go(); alert('تعذّر فتح الخطة من الرابط.'); }); else go();
  }).catch(e => { console.error(e); $(APP).innerHTML = '<div class="alert alert-warning">تعذّر تحميل البيانات. أعد المحاولة بعد قليل.</div>'; });
})();
