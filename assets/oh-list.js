/* Office hours of all instructors: by faculty, department or instructor; who has entered them (coverage by
   department); Excel/CSV export and a printed list with a QR code to each instructor's page. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { fac: P.get('fac') || '', dept: P.get('dept') || '', q: '', show: P.get('show') || 'all' };
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  let IDX, D;
  const depts = i => (i.department || '').split(', ').filter(Boolean);
  const list = oh => { const by = {}; (oh.slots || []).forEach(x => (by[x.day] ||= []).push(`${x.start}–${x.end}`)); return U.WEEK.filter(d => by[d]).map(d => [U.DAYS[d], by[d].join('، ')]); };

  function render() {
    const all = IDX.instructors.filter(i => i.sections);
    const facs = [...new Set(all.map(i => i.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const dps = [...new Set(all.filter(i => !st.fac || i.faculty === st.fac).flatMap(depts))].sort((a, b) => a.localeCompare(b, 'ar'));
    const scope = all.filter(i => (!st.fac || i.faculty === st.fac) && (!st.dept || depts(i).includes(st.dept)) && (!st.q || norm(i.name + ' ' + i.department).includes(norm(st.q))));
    const has = i => D.map[i.id] && (D.map[i.id].slots || []).length;
    const done = scope.filter(has);
    const rows = scope.filter(i => st.show === 'all' || (st.show === 'done' ? has(i) : !has(i)))
      .sort((a, b) => (a.department || '~').localeCompare(b.department || '~', 'ar') || a.name.localeCompare(b.name, 'ar'));
    const hoursAll = done.reduce((a, i) => a + OH.hours(D.map[i.id].slots), 0);
    const cov = {};
    scope.forEach(i => { const k = depts(i)[0] || 'قسم غير معروف'; const c = cov[k] || (cov[k] = { n: 0, d: 0, fac: i.faculty }); c.n++; if (has(i)) c.d++; });
    const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
    $('#ohl-app').innerHTML = `
      ${!D.live ? `<div class="alert ${D.cfg ? 'alert-light border' : 'alert-warning'} small"><i class="bi bi-info-circle"></i> ${D.cfg ? `تُعرض النسخة المحفوظة في الموقع (${D.updated ? 'آخر نسخ ' + U.ago(D.updated) : 'لا نسخة بعد'})؛ خدمة الحفظ غير متاحة الآن.` : 'لم يُفعَّل حفظ الساعات المكتبية بعد. بعد التفعيل يُدخل كل مدرس ساعاته من صفحته، وتظهر هنا مباشرة.'}</div>` : ''}
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div><label class="small fw-bold" for="ohl-fac">الكلية</label><select class="form-select form-select-sm" id="ohl-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="ohl-dept">القسم</label><select class="form-select form-select-sm" id="ohl-dept"><option value="">كل الأقسام</option>${dps.map(d => `<option ${d === st.dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="flex-grow-1"><label class="small fw-bold" for="ohl-q">المدرس</label><input class="form-control form-control-sm" id="ohl-q" value="${esc(st.q)}" placeholder="اسم المدرس…"></div>
        <div class="btn-group btn-group-sm" role="group">${[['all', 'الكل'], ['done', 'أدخلوا'], ['missing', 'لم يُدخلوا']].map(([k, l]) => `<button type="button" class="btn ${st.show === k ? 'btn-maroon' : 'btn-outline-maroon'}" data-show="${k}">${l}</button>`).join('')}</div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="ohl-csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ohl-print"><i class="bi bi-printer"></i> طباعة مع QR</button></div></div></div>
      <div class="row g-3 mb-3">
        ${[[scope.length, 'مدرس ضمن التصفية', 'bi-people-fill'], [`${done.length} (${pct(done.length, scope.length)}%)`, 'أدخلوا ساعاتهم', 'bi-check-circle-fill'],
          [scope.length - done.length, 'لم يُدخلوا بعد', 'bi-hourglass-split'], [done.length ? (hoursAll / done.length).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—', 'متوسط الساعات أسبوعياً', 'bi-clock-fill']]
          .map(([v, l, i]) => `<div class="col-6 col-xl-3"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${i}"></i> ${l}</div></div></div>`).join('')}
      </div>
      <div class="row g-3">
        <div class="col-xl-4"><section class="card"><div class="card-header"><i class="bi bi-bar-chart-fill"></i> الإدخال حسب القسم</div>
          <div class="table-responsive"><table class="table align-middle mb-0 tt-table oc-tbl"><thead><tr><th>القسم</th><th class="text-center">أدخلوا</th><th>النسبة</th></tr></thead><tbody>
          ${Object.entries(cov).sort((a, b) => pct(b[1].d, b[1].n) - pct(a[1].d, a[1].n) || a[0].localeCompare(b[0], 'ar')).map(([k, c]) => `<tr><td><a href="#" data-dept="${esc(k)}">${esc(k)}</a></td><td class="text-center">${c.d}/${c.n}</td>
            <td class="oc-u"><span class="oc-bar"><i style="width:${pct(c.d, c.n)}%;background:#15803d"></i></span><b>${pct(c.d, c.n)}%</b></td></tr>`).join('')}</tbody></table></div></section></div>
        <div class="col-xl-8"><section class="card"><div class="card-header"><i class="bi bi-person-raised-hand"></i> الساعات المكتبية <small class="text-muted">${rows.length} مدرس</small></div>
          <div class="ohl-list">${rows.map(i => { const oh = D.map[i.id], ok = has(i);
            return `<div class="ohl-row ${ok ? '' : 'missing'}"><span class="ohl-av">${i.photo ? `<img src="${esc(i.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i class="bi bi-person-fill"></i></span>
              <div class="ohl-who"><a href="instructor.html?id=${i.id}">${esc(i.name)}</a><small>${esc(i.department || 'قسم غير معروف')}${i.ext ? ` · فرعي <bdi dir="ltr">${esc(i.ext)}</bdi>` : ''}</small></div>
              <div class="ohl-when">${ok ? list(oh).map(([d, t]) => `<span><b>${esc(d)}</b> <bdi dir="ltr">${esc(t)}</bdi></span>`).join('') + `<small>${esc(oh.place || i.office || '')}${oh.mode && oh.mode !== 'وجاهي' ? ' · ' + esc(oh.mode) : ''}</small>`
                : `<em>لم تُدخل بعد</em><button type="button" class="btn btn-sm btn-link p-0" data-link="${esc(SITE + 'instructor.html?id=' + i.id + '&oh=edit')}"><i class="bi bi-link-45deg"></i> نسخ رابط الإدخال للمدرس</button>`}</div></div>`; }).join('')
            || '<p class="text-muted p-3 mb-0">لا مدرسين ضمن التصفية.</p>'}</div></section></div>
      </div>`;
    const go = () => { const u = new URL(location.href); ['fac', 'dept', 'show'].forEach(k => (st[k] && st[k] !== 'all') ? u.searchParams.set(k, st[k]) : u.searchParams.delete(k)); history.replaceState(null, '', u); render(); };
    $('#ohl-fac').addEventListener('change', e => { st.fac = e.target.value; st.dept = ''; go(); });
    $('#ohl-dept').addEventListener('change', e => { st.dept = e.target.value; go(); });
    let t; $('#ohl-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); const i = $('#ohl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { st.show = b.dataset.show; go(); }));
    document.querySelectorAll('[data-dept]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); st.dept = a.dataset.dept === 'قسم غير معروف' ? '' : a.dataset.dept; go(); }));
    document.querySelectorAll('[data-link]').forEach(b => b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.link).then(() => { b.innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; })));
    $('#ohl-csv').addEventListener('click', () => csv(rows));
    $('#ohl-print').addEventListener('click', () => print(rows, scope, done));
  }
  function csv(rows) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['المدرس', 'القسم', 'الكلية', 'الفرعي', 'البريد', 'الساعات المكتبية', 'ساعات أسبوعياً', 'المكان', 'الطريقة', 'ملاحظة', 'آخر تحديث', 'صفحة المدرس'].map(q).join(',')]
      .concat(rows.map(i => { const oh = D.map[i.id] || {}; return [i.name, i.department, i.faculty, i.ext, i.email, list(oh).map(([d, t]) => `${d} ${t}`).join(' | '),
        (oh.slots || []).length ? OH.hours(oh.slots) : '', oh.place || '', oh.mode || '', oh.note || '', oh.updated ? oh.updated.slice(0, 10) : '', SITE + 'instructor.html?id=' + i.id].map(q).join(','); }));
    U.download(`الساعات_المكتبية${st.dept ? '_' + st.dept : st.fac ? '_' + st.fac : ''}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function print(rows, scope, done) {
    const qr = url => { const q = qrcode(0, 'L'); q.addData(unescape(encodeURIComponent(url))); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); };
    printReport({
      title: 'الساعات المكتبية', subtitle: st.dept ? 'قسم ' + st.dept : st.fac || 'كل الكليات', orientation: 'landscape', source: IDX.term,
      stats: [['مدرس', scope.length], ['أدخلوا ساعاتهم', done.length], ['لم يُدخلوا', scope.length - done.length]],
      raw: `<style>.oq td{vertical-align:middle}.oq svg{width:54px;height:54px;display:block}.oq b{font-size:10pt}.oq small{display:block;color:#555}.oq .t span{display:block;font-size:9.5pt;font-weight:700}.oq .m{color:#999}</style>
        <table class="oq"><thead><tr><th style="width:62px">QR</th><th style="width:26%">المدرس</th><th>الساعات المكتبية</th><th style="width:16%">المكان والطريقة</th></tr></thead><tbody>
        ${rows.map(i => { const oh = D.map[i.id] || {}, ok = (oh.slots || []).length;
          return `<tr><td>${qr(SITE + 'instructor.html?id=' + i.id)}</td><td><b>${esc(i.name)}</b><small>${esc(i.department || '')}${i.ext ? ' · فرعي ' + esc(i.ext) : ''}</small></td>
            <td class="t">${ok ? list(oh).map(([d, t]) => `<span>${esc(d)}: <bdi dir="ltr">${esc(t)}</bdi></span>`).join('') : '<span class="m">لم تُدخل بعد</span>'}</td>
            <td>${ok ? esc([oh.place || i.office, oh.mode].filter(Boolean).join(' · ')) : ''}${oh.note ? `<small>${esc(oh.note)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table>`,
      note: 'امسح رمز أي مدرس لصفحته: جدوله الأسبوعي وساعاته المكتبية المحدَّثة وبيانات التواصل.',
    });
  }

  Promise.all([U.getJSON('data/instructors.json'), OH.load(), OH.config()]).then(([idx, oh, cfg]) => {
    IDX = idx; D = { ...oh, cfg: !!cfg.api };
    U.setDays({ 'ح': 'الأحد', 'ن': 'الاثنين', 'ث': 'الثلاثاء', 'ر': 'الأربعاء', 'خ': 'الخميس', 'س': 'السبت', 'ج': 'الجمعة' });
    $('#foot-count').textContent = `${idx.instructors.length} مدرس · ${idx.term}`;
    U.updatedLine(oh.updated || idx.updated, oh.live ? 'مباشرة من خدمة الحفظ' : 'النسخة المحفوظة في الموقع');
    render();
    $('#pg-q').addEventListener('input', e => { st.q = e.target.value; render(); });
  }).catch(e => { $('#ohl-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
