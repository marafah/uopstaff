/* publications.html: every publication by current faculty members, with verification links */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  const meta = data.meta || {}, Y = meta.year || new Date().getFullYear();
  R.updated(meta);
  R.cmp.render();
  const works = (wdata.works || []).map(w => Object.assign(w, { _q: R.norm([w.t, w.v, w.au, w.topic, w.f, w.doi].join(' ')), _fac: [...new Set((w.r || []).map(id => byId[id] && byId[id].faculty).filter(Boolean))], _dep: [...new Set((w.r || []).map(id => byId[id] && byId[id].dept).filter(Boolean))] }));
  const minY = Math.max(1990, Math.min(...works.map(w => w.y || Y)));
  const opt = (v, t, s) => `<option value="${R.esc(v)}"${v === s ? ' selected' : ''}>${R.esc(t)}</option>`;
  const st = { q: R.param('q'), fac: R.param('fac'), dept: '', type: '', oa: '', src: R.param('src') || 's', field: R.param('field'), q4: R.param('qt'), from: +R.param('from') || Y - 9, to: +R.param('to') || Y, sort: 'y', page: 0 };
  const fields = [...new Set(works.map(w => w.f).filter(Boolean))].sort();
  const types = [...new Set(works.map(w => R.typeAr(w.type)))];
  const yrOpts = s => { let h = ''; for (let y = Y; y >= minY; y--) h += opt(String(y), String(y), String(s)); return h; };

  app.innerHTML = `
  <div class="rs-toolbar no-print">
    <div class="fld grow"><label for="w-q">بحث</label><input id="w-q" class="form-control" type="search" placeholder="عنوان، مجلة، مؤلف، DOI، موضوع…" value="${R.esc(st.q)}"></div>
    <div class="fld" style="flex:0 1 110px"><label for="w-from">من سنة</label><select id="w-from" class="form-select">${yrOpts(st.from)}</select></div>
    <div class="fld" style="flex:0 1 110px"><label for="w-to">إلى سنة</label><select id="w-to" class="form-select">${yrOpts(st.to)}</select></div>
    <div class="fld"><label for="w-fac">الكلية</label><select id="w-fac" class="form-select">${opt('', 'الكل', st.fac)}${R.faculties(list).map(f => opt(f, f, st.fac)).join('')}</select></div>
    <div class="fld"><label for="w-dept">القسم</label><select id="w-dept" class="form-select"></select></div>
    <div class="fld"><label for="w-field">المجال</label><select id="w-field" class="form-select">${opt('', 'الكل', st.field)}${fields.map(f => opt(f, f, st.field)).join('')}</select></div>
    <div class="fld"><label for="w-type">النوع</label><select id="w-type" class="form-select">${opt('', 'الكل', '')}${types.map(t => opt(t, t, '')).join('')}</select></div>
    <div class="fld"><label for="w-oa">الوصول</label><select id="w-oa" class="form-select">${opt('', 'الكل', '')}${opt('open', 'مفتوح', '')}${opt('closed', 'مغلق', '')}</select></div>
    <div class="fld"><label for="w-src">المصدر</label><select id="w-src" class="form-select">${opt('s', 'Scopus (المعتمد)', st.src)}${opt('', 'كل المصادر', st.src)}${opt('w', 'Web of Science', st.src)}${opt('nos', 'خارج Scopus', st.src)}${opt('o', 'OpenAlex', st.src)}${opt('u', 'صفحة المدرس', st.src)}${opt('uonly', 'صفحة المدرس فقط', st.src)}${opt('nodoi', 'بلا DOI', st.src)}${opt('man', 'معدّل يدوياً', st.src)}${opt('disc', 'في مجلات حذفها Scopus', st.src)}</select></div>
    <div class="fld"><label for="w-q4">تصنيف المجلة</label><select id="w-q4" class="form-select">${opt('', 'الكل', st.q4)}${opt('Q1', 'Q1', st.q4)}${opt('Q12', 'Q1 و Q2', st.q4)}${opt('Q2', 'Q2', st.q4)}${opt('Q3', 'Q3', st.q4)}${opt('Q4', 'Q4', st.q4)}${opt('none', 'غير مصنّف', st.q4)}</select></div>
    <div class="fld"><label for="w-sort">ترتيب</label><select id="w-sort" class="form-select">${opt('y', 'الأحدث', '')}${opt('c', 'الأكثر اقتباساً (Scopus)', '')}${opt('fwci', 'الأعلى FWCI', '')}</select></div>
    <div class="btns"><button class="btn btn-rs-o" id="w-csv" title="المنشورات الظاهرة حسب التصفية"><i class="bi bi-download"></i> CSV</button><a class="btn btn-rs" href="data/research/export/documents.csv" download="uop-documents-all.csv" title="كل المنشورات بكل التفاصيل؛ يصلح أساساً لملف التعديلات اليدوية"><i class="bi bi-file-earmark-spreadsheet"></i> كل التفاصيل</a></div>
  </div>
  <div class="rs-pquick no-print"><span class="lbl"><i class="bi bi-lightning-charge-fill"></i> اختيارات سريعة:</span>
    <button class="rs-chip" data-pq="q12"><i class="bi bi-award-fill"></i> Q1 و Q2</button><button class="rs-chip" data-pq="q1"><i class="bi bi-trophy-fill"></i> Q1 فقط</button>
    <button class="rs-chip" data-pq="oa"><i class="bi bi-unlock-fill"></i> وصول مفتوح</button><button class="rs-chip" data-pq="wos"><i class="bi bi-journal-check"></i> في Web of Science</button>
    <button class="rs-chip" data-pq="intl"><i class="bi bi-globe-americas"></i> تعاون دولي</button><button class="rs-chip" data-pq="hot"><i class="bi bi-fire"></i> الأكثر اقتباساً (10+)</button>
    <button class="rs-chip" data-pq="year"><i class="bi bi-calendar-event-fill"></i> هذا العام</button><button class="rs-chip reset" data-pq=""><i class="bi bi-x-circle"></i> مسح</button></div>
  <div class="rs-ins-stats rs-pstats" id="w-sum"></div>
  <div class="rs-card my-3"><h3 class="rs-ph"><i class="bi bi-bar-chart-fill" style="color:#901d23"></i> المنشورات سنوياً <small>الكل مقابل الوصول المفتوح</small></h3><div class="rs-chart" style="height:300px"><canvas id="w-chart"></canvas></div></div>
  <details class="rs-card my-3" id="w-jo"><summary class="rs-h mb-0" style="cursor:pointer"><i class="bi bi-globe-central-south-asia"></i>مقارنة بالجامعات الأردنية للفترة المختارة <small>حسب Scopus · اضغط للعرض</small></summary>
    <div id="w-jo-body" class="mt-3"></div></details>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-2 no-print rs-pviewbar"><span class="fw-bold" id="w-count"></span><span class="small text-muted ms-auto">طريقة العرض:</span>
    <div class="rs-seg" id="w-view"><button data-v="list"><i class="bi bi-list-ul"></i> قائمة</button><button data-v="cards"><i class="bi bi-grid-3x2-gap"></i> بطاقات</button><button data-v="table"><i class="bi bi-table"></i> جدول</button><button data-v="compact"><i class="bi bi-list-nested"></i> مختصر حسب السنة</button></div></div>
  <div class="rs-pubs" id="w-list"></div>
  <div class="rs-pager" id="w-pager"></div>`;

  const depSel = R.$('#w-dept');
  const fillD = () => { depSel.innerHTML = opt('', 'الكل', st.dept) + R.depts(list, st.fac).map(d => opt(d, d, st.dept)).join(''); };
  fillD();

  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    const out = works.filter(w => {
      const y = w.y || 0;
      if (y && (y < st.from || y > st.to)) return false;
      if (!y && (st.from > minY)) return false;
      if (st.fac && !w._fac.includes(st.fac)) return false;
      if (st.dept && !w._dep.includes(st.dept)) return false;
      if (st.field && w.f !== st.field) return false;
      if (st.type && R.typeAr(w.type) !== st.type) return false;
      if (st.oa === 'open' && !R.isOA(w)) return false;
      if (st.oa === 'closed' && R.isOA(w)) return false;
      if (st.src === 'uonly' && w.src !== 'u') return false;
      if (st.src === 'nodoi' && w.doi) return false;
      if (st.src === 'man' && !w.man) return false;
      if (st.src === 'disc' && !(w._flag && w._flag[3])) return false;
      if (st.src === 'nos' && (w.src || '').includes('s')) return false;
      if (st.q4 && !(st.q4 === 'Q12' ? (w.q === 'Q1' || w.q === 'Q2') : st.q4 === 'none' ? !w.q : w.q === st.q4)) return false;
      if (st.src && st.src.length === 1 && !(w.src || '').includes(st.src)) return false;
      if (st.pq === 'q12' && !(w.q === 'Q1' || w.q === 'Q2')) return false;
      if (st.pq === 'q1' && w.q !== 'Q1') return false;
      if (st.pq === 'oa' && !R.isOA(w)) return false;
      if (st.pq === 'wos' && !(w.src || '').includes('w')) return false;
      if (st.pq === 'intl' && !(w.cc || []).some(c => c !== 'JO')) return false;
      if (st.pq === 'hot' && ((w.sc ?? w.c) || 0) < 10) return false;
      if (st.pq === 'year' && w.y !== Y) return false;
      return !q.length || q.every(t => w._q.includes(t));
    });
    const s = st.sort;
    out.sort(s === 'c' ? (a, b) => ((b.sc ?? b.c) || 0) - ((a.sc ?? a.c) || 0) : s === 'fwci' ? (a, b) => (b.fwci || 0) - (a.fwci || 0) : (a, b) => (b.y || 0) - (a.y || 0) || (b.c || 0) - (a.c || 0));
    return out;
  }
  let PER = 50;
  st.view = R.store.get('rs-pub-view', 'list');
  const QC = { Q1: '#1d7a3e', Q2: '#1f6f78', Q3: '#b8892b', Q4: '#c75b12' };
  const typeIc = t => ({ article: 'bi-file-earmark-text-fill', review: 'bi-journal-richtext', 'conference-paper': 'bi-easel2-fill', 'book-chapter': 'bi-book-half', book: 'bi-book-fill' }[t] || 'bi-file-earmark-fill');
  const people = w => (w.r || []).map(id => byId[id]).filter(Boolean);
  const pchips = w => people(w).map(r => `<a class="rs-pchip" href="${R.profileUrl(r)}">${R.avatar(r, 'xs')}<span>${R.esc(r.name)}</span></a>`).join('');
  const intl = w => (w.cc || []).some(c => c !== 'JO');
  const badges = w => [
    w.y ? `<span class="rs-b yr"><i class="bi bi-calendar3"></i> ${w.y}</span>` : '',
    w.q ? `<span class="rs-b q" style="--bc:${QC[w.q]}"><i class="bi bi-award-fill"></i> ${w.q}</span>` : '',
    `<span class="rs-b ty"><i class="bi ${typeIc(w.type)}"></i> ${R.esc(R.typeAr(w.type))}</span>`,
    R.isOA(w) ? `<span class="rs-b oa"><i class="bi bi-unlock-fill"></i> وصول مفتوح${R.OA_AR[w.oa] ? ' · ' + R.OA_AR[w.oa] : ''}</span>` : '',
    intl(w) ? `<span class="rs-b in" title="${R.esc((w.cc || []).join('، '))}"><i class="bi bi-globe-americas"></i> تعاون دولي</span>` : '',
    w.fwci != null ? `<span class="rs-b fw" title="مؤشر الاقتباس الموزون حسب المجال (1 = المتوسط العالمي)"><i class="bi bi-speedometer2"></i> FWCI ${w.fwci}</span>` : '',
    w._flag ? `<span class="rs-b bad" title="${R.esc(w._flag[1])}"><i class="bi bi-exclamation-octagon-fill"></i> ${R.esc(w._flag[0])}</span>` : '',
    w.man ? '<span class="rs-b man"><i class="bi bi-pencil-square"></i> تعديل يدوي</span>' : ''].join('');
  const srcB = w => (w.src || '').split('').sort((a, b) => 'swougm'.indexOf(a) - 'swougm'.indexOf(b)).map(x => `<span class="rs-src-dot s-${x}" title="${R.SRC[x] ? R.SRC[x].name : x}">${R.SRC[x] ? R.SRC[x].name : x}</span>`).join('');
  const metrics = w => `<div class="rs-pmet">
      <div class="mm sc"><b>${w.sc != null ? R.n(w.sc) : '–'}</b><span>Scopus</span></div>
      <div class="mm wo"><b>${w.wc != null ? R.n(w.wc) : '–'}</b><span>WoS</span></div>
      <div class="mm ox"><b>${w.c != null ? R.n(w.c) : '–'}</b><span>OpenAlex</span></div></div>`;
  const links = w => {
    const a = [], oid = w.oid || (/^W\d+$/.test(w.id) ? w.id : '');
    a.push(`<a class="rs-ib info" href="${R.docUrl(w)}" title="كل التفاصيل"><i class="bi bi-info-lg"></i></a>`);
    if (w.doi) a.push(`<a class="rs-ib doi" href="https://doi.org/${R.esc(w.doi)}" target="_blank" rel="noopener" title="DOI"><i class="bi bi-link-45deg"></i></a>`);
    if (w.eid) a.push(`<a class="rs-ib sc" href="${R.scopusDocUrl(w.eid)}" target="_blank" rel="noopener" title="Scopus"><i class="bi bi-graph-up-arrow"></i></a>`);
    if (w.ut) a.push(`<a class="rs-ib wos" href="https://www.webofscience.com/wos/woscc/full-record/${encodeURIComponent(w.ut)}" target="_blank" rel="noopener" title="Web of Science"><i class="bi bi-journal-check"></i></a>`);
    if (oid) a.push(`<a class="rs-ib sj" href="${R.oaWorkUrl(oid)}" target="_blank" rel="noopener" title="OpenAlex"><i class="bi bi-globe2"></i></a>`);
    if (w.oaurl) a.push(`<a class="rs-ib web" href="${R.esc(w.oaurl)}" target="_blank" rel="noopener" title="النص الكامل"><i class="bi bi-file-earmark-pdf-fill"></i></a>`);
    return `<div class="lk">${a.join('')}</div>`;
  };
  const cites = w => w.sc != null ? `<b>${R.n(w.sc)}</b><small>Scopus</small>` : `<b>${R.n(w.c)}</b><small>OpenAlex</small>`;
  const uopChips = w => (w.r || []).map(id => byId[id]).filter(Boolean).map(r => `<a class="rs-chip" href="${R.profileUrl(r)}">${R.esc(r.name)}</a>`).join('');
  const VIEWS = {
    list: { per: 40, wrap: 'rs-plist', item: w => `<article class="rs-pitem${w._flag && w._flag[3] ? ' flagged' : ''}" style="--qc:${QC[w.q] || '#c9c2b2'}">
        <div class="body"><div class="bd">${badges(w)}</div>
          <a class="t ltr" href="${R.docUrl(w)}">${R.esc(w.t)}</a>
          ${w.v ? `<div class="v ltr"><i class="bi bi-journal-bookmark-fill"></i> ${R.esc(w.v)}</div>` : ''}
          ${w.au ? `<div class="au ltr"><i class="bi bi-people-fill"></i> ${R.esc(w.au.length > 220 ? w.au.slice(0, 218) + '…' : w.au)}</div>` : ''}
          <div class="who">${pchips(w)}</div>
          <div class="ft"><span class="srcs"><i class="bi bi-database-fill-check"></i> ${srcB(w)}</span>${links(w)}</div></div>
        ${metrics(w)}</article>` },
    cards: { per: 48, wrap: 'rs-pgrid', item: w => `<article class="rs-pcard${w._flag && w._flag[3] ? ' flagged' : ''}" style="--qc:${QC[w.q] || '#c9c2b2'}">
        <div class="bd">${badges(w)}</div>
        <a class="t ltr" href="${R.docUrl(w)}">${R.esc(w.t)}</a>
        ${w.v ? `<div class="v ltr"><i class="bi bi-journal-bookmark-fill"></i> ${R.esc(w.v)}</div>` : ''}
        <div class="who">${pchips(w)}</div>
        ${metrics(w)}
        <div class="ft"><span class="srcs">${srcB(w)}</span>${links(w)}</div></article>` },
    table: { per: 100, wrap: 'rs-scroll', table: true },
    compact: { per: 200, wrap: 'rs-compact' }
  };
  function render() {
    const rows = filtered();
    PER = (VIEWS[st.view] || VIEWS.list).per;
    const pages = Math.ceil(rows.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    const n = rows.length || 1, stt = (ic, col, v, l) => `<div class="st" style="--sc:${col}"><i class="bi ${ic}"></i><div><b>${v}</b><span>${l}</span></div></div>`;
    R.$('#w-sum').innerHTML = stt('bi-file-earmark-text-fill', '#901d23', R.n(rows.length), 'منشور')
      + stt('bi-graph-up-arrow', '#e9711c', R.n(rows.filter(w => (w.src || '').includes('s')).length), 'في Scopus')
      + stt('bi-quote', '#e0a100', R.n(R.sum(rows.map(w => w.sc || 0))), 'اقتباس Scopus')
      + stt('bi-award-fill', '#1d7a3e', R.n(rows.filter(w => w.q === 'Q1' || w.q === 'Q2').length), `في Q1 و Q2 · ${R.pct(rows.filter(w => w.q === 'Q1' || w.q === 'Q2').length / n)}`)
      + stt('bi-journal-check', '#5e33bf', R.n(rows.filter(w => (w.src || '').includes('w')).length), 'في Web of Science')
      + stt('bi-unlock-fill', '#1f8a8a', R.pct(rows.filter(R.isOA).length / n), 'وصول مفتوح')
      + stt('bi-globe-americas', '#2b5ea7', R.n(rows.filter(intl).length), 'بتعاون دولي');
    R.$('#w-count').innerHTML = `<i class="bi bi-list-ol"></i> ${R.n(rows.length)} نتيجة${pages > 1 ? ` · صفحة ${st.page + 1} من ${pages}` : ''}`;
    R.$$('[data-pq]').forEach(x => x.classList.toggle('on', !!st.pq && x.dataset.pq === st.pq));
    const ys = []; for (let y = st.from; y <= st.to; y++) ys.push(y);
    R.chart('w-chart', { type: 'bar', data: { labels: ys, datasets: [{ label: 'منشورات', data: ys.map(y => rows.filter(w => w.y === y).length), backgroundColor: '#901d23', borderRadius: 3 }, { label: 'مفتوحة الوصول', data: ys.map(y => rows.filter(w => w.y === y && R.isOA(w)).length), backgroundColor: '#2f7d32', borderRadius: 3 }] }, options: { plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } } });
    const V = VIEWS[st.view] || VIEWS.list;
    R.$$('#w-view button').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
    const box = R.$('#w-list');
    box.className = V.wrap;
    const part = rows.slice(st.page * PER, st.page * PER + PER);
    const empty = '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد منشورات مطابقة</div>';
    if (st.view === 'table') {
      box.innerHTML = part.length ? `<table class="rs-jt2 rs-ptab"><thead><tr><th class="c"><i class="bi bi-calendar3 ic-y"></i> السنة</th><th><i class="bi bi-file-earmark-text-fill ic-m"></i> العنوان</th><th><i class="bi bi-journal-bookmark-fill ic-p"></i> المجلة</th><th class="c"><i class="bi bi-award-fill ic-g"></i> التصنيف</th><th class="c"><i class="bi bi-quote ic-o"></i> Scopus</th><th class="c"><i class="bi bi-quote ic-p"></i> WoS</th><th class="c"><i class="bi bi-quote ic-b"></i> OpenAlex</th><th><i class="bi bi-people-fill ic-t"></i> باحثو البترا</th><th class="c"><i class="bi bi-link-45deg"></i> روابط</th></tr></thead><tbody>
        ${part.map(w => `<tr class="${w._flag && w._flag[3] ? 'flagged' : ''}"><td class="c"><span class="rs-b yr">${w.y || '–'}</span></td>
          <td class="jt"><a href="${R.docUrl(w)}" class="ltr">${R.esc(w.t)}</a><div class="tg">${[`<span class="rs-b ty"><i class="bi ${typeIc(w.type)}"></i> ${R.esc(R.typeAr(w.type))}</span>`, R.isOA(w) ? '<span class="rs-b oa"><i class="bi bi-unlock-fill"></i> مفتوح</span>' : '', intl(w) ? '<span class="rs-b in"><i class="bi bi-globe-americas"></i> دولي</span>' : '', w._flag ? `<span class="rs-b bad" title="${R.esc(w._flag[1])}"><i class="bi bi-exclamation-octagon-fill"></i> ${R.esc(w._flag[0])}</span>` : ''].join('')}</div></td>
          <td class="ltr vv">${R.esc(w.v || '')}</td><td class="c">${w.q ? `<span class="rs-qpill q-${w.q.toLowerCase()}">${w.q}</span>` : '<span class="na">—</span>'}</td>
          <td class="c"><b class="cn sc">${w.sc != null ? R.n(w.sc) : '–'}</b></td><td class="c"><b class="cn wo">${w.wc != null ? R.n(w.wc) : '–'}</b></td><td class="c"><b class="cn ox">${w.c != null ? R.n(w.c) : '–'}</b></td>
          <td><div class="who">${pchips(w)}</div></td><td class="c">${links(w)}</td></tr>`).join('')}</tbody></table>` : empty;
    } else if (st.view === 'compact') {
      const by = {}; part.forEach(w => { (by[w.y || 'بدون سنة'] = by[w.y || 'بدون سنة'] || []).push(w); });
      box.innerHTML = Object.keys(by).sort((a, b) => b - a).map(y => `<div class="rs-yblock"><h4><span class="yy"><i class="bi bi-calendar3"></i> ${y}</span><span class="nn">${by[y].length} منشور</span></h4><ol class="rs-compact-list">${by[y].map(w => `<li>${w.q ? `<span class="rs-qpill q-${w.q.toLowerCase()}">${w.q}</span>` : '<span class="rs-qpill">—</span>'} <a href="${R.docUrl(w)}" class="ltr">${R.esc(w.t)}</a> <small class="text-muted ltr">— ${R.esc(w.v || '')}</small> ${w.sc != null ? `<span class="rs-b sc"><i class="bi bi-quote"></i> ${R.n(w.sc)}</span>` : ''}</li>`).join('')}</ol></div>`).join('') || empty;
    } else {
      box.innerHTML = part.map(V.item).join('') || empty;
    }
    const pg = []; for (let i = 0; i < pages; i++) if (i < 2 || i >= pages - 2 || Math.abs(i - st.page) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
    R.$('#w-pager').innerHTML = pages > 1 ? pg.map(i => i === '…' ? '<span class="px-1">…</span>' : `<button class="btn btn-sm ${i === st.page ? 'btn-rs' : 'btn-rs-o'}" data-p="${i}">${i + 1}</button>`).join('') : '';
    const u = new URL(location); ['q', 'fac', 'field'].forEach(k => st[k] ? u.searchParams.set(k, st[k]) : u.searchParams.delete(k)); st.src !== 's' ? u.searchParams.set('src', st.src) : u.searchParams.delete('src'); st.q4 ? u.searchParams.set('qt', st.q4) : u.searchParams.delete('qt'); history.replaceState(null, '', u);
  }
  const on = (id, k, ev, num) => R.$(id).addEventListener(ev || 'change', e => { st[k] = num ? +e.target.value : e.target.value; st.page = 0; if (k === 'fac') { st.dept = ''; fillD(); } render(); });
  R.$('#w-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; st.page = 0; render(); }, 250));
  on('#w-from', 'from', 0, 1); on('#w-to', 'to', 0, 1); on('#w-fac', 'fac'); on('#w-field', 'field'); on('#w-type', 'type'); on('#w-oa', 'oa'); on('#w-src', 'src'); on('#w-sort', 'sort'); on('#w-q4', 'q4');
  depSel.addEventListener('change', e => { st.dept = e.target.value; st.page = 0; render(); });
  R.$('#w-pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { st.page = +b.dataset.p; render(); R.$('#w-sum').scrollIntoView({ behavior: 'smooth' }); } });
  R.$('#w-csv').onclick = () => R.csv(filtered().map(w => ({
    year: w.y, title: w.t, venue: w.v, quartile: w.q || '', type: w.type, scopus_citations: w.sc ?? '', openalex_citations: w.c ?? '', in_scopus: (w.src || '').includes('s') ? 'yes' : 'no', in_wos: (w.src || '').includes('w') ? 'yes' : 'no', wos_citations: w.wc ?? '', wos: w.ut ? 'https://www.webofscience.com/wos/woscc/full-record/' + w.ut : '', fwci: w.fwci ?? '', open_access: w.oa || '', field: w.f || '',
    uop_authors: (w.r || []).map(id => byId[id] ? byId[id].name : '').join(' | '), faculties: w._fac.join(' | '), authors: w.au || '',
    doi: w.doi ? 'https://doi.org/' + w.doi : '', openalex: (w.oid || (/^W/.test(w.id) ? w.id : '')) ? R.oaWorkUrl(w.oid || w.id) : '', scopus: w.eid ? R.scopusDocUrl(w.eid) : '', link: w.url || '', sources: w.src
  })), 'uop-publications.csv');
  render();

  // journals discontinued by Scopus: tag the papers published in them
  R.scopusFlags().then(FL => {
    let n = 0;
    works.forEach(w => { const f = FL.find(w.issn ? [w.issn] : [], w.v); const v = FL.verdict(f, w.y); if (v) { w._flag = v; if (v[3]) n++; } });
    if (n) { const o = R.$('#w-src option[value="disc"]'); if (o) o.textContent = `في مجلات حذفها Scopus (${n})`; }
    render();
  }).catch(() => {});

  // comparison with every Jordanian university for the selected years (Scopus exports, citations updated weekly)
  let C = null;
  async function joCompare() {
    const box = R.$('#w-jo-body');
    if (!R.$('#w-jo').open) return;
    if (!C) { box.innerHTML = '<div class="rs-loading">جارٍ التحميل…</div>'; try { C = await R.load('jordan/cube'); } catch (e) { box.innerHTML = '<div class="rs-note">تعذّر تحميل بيانات الجامعات.</div>'; return; } }
    const out = C.unis.map(([afid, en, ar], i) => ({ i, afid, ar, docs: 0, cites: 0, q12: 0, qk: 0, intl: 0, oa: 0 }));
    for (const r of C.all) { if (r[1] < st.from || r[1] > st.to) continue; const o = out[r[0]]; o.docs += r[3]; o.cites += r[4]; o.q12 += r[5] + r[6]; o.qk += r[5] + r[6] + r[7] + r[8]; o.intl += r[9]; o.oa += r[10]; }
    const L = out.filter(o => o.docs).map(o => Object.assign(o, { cpd: o.cites / o.docs, q12s: o.qk ? o.q12 / o.qk : 0, intls: o.intl / o.docs, oas: o.oa / o.docs }));
    const rank = k => { const s = L.slice().sort((a, b) => b[k] - a[k]); return o => s.indexOf(o) + 1; };
    const R_ = { docs: rank('docs'), cpd: rank('cpd'), q12s: rank('q12s'), intls: rank('intls'), oas: rank('oas') };
    const home = L.find(o => o.afid === R.HOME_AFID);
    L.sort((a, b) => b.docs - a.docs);
    box.innerHTML = `${home ? `<div class="rs-kpis mb-3">${[['docs', 'الوثائق', v => R.n(v)], ['cpd', 'اقتباس لكل وثيقة', v => v.toFixed(1)], ['q12s', 'نسبة Q1 و Q2', v => R.pct(v)], ['intls', 'التعاون الدولي', v => R.pct(v)], ['oas', 'الوصول المفتوح', v => R.pct(v)]]
        .map(([k, l, f]) => `<div class="rs-kpi"><div class="v">#${R_[k](home)} <small class="fs-6 text-muted">من ${L.length}</small></div><div class="l">${l}</div><div class="d">البترا: <b>${f(home[k])}</b></div></div>`).join('')}</div>` : ''}
      <div class="rs-scroll" style="max-height:420px"><table class="rs-table"><thead><tr><th>#</th><th>الجامعة</th><th class="num">الوثائق</th><th class="num">اقتباس/وثيقة</th><th class="num">Q1 و Q2</th><th class="num">تعاون دولي</th><th class="num">وصول مفتوح</th></tr></thead><tbody>
      ${L.map((o, i) => `<tr class="${o === home ? 'me' : ''}"><td class="num">${i + 1}</td><td><b>${R.esc(o.ar)}</b></td><td class="num">${R.n(o.docs)}</td><td class="num">${o.cpd.toFixed(1)}</td><td class="num">${R.pct(o.q12s)}</td><td class="num">${R.pct(o.intls)}</td><td class="num">${R.pct(o.oas)}</td></tr>`).join('')}</tbody></table></div>
      <p class="rs-note mt-2 mb-0">${st.from}–${st.to} · من تصدير Scopus لكل الجامعات الأردنية (اقتباسات محدّثة أسبوعياً). قد تختلف أعداد البترا هنا عن قائمة المنشورات أعلاه لأن القائمة تجمع مصادر أخرى أيضاً. <a href="jordan.html?from=${st.from}&to=${st.to}">مقارنة تفصيلية حسب المجال والتخصص والمجلات</a></p>`;
  }
  app.addEventListener('click', e => { const b = e.target.closest('[data-pq]'); if (!b) return; st.pq = st.pq === b.dataset.pq ? '' : b.dataset.pq; st.page = 0; render(); });
  R.$('#w-view').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; st.page = 0; R.store.set('rs-pub-view', st.view); render(); });
  R.$('#w-jo').addEventListener('toggle', joCompare);
  ['#w-from', '#w-to'].forEach(id => R.$(id).addEventListener('change', () => setTimeout(joCompare, 0)));
})();
