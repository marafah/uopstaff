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
  const st = { fac: P.get('fac') || '', p: P.get('p') || '', d: P.get('d') || '', v: P.get('v') || '', view: P.get('view') || 'plan', b: P.get('b') || '', q: '', sel: P.get('c') || '', ml: P.get('ml') || 'plan', mf: 'all', no: false, pt: 'info', po: false, ma: true, pl: (() => { try { return localStorage.getItem('uop-ad-pl') || 'board'; } catch (e) { return 'board'; } })(), pc: 'type' };
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
    const nm = c.name || CODE_NAME[c.code] || '';
    const pre = prereqCodes(c.prereq), note = String(c.prereq || '').replace(/\b\d{6,7}\b/g, '').replace(/^[\s+،,/]+|[\s+،,/]+$/g, '');
    const av = avail(c.code), slot = !/^\d/.test(c.code || '');
    const pill = av.k === 'open' ? `<a class="ap-st ok" href="timetable.html?q=${encodeURIComponent(c.code)}" title="${esc(av.t)}"><i></i>${av.open.length}/${av.s.length} مفتوحة</a>`
      : av.k === 'closed' ? `<a class="ap-st no" href="timetable.html?q=${encodeURIComponent(c.code)}" title="${esc(av.t)}"><i></i>مغلقة</a>`
      : av.k === 'slot' ? '<span class="ap-st el"><i></i>اختياري</span>' : '<span class="ap-st na"><i></i>غير مطروحة</span>';
    return `<div class="ad-c ap-r ${slot ? 'slot' : ''} ${opts.done ? 'done' : ''} ${opts.next ? 'next' : ''}" data-code="${esc(c.code)}">
      <span class="ap-h" title="ساعات معتمدة">${c.hours ?? '—'}</span>
      <div class="ap-m"><div class="ap-n"><code>${esc(c.code || '—')}</code><b title="${esc(nm)}">${esc(nm)}</b>${c.mark ? `<sup class="ap-mk" title="علامة في الخطة الأصلية">${esc(c.mark)}</sup>` : ''}</div>
        ${c.prereq ? `<div class="ap-p"><i class="bi bi-arrow-return-left"></i>${pre.map(p => `<span title="${esc(CODE_NAME[p] || '')}">${p}</span>`).join('')}${note ? `<small>${esc(note)}</small>` : ''}</div>` : ''}</div>
      ${pill}</div>`;
  }
  function planGrid(x, opts = {}) {
    const r = x.r;
    if (!r.ok || !(r.years || []).length) return original(x, true);
    const checks = Object.fromEntries((r.checks || []).map(c => [c.year + '|' + c.term, c]));
    const done = opts.done || new Set(), next = opts.next || new Set();
    const q = norm(st.q.trim());
    const keep = c => !q || norm(c.code + ' ' + (c.name || '') + ' ' + (CODE_NAME[c.code] || '')).includes(q);
    const real = cs => cs.filter(c => /^\d/.test(c.code || ''));
    const offN = cs => real(cs).filter(c => secs(c.code).length).length;
    return `<div class="ap-legend"><span><i class="ok"></i>مطروحة وفيها مقاعد</span><span><i class="no"></i>مطروحة ومغلقة</span><span><i class="na"></i>غير مطروحة هذا الفصل</span><span><i class="el"></i>خانة اختيار</span><span><i class="bi bi-arrow-return-left"></i> المتطلب السابق</span><span class="text-muted">انقر المادة لعرضها في الخريطة</span></div>
      <div class="ap-years">${r.years.map(y => { const all = y.terms.flatMap(t => t.courses);
        return `<section class="ap-year">
        <header><span class="ap-yn">${y.year}</span><b>${YEAR[y.year] || 'سنة'}</b>
          <span class="ap-yk"><b>${y.read_hours}</b> ساعة</span><span class="ap-yk"><b>${real(all).length}</b> مادة</span><span class="ap-yk"><b>${offN(all)}</b> مطروحة الآن</span>
          ${y.hours != null && y.hours !== y.read_hours ? `<span class="badge text-bg-warning" title="العنوان في الخطة يذكر ${y.hours}">العنوان: ${y.hours}</span>` : ''}</header>
        <div class="ap-terms">${y.terms.map(t => { const ck = checks[y.year + '|' + t.term], cs = t.courses.filter(keep);
          return `<div class="ap-term ${t.term === 'summer' ? 'sum' : ''}"><h4><span>${TERM[t.term]}</span><small>${real(t.courses).length} مادة · ${offN(t.courses)} مطروحة</small>
              <em title="${ck ? `يطابق المجموع المطبوع في الخطة (${ck.printed})` : 'مجموع الساعات'}">${t.hours} س${ck ? ' <i class="bi bi-patch-check-fill"></i>' : ''}</em></h4>
            <div class="ap-list">${cs.map(c => courseCard(c, { done: done.has(c.code), next: next.has(c.code) })).join('') || '<p class="small text-muted m-2">—</p>'}</div></div>`; }).join('')}</div></section>`; }).join('')}</div>
      ${(r.notes || []).length ? `<p class="small text-muted mt-2"><i class="bi bi-info-circle"></i> ملاحظة على الخطة الأصلية: ${r.notes.map(n => esc(n.replace(/year (\d+): header says (\d+) hours, its semesters total (\d+)/, 'السنة $1: العنوان يذكر $2 ساعة ومجموع فصولها المطبوع $3'))).join('، ')}.</p>` : ''}`;
  }
  // ---------------------------------------------------------------- the plan at a glance: every semester side by side on one screen
  function kindOf(code, major) {
    if (!/^\d/.test(code || '')) return 'el';
    if (/^9/.test(code)) return 'uni';
    return code.slice(0, 3) === major ? 'maj' : 'fac';
  }
  const KINDS = { uni: ['متطلب جامعة', '#6d28d9', 'bi-bank'], fac: ['مساند / كلية', '#0b4a66', 'bi-building'], maj: ['تخصص', '#901d23', 'bi-mortarboard'], el: ['خانة اختيار', '#b8892b', 'bi-ui-checks-grid'] };
  function planView(x) {
    if (!x.r.ok || !(x.r.years || []).length) return original(x, true);
    const sw = `<div class="pb-bar no-print"><div class="btn-group btn-group-sm" role="group" aria-label="طريقة عرض الخطة">
        <button type="button" class="btn ${st.pl === 'board' ? 'btn-dark' : 'btn-outline-dark'}" data-pl="board"><i class="bi bi-kanban"></i> لوحة الخطة</button>
        <button type="button" class="btn ${st.pl === 'list' ? 'btn-dark' : 'btn-outline-dark'}" data-pl="list"><i class="bi bi-list-columns-reverse"></i> جدول مفصّل</button></div>
      ${st.pl === 'board' ? `<div class="btn-group btn-group-sm" role="group" aria-label="التلوين"><span class="pb-lbl">التلوين:</span>
        ${[['type', 'نوع المادة', 'bi-tags'], ['status', 'حالتها هذا الفصل', 'bi-calendar-check'], ['chain', 'أهميتها في السلسلة', 'bi-diagram-3']].map(([k, l, i]) => `<button type="button" class="btn ${st.pc === k ? 'btn-maroon' : 'btn-outline-secondary'}" data-pc="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>` : ''}</div>`;
    return sw + (st.pl === 'list' ? planGrid(x) : planBoard(x));
  }
  function planBoard(x) {
    const G = graph(x), r = x.r;
    const real = G.nodes.filter(n => realCode(n.code));
    const freq = {}; real.filter(n => !/^9/.test(n.code)).forEach(n => { const p = n.code.slice(0, 3); freq[p] = (freq[p] || 0) + (n.hours || 0); });
    const major = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const q = norm(st.q.trim());
    const hit = n => !q || norm(n.code + ' ' + (n.name || '') + ' ' + (CODE_NAME[n.code] || '')).includes(q);
    const maxD = Math.max(1, ...G.nodes.map(n => G.desc.get(n.key).size));
    const tot = {}; G.nodes.forEach(n => { const k = kindOf(n.code, major); tot[k] = (tot[k] || 0) + (n.hours || 0); });
    const all = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    const terms = []; r.years.forEach(y => y.terms.forEach(t => terms.push({ y, t, nodes: G.nodes.filter(n => n.year === y.year && n.term === t.term) })));
    const colorOf = n => { const k = kindOf(n.code, major);
      if (st.pc === 'status') return AV[avail(n.code).k][1];
      if (st.pc === 'chain') { const d = G.desc.get(n.key).size; return !realCode(n.code) ? '#cbd5e1' : `hsl(${350 - 0}, ${30 + 60 * d / maxD}%, ${88 - 50 * d / maxD}%)`; }
      return KINDS[k][1]; };
    const chip = n => { const k = kindOf(n.code, major), av = avail(n.code), d = G.desc.get(n.key).size, pre = (G.pre.get(n.key) || []).length, c = colorOf(n);
      const crit = realCode(n.code) && G.level(n.key) + G.chain(n.key) - 1 === G.longest;
      return `<div class="ad-c pb-c k-${k} ${hit(n) ? '' : 'dim'}" data-code="${esc(n.code)}" style="--c:${c}" title="${esc((n.name || CODE_NAME[n.code] || '') + ' · ' + KINDS[k][0] + ' · ' + av.t + (n.prereq ? ' · المتطلب: ' + n.prereq : ''))}">
        <div class="pb-t"><i class="bi ${KINDS[k][2]}"></i><code>${esc(n.code)}</code><span class="pb-h">${n.hours ?? '—'}</span></div>
        <div class="pb-n">${esc(n.name || CODE_NAME[n.code] || '')}</div>
        <div class="pb-f"><span class="pb-s s-${av.k}">${av.k === 'open' ? `<i class="bi bi-door-open"></i>${av.open.length}/${av.s.length}` : av.k === 'closed' ? '<i class="bi bi-door-closed"></i>مغلقة' : av.k === 'slot' ? '<i class="bi bi-ui-checks"></i>اختياري' : '<i class="bi bi-dash-circle"></i>غير مطروحة'}</span>
          ${pre ? `<span title="لها ${pre} متطلب سابق في الخطة"><i class="bi bi-arrow-return-left"></i>${pre}</span>` : ''}${d ? `<span title="تفتح ${d} مادة"><i class="bi bi-unlock"></i>${d}</span>` : ''}${crit ? '<span class="pb-cr" title="على أطول سلسلة متطلبات"><i class="bi bi-lightning-charge-fill"></i></span>' : ''}${n.mark ? `<span class="pb-mk" title="علامة في الخطة">${esc(n.mark)}</span>` : ''}</div></div>`; };
    const legend = st.pc === 'type' ? Object.entries(KINDS).map(([k, [l, c, i]]) => `<span><i class="bi ${i}" style="color:${c}"></i>${l} <b>${tot[k] || 0}</b> س</span>`).join('')
      : st.pc === 'status' ? Object.entries(AV).map(([k, [l, c]]) => `<span><i class="pb-dot" style="background:${c}"></i>${l}</span>`).join('')
      : '<span><i class="pb-dot" style="background:hsl(350,35%,85%)"></i>تفتح مواد قليلة</span><span><i class="pb-dot" style="background:hsl(350,90%,38%)"></i>تفتح مواد كثيرة (مفتاحية)</span>';
    return `<div class="pb-sum">
        <div class="pb-stack" title="توزيع ساعات الخطة">${Object.entries(KINDS).filter(([k]) => tot[k]).map(([k, [l, c]]) => `<i style="width:${100 * tot[k] / all}%;background:${c}" title="${l}: ${tot[k]} ساعة"></i>`).join('')}</div>
        <div class="pb-leg">${legend}<small class="text-muted">${st.pc === 'type' ? 'التصنيف حسب بادئة رقم المادة' : ''}</small></div></div>
      <div class="pb-board" style="--n:${terms.length}">${terms.map(({ y, t, nodes }) => { const h = nodes.reduce((a, n) => a + (n.hours || 0), 0), off = nodes.filter(n => realCode(n.code) && secs(n.code).length).length;
        return `<section class="pb-col ${t.term === 'summer' ? 'sum' : ''} y${y.year % 2}">
          <header><b>${YEAR[y.year] || ''}</b><span>${TERM[t.term]}</span><div class="pb-hd"><em>${h} س</em><small>${nodes.filter(n => realCode(n.code)).length} مادة · ${off} مطروحة</small></div></header>
          <div class="pb-list">${nodes.map(chip).join('')}</div></section>`; }).join('')}</div>`;
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
  // the course panel either floats over the map (opens when a course is chosen, closes with it) or is pinned beside it
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  let PIN = store('uop-am-pin') === '1';
  let ZOOM = Math.min(2, Math.max(0.3, +store('uop-am-zoom') || 1));
  let ZMODE = store('uop-am-zmode') || 'fit';   // 'fit': the map always fills the width (no horizontal scrolling); 'manual': the zoom the user chose
  let HELP = false, HIST = [];
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
    // order the cards of each column next to the courses they connect to (barycentre sweeps), so arrows cross as little as possible;
    // courses with no link in the plan go to the bottom of their column
    const pos = new Map(), colOf = new Map();
    keys.forEach((k, ci) => cols.get(k).sort((a, b) => ORDER(a) - ORDER(b)).forEach((n, i) => { pos.set(n.key, i); colOf.set(n.key, ci); }));
    const nb = (n, d) => (d > 0 ? G.pre.get(n.key) || [] : G.post.get(n.key) || []).filter(j => colOf.has(j) && (d > 0 ? colOf.get(j) < colOf.get(n.key) : colOf.get(j) > colOf.get(n.key)));
    const avg = a => a.reduce((s, j) => s + pos.get(j), 0) / a.length;
    for (let it = 0; it < 6; it++) {
      const d = it % 2 ? -1 : 1;
      (d > 0 ? keys : [...keys].reverse()).forEach(k => {
        const sc = new Map(cols.get(k).map(n => { const a = nb(n, d), b = nb(n, -d); return [n.key, a.length ? avg(a) : b.length ? avg(b) : 1e4 + pos.get(n.key)]; }));
        cols.get(k).sort((x, y) => sc.get(x.key) - sc.get(y.key)).forEach((n, i) => pos.set(n.key, i));
      });
    }
    // then swap neighbours in a column whenever that shortens the links and crosses fewer of them
    const E = []; G.nodes.forEach(n => (G.pre.get(n.key) || []).forEach(a => { if (colOf.has(a) && colOf.get(a) !== colOf.get(n.key)) E.push([a, n.key]); }));
    const touch = new Map(); E.forEach(e => e.forEach(k => (touch.get(k) || touch.set(k, []).get(k)).push(e)));
    const cost = ks => { const es = new Set(ks.flatMap(k => touch.get(k) || [])); let c = 0;
      es.forEach(([a, b]) => { c += Math.abs(pos.get(a) - pos.get(b)); });
      es.forEach(e1 => E.forEach(e2 => { if (e1 === e2) return;   // links that share their two columns and cross
        if (colOf.get(e1[0]) === colOf.get(e2[0]) && colOf.get(e1[1]) === colOf.get(e2[1]) && (pos.get(e1[0]) - pos.get(e2[0])) * (pos.get(e1[1]) - pos.get(e2[1])) < 0) c += 1.5; }));
      return c; };
    for (let it = 0, better = true; it < 8 && better; it++) { better = false;
      keys.forEach(k => { const arr = cols.get(k);
        for (let i = 0; i + 1 < arr.length; i++) { const u = arr[i], v = arr[i + 1]; if (!touch.has(u.key) && !touch.has(v.key)) continue;
          const before = cost([u.key, v.key]); pos.set(u.key, i + 1); pos.set(v.key, i);
          if (cost([u.key, v.key]) + 1e-9 < before) { arr[i] = v; arr[i + 1] = u; better = true; } else { pos.set(u.key, i); pos.set(v.key, i + 1); } } }); }
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
    return `<div class="am-wrap" id="am-wrap"><div class="am-tools card mb-2 no-print"><div class="card-body py-1 px-2 d-flex flex-wrap gap-2 align-items-center">
        <div class="btn-group btn-group-sm" role="group" aria-label="الترتيب"><button type="button" class="btn ${st.ml !== 'chain' ? 'btn-dark' : 'btn-outline-dark'}" data-ml="plan"><i class="bi bi-calendar3"></i> حسب فصول الخطة</button><button type="button" class="btn ${st.ml === 'chain' ? 'btn-dark' : 'btn-outline-dark'}" data-ml="chain"><i class="bi bi-diagram-2"></i> حسب سلسلة المتطلبات</button></div>
        <div class="d-flex flex-wrap gap-1">${flt.map(([k, l]) => `<button type="button" class="btn btn-sm am-f ${st.mf === k ? 'on' : ''}" data-mf="${k}">${l}</button>`).join('')}</div>
        <div class="am-legend ms-auto">${Object.entries(AV).map(([k, [l, c]]) => `<span><i style="background:${c}"></i>${l} <b>${counts[k]}</b></span>`).join('')}<span><i class="bi bi-lightning-charge-fill text-warning"></i> أطول سلسلة (${G.longest} مواد)</span></div>
        <button type="button" class="btn btn-sm am-f ${st.ma ? 'on' : ''}" id="am-ma" title="إظهار كل الأسهم أو أسهم المادة التي تمرّ عليها أو تختارها فقط"><i class="bi bi-bezier2"></i> كل الروابط</button>
</div></div>
      ${G.nodes.some(n => (G.pre.get(n.key) || []).length) ? '' : '<div class="alert alert-light border small py-2"><i class="bi bi-info-circle"></i> ملف هذه الخطة لا يذكر المتطلبات السابقة للمواد، فتظهر المواد بلا روابط بينها؛ وتبقى حالة كل مادة وشعبها في الجدول الحالي ظاهرة.</div>'}
      <div class="am-row ${PIN ? 'docked' : 'floating'}">
        <div class="am-stage">
          <div class="am-zoombar no-print" role="toolbar" aria-label="أدوات الخريطة">
            <button type="button" data-z="out" title="تصغير (−)"><i class="bi bi-dash-lg"></i></button>
            <button type="button" data-z="1" id="am-zl" title="الحجم الفعلي (0)">100%</button>
            <button type="button" data-z="in" title="تكبير (+)"><i class="bi bi-plus-lg"></i></button>
            <span class="am-zsep"></span>
            <button type="button" data-z="w" title="ملاءمة العرض تلقائياً: الخريطة كلها بعرض الشاشة بلا شريط تمرير أفقي"><i class="bi bi-arrows-expand-vertical"></i><span>ملاءمة العرض</span></button>
            <button type="button" data-z="all" title="إظهار الخريطة كاملة"><i class="bi bi-aspect-ratio"></i><span>الخريطة كاملة</span></button>
            <span class="am-zsep"></span>
            <button type="button" id="am-help-b" title="دليل الخريطة والمواد المفتاحية"><i class="bi bi-question-circle"></i></button>
            <button type="button" id="am-fs" title="ملء الشاشة"><i class="bi bi-arrows-fullscreen"></i></button>
          </div>
          <div class="am-scroll" id="am-scroll" title=""><div class="am-sizer" id="am-sizer"><div class="am-canvas" id="am-canvas"><svg id="am-svg" aria-hidden="true"></svg>
          <div class="am-cols">${keys.map(k => `<div class="am-col"><header>${head(k)}<span>${cols.get(k).reduce((a, n) => a + (n.hours || 0), 0)} س</span></header>${cols.get(k).map(node).join('')}</div>`).join('')}</div></div></div></div>
          <div class="am-hint no-print"><i class="bi bi-mouse"></i> اسحب لتحريك الخريطة · Ctrl + عجلة الفأرة للتكبير · Esc لإلغاء الاختيار</div></div>
        <aside class="am-side" id="am-side">
          <div class="am-help"><div class="am-help-top"><h3><i class="bi bi-cursor"></i> اختر مادة من الخريطة</h3>${pinBtn()}<button type="button" class="am-ic dark" data-close title="إغلاق"><i class="bi bi-x-lg"></i></button></div><p>تظهر <span class="am-k anc">متطلباتها</span> وكل ما قبلها، و<span class="am-k desc">ما تفتحه</span> وكل ما بعده، مع شعبها في الجدول الدراسي الحالي وحالة كل شعبة ومقاعدها.</p>
            <h4>المواد المفتاحية في هذه الخطة</h4><ol>${keyCourses.map(n => `<li><a href="#" data-go="${n.code}"><code>${n.code}</code> ${esc(n.name || CODE_NAME[n.code] || '')}</a> <small>تفتح ${G.desc.get(n.key).size}</small></li>`).join('')}</ol>
            <p class="small text-muted mb-0">${done.size ? `معلّم ${done.size} مادة مجتازة من «المرشد الأكاديمي»: المجتازة باهتة، والجاهزة للتسجيل بإطار ذهبي.` : 'علّم ما اجتازه الطالب (من هنا أو من «المرشد الأكاديمي») لتظهر المواد الجاهزة للتسجيل.'}</p></div>
        </aside>
      </div></div>`;
  }
  const pinBtn = light => `<button type="button" class="am-ic ${light ? '' : 'dark'} ${PIN ? 'on' : ''}" data-pin title="${PIN ? 'إلغاء التثبيت: تطفو اللوحة فوق الخريطة وتُغلق مع إلغاء الاختيار' : 'تثبيت اللوحة بجانب الخريطة'}"><i class="bi ${PIN ? 'bi-pin-angle-fill' : 'bi-pin-angle'}"></i></button>`;
  // the programme header on one row
  if (!document.getElementById('ad-h-css')) { const c = document.createElement('style'); c.id = 'ad-h-css'; c.textContent = `
    .am-col { gap: 16px !important; }
    .ad-hrow { display: flex; align-items: center; gap: .35rem; flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
    .ad-hrow .ad-title { font-size: 1.05rem; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .ad-hrow .badge { font-size: .7rem; flex: none; } .ad-hrow .ad-kp { flex: none; } .ad-hrow .flex-none { flex: none; }
    .ad-vt-s { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: .72rem; }
    @media (max-width: 1500px) { .ad-hrow .ad-sb span { display: none; } }
    @media (max-width: 1200px) { .ad-vt-s { display: none; } }
    @media (max-width: 900px) { .ad-hrow { flex-wrap: wrap; white-space: normal; } }`; document.head.appendChild(c); }
  // the plan as years and semesters: compact, table-like course rows
  if (!document.getElementById('ap-css')) { const c = document.createElement('style'); c.id = 'ap-css'; c.textContent = `
    .ap-legend { display: flex; flex-wrap: wrap; gap: .4rem 1rem; font-size: .74rem; color: #495057; margin: 0 .2rem .5rem; }
    .ap-legend i:not(.bi) { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-inline-end: .3rem; vertical-align: middle; }
    .ap-legend i.ok, .ap-st.ok i { background: #15803d; } .ap-legend i.no, .ap-st.no i { background: #c2410c; } .ap-legend i.na, .ap-st.na i { background: #94a3b8; } .ap-legend i.el, .ap-st.el i { background: #6d28d9; }
    .ap-years { display: flex; flex-direction: column; gap: .8rem; }
    .ap-year { background: #fff; border: 1px solid #e7e3d8; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(9,27,34,.05); }
    .ap-year > header { display: flex; align-items: center; gap: .6rem; padding: .45rem .9rem; background: linear-gradient(90deg, #0b4a66, #091b22); color: #fff; }
    .ap-yn { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #901d23; font-weight: 800; font-size: .9rem; }
    .ap-year > header > b { font-size: 1rem; margin-inline-end: auto; }
    .ap-yk { font-size: .76rem; background: rgba(255,255,255,.12); border-radius: 99px; padding: .05rem .6rem; } .ap-yk b { font-size: .86rem; }
    .ap-terms { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
    .ap-term { border-inline-start: 1px solid #eef0f2; min-width: 0; } .ap-term:first-child { border-inline-start: 0; } .ap-term.sum { background: #fffdf6; }
    .ap-term h4 { display: flex; align-items: center; gap: .5rem; margin: 0; padding: .45rem .8rem; font-size: .86rem; font-weight: 800; color: #0b4a66; background: #f7f9fb; border-bottom: 1px solid #eef0f2; }
    .ap-term h4 small { font-weight: 600; color: #6c757d; font-size: .72rem; }
    .ap-term h4 em { margin-inline-start: auto; font-style: normal; background: #0b4a66; color: #fff; border-radius: 99px; padding: .05rem .55rem; font-size: .76rem; } .ap-term h4 em i { color: #86efac; }
    .ap-list { display: flex; flex-direction: column; }
    #ad-body .ap-term .ad-c.ap-r { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: .6rem; margin: 0; padding: .42rem .8rem; border: 0; border-bottom: 1px solid #f1f3f5; border-radius: 0; background: #fff; font-size: .82rem; transition: background .12s; }
    #ad-body .ap-term .ad-c.ap-r:last-child { border-bottom: 0; } #ad-body .ap-term .ad-c.ap-r:hover { background: #f6f9fb; }
    .ap-h { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: #eef3f7; color: #0b4a66; font-weight: 800; font-size: .85rem; }
    .ap-m { min-width: 0; } .ap-n { display: flex; align-items: baseline; gap: .45rem; min-width: 0; }
    .ap-n code { color: #6c7a83; font-size: .72rem; font-weight: 700; flex: none; } .ap-n b { color: #0f1d24; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ap-mk { color: #901d23; font-weight: 800; }
    .ap-p { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem; margin-top: .12rem; font-size: .7rem; color: #8a949b; }
    .ap-p span { background: #fff4d6; color: #7a4b00; border-radius: 5px; padding: 0 .3rem; font-family: monospace; font-weight: 700; } .ap-p small { color: #6c757d; }
    .ap-st { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; font-size: .72rem; font-weight: 700; border-radius: 99px; padding: .1rem .55rem; text-decoration: none; border: 1px solid transparent; }
    .ap-st i { width: 7px; height: 7px; border-radius: 50%; }
    .ap-st.ok { background: #ecfdf3; color: #166534; border-color: #bbf7d0; } .ap-st.no { background: #fff4ed; color: #9a3412; border-color: #fed7aa; }
    .ap-st.na { background: #f6f7f9; color: #7b8794; } .ap-st.el { background: #f5f3ff; color: #5b21b6; }
    #ad-body .ap-term .ad-c.ap-r.slot .ap-n b { color: #5b21b6; font-weight: 600; }
    #ad-body .ap-term .ad-c.ap-r.done { background: #f3fbf5; } #ad-body .ap-term .ad-c.ap-r.done .ap-n b { text-decoration: line-through; color: #15803d; } #ad-body .ap-term .ad-c.ap-r.done .ap-h { background: #15803d; color: #fff; }
    #ad-body .ap-term .ad-c.ap-r.next { background: #fffbeb; box-shadow: inset -3px 0 0 #e8b923; }
    @media (max-width: 600px) { .ap-terms { grid-template-columns: 1fr; } .ap-term { border-inline-start: 0; border-top: 1px solid #eef0f2; } }
    @media print { .ap-year { break-inside: avoid-page; } .ap-legend { display: none; } }
    .pb-bar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: .45rem; } .pb-lbl { align-self: center; font-size: .74rem; color: #6c757d; margin-inline-end: .35rem; }
    .pb-bar .btn { padding: .15rem .55rem; font-size: .78rem; }
    .pb-sum { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; margin-bottom: .45rem; }
    .pb-stack { display: flex; width: 220px; height: 10px; border-radius: 99px; overflow: hidden; background: #e9ecef; } .pb-stack i { display: block; height: 100%; }
    .pb-leg { display: flex; flex-wrap: wrap; gap: .3rem .9rem; font-size: .74rem; color: #495057; } .pb-leg i { margin-inline-end: .25rem; } .pb-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: middle; }
    .pb-board { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; align-items: start; }
    .pb-col { background: #fff; border: 1px solid #e6e2d6; border-radius: 12px; overflow: hidden; min-width: 0; } .pb-col.y1 { background: #fbfcfe; } .pb-col.sum { background: #fffaf0; }
    .pb-col > header { padding: .35rem .45rem .3rem; background: linear-gradient(160deg, #0b4a66, #091b22); color: #fff; line-height: 1.15; }
    .pb-col.y1 > header { background: linear-gradient(160deg, #134e63, #0b2a36); } .pb-col.sum > header { background: linear-gradient(160deg, #b8892b, #7a5a17); }
    .pb-col > header b { display: block; font-size: .8rem; } .pb-col > header > span { font-size: .7rem; opacity: .85; }
    .pb-hd { display: flex; align-items: center; justify-content: space-between; gap: .3rem; margin-top: .2rem; } .pb-hd em { font-style: normal; background: rgba(255,255,255,.18); border-radius: 99px; padding: 0 .4rem; font-size: .7rem; font-weight: 800; } .pb-hd small { font-size: .62rem; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pb-list { display: flex; flex-direction: column; gap: 4px; padding: 5px; }
    #ad-body .ad-c.pb-c { margin: 0; padding: .28rem .38rem .26rem; border: 1px solid #e8ecef; border-inline-start: 4px solid var(--c); border-radius: 8px; background: #fff; font-size: .72rem; cursor: pointer; transition: transform .12s, box-shadow .12s; }
    #ad-body .ad-c.pb-c:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(9,27,34,.12); }
    #ad-body .ad-c.pb-c.dim { opacity: .25; }
    .pb-t { display: flex; align-items: center; gap: .25rem; } .pb-t i { color: var(--c); font-size: .72rem; } .pb-t code { color: #475569; font-size: .66rem; font-weight: 700; }
    .pb-h { margin-inline-start: auto; background: color-mix(in srgb, var(--c) 14%, #fff); color: #0f1d24; border-radius: 5px; padding: 0 .3rem; font-weight: 800; font-size: .68rem; }
    .pb-n { font-weight: 700; color: #0f1d24; line-height: 1.25; margin: .1rem 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.5em; }
    .pb-f { display: flex; align-items: center; gap: .35rem; font-size: .62rem; color: #6c757d; white-space: nowrap; overflow: hidden; } .pb-f i { margin-inline-end: .1rem; }
    .pb-s { font-weight: 800; border-radius: 99px; padding: 0 .3rem; } .pb-s.s-open { background: #dcfce7; color: #166534; } .pb-s.s-closed { background: #ffedd5; color: #9a3412; } .pb-s.s-none { background: #f1f5f9; color: #64748b; } .pb-s.s-slot { background: #fef3c7; color: #92400e; }
    .pb-cr { color: #d97706; } .pb-mk { color: #901d23; font-weight: 800; }
    @media (max-width: 1100px) { .pb-board { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); } }
    @media print { .pb-board { grid-template-columns: repeat(var(--n), minmax(0, 1fr)); } }

    .am-tt { margin-top: .8rem; border: 1px solid #e3e9ee; border-radius: 14px; padding: .6rem .7rem; background: linear-gradient(180deg, #f8fbfd, #fff); }
    .am-tt-h { display: flex; align-items: baseline; justify-content: space-between; gap: .4rem; } .am-tt-h h4 { margin: 0 !important; } .am-tt-h small { color: #6c757d; font-size: .7rem; }
    .am-wk { margin: .55rem 0 .5rem; font-size: .66rem; }
    .am-wk-hd { display: grid; grid-template-columns: 34px repeat(auto-fit, minmax(0, 1fr)); } .am-wk-hd { display: flex; } .am-wk-hd span { width: 34px; flex: none; } .am-wk-hd b { flex: 1; text-align: center; color: #0b4a66; font-weight: 800; }
    .am-wk-bd { display: flex; height: calc(var(--rows) * 26px); min-height: 78px; }
    .am-wk-t { width: 34px; flex: none; display: flex; flex-direction: column; } .am-wk-t span { flex: 1; color: #8a949b; border-top: 1px dashed #e5e9ee; padding-top: 1px; direction: ltr; text-align: right; padding-inline-end: 4px; }
    .am-wk-g { flex: 1; display: grid; gap: 3px; background: repeating-linear-gradient(180deg, #edf1f4 0 1px, transparent 1px 26px); border-radius: 6px; }
    .am-wk-d { position: relative; background: rgba(241,245,249,.55); border-radius: 6px; }
    .am-wk-b { position: absolute; display: grid; place-items: center; box-sizing: border-box; border: 1.5px solid #fff; border-radius: 6px; color: #fff; font-weight: 800; font-size: .7rem; overflow: hidden; cursor: default; }
    .am-wk-b.ok { background: #15803d; } .am-wk-b.full { background: #d97706; } .am-wk-b.no { background: #b91c1c; opacity: .75; }
    .am-sl { display: flex; flex-direction: column; gap: .35rem; margin-top: .5rem; }
    .am-sr { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: .5rem; align-items: center; border: 1px solid #e9edf1; border-inline-start: 4px solid #15803d; border-radius: 10px; padding: .35rem .5rem; background: #fff; }
    .am-sr.full { border-inline-start-color: #d97706; } .am-sr.no { border-inline-start-color: #b91c1c; background: #fffafa; }
    .am-sr-n { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: #0b4a66; color: #fff; font-weight: 800; font-size: .82rem; }
    .am-sr-m { min-width: 0; } .am-sr-t { display: flex; flex-wrap: wrap; gap: .1rem .6rem; font-size: .78rem; } .am-sr-t b { color: #0f1d24; } .am-sr-t bdi { color: #0b4a66; font-weight: 700; }
    .am-sr-t em { font-style: normal; background: #ede9fe; color: #5b21b6; border-radius: 5px; padding: 0 .3rem; font-size: .68rem; }
    .am-sr-i { font-size: .7rem; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .am-sr-i a { color: #334155; }
    .am-sr-s { display: flex; flex-direction: column; align-items: flex-end; gap: .15rem; font-size: .68rem; color: #6c757d; }
    .am-sr-seat { width: 54px; height: 5px; background: #e9ecef; border-radius: 99px; overflow: hidden; } .am-sr-seat i { display: block; height: 100%; background: #15803d; }
    .am-sr.full .am-sr-seat i { background: #d97706; } .am-sr.no .am-sr-seat i { background: #b91c1c; }
    .am-empty { display: flex; gap: .6rem; align-items: center; margin-top: .5rem; background: #f6f7f9; border-radius: 10px; padding: .6rem .7rem; color: #5b6970; font-size: .78rem; } .am-empty i { font-size: 1.4rem; color: #94a3b8; } .am-empty b { display: block; color: #334155; }
    .am-kpis { grid-template-columns: repeat(6, 1fr) !important; gap: .25rem !important; } .am-kpis div { padding: .3rem .1rem !important; border-radius: 9px !important; } .am-kpis b { font-size: .98rem !important; } .am-kpis span { font-size: .58rem !important; line-height: 1.15; display: block; }
`; document.head.appendChild(c); }
  // full screen: the map fills the whole screen (styles kept here so they arrive with the script)
  if (!document.getElementById('am-fs-css')) { const c = document.createElement('style'); c.id = 'am-fs-css'; c.textContent = `
    .am-wrap:fullscreen { display: flex; flex-direction: column; height: 100vh; width: 100vw; padding: .5rem; background: #f6f4ee; overflow: hidden; }
    .am-wrap:fullscreen > .am-tools { flex: none; margin-bottom: .4rem !important; }
    .am-wrap:fullscreen > .alert { display: none; }
    .am-wrap:fullscreen > .am-row { flex: 1 1 auto; min-height: 0; height: 100%; }
    .am-wrap:fullscreen > .am-row.docked { display: grid; }
    .am-wrap:fullscreen .am-stage { height: 100%; }
    .am-wrap:fullscreen .am-scroll { height: 100%; max-height: none !important; min-height: 0; }
    .am-wrap:fullscreen .am-row.docked > .am-side { max-height: 100%; height: 100%; position: static; }`; document.head.appendChild(c); }
  const DAY = { ح: 'الأحد', ن: 'الاثنين', ث: 'الثلاثاء', ر: 'الأربعاء', خ: 'الخميس', س: 'السبت', ج: 'الجمعة' };
  const DAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
  const isOpen = x => x.status !== 'مغلقة' && x.registered < x.capacity;
  function secCard(x) {
    const full = x.registered >= x.capacity, closed = x.status === 'مغلقة', pc = Math.min(100, x.capacity ? 100 * x.registered / x.capacity : 100);
    const st_ = closed ? ['مغلقة', 'no'] : full ? ['ممتلئة', 'full'] : ['مفتوحة', 'ok'];
    const g = new Map(); (x.meetings || []).forEach(m => { const k = `${m.start}|${m.end}|${m.mode || ''}`; (g.get(k) || g.set(k, []).get(k)).push(m.day); });
    return `<article class="am-sec ${st_[1]}">
      <header><span class="am-sec-n">${esc(x.section)}</span><span class="am-sec-a">${esc(x.activity)}</span><span class="am-pill ${st_[1]}">${st_[0]}</span></header>
      <div class="am-sec-when">${[...g].map(([k, d]) => { const [a, b, m] = k.split('|'); return `<div><span class="am-days">${DAYS.map(D => `<i class="${d.includes(D) ? 'on' : ''}" title="${DAY[D]}">${D}</i>`).join('')}</span><bdi dir="ltr">${a}–${b}</bdi>${m && m !== 'وجاهي' ? `<small class="am-mode">${esc(m)}</small>` : ''}</div>`; }).join('') || `<small>${esc(x.time || 'بلا موعد')}</small>`}</div>
      <div class="am-sec-who"><i class="bi bi-person-badge"></i> <a href="instructor.html?q=${encodeURIComponent(x.instructor || '')}">${esc(x.instructor || '—')}</a></div>
      <div class="am-sec-who"><i class="bi bi-door-open"></i> ${x.room === '0' ? 'قاعة افتراضية' : `<a href="room.html?q=${encodeURIComponent(x.room)}">${esc(x.room)}</a> <small class="text-muted">${esc(x.building || '')}</small>`}</div>
      <div class="am-sec-seat"><span class="am-seat w"><i style="width:${pc}%" class="${full ? 'full' : pc >= 80 ? 'hot' : ''}"></i></span><bdi dir="ltr">${x.registered}/${x.capacity}</bdi>${!closed && !full ? `<b>${x.capacity - x.registered} متاح</b>` : ''}</div></article>`;
  }
  // the sections of a course on a small week grid, and as compact rows
  const mins = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const secState = x => x.status === 'مغلقة' ? 'no' : x.registered >= x.capacity ? 'full' : 'ok';
  function weekMini(S) {
    const M = S.flatMap(x => (x.meetings || []).filter(m => mins(m.start) != null && mins(m.end) != null).map(m => ({ x, d: m.day, a: mins(m.start), b: mins(m.end), mode: m.mode })));
    if (!M.length) return '';
    const days = ['ح', 'ن', 'ث', 'ر', 'خ', 'س'].filter(d => ['ح', 'ن', 'ث', 'ر', 'خ'].includes(d) || M.some(m => m.d === d));
    const lo = Math.floor(Math.min(...M.map(m => m.a)) / 60) * 60, hi = Math.ceil(Math.max(...M.map(m => m.b)) / 60) * 60, span = Math.max(60, hi - lo);
    const hours = []; for (let t = lo; t <= hi; t += 60) hours.push(t);
    const col = d => days.map(D => M.filter(m => m.d === D)).map((list, i) => {
      list.sort((p, q) => p.a - q.a); const lanes = [];
      list.forEach(m => { let l = lanes.findIndex(end => end <= m.a); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = m.b; m.lane = l; });
      return `<div class="am-wk-d">${list.map(m => `<span class="am-wk-b ${secState(m.x)}" style="top:${100 * (m.a - lo) / span}%;height:${100 * (m.b - m.a) / span}%;right:${100 * m.lane / lanes.length}%;width:${100 / lanes.length}%" title="شعبة ${esc(m.x.section)} · ${esc(m.x.activity)} · ${DAY[m.d] || m.d} ${String(Math.floor(m.a / 60)).padStart(2, '0')}:${String(m.a % 60).padStart(2, '0')}–${String(Math.floor(m.b / 60)).padStart(2, '0')}:${String(m.b % 60).padStart(2, '0')} · ${esc(m.x.instructor || '')}${m.mode && m.mode !== 'وجاهي' ? ' · ' + esc(m.mode) : ''}">${esc(m.x.section)}</span>`).join('')}</div>`; }).join('');
    return `<div class="am-wk" style="--rows:${hours.length - 1}">
      <div class="am-wk-hd"><span></span>${days.map(d => `<b>${DAY[d] || d}</b>`).join('')}</div>
      <div class="am-wk-bd"><div class="am-wk-t">${hours.slice(0, -1).map(t => `<span>${Math.floor(t / 60)}:00</span>`).join('')}</div>
        <div class="am-wk-g" style="grid-template-columns:repeat(${days.length},1fr)">${col()}</div></div></div>`;
  }
  function secRow(x) {
    const sc = secState(x), pc = Math.min(100, x.capacity ? 100 * x.registered / x.capacity : 100);
    const g = new Map(); (x.meetings || []).forEach(m => { const k = `${m.start}–${m.end}`; (g.get(k) || g.set(k, []).get(k)).push(m.day); });
    const modes = [...new Set((x.meetings || []).map(m => m.mode).filter(m => m && m !== 'وجاهي'))];
    return `<div class="am-sr ${sc}">
      <span class="am-sr-n" title="الشعبة">${esc(x.section)}</span>
      <div class="am-sr-m">
        <div class="am-sr-t">${[...g].map(([t, d]) => `<span><b>${d.map(D => DAY[D] || D).join(' · ')}</b> <bdi dir="ltr">${t}</bdi></span>`).join('') || `<span>${esc(x.time || 'بلا موعد')}</span>`}${modes.map(m => `<em>${esc(m)}</em>`).join('')}</div>
        <div class="am-sr-i"><small>${esc(x.activity)}</small> · <a href="instructor.html?q=${encodeURIComponent(x.instructor || '')}">${esc(x.instructor || '—')}</a> · ${x.room === '0' ? 'افتراضية' : `<a href="room.html?q=${encodeURIComponent(x.room)}">${esc(x.room)}</a>`}</div></div>
      <div class="am-sr-s"><span class="am-pill ${sc}">${sc === 'no' ? 'مغلقة' : sc === 'full' ? 'ممتلئة' : 'مفتوحة'}</span>
        <span class="am-sr-seat" title="المسجلون/السعة"><i style="width:${pc}%"></i></span><bdi dir="ltr">${x.registered}/${x.capacity}</bdi></div></div>`;
  }
  function mapPanel(p, x, G, k) {
    const n = G.nodes.find(n => n.key === k); if (!n) return '';
    const done = getDone(p), av = avail(n.code), anc = G.anc(k), des = G.desc.get(k), dir = G.post.get(k) || [];
    const nm = c => esc((G.by.get(c) || {}).name || CODE_NAME[c] || '');
    const chip = c => { const a = avail(c).k; return `<a href="#" class="am-chip ${done.has(c) ? 'ok' : ''}" data-go="${c}" title="${esc(avail(c).t)}"><span class="am-dot2" style="background:${AV[a][1]}"></span><code>${c}</code> ${nm(c)}${done.has(c) ? ' <i class="bi bi-check2"></i>' : ''}</a>`; };
    const ext = G.ext.get(k) || [], note = String(n.prereq || '').replace(/\b\d{6,7}\b/g, '').replace(/^[\s+،,/]+|[\s+،,/]+$/g, '');
    const missing = (G.pre.get(k) || []).filter(c => !done.has(c));
    const deg = (SP && SP.degree) || 'البكالوريوس', crit = realCode(n.code) && G.level(k) + G.chain(k) - 1 === G.longest;
    const S = av.s || [], open = S.filter(isOpen), cap = S.reduce((a, s) => a + s.capacity, 0), reg = S.reduce((a, s) => a + s.registered, 0);
    const free = open.reduce((a, s) => a + s.capacity - s.registered, 0);
    const pm = portalMatch(x), grp = pm && pm.pl.groups.find(g => g.courses.some(c => c.code === n.code));
    const others = SP && realCode(n.code) ? [...new Set(SP.plans.filter(pl => pl.groups.some(g => g.courses.some(c => c.code === n.code))).map(pl => pl.major))] : [];
    const tab = st.pt || 'info';
    const tabs = [['info', 'نظرة عامة', 'bi-info-circle'], ['secs', `الشعب (${S.length})`, 'bi-calendar-week'], ['chain', 'السلسلة', 'bi-diagram-3']];
    const levels = (set, f) => { const m = new Map(); [...set].forEach(c => { const l = f(c); (m.get(l) || m.set(l, []).get(l)).push(c); }); return [...m].sort((a, b) => a[0] - b[0]); };
    let body = '';
    if (tab === 'info') body = `
      <div class="am-kpis">${[[n.hours ?? '—', 'ساعة معتمدة'], [anc.size, 'قبلها في السلسلة'], [des.size, 'تفتحها بعدها'], [G.chain(k) - 1, 'مواد متتالية بعدها'],
          [S.length ? `${open.length}/${S.length}` : '—', 'شعب مفتوحة'], [S.length ? free : '—', 'مقعداً متاحاً']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      ${crit ? '<div class="am-note warn"><i class="bi bi-lightning-charge-fill"></i><div><b>على أطول سلسلة متطلبات في الخطة</b>تأجيلها يؤجل ما بعدها وقد يؤخر التخرج؛ الأَولى تسجيلها في موعدها.</div></div>' : ''}
      ${realCode(n.code) && done.size ? (done.has(n.code) ? '<div class="am-note ok"><i class="bi bi-check-circle-fill"></i><div><b>مجتازة</b>معلّمة من اختيارات المرشد على هذا الجهاز.</div></div>'
        : missing.length ? `<div class="am-note wait"><i class="bi bi-hourglass-split"></i><div><b>تنتظر متطلباً</b>${missing.map(c => `<code>${c}</code> ${nm(c)}`).join('، ')}</div></div>`
        : `<div class="am-note go"><i class="bi bi-check2-circle"></i><div><b>يمكن تسجيلها</b>متطلباتها المذكورة في الخطة مجتازة${S.length ? (open.length ? ` و${open.length} شعبة مفتوحة الآن` : '، لكن كل شعبها مغلقة الآن') : '، وهي غير مطروحة هذا الفصل'}.</div></div>`) : ''}
      <div class="am-tt"><div class="am-tt-h"><h4><i class="bi bi-calendar-week"></i> الجدول المطروح لهذه المادة</h4><small>${esc(TTERM || '')}</small></div>
        ${S.length ? `${weekMini(S)}
          <div class="am-cap"><div class="am-cap-bar"><i style="width:${Math.min(100, cap ? 100 * reg / cap : 100)}%"></i></div><span><b>${reg}</b>/${cap} مسجّلاً في ${S.length} شعبة · <b class="text-success">${free}</b> مقعداً متاحاً</span></div>
          <div class="am-sl">${S.slice().sort((a, b) => (+a.section || 0) - (+b.section || 0) || String(a.activity).localeCompare(b.activity)).map(secRow).join('')}</div>`
        : `<div class="am-empty"><i class="bi bi-calendar-x"></i><div><b>${realCode(n.code) ? 'غير مطروحة هذا الفصل' : 'خانة اختيار'}</b>${realCode(n.code) ? 'لا شعب لهذه المادة في الجدول الدراسي المنشور.' : 'يختار لها الطالب مادة من مجموعة الخطة.'}</div></div>`}</div>
      <h4><i class="bi bi-arrow-return-left"></i> متطلباتها السابقة</h4>
      <div class="am-chips">${(G.pre.get(k) || []).map(chip).join('') || '<small class="text-muted">لا متطلب من مواد الخطة</small>'}</div>
      ${ext.length || note ? `<p class="am-asis"><i class="bi bi-quote"></i> كما في الخطة: <b dir="ltr">${esc(n.prereq)}</b>${/P\.?T/i.test(n.prereq) ? ' <small>(P.T = امتحان مستوى)</small>' : ''}${ext.length ? ` · ${ext.map(c => `<code>${c}</code>${CODE_NAME[c] ? ' ' + esc(CODE_NAME[c]) : ''}`).join('، ')}` : ''}</p>` : ''}
      <h4><i class="bi bi-unlock"></i> تفتح مباشرة</h4>
      <div class="am-chips">${dir.map(chip).join('') || '<small class="text-muted">لا مادة في الخطة تشترطها</small>'}</div>
      ${des.size > dir.length ? `<p class="small text-muted mb-0 mt-1">ومعها ${des.size - dir.length} مادة أبعد في السلسلة: انظر «السلسلة».</p>` : ''}
      ${grp || others.length ? `<h4><i class="bi bi-journal-text"></i> في الخطط الدراسية على البوابة</h4>
        ${grp ? `<p class="small mb-1">في خطة «${esc(pm.pl.major)}»: <span class="badge ${grp.kind === 'required' ? 'text-bg-primary' : 'text-bg-info'}">${esc(grp.name)}</span></p>` : ''}
        ${others.length ? `<details class="small"><summary>تظهر في ${others.length} ${others.length === 1 ? 'خطة' : 'خطط'}</summary><div class="am-tags mt-1">${others.map(o => `<span>${esc(o)}</span>`).join('')}</div></details>` : ''}` : ''}`;
    else if (tab === 'secs') { const L = S.filter(s => !st.po || isOpen(s)).sort((a, b) => (+a.section || 0) - (+b.section || 0));
      body = S.length ? `<div class="d-flex justify-content-between align-items-center mb-2"><small class="text-muted">${open.length} مفتوحة من ${S.length} · ${free} مقعداً متاحاً</small>
          <label class="form-check form-switch m-0 small"><input class="form-check-input" type="checkbox" id="am-po" ${st.po ? 'checked' : ''}> المفتوحة فقط</label></div>
        <div class="am-secs">${L.map(secCard).join('') || '<p class="small text-muted">لا شعب مفتوحة.</p>'}</div>`
        : '<p class="small text-muted">لا شعب لهذه المادة في الجدول الدراسي المنشور لهذا الفصل.</p>'; }
    else body = `<p class="small text-muted">من أول متطلب إلى آخر مادة تعتمد عليها، مرتبة على مراحل. اضغط أي مادة لتنتقل إليها.</p>
      <div class="am-path">${levels(anc, c => G.level(c)).map(([l, cs]) => `<div class="am-step anc"><span>مرحلة ${l}</span><div class="am-chips">${cs.map(chip).join('')}</div></div>`).join('')}
        <div class="am-step me"><span>هذه المادة</span><div><code>${esc(n.code)}</code> ${nm(n.code) || esc(n.name || '')}</div></div>
        ${levels(des, c => G.level(c)).map(([l, cs]) => `<div class="am-step desc"><span>مرحلة ${l}</span><div class="am-chips">${cs.map(chip).join('')}</div></div>`).join('')}</div>
      ${!anc.size && !des.size ? '<p class="small text-muted">لا ترتبط بمواد أخرى في الخطة.</p>' : ''}`;
    return `<div class="am-p">
      <div class="am-hero av-${av.k}">
        <div class="am-hero-top"><code>${esc(n.code)}</code><span>${n.hours ?? '—'} س.م</span>${n.mark ? `<span title="علامة في الخطة">${esc(n.mark)}</span>` : ''}
          <span class="am-hero-btns">${HIST.length ? `<button type="button" class="am-ic" id="am-back" title="رجوع إلى ${esc(HIST[HIST.length - 1])}"><i class="bi bi-arrow-right"></i></button>` : ''}${pinBtn(true)}<button type="button" class="am-ic" id="am-x" title="إغلاق (Esc)"><i class="bi bi-x-lg"></i></button></span></div>
        <h3>${esc(n.name || CODE_NAME[n.code] || '')}</h3>
        <div class="am-hero-sub"><span><i class="bi bi-calendar3"></i> ${YEAR[n.year] || ''} · ${TERM[n.term]}</span><span><span class="am-dot2" style="background:#fff"></span> ${esc(av.t)}</span></div>
      </div>
      ${realCode(n.code) ? `<div class="am-acts no-print">
        <a href="timetable.html?q=${n.code}" title="في الجدول الدراسي"><i class="bi bi-table"></i><span>الجدول</span></a>
        ${S.length ? `<a href="planner.html?c=${encodeURIComponent(n.code + '|' + deg)}" title="أضفها إلى مخطط جدولي"><i class="bi bi-calendar2-plus"></i><span>مخطط جدولي</span></a>` : ''}
        <button type="button" id="am-done" data-c="${n.code}" class="${done.has(n.code) ? 'on' : ''}"><i class="bi ${done.has(n.code) ? 'bi-check-circle-fill' : 'bi-check2-circle'}"></i><span>${done.has(n.code) ? 'مجتازة ✓' : 'علّمها مجتازة'}</span></button>
        <button type="button" id="am-copy" title="نسخ رابط المادة في الخريطة"><i class="bi bi-link-45deg"></i><span>نسخ الرابط</span></button></div>` : ''}
      <div class="am-tabs" role="tablist">${tabs.map(([t, l, i]) => `<button type="button" data-pt="${t}" class="${tab === t ? 'on' : ''}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
      <div class="am-tab">${body}</div></div>`;
  }
  function drawMap(p, x) {
    const cv = $('#am-canvas'), svg = $('#am-svg'); if (!cv || !svg) return;
    cv.style.transform = `scale(${ZOOM})`;
    const G = graph(x), R = cv.getBoundingClientRect(), box = {}, z = ZOOM;   // the canvas is scaled: measure in its own units
    cv.querySelectorAll('.am-n').forEach(e => { const r = e.getBoundingClientRect(); box[e.dataset.k] = { l: (r.left - R.left) / z, r: (r.right - R.left) / z, t: (r.top - R.top) / z, h: r.height / z, y: (r.top - R.top + r.height / 2) / z }; });
    svg.setAttribute('width', cv.scrollWidth); svg.setAttribute('height', cv.scrollHeight);
    // every edge gets its own port on each card, ordered by where the other end sits, so arrows never pile up on one point
    const edges = [], ins = new Map(), outs = new Map();
    G.nodes.forEach(n => (G.pre.get(n.key) || []).forEach(pk => { if (!box[pk] || !box[n.key]) return;
      const e = { a: pk, b: n.key }; edges.push(e); (outs.get(pk) || outs.set(pk, []).get(pk)).push(e); (ins.get(n.key) || ins.set(n.key, []).get(n.key)).push(e); }));
    const port = (list, e, k, other) => { const bx = box[k]; list.sort((u, v) => box[u[other]].y - box[v[other]].y);
      const i = list.indexOf(e), n = list.length; return n === 1 ? bx.y : bx.t + bx.h * (0.28 + 0.44 * i / (n - 1)); };
    // the columns, right to left, with the free gaps between their cards: a link that skips columns runs through those gaps
    const COLS = [...cv.querySelectorAll('.am-col')].map(c => { const r = c.getBoundingClientRect(), cards = [...c.querySelectorAll('.am-n')].map(e => box[e.dataset.k]).filter(Boolean);
      const hd = c.querySelector('header'), hb = hd ? (hd.getBoundingClientRect().bottom - R.top) / z : (r.top - R.top) / z;
      const gaps = [];
      cards.forEach((q, i) => gaps.push(i ? (cards[i - 1].t + cards[i - 1].h + q.t) / 2 : (hb + q.t) / 2));
      if (cards.length) { const last = cards[cards.length - 1]; gaps.push(last.t + last.h + 10); } else gaps.push(hb + 20);
      return { l: (r.left - R.left) / z, r: (r.right - R.left) / z, gaps, use: new Map() }; }).sort((u, v) => v.l - u.l);
    const colAt = bx => COLS.findIndex(c => bx.l >= c.l - 2 && bx.r <= c.r + 2);
    const paths = edges.map(e => { const a = box[e.a], b = box[e.b];
      const ay = port(outs.get(e.a), e, e.a, 'b'), by = port(ins.get(e.b), e, e.b, 'a');
      let d;
      const ia = colAt(a), ib = colAt(b);
      if (ia >= 0 && ib > ia + 1) {   // skips columns: through the nearest gap of each column on the way, never across a card
        let x = a.l, y = ay; d = `M${a.l},${ay}`;
        for (let c = ia + 1; c < ib; c++) { const C = COLS[c], steps = ib - c;
          const want = y + (by - y) / steps;   // drift towards the target
          let g = C.gaps.reduce((best, gy) => Math.abs(gy - want) + 0.35 * Math.abs(gy - y) < Math.abs(best - want) + 0.35 * Math.abs(best - y) ? gy : best, C.gaps[0]);
          const n = C.use.get(g) || 0; C.use.set(g, n + 1); const gy = g + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 3;   // several links in one gap sit side by side
          const k = Math.max(14, (x - C.r) / 2);
          d += ` C${x - k},${y} ${C.r + k},${gy} ${C.r},${gy} L${C.l},${gy}`; x = C.l; y = gy; }
        const k = Math.max(14, (x - b.r) / 2); d += ` C${x - k},${y} ${b.r + k},${by} ${b.r + 2},${by}`;
      }
      else if (b.r < a.l - 4) { const c = Math.max(26, (a.l - b.r) * 0.5); d = `M${a.l},${ay} C${a.l - c},${ay} ${b.r + c},${by} ${b.r + 2},${by}`; }   // RTL: the later course sits to the left
      else if (a.r < b.l - 4) { const c = Math.max(26, (b.l - a.r) * 0.5); d = `M${a.r},${ay} C${a.r + c},${ay} ${b.l - c},${by} ${b.l - 2},${by}`; }
      else { const o = Math.min(a.l, b.l) - 26; d = `M${a.l},${ay} C${o},${ay} ${o},${by} ${b.l - 2},${by}`; }                                        // same column: a loop on the left
      return `<path d="${d}" data-a="${esc(e.a)}" data-b="${esc(e.b)}" marker-end="url(#am-ar)"/>`; }).join('');
    const mk = (id, c, w) => `<marker id="${id}" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="${w}" markerHeight="${w}" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.6 L10,5 L0,9.4 L2.6,5 z" fill="${c}" stroke="#fff" stroke-width=".6" stroke-linejoin="round"/></marker>`;
    svg.innerHTML = `<defs>${mk('am-ar', '#6f8796', 13)}${mk('am-ar-anc', '#d97706', 16)}${mk('am-ar-desc', '#901d23', 16)}</defs>${paths}`;
    const MK = { anc: 'url(#am-ar-anc)', desc: 'url(#am-ar-desc)', dim: '', off: '', '': 'url(#am-ar)' };
    const light = k => {   // highlight a course's chain (hover preview or selection)
      cv.classList.toggle('focus', !!k);
      const anc = k ? G.anc(k) : new Set(), des = k ? G.desc.get(k) || new Set() : new Set();
      cv.querySelectorAll('.am-n').forEach(e => { const j = e.dataset.k; e.classList.toggle('sel', j === k); e.classList.toggle('anc', anc.has(j)); e.classList.toggle('desc', des.has(j)); });
      const top = [];
      svg.querySelectorAll('path[data-a]').forEach(e => { const A = e.dataset.a, B = e.dataset.b;
        const c = !k ? (st.ma ? '' : 'off') : (B === k || (anc.has(A) && anc.has(B))) ? 'anc' : (A === k || (des.has(A) && des.has(B))) ? 'desc' : 'dim';
        e.setAttribute('class', c); MK[c] ? e.setAttribute('marker-end', MK[c]) : e.removeAttribute('marker-end'); if (c === 'anc' || c === 'desc') top.push(e); });
      top.forEach(e => svg.appendChild(e));   // highlighted arrows drawn above the rest
    };
    const row = $('.am-row'), sc = $('#am-scroll');
    const focus = k => {
      light(k);
      const side = $('#am-side');
      if (k) { HELP = false; side.dataset.help ||= side.innerHTML; side.innerHTML = mapPanel(p, x, G, k); } else if (side.dataset.help) side.innerHTML = side.dataset.help;
      row.classList.toggle('open', !!k || HELP);
      bindSide();
      const url = new URL(location.href); k ? url.searchParams.set('c', k) : url.searchParams.delete('c'); history.replaceState(null, '', url);
    };
    // keep the chosen card in sight, clear of the floating panel
    const reveal = c => { const e = cv.querySelector(`.am-n[data-k="${CSS.escape(c)}"]`); if (!e) return;
      const S = sc.getBoundingClientRect(), r = e.getBoundingClientRect(), side = $('#am-side').getBoundingClientRect();
      const left = row.classList.contains('floating') && row.classList.contains('open') ? Math.max(S.left, side.right) + 16 : S.left + 16;
      let dx = 0, dy = 0;
      if (r.left < left) dx = r.left - left; else if (r.right > S.right - 16) dx = r.right - S.right + 16;
      if (r.top < S.top + 50) dy = r.top - S.top - 50; else if (r.bottom > S.bottom - 16) dy = r.bottom - S.bottom + 16;
      if (dx || dy) sc.scrollBy({ left: dx, top: dy, behavior: 'smooth' }); };
    const pick = (c, back) => { if (!back && st.sel && st.sel !== c) { HIST.push(st.sel); if (HIST.length > 20) HIST.shift(); } if (!c) HIST = []; st.sel = c; focus(c); if (c) requestAnimationFrame(() => reveal(c)); };
    const go = c => pick(c);
    function bindSide() {
      const side = $('#am-side');
      side.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
      const xb = $('#am-x'); if (xb) xb.onclick = () => pick('');
      const bk = $('#am-back'); if (bk) bk.onclick = () => pick(HIST.pop(), true);
      side.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { HELP = false; row.classList.remove('open'); });
      side.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => { PIN = !PIN; store('uop-am-pin', PIN ? '1' : '0'); row.classList.toggle('docked', PIN); row.classList.toggle('floating', !PIN);
        side.querySelectorAll('[data-pin]').forEach(q => { q.classList.toggle('on', PIN); q.innerHTML = `<i class="bi ${PIN ? 'bi-pin-angle-fill' : 'bi-pin-angle'}"></i>`; });
        if (side.dataset.help) side.dataset.help = side.dataset.help.replace(/(data-pin[^>]*><i class="bi )bi-pin-angle(-fill)?/, `$1${PIN ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`);
        requestAnimationFrame(() => { fitSizer(); if (st.sel) reveal(st.sel); }); });
      side.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { st.pt = b.dataset.pt; side.innerHTML = mapPanel(p, x, G, st.sel); bindSide(); side.scrollTop = 0; });
      const po = $('#am-po'); if (po) po.onchange = e => { st.po = e.target.checked; side.innerHTML = mapPanel(p, x, G, st.sel); bindSide(); };
      const cp = $('#am-copy'); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => { cp.querySelector('span').textContent = 'نُسخ ✓'; }); };
      const db = $('#am-done'); if (db) db.onclick = () => { const d = getDone(p), c = db.dataset.c; d.has(c) ? d.delete(c) : d.add(c); setDone(p, d); const y = scrollY; render(); scrollTo(0, y); };
    }
    cv.querySelectorAll('.am-n').forEach(e => {
      e.onclick = () => { if (dragged) return; pick(e.dataset.k === st.sel ? '' : e.dataset.k); };
      e.onmouseenter = () => { if (!st.sel) light(e.dataset.k); };
      e.onmouseleave = () => { if (!st.sel) light(''); };
    });
    cv.onclick = e => { if (!dragged && (e.target === cv || e.target.classList.contains('am-cols') || e.target.tagName === 'svg')) pick(''); };
    window.__amKey && document.removeEventListener('keydown', window.__amKey);
    window.__amKey = e => { if (st.view !== 'map' || !$('#am-canvas')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (e.key === 'Escape' && !document.fullscreenElement) { if (st.sel) pick(''); else { HELP = false; row.classList.remove('open'); } }
      else if (e.key === '+' || e.key === '=') zoomTo(ZOOM * 1.2); else if (e.key === '-') zoomTo(ZOOM / 1.2); else if (e.key === '0') zoomTo(1); };
    document.addEventListener('keydown', window.__amKey);
    // ---- zoom: the canvas is scaled, the sizer around it takes the scaled size so the scrollbars stay right
    function fitSizer() { const sz = $('#am-sizer'); if (!sz) return; cv.style.transform = `scale(${ZOOM})`;
      sz.style.width = cv.offsetWidth * ZOOM + 'px'; sz.style.height = cv.offsetHeight * ZOOM + 'px'; const l = $('#am-zl'); if (l) l.textContent = Math.round(ZOOM * 100) + '%'; }
    function setMode(m) { ZMODE = m; store('uop-am-zmode', m); sc.classList.toggle('fitw', m === 'fit'); const w = document.querySelector('[data-z="w"]'); if (w) w.classList.toggle('on', m === 'fit'); }
    function autoFit() { if (ZMODE !== 'fit' || !cv.offsetWidth) return; ZOOM = Math.min(1.15, Math.max(0.4, (sc.clientWidth - 14) / cv.offsetWidth)); fitSizer(); sc.scrollLeft = 0; }
    function zoomTo(z2, keep) {
      if (!keep) setMode('manual');
      z2 = Math.min(2, Math.max(0.3, z2)); const z1 = ZOOM; if (Math.abs(z2 - z1) < 0.001) return;
      const cw = sc.clientWidth, ch = sc.clientHeight, fromRight = -sc.scrollLeft + cw / 2, cy = sc.scrollTop + ch / 2;   // keep the middle of the view in place (RTL scrolls with negative scrollLeft)
      ZOOM = z2; store('uop-am-zoom', String(Math.round(z2 * 100) / 100)); fitSizer();
      sc.scrollLeft = -(fromRight * z2 / z1 - cw / 2); sc.scrollTop = cy * z2 / z1 - ch / 2;
    }
    const usableW = () => sc.clientWidth - 12 - (row.classList.contains('floating') && row.classList.contains('open') ? $('#am-side').offsetWidth + 12 : 0);
    document.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const v = b.dataset.z;
      if (v === 'in') zoomTo(ZOOM * 1.2); else if (v === 'out') zoomTo(ZOOM / 1.2); else if (v === '1') zoomTo(1);
      else if (v === 'w') { setMode('fit'); autoFit(); }
      else { zoomTo(Math.min(1.3, usableW() / cv.offsetWidth, (sc.clientHeight - 12) / cv.offsetHeight)); sc.scrollLeft = 0; sc.scrollTop = 0; } });
    sc.onwheel = e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomTo(ZOOM * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); };
    // ---- drag the map to move around it
    let dragged = false;
    sc.onpointerdown = e => { if (e.button !== 0 || e.target.closest('.am-n, button, a')) return;
      const x0 = e.clientX, y0 = e.clientY, l0 = sc.scrollLeft, t0 = sc.scrollTop; dragged = false;
      const mv = ev => { const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!dragged && Math.hypot(dx, dy) < 5) return; dragged = true; sc.classList.add('grabbing'); sc.scrollLeft = l0 - dx; sc.scrollTop = t0 - dy; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); sc.classList.remove('grabbing'); setTimeout(() => { dragged = false; }, 0); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); };
    const hb = $('#am-help-b'); if (hb) hb.onclick = () => { if (st.sel) pick(''); HELP = !row.classList.contains('open'); row.classList.toggle('open', HELP); };
    const ma = $('#am-ma'); if (ma) ma.onclick = () => { st.ma = !st.ma; ma.classList.toggle('on', st.ma); light(st.sel); };
    const fs = $('#am-fs'); if (fs) fs.onclick = () => { const w = $('#am-wrap'); document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen && w.requestFullscreen(); };
    if (!window.__amFS) { window.__amFS = true; document.addEventListener('fullscreenchange', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 60)); }
    setMode(ZMODE); if (ZMODE === 'fit') autoFit(); else fitSizer();
    focus(st.sel && box[st.sel] ? st.sel : '');
    if (st.sel && box[st.sel]) requestAnimationFrame(() => reveal(st.sel));
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
    const views = [['plan', 'الخطة', 'bi-grid-3x3', 'الخطة سنةً بسنة'], ['map', 'الخريطة', 'bi-diagram-3', 'خريطة المتطلبات'], ['now', 'المطروح', 'bi-calendar-check', 'المطروح هذا الفصل'], ['original', 'الأصل', 'bi-file-earmark-image', 'الأصل كما نُشر'],
      ['versions', `الإصدارات (${vs.length})`, 'bi-clock-history', 'الإصدارات والمقارنة بينها'], ['advisor', 'المرشد', 'bi-person-check', 'المرشد الأكاديمي'], ['files', 'الوثائق', 'bi-folder2-open', 'كل الوثائق']];
    const okN = PROGS.filter(q => planVersions(q).some(v => v.current && v.r.ok)).length;
    $('#ad-app').innerHTML = `<div class="card mb-2 no-print ad-ctl"><div class="card-body py-1 px-2">
        <div class="ad-bar">
          <select class="form-select form-select-sm ad-s-fac" id="ad-fac" title="الكلية" aria-label="الكلية"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <select class="form-select form-select-sm ad-s-p" id="ad-p" title="البرنامج (${list.length})" aria-label="البرنامج">${['bachelor', 'master', 'phd'].map(t => { const g = list.filter(q => (q.type || 'bachelor') === t); return g.length ? `<optgroup label="${t === 'master' ? 'الماجستير' : t === 'phd' ? 'الدكتوراه' : 'البكالوريوس'}">${g.map(q => `<option value="${esc(q.id)}" ${q === p ? 'selected' : ''}>${esc(q.ar || q.en)}${planVersions(q).some(v => v.current && v.r.ok) ? ' ✓' : ''}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
          <select class="form-select form-select-sm ad-s-v" id="ad-v" title="الإصدار" aria-label="الإصدار">${vs.map(o => `<option value="${o.v.sha}" ${o === x ? 'selected' : ''}>${esc(vTitle(o))}${o.r.ok ? ' ✓' : ''}</option>`).join('') || '<option>لا خطة منشورة</option>'}</select>
          <div class="btn-group btn-group-sm ad-views" role="group" aria-label="طريقة العرض">${views.map(([k, l, i, t]) => `<button type="button" class="btn ${st.view === k ? 'btn-maroon' : 'btn-outline-secondary'}" data-view="${k}" title="${t}"><i class="bi ${i}"></i><span> ${l}</span></button>`).join('')}</div>
          <input class="form-control form-control-sm ad-s-q" id="ad-q" placeholder="ابحث في الخطة…" value="${esc(st.q)}" aria-label="ابحث في الخطة">
          <button type="button" class="btn btn-sm btn-outline-secondary ad-ib" id="ad-csv" title="تصدير CSV"><i class="bi bi-filetype-csv"></i></button>
          <button type="button" class="btn btn-sm btn-outline-secondary ad-ib" id="ad-print" title="طباعة"><i class="bi bi-printer"></i></button>
        </div></div></div>
      ${p ? `<section class="card mb-2 ad-head"><div class="card-body py-1 px-2">
          <div class="ad-hrow">
            <h2 class="ad-title m-0" title="${esc(p.en || '')}${x ? ` · ${esc(vTitle(x))} · ${esc(x.d.name)}` : ''}">${esc(p.ar || p.en)}</h2>
            <span class="badge rounded-pill text-bg-light border">${esc(p.faculty)}</span><span class="badge rounded-pill text-bg-light border">${p.type === 'master' ? 'ماجستير' : 'بكالوريوس'}</span>
            ${x ? (x.r.ok ? '<span class="badge rounded-pill text-bg-success" title="قُرئت ومجاميع كل فصل تطابق المطبوع في الخطة"><i class="bi bi-check2-all"></i> مطابقة للمطبوع</span>' : '<span class="badge rounded-pill text-bg-secondary"><i class="bi bi-image"></i> صفحات أصلية</span>') : '<span class="badge rounded-pill text-bg-warning">لا خطة منشورة</span>'}
            ${x ? `<small class="text-muted ad-vt-s" title="${esc(x.d.name)}">${esc(vTitle(x))}</small>` : ''}
            ${x && x.r.ok ? [[flat(x.r).size, 'مادة', '#0b4a66'], [x.r.years.reduce((a, y) => a + y.read_hours, 0), 'ساعة', '#901d23'], [x.r.years.length, 'سنوات', '#b8892b'],
              [[...flat(x.r).keys()].filter(k => secs(k).length).length, 'مطروحة', '#15803d'], ...(pm ? [[pm.missing.length, 'ليست في خطة البوابة', '#6d28d9']] : [])]
              .map(([v, l, c]) => `<span class="ad-kp" style="--c:${c}"><b>${v}</b> ${l}</span>`).join('') : ''}
            <span class="ms-auto d-inline-flex gap-1 no-print flex-none">
              ${x ? `<a class="btn btn-sm btn-light border ad-sb" href="${esc(x.v.url)}" target="_blank" rel="noopener" title="الملف الأصلي على موقع الجامعة"><i class="bi bi-file-earmark-pdf"></i><span> الأصل</span></a>` : ''}
              <a class="btn btn-sm btn-light border ad-sb" href="${esc(p.url_ar)}" target="_blank" rel="noopener" title="صفحة القسم"><i class="bi bi-box-arrow-up-left"></i><span> القسم</span></a>
              ${pm ? `<a class="btn btn-sm btn-light border ad-sb" href="plans.html?plan=${encodeURIComponent(pm.pl.id)}" title="الخطة الدراسية على البوابة (${pm.inter} مادة مشتركة)"><i class="bi bi-journal-text"></i><span> البوابة</span></a>` : ''}</span>
          </div></div></section>` : ''}
      <div id="ad-body">${!p || !x ? (p ? filesView(p) : '') : st.view === 'map' ? mapView(p, x) : st.view === 'now' ? nowView(p, x) : st.view === 'original' ? original(x) : st.view === 'versions' ? versionsView(p, vs, x) : st.view === 'advisor' ? advisorView(p, x) : st.view === 'files' ? filesView(p) : planView(x)}</div>
      <details class="ad-src mt-2"><summary><i class="bi bi-info-circle"></i> المصدر وطريقة القراءة</summary>المصدر: صفحات الأقسام على مواقع الكليات ومكتباتها (مع الإصدارات السابقة التي يحتفظ بها الموقع)، تُراجع مع كل تحديث للموقع.
        ${okN} برنامجاً خطته الحالية مقروءة بمطابقة كاملة؛ الباقي تُعرض صفحاته الأصلية. «مطروح الآن» من الجدول الدراسي المنشور. المرجع المعتمد هو موقع الجامعة.</details>`;
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
      // the cards change size once the web fonts arrive: draw the arrows again then, and whenever the canvas changes size
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => st.view === 'map' && drawMap(p, x));
      if (window.ResizeObserver) { window.__amRO && window.__amRO.disconnect(); let w = 0, h = 0, tm;
        window.__amRO = new ResizeObserver(([e]) => { const r = e.contentRect; if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return; w = r.width; h = r.height;
          clearTimeout(tm); tm = setTimeout(() => st.view === 'map' && $('#am-canvas') && drawMap(p, x), 120); });
        const cvs = $('#am-canvas .am-cols'); if (cvs) window.__amRO.observe(cvs); }
      clearTimeout(window.__amR); window.onresize = () => { clearTimeout(window.__amR); window.__amR = setTimeout(() => st.view === 'map' && drawMap(p, x), 200); };
    }
    document.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { st.pl = b.dataset.pl; try { localStorage.setItem('uop-ad-pl', st.pl); } catch (e) { /* storage unavailable */ } render(); });
    document.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { st.pc = b.dataset.pc; render(); });
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
