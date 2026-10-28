/* journals.html: every Scopus journal (SCImago SJR) with quartiles, ranking, links, how fast it decides and publishes
   (medians from Crossref dates of recent papers), and how Jordanian researchers use it; plus a journal finder for a paper */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let J, T = {};
  try { J = await R.load('journals'); } catch (e) { R.fail(app, e); return; }
  try { T = (await R.load('jordan/journal_times')).journals || {}; } catch (e) { T = {}; }
  R.updated({ updated: J.updated });
  const K = Object.fromEntries(J.cols.map((c, i) => [c, i]));
  const esc = R.esc, UNI = J.universities, HOME = UNI.findIndex(u => u[0] === R.HOME_AFID);
  const rows = J.rows.map(r => {
    const jo = r[K.jo] || null;
    const cats = (r[K.cats] || '').split('; ').filter(Boolean).map(x => x.split('|'));
    return { id: r[K.id], t: r[K.t], type: r[K.type], issn: r[K.issn], pub: J.publishers[r[K.pub]] || '', oa: r[K.oa], q: r[K.q], sjr: r[K.sjr], h: r[K.h], rank: r[K.rank],
      country: J.countries[r[K.country]] || '', cats, areas: (r[K.areas] || []).map(i => J.areas[i]), cpd2: +r[K.cpd2] || 0, cov: r[K.cov],
      jo: jo && { docs: jo[0], cpd: jo[1], y5: jo[2], unis: jo[3], kw: jo[4] }, tm: T[r[K.id]] || null,
      _s: R.norm([r[K.t], r[K.issn], (r[K.cats] || ''), J.publishers[r[K.pub]]].join(' ')) };
  });
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const fmtIssn = s => s.split(' ').filter(Boolean).map(x => x.length === 8 ? x.slice(0, 4) + '-' + x.slice(4) : x);
  const TYPE = { j: 'مجلة', b: 'سلسلة كتب', c: 'مؤتمر', t: 'نشرة تجارية' };
  const st = { q: R.param('q'), area: R.param('area'), quart: R.param('quart'), oa: '', jo: R.param('jo') === '1', type: 'j', sort: 'sjr', page: 0, find: '' };

  app.innerHTML = `
  <section class="rs-section rs-grid wide no-print">
    <div class="rs-card"><h3><i class="bi bi-search"></i>ابحث عن مجلة</h3>
      <div class="rs-toolbar">
        <div class="fld grow"><label for="jn-q">الاسم أو ISSN أو الناشر أو التخصص</label><input id="jn-q" class="form-control" type="search" value="${esc(st.q)}" placeholder="مثال: IEEE Access أو 2169-3536 أو Nursing"></div>
        <div class="fld"><label for="jn-area">المجال</label><select id="jn-area" class="form-select"><option value="">الكل</option>${J.areas.slice().sort((a, b) => R.areaAr(a).localeCompare(R.areaAr(b), 'ar')).map(a => `<option value="${esc(a)}"${a === st.area ? ' selected' : ''}>${esc(R.areaAr(a))}</option>`).join('')}</select></div>
        <div class="fld"><label for="jn-quart">التصنيف</label><select id="jn-quart" class="form-select"><option value="">الكل</option><option value="Q1">Q1</option><option value="Q12">Q1 و Q2</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
        <div class="fld"><label for="jn-oa">الوصول</label><select id="jn-oa" class="form-select"><option value="">الكل</option><option value="1">مفتوح</option><option value="2">ماسي (مجاني للنشر والقراءة)</option><option value="0">اشتراك/هجين</option></select></div>
        <div class="fld"><label for="jn-type">النوع</label><select id="jn-type" class="form-select"><option value="j">مجلات</option><option value="">الكل</option><option value="c">مؤتمرات</option><option value="b">سلاسل كتب</option></select></div>
        <div class="fld"><label for="jn-sort">ترتيب</label><select id="jn-sort" class="form-select"><option value="sjr">SJR (الأعلى)</option><option value="h">h-index</option><option value="jo">الأكثر نشراً للأردنيين</option><option value="jocpd">اقتباس الأبحاث الأردنية</option><option value="fast">الأسرع قبولاً</option><option value="pub">الأسرع نشراً بعد القبول</option></select></div>
      </div>
      <label class="form-check mt-2"><input class="form-check-input" type="checkbox" id="jn-jo"${st.jo ? ' checked' : ''}> <span class="form-check-label">فقط المجلات التي نشر فيها باحثون أردنيون</span></label>
    </div>
    <div class="rs-card"><h3><i class="bi bi-magic"></i>اقترح مجلة لبحثي</h3>
      <div class="fld"><label for="jn-find">عنوان البحث أو كلماته المفتاحية (بالإنجليزية)</label><textarea id="jn-find" class="form-control ltr" rows="3" placeholder="e.g. deep learning intrusion detection for IoT networks"></textarea></div>
      <div class="d-flex gap-2 flex-wrap mt-2 align-items-center"><button class="btn btn-rs" id="jn-go"><i class="bi bi-stars"></i> اقترح</button>
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" id="jn-good" checked> <span class="form-check-label">Q1 و Q2 فقط</span></label>
        <small class="text-muted">يطابق كلماتك مع موضوعات الأبحاث الأردنية في كل مجلة ومع تخصصاتها في SCImago.</small></div>
    </div>
  </section>
  <div class="d-flex flex-wrap gap-3 align-items-center mb-2" id="jn-sum"></div>
  <div class="rs-scroll"><table class="rs-table rs-jtable" id="jn-table"></table></div>
  <div class="rs-pager" id="jn-pager"></div>
  <div class="modal fade" id="jn-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title ltr" id="jn-mt"></h5><button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button></div><div class="modal-body" id="jn-mb"></div></div></div></div>
  <p class="rs-note mt-3">المصادر: SCImago Journal Rank ${J.sjr_year} (مبني على بيانات Scopus) للتصنيف والترتيب والمجالات؛ تصدير Scopus لكل الجامعات الأردنية لاستخدام الأردنيين؛ تواريخ الاستلام والقبول والنشر من Crossref لعيّنة من أحدث الأبحاث الأردنية في كل مجلة (وسيط بالأيام، يُحدَّث أسبوعياً، ويختلف حسب نوع البحث والمراجعة). تحقّق دائماً من موقع المجلة قبل الإرسال.</p>`;
  R.$('#jn-quart').value = st.quart;

  const days = v => v == null ? '–' : `${R.n(v)} يوم`;
  const timeCell = t => t ? `<span title="من الاستلام إلى القبول (وسيط ${t.n} بحث)"><i class="bi bi-hourglass-split"></i> ${days(t.accept)}</span><br><small class="text-muted" title="من القبول إلى النشر الإلكتروني">نشر بعد ${days(t.publish)}</small>` : '<small class="text-muted">–</small>';
  function filtered() {
    const q = R.norm(st.q).split(' ').filter(Boolean);
    let out = rows.filter(r => (!st.type || r.type === st.type) && (!st.area || r.areas.includes(st.area)) && (!st.jo || r.jo) &&
      (!st.quart || (st.quart === 'Q12' ? r.q === 'Q1' || r.q === 'Q2' : r.q === st.quart)) &&
      (st.oa === '' || (st.oa === '0' ? !r.oa : st.oa === '2' ? r.oa === 2 : r.oa)) && (!q.length || q.every(t => r._s.includes(t))));
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
      if (r.type !== 'j' || (R.$('#jn-good').checked && !(r.q === 'Q1' || r.q === 'Q2'))) continue;
      const kw = R.norm((r.jo ? r.jo.kw.join(' ') : '') ), cats = R.norm(r.cats.map(c => c[0]).join(' '));
      let s = 0;
      for (const w of words) { if (kw.includes(w)) s += 3; if (cats.includes(w)) s += 2; if (R.norm(r.t).includes(w)) s += 1.5; }
      if (s > 0) scored.push([s + Math.log10(1 + (r.jo ? r.jo.docs : 0)) + r.sjr / 4, r]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map(x => x[1]);
  }
  const PER = 50;
  function render(list, title) {
    const data = list || filtered();
    const pages = Math.ceil(data.length / PER);
    st.page = Math.min(st.page, Math.max(0, pages - 1));
    R.$('#jn-sum').innerHTML = title ? `<b>${esc(title)}</b> <button class="btn btn-sm btn-rs-o" id="jn-back">عودة للبحث</button>` : `<span><b class="fs-5">${R.n(data.length)}</b> نتيجة</span><span><b>${R.n(data.filter(r => r.q === 'Q1').length)}</b> في Q1</span><span><b>${R.n(data.filter(r => r.jo).length)}</b> نشر فيها أردنيون</span><span><b>${R.n(data.filter(r => r.tm).length)}</b> بمدد مراجعة معروفة</span>`;
    R.$('#jn-table').innerHTML = `<thead><tr><th>#</th><th>المجلة</th><th>التصنيف</th><th class="num">SJR</th><th class="num">h</th><th>التخصصات</th><th>مدة القرار</th><th class="num">أبحاث أردنية</th><th>روابط</th></tr></thead><tbody>
      ${data.slice(st.page * PER, st.page * PER + PER).map((r, i) => `<tr>
        <td class="num text-muted">${st.page * PER + i + 1}</td>
        <td class="ltr"><a href="#" data-j="${r.id}"><b>${esc(r.t)}</b></a><br><small class="text-muted">${esc(r.pub)} · ${esc(r.country)} · ${fmtIssn(r.issn).join(', ')}</small>
          ${r.oa ? `<span class="rs-tag oa">${r.oa === 2 ? 'ماسي' : 'وصول مفتوح'}</span>` : ''}${r.type !== 'j' ? `<span class="rs-tag">${TYPE[r.type] || ''}</span>` : ''}</td>
        <td>${R.qTag(r.q) || '<small class="text-muted">—</small>'}<br><small class="text-muted">#${R.n(r.rank)}</small></td>
        <td class="num">${r.sjr ? r.sjr.toFixed(2) : '–'}</td><td class="num">${R.n(r.h)}</td>
        <td class="ltr"><small>${r.cats.slice(0, 3).map(c => `${esc(c[0])}${c[1] ? ` <b>${c[1]}</b>` : ''}`).join('<br>')}${r.cats.length > 3 ? `<br><span class="text-muted">+${r.cats.length - 3}</span>` : ''}</small></td>
        <td>${timeCell(r.tm)}</td>
        <td class="num">${r.jo ? `<b>${R.n(r.jo.docs)}</b><br><small class="text-muted">${r.jo.cpd} اقتباس/بحث${HOME >= 0 && r.jo.unis.find(u => u[0] === HOME) ? ` · البترا ${r.jo.unis.find(u => u[0] === HOME)[1]}` : ''}</small>` : '<small class="text-muted">–</small>'}</td>
        <td class="text-nowrap"><a href="${R.sjrUrl(r.id)}" target="_blank" rel="noopener" title="SCImago"><i class="bi bi-bar-chart"></i></a> <a href="${R.scopusSourceUrl(r.id)}" target="_blank" rel="noopener" title="Scopus"><i class="bi bi-bar-chart-line" style="color:#e9711c"></i></a> ${fmtIssn(r.issn)[0] ? `<a href="https://portal.issn.org/resource/ISSN/${fmtIssn(r.issn)[0]}" target="_blank" rel="noopener" title="الموقع الرسمي عبر بوابة ISSN"><i class="bi bi-house"></i></a>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="rs-empty">لا توجد نتائج</td></tr>'}</tbody>`;
    const pg = []; for (let i = 0; i < pages; i++) if (i < 2 || i >= pages - 2 || Math.abs(i - st.page) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
    R.$('#jn-pager').innerHTML = pages > 1 ? pg.map(i => i === '…' ? '<span class="px-1">…</span>' : `<button class="btn btn-sm ${i === st.page ? 'btn-rs' : 'btn-rs-o'}" data-p="${i}">${i + 1}</button>`).join('') : '';
    const b = R.$('#jn-back'); if (b) b.onclick = () => { R.$('#jn-find').value = ''; st.find = ''; render(); };
    window.__last = [list, title];
  }
  function detail(id) {
    const r = byId[id]; if (!r) return;
    R.$('#jn-mt').textContent = r.t;
    const t = r.tm;
    R.$('#jn-mb').innerHTML = `
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

  render();
  if (R.param('id')) setTimeout(() => detail(R.param('id')), 300);
  const on = (id, k, ev) => R.$(id).addEventListener(ev || 'change', e => { st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; st.page = 0; render(); });
  R.$('#jn-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; st.page = 0; render(); }, 250));
  on('#jn-area', 'area'); on('#jn-quart', 'quart'); on('#jn-oa', 'oa'); on('#jn-type', 'type'); on('#jn-sort', 'sort'); on('#jn-jo', 'jo');
  R.$('#jn-go').onclick = () => { st.find = R.$('#jn-find').value; const s = suggest(); st.page = 0; if (s) render(s, `مجلات مقترحة لـ: «${st.find.slice(0, 80)}»`); };
  R.$('#jn-table').addEventListener('click', e => { const a = e.target.closest('[data-j]'); if (a) { e.preventDefault(); detail(a.dataset.j); } });
  R.$('#jn-pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { st.page = +b.dataset.p; render(...(window.__last || [])); R.$('#jn-sum').scrollIntoView({ behavior: 'smooth' }); } });
})();
