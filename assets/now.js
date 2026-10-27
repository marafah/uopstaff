/* Now on campus: lectures running now and starting soon, rooms free now, upcoming calendar dates.
   Amman time, refreshed every minute. ?kiosk=1 for lobby screens, ?at=2026-10-27T10:30 to look at another moment. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let TT, S, CAL, IDX;
  const P = new URLSearchParams(location.search);
  const KIOSK = P.get('kiosk') === '1';
  const st = { fac: P.get('fac') || '', bld: P.get('bld') || '', q: '' };

  // the moment shown: Amman clock (or ?at=) as date, day letter and minutes
  function moment() {
    // ?at=2026-10-27, 2026-10-27T10:30 or 2026-10-27T10:30:00 are read as Amman time (an explicit offset is kept)
    const at = P.get('at');
    let d = new Date();
    if (at) {
      const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/);
      const x = m ? new Date(`${m[1]}T${m[2] || '08:00'}:${m[3] || '00'}${m[4] || '+03:00'}`) : new Date(NaN);
      if (!isNaN(x)) d = x;
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
    const hour = +parts.hour % 24;  // some engines write midnight as 24
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { iso: `${parts.year}-${parts.month}-${parts.day}`, day: U.JS_DAY[wd], min: hour * 60 + +parts.minute,
      clock: `${String(hour).padStart(2, '0')}:${parts.minute}` };
  }
  function teachingStatus(now) {
    const T = IDX.teaching;
    if (!T) return { ok: true };
    if (now.iso < T.start) return { ok: false, why: `يبدأ التدريس في ${U.numDate(T.start)}` };
    if (now.iso > T.end) return { ok: false, why: `انتهى التدريس للفصل في ${U.numDate(T.end)}` };
    if (T.holidays.includes(now.iso)) return { ok: false, why: 'اليوم عطلة رسمية حسب التقويم الجامعي' };
    if (now.day === 'ج') return { ok: false, why: 'يوم الجمعة' };
    return { ok: true };
  }
  const inScope = s => (!st.fac || s.faculty === st.fac) && (!st.bld || s.building === st.bld)
    && (!st.q || norm([s.code, s.name, s.instructor, s.room, s.building].join(' ')).includes(st.q));

  function render() {
    const now = moment();
    const T = teachingStatus(now);
    const today = S.flatMap(s => s.meetings.filter(m => live(m) && m.day === now.day).map(m => ({ s, m, a: toMin(m.start), b: toMin(m.end) })));
    const scoped = today.filter(x => inScope(x.s));
    const running = T.ok ? scoped.filter(x => x.a <= now.min && now.min < x.b).sort((x, y) => x.b - y.b) : [];
    const soon = T.ok ? scoped.filter(x => x.a > now.min && x.a <= now.min + 60).sort((x, y) => x.a - y.a) : [];
    const later = T.ok ? scoped.filter(x => x.a > now.min + 60).length : 0;
    // rooms: free now and until when (all sections of the university count for occupancy)
    const rooms = [...new Set(S.filter(s => s.room !== '0' && (!st.bld || s.building === st.bld) && (!st.fac || s.faculty === st.fac)).map(s => s.room))];
    const bld = Object.fromEntries(S.map(s => [s.room, s.building]));
    const freeRooms = T.ok ? rooms.map(r => {
      const its = today.filter(x => x.s.room === r);
      if (its.some(x => x.a <= now.min && now.min < x.b)) return null;
      const next = its.filter(x => x.a > now.min).sort((x, y) => x.a - y.a)[0];
      return { r, b: bld[r], until: next ? next.a : null };
    }).filter(Boolean).sort((a, b) => (b.until || 1e9) - (a.until || 1e9) || a.r.localeCompare(b.r)) : [];
    const byBld = {};
    freeRooms.forEach(x => (byBld[x.b] ||= []).push(x));
    // upcoming dates from the academic calendar (14 days)
    const end = new Date(now.iso); end.setDate(end.getDate() + 14);
    const endIso = end.toISOString().slice(0, 10);
    const events = CAL.semesters.flatMap(s => s.events).filter(e => e.end >= now.iso && e.start <= endIso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
    const facs = [...new Set(S.map(s => s.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));
    const blds = [...new Set(S.map(s => s.building).filter(b => !/^-+$/.test(b)))].sort((a, b) => a.localeCompare(b, 'ar'));
    const row = x => `<a class="now-row" href="${x.s.room === '0' ? '#' : 'timetable.html?room=' + encodeURIComponent(x.s.room)}" title="${esc(x.s.code + ' ' + x.s.name + ' – ' + x.s.instructor)}">
        <span class="now-time" dir="ltr">${x.m.start}–${x.m.end}</span>
        <span class="now-what"><b><span dir="ltr">${esc(x.s.code)}</span> ${esc(x.s.name)}</b><small>${esc(U.shortName(x.s.instructor))} · ش${esc(x.s.section)} · ${esc(x.s.department)}</small></span>
        <span class="now-room ${x.m.mode !== 'وجاهي' ? 'online' : ''}">${x.s.room === '0' || x.m.mode === 'الكتروني كامل' ? '<i class="bi bi-camera-video-fill"></i> إلكتروني' : `<b>${esc(x.s.room)}</b><small>${esc(x.s.building)}</small>`}</span>
        ${x.a <= now.min ? `<span class="now-left"><i style="width:${Math.round(100 * (now.min - x.a) / (x.b - x.a))}%"></i><small>تنتهي بعد ${U.mins(x.b - now.min)}</small></span>`
          : `<span class="now-left soon"><small>بعد ${U.mins(x.a - now.min)}</small></span>`}</a>`;

    $('#pg-title').innerHTML = `الآن في الجامعة <span class="now-clock" dir="ltr">${now.clock}</span>`;
    $('#pg-sub').textContent = `${U.DAYS[now.day] || ''} ${U.numDate(now.iso)} · ${TT.term}${P.get('at') ? ' · (وقت محدد للعرض)' : ''}`;
    $('#now-app').innerHTML = `
      ${KIOSK ? '' : `<div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <select class="form-select form-select-sm w-auto" id="now-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <select class="form-select form-select-sm w-auto" id="now-bld"><option value="">كل المباني</option>${blds.map(b => `<option ${b === st.bld ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
        <span class="small text-muted ms-auto">تتحدّث الصفحة كل دقيقة · <a href="?kiosk=1${st.fac ? '&fac=' + encodeURIComponent(st.fac) : ''}${st.bld ? '&bld=' + encodeURIComponent(st.bld) : ''}">وضع الشاشة</a></span></div></div>`}
      ${T.ok ? '' : `<div class="alert alert-info"><i class="bi bi-info-circle-fill"></i> لا توجد محاضرات الآن: ${esc(T.why)}.</div>`}
      <div class="now-kpis mb-3">
        <div class="stat-card"><div class="v">${running.length}</div><div class="l"><i class="bi bi-broadcast"></i> محاضرة جارية</div></div>
        <div class="stat-card"><div class="v">${soon.length}</div><div class="l"><i class="bi bi-hourglass-top"></i> تبدأ خلال ساعة</div></div>
        <div class="stat-card"><div class="v">${later}</div><div class="l"><i class="bi bi-calendar-event"></i> لاحقاً اليوم</div></div>
        <div class="stat-card"><div class="v">${freeRooms.length}</div><div class="l"><i class="bi bi-door-open-fill"></i> قاعة شاغرة الآن</div></div>
      </div>
      <div class="row g-3">
        <div class="col-xl-8">
          <section class="card mb-3"><div class="card-header"><i class="bi bi-broadcast text-danger"></i> جارية الآن <span class="badge text-bg-light border">${running.length}</span></div>
            <div class="now-list">${running.map(row).join('') || '<p class="text-muted p-3 mb-0">لا محاضرات جارية الآن ضمن التصفية.</p>'}</div></section>
          <section class="card"><div class="card-header"><i class="bi bi-hourglass-top"></i> تبدأ خلال ساعة <span class="badge text-bg-light border">${soon.length}</span></div>
            <div class="now-list">${soon.map(row).join('') || '<p class="text-muted p-3 mb-0">لا محاضرات تبدأ خلال الساعة القادمة.</p>'}</div></section>
        </div>
        <div class="col-xl-4">
          <section class="card mb-3"><div class="card-header"><i class="bi bi-door-open-fill"></i> قاعات شاغرة الآن <span class="small text-muted">وحتى متى</span></div>
            <div class="card-body py-2">${Object.entries(byBld).sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([b, rs]) => `<div class="now-bld"><b>${esc(b)}</b><div>${rs.map(x =>
              `<span class="now-free" title="${x.until ? 'شاغرة حتى ' + toTime(x.until) : 'شاغرة لبقية اليوم'}">${esc(x.r)}<small dir="ltr">${x.until ? '→ ' + toTime(x.until) : 'كل اليوم'}</small></span>`).join('')}</div></div>`).join('')
              || '<p class="text-muted mb-0">لا قاعات شاغرة ضمن التصفية.</p>'}</div></section>
          <section class="card"><div class="card-header"><i class="bi bi-calendar3"></i> مواعيد خلال أسبوعين</div>
            <div class="card-body py-2">${events.map(e => `<a class="now-ev" href="calendar.html?q=${encodeURIComponent(e.title.slice(0, 20))}"><span dir="ltr">${U.numDate(e.start)}${e.end !== e.start ? ' – ' + U.numDate(e.end) : ''}</span><b>${esc(e.title)}</b></a>`).join('')
              || '<p class="text-muted mb-0">لا مواعيد في الأسبوعين القادمين.</p>'}</div></section>
        </div>
      </div>`;
    const f = $('#now-fac'), b = $('#now-bld');
    if (f) f.addEventListener('change', e => { st.fac = e.target.value; sync(); render(); });
    if (b) b.addEventListener('change', e => { st.bld = e.target.value; sync(); render(); });
  }
  function sync() {
    const p = new URLSearchParams(location.search);
    ['fac', 'bld'].forEach(k => st[k] ? p.set(k, st[k]) : p.delete(k));
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/calendar.json'), U.getJSON('data/instructors.json')]).then(([tt, cal, idx]) => {
    TT = tt; S = tt.sections; CAL = cal; IDX = idx;
    U.setDays(tt.days);
    if (KIOSK) document.body.classList.add('kiosk');
    $('#foot-count').textContent = `${S.length} شعبة · ${tt.term}`;
    U.updatedLine(tt.updated, 'تتحدّث كل دقيقة');
    render();
    setInterval(render, 60000);
    // screens stay on for days: re-read the data every 15 minutes so changes and cancellations show up
    setInterval(() => Promise.all([U.getJSON('data/timetable.json', true), U.getJSON('data/calendar.json', true), U.getJSON('data/instructors.json', true)])
      .then(([t2, c2, i2]) => { TT = t2; S = t2.sections; CAL = c2; IDX = i2; U.updatedLine(t2.updated, 'تتحدّث كل دقيقة'); render(); }).catch(() => {}), 15 * 60000);
    let t;
    $('#pg-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = norm(e.target.value.trim()); render(); }, 200); });
  }).catch(e => { $('#now-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
