/* Organizational structure: the official chart (data/org.json, built hourly by scripts/update_org.py from the
   hand-transcribed chart and the staff directory), as a chart view and a searchable tree. Each box links to the
   people the directory lists for it. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  let D, BY = {}, PARENT = {};
  const P = new URLSearchParams(location.search);
  const st = { view: P.get('view') === 'tree' ? 'tree' : 'chart', q: '' };

  const KIND = {
    board: ['مجلس', 'bi-bank'], committee: ['لجنة', 'bi-people-fill'], president: ['رئاسة الجامعة', 'bi-person-badge-fill'],
    council: ['مجلس', 'bi-diagram-2-fill'], vp: ['نائب الرئيس', 'bi-person-workspace'], assistant: ['مساعد الرئيس', 'bi-person-fill-gear'],
    office: ['مكتب', 'bi-briefcase-fill'], clinic: ['عيادة', 'bi-heart-pulse-fill'], other: ['', 'bi-record-circle'],
    unit: ['وحدة', 'bi-grid-fill'], department: ['دائرة', 'bi-building-fill'], section: ['قسم', 'bi-diagram-3-fill'],
    deanship: ['عمادة', 'bi-award-fill'], faculty: ['كلية', 'bi-mortarboard-fill'], center: ['مركز', 'bi-bullseye'],
    'academic-dept': ['قسم أكاديمي', 'bi-journal-bookmark-fill'],
  };
  // display groups for the president's direct boxes (the reporting lines themselves are the official chart's)
  const GROUPS = [
    ['مكاتب ووحدات ترتبط بالرئيس', 'bi-briefcase-fill', ['pr', 'funding', 'asst-agreements', 'asst-legal', 'presidency-office', 'quality', 'scholarships', 'diwan']],
    ['الكليات', 'bi-mortarboard-fill', ['f13', 'f12', 'f4', 'f9', 'f11', 'f1', 'f3', 'f2', 'f5']],
    ['العمادات', 'bi-award-fill', ['research', 'student-affairs', 'admission']],
    ['مراكز ومكاتب', 'bi-bullseye', ['academic-development', 'library', 'safety', 'continuing', 'accreditation']],
    ['الدوائر والمراكز الإدارية والمالية', 'bi-building-fill', ['finance', 'hr', 'computer-center', 'supplies', 'general-services', 'projects']],
  ];
  const tone = n => n.kind === 'faculty' || n.kind === 'academic-dept' || (PARENT[n.id] && BY[PARENT[n.id]].kind === 'faculty') ? 'acad'
    : n.kind === 'board' || n.kind === 'committee' ? 'gold' : n.kind === 'president' || n.kind === 'vp' || n.kind === 'council' ? 'lead' : 'admin';
  const leaders = n => n.people.filter(p => p.role);
  // heads: the councils' official pages first (their positions name deans and directors), then the directory
  const off = m => ({ name: m.name, job: m.position, ext: m.ext, email: m.email, photo: m.photo, official: true });
  const headOf = n => (n.official_heads || []).map(off)[0] || leaders(n)[0] || (n.kind === 'academic-dept' ? n.people[0] : null);
  const kindLabel = n => KIND[n.kind][0];
  const dashMark = n => n.dashed || n.dashed_to ? ' <span class="org-dashmark" title="ارتباط بخط متقطع في المخطط الرسمي">┄</span>' : '';
  const kids = n => n.children || [];
  const official = n => kids(n).filter(c => !c.from_directory);
  const chain = id => { const out = []; for (let p = PARENT[id]; p; p = PARENT[p]) out.unshift(BY[p]); return out; };
  const dirLink = n => n.kind === 'academic-dept' ? `index.html?faculty=${encodeURIComponent(BY[PARENT[n.id]].unit.id)}&dept=${encodeURIComponent(n.dept)}`
    : n.unit ? `index.html?faculty=${encodeURIComponent(n.unit.id)}` : '';
  const staffCount = n => n.kind === 'academic-dept' ? n.count : n.unit ? n.unit.count : 0;
  const avatar = p => `<span class="org-av">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<i class="bi bi-person-fill"></i></span>`;

  // ------------------------------------------------------------------ search
  function hay(n) {
    return norm([n.name, ...n.people.map(p => p.name + ' ' + p.job), ...(n.official_heads || []).map(m => m.name + ' ' + m.position),
      ...(n.members || []).map(m => m.name + ' ' + m.position)].join(' '));
  }
  function hits(n) { return !st.q || st.q.split(/\s+/).every(w => hay(n).includes(w)); }
  function subtreeHits(n) { return hits(n) || kids(n).some(subtreeHits); }

  // ------------------------------------------------------------------ chart view
  function head(n, small) {
    const h = headOf(n);
    return h ? `<div class="org-head">${avatar(h)}<span><b>${esc(h.name)}</b><small>${esc(h.job || h.role)}</small></span></div>`
      : n.members ? `<div class="org-head"><small>${n.members.length} عضواً حسب صفحة المجلس الرسمية</small></div>`
      : small ? '' : '<div class="org-head none"><small>لا يظهر المسؤول في دليل الموظفين</small></div>';
  }
  function box(n, cls) {
    const c = staffCount(n), sub = official(n), acad = kids(n).filter(k => k.from_directory);
    const match = st.q && hits(n);
    return `<button type="button" class="org-box ${tone(n)} ${cls || ''}${match ? ' hit' : ''}" data-id="${esc(n.id)}">
      <span class="org-k"><i class="bi ${KIND[n.kind][1]}"></i> ${esc(kindLabel(n))}${dashMark(n)}</span>
      <b class="org-n">${esc(n.name)}</b>
      ${head(n, cls === 'mini')}
      ${c || sub.length || acad.length ? `<span class="org-chips">${c ? `<span><i class="bi bi-people-fill"></i> ${c} في الدليل</span>` : ''}${sub.length ? `<span><i class="bi bi-diagram-3"></i> ${sub.length} ${sub.length > 10 || sub.length < 3 ? 'وحدة تابعة' : 'وحدات تابعة'}</span>` : ''}${acad.length ? `<span><i class="bi bi-journal-bookmark"></i> ${acad.length} ${acad.length > 10 || acad.length < 3 ? 'قسم أكاديمي' : 'أقسام أكاديمية'}</span>` : ''}</span>` : ''}
    </button>`;
  }
  function subList(n) {
    const sub = official(n).filter(subtreeHits);
    if (!sub.length) return '';
    return `<ul class="org-sub">${sub.map(c => `<li><a href="#" data-id="${esc(c.id)}" class="${st.q && hits(c) ? 'hit' : ''}"><i class="bi ${KIND[c.kind][1]}"></i> ${esc(c.name)}${dashMark(c)}${headOf(c) ? `<small>${esc(headOf(c).name)}</small>` : ''}</a>${official(c).length ? `<ul>${official(c).map(g => `<li><a href="#" data-id="${esc(g.id)}"><i class="bi ${KIND[g.kind][1]}"></i> ${esc(g.name)}${dashMark(g)}</a></li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`;
  }
  function chart() {
    const b = D.tree, pres = BY.president, vp = BY['vp-academic'];
    const side = (list, title) => `<div class="org-side"><small>${title}</small>${list.map(c => `<button type="button" class="org-pill${st.q && hits(c) ? ' hit' : ''}" data-id="${esc(c.id)}"><i class="bi ${KIND[c.kind][1]}"></i> ${esc(c.name)}${c.members ? ` <span class="org-pc-n">${c.members.length}</span>` : ''}</button>`).join('')}</div>`;
    const top = `<section class="org-top">
        <div class="org-row">${side(kids(b).filter(c => c.kind === 'committee'), 'لجان المجلس')}${box(b, 'big')}
          <div class="org-side">${box(BY.audit, 'mini')}<small class="org-dash"><i class="bi bi-three-dots"></i> ترتبط برئيس الجامعة بخط متقطع</small></div></div>
        <i class="org-v"></i>
        <div class="org-row">${side(kids(pres).filter(c => c.kind === 'council'), 'المجالس')}${box(pres, 'big')}<div class="org-side">${box(vp, 'mini')}</div></div>
        <i class="org-v"></i></section>`;
    const groups = GROUPS.map(([title, icon, ids]) => {
      const nodes = ids.map(id => BY[id]).filter(subtreeHits);
      if (!nodes.length) return '';
      return `<section class="org-group"><h2><i class="bi ${icon}"></i> ${title} <span>${nodes.length}</span></h2>
        <div class="org-grid">${nodes.map(n => `<div class="org-cell">${box(n)}${subList(n)}</div>`).join('')}</div></section>`;
    }).join('');
    return top + (groups || '<div class="alert alert-light border">لا نتائج لهذا البحث.</div>');
  }

  // ------------------------------------------------------------------ tree view
  function tree() {
    const tel = ext => `tel:${D.main_line || '+96265799555'},${ext}`;
    // one row per box: the box, the person in charge (photo, position), and one-tap contacts
    const row = n => {
      const h = headOf(n), c = staffCount(n), link = dirLink(n), more = n.kind === 'academic-dept' ? n.people.length - 1 : 0;
      const who = h ? `<span class="org-tp">${avatar(h)}<span class="min-w-0"><b>${esc(h.name)}${more > 0 ? ` <em>+${more}</em>` : ''}</b><small>${esc(h.job || h.role || '')}</small></span></span>`
        : n.members ? `<span class="org-tp"><span class="org-stack">${n.members.slice(0, 5).map(avatar).join('')}</span><span><b>${n.members.length} عضواً</b><small>حسب صفحة المجلس الرسمية</small></span></span>`
        : n.kind === 'committee' ? '<span class="org-tp"></span>' : '<span class="org-tp none"><small>لا يظهر المسؤول في الدليل</small></span>';
      return `<div class="org-tr ${tone(n)}${st.q && hits(n) ? ' hit' : ''}">
        <span class="org-ti"><i class="bi ${KIND[n.kind][1]}"></i></span>
        <span class="org-tt min-w-0"><a href="#" data-id="${esc(n.id)}">${esc(n.name)}</a>${dashMark(n)}
          <small>${esc(kindLabel(n) || 'وحدة في المخطط')}${n.from_directory ? ' · من دليل الموظفين' : ''}${official(n).length ? ` · وحدات تابعة: ${official(n).length}` : ''}</small></span>
        ${who}
        <span class="org-ta">
          ${h && h.ext ? `<a class="org-chip" href="${tel(h.ext)}" title="اتصال: ${esc(h.name)}"><i class="bi bi-telephone-fill"></i> <bdi dir="ltr">${esc(h.ext)}</bdi></a>` : ''}
          ${h && h.email ? `<a class="org-chip ic" href="mailto:${esc(h.email)}" title="مراسلة: ${esc(h.email)}" aria-label="مراسلة ${esc(h.name)}"><i class="bi bi-envelope-fill"></i></a>` : ''}
          ${c && link ? `<a class="org-chip cnt" href="${link}" title="موظفوها في دليل الموظفين"><i class="bi bi-people-fill"></i> ${c}</a>` : ''}
          <a href="#" class="org-chip ic" data-id="${esc(n.id)}" title="التفاصيل" aria-label="تفاصيل ${esc(n.name)}"><i class="bi bi-info-circle-fill"></i></a>
        </span></div>`;
    };
    const li = n => {
      if (!subtreeHits(n)) return '';
      const ch = kids(n).map(li).join('');
      return ch ? `<li><details ${st.q || n.kind === 'board' || n.kind === 'president' ? 'open' : ''}><summary>${row(n)}</summary><ul>${ch}</ul></details></li>`
        : `<li class="leaf">${row(n)}</li>`;
    };
    return `<div class="card org-treecard"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-list-nested"></i> الشجرة الكاملة</span>
        <small class="text-muted">المسؤول، الفرعي، البريد، وعدد الموظفين لكل وحدة</small>
        <span class="ms-auto d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="o-open"><i class="bi bi-arrows-expand"></i> فتح الكل</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="o-close"><i class="bi bi-arrows-collapse"></i> طي الكل</button></span></div>
      <div class="card-body"><ul class="org-tree">${li(D.tree) || '<li class="text-muted">لا نتائج لهذا البحث.</li>'}</ul></div></div>`;
  }

  // ------------------------------------------------------------------ details
  function details(id) {
    const n = BY[id];
    if (!n) return;
    const path = chain(id);
    const row = p => `<div class="org-person">${avatar(p)}<div class="min-w-0"><b>${esc(p.name)}</b><small>${esc(p.job || p.role || '')}</small>
        <span class="org-pc">${p.ext ? `<a href="tel:${esc(D.main_line || '+96265799555')},${esc(p.ext)}"><i class="bi bi-telephone-fill"></i> <bdi dir="ltr">${esc(p.ext)}</bdi></a>` : ''}
        ${p.email ? `<a href="mailto:${esc(p.email)}" dir="ltr"><i class="bi bi-envelope-fill"></i> ${esc(p.email)}</a>` : ''}</span></div>
        ${p.role ? `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(p.role)}</span>` : ''}</div>`;
    const people = n.people.map(row).join('');
    const heads = (n.official_heads || []).map(m => row(off(m))).join('');
    const members = (n.members || []).map(m => row({ name: m.name, job: m.position, ext: m.ext, email: m.email, photo: m.photo,
      role: m.council_role && m.council_role !== 'عضو' ? m.council_role : '' })).join('');
    const sub = kids(n);
    const link = dirLink(n);
    U.modal(`<i class="bi ${KIND[n.kind][1]}"></i> ${esc(n.name)}`, `
      <nav class="org-path">${path.map(p => `<a href="#" data-id="${esc(p.id)}">${esc(p.name)}</a>`).join('<i class="bi bi-chevron-left"></i>') || '<span>أعلى الهيكل</span>'}</nav>
      ${n.note ? `<p class="small text-muted"><i class="bi bi-info-circle"></i> ${esc(n.note)}</p>` : ''}
      ${n.from_directory ? '<p class="small text-muted"><i class="bi bi-info-circle"></i> قسم أكاديمي من دليل الموظفين؛ المخطط الرسمي يتوقف عند مستوى الكلية.</p>' : ''}
      ${n.members ? `<h6 class="org-h">أعضاء المجلس (${n.members.length}) <a class="small fw-normal" href="${esc(n.members_page)}" target="_blank" rel="noopener">الصفحة الرسمية</a></h6>
        ${members || '<p class="text-muted small">تعذّرت قراءة قائمة الأعضاء.</p>'}` : ''}
      ${heads ? `<h6 class="org-h">المسؤول حسب صفحات المجالس الرسمية</h6>${heads}` : ''}
      ${n.members ? '' : `<h6 class="org-h">${n.kind === 'academic-dept' ? 'رئيس القسم' : 'الأشخاص المرتبطون بهذه الوحدة في الدليل'}</h6>
        ${people || '<p class="text-muted small">لا يظهر في دليل الموظفين مسمى وظيفي يذكر هذه الوحدة.</p>'}`}
      ${sub.length ? `<h6 class="org-h">الوحدات التابعة (${sub.length})</h6><div class="org-kids">${sub.map(c => `<a href="#" data-id="${esc(c.id)}" class="org-pill"><i class="bi ${KIND[c.kind][1]}"></i> ${esc(c.name)}</a>`).join('')}</div>` : ''}
      <div class="d-flex flex-wrap gap-2 mt-3">
        ${link ? `<a class="btn btn-sm btn-primary" href="${link}"><i class="bi bi-person-lines-fill"></i> كل موظفيها في الدليل (${staffCount(n)})</a>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="o-copy"><i class="bi bi-link-45deg"></i> نسخ رابط هذه الوحدة</button>
      </div>`);
    const m = $('#pgModal');
    m.querySelectorAll('[data-id]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); details(a.dataset.id); }));
    $('#o-copy').addEventListener('click', () => {
      const u = new URL(location.href); u.searchParams.set('u', id);
      navigator.clipboard.writeText(u.href).then(() => { $('#o-copy').innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; });
    });
  }

  // ------------------------------------------------------------------ page
  function status() {
    const o = D.official || {};
    const rev = `${esc(D.revision)} (${U.numDate(D.revision_date)})`;
    if (o.status === 'changed') {
      return `<div class="alert org-alert mb-3"><i class="bi bi-exclamation-triangle-fill"></i> <div><b>نشرت الجامعة نسخة جديدة من الهيكل التنظيمي</b>${o.revision ? ` (${esc(o.revision)})` : ''}، لوحظت ${U.ago(o.changed_since)}.
        المعروض هنا ما يزال النسخة ${rev} حتى تتم مراجعة النسخة الجديدة. <a href="${esc(D.source)}" target="_blank" rel="noopener">افتح النسخة الرسمية الجديدة</a></div></div>`;
    }
    return `<div class="org-ok mb-3"><i class="bi bi-patch-check-fill"></i> مطابق للمخطط الرسمي ${rev}، ويُقارَن بالنسخة المنشورة على موقع الجامعة كل ساعة.
      <a href="${esc(D.source)}" target="_blank" rel="noopener">المخطط الرسمي (PDF)</a></div>`;
  }
  function render() {
    const all = Object.values(BY);
    const n = k => all.filter(x => x.kind === k).length;
    const linked = all.filter(x => !x.from_directory && x.kind !== 'committee' && x.kind !== 'council' && (x.people.length || x.official_heads)).length;
    const linkable = all.filter(x => !x.from_directory && x.kind !== 'committee' && x.kind !== 'council').length;
    $('#org-app').innerHTML = `${status()}
      <div class="row g-3 mb-3">
        ${[[D.boxes, 'وحدة في المخطط الرسمي', 'bi-diagram-3-fill'], [n('faculty'), 'كليات', 'bi-mortarboard-fill'], [n('deanship'), 'عمادات', 'bi-award-fill'],
          [n('department'), 'دوائر', 'bi-building-fill'], [n('academic-dept'), 'قسم أكاديمي (من الدليل)', 'bi-journal-bookmark-fill'],
          [`${linked}/${linkable}`, 'وحدة مرتبطة بأشخاص في الدليل', 'bi-link-45deg']]
          .map(([v, l, i]) => `<div class="col-6 col-md-4 col-xl-2"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${i}"></i> ${l}</div></div></div>`).join('')}
      </div>
      <div class="org-bar mb-3">
        <div class="btn-group" role="group" aria-label="طريقة العرض">
          <button type="button" class="btn btn-sm ${st.view === 'chart' ? 'btn-maroon' : 'btn-outline-maroon'}" data-view="chart"><i class="bi bi-diagram-3-fill"></i> المخطط</button>
          <button type="button" class="btn btn-sm ${st.view === 'tree' ? 'btn-maroon' : 'btn-outline-maroon'}" data-view="tree"><i class="bi bi-list-nested"></i> الشجرة</button>
        </div>
        <div class="input-group input-group-sm org-search"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" id="o-q" type="search" placeholder="ابحث عن وحدة أو شخص: المالية، القبول، اسم…" value="${esc(P.get('q') || '')}"></div>
        <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="o-print"><i class="bi bi-printer"></i> طباعة / PDF</button>
      </div>
      <div id="org-view">${st.view === 'tree' ? tree() : chart()}</div>
      ${D.not_in_chart.length ? `<p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> وحدات في دليل الموظفين لا تظهر في المخطط الرسمي (${esc(D.revision)}):
        ${D.not_in_chart.map(u => `<a href="index.html?faculty=${encodeURIComponent(u.id)}">${esc(u.name)}</a>`).join('، ')}.</p>` : ''}
      <p class="small text-muted"><i class="bi bi-info-circle"></i> أسماء الوحدات وتبعياتها والخطوط المتقطعة (┄) كما في المخطط الرسمي حرفياً؛ تجميع الوحدات تحت العناوين أعلاه للعرض فقط. أعضاء المجالس من صفحاتها الرسمية، ومناصبهم فيها تحدّد المسؤول عن الوحدة المقابلة (العمداء ونائب الرئيس…)، ثم الأشخاص من مسمياتهم في دليل الموظفين. الأقسام الأكاديمية من الدليل لأن المخطط الرسمي يتوقف عند الكلية.</p>`;
    bind();
  }
  function redraw() { $('#org-view').innerHTML = st.view === 'tree' ? tree() : chart(); bindView(); }
  function bindView() {
    document.querySelectorAll('#org-view [data-id]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); details(a.dataset.id); }));
    // a call, e-mail or directory link inside a row follows the link without opening/closing the row
    document.querySelectorAll('.org-tree summary a:not([data-id])').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
    const open = $('#o-open'), close = $('#o-close');
    if (open) open.addEventListener('click', () => document.querySelectorAll('.org-tree details').forEach(d => { d.open = true; }));
    if (close) close.addEventListener('click', () => document.querySelectorAll('.org-tree details').forEach(d => { d.open = false; }));
  }
  function bind() {
    bindView();
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      st.view = b.dataset.view;
      const u = new URL(location.href); st.view === 'tree' ? u.searchParams.set('view', 'tree') : u.searchParams.delete('view');
      history.replaceState(null, '', u);
      document.querySelectorAll('[data-view]').forEach(x => { x.className = `btn btn-sm ${x.dataset.view === st.view ? 'btn-maroon' : 'btn-outline-maroon'}`; });
      redraw();
    }));
    let t;
    const onQ = v => { clearTimeout(t); t = setTimeout(() => { st.q = norm(v.trim()); redraw(); }, 200); };
    $('#o-q').addEventListener('input', e => { $('#pg-q').value = e.target.value; onQ(e.target.value); });
    $('#pg-q').addEventListener('input', e => { $('#o-q').value = e.target.value; onQ(e.target.value); });
    $('#o-print').addEventListener('click', print);
  }
  function print() {
    const rows = [];
    const walk = (n, depth) => {
      if (!subtreeHits(n)) return;
      const h = headOf(n);
      rows.push([(depth ? '  '.repeat(depth * 2) + '◂ ' : '') + n.name, KIND[n.kind][0], PARENT[n.id] ? BY[PARENT[n.id]].name : '—',
        h ? h.name : '', h ? h.ext : '', h ? h.email : '', staffCount(n) || '']);
      kids(n).forEach(c => walk(c, depth + 1));
    };
    walk(D.tree, 0);
    window.printReport({
      title: 'الهيكل التنظيمي', subtitle: `حسب المخطط الرسمي ${D.revision} (${U.numDate(D.revision_date)})`, orientation: 'landscape',
      source: 'المصدر: المخطط الرسمي على uop.edu.jo ودليل الموظفين',
      filters: st.q ? [['البحث', $('#o-q').value]] : [],
      stats: [['وحدة في المخطط', D.boxes], ['كلية', Object.values(BY).filter(x => x.kind === 'faculty').length], ['عمادة', Object.values(BY).filter(x => x.kind === 'deanship').length]],
      sections: [{ columns: ['الوحدة', 'النوع', 'تتبع لـ', 'المسؤول', 'الفرعي', 'البريد', 'في الدليل'], numCols: [4, 6], rows,
        widths: ['27%', '9%', '17%', '17%', '6%', '18%', '6%'] }].concat(Object.values(BY).filter(x => x.members && x.members.length).map(c => ({
          title: `أعضاء ${c.name} (${c.members.length})`, columns: ['#', 'الاسم', 'المنصب', 'في المجلس', 'الفرعي', 'البريد'], numCols: [0, 4],
          widths: ['4%', '22%', '36%', '10%', '8%', '20%'], rows: c.members.map((m, i) => [i + 1, m.name, m.position, m.council_role, m.ext, m.email]) }))),
      note: 'الأقسام الأكاديمية من دليل الموظفين؛ المخطط الرسمي يتوقف عند مستوى الكلية.',
    });
  }

  U.getJSON('data/org.json').then(d => {
    D = d;
    const index = (n, parent) => { BY[n.id] = n; if (parent) PARENT[n.id] = parent; kids(n).forEach(c => index(c, n.id)); };
    index(D.tree, null);
    $('#foot-count').textContent = `${D.boxes} وحدة · ${D.revision}`;
    U.updatedLine(d.updated, 'يُقارن بالمخطط الرسمي كل ساعة');
    $('#pg-actions').insertAdjacentHTML('afterbegin', `<a class="btn btn-update" href="${esc(D.source)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> المخطط الرسمي</a>`);
    if (P.get('q')) { st.q = norm(P.get('q')); $('#pg-q').value = P.get('q'); }
    render();
    if (P.get('u')) details(P.get('u'));
  }).catch(e => { $('#org-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
