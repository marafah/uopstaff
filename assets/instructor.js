/* Instructor page: contact, what they teach now/next, weekly timetable, free times, sections, calendar subscription,
   and a one-page printout (with a QR code to this page).
   ?id=<id from data/instructors.json>; without an id: a searchable list of all instructors. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let IDX, TT, S;
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const qs = () => new URLSearchParams(location.search);
  const FREE_FROM = 8 * 60, FREE_TO = 16 * 60;  // free times are looked for within the working day
  // one colour per course (same course = same colour in the timetable, the table and the legend)
  const PALETTE = [['#901d23', '#fbecec'], ['#0b4a66', '#e4f0f6'], ['#0f766e', '#e0f4f1'], ['#9a5b00', '#fdf1dc'], ['#6d28d9', '#f0e9fd'],
    ['#15803d', '#e4f5e9'], ['#be185d', '#fce8f2'], ['#1d4ed8', '#e6edfd'], ['#7c4a1e', '#f4eadf'], ['#475569', '#edf0f4']];

  // ---------------------------------------------------------------- list of instructors
  function listView() {
    const p = qs(), q = norm(p.get('q') || ''), fac = p.get('fac') || '', dept = p.get('dept') || '';
    const all = IDX.instructors;
    const facs = [...new Set(all.map(i => i.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const depts = [...new Set(all.filter(i => !fac || i.faculty === fac).flatMap(i => i.department ? i.department.split(', ') : []))].sort((a, b) => a.localeCompare(b, 'ar'));
    const list = all.filter(i => (!q || norm(i.name + ' ' + (i.name_en || '') + ' ' + i.department).includes(q))
      && (!fac || i.faculty === fac) && (!dept || i.department.split(', ').includes(dept)));
    $('#pg-title').textContent = 'صفحة المدرس';
    $('#ins-app').innerHTML = `<div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div class="flex-grow-1"><label class="small fw-bold" for="i-q">المدرس</label>
          <input class="form-control form-control-sm" id="i-q" value="${esc(p.get('q') || '')}" placeholder="اكتب جزءاً من الاسم…"></div>
        <div><label class="small fw-bold" for="i-fac">الكلية</label><select class="form-select form-select-sm" id="i-fac"><option value="">كل الكليات</option>
          ${facs.map(f => `<option ${f === fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="i-dept">القسم</label><select class="form-select form-select-sm" id="i-dept"><option value="">كل الأقسام</option>
          ${depts.map(d => `<option ${d === dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <span class="small text-muted ms-auto">${list.length} مدرس · القسم حسب دليل الموظفين</span></div></div>
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 row-cols-xxl-4 g-3">${list.map(i => `<div class="col"><a class="ins-pick" href="?id=${i.id}">
        ${i.photo ? `<img src="${esc(i.photo)}" alt="" loading="lazy">` : `<span class="ins-ini">${esc(initials(i.name))}</span>`}
        <span><b>${esc(i.name)}</b><small>${esc([i.rank, i.department || 'قسمه غير معروف'].filter(Boolean).join(' · '))}</small><em>${i.sections} شعبة</em></span></a></div>`).join('')
        || '<p class="text-muted">لا يوجد مدرس يطابق البحث.</p>'}</div>`;
    const go = ch => { const n = new URLSearchParams(location.search); Object.entries(ch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); history.replaceState(null, '', '?' + n); listView(); };
    let t;
    $('#i-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { go({ q: e.target.value }); const i = $('#i-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#i-fac').addEventListener('change', e => go({ fac: e.target.value, dept: '' }));
    $('#i-dept').addEventListener('change', e => go({ dept: e.target.value }));
  }
  const initials = n => U.shortName(n).split(' ').slice(0, 2).map(w => w[0]).join(' ');

  // ---------------------------------------------------------------- the instructor's week
  function build(I) {
    const secs = S.filter(s => s.instructor === I.name).sort((a, b) => a.code.localeCompare(b.code) || a.activity.localeCompare(b.activity, 'ar') || +a.section - +b.section);
    const courses = [...new Set(secs.map(s => s.code))];
    const color = code => PALETTE[courses.indexOf(code) % PALETTE.length];
    const days = U.WEEK.filter(d => (d !== 'ج' && d !== 'س') || secs.some(s => s.meetings.some(m => m.day === d && live(m))));
    const meetings = secs.flatMap(s => s.meetings.filter(live).map(m => ({ s, m })));
    const room = s => s.room === '0' ? 'قاعة افتراضية' : s.room;
    const items = meetings.map(({ s, m }) => {
      const [c, bg] = color(s.code), mode = U.MODE[m.mode] || {};
      return { day: m.day, start: m.start, end: m.end, title: `${s.code} · ش${s.section}`, line: s.name, sub: room(s),
        icon: m.mode === 'وجاهي' ? '' : mode.icon, style: `--cc:${c};--cbg:${bg}`, cls: 'cc',
        tip: `${s.code} ${s.name} – شعبة ${s.section} (${s.activity})\n${U.DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}\n${s.room === '0' ? 'قاعة افتراضية (0)' : s.room + ' – ' + s.building}` };
    });
    const busy = d => {  // merged busy intervals of a day
      const iv = meetings.filter(x => x.m.day === d).map(x => [toMin(x.m.start), toMin(x.m.end), x.s]).sort((a, b) => a[0] - b[0]);
      return iv;
    };
    const free = d => {
      const taken = new Set();
      busy(d).forEach(([a, b]) => { for (let t = a; t < b; t += 30) taken.add(t); });
      const runs = [];
      for (let t = FREE_FROM; t < FREE_TO; t += 30) {
        if (taken.has(t)) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === t) last[1] = t + 30; else runs.push([t, t + 30]);
      }
      return runs;
    };
    const slots = new Set();
    meetings.forEach(({ m }) => { for (let t = toMin(m.start); t < toMin(m.end); t += 30) slots.add(m.day + t); });
    return { secs, courses, color, days, items, busy, free, room,
      asyncSecs: secs.filter(s => s.meetings.some(m => !live(m))),
      hours: slots.size / 2, students: secs.reduce((a, s) => a + s.registered, 0) };
  }

  // now / next lecture, in Amman time and within the teaching period (official holidays skipped)
  function nowNext(W) {
    const amman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Amman' }));
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const T = IDX.teaching || {}, hol = new Set(T.holidays || []);
    const today = ymd(amman), mins = amman.getHours() * 60 + amman.getMinutes();
    if (T.start && today < T.start) return { icon: 'bi-calendar-event', text: `تبدأ المحاضرات ${U.numDate(T.start)}` };
    if (T.end && today > T.end) return { icon: 'bi-calendar-check', text: 'انتهت فترة التدريس لهذا الفصل' };
    const list = W.items.map(x => ({ ...x, a: toMin(x.start), b: toMin(x.end) }));
    if (!hol.has(today)) {
      const cur = list.find(x => x.day === U.JS_DAY[amman.getDay()] && x.a <= mins && mins < x.b);
      if (cur) return { now: true, icon: 'bi-broadcast', text: `يحاضر الآن: ${cur.title} ${cur.line} · ${cur.sub} · حتى ${cur.end}` };
    }
    for (let k = 0; k < 14; k++) {
      const d = new Date(amman); d.setDate(d.getDate() + k);
      const key = ymd(d);
      if (hol.has(key) || (T.end && key > T.end)) continue;
      const next = list.filter(x => x.day === U.JS_DAY[d.getDay()] && (k > 0 || x.a > mins)).sort((a, b) => a.a - b.a)[0];
      if (next) {
        const when = k === 0 ? 'اليوم' : k === 1 ? 'غداً' : U.DAYS[next.day];
        return { icon: 'bi-clock-history', text: `المحاضرة القادمة: ${when} ${next.start} · ${next.title} ${next.line} · ${next.sub}` };
      }
    }
    return { icon: 'bi-dash-circle', text: 'لا محاضرات بوقت ثابت هذا الفصل' };
  }

  // free-time timeline: 08:00–16:00 per day, lectures and free gaps on one bar
  function timeline(W) {
    const span = FREE_TO - FREE_FROM, pos = t => (100 * (Math.max(FREE_FROM, Math.min(FREE_TO, t)) - FREE_FROM) / span).toFixed(3);
    const ticks = [];
    for (let t = FREE_FROM; t <= FREE_TO; t += 60) ticks.push(`<span style="right:${pos(t)}%">${toTime(t).slice(0, 2)}</span>`);
    const rows = W.days.map(d => {
      const busy = W.busy(d).filter(([a, b]) => b > FREE_FROM && a < FREE_TO).map(([a, b, s]) => {
        const [c, bg] = W.color(s.code);
        return `<i class="ft-busy" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%;--cc:${c};--cbg:${bg}" title="${esc(`${s.code} ${s.name} – ${toTime(a)}–${toTime(b)}`)}"><span>${esc(s.code)}</span></i>`;
      }).join('');
      const runs = W.free(d).filter(r => r[1] - r[0] >= 60);
      const free = runs.map(([a, b]) => `<i class="ft-free" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%" title="فراغ ${toTime(a)}–${toTime(b)}"><span dir="ltr">${toTime(a)}–${toTime(b)}</span></i>`).join('');
      return `<div class="ft-row"><b>${esc(U.DAYS[d])}</b><div class="ft-track">${busy}${free}</div></div>`;
    }).join('');
    return `<div class="ft"><div class="ft-row ft-head"><b></b><div class="ft-ticks">${ticks.join('')}</div></div>${rows}</div>
      <div class="ft-key"><span><i class="ft-sw free"></i> فراغ لساعة أو أكثر</span><span><i class="ft-sw busy"></i> محاضرة</span><span class="text-muted">المساحة البيضاء: فراغ أقل من ساعة</span></div>`;
  }

  const when = s => {
    const blocks = [];
    s.meetings.forEach(m => { const k = m.start + '–' + m.end; const b = blocks.find(x => x.k === k) || (blocks.push({ k, ms: [] }), blocks[blocks.length - 1]); b.ms.push(m); });
    return blocks.map(b => `<div class="tt-when"><bdi dir="ltr" class="tt-time">${b.k}</bdi> <span class="tt-days">${b.ms.map(m =>
      `<span class="tt-day ${(U.MODE[m.mode] || {}).cls || ''}" title="${esc(m.mode)}"><i class="bi ${(U.MODE[m.mode] || {}).icon || 'bi-dot'}"></i>${esc(U.DAYS[m.day])}</span>`).join('')}</span></div>`).join('');
  };
  const whenText = s => {
    const blocks = [];
    s.meetings.forEach(m => { const k = m.start + '–' + m.end; const b = blocks.find(x => x.k === k) || (blocks.push({ k, ds: [] }), blocks[blocks.length - 1]); b.ds.push(U.DAYS[m.day] + (m.mode !== 'وجاهي' ? ` (${m.mode})` : '')); });
    return blocks.map(b => `${b.ds.join('، ')} ${b.k}`).join(' · ');
  };
  const seats = s => `<span class="tt-seats ${s.status === 'مغلقة' ? 'full' : 'open'}"><span class="tt-st">${esc(s.status)}</span>
    <span class="tt-bar"><i style="width:${Math.min(100, s.capacity ? 100 * s.registered / s.capacity : 100)}%"></i></span><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></span>`;

  function personView(I) {
    const W = build(I);
    const pageUrl = SITE + 'instructor.html?id=' + I.id;
    const icsUrl = I.ics ? SITE + I.ics : '';
    const nn = nowNext(W);

    document.title = `${I.name} – جامعة البترا`;
    $('#pg-title').textContent = I.name;
    $('#pg-sub').textContent = [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · ') || 'عضو هيئة تدريس';
    $('#pg-actions').innerHTML = `<div class="d-flex flex-wrap gap-2 justify-content-end">
        ${icsUrl ? `<button type="button" class="btn btn-update" id="i-sub"><i class="bi bi-calendar-plus"></i> اشترك في جدولي</button>` : ''}
        <button type="button" class="btn btn-update" id="i-print"><i class="bi bi-printer"></i> طباعة / PDF</button></div>
      <small class="update-when" id="pg-updated">—</small>`;
    U.updatedLine(TT.updated, 'يُراجَع كل ساعة');

    const contact = [
      I.ext ? `<a class="ins-ct${I.office ? '' : ' wide'}" href="tel:+96265799555,${esc(I.ext)}"><i class="bi bi-telephone-fill"></i><span><small>الفرعي</small><b dir="ltr">${esc(I.ext)}</b></span></a>` : '',
      I.office ? `<span class="ins-ct${I.ext ? '' : ' wide'}"><i class="bi bi-door-open-fill"></i><span><small>المكتب</small><b>${esc(I.office)}</b></span></span>` : '',
      I.email ? `<a class="ins-ct wide" href="mailto:${esc(I.email)}"><i class="bi bi-envelope-fill"></i><span><small>البريد</small><b dir="ltr">${esc(I.email)}</b></span></a>` : '',
    ].join('');
    const groups = [];
    W.secs.forEach(s => { const k = s.code + '|' + s.activity; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, s0: s, list: [] }); g.list.push(s); });
    const otherDept = s => s.department && I.department && !I.department.split(', ').includes(s.department);

    $('#ins-app').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-xl-5"><section class="card h-100 ins-card"><div class="card-body">
          <div class="ins-top">
            ${I.photo ? `<img class="ins-photo" src="${esc(I.photo)}" alt="">` : `<span class="ins-photo ins-ini">${esc(initials(I.name))}</span>`}
            <div class="min-w-0"><h2 class="ins-name">${esc(I.name)}</h2>${I.name_en ? `<div class="ins-en" dir="ltr">${esc(I.name_en)}</div>` : ''}
              <div class="mt-1 d-flex flex-wrap gap-1">${I.role ? `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(I.role)}</span>` : ''}${I.rank ? `<span class="badge text-bg-light border">${esc(I.rank)}</span>` : ''}
              ${I.corrected ? '<span class="badge badge-fix" title="بيانات مصحَّحة عن الموقع الرسمي (انظر دليل الموظفين)"><i class="bi bi-pencil-square"></i> مصحَّح</span>' : ''}</div>
              <div class="ins-unit mt-2"><i class="bi bi-diagram-3"></i> ${esc(I.department || 'القسم غير معروف (غير موجود في دليل الموظفين)')}${I.faculty ? `<small>${esc(I.faculty)}</small>` : ''}</div></div>
          </div>
          <div class="ins-now ${nn.now ? 'live' : ''}"><i class="bi ${nn.icon}"></i> ${esc(nn.text)}</div>
          <div class="ins-cts">${contact || '<span class="text-muted small">لا توجد بيانات تواصل في دليل الموظفين.</span>'}</div>
          <div class="ins-links no-print">
            ${I.directory_id ? `<a href="./?q=${encodeURIComponent(U.shortName(I.name).split(' ').slice(0, 2).join(' '))}"><i class="bi bi-person-lines-fill"></i> دليل الموظفين</a>` : ''}
            ${I.profile ? `<a href="${esc(I.profile)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> الملف الرسمي</a>` : ''}
            <a href="timetable.html?inst=${encodeURIComponent(I.name)}"><i class="bi bi-table"></i> الجدول الدراسي</a>
          </div></div></section></div>
        <div class="col-xl-7 d-flex flex-column gap-3">
          <div class="ins-kpis">
            <div class="stat-card"><div class="v">${W.secs.length}</div><div class="l"><i class="bi bi-collection-fill"></i> شعبة</div></div>
            <div class="stat-card"><div class="v">${W.courses.length}</div><div class="l"><i class="bi bi-journal-bookmark-fill"></i> مقرر</div></div>
            <div class="stat-card"><div class="v">${W.hours.toLocaleString('en-US')}</div><div class="l"><i class="bi bi-clock-fill"></i> ساعة حضور أسبوعياً</div></div>
            <div class="stat-card"><div class="v">${W.students}</div><div class="l"><i class="bi bi-people-fill"></i> طالباً مسجلاً</div></div></div>
          <section class="card flex-grow-1"><div class="card-header"><i class="bi bi-hourglass-split"></i> أوقات الفراغ <small class="text-muted">بين 08:00 و16:00</small></div>
            <div class="card-body">${timeline(W)}</div></section>
        </div>
      </div>
      <section class="card mb-3"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-calendar-week"></i> الجدول الأسبوعي</span>
        <span class="ins-legend ms-auto">${W.courses.map(c => { const s = W.secs.find(x => x.code === c), [col, bg] = W.color(c);
          return `<span style="--cc:${col};--cbg:${bg}"><i></i><b dir="ltr">${esc(c)}</b> ${esc(s.name)}</span>`; }).join('')}</span></div>
        <div class="card-body">${W.items.length ? U.weekGrid(W.items, { days: W.days, px: 64, cls: 'wk-ins' }) : '<p class="text-muted mb-0">لا لقاءات بوقت ثابت.</p>'}
          <div class="ins-modes">${Object.entries(U.MODE).filter(([k]) => k !== 'غير متزامن').map(([k, v]) => `<span><i class="bi ${v.icon}"></i> ${k}</span>`).join('')}
            ${W.asyncSecs.length ? `<span class="ms-auto"><i class="bi bi-info-circle"></i> ${W.asyncSecs.length} ${W.asyncSecs.length > 2 && W.asyncSecs.length < 11 ? 'شعب لها' : 'شعبة لها'} لقاءات غير متزامنة (بلا وقت ثابت) لا تظهر في الجدول</span>` : ''}</div></div></section>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-list-ul"></i> الشعب <small class="text-muted">${W.secs.length} شعبة في ${W.courses.length} مقرر</small></div>
        <div class="table-responsive"><table class="table align-middle mb-0 tt-table ins-table"><colgroup><col style="width:9%"><col style="width:36%"><col style="width:27%"><col style="width:28%"></colgroup>
          <thead><tr><th class="text-center">الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>المسجلون</th></tr></thead>
        <tbody>${groups.map(g => { const [c, bg] = W.color(g.s0.code); return `<tr class="ins-grp" style="--cc:${c};--cbg:${bg}"><td colspan="4"><i></i><b dir="ltr">${esc(g.s0.code)}</b> ${esc(g.s0.name)}
            <span class="tt-act ${g.s0.activity === 'عملي' ? 'lab' : ''}">${esc(g.s0.activity)}</span>${g.s0.degree !== 'البكالوريوس' ? ` <span class="badge text-bg-warning">${esc(g.s0.degree)}</span>` : ''}
            ${otherDept(g.s0) ? `<small>${esc(g.s0.department)}</small>` : ''}</td></tr>` + g.list.map(s => `<tr>
          <td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td>
          <td class="tt-whencell">${when(s)}</td>
          <td class="tt-roomcell">${s.room === '0' ? '<span class="tt-none">قاعة افتراضية (0)</span>' : `<b>${esc(s.room)}</b><small>${esc(s.building)}</small>`}</td>
          <td>${seats(s)}</td></tr>`).join(''); }).join('')}</tbody></table></div></section>`;

    const sub = $('#i-sub');
    if (sub) sub.addEventListener('click', () => subscribe(I, icsUrl));
    $('#i-print').addEventListener('click', () => printPage(I, W, pageUrl));
  }

  function subscribe(I, url) {
    const webcal = url.replace(/^https?:/, 'webcal:');
    U.modal('<i class="bi bi-calendar-plus"></i> اشترك في محاضرات ' + esc(I.name), `
      <p class="small text-muted">اشتراك لمرة واحدة: تظهر المحاضرات أسبوعياً في تقويم هاتفك طوال فترة التدريس
        (${U.numDate(IDX.teaching.start)} – ${U.numDate(IDX.teaching.end)})، بدون العطل الرسمية، ويتحدّث تلقائياً إذا تغيّر الجدول.</p>
      <div class="sub-grid">
        <a class="sub-opt" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener"><i class="bi bi-google"></i><b>Google Calendar</b><small>هاتف Android والويب</small></a>
        <a class="sub-opt" href="${esc(webcal)}"><i class="bi bi-apple"></i><b>iPhone / Mac</b><small>تقويم Apple</small></a>
        <a class="sub-opt" href="https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('محاضرات ' + I.name)}" target="_blank" rel="noopener"><i class="bi bi-microsoft"></i><b>Outlook</b><small>بريد الجامعة / Office 365</small></a>
        <a class="sub-opt" href="${esc(url)}" download="${esc('محاضرات_' + U.shortName(I.name).replace(/\s+/g, '_'))}.ics"><i class="bi bi-download"></i><b>تنزيل الملف</b><small>‎.ics لأي تطبيق تقويم</small></a>
      </div>
      <div class="input-group input-group-sm mt-3"><input class="form-control" readonly dir="ltr" value="${esc(url)}" id="i-sub-url">
        <button class="btn btn-primary" type="button" onclick="navigator.clipboard && navigator.clipboard.writeText(document.getElementById('i-sub-url').value)"><i class="bi bi-clipboard"></i> نسخ الرابط</button></div>`);
  }

  // one A4 page whatever the number of sections: contact + QR, figures, free times, the week, all sections
  function printPage(I, W, url) {
    const q = qrcode(0, 'M');
    q.addData(unescape(encodeURIComponent(url)));
    q.make();
    const svg = q.createSvgTag({ cellSize: 5, margin: 1, scalable: true }).replace(/fill="black"/g, 'fill="#091b22"');
    const free = W.days.map(d => {
      const runs = W.free(d).filter(r => r[1] - r[0] >= 60);
      return `<tr><th>${esc(U.DAYS[d])}</th><td>${runs.map(r => `<bdi dir="ltr">${toTime(r[0])}–${toTime(r[1])}</bdi>`).join('، ') || '—'}</td></tr>`;
    }).join('');
    const rows = W.secs.map(s => { const [c] = W.color(s.code); return `<tr><td><i class="ip-sw" style="background:${c}"></i><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)}<small>${esc(s.activity)}${s.degree !== 'البكالوريوس' ? ' · ' + esc(s.degree) : ''}</small></td>
      <td class="num">${esc(s.section)}</td><td>${esc(whenText(s))}</td><td>${s.room === '0' ? 'قاعة افتراضية (0)' : `${esc(s.room)}<small>${esc(s.building)}</small>`}</td>
      <td class="num">${s.registered}/${s.capacity}</td><td><span class="pill ${s.status === 'مغلقة' ? 'no' : 'ok'}">${esc(s.status)}</span></td></tr>`; }).join('');
    printReport({
      title: I.name, subtitle: [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · '),
      orientation: 'landscape', fit: true, source: IDX.term,
      css: ['https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css', 'assets/app.css'],
      raw: `<div class="ip">
        <aside class="ip-side">
          <div class="ip-card">
            ${I.photo ? `<img class="ip-photo" src="${esc(new URL(I.photo, location.href).href)}" alt="">` : ''}
            <dl>${I.ext ? `<dt>الفرعي</dt><dd dir="ltr">${esc(I.ext)}</dd>` : ''}${I.office ? `<dt>المكتب</dt><dd>${esc(I.office)}</dd>` : ''}
              ${!I.ext && !I.office ? '<dt>التواصل</dt><dd>—</dd>' : ''}</dl>
            ${I.email ? `<div class="ip-mail"><i class="bi bi-envelope-fill"></i> <span dir="ltr">${esc(I.email)}</span></div>` : ''}
          </div>
          <div class="ip-stats"><div><b>${W.secs.length}</b>شعبة</div><div><b>${W.courses.length}</b>مقرر</div><div><b>${W.hours}</b>ساعة أسبوعياً</div><div><b>${W.students}</b>طالباً</div></div>
          <h3 class="sec">أوقات الفراغ (08:00–16:00)</h3><table class="ip-free">${free}</table>
          <div class="ip-qr">${svg}<span>امسح الرمز للجدول المحدَّث وبيانات التواصل<b dir="ltr">${esc(url.replace(/^https?:\/\//, ''))}</b></span></div>
        </aside>
        <main class="ip-main"><h3 class="sec">الجدول الأسبوعي</h3>
          ${W.items.length ? U.weekGrid(W.items.map(x => ({ ...x, title: `${x.title} · ${x.sub}`, sub: '' })), { days: W.days, px: 46, cls: 'wk-ins' }) : '<p>لا لقاءات بوقت ثابت.</p>'}
          ${W.asyncSecs.length ? `<p class="ip-note">${W.asyncSecs.length} شعبة لها لقاءات غير متزامنة (بلا وقت ثابت) لا تظهر في الجدول.</p>` : ''}</main>
      </div>
      <h3 class="sec">الشعب (${W.secs.length})</h3>
      <table class="ip-secs"><thead><tr><th>المقرر</th><th class="num">الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th class="num">المسجلون</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`,
    });
  }

  // ---------------------------------------------------------------- start
  Promise.all([U.getJSON('data/instructors.json'), U.getJSON('data/timetable.json')]).then(([idx, tt]) => {
    IDX = idx; TT = tt; S = tt.sections;
    U.setDays(tt.days);
    $('#foot-count').textContent = `${idx.instructors.length} مدرس · ${tt.term}`;
    U.updatedLine(tt.updated, 'يُراجَع كل ساعة');
    const id = qs().get('id');
    const I = id && idx.instructors.find(i => i.id === id);
    if (I) personView(I); else listView();
    const top = $('#pg-q');
    top.addEventListener('keydown', e => { if (e.key === 'Enter') location.href = 'instructor.html?q=' + encodeURIComponent(top.value); });
    if (!I) top.addEventListener('input', () => { const i = $('#i-q'); if (i) { i.value = top.value; i.dispatchEvent(new Event('input')); } });
  }).catch(e => { $('#ins-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
