/* simulator.html: what would happen to a university's indicators (and its rank among Jordanian universities)
   if it raised its Q1 share, international collaboration, output or open access by a given amount.
   Model (transparent, explained on the page):
   - citations per document depend on journal quartile x international collaboration; the expected value of each cell
     is the Jordan-wide average for the last five years, and the university keeps its own "efficiency"
     (actual citations / expected citations for its current mix, worked out the same way as for the scenario);
   - h-index follows Hirsch's relation h = sqrt(C / a), with a calibrated on the university's own numbers;
   - every other university stays as it is. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let D, C;
  try { [D, C] = await R.loadAll(['jordan/unis', 'jordan/cube']); } catch (e) { R.fail(app, e); return; }
  R.updated({ updated: C.cites_updated || C.updated });
  const S = D.sim;
  if (!S) { app.innerHTML = '<div class="rs-empty"><i class="bi bi-hourglass"></i>تُجهَّز بيانات المحاكي في التحديث الأسبوعي القادم.</div>'; return; }
  const U = C.unis.map(([afid, en, ar], i) => ({ i, afid, en, ar }));
  const HOME = U.find(u => u.afid === R.HOME_AFID) || U[0];
  const esc = R.esc, pct = (v, d = 1) => R.pct(v, d);
  const K = S.keys.length; // Q1 Q2 Q3 Q4 none

  // Jordan-wide citations per document in each quartile x collaboration cell
  const nat = { n: [], c: [] };
  for (let k = 0; k < K; k++) { nat.n.push([0, 0]); nat.c.push([0, 0]); }
  Object.values(S.unis).forEach(u => u.n.forEach((r, k) => { nat.n[k][0] += r[0]; nat.n[k][1] += r[1]; nat.c[k][0] += u.c[k][0]; nat.c[k][1] += u.c[k][1]; }));
  const cell = (k, x) => nat.n[k][x] ? nat.c[k][x] / nat.n[k][x] : 0;
  // expected citations per document for a quartile mix and a collaboration share (collaboration independent of quartile);
  // the current figures and the scenario both use it, so a scenario of zeros gives back the current numbers exactly
  const expMix = (q, intl) => q.reduce((t, s, k) => t + s * ((1 - intl) * cell(k, 0) + intl * cell(k, 1)), 0);

  function base(u) {
    const s = S.unis[u.i]; if (!s) return null;
    const docs = s.docs, n = s.n;
    const qShare = n.map(r => (r[0] + r[1]) / docs);
    const intl = n.reduce((t, r) => t + r[1], 0) / docs;
    const exp = expMix(qShare, intl);
    const cpd = s.cites / docs;
    const ranked = docs - n[4][0] - n[4][1];
    return { u, docs, cites: s.cites, cpd, h: s.h, qShare, intl, oa: s.oa / docs, eff: exp ? cpd / exp : 1, a: s.h ? s.cites / (s.h * s.h) : 4,
      q1: ranked ? (n[0][0] + n[0][1]) / ranked : 0, q12: ranked ? (n[0][0] + n[0][1] + n[1][0] + n[1][1]) / ranked : 0, ranked: ranked / docs };
  }
  const all = U.map(base).filter(Boolean);

  // the scenario: move papers in ranked journals from lower quartiles into Q1, more international papers, more papers,
  // more open access
  function scenario(b, p) {
    const q = b.qShare.slice();
    // the Q1 share is of the papers in ranked journals (as shown in the table), so the points are added in those terms and
    // taken from Q4, then Q3, then Q2; papers outside ranked journals stay as they are
    const ranked0 = 1 - q[4];
    const add = Math.min(p.q1 / 100 * ranked0, ranked0 - q[0]);
    let need = add;
    for (const k of [3, 2, 1]) { const t = Math.min(need, q[k]); q[k] -= t; need -= t; }
    q[0] += add - need;
    const intl = Math.min(1, b.intl + p.intl / 100);
    const cpd = expMix(q, intl) * b.eff;
    const docs = Math.round(b.docs * (1 + p.out / 100));
    const cites = Math.round(docs * cpd);
    const ranked = 1 - q[4];
    return { ...b, docs, cites, cpd, h: Math.round(Math.sqrt(cites / b.a)), intl, oa: Math.min(1, b.oa + p.oa / 100),
      q1: ranked ? q[0] / ranked : 0, q12: ranked ? (q[0] + q[1]) / ranked : 0, qShare: q, ranked };
  }

  const IND = [
    ['docs', 'الوثائق (5 سنوات)', v => R.n(v)], ['cites', 'الاقتباسات', v => R.n(v)], ['cpd', 'اقتباس لكل وثيقة', v => v.toFixed(2)],
    ['h', 'h-index (5 سنوات)', v => R.n(v)], ['q1', 'نسبة Q1', v => pct(v)], ['q12', 'نسبة Q1 و Q2', v => pct(v)],
    ['intl', 'التعاون الدولي', v => pct(v)], ['oa', 'الوصول المفتوح', v => pct(v)], ['score', 'المؤشر المركّب', v => v.toFixed(1)]
  ];
  const W0 = { cpd: 30, q1: 20, intl: 20, docs: 20, oa: 10 };
  const st = { u: HOME.i, q1: 10, intl: 10, out: 0, oa: 0, w: { ...W0 } };

  app.innerHTML = `
  <section class="rs-section rs-grid wide">
    <div class="rs-card no-print"><h3><i class="bi bi-sliders"></i>السيناريو</h3>
      <div class="fld mb-3"><label for="sm-u">الجامعة</label><select id="sm-u" class="form-select">${U.map(u => `<option value="${u.i}"${u.i === st.u ? ' selected' : ''}>${esc(u.ar)}</option>`).join('')}</select></div>
      ${[['q1', 'رفع نسبة الأبحاث في مجلات Q1 بمقدار', 0, 40, 'نقطة مئوية'], ['intl', 'رفع نسبة التعاون الدولي بمقدار', 0, 40, 'نقطة مئوية'],
         ['out', 'زيادة عدد الأبحاث', -30, 100, '%'], ['oa', 'رفع نسبة الوصول المفتوح بمقدار', 0, 40, 'نقطة مئوية']].map(([k, l, mn, mx, unit]) => `
        <div class="rs-slider"><label for="sm-${k}">${l} <b id="sm-${k}-v"></b> ${unit}</label><input type="range" class="form-range" id="sm-${k}" min="${mn}" max="${mx}" step="1" value="${st[k]}"></div>`).join('')}
      <div class="d-flex gap-2 flex-wrap mt-2">
        <button class="btn btn-sm btn-rs-o" data-preset="q1">هدف: Q1 فقط +15</button><button class="btn btn-sm btn-rs-o" data-preset="intl">هدف: تعاون دولي +15</button>
        <button class="btn btn-sm btn-rs-o" data-preset="both">الاثنان معاً +10</button><button class="btn btn-sm btn-rs-o" data-preset="volume">زيادة الإنتاج 30%</button>
        <button class="btn btn-sm btn-rs-o" data-preset="reset">إعادة الضبط</button></div>
    </div>
    <div class="rs-card"><h3><i class="bi bi-speedometer2"></i>النتيجة المتوقعة <small class="fw-normal text-muted" id="sm-win"></small></h3>
      <div class="rs-scroll"><table class="rs-table" id="sm-table"></table></div>
    </div>
  </section>

  <section class="rs-section rs-grid wide">
    <div class="rs-card"><h3><i class="bi bi-trophy"></i>الترتيب بين الجامعات الأردنية حسب المؤشر المركّب</h3><div class="rs-chart" id="sm-rank-wrap" style="height:${U.length * 22 + 60}px"><canvas id="sm-rank"></canvas></div></div>
    <div class="rs-card no-print"><h3><i class="bi bi-percent"></i>أوزان المؤشر المركّب <small class="fw-normal text-muted">عدّلها لتقارب منهجية التصنيف الذي يهمك</small></h3>
      ${[['cpd', 'الأثر: اقتباس لكل وثيقة'], ['q1', 'الجودة: نسبة Q1'], ['intl', 'الانفتاح: التعاون الدولي'], ['docs', 'الحجم: عدد الأبحاث'], ['oa', 'الوصول المفتوح']].map(([k, l]) => `
        <div class="rs-slider"><label for="sm-w-${k}">${l} <b id="sm-w-${k}-v"></b>%</label><input type="range" class="form-range" id="sm-w-${k}" min="0" max="60" step="5" value="${st.w[k]}"></div>`).join('')}
      <p class="rs-note mb-0">كل مؤشر يُحوَّل إلى درجة من 0 إلى 100 (أعلى جامعة أردنية = 100)، ثم تُجمع الدرجات حسب الأوزان. هذا مؤشر توضيحي وليس تصنيفاً رسمياً؛ التصنيفات العالمية (QS و THE) تستخدم بيانات أخرى أيضاً مثل السمعة ونسبة الطلبة.</p>
    </div>
  </section>

  <section class="rs-section rs-card"><h3><i class="bi bi-info-circle"></i>كيف يعمل المحاكي</h3>
    <ul class="small mb-0">
      <li>الفترة: آخر خمس سنوات (${S.years[0]}–${S.years[1]}) من بيانات Scopus لكل الجامعات الأردنية، والاقتباسات محدّثة أسبوعياً.</li>
      <li>متوسط الاقتباس لكل وثيقة في الأردن حسب تصنيف المجلة والتعاون الدولي: <span id="sm-cells"></span></li>
      <li>تحافظ الجامعة على «كفاءتها» الحالية (اقتباساتها الفعلية ÷ المتوقعة لمزيجها الحالي)، ثم يُعاد حساب المتوقع للمزيج الجديد.</li>
      <li>نسبة Q1 محسوبة من الأبحاث في المجلات المصنّفة، ورفعها ينقل أبحاثاً من Q4 ثم Q3 ثم Q2 إلى Q1؛ الأبحاث خارج المجلات المصنّفة تبقى كما هي. h-index يُقدَّر بعلاقة هيرش h = √(C/a) معايَرةً على أرقام الجامعة.</li>
      <li>الجامعات الأخرى تبقى كما هي؛ النتائج تقديرية للتخطيط، لا وعود.</li>
    </ul></section>`;

  R.$('#sm-cells').innerHTML = S.keys.map((k, i) => `${k || 'غير مصنّف'}: ${cell(i, 0).toFixed(1)} محلي / ${cell(i, 1).toFixed(1)} دولي`).join(' · ');

  function scores(list) {
    const keys = Object.keys(st.w), mx = {};
    keys.forEach(k => { mx[k] = Math.max(...list.map(x => x[k])) || 1; });
    const tw = keys.reduce((t, k) => t + st.w[k], 0) || 1;
    list.forEach(x => { x.score = keys.reduce((t, k) => t + st.w[k] * 100 * x[k] / mx[k], 0) / tw; });
  }
  function render() {
    ['q1', 'intl', 'out', 'oa'].forEach(k => { R.$(`#sm-${k}-v`).textContent = (st[k] > 0 && k !== 'out' ? '+' : '') + st[k]; });
    Object.keys(st.w).forEach(k => { R.$(`#sm-w-${k}-v`).textContent = st.w[k]; });
    const b = all.find(x => x.u.i === st.u);
    const s = scenario(b, st);
    const before = all.map(x => ({ ...x })), after = all.map(x => x.u.i === st.u ? { ...s } : { ...x });
    scores(before); scores(after);
    const rk = (list, k, id) => list.slice().sort((a, c) => c[k] - a[k]).findIndex(x => x.u.i === id) + 1;
    const B = before.find(x => x.u.i === st.u), A = after.find(x => x.u.i === st.u);
    R.$('#sm-win').textContent = `${b.u.ar} · ${S.years[0]}–${S.years[1]}`;
    R.$('#sm-table').innerHTML = `<thead><tr><th>المؤشر</th><th class="num">الآن</th><th class="num">بعد السيناريو</th><th class="num">التغيّر</th><th class="num">الترتيب (من ${all.length})</th></tr></thead><tbody>
      ${IND.map(([k, l, f]) => { const r0 = rk(before, k, st.u), r1 = rk(after, k, st.u); const d = Math.abs(A[k] - B[k]) < 1e-9 ? 0 : A[k] - B[k];
        return `<tr${k === 'score' ? ' class="me"' : ''}><td><b>${l}</b></td><td class="num">${f(B[k])}</td><td class="num"><b>${f(A[k])}</b></td>
          <td class="num ${d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-muted'}">${d > 0 ? '+' : ''}${/q1|q12|intl|oa/.test(k) ? (100 * d).toFixed(1) + ' ن.م' : k === 'cpd' || k === 'score' ? d.toFixed(2) : R.n(d)}</td>
          <td class="num">${r1 !== r0 ? `من #${r0} إلى <b class="${r1 < r0 ? 'text-success' : 'text-danger'}">#${r1}</b>` : '#' + r0}</td></tr>`; }).join('')}</tbody>`;
    const list = after.slice().sort((a, c) => c.score - a.score);
    R.$('#sm-rank-wrap').style.height = (list.length * 22 + 60) + 'px';
    R.chart('sm-rank', { type: 'bar', data: { labels: list.map(x => x.u.ar), datasets: [
      { label: 'بعد السيناريو', data: list.map(x => +x.score.toFixed(1)), backgroundColor: list.map(x => x.u.i === st.u ? '#901d23' : '#c9c2b2'), borderRadius: 3 },
      { label: 'الآن', data: list.map(x => x.u.i === st.u ? +B.score.toFixed(1) : null), backgroundColor: '#b8892b', borderRadius: 3 }] },
      options: { indexAxis: 'y', scales: { y: { stacked: false, ticks: { autoSkip: false, font: { size: 12 } } } } } });
  }
  render();
  ['q1', 'intl', 'out', 'oa'].forEach(k => R.$(`#sm-${k}`).addEventListener('input', e => { st[k] = +e.target.value; render(); }));
  Object.keys(st.w).forEach(k => R.$(`#sm-w-${k}`).addEventListener('input', e => { st.w[k] = +e.target.value; render(); }));
  R.$('#sm-u').onchange = e => { st.u = +e.target.value; render(); };
  app.addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (!b) return;
    const P = { q1: { q1: 15, intl: 0, out: 0, oa: 0 }, intl: { q1: 0, intl: 15, out: 0, oa: 0 }, both: { q1: 10, intl: 10, out: 0, oa: 0 }, volume: { q1: 0, intl: 0, out: 30, oa: 0 }, reset: { q1: 0, intl: 0, out: 0, oa: 0 } }[b.dataset.preset];
    Object.assign(st, P); ['q1', 'intl', 'out', 'oa'].forEach(k => { R.$(`#sm-${k}`).value = st[k]; }); render(); });
})();
