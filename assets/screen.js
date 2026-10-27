/* Building screen for lobby displays: lectures running now and starting soon in one building, its free rooms,
   and upcoming calendar dates, in large type. Updates every minute, re-reads the data every 15 minutes and reloads
   itself every 6 hours (so site updates reach screens left on for weeks). Long lists turn pages every 12 seconds.
   ?b=<building>; without it: choose a building. ?at=2026-11-03T10:30 shows another moment (for checking). */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, toMin, toTime, live } = U;
  const P = new URLSearchParams(location.search);
  const B = P.get('b') || '';
  let TT, S, IDX, CAL, page = 0;
  const SOON = 90;  // minutes ahead shown as "starting soon"
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const clean = r => String(r || '').replace(/[ً-ْ​-‏]/g, '').trim();
  const inRoom = m => live(m) && m.mode !== 'الكتروني كامل';

  function teaching(now) {
    const T = IDX.teaching;
    if (!T) return { ok: true };
    if (now.iso < T.start) return { ok: false, why: `يبدأ التدريس ${U.numDate(T.start)}` };
    if (now.iso > T.end) return { ok: false, why: 'انتهى التدريس لهذا الفصل' };
    if (T.holidays.includes(now.iso)) return { ok: false, why: 'عطلة رسمية حسب التقويم الجامعي' };
    if (now.day === 'ج') return { ok: false, why: 'يوم الجمعة' };
    return { ok: true };
  }
  // the building's classes, a class listed twice by the portal (two degrees) only once
  function classes(b) {
    const seen = new Set(), out = [];
    S.forEach(s => {
      if (s.building !== b || !s.room || s.room === '0') return;
      const k = [clean(s.room), s.code, s.section, s.activity, s.instructor, JSON.stringify(s.meetings)].join('|');
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s);
    });
    return out;
  }

  // ---------------------------------------------------------------- choose a building
  function chooser() {
    const blds = [...new Set(S.map(s => s.building).filter(b => b && !/^-+$/.test(b)))].sort((a, b) => a.localeCompare(b, 'ar'));
    const now = U.amman(P.get('at'));
    $('#scr-app').innerHTML = `
      <div class="card mb-3"><div class="card-body d-flex gap-3 align-items-start">
        <i class="bi bi-display text-maroon fs-2"></i>
        <div class="small"><b class="d-block mb-1">للعرض على شاشة في مدخل المبنى</b>
          افتح رابط المبنى على متصفح الشاشة (أو جهاز صغير موصول بها) ثم اضغط <kbd>F11</kbd> لملء الشاشة. تتحدّث الشاشة تلقائياً كل دقيقة،
          وتقرأ أي تغيير في الجدول كل 15 دقيقة، ولا تحتاج أي تدخّل بعد ذلك. القوائم الطويلة تتقلّب صفحاتها كل 12 ثانية.</div></div></div>
      <div class="scr-pick">${blds.map(b => {
        const cs = classes(b), rooms = new Set(cs.map(s => clean(s.room))).size;
        const today = cs.reduce((a, s) => a + s.meetings.filter(m => inRoom(m) && m.day === now.day).length, 0);
        const url = `screen.html?b=${encodeURIComponent(b)}`;
        return `<div class="scr-b"><b><i class="bi bi-building"></i> ${esc(b)}</b><small>${rooms} قاعة · ${today} محاضرة اليوم</small>
          <div class="d-flex gap-2 mt-2"><a class="btn btn-sm btn-maroon" href="${url}"><i class="bi bi-display"></i> افتح الشاشة</a>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${esc(SITE + url)}"><i class="bi bi-link-45deg"></i> نسخ الرابط</button></div></div>`;
      }).join('')}</div>`;
    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.copy).then(() => { b.innerHTML = '<i class="bi bi-check2"></i> تم النسخ'; })));
  }

  // ---------------------------------------------------------------- the screen
  function screen() {
    document.body.classList.add('scr-on');
    document.title = `${B} – شاشة المبنى`;
    const q = qrcode(0, 'M');
    q.addData(SITE + 'room.html?bld=' + encodeURIComponent(B));
    q.make();
    const qr = q.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    document.body.insertAdjacentHTML('beforeend', `<div class="scr" id="scr">
      <header class="scr-top"><img src="assets/logo.png" alt=""><div class="scr-t"><small>جامعة البترا</small><h1>${esc(B)}</h1></div>
        <div class="scr-clock"><b id="scr-time">--:--</b><span id="scr-date"></span></div></header>
      <main class="scr-main" id="scr-main"></main>
      <footer class="scr-foot"><div class="scr-tick" id="scr-tick"></div><div class="scr-qr">${qr}<span>امسح الرمز<br>لجدول كل قاعة</span></div></footer></div>`);
    paint();
    setInterval(paint, 60000);
    setInterval(() => { page++; paint(true); }, 12000);
    setInterval(() => Promise.all([U.getJSON('data/timetable.json', true), U.getJSON('data/calendar.json', true)])
      .then(([t, c]) => { TT = t; S = t.sections; CAL = c; paint(); }).catch(() => {}), 15 * 60000);
    setTimeout(() => location.reload(), 6 * 3600 * 1000);
  }
  function paint(flip) {
    const now = U.amman(P.get('at')), T = teaching(now);
    $('#scr-time').textContent = now.clock;
    $('#scr-date').textContent = `${U.DAYS[now.day] || ''} ${U.numDate(now.iso)}`;
    const cs = classes(B);
    const rooms = [...new Set(cs.map(s => clean(s.room)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const today = cs.flatMap(s => s.meetings.filter(m => inRoom(m) && m.day === now.day).map(m => ({ s, m, a: toMin(m.start), b: toMin(m.end), room: clean(s.room) })));
    const running = T.ok ? today.filter(x => x.a <= now.min && now.min < x.b).sort((x, y) => x.room.localeCompare(y.room, 'en', { numeric: true })) : [];
    const soon = T.ok ? today.filter(x => x.a > now.min && x.a <= now.min + SOON).sort((x, y) => x.a - y.a || x.room.localeCompare(y.room)) : [];
    const free = T.ok ? rooms.filter(r => !running.some(x => x.room === r)).map(r => {
      const nx = today.filter(x => x.room === r && x.a > now.min).sort((x, y) => x.a - y.a)[0];
      return { r, until: nx ? nx.a : null };
    }) : [];
    // long lists: show one page at a time, turning every 12 seconds
    const pages = (list, per) => { const n = Math.max(1, Math.ceil(list.length / per)); const p = page % n; return { items: list.slice(p * per, p * per + per), p, n }; };
    const dots = (p, n) => n > 1 ? `<span class="scr-dots">${Array.from({ length: n }, (_, i) => `<i class="${i === p ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const R = pages(running, 5), N = pages(soon, 6), F = pages(free, 18);
    const left = x => Math.max(0, x.b - now.min);
    if (!T.ok) {
      $('#scr-main').innerHTML = `<div class="scr-off"><i class="bi bi-moon-stars-fill"></i><b>لا محاضرات اليوم</b><span>${esc(T.why)}</span></div>`;
    } else if (!flip || R.n > 1 || N.n > 1 || F.n > 1) {
      $('#scr-main').innerHTML = `
        <section class="scr-col now"><h2><i class="bi bi-broadcast"></i> جارية الآن <span>${running.length}</span>${dots(R.p, R.n)}</h2>
          ${R.items.map(x => `<div class="scr-card"><div class="scr-room" dir="ltr">${esc(x.room)}</div><div class="scr-body"><b>${esc(x.s.name)}</b>
            <span><bdi dir="ltr">${esc(x.s.code)}</bdi> · ش${esc(x.s.section)} · ${esc(U.shortName(x.s.instructor))}</span>
            <i class="scr-bar"><em style="width:${Math.round(100 * (now.min - x.a) / (x.b - x.a))}%"></em></i></div>
            <div class="scr-end"><b dir="ltr">${x.m.end}</b><small>بعد ${U.mins(left(x))}</small></div></div>`).join('') || '<p class="scr-none">لا محاضرات جارية الآن</p>'}</section>
        <section class="scr-col soon"><h2><i class="bi bi-clock-history"></i> تبدأ قريباً <span>${soon.length}</span>${dots(N.p, N.n)}</h2>
          ${N.items.map(x => `<div class="scr-row"><b dir="ltr">${x.m.start}</b><div class="scr-room sm" dir="ltr">${esc(x.room)}</div>
            <div class="scr-body"><b>${esc(x.s.name)}</b><span>${esc(U.shortName(x.s.instructor))} · ش${esc(x.s.section)}</span></div></div>`).join('') || `<p class="scr-none">لا محاضرات خلال ${SOON} دقيقة</p>`}</section>
        <section class="scr-col free"><h2><i class="bi bi-door-open"></i> قاعات شاغرة الآن <span>${free.length}</span>${dots(F.p, F.n)}</h2>
          <div class="scr-free">${F.items.map(x => `<div><b dir="ltr">${esc(x.r)}</b><small>${x.until ? 'حتى ' + toTime(x.until) : 'بقية اليوم'}</small></div>`).join('') || '<p class="scr-none">كل القاعات مشغولة</p>'}</div></section>`;
    }
    // ticker: upcoming dates of the academic calendar
    const end = new Date(now.iso); end.setDate(end.getDate() + 21);
    const endIso = end.toISOString().slice(0, 10);
    const ev = (CAL ? CAL.semesters : []).flatMap(s => s.events).filter(e => e.end >= now.iso && e.start <= endIso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
    $('#scr-tick').innerHTML = ev.length ? `<b><i class="bi bi-calendar-event"></i> قريباً</b>${ev.map(e => `<span><bdi>${e.start === e.end ? U.numDate(e.start) : `${U.numDate(e.start)} – ${U.numDate(e.end)}`}</bdi> ${esc(e.title)}</span>`).join('')}`
      : `<b><i class="bi bi-info-circle"></i></b><span>آخر تحديث للجدول ${U.ago(TT.updated)} · المصدر: بوابة الجامعة</span>`;
  }

  // ---------------------------------------------------------------- start
  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json'), U.getJSON('data/calendar.json')]).then(([tt, idx, cal]) => {
    TT = tt; S = tt.sections; IDX = idx; CAL = cal;
    U.setDays(tt.days);
    $('#foot-count').textContent = `${tt.term}`;
    U.updatedLine(tt.updated, 'للشاشات في مداخل المباني');
    if (B && S.some(s => s.building === B)) screen(); else chooser();
  }).catch(e => { $('#scr-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
