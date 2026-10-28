/* network.html: co-authorship network inside the university */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data;
  try { data = await R.load('researchers'); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta);
  R.cmp.render();
  const facs = R.faculties(list);
  facs.forEach(R.facColor);
  const edgesAll = [];
  list.forEach(r => (r.coauthors || []).forEach(([b, c]) => { if (r.id < b && byId[b]) edgesAll.push({ source: r.id, target: b, w: c }); }));
  const cross = edgesAll.filter(e => byId[e.source].faculty !== byId[e.target].faculty);

  app.innerHTML = `
  <section class="rs-section rs-kpis">
    <div class="rs-kpi"><div class="v">${R.n(new Set(edgesAll.flatMap(e => [e.source, e.target])).size)}</div><div class="l"><i class="bi bi-person-check"></i>باحث لديه شريك داخل الجامعة</div></div>
    <div class="rs-kpi navy"><div class="v">${R.n(edgesAll.length)}</div><div class="l"><i class="bi bi-share"></i>ثنائي تعاون</div></div>
    <div class="rs-kpi gold"><div class="v">${R.pct(cross.length / (edgesAll.length || 1))}</div><div class="l"><i class="bi bi-arrow-left-right"></i>تعاون بين كليات مختلفة</div></div>
    <div class="rs-kpi teal"><div class="v">${R.n(R.sum(edgesAll.map(e => e.w)))}</div><div class="l"><i class="bi bi-journal-plus"></i>بحث مشترك (مجموع الثنائيات)</div></div>
  </section>
  <div class="rs-toolbar no-print mb-2">
    <div class="fld grow"><label for="n-q">ابحث عن باحث في الشبكة</label><input id="n-q" class="form-control" type="search" placeholder="اسم الباحث…"></div>
    <div class="fld"><label for="n-fac">الكلية</label><select id="n-fac" class="form-select"><option value="">كل الكليات</option>${facs.map(f => `<option>${R.esc(f)}</option>`).join('')}</select></div>
    <div class="fld"><label for="n-min">أبحاث مشتركة على الأقل</label><select id="n-min" class="form-select"><option>1</option><option>2</option><option>3</option><option>5</option></select></div>
    <div class="fld"><label class="form-check-label" for="n-cross">&nbsp;</label><div class="form-check mt-1"><input class="form-check-input" type="checkbox" id="n-cross"><label class="form-check-label small" for="n-cross">بين الكليات فقط</label></div></div>
  </div>
  <div class="rs-legend mb-2" id="n-legend">${facs.map(f => `<span data-f="${R.esc(f)}"><i style="background:${R.facColor(f)}"></i>${R.esc(f)}</span>`).join('')}</div>
  <div class="rs-netbar no-print"><div class="st" id="n-stats"></div>
    <div class="btns"><button class="rs-nbtn" id="n-zin" title="تكبير"><i class="bi bi-zoom-in"></i></button><button class="rs-nbtn" id="n-zout" title="تصغير"><i class="bi bi-zoom-out"></i></button><button class="rs-nbtn" id="n-fit" title="ملاءمة الشاشة"><i class="bi bi-arrows-fullscreen"></i></button><button class="rs-nbtn" id="n-lab" title="إظهار كل الأسماء"><i class="bi bi-fonts"></i> الأسماء</button></div></div>
  <div class="rs-net" id="n-box"><svg id="n-svg"></svg><div class="tip" id="n-tip"></div></div>
  <p class="rs-note mt-2"><i class="bi bi-info-circle-fill" style="color:#2b5ea7"></i> حجم الدائرة = عدد المنشورات · سُمك الخط = عدد الأبحاث المشتركة · لون الخط = لون الكلية للتعاون داخلها، ورمادي-أزرق للتعاون بين كليتين · تظهر أسماء الأكثر تعاوناً، ومرّر الفأرة على أي باحث لرؤية شركائه، وانقر لفتح ملفه.</p>
  <section class="rs-section rs-grid">
    <div class="rs-card"><h3><i class="bi bi-people"></i>أقوى ثنائيات التعاون</h3><div class="rs-scroll" style="max-height:420px"><table class="rs-table"><tbody>
      ${[...edgesAll].sort((a, b) => b.w - a.w).slice(0, 25).map(e => `<tr><td><a href="${R.profileUrl(byId[e.source])}">${R.esc(byId[e.source].name)}</a></td><td><i class="bi bi-arrow-left-right text-muted"></i></td><td><a href="${R.profileUrl(byId[e.target])}">${R.esc(byId[e.target].name)}</a></td><td class="num"><b>${e.w}</b></td><td><a class="rs-src" href="compare.html?ids=${e.source},${e.target}">قارن</a></td></tr>`).join('')}</tbody></table></div></div>
    <div class="rs-card"><h3><i class="bi bi-grid-3x3"></i>مصفوفة التعاون بين الكليات</h3><div class="rs-scroll" id="n-matrix"></div></div>
  </section>`;

  // faculty × faculty matrix
  const M = {}; edgesAll.forEach(e => { const a = byId[e.source].faculty, b = byId[e.target].faculty; const k = [a, b].sort().join('|'); M[k] = (M[k] || 0) + e.w; });
  const mx = Math.max(1, ...Object.values(M));
  const short = f => f.replace(/^كلية\s+/, '').split(/\s+/).slice(0, 2).join(' ');
  R.$('#n-matrix').innerHTML = `<table class="rs-table"><thead><tr><th></th>${facs.map(f => `<th class="num" title="${R.esc(f)}"><small>${R.esc(short(f))}</small></th>`).join('')}</tr></thead><tbody>${facs.map(a => `<tr><td><small>${R.esc(short(a))}</small></td>${facs.map(b => { const v = M[[a, b].sort().join('|')] || 0; return `<td class="num" style="background:${v ? R.alpha('#901d23', .1 + .8 * v / mx) : 'transparent'};color:${v / mx > .5 ? '#fff' : 'inherit'}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;

  if (!window.d3) { R.$('#n-box').innerHTML = '<div class="rs-empty">تعذّر تحميل مكتبة الرسم</div>'; return; }
  const svg = d3.select('#n-svg'), tip = R.$('#n-tip');
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([.2, 6]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  let labelsAll = false;
  function fit(N, W, H, rad) {
    const xs = N.map(d => d.x), ys = N.map(d => d.y), pad = 40;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad + 16;
    const k = Math.min(2, .95 * Math.min(W / (x1 - x0), H / (y1 - y0)));
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }
  const hidden = new Set();
  let sim;

  function draw() {
    const fac = R.$('#n-fac').value, min = +R.$('#n-min').value, crossOnly = R.$('#n-cross').checked;
    const E = edgesAll.filter(e => e.w >= min && (!crossOnly || byId[e.source].faculty !== byId[e.target].faculty) &&
      !hidden.has(byId[e.source].faculty) && !hidden.has(byId[e.target].faculty) &&
      (!fac || byId[e.source].faculty === fac || byId[e.target].faculty === fac)).map(e => Object.assign({}, e));
    const ids = new Set(E.flatMap(e => [e.source, e.target]));
    const N = [...ids].map(id => ({ id, r: byId[id] }));
    const box = R.$('#n-box').getBoundingClientRect(), W = box.width, H = box.height;
    g.selectAll('*').remove();
    if (sim) sim.stop();
    if (!N.length) { g.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle').attr('fill', '#888').text('لا توجد روابط بهذه الشروط'); return; }
    const maxW = Math.max(1, ...N.map(d => d.r.works || 1));
    const rad = d => 6 + 16 * Math.sqrt((d.r.works || 1) / maxW);
    const deg = {}; E.forEach(e => { deg[e.source] = (deg[e.source] || 0) + e.w; deg[e.target] = (deg[e.target] || 0) + e.w; });
    const q = R.norm(R.$('#n-q').value);
    const hit = d => q && d.r._q.includes(q);
    const topIds = new Set(N.slice().sort((a, b) => (deg[b.id] || 0) - (deg[a.id] || 0)).slice(0, labelsAll ? N.length : Math.min(30, Math.ceil(N.length * .35))).map(d => d.id));
    const short = d => d.r.name.replace(/^(أ\.?\s*د\.?|د\.|أ\.|م\.)\s*/, '').split(/\s+/).slice(0, 2).join(' ');
    const mw = Math.max(1, ...E.map(e => e.w));
    const link = g.append('g').attr('fill', 'none').selectAll('path').data(E).join('path')
      .attr('stroke', e => byId[e.source].faculty === byId[e.target].faculty ? R.facColor(byId[e.source].faculty) : '#7d8f99')
      .attr('stroke-opacity', .35).attr('stroke-width', d => 1 + 5 * Math.sqrt(d.w / mw)).attr('stroke-linecap', 'round');
    const node = g.append('g').selectAll('g').data(N).join('g').style('cursor', 'pointer');
    node.append('circle').attr('r', rad).attr('fill', d => R.facColor(d.r.faculty)).attr('fill-opacity', .92)
      .attr('stroke', d => hit(d) ? '#ffd34d' : '#fff').attr('stroke-width', d => hit(d) ? 5 : 2);
    node.filter(d => d.r.photo && rad(d) >= 14).append('clipPath').attr('id', d => 'cp' + d.id).append('circle').attr('r', d => rad(d) - 2);
    node.filter(d => d.r.photo && rad(d) >= 14).append('image').attr('href', d => d.r.photo).attr('x', d => -rad(d) + 2).attr('y', d => -rad(d) + 2).attr('width', d => 2 * rad(d) - 4).attr('height', d => 2 * rad(d) - 4).attr('clip-path', d => `url(#cp${d.id})`).attr('preserveAspectRatio', 'xMidYMid slice').style('pointer-events', 'none');
    const lab = node.append('text').text(short).attr('class', 'rs-nlab').attr('dy', d => rad(d) + 14).attr('text-anchor', 'middle')
      .style('display', d => topIds.has(d.id) || hit(d) ? null : 'none');
    const nb = {}; E.forEach(e => { (nb[e.source] = nb[e.source] || new Set()).add(e.target); (nb[e.target] = nb[e.target] || new Set()).add(e.source); });
    node.on('mouseenter', (ev, d) => {
      const on = o => o.id === d.id || (nb[d.id] && nb[d.id].has(o.id));
      node.style('opacity', o => on(o) ? 1 : .12);
      lab.style('display', o => on(o) ? null : 'none');
      link.attr('stroke-opacity', l => l.source.id === d.id || l.target.id === d.id ? .9 : .04);
      tip.style.display = 'flex';
      tip.innerHTML = `<b>${R.esc(d.r.name)}</b><span class="f" style="--fc:${R.facColor(d.r.faculty)}">${R.esc(d.r.faculty)}</span><small>${R.esc(d.r.dept)}</small><div class="nn"><span><b>${d.r.works}</b> منشور</span><span><b>${d.r.h}</b> h</span><span><b>${(nb[d.id] || new Set()).size}</b> شريك</span><span><b>${deg[d.id] || 0}</b> بحث مشترك</span></div>`;
    }).on('mousemove', ev => { const b = R.$('#n-box').getBoundingClientRect(); tip.style.left = Math.min(b.width - 250, ev.clientX - b.left + 14) + 'px'; tip.style.top = (ev.clientY - b.top + 14) + 'px'; })
      .on('mouseleave', () => { node.style('opacity', 1); lab.style('display', d => topIds.has(d.id) || hit(d) ? null : 'none'); link.attr('stroke-opacity', .35); tip.style.display = 'none'; })
      .on('click', (ev, d) => { if (ev.defaultPrevented) return; location.href = R.profileUrl(d.r); });
    const curve = d => { const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, dr = Math.sqrt(dx * dx + dy * dy) * 1.6; return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`; };
    const tick = () => { link.attr('d', curve); node.attr('transform', d => `translate(${d.x},${d.y})`); };
    sim = d3.forceSimulation(N).force('link', d3.forceLink(E).id(d => d.id).distance(l => 60 + 50 / Math.sqrt(l.w)).strength(.35))
      .force('charge', d3.forceManyBody().strength(d => -230 - 14 * rad(d)))
      .force('collide', d3.forceCollide().radius(d => rad(d) + (topIds.has(d.id) ? 18 : 6)).iterations(3))
      .force('x', d3.forceX(W / 2).strength(.05)).force('y', d3.forceY(H / 2).strength(.07)).stop();
    for (let k = 0; k < 400; k++) sim.tick();   // settle before showing: no jumping
    tick(); fit(N, W, H, rad);
    sim.on('tick', tick);
    node.call(d3.drag().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; }).on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    R.$('#n-stats').innerHTML = `<span><i class="bi bi-person-circle"></i> <b>${N.length}</b> باحث</span><span><i class="bi bi-share-fill"></i> <b>${E.length}</b> رابط تعاون</span><span><i class="bi bi-journal-text"></i> <b>${E.reduce((t, e) => t + e.w, 0)}</b> بحث مشترك</span><span><i class="bi bi-arrow-left-right"></i> <b>${E.filter(e => e.source.r.faculty !== e.target.r.faculty).length}</b> بين كليات</span>`;
    if (q) { const f = N.filter(hit); if (f.length) { const d = f[0]; svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(2).translate(-d.x, -d.y)); } }
  }
  ['#n-fac', '#n-min', '#n-cross'].forEach(s => R.$(s).addEventListener('change', draw));
  R.$('#n-q').addEventListener('input', R.debounce(draw, 300));
  R.$('#n-legend').addEventListener('click', e => { const s = e.target.closest('[data-f]'); if (!s) return; const f = s.dataset.f; hidden.has(f) ? hidden.delete(f) : hidden.add(f); s.classList.toggle('off', hidden.has(f)); draw(); });
  R.$('#n-zin').onclick = () => svg.transition().call(zoom.scaleBy, 1.4);
  R.$('#n-zout').onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.4);
  R.$('#n-fit').onclick = draw;
  R.$('#n-lab').onclick = e => { labelsAll = !labelsAll; e.currentTarget.classList.toggle('on', labelsAll); draw(); };
  draw();
  window.addEventListener('resize', R.debounce(draw, 400));
})();
