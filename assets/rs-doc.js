/* publication.html?id=…: one document in full — abstract, authors and affiliations, publication data,
   subjects, funding, citations per year, how to cite, and a verification link for every source */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  R.cmp.render();

  const key = R.param('id'), doiQ = R.param('doi').toLowerCase();
  const works = wdata.works || [];
  const w = works.find(x => x.id === key || x.eid === key || x.ut === key || x.oid === key) || (doiQ && works.find(x => (x.doi || '').toLowerCase() === doiQ));
  if (!w) {
    app.innerHTML = '<div class="rs-empty"><i class="bi bi-journal-x"></i>لم يُعثر على المنشور. <a href="publications.html">العودة لقائمة المنشورات</a></div>';
    return;
  }
  // details live in 64 small files; the file number is FNV-1a of the id (same as scripts/update_research.py)
  const shard = id => { let h = 2166136261; for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % 64; };
  let d = {};
  if (w.det !== 0) {
    try { const r = await fetch(`data/research/details/${shard(w.id)}.json`, { cache: 'no-cache' }); if (r.ok) d = (await r.json())[w.id] || {}; } catch (e) { /* the page still shows the basic record */ }
  }

  document.title = `${w.t} – المنشورات – جامعة البترا`;
  R.$('#pg-title').textContent = 'تفاصيل المنشور';
  R.$('#pg-sub').textContent = [w.v, w.y].filter(Boolean).join(' · ');

  const esc = R.esc, has = v => v != null && v !== '' && !(Array.isArray(v) && !v.length);
  const regionAr = (() => { try { const dn = new Intl.DisplayNames(['ar'], { type: 'region' }); return c => { try { return dn.of(c); } catch (e) { return c; } }; } catch (e) { return c => c; } })();
  const langAr = (() => { try { const dn = new Intl.DisplayNames(['ar'], { type: 'language' }); return c => { if (!c) return ''; if (c.length > 3) return c; try { return dn.of(c); } catch (e) { return c; } }; } catch (e) { return c => c; } })();
  const uop = (w.r || []).map(id => byId[id]).filter(Boolean);
  const doiUrl = w.doi ? 'https://doi.org/' + w.doi : '';
  const oid = w.oid || (/^W\d+$/.test(w.id) ? w.id : '');
  const wosUrl = w.ut ? 'https://www.webofscience.com/wos/woscc/full-record/' + encodeURIComponent(w.ut) : '';
  const scUrl = w.eid ? R.scopusDocUrl(w.eid) : '';
  const pmUrl = d.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + d.pmid + '/' : '';
  const ext = (href, label, icon, color) => href ? `<a class="rs-link lg" href="${esc(href)}" target="_blank" rel="noopener"><i class="bi ${icon}" style="color:${color}"></i>${label}</a>` : '';

  // ---------------------------------------------------------------- authors: OpenAlex (with institutions), else Scopus, else Web of Science
  let authors = d.authors && d.authors.length ? d.authors : d.sc_authors && d.sc_authors.length > 1 ? d.sc_authors : d.wos_authors && d.wos_authors.length ? d.wos_authors : [];
  const authSrc = authors === d.authors ? 'OpenAlex' : authors === d.sc_authors ? 'Scopus' : authors === d.wos_authors ? 'Web of Science' : '';
  if (!authors.length && w.au) authors = w.au.replace(/ …$/, '').split(/;\s*|,\s*(?=[^,]+(?:,|$))/).map(n => ({ n: n.trim(), aff: [] })).filter(a => a.n);
  // match staff to names when the source carried no ids
  const uopByName = {};
  uop.forEach(r => { [r.name_en, r.name].filter(Boolean).forEach(n => { const p = R.norm(n).split(' '); uopByName[p[0] + ' ' + p[p.length - 1]] = r; }); });
  authors.forEach(a => {
    if (!a.rid) { const p = R.norm(a.n).split(' '); const r = uopByName[p[0] + ' ' + p[p.length - 1]]; if (r) a.rid = r.id; }
  });
  const affList = [];
  const affIdx = s => { let i = affList.indexOf(s); if (i < 0) { affList.push(s); i = affList.length - 1; } return i + 1; };
  const instInfo = {}; (d.insts || []).forEach(i => { instInfo[i.n] = i; });
  const authorsHTML = authors.map((a, i) => {
    const r = a.rid && byId[a.rid];
    const sup = (a.aff || []).map(affIdx);
    const isU = r || a.uop;
    return `<li class="${isU ? 'uop' : ''}">
      <span class="n">${r ? `<a href="${R.profileUrl(r)}" title="الملف البحثي">${esc(a.n)}</a>` : esc(a.n)}</span>${sup.length ? `<sup>${sup.join(',')}</sup>` : ''}
      ${a.corr ? '<i class="bi bi-envelope-fill text-muted" title="المؤلف المراسل"></i>' : ''}
      ${a.orcid ? `<a href="https://orcid.org/${esc(a.orcid)}" target="_blank" rel="noopener" title="ORCID ${esc(a.orcid)}"><i class="bi bi-person-vcard" style="color:#a6ce39"></i></a>` : ''}
      ${a.sc ? `<a href="${R.scopusAuthorUrl(a.sc)}" target="_blank" rel="noopener" title="ملف المؤلف في Scopus"><i class="bi bi-bar-chart-line" style="color:#e9711c"></i></a>` : ''}
      ${a.oa ? `<a href="${R.oaAuthorUrl(a.oa)}" target="_blank" rel="noopener" title="ملف المؤلف في OpenAlex"><i class="bi bi-globe2" style="color:#1d4f80"></i></a>` : ''}
      ${r ? `<span class="rs-tag uopt">${esc(r.name)}</span>` : isU ? '<span class="rs-tag uopt">جامعة البترا</span>' : ''}</li>`;
  }).join('');
  const affHTML = affList.map((s, i) => {
    const info = instInfo[s] || {};
    const isU = info.uop || /petra/i.test(s);
    return `<li class="${isU ? 'uop' : ''}"><sup>${i + 1}</sup> <span class="ltr">${esc(s)}</span>${info.cc ? ` <span class="rs-tag">${esc(regionAr(info.cc))}</span>` : ''}${info.id ? ` <a href="${R.oaInstUrl(info.id)}" target="_blank" rel="noopener" title="المؤسسة في OpenAlex"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</li>`;
  }).join('');
  const countries = [...new Set((d.insts || []).map(i => i.cc).filter(Boolean).concat(w.cc || []))];

  // ---------------------------------------------------------------- publication data
  const issn = [...new Set([].concat(d.issn || [], w.issn ? [w.issn] : []))].map(x => x.replace(/^(\d{4})(\d{3}[\dX])$/i, '$1-$2'));
  const venueBits = [d.vol && `المجلد ${d.vol}`, d.iss && `العدد ${d.iss}`, d.art && `رقم المقالة ${d.art}`, d.pages && `الصفحات ${d.pages}`].filter(Boolean);
  const pubRows = [
    ['المجلة / المصدر', w.v ? `<span class="ltr">${esc(w.v)}</span>` : ''],
    ['تصنيف المجلة', w.q ? `${R.qTag(w.q)} <small class="text-muted">حسب SCImago (SJR) من بيانات Scopus</small>` : ''],
    ['المجلد والعدد والصفحات', venueBits.join(' · ')],
    ['تاريخ النشر', d.date || d.pdate ? `<span class="ltr">${esc(d.date || [d.pdate, w.y].filter(Boolean).join(' '))}</span>` : w.y || ''],
    ['نوع الوثيقة', [R.typeAr(w.type), d.sc_type && `Scopus: ${d.sc_type}`, d.wos_type && `WoS: ${d.wos_type}`].filter(Boolean).map(esc).join(' · ')],
    ['المؤتمر', d.conf ? `<span class="ltr">${esc(d.conf)}</span>` : ''],
    ['الناشر', d.pub || w.pub ? `<span class="ltr">${esc(d.pub || w.pub)}</span>` : ''],
    ['ISSN', issn.length ? `<span class="ltr">${issn.map(esc).join(' · ')}</span>` : ''],
    ['ISBN', (d.isbn || []).length ? `<span class="ltr">${d.isbn.map(esc).join(' · ')}</span>` : ''],
    ['اللغة', esc(langAr(d.lang))],
    ['مرحلة النشر', d.stage === 'Final' ? 'نهائية' : d.stage === 'Article in press' ? 'قيد النشر' : esc(d.stage || '')],
    ['فهارس Web of Science', (d.wos_index || []).map(x => `<span class="rs-tag">${esc(x)}</span>`).join(' ')],
    ['الوصول', R.isOA(w) ? `<span class="rs-tag oa"><i class="bi bi-unlock"></i> ${R.OA_AR[w.oa] || 'مفتوح'}</span>${d.lic ? ` <span class="rs-tag">${esc(d.lic.toUpperCase())}</span>` : ''}${d.doaj ? ' <span class="rs-tag">DOAJ</span>' : ''}` : (w.oa === 'closed' ? 'مغلق (للمشتركين)' : '')],
    ['DOI', w.doi ? `<a class="ltr" href="${esc(doiUrl)}" target="_blank" rel="noopener">${esc(w.doi)}</a>` : ''],
    ['PubMed', d.pmid ? `<a class="ltr" href="${pmUrl}" target="_blank" rel="noopener">${esc(d.pmid)}</a>` : ''],
    ['عدد المراجع', d.refs != null ? R.n(d.refs) : ''],
    ['المؤلف المراسل', d.rp || d.corr ? `<span class="ltr small">${esc(d.rp || d.corr)}</span>` : ''],
  ].filter(x => has(x[1]));

  // ---------------------------------------------------------------- subjects
  const topics = d.topics || [];
  const kwA = d.kw_a || [], kwP = d.kw_plus || d.kw_i || [], kwO = d.kw || [];
  const chips = (arr, cls) => arr.map(k => `<a class="rs-chip ${cls || ''}" href="publications.html?q=${encodeURIComponent(k)}" title="ابحث عن منشورات أخرى"><span class="ltr">${esc(k)}</span></a>`).join('');
  const sdgs = (d.sdg || []).map(s => typeof s === 'string' ? { n: s } : s).concat((w.sdg || []).filter(s => !(d.sdg || []).some(x => (x.n || x) === s)).map(n => ({ n })));

  // ---------------------------------------------------------------- citation
  const auNames = authors.map(a => a.n);
  const apaAuthors = auNames.length ? (auNames.length > 20 ? auNames.slice(0, 19).join(', ') + ', … ' + auNames[auNames.length - 1] : auNames.join(', ')) : (w.au || '');
  const apa = `${apaAuthors} (${w.y || 'n.d.'}). ${w.t}. ${w.v ? w.v : ''}${d.vol ? ', ' + d.vol : ''}${d.iss ? '(' + d.iss + ')' : ''}${d.pages ? ', ' + d.pages : d.art ? ', ' + d.art : ''}.${doiUrl ? ' ' + doiUrl : ''}`;
  const bib = R.bibtex([Object.assign({}, w, { au: auNames.join(', ') || w.au })]).replace(/\n}$/, (d.vol ? `,\n  volume = {${d.vol}}` : '') + (d.iss ? `,\n  number = {${d.iss}}` : '') + (d.pages ? `,\n  pages = {${d.pages.replace('–', '--')}}` : '') + (d.pub ? `,\n  publisher = {${d.pub}}` : '') + '\n}');

  // ---------------------------------------------------------------- other work by the same staff
  const related = works.filter(x => x !== w && (x.r || []).some(id => (w.r || []).includes(id)))
    .sort((a, b) => ((b.sc ?? b.c) || 0) - ((a.sc ?? a.c) || 0)).slice(0, 5);

  const src = (w.src || '');
  const srcRows = [
    ['Scopus', 's', scUrl, w.sc, w.eid, 'bi-bar-chart-line', '#e9711c', 'المصدر المعتمد في الجامعة'],
    ['Web of Science', 'w', wosUrl, w.wc, w.ut, 'bi-journal', '#5e33bf', d.z9 && +d.z9 !== w.wc ? `${R.n(d.z9)} اقتباس في كل قواعد Clarivate` : 'المصدر المعتمد في الجامعة'],
    ['OpenAlex', 'o', oid ? R.oaWorkUrl(oid) : '', w.c, oid, 'bi-globe2', '#1d4f80', 'مصدر مفتوح شامل'],
    ['صفحة المدرس', 'u', w.url || '', null, '', 'bi-building', '#901d23', 'قائمة الأبحاث على موقع الجامعة'],
    ...(src.includes('m') ? [['إدخال يدوي', 'm', '', null, '', 'bi-pencil-square', '#6b4c9a', 'من ملف التعديلات اليدوية']] : []),
  ];

  const metric = (v, label, sub, color, icon, href) => `<div class="m" style="--c:${color}"><span class="ic"><i class="bi ${icon}"></i></span>
    <div><div class="v">${v}</div><div class="l">${label}${href ? ` <a class="vf no-print" href="${esc(href)}" target="_blank" rel="noopener" title="تحقق في المصدر"><i class="bi bi-box-arrow-up-left"></i></a>` : ''}</div><div class="d">${sub}</div></div></div>`;

  app.innerHTML = `
  <nav class="rs-crumbs no-print"><a href="research.html">البحث العلمي</a><i class="bi bi-chevron-left"></i><a href="publications.html">المنشورات</a><i class="bi bi-chevron-left"></i><span>تفاصيل المنشور</span></nav>

  <section class="rs-section rs-card rs-doc-head">
    <div class="tags">${w.y ? `<span class="rs-tag y">${w.y}</span>` : ''}<span class="rs-tag">${esc(R.typeAr(w.type))}</span>${R.qTag(w.q)}${R.isOA(w) ? `<span class="rs-tag oa"><i class="bi bi-unlock"></i> وصول ${R.OA_AR[w.oa] || 'مفتوح'}</span>` : ''}
      ${src.split('').sort((a, b) => 'swougm'.indexOf(a) - 'swougm'.indexOf(b)).map(s => R.SRC[s] ? `<span class="rs-tag src-${s}"><i class="bi bi-check2"></i> ${R.SRC[s].name}</span>` : '').join('')}
      ${(d.wos_index || []).map(x => `<span class="rs-tag" title="${esc(x)}">${esc((x.match(/\(([^)]+)\)/) || [])[1] || x)}</span>`).join('')}</div>
    <h2 class="title" dir="auto">${esc(w.t)}</h2>
    ${w.man ? `<div class="rs-note mb-2"><i class="bi bi-pencil-square"></i> بعض بيانات هذا المنشور مُدخلة أو مصحّحة يدوياً${d.note ? `: ${esc(d.note)}` : ''}.</div>` : ''}
    <div class="by" dir="auto">${authors.slice(0, 12).map(a => { const r = a.rid && byId[a.rid]; return r ? `<a href="${R.profileUrl(r)}"><b>${esc(a.n)}</b></a>` : esc(a.n); }).join('، ')}${authors.length > 12 ? ` <span class="text-muted">و ${authors.length - 12} آخرون</span>` : ''}</div>
    <div class="venue">${w.v ? `<i class="bi bi-journal-bookmark"></i> <span class="ltr">${esc(w.v)}</span>` : ''}${venueBits.length ? ` <span class="text-muted">· ${venueBits.join(' · ')}</span>` : ''}${d.pub ? ` <span class="text-muted">· ${esc(d.pub)}</span>` : ''}</div>
    <div class="rs-links mt-2">${ext(scUrl, 'Scopus', 'bi-bar-chart-line', '#e9711c')}${ext(wosUrl, 'Web of Science', 'bi-journal', '#5e33bf')}${ext(doiUrl, 'DOI', 'bi-link-45deg', '#091b22')}${ext(oid ? R.oaWorkUrl(oid) : '', 'OpenAlex', 'bi-globe2', '#1d4f80')}${ext(pmUrl, 'PubMed', 'bi-capsule', '#326599')}${ext(w.oaurl || d.pdf, 'النص الكامل (مفتوح)', 'bi-unlock', '#17663a')}${ext(w.url && !(w.doi && w.url.includes(w.doi)) ? w.url : d.land && !doiUrl ? d.land : '', 'صفحة الناشر', 'bi-box-arrow-up-left', '#555')}
      <button class="rs-link lg no-print" type="button" id="d-cite"><i class="bi bi-quote"></i>استشهد</button><button class="rs-link lg no-print" type="button" onclick="print()"><i class="bi bi-printer"></i>طباعة</button></div>
  </section>

  <section class="rs-section rs-card rs-doc-metrics">
    ${metric(w.sc != null ? R.n(w.sc) : '–', 'اقتباس Scopus', src.includes('s') ? 'مفهرس في Scopus' : 'غير مدرج بانتماء البترا', '#e9711c', 'bi-bar-chart-line', scUrl)}
    ${metric(w.wc != null ? R.n(w.wc) : '–', 'اقتباس Web of Science', src.includes('w') ? (d.z9 ? `${R.n(d.z9)} في كل قواعد Clarivate` : 'في WoS Core Collection') : 'غير مدرج في ملف الجامعة', '#5e33bf', 'bi-journal', wosUrl)}
    ${metric(R.n(w.c), 'اقتباس OpenAlex', w.fwci != null ? `FWCI <b>${w.fwci}</b> · ${w.fwci >= 1 ? 'فوق' : 'دون'} المتوسط العالمي` : 'FWCI غير متوفر', '#1f6f78', 'bi-globe2', oid ? R.oaWorkUrl(oid) : '')}
    ${metric(R.n(authors.length || w.na), 'مؤلفون', `${uop.length} من جامعة البترا${countries.length ? ` · ${countries.length} ${countries.length > 2 ? 'دول' : 'دولة'}` : ''}`, '#2b5ea7', 'bi-people', '')}
    ${d.refs != null ? metric(R.n(d.refs), 'مرجعاً', 'في قائمة مراجع البحث', '#b8892b', 'bi-list-ol', '') : ''}
  </section>

  <section class="rs-section rs-doc-body">
   <div class="rs-doc-main">
    <div class="rs-card o-abs"><h3><i class="bi bi-text-paragraph"></i>الملخص ${d.abs ? `<small class="fw-normal text-muted">المصدر: ${esc(d.abs_src)}</small>` : ''}</h3>
      ${d.abs || d.uop_abs ? `<p class="rs-abstract" dir="auto">${esc(d.abs || d.uop_abs)}</p>` : `<div class="rs-note"><i class="bi bi-info-circle"></i> لا يتوفر الملخص في المصادر المفتوحة لهذا البحث. ${doiUrl ? `<a href="${esc(doiUrl)}" target="_blank" rel="noopener">اقرأه عند الناشر</a>` : ''}</div>`}
      ${kwA.length ? `<div class="rs-kw"><b>الكلمات المفتاحية للمؤلفين</b><div class="rs-chips">${chips(kwA)}</div></div>` : ''}
      ${kwP.length ? `<div class="rs-kw"><b>${d.kw_plus ? 'Keywords Plus (Web of Science)' : 'كلمات الفهرسة (Scopus)'}</b><div class="rs-chips">${chips(kwP, 'soft')}</div></div>` : ''}
      ${kwO.length && !kwA.length ? `<div class="rs-kw"><b>كلمات مفتاحية (OpenAlex)</b><div class="rs-chips">${chips(kwO, 'soft')}</div></div>` : ''}
    </div>

    <div class="rs-card o-topic"><h3><i class="bi bi-diagram-3"></i>التصنيف الموضوعي</h3>
      ${topics.length ? topics.map((t, i) => `<div class="rs-topic${i ? ' sec' : ''}"><div class="path ltr">${[t.d, t.f, t.sf].filter(Boolean).map(esc).join(' › ')}</div><div class="t ltr">${esc(t.t)}${t.s ? ` <small class="text-muted">(${Math.round(t.s * 100)}%)</small>` : ''}</div></div>`).join('') + '<div class="rs-note mt-1">تصنيف OpenAlex للمواضيع</div>' : (w.topic ? `<div class="rs-topic"><div class="path ltr">${esc([w.f, w.sf].filter(Boolean).join(' › '))}</div><div class="t ltr">${esc(w.topic)}</div></div>` : '')}
      ${(d.wos_cat || []).length ? `<h4 class="rs-sub">فئات Web of Science</h4><div class="rs-chips">${d.wos_cat.map(c => `<span class="rs-chip"><span class="ltr">${esc(c)}</span></span>`).join('')}</div>` : ''}
      ${(d.wos_area || []).length && (d.wos_area.join() !== (d.wos_cat || []).join()) ? `<h4 class="rs-sub">مجالات البحث (WoS)</h4><div class="rs-chips">${d.wos_area.map(c => `<span class="rs-chip"><span class="ltr">${esc(c)}</span></span>`).join('')}</div>` : ''}
      ${sdgs.length ? `<h4 class="rs-sub">أهداف التنمية المستدامة</h4><div class="rs-chips">${sdgs.map(s => `<span class="rs-chip sdg"><i class="bi bi-globe-americas"></i><span class="ltr">${esc(s.n)}</span></span>`).join('')}</div>` : ''}
      ${!topics.length && !w.topic && !(d.wos_cat || []).length && !sdgs.length ? '<div class="rs-note">لا يتوفر تصنيف موضوعي.</div>' : ''}
    </div>

    ${(d.fund || []).length || d.fund_txt ? `<div class="rs-card o-fund"><h3><i class="bi bi-cash-coin"></i>التمويل</h3>
      ${(d.fund || []).length ? `<ul class="rs-fund">${d.fund.map(f => `<li class="${/petra/i.test(f) ? 'uop' : ''}"><span class="ltr">${esc(f)}</span></li>`).join('')}</ul>` : ''}
      ${d.fund_txt ? `<details class="mt-2"><summary>نص الشكر والتمويل</summary><p class="small ltr mt-2">${esc(d.fund_txt)}</p></details>` : ''}</div>` : ''}

    ${(d.cby || []).length ? `<div class="rs-card o-cby"><h3><i class="bi bi-graph-up"></i>الاقتباسات حسب السنة <small class="fw-normal text-muted">OpenAlex</small></h3><div class="rs-chart short"><canvas id="d-cby"></canvas></div></div>` : ''}

    ${uop.length ? `<div class="rs-card o-uop"><h3><i class="bi bi-mortarboard"></i>باحثو جامعة البترا في هذا البحث</h3>
      <div class="rs-people-row">${uop.map(r => `<a class="rs-person-mini" href="${R.profileUrl(r)}">${R.avatar(r)}<span><b>${esc(r.name)}</b><small>${esc([r.rank, r.dept].filter(Boolean).join(' · '))}</small><small>Scopus: ${r.sc ? `${R.n(r.sc.docs)} وثيقة · h ${r.sc.h}` : '–'}</small></span></a>`).join('')}</div>
      ${related.length ? `<h4 class="rs-sub mt-3 no-print">منشورات أخرى لهم</h4><div class="rs-pubs no-print">${related.map(x => R.pubHTML(x, { byId, showUop: true })).join('')}</div>` : ''}
    </div>` : ''}
   </div>
   <aside class="rs-doc-side">
    <div class="rs-card o-pub"><h3><i class="bi bi-card-list"></i>بيانات النشر</h3>
      <table class="rs-table rs-kv"><tbody>${pubRows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
    </div>

    <div class="rs-card o-auth"><h3><i class="bi bi-people"></i>المؤلفون والانتماءات ${authSrc ? `<small class="fw-normal text-muted">من ${authSrc}</small>` : ''}</h3>
      ${authors.length ? `<ol class="rs-authors">${authorsHTML}</ol>` : '<div class="rs-note">لا تتوفر قائمة المؤلفين.</div>'}
      ${affList.length ? `<h4 class="rs-sub">المؤسسات</h4><ol class="rs-affs">${affHTML}</ol>` : ''}
      ${countries.length ? `<h4 class="rs-sub">الدول المشاركة</h4><div class="rs-chips">${countries.map(c => `<span class="rs-chip">${esc(regionAr(c))}</span>`).join('')}</div>` : ''}
    </div>

    <div class="rs-card o-src"><h3><i class="bi bi-patch-check"></i>المصادر وروابط التحقق</h3>
      <table class="rs-table"><thead><tr><th>المصدر</th><th class="num">اقتباسات</th><th>المعرّف</th></tr></thead><tbody>
      ${srcRows.map(([n, k, href, c, id, ic, col, note]) => `<tr class="${src.includes(k) ? '' : 'text-muted'}"><td><i class="bi ${ic}" style="color:${col}"></i> <b>${n}</b><br><small class="text-muted">${src.includes(k) ? note : 'غير مدرج'}</small></td>
        <td class="num">${src.includes(k) && c != null ? `<b>${R.n(c)}</b>` : '–'}</td>
        <td>${href ? `<a class="ltr small" href="${esc(href)}" target="_blank" rel="noopener">${esc(id || 'افتح')} <i class="bi bi-box-arrow-up-left"></i></a>` : '–'}</td></tr>`).join('')}
      </tbody></table>
      <div class="rs-note mt-2"><i class="bi bi-info-circle"></i> لكل قاعدة بيانات تغطيتها وطريقة عدّها، لذلك تختلف أعداد الاقتباسات بينها. آخر تحديث أسبوعي.</div>
    </div>

    <div class="rs-card o-cite"><h3><i class="bi bi-quote"></i>كيف تستشهد بهذا البحث</h3>
      <div class="rs-cite ltr" id="d-apa">${esc(apa)}</div>
      <div class="d-flex gap-2 flex-wrap mt-2 no-print"><button class="btn btn-sm btn-rs" id="d-copy"><i class="bi bi-clipboard"></i> نسخ (APA)</button><button class="btn btn-sm btn-rs-o" id="d-bib"><i class="bi bi-download"></i> BibTeX</button>${doiUrl ? `<a class="btn btn-sm btn-rs-o" href="https://citation.crosscite.org/?doi=${encodeURIComponent(w.doi)}" target="_blank" rel="noopener"><i class="bi bi-list-columns"></i> أنماط أخرى</a>` : ''}</div>
    </div>

   </aside>
  </section>`;

  if ((d.cby || []).length) {
    const ys = d.cby.map(x => x[0]);
    R.chart('d-cby', { type: 'bar', data: { labels: ys, datasets: [{ label: 'اقتباسات', data: d.cby.map(x => x[1]), backgroundColor: '#1f6f78', borderRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  const toast = msg => { const t = document.getElementById('copy-toast'); if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); } };
  R.$('#d-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(apa).then(() => toast('تم نسخ المرجع')); };
  R.$('#d-cite').onclick = () => R.$('#d-apa').scrollIntoView({ behavior: 'smooth', block: 'center' });
  R.$('#d-bib').onclick = () => R.download(bib, (w.doi || w.id).replace(/[^\w.-]+/g, '_') + '.bib', 'application/x-bibtex');
})();
