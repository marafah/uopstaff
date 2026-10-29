/* promotion.html: promotion readiness against تعليمات الهيئة التدريسية في جامعة البترا لسنة 2021 (articles 19, 21-25, 28, 33)
   and نظام الهيئة التدريسية (article 13). A researcher's publications are brought in from this site and placed in the
   official categories; every row can be corrected, and outputs can be added by hand. The verdict is an estimate:
   the decision is the appointment and promotion committee's, after external evaluation. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [];
  const thisYear = new Date().getFullYear();

  // المادة (23/أ): categories and points; type = the kind limited by المادة (22/د)
  const KINDS = {
    j_q12: ['البحث المنشور في مجلة مفهرسة في Web of Science أو Scopus (Q1–Q2)', 1, 2, 'journal'],
    p_world: ['براءة الاختراع المسجلة عالمياً', 1, 3, 'patent'],
    book_dist: ['الكتاب المحكم المتميز (تأليف، ترجمة، تحقيق)', 1, 2, 'book'],
    j_q34: ['البحث المنشور في مجلة مفهرسة في Scopus (Q3–Q4)', 2, 2, 'journal'],
    art_dist: ['العمل الفني، أو المعماري المحكم المتميز والإبداعي', 2, 2, 'art'],
    j_arab: ['البحث المنشور في المجلات العربية المعتمدة في الجامعة الأردنية', 3, 1, 'journal'],
    p_local: ['براءة الاختراع المسجلة محلياً', 3, 1, 'patent'],
    conf_world: ['البحث المنشور في وقائع مؤتمر عالمي محكم', 3, 1, 'conference'],
    thesis_world: ['البحث المستخلص من رسالة جامعية المنشور في مجلة عالمية', 3, 1, 'thesis'],
    j_na: ['البحث المنشور في مجلة مفهرسة في Scopus غير مصنفة (NA)', 3, 1, 'journal'],
    book: ['الكتاب المحكم (تأليف، ترجمة، تحقيق)', 4, 0.5, 'book'],
    j_approved: ['البحث المنشور في مجلة معتمدة محكمة', 4, 0.5, 'journal'],
    chapter: ['الفصل المحكم في كتاب', 4, 0.5, 'chapter'],
    art: ['العمل الفني، أو المعماري المحكم', 4, 0.5, 'art'],
    thesis_local: ['البحث المستخلص من رسالة جامعية المنشور في مجلة محلية معتمدة', 4, 0.5, 'thesis'],
    other: ['تقرير حالة طبية، أو حكم قضائي، أو برمجيات، أو ملحوظة علمية، أو بحث في وقائع مؤتمر غير عالمي، أو دراسة متخصصة ضمن مشروع', 4, 0.5, 'study'],
  };
  // المادة (22/د): the most that counts of each kind (journals: no limit)
  const CAP = { conference: [2, 'بحثان في وقائع المؤتمرات'], thesis: [2, 'بحثان مستخلصان من الرسائل الجامعية'], study: [2, 'دراستان'], book: [2, 'كتابان'], chapter: [1, 'فصل واحد في كتاب'] };
  const TARGET = {
    assoc: { name: 'أستاذ مشارك', from: 'أستاذ مساعد', pts: 8, lead: 6, art: '24' },
    full: { name: 'أستاذ', from: 'أستاذ مشارك', pts: 12, lead: 8, art: '25' },
  };
  const ref = (a, d = '05') => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">${d === '02' ? 'النظام' : 'التعليمات'} م(${a})</a>`;

  // a publication from this site, placed in a category, with the researcher's place among its authors
  function fromWork(w, r) {
    const conf = /conference/.test(w.type), chap = /chapter/.test(w.type), bk = w.type === 'book';
    const k = chap ? 'chapter' : bk ? 'book' : conf ? 'conf_world' : (w.q === 'Q1' || w.q === 'Q2' || (w.src || '').includes('w')) ? 'j_q12'
      : (w.q === 'Q3' || w.q === 'Q4') ? 'j_q34' : (w.src || '').includes('s') ? 'j_na' : 'j_approved';
    const au = (w.au || '').replace(/ …$/, '').split(/,\s*/).filter(Boolean);
    const last = R.norm(r.name_en || '').split(' ').pop(), first = au[0] ? R.norm(au[0]) : '';
    const lead = au.length ? !!(last && first.includes(last)) : null;
    return { id: w.id, t: w.t, y: w.y, v: w.v || '', k, lead: lead === null ? true : lead, solo: (w.na || au.length) === 1, uop: true, inc: true, auto: true, na: w.na || au.length || null, q: w.q || '', guessLead: lead !== null };
  }

  const st = { rid: R.param('id'), target: R.param('to') || 'assoc', fac: R.param('fac') || 'sci', since: +R.param('since') || thisYear - 5, uopYears: +R.param('uop') || 2,
    teach: true, rel: true, comm: true, reports: true, spec: true, sim: true, items: [] };

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-ladder"></i>هل أنا جاهز للترقية؟</h3>
      <p class="mb-0">أدخل بياناتك، أو اختر ملفك البحثي لاستيراد أبحاثك، فتُصنَّف حسب فئات الإنتاج العلمي ونقاطه في ${ref('23')}، وتُطبَّق عليها شروط ${ref('19')} و${ref('22')} و${ref('24')}/${ref('25')}، ثم تحصل على تقرير بما لديك وما ينقصك.</p></div>
    <a class="btn btn-rs-o" href="regulations.html?doc=05&a=19"><i class="bi bi-book"></i> نص شروط الترقية</a>
  </section>

  <section class="rs-section rs-card rs-jf no-print">
    <div class="rs-pr-form">
      <div class="rs-jf-f"><label class="rs-jf-l" for="pr-who"><i class="bi bi-person"></i> الباحث (لاستيراد الأبحاث)</label><input id="pr-who" class="form-control" list="pr-names" placeholder="اكتب اسمك…" autocomplete="off"><datalist id="pr-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-arrow-up-circle"></i> الترقية إلى</span><div class="rs-seg rs-jf-span" id="pr-to"><button data-v="assoc">أستاذ مشارك</button><button data-v="full">أستاذ</button></div></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-building"></i> الكلية</span><div class="rs-seg rs-jf-span" id="pr-fac"><button data-v="sci">علمية</button><button data-v="hum">إنسانية</button></div></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pr-since"><i class="bi bi-calendar"></i> سنة الحصول على الرتبة الحالية</label><input id="pr-since" class="form-control" type="number" min="1980" max="${thisYear}" value="${st.since}"></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pr-uop"><i class="bi bi-bank"></i> سنوات الخدمة في الجامعة في هذه الرتبة</label><input id="pr-uop" class="form-control" type="number" min="0" max="40" step="0.5" value="${st.uopYears}"></div>
    </div>
    <div class="rs-pr-checks"><span class="rs-jf-l"><i class="bi bi-ui-checks"></i> الشروط العامة (${ref('19')}، ${ref('28')}، ${ref('29')})</span>
      ${[['teach', 'ناجح في تدريسي'], ['rel', 'ناجح في علاقاتي في العمل الجامعي'], ['comm', 'فاعل في خدمة المجتمع وتنميته'], ['reports', 'تقدير تقريري رئيس القسم والعميد لا يقل عن 3 نقاط'], ['spec', '60% على الأقل من إنتاجي في تخصصي'], ['sim', 'نسبة التشابه لكل بحث لا تزيد على 20%']]
        .map(([k, l]) => `<label class="rs-pr-chk"><input type="checkbox" data-c="${k}" checked> ${l}</label>`).join('')}</div>
  </section>

  <section class="rs-section rs-pr-result" id="pr-result"></section>

  <section class="rs-section rs-card"><h3><i class="bi bi-journal-text"></i>الإنتاج العلمي المقدم للترقية <small class="fw-normal text-muted" id="pr-sub"></small>
      <span class="ms-auto d-flex gap-2 no-print"><button class="btn btn-sm btn-rs-o" id="pr-add"><i class="bi bi-plus-lg"></i> إضافة إنتاج يدوياً</button><button class="btn btn-sm btn-rs" type="button" onclick="print()"><i class="bi bi-printer"></i> التقرير</button></span></h3>
    <div class="rs-scroll" style="max-height:none"><table class="rs-table rs-pr-table" id="pr-table"></table></div>
    <p class="rs-note mt-2 mb-0">الفئة مقترحة من تصنيف المجلة (Scopus/Web of Science) ونوع المنشور، و«باحث رئيسي» من ترتيب الاسم الأول بين المؤلفين؛ صحّح أي صف قبل الاعتماد على النتيجة. البحث المستخلص من رسالة طالب يكون فيه الطالب هو الباحث الرئيسي (${ref('23')}/ب).</p>
  </section>

  <p class="rs-note">أداة تقديرية تعتمد نصوص ${ref('19')}–${ref('25')} من تعليمات الهيئة التدريسية لسنة 2021 و${ref('13', '02')} من نظام الهيئة التدريسية. قرار الترقية للجنة التعيين والترقية ومجلس العمداء بعد تقارير المقيّمين (${ref('33')})، ولا يُحتسب أي إنتاج سبق احتسابه في ترقية سابقة (${ref('26')}).</p>`;

  // ---------------------------------------------------------------- the rules
  function evaluate() {
    const T = TARGET[st.target], rows = st.items.map(x => Object.assign({}, x, { cat: KINDS[x.k][1], pts: KINDS[x.k][2], type: KINDS[x.k][3], why: '' }));
    rows.forEach(x => { if (!x.inc) x.why = 'مستبعد يدوياً'; else if (x.y && x.y < st.since) x.why = 'نُشر قبل الرتبة الحالية'; });
    let ok = rows.filter(x => !x.why).sort((a, b) => b.pts - a.pts || (b.lead - a.lead));
    // المادة (22/د): limits per kind
    const used = {};
    ok.forEach(x => { const c = CAP[x.type]; if (!c) return; used[x.type] = (used[x.type] || 0) + 1; if (used[x.type] > c[0]) x.why = `تجاوز الحد الأعلى (${c[1]})`; });
    ok = ok.filter(x => !x.why);
    // المادة (22/أ): one journal counts for at most half of the production required
    const perVenue = {};
    ok.forEach(x => { if (!x.v || !/journal|thesis/.test(x.type)) { x.cnt = x.pts; return; } const k = R.norm(x.v), have = perVenue[k] || 0, room = Math.max(0, T.pts / 2 - have);
      x.cnt = Math.min(x.pts, room); perVenue[k] = have + x.cnt; if (x.cnt < x.pts) x.why = x.cnt ? `احتُسب جزئياً: حد المجلة الواحدة ${T.pts / 2} نقاط` : `حد المجلة الواحدة (${T.pts / 2} نقاط)`; });
    rows.forEach(x => { if (x.cnt === undefined) x.cnt = 0; });
    const counted = rows.filter(x => x.cnt > 0), sum = f => counted.filter(f).reduce((t, x) => t + x.cnt, 0);
    const total = sum(() => true), leadPts = sum(x => x.lead && x.type !== 'thesis'), soloPts = sum(x => x.solo);
    const leadIn = c => counted.filter(x => x.lead && x.type !== 'thesis' && c.includes(x.cat)).length;
    const yrs = thisYear - st.since, need = total >= 2 * T.pts ? 4 : 5;
    const uopOut = counted.filter(x => x.uop), uop12 = uopOut.some(x => x.cat <= 2);
    const catRule = st.fac === 'sci'
      ? (st.target === 'assoc' ? [leadIn([1]) >= 1, `بحث واحد على الأقل من الفئة الأولى باحثاً رئيسياً (لديك ${leadIn([1])})`]
        : [leadIn([1]) >= 2, `بحثان من الفئة الأولى باحثاً رئيسياً (لديك ${leadIn([1])})`])
      : (st.target === 'assoc' ? [leadIn([1, 2]) >= 1 || soloPts >= 6, `بحث فئة أولى أو ثانية باحثاً رئيسياً (لديك ${leadIn([1, 2])})، أو 6 نقاط باحثاً منفرداً (لديك ${soloPts})`]
        : [leadIn([1]) >= 1 || leadIn([2]) >= 2, `بحث فئة أولى باحثاً رئيسياً (لديك ${leadIn([1])})، أو بحثان فئة ثانية باحثاً رئيسياً (لديك ${leadIn([2])})`]);
    const checks = [
      ['النقاط الكلية', total >= T.pts, `${fmtP(total)} من ${T.pts} نقاط مطلوبة`, ref(T.art), T.pts - total > 0 ? `ينقصك ${fmtP(T.pts - total)} نقطة` : ''],
      ['باحثاً رئيسياً', leadPts >= T.lead, `${fmtP(leadPts)} من ${T.lead} نقاط باحثاً رئيسياً`, ref(T.art + '/أ'), T.lead - leadPts > 0 ? `ينقصك ${fmtP(T.lead - leadPts)} نقطة باحثاً رئيسياً` : ''],
      [st.fac === 'sci' ? 'شرط الكليات العلمية' : 'شرط الكليات الإنسانية', catRule[0], catRule[1], ref(T.art + (st.fac === 'sci' ? '/ب' : '/ج')), ''],
      ['الأقدمية في الرتبة', yrs >= need, `${yrs} ${yrs > 2 && yrs < 11 ? 'سنوات' : 'سنة'} منذ ${st.since}؛ المطلوب ${need}${need === 4 ? ' (اختُصرت لتحقيقك ضعف النقاط)' : ' (أو 4 عند تحقيق ضعف النقاط)'}`, ref('19') + ' ' + ref('13', '02'),
        yrs < need ? `يمكن التقدّم قبل اكتمال المدة بثمانية أشهر (${ref('21')})` : ''],
      ['سنتان على الأقل في الجامعة', st.uopYears >= 2, `${st.uopYears} في الجامعة في هذه الرتبة`, ref('19'), ''],
      ['إنتاجان في الجامعة أحدهما فئة أولى أو ثانية', uopOut.length >= 2 && uop12, `${uopOut.length} ${uopOut.length > 2 && uopOut.length < 11 ? 'إنتاجات' : 'إنتاج'} في الجامعة${uop12 ? '، منها فئة أولى أو ثانية' : '، ولا يوجد منها فئة أولى أو ثانية'}`, ref('19'), ''],
      ['الشروط العامة', st.teach && st.rel && st.comm && st.reports && st.spec && st.sim, 'التدريس، والعلاقات، وخدمة المجتمع، والتقارير، والتخصص، ونسبة التشابه (بإقرارك)', ref('19') + ' ' + ref('28') + ' ' + ref('29'), ''],
    ];
    return { T, rows, counted, total, leadPts, checks, ready: checks.every(c => c[1]) };
  }
  const fmtP = v => (Math.round(v * 10) / 10).toString();

  // what would close the gap, in the cheapest outputs
  function advice(E) {
    const out = [], T = E.T, gapT = Math.max(0, T.pts - E.total), gapL = Math.max(0, T.lead - E.leadPts);
    if (gapL > 0 || gapT > 0) { const n = Math.ceil(Math.max(gapL, gapT) / 2);
      out.push(`${n > 2 ? n + ' أبحاث' : n === 2 ? 'بحثان' : 'بحث واحد'} في مجلات Scopus (Q1–Q4) أو Web of Science باحثاً رئيسياً تكفي لسدّ ${gapT > gapL ? 'النقاط' : 'نقاط الباحث الرئيسي'} (نقطتان لكل بحث).`); }
    if (!E.checks[2][1]) out.push(st.fac === 'sci' ? `بحث${st.target === 'full' ? 'ان' : ''} في مجلة Q1 أو Q2 (أو Web of Science) تكون فيه الاسم الأول.` : 'بحث في مجلة Q1–Q4 تكون فيه الاسم الأول.');
    if (!E.checks[5][1]) out.push('إنتاج من الفئة الأولى أو الثانية (Scopus Q1–Q4 أو Web of Science) منشور وأنت في الجامعة.');
    if (E.total >= T.pts && E.total < 2 * T.pts) out.push(`عند بلوغ ${2 * T.pts} نقطة (ضعف المطلوب) تُختصر مدة الأقدمية إلى أربع سنوات.`);
    return out;
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    R.$$('#pr-to button').forEach(b => b.classList.toggle('on', b.dataset.v === st.target));
    R.$$('#pr-fac button').forEach(b => b.classList.toggle('on', b.dataset.v === st.fac));
    const E = evaluate(), T = E.T, r = byId[st.rid];
    const pct = Math.min(100, Math.round(100 * E.total / T.pts)), lpct = Math.min(100, Math.round(100 * E.leadPts / T.lead));
    const adv = advice(E);
    R.$('#pr-result').innerHTML = `<div class="rs-pr-verdict ${E.ready ? 'ok' : 'no'}">
        <div class="ring" style="--p:${pct}"><b>${fmtP(E.total)}</b><small>من ${T.pts}</small></div>
        <div class="txt"><span class="rs-tag ${E.ready ? 'ok' : 'warn'}"><i class="bi ${E.ready ? 'bi-check2-circle' : 'bi-exclamation-circle'}"></i> ${E.ready ? 'تبدو الشروط مستوفاة' : 'لم تكتمل الشروط بعد'}</span>
          <h3>${r ? esc(r.name) + ' · ' : ''}الترقية من ${T.from} إلى ${T.name}</h3>
          <div class="bars"><div><span>النقاط الكلية</span><i><b style="width:${pct}%"></b></i><em>${fmtP(E.total)}/${T.pts}</em></div>
            <div><span>باحثاً رئيسياً</span><i><b style="width:${lpct}%"></b></i><em>${fmtP(E.leadPts)}/${T.lead}</em></div></div></div>
      </div>
      <div class="rs-pr-checklist">${E.checks.map(c => `<div class="${c[1] ? 'ok' : 'no'}"><i class="bi ${c[1] ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><div><b>${c[0]}</b><span>${c[2]}</span>${c[4] ? `<em>${c[4]}</em>` : ''}</div><small>${c[3]}</small></div>`).join('')}</div>
      ${adv.length ? `<div class="rs-pr-advice"><b><i class="bi bi-signpost-split"></i> ما ينقصك</b><ul>${adv.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}`;
    const cnt = E.counted.length;
    R.$('#pr-sub').textContent = `${st.items.length} إنتاجاً · المحتسب ${cnt} · ${fmtP(E.total)} نقطة`;
    R.$('#pr-table').innerHTML = `<thead><tr><th class="no-print"></th><th>الإنتاج العلمي</th><th class="num">السنة</th><th>الفئة (المادة 23)</th><th class="num">النقاط</th><th class="num">باحث رئيسي</th><th class="num">منفرد</th><th class="num">في الجامعة</th><th>الاحتساب</th></tr></thead><tbody>
      ${E.rows.map((x, i) => `<tr class="${x.cnt > 0 ? '' : 'off'}">
        <td class="no-print"><input type="checkbox" data-i="${i}" data-f="inc"${x.inc ? ' checked' : ''} title="ضمن الإنتاج المقدم"></td>
        <td class="t">${x.auto ? '' : `<input class="form-control form-control-sm" data-i="${i}" data-f="t" value="${esc(x.t)}" placeholder="عنوان الإنتاج">`}${x.auto ? `<b dir="auto">${esc(x.t)}</b>` : ''}<small class="ltr">${esc(x.v)}${x.q ? ` · ${x.q}` : ''}${x.na ? ` · ${x.na} مؤلفين` : ''}</small></td>
        <td class="num">${x.auto ? x.y || '–' : `<input class="form-control form-control-sm" type="number" data-i="${i}" data-f="y" value="${x.y || ''}" style="width:80px">`}</td>
        <td><select class="form-select form-select-sm" data-i="${i}" data-f="k">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === x.k ? ' selected' : ''}>${['', 'أولى', 'ثانية', 'ثالثة', 'رابعة'][v[1]]} · ${v[0]}</option>`).join('')}</select></td>
        <td class="num"><span class="rs-pr-pts c${x.cat}">${fmtP(x.pts)}</span></td>
        <td class="num"><input type="checkbox" data-i="${i}" data-f="lead"${x.lead ? ' checked' : ''}>${x.auto && !x.guessLead ? '<small class="d-block text-muted">تحقق</small>' : ''}</td>
        <td class="num"><input type="checkbox" data-i="${i}" data-f="solo"${x.solo ? ' checked' : ''}></td>
        <td class="num"><input type="checkbox" data-i="${i}" data-f="uop"${x.uop ? ' checked' : ''}></td>
        <td>${x.cnt > 0 ? `<span class="rs-tag ok">${fmtP(x.cnt)} محتسبة</span>` : ''}${x.why ? `<small class="d-block text-muted">${esc(x.why)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="text-center text-muted py-4">اختر اسمك أعلاه لاستيراد أبحاثك، أو أضف إنتاجك يدوياً.</td></tr>'}</tbody>`;
    const u = new URL(location); [['id', st.rid], ['to', st.target], ['fac', st.fac], ['since', st.since], ['uop', st.uopYears]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  function load(r) {
    st.rid = r ? r.id : '';
    st.items = r ? works.filter(w => (w.r || []).includes(r.id) && !['dataset', 'preprint', 'other'].includes(w.type)).sort((a, b) => (b.y || 0) - (a.y || 0)).map(w => fromWork(w, r)) : [];
    if (r && /إنسان|الآداب|الحقوق|الإعلام|العمارة/.test(r.faculty || '') && !R.param('fac')) st.fac = 'hum';
    if (r && /مشارك/.test(r.rank || '') && !R.param('to')) st.target = 'full';
    render();
  }
  if (st.rid && byId[st.rid]) { R.$('#pr-who').value = byId[st.rid].name; load(byId[st.rid]); } else render();

  R.$('#pr-who').addEventListener('change', e => { const r = list.find(x => x.name === e.target.value.trim()); if (r) load(r); });
  R.$('#pr-to').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.target = b.dataset.v; render(); } };
  R.$('#pr-fac').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.fac = b.dataset.v; render(); } };
  R.$('#pr-since').onchange = e => { st.since = +e.target.value || st.since; render(); };
  R.$('#pr-uop').onchange = e => { st.uopYears = +e.target.value || 0; render(); };
  R.$$('[data-c]').forEach(c => { c.onchange = () => { st[c.dataset.c] = c.checked; render(); }; });
  R.$('#pr-add').onclick = () => { st.items.unshift({ id: 'm' + Date.now(), t: '', y: thisYear, v: '', k: 'j_q12', lead: true, solo: false, uop: true, inc: true, auto: false }); render(); };
  R.$('#pr-table').addEventListener('change', e => { const el = e.target, i = el.dataset.i, f = el.dataset.f; if (i === undefined) return;
    const x = st.items[+i]; x[f] = el.type === 'checkbox' ? el.checked : f === 'y' ? +el.value : el.value; render(); });
})();
