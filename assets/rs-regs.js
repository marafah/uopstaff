/* regulations.html: the University of Petra's laws, systems and instructions on research, word for word as published
   (transcribed from the official files, checked daily for changes by scripts/regulations_watch.py): a library, a reader
   with contents and the official page of every article, search across all of them, key facts and a glossary */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let D, S;
  try { [D, S] = await R.loadAll(['regulations/docs', 'regulations/sources']); } catch (e) { R.fail(app, e); return; }
  R.updated({ updated: S.checked });
  const esc = R.esc, docs = D.docs, byId = Object.fromEntries(docs.map(d => [d.id, d]));
  const src = Object.fromEntries((S.docs || []).map(d => [d.id, d]));
  const KC = { 'قانون': '#091b22', 'نظام': '#901d23', 'تعليمات': '#1f6f78' };
  const st = { doc: R.param('doc'), a: R.param('a'), q: R.param('q'), kind: '' };

  // the text as printed: footnote markers as superscripts, clause labels on their own lines
  const fmt = t => esc(t).replace(/\^(\*+|\d+)/g, '<sup class="fn">$1</sup>').split('\n').map(l => {
    const m = l.match(/^(\(?[0-9٠-٩]+[.)]|[أ-ي]{1,2}[.)]|ه\.|هـ\.|[–•●-])\s*/);
    return `<p class="${m ? 'cl' : ''}">${m ? `<b class="lb">${m[1]}</b> ${l.slice(m[0].length)}` : l}</p>`;
  }).join('');
  const table = t => `<div class="rs-scroll"><table class="rs-table rs-rg-table">${t.caption ? '' : ''}<thead><tr>${t.rows[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const pdfPage = (d, a) => `${d.url}#page=${a.page}`;
  const docName = d => d.heading[1] ? d.heading[1].replace(/\^\S+/g, '') : d.title;
  const status = d => { const s = src[d.id] || {}; return s.pending
    ? `<span class="rs-tag warn" title="تغيّر الملف الرسمي منذ ${esc(s.pending.since)}"><i class="bi bi-exclamation-triangle"></i> تغيّر المصدر — قيد المراجعة</span>`
    : `<span class="rs-tag ok" title="آخر مقارنة مع الملف الرسمي: ${esc(s.checked || S.checked)}"><i class="bi bi-patch-check"></i> مطابق للنسخة الرسمية</span>`; };

  // key facts: short summaries, each pointing to the exact article
  const FACTS = [
    ['bi-mortarboard', 'الترقية إلى أستاذ مشارك', '8 نقاط على الأقل، منها 6 باحثاً رئيسياً، وبحث فئة أولى باحثاً رئيسياً للكليات العلمية.', '05', '24'],
    ['bi-award', 'الترقية إلى أستاذ', '12 نقطة على الأقل، منها 8 باحثاً رئيسياً، وبحثان فئة أولى باحثاً رئيسياً للكليات العلمية.', '05', '25'],
    ['bi-hourglass-split', 'المدة في الرتبة', 'خمس سنوات على الأقل منها سنتان في الجامعة، وإنتاجان علميان في الجامعة أحدهما فئة أولى أو ثانية.', '05', '19'],
    ['bi-lightning', 'اختصار المدة', 'يجوز اختصار المدة إلى أربع سنوات عند تحقيق ضعف النقاط المطلوبة للترقية.', '02', '13'],
    ['bi-grid-3x3', 'فئات الإنتاج ونقاطه', 'Q1–Q2 أو Web of Science: نقطتان (أولى) · Q3–Q4: نقطتان (ثانية) · Scopus غير مصنفة: نقطة (ثالثة).', '05', '23'],
    ['bi-shield-check', 'نسبة التشابه', 'لا تزيد نسبة التشابه لأي بحث مقدم للترقية على 20%.', '05', '28'],
    ['bi-cash-coin', 'مكافأة النشر في Scopus', 'Q1: 200 دعم نشر + 800 حافز · Q2: 600 · Q3: 400 · Q4 وغير المصنفة: 200 حافز.', '06', '5'],
    ['bi-globe2', 'التعاون الدولي', 'يضاف 200 دينار للبحث المنشور مع باحثين دوليين من جامعات أو مراكز بحثية عالمية.', '06', '5'],
    ['bi-people', 'توزيع المكافأة على الباحثين', 'منفرد 100% · اثنان 60/40 · ثلاثة: 50% للأول · أربعة فأكثر: 35% للأول والباقي بالتساوي.', '06', '5'],
    ['bi-briefcase', 'مكافأة مشروع بحث مدعوم', '10% لباحث منفرد، 15% لباحثين، 20% لثلاثة فأكثر من قيمة الدعم، وبحد أعلى 2000 دينار.', '06', '5'],
    ['bi-airplane', 'المؤتمرات العلمية', 'مؤتمر واحد في العام الدراسي، وبحد أعلى 2000 دينار للتذكرة والرسوم والمياومات.', '06', '6'],
    ['bi-sun', 'منحة البحث الصيفي', 'تفريغ عضو الهيئة التدريسية في الفصل الصيفي لإجراء بحوثه، وبحد أقصى 3 أشهر.', '06', '6'],
    ['bi-calendar-range', 'إجازة التفرغ العلمي', 'سنة كاملة أو فصلان عن كل ست سنوات خدمة، لرتبتي أستاذ وأستاذ مشارك.', '02', '19'],
    ['bi-clock', 'العبء التدريسي', 'الحد الأعلى: أستاذ 9 ساعات، أستاذ مشارك ومساعد 12، مدرس مساعد 15.', '02', '17'],
  ];

  app.innerHTML = `
  <section class="rs-section rs-rg-hero">
    <div class="rs-rg-stats">
      <div><b>${docs.length}</b><small>وثيقة</small></div><div><b>${R.n(docs.reduce((t, d) => t + d.articles.length, 0))}</b><small>مادة</small></div>
      <div><b>${docs.reduce((t, d) => t + d.tables.length, 0)}</b><small>جدولاً</small></div><div><b>${esc(S.checked)}</b><small>آخر تحقق من المصدر</small></div>
    </div>
    <div class="rs-rg-search"><i class="bi bi-search"></i><input id="rg-q" type="search" placeholder="ابحث في كل التعليمات والأنظمة: الترقية، المكافأة، المؤتمر، التفرغ، التشابه…" value="${esc(st.q)}"></div>
    ${(S.changes || []).length ? `<div class="rs-alert-warn mt-2"><i class="bi bi-exclamation-triangle"></i> تغيّرت ${S.changes.length} وثيقة في موقع الجامعة منذ آخر نقل للنص، والنص المعروض لها قيد المراجعة: ${S.changes.map(c => esc(c.title)).join('، ')}.</div>` : ''}
  </section>

  <nav class="rs-tabs no-print" id="rg-tabs"><button data-t="facts"><i class="bi bi-lightbulb"></i> أهم ما يحتاجه الباحث</button><button data-t="library"><i class="bi bi-collection"></i> المكتبة</button>
    <button data-t="read"><i class="bi bi-book"></i> القارئ</button><button data-t="glossary"><i class="bi bi-alphabet"></i> المصطلحات</button>
    <a class="ms-auto rs-rg-tool" href="promotion.html"><i class="bi bi-ladder"></i> أداة الترقية</a><a class="rs-rg-tool" href="reward.html"><i class="bi bi-calculator"></i> حاسبة المكافأة</a></nav>
  <div id="rg-results"></div>
  <section data-tab="facts" class="rs-section"><div class="rs-rg-facts">${FACTS.map(f => `<a class="rs-rg-fact" href="?doc=${f[3]}&a=${f[4]}"><i class="bi ${f[0]}"></i><div><b>${f[1]}</b><p>${f[2]}</p>
    <small><i class="bi bi-link-45deg"></i> ${esc(docName(byId[f[3]]))} · المادة (${f[4]})</small></div></a>`).join('')}</div>
    <p class="rs-note mt-2">هذه ملخصات للتيسير؛ النص الملزم هو نص المادة كما في الوثيقة الرسمية (اضغط أي بطاقة لقراءته).</p></section>
  <section data-tab="library" class="rs-section"><div class="rs-seg mb-3" id="rg-kind"><button data-k="" class="on">الكل</button><button data-k="قانون">القوانين</button><button data-k="نظام">الأنظمة</button><button data-k="تعليمات">التعليمات</button></div>
    <div class="rs-rg-lib" id="rg-lib"></div></section>
  <section data-tab="read" class="rs-section" id="rg-read"></section>
  <section data-tab="glossary" class="rs-section" id="rg-gloss"></section>
  <p class="rs-note">المصدر: <a href="${esc(S.source_pages[0])}" target="_blank" rel="noopener">التعليمات والأنظمة — البحث العلمي، جامعة البترا</a> و<a href="${esc(S.source_pages[1])}" target="_blank" rel="noopener">دليل القوانين والأنظمة والتعليمات</a>.
    نُقل النص حرفياً من الملفات الرسمية، ويُقارَن كل يوم بالملفات المنشورة؛ عند أي تغيير تظهر علامة على الوثيقة. الصفحة غير رسمية، والمرجع المعتمد هو الملف الرسمي.</p>`;

  // ---------------------------------------------------------------- library
  function library() {
    R.$$('#rg-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === st.kind));
    R.$('#rg-lib').innerHTML = docs.filter(d => !st.kind || d.kind === st.kind).map(d => `<article class="rs-rg-doc" style="--kc:${KC[d.kind]}">
      <div class="top"><span class="kind">${esc(d.kind)}</span><span class="rs-tag y">${esc(d.heading[0] || '')}</span></div>
      <h4>${esc(docName(d))}</h4>
      <div class="meta"><span><i class="bi bi-list-ol"></i> ${d.articles.length} مادة</span>${d.tables.length ? `<span><i class="bi bi-table"></i> ${d.tables.length} جدول</span>` : ''}<span><i class="bi bi-file-earmark-pdf"></i> ${d.pages} صفحات</span></div>
      ${status(d)}
      <div class="acts"><a class="btn btn-sm btn-rs" href="?doc=${d.id}"><i class="bi bi-book"></i> اقرأ</a><a class="btn btn-sm btn-rs-o" href="${esc(d.url)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> الوثيقة الرسمية</a></div></article>`).join('');
  }

  // ---------------------------------------------------------------- reader
  function reader() {
    const d = byId[st.doc] || byId['06'];
    let tIdx = 0;
    const tablesOf = n => d.tables.filter(t => String(t.article) === n);
    const art = a => { const ts = tablesOf(a.n); let k = 0;
      const body = fmt(a.text).replace(/<p class="">\[جدول\]<\/p>|\[جدول\]/g, () => { const t = ts[k++]; return t ? table(t) : ''; });
      return `<article class="rs-rg-art${st.a === a.n ? ' hit' : ''}" id="a-${a.n}">
        ${a.section ? `<h3 class="rs-rg-sec">${esc(a.section)}</h3>` : ''}
        <header><b>${esc(a.label.replace(/\^\S+/g, ''))}</b><span class="no-print">
          <button type="button" class="rs-ib" data-copy="${a.n}" title="نسخ نص المادة"><i class="bi bi-clipboard"></i></button>
          <button type="button" class="rs-ib" data-link="${a.n}" title="نسخ رابط المادة"><i class="bi bi-link-45deg"></i></button>
          <a class="rs-ib" href="${esc(pdfPage(d, a))}" target="_blank" rel="noopener" title="الصفحة ${a.page} في الوثيقة الرسمية"><i class="bi bi-file-earmark-pdf"></i></a></span></header>
        <div class="body">${body}${ts.slice(k).map(table).join('')}</div></article>`; };
    tIdx = tIdx; // tables are placed at their markers above
    const toc = d.articles.map(a => `${a.section ? `<li class="sec">${esc(a.section)}</li>` : ''}<li><a href="#a-${a.n}" data-a="${a.n}">${esc(a.label.replace(/\^\S+/g, ''))}<small>${esc(a.text.replace(/\^\S+/g, '').split('\n')[0].slice(0, 46))}…</small></a></li>`).join('');
    R.$('#rg-read').innerHTML = `<div class="rs-rg-reader">
      <aside class="rs-rg-toc no-print"><select class="form-select mb-2" id="rg-doc">${docs.map(x => `<option value="${x.id}"${x.id === d.id ? ' selected' : ''}>${esc(docName(x))}</option>`).join('')}</select>
        <input class="form-control form-control-sm mb-2" id="rg-filter" type="search" placeholder="تصفية المواد…"><ol id="rg-toc">${toc}</ol></aside>
      <div class="rs-rg-text">
        <header class="rs-rg-head" style="--kc:${KC[d.kind]}"><span class="kind">${esc(d.kind)}</span>${d.heading.map((h, i) => `<div class="h${i}">${fmt(h).replace(/<\/?p[^>]*>/g, '')}</div>`).join('')}
          <div class="meta">${status(d)}<a class="rs-tag" href="${esc(d.url)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> الملف الرسمي</a>
          <button type="button" class="rs-tag no-print" onclick="print()"><i class="bi bi-printer"></i> طباعة</button></div></header>
        ${d.articles.map(art).join('')}
        ${d.footnotes.length ? `<footer class="rs-rg-notes"><h4>الحواشي</h4>${d.footnotes.map(f => `<p><sup>${esc(f.n)}</sup> ${esc(f.text)}</p>`).join('')}</footer>` : ''}
      </div></div>`;
    R.$('#rg-doc').onchange = e => { st.doc = e.target.value; st.a = ''; setUrl(); reader(); window.scrollTo({ top: R.$('#rg-read').offsetTop - 90 }); };
    R.$('#rg-filter').oninput = e => { const t = R.norm(e.target.value); R.$$('#rg-toc li').forEach(li => { li.hidden = t && !li.classList.contains('sec') && !R.norm(li.textContent).includes(t); }); };
    if (st.a) setTimeout(() => { const el = document.getElementById('a-' + st.a); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); }, 60);
  }

  // ---------------------------------------------------------------- search across all documents
  function search() {
    const box = R.$('#rg-results'), q = (st.q || '').trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const t = R.norm(q).split(' ').filter(Boolean), hits = [];
    docs.forEach(d => d.articles.forEach(a => { const n = R.norm(a.text); if (t.every(x => n.includes(x))) hits.push([d, a]); }));
    const snip = s => { s = s.replace(/\^\S+/g, ''); const i = Math.max(0, R.norm(s).indexOf(t[0]) - 60); let h = esc(s.slice(i, i + 220));
      t.forEach(x => { h = h.replace(new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => `<mark>${m}</mark>`); }); return (i ? '…' : '') + h + '…'; };
    box.innerHTML = `<section class="rs-section rs-card"><h3><i class="bi bi-search"></i>نتائج البحث عن «${esc(q)}» <span class="rs-tag y">${hits.length}</span></h3>
      ${hits.length ? `<div class="rs-rg-hits">${hits.slice(0, 60).map(([d, a]) => `<a href="?doc=${d.id}&a=${a.n}" class="rs-rg-hit" style="--kc:${KC[d.kind]}"><b>${esc(docName(d))} · ${esc(a.label.replace(/\^\S+/g, ''))}</b><span>${snip(a.text)}</span></a>`).join('')}</div>`
        : '<div class="rs-empty py-3">لا نتائج</div>'}</section>`;
  }

  // ---------------------------------------------------------------- glossary: every "term: meaning" of the definitions articles
  function glossary() {
    const G = [];
    docs.forEach(d => { const a = d.articles.find(x => x.n === '2') || d.articles[1]; if (!a) return;
      a.text.split('\n').slice(1).forEach(l => { const m = l.match(/^([^:]{2,40}):+\s*(.+)$/); if (m) G.push([m[1].trim().replace(/\^\S+/g, ''), m[2].trim(), d]); }); });
    G.sort((x, y) => x[0].localeCompare(y[0], 'ar'));
    R.$('#rg-gloss').innerHTML = `<div class="rs-rg-gloss">${G.map(([t, m, d]) => `<div class="g"><b>${esc(t)}</b><p>${esc(m)}</p><a href="?doc=${d.id}&a=2"><i class="bi bi-link-45deg"></i> ${esc(docName(d))}</a></div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- tabs and events
  function showTab(t) {
    R.$$('#rg-tabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = el.dataset.tab !== t; });
    if (t === 'read') reader();
  }
  function setUrl() { const u = new URL(location); [['doc', st.doc], ['a', st.a], ['q', st.q]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u); }
  library(); glossary(); search();
  showTab(st.doc ? 'read' : 'facts');
  R.$('#rg-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); });
  R.$('#rg-kind').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { st.kind = b.dataset.k; library(); } };
  R.$('#rg-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; setUrl(); search(); }, 250));
  app.addEventListener('click', e => {
    const c = e.target.closest('[data-copy],[data-link]'); if (!c) return;
    const d = byId[st.doc] || byId['06'], a = d.articles.find(x => x.n === (c.dataset.copy || c.dataset.link));
    const txt = c.dataset.copy ? `${docName(d)} — ${a.label.replace(/\^\S+/g, '')}\n${a.text.replace(/\^\S+/g, '')}` : `${location.origin}${location.pathname}?doc=${d.id}&a=${a.n}`;
    navigator.clipboard && navigator.clipboard.writeText(txt).then(() => { const t = document.getElementById('copy-toast'); if (t) { t.querySelector('span').textContent = c.dataset.copy ? 'تم نسخ نص المادة' : 'تم نسخ رابط المادة'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600); } });
  });
  R.onPrint(() => { if (R.$('#rg-read').hidden) showTab('read'); });
})();
