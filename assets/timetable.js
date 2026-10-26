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
      rows: p.get('rows') || 'time', seats: p.get('seats') || '' };
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
    for (const [k, , get] of F) {
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
    <select class="form-select form-select-sm" name="${k}" id="f-${k}"><option value="">${all}</option>${options(k, st).map(([v, n]) =>
      `<option value="${esc(v)}" ${v === st[k] ? 'selected' : ''} ${n === 0 && v !== st[k] ? 'disabled' : ''}>${esc(label(k, v))} (${n})</option>`).join('')}</select>`;

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

  // ------------------------------------------------------------------ section dialog
  function openSection(s) {
    let dlg = $('#ttModal');
    if (!dlg) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal fade" id="ttModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered">
        <div class="modal-content"><div class="modal-header"><h5 class="modal-title fw-bold" id="ttModalT"></h5><button type="button" class="btn-close ms-0" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
        <div class="modal-body" id="ttModalB"></div></div></div></div>`);
      dlg = $('#ttModal');
    }
    $('#ttModalT').innerHTML = `<span dir="ltr">${esc(s.code)}</span> ${esc(s.name)}`;
    const row = (t, v) => `<tr><th class="text-muted fw-normal" style="width:35%">${t}</th><td>${v}</td></tr>`;
    $('#ttModalB').innerHTML = `<table class="table table-sm mb-2">
      ${row('الشعبة', esc(s.section))}${row('النشاط', esc(s.activity))}${row('الوقت', when(s))}
      ${row('القاعة', esc(s.room))}${row('المبنى', esc(s.building))}${row('المدرس', instLink(s))}
      ${row('الحالة', seats(s))}${row('الطلاب المسجلون', s.registered)}${row('السعة', s.capacity)}
      ${row('الكلية', esc(s.faculty))}${row('القسم', esc(s.department))}${row('الدرجة العلمية', esc(s.degree))}${row('نوع الدراسة', esc(s.study_type))}</table>
      <div class="small text-muted">نص الوقت في المصدر: <bdi>${esc(s.time)}</bdi></div>`;
    bootstrap.Modal.getOrCreateInstance(dlg).show();
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
    const views = [['table', 'bi-table', 'جدول'], ['cards', 'bi-grid-3x2-gap-fill', 'بطاقات'], ['courses', 'bi-journal-bookmark', 'حسب المقرر'], ['grid', 'bi-calendar-week', 'مصفوفة أسبوعية']];
    $('#tt-toolbar').innerHTML = `<div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
      <button type="button" class="btn btn-sm btn-outline-primary d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#fpanel" aria-controls="fpanel"><i class="bi bi-funnel-fill"></i> التصفية${active.length ? ` <span class="badge text-bg-primary">${active.length}</span>` : ''}</button>
      <b class="me-1">${list.length} شعبة</b> ${chips}
      <div class="ms-auto d-flex flex-wrap gap-2">
        ${st.view === 'grid' ? '' : `<select class="form-select form-select-sm w-auto" id="tt-sort">${[['code', 'رمز المقرر'], ['name', 'اسم المقرر'], ['time', 'اليوم والوقت'], ['inst', 'المدرس'], ['room', 'القاعة'], ['seats', 'المقاعد المتاحة'], ['fill', 'نسبة الامتلاء']].map(([k, t]) =>
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
    $('#tt-results').innerHTML = !list.length ? '<div class="card"><div class="card-body text-center text-muted py-5"><i class="bi bi-search fs-2 d-block mb-2"></i>لا توجد شعب تطابق التصفية الحالية.</div></div>'
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
      set(a.dataset.clear === 'all' ? Object.fromEntries(['q', ...FK, 'seats'].map(k => [k, ''])) : { [a.dataset.clear]: '' });
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
    document.querySelectorAll('[data-pick]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); set({ [a.dataset.pick]: a.dataset.v }); }));
    document.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openSection(S[+a.dataset.open]); }));
    document.querySelectorAll('[data-cell]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const c = JSON.parse(a.dataset.cell);
      set({ day: c.day, time: c.time || '', room: c.room || st.room, inst: c.inst || st.inst, view: 'table' });
    }));
    document.querySelectorAll('[data-export]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); exportAs(a.dataset.export, list); }));
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
  fetch('data/timetable.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' }).then(r => r.json()).then(d => {
    DATA = d;
    S = d.sections;
    DAYS = d.days;
    $('#tt-term').textContent = '– ' + d.term;
    const upd = new Date(d.updated).toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
    $('#tt-updated').innerHTML = `آخر تغيير ${ago(d.updated)} (${upd}) · يُراجَع كل ساعة`;
    $('#foot-count').textContent = `${d.count} شعبة · ${d.term}`;
    $('#foot-updated').textContent = 'آخر تغيير ' + ago(d.updated);
    $('#year').textContent = new Date().getFullYear();
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
