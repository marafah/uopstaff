/* «المالية»: four pages built from data/finance.json (copied from the university's official pages, with their links):
   fees.html (programmes and credit-hour prices), tuition.html (fees calculator), grants.html (excellence grants and an
   eligibility check), payments.html (paying, registration, refunds and clearance). Nothing typed here leaves the browser. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const JD = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' د.أ';
  const num = n => Number(n).toLocaleString('en-US');
  const APP = ['fn-fees', 'fn-calc', 'fn-grants', 'fn-pay'].find(id => document.getElementById(id));
  let D;

  const src = (keys, extra) => `<div class="fn-src no-print"><i class="bi bi-patch-check-fill"></i><div><b>المصدر الرسمي</b>
      ${keys.map(([k, l]) => `<a href="${esc(D.sources[k])}" target="_blank" rel="noopener">${esc(l)} <i class="bi bi-box-arrow-up-left"></i></a>`).join('')}
      <small>${esc(D.note)}${extra ? ' ' + esc(extra) : ''}</small></div></div>`;
  const kpis = list => `<div class="db-kpis fn-kpis">${list.map(([v, l, i, c, s]) => `<div class="db-kpi ${c || ''}"><i class="bi ${i}"></i><div><b>${v}</b><span>${esc(l)}</span>${s ? `<small>${esc(s)}</small>` : ''}</div></div>`).join('')}</div>`;
  const views = (id, list, cur) => `<div class="fn-views" role="group" id="${id}">${list.map(([k, i, l]) => `<button type="button" class="${k === cur ? 'on' : ''}" data-v="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>`;
  const remember = (key, def) => { try { return localStorage.getItem('fn:' + key) || def; } catch (e) { return def; } };
  const keep = (key, v) => { try { localStorage.setItem('fn:' + key, v); } catch (e) { /* storage unavailable */ } };
  const progName = p => `${p.name} (${p.degree})`;
  const progPrice = (p, intl) => intl && p.price_intl ? p.price_intl : p.price;
  const facs = () => [...new Set(D.programs.map(p => p.faculty))];
  const csv = (name, head, rows) => {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    U.download(name, '﻿' + [head.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n'), 'text/csv;charset=utf-8');
  };
  const isExcluded = p => D.grants.excluded_majors.includes(p.name);
  const faq = word => (D.faq.find(x => x.q.includes(word)) || {}).a || '';
  const TR = () => D.payment.transport;
  const PART = { fees: 'التخصصات والرسوم', finance: 'معلومات مالية هامة', grants: 'المنح الأكاديمية' };
  // a source the reader could not match: its last good copy is shown, with a clear note and the official link
  const review = parts => (D.review || []).filter(r => parts.includes(r.part)).map(r => `<div class="fn-review"><i class="bi bi-exclamation-octagon-fill"></i><div>
      <b>تغيّرت صفحة «${esc(PART[r.part] || r.part)}» على الموقع الرسمي منذ ${esc(U.numDate(r.since))}، ويُعرض هنا آخر نص مطابق قُرئ منها.</b>
      <span>راجع النسخة الرسمية الحالية قبل الاعتماد على هذه الأرقام: <a href="${esc(r.url)}" target="_blank" rel="noopener">الصفحة الرسمية <i class="bi bi-box-arrow-up-left"></i></a></span></div></div>`).join('');
  const verbatim = t => esc(t).replace(/\n/g, '<br>');

  /* ---------------------------------------------------------------- fees.html */
  const st = { deg: P.get('deg') || '', fac: P.get('fac') || '', q: '', sort: P.get('sort') || 'fac', view: P.get('view') || remember('fees-view', 'table'), cmp: (P.get('cmp') || '').split(',').filter(Boolean).map(Number) };
  function feeList() {
    const q = norm(st.q.trim());
    const list = D.programs.filter(p => (!st.deg || p.degree === st.deg) && (!st.fac || p.faculty === st.fac) && (!q || norm(p.name + ' ' + p.faculty).includes(q)));
    const by = { fac: (a, b) => facs().indexOf(a.faculty) - facs().indexOf(b.faculty) || a.degree.localeCompare(b.degree, 'ar') || a.id - b.id,
      low: (a, b) => a.price - b.price || a.name.localeCompare(b.name, 'ar'), high: (a, b) => b.price - a.price || a.name.localeCompare(b.name, 'ar'),
      total: (a, b) => a.price * a.hours - b.price * b.hours, name: (a, b) => a.name.localeCompare(b.name, 'ar') };
    return list.sort(by[st.sort] || by.fac);
  }
  function fees() {
    const list = feeList(), bach = D.programs.filter(p => p.degree === 'بكالوريوس'), mas = D.programs.filter(p => p.degree === 'ماجستير');
    const pr = a => a.map(p => p.price), max = Math.max(...list.map(p => p.price), 1);
    const row = p => `<tr><td>${esc(p.faculty.replace(/^كلية /, ''))}</td><td><b>${esc(p.name)}</b></td><td class="text-center"><span class="fn-deg ${p.degree === 'ماجستير' ? 'm' : ''}">${esc(p.degree)}</span></td>
        <td class="text-center">${p.hours}</td><td class="text-center">${esc(p.min)}</td>
        <td class="fn-price"><span class="fn-bar"><i style="width:${Math.round(100 * p.price / max)}%"></i></span><b>${p.price}</b>${p.price_intl ? `<small>غير الأردنيين: ${p.price_intl}</small>` : ''}</td>
        <td class="text-center"><b>${num(p.price * p.hours)}</b>${p.price_intl ? `<small class="d-block">${num(p.price_intl * p.hours)}</small>` : ''}</td>
        <td class="text-center no-print"><a class="btn btn-sm btn-outline-secondary" href="tuition.html?p=${p.id}" title="احسب رسوم فصل"><i class="bi bi-calculator"></i></a>
          <label class="fn-cmpbox" title="أضف للمقارنة"><input type="checkbox" data-cmp="${p.id}" ${st.cmp.includes(p.id) ? 'checked' : ''}> <i class="bi bi-layout-split"></i></label></td></tr>`;
    const card = p => `<div class="fn-card"><div class="fn-card-h"><span class="fn-deg ${p.degree === 'ماجستير' ? 'm' : ''}">${esc(p.degree)}</span><small>${esc(p.faculty)}</small></div>
        <h3>${esc(p.name)}</h3><div class="fn-card-price"><b>${p.price}</b><span>دينار للساعة المعتمدة</span></div>
        ${p.price_intl ? `<div class="fn-card-intl">لغير الأردنيين: <b>${p.price_intl}</b> دينار</div>` : ''}
        <ul><li><i class="bi bi-journal-text"></i> ${p.hours} ساعة معتمدة</li><li><i class="bi bi-mortarboard"></i> الحد الأدنى للقبول: ${esc(p.min)}</li>
          <li><i class="bi bi-cash-stack"></i> رسوم الساعات للخطة: <b>${num(p.price * p.hours)}</b> دينار</li>${isExcluded(p) ? '<li class="text-danger"><i class="bi bi-slash-circle"></i> لا يخضع لمنح الجامعة</li>' : ''}</ul>
        <div class="fn-card-a no-print"><a class="btn btn-sm btn-maroon" href="tuition.html?p=${p.id}"><i class="bi bi-calculator"></i> احسب رسوم فصل</a>
          <label class="fn-cmpbox"><input type="checkbox" data-cmp="${p.id}" ${st.cmp.includes(p.id) ? 'checked' : ''}> مقارنة</label></div></div>`;
    const byFac = () => facs().filter(f => list.some(p => p.faculty === f)).map(f => {
      const ps = list.filter(p => p.faculty === f);
      return `<section class="fn-fac"><h3>${esc(f)} <small>${ps.length} برنامج</small></h3>${ps.map(p => `<div class="fn-hrow"><span>${esc(p.name)} <small>${esc(p.degree)}</small></span>
        <span class="fn-bar lg"><i style="width:${Math.round(100 * p.price / max)}%"></i></span><b>${p.price}</b></div>`).join('')}</section>`;
    }).join('');
    const cmpList = st.cmp.map(id => D.programs.find(p => p.id === id)).filter(Boolean);
    const compare = () => cmpList.length < 2 ? `<div class="fn-empty"><i class="bi bi-layout-split"></i> اختر برنامجين إلى أربعة بعلامة <i class="bi bi-layout-split"></i> في الجدول أو «مقارنة» في البطاقات.${cmpList.length ? ` (المختار: ${esc(progName(cmpList[0]))})` : ''}</div>`
      : `<div class="table-responsive"><table class="table align-middle tt-table fn-cmp"><thead><tr><th>البند</th>${cmpList.map(p => `<th>${esc(p.name)}<small>${esc(p.degree)} · ${esc(p.faculty.replace(/^كلية /, ''))}</small></th>`).join('')}</tr></thead><tbody>
        ${[['سعر الساعة المعتمدة', p => p.price + ' د.أ' + (p.price_intl ? ` <small>(غير الأردنيين ${p.price_intl})</small>` : '')], ['الساعات المعتمدة', p => p.hours], ['الحد الأدنى للقبول', p => esc(p.min)],
          ['رسوم الساعات للخطة كاملة', p => `<b>${num(p.price * p.hours)}</b> د.أ`], ['منح الجامعة', p => isExcluded(p) ? '<span class="text-danger">لا يخضع</span>' : 'يخضع حسب التعليمات']]
          .map(([l, f]) => `<tr><th>${l}</th>${cmpList.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <button type="button" class="btn btn-sm btn-outline-secondary no-print" id="fn-cmp-clear"><i class="bi bi-x-circle"></i> مسح المقارنة</button>`;
    const body = { table: `<div class="card"><div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-tbl"><thead><tr><th>الكلية</th><th>التخصص</th><th class="text-center">الدرجة</th>
          <th class="text-center">الساعات</th><th class="text-center">الحد الأدنى للقبول</th><th>سعر الساعة (د.أ)</th><th class="text-center">رسوم ساعات الخطة (د.أ)</th><th class="no-print"></th></tr></thead>
          <tbody>${list.map(row).join('') || '<tr><td colspan="8" class="text-muted">لا برامج ضمن التصفية.</td></tr>'}</tbody></table></div></div>`,
      cards: `<div class="fn-cards">${list.map(card).join('') || '<p class="text-muted">لا برامج ضمن التصفية.</p>'}</div>`,
      fac: `<div class="fn-facs">${byFac()}</div>`, compare: compare() }[st.view] || '';
    $('#fn-fees').innerHTML = `
      ${kpis([[D.programs.length, 'برنامجاً مطروحاً', 'bi-collection'], [bach.length, 'بكالوريوس', 'bi-mortarboard', 'good', `من ${Math.min(...pr(bach))} إلى ${Math.max(...pr(bach))} دينار للساعة`],
        [mas.length, 'ماجستير', 'bi-award', 'warn', `من ${Math.min(...pr(mas))} إلى ${Math.max(...pr(mas))} دينار للساعة`], [D.fixed.items[0].regular + D.fixed.items[1].regular, 'تسجيل وخدمات لكل فصل اعتيادي', 'bi-receipt', '', 'غير مستردة']])}
      <div class="card mb-3 no-print"><div class="card-body fn-bar-row">
        <div><label class="small fw-bold" for="fn-deg">الدرجة</label><select class="form-select form-select-sm" id="fn-deg"><option value="">بكالوريوس وماجستير</option>${['بكالوريوس', 'ماجستير'].map(x => `<option ${x === st.deg ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="fn-fac">الكلية</label><select class="form-select form-select-sm" id="fn-fac"><option value="">كل الكليات</option>${facs().map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div class="flex-grow-1"><label class="small fw-bold" for="fn-q">بحث</label><input class="form-control form-control-sm" id="fn-q" value="${esc(st.q)}" placeholder="اسم التخصص…"></div>
        <div><label class="small fw-bold" for="fn-sort">الترتيب</label><select class="form-select form-select-sm" id="fn-sort">${[['fac', 'حسب الكلية'], ['low', 'الأقل سعراً'], ['high', 'الأعلى سعراً'], ['total', 'الأقل كلفة للخطة'], ['name', 'أبجدياً']].map(([k, l]) => `<option value="${k}" ${k === st.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="fn-csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="fn-print"><i class="bi bi-printer"></i> طباعة</button></div></div></div>
      <div class="fn-head"><h2><i class="bi bi-tags"></i> التخصصات وسعر الساعة <small>${list.length} برنامج · ${esc(D.year)}</small></h2>
        ${views('fn-v', [['table', 'bi-table', 'جدول'], ['cards', 'bi-grid-1x2', 'بطاقات'], ['fac', 'bi-bar-chart-steps', 'حسب الكلية'], ['compare', 'bi-layout-split', `مقارنة${st.cmp.length ? ` (${st.cmp.length})` : ''}`]], st.view)}</div>
      ${body}
      <p class="fn-foot-note"><i class="bi bi-info-circle"></i> الأسعار كما تنشرها الجامعة: سعر واحد للساعة لكل تخصص، وسعر خاص بغير الأردنيين حيث تنشره الجامعة (تخصصا طب الأسنان). «رسوم ساعات الخطة» = عدد ساعات الخطة × سعر الساعة المنشور، دون رسوم التسجيل والخدمات والمواصلات والمنح.</p>
      <div class="row g-3 mt-1">
        <div class="col-lg-7"><section class="card h-100"><div class="card-header fw-bold"><i class="bi bi-receipt"></i> ${esc(D.fixed.title)}</div><div class="table-responsive"><table class="table align-middle mb-0 tt-table">
          <thead><tr><th>الرسم</th><th class="text-center">الفصل الاعتيادي</th><th class="text-center">الفصل الصيفي</th><th>متى</th><th class="text-center">مسترد؟</th></tr></thead><tbody>
          ${D.fixed.items.map(f => `<tr><td><b>${esc(f.name)}</b></td>${f.once ? `<td class="text-center" colspan="2"><b>${f.once}</b> د.أ مرة واحدة</td>` : `<td class="text-center"><b>${f.regular}</b></td><td class="text-center"><b>${f.summer}</b></td>`}
            <td class="small">${esc(f.when || (f.key === 'insurance' ? faq('التأمين') : 'كل فصل'))}</td><td class="text-center">${f.refund ? '<span class="fn-yes">نعم</span>' : '<span class="fn-no">لا</span>'}</td></tr>`).join('')}</tbody></table></div></section></div>
        <div class="col-lg-5"><section class="card h-100"><div class="card-header fw-bold"><i class="bi bi-award"></i> رسوم الماجستير وملاحظات القبول</div><div class="card-body fn-notes">
          <div class="fn-pair"><span>رسوم مناقشة الرسالة / الأطروحة</span><b>${D.masters.thesis_defense} د.أ</b></div><div class="fn-pair"><span>رسوم الامتحان الشامل</span><b>${D.masters.comprehensive} د.أ</b></div>
          ${D.notes.filter(n => !/^رسوم (مناقشة|الامتحان الشامل)/.test(n)).map(n => `<p>${esc(n)}</p>`).join('')}
          <p class="mb-0"><a href="grants.html"><i class="bi bi-gift"></i> المنح والخصومات</a> · <a href="payments.html"><i class="bi bi-credit-card"></i> الدفع والتسجيل والاسترداد</a></p></div></section></div></div>
      ${src([['fees', 'التخصصات المطروحة والرسوم – دائرة القبول والتسجيل']])}`;
    $('#fn-fees').insertAdjacentHTML('afterbegin', review(['fees']));
    const go = () => { const u = new URL(location.href); ['deg', 'fac', 'sort', 'view'].forEach(k => st[k] && !(k === 'sort' && st[k] === 'fac') ? u.searchParams.set(k, st[k]) : u.searchParams.delete(k));
      st.cmp.length ? u.searchParams.set('cmp', st.cmp.join(',')) : u.searchParams.delete('cmp'); history.replaceState(null, '', u); fees(); };
    $('#fn-deg').addEventListener('change', e => { st.deg = e.target.value; go(); });
    $('#fn-fac').addEventListener('change', e => { st.fac = e.target.value; go(); });
    $('#fn-sort').addEventListener('change', e => { st.sort = e.target.value; go(); });
    let t; $('#fn-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; fees(); const i = $('#fn-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    document.querySelectorAll('#fn-v button').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.v; keep('fees-view', st.view); go(); }));
    document.querySelectorAll('[data-cmp]').forEach(c => c.addEventListener('change', () => {
      const id = +c.dataset.cmp; st.cmp = c.checked ? [...new Set(st.cmp.concat(id))].slice(-4) : st.cmp.filter(x => x !== id); go(); }));
    const cc = $('#fn-cmp-clear'); if (cc) cc.addEventListener('click', () => { st.cmp = []; go(); });
    $('#fn-csv').addEventListener('click', () => csv(`رسوم_التخصصات_${D.year}.csv`, ['الكلية', 'التخصص', 'الدرجة', 'الساعات المعتمدة', 'الحد الأدنى للقبول', 'سعر الساعة (د.أ)', 'سعر الساعة لغير الأردنيين', 'رسوم ساعات الخطة (د.أ)'],
      list.map(p => [p.faculty, p.name, p.degree, p.hours, p.min, p.price, p.price_intl || '', p.price * p.hours])));
    $('#fn-print').addEventListener('click', () => printReport({ title: 'التخصصات وسعر الساعة المعتمدة', subtitle: 'جامعة البترا · ' + D.year, orientation: 'portrait',
      filters: [['الدرجة', st.deg || 'الكل'], ['الكلية', st.fac || 'كل الكليات']], stats: [['عدد البرامج', list.length], ['المصدر', 'الموقع الرسمي للجامعة']],
      sections: [{ columns: ['الكلية', 'التخصص', 'الدرجة', 'الساعات', 'الحد الأدنى', 'سعر الساعة', 'رسوم ساعات الخطة'],
        rows: list.map(p => [p.faculty.replace(/^كلية /, ''), p.name, p.degree, p.hours, p.min, p.price + (p.price_intl ? ` / ${p.price_intl}` : ''), num(p.price * p.hours)]) },
        { title: D.fixed.title, columns: ['الرسم', 'الفصل الاعتيادي', 'الفصل الصيفي', 'مسترد'], rows: D.fixed.items.map(f => [f.name, f.once ? f.once + ' (مرة واحدة)' : f.regular, f.once ? '—' : f.summer, f.refund ? 'نعم' : 'لا']) }],
      note: D.note + ' ' + D.sources.fees }));
  }

  /* ---------------------------------------------------------------- tuition.html */
  const cs = { p: +P.get('p') || 0, intl: P.get('intl') === '1', h: +P.get('h') || 15, sem: P.get('sem') || 'regular', first: P.get('first') === '1', trans: P.get('tr') === '1',
    pay: P.get('pay') || 'early', grant: P.get('g') || 'none', avg: P.get('avg') || '', gpa: P.get('gpa') || '', pct: P.get('pct') || '', tab: P.get('tab') || 'sem',
    sems: +P.get('sems') || 0, sums: P.get('sums') == null ? 2 : +P.get('sums') };
  function tawjihiPct(p, avg) {
    const g = D.grants.tawjihi, inA = g.groupA.faculties.includes(p.faculty) || g.groupA.majors.includes(p.name);
    const band = (inA ? g.groupA : g.groupB).bands.find(([lo, hi]) => avg >= lo && avg <= hi + 0.0999);
    return { pct: band ? band[2] : 0, group: inA ? g.groupA.label : g.groupB.label };
  }
  function gpaPct(gpa) { const b = D.grants.academic.bands.find(([lo, hi]) => gpa >= lo && gpa <= hi + 0.00999); return b ? b[2] : 0; }
  function grantOf(p) {
    if (cs.grant === 'none') return { pct: 0, why: '' };
    if (isExcluded(p)) return { pct: 0, why: 'هذا التخصص لا يخضع لأي منح تقدمها الجامعة.' };
    if (cs.grant === 'tawjihi') { const a = parseFloat(cs.avg); if (!(a > 0)) return { pct: 0, why: 'أدخل معدل الثانوية العامة.' };
      const r = tawjihiPct(p, a); return { pct: r.pct, why: r.pct ? `منحة تفوق الثانوية العامة (${r.group}): ${r.pct}%` : 'المعدل دون الحد الأدنى لمنحة التفوق في هذه الكلية.' }; }
    if (cs.grant === 'gpa') { const g = parseFloat(cs.gpa); if (!(g > 0)) return { pct: 0, why: 'أدخل المعدل التراكمي.' };
      const pc = gpaPct(g); return { pct: pc, why: pc ? `منحة التفوق الأكاديمي (معدل ${g}): ${pc}% بشروطها` : 'المعدل دون 3.67 فلا تُستحق منحة التفوق الأكاديمي.' }; }
    const m = Math.max(0, Math.min(100, parseFloat(cs.pct) || 0)); return { pct: m, why: m ? `خصم أو منحة أخرى: ${m}%` : 'أدخل نسبة الخصم.' };
  }
  function semCalc(p) {
    const fx = Object.fromEntries(D.fixed.items.map(f => [f.key, f])), summer = cs.sem === 'summer', price = progPrice(p, cs.intl);
    const tuition = price * cs.h, gr = grantOf(p), disc = Math.round(tuition * gr.pct) / 100;
    const lines = [['رسوم الساعات', `${cs.h} ساعة × ${price} د.أ`, tuition, 'hours'], gr.pct ? ['المنحة / الخصم (على الرسوم الدراسية فقط)', `${gr.pct}%`, -disc, 'grant'] : null,
      ['رسوم التسجيل', 'غير مستردة', summer ? fx.registration.summer : fx.registration.regular, 'fixed'], ['رسوم الخدمات', 'غير مستردة', summer ? fx.services.summer : fx.services.regular, 'fixed']];
    if (cs.first) lines.push(['رسوم تأمين', 'مستردة عند التخرج أو الانسحاب، مرة واحدة', fx.insurance.regular, 'fixed'], ['رسوم طلب التحاق لأول مرة', 'عند القبول', fx.application.once, 'fixed'],
      ...(p.degree === 'بكالوريوس' ? [['رسوم امتحانات المستوى', 'عند القبول، لطلبة البكالوريوس', fx.placement.once, 'fixed']] : []));
    if (cs.trans) { const T = TR(); lines.push(['المواصلات (اختياري)', 'مبلغ مقطوع نقداً', summer ? (cs.first ? T.summer_first : T.summer) : (cs.first ? T.regular_first : T.regular), 'fixed']); }
    const L = lines.filter(Boolean), total = L.reduce((a, l) => a + l[2], 0), net = tuition - disc;
    // after early registration, an old student pays 60% of the hours' fees now (not in dentistry) and the rest before the finals
    const dental = D.payment.late_except_dentistry && /طب الأسنان/.test(p.name) && !/تكنولوجيا/.test(p.name), late = cs.pay === 'late' && !cs.first && !dental;
    const later = late ? Math.round(net * (100 - D.payment.late_pct)) / 100 : 0;
    return { L, total, net, later, now: total - later, gr, late, dental, price };
  }
  function calc() {
    const progs = D.programs, p = progs.find(x => x.id === cs.p) || progs.find(x => x.name === 'هندسة البرمجيات') || progs[0];
    cs.p = p.id;
    const r = semCalc(p), share = () => { const u = new URL(location.href); u.search = new URLSearchParams({ p: cs.p, h: cs.h, sem: cs.sem, pay: cs.pay, g: cs.grant, tab: cs.tab,
      ...(cs.intl ? { intl: 1 } : {}), ...(cs.first ? { first: 1 } : {}), ...(cs.trans ? { tr: 1 } : {}), ...(cs.avg ? { avg: cs.avg } : {}), ...(cs.gpa ? { gpa: cs.gpa } : {}), ...(cs.pct ? { pct: cs.pct } : {}),
      ...(cs.sems ? { sems: cs.sems } : {}), sums: cs.sums }); history.replaceState(null, '', u); };
    share();
    const opts = facs().map(f => `<optgroup label="${esc(f)}">${progs.filter(x => x.faculty === f).map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(progName(x))} – ${x.price} د.أ</option>`).join('')}</optgroup>`).join('');
    const sems = cs.sems || (p.degree === 'ماجستير' ? 4 : 8);  // a starting value only: the reader sets the number of semesters
    const plan = (() => { const fx = Object.fromEntries(D.fixed.items.map(f => [f.key, f])), price = progPrice(p, cs.intl), T = TR();
      const rows = [['رسوم ساعات الخطة', `${p.hours} ساعة × ${price} د.أ`, p.hours * price], ['التسجيل والخدمات للفصول الاعتيادية', `${sems} فصل × ${fx.registration.regular + fx.services.regular} د.أ`, sems * (fx.registration.regular + fx.services.regular)],
        ['التسجيل والخدمات للفصول الصيفية', `${cs.sums} فصل × ${fx.registration.summer + fx.services.summer} د.أ`, cs.sums * (fx.registration.summer + fx.services.summer)],
        ['رسوم عند القبول', `طلب التحاق${p.degree === 'بكالوريوس' ? ' + امتحانات المستوى' : ''}`, fx.application.once + (p.degree === 'بكالوريوس' ? fx.placement.once : 0)],
        ...(p.degree === 'ماجستير' ? [cs.track === 'comp' ? ['رسوم الامتحان الشامل', 'مسار الامتحان الشامل', D.masters.comprehensive] : ['رسوم مناقشة الرسالة / الأطروحة', 'مسار الرسالة', D.masters.thesis_defense]] : []),
        ...(cs.trans ? [['المواصلات', `${sems} فصل اعتيادي و${cs.sums} صيفي`, T.regular_first + Math.max(0, sems - 1) * T.regular + (cs.sums ? T.summer_first + Math.max(0, cs.sums - 1) * T.summer : 0)]] : [])];
      return { rows, total: rows.reduce((a, x) => a + x[2], 0), insurance: fx.insurance.regular, first: 0 };
    })();
    $('#fn-calc').innerHTML = `
      <div class="fn-tabs no-print">${views('fn-tab', [['sem', 'bi-calendar3', 'رسوم فصل دراسي'], ['plan', 'bi-signpost-2', 'كلفة البرنامج كاملاً']], cs.tab)}</div>
      <div class="row g-3">
        <div class="col-xl-4 col-lg-5 no-print"><section class="card fn-form"><div class="card-header fw-bold"><i class="bi bi-sliders"></i> بياناتك</div><div class="card-body d-grid gap-2">
          <div><label class="small fw-bold" for="c-p">التخصص</label><select class="form-select form-select-sm" id="c-p">${opts}</select></div>
          ${p.price_intl ? `<div class="fn-seg">${[['0', 'أردني / فلسطيني'], ['1', 'غير أردني']].map(([v, l]) => `<label><input type="radio" name="c-intl" value="${v}" ${(cs.intl ? '1' : '0') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>` : ''}
          ${cs.tab === 'sem' ? `
          <div class="row g-2"><div class="col-6"><label class="small fw-bold" for="c-h">عدد الساعات</label><input type="number" min="1" max="24" class="form-control form-control-sm" id="c-h" value="${cs.h}"></div>
            <div class="col-6"><label class="small fw-bold" for="c-sem">الفصل</label><select class="form-select form-select-sm" id="c-sem"><option value="regular" ${cs.sem === 'regular' ? 'selected' : ''}>اعتيادي (أول / ثانٍ)</option><option value="summer" ${cs.sem === 'summer' ? 'selected' : ''}>صيفي</option></select></div></div>
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="c-first" ${cs.first ? 'checked' : ''}> طالب مستجد (أول فصل في الجامعة)</label>
          <div><label class="small fw-bold">موعد التسجيل</label><div class="fn-seg">${[['early', 'التسجيل المبكر (100%)'], ['late', 'بعد المبكر (60% الآن)']].map(([v, l]) => `<label><input type="radio" name="c-pay" value="${v}" ${cs.pay === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>`
          : `<div class="row g-2"><div class="col-6"><label class="small fw-bold" for="c-sems">الفصول الاعتيادية</label><input type="number" min="1" max="20" class="form-control form-control-sm" id="c-sems" value="${sems}"></div>
            <div class="col-6"><label class="small fw-bold" for="c-sums">الفصول الصيفية</label><input type="number" min="0" max="10" class="form-control form-control-sm" id="c-sums" value="${cs.sums}"></div></div>
          ${p.degree === 'ماجستير' ? `<div><label class="small fw-bold">المسار</label><div class="fn-seg">${[['thesis', 'الرسالة'], ['comp', 'الامتحان الشامل']].map(([v, l]) => `<label><input type="radio" name="c-track" value="${v}" ${(cs.track || 'thesis') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>` : ''}`}
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="c-tr" ${cs.trans ? 'checked' : ''}> أشترك في مواصلات الجامعة</label>
          <div><label class="small fw-bold" for="c-g">منحة أو خصم</label><select class="form-select form-select-sm" id="c-g">${[['none', 'بلا منحة'], ['tawjihi', 'تفوق الثانوية العامة (للمستجد)'], ['gpa', 'التفوق الأكاديمي (معدل تراكمي)'], ['manual', 'نسبة أخرى أعرفها']].map(([v, l]) => `<option value="${v}" ${cs.grant === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${cs.grant === 'tawjihi' ? `<div><label class="small fw-bold" for="c-avg">معدل الثانوية العامة %</label><input type="number" step="0.1" min="0" max="100" class="form-control form-control-sm" id="c-avg" value="${esc(cs.avg)}"></div>` : ''}
          ${cs.grant === 'gpa' ? `<div><label class="small fw-bold" for="c-gpa">المعدل التراكمي (من 4.00)</label><input type="number" step="0.01" min="0" max="4" class="form-control form-control-sm" id="c-gpa" value="${esc(cs.gpa)}"></div>` : ''}
          ${cs.grant === 'manual' ? `<div><label class="small fw-bold" for="c-pct">نسبة الخصم %</label><input type="number" min="0" max="100" class="form-control form-control-sm" id="c-pct" value="${esc(cs.pct)}"></div>` : ''}
          ${grantOf(p).why ? `<div class="fn-hint ${grantOf(p).pct ? 'ok' : ''}"><i class="bi ${grantOf(p).pct ? 'bi-check-circle-fill' : 'bi-info-circle'}"></i> ${esc(grantOf(p).why)}</div>` : ''}
        </div></section></div>
        <div class="col-xl-8 col-lg-7">${cs.tab === 'sem' ? `
          <section class="fn-total"><div><small>مجموع رسوم هذا الفصل حسب الأرقام المنشورة</small><b>${JD(r.total)}</b><span>${esc(progName(p))} · ${cs.h} ساعة · ${cs.sem === 'summer' ? 'فصل صيفي' : 'فصل اعتيادي'}</span></div>
            ${r.late ? `<div class="fn-split"><div><small>يُدفع عند التسجيل</small><b>${JD(r.now)}</b></div><div><small>قبل الامتحانات النهائية</small><b>${JD(r.later)}</b></div></div>` : ''}</section>
          <section class="card mt-3"><div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-lines"><thead><tr><th>البند</th><th>التفصيل</th><th class="text-end">المبلغ</th></tr></thead><tbody>
            ${r.L.map(([n, d, v, k]) => `<tr class="${k}"><td><b>${esc(n)}</b></td><td class="small">${esc(d)}</td><td class="text-end"><b>${v < 0 ? '−' : ''}${JD(Math.abs(v))}</b></td></tr>`).join('')}
            <tr class="sum"><td colspan="2"><b>المجموع</b></td><td class="text-end"><b>${JD(r.total)}</b></td></tr></tbody></table></div></section>
          <ul class="fn-notes-list">
            ${cs.pay === 'late' && cs.first ? '<li><i class="bi bi-info-circle"></i> دفع 60% بعد التسجيل المبكر منشور «للطالب القديم»، لذلك حُسب المستجد بالدفع الكامل.</li>' : ''}
            ${cs.pay === 'late' && r.dental ? '<li><i class="bi bi-info-circle"></i> تخصص طب الأسنان مستثنى من الدفع الجزئي (60%).</li>' : ''}
            <li><i class="bi bi-quote"></i> ${esc(faq(cs.pay === 'late' ? 'بعد انتهاء فترة التسجيل المبكر' : 'التسجيل المبكر وكيف'))}</li>
            <li><i class="bi bi-shield-check"></i> المنح تُحسب على الرسوم الدراسية فقط، ومادة العلوم العسكرية لا تُدرج ضمن أي منحة.</li>
            <li><i class="bi bi-house"></i> السكن الداخلي للطالبات غير محسوب؛ أسعاره في <a href="${esc(D.sources.housing)}" target="_blank" rel="noopener">صفحة سكن الطالبات</a>.</li></ul>`
          : `<section class="fn-total"><div><small>كلفة البرنامج حسب الأرقام المنشورة وعدد الفصول الذي أدخلته</small><b>${JD(plan.total)}</b><span>${esc(progName(p))} · ${p.hours} ساعة · ${sems} فصل اعتيادي و${cs.sums} صيفي</span></div>
             <div class="fn-split"><div><small>رسوم الساعات وحدها</small><b>${JD(plan.rows[0][2])}</b></div><div><small>تأمين مسترد</small><b>${JD(plan.insurance)}</b></div></div></section>
          <section class="card mt-3"><div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-lines"><thead><tr><th>البند</th><th>التفصيل</th><th class="text-end">المبلغ</th></tr></thead><tbody>
            ${plan.rows.map(([n, d, v]) => `<tr><td><b>${esc(n)}</b></td><td class="small">${esc(d)}</td><td class="text-end"><b>${JD(v)}</b></td></tr>`).join('')}
            <tr class="sum"><td colspan="2"><b>المجموع</b></td><td class="text-end"><b>${JD(plan.total)}</b></td></tr></tbody></table></div></section>
          <ul class="fn-notes-list"><li><i class="bi bi-info-circle"></i> بأسعار ${esc(D.year)} المنشورة الآن، دون افتراض أي تغيير مستقبلي. عدد الفصول الاعتيادية والصيفية تُدخله أنت حسب خطتك.</li>
            <li><i class="bi bi-info-circle"></i> لا يشمل التأمين المسترد ولا السكن ولا المنح (فالمنح مشروطة بالمعدل فصلاً بفصل).</li></ul>`}
          <div class="d-flex flex-wrap gap-2 no-print mt-2"><button type="button" class="btn btn-sm btn-maroon" id="c-print"><i class="bi bi-printer"></i> طباعة / PDF</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="c-link"><i class="bi bi-link-45deg"></i> نسخ رابط هذا الحساب</button>
            <a class="btn btn-sm btn-outline-secondary" href="fees.html"><i class="bi bi-tags"></i> كل التخصصات والأسعار</a></div>
        </div></div>
      <div class="fn-disclaimer"><i class="bi bi-exclamation-triangle-fill"></i> الحاسبة تجمع الأرقام كما تنشرها الجامعة على موقعها الرسمي، دون تقدير أو تقريب؛ المرجع المعتمد كشف الحساب لدى دائرة الشؤون المالية. لا يُحفظ ولا يُرسل أي شيء تُدخله هنا.</div>
      ${src([['fees', 'التخصصات المطروحة والرسوم'], ['finance', 'معلومات مالية هامة – دائرة الشؤون المالية'], ['grants', 'المنح الأكاديمية']])}`;
    $('#fn-calc').insertAdjacentHTML('afterbegin', review(['fees', 'finance', 'grants']));
    const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
    let t; const later = f => e => { clearTimeout(t); const id = '#' + e.target.id; t = setTimeout(() => { f(e); calc(); const el = $(id); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (x) { /* number inputs */ } } }, 400); };
    on('#c-p', 'change', e => { cs.p = +e.target.value; cs.sems = 0; calc(); });
    document.querySelectorAll('[name=c-intl]').forEach(x => x.addEventListener('change', e => { cs.intl = e.target.value === '1'; calc(); }));
    document.querySelectorAll('[name=c-track]').forEach(x => x.addEventListener('change', e => { cs.track = e.target.value; calc(); }));
    document.querySelectorAll('[name=c-pay]').forEach(x => x.addEventListener('change', e => { cs.pay = e.target.value; calc(); }));
    on('#c-h', 'input', later(e => { cs.h = Math.max(1, Math.min(24, +e.target.value || 1)); }));
    on('#c-sems', 'input', later(e => { cs.sems = Math.max(1, +e.target.value || 1); }));
    on('#c-sums', 'input', later(e => { cs.sums = Math.max(0, +e.target.value || 0); }));
    on('#c-sem', 'change', e => { cs.sem = e.target.value; calc(); });
    on('#c-first', 'change', e => { cs.first = e.target.checked; calc(); });
    on('#c-tr', 'change', e => { cs.trans = e.target.checked; calc(); });
    on('#c-g', 'change', e => { cs.grant = e.target.value; calc(); });
    on('#c-avg', 'input', later(e => { cs.avg = e.target.value; }));
    on('#c-gpa', 'input', later(e => { cs.gpa = e.target.value; }));
    on('#c-pct', 'input', later(e => { cs.pct = e.target.value; }));
    document.querySelectorAll('#fn-tab button').forEach(b => b.addEventListener('click', () => { cs.tab = b.dataset.v; calc(); }));
    on('#c-link', 'click', () => navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => { $('#c-link').innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; }));
    on('#c-print', 'click', () => {
      const sem = cs.tab === 'sem';
      printReport({ title: sem ? 'حساب رسوم فصل دراسي' : 'كلفة البرنامج حسب الأرقام المنشورة', subtitle: progName(p) + ' · ' + p.faculty, orientation: 'portrait',
        filters: sem ? [['عدد الساعات', cs.h], ['الفصل', cs.sem === 'summer' ? 'صيفي' : 'اعتيادي'], ['طالب مستجد', cs.first ? 'نعم' : 'لا'], ['موعد التسجيل', cs.pay === 'late' ? 'بعد المبكر' : 'المبكر']]
          : [['الفصول الاعتيادية', sems], ['الفصول الصيفية', cs.sums]],
        stats: sem ? [['المجموع', JD(r.total)], ...(r.late ? [['عند التسجيل', JD(r.now)], ['قبل النهائي', JD(r.later)]] : [])] : [['المجموع', JD(plan.total)]],
        sections: [{ columns: ['البند', 'التفصيل', 'المبلغ'], rows: (sem ? r.L.map(([n, d, v]) => [n, d, (v < 0 ? '−' : '') + JD(Math.abs(v))]) : plan.rows.map(([n, d, v]) => [n, d, JD(v)])) }],
        note: 'مجموع الأرقام المنشورة على الموقع الرسمي للجامعة (' + D.year + ')، دون تقدير أو تقريب؛ المرجع المعتمد كشف الحساب لدى دائرة الشؤون المالية. ' + D.sources.fees });
    });
  }

  /* ---------------------------------------------------------------- grants.html */
  const gs = { avg: '', fac: '', gpa: '', passed: '', disc: false, view: remember('grants-view', 'tables') };
  function grants() {
    const G = D.grants, T = G.tawjihi, A = G.academic;
    const bandRows = bs => bs.map(([lo, hi, pc]) => `<tr><td>${hi >= 100 ? `من ${lo}% فأكثر` : `من ${lo}% إلى ${hi}%`}</td><td class="text-center"><b class="fn-pct">${pc}%</b></td></tr>`).join('');
    const progs = D.programs.filter(p => p.degree === 'بكالوريوس');
    const chosen = progs.find(p => String(p.id) === gs.fac);
    let tRes = '', aRes = '';
    if (gs.avg && chosen) {
      const a = parseFloat(gs.avg), r = tawjihiPct(chosen, a);
      tRes = isExcluded(chosen) ? `<div class="fn-res bad"><i class="bi bi-slash-circle"></i> ${esc(chosen.name)} لا يخضع لأي منح تقدمها الجامعة.</div>`
        : r.pct ? `<div class="fn-res ok"><i class="bi bi-gift-fill"></i> منحة <b>${r.pct}%</b> من الرسوم الدراسية لمدة عام دراسي كامل (بما فيه الصيفي)، أي <b>${num(chosen.price * r.pct / 100)}</b> د.أ من كل ساعة معتمدة سعرها ${chosen.price} د.أ.
            <small>للاستمرار: معدل تراكمي ${T.keep_gpa[String(r.pct)]} على الأقل. ${esc(T.who)}</small></div>`
        : `<div class="fn-res"><i class="bi bi-info-circle"></i> المعدل ${a}% دون الحد الأدنى لمنحة التفوق في ${esc(r.group)}.</div>`;
    }
    if (gs.gpa) {
      const g = parseFloat(gs.gpa), pc = gpaPct(g), passed = parseFloat(gs.passed) || 0, miss = [];
      if (passed && passed < 30) miss.push('اجتياز 30 ساعة معتمدة من الخطة في جامعة البترا (للمرة الأولى)');
      if (gs.disc) miss.push('ألا تكون صدرت بحقك عقوبة تأديبية من درجة إنذار فأكثر');
      aRes = !pc ? `<div class="fn-res"><i class="bi bi-info-circle"></i> المعدل ${g} دون 3.67 فلا تُستحق منحة التفوق الأكاديمي.</div>`
        : miss.length ? `<div class="fn-res bad"><i class="bi bi-exclamation-triangle-fill"></i> المعدل يؤهل لمنحة ${pc}%، لكن ينقص: ${miss.map(esc).join('، ')}.</div>`
        : `<div class="fn-res ok"><i class="bi bi-gift-fill"></i> منحة <b>${pc}%</b> من الرسوم الدراسية في الفصل اللاحق. <small>${esc(A.continue)}</small></div>`;
    }
    const tables = `<div class="row g-3">
        <div class="col-lg-6"><section class="card h-100"><div class="card-header fw-bold"><i class="bi bi-trophy"></i> ${esc(T.title)}</div><div class="card-body">
          <p class="small mb-2"><b>لمن؟</b> ${esc(T.who)} <b>تشمل:</b> ${esc(T.covers)}.</p>
          <div class="row g-2"><div class="col-sm-6"><h6 class="fn-h6">${esc(T.groupA.label)}</h6><table class="table table-sm tt-table mb-0"><thead><tr><th>معدل الثانوية</th><th class="text-center">المنحة</th></tr></thead><tbody>${bandRows(T.groupA.bands)}</tbody></table></div>
            <div class="col-sm-6"><h6 class="fn-h6">${esc(T.groupB.label)}</h6><table class="table table-sm tt-table mb-0"><thead><tr><th>معدل الثانوية</th><th class="text-center">المنحة</th></tr></thead><tbody>${bandRows(T.groupB.bands)}</tbody></table></div></div>
          <p class="small mt-2 mb-0"><i class="bi bi-arrow-repeat"></i> ${esc(T.keep)} ${esc(T.after || '')}</p></div></section></div>
        <div class="col-lg-6"><section class="card h-100"><div class="card-header fw-bold"><i class="bi bi-mortarboard"></i> ${esc(A.title)}</div><div class="card-body">
          <p class="small mb-2">${esc(A.covers)}:</p>
          <table class="table table-sm tt-table"><thead><tr><th>المعدل التراكمي (من 4.00)</th><th class="text-center">المنحة من الرسوم الدراسية</th></tr></thead><tbody>
            ${A.bands.map(([lo, hi, pc]) => `<tr><td>${lo === hi ? lo.toFixed(2) : `${lo.toFixed(2)} – ${hi.toFixed(2)}`}</td><td class="text-center"><b class="fn-pct">${pc}%</b></td></tr>`).join('')}</tbody></table>
          <ul class="fn-rules"><li>${esc(A.first)}</li><li>${esc(A.continue)}</li><li>${esc(A.discipline)}</li></ul></div></section></div></div>`;
    const cards = `<div class="fn-cards">${[...T.groupB.bands.map(b => ['تفوق الثانوية', T.groupB.label, b]), ...T.groupA.bands.map(b => ['تفوق الثانوية', T.groupA.label, b])].map(([k, l, [lo, hi, pc]]) =>
      `<div class="fn-card"><div class="fn-card-h"><span class="fn-deg">${k}</span><small>${esc(l)}</small></div><div class="fn-card-price"><b>${pc}%</b><span>من الرسوم الدراسية</span></div><ul><li><i class="bi bi-bar-chart"></i> معدل ${hi >= 100 ? `${lo}% فأكثر` : `${lo}% – ${hi}%`}</li><li><i class="bi bi-calendar3"></i> عام دراسي كامل</li><li><i class="bi bi-arrow-repeat"></i> بمعدل ${T.keep_gpa[String(pc)]} للاستمرار</li></ul></div>`).join('')}
      ${A.bands.map(([lo, hi, pc]) => `<div class="fn-card"><div class="fn-card-h"><span class="fn-deg m">تفوق أكاديمي</span><small>كل فصل</small></div><div class="fn-card-price"><b>${pc}%</b><span>من الرسوم الدراسية</span></div><ul><li><i class="bi bi-bar-chart"></i> معدل ${lo === hi ? lo.toFixed(2) : `${lo.toFixed(2)} – ${hi.toFixed(2)}`}</li><li><i class="bi bi-journal-check"></i> بعد اجتياز 30 ساعة</li></ul></div>`).join('')}</div>`;
    $('#fn-grants').innerHTML = `
      ${kpis([['100%', 'أعلى منحة تفوق', 'bi-trophy', 'good', 'للمعدل 95% فأكثر أو التراكمي 4.00'], ['3', 'شرائح للتفوق الأكاديمي', 'bi-mortarboard', '', '25% · 50% · 100%'], ['30', 'ساعة قبل أول منحة أكاديمية', 'bi-journal-check'], [G.excluded_majors.length, 'تخصصان لا يخضعان للمنح', 'bi-slash-circle', 'bad']])}
      <div class="fn-alert"><i class="bi bi-exclamation-circle-fill"></i> ${esc(G.excluded_note)}</div>
      <div class="row g-3 mb-3 no-print">
        <div class="col-lg-6"><section class="card h-100 fn-check"><div class="card-header fw-bold"><i class="bi bi-ui-checks"></i> هل أستحق منحة تفوق الثانوية العامة؟</div><div class="card-body d-grid gap-2">
          <div class="row g-2"><div class="col-7"><label class="small fw-bold" for="g-fac">التخصص (بكالوريوس)</label><select class="form-select form-select-sm" id="g-fac"><option value="">اختر…</option>${facs().map(f => `<optgroup label="${esc(f)}">${progs.filter(p => p.faculty === f).map(p => `<option value="${p.id}" ${String(p.id) === gs.fac ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
            <div class="col-5"><label class="small fw-bold" for="g-avg">معدل الثانوية %</label><input type="number" step="0.1" min="0" max="100" class="form-control form-control-sm" id="g-avg" value="${esc(gs.avg)}"></div></div>${tRes}</div></section></div>
        <div class="col-lg-6"><section class="card h-100 fn-check"><div class="card-header fw-bold"><i class="bi bi-ui-checks"></i> هل أستحق منحة التفوق الأكاديمي؟</div><div class="card-body d-grid gap-2">
          <div class="row g-2"><div class="col-6"><label class="small fw-bold" for="g-gpa">المعدل التراكمي</label><input type="number" step="0.01" min="0" max="4" class="form-control form-control-sm" id="g-gpa" value="${esc(gs.gpa)}"></div>
            <div class="col-6"><label class="small fw-bold" for="g-pass">الساعات المجتازة في الجامعة</label><input type="number" min="0" class="form-control form-control-sm" id="g-pass" value="${esc(gs.passed)}"></div></div>
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="g-disc" ${gs.disc ? 'checked' : ''}> صدرت بحقي عقوبة تأديبية (إنذار فأكثر)</label>${aRes}</div></section></div></div>
      <div class="fn-head"><h2><i class="bi bi-gift"></i> جداول المنح</h2>${views('fn-gv', [['tables', 'bi-table', 'جداول'], ['cards', 'bi-grid-1x2', 'بطاقات']], gs.view)}</div>
      ${gs.view === 'cards' ? cards : tables}
      <section class="card mt-3"><div class="card-body small"><i class="bi bi-journal-text"></i> <b>التعليمات:</b> ${esc(G.instructions)}. ولمعرفة تفاصيل منح التفوق الفني والتفوق الرياضي ومنح التشغيل كما تذكر الصفحة الرسمية:
        <a href="${esc(D.sources.brochure)}" target="_blank" rel="noopener">بروشور المنح</a> · <a href="${esc(D.sources.regulations)}" target="_blank" rel="noopener">دليل أنظمة الجامعة وتعليماتها</a></div></section>
      <div class="fn-disclaimer"><i class="bi bi-exclamation-triangle-fill"></i> الفحص استرشادي؛ قرار المنحة تصدره الجامعة وفق تعليماتها. لا يُحفظ ولا يُرسل أي شيء تُدخله هنا.</div>
      ${src([['grants', 'المنح الأكاديمية – دائرة القبول والتسجيل'], ['brochure', 'بروشور المنح الدراسية ومنح المساعدة والمنح التشجيعية']])}`;
    $('#fn-grants').insertAdjacentHTML('afterbegin', review(['grants']));
    let t; const later = (k, id) => e => { clearTimeout(t); t = setTimeout(() => { gs[k] = e.target.value; grants(); const el = $(id); el.focus(); }, 450); };
    $('#g-fac').addEventListener('change', e => { gs.fac = e.target.value; grants(); });
    $('#g-avg').addEventListener('input', later('avg', '#g-avg'));
    $('#g-gpa').addEventListener('input', later('gpa', '#g-gpa'));
    $('#g-pass').addEventListener('input', later('passed', '#g-pass'));
    $('#g-disc').addEventListener('change', e => { gs.disc = e.target.checked; grants(); });
    document.querySelectorAll('#fn-gv button').forEach(b => b.addEventListener('click', () => { gs.view = b.dataset.v; keep('grants-view', gs.view); grants(); }));
  }

  /* ---------------------------------------------------------------- payments.html */
  // the questions and answers of «معلومات مالية هامة», word for word, grouped by subject
  const CAT = [['reg', 'التسجيل', '#901d23', /التسجيل/], ['pay', 'الدفع', '#0b4a66', /الدفع|الشيكات|الرسوم اثناء/], ['fees', 'الرسوم', '#0f766e', /المواصلات|التأمين|امتحانات المستوى|وثيقة/],
    ['exam', 'الامتحانات', '#6d28d9', /بطاقة دخول/], ['house', 'السكن', '#be185d', /السكن/], ['leave', 'الانسحاب والتخرج', '#475569', /براءة|الانسحاب|انقطاع/]];
  const ICON = [[/التسجيل المبكر وكيف/, 'bi-calendar-check'], [/بعد انتهاء/, 'bi-hourglass-split'], [/المواصلات/, 'bi-bus-front'], [/طرق الدفع/, 'bi-credit-card'], [/الشيكات/, 'bi-bank'],
    [/الدوام/, 'bi-clock'], [/وثيقة/, 'bi-file-earmark-text'], [/امتحانات المستوى/, 'bi-clipboard-check'], [/التأمين/, 'bi-shield-lock'], [/بطاقة/, 'bi-card-heading'],
    [/الاشتراك في السكن/, 'bi-house-heart'], [/عدم تجديد/, 'bi-house-dash'], [/براءة/, 'bi-patch-check'], [/انقطاع/, 'bi-box-arrow-right']];
  const catOf = q => CAT.find(c => c[3].test(q)) || CAT[1];
  const iconOf = q => (ICON.find(([re]) => re.test(q)) || [0, 'bi-question-circle'])[1];
  const links = x => x.links.length ? `<div class="fn-links">${x.links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> ${esc(l.text)}</a>`).join('')}</div>` : '';
  const ps = { view: remember('pay-view', 'cards'), q: '', cat: '' };
  function pay() {
    const Y = D.payment, T = TR();
    const q = norm(ps.q.trim()), list = D.faq.filter(x => (!q || norm(x.q + ' ' + x.a).includes(q)) && (!ps.cat || catOf(x.q)[0] === ps.cat));
    const body = {
      cards: `<div class="fn-pay-cards">${list.map(x => { const c = catOf(x.q); return `<section class="fn-pay" style="--c:${c[2]}"><div class="fn-pay-h"><i class="bi ${iconOf(x.q)}"></i><b>${esc(x.q)}</b><small>${c[1]}</small></div><p>${verbatim(x.a)}</p>${links(x)}</section>`; }).join('')}</div>`,
      faq: `<div class="accordion fn-faq" id="fn-faq">${list.map((x, n) => `<div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button ${n ? 'collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#fq${n}"><i class="bi ${iconOf(x.q)} ms-2"></i> ${esc(x.q)}</button></h3>
        <div id="fq${n}" class="accordion-collapse collapse ${n ? '' : 'show'}" data-bs-parent="#fn-faq"><div class="accordion-body">${verbatim(x.a)}${links(x)}</div></div></div>`).join('')}</div>`,
      table: `<div class="card"><div class="table-responsive"><table class="table align-middle mb-0 tt-table"><thead><tr><th style="width:28%">السؤال</th><th>الجواب كما نشرته الدائرة المالية</th><th>الموضوع</th></tr></thead><tbody>
        ${list.map(x => `<tr><td><b><i class="bi ${iconOf(x.q)}"></i> ${esc(x.q)}</b></td><td>${verbatim(x.a)}${links(x)}</td><td><span class="fn-cat" style="--c:${catOf(x.q)[2]}">${catOf(x.q)[1]}</span></td></tr>`).join('')}</tbody></table></div></div>`,
      steps: `<ol class="fn-steps">${[['bi-calendar-check', 'التسجيل المبكر', faq('التسجيل المبكر وكيف')], ['bi-hourglass-split', 'بعد التسجيل المبكر', faq('بعد انتهاء فترة التسجيل المبكر')],
        ['bi-bus-front', 'المواصلات (لمن يشترك)', faq('المواصلات')], ['bi-credit-card', 'الدفع', faq('طرق الدفع')], ['bi-card-heading', 'بطاقة دخول الامتحان النهائي', faq('بطاقة دخول')],
        ['bi-patch-check', 'التخرج', faq('براءة الذمة')], ['bi-shield-lock', 'التأمين المسترد', faq('التأمين')]].filter(x => x[2])
        .map(([i, h, t]) => `<li><span class="fn-step-i"><i class="bi ${i}"></i></span><div><b>${esc(h)}</b><p>${verbatim(t)}</p></div></li>`).join('')}</ol>`,
    }[ps.view] || '';
    $('#fn-pay').innerHTML = `${review(['finance'])}
      ${kpis([[Y.early_pct + '%', 'من رسوم الساعات في التسجيل المبكر', 'bi-calendar-check'], [Y.late_pct + '%', 'من رسوم الساعات عند التسجيل بعد المبكر', 'bi-hourglass-split', 'warn', 'للطالب القديم، والباقي قبل النهائي'],
        [T.regular, 'د.أ مواصلات لكل فصل اعتيادي', 'bi-bus-front', '', `${T.regular_first} لطالب أول فصل`], [D.faq.length, 'سؤالاً وجواباً من الدائرة المالية', 'bi-question-circle', 'good']])}
      <div class="card mb-3 no-print"><div class="card-body fn-bar-row">
        <div class="flex-grow-1"><label class="small fw-bold" for="py-q">بحث</label><input class="form-control form-control-sm" id="py-q" value="${esc(ps.q)}" placeholder="شيك، مواصلات، تأمين، امتحان…"></div>
        <div><label class="small fw-bold" for="py-cat">الموضوع</label><select class="form-select form-select-sm" id="py-cat"><option value="">كل المواضيع</option>${CAT.map(c => `<option value="${c[0]}" ${c[0] === ps.cat ? 'selected' : ''}>${c[1]}</option>`).join('')}</select></div>
        ${views('fn-pv', [['cards', 'bi-grid-1x2', 'بطاقات'], ['faq', 'bi-question-circle', 'أسئلة وأجوبة'], ['table', 'bi-table', 'جدول'], ['steps', 'bi-signpost-split', 'خطوات الفصل']], ps.view)}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="py-print"><i class="bi bi-printer"></i> طباعة</button></div></div>
      ${body}
      <section class="card mt-3"><div class="card-header fw-bold"><i class="bi bi-receipt"></i> ${esc(D.fixed.title)}</div><div class="card-body fn-fixed">${D.fixed.items.map(f => `<div class="fn-pair"><span>${esc(f.text)}</span></div>`).join('')}
        <small class="text-muted"><a href="fees.html">أسعار الساعات لكل تخصص</a> · <a href="tuition.html">حاسبة الرسوم</a></small></div></section>
      ${src([['finance', 'معلومات مالية هامة – دائرة الشؤون المالية'], ['fees', 'التخصصات المطروحة والرسوم'], ['calendar', 'التقويم الجامعي']])}`;
    let t; $('#py-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ps.q = e.target.value; pay(); const i = $('#py-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#py-cat').addEventListener('change', e => { ps.cat = e.target.value; pay(); });
    document.querySelectorAll('#fn-pv button').forEach(b => b.addEventListener('click', () => { ps.view = b.dataset.v; keep('pay-view', ps.view); pay(); }));
    $('#py-print').addEventListener('click', () => printReport({ title: 'معلومات مالية هامة', subtitle: 'جامعة البترا · دائرة الشؤون المالية', orientation: 'portrait',
      sections: [{ columns: ['السؤال', 'الجواب كما نشرته الدائرة المالية'], rows: list.map(x => [x.q, x.a]), widths: ['28%', '72%'] }], note: D.note + ' ' + D.sources.finance }));
  }

  U.getJSON('data/finance.json').then(d => {
    D = d;
    U.updatedLine(d.updated, 'من الموقع الرسمي للجامعة · أسعار ' + d.year);
    const top = $('#pg-q');
    if (top) top.addEventListener('input', e => {
      if (APP === 'fn-fees') { st.q = e.target.value; const i = $('#fn-q'); if (i) i.value = st.q; fees(); }
      else if (APP === 'fn-pay') { ps.q = e.target.value; pay(); }
    });
    ({ 'fn-fees': fees, 'fn-calc': calc, 'fn-grants': grants, 'fn-pay': pay }[APP] || (() => {}))();
  }).catch(() => { const el = document.getElementById(APP); if (el) el.innerHTML = '<div class="alert alert-warning">تعذّر تحميل بيانات الرسوم. أعد المحاولة بعد قليل.</div>'; });
})();
