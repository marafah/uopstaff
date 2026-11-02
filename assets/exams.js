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
    mid2: { name: 'الامتحان الثاني', periods: [['09:00', '10:00'], ['10:30', '11:30'], ['12:00', '13:00'], ['13:30', '14:30']], days: 6 },
    makeup: { name: 'الامتحانات التكميلية / المؤجلة', periods: [['10:00', '12:00'], ['12:30', '14:30']], days: 3 },
  };
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  function fresh(type) {
    const t = TYPES[type || 'final'];
    return { type: type || 'final', start: today(), days: t.days, off: [5, 6], hol: '', periods: t.periods.map(p => p.slice()), maxDay: 2, perProc: 30,
      faculty: 'تكنولوجيا المعلومات', practical: false, grad: true, src: 'plans', rooms: null, excl: {}, pins: {}, slot: {}, reg: null, regInfo: '', extraProc: '', drafts: [], approved: null };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.type) S = fresh();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full / blocked */ } };
  let TT, PLANS, tab = new URLSearchParams(location.search).get('tab') || 'grid', sel = null, outView = 'all', undo = [];

  // ---------- model ----------
  let C = [], BY = {}, G = [], INS = {}, NS = 0, P = 0, DAYS = [];
  const level = c => /^6\d{5}$/.test(c.code) ? +c.code[3] : c.degree === 'الماجستير' ? 5 : 0;
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
      out.push({ iso, wd: WD[d.getUTCDay()], label: `${WD[d.getUTCDay()]} ${+iso.slice(8)}/${+iso.slice(5, 7)}` });
    }
    return out;
  }
  function build() {
    const secs = merged(TT.sections.filter(s => s.faculty === S.faculty && (S.practical || s.activity === 'نظري') && (S.grad || s.degree !== 'الماجستير')));
    const m = {};
    secs.forEach(s => {
      const c = m[s.code] || (m[s.code] = { code: s.code, name: s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), dept: s.department, degree: s.degree, students: 0, secs: 0, ins: new Set(), sl: [] });
      c.students += s.registered || 0; c.secs++; if (s.instructor) c.ins.add(s.instructor);
      if (s.registered) c.sl.push({ s: s.section, n: s.registered, ins: s.instructor || '' });
    });
    C = Object.values(m).filter(c => !S.excl[c.code]).sort((a, b) => a.code.localeCompare(b.code));
    C.forEach((c, i) => { c.i = i; c.lv = level(c); c.ins = [...c.ins]; });
    BY = Object.fromEntries(C.map(c => [c.code, c]));
    DAYS = examDays(); P = S.periods.length; NS = DAYS.length * P;
    const depts = [...new Set(C.map(c => c.dept))].sort();
    C.forEach(c => { c.col = U.PALETTE[depts.indexOf(c.dept) % U.PALETTE.length]; });
    // instructors → their courses
    INS = {}; C.forEach(c => c.ins.forEach(n => (INS[n] = INS[n] || []).push(c.i)));
    // who sits together
    G = [];
    const add = (name, codes, w, hard, kind) => { const ix = [...new Set(codes)].filter(k => BY[k]).map(k => BY[k].i); if (ix.length > 1) G.push({ name, c: ix, w, hard, kind }); };
    if (S.src !== 'reg' || !S.reg) {
      const inPlan = new Set();
      (PLANS.plans || []).filter(p => p.faculty === S.faculty).forEach(p => {
        const codes = p.groups.flatMap(g => g.courses.map(x => x.code)).filter(k => BY[k]);
        codes.forEach(k => inPlan.add(k));
        const byL = {}; codes.forEach(k => (byL[BY[k].lv] = byL[BY[k].lv] || []).push(k));
        const major = p.major || p.dept;
        Object.keys(byL).forEach(l => {
          add(`${major} · ${LV(+l)}`, byL[l], 10, true, 'cohort');
          if (byL[+l + 1] && +l < 4) add(`${major} · ${LV(+l)} و${LV(+l + 1)}`, byL[l].concat(byL[+l + 1]), 2, false, 'near');
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
  }
  // rooms: by default the rooms the faculty teaches in, with an exam capacity of half the largest class seen there
  function rooms() {
    if (!S.rooms) {
      const m = {};
      TT.sections.filter(s => s.faculty === S.faculty && s.room && s.room !== '0' && s.activity === 'نظري').forEach(s => { m[s.room] = Math.max(m[s.room] || 0, s.registered || 0); });
      S.rooms = Object.entries(m).filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]).slice(0, 24)
        .map(([n, c]) => ({ n, c: Math.max(15, Math.round(c * 0.6 / 5) * 5), on: true }));
    }
    return S.rooms;
  }
  let capTotal = 0;

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
      for (let k = 1; k < ks.length; k++) if (ks[k] - ks[k - 1] === 1) cost += W.backToBack;
    }
    return cost * g.w;
  }
  function seatCost(s, sl) {
    if (s < 0) return 0;
    let n = 0; C.forEach(c => { if (sl[c.i] === s) n += c.students; });
    return Math.max(0, n - capTotal) * W.seat + (capTotal ? n * n / capTotal * W.spread : 0);  // spread the load over the periods
  }
  function insCost(i, sl) {
    let cost = 0;
    C[i].ins.forEach(n => { const mine = sl[i]; if (mine < 0) return; INS[n].forEach(j => { if (j !== i && sl[j] === mine) cost += W.ins; }); });
    return cost;
  }
  // the part of the total that depends on course i
  function local(i, sl) {
    let cost = 0;
    C[i].g.forEach(g => { cost += groupCost(G[g], sl); });
    cost += seatCost(sl[i], sl) + insCost(i, sl) * 2 + (sl[i] >= 0 ? C[i].students * dayOf(sl[i]) * W.early : 0);
    return cost;
  }
  function delta(i, to, sl) {
    const from = sl[i]; if (from === to) return 0;
    const extraSeat = s => seatCost(s, sl);
    const before = local(i, sl) + extraSeat(to);
    sl[i] = to;
    const after = local(i, sl) + extraSeat(from);
    sl[i] = from;
    return after - before;
  }
  function total(sl) {
    let cost = 0;
    G.forEach(g => { cost += groupCost(g, sl); });
    for (let s = 0; s < NS; s++) cost += seatCost(s, sl);
    C.forEach(c => { cost += insCost(c.i, sl) + (sl[c.i] >= 0 ? c.students * dayOf(sl[c.i]) * W.early : 0); });
    return cost;
  }

  // ---------- solver ----------
  function solve(keep) {
    const sl = C.map(c => c.pin != null ? c.pin : keep && c.s >= 0 ? c.s : -1);
    const free = C.filter(c => c.pin == null);
    const weight = c => c.g.reduce((a, g) => a + (G[g].hard ? G[g].w * G[g].c.length : 0), 0) * 10 + c.students;
    free.filter(c => sl[c.i] < 0).sort((a, b) => weight(b) - weight(a)).forEach(c => {
      let best = 0, bd = Infinity;
      for (let s = 0; s < NS; s++) { const d = delta(c.i, s, sl) + Math.random() * 0.01; if (d < bd) { bd = d; best = s; } }
      sl[c.i] = best;
    });
    const t0 = performance.now(), budget = 900 + Math.min(1600, C.length * 12);
    let cur = total(sl), bestSl = sl.slice(), bestCost = cur, T = 30;
    while (performance.now() - t0 < budget && free.length) {
      const c = free[Math.floor(Math.random() * free.length)];
      if (Math.random() < 0.75) {
        let best = sl[c.i], bd = 0;
        for (let s = 0; s < NS; s++) { const d = delta(c.i, s, sl); if (d < bd || (d < T * Math.random() && Math.random() < 0.08)) { bd = d; best = s; } }
        if (best !== sl[c.i]) { cur += delta(c.i, best, sl); sl[c.i] = best; }
      } else {  // swap two exams
        const o = free[Math.floor(Math.random() * free.length)]; if (o === c || sl[o.i] === sl[c.i]) continue;
        const a = sl[c.i], b = sl[o.i];
        const before = total(sl); sl[c.i] = b; sl[o.i] = a; const after = total(sl);
        if (after <= before || after - before < T * Math.random() * 0.2) cur = after; else { sl[c.i] = a; sl[o.i] = b; }
      }
      T = Math.max(0.5, T * 0.9995);
      if (cur < bestCost - 1e-9) { bestCost = cur; bestSl = sl.slice(); }
    }
    C.forEach(c => { c.s = bestSl[c.i]; S.slot[c.code] = c.s; });
    save();
  }
  const SL = () => C.map(c => c.s);

  // ---------- rooms & proctors ----------
  function seating() {
    const R = rooms().filter(r => r.on).slice().sort((a, b) => b.c - a.c);
    const out = {}, load = {}, unseated = [];
    const pool = [...new Set(Object.keys(INS).concat(S.extraProc.split(/\n/).map(x => x.trim()).filter(Boolean)))];
    pool.forEach(n => { load[n] = 0; });
    for (let s = 0; s < NS; s++) {
      const list = C.filter(c => c.s === s).sort((a, b) => b.students - a.students);
      const freeR = R.slice(), busy = new Set();
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
      out[s].forEach(x => x.c.ins.forEach(n => busy.add(n)));
      out[s].forEach(x => {
        const own = x.c.ins.slice(), used = new Set();
        x.rooms.forEach(r => {
          const need = Math.max(1, Math.ceil(r.n / S.perProc)), mine = (r.ins || []).filter(n => !used.has(n));
          while (r.proc.length < need) {
            let n = mine.shift() || own.filter(o => !used.has(o)).shift();
            if (n) used.add(n);
            if (!n) { n = pool.filter(p => !busy.has(p)).sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0]; if (!n) break; busy.add(n); }
            r.proc.push(n); load[n] = (load[n] || 0) + 1;
          }
        });
      });
    }
    return { out, load, unseated };
  }

  // ---------- checks ----------
  function issues() {
    const sl = SL(), list = [];
    G.forEach(g => {
      const per = {}, day = {};
      g.c.forEach(i => { const s = sl[i]; if (s < 0) return; (per[s] = per[s] || []).push(i); (day[dayOf(s)] = day[dayOf(s)] || new Set()).add(s); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: g.hard ? 'clash' : 'soft', g, cs: v, txt: `${g.hard ? 'تعارض' : 'تعارض محتمل'}: ${v.map(i => C[i].code).join(' و ')} في الفترة نفسها` }));
      Object.entries(day).filter(([, v]) => v.size > S.maxDay).forEach(([d, v]) => list.push({ k: 'day', g, cs: g.c.filter(i => v.has(sl[i])), txt: `${v.size} امتحانات يوم ${DAYS[d].label}` }));
      Object.entries(day).forEach(([d, v]) => { const ks = [...v].sort((a, b) => a - b); for (let k = 1; k < ks.length; k++) if (ks[k] - ks[k - 1] === 1 && g.kind !== 'near') list.push({ k: 'b2b', g, cs: g.c.filter(i => sl[i] === ks[k] || sl[i] === ks[k - 1]), txt: `امتحانان متتاليان يوم ${DAYS[d].label}` }); });
    });
    Object.entries(INS).forEach(([n, ix]) => {
      const per = {}; ix.forEach(i => { if (sl[i] >= 0) (per[sl[i]] = per[sl[i]] || []).push(i); });
      Object.values(per).filter(v => v.length > 1).forEach(v => list.push({ k: 'ins', cs: v, txt: `${U.shortName(n)}: امتحانان لمقرريه في الفترة نفسها (${v.map(i => C[i].code).join('، ')})` }));
    });
    return list;
  }
  function stats() {
    const is = issues(), seat = seating(), reg = G.filter(g => g.kind === 'students');
    const stu = k => is.filter(x => x.k === k && x.g && x.g.kind === 'students').reduce((a, x) => a + x.g.w, 0);
    return { is, seat, clash: is.filter(x => x.k === 'clash').length, day: is.filter(x => x.k === 'day').length, b2b: is.filter(x => x.k === 'b2b').length,
      ins: is.filter(x => x.k === 'ins').length, soft: is.filter(x => x.k === 'soft').length, unseated: seat.unseated.reduce((a, u) => a + u.n, 0),
      stuClash: stu('clash'), stuDay: stu('day'), reg: reg.length, placed: C.filter(c => c.s >= 0).length };
  }

  // ---------- views ----------
  const slotLabel = s => s < 0 ? '—' : `${DAYS[dayOf(s)].label} · ${S.periods[s % P][0]}–${S.periods[s % P][1]}`;
  const card = c => `<div class="ex-card${sel === c.i ? ' sel' : ''}${c.pin != null ? ' pinned' : ''}" draggable="true" data-c="${c.i}" style="--c:${c.col[0]};--b:${c.col[1]}" title="${esc(c.name)} · ${esc(c.dept)} · ${c.students} طالب">
    <b>${esc(c.code)}</b>${c.pin != null ? ' <i class="bi bi-pin-angle-fill"></i>' : ''}<span>${esc(c.name)}</span><small><i class="bi bi-people-fill"></i> ${c.students} · ${esc(LV(c.lv))}</small></div>`;
  function head(st) {
    const ok = !st.clash && !st.unseated;
    return `<div class="ex-bar">
      <div class="ex-tabs" role="tablist">${[['grid', 'bi-calendar3-week', 'الجدول'], ['check', 'bi-clipboard2-check', 'الجودة'], ['out', 'bi-printer', 'المخرجات'], ['set', 'bi-sliders', 'الإعداد'], ['drafts', 'bi-layers', 'النسخ']]
        .map(([k, ic, t]) => `<button class="ex-tab${tab === k ? ' on' : ''}" data-tab="${k}"><i class="bi ${ic}"></i> ${t}${k === 'check' && st.is.length ? ` <span class="ex-n ${st.clash ? 'bad' : ''}">${st.is.length}</span>` : ''}</button>`).join('')}</div>
      <div class="ex-act"><span class="ex-score ${ok ? 'ok' : 'bad'}"><i class="bi ${ok ? 'bi-check-circle-fill' : 'bi-exclamation-octagon-fill'}"></i> ${ok ? 'بلا تعارض' : `${st.clash} تعارض${st.unseated ? ` · ${st.unseated} بلا مقعد` : ''}`}</span>
        <button class="btn btn-sm btn-ex" id="ex-solve"><i class="bi bi-magic"></i> توليد ذكي</button>
        <button class="btn btn-sm btn-outline-secondary" id="ex-improve" title="تحسين الجدول الحالي دون البدء من جديد"><i class="bi bi-stars"></i> تحسين</button>
        <button class="btn btn-sm btn-outline-secondary" id="ex-undo" ${undo.length ? '' : 'disabled'} title="تراجع"><i class="bi bi-arrow-counterclockwise"></i></button></div></div>
      <div class="ex-sum"><span><b>${C.length}</b> مقرراً</span><span><b>${C.reduce((a, c) => a + c.students, 0)}</b> مقعد امتحان</span><span><b>${DAYS.length}</b> يوماً × <b>${P}</b> فترات</span>
        <span><b>${rooms().filter(r => r.on).length}</b> قاعة (${capTotal} مقعد/فترة)</span><span class="src"><i class="bi bi-diagram-3"></i> ${S.src === 'reg' && S.reg ? 'كشف التسجيل' : S.src === 'both' && S.reg ? 'الخطط + كشف التسجيل' : 'الخطط الدراسية (تقدير)'}</span>
        <span>${esc(TYPES[S.type].name)}${S.approved ? ' · <b class="text-success">معتمدة: ' + esc(S.approved) + '</b>' : ''}</span></div>`;
  }
  function gridView() {
    if (!DAYS.length) return '<div class="alert alert-warning">لا توجد أيام امتحانات: راجع تاريخ البداية وعدد الأيام في «الإعداد».</div>';
    const sl = SL(), heat = {};
    if (sel != null) for (let s = 0; s < NS; s++) heat[s] = delta(sel, s, sl);
    const cls = d => d == null ? '' : d <= -1 ? 'h-good' : d < 1 ? 'h-ok' : d < 200 ? 'h-warn' : 'h-bad';
    const bad = new Set(issues().filter(x => x.k === 'clash' || x.k === 'ins').flatMap(x => x.cs));
    const selC = sel != null ? C[sel] : null;
    return `${selC ? `<div class="ex-hint"><i class="bi bi-hand-index-thumb"></i> نقل <b>${esc(selC.code)} ${esc(selC.name)}</b>: اختر خانة — <span class="h-good">أفضل</span> <span class="h-ok">مقبول</span> <span class="h-warn">يزيد الضغط</span> <span class="h-bad">تعارض</span>
        <button class="btn btn-sm btn-outline-secondary" data-pin="${sel}"><i class="bi bi-pin-angle"></i> ${selC.pin != null ? 'إلغاء التثبيت' : 'تثبيت في مكانه'}</button><button class="btn btn-sm btn-link" data-unsel>إلغاء</button></div>`
      : '<div class="ex-hint soft"><i class="bi bi-info-circle"></i> اسحب أي امتحان إلى خانة أخرى، أو اضغط عليه ثم على الخانة؛ تتلوّن الخانات حسب جودة النقل.</div>'}
      <div class="ex-grid-wrap"><table class="ex-grid"><thead><tr><th>اليوم</th>${S.periods.map((p, k) => `<th>الفترة ${k + 1}<small dir="ltr">${p[0]}–${p[1]}</small></th>`).join('')}</tr></thead><tbody>
      ${DAYS.map((d, di) => `<tr><th class="day">${esc(d.wd)}<small>${+d.iso.slice(8)}/${+d.iso.slice(5, 7)}</small></th>${S.periods.map((p, k) => {
        const s = di * P + k, list = C.filter(c => c.s === s), seats = list.reduce((a, c) => a + c.students, 0);
        return `<td class="ex-cell ${cls(heat[s])}" data-s="${s}"><div class="cap ${seats > capTotal ? 'over' : ''}">${seats ? `${seats}/${capTotal}` : ''}</div>${list.map(c => card(c).replace('ex-card', 'ex-card' + (bad.has(c.i) ? ' bad' : ''))).join('')}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      ${C.some(c => c.s < 0) ? `<h6 class="mt-3">غير مجدولة</h6><div class="ex-pool ex-cell" data-s="-1">${C.filter(c => c.s < 0).map(card).join('')}</div>` : ''}`;
  }
  function checkView(st) {
    const k = (n, t, ic, good) => `<div class="ex-kpi ${n ? (good ? 'warn' : 'bad') : 'ok'}"><i class="bi ${ic}"></i><b>${n}</b><span>${t}</span></div>`;
    const loads = Object.values(st.seat.load).filter(Boolean), mx = Math.max(0, ...loads), mn = loads.length ? Math.min(...loads) : 0;
    const groups = { clash: 'تعارضات (يجب أن تكون صفراً)', ins: 'تعارض لمدرّس', day: `أكثر من ${S.maxDay} امتحان في اليوم`, b2b: 'امتحانات متتالية', soft: 'تعارض محتمل بين سنتين متتاليتين' };
    return `<div class="ex-kpis">${k(st.clash, 'تعارض إلزامي', 'bi-x-octagon')}${k(st.unseated, 'طالب بلا مقعد', 'bi-door-closed')}${k(st.ins, 'تعارض مدرّس', 'bi-person-x', 1)}
      ${k(st.day, `يوم بأكثر من ${S.maxDay} امتحان`, 'bi-calendar-x', 1)}${k(st.b2b, 'امتحانان متتاليان', 'bi-arrow-left-right', 1)}${k(st.soft, 'تعارض محتمل', 'bi-question-diamond', 1)}
      <div class="ex-kpi info"><i class="bi bi-person-badge"></i><b>${mn}–${mx}</b><span>مراقبات لكل مدرّس</span></div>
      ${st.reg ? `<div class="ex-kpi ${st.stuClash ? 'bad' : 'ok'}"><i class="bi bi-people"></i><b>${st.stuClash}</b><span>طالب لديه تعارض (من الكشف)</span></div><div class="ex-kpi ${st.stuDay ? 'warn' : 'ok'}"><i class="bi bi-people"></i><b>${st.stuDay}</b><span>طالب بأكثر من ${S.maxDay} في اليوم</span></div>` : ''}</div>
      ${S.src === 'plans' || !S.reg ? '<div class="alert alert-info small"><i class="bi bi-info-circle"></i> التعارضات هنا مقدّرة من الخطط الدراسية (التخصص × السنة). لنتيجة دقيقة لكل طالب ارفع كشف التسجيل من «الإعداد».</div>' : ''}
      ${Object.entries(groups).map(([kk, t]) => { const l = st.is.filter(x => x.k === kk); return l.length ? `<h6 class="ex-h">${t} <span class="ex-n">${l.length}</span></h6><ul class="ex-issues">${l.slice(0, 80).map(x =>
        `<li><span>${esc(x.txt)}${x.g ? ` <small>· ${esc(x.g.name)}</small>` : ''}</span><button class="btn btn-sm btn-link" data-go="${x.cs[0]}">عرض</button></li>`).join('')}</ul>` : ''; }).join('')}
      ${st.seat.unseated.length ? `<h6 class="ex-h">نقص المقاعد</h6><ul class="ex-issues">${st.seat.unseated.map(u => `<li><span>${esc(u.c.code)} ${esc(u.c.name)}: ${u.n} طالب بلا قاعة (${esc(slotLabel(u.s))})</span><button class="btn btn-sm btn-link" data-go="${u.c.i}">عرض</button></li>`).join('')}</ul>` : ''}
      ${!st.is.length && !st.unseated ? '<div class="ex-empty"><i class="bi bi-patch-check-fill"></i> الجدول نظيف: لا تعارض ولا ضغط زائد ولا نقص مقاعد.</div>' : ''}`;
  }
  // ---------- outputs ----------
  const OUT = { all: 'الجدول الكامل', dept: 'حسب القسم', cohort: 'حسب التخصص والسنة (للطلبة)', ins: 'حسب المدرّس (امتحانات ومراقبات)', room: 'حسب القاعة' };
  function outData() {
    const { out } = seating(), rows = [];
    for (let s = 0; s < NS; s++) (out[s] || []).forEach(x => rows.push({ s, c: x.c, rooms: x.rooms, left: x.left }));
    rows.sort((a, b) => a.s - b.s || a.c.code.localeCompare(b.c.code));
    const d = r => DAYS[dayOf(r.s)], tm = r => `${S.periods[r.s % P][0]}–${S.periods[r.s % P][1]}`;
    const base = r => [d(r).wd, d(r).iso, tm(r), r.c.code, r.c.name];
    const rm = r => r.rooms.map(x => `${x.room} (${x.n}${x.secs && x.secs.length && r.c.sl.length > 1 ? ' · ش ' + x.secs.join('،') : ''})`).join('، ') + (r.left ? ` + ${r.left} بلا قاعة` : '');
    const pr = r => [...new Set(r.rooms.flatMap(x => x.proc))].map(U.shortName).join('، ');
    const H = ['اليوم', 'التاريخ', 'الوقت', 'الرمز', 'المقرر'];
    const sec = (title, columns, list) => ({ title, columns, rows: list });
    if (outView === 'all') return [sec('', H.concat(['القسم', 'الطلبة', 'القاعات', 'المراقبون']), rows.map(r => base(r).concat([r.c.dept, r.c.students, rm(r), pr(r)])))];
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
  function outView_() {
    const secs = outData();
    return `<div class="ex-outbar"><select class="form-select form-select-sm" id="ex-outv">${Object.entries(OUT).map(([k, t]) => `<option value="${k}" ${outView === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn btn-sm btn-ex" id="ex-print"><i class="bi bi-printer"></i> طباعة / PDF</button><button class="btn btn-sm btn-outline-secondary" id="ex-xlsx"><i class="bi bi-file-earmark-excel"></i> Excel</button>
      <button class="btn btn-sm btn-outline-secondary" id="ex-csv"><i class="bi bi-filetype-csv"></i> CSV</button></div>
      ${secs.map(s => `${s.title ? `<h6 class="ex-h">${esc(s.title)} <span class="ex-n">${s.rows.length}</span></h6>` : ''}<div class="table-responsive"><table class="table table-sm ex-out"><thead><tr>${s.columns.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.columns.length}" class="text-muted">لا شيء</td></tr>`}</tbody></table></div>`).join('')}`;
  }
  const title = () => `${TYPES[S.type].name} – ${S.faculty}`;
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
  // ---------- settings ----------
  function setView() {
    const all = (() => { const m = {}; merged(TT.sections.filter(s => s.faculty === S.faculty && (S.practical || s.activity === 'نظري') && (S.grad || s.degree !== 'الماجستير'))).forEach(s => { const c = m[s.code] || (m[s.code] = { code: s.code, name: s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), dept: s.department, n: 0 }); c.n += s.registered || 0; }); return Object.values(m).sort((a, b) => a.code.localeCompare(b.code)); })();
    const facs = [...new Set(TT.sections.map(s => s.faculty))].sort();
    return `<div class="ex-set">
      <section><h6><i class="bi bi-calendar-range"></i> نوع الامتحانات وأيامها</h6>
        <label>النوع<select class="form-select form-select-sm" data-k="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${S.type === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
        <label>الكلية<select class="form-select form-select-sm" data-k="faculty">${facs.map(f => `<option ${S.faculty === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <div class="row2"><label>أول يوم<input type="date" class="form-control form-control-sm" data-k="start" value="${S.start}"></label><label>عدد الأيام<input type="number" min="1" max="40" class="form-control form-control-sm" data-k="days" value="${S.days}"></label></div>
        <div class="ex-chips">أيام لا امتحانات فيها: ${WD.map((w, i) => `<label class="ex-chip"><input type="checkbox" data-off="${i}" ${S.off.includes(i) ? 'checked' : ''}> ${w}</label>`).join('')}</div>
        <label>عطل رسمية (تواريخ بصيغة 2027-01-15، كل تاريخ في سطر)<textarea class="form-control form-control-sm" rows="2" data-k="hol">${esc(S.hol)}</textarea></label>
        <div class="ex-days">${DAYS.map(d => `<span>${esc(d.label)}</span>`).join('')}</div></section>
      <section><h6><i class="bi bi-clock"></i> الفترات اليومية</h6>
        ${S.periods.map((p, k) => `<div class="row3"><span>الفترة ${k + 1}</span><input type="time" class="form-control form-control-sm" data-p="${k}" data-e="0" value="${p[0]}"><input type="time" class="form-control form-control-sm" data-p="${k}" data-e="1" value="${p[1]}"><button class="btn btn-sm btn-outline-danger" data-delp="${k}" ${P < 2 ? 'disabled' : ''}><i class="bi bi-x"></i></button></div>`).join('')}
        <button class="btn btn-sm btn-outline-secondary" data-addp><i class="bi bi-plus"></i> فترة</button>
        <h6 class="mt-3"><i class="bi bi-rulers"></i> القواعد</h6>
        <div class="row2"><label>أقصى عدد امتحانات للطالب في اليوم<input type="number" min="1" max="4" class="form-control form-control-sm" data-k="maxDay" value="${S.maxDay}"></label>
        <label>طالب لكل مراقب<input type="number" min="10" max="80" class="form-control form-control-sm" data-k="perProc" value="${S.perProc}"></label></div>
        <label class="ex-chip"><input type="checkbox" data-k="practical" ${S.practical ? 'checked' : ''}> تضمين الشعب العملية</label> <label class="ex-chip"><input type="checkbox" data-k="grad" ${S.grad ? 'checked' : ''}> تضمين الماجستير</label>
        <p class="small text-muted mt-2">الإلزامي: لا تعارض لطالب، لا تجاوز لسعة القاعات. المرغوب: ألّا يزيد عن الحد اليومي، تجنّب امتحانين متتاليين، ألّا يتزامن امتحانان لمدرّس واحد، والمقررات الكبيرة مبكراً.</p></section>
      <section><h6><i class="bi bi-people"></i> مصدر بيانات الطلبة</h6>
        ${[['plans', 'الخطط الدراسية (تقدير حسب التخصص والسنة)'], ['reg', 'كشف التسجيل فقط (دقيق)'], ['both', 'الاثنان معاً']].map(([k, t]) => `<label class="ex-chip d-block"><input type="radio" name="src" data-src="${k}" ${S.src === k ? 'checked' : ''}> ${t}</label>`).join('')}
        <label class="mt-2">رفع كشف التسجيل (Excel أو CSV): عمود رقم الطالب وعمود رمز المادة<input type="file" class="form-control form-control-sm" id="ex-reg" accept=".csv,.xlsx,.xls"></label>
        <p class="small ${S.reg ? 'text-success' : 'text-muted'}">${S.reg ? `<i class="bi bi-check-circle"></i> ${esc(S.regInfo)} <button class="btn btn-sm btn-link text-danger" data-clrreg>حذف الكشف</button>` : 'لا يُحفظ رقم أي طالب: تُحفظ فقط مجموعات المواد وعدد طلبتها، على هذا الجهاز وحده.'}</p></section>
      <section><h6><i class="bi bi-door-open"></i> القاعات وسعتها الامتحانية</h6>
        <p class="small text-muted">مقترحة من قاعات الكلية بسعة امتحانية تقريبية (مقعد فارغ بين كل طالبين)؛ عدّلها كما تشاء.</p>
        <div class="ex-rooms">${rooms().map((r, k) => `<div class="row3"><input type="checkbox" data-ron="${k}" ${r.on ? 'checked' : ''}><input class="form-control form-control-sm" data-rn="${k}" value="${esc(r.n)}"><input type="number" class="form-control form-control-sm" data-rc="${k}" value="${r.c}" min="1"><button class="btn btn-sm btn-outline-danger" data-delr="${k}"><i class="bi bi-x"></i></button></div>`).join('')}</div>
        <button class="btn btn-sm btn-outline-secondary" data-addr><i class="bi bi-plus"></i> قاعة</button> <button class="btn btn-sm btn-link" data-resetr>إعادة الاقتراح</button>
        <label class="mt-2">مراقبون إضافيون (اسم في كل سطر)<textarea class="form-control form-control-sm" rows="2" data-k="extraProc">${esc(S.extraProc)}</textarea></label></section>
      <section class="wide"><h6><i class="bi bi-list-check"></i> المقررات (${all.length})</h6><p class="small text-muted">أزل علامة المقرر الذي لا امتحان له في هذه الدورة (مشروع تخرج، تدريب…).</p>
        <div class="ex-courses">${all.map(c => `<label class="ex-chip"><input type="checkbox" data-incl="${esc(c.code)}" ${S.excl[c.code] ? '' : 'checked'}> <b>${esc(c.code)}</b> ${esc(c.name)} <small>${c.n}</small></label>`).join('')}</div></section></div>`;
  }
  function draftsView() {
    return `<div class="ex-set"><section><h6><i class="bi bi-save"></i> حفظ نسخة</h6>
      <div class="row2"><input class="form-control form-control-sm" id="ex-dname" placeholder="اسم النسخة، مثل: مسودة 1"><button class="btn btn-sm btn-ex" id="ex-dsave"><i class="bi bi-save"></i> حفظ</button></div>
      <ul class="ex-issues mt-2">${S.drafts.map((d, k) => `<li><span><b>${esc(d.name)}</b> <small>${esc(d.at)} · ${d.n} مقرر</small>${S.approved === d.name ? ' <span class="badge bg-success">معتمدة</span>' : ''}</span>
        <span><button class="btn btn-sm btn-link" data-dload="${k}">فتح</button><button class="btn btn-sm btn-link text-success" data-dapp="${k}">اعتماد</button><button class="btn btn-sm btn-link text-danger" data-ddel="${k}">حذف</button></span></li>`).join('') || '<li class="text-muted">لا نسخ محفوظة بعد.</li>'}</ul></section>
      <section><h6><i class="bi bi-share"></i> المشاركة مع اللجنة</h6><p class="small text-muted">صدّر الخطة كملف وأرسله لأعضاء اللجنة؛ يفتحونه هنا بـ«استيراد» ليروا الجدول نفسه ويعدّلوا عليه.</p>
        <button class="btn btn-sm btn-outline-secondary" id="ex-export"><i class="bi bi-download"></i> تصدير ملف الخطة</button>
        <label class="btn btn-sm btn-outline-secondary mb-0"><i class="bi bi-upload"></i> استيراد<input type="file" id="ex-import" accept=".json" hidden></label>
        <hr><button class="btn btn-sm btn-outline-danger" id="ex-reset"><i class="bi bi-trash"></i> بدء خطة جديدة</button></section></div>`;
  }

  // ---------- render & events ----------
  function render() {
    const st = stats();
    $(APP).innerHTML = head(st) + `<div class="ex-body">${tab === 'grid' ? gridView() : tab === 'check' ? checkView(st) : tab === 'out' ? outView_() : tab === 'set' ? setView() : draftsView()}</div>`;
  }
  const push = () => { undo.push(JSON.stringify({ slot: S.slot, pins: S.pins })); if (undo.length > 40) undo.shift(); };
  function move(i, s) {
    if (C[i].s === s) return;
    push(); C[i].s = s; S.slot[C[i].code] = s; if (C[i].pin != null) { C[i].pin = s; S.pins[C[i].code] = s; }
    save(); sel = null; render();
  }
  function busy(fn) {
    $(APP).querySelector('.ex-body').insertAdjacentHTML('afterbegin', '<div class="ex-busy"><div class="spinner-border spinner-border-sm"></div> يبحث عن أفضل توزيع…</div>');
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
    app.addEventListener('click', e => {
      const t = e.target.closest('button,[data-c],.ex-cell,[data-tab]'); if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; sel = null; render(); return; }
      if (t.id === 'ex-solve') { push(); busy(() => solve(false)); return; }
      if (t.id === 'ex-improve') { push(); busy(() => solve(true)); return; }
      if (t.id === 'ex-undo') { const u = undo.pop(); if (u) { Object.assign(S, JSON.parse(u)); rebuild(); } return; }
      if (t.id === 'ex-print') return doPrint();
      if (t.id === 'ex-xlsx') return doXLSX();
      if (t.id === 'ex-csv') return doCSV();
      if (t.dataset.c != null && tab === 'grid') {
        const i = +t.dataset.c, cell = t.closest('.ex-cell');
        if (sel != null && sel !== i && cell) { move(sel, +cell.dataset.s); return; }  // with an exam picked, a tap anywhere in a cell moves it there
        sel = sel === i ? null : i; render(); return;
      }
      if (t.classList.contains('ex-cell') && sel != null) { move(sel, +t.dataset.s); return; }
      if (t.dataset.go != null) { tab = 'grid'; sel = +t.dataset.go; render(); const el = app.querySelector(`[data-c="${sel}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (t.dataset.pin != null) { const c = C[+t.dataset.pin]; push(); if (c.pin != null) { c.pin = null; delete S.pins[c.code]; } else { c.pin = c.s; S.pins[c.code] = c.s; } save(); render(); return; }
      if (t.hasAttribute('data-unsel')) { sel = null; render(); return; }
      if (t.hasAttribute('data-addp')) { const l = S.periods[P - 1] || ['09:00', '11:00']; S.periods.push([l[1], l[1]]); rebuild(); return; }
      if (t.dataset.delp != null) { S.periods.splice(+t.dataset.delp, 1); S.slot = {}; rebuild(); return; }
      if (t.hasAttribute('data-addr')) { rooms().push({ n: 'قاعة جديدة', c: 30, on: true }); rebuild(); return; }
      if (t.dataset.delr != null) { rooms().splice(+t.dataset.delr, 1); rebuild(); return; }
      if (t.hasAttribute('data-resetr')) { S.rooms = null; rebuild(); return; }
      if (t.hasAttribute('data-clrreg')) { S.reg = null; S.regInfo = ''; S.src = 'plans'; rebuild(); return; }
      if (t.id === 'ex-dsave') { const n = ($('#ex-dname').value || '').trim() || `نسخة ${S.drafts.length + 1}`; S.drafts.unshift({ name: n, at: new Date().toLocaleString('ar-JO'), n: C.length, slot: { ...S.slot }, pins: { ...S.pins } }); save(); render(); return; }
      if (t.dataset.dload != null) { const d = S.drafts[+t.dataset.dload]; push(); S.slot = { ...d.slot }; S.pins = { ...d.pins }; tab = 'grid'; rebuild(); return; }
      if (t.dataset.dapp != null) { const d = S.drafts[+t.dataset.dapp]; S.approved = S.approved === d.name ? null : d.name; S.slot = { ...d.slot }; S.pins = { ...d.pins }; rebuild(); return; }
      if (t.dataset.ddel != null) { S.drafts.splice(+t.dataset.ddel, 1); save(); render(); return; }
      if (t.id === 'ex-export') { U.download(`خطة_${title()}.json`.replace(/\s+/g, '_'), JSON.stringify(S), 'application/json'); return; }
      if (t.id === 'ex-reset') { if (confirm('بدء خطة جديدة؟ ستُحذف الخطة الحالية (تبقى النسخ المحفوظة).')) { const d = S.drafts; S = fresh(S.type); S.drafts = d; rebuild(); } }
    });
    app.addEventListener('change', e => {
      const t = e.target, k = t.dataset.k;
      if (k === 'type') { const d = S.drafts; const f = fresh(t.value); Object.assign(S, { type: t.value, periods: f.periods, days: f.days, slot: {}, pins: {}, approved: null }); S.drafts = d; rebuild(); return; }
      if (k === 'faculty') { S.faculty = t.value; S.rooms = null; S.excl = {}; S.slot = {}; S.pins = {}; rebuild(); return; }
      if (k) { S[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(+t.min || 0, +t.value || 0) : t.value; rebuild(); return; }
      if (t.dataset.off != null) { const i = +t.dataset.off; S.off = t.checked ? S.off.concat(i) : S.off.filter(x => x !== i); rebuild(); return; }
      if (t.dataset.p != null) { S.periods[+t.dataset.p][+t.dataset.e] = t.value; rebuild(); return; }
      if (t.dataset.src) { S.src = t.dataset.src; rebuild(); return; }
      if (t.dataset.ron != null) { rooms()[+t.dataset.ron].on = t.checked; rebuild(); return; }
      if (t.dataset.rn != null) { rooms()[+t.dataset.rn].n = t.value.trim(); rebuild(); return; }
      if (t.dataset.rc != null) { rooms()[+t.dataset.rc].c = Math.max(1, +t.value || 1); rebuild(); return; }
      if (t.dataset.incl) { if (t.checked) delete S.excl[t.dataset.incl]; else S.excl[t.dataset.incl] = 1; rebuild(); return; }
      if (t.id === 'ex-outv') { outView = t.value; render(); return; }
      if (t.id === 'ex-reg' && t.files[0]) { readReg(t.files[0]); return; }
      if (t.id === 'ex-import' && t.files[0]) { t.files[0].text().then(x => { const o = JSON.parse(x); if (!o.type || !o.periods) throw 0; S = o; tab = 'grid'; rebuild(); }).catch(() => alert('الملف ليس خطة امتحانات صالحة.')); }
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
  .ex-gate .box { width: min(100%, 400px); background: #fff; color: #091b22; border-radius: 18px; padding: 1.5rem; display: flex; flex-direction: column; gap: .7rem; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  .ex-gate .ic { width: 60px; height: 60px; margin: 0 auto; border-radius: 50%; background: #f8e3e5; color: #901d23; display: grid; place-items: center; font-size: 1.7rem; }
  .ex-gate h2 { font-size: 1.25rem; font-weight: 800; margin: 0; } .ex-gate p { font-size: .9rem; color: #5b6b72; margin: 0; } .ex-gate label { text-align: start; font-weight: 600; font-size: .9rem; }
  .ex-gate .err { color: #b42318; font-size: .9rem; } .ex-gate .back { font-size: .85rem; color: #5b6b72; } .ex-gate .rem { font-weight: 400; }
  .btn-ex { background: #901d23; color: #fff; border: 0; } .btn-ex:hover { background: #6f151a; color: #fff; }
  .ex-bar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; justify-content: space-between; margin: .4rem 0 .5rem; }
  .ex-tabs { display: flex; flex-wrap: wrap; gap: .3rem; } .ex-tab { border: 1px solid #d9dfe3; background: #fff; border-radius: 999px; padding: .3rem .8rem; font-weight: 700; font-size: .9rem; color: #091b22; }
  .ex-tab.on { background: #091b22; color: #fff; border-color: #091b22; } .ex-n { display: inline-block; min-width: 1.4em; padding: 0 .35em; border-radius: 999px; background: #e9ecef; color: #091b22; font-size: .75rem; text-align: center; } .ex-n.bad { background: #b42318; color: #fff; }
  .ex-act { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; } .ex-score { font-weight: 700; font-size: .85rem; padding: .25rem .6rem; border-radius: 999px; } .ex-score.ok { background: #e4f5e9; color: #15803d; } .ex-score.bad { background: #fde8e8; color: #b42318; }
  .ex-sum { display: flex; flex-wrap: wrap; gap: .3rem .9rem; font-size: .85rem; color: #4a5a61; margin-bottom: .6rem; } .ex-sum b { color: #091b22; }
  .ex-hint { background: #fff8e6; border: 1px solid #f3d38b; border-radius: 10px; padding: .45rem .7rem; font-size: .88rem; margin-bottom: .5rem; display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; } .ex-hint.soft { background: #f1f5f7; border-color: #dde4e8; }
  .ex-hint span[class^=h-] { padding: 0 .4rem; border-radius: 6px; }
  .ex-grid-wrap { overflow-x: auto; } .ex-grid { width: 100%; border-collapse: separate; border-spacing: 4px; min-width: 520px; table-layout: fixed; }
  .ex-grid thead th { background: #091b22; color: #fff; border-radius: 8px; padding: .35rem; text-align: center; font-size: .85rem; } .ex-grid th small { display: block; font-weight: 400; opacity: .8; }
  .ex-grid th.day { background: #f1f5f7; color: #091b22; border-radius: 8px; width: 78px; text-align: center; font-size: .85rem; } .ex-grid thead th:first-child { width: 78px; }
  .ex-cell { background: #fafbfc; border: 1px dashed #d5dce0; border-radius: 10px; padding: 3px; vertical-align: top; min-height: 60px; height: 64px; cursor: pointer; }
  .ex-cell .cap { font-size: .68rem; color: #6b7a80; text-align: left; } .ex-cell .cap.over { color: #b42318; font-weight: 700; }
  .ex-cell.h-good, span.h-good { background: #dcf3e3; } .ex-cell.h-ok, span.h-ok { background: #f2f7f3; } .ex-cell.h-warn, span.h-warn { background: #fff1d6; } .ex-cell.h-bad, span.h-bad { background: #fde2e2; }
  .ex-card { background: var(--b); border-inline-start: 4px solid var(--c); border-radius: 7px; padding: 2px 5px; margin: 2px 0; font-size: .74rem; line-height: 1.25; cursor: grab; user-select: none; }
  .ex-card b { color: var(--c); } .ex-card span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #091b22; } .ex-card small { color: #5b6b72; }
  .ex-card.sel { outline: 2px solid #091b22; box-shadow: 0 2px 8px rgba(0,0,0,.2); } .ex-card.bad { outline: 2px solid #b42318; } .ex-card.pinned { box-shadow: inset 0 0 0 1px var(--c); }
  .ex-pool { display: flex; flex-wrap: wrap; gap: 4px; height: auto; } .ex-pool .ex-card { width: 170px; }
  .ex-busy { position: sticky; top: 70px; z-index: 5; background: #091b22; color: #fff; border-radius: 10px; padding: .4rem .8rem; margin-bottom: .5rem; display: inline-flex; gap: .5rem; align-items: center; }
  .ex-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .5rem; margin-bottom: .8rem; }
  .ex-kpi { border-radius: 12px; padding: .6rem .7rem; display: grid; grid-template-columns: auto 1fr; gap: 0 .5rem; align-items: center; border: 1px solid #e3e8eb; }
  .ex-kpi i { grid-row: span 2; font-size: 1.4rem; } .ex-kpi b { font-size: 1.3rem; } .ex-kpi span { font-size: .8rem; color: #4a5a61; }
  .ex-kpi.ok { background: #effaf2; color: #15803d; } .ex-kpi.bad { background: #fdeeee; color: #b42318; } .ex-kpi.warn { background: #fff6e4; color: #9a5b00; } .ex-kpi.info { background: #eef4f8; color: #0b4a66; }
  .ex-h { margin: .9rem 0 .4rem; font-weight: 800; color: #091b22; }
  .ex-issues { list-style: none; padding: 0; margin: 0; } .ex-issues li { display: flex; justify-content: space-between; gap: .5rem; align-items: center; border-bottom: 1px solid #edf0f2; padding: .3rem 0; font-size: .88rem; }
  .ex-empty { text-align: center; padding: 2rem; color: #15803d; font-weight: 700; font-size: 1.05rem; } .ex-empty i { font-size: 2rem; display: block; }
  .ex-outbar { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .6rem; } .ex-outbar select { width: auto; max-width: 100%; }
  .ex-out thead th { background: #091b22; color: #fff; font-size: .82rem; } .ex-out td { font-size: .85rem; }
  .ex-set { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: .8rem; } .ex-set section { border: 1px solid #e3e8eb; border-radius: 14px; padding: .8rem; background: #fff; } .ex-set section.wide { grid-column: 1 / -1; }
  .ex-set h6 { font-weight: 800; color: #901d23; } .ex-set label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .45rem; }
  .ex-set .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; align-items: end; } .ex-set .row3 { display: grid; grid-template-columns: auto 1fr 1fr auto; gap: .35rem; align-items: center; margin-bottom: .3rem; }
  .ex-chips { font-size: .85rem; margin-bottom: .4rem; } .ex-chip { display: inline-flex !important; gap: .3rem; align-items: center; font-weight: 400 !important; margin-inline-end: .6rem; }
  .ex-days { display: flex; flex-wrap: wrap; gap: .25rem; } .ex-days span { background: #f1f5f7; border-radius: 6px; padding: 0 .4rem; font-size: .75rem; }
  .ex-courses { columns: 2 320px; } .ex-courses .ex-chip { display: flex !important; break-inside: avoid; font-size: .82rem; }
  .ex-rooms { max-height: 280px; overflow: auto; }
  [data-theme=dark] .ex-cell { background: #13232a; border-color: #2c4048; } [data-theme=dark] .ex-card span, [data-theme=dark] .ex-sum b, [data-theme=dark] .ex-h { color: #e8eef0; }
  [data-theme=dark] .ex-card { background: #1b2f37; } [data-theme=dark] .ex-set section, [data-theme=dark] .ex-tab { background: #13232a; color: #e8eef0; border-color: #2c4048; }
  [data-theme=dark] .ex-grid th.day { background: #1b2f37; color: #e8eef0; }
  @media (max-width: 640px) { .ex-grid { min-width: 0; border-spacing: 2px; } .ex-grid thead th:first-child, .ex-grid th.day { width: 52px; font-size: .72rem; } .ex-card { font-size: .66rem; padding: 1px 3px; } .ex-card span, .ex-card small { display: none; } .ex-cell .cap { display: none; } .ex-cell { height: 46px; } .ex-set .row2 { grid-template-columns: 1fr; } }
  @media print { .ex-bar, .ex-hint { display: none; } }`;
  document.head.insertAdjacentHTML('beforeend', `<style id="ex-css">${CSS}</style>`);

  gate.then(() => Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/study_plans.json')])).then(([tt, plans]) => {
    TT = tt; PLANS = plans;
    U.updatedLine(tt.updated, tt.term);
    const q = $('#pg-q');
    if (q) q.addEventListener('input', () => { const v = U.norm(q.value.trim()); if (!v) return; const c = C.find(x => U.norm(x.code + ' ' + x.name).includes(v)); if (c) { tab = 'grid'; sel = c.i; render(); const el = $(APP).querySelector(`[data-c="${c.i}"]`); if (el) el.scrollIntoView({ block: 'center' }); } });
    build();
    wire();
    if (!C.some(c => c.s >= 0) && C.length) { render(); busy(() => solve(false)); } else render();
  }).catch(e => { console.error(e); $(APP).innerHTML = '<div class="alert alert-warning">تعذّر تحميل البيانات. أعد المحاولة بعد قليل.</div>'; });
})();
