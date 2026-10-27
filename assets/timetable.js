/* Study timetable: data/timetable.json (from edugate.uop.edu.jo/timetable, refreshed hourly) */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const WEEK = ['ح', 'ن', 'ث', 'ر', 'خ', 'س', 'ج'];  // Sunday first, as the university week
  const MODE = {
    'وجاهي': { icon: 'bi-person-fill', cls: 'm-f2f' },
    'الكتروني كامل': { icon: 'bi-camera-video-fill', cls: 'm-online' },
    'غير متزامن': { icon: 'bi-hourglass-split', cls: 'm-async' },
    'مدمج': { icon: 'bi-intersect', cls: 'm-blend' },
  };
  const PAGE = 50;
  let DATA, S, DAYS;

  // ------------------------------------------------------------------ filters (all kept in the URL)
  const F = [  // key, label, value(s) of a section
    ['fac', 'الكلية', s => [s.faculty]],
    ['dept', 'القسم', s => [s.department]],
    ['deg', 'الدرجة العلمية', s => [s.degree]],
    ['type', 'نوع الدراسة', s => [s.study_type]],
    ['act', 'النشاط', s => [s.activity]],
    ['status', 'الحالة', s => [s.status]],
    ['day', 'اليوم', s => [...new Set(s.meetings.map(m => m.day))]],
    ['time', 'وقت البداية', s => [...new Set(s.meetings.map(m => m.start))]],
    ['mode', 'نمط التدريس', s => [...new Set(s.meetings.map(m => m.mode))]],
    ['bld', 'المبنى', s => [s.building]],
    ['room', 'القاعة', s => [s.room]],
    ['inst', 'المدرس', s => [s.instructor]],
    ['sec', 'الشعبة', s => [s.section]],
  ];
  const FK = F.map(f => f[0]);
  const label = (k, v) => k === 'day' ? DAYS[v] || v : v;

  function readState() {
    const p = new URLSearchParams(location.search);
    const st = { q: p.get('q') || '', view: p.get('view') || 'table', sort: p.get('sort') || 'code', page: +(p.get('page') || 1),
      rows: p.get('rows') || 'time', seats: p.get('seats') || '',
      // free-time view: chosen instructors, working window, Saturday, asynchronous meetings
      ppl: p.get('ppl') ? p.get('ppl').split('|') : [], from: p.get('from') || '08:00', to: p.get('to') || '16:00',
      sat: p.get('sat') || '', async: p.get('async') || '',
      mx: p.get('mx') || 'load', mxday: p.get('mxday') || '' };
    FK.forEach(k => st[k] = p.get(k) || '');
    return st;
  }
  function writeState(st) {
    const p = new URLSearchParams();
    ['q', ...FK, 'seats'].forEach(k => { if (st[k]) p.set(k, st[k]); });
    if (st.view !== 'table') p.set('view', st.view);
    if (st.sort !== 'code') p.set('sort', st.sort);
    if (st.rows !== 'time') p.set('rows', st.rows);
    if (st.page > 1) p.set('page', st.page);
    if (st.ppl.length) p.set('ppl', st.ppl.join('|'));
    if (st.from !== '08:00') p.set('from', st.from);
    if (st.to !== '16:00') p.set('to', st.to);
    if (st.sat) p.set('sat', st.sat);
    if (st.async) p.set('async', st.async);
    if (st.mx !== 'load') p.set('mx', st.mx);
    if (st.mxday) p.set('mxday', st.mxday);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }
  function hay(s) {
    return s._hay || (s._hay = norm([s.code, s.name, s.instructor, s.room, s.building, s.faculty, s.department, s.time].join(' ')));
  }
  function matches(s, st, skip) {
    if (st.q && skip !== 'q') {
      const words = norm(st.q.trim()).split(/\s+/);
      if (!words.every(w => hay(s).includes(w))) return false;
    }
    // once an instructor is chosen, all of their sections count, also those outside the chosen faculty/department
    // (faculty and department only narrow the instructor list)
    const byInst = st.inst && skip !== 'inst';
    for (const [k, , get] of F) {
      if (byInst && (k === 'fac' || k === 'dept')) continue;
      if (st[k] && k !== skip && !get(s).includes(st[k])) return false;
    }
    if (st.seats === 'free' && skip !== 'seats' && !(s.registered < s.capacity)) return false;
    return true;
  }
  function counts(st, k, get) {
    const c = {};
    // choosing a faculty clears the department, so the faculty counts ignore the department filter
    const base = k === 'fac' ? Object.assign({}, st, { dept: '' }) : st;
    S.forEach(s => { if (matches(s, base, k)) get(s).forEach(v => c[v] = (c[v] || 0) + 1); });
    return c;
  }
  function options(k, st) {
    const get = F.find(f => f[0] === k)[2];
    const c = counts(st, k, get);
    let vals = [...new Set(S.flatMap(get))];
    if (k === 'dept' && st.fac) vals = vals.filter(v => S.some(s => s.faculty === st.fac && s.department === v));
    const order = {
      day: (a, b) => WEEK.indexOf(a) - WEEK.indexOf(b),
      time: (a, b) => a.localeCompare(b),
      sec: (a, b) => +a - +b,
      fac: (a, b) => DATA.filters.faculty.indexOf(a) - DATA.filters.faculty.indexOf(b),
    }[k] || ((a, b) => a.localeCompare(b, 'ar'));
    return vals.sort(order).map(v => [v, c[v] || 0]);
  }
  const select = (k, name, st, all) => `
    <label class="small fw-bold mb-0" for="f-${k}">${name}</label>
    <select class="form-select form-select-sm" name="${k}" id="f-${k}"><option value="">${all}</option>${options(k, st)
      .filter(([v, n]) => n > 0 || v === st[k])  // each list follows the other choices: a department shows only its instructors, rooms, days...
      .map(([v, n]) => `<option value="${esc(v)}" ${v === st[k] ? 'selected' : ''}>${esc(label(k, v))} (${n})</option>`).join('')}</select>`;

  // ------------------------------------------------------------------ pieces
  const mtg = m => `<span class="tt-day ${MODE[m.mode] ? MODE[m.mode].cls : ''}" title="${esc(DAYS[m.day] + ' ' + m.start + '–' + m.end + ' · ' + m.mode)}"><i class="bi ${(MODE[m.mode] || {}).icon || 'bi-dot'}"></i>${esc(DAYS[m.day] || m.day)}</span>`;
  function when(s) {
    // meetings grouped by time block, in the source order
    const blocks = [];
    s.meetings.forEach(m => {
      const k = m.start + '–' + m.end;
      const b = blocks.find(x => x.k === k) || (blocks.push({ k, ms: [] }), blocks[blocks.length - 1]);
      b.ms.push(m);
    });
    return blocks.map(b => `<div class="tt-when" title="${esc(s.time)}"><bdi dir="ltr" class="tt-time">${b.k}</bdi> ${b.ms.map(mtg).join('')}</div>`).join('');
  }
  const seats = s => {
    const pct = Math.min(100, s.capacity ? 100 * s.registered / s.capacity : 100);
    return `<span class="tt-seats ${s.status === 'مغلقة' ? 'full' : 'open'}" title="المسجلون ${s.registered} من سعة ${s.capacity}">
      <span class="tt-st">${esc(s.status)}</span><span class="tt-bar"><i style="width:${pct}%"></i></span><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></span>`;
  };
  const instLink = s => `<a class="tt-inst" href="./?q=${encodeURIComponent(s.instructor.replace(/^(أ\.?\s?د|د|م|أ)\.?\s*/, '').split(' ').slice(0, 2).join(' '))}" title="ابحث عن ${esc(s.instructor)} في دليل الموظفين">${esc(s.instructor)}</a>`;

  // ------------------------------------------------------------------ views
  const SORTS = {
    code: (a, b) => a.code.localeCompare(b.code) || +a.section - +b.section || a.activity.localeCompare(b.activity, 'ar'),
    name: (a, b) => a.name.localeCompare(b.name, 'ar') || +a.section - +b.section,
    time: (a, b) => firstSlot(a).localeCompare(firstSlot(b)) || a.code.localeCompare(b.code),
    inst: (a, b) => a.instructor.localeCompare(b.instructor, 'ar') || firstSlot(a).localeCompare(firstSlot(b)),
    room: (a, b) => a.room.localeCompare(b.room) || firstSlot(a).localeCompare(firstSlot(b)),
    seats: (a, b) => (b.capacity - b.registered) - (a.capacity - a.registered),
    fill: (a, b) => b.registered / (b.capacity || 1) - a.registered / (a.capacity || 1),
  };
  function firstSlot(s) {
    return s._slot || (s._slot = s.meetings.map(m => WEEK.indexOf(m.day) + m.start).sort()[0] || '');
  }
  const COLS = [['code', 'رمز المقرر'], ['name', 'اسم المقرر'], ['', 'النشاط'], ['time', 'الوقت'], ['room', 'القاعة'], ['', 'الشعبة'],
    ['fill', 'الحالة / المقاعد'], ['inst', 'اسم المدرس'], ['', 'المبنى'], ['', 'الكلية / القسم']];
  function tableView(list, st) {
    const shown = list.slice((st.page - 1) * PAGE, st.page * PAGE);
    return `<div class="card"><div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 tt-table">
      <thead><tr><th>#</th>${COLS.map(([k, t]) => k ? `<th><a href="#" data-sort="${k}" class="${st.sort === k ? 'on' : ''}">${t} <i class="bi bi-arrow-down-up"></i></a></th>` : `<th>${t}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((s, i) => `<tr>
        <td class="text-muted small">${(st.page - 1) * PAGE + i + 1}</td>
        <td><b dir="ltr">${esc(s.code)}</b></td>
        <td class="tt-name">${esc(s.name)}${s.degree !== 'البكالوريوس' ? ` <span class="badge text-bg-warning">${esc(s.degree)}</span>` : ''}</td>
        <td><span class="badge ${s.activity === 'عملي' ? 'text-bg-info' : 'text-bg-light border'}">${esc(s.activity)}</span></td>
        <td class="text-nowrap">${when(s)}</td>
        <td><a href="#" data-pick="room" data-v="${esc(s.room)}" class="tt-room">${esc(s.room)}</a></td>
        <td class="text-center">${esc(s.section)}</td>
        <td>${seats(s)}</td>
        <td class="small">${instLink(s)}</td>
        <td class="small">${esc(s.building)}</td>
        <td class="small text-muted">${esc(s.faculty)}<div>${esc(s.department)}</div></td></tr>`).join('')}</tbody></table></div>
      ${pager(list.length, st)}</div>`;
  }
  function pager(n, st) {
    const pages = Math.ceil(n / PAGE);
    if (pages <= 1) return '';
    const btn = (p, t, dis) => `<li class="page-item ${dis ? 'disabled' : ''} ${p === st.page ? 'active' : ''}"><a class="page-link" href="#" data-page="${p}">${t}</a></li>`;
    const nums = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - st.page) <= 2) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 p-2 border-top small">
      <span class="text-muted">${(st.page - 1) * PAGE + 1}–${Math.min(n, st.page * PAGE)} من ${n}</span>
      <ul class="pagination pagination-sm mb-0">${btn(st.page - 1, '‹', st.page === 1)}${nums.map(p => p === '…' ? '<li class="page-item disabled"><span class="page-link">…</span></li>' : btn(p, p)).join('')}${btn(st.page + 1, '›', st.page === pages)}</ul></div>`;
  }
  function cardsView(list, st) {
    const shown = list.slice((st.page - 1) * PAGE, st.page * PAGE);
    return `<div class="row row-cols-1 row-cols-md-2 row-cols-xxl-3 g-3">${shown.map(s => `<div class="col"><div class="tt-card ${s.activity === 'عملي' ? 'lab' : ''}">
      <div class="tt-card-h"><div><b dir="ltr">${esc(s.code)}</b> <span class="text-muted">· شعبة ${esc(s.section)}</span></div>
        <span class="badge ${s.activity === 'عملي' ? 'text-bg-info' : 'text-bg-light border'}">${esc(s.activity)}</span></div>
      <h3 class="tt-card-t">${esc(s.name)}</h3>
      ${when(s)}
      <div class="tt-card-l"><i class="bi bi-geo-alt-fill"></i> <a href="#" data-pick="room" data-v="${esc(s.room)}" class="tt-room">${esc(s.room)}</a> · ${esc(s.building)}</div>
      <div class="tt-card-l"><i class="bi bi-person-fill"></i> ${instLink(s)}</div>
      <div class="tt-card-l text-muted"><i class="bi bi-bank2"></i> ${esc(s.faculty)} · ${esc(s.department)}</div>
      <div class="tt-card-f">${seats(s)}<span class="small text-muted">${esc(s.degree)} · ${esc(s.study_type)}</span></div>
    </div></div>`).join('')}</div><div class="card mt-3">${pager(list.length, st)}</div>`;
  }
  function coursesView(list, st) {
    const groups = new Map();
    list.forEach(s => { const k = s.code + '|' + s.name; groups.has(k) || groups.set(k, []); groups.get(k).push(s); });
    const keys = [...groups.keys()];
    const shown = keys.slice((st.page - 1) * PAGE, st.page * PAGE);
    return `<div class="d-grid gap-2">${shown.map(k => {
      const g = groups.get(k), s0 = g[0];
      const reg = g.reduce((a, s) => a + s.registered, 0), cap = g.reduce((a, s) => a + s.capacity, 0);
      return `<details class="tt-course card" ${keys.length <= 12 ? 'open' : ''}><summary class="card-body py-2">
        <b dir="ltr">${esc(s0.code)}</b> <span class="fw-bold">${esc(s0.name)}</span>
        <span class="text-muted small">· ${esc(s0.department)}</span>
        <span class="ms-auto small"><span class="badge text-bg-light border">${g.length} شعبة</span> <bdi dir="ltr" title="المسجلون/السعة لكل الشعب">${reg}/${cap}</bdi></span></summary>
        <div class="table-responsive"><table class="table table-sm mb-0 align-middle"><tbody>${g.map(s => `<tr>
          <td class="text-center" style="width:3rem">${esc(s.section)}</td><td style="width:4rem"><span class="badge ${s.activity === 'عملي' ? 'text-bg-info' : 'text-bg-light border'}">${esc(s.activity)}</span></td>
          <td class="text-nowrap">${when(s)}</td><td><a href="#" data-pick="room" data-v="${esc(s.room)}" class="tt-room">${esc(s.room)}</a></td>
          <td class="small">${instLink(s)}</td><td>${seats(s)}</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('')}</div><div class="card mt-3">${pager(keys.length, st)}</div>`;
  }
  // weekly matrix: rows = time / room / instructor, columns = days
  function gridView(list, st) {
    const rowsBy = st.rows;
    const days = WEEK.filter(d => list.some(s => s.meetings.some(m => m.day === d)));
    const rowKey = (s, m) => rowsBy === 'room' ? s.room : rowsBy === 'inst' ? s.instructor : m.start + '–' + m.end;
    const cells = new Map();
    list.forEach(s => s.meetings.forEach(m => {
      const k = rowKey(s, m) + '\u0000' + m.day;
      cells.has(k) || cells.set(k, []);
      cells.get(k).push({ s, m });
    }));
    const rowsAll = [...new Set([...cells.keys()].map(k => k.split('\u0000')[0]))]
      .sort((a, b) => rowsBy === 'time' ? a.localeCompare(b) : a.localeCompare(b, 'ar'));
    const LIMIT = 6;
    const many = rowsAll.length > 120;
    const rowsShown = many ? rowsAll.slice(0, 120) : rowsAll;
    const chip = ({ s, m }) => `<a href="#" class="tt-chip ${(MODE[m.mode] || {}).cls || ''} ${s.activity === 'عملي' ? 'lab' : ''}" data-open="${S.indexOf(s)}"
        title="${esc(`${s.code} ${s.name} – شعبة ${s.section}\n${DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}\n${s.room} · ${s.instructor}`)}">
        <span class="tt-chip-c"><b dir="ltr">${esc(s.code)}</b><span class="tt-chip-s">ش${esc(s.section)}</span></span><small>${rowsBy === 'time' ? esc(s.room) : `<bdi dir="ltr">${m.start}–${m.end}</bdi>`}</small></a>`;
    return `<div class="card"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center small">
        <span class="fw-bold">الصفوف:</span>
        <div class="btn-group btn-group-sm">${[['time', 'الوقت'], ['room', 'القاعة'], ['inst', 'المدرس']].map(([k, t]) =>
          `<button type="button" class="btn ${rowsBy === k ? 'btn-primary' : 'btn-outline-primary'}" data-rows="${k}">${t}</button>`).join('')}</div>
        <span class="text-muted">الأعمدة: أيام الأسبوع · ${rowsBy === 'time' ? 'كل خانة: رمز المقرر، الشعبة (ش) والقاعة' : 'كل خانة: رمز المقرر، الشعبة (ش) والوقت'}</span>
        <span class="ms-auto d-flex flex-wrap gap-2">${Object.entries(MODE).map(([k, v]) => `<span class="tt-chip ${v.cls} static"><i class="bi ${v.icon}"></i> ${k}</span>`).join('')}</span></div>
      ${many ? `<div class="alert alert-info small m-2 mb-0">${rowsAll.length} صفاً؛ يُعرض أول 120. اختر كلية أو قسماً أو مبنى لعرض الكل.</div>` : ''}
      <div class="table-responsive tt-grid-wrap"><table class="table table-bordered mb-0 tt-grid">
        <thead><tr><th class="tt-gh">${{ time: 'الوقت', room: 'القاعة', inst: 'المدرس' }[rowsBy]}</th>${days.map(d => `<th>${esc(DAYS[d])}</th>`).join('')}</tr></thead>
        <tbody>${rowsShown.map(r => `<tr><th class="tt-gh">${rowsBy === 'time' ? `<bdi dir="ltr">${esc(r)}</bdi>` : esc(r)}${rowsBy === 'room' && r === '0' ? '<small class="d-block fw-normal text-muted">بدون قاعة محددة</small>' : ''}</th>${days.map(d => {
          const items = (cells.get(r + '\u0000' + d) || []).sort((a, b) => a.m.start.localeCompare(b.m.start) || a.s.code.localeCompare(b.s.code));
          if (!items.length) return '<td></td>';
          const clash = rowsBy !== 'time' && !(rowsBy === 'room' && r === '0') && hasOverlap(items);
          return `<td class="${clash ? 'tt-clash' : ''}">${items.slice(0, LIMIT).map(chip).join('')}${items.length > LIMIT
            ? `<a href="#" class="tt-more" data-cell="${esc(JSON.stringify(rowsBy === 'time' ? { day: d, time: r.split('–')[0] } : { day: d, [rowsBy]: r }))}">+${items.length - LIMIT} أخرى</a>` : ''}
            ${clash ? `<span class="tt-clash-tag" title="${rowsBy === 'room' ? 'في هذه القاعة' : 'لهذا المدرس'} أكثر من شعبة في أوقات متداخلة كما في الجدول الرسمي؛ غالباً شعب تُدرَّس معاً"><i class="bi bi-layers-fill"></i> أكثر من شعبة في الوقت نفسه</span>` : ''}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  function hasOverlap(items) {
    // same room or same instructor at overlapping times on that day (face-to-face or online, not async)
    const live = items.filter(x => x.m.mode !== 'غير متزامن').sort((a, b) => a.m.start.localeCompare(b.m.start));
    for (let i = 1; i < live.length; i++) {
      const a = live[i - 1], b = live[i];
      if (b.m.start < a.m.end && !(a.s.code === b.s.code && a.s.section === b.s.section)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ free time
  // Busy = any meeting with a set time in any of the instructor's sections (all departments). Asynchronous meetings
  // count only when the switch says so. Half-hour slots: every time in the data is on :00 or :30.
  const FREE_DAYS = ['ح', 'ن', 'ث', 'ر', 'خ'];
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const toTime = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  function dur(n) {  // n half hours, in Arabic
    const h = Math.floor(n / 2), half = n % 2;
    const hs = h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
    return half ? (hs ? hs + ' ونصف' : 'نصف ساعة') : hs;
  }
  function freeScope(st) {
    if (st.ppl.length) return { people: st.ppl.filter(p => S.some(s => s.instructor === p)), custom: true };
    if (st.inst) return { people: [st.inst], custom: false };
    // instructors of the chosen faculty/department (the other filters describe sections, not people)
    const people = [...new Set(S.filter(s => (!st.fac || s.faculty === st.fac) && (!st.dept || s.department === st.dept)).map(s => s.instructor))];
    return { people: people.sort((a, b) => a.localeCompare(b, 'ar')), custom: false };
  }
  function busyMap(people, st, days, slots) {
    const set = new Set(people), busy = {};
    people.forEach(p => { busy[p] = {}; days.forEach(d => { busy[p][d] = slots.map(() => null); }); });
    S.forEach(s => {
      if (!set.has(s.instructor)) return;
      s.meetings.forEach(m => {
        if (!days.includes(m.day) || (m.mode === 'غير متزامن' && !st.async)) return;
        const a = toMin(m.start), b = toMin(m.end);
        slots.forEach((t, i) => { if (t < b && t + 30 > a) (busy[s.instructor][m.day][i] ||= []).push({ s, m }); });
      });
    });
    return busy;
  }
  function freeView(st) {
    const days = FREE_DAYS.concat(st.sat ? ['س'] : []);
    const from = toMin(st.from), to = Math.max(toMin(st.to), from + 30);
    const slots = [];
    for (let t = from; t < to; t += 30) slots.push(t);
    const { people, custom } = freeScope(st);
    const N = people.length;
    const busy = busyMap(people, st, days, slots);
    const freeN = {};
    days.forEach(d => { freeN[d] = slots.map((t, i) => people.filter(p => !busy[p][d][i]).length); });
    // best common windows: longest runs where everyone is free, else where the most people are
    const best = Math.max(0, ...days.flatMap(d => freeN[d]));
    const runs = [];
    if (best > 0) days.forEach(d => {
      let start = null;
      slots.concat([null]).forEach((t, i) => {
        const ok = t !== null && freeN[d][i] >= best;
        if (ok && start === null) start = i;
        if (!ok && start !== null) { runs.push({ d, a: slots[start], b: slots[i - 1] + 30, n: i - start }); start = null; }
      });
    });
    runs.sort((x, y) => y.n - x.n || days.indexOf(x.d) - days.indexOf(y.d) || x.a - y.a);
    const timesOpt = sel => { const o = []; for (let t = 7 * 60; t <= 23 * 60; t += 30) o.push(`<option ${toTime(t) === sel ? 'selected' : ''}>${toTime(t)}</option>`); return o.join(''); };
    const allNames = [...new Set(S.map(s => s.instructor))].sort((a, b) => a.localeCompare(b, 'ar'));
    const scopeName = custom ? 'مجموعة مختارة' : st.inst ? esc(st.inst) : st.dept ? `قسم ${esc(st.dept)}` : st.fac ? `كلية ${esc(st.fac)}` : 'كل مدرسي الجامعة';

    const head = `<div class="card mb-3 fr-head"><div class="card-body">
      <div class="d-flex flex-wrap gap-3 align-items-end">
        <div class="fr-scope"><small>النطاق</small><b>${scopeName}</b><span>${N} مدرس · ${days.length} أيام · <bdi dir="ltr">${toTime(from)}–${toTime(to)}</bdi></span></div>
        <div class="d-flex flex-wrap gap-2 align-items-end ms-auto">
          <label class="small fr-lbl">من<select class="form-select form-select-sm" id="fr-from">${timesOpt(toTime(from))}</select></label>
          <label class="small fr-lbl">إلى<select class="form-select form-select-sm" id="fr-to">${timesOpt(toTime(to))}</select></label>
          <div class="form-check form-switch small mb-1"><input class="form-check-input" type="checkbox" id="fr-sat" ${st.sat ? 'checked' : ''}><label class="form-check-label" for="fr-sat">يشمل السبت</label></div>
          <div class="form-check form-switch small mb-1" title="المحاضرات غير المتزامنة ليس لها وقت حضور ثابت؛ فعّل الخيار لاعتبار وقتها المسجّل مشغولاً">
            <input class="form-check-input" type="checkbox" id="fr-async" ${st.async ? 'checked' : ''}><label class="form-check-label" for="fr-async">احتساب غير المتزامن مشغولاً</label></div>
        </div>
      </div>
      <div class="fr-people mt-3">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <span class="small fw-bold">المدرسون (${N})</span>
          ${custom ? '<a href="#" class="small" id="fr-reset"><i class="bi bi-arrow-counterclockwise"></i> العودة إلى الكلية/القسم المختار في التصفية</a>'
            : '<span class="small text-muted">من الكلية/القسم في التصفية. أزل أو أضف مدرسين لتكوين مجموعة خاصة (لجنة، فريق مقرر…).</span>'}
          <div class="input-group input-group-sm ms-auto fr-add"><span class="input-group-text"><i class="bi bi-person-plus"></i></span>
            <input class="form-control" id="fr-add" list="fr-names" placeholder="أضف مدرساً بالاسم…" autocomplete="off">
            <datalist id="fr-names">${allNames.filter(n => !people.includes(n)).map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        </div>
        <div class="fr-chips">${people.map(p => `<span class="fr-person">${esc(p)}<button type="button" data-drop="${esc(p)}" title="إزالة" aria-label="إزالة ${esc(p)}"><i class="bi bi-x"></i></button></span>`).join('')
          || '<span class="text-muted small">لا يوجد مدرسون في النطاق الحالي؛ اختر كلية أو قسماً من التصفية أو أضف مدرسين بالاسم.</span>'}</div>
      </div></div></div>`;
    if (!N) return head;

    const all = best === N;
    const bestCard = `<div class="card mb-3 fr-bestcard"><div class="card-header"><i class="bi bi-stars"></i>
        ${all ? 'أوقات يتفرغ فيها الجميع' : best ? `لا يوجد وقت يتفرغ فيه الجميع — أفضل الأوقات: ${best} من ${N} متفرغون` : 'لا يوجد وقت فراغ ضمن هذه الساعات'}
        <span class="small text-muted ms-2">الأطول أولاً · انقر للتفاصيل</span></div>
      <div class="card-body fr-best">${runs.slice(0, 10).map(r => `<a href="#" class="fr-slot ${all ? 'all' : ''}" data-cellf="${r.d}|${r.a}">
        <b>${esc(DAYS[r.d])}</b><bdi dir="ltr">${toTime(r.a)}–${toTime(r.b)}</bdi><small>${dur(r.n)}</small></a>`).join('')
        || '<span class="text-muted small">جرّب توسيع الساعات أو تقليل عدد المدرسين.</span>'}
        ${runs.length > 10 ? `<span class="small text-muted align-self-center">و${runs.length - 10} فترات أقصر</span>` : ''}</div></div>`;

    const heat = `<div class="card h-100"><div class="card-header d-flex flex-wrap justify-content-between gap-2"><span><i class="bi bi-grid-3x3-gap-fill"></i> خريطة التفرغ</span>
        <span class="fr-legend small"><span>مشغول</span>${[0, .25, .5, .75, 1].map(v => `<i style="--f:${v}"></i>`).join('')}<span>متفرغ</span></span></div>
      <div class="table-responsive"><table class="fr-heat"><thead><tr><th></th>${days.map(d => `<th>${esc(DAYS[d])}</th>`).join('')}</tr></thead>
      <tbody>${slots.map((t, i) => `<tr><th><bdi dir="ltr">${toTime(t)}</bdi></th>${days.map(d => {
        const f = freeN[d][i];
        return `<td><a href="#" data-cellf="${d}|${t}" style="--f:${(f / N).toFixed(3)}" class="${f === N ? 'all' : f === 0 ? 'none' : ''}"
          title="${esc(DAYS[d])} ${toTime(t)}–${toTime(t + 30)}: ${f} من ${N} متفرغون">${N === 1 ? (f ? '<i class="bi bi-check-lg"></i>' : '') : `${f}<small>/${N}</small>`}</a></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`;

    const span = to - from;
    const rows = people.map(p => ({ p, h: days.reduce((a, d) => a + busy[p][d].filter(Boolean).length, 0) }))
      .sort((a, b) => a.h - b.h || a.p.localeCompare(b.p, 'ar'));
    const ticks = [];
    for (let t = Math.ceil(from / 120) * 120; t < to; t += 120) ticks.push(t);
    const strips = `<div class="card h-100"><div class="card-header d-flex flex-wrap justify-content-between gap-2"><span><i class="bi bi-bar-chart-steps"></i> انشغال كل مدرس</span>
        <span class="small text-muted">الأكثر تفرغاً أولاً · مرّر على المحاضرة للتفاصيل</span></div>
      <div class="table-responsive"><table class="table table-sm mb-0 fr-strips"><thead><tr><th>المدرس</th>${days.map(d => `<th>${esc(DAYS[d])}
        <div class="fr-ticks">${ticks.map(t => `<span style="right:${100 * (t - from) / span}%">${t / 60}</span>`).join('')}</div></th>`).join('')}<th>مشغول</th></tr></thead>
      <tbody>${rows.map(({ p, h }) => `<tr><th><a href="#" data-pick="inst" data-v="${esc(p)}" title="عرض شعب ${esc(p)} في الجدول">${esc(p)}</a></th>${days.map(d => {
        const seen = new Set(), blocks = [];
        S.forEach(s => {
          if (s.instructor !== p) return;
          s.meetings.forEach(m => {
            if (m.day !== d || (m.mode === 'غير متزامن' && !st.async)) return;
            const a = Math.max(toMin(m.start), from), b = Math.min(toMin(m.end), to), k = s.code + '|' + s.section + '|' + m.start;
            if (b <= a || seen.has(k)) return;
            seen.add(k);
            blocks.push(`<i class="${(MODE[m.mode] || {}).cls || ''}" style="right:${100 * (a - from) / span}%;width:${100 * (b - a) / span}%"
              title="${esc(`${s.code} ${s.name} – شعبة ${s.section}\n${m.start}–${m.end} · ${m.mode} · ${s.room}`)}"></i>`);
          });
        });
        return `<td><div class="fr-bar">${blocks.join('')}</div></td>`;
      }).join('')}<td class="small text-nowrap">${dur(h) || '—'}</td></tr>`).join('')}</tbody></table></div></div>`;

    return head + bestCard + `<div class="row g-3"><div class="col-xxl-5">${heat}</div><div class="col-xxl-7">${strips}</div></div>`;
  }
  function openFreeCell(st, d, t) {
    const { people } = freeScope(st);
    const busy = busyMap(people, st, [d], [t]);
    const free = people.filter(p => !busy[p][d][0]), taken = people.filter(p => busy[p][d][0]);
    openModal(`${esc(DAYS[d])} <bdi dir="ltr">${toTime(t)}–${toTime(t + 30)}</bdi>`,
      `<div class="row g-3"><div class="col-sm-6"><h6 class="fw-bold text-success"><i class="bi bi-check-circle-fill"></i> متفرغون (${free.length})</h6>
        <ul class="list-unstyled small mb-0 fr-list">${free.map(p => `<li>${esc(p)}</li>`).join('') || '<li class="text-muted">لا أحد</li>'}</ul></div>
      <div class="col-sm-6"><h6 class="fw-bold text-danger"><i class="bi bi-x-circle-fill"></i> مشغولون (${taken.length})</h6>
        <ul class="list-unstyled small mb-0 fr-list">${taken.map(p => `<li>${esc(p)}<div class="text-muted">${busy[p][d][0].map(({ s, m }) =>
          `<span dir="ltr">${esc(s.code)}</span> ش${esc(s.section)} · <bdi dir="ltr">${m.start}–${m.end}</bdi> · ${esc(m.mode)} · ${esc(s.room)}`).join('<br>')}</div></li>`).join('')
          || '<li class="text-muted">لا أحد</li>'}</ul></div></div>`);
  }
  function bindFree(st) {
    const people = freeScope(st).people;
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('#fr-from', 'change', e => set({ from: e.target.value }));
    on('#fr-to', 'change', e => set({ to: e.target.value }));
    on('#fr-sat', 'change', e => set({ sat: e.target.checked ? '1' : '' }));
    on('#fr-async', 'change', e => set({ async: e.target.checked ? '1' : '' }));
    on('#fr-reset', 'click', e => { e.preventDefault(); set({ ppl: [] }); });
    on('#fr-add', 'change', e => {
      const v = e.target.value.trim();
      if (S.some(s => s.instructor === v) && !people.includes(v)) set({ ppl: people.concat([v]) });
    });
    document.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => set({ ppl: people.filter(p => p !== b.dataset.drop) })));
    document.querySelectorAll('[data-cellf]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const [d, t] = a.dataset.cellf.split('|');
      openFreeCell(st, d, +t);
    }));
  }

  // ------------------------------------------------------------------ ready-made matrices
  // Each matrix is computed from the sections that match the current filters. "Scheduled" meetings are the
  // face-to-face, online and blended ones; asynchronous meetings have no fixed time and are left out.
  const live = m => m.mode !== 'غير متزامن';
  const hrs = min => { const h = min / 60; return Number.isInteger(h) ? String(h) : h.toFixed(1); };
  const MX = {
    load: { t: 'ضغط الأوقات', i: 'bi-activity', d: 'عدد الشعب التي تُعقد في كل نصف ساعة من كل يوم — يكشف ساعات الذروة والأوقات الهادئة.' },
    roomuse: { t: 'إشغال القاعات', i: 'bi-door-open', d: 'ساعات استخدام كل قاعة في كل يوم ومجموعها الأسبوعي — القاعات الأكثر والأقل استخداماً.' },
    roomfree: { t: 'القاعات الشاغرة', i: 'bi-door-closed', d: 'لكل قاعة: الأوقات المشغولة والشاغرة في اليوم المختار — للعثور على قاعة لمحاضرة تعويضية أو اجتماع.' },
    instload: { t: 'عبء المدرسين', i: 'bi-person-workspace', d: 'ساعات التدريس المجدولة لكل مدرس في كل يوم، مع عدد الشعب والمجموع.' },
    facday: { t: 'الكليات × الأيام', i: 'bi-bank2', d: 'عدد الشعب التي تُعقد في كل يوم لكل كلية.' },
    seats: { t: 'المقاعد حسب القسم', i: 'bi-people', d: 'الشعب المفتوحة والمغلقة، المسجلون والسعة ونسبة الامتلاء لكل قسم.' },
  };
  function heatCell(v, max, text, title) {
    const f = max ? v / max : 0;
    return `<td class="mx-c" style="--f:${f.toFixed(3)}" title="${esc(title || '')}">${v ? text : ''}</td>`;
  }
  function mxTable(head, rows, foot) {
    return `<div class="table-responsive mx-wrap"><table class="table table-sm table-bordered mb-0 mx-table">
      <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
  }
  function matrixView(list, st) {
    const kind = MX[st.mx] ? st.mx : 'load';
    const days = WEEK.filter(d => list.some(s => s.meetings.some(m => m.day === d && live(m))));
    let body = '', csv = [];
    if (kind === 'load') {
      const ms = list.flatMap(s => s.meetings.filter(live).map(m => ({ s, m })));
      const lo = Math.min(...ms.map(x => toMin(x.m.start))), hi = Math.max(...ms.map(x => toMin(x.m.end)));
      const slots = [];
      for (let t = lo; t < hi; t += 30) slots.push(t);
      const n = (d, t) => new Set(ms.filter(x => x.m.day === d && toMin(x.m.start) < t + 30 && toMin(x.m.end) > t).map(x => x.s)).size;
      const grid = slots.map(t => days.map(d => n(d, t)));
      const max = Math.max(1, ...grid.flat());
      csv = [['الوقت', ...days.map(d => DAYS[d])], ...slots.map((t, i) => [toTime(t), ...grid[i]])];
      body = mxTable(['الوقت', ...days.map(d => esc(DAYS[d]))], slots.map((t, i) => `<tr><th><bdi dir="ltr">${toTime(t)}</bdi></th>${grid[i].map((v, j) =>
        heatCell(v, max, v, `${DAYS[days[j]]} ${toTime(t)}: ${v} شعبة`)).join('')}</tr>`));
    } else if (kind === 'roomuse' || kind === 'instload') {
      const byRoom = kind === 'roomuse';
      const keyOf = s => byRoom ? s.room : s.instructor;
      const rows = {};
      // the filters choose the rooms/instructors; their hours come from all of their sections (other departments too)
      const keys = new Set(list.map(keyOf));
      S.filter(s => keys.has(keyOf(s))).forEach(s => {
        const k = keyOf(s);
        if (byRoom && (k === '0' || !k)) return;
        const r = rows[k] || (rows[k] = { k, d: {}, secs: new Set(), extra: byRoom ? s.building : '' });
        r.secs.add(s);
        // occupied half hours (a union: sections taught together in one room/slot count once)
        s.meetings.filter(live).forEach(m => {
          const set = r.d[m.day] || (r.d[m.day] = new Set());
          for (let t = toMin(m.start); t < toMin(m.end); t += 30) set.add(t);
        });
      });
      Object.values(rows).forEach(r => Object.keys(r.d).forEach(d => { r.d[d] = r.d[d].size * 30; }));
      const arr = Object.values(rows).map(r => Object.assign(r, { tot: days.reduce((a, d) => a + (r.d[d] || 0), 0) })).sort((a, b) => b.tot - a.tot || a.k.localeCompare(b.k, 'ar'));
      const max = Math.max(1, ...arr.flatMap(r => days.map(d => r.d[d] || 0)));
      const maxT = Math.max(1, ...arr.map(r => r.tot));
      csv = [[byRoom ? 'القاعة' : 'المدرس', ...(byRoom ? ['المبنى'] : []), ...days.map(d => DAYS[d] + ' (ساعات)'), 'المجموع (ساعات)', 'الشعب'],
        ...arr.map(r => [r.k, ...(byRoom ? [r.extra] : []), ...days.map(d => hrs(r.d[d] || 0)), hrs(r.tot), r.secs.size])];
      body = mxTable([byRoom ? 'القاعة' : 'المدرس', ...days.map(d => esc(DAYS[d])), 'المجموع', 'الشعب'], arr.map(r => `<tr>
        <th><a href="#" data-pick="${byRoom ? 'room' : 'inst'}" data-v="${esc(r.k)}">${esc(r.k)}</a>${byRoom ? `<small class="d-block fw-normal text-muted">${esc(r.extra)}</small>` : ''}</th>
        ${days.map(d => heatCell(r.d[d] || 0, max, hrs(r.d[d] || 0), `${r.k} · ${DAYS[d]}: ${hrs(r.d[d] || 0)} ساعة`)).join('')}
        <td class="mx-tot"><b>${hrs(r.tot)}</b> س<span class="mx-bar"><i style="width:${100 * r.tot / maxT}%"></i></span></td><td class="text-center">${r.secs.size}</td></tr>`));
    } else if (kind === 'roomfree') {
      const day = days.includes(st.mxday) ? st.mxday : days[0];
      const from = 8 * 60, to = Math.max(17 * 60, ...list.flatMap(s => s.meetings.filter(m => m.day === day && live(m)).map(m => toMin(m.end))));
      const slots = [];
      for (let t = from; t < to; t += 30) slots.push(t);
      // all rooms known from the whole timetable (a room free all day still counts); occupancy from every section, not only filtered ones
      const roomsAll = [...new Set(list.map(s => s.room))].filter(r => r && r !== '0').sort((a, b) => a.localeCompare(b));
      const occ = {};
      S.forEach(s => s.meetings.forEach(m => {
        if (m.day !== day || !live(m) || !roomsAll.includes(s.room)) return;
        slots.forEach((t, i) => { if (toMin(m.start) < t + 30 && toMin(m.end) > t) ((occ[s.room] ||= {})[i] ||= []).push(s); });
      }));
      const bld = Object.fromEntries(S.map(s => [s.room, s.building]));
      csv = [['القاعة', 'المبنى', ...slots.map(toTime)], ...roomsAll.map(r => [r, bld[r], ...slots.map((t, i) => occ[r] && occ[r][i] ? occ[r][i].map(s => s.code + '/' + s.section).join(' ') : 'شاغرة')])];
      const freeNow = slots.map((t, i) => roomsAll.filter(r => !(occ[r] && occ[r][i])).length);
      body = `<div class="d-flex flex-wrap gap-2 align-items-center p-2 small"><span class="fw-bold">اليوم:</span>
          <div class="btn-group btn-group-sm">${days.map(d => `<button type="button" class="btn ${d === day ? 'btn-primary' : 'btn-outline-primary'}" data-mxday="${d}">${esc(DAYS[d])}</button>`).join('')}</div>
          <span class="text-muted">القاعات من نطاق التصفية؛ الإشغال من كل شعب الجامعة في هذه القاعات</span>
          <span class="ms-auto d-flex gap-2"><span class="mx-key busy"></span> مشغولة <span class="mx-key"></span> شاغرة</span></div>`
        + mxTable(['القاعة', ...slots.map(t => `<bdi dir="ltr" class="mx-vt">${toTime(t)}</bdi>`)], roomsAll.map(r => `<tr><th>${esc(r)}<small class="d-block fw-normal text-muted">${esc(bld[r] || '')}</small></th>${slots.map((t, i) => {
          const o = occ[r] && occ[r][i];
          return o ? `<td class="mx-busy" title="${esc(o.map(s => `${s.code} ${s.name} – ش${s.section} · ${s.instructor}`).join('\n'))}"></td>` : `<td class="mx-free" title="${esc(`${r} شاغرة ${DAYS[day]} ${toTime(t)}–${toTime(t + 30)}`)}"></td>`;
        }).join('')}</tr>`), `<tr><th>شاغرة</th>${freeNow.map(n => `<td class="mx-sum">${n}</td>`).join('')}</tr>`);
    } else if (kind === 'facday') {
      const facs = DATA.filters.faculty.filter(f => list.some(s => s.faculty === f));
      const n = (f, d) => list.filter(s => s.faculty === f && s.meetings.some(m => m.day === d && live(m))).length;
      const grid = facs.map(f => days.map(d => n(f, d)));
      const max = Math.max(1, ...grid.flat());
      csv = [['الكلية', ...days.map(d => DAYS[d]), 'الشعب'], ...facs.map((f, i) => [f, ...grid[i], list.filter(s => s.faculty === f).length])];
      body = mxTable(['الكلية', ...days.map(d => esc(DAYS[d])), 'كل الشعب'], facs.map((f, i) => `<tr><th><a href="#" data-pick="fac" data-v="${esc(f)}">${esc(f)}</a></th>
        ${grid[i].map((v, j) => heatCell(v, max, v, `${f} · ${DAYS[days[j]]}: ${v} شعبة`)).join('')}<td class="mx-tot"><b>${list.filter(s => s.faculty === f).length}</b></td></tr>`));
    } else if (kind === 'seats') {
      const g = {};
      list.forEach(s => {
        const k = s.faculty + '|' + s.department;
        const r = g[k] || (g[k] = { f: s.faculty, d: s.department, n: 0, open: 0, reg: 0, cap: 0 });
        r.n++; r.reg += s.registered; r.cap += s.capacity; if (s.status === 'مفتوحة') r.open++;
      });
      const arr = Object.values(g).sort((a, b) => b.reg / (b.cap || 1) - a.reg / (a.cap || 1));
      csv = [['الكلية', 'القسم', 'الشعب', 'مفتوحة', 'مغلقة', 'المسجلون', 'السعة', 'نسبة الامتلاء %'], ...arr.map(r => [r.f, r.d, r.n, r.open, r.n - r.open, r.reg, r.cap, Math.round(100 * r.reg / (r.cap || 1))])];
      body = mxTable(['القسم', 'الشعب', 'مفتوحة', 'مغلقة', 'المسجلون / السعة', 'الامتلاء'], arr.map(r => {
        const p = Math.round(100 * r.reg / (r.cap || 1));
        return `<tr><th><a href="#" data-pick="dept" data-v="${esc(r.d)}">${esc(r.d)}</a><small class="d-block fw-normal text-muted">${esc(r.f)}</small></th>
          <td class="text-center">${r.n}</td><td class="text-center text-success fw-bold">${r.open}</td><td class="text-center text-danger fw-bold">${r.n - r.open}</td>
          <td class="text-center"><bdi dir="ltr">${r.reg} / ${r.cap}</bdi></td>
          <td class="mx-fill"><span class="mx-bar wide ${p >= 100 ? 'full' : ''}"><i style="width:${Math.min(100, p)}%"></i></span><b>${p}%</b></td></tr>`;
      }));
    }
    window.__mxcsv = csv;
    return `<div class="mx-gallery mb-3">${Object.entries(MX).map(([k, v]) => `<button type="button" class="mx-card ${k === kind ? 'on' : ''}" data-mx="${k}">
        <i class="bi ${v.i}"></i><b>${v.t}</b><small>${v.d}</small></button>`).join('')}</div>
      <div class="card"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span class="fw-bold"><i class="bi ${MX[kind].i}"></i> ${MX[kind].t}</span>
        <span class="small text-muted">${list.length} شعبة من نطاق التصفية${kind === 'roomuse' || kind === 'instload' ? ' · الساعات من كل شعب القاعة/المدرس، بما فيها خارج النطاق' : ''} · المحاضرات غير المتزامنة غير محسوبة (لا وقت ثابت لها)</span>
        <button type="button" class="btn btn-sm btn-outline-success ms-auto" id="mx-csv"><i class="bi bi-filetype-csv"></i> تصدير المصفوفة</button></div>
        ${list.length ? body : '<div class="card-body text-muted">لا توجد شعب في نطاق التصفية.</div>'}</div>`;
  }

  // ------------------------------------------------------------------ dashboard
  // Every figure comes from the sections that match the current filters; every bar drills down (sets a filter).
  // Single-series bars in one hue; status keeps its reserved green/red and always has a text label.
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const fmtN = n => n.toLocaleString('en-US');
  function hbars(items, opts) {
    // items: [{label, value, sub?, pick?: [key, value], tip}] — horizontal bars, value label at the end
    const max = Math.max(1, ...items.map(x => x.value));
    return `<div class="db-hbars">${items.map(x => `<${x.pick ? 'a href="#"' : 'div'} class="db-hbar ${x.pick ? 'click' : ''}" ${x.pick ? `data-pick="${x.pick[0]}" data-v="${esc(x.pick[1])}"` : ''} data-tip="${esc(x.tip || '')}">
        <span class="db-hl">${esc(x.label)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>
        <span class="db-ht"><i style="width:${(100 * x.value / max).toFixed(1)}%" class="${x.cls || ''}"></i></span>
        <b class="db-hv">${opts && opts.fmt ? opts.fmt(x) : fmtN(x.value)}</b></${x.pick ? 'a' : 'div'}>`).join('')}</div>`;
  }
  function cols(items, opts) {
    // vertical columns on a shared baseline; the tallest gets a direct label, the others show on hover
    const max = Math.max(1, ...items.map(x => x.value));
    const top = items.reduce((a, x) => x.value > a.value ? x : a, items[0] || { value: 0 });
    return `<div class="db-cols ${opts && opts.dense ? 'dense' : ''}">${items.map(x => `<a href="#" class="db-col" ${x.pick ? `data-pick="${x.pick[0]}" data-v="${esc(x.pick[1])}"` : ''} data-tip="${esc(x.tip)}">
        <span class="db-cb"><i style="height:${(100 * x.value / max).toFixed(1)}%">${x === top && x.value ? `<em>${fmtN(x.value)}</em>` : ''}</i></span>
        <span class="db-cl">${x.html || esc(x.label)}</span></a>`).join('')}</div>`;
  }
  const panel = (icon, title, sub, body, cls) => `<section class="db-panel ${cls || ''}"><header><h3><i class="bi ${icon}"></i> ${title}</h3>${sub ? `<small>${sub}</small>` : ''}</header>${body}</section>`;

  function dashView(list, st) {
    if (!list.length) return '<div class="card"><div class="card-body text-center text-muted py-5">لا توجد شعب في نطاق التصفية.</div></div>';
    const liveM = list.flatMap(s => s.meetings.filter(live).map(m => ({ s, m })));
    const reg = list.reduce((a, s) => a + s.registered, 0), cap = list.reduce((a, s) => a + s.capacity, 0);
    const open = list.filter(s => s.status === 'مفتوحة').length;
    const over = list.filter(s => s.registered > s.capacity);
    const near = list.filter(s => s.capacity && s.registered < s.capacity && s.registered / s.capacity >= 0.9);
    const allM = list.flatMap(s => s.meetings);
    const onlineShare = pct(allM.filter(m => m.mode !== 'وجاهي').length, allM.length);
    const noRoom = list.filter(s => s.room === '0').length;
    const avgClass = list.length ? Math.round(reg / list.length) : 0;
    const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

    // KPI band
    const kpi = (v, l, sub, icon, tone) => `<div class="db-kpi ${tone || ''}"><i class="bi ${icon}"></i><div><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    const kpis = `<div class="db-kpis">
      ${kpi(fmtN(list.length), 'شعبة', `${fmtN(new Set(list.map(s => s.code)).size)} مقرراً`, 'bi-collection-fill')}
      ${kpi(fmtN(new Set(list.map(s => s.instructor)).size), 'مدرس', `${(list.length / Math.max(1, new Set(list.map(s => s.instructor)).size)).toFixed(1)} شعبة لكل مدرس`, 'bi-person-video3')}
      ${kpi(fmtN(reg), 'طالب مسجّل', `من سعة ${fmtN(cap)}`, 'bi-people-fill')}
      ${kpi(pct(reg, cap) + '%', 'نسبة الامتلاء', `متوسط الشعبة ${avgClass} طالباً`, 'bi-speedometer2')}
      ${kpi(fmtN(open), 'شعبة مفتوحة', `${fmtN(list.length - open)} مغلقة`, 'bi-unlock-fill', 'good')}
      ${kpi(fmtN(over.length), 'تجاوزت السعة', `${fmtN(near.length)} قاربت الامتلاء (≥90%)`, 'bi-exclamation-triangle-fill', over.length ? 'bad' : '')}
      ${kpi(onlineShare + '%', 'لقاءات غير وجاهية', 'إلكتروني كامل وغير متزامن ومدمج', 'bi-camera-video-fill')}
      ${kpi(fmtN(noRoom), 'شعبة بدون قاعة', 'القاعة في المصدر: 0', 'bi-door-closed', noRoom ? 'warn' : '')}
    </div>`;

    // faculties (or departments when one faculty is chosen)
    const byDept = !!st.fac;
    const g = count(list, s => byDept ? s.department : s.faculty);
    const unitItems = Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const ss = list.filter(s => (byDept ? s.department : s.faculty) === k);
      const r = ss.reduce((a, s) => a + s.registered, 0), c = ss.reduce((a, s) => a + s.capacity, 0);
      return { label: k, value: v, pick: [byDept ? 'dept' : 'fac', k], tip: `${k}\n${v} شعبة · ${r} مسجلاً من ${c} (${pct(r, c)}%)` };
    });

    // days and start times
    const dayItems = WEEK.filter(d => liveM.some(x => x.m.day === d)).map(d => {
      const n = new Set(liveM.filter(x => x.m.day === d).map(x => x.s)).size;
      return { label: DAYS[d], value: n, pick: ['day', d], tip: `${DAYS[d]}: ${n} شعبة لها لقاء مجدول` };
    });
    const starts = [...new Set(liveM.map(x => x.m.start))].sort();
    const timeItems = starts.map(t => {
      const n = new Set(liveM.filter(x => x.m.start === t).map(x => x.s)).size;
      return { label: t, html: `<bdi dir="ltr">${t}</bdi>`, value: n, pick: ['time', t], tip: `تبدأ ${t}: ${n} شعبة` };
    });

    // delivery modes (meetings)
    const modeN = count(allM, m => m.mode);
    const modeItems = Object.keys(MODE).filter(k => modeN[k]).map(k => ({ label: k, value: modeN[k], pick: ['mode', k],
      tip: `${k}: ${modeN[k]} لقاء (${pct(modeN[k], allM.length)}%)` }));

    // fill rate by department
    const dg = {};
    list.forEach(s => { const r = dg[s.department] || (dg[s.department] = { r: 0, c: 0, n: 0, f: s.faculty }); r.r += s.registered; r.c += s.capacity; r.n++; });
    const fillItems = Object.entries(dg).map(([k, v]) => ({ label: k, sub: byDept ? '' : v.f, value: pct(v.r, v.c), pick: ['dept', k],
      cls: v.r >= v.c ? 'full' : '', tip: `${k}\n${v.r} مسجلاً من ${v.c} في ${v.n} شعبة` })).sort((a, b) => b.value - a.value).slice(0, 12);

    // busiest instructors / rooms (all their sections, union of half hours)
    const hoursOf = (key, keep) => {
      const keys = new Set(list.map(key).filter(keep));
      const o = {};
      S.forEach(s => {
        const k = key(s);
        if (!keys.has(k)) return;
        s.meetings.filter(live).forEach(m => { const set = ((o[k] ||= {})[m.day] ||= new Set()); for (let t = toMin(m.start); t < toMin(m.end); t += 30) set.add(t); });
      });
      return Object.entries(o).map(([k, d]) => [k, Object.values(d).reduce((a, x) => a + x.size, 0) / 2]).sort((a, b) => b[1] - a[1]);
    };
    const instItems = hoursOf(s => s.instructor, Boolean).slice(0, 10).map(([k, h]) => ({ label: k, value: h, pick: ['inst', k],
      tip: `${k}: ${h} ساعة مجدولة أسبوعياً (من كل شعبه)` }));
    const roomH = hoursOf(s => s.room, r => r && r !== '0');
    const roomItems = roomH.slice(0, 10).map(([k, h]) => ({ label: k, sub: (S.find(s => s.room === k) || {}).building, value: h, pick: ['room', k],
      tip: `القاعة ${k}: ${h} ساعة إشغال أسبوعياً` }));

    // capacity watch: sections over capacity / nearly full
    const watch = over.slice().sort((a, b) => (b.registered - b.capacity) - (a.registered - a.capacity)).slice(0, 8);
    const watchRows = watch.map(s => `<a href="#" class="db-watch" data-open="${S.indexOf(s)}" data-tip="${esc(`${s.code} ${s.name} – ش${s.section}\n${s.instructor}`)}">
        <span><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)} <small>ش${esc(s.section)}</small></span>
        <span class="db-over">+${s.registered - s.capacity}</span><bdi dir="ltr" class="small">${s.registered}/${s.capacity}</bdi></a>`).join('');

    // open vs closed by degree/activity
    const split = (f, label) => {
      const c = count(list, f);
      return Object.entries(c).map(([k, n]) => {
        const o = list.filter(s => f(s) === k && s.status === 'مفتوحة').length;
        return `<div class="db-split" data-tip="${esc(`${label} ${k}: ${o} مفتوحة، ${n - o} مغلقة`)}"><span class="db-hl">${esc(k)}</span>
          <span class="db-stack"><i class="ok" style="width:${100 * o / n}%"></i><i class="no" style="width:${100 * (n - o) / n}%"></i></span>
          <small><b class="text-success">${o}</b> / <b class="text-danger">${n - o}</b></small></div>`;
      }).join('');
    };

    return `<div class="db">${kpis}
      <div class="db-grid">
        ${panel('bi-bank2', byDept ? `الشعب حسب القسم – ${esc(st.fac)}` : 'الشعب حسب الكلية', 'انقر شريطاً لعرض شعبه', hbars(unitItems), 'w2')}
        ${panel('bi-calendar-week', 'الشعب حسب اليوم', 'شعب لها لقاء مجدول في اليوم', cols(dayItems))}
        ${panel('bi-clock', 'أوقات البداية', 'عدد الشعب التي تبدأ في كل وقت', cols(timeItems, { dense: true }), 'w2')}
        ${panel('bi-broadcast', 'أنماط التدريس', 'عدد اللقاءات الأسبوعية', hbars(modeItems, { fmt: x => `${fmtN(x.value)} <small>(${pct(x.value, allM.length)}%)</small>` }))}
        ${panel('bi-speedometer2', 'الامتلاء حسب القسم', 'المسجلون ÷ السعة · الأحمر = ممتلئ أو أكثر', hbars(fillItems, { fmt: x => x.value + '%' }), 'w2')}
        ${panel('bi-toggle-on', 'المفتوحة والمغلقة', '<span class="text-success">■ مفتوحة</span> <span class="text-danger">■ مغلقة</span>',
          split(s => s.degree, 'الدرجة') + '<hr class="my-2">' + split(s => s.activity, 'النشاط') + '<hr class="my-2">' + split(s => s.study_type, 'نوع الدراسة'))}
        ${panel('bi-person-workspace', 'الأكثر ساعات تدريس', 'أعلى 10 · ساعات أسبوعية من كل الشعب', hbars(instItems, { fmt: x => x.value + ' س' }))}
        ${panel('bi-door-open', 'القاعات الأكثر إشغالاً', 'أعلى 10 · ساعات أسبوعية', hbars(roomItems, { fmt: x => x.value + ' س' }))}
        ${panel('bi-exclamation-triangle', 'شعب تجاوزت السعة', over.length ? `${over.length} شعبة · الأعلى تجاوزاً أولاً · انقر للتفاصيل` : '', watchRows || '<p class="text-muted small mb-0">لا توجد شعب تجاوزت سعتها.</p>')}
      </div>
      <p class="small text-muted mt-2 mb-0"><i class="bi bi-info-circle"></i> كل الأرقام من ${fmtN(list.length)} شعبة تطابق التصفية الحالية. ساعات المدرسين والقاعات من كل شعبهم (بلا تكرار للشعب المدرَّسة معاً)، والمحاضرات غير المتزامنة لا تُحسب في الأوقات لأنه لا وقت حضور ثابت لها.</p>
    </div>`;
  }
  // one floating tooltip for every [data-tip] on the dashboard
  function bindTips() {
    let tip = $('#db-tip');
    if (!tip) {
      document.body.insertAdjacentHTML('beforeend', '<div id="db-tip" role="tooltip"></div>');
      tip = $('#db-tip');
      addEventListener('scroll', () => { tip.style.display = 'none'; }, { passive: true });
    }
    tip.style.display = 'none';
    document.querySelectorAll('.db [data-tip]').forEach(el => {
      el.addEventListener('mousemove', e => {
        if (!el.dataset.tip) return;
        tip.textContent = el.dataset.tip;
        tip.style.display = 'block';
        const w = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px';
        tip.style.top = (e.clientY - tip.offsetHeight - 14) + 'px';
      });
      el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  // ------------------------------------------------------------------ section dialog
  function openModal(title, body) {
    let dlg = $('#ttModal');
    if (!dlg) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal fade" id="ttModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content"><div class="modal-header"><h5 class="modal-title fw-bold" id="ttModalT"></h5><button type="button" class="btn-close ms-0" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
        <div class="modal-body" id="ttModalB"></div></div></div></div>`);
      dlg = $('#ttModal');
    }
    $('#ttModalT').innerHTML = title;
    $('#ttModalB').innerHTML = body;
    bootstrap.Modal.getOrCreateInstance(dlg).show();
  }
  function openSection(s) {
    const row = (t, v) => `<tr><th class="text-muted fw-normal" style="width:35%">${t}</th><td>${v}</td></tr>`;
    openModal(`<span dir="ltr">${esc(s.code)}</span> ${esc(s.name)}`, `<table class="table table-sm mb-2">
      ${row('الشعبة', esc(s.section))}${row('النشاط', esc(s.activity))}${row('الوقت', when(s))}
      ${row('القاعة', esc(s.room))}${row('المبنى', esc(s.building))}${row('المدرس', instLink(s))}
      ${row('الحالة', seats(s))}${row('الطلاب المسجلون', s.registered)}${row('السعة', s.capacity)}
      ${row('الكلية', esc(s.faculty))}${row('القسم', esc(s.department))}${row('الدرجة العلمية', esc(s.degree))}${row('نوع الدراسة', esc(s.study_type))}</table>
      <div class="small text-muted">نص الوقت في المصدر: <bdi>${esc(s.time)}</bdi></div>`);
  }

  // ------------------------------------------------------------------ render
  function render() {
    const st = readState();
    const list = S.filter(s => matches(s, st)).sort(SORTS[st.sort] || SORTS.code);
    const pages = Math.max(1, Math.ceil((st.view === 'courses' ? new Set(list.map(s => s.code + '|' + s.name)).size : list.length) / PAGE));
    if (st.page > pages) st.page = pages;
    const active = [...FK, 'seats'].filter(k => st[k]);
    const kpi = (v, l, icon) => `<div class="col-6 col-md-4 col-xl-2"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${icon}"></i> ${l}</div></div></div>`;
    const reg = list.reduce((a, s) => a + s.registered, 0), cap = list.reduce((a, s) => a + s.capacity, 0);
    if (!$('#tt-layout')) {
      $('#tt-app').innerHTML = `<div class="row g-3 mb-3" id="tt-kpis"></div>
        <div class="row g-3" id="tt-layout">
          <aside class="col-lg-4 col-xl-3 no-print">
            <div class="offcanvas-lg offcanvas-end filter-drawer" tabindex="-1" id="fpanel" aria-labelledby="fpanel-title">
              <div class="offcanvas-header d-lg-none border-bottom"><h5 class="offcanvas-title fw-bold" id="fpanel-title"><i class="bi bi-funnel-fill"></i> التصفية</h5>
                <button type="button" class="btn-close ms-0" data-bs-dismiss="offcanvas" data-bs-target="#fpanel" aria-label="إغلاق"></button></div>
              <div class="offcanvas-body d-block p-3 p-lg-0"><div class="filter-sticky" id="tt-panel"></div></div>
            </div>
          </aside>
          <section class="col-lg-8 col-xl-9"><div id="tt-toolbar"></div><div id="tt-results"></div><div id="tt-verify"></div></section>
        </div>`;
    }
    $('#tt-kpis').innerHTML = kpi(list.length, 'شعبة', 'bi-collection-fill') + kpi(new Set(list.map(s => s.code)).size, 'مقرر', 'bi-journal-bookmark-fill')
      + kpi(new Set(list.map(s => s.instructor)).size, 'مدرس', 'bi-person-video3') + kpi(new Set(list.map(s => s.room).filter(r => r !== '0')).size, 'قاعة', 'bi-door-open-fill')
      + kpi(list.filter(s => s.status === 'مفتوحة').length, 'شعبة مفتوحة', 'bi-unlock-fill') + kpi(reg, `مسجّلاً من سعة ${cap}`, 'bi-people-fill');
    const focus = document.activeElement && document.activeElement.name === 'q';
    $('#tt-panel').innerHTML = `<form class="card mb-3" id="tt-filters" onsubmit="return false">
      <div class="card-header d-flex justify-content-between align-items-center"><span><i class="bi bi-funnel-fill"></i> التصفية</span>${active.length || st.q ? '<a href="#" data-clear="all" class="small">مسح الكل</a>' : ''}</div>
      <div class="card-body d-grid gap-2">
        <div class="input-group input-group-sm"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" name="q" value="${esc(st.q)}" placeholder="رمز أو اسم مقرر، مدرس، قاعة…"></div>
        <div class="form-check form-switch small"><input class="form-check-input" type="checkbox" id="f-seats" ${st.seats ? 'checked' : ''}><label class="form-check-label" for="f-seats">فيها مقاعد متاحة فقط</label></div>
        ${select('fac', 'الكلية', st, 'كل الكليات')}
        ${select('dept', 'القسم', st, st.fac ? 'كل أقسام الكلية' : 'كل الأقسام')}
        <div class="row g-2"><div class="col-6">${select('deg', 'الدرجة العلمية', st, 'الكل')}</div><div class="col-6">${select('type', 'نوع الدراسة', st, 'الكل')}</div></div>
        <div class="row g-2"><div class="col-6">${select('act', 'النشاط', st, 'الكل')}</div><div class="col-6">${select('status', 'الحالة', st, 'الكل')}</div></div>
        <div class="row g-2"><div class="col-6">${select('day', 'اليوم', st, 'كل الأيام')}</div><div class="col-6">${select('time', 'وقت البداية', st, 'كل الأوقات')}</div></div>
        ${select('mode', 'نمط التدريس', st, 'الكل')}
        ${select('bld', 'المبنى', st, 'كل المباني')}
        <div class="row g-2"><div class="col-7">${select('room', 'القاعة', st, 'كل القاعات')}</div><div class="col-5">${select('sec', 'الشعبة', st, 'الكل')}</div></div>
        ${select('inst', 'المدرس', st, 'كل المدرسين')}
      </div></form>`;
    const chips = active.map(k => `<a href="#" data-clear="${k}" class="badge rounded-pill text-bg-light border text-decoration-none filter-chip">${k === 'seats' ? 'مقاعد متاحة' : F.find(f => f[0] === k)[1] + ': ' + esc(label(k, st[k]))} <i class="bi bi-x-circle-fill"></i></a>`).join(' ');
    const views = [['dash', 'bi-speedometer', 'لوحة المؤشرات'], ['table', 'bi-table', 'جدول'], ['cards', 'bi-grid-3x2-gap-fill', 'بطاقات'], ['courses', 'bi-journal-bookmark', 'حسب المقرر'], ['grid', 'bi-calendar-week', 'مصفوفة أسبوعية'], ['free', 'bi-hourglass-split', 'أوقات الفراغ'], ['mx', 'bi-grid-3x3', 'مصفوفات جاهزة']];
    $('#tt-toolbar').innerHTML = `<div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
      <button type="button" class="btn btn-sm btn-outline-primary d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#fpanel" aria-controls="fpanel"><i class="bi bi-funnel-fill"></i> التصفية${active.length ? ` <span class="badge text-bg-primary">${active.length}</span>` : ''}</button>
      <b class="me-1">${list.length} شعبة</b> ${chips}
      ${st.inst && (st.fac || st.dept) ? '<span class="small text-muted w-100"><i class="bi bi-info-circle"></i> تُعرض كل شعب المدرس، بما فيها شعبه خارج الكلية أو القسم المختار.</span>' : ''}
      <div class="ms-auto d-flex flex-wrap gap-2">
        ${['grid', 'free', 'mx', 'dash'].includes(st.view) ? '' : `<select class="form-select form-select-sm w-auto" id="tt-sort">${[['code', 'رمز المقرر'], ['name', 'اسم المقرر'], ['time', 'اليوم والوقت'], ['inst', 'المدرس'], ['room', 'القاعة'], ['seats', 'المقاعد المتاحة'], ['fill', 'نسبة الامتلاء']].map(([k, t]) =>
          `<option value="${k}" ${st.sort === k ? 'selected' : ''}>ترتيب: ${t}</option>`).join('')}</select>`}
        <div class="btn-group btn-group-sm flex-wrap">${views.map(([k, i, t]) => `<button type="button" class="btn ${st.view === k ? 'btn-primary' : 'btn-outline-primary'}" data-view="${k}"><i class="bi ${i}"></i> ${t}</button>`).join('')}</div>
        <div class="dropdown"><button class="btn btn-sm btn-success dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-download"></i> تصدير</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" data-export="xlsx"><i class="bi bi-file-earmark-excel text-success"></i> Excel</a></li>
            <li><a class="dropdown-item" href="#" data-export="csv"><i class="bi bi-filetype-csv"></i> CSV</a></li>
            <li><a class="dropdown-item" href="#" data-export="json"><i class="bi bi-filetype-json"></i> JSON</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" data-export="print"><i class="bi bi-printer"></i> طباعة / PDF</a></li></ul></div>
      </div></div></div>`;
    $('#tt-results').innerHTML = st.view === 'dash' ? dashView(list, st) : st.view === 'free' ? freeView(st) : st.view === 'mx' ? matrixView(list, st) : !list.length ? '<div class="card"><div class="card-body text-center text-muted py-5"><i class="bi bi-search fs-2 d-block mb-2"></i>لا توجد شعب تطابق التصفية الحالية.</div></div>'
      : st.view === 'cards' ? cardsView(list, st) : st.view === 'courses' ? coursesView(list, st) : st.view === 'grid' ? gridView(list, st) : tableView(list, st);
    bind(list, st);
    if (focus) { const q = $('#tt-filters input[name=q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  function set(changes) {
    const st = Object.assign(readState(), changes);
    if ('fac' in changes) st.dept = '';
    if (!('page' in changes)) st.page = 1;
    writeState(st);
    render();
  }
  let qTimer;
  function bind(list, st) {
    const f = $('#tt-filters');
    f.querySelectorAll('select').forEach(el => el.addEventListener('change', () => set({ [el.name]: el.value })));
    $('#f-seats').addEventListener('change', e => set({ seats: e.target.checked ? 'free' : '' }));
    const q = f.querySelector('input[name=q]');
    q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => set({ q: q.value }), 250); });
    $('#tt-top-q').value = st.q;
    document.querySelectorAll('[data-clear]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      set(a.dataset.clear === 'all' ? Object.assign(Object.fromEntries(['q', ...FK, 'seats'].map(k => [k, ''])), { ppl: [] }) : { [a.dataset.clear]: '' });
    }));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => set({ view: b.dataset.view })));
    document.querySelectorAll('[data-rows]').forEach(b => b.addEventListener('click', () => set({ rows: b.dataset.rows })));
    document.querySelectorAll('[data-sort]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); set({ sort: a.dataset.sort }); }));
    const sort = $('#tt-sort');
    if (sort) sort.addEventListener('change', e => set({ sort: e.target.value }));
    document.querySelectorAll('[data-page]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      set({ page: +a.dataset.page });
      $('#tt-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    document.querySelectorAll('[data-pick]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      set(Object.assign({ [a.dataset.pick]: a.dataset.v }, st.view === 'free' ? { view: 'table', ppl: [] } : {}));
    }));
    document.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openSection(S[+a.dataset.open]); }));
    document.querySelectorAll('[data-cell]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const c = JSON.parse(a.dataset.cell);
      set({ day: c.day, time: c.time || '', room: c.room || st.room, inst: c.inst || st.inst, view: 'table' });
    }));
    document.querySelectorAll('[data-export]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); exportAs(a.dataset.export, list); }));
    if (st.view === 'free') bindFree(st);
    if (st.view === 'dash') bindTips();
    document.querySelectorAll('[data-mx]').forEach(b => b.addEventListener('click', () => set({ mx: b.dataset.mx })));
    document.querySelectorAll('[data-mxday]').forEach(b => b.addEventListener('click', () => set({ mxday: b.dataset.mxday })));
    const mxc = $('#mx-csv');
    if (mxc) mxc.addEventListener('click', () => {
      const csv = window.__mxcsv.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      download(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'مصفوفة_' + MX[st.mx in MX ? st.mx : 'load'].t.replace(/\s+/g, '_') + '.csv');
    });
  }

  // ------------------------------------------------------------------ export
  function exportAs(kind, list) {
    if (kind === 'print') return window.print();
    const head = ['رمز المقرر', 'اسم المقرر', 'النشاط', 'الوقت', 'القاعة', 'الشعبة', 'الحالة', 'المسجلون', 'السعة', 'اسم المدرس', 'المبنى', 'الكلية', 'القسم', 'الدرجة العلمية', 'نوع الدراسة'];
    const rows = list.map(s => [s.code, s.name, s.activity, s.time, s.room, s.section, s.status, s.registered, s.capacity, s.instructor, s.building, s.faculty, s.department, s.degree, s.study_type]);
    const base = 'الجدول_الدراسي_' + DATA.term.replace(/[^\d/]+/g, ' ').trim().replace(/\D+/g, '-');
    if (kind === 'json') return download(new Blob([JSON.stringify(list.map(({ _hay, _slot, ...s }) => s), null, 1)], { type: 'application/json' }), base + '.json');
    if (kind === 'csv') {
      const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      return download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    }
    if (kind === 'xlsx') {
      if (!window.XLSX) return alert('مكتبة Excel لم تُحمَّل بعد؛ أعد المحاولة بعد لحظات.');
      const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
      ws['!cols'] = head.map((h, i) => ({ wch: [10, 34, 7, 34, 9, 6, 8, 8, 6, 30, 26, 24, 26, 12, 10][i] }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, 'الجدول الدراسي');
      return XLSX.writeFile(wb, base + '.xlsx');
    }
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ start
  function ago(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 2) return 'قبل لحظات';
    const say = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
    if (min < 60) return 'قبل ' + say(min, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    const h = Math.round(min / 60);
    if (h < 24) return 'قبل ' + say(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    const d = Math.round(h / 24);
    return 'قبل ' + say(d, 'يوم', 'يومين', 'أيام', 'يوماً');
  }
  function showUpdated(d) {
    const upd = new Date(d.updated).toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
    $('#tt-updated').innerHTML = `آخر تغيير ${ago(d.updated)} (${upd}) · يُراجَع كل ساعة`;
    $('#foot-count').textContent = `${d.count} شعبة · ${d.term}`;
    $('#foot-updated').textContent = 'آخر تغيير ' + ago(d.updated);
  }
  // the button reloads the latest verified copy (the portal itself cannot be read from a browser: no CORS, session-bound)
  async function refresh(btn) {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جارٍ التحديث…';
    try {
      const d = await fetch('data/timetable.json?t=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
      const changed = d.updated !== DATA.updated;
      load(d);
      btn.classList.add('done');
      btn.innerHTML = `<i class="bi bi-check2-circle"></i> ${changed ? 'تم تحميل نسخة أحدث' : 'الجدول محدَّث'}`;
      setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = old; btn.disabled = false; }, 3500);
    } catch (e) {
      btn.innerHTML = old;
      btn.disabled = false;
      alert('تعذّر التحديث الآن (' + e.message + '). البيانات المعروضة من آخر نسخة محمَّلة.');
    }
  }
  function load(d) {
    DATA = d;
    S = d.sections;
    DAYS = d.days;
    showUpdated(d);
    render();
  }
  fetch('data/timetable.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' }).then(r => r.json()).then(d => {
    DATA = d;
    S = d.sections;
    DAYS = d.days;
    $('#tt-term').textContent = '– ' + d.term;
    showUpdated(d);
    $('#year').textContent = new Date().getFullYear();
    $('#tt-refresh').addEventListener('click', e => refresh(e.currentTarget));
    render();
    $('#tt-verify').innerHTML = `<div class="tt-verify small text-muted mt-3"><i class="bi bi-patch-check-fill text-success"></i>
      كل الشعب الـ${d.checks.rows} مطابقة لبوابة الجامعة: قُرئت تفاصيل كل شعبة من نافذتها (الكلية، القسم، الدرجة، نوع الدراسة، عدد المسجلين)،
      ثم أُعيد البحث بكل فلتر في البوابة (الدرجة العلمية، نوع الدراسة، الكلية، القسم) وطابقت النتائج تماماً. أي اختلاف يوقف التحديث ويُبقي آخر نسخة سليمة.</div>`;
    const top = $('#tt-top-q');
    let t;
    top.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => set({ q: top.value }), 250); });
  }).catch(e => {
    $('#tt-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر تحميل الجدول الدراسي (${esc(e.message)}).</div>`;
  });
})();
