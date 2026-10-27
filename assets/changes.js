/* «ما الجديد؟»: what changed in the timetable (sections added or removed, instructor, time, room, status, capacity),
   the staff directory (people added or removed, job, extension, office) and the academic calendar, as found by the
   hourly update (data/changes.json). Filters by period, source, kind of change, faculty and text; printed report,
   Excel and an Atom feed. ?d=7&k=section&op=change&f=<field>&fac=<faculty>&q=<text> */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { d: P.get('d') || '7', k: P.get('k') || '', op: P.get('op') || '', f: P.get('f') || '', fac: P.get('fac') || '', q: P.get('q') || '' };
  const KIND = { section: ['الجدول الدراسي', 'bi-table', '#0b4a66'], staff: ['دليل الموظفين', 'bi-person-lines-fill', '#901d23'], calendar: ['التقويم الجامعي', 'bi-calendar3', '#9a5b00'] };
  const OP = { add: ['جديد', 'bi-plus-circle-fill', 'ok'], remove: ['حُذف', 'bi-dash-circle-fill', 'no'], change: ['تغيّر', 'bi-arrow-left-right', 'ch'] };
  const PERIOD = [['1', 'اليوم'], ['2', 'أمس واليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوماً'], ['all', 'كل السجل']];
  let D;
  const day = iso => U.amman(iso).iso;  // the Amman date of a moment
  const dayName = iso => U.DAYS[U.amman(iso + 'T12:00').day] || '';
  const fields = e => (e.fields || []).map(f => f[0]);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const val = v => !v ? '<em>—</em>' : isDate(v) ? U.numDate(v) : esc(v);

  function inPeriod(e) {
    if (st.d === 'all') return true;
    const today = U.amman().iso, from = new Date(today + 'T12:00:00Z');
    from.setUTCDate(from.getUTCDate() - (+st.d - 1));
    return day(e.at) >= from.toISOString().slice(0, 10);
  }
  function filtered() {
    const q = norm(st.q.trim());
    return D.events.filter(e => inPeriod(e) && (!st.k || e.kind === st.k) && (!st.op || e.op === st.op) && (!st.f || fields(e).includes(st.f))
      && (!st.fac || e.faculty === st.fac)
      && (!q || norm([e.title, e.sub, e.section, e.instructor, e.faculty, e.department, ...(e.fields || []).flat(), ...(e.detail || []).flat()].join(' ')).includes(q)));
  }
  const what = e => e.kind === 'section' ? `شعبة ${esc(e.section)} · ${esc(e.activity)}${(e.degrees || []).length ? ' · ' + e.degrees.map(esc).join(' و') : ''}` : esc(e.sub || '');
  function item(e) {
    const [kn, ki, kc] = KIND[e.kind], [on, oi, oc] = OP[e.op];
    const body = e.op === 'change'
      ? `<table class="cg-diff">${e.fields.map(([l, o, n]) => `<tr><th>${esc(l)}</th><td class="old">${val(o)}</td><td class="arrow"><i class="bi bi-arrow-left"></i></td><td class="new">${val(n)}</td></tr>`).join('')}</table>`
      : `<div class="cg-detail">${(e.detail || []).filter(x => x[1]).map(([l, v]) => `<span><b>${esc(l)}:</b> ${val(v)}</span>`).join('')}</div>`;
    return `<article class="cg-item" style="--c:${kc}">
      <span class="cg-ic" title="${kn}"><i class="bi ${ki}"></i></span>
      <div class="cg-main"><header><span class="cg-op ${oc}"><i class="bi ${oi}"></i> ${on}</span><a href="${esc(e.link)}" class="cg-title">${esc(e.title)}</a>
        <small class="cg-time" dir="ltr">${U.amman(e.at).clock}</small></header>
        <p class="cg-sub">${what(e)}${e.faculty ? ` · ${esc(e.faculty)}` : ''}${e.department && e.department !== e.faculty ? ` · ${esc(e.department)}` : ''}${e.kind === 'section' && e.op === 'change' && e.instructor && !fields(e).includes('المدرس') ? ` · ${esc(U.shortName(e.instructor))}` : ''}</p>
        ${body}</div></article>`;
  }

  function render() {
    const list = filtered();
    const facs = [...new Set(D.events.map(e => e.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const flds = [...new Set(D.events.flatMap(fields))];
    const today = U.amman().iso, todayN = D.events.filter(e => day(e.at) === today).length;
    const byDay = {};
    list.forEach(e => (byDay[day(e.at)] ||= []).push(e));
    const count = k => list.filter(e => e.kind === k).length;
    $('#cg-app').innerHTML = `
      <div class="row g-3 mb-3">
        ${[[todayN, 'تغيير اليوم', 'bi-lightning-charge-fill'], [count('section'), 'في الجدول الدراسي', 'bi-table'], [count('staff'), 'في دليل الموظفين', 'bi-person-lines-fill'], [count('calendar'), 'في التقويم الجامعي', 'bi-calendar3']]
          .map(([v, l, i]) => `<div class="col-6 col-xl-3"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${i}"></i> ${l}</div></div></div>`).join('')}
      </div>
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="الفترة">${PERIOD.map(([k, l]) => `<button type="button" class="btn ${st.d === k ? 'btn-maroon' : 'btn-outline-secondary'}" data-d="${k}">${l}</button>`).join('')}</div>
        <div><label class="small fw-bold" for="cg-k">المصدر</label><select class="form-select form-select-sm" id="cg-k"><option value="">الكل</option>${Object.entries(KIND).map(([k, [n]]) => `<option value="${k}" ${st.k === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="cg-op">النوع</label><select class="form-select form-select-sm" id="cg-op"><option value="">الكل</option>${Object.entries(OP).map(([k, [n]]) => `<option value="${k}" ${st.op === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="cg-f">ما الذي تغيّر</label><select class="form-select form-select-sm" id="cg-f"><option value="">أي شيء</option>${flds.map(f => `<option ${st.f === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="cg-fac">الكلية / الوحدة</label><select class="form-select form-select-sm" id="cg-fac"><option value="">الكل</option>${facs.map(f => `<option ${st.fac === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div class="flex-grow-1"><label class="small fw-bold" for="cg-q">بحث</label><input class="form-control form-control-sm" id="cg-q" value="${esc(st.q)}" placeholder="رمز مقرر، اسم مدرس، قاعة…"></div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="cg-print"><i class="bi bi-printer"></i> طباعة</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="cg-csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</button>
          <a class="btn btn-sm btn-outline-secondary" href="data/changes.xml" title="اشترك بالتغييرات في قارئ الأخبار (Atom)"><i class="bi bi-rss"></i> اشتراك</a></div>
      </div></div>
      <p class="small text-muted"><i class="bi bi-info-circle"></i> يُقارن الموقع بياناته كل ساعة بما كانت عليه في الساعة السابقة، ويسجّل هنا ما تغيّر.
        بدأ التسجيل في ${U.numDate(D.started)} الساعة ${U.amman(D.started).clock}؛ ما قبل ذلك غير مسجّل. التغييرات في عدد المسجلين في الشعب تظهر في <a href="trends.html">متابعة التسجيل</a>.</p>
      ${Object.keys(byDay).sort().reverse().map(d => `<section class="cg-day"><h2><span>${dayName(d)} ${U.numDate(d)}</span>${d === today ? '<em>اليوم</em>' : ''}<small>${U.count(byDay[d].length, 'تغيير واحد', 'تغييران', 'تغييرات', 'تغييراً')}</small></h2>
        ${byDay[d].map(item).join('')}</section>`).join('')
        || `<div class="cg-empty"><i class="bi bi-check2-circle"></i><b>لا تغييرات ${st.d === 'all' && !st.k && !st.op && !st.f && !st.fac && !st.q ? 'منذ بدء التسجيل' : 'ضمن هذه التصفية'}.</b>
            <span>يُفحص الجدول الدراسي ودليل الموظفين والتقويم الجامعي كل ساعة؛ أي تغيير يظهر هنا تلقائياً.</span>
            ${st.d !== 'all' ? '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-d="all">عرض كل السجل</button>' : ''}</div>`}`;
    const go = () => {
      const u = new URL(location.href);
      Object.entries(st).forEach(([k, v]) => (v && !(k === 'd' && v === '7')) ? u.searchParams.set(k, v) : u.searchParams.delete(k));
      history.replaceState(null, '', u); render();
    };
    document.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { st.d = b.dataset.d; go(); }));
    [['cg-k', 'k'], ['cg-op', 'op'], ['cg-f', 'f'], ['cg-fac', 'fac']].forEach(([id, k]) => $('#' + id).addEventListener('change', e => { st[k] = e.target.value; go(); }));
    let t; $('#cg-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; go(); const i = $('#cg-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#cg-print').addEventListener('click', () => print(list));
    $('#cg-csv').addEventListener('click', () => csv(list));
  }

  const text = e => e.op === 'change' ? e.fields.map(([l, o, n]) => `${l}: ${(isDate(o) ? U.numDate(o) : o) || '—'} ← ${(isDate(n) ? U.numDate(n) : n) || '—'}`).join(' · ')
    : (e.detail || []).filter(x => x[1]).map(([l, v]) => `${l}: ${isDate(v) ? U.numDate(v) : v}`).join(' · ');
  function print(list) {
    if (!list.length) return;
    const days = [...new Set(list.map(e => day(e.at)))].sort().reverse();
    printReport({
      title: 'ما الجديد؟', subtitle: 'التغييرات في الجدول الدراسي ودليل الموظفين والتقويم الجامعي', orientation: 'landscape',
      filters: [['الفترة', PERIOD.find(p => p[0] === st.d)[1]], st.k && ['المصدر', KIND[st.k][0]], st.op && ['النوع', OP[st.op][0]], st.f && ['ما الذي تغيّر', st.f], st.fac && ['الكلية', st.fac], st.q && ['بحث', st.q]].filter(Boolean),
      stats: [['تغيير', list.length], ...Object.entries(KIND).map(([k, [n]]) => [n, list.filter(e => e.kind === k).length]).filter(x => x[1])],
      sections: days.map(d => ({ title: `${dayName(d)} ${U.numDate(d)}`, columns: ['الوقت', 'المصدر', 'النوع', 'ماذا', 'التفاصيل', 'الكلية / القسم'], widths: ['6%', '11%', '7%', '28%', '33%', '15%'],
        rows: list.filter(e => day(e.at) === d).map(e => [U.amman(e.at).clock, KIND[e.kind][0], { html: `<span class="pill ${e.op === 'add' ? 'ok' : e.op === 'remove' ? 'no' : 'mut'}">${OP[e.op][0]}</span>` },
          { html: `<b>${esc(e.title)}</b>${e.kind === 'section' ? `<small>شعبة ${esc(e.section)} · ${esc(e.activity)}</small>` : e.sub ? `<small>${esc(e.sub)}</small>` : ''}` },
          text(e), [e.faculty, e.department !== e.faculty && e.department].filter(Boolean).join(' · ')]) })),
    });
  }
  function csv(list) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['التاريخ', 'الوقت', 'المصدر', 'النوع', 'العنوان', 'الشعبة', 'النشاط', 'الدرجات', 'التفاصيل', 'الكلية', 'القسم'].map(q).join(',')]
      .concat(list.map(e => [U.numDate(day(e.at)), U.amman(e.at).clock, KIND[e.kind][0], OP[e.op][0], e.title, e.section, e.activity, (e.degrees || []).join('، '), text(e), e.faculty, e.department].map(q).join(',')));
    U.download(`ما_الجديد_${U.amman().iso}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  U.getJSON('data/changes.json', true).then(d => {
    D = d;
    U.updatedLine(d.updated, 'يُفحص كل ساعة');
    $('#pg-q').value = st.q;
    $('#pg-q').addEventListener('input', e => { st.q = e.target.value; const i = $('#cg-q'); if (i) i.value = st.q; render(); });
    render();
  }).catch(() => { $('#cg-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل سجل التغييرات. أعد المحاولة بعد قليل.</div>'; });
})();
