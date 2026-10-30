/* «الخطط الدراسية»: every study plan of every faculty, as published on the university portal (edugate.uop.edu.jo/studyPlans),
   refreshed with the hourly update. Four views:
     plan     – one major's plan: requirement groups, hours, every course and whether it is offered this term (from the timetable)
     all      – every plan side by side: total hours and how they split between required, elective and free
     courses  – every course across the plans: which plans include it, in which group, and its sections this term
     compare  – two plans: shared courses and the courses of each one alone
   Deep links: ?plan=<id>&view=plan|all|courses|compare&b=<id of the second plan>&deg=&fac=&dept=&q=  */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { view: P.get('view') || 'plan', deg: P.get('deg') || '', fac: P.get('fac') || '', dept: P.get('dept') || '', plan: P.get('plan') || '', b: P.get('b') || '',
    q: P.get('q') || '', pv: P.get('pv') || 'table', kind: '', act: '', offered: '', sort: 'major' };
  let D, PLANS, BYID, TT = {};
  const KIND = { required: ['إجباري', 'sp-k-req', 'bi-lock-fill'], elective: ['اختياري', 'sp-k-el', 'bi-ui-checks'], free: ['حر', 'sp-k-free', 'bi-stars'], remedial: ['استدراكي', 'sp-k-rem', 'bi-arrow-counterclockwise'] };
  // a stable colour for each kind of group, in the order the portal lists them
  const GCOL = ['#901d23', '#0b4a66', '#0f766e', '#b8892b', '#6d28d9', '#c2410c', '#475569', '#be185d', '#15803d', '#1d4ed8', '#a16207', '#64748b'];
  // a group's name without «(اجبارية)»; «(اختيارية)» stays, so the required and elective groups of one level read apart
  const groupKey = n => n.replace(/\s*\((اجبارية|حرة)\)\s*$/, '').trim();
  const kindOf = g => g.kind || (/استدراك/.test(g.name) ? 'remedial' : /اختيار/.test(g.name) ? 'elective' : /حرة/.test(g.name) ? 'free' : 'required');
  let GROUPS = [];  // every group name across the plans, for the colours and the legend
  const gcol = name => GCOL[GROUPS.indexOf(groupKey(name)) % GCOL.length];
  const secs = c => (TT[c.code] || []);
  // two versions of one major's plan are both published: the version tells them apart
  const label = p => `${p.major}${p.degree !== 'البكالوريوس' ? ' – ' + p.degree : ''}${p._twin ? ` (خطة ${p.version})` : ''}`;

  // ---------------------------------------------------------------- figures of one plan
  function figures(p) {
    const f = { req: 0, el: 0, free: 0, rem: 0, courses: 0, offered: 0, hoursListed: 0 };
    p.groups.forEach(g => {
      const k = kindOf(g), h = g.required_hours || 0;
      if (k === 'required') f.req += h; else if (k === 'elective') f.el += h; else if (k === 'remedial') f.rem += h; else f.free += h;
      f.courses += g.courses.length;
      f.offered += g.courses.filter(c => secs(c).length).length;
      f.hoursListed += g.courses.reduce((a, c) => a + (c.hours || 0), 0);
    });
    f.sum = f.req + f.el + f.free;
    return f;
  }
  const scoped = () => PLANS.filter(p => (!st.deg || p.degree === st.deg) && (!st.fac || p.faculty === st.fac) && (!st.dept || p.dept === st.dept));
  const qMatch = c => { const q = norm(st.q.trim()); return !q || norm(c.code + ' ' + c.name).includes(q); };

  // ---------------------------------------------------------------- the filter bar (shared by every view)
  function bar() {
    const degs = [...new Set(PLANS.map(p => p.degree))];
    const facs = [...new Set(PLANS.filter(p => !st.deg || p.degree === st.deg).map(p => p.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));
    const depts = [...new Set(PLANS.filter(p => (!st.deg || p.degree === st.deg) && (!st.fac || p.faculty === st.fac)).map(p => p.dept))].sort((a, b) => a.localeCompare(b, 'ar'));
    const list = scoped();
    const views = [['plan', 'الخطة', 'bi-journal-text'], ['all', 'كل الخطط', 'bi-grid-3x3-gap'], ['courses', 'المقررات', 'bi-search'], ['compare', 'مقارنة خطتين', 'bi-layout-split']];
    const seg = (key, attr, opts, lab) => `<div class="sp2-seg" role="group" aria-label="${lab}"><span>${lab}</span>${opts.map(([k, l]) => `<button type="button" class="${st[key] === k ? 'on' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;
    const sel = (id, lab, opts, cur, all, cls) => `<label class="sp2-sel ${cls || ''}" title="${lab}"><small>${lab}</small><select class="form-select form-select-sm" id="${id}" aria-label="${lab}">${all != null ? `<option value="">${all}</option>` : ''}${opts}</select></label>`;
    const nFilt = [st.q, st.kind, st.act, st.offered].filter(Boolean).length;
    return `<div class="sp2-bar no-print">
      <div class="sp2-r1">
        <div class="sp2-views" role="tablist" aria-label="طريقة العرض">${views.map(([k, l, i]) =>
          `<button type="button" role="tab" aria-selected="${st.view === k}" class="${st.view === k ? 'on' : ''}" data-view="${k}"><i class="bi ${i}"></i><span>${l}</span></button>`).join('')}</div>
        <span class="sp2-vr"></span>
        ${sel('sp-deg', 'الدرجة', degs.map(d => `<option ${d === st.deg ? 'selected' : ''}>${esc(d)}</option>`).join(''), st.deg, 'كل الدرجات')}
        ${sel('sp-fac', 'الكلية', facs.map(d => `<option ${d === st.fac ? 'selected' : ''}>${esc(d)}</option>`).join(''), st.fac, 'كل الكليات')}
        ${sel('sp-dept', 'القسم', depts.map(d => `<option ${d === st.dept ? 'selected' : ''}>${esc(d)}</option>`).join(''), st.dept, 'كل الأقسام')}
        ${sel('sp-plan', `التخصص (${list.length})`, list.map(p => `<option value="${esc(p.id)}" ${p.id === st.plan ? 'selected' : ''}>${esc(label(p))}</option>`).join(''), st.plan, null, 'grow')}
        <div class="sp2-ex" role="group" aria-label="تصدير"><button type="button" id="sp-xls" title="تصدير Excel"><i class="bi bi-file-earmark-excel"></i></button><button type="button" id="sp-csv" title="تصدير CSV"><i class="bi bi-filetype-csv"></i></button><button type="button" id="sp-print" title="طباعة"><i class="bi bi-printer"></i></button></div>
      </div>
      ${st.view === 'plan' || st.view === 'courses' ? `<div class="sp2-r2">
        <label class="sp2-q"><i class="bi bi-search"></i><input id="sp-q" type="search" value="${esc(st.q)}" placeholder="ابحث برمز المقرر أو اسمه…" aria-label="بحث في المقررات"></label>
        ${seg('kind', 'kind', [['', 'الكل'], ['required', 'إجباري'], ['elective', 'اختياري'], ['free', 'حر'], ['remedial', 'استدراكي']], 'النوع')}
        ${seg('act', 'act', [['', 'الكل'], ['نظري', 'نظري'], ['عملي', 'عملي']], 'النشاط')}
        ${seg('offered', 'off', [['', 'الكل'], ['1', 'مطروح'], ['0', 'غير مطروح']], 'هذا الفصل')}
        ${nFilt ? '<button type="button" class="sp2-clr" id="sp-clr"><i class="bi bi-x-circle"></i> مسح التصفية</button>' : ''}
      </div>` : ''}
    </div>`;
  }
  const keep = c => qMatch(c) && (!st.act || (st.act === 'نظري' ? c.activity === 'نظري' : c.activity !== 'نظري')) && (!st.offered || (st.offered === '1') === !!secs(c).length);

  // ---------------------------------------------------------------- plan view
  const offeredCell = c => {
    const s = secs(c);
    return s.length ? `<a class="sp-off on" href="timetable.html?q=${encodeURIComponent(c.code)}" title="شعب هذا المقرر في الجدول الدراسي"><i class="bi bi-check-circle-fill"></i> ${s.length} ${s.length === 1 ? 'شعبة' : s.length === 2 ? 'شعبتان' : s.length <= 10 ? 'شعب' : 'شعبة'}</a>`
      : '<span class="sp-off"><i class="bi bi-dash-circle"></i> غير مطروح</span>';
  };
  const actBadge = a => `<span class="sp-act ${a === 'نظري' ? 'th' : 'pr'}">${esc(a || '—')}</span>`;
  function planView(p) {
    if (!p) return '<div class="alert alert-info">لا توجد خطة ضمن هذه التصفية.</div>';
    const f = figures(p);
    const groups = p.groups.filter(g => !st.kind || kindOf(g) === st.kind);
    const segs = p.groups.filter(g => g.required_hours);
    const pct = f.courses ? Math.round(100 * f.offered / f.courses) : 0;
    const showLeg = (() => { try { return localStorage.getItem('uop-sp-leg') === '1'; } catch (e) { return false; } })();
    const kpis = [[p.total || f.sum, 'ساعة للتخرج', 'bi-hourglass-split', '#901d23'], [f.req, 'إجبارية', 'bi-lock-fill', '#0b4a66'], [f.el, 'اختيارية', 'bi-ui-checks', '#0f766e'],
      [f.free, 'حرة', 'bi-stars', '#b8892b'], [f.courses, 'مقرراً', 'bi-journal-bookmark', '#475569'], [`${f.offered}<small>/${f.courses}</small>`, `مطروح الآن · ${pct}%`, 'bi-calendar-check', '#15803d']];
    return `<section class="sp2-head">
        <div class="sp2-h1">
          <div class="sp2-tt"><h2>${esc(p.major)}</h2>
            <div class="sp2-crumb"><span><i class="bi bi-mortarboard"></i> ${esc(p.degree)}</span><span><i class="bi bi-bank2"></i> ${esc(p.faculty)}</span>${p.dept && p.dept !== p.major ? `<span><i class="bi bi-diagram-3"></i> ${esc(p.dept)}</span>` : ''}<span class="t">${esc(D.term || '')}</span></div></div>
          <div class="sp2-kpis">${kpis.map(([v, l, i, c]) => `<div class="sp2-k" style="--c:${c}" title="${l.replace(/<[^>]+>/g, '')}"><i class="bi ${i}"></i><b>${v}</b><span>${l}</span></div>`).join('')}</div>
          <div class="sp2-act no-print"><a class="sp2-b pri" href="advisory.html?sp=${encodeURIComponent(p.id)}"><i class="bi bi-signpost-split"></i> الخطة الاسترشادية</a>
            <a class="sp2-b" href="https://edugate.uop.edu.jo/studyPlans" target="_blank" rel="noopener" title="المصدر الرسمي على بوابة الجامعة"><i class="bi bi-box-arrow-up-left"></i><span> المصدر</span></a></div>
        </div>
        ${segs.length ? `<div class="sp2-dist"><div class="sp-dist" role="img" aria-label="توزيع الساعات">${segs.map(g => `<i style="flex:${g.required_hours};background:${gcol(g.name)}" title="${esc(groupKey(g.name))}: ${g.required_hours} ساعة"></i>`).join('')}</div>
          <button type="button" class="sp2-legt no-print" id="sp-leg" aria-expanded="${showLeg}"><i class="bi ${showLeg ? 'bi-chevron-up' : 'bi-chevron-down'}"></i> ${showLeg ? 'إخفاء' : 'توزيع الساعات'} (${segs.length})</button></div>
          <div class="sp-legend sp2-leg" ${showLeg ? '' : 'hidden'}>${segs.map(g => `<span><i style="background:${gcol(g.name)}"></i>${esc(groupKey(g.name))} <b>${g.required_hours}</b></span>`).join('')}</div>` : ''}
        ${p.total && p.total > f.req + f.el + f.free ? `<div class="sp2-note"><i class="bi bi-info-circle"></i> مجموع ساعات التخرج في البوابة ${p.total} ساعة، منها ${p.total - f.req - f.el - f.free} ساعة غير مدرجة كمقررات في الخطة المنشورة.</div>` : ''}
        ${pvBar()}
      </section>
      <div id="sp-pvb">${st.pv !== 'table' && PV[st.pv] ? PV[st.pv](p, groups) : `<div class="sp-groups">${groups.map((g, gi) => {
        const rows = g.courses.filter(keep), k = KIND[kindOf(g)], listed = g.courses.reduce((a, c) => a + (c.hours || 0), 0);
        if (!rows.length && (st.q || st.act || st.offered)) return '';
        return `<section class="sp-group card mb-3" style="--g:${gcol(g.name)}" id="g${gi}">
          <header class="sp-gh" data-bs-toggle="collapse" data-bs-target="#gb${gi}" role="button" aria-expanded="true">
            <div><h3>${esc(groupKey(g.name))}</h3>
              <div class="sp-gmeta"><span class="sp-kind ${k[1]}"><i class="bi ${k[2]}"></i> ${k[0]}</span>
                <span><i class="bi bi-journal"></i> ${g.courses.length} مقرر${rows.length !== g.courses.length ? ` (يظهر ${rows.length})` : ''}</span>
                ${g.courses.length ? `<span><i class="bi bi-calendar-check"></i> ${g.courses.filter(c => secs(c).length).length} مطروح</span>` : ''}</div></div>
            <div class="sp-need">${g.required_hours != null ? `<b>${g.required_hours}</b><small>${kindOf(g) === 'remedial' ? 'ساعة لا تُحتسب للتخرج' : 'ساعة مطلوبة'}</small>` : ''}${kindOf(g) !== 'required' && listed ? `<em>من ${listed} متاحة</em>` : ''}</div>
          </header>
          <div class="collapse show" id="gb${gi}">${rows.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0 sp-tbl">
            <thead><tr><th>رمز المقرر</th><th>اسم المقرر</th><th class="text-center">الساعات</th><th class="text-center">النشاط</th><th>هذا الفصل</th><th class="no-print"></th></tr></thead>
            <tbody>${rows.map(c => `<tr><td><code>${esc(c.code)}</code></td><td class="fw-semibold">${esc(c.name)}</td><td class="text-center"><span class="sp-h">${c.hours ?? '—'}</span></td>
              <td class="text-center">${actBadge(c.activity)}</td><td>${offeredCell(c)}</td>
              <td class="no-print text-end"><a href="#" class="sp-more" data-code="${esc(c.code)}" title="في أي الخطط يرد هذا المقرر؟"><i class="bi bi-diagram-2"></i> <small>${(IDX[c.code] || []).length} خطة</small></a></td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="2">المجموع</td><td class="text-center">${rows.reduce((a, c) => a + (c.hours || 0), 0)}</td><td colspan="3"></td></tr></tfoot></table></div>`
            : `<p class="text-muted small p-3 mb-0">${kindOf(g) === 'free' ? 'يختار الطالب هذه المواد من أي مقررات الجامعة.' : 'لا مقررات مدرجة في هذه المجموعة.'}</p>`}</div>
        </section>`;
      }).join('') || '<div class="alert alert-light">لا مقررات تطابق البحث.</div>'}</div>`}</div>`;
  }

  // ---------------------------------------------------------------- other ways to see one plan
  const PVS = [['table', 'جدول المجموعات', 'bi-list-ul'], ['map', 'خريطة الخطة', 'bi-kanban'], ['level', 'حسب المستوى', 'bi-bar-chart-steps'],
    ['visual', 'ملخص بصري', 'bi-pie-chart'], ['cards', 'بطاقات المقررات', 'bi-grid-3x2-gap'], ['track', 'متابعة إنجازي', 'bi-check2-square']];
  const pvBar = () => `<div class="sp-pvbar no-print" role="tablist" aria-label="طريقة عرض الخطة">${PVS.map(([k, l, i]) =>
    `<button type="button" class="${st.pv === k ? 'on' : ''}" data-pv="${k}" role="tab" aria-selected="${st.pv === k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>`;
  const offDot = c => secs(c).length ? `<i class="sp-dot on" title="مطروح هذا الفصل: ${secs(c).length} شعبة"></i>` : '<i class="sp-dot" title="غير مطروح هذا الفصل"></i>';
  const tile = (c, g) => `<div class="sp-tile" style="--g:${gcol(g.name)}" title="${esc(c.code)} · ${esc(c.name)} · ${esc(groupKey(g.name))}">
      <div class="sp-tile-top"><code>${esc(c.code)}</code>${offDot(c)}</div><b>${esc(c.name)}</b>
      <div class="sp-tile-ft"><span class="sp-h">${c.hours ?? '—'}</span>${actBadge(c.activity)}</div></div>`;

  // map: every group a column of course tiles, left to right in the portal's order
  function mapView(p, groups) {
    const cols = groups.filter(g => g.courses.some(keep) || (!st.q && !st.act && !st.offered));
    return `<div class="sp-map">${cols.map(g => { const rows = g.courses.filter(keep), k = KIND[kindOf(g)];
      return `<section class="sp-col" style="--g:${gcol(g.name)}"><header><b>${esc(groupKey(g.name))}</b>
        <span><span class="sp-kind ${k[1]}">${k[0]}</span> ${g.required_hours ?? '—'} س · ${g.courses.length} مقرر</span></header>
        <div class="sp-col-b">${rows.map(c => tile(c, g)).join('') || `<p class="small text-muted m-0 p-2">${kindOf(g) === 'free' ? 'من أي مقررات الجامعة' : '—'}</p>`}</div></section>`; }).join('')}</div>
      <p class="small text-muted mt-2"><i class="sp-dot on"></i> مطروح هذا الفصل &nbsp; <i class="sp-dot"></i> غير مطروح · لون الشريط = المجموعة</p>`;
  }

  // level: the level digit of the course number (the third digit from the right, e.g. 601322 → 3)
  const levelOf = c => { const d = +String(c.code).slice(-3, -2); return d >= 1 && d <= 6 ? d : 0; };
  const LV = { 1: 'المستوى الأول', 2: 'المستوى الثاني', 3: 'المستوى الثالث', 4: 'المستوى الرابع', 5: 'المستوى الخامس', 6: 'المستوى السادس', 0: 'غير محدد' };
  function levelView(p, groups) {
    const by = {};
    groups.forEach(g => g.courses.filter(keep).forEach(c => (by[levelOf(c)] ||= []).push({ c, g })));
    const ks = Object.keys(by).map(Number).sort((a, b) => (a || 9) - (b || 9));
    return `<p class="small text-muted"><i class="bi bi-info-circle"></i> المستوى مأخوذ من رقم المقرر (الخانة الثالثة من اليمين، مثل 601<b>3</b>22 ← الثالث)، وهو ترتيب استرشادي وليس الخطة الإرشادية الرسمية للفصول.</p>
      <div class="sp-levels">${ks.map(k => { const list = by[k], hrs = list.reduce((a, x) => a + (x.c.hours || 0), 0);
        return `<section class="sp-lv"><header><span class="sp-lv-n">${k || '؟'}</span><div><b>${LV[k]}</b><small>${list.length} مقرر · ${hrs} ساعة · ${list.filter(x => secs(x.c).length).length} مطروح</small></div></header>
          <div class="sp-lv-b">${list.sort((a, b) => a.c.code.localeCompare(b.c.code)).map(x => tile(x.c, x.g)).join('')}</div></section>`; }).join('') || '<div class="alert alert-light">لا مقررات تطابق البحث.</div>'}</div>`;
  }

  // visual: a donut of the hours by group, bars of each group, theory / practical and what is offered now
  function donut(segs, total, label) {
    const R = 70, C = 2 * Math.PI * R; let off = 0;
    return `<svg viewBox="0 0 200 200" class="sp-donut" role="img" aria-label="${esc(label)}"><circle cx="100" cy="100" r="${R}" fill="none" stroke="#eef0f2" stroke-width="28"/>
      ${segs.map(([v, col, t]) => { const len = C * v / Math.max(1, segs.reduce((a, s) => a + s[0], 0)), el = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${col}" stroke-width="28" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"><title>${esc(t)}: ${v}</title></circle>`; off += len; return el; }).join('')}
      <text x="100" y="98" text-anchor="middle" class="sp-dn-v">${total}</text><text x="100" y="120" text-anchor="middle" class="sp-dn-l">${esc(label)}</text></svg>`;
  }
  function visualView(p) {
    const f = figures(p), gs = p.groups.filter(g => g.required_hours);
    const all = p.groups.flatMap(g => g.courses), th = all.filter(c => c.activity === 'نظري').length;
    const maxH = Math.max(1, ...p.groups.map(g => Math.max(g.required_hours || 0, g.courses.reduce((a, c) => a + (c.hours || 0), 0))));
    return `<div class="row g-3">
      <div class="col-lg-4"><section class="card h-100 sp-vis"><h3>توزيع ساعات التخرج</h3>${donut(gs.filter(g => kindOf(g) !== 'remedial').map(g => [g.required_hours, gcol(g.name), groupKey(g.name)]), p.total || f.sum, 'ساعة للتخرج')}
        <div class="sp-legend justify-content-center">${gs.filter(g => kindOf(g) !== 'remedial').map(g => `<span><i style="background:${gcol(g.name)}"></i>${esc(groupKey(g.name))} <b>${g.required_hours}</b></span>`).join('')}</div></section></div>
      <div class="col-lg-4"><section class="card h-100 sp-vis"><h3>إجباري · اختياري · حر</h3>${donut([[f.req, '#0b4a66', 'إجباري'], [f.el, '#0f766e', 'اختياري'], [f.free, '#b8892b', 'حر']], f.req + f.el + f.free, 'ساعة')}
        <div class="sp-legend justify-content-center"><span><i style="background:#0b4a66"></i>إجباري <b>${f.req}</b></span><span><i style="background:#0f766e"></i>اختياري <b>${f.el}</b></span><span><i style="background:#b8892b"></i>حر <b>${f.free}</b></span>${f.rem ? `<span><i style="background:#94a3b8"></i>استدراكي (لا يُحتسب) <b>${f.rem}</b></span>` : ''}</div></section></div>
      <div class="col-lg-4"><section class="card h-100 sp-vis"><h3>المقررات</h3>${donut([[f.offered, '#15803d', 'مطروح هذا الفصل'], [f.courses - f.offered, '#d6dbe0', 'غير مطروح']], f.courses, 'مقرراً')}
        <div class="sp-legend justify-content-center"><span><i style="background:#15803d"></i>مطروح هذا الفصل <b>${f.offered}</b></span><span><i style="background:#d6dbe0"></i>غير مطروح <b>${f.courses - f.offered}</b></span></div>
        <div class="sp-split mt-2"><span style="flex:${th || .001}">نظري ${th}</span><span style="flex:${all.length - th || .001}">عملي ${all.length - th}</span></div></section></div>
      <div class="col-12"><section class="card sp-vis"><h3>كل مجموعة: الساعات المطلوبة مقابل ساعات المقررات المدرجة</h3><div class="sp-bars">
        ${p.groups.map(g => { const listed = g.courses.reduce((a, c) => a + (c.hours || 0), 0), off = g.courses.filter(c => secs(c).length).length;
          return `<div class="sp-bar-row"><span class="sp-bar-l"><i style="background:${gcol(g.name)}"></i>${esc(groupKey(g.name))}</span>
            <div class="sp-bar-t"><i class="need" style="width:${100 * (g.required_hours || 0) / maxH}%;background:${gcol(g.name)}"></i><i class="list" style="width:${100 * listed / maxH}%"></i></div>
            <span class="sp-bar-v"><b>${g.required_hours ?? '—'}</b> / ${listed} <small>· ${off}/${g.courses.length} مطروح</small></span></div>`; }).join('')}
        </div><p class="small text-muted mb-0 mt-1">الشريط الملوّن: الساعات المطلوبة من المجموعة؛ الإطار: مجموع ساعات المقررات المدرجة فيها (الفرق = حرية الاختيار).</p></section></div></div>`;
  }

  // cards: one compact card per course, grouped, good for printing and reading on a phone
  function cardsView(p, groups) {
    return groups.map(g => { const rows = g.courses.filter(keep); if (!rows.length) return '';
      return `<h3 class="sp-cards-h" style="--g:${gcol(g.name)}">${esc(groupKey(g.name))} <small>${KIND[kindOf(g)][0]} · ${g.required_hours ?? '—'} ساعة</small></h3>
        <div class="sp-cards">${rows.map(c => `<article class="sp-card" style="--g:${gcol(g.name)}"><div class="d-flex justify-content-between align-items-start gap-2"><code>${esc(c.code)}</code><span class="sp-h">${c.hours ?? '—'}</span></div>
          <h4>${esc(c.name)}</h4><div class="d-flex justify-content-between align-items-center gap-2">${actBadge(c.activity)}${offeredCell(c)}</div>
          <a href="#" class="sp-more" data-code="${esc(c.code)}"><i class="bi bi-diagram-2"></i> في ${(IDX[c.code] || []).length} خطة</a></article>`).join('')}</div>`; }).join('') || '<div class="alert alert-light">لا مقررات تطابق البحث.</div>';
  }

  // track: the student ticks what they have passed; kept on this device only
  const doneKey = p => 'uop-plan-done-' + p.id;
  const getDone = p => { try { return new Set(JSON.parse(localStorage.getItem(doneKey(p)) || '[]')); } catch (e) { return new Set(); } };
  const setDone = (p, s) => { try { localStorage.setItem(doneKey(p), JSON.stringify([...s])); } catch (e) { /* storage unavailable */ } };
  function progress(p) {
    const done = getDone(p);
    const gs = p.groups.map(g => { const got = g.courses.filter(c => done.has(c.code)).reduce((a, c) => a + (c.hours || 0), 0), need = g.required_hours || 0;
      return { g, got, need, counted: kindOf(g) === 'remedial' ? 0 : need ? Math.min(got, need) : got, left: Math.max(0, need - got) }; });
    const total = p.total || figures(p).sum, counted = gs.reduce((a, x) => a + x.counted, 0);
    return { done, gs, total, counted, pct: Math.min(100, Math.round(100 * counted / Math.max(1, total))) };
  }
  function trackView(p) {
    const pr = progress(p);
    return `<section class="card mb-3 sp-track-head"><div class="card-body d-flex flex-wrap gap-3 align-items-center">
        <div class="sp-ring" style="--p:${pr.pct}"><b>${pr.pct}%</b></div>
        <div class="flex-grow-1"><h3 class="h5 fw-bold mb-1">${pr.counted} من ${pr.total} ساعة للتخرج</h3>
          <p class="small text-muted mb-2">علّم المقررات التي اجتزتها؛ تُحسب ساعات كل مجموعة حتى المطلوب منها فقط، ولا تُحتسب المواد الاستدراكية. تُحفظ اختياراتك على هذا الجهاز فقط.</p>
          <div class="d-flex flex-wrap gap-2 no-print"><button type="button" class="btn btn-sm btn-outline-secondary" id="sp-tr-print"><i class="bi bi-printer"></i> طباعة كشف إنجازي</button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="sp-tr-reset"><i class="bi bi-arrow-counterclockwise"></i> مسح الاختيارات</button></div></div>
      </div></section>
      <div class="sp-track">${pr.gs.map(x => `<section class="card sp-tg" style="--g:${gcol(x.g.name)}"><header><b>${esc(groupKey(x.g.name))}</b>
          <span>${x.got} / ${x.need || '—'} ساعة${x.need ? (x.left ? ` · متبقٍ ${x.left}` : ' · <i class="bi bi-check-circle-fill text-success"></i> مكتمل') : ''}</span>
          <div class="sp-tg-bar"><i style="width:${x.need ? Math.min(100, 100 * x.got / x.need) : 0}%"></i></div></header>
        <ul>${x.g.courses.filter(keep).map(c => `<li><label><input type="checkbox" class="form-check-input" data-done="${esc(c.code)}" ${pr.done.has(c.code) ? 'checked' : ''}>
          <code>${esc(c.code)}</code> <span>${esc(c.name)}</span> <span class="sp-h">${c.hours ?? '—'}</span></label></li>`).join('') || '<li class="text-muted small">—</li>'}</ul></section>`).join('')}</div>`;
  }
  const PV = { map: mapView, level: levelView, visual: visualView, cards: cardsView, track: trackView };

  // ---------------------------------------------------------------- all plans
  const ALLCOLS = [['major', 'التخصص'], ['faculty', 'الكلية'], ['degree', 'الدرجة'], ['total', 'الساعات'], ['req', 'إجباري'], ['el', 'اختياري'], ['free', 'حر'], ['courses', 'المقررات'], ['pct', 'مطروح الآن']];
  function allRows() {
    return scoped().map(p => { const f = figures(p); return { p, major: label(p), faculty: p.faculty, degree: p.degree, total: p.total || f.sum, ...f, pct: f.courses ? Math.round(100 * f.offered / f.courses) : 0 }; })
      .sort((a, b) => typeof a[st.sort] === 'string' ? a[st.sort].localeCompare(b[st.sort], 'ar') : b[st.sort] - a[st.sort]);
  }
  function allView() {
    const rows = allRows(), max = Math.max(1, ...rows.map(r => r.total));
    const DEG = { 'البكالوريوس': '#0b4a66', 'الماجستير': '#0f766e', 'الدكتوراه': '#901d23', 'الدبلوم': '#6d28d9' };
    const kpis = [[rows.length, 'خطة دراسية', 'bi-journal-text', '#901d23'], [new Set(rows.map(r => r.faculty)).size, 'كلية', 'bi-bank2', '#0b4a66'],
      [new Set(rows.map(r => r.p.dept)).size, 'قسماً', 'bi-diagram-3', '#0f766e'], [new Set(rows.flatMap(r => r.p.groups.flatMap(g => g.courses.map(c => c.code)))).size, 'مقرراً مختلفاً', 'bi-journal-bookmark', '#475569'],
      [rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) + '%' : '—', 'متوسط المطروح الآن', 'bi-calendar-check', '#15803d']];
    const th = (k, l, cls) => `<th class="${cls || ''}"><button type="button" data-sort="${k}" class="${st.sort === k ? 'on' : ''}">${l}<i class="bi ${st.sort === k ? 'bi-sort-down' : 'bi-arrow-down-up'}"></i></button></th>`;
    const pctCol = v => v >= 70 ? '#15803d' : v >= 40 ? '#0b4a66' : '#901d23';
    return `<div class="sp2-kpis sp2-kpiw mb-3">${kpis.map(([v, l, i, c]) => `<div class="sp2-k" style="--c:${c}"><i class="bi ${i}"></i><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <section class="sp2-tw"><table class="sp2-t"><thead><tr>
        ${th('major', 'التخصص')}${th('faculty', 'الكلية')}${th('degree', 'الدرجة', 'c')}${th('total', 'ساعات التخرج', 'c')}${th('req', 'إجباري', 'c')}${th('el', 'اختياري', 'c')}${th('free', 'حر', 'c')}${th('courses', 'المقررات', 'c')}${th('pct', 'مطروح الآن', 'c')}
        <th class="w-dist">توزيع الساعات على المجموعات</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr>
          <td class="mj"><a href="#" data-open="${esc(r.p.id)}">${esc(r.major)}</a>${r.p.dept && r.p.dept !== r.major ? `<small>${esc(r.p.dept)}</small>` : ''}</td>
          <td class="fc">${esc(r.faculty)}</td>
          <td class="c"><span class="sp2-deg" style="--c:${DEG[r.degree] || '#475569'}">${esc(r.degree)}</span></td>
          <td class="c"><b class="sp2-tot">${r.total}</b></td>
          <td class="c n" style="--c:#0b4a66">${r.req}</td><td class="c n" style="--c:#0f766e">${r.el || '<em>—</em>'}</td><td class="c n" style="--c:#901d23">${r.free || '<em>—</em>'}</td>
          <td class="c">${r.courses}</td>
          <td class="c"><div class="sp2-pc" style="--p:${r.pct}%;--c:${pctCol(r.pct)}" title="${r.offered} من ${r.courses} مقرراً مطروحة هذا الفصل"><i></i><b>${r.pct}%</b></div></td>
          <td class="w-dist"><div class="sp2-mini"><span style="width:${Math.max(8, Math.round(100 * r.total / max))}%">${r.p.groups.filter(g => g.required_hours).map(g => `<i style="flex:${g.required_hours};background:${gcol(g.name)}" title="${esc(groupKey(g.name))}: ${g.required_hours} ساعة"></i>`).join('')}</span></div></td></tr>`).join('')
          || '<tr><td colspan="10" class="sp2-empty">لا خطط ضمن التصفية.</td></tr>'}</tbody></table></section>
      <details class="sp2-legd"><summary><i class="bi bi-palette"></i> ألوان المجموعات في عمود التوزيع (${GROUPS.length})</summary><div class="sp-legend mt-2">${GROUPS.map(n => `<span><i style="background:${gcol(n)}"></i>${esc(n)}</span>`).join('')}</div></details>`;
  }

  // ---------------------------------------------------------------- every course across the plans in scope
  let IDX = {};  // code -> [{plan, group}]
  function courseRows() {
    const out = {};
    scoped().forEach(p => p.groups.forEach(g => {
      if (st.kind && kindOf(g) !== st.kind) return;
      g.courses.forEach(c => { if (!keep(c)) return; const o = out[c.code] ||= { ...c, plans: [] }; o.plans.push({ p, g }); });
    }));
    return Object.values(out).sort((a, b) => b.plans.length - a.plans.length || a.code.localeCompare(b.code));
  }
  function coursesView() {
    const rows = courseRows(), shown = rows.slice(0, 600);
    return `<p class="small text-muted"><i class="bi bi-info-circle"></i> ${rows.length} مقرراً في ${scoped().length} خطة ضمن التصفية، مرتبة حسب عدد الخطط التي تتضمنها. انقر عدد الخطط لرؤيتها.</p>
      <section class="card"><div class="table-responsive"><table class="table table-sm align-middle mb-0 sp-tbl"><thead><tr><th>رمز المقرر</th><th>اسم المقرر</th><th class="text-center">الساعات</th><th class="text-center">النشاط</th>
        <th class="text-center">في خطط</th><th>نوعه في الخطط</th><th>هذا الفصل</th></tr></thead><tbody>
        ${shown.map(c => { const kinds = [...new Set(c.plans.map(x => kindOf(x.g)))];
          return `<tr><td><code>${esc(c.code)}</code></td><td class="fw-semibold">${esc(c.name)}</td><td class="text-center"><span class="sp-h">${c.hours ?? '—'}</span></td><td class="text-center">${actBadge(c.activity)}</td>
          <td class="text-center"><a href="#" class="sp-more badge rounded-pill text-bg-secondary" data-code="${esc(c.code)}">${c.plans.length}</a></td>
          <td>${kinds.map(k => `<span class="sp-kind ${KIND[k][1]}">${KIND[k][0]}</span>`).join(' ')}</td><td>${offeredCell(c)}</td></tr>`; }).join('')
          || '<tr><td colspan="7" class="text-muted p-3">لا مقررات تطابق البحث.</td></tr>'}</tbody></table></div></section>
      ${rows.length > shown.length ? `<p class="small text-muted mt-2">يظهر أول ${shown.length}؛ ضيّق البحث أو صدّر القائمة كاملة.</p>` : ''}`;
  }
  function whereIs(code) {
    const list = IDX[code] || [], c = list[0] && list[0].c;
    if (!c) return;
    U.modal(`<i class="bi bi-diagram-2"></i> <code>${esc(code)}</code> ${esc(c.name)}`, `<p class="small text-muted mb-2">${c.hours} ساعات · ${esc(c.activity)} · ${secs(c).length ? `${secs(c).length} شعبة هذا الفصل` : 'غير مطروح هذا الفصل'}</p>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>التخصص</th><th>الكلية</th><th>المجموعة</th><th>النوع</th></tr></thead><tbody>
      ${list.map(x => `<tr><td><a href="?plan=${encodeURIComponent(x.p.id)}">${esc(label(x.p))}</a></td><td><small>${esc(x.p.faculty)}</small></td><td><small>${esc(groupKey(x.g.name))}</small></td>
        <td><span class="sp-kind ${KIND[kindOf(x.g)][1]}">${KIND[kindOf(x.g)][0]}</span></td></tr>`).join('')}</tbody></table></div>
      ${secs(c).length ? `<a class="btn btn-sm btn-outline-secondary" href="timetable.html?q=${encodeURIComponent(code)}"><i class="bi bi-table"></i> الشعب في الجدول الدراسي</a>` : ''}`);
  }

  // ---------------------------------------------------------------- compare two plans
  function compareView() {
    const a = BYID[st.plan];
    if (!a) return '<div class="alert alert-info">اختر خطتين.</div>';
    // the comparison stays inside one faculty: the second plan is one of its other programmes (same degree first)
    const peers = PLANS.filter(p => p !== a && p.faculty === a.faculty).sort((x, y) => (x.degree !== a.degree) - (y.degree !== a.degree) || label(x).localeCompare(label(y), 'ar'));
    const b = (BYID[st.b] && BYID[st.b].faculty === a.faculty && BYID[st.b] !== a) ? BYID[st.b] : peers[0];
    if (!b) return `<div class="sp2-none sp2-p0"><i class="bi bi-info-circle"></i> لا توجد خطة أخرى في ${esc(a.faculty)} للمقارنة بها. المقارنة تكون بين خطط أقسام الكلية الواحدة.</div>`;
    st.b = b.id;
    const codes = p => new Map(p.groups.flatMap(g => g.courses.map(c => [c.code, { c, g }])));
    const A = codes(a), B = codes(b);
    const both = [...A.keys()].filter(k => B.has(k)), onlyA = [...A.keys()].filter(k => !B.has(k)), onlyB = [...B.keys()].filter(k => !A.has(k));
    const fa = figures(a), fb = figures(b);
    const sumH = (m, ks) => ks.reduce((s, k) => s + (m.get(k).c.hours || 0), 0);
    const q = norm(st.q.trim()), hit = k => { const x = (A.get(k) || B.get(k)).c; return !q || norm(x.code + ' ' + x.name).includes(q); };
    const list = (m, ks, other, col) => { const rows = ks.filter(hit);
      return rows.length ? `<ul class="sp2-cl">${rows.map(k => { const { c, g } = m.get(k), og = other && other.get(k) && groupKey(other.get(k).g.name) !== groupKey(g.name) ? groupKey(other.get(k).g.name) : '';
        return `<li><code>${esc(c.code)}</code><div><b>${esc(c.name)}</b><small><i style="background:${gcol(g.name)}"></i>${esc(groupKey(g.name))}${og ? ` <span title="المجموعة في الخطة الثانية">⇄ ${esc(og)}</span>` : ''}</small></div><em style="--c:${col}">${c.hours ?? '—'}</em></li>`; }).join('')}</ul>`
        : `<p class="sp2-none">${q ? 'لا مقررات تطابق البحث.' : 'لا شيء.'}</p>`; };
    const hb = sumH(A, both), ha = sumH(A, onlyA), hbb = sumH(B, onlyB), tot = Math.max(1, ha + hb + hbb);
    const sim = Math.round(100 * both.length / Math.max(1, both.length + onlyA.length + onlyB.length));
    const col = ['#901d23', '#15803d', '#0b4a66'];
    return `<div class="sp2-cmpbar no-print">
        <div class="sp2-pl a"><small>الخطة الأولى</small><b>${esc(label(a))}</b><span>${esc(a.dept)} · ${esc(a.faculty)}</span></div>
        <button type="button" class="sp2-swap" id="sp-swap" title="تبديل الخطتين"><i class="bi bi-arrow-left-right"></i></button>
        <label class="sp2-pl b"><small>الخطة الثانية</small><select class="form-select form-select-sm" id="sp-b" aria-label="الخطة الثانية">${[...new Set(peers.map(p => p.dept))].map(d =>
          `<optgroup label="قسم ${esc(d)}">${peers.filter(p => p.dept === d).map(p => `<option value="${esc(p.id)}" ${p.id === b.id ? 'selected' : ''}>${esc(label(p))}</option>`).join('')}</optgroup>`).join('')}</select><span>من خطط ${esc(a.faculty)} (${peers.length})</span></label>
        <label class="sp2-q"><i class="bi bi-search"></i><input id="sp-q" type="search" value="${esc(st.q)}" placeholder="ابحث في المقررات…" aria-label="بحث في المقررات"></label>
      </div>
      <section class="sp2-ov">
        <div class="sp2-sim" style="--p:${sim}"><b>${sim}%</b><span>تشابه</span></div>
        <div class="sp2-ovb">
          <div class="sp2-stack">${[[ha, onlyA.length, a.major + ' فقط', col[0]], [hb, both.length, 'مشترك', col[1]], [hbb, onlyB.length, b.major + ' فقط', col[2]]].map(([h, n, l, c]) =>
            `<i style="flex:${Math.max(h, .5)};background:${c}" title="${esc(l)}: ${n} مقرراً · ${h} ساعة"></i>`).join('')}</div>
          <div class="sp2-ovl">${[[onlyA.length, ha, esc(a.major) + ' فقط', col[0]], [both.length, hb, 'مشترك', col[1]], [onlyB.length, hbb, esc(b.major) + ' فقط', col[2]]].map(([n, h, l, c]) =>
            `<span style="--c:${c}"><i></i><b>${n}</b> مقرراً · ${h} ساعة <em>${l}</em></span>`).join('')}</div></div>
        <table class="sp2-vs"><thead><tr><th></th><th style="color:${col[0]}">${esc(a.major)}</th><th style="color:${col[2]}">${esc(b.major)}</th></tr></thead><tbody>
          ${[['ساعات التخرج', a.total || fa.sum, b.total || fb.sum], ['إجباري', fa.req, fb.req], ['اختياري', fa.el, fb.el], ['حر', fa.free, fb.free], ['المقررات', fa.courses, fb.courses]]
            .map(([l, x, y]) => `<tr><th>${l}</th><td class="${x > y ? 'hi' : ''}">${x}</td><td class="${y > x ? 'hi' : ''}">${y}</td></tr>`).join('')}</tbody></table>
      </section>
      <div class="sp2-cols">
        <section class="sp2-col" style="--c:${col[0]}"><h3><span>${esc(a.major)} فقط</span><b>${onlyA.length}</b></h3>${list(A, onlyA, null, col[0])}</section>
        <section class="sp2-col" style="--c:${col[1]}"><h3><span><i class="bi bi-intersect"></i> مشترك بين الخطتين</span><b>${both.length}</b></h3>${list(A, both, B, col[1])}</section>
        <section class="sp2-col" style="--c:${col[2]}"><h3><span>${esc(b.major)} فقط</span><b>${onlyB.length}</b></h3>${list(B, onlyB, null, col[2])}</section></div>`;
  }

  // ---------------------------------------------------------------- export and print
  function table() {
    const p = BYID[st.plan];
    if (st.view === 'all') return { name: 'الخطط_الدراسية', head: ['التخصص', 'القسم', 'الكلية', 'الدرجة', 'ساعات التخرج', 'إجباري', 'اختياري', 'حر', 'المقررات', 'مطروح الآن %'],
      rows: allRows().map(r => [r.major, r.p.dept, r.faculty, r.degree, r.total, r.req, r.el, r.free, r.courses, r.pct]) };
    if (st.view === 'courses') return { name: 'مقررات_الخطط', head: ['رمز المقرر', 'اسم المقرر', 'الساعات', 'النشاط', 'عدد الخطط', 'الخطط', 'شعب هذا الفصل'],
      rows: courseRows().map(c => [c.code, c.name, c.hours, c.activity, c.plans.length, c.plans.map(x => label(x.p)).join(' | '), secs(c).length]) };
    if (!p) return null;
    return { name: 'خطة_' + p.major, head: ['المجموعة', 'النوع', 'الساعات المطلوبة من المجموعة', 'رمز المقرر', 'اسم المقرر', 'الساعات', 'النشاط', 'شعب هذا الفصل'],
      rows: p.groups.filter(g => !st.kind || kindOf(g) === st.kind).flatMap(g => g.courses.filter(keep).map(c => [groupKey(g.name), KIND[kindOf(g)][0], g.required_hours, c.code, c.name, c.hours, c.activity, secs(c).length])) };
  }
  function exportCSV() {
    const t = table(); if (!t) return;
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    U.download(t.name.replace(/\s+/g, '_') + '.csv', '﻿' + [t.head].concat(t.rows).map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function loadXLSX() {
    return window.XLSX ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  function exportXLSX() {
    loadXLSX().then(() => {
      const wb = XLSX.utils.book_new(), add = (name, head, rows) => { const ws = XLSX.utils.aoa_to_sheet([head].concat(rows)); ws['!views'] = [{ RTL: true }];
        ws['!cols'] = head.map((h, i) => ({ wch: Math.min(48, Math.max(h.length + 2, ...rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
      const t = table(); if (!t) return;
      add(st.view === 'plan' ? 'الخطة' : st.view === 'all' ? 'كل الخطط' : 'المقررات', t.head, t.rows);
      if (st.view === 'plan') { const p = BYID[st.plan]; add('المجموعات', ['المجموعة', 'النوع', 'الساعات المطلوبة', 'عدد المقررات', 'ساعات المقررات المدرجة'],
        p.groups.map(g => [groupKey(g.name), KIND[kindOf(g)][0], g.required_hours, g.courses.length, g.courses.reduce((a, c) => a + (c.hours || 0), 0)])); }
      XLSX.writeFile(wb, t.name.replace(/\s+/g, '_') + '.xlsx');
    }).catch(exportCSV);
  }
  const planUrl = p => { const u = new URL(location.href.split('?')[0]); u.searchParams.set('plan', p.id); if (st.pv !== 'table') u.searchParams.set('pv', st.pv); return u.href; };
  const planHead = (p, f) => ({ subtitle: `${p.degree} · ${p.faculty} · قسم ${p.dept}`, source: 'edugate.uop.edu.jo/studyPlans', url: planUrl(p), qrLabel: 'الخطة الحية',
    filters: [['الفصل', D.term || ''], ...(st.kind ? [['النوع', KIND[st.kind][0]]] : []), ...(st.q ? [['بحث', st.q]] : [])],
    stats: [['ساعة للتخرج', p.total || f.sum], ['إجباري', f.req], ['اختياري', f.el], ['حر', f.free], ['مقرر', f.courses], ['مطروح هذا الفصل', `${f.offered}/${f.courses}`]] });
  function printTrack() {
    const p = BYID[st.plan], f = figures(p), pr = progress(p);
    printReport({ title: 'كشف إنجاز الخطة الدراسية: ' + p.major, ...planHead(p, f), orientation: 'portrait',
      stats: [['ساعة للتخرج', pr.total], ['ساعة منجزة', pr.counted], ['متبقٍ', Math.max(0, pr.total - pr.counted)], ['نسبة الإنجاز', pr.pct + '%']],
      sections: [{ title: 'ملخص المجموعات', columns: ['المجموعة', 'النوع', 'مطلوب', 'منجز', 'متبقٍ'], numCols: [2, 3, 4],
          rows: pr.gs.map(x => [groupKey(x.g.name), KIND[kindOf(x.g)][0], x.need, x.got, x.left]) }]
        .concat(pr.gs.filter(x => x.g.courses.length).map(x => ({ title: `${groupKey(x.g.name)} · ${x.got}/${x.need || '—'} ساعة`, columns: ['✓', 'رمز المقرر', 'اسم المقرر', 'الساعات'], widths: ['6%', '16%', '66%', '12%'], numCols: [0, 3],
          rows: x.g.courses.map(c => [{ html: pr.done.has(c.code) ? '<span class="pill ok">✓</span>' : '<span class="pill mut">☐</span>', cls: 'num' }, c.code, c.name, c.hours]) }))),
      note: 'كشف استرشادي من اختيارات الطالب على جهازه؛ المرجع المعتمد هو كشف العلامات الرسمي والخطة على بوابة الجامعة.' });
  }
  function doPrint() {
    const p = BYID[st.plan];
    if (st.view === 'plan' && p) {
      const f = figures(p);
      if (st.pv === 'track') return printTrack();
      if (['map', 'level', 'visual'].includes(st.pv)) {
        const body = $('#sp-pvb').cloneNode(true);
        body.querySelectorAll('.sp-more, .no-print').forEach(x => x.remove());
        return printReport({ title: `${PVS.find(x => x[0] === st.pv)[1]}: ${p.major}`, ...planHead(p, f), orientation: 'landscape', css: ['assets/app.css'], raw: body.innerHTML,
          note: 'من الخطط الدراسية المنشورة على بوابة الجامعة؛ «مطروح» من الجدول الدراسي المنشور. المرجع المعتمد هو البوابة الرسمية.' });
      }
      return printReport({ title: 'الخطة الدراسية: ' + p.major, ...planHead(p, f), orientation: 'portrait',
        sections: [{ title: 'ملخص المجموعات', columns: ['المجموعة', 'النوع', 'الساعات المطلوبة', 'عدد المقررات', 'ساعات المقررات المدرجة', 'مطروح'], numCols: [2, 3, 4, 5],
            rows: p.groups.map(g => [groupKey(g.name), KIND[kindOf(g)][0], g.required_hours ?? '—', g.courses.length, g.courses.reduce((a, c) => a + (c.hours || 0), 0), g.courses.filter(c => secs(c).length).length]) }]
          .concat(p.groups.filter(g => g.courses.length && (!st.kind || kindOf(g) === st.kind)).map(g => ({ title: `${groupKey(g.name)} · ${KIND[kindOf(g)][0]} · ${g.required_hours ?? '—'} ساعة مطلوبة`,
            columns: ['رمز المقرر', 'اسم المقرر', 'الساعات', 'النشاط', 'هذا الفصل'], widths: ['14%', '50%', '10%', '12%', '14%'], numCols: [2],
            rows: g.courses.filter(keep).map(c => [c.code, c.name, c.hours, c.activity, secs(c).length ? { html: `<span class="pill ok">${secs(c).length} شعبة</span>`, cls: 'num' } : { html: '<span class="pill mut">—</span>', cls: 'num' }]) }))),
        note: 'من الخطط الدراسية المنشورة على بوابة الجامعة؛ «هذا الفصل» من الجدول الدراسي المنشور. المرجع المعتمد هو البوابة الرسمية.' });
    }
    if (st.view === 'compare' && p && BYID[st.b]) {
      const b = BYID[st.b], codes = x => new Map(x.groups.flatMap(g => g.courses.map(c => [c.code, { c, g }]))), A = codes(p), B = codes(b);
      const sec = (title, m, ks) => ({ title: `${title} (${ks.length})`, columns: ['رمز المقرر', 'اسم المقرر', 'المجموعة', 'الساعات'], widths: ['14%', '50%', '26%', '10%'], numCols: [3],
        rows: ks.map(k => [k, m.get(k).c.name, groupKey(m.get(k).g.name), m.get(k).c.hours]) });
      return printReport({ title: 'مقارنة خطتين دراسيتين', subtitle: `${label(p)} ↔ ${label(b)}`, orientation: 'portrait', source: 'edugate.uop.edu.jo/studyPlans',
        stats: [['مشترك', [...A.keys()].filter(k => B.has(k)).length], [p.major + ' فقط', [...A.keys()].filter(k => !B.has(k)).length], [b.major + ' فقط', [...B.keys()].filter(k => !A.has(k)).length]],
        sections: [sec('مقررات مشتركة', A, [...A.keys()].filter(k => B.has(k))), sec(p.major + ' فقط', A, [...A.keys()].filter(k => !B.has(k))), sec(b.major + ' فقط', B, [...B.keys()].filter(k => !A.has(k)))] });
    }
    const t = table(); if (!t) return;
    printReport({ title: st.view === 'all' ? 'الخطط الدراسية' : 'مقررات الخطط الدراسية', subtitle: [st.deg, st.fac, st.dept].filter(Boolean).join(' · ') || 'كل الكليات', orientation: 'landscape',
      sections: [{ columns: t.head, rows: t.rows }], source: 'edugate.uop.edu.jo/studyPlans' });
  }

  // ---------------------------------------------------------------- render and events
  function render() {
    const list = scoped();
    if (!list.some(p => p.id === st.plan)) st.plan = (list[0] || {}).id || '';
    const body = st.view === 'all' ? allView() : st.view === 'courses' ? coursesView() : st.view === 'compare' ? compareView() : planView(BYID[st.plan]);
    $('#sp-app').innerHTML = bar() + body + `<p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> المصدر: الخطط الدراسية على بوابة الجامعة (${esc(D.term || '')})، تُراجَع مع كل تحديث للموقع.
      «هذا الفصل» من الجدول الدراسي المنشور${D.timetable_term ? ` (${esc(D.timetable_term)})` : ''}. المرجع المعتمد هو البوابة الرسمية.</p>`;
    const url = new URL(location.href);
    [['view', st.view !== 'plan' && st.view], ['pv', st.view === 'plan' && st.pv !== 'table' && st.pv], ['plan', st.plan], ['b', st.view === 'compare' && st.b], ['deg', st.deg], ['fac', st.fac], ['dept', st.dept], ['q', st.q]].forEach(([k, v]) => v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    history.replaceState(null, '', url);
    bind();
  }
  function bind() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { st.view = b.dataset.view; render(); });
    $('#sp-deg').onchange = e => { st.deg = e.target.value; st.fac = st.dept = ''; render(); };
    $('#sp-fac').onchange = e => { st.fac = e.target.value; st.dept = ''; render(); };
    $('#sp-dept').onchange = e => { st.dept = e.target.value; render(); };
    $('#sp-plan').onchange = e => { st.plan = e.target.value; if (st.view === 'all' || st.view === 'courses') st.view = 'plan'; render(); };
    const b = $('#sp-b'); if (b) b.onchange = e => { st.b = e.target.value; render(); };
    const sw = $('#sp-swap'); if (sw) sw.onclick = () => { const x = st.plan; st.plan = st.b; st.b = x; const pp = BYID[st.plan]; if (pp) { st.deg = st.deg && pp.degree; st.fac = st.fac && pp.faculty; st.dept = st.dept && pp.dept; } render(); };
    document.querySelectorAll('[data-kind]').forEach(x => x.onclick = () => { st.kind = x.dataset.kind; render(); });
    document.querySelectorAll('[data-act]').forEach(x => x.onclick = () => { st.act = x.dataset.act; render(); });
    document.querySelectorAll('[data-off]').forEach(x => x.onclick = () => { st.offered = x.dataset.off; render(); });
    document.querySelectorAll('[data-sort]').forEach(a => a.onclick = e => { e.preventDefault(); st.sort = a.dataset.sort; render(); });
    document.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); st.plan = a.dataset.open; st.view = 'plan'; render(); scrollTo({ top: $('#sp-app').offsetTop - 80, behavior: 'smooth' }); });
    document.querySelectorAll('.sp-more').forEach(a => a.onclick = e => { e.preventDefault(); whereIs(a.dataset.code); });
    const q = $('#sp-q');
    if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; render(); const i = $('#sp-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }; }
    document.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { st.pv = b.dataset.pv; render(); });
    document.querySelectorAll('[data-done]').forEach(x => x.onchange = () => { const p = BYID[st.plan], d = getDone(p); x.checked ? d.add(x.dataset.done) : d.delete(x.dataset.done); setDone(p, d);
      const y = scrollY; render(); scrollTo(0, y); });
    const tr = $('#sp-tr-reset'); if (tr) tr.onclick = () => { if (confirm('مسح كل المقررات المعلَّمة في هذه الخطة؟')) { setDone(BYID[st.plan], new Set()); render(); } };
    const tp = $('#sp-tr-print'); if (tp) tp.onclick = printTrack;
    const lg = $('#sp-leg'); if (lg) lg.onclick = () => { const on = lg.getAttribute('aria-expanded') !== 'true'; try { localStorage.setItem('uop-sp-leg', on ? '1' : '0'); } catch (e) { /* storage unavailable */ } render(); };
    const cl = $('#sp-clr'); if (cl) cl.onclick = () => { st.q = st.kind = st.act = st.offered = ''; render(); };
    $('#sp-csv').onclick = exportCSV; $('#sp-xls').onclick = exportXLSX; $('#sp-print').onclick = doPrint;
  }


  if (!document.getElementById('sp2-css')) document.head.insertAdjacentHTML('beforeend', `<style id="sp2-css">
    .sp2-bar { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .55rem .65rem; margin-bottom: .75rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); display: grid; gap: .5rem; }
    .sp2-r1, .sp2-r2 { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; } .sp2-r2 { padding-top: .5rem; border-top: 1px dashed #ece6d8; }
    .sp2-views { display: inline-flex; background: #f3f1ea; border-radius: 10px; padding: 3px; gap: 2px; flex: none; }
    .sp2-views button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; padding: .32rem .7rem; border-radius: 8px; font-size: .84rem; font-weight: 700; color: #0b4a66; white-space: nowrap; }
    .sp2-views button:hover { color: #091b22; } .sp2-views button.on { background: #901d23; color: #fff; box-shadow: 0 2px 6px rgba(144,29,35,.3); }
    .sp2-vr { width: 1px; height: 26px; background: #e5e7eb; flex: none; }
    .sp2-sel { position: relative; margin: 0; flex: 0 1 auto; min-width: 120px; } .sp2-sel.grow { flex: 1 1 240px; }
    .sp2-sel small { position: absolute; top: -.48rem; inset-inline-start: .55rem; background: #fff; padding: 0 .25rem; font-size: .64rem; font-weight: 700; color: #8a6d2e; line-height: 1; z-index: 1; }
    .sp2-sel select { height: 34px; border-radius: 9px; font-size: .84rem; width: 100%; max-width: 100%; }
    .sp2-sel:not(.grow) select { field-sizing: content; min-width: 120px; max-width: 230px; }
    .sp2-ex { display: inline-flex; border: 1px solid #dee2e6; border-radius: 9px; overflow: hidden; flex: none; margin-inline-start: auto; }
    .sp2-ex button { all: unset; cursor: pointer; width: 34px; height: 32px; display: grid; place-items: center; color: #4b5563; } .sp2-ex button + button { border-inline-start: 1px solid #dee2e6; }
    .sp2-ex button:hover { background: #f6f3ec; color: #901d23; } .sp2-ex #sp-xls { color: #15803d; }
    .sp2-q { flex: 1 1 200px; max-width: 300px; display: flex; align-items: center; gap: .4rem; height: 32px; margin: 0; padding: 0 .6rem; background: #f7f8fa; border: 1px solid #dee2e6; border-radius: 9px; }
    .sp2-q:focus-within { background: #fff; border-color: #901d23; box-shadow: 0 0 0 3px rgba(144,29,35,.12); } .sp2-q i { color: #94a3b8; } .sp2-q input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: .84rem; }
    .sp2-seg { display: inline-flex; align-items: center; background: #f3f1ea; border-radius: 9px; padding: 2px; gap: 1px; }
    .sp2-seg > span { font-size: .68rem; font-weight: 700; color: #8a6d2e; padding: 0 .45rem 0 .35rem; }
    .sp2-seg button { all: unset; cursor: pointer; padding: .22rem .6rem; border-radius: 7px; font-size: .8rem; font-weight: 600; color: #0b4a66; white-space: nowrap; }
    .sp2-seg button:hover { color: #091b22; } .sp2-seg button.on { background: #0b4a66; color: #fff; font-weight: 800; box-shadow: 0 1px 3px rgba(9,27,34,.15); }
    .sp2-clr { all: unset; cursor: pointer; font-size: .78rem; font-weight: 700; color: #901d23; } .sp2-clr:hover { text-decoration: underline; }
    .sp2-head { background: #fff; border: 1px solid #ece6d8; border-top: 3px solid #901d23; border-radius: 14px; margin-bottom: .75rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); overflow: hidden; }
    .sp2-h1 { display: flex; align-items: center; gap: .9rem; flex-wrap: wrap; padding: .65rem .9rem .5rem; }
    .sp2-tt { flex: 1 1 260px; min-width: 0; } .sp2-tt h2 { font-size: 1.3rem; font-weight: 800; color: #091b22; margin: 0; line-height: 1.3; }
    .sp2-crumb { display: flex; flex-wrap: wrap; gap: .15rem .7rem; font-size: .76rem; color: #6b7280; margin-top: .1rem; } .sp2-crumb i { color: #b8892b; } .sp2-crumb .t { color: #94a3b8; }
    .sp2-kpis { display: flex; flex-wrap: wrap; gap: 0; border: 1px solid #eee8d9; border-radius: 11px; overflow: hidden; }
    .sp2-k { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: .35rem; align-items: center; padding: .3rem .75rem; border-inline-start: 1px solid #eee8d9; background: #fcfbf8; }
    .sp2-k:first-child { border-inline-start: 0; } .sp2-k i { grid-row: 1 / 3; color: var(--c); font-size: 1rem; opacity: .8; }
    .sp2-k b { font-size: 1.12rem; font-weight: 800; color: var(--c); line-height: 1.1; } .sp2-k b small { font-size: .72rem; color: #94a3b8; } .sp2-k span { font-size: .68rem; color: #6b7280; white-space: nowrap; }
    .sp2-act { display: flex; gap: .35rem; flex: none; }
    .sp2-b { display: inline-flex; align-items: center; gap: .3rem; height: 32px; padding: 0 .75rem; border-radius: 9px; border: 1px solid #dee2e6; color: #374151; font-size: .82rem; font-weight: 700; text-decoration: none; white-space: nowrap; transition: background .15s; }
    .sp2-b:hover { background: #f6f3ec; color: #091b22; } .sp2-b.pri { background: #901d23; border-color: #901d23; color: #fff; } .sp2-b.pri:hover { background: #6e151a; color: #fff; }
    .sp2-dist { display: flex; align-items: center; gap: .6rem; padding: 0 .9rem .45rem; } .sp2-dist .sp-dist { flex: 1; height: 8px; margin: 0; }
    .sp2-legt { all: unset; cursor: pointer; font-size: .74rem; font-weight: 700; color: #6b7280; white-space: nowrap; } .sp2-legt:hover { color: #901d23; }
    .sp2-leg { padding: 0 .9rem .5rem; margin: 0; } .sp2-leg[hidden] { display: none !important; }
    .sp2-note { margin: 0 .9rem .5rem; font-size: .76rem; color: #6b7280; background: #f8fafc; border-radius: 8px; padding: .3rem .6rem; }
    .sp2-head .sp-pvbar { margin: 0; border: 0; border-top: 1px solid #ece6d8; border-radius: 0; box-shadow: none; background: #faf8f3; padding: 0 .5rem; display: flex; gap: .1rem; overflow-x: auto; }
    .sp2-head .sp-pvbar button { border-radius: 0; border: 0; border-bottom: 3px solid transparent; background: none; padding: .55rem .8rem; font-size: .84rem; box-shadow: none; }
    .sp2-head .sp-pvbar button.on { background: none; color: #901d23; border-bottom-color: #901d23; box-shadow: none; }
    .sp2-kpiw { display: flex; width: 100%; } .sp2-kpiw .sp2-k { flex: 1 1 0; padding: .55rem 1rem; } .sp2-kpiw .sp2-k b { font-size: 1.4rem; } .sp2-kpiw .sp2-k span { font-size: .76rem; }
    .sp2-tw { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; overflow: auto; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .sp2-t { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .86rem; }
    .sp2-t thead th { position: sticky; top: 0; z-index: 1; background: #0b2a3a; color: #fff; font-weight: 700; font-size: .8rem; padding: .6rem .6rem; text-align: start; white-space: nowrap; }
    .sp2-t thead th.c { text-align: center; } .sp2-t thead th button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; }
    .sp2-t thead th button i { font-size: .75rem; opacity: .45; } .sp2-t thead th button.on, .sp2-t thead th button:hover { color: #f5c66b; } .sp2-t thead th button.on i { opacity: 1; }
    .sp2-t tbody td { padding: .5rem .6rem; border-bottom: 1px solid #f1ece0; vertical-align: middle; } .sp2-t tbody tr:nth-child(even) td { background: #fcfbf8; }
    .sp2-t tbody tr:hover td { background: #f7f1e6; } .sp2-t td.c { text-align: center; }
    .sp2-t .mj a { font-weight: 800; color: #091b22; text-decoration: none; } .sp2-t .mj a:hover { color: #901d23; text-decoration: underline; }
    .sp2-t .mj small { display: block; font-size: .74rem; color: #8a6d2e; } .sp2-t .fc { font-size: .8rem; color: #374151; }
    .sp2-deg { display: inline-block; font-size: .72rem; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); border-radius: 99px; padding: .1rem .55rem; white-space: nowrap; }
    .sp2-tot { display: inline-block; min-width: 2.6rem; font-size: .95rem; color: #901d23; background: #fbeff0; border-radius: 8px; padding: .05rem .4rem; }
    .sp2-t td.n { color: var(--c); font-weight: 700; } .sp2-t td em { font-style: normal; color: #cbd5e1; }
    .sp2-pc { position: relative; width: 84px; height: 20px; margin: 0 auto; border-radius: 99px; background: #eef2f5; overflow: hidden; }
    .sp2-pc i { position: absolute; inset-block: 0; inset-inline-start: 0; width: var(--p); background: color-mix(in srgb, var(--c) 22%, #fff); border-inline-end: 2px solid var(--c); }
    .sp2-pc b { position: relative; display: block; text-align: center; font-size: .74rem; line-height: 20px; color: var(--c); }
    .sp2-t .w-dist { min-width: 200px; width: 22%; } .sp2-mini span { display: flex; height: 10px; gap: 1px; border-radius: 99px; overflow: hidden; background: #eef0f2; } .sp2-mini i { display: block; min-width: 2px; }
    .sp2-empty { color: #8a6d2e; padding: 1rem !important; }
    .sp2-legd { margin-top: .6rem; font-size: .8rem; } .sp2-legd summary { cursor: pointer; color: #0b4a66; font-weight: 700; }
    .sp2-cmpbar { display: flex; align-items: stretch; gap: .5rem; flex-wrap: wrap; background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .5rem; margin-bottom: .75rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .sp2-pl { flex: 1 1 260px; display: flex; flex-direction: column; justify-content: center; gap: .05rem; margin: 0; padding: .3rem .7rem; border-radius: 10px; border-inline-start: 4px solid; }
    .sp2-pl.a { background: #fbeff0; border-color: #901d23; } .sp2-pl.b { background: #eef4f7; border-color: #0b4a66; }
    .sp2-pl small { font-size: .66rem; font-weight: 800; color: #8a6d2e; } .sp2-pl b { font-size: .95rem; color: #091b22; } .sp2-pl span { font-size: .74rem; color: #6b7280; }
    .sp2-pl select { height: 30px; border-radius: 8px; font-weight: 700; color: #091b22; background-color: #fff; }
    .sp2-swap { all: unset; cursor: pointer; align-self: center; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 1px solid #dee2e6; color: #0b4a66; transition: transform .2s, background .15s; }
    .sp2-swap:hover { background: #f6f3ec; transform: rotate(180deg); }
    .sp2-cmpbar .sp2-q { align-self: center; flex: 0 1 240px; }
    .sp2-ov { display: grid; grid-template-columns: auto 1fr auto; gap: 1.2rem; align-items: center; background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .7rem 1rem; margin-bottom: .75rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .sp2-sim { width: 76px; height: 76px; border-radius: 50%; display: grid; place-content: center; text-align: center; background: radial-gradient(closest-side, #fff 76%, transparent 78% 100%), conic-gradient(#15803d calc(var(--p) * 1%), #eef0f2 0); }
    .sp2-sim b { font-size: 1.15rem; color: #15803d; line-height: 1; } .sp2-sim span { font-size: .66rem; color: #6b7280; }
    .sp2-stack { display: flex; height: 16px; border-radius: 99px; overflow: hidden; gap: 2px; } .sp2-stack i { display: block; }
    .sp2-ovl { display: flex; flex-wrap: wrap; gap: .3rem 1.2rem; margin-top: .45rem; font-size: .8rem; color: #374151; }
    .sp2-ovl span i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; background: var(--c); margin-inline-end: .3rem; } .sp2-ovl b { color: var(--c); } .sp2-ovl em { font-style: normal; color: #6b7280; }
    .sp2-vs { border-collapse: collapse; font-size: .8rem; } .sp2-vs th, .sp2-vs td { padding: .12rem .6rem; text-align: center; white-space: nowrap; } .sp2-vs thead th { font-size: .74rem; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    .sp2-vs tbody th { text-align: start; color: #6b7280; font-weight: 600; } .sp2-vs td { font-weight: 700; color: #374151; } .sp2-vs td.hi { color: #091b22; background: #f6f3ec; border-radius: 6px; }
    .sp2-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; align-items: start; }
    .sp2-col { background: #fff; border: 1px solid #ece6d8; border-top: 3px solid var(--c); border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .sp2-col h3 { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 0; padding: .55rem .8rem; font-size: .9rem; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 6%, #fff); border-bottom: 1px solid #f0ebe0; }
    .sp2-col h3 b { font-size: .78rem; color: #fff; background: var(--c); border-radius: 99px; padding: .05rem .55rem; }
    .sp2-cl { list-style: none; margin: 0; padding: 0; } .sp2-cl li { display: flex; align-items: center; gap: .55rem; padding: .38rem .8rem; border-bottom: 1px solid #f4f0e6; } .sp2-cl li:last-child { border-bottom: 0; }
    .sp2-cl li:hover { background: #fcfaf5; } .sp2-cl code { flex: none; font-size: .74rem; color: #0b4a66; background: #eef4f7; border-radius: 6px; padding: .05rem .35rem; }
    .sp2-cl div { flex: 1; min-width: 0; } .sp2-cl b { display: block; font-size: .84rem; font-weight: 700; color: #091b22; line-height: 1.35; }
    .sp2-cl small { display: block; font-size: .7rem; color: #6b7280; } .sp2-cl small i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-inline-end: .25rem; } .sp2-cl small span { color: #b45309; }
    .sp2-cl em { flex: none; font-style: normal; font-weight: 800; font-size: .78rem; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); border-radius: 7px; min-width: 1.6rem; text-align: center; padding: .05rem .3rem; }
    .sp2-none { margin: 0; padding: .8rem; font-size: .82rem; color: #8a6d2e; } .sp2-p0 { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; }
    @media (max-width: 991px) { .sp2-cols { grid-template-columns: 1fr; } .sp2-ov { grid-template-columns: auto 1fr; } .sp2-vs { grid-column: 1 / -1; } }
    @media (max-width: 991px) { .sp2-sel, .sp2-sel.grow { flex: 1 1 45%; } .sp2-sel:not(.grow) select { max-width: none; field-sizing: fixed; } .sp2-vr { display: none; } .sp2-kpis { width: 100%; } .sp2-k { flex: 1 1 30%; } }
    @media print { .sp2-bar { display: none !important; } }
  </style>`);
  Promise.all([U.getJSON('data/study_plans.json'), U.getJSON('data/timetable.json').catch(() => ({ sections: [] }))]).then(([d, tt]) => {
    D = d; PLANS = d.plans; BYID = Object.fromEntries(PLANS.map(p => [p.id, p]));
    (tt.sections || []).forEach(s => (TT[s.code] ||= []).push(s));
    // one section listed under two degrees is one section
    Object.keys(TT).forEach(k => { const seen = new Set(); TT[k] = TT[k].filter(s => { const key = s.section + '|' + s.activity; if (seen.has(key)) return false; seen.add(key); return true; }); });
    PLANS.forEach(p => { p._twin = PLANS.some(o => o !== p && o.major === p.major && o.degree === p.degree); });
    PLANS.forEach(p => p.groups.forEach(g => { const n = groupKey(g.name); if (!GROUPS.includes(n)) GROUPS.push(n); g.courses.forEach(c => (IDX[c.code] ||= []).push({ p, g, c })); }));
    if (!st.plan && !st.fac) { const first = PLANS.find(p => p.degree === 'البكالوريوس') || PLANS[0]; st.plan = first ? first.id : ''; }
    U.updatedLine(d.updated, d.term);
    const top = $('#pg-q'); if (top) top.addEventListener('input', e => { st.q = e.target.value; if (st.view === 'all' || st.view === 'compare') st.view = 'courses'; render(); });
    if (st.q && top) top.value = st.q;
    render();
  }).catch(e => { console.error(e); $('#sp-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل الخطط الدراسية. أعد المحاولة بعد قليل.</div>'; });
})();
