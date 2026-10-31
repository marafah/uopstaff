/* compare.html: compare up to 4 researchers, or several faculties / departments */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  const works = wdata.works || [];
  const meta = data.meta || {}, Y = meta.year || new Date().getFullYear();
  R.updated(meta);
  const COL = ['#901d23', '#1f6f78', '#b8892b', '#6b4c9a', '#2f7d32', '#3b6ea8'];

  let mode = R.param('mode') || 'people';
  let picks = R.param('ids') ? R.param('ids').split(',').filter(id => byId[id]) : R.cmp.get();
  if (mode === 'people' && picks.length === 1) {   // one researcher: suggest the closest colleagues in the department
    const me = byId[picks[0]];
    list.filter(x => x.id !== me.id && x.dept === me.dept).sort((a, b) => b.works - a.works).slice(0, 2).forEach(x => picks.push(x.id));
  }
  let groups = R.param('g') ? R.param('g').split('|') : [];

  app.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3 no-print">
      <div class="rs-seg" id="c-mode"><button data-m="people">باحثون</button><button data-m="faculty">كليات</button><button data-m="dept">أقسام</button><button data-m="uni">جامعات أردنية</button></div>
      <div class="rs-suggest flex-grow-1" style="max-width:520px"><input id="c-q" class="form-control" type="search" autocomplete="off"><div class="list" id="c-list"></div></div>
      <button class="btn btn-rs-o" id="c-share" title="انسخ رابط هذه المقارنة"><i class="bi bi-link-45deg"></i> رابط المقارنة</button>
    </div>
    <div class="rs-pick mb-3" id="c-slots"></div>
    <div id="c-out"></div>
    <div id="c-uni" hidden></div>`;

  // ------------------------------------------------------------------ groups (faculties / departments)
  const facs = R.faculties(list);
  const depts = [...new Set(list.map(r => r.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  function groupStats(name) {
    const rs = list.filter(r => (mode === 'faculty' ? r.faculty : r.dept) === name);
    const ids = new Set(rs.map(r => r.id));
    const ws = works.filter(w => (w.r || []).some(id => ids.has(id)));
    const by = {}; ws.forEach(w => { if (w.y) by[w.y] = (by[w.y] || 0) + 1; });
    const active = rs.filter(r => r.works);
    return {
      id: name, name, n: rs.length, works: ws.length, w5: ws.filter(w => (w.y || 0) >= Y - 4).length, cites: R.sum(ws.map(w => w.c)),
      sc: ws.filter(w => (w.src || '').includes('s')).length, scc: R.sum(ws.filter(w => (w.src || '').includes('s')).map(w => w.sc || 0)),
      q12: ws.filter(w => (w.src || '').includes('s') && (w.q === 'Q1' || w.q === 'Q2')).length, sch: R.median(rs.filter(r => r.sc).map(r => r.sc.h)),
      perCap: rs.length ? ws.length / rs.length : 0, h: R.median(active.map(r => r.h)), hmax: Math.max(0, ...rs.map(r => r.h)),
      oa: ws.filter(w => w.oa).length ? ws.filter(R.isOA).length / ws.filter(w => w.oa).length : 0,
      scholar: rs.length ? rs.filter(r => r.links.scholar).length / rs.length : 0, scopus: rs.length ? rs.filter(r => r.links.scopus || r.scopus_id).length / rs.length : 0,
      orcid: rs.length ? rs.filter(r => r.links.orcid).length / rs.length : 0, by, topics: topicCount(ws), intl: ws.filter(w => (w.cc || []).some(c => c !== 'JO')).length
    };
  }
  function topicCount(ws) { const m = {}; ws.forEach(w => { if (w.f) m[w.f] = (m[w.f] || 0) + 1; }); return m; }

  // ------------------------------------------------------------------ search box
  const q = R.$('#c-q'), sl = R.$('#c-list');
  let act = -1, hits = [];
  function suggest() {
    const t = R.norm(q.value).split(' ').filter(Boolean);
    if (mode === 'people') hits = list.filter(r => !picks.includes(r.id) && (!t.length || t.every(x => r._q.includes(x)))).sort((a, b) => b.works - a.works).slice(0, 12)
      .map(r => ({ id: r.id, html: `${R.avatar(r, 'sm')}<span><b>${R.esc(r.name)}</b><br><small class="text-muted">${R.esc(r.dept)} · h ${r.h}</small></span>` }));
    else hits = (mode === 'faculty' ? facs : depts).filter(g => !groups.includes(g) && (!t.length || t.every(x => R.norm(g).includes(x)))).slice(0, 15)
      .map(g => ({ id: g, html: `<i class="bi bi-building"></i><span>${R.esc(g)}</span>` }));
    act = -1;
    sl.innerHTML = hits.map((h, i) => `<button type="button" data-i="${i}">${h.html}</button>`).join('');
    sl.classList.toggle('show', !!hits.length && document.activeElement === q);
  }
  function add(id) {
    if (mode === 'people') { if (picks.length >= 4) return; picks.push(id); R.cmp.set(picks); }
    else { if (groups.length >= 6) return; groups.push(id); }
    q.value = ''; sl.classList.remove('show'); render();
  }
  q.addEventListener('input', suggest);
  q.addEventListener('focus', suggest);
  q.addEventListener('blur', () => setTimeout(() => sl.classList.remove('show'), 150));
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { act = Math.max(0, Math.min(hits.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); R.$$('button', sl).forEach((b, i) => b.classList.toggle('act', i === act)); e.preventDefault(); }
    if (e.key === 'Enter' && hits[act < 0 ? 0 : act]) add(hits[act < 0 ? 0 : act].id);
  });
  sl.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (b) add(hits[+b.dataset.i].id); });
  R.$('#c-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; groups = []; render(); });
  R.$('#c-share').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(location.href); R.$('#c-share').innerHTML = '<i class="bi bi-check2"></i> نُسخ'; setTimeout(() => R.$('#c-share').innerHTML = '<i class="bi bi-link-45deg"></i> رابط المقارنة', 1500); });
  R.$('#c-slots').addEventListener('click', e => {
    const x = e.target.closest('[data-x]'); if (!x) return;
    if (mode === 'people') { picks = picks.filter(p => p !== x.dataset.x); R.cmp.set(picks); } else groups = groups.filter(g => g !== x.dataset.x);
    render();
  });

  // ------------------------------------------------------------------ render
  function bestCls(vals, i, low) { const v = vals[i]; const best = low ? Math.min(...vals) : Math.max(...vals); return vals.length > 1 && v === best && v > 0 ? ' style="background:#e3f3e8;font-weight:800"' : ''; }
  function row(label, vals, fmt, src) { return `<tr><td>${label}${src ? ' ' + src : ''}</td>${vals.map((v, i) => `<td class="num"${bestCls(vals.map(x => +x || 0), i)}>${fmt ? fmt(v) : R.n(v)}</td>`).join('')}</tr>`; }

  let uniLoaded = false;
  function renderUni() {   // Jordanian universities: the full comparison view of jordan.html, inside this page
    const box = R.$('#c-uni');
    if (uniLoaded) return;
    uniLoaded = true;
    box.innerHTML = '<div class="rs-loading">جارٍ تحميل بيانات الجامعات الأردنية…</div>';
    window.RS_JO_MOUNT = box;
    const sc = document.createElement('script');
    sc.src = 'assets/rs-jordan.js?v=' + ((document.querySelector('script[src*="rs-compare.js"]') || {}).src || '').split('v=')[1];
    document.body.appendChild(sc);
  }
  function render() {
    R.$$('#c-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    const uni = mode === 'uni';
    ['#c-out', '#c-slots'].forEach(s => { R.$(s).hidden = uni; });
    R.$('.rs-suggest').style.display = uni ? 'none' : '';
    R.$('#c-share').style.display = uni ? 'none' : '';
    R.$('#c-uni').hidden = !uni;
    if (uni) { const u = new URL(location); u.searchParams.set('mode', 'uni'); u.searchParams.delete('ids'); u.searchParams.delete('g'); history.replaceState(null, '', u); return renderUni(); }
    q.placeholder = mode === 'people' ? 'أضف باحثاً بالاسم أو التخصص… (حتى 4)' : mode === 'faculty' ? 'أضف كلية… (حتى 6)' : 'أضف قسماً… (حتى 6)';
    const u = new URL(location); u.searchParams.set('mode', mode);
    if (mode === 'people') { u.searchParams.set('ids', picks.join(',')); u.searchParams.delete('g'); } else { u.searchParams.set('g', groups.join('|')); u.searchParams.delete('ids'); }
    history.replaceState(null, '', u);
    return mode === 'people' ? renderPeople() : renderGroups();
  }

  function renderPeople() {
    const P = picks.map(id => byId[id]).filter(Boolean);
    R.$('#c-slots').innerHTML = [0, 1, 2, 3].map(i => P[i]
      ? `<div class="rs-slot filled" style="border-color:${COL[i]}"><button class="x" data-x="${P[i].id}" title="إزالة"><i class="bi bi-x-lg"></i></button>${R.avatar(P[i])}<div><span class="sw d-inline-block" style="background:${COL[i]}"></span> <a href="${R.profileUrl(P[i])}"><b>${R.esc(P[i].name)}</b></a><br><small class="text-muted">${R.esc(P[i].dept)}</small></div></div>`
      : `<div class="rs-slot text-muted"><i class="bi bi-plus-circle fs-4"></i> أضف باحثاً من مربع البحث</div>`).join('');
    const out = R.$('#c-out');
    if (P.length < 2) { out.innerHTML = '<div class="rs-empty"><i class="bi bi-bar-chart-steps"></i>اختر باحثَين على الأقل للمقارنة.<br><small>يمكنك أيضاً تحديد «مقارنة» على بطاقات <a href="researchers.html">قائمة الباحثين</a>.</small></div>'; return; }
    const col = k => P.map(r => r[k]);
    const joint = works.filter(w => P.filter(r => (w.r || []).includes(r.id)).length >= 2);
    const years = []; for (let y = Y - 11; y <= Y; y++) years.push(y);
    const radarK = [['sc.h', 'h في Scopus'], ['sc.cites', 'اقتباسات Scopus'], ['sc.docs', 'وثائق Scopus'], ['sc.w5', 'Scopus آخر 5 سنوات'], ['q12', 'Q1 + Q2'], ['works', 'كل المنشورات'], ['ext_coauthors', 'تعاون خارجي']];
    const gk = (r, k) => k === 'q12' ? (((r.sc || {}).q || {}).Q1 || 0) + (((r.sc || {}).q || {}).Q2 || 0) : k.startsWith('sc.') ? ((r.sc || {})[k.slice(3)] || 0) : (r[k] || 0);
    out.innerHTML = `
    <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>جدول المقارنة <small class="fw-normal text-muted">الخلية الخضراء = الأعلى</small></h3>
      <div class="rs-scroll full"><table class="rs-table rs-mtable"><thead><tr><th></th>${P.map((r, i) => `<th class="num"><span class="sw d-inline-block rounded-circle" style="width:10px;height:10px;background:${COL[i]}"></span> ${R.esc(r.name)}</th>`).join('')}</tr></thead><tbody>
        <tr><td>الرتبة</td>${P.map(r => `<td class="num">${R.esc(r.rank)}</td>`).join('')}</tr>
        <tr><td>القسم</td>${P.map(r => `<td class="num"><small>${R.esc(r.dept)}</small></td>`).join('')}</tr>
        ${row('وثائق Scopus (بانتماء البترا)', P.map(r => (r.sc || {}).docs || 0), null, R.srcBadge('Scopus', '', 'bi-bar-chart-line'))}
        ${row('اقتباسات Scopus', P.map(r => (r.sc || {}).cites || 0))}${row('h-index في Scopus', P.map(r => (r.sc || {}).h || 0))}
        ${row('وثائق Scopus آخر 5 سنوات', P.map(r => (r.sc || {}).w5 || 0))}
        ${row('أبحاث Q1', P.map(r => ((r.sc || {}).q || {}).Q1 || 0))}${row('أبحاث Q2', P.map(r => ((r.sc || {}).q || {}).Q2 || 0))}
        ${row('وثائق Web of Science', P.map(r => (r.wos || {}).docs || 0), null, R.srcBadge('WoS', '', 'bi-journal'))}${row('اقتباسات Web of Science', P.map(r => (r.wos || {}).cites || 0))}${row('h-index في Web of Science', P.map(r => (r.wos || {}).h || 0))}
        ${row('المنشورات (كل المصادر)', col('works'))}${row('منشورات آخر 5 سنوات', col('w5'))}
        ${row('اقتباسات OpenAlex', col('cites'), null, R.srcBadge('OpenAlex'))}${row('اقتباسات آخر 5 سنوات', col('c5'))}
        ${row('h-index (OpenAlex)', col('h'))}${row('i10-index', col('i10'))}
        ${row('متوسط الاقتباس للبحث', P.map(r => r.works ? r.cites / r.works : 0), v => (+v).toFixed(1))}
        ${row('الوصول المفتوح', col('oa_share'), v => R.pct(v))}
        ${row('Google Scholar: اقتباسات', P.map(r => (r.scholar || {}).cites), null, R.srcBadge('Scholar', '', 'bi-google'))}
        ${row('Google Scholar: h-index', P.map(r => (r.scholar || {}).h))}
        ${row('Scopus: h-index (الملف الكامل)', P.map(r => (r.scopus || {}).h))}
        ${row('مؤلفون مشاركون خارجيون', col('ext_coauthors'))}${row('دول متعاونة', P.map(r => (r.countries || []).filter(c => c[0] !== 'JO').length))}
        <tr><td>أبرز المواضيع</td>${P.map(r => `<td><small>${(r.topics || []).slice(0, 3).map(t => R.esc(t[0])).join('<br>')}</small></td>`).join('')}</tr>
        <tr><td>روابط التحقق</td>${P.map(r => `<td>${R.linkList(r)}</td>`).join('')}</tr>
      </tbody></table></div></section>
    <section class="rs-section rs-grid">
      <div class="rs-card"><h3><i class="bi bi-bullseye"></i>الملف النسبي <small class="fw-normal text-muted">المئين داخل الجامعة (0–100)</small></h3><div class="rs-chart tall"><canvas id="c-radar"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-bar-chart"></i>وثائق Scopus سنوياً</h3><div class="rs-chart"><canvas id="c-wy"></canvas></div>
        <h3 class="mt-3"><i class="bi bi-graph-up"></i>الاقتباسات سنوياً</h3><div class="rs-chart short"><canvas id="c-cy"></canvas></div></div>
    </section>
    <section class="rs-section rs-card"><h3><i class="bi bi-people"></i>أبحاث مشتركة بينهم (${joint.length})</h3>
      <div class="rs-pubs">${joint.map(w => R.pubHTML(w, { byId, showUop: true })).join('') || '<div class="text-muted small">لا توجد أبحاث مشتركة بين الباحثين المختارين.</div>'}</div></section>`;
    const allv = k => list.map(r => gk(r, k));
    R.chart('c-radar', { type: 'radar', data: { labels: radarK.map(k => k[1]), datasets: P.map((r, i) => ({ label: r.name, data: radarK.map(([k]) => R.percentile(allv(k), gk(r, k))), borderColor: COL[i], backgroundColor: R.alpha(COL[i], .12), pointBackgroundColor: COL[i] })) }, options: { scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' } } } } });
    R.chart('c-wy', { type: 'bar', data: { labels: years, datasets: P.map((r, i) => ({ label: r.name, data: years.map(y => ((r.sc || {}).by_year || {})[y] || 0), backgroundColor: COL[i], borderRadius: 3 })) }, options: { scales: { y: { beginAtZero: true } } } });
    R.chart('c-cy', { type: 'line', data: { labels: years, datasets: P.map((r, i) => ({ label: r.name, data: years.map(y => (r.by_year[y] || [0, 0])[1]), borderColor: COL[i], backgroundColor: COL[i], tension: .3 })) }, options: { scales: { y: { beginAtZero: true } } } });
  }

  function renderGroups() {
    const G = groups.map(groupStats);
    R.$('#c-slots').innerHTML = G.map((g, i) => `<div class="rs-slot filled" style="border-color:${COL[i]}"><button class="x" data-x="${R.esc(g.id)}" title="إزالة"><i class="bi bi-x-lg"></i></button><span class="sw" style="background:${COL[i]}"></span><div><b>${R.esc(g.name)}</b><br><small class="text-muted">${g.n} باحث</small></div></div>`).join('')
      + (G.length < 6 ? `<div class="rs-slot text-muted"><i class="bi bi-plus-circle fs-4"></i> أضف ${mode === 'faculty' ? 'كلية' : 'قسماً'} من مربع البحث${!G.length ? ` أو <a href="#" id="c-all">اختر الكل</a>` : ''}</div>` : '');
    const all = R.$('#c-all'); if (all) all.onclick = e => { e.preventDefault(); groups = (mode === 'faculty' ? facs : depts).map(groupStats).sort((a, b) => b.works - a.works).slice(0, 6).map(g => g.id); render(); };
    const out = R.$('#c-out');
    if (G.length < 2) { out.innerHTML = '<div class="rs-empty"><i class="bi bi-building"></i>اختر مجموعتين على الأقل.</div>'; return; }
    const years = []; for (let y = Y - 11; y <= Y; y++) years.push(y);
    const fields = Object.entries(G.reduce((m, g) => { Object.entries(g.topics).forEach(([k, v]) => m[k] = (m[k] || 0) + v); return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const metrics = [['n', 'عدد الباحثين'], ['sc', 'وثائق Scopus'], ['scc', 'اقتباسات Scopus'], ['sch', 'وسيط h في Scopus'], ['q12', 'أبحاث Q1 و Q2'], ['works', 'المنشورات (دون تكرار)'], ['w5', 'منشورات آخر 5 سنوات'], ['perCap', 'منشورات لكل باحث', v => (+v).toFixed(1)], ['cites', 'الاقتباسات'], ['h', 'وسيط h-index'], ['hmax', 'أعلى h-index'], ['intl', 'منشورات بتعاون دولي'], ['oa', 'الوصول المفتوح', R.pct], ['scholar', 'نسبة من لديهم Scholar', R.pct], ['scopus', 'نسبة من لديهم Scopus', R.pct], ['orcid', 'نسبة من لديهم ORCID', R.pct]];
    out.innerHTML = `
    <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>جدول المقارنة</h3><div class="rs-scroll full"><table class="rs-table rs-mtable"><thead><tr><th></th>${G.map((g, i) => `<th class="num"><span class="d-inline-block rounded-circle" style="width:10px;height:10px;background:${COL[i]}"></span> ${R.esc(g.name)}</th>`).join('')}</tr></thead><tbody>
      ${metrics.map(([k, t, f]) => row(t, G.map(g => g[k]), f)).join('')}</tbody></table></div></section>
    <section class="rs-section rs-grid">
      <div class="rs-card"><h3><i class="bi bi-graph-up"></i>المنشورات سنوياً</h3><div class="rs-chart"><canvas id="g-y"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-bullseye"></i>المؤشرات النسبية <small class="fw-normal text-muted">100 = الأعلى بين المختارين</small></h3><div class="rs-chart"><canvas id="g-r"></canvas></div></div>
      <div class="rs-card rs-span-2"><h3><i class="bi bi-diagram-2"></i>توزيع المجالات</h3><div class="rs-chart"><canvas id="g-f"></canvas></div></div>
    </section>`;
    R.chart('g-y', { type: 'line', data: { labels: years, datasets: G.map((g, i) => ({ label: g.name, data: years.map(y => g.by[y] || 0), borderColor: COL[i], backgroundColor: COL[i], tension: .3 })) } });
    const rk = [['sc', 'وثائق Scopus'], ['scc', 'اقتباسات Scopus'], ['q12', 'Q1 + Q2'], ['works', 'المنشورات'], ['w5', 'آخر 5 سنوات'], ['perCap', 'لكل باحث'], ['cites', 'الاقتباسات'], ['h', 'وسيط h'], ['intl', 'تعاون دولي'], ['oa', 'وصول مفتوح']];
    R.chart('g-r', { type: 'radar', data: { labels: rk.map(k => k[1]), datasets: G.map((g, i) => ({ label: g.name, data: rk.map(([k]) => { const mx = Math.max(...G.map(x => x[k])) || 1; return Math.round(100 * g[k] / mx); }), borderColor: COL[i], backgroundColor: R.alpha(COL[i], .1) })) }, options: { scales: { r: { min: 0, max: 100, ticks: { backdropColor: 'transparent' } } } } });
    R.chart('g-f', { type: 'bar', data: { labels: fields, datasets: G.map((g, i) => ({ label: g.name, data: fields.map(f => g.topics[f] || 0), backgroundColor: COL[i], borderRadius: 3 })) }, options: { scales: { x: { ticks: { font: { size: 12 } } } } } });
  }

  render();
})();
