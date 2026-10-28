/* «دليل الفرعيات»: the staff directory as an extension list for the desk — by faculty or unit, then department,
   leaders first (the directory's own order) — on screen and as a dense two-column A4 sheet with the main line and a
   QR code to the live page. ?u=<unit id>&all=1 (people without an extension too) */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { u: P.get('u') || '', all: P.get('all') === '1', types: (P.get('t') || 'academic,admin,board').split(','), q: '' };
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const TYPES = [['academic', 'الهيئة التدريسية'], ['admin', 'الكادر الإداري'], ['board', 'مجلس الأمناء']];
  let D, FAC, POS;

  function people() {
    const q = norm(st.q.trim());
    return D.members.filter(m => (!st.u || String(m.faculty) === st.u) && st.types.includes(m.type) && (st.all || m.ext)
      && (!q || norm([m.name, m.job, m.department, m.ext, m.office].join(' ')).includes(q)))
      .sort((a, b) => POS[a.faculty] - POS[b.faculty] || (a.department || '').localeCompare(b.department || '', 'ar') || a.sort - b.sort || a.rank_order - b.rank_order || a.name.localeCompare(b.name, 'ar'));
  }
  // units in the directory's order: the unit's leaders first, then its offices (no department), then each department
  const LEAD = new Set(['رئيس مجلس الأمناء', 'رئيس الجامعة', 'نائب رئيس الجامعة', 'عميد', 'نائب عميد', 'مساعد عميد / رئيس']);
  const LEADS = 'القيادة';
  const rank = d => d === LEADS ? 0 : d ? 2 : 1;
  function grouped(list) {
    const units = [];
    list.forEach(m => {
      let u = units[units.length - 1];
      if (!u || u.id !== m.faculty) units.push(u = { id: m.faculty, name: (FAC[m.faculty] || {}).name || '', depts: [] });
      const dn = LEAD.has(m.role) ? LEADS : m.department || '';
      let d = u.depts.find(x => x.name === dn);
      if (!d) u.depts.push(d = { name: dn, people: [] });
      d.people.push(m);
    });
    units.forEach(u => { u.depts.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'ar'));
      u.depts.forEach(d => d.people.sort((a, b) => a.sort - b.sort || a.rank_order - b.rank_order || a.name.localeCompare(b.name, 'ar'))); });
    return units;
  }

  const size = u => u.depts.reduce((a, d) => a + d.people.length, 0);
  const deptName = d => d.name || 'الإدارة والمكاتب';
  const row = m => `<div class="ph-row ${m.role ? 'lead' : ''}">
          <b class="ph-ext" dir="ltr">${esc(m.ext || '—')}</b><span class="ph-name"><a href="directory.html?q=${encodeURIComponent(U.shortName(m.name).split(' ').slice(0, 3).join(' '))}">${esc(m.name)}</a><small>${esc(m.job || '')}${m.office ? ' · ' + esc(m.office) : ''}</small></span></div>`;
  // one unit chosen: its sections side by side across the page, with a strip to jump to each
  const one = u => `<section class="ph-one"><h2>${esc(u.name)} <small>${size(u)}</small></h2>
      ${u.depts.length > 1 ? `<nav class="ph-toc">${u.depts.map((d, i) => `<a href="#ph-d${i}">${esc(deptName(d))} <small>${d.people.length}</small></a>`).join('')}</nav>` : ''}
      <div class="ph-depts" style="columns: 330px ${Math.min(4, u.depts.length)}">${u.depts.map((d, i) => `<section class="ph-dept${d.name === LEADS ? ' lead' : ''}" id="ph-d${i}"><h3>${esc(deptName(d))} <small>${d.people.length}</small></h3>
        <div class="ph-list">${d.people.map(row).join('')}</div></section>`).join('')}</div></section>`;

  function render() {
    const list = people(), units = grouped(list);
    $('#ph-app').innerHTML = `
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-3 align-items-end">
        <div><label class="small fw-bold" for="ph-u">الكلية / الوحدة</label><select class="form-select form-select-sm" id="ph-u"><option value="">الجامعة كاملة</option>
          ${D.faculties.map(f => `<option value="${esc(f.id)}" ${String(f.id) === st.u ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
        <div class="d-flex flex-wrap gap-3">${TYPES.map(([k, l]) => `<label class="form-check small mb-1"><input type="checkbox" class="form-check-input" data-type="${k}" ${st.types.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}
          <label class="form-check small mb-1"><input type="checkbox" class="form-check-input" id="ph-all" ${st.all ? 'checked' : ''}> ومن ليس له رقم فرعي</label></div>
        <div class="flex-grow-1"><label class="small fw-bold" for="ph-q">بحث</label><input class="form-control form-control-sm" id="ph-q" value="${esc(st.q)}" placeholder="اسم، وظيفة، قسم، فرعي…"></div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-maroon" id="ph-print"><i class="bi bi-printer"></i> طباعة (عمودان A4)</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ph-csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</button></div></div></div>
      <div class="ph-main"><i class="bi bi-telephone-fill"></i> الرقم الرئيسي للجامعة <b dir="ltr">${esc(D.main_line_display)}</b><span>ثم الرقم الفرعي</span>
        <small>${U.count(list.length, 'شخص واحد', 'شخصان', 'أشخاص', 'شخصاً')} · ${U.count(units.length, 'وحدة واحدة', 'وحدتان', 'وحدات', 'وحدة')}</small></div>
      ${units.length === 1 ? one(units[0]) : `<div class="ph-units">${units.map(u => `<section class="ph-unit"><h2>${esc(u.name)} <small>${size(u)}</small></h2>
        ${u.depts.map(d => `${d.name ? `<h3>${esc(d.name)}</h3>` : ''}<div class="ph-list">${d.people.map(row).join('')}</div>`).join('')}</section>`).join('')
        || '<p class="text-muted">لا أشخاص ضمن التصفية.</p>'}</div>`}`;
    const go = () => { const u = new URL(location.href); st.u ? u.searchParams.set('u', st.u) : u.searchParams.delete('u'); st.all ? u.searchParams.set('all', '1') : u.searchParams.delete('all');
      st.types.length === 3 ? u.searchParams.delete('t') : u.searchParams.set('t', st.types.join(',')); history.replaceState(null, '', u); render(); };
    $('#ph-u').addEventListener('change', e => { st.u = e.target.value; go(); });
    $('#ph-all').addEventListener('change', e => { st.all = e.target.checked; go(); });
    document.querySelectorAll('[data-type]').forEach(c => c.addEventListener('change', () => { st.types = [...document.querySelectorAll('[data-type]:checked')].map(x => x.dataset.type); go(); }));
    let t; $('#ph-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); const i = $('#ph-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#ph-print').addEventListener('click', () => print(list, units));
    $('#ph-csv').addEventListener('click', () => csv(list));
  }

  function qrSvg(url) {
    if (!window.qrcode) return '';
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }
  const prow = m => `<div class="r ${m.role ? 'l' : ''}"><b>${esc(m.ext || '—')}</b><span>${esc(m.name)}<small>${esc(m.job || '')}${m.office ? ' · ' + esc(m.office) : ''}</small></span></div>`;
  function print(list, units) {
    if (!list.length) return;
    const url = SITE + 'phones.html' + (st.u ? '?u=' + encodeURIComponent(st.u) : '');
    printReport({
      title: 'دليل الفرعيات', subtitle: st.u ? (FAC[st.u] || {}).name : 'جامعة البترا', orientation: 'portrait',
      stats: [['الرقم الرئيسي', D.main_line_display], ['عدد الأشخاص', list.length], ['تاريخ البيانات', U.numDate(D.updated)]],
      raw: `<style>.phq{display:flex;align-items:center;gap:10px;margin:6px 0 10px;font-size:8.5pt;color:#555}.phq svg{width:62px;height:62px}
        .cols{column-count:2;column-gap:18px;column-rule:1px solid #e3dccb}.u{break-inside:avoid-column}.u h3{font-size:10.5pt;margin:8px 0 3px;padding:3px 8px;background:#091b22;color:#fff;border-radius:5px;break-after:avoid}
        .u h4{font-size:9pt;margin:6px 0 2px;color:#901d23;border-bottom:1px solid #e3dccb;break-after:avoid}.r{display:grid;grid-template-columns:44px 1fr;gap:6px;padding:1.5px 0;border-bottom:1px dotted #e6e0d2;break-inside:avoid;font-size:8.6pt;line-height:1.35}
        .r b{font-size:10pt;color:#091b22;font-variant-numeric:tabular-nums;text-align:left;direction:ltr}.r small{display:block;color:#666;font-size:7.4pt}.r.l span{font-weight:700}
        .d{break-inside:avoid;border:1px solid #e3dccb;border-radius:6px;padding:0 7px 4px;margin:0 0 9px}.d h4{margin:0 -7px 3px;padding:4px 8px;background:#091b22;color:#fff;border:0;border-radius:5px 5px 0 0;font-size:9.5pt}
        .d h4 small{float:left;font-weight:400;opacity:.8}</style>
        <div class="phq">${qrSvg(url)}<span>النسخة الحية المحدّثة من الموقع الرسمي:<br><b dir="ltr">${esc(url.replace(/^https?:\/\//, ''))}</b><br>للاتصال من خارج الجامعة: ${esc(D.main_line_display)} ثم الفرعي.</span></div>
        <div class="cols">${units.length === 1 ? units[0].depts.map(d => `<div class="d"><h4>${esc(deptName(d))} <small>${d.people.length}</small></h4>${d.people.map(prow).join('')}</div>`).join('')
          : units.map(u => `<div class="u"><h3>${esc(u.name)}</h3>${u.depts.map(d => `${d.name ? `<h4>${esc(d.name)}</h4>` : ''}${d.people.map(prow).join('')}`).join('')}</div>`).join('')}</div>`,
    });
  }
  function csv(list) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['الكلية / الوحدة', 'القسم', 'الاسم', 'الوظيفة', 'الفرعي', 'المكتب'].map(q).join(',')]
      .concat(list.map(m => [(FAC[m.faculty] || {}).name, m.department, m.name, m.job, m.ext, m.office].map(q).join(',')));
    U.download(`دليل_الفرعيات_${st.u ? (FAC[st.u] || {}).name : 'الجامعة'}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  U.getJSON('data/staff.json').then(d => {
    D = d;
    FAC = Object.fromEntries(d.faculties.map(f => [String(f.id), f]));
    POS = Object.fromEntries(d.faculties.map((f, i) => [f.id, i]));
    U.updatedLine(d.updated, 'من الموقع الرسمي للجامعة');
    $('#pg-q').addEventListener('input', e => { st.q = e.target.value; render(); });
    render();
  }).catch(() => { $('#ph-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل دليل الموظفين. أعد المحاولة بعد قليل.</div>'; });
})();
