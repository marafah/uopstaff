/* research.html: the university-wide research dashboard */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata, udata;
  try {
    [data, wdata] = await R.loadAll(['researchers', 'works']);
    udata = await R.load('universities').catch(() => null);
  } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  const meta = data.meta || {}, works = wdata.works || [];
  const Y = meta.year || new Date().getFullYear();
  const uop = udata && (udata.universities || []).find(u => u.id === udata.uop);
  R.updated(meta);
  R.cmp.render();

  // ---------------------------------------------------------------- KPIs
  const active = list.filter(r => r.works > 0);
  const hs = active.map(r => r.h);
  const w5 = works.filter(w => (w.y || 0) >= Y - 4).length;
  const prev5 = works.filter(w => (w.y || 0) >= Y - 9 && (w.y || 0) < Y - 4).length;
  const oaShare = works.filter(w => w.oa).length ? works.filter(R.isOA).length / works.filter(w => w.oa).length : 0;
  const cites = R.sum(works.map(w => w.c));
  const withAny = list.filter(r => r.links && (r.links.scholar || r.links.scopus || r.links.orcid)).length;
  const kp = [
    ['bi-people', R.n(list.length), 'باحث من الهيئة التدريسية', `${R.n(meta.matched_openalex)} مطابَق في OpenAlex`, ''],
    ['bi-journal-text', R.n(works.length), 'منشور (بعد إزالة التكرار)', `<span class="${w5 >= prev5 ? 'up' : 'down'}">${w5 >= prev5 ? '▲' : '▼'} ${R.n(w5)}</span> في آخر 5 سنوات`, 'navy'],
    ['bi-quote', R.k(cites), 'اقتباس (OpenAlex)', uop ? `للجامعة ككل: ${R.k(uop.cites)}` : '', 'gold'],
    ['bi-graph-up', R.median(hs).toFixed(1), 'وسيط h-index للباحثين النشطين', `الأعلى ${Math.max(0, ...hs)}`, 'teal'],
    ['bi-unlock', R.pct(oaShare), 'وصول مفتوح', '', ''],
    ['bi-link-45deg', R.pct(withAny / (list.length || 1)), 'لديهم Scholar أو Scopus أو ORCID', `ORCID: ${R.n((meta.with || {}).orcid)} · Scopus: ${R.n((meta.with || {}).scopus)}`, 'navy']
  ];
  if (meta.scopus_affiliation) kp.push(['bi-bar-chart-line', R.n(meta.scopus_affiliation.docs), 'وثيقة في Scopus', `<a href="${R.scopusOrgUrl(meta.scopus_afid)}" target="_blank" rel="noopener">${R.n(meta.scopus_affiliation.authors)} مؤلف · افتح Scopus</a>`, 'gold']);
  else kp.push(['bi-bar-chart-line', 'Scopus', 'صفحة الجامعة في Scopus', `<a href="${R.scopusOrgUrl(meta.scopus_afid || '60040839')}" target="_blank" rel="noopener">AF-ID ${meta.scopus_afid || '60040839'} ↗</a>`, 'gold']);

  // ---------------------------------------------------------------- aggregations
  const years = []; for (let y = Y - 14; y <= Y; y++) years.push(y);
  const wy = {}; works.forEach(w => { if (w.y) wy[w.y] = (wy[w.y] || 0) + 1; });
  const facs = R.faculties(list);
  // unique works per faculty (a paper by two colleagues in the same faculty counts once)
  const facW = {};
  works.forEach(w => new Set((w.r || []).map(id => byId[id] && byId[id].faculty).filter(Boolean)).forEach(f => {
    const o = facW[f] || (facW[f] = { works: 0, w5: 0, cites: 0 });
    o.works++; o.cites += w.c || 0; if ((w.y || 0) >= Y - 4) o.w5++;
  }));
  const facRows = facs.map(f => {
    const rs = list.filter(r => r.faculty === f), fw = facW[f] || { works: 0, w5: 0, cites: 0 };
    return { f, n: rs.length, works: fw.works, cites: fw.cites, h: R.median(rs.filter(r => r.works).map(r => r.h)), w5: fw.w5,
      scholar: rs.filter(r => r.links.scholar).length, scopus: rs.filter(r => r.links.scopus || r.scopus_id).length, orcid: rs.filter(r => r.links.orcid).length };
  }).sort((a, b) => b.works - a.works);
  const cnt = (arr, key) => { const m = {}; arr.forEach(w => { const k = key(w); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const fields = cnt(works, w => w.f);
  const venues = cnt(works.filter(w => w.v), w => w.v).slice(0, 15);
  const oaSt = cnt(works.filter(w => w.oa), w => w.oa);
  const countries = cnt(works.flatMap(w => (w.cc || []).filter(c => c !== 'JO').map(c => ({ c }))), x => x.c).slice(0, 15);
  const sdgs = cnt(works.flatMap(w => (w.sdg || []).map(s => ({ s }))), x => x.s).slice(0, 10);
  const regionName = new Intl.DisplayNames(['ar'], { type: 'region' });

  // ---------------------------------------------------------------- render
  app.innerHTML = `
  <section class="rs-section rs-kpis">${kp.map(k => `<div class="rs-kpi ${k[4]}"><div class="v">${k[1]}</div><div class="l"><i class="bi ${k[0]}"></i>${k[2]}</div>${k[3] ? `<div class="d">${k[3]}</div>` : ''}</div>`).join('')}</section>

  <section class="rs-section rs-tiles">
    <a class="rs-tile" href="researchers.html"><i class="bi bi-person-lines-fill"></i><span><b>الباحثون</b><small>بحث وتصفية حسب الكلية والقسم والرتبة، وترتيب حسب h-index والاقتباسات</small></span></a>
    <a class="rs-tile" href="publications.html"><i class="bi bi-journal-text"></i><span><b>المنشورات</b><small>كل الأبحاث مع رابط DOI وOpenAlex وScopus للتحقق، وتصدير CSV</small></span></a>
    <a class="rs-tile" href="compare.html"><i class="bi bi-bar-chart-steps"></i><span><b>المقارنة</b><small>قارن حتى 4 باحثين أو كليات أو أقسام بالرسوم</small></span></a>
    <a class="rs-tile" href="universities.html"><i class="bi bi-bank"></i><span><b>الجامعات الأردنية</b><small>موقع جامعة البترا بين الجامعات الأردنية في الإنتاج والاقتباس</small></span></a>
    <a class="rs-tile" href="network.html"><i class="bi bi-diagram-3"></i><span><b>شبكة التعاون</b><small>من يكتب مع من داخل الجامعة، وعبر الكليات</small></span></a>
  </section>

  <section class="rs-section rs-grid wide">
    <div class="rs-card rs-span-2"><h3><i class="bi bi-bar-chart"></i>المنشورات والاقتباسات سنوياً ${R.srcBadge('OpenAlex · صفحات المدرسين', uop ? R.oaInstUrl(uop.id) : '', 'bi-globe2')}</h3><div class="rs-chart"><canvas id="c-years"></canvas></div>
      <p class="rs-note mt-2 mb-0">الأعمدة: منشورات باحثي الجامعة الحاليين بعد دمج المصادر. الخط: الاقتباسات التي تلقتها كل أبحاث الجامعة في تلك السنة (OpenAlex). السنة الحالية غير مكتملة.</p></div>
  </section>

  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-building"></i>الكليات</h3><div class="rs-chart tall"><canvas id="c-fac"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>المجالات البحثية ${R.srcBadge('OpenAlex topics')}</h3><div class="rs-chart tall"><canvas id="c-fields"></canvas></div></div>
  </section>

  <section class="rs-section rs-card">
    <h3><i class="bi bi-table"></i>ملخص الكليات <small class="text-muted fw-normal">انقر اسم الكلية لعرض باحثيها</small></h3>
    <div class="rs-scroll"><table class="rs-table"><thead><tr><th>الكلية</th><th class="num">باحثون</th><th class="num">منشورات</th><th class="num">آخر 5 سنوات</th><th class="num">اقتباسات</th><th class="num">وسيط h</th><th class="num">Scholar</th><th class="num">Scopus</th><th class="num">ORCID</th></tr></thead>
    <tbody>${facRows.map(f => `<tr><td><a href="researchers.html?fac=${encodeURIComponent(f.f)}">${R.esc(f.f)}</a></td><td class="num">${f.n}</td><td class="num">${R.n(f.works)}</td><td class="num">${R.n(f.w5)}</td><td class="num">${R.n(f.cites)}</td><td class="num">${f.h}</td>
      ${['scholar', 'scopus', 'orcid'].map(k => `<td class="num" title="${f[k]} من ${f.n}"><div class="rs-barwrap"><div class="rs-bar" style="width:${Math.round(100 * f[k] / (f.n || 1))}%;background:${k === 'scholar' ? '#4285f4' : k === 'scopus' ? '#e9711c' : '#7fae22'}"></div></div><small>${Math.round(100 * f[k] / (f.n || 1))}%</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="rs-note mt-2 mb-0">أعمدة Scholar وScopus وORCID تبيّن نسبة من أضاف رابط ملفه البحثي في صفحة المدرس على موقع الجامعة؛ إكمالها يرفع دقة المطابقة.</p>
  </section>

  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-trophy"></i>الأعلى أثراً</h3>
      <div class="rs-seg mb-2" id="top-seg"><button class="on" data-k="h">h-index</button><button data-k="cites">الاقتباسات</button><button data-k="w5">نشاط آخر 5 سنوات</button><button data-k="c5">اقتباسات آخر 5 سنوات</button></div>
      <div id="top-list"></div></div>
    <div class="rs-card"><h3><i class="bi bi-journal-bookmark"></i>أكثر المجلات والمؤتمرات نشراً</h3>
      <div class="rs-scroll" style="max-height:430px"><table class="rs-table"><tbody>${venues.map(([v, c], i) => `<tr><td class="num">${i + 1}</td><td class="ltr"><a href="publications.html?q=${encodeURIComponent(v)}">${R.esc(v)}</a></td><td class="num"><b>${c}</b></td></tr>`).join('')}</tbody></table></div></div>
  </section>

  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-unlock"></i>الوصول المفتوح</h3><div class="rs-chart short"><canvas id="c-oa"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-globe-americas"></i>التعاون الدولي <small class="fw-normal">منشورات مشتركة مع كل دولة</small></h3><div class="rs-chart short"><canvas id="c-ctry"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-flower1"></i>أهداف التنمية المستدامة ${R.srcBadge('OpenAlex SDG')}</h3><div class="rs-chart short"><canvas id="c-sdg"></canvas></div></div>
  </section>

  <section class="rs-section rs-card rs-note">
    <h3><i class="bi bi-info-circle"></i>عن البيانات ومصادرها</h3>
    <ul class="mb-0">
      <li><b>صفحة المدرس (موقع الجامعة):</b> روابط Google Scholar وScopus وORCID وJOIP، والاهتمامات البحثية، وقائمة الأبحاث كما أدخلها كل عضو هيئة تدريس.</li>
      <li><b>OpenAlex</b> (<a href="${uop ? R.oaInstUrl(uop.id) : 'https://openalex.org'}" target="_blank" rel="noopener">openalex.org</a>): الأبحاث والاقتباسات والمجالات والمؤلفون المشاركون. تُطابَق الملفات عبر ORCID أولاً ثم بالاسم والانتماء للجامعة، وتظهر طريقة المطابقة على كل باحث.</li>
      <li><b>Scopus</b> (<a href="${R.scopusOrgUrl(meta.scopus_afid || '60040839')}" target="_blank" rel="noopener">صفحة الجامعة</a>): ${meta.scopus_mode === 'api' ? 'تُقرأ عبر واجهة Elsevier البرمجية.' : meta.scopus_mode === 'csv' ? 'من ملف التصدير الموضوع في data/research/scopus_export.' : 'روابط ملفات المؤلفين. أضف مفتاح Elsevier أو ملف تصدير CSV لعرض أرقام Scopus.'}</li>
      <li><b>Google Scholar</b>: ${meta.scholar_mode === 'off' ? 'روابط الملفات فقط.' : 'الاقتباسات وh-index من الملف العام لكل باحث متى أمكن قراءته، مع تاريخ آخر قراءة.'}</li>
      <li>كل منشور يحمل روابط التحقق (DOI وOpenAlex وScopus والناشر). الأرقام تختلف بين المصادر لاختلاف تغطيتها، لذا يُذكر مصدر كل رقم.</li>
    </ul>
  </section>`;

  // charts
  R.chart('c-years', {
    data: { labels: years, datasets: [
      { type: 'bar', label: 'منشورات', data: years.map(y => wy[y] || 0), backgroundColor: years.map(y => y === Y ? R.alpha('#901d23', .45) : '#901d23'), borderRadius: 4, yAxisID: 'y' },
      ...(uop ? [{ type: 'line', label: 'اقتباسات (الجامعة)', data: years.map(y => (uop.by_year[y] || [0, null])[1]), borderColor: '#b8892b', backgroundColor: '#b8892b', tension: .3, yAxisID: 'y2', spanGaps: true, pointRadius: 3 }] : [])
    ] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: 'منشورات' } }, y2: { position: 'right', beginAtZero: true, grid: { display: false }, display: !!uop, title: { display: true, text: 'اقتباسات' } } } }
  });
  R.chart('c-fac', {
    type: 'bar',
    data: { labels: facRows.map(f => f.f), datasets: [
      { label: 'منشورات', data: facRows.map(f => f.works), backgroundColor: '#901d23', borderRadius: 4 },
      { label: 'آخر 5 سنوات', data: facRows.map(f => f.w5), backgroundColor: '#b8892b', borderRadius: 4 }] },
    options: { indexAxis: 'y', onClick: (e, el) => { if (el[0]) location.href = 'researchers.html?fac=' + encodeURIComponent(facRows[el[0].index].f); }, scales: { x: { beginAtZero: true } } }
  });
  R.chart('c-fields', {
    type: 'bar',
    data: { labels: fields.slice(0, 12).map(x => x[0]), datasets: [{ label: 'منشورات', data: fields.slice(0, 12).map(x => x[1]), backgroundColor: R.colors, borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, onClick: (e, el) => { if (el[0]) location.href = 'publications.html?field=' + encodeURIComponent(fields[el[0].index][0]); } }
  });
  const oaColors = { gold: '#d4a017', green: '#2f7d32', hybrid: '#1f6f78', bronze: '#a0522d', diamond: '#6b4c9a', closed: '#b9b4a8' };
  R.chart('c-oa', { type: 'doughnut', data: { labels: oaSt.map(x => R.OA_AR[x[0]] || x[0]), datasets: [{ data: oaSt.map(x => x[1]), backgroundColor: oaSt.map(x => oaColors[x[0]] || '#888') }] }, options: { plugins: { legend: { position: 'right' } }, cutout: '58%' } });
  R.chart('c-ctry', { type: 'bar', data: { labels: countries.map(c => { try { return regionName.of(c[0]); } catch (e) { return c[0]; } }), datasets: [{ data: countries.map(c => c[1]), backgroundColor: '#1f6f78', borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
  R.chart('c-sdg', { type: 'bar', data: { labels: sdgs.map(s => s[0]), datasets: [{ data: sdgs.map(s => s[1]), backgroundColor: '#2f7d32', borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } } } } });

  // top researchers
  const labels = { h: 'h-index', cites: 'اقتباس', w5: 'منشور', c5: 'اقتباس' };
  function top(k) {
    const t = [...list].sort((a, b) => (b[k] || 0) - (a[k] || 0)).slice(0, 10);
    const mx = Math.max(1, ...t.map(r => r[k] || 0));
    R.$('#top-list').innerHTML = `<table class="rs-table"><tbody>${t.map((r, i) => `<tr><td class="num">${i + 1}</td><td><a class="d-flex align-items-center gap-2 text-decoration-none" href="${R.profileUrl(r)}">${R.avatar(r, 'sm')}<span><b>${R.esc(r.name)}</b><br><small class="text-muted">${R.esc(r.dept || r.faculty)}</small></span></a></td><td style="width:35%"><div class="rs-barwrap"><div class="rs-bar" style="width:${100 * (r[k] || 0) / mx}%"></div></div></td><td class="num"><b>${R.n(r[k])}</b><br><small class="text-muted">${labels[k]}</small></td></tr>`).join('')}</tbody></table>`;
  }
  top('h');
  R.$('#top-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; R.$$('#top-seg button').forEach(x => x.classList.toggle('on', x === b)); top(b.dataset.k); });
})();
