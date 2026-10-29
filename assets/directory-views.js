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
        <div class="og-crumb" id="og-crumb"></div>
        <div class="og-legend"><span><i style="background:#901d23"></i> أكاديمي / كلية</span><span><i style="background:#0b4a66"></i> إداري / وحدة</span><span><i style="background:#b8892b"></i> مجلس الأمناء</span>
          <span><i class="ring"></i> منصب قيادي</span><span><i style="background:#1f6f78"></i> قسم</span></div>
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
    const tip = root.querySelector('#og-tip'), card = root.querySelector('#og-card'), crumb = root.querySelector('#og-crumb');
    const svg = d3.select(svgEl).attr('viewBox', [-W / 2, -H / 2, W, H]);
    const g0 = { k: 1 };
    let g, zoom, names = false;
    const unitKind = u => /^\d+$/.test(u.id) ? 'fac' : u.id === 'boardoftrustees' ? 'board' : 'unit';
    const KC = { fac: ['#901d23', '#5c1116', 'كلية'], unit: ['#0b4a66', '#062c3d', 'وحدة إدارية'], board: ['#b8892b', '#7a5a15', 'مجلس'] };
    const nm = n => String(n || '').replace(/^(أ\.?\s?د|ا\.?\s?د|د|م|أ)\.+\s*/, '');
    const tipShow = (e, html) => { tip.innerHTML = html; tip.hidden = false; tipMove(e); };
    const tipMove = e => { const r = wrap.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; };
    const tipHide = () => { tip.hidden = true; };
    const pill = (sel, x, y, text, fill, fg, anchor) => {   // a rounded badge with text, sized to it
      const gg = sel.append('g').attr('class', 'og-pill').attr('transform', `translate(${x},${y})`);
      const t = gg.append('text').attr('dy', '.35em').attr('text-anchor', anchor || 'middle').attr('fill', fg).text(text);
      const b = t.node().getBBox();
      gg.insert('rect', 'text').attr('x', b.x - 6).attr('y', b.y - 2).attr('width', b.width + 12).attr('height', b.height + 4).attr('rx', (b.height + 4) / 2).attr('fill', fill);
      return gg;
    };
    function reset() {
      svg.selectAll('*').remove();
      const defs = svg.append('defs');
      defs.append('clipPath').attr('id', 'og-clip').attr('clipPathUnits', 'objectBoundingBox').append('circle').attr('cx', .5).attr('cy', .5).attr('r', .5);
      Object.entries(KC).forEach(([k, [a, b]]) => { const gr = defs.append('radialGradient').attr('id', 'og-g-' + k).attr('cx', '35%').attr('cy', '30%');
        gr.append('stop').attr('offset', '0%').attr('stop-color', a); gr.append('stop').attr('offset', '100%').attr('stop-color', b); });
      g = svg.append('g');
      zoom = d3.zoom().scaleExtent([.1, 8]).on('zoom', e => { g.attr('transform', e.transform); g0.k = e.transform.k; labels(); });
      svg.call(zoom).on('dblclick.zoom', null);
    }
    let labels = () => {};
    const fitTo = (rad, ms) => svg.transition().duration(ms).call(zoom.transform, d3.zoomIdentity.scale(Math.min(2.5, .92 * Math.min(W, H) / (2 * rad))));

    // ---------------------------------------------------------------- overview: every unit as a bubble around the university
    function overview() {
      reset();
      crumb.innerHTML = `<b><i class="bi bi-diagram-2"></i> كل الكليات والوحدات</b><span>انقر أي كلية أو وحدة لعرض أقسامها وموظفيها</span>`;
      const n = U.length, rr = u => 26 + Math.min(34, Math.sqrt(u.all.length) * 4.2);
      const R = Math.max(230, U.reduce((a, u) => a + 2 * rr(u) + 70, 0) / (2 * Math.PI));
      const order = U.slice().sort((a, b) => (unitKind(a) === 'fac') - (unitKind(b) === 'fac') || b.all.length - a.all.length);
      let acc = 0; const tot = order.reduce((a, u) => a + 2 * rr(u) + 70, 0);
      order.forEach(u => { const w = 2 * rr(u) + 70; u._a = 2 * Math.PI * (acc + w / 2) / tot; acc += w; u._x = R * Math.sin(u._a); u._y = -R * Math.cos(u._a); });
      g.append('circle').attr('class', 'og-ring').attr('r', R);
      g.append('g').selectAll('line').data(order).join('line').attr('class', 'og-l u').attr('x1', 0).attr('y1', 0).attr('x2', u => u._x).attr('y2', u => u._y);
      const c = g.append('g').attr('class', 'og-n root');
      c.append('circle').attr('r', 54).attr('fill', 'url(#og-g-fac)').attr('stroke', '#fff').attr('stroke-width', 4);
      c.append('image').attr('href', 'assets/logo.png').attr('x', -30).attr('y', -38).attr('width', 60).attr('height', 60).style('filter', 'brightness(0) invert(1)');
      c.append('text').attr('class', 'og-ctr').attr('y', 34).attr('text-anchor', 'middle').text(`${list.length} موظفاً`);
      const node = g.append('g').selectAll('g').data(order).join('g').attr('class', 'og-n bub').attr('transform', u => `translate(${u._x},${u._y})`);
      node.append('circle').attr('r', rr).attr('fill', u => `url(#og-g-${unitKind(u)})`).attr('stroke', '#fff').attr('stroke-width', 3);
      // the head of the unit, in the middle of the bubble when there is a photo
      node.each(function (u) {
        const s = d3.select(this), r = rr(u), head = u.lead[0], ph = head && head.photo;
        if (ph) { const q = r * .62; s.append('circle').attr('cy', -r * .18).attr('r', q + 2).attr('fill', '#fff');
          s.append('image').attr('href', ph).attr('x', -q).attr('y', -r * .18 - q).attr('width', 2 * q).attr('height', 2 * q).attr('clip-path', 'url(#og-clip)').attr('preserveAspectRatio', 'xMidYMid slice').on('error', function () { this.remove(); }); }
        s.append('text').attr('class', 'og-big').attr('y', ph ? r * .62 : 0).attr('dy', '.35em').attr('text-anchor', 'middle').text(u.all.length);
        // badges: academic / administrative / departments
        const a = u.all.filter(m => m.type === 'academic').length, d = u.all.length - a, out = r + 12, dir = Math.cos(u._a) >= 0 ? 1 : -1;
        const nameY = dir > 0 ? -(r + 16) : r + 16;
        pill(s, 0, nameY, u.name.replace(/^كلية\s/, ''), '#ffffff', '#091b22').classed('name', true);
        const row = [a ? [`${a} أكاديمي`, '#fbecec', '#901d23'] : null, d ? [`${d} ${unitKind(u) === 'board' ? 'عضو' : 'إداري'}`, '#e4f0f6', '#0b4a66'] : null, u.depts.size ? [`${u.depts.size} أقسام`, '#e0f4f1', '#0f766e'] : null].filter(Boolean);
        row.forEach((b, i) => pill(s, (i - (row.length - 1) / 2) * 74, dir > 0 ? -(r + 38) : r + 38, b[0], b[1], b[2]).classed('small', true));
      });
      node.on('mouseenter', (e, u) => { node.classed('dim', x => x !== u); tipShow(e, `<b>${esc(u.name)}</b><span>${KC[unitKind(u)][2]} · ${u.all.length} موظفاً</span>
          ${u.lead.slice(0, 4).map(m => `<span><i class="bi bi-star-fill" style="color:#f5b301"></i> ${esc(nm(m.name))} – ${esc(m.role || ctx.jobText(m))}</span>`).join('')}
          ${u.depts.size ? `<span><i class="bi bi-diagram-3"></i> ${[...u.depts.keys()].slice(0, 6).map(esc).join('، ')}</span>` : ''}<span class="og-hint">انقر للتفاصيل</span>`); })
        .on('mousemove', tipMove).on('mouseleave', () => { node.classed('dim', false); tipHide(); })
        .on('click', (e, u) => { tipHide(); current = focus(u); });
      labels = () => {};
      const fit = ms => fitTo(R + 120, ms);
      fit(0);
      return fit;
    }

    // ---------------------------------------------------------------- one unit: an org chart of department panels with readable person cards
    const offc = m => { const o = String(m.office || '').trim(); return o && o !== m.ext && !/^0*$/.test(o) ? o : ''; };
    const fitBox = (x0, y0, x1, y1, ms) => {
      const w = x1 - x0, h = y1 - y0, k = Math.min(1.05, .96 * W / w, h * Math.min(1.05, .96 * W / w) > H ? 9 : .94 * H / h);
      const ty = h * k > H ? -H / 2 + 16 - y0 * k : -k * (y0 + y1) / 2;
      svg.transition().duration(ms || 0).call(zoom.transform, d3.zoomIdentity.translate(-k * (x0 + x1) / 2, ty).scale(k));
    };
    const clip = (t, max) => { const n = t.node(); let s = n.textContent; while (s.length > 3 && n.getComputedTextLength() > max) { s = s.slice(0, -1); n.textContent = s + '…'; } return t; };
    function focus(u) {
      reset(); labels = () => {};
      crumb.innerHTML = `${U.length > 1 ? '<button type="button" class="btn btn-sm btn-light" id="og-back"><i class="bi bi-arrow-right"></i> كل الوحدات</button>' : ''}
        <b><i class="bi ${unitKind(u) === 'fac' ? 'bi-mortarboard-fill' : 'bi-building'}"></i> ${esc(u.name)}</b><span>${u.all.length} موظفاً${u.depts.size ? ` · ${u.depts.size} أقسام` : ''} · انقر أي شخص لبطاقته</span>`;
      const back = crumb.querySelector('#og-back'); if (back) back.onclick = () => { card.hidden = true; current = overview(); };
      const CW = 264, CH = 64, GAP = 10, PW = CW + 24, KC0 = KC[unitKind(u)];
      const open = m => { tipHide(); card.innerHTML = `<button type="button" class="btn-close og-x" aria-label="إغلاق"></button>${ctx.card(m).replace(/^<div class="col">/, '<div>')}`; card.hidden = false; card.querySelector('.og-x').onclick = () => { card.hidden = true; }; };
      const info = m => `<b>${esc(m.name)}</b><span>${esc(m.role || ctx.jobText(m) || m.rank || '')}</span>${m.ext ? `<span><i class="bi bi-telephone-fill"></i> فرعي ${esc(m.ext)}</span>` : ''}${offc(m) ? `<span><i class="bi bi-door-open-fill"></i> المكتب ${esc(offc(m))}</span>` : ''}${m.email ? `<span dir="ltr">${esc(m.email)}</span>` : ''}`;
      const person = (sel, m, x, y) => {
        const col = (TYPE[m.type] || TYPE.admin)[1], R0 = CW / 2;
        const gg = sel.append('g').attr('class', 'og-n oc-p' + (m.role ? ' lead' : '')).attr('transform', `translate(${x},${y})`);
        gg.append('rect').attr('class', 'oc-box').attr('x', -R0).attr('y', -CH / 2).attr('width', CW).attr('height', CH).attr('rx', 12).attr('stroke', m.role ? '#e8b923' : '#e3e7ec');
        gg.append('rect').attr('x', R0 - 5).attr('y', -CH / 2 + 8).attr('width', 5).attr('height', CH - 16).attr('rx', 2.5).attr('fill', col);
        const f = gg.append('g').attr('transform', `translate(${R0 - 34},0)`);
        f.append('circle').attr('r', 21).attr('fill', col).attr('stroke', m.role ? '#f5b301' : '#fff').attr('stroke-width', m.role ? 3 : 2);
        f.append('text').attr('class', 'og-ini').attr('dy', '.35em').attr('text-anchor', 'middle').style('font-size', '14px').text(nm(m.name).split(/\s+/).slice(0, 2).map(w => w[0] || '').join(' '));
        if (m.photo) f.append('image').attr('href', m.photo).attr('clip-path', 'url(#og-clip)').attr('x', -19).attr('y', -19).attr('width', 38).attr('height', 38).attr('preserveAspectRatio', 'xMidYMid slice').on('error', function () { this.remove(); });
        const tx = R0 - 64, maxw = CW - 76;
        clip(gg.append('text').attr('class', 'oc-name').attr('x', tx).attr('y', -11).attr('direction', 'rtl').attr('text-anchor', 'start').text(nm(m.name)), maxw - (m.role ? 0 : 0));
        clip(gg.append('text').attr('class', 'oc-sub').attr('x', tx).attr('y', 6).attr('direction', 'rtl').attr('text-anchor', 'start').text(m.role || m.rank || ctx.jobText(m) || TYPE[m.type]?.[0] || ''), maxw);
        // contact line: extension and office as small labelled chips
        let cx = tx;
        const chip = (icon, txt, fill, fg) => { if (!txt) return; const c = gg.append('g').attr('transform', `translate(${cx},${21})`);
          const t = c.append('text').attr('class', 'oc-chip').attr('direction', 'rtl').attr('text-anchor', 'start').attr('x', -6).attr('dy', '.35em').attr('fill', fg).text(icon + ' ' + txt);
          clip(t, Math.max(30, cx - (-R0 + 10) - 14)); const w = t.node().getComputedTextLength() + 12;
          c.insert('rect', 'text').attr('x', -w).attr('y', -8).attr('width', w).attr('height', 16).attr('rx', 8).attr('fill', fill); cx -= w + 5; };
        chip('☎', m.ext, '#eef2f7', '#0b2f40'); const of = offc(m); chip('مكتب', of && (/\d/.test(of) || of !== u.name) ? of : '', '#fbf3e4', '#7a4b00');
        gg.on('mouseenter', e => tipShow(e, info(m))).on('mousemove', tipMove).on('mouseleave', tipHide).on('click', () => open(m));
        return gg;
      };
      // ---- unit header
      const a = u.all.filter(m => m.type === 'academic').length, d = u.all.length - a;
      const hd = g.append('g').attr('class', 'oc-unit');
      hd.append('rect').attr('x', -230).attr('y', -46).attr('width', 460).attr('height', 92).attr('rx', 18).attr('fill', `url(#og-g-${unitKind(u)})`);
      hd.append('text').attr('class', 'oc-uname').attr('y', -12).attr('text-anchor', 'middle').text(u.name);
      const row = [[`${u.all.length} موظفاً`, '#ffffff', KC0[1]], a ? [`${a} أكاديمي`, '#fbecec', '#901d23'] : null, d ? [`${d} ${unitKind(u) === 'board' ? 'عضو' : 'إداري'}`, '#e4f0f6', '#0b4a66'] : null, u.depts.size ? [`${u.depts.size} أقسام`, '#e0f4f1', '#0f766e'] : null].filter(Boolean);
      row.forEach((b, i) => pill(hd, (i - (row.length - 1) / 2) * 92, 22, b[0], b[1], b[2]).classed('mid', true));
      let y = 46;
      // ---- leadership row
      const L = u.lead; let lw = 0;
      if (L.length) {
        const per = Math.min(L.length, 5), rowsL = Math.ceil(L.length / per);
        y += 30; g.append('line').attr('class', 'oc-l').attr('x1', 0).attr('x2', 0).attr('y1', 46).attr('y2', y + 14);
        pill(g, 0, y, 'القيادة', '#fff7e0', '#7a5600').classed('mid', true); y += 22;
        L.forEach((m, i) => { const r = Math.floor(i / per), c = i % per, n = Math.min(per, L.length - r * per);
          person(g, m, ((n - 1) / 2 - c) * (CW + GAP), y + CH / 2 + r * (CH + GAP)); });
        y += rowsL * (CH + GAP); lw = per * (CW + GAP) / 2;
      }
      // ---- departments (and the remaining staff) as panels in a grid, right to left
      const panels = [...u.depts.values()].sort((p, q) => p.name.localeCompare(q.name, 'ar'))
        .map(p => ({ name: 'قسم ' + p.name, head: p.head[0], people: p.head.slice(1).concat(p.people), n: p.head.length + p.people.length, c: '#1f6f78' }))
        .concat(u.staff.length ? [{ name: u.depts.size ? 'الكادر الإداري والفني' : (L.length ? 'الموظفون' : 'الكادر'), people: u.staff, n: u.staff.length, c: '#475569' }] : []);
      const cols = panels.length <= 6 ? panels.length : Math.ceil(Math.sqrt(panels.length * 2.2));
      let minx = -Math.max(240, lw), maxx = Math.max(240, lw);
      for (let r0 = 0; r0 < panels.length; r0 += cols) {
        const rowP = panels.slice(r0, r0 + cols), n = rowP.length, top = y + 50;
        const xs = rowP.map((p, i) => ((n - 1) / 2 - i) * (PW + 18));
        g.append('line').attr('class', 'oc-l').attr('x1', 0).attr('x2', 0).attr('y1', y).attr('y2', top - 16);
        if (n > 1) g.append('line').attr('class', 'oc-l').attr('x1', xs[0]).attr('x2', xs[n - 1]).attr('y1', top - 16).attr('y2', top - 16);
        let hmax = 0;
        rowP.forEach((p, i) => {
          const x = xs[i], items = (p.head ? [p.head] : []).concat(p.people), h = 58 + items.length * (CH + 8) + 6;
          minx = Math.min(minx, x - PW / 2); maxx = Math.max(maxx, x + PW / 2);
          g.append('line').attr('class', 'oc-l').attr('x1', x).attr('x2', x).attr('y1', top - 16).attr('y2', top);
          const pg = g.append('g').attr('class', 'oc-panel');
          pg.append('rect').attr('x', x - PW / 2).attr('y', top).attr('width', PW).attr('height', h).attr('rx', 16).attr('class', 'oc-pbox');
          pg.append('rect').attr('x', x - PW / 2).attr('y', top).attr('width', PW).attr('height', 46).attr('rx', 16).attr('fill', p.c);
          pg.append('rect').attr('x', x - PW / 2).attr('y', top + 30).attr('width', PW).attr('height', 16).attr('fill', p.c);
          clip(pg.append('text').attr('class', 'oc-pname').attr('x', x + PW / 2 - 14).attr('y', top + 28).attr('direction', 'rtl').attr('text-anchor', 'start').text(p.name), PW - 70);
          pill(pg, x - PW / 2 + 26, top + 23, String(p.n), '#ffffff', p.c).classed('mid', true);
          items.forEach((m, j) => person(g, m, x, top + 58 + j * (CH + 8) + CH / 2));
          hmax = Math.max(hmax, h);
        });
        y = top + hmax + 14;
      }
      const fit = ms => fitBox(minx - 20, -120, maxx + 20, Math.max(y, 200) + 20, ms);
      fit(U.length > 1 ? 500 : 0);
      return fit;
    }

    let current = U.length === 1 ? focus(U[0]) : overview();
    root.querySelector('#og-load').remove();
    root.querySelectorAll('[data-og]').forEach(b => b.onclick = () => {
      const a = b.dataset.og;
      if (a === 'in') svg.transition().duration(300).call(zoom.scaleBy, 1.5);
      else if (a === 'out') svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5);
      else if (a === 'fit') current(500);
      else { names = !names; b.classList.toggle('active', names); labels(); }
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
    .og-ring { fill: none; stroke: #e3e7ec; stroke-dasharray: 3 5; }
    .og-l { fill: none; stroke: #d3dae0; stroke-width: 1.1; } .og-l.u { stroke: #d9b9bc; stroke-width: 2.5; } .og-l.d { stroke: #9cc3c7; stroke-width: 2.2; }
    .og-n { cursor: pointer; transition: opacity .2s; } .og-n.dim, .og-l.dim { opacity: .12; }
    .og-n.bub > circle:first-child { filter: drop-shadow(0 6px 12px rgba(9,27,34,.25)); }
    .og-n.bub:hover > circle:first-child { stroke: #f5b301; }
    .og-big { fill: #fff; font: 800 20px Tajawal, sans-serif; pointer-events: none; }
    .og-ctr { fill: #fff; font: 700 12px Tajawal, sans-serif; pointer-events: none; opacity: .9; }
    .og-ic { fill: #fff; font: 800 12px Tajawal, sans-serif; pointer-events: none; }
    .og-ini { fill: #fff; font-weight: 700; pointer-events: none; }
    .og-pill text { font: 700 11px Tajawal, sans-serif; pointer-events: none; } .og-pill rect { stroke: rgba(9,27,34,.08); }
    .og-pill.name text { font-size: 13px; font-weight: 800; } .og-pill.name rect { filter: drop-shadow(0 2px 4px rgba(9,27,34,.15)); }
    .og-pill.name.dept text { font-size: 12px; }
    .og-pill.small text { font-size: 10px; }
    .og-t { font-family: Tajawal, sans-serif; pointer-events: none; paint-order: stroke; stroke: #fbfcfd; stroke-width: 3px; stroke-linejoin: round; }
    .og-t.person { font-size: 11px; font-weight: 700; fill: #13222a; } .og-t.sub { font-size: 9px; fill: #5b6970; }
    .og-crumb { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: rgba(255,255,255,.95); border: 1px solid #e6e9ef; border-radius: 10px; padding: .3rem .7rem; font-size: .85rem; }
    .og-crumb b { color: #091b22; } .og-crumb b i { color: #901d23; } .og-crumb span { color: #5b6970; font-size: .78rem; }
    .oc-box { fill: #fff; stroke-width: 1.2; filter: drop-shadow(0 2px 5px rgba(9,27,34,.08)); }
    .oc-p:hover .oc-box { stroke: #901d23; stroke-width: 2; }
    .oc-name { font: 800 13.5px Tajawal, sans-serif; fill: #0f1d24; pointer-events: none; }
    .oc-sub { font: 600 11.5px Tajawal, sans-serif; fill: #5b6970; pointer-events: none; }
    .oc-chip { font: 700 11px Tajawal, sans-serif; pointer-events: none; font-variant-numeric: tabular-nums; }
    .oc-uname { fill: #fff; font: 800 22px Tajawal, sans-serif; }
    .oc-pname { fill: #fff; font: 800 14.5px Tajawal, sans-serif; }
    .oc-pbox { fill: #f7f9fb; stroke: #e1e6ec; }
    .oc-l { stroke: #b9c4cc; stroke-width: 2; }
    .og-pill.mid text { font-size: 12px; }
    .og-hint { color: #fbbf24 !important; margin-top: .2rem; }
    .og-tip { position: absolute; z-index: 3; background: #091b22; color: #fff; border-radius: 10px; padding: .45rem .7rem; font-size: .8rem; max-width: 280px; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
    .og-tip b, .og-tip span { display: block; } .og-tip span { color: #c9d4da; font-size: .74rem; }
    .og-card { position: absolute; z-index: 4; inset-inline-end: .7rem; bottom: .7rem; width: min(360px, calc(100% - 1.4rem)); }
    .og-card .og-x { position: absolute; z-index: 2; inset-inline-start: .6rem; top: .6rem; background-color: #fff; border-radius: 50%; }
    .og-load { position: absolute; inset: 0; display: flex; flex-direction: column; gap: .5rem; align-items: center; justify-content: center; color: #5b6970; }
    @media print { .og-wrap { height: 20cm; } }
  </style>`);

  window.UOP_DIR_VIEWS = { tree, bindTree, graphShell, graph };
})();
