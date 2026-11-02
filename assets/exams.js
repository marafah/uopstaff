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
    final: { name: 'الامتحانات النهائية', periods: [['09:00', '11:00'], ['11:30', '13:30'], ['14:00', '16:00']], days: 12 },
    mid1: { name: 'الامتحان الأول', periods: [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']], days: 6 },
    midterm: { name: 'امتحان منتصف الفصل', periods: [['09:00', '10:30'], ['11:00', '12:30'], ['13:00', '14:30'], ['15:00', '16:30']], days: 6 },
    mid2: { name: 'الامتحان الثاني', periods: [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']], days: 6 },
    makeup: { name: 'الامتحانات التكميلية / المؤجلة', periods: [['10:00', '12:00'], ['12:30', '14:30']], days: 3 },
  };
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  function fresh(type) {
    const t = TYPES[type || 'final'];
    return { type: type || 'final', start: today(), days: t.days, off: [5, 6], hol: '', periods: t.periods.map(p => p.slice()), maxDay: 2, perProc: 30, minProc: 1, maxDuty: 0, maxDutyDay: 2, busy: type === 'mid1' || type === 'mid2' || type === 'midterm', b2b: true, near: true, insClash: true, early: true, depth: 'normal', noProc: '', label: '', gview: 'matrix', setupDone: false,
      faculty: 'تكنولوجيا المعلومات', facs: ['تكنولوجيا المعلومات'], flt: {}, practical: false, grad: true, src: 'plans', rooms: null, excl: {}, pins: {}, slot: {}, reg: null, regInfo: '', extraProc: '', drafts: [], approved: null };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.type) S = fresh();
  const migrate = () => { if (!Array.isArray(S.facs)) S.facs = S.faculty ? [S.faculty] : []; if (!S.flt) S.flt = {}; };
  migrate();
  const inFac = f => !S.facs.length || S.facs.includes(f);
  const facLabel = () => !S.facs.length ? 'كل الكليات' : S.facs.length === 1 ? S.facs[0] : S.facs.length + ' كليات';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full / blocked */ } };
  let repCache = [], repFilter = '';
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
    for (let guard = 0; out.length < S.days && guard < 120; guard++, d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (S.off.includes(d.getUTCDay()) || hol.has(iso)) continue;
      out.push({ iso, dl: U.JS_DAY[d.getUTCDay()], wd: WD[d.getUTCDay()], label: `${WD[d.getUTCDay()]} ${+iso.slice(8)}/${+iso.slice(5, 7)}` });
    }
    return out;
  }
  function build() {
    const secs = merged(TT.sections.filter(s => inFac(s.faculty) && (S.practical || s.activity === 'نظري') && (S.grad || s.degree !== 'الماجستير')));
    const m = {};
    secs.forEach(s => {
      const c = m[s.code] || (m[s.code] = { code: s.code, name: s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), dept: s.department, fac: s.faculty, degree: s.degree, students: 0, secs: 0, ins: new Set(), sl: [] });
      c.students += s.registered || 0; c.secs++; if (s.instructor) c.ins.add(s.instructor);
      if (s.registered) c.sl.push({ s: s.section, n: s.registered, ins: s.instructor || '' });
    });
    C = Object.values(m).filter(c => !S.excl[c.code]).sort((a, b) => a.code.localeCompare(b.code));
    C.forEach((c, i) => { c.i = i; c.lv = level(c); c.ins = [...c.ins]; });
    BY = Object.fromEntries(C.map(c => [c.code, c]));
    DAYS = examDays(); P = S.periods.length; NS = DAYS.length * P;
    const multi = new Set(C.map(c => c.fac)).size > 1, keys = [...new Set(C.map(c => multi ? c.fac : c.dept))].sort();
    C.forEach(c => { c.col = U.PALETTE[keys.indexOf(multi ? c.fac : c.dept) % U.PALETTE.length]; });
    COLBY = multi ? 'fac' : 'dept';
    // instructors → their courses
    INS = {}; C.forEach(c => c.ins.forEach(n => (INS[n] = INS[n] || []).push(c.i)));
    // who sits together
    G = [];
    const add = (name, codes, w, hard, kind) => { const ix = [...new Set(codes)].filter(k => BY[k]).map(k => BY[k].i); if (ix.length > 1) G.push({ name, c: ix, w, hard, kind }); };
    if (S.src !== 'reg' || !S.reg) {
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
    if (S.reg && S.src !== 'plans') S.reg.forEach(g => add(`${g.w} طالب`, g.c, g.w, true, 'students'));
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
    AV = []; CAP = []; BUSYI = busyI;
    for (let s = 0; s < NS; s++) { AV[s] = rooms().filter(r => r.on && !(busyR[s] && busyR[s].has(r.n))); CAP[s] = AV[s].reduce((a, r) => a + r.c, 0); }
  }
  // rooms: by default the rooms the faculty teaches in, with an exam capacity of half the largest class seen there
  function rooms() {
    if (!S.rooms) {
      const m = {};
      TT.sections.filter(s => inFac(s.faculty) && s.room && s.room !== '0' && s.activity === 'نظري').forEach(s => { m[s.room] = Math.max(m[s.room] || 0, s.registered || 0); });
      S.rooms = Object.entries(m).filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]).slice(0, S.facs.length === 1 ? 24 : 400)
        .map(([n, c]) => ({ n, c: Math.max(15, Math.round(c * 0.6 / 5) * 5), on: true }));
    }
    return S.rooms;
  }
  let capTotal = 0, AV = [], CAP = [], BUSYI = {}, COLBY = 'dept';
  const capOf = s => CAP[s] == null ? capTotal : CAP[s];

  // ---------- cost ----------
  const W = { clash: 1000, softClash: 60, overDay: 45, sameDay: 4, backToBack: 12, ins: 150, seat: 80, spread: 0.08, early: 0.0005 };
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
  let WORK = null, SEAT = [];
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
    return cost + insCost(i, sl) * 2 + (sl[i] >= 0 && S.early !== false ? C[i].students * dayOf(sl[i]) * W.early : 0);
  }
  function delta(i, to, sl) {
    const from = sl[i]; if (from === to) return 0;
    const n = C[i].students, a = seatsAt(from, sl), b = seatsAt(to, sl);
    const seatD = seatF(from, a - n) + seatF(to, b + n) - seatF(from, a) - seatF(to, b);
    const before = local(i, sl);
    sl[i] = to;
    const after = local(i, sl);
    sl[i] = from;
    return after - before + seatD;
  }
  function total(sl) {
    let cost = 0;
    G.forEach(g => { cost += groupCost(g, sl); });
    for (let s = 0; s < NS; s++) cost += seatCost(s, sl);
    C.forEach(c => { cost += insCost(c.i, sl) + (sl[c.i] >= 0 && S.early !== false ? c.students * dayOf(sl[c.i]) * W.early : 0); });
    return cost;
  }

  // ---------- solver ----------
  function solve(keep) {
    const sl = C.map(c => c.pin != null ? c.pin : keep && c.s >= 0 ? c.s : -1);
    WORK = sl; SEAT = new Array(NS).fill(0); C.forEach(c => { if (sl[c.i] >= 0) SEAT[sl[c.i]] += c.students; });
    const set = (i, s) => { if (sl[i] >= 0) SEAT[sl[i]] -= C[i].students; sl[i] = s; if (s >= 0) SEAT[s] += C[i].students; };
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
    const out = {}, load = {}, unseated = [], short = [], dayLoad = {};
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
        let left = c.students; const got = [];
        while (left > 0 && freeR.length) {
          let k = freeR.findIndex((r, j) => r.c >= left && (j === freeR.length - 1 || freeR[j + 1].c < left));
          if (k < 0) k = 0;
          const r = freeR.splice(k, 1)[0], n = Math.min(left, r.c); got.push({ room: r.n, n, cap: r.c, proc: [] }); left -= n;
        }
        if (left > 0) unseated.push({ c, n: left, s });
        // a course with several sections sits in several rooms at the same time: each section goes whole into a room
        // where it fits (largest first), so its own instructor can proctor it; a section is split only if it must be
        const secs = c.sl.slice().sort((a, b) => b.n - a.n), room = got.map(r => ({ r, free: r.n }));
        got.forEach(r => { r.secs = []; r.ins = []; });
        secs.forEach(x => {
          let rest = x.n;
          const whole = room.filter(o => o.free >= rest).sort((a, b) => a.free - b.free)[0];
          for (const o of whole ? [whole] : room.slice().sort((a, b) => b.free - a.free)) {
            if (rest <= 0) break; const k = Math.min(rest, o.free); if (k <= 0) continue;
            o.free -= k; rest -= k; o.r.secs.push(x.s + (k < x.n ? `(${k})` : '')); if (x.ins && !o.r.ins.includes(x.ins)) o.r.ins.push(x.ins);
          }
        });
        return { c, rooms: got, left };
      });
      // proctors: the course's own instructors first, then whoever has proctored least
      // (an instructor whose own exam is now is kept for it; one teaching a lecture now is not available)
      const ownNow = new Set(); out[s].forEach(x => x.c.ins.forEach(n => { if (!busy.has(n) && !isEx(n)) ownNow.add(n); }));
      out[s].forEach(x => {
        const used = new Set();
        x.rooms.forEach(r => {
          const need = Math.max(S.minProc || 1, Math.ceil(r.n / S.perProc));
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
    return { out, load, unseated, short };
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
    return list;
  }
  // every problem as one detailed, de-duplicated row: severity, type, when, which exams, who is affected, why, and a fix
  const KIND = {
    clash: ['حرج', 'تعارض طالب', 'bi-x-octagon-fill'], unseated: ['حرج', 'نقص مقاعد', 'bi-door-closed-fill'], ins: ['مرتفع', 'تعارض مدرّس', 'bi-person-x-fill'],
    short: ['مرتفع', 'نقص مراقبين', 'bi-person-dash-fill'], day: ['متوسط', 'ضغط يومي', 'bi-calendar-x-fill'], b2b: ['منخفض', 'امتحانان متتاليان', 'bi-arrow-left-right'],
    soft: ['منخفض', 'تعارض محتمل', 'bi-question-circle-fill'] };
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
      const exact = x.g && x.g.kind === 'students', n = x.k === 'ins' ? 0 : exact ? x.g.w : est(x.cs);
      const who = x.k === 'ins' ? U.shortName(x.txt.split(':')[0]) : x.g ? (exact ? 'طلبة من كشف التسجيل' : x.g.name) : '';
      const why = {
        clash: 'امتحانان أو أكثر في الفترة نفسها لطلبة يدرسون المقررات معاً — لا يمكن للطالب حضورهما.',
        soft: 'المقرران من سنتين متتاليتين في التخصص نفسه؛ قد يجمعهما بعض الطلبة المتأخرين أو المتقدمين.',
        day: `أكثر من ${S.maxDay} امتحان في اليوم نفسه للفئة نفسها من الطلبة.`,
        b2b: 'امتحانان في فترتين متتاليتين من اليوم نفسه بلا استراحة.',
        ins: 'المدرّس نفسه يدرّس المقررين وامتحاناهما في الوقت نفسه؛ لا يستطيع الحضور في القاعتين.' }[x.k];
      add(x.k, x.cs, x.k === 'day' || x.k === 'b2b' ? x.txt.replace(/^.*يوم /, '') : slotOf(x.cs), who, n, exact, why);
    });
    st.seat.unseated.forEach(u => add('unseated', [u.c.i], slotLabel(u.s), '', u.n, true, `لا تتسع القاعات المتاحة في هذه الفترة لكل الطلبة (${u.n} طالب بلا مقعد).`));
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
        <span class="ex-pill"><i class="bi bi-calendar3"></i> ${nDays(DAYS.length)} × ${P} فترات</span><span class="ex-pill"><i class="bi bi-door-open"></i> ${rooms().filter(r => r.on).length} قاعة · ${capTotal} مقعد/فترة</span>
        <span class="ex-pill ${st.clash || st.unseated ? 'bad' : st.placed ? 'ok' : ''}"><i class="bi ${st.clash || st.unseated ? 'bi-exclamation-octagon-fill' : 'bi-check-circle-fill'}"></i> ${!st.placed ? 'غير مولّد' : st.clash || st.unseated ? `${st.clash} تعارض · ${st.unseated} بلا مقعد` : 'بلا تعارض'}</span>
        ${S.approved ? `<span class="ex-pill ok"><i class="bi bi-patch-check-fill"></i> معتمدة</span>` : ''}</div>
      ${i >= 0 ? '' : ''}`;
  }
  const navBtns = () => { const i = STEPS.findIndex(x => x[0] === tab), p = STEPS[i - 1], n = STEPS[i + 1];
    return `<div class="ex-nav">${p ? `<button class="btn btn-outline-secondary" data-tab="${p[0]}"><i class="bi bi-arrow-right"></i> السابق: ${p[2]}</button>` : '<span></span>'}
      ${n ? `<button class="btn btn-ex btn-lg" ${tab === 'set' ? 'id="ex-setdone"' : `data-tab="${n[0]}"`}>التالي: ${n[2]} <i class="bi bi-arrow-left"></i></button>` : ''}</div>`; };
  // filter bar (every table and view)
  // clickable badges (coloured like the exam cards) in place of drop-down lists for faculty and department
  function chips(key, ic, allTxt, list, cur) {
    const colOf = x => { const c = C.find(y => y[key] === x); return c && (key === COLBY || COLBY === 'dept') ? c.col : c ? U.PALETTE[list.indexOf(x) % U.PALETTE.length] : ['#475569', '#edf0f4']; };
    const cnt = x => C.filter(c => c[key] === x && (key === 'fac' || !F().fac || c.fac === F().fac)).length;
    return `<div class="ex-legend" role="group"><button class="ex-lg all${cur ? '' : ' on'}" data-fk="${key}" data-fv=""><i class="bi ${ic}"></i> ${allTxt}</button>
      ${list.map(x => { const [c, b] = colOf(x); return `<button class="ex-lg${cur === x ? ' on' : ''}" data-fk="${key}" data-fv="${esc(x)}" style="--c:${c};--b:${b}">${esc(x)} <span class="k">${cnt(x)}</span></button>`; }).join('')}</div>`;
  }
  function filterBar(extra) {
    const f = F(), facs = [...new Set(C.map(c => c.fac))].sort(), depts = [...new Set(C.filter(c => !f.fac || c.fac === f.fac).map(c => c.dept))].sort(), lvs = [...new Set(C.map(c => c.lv))].sort();
    const n = C.filter(match).length;
    return `<div class="ex-filter"><i class="bi bi-funnel-fill"></i>
      <input class="form-control" data-f="q" placeholder="ابحث: رمز، مقرر، مدرّس…" value="${esc(f.q || '')}">
      <select class="form-select" data-f="lv"><option value="">كل السنوات</option>${lvs.map(l => `<option value="${l}" ${String(f.lv) === String(l) && f.lv !== '' && f.lv != null ? 'selected' : ''}>${LV(l)}</option>`).join('')}</select>
      <label class="ex-switch"><input type="checkbox" data-f="prob" ${f.prob ? 'checked' : ''}><span></span> ذات الملاحظات فقط</label>
      ${extra || ''}<span class="ex-count"><b>${n}</b> / ${C.length}</span>${n < C.length ? '<button class="btn btn-sm btn-link" data-fclear>مسح التصفية</button>' : ''}</div>
      ${facs.length > 1 ? chips('fac', 'bi-buildings', 'كل الكليات', facs, f.fac) : ''}${chips('dept', 'bi-diagram-3', 'كل الأقسام', depts, f.dept)}`;
  }
  const GV = [['matrix', 'bi-grid-3x3-gap', 'المصفوفة'], ['days', 'bi-calendar-week', 'حسب اليوم'], ['list', 'bi-table', 'القائمة'], ['cohort', 'bi-mortarboard', 'التخصصات والسنوات'], ['dept', 'bi-diagram-3', 'الأقسام']];
  function gridView(st) {
    if (!DAYS.length) return '<div class="ex-empty warn"><i class="bi bi-calendar-x"></i> لا توجد أيام امتحانات: راجع تاريخ البداية وعدد الأيام في «الإعداد».<br><button class="btn btn-ex mt-2" data-tab="set">فتح الإعداد</button></div>';
    if (!st.placed) return `<div class="ex-start"><i class="bi bi-magic"></i><h3>الخطوة 2: ولّد الجدول</h3><p>سيوزّع النظام ${C.length} امتحاناً على ${nDays(DAYS.length)} و${P} فترات يومياً، مع منع التعارض ومراعاة القاعات والقواعد التي اخترتها.</p>
      <button class="btn btn-ex btn-lg" id="ex-solve"><i class="bi bi-magic"></i> ولّد الجدول الآن</button><button class="btn btn-link" data-tab="set">تعديل الإعداد أولاً</button></div>`;
    const v = S.gview || 'matrix';
    PROB = new Set(st.is.flatMap(x => x.cs).concat(st.seat.unseated.map(u => u.c.i), st.seat.short.map(u => u.c.i)));
    const keys = [...new Set(C.map(c => c[COLBY]))].sort();
    return `<div class="ex-toolbar">
        <div class="ex-views">${GV.map(([k, ic, t]) => `<button class="ex-vbtn${v === k ? ' on' : ''}" data-gv="${k}"><i class="bi ${ic}"></i> ${t}</button>`).join('')}</div>
        <div class="ex-acts"><button class="btn btn-ex" id="ex-solve" title="توليد جدول جديد من البداية (المثبّت يبقى)"><i class="bi bi-magic"></i> توليد من جديد</button>
          <button class="btn btn-outline-primary" id="ex-improve" title="تحسين الجدول الحالي دون البدء من جديد"><i class="bi bi-stars"></i> تحسين</button>
          <button class="btn btn-outline-secondary" id="ex-undo" ${undo.length ? '' : 'disabled'} title="تراجع عن آخر تعديل"><i class="bi bi-arrow-counterclockwise"></i> تراجع</button></div></div>
      ${filterBar()}
      ${v === 'matrix' ? matrixView(st) : v === 'days' ? daysView(st) : v === 'list' ? listView(st) : v === 'cohort' ? cohortView(st) : deptView(st)}
      ${C.some(c => c.s < 0) ? `<h5 class="ex-h"><i class="bi bi-inbox"></i> غير مجدولة</h5><div class="ex-pool ex-cell" data-s="-1">${C.filter(c => c.s < 0).map(c => card(c)).join('')}</div>` : ''}`;
  }
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
        return `<td class="ex-cell ${cls(heat[s])}" data-s="${s}"><div class="cap ${seats > cap ? 'over' : seats > cap * 0.85 ? 'hi' : ''}" title="مقاعد مستخدمة / متاحة"><i class="bi bi-person-workspace"></i> ${seats}/${cap}${all.length ? ` · ${all.length} امتحان` : ''}</div>
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
      <div class="ex-grid-wrap"><table class="ex-mx"><thead><tr><th>التخصص · السنة</th>${DAYS.map(d => `<th>${esc(d.wd)}<small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>`).join('')}<th>المجموع</th></tr></thead><tbody>
      ${cs.map(g => `<tr><th class="rh">${esc(g.name)}</th>${DAYS.map((d, di) => { const xs = g.c.filter(i => C[i].s >= 0 && dayOf(C[i].s) === di), per = {}; xs.forEach(i => { per[C[i].s] = (per[C[i].s] || 0) + 1; });
        const cl = Object.values(per).some(n => n > 1) ? 'clash' : xs.length > S.maxDay ? 'over' : xs.length ? 'ok' : '';
        return `<td class="${cl}">${xs.sort((a, b) => C[a].s - C[b].s).map(i => `<span class="ex-code sm" data-go="${i}" style="--c:${C[i].col[0]};--b:${C[i].col[1]}" title="${esc(C[i].name)} · ${esc(slotLabel(C[i].s))}">${esc(C[i].code)}<sub><bdi>ف${C[i].s % P + 1}</bdi></sub></span>`).join('')}</td>`; }).join('')}
        <td class="tot">${g.c.length}</td></tr>`).join('') || `<tr><td colspan="${DAYS.length + 2}">لا توجد تخصصات ضمن التصفية</td></tr>`}</tbody></table></div>`;
  }
  function deptView() {
    const ds = [...new Set(C.filter(match).map(c => c.dept))].sort();
    return `<div class="ex-grid-wrap"><table class="ex-mx"><thead><tr><th>القسم</th>${DAYS.map(d => `<th>${esc(d.wd)}<small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>`).join('')}<th>المجموع</th></tr></thead><tbody>
      ${ds.map(dp => { const mine = C.filter(c => c.dept === dp && match(c)); return `<tr><th class="rh">${esc(dp)}</th>${DAYS.map((d, di) => { const xs = mine.filter(c => c.s >= 0 && dayOf(c.s) === di);
        return `<td class="${xs.length ? 'ok' : ''}">${xs.sort((a, b) => a.s - b.s).map(c => `<span class="ex-code sm" data-go="${c.i}" style="--c:${c.col[0]};--b:${c.col[1]}" title="${esc(c.name)} · ${c.students} طالب · ${esc(slotLabel(c.s))}">${esc(c.code)}<sub><bdi>ف${c.s % P + 1}</bdi></sub></span>`).join('')}</td>`; }).join('')}
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
    const rm = r => r.rooms.map(x => `${x.room} (${x.n}${x.secs && x.secs.length && r.c.sl.length > 1 ? ' · ش ' + x.secs.join('،') : ''})`).join('، ') + (r.left ? ` + ${r.left} بلا قاعة` : '');
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
  function outView_() {
    const secs = outData(), n = secs.reduce((a, s) => a + s.rows.length, 0);
    return `<div class="ex-outbar"><div class="ex-views">${Object.entries(OUT).map(([k, t]) => `<button class="ex-vbtn${outView === k ? ' on' : ''}" data-ov="${k}"><i class="bi ${OUTIC[k]}"></i> ${t}</button>`).join('')}</div>
      <div class="ex-acts"><button class="btn btn-ex" id="ex-print"><i class="bi bi-printer-fill"></i> طباعة / PDF</button><button class="btn btn-success" id="ex-xlsx"><i class="bi bi-file-earmark-excel-fill"></i> Excel</button>
      <button class="btn btn-outline-secondary" id="ex-csv"><i class="bi bi-filetype-csv"></i> CSV</button></div></div>
      ${filterBar()}
      <p class="ex-note"><i class="bi bi-info-circle-fill"></i> ${secs.length > 1 ? `${secs.length} جدولاً` : 'جدول واحد'} · ${n} صفاً — الطباعة والتصدير يأخذان العرض والتصفية الحاليين؛ في Excel كل جدول في ورقة.</p>
      ${secs.map(s => `${s.title ? `<h5 class="ex-h"><i class="bi ${OUTIC[outView]}"></i> ${esc(s.title)} <span class="ex-n">${s.rows.length}</span></h5>` : ''}<div class="table-responsive ex-tbl"><table class="table table-striped align-middle"><thead><tr>${s.columns.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.columns.length}" class="text-muted">لا شيء</td></tr>`}</tbody></table></div>`).join('')}`;
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
  function doXLSX() {
    loadXLSX().then(() => {
      const wb = XLSX.utils.book_new(), used = {};
      outData().forEach((s, i) => {
        const aoa = [[title()], [OUT[outView] + (s.title ? ' · ' + s.title : '')], [], s.columns].concat(s.rows);
        const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!views'] = [{ RTL: true }];
        ws['!cols'] = s.columns.map((h, j) => ({ wch: Math.min(50, Math.max(h.length + 2, ...s.rows.slice(0, 300).map(r => String(r[j] ?? '').length + 2))) }));
        const hs = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '901D23' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
        s.columns.forEach((h, j) => { const a = XLSX.utils.encode_cell({ r: 3, c: j }); if (ws[a]) ws[a].s = hs; });
        if (ws.A1) ws.A1.s = { font: { bold: true, sz: 14, color: { rgb: '091B22' } } };
        let name = (s.title || OUT[outView]).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Sheet' + i; while (used[name]) name = name.slice(0, 26) + i; used[name] = 1;
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      XLSX.writeFile(wb, `${title()}_${OUT[outView]}.xlsx`.replace(/\s+/g, '_'));
    }).catch(() => alert('تعذّر تحميل مكتبة Excel؛ تحقق من الاتصال.'));
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
      <label class="ex-fld"><span>عنوان الجدول (يظهر في الطباعة)</span><input class="form-control" data-k="label" placeholder="${esc(TYPES[S.type].name)} – ${esc(TT.term)}" value="${esc(S.label || '')}"></label>
      <div class="ex-fld"><span>الكليات المشمولة</span><div class="ex-chipset ex-facs"><label class="ex-chk${!S.facs.length ? ' on' : ''}"><input type="checkbox" data-facall ${!S.facs.length ? 'checked' : ''}> <i class="bi bi-buildings-fill"></i> كل الكليات</label>
        ${facs.map(x => `<label class="ex-chk${S.facs.includes(x) ? ' on' : ''}"><input type="checkbox" data-fac="${esc(x)}" ${S.facs.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
        <small>جدول واحد لعدة كليات يمنع تعارض المواد المشتركة (متطلبات الجامعة والمواد الخدمية).</small></div>`)}
    ${bx(2, 'bi-calendar-range-fill', '#0b4a66', 'التقويم', 'أيام الامتحانات والعطل', `
      <div class="row2">${`<label class="ex-fld"><span>أول يوم امتحان</span><input type="date" class="form-control" data-k="start" value="${S.start}"></label>`}${num('days', 'عدد أيام الامتحانات', 1, 40)}</div>
      <div class="ex-fld"><span>أيام الأسبوع بلا امتحانات</span><div class="ex-chipset">${WD.map((w, i) => `<label class="ex-chk${S.off.includes(i) ? ' on' : ''}"><input type="checkbox" data-off="${i}" ${S.off.includes(i) ? 'checked' : ''}> ${w}</label>`).join('')}</div></div>
      <div class="ex-fld"><span>العطل الرسمية</span><div class="ex-add"><input type="date" class="form-control" id="ex-holin"><button class="btn btn-outline-primary" data-addhol><i class="bi bi-plus-lg"></i> إضافة عطلة</button></div>
        <div class="ex-chipset">${(S.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).map(h => `<span class="ex-tagx">${h}<button data-delhol="${h}" aria-label="حذف"><i class="bi bi-x"></i></button></span>`).join('') || '<small>لا عطل.</small>'}</div></div>
      <div class="ex-fld"><span>أيام الامتحانات الناتجة <b class="bdg blue">${DAYS.length}</b></span><div class="ex-days">${DAYS.map(d => `<span>${esc(d.label)}</span>`).join('')}</div></div>`)}
    ${bx(3, 'bi-clock-fill', '#0f766e', 'الفترات اليومية', 'مواعيد الامتحانات في اليوم', `
      <div class="ex-presets">${PRESETS.map(([t], k) => `<button class="btn btn-sm btn-outline-secondary" data-preset="${k}"><i class="bi bi-lightning-charge"></i> ${t}</button>`).join('')}</div>
      ${S.periods.map((p, k) => `<div class="ex-prow"><span class="bdg teal">الفترة ${k + 1}</span><input type="time" class="form-control" data-p="${k}" data-e="0" value="${p[0]}"><span>إلى</span><input type="time" class="form-control" data-p="${k}" data-e="1" value="${p[1]}">
        <span class="bdg ${mins(p[0], p[1]) > 0 ? '' : 'red'}">${mins(p[0], p[1]) > 0 ? U.dur(mins(p[0], p[1])) : 'وقت غير صحيح'}</span><button class="btn btn-sm btn-outline-danger" data-delp="${k}" ${P < 2 ? 'disabled' : ''} aria-label="حذف"><i class="bi bi-trash"></i></button></div>`).join('')}
      <button class="btn btn-outline-primary" data-addp><i class="bi bi-plus-lg"></i> إضافة فترة</button>`)}
    ${bx(4, 'bi-rulers', '#9a5b00', 'قواعد الجدولة', 'ما يمنعه النظام وما يحاول تجنّبه', `
      <div class="ex-rule hard"><i class="bi bi-shield-fill-check"></i> دائماً: لا يجتمع امتحانان لطالب في الفترة نفسها، ولا يتجاوز عدد الطلبة مقاعد القاعات.</div>
      <div class="row2">${num('maxDay', 'أقصى عدد امتحانات للطالب في اليوم', 1, 4)}<label class="ex-fld"><span>عمق البحث عن أفضل جدول</span><select class="form-select" data-k="depth">${[['quick', 'سريع (ثوانٍ)'], ['normal', 'متوازن'], ['deep', 'عميق (أبطأ وأدق)']].map(([k, t]) => `<option value="${k}" ${S.depth === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="ex-rules2">${sw('b2b', 'تجنّب امتحانين متتاليين في اليوم نفسه', 'يترك فترة راحة بين امتحاني الطالب')}${sw('near', 'مراعاة طلبة السنتين المتتاليتين', 'تجنّب تزامن مواد السنة الثانية والثالثة مثلاً في التخصص نفسه')}${sw('insClash', 'منع تزامن امتحانين لمدرّس واحد', 'ليحضر المدرّس امتحان كل مقرر يدرّسه')}${sw('early', 'المقررات الكبيرة في الأيام الأولى', 'ليتسع وقت التصحيح')}${sw('busy', 'مراعاة المحاضرات القائمة', 'لا تُستخدم قاعة فيها محاضرة وقت الامتحان ولا يراقب مدرّس عنده محاضرة (للامتحانات خلال الفصل)')}${sw('practical', 'تضمين الشعب العملية', '')}${sw('grad', 'تضمين الماجستير', '')}</div>`)}
    ${bx(5, 'bi-people-fill', '#6d28d9', 'بيانات الطلبة', 'من يجلس مع من؟', `
      <div class="ex-srcs">${[['plans', 'bi-diagram-3-fill', 'الخطط الدراسية', 'تقدير حسب التخصص والسنة'], ['reg', 'bi-file-earmark-spreadsheet-fill', 'كشف التسجيل', 'دقيق لكل طالب'], ['both', 'bi-intersect', 'الاثنان معاً', 'الأدق والأشمل']]
        .map(([k, ic, t, d]) => `<label class="ex-type${S.src === k ? ' on' : ''}"><input type="radio" name="src" data-src="${k}" ${S.src === k ? 'checked' : ''}><i class="bi ${ic}"></i><b>${t}</b><small>${d}</small></label>`).join('')}</div>
      <label class="ex-fld"><span>رفع كشف التسجيل (Excel أو CSV): عمود رقم الطالب وعمود رمز المادة</span><input type="file" class="form-control" id="ex-reg" accept=".csv,.xlsx,.xls"></label>
      <div class="ex-rule ${S.reg ? 'ok' : ''}">${S.reg ? `<i class="bi bi-check-circle-fill"></i> ${esc(S.regInfo)} <button class="btn btn-sm btn-link text-danger" data-clrreg>حذف الكشف</button>` : '<i class="bi bi-lock-fill"></i> لا يُحفظ رقم أي طالب: تُحفظ فقط مجموعات المواد وعدد طلبتها، على هذا الجهاز وحده.'}</div>`)}
    ${bx(6, 'bi-door-open-fill', '#15803d', 'القاعات', `${on.length} قاعة مفعّلة · ${capTotal} مقعد في الفترة`, `
      <div class="ex-acts mb-2"><button class="btn btn-sm btn-outline-primary" data-addr><i class="bi bi-plus-lg"></i> قاعة</button><button class="btn btn-sm btn-outline-secondary" data-allr="1">تفعيل الكل</button><button class="btn btn-sm btn-outline-secondary" data-allr="0">تعطيل الكل</button>
        <button class="btn btn-sm btn-outline-secondary" data-scaler="1.1">السعة +10%</button><button class="btn btn-sm btn-outline-secondary" data-scaler="0.9">السعة −10%</button><button class="btn btn-sm btn-link" data-resetr>إعادة الاقتراح</button></div>
      <div class="ex-rooms"><table class="table table-sm align-middle"><thead><tr><th>مفعّلة</th><th>القاعة</th><th>السعة الامتحانية</th><th></th></tr></thead><tbody>
        ${R.map((r, k) => `<tr class="${r.on ? '' : 'off'}"><td><input type="checkbox" class="form-check-input" data-ron="${k}" ${r.on ? 'checked' : ''}></td><td><input class="form-control form-control-sm" data-rn="${k}" value="${esc(r.n)}"></td><td><input type="number" class="form-control form-control-sm" data-rc="${k}" value="${r.c}" min="1"></td><td><button class="btn btn-sm btn-outline-danger" data-delr="${k}" aria-label="حذف"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>
      <label class="ex-fld"><span>إضافة قاعات دفعة واحدة (سطر لكل قاعة: الاسم، السعة)</span><textarea class="form-control" rows="2" id="ex-bulkr" placeholder="B101, 40&#10;مختبر 3, 25"></textarea><button class="btn btn-sm btn-outline-primary mt-1" data-bulkr>إضافة</button></label>
      <small class="text-muted">السعة المقترحة ≈ 60% من أكبر شعبة دُرّست في القاعة (مقعد فارغ بين الطلبة).</small>`)}
    ${bx(7, 'bi-person-badge-fill', '#be185d', 'المراقبون', 'العدد والحدود والاستثناءات', `
      <div class="row2">${num('perProc', 'عدد الطلبة لكل مراقب', 10, 80)}${num('minProc', 'أقل عدد مراقبين في القاعة', 1, 5, '', 1)}</div>
      <div class="row2">${num('maxDutyDay', 'أقصى مراقبات للشخص في اليوم', 0, 6, '0 = بلا حد', 2)}${num('maxDuty', 'أقصى مراقبات للشخص في الدورة', 0, 60, '0 = بلا حد', 0)}</div>
      <label class="ex-fld"><span>مراقبون إضافيون من غير المدرسين (اسم في كل سطر)</span><textarea class="form-control" rows="2" data-k="extraProc">${esc(S.extraProc)}</textarea></label>
      <label class="ex-fld"><span>معفَون من المراقبة (اسم في كل سطر، مثل العميد ورؤساء الأقسام)</span><textarea class="form-control" rows="2" data-k="noProc">${esc(S.noProc || '')}</textarea></label>
      <div class="ex-rule"><i class="bi bi-info-circle-fill"></i> مدرّس الشعبة يراقب قاعة شعبته أولاً، ثم يُوزَّع الباقون بالعدل حسب أقل عدد مراقبات.</div>`)}
    ${bx(8, 'bi-list-check', '#1d4ed8', 'المقررات', `${all.length - Object.keys(S.excl).filter(k => all.some(c => c.code === k)).length} من ${all.length} مقرراً لها امتحان`, `
      <div class="ex-add"><input class="form-control" data-f="cq" placeholder="ابحث في المقررات…" value="${esc(f.cq || '')}"><button class="btn btn-sm btn-outline-secondary" data-inclall="1">تضمين الكل</button><button class="btn btn-sm btn-outline-secondary" data-inclall="0">استبعاد الكل</button></div>
      <div class="ex-rooms tall"><table class="table table-sm align-middle"><thead><tr><th>امتحان</th><th>الرمز</th><th>المقرر</th><th>القسم</th><th>الطلبة</th><th>الشعب</th><th>موعد ثابت</th></tr></thead><tbody>
        ${shown.map(c => `<tr class="${S.excl[c.code] ? 'off' : ''}"><td><input type="checkbox" class="form-check-input" data-incl="${esc(c.code)}" ${S.excl[c.code] ? '' : 'checked'}></td><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td class="small">${esc(c.dept)}</td><td>${c.n}</td><td>${c.k}</td>
          <td><select class="form-select form-select-sm" data-pinc="${esc(c.code)}" ${S.excl[c.code] ? 'disabled' : ''}><option value="">تلقائي</option>${slots.map(([s, l]) => `<option value="${s}" ${S.pins[c.code] === s ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      <small class="text-muted">أزل علامة المقرر الذي لا امتحان له (مشروع، تدريب…). «موعد ثابت» يثبّت المقرر في موعد لا يغيّره التوليد.</small>`, true)}
    </div>`;
    const sum = [`${TYPES[S.type].name} · ${facLabel()}`, `${nDays(DAYS.length)} من ${DAYS[0] ? DAYS[0].label : '—'}`, `${P} فترات يومياً`, `حتى ${S.maxDay} امتحان/يوم`,
      S.reg && S.src !== 'plans' ? 'كشف التسجيل' : 'الخطط الدراسية', `${on.length} قاعة · ${capTotal} مقعد`, `طالب/مراقب: ${S.perProc}`, `${C.length} من ${all.length} مقرراً`];
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
  function readReg(file) {
    const csv = /\.(csv|txt)$/i.test(file.name);
    (csv ? file.text().then(x => x.replace(/^\ufeff/, '').split(/\r?\n/).map(l => l.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, ''))))
      : loadXLSX().then(() => file.arrayBuffer()).then(buf => { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); })).then(rows => {
      const known = new Set(TT.sections.map(s => s.code)), w = Math.max(...rows.slice(0, 50).map(r => r.length));
      let codeCol = -1, best = 0;
      for (let j = 0; j < w; j++) { const n = rows.slice(0, 300).filter(r => known.has(String(r[j] || '').trim())).length; if (n > best) { best = n; codeCol = j; } }
      if (codeCol < 0) throw new Error('لم أجد عموداً فيه رموز مواد معروفة.');
      const stuCol = codeCol === 0 ? 1 : 0, by = {};
      rows.forEach(r => { const st = String(r[stuCol] || '').trim(), c = String(r[codeCol] || '').trim(); if (st && known.has(c)) (by[st] = by[st] || new Set()).add(c); });
      const agg = {}; Object.values(by).forEach(set => { if (set.size < 2) return; const k = [...set].sort().join(','); agg[k] = (agg[k] || 0) + 1; });
      S.reg = Object.entries(agg).map(([k, n]) => ({ c: k.split(','), w: n }));
      S.regInfo = `كشف ${file.name}: ${Object.keys(by).length} طالب، ${S.reg.length} مجموعة مواد مختلفة`;
      if (S.src === 'plans') S.src = 'both';
      rebuild();
    }).catch(e => alert('تعذّرت قراءة الكشف: ' + (e.message || e)));
  }
  function wire() {
    const app = $(APP);
    let tmr;
    app.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f === 'q' || t.dataset.f === 'cq') { F()[t.dataset.f] = t.value; clearTimeout(tmr); tmr = setTimeout(() => { save(); render(); }, 250); }
    });
    app.addEventListener('click', e => {
      const t = e.target.closest('button,[data-c],.ex-cell,[data-tab],[data-go],th[data-sort]'); if (!t) return;
      if (t.id === 'ex-setdone') { S.setupDone = true; save(); tab = 'grid'; render(); if (!C.some(c => c.s >= 0) && C.length) busy(() => solve(false)); window.scrollTo(0, 0); return; }
      if (t.dataset.tab) { tab = t.dataset.tab; sel = null; render(); if (t.closest('.ex-nav')) window.scrollTo(0, 0); return; }
      if (t.dataset.st) { S.setTab = +t.dataset.st; save(); render(); const m = app.querySelector('.ex-setwrap'); if (m && m.getBoundingClientRect().top < 0) m.scrollIntoView({ behavior: 'smooth' }); return; }
      if (t.dataset.fk) { const f = F(), k = t.dataset.fk, v = t.dataset.fv; f[k] = f[k] === v ? '' : v; if (k === 'fac') f.dept = ''; save(); render(); return; }
      if (t.dataset.gv) { S.gview = t.dataset.gv; save(); render(); return; }
      if (t.dataset.ov) { outView = t.dataset.ov; render(); return; }
      if (t.dataset.sort) { const k = t.dataset.sort; sortD = sortK === k ? -sortD : 1; sortK = k; render(); return; }
      if (t.hasAttribute('data-fclear')) { const cq = F().cq; S.flt = { cq }; save(); render(); return; }
      if (t.id === 'ex-solve') { push(); busy(() => solve(false)); return; }
      if (t.id === 'ex-improve') { push(); busy(() => solve(true)); return; }
      if (t.id === 'ex-undo') { const u = undo.pop(); if (u) { Object.assign(S, JSON.parse(u)); rebuild(); } return; }
      if (t.id === 'ex-print') return doPrint();
      if (t.dataset.rf != null) { repFilter = t.dataset.rf; render(); return; }
      if (t.dataset.fix) { const [i, s] = t.dataset.fix.split(',').map(Number); move(i, s); return; }
      if (t.id === 'ex-fixall') { push(); for (let n = 0; n < 80; n++) { const r = report(stats()).find(x => x.fix); if (!r) break; C[r.fix.i].s = r.fix.s; S.slot[C[r.fix.i].code] = r.fix.s; } save(); render(); return; }
      if (t.id === 'ex-rprint' || t.id === 'ex-rxlsx') return repExport(t.id === 'ex-rxlsx');
      if (t.id === 'ex-xlsx') return doXLSX();
      if (t.id === 'ex-csv') return doCSV();
      if (t.dataset.go != null) { tab = 'grid'; S.gview = 'matrix'; sel = +t.dataset.go; render(); const el = app.querySelector(`.ex-card[data-c="${sel}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (t.dataset.c != null && tab === 'grid') {
        const i = +t.dataset.c, cell = t.closest('.ex-cell');
        if (sel != null && sel !== i && cell) { move(sel, +cell.dataset.s); return; }  // with an exam picked, a tap anywhere in a cell moves it there
        sel = sel === i ? null : i; render(); return;
      }
      if (t.classList.contains('ex-cell') && sel != null) { move(sel, +t.dataset.s); return; }
      if (t.dataset.pin != null) { const c = C[+t.dataset.pin]; push(); if (c.pin != null) { c.pin = null; delete S.pins[c.code]; } else { c.pin = c.s; S.pins[c.code] = c.s; } save(); render(); return; }
      if (t.hasAttribute('data-unsel')) { sel = null; render(); return; }
      if (t.hasAttribute('data-addp')) { const l = S.periods[P - 1] || ['09:00', '11:00'], m = U.toMin(l[1]) + 30, d = P ? mins(l[0], l[1]) : 120; S.periods.push([U.toTime(m), U.toTime(m + d)]); rebuild(); return; }
      if (t.dataset.delp != null) { S.periods.splice(+t.dataset.delp, 1); S.slot = {}; S.pins = {}; rebuild(); return; }
      if (t.dataset.preset != null) { S.periods = PRESETS[+t.dataset.preset][1].map(p => p.slice()); S.slot = {}; S.pins = {}; rebuild(); return; }
      if (t.hasAttribute('data-addhol')) { const v = $('#ex-holin').value; if (v && !S.hol.includes(v)) { S.hol = (S.hol + '\n' + v).trim(); rebuild(); } return; }
      if (t.dataset.delhol) { S.hol = S.hol.split(/\s+/).filter(x => x && x !== t.dataset.delhol).join('\n'); rebuild(); return; }
      if (t.hasAttribute('data-addr')) { rooms().unshift({ n: 'قاعة جديدة', c: 30, on: true }); rebuild(); return; }
      if (t.dataset.delr != null) { rooms().splice(+t.dataset.delr, 1); rebuild(); return; }
      if (t.dataset.allr != null) { rooms().forEach(r => { r.on = t.dataset.allr === '1'; }); rebuild(); return; }
      if (t.dataset.scaler) { rooms().forEach(r => { r.c = Math.max(1, Math.round(r.c * +t.dataset.scaler)); }); rebuild(); return; }
      if (t.hasAttribute('data-bulkr')) { $('#ex-bulkr').value.split('\n').forEach(l => { const [n, c] = l.split(/[,،\t;]/).map(x => x.trim()); if (n) rooms().push({ n, c: Math.max(1, +c || 30), on: true }); }); rebuild(); return; }
      if (t.hasAttribute('data-resetr')) { S.rooms = null; rebuild(); return; }
      if (t.dataset.inclall != null) { const on = t.dataset.inclall === '1'; TT.sections.filter(s => inFac(s.faculty)).forEach(s => { if (on) delete S.excl[s.code]; else S.excl[s.code] = 1; }); rebuild(); return; }
      if (t.hasAttribute('data-clrreg')) { S.reg = null; S.regInfo = ''; S.src = 'plans'; rebuild(); return; }
      if (t.id === 'ex-dsave') { const n = ($('#ex-dname').value || '').trim() || `نسخة ${S.drafts.length + 1}`; S.drafts.unshift({ name: n, at: new Date().toLocaleString('ar-JO'), n: C.length, slot: { ...S.slot }, pins: { ...S.pins } }); save(); render(); return; }
      if (t.dataset.dload != null) { const d = S.drafts[+t.dataset.dload]; push(); S.slot = { ...d.slot }; S.pins = { ...d.pins }; tab = 'grid'; rebuild(); return; }
      if (t.dataset.dapp != null) { const d = S.drafts[+t.dataset.dapp]; S.approved = S.approved === d.name ? null : d.name; S.slot = { ...d.slot }; S.pins = { ...d.pins }; rebuild(); return; }
      if (t.dataset.ddel != null) { if (confirm('حذف هذه النسخة؟')) { S.drafts.splice(+t.dataset.ddel, 1); save(); render(); } return; }
      if (t.id === 'ex-export') { U.download(`خطة_${title()}.json`.replace(/\s+/g, '_'), JSON.stringify(S), 'application/json'); return; }
      if (t.id === 'ex-reset') { if (confirm('بدء خطة جديدة؟ ستُحذف الخطة الحالية (تبقى النسخ المحفوظة).')) { const d = S.drafts; S = fresh(S.type); S.drafts = d; migrate(); tab = 'set'; rebuild(); } }
    });
    app.addEventListener('change', e => {
      const t = e.target, k = t.dataset.k;
      if (t.dataset.f && t.dataset.f !== 'q' && t.dataset.f !== 'cq') { F()[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f === 'fac') F().dept = ''; save(); render(); return; }
      if (t.dataset.mv != null) { move(+t.dataset.mv, +t.value); return; }
      if (t.dataset.ty) { const d = S.drafts, f = fresh(t.dataset.ty); Object.assign(S, { type: t.dataset.ty, periods: f.periods, days: f.days, busy: f.busy, slot: {}, pins: {}, approved: null }); S.drafts = d; rebuild(); return; }
      if (t.hasAttribute('data-facall')) { S.facs = t.checked ? [] : ['تكنولوجيا المعلومات']; S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.fac) { const x = t.dataset.fac; S.facs = t.checked ? [...new Set(S.facs.concat(x))] : S.facs.filter(y => y !== x); S.rooms = null; S.slot = {}; S.pins = {}; S.flt = {}; rebuild(); return; }
      if (t.dataset.pinc) { const v = t.value; if (v === '') delete S.pins[t.dataset.pinc]; else { S.pins[t.dataset.pinc] = +v; S.slot[t.dataset.pinc] = +v; } rebuild(); return; }
      if (k) { S[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(+t.min || 0, +t.value || 0) : t.value; rebuild(); return; }
      if (t.dataset.off != null) { const i = +t.dataset.off; S.off = t.checked ? S.off.concat(i) : S.off.filter(x => x !== i); rebuild(); return; }
      if (t.dataset.p != null) { S.periods[+t.dataset.p][+t.dataset.e] = t.value; rebuild(); return; }
      if (t.dataset.src) { S.src = t.dataset.src; rebuild(); return; }
      if (t.dataset.ron != null) { rooms()[+t.dataset.ron].on = t.checked; rebuild(); return; }
      if (t.dataset.rn != null) { rooms()[+t.dataset.rn].n = t.value.trim(); rebuild(); return; }
      if (t.dataset.rc != null) { rooms()[+t.dataset.rc].c = Math.max(1, +t.value || 1); rebuild(); return; }
      if (t.dataset.incl) { if (t.checked) delete S.excl[t.dataset.incl]; else S.excl[t.dataset.incl] = 1; rebuild(); return; }
      if (t.id === 'ex-reg' && t.files[0]) { readReg(t.files[0]); return; }
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
  .ex-legend { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .6rem; }
  .ex-lg { --c: #091b22; --b: #fff; background: var(--b); color: var(--c); border: 1.5px solid var(--c); border-radius: 999px; padding: .25rem .75rem; font-size: .92rem; font-weight: 700; cursor: pointer; transition: .15s; }
  .ex-lg .k { display: inline-block; min-width: 1.5em; padding: 0 .35em; border-radius: 999px; background: rgba(255,255,255,.75); font-size: .78rem; margin-inline-start: .2rem; }
  .ex-lg:hover { box-shadow: 0 2px 6px rgba(0,0,0,.15); } .ex-lg.on { background: var(--c); color: #fff; } .ex-lg.on .k { background: rgba(255,255,255,.25); color: #fff; }
  .ex-lg.all { --c: #091b22; --b: #eef2f4; }
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
  .ex-tbl tr.bad td { background: #fff4f4; } .ex-tbl select { min-width: 170px; }
  .ex-when { font-weight: 700; white-space: nowrap; font-size: .9rem; }
  .ex-code { display: inline-block; background: var(--b); color: var(--c); border: 1px solid var(--c); border-radius: 7px; padding: .05rem .45rem; font-weight: 800; cursor: pointer; }
  .ex-code.sm { font-size: .85rem; margin: 2px; } .ex-code sub { font-weight: 600; opacity: .8; margin-inline-start: 2px; bottom: 0; }
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
  .ex-prow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: .4rem; align-items: center; } .ex-prow .form-control { min-width: 0; padding-inline: .4rem; } .ex-prow .bdg:not(.teal) { grid-column: 2 / 5; justify-self: start; } .ex-prow > .btn { grid-row: 1; grid-column: 5; }
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
    .ex-prow { grid-template-columns: 1fr 1fr; } .ex-per { grid-template-columns: 1fr; } .ex-filter .form-select { flex: 1 1 45%; }
  }
  @media print { .ex-steps, .ex-status, .ex-toolbar, .ex-filter, .ex-hint, .ex-nav { display: none; } }`;
  document.head.insertAdjacentHTML('beforeend', `<style id="ex-css">${CSS}</style>`);

  gate.then(() => Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/study_plans.json')])).then(([tt, plans]) => {
    TT = tt; PLANS = plans;
    U.updatedLine(tt.updated, tt.term);
    const q = $('#pg-q');
    if (q) q.addEventListener('input', () => { F().q = q.value; if (tab !== 'grid' && tab !== 'out') tab = 'grid'; clearTimeout(window.__exq); window.__exq = setTimeout(render, 250); });
    build();
    wire();
    render();
  }).catch(e => { console.error(e); $(APP).innerHTML = '<div class="alert alert-warning">تعذّر تحميل البيانات. أعد المحاولة بعد قليل.</div>'; });
})();
