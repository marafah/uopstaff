/* journals.html: every Scopus journal (SCImago SJR) with quartiles, ranking, links, how fast it decides and publishes
   (medians from Crossref dates of recent papers), and how Jordanian researchers use it; plus a journal finder for a paper */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let J, T = {};
  try { J = await R.load('journals'); } catch (e) { R.fail(app, e); return; }
  try { T = (await R.load('jordan/journal_times')).journals || {}; } catch (e) { T = {}; }
  let FL = null;
  try { FL = await R.scopusFlags(); } catch (e) { FL = null; }
  R.updated({ updated: J.updated });
  const K = Object.fromEntries(J.cols.map((c, i) => [c, i]));
  const esc = R.esc, UNI = J.universities, HOME = UNI.findIndex(u => u[0] === R.HOME_AFID);
  const rows = J.rows.map(r => {
    const jo = r[K.jo] || null;
    const cats = (r[K.cats] || '').split('; ').filter(Boolean).map(x => x.split('|'));
    return { id: r[K.id], t: r[K.t], type: r[K.type], issn: r[K.issn], pub: J.publishers[r[K.pub]] || '', oa: r[K.oa], q: r[K.q], sjr: r[K.sjr], h: r[K.h], rank: r[K.rank],
      country: J.countries[r[K.country]] || '', cats, areas: (r[K.areas] || []).map(i => J.areas[i]), cpd2: +r[K.cpd2] || 0, cov: r[K.cov],
      jo: jo && { docs: jo[0], cpd: jo[1], y5: jo[2], unis: jo[3], kw: jo[4] }, tm: T[r[K.id]] || null,
      fl: FL ? FL.verdict(FL.F[r[K.id]] || null) : null,
      _s: R.norm([r[K.t], r[K.issn], (r[K.cats] || ''), J.publishers[r[K.pub]]].join(' ')) };
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
      <label class="form-check mt-2"><input class="form-check-input" type="checkbox" id="jn-jo"${st.jo ? ' checked' : ''}> <span class="form-check-label">فقط المجلات التي نشر فيها باحثون أردنيون</span></label>
      <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" id="jn-jo"${st.jo ? ' checked' : ''}> <span class="form-check-label">نشر فيها أردنيون</span></label>
        <span class="text-muted small ms-2">اختيارات سريعة:</span>
        <button class="rs-chip" data-quick="q1oa">Q1 مفتوحة الوصول</button><button class="rs-chip" data-quick="diamond">ماسية (بلا رسوم)</button>
        <button class="rs-chip" data-quick="fast">الأسرع قبولاً</button><button class="rs-chip" data-quick="jo">الأكثر نشراً للأردنيين</button><button class="rs-chip" data-quick="petra">مجلات البترا</button><button class="rs-chip" data-quick="reset">مسح</button>
      </div></section>
  <section data-tab="check" class="rs-section rs-card"><h3><i class="bi bi-shield-exclamation"></i>تحقّق من مجلة قبل الإرسال</h3>
    <div class="rs-toolbar"><div class="fld grow"><label for="jn-check">اسم المجلة أو ISSN</label><input id="jn-check" class="form-control ltr" type="search" placeholder="e.g. Journal of Theoretical and Applied Information Technology  أو  1992-8645"></div></div>
    <div id="jn-verdict" class="mt-2"></div>
    <p class="rs-note mt-2 mb-0">المصدر: قائمة مصادر Scopus الرسمية (${FL ? 'سبتمبر 2026' : 'غير محمّلة'}) — المجلات التي حذفها Scopus (Discontinued) والمجلات التي لم تعد مفهرسة، مع تصنيف SCImago. الأبحاث المنشورة بعد تاريخ الحذف لا تظهر في Scopus ولا تُحسب للباحث أو للجامعة.</p></section>
  <section data-tab="suggest" class="rs-section rs-card no-print"><h3><i class="bi bi-magic"></i>اقترح مجلة لبحثي</h3>
      <div class="fld"><label for="jn-find">عنوان البحث أو كلماته المفتاحية (بالإنجليزية)</label><textarea id="jn-find" class="form-control ltr" rows="3" placeholder="e.g. deep learning intrusion detection for IoT networks"></textarea></div>
      <div class="d-flex gap-2 flex-wrap mt-2 align-items-center"><button class="btn btn-rs" id="jn-go"><i class="bi bi-stars"></i> اقترح</button>
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" id="jn-good" checked> <span class="form-check-label">Q1 و Q2 فقط</span></label>
        <small class="text-muted">يطابق كلماتك مع موضوعات الأبحاث الأردنية في كل مجلة ومع تخصصاتها في SCImago.</small></div>
</section>
  <section data-tab="insights" class="rs-section rs-grid two">
    <div class="rs-card"><h3><i class="bi bi-pie-chart"></i>تصنيف المجلات التي ينشر فيها الأردنيون <small class="fw-normal text-muted">حسب عدد الأبحاث</small></h3><div class="rs-chart"><canvas id="jn-ch-q"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-bar-chart"></i>أكثر المجلات نشراً للأردنيين</h3><div class="rs-chart tall"><canvas id="jn-ch-top"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-building"></i>أكثر الناشرين</h3><div class="rs-chart tall"><canvas id="jn-ch-pub"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-x-octagon"></i>مجلات حذفها Scopus نشر فيها أردنيون كثيراً</h3><div class="rs-scroll" style="max-height:380px"><table class="rs-table" id="jn-disc"></table></div></div>
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
    const links = r => `<a href="${R.sjrUrl(r.id)}" target="_blank" rel="noopener" title="SCImago"><i class="bi bi-bar-chart"></i></a> <a href="${R.scopusSourceUrl(r.id)}" target="_blank" rel="noopener" title="Scopus"><i class="bi bi-bar-chart-line" style="color:#e9711c"></i></a> ${fmtIssn(r.issn)[0] ? `<a href="https://portal.issn.org/resource/ISSN/${fmtIssn(r.issn)[0]}" target="_blank" rel="noopener" title="الموقع الرسمي عبر بوابة ISSN"><i class="bi bi-house"></i></a>` : ''}`;
    const tags = r => `${r.fl ? `<span class="rs-tag ${r.fl[2]}" title="${esc(r.fl[1])}"><i class="bi bi-exclamation-octagon"></i> ${esc(r.fl[0])}</span>` : ''}${r.oa ? `<span class="rs-tag oa">${r.oa === 2 ? 'ماسي' : 'وصول مفتوح'}</span>` : ''}${r.type !== 'j' ? `<span class="rs-tag">${TYPE[r.type] || ''}</span>` : ''}`;
    const petra = r => HOME >= 0 && r.jo && r.jo.unis.find(u => u[0] === HOME);
    const out = R.$('#jn-out');
    if (!part.length) out.innerHTML = '<div class="rs-empty"><i class="bi bi-journal-x"></i>لا توجد نتائج</div>';
    else if (st.view === 'table') out.innerHTML = `<div class="rs-scroll"><table class="rs-table rs-jtable"><thead><tr><th>#</th><th>المجلة</th><th>التصنيف</th><th class="num">SJR</th><th class="num">h</th><th>التخصصات</th><th>مدة القرار</th><th class="num">أبحاث أردنية</th><th>روابط</th></tr></thead><tbody>
      ${part.map((r, i) => `<tr><td class="num text-muted">${st.page * PER + i + 1}</td>
        <td class="ltr"><a href="#" data-j="${r.id}"><b>${esc(r.t)}</b></a><br><small class="text-muted">${esc(r.pub)} · ${esc(r.country)} · ${fmtIssn(r.issn).join(', ')}</small> ${tags(r)}</td>
        <td>${R.qTag(r.q) || '<small class="text-muted">—</small>'}<br><small class="text-muted">#${R.n(r.rank)}</small></td>
        <td class="num">${r.sjr ? r.sjr.toFixed(2) : '–'}</td><td class="num">${R.n(r.h)}</td>
        <td class="ltr"><small>${r.cats.slice(0, 3).map(c => `${esc(c[0])}${c[1] ? ` <b>${c[1]}</b>` : ''}`).join('<br>')}${r.cats.length > 3 ? `<br><span class="text-muted">+${r.cats.length - 3}</span>` : ''}</small></td>
        <td>${timeCell(r.tm)}</td>
        <td class="num">${r.jo ? `<b>${R.n(r.jo.docs)}</b><br><small class="text-muted">${r.jo.cpd} اقتباس/بحث${petra(r) ? ` · البترا ${petra(r)[1]}` : ''}</small>` : '<small class="text-muted">–</small>'}</td>
        <td class="text-nowrap">${links(r)}</td></tr>`).join('')}</tbody></table></div>`;
    else if (st.view === 'compact') out.innerHTML = `<ol class="rs-compact-list" start="${st.page * PER + 1}">${part.map(r => `<li><a href="#" data-j="${r.id}" class="ltr">${esc(r.t)}</a> ${R.qTag(r.q)} <small class="text-muted">SJR ${r.sjr ? r.sjr.toFixed(2) : '–'} · ${esc(r.pub)}${r.jo ? ` · ${R.n(r.jo.docs)} بحثاً أردنياً` : ''}</small> ${tags(r)}</li>`).join('')}</ol>`;
    else out.innerHTML = `<div class="rs-jgrid">${part.map(r => `<article class="rs-jcard q-${(r.q || 'n').toLowerCase()}${r.fl ? ' flagged' : ''}">
        <div class="top"><span class="qbig">${r.q || '—'}</span><div class="meta"><a href="#" data-j="${r.id}" class="t">${esc(r.t)}</a><div class="sub">${esc(r.pub)} · ${esc(r.country)}</div></div></div>
        <div class="tags">${tags(r)}</div>
        <div class="nums"><div><b>${r.sjr ? r.sjr.toFixed(2) : '–'}</b><span>SJR</span></div><div><b>${R.n(r.h)}</b><span>h-index</span></div><div><b>#${R.n(r.rank)}</b><span>عالمياً</span></div>
          <div><b>${r.tm && r.tm.accept != null ? r.tm.accept : '–'}</b><span>يوماً للقبول</span></div></div>
        <div class="cats">${r.cats.slice(0, 2).map(c => `<span class="ltr">${esc(c[0])} ${c[1] ? `<b>${c[1]}</b>` : ''}</span>`).join('')}</div>
        <div class="foot"><span>${r.jo ? `<i class="bi bi-people"></i> ${R.n(r.jo.docs)} بحثاً أردنياً${petra(r) ? ` · <b>البترا ${petra(r)[1]}</b>` : ''}` : '<span class="text-muted">لا أبحاث أردنية</span>'}</span><span class="lk">${links(r)}</span></div>
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
    const u = new URL(location); u.searchParams.set('tab', t); history.replaceState(null, '', u);
  }
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
    st.page = 0; render(); });
  let insDone = false;
  function insights() {
    if (insDone) return; insDone = true;
    const used = rows.filter(r => r.jo);
    const qd = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, '': 0 }; used.forEach(r => { qd[r.q || ''] += r.jo.docs; });
    R.chart('jn-ch-q', { type: 'doughnut', data: { labels: ['Q1', 'Q2', 'Q3', 'Q4', 'بلا تصنيف'], datasets: [{ data: [qd.Q1, qd.Q2, qd.Q3, qd.Q4, qd['']], backgroundColor: ['#1d7a3e', '#1f6f78', '#b8892b', '#c75b12', '#bbb'] }] }, options: { plugins: { legend: { position: 'right' } } } });
    const top = used.slice().sort((a, b) => b.jo.docs - a.jo.docs).slice(0, 15);
    R.chart('jn-ch-top', { type: 'bar', data: { labels: top.map(r => r.t.length > 38 ? r.t.slice(0, 36) + '…' : r.t), datasets: [{ label: 'أبحاث أردنية', data: top.map(r => r.jo.docs), backgroundColor: top.map(r => r.fl ? '#c0392b' : ({ Q1: '#1d7a3e', Q2: '#1f6f78', Q3: '#b8892b', Q4: '#c75b12' }[r.q] || '#999')), borderRadius: 3 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } } } } });
    const pubs = {}; used.forEach(r => { pubs[r.pub] = (pubs[r.pub] || 0) + r.jo.docs; });
    const tp = Object.entries(pubs).sort((a, b) => b[1] - a[1]).slice(0, 12);
    R.chart('jn-ch-pub', { type: 'bar', data: { labels: tp.map(x => x[0].slice(0, 34)), datasets: [{ label: 'أبحاث أردنية', data: tp.map(x => x[1]), backgroundColor: '#091b22', borderRadius: 3 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } } } } });
    const disc = used.filter(r => r.fl && r.fl[3]).sort((a, b) => b.jo.docs - a.jo.docs).slice(0, 25);
    R.$('#jn-disc').innerHTML = `<thead><tr><th>المجلة</th><th class="num">أبحاث أردنية</th><th class="num">البترا</th></tr></thead><tbody>${disc.map(r => `<tr><td class="ltr"><a href="#" data-j="${r.id}">${esc(r.t)}</a><br><small class="text-muted">${esc(r.fl[1])}</small></td><td class="num">${R.n(r.jo.docs)}</td><td class="num">${(r.jo.unis.find(u => u[0] === HOME) || [0, 0])[1] || '–'}</td></tr>`).join('')}</tbody>`;
  }
  R.$('#jn-disc').addEventListener('click', e => { const a = e.target.closest('[data-j]'); if (a) { e.preventDefault(); detail(a.dataset.j); } });

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
