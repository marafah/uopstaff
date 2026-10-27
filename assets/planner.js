/* Student schedule planner: pick courses, choose a section for each part (theory / lab), see the week, avoid clashes,
   let the page suggest clash-free combinations, then save to a calendar or print. Kept in the URL (shareable) and in
   this browser. It only plans: registration itself is done on the university portal. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let TT, S, IDX, BY_KEY;
  const STORE = 'uopstaff-planner';

  // ---------------------------------------------------------------- state: chosen courses and their sections
  // st.courses: [course id], st.pick: {part id: section key}; course id = code|degree, part id = code|activity|degree
  function readState() {
    const p = new URLSearchParams(location.search);
    let st = { courses: [], pick: {}, deg: p.get('deg') || 'البكالوريوس', q: p.get('q') || '', fac: p.get('fac') || '' };
    if (p.get('plan')) {
      p.get('plan').split('~').forEach(k => {
        const s = BY_KEY[k];
        if (!s) return;
        const c = s.code + '|' + s.degree;
        if (!st.courses.includes(c)) st.courses.push(c);
        st.pick[partId(s)] = k;
      });
      st.deg = p.get('deg') || st.deg;
    } else if (!p.toString()) {
      try { const saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved) st = Object.assign(st, saved); } catch (e) { /* storage unavailable */ }
    }
    p.getAll('c').forEach(c => { if (!st.courses.includes(c)) st.courses.push(c); });
    return st;
  }
  function writeState(st) {
    const p = new URLSearchParams();
    if (st.deg !== 'البكالوريوس') p.set('deg', st.deg);
    if (st.q) p.set('q', st.q);
    if (st.fac) p.set('fac', st.fac);
    const picked = Object.values(st.pick).filter(k => BY_KEY[k]);
    if (picked.length) p.set('plan', picked.join('~'));
    st.courses.filter(c => !picked.some(k => (BY_KEY[k].code + '|' + BY_KEY[k].degree) === c)).forEach(c => p.append('c', c));
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    try { localStorage.setItem(STORE, JSON.stringify({ courses: st.courses, pick: st.pick, deg: st.deg })); } catch (e) { /* storage unavailable */ }
  }
  const partId = s => [s.code, s.activity, s.degree].join('|');
  const sectionsOf = cid => S.filter(s => s.code + '|' + s.degree === cid);
  const partsOf = cid => {
    const m = {};
    sectionsOf(cid).forEach(s => (m[partId(s)] ||= { id: partId(s), activity: s.activity, list: [] }).list.push(s));
    return Object.values(m).sort((a, b) => a.activity.localeCompare(b.activity, 'ar'));
  };
  const free = s => s.capacity - s.registered;

  // meetings with a set time overlap (same day, overlapping times)
  function clashes(a, b) {
    return a.meetings.filter(live).some(x => b.meetings.filter(live).some(y => x.day === y.day && toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end)));
  }

  // ---------------------------------------------------------------- render
  function render() {
    const st = readState();
    const chosen = Object.entries(st.pick).map(([part, k]) => BY_KEY[k]).filter(Boolean)
      .filter(s => st.courses.includes(s.code + '|' + s.degree));
    const clashPairs = [];
    chosen.forEach((a, i) => chosen.slice(i + 1).forEach(b => { if (clashes(a, b)) clashPairs.push([a, b]); }));
    const inClash = new Set(clashPairs.flat());

    // search results (left)
    const q = norm(st.q.trim());
    const courses = {};
    S.forEach(s => {
      if (s.degree !== st.deg || (st.fac && s.faculty !== st.fac)) return;
      const c = s.code + '|' + s.degree;
      (courses[c] ||= { id: c, code: s.code, name: s.name, dept: s.department, n: 0, open: 0 });
      courses[c].n++; if (s.status === 'مفتوحة') courses[c].open++;
    });
    const results = q.length < 2 ? [] : Object.values(courses).filter(c => norm(c.code + ' ' + c.name + ' ' + c.dept).includes(q)).slice(0, 40);
    const facs = [...new Set(S.map(s => s.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));

    const weekItems = chosen.flatMap(s => s.meetings.filter(live).map(m => ({ day: m.day, start: m.start, end: m.end,
      title: `${s.code} ش${s.section}`, sub: s.room === '0' ? 'قاعة افتراضية' : s.room,
      cls: inClash.has(s) ? 'clash' : (U.MODE[m.mode] || {}).cls,
      tip: `${s.code} ${s.name} – شعبة ${s.section}\n${U.DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}\n${s.instructor}` })));
    const daysOn = new Set(weekItems.map(x => x.day));
    const weekMin = Object.values(chosen.flatMap(s => s.meetings.filter(live).map(m => [m.day, toMin(m.start), toMin(m.end)]))
      .reduce((o, [d, a, b]) => { const set = (o[d] ||= new Set()); for (let t = a; t < b; t += 30) set.add(t); return o; }, {})).reduce((a, x) => a + x.size * 30, 0);
    const missing = st.courses.flatMap(c => partsOf(c).filter(p => !st.pick[p.id] || !BY_KEY[st.pick[p.id]]).map(p => ({ c, p })));

    $('#pl-app').innerHTML = `<div class="row g-3">
      <aside class="col-lg-4 col-xl-3 no-print"><div class="filter-sticky">
        <section class="card mb-3"><div class="card-header"><i class="bi bi-plus-circle-fill"></i> أضف مقرراً</div>
          <div class="card-body d-grid gap-2">
            <div class="input-group input-group-sm"><span class="input-group-text"><i class="bi bi-search"></i></span>
              <input class="form-control" id="pl-q" value="${esc(st.q)}" placeholder="رمز أو اسم المقرر…" autocomplete="off"></div>
            <div class="row g-2"><div class="col-6"><select class="form-select form-select-sm" id="pl-deg">${['البكالوريوس', 'الماجستير'].map(d => `<option ${d === st.deg ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
              <div class="col-6"><select class="form-select form-select-sm" id="pl-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div></div>
            <div class="pl-results">${q.length < 2 ? '<p class="small text-muted mb-0">اكتب حرفين على الأقل من رمز المقرر أو اسمه.</p>'
              : results.map(c => `<button type="button" class="pl-res ${st.courses.includes(c.id) ? 'on' : ''}" data-add="${esc(c.id)}">
                  <b dir="ltr">${esc(c.code)}</b><span>${esc(c.name)}<small>${esc(c.dept)} · ${c.n} شعبة · ${c.open} مفتوحة</small></span>
                  <i class="bi ${st.courses.includes(c.id) ? 'bi-check-circle-fill' : 'bi-plus-lg'}"></i></button>`).join('') || '<p class="small text-muted mb-0">لا توجد نتائج.</p>'}</div>
          </div></section>
        <section class="card"><div class="card-body small text-muted"><i class="bi bi-info-circle"></i> أداة تخطيط فقط؛ التسجيل الفعلي من بوابة الجامعة. خطتك تُحفظ في هذا المتصفح، ويمكن مشاركتها برابط.</div></section>
      </div></aside>
      <section class="col-lg-8 col-xl-9">
        <div class="pl-kpis mb-3">
          <div class="stat-card"><div class="v">${st.courses.length}</div><div class="l"><i class="bi bi-journal-bookmark-fill"></i> مقرر</div></div>
          <div class="stat-card"><div class="v">${(weekMin / 60).toLocaleString('en-US')}</div><div class="l"><i class="bi bi-clock-fill"></i> ساعة أسبوعياً</div></div>
          <div class="stat-card"><div class="v">${daysOn.size}</div><div class="l"><i class="bi bi-calendar-day"></i> أيام دوام</div></div>
          <div class="stat-card ${clashPairs.length ? 'bad' : 'good'}"><div class="v">${clashPairs.length}</div><div class="l"><i class="bi ${clashPairs.length ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i> تعارض</div></div>
        </div>
        ${clashPairs.length ? `<div class="alert alert-danger py-2"><b><i class="bi bi-exclamation-triangle-fill"></i> تعارض:</b> ${clashPairs.map(([a, b]) => `<span class="d-inline-block me-2"><span dir="ltr">${esc(a.code)}</span> ش${esc(a.section)} مع <span dir="ltr">${esc(b.code)}</span> ش${esc(b.section)}</span>`).join('، ')}</div>` : ''}
        ${missing.length ? `<div class="alert alert-warning py-2 small"><i class="bi bi-hand-index"></i> اختر شعبة لـ: ${missing.map(({ c, p }) => `<b dir="ltr">${esc(c.split('|')[0])}</b> (${esc(p.activity)})`).join('، ')}</div>` : ''}
        <div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
          <b>${st.courses.length ? 'مقرراتي' : 'ابدأ بإضافة مقرراتك من البحث'}</b>
          <div class="ms-auto d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-primary" id="pl-suggest" ${st.courses.length ? '' : 'disabled'}><i class="bi bi-magic"></i> اقترح توزيعاً بلا تعارض</button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="pl-ics" ${chosen.length ? '' : 'disabled'}><i class="bi bi-calendar-plus"></i> حفظ في التقويم</button>
            <button type="button" class="btn btn-sm btn-success" id="pl-print" ${chosen.length ? '' : 'disabled'}><i class="bi bi-printer"></i> طباعة / PDF</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="pl-share" ${st.courses.length ? '' : 'disabled'}><i class="bi bi-link-45deg"></i> نسخ رابط الخطة</button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="pl-clear" ${st.courses.length ? '' : 'disabled'}><i class="bi bi-trash3"></i> مسح</button>
          </div></div></div>
        <div class="pl-courses">${st.courses.map(cid => courseCard(cid, st, inClash, chosen)).join('')}</div>
        ${chosen.length ? `<section class="card mt-3"><div class="card-header"><i class="bi bi-calendar-week"></i> جدولي الأسبوعي</div>
          <div class="card-body">${U.weekGrid(weekItems, {})}</div></section>` : ''}
      </section></div>`;
    bind(st, chosen);
  }
  function courseCard(cid, st, inClash, chosen) {
    const parts = partsOf(cid);
    if (!parts.length) return `<div class="card mb-2"><div class="card-body small">المقرر <b>${esc(cid.split('|')[0])}</b> غير مطروح هذا الفصل. <a href="#" data-remove="${esc(cid)}">إزالة</a></div></div>`;
    const s0 = parts[0].list[0];
    return `<section class="card mb-2 pl-course"><div class="card-header d-flex flex-wrap gap-2 align-items-center">
        <b dir="ltr">${esc(s0.code)}</b><b>${esc(s0.name)}</b><span class="small text-muted">${esc(s0.department)}</span>
        <button type="button" class="btn btn-sm btn-link text-danger ms-auto p-0" data-remove="${esc(cid)}"><i class="bi bi-x-circle"></i> إزالة</button></div>
      <div class="card-body py-2">${parts.map(p => {
        const cur = st.pick[p.id];
        const others = chosen.filter(c => partId(c) !== p.id);
        const opts = p.list.slice().sort((a, b) => +a.section - +b.section).map(s => {
          const bad = others.some(o => clashes(o, s));
          return { s, bad, label: `ش${s.section} · ${s.meetings.filter(live).map(m => U.DAYS[m.day]).filter((v, i, a) => a.indexOf(v) === i).join('/') || 'غير متزامن'} ${s.meetings.find(live) ? s.meetings.find(live).start + '–' + s.meetings.find(live).end : ''} · ${U.shortName(s.instructor)} · ${free(s) > 0 ? free(s) + ' مقعد متاح' : 'مغلقة'}${bad ? ' · ⚠ تعارض' : ''}` };
        });
        return `<div class="pl-part"><span class="tt-act ${p.activity === 'عملي' ? 'lab' : ''}">${esc(p.activity)}</span>
          <select class="form-select form-select-sm ${cur && inClash.has(BY_KEY[cur]) ? 'is-invalid' : ''}" data-part="${esc(p.id)}">
            <option value="">— اختر الشعبة (${p.list.length}) —</option>${opts.map(o => `<option value="${esc(U.sectionKey(o.s))}" ${U.sectionKey(o.s) === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
      }).join('')}</div></section>`;
  }

  // ---------------------------------------------------------------- suggestions: clash-free combinations
  function suggest(st) {
    const parts = st.courses.flatMap(partsOf);
    if (!parts.length) return;
    // fewest choices first prunes the search early
    const order = parts.slice().sort((a, b) => a.list.length - b.list.length)
      .map(p => Object.assign({}, p, { list: p.list.slice().sort((a, b) => free(b) - free(a)) }));  // sections with seats tried first
    const found = [];
    let nodes = 0;
    const pickSeats = s => free(s) > 0;
    (function walk(i, acc) {
      if (found.length >= 3000 || ++nodes > 400000) return;
      if (i === order.length) { found.push(acc.slice()); return; }
      order[i].list.forEach(s => {
        if (acc.some(a => clashes(a, s))) return;
        acc.push(s); walk(i + 1, acc); acc.pop();
      });
    })(0, []);
    const score = combo => {
      const days = new Set(combo.flatMap(s => s.meetings.filter(live).map(m => m.day)));
      const byDay = {};
      combo.forEach(s => s.meetings.filter(live).forEach(m => (byDay[m.day] ||= []).push([toMin(m.start), toMin(m.end)])));
      const gaps = Object.values(byDay).reduce((g, iv) => { iv.sort((a, b) => a[0] - b[0]); for (let k = 1; k < iv.length; k++) g += Math.max(0, iv[k][0] - iv[k - 1][1]); return g; }, 0);
      const closed = combo.filter(s => !pickSeats(s)).length;
      return { combo, days: days.size, gaps, closed, s: closed * 1000 + days.size * 100 + gaps / 30 };
    };
    const ranked = found.map(score).sort((a, b) => a.s - b.s).slice(0, 6);
    U.modal('<i class="bi bi-magic"></i> توزيعات مقترحة بلا تعارض', ranked.length ? `<p class="small text-muted">الأفضل أولاً: شعب فيها مقاعد، ثم أقل أيام دوام، ثم أقل فراغات بين المحاضرات.${found.length >= 3000 ? ' (من أول 3000 توزيع ممكن)' : ` (من ${found.length} توزيعاً ممكناً)`}</p>
      ${ranked.map((r, i) => `<div class="pl-sug"><div class="d-flex flex-wrap gap-2 align-items-center mb-1"><b>الخيار ${i + 1}</b>
          <span class="badge text-bg-light border">${r.days} أيام دوام</span><span class="badge text-bg-light border">فراغات ${U.dur(r.gaps)}</span>
          ${r.closed ? `<span class="badge text-bg-danger">${r.closed} شعبة مغلقة</span>` : '<span class="badge text-bg-success">كل الشعب فيها مقاعد</span>'}
          <button type="button" class="btn btn-sm btn-primary ms-auto" data-apply="${i}">اعتماد هذا التوزيع</button></div>
        <div class="small">${r.combo.slice().sort((a, b) => a.code.localeCompare(b.code)).map(s => `<span class="d-inline-block me-3"><b dir="ltr">${esc(s.code)}</b> ${esc(s.activity)} ش${esc(s.section)}</span>`).join('')}</div></div>`).join('')}`
      : nodes > 400000 ? '<div class="alert alert-warning mb-0">توقّف البحث قبل إيجاد توزيع (عدد الاحتمالات كبير جداً). اختر شعبة لبعض المقررات يدوياً ثم أعد المحاولة.</div>'
        : '<div class="alert alert-warning mb-0">لا يوجد توزيع بلا تعارض لهذه المقررات معاً. جرّب إزالة مقرر أو اختيار درجة أخرى.</div>');
    document.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => {
      const r = ranked[+b.dataset.apply];
      const s2 = readState();
      r.combo.forEach(s => { s2.pick[partId(s)] = U.sectionKey(s); });
      writeState(s2);
      bootstrap.Modal.getInstance($('#pgModal')).hide();
      render();
    }));
  }

  // ---------------------------------------------------------------- calendar file and print
  function ics(chosen) {
    const T = IDX.teaching;
    if (!T) return alert('فترة التدريس غير متوفرة في التقويم الجامعي.');
    const D = { 'ح': 0, 'ن': 1, 'ث': 2, 'ر': 3, 'خ': 4, 'ج': 5, 'س': 6 }, ICS = { 'ح': 'SU', 'ن': 'MO', 'ث': 'TU', 'ر': 'WE', 'خ': 'TH', 'ج': 'FR', 'س': 'SA' };
    const start = new Date(T.start + 'T00:00:00');
    const e = v => String(v).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1');
    // local calendar date (toISOString would give the UTC date: the day before, in Amman)
    const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    // RFC 5545: UNTIL in UTC when DTSTART has a time zone; 23:59:59 in Amman (UTC+3) = 20:59:59Z
    const until = T.end.replace(/-/g, '') + 'T205959Z';
    const fold = line => {  // lines of at most 75 bytes, never splitting a character
      const enc = new TextEncoder(), out = [];
      let cur = '', size = 0;
      for (const ch of line) { const n = enc.encode(ch).length; if (size + n > 75) { out.push(cur); cur = ' '; size = 1; } cur += ch; size += n; }
      out.push(cur);
      return out.join('\r\n');
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//uopstaff//planner//AR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:جدولي – ' + e(TT.term),
      'BEGIN:VTIMEZONE', 'TZID:Asia/Amman', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'END:STANDARD', 'END:VTIMEZONE'];
    chosen.forEach(s => {
      const g = {};
      s.meetings.filter(live).forEach(m => (g[m.start + '|' + m.end + '|' + m.mode] ||= []).push(m.day));
      Object.entries(g).forEach(([k, ds]) => {
        const [t0, t1, mode] = k.split('|');
        const first = new Date(start);
        first.setDate(first.getDate() + Math.min(...ds.map(d => (D[d] - start.getDay() + 7) % 7)));
        const ex = (T.holidays || []).filter(h => ds.some(d => new Date(h + 'T00:00:00').getDay() === D[d]));
        lines.push('BEGIN:VEVENT', `UID:${ymd(first)}-${s.code}-${s.section}-${t0.replace(':', '')}@uopstaff-planner`, `DTSTAMP:${ymd(start)}T000000Z`,
          `DTSTART;TZID=Asia/Amman:${ymd(first)}T${t0.replace(':', '')}00`, `DTEND;TZID=Asia/Amman:${ymd(first)}T${t1.replace(':', '')}00`,
          `RRULE:FREQ=WEEKLY;BYDAY=${ds.map(d => ICS[d]).join(',')};UNTIL=${until}`,
          ...(ex.length ? [`EXDATE;TZID=Asia/Amman:${ex.map(h => h.replace(/-/g, '') + 'T' + t0.replace(':', '') + '00').join(',')}`] : []),
          `SUMMARY:${e(`${s.code} ${s.name} – ش${s.section}`)}`, `LOCATION:${e(s.room === '0' || mode === 'الكتروني كامل' ? 'إلكتروني' : s.room + ' – ' + s.building)}`,
          `DESCRIPTION:${e(`${s.activity} · ${mode} · ${s.instructor}`)}`, 'END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    U.download('جدولي.ics', lines.map(fold).join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
  }
  function print(chosen) {
    const items = chosen.flatMap(s => s.meetings.filter(live).map(m => ({ day: m.day, start: m.start, end: m.end, title: `${s.code} ش${s.section}`,
      sub: s.room === '0' ? 'قاعة افتراضية' : s.room, cls: (U.MODE[m.mode] || {}).cls })));
    printReport({
      title: 'جدولي الدراسي', subtitle: TT.term, source: 'مخطط الجدول – للتخطيط فقط، التسجيل من بوابة الجامعة', orientation: 'landscape',
      css: ['https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css', 'assets/app.css'],
      stats: [['مقرر', new Set(chosen.map(s => s.code)).size], ['شعبة', chosen.length], ['أيام دوام', new Set(items.map(x => x.day)).size]],
      raw: U.weekGrid(items, { px: 42, cls: 'wk-print' }),
      sections: [{ columns: ['المقرر', 'النشاط', 'الشعبة', 'الوقت', 'القاعة', 'المدرس', 'المقاعد'], numCols: [2],
        rows: chosen.slice().sort((a, b) => a.code.localeCompare(b.code)).map(s => [{ html: `<b dir="ltr">${esc(s.code)}</b> ${esc(s.name)}` }, s.activity, { text: s.section, cls: 'num' },
          { html: s.meetings.map(m => `<b dir="ltr">${m.start}–${m.end}</b> ${esc(U.DAYS[m.day])}${m.mode !== 'وجاهي' ? ' · ' + esc(m.mode) : ''}`).join('<br>') },
          s.room === '0' ? 'قاعة افتراضية (0)' : `${s.room} – ${s.building}`, s.instructor, { html: `<span dir="ltr">${s.registered}/${s.capacity}</span>`, cls: 'num' }]) }],
    });
  }

  // ---------------------------------------------------------------- events
  function set(ch) {
    const st = Object.assign(readState(), ch);
    writeState(st);
    render();
  }
  let qt;
  function bind(st, chosen) {
    const q = $('#pl-q');
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { set({ q: q.value }); const n = $('#pl-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
    $('#pl-deg').addEventListener('change', e => set({ deg: e.target.value }));
    $('#pl-fac').addEventListener('change', e => set({ fac: e.target.value }));
    document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.add, s2 = readState();
      if (s2.courses.includes(c)) {  // off: the course and its chosen sections (else the plan link brings it back)
        s2.courses = s2.courses.filter(x => x !== c);
        partsOf(c).forEach(p => delete s2.pick[p.id]);
        writeState(s2); render(); return;
      }
      s2.courses.push(c);
      // a part with only one section is chosen at once
      partsOf(c).forEach(p => { if (p.list.length === 1 && !s2.pick[p.id]) s2.pick[p.id] = U.sectionKey(p.list[0]); });
      writeState(s2); render();
    }));
    document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      const c = b.dataset.remove, s2 = readState();
      s2.courses = s2.courses.filter(x => x !== c);
      partsOf(c).forEach(p => delete s2.pick[p.id]);
      writeState(s2); render();
    }));
    document.querySelectorAll('[data-part]').forEach(sel => sel.addEventListener('change', () => {
      const s2 = readState();
      if (sel.value) s2.pick[sel.dataset.part] = sel.value; else delete s2.pick[sel.dataset.part];
      writeState(s2); render();
    }));
    $('#pl-suggest').addEventListener('click', () => suggest(st));
    $('#pl-ics').addEventListener('click', () => ics(chosen));
    $('#pl-print').addEventListener('click', () => print(chosen));
    $('#pl-share').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(location.href); const b = $('#pl-share'); b.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; });
    $('#pl-clear').addEventListener('click', () => { if (confirm('مسح كل المقررات من الخطة؟')) { try { localStorage.removeItem(STORE); } catch (e) { /* */ } history.replaceState(null, '', location.pathname); set({ courses: [], pick: {} }); } });
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json')]).then(([tt, idx]) => {
    TT = tt; S = tt.sections; IDX = idx;
    U.setDays(tt.days);
    BY_KEY = Object.fromEntries(S.map(s => [U.sectionKey(s), s]));
    $('#foot-count').textContent = `${S.length} شعبة · ${tt.term}`;
    U.updatedLine(tt.updated, 'المقاعد تُراجَع كل ساعة');
    render();
    const top = $('#pg-q');
    top.addEventListener('input', () => { const i = $('#pl-q'); if (i) { i.value = top.value; i.dispatchEvent(new Event('input')); } });
  }).catch(e => { $('#pl-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
