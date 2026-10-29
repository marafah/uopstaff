/* publish.html «أين أنشر؟»: journals that fit a paper (its title or keywords matched to the subjects of every Scopus
   journal and to the topics Jordanian researchers publish there), each with what it is worth under the university's
   instructions: publication support and incentive (تعليمات البحث العلمي 2022، م5/د), promotion category and points
   (تعليمات الهيئة التدريسية 2021، م23), and points for the distinguished researcher award (تعليمات الجائزة 2022، م8/د);
   with how fast it decides, open access, and whether Scopus still covers it. A shortlist prints as a report. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let J, T = {}, FL = null, data;
  try {
    const [jr, tr, rr] = await Promise.allSettled([R.load('journals'), R.load('jordan/journal_times'), R.load('researchers')]);
    if (jr.status !== 'fulfilled') throw jr.reason;
    J = jr.value; T = tr.status === 'fulfilled' ? (tr.value.journals || {}) : {}; data = rr.status === 'fulfilled' ? rr.value : { researchers: [] };
  } catch (e) { R.fail(app, e); return; }
  if (!J.cols.includes('fl')) { try { FL = await R.scopusFlags(); } catch (e) { FL = null; } }
  const { list, byId } = R.indexResearchers(data);
  R.updated({ updated: J.updated });
  const esc = R.esc, K = Object.fromEntries(J.cols.map((c, i) => [c, i])), HOME = J.universities.findIndex(u => u[0] === R.HOME_AFID);
  const ref = (a, d) => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;

  // ---------------------------------------------------------------- the rules (same tables as reward.html, promotion.html, award.html)
  const SC = { Q1: [200, 800], Q2: [200, 600], Q3: [200, 400], Q4: [200, 200], NA: [200, 200] };          // 06: م(5/د/4) [support, incentive]
  const shares = n => n <= 1 ? [1] : n === 2 ? [0.6, 0.4] : n === 3 ? [0.5, 0.25, 0.25] : [0.35, ...Array(n - 1).fill(0.65 / (n - 1))]; // م(5/د/7)
  const PROMO = { Q1: [1, 2], Q2: [1, 2], Q3: [2, 2], Q4: [2, 2], NA: [3, 1] };                          // 05: م(23/أ) [category, points]
  const AWARD = { Q1: [60, 30], Q2: [50, 25], Q3: [40, 20], Q4: [30, 15], NA: [20, 10] };                 // 11: م(8/د) [lead, co-author]

  const rows = J.rows.filter(r => r[K.type] === 'j').map(r => {
    const jo = r[K.jo] || null, cr = r[K.cats];
    const cats = Array.isArray(cr) ? cr.map(c => [J.catn[c[0]], c[1] ? 'Q' + c[1] : '']) : (cr || '').split('; ').filter(Boolean).map(x => x.split('|'));
    const fl = K.fl !== undefined ? (r[K.fl] ? R.flagVerdict({ d: r[K.fl][0], p: r[K.fl][1], end: r[K.fl][2], s: r[K.fl][3] ? 'i' : 'a' }) : null) : FL ? FL.verdict(FL.F[r[K.id]] || null) : null;
    return { id: r[K.id], t: r[K.t], issn: r[K.issn], pub: J.publishers[r[K.pub]] || '', oa: r[K.oa], q: r[K.q] || 'NA', sjr: r[K.sjr] || 0, h: r[K.h],
      country: J.countries[r[K.country]] || '', cats, areas: (r[K.areas] || []).map(i => J.areas[i]), fl,
      jo: jo && { docs: jo[0], cpd: jo[1], unis: jo[3], kw: jo[4] }, tm: T[r[K.id]] || null,
      _kw: R.norm(jo ? jo[4].join(' ') : ''), _cat: R.norm(cats.map(c => c[0]).join(' ')), _t: R.norm(r[K.t]) };
  }).filter(r => !r.fl);
  const byJ = Object.fromEntries(rows.map(r => [r.id, r]));
  const STOP = /^(the|and|for|with|using|based|from|into|of|in|on|a|an|to|by|via|towards?|study|analysis|approach|new|its|their|among|between|effect|effects|role|case)$/;

  const st = Object.assign({ q: '', area: '', min: 'Q4', oa: '', fast: false, n: 3, me: 1, intl: false, lead: true, sort: 'fit', rid: '', pick: [] },
    { q: R.param('q'), area: R.param('area'), rid: R.param('id'), pick: R.param('pick') ? R.param('pick').split(',') : [] });

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-signpost-split"></i>أين أنشر بحثي؟</h3>
      <p class="mb-0">اكتب عنوان بحثك أو كلماته المفتاحية، فتظهر المجلات الأنسب له مع ما يساويه النشر فيها وفق تعليمات الجامعة: <b>الدعم والحافز المالي</b> ${ref('5', '06')}، و<b>فئة البحث ونقاطه في الترقية</b> ${ref('23', '05')}، و<b>نقاط جائزة الباحث المتميز</b> ${ref('8', '11')}، ومدة القرار، والوصول المفتوح. المجلات التي حذفها Scopus مستبعدة.</p></div>
    <a class="btn btn-rs-o" href="journals.html"><i class="bi bi-journal-bookmark"></i> دليل المجلات</a>
  </section>
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pb-form">
    <div class="rs-jf-f grow"><label class="rs-jf-l" for="pb-q"><i class="bi bi-file-earmark-text"></i> عنوان البحث أو كلماته المفتاحية (بالإنجليزية)</label>
      <textarea id="pb-q" class="form-control ltr" rows="2" placeholder="e.g. deep learning intrusion detection for IoT networks">${esc(st.q)}</textarea>
      <div class="d-flex gap-2 flex-wrap mt-2 align-items-center"><input id="pb-who" class="form-control form-control-sm" style="max-width:260px" list="pb-names" placeholder="أو اختر اسمك لاستخدام مواضيعك…" autocomplete="off"><datalist id="pb-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist><small class="text-muted" id="pb-who-h"></small></div></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="pb-area"><i class="bi bi-diagram-2"></i> المجال</label><select id="pb-area" class="form-select"><option value="">كل المجالات</option>${J.areas.slice().sort((a, b) => R.areaAr(a).localeCompare(R.areaAr(b), 'ar')).map(a => `<option value="${esc(a)}"${a === st.area ? ' selected' : ''}>${esc(R.areaAr(a))}</option>`).join('')}</select></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-bar-chart-line"></i> أدنى تصنيف</span><div class="rs-seg" id="pb-min">${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<button data-v="${q}">${q === 'Q4' ? 'الكل' : q === 'Q1' ? 'Q1' : 'حتى ' + q}</button>`).join('')}</div></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="pb-oa"><i class="bi bi-unlock"></i> الوصول</label><select id="pb-oa" class="form-select"><option value="">الكل</option><option value="2">ماسي (بلا رسوم نشر)</option><option value="1">مفتوح الوصول</option><option value="0">اشتراك أو هجين</option></select></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-people"></i> المؤلفون</span><div class="rs-rw-auth"><label>العدد <input class="form-control" id="pb-n" type="number" min="1" value="${st.n}"></label><label>ترتيبي <input class="form-control" id="pb-me" type="number" min="1" value="${st.me}"></label></div>
      <label class="rs-pr-chk mt-1"><input type="checkbox" id="pb-intl"> مع باحثين دوليين (+200 دينار)</label></div>
  </div></section>
  <section class="rs-section" id="pb-sum"></section>
  <section class="rs-section rs-card" id="pb-cmp" hidden></section>
  <section class="rs-section">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2 no-print"><b id="pb-count"></b>
      <label class="form-check m-0 ms-2"><input class="form-check-input" type="checkbox" id="pb-fast"> <span class="form-check-label">بمدة قرار معروفة فقط</span></label>
      <div class="rs-seg ms-auto" id="pb-sort"><button data-v="fit"><i class="bi bi-bullseye"></i> الأنسب</button><button data-v="value"><i class="bi bi-cash-coin"></i> الأعلى قيمة</button><button data-v="fast"><i class="bi bi-lightning-charge"></i> الأسرع قراراً</button><button data-v="sjr"><i class="bi bi-graph-up"></i> SJR</button></div></div>
    <div id="pb-out" class="rs-pb-list"></div></section>
  <p class="rs-note">القيم تقديرية وغير رسمية: الدعم والحافز هما الحد الأعلى في جداول التعليمات ويُصرفان بتنسيب مجلس البحث العلمي، وتُقسم الحصص حسب ترتيب الباحثين ${ref('5', '06')}/د/7؛ ونقاط الترقية للبحث في مجلة حسب فئته، والقرار للجنة بعد التقييم. التصنيف من SCImago ${J.sjr_year}، ومدد القرار وسيط من Crossref لأحدث الأبحاث الأردنية في كل مجلة. تحقّق دائماً من موقع المجلة ورسومها قبل الإرسال.</p>`;

  const words = () => R.norm(st.q).split(' ').filter(w => w.length > 2 && !STOP.test(w));
  function value(q) {
    const sc = SC[q], total = sc[0] + sc[1] + (st.intl ? 200 : 0), n = Math.max(1, st.n | 0), me = Math.min(n, Math.max(1, st.me | 0));
    return { total, mine: total * shares(n)[me - 1], promo: PROMO[q], award: AWARD[q][me === 1 ? 0 : 1], lead: me === 1 };
  }
  const QORD = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, NA: 5 };
  function results() {
    const W = words(), minQ = QORD[st.min] || 4;
    const out = [];
    for (const r of rows) {
      if (QORD[r.q] > minQ || (st.area && !r.areas.includes(st.area)) || (st.oa !== '' && (st.oa === '0' ? r.oa : st.oa === '2' ? r.oa !== 2 : !r.oa)) || (st.fast && !(r.tm && r.tm.accept != null))) continue;
      let s = 0; const hit = new Set();
      for (const w of W) { if (r._kw.includes(w)) { s += 3; hit.add(w); } if (r._cat.includes(w)) { s += 2; hit.add(w); } if (r._t.includes(w)) { s += 1.5; hit.add(w); } }
      if (W.length && (!s || (W.length >= 3 && hit.size < Math.ceil(W.length * 0.4)))) continue;   // most of the paper's words, not one of them
      const cover = W.length ? hit.size / W.length : 0;
      out.push({ r, fit: s * (0.5 + cover) + Math.log10(1 + (r.jo ? r.jo.docs : 0)) + r.sjr / 4, cover, hit: [...hit], v: value(r.q) });
    }
    const key = { fit: x => x.fit, value: x => x.v.mine * 10 + x.cover * 5 + x.r.sjr / 10, fast: x => x.r.tm && x.r.tm.accept != null ? -x.r.tm.accept : -1e9, sjr: x => x.r.sjr }[st.sort];
    return out.sort((a, b) => key(b) - key(a));
  }

  const qp = q => `<span class="rs-qpill q-${q.toLowerCase()}">${q === 'NA' ? 'غير مصنفة' : q}</span>`;
  const JD = v => `${R.n(Math.round(v))} د.أ`;
  const oaTag = r => r.oa === 2 ? '<span class="rs-tag ok"><i class="bi bi-gem"></i> ماسي: بلا رسوم</span>' : r.oa ? '<span class="rs-tag oa"><i class="bi bi-unlock-fill"></i> وصول مفتوح (غالباً برسوم)</span>' : '<span class="rs-tag"><i class="bi bi-lock"></i> اشتراك أو هجين</span>';
  function card(x, i) {
    const r = x.r, v = x.v, petra = HOME >= 0 && r.jo ? (r.jo.unis.find(u => u[0] === HOME) || [0, 0])[1] : 0, on = st.pick.includes(r.id);
    return `<article class="rs-pb-card${on ? ' on' : ''}">
      <div class="rs-pb-rank">${i + 1}</div>
      <div class="rs-pb-main">
        <div class="rs-pb-t"><a class="ltr" href="${R.sjrUrl(r.id)}" target="_blank" rel="noopener">${esc(r.t)}</a> ${qp(r.q)}</div>
        <div class="rs-pb-m"><span class="ltr">${esc(r.pub)}</span>${r.country ? ` · ${esc(r.country)}` : ''} · SJR <b>${(r.sjr || 0).toFixed(2)}</b>${r.h ? ` · h ${r.h}` : ''} ${oaTag(r)}</div>
        ${x.hit.length ? `<div class="rs-pb-why"><i class="bi bi-check2-circle"></i> يطابق: ${x.hit.slice(0, 8).map(w => `<span class="ltr">${esc(w)}</span>`).join('، ')}${x.cover ? ` <small>(${R.pct(x.cover)} من كلماتك)</small>` : ''}</div>` : ''}
        <div class="rs-pb-facts">
          <span title="من الاستلام إلى القبول (وسيط)"><i class="bi bi-hourglass-split"></i> ${r.tm && r.tm.accept != null ? `قرار خلال ~${R.n(r.tm.accept)} يوماً` : 'مدة القرار غير معروفة'}</span>
          <span><i class="bi bi-people"></i> ${r.jo ? `${R.n(r.jo.docs)} بحثاً أردنياً` : 'لا أبحاث أردنية'}</span>
          ${petra ? `<span class="me"><i class="bi bi-bank2"></i> ${R.n(petra)} من البترا</span>` : ''}</div>
      </div>
      <div class="rs-pb-val">
        <div class="money"><b>${JD(v.mine)}</b><small>حصتك من ${JD(v.total)}</small></div>
        <div><span>الترقية</span><b>فئة ${v.promo[0]} · ${v.promo[1]} ${v.promo[1] === 1 ? 'نقطة' : 'نقطتان'}</b></div>
        <div><span>الجائزة</span><b>${v.award} نقطة</b></div>
        <label class="rs-pb-pick no-print"><input type="checkbox" data-pick="${r.id}"${on ? ' checked' : ''}> للمقارنة</label>
      </div></article>`;
  }
  // the value of each quartile for this author position: the same for any journal of that quartile
  function summary(n) {
    R.$('#pb-sum').innerHTML = `<div class="rs-pb-qs">${['Q1', 'Q2', 'Q3', 'Q4', 'NA'].map(q => { const v = value(q);
      return `<div class="q-${q.toLowerCase()}"><div class="h">${qp(q)}</div><b>${JD(v.mine)}</b><small>دعم وحافز (حصتك)</small><span>ترقية: فئة ${v.promo[0]} · ${v.promo[1]} ن</span><span>جائزة: ${v.award} نقطة</span></div>`; }).join('')}</div>
      <p class="rs-note mt-2 mb-0">قيمة النشر حسب تصنيف المجلة، لباحث ترتيبه ${Math.min(st.n, st.me)} من ${st.n}${st.intl ? ' مع باحثين دوليين' : ''}. ${n == null ? '' : `<b>${R.n(n)}</b> مجلة مطابقة.`}</p>`;
  }
  function compare() {
    const box = R.$('#pb-cmp'), P = st.pick.map(id => byJ[id]).filter(Boolean);
    box.hidden = !P.length;
    if (!P.length) return;
    const v = P.map(r => value(r.q)), petra = r => HOME >= 0 && r.jo ? (r.jo.unis.find(u => u[0] === HOME) || [0, 0])[1] : 0;
    const best = (arr, hi = true) => { const ok = arr.filter(x => x != null); const m = hi ? Math.max(...ok) : Math.min(...ok); return arr.map(x => x != null && x === m && ok.length > 1); };
    const line = (label, vals, fmt, hi = true) => { const b = best(vals, hi); return `<tr><th>${label}</th>${vals.map((x, i) => `<td class="${b[i] ? 'best' : ''}">${fmt(x, i)}</td>`).join('')}</tr>`; };
    box.innerHTML = `<h3><i class="bi bi-layout-three-columns"></i>مقارنة المجلات المختارة <small class="fw-normal text-muted">الخلية الخضراء = الأفضل</small>
      <span class="ms-auto d-flex gap-2 no-print"><button class="btn btn-sm btn-rs-o" id="pb-clear"><i class="bi bi-x-lg"></i> مسح</button><button class="btn btn-sm btn-rs" onclick="print()"><i class="bi bi-printer"></i> التقرير</button></span></h3>
      <div class="rs-scroll full"><table class="rs-table rs-pb-ctable"><thead><tr><th></th>${P.map(r => `<th class="ltr">${esc(r.t)}</th>`).join('')}</tr></thead><tbody>
      ${line('التصنيف (SJR)', P.map(r => -QORD[r.q]), (x, i) => qp(P[i].q))}
      ${line('SJR', P.map(r => r.sjr), x => (x || 0).toFixed(2))}
      ${line('حصتك من الدعم والحافز', v.map(x => x.mine), x => JD(x))}
      ${line('فئة الترقية ونقاطها', v.map(x => x.promo[1] * 10 - x.promo[0]), (x, i) => `فئة ${v[i].promo[0]} · ${v[i].promo[1]}`)}
      ${line('نقاط جائزة الباحث المتميز', v.map(x => x.award), x => x)}
      ${line('مدة القرار (وسيط)', P.map(r => r.tm && r.tm.accept != null ? r.tm.accept : null), x => x == null ? '–' : `${R.n(x)} يوماً`, false)}
      ${line('النشر بعد القبول', P.map(r => r.tm && r.tm.publish != null ? r.tm.publish : null), x => x == null ? '–' : `${R.n(x)} يوماً`, false)}
      ${line('الوصول', P.map(r => r.oa === 2 ? 2 : r.oa ? 1 : 0), (x, i) => oaTag(P[i]))}
      ${line('أبحاث أردنية', P.map(r => r.jo ? r.jo.docs : 0), x => R.n(x))}
      ${line('أبحاث البترا', P.map(petra), x => R.n(x))}
      ${line('الناشر', P.map(() => null), (x, i) => `<span class="ltr">${esc(P[i].pub)}</span>`)}
      </tbody></table></div>`;
    R.$('#pb-clear').onclick = () => { st.pick = []; render(); };
  }
  let shown = 30;
  function render() {
    R.$$('#pb-min button').forEach(b => b.classList.toggle('on', b.dataset.v === st.min));
    R.$$('#pb-sort button').forEach(b => b.classList.toggle('on', b.dataset.v === st.sort));
    const res = words().length || st.area ? results() : null;
    summary(res ? res.length : null);
    compare();
    R.$('#pb-count').textContent = res ? `${R.n(res.length)} مجلة مطابقة` : '';
    R.$('#pb-out').innerHTML = !res ? `<div class="rs-empty"><i class="bi bi-signpost-split"></i>اكتب عنوان بحثك أو كلماته المفتاحية، أو اختر اسمك أو مجالاً، لتظهر المجلات المقترحة.</div>`
      : res.length ? res.slice(0, shown).map(card).join('') + (res.length > shown ? `<button class="btn btn-rs-o w-100 no-print" id="pb-more">عرض ${Math.min(30, res.length - shown)} أخرى</button>` : '')
        : `<div class="rs-empty"><i class="bi bi-search"></i>لا مجلات تطابق كلماتك بهذه الشروط. خفّف الشروط أو جرّب كلمات أعمّ.</div>`;
    const m = R.$('#pb-more'); if (m) m.onclick = () => { shown += 30; render(); };
    const u = new URL(location); [['q', st.q], ['area', st.area], ['id', st.rid], ['pick', st.pick.join(',')]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    history.replaceState(null, '', u);
  }
  const fromProfile = r => {
    st.rid = r.id;
    const t = (r.topics || []).slice(0, 4).map(x => x[0]).join(' ');
    st.q = t || r.spec_en || ''; R.$('#pb-q').value = st.q;
    R.$('#pb-who-h').textContent = t ? 'استُخدمت مواضيع أبحاثك؛ عدّلها حسب بحثك الجديد' : '';
    const f = (r.topics || [])[0]; if (f && J.areas.includes(f[1]) && !st.area) { st.area = f[1]; R.$('#pb-area').value = st.area; }
  };
  if (st.rid && byId[st.rid] && !st.q) { R.$('#pb-who').value = byId[st.rid].name; fromProfile(byId[st.rid]); }
  render();
  const go = R.debounce(() => { shown = 30; render(); }, 300);
  R.$('#pb-q').addEventListener('input', e => { st.q = e.target.value; go(); });
  R.$('#pb-who').addEventListener('change', e => { const r = list.find(x => x.name === e.target.value.trim()); if (r) { fromProfile(r); render(); } });
  R.$('#pb-area').onchange = e => { st.area = e.target.value; render(); };
  R.$('#pb-oa').onchange = e => { st.oa = e.target.value; render(); };
  R.$('#pb-fast').onchange = e => { st.fast = e.target.checked; render(); };
  R.$('#pb-intl').onchange = e => { st.intl = e.target.checked; render(); };
  R.$('#pb-n').onchange = e => { st.n = Math.max(1, +e.target.value || 1); if (st.me > st.n) { st.me = st.n; R.$('#pb-me').value = st.me; } render(); };
  R.$('#pb-me').onchange = e => { st.me = Math.min(st.n, Math.max(1, +e.target.value || 1)); e.target.value = st.me; render(); };
  R.$('#pb-min').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.min = b.dataset.v; render(); } };
  R.$('#pb-sort').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.sort = b.dataset.v; render(); } };
  R.$('#pb-out').addEventListener('change', e => { const id = e.target.dataset.pick; if (!id) return;
    if (e.target.checked) { if (st.pick.length >= 4) { e.target.checked = false; alert('يمكن مقارنة 4 مجلات كحد أقصى.'); return; } st.pick.push(id); } else st.pick = st.pick.filter(x => x !== id);
    render(); });
})();
