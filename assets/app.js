/* University of Petra staff directory – static version (data/staff.json, refreshed by scripts/update_data.py). */
(function () {
  'use strict';
  const FILTERS = ['q', 'type', 'faculty', 'dept', 'rank', 'role', 'source'];
  const TYPE_LABEL = { academic: 'أكاديمي', admin: 'إداري' };
  const LABELS = { q: 'بحث', type: 'النوع', faculty: 'الكلية', dept: 'القسم', rank: 'الرتبة', role: 'المنصب', source: 'المصدر' };
  let DATA = null, FAC = {}, SRC = {};

  // ---------------------------------------------------------------- helpers
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const depts = v => String(v || '').split('،').map(x => x.trim()).filter(Boolean);
  const initials = n => norm(n).replace(/^(ا ?د ?\.?|د ?\.|م ?\.|ا ?\.)\s*/, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '؟';

  function readState() {
    const p = new URLSearchParams(location.search);
    const st = {};
    FILTERS.forEach(k => st[k] = p.get(k) || '');
    st.view = p.get('view') || 'cards';
    st.sort = p.get('sort') || 'default';
    return st;
  }
  function writeState(st) {
    const p = new URLSearchParams();
    FILTERS.concat(['view', 'sort']).forEach(k => {
      if (st[k] && !(k === 'view' && st[k] === 'cards') && !(k === 'sort' && st[k] === 'default')) p.set(k, st[k]);
    });
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  function matches(m, st, skip) {
    if (st.q && skip !== 'q') {
      const q = norm(st.q.trim());
      const hay = norm([m.name, m.name_en, m.email, m.office, m.job, m.specialization, m.department, m.qualification].join(' '));
      if (!(hay.includes(q) || m.ext === st.q.trim())) return false;
    }
    if (st.type && skip !== 'type' && m.type !== st.type) return false;
    if (st.faculty && skip !== 'faculty' && String(m.faculty) !== st.faculty) return false;
    if (st.dept && skip !== 'dept' && !depts(m.department).includes(st.dept)) return false;
    if (st.rank && skip !== 'rank' && m.rank !== st.rank) return false;
    if (st.role && skip !== 'role' && !(st.role === 'any' ? !!m.role : m.role === st.role)) return false;
    if (st.source && skip !== 'source' && m.source !== st.source) return false;
    return true;
  }
  const count = (st, skip, key) => {
    const c = {};
    DATA.members.forEach(m => {
      if (!matches(m, st, skip)) return;
      (key === 'department' ? depts(m.department) : [m[key]]).forEach(v => { if (v !== '' && v != null) c[v] = (c[v] || 0) + 1; });
    });
    return c;
  };
  const SORTS = {
    default: (a, b) => 0,  // data file is already ordered by faculty, role, rank, name
    name: (a, b) => a.name.localeCompare(b.name, 'ar'),
    rank: (a, b) => a.rank_order - b.rank_order || a.sort - b.sort || a.name.localeCompare(b.name, 'ar'),
    ext: (a, b) => (!a.ext - !b.ext) || String(a.ext).localeCompare(String(b.ext), 'en', { numeric: true }) || a.name.localeCompare(b.name, 'ar'),  // no extension last
  };

  // ---------------------------------------------------------------- render
  function badges(m) {
    let h = m.type === 'academic'
      ? '<span class="badge badge-acad"><i class="bi bi-mortarboard-fill"></i> أكاديمي</span> '
      : '<span class="badge badge-admin"><i class="bi bi-briefcase-fill"></i> إداري</span> ';
    if (m.role) h += `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(m.role)}</span> `;
    if (m.rank) h += `<span class="badge rank-${m.rank_order}">${esc(m.rank)}</span>`;
    return h;
  }
  function avatar(m, size) {
    const img = m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<span class="avatar avatar-${size} ${m.type}">${img}<span class="ini">${esc(initials(m.name))}</span></span>`;
  }
  const tel = m => `${DATA.main_line},${m.ext}`;

  // the job line only when it says more than the type/rank badges ("عضو هيئة تدريس" on 180 academics says nothing new)
  const GENERIC_JOB = /^(عضو )?هيئة تدريس(ية)?$/;
  function jobText(m) {
    const j = String(m.job || '').replace(/^استاذ/, 'أستاذ').trim();
    if (!j || GENERIC_JOB.test(j) || j === m.rank) return '';
    return j;
  }
  // some sources put the extension in the office field too: show the office only when it is a real, different value
  const officeText = m => m.office && m.office !== m.ext ? m.office : '';
  function card(m) {
    const fac = FAC[m.faculty];
    const job = jobText(m), office = officeText(m);
    return `<div class="col"><div class="staff-card copy-email ${m.type}" data-email="${esc(m.email)}" title="${m.email ? 'انقر لنسخ البريد: ' + esc(m.email) : ''}">
      <div class="staff-top">${avatar(m, 'lg')}
        <div class="flex-grow-1 min-w-0"><h6 class="staff-name">${esc(m.name)}</h6>
          ${m.name_en ? `<div class="staff-en" dir="ltr">${esc(m.name_en)}</div>` : ''}<div class="mt-1">${badges(m)}</div></div></div>
      <div class="staff-body">
        ${job ? `<div class="staff-job"><i class="bi bi-person-badge"></i> ${esc(job)}</div>` : ''}
        <div class="staff-line"><i class="bi bi-bank2"></i> ${esc(fac ? fac.name : '—')}</div>
        ${m.department ? `<div class="staff-line"><i class="bi bi-diagram-3"></i> قسم ${esc(m.department)}</div>` : ''}
        ${m.specialization ? `<div class="staff-line text-muted"><i class="bi bi-lightbulb"></i> ${esc(m.specialization)}</div>`
          : m.qualification ? `<div class="staff-line text-muted"><i class="bi bi-mortarboard"></i> ${esc(m.qualification)}</div>` : ''}
      </div>
      <div class="staff-contact">
        <a ${m.ext ? `href="tel:${esc(tel(m))}"` : ''} class="${m.ext ? '' : 'disabled'}" title="${esc(DATA.main_line_display)}${m.ext ? ' – فرعي ' + esc(m.ext) : ''}"><i class="bi bi-telephone-fill"></i> ${esc(m.ext || '—')}</a>
        ${office ? `<span title="المكتب"><i class="bi bi-door-open-fill"></i> ${esc(office)}</span>` : ''}
        ${m.email ? `<a href="mailto:${esc(m.email)}" class="staff-mail" title="${esc(m.email)}" dir="ltr"><i class="bi bi-envelope-fill"></i> ${esc(m.email)}</a>` : ''}
      </div>
      <div class="staff-foot justify-content-end">
        ${m.profile ? `<a href="${esc(m.profile)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary py-0">${m.type === 'academic' ? 'الملف الرسمي' : 'صفحة الكادر'} <i class="bi bi-box-arrow-up-left"></i></a>` : ''}</div>
    </div></div>`;
  }
  function row(m) {
    const fac = FAC[m.faculty];
    return `<tr class="copy-email" data-email="${esc(m.email)}" title="${m.email ? 'انقر لنسخ البريد: ' + esc(m.email) : ''}">
      <td style="width:46px">${avatar(m, 'sm')}</td>
      <td><b>${esc(m.name)}</b>${m.name_en ? `<div class="small text-muted" dir="ltr" style="text-align:right">${esc(m.name_en)}</div>` : ''}</td>
      <td>${badges(m)}<div class="small">${esc(jobText(m))}</div></td>
      <td class="small">${esc(fac ? fac.name : '')}${m.department ? `<div class="text-muted">${esc(m.department)}</div>` : ''}</td>
      <td class="text-nowrap">${m.ext ? `<a href="tel:${esc(tel(m))}" class="badge text-bg-light border text-decoration-none"><i class="bi bi-telephone-fill"></i> ${esc(m.ext)}</a>` : '<span class="text-muted">—</span>'}</td>
      <td class="small">${esc(officeText(m) || '—')}</td>
      <td class="small">${m.email ? `<a href="mailto:${esc(m.email)}" dir="ltr">${esc(m.email)}</a>` : ''}</td>
      <td>${m.profile ? `<a href="${esc(m.profile)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary py-0" title="الملف الرسمي"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</td></tr>`;
  }
  function opts(list, selected, all) {
    return `<option value="">${all}</option>` + list.map(([v, label, n]) =>
      `<option value="${esc(v)}" ${String(v) === selected ? 'selected' : ''} ${n === 0 && String(v) !== selected ? 'disabled' : ''}>${esc(label)} (${n})</option>`).join('');
  }

  function deptHome() {
    const c = {};
    DATA.members.forEach(m => depts(m.department).forEach(d => { const f = (c[d] ||= {}); f[m.faculty] = (f[m.faculty] || 0) + 1; }));
    return Object.fromEntries(Object.entries(c).map(([d, f]) => [d, Object.keys(f).sort((a, b) => f[b] - f[a])[0]]));
  }
  function render() {
    const st = readState();
    const list = DATA.members.filter(m => matches(m, st)).sort(SORTS[st.sort] || SORTS.default);
    const all = DATA.members;
    const typeC = count(st, 'type', 'type'), facC = count(st, 'faculty', 'faculty'), deptC = count(st, 'dept', 'department');
    const rankC = count(st, 'rank', 'rank'), roleC = count(st, 'role', 'role'), srcC = count(st, 'source', 'source');
    // a department belongs to the faculty most of its members are in (some staff also list a department of another faculty)
    const home = deptHome();
    const deptsSorted = Object.keys(deptC).filter(d => !st.faculty || String(home[d]) === st.faculty).sort((a, b) => a.localeCompare(b, 'ar'));
    const totals = {
      all: all.length, academic: all.filter(m => m.type === 'academic').length, admin: all.filter(m => m.type === 'admin').length,
      leaders: all.filter(m => m.role).length, faculties: new Set(all.map(m => m.faculty).filter(id => FAC[id] && !FAC[id].unit)).size,
      depts: new Set(all.flatMap(m => depts(m.department))).size,
    };
    // per-faculty summary (other filters applied, faculty filter ignored)
    const sum = {};
    all.filter(m => matches(m, st, 'faculty')).forEach(m => { const s = sum[m.faculty] || (sum[m.faculty] = { a: 0, d: 0 }); m.type === 'academic' ? s.a++ : s.d++; });
    const top = Math.max(1, ...Object.values(sum).map(s => s.a + s.d));
    const active = FILTERS.filter(k => st[k]).map(k => {
      const value = k === 'type' ? TYPE_LABEL[st[k]] : k === 'faculty' ? (FAC[st[k]] || {}).name : k === 'source' ? (SRC[st[k]] || {}).name
        : k === 'role' && st[k] === 'any' ? 'أي منصب قيادي' : st[k];
      return `<a href="#" data-clear="${k}" class="badge rounded-pill text-bg-light border text-decoration-none filter-chip">${LABELS[k]}: ${esc(value)} <i class="bi bi-x-circle-fill"></i></a>`;
    }).join(' ');
    const kpi = (v, l, icon, color, href) => `<div class="col-6 col-md-4 col-xl-2"><a href="${href || '#'}" ${href ? '' : 'onclick="return false"'} class="text-decoration-none"><div class="stat-card" ${color ? `style="border-top-color:${color}"` : ''}><div class="v">${v}</div><div class="l"><i class="bi ${icon}"></i> ${l}</div></div></a></div>`;

    if (!$('#layout')) {  // page skeleton once; the parts below are refreshed on every change (keeps the drawer open)
      $('#app').innerHTML = `<div class="row g-3 mb-3" id="kpis"></div><div id="live-msg"></div>
        <div class="row g-3" id="layout">
          <aside class="col-lg-4 col-xl-3 no-print">
            <div class="offcanvas-lg offcanvas-end filter-drawer" tabindex="-1" id="fpanel" aria-labelledby="fpanel-title">
              <div class="offcanvas-header d-lg-none border-bottom"><h5 class="offcanvas-title fw-bold" id="fpanel-title"><i class="bi bi-funnel-fill"></i> التصفية</h5>
                <button type="button" class="btn-close ms-0" data-bs-dismiss="offcanvas" data-bs-target="#fpanel" aria-label="إغلاق"></button></div>
              <div class="offcanvas-body d-block p-3 p-lg-0"><div class="filter-sticky" id="panel"></div></div>
            </div>
          </aside>
          <section class="col-lg-8 col-xl-9"><div id="toolbar"></div><div id="results"></div></section>
        </div>`;
    }
    const nActive = FILTERS.filter(k => st[k]).length;
    $('#kpis').innerHTML = `
      ${kpi(totals.all, 'إجمالي الموظفين', 'bi-people-fill', '', '?')}
      ${kpi(totals.academic, 'أكاديمي', 'bi-mortarboard-fill', 'var(--uop-maroon)', '?type=academic')}
      ${kpi(totals.admin, 'إداري', 'bi-briefcase-fill', 'var(--uop-navy)', '?type=admin')}
      ${kpi(totals.leaders, 'مناصب قيادية', 'bi-star-fill', '#eda100', '?role=any')}
      ${kpi(totals.faculties, 'كليات', 'bi-bank2', '', '')}
      ${kpi(totals.depts, 'أقسام أكاديمية', 'bi-diagram-3-fill', '', '')}`;
    $('#panel').innerHTML = `
        <form class="card mb-3" id="filters" onsubmit="return false">
          <div class="card-header d-flex justify-content-between align-items-center"><span><i class="bi bi-funnel-fill"></i> التصفية</span>${active ? '<a href="#" data-clear="all" class="small">مسح الكل</a>' : ''}</div>
          <div class="card-body d-grid gap-2">
            <div class="input-group input-group-sm"><span class="input-group-text"><i class="bi bi-search"></i></span>
              <input class="form-control" name="q" value="${esc(st.q)}" placeholder="اسم، بريد، فرعي، مكتب، تخصص…"></div>
            <div class="btn-group btn-group-sm w-100" role="group">
              <input type="radio" class="btn-check" name="type" value="" id="t0" ${!st.type ? 'checked' : ''}><label class="btn btn-outline-secondary" for="t0">الكل</label>
              <input type="radio" class="btn-check" name="type" value="academic" id="t1" ${st.type === 'academic' ? 'checked' : ''}><label class="btn btn-outline-maroon" for="t1">أكاديمي <span class="badge text-bg-light">${typeC.academic || 0}</span></label>
              <input type="radio" class="btn-check" name="type" value="admin" id="t2" ${st.type === 'admin' ? 'checked' : ''}><label class="btn btn-outline-navy" for="t2">إداري <span class="badge text-bg-light">${typeC.admin || 0}</span></label>
            </div>
            <label class="small fw-bold mb-0" for="f-faculty">الكلية</label>
            <select class="form-select form-select-sm" name="faculty" id="f-faculty">${opts(DATA.faculties.map(f => [f.id, f.name, facC[f.id] || 0]), st.faculty, 'كل الكليات والوحدات')}</select>
            <label class="small fw-bold mb-0" for="f-dept">القسم الأكاديمي</label>
            <select class="form-select form-select-sm" name="dept" id="f-dept">${opts(deptsSorted.map(d => [d, d, deptC[d]]), st.dept, st.faculty ? 'كل الأقسام في الكلية' : 'كل الأقسام')}</select>
            <label class="small fw-bold mb-0" for="f-rank">الرتبة الأكاديمية</label>
            <select class="form-select form-select-sm" name="rank" id="f-rank">${opts(DATA.ranks.filter(r => rankC[r] || st.rank === r).map(r => [r, r, rankC[r] || 0]), st.rank, 'كل الرتب')}</select>
            <label class="small fw-bold mb-0" for="f-role">المنصب</label>
            <select class="form-select form-select-sm" name="role" id="f-role"><option value="">الكل</option><option value="any" ${st.role === 'any' ? 'selected' : ''}>أي منصب قيادي</option>
              ${DATA.roles.filter(r => roleC[r] || st.role === r).map(r => `<option value="${esc(r)}" ${st.role === r ? 'selected' : ''}>${esc(r)} (${roleC[r] || 0})</option>`).join('')}</select>
            <label class="small fw-bold mb-0" for="f-source">المصدر</label>
            <select class="form-select form-select-sm" name="source" id="f-source">${opts(DATA.sources.map(s => [s.key, s.name, srcC[s.key] || 0]), st.source, 'كل المصادر')}</select>
          </div>
        </form>
        <div class="card"><div class="card-header"><i class="bi bi-bar-chart-fill"></i> الموظفون حسب الكلية</div>
          <div class="card-body py-2">
            <div class="d-flex gap-3 small mb-2"><span><i class="legend-sw" style="background:var(--uop-maroon)"></i> أكاديمي</span><span><i class="legend-sw" style="background:var(--uop-navy)"></i> إداري</span></div>
            ${DATA.faculties.map(f => { const s = sum[f.id] || { a: 0, d: 0 }; return `
              <a class="fac-row text-decoration-none ${st.faculty === String(f.id) ? 'active' : ''}" href="#" data-faculty="${f.id}" title="${esc(f.name)}: ${s.a} أكاديمي، ${s.d} إداري">
                <span class="fac-name">${esc(f.name.replace('كلية ', ''))}</span>
                <span class="fac-bar"><i class="a" style="width:${100 * s.a / top}%"></i><i class="d" style="width:${100 * s.d / top}%"></i></span>
                <span class="fac-n">${s.a + s.d}</span></a>`; }).join('')}
          </div></div>`;
    $('#toolbar').innerHTML = `
        <div class="card mb-3 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
          <button type="button" class="btn btn-sm btn-outline-primary d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#fpanel" aria-controls="fpanel">
            <i class="bi bi-funnel-fill"></i> التصفية${nActive ? ` <span class="badge text-bg-primary">${nActive}</span>` : ''}</button>
          <b class="me-1">${list.length} موظف</b> ${active}
          <div class="ms-auto d-flex flex-wrap gap-2">
            <select class="form-select form-select-sm w-auto" id="sort">
              <option value="default" ${st.sort === 'default' ? 'selected' : ''}>ترتيب: الكلية والمنصب</option>
              <option value="name" ${st.sort === 'name' ? 'selected' : ''}>ترتيب: الاسم</option>
              <option value="rank" ${st.sort === 'rank' ? 'selected' : ''}>ترتيب: الرتبة</option>
              <option value="ext" ${st.sort === 'ext' ? 'selected' : ''}>ترتيب: الرقم الفرعي</option></select>
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn ${st.view === 'cards' ? 'btn-primary' : 'btn-outline-primary'}" data-view="cards"><i class="bi bi-grid-3x2-gap-fill"></i> بطاقات</button>
              <button type="button" class="btn ${st.view === 'table' ? 'btn-primary' : 'btn-outline-primary'}" data-view="table"><i class="bi bi-table"></i> جدول</button></div>
            <div class="dropdown"><button class="btn btn-sm btn-success dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-download"></i> تصدير</button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" data-export="xlsx"><i class="bi bi-file-earmark-excel text-success"></i> Excel</a></li>
                <li><a class="dropdown-item" href="#" data-export="csv"><i class="bi bi-filetype-csv"></i> CSV</a></li>
                <li><a class="dropdown-item" href="#" data-export="vcf"><i class="bi bi-person-vcard"></i> بطاقات اتصال (vCard)</a></li>
                <li><a class="dropdown-item" href="#" data-export="json"><i class="bi bi-filetype-json"></i> JSON</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" data-export="print"><i class="bi bi-printer"></i> طباعة / PDF</a></li></ul></div>
          </div></div></div>`;
    $('#results').innerHTML = `${!list.length ? `<div class="card"><div class="card-body text-center text-muted py-5"><i class="bi bi-person-x fs-1"></i><p class="mb-0 mt-2">لا يوجد موظفون مطابقون للتصفية.</p></div></div>`
          : st.view === 'table' ? `<div class="card"><div class="table-responsive" style="max-height:78vh"><table class="table table-uop table-sm table-hover align-middle mb-0">
              <thead class="sticky-top"><tr><th></th><th>الاسم</th><th>الوظيفة والرتبة</th><th>الكلية / القسم</th><th>الفرعي</th><th>المكتب</th><th>البريد الإلكتروني</th><th>الملف</th></tr></thead>
              <tbody>${list.map(row).join('')}</tbody></table></div></div>`
          : `<div class="row row-cols-1 row-cols-sm-2 row-cols-xl-3 row-cols-xxl-4 g-3">${list.map(card).join('')}</div>`}`;
    bind(list, st);
  }

  // ---------------------------------------------------------------- events
  function set(changes) {
    const st = Object.assign(readState(), changes);
    if ('faculty' in changes) st.dept = '';  // departments belong to a faculty
    writeState(st);
    render();
  }
  let qTimer;
  function bind(list, st) {
    const f = $('#filters');
    f.querySelectorAll('select, input[type=radio]').forEach(el => el.addEventListener('change', () => set({ [el.name]: el.value })));
    const q = f.querySelector('input[name=q]');
    q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { set({ q: q.value }); const n = $('#filters input[name=q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); });
    $('#top-q').value = st.q;
    document.querySelectorAll('[data-clear]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const k = a.dataset.clear;
      set(k === 'all' ? Object.fromEntries(FILTERS.map(x => [x, ''])) : { [k]: '' });
    }));
    document.querySelectorAll('[data-faculty]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); set({ faculty: a.dataset.faculty }); }));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => set({ view: b.dataset.view })));
    $('#sort').addEventListener('change', e => set({ sort: e.target.value }));
    document.querySelectorAll('[data-export]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); exportAs(a.dataset.export, list, st); }));
    document.querySelectorAll('.copy-email').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('a, button, input, select, label')) return;
      const email = el.dataset.email;
      if (!email) return toast('لا يوجد بريد إلكتروني لهذا الموظف', true);
      copyText(email).then(() => {
        toast('تم نسخ البريد: ' + email);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 900);
      });
    }));
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    return Promise.resolve();
  }
  let tTimer;
  function toast(msg, warn) {
    const el = $('#copy-toast');
    el.querySelector('span').textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.classList.add('show');
    clearTimeout(tTimer); tTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------------------------------------------------------------- live update (academic staff)
  // The university's academic-profile service allows cross-site requests, so the page can refresh its
  // academic staff straight from the official source. Administrative lists need a site session the
  // browser cannot send, so they keep the last saved update (refreshed weekly by the GitHub workflow).
  const API = 'https://services.uop.edu.jo/InstructorProfile/Services/api/MemberInfo/GetFaculty';
  const PHOTO_BASE = 'https://services.uop.edu.jo/InstructorProfile/ProfileImage/';
  const RANK_ORDER = { 'أستاذ': 1, 'أستاذ مشارك': 2, 'أستاذ مساعد': 3, 'مدرس': 4, 'محاضر': 5, 'مشرف مختبر': 6 };
  const ROLE_RULES = [
    [/نائب رئيس الجامعة|vice president/i, 'نائب رئيس الجامعة', 1], [/^(?!.*(نائب|مساعد)).*عميد|^dean/i, 'عميد', 2],
    [/نائب (ال)?عميد/i, 'نائب عميد', 3], [/مساعد (ال)?(عميد|رئيس)/i, 'مساعد عميد / رئيس', 4],
    [/رئيس قسم|head of/i, 'رئيس قسم', 5], [/مدير|director/i, 'مدير', 6]];
  const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  function roleOf(...t) {
    const text = t.filter(Boolean).map(cl).join(' ');
    if (/سكرت|مكتب|secretar/i.test(text)) return ['', 10];
    for (const [re, label, order] of ROLE_RULES) if (re.test(text)) return [label, order];
    return ['', 10];
  }
  const KEY_FIELDS = ['name', 'job', 'rank', 'role', 'department', 'ext', 'office', 'email', 'photo_src', 'faculty'];
  async function liveUpdate(btn) {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جارٍ التحديث…';
    try {
      const get = url => fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
      const snapshot = fetch(`data/staff.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      const lists = await Promise.all(DATA.faculties.filter(f => !f.unit).map(f => get(`${API}?fact=${f.id}&deptID=0`)).concat([get(`${API}?fact=0&deptID=0`)]));
      const snap = await snapshot;
      if (snap && snap.updated >= DATA.updated) {  // newer automatic update of the administrative staff
        DATA.members = DATA.members.filter(m => m.type === 'academic').concat(snap.members.filter(m => m.type !== 'academic'));
        DATA.sources = snap.sources;
        DATA.updated = snap.updated;
      }
      const people = new Map();
      lists.flat().forEach(d => {
        const enc = d.enc;
        if (!enc) return;
        const dept = cl(d.DeptNameArabic);
        if (people.has(enc)) {
          const p = people.get(enc);
          if (dept && !p.department.includes(dept)) p.department += `، ${dept}`;
          return;
        }
        const fid = parseInt(d.FacultyID || 0, 10), fac = FAC[fid];
        const rank = cl(d.AcademicRankArabic).replace(/استاذ/g, 'أستاذ');
        const job = cl(d.JobTitleArabic), [role, order] = roleOf(job, cl(d.JobTitle));
        const img = cl(d.ImagePath);
        people.set(enc, {
          id: `A:${enc}`, type: 'academic', faculty: fac ? fid : null, name: cl(d.FullNameAr) || cl(d.FullNameEn), name_en: cl(d.FullNameEn),
          job, rank, rank_order: RANK_ORDER[rank] || 9, role, sort: order, department: dept,
          specialization: [cl(d.GeneralSpecializationArabic), cl(d.SpecificSpecializationArabic)].filter(Boolean).join(' – '),
          qualification: '', ext: cl(d.Extention), office: cl(d.OfficeNumber), email: cl(d.UniversityEmail).toLowerCase(),
          photo_src: img ? PHOTO_BASE + encodeURIComponent(img).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) : '',  // same encoding as scripts/update_data.py
          profile: `${fac ? fac.site : 'https://www.uop.edu.jo'}/Ar/Pages/AcademicStaffInfo.aspx?uid=${enc}`, source: 'academic_api',
        });
      });
      const fresh = [...people.values()];
      const stored = new Map(DATA.members.concat(snap ? snap.members : []).map(m => [m.id, m]));
      fresh.forEach(m => {  // reuse the site's copy of an unchanged photo; a new photo is shown from the source
        const o = stored.get(m.id);
        m.photo = o && o.photo_src === m.photo_src ? o.photo : m.photo_src;
      });
      if (fresh.length < 50) throw new Error('عدد غير متوقع من السجلات');
      const before = new Map(DATA.members.filter(m => m.type === 'academic').map(m => [m.id, m]));
      const added = fresh.filter(m => !before.has(m.id));
      const changed = fresh.filter(m => before.has(m.id) && KEY_FIELDS.some(k => String(before.get(m.id)[k] || '') !== String(m[k] || '')));
      const freshIds = new Set(fresh.map(m => m.id));
      const removed = [...before.values()].filter(m => !freshIds.has(m.id));
      const order = Object.fromEntries(DATA.faculties.map((f, i) => [f.id, i]));
      const pos = id => (id in order ? order[id] : 99);
      DATA.members = fresh.concat(DATA.members.filter(m => m.type !== 'academic'))
        .sort((a, b) => (pos(a.faculty) - pos(b.faculty)) || a.sort - b.sort || a.rank_order - b.rank_order || a.name.localeCompare(b.name, 'ar'));
      DATA.live = new Date().toISOString();
      (DATA.sources.find(x => x.key === 'academic_api') || {}).count = fresh.length;
      try { localStorage.setItem('uopstaff-live', JSON.stringify({ at: DATA.live, academic: fresh })); } catch (e) { /* storage unavailable */ }
      showUpdated();
      const names = list => list.slice(0, 12).map(m => esc(m.name)).join('، ') + (list.length > 12 ? ' …' : '');
      $('#live-msg').innerHTML = `<div class="alert alert-success alert-dismissible fade show no-print">
        <b><i class="bi bi-check-circle-fill"></i> تم التحديث من الموقع الرسمي:</b> ${fresh.length} عضو هيئة تدريس —
        جديد <b>${added.length}</b>، معدّل <b>${changed.length}</b>، لم يعد ظاهراً <b>${removed.length}</b>.
        ${added.length ? `<div class="small mt-1"><b>الجدد:</b> ${names(added)}</div>` : ''}
        ${removed.length ? `<div class="small mt-1"><b>لم يعودوا ظاهرين:</b> ${names(removed)}</div>` : ''}
        <div class="small text-muted mt-1">الكادر الإداري من المراجعة التلقائية التي تجري كل ساعة (آخر تغيير ${esc(ago(DATA.updated))}).</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="إغلاق"></button></div>`;
      render();
      btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> تم';
      btn.classList.add('done');
      setTimeout(() => { btn.disabled = false; btn.classList.remove('done'); btn.innerHTML = old; }, 4000);
      $('#live-msg').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      toast('تعذّر الاتصال بالموقع الرسمي الآن (' + e.message + ')؛ البيانات المعروضة من آخر تحديث محفوظ.', true);
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
  function ago(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 2) return 'قبل لحظات';
    // Arabic number agreement: 1 / 2 (dual) / 3–10 (plural) / 11+ (singular accusative)
    const say = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
    if (min < 60) return 'قبل ' + say(min, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    const h = Math.round(min / 60);
    if (h < 24) return 'قبل ' + say(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    const d = Math.round(h / 24);
    return 'قبل ' + say(d, 'يوم', 'يومين', 'أيام', 'يوماً');
  }
  function showUpdated() {
    const fmt = d => new Date(d).toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    $('#updated').innerHTML = DATA.live
      ? 'محدّث الآن من الموقع الرسمي'
      : 'يُراجَع تلقائياً كل ساعة';
    $('#updated').title = `آخر تغيير في البيانات: ${fmt(DATA.updated)} (${ago(DATA.updated)})`;
  }

  // ---------------------------------------------------------------- exports
  const COLUMNS = ['الاسم', 'Name', 'النوع', 'الوظيفة', 'المنصب', 'الرتبة', 'الكلية', 'القسم', 'التخصص / المؤهل', 'الهاتف', 'الفرعي', 'المكتب', 'البريد الإلكتروني', 'الملف الرسمي', 'الصورة'];
  const rowOf = m => [m.name, m.name_en, TYPE_LABEL[m.type], m.job, m.role, m.rank, (FAC[m.faculty] || {}).name || '', m.department,
    m.specialization || m.qualification, DATA.main_line_display, m.ext, m.office, m.email, m.profile, m.photo];
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportAs(kind, list) {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `دليل_موظفي_جامعة_البترا_${stamp}`;
    if (kind === 'print') return window.print();
    if (kind === 'json') return download(base + '.json', JSON.stringify(list.map(m => Object.fromEntries(COLUMNS.map((c, i) => [c, rowOf(m)[i]]))), null, 1), 'application/json');
    if (kind === 'csv') {
      const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csv = [COLUMNS].concat(list.map(rowOf)).map(r => r.map(q).join(',')).join('\r\n');
      return download(base + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');  // BOM so Excel reads Arabic
    }
    if (kind === 'vcf') {
      const v = list.map(m => ['BEGIN:VCARD', 'VERSION:3.0', `FN;CHARSET=UTF-8:${m.name}`, m.name_en ? `NICKNAME:${m.name_en}` : '',
        `ORG;CHARSET=UTF-8:جامعة البترا;${(FAC[m.faculty] || {}).name || ''}`, [m.job, m.rank].filter(Boolean).length ? `TITLE;CHARSET=UTF-8:${[m.job, m.rank].filter(Boolean).join(' – ')}` : '',
        m.ext ? `TEL;TYPE=WORK:${DATA.main_line},${m.ext}` : '', m.email ? `EMAIL;TYPE=WORK:${m.email}` : '', m.profile ? `URL:${m.profile}` : '',
        m.office ? `NOTE;CHARSET=UTF-8:مكتب ${m.office}` : '', 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n');
      return download(base + '.vcf', v, 'text/vcard');
    }
    if (kind === 'xlsx') {
      if (!window.XLSX) return toast('مكتبة Excel لم تُحمَّل بعد؛ حاول بعد لحظة أو استخدم CSV', true);
      const ws = XLSX.utils.aoa_to_sheet([COLUMNS].concat(list.map(rowOf)));
      ws['!cols'] = COLUMNS.map((c, i) => ({ wch: [30, 28, 8, 28, 16, 14, 28, 28, 34, 12, 8, 14, 30, 40, 40][i] }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, 'الموظفون');
      return XLSX.writeFile(wb, base + '.xlsx');
    }
  }

  // ---------------------------------------------------------------- start
  fetch('data/staff.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    DATA = d;
    d.faculties.forEach(f => FAC[f.id] = f);
    d.sources.forEach(s => SRC[s.key] = s);
    // a live update made in this browser is kept until the saved data is newer than it
    try {
      const c = JSON.parse(localStorage.getItem('uopstaff-live') || 'null');
      if (c && c.academic && c.at > d.updated) {
        d.members = c.academic.concat(d.members.filter(m => m.type !== 'academic'));
        d.live = c.at;
      }
    } catch (e) { /* storage unavailable */ }
    showUpdated();
    $('#foot-count').textContent = `${d.members.length} موظفاً`;
    $('#foot-sources').textContent = `${d.sources.length} مصدراً`;
    $('#foot-updated').textContent = new Date(d.updated).toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
    $('#top-q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => set({ q: e.target.value }), 300); });
    render();
    $('#live-update').addEventListener('click', e => liveUpdate(e.currentTarget));
  }).catch(err => {
    $('#app').innerHTML = `<div class="alert alert-danger mt-3"><i class="bi bi-exclamation-octagon-fill"></i> تعذّر تحميل بيانات الدليل (${esc(err.message)}). إن فتحت الملف مباشرة من الجهاز، شغّله عبر خادم ويب (انظر README).</div>`;
  });
})();
