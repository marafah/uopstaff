/* Exam mode of the building screen (screen.html?b=<building>&mode=exams, or ?b=exams for every building): the exams
   running now in the building's rooms (with the sections and proctors in each room), the ones still to come today, and
   the next exam days, from the timetable the exams committee published (data/exam_schedule.json). The QR code opens
   «امتحاناتي», where a student picks their courses and sees date, time and room. Without ?mode the building screen
   switches to this mode by itself on exam days (?mode=lectures keeps the lectures). */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, toMin } = U;
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dm = iso => `${+iso.slice(8)}/${+iso.slice(5, 7)}`;
  const wd = iso => WD[new Date(iso + 'T12:00:00Z').getUTCDay()];

  // is this an exam day (the screen shows exams on its own)?
  window.UOP_EXAM_DAY = (ex, iso) => !!ex && (ex.exams || []).some(e => e.date === iso);

  window.UOP_EXSCREEN = function ({ B, TT, EX, P, inB, bIcon }) {
    const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    const ALL = B === 'exams';
    // which building each room is in, from the timetable
    const bOf = {}; TT.sections.forEach(s => { if (s.room && s.room !== '0' && s.building) bOf[String(s.room).trim()] = s.building; });
    const inHere = r => ALL || inB({ building: bOf[String(r).trim()] }, B);
    const TITLE = ALL ? 'جدول الامتحانات' : B === 'others' ? 'المباني العامة' : B;
    let page = 0;
    const PER = { run: 4, soon: 7 };
    document.body.classList.add('scr-on');
    document.title = `${TITLE} – شاشة الامتحانات`;
    if (!document.getElementById('scx-css')) document.head.insertAdjacentHTML('beforeend', `<style id="scx-css">
      .scx .scr-main { grid-template-columns: 1.45fr 1fr .85fr; }
      .scx-bic { flex: none; width: 2.9em; height: 2.9em; border-radius: .7em; display: grid; place-items: center; font-size: 1.25em; color: #fff; background: linear-gradient(140deg, #b7791f, #7a4b00); }
      .scx-mode { display: inline-block; background: #fbbf24; color: #1b1405; font-weight: 800; border-radius: 999px; padding: .05em .7em; font-size: .55em; vertical-align: middle; margin-inline-start: .4em; }
      .scx-card { background: rgba(255,255,255,.06); border-radius: 14px; padding: .6em .8em; border-inline-start: 4px solid #f87171; }
      .scx-card .h { display: flex; align-items: center; gap: .6em; } .scx-card .h b { flex: 1; font-size: 1.15em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .scx-card .h .t { direction: ltr; font-weight: 800; color: #fde68a; font-variant-numeric: tabular-nums; }
      .scx-card .sub { color: #c9d4da; font-size: .85em; margin: .1em 0 .35em; }
      .scx-rooms { display: flex; flex-wrap: wrap; gap: .35em; }
      .scx-rooms span { background: rgba(255,255,255,.1); border-radius: 9px; padding: .15em .5em; font-size: .92em; } .scx-rooms span b { font-size: 1.15em; margin-inline-end: .25em; font-variant-numeric: tabular-nums; }
      .scx-rooms span.lab { background: rgba(20,184,166,.22); } .scx-rooms small { color: #c9d4da; font-size: .78em; }
      .scx-pp { color: #a7f3d0; font-size: .8em; margin-top: .3em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .scx-day { background: rgba(255,255,255,.05); border-radius: 12px; padding: .5em .7em; }
      .scx-day .d { display: flex; align-items: center; gap: .6em; margin-bottom: .3em; } .scx-day .d b { font-size: 1.15em; } .scx-day .d span { margin-inline-start: auto; background: #b7791f; border-radius: 999px; padding: 0 .6em; font-size: .85em; }
      .scx-day ul { list-style: none; margin: 0; padding: 0; font-size: .85em; color: #dbe4e9; } .scx-day li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .scx-day li .tm { display: inline-block; min-width: 3.3em; color: #fde68a; font-weight: 700; direction: ltr; text-align: right; margin-inline-end: .35em; }
      .scx .scr-ev .scr-date bdi { color: #0f172a; } .scx .scr-ev .scr-date small { color: #9e1f27; }
      .scr-qr.big svg { width: 6.2em; height: 6.2em; } .scr-qr.big span { font-size: 1.15em; color: #fff; } .scr-qr.big span b { display: block; color: #fbbf24; }
    </style>`);
    const q = qrcode(0, 'M'); q.addData(SITE + 'myexams.html'); q.make();
    document.body.insertAdjacentHTML('beforeend', `<div class="scr scx" id="scr">
      <header class="scr-top"><img src="assets/logo.png" alt=""><span class="scx-bic" aria-hidden="true"><i class="bi ${ALL ? 'bi-clipboard-check' : bIcon(B)}"></i></span>
        <div class="scr-t"><small>جامعة البترا · ${esc(EX.type || 'الامتحانات')} · ${esc(EX.term || '')}</small><h1>${esc(TITLE)}<span class="scx-mode">الامتحانات</span></h1></div>
        <div class="scr-clock"><b id="scr-time">--:--</b><span id="scr-date"></span></div></header>
      <main class="scr-main" id="scr-main"></main>
      <footer class="scr-foot"><div class="scr-tick" id="scr-tick"></div><div class="scr-qr big">${q.createSvgTag({ cellSize: 4, margin: 1, scalable: true })}<span><b>امتحاناتك؟</b>امسح الرمز واختر مقرراتك<br>لترى اليوم والوقت والقاعة</span></div></footer></div>`);

    const roomsHere = e => e.rooms.filter(r => inHere(r.room));
    const mine = () => EX.exams.filter(e => roomsHere(e).length);
    const pages = (list, per) => { const n = Math.max(1, Math.ceil(list.length / per)); const p = page % n; return { items: list.slice(p * per, p * per + per), p, n }; };
    const dots = (p, n) => n > 1 ? `<span class="scr-dots">${Array.from({ length: n }, (_, i) => `<i class="${i === p ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const roomsHtml = e => `<div class="scx-rooms">${roomsHere(e).map(r => `<span class="${r.lab ? 'lab' : ''}"><b dir="ltr">${esc(r.room)}</b>${r.lab ? '<i class="bi bi-pc-display"></i> ' : ''}<small>${r.secs && r.secs.length ? 'شعبة ' + esc(r.secs.join('، ')) : r.n + ' طالب'}</small></span>`).join('')}</div>`;
    function paint(flip) {
      const now = U.amman(P.get('at'));
      $('#scr-time').textContent = now.clock;
      $('#scr-date').textContent = `${U.DAYS[now.day] || ''} ${U.numDate(now.iso)}`;
      const list = mine(), today = list.filter(e => e.date === now.iso);
      const running = today.filter(e => toMin(e.from) <= now.min && now.min < toMin(e.to)).sort((a, b) => a.code.localeCompare(b.code));
      const later = today.filter(e => toMin(e.from) > now.min).sort((a, b) => toMin(a.from) - toMin(b.from) || a.code.localeCompare(b.code));
      const nextDays = [...new Set(list.filter(e => e.date > now.iso).map(e => e.date))].sort().slice(0, 3);
      const R = pages(running, PER.run), N = pages(later, PER.soon);
      if (flip && R.n < 2 && N.n < 2) return;
      if (!list.length) {
        $('#scr-main').innerHTML = `<div class="scr-off"><i class="bi bi-clipboard-check"></i><b>لا امتحانات في قاعات ${ALL ? 'الجامعة' : 'هذا المبنى'}</b><span>${esc(EX.title || '')}</span></div>`;
      } else {
        const left = e => toMin(e.to) - now.min;
        $('#scr-main').innerHTML = `
          <section class="scr-col now"><h2><i class="bi bi-pencil-square"></i> امتحانات الآن <span>${running.length}</span>${dots(R.p, R.n)}</h2>
            ${R.items.map(e => `<div class="scx-card"><div class="h"><b>${esc(e.name)}</b><span class="t">${e.from} – ${e.to}</span></div>
              <div class="sub"><bdi dir="ltr">${esc(e.code)}</bdi> · ${esc(e.dept)} · ${e.students} طالب · ينتهي بعد ${U.mins(left(e))}</div>${roomsHtml(e)}
              <i class="scr-bar"><em style="width:${Math.round(100 * (now.min - toMin(e.from)) / Math.max(1, toMin(e.to) - toMin(e.from)))}%"></em></i>
              ${roomsHere(e).some(r => r.proc && r.proc.length) ? `<div class="scx-pp"><i class="bi bi-person-badge"></i> ${esc([...new Set(roomsHere(e).flatMap(r => r.proc || []))].map(U.shortName).join('، '))}</div>` : ''}</div>`).join('')
              || `<p class="scr-none">${today.length ? 'لا امتحان جارٍ في هذه اللحظة' : 'لا امتحانات اليوم'}</p>`}</section>
          <section class="scr-col soon"><h2><i class="bi bi-clock-history"></i> لاحقاً اليوم <span>${later.length}</span>${dots(N.p, N.n)}</h2>
            ${N.items.map(e => `<div class="scr-row"><b dir="ltr">${e.from}</b><div class="scr-room sm" dir="ltr">${esc(roomsHere(e).map(r => r.room).slice(0, 2).join(' '))}${roomsHere(e).length > 2 ? '…' : ''}</div>
              <div class="scr-body"><b>${esc(e.name)}</b><span><bdi dir="ltr">${esc(e.code)}</bdi> · ${roomsHere(e).length} ${roomsHere(e).length > 1 ? 'قاعات' : 'قاعة'} · ${e.students} طالب</span></div></div>`).join('')
              || '<p class="scr-none">لا امتحانات أخرى اليوم</p>'}</section>
          <section class="scr-col free"><h2><i class="bi bi-calendar-week"></i> الأيام القادمة</h2>
            ${nextDays.map(d => { const xs = list.filter(e => e.date === d).sort((a, b) => toMin(a.from) - toMin(b.from));
              return `<div class="scx-day"><div class="d"><b>${wd(d)} ${dm(d)}</b><span>${xs.length} امتحان</span></div><ul>${xs.slice(0, 5).map(e => `<li><span class="tm">${e.from}</span>${esc(e.name)}</li>`).join('')}${xs.length > 5 ? `<li>و${xs.length - 5} أخرى…</li>` : ''}</ul></div>`; }).join('')
              || '<p class="scr-none">لا أيام امتحانات قادمة</p>'}</section>`;
      }
      const days = [...new Set(EX.exams.map(e => e.date))].sort();
      $('#scr-tick').innerHTML = `<div class="scr-tl"><i class="bi bi-calendar-event"></i><b>الامتحانات</b></div>` + [
        ['bi-calendar-range', `${dm(days[0])} – ${dm(days[days.length - 1])}`, `${days.length} يوم امتحانات`],
        ['bi-journal-check', `${list.length}`, ALL ? 'امتحاناً في الجامعة' : 'امتحاناً في هذا المبنى'],
        ['bi-door-open', `${new Set(list.flatMap(e => roomsHere(e).map(r => r.room))).size}`, 'قاعة امتحان'],
        ['bi-info-circle', 'قبل 15 دقيقة', 'احضر بالهوية الجامعية']].map(([ic, v, t]) => `<div class="scr-ev"><span class="scr-date"><bdi dir="ltr">${esc(v)}</bdi><small><i class="bi ${ic}"></i></small></span><span class="scr-et">${esc(t)}</span></div>`).join('');
    }
    paint();
    setInterval(paint, 60000);
    setInterval(() => { page++; paint(true); }, 12000);
    // the committee publishes, updates or withdraws the timetable from «جدول الامتحانات»: checked every 3 minutes
    setInterval(() => fetch('data/exam_schedule.json?t=' + Date.now(), { cache: 'no-store' }).then(r => {
      if (r.status === 404) return location.reload();   // withdrawn: back to the lectures
      return r.ok ? r.json().then(x => { if (x && x.exams && x.exams.length) { EX = x; paint(); } else location.reload(); }) : null;
    }).catch(() => {}), 3 * 60000);
    setTimeout(() => location.reload(), 6 * 3600 * 1000);
  };
})();
