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
  const st = Object.assign({ q: R.param('q'), fac: R.param('fac'), dept: R.param('dept'), rank: '', has: '', sort: 'sc_h', view: R.store.get('rs-view', 'cards'), shown: 60 }, {});
  const opt = (v, t, sel) => `<option value="${R.esc(v)}"${v === sel ? ' selected' : ''}>${R.esc(t)}</option>`;

  app.innerHTML = `
  <div class="rs-toolbar no-print">
    <div class="fld grow"><label for="f-q">بحث</label><input id="f-q" class="form-control" type="search" placeholder="اسم، تخصص، اهتمام بحثي، مجال…" value="${R.esc(st.q)}"></div>
    <div class="fld"><label for="f-fac">الكلية</label><select id="f-fac" class="form-select">${opt('', 'كل الكليات', st.fac)}${R.faculties(list).map(f => opt(f, f, st.fac)).join('')}</select></div>
    <div class="fld"><label for="f-dept">القسم</label><select id="f-dept" class="form-select"></select></div>
    <div class="fld"><label for="f-rank">الرتبة</label><select id="f-rank" class="form-select">${opt('', 'كل الرتب', '')}${ranks.map(r => opt(r, r, '')).join('')}</select></div>
    <div class="fld"><label for="f-has">الملفات البحثية</label><select id="f-has" class="form-select">
      ${opt('', 'الكل', '')}${opt('scholar', 'لديه Google Scholar', '')}${opt('scopus', 'لديه وثائق في Scopus', '')}${opt('noscopus', 'بلا وثائق في Scopus', '')}${opt('wos', 'لديه وثائق في Web of Science', '')}${opt('orcid', 'لديه ORCID', '')}${opt('none', 'بلا أي رابط بحثي', '')}${opt('verify', 'مطابقة تحتاج تحقق', '')}${opt('nomatch', 'غير مطابق في OpenAlex', '')}</select></div>
    <div class="fld"><label for="f-sort">ترتيب حسب</label><select id="f-sort" class="form-select">
      <optgroup label="Scopus (المعتمد)">${opt('sc_h', 'h-index في Scopus', st.sort)}${opt('sc_docs', 'وثائق Scopus', st.sort)}${opt('sc_cites', 'اقتباسات Scopus', st.sort)}${opt('sc_w5', 'وثائق Scopus آخر 5 سنوات', st.sort)}${opt('q12', 'أبحاث Q1 و Q2', st.sort)}${opt('wos_docs', 'وثائق Web of Science', st.sort)}${opt('wos_h', 'h-index في Web of Science', st.sort)}</optgroup>
      <optgroup label="مصادر أخرى">${opt('h', 'h-index (OpenAlex)', st.sort)}${opt('cites', 'اقتباسات OpenAlex', st.sort)}${opt('works', 'كل المنشورات', st.sort)}${opt('scholar', 'اقتباسات Google Scholar', st.sort)}${opt('name', 'الاسم', st.sort)}</optgroup></select></div>
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

  // Scopus figures as on the author's Scopus page (whole profile) when they were read, otherwise the Petra-affiliated ones
  const SF = r => r.scopus && r.scopus.docs != null ? r.scopus : (r.sc || {});
  const scv = (r, k) => SF(r)[k] || 0;
  const uopLine = r => r.scopus && r.sc ? `<small class="rs-uopv" title="الوثائق بانتماء جامعة البترا">البترا: ${R.n(r.sc.docs || 0)}</small>` : '';
  const val = (r, k) => k === 'scholar' ? ((r.scholar || {}).cites || -1)
    : k === 'q12' ? (((r.sc || {}).q || {}).Q1 || 0) + (((r.sc || {}).q || {}).Q2 || 0)
    : k.startsWith('sc_') ? scv(r, k.slice(3)) : k.startsWith('wos_') ? ((r.wos || {})[k.slice(4)] || 0) : (r[k] || 0);
  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    let out = list.filter(r =>
      (!st.fac || r.faculty === st.fac) && (!st.dept || r.dept === st.dept) && (!st.rank || r.rank === st.rank) &&
      (!q.length || q.every(t => r._q.includes(t))) &&
      (!st.has || (st.has === 'none' ? !(r.links.scholar || r.links.scopus || r.links.orcid)
        : st.has === 'verify' ? (r.oa_match === 'name~' || r.scopus_match === 'name~')
        : st.has === 'nomatch' ? !(r.oa_ids || []).length
        : st.has === 'noscopus' ? !(r.sc && r.sc.docs)
        : st.has === 'scopus' ? (r.sc && r.sc.docs) : st.has === 'wos' ? (r.wos && r.wos.docs) : r.links[st.has])));
    out.sort(st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ar') : (a, b) => val(b, st.sort) - val(a, st.sort) || scv(b, 'cites') - scv(a, 'cites') || b.cites - a.cites);
    return out;
  }

  function card(r) {
    const sc = r.sc || {}, q = sc.q || {};
    const by = {}; Object.entries(sc.by_year || {}).forEach(([y, n]) => by[y] = [n]);
    const sch = r.scholar;
    return `<div class="rs-person">
      <a class="top" href="${R.profileUrl(r)}">${R.avatar(r)}<span><span class="nm">${R.esc(r.name)}</span><br>
        <span class="sub">${R.esc([r.rank, r.dept].filter(Boolean).join(' · '))}<br>${R.esc(r.faculty)}</span></span></a>
      <div class="stats" title="${r.scopus ? `Scopus: ملف الباحث كما في صفحته على Scopus${r.scopus.at ? ' بتاريخ ' + r.scopus.at : ''}` : 'Scopus: الوثائق بانتماء جامعة البترا'}">
        <div><b>${R.n(SF(r).docs || 0)}</b><span>وثيقة Scopus</span>${uopLine(r)}</div><div><b>${R.k(SF(r).cites || 0)}</b><span>اقتباس Scopus</span></div>
        <div><b>${SF(r).h || 0}</b><span>h في Scopus</span></div><div><b>${(q.Q1 || 0) + (q.Q2 || 0)}</b><span>Q1 + Q2</span></div></div>
      <div title="وثائق Scopus سنوياً ${Y - 9}–${Y}">${R.spark(by, Y - 9, Y)}</div>
      ${r.wos ? `<div class="rs-note">Web of Science: <b>${R.n(r.wos.docs)}</b> وثيقة · ${R.n(r.wos.cites)} اقتباس · h <b>${r.wos.h}</b></div>` : ''}
      <div class="rs-note">OpenAlex: ${R.n(r.works)} منشور · ${R.n(r.cites)} اقتباس · h ${r.h}${sch ? ` · Google Scholar: ${R.n(sch.cites)} اقتباس، h ${R.n(sch.h)} ${R.srcBadge(r.scholar_at ? 'قُرئ ' + r.scholar_at : 'Scholar', r.links.scholar, 'bi-google')}` : ''}</div>
      <div class="foot">${R.scBadge(r)}${R.matchBadge(r)}${R.linkList(r)}
        <div class="form-check"><input class="form-check-input" type="checkbox" data-cmp="${r.id}" id="c-${r.id}"${R.cmp.has(r.id) ? ' checked' : ''}><label class="form-check-label" for="c-${r.id}">مقارنة</label></div></div>
    </div>`;
  }
  const cols = [['name', 'الباحث', 'bi-person-fill', 'ic-m'], ['dept', 'القسم والكلية', 'bi-diagram-3-fill', 'ic-p'], ['sc_docs', 'وثائق Scopus', 'bi-file-earmark-text-fill', 'ic-o'], ['sc_cites', 'اقتباسات Scopus', 'bi-quote', 'ic-y'], ['sc_h', 'h-index Scopus', 'bi-graph-up-arrow', 'ic-g'], ['q12', 'Q1 + Q2', 'bi-award-fill', 'ic-t'], ['works', 'منشورات OpenAlex', 'bi-globe2', 'ic-b'], ['h', 'h OpenAlex', 'bi-graph-up', 'ic-b'], ['scholar', 'Scholar', 'bi-google', 'ic-y'], ['links', 'المطابقة', 'bi-patch-check-fill', 'ic-g'], ['cmp', 'مقارنة', 'bi-intersect', '']];
  const RK = { 'أستاذ': '#901d23', 'أستاذ مشارك': '#1f6f78', 'أستاذ مساعد': '#b8892b', 'مدرس': '#6b7a80', 'محاضر': '#6b7a80' };
  function table(rows) {
    const mx = k => Math.max(1, ...rows.map(r => val(r, k)));
    const mC = mx('sc_cites'), mD = mx('sc_docs');
    const hT = h => h >= 20 ? 'h4' : h >= 10 ? 'h3' : h >= 5 ? 'h2' : h > 0 ? 'h1' : 'h0';
    return `<div class="rs-scroll rs-jtwrap"><table class="rs-jt2 rs-rtab"><thead><tr>${cols.map(([k, t, ic, c]) => `<th class="${['name', 'dept'].includes(k) ? '' : 'c'}${st.sort === k ? ' sorted' : ''}" ${['dept', 'links', 'cmp'].includes(k) ? '' : `data-sort="${k}" title="رتّب حسب ${t}"`}><i class="bi ${ic} ${c}"></i> ${t}${st.sort === k ? ' <i class="bi bi-sort-down"></i>' : ''}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, n) => { const sc = r.sc || {}, q = sc.q || {}, su = R.scUrl(r), q12 = (q.Q1 || 0) + (q.Q2 || 0); const by = {}; Object.entries(sc.by_year || {}).forEach(([y, v]) => by[y] = [v]);
        return `<tr><td class="who"><a href="${R.profileUrl(r)}"><span class="rk">${n + 1}</span>${R.avatar(r, 'sm')}<span><b>${R.esc(r.name)}</b>${r.rank ? `<span class="rs-rank" style="--rc:${RK[r.rank] || '#6b7a80'}">${R.esc(r.rank)}</span>` : ''}</span></a></td>
        <td class="dp"><b>${R.esc(r.dept)}</b><small><i class="bi bi-bank2"></i> ${R.esc(r.faculty)}</small></td>
        <td class="c"><div class="cellv">${su ? `<a class="pill or" href="${R.esc(su)}" target="_blank" rel="noopener" title="افتح في Scopus للمطابقة">${R.n(scv(r, 'docs'))} <i class="bi bi-box-arrow-up-left"></i></a>` : `<span class="pill gr">${R.n(scv(r, 'docs'))}</span>`}${uopLine(r)}<span class="bar o"><i style="width:${(100 * scv(r, 'docs') / mD).toFixed(0)}%"></i></span></div></td>
        <td class="c"><div class="cellv"><b class="big">${R.n(scv(r, 'cites'))}</b>${r.scopus && r.sc ? `<small class="rs-uopv">البترا: ${R.n(r.sc.cites || 0)}</small>` : ''}<span class="bar y"><i style="width:${(100 * scv(r, 'cites') / mC).toFixed(0)}%"></i></span></div></td>
        <td class="c"><span class="hb ${hT(scv(r, 'h'))}">${scv(r, 'h')}</span>${r.scopus && r.sc ? `<small class="rs-uopv d-block">البترا: ${r.sc.h || 0}</small>` : ''}</td>
        <td class="c">${q12 ? `<span class="pill qg"><i class="bi bi-award-fill"></i> ${q12}</span>` : '<span class="na">0</span>'}</td>
        <td class="c">${R.n(r.works)}</td><td class="c">${r.h || 0}</td>
        <td class="c">${r.scholar ? `<a class="pill bl" href="${R.esc(r.links.scholar)}" target="_blank" rel="noopener">${R.n(r.scholar.cites)}</a>` : '<span class="na">—</span>'}</td>
        <td class="c">${R.scBadge(r)}</td>
        <td class="c"><input class="form-check-input big-cb" type="checkbox" data-cmp="${r.id}" title="أضف للمقارنة"${R.cmp.has(r.id) ? ' checked' : ''}></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  function render() {
    const rows = filtered();
    const scAt = list.map(r => (r.scopus || {}).at).filter(Boolean).sort().pop(), scN = list.filter(r => r.scopus).length;
    R.$('#f-count').innerHTML = `${scN ? `<span class="rs-sc-asof"><i class="bi bi-patch-check"></i> أرقام Scopus لـ ${R.n(scN)} باحثاً كما في صفحاتهم على Scopus بتاريخ ${R.esc(scAt)}، وتحتها ما يحمل انتماء جامعة البترا</span> · ` : ''}${R.n(rows.length)} باحث${rows.length !== list.length ? ` من ${R.n(list.length)}` : ''} · مجموع منشوراتهم ${R.n(R.sum(rows.map(r => r.works)))} · ${R.n(R.sum(rows.map(r => (r.sc || {}).docs || 0)))} وثيقة Scopus بانتماء البترا · وسيط h في Scopus ${R.median(rows.filter(r => r.scopus || r.sc).map(r => scv(r, 'h')))}`;
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
    scopus_docs_profile: r.scopus ? r.scopus.docs : '', scopus_citations_profile: r.scopus ? r.scopus.cites : '', scopus_h_profile: r.scopus ? r.scopus.h : '', scopus_profile_date: r.scopus ? r.scopus.at || '' : '',
    scopus_docs_uop: (r.sc || {}).docs || 0, scopus_citations_uop: (r.sc || {}).cites || 0, scopus_h_uop: (r.sc || {}).h || 0,
    q1: ((r.sc || {}).q || {}).Q1 || 0, q2: ((r.sc || {}).q || {}).Q2 || 0, q3: ((r.sc || {}).q || {}).Q3 || 0, q4: ((r.sc || {}).q || {}).Q4 || 0,
    wos_docs_uop: (r.wos || {}).docs || 0, wos_citations_uop: (r.wos || {}).cites || 0, wos_h_uop: (r.wos || {}).h || 0,
    scopus_author_ids: (r.scopus_ids || []).join(' '), scopus_match: r.scopus_match || '', openalex_match: r.oa_match || '',
    openalex: (r.oa_ids || []).map(R.oaAuthorUrl).join(' '), scholar: r.links.scholar || '', scopus: r.links.scopus || '', orcid: r.links.orcid || '', staff_page: r.profile || ''
  })), 'uop-researchers.csv'));
  document.addEventListener('cmp-change', () => R.$$('[data-cmp]').forEach(c => c.checked = R.cmp.has(c.dataset.cmp)));
  render();
})();
