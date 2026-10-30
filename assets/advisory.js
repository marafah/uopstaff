/* «الخطط الاسترشادية»: the advisory study plans the faculty sites publish (data/advisory_plans.json, refreshed with the
   hourly update), with every earlier version SharePoint keeps. A plan is shown as years and semesters only when every
   semester's hours, as read, equal the totals printed in the plan; the original pages are always one click away.
   Views of one programme:
     plan      – years × semesters, each course with its hours, prerequisites and whether it is offered this term
     map       – prerequisite map: what each course needs and opens, its sections in the current timetable and their status
     now       – the plan's courses offered this term, every section with its time, instructor, seats and status
     original  – the plan's own pages, as published
     versions  – every version of the plan; what changed between two of them
     advisor   – a student's progress: passed courses, what is left, what can be taken next (and is offered now)
     files     – every plan document of the programme (handbook, course tree …) with its versions
   ?p=<programme id>&d=<document id>&v=<file hash>&view=…  */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { fac: P.get('fac') || '', p: P.get('p') || '', d: P.get('d') || '', v: P.get('v') || '', view: P.get('view') || 'plan', b: P.get('b') || '', q: '', sel: P.get('c') || '', ml: P.get('ml') || 'plan', mf: 'all', no: false };
  let A, PROGS, DOCS, READS, TTERM = '', TT = {}, SP = null, CODE_NAME = {};
  const TERM = { first: 'الفصل الأول', second: 'الفصل الثاني', summer: 'الفصل الصيفي', null: 'فصل غير محدد' };
  const YEAR = ['', 'السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة'];
  const KIND = { advisory: ['الخطة الاسترشادية', 'bi-signpost-split'], handbook: ['كتيّب القسم', 'bi-book'], tree: ['شجرة المواد', 'bi-diagram-3'], studyplan: ['الخطة الدراسية', 'bi-journal-text'] };
  const secs = code => TT[code] || [];
  const dt = s => s ? U.numDate(s) : '—';

  // ---------------------------------------------------------------- versions of a programme's plans
  function planVersions(p) {
    const out = [];
    p.docs.map(id => DOCS[id]).filter(Boolean).forEach(d => {
      const seen = new Set();
      d.versions.slice().reverse().forEach(v => {   // newest first: the current file, then SharePoint's history
        if (!v.sha || seen.has(v.sha)) return;
        seen.add(v.sha);
        const r = READS[v.sha] || {};
        out.push({ d, v, r, current: v.label === 'current', usable: d.kind === 'advisory' || (r.years || []).length });
      });
    });
    return out.filter(x => x.usable);
  }
  const vTitle = x => `${x.r.academic_year ? x.r.academic_year.replace('/', '–') : dt(x.v.created)}${x.r.edition ? ` · إصدار ${x.r.edition}` : ''} · ${x.d.lang === 'ar' ? 'عربي' : 'English'}${x.current ? ' · الحالي' : ` · نسخة ${x.v.label}`}`;
  function choose(p) {
    const vs = planVersions(p);
    let x = vs.find(x => x.v.sha === st.v) || null;
    if (!x) {
      // the version the page links to now: Arabic first, verified first
      const cur = vs.filter(x => x.current && x.d.kind === 'advisory');
      x = cur.find(x => x.d.linked && x.d.lang === 'ar' && x.r.ok) || cur.find(x => x.d.linked && x.r.ok) || cur.find(x => x.r.ok) || cur.find(x => x.d.linked) || cur[0] || vs[0] || null;
    }
    return { vs, x };
  }

  // ---------------------------------------------------------------- the plan as years and semesters
  const prereqCodes = s => (String(s || '').match(/\b\d{6,7}\b/g) || []);
  function courseCard(c, opts = {}) {
    const s = secs(c.code), off = s.length;
    const nm = c.name || CODE_NAME[c.code] || '';
    const pre = prereqCodes(c.prereq);
    return `<div class="ad-c ${opts.done ? 'done' : ''} ${opts.next ? 'next' : ''}" data-code="${esc(c.code)}">
      <div class="ad-c-top"><code>${esc(c.code || '—')}</code><span class="ad-h">${c.hours ?? '—'}</span></div>
      <b>${esc(nm)}</b>
      ${c.prereq ? `<div class="ad-pre"><i class="bi bi-arrow-return-left"></i> ${pre.length ? pre.map(p => `<span class="ad-chip" title="${esc(CODE_NAME[p] || '')}">${p}</span>`).join(' ') + (String(c.prereq).replace(/\b\d{6,7}\b|[+،,\s]/g, '').length ? ` <small>${esc(c.prereq.replace(/\b\d{6,7}\b/g, '').replace(/^[\s+،,]+|[\s+،,]+$/g, ''))}</small>` : '') : esc(c.prereq)}</div>` : ''}
      <div class="ad-c-ft">${c.mark ? `<span class="ad-mark" title="علامة في الخطة">${esc(c.mark)}</span>` : ''}
        ${c.code && /^\d/.test(c.code) ? (off ? `<a class="ad-off on" href="timetable.html?q=${encodeURIComponent(c.code)}"><i class="bi bi-calendar-check"></i> ${off} شعبة الآن</a>` : '<span class="ad-off">غير مطروح الآن</span>') : '<span class="ad-off">خانة اختيار</span>'}</div></div>`;
  }
  function planGrid(x, opts = {}) {
    const r = x.r;
    if (!r.ok || !(r.years || []).length) return original(x, true);
    const checks = Object.fromEntries((r.checks || []).map(c => [c.year + '|' + c.term, c]));
    const done = opts.done || new Set(), next = opts.next || new Set();
    const q = norm(st.q.trim());
    const keep = c => !q || norm(c.code + ' ' + (c.name || '') + ' ' + (CODE_NAME[c.code] || '')).includes(q);
    return `<div class="ad-years">${r.years.map(y => `<section class="ad-year">
      <header><span class="ad-yn">${y.year}</span><b>${YEAR[y.year] || 'سنة'}</b><small>${y.read_hours} ساعة${y.hours != null && y.hours !== y.read_hours ? ` <span class="badge text-bg-warning" title="العنوان في الخطة يذكر ${y.hours}">العنوان: ${y.hours}</span>` : ''}</small></header>
      <div class="ad-terms">${y.terms.map(t => { const ck = checks[y.year + '|' + t.term];
        return `<div class="ad-term"><h4>${TERM[t.term]} <span class="ad-sum">${t.hours} ساعة${ck ? ` <i class="bi bi-check-circle-fill text-success" title="يطابق المجموع المطبوع في الخطة (${ck.printed})"></i>` : ''}</span></h4>
          ${t.courses.filter(keep).map(c => courseCard(c, { done: done.has(c.code), next: next.has(c.code) })).join('') || '<p class="small text-muted">—</p>'}</div>`; }).join('')}</div></section>`).join('')}</div>
      ${(r.notes || []).length ? `<p class="small text-muted mt-2"><i class="bi bi-info-circle"></i> ملاحظة على الخطة الأصلية: ${r.notes.map(n => esc(n.replace(/year (\d+): header says (\d+) hours, its semesters total (\d+)/, 'السنة $1: العنوان يذكر $2 ساعة ومجموع فصولها المطبوع $3'))).join('، ')}.</p>` : ''}`;
  }
  function original(x, why) {
    const imgs = x.v.images || [];
    return `${why ? `<div class="alert alert-light border small"><i class="bi bi-image"></i> هذه الخطة معروضة كما نُشرت (صور صفحاتها الأصلية): ${x.r.ok === false && (x.r.years || []).length ? 'لم تتطابق قراءتها الآلية مع كل المجاميع المطبوعة فيها، فلا تُعرض جدولاً حتى لا يظهر فيها ما ليس في الأصل.' : 'صفحاتها صور أو تنسيقها غير جدولي.'}</div>` : ''}
      ${imgs.length ? `<div class="ad-orig">${imgs.map(n => `<a href="data/advisory/${n}" target="_blank" rel="noopener"><img src="data/advisory/${n}" alt="صفحة من الخطة" loading="lazy"></a>`).join('')}</div>` : '<p class="text-muted small">لا صور محفوظة لهذا الملف.</p>'}
      <p class="mt-2"><a class="btn btn-sm btn-outline-secondary" href="${esc(x.v.url)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> الملف الأصلي على موقع الجامعة</a></p>`;
  }

  // ---------------------------------------------------------------- what changed between two versions
  function flat(r) {
    const m = new Map();
    (r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach(c => { if (c.code && /^\d{6,7}$/.test(c.code)) m.set(c.code, { ...c, year: y.year, term: t.term }); })));
    return m;
  }
  function versionsView(p, vs, x) {
    const other = vs.find(o => o.v.sha === st.b) || vs.find(o => o !== x && o.d.lang === x.d.lang && o.r.ok) || vs.find(o => o !== x);
    const list = `<div class="table-responsive"><table class="table table-sm align-middle ad-vt"><thead><tr><th>الإصدار</th><th>الملف</th><th>التاريخ</th><th>القراءة</th><th></th></tr></thead><tbody>
      ${vs.map(o => `<tr class="${o === x ? 'table-active' : ''}"><td><b>${esc(vTitle(o))}</b></td><td><small>${esc(o.d.name)}</small></td><td><small>${dt(o.v.created || o.d.mod)}</small></td>
        <td>${o.r.ok ? '<span class="badge text-bg-success"><i class="bi bi-check2-all"></i> مطابقة</span>' : '<span class="badge text-bg-secondary">صفحات أصلية</span>'}</td>
        <td class="text-end"><a href="#" data-pick="${o.v.sha}" class="btn btn-sm btn-light">عرض</a> <a href="${esc(o.v.url)}" target="_blank" rel="noopener" class="btn btn-sm btn-light"><i class="bi bi-file-earmark-pdf"></i></a></td></tr>`).join('')}</tbody></table></div>`;
    if (!other || !x.r.ok || !other.r.ok) return list + '<p class="small text-muted">المقارنة متاحة بين إصدارين مقروءين بمطابقة كاملة.</p>';
    const A = flat(x.r), B = flat(other.r);
    const add = [...A.keys()].filter(k => !B.has(k)), rem = [...B.keys()].filter(k => !A.has(k));
    const moved = [...A.keys()].filter(k => B.has(k) && (A.get(k).year !== B.get(k).year || A.get(k).term !== B.get(k).term));
    const hrs = [...A.keys()].filter(k => B.has(k) && A.get(k).hours !== B.get(k).hours);
    const pre = [...A.keys()].filter(k => B.has(k) && prereqCodes(A.get(k).prereq).sort().join() !== prereqCodes(B.get(k).prereq).sort().join());
    const nm = k => esc(A.get(k)?.name || B.get(k)?.name || CODE_NAME[k] || '');
    const where = c => `${YEAR[c.year] || ''} · ${TERM[c.term]}`;
    const box = (t, cls, rows) => `<div class="col-md-6 col-xl-4"><section class="card ad-diff ${cls}"><h4>${t} <span>${rows.length}</span></h4><ul>${rows.join('') || '<li class="text-muted">لا شيء</li>'}</ul></section></div>`;
    return list + `<div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2 align-items-center"><b>مقارنة</b> <span class="badge text-bg-dark">${esc(vTitle(x))}</span> مع
        <select class="form-select form-select-sm w-auto" id="ad-b">${vs.filter(o => o !== x && o.r.ok).map(o => `<option value="${o.v.sha}" ${o === other ? 'selected' : ''}>${esc(vTitle(o))}</option>`).join('')}</select></div></div>
      <div class="row g-3">
        ${box('أُضيفت', 'add', add.map(k => `<li><code>${k}</code> ${nm(k)} <small>${where(A.get(k))}</small></li>`))}
        ${box('حُذفت', 'rem', rem.map(k => `<li><code>${k}</code> ${nm(k)} <small>${where(B.get(k))}</small></li>`))}
        ${box('انتقلت إلى فصل آخر', 'mov', moved.map(k => `<li><code>${k}</code> ${nm(k)} <small>${where(B.get(k))} ← ${where(A.get(k))}</small></li>`))}
        ${box('تغيّرت ساعاتها', 'hrs', hrs.map(k => `<li><code>${k}</code> ${nm(k)} <small>${B.get(k).hours} ← ${A.get(k).hours}</small></li>`))}
        ${box('تغيّر متطلبها السابق', 'pre', pre.map(k => `<li><code>${k}</code> ${nm(k)} <small>${esc(B.get(k).prereq || '—')} ← ${esc(A.get(k).prereq || '—')}</small></li>`))}
      </div>`;
  }

  // ---------------------------------------------------------------- the advisor's view of one student
  const doneKey = p => 'uop-adv-done-' + p.id;
  const getDone = p => { try { return new Set(JSON.parse(localStorage.getItem(doneKey(p)) || '[]')); } catch (e) { return new Set(); } };
  const setDone = (p, s) => { try { localStorage.setItem(doneKey(p), JSON.stringify([...s])); } catch (e) { /* storage unavailable */ } };
  function advise(x, done) {
    const all = [];
    (x.r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach(c => all.push({ ...c, year: y.year, term: t.term }))));
    const real = all.filter(c => /^\d{6,7}$/.test(c.code));
    const left = real.filter(c => !done.has(c.code));
    // can be taken: every prerequisite number in the plan cell is passed (other conditions, e.g. hours passed, are shown as written)
    const ready = left.filter(c => prereqCodes(c.prereq).every(p => done.has(p) || !real.some(r => r.code === p)));
    const order = c => (c.year || 9) * 10 + ({ first: 1, second: 2, summer: 3 }[c.term] || 4);
    ready.sort((a, b) => order(a) - order(b));
    const total = all.reduce((a, c) => a + (c.hours || 0), 0), got = all.filter(c => done.has(c.code)).reduce((a, c) => a + (c.hours || 0), 0);
    return { all, real, left, ready, total, got };
  }
  function advisorView(p, x) {
    if (!x.r.ok) return '<div class="alert alert-light border">أداة المرشد تعمل على الخطط المقروءة بمطابقة كاملة. اختر إصداراً مطابقاً من «الإصدارات».</div>' + original(x);
    const done = getDone(p), a = advise(x, done);
    const pct = a.total ? Math.round(100 * a.got / a.total) : 0;
    const offered = a.ready.filter(c => secs(c.code).length);
    const deg = (SP && SP.degree) || 'البكالوريوس';
    const plannerUrl = 'planner.html?' + offered.slice(0, 8).map(c => 'c=' + encodeURIComponent(c.code + '|' + deg)).join('&');
    return `<section class="card mb-3 ad-adv-head"><div class="card-body d-flex flex-wrap gap-3 align-items-center">
        <div class="ad-ring" style="--p:${pct}"><b>${pct}%</b></div>
        <div class="flex-grow-1"><h3 class="h5 fw-bold mb-1">${a.got} من ${a.total} ساعة في الخطة الاسترشادية</h3>
          <p class="small text-muted mb-2">علّم ما اجتازه الطالب على البطاقات أدناه. «يمكن تسجيلها» = كل أرقام متطلباتها السابقة المذكورة في الخطة مجتازة، مرتبة حسب موقعها في الخطة؛ والشروط الأخرى المكتوبة في الخطة (مثل اجتياز عدد ساعات) تظهر كما هي. الاختيارات محفوظة على هذا الجهاز فقط.</p>
          <div class="d-flex flex-wrap gap-2 no-print">${offered.length ? `<a class="btn btn-sm btn-maroon" href="${plannerUrl}"><i class="bi bi-calendar2-week"></i> ابنِ جدول الفصل القادم من المطروح (${Math.min(8, offered.length)})</a>` : ''}
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ad-adv-print"><i class="bi bi-printer"></i> كشف للطالب</button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="ad-adv-reset"><i class="bi bi-arrow-counterclockwise"></i> مسح</button></div></div></div></section>
      <div class="row g-3 mb-3">
        <div class="col-lg-6"><section class="card ad-diff add"><h4>يمكن تسجيلها الآن <span>${a.ready.length}</span></h4><ul>${a.ready.slice(0, 14).map(c => `<li><code>${c.code}</code> ${esc(c.name || CODE_NAME[c.code] || '')} <small>${YEAR[c.year] || ''} · ${TERM[c.term]} · ${c.hours} س</small> ${secs(c.code).length ? `<a class="ad-off on" href="timetable.html?q=${c.code}">${secs(c.code).length} شعبة</a>` : '<span class="ad-off">غير مطروح الآن</span>'}</li>`).join('') || '<li class="text-muted">—</li>'}</ul></section></div>
        <div class="col-lg-6"><section class="card ad-diff rem"><h4>متبقية بانتظار متطلب <span>${a.left.length - a.ready.length}</span></h4><ul>${a.left.filter(c => !a.ready.includes(c)).slice(0, 14).map(c => `<li><code>${c.code}</code> ${esc(c.name || CODE_NAME[c.code] || '')} <small>ينتظر: ${prereqCodes(c.prereq).filter(p => !done.has(p)).join('، ')}</small></li>`).join('') || '<li class="text-muted">—</li>'}</ul></section></div>
      </div>
      <p class="small text-muted"><i class="bi bi-hand-index"></i> انقر بطاقة المادة لتعليمها مجتازة.</p>
      ${planGrid(x, { done, next: new Set(a.ready.map(c => c.code)) })}`;
  }

  // ---------------------------------------------------------------- all plan documents of a programme
  function filesView(p) {
    const docs = p.docs.map(id => DOCS[id]).filter(Boolean);
    const links = p.links.filter(l => l.kind);
    return `<section class="card mb-3"><div class="card-body"><h3 class="h6 fw-bold">الروابط كما تظهر في صفحة القسم</h3>
        ${links.length ? `<ul class="list-unstyled mb-0 ad-links">${links.map(l => `<li><i class="bi ${KIND[l.kind][1]}"></i> <b>${esc(l.label)}</b> <small class="text-muted">(${l.lang === 'ar' ? 'الصفحة العربية' : 'English page'})</small> ${/\.pdf/i.test(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(decodeURI(l.url.split('/').pop()))}</a>` : `<span class="badge text-bg-warning">${l.url ? 'يشير إلى صفحة وليس ملفاً' : 'بلا رابط'}</span>`}</li>`).join('')}</ul>` : '<p class="text-muted small mb-0">لا روابط خطط على صفحة القسم.</p>'}
        <p class="small mt-2 mb-0"><a href="${esc(p.url_ar)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> صفحة القسم على موقع الجامعة</a></p></div></section>
      <div class="table-responsive"><table class="table table-sm align-middle ad-vt"><thead><tr><th>الوثيقة</th><th>النوع</th><th>اللغة</th><th>الإصدارات</th><th>آخر تعديل</th><th></th></tr></thead><tbody>
      ${docs.map(d => `<tr><td><b>${esc(d.label)}</b><small class="d-block text-muted">${esc(d.name)}${d.linked ? '' : ' · في مكتبة القسم وغير مرتبط بالصفحة'}</small></td><td>${KIND[d.kind][0]}</td><td>${d.lang === 'ar' ? 'عربي' : 'English'}</td>
        <td>${d.versions.filter(v => v.sha).map(v => `<a href="${esc(v.url)}" target="_blank" rel="noopener" class="badge text-bg-light text-decoration-none">${v.label === 'current' ? 'الحالي' : v.label}</a>`).join(' ')}</td>
        <td><small>${dt(d.mod)}</small></td><td><a href="${esc(d.url)}" target="_blank" rel="noopener" class="btn btn-sm btn-light"><i class="bi bi-file-earmark-pdf"></i></a></td></tr>`).join('') || '<tr><td colspan="6" class="text-muted">لا وثائق.</td></tr>'}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- prerequisite map: what a course needs, what it opens, and its sections now
  const realCode = c => /^\d{6,7}$/.test(c || '');
  const ORDER = c => (c.year || 9) * 10 + ({ first: 1, second: 2, summer: 3 }[c.term] || 4);
  function graph(x) {
    const nodes = [];
    (x.r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach((c, i) => nodes.push({ ...c, year: y.year, term: t.term, key: realCode(c.code) ? c.code : `slot-${y.year}-${t.term}-${i}` }))));
    const by = new Map(nodes.filter(n => realCode(n.code)).map(n => [n.code, n]));
    const pre = new Map(), ext = new Map(), post = new Map();
    nodes.forEach(n => { const ps = prereqCodes(n.prereq);
      pre.set(n.key, ps.filter(p => by.has(p) && p !== n.code)); ext.set(n.key, ps.filter(p => !by.has(p)));
      pre.get(n.key).forEach(p => (post.get(p) || post.set(p, []).get(p)).push(n.key)); });
    const walk = (k, next, seen = new Set()) => { (next.get(k) || []).forEach(j => { if (!seen.has(j)) { seen.add(j); walk(j, next, seen); } }); return seen; };
    const memo = (next) => { const m = new Map(), busy = new Set();
      const f = k => { if (m.has(k)) return m.get(k); if (busy.has(k)) return 0; busy.add(k);
        const v = 1 + Math.max(0, ...(next.get(k) || []).map(f)); busy.delete(k); m.set(k, v); return v; }; return f; };
    const level = memo(pre), chain = memo(post);   // longest chain up to the course / from it onwards
    const desc = new Map(nodes.map(n => [n.key, walk(n.key, post)]));
    const longest = Math.max(1, ...nodes.map(n => level(n.key)));
    return { nodes, by, pre, ext, post, level, chain, desc, longest, anc: k => walk(k, pre) };
  }
  function avail(code) {
    const s = secs(code);
    if (!realCode(code)) return { k: 'slot', t: 'خانة اختيار من مجموعة', s };
    if (!s.length) return { k: 'none', t: 'غير مطروحة هذا الفصل', s };
    const open = s.filter(x => x.status !== 'مغلقة' && x.registered < x.capacity);
    const seats = open.reduce((a, x) => a + Math.max(0, x.capacity - x.registered), 0);
    return open.length ? { k: 'open', t: `${open.length} من ${s.length} شعبة مفتوحة · ${seats} مقعداً`, s, open, seats } : { k: 'closed', t: `${s.length} شعبة، كلها مغلقة أو ممتلئة`, s, open, seats: 0 };
  }
  const AV = { open: ['مفتوحة فيها مقاعد', '#15803d'], closed: ['مطروحة ومغلقة', '#c2410c'], none: ['غير مطروحة هذا الفصل', '#94a3b8'], slot: ['خانة اختيار', '#6d28d9'] };
  function when(s) {
    const g = new Map();
    (s.meetings || []).forEach(m => { const k = `${m.start}–${m.end}${m.mode && m.mode !== 'وجاهي' ? ' · ' + m.mode : ''}`; (g.get(k) || g.set(k, []).get(k)).push(m.day); });
    return [...g].map(([t, d]) => `<span class="am-when"><b>${esc(d.join(' '))}</b> <bdi dir="ltr">${esc(t.split(' · ')[0])}</bdi>${t.includes(' · ') ? ` <small>${esc(t.split(' · ')[1])}</small>` : ''}</span>`).join('') || `<small>${esc(s.time || '—')}</small>`;
  }
  function sectionsTable(code, onlyOpen) {
    const s = secs(code).filter(x => !onlyOpen || (x.status !== 'مغلقة' && x.registered < x.capacity));
    if (!s.length) return '<p class="small text-muted mb-0">لا شعب ' + (onlyOpen ? 'مفتوحة ' : '') + 'في الجدول الدراسي المنشور لهذا الفصل.</p>';
    return `<div class="table-responsive"><table class="table table-sm align-middle am-st mb-0"><thead><tr><th>شعبة</th><th>النشاط</th><th>الموعد</th><th>المدرّس</th><th>القاعة</th><th>المقاعد</th><th>الحالة</th></tr></thead><tbody>
      ${s.sort((a, b) => (+a.section || 0) - (+b.section || 0)).map(x => { const full = x.registered >= x.capacity, closed = x.status === 'مغلقة' || full, pc = Math.min(100, x.capacity ? 100 * x.registered / x.capacity : 100);
        return `<tr class="${closed ? 'am-closed' : ''}"><td class="fw-bold">${esc(x.section)}</td><td><small>${esc(x.activity)}</small></td><td>${when(x)}</td><td><small><a href="instructor.html?q=${encodeURIComponent(x.instructor)}">${esc(x.instructor || '—')}</a></small></td>
          <td><small>${x.room === '0' ? 'افتراضية' : esc(x.room)}</small></td>
          <td><span class="am-seat"><i style="width:${pc}%" class="${full ? 'full' : pc >= 80 ? 'hot' : ''}"></i></span><bdi dir="ltr" class="small">${x.registered}/${x.capacity}</bdi>${!closed ? ` <small class="text-success">(${x.capacity - x.registered} متاح)</small>` : ''}</td>
          <td><span class="badge ${x.status === 'مغلقة' ? 'text-bg-danger' : full ? 'text-bg-warning' : 'text-bg-success'}">${x.status === 'مغلقة' ? 'مغلقة' : full ? 'ممتلئة' : 'مفتوحة'}</span></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function mapView(p, x) {
    if (!x.r.ok) return '<div class="alert alert-light border">الخريطة تُبنى من الخطط المقروءة بمطابقة كاملة فقط. اختر إصداراً مطابقاً (✓) من قائمة الإصدار.</div>' + original(x);
    const G = graph(x), done = getDone(p), a = advise(x, done), ready = new Set(a.ready.map(c => c.code));
    const cols = new Map();
    G.nodes.forEach(n => { const k = st.ml === 'chain' ? G.level(n.key) : ORDER(n); (cols.get(k) || cols.set(k, []).get(k)).push(n); });
    const keys = [...cols.keys()].sort((a, b) => a - b);
    const q = norm(st.q.trim());
    const hit = n => { const av = avail(n.code).k;
      return (!q || norm(n.code + ' ' + (n.name || '') + ' ' + (CODE_NAME[n.code] || '')).includes(q)) &&
        (st.mf === 'offered' ? av === 'open' || av === 'closed' : st.mf === 'seats' ? av === 'open' : st.mf === 'key' ? G.desc.get(n.key).size >= 3 : st.mf === 'ready' ? ready.has(n.code) : true); };
    const head = k => { if (st.ml === 'chain') return `<b>المرحلة ${k}</b><small>${k === 1 ? 'بلا متطلب في الخطة' : `بعد ${k - 1} ${k - 1 === 1 ? 'مادة' : 'مواد'} متتالية`}</small>`;
      const y = Math.floor(k / 10), t = ['', 'first', 'second', 'summer'][k % 10]; return `<b>${YEAR[y] || 'سنة'}</b><small>${TERM[t] || ''}</small>`; };
    const node = n => { const av = avail(n.code), d = G.desc.get(n.key).size, crit = realCode(n.code) && G.level(n.key) + G.chain(n.key) - 1 === G.longest;
      return `<button type="button" class="am-n av-${av.k} ${done.has(n.code) ? 'done' : ''} ${done.size && ready.has(n.code) ? 'ready' : ''} ${hit(n) ? '' : 'faded'}" data-k="${esc(n.key)}" title="${esc(av.t)}">
        <span class="am-n-top"><code>${esc(n.code)}</code><span class="am-hr">${n.hours ?? '—'}</span></span>
        <span class="am-nm">${esc(n.name || CODE_NAME[n.code] || '')}</span>
        <span class="am-n-ft"><span class="am-dot"></span>${av.k === 'open' ? `${av.open.length}/${av.s.length} مفتوحة` : av.k === 'closed' ? 'مغلقة' : av.k === 'slot' ? 'اختياري' : 'غير مطروحة'}
          ${d ? `<span class="am-un" title="تفتح ${d} مادة بعدها في الخطة"><i class="bi bi-unlock"></i>${d}</span>` : ''}${crit ? '<span class="am-crit" title="على أطول سلسلة متطلبات في الخطة: تأخيرها يؤخر ما بعدها"><i class="bi bi-lightning-charge-fill"></i></span>' : ''}</span></button>`; };
    const keyCourses = G.nodes.filter(n => realCode(n.code)).sort((a, b) => G.desc.get(b.key).size - G.desc.get(a.key).size || ORDER(a) - ORDER(b)).slice(0, 8);
    const counts = Object.fromEntries(Object.keys(AV).map(k => [k, G.nodes.filter(n => avail(n.code).k === k).length]));
    const flt = [['all', 'كل المواد'], ['seats', 'فيها مقاعد الآن'], ['offered', 'المطروحة الآن'], ['key', 'المفتاحية (تفتح 3+)'], ...(done.size ? [['ready', 'يمكن تسجيلها']] : [])];
    return `<div class="am-tools card mb-2 no-print"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <div class="btn-group btn-group-sm" role="group" aria-label="الترتيب"><button type="button" class="btn ${st.ml !== 'chain' ? 'btn-dark' : 'btn-outline-dark'}" data-ml="plan"><i class="bi bi-calendar3"></i> حسب فصول الخطة</button><button type="button" class="btn ${st.ml === 'chain' ? 'btn-dark' : 'btn-outline-dark'}" data-ml="chain"><i class="bi bi-diagram-2"></i> حسب سلسلة المتطلبات</button></div>
        <div class="d-flex flex-wrap gap-1">${flt.map(([k, l]) => `<button type="button" class="btn btn-sm am-f ${st.mf === k ? 'on' : ''}" data-mf="${k}">${l}</button>`).join('')}</div>
        <div class="am-legend ms-auto">${Object.entries(AV).map(([k, [l, c]]) => `<span><i style="background:${c}"></i>${l} <b>${counts[k]}</b></span>`).join('')}<span><i class="bi bi-lightning-charge-fill text-warning"></i> أطول سلسلة (${G.longest} مواد)</span></div></div></div>
      <div class="am-row">
        <div class="am-scroll"><div class="am-canvas" id="am-canvas"><svg id="am-svg" aria-hidden="true"></svg>
          <div class="am-cols">${keys.map(k => `<div class="am-col"><header>${head(k)}<span>${cols.get(k).reduce((a, n) => a + (n.hours || 0), 0)} س</span></header>${cols.get(k).sort((a, b) => ORDER(a) - ORDER(b)).map(node).join('')}</div>`).join('')}</div></div></div>
        <aside class="am-side" id="am-side">
          <div class="am-help"><h3><i class="bi bi-cursor"></i> اختر مادة من الخريطة</h3><p>تظهر <span class="am-k anc">متطلباتها</span> وكل ما قبلها، و<span class="am-k desc">ما تفتحه</span> وكل ما بعده، مع شعبها في الجدول الدراسي الحالي وحالة كل شعبة ومقاعدها.</p>
            <h4>المواد المفتاحية في هذه الخطة</h4><ol>${keyCourses.map(n => `<li><a href="#" data-go="${n.code}"><code>${n.code}</code> ${esc(n.name || CODE_NAME[n.code] || '')}</a> <small>تفتح ${G.desc.get(n.key).size}</small></li>`).join('')}</ol>
            <p class="small text-muted mb-0">${done.size ? `معلّم ${done.size} مادة مجتازة من «المرشد الأكاديمي»: المجتازة باهتة، والجاهزة للتسجيل بإطار ذهبي.` : 'علّم ما اجتازه الطالب (من هنا أو من «المرشد الأكاديمي») لتظهر المواد الجاهزة للتسجيل.'}</p></div>
        </aside>
      </div>`;
  }
  function mapPanel(p, x, G, k) {
    const n = G.nodes.find(n => n.key === k); if (!n) return '';
    const done = getDone(p), av = avail(n.code), anc = G.anc(k), des = G.desc.get(k), dir = G.post.get(k) || [];
    const nm = c => esc((G.by.get(c) || {}).name || CODE_NAME[c] || '');
    const chip = c => `<a href="#" class="am-chip ${done.has(c) ? 'ok' : ''}" data-go="${c}" title="${nm(c)}"><code>${c}</code> ${nm(c)}${done.has(c) ? ' <i class="bi bi-check2"></i>' : ''}</a>`;
    const ext = G.ext.get(k) || [], note = String(n.prereq || '').replace(/\b\d{6,7}\b/g, '').replace(/^[\s+،,/]+|[\s+،,/]+$/g, '');
    const missing = (G.pre.get(k) || []).filter(c => !done.has(c));
    const deg = (SP && SP.degree) || 'البكالوريوس', crit = realCode(n.code) && G.level(k) + G.chain(k) - 1 === G.longest;
    return `<div class="am-p"><div class="am-p-h av-${av.k}"><code>${esc(n.code)}</code><span>${n.hours ?? '—'} س.م</span><button type="button" class="btn-close btn-close-white" id="am-x" aria-label="إغلاق"></button></div>
      <h3>${esc(n.name || CODE_NAME[n.code] || '')}</h3>
      <p class="small text-muted mb-2">${YEAR[n.year] || ''} · ${TERM[n.term]}${n.mark ? ` · علامة الخطة <b>${esc(n.mark)}</b>` : ''}</p>
      <div class="am-facts"><span><b>${anc.size}</b>قبلها في السلسلة</span><span><b>${des.size}</b>تفتحها بعدها</span><span><b>${G.chain(k) - 1}</b>مواد متتالية بعدها</span></div>
      ${crit ? '<div class="am-warn"><i class="bi bi-lightning-charge-fill"></i> على أطول سلسلة متطلبات في الخطة: تأجيلها يؤجل ما بعدها وقد يؤخر التخرج.</div>' : ''}
      ${realCode(n.code) && done.size ? (done.has(n.code) ? '<div class="am-st-ok"><i class="bi bi-check-circle-fill"></i> مجتازة</div>' : missing.length ? `<div class="am-st-wait"><i class="bi bi-hourglass-split"></i> تنتظر: ${missing.join('، ')}</div>` : '<div class="am-st-go"><i class="bi bi-check2-circle"></i> متطلباتها في الخطة مجتازة: يمكن تسجيلها</div>') : ''}
      <h4><i class="bi bi-arrow-return-left"></i> متطلباتها السابقة</h4>
      <div class="am-chips">${(G.pre.get(k) || []).map(chip).join('') || '<small class="text-muted">لا متطلب من مواد الخطة</small>'}</div>
      ${ext.length || note ? `<p class="small mt-1 mb-0"><i class="bi bi-info-circle"></i> كما في الخطة: ${ext.map(c => `<code>${c}</code>${CODE_NAME[c] ? ' ' + esc(CODE_NAME[c]) : ''}`).join('، ')}${note ? ` <span class="text-muted">${esc(note).replace('P.T', 'امتحان مستوى (P.T)')}</span>` : ''}</p>` : ''}
      <h4><i class="bi bi-unlock"></i> تفتح مباشرة</h4>
      <div class="am-chips">${dir.map(c => chip(c)).join('') || '<small class="text-muted">لا مادة في الخطة تشترطها</small>'}</div>
      ${des.size > dir.length ? `<p class="small text-muted mb-0">ومعها ${des.size - dir.length} مادة أخرى أبعد في السلسلة.</p>` : ''}
      <h4><i class="bi bi-calendar-check"></i> في الجدول الدراسي الحالي <small class="text-muted">${esc(TTERM || '')}</small></h4>
      <p class="small mb-1"><span class="am-dot2" style="background:${AV[av.k][1]}"></span> ${esc(av.t)}</p>
      ${realCode(n.code) ? sectionsTable(n.code) : '<p class="small text-muted">خانة يختار الطالب لها مادة من مجموعة الخطة.</p>'}
      <div class="d-flex flex-wrap gap-1 mt-2 no-print">
        ${realCode(n.code) ? `<a class="btn btn-sm btn-outline-secondary" href="timetable.html?q=${n.code}"><i class="bi bi-table"></i> الجدول الدراسي</a>
        ${av.s.length ? `<a class="btn btn-sm btn-maroon" href="planner.html?c=${encodeURIComponent(n.code + '|' + deg)}"><i class="bi bi-calendar2-plus"></i> أضفها إلى مخطط جدولي</a>` : ''}
        <button type="button" class="btn btn-sm ${done.has(n.code) ? 'btn-outline-danger' : 'btn-outline-success'}" id="am-done" data-c="${n.code}"><i class="bi ${done.has(n.code) ? 'bi-x-circle' : 'bi-check2-circle'}"></i> ${done.has(n.code) ? 'إلغاء «مجتازة»' : 'علّمها مجتازة'}</button>` : ''}</div></div>`;
  }
  function drawMap(p, x) {
    const cv = $('#am-canvas'), svg = $('#am-svg'); if (!cv || !svg) return;
    const G = graph(x), R = cv.getBoundingClientRect(), box = {};
    cv.querySelectorAll('.am-n').forEach(e => { const r = e.getBoundingClientRect(); box[e.dataset.k] = { l: r.left - R.left, r: r.right - R.left, y: r.top - R.top + r.height / 2 }; });
    svg.setAttribute('width', cv.scrollWidth); svg.setAttribute('height', cv.scrollHeight);
    let paths = '';
    G.nodes.forEach(n => (G.pre.get(n.key) || []).forEach(pk => { const a = box[pk], b = box[n.key]; if (!a || !b) return;
      let d;
      if (b.r < a.l - 4) { const m = (a.l + b.r) / 2; d = `M${a.l},${a.y} C${m},${a.y} ${m},${b.y} ${b.r},${b.y}`; }          // RTL: the later course sits to the left
      else if (a.r < b.l - 4) { const m = (a.r + b.l) / 2; d = `M${a.r},${a.y} C${m},${a.y} ${m},${b.y} ${b.l},${b.y}`; }
      else { const o = Math.min(a.l, b.l) - 22; d = `M${a.l},${a.y} C${o},${a.y} ${o},${b.y} ${b.l},${b.y}`; }               // same column
      paths += `<path d="${d}" data-a="${esc(pk)}" data-b="${esc(n.key)}" marker-end="url(#am-ar)"/>`; }));
    svg.innerHTML = `<defs><marker id="am-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${paths}`;
    const focus = k => {
      cv.classList.toggle('focus', !!k);
      const anc = k ? G.anc(k) : new Set(), des = k ? G.desc.get(k) || new Set() : new Set();
      cv.querySelectorAll('.am-n').forEach(e => { const j = e.dataset.k; e.classList.toggle('sel', j === k); e.classList.toggle('anc', anc.has(j)); e.classList.toggle('desc', des.has(j)); });
      svg.querySelectorAll('path[data-a]').forEach(e => { const A = e.dataset.a, B = e.dataset.b;
        e.setAttribute('class', !k ? '' : (B === k || (anc.has(B) && anc.has(A)) || (anc.has(A) && B === k)) ? 'anc' : (A === k || (des.has(A) && des.has(B))) ? 'desc' : 'dim'); });
      const side = $('#am-side');
      if (k) { side.dataset.help ||= side.innerHTML; side.innerHTML = mapPanel(p, x, G, k); } else if (side.dataset.help) side.innerHTML = side.dataset.help;
      bindSide();
      const url = new URL(location.href); k ? url.searchParams.set('c', k) : url.searchParams.delete('c'); history.replaceState(null, '', url);
    };
    const go = c => { const e = cv.querySelector(`.am-n[data-k="${CSS.escape(c)}"]`); if (!e) return; st.sel = c; focus(c); e.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); };
    function bindSide() {
      const side = $('#am-side');
      side.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
      const xb = $('#am-x'); if (xb) xb.onclick = () => { st.sel = ''; focus(''); };
      const db = $('#am-done'); if (db) db.onclick = () => { const d = getDone(p), c = db.dataset.c; d.has(c) ? d.delete(c) : d.add(c); setDone(p, d); const y = scrollY; render(); scrollTo(0, y); };
    }
    cv.querySelectorAll('.am-n').forEach(e => e.onclick = () => { const k = e.dataset.k === st.sel ? '' : e.dataset.k; st.sel = k; focus(k); });
    cv.onclick = e => { if (e.target === cv || e.target.classList.contains('am-cols') || e.target.tagName === 'svg') { st.sel = ''; focus(''); } };
    focus(st.sel && box[st.sel] ? st.sel : '');
  }

  // ---------------------------------------------------------------- the plan's courses that are in the timetable this term
  function nowView(p, x) {
    if (!x.r.ok) return '<div class="alert alert-light border">هذا العرض يُبنى من الخطط المقروءة بمطابقة كاملة فقط.</div>' + original(x);
    const G = graph(x), done = getDone(p), a = advise(x, done), ready = new Set(a.ready.map(c => c.code));
    const real = G.nodes.filter(n => realCode(n.code)), off = real.filter(n => secs(n.code).length);
    const rows = off.filter(n => !st.no || avail(n.code).k === 'open').filter(n => !st.q || norm(n.code + ' ' + (n.name || '')).includes(norm(st.q)));
    const S = off.flatMap(n => secs(n.code)), open = S.filter(s => s.status !== 'مغلقة' && s.registered < s.capacity);
    return `<div class="row g-2 mb-3">${[[`${off.length}/${real.length}`, 'من مواد الخطة مطروحة هذا الفصل', '#0b4a66'], [S.length, 'شعبة لهذه المواد', '#901d23'], [open.length, 'شعبة مفتوحة فيها مقاعد', '#15803d'],
        [open.reduce((a, s) => a + s.capacity - s.registered, 0), 'مقعداً متاحاً', '#b8892b'], [real.length - off.length, 'غير مطروحة هذا الفصل', '#64748b']].map(([v, l, c]) => `<div class="col-6 col-md"><div class="sp-kpi" style="--c:${c}"><b>${v}</b><span>${l}</span></div></div>`).join('')}</div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2 no-print"><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="am-no" ${st.no ? 'checked' : ''}><label class="form-check-label small" for="am-no">فيها مقاعد فقط</label></div>
        ${done.size ? `<span class="small text-muted">· الجاهزة للطالب (حسب ما علّمته) بإطار ذهبي</span>` : ''}</div>
      ${rows.sort((a, b) => ORDER(a) - ORDER(b)).map(n => { const av = avail(n.code), d = G.desc.get(n.key).size;
        return `<section class="card mb-2 am-now av-${av.k} ${done.size && ready.has(n.code) ? 'ready' : ''} ${done.has(n.code) ? 'done' : ''}"><div class="card-body py-2">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-1"><code class="fw-bold">${n.code}</code><b>${esc(n.name || CODE_NAME[n.code] || '')}</b><span class="badge text-bg-light border">${n.hours} س.م</span>
            <small class="text-muted">${YEAR[n.year] || ''} · ${TERM[n.term]}</small>${n.prereq ? `<small class="ad-pre m-0"><i class="bi bi-arrow-return-left"></i> ${esc(n.prereq)}</small>` : ''}
            ${d ? `<span class="am-un"><i class="bi bi-unlock"></i> تفتح ${d}</span>` : ''}${done.has(n.code) ? '<span class="badge text-bg-success">مجتازة</span>' : ''}
            <span class="ms-auto small"><span class="am-dot2" style="background:${AV[av.k][1]}"></span> ${esc(av.t)}</span>
            <a class="btn btn-sm btn-light no-print" href="advisory.html?p=${encodeURIComponent(p.id)}&v=${x.v.sha}&view=map&c=${n.code}" title="في الخريطة"><i class="bi bi-diagram-3"></i></a></div>
          ${sectionsTable(n.code, st.no)}</div></section>`; }).join('') || '<p class="text-muted">لا مواد.</p>'}`;
  }

  // ---------------------------------------------------------------- the study plan on the portal with the most courses in common
  function portalMatch(x) {
    if (!SP || !x || !x.r.ok) return null;
    const codes = new Set(flat(x.r).keys());
    let best = null;
    SP.plans.forEach(pl => { const pc = new Set(pl.groups.flatMap(g => g.courses.map(c => c.code)));
      const inter = [...codes].filter(c => pc.has(c)).length, score = inter / Math.max(1, Math.min(codes.size, pc.size));
      if (!best || score > best.score) best = { pl, score, inter, missing: [...codes].filter(c => !pc.has(c)) }; });
    return best && best.score > 0.6 ? best : null;
  }

  // ---------------------------------------------------------------- page
  function render() {
    const facs = [...new Set(PROGS.map(p => p.faculty))];
    const list = PROGS.filter(p => !st.fac || p.faculty === st.fac);
    let p = PROGS.find(x => x.id === st.p) || list.find(x => planVersions(x).some(v => v.r.ok)) || list[0];
    if (p) st.p = p.id;
    const { vs, x } = p ? choose(p) : { vs: [], x: null };
    if (x) st.v = x.v.sha;
    const pm = portalMatch(x);
    const views = [['plan', 'الخطة', 'bi-grid-3x3'], ['map', 'خريطة المتطلبات', 'bi-diagram-3'], ['now', 'المطروح هذا الفصل', 'bi-calendar-check'], ['original', 'الأصل كما نُشر', 'bi-file-earmark-image'], ['versions', `الإصدارات (${vs.length})`, 'bi-clock-history'], ['advisor', 'المرشد الأكاديمي', 'bi-person-check'], ['files', 'كل الوثائق', 'bi-folder2-open']];
    const okN = PROGS.filter(q => planVersions(q).some(v => v.current && v.r.ok)).length;
    $('#ad-app').innerHTML = `<div class="card mb-3 no-print"><div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-3"><label class="small fw-bold" for="ad-fac">الكلية</label><select class="form-select form-select-sm" id="ad-fac"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="col-md-5"><label class="small fw-bold" for="ad-p">البرنامج (${list.length})</label><select class="form-select form-select-sm" id="ad-p">${['bachelor', 'master', 'phd'].map(t => { const g = list.filter(q => (q.type || 'bachelor') === t); return g.length ? `<optgroup label="${t === 'master' ? 'الماجستير' : t === 'phd' ? 'الدكتوراه' : 'البكالوريوس'}">${g.map(q => `<option value="${esc(q.id)}" ${q === p ? 'selected' : ''}>${esc(q.ar || q.en)}${planVersions(q).some(v => v.current && v.r.ok) ? ' ✓' : ''}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>
          <div class="col-md-4"><label class="small fw-bold" for="ad-v">الإصدار</label><select class="form-select form-select-sm" id="ad-v">${vs.map(o => `<option value="${o.v.sha}" ${o === x ? 'selected' : ''}>${esc(vTitle(o))}${o.r.ok ? ' ✓' : ''}</option>`).join('') || '<option>لا خطة منشورة</option>'}</select></div>
        </div>
        <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-2">
          <div class="btn-group btn-group-sm ad-views" role="group">${views.map(([k, l, i]) => `<button type="button" class="btn ${st.view === k ? 'btn-maroon' : 'btn-outline-secondary'}" data-view="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
          <div class="d-flex gap-2"><input class="form-control form-control-sm" id="ad-q" placeholder="ابحث في الخطة…" value="${esc(st.q)}" style="max-width:200px">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ad-csv"><i class="bi bi-filetype-csv"></i> CSV</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ad-print"><i class="bi bi-printer"></i> طباعة</button></div>
        </div></div></div>
      ${p ? `<section class="card mb-3 ad-head"><div class="card-body d-flex flex-wrap gap-3 justify-content-between align-items-start">
          <div><div class="d-flex flex-wrap gap-1 mb-1"><span class="badge rounded-pill text-bg-light border">${esc(p.faculty)}</span><span class="badge rounded-pill text-bg-light border">${p.type === 'master' ? 'ماجستير' : 'بكالوريوس'}</span>
            ${x ? (x.r.ok ? '<span class="badge rounded-pill text-bg-success"><i class="bi bi-check2-all"></i> قُرئت ومجاميع كل فصل تطابق المطبوع</span>' : '<span class="badge rounded-pill text-bg-secondary"><i class="bi bi-image"></i> تُعرض صفحاتها الأصلية</span>') : '<span class="badge rounded-pill text-bg-warning">لا خطة استرشادية منشورة على صفحة القسم</span>'}</div>
            <h2 class="ad-title">${esc(p.ar || p.en)}</h2><small class="text-muted">${esc(p.en || '')}${x ? ` · ${esc(vTitle(x))} · ${esc(x.d.name)}` : ''}</small></div>
          <div class="d-flex flex-column gap-1 align-items-end no-print">
            ${x ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(x.v.url)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> الملف الأصلي</a>` : ''}
            <a class="btn btn-sm btn-light" href="${esc(p.url_ar)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> صفحة القسم</a>
            ${pm ? `<a class="btn btn-sm btn-light" href="plans.html?plan=${encodeURIComponent(pm.pl.id)}" title="${pm.inter} مادة مشتركة"><i class="bi bi-journal-text"></i> الخطة الدراسية على البوابة</a>` : ''}</div>
        </div>
        ${x && x.r.ok ? `<div class="card-body pt-0"><div class="row g-2">${[[flat(x.r).size, 'مادة برقم', '#0b4a66'], [x.r.years.reduce((a, y) => a + y.read_hours, 0), 'ساعة في الخطة', '#901d23'], [x.r.years.length, 'سنوات', '#b8892b'],
            [[...flat(x.r).keys()].filter(k => secs(k).length).length, 'مطروحة هذا الفصل', '#15803d'], [pm ? pm.missing.length : '—', 'ليست في الخطة الدراسية على البوابة', '#6d28d9']]
            .map(([v, l, c]) => `<div class="col-6 col-md"><div class="sp-kpi" style="--c:${c}"><b>${v}</b><span>${l}</span></div></div>`).join('')}</div></div>` : ''}</section>` : ''}
      <div id="ad-body">${!p || !x ? (p ? filesView(p) : '') : st.view === 'map' ? mapView(p, x) : st.view === 'now' ? nowView(p, x) : st.view === 'original' ? original(x) : st.view === 'versions' ? versionsView(p, vs, x) : st.view === 'advisor' ? advisorView(p, x) : st.view === 'files' ? filesView(p) : planGrid(x)}</div>
      <p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> المصدر: صفحات الأقسام على مواقع الكليات ومكتباتها (مع الإصدارات السابقة التي يحتفظ بها الموقع)، تُراجع مع كل تحديث للموقع.
        ${okN} برنامجاً خطته الحالية مقروءة بمطابقة كاملة؛ الباقي تُعرض صفحاته الأصلية. «مطروح الآن» من الجدول الدراسي المنشور. المرجع المعتمد هو موقع الجامعة.</p>`;
    const url = new URL(location.href);
    [['fac', st.fac], ['p', st.p], ['v', st.v], ['view', st.view !== 'plan' && st.view], ['b', st.view === 'versions' && st.b], ['ml', st.view === 'map' && st.ml !== 'plan' && st.ml], ['c', st.view === 'map' && st.sel]].forEach(([k, v]) => v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    history.replaceState(null, '', url);
    bind(p, x, vs);
  }
  function bind(p, x, vs) {
    $('#ad-fac').onchange = e => { st.fac = e.target.value; st.p = st.v = ''; render(); };
    $('#ad-p').onchange = e => { st.p = e.target.value; st.v = ''; render(); };
    $('#ad-v').onchange = e => { st.v = e.target.value; render(); };
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { st.view = b.dataset.view; render(); });
    if (st.view === 'map' && p && x && x.r.ok) {
      document.querySelectorAll('[data-ml]').forEach(b => b.onclick = () => { st.ml = b.dataset.ml; render(); });
      document.querySelectorAll('[data-mf]').forEach(b => b.onclick = () => { st.mf = b.dataset.mf; render(); });
      requestAnimationFrame(() => drawMap(p, x));
      clearTimeout(window.__amR); window.onresize = () => { clearTimeout(window.__amR); window.__amR = setTimeout(() => st.view === 'map' && drawMap(p, x), 200); };
    }
    if (st.view === 'plan' && x && x.r.ok) document.querySelectorAll('#ad-body .ad-c[data-code]').forEach(c => { if (!realCode(c.dataset.code)) return;
      c.title = 'اعرضها في خريطة المتطلبات'; c.style.cursor = 'pointer'; c.onclick = e => { if (e.target.closest('a')) return; st.view = 'map'; st.sel = c.dataset.code; render(); scrollTo(0, 0); }; });
    if (st.view === 'now') { const n = $('#am-no'); if (n) n.onchange = e => { st.no = e.target.checked; render(); }; }
    document.querySelectorAll('[data-pick]').forEach(a => a.onclick = e => { e.preventDefault(); st.v = a.dataset.pick; st.view = 'plan'; render(); });
    const b = $('#ad-b'); if (b) b.onchange = e => { st.b = e.target.value; render(); };
    let t; $('#ad-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); const i = $('#ad-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    if (st.view === 'advisor' && p && x && x.r.ok) {
      document.querySelectorAll('#ad-body .ad-c[data-code]').forEach(c => c.onclick = () => { const d = getDone(p), k = c.dataset.code; if (!/^\d/.test(k)) return; d.has(k) ? d.delete(k) : d.add(k); setDone(p, d); const y = scrollY; render(); scrollTo(0, y); });
      const r = $('#ad-adv-reset'); if (r) r.onclick = () => { if (confirm('مسح كل المواد المعلَّمة؟')) { setDone(p, new Set()); render(); } };
      const pr = $('#ad-adv-print'); if (pr) pr.onclick = () => printAdvisor(p, x);
    }
    $('#ad-csv').onclick = () => { if (!x || !x.r.ok) return;
      const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [['السنة', 'الفصل', 'رقم المادة', 'اسم المادة', 'المتطلب السابق', 'العلامة', 'الساعات', 'شعب هذا الفصل']];
      x.r.years.forEach(y => y.terms.forEach(t => t.courses.forEach(c => rows.push([YEAR[y.year], TERM[t.term], c.code, c.name || CODE_NAME[c.code] || '', c.prereq, c.mark, c.hours, secs(c.code).length]))));
      U.download(`الخطة_الاسترشادية_${(p.ar || p.en).replace(/\s+/g, '_')}.csv`, '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); };
    $('#ad-print').onclick = () => doPrint(p, x);
  }
  function doPrint(p, x) {
    if (!p || !x) return;
    const base = { subtitle: `${p.faculty} · ${vTitle(x)}`, source: x.v.url.replace(/^https?:\/\//, '').slice(0, 70), qrLabel: 'الخطة الحية' };
    if (x.r.ok && st.view === 'map') return printMap(p, x, base);
    if (x.r.ok && st.view === 'now') return printNow(p, x, base);
    if (!x.r.ok || st.view === 'original') {
      return printReport({ title: 'الخطة الاسترشادية: ' + (p.ar || p.en), ...base, orientation: 'portrait', fit: false,
        raw: (x.v.images || []).map(n => `<img src="${new URL('data/advisory/' + n, location.href).href}" style="width:100%;display:block;margin-bottom:8px">`).join(''),
        note: 'صفحات الخطة كما نشرت على موقع الجامعة.' });
    }
    printReport({ title: 'الخطة الاسترشادية: ' + (p.ar || p.en), ...base, orientation: 'portrait',
      stats: [['ساعة', x.r.years.reduce((a, y) => a + y.read_hours, 0)], ['سنوات', x.r.years.length], ['مادة', flat(x.r).size]],
      sections: x.r.years.flatMap(y => y.terms.map(t => ({ title: `${YEAR[y.year]} · ${TERM[t.term]} · ${t.hours} ساعة`, columns: ['رقم المادة', 'اسم المادة', 'المتطلب السابق', 'س.م', 'هذا الفصل'],
        widths: ['13%', '47%', '22%', '7%', '11%'], numCols: [3], rows: t.courses.map(c => [c.code, (c.mark ? c.mark + ' ' : '') + (c.name || CODE_NAME[c.code] || ''), c.prereq || '—', c.hours, secs(c.code).length ? { html: `<span class="pill ok">${secs(c.code).length} شعبة</span>`, cls: 'num' } : { html: '<span class="pill mut">—</span>', cls: 'num' }]) }))),
      note: 'مقروءة من ملف الخطة المنشور على موقع الجامعة؛ مجموع ساعات كل فصل يطابق المجموع المطبوع فيها. «هذا الفصل» من الجدول الدراسي المنشور.' });
  }
  function printMap(p, x, base) {
    const G = graph(x), nm = c => (G.by.get(c) || {}).name || CODE_NAME[c] || '';
    printReport({ title: 'خريطة متطلبات الخطة الاسترشادية: ' + (p.ar || p.en), ...base, orientation: 'landscape',
      stats: [['مادة', G.by.size], ['أطول سلسلة', G.longest], ['مطروحة الآن', [...G.by.keys()].filter(c => secs(c).length).length]],
      sections: [{ title: 'كل مادة: ما تحتاجه وما تفتحه وحالتها هذا الفصل', columns: ['رقم المادة', 'اسم المادة', 'موقعها', 'متطلباتها', 'تفتح مباشرة', 'تفتح إجمالاً', 'هذا الفصل'], numCols: [5],
        widths: ['9%', '25%', '13%', '15%', '20%', '7%', '11%'],
        rows: G.nodes.filter(n => realCode(n.code)).sort((a, b) => ORDER(a) - ORDER(b)).map(n => { const av = avail(n.code);
          return [n.code, nm(n.code), `${YEAR[n.year] || ''} · ${TERM[n.term]}`, n.prereq || '—', (G.post.get(n.key) || []).join('، ') || '—', G.desc.get(n.key).size,
            { html: `<span class="pill ${av.k === 'open' ? 'ok' : av.k === 'closed' ? 'no' : 'mut'}">${av.k === 'open' ? av.open.length + ' مفتوحة' : av.k === 'closed' ? 'مغلقة' : '—'}</span>`, cls: 'num' }]; }) }],
      note: '«تفتح إجمالاً» = كل المواد التي تشترطها مباشرة أو عبر سلسلة. المتطلبات كما في ملف الخطة المنشور؛ حالة الشعب من الجدول الدراسي المنشور.' });
  }
  function printNow(p, x, base) {
    const G = graph(x);
    printReport({ title: 'مواد الخطة الاسترشادية المطروحة هذا الفصل: ' + (p.ar || p.en), ...base, orientation: 'landscape',
      sections: G.nodes.filter(n => realCode(n.code) && secs(n.code).length).sort((a, b) => ORDER(a) - ORDER(b)).map(n => ({ title: `${n.code} ${n.name || CODE_NAME[n.code] || ''} · ${n.hours} س · ${YEAR[n.year] || ''} ${TERM[n.term]}`,
        columns: ['شعبة', 'النشاط', 'الموعد', 'المدرّس', 'القاعة', 'المسجلون/السعة', 'الحالة'], widths: ['6%', '9%', '25%', '28%', '10%', '11%', '11%'],
        rows: secs(n.code).filter(s => !st.no || (s.status !== 'مغلقة' && s.registered < s.capacity)).map(s => [s.section, s.activity, (s.meetings || []).map(m => `${m.day} ${m.start}-${m.end}`).join(' · '), s.instructor, s.room, { html: `<span dir="ltr">${s.registered}/${s.capacity}</span>`, cls: 'num' },
          { html: `<span class="pill ${s.status === 'مغلقة' || s.registered >= s.capacity ? 'no' : 'ok'}">${s.status === 'مغلقة' ? 'مغلقة' : s.registered >= s.capacity ? 'ممتلئة' : 'مفتوحة'}</span>`, cls: 'num' }]) })),
      note: 'من الجدول الدراسي المنشور لهذا الفصل.' });
  }
  function printAdvisor(p, x) {
    const done = getDone(p), a = advise(x, done);
    printReport({ title: 'كشف الإرشاد الأكاديمي: ' + (p.ar || p.en), subtitle: `${p.faculty} · ${vTitle(x)}`, orientation: 'portrait', qrLabel: 'الخطة الحية',
      stats: [['ساعة منجزة', a.got], ['من أصل', a.total], ['يمكن تسجيلها', a.ready.length], ['متبقية', a.left.length]],
      sections: [{ title: 'يمكن تسجيلها الآن (حسب المتطلبات المذكورة في الخطة)', columns: ['رقم المادة', 'اسم المادة', 'موقعها في الخطة', 'س.م', 'هذا الفصل'], numCols: [3],
          rows: a.ready.map(c => [c.code, c.name || CODE_NAME[c.code] || '', `${YEAR[c.year] || ''} · ${TERM[c.term]}`, c.hours, secs(c.code).length ? secs(c.code).length + ' شعبة' : '—']) },
        { title: 'مواد مجتازة', columns: ['رقم المادة', 'اسم المادة', 'س.م'], numCols: [2], rows: a.all.filter(c => done.has(c.code)).map(c => [c.code, c.name || CODE_NAME[c.code] || '', c.hours]) },
        { title: 'متبقية بانتظار متطلب', columns: ['رقم المادة', 'اسم المادة', 'ينتظر'], rows: a.left.filter(c => !a.ready.includes(c)).map(c => [c.code, c.name || CODE_NAME[c.code] || '', prereqCodes(c.prereq).filter(q => !done.has(q)).join('، ')]) }],
      note: 'كشف استرشادي من اختيارات المرشد على جهازه؛ المرجع المعتمد هو كشف العلامات والخطة الرسمية.' });
  }

  Promise.all([U.getJSON('data/advisory_plans.json'), U.getJSON('data/timetable.json').catch(() => ({ sections: [] })), U.getJSON('data/study_plans.json').catch(() => null)]).then(([a, tt, sp]) => {
    A = a; DOCS = a.docs; READS = a.reads; SP = sp; TTERM = tt.term || '';
    PROGS = a.programs.filter(p => p.docs.length || p.links.some(l => l.kind));
    (tt.sections || []).forEach(s => { const k = s.section + '|' + s.activity; (TT[s.code] ||= new Map()).set(k, s); });
    Object.keys(TT).forEach(k => { TT[k] = [...TT[k].values()]; });
    if (sp) sp.plans.forEach(pl => pl.groups.forEach(g => g.courses.forEach(c => { CODE_NAME[c.code] ||= c.name; })));
    // ?sp=<study plan id> (from «الخطط الدراسية»): the programme whose plan shares the most courses with it
    if (P.get('sp') && sp && !st.p) {
      const pl = sp.plans.find(x => x.id === P.get('sp'));
      if (pl) {
        const pc = new Set(pl.groups.flatMap(g => g.courses.map(c => c.code)));
        let best = null;
        PROGS.forEach(q => planVersions(q).filter(x => x.current && x.r.ok).forEach(x => { const codes = [...flat(x.r).keys()];
          const sc = codes.filter(c => pc.has(c)).length / Math.max(1, codes.length); if (!best || sc > best.sc) best = { q, x, sc }; }));
        if (best && best.sc > 0.6) { st.p = best.q.id; st.v = best.x.v.sha; }
        else { const n = norm(pl.major); const q = PROGS.find(q => norm(q.ar).includes(n) || n.includes(norm(q.ar))); if (q) st.p = q.id; }
      }
    }
    U.updatedLine(a.updated, `${PROGS.length} برنامجاً`);
    const top = $('#pg-q'); if (top) top.addEventListener('input', e => { st.q = e.target.value; render(); });
    render();
  }).catch(e => { console.error(e); $('#ad-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل الخطط الاسترشادية. أعد المحاولة بعد قليل.</div>'; });
})();
