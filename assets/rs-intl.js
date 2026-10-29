/* intl.html: who University of Petra publishes with outside the university: countries, institutions, and over time,
   from the official Scopus export (collab.json, every co-author affiliation per document), filterable by faculty and
   period; and partners worth approaching among Jordanian universities: strong in a subject area (their Scopus documents
   of the last five years) but with few joint documents with Petra yet. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let C, data;
  try { [C, data] = await R.loadAll(['collab', 'researchers']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, thisYear = new Date().getFullYear();
  const I = Object.fromEntries(C.cols.map((c, i) => [c, i]));
  const JO = C.countries.findIndex(c => c[1] === 'JO');
  const dn = (() => { try { return new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { return null; } })();
  const cName = i => { const c = C.countries[i]; return c[1] && dn ? (dn.of(c[1]) || c[0]) : c[0]; };
  const REGION = c => ({ SA: 'arab', AE: 'arab', EG: 'arab', IQ: 'arab', LB: 'arab', BH: 'arab', QA: 'arab', KW: 'arab', OM: 'arab', PS: 'arab', TN: 'arab', DZ: 'arab', SD: 'arab', YE: 'arab', MA: 'arab', SY: 'arab', LY: 'arab', MR: 'arab', SO: 'arab', DJ: 'arab', JO: 'arab' })[c]
    || (['GB', 'DE', 'IT', 'FR', 'ES', 'PT', 'PL', 'HU', 'GR', 'FI', 'RO', 'SE', 'AT', 'NO', 'IE', 'NL', 'RS', 'UA', 'CY', 'CH', 'DK', 'CZ', 'EE', 'HR', 'BE', 'BA', 'BG', 'SK', 'MK', 'MT', 'MD', 'AL', 'SI', 'LT', 'LV', 'LU', 'IS', 'BY', 'ME', 'XK', 'RU', 'TR'].includes(c) ? 'eu'
      : ['US', 'CA', 'BR', 'CO', 'MX', 'CL', 'EC', 'PE', 'AR', 'GD', 'VC', 'TT', 'PA', 'GY', 'BO', 'CR', 'VE', 'UY', 'PR', 'JM', 'DO', 'CU', 'GT', 'HN', 'PY', 'SV', 'NI', 'BB', 'BS', 'HT'].includes(c) ? 'am'
        : ['NG', 'ET', 'ZA', 'GH', 'UG', 'RW', 'CM', 'TZ', 'SL', 'GM', 'KE', 'ZM', 'BW', 'CG', 'MW', 'NA', 'GN', 'MZ', 'CF', 'ZW', 'SN', 'BJ', 'BF', 'NE', 'ML', 'TG', 'LR', 'MG', 'MU', 'ER', 'BI', 'LS', 'SZ', 'AO', 'GA', 'CI', 'CD'].includes(c) ? 'af'
          : ['AU', 'NZ', 'FJ', 'PG'].includes(c) ? 'oc' : 'as');
  const REG = { arab: ['الدول العربية', '#901d23'], as: ['آسيا', '#b8892b'], eu: ['أوروبا', '#2b5ea7'], am: ['الأمريكتان', '#1f6f78'], af: ['أفريقيا', '#6b4c9a'], oc: ['أوقيانوسيا', '#5d6d2f'] };
  const docs = C.docs.map((d, i) => ({ i, y: d[I.y], c: d[I.c], f: d[I.f], q: d[I.q], inst: d[I.inst], ctry: d[I.ctry].filter(x => x !== JO), jo: d[I.ctry].includes(JO), r: d[I.r], id: d[I.id], t: d[I.t], v: d[I.v],
    fac: [...new Set(d[I.r].map(id => byId[id] && byId[id].faculty).filter(Boolean))] }));
  const isJO = k => C.insts[k][1] === 'Jordan';
  const st = { tab: R.param('tab') || 'ctry', from: +R.param('from') || thisYear - 4, to: thisYear, fac: R.param('fac'), q: '', reg: '', area: R.param('area'), inst: R.param('inst') };

  app.innerHTML = `
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-calendar-range"></i> الفترة</span><div class="d-flex gap-2 align-items-center"><select id="it-from" class="form-select">${Array.from({ length: 30 }, (_, i) => thisYear - i).map(y => `<option${y === st.from ? ' selected' : ''}>${y}</option>`).join('')}</select><span>–</span><select id="it-to" class="form-select">${Array.from({ length: 30 }, (_, i) => thisYear - i).map(y => `<option${y === st.to ? ' selected' : ''}>${y}</option>`).join('')}</select></div></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="it-fac"><i class="bi bi-building"></i> الكلية</label><select id="it-fac" class="form-select"><option value="">الجامعة كلها</option>${R.faculties(list).map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select><small class="rs-jf-hint">حسب باحثي البترا المطابَقين في كل وثيقة</small></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-printer"></i> التقرير</span><button class="btn btn-rs" onclick="print()"><i class="bi bi-file-earmark-pdf"></i> طباعة</button></div>
  </div></section>
  <section class="rs-section rs-kpis" id="it-kpis"></section>
  <nav class="rs-tabs no-print" id="it-tabs"><button data-t="ctry"><i class="bi bi-globe2"></i> الدول</button><button data-t="inst"><i class="bi bi-bank"></i> المؤسسات الشريكة</button><button data-t="trend"><i class="bi bi-graph-up"></i> عبر السنوات</button><button data-t="jo"><i class="bi bi-lightbulb"></i> شركاء أردنيون مقترحون</button></nav>
  <div id="it-body"></div>
  <p class="rs-note">المصدر: تصدير Scopus الرسمي لجامعة البترا (${esc(C.source || '')}، ${R.n(C.docs_total)} وثيقة) وعمود الانتماءات لكل مؤلف؛ تُوحَّد أسماء المؤسسات آلياً، فقد تظهر مؤسسة بأكثر من اسم أو يُدمج فرعان. تصفية الكلية تعتمد على مطابقة باحثي البترا في الوثيقة.</p>`;

  const sel = () => docs.filter(d => d.y >= st.from && d.y <= st.to && (!st.fac || d.fac.includes(st.fac)));
  function kpis(S) {
    const intl = S.filter(d => d.ctry.length), ctry = new Set(S.flatMap(d => d.ctry)), inst = new Set(S.flatMap(d => d.inst.filter(k => !isJO(k)))), joInst = new Set(S.flatMap(d => d.inst.filter(isJO)));
    const ci = intl.length ? intl.reduce((t, d) => t + d.c, 0) / intl.length : 0, local = S.filter(d => !d.ctry.length), cl = local.length ? local.reduce((t, d) => t + d.c, 0) / local.length : 0;
    R.$('#it-kpis').innerHTML = `
      <div class="rs-kpi"><div class="v">${R.pct(S.length ? intl.length / S.length : 0)}</div><div class="l"><i class="bi bi-globe2"></i>بتعاون دولي</div><div class="d">${R.n(intl.length)} من ${R.n(S.length)} وثيقة</div></div>
      <div class="rs-kpi teal"><div class="v">${R.n(ctry.size)}</div><div class="l"><i class="bi bi-flag"></i>دولة شريكة</div></div>
      <div class="rs-kpi navy"><div class="v">${R.n(inst.size)}</div><div class="l"><i class="bi bi-bank"></i>مؤسسة خارج الأردن</div><div class="d">و${R.n(joInst.size)} داخل الأردن</div></div>
      <div class="rs-kpi gold"><div class="v">${ci.toFixed(1)}</div><div class="l"><i class="bi bi-quote"></i>اقتباس لكل وثيقة دولية</div><div class="d">مقابل ${cl.toFixed(1)} للوثائق المحلية</div></div>`;
  }
  const bars = (rows, mx, cls = '') => `<ol class="rs-venues ${cls}">${rows.map((x, i) => `<li><span class="rk">${i + 1}</span><div class="nm"><div class="t">${x.label}</div>${x.sub ? `<small class="text-muted">${x.sub}</small>` : ''}<div class="rs-barwrap"><div class="rs-bar" style="width:${(100 * x.n / mx).toFixed(0)}%${x.color ? ';background:' + x.color : ''}"></div></div></div><b class="ct">${R.n(x.n)}<small>وثيقة</small></b></li>`).join('')}</ol>`;
  function render() {
    const S = sel();
    kpis(S);
    R.$$('#it-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    const body = R.$('#it-body');
    if (st.tab === 'ctry') {
      const n = {}, cites = {}; S.forEach(d => d.ctry.forEach(c => { n[c] = (n[c] || 0) + 1; cites[c] = (cites[c] || 0) + d.c; }));
      const rows = Object.entries(n).map(([c, v]) => ({ c: +c, n: v, cites: cites[c], reg: REGION(C.countries[c][1]) })).sort((a, b) => b.n - a.n);
      const reg = {}; S.filter(d => d.ctry.length).forEach(d => new Set(d.ctry.map(c => REGION(C.countries[c][1]))).forEach(g => { reg[g] = (reg[g] || 0) + 1; }));
      const R2 = rows.filter(x => !st.reg || x.reg === st.reg);
      body.innerHTML = `<section class="rs-section rs-grid">
        <div class="rs-card rs-span-2"><h3><i class="bi bi-bar-chart"></i>أكثر الدول تعاوناً <small class="fw-normal text-muted">وثائق مشتركة</small></h3><div class="rs-chart tall" style="height:${Math.max(300, Math.min(20, R2.length) * 26 + 60)}px"><canvas id="it-ctry"></canvas></div></div>
        <div class="rs-card"><h3><i class="bi bi-pie-chart"></i>حسب المنطقة</h3><div class="rs-chart"><canvas id="it-reg"></canvas></div>
          <div class="d-flex flex-wrap gap-1 mt-2 no-print"><button class="rs-chip${!st.reg ? ' on' : ''}" data-reg="">الكل</button>${Object.entries(REG).filter(([k]) => reg[k]).map(([k, v]) => `<button class="rs-chip${st.reg === k ? ' on' : ''}" data-reg="${k}">${v[0]}</button>`).join('')}</div></div></section>
        <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>كل الدول <span class="rs-tag y">${R2.length}</span></h3><div class="rs-scroll"><table class="rs-table"><thead><tr><th>#</th><th>الدولة</th><th>المنطقة</th><th class="num">وثائق مشتركة</th><th class="num">اقتباسات</th><th class="num">اقتباس/وثيقة</th></tr></thead><tbody>
          ${R2.map((x, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(cName(x.c))}</b></td><td><span class="rs-cdot" style="background:${REG[x.reg][1]}"></span> ${REG[x.reg][0]}</td><td class="num">${R.n(x.n)}</td><td class="num">${R.n(x.cites)}</td><td class="num">${(x.cites / x.n).toFixed(1)}</td></tr>`).join('')}</tbody></table></div></section>`;
      const top = R2.slice(0, 20);
      R.chart('it-ctry', { type: 'bar', data: { labels: top.map(x => cName(x.c)), datasets: [{ label: 'وثائق مشتركة', data: top.map(x => x.n), backgroundColor: top.map(x => REG[x.reg][1]), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
      const rk = Object.keys(REG).filter(k => reg[k]);
      R.chart('it-reg', { type: 'doughnut', data: { labels: rk.map(k => REG[k][0]), datasets: [{ data: rk.map(k => reg[k]), backgroundColor: rk.map(k => REG[k][1]), borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '55%', plugins: { legend: { position: 'bottom' } } } });
      body.querySelectorAll('[data-reg]').forEach(b => { b.onclick = () => { st.reg = b.dataset.reg; render(); }; });
    } else if (st.tab === 'inst') {
      const n = {}, cites = {}, ppl = {}, lastY = {};
      S.forEach(d => d.inst.forEach(k => { n[k] = (n[k] || 0) + 1; cites[k] = (cites[k] || 0) + d.c; lastY[k] = Math.max(lastY[k] || 0, d.y); (ppl[k] = ppl[k] || {}); d.r.forEach(id => { ppl[k][id] = (ppl[k][id] || 0) + 1; }); }));
      const q = R.norm(st.q);
      const rows = Object.keys(n).map(Number).filter(k => (st.reg === 'jo' ? isJO(k) : st.reg === 'x' ? !isJO(k) : true) && (!q || R.norm(C.insts[k][0] + ' ' + C.insts[k][1]).includes(q))).sort((a, b) => n[b] - n[a]);
      body.innerHTML = `<section class="rs-section rs-card"><h3><i class="bi bi-bank"></i>المؤسسات الشريكة <span class="rs-tag y">${R.n(rows.length)}</span>
          <span class="ms-auto d-flex gap-2 flex-wrap no-print"><input class="form-control form-control-sm" id="it-q" placeholder="ابحث باسم المؤسسة أو الدولة…" value="${esc(st.q)}" style="width:220px">
          <div class="rs-seg" id="it-reg2"><button data-v="">الكل</button><button data-v="x">خارج الأردن</button><button data-v="jo">داخل الأردن</button></div><button class="btn btn-sm btn-rs-o" id="it-csv"><i class="bi bi-download"></i> CSV</button></span></h3>
        <div class="rs-scroll" style="max-height:none"><table class="rs-table rs-it-table"><thead><tr><th>#</th><th>المؤسسة</th><th>الدولة</th><th class="num">وثائق مشتركة</th><th class="num">اقتباسات</th><th class="num">آخرها</th><th>باحثو البترا المشاركون</th></tr></thead><tbody>
        ${rows.slice(0, 150).map((k, i) => { const people = Object.entries(ppl[k]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, c]) => byId[id] ? `<a class="rs-chip" href="${R.profileUrl(byId[id])}">${esc(byId[id].name)} <b>${c}</b></a>` : '').join('');
          return `<tr><td class="num">${i + 1}</td><td class="ltr"><b>${esc(C.insts[k][0])}</b></td><td>${esc(cName(C.countries.findIndex(c => c[0] === C.insts[k][1])))}</td><td class="num"><b>${R.n(n[k])}</b></td><td class="num">${R.n(cites[k])}</td><td class="num">${lastY[k]}</td><td>${people || '<small class="text-muted">غير مطابق</small>'}</td></tr>`; }).join('')}</tbody></table></div>
        ${rows.length > 150 ? `<p class="rs-note mt-2 mb-0">تُعرض أول 150 مؤسسة؛ ابحث بالاسم أو نزّل CSV للقائمة كاملة.</p>` : ''}</section>`;
      R.$$('#it-reg2 button').forEach(b => b.classList.toggle('on', b.dataset.v === (st.reg === 'jo' || st.reg === 'x' ? st.reg : '')));
      R.$('#it-q').oninput = R.debounce(e => { st.q = e.target.value; render(); R.$('#it-q').focus(); R.$('#it-q').setSelectionRange(st.q.length, st.q.length); }, 300);
      R.$('#it-reg2').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.reg = b.dataset.v; render(); } };
      R.$('#it-csv').onclick = () => R.csv(rows.map(k => ({ institution: C.insts[k][0], country: C.insts[k][1], joint_documents: n[k], citations: cites[k], last_year: lastY[k],
        petra_researchers: Object.entries(ppl[k]).sort((a, b) => b[1] - a[1]).map(([id, c]) => byId[id] ? `${byId[id].name_en || byId[id].name} (${c})` : '').filter(Boolean).join('; ') })), 'petra-partner-institutions.csv');
    } else if (st.tab === 'trend') {
      const ys = []; for (let y = st.from; y <= st.to; y++) ys.push(y);
      const all = docs.filter(d => !st.fac || d.fac.includes(st.fac));
      const rs = Object.keys(REG).filter(k => k !== 'arab' || true);
      body.innerHTML = `<section class="rs-section rs-grid">
        <div class="rs-card rs-span-2"><h3><i class="bi bi-graph-up"></i>الوثائق: محلية مقابل دولية</h3><div class="rs-chart"><canvas id="it-tr"></canvas></div></div>
        <div class="rs-card"><h3><i class="bi bi-percent"></i>نسبة التعاون الدولي</h3><div class="rs-chart"><canvas id="it-trp"></canvas></div></div>
        <div class="rs-card rs-span-3"><h3><i class="bi bi-globe-americas"></i>التعاون حسب المنطقة سنوياً <small class="fw-normal text-muted">وثائق فيها شريك من المنطقة</small></h3><div class="rs-chart"><canvas id="it-trr"></canvas></div></div></section>`;
      R.chart('it-tr', { type: 'bar', data: { labels: ys, datasets: [
        { label: 'بتعاون دولي', data: ys.map(y => all.filter(d => d.y === y && d.ctry.length).length), backgroundColor: '#1f6f78', borderRadius: 3 },
        { label: 'محلية (الأردن فقط)', data: ys.map(y => all.filter(d => d.y === y && !d.ctry.length).length), backgroundColor: '#c9b48a', borderRadius: 3 }] },
        options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
      R.chart('it-trp', { type: 'line', data: { labels: ys, datasets: [{ label: 'نسبة الدولي', data: ys.map(y => { const a = all.filter(d => d.y === y); return a.length ? +(100 * a.filter(d => d.ctry.length).length / a.length).toFixed(1) : null; }), borderColor: '#901d23', backgroundColor: R.alpha('#901d23', .12), fill: true, tension: .3 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } } });
      R.chart('it-trr', { type: 'line', data: { labels: ys, datasets: rs.map(k => ({ label: REG[k][0], data: ys.map(y => all.filter(d => d.y === y && d.ctry.some(c => REGION(C.countries[c][1]) === k)).length), borderColor: REG[k][1], backgroundColor: REG[k][1], tension: .3, pointRadius: 3 })) },
        options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } });
    } else {
      const J = C.jo;
      if (!J) { body.innerHTML = '<div class="rs-empty">بيانات مقارنة الجامعات الأردنية غير متاحة.</div>'; return; }
      const areas = Object.keys(J.by_area).map(Number).sort((a, b) => (J.home[b] || 0) - (J.home[a] || 0));
      if (!st.area || !J.by_area[st.area]) st.area = String(areas[0]);
      const rows = J.by_area[st.area], mxD = Math.max(1, ...rows.map(x => x[1])), home = J.home[st.area] || 0;
      // potential: how strong the partner is in the area (share of the strongest) against how little it already publishes with Petra
      const scored = rows.map(([u, d, j]) => ({ u, d, j, pot: (d / mxD) * (1 / (1 + j)) })).sort((a, b) => b.pot - a.pot);
      const tag = x => x.j === 0 ? '<span class="rs-tag ok"><i class="bi bi-stars"></i> فرصة جديدة</span>' : x.j <= 3 ? '<span class="rs-tag warn"><i class="bi bi-arrow-up-right"></i> تعاون محدود</span>' : '<span class="rs-tag y"><i class="bi bi-link-45deg"></i> شريك قائم</span>';
      body.innerHTML = `<section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form"><div class="rs-jf-f grow"><label class="rs-jf-l" for="it-area"><i class="bi bi-diagram-2"></i> المجال (Scopus)</label><select id="it-area" class="form-select">${areas.map(a => `<option value="${a}"${String(a) === st.area ? ' selected' : ''}>${esc(R.areaAr(J.areas[a]))} — ${R.n(J.home[a])} وثيقة للبترا</option>`).join('')}</select></div></div></section>
        <section class="rs-section rs-card"><h3><i class="bi bi-lightbulb"></i>شركاء أردنيون مقترحون في ${esc(R.areaAr(J.areas[st.area]))} <small class="fw-normal text-muted">${J.since}–${J.until} · للبترا ${R.n(home)} وثيقة في المجال</small></h3>
          <div class="rs-scroll" style="max-height:none"><table class="rs-table"><thead><tr><th>#</th><th>الجامعة</th><th class="num">وثائقها في المجال</th><th>قوتها في المجال</th><th class="num">وثائق مشتركة مع البترا</th><th>التقييم</th></tr></thead><tbody>
          ${scored.map((x, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(J.unis[x.u][2] || J.unis[x.u][1])}</b></td><td class="num">${R.n(x.d)}</td><td style="min-width:140px"><div class="rs-barwrap"><div class="rs-bar" style="width:${(100 * x.d / mxD).toFixed(0)}%"></div></div></td><td class="num"><b>${R.n(x.j)}</b></td><td>${tag(x)}</td></tr>`).join('')}</tbody></table></div>
          <p class="rs-note mt-2 mb-0">الترتيب يقدّم الجامعات القوية في المجال التي لم تنشر مع البترا بعد، أو نشرت معها قليلاً. المصدر: مقارنة الجامعات الأردنية (تصدير Scopus لكل جامعة)، والوثائق المشتركة تُحسب منذ ${J.since}. <a href="experts.html">ابحث عن خبير أردني في الموضوع</a>.</p></section>`;
      R.$('#it-area').onchange = e => { st.area = e.target.value; render(); };
    }
    const u = new URL(location); [['tab', st.tab === 'ctry' ? '' : st.tab], ['fac', st.fac], ['from', st.from === thisYear - 4 ? '' : st.from], ['area', st.tab === 'jo' ? st.area : '']].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  render();
  R.$('#it-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; st.reg = ''; render(); } };
  R.$('#it-from').onchange = e => { st.from = +e.target.value; if (st.from > st.to) { st.to = st.from; R.$('#it-to').value = st.to; } render(); };
  R.$('#it-to').onchange = e => { st.to = +e.target.value; if (st.to < st.from) { st.from = st.to; R.$('#it-from').value = st.from; } render(); };
  R.$('#it-fac').onchange = e => { st.fac = e.target.value; render(); };
})();
