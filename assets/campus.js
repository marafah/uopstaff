/* «خريطة الحرم» (campus.html): the university's official campus master plan made live from the site's own data.
   data/campus.json holds the plan's numbered buildings (their place on the image and what each is in the timetable,
   the staff directory and the screens), its gates, gardens, services and car parks.

   On the map: how busy each building is at the chosen moment, the faces of its people, who is in office hours now,
   today's exams, events with a place, gardens and services (the «طبقات» menu), and «أنت هنا» (?here=gate:1 or b:7,
   from the QR stickers at the gates and entrances).
   The panel has tabs: «المباني» (overview; a building's card with its own tabs now / rooms / people / today; a
   person's card), «طريقي» (from here or a gate to a room, a course or a building), «يومي» (a student's day from
   «مخطط جدولي»: lectures in order on the map, with the gaps), «الإشغال» (the week by building, day and hour) and
   «ملصقات QR» (to print). One search finds people, rooms, courses, units, buildings, gardens and services.
   Links: ?b=<number> ?p=<staff id> ?q= ?room= ?to= ?here= ?tool=route|day|week|qr ?plan= ?at=2026-11-10T10:30 ?edit=1 */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  const app = $('#cm-app');
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  let C, S, IDX, STAFF = [], EX = null, POSTS = null, OHMAP = {}, INS = {};
  let sel = P.get('b') || '', who = P.get('p') || '', q = P.get('q') || '', tool = P.get('tool') || '', tab = '', unitF = '', tour = null, at = null;
  let here = null;           // {x, y, label} from ?here=
  let route = null;          // {from, to: {b, room, label}} drawn on the map
  let day = null;            // «يومي»: the chosen day's lectures in order
  const L = { heat: true, faces: P.has('faces'), oh: false, events: true, exams: true, gardens: false, services: false, gates: true };
  const view = { s: 1, x: 0, y: 0 };
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const inRoom = m => live(m) && m.mode !== 'الكتروني كامل';
  const KIND = { faculty: ['كلية', '#9e1f27'], admin: ['إدارة وخدمات', '#0b4a66'], service: ['مرافق', '#6d28d9'], center: ['مركز', '#0f766e'], parking: ['موقف', '#475569'] };
  const now = () => { const n = U.amman(P.get('at')); if (at) { n.day = at.day; n.min = at.min; n.clock = toTime(at.min); } return n; };
  const url = (k, v) => { const u = new URL(location.href); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); history.replaceState(null, '', u); };

  // ---------------------------------------------------------------- what is where
  const byTT = {}, byOffice = {}, roomB = {};
  const PREFIX = { 3: '3', 4: '4', 7: '7', 8: '8A', 9: '9', 0: '6' };
  const B = id => C.buildings.find(b => b.id === id);
  function index() {
    C.buildings.forEach(b => { (b.tt || []).forEach(t => { byTT[t] = b; }); (b.off || []).forEach(o => { byOffice[o] = b; }); });
    S.forEach(s => { const b = byTT[s.building], r = clean(s.room); if (b && r && r !== '0') roomB[r] = b; });
  }
  // a room or an office: by the timetable, by the unit named as the office, or by the room number's first digit
  function placeB(text) {
    const o = clean(text);
    if (!o) return null;
    if (byOffice[o]) return byOffice[o];
    if (roomB[o]) return roomB[o];
    const d = o.replace(/\D/g, '');
    return d.length >= 3 && PREFIX[d[0]] ? B(PREFIX[d[0]]) : null;
  }
  const staffB = m => placeB(m.office);
  // a free text place («المسرح», «القاعة 7101», «ساحة الجامعة») → a building, when it names one
  function textB(t) {
    const n = U.norm(t || '');
    if (!n) return null;
    const room = (String(t).match(/[A-Za-z]?\d{3,5}/) || [])[0];
    if (room && placeB(room)) return placeB(room);
    return C.buildings.find(b => [b.name, ...(b.aliases || []), ...(b.tt || [])].some(a => n.includes(U.norm(a)))) || null;
  }
  function teaching(n) {
    const T = IDX && IDX.teaching;
    if (!T || at) return true;
    return !(n.iso < T.start || n.iso > T.end || (T.holidays || []).includes(n.iso) || n.day === 'ج');
  }
  // the building's meetings on a day (a class listed twice by the portal only once)
  function meetings(b, d) {
    const seen = new Set(), out = [];
    S.forEach(s => {
      if (!(b.tt || []).includes(s.building) || !s.room || s.room === '0') return;
      s.meetings.forEach(m => {
        if (!inRoom(m) || m.day !== d) return;
        const k = [clean(s.room), s.code, s.section, m.start].join('|');
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ s, m, a: toMin(m.start), z: toMin(m.end), room: clean(s.room) });
      });
    });
    return out;
  }
  const roomsOf = b => [...new Set(S.filter(s => (b.tt || []).includes(s.building) && s.room && s.room !== '0').map(s => clean(s.room)))].sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  const cache = {};
  function status(b, n) {
    const key = b.id + n.day + n.min + n.iso;
    if (cache[key]) return cache[key];
    const ok = teaching(n), all = meetings(b, n.day), rooms = roomsOf(b);
    const run = ok ? all.filter(x => x.a <= n.min && n.min < x.z).sort((x, y) => x.room.localeCompare(y.room, 'en', { numeric: true })) : [];
    const soon = ok ? all.filter(x => x.a > n.min && x.a <= n.min + 90).sort((x, y) => x.a - y.a) : [];
    const busy = new Set(run.map(x => x.room));
    const free = rooms.filter(r => !busy.has(r)).map(r => { const nx = all.filter(x => x.room === r && x.a > n.min).sort((x, y) => x.a - y.a)[0]; return { r, until: ok && nx ? nx.a : null }; });
    return (cache[key] = { run, soon, free, rooms, busy, load: rooms.length ? busy.size / rooms.length : 0, today: ok ? all.length : 0, ok });
  }
  const examsAt = (b, n) => !EX ? [] : (EX.exams || []).filter(e => e.date === n.iso && e.rooms.some(r => placeB(r.room) === b));
  const postsOn = (b, n) => !POSTS || !b.screen || !window.UOP_PP ? [] : (POSTS.posts || []).filter(p => window.UOP_PP.matches(p, b.screen, n) && p.type !== 'ticker');
  // events with a place on campus: the screens' «فعالية» posts whose place names a building
  function events(n) {
    if (!POSTS) return [];
    return (POSTS.posts || []).filter(p => p.type === 'event' && p.status === 'live' && p.at && p.at.slice(0, 10) >= n.iso && p.start <= n.iso)
      .map(p => ({ p, b: textB(p.place) })).filter(x => x.b);
  }

  // ---------------------------------------------------------------- people
  const TITLES = ['معالي', 'عطوفه', 'سعاده', 'الدكتور', 'الدكتوره', 'المهندس', 'الاستاذ'];
  const nameKey = n => U.norm(n).split(' ').filter(w => w.length > 1 && !TITLES.includes(w)).slice(0, 3).join(' ');
  const LEAD = ['رئيس مجلس الأمناء', 'رئيس الجامعة', 'نائب رئيس الجامعة', 'عميد', 'نائب عميد', 'مساعد عميد / رئيس', 'مدير', 'رئيس قسم'];
  const lead = m => { const i = LEAD.indexOf(m.role); return i < 0 ? 20 + (m.rank_order || 50) / 100 : i; };
  const person = id => STAFF.find(m => m.id === id);
  const ini = m => esc(nameKey(m.name).split(' ').slice(0, 2).map(w => w[0]).join(''));
  const face = (m, cls) => m.photo ? `<img class="cm-face ${cls || ''}" src="${esc(m.photo)}" alt="" loading="lazy">` : `<span class="cm-face ${cls || ''} cm-ini">${ini(m)}</span>`;
  const insOf = m => INS[nameKey(m.name)] || null;
  function lessons(insName, d) {
    const out = [];
    S.forEach(s => { if (s.instructor !== insName) return; s.meetings.forEach(x => { if (inRoom(x) && x.day === d) out.push({ s, m: x, a: toMin(x.start), z: toMin(x.end), b: byTT[s.building], room: clean(s.room) }); }); });
    return out.sort((x, y) => x.a - y.a);
  }
  function whereNow(m, n) {
    const ins = insOf(m);
    if (!ins || !teaching(n)) return ins ? { ins } : null;
    const L2 = lessons(ins.name, n.day);
    return { now: L2.find(x => x.a <= n.min && n.min < x.z) || null, next: L2.find(x => x.a > n.min) || null, ins };
  }
  // office hours (OH.load: the instructors' own entries): who is in office hours at the moment, and where
  const ohOf = m => { const i = insOf(m); return i ? OHMAP[i.id] : null; };
  const ohNow = (m, n) => { const o = ohOf(m); return o && (o.slots || []).find(x => x.day === n.day && toMin(x.start) <= n.min && n.min < toMin(x.end)); };
  const ohB = m => { const o = ohOf(m); return (o && placeB(o.place)) || staffB(m); };
  function inOfficeHours(n) {
    if (!Object.keys(OHMAP).length) return [];
    return STAFF.filter(m => ohNow(m, n)).map(m => ({ m, b: ohB(m), slot: ohNow(m, n) })).filter(x => x.b);
  }

  // ---------------------------------------------------------------- the page
  function shell() {
    app.innerHTML = `<div class="cm">
      <div class="cm-map" id="cm-map"><div class="cm-stage" id="cm-stage"><img src="${esc(C.image)}" alt="مخطط حرم جامعة البترا" draggable="false" id="cm-img">
          <svg id="cm-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg><div id="cm-pins"></div></div>
        <div class="cm-tools"><button type="button" data-z="1.4" title="تكبير"><i class="bi bi-plus-lg"></i></button><button type="button" data-z="0.7" title="تصغير"><i class="bi bi-dash-lg"></i></button>
          <button type="button" data-z="0" title="الخريطة كاملة"><i class="bi bi-aspect-ratio"></i></button>
          <button type="button" id="cm-fs" title="ملء الشاشة"><i class="bi bi-fullscreen"></i></button>
          <button type="button" id="cm-layers-b" title="الطبقات: ما يظهر على الخريطة"><i class="bi bi-layers"></i></button>
          <button type="button" id="cm-tour" title="جولة تلقائية على المباني (لشاشات العرض)"><i class="bi bi-play-circle"></i></button>
          <button type="button" id="cm-panel" class="cm-fs-only" title="إظهار اللوحة أو إخفاؤها"><i class="bi bi-layout-sidebar-inset-reverse"></i></button></div>
        <div class="cm-layers" id="cm-layers" hidden><b>ما يظهر على الخريطة</b>${[['heat', 'bi-thermometer-half', 'ألوان الانشغال'], ['faces', 'bi-people', 'وجوه القيادات على المباني'],
          ['oh', 'bi-person-raised-hand', 'في الساعات المكتبية الآن'], ['exams', 'bi-clipboard-check', 'الامتحانات'], ['events', 'bi-calendar-event', 'الفعاليات'],
          ['gardens', 'bi-tree', 'الحدائق'], ['services', 'bi-signpost-2', 'الخدمات والمواقف'], ['gates', 'bi-door-closed', 'البوابات']].map(([k, i, t]) =>
          `<label><input type="checkbox" data-l="${k}" ${L[k] ? 'checked' : ''}> <i class="bi ${i}"></i> ${t}</label>`).join('')}</div>
        <div class="cm-time"><select id="cm-day" class="form-select form-select-sm" aria-label="اليوم"></select><input type="range" id="cm-min" min="420" max="1260" step="15" aria-label="الوقت"><b id="cm-clock"></b>
          <button type="button" class="btn btn-sm btn-light" id="cm-now"><i class="bi bi-clock"></i> الآن</button></div>
        <div class="cm-key" id="cm-key"></div>
      </div>
      <aside class="cm-side"><div class="cm-search"><i class="bi bi-search"></i><input id="cm-q" type="search" placeholder="ابحث: مدرس، موظف، قاعة، مقرر، وحدة، مبنى…" value="${esc(q)}"></div>
        <nav class="cm-modes" role="tablist">${[['', 'bi-buildings', 'المباني'], ['route', 'bi-signpost-split', 'طريقي'], ['day', 'bi-calendar-week', 'يومي'], ['week', 'bi-grid-3x3-gap', 'الإشغال'], ['qr', 'bi-qr-code', 'ملصقات QR']]
          .map(([k, i, t]) => `<button type="button" role="tab" data-tool="${k}"><i class="bi ${i}"></i><span>${t}</span></button>`).join('')}</nav>
        <div id="cm-res"></div><div id="cm-card"></div></aside></div>
      <p class="small text-muted mt-2"><i class="bi bi-info-circle"></i> المخطط من <a href="${esc(C.source)}" target="_blank" rel="noopener">الموقع الرسمي للجامعة</a>؛ ما على المباني محسوب من الجدول الدراسي ودليل الموظفين والساعات المكتبية وجدول الامتحانات وإعلانات الشاشات، ويتحدّث وحده.</p>`;
    const n = U.amman(P.get('at'));
    $('#cm-day').innerHTML = Object.entries(U.DAYS).filter(([k]) => k !== 'ج').map(([k, v]) => `<option value="${k}" ${k === n.day ? 'selected' : ''}>${esc(v)}${k === n.day ? ' (اليوم)' : ''}</option>`).join('');
    $('#cm-min').value = Math.min(1260, Math.max(420, n.min));
    const setAt = () => { at = { day: $('#cm-day').value, min: +$('#cm-min').value }; draw(); };
    $('#cm-day').onchange = setAt; $('#cm-min').oninput = setAt;
    $('#cm-now').onclick = () => { at = null; const m = U.amman(P.get('at')); $('#cm-day').value = m.day; $('#cm-min').value = Math.min(1260, Math.max(420, m.min)); draw(); };
    $('#cm-layers-b').onclick = e => { e.stopPropagation(); $('#cm-layers').hidden = !$('#cm-layers').hidden; };
    $('#cm-layers').onchange = e => { const k = e.target.dataset.l; if (k) { L[k] = e.target.checked; draw(); } };
    $('#cm-layers').addEventListener('pointerdown', e => e.stopPropagation());
    document.addEventListener('click', e => { if (!e.target.closest('#cm-layers, #cm-layers-b')) $('#cm-layers').hidden = true; });
    $('#cm-q').oninput = e => { q = e.target.value; search(); };
    const top = $('#pg-q'); if (top) { top.value = q; top.oninput = e => { q = e.target.value; $('#cm-q').value = q; search(); }; }
    app.querySelectorAll('[data-tool]').forEach(x => x.onclick = () => setTool(x.dataset.tool));
    $('#cm-fs').onclick = fullscreen;
    $('#cm-tour').onclick = () => tour ? stopTour() : startTour();
    $('#cm-panel').onclick = () => { app.querySelector('.cm').classList.toggle('cm-nopanel'); setTimeout(apply, 50); };
    document.addEventListener('fullscreenchange', () => { app.querySelector('.cm').classList.toggle('cm-full', !!document.fullscreenElement); fsIcon(); setTimeout(apply, 50); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.target.matches('input, select, textarea')) return;
      if (who) openPerson(''); else if (sel) open(''); else if (tool) setTool(''); else if (app.querySelector('.cm.cm-full') && !document.fullscreenElement) fullscreen();
    });
    panzoom();
  }
  function setTool(t) {
    tool = t; url('tool', t);
    if (t) { sel = ''; who = ''; url('b', ''); url('p', ''); }
    if (t !== 'route' && !(route && route.keep)) route = null;
    if (t !== 'day') day = null;
    draw();
    if (t === 'route' && route && route.to) center(route.to.b);
  }
  function color(st, b) {
    if (!(b.tt || []).length || !st.rooms.length) return '#64748b';
    if (!L.heat) return KIND[b.kind][1];
    return st.load >= 0.66 ? '#dc2626' : st.load >= 0.33 ? '#f59e0b' : '#16a34a';
  }
  function legend() {
    const items = [];
    if (L.heat) items.push(['#16a34a', 'هادئ'], ['#f59e0b', 'متوسط'], ['#dc2626', 'مزدحم'], ['#64748b', 'بلا قاعات تدريس']);
    if (L.oh) items.push(['#16a34a', 'ساعة مكتبية الآن', 'ring']);
    if (L.exams && EX) items.push(['#1d4ed8', 'امتحانات', 'sq']);
    if (L.gardens) items.push(['#f08a24', 'حديقة', 'dia']);
    $('#cm-key').innerHTML = items.map(([c, t, k]) => `<span><i class="${k || ''}" style="--c:${c}"></i> ${t}</span>`).join('');
    $('#cm-key').hidden = !items.length;
  }
  // everything on the map: buildings, layers, «أنت هنا», the route and the day
  function pins() {
    const n = now(), hits = new Set((search.hits || []).map(h => h.b && h.b.id)), oh = L.oh ? inOfficeHours(n) : [], ev = L.events ? events(n) : [];
    const pos = o => `left:${o.x * 100}%;top:${o.y * 100}%`;
    let h = C.buildings.map(b => {
      const st = status(b, n), c = color(st, b), ex = L.exams ? examsAt(b, n) : [], exNow = ex.filter(e => toMin(e.from) <= n.min && n.min < toMin(e.to)).length;
      const ohHere = oh.filter(x => x.b === b);
      return `<button type="button" class="cm-pin ${b.id === sel ? 'on' : ''} ${hits.has(b.id) ? 'hit' : ''}" data-b="${esc(b.id)}" style="${pos(b)};--c:${c}" title="${esc(b.name)}">
        <b>${esc(b.id)}</b>${st.run.length ? `<small title="محاضرات جارية">${st.run.length}</small>` : ''}
        ${ex.length ? `<em class="cm-exb" title="امتحانات اليوم${exNow ? ' (' + exNow + ' الآن)' : ''}"><i class="bi bi-clipboard-check"></i>${ex.length}</em>` : ''}
        ${L.faces && !ohHere.length ? stack(b) : ''}${ohHere.length ? `<span class="cm-stack oh">${ohHere.slice(0, 3).map(x => face(x.m)).join('')}${ohHere.length > 3 ? `<i>+${ohHere.length - 3}</i>` : ''}</span>` : ''}</button>`;
    }).join('');
    if (L.gates) h += (C.gates || []).map(g => `<span class="cm-gate" style="${pos(g)}" title="${esc(g.name)}">${esc(g.id)}</span>`).join('');
    if (L.gardens) h += (C.gardens || []).map(g => `<button type="button" class="cm-gdn" data-g="${esc(g.id)}" style="${pos(g)}" title="${esc(g.name)}"><b><span>${esc(g.id)}</span></b><em>${esc(g.name)}</em></button>`).join('');
    if (L.services) h += (C.services || []).map(s => `<span class="cm-svc ${s.kind}" style="${pos(s)}" title="${esc(s.name)}"><i class="bi ${esc(s.icon)}"></i><span>${esc(s.name)}</span></span>`).join('');
    h += ev.map(({ p, b }) => `<span class="cm-ev" style="left:${b.x * 100}%;top:${b.y * 100}%" title="${esc(p.title)} — ${esc(p.place)}"><i class="bi bi-calendar-event"></i> ${esc(evWhen(p, n))}</span>`).join('');
    if (here) h += `<span class="cm-here" style="${pos(here)}"><i></i><b>أنت هنا</b></span>`;
    h += bubbles(n);
    if (day && day.length) { const seen = {}; h += day.map((x, i) => { if (!x.b) return ''; const k = seen[x.b.id] = (seen[x.b.id] || 0) + 1; return `<span class="cm-step" style="left:${x.b.x * 100}%;top:${x.b.y * 100}%;--i:${k - 1}">${i + 1}</span>`; }).join(''); }
    $('#cm-pins').innerHTML = h;
    $('#cm-pins').querySelectorAll('.cm-pin').forEach(p => p.onclick = e => { e.stopPropagation(); if (tool === 'route') { pickTo({ b: B(p.dataset.b) }); return; } open(p.dataset.b); });
    $('#cm-pins').querySelectorAll('.cm-gdn').forEach(p => p.onclick = e => { e.stopPropagation(); garden(p.dataset.g); });
    lines(); legend();
  }
  const evWhen = (p, n) => { const d = Math.round((Date.parse(p.at.slice(0, 10)) - Date.parse(n.iso)) / 864e5); return d > 1 ? `بعد ${d} أيام` : d === 1 ? 'غداً ' + p.at.slice(11) : 'اليوم ' + p.at.slice(11); };
  // the route (a straight dashed line: the plan has no paths drawn to follow) and the day's path
  function lines() {
    let s = '';
    const pt = o => `${(o.x * 1000).toFixed(1)},${(o.y * 1000).toFixed(1)}`;
    if (tool === 'route' && route && route.from && route.to && route.to.b) s += `<polyline class="cm-route" points="${pt(route.from)} ${pt(route.to.b)}"/>`;
    if (day && day.filter(x => x.b).length > 1) s += `<polyline class="cm-dayline" points="${day.filter(x => x.b).map(x => pt(x.b)).join(' ')}"/>`;
    $('#cm-svg').innerHTML = s;
  }
  function stack(b) {
    const list = STAFF.filter(m => m.photo && staffB(m) === b).sort((x, y) => lead(x) - lead(y)).slice(0, 3);
    return list.length ? `<span class="cm-stack">${list.map(m => face(m)).join('')}</span>` : '';
  }
  function bubbles(n) {
    const m = person(who); if (!m) return '';
    const ob = staffB(m), w = whereNow(m, n), out = [];
    if (ob) out.push(`<span class="cm-bub" style="left:${ob.x * 100}%;top:${ob.y * 100}%">${face(m)}<small>المكتب</small></span>`);
    if (w && w.now && w.now.b && w.now.b !== ob) out.push(`<span class="cm-bub now" style="left:${w.now.b.x * 100}%;top:${w.now.b.y * 100}%">${face(m)}<small>الآن · ${esc(w.now.room)}</small></span>`);
    return out.join('');
  }
  function draw() {
    const n = now();
    $('#cm-clock').textContent = `${U.DAYS[n.day] || ''} ${n.clock}`;
    app.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === tool));
    pins(); card();
  }

  // ---------------------------------------------------------------- the panel
  function open(id, focus) {
    sel = id; unitF = ''; tab = '';
    if (id) { who = ''; url('p', ''); if (tool) { tool = ''; url('tool', ''); route = null; day = null; } }
    url('b', id);
    draw();
    if (focus && id) center(B(id));
    if (innerWidth < 992 && id && !app.querySelector('.cm.cm-full')) $('#cm-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openPerson(id, focus) {
    who = id; if (id && tool) { tool = ''; url('tool', ''); route = null; day = null; }
    url('p', id);
    draw();
    const m = person(id), b = m && (staffB(m) || ((whereNow(m, now()) || {}).now || {}).b);
    if (focus && b) center(b);
    if (innerWidth < 992 && id && !app.querySelector('.cm.cm-full')) $('#cm-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function card() {
    const n = now();
    if (tool === 'route') return routeTool();
    if (tool === 'day') return dayTool(n);
    if (tool === 'week') return weekTool();
    if (tool === 'qr') return qrTool();
    if (who && person(who)) return personCard(person(who), n);
    if (B(sel)) return buildingCard(B(sel), n);
    overview(n);
  }
  const head = (no, c, title, sub) => `<div class="cm-h">${no ? `<span class="cm-no" style="--c:${c}">${esc(no)}</span>` : ''}<div><h2>${esc(title)}</h2>${sub ? `<small>${sub}</small>` : ''}</div>
    <button type="button" class="btn-close" data-close aria-label="إغلاق"></button></div>`;
  const row = (left, title, sub, right) => `<div class="cm-row">${left != null ? `<span class="cm-room" dir="ltr">${esc(left)}</span>` : ''}<span class="cm-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${right ? `<span class="cm-end">${right}</span>` : ''}</div>`;
  const more = (n, what) => n > 0 ? `<div class="cm-more">و${n} ${what}</div>` : '';
  const empty = t => `<div class="cm-empty"><i class="bi bi-moon-stars"></i> ${t}</div>`;
  const tile = m => `<button type="button" class="cm-tile" data-p="${esc(m.id)}" title="${esc(m.name)}">${face(m)}<b>${esc(U.shortName(m.name))}</b><small>${esc(m.role || m.job || '')}</small></button>`;
  function bind(closeTo) {
    const c = $('#cm-card');
    c.querySelectorAll('[data-close]').forEach(x => x.onclick = closeTo);
    c.querySelectorAll('[data-p]').forEach(x => x.onclick = () => openPerson(x.dataset.p, true));
    c.querySelectorAll('[data-b]').forEach(x => x.onclick = () => open(x.dataset.b, true));
    c.querySelectorAll('[data-center]').forEach(x => x.onclick = () => center(B(x.dataset.center)));
    c.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => navigator.clipboard.writeText(x.dataset.copy).then(() => { x.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; }));
  }

  // a building: header, its leaders, the four numbers, then tabs (now / rooms / people / today)
  function buildingCard(b, n) {
    const st = status(b, n), staff = STAFF.filter(m => staffB(m) === b), ex = examsAt(b, n), posts = postsOn(b, n), ev = events(n).filter(x => x.b === b);
    const oh = inOfficeHours(n).filter(x => x.b === b), teach = (b.tt || []).length > 0;
    const units = [...new Set(staff.map(m => clean(m.office)).filter(o => !/^\d/.test(o)))];
    const leaders = staff.filter(m => lead(m) < 20).sort((x, y) => lead(x) - lead(y)).slice(0, 6);
    const tabs = [teach && ['now', 'bi-broadcast', 'الآن', st.run.length], teach && ['rooms', 'bi-door-open', 'القاعات', st.free.length], staff.length && ['people', 'bi-people', 'الأشخاص', staff.length],
      ['today', 'bi-calendar-day', 'اليوم', ex.length + posts.length + ev.length]].filter(Boolean);
    if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    let body = '';
    if (tab === 'now') {
      body = !st.ok ? empty('لا تدريس في هذا اليوم (عطلة أو خارج الفصل).')
        : `<h3><i class="bi bi-broadcast"></i> جارية الآن <small>${st.run.length}</small></h3>${st.run.length ? st.run.slice(0, 10).map(x => row(x.room, x.s.name, `${U.shortName(x.s.instructor)} · شعبة ${x.s.section}`, `حتى <bdi dir="ltr">${esc(x.m.end)}</bdi>`)).join('') + more(st.run.length - 10, 'محاضرات أخرى') : empty('لا محاضرات في هذه اللحظة.')}
          <h3><i class="bi bi-clock-history"></i> تبدأ خلال ساعة ونصف <small>${st.soon.length}</small></h3>${st.soon.length ? st.soon.slice(0, 8).map(x => row(x.room, x.s.name, U.shortName(x.s.instructor), `<bdi dir="ltr">${esc(x.m.start)}</bdi>`)).join('') + more(st.soon.length - 8, 'أخرى') : empty('لا شيء يبدأ قريباً.')}`;
    } else if (tab === 'rooms') {
      const all = st.free.filter(f => !f.until), part = st.free.filter(f => f.until).sort((x, y) => y.until - x.until);
      body = !st.ok ? empty('لا تدريس في هذا اليوم: كل القاعات متاحة.') : `<p class="cm-note">${st.free.length} من ${st.rooms.length} قاعة شاغرة الآن. اضغط القاعة لصفحتها وجدولها.</p>
        ${all.length ? `<h3><i class="bi bi-door-open"></i> شاغرة بقية اليوم <small>${all.length}</small></h3><div class="cm-free">${all.map(f => `<a href="room.html?q=${encodeURIComponent(f.r)}" dir="ltr">${esc(f.r)}</a>`).join('')}</div>` : ''}
        ${part.length ? `<h3><i class="bi bi-hourglass-split"></i> شاغرة لفترة <small>${part.length}</small></h3><div class="cm-free">${part.map(f => `<a href="room.html?q=${encodeURIComponent(f.r)}" class="part" dir="ltr">${esc(f.r)}<small>حتى ${toTime(f.until)}</small></a>`).join('')}</div>` : ''}
        ${st.busy.size ? `<h3><i class="bi bi-person-video3"></i> مشغولة الآن <small>${st.busy.size}</small></h3><div class="cm-free">${[...st.busy].sort((x, y) => x.localeCompare(y, 'en', { numeric: true })).map(r => `<a href="room.html?q=${encodeURIComponent(r)}" class="busy" dir="ltr">${esc(r)}</a>`).join('')}</div>` : ''}`;
    } else if (tab === 'people') {
      const list = staff.filter(m => !unitF || clean(m.office) === unitF).sort((x, y) => lead(x) - lead(y));
      body = `${oh.length ? `<h3><i class="bi bi-person-raised-hand"></i> في ساعته المكتبية الآن <small>${oh.length}</small></h3><div class="cm-faces">${oh.map(x => tile(x.m)).join('')}</div>` : ''}
        ${units.length > 1 ? `<div class="cm-units"><button type="button" data-u="" class="${unitF ? '' : 'on'}">الكل <small>${staff.length}</small></button>${units.map(u => `<button type="button" data-u="${esc(u)}" class="${u === unitF ? 'on' : ''}">${esc(u)} <small>${staff.filter(m => clean(m.office) === u).length}</small></button>`).join('')}</div>` : ''}
        <div class="cm-faces">${list.slice(0, 80).map(tile).join('')}</div>${more(list.length - 80, 'آخرين — في دليل الموظفين')}`;
    } else {
      body = `${ex.length ? `<h3><i class="bi bi-clipboard-check"></i> امتحانات اليوم <small>${ex.length}</small></h3>${ex.sort((x, y) => x.from.localeCompare(y.from)).slice(0, 10).map(e => row(e.from, e.name, e.rooms.filter(r => placeB(r.room) === b).map(r => r.room).join('، '), `${e.students || ''} طالب`)).join('')}` : ''}
        ${ev.length ? `<h3><i class="bi bi-calendar-event"></i> فعاليات هنا</h3>${ev.map(({ p }) => row(null, p.title, `${p.place} · ${evWhen(p, n)}`)).join('')}` : ''}
        ${posts.length ? `<h3><i class="bi bi-megaphone"></i> على شاشة المبنى الآن</h3>${posts.slice(0, 5).map(p => row(null, p.title || p.text, p.ownerName || '')).join('')}` : ''}
        ${!ex.length && !ev.length && !posts.length ? empty('لا امتحانات ولا فعاليات ولا إعلانات اليوم في هذا المبنى.') : ''}`;
    }
    $('#cm-card').innerHTML = `<div class="cm-card">${head(b.id, color(st, b), b.name, `${esc(KIND[b.kind][0])} · ${esc(U.DAYS[n.day] || '')} ${esc(n.clock)}${at ? ' · وقت مختار' : ''}`)}
      ${leaders.length ? `<div class="cm-lead">${leaders.map(m => `<button type="button" data-p="${esc(m.id)}" title="${esc(m.name)}">${face(m)}<small>${esc(m.role)}</small></button>`).join('')}</div>` : ''}
      ${teach ? `<div class="cm-kpis"><div><b>${st.run.length}</b><span>جارية</span></div><div><b>${st.soon.length}</b><span>قريباً</span></div><div><b>${st.free.length}<small>/${st.rooms.length}</small></b><span>قاعة شاغرة</span></div><div><b>${st.today}</b><span>محاضرة اليوم</span></div></div>` : ''}
      <div class="cm-tabs" role="tablist">${tabs.map(([k, i, t, c]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}"><i class="bi ${i}"></i> ${t}${c ? ` <small>${c}</small>` : ''}</button>`).join('')}</div>
      <div class="cm-body">${body}</div>
      <div class="cm-links">${teach ? `<a class="btn btn-sm btn-outline-secondary" href="room.html?bld=${encodeURIComponent(b.tt[0])}"><i class="bi bi-door-open"></i> قاعات المبنى</a>` : ''}
        ${b.screen ? `<a class="btn btn-sm btn-outline-secondary" href="screen.html?b=${encodeURIComponent(b.screen)}" target="_blank"><i class="bi bi-display"></i> شاشة المبنى</a>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cm-go"><i class="bi bi-signpost-split"></i> الطريق إليه</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?b=' + encodeURIComponent(b.id))}"><i class="bi bi-link-45deg"></i> رابط</button></div></div>`;
    bind(() => open(''));
    $('#cm-card').querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { tab = x.dataset.tab; card(); });
    $('#cm-card').querySelectorAll('[data-u]').forEach(x => x.onclick = () => { unitF = x.dataset.u; card(); });
    $('#cm-go').onclick = () => { route = { from: route && route.from, to: { b, label: b.name } }; setTool('route'); };
  }
  // a person: photo, job, office, where they teach now / next, office hours, contacts, colleagues
  function personCard(m, n) {
    const ob = staffB(m), w = whereNow(m, n), o = ohOf(m), ohToday = o ? (o.slots || []).filter(x => x.day === n.day) : [], ohN = ohNow(m, n);
    const mates = ob ? STAFF.filter(x => x !== m && staffB(x) === ob && clean(x.office) === clean(m.office)).sort((x, y) => lead(x) - lead(y)) : [];
    const lesson = (x, label, cls) => `<button type="button" data-center="${esc(x.b ? x.b.id : '')}" class="${cls || ''}"><i class="bi bi-${cls ? 'broadcast' : 'clock-history'}"></i><span><small>${label}</small><b>${esc(x.s.name)}</b><em>قاعة ${esc(x.room)}${x.b ? ' · ' + esc(x.b.name) : ''}</em></span>${x.b ? `<span class="cm-no sm">${esc(x.b.id)}</span>` : ''}</button>`;
    $('#cm-card').innerHTML = `<div class="cm-card"><div class="cm-pp">${face(m, 'xl')}<div><h2>${esc(m.name)}</h2><div class="cm-job">${esc(m.job || m.rank || '')}</div>${m.department ? `<small>${esc(m.department)}</small>` : ''}</div>
        <button type="button" class="btn-close" data-close aria-label="إغلاق"></button></div>
      <div class="cm-facts">
        ${ob ? `<button type="button" data-center="${esc(ob.id)}"><i class="bi bi-building"></i><span><small>المكتب</small><b>${esc(ob.name)}</b>${m.office ? `<em>${esc(m.office)}</em>` : ''}</span><span class="cm-no sm">${esc(ob.id)}</span></button>`
          : `<div><i class="bi bi-question-circle"></i><span><small>المكتب</small><b>${esc(m.office || 'غير مسجّل في الدليل')}</b></span></div>`}
        ${w && w.now ? lesson(w.now, `يدرّس الآن حتى ${esc(w.now.m.end)}`, 'now') : ''}
        ${w && !w.now && w.next ? lesson(w.next, `محاضرته التالية اليوم ${esc(w.next.m.start)}`) : ''}
        ${ohN ? `<div class="now"><i class="bi bi-person-raised-hand"></i><span><small>في ساعته المكتبية الآن</small><b>حتى ${esc(ohN.end)}</b>${o.place ? `<em>${esc(o.place)}</em>` : ''}</span></div>`
          : ohToday.length ? `<div><i class="bi bi-person-raised-hand"></i><span><small>ساعاته المكتبية اليوم</small><b dir="ltr">${ohToday.map(x => `${esc(x.start)}–${esc(x.end)}`).join('، ')}</b>${o.place ? `<em>${esc(o.place)}</em>` : ''}</span></div>` : ''}
        ${m.ext ? `<div><i class="bi bi-telephone"></i><span><small>الفرعي</small><b dir="ltr">${esc(m.ext)}</b></span></div>` : ''}
        ${m.email ? `<a href="mailto:${esc(m.email)}"><i class="bi bi-envelope"></i><span><small>البريد</small><b dir="ltr">${esc(m.email)}</b></span></a>` : ''}
      </div>
      ${mates.length ? `<h3><i class="bi bi-people"></i> معه في ${esc(clean(m.office))}</h3><div class="cm-faces">${mates.slice(0, 12).map(tile).join('')}</div>` : ''}
      <div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="directory.html?q=${encodeURIComponent(m.name)}"><i class="bi bi-person-lines-fill"></i> في الدليل</a>
        ${w && w.ins ? `<a class="btn btn-sm btn-outline-secondary" href="instructor.html?id=${encodeURIComponent(w.ins.id)}"><i class="bi bi-calendar3"></i> جدوله</a>` : ''}
        ${ob ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="cm-go"><i class="bi bi-signpost-split"></i> الطريق إلى مكتبه</button>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?p=' + encodeURIComponent(m.id))}"><i class="bi bi-link-45deg"></i> رابط</button></div></div>`;
    bind(() => openPerson(''));
    if ($('#cm-go')) $('#cm-go').onclick = () => { route = { from: route && route.from, to: { b: ob, room: /^\d/.test(clean(m.office)) ? clean(m.office) : '', label: 'مكتب ' + U.shortName(m.name) } }; setTool('route'); };
  }
  function garden(id) {
    const g = (C.gardens || []).find(x => x.id === id), d = o => Math.hypot(o.x - g.x, (o.y - g.y) * C.height / C.width);
    const near = C.buildings.slice().sort((a, b) => d(a) - d(b)).slice(0, 3);
    sel = ''; who = ''; tool = ''; url('tool', ''); url('b', '');
    app.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === ''));
    $('#cm-card').innerHTML = `<div class="cm-card">${head(g.id, '#f08a24', g.name, 'حديقة · من حدائق الحرم الـ19')}
      <h3><i class="bi bi-geo"></i> بالقرب منها</h3>${near.map(b => `<button type="button" class="cm-near" data-b="${esc(b.id)}"><span class="cm-no sm">${esc(b.id)}</span><span>${esc(b.name)}</span></button>`).join('')}
      <div class="cm-links"><button type="button" class="btn btn-sm btn-outline-secondary" id="cm-go"><i class="bi bi-signpost-split"></i> الطريق إليها</button></div></div>`;
    bind(() => card());
    $('#cm-go').onclick = () => { route = { from: route && route.from, to: { b: g, label: g.name } }; setTool('route'); };
    center(g);
  }
  // nothing chosen: the campus at a glance
  function overview(n) {
    const rows = C.buildings.map(b => ({ b, st: status(b, n) })), teachRows = rows.filter(r => (r.b.tt || []).length);
    const run = rows.reduce((a, r) => a + r.st.run.length, 0), free = rows.reduce((a, r) => a + r.st.free.length, 0), oh = inOfficeHours(n).length;
    const ex = EX ? EX.exams.filter(e => e.date === n.iso).length : 0, ev = events(n);
    $('#cm-card').innerHTML = `<div class="cm-card"><div class="cm-h"><div><h2>الحرم ${at ? 'في الوقت المختار' : 'الآن'}</h2><small>${esc(U.DAYS[n.day] || '')} ${esc(n.clock)} · اضغط أي مبنى على الخريطة أو في القائمة</small></div></div>
      <div class="cm-kpis"><div><b>${run}</b><span>محاضرة جارية</span></div><div><b>${free}</b><span>قاعة شاغرة</span></div>
        ${oh ? `<div><b>${oh}</b><span>في ساعة مكتبية</span></div>` : ''}${ex ? `<div><b>${ex}</b><span>امتحان اليوم</span></div>` : ''}</div>
      ${here ? `<div class="cm-here-note"><i class="bi bi-geo-alt-fill"></i> أنت عند <b>${esc(here.label)}</b>. اضغط «طريقي» لتعرف الطريق إلى قاعتك.</div>` : ''}
      ${ev.length ? `<h3><i class="bi bi-calendar-event"></i> فعاليات قادمة في الحرم</h3>${ev.slice(0, 4).map(({ p, b }) => `<button type="button" class="cm-near" data-b="${esc(b.id)}"><span class="cm-no sm">${esc(b.id)}</span><span><b>${esc(p.title)}</b><small>${esc(p.place)} · ${esc(evWhen(p, n))}</small></span></button>`).join('')}` : ''}
      <h3><i class="bi bi-buildings"></i> مباني التدريس <small>الأكثر انشغالاً أولاً</small></h3>
      <div class="cm-list">${teachRows.sort((x, y) => y.st.load - x.st.load || y.st.run.length - x.st.run.length).map(({ b, st }) =>
        `<button type="button" data-b="${esc(b.id)}"><span class="cm-no sm" style="--c:${color(st, b)}">${esc(b.id)}</span><span>${esc(b.name)}</span><span class="cm-bar"><i style="width:${Math.round(st.load * 100)}%;background:${color(st, b)}"></i></span><small>${st.run.length} جارية · ${st.free.length} شاغرة</small></button>`).join('')}</div>
      <h3><i class="bi bi-building"></i> المباني الأخرى</h3>
      <div class="cm-list">${rows.filter(r => !(r.b.tt || []).length).map(({ b }) => `<button type="button" data-b="${esc(b.id)}"><span class="cm-no sm" style="--c:#64748b">${esc(b.id)}</span><span>${esc(b.name)}</span></button>`).join('')}</div></div>`;
    bind(() => {});
  }

  // ---------------------------------------------------------------- «طريقي»: from here (or a gate, or a building) to a room, a course or a building
  function resolve(t) {
    t = clean(t);
    if (!t) return null;
    const n = U.norm(t);
    const b = C.buildings.find(x => x.id.toLowerCase() === n.toLowerCase() || U.norm(x.name).includes(n) || (x.aliases || []).some(a => U.norm(a) === n));
    if (b) return { b, label: b.name };
    const room = Object.keys(roomB).find(r => U.norm(r) === n);
    if (room) return { b: roomB[room], room, label: 'قاعة ' + room };
    if (/^\d{4}$/.test(t) && placeB(t)) return { b: placeB(t), room: t, label: 'قاعة ' + t };
    const nw = now(), secs = S.filter(s => U.norm(s.code) === n || (n.length >= 3 && U.norm(s.name).includes(n)));
    if (secs.length) {
      const today = secs.flatMap(s => s.meetings.filter(m => inRoom(m) && m.day === nw.day).map(m => ({ s, m }))).sort((x, y) => toMin(x.m.start) - toMin(y.m.start));
      const pick = today.find(x => toMin(x.m.end) > nw.min) || today[0];
      const s = pick ? pick.s : secs.find(x => byTT[x.building]) || secs[0];
      return byTT[s.building] ? { b: byTT[s.building], room: clean(s.room), label: `${s.name} · شعبة ${s.section}${pick ? ' · ' + pick.m.start : ''}` } : null;
    }
    const g = (C.gardens || []).find(x => U.norm(x.name).includes(n));
    if (g) return { b: g, label: g.name };
    const p = STAFF.find(m => U.norm(m.name).includes(n) && staffB(m));
    return p ? { b: staffB(p), room: /^\d/.test(clean(p.office)) ? clean(p.office) : '', label: 'مكتب ' + U.shortName(p.name) } : null;
  }
  function pickTo(to) { route = { from: route && route.from, to: Object.assign({ label: to.b.name }, to) }; draw(); center(to.b); }
  function routeTool() {
    const froms = [...(here ? [['here', 'أنت هنا: ' + here.label, here]] : []), ...(C.gates || []).map(g => ['gate:' + g.id, g.name, g]), ...C.buildings.map(b => ['b:' + b.id, `${b.id} · ${b.name}`, b])];
    if (!route) route = {};
    if (!route.from) route.from = froms[0][2];
    const curFrom = (froms.find(f => f[2] === route.from) || froms[0])[0];
    const t = route.to;
    let info = '';
    if (t && t.b) {
      const dx = (t.b.x - route.from.x), dy = (t.b.y - route.from.y) * C.height / C.width, m = Math.round(Math.hypot(dx, dy) * (C.meters_wide || 750) * 1.3 / 10) * 10;
      const gate = (C.gates || []).slice().sort((a, b) => Math.hypot(a.x - t.b.x, a.y - t.b.y) - Math.hypot(b.x - t.b.x, b.y - t.b.y))[0];
      const floor = t.room && /^\d{4}$/.test(t.room) ? t.room[1] : '';
      info = `<div class="cm-routebox"><div class="cm-dest"><i class="bi bi-geo-alt-fill"></i> <b>${esc(t.label)}</b></div>
        <div class="cm-facts">${t.b.name && t.b.id && B(t.b.id) === t.b ? `<button type="button" data-center="${esc(t.b.id)}"><i class="bi bi-building"></i><span><small>المبنى</small><b>${esc(t.b.name)}</b>${t.room ? `<em>قاعة ${esc(t.room)}${floor ? ' · الطابق ' + floor + ' غالباً (من رقم القاعة)' : ''}</em>` : ''}</span><span class="cm-no sm">${esc(t.b.id)}</span></button>` : ''}
          <div><i class="bi bi-person-walking"></i><span><small>المسافة سيراً (تقدير)</small><b>${m < 20 ? 'أنت عنده' : `حوالي ${m} متر · ${Math.max(1, Math.round(m / 80))} دقيقة`}</b><em>الخط المتقطع على الخريطة اتجاه مباشر، لا مسار مرسوم</em></span></div>
          ${gate ? `<div><i class="bi bi-door-open"></i><span><small>أقرب بوابة إليه</small><b>${esc(gate.name)}</b></span></div>` : ''}</div>
        <div class="cm-links"><button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?tool=route&to=' + encodeURIComponent(t.room || (B(t.b.id) === t.b ? t.b.id : t.label)))}"><i class="bi bi-link-45deg"></i> رابط هذا الطريق</button></div></div>`;
    }
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'طريقي', 'اختر من أين، واكتب القاعة أو المقرر أو المبنى أو اسم الشخص، أو اضغط مبنى على الخريطة')}
      <label class="cm-lbl" for="cm-from">من</label><select id="cm-from" class="form-select form-select-sm">${froms.map(([k, l]) => `<option value="${esc(k)}" ${k === curFrom ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label class="cm-lbl" for="cm-to">إلى</label><div class="cm-to"><input id="cm-to" class="form-control form-control-sm" placeholder="مثل 7419 أو 901331 أو المكتبة" value="${esc(t ? (t.room || t.label) : P.get('to') || P.get('room') || '')}"><button type="button" class="btn btn-sm btn-maroon" id="cm-to-go">اعرض</button></div>
      <div id="cm-to-err"></div>${info || (t === null ? '<div class="cm-none">لم أجد هذا. جرّب رقم القاعة أو رمز المقرر أو رقم المبنى.</div>' : '')}</div>`;
    bind(() => { route = null; setTool(''); });
    $('#cm-from').onchange = e => { route.from = froms.find(f => f[0] === e.target.value)[2]; draw(); };
    const go = () => { const r = resolve($('#cm-to').value); if (!r) { $('#cm-to-err').innerHTML = '<div class="cm-none">لم أجد هذا. جرّب رقم القاعة أو رمز المقرر أو رقم المبنى.</div>'; return; } route.to = r; draw(); center(r.b); };
    $('#cm-to-go').onclick = go; $('#cm-to').onkeydown = e => { if (e.key === 'Enter') go(); };
  }

  // ---------------------------------------------------------------- «يومي»: a student's day from «مخطط جدولي» (or course codes typed here)
  const PLAN = 'uopstaff-planner', MINE = 'uop-campus-mine';
  const store = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
  function myKeys() {
    if (P.get('plan')) return P.get('plan').split('~');
    const pl = store.get(PLAN), mine = store.get(MINE) || [];
    return [...new Set([...(pl ? Object.values(pl.pick || {}) : []), ...mine])];
  }
  function dayTool(n) {
    const BY = {}; S.forEach(s => { BY[U.sectionKey(s)] = s; });
    const keys = myKeys().filter(k => BY[k]), secs = keys.map(k => BY[k]), d = n.day;
    day = secs.flatMap(s => s.meetings.filter(m => m.day === d && live(m)).map(m => ({ s, m, a: toMin(m.start), z: toMin(m.end), b: inRoom(m) ? byTT[s.building] : null, room: clean(s.room), online: !inRoom(m) })))
      .sort((x, y) => x.a - y.a);
    const steps = day.map((x, i) => {
      const prev = day[i - 1], gap = prev ? x.a - prev.z : 0;
      return `${prev && gap > 0 ? `<div class="cm-gap"><i class="bi bi-cup-hot"></i> فراغ ${U.mins(gap)}${gap >= 60 ? ' — يمكنك قضاؤه في المكتبة (22) أو الكافيتريا (11)' : ''}</div>` : ''}${prev && gap < 0 ? '<div class="cm-gap bad"><i class="bi bi-exclamation-triangle"></i> تعارض مع المحاضرة السابقة</div>' : ''}
        <button type="button" class="cm-daystep ${x.a <= n.min && n.min < x.z ? 'now' : ''}" data-center="${esc(x.b ? x.b.id : '')}"><span class="cm-stepno">${i + 1}</span><span class="cm-t"><b>${esc(x.s.name)}</b><small>${esc(x.m.start)}–${esc(x.m.end)} · ${x.online ? 'إلكتروني' : `قاعة ${esc(x.room)}${x.b ? ' · ' + esc(x.b.name) : ''}`} · ${esc(U.shortName(x.s.instructor))}</small></span>${x.b ? `<span class="cm-no sm">${esc(x.b.id)}</span>` : ''}</button>`;
    }).join('');
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'يومي على الخريطة', `${esc(U.DAYS[d] || '')} · لتغيير اليوم استعمل شريط الوقت أسفل الخريطة`)}
      ${!keys.length ? `<p class="cm-note">لا جدول محفوظاً على هذا الجهاز. اختر شعبك في <a href="planner.html">«مخطط جدولي»</a> وتظهر هنا تلقائياً، أو أضف مقرراتك هنا:</p>`
        : `<p class="cm-note">${keys.length} شعبة من ${P.get('plan') ? 'الرابط' : '«مخطط جدولي» على هذا الجهاز'}. الأرقام على الخريطة ترتيب محاضراتك في اليوم.</p>`}
      <div class="cm-to"><input id="cm-add" class="form-control form-control-sm" placeholder="أضف مقرراً: الرمز-الشعبة، مثل 1001211-2" aria-label="أضف مقرراً"><button type="button" class="btn btn-sm btn-outline-secondary" id="cm-add-go">أضف</button></div><div id="cm-add-err"></div>
      ${day.length ? steps : keys.length ? empty('لا محاضرات لك في هذا اليوم.') : ''}
      ${keys.length ? `<div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="planner.html"><i class="bi bi-pencil"></i> عدّل في مخطط جدولي</a>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?tool=day&plan=' + encodeURIComponent(keys.join('~')))}"><i class="bi bi-link-45deg"></i> رابط يومي</button>
        ${(store.get(MINE) || []).length ? '<button type="button" class="btn btn-sm btn-outline-danger" id="cm-clear">امسح ما أضفته هنا</button>' : ''}</div>` : ''}</div>`;
    bind(() => { day = null; setTool(''); });
    const add = () => {
      const [code, sec] = $('#cm-add').value.trim().split(/[-–\s/]+/);
      const found = S.filter(s => s.code === code && (!sec || String(s.section) === sec));
      if (!found.length) { $('#cm-add-err').innerHTML = '<div class="cm-none">لم أجد هذا المقرر أو الشعبة.</div>'; return; }
      store.set(MINE, [...new Set([...(store.get(MINE) || []), ...found.map(U.sectionKey)])]); draw();
    };
    $('#cm-add-go').onclick = add; $('#cm-add').onkeydown = e => { if (e.key === 'Enter') add(); };
    if ($('#cm-clear')) $('#cm-clear').onclick = () => { store.set(MINE, []); draw(); };
    pins();
  }

  // ---------------------------------------------------------------- «الإشغال»: the week by building, day and hour
  const week = { b: '' };
  function weekTool() {
    const DAYS = Object.keys(U.DAYS).filter(k => k !== 'ج'), H0 = 8 * 60, H1 = 18 * 60;
    const teach = C.buildings.filter(b => (b.tt || []).length && roomsOf(b).length);
    const occ = (b, d, a0, a1) => { const r = roomsOf(b).length, ms = meetings(b, d); let used = 0; ms.forEach(x => { used += Math.max(0, Math.min(x.z, a1) - Math.max(x.a, a0)); }); return r ? Math.min(1, used / (r * (a1 - a0))) : 0; };
    const cell = v => `<td style="--v:${v.toFixed(2)}" title="${Math.round(v * 100)}%">${Math.round(v * 100)}</td>`;
    const wb = B(week.b) || teach[0];
    const hours = []; for (let h = 8; h < 18; h++) hours.push(h);
    const roomHours = {}; teach.forEach(b => roomsOf(b).forEach(r => { roomHours[r] = { b, h: 0 }; }));
    teach.forEach(b => DAYS.forEach(d => meetings(b, d).forEach(x => { if (roomHours[x.room]) roomHours[x.room].h += (x.z - x.a) / 60; })));
    const low = Object.entries(roomHours).sort((a, b) => a[1].h - b[1].h).slice(0, 10);
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'الإشغال الأسبوعي', 'نسبة القاعات المشغولة بين 8:00 و 18:00 حسب الجدول الدراسي، للتخطيط')}
      <div class="cm-heatwrap"><table class="cm-heat"><thead><tr><th>المبنى</th>${DAYS.map(d => `<th>${esc(U.DAYS[d] || d)}</th>`).join('')}</tr></thead>
        <tbody>${teach.map(b => `<tr class="${b === wb ? 'on' : ''}" data-wb="${esc(b.id)}" title="${esc(b.name)}"><th><span class="cm-no sm">${esc(b.id)}</span></th>${DAYS.map(d => cell(occ(b, d, H0, H1))).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="cm-note">الأرقام نسب مئوية؛ الأحمر الأكثر ازدحاماً. اضغط صف مبنى لتراه ساعة بساعة.</p>
      <h3><i class="bi bi-clock"></i> ${esc(wb.name)} ساعة بساعة</h3>
      <div class="cm-heatwrap"><table class="cm-heat sm"><thead><tr><th></th>${hours.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${DAYS.map(d => `<tr><th>${esc(U.DAYS[d] || d)}</th>${hours.map(h => cell(occ(wb, d, h * 60, h * 60 + 60))).join('')}</tr>`).join('')}</tbody></table></div>
      <h3><i class="bi bi-door-closed"></i> أقل القاعات استخداماً <small>ساعات تدريس في الأسبوع</small></h3>
      ${low.map(([r, x]) => row(r, x.b.name, '', `${Math.round(x.h)} ساعة`)).join('')}
      <div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="usage.html"><i class="bi bi-grid-3x3-gap-fill"></i> إشغال القاعات بالتفصيل</a></div></div>`;
    bind(() => setTool(''));
    $('#cm-card').querySelectorAll('[data-wb]').forEach(x => x.onclick = () => { week.b = x.dataset.wb; weekTool(); center(B(week.b)); });
  }

  // ---------------------------------------------------------------- «ملصقات QR»: «أنت هنا» stickers for the gates and the building entrances
  function qrTool() {
    const qr = link => { if (!window.qrcode) return ''; const x = window.qrcode(0, 'M'); x.addData(link); x.make(); return x.createSvgTag({ cellSize: 4, margin: 1, scalable: true }); };
    const items = [...(C.gates || []).map(g => ['gate:' + g.id, g.name, 'بوابة']), ...C.buildings.map(b => ['b:' + b.id, b.name, 'مبنى ' + b.id])];
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'ملصقات QR «أنت هنا»', 'لكل بوابة ومدخل مبنى: من يمسحه تفتح له الخريطة ومكانه عليها')}
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-print"><i class="bi bi-printer"></i> اطبع كل الملصقات (${items.length})</button></div>
      <div class="cm-qrs">${items.map(([k, name, kind]) => `<div class="cm-qr"><div class="cm-qr-c">${qr(SITE + 'campus.html?here=' + encodeURIComponent(k))}</div>
        <b>أنت هنا: ${esc(name)}</b><small>${esc(kind)}</small></div>`).join('')}</div></div>`;
    bind(() => setTool(''));
    $('#cm-print').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصقات خريطة الحرم</title><style>
        body{font-family:Tajawal,Tahoma,sans-serif;margin:0} .g{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding:8mm}
        .s{border:1.5px dashed #999;border-radius:6mm;padding:5mm;text-align:center;break-inside:avoid} .s svg{width:42mm;height:42mm} .s b{display:block;font-size:13pt;margin-top:2mm;color:#901d23} .s small{font-size:9pt;color:#444}
        .t{font-size:9pt;color:#901d23;font-weight:700}</style></head><body><div class="g">${items.map(([k, name]) => `<div class="s"><div class="t">جامعة البترا · خريطة الحرم</div>${qr(SITE + 'campus.html?here=' + encodeURIComponent(k))}<b>أنت هنا: ${esc(name)}</b><small>امسح الرمز للخريطة والطريق إلى قاعتك</small></div>`).join('')}</div>
        <script>window.onload=()=>window.print()<\/script></body></html>`);
      w.document.close();
    };
  }

  // ---------------------------------------------------------------- one search for everything
  function search() {
    const t = U.norm(q).trim(), n = now();
    url('q', q);
    if (t.length < 2) { search.hits = []; $('#cm-res').innerHTML = ''; pins(); return; }
    const hit = [], has = s => U.norm(s).includes(t);
    C.buildings.forEach(b => { if (has(b.name) || b.id.toLowerCase() === t || (b.tt || []).some(has) || (b.aliases || []).some(has)) hit.push({ b, ic: 'bi-building', t: b.name, s: 'مبنى رقم ' + b.id }); });
    Object.entries(roomB).forEach(([r, b]) => { if (U.norm(r) === t || (t.length >= 3 && U.norm(r).startsWith(t))) hit.push({ b, ic: 'bi-door-open', t: 'قاعة ' + r, s: b.name }); });
    [...new Set(STAFF.map(m => clean(m.office)).filter(o => o && !/^\d/.test(o) && has(o)))].forEach(o => { const b = placeB(o); if (b) hit.push({ b, ic: 'bi-diagram-3', t: o, s: b.name }); });
    STAFF.forEach(m => { if (has(m.name) || has(m.name_en || '') || (m.office && U.norm(clean(m.office)) === t)) { const b = staffB(m); hit.push({ b, p: m, t: m.name, s: (m.job || '') + (b ? ' · ' + b.name : ' · مكانه غير محدد') + (m.office ? ' · ' + m.office : '') }); } });
    const seen = new Set();
    S.filter(s => U.norm(s.code) === t || (t.length >= 3 && (has(s.name) || has(s.instructor)))).forEach(s => {
      const b = byTT[s.building]; if (!b) return; const k = s.code + s.section; if (seen.has(k)) return; seen.add(k);
      const today = s.meetings.filter(m => inRoom(m) && m.day === n.day);
      hit.push({ b, ic: 'bi-journal-text', t: `${s.name} · ش${s.section}`, s: `${U.shortName(s.instructor)} · ${clean(s.room)} · ${b.name}${today.length ? ' · اليوم ' + today.map(m => m.start).join('، ') : ''}` });
    });
    (C.gardens || []).forEach(g => { if (has(g.name)) hit.push({ g, ic: 'bi-tree', t: g.name, s: 'حديقة' }); });
    (C.services || []).forEach(s => { if (has(s.name)) hit.push({ sv: s, ic: s.icon, t: s.name, s: s.kind === 'parking' ? 'موقف' : 'خدمة' }); });
    search.hits = hit.slice(0, 80);
    $('#cm-res').innerHTML = hit.length ? `<div class="cm-res"><div class="cm-res-h"><span>${hit.length} نتيجة</span><button type="button" class="btn-close" id="cm-res-x" aria-label="إغلاق النتائج"></button></div>${hit.slice(0, 40).map((h, i) => `<button type="button" data-i="${i}">${h.p ? face(h.p) : `<i class="bi ${h.ic}"></i>`}<span><b>${esc(h.t)}</b><small>${esc(h.s)}</small></span>${h.b ? `<span class="cm-no sm">${esc(h.b.id)}</span>` : ''}</button>`).join('')}
      ${more(hit.length - 40, 'نتيجة أخرى؛ زد كلمات البحث')}</div>` : '<div class="cm-none">لا نتائج</div>';
    if ($('#cm-res-x')) $('#cm-res-x').onclick = () => { q = ''; $('#cm-q').value = ''; search(); };
    $('#cm-res').querySelectorAll('[data-i]').forEach(x => x.onclick = () => {
      const h = search.hits[+x.dataset.i]; $('#cm-res').innerHTML = '';
      if (h.p) openPerson(h.p.id, true);
      else if (h.g) { L.gardens = true; syncLayers(); pins(); garden(h.g.id); }
      else if (h.sv) { L.services = true; syncLayers(); pins(); center(h.sv); }
      else if (h.b) open(h.b.id, true);
    });
    pins();
  }
  const syncLayers = () => app.querySelectorAll('[data-l]').forEach(x => { x.checked = !!L[x.dataset.l]; });

  // ---------------------------------------------------------------- full screen and the automatic tour
  function fullscreen() {
    const el = app.querySelector('.cm'), on = el.classList.contains('cm-full');
    const css = v => { el.classList.toggle('cm-full', v); fsIcon(); setTimeout(apply, 60); };
    if (on) { if (document.fullscreenElement) document.exitFullscreen(); else css(false); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => css(true)); else css(true);
  }
  const fsIcon = () => { const on = app.querySelector('.cm').classList.contains('cm-full'); $('#cm-fs').innerHTML = `<i class="bi bi-${on ? 'fullscreen-exit' : 'fullscreen'}"></i>`; $('#cm-fs').title = on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'; };
  function startTour() {
    const n = now(), list = C.buildings.filter(b => (b.tt || []).length).sort((x, y) => status(y, n).run.length - status(x, n).run.length);
    let i = 0;
    const step = () => { open(list[i % list.length].id, true); i++; };
    step(); tour = setInterval(step, 12000);
    $('#cm-tour').innerHTML = '<i class="bi bi-stop-circle"></i>'; $('#cm-tour').classList.add('on');
  }
  function stopTour() { clearInterval(tour); tour = null; $('#cm-tour').innerHTML = '<i class="bi bi-play-circle"></i>'; $('#cm-tour').classList.remove('on'); }

  // ---------------------------------------------------------------- pan and zoom (the whole plan fits at first; it never shows empty space beyond its edges)
  function apply() {
    const m = $('#cm-map'); if (!m) return;
    const w = m.clientWidth, h = m.clientHeight, fit = Math.min(1, (h / w) * (C.width / C.height)), iw = w * view.s * fit, ih = iw * C.height / C.width;
    view.x = iw <= w ? (w - iw) / 2 : Math.min(0, Math.max(w - iw, view.x));
    view.y = ih <= h ? (h - ih) / 2 : Math.min(0, Math.max(h - ih, view.y));
    const st = $('#cm-stage'); st.style.width = iw + 'px'; st.style.transform = `translate(${view.x}px, ${view.y}px)`;
    // the sharper copy (twice the size) once the plan is shown larger than its own pixels: zoomed in, full screen or a dense screen
    if (C.image_2x && !apply.hd && iw * (window.devicePixelRatio || 1) > C.width * 1.05) { apply.hd = true; const hd = new Image(); hd.onload = () => { $('#cm-img').src = C.image_2x; }; hd.src = C.image_2x; }
    m.style.setProperty('--pin', Math.max(0.75, Math.min(1.3, view.s * fit * 0.9)));
  }
  function zoom(f, cx, cy) {
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight;
    if (!f) { view.s = 1; apply(); return; }
    cx = cx == null ? w / 2 : cx; cy = cy == null ? h / 2 : cy;
    const s = Math.max(1, Math.min(6, view.s * f)), k = s / view.s;
    view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s; apply();
  }
  function center(o) {
    if (!o) return;
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight, fit = Math.min(1, (h / w) * (C.width / C.height));
    if (view.s < 2) view.s = 2.2;
    const iw = w * view.s * fit, ih = iw * C.height / C.width;
    view.x = w / 2 - o.x * iw; view.y = h / 2 - o.y * ih; apply();
  }
  function panzoom() {
    const m = $('#cm-map'), ptr = new Map();
    let last = null, moved = 0, pinch = 0;
    m.querySelectorAll('[data-z]').forEach(x => x.onclick = () => zoom(+x.dataset.z));
    m.addEventListener('wheel', e => { if (e.target.closest('.cm-layers')) return; e.preventDefault(); const r = m.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    const ui = e => e.target.closest('.cm-tools, .cm-time, .cm-pin, .cm-gdn, .cm-layers, .cm-key');
    m.addEventListener('pointerdown', e => { if (tour && !e.target.closest('#cm-tour')) stopTour(); if (ui(e)) return; ptr.set(e.pointerId, e); m.setPointerCapture(e.pointerId); last = e; moved = 0; });
    m.addEventListener('pointermove', e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.set(e.pointerId, e);
      if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = m.getBoundingClientRect();
        if (pinch) zoom(d / pinch, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); pinch = d; return; }
      view.x += e.clientX - last.clientX; view.y += e.clientY - last.clientY; moved += Math.abs(e.clientX - last.clientX) + Math.abs(e.clientY - last.clientY); last = e; apply();
    });
    const up = e => { if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0;
      if (moved < 4 && P.has('edit')) { const r = $('#cm-img').getBoundingClientRect(), x = ((e.clientX - r.left) / r.width).toFixed(4), y = ((e.clientY - r.top) / r.height).toFixed(4);
        if (navigator.clipboard) navigator.clipboard.writeText(`"x": ${x}, "y": ${y}`); $('#cm-res').innerHTML = `<div class="alert alert-info py-2" dir="ltr">"x": ${x}, "y": ${y} (copied)</div>`; } };
    m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    m.addEventListener('dblclick', e => { if (ui(e)) return; const r = m.getBoundingClientRect(); zoom(1.6, e.clientX - r.left, e.clientY - r.top); });
    addEventListener('resize', apply);
    apply();
  }

  // ---------------------------------------------------------------- style and start
  document.head.insertAdjacentHTML('beforeend', `<style>
    .cm { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 410px); gap: 1rem; align-items: start; }
    @media (max-width: 991.98px) { .cm { grid-template-columns: minmax(0, 1fr); } }
    .cm-map { position: relative; aspect-ratio: 1848 / 1080; max-height: 80vh; width: 100%; min-height: 300px; border-radius: 16px; overflow: hidden; background: #f3f6f4; touch-action: none; cursor: grab; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); direction: ltr; }
    @media (max-width: 575.98px) { .cm-map { aspect-ratio: 4 / 5; } }
    .cm-map:active { cursor: grabbing; }
    .cm-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .cm-stage img { display: block; width: 100%; height: auto; user-select: none; pointer-events: none; image-rendering: auto; }
    #cm-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .cm-route { fill: none; stroke: #2563eb; stroke-width: 5; stroke-dasharray: 14 9; vector-effect: non-scaling-stroke; stroke-linecap: round; animation: cmDash 1s linear infinite; }
    .cm-dayline { fill: none; stroke: #901d23; stroke-width: 4; stroke-dasharray: 10 8; vector-effect: non-scaling-stroke; opacity: .85; }
    @keyframes cmDash { to { stroke-dashoffset: -23; } }
    #cm-pins { position: absolute; inset: 0; }
    .cm-pin { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); border: 3px solid #fff; background: var(--c); color: #fff; border-radius: 999px; min-width: 2.1rem; height: 2.1rem; padding: 0 .35rem;
      display: flex; align-items: center; gap: .2rem; justify-content: center; font-weight: 800; font-size: .85rem; box-shadow: 0 3px 10px rgba(0,0,0,.35); cursor: pointer; transition: transform .15s; }
    .cm-pin small { background: rgba(0,0,0,.28); border-radius: 999px; padding: 0 .3rem; font-size: .7rem; }
    .cm-pin:hover, .cm-pin.on { transform: translate(-50%, -50%) scale(calc(var(--pin, 1) * 1.25)); z-index: 3; }
    .cm-pin.on { outline: 4px solid #fbbf24; } .cm-pin.hit { animation: cmHit 1s ease-in-out infinite; z-index: 2; }
    @keyframes cmHit { 50% { box-shadow: 0 0 0 10px rgba(251,191,36,.55); } }
    .cm-exb { position: absolute; bottom: -1.1rem; left: 50%; transform: translateX(-50%); background: #1d4ed8; color: #fff; font-style: normal; font-size: .62rem; border-radius: 6px; padding: 0 .3rem; white-space: nowrap; box-shadow: 0 0 0 2px #fff; }
    .cm-gate { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); background: #1e3a8a; color: #fff; font-size: .65rem; font-weight: 800; width: 1.3rem; height: 1.3rem; border-radius: 4px; display: grid; place-items: center; pointer-events: none; opacity: .9; }
    .cm-gdn { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); border: 0; background: none; padding: 0; display: flex; align-items: center; gap: .35rem; cursor: pointer; }
    .cm-gdn > b { width: 1.3rem; height: 1.3rem; background: #f08a24; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); transform: rotate(45deg); display: grid; place-items: center; }
    .cm-gdn > b span { transform: rotate(-45deg); color: #fff; font-size: .6rem; }
    .cm-gdn em { font-style: normal; background: rgba(255,255,255,.94); border-radius: 6px; padding: 0 .3rem; font-size: .62rem; font-weight: 700; color: #7c3a00; white-space: nowrap; direction: rtl; display: none; }
    .cm-gdn:hover em { display: block; }
    .cm-svc { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); display: flex; align-items: center; gap: .2rem; pointer-events: none; }
    .cm-svc i { width: 1.5rem; height: 1.5rem; border-radius: 6px; background: #86198f; color: #fff; display: grid; place-items: center; font-size: .8rem; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
    .cm-svc.parking i { background: #475569; } .cm-svc span { background: rgba(255,255,255,.92); border-radius: 6px; padding: 0 .3rem; font-size: .6rem; font-weight: 700; white-space: nowrap; direction: rtl; color: #111; }
    .cm-ev { position: absolute; transform: translate(-50%, -260%) scale(var(--pin, 1)); background: #6d28d9; color: #fff; border-radius: 999px; padding: .05rem .5rem; font-size: .66rem; font-weight: 700; white-space: nowrap; direction: rtl; pointer-events: none; box-shadow: 0 0 0 2px #fff; }
    .cm-here { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); display: grid; justify-items: center; pointer-events: none; z-index: 5; }
    .cm-here i { width: 1.2rem; height: 1.2rem; border-radius: 50%; background: #2563eb; border: 3px solid #fff; animation: cmHere 1.6s infinite; }
    .cm-here b { background: #2563eb; color: #fff; border-radius: 999px; padding: 0 .5rem; font-size: .7rem; margin-top: .15rem; direction: rtl; }
    @keyframes cmHere { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.6); } 70% { box-shadow: 0 0 0 16px rgba(37,99,235,0); } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
    .cm-step { position: absolute; transform: translate(calc(70% + var(--i) * 110%), -125%) scale(var(--pin, 1)); background: #901d23; color: #fff; font-weight: 800; font-size: .72rem; width: 1.35rem; height: 1.35rem; border-radius: 50%; display: grid; place-items: center; border: 2px solid #fff; z-index: 4; pointer-events: none; }
    .cm-tools { position: absolute; top: .6rem; left: .6rem; display: grid; gap: .3rem; z-index: 6; }
    .cm-tools button { width: 2.2rem; height: 2.2rem; border: 0; border-radius: 10px; background: #fff; color: #111; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
    .cm-tools button.on { background: #901d23; color: #fff; } .cm-fs-only { display: none; }
    .cm-layers { position: absolute; top: .6rem; left: 3.2rem; z-index: 7; direction: rtl; background: #fff; color: #111; border-radius: 12px; padding: .6rem .8rem; box-shadow: 0 6px 22px rgba(0,0,0,.25); display: grid; gap: .3rem; font-size: .88rem; min-width: 14rem; }
    .cm-layers[hidden] { display: none; } .cm-layers label { display: flex; gap: .4rem; align-items: center; cursor: pointer; } .cm-layers i { color: #901d23; }
    .cm-time { position: absolute; bottom: .6rem; left: .6rem; right: .6rem; direction: rtl; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,.95); color: #111; border-radius: 12px; padding: .4rem .6rem; box-shadow: 0 2px 10px rgba(0,0,0,.15); z-index: 6; }
    .cm-time select { width: auto; } .cm-time input[type=range] { flex: 1; min-width: 110px; accent-color: #901d23; direction: ltr; } .cm-time b { font-variant-numeric: tabular-nums; min-width: 6.5rem; }
    .cm-key { position: absolute; top: .6rem; right: .6rem; direction: rtl; display: flex; flex-wrap: wrap; gap: .25rem .6rem; max-width: 60%; background: rgba(255,255,255,.94); color: #111; border-radius: 10px; padding: .25rem .6rem; font-size: .74rem; z-index: 6; }
    .cm-key[hidden] { display: none; } .cm-key i { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; background: var(--c); vertical-align: middle; }
    .cm-key i.ring { background: #fff; box-shadow: 0 0 0 2px var(--c); } .cm-key i.sq { border-radius: 2px; } .cm-key i.dia { border-radius: 1px; transform: rotate(45deg); }
    @media (max-width: 575.98px) { .cm-key { display: none; } }
    .cm-side { display: grid; grid-template-columns: minmax(0, 1fr); gap: .6rem; min-width: 0; box-sizing: border-box; }
    .cm-side *, .cm-side *::before, .cm-side *::after { box-sizing: border-box; }
    .cm-side > * { min-width: 0; }
    .cm-search { position: relative; } .cm-search i { position: absolute; inset-inline-start: .8rem; top: 50%; transform: translateY(-50%); color: #6b7280; }
    .cm-search input { width: 100%; border: 1px solid var(--bs-border-color); border-radius: 12px; padding: .6rem 2.3rem .6rem .8rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-modes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .25rem; }
    .cm-modes button { border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .35rem .1rem; display: grid; justify-items: center; gap: .05rem; font-size: .72rem; font-weight: 700; }
    .cm-modes button i { font-size: 1.05rem; color: #901d23; } .cm-modes button.on { background: #901d23; color: #fff; border-color: #901d23; } .cm-modes button.on i { color: #fff; }
    .cm-res { display: grid; gap: .25rem; max-height: 320px; overflow: auto; } .cm-res-h { display: flex; justify-content: space-between; align-items: center; font-size: .8rem; color: var(--bs-secondary-color); }
    .cm-res button, .cm-list button, .cm-near { display: flex; gap: .55rem; align-items: center; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .4rem .6rem; width: 100%; }
    .cm-res button:hover, .cm-list button:hover, .cm-near:hover { border-color: #901d23; } .cm-res button > span:first-of-type, .cm-near > span:nth-child(2) { flex: 1; min-width: 0; }
    .cm-res b, .cm-res small, .cm-near b, .cm-near small { display: block; } .cm-res small, .cm-near small { color: var(--bs-secondary-color); font-size: .76rem; } .cm-res > button > i { color: #901d23; }
    .cm-near { margin-bottom: .3rem; }
    .cm-none, .cm-more { color: var(--bs-secondary-color); font-size: .85rem; padding: .3rem; }
    .cm-empty { color: var(--bs-secondary-color); font-size: .85rem; padding: .5rem; background: var(--bs-tertiary-bg); border-radius: 10px; }
    .cm-note { font-size: .82rem; color: var(--bs-secondary-color); margin: .2rem 0 .5rem; }
    .cm-card { border: 1px solid var(--bs-border-color); border-radius: 14px; padding: .9rem; background: var(--bs-body-bg); min-width: 0; overflow: hidden; }
    .cm-h { display: flex; gap: .7rem; align-items: center; margin-bottom: .6rem; } .cm-h > div { flex: 1; min-width: 0; } .cm-h h2 { font-size: 1.12rem; font-weight: 800; margin: 0; } .cm-h small { color: var(--bs-secondary-color); font-size: .8rem; }
    .cm-no { background: var(--c, #9e1f27); color: #fff; font-weight: 800; border-radius: 999px; min-width: 2.4rem; height: 2.4rem; padding: 0 .4rem; display: inline-grid; place-items: center; flex: none; }
    .cm-no.sm { min-width: 1.8rem; height: 1.8rem; font-size: .78rem; }
    .cm-lead { display: flex; flex-wrap: wrap; gap: .35rem .5rem; margin-bottom: .6rem; }
    .cm-lead button { border: 0; background: none; display: grid; justify-items: center; gap: .1rem; padding: 0; color: inherit; width: 3.9rem; }
    .cm-lead .cm-face { width: 2.8rem; height: 2.8rem; box-shadow: 0 0 0 2px #901d23; } .cm-lead small { font-size: .62rem; color: #901d23; font-weight: 700; line-height: 1.15; }
    .cm-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: .35rem; margin-bottom: .6rem; }
    .cm-kpis div { background: var(--bs-tertiary-bg); border-radius: 10px; padding: .4rem .2rem; text-align: center; min-width: 0; } .cm-kpis b { display: block; font-size: 1.25rem; color: #901d23; line-height: 1.2; } .cm-kpis b small { font-size: .75rem; color: var(--bs-secondary-color); }
    .cm-kpis span { font-size: .7rem; color: var(--bs-secondary-color); }
    .cm-tabs { display: flex; gap: .15rem; border-bottom: 2px solid var(--bs-border-color); margin-bottom: .5rem; }
    .cm-tabs button { flex: 1; border: 0; background: none; color: var(--bs-secondary-color); padding: .35rem .2rem; font-weight: 700; font-size: .8rem; border-bottom: 3px solid transparent; margin-bottom: -2px; white-space: nowrap; }
    .cm-tabs button.on { color: #901d23; border-bottom-color: #901d23; } .cm-tabs small { background: var(--bs-tertiary-bg); border-radius: 999px; padding: 0 .35rem; font-size: .68rem; }
    .cm-body { max-height: 52vh; overflow: auto; padding-inline-end: .2rem; }
    .cm-card h3 { font-size: .9rem; font-weight: 800; margin: .7rem 0 .35rem; } .cm-card h3 i { color: #901d23; } .cm-card h3 small { color: var(--bs-secondary-color); font-weight: 500; font-size: .75rem; }
    .cm-body > h3:first-child, .cm-body > .cm-note:first-child + h3 { margin-top: .2rem; }
    .cm-row { display: flex; gap: .5rem; align-items: center; padding: .3rem 0; border-bottom: 1px dashed var(--bs-border-color); }
    .cm-room { flex: none; background: var(--bs-tertiary-bg); border-radius: 8px; padding: .1rem .45rem; font-weight: 800; font-size: .82rem; min-width: 3.3rem; text-align: center; }
    .cm-t { flex: 1; min-width: 0; } .cm-t b { display: block; font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cm-t small { display: block; color: var(--bs-secondary-color); font-size: .75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cm-end { flex: none; font-size: .76rem; color: var(--bs-secondary-color); }
    .cm-free { display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: .3rem; }
    .cm-free a { text-decoration: none; background: #ecfdf3; color: #166534; border-radius: 8px; padding: .2rem .3rem; font-weight: 800; font-size: .82rem; text-align: center; }
    .cm-free a.part { background: #fffbeb; color: #92400e; } .cm-free a.busy { background: #fef2f2; color: #991b1b; }
    .cm-free small { display: block; font-weight: 500; font-size: .64rem; }
    .cm-units { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .45rem; }
    .cm-units button { font-size: .76rem; border: 1px solid var(--bs-border-color); border-radius: 999px; padding: .1rem .55rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-units button.on { background: #901d23; color: #fff; border-color: #901d23; } .cm-units small { opacity: .7; }
    .cm-face { width: 2.4rem; height: 2.4rem; border-radius: 50%; object-fit: cover; object-position: top; flex: none; background: #e5e7eb; box-shadow: 0 0 0 2px #fff; }
    .cm-face.xl { width: 5.5rem; height: 5.5rem; box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(0,0,0,.2); }
    .cm-ini { display: inline-grid; place-items: center; color: #901d23; font-weight: 800; font-size: .85rem; background: #f8e3e5; }
    .cm-faces { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: .4rem; padding: .15rem; }
    .cm-tile { display: grid; justify-items: center; align-content: start; gap: .15rem; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 12px; padding: .45rem .25rem; text-align: center; min-width: 0; }
    .cm-tile:hover { border-color: #901d23; } .cm-tile .cm-face { width: 3.1rem; height: 3.1rem; }
    .cm-tile b { font-size: .72rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cm-tile small { font-size: .64rem; color: #901d23; font-weight: 700; line-height: 1.2; }
    .cm-pp { display: flex; gap: .8rem; align-items: center; margin-bottom: .7rem; } .cm-pp > div { flex: 1; min-width: 0; } .cm-pp h2 { font-size: 1.08rem; font-weight: 800; margin: 0; }
    .cm-job { color: #901d23; font-weight: 700; font-size: .86rem; } .cm-pp small { color: var(--bs-secondary-color); }
    .cm-facts { display: grid; gap: .35rem; }
    .cm-facts > * { display: flex; gap: .6rem; align-items: center; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .45rem .6rem; text-decoration: none; width: 100%; }
    .cm-facts > button:hover { border-color: #901d23; } .cm-facts > .now { border-color: #16a34a; background: #f0fdf4; color: #14532d; }
    .cm-facts i { color: #901d23; font-size: 1.1rem; } .cm-facts span:first-of-type { flex: 1; min-width: 0; } .cm-facts small { display: block; color: var(--bs-secondary-color); font-size: .72rem; } .cm-facts b { display: block; font-size: .88rem; } .cm-facts em { display: block; font-style: normal; font-size: .76rem; color: var(--bs-secondary-color); }
    .cm-stack { position: absolute; top: -1.55rem; left: 50%; transform: translateX(-50%); display: flex; align-items: center; }
    .cm-stack .cm-face { width: 1.6rem; height: 1.6rem; margin-inline-start: -.45rem; box-shadow: 0 0 0 2px #fff; } .cm-stack .cm-ini { font-size: .55rem; }
    .cm-stack.oh .cm-face { box-shadow: 0 0 0 2px #16a34a; } .cm-stack i { font-style: normal; font-size: .6rem; background: #16a34a; color: #fff; border-radius: 999px; padding: 0 .25rem; margin-inline-start: .1rem; }
    .cm-bub { position: absolute; transform: translate(-50%, -125%) scale(var(--pin, 1)); display: grid; justify-items: center; gap: .1rem; pointer-events: none; z-index: 4; }
    .cm-bub .cm-face { width: 3rem; height: 3rem; box-shadow: 0 0 0 3px #fbbf24, 0 4px 12px rgba(0,0,0,.35); }
    .cm-bub small { background: #111827; color: #fff; border-radius: 999px; padding: 0 .45rem; font-size: .66rem; font-weight: 700; white-space: nowrap; }
    .cm-bub.now .cm-face { box-shadow: 0 0 0 3px #16a34a, 0 4px 12px rgba(0,0,0,.35); } .cm-bub.now small { background: #16a34a; }
    .cm-links { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; }
    .cm-list { display: grid; gap: .3rem; } .cm-list button > span:nth-child(2) { flex: 1; min-width: 0; } .cm-list small { color: var(--bs-secondary-color); font-size: .72rem; white-space: nowrap; }
    .cm-bar { width: 3.2rem; height: .4rem; background: var(--bs-tertiary-bg); border-radius: 999px; overflow: hidden; flex: none; } .cm-bar i { display: block; height: 100%; }
    .cm-lbl { font-size: .8rem; font-weight: 700; margin: .4rem 0 .15rem; display: block; }
    .cm-to { display: flex; gap: .35rem; margin: .3rem 0; } .cm-to input { flex: 1; min-width: 0; }
    .cm-routebox { margin-top: .6rem; display: grid; gap: .4rem; } .cm-dest { font-size: .95rem; } .cm-dest i { color: #2563eb; }
    .cm-here-note { background: #eff6ff; color: #1e3a8a; border-radius: 10px; padding: .45rem .6rem; font-size: .85rem; margin-bottom: .4rem; }
    .cm-daystep { display: flex; gap: .55rem; align-items: center; width: 100%; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .4rem .6rem; margin-top: .3rem; }
    .cm-daystep.now { border-color: #16a34a; background: #f0fdf4; } .cm-stepno { background: #901d23; color: #fff; width: 1.6rem; height: 1.6rem; border-radius: 50%; display: grid; place-items: center; font-weight: 800; flex: none; }
    .cm-gap { font-size: .76rem; color: var(--bs-secondary-color); padding: .2rem .6rem; } .cm-gap.bad { color: #b91c1c; font-weight: 700; }
    .cm-heatwrap { overflow-x: auto; } .cm-heat { border-collapse: separate; border-spacing: 2px; width: 100%; font-size: .7rem; }
    .cm-heat th { font-weight: 700; color: var(--bs-secondary-color); text-align: center; padding: .1rem; white-space: nowrap; } .cm-heat tbody th { text-align: start; }
    .cm-heat td { text-align: center; border-radius: 4px; padding: .25rem 0; background: color-mix(in srgb, #dc2626 calc(var(--v) * 100%), #ecfdf3); color: #111; font-weight: 700; }
    .cm-heat tr[data-wb] { cursor: pointer; } .cm-heat tr.on th .cm-no { outline: 3px solid #fbbf24; } .cm-heat.sm td { font-size: .6rem; }
    .cm-qrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .5rem; max-height: 52vh; overflow: auto; margin-top: .5rem; }
    .cm-qr { border: 1px dashed var(--bs-border-color); border-radius: 10px; padding: .5rem; text-align: center; } .cm-qr-c svg { width: 96px; height: 96px; background: #fff; }
    .cm-qr b { display: block; font-size: .76rem; color: #901d23; } .cm-qr small { font-size: .66rem; color: var(--bs-secondary-color); }
    .cm.cm-full { position: fixed; inset: 0; z-index: 2000; display: block; background: #0b1c22; }
    .cm.cm-full .cm-map { position: absolute; inset: 0 calc(min(410px, 36vw) + 1.2rem) 0 0; width: auto; aspect-ratio: auto; max-height: none; height: auto; border-radius: 0; }
    .cm.cm-full.cm-nopanel .cm-map { inset: 0; }
    .cm.cm-full .cm-side { position: absolute; top: .6rem; bottom: .6rem; right: .6rem; width: min(410px, 36vw); overflow-y: auto; overflow-x: hidden; z-index: 5; align-content: start;
      background: var(--bs-body-bg, #fff); color: var(--bs-body-color, #111); border-radius: 14px; padding: .6rem; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .cm.cm-full .cm-body { max-height: none; } .cm.cm-full .cm-fs-only { display: block; } .cm.cm-nopanel .cm-side { display: none; }
    @media (max-width: 767.98px) { .cm.cm-full .cm-map { inset: 0; } .cm.cm-full .cm-side { top: auto; bottom: 4.6rem; left: .5rem; right: .5rem; width: auto; max-height: 45%; } }
  </style>`);
  const ohLoad = window.OH ? window.OH.load().catch(() => ({ map: {} })) : Promise.resolve({ map: {} });
  Promise.all([U.getJSON('data/campus.json'), U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json').catch(() => null), U.getJSON('data/staff.json').catch(() => ({ members: [] })),
    U.getJSON('data/exam_schedule.json').catch(() => null), U.getJSON('data/screen_posts.json', true).catch(() => null), ohLoad]).then(([c, tt, idx, st, ex, posts, oh]) => {
    C = c; S = tt.sections; IDX = idx; STAFF = st.members || []; EX = ex && ex.exams && ex.exams.length ? ex : null; POSTS = posts; OHMAP = (oh && oh.map) || {};
    U.setDays(tt.days);
    U.updatedLine(tt.updated, 'المخطط من الموقع الرسمي للجامعة');
    ((idx && idx.instructors) || []).forEach(i => { INS[nameKey(i.name)] = i; });
    index();
    const h = (P.get('here') || '').split(':');
    if (h[0] === 'gate') { const g = (C.gates || []).find(x => x.id === h[1]); if (g) here = { x: g.x, y: g.y, label: g.name }; }
    if (h[0] === 'b' && B(h[1])) here = { x: B(h[1]).x, y: B(h[1]).y, label: 'مبنى ' + B(h[1]).name };
    shell();
    const toQ = P.get('room') || P.get('to');
    if (toQ) { tool = 'route'; route = { from: here, to: resolve(toQ) }; }
    draw();
    if (q) search();
    if (who && person(who)) openPerson(who, true);
    else if (sel && B(sel)) center(B(sel));
    else if (route && route.to) center(route.to.b);
    else if (here) center(here);
    setInterval(() => { if (!at) { Object.keys(cache).forEach(k => delete cache[k]); draw(); } }, 60000);
  }).catch(e => { app.innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
