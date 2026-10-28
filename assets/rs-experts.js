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
  const st = { q: R.param('q'), u: R.param('u'), active: true, min: 3, sort: 'rel', page: 0 };
  app.innerHTML = `
  <section class="rs-section rs-card no-print"><div class="rs-toolbar">
    <div class="fld grow"><label for="ex-q">الموضوع أو الاسم (بالإنجليزية)</label><input id="ex-q" class="form-control ltr" type="search" value="${esc(st.q)}" placeholder="e.g. machine learning, diabetes, water treatment, Islamic finance"></div>
    <div class="fld"><label for="ex-u">الجامعة</label><select id="ex-u" class="form-select"><option value="">كل الجامعات</option>${C.unis.map(([a, , ar]) => `<option value="${a}"${a === st.u ? ' selected' : ''}>${esc(ar)}</option>`).join('')}</select></div>
    <div class="fld" style="flex:0 1 120px"><label for="ex-min">حد أدنى للوثائق</label><select id="ex-min" class="form-select"><option>2</option><option selected>3</option><option>5</option><option>10</option><option>20</option></select></div>
    <div class="fld"><label for="ex-sort">ترتيب</label><select id="ex-sort" class="form-select"><option value="rel">الأقرب للموضوع</option><option value="c">الاقتباسات</option><option value="docs">الوثائق</option><option value="d5">النشاط (آخر 5 سنوات)</option></select></div>
    <div class="btns"><button class="btn btn-rs-o" id="ex-csv"><i class="bi bi-download"></i> CSV</button></div>
  </div><label class="form-check mt-2"><input class="form-check-input" type="checkbox" id="ex-act" checked> <span class="form-check-label">نشطون فقط (نشروا خلال آخر 3 سنوات)</span></label></section>
  <div class="d-flex flex-wrap gap-3 align-items-center mb-2" id="ex-sum"></div>
  <div class="rs-scroll"><table class="rs-table" id="ex-table"></table></div><div class="rs-pager" id="ex-pager"></div>
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
  const PER = 50;
  function render() {
    const data = filtered(), pages = Math.ceil(data.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    const byU = {}; data.forEach(r => { byU[r.u] = (byU[r.u] || 0) + 1; });
    R.$('#ex-sum').innerHTML = `<span><b class="fs-5">${R.n(data.length)}</b> باحث</span>` + Object.entries(byU).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u, n]) => `<span class="rs-chip">${esc(UN[u] || u)} <small class="text-muted">${n}</small></span>`).join('');
    const hl = s => { let h = esc(s); R.norm(st.q).split(' ').filter(t => t.length > 2).forEach(t => { h = h.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); }); return h; };
    R.$('#ex-table').innerHTML = `<thead><tr><th>#</th><th>الباحث</th><th>الجامعة</th><th class="num">الوثائق</th><th class="num">آخر 5 سنوات</th><th class="num">الاقتباسات</th><th class="num">آخر نشر</th><th>الموضوعات</th><th></th></tr></thead><tbody>
      ${data.slice(st.page * PER, st.page * PER + PER).map((r, i) => `<tr class="${r.u === R.HOME_AFID ? 'me' : ''}"><td class="num text-muted">${st.page * PER + i + 1}</td><td class="ltr"><b>${esc(r.n)}</b></td><td><small>${esc(UN[r.u] || '')}</small></td>
        <td class="num">${R.n(r.docs)}</td><td class="num">${R.n(r.d5)}</td><td class="num">${R.n(r.c)}</td><td class="num">${r.last}</td><td class="ltr"><small>${hl(r.kw)}</small></td>
        <td><a class="rs-src" href="https://www.scopus.com/authid/detail.uri?authorId=${r.sid}" target="_blank" rel="noopener"><i class="bi bi-bar-chart-line"></i>Scopus</a></td></tr>`).join('') || '<tr><td colspan="9" class="rs-empty">لا توجد نتائج</td></tr>'}</tbody>`;
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
  R.$('#ex-pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { st.page = +b.dataset.p; render(); } });
  R.$('#ex-csv').onclick = () => R.csv(filtered().map(r => ({ name: r.n, university: UN[r.u] || r.u, documents: r.docs, last_5_years: r.d5, citations: r.c, last_year: r.last, topics: r.kw, scopus: 'https://www.scopus.com/authid/detail.uri?authorId=' + r.sid })), 'jordan-experts.csv');
})();
