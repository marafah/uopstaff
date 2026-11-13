/* «مسار ذوي الإعاقة» (access.html): the university's official accessible route on campus.
   data/campus_access.json holds the route the university drew on its campus plan for people with disabilities (the red
   «Disable arrow towards buildings»), read into a network of points and lines on the plan image, with each numbered
   building and its accessible entrance, the gates and the parking for disabilities. Lines marked «link» join a gate or a
   car park to the nearest point of the route; they are not in the plan.
   On the page: the plan with the route over it, a route planner (from a gate, a car park or a building to a building:
   the shortest way on the accessible route, its length and time), the buildings and whether the route serves them,
   layers, a printable official sheet and a link to share. Links: ?from=gate:1|park:p1|b:4 &to=b:12 */
(function () {
  'use strict';
  const U = window.UOP, { $, esc } = U;
  const P = new URLSearchParams(location.search);
  const app = $('#ac-app');
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  let A, W, H, G = [], K = 1;   // K: marker size for the plan image's resolution
  const st = { from: P.get('from') || 'gate:1', to: P.get('to') || '', q: '', L: { route: true, ent: true, pts: true, nums: true, dim: false }, s: 1, x: 0, y: 0 };
  try { Object.assign(st.L, JSON.parse(localStorage.getItem('uop-access-layers') || '{}')); } catch (e) { /* storage unavailable */ }
  const saveL = () => { try { localStorage.setItem('uop-access-layers', JSON.stringify(st.L)); } catch (e) { /* storage unavailable */ } };
  const len = pts => pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
  const M = px => Math.round(px * A.mpp / 5) * 5;                     // pixels on the plan to metres (rounded to 5)
  const mins = m => Math.max(1, Math.round(m / 50));                  // wheelchair about 3 km/h
  const walk = m => Math.max(1, Math.round(m / 75));
  const SHORT = {"1": "الرئاسة", "2": "المكتبة", "3": "المسرح", "4": "تكنولوجيا المعلومات", "5": "الصيدلة", "6": "الدراسات الدوائية", "7": "العلوم الإدارية والمالية", "8": "الآداب والعلوم", "9": "الحقوق والإعلام", "10": "شؤون الطلبة", "11": "مواقف الطلبة", "12": "الهندسة", "13": "العمارة والتصميم", "14": "القبول والتسجيل"};   // the building names as labels on the plan
  const placeOf = k => { const [t, id] = String(k || '').split(':');
    if (t === 'b') { const b = A.buildings.find(x => String(x.n) === id); return b && { k, node: b.node, x: b.x, y: b.y, ar: b.ar, kind: 'b', b }; }
    const p = A.points.find(x => x.id === id && x.kind === t); return p && { k, node: p.node, x: p.x, y: p.y, ar: p.ar, kind: t, p }; };

  // ---------------------------------------------------------------- the network and the shortest way on it
  function build() {
    G = A.nodes.map(() => []);
    A.edges.forEach((e, i) => { const l = len(e[2]); G[e[0]].push({ to: e[1], l, i, rev: false }); G[e[1]].push({ to: e[0], l, i, rev: true }); });
  }
  function shortest(a, b) {
    if (a == null || b == null) return null;
    const d = A.nodes.map(() => Infinity), prev = [], done = new Set(); d[a] = 0;
    while (true) {
      let u = -1; d.forEach((v, i) => { if (!done.has(i) && v < Infinity && (u < 0 || v < d[u])) u = i; });
      if (u < 0 || u === b) break; done.add(u);
      G[u].forEach(e => { if (d[u] + e.l < d[e.to]) { d[e.to] = d[u] + e.l; prev[e.to] = { from: u, e }; } });
    }
    if (d[b] === Infinity) return null;
    const steps = []; let v = b; while (v !== a) { steps.unshift(prev[v]); v = prev[v].from; }
    const pts = []; steps.forEach(s => { const poly = A.edges[s.e.i][2].slice(); if (s.e.rev) poly.reverse(); pts.push(...(pts.length ? poly.slice(1) : poly)); });
    const nodes = [a, ...steps.map(s => s.e.to)], link = steps.some(s => A.edges[s.e.i][3] === 'link');
    return { px: d[b], pts, nodes, link };
  }
  const served = b => G[b.node] && G[b.node].length > 0;
  const nearestGate = b => A.points.filter(p => p.kind === 'gate').map(g => ({ g, r: shortest(g.node, b.node) })).filter(x => x.r).sort((x, y) => x.r.px - y.r.px)[0];

  // ---------------------------------------------------------------- the plan, the route and the markers
  function svg(route, opt = {}) {
    const poly = pts => pts.map(p => p.join(',')).join(' ');
    let s = `<g style="--k:${K}">${A.mask ? `<polygon class="ac-mask" points="${A.mask.map(p => p.join(',')).join(' ')}"/>` : ''}`;
    // the plan is turned 180° (north down, like «خريطة الحرم»): its printed words would read upside down, so they are covered and written again upright
    (A.texts || []).forEach(x => { const [cx, cy] = x.c;
      s += `<g transform="rotate(${x.a} ${cx} ${cy})"><rect class="ac-mask ${x.dark ? 'dk' : ''}" x="${cx - x.w / 2}" y="${cy - x.h / 2}" width="${x.w}" height="${x.h}" rx="4"/>`
        + (x.t ? `<text class="ac-tx ${x.dark ? 'dk' : ''}" x="${cx}" y="${cy}" style="font-size:${Math.min(x.h * .62, 16 * K / 1.6)}px">${esc(x.t)}</text>` : '') + '</g>'; });
    if (st.L.route || opt.print) A.edges.forEach(e => {
      const p = poly(e[2]);
      s += e[3] === 'link' ? `<polyline class="ac-link" points="${p}"/>` : `<polyline class="ac-case" points="${p}"/><polyline class="ac-net" points="${p}"/>`;
    });
    if (route) { const p = poly(route.pts); s += `<polyline class="ac-rcase" points="${p}"/><polyline class="ac-route" points="${p}"/>`; }
    const to = route && placeOf(st.to), fr = route && placeOf(st.from);
    if (st.L.ent || opt.print) A.buildings.forEach(b => { const n = A.nodes[b.node]; if (!served(b)) return;
      const on = to && to.b === b; s += `<g class="ac-ent ${on ? 'on' : ''}" transform="translate(${n[0]},${n[1]}) scale(${K})"><circle r="${on ? 9 : 7}"/><text y="${on ? 4 : 3.2}">♿</text><title>المدخل الميسّر: ${esc(b.ar)}</title></g>`; });
    if (st.L.pts || opt.print) A.points.forEach(p => { s += p.kind === 'park'
      ? `<g class="ac-park" transform="translate(${p.x},${p.y}) scale(${K})"><rect x="-11" y="-11" width="22" height="22" rx="4"/><text y="4">P♿</text><title>${esc(p.ar)}</title></g>`
      : `<g class="ac-gate" transform="translate(${p.x},${p.y}) scale(${K})"><path d="M0,-12 L11,8 L-11,8 Z"/><text y="5">${esc(p.id)}</text><title>${esc(p.ar)}</title></g>`; });
    if (st.L.nums || opt.print) A.buildings.forEach(b => { const on = to && to.b === b, fo = fr && fr.b === b;
      s += `<g class="ac-b ${on ? 'to' : fo ? 'from' : ''} ${served(b) ? '' : 'off'} ${st.hl === b.n ? 'hl' : ''}" data-b="${b.n}" transform="translate(${b.x},${b.y}) scale(${K})"><circle r="13"/><text y="5">${b.n}</text>${st.L.names !== false ? `<g class="ac-nm"><rect x="${-(SHORT[b.n] || '').length * 2.75 - 7}" y="16" width="${(SHORT[b.n] || '').length * 5.5 + 14}" height="17" rx="8.5"/><text y="28.5">${esc(SHORT[b.n] || '')}</text></g>` : ''}<title>${esc(b.ar)} — ${esc(b.en)}</title></g>`; });
    if (route) { const a = route.pts[0], z = route.pts[route.pts.length - 1];
      s += `<g class="ac-pin a" transform="translate(${a[0]},${a[1]}) scale(${K})"><circle r="8"/></g><g class="ac-pin z" transform="translate(${z[0]},${z[1]}) scale(${K})"><path d="M0,0 C-9,-11 -9,-22 0,-24 C9,-22 9,-11 0,0Z"/><circle cy="-15" r="3.5" fill="#fff"/></g>`; }
    return s + '</g>';
  }
  function apply() { const m = $('#ac-in'); if (m) m.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; }
  function fit(box) {
    const box2 = box || A.view, m = $('#ac-map'); if (!m) return;
    const w = m.clientWidth, h = m.clientHeight, bw = box2[2] - box2[0], bh = box2[3] - box2[1];
    const base = w / W;                                     // the image is drawn at the frame's width
    st.s = Math.min(w / (bw * base), h / (bh * base)) * 0.96;
    st.x = w / 2 - ((box2[0] + bw / 2) * base) * st.s; st.y = h / 2 - ((box2[1] + bh / 2) * base) * st.s; apply();
  }
  function zoomAt(f, cx, cy) { const s2 = Math.max(0.6, Math.min(6, st.s * f)); st.x = cx - (cx - st.x) * s2 / st.s; st.y = cy - (cy - st.y) * s2 / st.s; st.s = s2; apply(); }

  // ---------------------------------------------------------------- the page
  function steps(r) {
    const out = [], fr = placeOf(st.from), to = placeOf(st.to);
    out.push(['bi-geo-alt-fill', 'ابدأ من', fr.ar + (fr.kind === 'b' ? ' (مدخله الميسّر)' : '')]);
    if (r.link) out.push(['bi-signpost', 'اتجه إلى', 'أقرب نقطة على مسار ذوي الإعاقة (الوصلة المنقّطة ليست مرسومة في المخطط)']);
    const passed = []; r.nodes.slice(1, -1).forEach(n => A.buildings.filter(b => b.node === n && b !== (to && to.b)).forEach(b => passed.push(b)));
    if (passed.length) out.push(['bi-arrow-left-circle', 'تمرّ بمداخل', passed.map(b => `${b.n} ${b.ar}`).join('، ')]);
    out.push(['bi-flag-fill', 'تصل إلى', `المدخل الميسّر لـ ${to.ar}`]);
    return out;
  }
  function render() {
    const fr = placeOf(st.from), to = placeOf(st.to);
    const r = fr && to ? shortest(fr.node, to.node) : null;
    const total = A.edges.filter(e => e[3] !== 'link').reduce((a, e) => a + len(e[2]), 0);
    const opts = (cur, withB, withP) => [withP ? `<optgroup label="البوابات">${A.points.filter(p => p.kind === 'gate').map(p => `<option value="gate:${p.id}" ${cur === 'gate:' + p.id ? 'selected' : ''}>${esc(p.ar)}</option>`).join('')}</optgroup>
        <optgroup label="مواقف ذوي الإعاقة">${A.points.filter(p => p.kind === 'park').map(p => `<option value="park:${p.id}" ${cur === 'park:' + p.id ? 'selected' : ''}>${esc(p.ar)}</option>`).join('')}</optgroup>` : '',
      withB ? `<optgroup label="المباني">${A.buildings.filter(served).map(b => `<option value="b:${b.n}" ${cur === 'b:' + b.n ? 'selected' : ''}>${b.n} · ${esc(b.ar)}</option>`).join('')}</optgroup>` : ''].join('');
    const q = U.norm(st.q || ''), list = A.buildings.filter(b => !q || U.norm(b.ar + ' ' + b.en + ' ' + b.n).includes(q));
    app.classList.toggle('ac-bigt', !!st.L.big); app.classList.toggle('ac-hc', !!st.L.hc);   // keep the page's own classes (container, padding)
    app.innerHTML = `<div class="ac-head">
        <div class="ac-title"><span class="ac-ico">♿</span><div><h2>مسار ذوي الإعاقة في الحرم</h2><p>مسار ذوي الإعاقة الذي اعتمدته الجامعة على مخطط الحرم: من البوابات ومواقف ذوي الإعاقة إلى المدخل الميسّر لكل مبنى.</p></div></div>
        <div class="ac-kpis">${[['bi-building-check', A.buildings.filter(served).length + ' من ' + A.buildings.length, 'مبنى يخدمه المسار'], ['bi-rulers', 'حوالي ' + (Math.round(total * A.mpp / 50) * 50) + ' م', 'طول المسار'], ['bi-p-square', A.points.filter(p => p.kind === 'park').length, 'موقفان لذوي الإعاقة'], ['bi-door-open', A.points.filter(p => p.kind === 'gate').length, 'بوابات']].map(([i, v, l]) => `<div><i class="bi ${i}"></i><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>
      <div class="ac-grid">
        <aside class="ac-side">
          <section class="ac-card"><h3><i class="bi bi-signpost-split-fill"></i> خطّط مساراً لذوي الإعاقة</h3>
            <label>من<select class="form-select" id="ac-from">${opts(st.from, true, true)}</select></label>
            <button type="button" class="ac-swap" id="ac-swap" title="عكس الاتجاه" aria-label="عكس الاتجاه"><i class="bi bi-arrow-down-up"></i></button>
            <label>إلى<select class="form-select" id="ac-to"><option value="">— اختر المبنى —</option>${opts(st.to, true, false)}</select></label>
            ${r ? `<div class="ac-res"><div><b>${M(r.px)} م</b><span>طول المسار</span></div><div><b>${mins(M(r.px))} د</b><span>بالكرسي المتحرك</span></div><div><b>${walk(M(r.px))} د</b><span>مشياً</span></div></div>
              <ol class="ac-steps">${steps(r).map(([i, t, v]) => `<li><i class="bi ${i}"></i><span><small>${t}</small>${esc(v)}</span></li>`).join('')}</ol>
              <div class="ac-acts no-print"><button type="button" class="btn btn-sm btn-maroon" id="ac-print"><i class="bi bi-printer"></i> طباعة المسار</button><button type="button" class="btn btn-sm btn-light border" id="ac-copy"><i class="bi bi-link-45deg"></i> نسخ الرابط</button>${'speechSynthesis' in window ? '<button type="button" class="btn btn-sm btn-light border" id="ac-say"><i class="bi bi-volume-up"></i> اقرأ المسار</button>' : ''}
                ${to && to.b ? `<a class="btn btn-sm btn-light border" href="campus.html?b=${encodeURIComponent(to.b.site)}"><i class="bi bi-map"></i> المبنى على خريطة الحرم</a><a class="btn btn-sm btn-light border" href="campus.html?b=${encodeURIComponent(to.b.site)}&tool=access"><i class="bi bi-layers"></i> طوابقه وقاعاته الأرضية</a>` : ''}</div>`
              : st.to && fr && to ? '<div class="ac-warn"><i class="bi bi-exclamation-triangle-fill"></i> لا يصل مسار ذوي الإعاقة بين النقطتين في المخطط.</div>' : '<p class="ac-hint">اختر المبنى الذي تريده؛ يُرسم أقصر طريق على مسار ذوي الإعاقة من نقطة البداية إلى مدخله الميسّر.</p>'}</section>
          <section class="ac-card"><h3><i class="bi bi-buildings"></i> المباني على المسار <span class="ac-n">${A.buildings.length}</span></h3>
            <input type="search" class="form-control form-control-sm mb-2" id="ac-q" placeholder="ابحث عن مبنى…" value="${esc(st.q)}">
            <div class="ac-blist">${list.map(b => { const g = served(b) && nearestGate(b);
              return `<button type="button" class="ac-bi ${to && to.b === b ? 'on' : ''}" data-to="b:${b.n}"><span class="ac-bn">${b.n}</span><span class="ac-bt"><b>${esc(b.ar)}</b><small>${esc(b.en)}</small></span>
                <span class="ac-bs">${served(b) ? `<span class="ac-ok">♿ مدخل ميسّر</span>${g ? `<small>${M(g.r.px)} م من ${esc(g.g.ar)}</small>` : ''}` : '<span class="ac-no">غير موصول</span>'}</span></button>`; }).join('') || '<p class="ac-hint">لا نتائج.</p>'}</div></section>
          <section class="ac-card ac-note"><h3><i class="bi bi-patch-check-fill"></i> عن هذا المسار</h3>
            <p>المسار والمداخل والمواقف منقولة كما هي من <b>${esc(A.source)}</b>: الأسهم الحمراء «سهم التوجيه لذوي الاحتياجات الخاصة» على المخطط. المسافات والأوقات تقديرية من مقياس المخطط.</p>
            <p>الوصلات المنقّطة من البوابات والمواقف إلى المسار ليست في المخطط، وتدل على أقرب نقطة فقط. للطوابق والقاعات الأرضية في كل مبنى: <a href="campus.html?tool=access">الوصول الميسّر في خريطة الحرم</a>.</p>
            <div class="ac-acts no-print"><a class="btn btn-sm btn-light border" href="campus.html?tool=fix"><i class="bi bi-tools"></i> أبلغ عن عائق على المسار</a><button type="button" class="btn btn-sm btn-light border" id="ac-sheet"><i class="bi bi-file-earmark-text"></i> مخطط المسار للطباعة</button><button type="button" class="btn btn-sm btn-light border" id="ac-qr"><i class="bi bi-qr-code"></i> ملصقات QR «أنت هنا»</button></div></section>
        </aside>
        <section class="ac-mapc"><div class="ac-map" id="ac-map" tabindex="0" aria-label="مخطط الحرم مع مسار ذوي الإعاقة">
            <div id="ac-in" class="${st.L.dim ? 'dim' : ''}"><img src="${A.image}" alt="مخطط الحرم الجامعي – مسار ذوي الاحتياجات الخاصة" width="${W}" height="${H}" draggable="false"><svg viewBox="0 0 ${W} ${H}" id="ac-svg">${svg(r)}</svg></div>
            <div class="ac-zoom no-print"><button type="button" data-z="in" title="تكبير" aria-label="تكبير"><i class="bi bi-plus-lg"></i></button><button type="button" data-z="out" title="تصغير" aria-label="تصغير"><i class="bi bi-dash-lg"></i></button><button type="button" data-z="fit" title="المخطط كاملاً" aria-label="المخطط كاملاً"><i class="bi bi-arrows-fullscreen"></i></button></div>
            <div class="ac-north" title="الشمال"><i class="bi ${A.rotated === 180 ? 'bi-arrow-down' : 'bi-arrow-up'}"></i><span>ش</span></div>
            <div class="ac-tools no-print"><button type="button" id="ac-fs" title="ملء الشاشة" aria-label="ملء الشاشة"><i class="bi ${document.fullscreenElement ? 'bi-fullscreen-exit' : 'bi-fullscreen'}"></i></button><button type="button" id="ac-big" class="${st.L.big ? 'on' : ''}" title="خط أكبر" aria-label="خط أكبر"><i class="bi bi-type"></i></button><button type="button" id="ac-hc" class="${st.L.hc ? 'on' : ''}" title="تباين عالٍ" aria-label="تباين عالٍ"><i class="bi bi-circle-half"></i></button></div>
</div>
          <div class="ac-legend">${[['ac-l-net', 'مسار ذوي الإعاقة (من المخطط)'], ['ac-l-route', 'مسارك'], ['ac-l-link', 'وصلة إلى المسار (ليست في المخطط)'], ['ac-l-ent', 'مدخل ميسّر'], ['ac-l-park', 'موقف ذوي الإعاقة'], ['ac-l-gate', 'بوابة'], ['ac-l-b', 'رقم المبنى في المخطط']].map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join('')}</div>
          <div class="ac-layers no-print">${[['names', 'أسماء المباني'], ['route', 'المسار'], ['ent', 'المداخل'], ['pts', 'المواقف والبوابات'], ['nums', 'أرقام المباني'], ['dim', 'تخفيف خلفية المخطط']].map(([k, t]) => `<label><input type="checkbox" data-l="${k}" ${st.L[k] || (k === 'names' && st.L.names !== false) ? 'checked' : ''}> ${t}</label>`).join('')}</div></section></div>`;
    bind(r);
    const url = new URL(location.href); url.searchParams.set('from', st.from); if (st.to) url.searchParams.set('to', st.to); else url.searchParams.delete('to'); history.replaceState(null, '', url);
  }
  function bind(r) {
    const m = $('#ac-map');
    requestAnimationFrame(() => { if (!st.fitted) { st.fitted = true; fit(); } else apply(); });
    m.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const k = b.dataset.z; if (k === 'fit') fit(); else zoomAt(k === 'in' ? 1.4 : 1 / 1.4, m.clientWidth / 2, m.clientHeight / 2); });
    m.addEventListener('wheel', e => { e.preventDefault(); const rc = m.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rc.left, e.clientY - rc.top); }, { passive: false });
    let drag = null, moved = false;
    m.addEventListener('pointerdown', e => { if (e.target.closest('.ac-zoom')) return; drag = { x: e.clientX - st.x, y: e.clientY - st.y, sx: e.clientX, sy: e.clientY }; moved = false; m.setPointerCapture(e.pointerId); });
    m.addEventListener('pointermove', e => { if (!drag) return; if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) moved = true; st.x = e.clientX - drag.x; st.y = e.clientY - drag.y; apply(); });
    m.addEventListener('pointerup', e => { const was = drag; drag = null; if (!was || moved) return;
      const g = document.elementFromPoint(e.clientX, e.clientY); const b = g && g.closest && g.closest('.ac-b'); if (b) { st.to = 'b:' + b.dataset.b; render(); } });
    m.addEventListener('keydown', e => { const k = { '+': 1.3, '=': 1.3, '-': 1 / 1.3 }[e.key]; if (k) zoomAt(k, m.clientWidth / 2, m.clientHeight / 2);
      const mv = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; if (mv) { st.x += mv[0]; st.y += mv[1]; apply(); e.preventDefault(); } });
    $('#ac-from').onchange = e => { st.from = e.target.value; render(); };
    $('#ac-to').onchange = e => { st.to = e.target.value; render(); if (st.to) focusRoute(); };
    $('#ac-swap').onclick = () => { if (!st.to.startsWith('b:')) return; const a = st.from; st.from = st.to; st.to = a.startsWith('b:') ? a : st.to; render(); };
    app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { st.to = b.dataset.to; render(); focusRoute(); });
    app.querySelectorAll('[data-l]').forEach(c => c.onchange = () => { st.L[c.dataset.l] = c.checked; saveL(); render(); });
    const q = $('#ac-q'); q.oninput = () => { st.q = q.value; const pos = q.selectionStart; render(); const n = $('#ac-q'); n.focus(); n.setSelectionRange(pos, pos); };
    const cp = $('#ac-copy'); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.href); cp.innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; };
    const pr = $('#ac-print'); if (pr) pr.onclick = () => sheet(r);
    app.querySelectorAll('.ac-bi[data-to]').forEach(b => { const n = b.dataset.to.slice(2);
      b.onmouseenter = () => { const g = app.querySelector(`.ac-b[data-b="${n}"]`); if (g) g.classList.add('hl'); };
      b.onmouseleave = () => { const g = app.querySelector(`.ac-b[data-b="${n}"]`); if (g) g.classList.remove('hl'); }; });
    $('#ac-big').onclick = () => { st.L.big = !st.L.big; saveL(); render(); };
    $('#ac-hc').onclick = () => { st.L.hc = !st.L.hc; saveL(); render(); };
    $('#ac-fs').onclick = () => { const c = $('.ac-mapc'); if (document.fullscreenElement) document.exitFullscreen(); else if (c.requestFullscreen) c.requestFullscreen(); };
    const say = $('#ac-say'); if (say) say.onclick = () => { speechSynthesis.cancel(); const fr = placeOf(st.from), to = placeOf(st.to);
      const u = new SpeechSynthesisUtterance(`مسار ذوي الإعاقة من ${fr.ar} إلى ${to.ar}: حوالي ${M(r.px)} متر، ${mins(M(r.px))} دقائق بالكرسي المتحرك. ` + steps(r).map(([, t, v]) => `${t} ${v}`).join('. '));
      u.lang = 'ar'; speechSynthesis.speak(u); };
    $('#ac-qr').onclick = qrSheet;
    $('#ac-sheet').onclick = () => sheet(null);
  }
  function focusRoute() {
    const fr = placeOf(st.from), to = placeOf(st.to), r = fr && to && shortest(fr.node, to.node); if (!r) return;
    const xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]), pad = 60;
    fit([Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]);
    if (window.matchMedia('(max-width: 900px)').matches) $('#ac-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // an official A4 sheet: the plan with the route, the legend and the buildings with their entrances (or this route)
  function sheet(r) {
    const fr = placeOf(st.from), to = placeOf(st.to);
    const map = `<div style="position:relative;border:1px solid #c9c1ae;border-radius:6px;overflow:hidden"><svg viewBox="${A.view[0]} ${A.view[1]} ${A.view[2] - A.view[0]} ${A.view[3] - A.view[1]}" style="width:100%;display:block"><image href="${SITE + A.image}" width="${W}" height="${H}"/>${svg(r, { print: true })}</svg></div>
      <style>.ac-net{fill:none;stroke:#dc2626;stroke-width:4;stroke-dasharray:9 6}.ac-case{fill:none;stroke:#fff;stroke-width:8}.ac-link{fill:none;stroke:#64748b;stroke-width:2.5;stroke-dasharray:2 5}.ac-route{fill:none;stroke:#991b1b;stroke-width:6}.ac-rcase{fill:none;stroke:#fff;stroke-width:11}
      .ac-ent circle{fill:#1d4ed8;stroke:#fff;stroke-width:2}.ac-ent text{fill:#fff;font-size:10px;text-anchor:middle}.ac-park rect{fill:#0b4a66;stroke:#fff;stroke-width:2}.ac-park text{fill:#fff;font-size:9px;font-weight:700;text-anchor:middle}
      .ac-gate path{fill:#1e3a8a;stroke:#fff;stroke-width:2}.ac-gate text{fill:#fff;font-size:10px;font-weight:700;text-anchor:middle}.ac-b circle{fill:#901d23;stroke:#fff;stroke-width:2.5}.ac-b text{fill:#fff;font-size:13px;font-weight:700;text-anchor:middle}.ac-b.to circle{fill:#15803d}.ac-nm rect{fill:#fff;stroke:#901d23;stroke-width:1.2}.ac-nm text{fill:#111!important;font-size:11px!important}.ac-pin.a circle{fill:#15803d;stroke:#fff;stroke-width:3}.ac-pin.z path{fill:#b42318;stroke:#fff;stroke-width:2}</style>`;
    const legend = '<p style="font-size:9pt;margin:6px 0 0">الخط الأحمر المتقطّع: مسار ذوي الإعاقة كما في مخطط الجامعة · الأحمر الداكن المتصل: المسار المختار · ♿ مدخل ميسّر · P♿ موقف ذوي الإعاقة · ▲ بوابة · الدوائر الخمرية: أرقام المباني في المخطط · المنقّط الرمادي: وصلة إلى المسار ليست في المخطط.</p>';
    const rows = A.buildings.map(b => { const g = served(b) && nearestGate(b); return [b.n, b.ar, b.en, served(b) ? 'نعم' : 'لا', g ? `${M(g.r.px)} م من ${g.g.ar}` : '—']; });
    window.printReport({ title: r ? 'مسار ذوي الإعاقة: ' + fr.ar + ' ← ' + to.ar : 'مسار ذوي الإعاقة في الحرم الجامعي', subtitle: A.source, orientation: 'landscape', fit: true, url: location.href, qrLabel: 'المسار على الموقع',
      stats: r ? [['طول المسار', M(r.px) + ' م'], ['بالكرسي المتحرك', mins(M(r.px)) + ' دقائق'], ['مشياً', walk(M(r.px)) + ' دقائق']] : [['مبانٍ يخدمها المسار', A.buildings.filter(served).length], ['مواقف ذوي الإعاقة', A.points.filter(p => p.kind === 'park').length], ['البوابات', A.points.filter(p => p.kind === 'gate').length]],
      raw: map + legend + (r ? `<h3 class="sec">خطوات المسار</h3><ol>${steps(r).map(([, t, v]) => `<li><b>${t}:</b> ${esc(v)}</li>`).join('')}</ol>` : ''),
      sections: r ? [] : [{ title: 'المباني والمداخل الميسّرة', columns: ['الرقم', 'المبنى', 'Building', 'مدخل على المسار', 'أقرب بوابة'], widths: ['7%', '30%', '33%', '12%', '18%'], numCols: [0], rows }],
      note: 'المسار والمداخل والمواقف من مخطط الجامعة لمسار ذوي الاحتياجات الخاصة. المسافات والأوقات تقديرية (كرسي متحرك نحو 3 كم/س). الوصلات من البوابات والمواقف إلى المسار ليست في المخطط.' });
  }

  function qrSheet() {
    const qr = link => { if (!window.qrcode) return ''; const x = window.qrcode(0, 'M'); x.addData(link); x.make(); return x.createSvgTag({ cellSize: 5, margin: 1, scalable: true }); };
    const items = A.points.map(p => [p.kind + ':' + p.id, p.ar, p.kind === 'park' ? 'P♿' : '▲ ' + p.id]);
    window.printReport({ title: 'ملصقات «أنت هنا» على مسار ذوي الإعاقة', subtitle: 'تُثبَّت عند البوابات ومواقف ذوي الإعاقة: مسح الرمز يفتح مسار ذوي الإعاقة من هذه النقطة إلى أي مبنى', orientation: 'portrait', fit: false, qr: false,
      raw: `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">${items.map(([k, n, ic]) => `<div style="border:2px solid #1d4ed8;border-radius:12px;padding:14px;text-align:center;page-break-inside:avoid">
        <div style="font-size:30pt;color:#1d4ed8">♿</div><div style="font-size:15pt;font-weight:800">أنت هنا: ${esc(n)}</div><div style="width:52%;margin:10px auto">${qr(SITE + 'access.html?from=' + encodeURIComponent(k))}</div>
        <div style="font-size:11pt">امسح الرمز لأقصر مسار لذوي الإعاقة إلى المدخل الميسّر لأي مبنى</div><div style="font-size:9pt;color:#555;margin-top:4px">${esc(ic)} · ${esc(SITE)}access.html</div></div>`).join('')}</div>`,
      note: 'المسار من مخطط الجامعة لمسار ذوي الاحتياجات الخاصة.' });
  }
  U.getJSON('data/campus_access.json?v=3').then(d => {
    A = d; W = d.w; H = d.h; K = W / 1280; build();
    const here = P.get('here'); if (here && placeOf(here)) st.from = here;   // a «أنت هنا» sticker
    const site = P.get('site') && d.buildings.find(b => b.site === P.get('site')); if (site) st.to = 'b:' + site.n;   // from «خريطة الحرم»: ?site=<its building number>
    if (st.to && !placeOf(st.to)) st.to = ''; if (!placeOf(st.from)) st.from = 'gate:1';
    render(); if (st.to) setTimeout(focusRoute, 50);
    if (U.updatedLine && d.updated) U.updatedLine(d.updated, 'المسار من مخطط الجامعة لمسار ذوي الاحتياجات الخاصة');
    window.addEventListener('resize', () => fit()); document.addEventListener('fullscreenchange', () => { render(); setTimeout(() => fit(), 60); });
  }).catch(e => { app.innerHTML = `<div class="alert alert-danger mt-3">تعذّر تحميل المسار (${esc(e.message)}).</div>`; });

  document.head.insertAdjacentHTML('beforeend', `<style>
    #ac-app { color: #111; }
    .ac-head { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; margin: 6px 0 14px; }
    .ac-title { display: flex; gap: 12px; align-items: center; } .ac-ico { width: 54px; height: 54px; border-radius: 14px; background: #1d4ed8; color: #fff; font-size: 2rem; display: flex; align-items: center; justify-content: center; flex: none; }
    .ac-title h2 { margin: 0; font-size: 1.45rem; font-weight: 800; } .ac-title p { margin: 2px 0 0; font-size: .93rem; }
    .ac-kpis { display: flex; gap: 8px; flex-wrap: wrap; } .ac-kpis div { background: #fff; border: 1px solid #e3ddcf; border-radius: 12px; padding: 8px 12px; display: grid; grid-template-columns: auto auto; column-gap: 8px; align-items: center; }
    .ac-kpis i { grid-row: span 2; font-size: 1.35rem; color: #1d4ed8; } .ac-kpis b { font-size: 1.1rem; } .ac-kpis span { font-size: .78rem; }
    .ac-grid { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 14px; align-items: start; }
    @media (max-width: 1000px) { .ac-grid { grid-template-columns: 1fr; } }
    .ac-mapc { background: #fff; border: 1px solid #e3ddcf; border-radius: 14px; padding: 10px; position: sticky; top: 10px; }
    .ac-map { position: relative; height: min(74vh, 720px); overflow: hidden; border-radius: 10px; background: #f8fafc; cursor: grab; touch-action: none; outline: none; }
    .ac-map:focus-visible { box-shadow: 0 0 0 3px #1d4ed8; } .ac-map:active { cursor: grabbing; }
    #ac-in { position: absolute; top: 0; left: 0; width: 100%; transform-origin: 0 0; } #ac-in img { width: 100%; height: auto; display: block; user-select: none; } #ac-in.dim img { opacity: .45; filter: grayscale(.6); }
    #ac-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    #ac-svg polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .ac-case { stroke: #fff; stroke-width: calc(7px * var(--k,1)); } .ac-net { stroke: #dc2626; stroke-width: calc(3.5px * var(--k,1)); stroke-dasharray: 9 6; animation: acDash 1.6s linear infinite; }
    .ac-link { stroke: #64748b; stroke-width: calc(2.5px * var(--k,1)); stroke-dasharray: 2 5; }
    .ac-rcase { stroke: #fff; stroke-width: calc(11px * var(--k,1)); filter: drop-shadow(0 1px 3px rgba(0,0,0,.5)); } .ac-route { stroke: #991b1b; stroke-width: calc(7px * var(--k,1)); stroke-dasharray: none; animation: acDash .9s linear infinite; }
    @keyframes acDash { to { stroke-dashoffset: -30; } }
    @media (prefers-reduced-motion: reduce) { .ac-net, .ac-route { animation: none; } }
    .ac-ent circle { fill: #1d4ed8; stroke: #fff; stroke-width: 2; } .ac-ent text { fill: #fff; font-size: 9.5px; text-anchor: middle; pointer-events: none; } .ac-ent.on circle { fill: #15803d; }
    .ac-park rect { fill: #0b4a66; stroke: #fff; stroke-width: 2; } .ac-park text { fill: #fff; font-size: 8.5px; font-weight: 700; text-anchor: middle; }
    .ac-gate path { fill: #1e3a8a; stroke: #fff; stroke-width: 2; } .ac-gate text { fill: #fff; font-size: 10px; font-weight: 700; text-anchor: middle; }
    .ac-b { cursor: pointer; } .ac-b circle { fill: #901d23; stroke: #fff; stroke-width: 2.5; } .ac-b text { fill: #fff; font-size: 13px; font-weight: 700; text-anchor: middle; pointer-events: none; }
    .ac-b.to circle { fill: #15803d; } .ac-b.from circle { fill: #1d4ed8; } .ac-b.off circle { fill: #9ca3af; } .ac-b:hover circle { stroke: #fde68a; stroke-width: 4; }
    .ac-pin.a circle { fill: #15803d; stroke: #fff; stroke-width: 3; } .ac-pin.z path { fill: #b42318; stroke: #fff; stroke-width: 2; }
    .ac-zoom { position: absolute; top: 10px; left: 10px; display: grid; gap: 6px; } .ac-zoom button { width: 38px; height: 38px; border-radius: 10px; border: 1px solid #d9d3c3; background: #fff; font-size: 1.05rem; box-shadow: 0 2px 6px rgba(0,0,0,.1); }
    .ac-north { position: absolute; top: 10px; right: 10px; background: #fff; border: 1px solid #d9d3c3; border-radius: 10px; padding: 4px 8px; text-align: center; line-height: 1.1; font-weight: 700; }
    .ac-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: .86rem; } .ac-legend span { display: inline-flex; gap: 6px; align-items: center; }
    .ac-legend i { display: inline-block; width: 26px; height: 0; border-top: 4px dashed #dc2626; } .ac-legend i.ac-l-route { border-top: 6px solid #991b1b; } .ac-legend i.ac-l-link { border-top: 3px dotted #64748b; }
    .ac-legend i.ac-l-ent, .ac-legend i.ac-l-park, .ac-legend i.ac-l-gate, .ac-legend i.ac-l-b { width: 16px; height: 16px; border: 0; border-radius: 50%; background: #1d4ed8; }
    .ac-legend i.ac-l-park { border-radius: 4px; background: #0b4a66; } .ac-legend i.ac-l-gate { border-radius: 0; background: #1e3a8a; clip-path: polygon(50% 0, 100% 100%, 0 100%); } .ac-legend i.ac-l-b { background: #901d23; }
    .ac-layers { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #eee; font-size: .88rem; } .ac-layers input { accent-color: #901d23; }
    .ac-side { display: grid; gap: 14px; }
    .ac-card { background: #fff; border: 1px solid #e3ddcf; border-radius: 14px; padding: 14px; } .ac-card h3 { font-size: 1.05rem; font-weight: 800; display: flex; gap: 8px; align-items: center; margin: 0 0 10px; } .ac-card h3 i { color: #1d4ed8; }
    .ac-card label { display: grid; gap: 4px; font-weight: 600; font-size: .9rem; margin: 0; }
    .ac-swap { display: block; margin: 6px auto; width: 34px; height: 34px; border-radius: 50%; border: 1px solid #d9d3c3; background: #fff; }
    .ac-res { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 8px; } .ac-res div { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 8px; text-align: center; } .ac-res b { display: block; font-size: 1.2rem; color: #1d4ed8; } .ac-res span { font-size: .8rem; }
    .ac-steps { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 6px; } .ac-steps li { display: grid; grid-template-columns: 24px 1fr; gap: 8px; font-size: .92rem; } .ac-steps i { color: #1d4ed8; font-size: 1.1rem; } .ac-steps small { display: block; font-weight: 700; }
    .ac-acts { display: flex; flex-wrap: wrap; gap: 6px; } .ac-hint { font-size: .9rem; margin: 10px 0 0; } .ac-warn { color: #b42318; font-weight: 600; margin-top: 10px; }
    .ac-n { margin-inline-start: auto; font-size: .8rem; background: #eff6ff; color: #1d4ed8; border-radius: 99px; padding: 1px 9px; }
    .ac-blist { display: grid; gap: 6px; max-height: 420px; overflow: auto; }
    .ac-bi { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; text-align: start; background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 7px 9px; color: #111; }
    .ac-bi:hover, .ac-bi.on { border-color: #1d4ed8; background: #f5f9ff; }
    .ac-bn { width: 30px; height: 30px; border-radius: 50%; background: #901d23; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .ac-bt b { display: block; font-size: .92rem; } .ac-bt small { font-size: .76rem; } .ac-bs { text-align: end; font-size: .8rem; } .ac-bs small { display: block; }
    .ac-ok { color: #1d4ed8; font-weight: 700; } .ac-no { color: #6b7280; }
    .ac-mask { fill: #fff; } .ac-tx { fill: #111; font-weight: 700; text-anchor: middle; dominant-baseline: central; } .ac-mask.dk { fill: #6b6b6b; } .ac-tx.dk { fill: #fff; }
    .ac-nm rect { fill: rgba(255,255,255,.95); stroke: #901d23; stroke-width: 1.2; } .ac-nm text { fill: #111 !important; font-size: 11px !important; font-weight: 700; } .ac-b.to .ac-nm rect { stroke: #15803d; fill: #f0fdf4; } .ac-b.hl .ac-nm rect { stroke: #f59e0b; }
    .ac-b.hl circle { fill: #f59e0b; stroke: #fff; stroke-width: 4; } .ac-b.hl { filter: drop-shadow(0 0 6px rgba(245,158,11,.9)); }
    .ac-tools { position: absolute; bottom: 10px; left: 10px; display: flex; gap: 6px; } .ac-tools button { width: 38px; height: 38px; border-radius: 10px; border: 1px solid #d9d3c3; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.1); } .ac-tools button.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .ac-key { position: absolute; top: 10px; left: 58px; width: 270px; max-width: calc(100% - 130px); background: rgba(255,255,255,.97); border: 1px solid #e3ddcf; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.12); overflow: hidden; }
    .ac-key-h { width: 100%; display: flex; align-items: center; gap: 6px; background: #fff; border: 0; border-bottom: 1px solid #eee; padding: 8px 12px; font-weight: 800; } .ac-key-h .bi:last-child { margin-inline-start: auto; }
    .ac-key.shut .ac-key-b { display: none; } .ac-key.shut .ac-key-h { border-bottom: 0; }
    .ac-key-b { max-height: min(46vh, 430px); overflow: auto; padding: 4px; }
    .ac-key-b > button { width: 100%; display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; text-align: start; background: none; border: 0; border-radius: 8px; padding: 4px 6px; color: #111; }
    .ac-key-b > button:hover, .ac-key-b > button:focus-visible { background: #fff7e6; } .ac-key-b > button.on { background: #eff6ff; outline: 1px solid #93c5fd; }
    .ac-key-b .ac-bn { width: 26px; height: 26px; font-size: .8rem; } .ac-key-b b { display: block; font-size: .86rem; line-height: 1.3; } .ac-key-b small { display: block; font-size: .72rem; line-height: 1.2; } .ac-key-b i.ac-ok { font-style: normal; }
    .ac-key-l { display: flex; gap: 12px; padding: 6px 8px 4px; border-top: 1px dashed #eee; margin-top: 4px; font-size: .78rem; } .ac-key-l i { display: inline-block; width: 22px; border-top: 4px dashed #6d28d9; vertical-align: middle; } .ac-key-l i.ac-l-route { border-top: 5px solid #1d4ed8; }
    @media (max-width: 700px) { .ac-key { width: auto; right: 56px; left: 56px; max-width: none; } .ac-key-b { max-height: 40vh; } }
    .ac-mapc:fullscreen { padding: 0; border-radius: 0; } .ac-mapc:fullscreen .ac-map { height: 100vh; border-radius: 0; } .ac-mapc:fullscreen .ac-legend, .ac-mapc:fullscreen .ac-layers { display: none; }
    #ac-app.ac-bigt { font-size: 1.15rem; } #ac-app.ac-bigt .ac-card label, #ac-app.ac-bigt .ac-steps li, #ac-app.ac-bigt .ac-key-b b { font-size: 1.05rem; }
    #ac-app.ac-hc .ac-card, #ac-app.ac-hc .ac-mapc, #ac-app.ac-hc .ac-key { border: 2px solid #000; } #ac-app.ac-hc #ac-in img { filter: grayscale(1) contrast(.8) brightness(1.15); }
    #ac-app.ac-hc .ac-net { stroke: #000; stroke-width: calc(5px * var(--k,1)); } #ac-app.ac-hc .ac-route { stroke: #7f1d1d; stroke-width: calc(8px * var(--k,1)); } #ac-app.ac-hc .ac-ok { color: #0033ff; }
    .ac-note p { font-size: .9rem; line-height: 1.8; margin-bottom: 8px; }
    @media print { .ac-zoom, .ac-layers { display: none !important; } }
  </style>`);
})();
