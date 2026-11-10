/* «المالية»: four pages built from data/finance.json (copied from the university's official pages, with their links):
   fees.html (programmes and credit-hour prices), tuition.html (fees calculator), grants.html (excellence grants and an
   eligibility check), payments.html (paying, registration, refunds and clearance). Nothing typed here leaves the browser. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const JD = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' د.أ';
  const num = n => Number(n).toLocaleString('en-US');
  const APP = ['fn-fees', 'fn-calc', 'fn-grants', 'fn-pay', 'fn-staff'].find(id => document.getElementById(id));
  // ---- access gate: the finance pages open only after signing in, with the same account as the research pages
  // (one sign-in opens both; the hash below is the same as in research.js and exams.js)
  const GATE = '15d12ce11e3c3bda9774ef2909a61065e35cedc2a575fa63a9632d0df823aa1a';
  const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const authed = () => { try { return localStorage.getItem('rs-auth') === GATE || sessionStorage.getItem('rs-auth') === GATE; } catch (e) { return false; } };
  const gate = new Promise(res => {
    if (authed()) { res(); return; }
    document.documentElement.classList.add('fn-locked');
    document.head.insertAdjacentHTML('beforeend', `<style id="fn-gate-css">
      html.fn-locked main, html.fn-locked .uop-hero { visibility: hidden; }
      .fn-gate { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 16px; background: radial-gradient(circle at 50% 30%, rgba(144,29,35,.92), rgba(9,27,34,.97)); backdrop-filter: blur(4px); }
      .fn-gate .box { width: min(100%, 400px); background: #fff; border-radius: 18px; padding: 1.6rem 1.5rem; box-shadow: 0 20px 60px rgba(0,0,0,.35); display: flex; flex-direction: column; gap: .7rem; text-align: center; color: #091b22; }
      .fn-gate .ic { width: 64px; height: 64px; margin: 0 auto; border-radius: 50%; background: #f8e3e5; color: #901d23; display: grid; place-items: center; font-size: 1.8rem; }
      .fn-gate h2 { font-size: 1.3rem; font-weight: 800; margin: 0; } .fn-gate p { color: #4f5e64; font-size: .92rem; margin: 0; }
      .fn-gate label { text-align: start; font-weight: 700; font-size: .9rem; display: flex; flex-direction: column; gap: .25rem; }
      .fn-gate .rem { flex-direction: row; align-items: center; gap: .4rem; font-weight: 600; }
      .fn-gate .err { background: #fde7e4; color: #a02a1c; border-radius: 10px; padding: .45rem; font-size: .88rem; font-weight: 700; }
      .fn-gate .go { background: #901d23; color: #fff; border: 0; border-radius: 10px; padding: .6rem; font-weight: 700; } .fn-gate .back { font-size: .88rem; color: #4f5e64; }
    </style>`);
    const show = () => {
      const d = document.createElement('div'); d.className = 'fn-gate'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = `<form class="box" autocomplete="on"><div class="ic"><i class="bi bi-shield-lock-fill"></i></div><h2>المالية — دخول</h2><p>هذا القسم متاح للمخوّلين فقط. أدخل اسم المستخدم وكلمة المرور.</p>
        <label>اسم المستخدم<input name="u" class="form-control" autocomplete="username" required dir="ltr"></label>
        <label>كلمة المرور<input name="p" type="password" class="form-control" autocomplete="current-password" required dir="ltr"></label>
        <label class="rem"><input type="checkbox" name="r" checked> تذكّرني على هذا الجهاز</label>
        <div class="err" hidden><i class="bi bi-exclamation-triangle-fill"></i> اسم المستخدم أو كلمة المرور غير صحيحة</div>
        <button class="go" type="submit"><i class="bi bi-box-arrow-in-left"></i> دخول</button>
        <a class="back" href="index.html"><i class="bi bi-arrow-right"></i> العودة إلى الصفحة الرئيسية</a></form>`;
      document.body.appendChild(d);
      const f = d.querySelector('form'); f.u.focus();
      f.onsubmit = async e => {
        e.preventDefault();
        if (await sha('uopstaff-research|' + f.u.value.trim() + '|' + f.p.value) !== GATE) { d.querySelector('.err').hidden = false; f.p.value = ''; f.p.focus(); return; }
        try { (f.r.checked ? localStorage : sessionStorage).setItem('rs-auth', GATE); } catch (e2) { /* storage blocked: this visit only */ }
        d.remove(); document.documentElement.classList.remove('fn-locked'); res();
      };
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  });
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
  const PART = { fees: 'التخصصات والرسوم', finance: 'معلومات مالية هامة', grants: 'المنح الأكاديمية', docs: 'دليل القوانين والأنظمة والتعليمات', 'staff:grants_work': 'تعليمات المنح والتشغيل', 'staff:salaries': 'تعليمات الرواتب والعلاوات', 'staff:overtime_faculty': 'تعليمات العمل الإضافي لأعضاء الهيئة التدريسية', 'staff:overtime_staff': 'تعليمات العمل الإضافي للعاملين', 'staff:travel': 'تعليمات الانتقال والسفر' };
  // a source the reader could not match: its last good copy is shown, with a clear note and the official link
  // one notice for the page: «could not reach» (amber) differs from «the official text changed» (red)
  const review = parts => {
    const L = (D.review || []).filter(r => parts.includes(r.part)); if (!L.length) return '';
    const changed = L.some(r => r.kind !== 'fetch'), since = L.map(r => r.since).sort()[0];
    const pages = L.map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(PART[r.part] || r.part)} <i class="bi bi-box-arrow-up-left"></i></a>`).join(' · ');
    return `<div class="fn-review ${changed ? '' : 'soft'}"><i class="bi ${changed ? 'bi-exclamation-octagon-fill' : 'bi-cloud-slash'}"></i><div>
      <b>${changed ? 'تغيّر نص منشور على الموقع الرسمي' : 'تعذّر التحقق من الموقع الرسمي في آخر تحديث'} (منذ ${esc(U.numDate(since))})</b>
      <span>${changed ? 'يُعرض هنا آخر نص مطابق قُرئ قبل التغيير؛ راجع الصفحة الرسمية قبل الاعتماد على الأرقام:' : 'الأرقام المعروضة هي آخر نسخة مطابقة نُقلت من الصفحة الرسمية، وستُحدَّث تلقائياً عند نجاح الاتصال:'} ${pages}</span></div></div>`;
  };
  const verbatim = t => esc(t).replace(/\n/g, '<br>');
  // the inputs of a tool in one bar across the page, the results under it at full width
  const inbar = (form, title) => `<section class="card fn-inbar no-print"><div class="fn-inbar-h"><span><i class="bi bi-sliders"></i> ${title || 'بياناتك'}</span><small><i class="bi bi-shield-lock"></i> لا يُحفظ ولا يُرسل أي شيء تُدخله هنا</small></div><div class="fn-inbar-g">${form}</div></section>`;
  // official text, one clause per row: the clause's own number on the side, the words as published
  const LBL = /^((?:المادة\s*\(\d+\)\s*:?\s*)(?:[أ-ي]\s*\.\s*)?|[أ-ي]\s*\.\s*|\d+\s*\.\s*)/;
  const legal = (title, items, o = {}) => `<details class="fn-legal ${o.cls || ''}" ${o.open ? 'open' : ''}><summary><i class="bi ${o.icon || 'bi-journal-text'}"></i><b>${esc(title)}</b>
      <span class="fn-legal-n">${items.length} ${items.length > 10 ? 'بنداً' : 'بنود'}</span>${o.badge || ''}<i class="bi bi-chevron-down fn-legal-c"></i></summary>
      <ol class="fn-legal-l">${items.map(t => { const m = String(t).match(LBL), lab = m ? m[1].replace(/\s*:\s*$/, '').trim() : '', body = m ? String(t).slice(m[0].length) : String(t);
        return `<li><span class="fn-legal-k">${esc(lab) || '<i class="bi bi-dot"></i>'}</span><span class="fn-legal-t">${esc(body)}</span></li>`; }).join('')}</ol>
      ${o.link ? `<div class="fn-legal-f">${o.link}</div>` : ''}</details>`;

  /* ---------------------------------------------------------------- the academic calendar (data/calendar.json, read from the official PDF) */
  let CAL = null;
  const T_WORD = { first: 'الأول', second: 'الثاني', summer: 'الصيفي' };
  const TODAY = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);  // Amman
  const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
  const nDays = n => U.count(n, 'يوم واحد', 'يومين', 'أيام', 'يوماً');
  const when = e => { const t = TODAY(), a = dayDiff(e.start, t), b = dayDiff(e.end || e.start, t);
    return a > 0 ? { k: 'soon', txt: a === 1 ? 'غداً' : `بعد ${nDays(a)}`, n: a } : b >= 0 ? { k: 'now', txt: b === 0 ? 'اليوم آخر يوم' : `جارٍ · يبقى ${nDays(b)}`, n: 0 } : { k: 'past', txt: 'انتهى', n: a }; };
  const dRange = e => e.end && e.end !== e.start ? `من ${U.numDate(e.start)} إلى ${U.numDate(e.end)}` : U.numDate(e.start);
  function termInfo(key) {
    const sems = (CAL && CAL.semesters) || [], s = sems.find(x => x.key === key); if (!s) return null;
    const ev = re => s.events.find(e => re.test(e.title)), evs = re => s.events.filter(e => re.test(e.title));
    const lastReg = ev(/آخر موعد لتسجيل الطلبة القدامى/), earlyRe = new RegExp('بدء التسجيل المبكر للفصل الدراسي ' + T_WORD[key]);
    const early = sems.flatMap(x => x.events).filter(e => earlyRe.test(e.title) && (!lastReg || e.start <= lastReg.start)).sort((a, b) => (a.start < b.start ? 1 : -1))[0];
    return { s, early, lastReg, dropAdd: ev(/السحب والإضافة/), teach: ev(/^بدء التدريس/), fines: evs(/غرامة التسجيل المتأخر/), withdraw: evs(/فترة الانسحاب/),
      card: ev(/بطاقة دخول الامتحانات النهائية/), finals: ev(/فترة الامتحانات النهائية/) };
  }
  const termNow = () => { const sems = (CAL && CAL.semesters) || [], t = TODAY(); return (sems.find(s => { const f = termInfo(s.key).finals; return (f ? f.end : s.end) >= t; }) || sems[sems.length - 1] || {}).key || 'first'; };
  // financial dates of a semester, in the calendar's own words
  const FIN_RE = /التسجيل المبكر|السحب والإضافة|تسجيل الطلبة القدامى|غرامة|الانسحاب|بطاقة دخول|الامتحانات النهائية|بدء التدريس/;
  const finEvents = key => { const ti = termInfo(key); if (!ti) return []; const L = ti.s.events.filter(e => FIN_RE.test(e.title)); if (ti.early && !L.includes(ti.early)) L.unshift(ti.early); return L.sort((a, b) => (a.start < b.start ? -1 : 1)); };
  function icsFile(name, items) {
    const d = x => x.replace(/-/g, ''), next = x => { const t = new Date(x + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10).replace(/-/g, ''); };
    const ei = x => String(x).replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'), fold = l => (l.match(/.{1,36}/gu) || ['']).join('\r\n ');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UoP Compass//finance//AR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + ei(name.replace(/\.ics$/, '')),
      ...items.flatMap((e, i) => ['BEGIN:VEVENT', `UID:fin-${d(e.start)}-${i}-${e.id || ''}@marafah.github.io`, 'DTSTAMP:' + stamp, `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${next(e.end || e.start)}`,
        'SUMMARY:' + ei(e.title), ...(e.desc ? ['DESCRIPTION:' + ei(e.desc)] : []), 'END:VEVENT'])].map(fold);
    U.download(name, L.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
  }
  // a printable, shareable summary card (only what the reader chose and the published numbers)
  function costCard(title, sub, big, rows, link) {
    const html = `<div class="fn-cc" id="fn-cc"><div class="fn-cc-h"><img src="assets/logo.png" alt=""><div><b>بوصلة البترا</b><small>المالية · ${esc(title)}</small></div></div>
      <div class="fn-cc-big"><small>${esc(sub)}</small><b>${esc(big)}</b></div>
      <table class="fn-cc-t">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="fn-cc-f">أسعار ${esc(D.year)} كما نشرتها جامعة البترا على موقعها الرسمي · أُعدّت في ${esc(U.numDate(TODAY()))}<br><span dir="ltr">${esc(link)}</span></div></div>
      <div class="d-flex flex-wrap gap-2 mt-3 no-print"><button type="button" class="btn btn-sm btn-maroon" id="fn-cc-print"><i class="bi bi-printer"></i> طباعة البطاقة / PDF</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="fn-cc-copy"><i class="bi bi-link-45deg"></i> نسخ الرابط</button>${navigator.share ? '<button type="button" class="btn btn-sm btn-outline-secondary" id="fn-cc-share"><i class="bi bi-share"></i> مشاركة</button>' : ''}</div>`;
    U.modal('<i class="bi bi-person-vcard"></i> بطاقة الكلفة', html);
    $('#fn-cc-print').addEventListener('click', () => { const w = document.createElement('div'); w.id = 'fn-ccp'; w.innerHTML = $('#fn-cc').outerHTML; document.body.appendChild(w); document.body.classList.add('fn-pc');
      const done = () => { document.body.classList.remove('fn-pc'); w.remove(); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); setTimeout(done, 60000); });
    $('#fn-cc-copy').addEventListener('click', e => navigator.clipboard && navigator.clipboard.writeText(link).then(() => { e.target.closest('button').innerHTML = '<i class="bi bi-check2"></i> نُسخ'; }));
    const sh = $('#fn-cc-share'); if (sh) sh.addEventListener('click', () => navigator.share({ title: 'بطاقة الكلفة – بوصلة البترا', text: `${sub}: ${big}`, url: link }).catch(() => {}));
  }

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
    sems: +P.get('sems') || 0, sums: P.get('sums') == null ? 2 : +P.get('sums'), term: P.get('term') || '', dh: 0,
    cmp: (P.get('cmp') || '').split(',').map(Number).filter(Boolean).slice(0, 3), cmsb: +P.get('cmsb') || 8, cmsm: +P.get('cmsm') || 4 };
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
  // ---- payment plan of one semester: what is due and by which date of the academic calendar
  function planRows(p, r) {
    const ti = termInfo(cs.term), rows = [];
    if (!ti) return rows;
    if (r.late) {
      rows.push({ e: ti.lastReg, what: `عند التسجيل: ${D.payment.late_pct}% من رسوم الساعات مع رسوم التسجيل والخدمات`, amount: r.now, note: faq('بعد انتهاء فترة التسجيل المبكر'), when: 'حتى آخر موعد لتسجيل الطلبة القدامى' });
      rows.push({ e: ti.card, what: 'الباقي من رسوم الساعات: قبل دخول الامتحانات النهائية', amount: r.later, note: faq('بطاقة دخول'), when: ti.card ? ti.card.title : '' });
    } else {
      rows.push({ e: cs.pay === 'early' && ti.early ? ti.early : ti.lastReg, what: cs.pay === 'early' ? `التسجيل المبكر: ${D.payment.early_pct}% من رسوم الساعات مع رسوم التسجيل والخدمات` : 'عند التسجيل: كامل الرسوم',
        amount: r.total, note: faq(cs.pay === 'early' ? 'التسجيل المبكر وكيف' : 'بعد انتهاء فترة التسجيل المبكر'), when: cs.pay === 'early' && ti.early ? ti.early.title : 'حتى آخر موعد لتسجيل الطلبة القدامى' });
    }
    ti.fines.forEach(e => rows.push({ e, what: e.title, amount: 0, note: 'غرامة منشورة في التقويم الجامعي، لا تدخل في المجموع أعلاه.', fine: true }));
    return rows;
  }
  function planHTML(p, r) {
    const ti = termInfo(cs.term);
    if (!ti) return '';
    const rows = planRows(p, r);
    return `<section class="card mt-3 fn-plan"><div class="card-header fw-bold fn-ch d-flex align-items-center gap-2"><span><i class="bi bi-calendar2-week"></i> مخطِّط الدفع <small>${esc(ti.s.name)} ${esc(CAL.year || '')} · من التقويم الجامعي</small></span>
        <button type="button" class="btn btn-sm btn-outline-secondary ms-auto no-print" id="c-ics"><i class="bi bi-calendar-plus"></i> أضف إلى تقويمي (.ics)</button></div>
      <div class="card-body"><ol class="fn-steps fn-pay-steps">${rows.map(x => { const w = x.e ? when(x.e) : null; return `<li class="${x.fine ? 'fine' : ''} ${w ? w.k : ''}"><span class="fn-step-i"><i class="bi ${x.fine ? 'bi-exclamation-triangle' : 'bi-cash-coin'}"></i></span><div>
          <div class="d-flex flex-wrap gap-2 align-items-baseline"><b>${esc(x.what)}</b>${x.amount ? `<span class="fn-amt">${JD(x.amount)}</span>` : ''}</div>
          <div class="fn-when">${x.e ? `<i class="bi bi-calendar-event"></i> ${esc(dRange(x.e))}${x.when && x.when !== x.e.title ? ' · ' + esc(x.when) : ''}${x.e && x.when === x.e.title ? ' · ' + esc(x.e.title) : ''} <span class="fn-cd ${w.k}">${esc(w.txt)}</span>` : 'الموعد غير منشور في التقويم الجامعي'}</div>
          ${x.note ? `<p>${esc(x.note)}</p>` : ''}</div></li>`; }).join('')}</ol></div></section>`;
  }
  // ---- adding or dropping courses in the drop/add period: hours × the hour's price, less the grant if any
  function dropHTML(p, r) {
    const ti = termInfo(cs.term), price = r.price, nh = cs.h + cs.dh, diff = cs.dh * price, disc = Math.round(diff * r.gr.pct) / 100;
    return `<section class="card mt-3 fn-drop"><div class="card-header fw-bold fn-ch"><i class="bi bi-arrow-left-right"></i> سحب وإضافة مادة <small>${ti && ti.dropAdd ? `فترة السحب والإضافة: ${esc(dRange(ti.dropAdd))} <span class="fn-cd ${when(ti.dropAdd).k}">${esc(when(ti.dropAdd).txt)}</span>` : ''}</small></div>
      <div class="card-body"><div class="row g-3 align-items-end"><div class="col-sm-4"><label class="small fw-bold" for="c-dh">الساعات المضافة (+) أو المسحوبة (−)</label><input type="number" step="1" min="${-cs.h}" max="24" class="form-control form-control-sm" id="c-dh" value="${cs.dh}"></div>
        <div class="col-sm-8"><div class="fn-split fn-split-l"><div><small>الساعات بعد التعديل</small><b>${nh}</b></div><div><small>فرق رسوم الساعات</small><b>${diff < 0 ? '−' : diff > 0 ? '+' : ''}${JD(Math.abs(diff))}</b></div>
          ${r.gr.pct ? `<div><small>بعد المنحة ${r.gr.pct}%</small><b>${diff < 0 ? '−' : diff > 0 ? '+' : ''}${JD(Math.abs(diff - disc))}</b></div>` : ''}<div><small>رسوم الفصل بعد التعديل</small><b>${JD(r.total + diff - disc)}</b></div></div></div></div>
        <p class="fn-formula"><i class="bi bi-calculator"></i> ${Math.abs(cs.dh)} ساعة × ${price} د.أ سعر الساعة في ${esc(progName(p))}. رسوم التسجيل والخدمات لا تتغير بعدد الساعات.</p>
        ${ti && ti.withdraw.length ? `<div class="fn-wd mt-2"><b class="small">الانسحاب من الفصل كما ينشره التقويم الجامعي:</b><ul class="fn-cond mt-1 mb-0">${ti.withdraw.map(e => `<li><i class="bi bi-box-arrow-right"></i><span><b>${esc(e.title)}</b>${e.note ? ' – ' + esc(e.note) : ''} · ${esc(dRange(e))} <span class="fn-cd ${when(e).k}">${esc(when(e).txt)}</span></span></li>`).join('')}</ul></div>` : ''}</div></section>`;
  }
  // ---- comparing up to three programmes: the plan's cost at today's prices, and the Tawjihi excellence grant on its hours
  function planFor(p, sems, sums, pct) {
    const fx = Object.fromEntries(D.fixed.items.map(f => [f.key, f])), price = p.price, tuition = p.hours * price, disc = Math.round(tuition * pct) / 100;
    const reg = sems * (fx.registration.regular + fx.services.regular), sum = sums * (fx.registration.summer + fx.services.summer), adm = fx.application.once + (p.degree === 'بكالوريوس' ? fx.placement.once : 0);
    const grad = p.degree === 'ماجستير' ? D.masters.thesis_defense : 0, gross = tuition + reg + sum + adm + grad;
    return { price, tuition, disc, reg, sum, adm, grad, gross, total: gross - disc };
  }
  const cmpData = () => cs.cmp.map(id => D.programs.find(x => x.id === id)).filter(Boolean).map(p => {
    const sems = p.degree === 'ماجستير' ? cs.cmsm : cs.cmsb, a = parseFloat(cs.avg);
    const g = p.degree !== 'بكالوريوس' ? { pct: 0, txt: 'لا تنطبق (منحة للبكالوريوس)' } : isExcluded(p) ? { pct: 0, txt: 'تخصص لا يخضع للمنح' } : !(a > 0) ? { pct: 0, txt: 'أدخل معدل الثانوية' } : (() => { const t = tawjihiPct(p, a); return { pct: t.pct, txt: t.pct ? `${t.pct}% (${t.group})` : 'دون الحد الأدنى' }; })();
    return { p, sems, g, c: planFor(p, sems, cs.sums, g.pct) };
  });
  const CMP_ROWS = [['الكلية', x => x.p.faculty], ['الساعات المعتمدة', x => String(x.p.hours)], ['سعر الساعة', x => JD(x.p.price)], ['رسوم ساعات الخطة', x => JD(x.c.tuition)],
    ['التسجيل والخدمات', x => `${JD(x.c.reg + x.c.sum)} (${x.sems} اعتيادي و${cs.sums} صيفي)`], ['رسوم عند القبول', x => JD(x.c.adm)], ['رسوم مناقشة الرسالة', x => x.c.grad ? JD(x.c.grad) : '—'],
    ['المجموع قبل المنحة', x => JD(x.c.gross)], ['منحة تفوق الثانوية', x => x.g.txt], ['المنحة على ساعات الخطة', x => x.c.disc ? '−' + JD(x.c.disc) : '—'], ['المجموع بعد المنحة', x => JD(x.c.total)]];
  function cmpHTML() {
    const C = cmpData(), opts = cur => facs().map(f => `<optgroup label="${esc(f)}">${D.programs.filter(x => x.faculty === f).map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(progName(x))} – ${x.price} د.أ</option>`).join('')}</optgroup>`).join('');
    const low = C.length > 1 ? Math.min(...C.map(x => x.c.total)) : null;
    return `<section class="card fn-form no-print mb-3"><div class="card-body"><div class="row g-2 align-items-end">
        ${[0, 1, 2].map(i => `<div class="col-lg-3 col-md-6"><label class="small fw-bold">التخصص ${i + 1}</label><select class="form-select form-select-sm c-cmp" data-i="${i}">${i ? '<option value="0">— بلا —</option>' : ''}${opts(cs.cmp[i])}</select></div>`).join('')}
        <div class="col-lg-3 col-md-6"><label class="small fw-bold" for="c-cavg">معدل الثانوية العامة %</label><input type="number" step="0.1" min="0" max="100" class="form-control form-control-sm" id="c-cavg" value="${esc(cs.avg)}" placeholder="لحساب منحة التفوق"></div>
        <div class="col-md-3 col-6"><label class="small fw-bold" for="c-cmsb">فصول البكالوريوس الاعتيادية</label><input type="number" min="1" max="20" class="form-control form-control-sm" id="c-cmsb" value="${cs.cmsb}"></div>
        <div class="col-md-3 col-6"><label class="small fw-bold" for="c-cmsm">فصول الماجستير الاعتيادية</label><input type="number" min="1" max="12" class="form-control form-control-sm" id="c-cmsm" value="${cs.cmsm}"></div>
        <div class="col-md-3 col-6"><label class="small fw-bold" for="c-sums">الفصول الصيفية</label><input type="number" min="0" max="10" class="form-control form-control-sm" id="c-sums" value="${cs.sums}"></div>
        <div class="col-md-3 col-6 d-flex gap-2"><button type="button" class="btn btn-sm btn-maroon flex-fill" id="c-cmp-print"><i class="bi bi-printer"></i> طباعة</button><button type="button" class="btn btn-sm btn-outline-secondary flex-fill" id="c-link"><i class="bi bi-link-45deg"></i> الرابط</button></div></div></div></section>
      <div class="fn-cmp-cols" style="--n:${C.length}">${C.map(x => `<section class="fn-cmp-c ${x.c.total === low ? 'low' : ''}"><div class="fn-cmp-h"><small>${esc(x.p.degree)}</small><b>${esc(x.p.name)}</b>${x.c.total === low ? '<span class="fn-low">الأقل كلفة</span>' : ''}</div>
        <div class="fn-cmp-big"><small>المجموع${x.c.disc ? ' بعد المنحة' : ''}</small><b>${JD(x.c.total)}</b></div>
        <table class="fn-cmp-t">${CMP_ROWS.map(([k, f]) => `<tr class="${/المجموع/.test(k) ? 'sum' : ''}${/المنحة/.test(k) && x.c.disc ? ' grant' : ''}"><td>${k}</td><td>${esc(f(x))}</td></tr>`).join('')}</table></section>`).join('')}</div>
      <section class="card mt-3 fn-notes"><div class="card-body"><ul class="fn-cond mb-0"><li><i class="bi bi-info-circle"></i> بأسعار ${esc(D.year)} المنشورة الآن. عدد الفصول تُدخله أنت؛ مسار الماجستير محسوب بمسار الرسالة (${JD(D.masters.thesis_defense)} رسوم المناقشة).</li>
        <li><i class="bi bi-info-circle"></i> منحة تفوق الثانوية تمنح لعام دراسي كامل، واستمرارها بعده مشروط بالمعدل التراكمي؛ «المنحة على ساعات الخطة» تفترض استمرارها طوال الخطة (انظر <a href="grants.html">المنح والخصومات</a>).</li>
        <li><i class="bi bi-info-circle"></i> لا تشمل المقارنة التأمين المسترد (${JD(D.fixed.items.find(f => f.key === 'insurance').regular)}) ولا المواصلات ولا السكن.</li></ul></div></section>`;
  }
  function calc() {
    const progs = D.programs, p = progs.find(x => x.id === cs.p) || progs.find(x => x.name === 'هندسة البرمجيات') || progs[0];
    cs.p = p.id;
    if (CAL && CAL.semesters && CAL.semesters.length) { if (!termInfo(cs.term)) cs.term = cs.sem === 'summer' ? 'summer' : termNow(); cs.sem = cs.term === 'summer' ? 'summer' : 'regular'; }
    if (!cs.cmp.length) cs.cmp = [p.id];
    const r = semCalc(p), share = () => { const u = new URL(location.href); u.search = new URLSearchParams({ p: cs.p, h: cs.h, sem: cs.sem, pay: cs.pay, g: cs.grant, tab: cs.tab,
      ...(cs.intl ? { intl: 1 } : {}), ...(cs.first ? { first: 1 } : {}), ...(cs.trans ? { tr: 1 } : {}), ...(cs.avg ? { avg: cs.avg } : {}), ...(cs.gpa ? { gpa: cs.gpa } : {}), ...(cs.pct ? { pct: cs.pct } : {}),
      ...(cs.sems ? { sems: cs.sems } : {}), sums: cs.sums, ...(cs.term ? { term: cs.term } : {}), ...(cs.tab === 'cmp' ? { cmp: cs.cmp.join(','), cmsb: cs.cmsb, cmsm: cs.cmsm } : {}) }); history.replaceState(null, '', u); };
    share();
    const opts = facs().map(f => `<optgroup label="${esc(f)}">${progs.filter(x => x.faculty === f).map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(progName(x))} – ${x.price} د.أ</option>`).join('')}</optgroup>`).join('');
    const sems = cs.sems || (p.degree === 'ماجستير' ? 4 : 8);  // a starting value only: the reader sets the number of semesters
    const plan = (() => { const fx = Object.fromEntries(D.fixed.items.map(f => [f.key, f])), price = progPrice(p, cs.intl), T = TR();
      const rows = [['رسوم ساعات الخطة', `${p.hours} ساعة × ${price} د.أ`, p.hours * price], ['التسجيل والخدمات للفصول الاعتيادية', `${sems} فصل × ${fx.registration.regular + fx.services.regular} د.أ`, sems * (fx.registration.regular + fx.services.regular)],
        ['التسجيل والخدمات للفصول الصيفية', `${cs.sums} فصل × ${fx.registration.summer + fx.services.summer} د.أ`, cs.sums * (fx.registration.summer + fx.services.summer)],
        ['رسوم عند القبول', `طلب التحاق${p.degree === 'بكالوريوس' ? ' + امتحانات المستوى' : ''}`, fx.application.once + (p.degree === 'بكالوريوس' ? fx.placement.once : 0)],
        ...(p.degree === 'ماجستير' ? [cs.track === 'comp' ? ['رسوم الامتحان الشامل', 'مسار الامتحان الشامل', D.masters.comprehensive] : ['رسوم مناقشة الرسالة / الأطروحة', 'مسار الرسالة', D.masters.thesis_defense]] : []),
        ...(cs.trans ? [['المواصلات', `${sems} فصل اعتيادي و${cs.sums} صيفي`, T.regular_first + Math.max(0, sems - 1) * T.regular + (cs.sums ? T.summer_first + Math.max(0, cs.sums - 1) * T.summer : 0)]] : [])];
      const gr = grantOf(p), gross = rows.reduce((a, x) => a + x[2], 0), disc = gr.pct ? Math.round(p.hours * price * gr.pct) / 100 : 0;
      // the grant applies to the hours' fees only; shown for the whole plan on the condition that it is kept every semester
      if (disc) rows.splice(1, 0, ['المنحة / الخصم (على رسوم الساعات فقط)', `${gr.pct}% من ${JD(p.hours * price)}، إن استمرت طوال الخطة`, -disc]);
      return { rows, gross, disc, gr, total: gross - disc, insurance: fx.insurance.regular, first: 0 };
    })();
    $('#fn-calc').innerHTML = `
      <div class="fn-tabs no-print">${views('fn-tab', [['sem', 'bi-calendar3', 'رسوم فصل دراسي'], ['plan', 'bi-signpost-2', 'كلفة البرنامج كاملاً'], ['cmp', 'bi-layout-three-columns', 'مقارنة تخصصات']], cs.tab)}</div>
      ${cs.tab === 'cmp' ? cmpHTML() : `<div class="row g-3">
        <div class="col-xl-4 col-lg-5 no-print"><section class="card fn-form"><div class="card-header fw-bold"><i class="bi bi-sliders"></i> بياناتك</div><div class="card-body d-grid gap-2">
          <div><label class="small fw-bold" for="c-p">التخصص</label><select class="form-select form-select-sm" id="c-p">${opts}</select></div>
          ${p.price_intl ? `<div class="fn-seg">${[['0', 'أردني / فلسطيني'], ['1', 'غير أردني']].map(([v, l]) => `<label><input type="radio" name="c-intl" value="${v}" ${(cs.intl ? '1' : '0') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>` : ''}
          ${cs.tab === 'sem' ? `
          <div class="row g-2"><div class="col-6"><label class="small fw-bold" for="c-h">عدد الساعات</label><input type="number" min="1" max="24" class="form-control form-control-sm" id="c-h" value="${cs.h}"></div>
            <div class="col-6"><label class="small fw-bold" for="c-sem">الفصل</label><select class="form-select form-select-sm" id="c-sem">${CAL && CAL.semesters && CAL.semesters.length ? CAL.semesters.map(x => `<option value="${x.key}" ${cs.term === x.key ? 'selected' : ''}>${esc(x.name.replace('الفصل الدراسي ', ''))} ${esc(CAL.year || '')}</option>`).join('')
              : `<option value="regular" ${cs.sem === 'regular' ? 'selected' : ''}>اعتيادي (أول / ثانٍ)</option><option value="summer" ${cs.sem === 'summer' ? 'selected' : ''}>صيفي</option>`}</select></div></div>
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
            <div class="fn-split">${r.late ? `<div><small>يُدفع عند التسجيل</small><b>${JD(r.now)}</b></div><div><small>قبل الامتحانات النهائية</small><b>${JD(r.later)}</b></div>`
              : `<div><small>الرسوم الدراسية</small><b>${JD(r.net)}</b></div><div><small>رسوم أخرى</small><b>${JD(r.total - r.net)}</b></div>`}${r.gr.pct ? `<div><small>وفّرت المنحة</small><b>${JD(r.L.find(l => l[3] === 'grant')[2] * -1)}</b></div>` : ''}</div></section>
          <section class="card mt-3"><div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-lines"><thead><tr><th>البند</th><th>التفصيل</th><th class="text-end">المبلغ</th></tr></thead><tbody>
            ${(() => { const row = ([n, d, v, k]) => `<tr class="${k}"><td><b>${esc(n)}</b></td><td class="small">${esc(d)}</td><td class="text-end"><b>${v < 0 ? '−' : ''}${JD(Math.abs(v))}</b></td></tr>`;
              const A = r.L.filter(l => l[3] !== 'fixed'), B = r.L.filter(l => l[3] === 'fixed'), sub = (t, v) => `<tr class="sub"><td colspan="2">${t}</td><td class="text-end">${JD(v)}</td></tr>`;
              return `<tr class="grp"><td colspan="3"><i class="bi bi-mortarboard"></i> الرسوم الدراسية</td></tr>${A.map(row).join('')}${A.length > 1 ? sub('صافي الرسوم الدراسية', r.net) : ''}
                <tr class="grp"><td colspan="3"><i class="bi bi-receipt"></i> رسوم التسجيل والخدمات وغيرها</td></tr>${B.map(row).join('')}${sub('مجموع الرسوم الأخرى', r.total - r.net)}`; })()}
            <tr class="sum"><td colspan="2"><b>المجموع</b></td><td class="text-end"><b>${JD(r.total)}</b></td></tr></tbody></table></div></section>
          ${planHTML(p, r)}${dropHTML(p, r)}
          <section class="card mt-3 fn-notes"><div class="card-header fw-bold fn-ch"><i class="bi bi-journal-text"></i> ملاحظات من التعليمات المنشورة</div><div class="card-body"><ul class="fn-cond mb-0">
            ${cs.pay === 'late' && cs.first ? '<li><i class="bi bi-info-circle"></i> دفع 60% بعد التسجيل المبكر منشور «للطالب القديم»، لذلك حُسب المستجد بالدفع الكامل.</li>' : ''}
            ${cs.pay === 'late' && r.dental ? '<li><i class="bi bi-info-circle"></i> تخصص طب الأسنان مستثنى من الدفع الجزئي (60%).</li>' : ''}
            <li><i class="bi bi-quote"></i> ${esc(faq(cs.pay === 'late' ? 'بعد انتهاء فترة التسجيل المبكر' : 'التسجيل المبكر وكيف'))}</li>
            <li><i class="bi bi-shield-check"></i> المنح تُحسب على الرسوم الدراسية فقط، ومادة العلوم العسكرية لا تُدرج ضمن أي منحة.</li>
            <li><i class="bi bi-house"></i> السكن الداخلي للطالبات غير محسوب؛ أسعاره في <a href="${esc(D.sources.housing)}" target="_blank" rel="noopener">صفحة سكن الطالبات</a>.</li></ul></div></section>`
          : `<section class="fn-total"><div><small>كلفة البرنامج حسب الأرقام المنشورة وعدد الفصول الذي أدخلته</small><b>${JD(plan.total)}</b><span>${esc(progName(p))} · ${p.hours} ساعة · ${sems} فصل اعتيادي و${cs.sums} صيفي</span></div>
             <div class="fn-split">${plan.disc ? `<div><small>قبل المنحة</small><b>${JD(plan.gross)}</b></div><div><small>المنحة ${plan.gr.pct}%</small><b>−${JD(plan.disc)}</b></div>` : `<div><small>رسوم الساعات وحدها</small><b>${JD(plan.rows[0][2])}</b></div>`}<div><small>تأمين مسترد</small><b>${JD(plan.insurance)}</b></div></div></section>
          <section class="card mt-3"><div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-lines"><thead><tr><th>البند</th><th>التفصيل</th><th class="text-end">المبلغ</th></tr></thead><tbody>
            ${plan.rows.map(([n, d, v]) => `<tr class="${v < 0 ? 'grant' : ''}"><td><b>${esc(n)}</b></td><td class="small">${esc(d)}</td><td class="text-end"><b>${v < 0 ? '−' : ''}${JD(Math.abs(v))}</b></td></tr>`).join('')}
            <tr class="sum"><td colspan="2"><b>المجموع</b></td><td class="text-end"><b>${JD(plan.total)}</b></td></tr></tbody></table></div></section>
          <section class="card mt-3 fn-notes"><div class="card-header fw-bold fn-ch"><i class="bi bi-journal-text"></i> ملاحظات</div><div class="card-body"><ul class="fn-cond mb-0"><li><i class="bi bi-info-circle"></i> بأسعار ${esc(D.year)} المنشورة الآن، دون افتراض أي تغيير مستقبلي. عدد الفصول الاعتيادية والصيفية تُدخله أنت حسب خطتك.</li>
            <li><i class="bi bi-info-circle"></i> لا يشمل التأمين المسترد ولا السكن.${plan.disc ? ' المنحة محسوبة على رسوم ساعات الخطة كلها بافتراض استمرارها؛ استمرارها مشروط بالمحافظة على المعدل المطلوب فصلاً بفصل (انظر <a href="grants.html">المنح والخصومات</a>)، ومادة العلوم العسكرية لا تُدرج ضمن أي منحة.' : ''}</li></ul></div></section>`}
          <div class="d-flex flex-wrap gap-2 no-print mt-2"><button type="button" class="btn btn-sm btn-maroon" id="c-print"><i class="bi bi-printer"></i> طباعة / PDF</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="c-link"><i class="bi bi-link-45deg"></i> نسخ رابط هذا الحساب</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="c-card"><i class="bi bi-person-vcard"></i> بطاقة الكلفة للمشاركة</button>
            <a class="btn btn-sm btn-outline-secondary" href="fees.html"><i class="bi bi-tags"></i> كل التخصصات والأسعار</a></div>
        </div></div>`}
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
    on('#c-sem', 'change', e => { const v = e.target.value; if (termInfo(v)) { cs.term = v; cs.sem = v === 'summer' ? 'summer' : 'regular'; } else cs.sem = v; calc(); });
    on('#c-dh', 'input', later(e => { cs.dh = Math.max(-cs.h, Math.min(24, Math.round(+e.target.value || 0))); }));
    on('#c-ics', 'click', () => icsFile(`رسوم_${(termInfo(cs.term) || { s: { name: 'الفصل' } }).s.name}.ics`, planRows(p, r).filter(x => x.e).map(x => ({ start: x.e.start, end: x.e.end, id: x.e.id, title: `رسوم جامعة البترا: ${x.what}${x.amount ? ' – ' + JD(x.amount) : ''}`, desc: x.note || '' }))));
    on('#c-card', 'click', () => cs.tab === 'sem'
      ? costCard('رسوم فصل دراسي', `${progName(p)} · ${cs.h} ساعة · ${(termInfo(cs.term) || { s: { name: cs.sem === 'summer' ? 'فصل صيفي' : 'فصل اعتيادي' } }).s.name}`, JD(r.total),
          [...r.L.map(([n, d, v]) => [n, (v < 0 ? '−' : '') + JD(Math.abs(v))]), ...(r.late ? [['يُدفع عند التسجيل', JD(r.now)], ['قبل الامتحانات النهائية', JD(r.later)]] : [])], location.href)
      : costCard('كلفة البرنامج كاملاً', `${progName(p)} · ${p.hours} ساعة · ${sems} فصل اعتيادي و${cs.sums} صيفي`, JD(plan.total), plan.rows.map(([n, , v]) => [n, (v < 0 ? '−' : '') + JD(Math.abs(v))]), location.href));
    document.querySelectorAll('.c-cmp').forEach(x => x.addEventListener('change', e => { const i = +e.target.dataset.i, v = +e.target.value; cs.cmp[i] = v; cs.cmp = cs.cmp.filter(Boolean); calc(); }));
    on('#c-cmsb', 'input', later(e => { cs.cmsb = Math.max(1, +e.target.value || 1); }));
    on('#c-cmsm', 'input', later(e => { cs.cmsm = Math.max(1, +e.target.value || 1); }));
    on('#c-cavg', 'input', later(e => { cs.avg = e.target.value; }));
    on('#c-cmp-print', 'click', () => { const C = cmpData(); printReport({ title: 'مقارنة كلفة التخصصات', subtitle: 'جامعة البترا · أسعار ' + D.year, orientation: 'landscape',
      filters: [['معدل الثانوية', cs.avg || '—'], ['فصول البكالوريوس', cs.cmsb], ['فصول الماجستير', cs.cmsm], ['الفصول الصيفية', cs.sums]],
      sections: [{ columns: ['البند', ...C.map(c => progName(c.p))], rows: CMP_ROWS.map(([k, f]) => [k, ...C.map(f)]) }], note: D.note + ' ' + D.sources.fees }); });
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
        sections: [{ columns: ['البند', 'التفصيل', 'المبلغ'], rows: (sem ? r.L.map(([n, d, v]) => [n, d, (v < 0 ? '−' : '') + JD(Math.abs(v))]) : plan.rows.map(([n, d, v]) => [n, d, (v < 0 ? '−' : '') + JD(Math.abs(v))])) }],
        note: 'مجموع الأرقام المنشورة على الموقع الرسمي للجامعة (' + D.year + ')، دون تقدير أو تقريب؛ المرجع المعتمد كشف الحساب لدى دائرة الشؤون المالية. ' + D.sources.fees });
    });
  }

  /* ---------------------------------------------------------------- grants.html */
  const gs = { mode: P.get('mode') === 'gpa' ? 'gpa' : 'tawjihi', avg: '', fac: '', gpa: '', passed: '', disc: false, wp: '', wh: '15', view: remember('grants-view', 'tables') };
  function grants() {
    const G = D.grants, T = G.tawjihi, A = G.academic, tw = gs.mode === 'tawjihi';
    const progs = D.programs.filter(p => p.degree === 'بكالوريوس'), chosen = progs.find(p => String(p.id) === gs.fac);
    const avgTxt = (lo, hi) => hi >= 100 ? `${lo}% فأكثر` : `${lo}% – ${hi}%`, gpaTxt = (lo, hi) => lo === hi ? lo.toFixed(2) : `${lo.toFixed(2)} – ${hi.toFixed(2)}`;
    const ok = (good, txt) => `<li class="${good === null ? '' : good ? 'y' : 'n'}"><i class="bi ${good === null ? 'bi-dot' : good ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><span>${txt}</span></li>`;
    // ---- result of the check (what the published rules give for what was typed)
    let res = { pct: null, head: '', sub: '', split: [], cond: [], tone: '' }, hit = null;
    if (tw) {
      const a = parseFloat(gs.avg);
      if (!chosen || !(a > 0)) res.sub = 'اختر التخصص وأدخل معدل الثانوية العامة لتظهر المنحة التي تنص عليها التعليمات.';
      else if (isExcluded(chosen)) { res.pct = 0; res.tone = 'bad'; res.head = 'لا يخضع لأي منحة'; res.sub = `${chosen.name} من التخصصات المستثناة من منح الجامعة.`; }
      else { const r = tawjihiPct(chosen, a); hit = { grp: r.group, lo: (r.pct ? (r.group === T.groupA.label ? T.groupA : T.groupB).bands.find(x => x[2] === r.pct)[0] : null) };
        res.pct = r.pct; res.tone = r.pct ? 'ok' : '';
        res.head = r.pct ? `منحة ${r.pct}% من الرسوم الدراسية` : 'لا تُستحق منحة تفوق';
        res.sub = r.pct ? `${chosen.name} · ${r.group} · معدل ${a}%` : `المعدل ${a}% دون الحد الأدنى لمنحة التفوق في ${r.group}.`;
        if (r.pct) res.split = [['خصم الساعة المعتمدة', `${num(chosen.price * r.pct / 100)} من ${chosen.price} د.أ`], ['المدة', 'عام دراسي كامل مع الصيفي'], ['للاستمرار', `معدل تراكمي ${T.keep_gpa[String(r.pct)]}`]]; }
      res.cond = [ok(null, esc(T.who)), ok(null, `تشمل: ${esc(T.covers)}`), ok(null, esc(T.keep)), ...(T.after ? [ok(null, esc(T.after))] : [])];
    } else {
      const g = parseFloat(gs.gpa), passed = gs.passed === '' ? null : parseFloat(gs.passed) || 0;
      if (!(g > 0)) res.sub = 'أدخل معدلك التراكمي وعدد الساعات التي اجتزتها في الجامعة.';
      else { const pc = gpaPct(g), pOk = passed === null ? null : passed >= 30, good = pc && pOk !== false && !gs.disc;
        hit = { gpa: pc ? A.bands.find(x => x[2] === pc)[0] : null };
        res.pct = good ? pc : pc ? null : 0; res.tone = good ? 'ok' : pc ? 'bad' : '';
        res.head = !pc ? 'لا تُستحق منحة التفوق الأكاديمي' : good ? `منحة ${pc}% من الرسوم الدراسية` : `المعدل يؤهل لـ ${pc}% لكن ينقص شرط`;
        res.sub = !pc ? `المعدل ${g} دون الحد الأدنى (3.67).` : `معدل تراكمي ${g} من 4.00`;
        if (pc) res.split = [['الشريحة', `${pc}%`], ['المدة', 'الفصل اللاحق فقط'], ['التجديد', 'كل فصل حسب المعدل']];
        res.cond = [ok(pc ? true : false, `معدل تراكمي 3.67 فأكثر${g > 0 ? ` (معدلك ${g})` : ''}`), ok(pOk, esc(A.first)), ok(!gs.disc, esc(A.discipline)), ok(null, esc(A.continue))]; }
      if (!res.cond.length) res.cond = [ok(null, esc(A.first)), ok(null, esc(A.continue)), ok(null, esc(A.discipline))];
    }
    // ---- the published tables (the reader's band is marked)
    const los = [...new Set([...T.groupB.bands, ...T.groupA.bands].map(x => x[0]))].sort((x, y) => y - x);
    const cell = (grp, lo) => { const b = grp.bands.find(x => x[0] === lo), on = hit && hit.grp === grp.label && hit.lo === lo; return `<td class="text-center${on ? ' on' : ''}">${b ? `<b class="fn-pct">${b[2]}%</b><small class="fn-keep">للاستمرار: تراكمي ${T.keep_gpa[String(b[2])]}</small>` : '<span class="fn-none">—</span>'}</td>`; };
    const tTable = `<table class="table tt-table fn-gtbl mb-0"><thead><tr><th>معدل الثانوية العامة</th><th class="text-center">${esc(T.groupA.label)}</th><th class="text-center">${esc(T.groupB.label)}</th></tr></thead><tbody>
      ${los.map(lo => { const b = [...T.groupB.bands, ...T.groupA.bands].find(x => x[0] === lo); return `<tr><td><b>${avgTxt(b[0], b[1])}</b></td>${cell(T.groupA, lo)}${cell(T.groupB, lo)}</tr>`; }).join('')}</tbody></table>`;
    const aTable = `<table class="table tt-table fn-gtbl mb-0"><thead><tr><th>المعدل التراكمي (من 4.00)</th><th class="text-center">المنحة من الرسوم الدراسية</th></tr></thead><tbody>
      ${A.bands.map(([lo, hi, pc]) => `<tr><td><b>${gpaTxt(lo, hi)}</b></td><td class="text-center${hit && hit.gpa === lo ? ' on' : ''}"><b class="fn-pct">${pc}%</b></td></tr>`).join('')}</tbody></table>`;
    const tables = `<div class="row g-3">
        <div class="col-xl-7"><section class="card h-100"><div class="card-header fw-bold fn-ch"><i class="bi bi-trophy"></i> ${esc(T.title)} <small>للطالب المستجد</small></div><div class="card-body">
          <div class="table-responsive">${tTable}</div>
          ${legal('النص الرسمي لهذه المنحة', [T.who, 'تشمل: ' + T.covers, T.keep, ...(T.after ? [T.after] : [])], { cls: 'mt-3 fn-legal-in' })}</div></section></div>
        <div class="col-xl-5"><section class="card h-100"><div class="card-header fw-bold fn-ch"><i class="bi bi-mortarboard"></i> ${esc(A.title)} <small>للطالب الحالي، كل فصل</small></div><div class="card-body">
          <div class="table-responsive">${aTable}</div>
          ${legal('النص الرسمي لهذه المنحة', [A.covers, A.first, A.continue, A.discipline], { cls: 'mt-3 fn-legal-in' })}</div></section></div></div>`;
    const cards = `<div class="fn-cards">${[...T.groupB.bands.map(b => ['تفوق الثانوية', T.groupB.label, b]), ...T.groupA.bands.map(b => ['تفوق الثانوية', T.groupA.label, b])].map(([k, l, [lo, hi, pc]]) =>
      `<div class="fn-card"><div class="fn-card-h"><span class="fn-deg">${k}</span><small>${esc(l)}</small></div><div class="fn-card-price"><b>${pc}%</b><span>من الرسوم الدراسية</span></div><ul><li><i class="bi bi-bar-chart"></i> معدل ${avgTxt(lo, hi)}</li><li><i class="bi bi-calendar3"></i> عام دراسي كامل</li><li><i class="bi bi-arrow-repeat"></i> بمعدل ${T.keep_gpa[String(pc)]} للاستمرار</li></ul></div>`).join('')}
      ${A.bands.map(([lo, hi, pc]) => `<div class="fn-card"><div class="fn-card-h"><span class="fn-deg m">تفوق أكاديمي</span><small>كل فصل</small></div><div class="fn-card-price"><b>${pc}%</b><span>من الرسوم الدراسية</span></div><ul><li><i class="bi bi-bar-chart"></i> معدل ${gpaTxt(lo, hi)}</li><li><i class="bi bi-journal-check"></i> بعد اجتياز 30 ساعة</li></ul></div>`).join('')}</div>`;
    function whatIf() {
      const g = parseFloat(gs.gpa), wp = D.programs.find(p => String(p.id) === gs.wp), h = Math.max(1, Math.min(24, parseInt(gs.wh, 10) || 15)), cur = g > 0 ? gpaPct(g) : null;
      const per = wp ? wp.price * h : null;
      return `<section class="card fn-whatif"><div class="card-header fw-bold fn-ch"><i class="bi bi-graph-up-arrow"></i> ماذا لو؟ <small>كم توفّر في الفصل اللاحق لكل شريحة${wp ? ` · ${h} ساعة × ${wp.price} د.أ` : ''}</small></div>
        <div class="table-responsive"><table class="table tt-table fn-gtbl mb-0"><thead><tr><th>المعدل التراكمي المطلوب</th>${g > 0 ? '<th class="text-center">الفرق عن معدلك</th>' : ''}<th class="text-center">المنحة</th><th class="text-center">التوفير في الفصل</th><th class="text-center">رسوم الساعات بعد المنحة</th></tr></thead><tbody>
        ${[...A.bands].sort((a, b) => a[0] - b[0]).map(([lo, hi, pc]) => { const need = g > 0 ? Math.max(0, Math.round((lo - g) * 100) / 100) : null, mine = cur === pc;
          return `<tr class="${mine ? 'mine' : ''}"><td><b>${gpaTxt(lo, hi)}</b>${mine ? ' <span class="fn-cd now">شريحتك</span>' : ''}</td>${g > 0 ? `<td class="text-center">${need ? '+' + need.toFixed(2) : '<span class="fn-cd now">محقق</span>'}</td>` : ''}<td class="text-center"><b class="fn-pct">${pc}%</b></td>
            <td class="text-center"><b>${per ? JD(per * pc / 100) : '—'}</b></td><td class="text-center">${per ? JD(per - per * pc / 100) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="card-body pt-2"><p class="small mb-0">${per ? `رسوم ساعاتك دون منحة: ${JD(per)} في الفصل.` : 'اختر تخصصك ليظهر التوفير بالدينار.'} المنحة على الرسوم الدراسية فقط، وتُحسب للفصل اللاحق بشرط ${esc(A.first)}</p></div></section>`;
    }
    const form = tw ? `
          <div><label class="small fw-bold" for="g-fac">التخصص (بكالوريوس)</label><select class="form-select form-select-sm" id="g-fac"><option value="">اختر التخصص…</option>${facs().map(f => `<optgroup label="${esc(f)}">${progs.filter(p => p.faculty === f).map(p => `<option value="${p.id}" ${String(p.id) === gs.fac ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div><label class="small fw-bold" for="g-avg">معدل الثانوية العامة %</label><input type="number" step="0.1" min="0" max="100" class="form-control form-control-sm" id="g-avg" value="${esc(gs.avg)}" placeholder="مثال: 92.5"></div>`
      : `<div class="row g-2"><div class="col-6"><label class="small fw-bold" for="g-gpa">المعدل التراكمي (من 4.00)</label><input type="number" step="0.01" min="0" max="4" class="form-control form-control-sm" id="g-gpa" value="${esc(gs.gpa)}" placeholder="مثال: 3.75"></div>
            <div class="col-6"><label class="small fw-bold" for="g-pass">الساعات المجتازة في الجامعة</label><input type="number" min="0" class="form-control form-control-sm" id="g-pass" value="${esc(gs.passed)}" placeholder="مثال: 45"></div></div>
          <label class="form-check small"><input type="checkbox" class="form-check-input" id="g-disc" ${gs.disc ? 'checked' : ''}> صدرت بحقي عقوبة تأديبية (إنذار فأكثر)</label>
          <div class="fn-sep">لحساب «ماذا لو؟» بالدينار</div>
          <div><label class="small fw-bold" for="g-wp">تخصصي</label><select class="form-select form-select-sm" id="g-wp"><option value="">اختر التخصص…</option>${facs().map(f => `<optgroup label="${esc(f)}">${D.programs.filter(p => p.faculty === f).map(p => `<option value="${p.id}" ${String(p.id) === gs.wp ? 'selected' : ''}>${esc(progName(p))} – ${p.price} د.أ</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div><label class="small fw-bold" for="g-wh">الساعات التي سأسجلها في الفصل</label><input type="number" min="1" max="24" class="form-control form-control-sm" id="g-wh" value="${esc(gs.wh)}"></div>`;
    $('#fn-grants').innerHTML = `
      ${kpis([['100%', 'أعلى منحة تفوق', 'bi-trophy', 'good', 'للمعدل 95% فأكثر أو التراكمي 4.00'], [A.bands.length, 'شرائح للتفوق الأكاديمي', 'bi-mortarboard', '', A.bands.map(b => b[2] + '%').join(' · ')], ['30', 'ساعة قبل أول منحة أكاديمية', 'bi-journal-check'], [G.excluded_majors.length, 'تخصصات لا تخضع للمنح', 'bi-slash-circle', 'bad', G.excluded_majors.join(' · ')]])}
      <div class="fn-tabs no-print">${views('fn-gm', [['tawjihi', 'bi-person-plus', 'طالب مستجد: تفوق الثانوية العامة'], ['gpa', 'bi-person-check', 'طالب حالي: التفوق الأكاديمي']], gs.mode)}</div>
      ${inbar(form)}
      <div class="row g-3 mb-3">
        <div class="col-lg-7 d-grid gap-3 align-content-start">
          <section class="fn-total fn-gres ${res.tone} ${res.pct === null && !res.head ? 'empty' : ''}"><div><small>${tw ? esc(T.title) : esc(A.title)} حسب التعليمات المنشورة</small><b>${res.pct === null ? '—' : res.pct ? res.pct + '%' : '0%'}</b><span>${res.head ? `<strong>${esc(res.head)}</strong> · ` : ''}${esc(res.sub)}</span></div>
            ${res.split.length ? `<div class="fn-split">${res.split.map(([l, v]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}</section>
          ${tw ? '' : whatIf()}</div>
        <div class="col-lg-5"><section class="card fn-condcard h-100"><div class="card-header fw-bold fn-ch"><i class="bi bi-list-check"></i> الشروط <small>كما وردت في الصفحة الرسمية</small></div><div class="card-body"><ul class="fn-cond mb-0">${res.cond.join('')}</ul></div></section></div></div>
      <div class="fn-alert"><i class="bi bi-exclamation-circle-fill"></i> ${esc(G.excluded_note)}</div>
      <div class="fn-head"><h2><i class="bi bi-table"></i> جداول المنح المنشورة</h2>${views('fn-gv', [['tables', 'bi-table', 'جداول'], ['cards', 'bi-grid-1x2', 'بطاقات']], gs.view)}</div>
      ${gs.view === 'cards' ? cards : tables}
      <section class="card mt-3"><div class="card-body small"><i class="bi bi-journal-text"></i> <b>التعليمات:</b> ${esc(G.instructions)}. ولمعرفة تفاصيل منح التفوق الفني والتفوق الرياضي ومنح التشغيل كما تذكر الصفحة الرسمية:
        <a href="${esc(D.sources.brochure)}" target="_blank" rel="noopener">بروشور المنح</a> · <a href="${esc(D.sources.regulations)}" target="_blank" rel="noopener">دليل أنظمة الجامعة وتعليماتها</a></div></section>
      <div class="d-flex flex-wrap gap-2 no-print mt-3"><button type="button" class="btn btn-sm btn-maroon" id="g-print"><i class="bi bi-printer"></i> طباعة / PDF</button><a class="btn btn-sm btn-outline-secondary" href="tuition.html"><i class="bi bi-calculator"></i> احسب الرسوم بعد المنحة</a></div>
      <div class="fn-disclaimer"><i class="bi bi-exclamation-triangle-fill"></i> الفحص استرشادي؛ قرار المنحة تصدره الجامعة وفق تعليماتها. لا يُحفظ ولا يُرسل أي شيء تُدخله هنا.</div>
      ${src([['grants', 'المنح الأكاديمية – دائرة القبول والتسجيل'], ['brochure', 'بروشور المنح الدراسية ومنح المساعدة والمنح التشجيعية']])}`;
    $('#fn-grants').insertAdjacentHTML('afterbegin', review(['grants']));
    let t; const later = (k, id) => e => { clearTimeout(t); t = setTimeout(() => { gs[k] = e.target.value; grants(); const el = $(id); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }, 450); };
    const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
    on('#g-fac', 'change', e => { gs.fac = e.target.value; grants(); });
    on('#g-avg', 'input', later('avg', '#g-avg'));
    on('#g-gpa', 'input', later('gpa', '#g-gpa'));
    on('#g-pass', 'input', later('passed', '#g-pass'));
    on('#g-disc', 'change', e => { gs.disc = e.target.checked; grants(); });
    on('#g-wp', 'change', e => { gs.wp = e.target.value; grants(); });
    on('#g-wh', 'input', later('wh', '#g-wh'));
    on('#g-print', 'click', () => window.print());
    document.querySelectorAll('#fn-gm button').forEach(b => b.addEventListener('click', () => { gs.mode = b.dataset.v; grants(); }));
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
  const ps = { view: remember('pay-view2', 'faq'), q: '', cat: '', tab: ['cal', 'check', 'faq'].includes(P.get('tab')) ? P.get('tab') : 'cal', term: P.get('term') || '', done: {} };
  const termBar = () => `<div class="fn-term no-print">${CAL.semesters.map(x => `<button type="button" class="${x.key === ps.term ? 'on' : ''}" data-t="${x.key}">${esc(x.name.replace('الفصل الدراسي ', 'الفصل '))}</button>`).join('')}<span>${esc(CAL.year || '')} · من التقويم الجامعي المنشور</span></div>`;
  function payCal() {
    if (!CAL || !CAL.semesters || !CAL.semesters.length) return '<div class="fn-empty">تعذّر تحميل التقويم الجامعي.</div>';
    if (!termInfo(ps.term)) ps.term = termNow();
    const L = finEvents(ps.term), nx = L.find(e => when(e).k !== 'past'), kind = e => /غرامة/.test(e.title) ? ['fine', 'bi-exclamation-triangle', 'غرامة'] : /الانسحاب/.test(e.title) ? ['wd', 'bi-box-arrow-right', 'انسحاب'] : /بطاقة|الامتحانات النهائية/.test(e.title) ? ['exam', 'bi-card-heading', 'امتحانات'] : /التدريس/.test(e.title) ? ['teach', 'bi-easel', 'تدريس'] : ['reg', 'bi-calendar-check', 'تسجيل'];
    return `${termBar()}
      ${nx ? `<section class="fn-total fn-next"><div><small>الموعد المالي القادم</small><b>${esc(when(nx).txt)}</b><span><strong>${esc(nx.title)}</strong>${nx.note ? ' – ' + esc(nx.note) : ''} · ${esc(dRange(nx))}</span></div>
        <div class="fn-split"><div><small>مواعيد هذا الفصل</small><b>${L.length}</b></div><div><small>متبقية</small><b>${L.filter(e => when(e).k !== 'past').length}</b></div></div></section>` : ''}
      <section class="card mt-3"><div class="card-header fw-bold fn-ch d-flex align-items-center gap-2"><span><i class="bi bi-calendar2-week"></i> المواعيد المالية <small>${esc(termInfo(ps.term).s.name)}</small></span>
        <button type="button" class="btn btn-sm btn-outline-secondary ms-auto no-print" id="py-ics"><i class="bi bi-calendar-plus"></i> أضف إلى تقويمي (.ics)</button></div>
        <div class="table-responsive"><table class="table align-middle mb-0 tt-table fn-roz"><thead><tr><th>التاريخ</th><th>الموعد كما ورد في التقويم الجامعي</th><th class="text-center">النوع</th><th class="text-center">العدّاد</th></tr></thead><tbody>
        ${L.map(e => { const w = when(e), k = kind(e); return `<tr class="${w.k} ${e === nx ? 'next' : ''}"><td class="text-nowrap"><b>${esc(dRange(e))}</b><small>${esc(e.day || '')}</small></td><td><b>${esc(e.title)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</td>
          <td class="text-center"><span class="fn-kind ${k[0]}"><i class="bi ${k[1]}"></i> ${k[2]}</span></td><td class="text-center"><span class="fn-cd ${w.k}">${esc(w.txt)}</span></td></tr>`; }).join('')}</tbody></table></div></section>
      <section class="card mt-3 fn-notes"><div class="card-body"><ul class="fn-cond mb-0"><li><i class="bi bi-quote"></i> ${esc(faq('التسجيل المبكر وكيف'))}</li><li><i class="bi bi-quote"></i> ${esc(faq('بعد انتهاء فترة التسجيل المبكر'))}</li>
        <li><i class="bi bi-calculator"></i> احسب المبالغ ومواعيدها لتخصصك في <a href="tuition.html?term=${ps.term}">حاسبة الرسوم</a>.</li></ul></div></section>`;
  }
  function payCheck() {
    if (CAL && CAL.semesters && !termInfo(ps.term)) ps.term = termNow();
    const ti = CAL && CAL.semesters ? termInfo(ps.term) : null;
    const steps = [['pay', 'bi-cash-coin', 'سدّد كامل التزاماتك عن الفصل', [faq('بعد انتهاء فترة التسجيل المبكر'), faq('طرق الدفع')], ti && ti.card, 'بطاقة الدخول شرطها تسديد كامل الالتزامات'],
      ['card', 'bi-card-heading', 'احصل على بطاقة دخول الامتحانات النهائية', [faq('بطاقة دخول')], ti && ti.card],
      ['finals', 'bi-pencil-square', 'الامتحانات النهائية', [], ti && ti.finals],
      ['grad', 'bi-patch-check', 'عند التخرج: براءة الذمة', [faq('براءة الذمة')], null]];
    const n = steps.filter(x => ps.done[x[0]]).length;
    return `${ti ? termBar() : ''}
      <section class="fn-total fn-next"><div><small>قائمة التحقق قبل الامتحان النهائي</small><b>${n} من ${steps.length}</b><span>النصوص منقولة حرفياً من «معلومات مالية هامة»، والمواعيد من التقويم الجامعي. لا تُحفظ إشاراتك.</span></div></section>
      <ol class="fn-steps fn-chk mt-3">${steps.map(([k, i, h, texts, e, tip]) => { const w = e ? when(e) : null; return `<li class="${ps.done[k] ? 'done' : ''}"><span class="fn-step-i"><i class="bi ${ps.done[k] ? 'bi-check-lg' : i}"></i></span><div>
        <label class="d-flex gap-2 align-items-center"><input type="checkbox" class="form-check-input m-0" data-k="${k}" ${ps.done[k] ? 'checked' : ''}><b>${esc(h)}</b></label>
        ${e ? `<div class="fn-when"><i class="bi bi-calendar-event"></i> ${esc(e.title)}: ${esc(dRange(e))} <span class="fn-cd ${w.k}">${esc(w.txt)}</span>${tip ? ` · ${esc(tip)}` : ''}</div>` : ''}
        ${texts.filter(Boolean).map(t => `<p>${verbatim(t)}</p>`).join('')}</div></li>`; }).join('')}</ol>`;
  }
  function pay() {
    const Y = D.payment, T = TR();
    const q = norm(ps.q.trim()), list = D.faq.filter(x => (!q || norm(x.q + ' ' + x.a).includes(q)) && (!ps.cat || catOf(x.q)[0] === ps.cat));
    const body = {
      cards: `<div class="fn-pay-cards">${list.map(x => { const c = catOf(x.q); return `<section class="fn-pay" style="--c:${c[2]}"><div class="fn-pay-h"><i class="bi ${iconOf(x.q)}"></i><b>${esc(x.q)}</b><small>${c[1]}</small></div><p>${verbatim(x.a)}</p>${links(x)}</section>`; }).join('')}</div>`,
      faq: CAT.map(c => [c, list.filter(x => catOf(x.q) === c)]).filter(([, l]) => l.length).map(([c, l]) => `<section class="fn-faq-g" style="--c:${c[2]}"><h3><span></span>${c[1]} <small>${l.length}</small></h3>
        <div class="accordion fn-faq">${l.map(x => { const n = D.faq.indexOf(x); return `<div class="accordion-item"><h4 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#fq${n}" aria-expanded="false"><i class="bi ${iconOf(x.q)}"></i><span>${esc(x.q)}</span></button></h4>
        <div id="fq${n}" class="accordion-collapse collapse"><div class="accordion-body">${verbatim(x.a)}${links(x)}</div></div></div>`; }).join('')}</div></section>`).join('') || '<div class="fn-empty">لا نتائج.</div>',
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
      <div class="fn-tabs no-print">${views('fn-ptab', [['cal', 'bi-calendar2-week', 'الروزنامة المالية'], ['check', 'bi-list-check', 'قبل الامتحان النهائي'], ['faq', 'bi-question-circle', 'الأسئلة والأجوبة']], ps.tab)}</div>
      ${ps.tab === 'cal' ? payCal() : ps.tab === 'check' ? payCheck() : `      <div class="row g-3">
        <aside class="col-xl-3 col-lg-4 no-print"><div class="fn-aside">
          <section class="card"><div class="card-header fw-bold fn-ch"><i class="bi bi-bookmarks"></i> المواضيع</div><div class="list-group list-group-flush fn-topics">
            ${[['', 'كل المواضيع', 'var(--uop-navy)', D.faq.length], ...CAT.map(c => [c[0], c[1], c[2], D.faq.filter(x => catOf(x.q) === c).length])].filter(x => x[3]).map(([k, l, c, n]) =>
              `<button type="button" class="list-group-item list-group-item-action ${ps.cat === k ? 'on' : ''}" data-cat="${k}" style="--c:${c}"><span class="dot"></span>${l}<b>${n}</b></button>`).join('')}</div></section>
          <section class="card mt-3"><div class="card-header fw-bold fn-ch"><i class="bi bi-receipt"></i> ${esc(D.fixed.title)}</div><div class="card-body fn-fixed">${D.fixed.items.map(f => `<div class="fn-pair"><span>${esc(f.text)}</span></div>`).join('')}
            <div class="d-flex flex-wrap gap-2 mt-2"><a class="btn btn-sm btn-outline-secondary" href="fees.html"><i class="bi bi-tags"></i> أسعار الساعات</a><a class="btn btn-sm btn-maroon" href="tuition.html"><i class="bi bi-calculator"></i> حاسبة الرسوم</a></div></div></section></div></aside>
        <div class="col-xl-9 col-lg-8">
          <div class="card mb-3 no-print"><div class="card-body fn-bar-row">
            <div class="flex-grow-1"><label class="visually-hidden" for="py-q">بحث</label><div class="input-group input-group-sm"><span class="input-group-text"><i class="bi bi-search"></i></span><input class="form-control" id="py-q" value="${esc(ps.q)}" placeholder="ابحث في الأسئلة والأجوبة: شيك، مواصلات، تأمين، امتحان…"></div></div>
            ${views('fn-pv', [['faq', 'bi-question-circle', 'أسئلة وأجوبة'], ['cards', 'bi-grid-1x2', 'بطاقات'], ['table', 'bi-table', 'جدول'], ['steps', 'bi-signpost-split', 'خطوات الفصل']], ps.view)}
            <button type="button" class="btn btn-sm btn-outline-secondary" id="py-print"><i class="bi bi-printer"></i> طباعة</button></div>
            <div class="fn-count">${list.length} من ${D.faq.length} سؤالاً · النص منقول كما نشرته الدائرة المالية حرفياً</div></div>
          ${body}</div></div>`}
      ${src([['finance', 'معلومات مالية هامة – دائرة الشؤون المالية'], ['fees', 'التخصصات المطروحة والرسوم'], ['calendar', 'التقويم الجامعي']])}`;
    document.querySelectorAll('#fn-ptab button').forEach(b => b.addEventListener('click', () => { ps.tab = b.dataset.v; const u = new URL(location.href); u.searchParams.set('tab', ps.tab); history.replaceState(null, '', u); pay(); }));
    document.querySelectorAll('.fn-term [data-t]').forEach(b => b.addEventListener('click', () => { ps.term = b.dataset.t; pay(); }));
    document.querySelectorAll('.fn-chk input').forEach(x => x.addEventListener('change', e => { ps.done[e.target.dataset.k] = e.target.checked; pay(); }));
    const ic = $('#py-ics'); if (ic) ic.addEventListener('click', () => { const ti = termInfo(ps.term); icsFile(`الروزنامة_المالية_${ti.s.name}.ics`, finEvents(ps.term).map(e => ({ ...e, desc: [e.note, 'من التقويم الجامعي – جامعة البترا'].filter(Boolean).join(' · ') }))); });
    if (ps.tab !== 'faq') return;
    let t; $('#py-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ps.q = e.target.value; pay(); const i = $('#py-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    document.querySelectorAll('.fn-topics [data-cat]').forEach(b => b.addEventListener('click', () => { ps.cat = b.dataset.cat; pay(); }));
    document.querySelectorAll('#fn-pv button').forEach(b => b.addEventListener('click', () => { ps.view = b.dataset.v; keep('pay-view', ps.view); pay(); }));
    $('#py-print').addEventListener('click', () => printReport({ title: 'معلومات مالية هامة', subtitle: 'جامعة البترا · دائرة الشؤون المالية', orientation: 'portrait',
      sections: [{ columns: ['السؤال', 'الجواب كما نشرته الدائرة المالية'], rows: list.map(x => [x.q, x.a]), widths: ['28%', '72%'] }], note: D.note + ' ' + D.sources.finance }));
  }

  /* ---------------------------------------------------------------- staff-finance.html: from the published instructions, word for word */
  const sf = { tab: ['children', 'teach', 'travel', 'overtime', 'work'].includes(P.get('tab')) ? P.get('tab') : 'children', p: '', h: '15', rel: 'child',
    role: 'faculty', rank: 'assist', load: '', sup: '0', weeks: '', dean: false, ptype: 'th', pst: '', phr: '3', council: '0',
    cat: 'assoc', nights: '3', host: 'none', cash: '', acc: '', sal: '', oth: '', blocks: '0', wh: '' };
  function staffPage() {
    const S = D.staff;
    if (!S) { $('#fn-staff').innerHTML = '<div class="fn-empty">تُنشر هذه الصفحة بعد أول قراءة للتعليمات من الموقع الرسمي.</div>'; return; }
    const st = k => (S.status || {})[k] || {}, docLink = k => `<a href="${esc(st(k).url || D.sources.regulations)}" target="_blank" rel="noopener">${esc(S.docs[k].title)} <i class="bi bi-box-arrow-up-left"></i></a>`;
    const badge = k => st(k).ok ? '<span class="fn-cd now"><i class="bi bi-patch-check"></i> مطابق للملف الرسمي</span>' : '<span class="fn-cd past"><i class="bi bi-exclamation-triangle"></i> تغيّر الملف الرسمي – راجِعه</span>';
    const texts = (k, L, title) => legal(title || 'النص الرسمي كما ورد في التعليمات', L, { badge: badge(k), link: docLink(k), icon: 'bi-quote', cls: 'mt-3' });
    const num = (v, lo, hi, def) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def; };
    const tot = (sub, big, head, split, tone) => `<section class="fn-total ${tone || ''}"><div><small>${esc(sub)}</small><b>${big}</b><span>${head}</span></div>${split && split.length ? `<div class="fn-split">${split.map(([l, v]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}</section>`;
    const field = (id, label, input) => `<div><label class="small fw-bold" for="${id}">${label}</label>${input}</div>`;
    const inp = (id, v, attrs) => `<input type="number" class="form-control form-control-sm" id="${id}" value="${esc(v)}" ${attrs || ''}>`;
    const sel = (id, opts, cur) => `<select class="form-select form-select-sm" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const layout = (form, main) => `${inbar(form)}<div class="fn-out">${main}</div>`;
    let body = '';
    if (sf.tab === 'children') {
      const C = S.children, progs = D.programs, p = progs.find(x => String(x.id) === sf.p), h = num(sf.h, 1, 24, 15), it = C.items.find(x => x.key === sf.rel) || C.items[0];
      const fee = p ? p.price * h : 0, save = Math.round(fee * it.pct) / 100;
      const opts = facs().map(f => `<optgroup label="${esc(f)}">${progs.filter(x => x.faculty === f).map(x => `<option value="${x.id}" ${String(x.id) === sf.p ? 'selected' : ''}>${esc(progName(x))} – ${x.price} د.أ</option>`).join('')}</optgroup>`).join('');
      body = layout(`${field('s-rel', 'صلة الطالب', sel('s-rel', C.items.map(x => [x.key, `${x.label} – ${x.pct}%`]), it.key))}
          ${field('s-p', 'تخصص الطالب', `<select class="form-select form-select-sm" id="s-p"><option value="">اختر التخصص…</option>${opts}</select>`)}
          ${field('s-h', 'الساعات المسجلة في الفصل', inp('s-h', sf.h, 'min="1" max="24"'))}`,
        `${tot('المنحة التشجيعية حسب المادة (11)', it.pct + '%', `<strong>${esc(it.label)}</strong>${p ? ' · ' + esc(progName(p)) + ` · ${h} ساعة` : ' · اختر التخصص لحساب المبلغ'}`,
          p ? [['رسوم الساعات', JD(fee)], ['تخصم المنحة', JD(save)], ['رسوم الساعات بعدها', JD(fee - save)]] : [], 'ok')}
        ${h < C.min_hours ? `<div class="fn-alert mt-3"><i class="bi bi-exclamation-circle-fill"></i> المادة (12/ب): يشترط لاستمرار المنحة التشجيعية أن يدرس الطالب ما لا يقل عن (${C.min_hours}) ساعة معتمدة في الفصل، ويستثنى من ذلك الفصل الصيفي، وفصل التخرج.</div>` : ''}
        <p class="fn-formula"><i class="bi bi-calculator"></i> المنحة من «الرسوم الدراسية» أي رسوم الساعات؛ ويستثنى منها ما تذكره المادة (19) أدناه.</p>
        ${texts(C.doc ? 'grants_work' : 'grants_work', [C.intro, ...C.items.map(x => x.text), ...C.conditions, C.excluded])}`);
    } else if (sf.tab === 'teach') {
      const T = S.teaching, G = S.graduate, rate = (T.rates.find(x => x.key === sf.rank) || T.rates[0]).jd, load = T.loads.find(x => x.key === sf.rank);
      const taught = num(sf.load, 0, 40, 0), sup = num(sf.sup, 0, 30, 0), weeks = sf.weeks === '' ? null : num(sf.weeks, 1, 20, null);
      let normal = null, extra = 0, note = '', r = rate;
      if (sf.role === 'faculty') {
        normal = load && load.h != null ? load.h - (sf.dean ? 3 : 0) : null;
        const total = taught + sup;
        extra = normal == null || sf.dean ? 0 : Math.max(0, total - normal);
        if (sf.dean) note = 'المادة (9/د): يُخفض عبء العمداء (3) ساعات معتمدة، ولا يجوز القيام بأعباء تدريسية إضافية لهم في الفصل الاعتيادي.';
        else if (extra > T.max_extra) note = `المادة (9/ب): لا يجوز أن يزيد العبء الإضافي داخل الجامعة عن ثلاث ساعات معتمدة؛ أدخلت ${extra}.`;
      } else if (sf.role === 'part') { extra = taught; }
      else { extra = taught; r = rate / 2; if (taught > 3) note = 'المادة (9/ح): لا يتجاوز العبء التدريسي للموظف من الهيئة الإدارية 3 ساعات كحد أقصى.'; }
      const paid = sf.role === 'faculty' ? Math.min(extra, T.max_extra) : sf.role === 'admin' ? Math.min(extra, 3) : extra, amount = weeks ? paid * weeks * r : null;
      const ti = CAL && CAL.semesters ? termInfo(termNow()) : null, teachEnd = ti ? ti.s.events.find(e => /آخر يوم تدريس/.test(e.title)) : null;
      const pm = T.prorata.find(x => x.key === sf.ptype) || T.prorata[0], pst = sf.pst === '' ? null : num(sf.pst, 0, 500, null), phr = num(sf.phr, 0, 12, 3);
      body = layout(`${field('s-role', 'الصفة', sel('s-role', [['faculty', 'عضو هيئة تدريس متفرغ'], ['part', 'محاضر غير متفرغ'], ['admin', 'موظف من الهيئة الإدارية مكلّف بالتدريس']], sf.role))}
          ${field('s-rank', sf.role === 'faculty' ? 'الرتبة' : 'المرتبة المناظرة', sel('s-rank', T.rates.filter(x => sf.role !== 'faculty' || x.key !== 'ba').map(x => [x.key, `${x.label} – ${x.jd} د.أ`]), sf.rank))}
          ${field('s-load', 'الساعات المعتمدة التي تدرّسها في الفصل الاعتيادي', inp('s-load', sf.load, 'min="0" max="40" placeholder="مثال: 15"'))}
          ${sf.role === 'faculty' ? field('s-sup', 'طلبة ماجستير مسجّلون للرسالة تشرف عليهم (ضمن أول ثلاثة فصول)', inp('s-sup', sf.sup, 'min="0" max="30"')) + `<label class="form-check small"><input type="checkbox" class="form-check-input" id="s-dean" ${sf.dean ? 'checked' : ''}> عميد</label>` : ''}
          ${field('s-weeks', 'عدد أسابيع التدريس الفعلية في الفصل', inp('s-weeks', sf.weeks, 'min="1" max="20" placeholder="من جدولك الفعلي"'))}
          ${ti && ti.teach && teachEnd ? `<div class="fn-hint">التدريس في ${esc(ti.s.name)}: ${esc(dRange({ start: ti.teach.start, end: teachEnd.start }))} حسب التقويم الجامعي؛ أدخل عدد الأسابيع التي درّستها فعلاً.</div>` : ''}`,
        `${tot('مكافأة التدريس الإضافي حسب المادة (7) من تعليمات الرواتب والعلاوات', amount != null ? JD(amount) : '—',
          `${paid} ساعة معتمدة مدفوعة × ${weeks || '؟'} أسبوع × ${r} د.أ للساعة التدريسية الفعلية${sf.role === 'admin' ? ' (نصف قيمة المرتبة المناظرة)' : ''}`,
          [...(normal != null ? [['العبء المطلوب', `${normal} ساعة`]] : []), ['عبؤك المحسوب', `${taught + (sf.role === 'faculty' ? sup : 0)} ساعة`], ['الساعات الإضافية', `${paid} ساعة`]], extra && !note ? 'ok' : note ? 'bad' : '')}
        ${note ? `<div class="fn-alert mt-3"><i class="bi bi-exclamation-circle-fill"></i> ${esc(note)}</div>` : ''}
        <section class="card mt-3"><div class="card-header fw-bold fn-ch"><i class="bi bi-people"></i> شعبة دون الحد الأدنى لعدد الطلبة <small>المادة (10/د)</small></div><div class="card-body"><div class="row g-2 align-items-end">
          <div class="col-md-5">${field('s-ptype', 'نوع الشعبة', sel('s-ptype', T.prorata.map(x => [x.key, `${x.label} – ${x.n} طالباً`]), pm.key))}</div>
          <div class="col-md-3">${field('s-pst', 'الطلبة المسجلون', inp('s-pst', sf.pst, 'min="0" placeholder="مثال: 12"'))}</div><div class="col-md-4">${field('s-phr', 'ساعاتها المعتمدة', inp('s-phr', sf.phr, 'min="0" max="12"'))}</div></div>
          ${pst != null ? `<div class="fn-split fn-split-l mt-2"><div><small>الحد الأدنى للأجر الكامل</small><b>${pm.n} طالباً</b></div><div><small>العبء المحسوب للشعبة</small><b>${pst >= pm.n ? phr : Math.round(phr * pst / pm.n * 100) / 100} ساعة</b></div><div><small>النسبة</small><b>${pst >= pm.n ? '100%' : Math.round(pst / pm.n * 1000) / 10 + '%'}</b></div></div>
            <p class="fn-formula"><i class="bi bi-calculator"></i> ${pst >= pm.n ? 'العدد يبلغ الحد الأدنى: أجر إضافي كامل.' : `«إذا قل العدد عن ذلك فيُحسب العبء التدريسي بما يتناسب مع عدد الطلبة وفقاً لنظام Pro-Rata»: ${pst} ÷ ${pm.n}.`}</p>` : ''}</div></section>
        <section class="card mt-3"><div class="card-header fw-bold fn-ch"><i class="bi bi-mortarboard"></i> الإشراف والمناقشة والامتحان الشامل</div><div class="card-body">
          ${legal('النص الرسمي', [G.supervision.text, G.council.text], { open: true, cls: 'fn-legal-in mb-2' })}
          <p class="fn-formula mb-3"><i class="bi bi-info-circle"></i> ${esc(G.unpublished)} ورسوم الطالب نفسه منشورة في صفحة الرسوم: مناقشة الرسالة ${JD(D.masters.thesis_defense)}، والامتحان الشامل ${JD(D.masters.comprehensive)}.</p>
          <div class="row g-2 align-items-end"><div class="col-md-5">${field('s-council', 'جلسات مجلس الدراسات العليا (عضو من خارج الجامعة)', inp('s-council', sf.council, 'min="0" max="50"'))}</div><div class="col-md-7"><div class="fn-split fn-split-l"><div><small>المبلغ</small><b>${JD(num(sf.council, 0, 50, 0) * G.council.jd)}</b></div></div></div></div>
          <div class="small mt-2">${docLink('overtime_faculty')} · ${docLink('salaries')}</div></div></section>
        ${texts('salaries', [T.intro, ...T.rates.map(x => `${x.label}: ${x.jd} ${x.jd === 10 ? 'دنانير' : 'ديناراً'}`), ...T.more], 'مكافأة الساعة التدريسية – تعليمات الرواتب والعلاوات')}
        ${texts('overtime_faculty', [T.loads_intro, ...T.loads.map(x => `${x.label}: ${x.h != null ? x.h + ' ساعة معتمدة' : x.note}`), ...T.rules, T.prorata_intro, ...[...new Set(T.prorata.map(x => x.text))]], 'العبء التدريسي – تعليمات العمل الإضافي لأعضاء الهيئة التدريسية')}`);
    } else if (sf.tab === 'travel') {
      const V = S.travel, row = V.rows.find(x => x.key === sf.cat) || V.rows[0], n = num(sf.nights, 1, 120, 1), full = row.jd * n;
      let amt = full, how = `${n} ليلة × ${row.jd} د.أ`;
      if (sf.host === 'hosted') { amt = full * V.hosted_pct / 100; how = `${V.hosted_pct}% من المياومة (المادة 6/أ)`; }
      else if (sf.host === 'cash') { const c = num(sf.cash, 0, 100000, 0) * n; amt = Math.max(0, full - c); how = `الفرق بين المياومة و${JD(c)} تدفعها الجهة (المادة 6/ب)`; }
      else if (sf.host === 'acc') { const a = num(sf.acc, 0, 100000, 0) * n; amt = a + full * V.extra_pct / 100; how = `نفقات الإقامة ${JD(a)} مضافاً إليها ${V.extra_pct}% من المياومات (المادة 6/ج)`; }
      else if (sf.host === 'invite') { amt = full * V.invite_max_pct / 100; how = `حد أعلى لا يتجاوز ${V.invite_max_pct}% في حالات خاصة يقدّرها الرئيس (المادة 8/ب)`; }
      body = layout(`${field('s-cat', 'الفئة', sel('s-cat', V.rows.map(x => [x.key, `${x.label} – ${x.jd} د.أ`]), row.key))}
          ${field('s-nights', 'عدد ليالي المبيت خارج الأردن', inp('s-nights', sf.nights, 'min="1" max="120"'))}
          ${field('s-host', 'الضيافة', sel('s-host', [['none', 'بلا ضيافة'], ['hosted', 'في ضيافة الجهة الموفد إليها (عينية)'], ['cash', 'ضيافة غير عينية بمبلغ أقل من المياومة'], ['acc', 'نفقات الإقامة تتجاوز المياومة'], ['invite', 'دعوة رسمية من جهة خارجية']], sf.host))}
          ${sf.host === 'cash' ? field('s-cash', 'ما تدفعه الجهة لكل ليلة (د.أ)', inp('s-cash', sf.cash, 'min="0"')) : ''}${sf.host === 'acc' ? field('s-acc', 'نفقات الإقامة لكل ليلة (د.أ)', inp('s-acc', sf.acc, 'min="0"')) : ''}`,
        `${tot(V.unit, JD(amt), `<strong>${esc(row.label)}</strong> · ${esc(how)}`, [['المياومة لليلة', JD(row.jd)], ['الليالي', String(n)], ['المياومة الكاملة', JD(full)]], 'ok')}
        <section class="card mt-3"><div class="table-responsive"><table class="table tt-table fn-gtbl mb-0"><thead><tr><th>البيان</th><th class="text-center">${esc(V.unit)}</th></tr></thead><tbody>
          ${V.rows.map(x => `<tr class="${x.key === row.key ? 'mine' : ''}"><td><b>${esc(x.label)}</b></td><td class="text-center"><b class="fn-pct">${x.jd}</b></td></tr>`).join('')}<tr><td colspan="2" class="small">${esc(V.contract)} · ${esc(V.footnote)}</td></tr></tbody></table></div></section>
        ${texts('travel', [V.intro, ...V.rules])}`);
    } else if (sf.tab === 'overtime') {
      const O = S.overtime, sal = sf.sal === '' ? null : num(sf.sal, 0, 100000, null), hrs = num(sf.oth, 0, 400, 0), blocks = num(sf.blocks, 0, 60, 0);
      const net = Math.max(0, hrs - blocks * O.break), capped = Math.min(net, O.month_max), base = sal != null ? sal / O.days / O.hours : null;
      body = layout(`${field('s-sal', 'راتبك الشهري (د.أ)', inp('s-sal', sf.sal, 'min="0" placeholder="يُستعمل هنا فقط"'))}
          ${field('s-oth', 'ساعات العمل الإضافي هذا الشهر', inp('s-oth', sf.oth, 'min="0"'))}
          ${field('s-blocks', `مرات العمل المتواصل ${O.break_after} ساعات فأكثر في أيام الدوام (يُحسم نصف ساعة عن كل مرة)`, inp('s-blocks', sf.blocks, 'min="0"'))}`,
        `${tot('ساعات العمل الإضافي المحسوبة حسب التعليمات', `${Math.round(capped * 100) / 100} ساعة`, `بعد حسم ${blocks * O.break} ساعة (المادة 12)${net > O.month_max ? ` وبحد أقصى ${O.month_max} ساعة في الشهر (المادة 9)` : ''}`,
          [['أجر الساعة العادية', base != null ? JD(Math.round(base * 1000) / 1000) : '—'], ['أساس الحساب', `الراتب ÷ ${O.days} يوماً ÷ ${O.hours} ساعات`]], net > O.month_max ? 'bad' : '')}
        <div class="fn-alert mt-3"><i class="bi bi-info-circle-fill"></i> المادة (7/أ): المكافأة عن كل ساعة «تُحسب وفق ما ينص عليه قانون العمل والعمال»؛ لم تحدد التعليمات نسبتها، لذلك لا تحسب الصفحة المبلغ النهائي. أساس أجر الساعة من المادة (4): أيام الشهر (${O.days}) يوماً وساعات العمل اليومية (${O.hours}) ساعات.</div>
        ${texts('overtime_staff', O.texts)}`);
    } else {
      const W = S.children.work, hrs = num(sf.wh, 0, 400, 0), paid = Math.min(hrs, W.month_max);
      body = layout(field('s-wh', 'ساعات عمل الطالب هذا الشهر', inp('s-wh', sf.wh, 'min="0" placeholder="مثال: 30"')),
        `${tot('مكافأة تشغيل الطلبة حسب المادة (16)', JD(paid * W.rate), `${paid} ساعة × ${W.rate} دينار${hrs > W.month_max ? ` (الحد الأقصى ${W.month_max} ساعة في الشهر)` : ''}`, [['الحد الشهري', `${W.month_max} ساعة`], ['الحد طوال الدراسة', `${W.total_max} ساعة`], ['أعلى مكافأة شهرية', JD(W.month_max * W.rate)]], hrs > W.month_max ? 'bad' : 'ok')}
        ${texts('grants_work', W.text)}`);
    }
    $('#fn-staff').innerHTML = `${review(Object.keys(S.docs).map(k => 'staff:' + k).concat(['docs']))}
      ${kpis([[S.children.items[0].pct + '%', 'منحة أبناء العاملين وأزواجهم', 'bi-people', 'good', 'من الرسوم الدراسية'], [S.teaching.rates[0].jd + ' د.أ', 'أعلى مكافأة للساعة التدريسية', 'bi-easel', '', 'للأستاذ'], [S.travel.rows[S.travel.rows.length - 1].jd + '–' + S.travel.rows[0].jd, 'د.أ مياومة لليلة خارج الأردن', 'bi-airplane'], [S.overtime.month_max, 'ساعة حدّ العمل الإضافي في الشهر', 'bi-clock-history']])}
      <div class="fn-tabs no-print">${views('fn-stab', [['children', 'bi-people', 'منح أبناء العاملين'], ['teach', 'bi-easel', 'التدريس الإضافي والإشراف'], ['travel', 'bi-airplane', 'المياومات'], ['overtime', 'bi-clock-history', 'العمل الإضافي للموظفين'], ['work', 'bi-briefcase', 'تشغيل الطلبة']], sf.tab)}</div>
      ${body}
      <div class="fn-disclaimer"><i class="bi bi-exclamation-triangle-fill"></i> الأرقام والنصوص منقولة من ملفات التعليمات المنشورة في دليل القوانين والأنظمة والتعليمات، ويُقارن كل ملف بالنسخة التي نُقل منها في كل تحديث. الحساب استرشادي؛ القرار للجامعة وفق تعليماتها. لا يُحفظ ولا يُرسل أي شيء تُدخله هنا.</div>
      ${src([['regulations', 'دليل القوانين والأنظمة والتعليمات']])}`;
    const keys = { 's-rel': 'rel', 's-p': 'p', 's-h': 'h', 's-role': 'role', 's-rank': 'rank', 's-load': 'load', 's-sup': 'sup', 's-weeks': 'weeks', 's-ptype': 'ptype', 's-pst': 'pst', 's-phr': 'phr', 's-council': 'council',
      's-cat': 'cat', 's-nights': 'nights', 's-host': 'host', 's-cash': 'cash', 's-acc': 'acc', 's-sal': 'sal', 's-oth': 'oth', 's-blocks': 'blocks', 's-wh': 'wh' };
    let t;
    Object.entries(keys).forEach(([id, k]) => { const el = $('#' + id); if (!el) return;
      if (el.tagName === 'SELECT') el.addEventListener('change', e => { sf[k] = e.target.value; if (k === 'role' && sf.role === 'faculty' && sf.rank === 'ba') sf.rank = 'lect'; staffPage(); });
      else el.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { sf[k] = e.target.value; staffPage(); const x = $('#' + id); if (x) { x.focus(); try { x.setSelectionRange(x.value.length, x.value.length); } catch (_) {} } }, 450); }); });
    const dn = $('#s-dean'); if (dn) dn.addEventListener('change', e => { sf.dean = e.target.checked; staffPage(); });
    document.querySelectorAll('#fn-stab button').forEach(b => b.addEventListener('click', () => { sf.tab = b.dataset.v; const u = new URL(location.href); u.searchParams.set('tab', sf.tab); history.replaceState(null, '', u); staffPage(); }));
  }

  gate.then(() => Promise.all([U.getJSON('data/finance.json'), ['fn-calc', 'fn-pay', 'fn-staff'].includes(APP) ? U.getJSON('data/calendar.json').catch(() => null) : null]).then(([d, c]) => {
    D = d; CAL = c;
    U.updatedLine(d.updated, 'من الموقع الرسمي للجامعة · أسعار ' + d.year);
    const top = $('#pg-q');
    if (top) top.addEventListener('input', e => {
      if (APP === 'fn-fees') { st.q = e.target.value; const i = $('#fn-q'); if (i) i.value = st.q; fees(); }
      else if (APP === 'fn-pay') { ps.q = e.target.value; pay(); }
    });
    ({ 'fn-fees': fees, 'fn-calc': calc, 'fn-grants': grants, 'fn-pay': pay, 'fn-staff': staffPage }[APP] || (() => {}))();
  }).catch(() => { const el = document.getElementById(APP); if (el) el.innerHTML = '<div class="alert alert-warning">تعذّر تحميل بيانات الرسوم. أعد المحاولة بعد قليل.</div>'; }));
})();
