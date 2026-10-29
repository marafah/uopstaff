/* journals.html: every Scopus journal (SCImago SJR) with quartiles, ranking, links, how fast it decides and publishes
   (medians from Crossref dates of recent papers), and how Jordanian researchers use it; plus a journal finder for a paper */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let J, T = {}, FL = null;
  // the directory itself is enough to draw the page; review times arrive in parallel, the full Scopus list only when the checker needs it
  const [jr, tr] = await Promise.allSettled([R.load('journals'), R.load('jordan/journal_times')]);
  if (jr.status !== 'fulfilled') { R.fail(app, jr.reason); return; }
  J = jr.value; T = tr.status === 'fulfilled' ? (tr.value.journals || {}) : {};
  if (!J.cols.includes('fl')) { try { FL = await R.scopusFlags(); } catch (e) { FL = null; } }
  const loadFL = async () => { if (!FL) { try { FL = await R.scopusFlags(); } catch (e) { FL = null; } } return FL; };
  R.updated({ updated: J.updated });
  const K = Object.fromEntries(J.cols.map((c, i) => [c, i]));
  const esc = R.esc, UNI = J.universities, HOME = UNI.findIndex(u => u[0] === R.HOME_AFID);
  const rows = J.rows.map(r => {
    const jo = r[K.jo] || null;
    const cr = r[K.cats];
    const cats = Array.isArray(cr) ? cr.map(c => [J.catn[c[0]], c[1] ? 'Q' + c[1] : '']) : (cr || '').split('; ').filter(Boolean).map(x => x.split('|'));
    return { id: r[K.id], t: r[K.t], type: r[K.type], issn: r[K.issn], pub: J.publishers[r[K.pub]] || '', oa: r[K.oa], q: r[K.q], sjr: r[K.sjr], h: r[K.h], rank: r[K.rank],
      country: J.countries[r[K.country]] || '', cats, areas: (r[K.areas] || []).map(i => J.areas[i]), cpd2: +r[K.cpd2] || 0, cov: r[K.cov],
      jo: jo && { docs: jo[0], cpd: jo[1], y5: jo[2], unis: jo[3], kw: jo[4] }, tm: T[r[K.id]] || null,
      fl: K.fl !== undefined ? (r[K.fl] ? R.flagVerdict({ d: r[K.fl][0], p: r[K.fl][1], end: r[K.fl][2], s: r[K.fl][3] ? 'i' : 'a' }) : null) : FL ? FL.verdict(FL.F[r[K.id]] || null) : null,
      _s: R.norm([r[K.t], r[K.issn], cats.map(c => c[0]).join(' '), J.publishers[r[K.pub]]].join(' ')) };
  });
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const fmtIssn = s => s.split(' ').filter(Boolean).map(x => x.length === 8 ? x.slice(0, 4) + '-' + x.slice(4) : x);
  const TYPE = { j: 'مجلة', b: 'سلسلة كتب', c: 'مؤتمر', t: 'نشرة تجارية' };
  const st = { stat: 'ok', q: R.param('q'), area: R.param('area'), quart: R.param('quart'), oa: '', jo: R.param('jo') === '1', type: 'j', sort: 'sjr', page: 0, find: '' };

  const allJ = rows.filter(r => r.type === 'j');
  app.innerHTML = `
  <section class="rs-section rs-kpis">
    <div class="rs-kpi"><div class="v">${R.n(allJ.filter(r => !r.fl).length)}</div><div class="l"><i class="bi bi-journal-check"></i>مجلة نشطة في Scopus</div><div class="d">من ${R.n(allJ.length)} في SCImago ${J.sjr_year}</div></div>
    <div class="rs-kpi teal"><div class="v">${R.n(allJ.filter(r => r.q === 'Q1' && !r.fl).length)}</div><div class="l"><i class="bi bi-award"></i>مجلة في Q1</div><div class="d">${R.n(allJ.filter(r => r.oa && r.q === 'Q1' && !r.fl).length)} منها مفتوحة الوصول</div></div>
    <div class="rs-kpi navy"><div class="v">${R.n(allJ.filter(r => r.jo).length)}</div><div class="l"><i class="bi bi-people"></i>مجلة نشر فيها أردنيون</div><div class="d">${R.n(allJ.reduce((t, r) => t + (r.jo ? r.jo.docs : 0), 0))} بحثاً</div></div>
    <div class="rs-kpi" style="--c:#c0392b"><div class="v" style="color:#c0392b">${R.n(rows.filter(r => r.fl && r.fl[3]).length)}</div><div class="l"><i class="bi bi-x-octagon"></i>مجلة حذفها Scopus</div><div class="d">${R.n(rows.filter(r => r.fl && r.fl[3] && r.jo).reduce((t, r) => t + r.jo.docs, 0))} بحثاً أردنياً فيها</div></div>
    <div class="rs-kpi gold"><div class="v">${R.n(rows.filter(r => r.tm).length)}</div><div class="l"><i class="bi bi-hourglass-split"></i>مجلة بمدد قرار معروفة</div><div class="d">تتزايد أسبوعياً من Crossref</div></div>
  </section>
  <nav class="rs-tabs no-print" id="jn-tabs">
    <button data-t="browse"><i class="bi bi-grid-3x2-gap"></i> استعراض المجلات</button><button data-t="check"><i class="bi bi-shield-check"></i> تحقّق قبل الإرسال</button>
    <button data-t="suggest"><i class="bi bi-magic"></i> اقترح مجلة لبحثي</button><button data-t="insights"><i class="bi bi-graph-up"></i> تحليلات</button></nav>

  <section data-tab="browse" class="rs-section rs-card no-print"><h3><i class="bi bi-funnel"></i>البحث والتصفية</h3>
      <div class="rs-toolbar">
        <div class="fld grow"><label for="jn-q">الاسم أو ISSN أو الناشر أو التخصص</label><input id="jn-q" class="form-control" type="search" value="${esc(st.q)}" placeholder="مثال: IEEE Access أو 2169-3536 أو Nursing"></div>
        <div class="fld"><label for="jn-area">المجال</label><select id="jn-area" class="form-select"><option value="">الكل</option>${J.areas.slice().sort((a, b) => R.areaAr(a).localeCompare(R.areaAr(b), 'ar')).map(a => `<option value="${esc(a)}"${a === st.area ? ' selected' : ''}>${esc(R.areaAr(a))}</option>`).join('')}</select></div>
        <div class="fld"><label for="jn-quart">التصنيف</label><select id="jn-quart" class="form-select"><option value="">الكل</option><option value="Q1">Q1</option><option value="Q12">Q1 و Q2</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
        <div class="fld"><label for="jn-oa">الوصول</label><select id="jn-oa" class="form-select"><option value="">الكل</option><option value="1">مفتوح</option><option value="2">ماسي (مجاني للنشر والقراءة)</option><option value="0">اشتراك/هجين</option></select></div>
        <div class="fld"><label for="jn-type">النوع</label><select id="jn-type" class="form-select"><option value="j">مجلات</option><option value="">الكل</option><option value="c">مؤتمرات</option><option value="b">سلاسل كتب</option></select></div>
        <div class="fld"><label for="jn-stat">حالة Scopus</label><select id="jn-stat" class="form-select"><option value="">الكل</option><option value="ok" selected>نشطة فقط</option><option value="bad">حذفها Scopus</option><option value="warn">متوقفة / تغيّر وضعها</option></select></div>
        <div class="fld"><label for="jn-sort">ترتيب</label><select id="jn-sort" class="form-select"><option value="sjr">SJR (الأعلى)</option><option value="h">h-index</option><option value="jo">الأكثر نشراً للأردنيين</option><option value="jocpd">اقتباس الأبحاث الأردنية</option><option value="fast">الأسرع قبولاً</option><option value="pub">الأسرع نشراً بعد القبول</option></select></div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" id="jn-jo"${st.jo ? ' checked' : ''}> <span class="form-check-label">فقط مجلات نشر فيها باحثون أردنيون</span></label>
        <span class="text-muted small ms-2">اختيارات سريعة:</span>
        <button class="rs-chip" data-quick="q1oa"><i class="bi bi-unlock-fill"></i> Q1 مفتوحة الوصول</button><button class="rs-chip" data-quick="diamond"><i class="bi bi-gem"></i> ماسية (بلا رسوم)</button>
        <button class="rs-chip" data-quick="fast"><i class="bi bi-lightning-charge-fill"></i> الأسرع قبولاً</button><button class="rs-chip" data-quick="jo"><i class="bi bi-people-fill"></i> الأكثر نشراً للأردنيين</button><button class="rs-chip" data-quick="petra"><i class="bi bi-bank2"></i> مجلات البترا</button><button class="rs-chip reset" data-quick="reset"><i class="bi bi-x-circle"></i> مسح</button>
      </div></section>
  <section data-tab="check" class="rs-section rs-card"><h3><i class="bi bi-shield-exclamation"></i>تحقّق من مجلة قبل الإرسال</h3>
    <div class="rs-toolbar"><div class="fld grow"><label for="jn-check">اسم المجلة أو ISSN</label><input id="jn-check" class="form-control ltr" type="search" placeholder="e.g. Journal of Theoretical and Applied Information Technology  أو  1992-8645"></div></div>
    <div id="jn-verdict" class="mt-2"></div>
    <p class="rs-note mt-2 mb-0">المصدر: قائمة مصادر Scopus الرسمية (${J.flags_src || 'سبتمبر 2026'}) — المجلات التي حذفها Scopus (Discontinued) والمجلات التي لم تعد مفهرسة، مع تصنيف SCImago. الأبحاث المنشورة بعد تاريخ الحذف لا تظهر في Scopus ولا تُحسب للباحث أو للجامعة. <a href="integrity.html?tab=journals"><i class="bi bi-shield-exclamation"></i> المجلات المحذوفة التي نشر فيها باحثون أردنيون، والأبحاث المسحوبة</a></p></section>
  <section data-tab="suggest" class="rs-section rs-card no-print"><h3><i class="bi bi-magic"></i>اقترح مجلة لبحثي</h3>
      <div class="fld"><label for="jn-find">عنوان البحث أو كلماته المفتاحية (بالإنجليزية)</label><textarea id="jn-find" class="form-control ltr" rows="3" placeholder="e.g. deep learning intrusion detection for IoT networks"></textarea></div>
      <div class="d-flex gap-2 flex-wrap mt-2 align-items-center"><button class="btn btn-rs" id="jn-go"><i class="bi bi-stars"></i> اقترح</button>
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" id="jn-good" checked> <span class="form-check-label">Q1 و Q2 فقط</span></label>
        <small class="text-muted">يطابق كلماتك مع موضوعات الأبحاث الأردنية في كل مجلة ومع تخصصاتها في SCImago.</small> <a class="btn btn-sm btn-rs-o" href="publish.html"><i class="bi bi-signpost-split"></i> «أين أنشر؟» مع قيمة النشر في الترقية والمكافأة</a></div>
</section>
  <section data-tab="insights" class="rs-section">
    <nav class="rs-subtabs no-print" id="jn-itabs">
      <button data-i="q" class="on"><i class="bi bi-pie-chart-fill" style="color:#1d7a3e"></i> التصنيف (Q1–Q4)</button>
      <button data-i="top"><i class="bi bi-bar-chart-fill" style="color:#b8892b"></i> أكثر المجلات</button>
      <button data-i="pub"><i class="bi bi-building-fill" style="color:#2b5ea7"></i> الناشرون</button>
      <button data-i="oa"><i class="bi bi-unlock-fill" style="color:#1f8a8a"></i> الوصول المفتوح</button>
      <button data-i="ctry"><i class="bi bi-globe2" style="color:#7b3fbf"></i> دول المجلات</button>
      <button data-i="disc"><i class="bi bi-x-octagon-fill" style="color:#c0392b"></i> مجلات حذفها Scopus</button>
    </nav>
    <div class="rs-card rs-ins">
      <div class="rs-ins-head"><h3 id="jn-ititle"></h3><p class="rs-note mb-0" id="jn-inote"></p></div>
      <div class="rs-ins-stats" id="jn-istats"></div>
      <div class="rs-ins-legend" id="jn-ileg"></div>
      <div class="rs-chart" id="jn-ibox" style="height:520px"><canvas id="jn-ich"></canvas></div>
      <div class="rs-scroll" id="jn-itable"></div>
    </div>
  </section>

  <section data-tab="browse suggest" class="rs-section">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2 no-print"><div class="d-flex flex-wrap gap-3 align-items-center" id="jn-sum"></div>
      <div class="rs-seg ms-auto" id="jn-view"><button data-v="cards"><i class="bi bi-grid-3x2-gap"></i> بطاقات</button><button data-v="table"><i class="bi bi-table"></i> جدول</button><button data-v="compact"><i class="bi bi-list-ul"></i> مختصر</button></div></div>
    <div id="jn-out"></div>
    <div class="rs-pager" id="jn-pager"></div></section>
  <div class="modal fade" id="jn-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title ltr" id="jn-mt"></h5><button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button></div><div class="modal-body" id="jn-mb"></div></div></div></div>
  <p class="rs-note mt-3">المصادر: SCImago Journal Rank ${J.sjr_year} (مبني على بيانات Scopus) للتصنيف والترتيب والمجالات؛ تصدير Scopus لكل الجامعات الأردنية لاستخدام الأردنيين؛ تواريخ الاستلام والقبول والنشر من Crossref لعيّنة من أحدث الأبحاث الأردنية في كل مجلة (وسيط بالأيام، يُحدَّث أسبوعياً، ويختلف حسب نوع البحث والمراجعة). تحقّق دائماً من موقع المجلة قبل الإرسال.</p>`;
  R.$('#jn-quart').value = st.quart;

  const days = v => v == null ? '–' : `${R.n(v)} يوم`;
  const timeCell = t => t ? `<span title="من الاستلام إلى القبول (وسيط ${t.n} بحث)"><i class="bi bi-hourglass-split"></i> ${days(t.accept)}</span><br><small class="text-muted" title="من القبول إلى النشر الإلكتروني">نشر بعد ${days(t.publish)}</small>` : '<small class="text-muted">–</small>';
  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    let out = rows.filter(r => (!st.type || r.type === st.type) && (!st.area || r.areas.includes(st.area)) && (!st.jo || r.jo) &&
      (!st.quart || (st.quart === 'Q12' ? r.q === 'Q1' || r.q === 'Q2' : r.q === st.quart)) &&
      (st.oa === '' || (st.oa === '0' ? !r.oa : st.oa === '2' ? r.oa === 2 : r.oa)) &&
      (!st.stat || (st.stat === 'ok' ? !r.fl : r.fl && r.fl[2] === st.stat)) && (!st.petra || (r.jo && r.jo.unis.some(u => u[0] === HOME))) && (!q.length || q.every(t => r._s.includes(t))));
    const s = st.sort;
    const key = s === 'h' ? r => r.h : s === 'jo' ? r => r.jo ? r.jo.docs : -1 : s === 'jocpd' ? r => r.jo && r.jo.docs >= 5 ? r.jo.cpd : -1
      : s === 'fast' ? r => r.tm && r.tm.accept != null ? -r.tm.accept : -1e9 : s === 'pub' ? r => r.tm && r.tm.publish != null ? -r.tm.publish : -1e9 : r => r.sjr;
    return out.sort((a, b) => key(b) - key(a));
  }
  function suggest() {
    const words = R.norm(st.find).split(' ').filter(w => w.length > 2 && !/^(the|and|for|with|using|based|from|into|of|in|on|a|an|to|by|via|towards?)$/.test(w));
    if (!words.length) return null;
    const scored = [];
    for (const r of rows) {
      if (r.type !== 'j' || r.fl || (R.$('#jn-good').checked && !(r.q === 'Q1' || r.q === 'Q2'))) continue;
      const kw = R.norm((r.jo ? r.jo.kw.join(' ') : '') ), cats = R.norm(r.cats.map(c => c[0]).join(' '));
      let s = 0;
      for (const w of words) { if (kw.includes(w)) s += 3; if (cats.includes(w)) s += 2; if (R.norm(r.t).includes(w)) s += 1.5; }
      if (s > 0) scored.push([s + Math.log10(1 + (r.jo ? r.jo.docs : 0)) + r.sjr / 4, r]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map(x => x[1]);
  }
  let PER = 48;
  st.view = R.store.get('rs-jn-view', 'cards');
  function render(list, title) {
    const data = list || filtered();
    PER = st.view === 'table' ? 50 : st.view === 'compact' ? 100 : 48;
    const pages = Math.ceil(data.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    R.$('#jn-sum').innerHTML = title ? `<b>${esc(title)}</b> <button class="btn btn-sm btn-rs-o" id="jn-back">عودة للبحث</button>` : `<span><b class="fs-5">${R.n(data.length)}</b> نتيجة</span><span><b>${R.n(data.filter(r => r.q === 'Q1').length)}</b> في Q1</span><span><b>${R.n(data.filter(r => r.jo).length)}</b> نشر فيها أردنيون</span><span><b>${R.n(data.filter(r => r.tm).length)}</b> بمدد مراجعة معروفة</span>`;
    const part = data.slice(st.page * PER, st.page * PER + PER);
    R.$$('#jn-view button').forEach(x => x.classList.toggle('on', x.dataset.v === st.view));
    const issn0 = r => fmtIssn(r.issn)[0];
    const links = r => `<a class="rs-ib sj" href="${R.sjrUrl(r.id)}" target="_blank" rel="noopener" title="SCImago"><i class="bi bi-bar-chart-fill"></i></a><a class="rs-ib sc" href="${R.scopusSourceUrl(r.id)}" target="_blank" rel="noopener" title="Scopus"><i class="bi bi-graph-up-arrow"></i></a>${issn0(r) ? `<a class="rs-ib web" href="https://portal.issn.org/resource/ISSN/${issn0(r)}" target="_blank" rel="noopener" title="الموقع الرسمي عبر بوابة ISSN"><i class="bi bi-globe2"></i></a>` : ''}<a class="rs-ib info" href="#" data-j="${r.id}" title="التفاصيل"><i class="bi bi-info-lg"></i></a>`;
    const tags = r => `${r.fl ? `<span class="rs-tag ${r.fl[2]}" title="${esc(r.fl[1])}"><i class="bi bi-exclamation-octagon-fill"></i> ${esc(r.fl[0])}</span>` : ''}${r.oa ? `<span class="rs-tag oa"><i class="bi bi-unlock-fill"></i> ${r.oa === 2 ? 'ماسي (بلا رسوم)' : 'وصول مفتوح'}</span>` : ''}${r.type !== 'j' ? `<span class="rs-tag">${TYPE[r.type] || ''}</span>` : ''}`;
    const petra = r => HOME >= 0 && r.jo && r.jo.unis.find(u => u[0] === HOME);
    const qp = q => `<span class="rs-qpill q-${(q || 'n').toLowerCase()}">${q || '—'}</span>`;
    const maxS = Math.max(1, ...part.map(r => r.sjr || 0));
    const days = r => r.tm && r.tm.accept != null ? r.tm.accept : null;
    const out = R.$('#jn-out');
    if (!part.length) out.innerHTML = '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد نتائج</div>';
    else if (st.view === 'table') out.innerHTML = `<div class="rs-scroll rs-jtwrap"><table class="rs-jt2"><thead><tr>
        <th class="c">#</th><th><i class="bi bi-journal-bookmark-fill ic-m"></i> المجلة</th><th class="c"><i class="bi bi-award-fill ic-g"></i> التصنيف</th><th><i class="bi bi-star-fill ic-y"></i> SJR</th><th class="c"><i class="bi bi-graph-up ic-t"></i> h-index</th>
        <th><i class="bi bi-tags-fill ic-p"></i> التخصصات</th><th class="c"><i class="bi bi-hourglass-split ic-b"></i> مدة القرار</th><th class="c"><i class="bi bi-people-fill ic-o"></i> أبحاث أردنية</th><th class="c"><i class="bi bi-link-45deg"></i> روابط</th></tr></thead><tbody>
      ${part.map((r, i) => `<tr class="${r.fl ? 'flagged' : ''}"><td class="c n">${st.page * PER + i + 1}</td>
        <td class="jt"><a href="#" data-j="${r.id}" class="ltr">${esc(r.t)}</a><div class="ltr sub"><i class="bi bi-building"></i> ${esc(r.pub)} <span class="dot">·</span> <i class="bi bi-geo-alt"></i> ${esc(r.country)}${issn0(r) ? ` <span class="dot">·</span> <span class="mono">${fmtIssn(r.issn).join(', ')}</span>` : ''}</div>${tags(r) ? `<div class="tg">${tags(r)}</div>` : ''}</td>
        <td class="c">${qp(r.q)}<div class="sub">#${R.n(r.rank)} عالمياً</div></td>
        <td><div class="sjc"><b>${r.sjr ? r.sjr.toFixed(2) : '–'}</b><span class="bar"><i style="width:${(100 * (r.sjr || 0) / maxS).toFixed(0)}%"></i></span></div></td>
        <td class="c"><b class="big">${R.n(r.h)}</b></td>
        <td class="ltr"><div class="cts">${r.cats.slice(0, 3).map(c => `<span class="ct q-${(c[1] || 'n').toLowerCase()}">${esc(c[0])}${c[1] ? ` <b>${c[1]}</b>` : ''}</span>`).join('')}${r.cats.length > 3 ? `<span class="ct more">+${r.cats.length - 3}</span>` : ''}</div></td>
        <td class="c">${days(r) != null ? `<span class="rs-days ${days(r) <= 60 ? 'fast' : days(r) <= 150 ? 'mid' : 'slow'}"><i class="bi bi-clock-fill"></i> ${days(r)} يوماً</span>` : '<span class="na">غير متوفر</span>'}</td>
        <td class="c">${r.jo ? `<b class="big">${R.n(r.jo.docs)}</b><div class="sub">${r.jo.cpd} اقتباس/بحث</div>${petra(r) ? `<span class="rs-petra"><i class="bi bi-bank2"></i> البترا ${petra(r)[1]}</span>` : ''}` : '<span class="na">—</span>'}</td>
        <td class="c"><div class="lk">${links(r)}</div></td></tr>`).join('')}</tbody></table></div>`;
    else if (st.view === 'compact') out.innerHTML = `<ol class="rs-compact-list" start="${st.page * PER + 1}">${part.map(r => `<li>${qp(r.q)} <a href="#" data-j="${r.id}" class="ltr">${esc(r.t)}</a> <small class="text-muted">SJR ${r.sjr ? r.sjr.toFixed(2) : '–'} · ${esc(r.pub)}${r.jo ? ` · ${R.n(r.jo.docs)} بحثاً أردنياً` : ''}</small> ${tags(r)}</li>`).join('')}</ol>`;
    else out.innerHTML = `<div class="rs-jgrid">${part.map(r => `<article class="rs-jcard q-${(r.q || 'n').toLowerCase()}${r.fl ? ' flagged' : ''}">
        <div class="top"><span class="qbig"><small>أفضل</small>${r.q || '—'}</span><div class="meta"><a href="#" data-j="${r.id}" class="t">${esc(r.t)}</a><div class="sub"><i class="bi bi-building"></i> ${esc(r.pub)} · <i class="bi bi-geo-alt-fill"></i> ${esc(r.country)}</div></div></div>
        ${tags(r) ? `<div class="tags">${tags(r)}</div>` : ''}
        <div class="mt">
          <div class="m y"><i class="bi bi-star-fill"></i><b>${r.sjr ? r.sjr.toFixed(2) : '–'}</b><span>SJR</span></div>
          <div class="m t"><i class="bi bi-graph-up-arrow"></i><b>${R.n(r.h)}</b><span>h-index</span></div>
          <div class="m p"><i class="bi bi-trophy-fill"></i><b>#${R.n(r.rank)}</b><span>الترتيب عالمياً</span></div>
          <div class="m b"><i class="bi bi-hourglass-split"></i><b>${days(r) != null ? days(r) : '–'}</b><span>يوماً للقبول</span></div>
        </div>
        <div class="cts">${r.cats.slice(0, 3).map(c => `<span class="ct q-${(c[1] || 'n').toLowerCase()}">${esc(c[0])}${c[1] ? ` <b>${c[1]}</b>` : ''}</span>`).join('')}</div>
        <div class="foot"><span class="jo">${r.jo ? `<i class="bi bi-people-fill"></i> <b>${R.n(r.jo.docs)}</b> بحثاً أردنياً${petra(r) ? ` <span class="rs-petra"><i class="bi bi-bank2"></i> البترا ${petra(r)[1]}</span>` : ''}` : '<span class="na"><i class="bi bi-people"></i> لا أبحاث أردنية</span>'}</span><span class="lk">${links(r)}</span></div>
      </article>`).join('')}</div>`;
    const pg = []; for (let i = 0; i < pages; i++) if (i < 2 || i >= pages - 2 || Math.abs(i - st.page) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
    R.$('#jn-pager').innerHTML = pages > 1 ? pg.map(i => i === '…' ? '<span class="px-1">…</span>' : `<button class="btn btn-sm ${i === st.page ? 'btn-rs' : 'btn-rs-o'}" data-p="${i}">${i + 1}</button>`).join('') : '';
    const b = R.$('#jn-back'); if (b) b.onclick = () => { R.$('#jn-find').value = ''; st.find = ''; render(); };
    window.__last = [list, title];
  }
  function detail(id) {
    const r = byId[id]; if (!r) return;
    R.$('#jn-mt').textContent = r.t;
    const t = r.tm;
    R.$('#jn-mb').innerHTML = (r.fl ? `<div class="rs-alert-${r.fl[2]} mb-3"><b><i class="bi bi-exclamation-octagon"></i> ${esc(r.fl[0])}</b><br>${esc(r.fl[1])}. لا يُنصح بالإرسال إليها إن كان الهدف النشر في Scopus.</div>` : '') + `
      <div class="rs-kpis mb-3">
        <div class="rs-kpi"><div class="v">${r.q || '–'}</div><div class="l">أفضل تصنيف (SJR ${J.sjr_year})</div><div class="d">الترتيب العالمي #${R.n(r.rank)}</div></div>
        <div class="rs-kpi teal"><div class="v">${r.sjr ? r.sjr.toFixed(2) : '–'}</div><div class="l">SJR</div><div class="d">h-index ${R.n(r.h)} · ${r.cpd2 ? r.cpd2.toFixed(2) + ' اقتباس/بحث (سنتان)' : ''}</div></div>
        <div class="rs-kpi gold"><div class="v">${t && t.accept != null ? R.n(t.accept) : '–'}</div><div class="l">يوماً من الاستلام إلى القبول</div><div class="d">${t ? `ثم ${days(t.publish)} للنشر · الإجمالي ${days(t.total)} · عيّنة ${t.n}` : 'لا توجد تواريخ كافية بعد'}</div></div>
        <div class="rs-kpi navy"><div class="v">${r.jo ? R.n(r.jo.docs) : 0}</div><div class="l">بحثاً لباحثين أردنيين</div><div class="d">${r.jo ? `${r.jo.y5} في آخر 5 سنوات · ${r.jo.cpd} اقتباس/بحث` : ''}</div></div>
      </div>
      <table class="rs-table rs-kv"><tbody>
        <tr><th>الناشر</th><td class="ltr">${esc(r.pub)} · ${esc(r.country)}</td></tr>
        <tr><th>ISSN</th><td class="ltr">${fmtIssn(r.issn).join(' · ')}</td></tr>
        <tr><th>الوصول</th><td>${r.oa ? (r.oa === 2 ? 'وصول مفتوح ماسي (لا رسوم نشر)' : 'وصول مفتوح (قد توجد رسوم APC)') : 'اشتراك أو هجين'}</td></tr>
        <tr><th>التغطية في Scopus</th><td class="ltr">${esc(r.cov)}</td></tr>
        <tr><th>المجالات</th><td>${r.areas.map(a => `<span class="rs-chip">${esc(R.areaAr(a))}</span>`).join(' ')}</td></tr>
        <tr><th>التخصصات وتصنيفها</th><td class="ltr">${r.cats.map(c => `<div>${esc(c[0])} ${R.qTag(c[1])}</div>`).join('')}</td></tr>
        ${r.jo ? `<tr><th>الجامعات الأردنية الأكثر نشراً فيها</th><td>${r.jo.unis.map(([i, n]) => `<span class="rs-chip${i === HOME ? ' fw-bold' : ''}">${esc((UNI[i] || [])[1] || '')} <small class="text-muted">${n}</small></span>`).join(' ')}</td></tr>
        <tr><th>موضوعات الأبحاث الأردنية فيها</th><td class="ltr">${r.jo.kw.map(k => `<a class="rs-chip soft" href="experts.html?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join(' ')}</td></tr>` : ''}
      </tbody></table>
      <div class="rs-links mt-3">
        <a class="rs-link lg" href="${R.sjrUrl(r.id)}" target="_blank" rel="noopener"><i class="bi bi-bar-chart"></i>صفحتها في SCImago</a>
        <a class="rs-link lg" href="${R.scopusSourceUrl(r.id)}" target="_blank" rel="noopener"><i class="bi bi-bar-chart-line" style="color:#e9711c"></i>صفحتها في Scopus</a>
        ${fmtIssn(r.issn)[0] ? `<a class="rs-link lg" href="https://portal.issn.org/resource/ISSN/${fmtIssn(r.issn)[0]}" target="_blank" rel="noopener"><i class="bi bi-house"></i>الموقع الرسمي (بوابة ISSN)</a>` : ''}
        <a class="rs-link lg" href="https://www.google.com/search?q=${encodeURIComponent('"' + r.t + '" journal submission guidelines')}" target="_blank" rel="noopener"><i class="bi bi-google"></i>دليل المؤلفين</a>
        <a class="rs-link lg" href="https://www.scopus.com/results/results.uri?src=s&sot=a&s=${encodeURIComponent('SRCID(' + r.id + ') AND AFFILCOUNTRY(jordan)')}" target="_blank" rel="noopener"><i class="bi bi-list-ul"></i>الأبحاث الأردنية فيها (Scopus)</a>
      </div>
      <p class="rs-note mt-2">مدد القرار والنشر وسيط من تواريخ Crossref لأحدث الأبحاث الأردنية في المجلة؛ ليست أرقاماً رسمية من المجلة.</p>`;
    bootstrap.Modal.getOrCreateInstance(R.$('#jn-modal')).show();
  }

  // the pre-submission check: SCImago list + every title Scopus has dropped (also titles not in SCImago)
  function check(qs) {
    const q = R.norm(qs), issn = qs.replace(/[^0-9xX]/g, '').toUpperCase();
    const box = R.$('#jn-verdict');
    if (q.length < 3 && issn.length < 8) { box.innerHTML = ''; return; }
    if (!FL && !check.waiting) { check.waiting = 1; loadFL().then(f => { if (f) check(qs); }); }
    let hits = rows.filter(r => (issn.length === 8 && r.issn.includes(issn)) || (q.length >= 3 && R.norm(r.t).includes(q)));
    const extra = FL ? Object.values(FL.F).filter(f => !byId[f.id] && ((issn.length === 8 && (f.issn || []).includes(issn)) || (q.length >= 3 && R.norm(f.t).includes(q)))) : [];
    hits = hits.sort((a, b) => (R.norm(a.t) === q ? -1 : 0) - (R.norm(b.t) === q ? -1 : 0) || b.sjr - a.sjr).slice(0, 6);
    const items = hits.map(r => r.fl
      ? `<div class="rs-alert-${r.fl[2]} mb-2"><b class="ltr d-block"><a href="#" data-j="${r.id}">${esc(r.t)}</a></b><i class="bi bi-x-octagon-fill"></i> <b>${esc(r.fl[0])}</b> — ${esc(r.fl[1])}.</div>`
      : `<div class="rs-alert-ok mb-2"><b class="ltr d-block"><a href="#" data-j="${r.id}">${esc(r.t)}</a></b><i class="bi bi-check-circle-fill"></i> <b>نشطة في Scopus</b> · ${r.q ? 'التصنيف ' + r.q : 'بلا تصنيف SJR'} · SJR ${r.sjr ? r.sjr.toFixed(2) : '–'}${r.tm && r.tm.accept != null ? ` · القبول خلال ~${r.tm.accept} يوماً` : ''}${r.jo ? ` · ${R.n(r.jo.docs)} بحثاً أردنياً` : ''}</div>`)
      .concat(extra.slice(0, 6 - hits.length).map(f => { const v = FL.verdict(f); return `<div class="rs-alert-${v ? v[2] : 'warn'} mb-2"><b class="ltr d-block">${esc(f.t)}</b><i class="bi bi-x-octagon-fill"></i> <b>${esc(v ? v[0] : 'غير نشطة')}</b> — ${esc(v ? v[1] : '')}.</div>`; }));
    box.innerHTML = items.join('') || `<div class="rs-alert-warn"><i class="bi bi-question-circle-fill"></i> <b>غير موجودة في Scopus</b> — لم نجد هذه المجلة في قائمة Scopus ولا في SCImago. تحقّق من ISSN؛ إن لم تكن مفهرسة فالنشر فيها لا يُحسب في Scopus.</div>`;
  }
  R.$('#jn-check').addEventListener('input', R.debounce(e => check(e.target.value), 300));
  R.$('#jn-verdict').addEventListener('click', e => { const a = e.target.closest('[data-j]'); if (a) { e.preventDefault(); detail(a.dataset.j); } });
  R.$('#jn-stat').addEventListener('change', e => { st.stat = e.target.value; st.page = 0; render(); });

  // tabs, views, quick filters, insights
  st.tab = R.param('tab') || 'browse';
  function showTab(t) {
    st.tab = t;
    R.$$('#jn-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = !el.dataset.tab.split(' ').includes(t); });
    if (t === 'insights') insights();
    if (t === 'check') loadFL();
    const u = new URL(location); u.searchParams.set('tab', t); history.replaceState(null, '', u);
  }
  R.onPrint(() => { if (!insDone) insights(); });   // every tab prints, so the insights charts are drawn first
  R.$('#jn-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); });
  R.$('#jn-view').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; R.store.set('rs-jn-view', st.view); st.page = 0; render(...(window.__last || [])); });
  app.addEventListener('click', e => { const b = e.target.closest('[data-quick]'); if (!b) return;
    const set = (k, v, id) => { st[k] = v; const el = R.$(id); if (el) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } };
    set('quart', '', '#jn-quart'); set('oa', '', '#jn-oa'); set('jo', false, '#jn-jo'); set('sort', 'sjr', '#jn-sort'); set('stat', 'ok', '#jn-stat'); st.petra = false;
    const k = b.dataset.quick;
    if (k === 'q1oa') { set('quart', 'Q1', '#jn-quart'); set('oa', '1', '#jn-oa'); }
    if (k === 'diamond') set('oa', '2', '#jn-oa');
    if (k === 'fast') set('sort', 'fast', '#jn-sort');
    if (k === 'jo') { set('jo', true, '#jn-jo'); set('sort', 'jo', '#jn-sort'); }
    if (k === 'petra') { st.petra = true; set('sort', 'jo', '#jn-sort'); }
    R.$$('[data-quick]', app).forEach(x => { const on = x === b && k !== 'reset'; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    st.page = 0; render(); });
  // manual filter changes clear the highlighted quick option
  app.addEventListener('change', e => { if (e.target.closest('.rs-filters, #jn-jo, select, input')) R.$$('[data-quick]', app).forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', false); }); });
  let insDone = false;
  let insTab = 'q';
  const QC = { Q1: '#1d7a3e', Q2: '#1f6f78', Q3: '#b8892b', Q4: '#c75b12', '': '#9aa3a7' };
  const qLegend = (extra) => Object.entries({ Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', '': 'بلا تصنيف' }).map(([k, l]) => `<span><i style="background:${QC[k]}"></i>${l}</span>`).join('') + (extra || '');
  const stat = (ic, col, v, l) => `<div class="st" style="--sc:${col}"><i class="bi ${ic}"></i><div><b>${v}</b><span>${l}</span></div></div>`;
  function insights() {
    insDone = true;
    const used = rows.filter(r => r.jo), totDocs = used.reduce((t, r) => t + r.jo.docs, 0);
    R.$$('#jn-itabs button').forEach(b => b.classList.toggle('on', b.dataset.i === insTab));
    const T = (t, n) => { R.$('#jn-ititle').innerHTML = t; R.$('#jn-inote').innerHTML = n || ''; };
    const box = R.$('#jn-ibox'), tbl = R.$('#jn-itable'), leg = R.$('#jn-ileg'), sts = R.$('#jn-istats');
    box.hidden = false; tbl.innerHTML = ''; leg.innerHTML = ''; sts.innerHTML = '';
    const lbl = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
    if (insTab === 'q') {
      const qd = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, '': 0 }, qj = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, '': 0 };
      used.forEach(r => { qd[r.q || ''] += r.jo.docs; qj[r.q || '']++; });
      T('<i class="bi bi-pie-chart-fill" style="color:#1d7a3e"></i> في أي تصنيف ينشر الباحثون الأردنيون؟', `${R.n(totDocs)} بحثاً أردنياً في ${R.n(used.length)} مجلة · الربع الأفضل للمجلة في SCImago ${J.sjr_year}`);
      sts.innerHTML = ['Q1', 'Q2', 'Q3', 'Q4', ''].map(k => stat('bi-award-fill', QC[k], `${(100 * qd[k] / (totDocs || 1)).toFixed(1)}%`, `${k || 'بلا تصنيف'} · ${R.n(qd[k])} بحثاً · ${R.n(qj[k])} مجلة`)).join('');
      box.style.height = '460px';
      R.chart('jn-ich', { type: 'doughnut', data: { labels: ['Q1', 'Q2', 'Q3', 'Q4', 'بلا تصنيف'], datasets: [{ data: ['Q1', 'Q2', 'Q3', 'Q4', ''].map(k => qd[k]), backgroundColor: ['Q1', 'Q2', 'Q3', 'Q4', ''].map(k => QC[k]), borderWidth: 3, borderColor: '#fff' }] }, options: { cutout: '52%', plugins: { legend: { position: 'right', labels: { font: { size: 15 }, padding: 16 } } } } });
    } else if (insTab === 'top') {
      const top = used.slice().sort((a, b) => b.jo.docs - a.jo.docs).slice(0, 25);
      T('<i class="bi bi-bar-chart-fill" style="color:#b8892b"></i> أكثر 25 مجلة نشراً للباحثين الأردنيين', 'لون الشريط = تصنيف المجلة؛ الأحمر = مجلة حذفها Scopus. اضغط على شريط لفتح تفاصيل المجلة.');
      leg.innerHTML = qLegend('<span><i style="background:#c0392b"></i>حذفها Scopus</span>');
      box.style.height = (top.length * 30 + 60) + 'px';
      R.chart('jn-ich', { type: 'bar', data: { labels: top.map(r => `${lbl(r.t, 52)}  (${r.q || '–'})`), datasets: [{ label: 'أبحاث أردنية', data: top.map(r => r.jo.docs), backgroundColor: top.map(r => r.fl && r.fl[3] ? '#c0392b' : QC[r.q || '']), borderRadius: 4, barPercentage: .82 }] },
        options: { indexAxis: 'y', onClick: (e, el) => { if (el[0]) detail(top[el[0].index].id); }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => top[c[0].dataIndex].t, label: c => { const r = top[c.dataIndex]; return [`أبحاث أردنية: ${R.n(r.jo.docs)}`, `SJR ${r.sjr ? r.sjr.toFixed(2) : '–'} · ${r.q || 'بلا تصنيف'}`, `${r.jo.cpd} اقتباس/بحث`]; } } } }, scales: { x: { title: { display: true, text: 'عدد الأبحاث الأردنية', font: { size: 13, weight: '700' } } }, y: { ticks: { autoSkip: false, font: { size: 13 } } } } } });
    } else if (insTab === 'pub') {
      const P = {}; used.forEach(r => { const p = P[r.pub] = P[r.pub] || { d: 0, j: 0, q1: 0 }; p.d += r.jo.docs; p.j++; if (r.q === 'Q1') p.q1 += r.jo.docs; });
      const tp = Object.entries(P).sort((a, b) => b[1].d - a[1].d).slice(0, 20);
      T('<i class="bi bi-building-fill" style="color:#2b5ea7"></i> أكثر 20 ناشراً للأبحاث الأردنية', 'الجزء الأخضر = الأبحاث في مجلات Q1 لدى الناشر، والأزرق = بقية الأبحاث.');
      leg.innerHTML = '<span><i style="background:#1d7a3e"></i>في مجلات Q1</span><span><i style="background:#2b5ea7"></i>تصنيفات أخرى</span>';
      box.style.height = (tp.length * 30 + 70) + 'px';
      R.chart('jn-ich', { type: 'bar', data: { labels: tp.map(([n, p]) => `${lbl(n, 44)}  · ${p.j} مجلة`), datasets: [{ label: 'في مجلات Q1', data: tp.map(x => x[1].q1), backgroundColor: '#1d7a3e' }, { label: 'تصنيفات أخرى', data: tp.map(x => x[1].d - x[1].q1), backgroundColor: '#2b5ea7', borderRadius: 4 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { footer: c => `المجموع: ${R.n(tp[c[0].dataIndex][1].d)}` } } }, scales: { x: { stacked: true, title: { display: true, text: 'عدد الأبحاث الأردنية', font: { size: 13, weight: '700' } } }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 13 } } } } } });
      tbl.innerHTML = `<table class="rs-jt2 mt-3"><thead><tr><th>#</th><th>الناشر</th><th class="c">أبحاث أردنية</th><th class="c">مجلات</th><th class="c">نسبة Q1</th></tr></thead><tbody>${tp.map(([n, p], i) => `<tr><td class="c n">${i + 1}</td><td class="ltr"><b>${esc(n)}</b></td><td class="c"><b class="big">${R.n(p.d)}</b></td><td class="c">${p.j}</td><td class="c">${(100 * p.q1 / p.d).toFixed(0)}%</td></tr>`).join('')}</tbody></table>`;
    } else if (insTab === 'oa') {
      const g = { 0: [0, 0], 1: [0, 0], 2: [0, 0] }; used.forEach(r => { const k = r.oa || 0; g[k][0] += r.jo.docs; g[k][1]++; });
      const L = ['اشتراك / هجين', 'وصول مفتوح (برسوم غالباً)', 'ماسي (بلا رسوم)'], C = ['#6b7a80', '#1f8a8a', '#7b3fbf'];
      T('<i class="bi bi-unlock-fill" style="color:#1f8a8a"></i> أين ينشر الأردنيون: وصول مفتوح أم اشتراك؟', 'حسب تصنيف SCImago / DOAJ للمجلة.');
      sts.innerHTML = [0, 1, 2].map(k => stat(['bi-lock-fill', 'bi-unlock-fill', 'bi-gem'][k], C[k], `${(100 * g[k][0] / (totDocs || 1)).toFixed(1)}%`, `${L[k]} · ${R.n(g[k][0])} بحثاً · ${R.n(g[k][1])} مجلة`)).join('');
      box.style.height = '440px';
      R.chart('jn-ich', { type: 'doughnut', data: { labels: L, datasets: [{ data: [0, 1, 2].map(k => g[k][0]), backgroundColor: C, borderWidth: 3, borderColor: '#fff' }] }, options: { cutout: '52%', plugins: { legend: { position: 'right', labels: { font: { size: 15 }, padding: 16 } } } } });
    } else if (insTab === 'ctry') {
      const Cn = {}; used.forEach(r => { const c = Cn[r.country || '—'] = Cn[r.country || '—'] || [0, 0]; c[0] += r.jo.docs; c[1]++; });
      const tc = Object.entries(Cn).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15);
      T('<i class="bi bi-globe2" style="color:#7b3fbf"></i> دول المجلات التي ينشر فيها الأردنيون', 'دولة الناشر كما في SCImago.');
      box.style.height = (tc.length * 32 + 60) + 'px';
      R.chart('jn-ich', { type: 'bar', data: { labels: tc.map(([n, c]) => `${n}  · ${c[1]} مجلة`), datasets: [{ label: 'أبحاث أردنية', data: tc.map(x => x[1][0]), backgroundColor: tc.map(([n]) => n === 'Jordan' ? '#901d23' : '#7b3fbf'), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false, font: { size: 13 } } } } } });
    } else if (insTab === 'disc') {
      const disc = used.filter(r => r.fl && r.fl[3]).sort((a, b) => b.jo.docs - a.jo.docs);
      const top = disc.slice(0, 15), dd = disc.reduce((t, r) => t + r.jo.docs, 0);
      T('<i class="bi bi-x-octagon-fill" style="color:#c0392b"></i> مجلات حذفها Scopus ونشر فيها أردنيون', 'الأبحاث المنشورة قبل سنة الحذف تبقى مفهرسة؛ ما يُنشر بعدها لا يُفهرس.');
      sts.innerHTML = stat('bi-x-octagon-fill', '#c0392b', R.n(disc.length), 'مجلة محذوفة') + stat('bi-file-earmark-x-fill', '#c75b12', R.n(dd), 'بحثاً أردنياً فيها') + stat('bi-bank2', '#901d23', R.n(disc.reduce((t, r) => t + ((r.jo.unis.find(u => u[0] === HOME) || [0, 0])[1] || 0), 0)), 'منها للبترا');
      box.style.height = (top.length * 30 + 50) + 'px';
      R.chart('jn-ich', { type: 'bar', data: { labels: top.map(r => `${lbl(r.t, 50)}  (حتى ${r.fl[4] || '?'})`), datasets: [{ label: 'أبحاث أردنية', data: top.map(r => r.jo.docs), backgroundColor: '#c0392b', borderRadius: 4 }] }, options: { indexAxis: 'y', onClick: (e, el) => { if (el[0]) detail(top[el[0].index].id); }, plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false, font: { size: 13 } } } } } });
      tbl.innerHTML = `<table class="rs-jt2 mt-3"><thead><tr><th>#</th><th>المجلة</th><th>السبب</th><th class="c">أبحاث أردنية</th><th class="c">البترا</th></tr></thead><tbody>${disc.slice(0, 40).map((r, i) => `<tr class="flagged"><td class="c n">${i + 1}</td><td class="jt"><a href="#" data-j="${r.id}" class="ltr">${esc(r.t)}</a></td><td><small>${esc(r.fl[1])}</small></td><td class="c"><b class="big">${R.n(r.jo.docs)}</b></td><td class="c">${(r.jo.unis.find(u => u[0] === HOME) || [0, 0])[1] || '–'}</td></tr>`).join('')}</tbody></table>`;
    }
  }
  R.$('#jn-itabs').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; insTab = b.dataset.i; insights(); });

  R.$('#jn-itable').addEventListener('click', e => { const a = e.target.closest('[data-j]'); if (a) { e.preventDefault(); detail(a.dataset.j); } });

  showTab(st.tab);
  render();
  if (R.param('id')) setTimeout(() => detail(R.param('id')), 300);
  const on = (id, k, ev) => R.$(id).addEventListener(ev || 'change', e => { st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; st.page = 0; render(); });
  R.$('#jn-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; st.page = 0; render(); }, 250));
  on('#jn-area', 'area'); on('#jn-quart', 'quart'); on('#jn-oa', 'oa'); on('#jn-type', 'type'); on('#jn-sort', 'sort'); on('#jn-jo', 'jo');
  R.$('#jn-go').onclick = () => { st.find = R.$('#jn-find').value; const s = suggest(); st.page = 0; if (s) render(s, `مجلات مقترحة لـ: «${st.find.slice(0, 80)}»`); };
  R.$('#jn-out').addEventListener('click', e => { const a = e.target.closest('[data-j]'); if (a) { e.preventDefault(); detail(a.dataset.j); } });
  R.$('#jn-pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { st.page = +b.dataset.p; render(...(window.__last || [])); R.$('#jn-sum').scrollIntoView({ behavior: 'smooth' }); } });
})();
