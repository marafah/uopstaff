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
  const L = { heat: true, nums: true, names: P.has('names'), count: !P.has('nocount'), size: 1, faces: P.has('faces'), oh: false, events: true, exams: true, gardens: false, services: false, gates: true, safety: false };
  const view = { s: 1, x: 0, y: 0 };
  const L0 = Object.assign({}, L), LKEY = 'uop-campus-layers';
  try { const kept = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (kept && !P.has('names') && !P.has('nocount') && !P.has('faces')) Object.keys(L).forEach(k => { if (k in kept) L[k] = kept[k]; }); } catch (e) { /* storage unavailable */ }
  const saveL = () => { try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) { /* storage unavailable */ } };
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
      <div class="cm-mapwrap"><div class="cm-map" id="cm-map"><div class="cm-stage" id="cm-stage"><img src="${esc(C.image)}" alt="مخطط حرم جامعة البترا" draggable="false" id="cm-img"><div id="cm-tiles"></div>
          <svg id="cm-svg" viewBox="0 0 ${C.width} ${C.height}" preserveAspectRatio="none"></svg><div id="cm-pins"></div></div>
        <div class="cm-tools"><button type="button" data-z="1.4" title="تكبير"><i class="bi bi-plus-lg"></i></button><button type="button" data-z="0.7" title="تصغير"><i class="bi bi-dash-lg"></i></button>
          <button type="button" data-z="0" title="الخريطة كاملة"><i class="bi bi-aspect-ratio"></i></button>
          <button type="button" id="cm-fs" title="ملء الشاشة"><i class="bi bi-fullscreen"></i></button>
          <button type="button" id="cm-layers-b" title="الطبقات: ما يظهر على الخريطة"><i class="bi bi-layers"></i></button>
          <button type="button" id="cm-sos" class="sos" title="الطوارئ ونقاط التجمع"><i class="bi bi-exclamation-octagon-fill"></i></button>
          <button type="button" id="cm-tour" title="جولة تلقائية على المباني (لشاشات العرض)"><i class="bi bi-play-circle"></i></button>
          <button type="button" id="cm-panel" class="cm-fs-only" title="إخفاء القائمة"><i class="bi bi-layout-sidebar-inset-reverse"></i></button></div>
        <div class="cm-layers" id="cm-layers" hidden><b>ما يظهر على الخريطة</b>${[['nums', 'bi-123', 'أرقام المباني'], ['names', 'bi-fonts', 'أسماء المباني'], ['heat', 'bi-thermometer-half', 'ألوان الانشغال'], ['count', 'bi-broadcast', 'عدد المحاضرات الجارية'], ['faces', 'bi-people', 'وجوه القيادات على المباني'],
          ['oh', 'bi-person-raised-hand', 'في الساعات المكتبية الآن'], ['exams', 'bi-clipboard-check', 'الامتحانات'], ['events', 'bi-calendar-event', 'الفعاليات'],
          ['gardens', 'bi-tree', 'الحدائق'], ['services', 'bi-signpost-2', 'الخدمات والمواقف'], ['gates', 'bi-door-closed', 'البوابات'], ['safety', 'bi-people-fill', 'نقاط التجمع (مقترحة)']].map(([k, i, t]) =>
          `<label><input type="checkbox" data-l="${k}" ${L[k] ? 'checked' : ''}> <i class="bi ${i}"></i> ${t}</label>`).join('')}
          <label class="cm-size"><i class="bi bi-type"></i> الحجم <input type="range" id="cm-size" min="0.7" max="1.6" step="0.1" value="${L.size}" aria-label="حجم الأرقام والأسماء"></label>
          <button type="button" class="cm-reset" id="cm-reset">الإعدادات الأصلية</button></div>
        <div class="cm-key" id="cm-key"></div></div>
        <div class="cm-time"><select id="cm-day" class="form-select form-select-sm" aria-label="اليوم"></select><input type="range" id="cm-min" min="420" max="1260" step="15" aria-label="الوقت"><b id="cm-clock"></b>
          <button type="button" class="btn btn-sm btn-light" id="cm-now"><i class="bi bi-clock"></i> الآن</button></div>
      </div>
      <aside class="cm-side"><div class="cm-search"><i class="bi bi-search"></i><input id="cm-q" type="search" placeholder="ابحث: مدرس، موظف، قاعة، مقرر، وحدة، مبنى…" value="${esc(q)}"></div>
        <nav class="cm-modes" role="tablist">${[['', 'bi-buildings', 'المباني'], ['route', 'bi-signpost-split', 'طريقي'], ['free', 'bi-door-open', 'قاعة شاغرة'], ['day', 'bi-calendar-week', 'يومي'], ['exams', 'bi-clipboard-check', 'امتحاني'], ['more', 'bi-grid-3x3-gap', 'المزيد']]
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
    $('#cm-layers').onchange = e => { const k = e.target.dataset.l; if (k) { L[k] = e.target.checked; saveL(); draw(); } };
    $('#cm-size').oninput = e => { L.size = +e.target.value; saveL(); apply(); };
    $('#cm-reset').onclick = () => { Object.assign(L, L0); syncLayers(); $('#cm-size').value = L.size; saveL(); draw(); apply(); };
    $('#cm-layers').addEventListener('pointerdown', e => e.stopPropagation());
    document.addEventListener('click', e => { if (!e.target.closest('#cm-layers, #cm-layers-b')) $('#cm-layers').hidden = true; });
    $('#cm-q').oninput = e => { q = e.target.value; search(); };
    const top = $('#pg-q'); if (top) { top.value = q; top.oninput = e => { q = e.target.value; $('#cm-q').value = q; search(); }; }
    app.querySelectorAll('[data-tool]').forEach(x => x.onclick = () => setTool(x.dataset.tool));
    $('#cm-fs').onclick = fullscreen;
    $('#cm-sos').onclick = () => setTool('emergency');
    $('#cm-tour').onclick = () => tour ? stopTour() : startTour();
    // the panel (on the right): hide it for a bigger map, show it again; remembered on this device
    $('#cm-panel').onclick = () => panel(app.querySelector('.cm').classList.contains('cm-nopanel'), true);
    try { if (localStorage.getItem('uop-campus-panel') === 'off') panel(false); } catch (e) { /* storage unavailable */ }
    document.addEventListener('fullscreenchange', () => { app.querySelector('.cm').classList.toggle('cm-full', !!document.fullscreenElement); fsIcon(); setTimeout(apply, 50); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.target.matches('input, select, textarea')) return;
      if (who) openPerson(''); else if (sel) open(''); else if (tool) setTool(''); else if (app.querySelector('.cm.cm-full') && !document.fullscreenElement) fullscreen();
    });
    panzoom();
  }
  function panel(show, keep) {
    const el = app.querySelector('.cm'); el.classList.toggle('cm-nopanel', !show);
    $('#cm-panel').title = show ? 'إخفاء القائمة' : 'إظهار القائمة'; $('#cm-panel').classList.toggle('on', !show);
    $('#cm-panel').innerHTML = `<i class="bi bi-layout-sidebar-inset${show ? '-reverse' : ''}"></i>`;
    if (keep) try { localStorage.setItem('uop-campus-panel', show ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
    setTimeout(apply, 60);
  }
  // a building or a person chosen on the map while the panel is hidden: show it, so its card can be read
  const needPanel = () => { if (app.querySelector('.cm.cm-nopanel')) panel(true); };
  function setTool(t) {
    if (t) needPanel();
    tool = t; url('tool', t);
    if (t) { sel = ''; who = ''; url('b', ''); url('p', ''); }
    if (t !== 'route' && !(route && route.keep)) route = null;
    if (t !== 'day') day = null;
    OV = { lines: [], marks: '' }; mark = new Set(); exday = null;
    if (t !== 'fix') FIX.out = null;
    draw();
    if (t === 'route' && route && route.to) center(route.to.b);
  }
  function color(st, b) {
    if (!(b.tt || []).length || !st.rooms.length) return '#64748b';
    if (tool === 'crowd') return crowdColor(crowdNow(b, now()));
    if (!L.heat) return KIND[b.kind][1];
    return st.load >= 0.66 ? '#dc2626' : st.load >= 0.33 ? '#f59e0b' : '#16a34a';
  }
  function legend() {
    const items = [];
    if (tool === 'crowd') items.push(['#16a34a', 'أقل من 150 طالباً'], ['#f59e0b', '150–400'], ['#dc2626', 'أكثر من 400']);
    else if (L.heat) items.push(['#16a34a', 'هادئ'], ['#f59e0b', 'متوسط'], ['#dc2626', 'مزدحم'], ['#64748b', 'بلا قاعات تدريس']);
    if (mark.size && tool === 'free') items.push(['#16a34a', 'فيه قاعة مناسبة', 'ring']);
    if (L.safety || tool === 'emergency') items.push(['#15803d', 'نقطة تجمع' + (C.safety && C.safety.status !== 'official' ? ' (مقترحة)' : ''), 'sq']);
    if (L.count && tool !== 'crowd') items.push(['#111827', 'محاضرات جارية', 'cnt']);
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
      const cnt = tool === 'crowd' ? crowdNow(b, n) : st.run.length;
      return `<button type="button" class="cm-pin ${L.nums ? '' : 'nonum'} ${b.id === sel ? 'on' : ''} ${hits.has(b.id) ? 'hit' : ''} ${mark.has(b.id) ? 'mk' : ''}" data-b="${esc(b.id)}" style="${pos(b)};--c:${c}" title="${esc(b.name)}">
        <b>${esc(b.id)}</b>${(L.count || tool === 'crowd') && cnt ? `<small class="cm-cnt" title="${tool === 'crowd' ? cnt + ' طالباً في قاعاته' : cnt + ' محاضرة جارية الآن'}">${cnt}</small>` : ''}
        ${ex.length ? `<em class="cm-exb" title="امتحانات اليوم${exNow ? ' (' + exNow + ' الآن)' : ''}"><i class="bi bi-clipboard-check"></i>${ex.length}</em>` : ''}
        ${L.faces && !ohHere.length ? stack(b) : ''}${ohHere.length ? `<span class="cm-stack oh">${ohHere.slice(0, 3).map(x => face(x.m)).join('')}${ohHere.length > 3 ? `<i>+${ohHere.length - 3}</i>` : ''}</span>` : ''}</button>`;
    }).join('');
    if (L.names) h += C.buildings.map(b => `<span class="cm-name" data-nb="${esc(b.id)}" style="${pos(b)}">${esc(b.short || b.name)}</span>`).join('');
    if (L.gates) h += (C.gates || []).map(g => `<span class="cm-gate" style="${pos(g)}" title="${esc(g.name)}">${esc(g.id)}</span>`).join('');
    if (L.gardens) h += (C.gardens || []).map(g => `<button type="button" class="cm-gdn" data-g="${esc(g.id)}" style="${pos(g)}" title="${esc(g.name)}"><b><span>${esc(g.id)}</span></b><em>${esc(g.name)}</em></button>`).join('');
    if (L.services) h += (C.services || []).map(s => `<span class="cm-svc ${s.kind}" style="${pos(s)}" title="${esc(s.name)}"><i class="bi ${esc(s.icon)}"></i><span>${esc(s.name)}</span></span>`).join('');
    h += ev.map(({ p, b }) => `<span class="cm-ev" style="left:${b.x * 100}%;top:${b.y * 100}%" title="${esc(p.title)} — ${esc(p.place)}"><i class="bi bi-calendar-event"></i> ${esc(evWhen(p, n))}</span>`).join('');
    if (here) h += `<span class="cm-here" style="${pos(here)}"><i></i><b>أنت هنا</b></span>`;
    h += bubbles(n) + routeMarks() + OV.marks;
    if ((L.safety || tool === 'emergency') && C.safety) h += C.safety.assembly.map(a => `<span class="cm-ap" style="${pos(a)}" title="نقطة التجمع ${esc(a.id)}: ${esc(a.name)}${C.safety.status !== 'official' ? ' (مقترحة)' : ''}"><i class="bi bi-people-fill"></i><b>${esc(a.id)}</b></span>`).join('');
    if (day && day.length) { const seen = {}; h += day.map((x, i) => { if (!x.b) return ''; const k = seen[x.b.id] = (seen[x.b.id] || 0) + 1; return `<span class="cm-step" style="left:${x.b.x * 100}%;top:${x.b.y * 100}%;--i:${k - 1}">${i + 1}</span>`; }).join(''); }
    $('#cm-pins').innerHTML = h;
    $('#cm-pins').querySelectorAll('.cm-pin').forEach(p => p.onclick = e => { e.stopPropagation(); if (tool === 'route') { pickTo({ b: B(p.dataset.b) }); return; } open(p.dataset.b); });
    $('#cm-pins').querySelectorAll('.cm-gdn').forEach(p => p.onclick = e => { e.stopPropagation(); garden(p.dataset.g); });
    lines(); legend(); names();
  }
  // building names that never overlap: each name tries below, above, beside its pin, and is left out (until zoomed in)
  // when every place is taken by another name or pin; the selected building and teaching buildings go first
  function names() {
    const els = [...$('#cm-pins').querySelectorAll('.cm-name')];
    if (!els.length) return;
    const m = $('#cm-map'), mr = m.getBoundingClientRect(), taken = [];
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const pinR = {};
    $('#cm-pins').querySelectorAll('.cm-pin').forEach(p => { const r = p.getBoundingClientRect(); pinR[p.dataset.b] = r; taken.push({ l: r.left - 2, r: r.right + 2, t: r.top - 2, b: r.bottom + 2 }); });
    app.querySelectorAll('.cm-tools, .cm-key:not([hidden])').forEach(x => { const r = x.getBoundingClientRect(); if (r.width) taken.push({ l: r.left - 4, r: r.right + 4, t: r.top - 4, b: r.bottom + 4 }); });
    const rank = el => { const b = B(el.dataset.nb); return (b.id === sel ? -100 : 0) + ((b.tt || []).length ? 0 : 10) + b.y; };
    els.sort((x, y) => rank(x) - rank(y)).forEach(el => {
      el.className = 'cm-name'; el.style.setProperty('--dx', '0px'); el.style.setProperty('--dy', '0px');
      const p = pinR[el.dataset.nb]; if (!p) return;
      const er = el.getBoundingClientRect(), w = er.width, h = er.height, cx = (p.left + p.right) / 2, cy = (p.top + p.bottom) / 2, rx = (p.right - p.left) / 2 + 3, ry = (p.bottom - p.top) / 2 + 2;
      const spots = [[0, ry + h / 2], [0, -ry - h / 2], [rx + w / 2, 0], [-rx - w / 2, 0], [rx + w / 2 - 6, ry + h / 2 - 4], [-rx - w / 2 + 6, ry + h / 2 - 4]];
      for (const [dx, dy] of spots) {
        const box = { l: cx + dx - w / 2, r: cx + dx + w / 2, t: cy + dy - h / 2, b: cy + dy + h / 2 };
        if (box.l < mr.left + 2 || box.r > mr.right - 2 || box.t < mr.top + 2 || box.b > mr.bottom - 2) continue;
        if (taken.some(o => hit(o, box))) continue;
        taken.push({ l: box.l - 3, r: box.r + 3, t: box.t - 2, b: box.b + 2 });
        el.style.setProperty('--dx', dx + 'px'); el.style.setProperty('--dy', dy + 'px'); el.classList.add('on');
        return;
      }
    });
  }
  const evWhen = (p, n) => { const d = Math.round((Date.parse(p.at.slice(0, 10)) - Date.parse(n.iso)) / 864e5); return d > 1 ? `بعد ${d} أيام` : d === 1 ? 'غداً ' + p.at.slice(11) : 'اليوم ' + p.at.slice(11); };
  // the route (a straight line: the plan has no paths drawn to follow) and the day's path: a white casing under a
  // bold dashed line, so it stands out on any part of the plan; arrows, the start and the destination are pins
  const showRoute = () => tool === 'route' && route && route.from && route.to && route.to.b;
  function lines() {
    let s = '';
    const pt = o => `${(o.x * C.width).toFixed(1)},${(o.y * C.height).toFixed(1)}`;
    const line = (pts, cls) => `<polyline class="cm-case" points="${pts}"/><polyline class="${cls}" points="${pts}"/>`;
    if (showRoute()) s += line(`${pt(route.from)} ${pt(route.to.b)}`, 'cm-route');
    if (day && day.filter(x => x.b).length > 1) s += line(day.filter(x => x.b).map(x => pt(x.b)).join(' '), 'cm-dayline');
    OV.lines.forEach(l => { const pts = l.pts.map(pt).join(' '); s += l.nocase ? `<polyline class="${l.cls}" points="${pts}"/>` : line(pts, l.cls); });
    $('#cm-svg').innerHTML = s;
  }
  function routeMarks() {
    if (!showRoute()) return '';
    const a = route.from, b = route.to.b, deg = Math.atan2((b.y - a.y) * C.height, (b.x - a.x) * C.width) * 180 / Math.PI;
    const at = f => `left:${(a.x + (b.x - a.x) * f) * 100}%;top:${(a.y + (b.y - a.y) * f) * 100}%`;
    const far = Math.hypot((b.x - a.x) * C.width, (b.y - a.y) * C.height) > 120;
    return (far ? [0.3, 0.55, 0.8] : [0.55]).map(f => `<span class="cm-arrow" style="${at(f)};--r:${deg}deg"><i class="bi bi-chevron-right"></i></span>`).join('')
      + (route.from === here ? '' : `<span class="cm-rt-a" style="${at(0)}" title="من"><i></i></span>`)
      + `<span class="cm-rt-b" style="${at(1)}"><i class="bi bi-geo-alt-fill"></i><b>${esc(route.to.label || '')}</b></span>`;
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
    app.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === tool || (x.dataset.tool === 'more' && MOREK.includes(tool))));
    pins(); card();
  }

  // ---------------------------------------------------------------- the panel
  function open(id, focus) {
    if (id && !tour) needPanel();
    sel = id; unitF = ''; tab = '';
    if (id) { who = ''; url('p', ''); if (tool) { tool = ''; url('tool', ''); route = null; day = null; } }
    url('b', id);
    draw();
    if (focus && id) center(B(id));
    if (innerWidth < 992 && id && !app.querySelector('.cm.cm-full')) $('#cm-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openPerson(id, focus) {
    if (id) needPanel();
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
    if (tool === 'more') return moreTool();
    if (tool === 'free') return freeTool(n);
    if (tool === 'exams') return examTool(n);
    if (tool === 'crowd') return crowdTool(n);
    if (tool === 'tour') return tourTool();
    if (tool === 'emergency') return emergencyTool();
    if (tool === 'fix') return fixTool();
    if (tool === 'access') return accessTool();
    if (who && person(who)) return personCard(person(who), n);
    if (B(sel)) return buildingCard(B(sel), n);
    overview(n);
  }
  const head = (no, c, title, sub) => `${!no && MOREK.includes(tool) ? '<button type="button" class="cm-back" data-go="more"><i class="bi bi-chevron-right"></i> المزيد</button>' : ''}<div class="cm-h">${no ? `<span class="cm-no" style="--c:${c}">${esc(no)}</span>` : ''}<div><h2>${esc(title)}</h2>${sub ? `<small>${sub}</small>` : ''}</div>
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
    c.querySelectorAll('[data-go]').forEach(x => x.onclick = () => setTool(x.dataset.go));
    c.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => navigator.clipboard.writeText(x.dataset.copy).then(() => { x.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; }));
  }

  // a building: header, its leaders, the four numbers, then tabs (now / rooms / people / today)
  function buildingCard(b, n) {
    const st = status(b, n), staff = STAFF.filter(m => staffB(m) === b), ex = examsAt(b, n), posts = postsOn(b, n), ev = events(n).filter(x => x.b === b);
    const oh = inOfficeHours(n).filter(x => x.b === b), teach = (b.tt || []).length > 0;
    const units = [...new Set(staff.map(m => clean(m.office)).filter(o => !/^\d/.test(o)))];
    const leaders = staff.filter(m => lead(m) < 20).sort((x, y) => lead(x) - lead(y)).slice(0, 6);
    const tabs = [teach && ['now', 'bi-broadcast', 'الآن', st.run.length], teach && ['rooms', 'bi-door-open', 'القاعات', st.free.length], teach && ['floors', 'bi-layers', 'الطوابق', 0], staff.length && ['people', 'bi-people', 'الأشخاص', staff.length],
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
    } else if (tab === 'floors') {
      // a schematic from the room numbers (not an architectural plan): each floor's rooms, free or busy now
      const fl = {}; st.rooms.forEach(r => { const f = floorOf(r); (fl[f == null ? 'x' : f] = fl[f == null ? 'x' : f] || []).push(r); });
      const keys = Object.keys(fl).sort((a, b2) => (b2 === 'x' ? -1 : +b2) - (a === 'x' ? -1 : +a));
      const cls = r => st.busy.has(r) ? 'busy' : (st.free.find(f => f.r === r) || {}).until ? 'part' : '';
      body = `<div class="cm-floors">${keys.map(k => `<div class="cm-floor"><span class="cm-fl">${k === 'x' ? '؟' : k === '0' ? 'أرضي' : k}</span><div class="cm-free">${fl[k].map(r => `<a href="room.html?q=${encodeURIComponent(r)}" class="${cls(r)}" dir="ltr">${esc(r)}</a>`).join('')}</div></div>`).join('')}</div>
        <p class="cm-note"><span class="cm-dot"></span> شاغرة · <span class="cm-dot part"></span> لفترة · <span class="cm-dot busy"></span> مشغولة الآن. مخطط تخطيطي من أرقام القاعات وليس مخططاً هندسياً؛ المصعد والمدخل الميسّر غير موثّقين.</p>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-acc="${esc(b.id)}"><i class="bi bi-universal-access"></i> الوصول الميسّر إلى هذا المبنى</button>`;
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
    $('#cm-card').querySelectorAll('[data-acc]').forEach(x => x.onclick = () => { ACC.to = b; setTool('access'); });
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
  // adding sections here: one box finds them by course name, code, instructor or room (or «الرمز-الشعبة»), with
  // options for what to search in and «only the chosen day»; each result has its days and times and a + button
  const find = { q: '', by: 'all', today: false };
  const BYKEY = () => { if (!BYKEY.m) { BYKEY.m = {}; S.forEach(s => { BYKEY.m[U.sectionKey(s)] = s; }); } return BYKEY.m; };
  const when = s => [...new Set(s.meetings.filter(live).map(m => `${U.DAYS[m.day] || m.day} ${m.start}`))].join('، ') || 'بلا موعد';
  function findSections(d) {
    const raw = find.q.trim(), t = U.norm(raw);
    if (t.length < 2) return null;
    const [code, sec] = raw.split(/[-–\s/]+/);
    let out;
    if (/^\d{5,}$/.test(code) && sec && /^\d+$/.test(sec)) out = S.filter(s => s.code === code && String(s.section) === sec);
    else {
      const has = v => U.norm(v || '').includes(t);
      const by = { all: s => U.norm(s.code).startsWith(t) || has(s.name) || has(s.instructor) || U.norm(clean(s.room)) === t,
        name: s => has(s.name), code: s => U.norm(s.code).startsWith(t), ins: s => has(s.instructor), room: s => U.norm(clean(s.room)).startsWith(t) }[find.by];
      out = S.filter(by);
    }
    if (find.today) out = out.filter(s => s.meetings.some(m => m.day === d && live(m)));
    const seen = new Set();
    return out.filter(s => { const k = U.sectionKey(s); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => x.name.localeCompare(y.name, 'ar') || String(x.section).localeCompare(String(y.section), 'en', { numeric: true }));
  }
  const dayList = (secs, d) => secs.flatMap(s => s.meetings.filter(m => m.day === d && live(m)).map(m => ({ s, m, a: toMin(m.start), z: toMin(m.end), b: inRoom(m) ? byTT[s.building] : null, room: clean(s.room), online: !inRoom(m) })))
    .sort((x, y) => x.a - y.a);
  function dayTool(n) {
    const BY = BYKEY(), keys = myKeys().filter(k => BY[k]), secs = keys.map(k => BY[k]), d = n.day, mine = new Set(store.get(MINE) || []);
    const fromPlan = new Set(P.get('plan') ? [] : Object.values((store.get(PLAN) || {}).pick || {}));
    day = dayList(secs, d);
    const steps = day.map((x, i) => {
      const prev = day[i - 1], gap = prev ? x.a - prev.z : 0;
      // walking between two buildings: is the break long enough?
      const wk = prev && prev.b && x.b && prev.b !== x.b ? walkMin(meters(prev.b, x.b)) : 0;
      const walk = wk && gap >= 0 ? (gap < wk ? `<div class="cm-gap bad"><i class="bi bi-person-walking"></i> تحتاج نحو ${wk} د مشياً من مبنى ${esc(prev.b.id)} إلى مبنى ${esc(x.b.id)}، والفاصل ${gap ? gap + ' د' : 'صفر'}: قد تتأخر</div>`
        : `<div class="cm-gap"><i class="bi bi-person-walking"></i> ${wk} د مشياً إلى مبنى ${esc(x.b.id)}</div>`) : '';
      return `${prev && gap > 0 ? `<div class="cm-gap"><i class="bi bi-cup-hot"></i> فراغ ${U.mins(gap)}${gap >= 60 ? ' — يمكنك قضاؤه في المكتبة (22) أو الكافيتريا (11)' : ''}</div>` : ''}${prev && gap < 0 ? '<div class="cm-gap bad"><i class="bi bi-exclamation-triangle"></i> تعارض مع المحاضرة السابقة</div>' : ''}${walk}
        <button type="button" class="cm-daystep ${x.a <= n.min && n.min < x.z ? 'now' : ''}" data-center="${esc(x.b ? x.b.id : '')}"><span class="cm-stepno">${i + 1}</span><span class="cm-t"><b>${esc(x.s.name)}</b><small>${esc(x.m.start)}–${esc(x.m.end)} · ${x.online ? 'إلكتروني' : `قاعة ${esc(x.room)}${x.b ? ' · ' + esc(x.b.name) : ''}`} · ${esc(U.shortName(x.s.instructor))}</small></span>${x.b ? `<span class="cm-no sm">${esc(x.b.id)}</span>` : ''}</button>`;
    }).join('');
    const chips = keys.map(k => { const s = BY[k]; return `<span class="cm-chip" title="${esc(s.name)} · ${esc(U.shortName(s.instructor))} · ${esc(when(s))}"><span>${esc(s.name)} <small>ش${esc(s.section)}</small></span>${mine.has(k) ? `<button type="button" data-rm="${esc(k)}" aria-label="احذف"><i class="bi bi-x"></i></button>` : fromPlan.has(k) ? '<i class="bi bi-calendar2-check" title="من «مخطط جدولي»"></i>' : ''}</span>`; }).join('');
    const tabs = [['day', 'bi-signpost-2', 'يومي على الخريطة'], ['add', 'bi-plus-circle', 'أضف مقرراتي'], ['mine', 'bi-list-check', `شعبي <small>${keys.length}</small>`]];
    if (!dayTool.tab) dayTool.tab = keys.length ? 'day' : 'add';
    let body;
    if (dayTool.tab === 'add') {
      body = `<p class="cm-note">ابحث باسم المقرر أو رمزه أو اسم المدرس أو رقم القاعة، ثم اضغط <b>+</b> بجانب شعبتك.</p>
        <div class="cm-search sm"><i class="bi bi-search"></i><input id="cm-add" type="search" placeholder="مثل: برمجة، 1001211، أحمد، 7419" value="${esc(find.q)}" aria-label="ابحث عن مقرر"></div>
        <div class="cm-by" role="group" aria-label="ابحث في">${[['all', 'الكل'], ['name', 'اسم المقرر'], ['code', 'الرمز'], ['ins', 'المدرس'], ['room', 'القاعة']].map(([k, t]) => `<button type="button" data-by="${k}" class="${find.by === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label class="cm-chk"><input type="checkbox" id="cm-today" ${find.today ? 'checked' : ''}> فقط ما له محاضرة يوم ${esc(U.DAYS[d] || '')}</label>
        <div id="cm-found"></div>`;
    } else if (dayTool.tab === 'mine') {
      body = keys.length ? `<p class="cm-note">${P.get('plan') ? 'الشعب من الرابط.' : 'ما أضفته هنا (يُحذف بـ ×) وما اخترته في «مخطط جدولي» (<i class="bi bi-calendar2-check"></i>).'}</p><div class="cm-chips">${chips}</div>
        <div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="planner.html"><i class="bi bi-pencil"></i> مخطط جدولي</a>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?tool=day&plan=' + encodeURIComponent(keys.join('~')))}"><i class="bi bi-link-45deg"></i> رابط يومي</button>
          ${mine.size ? '<button type="button" class="btn btn-sm btn-outline-danger" id="cm-clear">امسح ما أضفته هنا</button>' : ''}</div>`
        : empty('لم تختر شعباً بعد. اذهب إلى «أضف مقرراتي».');
    } else {
      body = !keys.length ? `<p class="cm-note">لا جدول محفوظاً على هذا الجهاز. أضف مقرراتك من «أضف مقرراتي» (بالاسم أو الرمز أو المدرس)، أو اخترها في <a href="planner.html">«مخطط جدولي»</a> وتظهر هنا تلقائياً.</p>`
        : `<p class="cm-note">الأرقام على الخريطة ترتيب محاضراتك يوم ${esc(U.DAYS[d] || '')}. لتغيير اليوم استعمل شريط الوقت.</p>${day.length ? steps : empty('لا محاضرات لك في هذا اليوم.')}`;
    }
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'يومي على الخريطة', `${esc(U.DAYS[d] || '')} · ${keys.length} شعبة`)}
      <div class="cm-tabs" role="tablist">${tabs.map(([k, i, t]) => `<button type="button" role="tab" data-dt="${k}" class="${k === dayTool.tab ? 'on' : ''}"><i class="bi ${i}"></i> ${t}</button>`).join('')}</div>
      <div class="cm-body">${body}</div></div>`;
    bind(() => { day = null; dayTool.tab = ''; setTool(''); });
    const c = $('#cm-card');
    c.querySelectorAll('[data-dt]').forEach(x => x.onclick = () => { dayTool.tab = x.dataset.dt; dayTool(now()); });
    c.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { store.set(MINE, [...mine].filter(k => k !== x.dataset.rm)); draw(); });
    if ($('#cm-clear')) $('#cm-clear').onclick = () => { store.set(MINE, []); draw(); };
    if (dayTool.tab === 'add') {
      const list = () => {
        const r = findSections(d), have = new Set(keys);
        $('#cm-found').innerHTML = r == null ? '' : !r.length ? '<div class="cm-none">لا شعب مطابقة. جرّب كلمة أخرى أو «الكل».</div>'
          : `<div class="cm-res-h"><span>${r.length} شعبة${r.length > 40 ? ' — أول 40؛ زد كلمات البحث' : ''}</span></div><div class="cm-found">${r.slice(0, 40).map(s => { const k = U.sectionKey(s), b = byTT[s.building];
            return `<div class="cm-sec ${have.has(k) ? 'in' : ''}"><span class="cm-t"><b>${esc(s.name)} <small>ش${esc(s.section)}</small></b><small>${esc(s.code)} · ${esc(U.shortName(s.instructor) || '—')}</small><small><i class="bi bi-clock"></i> ${esc(when(s))}${clean(s.room) && clean(s.room) !== '0' ? ` · <i class="bi bi-door-open"></i> ${esc(clean(s.room))}` : ''}</small></span>
              ${b ? `<span class="cm-no sm">${esc(b.id)}</span>` : ''}${have.has(k) ? '<span class="cm-added"><i class="bi bi-check-lg"></i></span>' : `<button type="button" class="cm-plus" data-add="${esc(k)}" aria-label="أضف"><i class="bi bi-plus-lg"></i></button>`}</div>`; }).join('')}</div>`;
        $('#cm-found').querySelectorAll('[data-add]').forEach(x => x.onclick = () => {
          store.set(MINE, [...new Set([...(store.get(MINE) || []), x.dataset.add])]);
          x.outerHTML = '<span class="cm-added"><i class="bi bi-check-lg"></i></span>'; keys.push(x.dataset.add);
          c.querySelector('[data-dt="mine"] small').textContent = keys.length; c.querySelector('.cm-h small').textContent = `${U.DAYS[d] || ''} · ${keys.length} شعبة`;
          day = dayList(keys.map(k => BY[k]), d); pins();
        });
      };
      const inp = $('#cm-add');
      inp.oninput = () => { find.q = inp.value; list(); };
      c.querySelectorAll('[data-by]').forEach(x => x.onclick = () => { find.by = x.dataset.by; c.querySelectorAll('[data-by]').forEach(y => y.classList.toggle('on', y === x)); list(); inp.focus(); });
      $('#cm-today').onchange = e => { find.today = e.target.checked; list(); };
      list();
    }
    pins();
  }

  // ---------------------------------------------------------------- shared: distances, floors, the path network, overlays
  const meters = (a, b) => Math.round(Math.hypot(a.x - b.x, (a.y - b.y) * C.height / C.width) * (C.meters_wide || 750) * 1.3 / 10) * 10;
  const walkMin = m => Math.max(1, Math.round(m / 80));
  // the floor from the room number: 7419 → 4, 06101 / A24222 → the third digit; null when the number does not say
  function floorOf(r) { const d = String(r || '').replace(/\D/g, ''); return d.length === 4 ? +d[1] : d.length === 5 ? +d[2] : null; }
  const floorName = f => f == null ? 'طابق غير محدد' : f === 0 ? 'الطابق الأرضي' : 'الطابق ' + f;
  let OV = { lines: [], marks: '' }, mark = new Set(), exday = null;
  const ptS = o => `${(o.x * C.width).toFixed(1)},${(o.y * C.height).toFixed(1)}`;
  const stepMarks = (list, cls) => { const seen = {}; return list.map((x, i) => { if (!x.b) return ''; const k = seen[x.b.id || x.b.name] = (seen[x.b.id || x.b.name] || 0) + 1; return `<span class="cm-step ${cls || ''}" style="left:${x.b.x * 100}%;top:${x.b.y * 100}%;--i:${k - 1}">${i + 1}</span>`; }).join(''); };
  // the proposed path network (data/campus.json «paths»): the shortest way along it, from a point to a point
  function pathTo(a, b) {
    const P2 = C.paths; if (!P2) return null;
    const nodes = P2.nodes, adj = {}, d = (p, q) => Math.hypot(p.x - q.x, (p.y - q.y) * C.height / C.width);
    P2.edges.forEach(([u, v]) => { (adj[u] = adj[u] || []).push(v); (adj[v] = adj[v] || []).push(u); });
    const near = o => Object.keys(nodes).sort((p, q) => d(nodes[p], o) - d(nodes[q], o))[0];
    const s = near(a), t = near(b), dist = { [s]: 0 }, prev = {}, todo = new Set(Object.keys(nodes));
    while (todo.size) {
      let u = null; todo.forEach(k => { if (dist[k] != null && (u == null || dist[k] < dist[u])) u = k; });
      if (u == null || u === t) break; todo.delete(u);
      (adj[u] || []).forEach(v => { const nd = dist[u] + d(nodes[u], nodes[v]); if (dist[v] == null || nd < dist[v]) { dist[v] = nd; prev[v] = u; } });
    }
    if (dist[t] == null) return null;
    const way = [t]; while (way[0] !== s) way.unshift(prev[way[0]]);
    const pts = [a, ...way.map(k => nodes[k]), b];
    let m = 0; for (let i = 1; i < pts.length; i++) m += d(pts[i - 1], pts[i]);
    return { pts, m: Math.round(m * (C.meters_wide || 750) / 10) * 10 };
  }
  const fromList = () => [...(here ? [['here', 'أنت هنا: ' + here.label, here]] : []), ...(C.gates || []).map(g => ['gate:' + g.id, g.name, g]), ...C.buildings.map(b => ['b:' + b.id, `${b.id} · ${b.name}`, b])];
  const fromSel = (id, cur, label) => { const F2 = fromList(), k = (F2.find(f => f[2] === cur) || F2[0])[0];
    return `<label class="cm-lbl" for="${id}">${label || 'من'}</label><select id="${id}" class="form-select form-select-sm">${F2.map(([k2, l]) => `<option value="${esc(k2)}" ${k2 === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; };
  const fromGet = v => (fromList().find(f => f[0] === v) || [])[2];
  const bSel = (id, cur, label, filter, blank) => `<label class="cm-lbl" for="${id}">${label}</label><select id="${id}" class="form-select form-select-sm">${blank ? `<option value="">${blank}</option>` : ''}${C.buildings.filter(filter || (() => true)).map(b => `<option value="${esc(b.id)}" ${b === cur ? 'selected' : ''}>${esc(b.id)} · ${esc(b.name)}</option>`).join('')}</select>`;
  const proposed = t => `<div class="cm-prop"><i class="bi bi-exclamation-diamond-fill"></i><span><b>مقترح غير معتمد رسمياً.</b> ${t}</span></div>`;
  const amDate = () => new Date().toLocaleDateString('ar-JO-u-nu-latn', { timeZone: 'Asia/Amman', year: 'numeric', month: 'long', day: 'numeric' });
  const refNo = code => `UOP-${code}-${U.amman().iso.replace(/-/g, '')}-${String(1000 + Math.floor(Math.random() * 9000))}`;

  // ---------------------------------------------------------------- formal documents: A4, the university's letterhead, a reference number, numbered sections, signatures
  // (the same look as the exams committee's documents). Opens as its own page to review, then «طباعة / حفظ PDF».
  function doc(o) {
    const css = `@page { size: A4 ${o.landscape ? 'landscape' : 'portrait'}; margin: 13mm 12mm 15mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { margin: 0; font-family: Tajawal, 'Segoe UI', Tahoma, sans-serif; color: #1c2b31; font-size: 10.5pt; direction: rtl; line-height: 1.55; background: #e9ecef; }
      .pg { background: #fff; max-width: ${o.landscape ? '297mm' : '210mm'}; margin: 0 auto; padding: 12mm 12mm 10mm; position: relative; min-height: 100vh; }
      .hd { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #901d23; padding-bottom: 8px; } .hd img { height: 54px; } .hd .t { flex: 1; } .hd small { color: #6b7a82; font-size: 8.5pt; display: block; }
      .hd h1 { margin: 2px 0 0; font-size: 16pt; color: #091b22; } .hd h2 { margin: 2px 0 0; font-size: 10.5pt; color: #901d23; font-weight: 700; }
      .ref { font-size: 8.5pt; color: #4a5a62; text-align: left; line-height: 1.6; } .ref b { color: #091b22; }
      .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0 4px; } .info div { border: 1px solid #e3dccb; border-top: 3px solid #091b22; border-radius: 7px; padding: 5px 8px; }
      .info span { display: block; font-size: 8pt; color: #6b7a82; } .info b { font-size: 12pt; color: #091b22; } .info .w2 { grid-column: span 2; } .info .w4 { grid-column: span 4; }
      h3 { font-size: 12pt; color: #901d23; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ecd5d7; break-after: avoid; }
      p { margin: 4px 0 6px; } ul, ol { margin: 4px 0 8px; padding-inline-start: 20px; } li { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; } thead { display: table-header-group; } th { background: #091b22; color: #fff; font-size: 8.8pt; padding: 5px; border: 1px solid #091b22; font-weight: 700; }
      td { border: 1px solid #d9dfe3; padding: 4px 6px; font-size: 9.2pt; } tbody tr:nth-child(even) td { background: #f7f9fa; } tr { break-inside: avoid; }
      td.c, th.c { text-align: center; } td.n { text-align: center; width: 28px; color: #6b7a82; } td.ltr { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; }
      td.h { text-align: center; font-weight: 700; color: #111; } td.blank { height: 26px; }
      .note { background: #f6f3ec; border: 1px solid #e3dccb; border-radius: 8px; padding: 6px 10px; font-size: 9pt; color: #4a5a62; margin: 6px 0; }
      .warn { background: #fdf2f2; border: 1px solid #f3c7ca; border-inline-start: 4px solid #901d23; border-radius: 6px; padding: 6px 10px; font-size: 9.5pt; color: #7a1a1f; margin: 8px 0; }
      .fig { border: 1px solid #d9dfe3; border-radius: 8px; padding: 6px; margin: 6px 0 8px; break-inside: avoid; } .fig svg { width: 100%; height: auto; display: block; } .fig small { display: block; text-align: center; color: #6b7a82; font-size: 8pt; margin-top: 3px; }
      .sig { display: grid; grid-template-columns: repeat(${(o.sign || []).length || 3}, 1fr); gap: 16px; margin-top: 22px; break-inside: avoid; } .sig div { border-top: 1px dashed #9aa6ac; padding-top: 5px; font-size: 9pt; color: #4a5a62; text-align: center; line-height: 1.9; } .sig b { color: #091b22; display: block; }
      .ft { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e3dccb; font-size: 7.5pt; color: #7a868c; display: flex; justify-content: space-between; gap: 10px; }
      .wm { position: fixed; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 10; } .wm span { transform: rotate(-28deg); font-size: 64pt; font-weight: 800; color: rgba(144,29,35,.07); white-space: nowrap; }
      .bar { position: sticky; top: 0; z-index: 5; background: #091b22; color: #fff; display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px; font-size: 10pt; }
      .bar button { font: inherit; font-weight: 700; border: 0; border-radius: 8px; padding: 6px 16px; cursor: pointer; background: #901d23; color: #fff; } .bar button.l { background: #fff; color: #091b22; }
      @media print { body { background: #fff; } .pg { padding: 0; max-width: none; min-height: 0; } .bar { display: none; } }`;
    const ref = o.ref || refNo(o.code || 'CM');
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)} · ${ref}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>${css}</style></head><body>
      <div class="bar"><span>معاينة المستند</span><button onclick="print()">طباعة / حفظ PDF</button><button class="l" onclick="close()">إغلاق</button></div>
      ${o.draft ? `<div class="wm"><span>${esc(o.draft)}</span></div>` : ''}
      <div class="pg"><div class="hd"><img src="${SITE}assets/logo-print.png" alt="جامعة البترا"><div class="t"><small>جامعة البترا · ${esc(o.unit || 'خريطة الحرم الجامعي')}</small><h1>${esc(o.title)}</h1>${o.sub ? `<h2>${esc(o.sub)}</h2>` : ''}</div>
        <div class="ref">الرقم: <b dir="ltr">${ref}</b><br>التاريخ: <b>${amDate()}</b>${o.status ? `<br>الحالة: <b>${esc(o.status)}</b>` : ''}</div></div>
      ${o.info ? `<div class="info">${o.info.map(([l, v, w]) => `<div class="${w || ''}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${o.draft && o.draftNote ? `<div class="warn">${o.draftNote}</div>` : ''}
      ${o.sections.map(([h, b], i) => `<h3>${i + 1}. ${esc(h)}</h3>${b}`).join('')}
      ${o.sign ? `<div class="sig">${o.sign.map(r => `<div><b>${esc(r)}</b>الاسم: ............................<br>التوقيع: .........................<br>التاريخ: ....../....../..........</div>`).join('')}</div>` : ''}
      <div class="ft"><span>${esc(o.source || 'أُعدّ آلياً من بيانات بوصلة البترا (الجدول الدراسي ودليل الموظفين ومخطط الحرم)')}</span><span dir="ltr">${ref}</span></div></div></body></html>`;
    const link = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const w = window.open(link, '_blank');
    if (w) { setTimeout(() => URL.revokeObjectURL(link), 120000); return; }
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 600);
  }
  const tbl = (heads, rows, cls) => `<table class="${cls || ''}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => Array.isArray(c) ? `<td class="${c[1]}">${c[0]}</td>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const pct = v => Math.round(v * 100) + '%';
  const heatTd = v => [`<span style="display:block;background:color-mix(in srgb, #dc2626 ${Math.round(v * 100)}%, #ecfdf3);margin:-4px -6px;padding:4px 0">${Math.round(v * 100)}</span>`, 'h'];
  // a picture of the plan for a document: the image with lines and numbered points over it
  const docMap = (lines, pts, cap) => `<div class="fig"><svg viewBox="0 0 ${C.width} ${C.height}"><image href="${SITE}${esc(C.image_2x || C.image)}" width="${C.width}" height="${C.height}"/>
    ${lines.map(l => `<polyline points="${l.pts.map(ptS).join(' ')}" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${l.pts.map(ptS).join(' ')}" fill="none" stroke="${l.c || '#1d4ed8'}" stroke-width="6" stroke-dasharray="${l.dash || '16 10'}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${pts.map(p => `<g transform="translate(${(p.x * C.width).toFixed(0)} ${(p.y * C.height).toFixed(0)})"><circle r="19" fill="${p.c || '#901d23'}" stroke="#fff" stroke-width="5"/><text y="7" text-anchor="middle" fill="#fff" font-size="${String(p.t).length > 2 ? 15 : 20}" font-weight="800" font-family="Tajawal, sans-serif">${esc(p.t)}</text></g>`).join('')}</svg>${cap ? `<small>${cap}</small>` : ''}</div>`;

  // ---------------------------------------------------------------- «المزيد»: the other tools, by who they are for
  const MORE = [
    ['للطلبة', [['tour', 'bi-flag', 'جولة الطلبة الجدد', 'محطات الحرم الأساسية بالترتيب، مع دليل للطباعة']]],
    ['السلامة والخدمات', [['emergency', 'bi-exclamation-octagon', 'الطوارئ ونقاط التجمع', 'أقرب نقطة تجمع وأرقام الطوارئ وخطة الإخلاء'],
      ['fix', 'bi-tools', 'بلاغ عطل', 'أبلغ عن عطل في قاعة أو مبنى ببلاغ رسمي مرقّم'], ['access', 'bi-universal-access', 'الوصول الميسّر', 'مسار مقترح والطوابق ومقترح رسمي للدراسة']]],
    ['للإدارة والتخطيط', [['week', 'bi-bar-chart-line', 'الإشغال وتقرير القاعات', 'نسب الإشغال والتوصيات وتقرير رسمي'], ['crowd', 'bi-people', 'توقّع الازدحام', 'الذروة في المباني والبوابات من أعداد المسجلين'],
      ['qr', 'bi-qr-code', 'ملصقات QR', '«أنت هنا» و«بلاغ عطل» لكل بوابة ومبنى']]]];
  const MOREK = MORE.flatMap(g => g[1].map(x => x[0]));
  function moreTool() {
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'المزيد', 'أدوات أخرى على الخريطة')}
      ${MORE.map(([g, list]) => `<h3>${esc(g)}</h3><div class="cm-more-g">${list.map(([k, i, t, d]) => `<button type="button" data-go="${k}"><i class="bi ${i}"></i><span><b>${esc(t)}</b><small>${esc(d)}</small></span><i class="bi bi-chevron-left"></i></button>`).join('')}</div>`).join('')}</div>`;
    bind(() => setTool(''));
  }

  // ---------------------------------------------------------------- «قاعة شاغرة»: the nearest free rooms, for as long as needed
  const FREE = { need: 60, ground: false, from: null };
  function freeTool(n) {
    if (!FREE.from) FREE.from = here || B(sel) || (C.gates || [])[0];
    const ok = teaching(n), END = 21 * 60, list = [];
    if (n.min < END) C.buildings.forEach(b => {
      if (!(b.tt || []).length) return;
      const st = status(b, n), m = meters(FREE.from, b);
      st.free.forEach(f => { if ((f.until || END) - n.min < FREE.need) return; if (FREE.ground && floorOf(f.r) !== 0) return; list.push({ b, r: f.r, until: f.until, m }); });
    });
    list.sort((x, y) => x.m - y.m || (y.until || 9999) - (x.until || 9999) || x.r.localeCompare(y.r, 'en', { numeric: true }));
    const top = list.slice(0, 15);
    mark = new Set(top.map(x => x.b.id));
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'أقرب قاعة شاغرة', `${esc(U.DAYS[n.day] || '')} ${esc(n.clock)} · حسب الجدول الدراسي`)}
      ${fromSel('cm-ffrom', FREE.from, 'أنا عند')}
      <label class="cm-lbl">أحتاجها لمدة</label><div class="cm-by">${[30, 60, 90, 120].map(v => `<button type="button" data-need="${v}" class="${FREE.need === v ? 'on' : ''}">${v < 60 ? v + ' دقيقة' : v === 60 ? 'ساعة' : v === 120 ? 'ساعتين' : 'ساعة ونصف'}</button>`).join('')}</div>
      <label class="cm-chk"><input type="checkbox" id="cm-ground" ${FREE.ground ? 'checked' : ''}> الطابق الأرضي فقط (أسهل وصولاً)</label>
      ${!ok ? '<div class="cm-note"><i class="bi bi-info-circle"></i> لا تدريس في هذا اليوم حسب التقويم؛ كل القاعات متاحة نظرياً، لكن تحقّق من فتح المباني.</div>' : ''}
      ${n.min >= END ? empty('انتهى الدوام. اختر وقتاً آخر من شريط الوقت.') : top.length ? `<div class="cm-res-h"><span>${list.length} قاعة متاحة ${FREE.need >= 60 ? 'لساعة أو أكثر' : 'لنصف ساعة أو أكثر'} · الأقرب أولاً</span></div>
        <div class="cm-found">${top.map((x, i) => `<button type="button" class="cm-frow" data-fr="${i}"><span class="cm-room" dir="ltr">${esc(x.r)}</span><span class="cm-t"><b>${esc(x.b.short || x.b.name)} <small>· ${esc(floorName(floorOf(x.r)))}</small></b>
          <small>${x.m < 20 ? 'في المبنى نفسه' : `${x.m} م · ${walkMin(x.m)} د مشياً`} · ${x.until ? `شاغرة حتى <bdi dir="ltr">${toTime(x.until)}</bdi>` : 'شاغرة بقية اليوم'}</small></span><span class="cm-no sm">${esc(x.b.id)}</span></button>`).join('')}</div>
        <p class="cm-note">اضغط القاعة لترى الطريق إليها. المباني المحاطة بحلقة خضراء على الخريطة فيها قاعات مناسبة.</p>` : empty('لا قاعة شاغرة بهذه المدة الآن. جرّب مدة أقصر.')}</div>`;
    bind(() => setTool(''));
    $('#cm-ffrom').onchange = e => { FREE.from = fromGet(e.target.value); card(); pins(); };
    $('#cm-card').querySelectorAll('[data-need]').forEach(x => x.onclick = () => { FREE.need = +x.dataset.need; card(); pins(); });
    $('#cm-ground').onchange = e => { FREE.ground = e.target.checked; card(); pins(); };
    $('#cm-card').querySelectorAll('[data-fr]').forEach(x => x.onclick = () => { const f = top[+x.dataset.fr]; route = { from: FREE.from, to: { b: f.b, room: f.r, label: 'قاعة ' + f.r } }; setTool('route'); center(f.b); });
    pins();
  }

  // ---------------------------------------------------------------- «امتحاني»: the student's exams from «امتحاناتي» (the same choice, kept on the phone), on the map
  function examTool(n) {
    const MY = Object.assign({ codes: [], sec: {} }, store.get('uop-myexams') || {});
    (P.get('c') || '').split(/[,\s]+/).filter(Boolean).forEach(c => { if (!MY.codes.includes(c)) MY.codes.push(c); });
    let body;
    exday = null;
    if (!EX) body = `${empty('لم يُنشر جدول الامتحانات بعد.')}<p class="cm-note">حين تنشره لجنة الامتحانات تظهر هنا امتحاناتك وقاعاتها والطريق إليها. اختر مقرراتك مسبقاً في «امتحاناتي».</p>`;
    else {
      const mine = EX.exams.filter(e => MY.codes.includes(e.code));
      const rooms = e => { const s = MY.sec[e.code], r = s ? e.rooms.filter(x => (x.secs || []).includes(s)) : []; return { list: r.length ? r : e.rooms, exact: !!r.length }; };
      const up = mine.filter(e => e.date > n.iso || (e.date === n.iso && toMin(e.to) > n.min)).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
      const d1 = up[0] && up[0].date, first = up.filter(e => e.date === d1), later = up.filter(e => e.date !== d1);
      const dayLabel = iso => { const k = Math.round((Date.parse(iso) - Date.parse(n.iso)) / 864e5); return k === 0 ? 'اليوم' : k === 1 ? 'غداً' : `بعد ${k} أيام · ${+iso.slice(8)}/${+iso.slice(5, 7)}`; };
      exday = first.map(e => ({ e, b: placeB(rooms(e).list[0].room) }));
      body = !mine.length ? `<p class="cm-note">لم تختر مقرراتك بعد. اخترها مرة واحدة في «امتحاناتي» وتظهر هنا تلقائياً.</p>`
        : !up.length ? empty('انتهت امتحاناتك المختارة.')
        : `<h3><i class="bi bi-calendar-check"></i> ${esc(dayLabel(d1))} <small>${first.length} امتحان</small></h3>
          ${first.map((e, i) => { const r = rooms(e), b = placeB(r.list[0].room), left = e.date === n.iso ? toMin(e.from) - n.min : null;
            return `<div class="cm-exam"><span class="cm-stepno">${i + 1}</span><div class="cm-t"><b>${esc(e.name)}</b><small dir="ltr" class="text-end">${esc(e.from)} – ${esc(e.to)}</small>
              <small>القاعة: ${r.list.map(x => `<b>${esc(x.room)}</b>`).join('، ')}${r.exact ? ' (حسب شعبتك)' : ' — اختر شعبتك في «امتحاناتي» لتعرف قاعتك بالضبط'}${b ? ' · ' + esc(b.name) : ''}</small>
              ${left != null ? `<small class="${left <= 60 ? 'cm-soon' : ''}">${left > 0 ? `يبدأ بعد ${U.mins(left)} — كن في القاعة قبل 15 دقيقة` : 'جارٍ الآن'}</small>` : ''}</div>
              ${b ? `<button type="button" class="btn btn-sm btn-maroon" data-exr="${i}"><i class="bi bi-signpost-split"></i> الطريق</button>` : ''}</div>`; }).join('')}
          ${later.length ? `<h3><i class="bi bi-calendar3"></i> بعد ذلك</h3>${later.slice(0, 8).map(e => row(`${+e.date.slice(8)}/${+e.date.slice(5, 7)}`, e.name, `${e.from} · ${rooms(e).list.map(x => x.room).join('، ')}`)).join('')}` : ''}`;
      setTimeout(() => $('#cm-card').querySelectorAll('[data-exr]').forEach(x => x.onclick = () => { const e = first[+x.dataset.exr], r = rooms(e).list[0]; route = { from: here || (C.gates || [])[0], to: { b: placeB(r.room), room: r.room, label: 'امتحان ' + e.name + ' · ' + r.room } }; setTool('route'); }), 0);
    }
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'امتحاني على الخريطة', 'من اختيارك في «امتحاناتي» على هذا الجهاز')}${body}
      <div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="myexams.html"><i class="bi bi-pencil"></i> اختر مقرراتي في «امتحاناتي»</a></div></div>`;
    bind(() => setTool(''));
    OV = { lines: exday && exday.filter(x => x.b).length > 1 ? [{ pts: exday.filter(x => x.b).map(x => x.b), cls: 'cm-dayline' }] : [], marks: exday ? stepMarks(exday) : '' };
    pins();
  }

  // ---------------------------------------------------------------- «توقّع الازدحام»: students in lectures through the day (from the sections' registered numbers)
  const CR = {};
  function crowd(d) {
    if (CR[d]) return CR[d];
    const T0 = 7 * 60, T1 = 21 * 60, ST = 15, slots = []; for (let t = T0; t < T1; t += ST) slots.push(t);
    const tot = slots.map(() => 0), starts = slots.map(() => 0), per = {};
    C.buildings.forEach(b => { if (!(b.tt || []).length) return; const arr = per[b.id] = slots.map(() => 0);
      meetings(b, d).forEach(x => { const r = +x.s.registered || 0; slots.forEach((t, i) => { if (x.a <= t && t < x.z) { arr[i] += r; tot[i] += r; } }); const si = Math.floor((x.a - T0) / ST); if (si >= 0 && si < slots.length) starts[si] += r; }); });
    return (CR[d] = { slots, tot, starts, per, ST, T0 });
  }
  const crowdNow = (b, n) => { const c = crowd(n.day), i = Math.floor((n.min - c.T0) / c.ST); return c.per[b.id] && i >= 0 && i < c.slots.length ? c.per[b.id][i] : 0; };
  const crowdColor = v => v >= 400 ? '#dc2626' : v >= 150 ? '#f59e0b' : '#16a34a';
  function crowdChart(c, n, W, H) {
    const max = Math.max(1, ...c.tot), x = i => 30 + i * (W - 40) / c.slots.length, y = v => H - 18 - v / max * (H - 30), bw = (W - 40) / c.slots.length;
    const area = `M${x(0)},${y(0)} ` + c.tot.map((v, i) => `L${x(i)},${y(v)}`).join(' ') + ` L${x(c.slots.length - 1)},${y(0)} Z`;
    const ni = Math.floor((n.min - c.T0) / c.ST);
    return `<svg viewBox="0 0 ${W} ${H}" class="cm-chart" role="img" aria-label="الطلبة في المحاضرات خلال اليوم">
      ${[0.5, 1].map(f => `<line x1="30" x2="${W - 10}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#e5e7eb"/><text x="26" y="${y(max * f) + 4}" font-size="9" text-anchor="end" fill="#6b7280">${Math.round(max * f)}</text>`).join('')}
      <path d="${area}" fill="#901d23" fill-opacity=".18" stroke="#901d23" stroke-width="1.5"/>
      ${c.starts.map((v, i) => v ? `<rect x="${x(i)}" y="${y(v)}" width="${Math.max(1, bw - 1)}" height="${y(0) - y(v)}" fill="#1d4ed8" fill-opacity=".75"/>` : '').join('')}
      ${c.slots.map((t, i) => t % 120 === 0 ? `<text x="${x(i)}" y="${H - 4}" font-size="9" text-anchor="middle" fill="#6b7280">${t / 60}</text>` : '').join('')}
      ${ni >= 0 && ni < c.slots.length ? `<line x1="${x(ni)}" x2="${x(ni)}" y1="8" y2="${y(0)}" stroke="#111" stroke-dasharray="3 3"/>` : ''}</svg>`;
  }
  function crowdFacts(n) {
    const c = crowd(n.day), pk = c.tot.indexOf(Math.max(...c.tot));
    const waves = c.starts.map((v, i) => ({ v, t: c.slots[i] })).filter(w => w.v).sort((a, b) => b.v - a.v).slice(0, 4).sort((a, b) => a.t - b.t);
    const calm = c.slots.map((t, i) => ({ t, v: c.tot[i] })).filter(s => s.t >= 9 * 60 && s.t <= 15 * 60).sort((a, b) => a.v - b.v)[0];
    const rows = C.buildings.filter(b => c.per[b.id]).map(b => { const a = c.per[b.id], m = Math.max(...a); return { b, m, t: c.slots[a.indexOf(m)], now: crowdNow(b, n) }; }).filter(r => r.m).sort((a, b) => b.m - a.m);
    return { c, pk, waves, calm, rows };
  }
  function crowdTool(n) {
    const f = crowdFacts(n), c = f.c;
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'توقّع الازدحام', `${esc(U.DAYS[n.day] || '')} · من أعداد الطلبة المسجلين في الشعب`)}
      ${!c.tot.some(Boolean) ? empty('لا محاضرات في هذا اليوم.') : `<div class="cm-kpis"><div><b dir="ltr">${toTime(c.slots[f.pk])}</b><span>ذروة الحرم</span></div><div><b>${c.tot[f.pk].toLocaleString('en')}</b><span>طالباً في القاعات</span></div>
        <div><b dir="ltr">${f.calm ? toTime(f.calm.t) : '—'}</b><span>أهدأ وقت (9–15)</span></div></div>
        ${crowdChart(c, n, 380, 130)}<div class="cm-key2"><span><i style="background:#901d23;opacity:.4"></i> في القاعات</span><span><i style="background:#1d4ed8"></i> يبدؤون محاضرة (موجات الوصول)</span><span><i class="ln"></i> الوقت المختار</span></div>
        <h3><i class="bi bi-door-open"></i> البوابات والمواقف</h3><p class="cm-note">يشتد الضغط قبل موجات الوصول الكبرى بـ15–30 دقيقة: ${f.waves.map(w => `<b dir="ltr">${toTime(w.t)}</b> (${w.v.toLocaleString('en')})`).join('، ')}.</p>
        <h3><i class="bi bi-buildings"></i> ذروة كل مبنى <small>الطلبة في قاعاته</small></h3>
        ${f.rows.slice(0, 12).map(r => `<button type="button" class="cm-near" data-b="${esc(r.b.id)}"><span class="cm-no sm" style="--c:${crowdColor(r.now)}">${esc(r.b.id)}</span><span><b>${esc(r.b.short || r.b.name)}</b><small>الذروة <bdi dir="ltr">${toTime(r.t)}</bdi>: ${r.m.toLocaleString('en')} طالباً · الآن ${r.now.toLocaleString('en')}</small></span></button>`).join('')}
        <p class="cm-note">على الخريطة: لون المبنى وعدده = الطلبة في قاعاته في الوقت المختار. تقدير: الطالب يُحسب في كل محاضرة مسجّل فيها، والحضور الفعلي قد يقل.</p>`}
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-doc"><i class="bi bi-file-earmark-text"></i> تقرير رسمي</button></div></div>`;
    bind(() => setTool(''));
    $('#cm-doc').onclick = () => crowdDoc(n);
    pins();
  }
  function crowdDoc(n) {
    const f = crowdFacts(n), c = f.c, total = c.starts.reduce((a, b) => a + b, 0);
    doc({ code: 'CR', title: 'تقرير توقّع الازدحام في الحرم الجامعي', sub: `يوم ${U.DAYS[n.day] || ''} · الفصل الدراسي الحالي`, unit: 'التخطيط والخدمات',
      info: [['ذروة الحرم', toTime(c.slots[f.pk])], ['الطلبة في القاعات عند الذروة', c.tot[f.pk].toLocaleString('en')], ['مقاعد المحاضرات في اليوم', total.toLocaleString('en')], ['أهدأ وقت (9:00–15:00)', f.calm ? toTime(f.calm.t) : '—']],
      sections: [
        ['الغرض', '<p>يقدّر هذا التقرير أعداد الطلبة الموجودين في القاعات التدريسية خلال يوم الدوام، وموجات الوصول إلى المحاضرات، لمساعدة الأمن الجامعي والحركة والخدمات في توزيع الموظفين وتنظيم البوابات والمواقف والممرات.</p>'],
        ['الطلبة في القاعات خلال اليوم', `<div class="fig">${crowdChart(c, { min: -1 }, 700, 220)}<small>المساحة: الطلبة في القاعات · الأعمدة: الطلبة الذين تبدأ محاضرتهم (كل 15 دقيقة) · المحور الأفقي: الساعة</small></div>`],
        ['موجات الوصول والضغط على البوابات والمواقف', tbl(['#', 'وقت بدء المحاضرات', 'الطلبة الذين تبدأ محاضرتهم', 'فترة الضغط المتوقعة على البوابات'], f.waves.map((w, i) => [[i + 1, 'n'], [toTime(w.t), 'ltr'], [w.v.toLocaleString('en'), 'c'], [`${toTime(w.t - 30)} – ${toTime(w.t)}`, 'ltr']]))],
        ['الذروة في كل مبنى', tbl(['المبنى', 'الاسم', 'وقت الذروة', 'الطلبة عند الذروة', 'مستوى الازدحام'], f.rows.map(r => [[r.b.id, 'c'], r.b.name, [toTime(r.t), 'ltr'], [r.m.toLocaleString('en'), 'c'], [r.m >= 400 ? 'مرتفع' : r.m >= 150 ? 'متوسط' : 'منخفض', 'c']]))],
        ['التوصيات', `<ol>${[`تعزيز وجود الأمن الجامعي والحركة عند البوابات والمواقف في الفترات: ${f.waves.slice(0, 3).map(w => toTime(w.t - 30) + '–' + toTime(w.t)).join('، ')}.`,
          f.rows[0] ? `متابعة الممرات والدرج والمصاعد في ${f.rows.slice(0, 3).map(r => r.b.name).join('، ')} حول أوقات ذروتها.` : '',
          f.calm ? `جدولة أعمال الصيانة والتنظيف والفعاليات في الأوقات الأهدأ، مثل ${toTime(f.calm.t)}.` : '',
          'توزيع بعض الشعب الكبيرة على أوقات بدء مختلفة لتخفيف موجات الوصول، بالتنسيق مع الكليات ودائرة القبول والتسجيل.'].filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ol>`],
        ['المنهجية والقيود', '<p>الأرقام محسوبة من الجدول الدراسي: لكل محاضرة وجاهية عدد الطلبة المسجلين في شعبتها، ويُحسب الطالب في كل محاضرة مسجّل فيها. لا تشمل الموظفين والزوار، والحضور الفعلي قد يقل عن التسجيل. الفترات كل 15 دقيقة.</p>']],
      sign: ['أعدّه', 'الأمن الجامعي', 'اعتمده'] });
  }

  // ---------------------------------------------------------------- «جولة الطلبة الجدد»
  const TOUR = { i: 0, fac: P.get('fac') || '', from: null };
  const tourStops = () => (C.tour || []).map(s => { if (s.b === '@faculty') { const b = B(TOUR.fac); return b ? Object.assign({}, s, { b, title: b.name }) : null; } return B(s.b) ? Object.assign({}, s, { b: B(s.b) }) : null; }).filter(Boolean);
  function tourTool() {
    if (!TOUR.from) TOUR.from = here || (C.gates || [])[1] || (C.gates || [])[0];
    const st = tourStops(), i = Math.min(TOUR.i, st.length - 1), s = st[i];
    const people = s ? STAFF.filter(m => staffB(m) === s.b && lead(m) < 20).sort((x, y) => lead(x) - lead(y)).slice(0, 4) : [];
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'جولة الطلبة الجدد', `${st.length} محطات · ابدأ من البوابة أو من «أنت هنا»`)}
      <div class="cm-two">${fromSel('cm-tfrom', TOUR.from, 'البداية')}<div>${bSel('cm-tfac', B(TOUR.fac), 'كليتك', b => b.kind === 'faculty', '— اختر كليتك —')}</div></div>
      ${s ? `<div class="cm-stop"><div class="cm-stop-h"><span class="cm-stepno">${i + 1}</span><div><small>المحطة ${i + 1} من ${st.length}</small><h3>${esc(s.title)}</h3><small>مبنى ${esc(s.b.id)}${s.b.name !== s.title ? ' · ' + esc(s.b.name) : ''}</small></div></div>
        <p>${esc(s.text)}</p>${people.length ? `<div class="cm-lead">${people.map(m => `<button type="button" data-p="${esc(m.id)}" title="${esc(m.name)}">${face(m)}<small>${esc(m.role)}</small></button>`).join('')}</div>` : ''}
        <div class="cm-stop-nav"><button type="button" class="btn btn-sm btn-outline-secondary" data-ti="${i - 1}" ${i ? '' : 'disabled'}><i class="bi bi-arrow-right"></i> السابقة</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-center="${esc(s.b.id)}"><i class="bi bi-geo"></i> على الخريطة</button>
          <button type="button" class="btn btn-sm btn-maroon" data-ti="${i + 1}" ${i < st.length - 1 ? '' : 'disabled'}>التالية <i class="bi bi-arrow-left"></i></button></div></div>` : ''}
      <h3>كل المحطات</h3><div class="cm-list">${st.map((x, k) => `<button type="button" data-ti="${k}" class="${k === i ? 'on' : ''}"><span class="cm-stepno sm">${k + 1}</span><span>${esc(x.title)}</span><small>${k ? meters(st[k - 1].b, x.b) + ' م' : ''}</small></button>`).join('')}</div>
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-doc"><i class="bi bi-file-earmark-text"></i> دليل الجولة للطباعة</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + 'campus.html?tool=tour' + (TOUR.fac ? '&fac=' + encodeURIComponent(TOUR.fac) : ''))}"><i class="bi bi-link-45deg"></i> رابط الجولة</button></div></div>`;
    bind(() => setTool(''));
    $('#cm-tfrom').onchange = e => { TOUR.from = fromGet(e.target.value); tourTool(); };
    $('#cm-tfac').onchange = e => { TOUR.fac = e.target.value; url('fac', TOUR.fac); tourTool(); };
    $('#cm-card').querySelectorAll('[data-ti]').forEach(x => x.onclick = () => { TOUR.i = +x.dataset.ti; tourTool(); const t = tourStops()[TOUR.i]; if (t) center(t.b); });
    $('#cm-doc').onclick = tourDoc;
    OV = { lines: [{ pts: [TOUR.from, ...st.map(x => x.b)], cls: 'cm-dayline' }], marks: stepMarks(st.map(x => ({ b: x.b }))) };
    sel = s ? s.b.id : ''; pins(); sel = '';
  }
  function tourDoc() {
    const st = tourStops(); let m = 0;
    const rows = st.map((s, k) => { const d = k ? meters(st[k - 1].b, s.b) : meters(TOUR.from, s.b); m += d; return [[k + 1, 'n'], `<b>${esc(s.title)}</b>`, [s.b.id, 'c'], esc(s.text), [d + ' م', 'c']]; });
    doc({ code: 'TR', title: 'دليل جولة الطلبة الجدد في الحرم الجامعي', sub: 'محطات الحرم الأساسية بالترتيب', unit: 'عمادة شؤون الطلبة',
      info: [['عدد المحطات', String(st.length)], ['طول الجولة تقريباً', m + ' متر'], ['مدة المشي تقريباً', walkMin(m) + ' دقيقة'], ['البداية', TOUR.from.name || TOUR.from.label || 'البوابة']],
      sections: [['المسار على مخطط الحرم', docMap([{ pts: [TOUR.from, ...st.map(x => x.b)], c: '#901d23' }], st.map((s, k) => ({ x: s.b.x, y: s.b.y, t: k + 1 })), 'الأرقام: ترتيب المحطات · الخط: اتجاه الجولة (المسافات تقديرية)')],
        ['المحطات', tbl(['#', 'المحطة', 'المبنى', 'ماذا تجد هنا', 'من المحطة السابقة'], rows)],
        ['معلومات مفيدة', `<ul><li>خريطة الحرم الحيّة: ${esc(SITE)}campus.html — تبيّن القاعات الشاغرة والطريق إلى أي قاعة أو مكتب.</li><li>جدولك الدراسي: «مخطط جدولي»، وامتحاناتك: «امتحاناتي» على الموقع نفسه.</li><li>في الطوارئ: اتصل بالأمن الجامعي أو 911، وتوجّه إلى أقرب نقطة تجمع.</li></ul>`]],
      source: 'أُعدّ من مخطط الحرم ودليل الموظفين في بوصلة البترا' });
  }

  // ---------------------------------------------------------------- «الطوارئ ونقاط التجمع» (proposed until the university approves them)
  const EMG = { from: null };
  const SAFE = () => C.safety || { assembly: [], contacts: [] };
  const apNear = o => SAFE().assembly.map(a => ({ a, m: meters(o, a) })).sort((x, y) => x.m - y.m);
  function contacts() {
    return SAFE().contacts.map(c => {
      if (c.tel) return { name: c.name, tel: c.tel };
      const ms = STAFF.filter(m => clean(m.office) === c.office && m.ext && (!c.job || (m.job || '').includes(c.job))).sort((x, y) => lead(x) - lead(y));
      return { name: c.name, ext: [...new Set(ms.map(m => m.ext))].slice(0, 2).join(' / ') };
    }).filter(c => c.tel || c.ext);
  }
  const STEPS = ['حافظ على هدوئك وأوقف ما تفعله فوراً عند سماع الإنذار أو طلب الإخلاء.', 'غادر من أقرب مخرج آمن، واستعمل الدرج لا المصعد.', 'ساعد من يحتاج المساعدة، خاصة ذوي الإعاقة، وأبلغ المسؤولين عن أي شخص بقي في الداخل.',
    'توجّه إلى نقطة التجمع وابقَ فيها، ولا تعد إلى المبنى حتى يأذن الأمن الجامعي أو الدفاع المدني.', 'اتصل بالأمن الجامعي أو 911 وأعطِ مكانك بدقة (رقم المبنى والطابق والقاعة).'];
  function emergencyTool() {
    if (!EMG.from) EMG.from = here || B(sel) || C.buildings[0];
    const S2 = SAFE(), near = apNear(EMG.from), a = near[0], alt = near[1], cs = contacts();
    $('#cm-card').innerHTML = `<div class="cm-card cm-emg">${head('', '', 'الطوارئ ونقاط التجمع', 'في الخطر المباشر اتصل فوراً، ثم توجّه إلى نقطة التجمع')}
      <div class="cm-calls">${cs.map(c => c.tel ? `<a href="tel:${esc(c.tel)}" class="sos"><i class="bi bi-telephone-fill"></i><span><b dir="ltr">${esc(c.tel)}</b><small>${esc(c.name)}</small></span></a>`
        : `<div><i class="bi bi-telephone"></i><span><b dir="ltr">${esc(c.ext)}</b><small>${esc(c.name)} · فرعي</small></span></div>`).join('')}</div>
      ${fromSel('cm-efrom', EMG.from, 'أنا في')}
      ${a ? `<div class="cm-ap-box"><i class="bi bi-people-fill"></i><div><small>أقرب نقطة تجمع</small><b>${esc(a.a.id)} · ${esc(a.a.name)}</b><small>حوالي ${a.m} م · ${walkMin(a.m)} د مشياً${alt ? ` · البديلة: ${esc(alt.a.id)} (${alt.m} م)` : ''}</small></div></div>` : ''}
      ${S2.status !== 'official' ? proposed(esc(S2.note || 'نقاط التجمع تحتاج اعتماد الأمن الجامعي.') + ' اتبع دائماً تعليمات الأمن الجامعي والدفاع المدني ولوحات الإخلاء في المبنى.') : ''}
      <h3><i class="bi bi-list-ol"></i> عند الإخلاء</h3><ol class="cm-ol">${STEPS.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-doc"><i class="bi bi-file-earmark-text"></i> خطة الإخلاء (مستند رسمي)</button></div></div>`;
    bind(() => setTool(''));
    $('#cm-efrom').onchange = e => { EMG.from = fromGet(e.target.value); emergencyTool(); if (apNear(EMG.from)[0]) center(apNear(EMG.from)[0].a); };
    $('#cm-doc').onclick = emergencyDoc;
    OV = { lines: a ? [{ pts: [EMG.from, a.a], cls: 'cm-evac' }] : [], marks: '' };
    pins();
  }
  function emergencyDoc() {
    const S2 = SAFE(), cs = contacts(), off = S2.status !== 'official';
    doc({ code: 'EV', title: 'خطة الإخلاء ونقاط التجمع في الحرم الجامعي', sub: off ? 'مسودة مقترحة للدراسة والاعتماد' : 'معتمدة', unit: 'الأمن الجامعي والسلامة العامة', status: off ? 'مقترح غير معتمد' : 'معتمد',
      draft: off ? 'مقترح — غير معتمد' : '', draftNote: off ? 'هذه مسودة مقترحة: نقاط التجمع اختيرت من الساحات والمواقف المفتوحة الظاهرة على مخطط الحرم، ولم تُعتمد بعد. لا تُستعمل للإخلاء الفعلي قبل الكشف الميداني واعتمادها من الأمن الجامعي والسلامة العامة.' : '',
      info: [['نقاط التجمع', String(S2.assembly.length)], ['المباني المشمولة', String(C.buildings.length)], ['الطوارئ العامة', '911'], ['الأمن الجامعي', (cs.find(c => /الأمن/.test(c.name)) || {}).ext || '—']],
      sections: [
        ['نقاط التجمع على المخطط', docMap([], S2.assembly.map(a => ({ x: a.x, y: a.y, t: a.id, c: '#15803d' })), 'المربعات الخضراء: نقاط التجمع ' + (off ? 'المقترحة' : 'المعتمدة'))
          + tbl(['الرقم', 'نقطة التجمع', 'المباني الأقرب إليها'], S2.assembly.map(a => [[a.id, 'c'], a.name, C.buildings.filter(b => apNear(b)[0].a === a).map(b => b.id).join('، ') || '—']))],
        ['توزيع المباني على نقاط التجمع', tbl(['المبنى', 'الاسم', 'نقطة التجمع', 'المسافة', 'البديلة'], C.buildings.map(b => { const nn = apNear(b); return [[b.id, 'c'], b.name, [nn[0].a.id, 'c'], [nn[0].m + ' م', 'c'], [nn[1] ? nn[1].a.id + ' (' + nn[1].m + ' م)' : '—', 'c']]; }))],
        ['أرقام الطوارئ', tbl(['الجهة', 'الرقم'], cs.map(c => [c.name, [c.tel || ('فرعي ' + c.ext), 'ltr']]))],
        ['تعليمات الإخلاء العامة', `<ol>${STEPS.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`],
        ...(off ? [['متطلبات الاعتماد', `<ol>${['كشف ميداني لكل نقطة تجمع: المساحة، البعد الآمن عن المباني، خلوّها من العوائق وحركة السيارات.', 'تحديد مخارج الطوارئ ومسارات الإخلاء داخل كل مبنى وتركيب لوحاتها.',
          'تسمية مسؤول إخلاء لكل مبنى وطابق، وتحديد طريقة إخلاء ذوي الإعاقة من الطوابق العليا.', 'تحديد أماكن أجهزة الإطفاء وصناديق الإسعاف الأولي وأجهزة الصدمات الكهربائية (AED) وإضافتها إلى الخريطة.',
          'إجراء تمرين إخلاء وتوثيق نتائجه، ثم تعديل هذه الخطة واعتمادها.', 'بعد الاعتماد: تغيير حالة نقاط التجمع في بيانات الخريطة إلى «معتمدة» فتختفي عبارة «مقترح».'].map(t => `<li>${esc(t)}</li>`).join('')}</ol>`]] : [])],
      sign: ['أعدّه', 'رئيس قسم الأمن الجامعي', 'اعتمده'] });
  }

  // ---------------------------------------------------------------- «بلاغ عطل»: a numbered, formal report to the unit that handles it (from the QR sticker: ?tool=fix&here=b:7)
  const FIX = { b: null, cat: '', urg: 'عادي', room: P.get('room') || '', text: '', name: '', contact: '', out: null };
  function fixTo(cat) {
    const F2 = C.fix || {}, c = (F2.categories || []).find(x => x.id === cat) || {};
    if (c.email) return { email: c.email, unit: c.name };
    if (c.to) { const ms = STAFF.filter(m => m.email && (clean(m.office) === c.to || (c.to === 'الأمن' && /الأمن/.test(m.job || '')))).sort((x, y) => lead(x) - lead(y));
      if (ms[0]) return { email: ms[0].email, unit: c.to === 'الأمن' ? 'الأمن الجامعي' : c.to, ext: ms[0].ext }; }
    return F2.email ? { email: F2.email, unit: 'الخدمات والصيانة' } : { email: '', unit: 'الخدمات والصيانة' };
  }
  function fixTool() {
    const F2 = C.fix || { categories: [] };
    if (!FIX.b) FIX.b = (here && C.buildings.find(b => b.x === here.x && b.y === here.y)) || B(sel) || null;
    if (FIX.out) return fixDone();
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'بلاغ عطل', 'يصل إلى الجهة المختصة ببلاغ رسمي مرقّم')}
      <form id="cm-fix" class="cm-form">
        ${bSel('cm-fb', FIX.b, 'المبنى', null, '— اختر المبنى —')}
        <label class="cm-lbl" for="cm-froom">القاعة أو المكان</label><input id="cm-froom" class="form-control form-control-sm" maxlength="60" placeholder="مثل 7101، أو الممر في الطابق الثاني" value="${esc(FIX.room)}">
        <label class="cm-lbl">نوع العطل</label><div class="cm-cats">${(F2.categories || []).map(c => `<label class="${FIX.cat === c.id ? 'on' : ''}"><input type="radio" name="cat" value="${esc(c.id)}" ${FIX.cat === c.id ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
        <label class="cm-lbl">الأولوية</label><div class="cm-by">${['عادي', 'عاجل', 'خطر على السلامة'].map(u => `<button type="button" data-urg="${u}" class="${FIX.urg === u ? 'on' : ''} ${u === 'خطر على السلامة' ? 'danger' : ''}">${u}</button>`).join('')}</div>
        ${FIX.urg === 'خطر على السلامة' ? `<div class="cm-prop danger"><i class="bi bi-exclamation-octagon-fill"></i><span><b>إن كان الخطر مباشراً فاتصل الآن:</b> ${contacts().map(c => `${esc(c.name)} <b dir="ltr">${esc(c.tel || c.ext)}</b>`).join(' · ')}</span></div>` : ''}
        <label class="cm-lbl" for="cm-ftext">وصف العطل</label><textarea id="cm-ftext" class="form-control form-control-sm" rows="3" maxlength="600" placeholder="ماذا حدث؟ منذ متى؟ هل يمنع استعمال القاعة؟">${esc(FIX.text)}</textarea>
        <div class="cm-two"><div><label class="cm-lbl" for="cm-fname">اسمك (اختياري)</label><input id="cm-fname" class="form-control form-control-sm" maxlength="60" value="${esc(FIX.name)}"></div>
          <div><label class="cm-lbl" for="cm-fcon">هاتف أو بريد للتواصل (اختياري)</label><input id="cm-fcon" class="form-control form-control-sm" maxlength="60" dir="ltr" value="${esc(FIX.contact)}"></div></div>
        <div id="cm-ferr"></div><button class="btn btn-maroon mt-2 w-100"><i class="bi bi-file-earmark-check"></i> أنشئ البلاغ</button></form></div>`;
    bind(() => setTool(''));
    const f = $('#cm-fix'), keep = () => { FIX.b = B($('#cm-fb').value); FIX.room = $('#cm-froom').value.trim(); FIX.text = $('#cm-ftext').value.trim(); FIX.name = $('#cm-fname').value.trim(); FIX.contact = $('#cm-fcon').value.trim(); const c = f.querySelector('[name=cat]:checked'); FIX.cat = c ? c.value : ''; };
    f.querySelectorAll('[data-urg]').forEach(x => x.onclick = () => { keep(); FIX.urg = x.dataset.urg; fixTool(); });
    f.onchange = e => { if (e.target.name === 'cat') f.querySelectorAll('.cm-cats label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); if (e.target.id === 'cm-fb' && B(e.target.value)) center(B(e.target.value)); };
    f.onsubmit = e => { e.preventDefault(); keep();
      const bad = !FIX.b ? 'اختر المبنى' : !FIX.cat ? 'اختر نوع العطل' : FIX.text.length < 8 ? 'صف العطل بجملة على الأقل' : '';
      if (bad) { $('#cm-ferr').innerHTML = `<div class="cm-none">${bad}</div>`; return; }
      FIX.out = { ref: refNo('FX'), at: new Date(), to: fixTo(FIX.cat), catName: (F2.categories.find(c => c.id === FIX.cat) || {}).name }; fixTool(); };
    if (FIX.b) { mark = new Set([FIX.b.id]); pins(); }
  }
  function fixText() {
    const o = FIX.out, t = o.at.toLocaleString('ar-JO-u-nu-latn', { timeZone: 'Asia/Amman', dateStyle: 'long', timeStyle: 'short' });
    return [`بلاغ عطل رقم ${o.ref}`, `التاريخ والوقت: ${t}`, `المبنى: ${FIX.b.id} · ${FIX.b.name}`, `القاعة أو المكان: ${FIX.room || 'غير محدد'}`, `نوع العطل: ${o.catName}`, `الأولوية: ${FIX.urg}`, '', `الوصف: ${FIX.text}`, '',
      `المبلّغ: ${FIX.name || 'لم يذكر اسمه'}${FIX.contact ? ' · ' + FIX.contact : ''}`, `أُنشئ من خريطة الحرم: ${SITE}campus.html?b=${encodeURIComponent(FIX.b.id)}`].join('\n');
  }
  function fixDone() {
    const o = FIX.out, mail = `mailto:${encodeURIComponent(o.to.email)}?subject=${encodeURIComponent(`بلاغ عطل ${o.ref} · مبنى ${FIX.b.id}${FIX.room ? ' · ' + FIX.room : ''} · ${FIX.urg}`)}&body=${encodeURIComponent(fixText())}`;
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'البلاغ جاهز', 'خطوة أخيرة: أرسله')}
      <div class="cm-ticket"><div><small>رقم البلاغ</small><b dir="ltr">${esc(o.ref)}</b></div><div><small>إلى</small><b>${esc(o.to.unit)}</b></div>
        <div><small>المكان</small><b>${esc(FIX.b.id)} · ${esc(FIX.room || FIX.b.short || FIX.b.name)}</b></div><div><small>النوع والأولوية</small><b>${esc(o.catName)} · ${esc(FIX.urg)}</b></div></div>
      ${o.to.email ? '' : `<div class="cm-prop"><i class="bi bi-info-circle-fill"></i><span>لم يُحدَّد بعد بريد جهة الصيانة لهذا النوع في بيانات الخريطة؛ اكتب عنوان المستلم في بريدك، أو اطبع البلاغ وسلّمه.</span></div>`}
      <div class="cm-links cm-col"><a class="btn btn-maroon" href="${esc(mail)}"><i class="bi bi-envelope"></i> أرسل بالبريد${o.to.email ? ' إلى ' + esc(o.to.unit) : ''}</a>
        <button type="button" class="btn btn-outline-secondary" id="cm-fdoc"><i class="bi bi-file-earmark-text"></i> نموذج البلاغ الرسمي (طباعة / PDF)</button>
        <button type="button" class="btn btn-outline-secondary" data-copy="${esc(fixText())}"><i class="bi bi-clipboard"></i> نسخ نص البلاغ</button>
        <button type="button" class="btn btn-link" id="cm-fnew">بلاغ جديد</button></div></div>`;
    bind(() => { FIX.out = null; setTool(''); });
    $('#cm-fnew').onclick = () => { Object.assign(FIX, { out: null, text: '', room: '', cat: '' }); fixTool(); };
    $('#cm-fdoc').onclick = () => doc({ ref: o.ref, title: 'نموذج بلاغ عطل', sub: `${FIX.b.name} · ${o.catName}`, unit: o.to.unit, status: 'جديد',
      info: [['المبنى', FIX.b.id + ' · ' + (FIX.b.short || FIX.b.name), 'w2'], ['القاعة أو المكان', FIX.room || 'غير محدد'], ['الأولوية', FIX.urg], ['نوع العطل', o.catName, 'w2'], ['الجهة المختصة', o.to.unit, 'w2']],
      sections: [['وصف العطل', `<p style="white-space:pre-line">${esc(FIX.text)}</p>`], ['بيانات المبلّغ', tbl(['الاسم', 'التواصل', 'وقت البلاغ'], [[esc(FIX.name || 'لم يذكر'), [esc(FIX.contact || '—'), 'ltr'], o.at.toLocaleString('ar-JO-u-nu-latn', { timeZone: 'Asia/Amman', dateStyle: 'medium', timeStyle: 'short' })]])],
        ['للاستعمال الرسمي (الجهة المختصة)', tbl(['تاريخ الاستلام', 'المكلَّف بالإصلاح', 'الإجراء المتخذ', 'تاريخ الإنجاز', 'الحالة'], [[['', 'blank'], '', '', '', '']])]],
      sign: ['المستلم', 'الفني المنفّذ', 'رئيس القسم المختص'], source: 'أُنشئ من «بلاغ عطل» في خريطة الحرم · بوصلة البترا' });
  }

  // ---------------------------------------------------------------- «الوصول الميسّر»: floors from the room numbers, a proposed path (not official), and a formal proposal to study
  const ACC = { to: null, from: null };
  function upper(b) { const rs = roomsOf(b), fl = rs.map(floorOf).filter(f => f != null), hours = {}; DAYS5().forEach(d => meetings(b, d).forEach(x => { const f = floorOf(x.room); if (f) hours.up = (hours.up || 0) + (x.z - x.a) / 60; }));
    return { floors: fl.length ? Math.max(...fl) + 1 : null, up: rs.filter(r => floorOf(r) > 0).length, ground: rs.filter(r => floorOf(r) === 0).length, upHours: Math.round(hours.up || 0) }; }
  const DAYS5 = () => Object.keys(U.DAYS).filter(k => k !== 'ج');
  function accessTool() {
    if (!ACC.to) ACC.to = B(sel) || C.buildings.find(b => (b.tt || []).length);
    if (!ACC.from) ACC.from = here || (C.gates || [])[0];
    const p = pathTo(ACC.from, ACC.to), u = upper(ACC.to);
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'الوصول الميسّر', 'لذوي الإعاقة وكبار السن ومن يحمل أمتعة')}
      ${proposed('لا توجد لدينا بيانات رسمية عن المداخل الميسّرة والمنحدرات والمصاعد. المسار البنفسجي مقترح تقريبي على طرق المخطط الظاهرة؛ تحقّق منه قبل الاعتماد عليه.')}
      <div class="cm-two">${fromSel('cm-afrom', ACC.from)}<div>${bSel('cm-ato', ACC.to, 'إلى')}</div></div>
      ${p ? `<div class="cm-facts mt-2"><div><i class="bi bi-signpost-2"></i><span><small>المسار المقترح</small><b>حوالي ${p.m} م · ${Math.max(1, Math.round(p.m / 50))} دقيقة بالكرسي المتحرك</b><em>على الطرق الداخلية بدل الاختصار عبر الحدائق والدرج</em></span></div></div>` : ''}
      <h3><i class="bi bi-building"></i> ${esc(ACC.to.name)}</h3>
      <div class="cm-facts">${[['bi-layers', 'الطوابق (من أرقام القاعات)', u.floors ? `${u.floors} · ${u.ground} قاعة أرضية و${u.up} في الطوابق العليا` : 'غير معروفة'],
        ['bi-door-open', 'المدخل الميسّر', 'غير موثّق'], ['bi-arrow-down-up', 'المصعد', 'غير موثّق'], ['bi-badge-wc', 'دورة مياه ميسّرة', 'غير موثّقة']].map(([i, t, v]) => `<div><i class="bi ${i}"></i><span><small>${t}</small><b>${esc(v)}</b></span></div>`).join('')}</div>
      <p class="cm-note">لطالب لا يستطيع صعود الدرج: «قاعة شاغرة» مع «الطابق الأرضي فقط» تعرض القاعات الأرضية، ويمكن للقسم نقل الشعبة إليها.</p>
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-doc"><i class="bi bi-file-earmark-text"></i> مقترح رسمي للدراسة</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-go="free"><i class="bi bi-door-open"></i> قاعة أرضية شاغرة</button></div></div>`;
    bind(() => setTool(''));
    $('#cm-afrom').onchange = e => { ACC.from = fromGet(e.target.value); accessTool(); };
    $('#cm-ato').onchange = e => { ACC.to = B(e.target.value); accessTool(); center(ACC.to); };
    $('#cm-card').querySelector('[data-go="free"]').onclick = () => { FREE.ground = true; FREE.from = ACC.to; setTool('free'); };
    $('#cm-doc').onclick = accessDoc;
    const net = C.paths ? C.paths.edges.map(([a, b]) => ({ pts: [C.paths.nodes[a], C.paths.nodes[b]], cls: 'cm-net', nocase: true })) : [];
    OV = { lines: [...net, ...(p ? [{ pts: p.pts, cls: 'cm-access' }] : [])], marks: '' };
    mark = new Set([ACC.to.id]); pins();
  }
  function accessDoc() {
    const gates = C.gates || [], list = C.buildings.map(b => { const u = upper(b), best = gates.map(g => ({ g, p: pathTo(g, b) })).filter(x => x.p).sort((x, y) => x.p.m - y.p.m)[0]; return { b, u, best }; });
    const pr = list.filter(x => x.u.upHours).sort((a, b) => b.u.upHours - a.u.upHours);
    doc({ code: 'AC', title: 'مقترح دراسة الوصول الميسّر في الحرم الجامعي', sub: 'مسودة للدراسة: أولويات الكشف الميداني ومسارات مقترحة', unit: 'التخطيط والخدمات الهندسية', status: 'مقترح غير معتمد',
      draft: 'مقترح — غير معتمد', draftNote: 'لا تتوفر بيانات رسمية عن المداخل الميسّرة والمنحدرات والمصاعد ودورات المياه الميسّرة. المسارات والأرقام هنا تقديرية من مخطط الحرم وأرقام القاعات، للدراسة والكشف الميداني فقط.',
      info: [['المباني', String(C.buildings.length)], ['قاعات في طوابق عليا', String(list.reduce((a, x) => a + x.u.up, 0))], ['ساعات تدريس أسبوعية في طوابق عليا', String(list.reduce((a, x) => a + x.u.upHours, 0)), 'w2']],
      sections: [
        ['الغرض', '<p>تحديد ما يلزم ليتمكن الطلبة والموظفون والزوار من ذوي الإعاقة من الوصول إلى القاعات والخدمات، وترتيب أولويات الكشف الميداني حسب حجم التدريس في الطوابق العليا.</p>'],
        ['المسارات المقترحة على المخطط', docMap(C.paths ? C.paths.edges.map(([a, b]) => ({ pts: [C.paths.nodes[a], C.paths.nodes[b]], c: '#7c3aed', dash: '1 0' })) : [], (C.gates || []).map(g => ({ x: g.x, y: g.y, t: 'B' + g.id, c: '#1e3a8a' })), 'الخطوط البنفسجية: طرق داخلية مقترحة للمسارات الميسّرة (تقديرية) · B: البوابات')],
        ['أولويات الكشف الميداني', tbl(['#', 'المبنى', 'الطوابق', 'قاعات عليا', 'ساعات تدريس أسبوعية في الطوابق العليا', 'أقرب بوابة بالمسار المقترح'], pr.map((x, i) => [[i + 1, 'n'], `${x.b.id} · ${esc(x.b.name)}`, [x.u.floors || '—', 'c'], [x.u.up, 'c'], [x.u.upHours, 'c'], x.best ? `${esc(x.best.g.name)} (${x.best.p.m} م)` : '—']))],
        ['نموذج الكشف الميداني', tbl(['المبنى', 'مدخل ميسّر', 'منحدر', 'مصعد يعمل', 'دورة مياه ميسّرة', 'مواقف مخصصة قريبة', 'ملاحظات'], C.buildings.map(b => [`${b.id} · ${esc(b.short || b.name)}`, ['', 'blank'], '', '', '', '', '']))],
        ['التوصيات', `<ol>${['إجراء الكشف الميداني بالنموذج أعلاه، بدءاً بالمباني الأعلى في جدول الأولويات.', 'إضافة نتائج الكشف إلى بيانات الخريطة فتظهر للجميع، وتحويل المسارات المؤكدة إلى «معتمدة».',
          'تخصيص مواقف قريبة من البوابات والمداخل الميسّرة، ولوحات إرشادية واضحة.', 'سياسة جدولة: نقل الشعب التي فيها طلبة ذوو إعاقة إلى قاعات أرضية أو في مبانٍ بمصاعد عاملة.',
          'خطة إخلاء خاصة لذوي الإعاقة من الطوابق العليا ضمن خطة الطوارئ.'].map(t => `<li>${esc(t)}</li>`).join('')}</ol>`],
        ['المنهجية', '<p>الطوابق من أرقام القاعات في الجدول الدراسي (مثل 7419: المبنى 7، الطابق 4). ساعات التدريس في الطوابق العليا من المحاضرات الوجاهية الأسبوعية. المسارات خطوط تقريبية على طرق المخطط، والمسافة تقديرية.</p>']],
      sign: ['أعدّه', 'الخدمات الهندسية', 'اعتمده'] });
  }

  // ---------------------------------------------------------------- «الإشغال وتقرير القاعات»: by building and day, hour by hour, the rooms, recommendations, and a formal report
  const week = { b: '', tab: 'b' };
  function utilStats() {
    if (utilStats.c) return utilStats.c;
    const DAYS = DAYS5(), H0 = 8 * 60, H1 = 18 * 60, hours = []; for (let h = 8; h < 18; h++) hours.push(h);
    const teach = C.buildings.filter(b => (b.tt || []).length && roomsOf(b).length);
    const occ = (b, d, a0, a1) => { const r = roomsOf(b).length, ms = meetings(b, d); let used = 0; ms.forEach(x => { used += Math.max(0, Math.min(x.z, a1) - Math.max(x.a, a0)); }); return r ? Math.min(1, used / (r * (a1 - a0))) : 0; };
    const roomHours = {}; teach.forEach(b => roomsOf(b).forEach(r => { roomHours[r] = { b, h: 0 }; }));
    teach.forEach(b => DAYS.forEach(d => meetings(b, d).forEach(x => { if (roomHours[x.room]) roomHours[x.room].h += (x.z - x.a) / 60; })));
    // the averages count only the days with real in-person teaching (a day where the campus is under 5% busy is left out)
    const nR0 = teach.reduce((a, b) => a + roomsOf(b).length, 0) || 1;
    const TD = DAYS.filter(d => teach.reduce((a, b) => a + occ(b, d, H0, H1) * roomsOf(b).length, 0) / nR0 >= 0.05);
    const rows = teach.map(b => { const byDay = DAYS.map(d => occ(b, d, H0, H1)); let pk = { v: 0 };
      DAYS.forEach(d => hours.forEach(h => { const v = occ(b, d, h * 60, h * 60 + 60); if (v > pk.v) pk = { v, d, h }; }));
      return { b, rooms: roomsOf(b).length, byDay, avg: byDay.filter((v, i) => TD.includes(DAYS[i])).reduce((a, v) => a + v, 0) / (TD.length || 1), pk, hrs: Math.round(Object.values(roomHours).filter(x => x.b === b).reduce((a, x) => a + x.h, 0)) }; });
    const rooms = Object.entries(roomHours).map(([r, x]) => ({ r, b: x.b, h: Math.round(x.h * 10) / 10 })).sort((a, b) => a.h - b.h || a.r.localeCompare(b.r, 'en', { numeric: true }));
    const nR = rows.reduce((a, r) => a + r.rooms, 0) || 1;
    const campus = DAYS.map(d => hours.map(h => rows.reduce((a, r) => a + occ(r.b, d, h * 60, h * 60 + 60) * r.rooms, 0) / nR));
    const dayAvg = DAYS.map((d, i) => campus[i].reduce((a, v) => a + v, 0) / hours.length);
    const avg = rows.reduce((a, r) => a + r.avg * r.rooms, 0) / nR;
    let peak = { v: -1 }, calm = { v: 2 };
    DAYS.forEach((d, i) => hours.forEach((h, j) => { const v = campus[i][j]; if (v > peak.v) peak = { v, d, h }; if (h >= 9 && h <= 14 && v < calm.v) calm = { v, d, h }; }));
    const low = rows.filter(r => r.avg < 0.25), rec = [];
    rec.push(`أعلى إشغال للحرم يوم ${U.DAYS[peak.d]} الساعة ${peak.h}:00 (${pct(peak.v)})، وأقله في ساعات الذروة يوم ${U.DAYS[calm.d]} الساعة ${calm.h}:00 (${pct(calm.v)}): يُقترح توجيه الشعب الجديدة والإضافية إلى الأوقات الأقل إشغالاً.`);
    const busy = rows.filter(r => r.pk.v >= 0.85).sort((a, b) => b.pk.v - a.pk.v);
    busy.slice(0, 3).forEach(r => { const alt = low.filter(x => x !== r).sort((x, y) => meters(r.b, x.b) - meters(r.b, y.b))[0];
      rec.push(`${r.b.name}: يبلغ إشغاله ${pct(r.pk.v)} يوم ${U.DAYS[r.pk.d]} الساعة ${r.pk.h}:00؛ يُقترح نقل بعض شعب تلك الساعة إلى ساعة أهدأ${alt ? ` أو إلى ${alt.b.name} القريب (متوسط إشغاله ${pct(alt.avg)})` : ''}.`); });
    if (busy.length > 3) rec.push(`مبانٍ أخرى تتجاوز 85% في ساعة ذروتها: ${busy.slice(3).map(r => `${r.b.short || r.b.name} (${U.DAYS[r.pk.d]} ${r.pk.h}:00)`).join('، ')}.`);
    if (low.length) rec.push(`مبانٍ متوسط إشغالها أقل من 25% بين 8:00 و18:00: ${low.map(r => `${r.b.short || r.b.name} (${pct(r.avg)})`).join('، ')}؛ متاحة لاستيعاب شعب إضافية أو للامتحانات والدورات وأنشطة الطلبة.`);
    const idle = rooms.filter(x => x.h < 4);
    if (idle.length) rec.push(`${idle.length} قاعة تُستعمل أقل من 4 ساعات تدريس أسبوعياً (منها ${idle.slice(0, 6).map(x => x.r).join('، ')}): يُقترح مراجعة تخصيصها أو تحويلها إلى قاعات دراسة أو اجتماعات أو مختبرات.`);
    const tdAvg = dayAvg.map((v, i) => TD.includes(DAYS[i]) ? v : 9), dmin = tdAvg.indexOf(Math.min(...tdAvg));
    rec.push(`يوم ${U.DAYS[DAYS[dmin]]} هو الأقل إشغالاً خلال الأسبوع (${pct(dayAvg[dmin])})؛ يمكن الاستفادة منه في جدولة المحاضرات التعويضية والفعاليات.`);
    return (utilStats.c = { DAYS, TD, hours, teach, occ, rows, rooms, campus, dayAvg, avg, peak, calm, rec, idle });
  }
  function weekTool() {
    const U2 = utilStats(), wb = B(week.b) || U2.teach[0], cell = v => `<td style="--v:${v.toFixed(2)}" title="${pct(v)}">${Math.round(v * 100)}</td>`;
    const tabs = [['b', 'bi-buildings', 'المباني'], ['h', 'bi-clock', 'ساعة بساعة'], ['rooms', 'bi-door-closed', 'القاعات'], ['rec', 'bi-lightbulb', 'التوصيات']];
    let body;
    if (week.tab === 'b') body = `<div class="cm-heatwrap"><table class="cm-heat"><thead><tr><th>المبنى</th>${U2.DAYS.map(d => `<th>${esc(U.DAYS[d] || d)}</th>`).join('')}<th>المعدل</th></tr></thead>
        <tbody>${U2.rows.map(r => `<tr class="${r.b === wb ? 'on' : ''}" data-wb="${esc(r.b.id)}" title="${esc(r.b.name)}"><th><span class="cm-no sm">${esc(r.b.id)}</span></th>${r.byDay.map(cell).join('')}${cell(r.avg)}</tr>`).join('')}</tbody></table></div>
      <p class="cm-note">نسبة القاعات المشغولة بين 8:00 و18:00. الأحمر الأكثر ازدحاماً. اضغط مبنى لتراه ساعة بساعة.</p>`;
    else if (week.tab === 'h') body = `${bSel('cm-wb', wb, 'المبنى', b => U2.teach.includes(b))}<div class="cm-heatwrap mt-2"><table class="cm-heat sm"><thead><tr><th></th>${U2.hours.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${U2.DAYS.map(d => `<tr><th>${esc(U.DAYS[d] || d)}</th>${U2.hours.map(h => cell(U2.occ(wb, d, h * 60, h * 60 + 60))).join('')}</tr>`).join('')}</tbody></table></div>`;
    else if (week.tab === 'rooms') body = `<h3><i class="bi bi-arrow-down"></i> الأقل استخداماً <small>ساعات تدريس في الأسبوع</small></h3>${U2.rooms.slice(0, 10).map(x => row(x.r, x.b.name, floorName(floorOf(x.r)), `${x.h} ساعة`)).join('')}
      <h3><i class="bi bi-arrow-up"></i> الأكثر استخداماً</h3>${U2.rooms.slice(-8).reverse().map(x => row(x.r, x.b.name, floorName(floorOf(x.r)), `${x.h} ساعة`)).join('')}`;
    else body = `<p class="cm-note">توصيات آلية من الجدول الدراسي، للمراجعة قبل اتخاذ أي قرار.</p><ol class="cm-ol">${U2.rec.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'الإشغال وتقرير القاعات', 'من الجدول الدراسي، للتخطيط')}
      <div class="cm-kpis"><div><b>${U2.rooms.length}</b><span>قاعة تدريس</span></div><div><b>${pct(U2.avg)}</b><span>متوسط الإشغال</span></div><div><b>${U2.idle.length}</b><span>قاعة أقل من 4 س/أسبوع</span></div></div>
      <div class="cm-tabs" role="tablist">${tabs.map(([k, i, t]) => `<button type="button" role="tab" data-wt="${k}" class="${k === week.tab ? 'on' : ''}"><i class="bi ${i}"></i> ${t}</button>`).join('')}</div>
      <div class="cm-body">${body}</div>
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-doc"><i class="bi bi-file-earmark-text"></i> التقرير الرسمي</button>
        <a class="btn btn-sm btn-outline-secondary" href="usage.html"><i class="bi bi-grid-3x3-gap-fill"></i> إشغال القاعات بالتفصيل</a></div></div>`;
    bind(() => setTool(''));
    $('#cm-card').querySelectorAll('[data-wt]').forEach(x => x.onclick = () => { week.tab = x.dataset.wt; weekTool(); });
    $('#cm-card').querySelectorAll('[data-wb]').forEach(x => x.onclick = () => { week.b = x.dataset.wb; week.tab = 'h'; weekTool(); center(B(week.b)); });
    if ($('#cm-wb')) $('#cm-wb').onchange = e => { week.b = e.target.value; weekTool(); center(B(week.b)); };
    $('#cm-doc').onclick = weekDoc;
  }
  function weekDoc() {
    const U2 = utilStats(), D = U2.DAYS;
    doc({ code: 'SU', title: 'تقرير استغلال القاعات التدريسية', sub: 'الإشغال الأسبوعي حسب الجدول الدراسي للفصل الحالي', unit: 'التخطيط والشؤون الأكاديمية',
      info: [['قاعات التدريس', String(U2.rooms.length)], ['متوسط الإشغال (8:00–18:00)', pct(U2.avg)], ['ذروة الحرم', `${U.DAYS[U2.peak.d]} ${U2.peak.h}:00 · ${pct(U2.peak.v)}`], ['قاعات أقل من 4 ساعات أسبوعياً', String(U2.idle.length)]],
      sections: [
        ['الملخص', `<p>يبيّن هذا التقرير مدى استغلال القاعات التدريسية في ${U2.rows.length} مبنى خلال أيام الدوام بين الساعة 8:00 و18:00، من المحاضرات الوجاهية في الجدول الدراسي. متوسط الإشغال ${pct(U2.avg)}، وأعلاه يوم ${U.DAYS[U2.peak.d]} الساعة ${U2.peak.h}:00.</p>`],
        ['الإشغال حسب المبنى', tbl(['المبنى', 'الاسم', 'القاعات', 'ساعات تدريس أسبوعية', 'متوسط الإشغال', 'الذروة'], U2.rows.slice().sort((a, b) => b.avg - a.avg).map(r => [[r.b.id, 'c'], esc(r.b.name), [r.rooms, 'c'], [r.hrs, 'c'], [pct(r.avg), 'c'], [`${U.DAYS[r.pk.d] || '—'} ${r.pk.h || ''}:00 · ${pct(r.pk.v)}`, 'c']]))],
        ['الإشغال حسب المبنى واليوم (%)', tbl(['المبنى', ...D.map(d => U.DAYS[d]), 'المعدل'], U2.rows.map(r => [[r.b.id + ' · ' + esc(r.b.short || r.b.name), ''], ...r.byDay.map(heatTd), heatTd(r.avg)]))],
        ['إشغال الحرم حسب اليوم والساعة (%)', tbl(['اليوم', ...U2.hours.map(h => h + ':00')], D.map((d, i) => [U.DAYS[d], ...U2.campus[i].map(heatTd)]))],
        ['القاعات الأقل استخداماً', tbl(['#', 'القاعة', 'المبنى', 'الطابق', 'ساعات تدريس أسبوعية'], U2.rooms.slice(0, 15).map((x, i) => [[i + 1, 'n'], [x.r, 'ltr'], esc(x.b.name), floorName(floorOf(x.r)), [x.h, 'c']]))],
        ['القاعات الأكثر استخداماً', tbl(['#', 'القاعة', 'المبنى', 'الطابق', 'ساعات تدريس أسبوعية'], U2.rooms.slice(-10).reverse().map((x, i) => [[i + 1, 'n'], [x.r, 'ltr'], esc(x.b.name), floorName(floorOf(x.r)), [x.h, 'c']]))],
        ['التوصيات', `<ol>${U2.rec.map(t => `<li>${esc(t)}</li>`).join('')}</ol><div class="note">توصيات آلية مستخرجة من الأرقام، تحتاج مراجعة الكليات ودائرة القبول والتسجيل قبل التنفيذ.</div>`],
        ['المنهجية', `<p>الإشغال = مجموع دقائق المحاضرات الوجاهية في قاعات المبنى ÷ (عدد قاعاته × دقائق الفترة). المحاضرة المكررة في الجدول تُحسب مرة واحدة. القاعات المعتبرة هي التي تظهر في الجدول الدراسي فقط، والطابق مأخوذ من رقم القاعة.
          المتوسطات محسوبة على أيام التدريس الوجاهي الفعلية (${U2.TD.map(d => U.DAYS[d]).join('، ')})${U2.DAYS.length > U2.TD.length ? `؛ واستُبعد منها ${U2.DAYS.filter(d => !U2.TD.includes(d)).map(d => U.DAYS[d]).join(' و')} لأن الإشغال فيه أقل من 5%` : ''}.</p>`]],
      sign: ['أعدّه', 'مدير التخطيط', 'اعتمده'] });
  }

  // ---------------------------------------------------------------- «ملصقات QR»: «أنت هنا» stickers for the gates and the building entrances
  function qrTool() {
    const qr = link => { if (!window.qrcode) return ''; const x = window.qrcode(0, 'M'); x.addData(link); x.make(); return x.createSvgTag({ cellSize: 4, margin: 1, scalable: true }); };
    const items = [...(C.gates || []).map(g => ['gate:' + g.id, g.name, 'بوابة']), ...C.buildings.map(b => ['b:' + b.id, b.name, 'مبنى ' + b.id])];
    $('#cm-card').innerHTML = `<div class="cm-card">${head('', '', 'ملصقات QR «أنت هنا»', 'لكل بوابة ومدخل مبنى: من يمسحه تفتح له الخريطة ومكانه عليها')}
      <div class="cm-links"><button type="button" class="btn btn-sm btn-maroon" id="cm-print"><i class="bi bi-printer"></i> اطبع كل الملصقات (${items.length})</button></div>
      <p class="cm-note">لكل ملصق رمزان: «أنت هنا» (الخريطة والطريق من هذا المكان) و«بلاغ عطل» (بلاغ جاهز بالمبنى).</p>
      <div class="cm-qrs">${items.map(([k, name, kind]) => `<div class="cm-qr"><div class="cm-qr-c">${qr(SITE + 'campus.html?here=' + encodeURIComponent(k))}${k.startsWith('b:') ? qr(SITE + 'campus.html?tool=fix&here=' + encodeURIComponent(k)) : ''}</div>
        <b>أنت هنا: ${esc(name)}</b><small>${esc(kind)}</small></div>`).join('')}</div></div>`;
    bind(() => setTool(''));
    $('#cm-print').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصقات خريطة الحرم</title><style>
        body{font-family:Tajawal,Tahoma,sans-serif;margin:0} .g{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding:8mm}
        .s{border:1.5px dashed #999;border-radius:6mm;padding:5mm;text-align:center;break-inside:avoid} .s svg{width:34mm;height:34mm;display:block;margin:auto} .s b{display:block;font-size:13pt;margin:1.5mm 0;color:#901d23} .s small{display:block;font-size:8pt;color:#444} .q{display:flex;justify-content:center;gap:4mm}
        .t{font-size:9pt;color:#901d23;font-weight:700}</style></head><body><div class="g">${items.map(([k, name]) => `<div class="s"><div class="t">جامعة البترا · خريطة الحرم</div><b>أنت هنا: ${esc(name)}</b><div class="q"><div>${qr(SITE + 'campus.html?here=' + encodeURIComponent(k))}<small>الخريطة والطريق إلى قاعتك</small></div>
          ${k.startsWith('b:') ? `<div>${qr(SITE + 'campus.html?tool=fix&here=' + encodeURIComponent(k))}<small>بلّغ عن عطل في هذا المبنى</small></div>` : ''}</div></div>`).join('')}</div>
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
    needPanel();
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

  // ---------------------------------------------------------------- pan and zoom
  // view.s = 1 shows the whole plan. On a phone the map opens filled (no empty bands; drag to see the sides), and
  // «الخريطة كاملة» shows all of it. The deeper the zoom, the sharper the copy: the plan (1x), twice its size (2x),
  // then four times its size in tiles, only the tiles in view (C.tiles).
  const narrow = () => innerWidth < 576 && !app.querySelector('.cm.cm-full');
  function dims() {
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight, fit = Math.min(1, (h / w) * (C.width / C.height));
    const cover = Math.max(1, (h * C.width / C.height) / (w * fit));
    return { m, w, h, fit, cover, max: Math.min(10, Math.max(4, 4 * C.width / (w * fit))) };
  }
  function apply() {
    const m = $('#cm-map'); if (!m) return;
    const { w, h, fit, max } = dims();
    view.s = Math.min(max, Math.max(1, view.s));
    const iw = w * view.s * fit, ih = iw * C.height / C.width;
    view.x = iw <= w ? (w - iw) / 2 : Math.min(0, Math.max(w - iw, view.x));
    view.y = ih <= h ? (h - ih) / 2 : Math.min(0, Math.max(h - ih, view.y));
    const st = $('#cm-stage'); st.style.width = iw + 'px'; st.style.transform = `translate(${view.x}px, ${view.y}px)`;
    const px = iw * (window.devicePixelRatio || 1);
    if (C.image_2x && !apply.hd && px > C.width * 1.05) { apply.hd = true; const hd = new Image(); hd.onload = () => { $('#cm-img').src = C.image_2x; }; hd.src = C.image_2x; }
    tiles(px > C.width * 2.2, iw, ih, w, h);
    const { cover } = dims();
    m.style.setProperty('--pin', L.size * (narrow() ? Math.max(0.55, Math.min(1.1, 0.62 * view.s / cover)) : Math.max(0.75, Math.min(1.3, view.s * fit * 0.9))));
    if (L.names && !apply.raf) apply.raf = requestAnimationFrame(() => { apply.raf = 0; names(); });
  }
  function tiles(on, iw, ih, w, h) {
    const T = C.tiles, box = $('#cm-tiles');
    if (!T) return;
    box.hidden = !on;
    if (!on) return;
    for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) {
      const id = `t${r}-${c}`, x0 = view.x + iw * c / T.cols, y0 = view.y + ih * r / T.rows;
      if (box.querySelector('#' + id) || x0 > w || y0 > h || x0 + iw / T.cols < 0 || y0 + ih / T.rows < 0) continue;
      const im = new Image(); im.id = id; im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.style.cssText = `left:${c * 100 / T.cols}%;top:${r * 100 / T.rows}%;width:${100 / T.cols + 0.02}%;height:${100 / T.rows + 0.02}%`;
      im.onload = () => im.classList.add('on'); im.src = T.path.replace('{r}', r).replace('{c}', c);
      box.appendChild(im);
    }
  }
  function zoom(f, cx, cy) {
    const { w, h, max } = dims();
    if (!f) { view.s = 1; apply(); return; }
    cx = cx == null ? w / 2 : cx; cy = cy == null ? h / 2 : cy;
    const s = Math.max(1, Math.min(max, view.s * f)), k = s / view.s;
    view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s; apply();
  }
  function center(o) {
    if (!o) return;
    const { w, h, fit, cover } = dims();
    if (view.s < Math.max(2, cover * 1.3)) view.s = Math.max(2.2, cover * 1.4);
    const iw = w * view.s * fit, ih = iw * C.height / C.width;
    view.x = w / 2 - o.x * iw; view.y = h / 2 - o.y * ih; apply();
  }
  // the first view: the whole plan, or filled on a phone
  function home() { const d = dims(); view.s = narrow() ? d.cover : 1; const iw = d.w * view.s * d.fit; view.x = (d.w - iw) / 2; view.y = 0; apply(); }
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
    let wasNarrow = narrow();
    addEventListener('resize', () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); home(); } else apply(); });
    home();
  }

  // ---------------------------------------------------------------- style and start
  document.head.insertAdjacentHTML('beforeend', `<style>
    .cm { display: grid; grid-template-columns: minmax(0, 410px) minmax(0, 1fr); gap: 1rem; align-items: start; }
    /* wide screens: the panel on the right (first in Arabic order), the map beside it; «إخفاء القائمة» gives the map the whole width */
    @media (min-width: 992px) { .cm-side { order: -1; } .cm .cm-fs-only { display: block; } .cm.cm-nopanel { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 991.98px) { .cm { grid-template-columns: minmax(0, 1fr); } }
    .cm-map { position: relative; aspect-ratio: 1848 / 1080; max-height: 80vh; width: 100%; min-height: 300px; border-radius: 16px; overflow: hidden; background: #f3f6f4; touch-action: none; cursor: grab; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); direction: ltr; }
    .cm-map:active { cursor: grabbing; }
    .cm-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .cm-stage img { display: block; width: 100%; height: auto; user-select: none; pointer-events: none; image-rendering: auto; }
    #cm-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    #cm-svg polyline { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
    #cm-svg .cm-case { stroke: #fff; stroke-width: 11; filter: drop-shadow(0 1px 3px rgba(0,0,0,.55)); }
    #cm-svg .cm-route { stroke: #1d4ed8; stroke-width: 6; stroke-dasharray: 16 10; animation: cmDash 1s linear infinite; }
    #cm-svg .cm-dayline { stroke: #901d23; stroke-width: 5; stroke-dasharray: 12 9; }
    @keyframes cmDash { to { stroke-dashoffset: -26; } }
    .cm-arrow { position: absolute; transform: translate(-50%, -50%) rotate(var(--r)) scale(var(--pin, 1)); width: 1.5rem; height: 1.5rem; border-radius: 50%; background: #1d4ed8; color: #fff; display: grid; place-items: center; font-size: .8rem; box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.4); pointer-events: none; z-index: 4; }
    .cm-arrow i { -webkit-text-stroke: 1px #fff; }
    .cm-rt-a { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); pointer-events: none; z-index: 4; }
    .cm-rt-a i { display: block; width: 1.1rem; height: 1.1rem; border-radius: 50%; background: #fff; border: 4px solid #1d4ed8; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
    .cm-rt-b { position: absolute; transform: translate(-50%, -112%) scale(var(--pin, 1)); transform-origin: 50% 100%; display: grid; justify-items: center; pointer-events: none; z-index: 5; animation: cmDrop 1.4s ease-in-out infinite; }
    .cm-rt-b i { font-size: 2.1rem; color: #1d4ed8; line-height: 1; filter: drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 3px 4px rgba(0,0,0,.45)); order: 2; }
    .cm-rt-b b { order: 1; background: #1d4ed8; color: #fff; border-radius: 999px; padding: .05rem .5rem; font-size: .7rem; white-space: nowrap; direction: rtl; max-width: 14rem; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 0 0 2px #fff; }
    @keyframes cmDrop { 50% { margin-top: -.35rem; } }
    #cm-tiles { position: absolute; inset: 0; pointer-events: none; } #cm-tiles[hidden] { display: none; }
    #cm-tiles img { position: absolute; display: block; max-width: none; opacity: 0; transition: opacity .25s; user-select: none; } #cm-tiles img.on { opacity: 1; }
    .cm-mapwrap { position: relative; min-width: 0; }
    #cm-pins { position: absolute; inset: 0; }
    .cm-pin { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); border: 3px solid #fff; background: var(--c); color: #fff; border-radius: 999px; min-width: 2.1rem; height: 2.1rem; padding: 0 .35rem;
      display: flex; align-items: center; gap: .2rem; justify-content: center; font-weight: 800; font-size: .85rem; box-shadow: 0 3px 10px rgba(0,0,0,.35); cursor: pointer; transition: transform .15s; }
    .cm-pin .cm-cnt { position: absolute; top: -.6rem; inset-inline-end: -.7rem; min-width: 1.15rem; height: 1.15rem; padding: 0 .25rem; border-radius: 999px; background: #111827; color: #fff; font-size: .62rem; line-height: 1; display: grid; place-items: center; box-shadow: 0 0 0 2px #fff; }
    .cm-pin.nonum { min-width: 1.05rem; width: 1.05rem; height: 1.05rem; padding: 0; border-width: 2px; } .cm-pin.nonum > b { display: none; }
    .cm-pin.nonum .cm-cnt { top: -.75rem; inset-inline-end: -.85rem; }
    .cm-name { position: absolute; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(calc(.6 + var(--pin, 1) * .4)); z-index: 2; pointer-events: none; visibility: hidden;
      background: rgba(255,255,255,.95); color: #1f2937; border-radius: 6px; padding: .05rem .4rem; font-size: .68rem; font-weight: 800; line-height: 1.35; white-space: nowrap; direction: rtl;
      max-width: 10rem; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 1px 4px rgba(0,0,0,.28); border: 1px solid rgba(144,29,35,.25); }
    .cm-name.on { visibility: visible; }
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
    .cm-layers[hidden] { display: none; } .cm-layers label { display: flex; gap: .4rem; align-items: center; cursor: pointer; }
    .cm-layers .cm-size { border-top: 1px solid #e5e7eb; padding-top: .35rem; margin-top: .1rem; } .cm-size input { flex: 1; accent-color: #901d23; min-width: 5rem; }
    .cm-reset { border: 0; background: none; color: #901d23; font-size: .78rem; text-decoration: underline; justify-self: start; padding: 0; } .cm-layers i { color: #901d23; }
    .cm-time { position: absolute; bottom: .6rem; left: .6rem; right: .6rem; direction: rtl; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,.95); color: #111; border-radius: 12px; padding: .4rem .6rem; box-shadow: 0 2px 10px rgba(0,0,0,.15); z-index: 6; }
    .cm-time select { width: auto; } .cm-time input[type=range] { flex: 1; min-width: 110px; accent-color: #901d23; direction: ltr; } .cm-time b { font-variant-numeric: tabular-nums; min-width: 6.5rem; }
    .cm-key { position: absolute; top: .6rem; right: .6rem; direction: rtl; display: flex; flex-wrap: wrap; gap: .25rem .6rem; max-width: 60%; background: rgba(255,255,255,.94); color: #111; border-radius: 10px; padding: .25rem .6rem; font-size: .74rem; z-index: 6; }
    .cm-key[hidden] { display: none; } .cm-key i { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; background: var(--c); vertical-align: middle; }
    .cm-key i.ring { background: #fff; box-shadow: 0 0 0 2px var(--c); } .cm-key i.sq { border-radius: 2px; } .cm-key i.dia { border-radius: 1px; transform: rotate(45deg); } .cm-key i.cnt { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #111827; }
    @media (max-width: 575.98px) { .cm-key { display: none; }
      .cm-map { aspect-ratio: 4 / 3; min-height: 260px; border-radius: 12px; }
      .cm-time { position: static; margin-top: .45rem; box-shadow: none; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); padding: .35rem .45rem; gap: .35rem; }
      .cm-time select { flex: 1 1 45%; } .cm-time b { min-width: 0; font-size: .8rem; } .cm-time input[type=range] { order: 5; flex-basis: 100%; }
      .cm-tools { grid-auto-flow: column; top: .45rem; left: .45rem; gap: .25rem; } .cm-tools button { width: 2rem; height: 2rem; border-radius: 9px; }
      .cm-layers { top: 2.9rem; left: .45rem; right: .45rem; min-width: 0; max-height: calc(100% - 3.4rem); overflow: auto; font-size: .84rem; }
      .cm-body, .cm-qrs { max-height: none; overflow: visible; }
      .cm-tabs { overflow-x: auto; scrollbar-width: none; } .cm-tabs button { flex: 1 0 auto; font-size: .76rem; padding: .35rem .45rem; }
      .cm-modes button { font-size: .64rem; padding: .3rem 0; } .cm-modes button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .cm-card { padding: .7rem; } .cm-h h2 { font-size: 1rem; } .cm-faces { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); }
      .cm-list small { display: none; } .cm-links .btn { flex: 1 1 auto; } .cm-rt-b b { max-width: 9rem; } }
    .cm-side { display: grid; grid-template-columns: minmax(0, 1fr); gap: .6rem; min-width: 0; box-sizing: border-box; }
    .cm-side *, .cm-side *::before, .cm-side *::after { box-sizing: border-box; }
    .cm-side > * { min-width: 0; }
    .cm-search { position: relative; } .cm-search i { position: absolute; inset-inline-start: .8rem; top: 50%; transform: translateY(-50%); color: #6b7280; }
    .cm-search input { width: 100%; border: 1px solid var(--bs-border-color); border-radius: 12px; padding: .6rem 2.3rem .6rem .8rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-modes { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .25rem; }
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
    .cm-search.sm input { padding: .45rem 2.1rem .45rem .6rem; font-size: .88rem; }
    .cm-by { display: flex; flex-wrap: wrap; gap: .25rem; margin: .45rem 0 .3rem; }
    .cm-by button { font-size: .76rem; border: 1px solid var(--bs-border-color); border-radius: 999px; padding: .12rem .6rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-by button.on { background: #901d23; color: #fff; border-color: #901d23; }
    .cm-chk { display: flex; gap: .35rem; align-items: center; font-size: .8rem; margin-bottom: .4rem; cursor: pointer; }
    .cm-found { display: grid; gap: .3rem; margin-top: .25rem; }
    .cm-sec { display: flex; gap: .5rem; align-items: center; border: 1px solid var(--bs-border-color); border-radius: 10px; padding: .4rem .55rem; }
    .cm-sec.in { border-color: #16a34a; background: #f0fdf4; color: #14532d; } .cm-sec .cm-t b small { color: #901d23; font-size: .72rem; }
    .cm-sec .cm-t small { white-space: normal; }
    .cm-plus, .cm-added { flex: none; width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; border: 0; }
    .cm-plus { background: #901d23; color: #fff; font-size: 1rem; } .cm-added { background: #16a34a; color: #fff; }
    .cm-chips { display: flex; flex-wrap: wrap; gap: .3rem; }
    .cm-chip { display: inline-flex; align-items: center; gap: .3rem; background: var(--bs-tertiary-bg); border-radius: 999px; padding: .15rem .3rem .15rem .6rem; font-size: .78rem; max-width: 100%; }
    .cm-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .cm-chip small { color: #901d23; font-weight: 700; } .cm-chip > i { color: #16a34a; padding: 0 .2rem; }
    .cm-chip button { border: 0; background: #fff; border-radius: 50%; width: 1.3rem; height: 1.3rem; display: grid; place-items: center; padding: 0; color: #b91c1c; }
    .cm-back { border: 0; background: none; color: #901d23; font-weight: 700; font-size: .8rem; padding: 0; margin-bottom: .35rem; }
    .cm-more-g { display: grid; gap: .35rem; }
    .cm-more-g button { display: flex; gap: .7rem; align-items: center; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 12px; padding: .6rem .7rem; width: 100%; }
    .cm-more-g button:hover { border-color: #901d23; } .cm-more-g button > i:first-child { font-size: 1.4rem; color: #901d23; width: 2.2rem; height: 2.2rem; border-radius: 10px; background: #f8e3e5; display: grid; place-items: center; flex: none; }
    .cm-more-g span { flex: 1; min-width: 0; } .cm-more-g b { display: block; font-size: .92rem; } .cm-more-g small { display: block; color: var(--bs-secondary-color); font-size: .76rem; } .cm-more-g button > i:last-child { color: var(--bs-secondary-color); }
    .cm-frow, .cm-exam { display: flex; gap: .55rem; align-items: center; width: 100%; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .45rem .6rem; }
    .cm-frow:hover { border-color: #16a34a; } .cm-frow .cm-t b small { color: var(--bs-secondary-color); font-weight: 500; } .cm-exam { margin-bottom: .35rem; align-items: flex-start; } .cm-exam .cm-t small { white-space: normal; } .cm-exam .cm-t small b { color: #901d23; }
    .cm-soon { color: #b45309 !important; font-weight: 700; }
    .cm-two { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; } @media (max-width: 400px) { .cm-two { grid-template-columns: 1fr; } }
    .cm-prop { display: flex; gap: .5rem; align-items: flex-start; background: #fffbeb; color: #78350f; border: 1px solid #fde68a; border-radius: 10px; padding: .5rem .65rem; font-size: .8rem; margin: .5rem 0; }
    .cm-prop i { color: #d97706; font-size: 1rem; } .cm-prop.danger { background: #fef2f2; color: #7f1d1d; border-color: #fecaca; } .cm-prop.danger i { color: #dc2626; }
    .cm-calls { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .35rem; margin-bottom: .4rem; }
    .cm-calls > * { display: flex; gap: .5rem; align-items: center; border: 1px solid var(--bs-border-color); border-radius: 10px; padding: .45rem .6rem; text-decoration: none; color: var(--bs-body-color); }
    .cm-calls .sos { background: #dc2626; border-color: #dc2626; color: #fff; } .cm-calls b { display: block; font-size: 1.05rem; } .cm-calls small { display: block; font-size: .7rem; opacity: .85; line-height: 1.25; } .cm-calls i { font-size: 1.15rem; }
    .cm-ap-box { display: flex; gap: .6rem; align-items: center; background: #f0fdf4; border: 1px solid #86efac; color: #14532d; border-radius: 12px; padding: .6rem .7rem; margin-top: .6rem; }
    .cm-ap-box > i { font-size: 1.6rem; color: #15803d; } .cm-ap-box b { display: block; font-size: 1rem; } .cm-ap-box small { display: block; font-size: .76rem; }
    .cm-ol { padding-inline-start: 1.2rem; margin: .2rem 0; font-size: .84rem; } .cm-ol li { margin: .2rem 0; }
    .cm-ap { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); display: flex; align-items: center; gap: .1rem; background: #15803d; color: #fff; border: 2px solid #fff; border-radius: 6px; padding: .05rem .3rem; font-size: .7rem; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,.35); pointer-events: none; z-index: 3; }
    #cm-svg .cm-evac { stroke: #15803d; stroke-width: 6; stroke-dasharray: 14 9; animation: cmDash 1s linear infinite; }
    #cm-svg .cm-access { stroke: #7c3aed; stroke-width: 6; stroke-dasharray: 12 8; }
    #cm-svg .cm-net { stroke: #7c3aed; stroke-width: 2; opacity: .45; }
    .cm-pin.mk { box-shadow: 0 0 0 4px #22c55e, 0 3px 10px rgba(0,0,0,.35); }
    .cm-stop { border: 1px solid #ecd5d7; background: #fdf7f7; border-radius: 12px; padding: .65rem .75rem; margin: .6rem 0; }
    .cm-stop-h { display: flex; gap: .6rem; align-items: center; } .cm-stop-h h3 { margin: 0 !important; font-size: 1.02rem !important; } .cm-stop-h small { color: var(--bs-secondary-color); font-size: .75rem; }
    .cm-stop p { font-size: .86rem; margin: .45rem 0; } .cm-stop-nav { display: flex; gap: .35rem; justify-content: space-between; margin-top: .4rem; }
    .cm-stepno.sm { width: 1.35rem; height: 1.35rem; font-size: .72rem; } .cm-list button.on { border-color: #901d23; background: #fdf7f7; }
    .cm-chart { width: 100%; height: auto; display: block; margin-top: .3rem; }
    .cm-key2 { display: flex; flex-wrap: wrap; gap: .2rem .8rem; font-size: .72rem; color: var(--bs-secondary-color); } .cm-key2 i { display: inline-block; width: .8rem; height: .55rem; border-radius: 2px; vertical-align: middle; } .cm-key2 i.ln { border-top: 2px dashed #111; height: 0; }
    .cm-form .cm-lbl { margin-top: .55rem; }
    .cm-cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .3rem; }
    .cm-cats label { display: flex; gap: .35rem; align-items: center; border: 1px solid var(--bs-border-color); border-radius: 9px; padding: .3rem .5rem; font-size: .8rem; cursor: pointer; }
    .cm-cats label.on { border-color: #901d23; background: #fdf7f7; color: #901d23; font-weight: 700; } .cm-cats input { accent-color: #901d23; }
    .cm-by button.danger.on { background: #dc2626; border-color: #dc2626; }
    .cm-ticket { display: grid; grid-template-columns: 1fr 1fr; gap: .35rem; margin-bottom: .5rem; } .cm-ticket div { background: var(--bs-tertiary-bg); border-radius: 10px; padding: .4rem .55rem; min-width: 0; }
    .cm-ticket small { display: block; font-size: .7rem; color: var(--bs-secondary-color); } .cm-ticket b { display: block; font-size: .86rem; overflow-wrap: anywhere; }
    .cm-links.cm-col { flex-direction: column; } .cm-links.cm-col > * { width: 100%; }
    .cm-floors { display: grid; gap: .3rem; } .cm-floor { display: flex; gap: .45rem; align-items: flex-start; border-bottom: 1px dashed var(--bs-border-color); padding-bottom: .3rem; }
    .cm-fl { flex: none; width: 2.6rem; text-align: center; background: #091b22; color: #fff; border-radius: 8px; font-weight: 800; font-size: .76rem; padding: .25rem 0; } .cm-floor .cm-free { flex: 1; }
    .cm-dot { display: inline-block; width: .7rem; height: .7rem; border-radius: 3px; background: #ecfdf3; border: 1px solid #16a34a; vertical-align: middle; } .cm-dot.part { background: #fffbeb; border-color: #d97706; } .cm-dot.busy { background: #fef2f2; border-color: #dc2626; }
    .cm-tools button.sos { background: #dc2626; color: #fff; }
    .cm-qr-c { display: flex; justify-content: center; gap: .3rem; } .cm-qr-c svg { width: 80px; height: 80px; }
    /* scroll bars on the right edge (the start side in Arabic), not the left: the box scrolls left-to-right, its content stays right-to-left */
    .cm-body, .cm-res, .cm-qrs, .cm.cm-full .cm-side { direction: ltr; } .cm-body > *, .cm-res > *, .cm-qrs > *, .cm.cm-full .cm-side > * { direction: rtl; }
    .cm-body { padding-inline-end: 0; padding-right: .35rem; }
    .cm-heatwrap { overflow-x: auto; } .cm-heat { border-collapse: separate; border-spacing: 2px; width: 100%; font-size: .7rem; }
    .cm-heat th { font-weight: 700; color: var(--bs-secondary-color); text-align: center; padding: .1rem; white-space: nowrap; } .cm-heat tbody th { text-align: start; }
    .cm-heat td { text-align: center; border-radius: 4px; padding: .25rem 0; background: color-mix(in srgb, #dc2626 calc(var(--v) * 100%), #ecfdf3); color: #111; font-weight: 700; }
    .cm-heat tr[data-wb] { cursor: pointer; } .cm-heat tr.on th .cm-no { outline: 3px solid #fbbf24; } .cm-heat.sm td { font-size: .6rem; }
    .cm-qrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .5rem; max-height: 52vh; overflow: auto; margin-top: .5rem; }
    .cm-qr { border: 1px dashed var(--bs-border-color); border-radius: 10px; padding: .5rem; text-align: center; } .cm-qr-c svg { background: #fff; }
    .cm-qr b { display: block; font-size: .76rem; color: #901d23; } .cm-qr small { font-size: .66rem; color: var(--bs-secondary-color); }
    .cm.cm-full { position: fixed; inset: 0; z-index: 2000; display: block; background: #0b1c22; }
    .cm.cm-full .cm-map { position: absolute; inset: 0 calc(min(410px, 36vw) + 1.2rem) 0 0; width: auto; aspect-ratio: auto; max-height: none; height: auto; border-radius: 0; }
    .cm.cm-full.cm-nopanel .cm-map { inset: 0; }
    .cm.cm-full .cm-side { position: absolute; top: .6rem; bottom: .6rem; right: .6rem; width: min(410px, 36vw); overflow-y: auto; overflow-x: hidden; z-index: 5; align-content: start;
      background: var(--bs-body-bg, #fff); color: var(--bs-body-color, #111); border-radius: 14px; padding: .6rem; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .cm.cm-full .cm-mapwrap { position: static; }
    .cm.cm-full .cm-time { position: absolute; bottom: .6rem; left: .6rem; right: calc(min(410px, 36vw) + 1.8rem); margin: 0; }
    .cm.cm-full.cm-nopanel .cm-time { right: .6rem; }
    .cm.cm-full .cm-body { max-height: none; } .cm.cm-full .cm-fs-only { display: block; } .cm.cm-nopanel .cm-side { display: none; }
    @media (max-width: 767.98px) { .cm.cm-full .cm-map { inset: 0; } .cm.cm-full .cm-time { right: .6rem; } .cm.cm-full .cm-side { top: auto; bottom: 4.6rem; left: .5rem; right: .5rem; width: auto; max-height: 45%; } }
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
    setInterval(() => { if (!at && !(document.activeElement && document.activeElement.closest('#cm-card'))) { Object.keys(cache).forEach(k => delete cache[k]); draw(); } }, 60000);
  }).catch(e => { app.innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
