/* award.html: points for جائزة جامعة البترا للباحث المتميز في كل قسم أكاديمي (تعليمات رقم 6 لسنة 2022), article 8:
   the weights of the output of the three years before applying (lead or co-author), 10 points per 50 Scopus citations
   pro rata, and the minimum of 300 points (scientific departments) or 80 (humanities). The same estimate for every
   colleague in the department shows where an application would stand; the committee decides. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [], thisYear = new Date().getFullYear();
  const ref = a => `<a class="rs-ref" href="regulations.html?doc=11&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;

  // المادة (8/د): output -> [lead, co-author]
  const W = {
    pat_w: ['براءة الاختراع المسجلة عالمياً', 80, 40], pat_l: ['براءة الاختراع المسجلة محلياً', 60, 30],
    q1: ['بحث في مجلة Scopus (Q1)', 60, 30], q2: ['بحث في مجلة Scopus (Q2)', 50, 25], q3: ['بحث في مجلة Scopus (Q3)', 40, 20], q4: ['بحث في مجلة Scopus (Q4)', 30, 15],
    qna: ['بحث في مجلة مفهرسة في Scopus غير مصنفة', 20, 10],
    bk_w: ['كتاب محكم متميز في دار نشر عالمية', 60, 30], bk_a: ['كتاب محكم في دار نشر عربية', 30, 15], bk_l: ['كتاب محكم في دار نشر محلية', 20, 10],
    art_w: ['عمل فني أو معماري متميز على مستوى عالمي', 60, 30], art_a: ['عمل فني أو معماري على المستوى العربي', 30, 15], art_l: ['عمل فني أو معماري على المستوى المحلي', 20, 10],
    arab: ['بحث في المجلات العربية المعتمدة في الجامعة الأردنية', 20, 10], appr: ['بحث في مجلة معتمدة محكمة', 10, 5],
    cf_w: ['بحث في وقائع مؤتمر عالمي محكم', 20, 10], cf_r: ['بحث في وقائع مؤتمر إقليمي محكم', 10, 5], cf_l: ['بحث في وقائع مؤتمر محلي محكم', 8, 4],
    ch_w: ['فصل محكم في كتاب من دار نشر عالمية', 20, 10], ch_a: ['فصل محكم في كتاب من دار نشر عربية', 10, 5], ch_l: ['فصل محكم في كتاب من دار نشر محلية', 8, 4],
  };
  const kindOf = w => /chapter/.test(w.type) ? 'ch_w' : w.type === 'book' ? 'bk_w' : /conference/.test(w.type) ? 'cf_w'
    : w.q ? 'q' + w.q[1] : (w.src || '').includes('s') ? 'qna' : 'appr';
  const leadOf = (w, r) => { const au = (w.au || '').replace(/ …$/, '').split(/,\s*/).filter(Boolean); const last = R.norm(r.name_en || '').split(' ').pop();
    return au.length ? !!(last && R.norm(au[0]).includes(last)) : true; };
  const hum = r => /إنسان|الآداب|الحقوق|الإعلام|العمارة|التصميم/.test(r.faculty || '') && !/العلوم/.test(r.faculty || '');
  const windowFrom = () => thisYear - 3;      // the three years before applying (this year's output included)
  const itemsOf = r => works.filter(w => (w.r || []).includes(r.id) && (w.y || 0) >= windowFrom() && !['dataset', 'preprint', 'other'].includes(w.type))
    .map(w => ({ id: w.id, t: w.t, y: w.y, v: w.v || '', q: w.q || '', k: kindOf(w), lead: leadOf(w, r), inc: true, auto: true }));
  const score = (items, cites) => { const pts = items.filter(x => x.inc).reduce((t, x) => t + W[x.k][x.lead ? 1 : 2], 0), cp = 10 * (cites || 0) / 50; return { pts, cp, total: pts + cp }; };

  const st = { rid: R.param('id'), cites: '', sci: 'auto', won: false, items: [] };
  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-trophy"></i>نقاط جائزة الباحث المتميز</h3>
      <p class="mb-0">احسب نقاطك لجائزة جامعة البترا للباحث المتميز في كل قسم أكاديمي حسب أوزان ${ref('8')}: إنتاج السنوات الثلاث السابقة للتقدّم، باحثاً رئيسياً أو مشاركاً، مع 10 نقاط لكل 50 استشهاداً في Scopus، وقارن نفسك بزملائك في القسم.</p></div>
    <a class="btn btn-rs-o" href="regulations.html?doc=11&a=8"><i class="bi bi-book"></i> نص التعليمات</a>
  </section>
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="aw-who"><i class="bi bi-person"></i> الباحث</label><input id="aw-who" class="form-control" list="aw-names" placeholder="اكتب اسمك…" autocomplete="off"><datalist id="aw-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-building"></i> القسم</span><div class="rs-seg rs-jf-span" id="aw-sci"><button data-v="sci">علمي (300 نقطة)</button><button data-v="hum">إنساني (80 نقطة)</button></div></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="aw-cites"><i class="bi bi-quote"></i> الاستشهادات في Scopus</label><input id="aw-cites" class="form-control" type="number" min="0"><small class="rs-jf-hint" id="aw-cites-h"></small></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-calendar-check"></i> الفوز السابق</span><label class="rs-pr-chk"><input type="checkbox" id="aw-won"> فزت بالجائزة خلال السنوات الثلاث الماضية</label></div>
  </div></section>
  <section class="rs-section rs-pr-result" id="aw-result"></section>
  <section class="rs-section rs-card"><h3><i class="bi bi-journal-text"></i>الإنتاج العلمي ${thisYear - 3}–${thisYear} <small class="fw-normal text-muted" id="aw-sub"></small>
    <span class="ms-auto d-flex gap-2 no-print"><button class="btn btn-sm btn-rs-o" id="aw-add"><i class="bi bi-plus-lg"></i> إضافة يدوياً</button><button class="btn btn-sm btn-rs" type="button" onclick="print()"><i class="bi bi-printer"></i> التقرير</button></span></h3>
    <div class="rs-scroll" style="max-height:none"><table class="rs-table rs-pr-table" id="aw-table"></table></div>
    <p class="rs-note mt-2 mb-0">الوزن مقترح من تصنيف المجلة في Scopus ونوع المنشور، و«باحث رئيسي» هو الاسم الأول (${ref('2')}). لا يُنظر في إنتاج لا يذكر جامعة البترا عنواناً للباحث، أو منشور في مجلة استغلالية (${ref('8')}/ب، ج). صحّح أي صف عند الحاجة.</p></section>
  <section class="rs-section rs-card" id="aw-dept"></section>
  <p class="rs-note">الجائزة: شهادة تقدير ودرع التميز ومكافأة 500 دينار لكل باحث متميز في كل قسم (${ref('6')})، ويُدعى أعضاء هيئة التدريس للتقدّم مطلع الفصل الدراسي الثاني (${ref('3')}). أداة تقديرية غير رسمية؛ القرار لمجلس العمداء بتنسيب لجنة الكلية وعميد البحث العلمي (${ref('5')}).</p>`;

  function render() {
    const r = byId[st.rid], isHum = st.sci === 'auto' ? (r ? hum(r) : false) : st.sci === 'hum', min = isHum ? 80 : 300;
    R.$$('#aw-sci button').forEach(b => b.classList.toggle('on', b.dataset.v === (isHum ? 'hum' : 'sci')));
    const cites = st.cites === '' ? (r && r.sc ? r.sc.cites || 0 : 0) : +st.cites;
    R.$('#aw-cites').value = cites; R.$('#aw-cites-h').textContent = st.cites === '' && r && r.sc ? 'من ملفك في Scopus (كل السنوات)؛ عدّلها حسب ما تعتمده اللجنة' : '';
    const S = score(st.items, cites), pass = S.total >= min && !st.won;
    const pct = Math.min(100, Math.round(100 * S.total / min));
    const counts = {}; st.items.filter(x => x.inc).forEach(x => { counts[x.k] = (counts[x.k] || 0) + 1; });
    R.$('#aw-result').innerHTML = `<div class="rs-pr-verdict ${pass ? 'ok' : 'no'}"><div class="ring" style="--p:${pct}"><b>${R.n(S.total)}</b><small>من ${min} حداً أدنى</small></div>
        <div class="txt"><span class="rs-tag ${pass ? 'ok' : 'warn'}"><i class="bi ${pass ? 'bi-check2-circle' : 'bi-exclamation-circle'}"></i> ${pass ? 'تتجاوز الحد الأدنى للجائزة' : st.won ? 'لا يحق التقدّم قبل مضي ثلاث سنوات على الفوز' : 'دون الحد الأدنى للجائزة'}</span>
          <h3>${r ? esc(r.name) + ' · ' : ''}قسم ${isHum ? 'إنساني' : 'علمي'}</h3>
          <div class="bars"><div><span>نقاط الإنتاج</span><i><b style="width:${Math.min(100, 100 * S.pts / min)}%"></b></i><em>${R.n(S.pts)}</em></div>
            <div><span>نقاط الاستشهاد</span><i><b style="width:${Math.min(100, 100 * S.cp / min)}%;background:#1f6f78"></b></i><em>${R.n(S.cp)}</em></div></div></div></div>
      <div class="rs-pr-checklist">
        <div class="${S.total >= min ? 'ok' : 'no'}"><i class="bi ${S.total >= min ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><div><b>الحد الأدنى للنقاط</b><span>${R.n(S.total)} من ${min} نقطة (${isHum ? 'الأقسام الإنسانية' : 'الأقسام العلمية'})</span>${S.total < min ? `<em>ينقصك ${R.n(min - S.total)} نقطة، مثل ${Math.ceil((min - S.total) / 60)} ${Math.ceil((min - S.total) / 60) > 2 ? 'أبحاث' : 'بحث'} Q1 باحثاً رئيسياً (60 نقطة لكل بحث)</em>` : ''}</div><small>${ref('8')}/ز</small></div>
        <div class="${!st.won ? 'ok' : 'no'}"><i class="bi ${!st.won ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><div><b>عدم الفوز خلال ثلاث سنوات</b><span>${st.won ? 'فزت بها خلال السنوات الثلاث الماضية' : 'لم تفز بها خلال السنوات الثلاث الماضية'}</span></div><small>${ref('7')}</small></div>
        <div class="ok"><i class="bi bi-info-circle-fill" style="color:#2b5ea7"></i><div><b>توزيع إنتاجك</b><span>${Object.entries(counts).sort((a, b) => W[b[0]][1] - W[a[0]][1]).map(([k, n]) => `${n} × ${esc(W[k][0])}`).join(' · ') || 'لا إنتاج محتسب'}</span></div><small>${ref('8')}/د</small></div>
      </div>`;
    R.$('#aw-sub').textContent = `${st.items.filter(x => x.inc).length} محتسب · ${R.n(S.pts)} نقطة`;
    R.$('#aw-table').innerHTML = `<thead><tr><th class="no-print"></th><th>الإنتاج العلمي</th><th class="num">السنة</th><th>النوع (المادة 8/د)</th><th class="num">باحث رئيسي</th><th class="num">النقاط</th></tr></thead><tbody>
      ${st.items.map((x, i) => `<tr class="${x.inc ? '' : 'off'}"><td class="no-print"><input type="checkbox" data-i="${i}" data-f="inc"${x.inc ? ' checked' : ''}></td>
        <td class="t">${x.auto ? `<b dir="auto">${esc(x.t)}</b>` : `<input class="form-control form-control-sm" data-i="${i}" data-f="t" value="${esc(x.t)}" placeholder="العنوان">`}<small class="ltr">${esc(x.v)}${x.q ? ' · ' + x.q : ''}</small></td>
        <td class="num">${x.y || '–'}</td><td><select class="form-select form-select-sm" data-i="${i}" data-f="k">${Object.entries(W).map(([k, v]) => `<option value="${k}"${k === x.k ? ' selected' : ''}>${v[0]} (${v[1]}/${v[2]})</option>`).join('')}</select></td>
        <td class="num"><input type="checkbox" data-i="${i}" data-f="lead"${x.lead ? ' checked' : ''}></td><td class="num"><span class="rs-pr-pts c${x.lead ? 1 : 3}">${x.inc ? W[x.k][x.lead ? 1 : 2] : 0}</span></td></tr>`).join('')
        || `<tr><td colspan="6" class="text-center text-muted py-4">اختر اسمك أعلاه لاستيراد إنتاجك منذ ${thisYear - 3}، أو أضفه يدوياً.</td></tr>`}</tbody>`;
    dept(r, isHum, min);
    const u = new URL(location); st.rid ? u.searchParams.set('id', st.rid) : u.searchParams.delete('id'); history.replaceState(null, '', u);
  }
  // the same estimate for everyone in the department, from this site's publication data
  function dept(r, isHum, min) {
    const box = R.$('#aw-dept');
    if (!r || !r.dept) { box.hidden = true; return; }
    box.hidden = false;
    const mates = list.filter(x => x.dept === r.dept && x.faculty === r.faculty).map(x => {
      const it = x.id === r.id ? st.items : itemsOf(x), c = x.id === r.id ? (st.cites === '' ? (x.sc ? x.sc.cites || 0 : 0) : +st.cites) : (x.sc ? x.sc.cites || 0 : 0);
      return { x, ...score(it, c) }; }).sort((a, b) => b.total - a.total);
    const mx = Math.max(1, ...mates.map(m => m.total)), pos = mates.findIndex(m => m.x.id === r.id) + 1;
    box.innerHTML = `<h3><i class="bi bi-bar-chart-steps"></i>تقدير الترتيب في قسم ${esc(r.dept)} <span class="rs-tag y">${pos} من ${mates.length}</span><small class="fw-normal text-muted">حسب الأوزان نفسها وبيانات هذا الموقع</small></h3>
      <ol class="rs-venues">${mates.map((m, i) => `<li class="${m.x.id === r.id ? 'me' : ''}"><span class="rk">${i + 1}</span><div class="nm"><div class="t"><a href="${R.profileUrl(m.x)}">${esc(m.x.name)}</a>${m.total >= min ? ' <span class="rs-tag ok">فوق الحد الأدنى</span>' : ''}</div>
        <div class="rs-barwrap"><div class="rs-bar" style="width:${(100 * m.total / mx).toFixed(0)}%"></div></div></div><b class="ct">${R.n(m.total)}<small>نقطة</small></b></li>`).join('')}</ol>
      <p class="rs-note mt-2 mb-0">تقدير آلي لكل زميل من أبحاثه المسجلة هنا واستشهاداته في Scopus، بلا براءات أو كتب أو أعمال فنية غير مسجلة؛ يتقدّم كل باحث بإنتاجه الفعلي.</p>`;
  }
  function load(r) { st.rid = r ? r.id : ''; st.items = r ? itemsOf(r) : []; st.cites = ''; render(); }
  if (st.rid && byId[st.rid]) { R.$('#aw-who').value = byId[st.rid].name; load(byId[st.rid]); } else render();
  R.$('#aw-who').addEventListener('change', e => { const r = list.find(x => x.name === e.target.value.trim()); if (r) load(r); });
  R.$('#aw-sci').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.sci = b.dataset.v; render(); } };
  R.$('#aw-cites').onchange = e => { st.cites = e.target.value; render(); };
  R.$('#aw-won').onchange = e => { st.won = e.target.checked; render(); };
  R.$('#aw-add').onclick = () => { st.items.unshift({ id: 'm' + Date.now(), t: '', y: thisYear, v: '', q: '', k: 'q1', lead: true, inc: true, auto: false }); render(); };
  R.$('#aw-table').addEventListener('change', e => { const el = e.target, i = el.dataset.i, f = el.dataset.f; if (i === undefined) return;
    st.items[+i][f] = el.type === 'checkbox' ? el.checked : el.value; render(); });
})();
