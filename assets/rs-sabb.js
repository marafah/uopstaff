/* sabbatical.html: eligibility and preference points for إجازة التفرغ العلمي under تعليمات التفرغ العلمي لأعضاء الهيئة
   التدريسية في جامعة البترا (رقم 55 لسنة 2023): articles 3-6 (conditions), 7 (points when applicants outnumber places),
   10-11 (what is paid) and 8, 12-14 (obligations). */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data;
  try { data = await R.load('researchers'); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, thisYear = new Date().getFullYear();
  const ref = (a, d = '09') => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">${d === '02' ? 'النظام ' : ''}م(${a})</a>`;

  // المادة (7/أ): the six criteria
  const P = {
    rank: v => v === 'prof' ? 10 : v === 'assoc' ? 5 : 0,
    host: v => ({ t250: 20, t500: 15, t750: 10, more: 5, home: 2 })[v] || 0,
    h: v => v > 15 ? 20 : v >= 11 ? 15 : v >= 6 ? 10 : v >= 1 ? 5 : 0,
    serv: v => v > 20 ? 20 : v > 15 ? 15 : v > 10 ? 10 : v > 6 ? 5 : 0,
    mine: v => v === 0 ? 15 : v === 1 ? 5 : 0,
    fac: v => v === 0 ? 15 : v === 1 ? 10 : v === 2 ? 5 : 0,
  };
  const st = { rid: R.param('id'), rank: 'assoc', start: thisYear - 6, unpaid: 0, last: '', mine: 0, fac: 0, host: 't500', h: 0, remain: true, dept4: true, accr: true, plan: true, months: true };

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-calendar-range"></i>إجازة التفرغ العلمي: الاستحقاق ونقاط المفاضلة</h3>
      <p class="mb-0">تحقّق من شروط إجازة التفرغ العلمي في ${ref('3')} و${ref('5')} و${ref('6')}، واحسب نقاط المفاضلة الست في ${ref('7')} عند تقدّم أكثر من العدد المطلوب، واعرف ما يُصرف لك وما يلزمك بعد الإجازة.</p></div>
    <a class="btn btn-rs-o" href="regulations.html?doc=09"><i class="bi bi-book"></i> نص التعليمات</a>
  </section>
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-who"><i class="bi bi-person"></i> الباحث (اختياري)</label><input id="sb-who" class="form-control" list="sb-names" placeholder="اكتب اسمك…" autocomplete="off"><datalist id="sb-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-mortarboard"></i> الرتبة</span><div class="rs-seg rs-jf-span" id="sb-rank"><button data-v="prof">أستاذ</button><button data-v="assoc">أستاذ مشارك</button><button data-v="other">غير ذلك</button></div></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-start"><i class="bi bi-calendar"></i> سنة بدء الخدمة المتصلة في الجامعة</label><input id="sb-start" class="form-control" type="number" min="1990" max="${thisYear}"></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-unpaid"><i class="bi bi-pause-circle"></i> سنوات إجازة بغير راتب</label><input id="sb-unpaid" class="form-control" type="number" min="0" step="0.5"></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-last"><i class="bi bi-arrow-repeat"></i> سنة انتهاء آخر تفرغ علمي (إن وجد)</label><input id="sb-last" class="form-control" type="number" min="1990" max="${thisYear}" placeholder="لا يوجد"></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-mine"><i class="bi bi-person-check"></i> مرات حصولك على التفرغ</label><input id="sb-mine" class="form-control" type="number" min="0"></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-fac"><i class="bi bi-building"></i> مرات حصول كليتك على التفرغ</label><input id="sb-fac" class="form-control" type="number" min="0"><small class="rs-jf-hint">كما يحددها مجلس البحث العلمي</small></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-host"><i class="bi bi-bank"></i> الجامعة المستضيفة (التصنيف المعتمد)</label><select id="sb-host" class="form-select">
      <option value="t250">من 1 إلى 250</option><option value="t500">من 251 إلى 500</option><option value="t750">من 501 إلى 750</option><option value="more">أكثر من 750</option><option value="home">متفرغ للبحث العلمي فقط</option></select></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="sb-h"><i class="bi bi-graph-up"></i> h-index في Scopus</label><input id="sb-h" class="form-control" type="number" min="0"></div>
  </div>
  <div class="rs-pr-checks"><span class="rs-jf-l"><i class="bi bi-ui-checks"></i> شروط القسم والطلب</span>
    ${[['dept4', `يبقى في القسم 4 أعضاء على الأقل لتغطية التدريس والإشراف (${'م(5/ج)'})`], ['accr', 'لا تؤثر الإجازة على اعتماد القسم، أو يتوفر بديل يوافق عليه مجلس العمداء (م5/أ)'], ['plan', 'أرفقت مخططاً للعمل ومكان إجرائه في جامعة معترف بها أو للتفرغ للبحث (م3/ب، ج)'], ['months', 'أقدّم الطلب قبل ثلاثة أشهر على الأقل من بداية الفصل (م4/أ)']]
      .map(([k, l]) => `<label class="rs-pr-chk"><input type="checkbox" data-c="${k}" checked> ${l}</label>`).join('')}</div></section>
  <section class="rs-section rs-pr-result" id="sb-result"></section>
  <section class="rs-section rs-grid two" id="sb-more"></section>
  <p class="rs-note">أداة تقديرية غير رسمية تعتمد تعليمات التفرغ العلمي رقم (55) لسنة 2023 و${ref('19', '02')} من نظام الهيئة التدريسية. تُمنح الإجازة بقرار من مجلس العمداء بتنسيب من مجلس البحث العلمي وتوصية مجلسي الكلية والقسم (${ref('4')}/ب).</p>`;

  function render() {
    const r = byId[st.rid];
    ['start', 'unpaid', 'last', 'mine', 'fac', 'h'].forEach(k => { const el = R.$('#sb-' + k); if (document.activeElement !== el) el.value = st[k]; });
    R.$('#sb-host').value = st.host;
    R.$$('#sb-rank button').forEach(b => b.classList.toggle('on', b.dataset.v === st.rank));
    // المادة (3/أ) و(4/ج) و(6/د): six continuous years, unpaid leave not counted, counted again from the end of the last sabbatical
    const from = st.last ? Math.max(+st.start, +st.last) : +st.start;
    const years = Math.max(0, thisYear - from - (+st.unpaid || 0)), eligibleYear = from + 6 + (+st.unpaid || 0);
    const rankOk = st.rank !== 'other', yearsOk = years >= 6;
    const summer = st.last ? +st.last + 2 : null;
    const checks = [
      ['الرتبة', rankOk, rankOk ? (st.rank === 'prof' ? 'أستاذ' : 'أستاذ مشارك') : 'الإجازة لرتبتي أستاذ وأستاذ مشارك', ref('3') + ' ' + ref('19', '02')],
      ['ست سنوات متصلة في الجامعة', yearsOk, `${R.n(years)} ${years > 2 && years < 11 ? 'سنوات' : 'سنة'} ${st.last ? 'منذ انتهاء آخر تفرغ' : 'منذ بدء الخدمة'}${+st.unpaid ? ` بعد طرح ${st.unpaid} بغير راتب` : ''}`, ref('3') + ' ' + ref('6'), yearsOk ? '' : `تستحق ابتداءً من ${eligibleYear}`],
      ['أثر الإجازة على القسم', st.dept4 && st.accr, 'بقاء 4 أعضاء على الأقل، وعدم التأثير على الاعتماد أو توفّر بديل', ref('5')],
      ['الطلب', st.plan && st.months, 'مخطط العمل ومكانه، والتقدّم قبل ثلاثة أشهر', ref('3') + ' ' + ref('4')],
    ];
    const ok = checks.every(c => c[1]);
    const pts = [['الرتبة الأكاديمية', P.rank(st.rank), 10], ['الجامعة المستضيفة', P.host(st.host), 20], ['البحث العلمي (h-index)', P.h(+st.h || 0), 20],
      ['مدة الخدمة في الجامعة', P.serv(thisYear - +st.start), 20], ['مرات حصولك على التفرغ', P.mine(+st.mine || 0), 15], ['مرات حصول الكلية على التفرغ', P.fac(+st.fac || 0), 15]];
    const total = pts.reduce((t, p) => t + p[1], 0);
    R.$('#sb-result').innerHTML = `<div class="rs-pr-verdict ${ok ? 'ok' : 'no'}"><div class="ring" style="--p:${total}"><b>${total}</b><small>من 100 نقطة</small></div>
        <div class="txt"><span class="rs-tag ${ok ? 'ok' : 'warn'}"><i class="bi ${ok ? 'bi-check2-circle' : 'bi-exclamation-circle'}"></i> ${ok ? 'تبدو شروط الاستحقاق مستوفاة' : 'شروط الاستحقاق غير مكتملة'}</span>
          <h3>${r ? esc(r.name) + ' · ' : ''}نقاط المفاضلة (${ref('7')})</h3>
          <div class="bars">${pts.map(p => `<div><span>${p[0]}</span><i><b style="width:${100 * p[1] / p[2]}%"></b></i><em>${p[1]}/${p[2]}</em></div>`).join('')}</div></div></div>
      <div class="rs-pr-checklist">${checks.map(c => `<div class="${c[1] ? 'ok' : 'no'}"><i class="bi ${c[1] ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><div><b>${c[0]}</b><span>${c[2]}</span>${c[4] ? `<em>${c[4]}</em>` : ''}</div><small>${c[3]}</small></div>`).join('')}
        ${summer ? `<div class="${thisYear >= summer ? 'ok' : 'no'}"><i class="bi bi-sun-fill" style="color:#b8892b"></i><div><b>منحة البحث العلمي الصيفي</b><span>لا يحق التقدّم لها إلا بعد مضي عامين على انتهاء التفرغ: من ${summer}</span></div><small>${ref('5')}/ب</small></div>` : ''}</div>
      <p class="rs-note" style="grid-column:1/-1">تُطبَّق نقاط المفاضلة إذا تقدّم أكثر من العدد المطلوب، ويُختار صاحب النقاط الأعلى. مدة الخدمة للنقاط: ${R.n(thisYear - +st.start)} ${thisYear - +st.start > 2 && thisYear - +st.start < 11 ? 'سنوات' : 'سنة'} منذ ${st.start}.</p>`;
    R.$('#sb-more').innerHTML = `<div class="rs-card"><h3><i class="bi bi-wallet2"></i>ما يُصرف لك خلال الإجازة</h3><ul class="rs-rw-rules">
        <li>راتبك وجميع علاواتك، وتبقى خاضعاً للضمان الاجتماعي (${ref('11')}).</li><li>سلفة ثلاثة أشهر على الراتب تُصرف عند السفر (${ref('11')}).</li>
        <li>سلفة على حساب التأمين الصحي لا تقل عن ستة أشهر في الخارج (${ref('11')}).</li>
        <li>تذاكر سفر لك ولزوجك واثنين من أولادك دون الثامنة عشرة، ذهاباً وإياباً ولمرة واحدة، إذا كانت الإجازة سنة كاملة تقضي منها ثمانية أشهر متتالية على الأقل خارج الأردن (${ref('10')}).</li></ul></div>
      <div class="rs-card"><h3><i class="bi bi-list-check"></i>ما يلزمك بعد الإجازة</h3><ul class="rs-rw-rules">
        <li>تقديم العمل أو الأعمال التي أعددتها إلى عميد كليتك خلال شهرين من انتهاء الإجازة (${ref('8')}).</li>
        <li>الإشارة في مكان بارز من الإنتاج المنشور إلى أنه أُجري في إجازة التفرغ العلمي الممنوحة من الجامعة (${ref('8')}).</li>
        <li>لا تُقبل الاستقالة أثناء الإجازة أو بعدها إلا بعد نشر بحث أو قبوله من نتائجها (${ref('12')}).</li>
        <li>إن لم تُعتمد الأعمال تُسترد المبالغ المدفوعة، ولا تُحسب الإجازة للترقية (${ref('14')}).</li>
        <li>الغياب بعد انتهاء الإجازة يُحسم من الراتب، ويزيد على ثلاثة أسابيع دون عذر يُعدّ فاقداً للوظيفة (${ref('12')}، ${ref('13')}).</li></ul></div>`;
    const u = new URL(location); st.rid ? u.searchParams.set('id', st.rid) : u.searchParams.delete('id'); history.replaceState(null, '', u);
  }
  function load(r) {
    st.rid = r ? r.id : '';
    if (r) { st.rank = /^أستاذ$|^أ\.د|أستاذ دكتور/.test((r.rank || '').trim()) || (r.rank || '').trim() === 'أستاذ' ? 'prof' : /مشارك/.test(r.rank || '') ? 'assoc' : 'other'; st.h = r.sc ? r.sc.h || 0 : 0; }
    render();
  }
  if (st.rid && byId[st.rid]) { R.$('#sb-who').value = byId[st.rid].name; load(byId[st.rid]); } else render();
  R.$('#sb-who').addEventListener('change', e => { const r = list.find(x => x.name === e.target.value.trim()); if (r) load(r); });
  R.$('#sb-rank').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.rank = b.dataset.v; render(); } };
  ['start', 'unpaid', 'last', 'mine', 'fac', 'h'].forEach(k => { R.$('#sb-' + k).onchange = e => { st[k] = e.target.value === '' ? (k === 'last' ? '' : 0) : +e.target.value; render(); }; });
  R.$('#sb-host').onchange = e => { st.host = e.target.value; render(); };
  R.$$('[data-c]').forEach(c => { c.onchange = () => { st[c.dataset.c] = c.checked; render(); }; });
})();
