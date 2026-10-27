/* Shared pieces for the instructor, planner, now and trends pages (same data and look as the timetable page). */
window.UOP = (function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const WEEK = ['ح', 'ن', 'ث', 'ر', 'خ', 'س', 'ج'];
  const JS_DAY = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];  // Date.getDay(): Sunday = 0
  const MODE = {
    'وجاهي': { icon: 'bi-person-fill', cls: 'm-f2f' },
    'الكتروني كامل': { icon: 'bi-camera-video-fill', cls: 'm-online' },
    'غير متزامن': { icon: 'bi-hourglass-split', cls: 'm-async' },
    'مدمج': { icon: 'bi-intersect', cls: 'm-blend' },
  };
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const toTime = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const live = m => m.mode !== 'غير متزامن';  // asynchronous meetings have no fixed time
  function dur(minutes) {
    const h = Math.floor(minutes / 60), half = minutes % 60 >= 30;
    const hs = h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
    return half ? (hs ? hs + ' ونصف' : 'نصف ساعة') : hs || '—';
  }
  const say = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  function mins(m) {  // any number of minutes, to the minute: "17 دقيقة", "ساعة و20 دقيقة"
    m = Math.max(0, Math.round(m));
    if (m < 1) return 'لحظات';
    const h = Math.floor(m / 60), r = m % 60, rm = say(r, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    if (!h) return rm;
    const hs = say(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return r ? `${hs} و${rm}` : hs;
  }
  function ago(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 2) return 'قبل لحظات';
    if (min < 60) return 'قبل ' + say(min, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    const h = Math.round(min / 60);
    if (h < 24) return 'قبل ' + say(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    const d = Math.round(h / 24);
    return 'قبل ' + say(d, 'يوم', 'يومين', 'أيام', 'يوماً');
  }
  // the moment in Amman: date, day letter, minutes since midnight ("2026-10-27T10:30" in ?at= is read as Amman time)
  function amman(at) {
    let d = new Date();
    if (at) {
      const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/);
      const x = m ? new Date(`${m[1]}T${m[2] || '08:00'}:${m[3] || '00'}${m[4] || '+03:00'}`) : new Date(NaN);
      if (!isNaN(x)) d = x;
    }
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
    const hour = +p.hour % 24;
    return { iso: `${p.year}-${p.month}-${p.day}`, day: JS_DAY[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)],
      min: hour * 60 + +p.minute, clock: `${String(hour).padStart(2, '0')}:${p.minute}` };
  }
  // one colour per course: [edge, background]
  const PALETTE = [['#901d23', '#fbecec'], ['#0b4a66', '#e4f0f6'], ['#0f766e', '#e0f4f1'], ['#9a5b00', '#fdf1dc'], ['#6d28d9', '#f0e9fd'],
    ['#15803d', '#e4f5e9'], ['#be185d', '#fce8f2'], ['#1d4ed8', '#e6edfd'], ['#7c4a1e', '#f4eadf'], ['#475569', '#edf0f4']];
  const numDate = iso => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d}/${+m}/${y}`; };
  const getJSON = (url, fresh) => fetch(url + (fresh ? '?t=' + Date.now() : '?t=' + Math.floor(Date.now() / 600000)), { cache: fresh ? 'no-store' : 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); });
  const sectionKey = s => [s.code, s.section, s.activity, s.degree, s.study_type].join('|');
  const shortName = n => String(n || '').replace(/^(أ\.?\s?د|ا\.?\s?د|د|م|أ)\.+\s*/, '');

  // Weekly calendar: one column per day, lectures as blocks at their real times (overlaps side by side)
  function weekGrid(items, opts) {
    opts = opts || {};
    const days = opts.days || WEEK.filter(d => (d !== 'ج' && d !== 'س') || items.some(x => x.day === d && x.start));
    const timed = items.filter(x => x.start);
    const lo = Math.min(opts.from || 8 * 60, ...timed.map(x => toMin(x.start)));
    const hi = Math.max(opts.to || 16 * 60, ...timed.map(x => toMin(x.end)));
    const from = Math.floor(lo / 60) * 60, to = Math.ceil(hi / 60) * 60, PX = opts.px || 54, GAP = 28;
    // opts.compact: only the hours that have a lecture; each run of empty hours becomes a thin marked strip
    let used = [];
    for (let t = from; t < to; t += 60) if (!opts.compact || timed.some(x => toMin(x.start) < t + 60 && toMin(x.end) > t)) used.push(t);
    if (!used.length) used = [from];
    const base = {};
    let y = 0;
    const gaps = [];
    used.forEach((t, i) => { if (i && t !== used[i - 1] + 60) { gaps.push(y); y += GAP; } base[t] = y; y += PX; });
    const Y = t => { const h = Math.floor(t / 60) * 60; return h in base ? base[h] + (t - h) / 60 * PX : base[h - 60] + PX; };
    const H = y;
    // hour labels: every used hour, plus the end of each run of hours
    const hours = [];
    used.forEach((t, i) => { hours.push(t); if (i === used.length - 1 || used[i + 1] !== t + 60) hours.push(t + 60); });
    const col = d => {
      const its = timed.filter(x => x.day === d).sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
      const lanes = [];  // greedy lanes for overlapping blocks
      its.forEach(x => {
        let i = lanes.findIndex(end => end <= toMin(x.start));
        if (i < 0) { i = lanes.length; lanes.push(0); }
        lanes[i] = toMin(x.end);
        x._lane = i;
      });
      its.forEach(x => { x._lanes = lanes.length; });
      return `<div class="wk-col">${used.map(t => `<i class="wk-line" style="top:${base[t]}px"></i>`).join('')}${gaps.map(g => `<i class="wk-gap" style="top:${g}px;height:${GAP}px"></i>`).join('')}
        ${its.map(x => {
          const top = Y(toMin(x.start)), h = Math.max(22, Y(toMin(x.end)) - top - 3);
          const w = 100 / x._lanes;
          // optional: x.style (e.g. a course colour), x.icon, x.line (a second line such as the course name)
          return `<${x.href ? `a href="${esc(x.href)}"` : x.data ? `a href="#" ${x.data}` : 'div'} class="wk-ev ${x.cls || ''}" style="top:${top}px;height:${h}px;right:calc(${w * x._lane}% + 2px);width:calc(${w}% - 4px);${x.style || ''}" title="${esc(x.tip || '')}">
            <b>${x.icon ? `<i class="bi ${x.icon}"></i> ` : ''}${esc(x.title)}</b>${x.line ? `<span class="wk-l2">${esc(x.line)}</span>` : ''}${x.sub ? `<span>${esc(x.sub)}</span>` : ''}<small dir="ltr">${x.start}–${x.end}</small></${x.href || x.data ? 'a' : 'div'}>`;
        }).join('')}</div>`;
    };
    const untimed = items.filter(x => !x.start);
    return `<div class="wk ${opts.cls || ''}"><div class="wk-head"><span></span>${days.map(d => `<b>${esc(DAYS[d] || d)}</b>`).join('')}</div>
      <div class="wk-body" style="height:${H}px"><div class="wk-hours">${gaps.map(g => `<i class="wk-gap" style="top:${g}px;height:${GAP}px"></i>`).join('')}${hours.map(t => `<span style="top:${Y(t)}px">${toTime(t)}</span>`).join('')}</div>
      ${days.map(col).join('')}</div>${untimed.length ? `<div class="wk-untimed">${untimed.map(x => `<span class="tt-chip ${x.cls || ''} static">${esc(x.title)}${x.sub ? ' · ' + esc(x.sub) : ''}</span>`).join('')}</div>` : ''}</div>`;
  }
  let DAYS = { 'ح': 'الأحد', 'ن': 'الاثنين', 'ث': 'الثلاثاء', 'ر': 'الأربعاء', 'خ': 'الخميس', 'س': 'السبت', 'ج': 'الجمعة' };

  function updatedLine(iso, extra) {
    const el = $('#pg-updated');
    if (el) el.innerHTML = `آخر تغيير ${ago(iso)} (${numDate(iso)})${extra ? ' · ' + extra : ''}`;
    const fu = $('#foot-updated');
    if (fu) fu.textContent = 'آخر تغيير ' + ago(iso);
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
  }
  // modal reused by the pages (same look as the timetable's section dialog)
  function modal(title, body) {
    let dlg = $('#pgModal');
    if (!dlg) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal fade" id="pgModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div class="modal-content"><div class="modal-header"><h5 class="modal-title fw-bold" id="pgModalT"></h5><button type="button" class="btn-close ms-0" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
        <div class="modal-body" id="pgModalB"></div></div></div></div>`);
      dlg = $('#pgModal');
    }
    $('#pgModalT').innerHTML = title;
    $('#pgModalB').innerHTML = body;
    bootstrap.Modal.getOrCreateInstance(dlg).show();
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  return { $, esc, norm, WEEK, JS_DAY, MODE, toMin, toTime, live, dur, mins, ago, count: say, amman, PALETTE, numDate, getJSON, sectionKey, shortName, weekGrid, updatedLine, modal, download,
    setDays: d => { DAYS = d; }, get DAYS() { return DAYS; } };
})();
