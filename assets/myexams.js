/* «امتحاناتي»: a student picks their courses (and section) and sees each exam's day, time and room, with a countdown,
   a calendar file and a link to share; the whole published timetable by day; and, with ?ins=<name>, a proctor's duties.
   Everything comes from the timetable the exams committee published (data/exam_schedule.json); the student's choice is
   kept on their own phone only. ?c=601222 (or 601222,603385) opens with those courses chosen — the QR code on the
   attendance lists and the building screens points here. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc } = U;
  const P = new URLSearchParams(location.search);
  const KEY = 'uop-myexams';
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const wd = iso => WD[new Date(iso + 'T12:00:00Z').getUTCDay()];
  const dm = iso => `${+iso.slice(8)}/${+iso.slice(5, 7)}`;
  const toMin = U.toMin;
  const HASH = {}, sha = t => crypto.subtle.digest('SHA-1', new TextEncoder().encode(t)).then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''));
  const FEED = f => location.origin + location.pathname.replace(/[^/]*$/, '') + 'data/ics/exams/' + f;
  // a calendar that updates itself (built every hour from the published timetable by scripts/exam_ics.py), with reminders
  const subBtns = (file, what) => `<div class="me-sub"><b><i class="bi bi-bell-fill"></i> تذكير تلقائي</b><span>${what}: تذكير مساء اليوم السابق وقبل الموعد بساعة، ويتحدّث وحده إن تغيّر الجدول.</span>
    <a class="btn btn-sm btn-ex" href="${FEED(file).replace(/^https?:/, 'webcal:')}"><i class="bi bi-apple"></i> iPhone / Outlook</a>
    <a class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(FEED(file).replace(/^https?:/, 'webcal:'))}"><i class="bi bi-google"></i> تقويم Google</a>
    <button class="btn btn-sm btn-outline-secondary" data-copy="${FEED(file)}"><i class="bi bi-link-45deg"></i> نسخ الرابط</button></div>`;
  let EX, BY, tab = P.get('ins') ? 'ins' : P.get('fac') ? 'fac' : P.get('tab') || 'mine', q = '', facF = '', insQ = P.get('ins') || '', facT = P.get('fac') || '';
  let ST = { codes: [], sec: {} };
  try { ST = Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* private mode */ } };
  (P.get('c') || '').split(/[,\s]+/).filter(Boolean).forEach(c => { if (!ST.codes.includes(c)) ST.codes.push(c); });

  function when(e, now) {
    const a = toMin(e.from), b = toMin(e.to);
    if (e.date === now.iso) return now.min < a ? ['today', `اليوم بعد ${U.mins(a - now.min)}`] : now.min < b ? ['now', 'جارٍ الآن'] : ['past', 'انتهى'];
    if (e.date < now.iso) return ['past', 'انتهى'];
    const d = Math.round((Date.parse(e.date) - Date.parse(now.iso)) / 864e5);
    return [d <= 2 ? 'soon' : 'later', d === 1 ? 'غداً' : `بعد ${U.count(d, 'يوم', 'يومين', 'أيام')}`];
  }
  const secsOf = e => [...new Set(e.rooms.flatMap(r => r.secs || []))].sort((a, b) => +a - +b);
  const myRooms = e => { const s = ST.sec[e.code]; return s ? e.rooms.filter(r => (r.secs || []).includes(s)) : []; };
  function card(e, now) {
    const [k, label] = when(e, now), mine = myRooms(e), secs = secsOf(e);
    return `<article class="me-card ${k}"><div class="me-date"><b>${wd(e.date)}</b><span>${dm(e.date)}</span><small>${e.date.slice(0, 4)}</small></div>
      <div class="me-b"><div class="me-h"><span class="me-code" dir="ltr">${esc(e.code)}</span><b>${esc(e.name)}</b><span class="me-when ${k}">${label}</span></div>
        <div class="me-t"><i class="bi bi-clock"></i> <bdi dir="ltr">${e.from} – ${e.to}</bdi><span>· ${esc(e.dept)}</span></div>
        ${mine.length ? `<div class="me-mine"><i class="bi bi-geo-alt-fill"></i> قاعتك: ${mine.map(r => `<b dir="ltr">${esc(r.room)}</b>${r.lab ? ' <small>(مختبر)</small>' : ''}`).join(' أو ')}
          <a class="me-map" href="campus.html?room=${encodeURIComponent(mine[0].room)}"><i class="bi bi-map"></i> أين القاعة؟</a></div>` : ''}
        <div class="me-rooms">${e.rooms.map(r => `<span class="${mine.includes(r) ? 'on' : ''}${r.lab ? ' lab' : ''}"><i class="bi ${r.lab ? 'bi-pc-display' : 'bi-door-open'}"></i> <b dir="ltr">${esc(r.room)}</b>${r.secs && r.secs.length ? `<small>شعبة ${esc(r.secs.join('، '))}</small>` : `<small>${r.n} طالب</small>`}</span>`).join('')}</div>
        ${secs.length > 1 && tab === 'mine' ? `<div class="me-sec"><small>شعبتي:</small>${secs.map(s => `<button class="${ST.sec[e.code] === s ? 'on' : ''}" data-sec="${esc(e.code)}|${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}</div>
      ${tab === 'mine' ? `<button class="me-x" data-rm="${esc(e.code)}" aria-label="إزالة"><i class="bi bi-x-lg"></i></button>` : `<button class="me-add ${ST.codes.includes(e.code) ? 'on' : ''}" data-add="${esc(e.code)}" aria-label="إضافة إلى امتحاناتي"><i class="bi ${ST.codes.includes(e.code) ? 'bi-check2' : 'bi-plus-lg'}"></i></button>`}</article>`;
  }
  function render() {
    const now = U.amman(P.get('at')), days = [...new Set(EX.exams.map(e => e.date))].sort();
    const mine = ST.codes.map(c => BY[c]).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
    const clash = mine.filter((e, i) => mine.some((o, j) => j !== i && o.date === e.date && toMin(o.from) < toMin(e.to) && toMin(e.from) < toMin(o.to)));
    const hits = q.length >= 2 ? EX.exams.filter(e => U.norm(e.code + ' ' + e.name).includes(U.norm(q))).slice(0, 8) : [];
    const ins = [...new Set(EX.exams.flatMap(e => e.rooms.flatMap(r => r.proc || [])))].sort((a, b) => U.shortName(a).localeCompare(U.shortName(b), 'ar'));
    $('#me-app').innerHTML = `
      <section class="me-top"><div><small>${esc(EX.term || '')}</small><h2>${esc(EX.type || 'الامتحانات')}</h2><span>${esc((EX.faculties || []).join('، '))} · ${dm(days[0])} – ${dm(days[days.length - 1])} · ${EX.exams.length} امتحاناً</span></div>
        <span class="me-pub ${EX.approved ? 'ok' : ''}"><i class="bi ${EX.approved ? 'bi-patch-check-fill' : 'bi-hourglass-split'}"></i> ${EX.approved ? 'جدول معتمد' : 'جدول مبدئي'} · نُشر ${U.numDate(EX.published.slice(0, 10))}</span></section>
      <nav class="me-tabs">${[['mine', 'bi-person-check', 'امتحاناتي', mine.length], ['all', 'bi-calendar-week', 'كل الامتحانات', EX.exams.length], ['ins', 'bi-person-badge', 'المراقبون', ''], ['fac', 'bi-tools', 'الكلية والفنيون', '']].map(([k, ic, t, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}"><i class="bi ${ic}"></i> ${t}${n !== '' ? ` <span>${n}</span>` : ''}</button>`).join('')}</nav>
      ${tab === 'mine' ? `
        <div class="me-search"><i class="bi bi-search"></i><input id="me-q" type="search" placeholder="أضف مقرراً: اكتب رمزه أو اسمه…" value="${esc(q)}" autocomplete="off">
          ${hits.length ? `<ul class="me-hits">${hits.map(e => `<li><button data-add="${esc(e.code)}"><b dir="ltr">${esc(e.code)}</b> ${esc(e.name)} <small>${wd(e.date)} ${dm(e.date)} · ${e.from}</small>${ST.codes.includes(e.code) ? ' <i class="bi bi-check2"></i>' : ''}</button></li>`).join('')}</ul>` : q.length >= 2 ? '<ul class="me-hits"><li class="none">لا مقرر بهذا الاسم أو الرمز في جدول الامتحانات</li></ul>' : ''}</div>
        ${clash.length ? `<div class="alert alert-danger"><i class="bi bi-exclamation-octagon-fill"></i> تعارض: ${clash.map(e => esc(e.code)).join(' و ')} في الوقت نفسه. راجع لجنة الامتحانات في كليتك.</div>` : ''}
        ${mine.length && ST.icsAt && ST.icsAt < EX.published ? '<div class="alert alert-warning py-2"><i class="bi bi-arrow-repeat"></i> تغيّر جدول الامتحانات بعد آخر إضافة لتقويمك؛ اضغط «أضف إلى تقويم الهاتف» من جديد لتحديث المواعيد والتذكيرات.</div>' : ''}
        ${mine.length ? `<div class="me-acts"><button class="btn btn-sm btn-ex" id="me-ics"><i class="bi bi-bell-fill"></i> أضف إلى تقويم الهاتف مع تذكير</button><button class="btn btn-sm btn-outline-primary" id="me-share"><i class="bi bi-share"></i> مشاركة</button><button class="btn btn-sm btn-outline-secondary" onclick="print()"><i class="bi bi-printer"></i> طباعة</button></div>
          <div class="me-list">${mine.map(e => card(e, now)).join('')}</div>`
          : '<div class="me-empty"><i class="bi bi-journal-plus"></i><b>اختر مقرراتك</b><span>اكتب رمز المقرر أو اسمه في البحث أعلاه، فيظهر يوم امتحانه ووقته وقاعته. يبقى اختيارك على هاتفك.</span></div>'}`
      : tab === 'all' ? `
        <div class="me-filter"><input id="me-aq" class="form-control" type="search" placeholder="ابحث: رمز أو مقرر أو قاعة…" value="${esc(q)}"><select id="me-fac" class="form-select"><option value="">كل الكليات</option>${[...new Set(EX.exams.map(e => e.fac))].sort().map(f => `<option ${facF === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        ${days.map(d => { const xs = EX.exams.filter(e => e.date === d && (!facF || e.fac === facF) && (!q || U.norm(e.code + ' ' + e.name + ' ' + e.rooms.map(r => r.room).join(' ')).includes(U.norm(q)))).sort((a, b) => toMin(a.from) - toMin(b.from) || a.code.localeCompare(b.code));
          return xs.length ? `<h3 class="me-day ${d === now.iso ? 'today' : ''}"><b>${wd(d)} ${dm(d)}</b>${d === now.iso ? '<span>اليوم</span>' : ''}<small>${xs.length} امتحان</small></h3><div class="me-list">${xs.map(e => card(e, now)).join('')}</div>` : ''; }).join('') || '<p class="text-muted">لا نتائج.</p>'}`
      : tab === 'fac' ? facView(now, days)
      : `
        <div class="me-search"><i class="bi bi-person-badge"></i><input id="me-iq" type="search" list="me-ins" placeholder="اسم المراقب…" value="${esc(insQ)}"><datalist id="me-ins">${ins.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        ${(() => { const who = ins.filter(n => insQ && (n === insQ || U.norm(n).includes(U.norm(insQ))));
          if (!insQ) return '<div class="me-empty"><i class="bi bi-person-badge"></i><b>مراقبات المدرّس</b><span>اكتب اسمك لترى مواعيد مراقباتك وقاعاتها. الرمز في كشف المراقبة المطبوع يفتح هذه الصفحة مباشرة.</span></div>';
          if (!who.length) return '<p class="text-muted">لا مراقب بهذا الاسم.</p>';
          return who.slice(0, 3).map(n => { const L = EX.exams.flatMap(e => e.rooms.filter(r => (r.proc || []).includes(n)).map(r => ({ e, r }))).sort((a, b) => a.e.date.localeCompare(b.e.date) || toMin(a.e.from) - toMin(b.e.from));
            return `<h3 class="me-day"><b>${esc(U.shortName(n))}</b><small>${L.length} مراقبة · ${new Set(L.map(x => x.e.date)).size} أيام</small></h3>${HASH[n] ? subBtns('p-' + HASH[n].slice(0, 10) + '.ics', 'مراقباتك') : ''}<div class="me-list">${L.map(({ e, r }) => { const [k, label] = when(e, now);
              return `<article class="me-card ${k}"><div class="me-date"><b>${wd(e.date)}</b><span>${dm(e.date)}</span><small>${e.date.slice(0, 4)}</small></div><div class="me-b"><div class="me-h"><span class="me-code" dir="ltr">${esc(e.code)}</span><b>${esc(e.name)}</b><span class="me-when ${k}">${label}</span></div>
                <div class="me-t"><i class="bi bi-clock"></i> <bdi dir="ltr">${e.from} – ${e.to}</bdi><span>· ${e.ins.includes(n) ? 'امتحان مقررك' : 'مراقبة'}</span></div>
                <div class="me-mine"><i class="bi bi-geo-alt-fill"></i> القاعة <b dir="ltr">${esc(r.room)}</b> · ${r.n} طالب${(r.proc || []).length > 1 ? ` · مع ${esc(r.proc.filter(x => x !== n).map(U.shortName).join('، '))}` : ''}</div></div></article>`; }).join('')}</div>`; }).join(''); })()}`}
      <p class="me-note"><i class="bi bi-info-circle"></i> المرجع المعتمد هو ما تعلنه الكلية ولجنة الامتحانات. احضر قبل الموعد بـ15 دقيقة ومعك الهوية الجامعية.</p>`;
    const inp = $('#me-q') || $('#me-aq') || $('#me-iq');
    if (inp && document.activeElement && document.activeElement.dataset.focus === inp.id) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
  // the faculty's exams room by room, for its staff and lab technicians: what to prepare each day, labs first
  function facView(now, days) {
    const facs = [...new Set(EX.exams.map(e => e.fac))].sort();
    if (!facT || !facs.includes(facT)) facT = facs.length === 1 ? facs[0] : facT;
    const pick = `<div class="me-filter"><select id="me-ft" class="form-select"><option value="">اختر الكلية…</option>${facs.map(f => `<option ${facT === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <label class="me-only"><input type="checkbox" id="me-lab" ${LABONLY ? 'checked' : ''}> المختبرات فقط</label></div>`;
    if (!facT) return pick + '<div class="me-empty"><i class="bi bi-tools"></i><b>للكلية والفنيين</b><span>اختر الكلية لترى امتحانات كل يوم قاعةً بقاعة، والمختبرات التي تحتاج تجهيزاً، مع تذكير تلقائي على الهاتف.</span></div>';
    const xs = EX.exams.filter(e => e.fac === facT);
    const up = days.filter(d => d >= now.iso);
    return pick + (HASH[facT] ? subBtns('f-' + HASH[facT].slice(0, 8) + '.ics', 'امتحانات الكلية') : '') + up.map(d => {
      const list = xs.filter(e => e.date === d && (!LABONLY || e.rooms.some(r => r.lab))).sort((a, b) => toMin(a.from) - toMin(b.from) || a.code.localeCompare(b.code));
      if (!list.length) return '';
      const labs = [...new Set(list.flatMap(e => e.rooms.filter(r => r.lab).map(r => r.room)))].sort();
      return `<h3 class="me-day ${d === now.iso ? 'today' : ''}"><b>${wd(d)} ${dm(d)}</b>${d === now.iso ? '<span>اليوم</span>' : ''}<small>${list.length} امتحان · ${new Set(list.flatMap(e => e.rooms.map(r => r.room))).size} قاعة</small></h3>
        ${labs.length ? `<div class="me-labs"><i class="bi bi-pc-display"></i> مختبرات تحتاج تجهيزاً: ${labs.map(r => `<b dir="ltr">${esc(r)}</b>`).join(' ')}</div>` : ''}
        <div class="table-responsive"><table class="table table-sm align-middle me-tbl"><thead><tr><th>الوقت</th><th>المقرر</th><th>القاعة</th><th>الطلبة</th><th>المراقبون</th></tr></thead><tbody>
        ${list.flatMap(e => e.rooms.filter(r => !LABONLY || r.lab).map((r, k) => `<tr class="${r.lab ? 'lab' : ''}">${k ? '<td></td><td></td>' : `<td dir="ltr" class="t">${e.from}–${e.to}</td><td><b dir="ltr">${esc(e.code)}</b> ${esc(e.name)}</td>`}
          <td><b dir="ltr">${esc(r.room)}</b>${r.lab ? ' <i class="bi bi-pc-display" title="مختبر"></i>' : ''}</td><td>${r.n}</td><td class="small">${esc((r.proc || []).map(U.shortName).join('، '))}</td></tr>`)).join('')}</tbody></table></div>`; }).join('');
  }
  let LABONLY = false;
  function ics() {
    const st = s => s.replace(/[-:]/g, ''), lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//uopstaff//myexams//AR', 'CALSCALE:GREGORIAN'];
    ST.codes.map(c => BY[c]).filter(Boolean).forEach(e => { const r = myRooms(e).map(x => x.room).join(' / ') || e.rooms.map(x => x.room).join(' / ');
      lines.push('BEGIN:VEVENT', `UID:${e.code}-${e.date}@uopstaff`, `DTSTAMP:${st(new Date().toISOString().slice(0, 19))}Z`, `DTSTART;TZID=Asia/Amman:${st(e.date)}T${st(e.from)}00`, `DTEND;TZID=Asia/Amman:${st(e.date)}T${st(e.to)}00`,
        `SUMMARY:امتحان ${e.name} (${e.code})`, `LOCATION:جامعة البترا – ${r}`, 'BEGIN:VALARM', 'TRIGGER:-PT18H', 'ACTION:DISPLAY', `DESCRIPTION:غداً امتحان ${e.name}`, 'END:VALARM',
        'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:بعد ساعة: امتحان ${e.name} – ${r}`, 'END:VALARM', 'END:VEVENT'); });
    lines.push('END:VCALENDAR');
    U.download('امتحاناتي.ics', lines.join('\r\n'), 'text/calendar');
    ST.icsAt = EX.published; save(); render();
  }
  function wire() {
    const app = $('#me-app');
    app.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; q = ''; render(); return; }
      if (t.dataset.add) { const c = t.dataset.add; ST.codes = ST.codes.includes(c) && tab === 'all' ? ST.codes.filter(x => x !== c) : [...new Set(ST.codes.concat(c))]; if (tab === 'mine') q = ''; save(); render(); return; }
      if (t.dataset.rm) { ST.codes = ST.codes.filter(x => x !== t.dataset.rm); delete ST.sec[t.dataset.rm]; save(); render(); return; }
      if (t.dataset.sec) { const [c, s] = t.dataset.sec.split('|'); ST.sec[c] = ST.sec[c] === s ? '' : s; save(); render(); return; }
      if (t.id === 'me-ics') return ics();
      if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy).then(() => { t.innerHTML = '<i class="bi bi-check2"></i> نُسخ'; }); return; }
      if (t.id === 'me-share') { const url = location.origin + location.pathname + '?c=' + ST.codes.join(','); if (navigator.share) navigator.share({ title: 'امتحاناتي', url }).catch(() => {}); else navigator.clipboard.writeText(url).then(() => { t.innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; }); }
    });
    app.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'me-q' || t.id === 'me-aq') { q = t.value; t.dataset.focus = t.id; render(); const n = $('#' + t.id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      if (t.id === 'me-iq') { insQ = t.value; render(); const n = $('#me-iq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });
    app.addEventListener('change', e => { if (e.target.id === 'me-fac') { facF = e.target.value; render(); } if (e.target.id === 'me-ft') { facT = e.target.value; render(); } if (e.target.id === 'me-lab') { LABONLY = e.target.checked; render(); } });
    const top = $('#pg-q'); if (top) top.addEventListener('input', e => { tab = 'all'; q = e.target.value; render(); });
  }
  const CSS = `
    .me-top { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; justify-content: space-between; background: linear-gradient(120deg, #091b22, #133a48); color: #fff; border-radius: 16px; padding: .9rem 1.1rem; margin: 1rem 0 .8rem; }
    .me-top small { color: #c9d4da; } .me-top h2 { margin: 0; font-size: 1.5rem; font-weight: 800; } .me-top span { color: #dbe4e9; font-size: .95rem; }
    .me-pub { background: rgba(255,255,255,.12); border-radius: 999px; padding: .25rem .8rem; font-weight: 700; } .me-pub.ok { background: #15803d; }
    .me-tabs { display: flex; gap: .4rem; margin-bottom: .8rem; overflow-x: auto; } .me-tabs button { flex: 0 0 auto; border: 1px solid #dde3e7; background: #fff; border-radius: 10px; padding: .45rem .9rem; font-weight: 700; color: #26353c; }
    .me-tabs button.on { background: #901d23; border-color: #901d23; color: #fff; } .me-tabs button span { background: #0001; border-radius: 999px; padding: 0 .45rem; font-size: .8rem; margin-inline-start: .2rem; } .me-tabs button.on span { background: #fff3; }
    .me-search { position: relative; display: flex; align-items: center; gap: .5rem; background: #fff; border: 2px solid #901d23; border-radius: 14px; padding: .55rem .8rem; margin-bottom: .8rem; }
    .me-search > i { color: #901d23; font-size: 1.2rem; } .me-search input { border: 0; outline: 0; flex: 1; font-size: 1.1rem; background: transparent; min-width: 0; }
    .me-hits { position: absolute; top: 100%; inset-inline: 0; z-index: 5; list-style: none; margin: .3rem 0 0; padding: .3rem; background: #fff; border: 1px solid #dde3e7; border-radius: 12px; box-shadow: 0 10px 30px #0002; }
    .me-hits button { width: 100%; text-align: start; border: 0; background: none; padding: .5rem .6rem; border-radius: 8px; font-size: 1rem; } .me-hits button:hover { background: #f6e7e8; } .me-hits small { color: #6b7a82; margin-inline-start: .4rem; } .me-hits .none { padding: .5rem; color: #6b7a82; }
    .me-acts { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .6rem; }
    .me-list { display: grid; gap: .6rem; margin-bottom: 1rem; }
    .me-card { position: relative; display: grid; grid-template-columns: auto 1fr auto; gap: .8rem; align-items: start; background: #fff; border: 1px solid #e2e8ec; border-inline-start: 5px solid #0b4a66; border-radius: 14px; padding: .75rem .85rem; }
    .me-card.today, .me-card.now { border-inline-start-color: #901d23; box-shadow: 0 4px 16px rgba(144,29,35,.15); } .me-card.soon { border-inline-start-color: #b7791f; } .me-card.past { opacity: .55; }
    .me-date { display: flex; flex-direction: column; align-items: center; min-width: 4.6rem; background: #f4f6f8; border-radius: 12px; padding: .4rem .3rem; }
    .me-date b { font-size: .9rem; color: #901d23; } .me-date span { font-size: 1.55rem; font-weight: 800; color: #091b22; line-height: 1.1; font-variant-numeric: tabular-nums; } .me-date small { color: #6b7a82; font-size: .75rem; }
    .me-h { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; } .me-h b { font-size: 1.12rem; color: #091b22; } .me-code { background: #091b22; color: #fff; border-radius: 6px; padding: 0 .4rem; font-weight: 700; font-size: .85rem; }
    .me-when { margin-inline-start: auto; border-radius: 999px; padding: .05rem .65rem; font-size: .82rem; font-weight: 800; background: #eef2f4; color: #26353c; }
    .me-when.now { background: #901d23; color: #fff; } .me-when.today { background: #fde2e3; color: #901d23; } .me-when.soon { background: #fff2d6; color: #7a4b00; }
    .me-t { color: #4a5a62; margin: .25rem 0; font-size: 1rem; } .me-t bdi { font-weight: 800; color: #091b22; } .me-t span { color: #6b7a82; font-size: .9rem; }
    .me-mine { background: #e7f6ec; color: #14532d; border-radius: 10px; padding: .35rem .6rem; font-size: 1.05rem; margin: .3rem 0; } .me-mine b { font-size: 1.25rem; } .me-mine .me-map { font-size: .8rem; margin-inline-start: .5rem; color: #166534; font-weight: 700; white-space: nowrap; }
    .me-rooms { display: flex; flex-wrap: wrap; gap: .3rem; } .me-rooms span { background: #f4f6f8; border: 1px solid #e2e8ec; border-radius: 9px; padding: .15rem .5rem; font-size: .9rem; }
    .me-rooms span.lab { background: #e6f6f4; border-color: #99d5cf; } .me-rooms span.on { background: #15803d; border-color: #15803d; color: #fff; } .me-rooms small { color: inherit; opacity: .75; margin-inline-start: .25rem; }
    .me-sec { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; margin-top: .4rem; } .me-sec small { color: #6b7a82; margin-inline-end: .2rem; }
    .me-sec button { border: 1px solid #c9d2d8; background: #fff; border-radius: 7px; min-width: 2rem; padding: .05rem .4rem; font-weight: 700; } .me-sec button.on { background: #15803d; border-color: #15803d; color: #fff; }
    .me-x, .me-add { border: 0; background: #f4f6f8; color: #6b7a82; border-radius: 50%; width: 2.1rem; height: 2.1rem; } .me-add { background: #901d23; color: #fff; } .me-add.on { background: #15803d; }
    .me-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: .3rem; background: #fff; border: 2px dashed #dde3e7; border-radius: 16px; padding: 2rem 1rem; color: #4a5a62; }
    .me-empty i { font-size: 2.6rem; color: #901d23; } .me-empty b { font-size: 1.2rem; color: #091b22; }
    .me-filter { display: flex; gap: .5rem; margin-bottom: .6rem; } .me-filter .form-select { max-width: 16rem; }
    .me-day { display: flex; align-items: center; gap: .6rem; font-size: 1.15rem; margin: 1rem 0 .5rem; padding-inline-start: .6rem; border-inline-start: 4px solid #901d23; }
    .me-day span { background: #901d23; color: #fff; border-radius: 999px; padding: 0 .6rem; font-size: .8rem; } .me-day small { color: #6b7a82; font-size: .85rem; margin-inline-start: auto; }
    .me-sub { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; background: #fff8e6; border: 1px solid #f3d58a; border-radius: 12px; padding: .55rem .7rem; margin-bottom: .7rem; }
    .me-sub b { color: #7a4b00; } .me-sub span { flex-basis: 100%; color: #5b4a20; font-size: .9rem; }
    .me-labs { background: #e6f6f4; border: 1px solid #99d5cf; color: #0f5f58; border-radius: 10px; padding: .4rem .65rem; margin-bottom: .4rem; } .me-labs b { margin-inline-start: .3rem; font-size: 1.05rem; }
    .me-tbl { background: #fff; } .me-tbl td.t { white-space: nowrap; font-weight: 800; } .me-tbl tr.lab td { background: #f1fbf9; }
    .me-only { display: flex; align-items: center; gap: .35rem; white-space: nowrap; font-weight: 700; }
    .me-note { color: #6b7a82; font-size: .88rem; margin: 1rem 0; }
    [data-theme=dark] .me-card, [data-theme=dark] .me-search, [data-theme=dark] .me-tabs button:not(.on), [data-theme=dark] .me-empty, [data-theme=dark] .me-hits { background: #13232a; border-color: #2c4048; color: #e8eef0; }
    [data-theme=dark] .me-h b, [data-theme=dark] .me-date span, [data-theme=dark] .me-t bdi { color: #e8eef0; } [data-theme=dark] .me-date, [data-theme=dark] .me-rooms span:not(.on) { background: #1b2e35; border-color: #2c4048; }
    @media (max-width: 560px) { .me-tabs { display: grid; grid-template-columns: 1fr 1fr; overflow: visible; } .me-tabs button { padding: .45rem .4rem; font-size: .92rem; white-space: nowrap; } .me-card { grid-template-columns: auto 1fr; } .me-x, .me-add { position: absolute; top: .5rem; left: .5rem; } .me-h { padding-left: 2.3rem; } .me-filter { flex-direction: column; } .me-filter .form-select { max-width: none; } }
    @media print { .me-tabs, .me-search, .me-acts, .me-x, .me-add, .me-sec, .site-header, .uop-hero, footer { display: none !important; } .me-card { break-inside: avoid; } }`;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  const app = $('#me-app');
  U.getJSON('data/exam_schedule.json').then(ex => {
    if (!ex || !ex.exams || !ex.exams.length) throw new Error('empty');
    EX = ex; BY = Object.fromEntries(ex.exams.map(e => [e.code, e]));
    U.updatedLine(ex.published, `${ex.exams.length} امتحاناً`);
    const names = [...new Set(ex.exams.map(e => e.fac).concat(ex.exams.flatMap(e => e.rooms.flatMap(r => r.proc || []))))].filter(Boolean);
    wire(); render();
    if (window.crypto && crypto.subtle) Promise.all(names.map(n => sha(n).then(x => { HASH[n] = x; }))).then(render).catch(() => {});
  }).catch(() => {
    app.innerHTML = `<div class="me-empty mt-3"><i class="bi bi-calendar-x"></i><b>لم يُنشر جدول الامتحانات بعد</b><span>تظهر هنا مواعيد امتحاناتك وقاعاتها حال نشر لجنة الامتحانات للجدول. إلى ذلك الحين يمكنك تنظيم جدول محاضراتك في <a href="planner.html">مخطط جدولي</a>.</span></div>`;
  });
})();
