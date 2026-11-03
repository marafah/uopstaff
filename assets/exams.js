/* «جدول الامتحانات»: plans the exams of a faculty (finals, midterms, make-ups) from the published timetable.
   Each course is one exam (all its sections at the same time). Who sits together comes from the study plans (each
   major × year is a cohort whose courses must not clash) and, when the committee uploads it, from the registration
   list (anonymous student number + course code: exact). A solver places every course, then a local search removes
   clashes, more than N exams a day for a cohort / student, back-to-back exams, instructor clashes and seat shortages.
   The committee moves exams by drag and drop (or tap, then tap a cell; cells show how good each move is), pins
   them, and keeps drafts. Rooms are filled per period and proctors shared out fairly. Everything stays in this
   browser (drafts can be exported as a file for the committee); nothing is sent anywhere.
   Behind the same sign-in as the research pages. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc } = U;
  const APP = '#ex-app';

  // ---------- sign-in (same account as the research pages) ----------
  const GATE = 'e1ebfc7594699cb5f05115abec21192e43ccc20273593b6662d1d4e9e91d854b';
  const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const authed = () => { try { return localStorage.getItem('rs-auth') === GATE || sessionStorage.getItem('rs-auth') === GATE; } catch (e) { return false; } };
  const gate = new Promise(res => {
    if (authed()) { res(); return; }
    document.documentElement.classList.add('ex-locked');
    const d = document.createElement('div'); d.className = 'ex-gate'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<form class="box" autocomplete="on"><div class="ic"><i class="bi bi-shield-lock-fill"></i></div><h2>جدول الامتحانات — دخول</h2><p>هذه الأداة للجنة الامتحانات. أدخل اسم المستخدم وكلمة المرور (حساب قسم البحث العلمي نفسه).</p>
      <label>اسم المستخدم<input name="u" class="form-control" autocomplete="username" required></label>
      <label>كلمة المرور<input name="p" type="password" class="form-control" autocomplete="current-password" required></label>
      <label class="rem"><input type="checkbox" name="r" checked> تذكّرني على هذا الجهاز</label>
      <div class="err" hidden><i class="bi bi-exclamation-triangle-fill"></i> اسم المستخدم أو كلمة المرور غير صحيحة</div>
      <button class="btn btn-ex w-100" type="submit"><i class="bi bi-box-arrow-in-left"></i> دخول</button>
      <a class="back" href="./"><i class="bi bi-arrow-right"></i> العودة إلى الصفحة الرئيسية</a></form>`;
    const show = () => {
      document.body.appendChild(d);
      const f = d.querySelector('form'); f.u.focus();
      f.onsubmit = async e => {
        e.preventDefault();
        if (await sha('uopstaff-research|' + f.u.value.trim() + '|' + f.p.value) !== GATE) { d.querySelector('.err').hidden = false; f.p.value = ''; f.p.focus(); return; }
        try { (f.r.checked ? localStorage : sessionStorage).setItem('rs-auth', GATE); } catch (e2) { /* session only */ }
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
  function fresh(type) {
    const t = TYPES[type || 'final'];   // the default exam is the final
    return { type: type || 'final', start: today(), days: t.days, off: [5, 6], hol: '', end: '', procMode: 'room', procFix: {}, firstStart: '08:00', lastEnd: '16:00', dayWin: {}, periods: t.periods.map(p => p.slice()), maxDay: 2, perProc: 30, minProc: 1, maxDuty: 0, maxDutyDay: 2, busy: type === 'mid1' || type === 'mid2' || type === 'midterm', b2b: true, near: true, insClash: true, early: true, depth: 'normal', noProc: '', label: '', gview: 'matrix', setupDone: false,
      faculty: 'تكنولوجيا المعلومات', facs: ['تكنولوجيا المعلومات'], flt: {}, practical: false, grad: true, src: 'plans', rooms: null, excl: {}, pins: {}, slot: {}, reg: null, regInfo: '', extraProc: '', drafts: [], approved: null };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.type) S = fresh();
  const OLDMID = '09:00-10:30,11:00-12:30,13:00-14:30,15:00-16:30';
  const migrate = () => { if (!Array.isArray(S.facs)) S.facs = S.faculty ? [S.faculty] : []; if (!S.flt) S.flt = {}; if (!Array.isArray(S.off)) S.off = [5, 6];
    if (!S.off.includes(5)) S.off.push(5);   // Friday is the official weekly holiday
    if (!S.procMode) S.procMode = 'room'; if (!S.procFix) S.procFix = {};
    if (S.firstStart == null) S.firstStart = '08:00'; if (!S.dayWin) S.dayWin = {}; if (S.end == null) S.end = '';
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
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full / blocked */ } };
  let repCache = [], repFilter = '';
  let REGMEM = null;   // the registration report's names: read when uploaded, never saved
  let TT, PLANS, tab = new URLSearchParams(location.search).get('tab') || (S.setupDone ? 'grid' : 'set'), sel = null, outView = 'all', undo = [];

  // ---------- model ----------
  let C = [], BY = {}, G = [], INS = {}, NS = 0, P = 0, DAYS = [];
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
  function build() {
    const MK = S.type === 'makeup' && S.mk && S.mk.n ? S.mk : null;   // make-up: only the courses (and students) of the uploaded list
    const secs = merged(TT.sections.filter(s => (MK ? !!MK.n[s.code] : inFac(s.faculty)) && (MK || S.practical || s.activity === 'نظري') && (MK || S.grad || s.degree !== 'الماجستير')));
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
    C = Object.values(m).filter(c => !S.excl[c.code]).sort((a, b) => a.code.localeCompare(b.code));
    C.forEach((c, i) => { c.i = i; c.lv = level(c); c.ins = [...c.ins]; });
    BY = Object.fromEntries(C.map(c => [c.code, c]));
    DAYS = examDays(); P = S.periods.length; NS = DAYS.length * P;
    // a slot is day × period: when periods are added or removed, each exam keeps its day and period number (or is unscheduled)
    if (S.slotP && S.slotP !== P) { const re = v => { if (!Number.isInteger(v) || v < 0) return v; const d = Math.floor(v / S.slotP), k = v % S.slotP; return k < P ? d * P + k : -1; };
      Object.keys(S.slot).forEach(c => { S.slot[c] = re(S.slot[c]); if (S.slot[c] < 0) delete S.slot[c]; }); Object.keys(S.pins).forEach(c => { S.pins[c] = re(S.pins[c]); if (S.pins[c] < 0) delete S.pins[c]; }); }
    S.slotP = P;
    const multi = new Set(C.map(c => c.fac)).size > 1, keys = [...new Set(C.map(c => multi ? c.fac : c.dept))].sort();
    C.forEach(c => { c.col = U.PALETTE[keys.indexOf(multi ? c.fac : c.dept) % U.PALETTE.length]; });
    COLBY = multi ? 'fac' : 'dept';
    // instructors → their courses
    INS = {}; C.forEach(c => c.ins.forEach(n => (INS[n] = INS[n] || []).push(c.i)));
    // who sits together
    G = [];
    const add = (name, codes, w, hard, kind) => { const ix = [...new Set(codes)].filter(k => BY[k]).map(k => BY[k].i); if (ix.length > 1) G.push({ name, c: ix, w, hard, kind }); };
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
    // slots: keep the saved ones that still exist
    C.forEach(c => { const s = S.slot[c.code]; c.s = Number.isInteger(s) && s >= 0 && s < NS ? s : -1; const p = S.pins[c.code]; c.pin = Number.isInteger(p) && p < NS ? p : null; if (c.pin != null) c.s = c.pin; });
    capTotal = rooms().filter(r => r.on).reduce((a, r) => a + r.c, 0);
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
    AV = []; CAP = []; BUSYI = busyI; BLK = [];
    for (let s = 0; s < NS; s++) BLK[s] = outWin(DAYS[dayOf(s)].n, S.periods[s % P]);
    for (let s = 0; s < NS; s++) { AV[s] = rooms().filter(r => r.on && !(busyR[s] && busyR[s].has(r.n))); CAP[s] = AV[s].reduce((a, r) => a + r.c, 0); CAPL[s] = AV[s].filter(r => r.t === LAB).reduce((a, r) => a + r.c, 0); }
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
  function rooms() {
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
  const REQ = c => (S.req || {})[c.code] || {};
  const needLab = c => REQ(c).type === LAB;
  let capTotal = 0, AV = [], CAP = [], CAPL = [], BUSYI = {}, BLK = [], COLBY = 'dept';
  const capOf = s => CAP[s] == null ? capTotal : CAP[s];

  // ---------- cost ----------
  const W = { blocked: 20000, clash: 1000, softClash: 60, overDay: 45, sameDay: 4, backToBack: 12, ins: 150, seat: 80, spread: 0.08, early: 0.0005 };
  const dayOf = s => Math.floor(s / P);
  function groupCost(g, sl) {
    const per = {}, day = {};
    g.c.forEach(i => { const s = sl[i]; if (s < 0) return; per[s] = (per[s] || 0) + 1; const d = dayOf(s); (day[d] = day[d] || []).push(s); });
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
  const seatF = (s, n) => { if (s < 0) return 0; const cap = capOf(s); return Math.max(0, n - cap) * W.seat + (cap ? n * n / cap * W.spread : n * W.spread); };
  let WORK = null, SEAT = [], SEATL = [];
  const labF = (s, n) => s < 0 || !n ? 0 : Math.max(0, n - (CAPL[s] || 0)) * W.seat;
  const labAt = (s, sl) => { if (s < 0) return 0; if (sl === WORK) return SEATL[s]; let n = 0; for (const c of C) if (sl[c.i] === s && needLab(c)) n += c.students; return n; };
  const seatsAt = (s, sl) => { if (s < 0) return 0; if (sl === WORK) return SEAT[s]; let n = 0; for (const c of C) if (sl[c.i] === s) n += c.students; return n; };
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
    return cost + (sl[i] >= 0 && BLK[sl[i]] ? W.blocked : 0) + insCost(i, sl) * 2 + (sl[i] >= 0 && S.early !== false ? C[i].students * dayOf(sl[i]) * W.early : 0);
  }
  function delta(i, to, sl) {
    const from = sl[i]; if (from === to) return 0;
    const n = C[i].students, a = seatsAt(from, sl), b = seatsAt(to, sl);
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
    C.forEach(c => { cost += (sl[c.i] >= 0 && BLK[sl[c.i]] ? W.blocked : 0) + insCost(c.i, sl) + (sl[c.i] >= 0 && S.early !== false ? c.students * dayOf(sl[c.i]) * W.early : 0); });
    return cost;
  }

  // ---------- solver ----------
  function solve(keep) {
    const sl = C.map(c => c.pin != null ? c.pin : keep && c.s >= 0 ? c.s : -1);
    WORK = sl; SEAT = new Array(NS).fill(0); SEATL = new Array(NS).fill(0); C.forEach(c => { if (sl[c.i] >= 0) { SEAT[sl[c.i]] += c.students; if (needLab(c)) SEATL[sl[c.i]] += c.students; } });
    const set = (i, s) => { const L = needLab(C[i]); if (sl[i] >= 0) { SEAT[sl[i]] -= C[i].students; if (L) SEATL[sl[i]] -= C[i].students; } sl[i] = s; if (s >= 0) { SEAT[s] += C[i].students; if (L) SEATL[s] += C[i].students; } };
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
  function seating() {
    const out = {}, load = {}, unseated = [], short = [], dayLoad = {}, roomReq = [];
    const exempt = new Set((S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean));
    const isEx = n => exempt.has(n) || exempt.has(U.shortName(n));
    const pool = [...new Set(Object.keys(INS).concat(S.extraProc.split(/\n/).map(x => x.trim()).filter(Boolean)))].filter(n => !isEx(n));
    pool.forEach(n => { load[n] = 0; });
    for (let s = 0; s < NS; s++) {
      const list = C.filter(c => c.s === s).sort((a, b) => b.students - a.students);
      const freeR = (AV[s] || rooms().filter(r => r.on)).slice().sort((a, b) => b.c - a.c), busy = new Set(BUSYI[s] || []), dd = dayOf(s);
      const can = n => !busy.has(n) && (!S.maxDuty || (load[n] || 0) < S.maxDuty) && (!S.maxDutyDay || ((dayLoad[n] || {})[dd] || 0) < S.maxDutyDay);
      const take = n => { load[n] = (load[n] || 0) + 1; (dayLoad[n] = dayLoad[n] || {})[dd] = ((dayLoad[n] || {})[dd] || 0) + 1; };
      out[s] = list.map(c => {
        // each section goes whole into the smallest free room it fits (or the room its course already uses, if there is
        // space), so a section stays together with its own instructor; only a section larger than every room is split
        const got = [], parts = c.sl.length ? c.sl.slice().sort((a, b) => b.n - a.n) : [{ s: '', n: c.students, ins: '' }], q = REQ(c);
        let left = 0;
        const fits = r => !q.type || r.t === q.type;
        const put = (r, x, k) => { r.n += k; r.free -= k; r.parts.push({ s: x.s, k }); r.secs.push(x.s ? x.s + (k < x.n ? ` (${k} من ${x.n})` : '') : ''); if (x.ins && !r.ins.includes(x.ins)) r.ins.push(x.ins); };
        const open = (cap, lim) => { const k = freeR.reduce((b, r, j) => fits(r) && (cap == null ? b < 0 : r.c >= cap && (b < 0 || r.c < freeR[b].c)) ? j : b, -1); if (k < 0) return null;
          const r = freeR.splice(k, 1)[0], o = { room: r.n, t: r.t, n: 0, cap: r.c, free: Math.min(r.c, lim || r.c), proc: [], secs: [], parts: [], ins: [] }; got.push(o); return o; };
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
      g.c.forEach(i => { const s = sl[i]; if (s < 0) return; (per[s] = per[s] || []).push(i); (day[dayOf(s)] = day[dayOf(s)] || new Set()).add(s); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: g.hard ? 'clash' : 'soft', g, cs: v, txt: `${g.hard ? 'تعارض' : 'تعارض محتمل'}: ${v.map(i => C[i].code).join(' و ')} في الفترة نفسها` }));
      Object.entries(day).filter(([, v]) => v.size > S.maxDay).forEach(([d, v]) => list.push({ k: 'day', g, cs: g.c.filter(i => v.has(sl[i])), txt: `${v.size} امتحانات يوم ${DAYS[d].label}` }));
      if (S.b2b !== false) Object.entries(day).forEach(([d, v]) => { const ks = [...v].sort((a, b) => a - b); for (let k = 1; k < ks.length; k++) if (ks[k] - ks[k - 1] === 1 && g.kind !== 'near') list.push({ k: 'b2b', g, cs: g.c.filter(i => sl[i] === ks[k] || sl[i] === ks[k - 1]), txt: `امتحانان متتاليان يوم ${DAYS[d].label}` }); });
    });
    if (S.insClash !== false) Object.entries(INS).forEach(([n, ix]) => {
      const per = {}; ix.forEach(i => { if (sl[i] >= 0) (per[sl[i]] = per[sl[i]] || []).push(i); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: 'ins', cs: v, txt: `${U.shortName(n)}: امتحانان لمقرريه في الفترة نفسها (${v.map(i => C[i].code).join('، ')})` }));
    });
    C.forEach(c => { if (c.s >= 0 && BLK[c.s]) list.push({ k: 'blk', cs: [c.i], txt: `${c.code} في ${slotLabel(c.s)}: خارج وقت الامتحانات لهذا اليوم` }); });
    return list;
  }
  // every problem as one detailed, de-duplicated row: severity, type, when, which exams, who is affected, why, and a fix
  const KIND = {
    clash: ['حرج', 'تعارض طالب', 'bi-x-octagon-fill'], unseated: ['حرج', 'نقص مقاعد', 'bi-door-closed-fill'], ins: ['مرتفع', 'تعارض مدرّس', 'bi-person-x-fill'],
    short: ['مرتفع', 'نقص مراقبين', 'bi-person-dash-fill'], day: ['متوسط', 'ضغط يومي', 'bi-calendar-x-fill'], b2b: ['منخفض', 'امتحانان متتاليان', 'bi-arrow-left-right'],
    soft: ['منخفض', 'تعارض محتمل', 'bi-question-circle-fill'], blk: ['حرج', 'خارج وقت الامتحانات', 'bi-slash-circle-fill'], room: ['مرتفع', 'نوع القاعة', 'bi-pc-display'] };
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
      const exact = x.g && x.g.kind === 'students', n = x.k === 'ins' ? 0 : x.k === 'blk' ? C[x.cs[0]].students : exact ? x.g.w : est(x.cs);
      const who = x.k === 'ins' ? U.shortName(x.txt.split(':')[0]) : x.g ? (exact ? 'طلبة من كشف التسجيل' : x.g.name) : '';
      const why = {
        clash: 'امتحانان أو أكثر في الفترة نفسها لطلبة يدرسون المقررات معاً — لا يمكن للطالب حضورهما.',
        soft: 'المقرران من سنتين متتاليتين في التخصص نفسه؛ قد يجمعهما بعض الطلبة المتأخرين أو المتقدمين.',
        day: `أكثر من ${S.maxDay} امتحان في اليوم نفسه للفئة نفسها من الطلبة.`,
        b2b: 'امتحانان في فترتين متتاليتين من اليوم نفسه بلا استراحة.',
        ins: 'المدرّس نفسه يدرّس المقررين وامتحاناهما في الوقت نفسه؛ لا يستطيع الحضور في القاعتين.',
        blk: 'الفترة خارج وقت الامتحانات المحدد لهذا اليوم في «الإعداد ← الفترات اليومية».' }[x.k];
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
      stuClash: stu('clash'), stuDay: stu('day'), reg: reg.length, placed: C.filter(c => c.s >= 0).length };
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
    ['check', 'bi-clipboard2-check', 'فحص الجودة', 'التعارضات وحلولها'], ['drafts', 'bi-patch-check', 'الحفظ والاعتماد', 'نسخ واعتماد ومشاركة'], ['out', 'bi-printer', 'الطباعة والتصدير', 'PDF وExcel لكل جهة']];
  function stepState(k, st) {
    if (k === 'set') return S.setupDone ? ['done', `${C.length} مقرراً · ${nDays(DAYS.length)}`] : ['todo', 'ابدأ من هنا'];
    if (k === 'grid') return st.placed ? ['done', `${st.placed} امتحاناً مجدولاً`] : ['todo', 'لم يُولَّد بعد'];
    if (k === 'check') return !st.placed ? ['todo', '—'] : st.clash || st.unseated ? ['bad', `${st.clash} تعارض · ${st.unseated} بلا مقعد`] : ['done', 'بلا تعارض'];
    if (k === 'drafts') return S.approved ? ['done', 'معتمدة: ' + S.approved] : ['todo', `${S.drafts.length} نسخة محفوظة`];
    return ['todo', 'جاهز عند الاعتماد'];
  }
  function head(st) {
    const i = STEPS.findIndex(x => x[0] === tab);
    return `<nav class="ex-steps" aria-label="خطوات إعداد الجدول">${STEPS.map(([k, ic, t, sub], n) => { const [s, txt] = stepState(k, st);
      return `<button class="ex-step ${s}${tab === k ? ' on' : ''}" data-tab="${k}"><span class="num">${s === 'done' ? '<i class="bi bi-check-lg"></i>' : s === 'bad' ? '<i class="bi bi-exclamation-lg"></i>' : n + 1}</span>
        <span class="tx"><b><i class="bi ${ic}"></i> ${t}</b><small>${esc(txt)}</small></span></button>`; }).join('<i class="bi bi-chevron-left sep"></i>')}</nav>
      <div class="ex-status"><span class="ex-pill"><i class="bi bi-journal-text"></i> ${esc(S.label || TYPES[S.type].name)}</span><span class="ex-pill"><i class="bi bi-building"></i> ${esc(facLabel())}</span>
        <span class="ex-pill"><i class="bi bi-book"></i> ${C.length} مقرراً</span><span class="ex-pill"><i class="bi bi-people"></i> ${C.reduce((a, c) => a + c.students, 0)} مقعد</span>
        <span class="ex-pill"><i class="bi bi-calendar3"></i> ${nDays(DAYS.length)} × ${nPer(P)}</span><span class="ex-pill"><i class="bi bi-door-open"></i> ${rooms().filter(r => r.on).length} قاعة · ${capTotal} مقعد/فترة</span>
        <span class="ex-pill ${st.clash || st.unseated ? 'bad' : st.placed ? 'ok' : ''}"><i class="bi ${st.clash || st.unseated ? 'bi-exclamation-octagon-fill' : 'bi-check-circle-fill'}"></i> ${!st.placed ? 'غير مولّد' : st.clash || st.unseated ? `${st.clash} تعارض · ${st.unseated} بلا مقعد` : 'بلا تعارض'}</span>
        ${S.approved ? `<span class="ex-pill ok"><i class="bi bi-patch-check-fill"></i> معتمدة</span>` : ''}</div>
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
    const n = C.filter(match).length;
    return `<div class="ex-filter"><i class="bi bi-funnel-fill"></i>
      <input class="form-control" data-f="q" placeholder="ابحث: رمز، مقرر، مدرّس…" value="${esc(f.q || '')}">
      <select class="form-select" data-f="lv"><option value="">كل السنوات</option>${lvs.map(l => `<option value="${l}" ${String(f.lv) === String(l) && f.lv !== '' && f.lv != null ? 'selected' : ''}>${LV(l)}</option>`).join('')}</select>
      <label class="ex-switch"><input type="checkbox" data-f="prob" ${f.prob ? 'checked' : ''}><span></span> ذات الملاحظات فقط</label>
      ${extra || ''}<span class="ex-count"><b>${n}</b> / ${C.length}</span>${n < C.length ? '<button class="btn btn-sm btn-link" data-fclear>مسح التصفية</button>' : ''}</div>
      <div class="ex-scope">${facs.length > 1 ? chips('fac', 'bi-buildings', 'الكلية', 'الكل', facs, f.fac) : ''}
      ${facs.length > 1 && !f.fac ? '<div class="ex-scope-row"><span class="ex-scope-lb"><i class="bi bi-diagram-3"></i> القسم</span><span class="ex-scope-hint">اختر كلية لعرض أقسامها</span></div>' : chips('dept', 'bi-diagram-3', 'القسم', 'كل الأقسام', depts, f.dept)}</div>`;
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
    const ex = new Set((S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean)), by = {};
    Object.keys(INS).forEach(n => { const ix = INS[n], m = {}; ix.forEach(i => { m[C[i].dept] = (m[C[i].dept] || 0) + 1; }); const d = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
      (by[d] = by[d] || []).push({ n, k: ix.length, off: ex.has(n) || ex.has(U.shortName(n)) }); });
    (S.extraProc || '').split(/\n/).map(x => x.trim()).filter(Boolean).forEach(n => (by['مراقبون إضافيون'] = by['مراقبون إضافيون'] || []).push({ n, k: 0, off: ex.has(n), extra: true }));
    return by;
  }
  function poolView() {
    const by = pool(), all = Object.values(by).flat(), on = all.filter(p => !p.off).length, q = U.norm(F().pq || '');
    const deps = Object.entries(by).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ar'));
    return `<div class="ex-pool2"><div class="h"><div class="t"><i class="bi bi-people-fill"></i> المراقبون المتاحون</div>
        <span class="bdg green"><i class="bi bi-person-check-fill"></i> ${on} متاح</span>${all.length - on ? `<span class="bdg">${all.length - on} معفى</span>` : ''}<span class="bdg">${deps.length} أقسام</span>
        <input class="form-control form-control-sm" data-f="pq" placeholder="ابحث عن اسم…" value="${esc(F().pq || '')}"></div>
      <p class="hint"><i class="bi bi-hand-index"></i> الضغط على الاسم يعفيه من المراقبة أو يعيده. الرقم = عدد المقررات التي يدرّسها في هذه الدورة.</p>
      <div class="grid">${deps.map(([d, ps]) => { const list = ps.filter(p => !q || U.norm(p.n).includes(q)).sort((a, b) => U.shortName(a.n).localeCompare(U.shortName(b.n), 'ar'));
        if (!list.length) return '';
        const n = ps.filter(p => !p.off).length;
        return `<section class="dc"><header><b>${esc(d)}</b><span class="n" title="متاح من مجموع القسم">${n} من ${ps.length}</span>
            <button class="btn btn-sm btn-link" data-exd="${esc(d)}">${n ? 'إعفاء الكل' : 'إعادة الكل'}</button></header>
          <div class="ls">${list.map(p => `<button class="pr${p.off ? ' off' : ''}" data-exm="${esc(p.n)}" title="${esc(p.n)}${p.off ? ' — معفى' : ''}"><i class="bi ${p.off ? 'bi-slash-circle' : 'bi-check-circle-fill'}"></i><span class="nm">${esc(U.shortName(p.n))}</span><span class="k">${p.extra ? 'إضافي' : p.k}</span></button>`).join('')}</div></section>`; }).join('')}</div></div>`;
  }
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
    return `<div class="ex-pv-sum"><span class="bdg"><i class="bi bi-door-open"></i> ${rows.length} جلسة امتحان</span><span class="bdg"><i class="bi bi-person-check"></i> ${rows.reduce((a, o) => a + o.r.proc.length, 0)} مراقبة</span>
        <span class="bdg"><i class="bi bi-people"></i> ${names.filter(n => cnt(n)).length} من ${names.length} مراقباً مشاركاً</span><span class="bdg"><i class="bi bi-bar-chart"></i> المتوسط ${avg.toFixed(1)} · الأعلى ${mx}</span>
        <span class="bdg amber"><i class="bi bi-hand-index"></i> ${Object.keys(S.procFix || {}).length} قاعة عُدّلت يدوياً</span>${Object.keys(S.procFix || {}).length ? '<button class="btn btn-sm btn-link text-danger" data-pfall>إلغاء كل التعديلات اليدوية</button>' : ''}</div>
      <details class="ex-pv-load" open><summary><i class="bi bi-person-lines-fill"></i> عدد المراقبات لكل مراقب</summary><div>${top.map(n => `<span class="ex-ld ${tone(n)}" title="${esc(n)}">${esc(U.shortName(n))}<b>${cnt(n)}</b></span>`).join('')}</div></details>
      <div class="table-responsive ex-tbl"><table class="table align-middle ex-pv"><thead><tr><th>اليوم والوقت</th><th>المقرر</th><th>القاعة</th><th>المراقبون (عدد مراقبات كلٍّ منهم)</th><th>إضافة / تغيير</th></tr></thead><tbody>
      ${rows.map(({ s, x, r }, k) => { const key = x.c.code + '|' + r.room, b = busyAt(s), si = slotInfo(s), nd = k && rows[k - 1].s !== s;
        const opts = names.filter(n => !r.proc.includes(n)).sort((a, c) => (b.has(a) - b.has(c)) || cnt(a) - cnt(c) || U.shortName(a).localeCompare(U.shortName(c), 'ar'));
        return `<tr class="${nd ? 'nd' : ''}${r.fixed ? ' fx' : ''}"><td><b>${esc(si.d.wd)} ${+si.d.iso.slice(8)}/${+si.d.iso.slice(5, 7)}</b><small dir="ltr" class="d-block">${si.time}</small></td>
          <td><span class="ex-code" style="--c:${x.c.col[0]};--b:${x.c.col[1]}">${esc(x.c.code)}</span> ${esc(x.c.name)}<small class="d-block text-muted">${esc(x.c.dept)}</small></td>
          <td><b>${esc(r.room)}</b>${r.t === LAB ? ' <i class="bi bi-pc-display" title="مختبر"></i>' : ''}<small class="d-block">${r.n} طالب</small></td>
          <td><div class="ex-chips">${r.proc.map(n => `<span class="ex-pp ${x.c.ins.includes(n) ? 'own' : ''}" title="${esc(n)}"><i class="bi bi-person-fill"></i> ${esc(U.shortName(n))} <b class="c">${cnt(n)}</b><button data-pfrm="${esc(key)}|${esc(n)}" aria-label="إزالة"><i class="bi bi-x"></i></button></span>`).join('') || '<span class="text-danger small"><i class="bi bi-exclamation-triangle-fill"></i> بلا مراقب</span>'}</div>
            ${r.fixed ? `<button class="btn btn-sm btn-link p-0" data-pfauto="${esc(key)}"><i class="bi bi-arrow-counterclockwise"></i> تلقائي</button>` : ''}</td>
          <td><select class="form-select form-select-sm ex-pfsel" data-pfadd="${esc(key)}"><option value="">+ مراقب…</option>${opts.map(n => `<option value="${esc(n)}" ${b.has(n) ? 'disabled' : ''}>${esc(U.shortName(n))} — ${cnt(n)} مراقبة${b.has(n) ? ' (مشغول في هذا الوقت)' : ''}</option>`).join('')}</select>
            ${r.proc.length ? `<select class="form-select form-select-sm ex-pfsel mt-1" data-pfswap="${esc(key)}"><option value="">⇄ استبدال ${esc(U.shortName(r.proc[0]))} بـ…</option>${opts.filter(n => !b.has(n)).map(n => `<option value="${esc(n)}">${esc(U.shortName(n))} — ${cnt(n)}</option>`).join('')}</select>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <small class="text-muted">الأسماء الخضراء: مدرّس المقرر. الرقم بجانب كل اسم عدد مراقباته في الدورة كلها. القاعة التي تعدّل مراقبيها يدوياً تبقى كما اخترت حتى بعد «تحسين» الجدول، ما دام الامتحان في القاعة نفسها.</small>`;
  }
  const curProc = key => { const [code, room] = key.split('|'), { out } = seating(); for (const xs of Object.values(out)) for (const x of xs) if (x.c.code === code) { const r = x.rooms.find(o => o.room === room); if (r) return r.proc.slice(); } return []; };
  function moveHint() {
    const c = sel != null ? C[sel] : null;
    return c ? `<div class="ex-hint"><i class="bi bi-hand-index-thumb-fill"></i> <span>نقل <b>${esc(c.code)} ${esc(c.name)}</b> (الآن: ${esc(slotLabel(c.s))}) — اضغط الخانة المطلوبة:</span>
        <span class="h-good">أفضل</span><span class="h-ok">مقبول</span><span class="h-warn">يزيد الضغط</span><span class="h-bad">تعارض</span>
        <button class="btn btn-sm btn-outline-secondary" data-pin="${sel}"><i class="bi bi-pin-angle"></i> ${c.pin != null ? 'إلغاء التثبيت' : 'تثبيت هنا'}</button><button class="btn btn-sm btn-link" data-unsel>إلغاء</button></div>`
      : '<div class="ex-hint soft"><i class="bi bi-info-circle-fill"></i> للتعديل: اسحب الامتحان إلى خانة أخرى، أو اضغطه ثم اضغط الخانة الجديدة؛ تتلوّن الخانات حسب أثر النقل. في «القائمة» يمكن النقل من قائمة منسدلة.</div>';
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
              <span class="rm">${x.rooms.map(r => `<i class="bi bi-door-open"></i> ${esc(r.room)} <small>(${r.n})</small>`).join(' ')}${x.left ? ` <span class="text-danger">+${x.left} بلا مقعد</span>` : ''}</span></div>`).join('') || '<span class="none">—</span>'}</div></div>`; }).join('')}
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
        <td class="small">${x ? x.rooms.map(r => `${esc(r.room)} (${r.n})`).join('، ') : '—'}</td><td class="small">${esc(c.ins.map(U.shortName).join('، '))}</td>
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
    const k = (n, t, ic, good) => `<div class="ex-kpi ${n ? (good ? 'warn' : 'bad') : 'ok'}"><i class="bi ${ic}"></i><b>${n}</b><span>${t}</span></div>`;
    const loads = Object.values(st.seat.load).filter(Boolean), mx = Math.max(0, ...loads), mn = loads.length ? Math.min(...loads) : 0;
        return `<div class="ex-kpis">${k(st.clash, 'تعارض إلزامي', 'bi-x-octagon')}${k(st.unseated, 'طالب بلا مقعد', 'bi-door-closed')}${k(st.ins, 'تعارض مدرّس', 'bi-person-x', 1)}
      ${k(st.day, `يوم بأكثر من ${S.maxDay} امتحان`, 'bi-calendar-x', 1)}${k(st.b2b, 'امتحانان متتاليان', 'bi-arrow-left-right', 1)}${k(st.soft, 'تعارض محتمل', 'bi-question-circle', 1)}
      ${k(st.short, 'نقص مراقبين', 'bi-person-dash', 1)}<div class="ex-kpi info"><i class="bi bi-person-badge"></i><b>${mn}–${mx}</b><span>مراقبات لكل مدرّس</span></div>
      ${st.reg ? `<div class="ex-kpi ${st.stuClash ? 'bad' : 'ok'}"><i class="bi bi-people"></i><b>${st.stuClash}</b><span>طالب لديه تعارض (من الكشف)</span></div><div class="ex-kpi ${st.stuDay ? 'warn' : 'ok'}"><i class="bi bi-people"></i><b>${st.stuDay}</b><span>طالب بأكثر من ${S.maxDay} في اليوم</span></div>` : ''}</div>
      ${st.unseated || st.short ? (() => { const need = C.reduce((x, c) => x + c.students, 0), have = CAP.reduce((x, n) => x + n, 0), full = NS * capTotal;
        return `<div class="alert alert-warning small"><i class="bi bi-lightbulb"></i> المقاعد المتاحة في كل الفترات: <b>${have}</b>${S.busy && have < full ? ` (من ${full} لولا المحاضرات القائمة)` : ''} مقابل <b>${need}</b> مقعداً مطلوباً.
          للحل: زد عدد الأيام أو الفترات، أو أضف قاعات أو ارفع سعتها${S.busy ? '، أو ألغِ «مراعاة المحاضرات القائمة» إن كانت المحاضرات معلّقة في أسبوع الامتحانات' : ''}${st.short ? '؛ ولنقص المراقبين: أضف مراقبين إضافيين أو ارفع حد المراقبات اليومي' : ''}.</div>`; })() : ''}
      ${S.src === 'plans' || !S.reg ? '<div class="alert alert-info small"><i class="bi bi-info-circle"></i> التعارضات هنا مقدّرة من الخطط الدراسية (التخصص × السنة). لنتيجة دقيقة لكل طالب ارفع كشف التسجيل من «الإعداد».</div>' : ''}
      ${(() => { const rep = report(st); if (!rep.length) return ''; repCache = rep;
        const types = [...new Set(rep.map(r => r.k))], f = repFilter && types.includes(repFilter) ? repFilter : '';
        const list = rep.filter(r => !f || r.k === f);
        return `<div class="ex-rephead"><h6 class="ex-h m-0"><i class="bi bi-list-ul"></i> تقرير التعارضات والملاحظات <span class="ex-n ${st.clash ? 'bad' : ''}">${rep.length}</span></h6>
          <span><button class="btn btn-sm btn-outline-secondary" id="ex-rprint"><i class="bi bi-printer"></i> طباعة التقرير</button> <button class="btn btn-sm btn-outline-secondary" id="ex-rxlsx"><i class="bi bi-file-earmark-excel"></i> Excel</button>
          ${rep.some(r => r.fix) ? '<button class="btn btn-sm btn-ex" id="ex-fixall"><i class="bi bi-magic"></i> طبّق كل الحلول</button>' : ''}</span></div>
          <div class="ex-filters"><button class="ex-vbtn${f ? '' : ' on'}" data-rf="">الكل (${rep.length})</button>${types.map(k => `<button class="ex-vbtn${f === k ? ' on' : ''}" data-rf="${k}"><i class="bi ${KIND[k][2]}"></i> ${KIND[k][1]} (${rep.filter(r => r.k === k).length})</button>`).join('')}</div>
          <div class="ex-rep">${list.map((r, k) => `<article class="ex-ri sev${SEV[r.sev]}">
            <header><span class="sev">${r.sev}</span><b><i class="bi ${KIND[r.k][2]}"></i> ${KIND[r.k][1]}</b><span class="when"><i class="bi bi-clock"></i> ${esc(r.when)}</span>
              ${r.k !== 'ins' && r.n ? `<span class="aff"><i class="bi bi-people-fill"></i> ${r.exact ? r.n : 'حتى ' + r.n} طالب${r.exact ? '' : ' (تقدير)'}</span>` : ''}</header>
            <ul class="cs">${r.cs.map(i => `<li style="--c:${C[i].col[0]}"><b>${esc(C[i].code)}</b> ${esc(C[i].name)} <small>· ${esc(C[i].dept)} · ${C[i].students} طالب · ${esc(C[i].ins.map(U.shortName).join('، ') || '—')}</small></li>`).join('')}</ul>
            ${r.who.length ? `<div class="who"><i class="bi bi-diagram-3"></i> ${r.who.map(esc).join(' · ')}</div>` : ''}
            <p class="why">${esc(r.why)}</p>
            <footer>${r.fix ? `<span class="fix"><i class="bi bi-lightbulb-fill"></i> الحل المقترح: ${esc(fixTxt(r.fix))}</span><button class="btn btn-sm btn-ex" data-fix="${r.fix.i},${r.fix.s}">تطبيق</button>` : `<span class="fix muted">${r.k === 'short' ? 'أضف مراقبين أو ارفع حد المراقبات اليومي' : 'لا يوجد نقل يحسّن الوضع؛ زد الأيام أو الفترات أو القاعات'}</span>`}
              <button class="btn btn-sm btn-link" data-go="${r.cs[0]}">عرض في الجدول</button></footer></article>`).join('')}</div>`; })()}
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
    const pr = r => [...new Set(r.rooms.flatMap(x => x.proc))].map(U.shortName).join('، ');
    const H = ['اليوم', 'التاريخ', 'الوقت', 'الرمز', 'المقرر'];
    const sec = (title, columns, list) => ({ title, columns, rows: list });
    if (outView === 'all') return [sec('', H.concat(['القسم', 'الطلبة', 'القاعات', 'المراقبون']), rows.map(r => base(r).concat([r.c.dept, r.c.students, rm(r), pr(r)])))];
    if (outView === 'day') return DAYS.map((dd, di) => sec(`${dd.wd} ${dd.iso}`, ['الوقت', 'الرمز', 'المقرر', 'القسم', 'الطلبة', 'القاعات', 'المراقبون'], rows.filter(r => dayOf(r.s) === di).map(r => [tm(r), r.c.code, r.c.name, r.c.dept, r.c.students, rm(r), pr(r)]))).filter(x => x.rows.length);
    if (outView === 'dept') return [...new Set(rows.map(r => r.c.dept))].sort().map(dp => sec(dp, H.concat(['المدرسون', 'الطلبة', 'القاعات']), rows.filter(r => r.c.dept === dp).map(r => base(r).concat([r.c.ins.map(U.shortName).join('، '), r.c.students, rm(r)]))));
    if (outView === 'cohort') return G.filter(g => g.kind === 'cohort').map(g => sec(g.name, H, rows.filter(r => g.c.includes(r.c.i)).map(base))).filter(x => x.rows.length);
    if (outView === 'room') {
      const byR = {}; rows.forEach(r => r.rooms.forEach(x => (byR[x.room] = byR[x.room] || []).push([d(r).wd, d(r).iso, tm(r), r.c.code, r.c.name, (x.secs || []).join('، '), x.n, x.proc.map(U.shortName).join('، ')])));
      return Object.keys(byR).sort().map(k => sec(`القاعة ${k}`, H.concat(['الشعب', 'الطلبة في القاعة', 'المراقبون']), byR[k]));
    }
    const byI = {};
    rows.forEach(r => {
      r.c.ins.forEach(n => (byI[n] = byI[n] || []).push(base(r).concat(['امتحان مقرره', rm(r)])));
      r.rooms.forEach(x => x.proc.forEach(n => { if (!r.c.ins.includes(n)) (byI[n] = byI[n] || []).push(base(r).concat(['مراقبة', `${x.room} (${x.n})`])); }));
    });
    return Object.keys(byI).sort((a, b) => U.shortName(a).localeCompare(U.shortName(b), 'ar')).map(n => sec(U.shortName(n), H.concat(['المهمة', 'القاعة']), byI[n].sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]))));
  }
  const OUTIC = { all: 'bi-table', day: 'bi-calendar-week', dept: 'bi-diagram-3', cohort: 'bi-mortarboard', ins: 'bi-person-badge', room: 'bi-door-open' };
  // on screen, the plain cells of the reports become clear chips and badges (print and Excel keep the text)
  const COLS = { 'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'الرمز': 'code', 'المقرر': 'name', 'القسم': 'dept', 'الطلبة': 'num', 'الطلبة في القاعة': 'num', 'الشعب': 'secs',
    'القاعات': 'rooms', 'القاعة': 'rooms', 'المراقبون': 'ppl', 'المدرسون': 'ppl', 'المهمة': 'task' };
  const colCls = h => COLS[h] || 'txt';
  const dayKey = (cols, r) => { const j = cols.indexOf('التاريخ'); return j < 0 ? '' : r[j]; };
  function cellHtml(h, v) {
    const k = colCls(h), s = String(v == null ? '' : v);
    if (!s) return '<span class="text-muted">—</span>';
    if (k === 'date') return `<span class="ex-dt">${+s.slice(8)}/${+s.slice(5, 7)}<small>${s.slice(0, 4)}</small></span>`;
    if (k === 'day') return `<b class="ex-dw">${esc(s)}</b>`;
    if (k === 'time') return `<span class="ex-tm" dir="ltr"><i class="bi bi-clock"></i> ${esc(s.replace('–', ' – '))}</span>`;
    if (k === 'code') { const c = BY[s]; return `<span class="ex-code" ${c ? `style="--c:${c.col[0]};--b:${c.col[1]}"` : ''}>${esc(s)}</span>`; }
    if (k === 'name') return `<b class="ex-nm">${esc(s)}</b>`;
    if (k === 'num') return `<span class="bdg blue"><i class="bi bi-people-fill"></i> ${esc(s)}</span>`;
    if (k === 'rooms') return `<div class="ex-chips">${s.split(/\s*؛\s*/).map(x => { const m = x.match(/^(.+?):\s*(\d+) طالب(?:\s*–\s*(.+))?$/);
      return m ? `<span class="ex-rm"><i class="bi bi-door-open-fill"></i> <b>${esc(m[1])}</b><span class="n">${m[2]}</span>${m[3] ? `<small>${esc(m[3])}</small>` : ''}</span>` : `<span class="ex-rm ${/بلا قاعة/.test(x) ? 'bad' : ''}">${esc(x)}</span>`; }).join('')}</div>`;
    if (k === 'ppl') return `<div class="ex-chips">${s.split(/\s*،\s*/).filter(Boolean).map(n => `<span class="ex-pp"><i class="bi bi-person-fill"></i> ${esc(n)}</span>`).join('')}</div>`;
    if (k === 'task') return s === 'مراقبة' ? '<span class="bdg amber"><i class="bi bi-eye-fill"></i> مراقبة</span>' : '<span class="bdg green"><i class="bi bi-journal-check"></i> امتحان مقرره</span>';
    return esc(s);
  }
  function outView_() {
    const secs = outData(), n = secs.reduce((a, s) => a + s.rows.length, 0);
    return `<div class="ex-outbar"><div class="ex-views">${Object.entries(OUT).map(([k, t]) => `<button class="ex-vbtn${outView === k ? ' on' : ''}" data-ov="${k}"><i class="bi ${OUTIC[k]}"></i> ${t}</button>`).join('')}</div>
      <div class="ex-acts"><button class="btn btn-ex" id="ex-print"><i class="bi bi-printer-fill"></i> طباعة / PDF</button><button class="btn btn-success" id="ex-xlsx"><i class="bi bi-file-earmark-excel-fill"></i> Excel</button>
      <button class="btn btn-outline-secondary" id="ex-csv"><i class="bi bi-filetype-csv"></i> CSV</button></div></div>
      ${pubPanel()}
      <div class="ex-docs"><b><i class="bi bi-folder2-open"></i> كشوف ومستندات</b>
        <button class="btn btn-outline-primary" id="ex-plists"><i class="bi bi-people-fill"></i> قوائم الطلبة لكل قاعة <small>QR</small></button>
        <button class="btn btn-outline-primary" id="ex-psheets"><i class="bi bi-person-badge-fill"></i> كشف كل مراقب <small>QR</small></button>
        <button class="btn btn-outline-primary" id="ex-prep"><i class="bi bi-clipboard-data-fill"></i> تقرير المراقبات</button>
        <input type="file" id="ex-reg2" accept=".xls,.xlsx,.csv,.htm,.html" hidden>
        <small class="text-muted">تأخذ التصفية الحالية (الكلية والقسم والبحث). ${REGMEM ? `أسماء الطلبة من ${esc(REGMEM.file)} (في هذه الصفحة فقط).` : 'قوائم الطلبة تحتاج كشف التسجيل؛ سيُطلب رفعه ولا يُحفظ.'}</small></div>
      ${filterBar()}
      <p class="ex-note"><i class="bi bi-info-circle-fill"></i> ${secs.length > 1 ? `${secs.length} جدولاً` : 'جدول واحد'} · ${n} صفاً — الطباعة والتصدير يأخذان العرض والتصفية الحاليين؛ في Excel كل جدول في ورقة.</p>
      ${secs.map(s => `${s.title ? `<h5 class="ex-h"><i class="bi ${OUTIC[outView]}"></i> ${esc(s.title)} <span class="ex-n">${s.rows.length}</span></h5>` : ''}<div class="table-responsive ex-tbl"><table class="table table-striped align-middle"><thead><tr>${s.columns.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map((r, k) => `<tr class="${k && dayKey(s.columns, r) !== dayKey(s.columns, s.rows[k - 1]) ? 'nd' : ''}">${r.map((v, j) => `<td class="c-${colCls(s.columns[j])}">${cellHtml(s.columns[j], v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.columns.length}" class="text-muted">لا شيء</td></tr>`}</tbody></table></div>`).join('')}`;
  }
  const title = () => (S.label || TYPES[S.type].name) + ' – ' + facLabel();
  function doPrint() {
    const st = stats();
    window.printReport({ title: title(), subtitle: `${OUT[outView]} · ${TT.term}`, orientation: 'landscape', fit: false,
      filters: [['الفترة', DAYS.length ? `${DAYS[0].label} – ${DAYS[DAYS.length - 1].label}` : '—'], ['الحالة', S.approved ? 'معتمدة: ' + S.approved : 'مسودة']],
      stats: [['مقرراً', C.length], ['مقعد امتحان', C.reduce((a, c) => a + c.students, 0)], ['يوماً', DAYS.length], ['تعارض', st.clash]],
      sections: outData(), note: 'أُعدّ الجدول بأداة «جدول الامتحانات» في بوصلة البترا؛ القاعات والمراقبون مقترحة وتُعتمد من لجنة الامتحانات.', qr: false });
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
      const W = { 'اليوم': 11, 'التاريخ': 12, 'الوقت': 13, 'الرمز': 11, 'المقرر': 38, 'القسم': 24, 'الطلبة': 9, 'الطلبة في القاعة': 10, 'الشعب': 12, 'القاعات': 34, 'القاعة': 20, 'المراقبون': 34, 'المدرسون': 30, 'المهمة': 13 };
      const CENTER = new Set(['اليوم', 'التاريخ', 'الوقت', 'الرمز', 'الطلبة', 'الطلبة في القاعة', 'الشعب', 'المهمة']);
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
      outData().forEach(sec => {
        const cols = sec.columns, nc = cols.length, aoa = [], ws = { merges: [], rows: [] }, styles = {}, jd = cols.indexOf('التاريخ'), jw = cols.indexOf('اليوم');
        header(ws, aoa, nc, OUT[outView] + (sec.title ? ' · ' + sec.title : ''));
        aoa.push(cols.slice()); ws.rows.push({ hpt: 26 }); cols.forEach((h, j) => { styles[E({ r: 4, c: j })] = ST.head; });
        let last = null, z = 0;
        sec.rows.forEach(row => {
          const dk = jd >= 0 ? row[jd] : null;
          if (dk && dk !== last && outView !== 'day') { const r = aoa.length; aoa.push([`${jw >= 0 ? row[jw] + ' ' : ''}${+dk.slice(8)}/${+dk.slice(5, 7)}/${dk.slice(0, 4)}`]); ws.merges.push({ s: { r, c: 0 }, e: { r, c: nc - 1 } }); ws.rows.push({ hpt: 20 });
            for (let j = 0; j < nc; j++) styles[E({ r, c: j })] = ST.band; z = 0; }
          last = dk;
          const r = aoa.length, vals = row.map((v, j) => cols[j] === 'القاعات' ? String(v ?? '').split(/\s*؛\s*/).join('\n') : cols[j] === 'المراقبون' || cols[j] === 'المدرسون' ? String(v ?? '').split(/\s*،\s*/).join('\n') : v);
          aoa.push(vals); const lines = Math.max(1, ...vals.map(v => String(v ?? '').split('\n').length)); ws.rows.push({ hpt: Math.max(20, 14 * lines + 4) });
          cols.forEach((h, j) => { styles[E({ r, c: j })] = cell(z % 2, CENTER.has(h), h === 'الرمز' || h === 'المقرر'); }); z++;
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
      .hd { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #901d23; padding-bottom: 8px; } .hd img { height: 52px; } .hd .t { flex: 1; } .hd small { color: #6b7a82; font-size: 8.5pt; display: block; }
      .hd h1 { margin: 2px 0 0; font-size: 16pt; color: #091b22; } .hd h2 { margin: 2px 0 0; font-size: 10.5pt; color: #901d23; }
      .qr { text-align: center; } .qr svg { width: 78px; height: 78px; display: block; margin: auto; } .qr span { display: block; font-size: 7pt; color: #901d23; font-weight: 700; margin-top: 2px; }
      .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; } .info div { border: 1px solid #e3dccb; border-top: 3px solid #091b22; border-radius: 7px; padding: 5px 8px; }
      .info span { display: block; font-size: 8pt; color: #6b7a82; } .info b { font-size: 11pt; color: #091b22; } .info .w2 { grid-column: span 2; } .info .w4 { grid-column: span 4; }
      table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; } th { background: #091b22; color: #fff; font-size: 9pt; padding: 5px; border: 1px solid #091b22; }
      td { border: 1px solid #d9dfe3; padding: 4px 6px; font-size: 9.5pt; height: 22px; } tbody tr:nth-child(even) td { background: #f7f9fa; } tr { break-inside: avoid; }
      td.n { text-align: center; width: 30px; color: #6b7a82; } td.id { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; width: 90px; } td.sg { width: 110px; } td.c { text-align: center; }
      .band td { background: #f6e7e8 !important; color: #901d23; font-weight: 800; }
      .sig { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 16px; } .sig div { border-top: 1px dashed #9aa6ac; padding-top: 4px; font-size: 8.5pt; color: #4a5a62; text-align: center; }
      .tot { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; } .tot span { background: #f6f3ec; border: 1px solid #e3dccb; border-radius: 999px; padding: 2px 10px; font-size: 8.5pt; }
      .ft { margin-top: 8px; font-size: 7.5pt; color: #7a868c; display: flex; justify-content: space-between; }`;
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
    const mine = (REGMEM && REGMEM.mine[c.code]) || {}, who = (REGMEM && REGMEM.who) || {};
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
        sheets.push({ title: `كشف حضور امتحان: ${x.c.name}`, sub: `${TYPES[S.type].name} · ${x.c.dept}`, qr: SITE + 'myexams.html?c=' + encodeURIComponent(x.c.code), qrLabel: 'تفاصيل الامتحان للطلبة',
          info: [['رمز المادة', x.c.code], ['التاريخ', si.date], ['الوقت', si.time], ['القاعة', r.room + (r.t === LAB ? ' (مختبر)' : '')], ['الشعب', r.secs.join('، ') || '—', 'w2'], ['عدد الطلبة في القاعة', `${st.length || r.n}`], ['القاعة ' + (k + 1) + ' من', String(x.rooms.length)],
            ['المراقبون', r.proc.map(U.shortName).join('، ') || '—', 'w4']],
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
  // No keys and no files: the page opens GitHub — where the committee member is already signed in — on a new file in
  // data/exams/inbox/ holding the timetable (copied to the clipboard), the member presses «Commit changes», and the
  // workflow exam-publish.yml writes data/exam_schedule.json at once (scripts/exam_inbox.py). Unpublishing is the same
  // with a short file. Only accounts that can write to the repository can commit, so only they can publish.
  const REPO = 'https://github.com/marafah/uopstaff';
  const MAGIC = 'UOPEXAMS1:';
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const newFile = (kind, value) => `${REPO}/new/main?filename=${encodeURIComponent(`data/exams/inbox/${stamp()}-${kind}.txt`)}${value ? '&value=' + encodeURIComponent(value) : ''}`;
  let LIVE = null;   // what the site shows now (read from the published file)
  let WATCH = null;  // waiting for a publish/unpublish to appear on the site
  function liveCheck() { return fetch('data/exam_schedule.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null).then(x => { LIVE = x && x.exams && x.exams.length ? x : false; if (tab === 'out' && !document.querySelector('#pgModal.show')) render(); return LIVE; }); }
  function pubDoc() {
    const { out } = seating(), exams = [];
    for (let s = 0; s < NS; s++) (out[s] || []).forEach(x => { const d = DAYS[dayOf(s)], p = S.periods[s % P];
      exams.push({ code: x.c.code, name: x.c.name, dept: x.c.dept, fac: x.c.fac, date: d.iso, from: p[0], to: p[1], students: x.c.students, ins: x.c.ins,
        rooms: x.rooms.map(r => ({ room: r.room, lab: r.t === LAB, n: r.n, secs: (r.parts || []).map(q => q.s).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i), proc: r.proc })) }); });
    const now = new Date().toISOString();
    return { id: now, title: title(), type: TYPES[S.type].name, term: TT.term || '', faculties: S.facs.length ? S.facs : ['كل الكليات'], approved: S.approved || null,
      published: now, periods: S.periods, days: DAYS.map(d => d.iso), exams };
  }
  const sig = doc => { const t = JSON.stringify(doc.exams); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h.toString(36); };
  async function pack(doc) {   // gzip + base64: the whole university's timetable fits the clipboard and the GitHub editor easily
    const gz = await new Response(new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const b = new Uint8Array(gz); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return MAGIC + btoa(s);
  }
  function copyText(t) {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* */ } ta.remove();
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
    return ok;
  }
  function pubPanel() {
    const L = LIVE, mine = S.pub, changed = L && mine && C.some(c => c.s >= 0) && sig(pubDoc()) !== mine.sig;
    const st = L === null ? '<span class="bdg"><span class="spinner-border spinner-border-sm"></span> يتحقق من الموقع…</span>'
      : L ? `<span class="bdg green"><i class="bi bi-broadcast"></i> منشور الآن: ${esc(L.title)} · ${L.exams.length} امتحاناً · ${U.ago ? U.ago(L.published) : L.published.slice(0, 10)}</span>`
      : '<span class="bdg"><i class="bi bi-eye-slash"></i> لا جدول منشوراً على الموقع</span>';
    return `<div class="ex-pub"><div class="t"><i class="bi bi-display"></i> النشر على شاشات المباني وصفحة «امتحاناتي»</div>${st}
      ${changed ? '<span class="bdg amber"><i class="bi bi-arrow-repeat"></i> عدّلت الجدول بعد آخر نشر</span>' : ''}
      <span class="sp"></span>
      <button class="btn btn-ex" id="ex-publish"><i class="bi bi-cloud-arrow-up-fill"></i> ${L ? 'تحديث النشر' : 'نشر الآن'}</button>
      ${L ? '<button class="btn btn-outline-danger" id="ex-unpub"><i class="bi bi-cloud-slash"></i> إيقاف النشر</button>' : ''}</div>`;
  }
  // the dialog follows the site until the change shows (GitHub saves → the site updates in about a minute)
  function watch(test, el, okHtml) {
    clearInterval(WATCH); const t0 = Date.now();
    WATCH = setInterval(() => liveCheck().then(L => {
      const box = document.getElementById(el); if (!box) { clearInterval(WATCH); return; }
      if (test(L)) { clearInterval(WATCH); box.className = 'ex-pubst ok'; box.innerHTML = okHtml; render(); return; }
      const m = Math.floor((Date.now() - t0) / 60000);
      if (m >= 6) box.innerHTML = '<i class="bi bi-hourglass-split"></i> لم يظهر بعد. تأكّد أنك ضغطت <b>Commit changes</b> في صفحة GitHub، ثم انتظر قليلاً.';
    }), 10000);
  }
  async function publish() {
    if (!C.some(c => c.s >= 0)) return alert('ولّد الجدول أولاً.');
    if (!S.approved && !confirm('هذه النسخة مسودة (غير معتمدة). نشرها على الشاشات وصفحة الطلبة الآن؟')) return;
    const doc = pubDoc(); let txt;
    try { txt = await pack(doc); } catch (e) { return alert('هذا المتصفح لا يدعم النشر المباشر. استخدم Chrome أو Edge حديثاً.'); }
    U.modal('<i class="bi bi-cloud-arrow-up-fill"></i> نشر الجدول على الشاشات', `
      <p class="mb-2">النشر يتم بحسابك على GitHub (المسجّل عليه في هذا المتصفح) — لا مفاتيح ولا ملفات:</p>
      <ol class="ex-pubsteps"><li>اضغط الزر أدناه: يُنسخ الجدول وتُفتح صفحة GitHub.</li><li>اضغط داخل مربع الكتابة الفارغ ثم <kbd>Ctrl</kbd>+<kbd>V</kbd>.</li><li>اضغط <b>Commit changes</b> (مرتين: في الأعلى ثم في النافذة).</li></ol>
      <button class="btn btn-ex btn-lg w-100" id="ex-gopub"><i class="bi bi-clipboard-check"></i> انسخ الجدول وافتح GitHub</button>
      <div id="ex-pubst" class="ex-pubst"><i class="bi bi-info-circle"></i> ${esc(doc.title)} · ${doc.exams.length} امتحاناً.</div>`);
    document.getElementById('ex-gopub').onclick = () => {
      copyText(txt);
      window.open(newFile('publish'), '_blank', 'noopener');
      S.pub = { at: doc.published, sig: sig(doc), title: doc.title, n: doc.exams.length }; save();
      const box = document.getElementById('ex-pubst'); box.className = 'ex-pubst wait';
      box.innerHTML = '<span class="spinner-border spinner-border-sm"></span> نُسخ الجدول. الصقه في GitHub واضغط Commit changes — ستظهر هنا علامة النجاح تلقائياً.';
      watch(L => L && L.id === doc.id, 'ex-pubst', `<i class="bi bi-check-circle-fill"></i> <b>نُشر الجدول.</b> يظهر على شاشات المباني خلال 3 دقائق.
        <div class="d-flex flex-wrap gap-2 mt-2"><a class="btn btn-sm btn-outline-primary" href="screen.html?b=exams" target="_blank"><i class="bi bi-display"></i> شاشة الامتحانات</a><a class="btn btn-sm btn-outline-primary" href="myexams.html" target="_blank"><i class="bi bi-phone"></i> «امتحاناتي»</a></div>`);
    };
  }
  // take the timetable off the screens and the students' page
  function unpublish(after) {
    U.modal('<i class="bi bi-cloud-slash"></i> إزالة الجدول من الشاشات', `
      <p class="mb-2">تُفتح صفحة GitHub وفيها طلب الإزالة جاهزاً؛ اضغط <b>Commit changes</b> (مرتين) فقط.</p>
      <button class="btn btn-danger btn-lg w-100" id="ex-gounpub"><i class="bi bi-box-arrow-up-left"></i> افتح GitHub لإزالة الجدول</button>
      <div id="ex-unst" class="ex-pubst"><i class="bi bi-info-circle"></i> بعد الإزالة تعود الشاشات إلى عرض المحاضرات تلقائياً.</div>`);
    document.getElementById('ex-gounpub').onclick = () => {
      window.open(newFile('unpublish', 'إزالة جدول الامتحانات من الشاشات'), '_blank', 'noopener');
      S.pub = null; save(); if (after) after();
      const box = document.getElementById('ex-unst'); if (box) { box.className = 'ex-pubst wait'; box.innerHTML = '<span class="spinner-border spinner-border-sm"></span> بانتظار Commit changes في GitHub…'; }
      watch(L => L === false, 'ex-unst', '<i class="bi bi-check-circle-fill"></i> <b>أُزيل الجدول.</b> تعود الشاشات إلى المحاضرات خلال 3 دقائق.');
    };
  }
  function doCSV() {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`, lines = [];
    outData().forEach(s => { if (s.title) lines.push(q(s.title)); lines.push(s.columns.map(q).join(',')); s.rows.forEach(r => lines.push(r.map(q).join(','))); lines.push(''); });
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
    const A = 7 * 60, Z = 18 * 60, X = m => ((m - A) / (Z - A) * 100).toFixed(2) + '%', W = (a, b) => ((b - a) / (Z - A) * 100).toFixed(2) + '%';
    const ps = S.periods.map(p => [U.toMin(p[0]), U.toMin(p[1])]).sort((a, b) => a[0] - b[0]);
    const win = [U.toMin(S.firstStart || '07:00'), U.toMin(S.lastEnd || '18:00')];
    const gaps = ps.slice(1).map((p, k) => [ps[k][1], p[0]]).filter(([a, b]) => b > a);
    return `<div class="ex-tl"><div class="bar"><span class="win" style="right:${X(win[0])};width:${W(win[0], win[1])}"></span>
      ${ps.map(([a, b], k) => `<span class="p${late([U.toTime(a), U.toTime(b)]) ? ' bad' : ''}" style="right:${X(a)};width:${W(a, b)}"><b>الفترة ${k + 1}</b><small dir="ltr">${U.toTime(a)}–${U.toTime(b)}</small></span>`).join('')}
      ${gaps.map(([a, b]) => `<span class="g" style="right:${X(a)};width:${W(a, b)}" title="استراحة ${b - a} دقيقة"></span>`).join('')}</div>
      <div class="ax">${[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => `<i style="right:${X(h * 60)}">${h}</i>`).join('')}</div>
      <div class="lgd"><span><i class="d win"></i> وقت الامتحانات المسموح <bdi dir="ltr">${U.toTime(win[0])} – ${U.toTime(win[1])}</bdi></span><span><i class="d p"></i> فترة امتحان</span>${gaps.length ? '<span><i class="d g"></i> استراحة بين فترتين</span>' : ''}</div></div>`;
  }
  function calKpis() {
    if (!DAYS.length) return '<div class="alert alert-warning mt-3">لا توجد أيام امتحانات: راجع التاريخين وأيام التعطيل.</div>';
    const a = DAYS[0].iso, z = DAYS[DAYS.length - 1].iso, span = Math.round((Date.parse(z) - Date.parse(a)) / 864e5) + 1, hol = (S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).filter(h => h >= a && h <= z).length;
    return `<div class="ex-kpis">
      <div class="k ex"><i class="bi bi-calendar-check-fill"></i><b>${DAYS.length}</b><span>يوم امتحانات</span></div>
      <div class="k"><i class="bi bi-flag-fill"></i><b>${esc(DAYS[0].wd)} ${+a.slice(8)}/${+a.slice(5, 7)}</b><span>أول يوم</span></div>
      <div class="k"><i class="bi bi-flag-checkered"></i><b>${esc(DAYS[DAYS.length - 1].wd)} ${+z.slice(8)}/${+z.slice(5, 7)}</b><span>آخر يوم</span></div>
      <div class="k"><i class="bi bi-calendar-range"></i><b>${span}</b><span>يوماً من البداية للنهاية</span></div>
      <div class="k hol"><i class="bi bi-calendar-x-fill"></i><b>${span - DAYS.length}</b><span>يوم بلا امتحانات${hol ? ` (منها ${hol} عطلة)` : ''}</span></div>
      <div class="lg"><span><i class="d ex"></i> امتحانات</span><span><i class="d off"></i> بلا امتحانات</span><span><i class="d hol"></i> عطلة</span></div></div>`;
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
        cells.push({ iso, h: `<button class="${cls}${iso === U.amman().iso ? ' today' : ''}" ${inR && wd !== 5 && !S.off.includes(wd) ? `data-tgl="${iso}" title="${hol.has(iso) ? 'إلغاء العطلة' : 'تعيين عطلة'}"` : 'disabled'}><b>${d}</b>${ex.has(iso) ? `<small>${ex.get(iso)}</small>` : hol.has(iso) ? '<small>عطلة</small>' : ''}</button>` });
      }
      // only the weeks of the exam period (the rest of the month is left out)
      const wk = []; for (let k = 0; k < cells.length; k += 7) wk.push(cells.slice(k, k + 7));
      const keep = wk.filter(w => w.some(x => x.iso && x.iso >= S.start && x.iso <= DAYS[DAYS.length - 1].iso)).flat().map(x => x.h);
      if (!keep.length) continue;
      out.push(`<div class="ex-month"><h6>${new Date(Date.UTC(y, mo, 15)).toLocaleDateString('ar-JO-u-nu-latn', { month: 'long', year: 'numeric' })}</h6><div class="g">${['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(x => `<i>${x}</i>`).join('')}${keep.join('')}</div></div>`);
    }
    return `<div class="ex-months">${out.join('')}</div>`;
  }
  function setView() {
    const facs = [...new Set(TT.sections.map(s => s.faculty))].sort();
    const all = (() => { const m = {}; merged(TT.sections.filter(s => inFac(s.faculty) && (S.practical || s.activity === 'نظري') && (S.grad || s.degree !== 'الماجستير'))).forEach(s => {
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
      <label class="ex-fld"><span>عنوان الجدول (يظهر في الطباعة)</span><input class="form-control" data-k="label" placeholder="${esc(TYPES[S.type].name)} – ${esc(TT.term)}" value="${esc(S.label || '')}"></label>
      <div class="ex-fld"><span>الكليات المشمولة</span><div class="ex-chipset ex-facs"><label class="ex-chk${!S.facs.length ? ' on' : ''}"><input type="checkbox" data-facall ${!S.facs.length ? 'checked' : ''}> <i class="bi bi-buildings-fill"></i> كل الكليات</label>
        ${facs.map(x => `<label class="ex-chk${S.facs.includes(x) ? ' on' : ''}"><input type="checkbox" data-fac="${esc(x)}" ${S.facs.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
        <small>جدول واحد لعدة كليات يمنع تعارض المواد المشتركة (متطلبات الجامعة والمواد الخدمية).</small></div>`)}
    ${bx(2, 'bi-calendar-range-fill', '#0b4a66', 'التقويم', 'أيام الامتحانات والعطل', `
      <div class="ex-cal3">
        <section class="dur"><h6><i class="bi bi-1-circle-fill"></i> مدة الامتحانات</h6>
          <div class="g3"><label class="ex-fld"><span>أول يوم امتحان</span><input type="date" class="form-control" data-k="start" value="${S.start}"></label>
            <label class="ex-fld"><span>آخر يوم امتحان</span><input type="date" class="form-control" data-k="end" value="${S.end || ''}" min="${S.start}"></label>
            ${S.end ? '<div class="ex-fld"><span>عدد الأيام</span><div class="calc">' + DAYS.length + ' <small>محسوب من التاريخين</small></div><button class="btn btn-sm btn-link p-0" data-noend>تحديد العدد يدوياً</button></div>' : num('days', 'أو عدد الأيام', 1, 40)}</div></section>
        <section><h6><i class="bi bi-2-circle-fill"></i> أيام الأسبوع بلا امتحانات</h6>
          <div class="ex-wk">${[6, 0, 1, 2, 3, 4, 5].map(i => i === 5 ? `<label class="ex-chk on lock" title="عطلة رسمية"><input type="checkbox" checked disabled> ${WD[i]}</label>` : `<label class="ex-chk${S.off.includes(i) ? ' on' : ''}"><input type="checkbox" data-off="${i}" ${S.off.includes(i) ? 'checked' : ''}> ${WD[i]}</label>`).join('')}</div>
          <small>الجمعة عطلة دائماً؛ السبت حسب قرار الجامعة.</small></section>
        <section><h6><i class="bi bi-3-circle-fill"></i> العطل الرسمية</h6>
          <div class="ex-add"><input type="date" class="form-control" id="ex-holin"><button class="btn btn-outline-primary" data-addhol><i class="bi bi-plus-lg"></i> إضافة</button></div>
          <div class="ex-chipset mt-1">${(S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).map(h => `<span class="ex-tagx">${dLong(h)}<button data-delhol="${h}" aria-label="حذف"><i class="bi bi-x"></i></button></span>`).join('') || '<small>لا عطل. أو اضغط أي يوم في التقويم.</small>'}</div></section>
      </div>
      ${calKpis()}
      <div class="ex-calbody">${monthsView()}${daysList()}</div>`)}
    ${bx(3, 'bi-clock-fill', '#0f766e', 'الفترات اليومية', 'مواعيد الامتحانات في اليوم', `
      <div class="ex-what"><div class="q"><i class="bi bi-question-circle-fill"></i> ما هي «الفترة»؟</div>
        <p>الفترة <b>موعد امتحان ثابت يتكرر في كل يوم</b>، مثل: من الساعة 9:00 إلى 11:00. يأخذ كل امتحان فترة واحدة في يوم واحد، وكل الامتحانات التي تقع في الفترة نفسها تُعقد معاً في قاعات مختلفة.
          فعدد المواعيد المتاحة = عدد الأيام × عدد الفترات. فترات أكثر في اليوم تعني أياماً أقل، لكن ضغطاً أكبر على الطالب والقاعات.</p>
        <div class="ex-cap"><span><b>${nDays(DAYS.length)}</b></span><i>×</i><span><b>${nPer(P)}</b> في اليوم</span><i>=</i><span class="t"><b>${BLK.filter(x => !x).length}</b> موعداً متاحاً</span><i>لـ</i><span><b>${C.length}</b> امتحاناً</span>
          <span class="avg">≈ ${(C.length / Math.max(1, BLK.filter(x => !x).length)).toFixed(1)} امتحان في كل موعد</span></div>
        ${P === 1 ? '<div class="ex-note1"><i class="bi bi-info-circle-fill"></i> فترة واحدة فقط: كل الامتحانات في الساعة نفسها من كل يوم، فيتوزّع ' + C.length + ' امتحاناً على ' + nDays(DAYS.length) + ' فقط. أضف فترة ثانية لتقليل الضغط على الأيام والقاعات.</div>' : ''}
        ${S.periods.some(p => mins(p[0], p[1]) > 180) ? '<div class="ex-note1 warn"><i class="bi bi-exclamation-triangle-fill"></i> فترة أطول من 3 ساعات: هل هي مدة الامتحان فعلاً؟ الفترة = مدة امتحان واحد، لا يوم الامتحانات كله (وقت اليوم يُحدَّد في «وقت الامتحانات اليومي» أدناه).</div>' : ''}
        ${timeline()}
        <ul><li>طول الفترة = مدة الامتحان: ساعة للأول والثاني، ساعة ونصف للمنتصف، ساعتان للنهائي.</li><li>اترك 30 دقيقة على الأقل بين فترتين لتبديل القاعات والمراقبين.</li><li>إن ظهرت تعارضات كثيرة: زِد الأيام أو أضف فترة.</li></ul></div>
      <div class="ex-win"><div class="ex-win-h"><i class="bi bi-clock-history"></i> وقت الامتحانات اليومي</div>
        <div class="ex-win-g"><label><span>تبدأ الامتحانات من</span><input type="time" class="form-control" data-k="firstStart" value="${S.firstStart || ''}"></label>
          <label><span>وتنتهي قبل</span><input type="time" class="form-control" data-k="lastEnd" value="${S.lastEnd || ''}"></label></div>
        <details ${Object.keys(S.dayWin || {}).length ? 'open' : ''}><summary>وقت مختلف لبعض الأيام (مثلاً الخميس حتى 13:00)</summary>
          <div class="ex-win-d">${[0, 1, 2, 3, 4, 6].filter(i => !S.off.includes(i)).map(i => { const w = (S.dayWin || {})[i] || {};
            return `<div class="r${w.from || w.to ? ' on' : ''}"><b>${WD[i]}</b><input type="time" class="form-control" data-dw="${i}" data-e="from" value="${w.from || ''}" title="من"><span>–</span><input type="time" class="form-control" data-dw="${i}" data-e="to" value="${w.to || ''}" title="إلى">${w.from || w.to ? `<button class="btn btn-sm btn-link" data-dwclr="${i}">مسح</button>` : '<small>كالعام</small>'}</div>`; }).join('')}</div></details>
        <small class="d-block mt-1">فترة لا تقع داخل وقت اليوم تُعطَّل في ذلك اليوم فقط، ولا يضع النظام فيها امتحاناً.</small></div>
      ${S.periods.some(late) ? `<div class="alert alert-danger py-2 d-flex flex-wrap align-items-center gap-2"><i class="bi bi-exclamation-octagon-fill"></i> فترة أو أكثر خارج وقت الامتحانات (${S.firstStart || '—'}–${S.lastEnd || '—'}).<button class="btn btn-sm btn-danger" data-fixno>حذف الفترات الخارجة</button></div>` : ''}
      <div class="ex-presets">${PRESETS.map(([t], k) => `<button class="btn btn-sm btn-outline-secondary" data-preset="${k}"><i class="bi bi-lightning-charge"></i> ${t}</button>`).join('')}</div>
      <div class="ex-plist">${S.periods.map((p, k) => `<div class="ex-prow"><span class="bdg teal">الفترة ${k + 1}</span><input type="time" class="form-control" data-p="${k}" data-e="0" value="${p[0]}"><span>إلى</span><input type="time" class="form-control" data-p="${k}" data-e="1" value="${p[1]}">
        <span class="bdg ${mins(p[0], p[1]) > 0 && !late(p) ? '' : 'red'}">${mins(p[0], p[1]) <= 0 ? 'وقت غير صحيح' : late(p) ? 'خارج وقت الامتحانات' : U.dur(mins(p[0], p[1]))}</span><button class="btn btn-sm btn-outline-danger" data-delp="${k}" ${P < 2 ? 'disabled' : ''} aria-label="حذف"><i class="bi bi-trash"></i></button></div>`).join('')}</div>
      <button class="btn btn-outline-primary" data-addp><i class="bi bi-plus-lg"></i> إضافة فترة</button>`)}
    ${bx(4, 'bi-rulers', '#9a5b00', 'قواعد الجدولة', 'ما يمنعه النظام وما يحاول تجنّبه', `
      <div class="ex-rule hard"><i class="bi bi-shield-fill-check"></i> دائماً: لا يجتمع امتحانان لطالب في الفترة نفسها، ولا يتجاوز عدد الطلبة مقاعد القاعات.</div>
      <div class="row2">${num('maxDay', 'أقصى عدد امتحانات للطالب في اليوم', 1, 4)}<label class="ex-fld"><span>عمق البحث عن أفضل جدول</span><select class="form-select" data-k="depth">${[['quick', 'سريع (ثوانٍ)'], ['normal', 'متوازن'], ['deep', 'عميق (أبطأ وأدق)']].map(([k, t]) => `<option value="${k}" ${S.depth === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="ex-rules2">${sw('b2b', 'تجنّب امتحانين متتاليين في اليوم نفسه', 'يترك فترة راحة بين امتحاني الطالب')}${sw('near', 'مراعاة طلبة السنتين المتتاليتين', 'تجنّب تزامن مواد السنة الثانية والثالثة مثلاً في التخصص نفسه')}${sw('insClash', 'منع تزامن امتحانين لمدرّس واحد', 'ليحضر المدرّس امتحان كل مقرر يدرّسه')}${sw('early', 'المقررات الكبيرة في الأيام الأولى', 'ليتسع وقت التصحيح')}${sw('busy', 'مراعاة المحاضرات القائمة', 'لا تُستخدم قاعة فيها محاضرة وقت الامتحان ولا يراقب مدرّس عنده محاضرة (للامتحانات خلال الفصل)')}${sw('practical', 'تضمين الشعب العملية', '')}${sw('grad', 'تضمين الماجستير', '')}</div>`)}
    ${bx(5, 'bi-people-fill', '#6d28d9', 'بيانات الطلبة', 'من يجلس مع من؟', `
      <div class="ex-srcs">${[['plans', 'bi-diagram-3-fill', 'الخطط الدراسية', 'تقدير حسب التخصص والسنة'], ['reg', 'bi-file-earmark-spreadsheet-fill', 'كشف التسجيل', 'دقيق لكل طالب'], ['both', 'bi-intersect', 'الاثنان معاً', 'الأدق والأشمل']]
        .map(([k, ic, t, d]) => `<label class="ex-type${S.src === k ? ' on' : ''}"><input type="radio" name="src" data-src="${k}" ${S.src === k ? 'checked' : ''}><i class="bi ${ic}"></i><b>${t}</b><small>${d}</small></label>`).join('')}</div>
      <label class="ex-fld"><span>رفع كشف التسجيل: تقرير «كشف تسجيل الطلبة» من نظام التسجيل كما هو (.xls)، لقسم أو كلية أو الجامعة كلها؛ أو أي ملف Excel / CSV فيه رقم الطالب ورمز المادة</span><input type="file" class="form-control" id="ex-reg" accept=".csv,.xlsx,.xls,.htm,.html"></label>
      <div class="ex-tplbar"><i class="bi bi-table"></i><span>ليس لديك التقرير؟ استخدم النموذج بأعمدة واضحة: <b>رقم الطالب</b>، اسم الطالب، <b>رمز المادة</b>، اسم المادة، الشعبة، التخصص.</span><button class="btn btn-sm btn-outline-primary" data-tpl="reg"><i class="bi bi-file-earmark-arrow-down"></i> تنزيل النموذج</button></div>
      <div id="ex-regmsg" class="small text-muted"></div>
      <div class="ex-rule ${S.reg ? 'ok' : ''}">${S.reg ? `<i class="bi bi-check-circle-fill"></i> ${esc(S.regInfo)}${S.regN ? ` · <b>${C.filter(c => c.fromReg).length}</b> من ${C.length} مقرراً في نطاق الجدول أعدادها من الكشف${C.some(c => !c.fromReg) ? ' (البقية من الجدول الدراسي)' : ''}` : ''} <button class="btn btn-sm btn-link text-danger" data-clrreg>حذف الكشف</button>` : '<i class="bi bi-lock-fill"></i> لا يُحفظ رقم أي طالب: تُحفظ فقط مجموعات المواد وعدد طلبتها، على هذا الجهاز وحده.'}</div>`)}
    ${bx(6, 'bi-door-open-fill', '#15803d', 'القاعات', `${on.length} قاعة مفعّلة · ${capTotal} مقعد في الفترة`, `
      <div class="ex-acts mb-2"><button class="btn btn-sm btn-outline-primary" data-addr><i class="bi bi-plus-lg"></i> قاعة</button><button class="btn btn-sm btn-outline-secondary" data-allr="1">تفعيل الكل</button><button class="btn btn-sm btn-outline-secondary" data-allr="0">تعطيل الكل</button>
        <button class="btn btn-sm btn-outline-secondary" data-scaler="1.1">السعة +10%</button><button class="btn btn-sm btn-outline-secondary" data-scaler="0.9">السعة −10%</button><button class="btn btn-sm btn-outline-success" data-addlabs><i class="bi bi-pc-display"></i> إضافة مختبرات الكلية</button><button class="btn btn-sm btn-link" data-resetr>إعادة الاقتراح</button></div>
      <div class="ex-chipset mb-2"><span class="bdg"><i class="bi bi-easel2"></i> ${on.filter(r => r.t !== LAB).length} قاعة · ${on.filter(r => r.t !== LAB).reduce((a, r) => a + r.c, 0)} مقعد</span><span class="bdg teal"><i class="bi bi-pc-display"></i> ${on.filter(r => r.t === LAB).length} مختبر · ${on.filter(r => r.t === LAB).reduce((a, r) => a + r.c, 0)} جهاز</span></div>
      <div class="ex-rooms"><table class="table table-sm align-middle"><thead><tr><th>مفعّلة</th><th>القاعة</th><th>النوع</th><th>السعة الامتحانية</th><th></th></tr></thead><tbody>
        ${R.map((r, k) => `<tr class="${r.on ? '' : 'off'}"><td><input type="checkbox" class="form-check-input" data-ron="${k}" ${r.on ? 'checked' : ''}></td><td><input class="form-control form-control-sm" data-rn="${k}" value="${esc(r.n)}"></td>
          <td><select class="form-select form-select-sm ex-rt ${r.t === LAB ? 'lab' : ''}" data-rt="${k}"><option ${r.t !== LAB ? 'selected' : ''}>${HALL}</option><option ${r.t === LAB ? 'selected' : ''}>${LAB}</option></select></td><td><input type="number" class="form-control form-control-sm" data-rc="${k}" value="${r.c}" min="1"></td><td><button class="btn btn-sm btn-outline-danger" data-delr="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>
      <label class="ex-fld"><span>إضافة قاعات دفعة واحدة (سطر لكل قاعة: الاسم، السعة)</span><textarea class="form-control" rows="2" id="ex-bulkr" placeholder="B101, 40&#10;مختبر 3, 25, مختبر"></textarea><button class="btn btn-sm btn-outline-primary mt-1" data-bulkr>إضافة</button></label>
      <small class="text-muted">السعة المقترحة ≈ 60% من أكبر شعبة دُرّست في القاعة (مقعد فارغ بين الطلبة).</small>`)}
    ${bx(7, 'bi-person-badge-fill', '#be185d', 'المراقبون', 'العدد والحدود والاستثناءات', `
      <div class="ex-srcs two">${[['room', 'bi-person-fill', 'مراقب واحد لكل قاعة', 'الافتراضي: لكل جلسة امتحان في كل قاعة مراقب'], ['ratio', 'bi-people-fill', 'حسب عدد الطلبة', 'مراقب لكل عدد محدد من الطلبة']]
        .map(([k, ic, t, d]) => `<label class="ex-type${S.procMode === k ? ' on' : ''}"><input type="radio" name="pm" data-pm="${k}" ${S.procMode === k ? 'checked' : ''}><i class="bi ${ic}"></i><b>${t}</b><small>${d}</small></label>`).join('')}</div>
      ${S.procMode === 'ratio' ? `<div class="row2">${num('perProc', 'عدد الطلبة لكل مراقب', 10, 80)}${num('minProc', 'أقل عدد مراقبين في القاعة', 1, 5, '', 1)}</div>` : ''}
      <div class="row2">${num('maxDutyDay', 'أقصى مراقبات للشخص في اليوم', 0, 6, '0 = بلا حد', 2)}${num('maxDuty', 'أقصى مراقبات للشخص في الدورة', 0, 60, '0 = بلا حد', 0)}</div>
      <label class="ex-fld"><span>مراقبون إضافيون من غير المدرسين (اسم في كل سطر)</span><textarea class="form-control" rows="2" data-k="extraProc">${esc(S.extraProc)}</textarea></label>
      <label class="ex-fld"><span>معفَون من المراقبة (اسم في كل سطر، مثل العميد ورؤساء الأقسام)</span><textarea class="form-control" rows="2" data-k="noProc">${esc(S.noProc || '')}</textarea></label>
      <div class="ex-rule"><i class="bi bi-info-circle-fill"></i> لا تحتاج معرفة المراقبين مسبقاً: يقترح النظام مدرّس الشعبة لقاعة شعبته، ثم يوزّع الباقين بالعدل حسب أقل عدد مراقبات. بعد التوليد يمكنك تغيير أي مراقب من عرض <b>«المراقبون»</b> في الخطوة 2.</div>
      ${poolView()}`)}
    ${bx(8, 'bi-list-check', '#1d4ed8', 'المقررات', `${all.length - Object.keys(S.excl).filter(k => all.some(c => c.code === k)).length} من ${all.length} مقرراً لها امتحان`, `
      <div class="ex-reqbar"><label class="btn btn-outline-primary mb-0"><i class="bi bi-file-earmark-arrow-up"></i> رفع قائمة متطلبات المقررات<input type="file" id="ex-req" accept=".xlsx,.xls,.csv" hidden></label>
        <span class="small text-muted">ملف Excel بأعمدة: رمز المادة، المنسق، قاعة / مختبر، عدد القاعات أو المختبرات، ملاحظات (كالقائمة التي تُرسل لمنسق الامتحانات).</span>
        ${Object.keys(S.req || {}).length ? `<span class="bdg green"><i class="bi bi-check2-circle"></i> ${Object.keys(S.req).length} مقرراً لها متطلبات</span><button class="btn btn-sm btn-link text-danger" data-clrreq>مسح المتطلبات</button>` : ''}</div>
      <div class="ex-add"><input class="form-control" data-f="cq" placeholder="ابحث في المقررات…" value="${esc(f.cq || '')}"><button class="btn btn-sm btn-outline-secondary" data-inclall="1">تضمين الكل</button><button class="btn btn-sm btn-outline-secondary" data-inclall="0">استبعاد الكل</button></div>
      <div class="ex-rooms tall"><table class="table table-sm align-middle"><thead><tr><th>امتحان</th><th>الرمز</th><th>المقرر</th><th>القسم</th><th>الطلبة</th><th>الشعب</th><th>نوع القاعة</th><th title="0 = حسب عدد الطلبة">عدد القاعات</th><th>مراقبون</th><th>ملاحظات المنسق</th><th>موعد ثابت</th></tr></thead><tbody>
        ${shown.map(c => `<tr class="${S.excl[c.code] ? 'off' : ''}"><td><input type="checkbox" class="form-check-input" data-incl="${esc(c.code)}" ${S.excl[c.code] ? '' : 'checked'}></td><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td class="small">${esc(c.dept)}</td><td>${c.n}</td><td>${c.k}</td>
          ${(q => `<td><select class="form-select form-select-sm ex-rt ${q.type === LAB ? 'lab' : q.type ? 'hall' : ''}" data-qt="${esc(c.code)}"><option value="">أي قاعة</option><option ${q.type === HALL ? 'selected' : ''}>${HALL}</option><option ${q.type === LAB ? 'selected' : ''}>${LAB}</option></select></td>
          <td><input type="number" min="0" max="20" class="form-control form-control-sm ex-qn" data-qn="${esc(c.code)}" value="${q.rooms || ''}" placeholder="تلقائي"></td>
          <td><input type="number" min="0" max="20" class="form-control form-control-sm ex-qn" data-qp="${esc(c.code)}" value="${q.proc || ''}" placeholder="تلقائي"></td>
          <td><input class="form-control form-control-sm ex-qnote" data-qx="${esc(c.code)}" value="${esc(q.note || '')}" placeholder="${q.coord ? esc(q.coord) : ''}"></td>`)((S.req || {})[c.code] || {})}
          <td><select class="form-select form-select-sm" data-pinc="${esc(c.code)}" ${S.excl[c.code] ? 'disabled' : ''}><option value="">تلقائي</option>${slots.map(([s, l]) => `<option value="${s}" ${S.pins[c.code] === s ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      <small class="text-muted">أزل علامة المقرر الذي لا امتحان له (مشروع، تدريب…). «نوع القاعة» و«عدد القاعات» كما يطلبها المدرّس أو المنسق: مثلاً 80 طالباً في 4 مختبرات = 20 في كل مختبر. «موعد ثابت» يثبّت المقرر في موعد لا يغيّره التوليد.</small>`, true)}
    </div>`;
    const sum = [`${TYPES[S.type].name} · ${facLabel()}`, `${nDays(DAYS.length)} من ${DAYS[0] ? DAYS[0].label : '—'}`, `${nPer(P)} يومياً`, `حتى ${S.maxDay} امتحان/يوم`,
      S.reg && S.src !== 'plans' ? 'كشف التسجيل' : 'الخطط الدراسية', `${on.length} قاعة · ${capTotal} مقعد`, (S.procMode === 'ratio' ? `طالب/مراقب: ${S.perProc}` : 'مراقب لكل قاعة'), `${C.length} من ${all.length} مقرراً`];
    const k = Math.min(parts.length - 1, Math.max(0, (S.setTab || 1) - 1)), [n, ic, color, ti, sub, bodyHtml] = parts[k];
    return `<div class="ex-intro"><i class="bi bi-1-circle-fill"></i><div><b>الخطوة 1: الإعداد.</b> اختر قسماً من القائمة، أو تنقّل بزرّي «القسم التالي/السابق». الإعدادات كلها مقترحة مسبقاً ويمكن تركها كما هي، ثم اضغط <b>«التالي: التوليد والتعديل»</b>. كل تغيير يُحفظ تلقائياً.</div></div>
      <div class="ex-setwrap"><nav class="ex-setnav" aria-label="أقسام الإعداد">${parts.map((p, x) => `<button class="ex-sn${x === k ? ' on' : ''}" data-st="${x + 1}" style="--a:${p[2]}"><span class="bn">${p[0]}</span><i class="bi ${p[1]}"></i><span class="tx"><b>${p[3]}</b><small>${esc(sum[x] || '')}</small></span></button>`).join('')}</nav>
      <div class="ex-setmain">${box(n, ic, color, ti, sub, bodyHtml, true)}
        <div class="ex-subnav">${k > 0 ? `<button class="btn btn-outline-secondary" data-st="${k}"><i class="bi bi-arrow-right"></i> ${parts[k - 1][3]}</button>` : '<span></span>'}
        ${k < parts.length - 1 ? `<button class="btn btn-outline-primary" data-st="${k + 2}">القسم التالي: ${parts[k + 1][3]} <i class="bi bi-arrow-left"></i></button>` : `<button class="btn btn-ex" id="ex-setdone">انتهيت — ولّد الجدول <i class="bi bi-magic"></i></button>`}</div></div></div>`;

  }
  function draftsView() {
    return `<div class="ex-set">
      ${box(1, 'bi-save-fill', '#0b4a66', 'حفظ نسخة', 'احفظ الجدول الحالي قبل تجربة تعديلات أخرى', `
        <div class="ex-add"><input class="form-control" id="ex-dname" placeholder="اسم النسخة، مثل: مسودة 1"><button class="btn btn-ex" id="ex-dsave"><i class="bi bi-save"></i> حفظ</button></div>
        <ul class="ex-drafts">${S.drafts.map((d, k) => `<li class="${S.approved === d.name ? 'app' : ''}"><i class="bi ${S.approved === d.name ? 'bi-patch-check-fill' : 'bi-file-earmark-text'}"></i><span><b>${esc(d.name)}</b><small>${esc(d.at)} · ${d.n} مقرر</small></span>
          ${S.approved === d.name ? '<span class="bdg green">معتمدة</span>' : ''}<span class="acts"><button class="btn btn-sm btn-outline-primary" data-dload="${k}"><i class="bi bi-folder2-open"></i> فتح</button><button class="btn btn-sm btn-outline-success" data-dapp="${k}"><i class="bi bi-patch-check"></i> ${S.approved === d.name ? 'إلغاء الاعتماد' : 'اعتماد'}</button><button class="btn btn-sm btn-outline-danger" data-ddel="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></span></li>`).join('') || '<li class="empty">لا نسخ محفوظة بعد.</li>'}</ul>`)}
      ${box(2, 'bi-share-fill', '#6d28d9', 'المشاركة مع اللجنة', 'ملف واحد يحمل الجدول وكل الإعدادات', `
        <p>صدّر الخطة كملف وأرسله لأعضاء اللجنة؛ يفتحونه هنا بـ«استيراد» ليروا الجدول نفسه ويعدّلوا عليه.</p>
        <div class="ex-acts"><button class="btn btn-outline-primary" id="ex-export"><i class="bi bi-download"></i> تصدير ملف الخطة</button>
        <label class="btn btn-outline-primary mb-0"><i class="bi bi-upload"></i> استيراد ملف<input type="file" id="ex-import" accept=".json" hidden></label></div>
        <hr><button class="btn btn-outline-danger" id="ex-reset"><i class="bi bi-trash"></i> بدء خطة جديدة</button>`)}</div>`;
  }

  // ---------- render & events ----------
  function render() {
    const st = stats();
    PROB = new Set(st.is.flatMap(x => x.cs).concat(st.seat.unseated.map(u => u.c.i), st.seat.short.map(u => u.c.i)));
    const body = tab === 'grid' ? gridView(st) : tab === 'check' ? checkView(st) : tab === 'out' ? outView_() : tab === 'set' ? setView() : draftsView();
    const y = window.scrollY, focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f;
    $(APP).innerHTML = head(st) + `<div class="ex-body">${body}</div>` + navBtns();
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
    const by = {}, who = {}, mine = {}, sec = {}, names = {};
    rows.forEach(r => {
      const id = String(r[H.id] == null ? '' : r[H.id]).trim(), code = String(r[H.code] == null ? '' : r[H.code]).trim().replace(/\.0$/, '');
      if (!/^\d{4,12}$/.test(id) || !/^\d{4,8}$/.test(code) || (known && !known.has(code))) return;
      (by[id] = by[id] || new Set()).add(code);
      const w = who[id] = who[id] || { name: '' };
      if (H.name >= 0 && r[H.name]) w.name = String(r[H.name]).trim();
      if (H.major >= 0 && r[H.major]) w.major = String(r[H.major]).trim();
      const sn = H.sec >= 0 && r[H.sec] != null && String(r[H.sec]).trim() !== '' ? String(+r[H.sec] || String(r[H.sec]).trim()) : '';
      (mine[code] = mine[code] || {})[id] = sn;
      if (sn) { const o = sec[code] = sec[code] || {}; o[sn] = (o[sn] || 0) + 1; }
      if (H.cname >= 0 && r[H.cname]) names[code] = names[code] || String(r[H.cname]).trim();
    });
    return { by, sec, fac: {}, who, mine, names };
  }
  const tableOf = (file, buf) => /\.(csv|txt)$/i.test(file.name) ? Promise.resolve(decode(buf).replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, ''))))
    : loadXLSX().then(() => { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); });
  // templates with clear column names (Excel; the instructions sheet explains each column)
  const TPL = {
    reg: { file: 'نموذج_كشف_التسجيل.xlsx', cols: ['رقم الطالب', 'اسم الطالب', 'رمز المادة', 'اسم المادة', 'الشعبة', 'التخصص'],
      ex: [['202410001', 'مثال: أحمد محمد علي', '601222', 'تراكيب البيانات والخوارزميات', '1', 'علم الحاسوب'], ['202410001', 'مثال: أحمد محمد علي', '603385', 'إدارة قواعد البيانات', '2', 'علم الحاسوب']],
      help: [['رقم الطالب', 'إجباري', 'الرقم الجامعي كما في نظام التسجيل'], ['اسم الطالب', 'اختياري', 'يظهر في كشوف الحضور فقط، ولا يُحفظ'], ['رمز المادة', 'إجباري', 'رمز المقرر كما في الجدول الدراسي، مثل 601222'],
        ['اسم المادة', 'اختياري', 'للتوضيح'], ['الشعبة', 'اختياري', 'رقم الشعبة؛ يوزّع الطلبة على القاعات حسب شعبهم'], ['التخصص', 'اختياري', 'يظهر في كشوف الحضور']] },
    mk: { file: 'نموذج_الامتحان_التكميلي.xlsx', cols: ['رقم الطالب', 'اسم الطالب', 'رمز المادة', 'اسم المادة', 'الشعبة', 'التخصص', 'ملاحظات'],
      ex: [['202310045', 'مثال: سارة خالد يوسف', '601281', 'قواعد البيانات (1)', '2', 'علم الحاسوب', 'غياب بعذر عن النهائي'], ['202210133', 'مثال: محمد سامي حسن', '601222', 'تراكيب البيانات والخوارزميات', '1', 'هندسة البرمجيات', '']],
      help: [['رقم الطالب', 'إجباري', 'الرقم الجامعي'], ['اسم الطالب', 'اختياري', 'يظهر في كشوف الحضور فقط، ولا يُحفظ'], ['رمز المادة', 'إجباري', 'المقرر الذي للطالب فيه امتحان تكميلي؛ صف لكل طالب ومقرر'],
        ['اسم المادة', 'مُستحسن', 'يلزم إن لم يكن المقرر مطروحاً هذا الفصل'], ['الشعبة', 'اختياري', 'رقم الشعبة'], ['التخصص', 'اختياري', 'يظهر في كشوف الحضور'], ['ملاحظات', 'اختياري', 'مثل سبب التأجيل']] } };
  function downloadTemplate(k) {
    const t = TPL[k];
    loadXLSX().then(() => {
      const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([t.cols].concat(t.ex));
      ws['!cols'] = t.cols.map(c => ({ wch: /اسم/.test(c) ? 30 : 16 })); ws['!views'] = [{ RTL: true }];
      t.cols.forEach((c, j) => { const a = XLSX.utils.encode_cell({ r: 0, c: j }); ws[a].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '901D23' } }, alignment: { horizontal: 'center' } }; });
      t.ex.forEach((r, i) => r.forEach((v, j) => { const a = XLSX.utils.encode_cell({ r: i + 1, c: j }); ws[a].s = { font: { color: { rgb: '8A8A8A' }, italic: true } }; ws[a].t = 's'; }));
      XLSX.utils.book_append_sheet(wb, ws, 'الطلبة');
      const h = XLSX.utils.aoa_to_sheet([['العمود', 'إجباري؟', 'الشرح']].concat(t.help).concat([[], ['احذف صفّي المثال واكتب بياناتك: صف لكل طالب في كل مقرر. لا تغيّر أسماء الأعمدة.']]));
      h['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 60 }]; h['!views'] = [{ RTL: true }];
      ['A1', 'B1', 'C1'].forEach(a => { h[a].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0B4A66' } } }; });
      XLSX.utils.book_append_sheet(wb, h, 'تعليمات');
      XLSX.writeFile(wb, t.file);
    }).catch(() => { U.download(t.file.replace('.xlsx', '.csv'), '﻿' + [t.cols].concat(t.ex).map(r => r.join(',')).join('\r\n'), 'text/csv;charset=utf-8'); });
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
      const rowsP = /\.(csv|txt)$/i.test(file.name) ? Promise.resolve(decode(buf).replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, ''))))
        : loadXLSX().then(() => { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); });
      return rowsP.then(rows => {
        const H = headerMap(rows);
        if (H && H.id >= 0 && H.code >= 0) return fromTable(rows.slice(H.row + 1), H, known);
        const w = Math.max(...rows.slice(0, 50).map(r => r.length)); let codeCol = -1, best = 0;
        for (let j = 0; j < w; j++) { const n = rows.slice(0, 300).filter(r => known.has(String(r[j] || '').trim())).length; if (n > best) { best = n; codeCol = j; } }
        if (codeCol < 0) throw new Error('لم أجد عموداً فيه رموز مواد معروفة. استخدم النموذج (زر «تنزيل النموذج»).');
        let stuCol = -1; best = 0;
        for (let j = 0; j < w; j++) { if (j === codeCol) continue; const n = rows.slice(0, 300).filter(r => /^\d{6,10}$/.test(String(r[j] || '').trim())).length; if (n > best) { best = n; stuCol = j; } }
        if (stuCol < 0) stuCol = codeCol === 0 ? 1 : 0;
        return fromTable(rows, { id: stuCol, code: codeCol, name: -1, sec: -1, major: -1, cname: -1 }, known);
      });
    }).then(({ by, sec, fac, who, mine }) => {
      sec = sec || {};
      REGMEM = who && mine && Object.keys(who).length ? { who, mine, file: file.name } : null;   // names stay in this page's memory only
      const studs = Object.keys(by); if (!studs.length) throw new Error('لم أجد طلبة ومقررات معروفة في الملف.');
      const agg = {}, n = {}; let pairs = 0;
      studs.forEach(st => { const set = by[st]; pairs += set.size; set.forEach(c => { n[c] = (n[c] || 0) + 1; }); if (set.size < 2) return; const k = [...set].sort().join(','); agg[k] = (agg[k] || 0) + 1; });
      S.reg = Object.entries(agg).map(([k, w]) => ({ c: k.split(','), w })); S.regN = n; S.regSec = sec;
      const fc = {}; Object.values(fac).forEach(f => { fc[f] = (fc[f] || 0) + 1; });
      const facs = Object.entries(fc).sort((a, b) => b[1] - a[1]);
      S.regInfo = `${file.name}: ${studs.length.toLocaleString('ar')} طالباً، ${pairs.toLocaleString('ar')} تسجيلاً في ${Object.keys(n).length} مقرراً` + (facs.length ? ` · ${facs.length === 1 ? 'كلية ' + facs[0][0] : facs.length + ' كليات'}` : '');
      S.regAt = new Date().toISOString().slice(0, 10);
      if (WANT === 'lists') { WANT = null; setTimeout(printLists, 300); }
      if (S.src === 'plans') S.src = 'both';
      rebuild();
    }).catch(e => { if (note) note.textContent = ''; alert('تعذّرت قراءة الكشف: ' + (e.message || e)); });
  }
  // the coordinator's list (one row per course): رمز المادة | اسم المادة | المنسق | قاعة / مختبر | عدد القاعات او المختبرات | ملاحظات
  function readReq(file) {
    file.arrayBuffer().then(buf => /\.(csv|txt)$/i.test(file.name) ? decode(buf).replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, '')))
      : loadXLSX().then(() => { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); })).then(rows => {
      const hi = rows.findIndex(r => r.some(v => /رمز/.test(String(v)))); if (hi < 0) throw new Error('لم أجد صف العناوين (عمود «رمز المادة»).');
      const H = rows[hi].map(v => String(v || '').replace(/\s+/g, ' ').trim()), col = re => H.findIndex(h => re.test(h));
      const jc = col(/رمز/), jo = col(/منسق|مدرس/), jt = col(/قاعة\s*\/\s*مختبر|نوع/), jn = col(/عدد/), jx = col(/ملاحظ/);
      const req = S.req = S.req || {}; let n = 0;
      rows.slice(hi + 1).forEach(r => {
        const code = String(r[jc] || '').trim(); if (!/^\d{5,8}$/.test(code)) return;
        const tt = String(jt >= 0 ? r[jt] : ''), nn = String(jn >= 0 ? r[jn] : ''), note = String(jx >= 0 ? r[jx] : '').trim();
        const q = req[code] = req[code] || {};
        q.type = /مختبر|محوسب/.test(tt + ' ' + note) ? LAB : /قاع|ورق/.test(tt + ' ' + note) ? HALL : q.type || '';
        const m = nn.match(/\d+/); q.rooms = m ? +m[0] : /مختبرين|قاعتين/.test(nn + tt) ? 2 : 0;
        const pm = note.match(/(\d+)\s*مراقب|مراقب\S*\s*(\d+)|زملاء\D*(\d+)/); if (pm) q.proc = +(pm[1] || pm[2] || pm[3]);
        if (jo >= 0 && r[jo]) q.coord = String(r[jo]).trim(); q.note = note; n++;
      });
      if (!n) throw new Error('لا توجد صفوف برموز مواد.');
      alert(`قُرئت متطلبات ${n} مقرراً من ${file.name}.`); rebuild();
    }).catch(e => alert('تعذّرت قراءة الملف: ' + (e.message || e)));
  }
  function wire() {
    const app = $(APP);
    let tmr;
    app.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f === 'q' || t.dataset.f === 'cq' || t.dataset.f === 'pq') { F()[t.dataset.f] = t.value; clearTimeout(tmr); tmr = setTimeout(() => { save(); render(); }, 250); }
    });
    app.addEventListener('click', e => {
      const t = e.target.closest('button,[data-c],.ex-cell,[data-tab],[data-go],th[data-sort]'); if (!t) return;
      if (t.id === 'ex-setdone') { S.setupDone = true; save(); tab = 'grid'; render(); if (!C.some(c => c.s >= 0) && C.length) busy(() => solve(false)); window.scrollTo(0, 0); return; }
      if (t.dataset.tab) { tab = t.dataset.tab; sel = null; if (tab === 'out' && LIVE === null) liveCheck(); render(); if (t.closest('.ex-nav')) window.scrollTo(0, 0); return; }
      if (t.dataset.st) { S.setTab = +t.dataset.st; save(); render(); const m = app.querySelector('.ex-setwrap'); if (m && m.getBoundingClientRect().top < 0) m.scrollIntoView({ behavior: 'smooth' }); return; }
      if (t.dataset.fk) { const f = F(), k = t.dataset.fk, v = t.dataset.fv; f[k] = f[k] === v ? '' : v; if (k === 'fac') f.dept = ''; save(); render(); return; }
      if (t.dataset.gv) { S.gview = t.dataset.gv; save(); render(); return; }
      if (t.dataset.ov) { outView = t.dataset.ov; render(); return; }
      if (t.dataset.sort) { const k = t.dataset.sort; sortD = sortK === k ? -sortD : 1; sortK = k; render(); return; }
      if (t.hasAttribute('data-fclear')) { const cq = F().cq; S.flt = { cq }; save(); render(); return; }
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
      if (t.id === 'ex-plists') { if (!REGMEM) { WANT = 'lists'; $('#ex-reg2').click(); } else printLists(); return; }
      if (t.id === 'ex-psheets') return printProctors();
      if (t.id === 'ex-prep') return procReport();
      if (t.id === 'ex-publish') return publish();
      if (t.id === 'ex-unpub') { unpublish(); return; }
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
      if (t.hasAttribute('data-addlabs')) { const add = labRooms(new Set(rooms().map(r => r.n))); if (!add.length) alert('كل مختبرات الكلية موجودة في القائمة.'); else { S.rooms = rooms().concat(add); rebuild(); } return; }
      if (t.dataset.inclall != null) { const on = t.dataset.inclall === '1'; TT.sections.filter(s => inFac(s.faculty)).forEach(s => { if (on) delete S.excl[s.code]; else S.excl[s.code] = 1; }); rebuild(); return; }
      if (t.dataset.tpl) return downloadTemplate(t.dataset.tpl);
      if (t.dataset.exd) { const ps = pool()[t.dataset.exd] || [], L = (S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean), anyOn = ps.some(p => !p.off);
        ps.forEach(p => { const i = L.indexOf(p.n); if (anyOn && i < 0) L.push(p.n); if (!anyOn && i >= 0) L.splice(i, 1); }); S.noProc = L.join('\n'); rebuild(); return; }
      if (t.dataset.exm) { const n = t.dataset.exm, L = (S.noProc || '').split(/\n/).map(x => x.trim()).filter(Boolean), i = L.indexOf(n); i >= 0 ? L.splice(i, 1) : L.push(n); S.noProc = L.join('\n'); rebuild(); return; }
      if (t.dataset.pfrm) { const [code, room, n] = t.dataset.pfrm.split('|'), key = code + '|' + room, cur = curProc(key); S.procFix[key] = cur.filter(x => x !== n); save(); render(); return; }
      if (t.dataset.pfauto) { delete S.procFix[t.dataset.pfauto]; save(); render(); return; }
      if (t.hasAttribute('data-pfall')) { if (confirm('إلغاء كل التعديلات اليدوية على المراقبين؟')) { S.procFix = {}; save(); render(); } return; }
      if (t.hasAttribute('data-clrmk')) { if (confirm('حذف قائمة التكميلي؟')) { S.mk = null; S.slot = {}; S.pins = {}; rebuild(); } return; }
      if (t.hasAttribute('data-clrreq')) { if (confirm('مسح متطلبات كل المقررات؟')) { S.req = {}; rebuild(); } return; }
      if (t.hasAttribute('data-clrreg')) { S.reg = null; S.regN = null; S.regSec = null; S.regInfo = ''; S.src = 'plans'; rebuild(); return; }
      if (t.id === 'ex-dsave') { const n = ($('#ex-dname').value || '').trim() || `نسخة ${S.drafts.length + 1}`; S.drafts.unshift({ name: n, at: new Date().toLocaleString('ar-JO'), n: C.length, slot: { ...S.slot }, pins: { ...S.pins } }); save(); render(); return; }
      if (t.dataset.dload != null) { const d = S.drafts[+t.dataset.dload]; push(); S.slot = { ...d.slot }; S.pins = { ...d.pins }; tab = 'grid'; rebuild(); return; }
      if (t.dataset.dapp != null) { const d = S.drafts[+t.dataset.dapp]; S.approved = S.approved === d.name ? null : d.name; S.slot = { ...d.slot }; S.pins = { ...d.pins }; rebuild(); return; }
      if (t.dataset.ddel != null) { if (confirm('حذف هذه النسخة؟')) { S.drafts.splice(+t.dataset.ddel, 1); save(); render(); } return; }
      if (t.id === 'ex-export') { U.download(`خطة_${title()}.json`.replace(/\s+/g, '_'), JSON.stringify(S), 'application/json'); return; }
      if (t.id === 'ex-reset') { if (confirm('بدء خطة جديدة؟ ستُحذف الخطة الحالية (تبقى النسخ المحفوظة).')) { const d = S.drafts; S = fresh(S.type); S.drafts = d; migrate(); tab = 'set'; rebuild(); } }
    });
    app.addEventListener('change', e => {
      const t = e.target, k = t.dataset.k;
      if (t.dataset.f && t.dataset.f !== 'q' && t.dataset.f !== 'cq' && t.dataset.f !== 'pq') { F()[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f === 'fac') F().dept = ''; save(); render(); return; }
      if (t.dataset.mv != null) { move(+t.dataset.mv, +t.value); return; }
      if (t.dataset.ty) { const d = S.drafts, f = fresh(t.dataset.ty); Object.assign(S, { type: t.dataset.ty, periods: f.periods, days: f.days, busy: f.busy, slot: {}, pins: {}, approved: null }); S.drafts = d; rebuild(); return; }
      if (t.hasAttribute('data-facall')) { S.facs = t.checked ? [] : ['تكنولوجيا المعلومات']; S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.fac) { const x = t.dataset.fac; S.facs = t.checked ? [...new Set(S.facs.concat(x))] : S.facs.filter(y => y !== x); S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.pfadd != null && t.value) { const key = t.dataset.pfadd; S.procFix[key] = curProc(key).concat(t.value); save(); render(); return; }
      if (t.dataset.pfswap != null && t.value) { const key = t.dataset.pfswap, cur = curProc(key); cur[0] = t.value; S.procFix[key] = cur; save(); render(); return; }
      if (t.dataset.pinc) { const v = t.value; if (v === '') delete S.pins[t.dataset.pinc]; else { S.pins[t.dataset.pinc] = +v; S.slot[t.dataset.pinc] = +v; } rebuild(); return; }
      if (k) { S[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(+t.min || 0, +t.value || 0) : t.value; rebuild(); return; }
      if (t.dataset.off != null) { const i = +t.dataset.off; S.off = t.checked ? S.off.concat(i) : S.off.filter(x => x !== i); rebuild(); return; }
      if (t.dataset.dw != null) { const w = S.dayWin[t.dataset.dw] = S.dayWin[t.dataset.dw] || {}; w[t.dataset.e] = t.value; if (!w.from && !w.to) delete S.dayWin[t.dataset.dw]; rebuild(); return; }
      if (t.dataset.p != null) { S.periods[+t.dataset.p][+t.dataset.e] = t.value; rebuild(); return; }
      if (t.dataset.pm) { S.procMode = t.dataset.pm; rebuild(); return; }
      if (t.dataset.src) { S.src = t.dataset.src; rebuild(); return; }
      if (t.dataset.ron != null) { rooms()[+t.dataset.ron].on = t.checked; rebuild(); return; }
      if (t.dataset.rn != null) { rooms()[+t.dataset.rn].n = t.value.trim(); rebuild(); return; }
      if (t.dataset.qt != null || t.dataset.qn != null || t.dataset.qp != null || t.dataset.qx != null) {
        const code = t.dataset.qt ?? t.dataset.qn ?? t.dataset.qp ?? t.dataset.qx, q = (S.req = S.req || {})[code] = (S.req || {})[code] || {};
        if (t.dataset.qt != null) q.type = t.value; else if (t.dataset.qn != null) q.rooms = Math.max(0, +t.value || 0); else if (t.dataset.qp != null) q.proc = Math.max(0, +t.value || 0); else q.note = t.value.trim();
        if (!q.type && !q.rooms && !q.proc && !q.note && !q.coord) delete S.req[code]; rebuild(); return; }
      if (t.dataset.rt != null) { rooms()[+t.dataset.rt].t = t.value; rebuild(); return; }
      if (t.dataset.rc != null) { rooms()[+t.dataset.rc].c = Math.max(1, +t.value || 1); rebuild(); return; }
      if (t.dataset.incl) { if (t.checked) delete S.excl[t.dataset.incl]; else S.excl[t.dataset.incl] = 1; rebuild(); return; }
      if (t.id === 'ex-reg' && t.files[0]) { readReg(t.files[0]); return; }
      if (t.id === 'ex-mk' && t.files[0]) { readMk(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-reg2' && t.files[0]) { readReg(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-req' && t.files[0]) { readReq(t.files[0]); t.value = ''; return; }
      if (t.id === 'ex-import' && t.files[0]) { t.files[0].text().then(x => { const o = JSON.parse(x); if (!o.type || !o.periods) throw 0; S = o; migrate(); tab = 'grid'; rebuild(); }).catch(() => alert('الملف ليس خطة امتحانات صالحة.')); }
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
  .ex-gate h2 { font-size: 1.35rem; font-weight: 800; margin: 0; } .ex-gate p { color: #5b6b72; margin: 0; } .ex-gate label { text-align: start; font-weight: 700; }
  .ex-gate .err { color: #b42318; } .ex-gate .back { font-size: .9rem; color: #5b6b72; } .ex-gate .rem { font-weight: 400; }
  #ex-app { font-size: 1rem; color: #0f1f26; }
  .btn-ex { background: #901d23; color: #fff; border: 0; font-weight: 700; } .btn-ex:hover, .btn-ex:focus { background: #6f151a; color: #fff; }
  #ex-app .btn { font-weight: 700; }
  /* steps */
  .ex-steps { display: flex; align-items: stretch; gap: .35rem; margin: .6rem 0 .6rem; overflow-x: auto; padding-bottom: 2px; }
  .ex-steps .sep { align-self: center; color: #9aa8ae; font-size: 1.1rem; flex: none; }
  .ex-step { flex: 1 1 0; min-width: 150px; display: flex; gap: .55rem; align-items: center; text-align: start; border: 2px solid #e2e8ec; background: #fff; border-radius: 14px; padding: .55rem .7rem; color: #0f1f26; }
  .ex-step .num { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1.05rem; background: #eef2f4; color: #4a5a61; }
  .ex-step .tx b { display: block; font-size: 1rem; } .ex-step .tx small { display: block; font-size: .82rem; color: #5b6b72; }
  .ex-step.done .num { background: #15803d; color: #fff; } .ex-step.bad .num { background: #b42318; color: #fff; }
  .ex-step.on { border-color: #901d23; background: #fff6f6; box-shadow: 0 4px 14px rgba(144,29,35,.15); } .ex-step.on .num { box-shadow: 0 0 0 3px rgba(144,29,35,.25); }
  .ex-status { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .8rem; }
  .ex-pill { display: inline-flex; gap: .35rem; align-items: center; background: #eef3f6; color: #0b3a50; border-radius: 999px; padding: .28rem .75rem; font-size: .9rem; font-weight: 700; }
  .ex-pill.ok { background: #e4f5e9; color: #15803d; } .ex-pill.bad { background: #fde8e8; color: #b42318; }
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
  .ex-count { font-size: .9rem; color: #4a5a61; } .ex-count b { color: #091b22; font-size: 1.05rem; }
  .ex-switch { display: inline-flex; align-items: center; gap: .35rem; font-weight: 700; font-size: .92rem; cursor: pointer; }
  .ex-switch input { display: none; } .ex-switch span { width: 38px; height: 22px; border-radius: 999px; background: #cbd5da; position: relative; transition: .2s; }
  .ex-switch span::after { content: ''; position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: .2s; } .ex-switch input:checked + span { background: #901d23; } .ex-switch input:checked + span::after { right: 19px; }
  .ex-scope { background: #fff; border: 1px solid #e2e8ec; border-radius: 12px; padding: .35rem .65rem; margin-bottom: .7rem; }
  .ex-scope-row { display: flex; align-items: center; gap: .6rem; padding: .3rem 0; }
  .ex-scope-row + .ex-scope-row { border-top: 1px dashed #e2e8ec; }
  .ex-scope-lb { flex: 0 0 5.2rem; font-weight: 800; color: #091b22; font-size: .95rem; white-space: nowrap; } .ex-scope-lb i { color: #901d23; }
  .ex-scope-hint { color: #6b7a82; font-size: .92rem; }
  .ex-seg { display: flex; flex-wrap: wrap; gap: .3rem; padding: .15rem .05rem; min-width: 0; flex: 1; }
  .ex-lg { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .4rem; background: #f4f6f8; color: #26353c; border: 1px solid #dde3e7; border-radius: 8px; padding: .3rem .7rem; font-size: .92rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s; }
  .ex-lg .d { width: .55rem; height: .55rem; border-radius: 50%; display: inline-block; }
  .ex-lg .k { color: #6b7a82; font-size: .8rem; font-weight: 700; }
  .ex-lg:hover { background: #fff; border-color: #901d23; }
  .ex-lg.on { background: #901d23; border-color: #901d23; color: #fff; } .ex-lg.on .k { color: rgba(255,255,255,.8); } .ex-lg.on .d { box-shadow: 0 0 0 2px #fff; }
  [data-theme=dark] .ex-scope { background: #13232a; border-color: #2c4048; } [data-theme=dark] .ex-lg { background: #1b2e35; color: #e8eef0; border-color: #2c4048; } [data-theme=dark] .ex-scope-lb { color: #e8eef0; }
  @media (max-width: 700px) { .ex-scope-row { flex-direction: column; align-items: stretch; gap: .25rem; } .ex-scope-lb { flex: none; } .ex-seg { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .ex-lg { font-size: .88rem; padding: .28rem .6rem; } }
  .ex-hint { background: #fff8e6; border: 1px solid #f3d38b; border-radius: 12px; padding: .55rem .8rem; font-size: .95rem; margin-bottom: .6rem; display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; } .ex-hint.soft { background: #f1f6f9; border-color: #d8e3ea; }
  .ex-hint > i { font-size: 1.15rem; color: #9a5b00; } .ex-hint.soft > i { color: #0b4a66; } .ex-hint span[class^=h-] { padding: .05rem .5rem; border-radius: 6px; font-weight: 700; font-size: .85rem; }
  .ex-note { font-size: .93rem; color: #3d4d54; background: #f1f6f9; border-radius: 10px; padding: .45rem .7rem; }
  /* matrix */
  .ex-grid-wrap { overflow-x: auto; } .ex-grid { width: 100%; border-collapse: separate; border-spacing: 6px; min-width: 640px; table-layout: fixed; }
  .ex-grid thead th { background: #091b22; color: #fff; border-radius: 10px; padding: .5rem; text-align: center; } .ex-grid .pn { font-size: 1rem; font-weight: 800; } .ex-grid th small { display: block; font-weight: 400; opacity: .85; font-size: .88rem; }
  .ex-grid th.day { background: #eef2f4; color: #091b22; border-radius: 10px; width: 92px; text-align: center; } .ex-grid th.day b { display: block; font-size: 1rem; } .ex-grid th.day small { font-size: .88rem; color: #4a5a61; } .ex-grid .corner { width: 92px; }
  .ex-cell { background: #fbfcfd; border: 1.5px dashed #d3dbe0; border-radius: 12px; padding: 5px; vertical-align: top; min-height: 80px; height: 84px; cursor: pointer; }
  .ex-cell .cap { font-size: .8rem; color: #5b6b72; margin-bottom: 3px; } .ex-cell .cap.hi { color: #9a5b00; font-weight: 700; } .ex-cell .cap.over { color: #b42318; font-weight: 800; }
  .ex-cell .more, .ex-day .more { font-size: .8rem; color: #6b7a80; text-align: center; }
  .ex-cell.h-good, span.h-good { background: #d3f0dc; } .ex-cell.h-ok, span.h-ok { background: #eef6f0; } .ex-cell.h-warn, span.h-warn { background: #ffecc7; } .ex-cell.h-bad, span.h-bad { background: #fbd5d5; }
  .ex-card { background: var(--b); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); border-inline-start: 5px solid var(--c); border-radius: 9px; padding: 5px 7px; margin: 4px 0; line-height: 1.35; cursor: grab; user-select: none; }
  .ex-card .t { display: flex; gap: .3rem; align-items: center; } .ex-card .t b { color: var(--c); font-size: .98rem; } .ex-card .t .wr { color: #b42318; margin-inline-start: auto; }
  .ex-card .n { font-size: .9rem; font-weight: 600; color: #0f1f26; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ex-card .m { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; } .ex-card .bd { background: #fff; border-radius: 6px; padding: 0 .35rem; font-size: .78rem; font-weight: 700; color: #3d4d54; }
  .ex-card.sel { outline: 3px solid #091b22; box-shadow: 0 4px 12px rgba(0,0,0,.25); } .ex-card.bad { box-shadow: 0 0 0 2px #e05252; } .ex-card.pinned { background-image: linear-gradient(135deg, rgba(0,0,0,.04) 25%, transparent 25%, transparent 50%, rgba(0,0,0,.04) 50%, rgba(0,0,0,.04) 75%, transparent 75%); background-size: 10px 10px; }
  .ex-pool { display: flex; flex-wrap: wrap; gap: 6px; height: auto; } .ex-pool .ex-card { width: 200px; }
  .ex-busy { position: sticky; top: 76px; z-index: 5; background: #091b22; color: #fff; border-radius: 12px; padding: .55rem 1rem; margin-bottom: .6rem; display: inline-flex; gap: .55rem; align-items: center; font-weight: 700; }
  .ex-start, .ex-empty { text-align: center; padding: 2.5rem 1rem; border: 2px dashed #e2c6c8; border-radius: 18px; background: #fffafa; }
  .ex-start > i { font-size: 3rem; color: #901d23; } .ex-start h3 { font-weight: 800; margin: .5rem 0; } .ex-start p { font-size: 1.05rem; color: #3d4d54; max-width: 620px; margin: 0 auto 1rem; }
  /* days view */
  .ex-days-v { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: .8rem; }
  .ex-day { border: 1px solid #e2e8ec; border-radius: 16px; overflow: hidden; background: #fff; }
  .ex-day header { display: flex; flex-wrap: wrap; gap: .4rem .7rem; align-items: center; background: linear-gradient(90deg, #091b22, #163746); color: #fff; padding: .6rem .9rem; }
  .ex-day .dw { font-size: 1.15rem; font-weight: 800; } .ex-day .dd { opacity: .85; } .ex-day header .bdg { background: rgba(255,255,255,.15); color: #fff; }
  .ex-per { display: grid; grid-template-columns: 96px 1fr; gap: .5rem; border: 0; border-bottom: 1px solid #edf1f3; border-radius: 0; height: auto; min-height: 0; background: #fff; padding: .5rem .7rem; }
  .ex-per .pt b { display: block; color: #0f766e; } .ex-per .pt span { font-size: .88rem; color: #4a5a61; } .ex-per .none { color: #9aa8ae; }
  .ex-row { display: grid; grid-template-columns: auto 1fr auto; gap: .2rem .5rem; align-items: center; background: var(--b); border-inline-start: 5px solid var(--c); border-radius: 9px; padding: .35rem .55rem; margin-bottom: 4px; cursor: grab; }
  .ex-row .cd { font-weight: 800; color: var(--c); } .ex-row .nm { font-weight: 600; } .ex-row .nm small { display: block; font-weight: 400; color: #5b6b72; font-size: .82rem; }
  .ex-row .rm { grid-column: 1 / -1; font-size: .84rem; color: #3d4d54; } .ex-row.bad { box-shadow: 0 0 0 2px #e05252; } .ex-row.sel { outline: 3px solid #091b22; }
  /* list / tables */
  .ex-tbl { border: 1px solid #e2e8ec; border-radius: 12px; } .ex-tbl table { margin: 0; font-size: .95rem; }
  .ex-tbl thead th { background: #091b22; color: #fff; font-size: .9rem; white-space: nowrap; position: sticky; top: 0; } .ex-tbl th.sortable { cursor: pointer; } .ex-tbl th.sortable:hover { background: #163746; }
  .ex-tbl tr.bad td { background: #fff4f4; }
  .ex-tbl td { vertical-align: middle; padding: .6rem .55rem; } .ex-tbl tr.nd td { border-top: 3px solid #901d23; }
  .ex-tbl .c-day, .ex-tbl .c-date, .ex-tbl .c-time, .ex-tbl .c-code, .ex-tbl .c-num { white-space: nowrap; width: 1%; }
  .ex-tbl .c-name { min-width: 170px; } .ex-tbl .c-rooms { min-width: 220px; } .ex-tbl .c-ppl { min-width: 220px; }
  .ex-dw { color: #091b22; } .ex-dt { font-weight: 800; color: #0b4a66; font-size: 1rem; } .ex-dt small { display: block; font-weight: 400; color: #6b7a80; font-size: .75rem; }
  .ex-tm { display: inline-flex; gap: .3rem; align-items: center; background: #e0f4f1; color: #0f766e; border-radius: 8px; padding: .15rem .5rem; font-weight: 700; font-size: .88rem; }
  .ex-nm { font-size: .97rem; }
  .ex-chips { display: flex; flex-wrap: wrap; gap: .3rem; }
  .ex-rm { display: inline-flex; align-items: center; gap: .3rem; background: #eef6f0; color: #14532d; border: 1px solid #cfe8d6; border-radius: 9px; padding: .15rem .5rem; font-size: .88rem; }
  .ex-rm .n { background: #15803d; color: #fff; border-radius: 999px; padding: 0 .4rem; font-size: .78rem; font-weight: 700; } .ex-rm small { color: #4a5a61; } .ex-rm.bad { background: #fde8e8; color: #b42318; border-color: #f5c2c2; }
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
  .ex-kpi i { grid-row: span 2; font-size: 1.7rem; } .ex-kpi b { font-size: 1.55rem; line-height: 1.1; } .ex-kpi span { font-size: .9rem; color: #3d4d54; }
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
  .ex-ri .when, .ex-ri .aff { font-size: .92rem; color: #3d4d54; }
  .ex-ri .cs { list-style: none; padding: 0; margin: .5rem 0; display: grid; gap: .25rem; } .ex-ri .cs li { border-inline-start: 4px solid var(--c); padding-inline-start: .55rem; font-size: .95rem; } .ex-ri .cs small { color: #5b6b72; font-size: .85rem; }
  .ex-ri .who { font-size: .9rem; color: #0b4a66; } .ex-ri .why { font-size: .93rem; color: #2f3f46; margin: .35rem 0; }
  .ex-ri footer { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; border-top: 1px dashed #e3e8eb; padding-top: .45rem; }
  .ex-ri .fix { font-size: .93rem; font-weight: 700; color: #15803d; } .ex-ri .fix.muted { color: #6b7a80; font-weight: 400; }
  .ex-empty.warn { border-color: #f3d38b; background: #fffaf0; } .ex-empty > i { font-size: 2.4rem; display: block; color: #15803d; } .ex-empty { color: #15803d; font-weight: 700; font-size: 1.1rem; }
  /* settings */
  .ex-set { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1rem; }
  .ex-setwrap { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 1rem; align-items: start; }
  .ex-setnav { display: flex; flex-direction: column; gap: .35rem; position: sticky; top: 80px; }
  .ex-sn { display: flex; gap: .55rem; align-items: center; text-align: start; border: 1.5px solid #e2e8ec; background: #fff; border-radius: 12px; padding: .55rem .65rem; color: #0f1f26; }
  .ex-sn .bn { width: 26px; height: 26px; border-radius: 50%; background: #eef2f4; color: #4a5a61; display: grid; place-items: center; font-weight: 800; font-size: .85rem; flex: none; }
  .ex-sn > i { font-size: 1.3rem; color: var(--a); } .ex-sn .tx b { display: block; font-size: 1rem; } .ex-sn .tx small { display: block; font-size: .8rem; color: #5b6b72; }
  .ex-sn:hover { border-color: var(--a); } .ex-sn.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 8%, #fff); box-shadow: inset -4px 0 0 var(--a); } .ex-sn.on .bn { background: var(--a); color: #fff; }
  .ex-setmain { min-width: 0; } .ex-setmain .ex-box { width: 100%; }
  .ex-subnav { display: flex; justify-content: space-between; gap: .5rem; flex-wrap: wrap; margin-top: .8rem; }
  @media (max-width: 900px) { .ex-setwrap { grid-template-columns: 1fr; } .ex-setnav { position: static; flex-direction: row; overflow-x: auto; padding-bottom: 4px; } .ex-sn { flex: none; } .ex-sn .tx small { display: none; } }
  [data-theme=dark] .ex-sn { background: #13232a; color: #e8eef0; border-color: #2c4048; }
  .ex-box { border: 1px solid #e2e8ec; border-radius: 18px; background: #fff; overflow: hidden; box-shadow: 0 2px 10px rgba(9,27,34,.05); } .ex-box.wide { grid-column: 1 / -1; }
  .ex-box > header { display: flex; gap: .6rem; align-items: center; padding: .75rem 1rem; background: color-mix(in srgb, var(--a) 9%, #fff); border-bottom: 3px solid var(--a); }
  .ex-box > header .bn { width: 30px; height: 30px; border-radius: 50%; background: var(--a); color: #fff; display: grid; place-items: center; font-weight: 800; flex: none; }
  .ex-box > header > i { font-size: 1.5rem; color: var(--a); } .ex-box h4 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #091b22; } .ex-box header small { color: #4a5a61; font-size: .9rem; }
  .ex-box .bb { padding: .9rem 1rem; display: flex; flex-direction: column; gap: .7rem; }
  .ex-fld { display: flex; flex-direction: column; gap: .3rem; margin: 0; } .ex-fld > span { font-weight: 700; font-size: .95rem; } .ex-fld small { color: #5b6b72; font-size: .85rem; }
  .ex-set .row2, .ex-setwrap .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; align-items: start; }
  .ex-types, .ex-srcs { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .45rem; }
  .ex-type { border: 2px solid #e2e8ec; border-radius: 12px; padding: .6rem; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: .15rem; margin: 0; }
  .ex-type input { display: none; } .ex-type i { font-size: 1.5rem; color: #6b7a80; } .ex-type b { font-size: .92rem; } .ex-type small { font-size: .8rem; color: #5b6b72; }
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
  .ex-pubsteps { padding-inline-start: 1.3rem; margin-bottom: .8rem; } .ex-pubsteps li { margin-bottom: .25rem; }
  .ex-pubsteps kbd { background: #eef2f6; color: #222; border: 1px solid #c9d3dd; padding: 0 .35rem; font-size: .85em; }
  .ex-pubst { margin-top: .8rem; padding: .6rem .8rem; border-radius: 10px; background: #f4f6f8; color: #445; font-size: .92rem; }
  .ex-pubst.wait { background: #fff8e6; color: #6a4b00; border: 1px solid #f0d58c; } .ex-pubst.ok { background: #e9f7ef; color: #135d32; border: 1px solid #a8dcbc; }
  .ex-srcs.two { grid-template-columns: 1fr 1fr; }
  .ex-pool2 { border: 1px solid #ecd3e0; background: #fdf8fb; border-radius: 14px; padding: .75rem .8rem; margin-top: .8rem; }
  .ex-pool2 .h { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; } .ex-pool2 .h .t { font-weight: 800; color: #9d174d; font-size: 1.08rem; margin-inline-end: .3rem; }
  .ex-pool2 .h input { max-width: 15rem; margin-inline-start: auto; } .ex-pool2 .hint { color: #6b7a82; font-size: .86rem; margin: .4rem 0 .6rem; }
  .ex-pool2 .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: .7rem; align-items: start; }
  .ex-pool2 .dc { background: #fff; border: 1px solid #e8d6e0; border-top: 4px solid #be185d; border-radius: 12px; overflow: hidden; }
  .ex-pool2 .dc header { display: flex; align-items: center; gap: .5rem; padding: .5rem .7rem; background: #fbf1f6; border-bottom: 1px solid #f0dde7; }
  .ex-pool2 .dc header b { flex: 1; color: #091b22; font-size: 1rem; } .ex-pool2 .dc header .n { background: #be185d; color: #fff; border-radius: 999px; padding: 0 .55rem; font-weight: 800; font-size: .85rem; } .ex-pool2 .dc header .n small { opacity: .8; font-weight: 600; }
  .ex-pool2 .dc header .btn { padding: 0; font-size: .8rem; }
  .ex-pool2 .ls { display: grid; grid-template-columns: 1fr; max-height: 20rem; overflow: auto; }
  .ex-pool2 .pr { display: grid; grid-template-columns: 1.3rem minmax(0, 1fr) 2.6rem; align-items: center; gap: .45rem; width: 100%; border: 0; border-bottom: 1px solid #f3edf0; background: #fff; padding: .38rem .7rem; text-align: start; font-size: .93rem; color: #1c2b31; }
  .ex-pool2 .pr:nth-child(even) { background: #fcfafb; } .ex-pool2 .pr:hover { background: #fdeef5; } .ex-pool2 .pr i { color: #15803d; }
  .ex-pool2 .pr .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ex-pool2 .pr .k { justify-self: end; min-width: 2rem; text-align: center; background: #eef2f4; color: #4a5a62; border-radius: 6px; font-size: .78rem; font-weight: 700; padding: .05rem .3rem; }
  .ex-pool2 .pr.off { color: #9aa6ac; } .ex-pool2 .pr.off .nm { text-decoration: line-through; } .ex-pool2 .pr.off i { color: #b42318; }
  [data-theme=dark] .ex-pool2, [data-theme=dark] .ex-pool2 .dc, [data-theme=dark] .ex-pool2 .pr { background: #13232a; border-color: #2c4048; color: #e8eef0; } [data-theme=dark] .ex-pool2 .dc header { background: #1b2e35; } [data-theme=dark] .ex-pool2 .dc header b { color: #e8eef0; }
  .ex-pv-sum { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .5rem; }
  .ex-pv-load { border: 1px solid #e2e8ec; border-radius: 12px; padding: .45rem .65rem; margin-bottom: .6rem; background: #fff; } .ex-pv-load summary { font-weight: 800; cursor: pointer; } .ex-pv-load > div { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .45rem; max-height: 11rem; overflow: auto; }
  .ex-ld { border: 1px solid #dde3e7; border-radius: 8px; padding: .1rem .2rem .1rem .5rem; font-size: .85rem; background: #f7f9fa; } .ex-ld b { display: inline-block; min-width: 1.5rem; text-align: center; background: #0b4a66; color: #fff; border-radius: 6px; margin-inline-start: .35rem; }
  .ex-ld.hi b { background: #b42318; } .ex-ld.lo b { background: #15803d; }
  .ex-pv td { vertical-align: top; } .ex-pv tr.fx td { background: #fffaf0 !important; } .ex-pv .ex-pp { position: relative; } .ex-pv .ex-pp.own { background: #e7f6ec; border-color: #86c99b; } .ex-pv .ex-pp b.c { background: #0b4a66; color: #fff; border-radius: 5px; padding: 0 .3rem; font-size: .75rem; margin-inline-start: .2rem; }
  .ex-pv .ex-pp button { border: 0; background: none; color: #b42318; padding: 0 0 0 .1rem; } .ex-pfsel { min-width: 13rem; }
  .ex-cal3 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.25fr) minmax(0, 1fr); gap: .75rem; align-items: stretch; }
  .ex-cal3 section { border: 1px solid #e2e8ec; border-radius: 12px; padding: .65rem .75rem; background: #fbfcfd; display: flex; flex-direction: column; gap: .35rem; }
  .ex-cal3 h6 { font-weight: 800; color: #0b4a66; margin: 0 0 .2rem; } .ex-cal3 small { color: #6b7a82; } .ex-cal3 .ex-fld { margin: 0; }
  .ex-cal3 .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; align-items: start; }
  .ex-cal3 .calc { border: 1px solid #c9d8e3; background: #eef5fa; border-radius: 8px; padding: .38rem .6rem; font-weight: 800; font-size: 1.1rem; color: #0b4a66; } .ex-cal3 .calc small { font-size: .72rem; font-weight: 600; }
  .ex-wk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; } .ex-wk .ex-chk { justify-content: center; }
  .ex-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) auto; gap: .6rem; margin: .8rem 0; align-items: stretch; }
  .ex-kpis .k { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: .55rem; align-items: center; background: #fff; border: 1px solid #e2e8ec; border-top: 3px solid #0b4a66; border-radius: 12px; padding: .5rem .7rem; }
  .ex-kpis .k i { grid-row: span 2; font-size: 1.45rem; color: #0b4a66; } .ex-kpis .k b { font-size: 1.15rem; color: #091b22; line-height: 1.2; } .ex-kpis .k span { font-size: .8rem; color: #6b7a82; }
  .ex-kpis .k.ex { border-top-color: #901d23; } .ex-kpis .k.ex i, .ex-kpis .k.ex b { color: #901d23; } .ex-kpis .k.hol { border-top-color: #b7791f; } .ex-kpis .k.hol i { color: #b7791f; }
  .ex-kpis .lg { display: flex; flex-direction: column; justify-content: center; gap: .25rem; font-size: .82rem; color: #4a5a62; padding-inline-start: .3rem; } .ex-kpis .lg span { white-space: nowrap; }
  .d { display: inline-block; width: .9rem; height: .9rem; border-radius: 4px; vertical-align: -2px; margin-inline-end: .25rem; } .d.ex { background: #901d23; } .d.off { background: #e5e8eb; } .d.hol { background: repeating-linear-gradient(135deg, #f87171 0 3px, #fee2e2 3px 6px); }
  .ex-calbody { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 22rem); gap: .8rem; align-items: start; }
  .ex-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: .8rem; }
  .ex-month { border: 1px solid #e2e8ec; border-radius: 14px; padding: .65rem .75rem; background: #fff; } .ex-month h6 { text-align: center; font-weight: 800; font-size: 1.1rem; margin: 0 0 .5rem; color: #091b22; }
  .ex-month .g { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; } .ex-month .g > i { text-align: center; font-style: normal; font-weight: 800; color: #4a5a62; font-size: .8rem; padding-bottom: .2rem; border-bottom: 2px solid #eef2f4; }
  .ex-month .g button { border: 0; border-radius: 9px; min-height: 3.3rem; background: #f7f8fa; color: #9aa6ac; padding: .2rem; line-height: 1.1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem; }
  .ex-month .g button b { font-size: 1.05rem; } .ex-month .g button small { font-size: .66rem; } .ex-month .g button.ex { background: #901d23; color: #fff; box-shadow: 0 2px 5px rgba(144,29,35,.25); } .ex-month .g button.ex small { color: #fde2e3; background: rgba(255,255,255,.15); border-radius: 999px; padding: 0 .4rem; }
  .ex-month .g button.off { background: #e9ecef; color: #6b7a82; } .ex-month .g button.hol { background: repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px); color: #b42318; } .ex-month .g button.out { background: transparent; color: #c4ccd1; }
  .ex-month .g button.today { outline: 2px solid #0b4a66; outline-offset: 1px; } .ex-month .g button[data-tgl]:hover { outline: 2px solid #b7791f; }
  .ex-dlist { border: 1px solid #e2e8ec; border-radius: 14px; background: #fff; padding: .6rem .7rem; max-height: 30rem; overflow: auto; } .ex-dlist h6 { font-weight: 800; color: #091b22; margin: 0 0 .4rem; }
  .ex-dlist ol { list-style: none; margin: 0; padding: 0; } .ex-dlist li { display: grid; grid-template-columns: 1.9rem 4.6rem 1fr auto auto; align-items: center; gap: .45rem; padding: .32rem .2rem; border-bottom: 1px solid #f1f3f5; font-size: .92rem; }
  .ex-dlist li.wk { display: block; border: 0; font-size: .78rem; font-weight: 800; color: #0b4a66; padding: .5rem .2rem .15rem; }
  .ex-dlist .no { background: #901d23; color: #fff; border-radius: 7px; text-align: center; font-weight: 800; font-size: .82rem; } .ex-dlist .wd { font-weight: 800; } .ex-dlist .dt { color: #4a5a62; font-variant-numeric: tabular-nums; }
  .ex-dlist .ct { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 0 .5rem; font-size: .78rem; font-weight: 700; white-space: nowrap; } .ex-dlist .ct.mut { background: #f1f3f5; color: #6b7a82; } .ex-dlist .btn { color: #b42318; padding: 0 .2rem; }
  @media (max-width: 1200px) { .ex-cal3 { grid-template-columns: 1fr 1fr; } .ex-cal3 .dur { grid-column: 1 / -1; } .ex-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ex-kpis .lg { grid-column: 1 / -1; flex-direction: row; gap: 1rem; } .ex-calbody { grid-template-columns: 1fr; } }
  @media (max-width: 700px) { .ex-cal3, .ex-cal3 .g3 { grid-template-columns: 1fr; } .ex-kpis { grid-template-columns: 1fr 1fr; } .ex-months { grid-template-columns: 1fr; } .ex-month .g button { min-height: 2.6rem; } .ex-month .g > i { font-size: .62rem; } }
  .ex-what { border: 1px solid #b6e0da; background: #f1fbf9; border-radius: 12px; padding: .65rem .8rem; margin-bottom: .8rem; } .ex-what .q { font-weight: 800; color: #0f766e; font-size: 1.05rem; } .ex-what p { margin: .25rem 0 .5rem; color: #1f3b38; }
  .ex-what ul { margin: .5rem 0 0; padding-inline-start: 1.1rem; color: #35524e; font-size: .9rem; }
  .ex-cap { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; } .ex-cap span { background: #fff; border: 1px solid #b6e0da; border-radius: 8px; padding: .15rem .55rem; } .ex-cap span.t { background: #0f766e; color: #fff; border-color: #0f766e; } .ex-cap i { font-style: normal; color: #0f766e; font-weight: 800; } .ex-cap .avg { background: transparent; border: 0; color: #35524e; }
  .ex-tl { margin-top: .7rem; } .ex-tl .bar { position: relative; height: 3.1rem; background: #eef2f4; border-radius: 10px; overflow: hidden; }
  .ex-tl .win { position: absolute; top: 0; bottom: 0; background: #d5efe9; } .ex-tl .p { position: absolute; top: .3rem; bottom: .3rem; background: #0f766e; color: #fff; border-radius: 7px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .75rem; line-height: 1.1; overflow: hidden; white-space: nowrap; }
  .ex-tl .p.bad { background: #b42318; } .ex-tl .p small { font-size: .68rem; opacity: .9; } .ex-tl .g { position: absolute; top: 1.2rem; height: .7rem; background: repeating-linear-gradient(90deg, #b7791f 0 4px, transparent 4px 8px); }
  .ex-tl .ax { position: relative; height: 1.1rem; } .ex-tl .ax i { position: absolute; transform: translateX(50%); font-style: normal; font-size: .72rem; color: #6b7a82; }
  .ex-tl .lgd { display: flex; flex-wrap: wrap; gap: .8rem; font-size: .8rem; color: #4a5a62; } .d.win { background: #d5efe9; } .d.p { background: #0f766e; } .d.g { background: repeating-linear-gradient(90deg, #b7791f 0 3px, transparent 3px 6px); }
  @media (max-width: 900px) { .ex-cal3 { grid-template-columns: 1fr; } }
  .ex-mk { border: 2px dashed #b7791f; background: #fffaf0; border-radius: 12px; padding: .7rem .85rem; margin-bottom: .8rem; } .ex-mk .h { font-weight: 800; color: #7a4b00; font-size: 1.05rem; } .ex-mk p { margin: .2rem 0 .5rem; color: #5b4a20; }
  .ex-tplbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: #f2f6fb; border: 1px dashed #9db4d0; border-radius: 10px; padding: .45rem .65rem; margin: -.3rem 0 .6rem; } .ex-tplbar > i { color: #0b4a66; } .ex-tplbar span { flex: 1 1 240px; font-size: .92rem; }
  .ex-docs { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; background: #fbf7ef; border: 1px solid #ecdcbc; border-radius: 12px; padding: .55rem .7rem; margin-bottom: .6rem; }
  .ex-docs > b { color: #7a4b00; margin-inline-end: .3rem; } .ex-docs small { flex-basis: 100%; } .ex-docs .btn small { font-size: .7rem; background: #fff3; border: 1px solid currentColor; border-radius: 4px; padding: 0 .25rem; margin-inline-start: .2rem; }
  .ex-reqbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: #f2f6fb; border: 1px dashed #9db4d0; border-radius: 10px; padding: .5rem .65rem; margin-bottom: .6rem; }
  .ex-rt { min-width: 6.5rem; } .ex-rt.lab { background-color: #e6f6f4; border-color: #0f766e; color: #0f766e; font-weight: 700; } .ex-rt.hall { background-color: #eef2ff; border-color: #4f46e5; color: #3730a3; font-weight: 700; }
  .ex-qn { width: 4.6rem; } .ex-qnote { min-width: 9rem; }
  .ex-win { border: 1px solid #f3c9c9; background: #fdf6f6; border-radius: 12px; padding: .6rem .75rem; margin-bottom: .7rem; } .ex-win-h { font-weight: 800; color: #901d23; margin-bottom: .4rem; }
  .ex-win-g { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; } .ex-win-g label span { display: block; font-size: .9rem; font-weight: 700; margin-bottom: .15rem; }
  .ex-win details { margin-top: .5rem; } .ex-win summary { cursor: pointer; font-weight: 700; color: #0b4a66; }
  .ex-win-d { display: grid; gap: .3rem; margin-top: .4rem; } .ex-win-d .r { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto minmax(0, 1fr) 4rem; gap: .35rem; align-items: center; } .ex-win-d .r.on b { color: #901d23; } .ex-win-d small { color: #6b7a82; }
  .ex-cell.blk { background: repeating-linear-gradient(135deg, #f4f5f7 0 8px, #eceef1 8px 16px) !important; } .blkt { font-size: .8rem; color: #6b7a82; text-align: center; padding: .4rem 0; } .blkt.bad { color: #b42318; font-weight: 700; } .ex-chk.lock small { font-size: .75rem; opacity: .85; }
  .ex-sw { display: grid; grid-template-columns: auto 1fr; gap: .6rem; align-items: center; margin: 0; cursor: pointer; } .ex-sw input { display: none; }
  .ex-sw .tg { width: 44px; height: 24px; border-radius: 999px; background: #cbd5da; position: relative; transition: .2s; } .ex-sw .tg::after { content: ''; position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: .2s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
  .ex-sw input:checked + .tg { background: #15803d; } .ex-sw input:checked + .tg::after { right: 23px; } .ex-sw b { display: block; font-size: .95rem; } .ex-sw small { display: block; color: #5b6b72; font-size: .84rem; }
  .ex-rule { background: #f1f6f9; border-radius: 10px; padding: .5rem .7rem; font-size: .92rem; } .ex-rule.hard { background: #e4f5e9; color: #14532d; font-weight: 600; } .ex-rule.ok { background: #e4f5e9; color: #15803d; }
  .ex-rooms { max-height: 320px; overflow: auto; border: 1px solid #e2e8ec; border-radius: 10px; } .ex-rooms.tall { max-height: 460px; } .ex-rooms table { margin: 0; font-size: .92rem; } .ex-rooms thead th { position: sticky; top: 0; background: #eef2f4; z-index: 1; } .ex-rooms tr.off td { opacity: .55; }
  .ex-drafts { list-style: none; padding: 0; margin: 0; display: grid; gap: .4rem; } .ex-drafts li { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; border: 1px solid #e2e8ec; border-radius: 12px; padding: .5rem .7rem; }
  .ex-drafts li > i { font-size: 1.4rem; color: #0b4a66; } .ex-drafts li.app { border-color: #15803d; background: #f2faf5; } .ex-drafts li.app > i { color: #15803d; } .ex-drafts li span small { display: block; color: #5b6b72; } .ex-drafts .acts { margin-inline-start: auto; display: flex; gap: .3rem; flex-wrap: wrap; } .ex-drafts li.empty { color: #6b7a80; }
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
  @media print { .ex-steps, .ex-status, .ex-toolbar, .ex-filter, .ex-hint, .ex-nav { display: none; } }`;
  document.head.insertAdjacentHTML('beforeend', `<style id="ex-css">${CSS}</style>`);

  gate.then(() => Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/study_plans.json')])).then(([tt, plans]) => {
    TT = tt; PLANS = plans; setTimeout(liveCheck, 500);
    U.updatedLine(tt.updated, tt.term);
    const q = $('#pg-q');
    if (q) q.addEventListener('input', () => { F().q = q.value; if (tab !== 'grid' && tab !== 'out') tab = 'grid'; clearTimeout(window.__exq); window.__exq = setTimeout(render, 250); });
    build();
    wire();
    render();
  }).catch(e => { console.error(e); $(APP).innerHTML = '<div class="alert alert-warning">تعذّر تحميل البيانات. أعد المحاولة بعد قليل.</div>'; });
})();
