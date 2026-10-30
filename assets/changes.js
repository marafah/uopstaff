/* «ما الجديد؟»: two things in one place.
   1. The site's new features (data/features.json), each with what it does, how to use it and a link to try it.
   2. What changed in the data: the timetable (sections added or removed, instructor, time, room, status, capacity),
      the staff directory (people added or removed, job, extension, office) and the academic calendar, as found by the
      hourly update (data/changes.json) — as a table, a timeline or a summary; printed report, Excel and an Atom feed.
   ?tab=overview|features|data &v=table|timeline|summary &d=7 &k=section &op=change &f=<field> &fac=<faculty> &q=<text> &a=<area> */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;
  const P = new URLSearchParams(location.search);
  const st = { tab: P.get('tab') || 'overview', v: P.get('v') || 'table', d: P.get('d') || '7', k: P.get('k') || '', op: P.get('op') || '', f: P.get('f') || '',
    fac: P.get('fac') || '', q: P.get('q') || '', a: P.get('a') || '', sort: 'at', dir: -1, more: 0 };
  if (!P.get('tab') && (st.k || st.op || st.f || st.fac || st.q || P.get('d'))) st.tab = 'data';   // old links to a filtered list
  const DEF = { tab: 'overview', v: 'table', d: '7' };
  const KIND = { section: ['الجدول الدراسي', 'bi-table', '#0b4a66'], staff: ['دليل الموظفين', 'bi-person-lines-fill', '#901d23'], calendar: ['التقويم الجامعي', 'bi-calendar3', '#0f766e'] };
  const OP = { add: ['جديد', 'bi-plus-circle-fill', 'ok'], remove: ['حُذف', 'bi-dash-circle-fill', 'no'], change: ['تغيّر', 'bi-arrow-left-right', 'ch'] };
  const AREA = { timetable: ['الجدول والخطط', '#0b4a66', 'bi-table'], directory: ['دليل الموظفين', '#901d23', 'bi-person-lines-fill'], research: ['البحث العلمي', '#6d28d9', 'bi-mortarboard'],
    students: ['للطلبة', '#15803d', 'bi-backpack'], site: ['الموقع', '#0f766e', 'bi-stars'] };
  const PERIOD = [['1', 'اليوم'], ['2', 'أمس واليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوماً'], ['all', 'كل السجل']];
  const PAGE = 60;
  // pages behind the research section's sign-in (assets/research.js): their features show a lock
  const LOCKED = new Set(['annual', 'award', 'compare', 'dept', 'experts', 'goals', 'impact', 'integrity', 'intl', 'jordan', 'journals', 'network', 'projects', 'promotion',
    'publication', 'publications', 'publish', 'regulations', 'reports', 'research', 'researcher', 'researchers', 'reward', 'sabbatical', 'simulator', 'universities']);
  const locked = f => f.locked != null ? !!f.locked : LOCKED.has(String(f.link || '').split(/[?#]/)[0].replace(/\.html$/, ''));
  let D, F = [];
  const day = iso => U.amman(iso).iso;  // the Amman date of a moment
  const dayName = iso => U.DAYS[U.amman(iso + 'T12:00').day] || '';
  const fields = e => (e.fields || []).map(f => f[0]);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const val = v => !v ? '<em>—</em>' : isDate(v) ? U.numDate(v) : esc(v);
  const today = () => U.amman().iso;
  const daysAgo = n => { const t = new Date(today() + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
  const nChanges = n => U.count(n, 'تغيير واحد', 'تغييران', 'تغييرات', 'تغييراً');

  function inPeriod(e) { return st.d === 'all' || day(e.at) >= daysAgo(+st.d - 1); }
  const hay = e => norm([e.title, e.sub, e.section, e.instructor, e.faculty, e.department, ...(e.fields || []).flat(), ...(e.detail || []).flat()].join(' '));
  function filtered(skip) {   // skip: one filter left out, to count the choices of that filter
    const q = norm(st.q.trim());
    return D.events.filter(e => inPeriod(e) && (skip === 'k' || !st.k || e.kind === st.k) && (skip === 'op' || !st.op || e.op === st.op) && (skip === 'f' || !st.f || fields(e).includes(st.f))
      && (!st.fac || e.faculty === st.fac) && (!q || hay(e).includes(q)));
  }
  const what = e => e.kind === 'section' ? `شعبة ${esc(e.section)} · ${esc(e.activity)}${(e.degrees || []).length ? ' · ' + e.degrees.map(esc).join(' و') : ''}` : esc(e.sub || '');
  const opPill = e => { const [on, oi, oc] = OP[e.op]; return `<span class="cg-op ${oc}"><i class="bi ${oi}"></i> ${on}</span>`; };
  const kindTag = e => { const [kn, ki, kc] = KIND[e.kind]; return `<span class="cg2-kd" style="--c:${kc}"><i class="bi ${ki}"></i> ${kn}</span>`; };
  const diffs = e => e.op === 'change'
    ? e.fields.map(([l, o, n]) => `<div class="cg2-df"><b>${esc(l)}</b><s>${val(o)}</s><i class="bi bi-arrow-left"></i><ins>${val(n)}</ins></div>`).join('')
    : `<div class="cg2-dt">${(e.detail || []).filter(x => x[1]).map(([l, v]) => `<span><b>${esc(l)}</b> ${val(v)}</span>`).join('')}</div>`;

  // ---------------------------------------------------------------- data changes: timeline cards
  function item(e) {
    const [kn, ki, kc] = KIND[e.kind];
    const body = e.op === 'change'
      ? `<table class="cg-diff">${e.fields.map(([l, o, n]) => `<tr><th>${esc(l)}</th><td class="old">${val(o)}</td><td class="arrow"><i class="bi bi-arrow-left"></i></td><td class="new">${val(n)}</td></tr>`).join('')}</table>`
      : `<div class="cg-detail">${(e.detail || []).filter(x => x[1]).map(([l, v]) => `<span><b>${esc(l)}:</b> ${val(v)}</span>`).join('')}</div>`;
    return `<article class="cg-item" style="--c:${kc}">
      <span class="cg-ic" title="${kn}"><i class="bi ${ki}"></i></span>
      <div class="cg-main"><header>${opPill(e)}<a href="${esc(e.link)}" class="cg-title">${esc(e.title)}</a>
        <small class="cg-time" dir="ltr">${U.amman(e.at).clock}</small></header>
        <p class="cg-sub">${what(e)}${e.faculty ? ` · ${esc(e.faculty)}` : ''}${e.department && e.department !== e.faculty ? ` · ${esc(e.department)}` : ''}${e.kind === 'section' && e.op === 'change' && e.instructor && !fields(e).includes('المدرس') ? ` · ${esc(U.shortName(e.instructor))}` : ''}</p>
        ${body}</div></article>`;
  }
  function timeline(list) {
    const byDay = {}; list.forEach(e => (byDay[day(e.at)] ||= []).push(e));
    return Object.keys(byDay).sort().reverse().map(d => `<section class="cg-day"><h2><span>${dayName(d)} ${U.numDate(d)}</span>${d === today() ? '<em>اليوم</em>' : ''}<small>${nChanges(byDay[d].length)}</small></h2>
      ${byDay[d].map(item).join('')}</section>`).join('');
  }

  // ---------------------------------------------------------------- data changes: table
  const COLS = [['at', 'التاريخ والوقت'], ['kind', 'المصدر'], ['op', 'النوع'], ['title', 'العنصر'], ['', 'ما الذي تغيّر'], ['faculty', 'الكلية / القسم']];
  const sortKey = { at: e => e.at, kind: e => KIND[e.kind][0], op: e => OP[e.op][0], title: e => e.title || '', faculty: e => (e.faculty || '') + ' ' + (e.department || '') };
  function table(list) {
    const k = sortKey[st.sort] || sortKey.at;
    const rows = list.slice().sort((a, b) => st.dir * (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0) || (b.at < a.at ? -1 : 1));
    const shown = rows.slice(0, PAGE * (st.more + 1));
    let last = '';
    const body = shown.map(e => {
      const d = day(e.at), sep = st.sort === 'at' && d !== last ? (last = d, `<tr class="cg2-sep"><td colspan="6"><b>${dayName(d)} ${U.numDate(d)}</b>${d === today() ? '<em>اليوم</em>' : ''}<small>${nChanges(rows.filter(x => day(x.at) === d).length)}</small></td></tr>`) : '';
      return sep + `<tr style="--c:${KIND[e.kind][2]}">
        <td class="cg2-when"><b dir="ltr">${U.amman(e.at).clock}</b><small>${U.numDate(d)}</small></td>
        <td>${kindTag(e)}</td><td>${opPill(e)}</td>
        <td class="cg2-what"><a href="${esc(e.link)}">${esc(e.title)}</a><small>${what(e)}${e.kind === 'section' && e.instructor && !fields(e).includes('المدرس') ? ` · ${esc(U.shortName(e.instructor))}` : ''}</small></td>
        <td class="cg2-chg">${diffs(e)}</td>
        <td class="cg2-fac">${esc(e.faculty || '—')}${e.department && e.department !== e.faculty ? `<small>${esc(e.department)}</small>` : ''}</td></tr>`; }).join('');
    return `<div class="cg2-tw"><table class="cg2-t"><thead><tr>${COLS.map(([c, l]) => c
        ? `<th><button type="button" data-sort="${c}" class="${st.sort === c ? 'on' : ''}">${l}<i class="bi ${st.sort === c ? (st.dir < 0 ? 'bi-sort-down' : 'bi-sort-up') : 'bi-arrow-down-up'}"></i></button></th>`
        : `<th>${l}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      ${rows.length > shown.length ? `<div class="text-center mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="cg-more">عرض ${Math.min(PAGE, rows.length - shown.length)} أخرى (بقي ${rows.length - shown.length})</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- data changes: summary
  const bars = (pairs, key, color) => { const max = Math.max(1, ...pairs.map(p => p[1]));
    return `<div class="cg2-bars">${pairs.map(([l, n]) => `<button type="button" class="cg2-bar ${st[key] === l ? 'on' : ''}" data-${key}="${esc(l)}">
      <span class="l" title="${esc(l)}">${esc(l)}</span><span class="t"><i style="width:${(n / max * 100).toFixed(1)}%;background:${color}"></i></span><b>${n}</b></button>`).join('')}</div>`; };
  function summary(list) {
    const cnt = f => { const m = new Map(); list.forEach(e => [].concat(f(e)).filter(Boolean).forEach(k => m.set(k, (m.get(k) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1]); };
    const ndays = st.d === 'all' ? Math.max(1, Math.round((Date.parse(today()) - Date.parse(day(D.started))) / 864e5) + 1) : +st.d;
    const perDay = [...Array(Math.min(ndays, 31)).keys()].map(i => daysAgo(i)).reverse().map(d => [d, list.filter(e => day(e.at) === d).length]), dmax = Math.max(1, ...perDay.map(x => x[1]));
    const items = cnt(e => e.title).filter(x => x[1] > 1).slice(0, 10), fl = cnt(e => fields(e));
    return `<div class="cg2-sum">
      <section class="cg2-p"><h3><i class="bi bi-grid-3x3"></i> المصدر × نوع التغيير <small>انقر رقماً لعرضه</small></h3>
        <table class="cg2-mx"><thead><tr><th></th>${Object.values(OP).map(([n, , c]) => `<th><span class="cg-op ${c}">${n}</span></th>`).join('')}<th>المجموع</th></tr></thead>
        <tbody>${Object.entries(KIND).map(([k, [n, i, c]]) => { const r = list.filter(e => e.kind === k); return `<tr><th><i class="bi ${i}" style="color:${c}"></i> ${n}</th>${Object.keys(OP).map(o => { const v = r.filter(e => e.op === o).length;
          return `<td>${v ? `<button type="button" data-kop="${k}|${o}" style="--a:${Math.min(1, .25 + .75 * v / list.length).toFixed(2)}">${v}</button>` : '<span>—</span>'}</td>`; }).join('')}<td><b>${r.length}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><th>المجموع</th>${Object.keys(OP).map(o => `<td><b>${list.filter(e => e.op === o).length}</b></td>`).join('')}<td><b>${list.length}</b></td></tr></tfoot></table></section>
      <section class="cg2-p"><h3><i class="bi bi-bar-chart"></i> التغييرات يوماً بيوم</h3>
        <div class="cg2-cols">${perDay.map(([d, n]) => `<div title="${dayName(d)} ${U.numDate(d)}: ${n}"><b>${n || ''}</b><i style="height:${(n / dmax * 100).toFixed(1)}%"></i><small>${U.numDate(d).slice(0, 5)}</small></div>`).join('')}</div></section>
      <section class="cg2-p"><h3><i class="bi bi-ui-checks"></i> ما الذي تغيّر <small>انقر للتصفية</small></h3>${fl.length ? bars(fl, 'f', '#901d23') : '<p class="small text-muted m-0">لا تعديلات على حقول في هذه الفترة (إضافة أو حذف فقط).</p>'}</section>
      <section class="cg2-p"><h3><i class="bi bi-building"></i> حسب الكلية / الوحدة <small>انقر للتصفية</small></h3>${bars(cnt(e => e.faculty).slice(0, 10), 'fac', '#0b4a66')}</section>
      ${items.length ? `<section class="cg2-p wide"><h3><i class="bi bi-arrow-repeat"></i> الأكثر تغيّراً</h3><div class="cg2-top">${items.map(([t, n]) => { const e = list.find(x => x.title === t);
        return `<a href="${esc(e.link)}" style="--c:${KIND[e.kind][2]}"><i class="bi ${KIND[e.kind][1]}"></i><span>${esc(t)}</span><b>${n}×</b></a>`; }).join('')}</div></section>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- features
  function featCard(f, compact) {
    const [an, ac, ai] = AREA[f.area] || AREA.site, lk = locked(f), isNew = f.date >= daysAgo(6), how = (f.how || []).map(s => `<li>${esc(s)}</li>`).join('');
    return `<article class="cg2-f" style="--c:${ac}">
      <div class="cg2-fh"><span class="cg2-fi"><i class="bi ${esc(f.icon || ai)}"></i></span>
        <div><div class="cg2-fm"><span class="cg2-area"><i class="bi ${ai}"></i> ${an}</span>${isNew ? '<span class="cg2-new">جديد</span>' : ''}${lk ? '<span class="cg2-lock" title="تتطلب اسم مستخدم وكلمة مرور (للمخوّلين فقط)"><i class="bi bi-lock-fill"></i> بتسجيل الدخول</span>' : ''}<small>${U.numDate(f.date)}</small></div>
          <h3>${esc(f.title)}${lk ? ' <i class="bi bi-lock-fill cg2-lk" aria-label="تتطلب تسجيل الدخول"></i>' : ''}</h3></div></div>
      <p>${esc(f.desc)}</p>
      ${compact ? `<details class="cg2-how"><summary><i class="bi bi-lightbulb"></i> كيف أستخدمها؟</summary><ol>${how}</ol></details>`
        : `<div class="cg2-how"><b><i class="bi bi-lightbulb"></i> طريقة الاستخدام</b><ol>${how}</ol></div>`}
      <footer>${(f.tags || []).map(t => `<span class="cg2-tag">#${esc(t)}</span>`).join('')}<a class="cg2-try ${lk ? 'lk' : ''}" href="${esc(f.link)}" title="${lk ? 'تفتح بعد تسجيل الدخول باسم المستخدم وكلمة المرور' : 'افتح الصفحة'}">${lk ? '<i class="bi bi-lock-fill"></i> ادخل وجرّبها' : 'جرّبها'} <i class="bi bi-arrow-left"></i></a></footer></article>`;
  }
  function featuresTab() {
    const q = norm(st.q.trim());
    const list = F.filter(f => (!st.a || f.area === st.a) && (!q || norm([f.title, f.desc, ...(f.how || []), ...(f.tags || [])].join(' ')).includes(q)));
    const byDay = {}; list.forEach(f => (byDay[f.date] ||= []).push(f));
    const areas = Object.entries(AREA).filter(([k]) => F.some(f => f.area === k));
    return `<div class="cg2-bar0 no-print"><div class="cg2-chips">${[['', 'كل الميزات', F.length, '#091b22', 'bi-grid']].concat(areas.map(([k, [n, c, i]]) => [k, n, F.filter(f => f.area === k).length, c, i]))
        .map(([k, n, c, col, i]) => `<button type="button" data-a="${k}" class="${st.a === k ? 'on' : ''}" style="--c:${col}"><i class="bi ${i}"></i> ${n} <b>${c}</b></button>`).join('')}</div>
        <label class="cg2-search"><i class="bi bi-search"></i><input id="cg-q" type="search" value="${esc(st.q)}" placeholder="ابحث في الميزات…" aria-label="ابحث في الميزات"></label></div>
      ${Object.keys(byDay).sort().reverse().map(d => `<section class="cg2-fday"><h2><span class="dot"></span>${dayName(d)} ${U.numDate(d)}<small>${U.count(byDay[d].length, 'ميزة واحدة', 'ميزتان', 'ميزات', 'ميزة')}</small></h2>
        <div class="cg2-fgrid">${byDay[d].map(f => featCard(f)).join('')}</div></section>`).join('')
        || '<div class="cg-empty"><i class="bi bi-search"></i><b>لا ميزات تطابق البحث.</b></div>'}`;
  }

  // ---------------------------------------------------------------- overview
  function overview() {
    const t = today(), ev = D.events;
    const top = (F.filter(f => f.major).length ? F.filter(f => f.major) : F).slice(0, 4), latest = ev.slice().sort((a, b) => b.at < a.at ? -1 : 1).slice(0, 7);
    const week = [...Array(7).keys()].map(i => daysAgo(6 - i)).map(d => [d, ev.filter(e => day(e.at) === d).length]), wmax = Math.max(1, ...week.map(x => x[1]));
    const kpi = (v, l, i, c, go) => `<button type="button" class="cg2-k" style="--c:${c}" ${go}><span class="i"><i class="bi ${i}"></i></span><span><b>${v}</b><small>${l}</small></span></button>`;
    return `<div class="cg2-kpis">
        ${kpi(F.filter(f => f.date >= daysAgo(29)).length, 'ميزة جديدة خلال 30 يوماً', 'bi-stars', '#6d28d9', 'data-tab="features"')}
        ${kpi(ev.filter(e => day(e.at) === t).length, 'تغيير في البيانات اليوم', 'bi-lightning-charge-fill', '#901d23', 'data-go="1"')}
        ${kpi(ev.filter(e => day(e.at) >= daysAgo(6)).length, 'تغييراً خلال 7 أيام', 'bi-calendar-week', '#0f766e', 'data-go="7"')}
        ${kpi(ev.filter(e => e.kind === 'section').length, 'في الجدول الدراسي (كل السجل)', 'bi-table', '#0b4a66', 'data-gok="section"')}
        ${kpi(ev.filter(e => e.kind === 'staff').length, 'في دليل الموظفين (كل السجل)', 'bi-person-lines-fill', '#15803d', 'data-gok="staff"')}</div>
      <div class="cg2-ov">
        <section class="cg2-p"><h3><i class="bi bi-stars"></i> أبرز الميزات الجديدة<button type="button" class="cg2-link" data-tab="features">كل الميزات (${F.length}) <i class="bi bi-arrow-left"></i></button></h3>
          <div class="cg2-fgrid two">${top.map(f => featCard(f, true)).join('') || '<p class="text-muted small m-0">لا ميزات مسجلة بعد.</p>'}</div></section>
        <aside class="cg2-side">
          <section class="cg2-p"><h3><i class="bi bi-activity"></i> آخر التغييرات في البيانات<button type="button" class="cg2-link" data-tab="data">السجل كاملاً <i class="bi bi-arrow-left"></i></button></h3>
            <div class="cg2-cols sm">${week.map(([d, c]) => `<div title="${dayName(d)} ${U.numDate(d)}: ${c}"><b>${c || ''}</b><i style="height:${(c / wmax * 100).toFixed(1)}%"></i><small>${dayName(d)}</small></div>`).join('')}</div>
            <ul class="cg2-mini">${latest.map(e => `<li style="--c:${KIND[e.kind][2]}"><i class="bi ${KIND[e.kind][1]}"></i><div><a href="${esc(e.link)}">${esc(e.title)}</a>
              <small>${opPill(e)} ${e.op === 'change' ? e.fields.map(([l, o, nn]) => `${esc(l)}: ${val(o)} ← ${val(nn)}`).join(' · ') : (e.sub ? esc(e.sub) : what(e))}</small></div><time>${U.numDate(day(e.at)).slice(0, 5)}<br><span dir="ltr">${U.amman(e.at).clock}</span></time></li>`).join('')}</ul></section>
          <section class="cg2-p cg2-tip"><h3><i class="bi bi-info-circle"></i> كيف تعمل هذه الصفحة؟</h3>
            <p>يقارن الموقع بياناته كل ساعة بما كانت عليه في الساعة السابقة، ويسجّل ما تغيّر في الجدول الدراسي ودليل الموظفين والتقويم الجامعي. بدأ التسجيل في ${U.numDate(day(D.started))}؛ وحركة أعداد المسجلين في الشعب في <a href="trends.html">متابعة التسجيل</a>.</p>
            <a class="btn btn-sm btn-outline-secondary" href="data/changes.xml"><i class="bi bi-rss"></i> اشترك بالتغييرات</a></section>
        </aside></div>`;
  }

  // ---------------------------------------------------------------- data tab
  function dataTab() {
    const list = filtered();
    const facs = [...new Set(D.events.map(e => e.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const flds = [...new Set(D.events.flatMap(fields))];
    const byK = filtered('k'), byOp = filtered('op'), byF = filtered('f');
    const fcount = new Map(); byF.forEach(e => fields(e).forEach(x => fcount.set(x, (fcount.get(x) || 0) + 1)));
    const ftabs = fcount.size ? `<div class="cg2-ftabs" role="group" aria-label="ما الذي تغيّر"><span class="lab"><i class="bi bi-funnel-fill"></i> ما الذي تغيّر</span>${[['', 'أي شيء', byF.length]].concat([...fcount].sort((a, b) => b[1] - a[1]).map(([x, n]) => [x, x, n]))
      .map(([k, l, n]) => `<button type="button" class="${st.f === k ? 'on' : ''}" data-ff="${esc(k)}">${esc(l)} <b>${n}</b></button>`).join('')}</div>` : '';
    const ktabs = `<nav class="cg2-ktabs no-print" role="tablist" aria-label="المصدر">${[['', 'كل التغييرات', 'bi-collection', '#091b22']].concat(Object.entries(KIND).map(([k, [n, i, c]]) => [k, n, i, c]))
      .map(([k, n, i, c]) => { const v = k ? byK.filter(e => e.kind === k).length : byK.length;
        return `<button type="button" role="tab" aria-selected="${st.k === k}" class="${st.k === k ? 'on' : ''} ${v ? '' : 'zero'}" data-k="${k}" style="--c:${c}"><i class="bi ${i}"></i><span>${n}</span><b>${v}</b></button>`; }).join('')}</nav>`;
    const optabs = `<div class="cg2-optabs" role="group" aria-label="نوع التغيير">${[['', 'الكل', 'bi-asterisk', 'all']].concat(Object.entries(OP).map(([k, [n, i, c]]) => [k, n, i, c]))
      .map(([k, n, i, c]) => { const v = k ? byOp.filter(e => e.op === k).length : byOp.length;
        return `<button type="button" class="${c} ${st.op === k ? 'on' : ''} ${v ? '' : 'zero'}" data-op="${k}"><i class="bi ${i}"></i> ${n} <b>${v}</b></button>`; }).join('')}</div>`;
    const active = [st.fac && [st.fac, 'fac'], st.q && ['«' + st.q + '»', 'q']].filter(Boolean);
    const sel = (id, lab, opts, cur, all) => `<label class="cg2-sel"><span>${lab}</span><select class="form-select form-select-sm" id="${id}"><option value="">${all}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const body = !list.length ? `<div class="cg-empty"><i class="bi bi-check2-circle"></i><b>لا تغييرات ${st.d === 'all' && !active.length ? 'منذ بدء التسجيل' : 'ضمن هذه التصفية'}.</b>
        <span>يُفحص الجدول الدراسي ودليل الموظفين والتقويم الجامعي كل ساعة؛ أي تغيير يظهر هنا تلقائياً.</span>
        ${st.d !== 'all' ? '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-d="all">عرض كل السجل</button>' : ''}</div>`
      : st.v === 'timeline' ? timeline(list) : st.v === 'summary' ? summary(list) : table(list);
    return `${ktabs}<div class="cg2-filt no-print">
        <div class="cg2-row">${optabs}<span class="cg2-vr"></span>
          <div class="cg2-seg" role="group" aria-label="الفترة">${PERIOD.map(([k, l]) => `<button type="button" class="${st.d === k ? 'on' : ''}" data-d="${k}">${l}</button>`).join('')}</div>
          <span class="cg2-vr"></span>
          <div class="cg2-seg views" role="group" aria-label="طريقة العرض">${[['table', 'جدول', 'bi-table'], ['timeline', 'خط زمني', 'bi-list-ul'], ['summary', 'ملخص', 'bi-pie-chart']].map(([k, l, i]) => `<button type="button" class="${st.v === k ? 'on' : ''}" data-v="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
          <span class="cg2-cnt">${nChanges(list.length)}</span>
          <span class="ms-auto d-flex gap-1"><button type="button" class="btn btn-sm btn-outline-secondary" id="cg-print" title="طباعة تقرير"><i class="bi bi-printer"></i><span class="d-none d-lg-inline"> طباعة</span></button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cg-csv" title="تصدير إلى Excel"><i class="bi bi-file-earmark-spreadsheet"></i><span class="d-none d-lg-inline"> Excel</span></button>
            <a class="btn btn-sm btn-outline-secondary" href="data/changes.xml" title="اشترك بالتغييرات في قارئ الأخبار (Atom)"><i class="bi bi-rss"></i><span class="d-none d-lg-inline"> اشتراك</span></a></span></div>
        <div class="cg2-row">
          ${sel('cg-fac', 'الكلية / الوحدة', facs.map(f => [f, f]), st.fac, 'كل الكليات')}
          <label class="cg2-search grow"><i class="bi bi-search"></i><input id="cg-q" type="search" value="${esc(st.q)}" placeholder="رمز مقرر، اسم مدرس أو موظف، قاعة…" aria-label="بحث في التغييرات"></label></div>
        ${ftabs}
        ${active.length ? `<div class="cg2-act"><span>التصفية:</span>${active.map(([l, k]) => `<button type="button" data-clr="${k}">${esc(l)} <i class="bi bi-x"></i></button>`).join('')}<button type="button" class="all" data-clr="*">مسح الكل</button></div>` : ''}
      </div>
      ${body}`;
  }

  function render() {
    const fNew = F.filter(f => f.date >= daysAgo(29)).length;
    const tabs = [['overview', 'نظرة عامة', 'bi-speedometer2', ''], ['features', 'ميزات الموقع الجديدة', 'bi-stars', F.length], ['data', 'تغييرات البيانات', 'bi-activity', D.events.length]];
    $('#cg-app').innerHTML = `<nav class="cg2-tabs no-print" role="tablist">${tabs.map(([k, l, i, n]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}" data-tab="${k}"><i class="bi ${i}"></i> ${l}${n !== '' ? `<b>${n}</b>` : ''}</button>`).join('')}
        <span class="cg2-upd"><i class="bi bi-arrow-repeat"></i> البيانات تُفحص كل ساعة${fNew ? ` · <b>${fNew}</b> ميزة جديدة هذا الشهر` : ''}</span></nav>
      <div class="cg2-body">${st.tab === 'features' ? featuresTab() : st.tab === 'data' ? dataTab() : overview()}</div>`;
    bind();
  }

  function go(keepMore) {
    if (!keepMore) st.more = 0;
    const u = new URL(location.href);
    ['tab', 'v', 'd', 'k', 'op', 'f', 'fac', 'q', 'a'].forEach(k => (st[k] && st[k] !== DEF[k]) ? u.searchParams.set(k, st[k]) : u.searchParams.delete(k));
    history.replaceState(null, '', u); render();
  }
  function bind() {
    const on = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
    const top = () => { const a = $('#cg-app'); if (a.getBoundingClientRect().top < 0) scrollTo({ top: a.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); };
    on('[data-tab]', b => { st.tab = b.dataset.tab; go(); top(); });
    on('[data-d]', b => { st.d = b.dataset.d; go(); });
    on('[data-v]', b => { st.v = b.dataset.v; go(); });
    on('[data-a]', b => { st.a = b.dataset.a; go(); });
    on('[data-go]', b => { Object.assign(st, { tab: 'data', d: b.dataset.go, k: '', op: '', f: '', fac: '' }); go(); top(); });
    on('[data-gok]', b => { Object.assign(st, { tab: 'data', d: 'all', k: b.dataset.gok, op: '', f: '', fac: '' }); go(); top(); });
    on('[data-kop]', b => { const [k, o] = b.dataset.kop.split('|'); Object.assign(st, { k, op: o, v: 'table' }); go(); });
    on('.cg2-bar[data-f]', b => { st.f = st.f === b.dataset.f ? '' : b.dataset.f; go(); });
    on('.cg2-bar[data-fac]', b => { st.fac = st.fac === b.dataset.fac ? '' : b.dataset.fac; go(); });
    on('[data-sort]', b => { const c = b.dataset.sort; st.dir = st.sort === c ? -st.dir : (c === 'at' ? -1 : 1); st.sort = c; go(); });
    on('[data-clr]', b => { const k = b.dataset.clr; if (k === '*') Object.assign(st, { k: '', op: '', f: '', fac: '', q: '' }); else st[k] = ''; const h = $('#pg-q'); if (h && (k === 'q' || k === '*')) h.value = ''; go(); });
    const more = $('#cg-more'); if (more) more.onclick = () => { st.more++; go(true); };
    on('.cg2-ktabs [data-k]', b => { st.k = b.dataset.k; if (st.f && !filtered().length) st.f = ''; go(); });
    on('.cg2-ftabs [data-ff]', b => { st.f = b.dataset.ff; go(); });
    on('.cg2-optabs [data-op]', b => { st.op = b.dataset.op; go(); });
    [['cg-f', 'f'], ['cg-fac', 'fac']].forEach(([id, k]) => { const s = $('#' + id); if (s) s.addEventListener('change', e => { st[k] = e.target.value; go(); }); });
    const qi = $('#cg-q');
    if (qi) { let t; qi.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; const h = $('#pg-q'); if (h) h.value = st.q; go(); const i = $('#cg-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }); }
    const pr = $('#cg-print'); if (pr) pr.onclick = () => print(filtered());
    const cv = $('#cg-csv'); if (cv) cv.onclick = () => csv(filtered());
  }

  const text = e => e.op === 'change' ? e.fields.map(([l, o, n]) => `${l}: ${(isDate(o) ? U.numDate(o) : o) || '—'} ← ${(isDate(n) ? U.numDate(n) : n) || '—'}`).join(' · ')
    : (e.detail || []).filter(x => x[1]).map(([l, v]) => `${l}: ${isDate(v) ? U.numDate(v) : v}`).join(' · ');
  function print(list) {
    if (!list.length) return;
    const days = [...new Set(list.map(e => day(e.at)))].sort().reverse();
    printReport({
      title: 'ما الجديد؟', subtitle: 'التغييرات في الجدول الدراسي ودليل الموظفين والتقويم الجامعي', orientation: 'landscape',
      filters: [['الفترة', PERIOD.find(p => p[0] === st.d)[1]], st.k && ['المصدر', KIND[st.k][0]], st.op && ['النوع', OP[st.op][0]], st.f && ['ما الذي تغيّر', st.f], st.fac && ['الكلية', st.fac], st.q && ['بحث', st.q]].filter(Boolean),
      stats: [['تغيير', list.length], ...Object.entries(KIND).map(([k, [n]]) => [n, list.filter(e => e.kind === k).length]).filter(x => x[1])],
      sections: days.map(d => ({ title: `${dayName(d)} ${U.numDate(d)}`, columns: ['الوقت', 'المصدر', 'النوع', 'ماذا', 'التفاصيل', 'الكلية / القسم'], widths: ['6%', '11%', '7%', '28%', '33%', '15%'],
        rows: list.filter(e => day(e.at) === d).map(e => [U.amman(e.at).clock, KIND[e.kind][0], { html: `<span class="pill ${e.op === 'add' ? 'ok' : e.op === 'remove' ? 'no' : 'mut'}">${OP[e.op][0]}</span>` },
          { html: `<b>${esc(e.title)}</b>${e.kind === 'section' ? `<small>شعبة ${esc(e.section)} · ${esc(e.activity)}</small>` : e.sub ? `<small>${esc(e.sub)}</small>` : ''}` },
          text(e), [e.faculty, e.department !== e.faculty && e.department].filter(Boolean).join(' · ')]) })),
    });
  }
  function csv(list) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['التاريخ', 'الوقت', 'المصدر', 'النوع', 'العنوان', 'الشعبة', 'النشاط', 'الدرجات', 'التفاصيل', 'الكلية', 'القسم'].map(q).join(',')]
      .concat(list.map(e => [U.numDate(day(e.at)), U.amman(e.at).clock, KIND[e.kind][0], OP[e.op][0], e.title, e.section, e.activity, (e.degrees || []).join('، '), text(e), e.faculty, e.department].map(q).join(',')));
    U.download(`ما_الجديد_${U.amman().iso}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ---------------------------------------------------------------- styles
  if (!document.getElementById('cg2-css')) document.head.insertAdjacentHTML('beforeend', `<style id="cg2-css">
    .cg2-tabs { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .35rem; margin-bottom: 1rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .cg2-tabs > button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .45rem; padding: .5rem 1rem; border-radius: 10px; font-weight: 700; font-size: .9rem; line-height: 1.4; color: #0b4a66; transition: background .15s, color .15s; }
    .cg2-tabs > button:hover { background: #f6f3ec; color: #091b22; } .cg2-tabs > button:focus-visible { outline: 2px solid #901d23; }
    .cg2-tabs > button.on { background: linear-gradient(135deg, #901d23, #6e151a); color: #fff; box-shadow: 0 4px 12px rgba(144,29,35,.25); }
    .cg2-tabs > button b { font-size: .72rem; line-height: 1.5; min-width: 1.6rem; text-align: center; background: #eef4f7; color: #0b4a66; border-radius: 99px; padding: .05rem .5rem; } .cg2-tabs > button.on b { background: rgba(255,255,255,.22); color: #fff; }
    .cg2-upd { margin-inline-start: auto; font-size: .78rem; color: #6b7280; padding-inline: .6rem; } .cg2-upd b { color: #6d28d9; }
    .cg2-p { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .9rem 1rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .cg2-p > h3 { display: flex; align-items: center; gap: .45rem; font-size: .98rem; font-weight: 800; color: #091b22; margin: 0 0 .75rem; } .cg2-p > h3 > i { color: #901d23; }
    .cg2-p > h3 small { font-size: .72rem; color: #94a3b8; font-weight: 500; }
    .cg2-link { all: unset; cursor: pointer; margin-inline-start: auto; font-size: .78rem; font-weight: 700; color: #901d23; } .cg2-link:hover { text-decoration: underline; }
    .cg2-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .cg2-k { all: unset; cursor: pointer; display: flex; align-items: center; gap: .75rem; background: #fff; border: 1px solid #ece6d8; border-top: 3px solid var(--c); border-radius: 14px; padding: .8rem 1rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); transition: transform .15s, box-shadow .15s; }
    .cg2-k:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(9,27,34,.09); } .cg2-k:focus-visible { outline: 2px solid var(--c); }
    .cg2-k .i { flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 1.2rem; color: var(--c); background: color-mix(in srgb, var(--c) 11%, #fff); }
    .cg2-k b { display: block; font-size: 1.55rem; line-height: 1.1; color: #091b22; font-weight: 800; } .cg2-k small { font-size: .76rem; color: #6b7280; }
    .cg2-ov { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 1rem; align-items: start; } .cg2-side { display: grid; gap: 1rem; }
    .cg2-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: .9rem; } .cg2-fgrid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cg2-f { display: flex; flex-direction: column; gap: .55rem; background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .9rem 1rem; position: relative; overflow: hidden; box-shadow: 0 2px 10px rgba(9,27,34,.04); transition: box-shadow .15s, transform .15s; }
    .cg2-f::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c) 30%, #fff)); }
    .cg2-f:hover { box-shadow: 0 10px 24px rgba(9,27,34,.09); transform: translateY(-1px); }
    .cg2-fh { display: flex; gap: .7rem; align-items: center; } .cg2-fh h3 { font-size: 1rem; font-weight: 800; margin: .1rem 0 0; color: #091b22; line-height: 1.35; }
    .cg2-fi { flex: none; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-size: 1.25rem; color: #fff; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 60%, #000)); box-shadow: 0 4px 10px color-mix(in srgb, var(--c) 35%, transparent); }
    .cg2-fm { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; } .cg2-fm small { color: #94a3b8; font-size: .72rem; }
    .cg2-area { font-size: .7rem; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); border-radius: 99px; padding: .05rem .5rem; }
    .cg2-new { font-size: .66rem; font-weight: 800; color: #fff; background: #16a34a; border-radius: 99px; padding: .05rem .45rem; }
    .cg2-f > p { margin: 0; font-size: .86rem; color: #374151; line-height: 1.7; }
    .cg2-how { background: #fbfaf6; border: 1px solid #f0ead9; border-radius: 10px; padding: .45rem .7rem; font-size: .82rem; }
    .cg2-how summary { cursor: pointer; font-weight: 700; color: #7a5a17; } .cg2-how > b { display: block; color: #7a5a17; margin-bottom: .25rem; }
    .cg2-how ol { margin: .35rem 0 0; padding-inline-start: 0; list-style: none; counter-reset: s; } .cg2-how li { counter-increment: s; position: relative; padding-inline-start: 1.8rem; margin-bottom: .3rem; color: #374151; line-height: 1.6; }
    .cg2-how li::before { content: counter(s); position: absolute; inset-inline-start: 0; top: .1rem; width: 1.3rem; height: 1.3rem; border-radius: 50%; background: var(--c); color: #fff; font-size: .7rem; font-weight: 800; display: grid; place-items: center; }
    .cg2-f footer { margin-top: auto; display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
    .cg2-tag { font-size: .7rem; color: #6b7280; background: #f3f4f6; border-radius: 99px; padding: .05rem .5rem; }
    .cg2-f .cg2-try { margin-inline-start: auto; display: inline-flex; align-items: center; gap: .35rem; background: var(--c); color: #fff; border: 1px solid var(--c); border-radius: 9px; font-weight: 700; font-size: .85rem; padding: .3rem .85rem; text-decoration: none; transition: background .15s, box-shadow .15s, transform .15s; }
    .cg2-f .cg2-try:hover, .cg2-f .cg2-try:focus-visible { background: color-mix(in srgb, var(--c) 82%, #000); color: #fff; box-shadow: 0 6px 14px color-mix(in srgb, var(--c) 40%, transparent); transform: translateY(-1px); }
    .cg2-f .cg2-try:hover i.bi-arrow-left { transform: translateX(-3px); } .cg2-f .cg2-try i { transition: transform .15s; }
    .cg2-f .cg2-try:focus-visible { outline: 2px solid #f5c66b; outline-offset: 2px; } .cg2-f .cg2-try:active { transform: none; box-shadow: none; }
    .cg2-lock { font-size: .68rem; font-weight: 800; color: #92400e; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 99px; padding: .02rem .45rem; }
    .cg2-lk { color: #b45309; font-size: .8em; }
    .cg2-fday { margin-bottom: 1.4rem; } .cg2-fday > h2 { display: flex; align-items: center; gap: .55rem; font-size: 1rem; font-weight: 800; margin-bottom: .7rem; }
    .cg2-fday > h2 .dot { width: 12px; height: 12px; border-radius: 50%; background: #901d23; box-shadow: 0 0 0 4px rgba(144,29,35,.15); } .cg2-fday > h2 small { color: #6b7280; font-weight: 500; font-size: .78rem; }
    .cg2-bar0 { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .cg2-chips { display: flex; gap: .35rem; flex-wrap: wrap; } .cg2-chips button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .8rem; border-radius: 99px; background: #fff; border: 1px solid #e3ddcc; font-size: .82rem; font-weight: 600; color: #374151; }
    .cg2-chips button i { color: var(--c); } .cg2-chips button b { font-size: .7rem; background: #f3f4f6; border-radius: 99px; padding: 0 .4rem; }
    .cg2-chips button.on { background: var(--c); border-color: var(--c); color: #fff; } .cg2-chips button.on i { color: #fff; } .cg2-chips button.on b { background: rgba(255,255,255,.25); }
    .cg2-search { display: flex; align-items: center; gap: .4rem; height: 34px; margin: 0; padding: 0 .7rem; background: #fff; border: 1px solid #dee2e6; border-radius: 10px; min-width: 220px; }
    .cg2-search.grow { flex: 1 1 260px; } .cg2-search:focus-within { border-color: #901d23; box-shadow: 0 0 0 3px rgba(144,29,35,.12); }
    .cg2-search i { color: #94a3b8; } .cg2-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: .85rem; }
    .cg2-bar0 .cg2-search { margin-inline-start: auto; }
    .cg2-filt { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .7rem .8rem; margin-bottom: 1rem; display: grid; gap: .6rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .cg2-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .cg2-seg { display: inline-flex; background: #f3f6f8; border-radius: 10px; padding: 3px; gap: 2px; }
    .cg2-seg button { all: unset; cursor: pointer; padding: .3rem .75rem; border-radius: 8px; font-size: .82rem; font-weight: 600; color: #0b4a66; white-space: nowrap; }
    .cg2-seg button:hover { color: #091b22; } .cg2-seg button.on { background: #fff; color: #901d23; box-shadow: 0 1px 4px rgba(9,27,34,.12); font-weight: 800; }
    .cg2-seg.views button.on { background: #0b4a66; color: #fff; } .cg2-vr { width: 1px; align-self: stretch; background: #e5e7eb; }
    .cg2-cnt { font-size: .8rem; font-weight: 800; color: #901d23; }
    .cg2-sel { display: flex; align-items: center; gap: .35rem; margin: 0; font-size: .78rem; font-weight: 700; color: #901d23; } .cg2-sel select { height: 34px; border-radius: 10px; min-width: 130px; width: auto; }
    .cg2-act { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; font-size: .8rem; color: #901d23; }
    .cg2-act button { all: unset; cursor: pointer; background: #fbeff0; color: #901d23; border-radius: 99px; padding: .1rem .6rem; font-weight: 700; } .cg2-act button.all { background: none; color: #901d23; text-decoration: underline; }
    .cg2-ktabs { display: flex; flex-wrap: wrap; gap: 0; border-bottom: 2px solid #e8e2d2; margin-bottom: .8rem; }
    .cg2-ktabs button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .5rem; padding: .65rem 1.1rem; margin-bottom: -2px; border-bottom: 3px solid transparent; font-weight: 700; font-size: .9rem; line-height: 1.4; color: color-mix(in srgb, var(--c) 75%, #fff); white-space: nowrap; transition: color .15s, border-color .15s, background .15s; border-radius: 10px 10px 0 0; }
    .cg2-ktabs button i { color: var(--c); font-size: 1rem; } .cg2-tabs > button i { font-size: 1rem; } .cg2-ktabs button:hover { color: var(--c); background: color-mix(in srgb, var(--c) 6%, #fff); }
    .cg2-ktabs button b { font-size: .72rem; line-height: 1.5; min-width: 1.6rem; text-align: center; border-radius: 99px; padding: .05rem .5rem; background: color-mix(in srgb, var(--c) 12%, #fff); color: var(--c); }
    .cg2-ktabs button.on { color: var(--c); border-bottom-color: var(--c); background: #fff; } .cg2-ktabs button.on b { background: var(--c); color: #fff; }
    .cg2-ktabs button.zero b { background: #fff; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 30%, #fff); color: var(--c); } .cg2-ktabs button:focus-visible { outline: 2px solid var(--c); outline-offset: -2px; }
    .cg2-optabs { display: inline-flex; gap: .3rem; flex-wrap: wrap; }
    .cg2-optabs button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; padding: .3rem .75rem; border-radius: 99px; border: 1px solid #e3ddcc; background: #fff; font-size: .82rem; font-weight: 700; color: #0b4a66; }
    .cg2-optabs button b { font-size: .7rem; background: #eef4f7; border-radius: 99px; padding: 0 .4rem; color: #0b4a66; }
    .cg2-optabs .ok i { color: #15803d; } .cg2-optabs .no i { color: #b42318; } .cg2-optabs .ch i { color: #0b4a66; } .cg2-optabs .all i { color: #0b4a66; }
    .cg2-optabs button:hover { border-color: #c9bfa5; background: #fbfaf6; }
    .cg2-optabs button.on.all { background: #091b22; border-color: #091b22; color: #fff; } .cg2-optabs button.on.ok { background: #15803d; border-color: #15803d; color: #fff; }
    .cg2-optabs button.on.no { background: #b42318; border-color: #b42318; color: #fff; } .cg2-optabs button.on.ch { background: #0b4a66; border-color: #0b4a66; color: #fff; }
    .cg2-optabs button.on i { color: #fff; } .cg2-optabs button.on b { background: rgba(255,255,255,.25); color: #fff; } .cg2-optabs button.zero b { background: transparent; }
    .cg2-ftabs { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
    .cg2-ftabs .lab { font-size: .76rem; font-weight: 800; color: #901d23; margin-inline-end: .2rem; }
    .cg2-ftabs button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; padding: .22rem .65rem; border-radius: 8px; background: #fff; border: 1px solid #e6cfd1; font-size: .8rem; font-weight: 700; color: #901d23; }
    .cg2-ftabs button b { font-size: .68rem; background: #fbeff0; border-radius: 99px; padding: 0 .38rem; color: #901d23; }
    .cg2-ftabs button:hover { border-color: #c98c91; background: #fbeff0; } .cg2-ftabs button.on { background: #901d23; border-color: #901d23; color: #fff; box-shadow: 0 2px 6px rgba(144,29,35,.25); } .cg2-ftabs button.on b { background: rgba(255,255,255,.25); color: #fff; }
    .cg-op.ch { background: #e7f0f5; color: #0b4a66; }
    .cg2-kd { display: inline-flex; align-items: center; gap: .3rem; font-size: .74rem; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 9%, #fff); border-radius: 8px; padding: .12rem .5rem; white-space: nowrap; }
    .cg2-tw { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; overflow: auto; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .cg2-t { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .84rem; }
    .cg2-t thead th { position: sticky; top: 0; z-index: 1; background: #0b2a3a; color: #fff; padding: .6rem .7rem; text-align: start; font-weight: 700; white-space: nowrap; }
    .cg2-t thead th button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .35rem; }
    .cg2-t thead th button i { opacity: .5; font-size: .8rem; } .cg2-t thead th button.on i { opacity: 1; color: #f5c66b; } .cg2-t thead th button:hover { color: #f5c66b; }
    .cg2-t tbody td { padding: .55rem .7rem; border-bottom: 1px solid #f0ece2; vertical-align: top; }
    .cg2-t tbody tr:not(.cg2-sep) td:first-child { border-inline-start: 4px solid var(--c); }
    .cg2-t tbody tr:not(.cg2-sep):hover td { background: #fbfaf6; }
    .cg2-sep td { background: #f6f3ec; padding: .4rem .8rem; font-size: .82rem; } .cg2-sep b { color: #091b22; } .cg2-sep em { font-style: normal; font-size: .68rem; background: #901d23; color: #fff; border-radius: 99px; padding: .02rem .5rem; margin-inline-start: .4rem; } .cg2-sep small { float: inline-end; color: #6b7280; }
    .cg2-when { white-space: nowrap; } .cg2-when b { display: block; font-variant-numeric: tabular-nums; } .cg2-when small, .cg2-what small, .cg2-fac small { display: block; color: #6b7280; font-size: .74rem; }
    .cg2-what a { font-weight: 800; color: #091b22; text-decoration: none; } .cg2-what a:hover { color: #901d23; text-decoration: underline; } .cg2-what { min-width: 220px; }
    .cg2-chg { min-width: 240px; } .cg2-df { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; margin-bottom: .15rem; }
    .cg2-df b { font-size: .72rem; color: #4b5563; background: #f3f4f6; border-radius: 6px; padding: .02rem .45rem; } .cg2-df s { color: #b42318; text-decoration-color: rgba(180,35,24,.45); }
    .cg2-df ins { text-decoration: none; color: #15803d; font-weight: 800; } .cg2-df > i { color: #9ca3af; font-size: .8rem; } .cg2-df em { color: #9ca3af; font-style: normal; }
    .cg2-dt { display: flex; flex-wrap: wrap; gap: .2rem .8rem; font-size: .8rem; } .cg2-dt b { color: #6b7280; font-weight: 600; }
    .cg2-fac { color: #374151; min-width: 140px; }
    .cg2-sum { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; } .cg2-sum .wide { grid-column: 1 / -1; }
    .cg2-mx { width: 100%; border-collapse: collapse; font-size: .85rem; text-align: center; } .cg2-mx th, .cg2-mx td { padding: .45rem .4rem; border-bottom: 1px solid #f0ece2; }
    .cg2-mx tbody th, .cg2-mx tfoot th { text-align: start; white-space: nowrap; } .cg2-mx tfoot td, .cg2-mx tfoot th { border-top: 2px solid #e5dfcf; border-bottom: 0; }
    .cg2-mx button { all: unset; cursor: pointer; display: inline-block; min-width: 2.2rem; padding: .15rem .4rem; border-radius: 8px; font-weight: 800; color: #fff; background: rgba(11,74,102,var(--a)); } .cg2-mx button:hover { outline: 2px solid #0b4a66; }
    .cg2-mx td span { color: #cbd5e1; }
    .cg2-cols { display: flex; align-items: flex-end; gap: 4px; height: 150px; } .cg2-cols.sm { height: 96px; margin-bottom: .6rem; }
    .cg2-cols > div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
    .cg2-cols i { display: block; width: 100%; max-width: 34px; min-height: 2px; max-height: calc(100% - 2.2rem); border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #901d23, #c2535a); }
    .cg2-cols b { font-size: .7rem; color: #374151; min-height: 1em; } .cg2-cols small { font-size: .62rem; color: #94a3b8; margin-top: 3px; white-space: nowrap; }
    .cg2-bars { display: grid; gap: .35rem; } .cg2-bar { all: unset; cursor: pointer; display: grid; grid-template-columns: minmax(90px, 34%) 1fr 2.2rem; align-items: center; gap: .5rem; padding: .15rem .3rem; border-radius: 8px; font-size: .82rem; }
    .cg2-bar:hover { background: #f6f3ec; } .cg2-bar.on { background: #fbeff0; } .cg2-bar .l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; }
    .cg2-bar .t { height: 10px; background: #f1f5f9; border-radius: 99px; overflow: hidden; } .cg2-bar .t i { display: block; height: 100%; border-radius: 99px; } .cg2-bar b { text-align: end; color: #091b22; }
    .cg2-top { display: flex; flex-wrap: wrap; gap: .4rem; } .cg2-top a { display: inline-flex; align-items: center; gap: .4rem; text-decoration: none; color: #091b22; background: #fff; border: 1px solid #ece6d8; border-inline-start: 3px solid var(--c); border-radius: 10px; padding: .3rem .6rem; font-size: .82rem; }
    .cg2-top a i { color: var(--c); } .cg2-top a b { color: #901d23; } .cg2-top a:hover { background: #fbfaf6; }
    .cg2-mini { list-style: none; margin: 0; padding: 0; } .cg2-mini li { display: flex; gap: .55rem; align-items: flex-start; padding: .5rem 0; border-bottom: 1px dashed #ece6d8; } .cg2-mini li:last-child { border-bottom: 0; }
    .cg2-mini li > i { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); }
    .cg2-mini li > div { flex: 1; min-width: 0; } .cg2-mini a { font-weight: 700; color: #091b22; text-decoration: none; font-size: .85rem; } .cg2-mini a:hover { color: #901d23; }
    .cg2-mini small { display: block; font-size: .74rem; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .cg2-mini small .cg-op { font-size: .64rem; padding: 0 .4rem; }
    .cg2-mini time { flex: none; font-size: .7rem; color: #94a3b8; font-variant-numeric: tabular-nums; text-align: end; line-height: 1.3; }
    .cg2-tip p { font-size: .82rem; color: #4b5563; line-height: 1.7; }
    @media (max-width: 1200px) { .cg2-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cg2-ov { grid-template-columns: 1fr; } }
    @media (max-width: 768px) { .cg2-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cg2-fgrid.two, .cg2-sum, .cg2-fgrid { grid-template-columns: 1fr; } .cg2-upd { display: none; } }
    @media print { .cg2-tabs, .cg2-filt { display: none !important; } }
  </style>`);

  Promise.all([U.getJSON('data/changes.json', true), U.getJSON('data/features.json').catch(() => ({ features: [] }))]).then(([d, f]) => {
    D = d; F = (f.features || []).slice().sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : 0);
    U.updatedLine(d.updated, 'يُفحص كل ساعة');
    const h = $('#pg-q');
    if (h) { h.value = st.q; h.addEventListener('input', e => { st.q = e.target.value; if (st.tab === 'overview') st.tab = 'data'; const i = $('#cg-q'); if (i) i.value = st.q; go(); }); }
    render();
  }).catch(() => { $('#cg-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل سجل التغييرات. أعد المحاولة بعد قليل.</div>'; });
})();
