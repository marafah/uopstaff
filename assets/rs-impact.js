/* impact.html: the university's highest-impact research as achievements that can be shared: the most cited (all time
   or recent), the rising papers (citations gained since the last monthly snapshot once there are two; until then the
   fastest-cited recent papers per year since publication), this year's Q1 papers, and the highest field-weighted impact
   (FWCI). Every card links to the paper (DOI) for sharing, since the pages of this section need signing in. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata, cm = {};
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  try { cm = await R.load('cites_monthly'); } catch (e) { cm = {}; }
  let UOP = null;   // works published with University of Petra as affiliation (the official Scopus export)
  try { const C = await R.load('collab'); const k = C.cols.indexOf('id'); UOP = new Set(C.docs.map(d => d[k]).filter(Boolean)); } catch (e) { UOP = null; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, thisYear = new Date().getFullYear();
  const cit = w => w.sc != null ? w.sc : (w.c || 0);
  const SKIP = ['dataset', 'preprint', 'other', 'peer-review', 'erratum', 'editorial'];
  const works = (wdata.works || []).filter(w => !SKIP.includes(w.type) && (w.r || []).length && w.y)
    .map(w => Object.assign(w, { _fac: [...new Set(w.r.map(id => byId[id] && byId[id].faculty).filter(Boolean))] }));
  const ranked = works.map(cit).sort((a, b) => b - a);
  const topPct = v => { const i = ranked.findIndex(x => x <= v); const p = 100 * (i + 1) / ranked.length; return p <= 1 ? 'أعلى 1%' : p <= 5 ? 'أعلى 5%' : p <= 10 ? 'أعلى 10%' : ''; };
  const snaps = Object.keys(cm).sort(), S1 = cm[snaps[snaps.length - 1]], S0 = snaps.length > 1 ? cm[snaps[snaps.length - 2]] : null;
  const fmtM = m => new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-01T00:00:00Z'));

  const TABS = {
    cited: ['الأكثر اقتباساً', 'bi-quote', 'الأبحاث الأكثر اقتباساً في Scopus (أو OpenAlex لغير المفهرسة)'],
    recent: ['الأكثر اقتباساً حديثاً', 'bi-clock-history', `الأكثر اقتباساً من أبحاث ${thisYear - 4}–${thisYear}`],
    rising: ['الصاعدة', 'bi-rocket-takeoff', S0 ? `الأكثر اكتساباً للاقتباسات بين ${fmtM(snaps[snaps.length - 2])} و${fmtM(snaps[snaps.length - 1])}` : `الأسرع اقتباساً: اقتباسات لكل سنة منذ النشر، لأبحاث ${thisYear - 2}–${thisYear}`],
    q1: ['Q1 هذه السنة', 'bi-award', `الأبحاث المنشورة في مجلات Q1 سنة ${thisYear}`],
    fwci: ['الأعلى أثراً نسبياً', 'bi-speedometer2', 'أعلى أثر اقتباس مرجّح بالمجال (FWCI): 1.0 = المتوسط العالمي لمثيلاتها'],
  };
  const st = { tab: R.param('tab') || 'cited', fac: R.param('fac'), n: 30, uop: !!UOP && R.param('all') !== '1' };
  app.innerHTML = `
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="im-fac"><i class="bi bi-building"></i> الكلية</label><select id="im-fac" class="form-select"><option value="">الجامعة كلها</option>${R.faculties(list).map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
    ${UOP ? `<div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-bank2"></i> الانتماء</span><label class="rs-pr-chk"><input type="checkbox" id="im-uop"${st.uop ? ' checked' : ''}> باسم جامعة البترا فقط (Scopus)</label><small class="rs-jf-hint">ألغِه لإظهار أبحاث الباحثين قبل انضمامهم للجامعة أيضاً</small></div>` : ''}
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-printer"></i> التقرير</span><button class="btn btn-rs" onclick="print()"><i class="bi bi-file-earmark-pdf"></i> طباعة</button></div>
  </div></section>
  <nav class="rs-tabs no-print" id="im-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}"><i class="bi ${v[1]}"></i> ${v[0]}</button>`).join('')}</nav>
  <section class="rs-section" id="im-head"></section>
  <section class="rs-section rs-im-list" id="im-out"></section>
  <p class="rs-note">الاقتباسات من Scopus إن كان البحث مفهرساً فيه، وإلا من OpenAlex؛ وFWCI من OpenAlex. «أعلى 1%» بين كل أبحاث باحثي الجامعة في هذا الموقع. «باسم جامعة البترا» = الأبحاث الواردة في تصدير Scopus الرسمي للجامعة. روابط المشاركة تشير إلى البحث نفسه (DOI) لأن صفحات هذا القسم تتطلب الدخول.</p>`;

  function pick() {
    const W = works.filter(w => (!st.fac || w._fac.includes(st.fac)) && (!st.uop || UOP.has(w.id)));
    if (st.tab === 'cited') return W.filter(w => cit(w) > 0).sort((a, b) => cit(b) - cit(a)).map(w => [w, cit(w), 'اقتباساً']);
    if (st.tab === 'recent') return W.filter(w => w.y >= thisYear - 4 && cit(w) > 0).sort((a, b) => cit(b) - cit(a)).map(w => [w, cit(w), 'اقتباساً']);
    if (st.tab === 'rising') {
      if (S0) return W.map(w => { const a = S1[w.id], b = S0[w.id]; return [w, a ? (a[0] || 0) - (b ? b[0] || 0 : 0) : 0, 'اقتباساً جديداً']; }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      return W.filter(w => w.y >= thisYear - 2 && w.y <= thisYear && cit(w) > 0).map(w => [w, +(cit(w) / (thisYear - w.y + 1)).toFixed(1), 'اقتباساً في السنة']).sort((a, b) => b[1] - a[1]);
    }
    if (st.tab === 'q1') return W.filter(w => w.y === thisYear && w.q === 'Q1').sort((a, b) => cit(b) - cit(a) || (b.fwci || 0) - (a.fwci || 0)).map(w => [w, cit(w), 'اقتباساً']);
    return W.filter(w => w.fwci != null && w.fwci > 0).sort((a, b) => b.fwci - a.fwci).map(w => [w, +w.fwci.toFixed(2), 'FWCI']);
  }
  const shareUrl = w => w.doi ? `https://doi.org/${w.doi}` : w.oaurl || w.url || '';
  const shareText = (w, v, u) => `إنجاز بحثي من جامعة البترا 🎓\n«${w.t}»\n${w.v ? w.v + (w.q ? ` (${w.q})` : '') + ' · ' : ''}${w.y}\n${st.tab === 'fwci' ? `أثر اقتباس مرجّح ${v} ضعف المتوسط العالمي` : `${R.n(cit(w))} اقتباساً`}\nالباحثون من الجامعة: ${(w.r || []).map(id => byId[id] && byId[id].name).filter(Boolean).join('، ')}${u ? '\n' + u : ''}`;
  function render() {
    R.$$('#im-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    const rows = pick(), T = TABS[st.tab];
    const people = new Set(rows.slice(0, st.n).flatMap(x => x[0].r)), facs = {};
    rows.slice(0, st.n).forEach(x => x[0]._fac.forEach(f => { facs[f] = (facs[f] || 0) + 1; }));
    R.$('#im-head').innerHTML = `<div class="rs-card rs-im-head"><div><h3><i class="bi ${T[1]}"></i>${T[0]}${st.fac ? ` · ${esc(st.fac)}` : ''}</h3><p class="mb-0 text-muted">${T[2]}</p></div>
      <div class="rs-im-stats"><span><b>${R.n(rows.length)}</b> بحثاً</span><span><b>${R.n(people.size)}</b> باحثاً في أول ${Math.min(st.n, rows.length)}</span>${!st.fac && Object.keys(facs).length ? `<span>الأكثر حضوراً: <b>${esc(Object.entries(facs).sort((a, b) => b[1] - a[1])[0][0])}</b></span>` : ''}</div></div>`;
    R.$('#im-out').innerHTML = rows.length ? rows.slice(0, st.n).map(([w, v, unit], i) => {
      const who = (w.r || []).map(id => byId[id]).filter(Boolean), tp = st.tab !== 'fwci' ? topPct(cit(w)) : '';
      return `<article class="rs-im-card${i < 3 ? ' top top' + (i + 1) : ''}">
        <div class="rk">${i < 3 ? `<i class="bi bi-trophy-fill"></i>` : ''}<b>${i + 1}</b></div>
        <div class="bd"><a class="t" href="${R.docUrl(w)}" dir="auto">${esc(w.t)}</a>
          <div class="m">${w.q ? R.qTag(w.q) : ''}<span class="ltr">${esc(w.v || '')}</span><span class="rs-tag y">${w.y}</span>${tp ? `<span class="rs-tag ok"><i class="bi bi-star-fill"></i> ${tp} في الجامعة</span>` : ''}${w.fwci != null && st.tab !== 'fwci' && w.fwci >= 2 ? `<span class="rs-tag oa">FWCI ${w.fwci.toFixed(1)}</span>` : ''}</div>
          <div class="who">${who.map(r => `<a class="rs-chip" href="${R.profileUrl(r)}">${R.avatar(r, 'sm')} ${esc(r.name)}</a>`).join('')}</div></div>
        <div class="vl"><b>${st.tab === 'fwci' ? v.toFixed(2) : R.n(v)}</b><small>${unit}</small>
          <div class="sh no-print"><button class="btn btn-sm btn-rs-o" data-share="${i}" title="مشاركة"><i class="bi bi-share"></i></button><button class="btn btn-sm btn-rs-o" data-copy="${i}" title="نسخ نص الإنجاز"><i class="bi bi-clipboard"></i></button>${shareUrl(w) ? `<a class="btn btn-sm btn-rs-o" target="_blank" rel="noopener" title="LinkedIn" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl(w))}"><i class="bi bi-linkedin"></i></a>` : ''}</div></div>
      </article>`; }).join('') + (rows.length > st.n ? `<button class="btn btn-rs-o w-100 no-print" id="im-more">عرض المزيد</button>` : '')
      : `<div class="rs-empty"><i class="bi bi-inbox"></i>لا أبحاث في هذه القائمة${st.fac ? ' لهذه الكلية' : ''}.</div>`;
    const more = R.$('#im-more'); if (more) more.onclick = () => { st.n += 30; render(); };
    R.$('#im-out').onclick = async e => {
      const b = e.target.closest('[data-share],[data-copy]'); if (!b) return;
      const [w, v] = rows[+(b.dataset.share || b.dataset.copy)], u = shareUrl(w), txt = shareText(w, v, u);
      if (b.dataset.share && navigator.share) { try { await navigator.share({ title: w.t, text: txt, url: u || undefined }); } catch (err) { /* cancelled */ } return; }
      try { await navigator.clipboard.writeText(txt); b.innerHTML = '<i class="bi bi-check2"></i>'; setTimeout(() => { b.innerHTML = `<i class="bi ${b.dataset.share ? 'bi-share' : 'bi-clipboard'}"></i>`; }, 1500); } catch (err) { prompt('انسخ النص:', txt); }
    };
    const u = new URL(location); [['tab', st.tab === 'cited' ? '' : st.tab], ['fac', st.fac], ['all', st.uop || !UOP ? '' : '1']].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  render();
  R.$('#im-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; st.n = 30; render(); } };
  R.$('#im-fac').onchange = e => { st.fac = e.target.value; st.n = 30; render(); };
  if (R.$('#im-uop')) R.$('#im-uop').onchange = e => { st.uop = e.target.checked; st.n = 30; render(); };
})();
