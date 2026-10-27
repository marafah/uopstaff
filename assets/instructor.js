/* Instructor page: contact, weekly timetable, free times, calendar subscription, door card.
   ?id=<id from data/instructors.json>; without an id: a searchable list of all instructors. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live, dur } = U;
  let IDX, TT, S;
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const qs = () => new URLSearchParams(location.search);

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
        ${i.photo ? `<img src="${esc(i.photo)}" alt="" loading="lazy">` : `<span class="ins-ini">${esc(U.shortName(i.name).split(' ').slice(0, 2).map(w => w[0]).join(' '))}</span>`}
        <span><b>${esc(i.name)}</b><small>${esc([i.rank, i.department || 'قسمه غير معروف'].filter(Boolean).join(' · '))}</small><em>${i.sections} شعبة</em></span></a></div>`).join('')
        || '<p class="text-muted">لا يوجد مدرس يطابق البحث.</p>'}</div>`;
    const go = ch => { const n = new URLSearchParams(location.search); Object.entries(ch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); history.replaceState(null, '', '?' + n); listView(); };
    let t;
    $('#i-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { go({ q: e.target.value }); const i = $('#i-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#i-fac').addEventListener('change', e => go({ fac: e.target.value, dept: '' }));
    $('#i-dept').addEventListener('change', e => go({ dept: e.target.value }));
  }

  // ---------------------------------------------------------------- one instructor
  function freeRuns(secs, day, from, to) {
    const busy = new Set();
    secs.forEach(s => s.meetings.forEach(m => { if (m.day === day && live(m)) for (let t = toMin(m.start); t < toMin(m.end); t += 30) busy.add(t); }));
    const runs = [];
    for (let t = from; t < to; t += 30) {
      if (busy.has(t)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === t) last[1] = t + 30; else runs.push([t, t + 30]);
    }
    return runs;
  }
  function personView(I) {
    const secs = S.filter(s => s.instructor === I.name).sort((a, b) => a.code.localeCompare(b.code) || +a.section - +b.section);
    const days = U.WEEK.filter(d => (d !== 'ج' && d !== 'س') || secs.some(s => s.meetings.some(m => m.day === d && live(m))));
    const items = secs.flatMap(s => s.meetings.filter(live).map(m => ({ day: m.day, start: m.start, end: m.end,
      title: `${s.code} ش${s.section}`, sub: s.room === '0' ? 'قاعة افتراضية' : s.room, cls: (U.MODE[m.mode] || {}).cls,
      tip: `${s.code} ${s.name} – شعبة ${s.section}\n${U.DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}\n${s.room === '0' ? 'قاعة افتراضية (0)' : s.room + ' – ' + s.building}` })));
    const asyncCount = secs.filter(s => s.meetings.some(m => !live(m))).length;
    const hoursBy = {};
    secs.forEach(s => s.meetings.filter(live).forEach(m => { const set = (hoursBy[m.day] ||= new Set()); for (let t = toMin(m.start); t < toMin(m.end); t += 30) set.add(t); }));
    const weekMin = Object.values(hoursBy).reduce((a, x) => a + x.size * 30, 0);
    const students = secs.reduce((a, s) => a + s.registered, 0);
    const pageUrl = SITE + 'instructor.html?id=' + I.id;
    const icsUrl = I.ics ? SITE + I.ics : '';

    document.title = `${I.name} – جامعة البترا`;
    $('#pg-title').textContent = I.name;
    $('#pg-sub').textContent = [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · ') || 'عضو هيئة تدريس';
    $('#pg-actions').innerHTML = `${icsUrl ? `<button type="button" class="btn btn-update" id="i-sub"><i class="bi bi-calendar-plus"></i> اشترك في جدولي</button>` : ''}
      <small class="update-when" id="pg-updated">—</small>`;
    U.updatedLine(TT.updated, 'يُراجَع كل ساعة');

    const contact = [
      I.ext ? `<a class="ins-ct" href="tel:+96265799555,${esc(I.ext)}"><i class="bi bi-telephone-fill"></i><span><small>الفرعي</small><b>${esc(I.ext)}</b></span></a>` : '',
      I.office ? `<span class="ins-ct"><i class="bi bi-door-open-fill"></i><span><small>المكتب</small><b>${esc(I.office)}</b></span></span>` : '',
      I.email ? `<a class="ins-ct" href="mailto:${esc(I.email)}"><i class="bi bi-envelope-fill"></i><span><small>البريد</small><b dir="ltr">${esc(I.email)}</b></span></a>` : '',
    ].join('');
    const freeHtml = days.filter(d => d !== 'س').map(d => {
      const runs = freeRuns(secs, d, 8 * 60, 16 * 60).filter(r => r[1] - r[0] >= 60);
      return `<div class="ins-free"><b>${esc(U.DAYS[d])}</b><span>${runs.length ? runs.map(r => `<em dir="ltr">${toTime(r[0])}–${toTime(r[1])}</em>`).join('') : '<i class="text-muted">لا فراغ لساعة كاملة</i>'}</span></div>`;
    }).join('');

    $('#ins-app').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-lg-4"><section class="card h-100 ins-card"><div class="card-body">
          <div class="d-flex gap-3 align-items-center mb-3">
            ${I.photo ? `<img class="ins-photo" src="${esc(I.photo)}" alt="">` : `<span class="ins-photo ins-ini">${esc(U.shortName(I.name).split(' ').slice(0, 2).map(w => w[0]).join(' '))}</span>`}
            <div><h2 class="ins-name">${esc(I.name)}</h2>${I.name_en ? `<div class="ins-en" dir="ltr">${esc(I.name_en)}</div>` : ''}
              <div class="mt-1">${I.role ? `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(I.role)}</span> ` : ''}${I.rank ? `<span class="badge text-bg-light border">${esc(I.rank)}</span>` : ''}
              ${I.corrected ? ' <span class="badge badge-fix" title="بيانات مصحَّحة عن الموقع الرسمي (انظر دليل الموظفين)"><i class="bi bi-pencil-square"></i> مصحَّح</span>' : ''}</div></div></div>
          <div class="ins-unit"><i class="bi bi-diagram-3"></i> ${esc(I.department || 'القسم غير معروف (غير موجود في دليل الموظفين)')}${I.faculty ? `<small>${esc(I.faculty)}</small>` : ''}</div>
          <div class="ins-cts">${contact || '<span class="text-muted small">لا توجد بيانات تواصل في دليل الموظفين.</span>'}</div>
          <div class="d-flex flex-wrap gap-2 mt-3 no-print">
            ${I.directory_id ? `<a class="btn btn-sm btn-outline-primary" href="./?q=${encodeURIComponent(U.shortName(I.name).split(' ').slice(0, 2).join(' '))}"><i class="bi bi-person-lines-fill"></i> في دليل الموظفين</a>` : ''}
            ${I.profile ? `<a class="btn btn-sm btn-outline-primary" href="${esc(I.profile)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> الملف الرسمي</a>` : ''}
            <a class="btn btn-sm btn-outline-primary" href="timetable.html?inst=${encodeURIComponent(I.name)}"><i class="bi bi-table"></i> في الجدول الدراسي</a>
            <button type="button" class="btn btn-sm btn-success" id="i-door"><i class="bi bi-printer"></i> بطاقة الباب (QR)</button>
          </div></div></section></div>
        <div class="col-lg-8"><div class="ins-kpis">
          <div class="stat-card"><div class="v">${secs.length}</div><div class="l"><i class="bi bi-collection-fill"></i> شعبة</div></div>
          <div class="stat-card"><div class="v">${new Set(secs.map(s => s.code)).size}</div><div class="l"><i class="bi bi-journal-bookmark-fill"></i> مقرر</div></div>
          <div class="stat-card"><div class="v">${(weekMin / 60).toLocaleString('en-US')}</div><div class="l"><i class="bi bi-clock-fill"></i> ساعة أسبوعياً</div></div>
          <div class="stat-card"><div class="v">${students}</div><div class="l"><i class="bi bi-people-fill"></i> طالباً مسجلاً</div></div></div>
          <section class="card mt-3"><div class="card-header"><i class="bi bi-hourglass-split"></i> أوقات الفراغ (08:00–16:00، ساعة على الأقل)</div>
            <div class="card-body py-2">${freeHtml}</div></section></div>
      </div>
      <section class="card mb-3"><div class="card-header d-flex flex-wrap gap-2 justify-content-between"><span><i class="bi bi-calendar-week"></i> الجدول الأسبوعي</span>
        <span class="d-flex flex-wrap gap-2 small">${Object.entries(U.MODE).filter(([k]) => k !== 'غير متزامن').map(([k, v]) => `<span class="tt-chip ${v.cls} static"><i class="bi ${v.icon}"></i> ${k}</span>`).join('')}</span></div>
        <div class="card-body">${U.weekGrid(items, { days })}${asyncCount ? `<p class="small text-muted mt-2 mb-0"><i class="bi bi-info-circle"></i> ${asyncCount} شعبة لها لقاءات غير متزامنة (بلا وقت حضور ثابت) لا تظهر في الجدول.</p>` : ''}</div></section>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-list-ul"></i> الشعب</div>
        <div class="table-responsive"><table class="table align-middle mb-0 tt-table"><thead><tr><th>المقرر</th><th>الشعبة</th><th>الوقت</th><th>القاعة / المبنى</th><th>الحالة / المقاعد</th><th>القسم</th></tr></thead>
        <tbody>${secs.map(s => `<tr><td class="tt-name"><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)}<div class="tt-tags"><span class="tt-act ${s.activity === 'عملي' ? 'lab' : ''}">${esc(s.activity)}</span>${s.degree !== 'البكالوريوس' ? `<span class="badge text-bg-warning">${esc(s.degree)}</span>` : ''}</div></td>
          <td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td>
          <td class="tt-whencell">${when(s)}</td>
          <td class="tt-roomcell">${s.room === '0' ? '<span class="tt-none">قاعة افتراضية (0)</span>' : `<b>${esc(s.room)}</b><small>${esc(s.building)}</small>`}</td>
          <td>${seats(s)}</td><td class="tt-unit"><b>${esc(s.department)}</b><small>${esc(s.faculty)}</small></td></tr>`).join('')}</tbody></table></div></section>`;

    const sub = $('#i-sub');
    if (sub) sub.addEventListener('click', () => subscribe(I, icsUrl));
    $('#i-door').addEventListener('click', () => doorCard(I, secs, items, days, pageUrl));
  }
  const when = s => {
    const blocks = [];
    s.meetings.forEach(m => { const k = m.start + '–' + m.end; const b = blocks.find(x => x.k === k) || (blocks.push({ k, ms: [] }), blocks[blocks.length - 1]); b.ms.push(m); });
    return blocks.map(b => `<div class="tt-when"><bdi dir="ltr" class="tt-time">${b.k}</bdi> <span class="tt-days">${b.ms.map(m =>
      `<span class="tt-day ${(U.MODE[m.mode] || {}).cls || ''}" title="${esc(m.mode)}"><i class="bi ${(U.MODE[m.mode] || {}).icon || 'bi-dot'}"></i>${esc(U.DAYS[m.day])}</span>`).join('')}</span></div>`).join('');
  };
  const seats = s => `<span class="tt-seats ${s.status === 'مغلقة' ? 'full' : 'open'}"><span class="tt-st">${esc(s.status)}</span>
    <span class="tt-bar"><i style="width:${Math.min(100, s.capacity ? 100 * s.registered / s.capacity : 100)}%"></i></span><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></span>`;

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
  function doorCard(I, secs, items, days, url) {
    const q = qrcode(0, 'M');
    q.addData(unescape(encodeURIComponent(url)));
    q.make();
    const svg = q.createSvgTag({ cellSize: 5, margin: 1, scalable: true }).replace(/fill="black"/g, 'fill="#091b22"');
    const free = days.filter(d => d !== 'س').map(d => {
      const runs = freeRuns(secs, d, 8 * 60, 16 * 60).filter(r => r[1] - r[0] >= 60);
      return `<tr><th>${esc(U.DAYS[d])}</th><td>${runs.map(r => `<bdi dir="ltr">${toTime(r[0])}–${toTime(r[1])}</bdi>`).join('، ') || '—'}</td></tr>`;
    }).join('');
    printReport({
      title: I.name, subtitle: [I.rank, I.department, I.faculty].filter(Boolean).join(' · '), orientation: 'portrait',
      source: IDX.term,
      stats: [['الفرعي', I.ext || '—'], ['المكتب', I.office || '—'], ['شعبة', secs.length]],
      css: ['https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css', 'assets/app.css'],
      raw: `<div class="door">
        <div class="door-qr">${svg}<small>امسح الرمز للجدول المحدَّث وبيانات التواصل</small><b dir="ltr">${esc(url.replace(/^https?:\/\//, ''))}</b></div>
        <div class="door-body">${I.email ? `<p class="door-mail"><i class="bi bi-envelope-fill"></i> <span dir="ltr">${esc(I.email)}</span></p>` : ''}
          <h3 class="sec">أوقات الفراغ (08:00–16:00)</h3><table class="door-free">${free}</table></div></div>
        <h3 class="sec">الجدول الأسبوعي</h3>${U.weekGrid(items, { days, px: 44, cls: 'wk-print' })}`,
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
