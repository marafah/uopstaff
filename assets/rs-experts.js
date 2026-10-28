/* experts.html: researchers of every Jordanian university by topic, for partners, reviewers and examiners */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let E, C;
  try { [E, C] = await R.loadAll(['jordan/experts', 'jordan/cube']); } catch (e) { R.fail(app, e); return; }
  R.updated({ updated: E.updated });
  const UN = Object.fromEntries(C.unis.map(([a, en, ar]) => [a, ar]));
  const Y = new Date().getFullYear();
  const esc = R.esc;
  const rows = E.rows.map(r => ({ sid: r[0], n: r[1], u: r[2], docs: r[3], c: r[4], d5: r[5], last: r[6], kw: r[7], _s: R.norm(r[1] + ' ' + r[7]) }));
  const st = { q: R.param('q'), u: R.param('u'), active: true, min: 3, sort: 'rel', page: 0, view: R.store.get('rs-ex-view', 'cards') };
  const KW = {}; rows.forEach(r => r.kw.split('; ').forEach(k => { if (k) KW[k] = (KW[k] || 0) + 1; }));
  const popular = Object.entries(KW).sort((a, b) => b[1] - a[1]).slice(0, 24).map(x => x[0]);
  const UCOL = {}; C.unis.forEach(([a], i) => { UCOL[a] = a === R.HOME_AFID ? '#901d23' : R.colors[(i % (R.colors.length - 1)) + 1]; });
  const ini = n => { const p = n.split(',').map(x => x.trim()); const last = p[0] || '', first = (p[1] || '').split(/\s+/)[0] || ''; return ((first[0] || '') + (last.replace(/^(Al-|El-|Abu |Al )/i, '')[0] || '')).toUpperCase(); };
  const nice = n => { const p = n.split(','); return p.length > 1 ? `${p[1].trim()} ${p[0].trim()}` : n; };
  app.innerHTML = `
  <section class="rs-section rs-kpis">
    <div class="rs-kpi"><div class="v">${R.n(rows.length)}</div><div class="l"><i class="bi bi-people"></i>باحث أردني في الدليل</div><div class="d">لكل منهم وثيقتان أو أكثر في Scopus</div></div>
    <div class="rs-kpi teal"><div class="v">${R.n(rows.filter(r => r.last >= Y - 3).length)}</div><div class="l"><i class="bi bi-activity"></i>نشطون</div><div class="d">نشروا خلال آخر 3 سنوات</div></div>
    <div class="rs-kpi navy"><div class="v">${C.unis.length}</div><div class="l"><i class="bi bi-bank"></i>جامعة</div><div class="d">كل الجامعات الأردنية في Scopus</div></div>
    <div class="rs-kpi gold"><div class="v">${R.n(Object.keys(KW).length)}</div><div class="l"><i class="bi bi-tags"></i>موضوع بحثي</div><div class="d">من الكلمات المفتاحية للمؤلفين</div></div>
  </section>
  <section class="rs-section rs-card no-print"><div class="rs-toolbar">
    <div class="fld grow"><label for="ex-q">الموضوع أو الاسم (بالإنجليزية)</label><input id="ex-q" class="form-control ltr" type="search" value="${esc(st.q)}" placeholder="e.g. machine learning, diabetes, water treatment, Islamic finance"></div>
    <div class="fld"><label for="ex-u">الجامعة</label><select id="ex-u" class="form-select"><option value="">كل الجامعات</option>${C.unis.map(([a, , ar]) => `<option value="${a}"${a === st.u ? ' selected' : ''}>${esc(ar)}</option>`).join('')}</select></div>
    <div class="fld" style="flex:0 1 120px"><label for="ex-min">حد أدنى للوثائق</label><select id="ex-min" class="form-select"><option>2</option><option selected>3</option><option>5</option><option>10</option><option>20</option></select></div>
    <div class="fld"><label for="ex-sort">ترتيب</label><select id="ex-sort" class="form-select"><option value="rel">الأقرب للموضوع</option><option value="c">الاقتباسات</option><option value="docs">الوثائق</option><option value="d5">النشاط (آخر 5 سنوات)</option></select></div>
    <div class="btns"><button class="btn btn-rs-o" id="ex-csv"><i class="bi bi-download"></i> CSV</button></div>
  </div><label class="form-check mt-2"><input class="form-check-input" type="checkbox" id="ex-act" checked> <span class="form-check-label">نشطون فقط (نشروا خلال آخر 3 سنوات)</span></label></section>
  <section class="rs-section no-print"><div class="small text-muted mb-1">موضوعات شائعة:</div><div class="rs-chips" id="ex-pop">${popular.map(k => `<button class="rs-chip soft" data-kw="${esc(k)}"><span class="ltr">${esc(k)}</span></button>`).join('')}</div></section>
  <section class="rs-section rs-grid two" id="ex-viz">
    <div class="rs-card"><h3><i class="bi bi-bank"></i>الخبراء حسب الجامعة <small class="fw-normal text-muted">للبحث الحالي</small></h3><div class="rs-chart short"><canvas id="ex-ch-u"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>موضوعات قريبة <small class="fw-normal text-muted">تظهر مع بحثك · اضغط لتضييق النتائج</small></h3><div class="rs-chips" id="ex-rel"></div></div>
  </section>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-2"><div class="d-flex flex-wrap gap-2 align-items-center" id="ex-sum"></div>
    <div class="rs-seg ms-auto no-print" id="ex-view"><button data-v="cards"><i class="bi bi-person-badge"></i> بطاقات</button><button data-v="table"><i class="bi bi-table"></i> جدول</button></div></div>
  <div id="ex-out"></div><div class="rs-pager" id="ex-pager"></div>
  <p class="rs-note mt-3">من تصدير Scopus لكل الجامعات الأردنية (${esc(E.updated)}). الجامعة = أكثر انتماء ظهر في وثائق الباحث. الموضوعات = أكثر كلماته المفتاحية. افتح ملف Scopus للتحقق قبل التواصل.</p>`;
  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    const out = [];
    for (const r of rows) {
      if (r.docs < st.min || (st.u && r.u !== st.u) || (st.active && r.last < Y - 3)) continue;
      let rel = 0;
      if (q.length) { if (!q.every(t => r._s.includes(t))) continue; rel = q.reduce((s, t) => s + (r.kw.toLowerCase().split('; ').some(k => k.includes(t)) ? 2 : 1), 0); }
      out.push([rel, r]);
    }
    const k = st.sort;
    out.sort((a, b) => k === 'rel' ? (b[0] - a[0]) || (b[1].c - a[1].c) : b[1][k] - a[1][k]);
    return out.map(x => x[1]);
  }
  let PER = 48;
  function render() {
    PER = st.view === 'table' ? 50 : 48;
    const data = filtered(), pages = Math.ceil(data.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    const byU = {}; data.forEach(r => { byU[r.u] = (byU[r.u] || 0) + 1; });
    R.$('#ex-sum').innerHTML = `<span><b class="fs-5">${R.n(data.length)}</b> باحث</span>` + Object.entries(byU).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u, n]) => `<span class="rs-chip">${esc(UN[u] || u)} <small class="text-muted">${n}</small></span>`).join('');
    const hl = s => { let h = esc(s); R.norm(st.q).split(' ').filter(t => t.length > 2).forEach(t => { h = h.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); }); return h; };
    R.$$('#ex-view button').forEach(x => x.classList.toggle('on', x.dataset.v === st.view));
    const part = data.slice(st.page * PER, st.page * PER + PER);
    const sc = r => `https://www.scopus.com/authid/detail.uri?authorId=${r.sid}`;
    const out = R.$('#ex-out');
    if (!part.length) out.innerHTML = '<div class="rs-empty"><i class="bi bi-person-x"></i>لا توجد نتائج؛ جرّب كلمة أعم أو اخفض الحد الأدنى للوثائق</div>';
    else if (st.view === 'table') out.innerHTML = `<div class="rs-scroll"><table class="rs-table"><thead><tr><th>#</th><th>الباحث</th><th>الجامعة</th><th class="num">الوثائق</th><th class="num">آخر 5 سنوات</th><th class="num">الاقتباسات</th><th class="num">آخر نشر</th><th>الموضوعات</th><th></th></tr></thead><tbody>
      ${part.map((r, i) => `<tr class="${r.u === R.HOME_AFID ? 'me' : ''}"><td class="num text-muted">${st.page * PER + i + 1}</td><td class="ltr"><b>${esc(nice(r.n))}</b></td><td><small>${esc(UN[r.u] || '')}</small></td>
        <td class="num">${R.n(r.docs)}</td><td class="num">${R.n(r.d5)}</td><td class="num">${R.n(r.c)}</td><td class="num">${r.last}</td><td class="ltr"><small>${hl(r.kw)}</small></td>
        <td><a class="rs-src" href="${sc(r)}" target="_blank" rel="noopener"><i class="bi bi-bar-chart-line"></i>Scopus</a></td></tr>`).join('')}</tbody></table></div>`;
    else out.innerHTML = `<div class="rs-xgrid">${part.map(r => { const col = UCOL[r.u] || '#555'; const act = r.last >= Y - 1 ? 'نشط هذا العام' : r.last >= Y - 3 ? 'نشط' : 'آخر نشر ' + r.last;
      return `<article class="rs-xcard${r.u === R.HOME_AFID ? ' home' : ''}" style="--c:${col}">
        <div class="top"><span class="av">${esc(ini(r.n))}</span><div class="who"><b class="ltr">${esc(nice(r.n))}</b><span>${esc(UN[r.u] || '')}</span></div><span class="st ${r.last >= Y - 1 ? 'on' : ''}">${act}</span></div>
        <div class="mt"><div class="m b"><i class="bi bi-file-earmark-text-fill"></i><b>${R.n(r.docs)}</b><span>وثيقة</span></div><div class="m t"><i class="bi bi-lightning-charge-fill"></i><b>${R.n(r.d5)}</b><span>آخر 5 سنوات</span></div><div class="m y"><i class="bi bi-quote"></i><b>${R.n(r.c)}</b><span>اقتباس</span></div><div class="m p"><i class="bi bi-bullseye"></i><b>${(r.c / Math.max(1, r.docs)).toFixed(1)}</b><span>اقتباس/وثيقة</span></div></div>
        <div class="kws">${r.kw.split('; ').filter(Boolean).slice(0, 6).map(k => `<button class="rs-chip soft" data-kw="${esc(k)}"><span class="ltr">${hl(k)}</span></button>`).join('')}</div>
        <div class="foot"><a class="rs-ib sc" href="${sc(r)}" target="_blank" rel="noopener" title="ملف Scopus"><i class="bi bi-graph-up-arrow"></i></a>
          <a class="rs-ib sj" href="https://scholar.google.com/scholar?q=${encodeURIComponent('author:"' + nice(r.n) + '"')}" target="_blank" rel="noopener"><i class="bi bi-google"></i></a></div>
      </article>`; }).join('')}</div>`;
    // results by university and related topics
    const byU2 = Object.entries(byU).sort((a, b) => b[1] - a[1]).slice(0, 12);
    R.chart('ex-ch-u', { type: 'bar', data: { labels: byU2.map(([u]) => UN[u] || u), datasets: [{ label: 'باحثون', data: byU2.map(x => x[1]), backgroundColor: byU2.map(([u]) => UCOL[u] || '#999'), borderRadius: 3 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } } } } });
    const qn = R.norm(st.q), rel = {};
    data.slice(0, 400).forEach(r => r.kw.split('; ').forEach(k => { if (k && (!qn || !R.norm(k).includes(qn))) rel[k] = (rel[k] || 0) + 1; }));
    R.$('#ex-rel').innerHTML = Object.entries(rel).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `<button class="rs-chip soft" data-kw="${esc(k)}" data-add="1"><span class="ltr">${esc(k)}</span> <small class="text-muted">${n}</small></button>`).join('') || '<span class="text-muted small">ابحث عن موضوع لتظهر موضوعات قريبة</span>';
    const pg = []; for (let i = 0; i < pages; i++) if (i < 2 || i >= pages - 2 || Math.abs(i - st.page) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
    R.$('#ex-pager').innerHTML = pages > 1 ? pg.map(i => i === '…' ? '<span class="px-1">…</span>' : `<button class="btn btn-sm ${i === st.page ? 'btn-rs' : 'btn-rs-o'}" data-p="${i}">${i + 1}</button>`).join('') : '';
    const u = new URL(location); st.q ? u.searchParams.set('q', st.q) : u.searchParams.delete('q'); st.u ? u.searchParams.set('u', st.u) : u.searchParams.delete('u'); history.replaceState(null, '', u);
  }
  render();
  R.$('#ex-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; st.page = 0; render(); }, 250));
  R.$('#ex-u').onchange = e => { st.u = e.target.value; st.page = 0; render(); };
  R.$('#ex-min').onchange = e => { st.min = +e.target.value; st.page = 0; render(); };
  R.$('#ex-sort').onchange = e => { st.sort = e.target.value; render(); };
  R.$('#ex-act').onchange = e => { st.active = e.target.checked; st.page = 0; render(); };
  R.$('#ex-view').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; R.store.set('rs-ex-view', st.view); st.page = 0; render(); });
  app.addEventListener('click', e => { const b = e.target.closest('[data-kw]'); if (!b) return; e.preventDefault();
    st.q = b.dataset.add && st.q ? st.q + ' ' + b.dataset.kw : b.dataset.kw; R.$('#ex-q').value = st.q; st.page = 0; render(); window.scrollTo({ top: R.$('#ex-sum').getBoundingClientRect().top + scrollY - 140, behavior: 'smooth' }); });
  R.$('#ex-pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { st.page = +b.dataset.p; render(); } });
  R.$('#ex-csv').onclick = () => R.csv(filtered().map(r => ({ name: r.n, university: UN[r.u] || r.u, documents: r.docs, last_5_years: r.d5, citations: r.c, last_year: r.last, topics: r.kw, scopus: 'https://www.scopus.com/authid/detail.uri?authorId=' + r.sid })), 'jordan-experts.csv');
})();
