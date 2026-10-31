/* dept.html: a faculty or department at a glance for deans and heads (output of the last five years, journal quality,
   citations, every member), and the research-activity alert of المادة (12) من نظام الهيئة التدريسية: the annual raise
   stops for an assistant professor or above whose published output acceptable for promotion stops for five years,
   unless they held a post of dean or above. The alert reads only what this site has recorded, so it asks to check. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [], thisYear = new Date().getFullYear(), FROM = thisYear - 4;
  const ref = (a, d) => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;
  const SKIP = R.SKIP_TYPES;   // not research output (research.js)
  const staff = list.filter(r => (r.rank_order || 9) <= 4);
  const W = {}; staff.forEach(r => { W[r.id] = []; });
  works.forEach(w => { if (SKIP.includes(w.type)) return; (w.r || []).forEach(id => { if (W[id]) W[id].push(w); }); });
  // per researcher: output of the last five years and the last year with published output (site works or OpenAlex by year)
  const P = Object.fromEntries(staff.map(r => {
    const ws = W[r.id], w5 = ws.filter(w => w.y >= FROM && w.y <= thisYear);
    const ys = ws.map(w => w.y || 0).concat(Object.entries(r.by_year || {}).filter(([, v]) => v[0] > 0).map(([y]) => +y)).filter(y => y && y <= thisYear);
    const last = ys.length ? Math.max(...ys) : 0;
    const matched = (r.oa_ids || []).length || (r.scopus_ids || []).length || ws.length;
    return [r.id, { r, w5, q12: w5.filter(w => w.q === 'Q1' || w.q === 'Q2').length, sc5: w5.filter(w => w.eid).length, last, quiet: last ? thisYear - last : null, matched: !!matched,
      cites: r.sc ? r.sc.cites || 0 : r.cites || 0, h: r.sc ? r.sc.h || 0 : r.h || 0 }];
  }));
  const status = p => !p.matched ? ['none', 'لا ملف مطابق', 'bi-question-circle'] : p.quiet == null || p.quiet >= 5 ? ['no', 'لا إنتاج منذ 5 سنوات فأكثر', 'bi-exclamation-octagon-fill']
    : p.quiet >= 3 ? ['warn', `لا إنتاج منذ ${p.quiet} سنوات`, 'bi-exclamation-triangle-fill'] : ['ok', 'نشط', 'bi-check-circle-fill'];
  const RULE = r => (r.rank_order || 9) <= 3;

  const st = { fac: R.param('fac'), dept: R.param('dept'), tab: R.param('tab') || 'sum', sort: 'w5' };
  app.innerHTML = `
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="dp-fac"><i class="bi bi-building"></i> الكلية</label><select id="dp-fac" class="form-select"><option value="">الجامعة كلها</option>${R.faculties(staff).map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="dp-dept"><i class="bi bi-diagram-2"></i> القسم</label><select id="dp-dept" class="form-select"></select></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-calendar-range"></i> الفترة</span><b class="pt-2">${FROM}–${thisYear} (خمس سنوات)</b></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-printer"></i> التقرير</span><div class="d-flex gap-2"><button class="btn btn-rs" onclick="print()"><i class="bi bi-file-earmark-pdf"></i> طباعة</button><button class="btn btn-rs-o" id="dp-csv"><i class="bi bi-download"></i> CSV</button></div></div>
  </div></section>
  <nav class="rs-tabs no-print" id="dp-tabs"><button data-t="sum"><i class="bi bi-speedometer2"></i> الملخص</button><button data-t="people"><i class="bi bi-person-lines-fill"></i> أعضاء الهيئة التدريسية</button><button data-t="act"><i class="bi bi-bell"></i> تنبيه النشاط البحثي <span class="rs-tag no" id="dp-actn"></span></button></nav>
  <div id="dp-body"></div>`;

  const unit = () => staff.filter(r => (!st.fac || r.faculty === st.fac) && (!st.dept || r.dept === st.dept));
  function fillDepts() {
    R.$('#dp-dept').innerHTML = `<option value="">${st.fac ? 'كل الأقسام' : 'اختر الكلية أولاً'}</option>` + (st.fac ? R.depts(staff, st.fac).map(d => `<option${d === st.dept ? ' selected' : ''}>${esc(d)}</option>`).join('') : '');
    R.$('#dp-dept').disabled = !st.fac;
  }
  function render() {
    const U = unit(), ps = U.map(r => P[r.id]), name = st.dept ? `قسم ${st.dept}` : st.fac || 'جامعة البترا';
    const ws = [...new Set(ps.flatMap(p => p.w5))], ids = new Set(U.map(r => r.id));
    const active = ps.filter(p => p.w5.length).length, q12 = ws.filter(w => w.q === 'Q1' || w.q === 'Q2').length, ranked = ws.filter(w => w.q).length;
    const alert = ps.filter(p => RULE(p.r) && p.matched && (p.quiet == null || p.quiet >= 5)), early = ps.filter(p => RULE(p.r) && p.matched && p.quiet != null && p.quiet >= 3 && p.quiet < 5);
    R.$('#dp-actn').textContent = alert.length || '';
    R.$$('#dp-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    const kpi = (v, l, icon, d, cls = '') => `<div class="rs-kpi ${cls}"><div class="v">${v}</div><div class="l"><i class="bi ${icon}"></i>${l}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
    const head = `<section class="rs-section rs-kpis">
      ${kpi(R.n(U.length), 'عضو هيئة تدريس', 'bi-people', name)}
      ${kpi(R.pct(U.length ? active / U.length : 0), 'نشطون بحثياً', 'bi-activity', `${R.n(active)} لهم منشور منذ ${FROM}`, 'teal')}
      ${kpi(R.n(ws.length), 'منشور', 'bi-journal-text', `${R.n(ws.filter(w => w.eid).length)} في Scopus · ${(U.length ? ws.length / U.length : 0).toFixed(1)} لكل عضو`, 'navy')}
      ${kpi(R.pct(ranked ? q12 / ranked : 0), 'في Q1–Q2', 'bi-award', `${R.n(q12)} من ${R.n(ranked)} بحثاً مصنفاً`, 'gold')}
      ${kpi(R.n(R.median(ps.filter(p => p.r.sc && p.r.sc.docs).map(p => p.h))), 'وسيط h-index', 'bi-graph-up', `في Scopus · ${R.n(ps.filter(p => p.r.sc && p.r.sc.docs).length)} عضواً لهم ملف`)}
      ${kpi(R.n(alert.length), 'تنبيه نشاط (5 سنوات)', 'bi-bell', `و${R.n(early.length)} إنذار مبكر (3–4 سنوات)`, alert.length ? 'red' : '')}
    </section>`;
    let html = head;
    if (st.tab === 'sum') {
      html += `<section class="rs-section rs-grid">
        <div class="rs-card rs-span-2"><h3><i class="bi bi-bar-chart-steps"></i>المنشورات سنوياً حسب تصنيف المجلة</h3><div class="rs-chart"><canvas id="dp-years"></canvas></div></div>
        <div class="rs-card"><h3><i class="bi bi-pie-chart"></i>أعضاء الهيئة حسب النشاط</h3><div class="rs-chart short"><canvas id="dp-act"></canvas></div></div>
        <div class="rs-card rs-span-2"><h3><i class="bi bi-diagram-3"></i>${st.dept ? 'أعضاء القسم' : st.fac ? 'أقسام الكلية' : 'كليات الجامعة'}: المنشورات لكل عضو و نسبة Q1–Q2 <small class="fw-normal text-muted">منذ ${FROM}</small></h3><div class="rs-chart tall" id="dp-cmp-box"><canvas id="dp-cmp"></canvas></div></div>
        <div class="rs-card"><h3><i class="bi bi-trophy"></i>الأكثر إنتاجاً منذ ${FROM}</h3><ol class="rs-venues">${ps.slice().sort((a, b) => b.w5.length - a.w5.length).slice(0, 8).map((p, i) => `<li><span class="rk">${i + 1}</span><div class="nm"><div class="t"><a href="${R.profileUrl(p.r)}">${esc(p.r.name)}</a></div><small class="text-muted">${esc(p.r.dept || '')}</small></div><b class="ct">${p.w5.length}<small>منشور</small></b></li>`).join('')}</ol></div>
      </section>`;
    } else if (st.tab === 'people') {
      const S = { w5: p => p.w5.length, q12: p => p.q12, cites: p => p.cites, h: p => p.h, last: p => -(p.quiet == null ? 99 : p.quiet) };
      html += `<section class="rs-section rs-card"><h3><i class="bi bi-person-lines-fill"></i>أعضاء الهيئة التدريسية <small class="fw-normal text-muted">${name}</small>
        <span class="ms-auto no-print"><select class="form-select form-select-sm" id="dp-sort">${[['w5', 'الأكثر إنتاجاً'], ['q12', 'الأكثر في Q1–Q2'], ['cites', 'الأكثر اقتباساً'], ['h', 'h-index'], ['last', 'الأحدث نشراً']].map(([k, l]) => `<option value="${k}"${k === st.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></span></h3>
        <div class="rs-scroll" style="max-height:none"><table class="rs-table rs-dp-table"><thead><tr><th>#</th><th>عضو الهيئة التدريسية</th><th>الرتبة</th><th class="num">منشورات ${FROM}+</th><th class="num">Q1–Q2</th><th class="num">في Scopus</th><th class="num">اقتباسات Scopus</th><th class="num">h</th><th class="num">آخر إنتاج</th><th>الحالة</th></tr></thead><tbody>
        ${ps.slice().sort((a, b) => S[st.sort](b) - S[st.sort](a)).map((p, i) => { const s = status(p); return `<tr><td class="num">${i + 1}</td><td><a href="${R.profileUrl(p.r)}"><b>${esc(p.r.name)}</b></a>${st.dept ? '' : `<br><small class="text-muted">${esc(p.r.dept || '')}</small>`}</td><td><small>${esc(p.r.rank || '')}</small></td>
          <td class="num"><b>${p.w5.length}</b></td><td class="num">${p.q12}</td><td class="num">${p.sc5}</td><td class="num">${R.n(p.cites)}</td><td class="num">${p.h}</td><td class="num">${p.last || '–'}</td><td><span class="rs-tag ${s[0]}"><i class="bi ${s[2]}"></i> ${s[1]}</span></td></tr>`; }).join('')}</tbody></table></div></section>`;
    } else {
      const row = p => `<li><span class="rs-avatar-w">${R.avatar(p.r)}</span><div><a href="${R.profileUrl(p.r)}"><b>${esc(p.r.name)}</b></a><small>${esc(p.r.rank || '')} · ${esc(p.r.dept || '')}</small></div>
        <span class="yr">${p.last ? `آخر إنتاج <b>${p.last}</b>` : 'لا إنتاج مسجّل'}</span><a class="btn btn-sm btn-rs-o no-print" href="annual.html?id=${encodeURIComponent(p.r.id)}"><i class="bi bi-person-vcard"></i> الملف</a></li>`;
      const none = ps.filter(p => RULE(p.r) && !p.matched);
      html += `<section class="rs-section rs-card rs-act-rule"><i class="bi bi-bank2"></i><div><b>نص المادة (12) من نظام الهيئة التدريسية</b>
          <p class="mb-1">«تُوقف الزيادة السنوية لعضو هيئة التدريس بقرار من مجلس العمداء من رتبة أستاذ مساعد فما فوق، إذا توقف إنتاجه العلمي المنشور والمقبول للترقية مدة خمس سنوات، ما لم يكن يشغل في هذه المدة مركزاً إدارياً بمنصب عميد فما فوق.» ${ref('12', '02')}</p>
          <small class="text-muted">يعرض التنبيه ما سجّله هذا الموقع من Scopus وOpenAlex وWeb of Science وصفحات المدرسين؛ قد يكون للعضو إنتاج منشور أو مقبول للنشر غير ظاهر هنا، فهو للتحقق والمتابعة لا للحكم.</small></div></section>
        <section class="rs-section rs-grid">
          <div class="rs-card rs-act no"><h3><i class="bi bi-exclamation-octagon-fill"></i>لا إنتاج مسجّل منذ خمس سنوات فأكثر <span class="rs-tag no">${alert.length}</span></h3>${alert.length ? `<ul class="rs-act-list">${alert.sort((a, b) => (a.last || 0) - (b.last || 0)).map(row).join('')}</ul>` : '<p class="text-muted mb-0">لا أحد. ممتاز.</p>'}</div>
          <div class="rs-card rs-act warn"><h3><i class="bi bi-exclamation-triangle-fill"></i>إنذار مبكر: لا إنتاج منذ 3–4 سنوات <span class="rs-tag warn">${early.length}</span></h3>${early.length ? `<ul class="rs-act-list">${early.sort((a, b) => (a.last || 0) - (b.last || 0)).map(row).join('')}</ul>` : '<p class="text-muted mb-0">لا أحد.</p>'}</div>
        </section>
        ${none.length ? `<section class="rs-section rs-card"><h3><i class="bi bi-question-circle"></i>لا ملف بحثي مطابق في المصادر <span class="rs-tag">${none.length}</span><small class="fw-normal text-muted">لا يمكن الحكم على نشاطهم من بيانات الموقع</small></h3><div class="d-flex flex-wrap gap-1">${none.map(p => `<a class="rs-chip" href="${R.profileUrl(p.r)}">${esc(p.r.name)}</a>`).join('')}</div></section>` : ''}
        <p class="rs-note rs-skipnote">${R.skipNote(works.filter(w => (w.r || []).some(id => W[id])))}</p>
        <p class="rs-note">يشمل التنبيه رتبة أستاذ مساعد فما فوق فقط، ولا يستثني من شغل منصب عميد فما فوق (يُستثنى يدوياً). «آخر إنتاج» هو أحدث سنة نشر مسجّلة للعضو في أي مصدر.</p>`;
    }
    R.$('#dp-body').innerHTML = html;
    if (st.tab === 'sum') charts(U, ps, ws);
    const so = R.$('#dp-sort'); if (so) so.onchange = e => { st.sort = e.target.value; render(); };
    const u = new URL(location); [['fac', st.fac], ['dept', st.dept], ['tab', st.tab === 'sum' ? '' : st.tab]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  function charts(U, ps, ws) {
    const ys = []; for (let y = FROM - 1; y <= thisYear; y++) ys.push(y);
    const all = [...new Set(U.flatMap(r => W[r.id]))];
    const Q = [['Q1', '#1d7a3e'], ['Q2', '#1f6f78'], ['Q3', '#b8892b'], ['Q4', '#c75b12'], ['', '#9aa5ab']];
    R.chart('dp-years', { type: 'bar', data: { labels: ys, datasets: Q.map(([q, c]) => ({ label: q || 'غير مصنف / خارج Scopus', data: ys.map(y => all.filter(w => w.y === y && (w.q || '') === q).length), backgroundColor: c, borderColor: '#fff', borderWidth: 1, borderRadius: 3 })) },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    const cnt = k => ps.filter(p => status(p)[0] === k).length;
    R.chart('dp-act', { type: 'doughnut', data: { labels: ['نشط', 'لا إنتاج 3–4 سنوات', 'لا إنتاج 5 سنوات فأكثر', 'لا ملف مطابق'], datasets: [{ data: [cnt('ok'), cnt('warn'), cnt('no'), cnt('none')], backgroundColor: ['#1d7a3e', '#d4a017', '#c0392b', '#9aa5ab'], borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '55%', plugins: { legend: { position: 'bottom' } } } });
    // the units one level down: faculties, departments, or the department's members
    const groups = st.dept ? U.map(r => [r.name, [r]]) : Object.entries(U.reduce((g, r) => { const k = st.fac ? r.dept : r.faculty; if (k) (g[k] = g[k] || []).push(r); return g; }, {}));
    const rowsC = groups.map(([k, rs]) => { const w = [...new Set(rs.flatMap(r => P[r.id].w5))], rk = w.filter(x => x.q).length; return { k, per: rs.length ? w.length / rs.length : 0, q: rk ? 100 * w.filter(x => x.q === 'Q1' || x.q === 'Q2').length / rk : 0 }; })
      .sort((a, b) => b.per - a.per).slice(0, 25);
    R.$('#dp-cmp-box').style.height = Math.max(260, rowsC.length * 30 + 80) + 'px';
    R.chart('dp-cmp', { type: 'bar', data: { labels: rowsC.map(x => x.k), datasets: [
      { label: st.dept ? 'منشورات منذ ' + FROM : 'منشورات لكل عضو', data: rowsC.map(x => +x.per.toFixed(1)), backgroundColor: '#901d23', borderRadius: 4 },
      { label: 'نسبة Q1–Q2 (%)', data: rowsC.map(x => Math.round(x.q)), backgroundColor: '#1f6f78', borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { beginAtZero: true } } } });
  }
  fillDepts(); render();
  R.$('#dp-fac').onchange = e => { st.fac = e.target.value; st.dept = ''; fillDepts(); render(); };
  R.$('#dp-dept').onchange = e => { st.dept = e.target.value; render(); };
  R.$('#dp-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; render(); } };
  R.$('#dp-csv').onclick = () => R.csv(unit().map(r => { const p = P[r.id]; return { الاسم: r.name, الرتبة: r.rank, الكلية: r.faculty, القسم: r.dept, [`منشورات ${FROM}+`]: p.w5.length, 'Q1–Q2': p.q12, Scopus: p.sc5, 'اقتباسات Scopus': p.cites, h: p.h, 'آخر إنتاج': p.last || '', الحالة: status(p)[1] }; }), `research-${(st.dept || st.fac || 'uop').replace(/\s+/g, '-')}.csv`);
})();
