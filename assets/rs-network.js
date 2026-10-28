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
  <div class="rs-net" id="n-box"><svg id="n-svg"></svg><div class="tip" id="n-tip"></div></div>
  <p class="rs-note mt-2">حجم الدائرة = عدد المنشورات، وسُمك الخط = عدد الأبحاث المشتركة. اسحب الدوائر، وقرّب بعجلة الفأرة، وانقر على باحث لفتح ملفه.</p>
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
  svg.call(d3.zoom().scaleExtent([.2, 6]).on('zoom', e => g.attr('transform', e.transform)));
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
    const rad = d => 4 + Math.sqrt(d.r.works || 1) * 1.6;
    const link = g.append('g').attr('stroke', '#9c958a').attr('stroke-opacity', .45).selectAll('line').data(E).join('line').attr('stroke-width', d => Math.min(8, .8 + d.w * .9));
    const node = g.append('g').selectAll('g').data(N).join('g').style('cursor', 'pointer');
    node.append('circle').attr('r', rad).attr('fill', d => R.facColor(d.r.faculty)).attr('stroke', '#fff').attr('stroke-width', 1.5);
    node.append('text').text(d => d.r.name.replace(/^(أ\.?\s*د\.?|د\.|أ\.)\s*/, '').split(/\s+/).slice(0, 2).join(' ')).attr('font-size', 10).attr('dy', d => rad(d) + 11).attr('text-anchor', 'middle').attr('fill', '#333').style('pointer-events', 'none').style('display', N.length > 120 ? 'none' : null);
    const nb = {}; E.forEach(e => { (nb[e.source] = nb[e.source] || new Set()).add(e.target); (nb[e.target] = nb[e.target] || new Set()).add(e.source); });
    node.on('mouseenter', (ev, d) => {
      node.style('opacity', o => o.id === d.id || (nb[d.id] && nb[d.id].has(o.id)) ? 1 : .15);
      link.style('stroke-opacity', l => l.source.id === d.id || l.target.id === d.id ? .9 : .05);
      tip.style.display = 'block';
      tip.innerHTML = `<b>${R.esc(d.r.name)}</b><br>${R.esc(d.r.dept)}<br>${d.r.works} منشور · h ${d.r.h} · ${(nb[d.id] || new Set()).size} شريك`;
    }).on('mousemove', ev => { const b = R.$('#n-box').getBoundingClientRect(); tip.style.left = (ev.clientX - b.left + 12) + 'px'; tip.style.top = (ev.clientY - b.top + 12) + 'px'; })
      .on('mouseleave', () => { node.style('opacity', 1); link.style('stroke-opacity', null); tip.style.display = 'none'; })
      .on('click', (ev, d) => { location.href = R.profileUrl(d.r); });
    node.call(d3.drag().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; }).on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    sim = d3.forceSimulation(N).force('link', d3.forceLink(E).id(d => d.id).distance(l => 70 / Math.sqrt(l.w)).strength(.6))
      .force('charge', d3.forceManyBody().strength(-90)).force('center', d3.forceCenter(W / 2, H / 2)).force('collide', d3.forceCollide().radius(d => rad(d) + 3))
      .force('x', d3.forceX(W / 2).strength(.04)).force('y', d3.forceY(H / 2).strength(.04))
      .on('tick', () => { link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y); node.attr('transform', d => `translate(${d.x},${d.y})`); });
    const q = R.norm(R.$('#n-q').value);
    if (q) node.select('circle').attr('stroke', d => d.r._q.includes(q) ? '#000' : '#fff').attr('stroke-width', d => d.r._q.includes(q) ? 4 : 1.5);
  }
  ['#n-fac', '#n-min', '#n-cross'].forEach(s => R.$(s).addEventListener('change', draw));
  R.$('#n-q').addEventListener('input', R.debounce(draw, 300));
  R.$('#n-legend').addEventListener('click', e => { const s = e.target.closest('[data-f]'); if (!s) return; const f = s.dataset.f; hidden.has(f) ? hidden.delete(f) : hidden.add(f); s.classList.toggle('off', hidden.has(f)); draw(); });
  draw();
  window.addEventListener('resize', R.debounce(draw, 400));
})();
