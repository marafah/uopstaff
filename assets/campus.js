/* «خريطة الحرم» (campus.html): the university's official campus master plan made live from the site's own data.
   Each numbered building of the plan (data/campus.json: its place on the image and what it is in the timetable, the
   staff directory and the screens) shows how busy it is at the chosen moment; a click opens its card: lectures running
   and starting soon, free rooms, the units and staff with offices there, today's exams and the announcements on its
   screen. One search finds a person, a room, a course, a unit or a building and lights it on the map.
   ?b=<number> opens a building, ?q= searches, ?at=2026-11-10T10:30 shows another moment, ?edit=1 shows coordinates
   on click (to correct a place in data/campus.json). */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  const app = $('#cm-app');
  let C, TT, S, IDX, STAFF = [], EX = null, POSTS = null, sel = P.get('b') || '', q = P.get('q') || '', heat = true;
  let who = P.get('p') || '', faces = P.has('faces'), unitF = '', tour = null, INS = {};
  let at = null;   // {day, min} chosen with the time controls (null = now)
  const view = { s: 1, x: 0, y: 0 };
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const inRoom = m => live(m) && m.mode !== 'الكتروني كامل';
  const KIND = { faculty: ['كلية', '#9e1f27'], admin: ['إدارة وخدمات', '#0b4a66'], service: ['مرافق', '#6d28d9'], center: ['مركز', '#0f766e'], parking: ['موقف', '#475569'] };
  const now = () => { const n = U.amman(P.get('at')); if (at) { n.day = at.day; n.min = at.min; n.clock = toTime(at.min); } return n; };

  // ---------------------------------------------------------------- what is where
  const byTT = {}, byOffice = {}, roomB = {};
  const PREFIX = { 3: '3', 4: '4', 7: '7', 8: '8A', 9: '9', 0: '6' };
  function index() {
    C.buildings.forEach(b => { (b.tt || []).forEach(t => { byTT[t] = b; }); (b.off || []).forEach(o => { byOffice[o] = b; }); });
    S.forEach(s => { const b = byTT[s.building], r = clean(s.room); if (b && r && r !== '0') roomB[r] = b; });
  }
  const B = id => C.buildings.find(b => b.id === id);
  // a staff member's building: by the unit named as the office, or by the office's room number
  function staffB(m) {
    const o = clean(m.office);
    if (!o) return null;
    if (byOffice[o]) return byOffice[o];
    if (roomB[o]) return roomB[o];
    const d = o.replace(/\D/g, '');
    return d.length >= 3 && PREFIX[d[0]] ? B(PREFIX[d[0]]) : null;
  }
  // people: photo, rank on the card, and «أين هو الآن؟» from the timetable (staff matched to instructors by name)
  const TITLES = ['معالي', 'عطوفه', 'سعاده', 'الدكتور', 'الدكتوره', 'المهندس', 'الاستاذ'];
  const nameKey = n => U.norm(n).split(' ').filter(w => w.length > 1 && !TITLES.includes(w)).slice(0, 3).join(' ');
  const LEAD = ['رئيس مجلس الأمناء', 'رئيس الجامعة', 'نائب رئيس الجامعة', 'عميد', 'نائب عميد', 'مساعد عميد / رئيس', 'مدير', 'رئيس قسم'];
  const lead = m => { const i = LEAD.indexOf(m.role); return i < 0 ? 20 + (m.rank_order || 50) / 100 : i; };
  const person = id => STAFF.find(m => m.id === id);
  const face = (m, cls) => m.photo ? `<img class="cm-face ${cls || ''}" src="${esc(m.photo)}" alt="" loading="lazy">`
    : `<span class="cm-face ${cls || ''} cm-ini">${esc(nameKey(m.name).split(' ').slice(0, 2).map(w => w[0]).join(''))}</span>`;
  const insOf = m => INS[nameKey(m.name)] || null;
  function whereNow(m, n) {
    const ins = insOf(m);
    if (!ins || !teaching(n)) return null;
    const mine = [];
    S.forEach(s => { if (s.instructor !== ins.name) return; s.meetings.forEach(x => { if (inRoom(x) && x.day === n.day) mine.push({ s, m: x, a: toMin(x.start), z: toMin(x.end), b: byTT[s.building], room: clean(s.room) }); }); });
    mine.sort((x, y) => x.a - y.a);
    return { now: mine.find(x => x.a <= n.min && n.min < x.z) || null, next: mine.find(x => x.a > n.min) || null, ins };
  }
  function teaching(n) {
    const T = IDX && IDX.teaching;
    if (!T || at) return true;
    return !(n.iso < T.start || n.iso > T.end || T.holidays.includes(n.iso) || n.day === 'ج');
  }
  // the building's meetings on the chosen day (a class listed twice by the portal only once)
  function meetings(b, n) {
    const seen = new Set(), out = [];
    S.forEach(s => {
      if (!(b.tt || []).includes(s.building) || !s.room || s.room === '0') return;
      s.meetings.forEach(m => {
        if (!inRoom(m) || m.day !== n.day) return;
        const k = [clean(s.room), s.code, s.section, m.start].join('|');
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ s, m, a: toMin(m.start), z: toMin(m.end), room: clean(s.room) });
      });
    });
    return out;
  }
  function status(b, n) {
    const ok = teaching(n), all = meetings(b, n), rooms = [...new Set(S.filter(s => (b.tt || []).includes(s.building) && s.room && s.room !== '0').map(s => clean(s.room)))];
    const run = ok ? all.filter(x => x.a <= n.min && n.min < x.z) : [], soon = ok ? all.filter(x => x.a > n.min && x.a <= n.min + 90).sort((x, y) => x.a - y.a) : [];
    const busy = new Set(run.map(x => x.room));
    const free = rooms.filter(r => !busy.has(r)).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))
      .map(r => { const nx = all.filter(x => x.room === r && x.a > n.min).sort((x, y) => x.a - y.a)[0]; return { r, until: ok && nx ? nx.a : null }; });
    return { run, soon, free, rooms, load: rooms.length ? busy.size / rooms.length : 0, today: ok ? all.length : 0 };
  }
  const examsToday = (b, n) => !EX ? [] : (EX.exams || []).filter(e => e.date === n.iso && e.rooms.some(r => roomB[clean(r.room)] === b));
  const postsOn = (b, n) => !POSTS || !b.screen || !window.UOP_PP ? [] : (POSTS.posts || []).filter(p => window.UOP_PP.matches(p, b.screen, n));

  // ---------------------------------------------------------------- the page
  function shell() {
    app.innerHTML = `<div class="cm">
      <div class="cm-map" id="cm-map"><div class="cm-stage" id="cm-stage"><img src="${esc(C.image)}" alt="مخطط حرم جامعة البترا" draggable="false" id="cm-img"><div id="cm-pins"></div></div>
        <div class="cm-tools"><button type="button" data-z="1.4" title="تكبير"><i class="bi bi-plus-lg"></i></button><button type="button" data-z="0.7" title="تصغير"><i class="bi bi-dash-lg"></i></button>
          <button type="button" data-z="0" title="الخريطة كاملة"><i class="bi bi-aspect-ratio"></i></button>
          <button type="button" id="cm-fs" title="ملء الشاشة"><i class="bi bi-fullscreen"></i></button>
          <button type="button" id="cm-tour" title="جولة تلقائية على المباني (لشاشات العرض)"><i class="bi bi-play-circle"></i></button>
          <button type="button" id="cm-panel" class="cm-fs-only" title="إظهار اللوحة أو إخفاؤها"><i class="bi bi-layout-sidebar-inset-reverse"></i></button></div>
        <div class="cm-time"><select id="cm-day" class="form-select form-select-sm"></select><input type="range" id="cm-min" min="420" max="1260" step="15"><b id="cm-clock"></b>
          <button type="button" class="btn btn-sm btn-light" id="cm-now"><i class="bi bi-clock"></i> الآن</button>
          <label class="cm-heat"><input type="checkbox" id="cm-heat" checked> الانشغال</label>
          <label class="cm-heat"><input type="checkbox" id="cm-faces" ${faces ? 'checked' : ''}> الوجوه</label></div>
        <div class="cm-key"><span><i style="background:#16a34a"></i> هادئ</span><span><i style="background:#f59e0b"></i> متوسط</span><span><i style="background:#dc2626"></i> مزدحم</span><span><i style="background:#64748b"></i> بلا قاعات تدريس</span></div>
      </div>
      <aside class="cm-side"><div class="cm-search"><i class="bi bi-search"></i><input id="cm-q" type="search" placeholder="ابحث: مدرس، موظف، قاعة، مقرر، وحدة، مبنى…" value="${esc(q)}"></div>
        <div id="cm-res"></div><div id="cm-card"></div></aside></div>
      <p class="small text-muted mt-2"><i class="bi bi-info-circle"></i> المخطط من <a href="${esc(C.source)}" target="_blank" rel="noopener">الموقع الرسمي للجامعة</a>؛ ما على المباني محسوب من الجدول الدراسي ودليل الموظفين وجدول الامتحانات وإعلانات الشاشات، ويتحدّث وحده.</p>`;
    const n = U.amman(P.get('at'));
    $('#cm-day').innerHTML = Object.entries(U.DAYS).filter(([k]) => k !== 'ج').map(([k, v]) => `<option value="${k}" ${k === n.day ? 'selected' : ''}>${esc(v)}${k === n.day ? ' (اليوم)' : ''}</option>`).join('');
    $('#cm-min').value = Math.min(1260, Math.max(420, n.min));
    const setAt = () => { at = { day: $('#cm-day').value, min: +$('#cm-min').value }; draw(); };
    $('#cm-day').onchange = setAt; $('#cm-min').oninput = setAt;
    $('#cm-now').onclick = () => { at = null; const m = U.amman(P.get('at')); $('#cm-day').value = m.day; $('#cm-min').value = Math.min(1260, Math.max(420, m.min)); draw(); };
    $('#cm-heat').onchange = e => { heat = e.target.checked; pins(); };
    $('#cm-faces').onchange = e => { faces = e.target.checked; pins(); };
    $('#cm-fs').onclick = fullscreen;
    $('#cm-tour').onclick = () => tour ? stopTour() : startTour();
    $('#cm-panel').onclick = () => { app.querySelector('.cm').classList.toggle('cm-nopanel'); setTimeout(apply, 50); };
    document.addEventListener('fullscreenchange', () => { app.querySelector('.cm').classList.toggle('cm-full', !!document.fullscreenElement); fsIcon(); setTimeout(apply, 50); });
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (who) openPerson(''); else if (sel) open(''); else if (app.querySelector('.cm.cm-full') && !document.fullscreenElement) fullscreen(); });
    $('#cm-q').oninput = e => { q = e.target.value; search(); };
    const top = $('#pg-q'); if (top) { top.value = q; top.oninput = e => { q = e.target.value; $('#cm-q').value = q; search(); }; }
    panzoom();
  }
  function color(st, b) {
    if (!(b.tt || []).length || !st.rooms.length) return '#64748b';
    if (!heat) return KIND[b.kind][1];
    return st.load >= 0.66 ? '#dc2626' : st.load >= 0.33 ? '#f59e0b' : '#16a34a';
  }
  function pins() {
    const n = now(), hits = new Set((search.hits || []).map(h => h.b && h.b.id));
    $('#cm-pins').innerHTML = C.buildings.map(b => {
      const st = status(b, n), c = color(st, b);
      return `<button type="button" class="cm-pin ${b.id === sel ? 'on' : ''} ${hits.has(b.id) ? 'hit' : ''}" data-b="${esc(b.id)}" style="left:${b.x * 100}%;top:${b.y * 100}%;--c:${c}" title="${esc(b.name)}">
        <b>${esc(b.id)}</b>${st.run.length ? `<small>${st.run.length}</small>` : ''}${faces ? stack(b) : ''}</button>`;
    }).join('') + bubbles(n) + (C.gates || []).map(g => `<span class="cm-gate" style="left:${g.x * 100}%;top:${g.y * 100}%" title="${esc(g.name)}">${esc(g.id)}</span>`).join('');
    $('#cm-pins').querySelectorAll('.cm-pin').forEach(p => p.onclick = e => { e.stopPropagation(); open(p.dataset.b); });
  }
  // «الوجوه»: the three most senior people with an office in the building, on its marker
  function stack(b) {
    const L = STAFF.filter(m => m.photo && staffB(m) === b).sort((x, y) => lead(x) - lead(y)).slice(0, 3);
    return L.length ? `<span class="cm-stack">${L.map(m => face(m)).join('')}</span>` : '';
  }
  // the person chosen: their photo at their office, and where they teach now (if elsewhere)
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
    pins(); card();
  }

  // ---------------------------------------------------------------- the building card
  function open(id, focus) {
    sel = id; unitF = '';
    if (who && id) { who = ''; const v = new URL(location.href); v.searchParams.delete('p'); history.replaceState(null, '', v); }
    const u = new URL(location.href); if (id) u.searchParams.set('b', id); else u.searchParams.delete('b'); history.replaceState(null, '', u);
    pins(); card();
    if (focus && id) center(B(id));
    if (innerWidth < 992 && id) $('#cm-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openPerson(id, focus) {
    who = id;
    const u = new URL(location.href); if (id) u.searchParams.set('p', id); else u.searchParams.delete('p'); history.replaceState(null, '', u);
    pins(); card();
    const m = person(id), b = m && (staffB(m) || ((whereNow(m, now()) || {}).now || {}).b);
    if (focus && b) center(b);
    if (innerWidth < 992 && id && !app.querySelector('.cm.cm-full')) $('#cm-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // a person's card: photo, job and unit, office and building, contacts, and where they teach now / next
  function personCard(m, n) {
    const ob = staffB(m), w = whereNow(m, n), SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    const mates = ob ? STAFF.filter(x => x !== m && staffB(x) === ob && clean(x.office) === clean(m.office)).sort((x, y) => lead(x) - lead(y)) : [];
    $('#cm-card').innerHTML = `<div class="cm-card"><div class="cm-pp">${face(m, 'xl')}<div><h2>${esc(m.name)}</h2><div class="cm-job">${esc(m.job || m.rank || '')}</div>
        ${m.department ? `<small>${esc(m.department)}</small>` : ''}</div><button type="button" class="btn-close" id="cm-x" aria-label="إغلاق"></button></div>
      <div class="cm-facts">
        ${ob ? `<button type="button" data-b="${esc(ob.id)}"><i class="bi bi-building"></i><span><small>المكتب</small><b>${esc(ob.name)}</b>${m.office ? `<em>${esc(m.office)}</em>` : ''}</span><span class="cm-no sm">${esc(ob.id)}</span></button>`
          : `<div><i class="bi bi-question-circle"></i><span><small>المكتب</small><b>${esc(m.office || 'غير مسجّل في الدليل')}</b></span></div>`}
        ${w && w.now ? `<button type="button" data-b="${esc(w.now.b ? w.now.b.id : '')}" class="now"><i class="bi bi-broadcast"></i><span><small>يدرّس الآن حتى ${esc(w.now.m.end)}</small><b>${esc(w.now.s.name)}</b><em>قاعة ${esc(w.now.room)}${w.now.b ? ' · ' + esc(w.now.b.name) : ''}</em></span></button>` : ''}
        ${w && !w.now && w.next ? `<button type="button" data-b="${esc(w.next.b ? w.next.b.id : '')}"><i class="bi bi-clock-history"></i><span><small>محاضرته التالية اليوم ${esc(w.next.m.start)}</small><b>${esc(w.next.s.name)}</b><em>قاعة ${esc(w.next.room)}${w.next.b ? ' · ' + esc(w.next.b.name) : ''}</em></span></button>` : ''}
        ${m.ext ? `<div><i class="bi bi-telephone"></i><span><small>الفرعي</small><b dir="ltr">${esc(m.ext)}</b></span></div>` : ''}
        ${m.email ? `<a href="mailto:${esc(m.email)}"><i class="bi bi-envelope"></i><span><small>البريد</small><b dir="ltr">${esc(m.email)}</b></span></a>` : ''}
      </div>
      ${mates.length ? `<h3><i class="bi bi-people"></i> معه في ${esc(clean(m.office))}</h3><div class="cm-faces">${mates.slice(0, 12).map(x => tile(x)).join('')}</div>` : ''}
      <div class="cm-links"><a class="btn btn-sm btn-outline-secondary" href="directory.html?q=${encodeURIComponent(m.name)}"><i class="bi bi-person-lines-fill"></i> في الدليل</a>
        ${w && w.ins ? `<a class="btn btn-sm btn-outline-secondary" href="instructor.html?id=${encodeURIComponent(w.ins.id)}"><i class="bi bi-calendar3"></i> جدوله</a>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cm-share"><i class="bi bi-link-45deg"></i> رابط</button></div></div>`;
    $('#cm-x').onclick = () => openPerson('');
    $('#cm-card').querySelectorAll('[data-b]').forEach(x => { if (x.dataset.b) x.onclick = () => center(B(x.dataset.b)); });
    $('#cm-card').querySelectorAll('[data-p]').forEach(x => x.onclick = () => openPerson(x.dataset.p, true));
    $('#cm-share').onclick = e => navigator.clipboard.writeText(SITE + 'campus.html?p=' + encodeURIComponent(m.id)).then(() => { e.currentTarget.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; });
  }
  const tile = m => `<button type="button" class="cm-tile" data-p="${esc(m.id)}" title="${esc(m.name)}">${face(m)}<b>${esc(U.shortName ? U.shortName(m.name) : m.name)}</b><small>${esc(m.role || m.job || '')}</small></button>`;
  function card() {
    if (who && person(who)) { personCard(person(who), now()); return; }
    const n = now(), b = B(sel);
    if (!b) { overview(n); return; }
    const st = status(b, n), staff = STAFF.filter(m => staffB(m) === b), ex = examsToday(b, n), posts = postsOn(b, n);
    const units = [...new Set(staff.map(m => clean(m.office)).filter(o => !/^\d/.test(o)))];
    const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    const list = (arr, f, max, more) => arr.slice(0, max).map(f).join('') + (arr.length > max ? `<div class="cm-more">و${arr.length - max} ${more}</div>` : '');
    $('#cm-card').innerHTML = `<div class="cm-card">
      <div class="cm-h"><span class="cm-no" style="--c:${color(st, b)}">${esc(b.id)}</span><div><h2>${esc(b.name)}</h2><small>${esc(KIND[b.kind][0])} · ${esc(U.DAYS[n.day] || '')} ${esc(n.clock)}${at ? ' (وقت مختار)' : ''}</small></div>
        <button type="button" class="btn-close" id="cm-x" aria-label="إغلاق"></button></div>
      ${staff.length ? `<div class="cm-lead">${staff.filter(m => lead(m) < 20).sort((x, y) => lead(x) - lead(y)).slice(0, 6).map(m => `<button type="button" data-p="${esc(m.id)}" title="${esc(m.name)} — ${esc(m.role)}">${face(m)}<small>${esc(m.role)}</small></button>`).join('')}</div>` : ''}
      ${(b.tt || []).length ? `<div class="cm-kpis"><div><b>${st.run.length}</b><span>محاضرة جارية</span></div><div><b>${st.soon.length}</b><span>تبدأ خلال 90 دقيقة</span></div>
        <div><b>${st.free.length}<small>/${st.rooms.length}</small></b><span>قاعة شاغرة</span></div><div><b>${st.today}</b><span>محاضرة اليوم</span></div></div>
        ${!teaching(n) ? '<div class="alert alert-secondary py-2 small mb-2">لا تدريس اليوم (عطلة أو خارج الفصل).</div>' : ''}
        ${st.run.length ? `<h3><i class="bi bi-broadcast"></i> جارية الآن</h3>${list(st.run.sort((x, y) => x.room.localeCompare(y.room, 'en', { numeric: true })), x => `<div class="cm-row"><span class="cm-room" dir="ltr">${esc(x.room)}</span>
          <span class="cm-t"><b>${esc(x.s.name)}</b><small>${esc(U.shortName(x.s.instructor))} · ش${esc(x.s.section)}</small></span><span class="cm-end">حتى <bdi dir="ltr">${esc(x.m.end)}</bdi></span></div>`, 8, 'محاضرات أخرى')}` : ''}
        ${st.soon.length ? `<h3><i class="bi bi-clock-history"></i> تبدأ قريباً</h3>${list(st.soon, x => `<div class="cm-row"><span class="cm-room" dir="ltr">${esc(x.room)}</span>
          <span class="cm-t"><b>${esc(x.s.name)}</b><small>${esc(U.shortName(x.s.instructor))}</small></span><span class="cm-end"><bdi dir="ltr">${esc(x.m.start)}</bdi></span></div>`, 6, 'أخرى')}` : ''}
        ${st.free.length && teaching(n) ? `<h3><i class="bi bi-door-open"></i> قاعات شاغرة</h3><div class="cm-free">${st.free.slice(0, 24).map(f => `<a href="room.html?q=${encodeURIComponent(f.r)}" dir="ltr">${esc(f.r)}<small>${f.until ? 'حتى ' + toTime(f.until) : 'بقية اليوم'}</small></a>`).join('')}</div>` : ''}` : ''}
      ${ex.length ? `<h3><i class="bi bi-clipboard-check"></i> امتحانات اليوم (${ex.length})</h3>${list(ex.sort((x, y) => x.from.localeCompare(y.from)), e => `<div class="cm-row"><span class="cm-room" dir="ltr">${esc(e.from)}</span><span class="cm-t"><b>${esc(e.name)}</b><small>${e.rooms.filter(r => roomB[clean(r.room)] === b).map(r => esc(r.room)).join('، ')}</small></span></div>`, 6, 'امتحانات أخرى')}` : ''}
      ${posts.length ? `<h3><i class="bi bi-megaphone"></i> على شاشة المبنى الآن</h3>${posts.slice(0, 4).map(p => `<div class="cm-post"><b>${esc(p.title || p.text)}</b><small>${esc(p.ownerName || '')}</small></div>`).join('')}` : ''}
      ${staff.length ? `<h3><i class="bi bi-person-lines-fill"></i> في المبنى: ${staff.length} من الكادر${units.length ? ' · ' + units.length + ' وحدات' : ''}</h3>
        ${units.length > 1 ? `<div class="cm-units"><button type="button" data-u="" class="${unitF ? '' : 'on'}">الكل</button>${units.map(u => `<button type="button" data-u="${esc(u)}" class="${u === unitF ? 'on' : ''}">${esc(u)} <small>${staff.filter(m => clean(m.office) === u).length}</small></button>`).join('')}</div>` : ''}
        <div class="cm-faces">${staff.filter(m => !unitF || clean(m.office) === unitF).sort((x, y) => lead(x) - lead(y)).slice(0, 60).map(tile).join('')}</div>` : ''}
      <div class="cm-links">${(b.tt || []).length ? `<a class="btn btn-sm btn-outline-secondary" href="room.html?bld=${encodeURIComponent(b.tt[0])}"><i class="bi bi-door-open"></i> قاعات المبنى</a>` : ''}
        ${b.screen ? `<a class="btn btn-sm btn-outline-secondary" href="screen.html?b=${encodeURIComponent(b.screen)}" target="_blank"><i class="bi bi-display"></i> شاشة المبنى</a>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cm-share"><i class="bi bi-link-45deg"></i> رابط هذا المبنى</button></div></div>`;
    $('#cm-x').onclick = () => open('');
    $('#cm-card').querySelectorAll('[data-u]').forEach(x => x.onclick = () => { unitF = x.dataset.u; card(); });
    $('#cm-card').querySelectorAll('[data-p]').forEach(x => x.onclick = () => openPerson(x.dataset.p, true));
    $('#cm-share').onclick = e => navigator.clipboard.writeText(SITE + 'campus.html?b=' + encodeURIComponent(b.id)).then(() => { e.currentTarget.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; });
  }
  // nothing chosen: the campus at a glance, busiest first
  function overview(n) {
    const rows = C.buildings.map(b => ({ b, st: status(b, n) }));
    const run = rows.reduce((a, r) => a + r.st.run.length, 0), free = rows.reduce((a, r) => a + r.st.free.length, 0);
    $('#cm-card').innerHTML = `<div class="cm-card"><div class="cm-kpis"><div><b>${run}</b><span>محاضرة جارية في الحرم</span></div><div><b>${free}</b><span>قاعة شاغرة</span></div>
        <div><b>${STAFF.filter(m => staffB(m)).length}</b><span>من الكادر على الخريطة</span></div></div>
      <h3><i class="bi bi-buildings"></i> المباني</h3><div class="cm-list">${rows.sort((x, y) => y.st.run.length - x.st.run.length || (parseInt(x.b.id) - parseInt(y.b.id))).map(({ b, st }) =>
        `<button type="button" data-b="${esc(b.id)}"><span class="cm-no sm" style="--c:${color(st, b)}">${esc(b.id)}</span><span>${esc(b.name)}</span>${st.run.length ? `<small>${st.run.length} جارية</small>` : ''}</button>`).join('')}</div>
      <p class="small text-muted mb-0 mt-2">اضغط على أي رقم في الخريطة، أو ابحث عن شخص أو قاعة أو مقرر.</p></div>`;
    $('#cm-card').querySelectorAll('[data-b]').forEach(x => x.onclick = () => open(x.dataset.b, true));
  }

  // ---------------------------------------------------------------- one search for everything
  function search() {
    const t = U.norm(q).trim(), n = now();
    const u = new URL(location.href); if (q) u.searchParams.set('q', q); else u.searchParams.delete('q'); history.replaceState(null, '', u);
    if (t.length < 2) { search.hits = []; $('#cm-res').innerHTML = ''; pins(); return; }
    const hit = [], has = s => U.norm(s).includes(t);
    C.buildings.forEach(b => { if (has(b.name) || b.id.toLowerCase() === t || (b.tt || []).some(has)) hit.push({ b, ic: 'bi-building', t: b.name, s: 'مبنى رقم ' + b.id }); });
    Object.entries(roomB).forEach(([r, b]) => { if (U.norm(r) === t || (t.length >= 3 && U.norm(r).startsWith(t))) hit.push({ b, ic: 'bi-door-open', t: 'قاعة ' + r, s: b.name }); });
    [...new Set(STAFF.map(m => clean(m.office)).filter(o => o && !/^\d/.test(o) && has(o)))].forEach(o => { const b = staffB({ office: o }); if (b) hit.push({ b, ic: 'bi-diagram-3', t: o, s: b.name }); });
    STAFF.forEach(m => { if (has(m.name) || has(m.name_en || '') || (m.office && U.norm(clean(m.office)) === t)) { const b = staffB(m); hit.push({ b, p: m, ic: 'bi-person', t: m.name, s: (m.job || '') + (b ? ' · ' + b.name : ' · مكانه غير محدد') + (m.office ? ' · ' + m.office : '') }); } });
    const secs = S.filter(s => U.norm(s.code) === t || (t.length >= 3 && (has(s.name) || has(s.instructor))));
    const seen = new Set();
    secs.forEach(s => { const b = byTT[s.building]; if (!b) return; const today = s.meetings.filter(m => inRoom(m) && m.day === n.day); const k = s.code + s.section;
      if (seen.has(k)) return; seen.add(k);
      hit.push({ b, ic: 'bi-journal-text', t: `${s.name} · ش${s.section}`, s: `${U.shortName(s.instructor)} · ${clean(s.room)} · ${b.name}${today.length ? ' · اليوم ' + today.map(m => m.start).join('، ') : ''}` }); });
    search.hits = hit.slice(0, 60);
    $('#cm-res').innerHTML = hit.length ? `<div class="cm-res">${hit.slice(0, 40).map((h, i) => `<button type="button" data-i="${i}" ${h.b || h.p ? '' : 'disabled'}>${h.p ? face(h.p) : `<i class="bi ${h.ic}"></i>`}<span><b>${esc(h.t)}</b><small>${esc(h.s)}</small></span>${h.b ? `<span class="cm-no sm">${esc(h.b.id)}</span>` : ''}</button>`).join('')}
      ${hit.length > 40 ? `<div class="cm-more">و${hit.length - 40} نتيجة أخرى؛ زد كلمات البحث</div>` : ''}</div>` : '<div class="cm-none">لا نتائج</div>';
    $('#cm-res').querySelectorAll('[data-i]').forEach(x => x.onclick = () => { const h = search.hits[+x.dataset.i]; $('#cm-res').innerHTML = ''; if (h.p) openPerson(h.p.id, true); else open(h.b.id, true); });
    pins();
  }

  // ---------------------------------------------------------------- full screen and the automatic tour
  // full screen: the map fills the screen and the panel floats beside it (or under it on a phone); where the browser
  // has no full screen for a page part (iPhone), the same layout fills the window
  function fullscreen() {
    const el = app.querySelector('.cm'), on = el.classList.contains('cm-full');
    if (on) { if (document.fullscreenElement) document.exitFullscreen(); else { el.classList.remove('cm-full'); fsIcon(); setTimeout(apply, 50); } return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => { el.classList.add('cm-full'); fsIcon(); setTimeout(apply, 50); });
    else { el.classList.add('cm-full'); fsIcon(); setTimeout(apply, 50); }
  }
  const fsIcon = () => { const on = app.querySelector('.cm').classList.contains('cm-full'); $('#cm-fs').innerHTML = `<i class="bi bi-${on ? 'fullscreen-exit' : 'fullscreen'}"></i>`; $('#cm-fs').title = on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'; };
  // the tour (for a lobby display): the teaching buildings one after another, busiest first, 12 seconds each
  function startTour() {
    const n = now(), list = C.buildings.filter(b => (b.tt || []).length).sort((x, y) => status(y, n).run.length - status(x, n).run.length);
    let i = 0; who = '';
    const step = () => { open(list[i % list.length].id, true); i++; };
    step(); tour = setInterval(step, 12000);
    $('#cm-tour').innerHTML = '<i class="bi bi-stop-circle"></i>'; $('#cm-tour').classList.add('on');
  }
  function stopTour() { clearInterval(tour); tour = null; $('#cm-tour').innerHTML = '<i class="bi bi-play-circle"></i>'; $('#cm-tour').classList.remove('on'); }

  // ---------------------------------------------------------------- pan and zoom
  function apply() {
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight, iw = w * view.s, ih = iw * C.height / C.width;
    view.x = Math.min(0, Math.max(w - iw, view.x)); view.y = iw * C.height / C.width < h ? (h - ih) / 2 : Math.min(0, Math.max(h - ih, view.y));
    if (iw < w) view.x = (w - iw) / 2;
    const st = $('#cm-stage'); st.style.width = iw + 'px'; st.style.transform = `translate(${view.x}px, ${view.y}px)`;
    m.style.setProperty('--pin', Math.max(0.75, Math.min(1.3, view.s * 0.9)));
  }
  function zoom(f, cx, cy) {
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight;
    if (!f) { view.s = 1; view.x = 0; view.y = 0; apply(); return; }
    cx = cx == null ? w / 2 : cx; cy = cy == null ? h / 2 : cy;
    const s = Math.max(1, Math.min(5, view.s * f)), k = s / view.s;
    view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s; apply();
  }
  function center(b) {
    if (!b) return;
    const m = $('#cm-map'), w = m.clientWidth, h = m.clientHeight;
    if (view.s < 2) view.s = 2.2;
    const iw = w * view.s, ih = iw * C.height / C.width;
    view.x = w / 2 - b.x * iw; view.y = h / 2 - b.y * ih; apply();
  }
  function panzoom() {
    const m = $('#cm-map'), ptr = new Map();
    let last = null, moved = 0, pinch = 0;
    m.querySelectorAll('[data-z]').forEach(x => x.onclick = () => zoom(+x.dataset.z));
    m.addEventListener('wheel', e => { e.preventDefault(); const r = m.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    m.addEventListener('pointerdown', e => { if (tour && !e.target.closest('#cm-tour')) stopTour(); if (e.target.closest('.cm-tools, .cm-time, .cm-pin')) return; ptr.set(e.pointerId, e); m.setPointerCapture(e.pointerId); last = e; moved = 0; });
    m.addEventListener('pointermove', e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.set(e.pointerId, e);
      if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = m.getBoundingClientRect();
        if (pinch) zoom(d / pinch, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); pinch = d; return; }
      view.x += e.clientX - last.clientX; view.y += e.clientY - last.clientY; moved += Math.abs(e.clientX - last.clientX) + Math.abs(e.clientY - last.clientY); last = e; apply();
    });
    const up = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0;
      if (moved < 4 && !e.target.closest('.cm-tools, .cm-time, .cm-pin')) {
        if (P.has('edit')) { const r = $('#cm-img').getBoundingClientRect(), x = ((e.clientX - r.left) / r.width).toFixed(4), y = ((e.clientY - r.top) / r.height).toFixed(4);
          navigator.clipboard && navigator.clipboard.writeText(`"x": ${x}, "y": ${y}`); $('#cm-res').innerHTML = `<div class="alert alert-info py-2" dir="ltr">"x": ${x}, "y": ${y} (copied)</div>`; } } };
    m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    m.addEventListener('dblclick', e => { const r = m.getBoundingClientRect(); zoom(1.6, e.clientX - r.left, e.clientY - r.top); });
    addEventListener('resize', apply);
    apply();
  }

  // ---------------------------------------------------------------- style and start
  document.head.insertAdjacentHTML('beforeend', `<style>
    .cm { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 1rem; align-items: start; }
    @media (max-width: 991.98px) { .cm { grid-template-columns: 1fr; } }
    .cm-map { position: relative; aspect-ratio: 1848 / 1080; max-height: 80vh; width: 100%; min-height: 300px; border-radius: 16px; overflow: hidden; background: #eef3f0; touch-action: none; cursor: grab; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); direction: ltr; }
    .cm-map:active { cursor: grabbing; }
    .cm-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .cm-stage img { display: block; width: 100%; height: auto; user-select: none; pointer-events: none; }
    #cm-pins { position: absolute; inset: 0; }
    .cm-pin { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); border: 3px solid #fff; background: var(--c); color: #fff; border-radius: 999px; min-width: 2.1rem; height: 2.1rem; padding: 0 .35rem;
      display: flex; align-items: center; gap: .2rem; justify-content: center; font-weight: 800; font-size: .85rem; box-shadow: 0 3px 10px rgba(0,0,0,.35); cursor: pointer; transition: transform .15s; }
    .cm-pin small { background: rgba(0,0,0,.28); border-radius: 999px; padding: 0 .3rem; font-size: .7rem; }
    .cm-pin:hover, .cm-pin.on { transform: translate(-50%, -50%) scale(calc(var(--pin, 1) * 1.25)); z-index: 3; }
    .cm-pin.on { outline: 4px solid #fbbf24; } .cm-pin.hit { animation: cmHit 1s ease-in-out infinite; z-index: 2; }
    @keyframes cmHit { 50% { box-shadow: 0 0 0 10px rgba(251,191,36,.55); } }
    .cm-gate { position: absolute; transform: translate(-50%, -50%) scale(var(--pin, 1)); background: #1e3a8a; color: #fff; font-size: .65rem; font-weight: 800; width: 1.3rem; height: 1.3rem; border-radius: 4px; display: grid; place-items: center; pointer-events: none; opacity: .85; }
    .cm-tools { position: absolute; top: .6rem; left: .6rem; display: grid; gap: .3rem; }
    .cm-tools button { width: 2.2rem; height: 2.2rem; border: 0; border-radius: 10px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
    .cm-time { position: absolute; bottom: .6rem; left: .6rem; right: .6rem; direction: rtl; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,.94); border-radius: 12px; padding: .4rem .6rem; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
    .cm-time select { width: auto; } .cm-time input[type=range] { flex: 1; min-width: 120px; accent-color: #901d23; } .cm-time b { font-variant-numeric: tabular-nums; min-width: 6.5rem; }
    .cm-heat { font-size: .85rem; display: flex; gap: .25rem; align-items: center; }
    .cm-key { position: absolute; top: .6rem; right: .6rem; direction: rtl; display: flex; gap: .6rem; background: rgba(255,255,255,.92); border-radius: 10px; padding: .25rem .6rem; font-size: .75rem; }
    .cm-key i { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; vertical-align: middle; }
    @media (max-width: 575.98px) { .cm-key { display: none; } .cm-map { aspect-ratio: 4 / 5; } }
    .cm-side { display: grid; gap: .6rem; }
    .cm-search { position: relative; } .cm-search i { position: absolute; inset-inline-start: .8rem; top: 50%; transform: translateY(-50%); color: #6b7280; }
    .cm-search input { width: 100%; border: 1px solid var(--bs-border-color); border-radius: 12px; padding: .6rem 2.3rem .6rem .8rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-res { display: grid; gap: .25rem; max-height: 300px; overflow: auto; }
    .cm-res button, .cm-list button { display: flex; gap: .55rem; align-items: center; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .4rem .6rem; width: 100%; }
    .cm-res button:hover, .cm-list button:hover { border-color: #901d23; } .cm-res button > span:first-of-type { flex: 1; min-width: 0; }
    .cm-res b, .cm-res small { display: block; } .cm-res small { color: var(--bs-secondary-color); font-size: .78rem; } .cm-res i { color: #901d23; }
    .cm-none, .cm-more { color: var(--bs-secondary-color); font-size: .85rem; padding: .3rem; }
    .cm-card { border: 1px solid var(--bs-border-color); border-radius: 14px; padding: .9rem; background: var(--bs-body-bg); }
    .cm-h { display: flex; gap: .7rem; align-items: center; margin-bottom: .6rem; } .cm-h div { flex: 1; } .cm-h h2 { font-size: 1.15rem; font-weight: 800; margin: 0; } .cm-h small { color: var(--bs-secondary-color); }
    .cm-no { background: var(--c, #9e1f27); color: #fff; font-weight: 800; border-radius: 999px; min-width: 2.4rem; height: 2.4rem; padding: 0 .4rem; display: inline-grid; place-items: center; flex: none; }
    .cm-no.sm { min-width: 1.8rem; height: 1.8rem; font-size: .8rem; }
    .cm-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: .4rem; margin-bottom: .6rem; }
    .cm-kpis div { background: var(--bs-tertiary-bg); border-radius: 10px; padding: .45rem; text-align: center; } .cm-kpis b { display: block; font-size: 1.35rem; color: #901d23; } .cm-kpis b small { font-size: .8rem; color: var(--bs-secondary-color); }
    .cm-kpis span { font-size: .72rem; color: var(--bs-secondary-color); }
    .cm-card h3 { font-size: .92rem; font-weight: 800; margin: .8rem 0 .35rem; } .cm-card h3 i { color: #901d23; }
    .cm-row { display: flex; gap: .5rem; align-items: center; padding: .3rem 0; border-bottom: 1px dashed var(--bs-border-color); }
    .cm-room { flex: none; background: var(--bs-tertiary-bg); border-radius: 8px; padding: .1rem .45rem; font-weight: 800; font-size: .85rem; min-width: 3.4rem; text-align: center; }
    .cm-t { flex: 1; min-width: 0; } .cm-t b { display: block; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cm-t small { color: var(--bs-secondary-color); font-size: .76rem; }
    .cm-end { flex: none; font-size: .78rem; color: var(--bs-secondary-color); }
    .cm-free { display: flex; flex-wrap: wrap; gap: .3rem; } .cm-free a { text-decoration: none; background: #ecfdf3; color: #166534; border-radius: 8px; padding: .15rem .45rem; font-weight: 800; font-size: .85rem; }
    .cm-free small { display: block; font-weight: 500; font-size: .68rem; }
    .cm-units { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .3rem; } .cm-units a { font-size: .8rem; border: 1px solid var(--bs-border-color); border-radius: 999px; padding: .1rem .55rem; text-decoration: none; }
    .cm-post { background: #fff8e6; border-radius: 8px; padding: .35rem .55rem; margin-bottom: .3rem; color: #3b2a00; } .cm-post small { display: block; color: #8a6d1f; }
    .cm-links { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; }
    .cm-face { width: 2.4rem; height: 2.4rem; border-radius: 50%; object-fit: cover; object-position: top; flex: none; background: #e5e7eb; box-shadow: 0 0 0 2px #fff; }
    .cm-face.xl { width: 5.5rem; height: 5.5rem; box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(0,0,0,.2); }
    .cm-ini { display: inline-grid; place-items: center; color: #901d23; font-weight: 800; font-size: .85rem; background: #f8e3e5; }
    .cm-faces { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: .4rem; max-height: 420px; overflow: auto; padding: .2rem; }
    .cm-tile { display: grid; justify-items: center; gap: .15rem; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 12px; padding: .45rem .25rem; text-align: center; }
    .cm-tile:hover { border-color: #901d23; } .cm-tile .cm-face { width: 3.2rem; height: 3.2rem; }
    .cm-tile b { font-size: .74rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cm-tile small { font-size: .66rem; color: #901d23; font-weight: 700; line-height: 1.2; }
    .cm-units button { font-size: .78rem; border: 1px solid var(--bs-border-color); border-radius: 999px; padding: .1rem .55rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
    .cm-units button.on { background: #901d23; color: #fff; border-color: #901d23; } .cm-units small { opacity: .7; }
    .cm-pp { display: flex; gap: .8rem; align-items: center; margin-bottom: .7rem; } .cm-pp > div { flex: 1; min-width: 0; } .cm-pp h2 { font-size: 1.1rem; font-weight: 800; margin: 0; }
    .cm-job { color: #901d23; font-weight: 700; font-size: .88rem; } .cm-pp small { color: var(--bs-secondary-color); }
    .cm-facts { display: grid; gap: .35rem; }
    .cm-facts > * { display: flex; gap: .6rem; align-items: center; text-align: start; border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); border-radius: 10px; padding: .45rem .6rem; text-decoration: none; width: 100%; }
    .cm-facts > button:hover { border-color: #901d23; } .cm-facts > .now { border-color: #16a34a; background: #f0fdf4; color: #14532d; }
    .cm-facts i { color: #901d23; font-size: 1.1rem; } .cm-facts span:first-of-type { flex: 1; min-width: 0; } .cm-facts small { display: block; color: var(--bs-secondary-color); font-size: .72rem; } .cm-facts b { display: block; font-size: .9rem; } .cm-facts em { font-style: normal; font-size: .78rem; color: var(--bs-secondary-color); }
    .cm-stack { position: absolute; top: -1.55rem; left: 50%; transform: translateX(-50%); display: flex; }
    .cm-stack .cm-face { width: 1.6rem; height: 1.6rem; margin-inline-start: -.45rem; box-shadow: 0 0 0 2px #fff; } .cm-stack .cm-ini { font-size: .55rem; }
    .cm-bub { position: absolute; transform: translate(-50%, -125%) scale(var(--pin, 1)); display: grid; justify-items: center; gap: .1rem; pointer-events: none; z-index: 4; }
    .cm-bub .cm-face { width: 3rem; height: 3rem; box-shadow: 0 0 0 3px #fbbf24, 0 4px 12px rgba(0,0,0,.35); }
    .cm-bub small { background: #111827; color: #fff; border-radius: 999px; padding: 0 .45rem; font-size: .66rem; font-weight: 700; white-space: nowrap; }
    .cm-bub.now .cm-face { box-shadow: 0 0 0 3px #16a34a, 0 4px 12px rgba(0,0,0,.35); } .cm-bub.now small { background: #16a34a; }
    .cm-tools button.on { background: #901d23; color: #fff; } .cm-fs-only { display: none; }
    .cm.cm-full { position: fixed; inset: 0; z-index: 2000; display: block; background: #0b1c22; }
    .cm.cm-full .cm-map { position: absolute; inset: 0 calc(min(400px, 36vw) + 1.2rem) 0 0; width: auto; aspect-ratio: auto; max-height: none; height: auto; border-radius: 0; }
    .cm.cm-full.cm-nopanel .cm-map { inset: 0; }
    .cm.cm-full .cm-side { position: absolute; top: .6rem; bottom: .6rem; right: .6rem; width: min(400px, 36vw); overflow: auto; z-index: 5; align-content: start;
      background: var(--bs-body-bg, #fff); color: var(--bs-body-color, #111); border-radius: 14px; padding: .6rem; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .cm.cm-full .cm-key { right: auto; left: 3.4rem; } .cm.cm-full .cm-fs-only { display: block; } .cm.cm-nopanel .cm-side { display: none; }
    .cm.cm-full .cm-faces { max-height: 300px; }
    @media (max-width: 767.98px) { .cm.cm-full .cm-map { inset: 0; } .cm.cm-full .cm-side { top: auto; bottom: 4.6rem; left: .5rem; right: .5rem; width: auto; max-height: 45%; } }
    .cm-lead { display: flex; gap: .45rem; overflow-x: auto; padding: .1rem .1rem .5rem; } .cm-lead:empty { display: none; }
    .cm-lead button { border: 0; background: none; display: grid; justify-items: center; gap: .1rem; padding: 0; color: inherit; min-width: 3.6rem; }
    .cm-lead .cm-face { width: 2.8rem; height: 2.8rem; box-shadow: 0 0 0 2px #901d23; } .cm-lead small { font-size: .62rem; color: #901d23; font-weight: 700; max-width: 4.2rem; line-height: 1.15; }
    .cm-list { display: grid; gap: .3rem; max-height: 420px; overflow: auto; } .cm-list button span:nth-child(2) { flex: 1; } .cm-list small { color: #901d23; font-weight: 700; }
  </style>`);
  Promise.all([U.getJSON('data/campus.json'), U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json').catch(() => null), U.getJSON('data/staff.json').catch(() => ({ members: [] })),
    U.getJSON('data/exam_schedule.json').catch(() => null), U.getJSON('data/screen_posts.json', true).catch(() => null)]).then(([c, tt, idx, st, ex, posts]) => {
    C = c; TT = tt; S = tt.sections; IDX = idx; STAFF = st.members || []; EX = ex && ex.exams && ex.exams.length ? ex : null; POSTS = posts;
    U.setDays(tt.days);
    U.updatedLine(tt.updated, 'المخطط من الموقع الرسمي للجامعة');
    ((idx && idx.instructors) || []).forEach(i => { INS[nameKey(i.name)] = i; });
    index(); shell(); draw();
    if (who && person(who)) openPerson(who, true);
    if (q) search();
    if (sel && B(sel)) center(B(sel));
    setInterval(() => { if (!at) draw(); }, 60000);
  }).catch(e => { app.innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
