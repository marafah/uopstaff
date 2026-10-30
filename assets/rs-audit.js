/* audit.html «تدقيق النزاهة البحثية»: a fair, multi-criteria review of one researcher or a research group.
   - one researcher: all their output; a group (2+): the papers they share (all of them together, or any two)
   - criteria, each against the university's own distribution (median / top 10%): retractions, journals discontinued
     by Scopus, venue quality (SJR quartile), concentration in one venue, concentration on one partner, bursts,
     very high yearly output; plus positive context (Q1–Q2, field-weighted citations, international co-authors)
   - every signal links to the papers behind it; nothing is a verdict: the page says what deserves a closer look
   - «مسح شامل»: ranks researchers or pairs by the same signals to find where to look first
   Deep links: ?ids=<id>,<id>&m=all|any&from=&to=&v=group|scan&s=people|pairs */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wd;
  try { [data, wd] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  let I = null; try { I = await R.load('integrity'); } catch (e) { /* retractions optional */ }
  let FL = null; try { FL = await R.scopusFlags(); } catch (e) { /* Scopus source list optional */ }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, W = wd.works || [], NOW = new Date().getFullYear();
  const P = new URLSearchParams(location.search);
  const AU = { ids: (P.get('ids') || '').split(',').filter(id => byId[id]), mode: P.get('m') === 'any' ? 'any' : 'all', view: P.get('v') === 'scan' ? 'scan' : 'group',
    scanOf: P.get('s') === 'pairs' ? 'pairs' : 'people', pf: 'all', tab: ['crit', 'mix', 'people', 'ret', 'venues', 'papers'].includes(P.get('t')) ? P.get('t') : 'crit', only: true, from: +P.get('from') || 0, to: +P.get('to') || 0 };

  // ---------------------------------------------------------------- data preparation
  const PTYPE = [['article', 'مقالة مجلة', 'bi-journal-text', '#0b4a66'], ['conf', 'ورقة مؤتمر', 'bi-easel2', '#901d23'], ['chapter', 'فصل كتاب', 'bi-book-half', '#0f766e'],
    ['review', 'مراجعة', 'bi-search', '#6a2fb0'], ['book', 'كتاب', 'bi-book', '#b45309'], ['other', 'أخرى', 'bi-three-dots', '#64748b']];
  const PT = Object.fromEntries(PTYPE.map(x => [x[0], x]));
  const ptype = w => { const t = String(w.type || '').toLowerCase(), st = String(w.st || '').toLowerCase();
    if (/conference|proceeding/.test(t) || /conference/.test(st) || w.vt === 'conference') return 'conf';
    if (/chapter/.test(t)) return 'chapter'; if (t === 'book') return 'book'; if (t === 'review' || st === 'review') return 'review';
    if (t === 'article' || /article/.test(st)) return 'article'; return 'other'; };
  const QCOL = { Q1: '#15803d', Q2: '#0f766e', Q3: '#b45309', Q4: '#b91c1c', nr: '#64748b', conf: '#901d23', x: '#cbd5e1' };
  const QLBL = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', nr: 'مجلة غير مصنّفة', conf: 'مؤتمر', x: 'أخرى' };
  const QORD = ['Q1', 'Q2', 'Q3', 'Q4', 'nr', 'conf', 'x'];
  const RET = { byDoi: {}, byEid: {}, byP: {}, G: {}, RAR: (I && I.reason_ar) || {} };
  if (I) {
    (I.reason_groups || []).forEach(([k, a, i]) => { RET.G[k] = { a, i }; });
    (I.papers || []).concat(I.rw_only || []).forEach(p => {
      if (p.doi) RET.byDoi[String(p.doi).toLowerCase()] = p; if (p.eid) RET.byEid[p.eid] = p;
      (p.au || []).forEach(a => { if (a && a.p && byId[a.p]) (RET.byP[a.p] = RET.byP[a.p] || []).push(p); });
    });
  }
  const BY = {};
  W.forEach(w => {
    w._pt = ptype(w);
    w._ret = (w.doi && RET.byDoi[String(w.doi).toLowerCase()]) || (w.eid && RET.byEid[w.eid]) || null;
    const jour = w._pt === 'article' || w._pt === 'review';
    const f = FL && jour && (w.issn || w.v) ? FL.find(String(w.issn || '').split(/[\s,;]+/).filter(Boolean), w.v) : null;
    const v = f ? FL.verdict(f, w.y) : null;
    w._disc = v && v[3] ? (v[2] === 'bad' ? 'after' : 'later') : null;
    w._discEnd = f ? (f.end || '') : '';
    w._qq = w._pt === 'conf' ? 'conf' : (w.q || (jour ? 'nr' : 'x'));
    w._jo = (w.r || []).filter(id => byId[id]);
    w._jo.forEach(id => (BY[id] = BY[id] || []).push(w));
  });
  // retracted papers listed under a university author but missing from the works file still count for that person
  const retOf = id => { const s = new Map(); (BY[id] || []).forEach(w => { if (w._ret) s.set(w._ret, w); }); (RET.byP[id] || []).forEach(p => { if (!s.has(p)) s.set(p, null); }); return [...s.keys()]; };
  const ys = W.map(w => w.y).filter(Boolean), Y0 = Math.max(1990, Math.min(...ys)), Y1 = Math.max(...ys, NOW);
  const inY = w => { const a = AU.from || 0, b = AU.to || 9999; return !w.y || (w.y >= a && w.y <= b); };
  const isJ = w => ['Q1', 'Q2', 'Q3', 'Q4', 'nr'].includes(w._qq);

  // ---------------------------------------------------------------- the works under review
  function scope(ids, mode) {
    if (ids.length === 1) return (BY[ids[0]] || []).filter(inY).sort((a, b) => (b.y || 0) - (a.y || 0));
    const seen = new Map();
    ids.forEach(id => (BY[id] || []).forEach(w => { if (!inY(w)) return; seen.set(w, (seen.get(w) || 0) + 1); }));
    return [...seen.entries()].filter(([, c]) => mode === 'all' ? c === ids.length : c >= 2).map(([w]) => w).sort((a, b) => (b.y || 0) - (a.y || 0));
  }
  // measurable criteria for a set of works (+ the people behind them)
  function measure(ws, ids) {
    const n = ws.length, jr = ws.filter(isJ), hi = jr.filter(w => w._qq === 'Q1' || w._qq === 'Q2'), low = jr.filter(w => ['Q3', 'Q4', 'nr'].includes(w._qq));
    const vc = {}; ws.forEach(w => { if (w.v) vc[w.v] = (vc[w.v] || 0) + 1; });
    const tv = Object.entries(vc).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const yc = {}; ws.forEach(w => { if (w.y) yc[w.y] = (yc[w.y] || 0) + 1; });
    const yv = Object.values(yc), med = R.median(yv) || 0, my = Object.entries(yc).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const vy = {}; ws.forEach(w => { if (w.v && w.y) { const k = w.v + '|' + w.y; vy[k] = (vy[k] || 0) + 1; } });
    const cl = Object.entries(vy).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    // partner concentration (one researcher): share of their output with their most frequent university co-author
    let tp = ['', 0];
    if (ids.length === 1) { const pc = {}; ws.forEach(w => w._jo.forEach(o => { if (o !== ids[0]) pc[o] = (pc[o] || 0) + 1; })); tp = Object.entries(pc).sort((a, b) => b[1] - a[1])[0] || ['', 0]; }
    const ret = new Set(ws.filter(w => w._ret).map(w => w._ret));
    if (ids.length === 1) retOf(ids[0]).forEach(p => { if (!p.y || inY(p)) ret.add(p); });
    else ids.forEach(id => (RET.byP[id] || []).forEach(p => { if ((p.au || []).filter(a => a.p && ids.includes(a.p)).length >= 2 && (!p.y || inY(p))) ret.add(p); }));
    const isConf = v => { const vw = ws.filter(w => w.v === v); return vw.length > 0 && vw.filter(w => ['conf', 'chapter', 'book'].includes(w._pt)).length >= vw.length / 2; };   // conference proceedings and book series
    const fw = ws.map(w => w.fwci).filter(x => x != null);
    return { n, jr: jr.length, hi: hi.length, low: low.length, hiS: jr.length ? hi.length / jr.length : null, lowS: jr.length ? low.length / jr.length : null,
      da: ws.filter(w => w._disc === 'after').length, dl: ws.filter(w => w._disc === 'later').length,
      tv, tvS: n ? tv[1] / n : 0, my, med, burst: med ? my[1] / med : 0, cl, tp, tpS: n ? tp[1] / n : 0, ret: [...ret],
      fw: fw.length ? R.median(fw) : null, intl: n ? ws.filter(w => (w.cc || []).some(c => c !== 'JO')).length / n : null,
      conf: ws.filter(w => w._qq === 'conf').length, maxY: my[1], tvC: isConf(tv[0]), clC: cl[0] ? isConf(cl[0].split('|')[0]) : false };
  }
  // the university's own distribution of each criterion (researchers with 10+ works in the period)
  let BASE = null, BASEKEY = '';
  function base() {
    const k = AU.from + '|' + AU.to; if (BASE && BASEKEY === k) return BASE;
    const M = list.map(r => (BY[r.id] || []).filter(inY)).map((ws, i) => [ws, list[i].id]).filter(([ws]) => ws.length >= 10).map(([ws, id]) => measure(ws, [id]));
    const q = (key, p) => { const a = M.map(m => m[key]).filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : null; };
    const dS = M.map(m => m.jr ? m.da / m.jr : 0).sort((x, y) => x - y);
    BASE = { n: M.length, hiS: [q('hiS', .5), q('hiS', .1)], lowS: [q('lowS', .5), q('lowS', .9)], tvS: [q('tvS', .5), q('tvS', .9)], tpS: [q('tpS', .5), q('tpS', .9)],
      burst: [q('burst', .5), q('burst', .9)], maxY: [q('maxY', .5), q('maxY', .9)], fw: [q('fw', .5), q('fw', .9)], intl: [q('intl', .5), q('intl', .9)],
      dS: [dS[Math.floor(dS.length * .5)] || 0, dS[Math.floor(dS.length * .9)] || 0] };
    BASEKEY = k; return BASE;
  }
  // scorecard rows: [key, icon, criterion, value text, university reference, level 0 ok / 1 review / 2 concern / -1 positive, explanation, paper filter]
  function scorecard(m, ids) {
    const B = base(), single = ids.length === 1, rows = [];
    const lv = (v, p90, hard) => v == null ? 0 : (hard != null && v >= hard ? 2 : (p90 != null && v > p90 ? 1 : 0));
    rows.push(['ret', 'bi-x-octagon', 'الأبحاث المسحوبة', R.n(m.ret.length), 'المعتاد: صفر', m.ret.length ? 2 : 0, m.ret.length ? 'سحبت المجلة أو الناشر بحثاً واحداً على الأقل؛ الأسباب في قسم «الأبحاث المسحوبة».' : 'لا أبحاث مسحوبة مسجلة في Scopus أو Retraction Watch.', 'ret']);
    const dS = m.jr ? m.da / m.jr : 0;
    rows.push(['da', 'bi-journal-x', 'النشر في مجلات بعد حذفها من Scopus', `${R.n(m.da)}${m.jr ? ` (${R.pct(dS)})` : ''}`, `الوسيط ${R.pct(B.dS[0])} · أعلى 10% ${R.pct(B.dS[1])}`, m.da >= 3 || dS >= .2 ? 2 : m.da ? 1 : 0, 'مجلات حذفها Scopus قبل نشر البحث فيها (لأسباب الجودة أو أخلاقيات النشر عادة).', 'disc']);
    rows.push(['dl', 'bi-journal-minus', 'مجلات حذفها Scopus لاحقاً', R.n(m.dl), 'مؤشر سياقي', m.n && m.dl / m.n >= .3 ? 1 : 0, 'نُشرت قبل الحذف فتبقى مفهرسة، لكن كثرتها تدل على اختيار مجلات ضعيفة.', 'disc']);
    rows.push(['low', 'bi-bar-chart-steps', 'المقالات في Q3–Q4 أو غير مصنّفة', m.lowS == null ? '–' : `${R.pct(m.lowS)} (${m.low} من ${m.jr})`, `الوسيط ${R.pct(B.lowS[0])} · أعلى 10% ${R.pct(B.lowS[1])}`, m.jr >= 4 ? lv(m.lowS, B.lowS[1], .9) : 0, 'نسبة مقالات المجلات في الربعين الأدنى أو في مجلات بلا تصنيف SJR.', 'low']);
    rows.push(['tv', 'bi-bullseye', 'التركّز في وعاء نشر واحد', m.tv[1] ? `${R.pct(m.tvS)} · ${m.tv[1]} بحثاً في: ${m.tv[0]}` : '–', `الوسيط ${R.pct(B.tvS[0])} · أعلى 10% ${R.pct(B.tvS[1])}`, m.n >= 5 ? Math.min(m.tvC ? 1 : 2, lv(m.tvS, B.tvS[1], .5)) : 0, m.tvC ? 'حصة أكثر وعاء تكراراً، وهو مؤتمر أو سلسلة كتب: تكرار المشاركة فيها شائع (خاصة إذا نظّمتها الجامعة)، فيُعرض للمراجعة فقط.' : 'حصة أكثر مجلة تكراراً؛ التركّز الشديد في مجلة واحدة قد يعني علاقة تحريرية أو أعداداً خاصة.', m.tv[0] ? 'v:' + m.tv[0] : '']);
    rows.push(['cl', 'bi-collection', 'أبحاث في الوعاء نفسه والسنة نفسها', m.cl[1] ? `${m.cl[1]} سنة ${m.cl[0].split('|')[1]} في: ${m.cl[0].split('|')[0]}` : '–', 'المعتاد: 1–2', m.clC ? (m.cl[1] >= 3 ? 1 : 0) : (m.cl[1] >= 5 ? 2 : m.cl[1] >= 3 ? 1 : 0), m.clC ? 'عدة أوراق في دورة واحدة من مؤتمر أو مجلد واحد من سلسلة كتب؛ يحدث عند المشاركة المكثفة أو التنظيم، فيُعرض للمراجعة فقط.' : 'عدة أبحاث في مجلة واحدة خلال سنة واحدة (قد يكون عدداً خاصاً).', m.cl[1] ? 'vy:' + m.cl[0] : '']);
    if (single) rows.push(['tp', 'bi-people', 'الاعتماد على شريك واحد', m.tp[1] ? `${R.pct(m.tpS)} مع ${byId[m.tp[0]] ? byId[m.tp[0]].name : ''}` : 'لا شركاء من الجامعة', `الوسيط ${R.pct(B.tpS[0])} · أعلى 10% ${R.pct(B.tpS[1])}`, m.n >= 8 ? lv(m.tpS, B.tpS[1], .85) : 0, 'حصة الإنتاج المشترك مع أكثر زميل من الجامعة. اضغط اسمه في جدول الشركاء لتدقيق الثنائي.', '']);
    rows.push(['burst', 'bi-graph-up-arrow', 'قفزة إنتاجية في سنة واحدة', m.my[1] ? `${m.my[1]} سنة ${m.my[0]} (${m.burst.toFixed(1)}× الوسيط)` : '–', `أعلى 10% ${B.burst[1] ? B.burst[1].toFixed(1) + '×' : '–'}`, m.my[1] >= 6 ? (m.burst >= 5 && m.my[1] >= 20 ? 2 : (m.burst > Math.max(2.5, B.burst[1] || 0) ? 1 : 0)) : 0, 'أعلى سنة مقارنة بالوسيط السنوي في الفترة.', m.my[0] ? 'y:' + m.my[0] : '']);
    if (single) rows.push(['maxY', 'bi-lightning-charge', 'أعلى إنتاج في سنة واحدة', R.n(m.maxY), `الوسيط ${R.n(B.maxY[0])} · أعلى 10% ${R.n(B.maxY[1])}`, lv(m.maxY, Math.max(15, B.maxY[1] || 0), 40), 'عدد المنشورات في أكثر سنة إنتاجاً؛ الأعداد الكبيرة جداً تستحق النظر في مساهمة الباحث.', m.my[0] ? 'y:' + m.my[0] : '']);
    // positive context (fairness): quality and impact
    rows.push(['hi', 'bi-award', 'المقالات في Q1–Q2', m.hiS == null ? '–' : `${R.pct(m.hiS)} (${m.hi} من ${m.jr})`, `الوسيط ${R.pct(B.hiS[0])}`, m.hiS != null && B.hiS[0] != null && m.hiS >= B.hiS[0] ? -1 : 0, 'عامل إيجابي: حصة المقالات في المجلات الأعلى تصنيفاً.', 'hi']);
    rows.push(['fw', 'bi-graph-up', 'الأثر الموزون (FWCI، الوسيط)', m.fw == null ? '–' : m.fw.toFixed(2), `وسيط الجامعة ${B.fw[0] != null ? B.fw[0].toFixed(2) : '–'}`, m.fw != null && B.fw[0] != null && m.fw >= B.fw[0] ? -1 : 0, 'عامل إيجابي: اقتباسات الأبحاث مقارنة بالمتوسط العالمي لمجالها (1 = المتوسط).', '']);
    rows.push(['intl', 'bi-globe2', 'أبحاث مع مؤلفين من خارج الأردن', m.intl == null ? '–' : R.pct(m.intl), `وسيط الجامعة ${R.pct(B.intl[0])}`, m.intl != null && B.intl[0] != null && m.intl >= B.intl[0] ? -1 : 0, 'عامل إيجابي: التعاون الدولي.', '']);
    return rows;
  }
  const scoreOf = rows => R.sum(rows.map(r => r[5] === 2 ? (r[0] === 'ret' ? 6 : r[0] === 'da' ? 4 : 2.5) : r[5] === 1 ? 1 : 0));
  const level = s => s >= 6 ? ['high', 'يستحق مراجعة عاجلة', 'bi-shield-fill-exclamation'] : s >= 3 ? ['mid', 'يستحق المراجعة', 'bi-shield-fill-minus'] : s > 0 ? ['low', 'ملاحظات بسيطة', 'bi-shield-fill-check'] : ['ok', 'لا مؤشرات تنبيه', 'bi-shield-fill-check'];
  const LV = { 2: ['c', 'مرتفع'], 1: ['r', 'للمراجعة'], 0: ['o', 'ضمن المعتاد'], '-1': ['p', 'إيجابي'] };


  // ---------------------------------------------------------------- print report: identification block and sign-off
  const today = () => new Date().toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  const perTxt = () => AU.from || AU.to ? `${AU.from || 'البداية'} – ${AU.to || 'الآن'}` : 'كل السنوات المتاحة';
  function printMeta(rows, lvl) {
    return `<section class="rs-print-only na-pmeta"><table><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
      ${lvl ? `<div class="na-pres na-${lvl[0]}"><small>النتيجة</small><b>${lvl[1]}</b></div>` : ''}</section>`;
  }
  function printSign() {
    return `<section class="rs-print-only na-psign">
      <h4>منهجية التدقيق</h4>
      <p>يقارن كل معيار قيمة الباحث أو المجموعة بتوزيع باحثي جامعة البترا أنفسهم في الفترة نفسها: «للمراجعة» تعني أن القيمة أعلى من 90% من الباحثين، و«مرتفع» تعني تجاوز حدّ واضح (مثل بحث مسحوب أو نشر في مجلة محذوفة من Scopus وقت النشر). المصادر: Scopus وOpenAlex وWeb of Science، وقاعدة Retraction Watch، وقائمة مصادر Scopus الرسمية، وتصنيف SJR. المؤشرات أدوات فرز لا أحكام، ولا تُغني عن الاطلاع على الأبحاث وسياق التخصص.</p>
      <h4>ملاحظات اللجنة</h4><div class="na-lines"><i></i><i></i><i></i></div>
      <div class="na-sigs3"><div><span>أعدّه</span><i></i><small>الاسم والتوقيع</small></div><div><span>راجعه</span><i></i><small>الاسم والتوقيع</small></div><div><span>اعتمده</span><i></i><small>رئيس اللجنة · التاريخ</small></div></div>
    </section>`;
  }

  // ---------------------------------------------------------------- page
  const yOpt = (v, first) => `<option value="">${first}</option>` + Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y1 - i).map(y => `<option${y === v ? ' selected' : ''}>${y}</option>`).join('');
  app.innerHTML = `
  <section class="rs-section na-bar no-print">
    <div class="na-pick"><div class="na-chips" id="na-chips"></div><div class="na-in"><i class="bi bi-person-plus"></i><input id="na-q" class="form-control" type="search" placeholder="أضف باحثاً: اكتب جزءاً من الاسم (باحث واحد لتدقيق فردي، أو أكثر لتدقيق مجموعة)…" autocomplete="off" aria-label="أضف باحثاً"><div class="na-dd" id="na-dd" hidden></div></div></div>
    <div class="na-opts">
      <div class="rs-seg na-seg" id="na-view"><button type="button" data-v="group"><i class="bi bi-person-check"></i> تدقيق باحث أو مجموعة</button><button type="button" data-v="scan"><i class="bi bi-radar"></i> مسح شامل</button></div>
      <div class="rs-seg na-seg" id="na-mode" title="أي الأبحاث تُدقَّق للمجموعة"><button type="button" data-m="all">المشتركة بين الجميع</button><button type="button" data-m="any">بين أي اثنين</button></div>
      <div class="rs-seg na-seg" id="na-sof"><button type="button" data-s="people">الباحثون</button><button type="button" data-s="pairs">الثنائيات</button></div>
      <label class="na-per"><span>الفترة</span><select id="na-from" class="form-select" aria-label="من سنة">${yOpt(AU.from, 'من البداية')}</select><b>–</b><select id="na-to" class="form-select" aria-label="إلى سنة">${yOpt(AU.to, 'حتى الآن')}</select></label>
      <span class="na-acts"><button type="button" class="na-ib" id="na-csv" title="تصدير CSV"><i class="bi bi-filetype-csv"></i><span>تصدير</span></button><button type="button" class="na-ib" onclick="print()" title="طباعة"><i class="bi bi-printer"></i><span>طباعة</span></button></span>
    </div>
  </section>
  <div id="na-body"></div>`;

  const who = r => `<a href="${R.profileUrl(r)}" class="np-n">${esc(r.name)}</a><span class="rs-fdot" style="--fc:${R.facColor(r.faculty)}">${esc(r.faculty || '')}</span>`;
  function url() {
    const p = new URLSearchParams();
    if (AU.ids.length) p.set('ids', AU.ids.join(',')); if (AU.mode === 'any') p.set('m', 'any'); if (AU.view === 'scan') { p.set('v', 'scan'); if (AU.scanOf === 'pairs') p.set('s', 'pairs'); }
    if (AU.from) p.set('from', AU.from); if (AU.to) p.set('to', AU.to); if (AU.view !== 'scan' && AU.tab !== 'crit') p.set('t', AU.tab);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }
  function chips() {
    R.$('#na-chips').innerHTML = AU.ids.map(id => `<span class="na-chip">${R.avatar(byId[id], 'sm')}<span>${esc(byId[id].name)}</span><button type="button" data-rm="${id}" title="إزالة" aria-label="إزالة"><i class="bi bi-x"></i></button></span>`).join('')
      || '<span class="na-hint"><i class="bi bi-info-circle"></i> اختر باحثاً لتدقيق إنتاجه كله، أو أكثر من باحث لتدقيق أبحاثهم المشتركة.</span>';
  }
  function suggest(q) {
    const dd = R.$('#na-dd'); q = R.norm(q); let rows;
    if (!q && AU.ids.length) {
      const pc = {}; AU.ids.forEach(id => (BY[id] || []).filter(inY).forEach(w => w._jo.forEach(o => { if (!AU.ids.includes(o)) pc[o] = (pc[o] || 0) + 1; })));
      rows = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, c]) => [byId[id], `${c} بحثاً مشتركاً · شريك مقترح`]);
    } else rows = q.length < 2 ? [] : list.filter(r => !AU.ids.includes(r.id) && r._q.includes(q)).slice(0, 10).map(r => [r, `${r.faculty || ''} · ${R.n((BY[r.id] || []).length)} منشوراً`]);
    dd.innerHTML = rows.map(([r, s]) => `<button type="button" data-add="${r.id}">${R.avatar(r, 'sm')}<span><b>${esc(r.name)}</b><small>${esc(s)}</small></span></button>`).join('');
    dd.hidden = !rows.length;
  }
  function render() {
    R.$$('#na-view button').forEach(b => b.classList.toggle('on', b.dataset.v === AU.view));
    R.$$('#na-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === AU.mode));
    R.$$('#na-sof button').forEach(b => b.classList.toggle('on', b.dataset.s === AU.scanOf));
    R.$('#na-mode').hidden = AU.view === 'scan' || AU.ids.length < 2;
    R.$('#na-sof').hidden = AU.view !== 'scan';
    R.$('.na-pick').hidden = AU.view === 'scan';
    chips(); url();
    if (AU.view === 'scan') return scan();
    if (!AU.ids.length) return empty();
    group();
  }
  function empty() {
    R.$('#na-body').innerHTML = `<section class="rs-card na-empty"><i class="bi bi-shield-check"></i><b>تدقيق النزاهة البحثية</b>
      <span>تحليل منظّم وعادل لإنتاج باحث أو مجموعة بحثية على عدة معايير، كل معيار مقارن بتوزيع الجامعة نفسها:</span>
      <ul class="na-crit">${[['bi-x-octagon', 'الأبحاث المسحوبة وأسبابها'], ['bi-journal-x', 'النشر في مجلات حذفها Scopus'], ['bi-bar-chart-steps', 'جودة الأوعية وتصنيفها (Q1–Q4)'], ['bi-bullseye', 'التركّز في مجلة أو مؤتمر واحد'], ['bi-people', 'الاعتماد على شريك واحد'], ['bi-graph-up-arrow', 'القفزات الإنتاجية والإنتاج المرتفع جداً'], ['bi-award', 'عوامل إيجابية: Q1–Q2 والأثر والتعاون الدولي']].map(([i, t]) => `<li><i class="bi ${i}"></i>${t}</li>`).join('')}</ul>
      <div class="na-start"><span>ابدأ بإضافة باحث من الحقل أعلاه، أو</span><button type="button" class="na-go" data-v="scan"><i class="bi bi-radar"></i> مسح شامل لاكتشاف ما يستحق المراجعة</button></div></section>`;
  }

  function group() {
    const ids = AU.ids, single = ids.length === 1, ws = scope(ids, AU.mode), n = ws.length, m = measure(ws, ids), sc = scorecard(m, ids), s = scoreOf(sc), lvl = level(s);
    const B = base();
    const yy = ws.map(w => w.y).filter(Boolean), sp = yy.length ? [Math.min(...yy), Math.max(...yy)] : null;
    const tc = {}, qc = {}; ws.forEach(w => { tc[w._pt] = (tc[w._pt] || 0) + 1; qc[w._qq] = (qc[w._qq] || 0) + 1; });
    const vc = {}; ws.forEach(w => { if (!w.v) return; const o = vc[w.v] = vc[w.v] || { v: w.v, n: 0, k: w._pt, q: null, d: null, de: '', y0: 9999, y1: 0, r: 0 }; o.n++; if (w.q && (!o.q || w.q < o.q)) o.q = w.q; if (w._disc) { o.d = o.d === 'after' ? 'after' : w._disc; o.de = w._discEnd; } if (w._ret) o.r++; if (w.y) { o.y0 = Math.min(o.y0, w.y); o.y1 = Math.max(o.y1, w.y); } });
    const venues = Object.values(vc).sort((a, b) => b.n - a.n);
    const yrs = sp ? Array.from({ length: sp[1] - sp[0] + 1 }, (_, i) => sp[0] + i) : [];
    const yq = {}; ws.forEach(w => { if (!w.y) return; const o = yq[w.y] = yq[w.y] || {}; o[w._qq] = (o[w._qq] || 0) + 1; });
    const ymax = Math.max(1, ...yrs.map(y => R.sum(Object.values(yq[y] || {}))));
    const flagged = sc.filter(r => r[5] > 0), positives = sc.filter(r => r[5] === -1);
    if (AU.tab === 'ret' && !m.ret.length) AU.tab = 'crit';
    // people table: the members (group) or the partners (single researcher)
    let people;
    if (single) {
      const pc = {}; ws.forEach(w => w._jo.forEach(o => { if (o !== ids[0]) (pc[o] = pc[o] || []).push(w); }));
      people = Object.entries(pc).sort((a, b) => b[1].length - a[1].length).slice(0, 15).map(([id, pw]) => { const pm = measure(pw, [ids[0], id]); return { r: byId[id], s: pw.length, t: (BY[id] || []).filter(inY).length, sh: pw.length / n, hi: pm.hiS, da: pm.da, ret: pm.ret.length, sc: scoreOf(scorecard(pm, [ids[0], id])) }; });
    } else people = ids.map(id => { const all = (BY[id] || []).filter(inY), mm = measure(all, [id]); return { r: byId[id], t: all.length, s: ws.filter(w => (w.r || []).includes(id)).length, hi: mm.hiS, da: mm.da, ret: mm.ret.length, sc: scoreOf(scorecard(mm, [id])) }; });
    const per = AU.from || AU.to ? `${AU.from || 'البداية'}–${AU.to || 'الآن'}` : 'كل السنوات';
    R.$('#na-body').innerHTML = `
    ${printMeta([['موضوع التدقيق', ids.map(id => `<b>${esc(byId[id].name)}</b> <small>${esc(byId[id].faculty || '')}${byId[id].dept ? ' · ' + esc(byId[id].dept) : ''}</small>`).join('<br>')],
      ['نوع التدقيق', single ? 'تدقيق فردي لكل إنتاج الباحث' : `تدقيق مجموعة من ${ids.length} · ${AU.mode === 'all' ? 'الأبحاث المشتركة بين الجميع' : 'الأبحاث التي تجمع اثنين منهم أو أكثر'}`],
      ['الفترة', perTxt()], ['الأبحاث المدقّقة', n ? `${R.n(n)}${sp ? ` (${sp[0]}–${sp[1]})` : ''}` : 'لا أبحاث'], ['تاريخ الإعداد', today()]], lvl)}
    <section class="na-head na-${lvl[0]}">
      <div class="na-risk"><i class="bi ${lvl[2]}"></i><div><small>النتيجة</small><b>${lvl[1]}</b></div></div>
      <div class="na-sum"><b>${single ? 'تدقيق فردي' : `تدقيق مجموعة من ${ids.length}`} · ${per}</b>
        <span>${n ? `${R.n(n)} ${single ? 'منشوراً' : AU.mode === 'all' ? 'بحثاً يشترك فيه الجميع' : 'بحثاً يجمع اثنين منهم على الأقل'}${sp ? ` (${sp[0] === sp[1] ? sp[0] : sp[0] + '–' + sp[1]})` : ''} · ${flagged.length ? `${flagged.length} ${flagged.length === 1 ? 'معيار يستحق' : 'معايير تستحق'} المراجعة` : 'كل المعايير ضمن المعتاد'}${positives.length ? ` · ${positives.length} عوامل إيجابية` : ''}` : 'لا أبحاث بهذه الشروط.'}</span>
        <em>المقارنة مع ${R.n(B.n)} باحثاً من الجامعة لهم 10 منشورات أو أكثر في الفترة نفسها.</em></div>
      <div class="na-meter" title="مجموع نقاط التنبيه: ${s.toFixed(1)}"><span style="width:${Math.min(100, s / 12 * 100)}%"></span></div>
    </section>
    ${n ? `
    <section class="na-kpis">${[['bi-files', R.n(n), single ? 'منشوراً' : 'بحثاً مشتركاً', 'n'], ['bi-calendar-range', sp ? (sp[0] === sp[1] ? sp[0] : `<bdi dir="ltr">${sp[0]}–${sp[1]}</bdi>`) : '–', sp ? `الفترة · ${sp[1] - sp[0] + 1} سنة` : 'الفترة', 'n'],
      ['bi-journal-bookmark', R.n(venues.length), 'مجلة / مؤتمر', 'n'], ['bi-award', m.hiS == null ? '–' : R.pct(m.hiS), 'من المقالات في <bdi dir="ltr">Q1–Q2</bdi>', 't'],
      ['bi-journal-x', R.n(m.da), 'في مجلات محذوفة وقت النشر', m.da ? 'w' : 't'], ['bi-x-octagon', R.n(m.ret.length), 'مسحوبة', m.ret.length ? 'm' : 't'],
      ['bi-quote', R.n(R.sum(ws.map(w => w.sc ?? w.c ?? 0))), 'استشهاداً', 'n']].map(k => `<div class="na-k ${k[3]}"><i class="bi ${k[0]}"></i><b>${k[1]}</b><span>${k[2]}</span></div>`).join('')}</section>

    <nav class="na-tabs no-print" id="na-tabs">${[['crit', 'bi-clipboard2-check', 'معايير التدقيق', flagged.length || ''], ['mix', 'bi-pie-chart', 'النوع والجودة', ''], ['people', 'bi-people', single ? 'الشركاء' : 'الأعضاء', people.length], ['ret', 'bi-x-octagon', 'المسحوبة', m.ret.length], ['venues', 'bi-journal-bookmark', 'أوعية النشر', venues.length], ['papers', 'bi-files', single ? 'المنشورات' : 'الأبحاث المشتركة', n]].filter(t => t[0] !== 'ret' || m.ret.length).map(t => `<button type="button" data-nt="${t[0]}" class="${AU.tab === t[0] ? 'on' : ''}${t[0] === 'crit' && flagged.length ? ' warn' : ''}${t[0] === 'ret' ? ' bad' : ''}"><i class="bi ${t[1]}"></i>${t[2]}${t[3] !== '' ? `<b>${t[3]}</b>` : ''}</button>`).join('')}</nav>
    <div class="na-tab" data-nt="crit"${AU.tab === 'crit' ? '' : ' hidden'}>
    <section class="rs-card na-sec"><h3><i class="bi bi-clipboard2-check"></i>معايير التدقيق <small class="fw-normal text-muted">كل معيار مقارن بتوزيع باحثي الجامعة في الفترة نفسها</small></h3>
      <div class="rs-scroll"><table class="rs-table na-t na-sc"><thead><tr><th>المعيار</th><th>القيمة</th><th>مرجع الجامعة</th><th>التقييم</th><th>التوضيح</th></tr></thead><tbody>
      ${sc.map(r => `<tr class="l${LV[r[5]][0]}"><td><i class="bi ${r[1]}"></i> <b>${r[2]}</b></td><td>${r[7] ? `<button type="button" class="na-lnk" data-pf="${esc(r[7])}">${esc(r[3])}</button>` : esc(r[3])}</td><td class="small text-muted">${esc(r[4])}</td><td><span class="na-lv ${LV[r[5]][0]}">${LV[r[5]][1]}</span></td><td class="small">${esc(r[6])}</td></tr>`).join('')}</tbody></table></div>
      <p class="rs-note mb-0 mt-2"><i class="bi bi-info-circle"></i> المعايير أدوات فرز لا أحكام: «للمراجعة» تعني أن القيمة أعلى من 90% من باحثي الجامعة، و«مرتفع» تعني تجاوز حدّ واضح (مثل بحث مسحوب). القرار يعود للجنة المختصة بعد الاطلاع على الأبحاث وسياق التخصص؛ فبعض التخصصات تنشر عادة في مؤتمرات أو مجلات محلية.</p></section>
    </div>
    <div class="na-tab" data-nt="mix"${AU.tab === 'mix' ? '' : ' hidden'}>
    <section class="na-grid">
      <div class="rs-card na-mix"><h3><i class="bi bi-pie-chart"></i>نوع النشر والجودة</h3>
        <div class="na-lbl">نوع النشر</div><div class="np-bar">${PTYPE.filter(t => tc[t[0]]).map(t => `<i style="flex:${tc[t[0]]};background:${t[3]}" title="${t[1]}: ${tc[t[0]]}">${tc[t[0]] / n > .08 ? tc[t[0]] : ''}</i>`).join('')}</div>
        <div class="np-leg">${PTYPE.filter(t => tc[t[0]]).map(t => `<span><i class="bi ${t[2]}" style="color:${t[3]}"></i>${t[1]} <b>${tc[t[0]]}</b></span>`).join('')}</div>
        <div class="na-lbl">تصنيف الوعاء (SJR)</div><div class="np-bar">${QORD.filter(q => qc[q]).map(q => `<i style="flex:${qc[q]};background:${QCOL[q]}" title="${QLBL[q]}: ${qc[q]}">${qc[q] / n > .07 ? qc[q] : ''}</i>`).join('')}</div>
        <div class="np-leg">${QORD.filter(q => qc[q]).map(q => `<span><i class="na-sq" style="background:${QCOL[q]}"></i>${QLBL[q]} <b>${qc[q]}</b></span>`).join('')}</div></div>
      <div class="rs-card na-mix"><h3><i class="bi bi-calendar3"></i>عبر السنوات حسب التصنيف</h3>
        ${yrs.length ? `<div class="na-yrs">${yrs.map(y => { const t = R.sum(Object.values(yq[y] || {})); return `<div title="${y}: ${t}">${t ? `<em>${t}</em>` : ''}<span style="height:${Math.round(100 * t / ymax)}%">${QORD.filter(q => (yq[y] || {})[q]).map(q => `<i style="flex:${yq[y][q]};background:${QCOL[q]}"></i>`).join('')}</span><small>${y === yrs[0] || y === yrs[yrs.length - 1] ? y : (yrs.length <= 14 ? String(y).slice(2) : '')}</small></div>`; }).join('')}</div>` : '<div class="text-muted small">لا سنوات</div>'}
        <div class="np-leg mt-2">${QORD.filter(q => qc[q]).map(q => `<span><i class="na-sq" style="background:${QCOL[q]}"></i>${QLBL[q]}</span>`).join('')}</div></div>
    </section>
    </div>
    <div class="na-tab" data-nt="people"${AU.tab === 'people' ? '' : ' hidden'}>
    <section class="rs-card na-sec"><h3><i class="bi bi-people"></i>${single ? 'أكثر الشركاء من الجامعة' : 'أعضاء المجموعة'} <small class="fw-normal text-muted">${single ? 'اضغط «دقّق» لتدقيق الثنائي' : 'كل عضو مقاس على إنتاجه كله في الفترة'}</small></h3>
      ${people.length ? `<div class="rs-scroll na-free"><table class="rs-table na-t"><thead><tr><th>الباحث</th>${single ? '<th class="num">مشترك</th><th>من إنتاجه</th>' : '<th class="num">كل منشوراته</th><th class="num">في هذه المجموعة</th>'}<th class="num">Q1–Q2</th><th class="num">مجلات محذوفة</th><th class="num">مسحوبة</th><th>تنبيه</th><th class="na-act"></th></tr></thead><tbody>
      ${people.map(p => { const l = level(p.sc); return `<tr><td><div class="d-flex align-items-center gap-2">${R.avatar(p.r, 'sm')}<div>${who(p.r)}</div></div></td>${single ? `<td class="num"><b>${p.s}</b></td><td><div class="na-pc"><span><i style="width:${Math.round(100 * p.sh)}%"></i></span><b>${R.pct(p.sh)}</b></div></td>` : `<td class="num">${R.n(p.t)}</td><td class="num"><b>${R.n(p.s)}</b> <small class="text-muted">(${p.t ? R.pct(p.s / p.t) : '–'})</small></td>`}<td class="num">${p.hi == null ? '–' : R.pct(p.hi)}</td><td class="num">${p.da ? `<span class="na-bad">${p.da}</span>` : '–'}</td><td class="num">${p.ret ? `<span class="na-bad">${p.ret}</span>` : '–'}</td><td><span class="na-rb ${l[0]}"><i class="bi ${l[2]}"></i>${l[1]}</span></td><td class="na-act"><button type="button" class="na-ib na-do" data-ids="${single ? ids[0] + ',' + p.r.id : p.r.id}" title="${single ? 'تدقيق الثنائي' : 'تدقيق فردي'}"><i class="bi bi-search"></i><span>دقّق</span></button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="text-muted small">لا شركاء من الجامعة في الفترة.</div>'}</section>
    </div>
    <div class="na-tab" data-nt="ret"${AU.tab === 'ret' ? '' : ' hidden'}>
    ${m.ret.length ? `<section class="rs-card na-sec na-retsec"><h3><i class="bi bi-x-octagon"></i>الأبحاث المسحوبة وأسبابها <small class="fw-normal text-muted">${m.ret.length}</small></h3>${m.ret.map(p => { const rw = p.rw || {}; const rs = (rw.r || []).filter(r => !/^(Investigation|Notice|Date of|Upgrade|Retract and Replace)/i.test(r)); return `<div class="na-ret"><div class="t"><a class="ltr" dir="auto" href="${p.doi ? 'https://doi.org/' + esc(p.doi) : '#'}" target="_blank" rel="noopener">${esc(String(p.t || '').replace(/^RETRACTED:\s*/i, ''))}</a><div class="m"><span>${p.y || ''}</span>${p.j ? `<span class="ltr" dir="ltr">${esc(p.j)}</span>` : ''}${p.pub ? `<span>${esc(p.pub)}</span>` : ''}${rw.date ? `<span>أُعلن السحب ${esc(rw.date)}</span>` : ''}${rw.nat && rw.nat !== 'Retraction' ? `<span>${esc(rw.nat)}</span>` : ''}</div></div>
        <div class="g">${(p.g || []).map(g => RET.G[g] ? `<span class="na-g"><i class="bi ${RET.G[g].i}"></i>${esc(RET.G[g].a)}</span>` : '').join('')}${rs.length ? rs.map(r => `<span class="na-g sm">${esc(RET.RAR[r] || r)}</span>`).join('') : ((p.g || []).length ? '' : '<span class="na-g">السبب غير منشور في Retraction Watch</span>')}</div>
        <div class="l">${rw.ndoi ? `<a class="na-lnk" href="https://doi.org/${esc(rw.ndoi)}" target="_blank" rel="noopener">إشعار السحب <i class="bi bi-box-arrow-up-left"></i></a>` : ''}${rw.id ? `<a class="na-lnk" href="http://retractiondatabase.org/RetractionSearch.aspx#?AllIDs=${encodeURIComponent(rw.id)}" target="_blank" rel="noopener">Retraction Watch #${esc(rw.id)}</a>` : ''}${p.eid ? `<a class="na-lnk" href="${R.scopusDocUrl(p.eid)}" target="_blank" rel="noopener">Scopus</a>` : ''}</div></div>`; }).join('')}</section>` : ''}
    </div>
    <div class="na-tab" data-nt="venues"${AU.tab === 'venues' ? '' : ' hidden'}>
    <section class="rs-card na-sec"><h3><i class="bi bi-journal-bookmark"></i>أوعية النشر <small class="fw-normal text-muted">${R.n(venues.length)} · اضغط صفاً لعرض أبحاثه</small></h3>
      <div class="rs-scroll na-free"><table class="rs-table na-t"><thead><tr><th>المجلة / المؤتمر</th><th>النوع</th><th class="num">الأبحاث</th><th class="num">الحصة</th><th>التصنيف</th><th>وضعها في Scopus</th><th>السنوات</th></tr></thead><tbody>
      ${venues.map(v => `<tr data-pfv="${esc(v.v)}" class="na-click"><td class="ltr na-vn" dir="ltr">${esc(v.v)}</td><td><span class="np-tp" style="--c:${PT[v.k][3]}"><i class="bi ${PT[v.k][2]}"></i>${PT[v.k][1]}</span></td><td class="num"><b>${v.n}</b>${v.r ? ` <span class="na-bad" title="مسحوبة">${v.r} مسحوب</span>` : ''}</td><td class="num">${R.pct(v.n / n)}</td><td>${v.q ? R.qTag(v.q) : (v.k === 'article' || v.k === 'review' ? '<span class="text-muted small">غير مصنّفة</span>' : '–')}</td><td>${v.d === 'after' ? `<span class="na-bad">محذوفة قبل النشر${v.de ? ' · ' + v.de : ''}</span>` : v.d === 'later' ? `<span class="na-warn">حُذفت لاحقاً${v.de ? ' · ' + v.de : ''}</span>` : '<span class="text-muted small">—</span>'}</td><td dir="ltr" class="small">${v.y1 ? (v.y0 === v.y1 ? v.y0 : v.y0 + '–' + v.y1) : ''}</td></tr>`).join('')}</tbody></table></div></section>
    </div>
    <div class="na-tab" data-nt="papers"${AU.tab === 'papers' ? '' : ' hidden'}>
    <section class="rs-card na-sec" id="na-papers-sec"><h3><i class="bi bi-files"></i>${single ? 'المنشورات' : 'الأبحاث المشتركة'} <small class="fw-normal text-muted" id="na-pcount"></small></h3>
      <div class="rs-seg na-seg na-pf no-print" id="na-pf"></div><ol class="np-papers na-papers" id="na-papers"></ol></section>` : ''}
    </div>
    ${printSign()}`;
    if (n) papers(ws);
  }
  function papers(ws) {
    const F = [['all', 'الكل', () => true], ['ret', 'مسحوبة', w => w._ret], ['disc', 'مجلات محذوفة', w => w._disc], ['hi', 'Q1–Q2', w => w._qq === 'Q1' || w._qq === 'Q2'], ['low', 'Q3–Q4 وغير مصنّفة', w => ['Q3', 'Q4', 'nr'].includes(w._qq)], ['conf', 'مؤتمرات', w => w._qq === 'conf']];
    const cur = AU.pf, custom = /^(v|vy|y):/.test(cur);
    const fn = custom ? (cur.startsWith('v:') ? w => w.v === cur.slice(2) : cur.startsWith('y:') ? w => String(w.y) === cur.slice(2) : w => (w.v + '|' + w.y) === cur.slice(3)) : (F.find(f => f[0] === cur) || F[0])[2];
    R.$('#na-pf').innerHTML = F.map(f => { const c = ws.filter(f[2]).length; return c || f[0] === 'all' ? `<button type="button" data-pf="${f[0]}" class="${cur === f[0] ? 'on' : ''}">${f[1]} <b>${c}</b></button>` : ''; }).join('')
      + (custom ? `<button type="button" class="on" data-pf="all" title="إلغاء التصفية"><span class="ltr">${esc(cur.replace(/^(v|vy|y):/, '').replace('|', ' · '))}</span> <i class="bi bi-x"></i></button>` : '');
    const L = ws.filter(fn);
    R.$('#na-pcount').textContent = `${R.n(L.length)} من ${R.n(ws.length)}`;
    R.$('#na-papers').innerHTML = L.slice(0, 200).map(w => { const t = PT[w._pt]; return `<li class="${w._ret ? 'ret' : w._disc === 'after' ? 'disc' : ''}"><span class="y">${w.y || '–'}</span><div><a class="ltr" dir="auto" href="${R.docUrl(w)}">${esc(w.t)}</a><div class="m"><span class="np-tp" style="--c:${t[3]}"><i class="bi ${t[2]}"></i>${t[1]}</span>${R.qTag(w.q)}${w._ret ? '<span class="na-bad"><i class="bi bi-x-octagon-fill"></i> مسحوب</span>' : ''}${w._disc === 'after' ? '<span class="na-bad">مجلة محذوفة وقت النشر</span>' : w._disc === 'later' ? '<span class="na-warn">حُذفت المجلة لاحقاً</span>' : ''}${w.v ? `<span class="ltr" dir="ltr">${esc(w.v)}</span>` : ''}<span>${w._jo.length} من البترا${w.na ? ` · ${w.na} مؤلفين` : ''}${w.sc != null || w.c != null ? ` · ${R.n(w.sc ?? w.c)} اقتباس` : ''}</span></div></div></li>`; }).join('')
      + (L.length > 200 ? `<li class="text-muted small">أول 200 من ${R.n(L.length)}؛ صدّر CSV للقائمة كاملة</li>` : '') || '<li class="text-muted">لا أبحاث بهذه التصفية.</li>';
  }

  // ---------------------------------------------------------------- scan: where to look first
  function scan() {
    const body = R.$('#na-body');
    let rows;
    if (AU.scanOf === 'people') {
      rows = list.map(r => { const ws = (BY[r.id] || []).filter(inY); if (ws.length < 5) return null; const m = measure(ws, [r.id]), sc = scorecard(m, [r.id]); return { ids: [r.id], n: ws.length, m, sc, s: scoreOf(sc) }; }).filter(Boolean);
    } else {
      const pw = new Map(); W.forEach(w => { if (!inY(w)) return; const rs = [...new Set(w._jo)].sort(); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const k = rs[i] + '|' + rs[j]; (pw.get(k) || pw.set(k, []).get(k)).push(w); } });
      rows = [...pw.entries()].filter(([, ws]) => ws.length >= 3).map(([k, ws]) => { const ids = k.split('|'), m = measure(ws, ids), sc = scorecard(m, ids); return { ids, n: ws.length, m, sc, s: scoreOf(sc) }; });
    }
    const total = rows.length; if (AU.only) rows = rows.filter(o => o.s >= 3);
    rows.sort((a, b) => b.s - a.s || b.n - a.n);
    const cnt = { high: 0, mid: 0, low: 0, ok: 0 }; rows.forEach(o => cnt[level(o.s)[0]]++);
    body.innerHTML = printMeta([['نوع التقرير', `مسح شامل · ${AU.scanOf === 'people' ? 'الباحثون (5 منشورات أو أكثر)' : 'ثنائيات التعاون (3 أبحاث مشتركة أو أكثر)'}`], ['الفترة', perTxt()],
      ['النتائج', `${R.n(cnt.high)} مراجعة عاجلة · ${R.n(cnt.mid)} للمراجعة${AU.only ? '' : ` · ${R.n(cnt.low)} ملاحظات بسيطة · ${R.n(cnt.ok)} بلا تنبيه`} (من ${R.n(total)})`], ['تاريخ الإعداد', today()]]) + `<section class="rs-card na-sec"><h3><i class="bi bi-radar"></i>مسح شامل · ${AU.scanOf === 'people' ? 'الباحثون' : 'ثنائيات التعاون'} <small class="fw-normal text-muted">${R.n(total)} ${AU.scanOf === 'people' ? 'باحثاً لهم 5 منشورات أو أكثر' : 'ثنائياً لهم 3 أبحاث مشتركة أو أكثر'} · ${AU.from || AU.to ? `${AU.from || 'البداية'}–${AU.to || 'الآن'}` : 'كل السنوات'}</small>
      <label class="na-tog ms-auto"><input type="checkbox" id="na-only"${AU.only ? ' checked' : ''}> ما يستحق المراجعة فقط</label></h3>
      <div class="na-scnt"><span class="high"><i class="bi bi-shield-fill-exclamation"></i> مراجعة عاجلة <b>${cnt.high}</b></span><span class="mid"><i class="bi bi-shield-fill-minus"></i> للمراجعة <b>${cnt.mid}</b></span>${AU.only ? '' : `<span class="low"><i class="bi bi-shield-fill-check"></i> ملاحظات بسيطة <b>${cnt.low}</b></span><span class="ok"><i class="bi bi-check2"></i> بلا تنبيه <b>${cnt.ok}</b></span>`}</div>
      <div class="rs-scroll" style="max-height:74vh"><table class="rs-table na-t na-scan"><thead><tr><th>النتيجة</th>${AU.scanOf === 'people' ? '<th>الباحث</th>' : '<th>الباحث</th><th>الشريك</th>'}<th class="num">${AU.scanOf === 'people' ? 'منشورات' : 'مشتركة'}</th><th class="num">Q1–Q2</th><th>المعايير التي تستحق المراجعة</th><th class="na-act"></th></tr></thead><tbody>
      ${rows.slice(0, 250).map(o => { const l = level(o.s); return `<tr><td><span class="na-rb ${l[0]}"><i class="bi ${l[2]}"></i>${l[1]}</span></td>${o.ids.map(id => `<td>${who(byId[id])}</td>`).join('')}<td class="num"><span class="pill qg">${o.n}</span></td><td class="num">${o.m.hiS == null ? '–' : R.pct(o.m.hiS)}</td><td><div class="na-sigs">${o.sc.filter(r => r[5] > 0).map(r => `<span class="s${r[5]}" title="${esc(r[6])}"><i class="bi ${r[1]}"></i>${esc(r[2])}: ${esc(r[3])}</span>`).join('') || '<span class="text-muted small">—</span>'}</div></td><td class="na-act"><button type="button" class="na-ib na-do" data-ids="${o.ids.join(',')}"><i class="bi bi-search"></i><span>دقّق</span></button></td></tr>`; }).join('') || `<tr><td colspan="7" class="rs-empty">لا نتائج بهذه الشروط.</td></tr>`}</tbody></table></div>
      ${rows.length > 250 ? `<p class="small text-muted mt-2 mb-0">أول 250 من ${R.n(rows.length)}؛ صدّر CSV للقائمة كاملة.</p>` : ''}
      <p class="rs-note mt-2 mb-0"><i class="bi bi-info-circle"></i> الترتيب حسب نقاط التنبيه: البحث المسحوب 6، والنشر في مجلة محذوفة وقت النشر 4، وأي معيار «مرتفع» آخر 2.5، و«للمراجعة» 1. القائمة نقطة بداية للمراجعة لا حكم على أحد.</p></section>${printSign()}`;
    body._rows = rows;
  }

  function csv() {
    if (AU.view === 'scan') {
      const rows = R.$('#na-body')._rows || [];
      return R.csv(rows.map(o => ({ level: level(o.s)[1], score: o.s.toFixed(1), researchers: o.ids.map(id => byId[id].name).join(' + '), faculty: o.ids.map(id => byId[id].faculty).join(' + '), works: o.n, q1_q2: o.m.hiS == null ? '' : Math.round(o.m.hiS * 100) + '%', retracted: o.m.ret.length, discontinued_at_publication: o.m.da, flags: o.sc.filter(r => r[5] > 0).map(r => `${r[2]}: ${r[3]}`).join(' | ') })), `uop-integrity-scan-${AU.scanOf}.csv`);
    }
    if (!AU.ids.length) return;
    const ws = scope(AU.ids, AU.mode);
    R.csv(ws.map(w => ({ year: w.y || '', title: w.t, venue: w.v || '', type: PT[w._pt][1], quartile: w.q || '', scopus_status: w._disc === 'after' ? 'discontinued before publication' : w._disc === 'later' ? 'discontinued later' : '', retracted: w._ret ? 'yes' : '', retraction_reasons: w._ret ? ((w._ret.rw || {}).r || []).join('; ') : '', citations: w.sc ?? w.c ?? '', fwci: w.fwci ?? '', doi: w.doi ? 'https://doi.org/' + w.doi : '', uop_authors: w._jo.map(id => byId[id].name).join('; ') })), 'uop-integrity-audit.csv');
  }

  // ---------------------------------------------------------------- events
  function showTab(k) {
    AU.tab = k; R.$$('#na-tabs [data-nt]').forEach(b => b.classList.toggle('on', b.dataset.nt === k));
    R.$$('.na-tab').forEach(d => { d.hidden = d.dataset.nt !== k; }); url();
  }
  app.addEventListener('click', e => {
    const t = e.target;
    const nt = t.closest('#na-tabs [data-nt]'); if (nt) { showTab(nt.dataset.nt); return; }
    const add = t.closest('[data-add]'); if (add) { AU.ids.push(add.dataset.add); R.$('#na-q').value = ''; R.$('#na-dd').hidden = true; AU.view = 'group'; AU.pf = 'all'; render(); return; }
    const rm = t.closest('[data-rm]'); if (rm) { AU.ids = AU.ids.filter(x => x !== rm.dataset.rm); AU.pf = 'all'; render(); return; }
    const mo = t.closest('#na-mode [data-m]'); if (mo) { AU.mode = mo.dataset.m; AU.pf = 'all'; render(); return; }
    const so = t.closest('#na-sof [data-s]'); if (so) { AU.scanOf = so.dataset.s; render(); return; }
    const v = t.closest('[data-v]'); if (v && (v.closest('#na-view') || v.classList.contains('na-go'))) { AU.view = v.dataset.v; render(); return; }
    const d = t.closest('.na-do'); if (d) { AU.ids = d.dataset.ids.split(','); AU.view = 'group'; AU.mode = 'all'; AU.pf = 'all'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const pf = t.closest('[data-pf]'); if (pf) { AU.pf = pf.dataset.pf; papers(scope(AU.ids, AU.mode)); if (!pf.closest('#na-pf')) { showTab('papers'); R.$('#na-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    const pv = t.closest('tr[data-pfv]'); if (pv) { AU.pf = 'v:' + pv.dataset.pfv; papers(scope(AU.ids, AU.mode)); showTab('papers'); R.$('#na-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.closest('#na-csv')) { csv(); return; }
    if (!t.closest('.na-in')) R.$('#na-dd').hidden = true;
  });
  app.addEventListener('change', e => {
    if (e.target.id === 'na-only') { AU.only = e.target.checked; scan(); }
    if (e.target.id === 'na-from' || e.target.id === 'na-to') { AU.from = +R.$('#na-from').value || 0; AU.to = +R.$('#na-to').value || 0; AU.pf = 'all'; render(); }
  });
  const q = R.$('#na-q');
  q.addEventListener('input', R.debounce(() => suggest(q.value), 150));
  q.addEventListener('focus', () => suggest(q.value));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = R.$('#na-dd [data-add]'); if (b) { e.preventDefault(); b.click(); } } if (e.key === 'Escape') R.$('#na-dd').hidden = true; });
  render();
})();
