/* Room page: what is in a room now and next, its weekly timetable and free times, and a printable door sign with a
   QR code to this page. ?r=<room>; without it: all rooms by building, with their state now. Amman time, refreshed
   every minute; ?at=2026-10-27T10:30 to look at another moment. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let TT, S, IDX, INS = {};
  const P = new URLSearchParams(location.search);
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const FREE_FROM = 8 * 60, FREE_TO = 16 * 60;
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();  // source codes carry stray marks
  const inRoom = m => live(m) && m.mode !== 'الكتروني كامل';  // fully online meetings do not use the room

  function teaching(now) {
    const T = IDX.teaching;
    if (!T) return { ok: true };
    if (now.iso < T.start) return { ok: false, why: `يبدأ التدريس في ${U.numDate(T.start)}` };
    if (now.iso > T.end) return { ok: false, why: `انتهى التدريس لهذا الفصل (${U.numDate(T.end)})` };
    if (T.holidays.includes(now.iso)) return { ok: false, why: 'اليوم عطلة رسمية حسب التقويم الجامعي' };
    if (now.day === 'ج') return { ok: false, why: 'يوم الجمعة' };
    return { ok: true };
  }
  // all rooms: { key, room, building, secs, meets: [{s, m, a, b}] }
  // the portal sometimes lists one class twice (same section, instructor, times and seats under two degrees): shown once
  function rooms() {
    const by = {}, twin = {};
    S.forEach(s => {
      if (s.room === '0' || !s.room) return;
      const k = clean(s.room);
      const r = by[k] || (by[k] = { key: k, room: k, building: /^-+$/.test(s.building) ? 'مبنى غير محدد' : s.building, secs: [], meets: [] });
      const tk = [k, s.code, s.section, s.activity, s.instructor, s.registered, s.capacity, JSON.stringify(s.meetings)].join('|');
      if (twin[tk]) { twin[tk].degrees.push(s.degree); return; }
      s = twin[tk] = { ...s, degrees: [s.degree] };
      r.secs.push(s);
      s.meetings.filter(inRoom).forEach(m => r.meets.push({ s, m, a: toMin(m.start), b: toMin(m.end) }));
    });
    return by;
  }
  function stateOf(R, now, T) {
    if (!T.ok) return { kind: 'off', text: T.why };
    const today = R.meets.filter(x => x.m.day === now.day).sort((x, y) => x.a - y.a);
    const cur = today.filter(x => x.a <= now.min && now.min < x.b);
    if (cur.length) {
      let end = Math.max(...cur.map(x => x.b));  // back-to-back lectures: busy until the room is actually free
      for (let more = true; more;) { more = false; today.forEach(x => { if (x.a <= end && x.b > end) { end = x.b; more = true; } }); }
      return { kind: 'busy', cur, until: end, next: today.find(x => x.a >= end) };
    }
    const next = today.find(x => x.a > now.min);
    return { kind: 'free', next, until: next ? next.a : null };
  }
  const weekHours = R => { const set = new Set(); R.meets.forEach(x => { for (let t = x.a; t < x.b; t += 30) set.add(x.m.day + t); }); return set.size / 2; };
  const instLink = name => INS[name] ? `<a href="instructor.html?id=${INS[name]}">${esc(U.shortName(name))}</a>` : esc(U.shortName(name));

  // ---------------------------------------------------------------- all rooms
  function listView() {
    const all = Object.values(rooms());
    const now = U.amman(P.get('at')), T = teaching(now);
    const q = norm(P.get('q') || ''), bld = P.get('bld') || '';
    const last = b => b === 'مبنى غير محدد';
    const byName = (a, b) => last(a) - last(b) || a.localeCompare(b, 'ar');
    const blds = [...new Set(all.map(r => r.building))].sort(byName);
    const list = all.filter(r => (!bld || r.building === bld) && (!q || norm(r.room + ' ' + r.building).includes(q)))
      .sort((a, b) => a.room.localeCompare(b.room, 'en', { numeric: true }));
    const groups = {};
    list.forEach(r => (groups[r.building] ||= []).push(r));
    const freeNow = list.filter(r => stateOf(r, now, T).kind === 'free').length;
    $('#pg-title').textContent = 'صفحة القاعة';
    $('#room-app').innerHTML = `
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div class="flex-grow-1"><label class="small fw-bold" for="r-q">القاعة</label>
          <input class="form-control form-control-sm" id="r-q" value="${esc(P.get('q') || '')}" placeholder="رقم القاعة، مثلاً 7419…" inputmode="search"></div>
        <div><label class="small fw-bold" for="r-bld">المبنى</label><select class="form-select form-select-sm" id="r-bld"><option value="">كل المباني</option>
          ${blds.map(b => `<option ${b === bld ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
        <span class="small text-muted ms-auto">${list.length} قاعة${T.ok ? ` · <b class="text-success">${freeNow} شاغرة الآن</b> (${now.clock})` : ` · ${esc(T.why)}`}</span></div></div>
      ${Object.keys(groups).sort(byName).map(b => `<section class="mb-4"><h2 class="rm-bh"><i class="bi bi-building"></i> ${esc(b)} <span>${groups[b].length}</span></h2>
        <div class="rm-grid">${groups[b].map(r => { const st = stateOf(r, now, T);
          return `<a class="rm-pick ${st.kind}" href="?r=${encodeURIComponent(r.key)}"><b dir="ltr">${esc(r.room)}</b>
            <span class="rm-st">${st.kind === 'busy' ? `<i class="bi bi-circle-fill"></i> مشغولة حتى ${toTime(st.until)}` : st.kind === 'free' ? `<i class="bi bi-circle-fill"></i> شاغرة${st.until ? ' حتى ' + toTime(st.until) : ''}` : '—'}</span>
            <small>${r.secs.length} شعبة · ${weekHours(r)} ساعة أسبوعياً</small></a>`; }).join('')}</div></section>`).join('')
        || '<p class="text-muted">لا توجد قاعة تطابق البحث.</p>'}`;
    const go = ch => { const n = new URLSearchParams(location.search); Object.entries(ch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); history.replaceState(null, '', '?' + n); P.delete('q'); P.delete('bld'); n.forEach((v, k) => P.set(k, v)); listView(); };
    let t;
    $('#r-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { go({ q: e.target.value }); const i = $('#r-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#r-bld').addEventListener('change', e => go({ bld: e.target.value }));
  }

  // ---------------------------------------------------------------- one room
  function roomView(R) {
    const courses = [...new Set(R.secs.map(s => s.code))];
    const color = code => U.PALETTE[courses.indexOf(code) % U.PALETTE.length];
    const days = U.WEEK.filter(d => (d !== 'ج' && d !== 'س') || R.meets.some(x => x.m.day === d));
    const items = R.meets.map(({ s, m }) => { const [c, bg] = color(s.code); return { day: m.day, start: m.start, end: m.end, title: `${s.code} · ش${s.section}`,
      line: s.name, sub: U.shortName(s.instructor), style: `--cc:${c};--cbg:${bg}`, cls: 'cc', icon: m.mode === 'وجاهي' ? '' : (U.MODE[m.mode] || {}).icon,
      tip: `${s.code} ${s.name} – شعبة ${s.section}\n${s.instructor}\n${U.DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}`, s, m }; });
    const students = R.secs.reduce((a, s) => a + s.registered, 0);
    const hours = weekHours(R);
    const url = SITE + 'room.html?r=' + encodeURIComponent(R.key);
    document.title = `قاعة ${R.room} – جامعة البترا`;
    $('#pg-title').textContent = `قاعة ${R.room}`;
    $('#pg-sub').textContent = `${R.building} · ${IDX.term || TT.term}`;
    $('#pg-actions').innerHTML = `<div class="d-flex flex-wrap gap-2 justify-content-end">
        <button type="button" class="btn btn-update" id="r-door"><i class="bi bi-qr-code"></i> بطاقة الباب (QR)</button></div>
      <small class="update-when" id="pg-updated">—</small>`;
    U.updatedLine(TT.updated, 'يُراجَع كل ساعة');

    const freeRuns = d => {
      const taken = new Set();
      R.meets.filter(x => x.m.day === d).forEach(x => { for (let t = x.a; t < x.b; t += 30) taken.add(t); });
      const runs = [];
      for (let t = FREE_FROM; t < FREE_TO; t += 30) { if (taken.has(t)) continue; const l = runs[runs.length - 1]; if (l && l[1] === t) l[1] = t + 30; else runs.push([t, t + 30]); }
      return runs.filter(r => r[1] - r[0] >= 60);
    };
    const rowsByCourse = [];
    R.secs.slice().sort((a, b) => a.code.localeCompare(b.code) || +a.section - +b.section).forEach(s => {
      let g = rowsByCourse.find(x => x.code === s.code + s.activity); if (!g) rowsByCourse.push(g = { code: s.code + s.activity, list: [] }); g.list.push(s); });
    const when = s => s.meetings.map(m => `<span class="tt-day ${(U.MODE[m.mode] || {}).cls || ''}" title="${esc(m.mode)}"><i class="bi ${(U.MODE[m.mode] || {}).icon || 'bi-dot'}"></i>${esc(U.DAYS[m.day])}</span>`).join('');
    const times = s => [...new Set(s.meetings.map(m => m.start + '–' + m.end))].map(k => `<bdi dir="ltr" class="tt-time">${k}</bdi>`).join(' ');

    $('#room-app').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-xl-5"><section class="card h-100 rm-now" id="rm-now"></section></div>
        <div class="col-xl-7 d-flex flex-column gap-3">
          <div class="ins-kpis">
            <div class="stat-card"><div class="v">${R.secs.length}</div><div class="l"><i class="bi bi-collection-fill"></i> شعبة</div></div>
            <div class="stat-card"><div class="v">${courses.length}</div><div class="l"><i class="bi bi-journal-bookmark-fill"></i> مقرر</div></div>
            <div class="stat-card"><div class="v">${hours}</div><div class="l"><i class="bi bi-clock-fill"></i> ساعة إشغال أسبوعياً</div></div>
            <div class="stat-card"><div class="v">${students}</div><div class="l"><i class="bi bi-people-fill"></i> طالباً مسجلاً</div></div></div>
          <section class="card flex-grow-1"><div class="card-header"><i class="bi bi-door-open"></i> متى تكون القاعة شاغرة؟ <small class="text-muted">بين 08:00 و16:00، ساعة أو أكثر</small></div>
            <div class="card-body py-2">${days.map(d => { const runs = freeRuns(d);
              return `<div class="ins-free"><b>${esc(U.DAYS[d])}</b><span>${runs.length ? runs.map(r => `<em dir="ltr">${toTime(r[0])}–${toTime(r[1])}</em>`).join('') : '<i class="text-muted">مشغولة معظم اليوم</i>'}</span></div>`; }).join('')}</div></section>
        </div>
      </div>
      <section class="card mb-3"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-calendar-week"></i> الجدول الأسبوعي للقاعة</span>
        <span class="ins-legend ms-auto">${courses.map(c => { const s = R.secs.find(x => x.code === c), [col, bg] = color(c); return `<span style="--cc:${col};--cbg:${bg}"><i></i><b dir="ltr">${esc(c)}</b> ${esc(s.name)}</span>`; }).join('')}</span></div>
        <div class="card-body">${items.length ? U.weekGrid(items, { days, px: 64, cls: 'wk-ins', compact: true }) : '<p class="text-muted mb-0">لا محاضرات بوقت ثابت في هذه القاعة.</p>'}</div></section>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-list-ul"></i> الشعب في هذه القاعة <small class="text-muted">${R.secs.length} شعبة في ${courses.length} مقرر</small></div>
        <div class="table-responsive"><table class="table align-middle mb-0 tt-table ins-table"><thead><tr><th>المقرر</th><th class="text-center">الشعبة</th><th>المدرس</th><th>الأيام والوقت</th><th>المسجلون</th></tr></thead>
        <tbody>${rowsByCourse.map(g => { const s0 = g.list[0], [c, bg] = color(s0.code); return g.list.map((s, i) => `<tr class="${i ? '' : 'ins-first'}" style="--cc:${c};--cbg:${bg}">
          ${i ? '' : `<td class="ins-course" rowspan="${g.list.length}"><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)} <span class="tt-act ${s.activity === 'عملي' ? 'lab' : ''}">${esc(s.activity)}</span>${s.degrees.length > 1 ? ` <span class="badge text-bg-light border">${esc(s.degrees.join(' + '))}</span>` : s.degree !== 'البكالوريوس' ? ` <span class="badge text-bg-warning">${esc(s.degree)}</span>` : ''}<small>${esc(s.department)}</small></td>`}
          <td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td><td>${instLink(s.instructor)}</td>
          <td class="ins-when"><div class="tt-when">${times(s)} <span class="tt-days">${when(s)}</span></div></td>
          <td class="text-nowrap"><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></td></tr>`).join(''); }).join('')}</tbody></table></div></section>`;

    const paint = () => {
      const now = U.amman(P.get('at')), T = teaching(now), st = stateOf(R, now, T);
      const today = R.meets.filter(x => x.m.day === now.day).sort((x, y) => x.a - y.a);
      const row = x => { const done = T.ok && x.b <= now.min, on = T.ok && x.a <= now.min && now.min < x.b;
        return `<li class="${done ? 'done' : on ? 'on' : ''}"><bdi dir="ltr">${x.m.start}–${x.m.end}</bdi><span><b dir="ltr">${esc(x.s.code)}</b> ${esc(x.s.name)}<small>${instLink(x.s.instructor)} · ش${esc(x.s.section)}</small></span>
          <em>${on ? 'جارية' : done ? 'انتهت' : 'قادمة'}</em></li>`; };
      const big = st.kind === 'busy'
        ? `<div class="rm-state busy"><i class="bi bi-record-circle-fill"></i><div><b>مشغولة الآن</b><span>${st.until > Math.max(...st.cur.map(x => x.b)) ? 'محاضرات متتالية ' : ''}حتى ${toTime(st.until)}${st.next ? ` · ثم شاغرة حتى ${st.next.m.start}` : ' · ثم شاغرة بقية اليوم'}</span></div></div>
           ${st.cur.map(x => `<div class="rm-cur"><b dir="ltr">${esc(x.s.code)}</b> ${esc(x.s.name)}<small>${instLink(x.s.instructor)} · شعبة ${esc(x.s.section)} · ${x.s.registered} طالباً</small>
             <span class="rm-bar"><i style="width:${Math.round(100 * (now.min - x.a) / (x.b - x.a))}%"></i></span><small>تنتهي بعد ${U.mins(x.b - now.min)}</small></div>`).join('')}`
        : st.kind === 'free'
          ? `<div class="rm-state free"><i class="bi bi-check-circle-fill"></i><div><b>شاغرة الآن</b><span>${st.next ? `حتى ${toTime(st.until)} (بعد ${U.mins(st.until - now.min)}) · المحاضرة التالية: ${esc(st.next.s.code)} ${esc(st.next.s.name)}` : 'لا محاضرات أخرى اليوم'}</span></div></div>`
          : `<div class="rm-state off"><i class="bi bi-moon-stars-fill"></i><div><b>لا محاضرات الآن</b><span>${esc(st.text)}</span></div></div>`;
      $('#rm-now').innerHTML = `<div class="card-header d-flex justify-content-between"><span><i class="bi bi-broadcast"></i> الآن في القاعة</span><span class="rm-clock" dir="ltr">${esc(U.DAYS[now.day] || '')} ${now.clock}</span></div>
        <div class="card-body">${big}
          <h3 class="rm-h">محاضرات اليوم${T.ok ? '' : ' (حسب الجدول الأسبوعي)'}</h3>
          ${today.length ? `<ol class="rm-today">${today.map(row).join('')}</ol>` : '<p class="text-muted small mb-0">لا محاضرات في هذه القاعة اليوم.</p>'}</div>`;
    };
    paint();
    setInterval(paint, 60000);
    $('#r-door').addEventListener('click', () => doorSign(R, items, days, courses, color, url));
  }

  // ---------------------------------------------------------------- door sign: A4 portrait, one page
  function doorSign(R, items, days, courses, color, url) {
    const q = qrcode(0, 'M');
    q.addData(unescape(encodeURIComponent(url)));
    q.make();
    const svg = q.createSvgTag({ cellSize: 6, margin: 1, scalable: true }).replace(/fill="black"/g, 'fill="#000"');
    const ds = days.filter(d => items.some(x => x.day === d) || (d !== 'س' && d !== 'ج'));
    const slots = [...new Set(items.map(x => x.start + '–' + x.end))].sort((a, b) => toMin(a.slice(0, 5)) - toMin(b.slice(0, 5)) || toMin(a.slice(6)) - toMin(b.slice(6)));
    const entry = x => `<div class="pw-e" style="${x.style}"><b dir="ltr">${esc(x.s.code)} / ش${esc(x.s.section)}</b>${x.icon ? ' <i class="bi ' + x.icon + '"></i>' : ''}<span>${esc(x.s.name)}</span><small>${esc(U.shortName(x.s.instructor))}</small></div>`;
    const week = `<table class="pw"><thead><tr><th class="pw-t">الوقت</th>${ds.map(d => `<th>${esc(U.DAYS[d])}</th>`).join('')}</tr></thead><tbody>
      ${slots.map(k => `<tr><th class="pw-t" dir="ltr">${k}</th>${ds.map(d => `<td>${items.filter(x => x.day === d && x.start + '–' + x.end === k).map(entry).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const CSS = `<style>
      .ds-top { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: center; margin: 12px 0 6px; }
      .ds-room { border: 3px solid #091b22; border-radius: 14px; padding: 10px 18px; }
      .ds-room small { display: block; font-size: 12pt; color: #333; } .ds-room b { display: block; font-size: 64pt; line-height: 1; color: #000; letter-spacing: 1px; }
      .ds-room span { display: block; font-size: 14pt; font-weight: 800; color: #901d23; margin-top: 4px; }
      .ds-qr { text-align: center; border: 3px solid #091b22; border-radius: 14px; padding: 8px; width: 210px; }
      .ds-qr svg { width: 180px; height: 180px; } .ds-qr b { display: block; font-size: 11pt; color: #000; } .ds-qr small { display: block; font-size: 8pt; color: #333; direction: ltr; word-break: break-all; }
      table.pw { margin-top: 6px; table-layout: fixed; }
      table.pw thead th { background: #091b22 !important; color: #fff !important; text-align: center; font-size: 11pt; padding: 6px; }
      table.pw th.pw-t { width: 84px; }
      table.pw tbody th.pw-t { background: #f1ede4 !important; color: #000; font-size: 10pt; font-weight: 800; text-align: center; border: 1px solid #c9c2b2; white-space: nowrap; }
      table.pw td { padding: 4px; border: 1px solid #c9c2b2; vertical-align: top; background: #fff !important; }
      .pw-e { border: 1px solid #b9b2a2; border-inline-start: 6px solid var(--cc); border-radius: 6px; padding: 3px 6px; background: var(--cbg); line-height: 1.3; }
      .pw-e + .pw-e { margin-top: 4px; }
      .pw-e b { font-size: 10pt; color: #000; } .pw-e i { font-size: 9pt; color: #000; }
      .pw-e span { display: block; font-size: 9pt; font-weight: 700; color: #111; } .pw-e small { display: block; font-size: 8.5pt; color: #222; font-weight: 700; }
      h3.sec { font-size: 12.5pt; margin: 12px 0 4px; } .pn { font-size: 9pt; color: #333; margin: 6px 0 0; }
    </style>`;
    printReport({
      title: `قاعة ${R.room}`, subtitle: R.building, orientation: 'portrait', fit: true, source: IDX.term || TT.term,
      css: ['https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css'],
      raw: `${CSS}<div class="ds-top">
          <div class="ds-room"><small>القاعة</small><b dir="ltr">${esc(R.room)}</b><span>${esc(R.building)}</span></div>
          <div class="ds-qr">${svg}<b>امسح الرمز</b>للمحاضرات الآن والجدول المحدَّث<small>${esc(url.replace(/^https?:\/\//, ''))}</small></div>
        </div>
        <h3 class="sec">الجدول الأسبوعي للقاعة</h3>
        ${items.length ? week : '<p>لا محاضرات بوقت ثابت في هذه القاعة.</p>'}
        <p class="pn">الجدول حسب بوابة الجامعة وقت الطباعة؛ امسح الرمز لأي تغيير لاحق.</p>`,
    });
  }

  // ---------------------------------------------------------------- start
  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json')]).then(([tt, idx]) => {
    TT = tt; S = tt.sections; IDX = idx;
    IDX.term = IDX.term || tt.term;
    idx.instructors.forEach(i => { INS[i.name] = i.id; });
    U.setDays(tt.days);
    const all = rooms();
    $('#foot-count').textContent = `${Object.keys(all).length} قاعة · ${tt.term}`;
    U.updatedLine(tt.updated, 'يُراجَع كل ساعة');
    const key = clean(P.get('r') || '');
    if (key && all[key]) roomView(all[key]);
    else {
      if (key) P.set('q', key);  // unknown room: show the list filtered by what was asked
      listView();
    }
    const top = $('#pg-q');
    top.addEventListener('keydown', e => { if (e.key === 'Enter') location.href = 'room.html?q=' + encodeURIComponent(top.value); });
  }).catch(e => { $('#room-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
