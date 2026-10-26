/* University of Petra academic calendar – data/calendar.json, refreshed hourly from the official PDF. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
  const CAT = {
    teaching: { label: 'التدريس والدوام', icon: 'bi-easel2-fill', color: '#2a78d6' },
    registration: { label: 'التسجيل والانسحاب', icon: 'bi-pencil-square', color: '#eb6834' },
    exams: { label: 'الامتحانات', icon: 'bi-journal-check', color: '#6250d6' },
    holiday: { label: 'العطل والمناسبات', icon: 'bi-sun-fill', color: '#1baf7a' },
    graduate: { label: 'الدراسات العليا', icon: 'bi-mortarboard-fill', color: '#e87ba4' },
    results: { label: 'النتائج والتخرج', icon: 'bi-award-fill', color: '#eda100' },
  };
  const SEM_SHORT = { first: 'الأول', second: 'الثاني', summer: 'الصيفي' };
  const LOC = 'ar-JO-u-nu-latn';
  let CAL = null, EVENTS = [];

  // ---------------------------------------------------------------- dates (whole days, Amman time)
  const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
  const D = iso => new Date(iso + 'T00:00:00Z');
  const ISO = d => d.toISOString().slice(0, 10);
  const addDays = (iso, n) => ISO(new Date(D(iso).getTime() + n * 86400000));
  const diff = (a, b) => Math.round((D(b) - D(a)) / 86400000);  // b - a in days
  const fmt = (iso, o) => D(iso).toLocaleDateString(LOC, Object.assign({ timeZone: 'UTC' }, o));
  const dayName = iso => fmt(iso, { weekday: 'long' });
  const monthName = iso => fmt(iso, { month: 'long' });
  const say = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const days = n => say(n, 'يوم', 'يومان', 'أيام', 'يوماً');
  const inDays = n => n === 0 ? 'اليوم' : n === 1 ? 'غداً' : `بعد ${say(n, 'يوم', 'يومين', 'أيام', 'يوماً')}`;
  // numeric dates, day/month/year (e.g. 19/1/2027), kept left-to-right so the digits never get reordered
  const num = iso => `${+iso.slice(8)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const ltr = s => `<bdi dir="ltr" class="num-date">${s}</bdi>`;
  function rangeText(e) {
    if (e.dates) return e.dates.map(d => ltr(num(d))).join('، ');
    return e.start === e.end ? ltr(num(e.start)) : `${ltr(num(e.start))} – ${ltr(num(e.end))}`;
  }
  function status(e, t) {
    if (e.dates) {
      if (e.dates.includes(t)) return { k: 'now', label: 'اليوم' };
      const next = e.dates.find(d => d > t);
      return next ? { k: 'soon', n: diff(t, next), label: inDays(diff(t, next)), next } : { k: 'past', label: 'انتهى' };
    }
    if (e.end < t) return { k: 'past', label: 'انتهى' };
    if (e.start <= t) {
      const total = diff(e.start, e.end) + 1, day = diff(e.start, t) + 1;
      return { k: 'now', label: total > 1 ? `جارٍ الآن · اليوم ${day} من ${total}` : 'اليوم', left: diff(t, e.end) };
    }
    return { k: 'soon', n: diff(t, e.start), label: inDays(diff(t, e.start)) };
  }
  const covers = (e, iso) => e.dates ? e.dates.includes(iso) : (e.start <= iso && iso <= e.end);

  // ---------------------------------------------------------------- state in the URL
  function readState() {
    const p = new URLSearchParams(location.search);
    return { sem: p.get('sem') || '', cat: (p.get('cat') || '').split(',').filter(Boolean), q: p.get('q') || '',
             past: p.get('past') === '1', view: p.get('view') || 'list', month: p.get('month') || '' };
  }
  function writeState(st) {
    const p = new URLSearchParams();
    if (st.sem) p.set('sem', st.sem);
    if (st.cat.length) p.set('cat', st.cat.join(','));
    if (st.q) p.set('q', st.q);
    if (st.past) p.set('past', '1');
    if (st.view !== 'list') p.set('view', st.view);
    if (st.month && st.view === 'month') p.set('month', st.month);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }
  function set(ch) { writeState(Object.assign(readState(), ch)); render(); }

  // ---------------------------------------------------------------- pieces
  const badge = e => { const c = CAT[e.category] || {}; return `<span class="cat-badge" style="--c:${c.color}"><i class="bi ${c.icon}"></i> ${c.label}</span>`; };
  function eventRow(e, t) {
    const s = status(e, t), c = CAT[e.category] || {};
    const len = e.dates ? `${e.dates.length} مواعيد` : (e.start !== e.end ? days(diff(e.start, e.end) + 1) : '');
    return `<article class="ev ${s.k}" style="--c:${c.color}" data-id="${e.id}">
      <div class="ev-date"><b dir="ltr">${num(s.next || e.start).slice(0, -5)}</b><span>${(s.next || e.start).slice(0, 4)}</span><small>${esc(e.day || dayName(e.start))}</small></div>
      <div class="ev-body">
        <h3 class="ev-title">${esc(e.title)}${e.estimated ? ' <span class="est" title="التاريخ تقديري ويُعلن رسمياً لاحقاً">تقديري</span>' : ''}</h3>
        ${e.note ? `<div class="ev-note"><i class="bi bi-exclamation-circle"></i> ${esc(e.note)}</div>` : ''}
        <div class="ev-meta"><span><i class="bi bi-calendar-range"></i> ${rangeText(e)}</span>${len ? `<span><i class="bi bi-hourglass-split"></i> ${len}</span>` : ''}
          ${badge(e)}<span class="sem-tag">${esc(SEM_SHORT[e.sem] ? 'الفصل ' + SEM_SHORT[e.sem] : '')}</span></div>
      </div>
      <div class="ev-side"><span class="st st-${s.k}">${s.k === 'now' ? '<i class="bi bi-broadcast"></i> ' : s.k === 'soon' ? '<i class="bi bi-clock"></i> ' : '<i class="bi bi-check2"></i> '}${s.label}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary py-0 ics-one" data-id="${e.id}" title="أضف هذا الموعد إلى تقويمك"><i class="bi bi-calendar-plus"></i></button></div>
    </article>`;
  }
  function tile(title, e, t, icon, color) {
    if (!e) return '';
    const s = status(e, t);
    const big = s.k === 'now' ? 'الآن' : s.n;
    const unit = s.k === 'now' ? (s.left ? `ينتهي ${inDays(s.left)}` : 'اليوم') : (s.n === 0 ? 'اليوم' : say(s.n, 'يوم', 'يومان', 'أيام', 'يوماً').replace(/^\d+\s/, ''));
    return `<a class="cd-tile" href="#ev-${e.id}" data-jump="${e.id}" style="--c:${color}">
      <span class="cd-ico"><i class="bi ${icon}"></i></span>
      <div class="cd-main"><small>${title}</small><b>${esc(e.title)}</b><span>${rangeText(e)}</span></div>
      <div class="cd-count"><b>${big}</b><small>${unit}</small></div></a>`;
  }

  // ---------------------------------------------------------------- render
  function render() {
    const st = readState(), t = todayISO();
    const q = norm(st.q.trim());
    $('#cal-q').value = st.q;
    const base = EVENTS.filter(e => (!st.sem || e.sem === st.sem) && (!q || norm(e.title + ' ' + e.note).includes(q)));
    const list = base.filter(e => (!st.cat.length || st.cat.includes(e.category)) && (st.past || status(e, t).k !== 'past'));
    const catCount = {};
    base.filter(e => st.view === 'month' || st.past || status(e, t).k !== 'past').forEach(e => catCount[e.category] = (catCount[e.category] || 0) + 1);

    // current semester and teaching week
    const sem = CAL.semesters.find(s => s.start <= t && t <= s.end && s.events.some(e => /بدء التدريس/.test(e.title) && e.start <= t)) ||
                CAL.semesters.find(s => s.start <= t && t <= s.end) || CAL.semesters.find(s => s.start > t);
    const teachStart = sem && sem.events.find(e => /بدء التدريس/.test(e.title));
    const teachEnd = sem && sem.events.find(e => /آخر يوم تدريس/.test(e.title));
    let weekHtml = '';
    if (teachStart && teachEnd) {
      const total = Math.ceil((diff(teachStart.start, teachEnd.start) + 1) / 7);
      if (t < teachStart.start) weekHtml = `<div class="week">يبدأ التدريس ${inDays(diff(t, teachStart.start))} · ${rangeText(teachStart)}</div>`;
      else if (t <= teachEnd.start) {
        const wk = Math.floor(diff(teachStart.start, t) / 7) + 1, pct = Math.round(100 * (diff(teachStart.start, t) + 1) / (diff(teachStart.start, teachEnd.start) + 1));
        weekHtml = `<div class="week"><b>الأسبوع ${wk}</b> من ${total} أسبوعاً تدريسياً
          <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="تقدم الفصل"><i style="width:${pct}%"></i></div>
          <small>${pct}% من أيام التدريس · آخر يوم تدريس ${inDays(diff(t, teachEnd.start))}</small></div>`;
      } else weekHtml = `<div class="week">انتهى التدريس لهذا الفصل</div>`;
    }
    const now = EVENTS.filter(e => status(e, t).k === 'now');
    const upcoming = EVENTS.filter(e => status(e, t).k === 'soon').sort((a, b) => status(a, t).n - status(b, t).n);
    const nextOf = re => upcoming.concat(now).filter(e => re.test(e.title + ' ' + e.category)).sort((a, b) => (status(a, t).n || 0) - (status(b, t).n || 0))[0];

    $('#cal-app').innerHTML = `
      <section class="today-band">
        <div class="today-date"><small>اليوم</small><b>${dayName(t)}</b><span>${ltr(num(t))}</span></div>
        <div class="today-sem">${sem ? `<small>${esc(sem.name)} ${esc(CAL.year)}</small>${weekHtml}` : '<small>خارج العام الجامعي</small>'}</div>
        <div class="today-now"><small><i class="bi bi-broadcast"></i> يجري الآن</small>
          ${now.length ? now.map(e => `<a class="now-chip" href="#ev-${e.id}" data-jump="${e.id}" style="--c:${CAT[e.category].color}">${esc(e.title)} <em>${status(e, t).left ? 'ينتهي ' + inDays(status(e, t).left) : 'اليوم'}</em></a>`).join('') : '<span class="text-muted small">لا مواعيد جارية اليوم</span>'}</div>
      </section>

      <section class="cd-grid">
        ${tile('أقرب عطلة / مناسبة', nextOf(/holiday/), t, 'bi-sun-fill', CAT.holiday.color)}
        ${tile('أقرب امتحانات', nextOf(/امتحان|الامتحانات|الاختبار/), t, 'bi-journal-check', CAT.exams.color)}
        ${tile('آخر موعد انسحاب', nextOf(/الانسحاب/), t, 'bi-box-arrow-left', CAT.registration.color)}
        ${tile('نهاية التدريس', teachEnd && status(teachEnd, t).k !== 'past' ? teachEnd : nextOf(/آخر يوم تدريس/), t, 'bi-flag-fill', CAT.teaching.color)}
      </section>

      <section class="card mb-3 no-print"><div class="card-body py-2">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <div class="btn-group btn-group-sm" role="group" aria-label="الفصل">
            ${[['', 'كل الفصول']].concat(CAL.semesters.map(s => [s.key, 'الفصل ' + SEM_SHORT[s.key]])).map(([k, l]) =>
              `<button type="button" class="btn ${st.sem === k ? 'btn-primary' : 'btn-outline-primary'}" data-sem="${k}">${l}</button>`).join('')}
          </div>
          <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="طريقة العرض">
            <button type="button" class="btn ${st.view === 'list' ? 'btn-navy' : 'btn-outline-secondary'}" data-view="list"><i class="bi bi-list-ul"></i> خط زمني</button>
            <button type="button" class="btn ${st.view === 'month' ? 'btn-navy' : 'btn-outline-secondary'}" data-view="month"><i class="bi bi-calendar3"></i> شهري</button>
          </div>
          ${st.view === 'list' ? `<div class="form-check form-switch m-0 small"><input class="form-check-input" type="checkbox" id="show-past" ${st.past ? 'checked' : ''}><label class="form-check-label" for="show-past">إظهار ما انتهى</label></div>` : ''}
        </div>
        <div class="cat-chips mt-2">${Object.entries(CAT).map(([k, c]) =>
          `<button type="button" class="cat-chip ${st.cat.includes(k) ? 'on' : ''}" data-cat="${k}" style="--c:${c.color}" aria-pressed="${st.cat.includes(k)}"><i class="bi ${c.icon}"></i> ${c.label} <span>${catCount[k] || 0}</span></button>`).join('')}
          ${st.cat.length || st.q ? '<button type="button" class="btn btn-link btn-sm p-0" data-clear="1">مسح التصفية</button>' : ''}</div>
      </div></section>

      ${st.view === 'month' ? monthView(st, t, base.filter(e => !st.cat.length || st.cat.includes(e.category))) : listView(list, t, st)}`;
    bind();
  }
  function listView(list, t, st) {
    if (!list.length) return `<div class="card"><div class="card-body text-center text-muted py-5"><i class="bi bi-calendar-x fs-1"></i><p class="mt-2 mb-0">لا مواعيد مطابقة${st.past ? '' : ' (فعّل «إظهار ما انتهى» لرؤية المواعيد السابقة)'}.</p></div></div>`;
    const sorted = list.slice().sort((a, b) => ((status(a, t).next || a.start) > (status(b, t).next || b.start) ? 1 : -1) || (a.end > b.end ? 1 : -1));
    let html = '', cur = '';
    sorted.forEach(e => {
      const key = (status(e, t).next || e.start).slice(0, 7);
      if (key !== cur) {
        if (cur) html += '</div>';
        cur = key;
        html += `<h2 class="month-h"><span>${monthName(key + '-01')}</span> ${key.slice(0, 4)}</h2><div class="ev-list">`;
      }
      html += `<div id="ev-${e.id}">${eventRow(e, t)}</div>`;
    });
    return html + '</div>';
  }
  // months the calendar covers (navigation never leaves them)
  function monthsSpan() {
    const a = EVENTS.reduce((m, e) => e.start < m ? e.start : m, '9999').slice(0, 7);
    const b = EVENTS.reduce((m, e) => e.end > m ? e.end : m, '0000').slice(0, 7);
    const out = [];
    for (let y = +a.slice(0, 4), mo = +a.slice(5, 7); `${y}-${String(mo).padStart(2, '0')}` <= b; mo === 12 ? (y++, mo = 1) : mo++)
      out.push(`${y}-${String(mo).padStart(2, '0')}`);
    return out;
  }
  function monthView(st, t, list) {
    // every event of the month is shown, finished ones dimmed: the "show finished" switch only affects the timeline
    const months = monthsSpan();
    let m = st.month || t.slice(0, 7);
    if (!months.includes(m)) m = m < months[0] ? months[0] : months[months.length - 1];
    const idx = months.indexOf(m), prev = months[idx - 1], next = months[idx + 1];
    const touches = (e, mm) => e.dates ? e.dates.some(d => d.startsWith(mm)) : (e.start.slice(0, 7) <= mm && mm <= e.end.slice(0, 7));
    const first = m + '-01';
    const lead = (D(first).getUTCDay() + 1) % 7;  // weeks start on Saturday
    const start = addDays(first, -lead);
    const heads = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (i >= 35 && d.slice(0, 7) !== m) break;
      const evs = list.filter(e => covers(e, d));
      const holiday = evs.some(e => e.category === 'holiday');
      // named: happens / starts / ends that day; ongoing periods only get a thin strip (keeps long periods readable)
      const named = evs.filter(e => e.dates || e.start === d || e.end === d);
      const through = evs.filter(e => !named.includes(e));
      const tag = e => e.dates || e.start === e.end ? '' : e.start === d ? 'يبدأ: ' : 'ينتهي: ';
      cells += `<button type="button" class="mc ${d.slice(0, 7) !== m ? 'out' : ''} ${d < t ? 'was' : ''} ${d === t ? 'today' : ''} ${holiday ? 'hol' : ''} ${d === window.__pick ? 'pick' : ''}" data-day="${d}" aria-label="${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${evs.length} مواعيد">
        <span class="mc-top"><span class="mc-n">${+d.slice(8)}</span><span class="mc-strips">${through.slice(0, 5).map(e => `<b style="--c:${CAT[e.category].color}" title="${esc(e.title)}"></b>`).join('')}</span></span>
        <span class="mc-ev">${named.slice(0, 3).map(e => `<i style="--c:${CAT[e.category].color}" title="${esc(e.title)}">${tag(e)}${esc(e.title)}</i>`).join('')}${named.length > 3 ? `<em>+${named.length - 3}</em>` : ''}</span></button>`;
    }
    const pick = (window.__pick && window.__pick.slice(0, 7) === m) ? window.__pick : (t.slice(0, 7) === m ? t : first);
    const dayEvs = list.filter(e => covers(e, pick));
    const monthEvs = list.filter(e => touches(e, m));
    const label = mm => `${+mm.slice(5, 7)}/${mm.slice(0, 4)}`;
    return `<section class="card mb-3"><div class="card-body">
      <div class="month-nav">
        <button type="button" class="btn btn-sm btn-outline-secondary" ${prev ? `data-month="${prev}"` : 'disabled'} title="${prev ? label(prev) : ''}"><i class="bi bi-chevron-right"></i> السابق</button>
        <select class="form-select form-select-sm w-auto month-pick" aria-label="اختر الشهر">${months.map(mm =>
          `<option value="${mm}" ${mm === m ? 'selected' : ''}>${label(mm)} (${list.filter(e => touches(e, mm)).length})</option>`).join('')}</select>
        <button type="button" class="btn btn-sm btn-outline-secondary" ${next ? `data-month="${next}"` : 'disabled'} title="${next ? label(next) : ''}">التالي <i class="bi bi-chevron-left"></i></button>
        ${months.includes(t.slice(0, 7)) && t.slice(0, 7) !== m ? `<button type="button" class="btn btn-sm btn-link" data-month="${t.slice(0, 7)}">الشهر الحالي</button>` : ''}
        <span class="ms-auto small text-muted">${monthEvs.length} موعداً هذا الشهر</span>
      </div>
      <div class="mgrid">${heads.map(h => `<div class="mh">${h}</div>`).join('')}${cells}</div>
      <div class="mlegend small text-muted mt-2"><span><b class="lg-strip"></b> فترة مستمرة</span><span><i class="bi bi-square-fill text-success-emphasis" style="color:#cdeedd !important"></i> عطلة</span><span>انقر يوماً لعرض مواعيده</span></div>
    </div></section>
    <h2 class="month-h"><span>${dayName(pick)}</span> ${ltr(num(pick))}</h2>
    <div class="ev-list">${dayEvs.length ? dayEvs.map(e => eventRow(e, t)).join('') : '<p class="text-muted">لا مواعيد في هذا اليوم.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- events
  function bind() {
    document.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => set({ sem: b.dataset.sem }));
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => set({ view: b.dataset.view }));
    document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { window.__pick = null; set({ month: b.dataset.month }); });
    document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { window.__pick = b.dataset.day; render(); });
    document.querySelectorAll('.month-pick').forEach(sel => sel.onchange = () => { window.__pick = null; set({ month: sel.value }); });
    document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      const st = readState(), k = b.dataset.cat;
      set({ cat: st.cat.includes(k) ? st.cat.filter(x => x !== k) : st.cat.concat(k) });
    });
    const sp = $('#show-past');
    if (sp) sp.onchange = () => set({ past: sp.checked });
    document.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => set({ cat: [], q: '' }));
    document.querySelectorAll('[data-jump]').forEach(a => a.onclick = ev => {
      ev.preventDefault();
      const e = EVENTS.find(x => x.id === a.dataset.jump);
      if (readState().view !== 'list' || (readState().sem && readState().sem !== e.sem)) set({ view: 'list', sem: '' });
      const el = document.getElementById('ev-' + e.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    });
    document.querySelectorAll('.ics-one').forEach(b => b.onclick = () => downloadIcs(EVENTS.find(x => x.id === b.dataset.id)));
  }
  function downloadIcs(e) {
    const spans = e.dates ? e.dates.map(d => [d, d]) : [[e.start, e.end]];
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//uopstaff//Academic Calendar//AR'];
    spans.forEach(([a, b], i) => lines.push('BEGIN:VEVENT', `UID:${e.id}-${i}@marafah.github.io`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${a.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(b, 1).replace(/-/g, '')}`,
      `SUMMARY:${e.title.replace(/[,;]/g, '\\$&')}`, `DESCRIPTION:جامعة البترا – التقويم الجامعي${e.note ? ' – ' + e.note : ''}`, 'END:VEVENT'));
    lines.push('END:VCALENDAR');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = `${e.title.slice(0, 40)}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function setupSubscribe() {
    const url = new URL('data/calendar.ics', location.href).href;
    const webcal = url.replace(/^https?:/, 'webcal:');
    $('#sub-url').value = url;
    $('#sub-google').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
    $('#sub-apple').href = webcal;
    $('#sub-outlook').href = 'https://outlook.office.com/calendar/addfromweb?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent('التقويم الجامعي – جامعة البترا');
    $('#sub-file').href = 'data/calendar.ics';
    $('#sub-copy').onclick = () => (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(url) : Promise.resolve()).then(() => {
      const el = $('#copy-toast'); el.querySelector('span').textContent = 'تم نسخ رابط الاشتراك'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2000);
    });
  }

  // ---------------------------------------------------------------- start
  fetch('data/calendar.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(c => {
    CAL = c;
    EVENTS = c.semesters.flatMap(s => s.events.map(e => Object.assign({ sem: s.key }, e)));
    $('#cal-year').textContent = c.year;
    const up = new Date(c.updated);
    $('#cal-updated').textContent = 'يُراجَع تلقائياً كل ساعة';
    $('#cal-updated').title = `آخر تغيير في التقويم الرسمي: ${up.toLocaleDateString(LOC, { year: 'numeric', month: 'long', day: 'numeric' })}`;
    $('#foot-count').textContent = `${EVENTS.length} موعداً`;
    $('#foot-updated').textContent = up.toLocaleDateString(LOC, { year: 'numeric', month: 'short', day: 'numeric' });
    if (c.source) $('#foot-pdf').href = c.source;
    let qt;
    $('#cal-q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => set({ q: e.target.value }), 250); });
    setupSubscribe();
    render();
  }).catch(err => {
    $('#cal-app').innerHTML = `<div class="alert alert-danger mt-3"><i class="bi bi-exclamation-octagon-fill"></i> تعذّر تحميل التقويم (${esc(err.message)}). يمكنك فتح <a href="https://www.uop.edu.jo/Ar/AdmissionsAndRegistration/Documents/AcademicCalendar.pdf" target="_blank" rel="noopener">الملف الرسمي</a>.</div>`;
  });
})();
