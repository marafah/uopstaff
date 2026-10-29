/* Admissions and Registration screen (screen.html?b=registration): for the display in the Admissions and Registration
   hall. Answers what students queue to ask: which registration period is open and until when, the next dates, which
   sections are filling or full, where seats are still free, what changed in the timetable today, and how to build a
   timetable without clashes (QR codes to the site's tools). Everything comes from the site's own data (the university
   calendar, the timetable from the university portal and its registration history), refreshed every 15 minutes; the
   clock every minute; the middle panel turns every 15 seconds. ?at=2026-11-03T10:30 shows another moment. */
(function () {
  'use strict';
  window.UOP_REG = function (ctx) {
    const U = window.UOP, { $, esc } = U;
    const P = new URLSearchParams(location.search);
    const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    let TT = ctx.tt, CAL = ctx.cal, HIST = null, CHG = null, slide = 0, shown = [];
    const DAY = 864e5;
    const say = U.count;
    const days = n => n <= 0 ? 'اليوم' : n === 1 ? 'غداً' : say(n, 'يوم', 'يومين', 'أيام', 'يوماً');
    const dm = iso => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
    const MONTH = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
    const longDate = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTH[+m - 1]} ${y}`; };
    const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);   // whole days from a to b
    const tidy = t => String(t || '').replace(/\s*(للفصل الدراسي|للعام الجامعي)?\s*\d{4}\/\d{4}\s*$/, '').replace(/لطلبة البكالوريوس والماجستير/, '').trim();
    const CAT = { registration: ['bi-pencil-square', 'التسجيل'], exams: ['bi-journal-check', 'الامتحانات'], results: ['bi-award', 'النتائج'],
      holiday: ['bi-sun', 'عطلة'], teaching: ['bi-easel', 'التدريس'], graduate: ['bi-mortarboard', 'الدراسات العليا'] };

    // ---------------------------------------------------------------- styles (only this screen uses them)
    document.head.insertAdjacentHTML('beforeend', `<style>
      .rg .scr-main { grid-template-columns: 1.25fr 1.35fr .85fr; }
      .rg-k { font-size: .82em; letter-spacing: .04em; color: #fbbf24; font-weight: 800; }
      .rg-now { background: linear-gradient(135deg, #8f1c23 0%, #5c1116 100%); border: 0; }
      .rg-now h2 i { color: #fde68a; }
      .rg-phase { display: grid; gap: .55em; }
      .rg-ph { background: rgba(0,0,0,.18); border-radius: 14px; padding: .65em .85em; }
      .rg-ph b { display: block; font-size: 1.35em; line-height: 1.25; }
      .rg-ph .rg-cd { display: flex; align-items: baseline; gap: .45em; margin-top: .25em; color: #fde68a; }
      .rg-ph .rg-cd strong { font-size: 2.3em; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; }
      .rg-ph .rg-cd span { font-size: 1em; }
      .rg-ph small { color: #f3d9da; font-size: .85em; }
      .rg-prog { height: .45em; background: rgba(255,255,255,.18); border-radius: 999px; overflow: hidden; margin-top: .45em; }
      .rg-prog em { display: block; height: 100%; background: #fbbf24; border-radius: 999px; }
      .rg-quiet { color: #f3d9da; font-size: 1.1em; }
      .rg-next { display: grid; gap: .45em; }
      .rg-ev { display: grid; grid-template-columns: 4.3em 1fr auto; gap: .7em; align-items: center; background: rgba(255,255,255,.05); border-radius: 12px; padding: .45em .7em; }
      .rg-ev .rg-d { text-align: center; background: rgba(255,255,255,.1); border-radius: 10px; padding: .15em 0; line-height: 1.15; }
      .rg-ev .rg-d b { display: block; font-size: 1.35em; font-weight: 800; font-variant-numeric: tabular-nums; }
      .rg-ev .rg-d small { font-size: .7em; color: #c9d4da; }
      .rg-ev .rg-t { min-width: 0; } .rg-ev .rg-t b { display: block; font-size: 1em; line-height: 1.3; }
      .rg-ev .rg-t small { color: #9fb0b8; font-size: .78em; }
      .rg-ev .rg-in { font-size: .85em; color: #fde68a; white-space: nowrap; font-weight: 700; }
      .rg-ev.reg { border-inline-start: 5px solid #ef4444; } .rg-ev.exams { border-inline-start: 5px solid #60a5fa; } .rg-ev.holiday { border-inline-start: 5px solid #4ade80; }
      .rg-ev.results { border-inline-start: 5px solid #c084fc; } .rg-ev.teaching, .rg-ev.graduate { border-inline-start: 5px solid #94a3b8; }
      .rg-slide { display: flex; flex-direction: column; gap: .5em; min-height: 0; animation: rgIn .6s ease; }
      @keyframes rgIn { from { opacity: 0; transform: translateY(.4em); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .rg-slide { animation: none; } }
      .rg-sub { color: #9fb0b8; font-size: .85em; margin-top: -.3em; }
      .rg-sec { display: grid; grid-template-columns: 1fr auto; gap: .2em .8em; background: rgba(255,255,255,.05); border-radius: 12px; padding: .5em .75em; }
      .rg-sec b { font-size: 1.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rg-sec span { color: #c9d4da; font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rg-sec .rg-n { grid-row: span 2; align-self: center; text-align: center; font-variant-numeric: tabular-nums; }
      .rg-sec .rg-n strong { display: block; font-size: 1.45em; font-weight: 800; line-height: 1; }
      .rg-sec .rg-n small { font-size: .7em; color: #c9d4da; }
      .rg-sec i.rg-bar { grid-column: 1 / -1; display: block; height: .35em; background: rgba(255,255,255,.12); border-radius: 999px; overflow: hidden; }
      .rg-sec i.rg-bar em { display: block; height: 100%; border-radius: 999px; }
      .rg-full { color: #fca5a5; } .rg-hot { color: #fde68a; } .rg-ok { color: #86efac; }
      .rg-fac { display: grid; grid-template-columns: 1fr auto auto; gap: .2em .9em; align-items: center; background: rgba(255,255,255,.05); border-radius: 12px; padding: .45em .75em; }
      .rg-fac b { font-size: 1.02em; } .rg-fac span { font-variant-numeric: tabular-nums; text-align: center; }
      .rg-fac span strong { display: block; font-size: 1.3em; font-weight: 800; color: #86efac; line-height: 1; } .rg-fac span small { font-size: .7em; color: #c9d4da; }
      .rg-chg { display: grid; grid-template-columns: auto 1fr; gap: .2em .7em; background: rgba(255,255,255,.05); border-radius: 12px; padding: .45em .75em; align-items: center; }
      .rg-chg .rg-ic { grid-row: span 2; font-size: 1.4em; }
      .rg-chg b { font-size: .98em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .rg-chg span { font-size: .8em; color: #c9d4da; }
      .rg-chg em { font-style: normal; color: #fde68a; font-weight: 700; }
      .rg-help { background: rgba(255,255,255,.07); }
      .rg-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: .45em; counter-reset: s; }
      .rg-steps li { display: grid; grid-template-columns: 1.9em 1fr; gap: .55em; align-items: center; font-size: .95em; line-height: 1.3; counter-increment: s; }
      .rg-steps li::before { content: counter(s); width: 1.9em; height: 1.9em; border-radius: 50%; background: #9e1f27; display: grid; place-items: center; font-weight: 800; }
      .rg-qrs { display: grid; grid-template-columns: 1fr 1fr; gap: .6em; margin-top: auto; }
      .rg-qr { background: #fff; color: #091b22; border-radius: 12px; padding: .5em; text-align: center; }
      .rg-qr svg { width: 100%; height: auto; display: block; }
      .rg-qr b { display: block; font-size: .85em; margin-top: .25em; line-height: 1.2; } .rg-qr small { font-size: .68em; color: #4b5a61; }
      .rg-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: .45em; }
      .rg-tile { background: rgba(255,255,255,.06); border-radius: 12px; padding: .45em .3em; text-align: center; }
      .rg-tile strong { display: block; font-size: 1.45em; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
      .rg-tile small { font-size: .72em; color: #c9d4da; }
      .rg-foot { flex: 1; font-size: .9em; color: #c9d4da; display: flex; flex-wrap: wrap; gap: .3em 1.5em; }
      .rg-foot b { color: #fbbf24; }
      @media (max-aspect-ratio: 1/1) { .rg .scr-main { grid-template-columns: 1fr; } }
    </style>`);

    // ---------------------------------------------------------------- data views
    const uniq = () => { const seen = new Set(); return TT.sections.filter(s => { const k = U.sectionKey(s); if (seen.has(k)) return false; seen.add(k); return true; }); };
    function calendarNow(now) {
      const ev = (CAL ? CAL.semesters : []).flatMap(s => s.events);
      const active = ev.filter(e => e.start <= now.iso && e.end >= now.iso && e.start !== e.end && ['registration', 'exams'].includes(e.category))
        .sort((a, b) => a.end.localeCompare(b.end));
      const todayOnes = ev.filter(e => e.start === now.iso && e.end === now.iso && e.category !== 'graduate');
      const next = ev.filter(e => e.start > now.iso && e.category !== 'graduate').sort((a, b) => a.start.localeCompare(b.start));
      return { active, todayOnes, next };
    }
    // registered seats at a past moment from the registration history (the series keep a point only when a value changes)
    function regAt(series, tIso) {
      if (!series) return null;
      const t = Date.parse(tIso); let v = null;
      for (const [i, reg] of series) { if (Date.parse(HIST.times[i]) <= t) v = reg; else break; }
      return v;
    }
    function sectionsData() {
      const S = uniq().filter(s => s.capacity >= 5);
      const open = S.filter(s => s.status === 'مفتوحة');
      const ratio = s => s.registered / s.capacity;
      const filling = open.filter(s => ratio(s) >= 0.8 && s.registered < s.capacity).sort((a, b) => ratio(b) - ratio(a) || b.registered - a.registered);
      const full = S.filter(s => s.registered >= s.capacity).length;
      const free = open.reduce((a, s) => a + Math.max(0, s.capacity - s.registered), 0);
      const fac = {};
      open.forEach(s => { const f = s.faculty || 'أخرى', o = fac[f] || (fac[f] = { f, n: 0, seats: 0 }); const left = Math.max(0, s.capacity - s.registered); if (left) { o.n++; o.seats += left; } });
      let rising = [];
      if (HIST && HIST.series) {
        const since = new Date(Date.now() - DAY).toISOString();
        rising = S.map(s => { const ser = HIST.series[U.sectionKey(s)], before = regAt(ser, since); return { s, d: before == null ? 0 : s.registered - before }; })
          .filter(x => x.d > 0).sort((a, b) => b.d - a.d);
      }
      return { S, open, filling, full, free, fac: Object.values(fac).filter(x => x.n).sort((a, b) => b.seats - a.seats), rising,
        registered: S.reduce((a, s) => a + (s.registered || 0), 0) };
    }
    function changesToday() {
      if (!CHG || !CHG.events) return [];
      const since = Date.now() - DAY;
      return CHG.events.filter(e => e.kind === 'section' && Date.parse(e.at) >= since);
    }

    // ---------------------------------------------------------------- panels
    const bar = (v, col) => `<i class="rg-bar"><em style="width:${Math.min(100, Math.round(100 * v))}%;background:${col}"></em></i>`;
    const secLine = (s, right) => `<div class="rg-sec"><b>${esc(s.name)}</b>${right}<span><bdi dir="ltr">${esc(s.code)}</bdi> · شعبة ${esc(s.section)} · ${esc(U.shortName(s.instructor) || '')}${s.time ? '' : ''}</span>`;
    function slides(D, now) {
      const list = [];
      if (D.filling.length) list.push(['bi-fire', 'شعب على وشك الامتلاء', 'سجّل الآن قبل أن تُغلق: الأعلى امتلاءً من الشعب المفتوحة',
        D.filling.slice(0, 7).map(s => { const r = s.registered / s.capacity, left = s.capacity - s.registered;
          return secLine(s, `<div class="rg-n"><strong class="rg-hot">${left}</strong><small>${left === 1 ? 'مقعد باقٍ' : 'مقاعد باقية'}</small></div>`) + bar(r, r >= .95 ? '#ef4444' : '#f59e0b') + '</div>'; }).join('')]);
      if (D.rising.length) list.push(['bi-graph-up-arrow', 'الأسرع امتلاءً خلال 24 ساعة', 'الشعب التي سُجّل فيها أكبر عدد من الطلبة منذ أمس',
        D.rising.slice(0, 7).map(x => { const s = x.s, r = s.registered / s.capacity;
          return secLine(s, `<div class="rg-n"><strong class="rg-hot">+${x.d}</strong><small>${s.registered}/${s.capacity}</small></div>`) + bar(r, r >= 1 ? '#ef4444' : '#38bdf8') + '</div>'; }).join('')]);
      if (D.fac.length) list.push(['bi-door-open', 'أين ما زالت المقاعد متاحة؟', `${R(D.free)} مقعداً متاحاً في الشعب المفتوحة، حسب الكلية`,
        D.fac.slice(0, 8).map(x => `<div class="rg-fac"><b>${esc(x.f)}</b><span><strong>${R(x.seats)}</strong><small>مقعداً</small></span><span><strong style="color:#fff">${x.n}</strong><small>شعبة</small></span></div>`).join('')]);
      const ch = changesToday();
      if (ch.length) {
        const pick = e => { const st = (e.fields || []).find(f => f[0] === 'الحالة');
          if (e.op === 'add') return ['bi-plus-circle-fill', '#4ade80', 'شعبة جديدة'];
          if (e.op === 'remove') return ['bi-x-circle-fill', '#f87171', 'أُلغيت الشعبة'];
          if (st) return st[2] === 'مفتوحة' ? ['bi-unlock-fill', '#4ade80', 'فُتحت للتسجيل'] : ['bi-lock-fill', '#f87171', 'أُغلقت'];
          return ['bi-arrow-repeat', '#fbbf24', (e.fields || []).map(f => `${f[0]}: ${f[2] || '—'}`).join(' · ')]; };
        list.push(['bi-lightning-charge-fill', 'تغييرات الجدول اليوم', `${say(ch.length, 'تغيير', 'تغييران', 'تغييرات', 'تغييراً')} خلال آخر 24 ساعة`,
          ch.slice(0, 7).map(e => { const [ic, col, what] = pick(e);
            return `<div class="rg-chg"><i class="bi ${ic} rg-ic" style="color:${col}"></i><b>${esc(e.title)} · ش${esc(e.section)}</b><span><em>${esc(what)}</em> · ${esc(e.faculty || '')}</span></div>`; }).join('')]);
      }
      // exam periods coming up within six weeks
      const ex = (CAL ? CAL.semesters : []).flatMap(s => s.events).filter(e => e.category === 'exams' && e.end >= now.iso && diff(now.iso, e.start) <= 42)
        .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
      if (ex.length) list.push(['bi-journal-check', 'الامتحانات القادمة', 'حسب التقويم الجامعي', ex.map(e => evRow(e, now)).join('')]);
      return list;
    }
    const R = n => U.count ? Number(n).toLocaleString('en-US') : n;
    function evRow(e, now) {
      const on = e.start <= now.iso, d = diff(now.iso, on ? e.end : e.start);
      const cls = e.category === 'registration' ? 'reg' : e.category;
      return `<div class="rg-ev ${cls}"><div class="rg-d"><b>${dm(e.start)}</b><small>${esc(e.day || '')}</small></div>
        <div class="rg-t"><b>${esc(tidy(e.title))}</b><small>${e.start === e.end ? longDate(e.start) : `${longDate(e.start)} – ${longDate(e.end)}`}</small></div>
        <span class="rg-in">${on ? (d <= 0 ? 'ينتهي اليوم' : 'ينتهي بعد ' + days(d)) : (d === 0 ? 'اليوم' : d === 1 ? 'غداً' : 'بعد ' + days(d))}</span></div>`;
    }

    // drop the items that do not fit whole in their column: never a card cut at the bottom of the screen
    function trim(sel) {
      const box = document.querySelector(sel); if (!box) return;
      const col = box.closest('.scr-col'), bottom = col.getBoundingClientRect().bottom - parseFloat(getComputedStyle(col).paddingBottom);
      [...box.children].forEach(el => { if (el.getBoundingClientRect().bottom > bottom + 1) el.remove(); });
    }
    function paint() {
      const now = U.amman(P.get('at'));
      $('#scr-time').textContent = now.clock;
      $('#scr-date').textContent = `${U.DAYS ? (U.DAYS[now.day] || '') : ''} ${longDate(now.iso)}`;
      const C = calendarNow(now), D = sectionsData();
      // the period now open, with a countdown
      const ph = C.active.slice(0, 2).map(e => {
        const left = diff(now.iso, e.end), all = Math.max(1, diff(e.start, e.end) + 1), done = Math.min(1, (diff(e.start, now.iso) + 1) / all);
        return `<div class="rg-ph"><span class="rg-k"><i class="bi ${(CAT[e.category] || CAT.registration)[0]}"></i> مفتوح الآن</span><b>${esc(tidy(e.title))}</b>
          <div class="rg-cd">${left <= 0 ? '<strong>اليوم</strong><span>آخر يوم</span>' : `<span>ينتهي بعد</span><strong>${left}</strong><span>${left === 1 ? 'يوم' : left === 2 ? 'يومين' : left <= 10 ? 'أيام' : 'يوماً'}</span>`}</div>
          <small>حتى ${longDate(e.end)}</small><div class="rg-prog"><em style="width:${Math.round(done * 100)}%"></em></div></div>`; }).join('');
      const today = C.todayOnes.map(e => `<div class="rg-ph"><span class="rg-k"><i class="bi bi-bell-fill"></i> اليوم</span><b>${esc(tidy(e.title))}</b></div>`).join('');
      const nextReg = C.next.find(e => e.category === 'registration');
      const nr = !C.active.length && nextReg ? (() => { const d = diff(now.iso, nextReg.start);
        return `<div class="rg-ph"><span class="rg-k"><i class="bi bi-hourglass-split"></i> موعد التسجيل القادم</span><b>${esc(tidy(nextReg.title))}</b>
          <div class="rg-cd"><span>بعد</span><strong>${d}</strong><span>${d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? 'أيام' : 'يوماً'}</span></div><small>${longDate(nextReg.start)}</small></div>`; })() : '';
      const nextList = C.next.filter(e => !C.active.includes(e)).slice(0, 5).map(e => evRow(e, now)).join('');

      const SL = slides(D, now);
      shown = SL;
      const k = SL.length ? slide % SL.length : 0, cur = SL[k];
      const dots = SL.length > 1 ? `<span class="scr-dots">${SL.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</span>` : '';

      $('#scr-main').innerHTML = `
        <section class="scr-col rg-now"><h2><i class="bi bi-calendar2-check"></i> مواعيد التسجيل</h2>
          <div class="rg-phase">${ph}${today}${nr}${!ph && !today && !nr ? '<p class="rg-quiet">لا فترة تسجيل مفتوحة الآن</p>' : ''}</div>
          <h2 style="font-size:1.05em;margin-top:.4em"><i class="bi bi-calendar-event"></i> القادم في التقويم الجامعي</h2>
          <div class="rg-next">${nextList || '<p class="rg-quiet">لا مواعيد قادمة في التقويم</p>'}</div></section>
        <section class="scr-col">${cur ? `<h2><i class="bi ${cur[0]}"></i> ${esc(cur[1])}${dots}</h2><div class="rg-sub">${esc(cur[2])}</div><div class="rg-slide">${cur[3]}</div>`
          : '<h2><i class="bi bi-info-circle"></i> الشعب</h2><p class="scr-none">لا بيانات تسجيل حالياً</p>'}</section>
        <section class="scr-col rg-help"><h2><i class="bi bi-phone"></i> سجّل بلا تعارض</h2>
          <div class="rg-tiles"><div class="rg-tile"><strong>${R(D.open.length)}</strong><small>شعبة مفتوحة</small></div>
            <div class="rg-tile"><strong class="rg-ok">${R(D.free)}</strong><small>مقعداً متاحاً</small></div>
            <div class="rg-tile"><strong class="rg-full">${R(D.full)}</strong><small>شعبة ممتلئة</small></div></div>
          <ol class="rg-steps"><li>راجع خطتك الدراسية والمواد المطلوبة منك</li><li>امسح الرمز واختر شعبك في «مخطط جدولي» فيتحقق من التعارض</li>
            <li>سجّل الشعب نفسها عبر بوابة الطالب</li><li>راجع جدولك النهائي وأكمل إجراءات الدفع</li></ol>
          <div class="rg-qrs">${QR.planner}${QR.timetable}</div></section>`;
      trim('.rg-slide'); trim('.rg-next');
      $('#scr-tick').innerHTML = `<div class="rg-foot"><span><b>${esc(TT.term)}</b></span><span>آخر تحديث للجدول من بوابة الجامعة ${esc(U.ago(TT.updated))}</span>
        <span>${R(D.registered)} تسجيلاً في ${R(D.S.length)} شعبة</span><span>المرجع الرسمي: عمادة القبول والتسجيل وبوابة الطالب</span></div>`;
    }

    // ---------------------------------------------------------------- the screen
    const qr = (url, title, sub) => { const q = qrcode(0, 'M'); q.addData(url); q.make();
      return `<div class="rg-qr">${q.createSvgTag({ cellSize: 4, margin: 1, scalable: true })}<b>${title}</b><small>${sub}</small></div>`; };
    const QR = { planner: qr(SITE + 'planner.html', 'مخطط جدولي', 'اختر شعبك بلا تعارض'), timetable: qr(SITE + 'timetable.html', 'الجدول الدراسي', 'كل الشعب ومقاعدها') };
    document.body.classList.add('scr-on');
    document.title = 'القبول والتسجيل – شاشة';
    document.body.insertAdjacentHTML('beforeend', `<div class="scr rg" id="scr">
      <header class="scr-top"><img src="assets/logo.png" alt=""><div class="scr-t"><small>جامعة البترا</small><h1>عمادة القبول والتسجيل</h1></div>
        <div class="scr-clock"><b id="scr-time">--:--</b><span id="scr-date"></span></div></header>
      <main class="scr-main" id="scr-main"></main>
      <footer class="scr-foot"><div class="scr-tick" id="scr-tick"></div></footer></div>`);
    const load = fresh => Promise.allSettled([U.getJSON('data/seats_history.json', fresh), U.getJSON('data/changes.json', fresh)]).then(([h, c]) => {
      if (h.status === 'fulfilled') HIST = h.value; if (c.status === 'fulfilled') CHG = c.value; });
    paint();
    load().then(paint);
    setInterval(paint, 60000);
    setInterval(() => { slide++; paint(); }, 15000);
    setInterval(() => Promise.all([U.getJSON('data/timetable.json', true), U.getJSON('data/calendar.json', true), load(true)])
      .then(([t, c]) => { TT = t; CAL = c; paint(); }).catch(() => {}), 15 * 60000);
    setTimeout(() => location.reload(), 6 * 3600 * 1000);
  };
})();
