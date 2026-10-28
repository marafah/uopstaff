/* universities.html: Jordanian universities compared — Scopus first (weekly via the API), OpenAlex as a wider complement */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let udata, rdata;
  try { udata = await R.load('universities'); rdata = await R.load('researchers').catch(() => ({})); } catch (e) { R.fail(app, e); return; }
  R.updated(Object.assign({}, rdata.meta || {}, { updated: udata.updated }));
  const meta = rdata.meta || {};
  const Y = new Date(udata.updated || Date.now()).getFullYear();
  const U = (udata.universities || []).map(u => {
    const s = (a, b) => { let t = 0; for (let y = a; y <= b; y++) t += ((u.by_year || {})[y] || [0])[0]; return t; };
    const last5 = s(Y - 5, Y - 1), prev5 = s(Y - 10, Y - 6);
    return Object.assign(u, { label: u.name_ar || u.name, cpw: u.works ? u.cites / u.works : 0, last5, growth: prev5 ? last5 / prev5 - 1 : 0 });
  });
  const uop = U.find(u => u.id === udata.uop);
  if (!uop) { app.innerHTML = '<div class="rs-empty">لا توجد بيانات للجامعات</div>'; return; }
  const rank = k => [...U].sort((a, b) => b[k] - a[k]).findIndex(u => u.id === uop.id) + 1;
  const peers = [...U].filter(u => u.id !== uop.id).sort((a, b) => Math.abs(a.works - uop.works) - Math.abs(b.works - uop.works)).slice(0, 4).map(u => u.id);
  let sel = R.store.get('rs-unis', null) || [uop.id, ...peers];
  const metrics = { works: ['المنشورات', R.n], cites: ['الاقتباسات', R.n], h: ['h-index', R.n], cpw: ['الاقتباس لكل بحث', v => v.toFixed(1)], mean2y: ['متوسط الاقتباس (سنتان)', v => (+v).toFixed(2)], last5: ['منشورات آخر 5 سنوات', R.n], growth: ['النمو (5 سنوات)', v => (v >= 0 ? '+' : '') + R.pct(v)], oa_share: ['الوصول المفتوح', v => R.pct(v)] };
  let metric = 'works', sortK = 'works';

  // ---------------------------------------------------------------- Scopus (the university's reference source), weekly via the Scopus API
  const SU = (udata.scopus_universities || []).map(u => {
    const by = u.by_year || {}, s = (a, b) => { let t = 0; for (let y = a; y <= b; y++) t += by[y] || 0; return t; };
    const last5 = s(Y - 5, Y - 1), prev5 = s(Y - 10, Y - 6);
    return Object.assign(u, { label: u.name_ar || u.name, last5, growth: prev5 ? last5 / prev5 - 1 : 0, oa: u.oa_share || 0, h: u.h || 0 });
  });
  const sUop = SU.find(u => u.afid === (udata.uop_afid || '60040839'));
  const SM = { docs: ['وثائق Scopus', R.n], h: ['h-index', R.n], last5: ['وثائق آخر 5 سنوات', R.n], growth: ['النمو (5 سنوات)', v => (v >= 0 ? '+' : '') + R.pct(v)], oa: ['الوصول المفتوح', v => R.pct(v)] };
  const sRank = k => [...SU].sort((a, b) => b[k] - a[k]).findIndex(u => u === sUop) + 1;
  const scHTML = sUop ? `
  <section class="rs-section"><h2><i class="bi bi-bar-chart-line"></i>حسب Scopus <small>المصدر المعتمد · ${SU.length} جامعة أردنية · يُحدَّث أسبوعياً</small></h2>
    <div class="rs-kpis">${Object.entries(SM).map(([k, v], n) => `<div class="rs-kpi scopus"><div class="v">#${sRank(k)} <small class="fs-6 text-muted">من ${SU.length}</small></div><div class="l">${v[0]}</div><div class="d">جامعة البترا: <b>${v[1](sUop[k])}</b> ${R.srcBadge('تحقق', R.scopusOrgUrl(sUop.afid))}</div></div>`).join('')}</div>
  </section>
  <section class="rs-section rs-card">
    <h3><i class="bi bi-bar-chart"></i>ترتيب الجامعات في Scopus حسب <select id="s-metric" class="form-select form-select-sm d-inline-block w-auto">${Object.entries(SM).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select> <small class="fw-normal text-muted">اضغط على جامعة لفتح صفحتها في Scopus</small></h3>
    <div class="rs-chart tall" style="height:${Math.max(380, SU.length * 22)}px"><canvas id="s-bar"></canvas></div>
  </section>
  <section class="rs-section rs-grid wide">
    <div class="rs-card"><h3><i class="bi bi-graph-up"></i>وثائق Scopus سنوياً <small class="fw-normal text-muted">البترا مقابل الجامعات المختارة أدناه</small></h3><div class="rs-chart"><canvas id="s-line"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>المجالات في Scopus: البترا مقابل <select id="s-vs" class="form-select form-select-sm d-inline-block w-auto">${SU.filter(u => u !== sUop).map(u => `<option value="${u.afid}">${R.esc(u.label)}</option>`).join('')}</select></h3>
      <div class="rs-chart tall"><canvas id="s-fields"></canvas></div><p class="rs-note mb-0">النسبة من وثائق كل جامعة (قد تُصنَّف الوثيقة في أكثر من مجال).</p></div>
  </section>
  <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>الجامعات الأردنية في Scopus</h3>
    <div class="rs-scroll"><table class="rs-table" id="s-table"></table></div>
    <p class="rs-note mt-2 mb-0">الأعداد من واجهة Scopus الرسمية حسب رقم انتماء كل جامعة (AF-ID)؛ افتح رابط الجامعة للتحقق. h-index للمؤسسة محسوب من وثائقها الأعلى اقتباساً.</p>
  </section>
  <h2 class="rs-h mt-4"><i class="bi bi-globe2"></i>مصدر مكمّل: OpenAlex <small>تغطية أوسع تشمل ما لا يفهرسه Scopus</small></h2>` : '';

  app.innerHTML = scHTML + `
  <section class="rs-section rs-kpis">
    ${[['works', 'bi-journal-text'], ['cites', 'bi-quote'], ['h', 'bi-graph-up'], ['cpw', 'bi-award'], ['growth', 'bi-rocket-takeoff']].map(([k, i], n) => `
      <div class="rs-kpi ${['', 'gold', 'navy', 'teal', ''][n]}"><div class="v">#${rank(k)} <small class="fs-6 text-muted">من ${U.length}</small></div><div class="l"><i class="bi ${i}"></i>${metrics[k][0]}</div><div class="d">جامعة البترا: <b>${metrics[k][1](uop[k])}</b></div></div>`).join('')}
    <div class="rs-kpi"><div class="v" style="font-size:1rem">تحقّق</div><div class="d d-flex flex-column gap-1 mt-1">${R.srcBadge('البترا في OpenAlex', R.oaInstUrl(uop.id), 'bi-globe2')}${R.srcBadge('البترا في Scopus', R.scopusOrgUrl(meta.scopus_afid || '60040839'), 'bi-bar-chart-line')}</div></div>
  </section>

  <section class="rs-section rs-card">
    <h3><i class="bi bi-bar-chart"></i>ترتيب الجامعات حسب <select id="u-metric" class="form-select form-select-sm d-inline-block w-auto">${Object.entries(metrics).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select> ${R.srcBadge('OpenAlex', 'https://openalex.org/institutions?filter=country_code:JO', 'bi-globe2')}</h3>
    <div class="rs-chart tall" style="height:${Math.max(380, U.length * 22)}px"><canvas id="u-bar"></canvas></div>
  </section>

  <section class="rs-section rs-grid wide">
    <div class="rs-card rs-span-2"><h3><i class="bi bi-graph-up"></i>المنشورات سنوياً <small class="fw-normal text-muted">اختر الجامعات من القائمة أدناه</small></h3>
      <div class="rs-chips mb-2" id="u-chips"></div><div class="rs-chart"><canvas id="u-line"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-bullseye"></i>الحجم مقابل الأثر <small class="fw-normal text-muted">حجم الدائرة = h-index</small></h3><div class="rs-chart tall"><canvas id="u-bubble"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>المجالات: البترا مقابل <select id="u-vs" class="form-select form-select-sm d-inline-block w-auto">${U.filter(u => u.id !== uop.id).map(u => `<option value="${u.id}"${u.id === peers[0] ? ' selected' : ''}>${R.esc(u.label)}</option>`).join('')}</select></h3>
      <div class="rs-chart tall"><canvas id="u-fields"></canvas></div><p class="rs-note mb-0">النسبة من منشورات كل جامعة، لتُقارَن الجامعات المختلفة الحجم.</p></div>
  </section>

  <section class="rs-section rs-card">
    <h3><i class="bi bi-table"></i>جدول الجامعات الأردنية</h3>
    <div class="rs-scroll"><table class="rs-table" id="u-table"></table></div>
    <p class="rs-note mt-2 mb-0">المصدر: OpenAlex لكل الجامعات بالطريقة نفسها، لذا المقارنة متّسقة. أرقام Scopus الرسمية للبترا على <a href="${R.scopusOrgUrl(meta.scopus_afid || '60040839')}" target="_blank" rel="noopener">صفحتها في Scopus</a>. النمو = منشورات آخر 5 سنوات مكتملة مقارنة بالخمس التي قبلها.</p>
  </section>`;

  const barColor = u => u.id === uop.id ? '#901d23' : sel.includes(u.id) ? '#b8892b' : '#c9c2b2';
  function bar() {
    const s = [...U].sort((a, b) => b[metric] - a[metric]);
    R.chart('u-bar', { type: 'bar', data: { labels: s.map(u => u.label), datasets: [{ label: metrics[metric][0], data: s.map(u => metric === 'growth' || metric === 'oa_share' ? +(u[metric] * 100).toFixed(1) : +(+u[metric]).toFixed(2)), backgroundColor: s.map(barColor), borderRadius: 3 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, onClick: (e, el) => { if (el[0]) window.open(R.oaInstUrl(s[el[0].index].id), '_blank', 'noopener'); }, scales: { y: { ticks: { autoSkip: false, font: { size: 11 } } } } } });
  }
  function line() {
    R.store.set('rs-unis', sel);
    R.$('#u-chips').innerHTML = U.map(u => `<button type="button" class="btn btn-sm ${sel.includes(u.id) ? 'btn-rs' : 'btn-rs-o'}" data-u="${u.id}">${R.esc(u.label)}</button>`).join('');
    const years = []; for (let y = Y - 15; y <= Y; y++) years.push(y);
    R.chart('u-line', { type: 'line', data: { labels: years, datasets: sel.map(id => U.find(u => u.id === id)).filter(Boolean).map((u, i) => ({ label: u.label, data: years.map(y => ((u.by_year || {})[y] || [0])[0]), borderColor: u.id === uop.id ? '#901d23' : R.colors[(i + 1) % R.colors.length], backgroundColor: u.id === uop.id ? '#901d23' : R.colors[(i + 1) % R.colors.length], borderWidth: u.id === uop.id ? 3.5 : 2, tension: .3 })) }, options: { interaction: { mode: 'index', intersect: false } } });
  }
  function bubble() {
    R.chart('u-bubble', { type: 'bubble', data: { datasets: [{ label: 'الجامعات', data: U.map(u => ({ x: u.works, y: +u.cpw.toFixed(2), r: Math.max(4, Math.sqrt(u.h) * 2), u })), backgroundColor: U.map(u => R.alpha(u.id === uop.id ? '#901d23' : '#1f6f78', u.id === uop.id ? .85 : .35)), borderColor: U.map(u => u.id === uop.id ? '#901d23' : '#1f6f78') }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw.u.label}: ${R.n(c.raw.x)} منشور · ${c.raw.y} اقتباس/بحث · h ${c.raw.u.h}` } } }, scales: { x: { type: 'logarithmic', title: { display: true, text: 'عدد المنشورات (مقياس لوغاريتمي)' } }, y: { title: { display: true, text: 'متوسط الاقتباس لكل بحث' } } } } });
  }
  function fields() {
    const other = U.find(u => u.id === R.$('#u-vs').value);
    const share = u => { const t = R.sum((u.fields || []).map(f => f[1])) || 1; const m = {}; (u.fields || []).forEach(f => m[f[0]] = 100 * f[1] / t); return m; };
    const a = share(uop), b = share(other);
    const labels = Object.keys(Object.assign({}, a, b)).sort((x, y) => ((b[y] || 0) + (a[y] || 0)) - ((b[x] || 0) + (a[x] || 0))).slice(0, 14);
    R.chart('u-fields', { type: 'bar', data: { labels, datasets: [{ label: uop.label, data: labels.map(l => +(a[l] || 0).toFixed(1)), backgroundColor: '#901d23', borderRadius: 3 }, { label: other.label, data: labels.map(l => +(b[l] || 0).toFixed(1)), backgroundColor: '#1f6f78', borderRadius: 3 }] }, options: { indexAxis: 'y', scales: { x: { ticks: { callback: v => v + '%' } }, y: { ticks: { font: { size: 10 } } } } } });
  }
  function table() {
    const s = [...U].sort((a, b) => b[sortK] - a[sortK]);
    const th = (k, t) => `<th class="num${sortK === k ? ' sorted' : ''}" data-sort="${k}">${t}</th>`;
    R.$('#u-table').innerHTML = `<thead><tr><th class="num">#</th><th>الجامعة</th>${Object.entries(metrics).map(([k, v]) => th(k, v[0])).join('')}<th class="num">i10</th><th>تحقق</th></tr></thead><tbody>
      ${s.map((u, i) => `<tr class="${u.id === uop.id ? 'me' : ''}"><td class="num">${i + 1}</td><td><b>${R.esc(u.label)}</b><br><small class="text-muted ltr">${R.esc(u.name)}</small></td>
        ${Object.entries(metrics).map(([k, v]) => `<td class="num">${v[1](u[k])}</td>`).join('')}<td class="num">${R.n(u.i10)}</td>
        <td>${R.srcBadge('OpenAlex', R.oaInstUrl(u.id), 'bi-globe2')}${u.url ? ' ' + R.srcBadge('الموقع', u.url, 'bi-house') : ''}</td></tr>`).join('')}</tbody>`;
  }
  if (sUop) {
    let sm = 'docs', sk = 'docs';
    const SUB = udata.subjects || {};
    const sBar = () => { const s = [...SU].sort((a, b) => b[sm] - a[sm]); R.chart('s-bar', { type: 'bar', data: { labels: s.map(u => u.label), datasets: [{ label: SM[sm][0], data: s.map(u => sm === 'growth' || sm === 'oa' ? +(u[sm] * 100).toFixed(1) : u[sm]), backgroundColor: s.map(u => u === sUop ? '#901d23' : '#e9a25f'), borderRadius: 3 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, onClick: (e, el) => { if (el[0]) window.open(R.scopusOrgUrl(s[el[0].index].afid), '_blank', 'noopener'); }, scales: { y: { ticks: { autoSkip: false, font: { size: 11 } } } } } }); };
    const peersS = [...SU].filter(u => u !== sUop).sort((a, b) => Math.abs(a.docs - sUop.docs) - Math.abs(b.docs - sUop.docs)).slice(0, 4);
    R.$('#s-vs').value = peersS[0] ? peersS[0].afid : R.$('#s-vs').value;
    const sLine = () => { const ys = []; for (let y = Y - 14; y <= Y; y++) ys.push(y); R.chart('s-line', { type: 'line', data: { labels: ys, datasets: [sUop, ...peersS].map((u, i) => ({ label: u.label, data: ys.map(y => (u.by_year || {})[y] || 0), borderColor: i ? R.colors[i % R.colors.length] : '#901d23', backgroundColor: i ? R.colors[i % R.colors.length] : '#901d23', borderWidth: i ? 2 : 3.5, tension: .3 })) }, options: { interaction: { mode: 'index', intersect: false } } }); };
    const sFields = () => { const o = SU.find(u => u.afid === R.$('#s-vs').value); const sh = u => { const m = {}; (u.subjects || []).forEach(([c, n]) => m[c] = 100 * n / (u.docs || 1)); return m; }; const a = sh(sUop), b = sh(o);
      const codes = Object.keys(Object.assign({}, a, b)).sort((x, y) => ((a[y] || 0) + (b[y] || 0)) - ((a[x] || 0) + (b[x] || 0))).slice(0, 14);
      R.chart('s-fields', { type: 'bar', data: { labels: codes.map(c => SUB[c] || c), datasets: [{ label: sUop.label, data: codes.map(c => +(a[c] || 0).toFixed(1)), backgroundColor: '#901d23', borderRadius: 3 }, { label: o.label, data: codes.map(c => +(b[c] || 0).toFixed(1)), backgroundColor: '#e9711c', borderRadius: 3 }] }, options: { indexAxis: 'y', scales: { x: { ticks: { callback: v => v + '%' } }, y: { ticks: { font: { size: 10 } } } } } }); };
    const sTable = () => { const s = [...SU].sort((a, b) => b[sk] - a[sk]); const th = (k, t) => `<th class="num${sk === k ? ' sorted' : ''}" data-sort="${k}">${t}</th>`;
      R.$('#s-table').innerHTML = `<thead><tr><th class="num">#</th><th>الجامعة</th>${Object.entries(SM).map(([k, v]) => th(k, v[0])).join('')}<th>أكبر مجال</th><th>تحقق</th></tr></thead><tbody>${s.map((u, i) => `<tr class="${u === sUop ? 'me' : ''}"><td class="num">${i + 1}</td><td><b>${R.esc(u.label)}</b><br><small class="text-muted ltr">${R.esc(u.name)}</small></td>${Object.entries(SM).map(([k, v]) => `<td class="num">${v[1](u[k])}</td>`).join('')}<td>${(u.subjects || [])[0] ? R.esc(SUB[u.subjects[0][0]] || u.subjects[0][0]) : '–'}</td><td>${R.srcBadge('Scopus ' + u.afid, R.scopusOrgUrl(u.afid), 'bi-bar-chart-line')}</td></tr>`).join('')}</tbody>`; };
    R.$('#s-metric').addEventListener('change', e => { sm = e.target.value; sBar(); });
    R.$('#s-vs').addEventListener('change', sFields);
    R.$('#s-table').addEventListener('click', e => { const t = e.target.closest('th[data-sort]'); if (t) { sk = t.dataset.sort; sTable(); } });
    sBar(); sLine(); sFields(); sTable();
  }
  R.$('#u-metric').addEventListener('change', e => { metric = e.target.value; bar(); });
  R.$('#u-chips').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (!b) return; const id = b.dataset.u; sel = sel.includes(id) ? sel.filter(x => x !== id) : sel.concat(id).slice(-8); line(); bar(); });
  R.$('#u-vs').addEventListener('change', fields);
  R.$('#u-table').addEventListener('click', e => { const t = e.target.closest('th[data-sort]'); if (t) { sortK = t.dataset.sort; table(); } });
  bar(); line(); bubble(); fields(); table();
})();
