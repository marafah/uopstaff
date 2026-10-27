/* «عبء المدرسين»: what each instructor teaches this term, counted from the published timetable only — sections
   (theory / practical), courses, students, weekly contact hours (timed meetings), asynchronous sections, teaching
   days, first and last hour. Nothing is estimated: credit hours and teaching quotas are not in the timetable, so
   none are shown. Two views of a department: its own instructors (department from the staff directory), or
   everyone teaching the sections it offers. ?by=home|offer&fac=&dept=&sort=hours */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  const st = { by: P.get('by') === 'offer' ? 'offer' : 'home', fac: P.get('fac') || '', dept: P.get('dept') || '', sort: P.get('sort') || 'hours', q: '' };
  let TT, IDX, BYNAME, TDEPTS;
  // «من أقسام أخرى» only when the directory's department name is one the timetable uses (otherwise «—», not a guess)
  const known = home => home.length && home.every(d => TDEPTS.has(d));
  const UNKNOWN = 'غير مدرج في دليل الموظفين';
  const depts = i => (i.department || '').split(', ').filter(Boolean);
  const COLS = [['name', 'المدرس'], ['secs', 'الشعب'], ['th', 'نظري'], ['pr', 'عملي'], ['courses', 'المقررات'], ['students', 'الطلبة'], ['hours', 'ساعات تدريس أسبوعياً'],
    ['async', 'غير متزامن'], ['days', 'أيام الدوام'], ['span', 'أول – آخر محاضرة'], ['other', 'شعب من أقسام أخرى']];

  // one class listed under two degrees is one section
  function merged(list) {
    const seen = {};
    return list.filter(s => { const k = [s.code, s.section, s.activity, s.instructor, JSON.stringify(s.meetings), s.room].join('|'); if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function figures(name, secs, home) {
    let min = 0, first = 24 * 60, last = 0;
    const days = new Set(), slots = new Set();
    secs.forEach(s => s.meetings.filter(m => live(m) && m.start).forEach(m => {
      const a = toMin(m.start), b = toMin(m.end);
      for (let t = a; t < b; t += 5) slots.add(m.day + t);  // overlapping meetings (one class under two codes) count once
      days.add(m.day); first = Math.min(first, a); last = Math.max(last, b);
    }));
    min = slots.size * 5;
    return { name, id: (BYNAME[name] || {}).id, secs: secs.length, th: secs.filter(s => s.activity === 'نظري').length, pr: secs.filter(s => s.activity !== 'نظري').length,
      courses: new Set(secs.map(s => s.code)).size, students: secs.reduce((a, s) => a + (s.registered || 0), 0), hours: min / 60,
      async: secs.filter(s => s.meetings.length && s.meetings.every(m => !live(m) || !m.start)).length, days: days.size,
      span: days.size ? [first, last] : null, other: known(home) ? secs.filter(s => !home.includes(s.department)).length : null, list: secs };
  }
  function rows() {
    const all = merged(TT.sections);
    const by = {};
    all.forEach(s => (by[s.instructor] ||= []).push(s));
    const out = [];
    Object.entries(by).forEach(([name, secs]) => {
      const I = BYNAME[name] || {}, home = depts(I), fac = I.faculty || '';
      if (st.by === 'home') {
        if (st.fac && fac !== st.fac) return;
        if (st.dept && !home.includes(st.dept)) return;
        out.push({ ...figures(name, secs, home), dept: home.join('، ') || UNKNOWN, fac });
      } else {
        const mine = secs.filter(s => (!st.fac || s.faculty === st.fac) && (!st.dept || s.department === st.dept));
        if (!mine.length) return;
        out.push({ ...figures(name, mine, home), dept: home.join('، ') || UNKNOWN, fac, total: secs.length });
      }
    });
    const q = norm(st.q.trim());
    const val = r => st.sort === 'name' ? U.shortName(r.name) : st.sort === 'span' ? (r.span ? r.span[1] - r.span[0] : -1) : r[st.sort] == null ? -1 : r[st.sort];
    return out.filter(r => !q || norm(r.name + ' ' + r.dept).includes(q))
      .sort((a, b) => st.sort === 'name' ? val(a).localeCompare(val(b), 'ar') : val(b) - val(a) || U.shortName(a.name).localeCompare(U.shortName(b.name), 'ar'));
  }
  const hrs = h => h ? h.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';

  function render() {
    const list = rows();
    const facs = st.by === 'home' ? [...new Set(IDX.instructors.map(i => i.faculty).filter(Boolean))] : [...new Set(TT.sections.map(s => s.faculty).filter(Boolean))];
    facs.sort((a, b) => a.localeCompare(b, 'ar'));
    const dps = st.by === 'home' ? [...new Set(IDX.instructors.filter(i => !st.fac || i.faculty === st.fac).flatMap(depts))]
      : [...new Set(TT.sections.filter(s => !st.fac || s.faculty === st.fac).map(s => s.department).filter(Boolean))];
    dps.sort((a, b) => a.localeCompare(b, 'ar'));
    const sum = k => list.reduce((a, r) => a + (r[k] || 0), 0);
    const max = Math.max(1, ...list.map(r => r.hours));
    const cell = (r, k) => {
      switch (k) {
        case 'name': return `<td><a href="${r.id ? 'instructor.html?id=' + r.id : '#'}" class="fw-bold">${esc(U.shortName(r.name))}</a><small class="d-block text-muted">${esc(r.dept)}</small></td>`;
        case 'hours': return `<td class="ld-h"><span class="ld-bar"><i style="width:${Math.round(100 * r.hours / max)}%"></i></span><b>${hrs(r.hours)}</b></td>`;
        case 'span': return `<td class="text-center"><bdi dir="ltr">${r.span ? toTime(r.span[0]) + '–' + toTime(r.span[1]) : '—'}</bdi></td>`;
        case 'other': return `<td class="text-center">${r.other == null ? '—' : r.other}</td>`;
        case 'secs': return `<td class="text-center"><a href="#" data-secs="${esc(r.name)}">${r.secs}</a>${st.by === 'offer' && r.total !== r.secs ? `<small class="d-block text-muted">من ${r.total}</small>` : ''}</td>`;
        default: return `<td class="text-center">${r[k]}</td>`;
      }
    };
    $('#ld-app').innerHTML = `
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div class="btn-group btn-group-sm" role="group" aria-label="طريقة العرض">${[['home', 'مدرسو القسم', 'حسب قسم المدرس في دليل الموظفين'], ['offer', 'من يدرّس شعب القسم', 'كل من يدرّس شعباً يطرحها القسم، ومنهم غير المتفرغين']]
          .map(([k, l, t]) => `<button type="button" class="btn ${st.by === k ? 'btn-maroon' : 'btn-outline-secondary'}" data-by="${k}" title="${t}">${l}</button>`).join('')}</div>
        <div><label class="small fw-bold" for="ld-fac">الكلية</label><select class="form-select form-select-sm" id="ld-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="ld-dept">القسم</label><select class="form-select form-select-sm" id="ld-dept"><option value="">كل الأقسام</option>${dps.map(d => `<option ${d === st.dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="flex-grow-1"><label class="small fw-bold" for="ld-q">المدرس</label><input class="form-control form-control-sm" id="ld-q" value="${esc(st.q)}" placeholder="اسم المدرس…"></div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="ld-csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ld-print"><i class="bi bi-printer"></i> طباعة</button></div></div></div>
      <div class="row g-3 mb-3">
        ${[[list.length, 'مدرس', 'bi-people-fill'], [sum('secs'), 'شعبة', 'bi-collection'], [sum('students').toLocaleString('en-US'), 'مقعد مسجّل', 'bi-person-check'], [hrs(sum('hours')), 'ساعة تدريس أسبوعياً', 'bi-clock']]
          .map(([v, l, i]) => `<div class="col-6 col-xl-3"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${i}"></i> ${l}</div></div></div>`).join('')}
      </div>
      <p class="small text-muted"><i class="bi bi-info-circle"></i> الأرقام محسوبة من الجدول الدراسي المنشور فقط: «ساعات التدريس» مجموع أوقات المحاضرات ذات الموعد في الأسبوع (المحاضرة الواحدة المطروحة برمزين تُحسب مرة)،
        و«غير متزامن» شعب بلا موعد ثابت. الساعات المعتمدة والنصاب غير منشورة في الجدول فلا تظهر هنا. ${st.by === 'home' ? `القسم من دليل الموظفين؛ من ليس فيه يظهر «${UNKNOWN}» — اعرض «من يدرّس شعب القسم» لرؤيتهم ضمن أقسام الشعب.` : 'تُحسب هنا شعب القسم المختار فقط لكل مدرس، و«من» عدد كل شعبه.'}</p>
      <section class="card"><div class="table-responsive"><table class="table align-middle mb-0 tt-table ld-tbl"><thead><tr>
        ${COLS.map(([k, l]) => `<th class="${k === 'name' ? '' : 'text-center'}"><a href="#" data-sort="${k}" class="${st.sort === k ? 'on' : ''}">${l}${st.sort === k ? ' <i class="bi bi-sort-down"></i>' : ''}</a></th>`).join('')}</tr></thead>
        <tbody>${list.map(r => `<tr>${COLS.map(([k]) => cell(r, k)).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="text-muted p-3">لا مدرسين ضمن التصفية.</td></tr>`}</tbody>
        ${list.length ? `<tfoot><tr><th>المجموع (${list.length})</th><th class="text-center">${sum('secs')}</th><th class="text-center">${sum('th')}</th><th class="text-center">${sum('pr')}</th><th></th>
          <th class="text-center">${sum('students').toLocaleString('en-US')}</th><th class="text-center">${hrs(sum('hours'))}</th><th class="text-center">${sum('async')}</th><th></th><th></th><th></th></tr></tfoot>` : ''}</table></div></section>`;
    const go = () => { const u = new URL(location.href); [['by', st.by !== 'home' && st.by], ['fac', st.fac], ['dept', st.dept], ['sort', st.sort !== 'hours' && st.sort]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
      history.replaceState(null, '', u); render(); };
    document.querySelectorAll('[data-by]').forEach(b => b.addEventListener('click', () => { st.by = b.dataset.by; st.dept = ''; go(); }));
    $('#ld-fac').addEventListener('change', e => { st.fac = e.target.value; st.dept = ''; go(); });
    $('#ld-dept').addEventListener('change', e => { st.dept = e.target.value; go(); });
    document.querySelectorAll('[data-sort]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); st.sort = a.dataset.sort; go(); }));
    let t; $('#ld-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); const i = $('#ld-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    document.querySelectorAll('[data-secs]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); secsOf(list.find(r => r.name === a.dataset.secs)); }));
    $('#ld-csv').addEventListener('click', () => csv(list));
    $('#ld-print').addEventListener('click', () => print(list));
  }
  function secsOf(r) {
    U.modal(`<i class="bi bi-collection"></i> ${esc(U.shortName(r.name))} · ${r.secs} شعبة`, `<div class="table-responsive"><table class="table table-sm align-middle tt-table"><thead><tr><th>المقرر</th><th>الشعبة</th><th>النشاط</th><th>المواعيد</th><th>القاعة</th><th class="text-center">الطلبة</th><th>القسم</th></tr></thead><tbody>
      ${r.list.map(s => `<tr><td><b>${esc(s.code)}</b> ${esc(s.name)}</td><td class="text-center">${esc(s.section)}</td><td>${esc(s.activity)}</td>
        <td>${s.meetings.map(m => m.start ? `${U.DAYS[m.day]} <bdi dir="ltr">${m.start}–${m.end}</bdi>${m.mode && m.mode !== 'وجاهي' ? ` (${esc(m.mode)})` : ''}` : esc(m.mode)).join('<br>')}</td>
        <td>${esc(s.room && s.room !== '0' ? s.room : '')}</td><td class="text-center">${s.registered}</td><td><small>${esc(s.department)}</small></td></tr>`).join('')}</tbody></table></div>
      ${r.id ? `<a class="btn btn-sm btn-outline-secondary" href="instructor.html?id=${r.id}"><i class="bi bi-calendar-week"></i> الجدول الأسبوعي</a>` : ''}`);
  }
  const line = r => [U.shortName(r.name), r.dept, r.secs, r.th, r.pr, r.courses, r.students, hrs(r.hours), r.async, r.days, r.span ? `${toTime(r.span[0])}–${toTime(r.span[1])}` : '', r.other == null ? '' : r.other];
  const scope = () => [st.by === 'home' ? 'مدرسو القسم (حسب دليل الموظفين)' : 'من يدرّس شعب القسم', st.fac || 'كل الكليات', st.dept || 'كل الأقسام'];
  function csv(list) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const head = ['المدرس', 'القسم', 'الشعب', 'نظري', 'عملي', 'المقررات', 'الطلبة', 'ساعات تدريس أسبوعياً', 'غير متزامن', 'أيام الدوام', 'أول – آخر محاضرة', 'شعب من أقسام أخرى'];
    U.download(`عبء_المدرسين_${st.dept || st.fac || 'الجامعة'}.csv`, '﻿' + [head.map(q).join(',')].concat(list.map(r => line(r).map(q).join(','))).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function print(list) {
    if (!list.length) return;
    const [by, fac, dept] = scope(), sum = k => list.reduce((a, r) => a + (r[k] || 0), 0);
    printReport({
      title: 'عبء المدرسين', subtitle: `${dept !== 'كل الأقسام' ? dept : fac} · ${TT.term}`, orientation: 'landscape',
      filters: [['العرض', by], ['الكلية', fac], ['القسم', dept]],
      stats: [['مدرس', list.length], ['شعبة', sum('secs')], ['طالب مسجّل', sum('students')], ['ساعة تدريس أسبوعياً', hrs(sum('hours'))]],
      sections: [{ columns: ['المدرس', 'القسم', 'الشعب', 'نظري', 'عملي', 'المقررات', 'الطلبة', 'ساعات أسبوعياً', 'غير متزامن', 'الأيام', 'أول – آخر', 'من أقسام أخرى'],
        widths: ['17%', '15%', '6%', '6%', '6%', '7%', '7%', '9%', '7%', '6%', '8%', '6%'], rows: list.map(line) }],
      note: 'محسوب من الجدول الدراسي المنشور على بوابة الجامعة؛ ساعات التدريس مجموع أوقات المحاضرات ذات الموعد في الأسبوع. الساعات المعتمدة والنصاب غير منشورة في الجدول.',
    });
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json')]).then(([tt, idx]) => {
    TT = tt; IDX = idx;
    if (tt.days) U.setDays(tt.days);
    BYNAME = Object.fromEntries(idx.instructors.map(i => [i.name, i]));
    TDEPTS = new Set(tt.sections.map(s => s.department));
    U.updatedLine(tt.updated, TT.term);
    $('#pg-q').addEventListener('input', e => { st.q = e.target.value; render(); });
    render();
  }).catch(() => { $('#ld-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل الجدول الدراسي. أعد المحاولة بعد قليل.</div>'; });
})();
