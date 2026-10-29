/* Two more views of the staff directory (directory.html?view=tree | ?view=graph), on the list the filters give:
   - tree: the hierarchy unit → its leadership → departments (head first) → people, foldable, with extensions;
   - graph: an interactive network (d3, loaded on first use): the university, its faculties and units, their
     departments and every person, sized by position and coloured by staff type; zoom, drag, hover for details,
     click a person for the full card. Used by app.js through window.UOP_DIR_VIEWS. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const firstDept = m => String(m.department || '').split('،').map(x => x.trim()).filter(Boolean)[0] || '';
  const ROLE_ORDER = r => ['رئيس مجلس الأمناء', 'رئيس الجامعة', 'نائب رئيس الجامعة', 'عميد', 'نائب عميد', 'مساعد عميد / رئيس', 'مدير', 'رئيس قسم'].indexOf(r);
  const byRole = (a, b) => ((ROLE_ORDER(a.role) + 1 || 99) - (ROLE_ORDER(b.role) + 1 || 99)) || (a.rank_order - b.rank_order) || a.name.localeCompare(b.name, 'ar');
  const TYPE = { academic: ['أكاديمي', '#901d23'], admin: ['إداري', '#0b4a66'], board: ['مجلس الأمناء', '#b8892b'] };

  // ---------------------------------------------------------------- the hierarchy as data
  function hierarchy(list, FAC) {
    const units = new Map();
    list.forEach(m => {
      const key = String(m.faculty);
      const u = units.get(key) || units.set(key, { id: key, name: (FAC[m.faculty] || {}).name || 'غير محدد', lead: [], depts: new Map(), staff: [], all: [] }).get(key);
      u.all.push(m);
      const d = firstDept(m);
      if (m.role && (!d || m.role !== 'رئيس قسم')) { u.lead.push(m); return; }
      if (d) { const x = u.depts.get(d) || u.depts.set(d, { name: d, head: [], people: [] }).get(d); (m.role === 'رئيس قسم' ? x.head : x.people).push(m); return; }
      u.staff.push(m);
    });
    units.forEach(u => { u.lead.sort(byRole); u.staff.sort(byRole); u.depts.forEach(d => d.people.sort(byRole)); });
    return [...units.values()];
  }

  // ---------------------------------------------------------------- tree view
  function tree(list, ctx) {
    const U = hierarchy(list, ctx.FAC), open = list.length <= 140;
    const person = (m, lead) => `<div class="ot-p copy-email ${lead ? 'lead' : ''} ${m.type}" data-email="${esc(m.email)}" title="${m.email ? 'انقر لنسخ البريد: ' + esc(m.email) : ''}">
      ${ctx.avatar(m, 'sm')}<div class="ot-pt"><b>${esc(m.name)}</b><small>${esc(m.role ? (ctx.jobText(m) || m.role) : (m.rank || ctx.jobText(m) || ''))}</small></div>
      ${m.ext ? `<a class="ot-ext" href="tel:${esc(ctx.tel(m))}" title="فرعي ${esc(m.ext)}"><i class="bi bi-telephone-fill"></i> ${esc(m.ext)}</a>` : ''}</div>`;
    const cnt = ps => { const a = ps.filter(m => m.type === 'academic').length, d = ps.length - a; return `${a ? `<span class="ot-c a">${a} أكاديمي</span>` : ''}${d ? `<span class="ot-c d">${d} ${ps.some(m => m.type === 'board') ? 'عضو' : 'إداري'}</span>` : ''}`; };
    return `<div class="ot-bar no-print"><button type="button" class="btn btn-sm btn-outline-primary" data-ot="open"><i class="bi bi-arrows-expand"></i> توسيع الكل</button>
        <button type="button" class="btn btn-sm btn-outline-primary" data-ot="close"><i class="bi bi-arrows-collapse"></i> طي الكل</button>
        <span class="small text-muted ms-2"><i class="bi bi-info-circle"></i> الوحدة ← قيادتها ← الأقسام (رئيس القسم أولاً) ← الأعضاء</span></div>
      <div class="org-tree"><div class="ot-root"><img src="assets/logo.png" alt=""><b>جامعة البترا</b><small>${list.length} موظفاً في ${U.length} ${U.length === 1 ? 'وحدة' : 'وحدات وكليات'}</small></div>
      <ul class="ot-units">${U.map(u => `<li><details class="ot-unit" ${open || U.length <= 2 ? 'open' : ''}>
        <summary><i class="bi bi-chevron-left ot-chev"></i><i class="bi ${/^\d+$/.test(u.id) ? 'bi-mortarboard-fill' : 'bi-building'} ot-ic"></i><b>${esc(u.name)}</b>
          <span class="ot-cs">${cnt(u.all)}${u.depts.size ? `<span class="ot-c">${u.depts.size} أقسام</span>` : ''}</span>
          <span class="ot-mini">${u.lead.slice(0, 4).map(m => ctx.avatar(m, 'sm')).join('')}</span></summary>
        <div class="ot-body">
          ${u.lead.length ? `<div class="ot-lead">${u.lead.map(m => person(m, true)).join('')}</div>` : ''}
          ${u.depts.size ? `<ul class="ot-depts">${[...u.depts.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(d => `<li><details class="ot-dept" ${open ? 'open' : ''}>
            <summary><i class="bi bi-chevron-left ot-chev"></i><i class="bi bi-diagram-3 ot-ic"></i><b>قسم ${esc(d.name)}</b><span class="ot-cs">${cnt(d.head.concat(d.people))}</span>
              ${d.head[0] ? `<span class="ot-head">${ctx.avatar(d.head[0], 'sm')} ${esc(d.head[0].name)}</span>` : ''}</summary>
            <div class="ot-people">${d.head.map(m => person(m, true)).join('')}${d.people.map(m => person(m)).join('')}</div></details></li>`).join('')}</ul>` : ''}
          ${u.staff.length ? `<details class="ot-dept ot-staff" ${open || !u.depts.size ? 'open' : ''}><summary><i class="bi bi-chevron-left ot-chev"></i><i class="bi bi-people ot-ic"></i><b>${u.depts.size ? 'الكادر الإداري والفني' : 'الكادر'}</b><span class="ot-cs">${cnt(u.staff)}</span></summary>
            <div class="ot-people">${u.staff.map(m => person(m)).join('')}</div></details>` : ''}
        </div></details></li>`).join('')}</ul></div>`;
  }
  function bindTree(root) {
    root.querySelectorAll('[data-ot]').forEach(b => b.addEventListener('click', () => root.querySelectorAll('.org-tree details').forEach(d => { d.open = b.dataset.ot === 'open'; })));
    root.querySelectorAll('.ot-ext').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
  }

  // ---------------------------------------------------------------- graph view
  let d3p = null;
  const loadD3 = () => window.d3 ? Promise.resolve() : (d3p = d3p || new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'; s.onload = ok; s.onerror = () => no(new Error('d3')); document.head.appendChild(s); }));
  function graphShell(list) {
    return `<div class="og-wrap" id="og-wrap"><div class="og-tools no-print">
        <div class="og-legend"><span><i style="background:#901d23"></i> أكاديمي</span><span><i style="background:#0b4a66"></i> إداري</span><span><i style="background:#b8892b"></i> مجلس الأمناء</span>
          <span><i class="ring"></i> منصب قيادي</span><span><i class="sq"></i> كلية / وحدة</span><span><i class="sq d"></i> قسم</span></div>
        <div class="btn-group btn-group-sm"><button type="button" class="btn btn-light" data-og="in" title="تكبير"><i class="bi bi-zoom-in"></i></button>
          <button type="button" class="btn btn-light" data-og="out" title="تصغير"><i class="bi bi-zoom-out"></i></button>
          <button type="button" class="btn btn-light" data-og="fit" title="ملاءمة الشاشة"><i class="bi bi-fullscreen"></i></button>
          <button type="button" class="btn btn-light" data-og="names" title="إظهار الأسماء"><i class="bi bi-fonts"></i></button></div></div>
      <svg id="og-svg" role="img" aria-label="شبكة الموظفين: ${list.length} موظفاً"></svg>
      <div class="og-tip" id="og-tip" hidden></div><div class="og-card" id="og-card" hidden></div>
      <div class="og-load" id="og-load"><div class="spinner-border text-danger"></div><span>جارٍ بناء الشبكة…</span></div></div>`;
  }
  function graph(root, list, ctx) {
    loadD3().then(() => draw(root, list, ctx)).catch(() => { const l = root.querySelector('#og-load'); if (l) l.innerHTML = 'تعذّر تحميل مكتبة الرسم. تحقق من الاتصال.'; });
  }
  function draw(root, list, ctx) {
    const d3 = window.d3, wrap = root.querySelector('#og-wrap'), svgEl = root.querySelector('#og-svg');
    if (!wrap) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const U = hierarchy(list, ctx.FAC);
    const nodes = [{ id: 'root', kind: 'root', name: 'جامعة البترا', r: 34 }], links = [];
    U.forEach(u => {
      const uid = 'u:' + u.id;
      nodes.push({ id: uid, kind: 'unit', name: u.name, r: 13 + Math.min(18, Math.sqrt(u.all.length) * 2.2), n: u.all.length });
      links.push({ source: 'root', target: uid, kind: 'u' });
      const P = (m, parent) => { nodes.push({ id: 'p:' + m.id, kind: 'person', m, name: m.name, r: m.role ? 12 : 7 }); links.push({ source: parent, target: 'p:' + m.id, kind: 'p' }); };
      u.lead.forEach(m => P(m, uid));
      u.staff.forEach(m => P(m, uid));
      u.depts.forEach(d => {
        const did = uid + '|' + d.name;
        nodes.push({ id: did, kind: 'dept', name: d.name, r: 9 + Math.min(8, Math.sqrt(d.head.length + d.people.length) * 1.5) });
        links.push({ source: uid, target: did, kind: 'd' });
        d.head.forEach(m => P(m, did)); d.people.forEach(m => P(m, did));
      });
    });
    const svg = d3.select(svgEl).attr('viewBox', [-W / 2, -H / 2, W, H]);
    svg.selectAll('*').remove();
    const defs = svg.append('defs');
    const g = svg.append('g');
    const color = n => n.kind === 'person' ? (TYPE[n.m.type] || TYPE.admin)[1] : n.kind === 'unit' ? '#091b22' : n.kind === 'dept' ? '#1f6f78' : '#901d23';
    // photos as circle fills
    nodes.filter(n => n.kind === 'person' && n.m.photo).forEach((n, i) => {
      n.pat = 'ogp' + i;
      defs.append('pattern').attr('id', n.pat).attr('patternContentUnits', 'objectBoundingBox').attr('width', 1).attr('height', 1)
        .append('image').attr('href', n.m.photo).attr('width', 1).attr('height', 1).attr('preserveAspectRatio', 'xMidYMid slice');
    });
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(l => l.kind === 'u' ? 170 : l.kind === 'd' ? 70 : 26).strength(l => l.kind === 'p' ? 1 : .7))
      .force('charge', d3.forceManyBody().strength(d => d.kind === 'person' ? -18 : d.kind === 'dept' ? -160 : d.kind === 'unit' ? -520 : -900))
      .force('collide', d3.forceCollide(d => d.r + 2))
      .force('x', d3.forceX().strength(.03)).force('y', d3.forceY().strength(.03));
    const link = g.append('g').attr('class', 'og-links').selectAll('line').data(links).join('line').attr('class', l => 'og-l ' + l.kind);
    const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', d => 'og-n ' + d.kind + (d.m && d.m.role ? ' lead' : ''));
    node.filter(d => d.kind === 'unit' || d.kind === 'dept').append('rect')
      .attr('x', d => -d.r).attr('y', d => -d.r).attr('width', d => 2 * d.r).attr('height', d => 2 * d.r).attr('rx', d => d.kind === 'unit' ? 10 : 6).attr('fill', color);
    node.filter(d => d.kind === 'root').append('circle').attr('r', d => d.r).attr('fill', '#901d23');
    node.filter(d => d.kind === 'root').append('image').attr('href', 'assets/logo.png').attr('x', -22).attr('y', -22).attr('width', 44).attr('height', 44).style('filter', 'brightness(0) invert(1)');
    node.filter(d => d.kind === 'person').append('circle').attr('r', d => d.r).attr('fill', d => d.pat ? `url(#${d.pat})` : color(d))
      .attr('stroke', d => d.m.role ? '#f5b301' : color(d)).attr('stroke-width', d => d.m.role ? 3 : 1.6);
    node.filter(d => d.kind === 'unit' || d.kind === 'dept').append('text').attr('class', 'og-ic').attr('dy', '.35em').attr('text-anchor', 'middle')
      .text(d => d.kind === 'unit' ? d.n : '');
    const label = node.filter(d => d.kind !== 'person').append('text').attr('class', d => 'og-t ' + d.kind).attr('dy', d => d.r + 14).attr('text-anchor', 'middle')
      .text(d => d.kind === 'root' ? '' : d.kind === 'dept' ? d.name : d.name.replace(/^كلية\s/, ''));
    const plabel = node.filter(d => d.kind === 'person').append('text').attr('class', 'og-t person').attr('dy', d => d.r + 11).attr('text-anchor', 'middle')
      .text(d => d.name.replace(/^(أ\.?\s?د|ا\.?\s?د|د|م|أ)\.+\s*/, '').split(/\s+/).slice(0, 2).join(' '));
    let names = false, k = 1;
    const showNames = () => plabel.style('display', names || k > 1.8 ? null : 'none');
    showNames();
    const zoom = d3.zoom().scaleExtent([.2, 6]).on('zoom', e => { g.attr('transform', e.transform); k = e.transform.k; showNames(); });
    svg.call(zoom).on('dblclick.zoom', null);
    // hover: the person's path to the root, the rest faded
    const tip = root.querySelector('#og-tip'), card = root.querySelector('#og-card');
    const parentOf = {}; links.forEach(l => { parentOf[(l.target.id || l.target)] = l.source.id || l.source; });
    const chain = id => { const s = new Set([id]); let p = parentOf[id]; while (p) { s.add(p); p = parentOf[p]; } return s; };
    node.on('mouseenter', (e, d) => {
      const c = chain(d.id);
      if (d.kind !== 'person') nodes.forEach(n => { let p = n.id; while (p) { if (p === d.id) { c.add(n.id); break; } p = parentOf[p]; } });
      node.classed('dim', n => !c.has(n.id)); link.classed('dim', l => !(c.has(l.source.id) && c.has(l.target.id)));
      const m = d.m;
      tip.innerHTML = m ? `<b>${esc(m.name)}</b><span>${esc(m.role || ctx.jobText(m) || m.rank || '')}</span><span>${esc((ctx.FAC[m.faculty] || {}).name || '')}${firstDept(m) ? ' · ' + esc(firstDept(m)) : ''}</span>${m.ext ? `<span><i class="bi bi-telephone-fill"></i> ${esc(m.ext)}</span>` : ''}`
        : `<b>${esc(d.name)}</b>${d.n ? `<span>${d.n} موظفاً</span>` : ''}`;
      tip.hidden = false;
    }).on('mousemove', e => { const r = wrap.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; })
      .on('mouseleave', () => { node.classed('dim', false); link.classed('dim', false); tip.hidden = true; })
      .on('click', (e, d) => {
        if (!d.m) { zoomTo(d); return; }
        card.innerHTML = `<button type="button" class="btn-close og-x" aria-label="إغلاق"></button>${ctx.card(d.m).replace(/^<div class="col">/, '<div>')}`;
        card.hidden = false; card.querySelector('.og-x').onclick = () => { card.hidden = true; };
      });
    node.call(d3.drag().on('start', (e, d) => { if (!e.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; }).on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    const fit = (ms) => {
      const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
      const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 60;
      const s = Math.min(4, .95 * Math.min(W / (x1 - x0), H / (y1 - y0)));
      svg.transition().duration(ms).call(zoom.transform, d3.zoomIdentity.translate(-s * (x0 + x1) / 2, -s * (y0 + y1) / 2).scale(s));
    };
    const zoomTo = d => { const s = Math.min(5, Math.max(1.6, k * 1.8)); svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(-s * d.x, -s * d.y).scale(s)); };
    sim.on('end', () => fit(600));
    for (let i = 0; i < 160; i++) sim.tick();   // settle before the first paint
    sim.alpha(.25).restart();
    fit(0);
    root.querySelector('#og-load').remove();
    root.querySelectorAll('[data-og]').forEach(b => b.onclick = () => {
      const a = b.dataset.og;
      if (a === 'in') svg.transition().duration(300).call(zoom.scaleBy, 1.5);
      else if (a === 'out') svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5);
      else if (a === 'fit') fit(500);
      else { names = !names; b.classList.toggle('active', names); showNames(); }
    });
  }

  // ---------------------------------------------------------------- styles
  document.head.insertAdjacentHTML('beforeend', `<style>
    .ot-bar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .75rem; }
    .org-tree { position: relative; }
    .ot-root { display: flex; align-items: center; gap: .7rem; background: linear-gradient(135deg, #901d23, #6e151a); color: #fff; border-radius: 14px; padding: .7rem 1rem; width: max-content; max-width: 100%; box-shadow: 0 6px 18px rgba(144,29,35,.25); }
    .ot-root img { height: 2.4rem; filter: brightness(0) invert(1); } .ot-root b { font-size: 1.1rem; } .ot-root small { opacity: .85; }
    .ot-units, .ot-depts { list-style: none; margin: 0; padding: 0; }
    .ot-units { margin-inline-start: 1.6rem; border-inline-start: 2px solid #e2c9cb; padding-inline-start: 1.2rem; padding-top: .6rem; }
    .ot-units > li, .ot-depts > li { position: relative; margin-bottom: .6rem; }
    .ot-units > li::before { content: ""; position: absolute; inset-inline-start: -1.2rem; top: 1.45rem; width: 1.1rem; border-top: 2px solid #e2c9cb; }
    .ot-unit { background: #fff; border: 1px solid #e6e9ef; border-radius: 14px; box-shadow: 0 2px 10px rgba(9,27,34,.05); }
    .ot-unit > summary, .ot-dept > summary { list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .65rem .9rem; }
    .ot-unit > summary::-webkit-details-marker, .ot-dept > summary::-webkit-details-marker { display: none; }
    .ot-unit > summary b { font-size: 1.05rem; color: #091b22; }
    .ot-chev { transition: transform .2s; color: #8a96a0; } details[open] > summary > .ot-chev { transform: rotate(-90deg); }
    .ot-ic { color: #901d23; font-size: 1.1rem; }
    .ot-cs { display: inline-flex; gap: .3rem; flex-wrap: wrap; }
    .ot-c { font-size: .72rem; font-weight: 700; border-radius: 999px; padding: .05rem .5rem; background: #eef1f4; color: #33424a; }
    .ot-c.a { background: #fbecec; color: #901d23; } .ot-c.d { background: #e4f0f6; color: #0b4a66; }
    .ot-mini { margin-inline-start: auto; display: inline-flex; } .ot-mini .avatar { margin-inline-start: -.45rem; border: 2px solid #fff; }
    .ot-body { padding: 0 .9rem .8rem; }
    .ot-lead { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .6rem; padding: .6rem; background: #fdf7e9; border: 1px dashed #e5c97a; border-radius: 12px; }
    .ot-depts { margin-inline-start: 1rem; border-inline-start: 2px dashed #d6dde3; padding-inline-start: 1rem; }
    .ot-depts > li::before { content: ""; position: absolute; inset-inline-start: -1rem; top: 1.3rem; width: .9rem; border-top: 2px dashed #d6dde3; }
    .ot-dept { background: #f8fafb; border: 1px solid #e6e9ef; border-radius: 12px; }
    .ot-dept > summary { padding: .5rem .75rem; } .ot-dept > summary b { font-size: .95rem; color: #13222a; }
    .ot-head { margin-inline-start: auto; display: inline-flex; align-items: center; gap: .35rem; font-size: .8rem; color: #5b6970; }
    .ot-staff { margin-top: .6rem; }
    .ot-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: .4rem; padding: 0 .75rem .7rem; }
    .ot-p { display: flex; align-items: center; gap: .5rem; background: #fff; border: 1px solid #e6e9ef; border-inline-start: 4px solid #0b4a66; border-radius: 10px; padding: .35rem .5rem; cursor: pointer; min-width: 0; }
    .ot-p.academic { border-inline-start-color: #901d23; } .ot-p.board { border-inline-start-color: #b8892b; }
    .ot-p.lead { background: #fffaf0; box-shadow: 0 0 0 1px #f0d48a inset; }
    .ot-lead .ot-p { min-width: 230px; }
    .ot-pt { min-width: 0; flex: 1; } .ot-pt b { display: block; font-size: .84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ot-pt small { display: block; font-size: .72rem; color: #5b6970; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ot-ext { font-size: .75rem; font-weight: 700; text-decoration: none; background: #eef1f4; color: #13222a; border-radius: 999px; padding: .05rem .5rem; white-space: nowrap; }
    .og-wrap { position: relative; height: 78vh; min-height: 520px; background: radial-gradient(circle at 50% 40%, #ffffff 0, #f3f5f8 70%); border: 1px solid #e6e9ef; border-radius: 16px; overflow: hidden; }
    .og-wrap svg { width: 100%; height: 100%; display: block; cursor: grab; }
    .og-tools { position: absolute; inset-inline: .7rem; top: .6rem; display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between; z-index: 2; pointer-events: none; }
    .og-tools > * { pointer-events: auto; }
    .og-legend { display: flex; flex-wrap: wrap; gap: .25rem .8rem; background: rgba(255,255,255,.92); border: 1px solid #e6e9ef; border-radius: 10px; padding: .3rem .7rem; font-size: .75rem; }
    .og-legend i { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; vertical-align: -1px; margin-inline-end: .2rem; }
    .og-legend i.ring { background: #fff; border: 2.5px solid #f5b301; } .og-legend i.sq { border-radius: 3px; background: #091b22; } .og-legend i.sq.d { background: #1f6f78; }
    .og-tools .btn.active { background: #901d23; color: #fff; }
    .og-l { stroke: #c9d2d9; stroke-width: 1; } .og-l.u { stroke: #b88a8e; stroke-width: 2.2; } .og-l.d { stroke: #9cb8bd; stroke-width: 1.6; }
    .og-n { cursor: pointer; transition: opacity .2s; } .og-n.dim, .og-l.dim { opacity: .12; }
    .og-n.unit rect { stroke: #fff; stroke-width: 2; filter: drop-shadow(0 3px 6px rgba(0,0,0,.18)); } .og-n.dept rect { stroke: #fff; stroke-width: 1.5; }
    .og-ic { fill: #fff; font-weight: 800; font-size: 13px; pointer-events: none; }
    .og-t { font-family: Tajawal, sans-serif; pointer-events: none; paint-order: stroke; stroke: #fff; stroke-width: 3.5px; stroke-linejoin: round; }
    .og-t.unit { font-size: 14px; font-weight: 800; fill: #091b22; } .og-t.dept { font-size: 10.5px; font-weight: 700; fill: #1f4e55; } .og-t.person { font-size: 8px; fill: #33424a; }
    .og-tip { position: absolute; z-index: 3; background: #091b22; color: #fff; border-radius: 10px; padding: .45rem .7rem; font-size: .8rem; max-width: 280px; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
    .og-tip b, .og-tip span { display: block; } .og-tip span { color: #c9d4da; font-size: .74rem; }
    .og-card { position: absolute; z-index: 4; inset-inline-end: .7rem; bottom: .7rem; width: min(360px, calc(100% - 1.4rem)); }
    .og-card .og-x { position: absolute; z-index: 2; inset-inline-start: .6rem; top: .6rem; background-color: #fff; border-radius: 50%; }
    .og-load { position: absolute; inset: 0; display: flex; flex-direction: column; gap: .5rem; align-items: center; justify-content: center; color: #5b6970; }
    @media print { .og-wrap { height: 20cm; } }
  </style>`);

  window.UOP_DIR_VIEWS = { tree, bindTree, graphShell, graph };
})();
