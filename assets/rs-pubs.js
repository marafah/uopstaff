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
  <div class="rs-grid wide my-3"><div class="rs-card"><div class="d-flex flex-wrap gap-3 align-items-center mb-2" id="w-sum"></div><div class="rs-chart short"><canvas id="w-chart"></canvas></div></div></div>
  <details class="rs-card my-3" id="w-jo"><summary class="rs-h mb-0" style="cursor:pointer"><i class="bi bi-globe-central-south-asia"></i>مقارنة بالجامعات الأردنية للفترة المختارة <small>حسب Scopus · اضغط للعرض</small></summary>
    <div id="w-jo-body" class="mt-3"></div></details>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-2 no-print"><span class="small text-muted">طريقة العرض:</span>
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
      return !q.length || q.every(t => w._q.includes(t));
    });
    const s = st.sort;
    out.sort(s === 'c' ? (a, b) => ((b.sc ?? b.c) || 0) - ((a.sc ?? a.c) || 0) : s === 'fwci' ? (a, b) => (b.fwci || 0) - (a.fwci || 0) : (a, b) => (b.y || 0) - (a.y || 0) || (b.c || 0) - (a.c || 0));
    return out;
  }
  let PER = 50;
  st.view = R.store.get('rs-pub-view', 'list');
  const cites = w => w.sc != null ? `<b>${R.n(w.sc)}</b><small>Scopus</small>` : `<b>${R.n(w.c)}</b><small>OpenAlex</small>`;
  const uopChips = w => (w.r || []).map(id => byId[id]).filter(Boolean).map(r => `<a class="rs-chip" href="${R.profileUrl(r)}">${R.esc(r.name)}</a>`).join('');
  const VIEWS = {
    list: { per: 50, wrap: 'rs-pubs', item: w => R.pubHTML(w, { byId, showUop: true }) },
    cards: { per: 48, wrap: 'rs-pubgrid', item: w => `<article class="rs-pubcard">
        <div class="top">${w.y ? `<span class="rs-tag y">${w.y}</span>` : ''}${R.qTag(w.q)}${R.isOA(w) ? '<span class="rs-tag oa"><i class="bi bi-unlock"></i></span>' : ''}${w._flag ? `<span class="rs-tag ${w._flag[2]}" title="${R.esc(w._flag[1])}"><i class="bi bi-exclamation-octagon"></i></span>` : ''}<span class="c">${cites(w)}</span></div>
        <a class="t" href="${R.docUrl(w)}">${R.esc(w.t)}</a>
        <div class="v ltr">${R.esc(w.v || '')}</div>
        <div class="who">${uopChips(w)}</div>
        <div class="lnk">${R.workLinks(w)}</div></article>` },
    table: { per: 100, wrap: 'rs-scroll', table: true },
    compact: { per: 200, wrap: 'rs-compact' }
  };
  function render() {
    const rows = filtered();
    PER = (VIEWS[st.view] || VIEWS.list).per;
    const pages = Math.ceil(rows.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    R.$('#w-sum').innerHTML = `<span><b class="fs-5">${R.n(rows.length)}</b> منشور</span><span><b class="fs-5">${R.n(R.sum(rows.map(w => w.sc || 0)))}</b> اقتباس Scopus</span><span><b class="fs-5">${R.n(rows.filter(w => w.q === 'Q1' || w.q === 'Q2').length)}</b> في Q1 و Q2</span><span><b class="fs-5">${R.n(rows.filter(w => (w.src || '').includes('w')).length)}</b> في Web of Science</span>
      <span><b class="fs-5">${R.pct(rows.filter(R.isOA).length / (rows.length || 1))}</b> وصول مفتوح</span><span><b class="fs-5">${R.n(rows.filter(w => (w.src || '').includes('s')).length)}</b> في Scopus</span>
      <span><b class="fs-5">${R.n(rows.filter(w => (w.cc || []).some(c => c !== 'JO')).length)}</b> بتعاون دولي</span>`;
    const ys = []; for (let y = st.from; y <= st.to; y++) ys.push(y);
    R.chart('w-chart', { type: 'bar', data: { labels: ys, datasets: [{ label: 'منشورات', data: ys.map(y => rows.filter(w => w.y === y).length), backgroundColor: '#901d23', borderRadius: 3 }, { label: 'مفتوحة الوصول', data: ys.map(y => rows.filter(w => w.y === y && R.isOA(w)).length), backgroundColor: '#2f7d32', borderRadius: 3 }] }, options: { plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } } });
    const V = VIEWS[st.view] || VIEWS.list;
    R.$$('#w-view button').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
    const box = R.$('#w-list');
    box.className = V.wrap;
    const part = rows.slice(st.page * PER, st.page * PER + PER);
    const empty = '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد منشورات مطابقة</div>';
    if (st.view === 'table') {
      box.innerHTML = part.length ? `<table class="rs-table rs-pubtable"><thead><tr><th>السنة</th><th>العنوان</th><th>المجلة / المصدر</th><th>التصنيف</th><th>النوع</th><th class="num">Scopus</th><th class="num">WoS</th><th class="num">OpenAlex</th><th>باحثو البترا</th><th>روابط</th></tr></thead><tbody>
        ${part.map(w => `<tr><td class="num">${w.y || ''}</td><td><a href="${R.docUrl(w)}" class="ltr d-block">${R.esc(w.t)}</a>${w._flag ? `<span class="rs-tag ${w._flag[2]}" title="${R.esc(w._flag[1])}">${R.esc(w._flag[0])}</span>` : ''}</td>
          <td class="ltr"><small>${R.esc(w.v || '')}</small></td><td>${R.qTag(w.q)}</td><td><small>${R.esc(R.typeAr(w.type))}</small></td>
          <td class="num">${w.sc != null ? R.n(w.sc) : '–'}</td><td class="num">${w.wc != null ? R.n(w.wc) : '–'}</td><td class="num">${w.c != null && (w.src || '').includes('o') ? R.n(w.c) : '–'}</td>
          <td><small>${(w.r || []).map(id => byId[id]).filter(Boolean).map(r => `<a href="${R.profileUrl(r)}">${R.esc(r.name)}</a>`).join('، ')}</small></td>
          <td class="text-nowrap rs-mini-links">${R.workLinks(w)}</td></tr>`).join('')}</tbody></table>` : empty;
    } else if (st.view === 'compact') {
      const by = {}; part.forEach(w => { (by[w.y || 'بدون سنة'] = by[w.y || 'بدون سنة'] || []).push(w); });
      box.innerHTML = Object.keys(by).sort((a, b) => b - a).map(y => `<h4 class="rs-sub">${y} <small class="text-muted">(${by[y].length})</small></h4><ol class="rs-compact-list">${by[y].map(w => `<li><a href="${R.docUrl(w)}" class="ltr">${R.esc(w.t)}</a> <small class="text-muted ltr">— ${R.esc(w.v || '')}</small> ${R.qTag(w.q)} <small class="text-muted">${w.sc != null ? R.n(w.sc) + ' اقتباس' : ''}</small></li>`).join('')}</ol>`).join('') || empty;
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
  R.$('#w-view').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; st.page = 0; R.store.set('rs-pub-view', st.view); render(); });
  R.$('#w-jo').addEventListener('toggle', joCompare);
  ['#w-from', '#w-to'].forEach(id => R.$(id).addEventListener('change', () => setTimeout(joCompare, 0)));
})();
