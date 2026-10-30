/* Now on campus: lectures running now and starting soon, rooms free now, upcoming calendar dates.
   Amman time, refreshed every minute. ?kiosk=1 for lobby screens, ?at=2026-10-27T10:30 to look at another moment. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let TT, S, CAL, IDX;
  const P = new URLSearchParams(location.search);
  const KIOSK = P.get('kiosk') === '1';
  const st = { fac: P.get('fac') || '', bld: P.get('bld') || '', q: '', tab: { run: '', soon: '' } };

  // the moment shown: Amman clock (or ?at=) as date, day letter and minutes
  function moment() {
    // ?at=2026-10-27, 2026-10-27T10:30 or 2026-10-27T10:30:00 are read as Amman time (an explicit offset is kept)
    const at = P.get('at');
    let d = new Date();
    if (at) {
      const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/);
      const x = m ? new Date(`${m[1]}T${m[2] || '08:00'}:${m[3] || '00'}${m[4] || '+03:00'}`) : new Date(NaN);
      if (!isNaN(x)) d = x;
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
    const hour = +parts.hour % 24;  // some engines write midnight as 24
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { iso: `${parts.year}-${parts.month}-${parts.day}`, day: U.JS_DAY[wd], min: hour * 60 + +parts.minute,
      clock: `${String(hour).padStart(2, '0')}:${parts.minute}` };
  }
  function teachingStatus(now) { return dayStatus(now.iso, now.day); }
  function dayStatus(iso, day) {
    const T = IDX.teaching;
    if (T && iso < T.start) return { ok: false, why: `يبدأ التدريس في ${U.numDate(T.start)}` };
    if (T && iso > T.end) return { ok: false, why: `انتهى التدريس للفصل في ${U.numDate(T.end)}` };
    if (T && T.holidays.includes(iso)) return { ok: false, why: 'اليوم عطلة رسمية حسب التقويم الجامعي' };
    if (day === 'ج') return { ok: false, why: 'يوم الجمعة' };
    return { ok: true };
  }
  const inScope = s => (!st.fac || s.faculty === st.fac) && (!st.bld || s.building === st.bld)
    && (!st.q || norm([s.code, s.name, s.instructor, s.room, s.building].join(' ')).includes(st.q));
  const meetingsOn = day => S.flatMap(s => s.meetings.filter(m => live(m) && m.day === day).map(m => ({ s, m, a: toMin(m.start), b: toMin(m.end) })));
  // the next day with teaching after the given date (within three weeks)
  function nextTeachingDay(iso) {
    const d = new Date(iso + 'T12:00:00Z');
    for (let i = 1; i <= 21; i++) {
      d.setUTCDate(d.getUTCDate() + 1);
      const di = d.toISOString().slice(0, 10), day = U.JS_DAY[d.getUTCDay()];
      if (dayStatus(di, day).ok && meetingsOn(day).length) return { iso: di, day };
    }
    return null;
  }
  const dm = iso => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
  const bShort = b => String(b || '').replace(/^مبنى\s+/, '').replace(/^كلية\s+/, '');
  const BICON = b => [[/الإعلام|الاعلام/, 'bi-broadcast-pin'], [/الصيدلة/, 'bi-capsule'], [/الهندسة/, 'bi-gear-wide-connected'], [/تكنولوجيا المعلومات/, 'bi-cpu'],
    [/العمارة|التصميم/, 'bi-vector-pen'], [/الآداب/, 'bi-book-half'], [/الإدارية|الادارية/, 'bi-graph-up-arrow'], [/الأسنان/, 'bi-heart-pulse'], [/المكتبة/, 'bi-book'],
    [/مسرح/, 'bi-mask'], [/الكفاتيريا|الكافتيريا/, 'bi-cup-hot']].find(([re]) => re.test(b || ''))?.[1] || 'bi-building';

  // how busy the day is: lectures running in each half hour from the first start to the last end, and the moment now
  function timeline(list, nowMin) {
    if (!list.length) return '';
    const lo = Math.floor(Math.min(...list.map(x => x.a)) / 60) * 60, hi = Math.ceil(Math.max(...list.map(x => x.b)) / 60) * 60;
    const slots = []; for (let t = lo; t < hi; t += 30) slots.push([t, list.filter(x => x.a < t + 30 && x.b > t).length]);
    const max = Math.max(1, ...slots.map(s => s[1])), peak = slots.reduce((p, s) => s[1] > p[1] ? s : p, slots[0]);
    const pos = nowMin != null && nowMin >= lo && nowMin <= hi ? (100 * (nowMin - lo) / (hi - lo)) : null;
    return `<div class="nw-tl"><div class="nw-tlb">${slots.map(([t, n]) => `<i class="${nowMin != null && t + 30 <= nowMin ? 'past' : ''} ${nowMin != null && t <= nowMin && nowMin < t + 30 ? 'cur' : ''}" style="height:${Math.max(4, 100 * n / max)}%" title="${toTime(t)}–${toTime(t + 30)}: ${n} محاضرة"></i>`).join('')}
        ${pos != null ? `<span class="nw-now" style="inset-inline-start:${pos}%"><b dir="ltr">${toTime(nowMin)}</b></span>` : ''}</div>
      <div class="nw-tll">${slots.filter(([t]) => t % 60 === 0).map(([t]) => `<span style="inset-inline-start:${100 * (t - lo) / (hi - lo)}%" dir="ltr">${toTime(t).replace(/^0/, '')}</span>`).join('')}</div>
      <p class="nw-tlnote"><i class="bi bi-graph-up"></i> الذروة ${toTime(peak[0])}–${toTime(peak[0] + 30)} (${peak[1]} محاضرة) · أول محاضرة ${toTime(lo)} · آخر محاضرة تنتهي ${toTime(hi)}</p></div>`;
  }

  function render() {
    const now = moment();
    const T = teachingStatus(now);
    const today = meetingsOn(now.day);
    const scoped = today.filter(x => inScope(x.s));
    const running = T.ok ? scoped.filter(x => x.a <= now.min && now.min < x.b).sort((x, y) => x.b - y.b) : [];
    const soon = T.ok ? scoped.filter(x => x.a > now.min && x.a <= now.min + 60).sort((x, y) => x.a - y.a) : [];
    const laterL = T.ok ? scoped.filter(x => x.a > now.min + 60) : [];
    const doneN = T.ok ? scoped.filter(x => x.b <= now.min).length : 0;
    // rooms: free now and until when (all sections of the university count for occupancy)
    const rooms = [...new Set(S.filter(s => s.room !== '0' && (!st.bld || s.building === st.bld) && (!st.fac || s.faculty === st.fac)).map(s => s.room))];
    const bld = Object.fromEntries(S.map(s => [s.room, s.building]));
    const freeRooms = T.ok ? rooms.map(r => {
      const its = today.filter(x => x.s.room === r);
      if (its.some(x => x.a <= now.min && now.min < x.b)) return null;
      const next = its.filter(x => x.a > now.min).sort((x, y) => x.a - y.a)[0];
      return { r, b: bld[r], until: next ? next.a : null };
    }).filter(Boolean).sort((a, b) => (b.until || 1e9) - (a.until || 1e9) || a.r.localeCompare(b.r)) : [];
    const byBld = {};
    freeRooms.forEach(x => (byBld[x.b] ||= []).push(x));
    // upcoming dates from the academic calendar (14 days)
    const end = new Date(now.iso); end.setDate(end.getDate() + 14);
    const endIso = end.toISOString().slice(0, 10);
    const events = CAL.semesters.flatMap(s => s.events).filter(e => e.end >= now.iso && e.start <= endIso).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
    const facs = [...new Set(S.map(s => s.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));
    const blds = [...new Set(S.map(s => s.building).filter(b => !/^-+$/.test(b)))].sort((a, b) => a.localeCompare(b, 'ar'));
    // what changes next: the nearest end or start
    const nextChange = T.ok ? Math.min(...scoped.flatMap(x => [x.a, x.b]).filter(t => t > now.min), 1e9) : 1e9;
    const nx = T.ok ? null : nextTeachingDay(now.iso);
    const nxList = nx ? meetingsOn(nx.day).filter(x => inScope(x.s)) : [];
    const row = x => `<a class="nw-row" href="${x.s.room === '0' ? 'timetable.html?q=' + encodeURIComponent(x.s.code) : 'room.html?r=' + encodeURIComponent(x.s.room)}" title="${esc(x.s.code + ' ' + x.s.name + ' – ' + x.s.instructor)}">
        <span class="nw-room ${x.s.room === '0' || x.m.mode === 'الكتروني كامل' ? 'on' : ''}">${x.s.room === '0' || x.m.mode === 'الكتروني كامل' ? '<i class="bi bi-camera-video-fill"></i><small>إلكتروني</small>' : `<b dir="ltr">${esc(x.s.room)}</b><small>${esc(bShort(x.s.building))}</small>`}</span>
        <span class="nw-what"><b>${esc(x.s.name)}</b><small><bdi dir="ltr">${esc(x.s.code)}</bdi> · ش${esc(x.s.section)} · ${esc(U.shortName(x.s.instructor))}</small></span>
        <span class="nw-when"><b dir="ltr">${x.m.start}–${x.m.end}</b>${x.a <= now.min ? `<span class="nw-prog"><i style="width:${Math.round(100 * (now.min - x.a) / (x.b - x.a))}%"></i></span><small>تنتهي بعد ${U.mins(x.b - now.min)}</small>`
          : `<small class="soon">تبدأ بعد ${U.mins(x.a - now.min)}</small>`}</span></a>`;
    // a long list is shown by building: tabs with counts, and in «الكل» the first rows of each building
    const bOf = x => x.s.room === '0' || x.m.mode === 'الكتروني كامل' ? 'إلكتروني' : x.s.building;
    const grouped = (list, key, emptyHtml) => {
      if (!list.length) return emptyHtml;
      const g = {}; list.forEach(x => (g[bOf(x)] ||= []).push(x));
      const names = Object.keys(g).sort((a, b) => g[b].length - g[a].length);
      let cur = st.tab[key]; if (cur && !g[cur]) cur = st.tab[key] = '';
      const tabs = names.length > 1 ? `<div class="nw-tabs" role="tablist">${[['', 'الكل', list.length, 'bi-grid']].concat(names.map(n => [n, bShort(n), g[n].length, n === 'إلكتروني' ? 'bi-camera-video' : BICON(n)]))
        .map(([k, l, n, i]) => `<button type="button" role="tab" aria-selected="${cur === k}" class="${cur === k ? 'on' : ''}" data-tb="${key}" data-b="${esc(k)}"><i class="bi ${i}"></i> ${esc(l)} <b>${n}</b></button>`).join('')}</div>` : '';
      const body = cur ? `<div class="nw-list">${g[cur].map(row).join('')}</div>`
        : '<div class="nw-grps">' + names.map(n => `<div class="nw-grp"><div class="nw-gh"><i class="bi ${n === 'إلكتروني' ? 'bi-camera-video' : BICON(n)}"></i> ${esc(bShort(n))} <em>${g[n].length}</em></div><div class="nw-list">${g[n].slice(0, 3).map(row).join('')}</div>
            ${g[n].length > 3 ? `<button type="button" class="nw-more" data-tb="${key}" data-b="${esc(n)}">عرض كل محاضرات ${esc(bShort(n))} (${g[n].length}) <i class="bi bi-chevron-left"></i></button>` : ''}</div>`).join('') + '</div>';
      return tabs + body;
    };
    const bchips = list => { const c = {}; list.forEach(x => { const b = x.s.room === '0' ? 'إلكتروني' : x.s.building; c[b] = (c[b] || 0) + 1; });
      return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([b, n]) => `<span class="nw-bc"><i class="bi ${b === 'إلكتروني' ? 'bi-camera-video' : BICON(b)}"></i>${esc(bShort(b))} <b>${n}</b></span>`).join(''); };

    $('#pg-title').innerHTML = `الآن في الجامعة <span class="now-clock" dir="ltr">${now.clock}</span>`;
    $('#pg-sub').textContent = `${U.DAYS[now.day] || ''} ${U.numDate(now.iso)} · ${TT.term}${P.get('at') ? ' · (وقت محدد للعرض)' : ''}`;
    const kpi = (v, l, i, c) => `<div class="nw-k" style="--c:${c}"><i class="bi ${i}"></i><b>${v}</b><span>${l}</span></div>`;
    $('#now-app').innerHTML = `
      ${KIOSK ? '' : `<div class="nw-bar no-print">
        <label class="nw-sel"><i class="bi bi-bank2"></i><select id="now-fac" aria-label="الكلية"><option value="">كل الكليات</option>${facs.map(f => `<option ${f === st.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label class="nw-sel"><i class="bi bi-building"></i><select id="now-bld" aria-label="المبنى"><option value="">كل المباني</option>${blds.map(b => `<option ${b === st.bld ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
        ${st.q ? `<span class="nw-q"><i class="bi bi-search"></i> «${esc(P.get('q') || st.q)}»</span>` : ''}
        <span class="nw-live"><span class="dot"></span> مباشر · تتحدّث كل دقيقة</span>
        <a class="nw-kiosk" href="?kiosk=1${st.fac ? '&fac=' + encodeURIComponent(st.fac) : ''}${st.bld ? '&bld=' + encodeURIComponent(st.bld) : ''}"><i class="bi bi-display"></i> وضع الشاشة</a></div>`}
      <section class="nw-hero ${T.ok ? 'on' : 'off'}">
        <div class="nw-clock"><b dir="ltr">${now.clock}</b><span>${U.DAYS[now.day] || ''} ${U.numDate(now.iso)}</span></div>
        <div class="nw-state">${T.ok
          ? `<span class="nw-tag on"><span class="dot"></span> التدريس جارٍ الآن</span><h2>${running.length ? `${running.length} محاضرة جارية في ${new Set(running.map(x => x.s.building)).size} مبنى` : soon.length ? `أقرب محاضرة تبدأ بعد ${U.mins(soon[0].a - now.min)}` : laterL.length ? 'استراحة بين المحاضرات' : 'انتهت محاضرات اليوم'}</h2>
             <p>${nextChange < 1e9 ? `التغيير القادم الساعة <b dir="ltr">${toTime(nextChange)}</b> (بعد ${U.mins(nextChange - now.min)}) · ` : ''}انتهت اليوم ${doneN} · بقيت ${soon.length + laterL.length}</p>`
          : `<span class="nw-tag off"><i class="bi bi-moon-stars-fill"></i> لا تدريس الآن</span><h2>${esc(T.why)}</h2>
             <p>${nx ? `يعود التدريس <b>${U.DAYS[nx.day] || ''} ${U.numDate(nx.iso)}</b> · ${nxList.length} محاضرة، أولها الساعة <b dir="ltr">${nxList.length ? toTime(Math.min(...nxList.map(x => x.a))) : '—'}</b>` : 'لا أيام تدريس قريبة في التقويم.'}</p>`}</div>
        <div class="nw-kpis">${kpi(running.length, 'جارية الآن', 'bi-broadcast', '#901d23')}${kpi(soon.length, 'خلال ساعة', 'bi-hourglass-split', '#b45309')}${kpi(laterL.length, 'لاحقاً اليوم', 'bi-calendar-event', '#0b4a66')}${kpi(freeRooms.length, 'قاعة شاغرة', 'bi-door-open-fill', '#15803d')}</div>
      </section>
      <section class="nw-card nw-day"><h3><i class="bi bi-bar-chart-steps"></i> ${T.ok ? 'حركة اليوم' : nx ? `حركة ${U.DAYS[nx.day] || ''} ${U.numDate(nx.iso)}` : 'حركة اليوم'} <small>عدد المحاضرات في كل نصف ساعة${st.fac || st.bld || st.q ? ' ضمن التصفية' : ''}</small></h3>
        ${timeline(T.ok ? scoped : nxList, T.ok ? now.min : null) || '<p class="nw-empty">لا محاضرات.</p>'}</section>
      <div class="nw-grid">
        <div class="nw-main">
          <section class="nw-card"><h3><span class="nw-dot live"></span> جارية الآن <b class="nw-n">${running.length}</b></h3>
            ${grouped(running, 'run', `<p class="nw-empty"><i class="bi bi-cup-hot"></i> ${T.ok ? 'لا محاضرات جارية الآن ضمن التصفية.' : 'لا محاضرات اليوم.'}</p>`)}</section>
          <section class="nw-card"><h3><i class="bi bi-hourglass-split" style="color:#b45309"></i> تبدأ خلال ساعة <b class="nw-n">${soon.length}</b></h3>
            ${grouped(soon, 'soon', '') || `<p class="nw-empty">${T.ok ? 'لا محاضرات تبدأ خلال الساعة القادمة.' : nx ? `أول محاضرات ${U.DAYS[nx.day] || ''}: ` + nxList.filter(x => x.a === Math.min(...nxList.map(y => y.a))).length + ' محاضرة الساعة ' + toTime(Math.min(...nxList.map(y => y.a))) : '—'}</p>`}</section>
        </div>
        <aside class="nw-side">
          <section class="nw-card"><h3><i class="bi bi-door-open-fill" style="color:#15803d"></i> قاعات شاغرة الآن <b class="nw-n">${freeRooms.length}</b></h3>
            <div class="nw-legend"><span><i class="g"></i> بقية اليوم</span><span><i class="y"></i> أكثر من ساعة</span><span><i class="r"></i> أقل من ساعة</span></div>
            ${Object.entries(byBld).sort((a, b) => b[1].length - a[1].length).map(([b, rs]) => `<div class="nw-fb"><b><i class="bi ${BICON(b)}"></i> ${esc(bShort(b))} <em>${rs.length}</em></b><div>${rs.slice(0, 12).map(x =>
              `<a class="nw-free ${!x.until ? 'g' : x.until - now.min >= 60 ? 'y' : 'r'}" href="room.html?r=${encodeURIComponent(x.r)}" title="${x.until ? 'شاغرة حتى ' + toTime(x.until) : 'شاغرة لبقية اليوم'} · صفحة القاعة"><b dir="ltr">${esc(x.r)}</b><small>${x.until ? 'حتى ' + toTime(x.until) : 'كل اليوم'}</small></a>`).join('')}${rs.length > 12 ? `<a class="nw-free more" href="usage.html" title="كل القاعات في صفحة إشغال القاعات"><b>+${rs.length - 12}</b><small>أخرى</small></a>` : ''}</div></div>`).join('')
              || `<p class="nw-empty">${T.ok ? 'لا قاعات شاغرة ضمن التصفية.' : 'كل القاعات متاحة؛ لا تدريس اليوم.'}</p>`}</section>
          <section class="nw-card"><h3><i class="bi bi-calendar3" style="color:#901d23"></i> مواعيد خلال أسبوعين</h3>
            ${events.map(e => { const on = e.start <= now.iso, dd = Math.round((Date.parse(e.start) - Date.parse(now.iso)) / 864e5);
              return `<a class="nw-ev ${on ? 'on' : ''}" href="calendar.html?q=${encodeURIComponent(e.title.slice(0, 20))}"><span class="d"><b dir="ltr">${dm(e.start)}${e.end !== e.start ? ' – ' + dm(e.end) : ''}</b><small>${on ? 'جارٍ الآن' : dd === 1 ? 'غداً' : 'بعد ' + U.count(dd, 'يوم', 'يومين', 'أيام', 'يوماً')}</small></span><span class="t">${esc(e.title)}</span></a>`; }).join('')
              || '<p class="nw-empty">لا مواعيد في الأسبوعين القادمين.</p>'}</section>
        </aside>
      </div>`;
    const f = $('#now-fac'), b = $('#now-bld');
    if (f) f.addEventListener('change', e => { st.fac = e.target.value; sync(); render(); });
    if (b) b.addEventListener('change', e => { st.bld = e.target.value; sync(); render(); });
    document.querySelectorAll('[data-tb]').forEach(x => x.addEventListener('click', () => { st.tab[x.dataset.tb] = x.dataset.b; const y = scrollY; render(); scrollTo(0, y); }));
  }
  if (!document.getElementById('nw-css')) document.head.insertAdjacentHTML('beforeend', `<style id="nw-css">
    .nw-bar { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .45rem .6rem; margin-bottom: .8rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .nw-sel { display: flex; align-items: center; gap: .35rem; margin: 0; height: 34px; padding: 0 .6rem; border: 1px solid #dee2e6; border-radius: 9px; background: #fff; color: #901d23; }
    .nw-sel select { border: 0; outline: 0; background: transparent; font-size: .85rem; font-weight: 600; color: #091b22; max-width: 240px; }
    .nw-q { font-size: .8rem; color: #0b4a66; background: #eef4f7; border-radius: 99px; padding: .15rem .6rem; }
    .nw-live { margin-inline-start: auto; font-size: .78rem; font-weight: 700; color: #15803d; display: inline-flex; align-items: center; gap: .35rem; }
    .nw-live .dot, .nw-tag.on .dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 0 rgba(22,163,74,.6); animation: nw-p 1.6s infinite; }
    @keyframes nw-p { 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
    .nw-kiosk { font-size: .8rem; font-weight: 700; color: #0b4a66; text-decoration: none; border: 1px solid #d6e4ec; border-radius: 9px; padding: .3rem .7rem; } .nw-kiosk:hover { background: #eef4f7; }
    .nw-hero { display: grid; grid-template-columns: auto 1fr auto; gap: 1.2rem; align-items: center; border-radius: 18px; padding: 1rem 1.3rem; margin-bottom: .8rem; color: #fff;
      background: radial-gradient(circle at 15% 20%, rgba(255,255,255,.08), transparent 45%), linear-gradient(120deg, #0b2a3a, #0b4a66 60%, #12617f); box-shadow: 0 10px 28px rgba(9,27,34,.18); }
    .nw-hero.off { background: radial-gradient(circle at 15% 20%, rgba(255,255,255,.07), transparent 45%), linear-gradient(120deg, #1f2937, #334155 60%, #3f4c63); }
    .nw-clock { text-align: center; padding-inline-end: 1.2rem; border-inline-end: 1px solid rgba(255,255,255,.18); }
    .nw-clock b { display: block; font-size: 2.6rem; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; } .nw-clock span { font-size: .8rem; opacity: .8; }
    .nw-tag { display: inline-flex; align-items: center; gap: .4rem; font-size: .76rem; font-weight: 800; border-radius: 99px; padding: .15rem .65rem; background: rgba(255,255,255,.14); }
    .nw-tag.on { background: rgba(22,163,74,.22); color: #bbf7d0; } .nw-tag.off { color: #e2e8f0; }
    .nw-state h2 { font-size: 1.35rem; font-weight: 800; margin: .35rem 0 .2rem; color: #fff; } .nw-state p { margin: 0; font-size: .85rem; color: #d7e3ea; } .nw-state p b { color: #fde68a; }
    .nw-kpis { display: grid; grid-template-columns: repeat(4, auto); gap: .45rem; }
    .nw-k { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: .4rem; align-items: center; background: #fff; border-radius: 12px; padding: .45rem .75rem; min-width: 104px; }
    .nw-k i { grid-row: 1 / 3; font-size: 1.1rem; color: var(--c); } .nw-k b { font-size: 1.4rem; line-height: 1.05; color: var(--c); font-weight: 800; } .nw-k span { font-size: .7rem; color: #475569; white-space: nowrap; }
    .nw-card { background: #fff; border: 1px solid #ece6d8; border-radius: 14px; padding: .8rem .95rem; margin-bottom: .8rem; box-shadow: 0 2px 10px rgba(9,27,34,.04); }
    .nw-card > h3 { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem; font-size: .98rem; font-weight: 800; color: #091b22; margin: 0 0 .6rem; }
    .nw-card > h3 small { font-size: .72rem; font-weight: 500; color: #8a6d2e; }
    .nw-n { font-size: .74rem; color: #fff; background: #091b22; border-radius: 99px; padding: .02rem .5rem; }
    .nw-dot.live { width: 10px; height: 10px; border-radius: 50%; background: #dc2626; box-shadow: 0 0 0 0 rgba(220,38,38,.6); animation: nw-r 1.6s infinite; }
    @keyframes nw-r { 70% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }
    .nw-bcs { display: flex; flex-wrap: wrap; gap: .3rem; margin-inline-start: auto; } .nw-bc { font-size: .7rem; font-weight: 600; color: #0b4a66; background: #eef4f7; border-radius: 99px; padding: .08rem .5rem; } .nw-bc i { margin-inline-end: .2rem; } .nw-bc b { color: #901d23; }
    .nw-tabs { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .5rem; }
    .nw-tabs button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; padding: .25rem .65rem; border-radius: 99px; border: 1px solid #d6e4ec; background: #fff; font-size: .78rem; font-weight: 700; color: #0b4a66; }
    .nw-tabs button b { font-size: .68rem; background: #eef4f7; border-radius: 99px; padding: 0 .4rem; color: #901d23; } .nw-tabs button:hover { background: #eef4f7; }
    .nw-tabs button.on { background: #0b4a66; border-color: #0b4a66; color: #fff; } .nw-tabs button.on b { background: rgba(255,255,255,.22); color: #fff; }
    .nw-grps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
    .nw-grp { border: 1px solid #ece6d8; border-radius: 12px; padding: .35rem .6rem .2rem; background: #fdfcf9; }
    .nw-grp .nw-row { grid-template-columns: 70px minmax(0, 1fr); padding: .45rem .1rem; } .nw-grp .nw-when { grid-column: 2; display: flex; align-items: center; gap: .5rem; } .nw-grp .nw-when .nw-prog { flex: 1; margin: 0; }
    .nw-free.more { --c: #0b4a66; }
    @media (max-width: 900px) { .nw-grps { grid-template-columns: 1fr; } }
    .nw-gh { display: flex; align-items: center; gap: .35rem; font-size: .8rem; font-weight: 800; color: #0b4a66; padding: .2rem 0; } .nw-gh em { font-style: normal; font-size: .7rem; color: #901d23; }
    .nw-grp .nw-row:first-child { border-top: 0; }
    .nw-more { all: unset; cursor: pointer; display: block; width: 100%; text-align: center; font-size: .78rem; font-weight: 700; color: #901d23; padding: .35rem 0 .2rem; } .nw-more:hover { text-decoration: underline; }
    .nw-tl { position: relative; direction: ltr; } .nw-tlnote { direction: rtl; text-align: right; } .nw-tlb { position: relative; display: flex; align-items: flex-end; gap: 2px; height: 70px; border-bottom: 1px solid #e5e7eb; }
    .nw-tlb i { flex: 1; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #12617f, #0b4a66); opacity: .85; } .nw-tlb i.past { background: #cbd5e1; } .nw-tlb i.cur { background: linear-gradient(180deg, #dc2626, #901d23); opacity: 1; }
    .nw-now { position: absolute; top: -6px; bottom: -4px; width: 2px; background: #dc2626; transform: translateX(-50%); } .nw-now b { position: absolute; top: -1.2rem; left: 50%; transform: translateX(-50%); font-size: .66rem; color: #fff; background: #dc2626; border-radius: 4px; padding: 0 .3rem; }
    .nw-tll { position: relative; height: 1.2rem; font-size: .66rem; color: #64748b; } .nw-tll span { position: absolute; transform: translateX(-50%); top: .15rem; }
    .nw-tlnote { margin: .2rem 0 0; font-size: .76rem; color: #0b4a66; }
    .nw-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: .8rem; align-items: start; } .nw-side .nw-card, .nw-main .nw-card { margin-bottom: .8rem; }
    .nw-list { display: grid; } .nw-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) 170px; gap: .8rem; align-items: center; padding: .55rem .2rem; border-top: 1px solid #f1ede3; text-decoration: none; color: #13222a; }
    .nw-row:hover { background: #fbf7f0; } .nw-room { text-align: center; background: #f1f6f9; border-radius: 10px; padding: .3rem .2rem; } .nw-room b { display: block; font-size: 1.05rem; color: #0b2a3a; font-weight: 800; } .nw-room small { display: block; font-size: .64rem; color: #475569; line-height: 1.2; }
    .nw-room.on { background: #eef2ff; color: #3730a3; } .nw-room.on i { font-size: 1.1rem; }
    .nw-what b { display: block; font-size: .9rem; color: #091b22; } .nw-what small { display: block; font-size: .74rem; color: #475569; }
    .nw-when b { display: block; font-size: .82rem; color: #0b2a3a; font-variant-numeric: tabular-nums; } .nw-when small { display: block; font-size: .7rem; color: #901d23; font-weight: 700; } .nw-when small.soon { color: #b45309; }
    .nw-prog { display: block; height: 6px; background: #eef0f4; border-radius: 99px; overflow: hidden; margin: .2rem 0; } .nw-prog i { display: block; height: 100%; background: linear-gradient(90deg, #901d23, #dc2626); }
    .nw-empty { margin: 0; padding: .6rem .2rem; font-size: .84rem; color: #8a6d2e; }
    .nw-legend { display: flex; gap: .8rem; font-size: .7rem; color: #475569; margin-bottom: .4rem; } .nw-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-inline-end: .25rem; vertical-align: middle; }
    .nw-legend .g, .nw-free.g { --c: #15803d; } .nw-legend .y, .nw-free.y { --c: #b45309; } .nw-legend .r, .nw-free.r { --c: #b42318; } .nw-legend i { background: var(--c); }
    .nw-fb { padding: .4rem 0; border-top: 1px dashed #ece6d8; } .nw-fb > b { display: flex; align-items: center; gap: .3rem; font-size: .8rem; color: #091b22; margin-bottom: .3rem; } .nw-fb > b i { color: #0b4a66; } .nw-fb > b em { font-style: normal; font-size: .68rem; color: #8a6d2e; }
    .nw-fb > div { display: flex; flex-wrap: wrap; gap: 5px; }
    .nw-free { display: inline-flex; flex-direction: column; align-items: center; min-width: 62px; padding: 3px 7px; border-radius: 8px; background: color-mix(in srgb, var(--c) 9%, #fff); border: 1px solid color-mix(in srgb, var(--c) 35%, #fff); text-decoration: none; }
    .nw-free b { font-size: .85rem; color: var(--c); } .nw-free small { font-size: .62rem; color: #475569; } .nw-free:hover { background: color-mix(in srgb, var(--c) 16%, #fff); }
    .nw-ev { display: flex; gap: .6rem; align-items: center; padding: .45rem 0; border-top: 1px dashed #ece6d8; text-decoration: none; color: #13222a; }
    .nw-ev .d { flex: none; min-width: 5.8rem; text-align: center; background: #f1f6f9; border-radius: 9px; padding: .2rem .3rem; } .nw-ev .d b { display: block; font-size: .8rem; color: #0b2a3a; } .nw-ev .d small { font-size: .64rem; color: #901d23; font-weight: 700; }
    .nw-ev.on .d { background: #fef3c7; } .nw-ev .t { font-size: .8rem; font-weight: 600; line-height: 1.5; } .nw-ev:hover .t { color: #901d23; }
    @media (max-width: 1100px) { .nw-hero { grid-template-columns: auto 1fr; } .nw-kpis { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); } .nw-grid { grid-template-columns: 1fr; } }
    @media (max-width: 600px) { .nw-hero { grid-template-columns: 1fr; text-align: center; } .nw-clock { border: 0; padding: 0; } .nw-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .nw-row { grid-template-columns: 70px minmax(0, 1fr); } .nw-when { grid-column: 2; } .nw-live { margin-inline-start: 0; } }
    body.kiosk .nw-hero { font-size: 1.1em; }
  </style>`);
  function sync() {
    const p = new URLSearchParams(location.search);
    ['fac', 'bld'].forEach(k => st[k] ? p.set(k, st[k]) : p.delete(k));
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/calendar.json'), U.getJSON('data/instructors.json')]).then(([tt, cal, idx]) => {
    TT = tt; S = tt.sections; CAL = cal; IDX = idx;
    U.setDays(tt.days);
    if (KIOSK) document.body.classList.add('kiosk');
    $('#foot-count').textContent = `${S.length} شعبة · ${tt.term}`;
    U.updatedLine(tt.updated, 'تتحدّث كل دقيقة');
    render();
    setInterval(render, 60000);
    // screens stay on for days: re-read the data every 15 minutes so changes and cancellations show up
    setInterval(() => Promise.all([U.getJSON('data/timetable.json', true), U.getJSON('data/calendar.json', true), U.getJSON('data/instructors.json', true)])
      .then(([t2, c2, i2]) => { TT = t2; S = t2.sections; CAL = c2; IDX = i2; U.updatedLine(t2.updated, 'تتحدّث كل دقيقة'); render(); }).catch(() => {}), 15 * 60000);
    let t;
    $('#pg-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = norm(e.target.value.trim()); render(); }, 200); });
  }).catch(e => { $('#now-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
