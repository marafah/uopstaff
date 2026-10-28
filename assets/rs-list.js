/* researchers.html: searchable, filterable list of researchers (cards or table) */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data;
  try { data = await R.load('researchers'); } catch (e) { R.fail(app, e); return; }
  const { list } = R.indexResearchers(data);
  const meta = data.meta || {}, Y = meta.year || new Date().getFullYear();
  R.updated(meta);
  R.cmp.render();

  const ranks = [...new Map(list.filter(r => r.rank).map(r => [r.rank, r.rank_order])).entries()].sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const st = Object.assign({ q: R.param('q'), fac: R.param('fac'), dept: R.param('dept'), rank: '', has: '', sort: 'h', view: R.store.get('rs-view', 'cards'), shown: 60 }, {});
  const opt = (v, t, sel) => `<option value="${R.esc(v)}"${v === sel ? ' selected' : ''}>${R.esc(t)}</option>`;

  app.innerHTML = `
  <div class="rs-toolbar no-print">
    <div class="fld grow"><label for="f-q">بحث</label><input id="f-q" class="form-control" type="search" placeholder="اسم، تخصص، اهتمام بحثي، مجال…" value="${R.esc(st.q)}"></div>
    <div class="fld"><label for="f-fac">الكلية</label><select id="f-fac" class="form-select">${opt('', 'كل الكليات', st.fac)}${R.faculties(list).map(f => opt(f, f, st.fac)).join('')}</select></div>
    <div class="fld"><label for="f-dept">القسم</label><select id="f-dept" class="form-select"></select></div>
    <div class="fld"><label for="f-rank">الرتبة</label><select id="f-rank" class="form-select">${opt('', 'كل الرتب', '')}${ranks.map(r => opt(r, r, '')).join('')}</select></div>
    <div class="fld"><label for="f-has">الملفات البحثية</label><select id="f-has" class="form-select">
      ${opt('', 'الكل', '')}${opt('scholar', 'لديه Google Scholar', '')}${opt('scopus', 'لديه Scopus', '')}${opt('orcid', 'لديه ORCID', '')}${opt('none', 'بلا أي رابط بحثي', '')}${opt('verify', 'مطابقة تحتاج تحقق', '')}${opt('nomatch', 'غير مطابق في OpenAlex', '')}</select></div>
    <div class="fld"><label for="f-sort">ترتيب حسب</label><select id="f-sort" class="form-select">
      ${opt('h', 'h-index', st.sort)}${opt('cites', 'الاقتباسات', st.sort)}${opt('works', 'عدد المنشورات', st.sort)}${opt('w5', 'منشورات آخر 5 سنوات', st.sort)}${opt('c5', 'اقتباسات آخر 5 سنوات', st.sort)}${opt('i10', 'i10-index', st.sort)}${opt('scholar', 'اقتباسات Google Scholar', st.sort)}${opt('name', 'الاسم', st.sort)}</select></div>
    <div class="btns">
      <div class="rs-seg" id="f-view"><button data-v="cards" title="بطاقات"><i class="bi bi-grid-3x3-gap"></i></button><button data-v="table" title="جدول"><i class="bi bi-table"></i></button></div>
      <button class="btn btn-rs-o" id="f-csv" title="تنزيل القائمة الحالية"><i class="bi bi-download"></i> CSV</button>
    </div>
  </div>
  <div class="rs-count" id="f-count"></div>
  <div id="f-out"></div>
  <div class="text-center mt-3"><button class="btn btn-rs-o d-none" id="f-more">عرض المزيد</button></div>`;

  const depSel = R.$('#f-dept');
  const fillDepts = () => { depSel.innerHTML = opt('', 'كل الأقسام', st.dept) + R.depts(list, st.fac).map(d => opt(d, d, st.dept)).join(''); };
  fillDepts();

  const val = (r, k) => k === 'scholar' ? ((r.scholar || {}).cites || -1) : (r[k] || 0);
  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    let out = list.filter(r =>
      (!st.fac || r.faculty === st.fac) && (!st.dept || r.dept === st.dept) && (!st.rank || r.rank === st.rank) &&
      (!q.length || q.every(t => r._q.includes(t))) &&
      (!st.has || (st.has === 'none' ? !(r.links.scholar || r.links.scopus || r.links.orcid)
        : st.has === 'verify' ? r.oa_match === 'name~'
        : st.has === 'nomatch' ? !(r.oa_ids || []).length
        : st.has === 'scopus' ? (r.links.scopus || r.scopus_id) : r.links[st.has])));
    out.sort(st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ar') : (a, b) => val(b, st.sort) - val(a, st.sort) || b.cites - a.cites);
    return out;
  }

  function card(r) {
    const by = {}; Object.entries(r.by_year || {}).forEach(([y, v]) => by[y] = v);
    const sch = r.scholar;
    return `<div class="rs-person">
      <a class="top" href="${R.profileUrl(r)}">${R.avatar(r)}<span><span class="nm">${R.esc(r.name)}</span><br>
        <span class="sub">${R.esc([r.rank, r.dept].filter(Boolean).join(' · '))}<br>${R.esc(r.faculty)}</span></span></a>
      <div class="stats">
        <div><b>${R.n(r.works)}</b><span>منشور</span></div><div><b>${R.k(r.cites)}</b><span>اقتباس</span></div>
        <div><b>${r.h}</b><span>h-index</span></div><div><b>${R.n(r.w5)}</b><span>آخر 5 سنوات</span></div></div>
      <div title="المنشورات سنوياً ${Y - 9}–${Y}">${R.spark(by, Y - 9, Y)}</div>
      ${sch ? `<div class="rs-note">Google Scholar: <b>${R.n(sch.cites)}</b> اقتباس · h <b>${R.n(sch.h)}</b> ${R.srcBadge(r.scholar_at ? 'قُرئ ' + r.scholar_at : 'Scholar', r.links.scholar, 'bi-google')}</div>` : ''}
      ${r.scopus ? `<div class="rs-note">Scopus: <b>${R.n(r.scopus.docs)}</b> وثيقة · h <b>${R.n(r.scopus.h)}</b> ${R.srcBadge('Scopus', r.links.scopus || R.scopusAuthorUrl(r.scopus_id), 'bi-bar-chart-line')}</div>` : ''}
      <div class="foot">${R.matchBadge(r)}${R.linkList(r)}
        <div class="form-check"><input class="form-check-input" type="checkbox" data-cmp="${r.id}" id="c-${r.id}"${R.cmp.has(r.id) ? ' checked' : ''}><label class="form-check-label" for="c-${r.id}">مقارنة</label></div></div>
    </div>`;
  }
  const cols = [['name', 'الباحث'], ['dept', 'القسم'], ['works', 'منشورات'], ['w5', 'آخر 5'], ['cites', 'اقتباسات'], ['h', 'h'], ['i10', 'i10'], ['scholar', 'Scholar'], ['scopus', 'Scopus h'], ['links', 'روابط'], ['cmp', '']];
  function table(rows) {
    return `<div class="rs-card p-0"><div class="rs-scroll"><table class="rs-table"><thead><tr>${cols.map(([k, t]) => `<th class="${['name', 'dept', 'links', 'cmp'].includes(k) ? '' : 'num'}${st.sort === k ? ' sorted' : ''}" ${['dept', 'links', 'cmp', 'scopus'].includes(k) ? '' : `data-sort="${k}"`}>${t}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr><td><a class="d-flex gap-2 align-items-center text-decoration-none" href="${R.profileUrl(r)}">${R.avatar(r, 'sm')}<span><b>${R.esc(r.name)}</b><br><small class="text-muted">${R.esc(r.rank)}</small></span></a></td>
        <td><small>${R.esc(r.dept)}</small><br><small class="text-muted">${R.esc(r.faculty)}</small></td>
        <td class="num">${R.n(r.works)}</td><td class="num">${R.n(r.w5)}</td><td class="num">${R.n(r.cites)}</td><td class="num"><b>${r.h}</b></td><td class="num">${r.i10}</td>
        <td class="num">${r.scholar ? `<a href="${R.esc(r.links.scholar)}" target="_blank" rel="noopener">${R.n(r.scholar.cites)}</a>` : '–'}</td>
        <td class="num">${r.scopus ? `<a href="${R.esc(r.links.scopus || R.scopusAuthorUrl(r.scopus_id))}" target="_blank" rel="noopener">${R.n(r.scopus.h)}</a>` : '–'}</td>
        <td>${R.matchBadge(r)}</td>
        <td><input class="form-check-input" type="checkbox" data-cmp="${r.id}" title="أضف للمقارنة"${R.cmp.has(r.id) ? ' checked' : ''}></td></tr>`).join('')}
    </tbody></table></div></div>`;
  }

  function render() {
    const rows = filtered();
    R.$('#f-count').innerHTML = `${R.n(rows.length)} باحث${rows.length !== list.length ? ` من ${R.n(list.length)}` : ''} · مجموع منشوراتهم ${R.n(R.sum(rows.map(r => r.works)))} · وسيط h-index ${R.median(rows.filter(r => r.works).map(r => r.h))}`;
    R.$$('#f-view button').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
    const out = R.$('#f-out');
    if (!rows.length) { out.innerHTML = '<div class="rs-empty"><i class="bi bi-search"></i>لا توجد نتائج مطابقة</div>'; R.$('#f-more').classList.add('d-none'); return; }
    const page = rows.slice(0, st.shown);
    out.innerHTML = st.view === 'table' ? table(page) : `<div class="rs-people">${page.map(card).join('')}</div>`;
    R.$('#f-more').classList.toggle('d-none', rows.length <= st.shown);
    R.$('#f-more').textContent = `عرض المزيد (${R.n(rows.length - st.shown)})`;
    const u = new URL(location); ['q', 'fac', 'dept'].forEach(k => st[k] ? u.searchParams.set(k, st[k]) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }

  R.$('#f-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; st.shown = 60; render(); }));
  R.$('#f-fac').addEventListener('change', e => { st.fac = e.target.value; st.dept = ''; fillDepts(); st.shown = 60; render(); });
  depSel.addEventListener('change', e => { st.dept = e.target.value; render(); });
  R.$('#f-rank').addEventListener('change', e => { st.rank = e.target.value; render(); });
  R.$('#f-has').addEventListener('change', e => { st.has = e.target.value; render(); });
  R.$('#f-sort').addEventListener('change', e => { st.sort = e.target.value; render(); });
  R.$('#f-view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.view = b.dataset.v; R.store.set('rs-view', st.view); render(); });
  R.$('#f-more').addEventListener('click', () => { st.shown += 60; render(); });
  R.$('#f-out').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { st.sort = th.dataset.sort; R.$('#f-sort').value = st.sort; render(); }
  });
  R.$('#f-out').addEventListener('change', e => {
    const c = e.target.closest('[data-cmp]');
    if (c && !R.cmp.toggle(c.dataset.cmp)) c.checked = false;
  });
  R.$('#f-csv').addEventListener('click', () => R.csv(filtered().map(r => ({
    name: r.name, name_en: r.name_en, rank: r.rank, faculty: r.faculty, department: r.dept, works: r.works, works_5y: r.w5,
    citations_openalex: r.cites, h_index: r.h, i10: r.i10, scholar_citations: (r.scholar || {}).cites || '', scholar_h: (r.scholar || {}).h || '',
    scopus_docs: (r.scopus || {}).docs || '', scopus_h: (r.scopus || {}).h || '', openalex_match: r.oa_match || '',
    openalex: (r.oa_ids || []).map(R.oaAuthorUrl).join(' '), scholar: r.links.scholar || '', scopus: r.links.scopus || '', orcid: r.links.orcid || '', staff_page: r.profile || ''
  })), 'uop-researchers.csv'));
  document.addEventListener('cmp-change', () => R.$$('[data-cmp]').forEach(c => c.checked = R.cmp.has(c.dataset.cmp)));
  render();
})();
