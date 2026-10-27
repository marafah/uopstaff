/* Room occupancy (for planning): how full the teaching rooms are by day and half hour, by building and by room.
   Same rules as the room page: in-person meetings only (fully online and asynchronous meetings do not use a room),
   room 0 (virtual) left out, a class the portal lists twice (two degrees) counted once. Utilisation = occupied
   half hours / (days × half hours in the window). */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, toMin, toTime, live } = U;
  let TT, ROOMS;
  const P = new URLSearchParams(location.search);
  const st = { bld: P.get('bld') || '', win: P.get('win') === 'long' ? 'long' : 'day', sort: 'low', all: false, cell: null };
  const DAYS = ['ح', 'ن', 'ث', 'ر', 'خ'];  // the teaching week (Saturday sections are counted apart)
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const RAMP = ['#ffffff', '#fbe9ea', '#f2c4c7', '#e39297', '#c9575e', '#9e1f27', '#6b1015'];  // one hue, light → dark
  const shade = p => RAMP[p <= 0 ? 0 : p < 10 ? 1 : p < 25 ? 2 : p < 45 ? 3 : p < 65 ? 4 : p < 85 ? 5 : 6];
  const ink = p => p >= 45 ? '#fff' : '#1b1b1b';
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

  function build(sections) {
    const by = {}, twin = new Set();
    sections.forEach(s => {
      if (!s.room || s.room === '0') return;
      const k = clean(s.room);
      const tk = [k, s.code, s.section, s.activity, s.instructor, s.registered, s.capacity, JSON.stringify(s.meetings)].join('|');
      if (twin.has(tk)) return;
      twin.add(tk);
      const r = by[k] || (by[k] = { room: k, building: /^-+$/.test(s.building) ? 'مبنى غير محدد' : s.building, busy: new Set(), all: new Set(), sat: 0, secs: 0 });
      r.secs++;
      s.meetings.filter(m => live(m) && m.mode !== 'الكتروني كامل').forEach(m => {
        for (let t = toMin(m.start); t < toMin(m.end); t += 30) r.all.add(m.day + t);  // every taught half hour, any day or time
        if (m.day === 'س') { r.sat++; return; }
        for (let t = toMin(m.start); t < toMin(m.end); t += 30) r.busy.add(m.day + t);
      });
    });
    return Object.values(by).filter(r => r.busy.size || r.sat);
  }
  const windowOf = () => st.win === 'long' ? [8 * 60, 19 * 60] : [8 * 60, 16 * 60];

  function render() {
    const [from, to] = windowOf();
    const slots = []; for (let t = from; t < to; t += 30) slots.push(t);
    const rooms = ROOMS.filter(r => !st.bld || r.building === st.bld);
    const cap = DAYS.length * slots.length;
    rooms.forEach(r => { r.used = DAYS.reduce((a, d) => a + slots.filter(t => r.busy.has(d + t)).length, 0); r.util = pct(r.used, cap);
      r.byDay = DAYS.map(d => pct(slots.filter(t => r.busy.has(d + t)).length, slots.length)); });
    const n = rooms.length;
    const cell = (d, t) => rooms.filter(r => r.busy.has(d + t)).length;
    const grid = DAYS.map(d => slots.map(t => cell(d, t)));
    let peak = { v: -1 };
    DAYS.forEach((d, i) => slots.forEach((t, j) => { if (grid[i][j] > peak.v) peak = { v: grid[i][j], d, t }; }));
    const used = rooms.reduce((a, r) => a + r.used, 0), avg = pct(used, n * cap);
    const dayLoad = DAYS.map((d, i) => ({ d, p: pct(grid[i].reduce((a, x) => a + x, 0), n * slots.length) }));
    const busiest = dayLoad.slice().sort((a, b) => b.p - a.p)[0], quietest = dayLoad.slice().sort((a, b) => a.p - b.p)[0];
    const low = rooms.filter(r => r.util < 20).length;
    const blds = [...new Set(ROOMS.map(r => r.building))].sort((a, b) => (a === 'مبنى غير محدد') - (b === 'مبنى غير محدد') || a.localeCompare(b, 'ar'));
    const bstats = blds.filter(b => !st.bld || b === st.bld).map(b => {
      const rs = rooms.filter(r => r.building === b);
      let pk = 0; DAYS.forEach(d => slots.forEach(t => { pk = Math.max(pk, rs.filter(r => r.busy.has(d + t)).length); }));
      return { b, n: rs.length, util: pct(rs.reduce((a, r) => a + r.used, 0), rs.length * cap), peak: pct(pk, rs.length), peakN: pk };
    }).filter(x => x.n);
    const winTxt = `${toTime(from)}–${toTime(to)}، الأحد–الخميس`;
    const satRooms = rooms.filter(r => r.sat).length;

    const heat = `<div class="oc-heat-wrap"><table class="oc-heat"><thead><tr><th></th>${slots.map(t => `<th>${t % 60 ? '' : toTime(t).slice(0, 2)}</th>`).join('')}</tr></thead><tbody>
      ${DAYS.map((d, i) => `<tr><th>${esc(U.DAYS[d])}</th>${slots.map((t, j) => { const v = grid[i][j], p = pct(v, n), on = st.cell && st.cell.d === d && st.cell.t === t;
        return `<td class="${on ? 'on' : ''}" style="background:${shade(p)};color:${ink(p)}" data-d="${d}" data-t="${t}" title="${esc(`${U.DAYS[d]} ${toTime(t)}–${toTime(t + 30)}: ${v} من ${n} قاعة مشغولة (${p}%) · ${n - v} شاغرة`)}">${p}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="oc-key"><span>نسبة القاعات المشغولة</span><span>0%</span>${[0, 5, 15, 35, 55, 75, 90].map(p => `<i style="background:${shade(p)}"></i>`).join('')}<span>100%</span>
        <span class="ms-auto text-muted">انقر أي خانة لعرض القاعات الشاغرة في ذلك الوقت</span></div>`;

    const freeAt = st.cell ? (() => {
      const { d, t } = st.cell, fr = rooms.filter(r => !r.busy.has(d + t)), g = {};
      fr.forEach(r => (g[r.building] ||= []).push(r));
      return `<section class="card mb-3" id="oc-free"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-door-open"></i> القاعات الشاغرة ${esc(U.DAYS[d])} ${toTime(t)}–${toTime(t + 30)}</span>
        <span class="badge text-bg-success">${fr.length} من ${n}</span><button type="button" class="btn-close ms-auto" id="oc-free-x" aria-label="إغلاق"></button></div>
        <div class="card-body">${Object.keys(g).sort().map(b => `<div class="oc-fb"><b>${esc(b)}</b><span>${g[b].sort((x, y) => x.room.localeCompare(y.room, 'en', { numeric: true }))
          .map(r => `<a href="room.html?r=${encodeURIComponent(r.room)}">${esc(r.room)}</a>`).join('')}</span></div>`).join('') || '<p class="text-muted mb-0">لا قاعات شاغرة.</p>'}</div></section>`;
    })() : '';

    const list = rooms.slice().sort((a, b) => st.sort === 'low' ? a.util - b.util || a.room.localeCompare(b.room) : b.util - a.util || a.room.localeCompare(b.room));
    const shown = st.all ? list : list.slice(0, 15);
    const bar = p => `<span class="oc-bar"><i style="width:${p}%"></i></span><b>${p}%</b>`;

    $('#oc-app').innerHTML = `
      <div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div><label class="small fw-bold" for="oc-bld">المبنى</label><select class="form-select form-select-sm" id="oc-bld"><option value="">كل المباني</option>
          ${blds.map(b => `<option ${b === st.bld ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
        <div><span class="small fw-bold d-block">ساعات الدوام المحسوبة</span><div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn ${st.win === 'day' ? 'btn-maroon' : 'btn-outline-maroon'}" data-win="day">08:00–16:00</button>
          <button type="button" class="btn ${st.win === 'long' ? 'btn-maroon' : 'btn-outline-maroon'}" data-win="long">08:00–19:00</button></div></div>
        <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="oc-print"><i class="bi bi-printer"></i> طباعة / PDF</button></div></div>
      <div class="row g-3 mb-3">
        ${[[n, 'قاعة تدريس', 'bi-door-closed-fill'], [avg + '%', 'متوسط الإشغال', 'bi-pie-chart-fill'],
          [`${pct(peak.v, n)}%`, `الذروة: ${U.DAYS[peak.d] || ''} ${peak.t != null ? toTime(peak.t) : ''}`, 'bi-graph-up-arrow'],
          [low, 'قاعة إشغالها أقل من 20%', 'bi-arrow-down-circle-fill'],
          [`${busiest.p}%`, `أكثر الأيام: ${U.DAYS[busiest.d]}`, 'bi-calendar-check-fill'], [`${quietest.p}%`, `أقل الأيام: ${U.DAYS[quietest.d]}`, 'bi-calendar-x-fill']]
          .map(([v, l, i]) => `<div class="col-6 col-md-4 col-xl-2"><div class="stat-card"><div class="v">${v}</div><div class="l"><i class="bi ${i}"></i> ${esc(l)}</div></div></div>`).join('')}
      </div>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-grid-3x3-gap-fill"></i> الإشغال حسب اليوم والساعة <small class="text-muted">${esc(st.bld || 'كل المباني')} · ${n} قاعة · كل خانة نصف ساعة</small></div>
        <div class="card-body">${heat}</div></section>
      ${freeAt}
      <div class="row g-3 mb-3">
        <div class="col-xl-5"><section class="card h-100"><div class="card-header"><i class="bi bi-building"></i> حسب المبنى</div>
          <div class="table-responsive"><table class="table align-middle mb-0 tt-table oc-tbl"><thead><tr><th>المبنى</th><th class="text-center">قاعات</th><th>الإشغال</th><th class="text-center">الذروة</th></tr></thead>
          <tbody>${bstats.sort((a, b) => b.util - a.util).map(x => `<tr><td><a href="#" data-bld="${esc(x.b)}">${esc(x.b)}</a></td><td class="text-center">${x.n}</td><td class="oc-u">${bar(x.util)}</td>
            <td class="text-center" title="${x.peakN} من ${x.n} قاعة في أكثر نصف ساعة ازدحاماً">${x.peak}%</td></tr>`).join('')}</tbody></table></div></section></div>
        <div class="col-xl-7"><section class="card h-100"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-list-ol"></i> القاعات</span>
          <div class="btn-group btn-group-sm ms-auto" role="group"><button type="button" class="btn ${st.sort === 'low' ? 'btn-maroon' : 'btn-outline-maroon'}" data-sort="low">الأقل استخداماً</button>
            <button type="button" class="btn ${st.sort === 'high' ? 'btn-maroon' : 'btn-outline-maroon'}" data-sort="high">الأكثر استخداماً</button></div></div>
          <div class="table-responsive"><table class="table align-middle mb-0 tt-table oc-tbl"><thead><tr><th>القاعة</th><th>المبنى</th><th>الإشغال</th><th>حسب اليوم</th><th class="text-center" title="كل ساعات التدريس في القاعة أسبوعياً، في أي يوم ووقت">ساعات/أسبوع</th><th class="text-center">شعب</th></tr></thead>
          <tbody>${shown.map(r => `<tr><td><a href="room.html?r=${encodeURIComponent(r.room)}"><b dir="ltr">${esc(r.room)}</b></a></td><td class="small">${esc(r.building)}</td><td class="oc-u">${bar(r.util)}</td>
            <td><span class="oc-days">${r.byDay.map((p, i) => `<i title="${esc(U.DAYS[DAYS[i]])}: ${p}%" style="background:${shade(p)}"></i>`).join('')}</span></td>
            <td class="text-center">${r.all.size / 2}${r.used * 2 < r.all.size ? ` <small class="text-muted" title="منها ساعات خارج الفترة المحسوبة">(${(r.all.size - r.used) / 2} خارجها)</small>` : ''}</td><td class="text-center">${r.secs}</td></tr>`).join('')}</tbody></table></div>
          ${list.length > 15 ? `<div class="card-body py-2 text-center"><button type="button" class="btn btn-sm btn-link" id="oc-all">${st.all ? 'عرض أول 15 فقط' : `عرض كل القاعات (${list.length})`}</button></div>` : ''}</section></div>
      </div>
      <p class="small text-muted"><i class="bi bi-info-circle"></i> الإشغال = أنصاف الساعات المشغولة ÷ (5 أيام × أنصاف ساعات الدوام المحسوبة: ${esc(winTxt)}). تُحسب اللقاءات الوجاهية والمدمجة فقط؛
        اللقاءات الإلكترونية بالكامل وغير المتزامنة لا تشغل قاعة، والقاعة 0 (افتراضية) مستثناة، والشعبة المدرجة مرتين في البوابة (لدرجتين) تُحسب مرة واحدة.
        القاعات التي لا تظهر في الجدول الدراسي غير معروفة هنا.${satRooms ? ` لـ${satRooms} قاعة لقاءات يوم السبت لا تدخل في النسب.` : ''}</p>`;

    document.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => { st.win = b.dataset.win; st.cell = null; sync(); render(); }));
    document.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { st.sort = b.dataset.sort; render(); }));
    $('#oc-bld').addEventListener('change', e => { st.bld = e.target.value; st.cell = null; sync(); render(); });
    document.querySelectorAll('[data-bld]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); st.bld = a.dataset.bld; st.cell = null; sync(); render(); }));
    document.querySelectorAll('.oc-heat td').forEach(td => td.addEventListener('click', () => {
      const c = { d: td.dataset.d, t: +td.dataset.t };
      st.cell = st.cell && st.cell.d === c.d && st.cell.t === c.t ? null : c; render();
      const f = $('#oc-free'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    const x = $('#oc-free-x'); if (x) x.addEventListener('click', () => { st.cell = null; render(); });
    const all = $('#oc-all'); if (all) all.addEventListener('click', () => { st.all = !st.all; render(); });
    $('#oc-print').addEventListener('click', () => printIt({ n, avg, peak, low, busiest, quietest, bstats, list, grid, slots, winTxt }));
  }
  function sync() {
    const u = new URL(location.href);
    st.bld ? u.searchParams.set('bld', st.bld) : u.searchParams.delete('bld');
    st.win === 'long' ? u.searchParams.set('win', 'long') : u.searchParams.delete('win');
    history.replaceState(null, '', u);
  }
  // printout: page 1 = figures, heatmap, buildings and busiest rooms; then the underused rooms (the full list is on screen)
  function printIt(o) {
    const cellsTd = (vals, f) => vals.map(f).join('');
    const heat = `<table class="ph"><thead><tr><th></th>${o.slots.map(t => `<th>${t % 60 ? '' : toTime(t).slice(0, 2)}</th>`).join('')}</tr></thead><tbody>
      ${DAYS.map((d, i) => `<tr><th>${esc(U.DAYS[d])}</th>${cellsTd(o.slots, (t, j) => { const p = pct(o.grid[i][j], o.n); return `<td style="background:${shade(p)};color:${ink(p)}">${p}</td>`; })}</tr>`).join('')}</tbody></table>`;
    const tbl = (head, rows, cls) => `<table class="pt ${cls || ''}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    const days = r => r.byDay.map(p => `<td class="n" style="background:${shade(p)};color:${ink(p)}">${p}</td>`).join('');
    const low = o.list.filter(r => r.util < 20).sort((a, b) => a.util - b.util || a.room.localeCompare(b.room, 'en', { numeric: true }));
    const top = o.list.slice().sort((a, b) => b.util - a.util).slice(0, 10);
    const dayHead = DAYS.map(d => U.DAYS[d]);
    printReport({
      title: 'إشغال القاعات', subtitle: `${st.bld || 'كل المباني'} · ${o.winTxt}`, orientation: 'landscape', source: TT.term,
      stats: [['قاعة تدريس', o.n], ['متوسط الإشغال', o.avg + '%'], [`الذروة (${U.DAYS[o.peak.d]} ${toTime(o.peak.t)})`, pct(o.peak.v, o.n) + '%'], ['إشغال أقل من 20%', o.low],
        [`أكثر الأيام: ${U.DAYS[o.busiest.d]}`, o.busiest.p + '%'], [`أقل الأيام: ${U.DAYS[o.quietest.d]}`, o.quietest.p + '%']],
      raw: `<style>
          .ph { table-layout: fixed; margin-top: 4px; } .ph th, .ph td { border: 1px solid #d9d2c3; text-align: center; font-size: 8pt; padding: 2px 1px; }
          .ph thead th { background: #091b22 !important; color: #fff !important; } .ph tbody th { background: #f1ede4 !important; width: 64px; font-size: 9pt; color: #000; }
          .pk { display: flex; align-items: center; gap: 3px; font-size: 8pt; color: #333; margin-top: 4px; } .pk i { display: inline-block; width: 18px; height: 9px; border: 1px solid #d9d2c3; }
          .p2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
          table.pt { margin-top: 4px; } table.pt th { font-size: 8.5pt; padding: 3px 4px; } table.pt td { font-size: 8.5pt; padding: 1px 5px; border: 1px solid #e6e0d2; line-height: 1.35; }
          .page h3.sec { margin: 8px 0 3px; } .page .stats { margin: 8px 0 2px; } .page .stats div { padding: 3px 10px; } .page .stats b { font-size: 12pt; }
          table.pt td.n { text-align: center; font-variant-numeric: tabular-nums; } table.pt td b { font-weight: 800; }
          .brk { break-before: page; }
        </style>
        <h3 class="sec">نسبة القاعات المشغولة حسب اليوم ونصف الساعة</h3>${heat}
        <div class="pk">0%${[0, 5, 15, 35, 55, 75, 90].map(p => `<i style="background:${shade(p)}"></i>`).join('')}100%</div>
        <div class="p2">
          <div><h3 class="sec">حسب المبنى</h3>${tbl(['المبنى', 'القاعات', 'الإشغال', 'الذروة'], o.bstats.slice().sort((a, b) => b.util - a.util)
            .map(x => `<tr><td>${esc(x.b)}</td><td class="n">${x.n}</td><td class="n"><b>${x.util}%</b></td><td class="n">${x.peak}%</td></tr>`))}</div>
          <div><h3 class="sec">الأكثر استخداماً (أعلى 10)</h3>${tbl(['القاعة', 'المبنى', 'الإشغال', ...dayHead], top
            .map(r => `<tr><td><b>${esc(r.room)}</b></td><td>${esc(r.building)}</td><td class="n"><b>${r.util}%</b></td>${days(r)}</tr>`))}</div>
        </div>
        <h3 class="sec brk">القاعات الأقل استخداماً: إشغال أقل من 20% (${low.length} قاعة)</h3>
        ${tbl(['القاعة', 'المبنى', 'الإشغال', ...dayHead, 'ساعات/أسبوع (كل الأوقات)', 'الشعب'], low
          .map(r => `<tr><td><b>${esc(r.room)}</b></td><td>${esc(r.building)}</td><td class="n"><b>${r.util}%</b></td>${days(r)}<td class="n">${r.all.size / 2}</td><td class="n">${r.secs}</td></tr>`))}`,
      note: 'الإشغال = أنصاف الساعات المشغولة ÷ (5 أيام × أنصاف ساعات الدوام المحسوبة). اللقاءات الوجاهية والمدمجة فقط؛ القاعة 0 مستثناة؛ الشعبة المدرجة لدرجتين تُحسب مرة واحدة. القائمة الكاملة للقاعات في الصفحة على الموقع.',
    });
  }

  U.getJSON('data/timetable.json').then(tt => {
    TT = tt;
    U.setDays(tt.days);
    ROOMS = build(tt.sections);
    $('#foot-count').textContent = `${ROOMS.length} قاعة · ${tt.term}`;
    U.updatedLine(tt.updated, 'يُراجَع كل ساعة');
    render();
    $('#pg-q').addEventListener('keydown', e => { if (e.key === 'Enter') location.href = 'room.html?q=' + encodeURIComponent(e.target.value); });
  }).catch(e => { $('#oc-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
