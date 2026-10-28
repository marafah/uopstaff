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
    <div class="fld"><label for="w-src">المصدر</label><select id="w-src" class="form-select">${opt('s', 'Scopus (المعتمد)', st.src)}${opt('', 'كل المصادر', st.src)}${opt('w', 'Web of Science', st.src)}${opt('nos', 'خارج Scopus', st.src)}${opt('o', 'OpenAlex', st.src)}${opt('u', 'صفحة المدرس', st.src)}${opt('uonly', 'صفحة المدرس فقط', st.src)}${opt('nodoi', 'بلا DOI', st.src)}</select></div>
    <div class="fld"><label for="w-q4">تصنيف المجلة</label><select id="w-q4" class="form-select">${opt('', 'الكل', st.q4)}${opt('Q1', 'Q1', st.q4)}${opt('Q12', 'Q1 و Q2', st.q4)}${opt('Q2', 'Q2', st.q4)}${opt('Q3', 'Q3', st.q4)}${opt('Q4', 'Q4', st.q4)}${opt('none', 'غير مصنّف', st.q4)}</select></div>
    <div class="fld"><label for="w-sort">ترتيب</label><select id="w-sort" class="form-select">${opt('y', 'الأحدث', '')}${opt('c', 'الأكثر اقتباساً (Scopus)', '')}${opt('fwci', 'الأعلى FWCI', '')}</select></div>
    <div class="btns"><button class="btn btn-rs-o" id="w-csv"><i class="bi bi-download"></i> CSV</button></div>
  </div>
  <div class="rs-grid wide my-3"><div class="rs-card"><div class="d-flex flex-wrap gap-3 align-items-center mb-2" id="w-sum"></div><div class="rs-chart short"><canvas id="w-chart"></canvas></div></div></div>
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
      if (st.src === 'nos' && (w.src || '').includes('s')) return false;
      if (st.q4 && !(st.q4 === 'Q12' ? (w.q === 'Q1' || w.q === 'Q2') : st.q4 === 'none' ? !w.q : w.q === st.q4)) return false;
      if (st.src && st.src.length === 1 && !(w.src || '').includes(st.src)) return false;
      return !q.length || q.every(t => w._q.includes(t));
    });
    const s = st.sort;
    out.sort(s === 'c' ? (a, b) => ((b.sc ?? b.c) || 0) - ((a.sc ?? a.c) || 0) : s === 'fwci' ? (a, b) => (b.fwci || 0) - (a.fwci || 0) : (a, b) => (b.y || 0) - (a.y || 0) || (b.c || 0) - (a.c || 0));
    return out;
  }
  const PER = 50;
  function render() {
    const rows = filtered();
    const pages = Math.ceil(rows.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    R.$('#w-sum').innerHTML = `<span><b class="fs-5">${R.n(rows.length)}</b> منشور</span><span><b class="fs-5">${R.n(R.sum(rows.map(w => w.sc || 0)))}</b> اقتباس Scopus</span><span><b class="fs-5">${R.n(rows.filter(w => w.q === 'Q1' || w.q === 'Q2').length)}</b> في Q1 و Q2</span><span><b class="fs-5">${R.n(rows.filter(w => (w.src || '').includes('w')).length)}</b> في Web of Science</span>
      <span><b class="fs-5">${R.pct(rows.filter(R.isOA).length / (rows.length || 1))}</b> وصول مفتوح</span><span><b class="fs-5">${R.n(rows.filter(w => (w.src || '').includes('s')).length)}</b> في Scopus</span>
      <span><b class="fs-5">${R.n(rows.filter(w => (w.cc || []).some(c => c !== 'JO')).length)}</b> بتعاون دولي</span>`;
    const ys = []; for (let y = st.from; y <= st.to; y++) ys.push(y);
    R.chart('w-chart', { type: 'bar', data: { labels: ys, datasets: [{ label: 'منشورات', data: ys.map(y => rows.filter(w => w.y === y).length), backgroundColor: '#901d23', borderRadius: 3 }, { label: 'مفتوحة الوصول', data: ys.map(y => rows.filter(w => w.y === y && R.isOA(w)).length), backgroundColor: '#2f7d32', borderRadius: 3 }] }, options: { plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } } });
    R.$('#w-list').innerHTML = rows.slice(st.page * PER, st.page * PER + PER).map(w => R.pubHTML(w, { byId, showUop: true })).join('') || '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد منشورات مطابقة</div>';
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
})();
