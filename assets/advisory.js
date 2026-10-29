/* «الخطط الاسترشادية»: the advisory study plans the faculty sites publish (data/advisory_plans.json, refreshed with the
   hourly update), with every earlier version SharePoint keeps. A plan is shown as years and semesters only when every
   semester's hours, as read, equal the totals printed in the plan; the original pages are always one click away.
   Views of one programme:
     plan      – years × semesters, each course with its hours, prerequisites and whether it is offered this term
     original  – the plan's own pages, as published
     versions  – every version of the plan; what changed between two of them
     advisor   – a student's progress: passed courses, what is left, what can be taken next (and is offered now)
     files     – every plan document of the programme (handbook, course tree …) with its versions
   ?p=<programme id>&d=<document id>&v=<file hash>&view=…  */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { fac: P.get('fac') || '', p: P.get('p') || '', d: P.get('d') || '', v: P.get('v') || '', view: P.get('view') || 'plan', b: P.get('b') || '', q: '' };
  let A, PROGS, DOCS, READS, TT = {}, SP = null, CODE_NAME = {};
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
    const views = [['plan', 'الخطة', 'bi-grid-3x3'], ['original', 'الأصل كما نُشر', 'bi-file-earmark-image'], ['versions', `الإصدارات (${vs.length})`, 'bi-clock-history'], ['advisor', 'المرشد الأكاديمي', 'bi-person-check'], ['files', 'كل الوثائق', 'bi-folder2-open']];
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
      <div id="ad-body">${!p || !x ? (p ? filesView(p) : '') : st.view === 'original' ? original(x) : st.view === 'versions' ? versionsView(p, vs, x) : st.view === 'advisor' ? advisorView(p, x) : st.view === 'files' ? filesView(p) : planGrid(x)}</div>
      <p class="small text-muted mt-3"><i class="bi bi-info-circle"></i> المصدر: صفحات الأقسام على مواقع الكليات ومكتباتها (مع الإصدارات السابقة التي يحتفظ بها الموقع)، تُراجع مع كل تحديث للموقع.
        ${okN} برنامجاً خطته الحالية مقروءة بمطابقة كاملة؛ الباقي تُعرض صفحاته الأصلية. «مطروح الآن» من الجدول الدراسي المنشور. المرجع المعتمد هو موقع الجامعة.</p>`;
    const url = new URL(location.href);
    [['fac', st.fac], ['p', st.p], ['v', st.v], ['view', st.view !== 'plan' && st.view], ['b', st.view === 'versions' && st.b]].forEach(([k, v]) => v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    history.replaceState(null, '', url);
    bind(p, x, vs);
  }
  function bind(p, x, vs) {
    $('#ad-fac').onchange = e => { st.fac = e.target.value; st.p = st.v = ''; render(); };
    $('#ad-p').onchange = e => { st.p = e.target.value; st.v = ''; render(); };
    $('#ad-v').onchange = e => { st.v = e.target.value; render(); };
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { st.view = b.dataset.view; render(); });
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
    A = a; DOCS = a.docs; READS = a.reads; SP = sp;
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
