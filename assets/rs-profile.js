/* researcher.html?id=…: one researcher's research profile */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  let PJ;
  try { [data, wdata, PJ] = await Promise.all([R.load('researchers'), R.load('works'), R.load('projects').catch(() => null)]); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  const meta = data.meta || {}, Y = meta.year || new Date().getFullYear();
  R.updated(meta);
  const key = R.param('id');
  const r = byId[key] || list.find(x => x.uid === key.toLowerCase() || (x.email || '').toLowerCase() === key.toLowerCase());
  if (!r) {
    app.innerHTML = `<div class="rs-empty"><i class="bi bi-person-x"></i>لم يُعثر على الباحث. <a href="researchers.html">العودة لقائمة الباحثين</a></div>`;
    return;
  }
  document.title = `${r.name} – الملف البحثي – جامعة البترا`;
  R.$('#pg-title').textContent = r.name;
  R.$('#pg-sub').textContent = [r.rank, r.dept, r.faculty].filter(Boolean).join(' · ');
  R.cmp.render();

  const works = (wdata.works || []).filter(w => (w.r || []).includes(r.id));
  const L = r.links || {};
  const sch = r.scholar, sc = r.scopus, su = r.sc || null, sq = (su || {}).q || {};
  const oaUrl = (r.oa_ids || [])[0] ? R.oaAuthorUrl(r.oa_ids[0]) : '';
  const scUrl = R.scUrl(r);

  // peers for percentiles
  const peers = { 'القسم': list.filter(x => x.dept && x.dept === r.dept), 'الكلية': list.filter(x => x.faculty === r.faculty), 'الجامعة': list };
  const pctRows = [['h', 'h-index (Scopus)'], ['cites', 'اقتباسات Scopus'], ['docs', 'وثائق Scopus'], ['w5', 'Scopus آخر 5 سنوات']];
  const gv = (x, k) => (x.sc || {})[k] || 0;

  const oaW = works.filter(w => (w.src || '').includes('o'));
  const unmatched = works.filter(w => w.src === 'u');
  const cell = (v, href, extra) => v == null || v === '' ? '<td class="num text-muted">–</td>' : `<td class="num"><b>${R.n(v)}</b>${extra || ''}</td>`;

  // funded projects with this researcher as principal investigator (matched by name, as on projects.html)
  const myProjects = PJ && PJ.projects ? R.linkProjects(PJ.projects.map(p => Object.assign({}, p)), list).filter(p => p.r === r).sort((a, b) => (b.year || 0) - (a.year || 0)) : [];
  app.innerHTML = `
  <section class="rs-section rs-card">
    <div class="rs-prof">
      <span class="rs-photo">${R.avatar(r, 'lg')}</span>
      <div class="flex-grow-1" style="min-width:260px">
        <h2>${R.esc(r.name)}</h2>
        ${r.name_en ? `<div class="en">${R.esc(r.name_en)}</div>` : ''}
        <div class="meta">
          ${r.rank ? `<span class="rs-chip"><i class="bi bi-award"></i>${R.esc(r.rank)}</span>` : ''}${r.job ? `<span class="rs-chip"><i class="bi bi-briefcase"></i>${R.esc(r.job)}</span>` : ''}
          ${r.dept ? `<a class="rs-chip" href="researchers.html?fac=${encodeURIComponent(r.faculty)}&dept=${encodeURIComponent(r.dept)}"><i class="bi bi-diagram-2"></i>${R.esc(r.dept)}</a>` : ''}
          <a class="rs-chip" href="researchers.html?fac=${encodeURIComponent(r.faculty)}"><i class="bi bi-building"></i>${R.esc(r.faculty)}</a>
          ${r.email ? `<a class="rs-chip" href="mailto:${R.esc(r.email)}"><i class="bi bi-envelope"></i><span class="ltr">${R.esc(r.email)}</span></a>` : ''}
          ${R.scBadge(r)}${R.matchBadge(r)}
        </div>
        ${r.spec ? `<div class="rs-note mb-2"><i class="bi bi-mortarboard"></i> ${R.esc(r.spec)}</div>` : ''}
        ${R.linkList(r, true)}
      </div>
      <div class="d-flex flex-column gap-2 no-print">
        <button class="btn btn-rs" id="p-cmp"></button>
        <a class="btn btn-rs-o" href="compare.html?ids=${r.id}"><i class="bi bi-bar-chart-steps"></i> قارن مع زملائه</a>
        <button class="btn btn-rs-o" onclick="print()"><i class="bi bi-printer"></i> طباعة الملف</button>
      </div>
    </div>
  </section>

  <section class="rs-section rs-kpis">
    <div class="rs-kpi scopus"><div class="v">${R.n(su ? su.docs : 0)}</div><div class="l"><i class="bi bi-bar-chart-line"></i>وثيقة في Scopus ${R.srcBadge('افتح', scUrl, 'bi-box-arrow-up-left')}</div><div class="d">بانتماء جامعة البترا · ${R.n(su ? su.w5 : 0)} في آخر 5 سنوات</div>${sc ? `<div class="d rs-kpi-all" title="كل وثائق ملفه في Scopus بكل انتماءاته (كما تظهر في صفحة المؤلف على Scopus)">ملفه الكامل في Scopus: <b>${R.n(sc.docs)}</b> وثيقة</div>` : ''}</div>
    <div class="rs-kpi scopus"><div class="v">${R.n(su ? su.cites : 0)}</div><div class="l"><i class="bi bi-quote"></i>اقتباس في Scopus</div><div class="d">h-index: <b>${su ? su.h : 0}</b> · i10: ${su ? su.i10 : 0}</div>${sc ? `<div class="d rs-kpi-all" title="من كل وثائق ملفه في Scopus بكل انتماءاته">ملفه الكامل: <b>${R.n(sc.cites)}</b> اقتباس · h <b>${R.n(sc.h)}</b></div>` : ''}</div>
    <div class="rs-kpi navy"><div class="v">${(sq.Q1 || 0) + (sq.Q2 || 0)}</div><div class="l"><i class="bi bi-award"></i>أبحاث Q1 و Q2</div><div class="d">Q1 ${sq.Q1 || 0} · Q2 ${sq.Q2 || 0} · Q3 ${sq.Q3 || 0} · Q4 ${sq.Q4 || 0}</div></div>
    ${r.wos ? `<div class="rs-kpi wos"><div class="v">${R.n(r.wos.docs)}</div><div class="l"><i class="bi bi-journal"></i>وثيقة في Web of Science</div><div class="d">${R.n(r.wos.cites)} اقتباس · h ${r.wos.h}</div></div>` : ''}
    <div class="rs-kpi teal"><div class="v">${R.n(r.works)}</div><div class="l"><i class="bi bi-journal-text"></i>كل المنشورات ${R.srcBadge('OpenAlex', oaUrl, 'bi-globe2')}</div><div class="d">${R.n(r.cites)} اقتباس · h ${r.h}</div></div>
    ${sch ? `<div class="rs-kpi"><div class="v">${R.n(sch.cites)}</div><div class="l"><i class="bi bi-google"></i>Google Scholar ${R.srcBadge(r.scholar_at || 'افتح', L.scholar, 'bi-box-arrow-up-left')}</div><div class="d">h ${R.n(sch.h)} · i10 ${R.n(sch.i10)}</div></div>` : ''}
  </section>

  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-clipboard-data"></i>الأرقام حسب المصدر <small class="fw-normal text-muted">لكل مصدر تغطيته الخاصة؛ افتح الرابط للتحقق</small></h3>
      <div class="rs-scroll"><table class="rs-table rs-mtable"><thead><tr><th></th>
        <th class="num">Scopus ${scUrl ? `<a href="${R.esc(scUrl)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}<br><small class="text-muted fw-normal">بانتماء البترا</small></th>
        <th class="num">Web of Science<br><small class="text-muted fw-normal">بانتماء البترا</small></th>
        <th class="num">OpenAlex ${oaUrl ? `<a href="${oaUrl}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</th>
        <th class="num">Scholar ${L.scholar ? `<a href="${R.esc(L.scholar)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</th>
        <th class="num">Scopus ${scUrl ? `<a href="${R.esc(scUrl)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}<br><small class="text-muted fw-normal">ملفه الكامل (كل الانتماءات)</small></th>
        <th class="num">صفحة المدرس ${r.profile ? `<a href="${R.esc(r.profile)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</th></tr></thead>
      <tbody>
        <tr><td>المنشورات</td>${cell(su ? su.docs : null)}${cell(r.wos ? r.wos.docs : null)}${cell(oaW.length)}${cell(null)}${cell(sc ? sc.docs : null)}${cell(r.uop_pubs, '', r.uop_pubs ? `<br><small class="text-muted">${r.uop_matched} مطابَق</small>` : '')}</tr>
        <tr><td>الاقتباسات</td>${cell(su ? su.cites : null)}${cell(r.wos ? r.wos.cites : null)}${cell(R.sum(oaW.map(w => w.c)))}${cell(sch ? sch.cites : null)}${cell(sc ? sc.cites : null)}${cell(null)}</tr>
        <tr><td>h-index</td>${cell(su ? su.h : null)}${cell(r.wos ? r.wos.h : null)}${cell(r.h)}${cell(sch ? sch.h : null)}${cell(sc ? sc.h : null)}${cell(null)}</tr>
        <tr><td>i10-index</td>${cell(su ? su.i10 : null)}${cell(null)}${cell(r.i10)}${cell(sch ? sch.i10 : null)}${cell(sc && sc.i10 != null ? sc.i10 : null)}${cell(null)}</tr>
        <tr><td>Q1 + Q2</td>${cell(su ? (sq.Q1 || 0) + (sq.Q2 || 0) : null)}${cell(null)}${cell(null)}${cell(null)}${cell(null)}${cell(null)}</tr>
      </tbody></table></div>
      <p class="rs-note mt-2 mb-0">${!L.scholar && !L.scopus && !L.orcid ? '<i class="bi bi-exclamation-circle text-warning"></i> لم تُضف روابط Scholar أو Scopus أو ORCID في صفحة المدرس على موقع الجامعة؛ إضافتها تحسّن دقة البيانات.' : ''}
        ${sch && r.scholar_at ? `أرقام Scholar مقروءة بتاريخ ${r.scholar_at}. ` : ''}${L.scholar && !sch ? 'أرقام Google Scholar غير متاحة حالياً؛ افتح الملف من الرابط. ' : ''}</p>
    </div>
    <div class="rs-card"><h3><i class="bi bi-speedometer2"></i>مقارنة بالزملاء <small class="fw-normal text-muted">المئين: نسبة الزملاء الذين يساويهم أو يتجاوزهم</small></h3>
      ${Object.entries(peers).filter(([, p]) => p.length > 2).map(([lbl, p]) => `<div class="mb-2"><b class="small">${lbl} <span class="text-muted fw-normal">(${p.length})</span></b>
        ${pctRows.map(([k, t]) => { const v = R.percentile(p.map(x => gv(x, k)), gv(r, k)); return `<div class="rs-pct"><span>${t}</span><span class="track"><span style="width:${v}%"></span></span><b>${v}</b></div>`; }).join('')}</div>`).join('')}
    </div>
  </section>

  <section class="rs-section rs-grid wide">
    <div class="rs-card rs-span-2"><h3><i class="bi bi-bar-chart"></i>الإنتاج والاقتباسات سنوياً</h3><div class="rs-chart"><canvas id="p-years"></canvas></div></div>
  </section>

  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-bookmark-star"></i>المواضيع البحثية ${R.srcBadge('OpenAlex topics')}</h3>
      ${(r.topics || []).length ? `<div class="rs-chart"><canvas id="p-topics"></canvas></div>` : '<div class="rs-empty py-3">لا توجد مواضيع مصنّفة</div>'}
      ${r.interests ? `<h6 class="fw-bold mt-3">الاهتمامات البحثية (من صفحة المدرس)</h6><p class="rs-note mb-0">${R.esc(r.interests)}</p>` : ''}
      ${r.interests_en && r.interests_en !== r.interests ? `<p class="rs-note ltr text-start mt-1 mb-0">${R.esc(r.interests_en)}</p>` : ''}
    </div>
    <div class="rs-card"><h3><i class="bi bi-people"></i>التعاون</h3>
      <h6 class="fw-bold">زملاء من جامعة البترا</h6>
      <div class="rs-chips mb-3">${(r.coauthors || []).map(([id, c]) => byId[id] ? `<a class="rs-chip" href="${R.profileUrl(byId[id])}">${R.avatar(byId[id], 'sm')}${R.esc(byId[id].name)} <b>${c}</b></a>` : '').join('') || '<span class="text-muted small">لا يوجد</span>'}</div>
      <h6 class="fw-bold">الدول المشاركة</h6>
      <div class="rs-chips mb-3">${(r.countries || []).filter(c => c[0] !== 'JO').map(([c, n]) => { let nm = c; try { nm = new Intl.DisplayNames(['ar'], { type: 'region' }).of(c); } catch (e) { /* keep code */ } return `<span class="rs-chip">${R.esc(nm)} <b>${n}</b></span>`; }).join('') || '<span class="text-muted small">لا يوجد</span>'}</div>
      ${(r.sdgs || []).length ? `<h6 class="fw-bold">أهداف التنمية المستدامة</h6><div class="rs-chips">${r.sdgs.map(([s, n]) => `<span class="rs-chip"><i class="bi bi-flower1 text-success"></i>${R.esc(s)} <b>${n}</b></span>`).join('')}</div>` : ''}
    </div>
  </section>

  ${myProjects.length ? `<section class="rs-section rs-card rs-pj-mine"><h3><i class="bi bi-briefcase"></i>مشاريع بحثية مدعومة من الجامعة <span class="rs-tag y">${myProjects.length}</span>
      <small class="fw-normal text-muted">باحثاً رئيسياً · ${myProjects.filter(p => p.done).length} مكتمل · ${myProjects.filter(p => !p.done).length} مستمر</small>
      <a class="ms-auto small no-print" href="projects.html?q=${encodeURIComponent(R.piKey(r.name))}">كل المشاريع المدعومة <i class="bi bi-arrow-left"></i></a></h3>
    <div class="rs-prj-grid">${myProjects.map(p => R.projectCard(p, { compact: true })).join('')}</div>
    <p class="rs-note mt-2 mb-0">من <a href="${R.esc(PJ.source)}" target="_blank" rel="noopener">قائمة المشاريع البحثية المدعومة</a> في عمادة البحث العلمي؛ الحالة كما تنشرها العمادة.</p></section>` : ''}

  <section class="rs-section">
    <h2><i class="bi bi-journal-text"></i>المنشورات <small id="p-count"></small></h2>
    <div class="rs-toolbar no-print mb-2">
      <div class="fld grow"><label for="p-q">بحث في العناوين</label><input id="p-q" class="form-control" type="search" placeholder="كلمة من العنوان أو المجلة…"></div>
      <div class="fld"><label for="p-type">النوع</label><select id="p-type" class="form-select"><option value="">الكل</option></select></div>
      <div class="fld"><label for="p-src">المصدر</label><select id="p-src" class="form-select"><option value="">كل المصادر</option><option value="s">Scopus</option><option value="sq12">Scopus · Q1 و Q2</option><option value="w">Web of Science</option><option value="o">OpenAlex</option><option value="u">صفحة المدرس</option><option value="nos">خارج Scopus</option><option value="uonly">في صفحة المدرس فقط</option></select></div>
      <div class="fld"><label for="p-sort">ترتيب</label><select id="p-sort" class="form-select"><option value="y">الأحدث</option><option value="c">الأكثر اقتباساً</option></select></div>
      <div class="btns"><button class="btn btn-rs-o" id="p-csv"><i class="bi bi-download"></i> CSV</button><button class="btn btn-rs-o" id="p-bib"><i class="bi bi-braces"></i> BibTeX</button></div>
    </div>
    ${unmatched.length ? `<p class="rs-note"><i class="bi bi-info-circle"></i> ${unmatched.length} من المنشورات المدرجة في صفحة المدرس لم تُطابَق مع OpenAlex أو Scopus (قد تكون في مجلات غير مفهرسة أو بعنوان مختلف). اختر «في صفحة المدرس فقط» لعرضها.</p>` : ''}
    <div class="rs-pubs" id="p-list"></div>
    <div class="text-center mt-3"><button class="btn btn-rs-o d-none" id="p-more">عرض المزيد</button></div>
  </section>`;

  // compare button
  const cb = R.$('#p-cmp');
  const setCb = () => { cb.innerHTML = R.cmp.has(r.id) ? '<i class="bi bi-check2-square"></i> في قائمة المقارنة' : '<i class="bi bi-plus-square"></i> أضف للمقارنة'; };
  cb.onclick = () => { R.cmp.toggle(r.id); setCb(); };
  setCb();

  // per-year chart
  const yrs = Object.keys(r.by_year || {}).map(Number);
  const from = Math.max(Math.min(...yrs, Y - 9), Y - 24), years = [];
  for (let y = from; y <= Y; y++) years.push(y);
  const bySrc = s => years.map(y => works.filter(w => w.y === y && (s === 's' ? (w.src || '').includes('s') : !(w.src || '').includes('s'))).length);
  R.chart('p-years', {
    data: { labels: years, datasets: [
      { type: 'bar', label: 'في Scopus', data: bySrc('s'), backgroundColor: '#e9711c', stack: 'w', yAxisID: 'y', borderRadius: 3 },
      { type: 'bar', label: 'خارج Scopus', data: bySrc('x'), backgroundColor: '#d9cfc0', stack: 'w', yAxisID: 'y', borderRadius: 3 },
      { type: 'line', label: 'اقتباسات تلقّاها (OpenAlex)', data: years.map(y => (r.by_year[y] || [0, 0])[1] || null), borderColor: '#b8892b', backgroundColor: '#b8892b', yAxisID: 'y2', tension: .3, spanGaps: true },
      ...(sch && sch.by_year ? [{ type: 'line', label: 'اقتباسات Google Scholar', data: years.map(y => sch.by_year[y] ?? null), borderColor: '#4285f4', backgroundColor: '#4285f4', borderDash: [5, 4], yAxisID: 'y2', tension: .3, spanGaps: true }] : [])
    ] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { stacked: true, beginAtZero: true, title: { display: true, text: 'منشورات' } }, y2: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'اقتباسات' } }, x: { stacked: true } } }
  });
  if ((r.topics || []).length) R.chart('p-topics', {
    type: 'bar', data: { labels: r.topics.map(t => t[0]), datasets: [{ data: r.topics.map(t => t[2]), backgroundColor: r.topics.map(t => R.facColor(t[1])), borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => r.topics[c.dataIndex][1] } } }, scales: { y: { ticks: { font: { size: 12 } } } } }
  });

  // publications
  const types = [...new Set(works.map(w => R.typeAr(w.type)))];
  R.$('#p-type').insertAdjacentHTML('beforeend', types.map(t => `<option>${R.esc(t)}</option>`).join(''));
  const ps = { q: '', type: '', src: su && su.docs ? 's' : '', sort: 'y', shown: 40 };
  R.$('#p-src').value = ps.src;
  const pf = () => {
    const q = R.norm(ps.q);
    return works.filter(w => (!q || R.norm(w.t + ' ' + (w.v || '')).includes(q)) && (!ps.type || R.typeAr(w.type) === ps.type) &&
      (!ps.src || (ps.src === 'uonly' ? w.src === 'u' : ps.src === 'nos' ? !(w.src || '').includes('s') : ps.src === 'sq12' ? ((w.src || '').includes('s') && (w.q === 'Q1' || w.q === 'Q2')) : (w.src || '').includes(ps.src))))
      .sort(ps.sort === 'c' ? (a, b) => ((b.sc ?? b.c) || 0) - ((a.sc ?? a.c) || 0) : (a, b) => (b.y || 0) - (a.y || 0) || (b.c || 0) - (a.c || 0));
  };
  function renderPubs() {
    const rows = pf();
    R.$('#p-count').textContent = `(${rows.length})`;
    R.$('#p-list').innerHTML = rows.slice(0, ps.shown).map(w => R.pubHTML(w)).join('') || '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد منشورات</div>';
    R.$('#p-more').classList.toggle('d-none', rows.length <= ps.shown);
  }
  R.$('#p-q').addEventListener('input', R.debounce(e => { ps.q = e.target.value; renderPubs(); }));
  ['type', 'src', 'sort'].forEach(k => R.$('#p-' + k).addEventListener('change', e => { ps[k] = e.target.value; ps.shown = 40; renderPubs(); }));
  R.$('#p-more').onclick = () => { ps.shown += 40; renderPubs(); };
  const slug = (r.name_en || r.id).replace(/[^A-Za-z]+/g, '-');
  R.$('#p-csv').onclick = () => R.csv(pf().map(w => ({ year: w.y, title: w.t, venue: w.v, type: w.type, citations: w.c, scopus_citations: w.sc ?? '', open_access: w.oa || '', doi: w.doi ? 'https://doi.org/' + w.doi : '', openalex: (w.oid || (/^W/.test(w.id) ? w.id : '')) ? R.oaWorkUrl(w.oid || w.id) : '', scopus: w.eid ? R.scopusDocUrl(w.eid) : '', link: w.url || '', authors: w.au, sources: w.src })), `${slug}-publications.csv`);
  R.$('#p-bib').onclick = () => R.download(R.bibtex(pf()), `${slug}.bib`);
  renderPubs();
})();
