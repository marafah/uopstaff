/* «محاضرة تعويضية»: pick an instructor and one of their sections; the page lists the teaching days ahead with the times
   when the instructor has no other lecture and a room is free for the whole period (rooms that held the same kind of
   class this term, big enough for the section's students, the section's own building first). A chosen slot gives
   a notice to print, a message for the students, a calendar file and a record in «مفكرتي».
   Only the published timetable is known: the students' other courses and rooms booked outside it are not.
   ?id=<instructor id>&s=<section key> */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  let TT, IDX, ROOMS, SECS, BYNAME;
  const st = { id: P.get('id') || '', s: P.get('s') || '', dur: 0, from: '', to: '', start: '08:00', end: '18:00', same: true, fit: true, pick: null };
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const inRoom = m => live(m) && m.mode !== 'الكتروني كامل';
  const DAYJS = U.JS_DAY;
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');

  // the portal sometimes lists one class twice (two degrees): one section here
  function sectionsOf(name) {
    const seen = {};
    return TT.sections.filter(s => s.instructor === name).filter(s => {
      const k = [s.code, s.section, s.activity, JSON.stringify(s.meetings), s.room].join('|');
      if (seen[k]) { seen[k].degrees.push(s.degree); return false; }
      seen[k] = s; s.degrees = [s.degree]; return true;
    });
  }
  function buildRooms() {
    const by = {};
    TT.sections.forEach(s => {
      if (!s.room || s.room === '0') return;
      const k = clean(s.room);
      const r = by[k] || (by[k] = { room: k, building: /^-+$/.test(s.building) ? 'مبنى غير محدد' : s.building, busy: {}, acts: new Set(), most: 0 });
      r.acts.add(s.activity);
      r.most = Math.max(r.most, s.registered || 0);
      s.meetings.filter(inRoom).forEach(m => (r.busy[m.day] ||= []).push([toMin(m.start), toMin(m.end)]));
    });
    return by;
  }
  const free = (list, a, b) => !(list || []).some(([x, y]) => x < b && a < y);
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dayOf = s => DAYJS[new Date(s + 'T12:00:00Z').getUTCDay()];
  const fmtDay = s => `${U.DAYS[dayOf(s)]} ${U.numDate(s)}`;

  // teaching days in the chosen range: no Fridays, no official holidays, inside the term's teaching weeks
  function days() {
    const T = IDX.teaching || {}, out = [];
    const saturday = TT.sections.some(s => s.meetings.some(m => m.day === 'س'));
    for (let d = st.from; d <= st.to && out.length < 60; d = addDays(d, 1)) {
      if (T.start && d < T.start) continue;
      if (T.end && d > T.end) break;
      const w = dayOf(d);
      if (w === 'ج' || (w === 'س' && !saturday) || (T.holidays || []).includes(d)) continue;
      out.push(d);
    }
    return out;
  }
  function slots(sec) {
    const mine = {};
    sectionsOf(sec.instructor).forEach(s => s.meetings.filter(m => live(m) && m.start).forEach(m => (mine[m.day] ||= []).push([toMin(m.start), toMin(m.end)])));
    const need = sec.registered || 0, home = clean(sec.room) && ROOMS[clean(sec.room)] ? ROOMS[clean(sec.room)].building : sec.building;
    const rooms = Object.values(ROOMS).filter(r => (!st.same || r.acts.has(sec.activity)) && (!st.fit || r.most >= need));
    const a0 = toMin(st.start), a1 = toMin(st.end), dur = st.dur;
    const now = U.amman();
    return days().map(d => {
      const w = dayOf(d), times = [];
      for (let a = a0; a + dur <= a1; a += 30) {
        if (d === now.iso && a <= now.min) continue;
        if (!free(mine[w], a, a + dur)) continue;
        const ok = rooms.filter(r => free(r.busy[w], a, a + dur))
          .sort((x, y) => (y.building === home) - (x.building === home) || x.most - y.most || x.room.localeCompare(y.room));
        if (ok.length) times.push({ a, rooms: ok, near: ok.some(r => r.building === home) });
      }
      return { d, w, times, busy: (mine[w] || []).slice().sort((x, y) => x[0] - y[0]) };
    }).filter(x => x.times.length || x.busy.length);
  }

  // ---------------------------------------------------------------- views
  function pickInstructor() {
    const list = IDX.instructors.filter(i => i.sections).sort((a, b) => U.shortName(a.name).localeCompare(U.shortName(b.name), 'ar'));
    $('#mk-app').innerHTML = `<div class="mk-intro card"><div class="card-body">
        <h2 class="h5 fw-bold"><i class="bi bi-arrow-repeat"></i> من المدرس؟</h2>
        <p class="text-muted small mb-2">اختر المدرس ثم الشعبة، فتظهر الأيام والأوقات التي لا يكون فيها للمدرس محاضرة أخرى ومعها القاعات الشاغرة طوال المدة.</p>
        <input class="form-control form-control-lg" id="mk-who" list="mk-list" placeholder="اكتب اسم المدرس…" autocomplete="off">
        <datalist id="mk-list">${list.map(i => `<option value="${esc(i.name)}">${esc(i.department || '')}</option>`).join('')}</datalist>
        </div></div>`;
    const go = () => { const i = list.find(x => x.name === $('#mk-who').value.trim()) || list.find(x => norm(x.name).includes(norm($('#mk-who').value.trim())) && $('#mk-who').value.trim().length > 3);
      if (i) { st.id = i.id; st.s = ''; sync(); render(); } };
    $('#mk-who').addEventListener('change', go);
    $('#mk-who').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => $('#mk-who').focus(), 100);
  }
  function render() {
    const I = IDX.instructors.find(i => i.id === st.id);
    if (!I) return pickInstructor();
    SECS = sectionsOf(I.name);
    const sec = SECS.find(s => U.sectionKey(s) === st.s);
    const usual = s => { const c = {}; s.meetings.filter(m => m.start).forEach(m => { const d = toMin(m.end) - toMin(m.start); c[d] = (c[d] || 0) + 1; });
      return +(Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [60])[0]; };
    if (sec && !st.dur) st.dur = usual(sec);
    const res = sec ? slots(sec) : [];
    const total = res.reduce((n, x) => n + x.times.length, 0);
    $('#mk-app').innerHTML = `
      <div class="mk-who card mb-3"><div class="card-body d-flex flex-wrap align-items-center gap-3">
        <span class="mk-av">${I.photo ? `<img src="${esc(I.photo)}" alt="" onerror="this.remove()">` : ''}<i class="bi bi-person-fill"></i></span>
        <div class="flex-grow-1"><b class="fs-5">${esc(I.name)}</b><small class="d-block text-muted">${esc([I.department, I.faculty].filter(Boolean).join(' · '))}</small></div>
        <a class="btn btn-sm btn-outline-secondary" href="instructor.html?id=${I.id}"><i class="bi bi-calendar-week"></i> جدوله</a>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="mk-change"><i class="bi bi-arrow-left-right"></i> مدرس آخر</button></div></div>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-1-circle-fill"></i> الشعبة التي تحتاج محاضرة تعويضية</div>
        <div class="mk-secs">${SECS.map(s => { const k = U.sectionKey(s);
          return `<label class="mk-sec ${k === st.s ? 'on' : ''}"><input type="radio" name="mk-s" value="${esc(k)}" ${k === st.s ? 'checked' : ''}>
            <b>${esc(s.code)} ${esc(s.name)}</b><small>شعبة ${esc(s.section)} · ${esc(s.activity)} · ${s.registered} طالباً${s.degrees.length > 1 ? ' · ' + s.degrees.join(' و') : ''}</small>
            <small class="mk-when">${s.meetings.filter(m => m.start).map(m => `${U.DAYS[m.day]} <bdi dir="ltr">${m.start}–${m.end}</bdi>`).join('، ') || 'بلا موعد ثابت'}${s.room && s.room !== '0' ? ` · قاعة ${esc(clean(s.room))}` : ''}</small></label>`; }).join('')
          || '<p class="p-3 mb-0 text-muted">لا شعب لهذا المدرس في الجدول الحالي.</p>'}</div></section>
      ${sec ? `<section class="card mb-3 no-print"><div class="card-header"><i class="bi bi-2-circle-fill"></i> المدة والفترة</div><div class="card-body d-flex flex-wrap gap-3 align-items-end">
          <div><label class="small fw-bold" for="mk-dur">مدة المحاضرة</label><select class="form-select form-select-sm" id="mk-dur">${[50, 60, 75, 90, 120, 150, 180].concat(st.dur).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
            .map(v => `<option value="${v}" ${v === st.dur ? 'selected' : ''}>${U.mins(v)}</option>`).join('')}</select></div>
          <div><label class="small fw-bold" for="mk-from">من يوم</label><input type="date" class="form-control form-control-sm" id="mk-from" value="${st.from}"></div>
          <div><label class="small fw-bold" for="mk-to">إلى يوم</label><input type="date" class="form-control form-control-sm" id="mk-to" value="${st.to}"></div>
          <div><label class="small fw-bold" for="mk-start">بين الساعة</label><input type="time" class="form-control form-control-sm" id="mk-start" value="${st.start}" step="1800"></div>
          <div><label class="small fw-bold" for="mk-end">و</label><input type="time" class="form-control form-control-sm" id="mk-end" value="${st.end}" step="1800"></div>
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="mk-same" ${st.same ? 'checked' : ''}> قاعات ${esc(sec.activity === 'عملي' ? 'العملي (المختبرات)' : 'النظري')} فقط</label>
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="mk-fit" ${st.fit ? 'checked' : ''}> تتسع لـ ${sec.registered} طالباً</label>
        </div></section>
        <section class="card"><div class="card-header"><i class="bi bi-3-circle-fill"></i> الأوقات المتاحة <small class="text-muted">${total ? U.count(total, 'وقت واحد', 'وقتان', 'أوقات', 'وقتاً') : ''}</small></div>
          <p class="small text-muted px-3 pt-2 mb-1"><i class="bi bi-info-circle"></i> كل وقت هنا: لا محاضرة أخرى للمدرس، وقاعة شاغرة طوال ${U.mins(st.dur)} حسب الجدول المنشور.
            «تتسع» تعني أن القاعة استوعبت هذا الفصل شعبةً بالعدد نفسه أو أكبر. لا يعرف الموقع جداول الطلبة في مقرراتهم الأخرى ولا الحجوزات خارج الجدول، فتأكّد منها قبل الإعلان.</p>
          <div class="mk-days">${res.map(x => `<div class="mk-day"><div class="mk-dname"><b>${fmtDay(x.d)}</b>${x.busy.length ? `<small>محاضراته: ${x.busy.map(([a, b]) => `<bdi dir="ltr">${toTime(a)}–${toTime(b)}</bdi>`).join('، ')}</small>` : '<small>لا محاضرات له</small>'}</div>
              <div class="mk-times">${x.times.map(t => `<button type="button" class="mk-t ${t.near ? 'near' : ''}" data-d="${x.d}" data-a="${t.a}" title="${t.near ? 'قاعة شاغرة في مبنى الشعبة نفسه' : ''}"><bdi dir="ltr">${toTime(t.a)}–${toTime(t.a + st.dur)}</bdi><small>${U.count(t.rooms.length, 'قاعة', 'قاعتان', 'قاعات', 'قاعة')}</small></button>`).join('') || '<em class="text-muted small">لا وقت متاحاً في هذا اليوم</em>'}</div></div>`).join('')
            || '<p class="p-3 text-muted mb-0">لا أوقات متاحة ضمن هذه الفترة والشروط. وسّع الفترة أو الساعات، أو ألغِ أحد الشرطين.</p>'}</div></section>` : ''}`;
    $('#mk-change').addEventListener('click', () => { st.id = ''; st.s = ''; sync(); render(); });
    document.querySelectorAll('[name=mk-s]').forEach(r => r.addEventListener('change', () => { st.s = r.value; st.dur = 0; sync(); render(); }));
    if (!sec) return;
    const on = (id, f) => $('#' + id).addEventListener('change', e => { f(e.target); render(); });
    on('mk-dur', e => { st.dur = +e.value; });
    on('mk-from', e => { if (e.value) st.from = e.value; if (st.to < st.from) st.to = st.from; });
    on('mk-to', e => { if (e.value) st.to = e.value < st.from ? st.from : e.value; });
    on('mk-start', e => { if (e.value) st.start = e.value; });
    on('mk-end', e => { if (e.value) st.end = e.value; });
    on('mk-same', e => { st.same = e.checked; });
    on('mk-fit', e => { st.fit = e.checked; });
    document.querySelectorAll('.mk-t').forEach(b => b.addEventListener('click', () => {
      const x = res.find(r => r.d === b.dataset.d), t = x.times.find(t => t.a === +b.dataset.a);
      choose(I, sec, x.d, t);
    }));
  }

  // ---------------------------------------------------------------- a chosen time: room, notice, message, calendar, notebook
  function choose(I, sec, d, t) {
    const home = ROOMS[clean(sec.room)] ? ROOMS[clean(sec.room)].building : sec.building;
    U.modal(`<i class="bi bi-calendar-plus"></i> ${fmtDay(d)} · <bdi dir="ltr">${toTime(t.a)}–${toTime(t.a + st.dur)}</bdi>`, `
      <p class="small text-muted mb-2">اختر القاعة (الأقرب أولاً: مبنى الشعبة، ثم الأصغر التي تتسع):</p>
      <div class="mk-rooms">${t.rooms.map((r, i) => `<label class="mk-room ${r.building === home ? 'near' : ''}"><input type="radio" name="mk-r" value="${esc(r.room)}" ${i ? '' : 'checked'}>
        <b>${esc(r.room)}</b><small>${esc(r.building)}${r.most ? ` · حتى ${r.most} طالباً` : ''}</small></label>`).join('')}</div>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="button" class="btn btn-maroon btn-sm" id="mk-print"><i class="bi bi-printer"></i> طباعة الإشعار</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="mk-copy"><i class="bi bi-clipboard"></i> نسخ رسالة للطلبة</button>
        <a class="btn btn-outline-success btn-sm" id="mk-wa" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> واتساب</a>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="mk-ics"><i class="bi bi-calendar-plus"></i> إلى تقويمي</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="mk-note"><i class="bi bi-journal-richtext"></i> إضافة إلى مفكرتي</button>
        <a class="btn btn-outline-secondary btn-sm" id="mk-room" target="_blank"><i class="bi bi-door-open"></i> صفحة القاعة</a></div>`);
    const room = () => (document.querySelector('[name=mk-r]:checked') || {}).value || '';
    const msg = () => `محاضرة تعويضية\n${sec.code} ${sec.name} – شعبة ${sec.section} (${sec.activity})\nيوم ${fmtDay(d)} من الساعة ${toTime(t.a)} إلى ${toTime(t.a + st.dur)}\nالقاعة ${room()}${ROOMS[room()] ? ' – ' + ROOMS[room()].building : ''}\n${I.name}`;
    const upd = () => { $('#mk-wa').href = 'https://wa.me/?text=' + encodeURIComponent(msg()); $('#mk-room').href = 'room.html?r=' + encodeURIComponent(room()); };
    upd();
    document.querySelectorAll('[name=mk-r]').forEach(r => r.addEventListener('change', upd));
    $('#mk-copy').addEventListener('click', e => navigator.clipboard.writeText(msg()).then(() => { e.currentTarget.innerHTML = '<i class="bi bi-check2"></i> نُسخت'; }));
    $('#mk-ics').addEventListener('click', () => {
      const dt = m => d.replace(/-/g, '') + 'T' + toTime(m).replace(':', '') + '00';
      const tx = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      U.download(`محاضرة_تعويضية_${sec.code}_${d}.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UoP unofficial//makeup//AR', 'BEGIN:VEVENT',
        `UID:makeup-${sec.code}-${sec.section}-${d}-${t.a}@uopstaff`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;TZID=Asia/Amman:${dt(t.a)}`, `DTEND;TZID=Asia/Amman:${dt(t.a + st.dur)}`, `SUMMARY:${tx('محاضرة تعويضية: ' + sec.code + ' ' + sec.name)}`,
        `LOCATION:${tx(room())}`, `DESCRIPTION:${tx(msg())}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', `DESCRIPTION:${tx(sec.name)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar;charset=utf-8');
    });
    $('#mk-note').addEventListener('click', () => {
      const rec = { type: 'lecture', title: `محاضرة تعويضية: ${sec.name}`, when: `${d}T${toTime(t.a)}`, end: `${d}T${toTime(t.a + st.dur)}`, place: room(),
        course: `${sec.code} ${sec.name}`, body: `شعبة ${sec.section} (${sec.activity}) · ${sec.registered} طالباً`, tags: ['محاضرة تعويضية'] };
      window.open('notes.html#add=' + encodeURIComponent(JSON.stringify(rec)), '_blank');
    });
    $('#mk-print').addEventListener('click', () => printReport({
      title: 'إشعار محاضرة تعويضية', subtitle: `${sec.code} ${sec.name} – شعبة ${sec.section}`, orientation: 'portrait', fit: true,
      stats: [['اليوم', fmtDay(d)], ['الوقت', `${toTime(t.a)}–${toTime(t.a + st.dur)}`], ['القاعة', room()], ['المدة', U.mins(st.dur)]],
      sections: [{ columns: ['البند', 'التفاصيل'], widths: ['28%', '72%'], rows: [['المقرر', `${sec.code} ${sec.name}`], ['الشعبة', `${sec.section} · ${sec.activity}${sec.degrees.length > 1 ? ' · ' + sec.degrees.join(' و') : ' · ' + sec.degree}`],
        ['المدرس', I.name], ['المبنى', ROOMS[room()] ? ROOMS[room()].building : ''], ['عدد الطلبة', String(sec.registered)],
        ['الموعد المعتاد', sec.meetings.filter(m => m.start).map(m => `${U.DAYS[m.day]} ${m.start}–${m.end}`).join('، ')]] }],
      note: 'اختير الوقت بحيث لا يتعارض مع محاضرات المدرس الأخرى، والقاعة شاغرة فيه حسب الجدول الدراسي المنشور.',
    }));
  }

  function sync() {
    const u = new URL(location.href);
    st.id ? u.searchParams.set('id', st.id) : u.searchParams.delete('id');
    st.s ? u.searchParams.set('s', st.s) : u.searchParams.delete('s');
    history.replaceState(null, '', u);
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json')]).then(([tt, idx]) => {
    TT = tt; IDX = idx;
    if (tt.days) U.setDays(tt.days);
    ROOMS = buildRooms();
    const today = U.amman().iso, T = idx.teaching || {};
    st.from = addDays(today, 1) < (T.start || '') ? T.start : addDays(today, 1);
    st.to = addDays(st.from, 13);
    if (T.end && st.to > T.end) st.to = T.end < st.from ? st.from : T.end;
    U.updatedLine(tt.updated, 'من الجدول الدراسي على بوابة الجامعة');
    $('#pg-q').addEventListener('change', e => { const v = norm(e.target.value.trim()); const i = idx.instructors.find(x => x.sections && norm(x.name).includes(v));
      if (v && i) { st.id = i.id; st.s = ''; sync(); render(); } });
    render();
  }).catch(() => { $('#mk-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل الجدول الدراسي. أعد المحاولة بعد قليل.</div>'; });
})();
