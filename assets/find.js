/* "أين أجد…؟": one search over the whole site — people (directory), courses (timetable), rooms and buildings,
   units of the organizational structure, academic departments and calendar dates. A number finds a room, an
   extension or a course code at once. ?q= keeps the search in the link. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  const st = { q: P.get('q') || '', type: P.get('t') || 'all', more: {} };
  let IDX = [], READY = false, NOW = null;
  const TYPES = [
    ['person', 'الأشخاص', 'bi-person-fill'], ['course', 'المقررات', 'bi-journal-bookmark-fill'], ['room', 'القاعات', 'bi-door-open-fill'],
    ['unit', 'الوحدات والأقسام', 'bi-diagram-3-fill'], ['building', 'المباني', 'bi-building-fill'], ['date', 'مواعيد التقويم', 'bi-calendar-event-fill'],
  ];
  const TNAME = Object.fromEntries(TYPES.map(t => [t[0], t]));
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const strip = n => norm(String(n || '').replace(/^\s*((أ|ا)\s*\.?\s*د|د|م|أ)\s*\.+\s*/, ''));  // name without its title
  const plural = (n, one, two, few, many) => U.count(n, one, two, few, many);

  // ---------------------------------------------------------------- the index
  function build(staff, ins, tt, org, cal) {
    const out = [];
    const facName = {};
    (staff ? staff.faculties : []).forEach(f => { facName[String(f.id)] = f.name; });
    const insBy = {};
    (ins ? ins.instructors : []).forEach(i => { if (i.email) insBy[i.email] = i; insBy['n:' + i.name] = i; });
    // people
    (staff ? staff.members : []).forEach(m => {
      const unit = facName[String(m.faculty)] || '';
      const ip = (m.email && insBy[m.email]) || insBy['n:' + m.name];
      out.push({ type: 'person', title: m.name, en: m.name_en, sub: [m.job || m.rank, m.department ? 'قسم ' + m.department : '', unit].filter(Boolean).join(' · '),
        photo: m.photo, ext: m.ext, email: m.email, role: m.role, office: m.office, job: norm(m.job), roleN: norm(m.role),
        href: `directory.html?q=${encodeURIComponent(U.shortName(m.name).split(' ').slice(0, 3).join(' '))}`, ins: ip ? ip.id : '',
        key: norm([m.name, m.name_en, m.job, m.rank, m.role, m.department, unit, m.office, m.email].join(' ')), name: strip(m.name), num: [m.ext].filter(Boolean) });
    });
    // courses (one entry per code and degree) and rooms
    if (tt) {
      const C = {}, R = {};
      tt.sections.forEach(s => {
        const k = s.code + '|' + s.degree;
        const c = C[k] || (C[k] = { code: s.code, degree: s.degree, name: s.name.replace(/\s*-\s*(نظري|عملي)\s*$/, ''), dept: s.department, fac: s.faculty, secs: [], inst: new Set() });
        c.secs.push(s); if (s.instructor) c.inst.add(s.instructor);
        if (s.room && s.room !== '0') {
          const rk = clean(s.room);
          const r = R[rk] || (R[rk] = { room: rk, bld: /^-+$/.test(s.building) ? 'مبنى غير محدد' : s.building, secs: [], meets: [] });
          r.secs.push(s);
          s.meetings.filter(m => live(m) && m.mode !== 'الكتروني كامل').forEach(m => r.meets.push({ s, m }));
        }
      });
      Object.values(C).forEach(c => {
        const open = c.secs.filter(s => s.registered < s.capacity);
        out.push({ type: 'course', title: `${c.code} ${c.name}`, code: c.code, sub: [c.dept, c.degree !== 'البكالوريوس' ? c.degree : ''].filter(Boolean).join(' · '),
          stat: `${c.secs.length} ${c.secs.length > 2 && c.secs.length < 11 ? 'شعب' : 'شعبة'} · ${open.length ? `${open.length} مفتوحة، ${open.reduce((a, s) => a + s.capacity - s.registered, 0)} مقعداً متاحاً` : 'كل الشعب مغلقة'}`,
          open: open.length, inst: [...c.inst].map(U.shortName).slice(0, 4),
          href: `timetable.html?q=${encodeURIComponent(c.code)}`, plan: `planner.html?c=${encodeURIComponent(c.code + '|' + c.degree)}`,
          key: norm([c.code, c.name, c.dept, c.fac, ...c.inst].join(' ')), num: [c.code] });
      });
      const blds = {};
      Object.values(R).forEach(r => {
        (blds[r.bld] ||= []).push(r);
        out.push({ type: 'room', title: `قاعة ${r.room}`, room: r.room, sub: r.bld, r, href: `room.html?r=${encodeURIComponent(r.room)}`,
          key: norm(['قاعه', r.room, r.bld].join(' ')), num: [r.room] });
      });
      Object.entries(blds).forEach(([b, rs]) => {
        if (b === 'مبنى غير محدد') return;
        out.push({ type: 'building', title: b, sub: `${rs.length} قاعة تدريس`, rooms: rs, href: `room.html?bld=${encodeURIComponent(b)}`, screen: `screen.html?b=${encodeURIComponent(b)}`,
          usage: `usage.html?bld=${encodeURIComponent(b)}`, key: norm(b + ' مبنى'), num: [] });
      });
    }
    // units of the structure and academic departments
    if (org) {
      const walk = (n, path) => {
        const head = (n.official_heads && n.official_heads[0]) || (n.people || []).find(p => p.role) || (n.kind === 'academic-dept' && (n.people || [])[0]);
        out.push({ type: 'unit', title: n.name, sub: path.slice(-2).join(' ‹ ') || 'أعلى الهيكل', head: head ? head.name : '', headExt: head ? head.ext : '',
          href: `org.html?u=${encodeURIComponent(n.id)}`, key: norm([n.name, head ? head.name : ''].join(' ')), num: [], academic: n.kind === 'academic-dept' });
        (n.children || []).forEach(c => walk(c, path.concat(n.name)));
      };
      walk(org.tree, []);
    }
    // calendar dates
    (cal ? cal.semesters : []).forEach(sem => (sem.events || []).forEach(e => {
      out.push({ type: 'date', title: e.title, sub: e.start === e.end ? U.numDate(e.start) : `${U.numDate(e.start)} – ${U.numDate(e.end)}`, start: e.start, end: e.end,
        sem: sem.name || sem.title || '', href: 'calendar.html', key: norm(e.title + ' ' + (e.note || '')), num: [] });
    }));
    return out;
  }

  // ---------------------------------------------------------------- matching and ranking
  function search(q) {
    const nq = norm(q.trim());
    if (!nq) return [];
    const words = nq.split(/\s+/).filter(Boolean);
    const isNum = /^[\p{L}]?\d[\d\-]*$/u.test(q.trim());
    const res = [];
    IDX.forEach(x => {
      let s = 0;
      const title = norm(x.title);
      if (isNum) {
        const v = q.trim();
        if (x.num.some(n => clean(n) === v)) s = 120;
        else if (x.num.some(n => clean(n).startsWith(v))) s = 70;
        else if (x.key.includes(nq)) s = 25;
      } else {
        if (!words.every(w => x.key.includes(w))) return;
        s = 20;
        if (title === nq || (x.name && x.name === nq)) s = 110;
        else if (title.startsWith(nq) || (x.name && x.name.startsWith(nq))) s = 80;
        else if (words.every(w => title.includes(w))) s = 55;
        else if (words.every(w => (' ' + title).includes(' ' + w))) s = 45;
      }
      if (!s) return;
      if (x.type === 'person') {
        // a role or job title asked for ("عميد", "رئيس قسم", "مدير"): the people holding it first
        if (x.roleN && x.roleN === nq) s = Math.max(s, 95);
        else if (x.job && x.job.startsWith(nq)) s = Math.max(s, 75);
        if (x.role) s += 4;
      }
      if (x.type === 'date' && s < 80) s -= 10;  // a word inside a calendar sentence is a weak match
      if (x.type === 'date' && x.end >= NOW.iso) s += 3;  // upcoming dates before past ones
      if (x.type === 'unit' && x.academic) s -= 2;
      res.push({ x, s });
    });
    return res.sort((a, b) => b.s - a.s || a.x.title.localeCompare(b.x.title, 'ar')).map(r => r.x);
  }
  // highlight the query words in a text (exact or with Arabic spelling variants)
  function mark(text, q) {
    const t = esc(text);
    const words = q.trim().split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[اأإآ]/g, '[اأإآ]').replace(/[هة]/g, '[هة]').replace(/[يى]/g, '[يى]'));
    if (!words.length) return t;
    try { return t.replace(new RegExp(`(${words.join('|')})`, 'g'), '<mark>$1</mark>'); } catch (e) { return t; }
  }

  // ---------------------------------------------------------------- cards
  function roomNow(r) {
    if (!NOW.ok) return { cls: 'off', text: NOW.why };
    const today = r.meets.filter(x => x.m.day === NOW.day).map(x => ({ ...x, a: toMin(x.m.start), b: toMin(x.m.end) })).sort((x, y) => x.a - y.a);
    const cur = today.find(x => x.a <= NOW.min && NOW.min < x.b);
    if (cur) return { cls: 'busy', text: `مشغولة الآن حتى ${cur.m.end}: ${cur.s.code} ${U.shortName(cur.s.instructor)}` };
    const next = today.find(x => x.a > NOW.min);
    return { cls: 'free', text: next ? `شاغرة الآن حتى ${next.m.start}` : 'شاغرة بقية اليوم' };
  }
  function card(x, q, big) {
    const k = TNAME[x.type];
    const tag = `<span class="fd-tag"><i class="bi ${k[2]}"></i> ${k[1].replace('الأشخاص', 'شخص').replace('المقررات', 'مقرر').replace('القاعات', 'قاعة').replace('الوحدات والأقسام', 'وحدة').replace('المباني', 'مبنى').replace('مواعيد التقويم', 'موعد')}</span>`;
    if (x.type === 'person') {
      return `<div class="fd-card person${big ? ' big' : ''}"><span class="fd-av">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<i class="bi bi-person-fill"></i></span>
        <div class="fd-main"><a class="fd-title" href="${x.ins ? 'instructor.html?id=' + x.ins : x.href}">${mark(x.title, q)}</a>${x.en && big ? `<div class="fd-en" dir="ltr">${esc(x.en)}</div>` : ''}
          <div class="fd-sub">${mark(x.sub, q)}</div>
          <div class="fd-acts">${x.ext ? `<a class="fd-btn call" href="tel:+96265799555,${esc(x.ext)}"><i class="bi bi-telephone-fill"></i> <bdi dir="ltr">${esc(x.ext)}</bdi></a>` : ''}
            ${x.email ? `<a class="fd-btn" href="mailto:${esc(x.email)}"><i class="bi bi-envelope-fill"></i>${big ? ` <span dir="ltr">${esc(x.email)}</span>` : ''}</a>` : ''}
            ${x.office ? `<span class="fd-btn plain"><i class="bi bi-door-closed"></i> ${esc(x.office)}</span>` : ''}
            ${x.ins ? `<a class="fd-btn" href="instructor.html?id=${x.ins}"><i class="bi bi-calendar-week"></i> جدوله</a>` : ''}
            <a class="fd-btn" href="${x.href}"><i class="bi bi-person-lines-fill"></i> الدليل</a></div></div>${tag}</div>`;
    }
    if (x.type === 'course') {
      return `<div class="fd-card course${big ? ' big' : ''}"><span class="fd-ic"><i class="bi bi-journal-bookmark-fill"></i></span>
        <div class="fd-main"><a class="fd-title" href="${x.href}">${mark(x.title, q)}</a><div class="fd-sub">${mark(x.sub, q)}</div>
          <div class="fd-stat ${x.open ? 'ok' : 'no'}"><i class="bi ${x.open ? 'bi-unlock-fill' : 'bi-lock-fill'}"></i> ${esc(x.stat)}</div>
          ${x.inst.length ? `<div class="fd-sub small">${x.inst.map(n => mark(n, q)).join('، ')}</div>` : ''}
          <div class="fd-acts"><a class="fd-btn" href="${x.href}"><i class="bi bi-table"></i> الشعب والأوقات</a><a class="fd-btn" href="${x.plan}"><i class="bi bi-calendar2-plus"></i> أضفه إلى مخطط جدولي</a></div></div>${tag}</div>`;
    }
    if (x.type === 'room') {
      const n = roomNow(x.r);
      return `<div class="fd-card room${big ? ' big' : ''}"><span class="fd-ic room"><b dir="ltr">${esc(x.room)}</b></span>
        <div class="fd-main"><a class="fd-title" href="${x.href}">${mark(x.title, q)}</a><div class="fd-sub">${esc(x.sub)} · ${x.r.secs.length} شعبة</div>
          <div class="fd-stat ${n.cls === 'free' ? 'ok' : n.cls === 'busy' ? 'no' : ''}"><i class="bi bi-circle-fill"></i> ${esc(n.text)}</div>
          <div class="fd-acts"><a class="fd-btn" href="${x.href}"><i class="bi bi-door-open"></i> صفحة القاعة وجدولها</a></div></div>${tag}</div>`;
    }
    if (x.type === 'building') {
      const free = NOW.ok ? x.rooms.filter(r => roomNow(r).cls === 'free').length : null;
      return `<div class="fd-card building${big ? ' big' : ''}"><span class="fd-ic"><i class="bi bi-building-fill"></i></span>
        <div class="fd-main"><a class="fd-title" href="${x.href}">${mark(x.title, q)}</a><div class="fd-sub">${esc(x.sub)}${free != null ? ` · <b class="text-success">${free} شاغرة الآن</b>` : ''}</div>
          <div class="fd-acts"><a class="fd-btn" href="${x.href}"><i class="bi bi-door-open"></i> قاعاته</a><a class="fd-btn" href="${x.screen}"><i class="bi bi-display"></i> شاشة المبنى</a>
            <a class="fd-btn" href="${x.usage}"><i class="bi bi-grid-3x3-gap"></i> الإشغال</a></div></div>${tag}</div>`;
    }
    if (x.type === 'unit') {
      return `<div class="fd-card unit${big ? ' big' : ''}"><span class="fd-ic"><i class="bi ${x.academic ? 'bi-journal-bookmark' : 'bi-diagram-3-fill'}"></i></span>
        <div class="fd-main"><a class="fd-title" href="${x.href}">${mark(x.title, q)}</a><div class="fd-sub">${esc(x.sub)}</div>
          ${x.head ? `<div class="fd-sub"><i class="bi bi-star-fill text-warning"></i> ${mark(x.head, q)}${x.headExt ? ` · <a href="tel:+96265799555,${esc(x.headExt)}"><bdi dir="ltr">${esc(x.headExt)}</bdi></a>` : ''}</div>` : ''}
          <div class="fd-acts"><a class="fd-btn" href="${x.href}"><i class="bi bi-diagram-3"></i> في الهيكل التنظيمي</a></div></div>${tag}</div>`;
    }
    const past = x.end < NOW.iso, soon = !past && x.start <= NOW.iso;
    return `<div class="fd-card date${big ? ' big' : ''}${past ? ' past' : ''}"><span class="fd-ic"><i class="bi bi-calendar-event-fill"></i></span>
      <div class="fd-main"><a class="fd-title" href="${x.href}">${mark(x.title, q)}</a><div class="fd-sub"><bdi>${esc(x.sub)}</bdi>${x.sem ? ' · ' + esc(x.sem) : ''}</div>
        <div class="fd-stat ${past ? '' : 'ok'}">${past ? 'انتهى' : soon ? 'جارٍ الآن' : 'قادم'}</div></div>${tag}</div>`;
  }

  // ---------------------------------------------------------------- page
  function render() {
    const q = st.q.trim();
    const res = READY ? search(q) : [];
    const by = {};
    res.forEach(x => (by[x.type] ||= []).push(x));
    const counts = TYPES.map(t => [t, (by[t[0]] || []).length]);
    const view = st.type === 'all' ? res : (by[st.type] || []);
    const best = view[0];
    const numInfo = /^\d{3,5}$/.test(q) ? (() => {
      const p = (by.person || []).filter(x => x.ext === q), r = (by.room || []).filter(x => x.room === q);
      return p.length || r.length ? `<div class="fd-num"><i class="bi bi-123"></i> الرقم <b dir="ltr">${esc(q)}</b>: ${[p.length ? `الفرعي لـ${p.map(x => esc(x.title)).join('، ')}` : '', r.length ? 'رقم قاعة' : ''].filter(Boolean).join(' · ')}</div>` : '';
    })() : '';
    const groups = st.type === 'all'
      ? TYPES.filter(t => by[t[0]]).map(t => {
        const list = by[t[0]].filter(x => x !== best), lim = st.more[t[0]] ? 60 : t[0] === 'person' ? 6 : 4;
        return list.length ? `<section class="fd-group"><h2><i class="bi ${t[2]}"></i> ${t[1]} <span>${by[t[0]].length}</span></h2>
          <div class="fd-grid">${list.slice(0, lim).map(x => card(x, q)).join('')}</div>
          ${list.length > lim ? `<button type="button" class="btn btn-sm btn-link fd-more" data-more="${t[0]}">عرض ${st.more[t[0]] ? 'أقل' : `الكل (${by[t[0]].length})`}</button>` : ''}</section>` : '';
      }).join('')
      : `<div class="fd-grid">${view.filter(x => x !== best).slice(0, 120).map(x => card(x, q)).join('')}</div>`;
    $('#fd-results').innerHTML = !READY ? '<div class="loading"><div><div class="spinner-border text-secondary"></div><div class="mt-2">جارٍ تجهيز البحث…</div></div></div>'
      : !q ? `${soon()}<div class="fd-empty"><p>اكتب اسم شخص أو جزءاً منه، وظيفة، رقم قاعة أو فرعي، رمز مقرر أو اسمه، وحدة أو قسم، أو موعداً في التقويم.</p>
          <div class="fd-try">${['7419', 'عميد', 'رئيس قسم علم الحاسوب', '601214', 'القبول والتسجيل', 'الامتحانات النهائية', 'مبنى المكتبة', 'المالية'].map(s => `<button type="button" data-try="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <div class="fd-stats">${counts.map(([t]) => `<span><i class="bi ${t[2]}"></i> ${IDX.filter(x => x.type === t[0]).length} ${esc(t[1])}</span>`).join('')}</div></div>`
        : !res.length ? `<div class="fd-empty"><p><i class="bi bi-search"></i> لا نتائج لـ«${esc(q)}». جرّب جزءاً من الاسم فقط، أو كتابة أخرى (مثلاً «احمد» بدل «أحمد» تعمل تلقائياً).</p></div>`
          : `${numInfo}<div class="fd-chips">${[['all', 'الكل', 'bi-grid', res.length], ...counts.filter(([, n]) => n).map(([t, n]) => [t[0], t[1], t[2], n])]
              .map(([k, l, i, n]) => `<button type="button" class="${st.type === k ? 'on' : ''}" data-type="${k}"><i class="bi ${i}"></i> ${l} <span>${n}</span></button>`).join('')}</div>
            ${best ? `<div class="fd-best"><small>أفضل نتيجة</small>${card(best, q, true)}</div>` : ''}${groups}`;
    document.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { st.type = b.dataset.type; sync(); render(); }));
    document.querySelectorAll('[data-more]').forEach(b => b.addEventListener('click', () => { st.more[b.dataset.more] = !st.more[b.dataset.more]; render(); }));
    document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => { setQ(b.dataset.try); }));
    const n = res.length;
    $('#fd-count').textContent = q && READY ? plural(n, 'نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة') : '';
  }
  function sync() {
    const u = new URL(location.href);
    st.q ? u.searchParams.set('q', st.q) : u.searchParams.delete('q');
    st.type !== 'all' ? u.searchParams.set('t', st.type) : u.searchParams.delete('t');
    history.replaceState(null, '', u);
  }
  function setQ(v) { st.q = v; st.type = 'all'; st.more = {}; $('#fd-q').value = v; $('#pg-q').value = v; sync(); render(); }

  $('#fd-app').innerHTML = `<div class="fd-box"><i class="bi bi-search"></i><input id="fd-q" type="search" autocomplete="off" placeholder="أين أجد…؟ اسم، قاعة، فرعي، مقرر، وحدة، موعد" value="${esc(st.q)}" aria-label="بحث شامل">
      <span id="fd-count"></span></div><div id="fd-results"></div>`;
  let t;
  const onInput = v => { clearTimeout(t); t = setTimeout(() => { st.q = v; st.type = 'all'; st.more = {}; sync(); render(); }, 160); };
  $('#fd-q').addEventListener('input', e => { $('#pg-q').value = e.target.value; onInput(e.target.value); });
  $('#pg-q').value = st.q;
  $('#pg-q').addEventListener('input', e => { $('#fd-q').value = e.target.value; onInput(e.target.value); });
  $('#fd-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const a = document.querySelector('.fd-best .fd-title'); if (a) location.href = a.href; } });
  $('#fd-q').focus();
  // the start screen: the next dates of the academic calendar with a countdown, and today's changes («ما الجديد؟»)
  let SOON = [], CHG = null;
  function soon() {
    if (!SOON.length && CHG == null) return '';
    const today = NOW.iso, days = d => Math.round((new Date(d + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
    const when = e => e.start <= today ? (e.end > today ? `جارٍ حتى ${U.numDate(e.end)}` : 'اليوم') : days(e.start) === 1 ? 'غداً' : `بعد ${U.count(days(e.start), 'يوم', 'يومين', 'أيام', 'يوماً')}`;
    return `<div class="fd-soon">${SOON.map(e => `<a href="calendar.html" class="fd-cd ${e.start <= today ? 'now' : ''}"><b>${when(e)}</b><span>${esc(e.title)}</span>
        <small>${U.numDate(e.start)}${e.end && e.end !== e.start ? ' – ' + U.numDate(e.end) : ''}</small></a>`).join('')}
      ${CHG != null ? `<a href="changes.html" class="fd-cd chg"><b>${CHG ? U.count(CHG, 'تغيير واحد', 'تغييران', 'تغييرات', 'تغييراً') : 'لا تغييرات'} اليوم</b><span>ما الجديد؟</span><small>الجدول والدليل والتقويم</small></a>` : ''}</div>`;
  }
  render();

  Promise.allSettled(['data/staff.json', 'data/instructors.json', 'data/timetable.json', 'data/org.json', 'data/calendar.json'].map(f => U.getJSON(f))).then(rs => {
    const [staff, ins, tt, org, cal] = rs.map(r => r.status === 'fulfilled' ? r.value : null);
    if (tt) U.setDays(tt.days);
    const now = U.amman(P.get('at')), T = ins && ins.teaching;
    NOW = { ...now, ok: !T || (now.iso >= T.start && now.iso <= T.end && !T.holidays.includes(now.iso) && now.day !== 'ج'),
      why: T && now.iso < T.start ? 'التدريس لم يبدأ بعد' : T && now.iso > T.end ? 'انتهى التدريس للفصل' : 'لا محاضرات اليوم' };
    IDX = build(staff, ins, tt, org, cal);
    if (cal) SOON = cal.semesters.flatMap(sm => sm.events).filter(e => (e.end || e.start) >= now.iso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
    U.getJSON('data/changes.json').then(c => { CHG = c.events.filter(e => U.amman(e.at).iso === now.iso).length; render(); }).catch(() => {});
    READY = true;
    const n = IDX.length;
    $('#foot-count').textContent = `${n} عنصراً قابلاً للبحث`;
    if (staff) U.updatedLine(staff.updated, 'البحث في كل صفحات الموقع');
    const missing = rs.filter(r => r.status !== 'fulfilled').length;
    if (missing) $('#fd-app').insertAdjacentHTML('afterbegin', `<div class="alert alert-warning small">تعذّر تحميل ${missing} من مصادر البحث؛ النتائج قد تكون ناقصة.</div>`);
    render();
  });
})();
