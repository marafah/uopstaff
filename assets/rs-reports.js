/* reports.html: monthly research report per faculty (new publications, citations gained, researchers, departments).
   Built from the weekly data: each work's publication date (or the date it first appeared) and a monthly snapshot
   of citations (data/research/cites_monthly.json). Print-friendly; CSV export. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata, cm = {};
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  try { cm = await R.load('cites_monthly'); } catch (e) { cm = {}; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc;
  const works = (wdata.works || []).map(w => Object.assign(w, { _m: (w.pd || w.fs || (w.y ? w.y + '-01-01' : '')).slice(0, 7), _fac: [...new Set((w.r || []).map(id => byId[id] && byId[id].faculty).filter(Boolean))] }));
  const W = Object.fromEntries(works.map(w => [w.id, w]));
  const now = new Date();
  const ym = d => d.toISOString().slice(0, 7);
  const months = []; for (let i = 0; i < 24; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(ym(d)); }
  const fmt = m => new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-01T00:00:00Z'));
  const prevOf = m => { const [y, mo] = m.split('-').map(Number); return ym(new Date(Date.UTC(y, mo - 2, 1))); };
  const snaps = Object.keys(cm).sort();
  const st = { m: R.param('m') || (now.getUTCDate() < 8 ? months[1] : months[0]), fac: R.param('fac') };

  app.innerHTML = `
  <section class="rs-section rs-card no-print"><div class="rs-toolbar">
    <div class="fld"><label for="rp-m">الشهر</label><select id="rp-m" class="form-select">${months.map(m => `<option value="${m}"${m === st.m ? ' selected' : ''}>${fmt(m)}</option>`).join('')}</select></div>
    <div class="fld grow"><label for="rp-fac">الكلية</label><select id="rp-fac" class="form-select"><option value="">الجامعة كلها</option>${R.faculties(list).map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
    <div class="btns"><button class="btn btn-rs" onclick="print()"><i class="bi bi-printer"></i> طباعة / PDF</button><button class="btn btn-rs-o" id="rp-csv"><i class="bi bi-download"></i> CSV</button></div>
  </div></section>
  <div id="rp-body"></div>`;

  function render() {
    const m = st.m, pm = prevOf(m);
    const inFac = w => !st.fac || w._fac.includes(st.fac);
    const people = list.filter(r => !st.fac || r.faculty === st.fac);
    const ids = new Set(people.map(r => r.id));
    const neu = works.filter(w => w._m === m && inFac(w)).sort((a, b) => ((b.q === 'Q1') - (a.q === 'Q1')) || ((b.sc ?? b.c ?? 0) - (a.sc ?? a.c ?? 0)));
    const prevN = works.filter(w => w._m === pm && inFac(w)).length;
    // citations gained in the month: snapshot of this month minus snapshot of the month before
    const sNow = cm[m] || (m === months[0] && snaps.length ? cm[snaps[snaps.length - 1]] : null), sPrev = cm[pm];
    const gains = {};
    if (sNow && sPrev) for (const w of works) { if (!inFac(w)) continue; const a = sNow[w.id], b = sPrev[w.id]; if (a) gains[w.id] = [(a[0] || 0) - (b ? b[0] || 0 : 0), (a[1] || 0) - (b ? b[1] || 0 : 0)]; }
    const gainSc = Object.values(gains).reduce((t, g) => t + Math.max(0, g[0]), 0), gainOa = Object.values(gains).reduce((t, g) => t + Math.max(0, g[1]), 0);
    const byR = {};
    people.forEach(r => { byR[r.id] = { r, n: 0, g: 0 }; });
    neu.forEach(w => (w.r || []).forEach(id => { if (byR[id]) byR[id].n++; }));
    Object.entries(gains).forEach(([wid, g]) => { const w = W[wid]; (w && w.r || []).forEach(id => { if (byR[id]) byR[id].g += Math.max(0, g[0]); }); });
    const active = Object.values(byR).filter(x => x.n || x.g).sort((a, b) => (b.n - a.n) || (b.g - a.g));
    const depts = {};
    neu.forEach(w => [...new Set((w.r || []).map(id => byId[id] && ids.has(id) && byId[id].dept).filter(Boolean))].forEach(d => { depts[d] = (depts[d] || 0) + 1; }));
    const topGain = Object.entries(gains).filter(([, g]) => g[0] > 0).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10).map(([id, g]) => [W[id], g]).filter(x => x[0]);
    const trend = months.slice(0, 12).reverse().map(mm => [mm, works.filter(w => w._m === mm && inFac(w)).length]);
    const q12 = neu.filter(w => w.q === 'Q1' || w.q === 'Q2').length, inSc = neu.filter(w => (w.src || '').includes('s')).length, intl = neu.filter(w => (w.cc || []).some(c => c !== 'JO')).length;
    const title = `التقرير الشهري للبحث العلمي — ${st.fac || 'جامعة البترا'} — ${fmt(m)}`;
    document.title = title;
    R.$('#pg-title').textContent = 'التقرير الشهري';
    R.$('#pg-sub').textContent = `${st.fac || 'جامعة البترا'} · ${fmt(m)}`;
    R.$('#rp-body').innerHTML = `
    <section class="rs-section rs-card rs-doc-head"><h2 class="title">${esc(title)}</h2>
      <div class="text-muted small">أُعدّ تلقائياً من Scopus و Web of Science و OpenAlex وصفحات المدرسين · ${m === months[0] ? 'الشهر الحالي لم يكتمل بعد' : 'شهر مكتمل'}</div></section>
    <nav class="rs-tabs no-print" id="rp-tabs"><button data-t="sum"><i class="bi bi-speedometer2"></i> الملخص</button><button data-t="pubs"><i class="bi bi-journal-plus"></i> المنشورات الجديدة <span class="rs-cnt">${R.n(neu.length)}</span></button><button data-t="cites"><i class="bi bi-fire"></i> الاقتباسات</button><button data-t="people"><i class="bi bi-people-fill"></i> الباحثون <span class="rs-cnt">${R.n(active.length)}</span></button><button data-t="all"><i class="bi bi-printer"></i> التقرير كاملاً</button></nav>
    <section class="rs-section rs-kpis" data-tab="sum">
      <div class="rs-kpi"><div class="v">${R.n(neu.length)}</div><div class="l"><i class="bi bi-journal-plus"></i>منشور جديد</div><div class="d">${prevN ? `${neu.length >= prevN ? '<span class="up">▲' : '<span class="down">▼'} ${R.n(Math.abs(neu.length - prevN))}</span> عن ${fmt(pm)}` : `الشهر السابق: ${R.n(prevN)}`}</div></div>
      <div class="rs-kpi scopus"><div class="v">${R.n(inSc)}</div><div class="l"><i class="bi bi-bar-chart-line"></i>منها في Scopus</div><div class="d">${R.n(q12)} في Q1 و Q2 · ${R.n(intl)} بتعاون دولي</div></div>
      <div class="rs-kpi gold"><div class="v">${sNow && sPrev ? '+' + R.n(gainSc) : '–'}</div><div class="l"><i class="bi bi-graph-up-arrow"></i>اقتباس Scopus جديد خلال الشهر</div><div class="d">${sNow && sPrev ? `OpenAlex: +${R.n(gainOa)}` : 'يبدأ الحساب بعد لقطتين شهريتين (تُسجَّل أسبوعياً منذ ' + esc(snaps[0] ? fmt(snaps[0]) : 'هذا الشهر') + ')'}</div></div>
      <div class="rs-kpi navy"><div class="v">${R.n(active.filter(x => x.n).length)}</div><div class="l"><i class="bi bi-people"></i>باحث نشر هذا الشهر</div><div class="d">من ${R.n(people.length)} عضو هيئة تدريس</div></div>
    </section>
    <section class="rs-section rs-grid wide" data-tab="sum">
      <div class="rs-card"><h3><i class="bi bi-graph-up"></i>المنشورات الجديدة شهرياً (12 شهراً) <small class="fw-normal text-muted">الشهر المختار بالأحمر</small></h3><div class="rs-chart" style="height:300px"><canvas id="rp-trend"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>حسب القسم</h3>${Object.keys(depts).length ? `<div class="rs-dbars">${(() => { const e = Object.entries(depts).sort((a, b) => b[1] - a[1]), mx = e[0][1]; return e.map(([d, n], i) => `<div><span>${esc(d)}</span><div class="bar"><i style="width:${(100 * n / mx).toFixed(0)}%;background:${R.colors[i % R.colors.length]}"></i></div><b>${n}</b></div>`).join(''); })()}</div>` : '<div class="rs-note">لا منشورات جديدة.</div>'}</div>
    </section>
    <section class="rs-section rs-card" data-tab="pubs"><h3><i class="bi bi-journal-text"></i>المنشورات الجديدة (${R.n(neu.length)})</h3>
      <div class="rs-pubs">${neu.map(w => R.pubHTML(w, { byId, showUop: true })).join('') || '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا منشورات جديدة مسجّلة لهذا الشهر</div>'}</div></section>
    ${topGain.length ? `<section class="rs-section rs-card" data-tab="cites"><h3><i class="bi bi-fire"></i>الأبحاث الأكثر اكتساباً للاقتباسات هذا الشهر</h3>
      <table class="rs-table"><thead><tr><th>البحث</th><th class="num">اقتباس جديد (Scopus)</th><th class="num">الإجمالي</th></tr></thead><tbody>
      ${topGain.map(([w, g]) => `<tr><td><a href="${R.docUrl(w)}">${esc(w.t)}</a><br><small class="text-muted">${(w.r || []).map(id => byId[id] ? esc(byId[id].name) : '').filter(Boolean).join('، ')} · ${esc(w.v || '')} ${w.y || ''}</small></td><td class="num"><span class="pill qg"><i class="bi bi-arrow-up"></i> ${R.n(g[0])}</span></td><td class="num">${R.n(w.sc ?? w.c)}</td></tr>`).join('')}</tbody></table></section>` : `<section class="rs-section rs-card" data-tab="cites"><div class="rs-empty"><i class="bi bi-hourglass-split"></i>تُحسب الاقتباسات الجديدة بعد تسجيل لقطتين شهريتين متتاليتين من بيانات Scopus</div></section>`}
    <section class="rs-section rs-card" data-tab="people"><h3><i class="bi bi-person-lines-fill"></i>الباحثون النشطون هذا الشهر</h3>
      ${active.length ? `<div class="rs-scroll"><table class="rs-table"><thead><tr><th><i class="bi bi-person-fill"></i> الباحث</th><th><i class="bi bi-diagram-3-fill"></i> القسم</th><th class="num"><i class="bi bi-journal-plus"></i> منشورات جديدة</th><th class="num"><i class="bi bi-arrow-up-circle-fill"></i> اقتباس جديد</th><th class="num"><i class="bi bi-file-earmark-text-fill"></i> وثائق Scopus</th><th class="num"><i class="bi bi-graph-up-arrow"></i> h-index</th></tr></thead><tbody>
      ${active.slice(0, 60).map(x => `<tr><td><a class="d-flex align-items-center gap-2 text-decoration-none" href="${R.profileUrl(x.r)}">${R.avatar(x.r, 'sm')}<b style="color:#901d23">${esc(x.r.name)}</b></a></td><td><small>${esc(x.r.dept || '')}</small></td><td class="num">${x.n ? `<span class="pill qg"><i class="bi bi-journal-plus"></i> ${R.n(x.n)}</span>` : '–'}</td><td class="num">${x.g ? `<span class="pill or">+${R.n(x.g)}</span>` : '–'}</td><td class="num">${R.n((x.r.sc || {}).docs || 0)}</td><td class="num"><span class="hb ${((x.r.sc || {}).h || 0) >= 10 ? 'h3' : ((x.r.sc || {}).h || 0) >= 5 ? 'h2' : ((x.r.sc || {}).h || 0) > 0 ? 'h1' : 'h0'}" style="min-width:32px;height:32px;font-size:.9rem">${R.n((x.r.sc || {}).h || 0)}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="rs-note">لا نشاط مسجّل.</div>'}</section>
    <p class="rs-note">تاريخ المنشور = تاريخ النشر عند توفره (OpenAlex)، وإلا تاريخ ظهوره أول مرة في التحديث الأسبوعي. الاقتباسات الجديدة = الفرق بين لقطة نهاية الشهر ولقطة الشهر السابق.</p>`;
    showTab(st.tab || 'sum');
    R.chart('rp-trend', { type: 'bar', data: { labels: trend.map(t => fmt(t[0])), datasets: [{ label: 'منشورات', data: trend.map(t => t[1]), backgroundColor: trend.map(t => t[0] === m ? '#901d23' : '#c9a0a3'), borderRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    R.$('#rp-csv').onclick = () => R.csv(neu.map(w => ({ month: m, faculty: w._fac.join(' | '), title: w.t, venue: w.v || '', year: w.y || '', quartile: w.q || '', in_scopus: (w.src || '').includes('s') ? 'yes' : 'no',
      scopus_citations: w.sc ?? '', petra_authors: (w.r || []).map(id => byId[id] ? byId[id].name : '').join(' | '), doi: w.doi ? 'https://doi.org/' + w.doi : '', details: location.origin + location.pathname.replace(/[^/]*$/, '') + R.docUrl(w) })), `report-${m}${st.fac ? '-' + st.fac : ''}.csv`);
    const u = new URL(location); u.searchParams.set('m', m); st.fac ? u.searchParams.set('fac', st.fac) : u.searchParams.delete('fac'); history.replaceState(null, '', u);
  }
  function showTab(t) {
    st.tab = t; R.$$('#rp-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = t !== 'all' && el.dataset.tab !== t; });
  }
  app.addEventListener('click', e => { const b = e.target.closest('#rp-tabs [data-t]'); if (b) showTab(b.dataset.t); });
  window.addEventListener('beforeprint', () => showTab('all'));
  render();
  R.$('#rp-m').onchange = e => { st.m = e.target.value; render(); };
  R.$('#rp-fac').onchange = e => { st.fac = e.target.value; render(); };
})();
