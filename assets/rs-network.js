/* network.html: co-authorship network inside the university */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data;
  try { data = await R.load('researchers'); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta);
  R.cmp.render();
  const cites = r => ((r.sc || {}).cites) || r.cites || 0;
  const Y = (data.meta || {}).year || new Date().getFullYear();
  const yrOpts = s => { let h = '<option value="">كل السنوات</option>'; for (let y = Y; y >= Y - 25; y--) h += `<option${String(y) === s ? ' selected' : ''}>${y}</option>`; return h; };
  const edgesBase = [];
  const facs = R.faculties(list);
  facs.forEach(R.facColor);
  const edgesAll = [];
  list.forEach(r => (r.coauthors || []).forEach(([b, c]) => { if (r.id < b && byId[b]) edgesAll.push({ source: r.id, target: b, w: c }); }));
  edgesBase.push(...edgesAll);
  const cross = edgesAll.filter(e => byId[e.source].faculty !== byId[e.target].faculty);

  const PTYPE = [['article', 'مقالة مجلة', 'bi-journal-text', '#0b4a66'], ['conf', 'ورقة مؤتمر', 'bi-easel2', '#901d23'], ['chapter', 'فصل كتاب', 'bi-book-half', '#0f766e'],
    ['review', 'مراجعة', 'bi-search', '#6a2fb0'], ['book', 'كتاب', 'bi-book', '#b45309'], ['other', 'أخرى', 'bi-three-dots', '#64748b']];
  app.innerHTML = `
  <section class="rs-section rs-kpis">
    <div class="rs-kpi"><div class="v">${R.n(new Set(edgesAll.flatMap(e => [e.source, e.target])).size)}</div><div class="l"><i class="bi bi-person-check"></i>باحث لديه شريك داخل الجامعة</div></div>
    <div class="rs-kpi navy"><div class="v">${R.n(edgesAll.length)}</div><div class="l"><i class="bi bi-share"></i>ثنائي تعاون</div></div>
    <div class="rs-kpi gold"><div class="v">${R.pct(cross.length / (edgesAll.length || 1))}</div><div class="l"><i class="bi bi-arrow-left-right"></i>تعاون بين كليات مختلفة</div></div>
    <div class="rs-kpi teal"><div class="v">${R.n(R.sum(edgesAll.map(e => e.w)))}</div><div class="l"><i class="bi bi-journal-plus"></i>بحث مشترك (مجموع الثنائيات)</div></div>
  </section>
  <div class="rs-toolbar no-print mb-2">
    <div class="fld grow"><label for="n-q">ابحث عن باحث في الشبكة</label><input id="n-q" class="form-control" type="search" placeholder="اسم الباحث…"></div>
    <div class="fld"><label for="n-fac">الكلية</label><select id="n-fac" class="form-select"><option value="">كل الكليات</option>${facs.map(f => `<option>${R.esc(f)}</option>`).join('')}</select></div>
    <div class="fld"><label for="n-min">أبحاث مشتركة على الأقل</label><select id="n-min" class="form-select"><option>1</option><option selected>2</option><option>3</option><option>5</option></select></div>
    <div class="fld" style="flex:0 1 110px"><label for="n-from"><i class="bi bi-calendar3" style="color:#2b5ea7"></i> من سنة</label><select id="n-from" class="form-select">${yrOpts('')}</select></div>
    <div class="fld" style="flex:0 1 110px"><label for="n-to">إلى سنة</label><select id="n-to" class="form-select">${yrOpts('')}</select></div>
    <div class="fld"><label for="n-size">حجم الدائرة حسب</label><select id="n-size" class="form-select"><option value="works">عدد المنشورات</option><option value="cites">الاستشهادات (Scopus)</option><option value="h">h-index</option><option value="deg">عدد الأبحاث المشتركة</option></select></div>
    <div class="fld grow" style="position:relative"><label for="n-paper"><i class="bi bi-file-earmark-text-fill" style="color:#e9711c"></i> ابحث عن ورقة علمية وأظهر مؤلفيها على الشبكة</label><input id="n-paper" class="form-control" type="search" placeholder="عنوان الورقة أو DOI…" autocomplete="off"><div class="rs-nsugg" id="n-sugg" hidden></div></div>
    <div class="fld"><label class="form-check-label" for="n-cross">&nbsp;</label><div class="form-check mt-1"><input class="form-check-input" type="checkbox" id="n-cross"><label class="form-check-label small" for="n-cross">بين الكليات فقط</label></div></div>
  </div>
  <nav class="rs-tabs no-print" id="n-tabs"><button data-t="graph" class="on"><i class="bi bi-diagram-3-fill"></i> الشبكة</button><button data-t="charts"><i class="bi bi-bar-chart-fill"></i> رسوم بيانية</button><button data-t="people"><i class="bi bi-person-lines-fill"></i> جدول الباحثين</button><button data-t="pairs"><i class="bi bi-people-fill"></i> أقوى الثنائيات</button><button data-t="matrix"><i class="bi bi-grid-3x3-gap-fill"></i> بين الكليات</button></nav>
  <div data-tab="graph"><div class="rs-legend mb-2" id="n-legend">${facs.map(f => `<span data-f="${R.esc(f)}"><i style="background:${R.facColor(f)}"></i>${R.esc(f)}</span>`).join('')}</div>
  <div class="rs-netbar no-print"><div class="st" id="n-stats"></div>
    <div class="btns"><div class="rs-seg me-2" id="n-mode"><button data-m="people" class="on"><i class="bi bi-person-fill"></i> الباحثون</button><button data-m="ring"><i class="bi bi-bullseye"></i> دائري</button><button data-m="fac"><i class="bi bi-bank2"></i> الكليات</button></div><button class="rs-nbtn" id="n-zin" title="تكبير"><i class="bi bi-zoom-in"></i></button><button class="rs-nbtn" id="n-zout" title="تصغير"><i class="bi bi-zoom-out"></i></button><button class="rs-nbtn" id="n-fit" title="ملاءمة الشاشة"><i class="bi bi-arrows-fullscreen"></i></button><button class="rs-nbtn" id="n-lab" title="إظهار كل الأسماء"><i class="bi bi-fonts"></i> الأسماء</button></div></div>
  <div class="rs-netwrap"><div class="rs-net" id="n-box"><svg id="n-svg"></svg><div class="tip" id="n-tip"></div></div>
    <aside class="rs-npanel" id="n-panel"><div class="empty"><i class="bi bi-hand-index-thumb"></i><b>اضغط على أي باحث</b><span>لعرض تفاصيله وكل شركائه هنا، ومرّر الفأرة لرؤية روابطه.</span></div></aside></div>
  <p class="rs-note mt-2"><i class="bi bi-info-circle-fill" style="color:#2b5ea7"></i> حجم الدائرة = عدد المنشورات · سُمك الخط = عدد الأبحاث المشتركة · لون الخط = لون الكلية للتعاون داخلها، ورمادي-أزرق للتعاون بين كليتين · كل كلية في منطقتها · تظهر أسماء الأكثر تعاوناً، ومرّر الفأرة على أي باحث لرؤية شركائه، وانقر لفتح ملفه.</p></div>
  <section class="rs-section rs-grid two" data-tab="charts" hidden>
    <div class="rs-card"><h3><i class="bi bi-trophy-fill"></i>الأكثر تعاوناً داخل الجامعة <small class="fw-normal text-muted">عدد الشركاء</small></h3><div class="rs-chart" style="height:560px"><canvas id="n-ch-top"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-bank2"></i>التعاون حسب الكلية <small class="fw-normal text-muted">داخل الكلية مقابل مع كليات أخرى (أبحاث مشتركة)</small></h3><div class="rs-chart" style="height:560px"><canvas id="n-ch-fac"></canvas></div></div>
  </section>
  <section class="rs-section rs-card" data-tab="people" hidden><h3><i class="bi bi-person-lines-fill"></i>كل الباحثين وشركاؤهم <button class="btn btn-sm btn-rs-o ms-auto" id="n-csv"><i class="bi bi-download"></i> CSV</button></h3>
    <div class="rs-scroll" style="max-height:75vh"><table class="rs-table" id="n-people"></table></div></section>
  <section class="rs-section np-wrap" data-tab="pairs" hidden>
    <div class="rs-card np-list"><h3><i class="bi bi-people"></i>أقوى ثنائيات التعاون <small class="fw-normal text-muted" id="np-sub"></small></h3>
      <div class="np-key">${PTYPE.map(t => `<span><i style="background:${t[3]}"></i>${t[1]}</span>`).join('')}</div><div class="rs-scroll np-scroll"><table class="rs-table np-t" id="np-t"></table></div></div>
    <aside class="rs-card np-det" id="np-det"><div class="rs-empty"><i class="bi bi-hourglass-split"></i> جارٍ تحميل المنشورات…</div></aside>
  </section>
  <section class="rs-section" data-tab="matrix" hidden>
    <div class="rs-card" data-tab="matrix"><h3><i class="bi bi-grid-3x3"></i>مصفوفة التعاون بين الكليات <small class="fw-normal text-muted">عدد الأبحاث المشتركة · الأغمق = أكثر</small></h3><div class="rs-scroll" id="n-matrix"></div></div>
  </section>`;

  // faculty × faculty matrix
  const M = {}; edgesAll.forEach(e => { const a = byId[e.source].faculty, b = byId[e.target].faculty; const k = [a, b].sort().join('|'); M[k] = (M[k] || 0) + e.w; });
  const mx = Math.max(1, ...Object.values(M));
  const short = f => f.replace(/^كلية\s+/, '').split(/\s+/).slice(0, 2).join(' ');
  R.$('#n-matrix').innerHTML = `<table class="rs-table"><thead><tr><th></th>${facs.map(f => `<th class="num" title="${R.esc(f)}"><small>${R.esc(short(f))}</small></th>`).join('')}</tr></thead><tbody>${facs.map(a => `<tr><td><small>${R.esc(short(a))}</small></td>${facs.map(b => { const v = M[[a, b].sort().join('|')] || 0; return `<td class="num" style="background:${v ? R.alpha('#901d23', .1 + .8 * v / mx) : 'transparent'};color:${v / mx > .5 ? '#fff' : 'inherit'}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;

  // per-researcher summary
  const P = {}; edgesAll.forEach(e => [[e.source, e.target], [e.target, e.source]].forEach(([a, b]) => { const p = P[a] = P[a] || { n: 0, w: 0, x: 0 }; p.n++; p.w += e.w; if (byId[a].faculty !== byId[b].faculty) p.x++; }));
  const PL = Object.entries(P).map(([id, p]) => Object.assign({ r: byId[id] }, p)).sort((a, b) => b.n - a.n || b.w - a.w);
  R.$('#n-people').innerHTML = `<thead><tr><th>#</th><th>الباحث</th><th>الكلية</th><th class="num">الشركاء</th><th class="num">أبحاث مشتركة</th><th class="num">شركاء من كليات أخرى</th><th class="num">منشوراته</th></tr></thead><tbody>${PL.map((p, i) => `<tr><td class="num">${i + 1}</td><td><a class="d-flex align-items-center gap-2 text-decoration-none" href="${R.profileUrl(p.r)}">${R.avatar(p.r, 'sm')}<b style="color:#901d23">${R.esc(p.r.name)}</b></a></td><td><span class="rs-fdot" style="--fc:${R.facColor(p.r.faculty)}">${R.esc(p.r.faculty)}</span></td><td class="num"><span class="pill bl">${p.n}</span></td><td class="num"><span class="pill qg">${p.w}</span></td><td class="num">${p.x ? `<span class="pill or">${p.x}</span>` : '–'}</td><td class="num">${R.n(p.r.works)}</td></tr>`).join('')}</tbody>`;
  R.$('#n-csv').onclick = () => R.csv(PL.map(p => ({ name: p.r.name, faculty: p.r.faculty, dept: p.r.dept, partners: p.n, joint_papers: p.w, cross_faculty_partners: p.x, publications: p.r.works })), 'uop-collaboration.csv');

  // ---------------------------------------------------------------- strongest pairs: period, venues and publication types
  const PT = Object.fromEntries(PTYPE.map(x => [x[0], x]));
  const ptype = w => { const t = String(w.type || '').toLowerCase(), st = String(w.st || '').toLowerCase();
    if (/conference|proceeding/.test(t) || /conference/.test(st) || w.vt === 'conference') return 'conf';
    if (/chapter/.test(t)) return 'chapter'; if (t === 'book') return 'book'; if (t === 'review' || st === 'review') return 'review';
    if (t === 'article' || /article/.test(st)) return 'article'; return 'other'; };
  let PW = null, pairSel = null;
  const pkey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  async function pairWorks() {
    if (PW) return PW;
    let W = []; try { W = (await R.load('works')).works || []; } catch (e) { /* no publications file: the table still works */ }
    PW = {};
    W.forEach(w => { const rs = [...new Set(w.r || [])].filter(id => byId[id]); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) (PW[pkey(rs[i], rs[j])] = PW[pkey(rs[i], rs[j])] || []).push(w); });
    return PW;
  }
  const yrRange = () => [+R.$('#n-from').value || 0, +R.$('#n-to').value || 9999];
  const worksOf = e => { const [a, b] = yrRange(); return ((PW || {})[pkey(e.source, e.target)] || []).filter(w => !w.y || (w.y >= a && w.y <= b)).sort((x, y) => (y.y || 0) - (x.y || 0)); };
  const span = ws => { const ys = ws.map(w => w.y).filter(Boolean); return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; };
  function pairRows() {
    const fac = R.$('#n-fac').value, min = +R.$('#n-min').value, crossOnly = R.$('#n-cross').checked, q = R.norm(R.$('#n-q').value);
    return edgesAll.filter(e => e.w >= min && (!fac || byId[e.source].faculty === fac || byId[e.target].faculty === fac)
      && (!crossOnly || byId[e.source].faculty !== byId[e.target].faculty) && (!q || R.norm(byId[e.source].name + ' ' + byId[e.target].name).includes(q)))
      .sort((a, b) => b.w - a.w).slice(0, 80);
  }
  const who = r => `<a href="${R.profileUrl(r)}" class="np-n">${R.esc(r.name)}</a><span class="rs-fdot" style="--fc:${R.facColor(r.faculty)}">${R.esc(r.faculty)}</span>`;
  async function pairs() {
    const rows = pairRows(), [a, b] = yrRange();
    R.$('#np-sub').textContent = `${R.n(rows.length)} ثنائياً${a || b !== 9999 ? ` · ${a || '…'}–${b === 9999 ? Y : b}` : ''} · اضغط صفاً لعرض تفاصيله`;
    const head = `<thead><tr><th>الباحث</th><th></th><th>الشريك</th><th class="num">أبحاث</th><th>الفترة</th><th>الأنواع</th></tr></thead>`;
    const body = () => rows.map((e, i) => { const ws = PW ? worksOf(e) : null, sp = ws && span(ws), tc = {};
      (ws || []).forEach(w => { const k = ptype(w); tc[k] = (tc[k] || 0) + 1; });
      return `<tr data-i="${i}" class="${pairSel === pkey(e.source, e.target) ? 'on' : ''}"><td>${who(byId[e.source])}</td><td class="np-ar"><i class="bi bi-arrow-left-right"></i></td><td>${who(byId[e.target])}</td>
        <td class="num"><span class="pill qg">${e.w}</span></td>
        <td class="np-per">${ws == null ? '<span class="text-muted">…</span>' : sp ? `<b dir="ltr">${sp[0] === sp[1] ? sp[0] : sp[0] + '–' + sp[1]}</b><small>${sp[1] - sp[0] + 1} ${sp[1] - sp[0] + 1 > 10 ? 'سنة' : (sp[1] - sp[0] + 1 > 2 ? 'سنوات' : (sp[1] === sp[0] ? 'سنة' : 'سنتان'))}</small>` : '<span class="text-muted">–</span>'}</td>
        <td><span class="np-mini">${PTYPE.filter(t => tc[t[0]]).map(t => `<i style="flex:${tc[t[0]]};background:${t[3]}" title="${t[1]}: ${tc[t[0]]}"></i>`).join('')}</span></td></tr>`; }).join('');
    R.$('#np-t').innerHTML = head + `<tbody>${body()}</tbody>`;
    R.$('#np-t').onclick = ev => { if (ev.target.closest('a')) return; const tr = ev.target.closest('tr[data-i]'); if (!tr) return; pairSel = pkey(rows[+tr.dataset.i].source, rows[+tr.dataset.i].target); R.$$('#np-t tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); detail(rows[+tr.dataset.i]); if (innerWidth < 1100) R.$('#np-det').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if (!rows.length) { R.$('#np-t').innerHTML = '<tbody><tr><td class="rs-empty">لا ثنائيات بهذه الشروط.</td></tr></tbody>'; R.$('#np-det').innerHTML = ''; return; }
    if (!PW) { await pairWorks(); return pairs(); }
    const cur = rows.find(e => pkey(e.source, e.target) === pairSel) || rows[0];
    pairSel = pkey(cur.source, cur.target); R.$$('#np-t tr').forEach(tr => tr.classList.toggle('on', tr.dataset.i != null && rows[+tr.dataset.i] === cur));
    detail(cur);
  }
  function detail(e) {
    const tb = document.querySelector('.uop-topbar'); R.$('#np-det').style.top = ((tb && getComputedStyle(tb).position === 'sticky' ? tb.offsetHeight : 0) + 12) + 'px';
    const A = byId[e.source], B = byId[e.target], ws = worksOf(e), sp = span(ws);
    const tc = {}; ws.forEach(w => { const k = ptype(w); tc[k] = (tc[k] || 0) + 1; });
    const vc = {}; ws.forEach(w => { if (!w.v) return; const o = vc[w.v] = vc[w.v] || { v: w.v, n: 0, k: ptype(w), q: w.q }; o.n++; if (w.q && (!o.q || w.q < o.q)) o.q = w.q; });
    const venues = Object.values(vc).sort((x, y) => y.n - x.n), vmax = Math.max(1, ...venues.map(v => v.n));
    const yc = {}; ws.forEach(w => { if (w.y) yc[w.y] = (yc[w.y] || 0) + 1; });
    const ys = sp ? Array.from({ length: sp[1] - sp[0] + 1 }, (_, i) => sp[0] + i) : [], ymax = Math.max(1, ...Object.values(yc));
    const n = ws.length;
    R.$('#np-det').innerHTML = `
      <div class="np-hd"><div class="np-who">${R.avatar(A, 'sm')}<div>${who(A)}</div></div><span class="np-x"><i class="bi bi-arrow-left-right"></i></span><div class="np-who">${R.avatar(B, 'sm')}<div>${who(B)}</div></div></div>
      <div class="np-kp">
        <div><b>${R.n(e.w)}</b><span>بحثاً مشتركاً</span></div>
        <div><b dir="ltr">${sp ? (sp[0] === sp[1] ? sp[0] : `${sp[0]}–${sp[1]}`) : '–'}</b><span>الفترة${sp ? ` · ${sp[1] - sp[0] + 1} سنة` : ''}</span></div>
        <div><b>${R.n(venues.length)}</b><span>مجلة / مؤتمر</span></div>
        <div><b>${R.n(R.sum(ws.map(w => w.sc ?? w.c ?? 0)))}</b><span>استشهاداً</span></div>
      </div>
      ${n ? `<div class="np-sec"><h4><i class="bi bi-pie-chart"></i> نوع النشر</h4>
        <div class="np-bar">${PTYPE.filter(t => tc[t[0]]).map(t => `<i style="flex:${tc[t[0]]};background:${t[3]}" title="${t[1]}: ${tc[t[0]]}">${tc[t[0]] / n > .12 ? tc[t[0]] : ''}</i>`).join('')}</div>
        <div class="np-leg">${PTYPE.filter(t => tc[t[0]]).map(t => `<span><i class="bi ${t[2]}" style="color:${t[3]}"></i>${t[1]} <b>${tc[t[0]]}</b></span>`).join('')}</div></div>
      ${ys.length > 1 ? `<div class="np-sec"><h4><i class="bi bi-calendar3"></i> عبر السنوات</h4><div class="np-yrs">${ys.map(y => `<div title="${y}: ${yc[y] || 0}"><i style="height:${Math.round(100 * (yc[y] || 0) / ymax)}%"></i><small>${(y === ys[0] || y === ys[ys.length - 1]) ? y : (ys.length <= 12 ? String(y).slice(2) : '')}</small></div>`).join('')}</div></div>` : ''}
      <div class="np-sec"><h4><i class="bi bi-journal-bookmark"></i> المجلات والمؤتمرات</h4><ul class="np-ven">${venues.slice(0, 8).map(v => `<li><i class="bi ${PT[v.k][2]}" style="color:${PT[v.k][3]}" title="${PT[v.k][1]}"></i><span class="ltr" dir="ltr" title="${R.esc(v.v)}">${R.esc(v.v)}</span>${v.q ? R.qTag(v.q) : ''}<span class="np-vb"><i style="width:${Math.round(100 * v.n / vmax)}%"></i></span><b>${v.n}</b></li>`).join('') || '<li class="text-muted">لا أسماء مجلات في البيانات</li>'}</ul>${venues.length > 8 ? `<small class="text-muted">و${R.n(venues.length - 8)} أخرى</small>` : ''}</div>
      <div class="np-sec"><h4><i class="bi bi-files"></i> الأبحاث المشتركة <small class="text-muted fw-normal">${R.n(n)}</small></h4><ol class="np-papers">${ws.slice(0, 40).map(w => { const t = PT[ptype(w)]; return `<li><span class="y">${w.y || '–'}</span><div><a class="ltr" dir="auto" href="${R.docUrl(w)}">${R.esc(w.t)}</a><div class="m"><span class="np-tp" style="--c:${t[3]}"><i class="bi ${t[2]}"></i>${t[1]}</span>${R.qTag(w.q)}${w.v ? `<span class="ltr" dir="ltr">${R.esc(w.v)}</span>` : ''}</div></div></li>`; }).join('')}</ol>${n > 40 ? `<small class="text-muted">أول 40 من ${R.n(n)}</small>` : ''}</div>`
      : '<div class="rs-empty mt-3"><i class="bi bi-info-circle"></i> لم نجد تفاصيل هذه الأبحاث في قاعدة المنشورات ضمن الفترة المختارة.</div>'}
      ${n && n !== e.w ? `<p class="rs-note mb-0 mt-2"><i class="bi bi-info-circle"></i> العدد ${R.n(e.w)} من بيانات المؤلفين المشاركين، والتفاصيل أعلاه لـ ${R.n(n)} منشوراً وُجدت في قاعدة المنشورات.</p>` : ''}
      <div class="np-acts"><a class="btn btn-sm btn-rs-o" href="compare.html?ids=${e.source},${e.target}"><i class="bi bi-intersect"></i> قارن الباحثَين</a></div>`;
  }
  ['#n-fac', '#n-min', '#n-cross'].forEach(s => R.$(s).addEventListener('change', () => { if (!R.$('[data-tab="pairs"]').hidden) pairs(); }));
  R.$('#n-q').addEventListener('input', R.debounce(() => { if (!R.$('[data-tab="pairs"]').hidden) pairs(); }, 300));
  let chartsDone = false;
  function charts() {
    if (chartsDone) return; chartsDone = true;
    const top = PL.slice(0, 20);
    R.chart('n-ch-top', { type: 'bar', data: { labels: top.map(p => p.r.name.replace(/^(أ\.?\s*د\.?|د\.|أ\.)\s*/, '')), datasets: [{ label: 'شركاء', data: top.map(p => p.n), backgroundColor: top.map(p => R.facColor(p.r.faculty)), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => `${top[c.dataIndex].w} بحث مشترك · ${top[c.dataIndex].r.faculty}` } } }, scales: { y: { ticks: { autoSkip: false, font: { size: 12 } } } } } });
    const F = {}; facs.forEach(f => F[f] = { in: 0, out: 0 }); edgesAll.forEach(e => { const a = byId[e.source].faculty, b = byId[e.target].faculty; if (a === b) F[a].in += e.w; else { F[a].out += e.w; F[b].out += e.w; } });
    const fl = facs.filter(f => F[f].in + F[f].out).sort((a, b) => (F[b].in + F[b].out) - (F[a].in + F[a].out));
    R.chart('n-ch-fac', { type: 'bar', data: { labels: fl, datasets: [{ label: 'داخل الكلية', data: fl.map(f => F[f].in), backgroundColor: '#901d23' }, { label: 'مع كليات أخرى', data: fl.map(f => F[f].out), backgroundColor: '#1f6f78', borderRadius: 4 }] }, options: { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 12 } } } }, plugins: { legend: { position: 'top' } } } });
  }
  R.onPrint(charts);
  R.$('#n-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t;
    R.$$('#n-tabs button').forEach(x => x.classList.toggle('on', x === b));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = !el.dataset.tab.split(' ').includes(t); });
    if (t === 'charts') charts(); if (t === 'graph') draw(); if (t === 'pairs') pairs(); });
  if (!window.d3) { R.$('#n-box').innerHTML = '<div class="rs-empty">تعذّر تحميل مكتبة الرسم</div>'; return; }
  const svg = d3.select('#n-svg'), tip = R.$('#n-tip');
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([.2, 6]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  let labelsAll = false;
  function fit(N, W, H, rad) {
    const xs = N.map(d => d.x), ys = N.map(d => d.y), pad = 70;
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); const qq = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
    const lo = N.length > 40 ? .02 : 0, hi = 1 - lo;
    const x0 = qq(xs, lo) - pad, x1 = qq(xs, hi) + pad, y0 = qq(ys, lo) - pad, y1 = qq(ys, hi) + pad + 16;
    const k = Math.min(2, .95 * Math.min(W / (x1 - x0), H / (y1 - y0)));
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }
  const hidden = new Set();
  let sim;

  let mode = 'people', sel = null;
  function draw() {
    if (mode === 'fac') return drawFac();
    if (mode === 'ring') return drawRing();
    const fac = R.$('#n-fac').value, min = +R.$('#n-min').value, crossOnly = R.$('#n-cross').checked;
    const E = edgesAll.filter(e => e.w >= min && (!crossOnly || byId[e.source].faculty !== byId[e.target].faculty) &&
      !hidden.has(byId[e.source].faculty) && !hidden.has(byId[e.target].faculty) &&
      (!fac || byId[e.source].faculty === fac || byId[e.target].faculty === fac)).map(e => Object.assign({}, e));
    const ids = new Set(E.flatMap(e => [e.source, e.target]));
    const N = [...ids].map(id => ({ id, r: byId[id] }));
    const box = R.$('#n-box').getBoundingClientRect(), W = box.width, H = box.height;
    g.selectAll('*').remove();
    if (sim) sim.stop();
    if (!N.length) { g.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle').attr('fill', '#888').text('لا توجد روابط بهذه الشروط'); return; }
    const deg = {}; E.forEach(e => { deg[e.source] = (deg[e.source] || 0) + e.w; deg[e.target] = (deg[e.target] || 0) + e.w; });
    const sk = R.$('#n-size').value, sv = d => sk === 'cites' ? cites(d.r) : sk === 'h' ? ((d.r.sc || {}).h || d.r.h || 0) : sk === 'deg' ? (deg[d.id] || 0) : (d.r.works || 0);
    const maxW = Math.max(1, ...N.map(sv));
    const rad = d => 11 + 15 * Math.sqrt((sv(d) || 0) / maxW);
    const q = R.norm(R.$('#n-q').value);
    const hit = d => q && d.r._q.includes(q);
    const topIds = new Set(N.slice().sort((a, b) => (deg[b.id] || 0) - (deg[a.id] || 0)).slice(0, labelsAll ? N.length : Math.min(30, Math.ceil(N.length * .35))).map(d => d.id));
    const short = d => d.r.name.replace(/^(أ\.?\s*د\.?|د\.|أ\.|م\.)\s*/, '').split(/\s+/).slice(0, 2).join(' ');
    const byIdF = l => { const a = l.source.r || byId[l.source], b = l.target.r || byId[l.target]; return a.faculty === b.faculty; };
    const mw = Math.max(1, ...E.map(e => e.w));
    const hullG = g.append('g');
    const link = g.append('g').attr('fill', 'none').selectAll('path').data(E).join('path')
      .attr('stroke', e => byId[e.source].faculty === byId[e.target].faculty ? R.facColor(byId[e.source].faculty) : '#7d8f99')
      .attr('stroke-opacity', d => d.w >= 3 ? .55 : d.w === 2 ? .35 : .18).attr('stroke-width', d => .8 + 5 * Math.sqrt(d.w / mw)).attr('stroke-linecap', 'round');
    link.append('title').text(e => `${byId[e.source].name} ↔ ${byId[e.target].name}: ${e.w} بحث مشترك${e.y0 ? ` (${e.y0 === e.y1 ? e.y0 : e.y0 + '–' + e.y1})` : ''}`);
    const node = g.append('g').selectAll('g').data(N).join('g').style('cursor', 'pointer');
    node.append('circle').attr('r', rad).attr('fill', d => R.facColor(d.r.faculty)).attr('fill-opacity', .92)
      .attr('stroke', d => hit(d) ? '#ffd34d' : '#fff').attr('stroke-width', d => hit(d) ? 5 : 2);
    node.filter(d => !d.r.photo).append('text').attr('class', 'rs-nini').attr('dy', 4).attr('text-anchor', 'middle').text(d => short(d).split(' ').map(x => x[0] || '').join(' ')).style('font-size', d => Math.max(8, rad(d) * .55) + 'px');
    node.filter(d => d.r.photo).append('clipPath').attr('id', d => 'cp' + d.id).append('circle').attr('r', d => rad(d) - 2);
    node.filter(d => d.r.photo).append('image').attr('href', d => d.r.photo).attr('x', d => -rad(d) + 2).attr('y', d => -rad(d) + 2).attr('width', d => 2 * rad(d) - 4).attr('height', d => 2 * rad(d) - 4).attr('clip-path', d => `url(#cp${d.id})`).attr('preserveAspectRatio', 'xMidYMid slice').style('pointer-events', 'none');
    const lab = node.append('text').attr('class', 'rs-nlab').attr('text-anchor', 'middle').style('display', d => topIds.has(d.id) || hit(d) ? null : 'none');
    lab.append('tspan').attr('x', 0).attr('dy', d => rad(d) + 14).text(short);
    lab.append('tspan').attr('class', 'sub').attr('x', 0).attr('dy', 13).text(d => `${R.n(cites(d.r))} استشهاد · h ${(d.r.sc || {}).h || d.r.h || 0}`);
    const nb = {}; E.forEach(e => { (nb[e.source] = nb[e.source] || new Set()).add(e.target); (nb[e.target] = nb[e.target] || new Set()).add(e.source); });
    node.on('mouseenter', (ev, d) => {
      const on = o => o.id === d.id || (nb[d.id] && nb[d.id].has(o.id));
      node.style('opacity', o => on(o) ? 1 : .12);
      lab.style('display', o => on(o) ? null : 'none');
      link.attr('stroke-opacity', l => l.source.id === d.id || l.target.id === d.id ? .9 : .04);
      tip.style.display = 'flex';
      tip.innerHTML = `<b>${R.esc(d.r.name)}</b><span class="f" style="--fc:${R.facColor(d.r.faculty)}">${R.esc(d.r.faculty)}</span><small>${R.esc(d.r.dept)}</small><div class="nn"><span><b>${d.r.works}</b> منشور</span><span><b>${R.n(cites(d.r))}</b> استشهاد</span><span><b>${(d.r.sc || {}).h || d.r.h}</b> h</span><span><b>${(nb[d.id] || new Set()).size}</b> شريك</span><span><b>${deg[d.id] || 0}</b> بحث مشترك</span></div>`;
    }).on('mousemove', ev => { const b = R.$('#n-box').getBoundingClientRect(); tip.style.left = Math.min(b.width - 250, ev.clientX - b.left + 14) + 'px'; tip.style.top = (ev.clientY - b.top + 14) + 'px'; })
      .on('mouseleave', () => { node.style('opacity', 1); lab.style('display', d => topIds.has(d.id) || hit(d) ? null : 'none'); link.attr('stroke-opacity', d => d.w >= 3 ? .55 : d.w === 2 ? .35 : .18); tip.style.display = 'none'; })
      .on('click', (ev, d) => { if (ev.defaultPrevented) return; ev.stopPropagation(); showPanel(d, nb, E); });
    // same-faculty links straight and short; links between faculties curved so they read as bridges
    const curve = d => { const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y; if (d.source.r.faculty === d.target.r.faculty) return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`; const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`; };
    const tick = () => { link.attr('d', curve); node.attr('transform', d => `translate(${d.x},${d.y})`); };
    // each faculty gets its own area around a circle: groups stay apart and links between faculties stand out
    const FL = [...new Set(N.map(d => d.r.faculty))].sort((a, b) => N.filter(d => d.r.faculty === b).length - N.filter(d => d.r.faculty === a).length);
    const RR = Math.max(320, Math.sqrt(N.length) * 78), FC = {};
    FL.forEach((f, i) => { const a = 2 * Math.PI * i / FL.length - Math.PI / 2; FC[f] = FL.length === 1 ? { x: W / 2, y: H / 2 } : { x: W / 2 + RR * Math.cos(a), y: H / 2 + RR * .75 * Math.sin(a) }; });
    sim = d3.forceSimulation(N).force('link', d3.forceLink(E).id(d => d.id).distance(l => 50 + 40 / Math.sqrt(l.w)).strength(l => byIdF(l) ? .3 : .04))
      .force('charge', d3.forceManyBody().strength(d => -230 - 14 * rad(d)))
      .force('collide', d3.forceCollide().radius(d => rad(d) + (topIds.has(d.id) ? 18 : 6)).iterations(3))
      .force('x', d3.forceX(d => FC[d.r.faculty].x).strength(.2)).force('y', d3.forceY(d => FC[d.r.faculty].y).strength(.2)).stop();
    for (let k = 0; k < 400; k++) sim.tick();   // settle before showing: no jumping
    const hulls = () => { hullG.selectAll('*').remove(); if (FL.length < 2) return; FL.forEach(f => { const pts = []; N.filter(d => d.r.faculty === f).forEach(d => { const r = rad(d) + 22; for (let a = 0; a < 6.28; a += .79) pts.push([d.x + r * Math.cos(a), d.y + r * Math.sin(a)]); }); const h = d3.polygonHull(pts); if (h) hullG.append('path').attr('d', d3.line().curve(d3.curveCatmullRomClosed)(h)).attr('fill', R.facColor(f)).attr('fill-opacity', .07).attr('stroke', R.facColor(f)).attr('stroke-opacity', .35).attr('stroke-width', 1.5).attr('stroke-dasharray', '6 4'); }); };
    hulls();
    if (FL.length > 1) g.insert('g', ':first-child').selectAll('text').data(FL).join('text').attr('class', 'rs-nfac')
      .attr('x', f => { const ns = N.filter(d => d.r.faculty === f); return d3.mean(ns, d => d.x); })
      .attr('y', f => { const ns = N.filter(d => d.r.faculty === f); return d3.min(ns, d => d.y - rad(d)) - 32; })
      .attr('text-anchor', 'middle').attr('fill', f => R.facColor(f)).text(f => f);
    tick(); fit(N, W, H, rad);
    sim.on('tick', tick);
    node.call(d3.drag().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; }).on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; hulls(); }));
    svg.on('click', () => { node.style('opacity', 1); link.attr('stroke-opacity', d => d.w >= 3 ? .55 : d.w === 2 ? .35 : .18); });
    // joint-paper counts on links of the hovered researcher
    const llab = g.append('g');
    node.on('mouseenter.cnt', (ev, d) => { llab.selectAll('*').remove(); E.filter(l => l.source.id === d.id || l.target.id === d.id).forEach(l => { const x = (l.source.x + l.target.x) / 2, y = (l.source.y + l.target.y) / 2; llab.append('circle').attr('cx', x).attr('cy', y).attr('r', 10).attr('fill', '#091b22'); llab.append('text').attr('x', x).attr('y', y + 4).attr('text-anchor', 'middle').attr('fill', '#ffd34d').attr('font-size', 11).attr('font-weight', 800).text(l.w); }); })
      .on('mouseleave.cnt', () => llab.selectAll('*').remove());
    R.$('#n-stats').innerHTML = `<span><i class="bi bi-person-circle"></i> <b>${N.length}</b> باحث</span><span><i class="bi bi-share-fill"></i> <b>${E.length}</b> رابط تعاون</span><span><i class="bi bi-journal-text"></i> <b>${E.reduce((t, e) => t + e.w, 0)}</b> بحث مشترك</span><span><i class="bi bi-arrow-left-right"></i> <b>${E.filter(e => e.source.r.faculty !== e.target.r.faculty).length}</b> بين كليات</span>`;
    if (paper) { const A = new Set(paper.r || []); node.style('opacity', d => A.has(d.id) ? 1 : .12); node.select('circle').attr('stroke', d => A.has(d.id) ? '#e9711c' : '#fff').attr('stroke-width', d => A.has(d.id) ? 6 : 2);
      lab.style('display', d => A.has(d.id) ? null : 'none'); link.attr('stroke-opacity', l => A.has(l.source.id) && A.has(l.target.id) ? .95 : .03).attr('stroke', l => A.has(l.source.id) && A.has(l.target.id) ? '#e9711c' : null);
      const f = N.filter(d => A.has(d.id)); if (f.length) { const cx = d3.mean(f, d => d.x), cy = d3.mean(f, d => d.y); svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(1.4).translate(-cx, -cy)); }
      else R.$('#n-stats').insertAdjacentHTML('beforeend', '<span style="color:#a02a1c"><i class="bi bi-info-circle"></i> مؤلفو هذه الورقة ليس لهم روابط تعاون أخرى على الشبكة</span>'); }
    if (q) { const f = N.filter(hit); if (f.length) { const d = f[0]; svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(2).translate(-d.x, -d.y)); } }
  }
  function showPanel(d, nb, E) {
    const ps = E.filter(l => l.source.id === d.id || l.target.id === d.id).map(l => ({ r: (l.source.id === d.id ? l.target : l.source).r, w: l.w })).sort((a, b) => b.w - a.w);
    const xf = ps.filter(p => p.r.faculty !== d.r.faculty).length;
    R.$('#n-panel').innerHTML = `<div class="hd">${R.avatar(d.r)}<div><b>${R.esc(d.r.name)}</b><span class="rs-fdot" style="--fc:${R.facColor(d.r.faculty)}">${R.esc(d.r.faculty)}</span><small>${R.esc(d.r.dept || '')}</small></div></div>
      <div class="nums five"><div><b>${R.n(d.r.works)}</b><span>منشور</span></div><div><b>${R.n(cites(d.r))}</b><span>استشهاد</span></div><div><b>${(d.r.sc || {}).h || d.r.h || 0}</b><span>h-index</span></div><div><b>${ps.length}</b><span>شريك</span></div><div><b>${xf}</b><span>من كليات أخرى</span></div></div>
      <div class="btns"><a class="btn btn-sm btn-rs" href="${R.profileUrl(d.r)}"><i class="bi bi-person-badge"></i> الملف</a><a class="btn btn-sm btn-rs-o" href="compare.html?ids=${[d.id, ...ps.slice(0, 3).map(p => p.r.id)].join(',')}"><i class="bi bi-intersect"></i> قارن مع أقوى شركائه</a></div>
      <div class="lst-h"><i class="bi bi-people-fill"></i> الشركاء وعدد الأبحاث المشتركة</div>
      <div class="lst">${ps.map(p => `<a href="${R.profileUrl(p.r)}"><span class="rs-fdot" style="--fc:${R.facColor(p.r.faculty)}"></span><span class="n">${R.esc(p.r.name)}</span><span class="w">${p.w}</span></a>`).join('')}</div>`;
  }
  // radial view: every researcher on a circle grouped by faculty, links bundled through the centre
  function drawRing() {
    const box = R.$('#n-box').getBoundingClientRect(), W = box.width, H = box.height;
    g.selectAll('*').remove(); if (sim) sim.stop();
    const fac = R.$('#n-fac').value, min = +R.$('#n-min').value, crossOnly = R.$('#n-cross').checked;
    const E = edgesAll.filter(e => e.w >= min && (!crossOnly || byId[e.source].faculty !== byId[e.target].faculty) && !hidden.has(byId[e.source].faculty) && !hidden.has(byId[e.target].faculty) && (!fac || byId[e.source].faculty === fac || byId[e.target].faculty === fac));
    const deg = {}; E.forEach(e => { deg[e.source] = (deg[e.source] || 0) + e.w; deg[e.target] = (deg[e.target] || 0) + e.w; });
    const N = Object.keys(deg).map(id => byId[id]).sort((a, b) => a.faculty.localeCompare(b.faculty, 'ar') || deg[b.id] - deg[a.id]);
    if (!N.length) return;
    const RR = Math.min(W, H) / 2 - 130, cx = W / 2, cy = H / 2, gap = .04, facs2 = [...new Set(N.map(r => r.faculty))];
    const step = (2 * Math.PI - gap * facs2.length) / N.length; let a = -Math.PI / 2; const P = {};
    facs2.forEach(f => { const s0 = a; N.filter(r => r.faculty === f).forEach(r => { P[r.id] = a + step / 2; a += step; });
      const s1 = a; g.append('path').attr('d', d3.arc()({ innerRadius: RR + 6, outerRadius: RR + 16, startAngle: s0 + Math.PI / 2, endAngle: s1 + Math.PI / 2 })).attr('transform', `translate(${cx},${cy})`).attr('fill', R.facColor(f)).append('title').text(f);
      a += gap; });
    const pt = (id, r) => [cx + r * Math.cos(P[id]), cy + r * Math.sin(P[id])];
    const mw = Math.max(1, ...E.map(e => e.w));
    const lk = g.append('g').attr('fill', 'none').selectAll('path').data(E).join('path')
      .attr('d', e => { const [x1, y1] = pt(e.source, RR), [x2, y2] = pt(e.target, RR); return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`; })
      .attr('stroke', e => byId[e.source].faculty === byId[e.target].faculty ? R.facColor(byId[e.source].faculty) : '#7d8f99')
      .attr('stroke-opacity', .35).attr('stroke-width', e => .7 + 4 * Math.sqrt(e.w / mw));
    const nd = g.append('g').selectAll('g').data(N).join('g').attr('transform', r => `translate(${pt(r.id, RR)})`).style('cursor', 'pointer');
    nd.append('circle').attr('r', r => 3 + 4 * Math.sqrt(deg[r.id] / Math.max(...Object.values(deg)))).attr('fill', r => R.facColor(r.faculty)).attr('stroke', '#fff');
    nd.append('text').attr('class', 'rs-nlab').style('font-size', N.length > 120 ? '9px' : '11px').attr('dy', 4).attr('direction', 'ltr').style('direction', 'ltr')
      .attr('transform', r => { const d = P[r.id] * 180 / Math.PI, flip = Math.cos(P[r.id]) < 0; return `rotate(${flip ? d + 180 : d}) translate(${flip ? -24 : 24},0)`; })
      .attr('text-anchor', r => Math.cos(P[r.id]) < 0 ? 'end' : 'start').text(r => r.name.replace(/^(أ\.?\s*د\.?|د\.|أ\.|م\.)\s*/, '').split(/\s+/).slice(0, 2).join(' '));
    nd.on('mouseenter', (ev, r) => { lk.attr('stroke-opacity', e => e.source === r.id || e.target === r.id ? .9 : .04); nd.style('opacity', o => o.id === r.id || E.some(e => (e.source === r.id && e.target === o.id) || (e.target === r.id && e.source === o.id)) ? 1 : .2); })
      .on('mouseleave', () => { lk.attr('stroke-opacity', .35); nd.style('opacity', 1); })
      .on('click', (ev, r) => { ev.stopPropagation(); const nb = {}; const EE = E.map(e => ({ source: { id: e.source, r: byId[e.source] }, target: { id: e.target, r: byId[e.target] }, w: e.w })); showPanel({ id: r.id, r }, nb, EE); });
    svg.call(zoom.transform, d3.zoomIdentity);
    R.$('#n-stats').innerHTML = `<span><i class="bi bi-person-circle"></i> <b>${N.length}</b> باحث</span><span><i class="bi bi-share-fill"></i> <b>${E.length}</b> رابط</span><span><i class="bi bi-bullseye"></i> القوس الملوّن = الكلية · مرّر الفأرة على اسم</span>`;
  }
  function drawFac() {
    const box = R.$('#n-box').getBoundingClientRect(), W = box.width, H = box.height;
    g.selectAll('*').remove(); if (sim) sim.stop();
    const F = {}, L = {};
    list.forEach(r => { if (r.faculty && !hidden.has(r.faculty)) F[r.faculty] = F[r.faculty] || { f: r.faculty, n: 0, in: 0, people: new Set() }; });
    edgesAll.forEach(e => { const a = byId[e.source].faculty, b = byId[e.target].faculty; if (!F[a] || !F[b]) return; F[a].people.add(e.source); F[b].people.add(e.target); if (a === b) F[a].in += e.w; else { const k = [a, b].sort().join('|'); L[k] = (L[k] || 0) + e.w; } });
    const N = Object.values(F).filter(f => f.people.size), mx = Math.max(1, ...N.map(f => f.people.size)), lm = Math.max(1, ...Object.values(L));
    const rad = f => 26 + 34 * Math.sqrt(f.people.size / mx);
    N.forEach((f, i) => { const a = 2 * Math.PI * i / N.length - Math.PI / 2, R0 = Math.min(W, H) * .36; f.x = W / 2 + R0 * 1.3 * Math.cos(a); f.y = H / 2 + R0 * Math.sin(a); });
    const byF = Object.fromEntries(N.map(f => [f.f, f]));
    const E = Object.entries(L).map(([k, w]) => { const [a, b] = k.split('|'); return { a: byF[a], b: byF[b], w }; }).filter(e => e.a && e.b);
    const lg = g.append('g');
    E.forEach(e => { const mx2 = (e.a.x + e.b.x) / 2 + (H / 2 - (e.a.y + e.b.y) / 2) * .25, my2 = (e.a.y + e.b.y) / 2 + ((e.a.x + e.b.x) / 2 - W / 2) * .25;
      lg.append('path').attr('d', `M${e.a.x},${e.a.y}Q${(e.a.x + e.b.x) / 2},${(e.a.y + e.b.y) / 2} ${e.b.x},${e.b.y}`).attr('fill', 'none').attr('stroke', '#7d8f99').attr('stroke-opacity', .25 + .6 * e.w / lm).attr('stroke-width', 2 + 16 * e.w / lm).attr('stroke-linecap', 'round').append('title').text(`${e.a.f} ↔ ${e.b.f}: ${e.w} بحث مشترك`);
      const x = (e.a.x + e.b.x) / 2, y = (e.a.y + e.b.y) / 2; lg.append('rect').attr('x', x - 17).attr('y', y - 11).attr('width', 34).attr('height', 22).attr('rx', 11).attr('fill', '#fff').attr('stroke', '#7d8f99');
      lg.append('text').attr('x', x).attr('y', y + 5).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 800).attr('fill', '#091b22').text(e.w); });
    const ng = g.append('g').selectAll('g').data(N).join('g').attr('transform', f => `translate(${f.x},${f.y})`).style('cursor', 'pointer')
      .on('click', (ev, f) => { R.$('#n-fac').value = f.f; mode = 'people'; R.$$('#n-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === 'people')); draw(); });
    ng.append('circle').attr('r', rad).attr('fill', f => R.facColor(f.f)).attr('stroke', '#fff').attr('stroke-width', 4);
    ng.append('text').attr('text-anchor', 'middle').attr('dy', -2).attr('fill', '#fff').attr('font-size', 18).attr('font-weight', 800).text(f => f.people.size);
    ng.append('text').attr('text-anchor', 'middle').attr('dy', 15).attr('fill', '#fff').attr('font-size', 10.5).text('باحثاً');
    ng.append('text').attr('class', 'rs-nlab').attr('text-anchor', 'middle').attr('dy', f => rad(f) + 18).style('font-size', '14px').text(f => f.f);
    ng.append('text').attr('class', 'rs-nlab').attr('text-anchor', 'middle').attr('dy', f => rad(f) + 34).style('font-size', '11.5px').style('fill', '#4f5e64').text(f => `${f.in} بحثاً مشتركاً داخل الكلية`);
    svg.call(zoom.transform, d3.zoomIdentity);
    R.$('#n-stats').innerHTML = `<span><i class="bi bi-bank2"></i> <b>${N.length}</b> كلية</span><span><i class="bi bi-arrow-left-right"></i> <b>${E.length}</b> رابط بين كليات</span><span><i class="bi bi-journal-text"></i> <b>${E.reduce((t, e) => t + e.w, 0)}</b> بحثاً مشتركاً بين الكليات</span><span><i class="bi bi-hand-index"></i> اضغط كلية لعرض باحثيها</span>`;
  }
  // ---- paper search: highlight a paper's Petra authors on the graph
  let WK = null, paper = null;
  const pin = R.$('#n-paper'), sugg = R.$('#n-sugg');
  pin.addEventListener('focus', async () => { if (!WK) { try { WK = (await R.load('works')).works.filter(w => (w.r || []).length).map(w => Object.assign(w, { _q: R.norm(w.t + ' ' + (w.doi || '')) })); } catch (e) { WK = []; } } });
  pin.addEventListener('input', R.debounce(async () => {
    if (!WK) { try { WK = (await R.load('works')).works.filter(w => (w.r || []).length).map(w => Object.assign(w, { _q: R.norm(w.t + ' ' + (w.doi || '')) })); } catch (e) { WK = []; } }
    const q = R.norm(pin.value); if (q.length < 3) { sugg.hidden = true; if (!pin.value) { paper = null; draw(); } return; }
    const hits = WK.filter(w => w._q.includes(q)).sort((a, b) => (b.r.length - a.r.length) || ((b.sc || 0) - (a.sc || 0))).slice(0, 12);
    sugg.innerHTML = hits.map(w => `<button data-w="${R.esc(w.id)}"><b class="ltr">${R.esc(w.t)}</b><small>${w.y || ''} · ${R.esc(w.v || '')} · <i class="bi bi-people-fill"></i> ${w.r.length} من البترا · <i class="bi bi-quote"></i> ${R.n(w.sc ?? w.c ?? 0)}</small></button>`).join('') || '<div class="p-2 small">لا نتائج</div>';
    sugg.hidden = false;
  }, 250));
  sugg.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; paper = WK.find(w => w.id === b.dataset.w); sugg.hidden = true; pin.value = paper.t;
    if (mode !== 'people') { mode = 'people'; R.$$('#n-mode button').forEach(x => x.classList.toggle('on', x.dataset.m === 'people')); }
    R.$('#n-fac').value = ''; R.$('#n-min').value = '1'; draw(); showPaper(); });
  function showPaper() {
    if (!paper) return;
    const au = (paper.r || []).map(id => byId[id]).filter(Boolean);
    R.$('#n-panel').innerHTML = `<div class="rs-npaper"><span class="rs-b yr"><i class="bi bi-calendar3"></i> ${paper.y || ''}</span>${paper.q ? `<span class="rs-qpill q-${paper.q.toLowerCase()}">${paper.q}</span>` : ''}<a class="t ltr" href="${R.docUrl(paper)}">${R.esc(paper.t)}</a><div class="v ltr">${R.esc(paper.v || '')}</div>
      <div class="nums"><div><b>${R.n(paper.sc ?? '–')}</b><span>استشهاد Scopus</span></div><div><b>${R.n(paper.c ?? '–')}</b><span>OpenAlex</span></div><div><b>${au.length}</b><span>من البترا</span></div></div></div>
      <div class="lst-h"><i class="bi bi-people-fill"></i> مؤلفوه من البترا (مضاءون على الشبكة)</div>
      <div class="lst">${au.map(r => `<a href="${R.profileUrl(r)}"><span class="rs-fdot" style="--fc:${R.facColor(r.faculty)}"></span><span class="n">${R.esc(r.name)}</span><span class="w">${R.n(cites(r))}</span></a>`).join('')}</div>
      <button class="btn btn-sm btn-rs-o mt-2" id="n-clearp"><i class="bi bi-x-circle"></i> إلغاء التمييز</button>`;
    R.$('#n-clearp').onclick = () => { paper = null; pin.value = ''; draw(); R.$('#n-panel').innerHTML = ''; };
  }
  R.$('#n-size').addEventListener('change', draw);
  // publication period: rebuild the links from the papers published in the chosen years
  let WALL = null;
  async function period() {
    const a = +R.$('#n-from').value || 0, b = +R.$('#n-to').value || 9999;
    edgesAll.length = 0;
    if (!a && b === 9999) { edgesAll.push(...edgesBase); draw(); if (!R.$('[data-tab="pairs"]').hidden) pairs(); return; }
    if (!WALL) { R.$('#n-stats').innerHTML = '<span><i class="bi bi-hourglass-split"></i> جارٍ تحميل المنشورات…</span>'; try { WALL = (await R.load('works')).works; } catch (e) { WALL = []; } }
    const M = {};
    WALL.forEach(w => { if (!w.y || w.y < a || w.y > b) return; const rs = [...new Set(w.r || [])].filter(id => byId[id]).sort(); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const k = rs[i] + '|' + rs[j], m = M[k] = M[k] || { source: rs[i], target: rs[j], w: 0, y0: w.y, y1: w.y }; m.w++; m.y0 = Math.min(m.y0, w.y); m.y1 = Math.max(m.y1, w.y); } });
    edgesAll.push(...Object.values(M));
    draw(); if (!R.$('[data-tab="pairs"]').hidden) pairs();
    R.$('#n-stats').insertAdjacentHTML('afterbegin', `<span style="background:#eaf1fc"><i class="bi bi-calendar-range"></i> <b>${a || 'البداية'}–${b === 9999 ? Y : b}</b></span>`);
  }
  ['#n-from', '#n-to'].forEach(id => R.$(id).addEventListener('change', period));
  R.$('#n-mode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; R.$$('#n-mode button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  ['#n-fac', '#n-min', '#n-cross'].forEach(s => R.$(s).addEventListener('change', draw));
  R.$('#n-q').addEventListener('input', R.debounce(draw, 300));
  R.$('#n-legend').addEventListener('click', e => { const s = e.target.closest('[data-f]'); if (!s) return; const f = s.dataset.f; hidden.has(f) ? hidden.delete(f) : hidden.add(f); s.classList.toggle('off', hidden.has(f)); draw(); });
  R.$('#n-zin').onclick = () => svg.transition().call(zoom.scaleBy, 1.4);
  R.$('#n-zout').onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.4);
  R.$('#n-fit').onclick = draw;
  R.$('#n-lab').onclick = e => { labelsAll = !labelsAll; e.currentTarget.classList.toggle('on', labelsAll); draw(); };
  draw();
  window.addEventListener('resize', R.debounce(draw, 400));
})();
