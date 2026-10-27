/* Registration tracking: registered students over time (data/seats_history.json, a point per section whenever its
   count changes, recorded with every hourly timetable update), courses that need another section, fastest filling. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  let TT, S, H;
  const st = { fac: '', dept: '', q: '' };
  const fmtN = n => Number(n).toLocaleString('en-US');
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtN(Math.abs(n));

  // value of a section at snapshot ti (the last point at or before it)
  function valueAt(series, ti) {
    let v = null;
    for (const p of series) { if (p[0] <= ti) v = p; else break; }
    return v ? { reg: v[1], cap: v[2] } : null;
  }
  // line chart: one series, values on a shared baseline, hover title on every point
  function line(points, label, color) {
    const W = 640, Hh = 190, L = 46, R = 12, T = 14, B = 30;
    if (points.length < 2) return '<p class="text-muted small mb-0">تظهر الحركة بعد لقطتين على الأقل.</p>';
    const ys = points.map(p => p.v), lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(1, (hi - lo) * 0.15);
    const y0 = Math.max(0, lo - pad), y1 = hi + pad;
    const t0 = +new Date(points[0].t), t1 = +new Date(points[points.length - 1].t);
    const X = t => L + (W - L - R) * ((+new Date(t) - t0) / Math.max(1, t1 - t0)), Y = v => T + (Hh - T - B) * (1 - (v - y0) / (y1 - y0));
    const ticks = [y0, (y0 + y1) / 2, y1].map(v => Math.round(v));
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
    const fmtT = t => new Date(t).toLocaleString('ar-JO-u-nu-latn', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<svg class="tr-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(label)}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="tr-grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="tr-ytick">${fmtN(v)}</text>`).join('')}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
      ${points.map(p => `<circle cx="${X(p.t)}" cy="${Y(p.v)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="2"><title>${esc(fmtT(p.t))}: ${fmtN(p.v)}</title></circle>`).join('')}
      <text x="${L}" y="${Hh - 8}" class="tr-xtick" text-anchor="start">${esc(fmtT(points[0].t))}</text>
      <text x="${W - R}" y="${Hh - 8}" class="tr-xtick" text-anchor="end">${esc(fmtT(points[points.length - 1].t))}</text></svg>`;
  }

  function render() {
    const inScope = s => (!st.fac || s.faculty === st.fac) && (!st.dept || s.department === st.dept)
      && (!st.q || norm(s.code + ' ' + s.name + ' ' + s.department).includes(st.q));
    const secs = S.filter(inScope);
    const keys = secs.map(U.sectionKey);
    const last = H.times.length - 1;
    // baseline for "recent change": the snapshot about 24 hours earlier (or the first one)
    const dayAgo = +new Date(H.times[last]) - 24 * 3600e3;
    let base = 0;
    H.times.forEach((t, i) => { if (+new Date(t) <= dayAgo) base = i; });
    const spanH = Math.round((+new Date(H.times[last]) - +new Date(H.times[base])) / 3600e3);
    const span = 'آخر ' + U.count(Math.max(1, spanH), 'ساعة', 'ساعتين', 'ساعات', 'ساعة');  // Arabic number agreement

    const totals = H.times.map((t, ti) => {
      let reg = 0, closed = 0;
      keys.forEach(k => { const v = H.series[k] && valueAt(H.series[k], ti); if (v) { reg += v.reg; if (v.reg >= v.cap) closed++; } });
      return { t, reg, closed };
    });
    const now = totals[last], first = totals[0];
    // change over the window: only sections that already had a value then (a new section is not "growth")
    let dNow = 0, dRef = 0;
    keys.forEach(k => { const ser = H.series[k], a = ser && valueAt(ser, base), b = ser && valueAt(ser, last); if (a && b) { dRef += a.reg; dNow += b.reg; } });
    const over = secs.filter(s => s.registered > s.capacity);
    const near = secs.filter(s => s.registered < s.capacity && s.capacity && s.registered / s.capacity >= 0.9)
      .sort((a, b) => b.registered / b.capacity - a.registered / a.capacity);

    // courses (code + theory/lab + degree): seats left, over capacity, recent change
    const C = {};
    secs.forEach(s => {
      const k = [s.code, s.activity, s.degree].join('|');
      const c = C[k] || (C[k] = { k, code: s.code, name: s.name, act: s.activity, deg: s.degree, dept: s.department, fac: s.faculty, n: 0, reg: 0, cap: 0, left: 0, over: 0, d: 0, secs: [] });
      c.n++; c.reg += s.registered; c.cap += s.capacity; c.left += Math.max(0, s.capacity - s.registered); c.over += Math.max(0, s.registered - s.capacity);
      const ser = H.series[U.sectionKey(s)];
      const b = ser && valueAt(ser, base);
      c.d += b ? s.registered - b.reg : 0;
      c.secs.push(s);
    });
    const courses = Object.values(C);
    const needAll = courses.filter(c => c.left === 0 && (c.over > 0 || c.d > 0)).sort((a, b) => b.over - a.over || b.d - a.d);
    const need = needAll.slice(0, 25);
    const fastest = courses.filter(c => c.d > 0).sort((a, b) => b.d - a.d).slice(0, 10);
    const maxD = Math.max(1, ...fastest.map(c => c.d));
    const facs = [...new Set(S.map(s => s.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));
    const depts = [...new Set(S.filter(s => !st.fac || s.faculty === st.fac).map(s => s.department))].sort((a, b) => a.localeCompare(b, 'ar'));
    const since = new Date(H.times[0]).toLocaleString('ar-JO-u-nu-latn', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    $('#tr-app').innerHTML = `
      <div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <select class="form-select form-select-sm w-auto" id="tr-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <select class="form-select form-select-sm w-auto" id="tr-dept"><option value="">كل الأقسام</option>${depts.map(d => `<option ${d === st.dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <span class="small text-muted ms-auto"><i class="bi bi-clock-history"></i> التتبع منذ ${esc(since)} · ${U.count(H.times.length, 'لقطة واحدة', 'لقطتان', 'لقطات', 'لقطة')} · التغيّر الأخير = ${span}</span></div></div>
      <div class="tr-kpis mb-3">
        <div class="stat-card"><div class="v">${fmtN(now.reg)}</div><div class="l"><i class="bi bi-people-fill"></i> مسجّل الآن</div><small class="tr-delta ${dNow - dRef >= 0 ? 'up' : 'down'}">${signed(dNow - dRef)} ${span}</small></div>
        <div class="stat-card"><div class="v">${fmtN(now.closed)}</div><div class="l"><i class="bi bi-lock-fill"></i> شعبة مغلقة</div><small class="tr-delta">${signed(now.closed - first.closed)} منذ بدء التتبع</small></div>
        <div class="stat-card"><div class="v">${fmtN(over.length)}</div><div class="l"><i class="bi bi-exclamation-triangle-fill"></i> شعبة تجاوزت السعة</div><small class="tr-delta">${fmtN(over.reduce((a, s) => a + s.registered - s.capacity, 0))} طالباً فوق السعة</small></div>
        <div class="stat-card"><div class="v">${fmtN(needAll.length)}</div><div class="l"><i class="bi bi-plus-square-fill"></i> مقرر يحتاج شعبة إضافية</div><small class="tr-delta">لا مقاعد في أي شعبة</small></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-6"><section class="card h-100"><div class="card-header"><i class="bi bi-graph-up-arrow"></i> عدد المسجلين عبر الوقت</div>
          <div class="card-body">${line(totals.map(x => ({ t: x.t, v: x.reg })), 'عدد المسجلين عبر الوقت', '#901d23')}</div></section></div>
        <div class="col-lg-6"><section class="card h-100"><div class="card-header"><i class="bi bi-lock"></i> الشعب المغلقة عبر الوقت</div>
          <div class="card-body">${line(totals.map(x => ({ t: x.t, v: x.closed })), 'الشعب المغلقة عبر الوقت', '#091b22')}</div></section></div>
      </div>
      <div class="row g-3">
        <div class="col-xl-7"><section class="card"><div class="card-header d-flex flex-wrap gap-2 justify-content-between">
          <span><i class="bi bi-plus-square-fill text-danger"></i> مقررات تحتاج شعبة إضافية</span><span class="small text-muted">كل شعبها ممتلئة · الأكثر تجاوزاً أولاً${needAll.length > 25 ? ` · أول 25 من ${needAll.length}` : ''} · انقر للتفاصيل</span></div>
          <div class="table-responsive"><table class="table align-middle mb-0 tt-table"><thead><tr><th>المقرر</th><th class="text-center">الشعب</th><th class="text-center">مسجّل / سعة</th><th class="text-center">فوق السعة</th><th class="text-center">${span}</th></tr></thead>
          <tbody>${need.map(c => `<tr class="tr-click" data-course="${esc(c.k)}"><td class="tt-name"><b dir="ltr">${esc(c.code)}</b> ${esc(c.name)}
              <div class="tt-tags"><span class="tt-act ${c.act === 'عملي' ? 'lab' : ''}">${esc(c.act)}</span>${c.deg !== 'البكالوريوس' ? `<span class="badge text-bg-warning">${esc(c.deg)}</span>` : ''}<span class="small text-muted">${esc(c.dept)}</span></div></td>
            <td class="text-center"><span class="tt-sec">${c.n}</span></td><td class="text-center"><bdi dir="ltr">${c.reg}/${c.cap}</bdi></td>
            <td class="text-center"><span class="db-over">${c.over ? '+' + c.over : '0'}</span></td><td class="text-center">${c.d ? `<b class="${c.d > 0 ? 'text-success' : 'text-danger'}">${signed(c.d)}</b>` : '—'}</td></tr>`).join('')
            || '<tr><td colspan="5" class="text-center text-muted py-4">لا مقررات ممتلئة بالكامل ضمن التصفية.</td></tr>'}</tbody></table></div></section></div>
        <div class="col-xl-5">
          <section class="card mb-3"><div class="card-header"><i class="bi bi-lightning-charge-fill"></i> الأسرع امتلاءً (${span})</div>
            <div class="card-body">${fastest.length ? `<div class="db-hbars">${fastest.map(c => `<a href="#" class="db-hbar click" data-course="${esc(c.k)}" data-tip="${esc(c.code + ' ' + c.name)}">
              <span class="db-hl"><span dir="ltr">${esc(c.code)}</span> ${esc(c.name)}<small>${esc(c.act)} · ${c.left} مقعد متبقٍ</small></span>
              <span class="db-ht"><i style="width:${(100 * c.d / maxD).toFixed(1)}%"></i></span><b class="db-hv">+${c.d}</b></a>`).join('')}</div>`
              : '<p class="text-muted small mb-0">لم يتغيّر عدد المسجلين بعد في هذه الفترة.</p>'}</div></section>
          <section class="card"><div class="card-header"><i class="bi bi-hourglass-split"></i> شعب قاربت الامتلاء (≥90%)</div>
            <div class="card-body py-2">${near.slice(0, 12).map(s => `<div class="tr-near"><span><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)} <small>ش${esc(s.section)} · ${esc(U.shortName(s.instructor))}</small></span>
              <bdi dir="ltr">${s.registered}/${s.capacity}</bdi><em>${s.capacity - s.registered} متبقٍ</em></div>`).join('') || '<p class="text-muted small mb-0">لا شعب قاربت الامتلاء.</p>'}
              ${near.length > 12 ? `<p class="small text-muted mb-0 mt-1">و${near.length - 12} شعبة أخرى</p>` : ''}</div></section>
        </div>
      </div>
      <p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> كل لقطة تُحفظ مع التحديث الساعي للجدول الدراسي من بوابة الجامعة، وتُحفظ نقطة للشعبة فقط عند تغيّر عدد مسجليها أو سعتها.</p>`;

    $('#tr-fac').addEventListener('change', e => { st.fac = e.target.value; st.dept = ''; render(); });
    $('#tr-dept').addEventListener('change', e => { st.dept = e.target.value; render(); });
    document.querySelectorAll('[data-course]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); courseModal(C[el.dataset.course]); }));
  }
  function courseModal(c) {
    const rows = c.secs.slice().sort((a, b) => +a.section - +b.section).map(s => {
      const ser = H.series[U.sectionKey(s)] || [];
      const pts = H.times.map((t, ti) => { const v = valueAt(ser, ti); return v ? { t, v: v.reg } : null; }).filter(Boolean);
      const lo = Math.min(...pts.map(p => p.v), s.registered), hi = Math.max(...pts.map(p => p.v), s.capacity);
      const spark = pts.length > 1 ? `<svg viewBox="0 0 120 30" class="tr-spark"><polyline fill="none" stroke="#901d23" stroke-width="2" points="${pts.map((p, i) =>
        `${(i / (pts.length - 1) * 116 + 2).toFixed(1)},${(28 - (p.v - lo) / Math.max(1, hi - lo) * 26).toFixed(1)}`).join(' ')}"/></svg>` : '—';
      return `<tr><td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td><td>${esc(U.shortName(s.instructor))}</td>
        <td class="text-center"><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></td><td>${spark}</td>
        <td><span class="tt-seats ${s.status === 'مغلقة' ? 'full' : 'open'}"><span class="tt-st">${esc(s.status)}</span></span></td></tr>`;
    }).join('');
    U.modal(`<span dir="ltr">${esc(c.code)}</span> ${esc(c.name)} <small class="text-muted">(${esc(c.act)})</small>`,
      `<p class="small text-muted">${esc(c.dept)} · ${c.n} شعبة · ${c.reg}/${c.cap} مسجّل/سعة · ${c.left} مقعد متبقٍ${c.over ? ` · ${c.over} فوق السعة` : ''}</p>
      <table class="table table-sm align-middle tt-table"><thead><tr><th>الشعبة</th><th>المدرس</th><th class="text-center">مسجّل/سعة</th><th>الحركة</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>
      <a class="btn btn-sm btn-outline-primary" href="timetable.html?q=${encodeURIComponent(c.code)}"><i class="bi bi-table"></i> عرض الشعب في الجدول الدراسي</a>`);
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/seats_history.json')]).then(([tt, h]) => {
    TT = tt; S = tt.sections; H = h;
    U.setDays(tt.days);
    $('#foot-count').textContent = `${U.count(H.times.length, 'لقطة واحدة', 'لقطتان', 'لقطات', 'لقطة')} · ${tt.term}`;
    U.updatedLine(tt.updated, 'لقطة جديدة مع كل تحديث ساعي');
    render();
    let t;
    $('#pg-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = norm(e.target.value.trim()); render(); }, 250); });
  }).catch(e => { $('#tr-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
