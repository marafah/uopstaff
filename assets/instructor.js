/* Instructor page: contact, what they teach now/next, weekly timetable, free times, sections, calendar subscription,
   and a one-page printout (with a QR code to this page).
   ?id=<id from data/instructors.json>; without an id: a searchable list of all instructors. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let IDX, TT, S, OHD = { map: {} };
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const qs = () => new URLSearchParams(location.search);
  const FREE_FROM = 8 * 60, FREE_TO = 16 * 60;  // free times are looked for within the working day
  // one colour per course (same course = same colour in the timetable, the table and the legend)
  const PALETTE = [['#901d23', '#fbecec'], ['#0b4a66', '#e4f0f6'], ['#0f766e', '#e0f4f1'], ['#9a5b00', '#fdf1dc'], ['#6d28d9', '#f0e9fd'],
    ['#15803d', '#e4f5e9'], ['#be185d', '#fce8f2'], ['#1d4ed8', '#e6edfd'], ['#7c4a1e', '#f4eadf'], ['#475569', '#edf0f4']];

  // ---------------------------------------------------------------- list of instructors
  function listView() {
    const p = qs(), q = norm(p.get('q') || ''), fac = p.get('fac') || '', dept = p.get('dept') || '';
    const all = IDX.instructors;
    const facs = [...new Set(all.map(i => i.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const depts = [...new Set(all.filter(i => !fac || i.faculty === fac).flatMap(i => i.department ? i.department.split(', ') : []))].sort((a, b) => a.localeCompare(b, 'ar'));
    const list = all.filter(i => (!q || norm(i.name + ' ' + (i.name_en || '') + ' ' + i.department).includes(q))
      && (!fac || i.faculty === fac) && (!dept || i.department.split(', ').includes(dept)));
    $('#pg-title').textContent = 'صفحة المدرس';
    $('#ins-app').innerHTML = `<div class="card mb-3 no-print"><div class="card-body d-flex flex-wrap gap-2 align-items-end">
        <div class="flex-grow-1"><label class="small fw-bold" for="i-q">المدرس</label>
          <input class="form-control form-control-sm" id="i-q" value="${esc(p.get('q') || '')}" placeholder="اكتب جزءاً من الاسم…"></div>
        <div><label class="small fw-bold" for="i-fac">الكلية</label><select class="form-select form-select-sm" id="i-fac"><option value="">كل الكليات</option>
          ${facs.map(f => `<option ${f === fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div><label class="small fw-bold" for="i-dept">القسم</label><select class="form-select form-select-sm" id="i-dept"><option value="">كل الأقسام</option>
          ${depts.map(d => `<option ${d === dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <span class="small text-muted ms-auto">${list.length} مدرس · القسم حسب دليل الموظفين</span></div></div>
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 row-cols-xxl-4 g-3">${list.map(i => `<div class="col"><a class="ins-pick" href="?id=${i.id}">
        ${i.photo ? `<img src="${esc(i.photo)}" alt="" loading="lazy">` : `<span class="ins-ini">${esc(initials(i.name))}</span>`}
        <span><b>${esc(i.name)}</b><small>${esc([i.rank, i.department || 'قسمه غير معروف'].filter(Boolean).join(' · '))}</small><em>${i.sections} شعبة</em></span></a></div>`).join('')
        || '<p class="text-muted">لا يوجد مدرس يطابق البحث.</p>'}</div>`;
    const go = ch => { const n = new URLSearchParams(location.search); Object.entries(ch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); history.replaceState(null, '', '?' + n); listView(); };
    let t;
    $('#i-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { go({ q: e.target.value }); const i = $('#i-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $('#i-fac').addEventListener('change', e => go({ fac: e.target.value, dept: '' }));
    $('#i-dept').addEventListener('change', e => go({ dept: e.target.value }));
  }
  const initials = n => U.shortName(n).split(' ').slice(0, 2).map(w => w[0]).join(' ');

  // ---------------------------------------------------------------- the instructor's week
  const OH_STYLE = '--cc:#15803d;--cbg:#e7f6ec';
  function build(I) {
    const oh = OHD.map[I.id] && OHD.map[I.id].slots && OHD.map[I.id].slots.length ? OHD.map[I.id] : null;
    const secs = S.filter(s => s.instructor === I.name).sort((a, b) => a.code.localeCompare(b.code) || a.activity.localeCompare(b.activity, 'ar') || +a.section - +b.section);
    const courses = [...new Set(secs.map(s => s.code))];
    const color = code => PALETTE[courses.indexOf(code) % PALETTE.length];
    const days = U.WEEK.filter(d => (d !== 'ج' && d !== 'س') || secs.some(s => s.meetings.some(m => m.day === d && live(m)))
      || (OHD.map[I.id] && (OHD.map[I.id].slots || []).some(x => x.day === d)));
    const meetings = secs.flatMap(s => s.meetings.filter(live).map(m => ({ s, m })));
    const room = s => s.room === '0' ? 'قاعة افتراضية' : s.room;
    const items = meetings.map(({ s, m }) => {
      const [c, bg] = color(s.code), mode = U.MODE[m.mode] || {};
      return { s, m, day: m.day, start: m.start, end: m.end, title: `${s.code} · ش${s.section}`, line: s.name, sub: room(s),
        icon: m.mode === 'وجاهي' ? '' : mode.icon, style: `--cc:${c};--cbg:${bg}`, cls: 'cc',
        tip: `${s.code} ${s.name} – شعبة ${s.section} (${s.activity})\n${U.DAYS[m.day]} ${m.start}–${m.end} · ${m.mode}\n${s.room === '0' ? 'قاعة افتراضية (0)' : s.room + ' – ' + s.building}` };
    });
    const ohPlace = oh ? (oh.place || I.office || '') : '';
    const ohItems = oh ? oh.slots.map(x => ({ day: x.day, start: x.start, end: x.end, title: 'ساعة مكتبية', line: ohPlace ? `المكان: ${ohPlace}` : '', sub: oh.mode || 'وجاهي',
      icon: 'bi-person-raised-hand', style: OH_STYLE, cls: 'cc oh', oh: true, tip: `ساعة مكتبية ${U.DAYS[x.day]} ${x.start}–${x.end}${ohPlace ? ' · ' + ohPlace : ''}` })) : [];
    items.push(...ohItems);
    // busy intervals of a day: lectures (with their section) and office hours (section null)
    const busy = d => meetings.filter(x => x.m.day === d).map(x => [toMin(x.m.start), toMin(x.m.end), x.s])
      .concat(ohItems.filter(x => x.day === d).map(x => [toMin(x.start), toMin(x.end), null])).sort((a, b) => a[0] - b[0]);
    const free = d => {
      const taken = new Set();
      busy(d).forEach(([a, b]) => { for (let t = a; t < b; t += 30) taken.add(t); });
      const runs = [];
      for (let t = FREE_FROM; t < FREE_TO; t += 30) {
        if (taken.has(t)) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === t) last[1] = t + 30; else runs.push([t, t + 30]);
      }
      return runs;
    };
    const slots = new Set();
    meetings.forEach(({ m }) => { for (let t = toMin(m.start); t < toMin(m.end); t += 30) slots.add(m.day + t); });
    return { secs, courses, color, days, items, busy, free, room, oh, ohPlace,
      asyncSecs: secs.filter(s => s.meetings.some(m => !live(m))),
      hours: slots.size / 2, students: secs.reduce((a, s) => a + s.registered, 0) };
  }

  // now / next lecture, in Amman time and within the teaching period (official holidays skipped)
  function nowNext(W) {
    const amman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Amman' }));
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const T = IDX.teaching || {}, hol = new Set(T.holidays || []);
    const today = ymd(amman), mins = amman.getHours() * 60 + amman.getMinutes();
    if (T.start && today < T.start) return { icon: 'bi-calendar-event', text: `تبدأ المحاضرات ${U.numDate(T.start)}` };
    if (T.end && today > T.end) return { icon: 'bi-calendar-check', text: 'انتهت فترة التدريس لهذا الفصل' };
    const list = W.items.map(x => ({ ...x, a: toMin(x.start), b: toMin(x.end) }));
    if (!hol.has(today)) {
      const cur = list.filter(x => x.day === U.JS_DAY[amman.getDay()] && x.a <= mins && mins < x.b).sort((a, b) => !!a.oh - !!b.oh)[0];  // a lecture before office hours
      if (cur && cur.oh) return { now: true, oh: true, icon: 'bi-person-raised-hand', text: `ساعة مكتبية الآن حتى ${cur.end}${W.ohPlace ? ' · ' + W.ohPlace : ''}${W.oh.mode && W.oh.mode !== 'وجاهي' ? ' · ' + W.oh.mode : ''}` };
      if (cur) return { now: true, icon: 'bi-broadcast', text: `يحاضر الآن: ${cur.title} ${cur.line} · ${cur.sub} · حتى ${cur.end}` };
    }
    for (let k = 0; k < 14; k++) {
      const d = new Date(amman); d.setDate(d.getDate() + k);
      const key = ymd(d);
      if (hol.has(key) || (T.end && key > T.end)) continue;
      const next = list.filter(x => !x.oh && x.day === U.JS_DAY[d.getDay()] && (k > 0 || x.a > mins)).sort((a, b) => a.a - b.a)[0];
      if (next) {
        const when = k === 0 ? 'اليوم' : k === 1 ? 'غداً' : U.DAYS[next.day];
        return { icon: 'bi-clock-history', text: `المحاضرة القادمة: ${when} ${next.start} · ${next.title} ${next.line} · ${next.sub}` };
      }
    }
    return { icon: 'bi-dash-circle', text: 'لا محاضرات بوقت ثابت هذا الفصل' };
  }

  // free-time timeline: 08:00–16:00 per day, lectures and free gaps on one bar
  function timeline(W) {
    const span = FREE_TO - FREE_FROM, pos = t => (100 * (Math.max(FREE_FROM, Math.min(FREE_TO, t)) - FREE_FROM) / span).toFixed(3);
    const ticks = [];
    for (let t = FREE_FROM; t <= FREE_TO; t += 60) ticks.push(`<span style="right:${pos(t)}%">${toTime(t).slice(0, 2)}</span>`);
    const rows = W.days.map(d => {
      const busy = W.busy(d).filter(([a, b]) => b > FREE_FROM && a < FREE_TO).map(([a, b, s]) => {
        if (!s) return `<i class="ft-busy ft-oh" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%" title="ساعة مكتبية ${toTime(a)}–${toTime(b)}"><span>ساعة مكتبية</span></i>`;
        const [c, bg] = W.color(s.code);
        return `<i class="ft-busy" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%;--cc:${c};--cbg:${bg}" title="${esc(`${s.code} ${s.name} – ${toTime(a)}–${toTime(b)}`)}"><span>${esc(s.code)}</span></i>`;
      }).join('');
      const runs = W.free(d).filter(r => r[1] - r[0] >= 60);
      const free = runs.map(([a, b]) => `<i class="ft-free" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%" title="فراغ ${toTime(a)}–${toTime(b)}"><span dir="ltr">${toTime(a)}–${toTime(b)}</span></i>`).join('');
      return `<div class="ft-row"><b>${esc(U.DAYS[d])}</b><div class="ft-track">${busy}${free}</div></div>`;
    }).join('');
    return `<div class="ft"><div class="ft-row ft-head"><b></b><div class="ft-ticks">${ticks.join('')}</div></div>${rows}</div>
      <div class="ft-key"><span><i class="ft-sw free"></i> فراغ لساعة أو أكثر</span><span><i class="ft-sw busy"></i> محاضرة</span><span><i class="ft-sw oh"></i> ساعة مكتبية</span><span class="text-muted">المساحة البيضاء: فراغ أقل من ساعة</span></div>`;
  }

  const when = s => {
    const blocks = [];
    s.meetings.forEach(m => { const k = m.start + '–' + m.end; const b = blocks.find(x => x.k === k) || (blocks.push({ k, ms: [] }), blocks[blocks.length - 1]); b.ms.push(m); });
    return blocks.map(b => `<div class="tt-when"><bdi dir="ltr" class="tt-time">${b.k}</bdi> <span class="tt-days">${b.ms.map(m =>
      `<span class="tt-day ${(U.MODE[m.mode] || {}).cls || ''}" title="${esc(m.mode)}"><i class="bi ${(U.MODE[m.mode] || {}).icon || 'bi-dot'}"></i>${esc(U.DAYS[m.day])}</span>`).join('')}</span></div>`).join('');
  };
  const whenText = s => {
    const blocks = [];
    s.meetings.forEach(m => { const k = m.start + '–' + m.end; const b = blocks.find(x => x.k === k) || (blocks.push({ k, ds: [] }), blocks[blocks.length - 1]); b.ds.push(U.DAYS[m.day] + (m.mode !== 'وجاهي' ? ` (${m.mode})` : '')); });
    return blocks.map(b => `${b.ds.join('، ')} ${b.k}`).join(' · ');
  };
  const seats = s => `<span class="tt-seats ${s.status === 'مغلقة' ? 'full' : 'open'}"><span class="tt-st">${esc(s.status)}</span>
    <span class="tt-bar"><i style="width:${Math.min(100, s.capacity ? 100 * s.registered / s.capacity : 100)}%"></i></span><bdi dir="ltr">${s.registered}/${s.capacity}</bdi></span>`;

  // ---------------------------------------------------------------- office hours: card and editor
  const ohList = oh => {
    const by = {};
    (oh.slots || []).forEach(x => (by[x.day] ||= []).push(`${x.start}–${x.end}`));
    return U.WEEK.filter(d => by[d]).map(d => `${U.DAYS[d]} ${by[d].join('، ')}`);
  };
  function ohCard(I, W) {
    const oh = W.oh;
    const head = `<div class="card-header d-flex align-items-center gap-2"><span><i class="bi bi-person-raised-hand"></i> الساعات المكتبية</span>
      <button type="button" class="btn btn-sm btn-outline-success ms-auto" id="oh-edit"><i class="bi bi-pencil-square"></i> ${oh ? 'تعديل' : 'أضف ساعاتك المكتبية'}</button></div>`;
    if (!oh) return `${head}<div class="card-body py-3 text-muted small">لم يُدخل المدرس ساعاته المكتبية بعد. إن كنت المدرس فاضغط «أضف ساعاتك المكتبية»: نرسل رمزاً إلى بريدك الجامعي للتحقق، ثم تختار أوقاتك من جدولك مباشرة.</div>`;
    const by = {};
    oh.slots.forEach(x => (by[x.day] ||= []).push(x));
    return `${head}<div class="card-body py-2">
      <div class="oh-days">${U.WEEK.filter(d => by[d]).map(d => `<div><b>${esc(U.DAYS[d])}</b>${by[d].map(x => `<em dir="ltr">${x.start}–${x.end}</em>`).join('')}</div>`).join('')}</div>
      <div class="oh-meta">${W.ohPlace ? `<span><i class="bi bi-geo-alt-fill"></i> ${esc(W.ohPlace)}</span>` : ''}<span><i class="bi ${oh.mode === 'عن بعد' ? 'bi-camera-video-fill' : 'bi-people-fill'}"></i> ${esc(oh.mode || 'وجاهي')}</span>
        ${oh.link ? `<a href="${esc(oh.link)}" target="_blank" rel="noopener"><i class="bi bi-link-45deg"></i> رابط اللقاء عن بعد</a>` : ''}
        <span class="text-muted">${OH.hoursText(OH.hours(oh.slots))} أسبوعياً${oh.updated ? ` · حُدّثت ${U.ago(oh.updated)}` : ''}</span></div>
      ${oh.note ? `<p class="oh-note"><i class="bi bi-info-circle"></i> ${esc(oh.note)}</p>` : ''}</div>`;
  }
  function bindOh(I, W) {
    const b = $('#oh-edit');
    if (b) b.addEventListener('click', () => ohStart(I, W));
    if (qs().get('oh') === 'edit') ohStart(I, W);
  }
  // step 1: prove the e-mail (a code sent to it), unless this browser already holds a valid key
  async function ohStart(I, W) {
    const cfg = await OH.config();
    const own = I.email ? OH.keyFor(I.email) : null, admin = OH.anyKey().find(k => k.email !== String(I.email || '').toLowerCase());
    if (own || admin || !cfg.api) return ohEditor(I, W, own || admin);
    U.modal('<i class="bi bi-shield-lock"></i> تأكيد الهوية', `
      <p class="small">لحماية الصفحة لا يعدّل الساعات المكتبية إلا صاحبها: نرسل رمزاً من 6 أرقام إلى البريد الجامعي المسجّل في دليل الموظفين، ويبقى هذا المتصفح موثوقاً 30 يوماً.</p>
      <label class="small fw-bold" for="oh-mail">البريد</label>
      <input class="form-control" id="oh-mail" dir="ltr" value="${esc(I.email || '')}" ${I.email ? 'readonly' : ''} placeholder="name@uop.edu.jo">
      <div class="small mt-1"><a href="#" id="oh-other">${I.email ? 'أنا مدير الموقع وأُدخل نيابةً عن المدرس' : 'لا يوجد بريد للمدرس في الدليل: يُدخلها مدير الموقع ببريده'}</a></div>
      <div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-maroon" id="oh-send"><i class="bi bi-envelope-paper"></i> أرسل الرمز</button></div>
      <div id="oh-step2" class="mt-3" hidden><label class="small fw-bold" for="oh-code">الرمز المرسَل إلى بريدك</label>
        <div class="d-flex gap-2"><input class="form-control oh-code" id="oh-code" inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code">
          <button type="button" class="btn btn-success" id="oh-check"><i class="bi bi-check2-circle"></i> تحقّق</button></div></div>
      <div id="oh-msg" class="small mt-2"></div>`);
    const say = (t, ok) => { $('#oh-msg').innerHTML = `<span class="${ok ? 'text-success' : 'text-danger'}">${esc(t)}</span>`; };
    $('#oh-other').addEventListener('click', e => { e.preventDefault(); const m = $('#oh-mail'); m.readOnly = false; m.value = ''; m.focus(); });
    $('#oh-send').addEventListener('click', async () => {
      const email = $('#oh-mail').value.trim(), btn = $('#oh-send');
      if (!/^\S+@\S+\.\S+$/.test(email)) return say('اكتب بريداً صحيحاً.');
      btn.disabled = true; say('جارٍ الإرسال…', true);
      const r = await OH.post({ action: 'request', id: I.id, email });
      btn.disabled = false;
      if (!r.ok) return say(OH.msg(r));
      say(`أرسلنا الرمز إلى ${email}؛ صالح ${r.minutes || 15} دقيقة. تفقّد صندوق الوارد أو البريد غير المرغوب.`, true);
      $('#oh-step2').hidden = false; $('#oh-code').focus();
    });
    const check = async () => {
      const email = $('#oh-mail').value.trim(), code = $('#oh-code').value.trim();
      if (!/^\d{6}$/.test(code)) return say('الرمز 6 أرقام.');
      const r = await OH.post({ action: 'verify', id: I.id, email, code });
      if (!r.ok) return say(OH.msg(r) + (r.left ? ` (بقيت ${r.left} محاولات)` : ''));
      OH.keepKey(email, r.key, r.days || 30);
      bootstrap.Modal.getInstance($('#pgModal')).hide();
      setTimeout(() => ohEditor(I, W, OH.keyFor(email)), 350);
    };
    $('#oh-check').addEventListener('click', check);
    $('#oh-code').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  }
  // step 2: pick half hours on a week grid (lectures blocked), place, mode, note; a draft is kept as you go
  async function ohEditor(I, W, key) {
    const cfg = await OH.config();
    const from = 8 * 60, to = 18 * 60, days = U.WEEK.filter(d => d !== 'ج' && (d !== 'س' || W.days.includes('س')));
    const lect = {};
    W.items.filter(x => !x.oh).forEach(x => { for (let t = toMin(x.start); t < toMin(x.end); t += 30) lect[x.day + '|' + t] = x.title.split(' · ')[0]; });
    const saved = W.oh || { slots: [], place: '', mode: 'وجاهي', link: '', note: '' };
    const d0 = OH.draft.get(I.id);
    const useDraft = d0 && (!saved.updated || d0.at > Date.parse(saved.updated));
    const st = useDraft ? d0 : { slots: saved.slots, place: saved.place || I.office || '', mode: saved.mode || 'وجاهي', link: saved.link || '', note: saved.note || '' };
    const cells = OH.toCells(st.slots);
    const rows = []; for (let t = from; t < to; t += 30) rows.push(t);
    U.modal(`<i class="bi bi-person-raised-hand"></i> الساعات المكتبية: ${esc(I.name)}`, `
      ${useDraft ? '<div class="alert alert-info small py-2"><i class="bi bi-clock-history"></i> استعدنا مسودة لم تُحفظ بعد من هذا المتصفح. احفظها أو عدّلها.</div>' : ''}
      ${!cfg.api ? '<div class="alert alert-warning small py-2"><i class="bi bi-exclamation-triangle"></i> لم يُفعَّل حفظ الساعات المكتبية في الموقع بعد؛ ما تختاره يُحفظ مسودةً في هذا المتصفح حتى التفعيل.</div>' : ''}
      <p class="small text-muted mb-2">انقر أو اسحب على الخانات لاختيار أنصاف الساعات. الخانات الرمادية محاضراتك ولا يمكن اختيارها.</p>
      <div class="oh-grid-wrap"><table class="oh-grid"><thead><tr><th></th>${days.map(d => `<th>${esc(U.DAYS[d])}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(t => `<tr><th dir="ltr">${t % 60 ? '' : toTime(t)}</th>${days.map(d => { const k = d + '|' + t;
          return lect[k] ? `<td class="lect" title="محاضرة ${esc(lect[k])}">${t % 60 === 0 || !lect[d + '|' + (t - 30)] ? esc(lect[k]) : ''}</td>` : `<td data-k="${k}" class="${cells.has(k) ? 'on' : ''}" title="${esc(U.DAYS[d])} ${toTime(t)}–${toTime(t + 30)}"></td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="oh-sum" id="oh-sum"></div>
      <div class="row g-2 mt-1">
        <div class="col-sm-6"><label class="small fw-bold" for="oh-place">المكان</label><input class="form-control form-control-sm" id="oh-place" value="${esc(st.place)}" placeholder="رقم المكتب، مثلاً 7410"></div>
        <div class="col-sm-6"><label class="small fw-bold" for="oh-mode">الطريقة</label><select class="form-select form-select-sm" id="oh-mode">
          ${['وجاهي', 'عن بعد', 'وجاهي وعن بعد'].map(m => `<option ${m === st.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="col-12" id="oh-link-row" ${st.mode === 'وجاهي' ? 'hidden' : ''}><label class="small fw-bold" for="oh-link">رابط اللقاء عن بعد (Teams)</label><input class="form-control form-control-sm" id="oh-link" dir="ltr" value="${esc(st.link)}" placeholder="https://teams.microsoft.com/…"></div>
        <div class="col-12"><label class="small fw-bold" for="oh-note">ملاحظة للطلبة (اختياري)</label><input class="form-control form-control-sm" id="oh-note" maxlength="300" value="${esc(st.note)}" placeholder="مثلاً: يُفضّل الحجز المسبق بالبريد"></div>
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
        <button type="button" class="btn btn-success" id="oh-save" ${cfg.api ? '' : 'disabled'}><i class="bi bi-cloud-check"></i> حفظ ونشر</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="oh-clear"><i class="bi bi-eraser"></i> مسح الاختيار</button>
        ${key ? `<span class="small text-muted ms-auto"><i class="bi bi-shield-check text-success"></i> متحقَّق: <span dir="ltr">${esc(key.email)}</span></span>` : ''}
      </div><div id="oh-msg" class="small mt-2"></div>`);
    const modal = $('#pgModal');
    modal.querySelector('.modal-dialog').classList.add('modal-xl');
    modal.addEventListener('hidden.bs.modal', () => modal.querySelector('.modal-dialog').classList.remove('modal-xl'), { once: true });
    const val = () => ({ slots: OH.toSlots(cells), place: $('#oh-place').value.trim(), mode: $('#oh-mode').value, link: $('#oh-link').value.trim(), note: $('#oh-note').value.trim() });
    const sum = () => {
      const v = val();
      $('#oh-sum').innerHTML = v.slots.length ? `<b>${OH.hoursText(OH.hours(v.slots))} أسبوعياً:</b> ${ohList(v).map(esc).join(' · ')}` : '<span class="text-muted">لم تختر أي وقت بعد.</span>';
      OH.draft.set(I.id, v);  // nothing typed is lost: closing the page keeps it as a draft
    };
    let paint = null;
    modal.querySelectorAll('.oh-grid td[data-k]').forEach(td => {
      const set = on => { td.classList.toggle('on', on); on ? cells.add(td.dataset.k) : cells.delete(td.dataset.k); };
      td.addEventListener('pointerdown', e => { e.preventDefault(); paint = !cells.has(td.dataset.k); set(paint); sum(); });
      td.addEventListener('pointerenter', () => { if (paint !== null) { set(paint); sum(); } });
    });
    const stop = () => { paint = null; };
    document.addEventListener('pointerup', stop);
    modal.addEventListener('hidden.bs.modal', () => document.removeEventListener('pointerup', stop), { once: true });
    ['oh-place', 'oh-link', 'oh-note'].forEach(id => $('#' + id).addEventListener('input', sum));
    $('#oh-mode').addEventListener('change', e => { $('#oh-link-row').hidden = e.target.value === 'وجاهي'; sum(); });
    $('#oh-clear').addEventListener('click', () => { cells.clear(); modal.querySelectorAll('.oh-grid td.on').forEach(td => td.classList.remove('on')); sum(); });
    sum();
    $('#oh-save').addEventListener('click', async () => {
      const k = key || (I.email && OH.keyFor(I.email)) || OH.anyKey()[0];
      if (!k) { bootstrap.Modal.getInstance(modal).hide(); return setTimeout(() => ohStart(I, W), 350); }
      const v = val(), btn = $('#oh-save');
      if (v.mode !== 'وجاهي' && v.link && !/^https:\/\//.test(v.link)) return ($('#oh-msg').innerHTML = '<span class="text-danger">الرابط يبدأ بـ https://</span>');
      btn.disabled = true; $('#oh-msg').innerHTML = '<span class="text-muted">جارٍ الحفظ…</span>';
      const r = await OH.post({ action: 'save', id: I.id, key: k.key, ...v });
      btn.disabled = false;
      if (!r.ok) {
        if (r.error === 'login') { OH.dropKey(k.email); }
        return ($('#oh-msg').innerHTML = `<span class="text-danger">${esc(OH.msg(r))}</span>`);
      }
      OH.draft.del(I.id);
      OHD.map[I.id] = r.entry;
      bootstrap.Modal.getInstance(modal).hide();
      personView(I);
      const t = document.createElement('div');
      t.className = 'oh-toast'; t.innerHTML = '<i class="bi bi-check-circle-fill"></i> حُفظت الساعات المكتبية ونُشرت';
      document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    });
  }

  // ---------------------------------------------------------------- the instructor's page
  // display options of the week (kept in this browser only)
  const VKEY = 'ins-view-2';
  const vLoad = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(VKEY) || '{}') || {}; } catch (e) { /* defaults */ }
    return Object.assign({ v: innerWidth < 768 ? 'cols' : 'mx', range: 'auto', free: true, name: true, room: true, time: false }, v); };
  const vSave = P => { try { localStorage.setItem(VKEY, JSON.stringify(P)); } catch (e) { /* not kept */ } };
  const hrs = m => { const h = Math.round(m / 6) / 10; return (h % 1 ? h.toFixed(1) : String(h)); };
  // the hour range shown: the working day 08–16, or the whole day around every lecture
  function rangeOf(W, P) {
    if (P.range === 'work' || !W.items.length) return [FREE_FROM, FREE_TO];
    const a = Math.min(FREE_FROM, ...W.items.map(x => toMin(x.start))), b = Math.max(FREE_TO, ...W.items.map(x => toMin(x.end)));
    return [Math.floor(a / 60) * 60, Math.ceil(b / 60) * 60];
  }
  const blockBody = (x, P) => `<div class="ip-bt"><b dir="ltr">${esc(x.title)}</b>${x.icon ? ` <i class="bi ${x.icon}"></i>` : ''}${P.room || P.time ? `<small>${P.room && x.sub ? esc(x.sub === 'قاعة افتراضية' ? 'افتراضية' : x.sub) : ''}${P.room && x.sub && P.time ? ' · ' : ''}${P.time ? `<bdi dir="ltr">${x.start}–${x.end}</bdi>` : ''}</small>` : ''}</div>${P.name && x.line ? `<span>${esc(x.line)}</span>` : ''}`;
  // «مصفوفة الأسبوع»: a row per day, the hours across; lectures, office hours and the free gaps on one line
  function matrixView(W, P) {
    const [A, B] = rangeOf(W, P), span = B - A, pos = t => +(100 * (Math.max(A, Math.min(B, t)) - A) / span).toFixed(3);
    const ticks = []; for (let t = A; t <= B; t += 60) ticks.push(t);
    const rows = W.days.map(d => {
      const its = W.items.filter(x => x.day === d && toMin(x.end) > A && toMin(x.start) < B).sort((a, b) => toMin(a.start) - toMin(b.start));
      const lanes = [];
      its.forEach(x => { let k = lanes.findIndex(e => e <= toMin(x.start)); if (k < 0) { k = lanes.length; lanes.push(0); } lanes[k] = toMin(x.end); x.lane = k; });
      const n = Math.max(1, lanes.length), H = 100 / n;
      const free = P.free ? W.free(d).filter(r => r[1] - r[0] >= 60 && r[1] > A && r[0] < B) : [];
      const lect = W.items.filter(x => x.day === d && !x.oh), mins = lect.reduce((a, x) => a + toMin(x.end) - toMin(x.start), 0);
      return `<div class="ip-mr" style="--lanes:${n}"><div class="ip-md"><b>${esc(U.DAYS[d])}</b><small>${lect.length ? `${lect.length} لقاء · ${hrs(mins)} س` : 'لا محاضرات'}</small></div>
        <div class="ip-mt">${free.map(([a, b]) => `<i class="ip-free" style="right:${pos(a)}%;width:${pos(b) - pos(a)}%" title="فراغ ${toTime(a)}–${toTime(b)}"><span><b>فراغ</b> <bdi dir="ltr">${toTime(a)}–${toTime(b)}</bdi></span></i>`).join('')}
        ${its.map(x => `<div class="ip-b ${x.oh ? 'oh' : ''}" style="${x.style};right:${pos(toMin(x.start))}%;width:${pos(toMin(x.end)) - pos(toMin(x.start))}%;top:calc(${x.lane * H}% + 3px);height:calc(${H}% - 6px)" title="${esc(x.tip)}">${blockBody(x, P)}</div>`).join('')}</div></div>`;
    }).join('');
    return `<div class="ip-mx"><div class="ip-mr ip-mh"><div class="ip-md"></div><div class="ip-mt">${ticks.map(t => `<span style="right:${pos(t)}%">${toTime(t)}</span>`).join('')}</div></div>
      <div class="ip-mgrid" style="--cols:${ticks.length - 1}">${rows}</div></div>`;
  }
  // «الأيام كأعمدة»: each day's lectures (and gaps) in time order
  function columnsView(W, P) {
    const [A, B] = rangeOf(W, P);
    return `<div class="ip-cols" style="--n:${W.days.length}">${W.days.map(d => {
      const its = W.items.filter(x => x.day === d && toMin(x.end) > A && toMin(x.start) < B).map(x => ({ t: toMin(x.start), h: `<div class="ip-ce ${x.oh ? 'oh' : ''}" style="${x.style}" title="${esc(x.tip)}"><em dir="ltr">${x.start}–${x.end}</em>${blockBody(x, { ...P, time: false })}</div>` }));
      const free = P.free ? W.free(d).filter(r => r[1] - r[0] >= 60).map(([a, b]) => ({ t: a, h: `<div class="ip-cf"><i class="bi bi-hourglass-split"></i> فراغ <bdi dir="ltr">${toTime(a)}–${toTime(b)}</bdi></div>` })) : [];
      const all = its.concat(free).sort((a, b) => a.t - b.t);
      return `<div class="ip-col"><h6>${esc(U.DAYS[d])}</h6>${all.map(x => x.h).join('') || '<div class="ip-cnone">لا محاضرات</div>'}</div>`; }).join('')}</div>`;
  }
  function weekBody(W, P) {
    if (!W.items.length) return '<p class="text-muted mb-0">لا لقاءات بوقت ثابت هذا الفصل.</p>';
    if (P.v === 'cols') return columnsView(W, P);
    if (P.v === 'grid') return U.weekGrid(W.items, { days: W.days, px: 56, cls: 'wk-ins', compact: true });
    return matrixView(W, P);
  }
  // numbers and facts drawn from the week
  function facts(I, W) {
    const lect = W.items.filter(x => !x.oh);
    const freeBy = W.days.map(d => [d, W.free(d).filter(r => r[1] - r[0] >= 60)]);
    const freeMin = freeBy.reduce((a, [, rs]) => a + rs.reduce((b, r) => b + r[1] - r[0], 0), 0);
    const live_ = W.secs.flatMap(s => s.meetings.filter(live).map(m => ({ s, m })));
    const campus = [...new Set(live_.filter(x => x.s.room !== '0' && x.m.mode !== 'كامل إلكتروني' && !/إلكتروني|الكتروني/.test(x.m.mode)).map(x => x.m.day))];
    const perDay = W.days.map(d => [d, lect.filter(x => x.day === d).reduce((a, x) => a + toMin(x.end) - toMin(x.start), 0)]);
    const busiest = perDay.slice().sort((a, b) => b[1] - a[1])[0];
    const first = lect.length ? lect.reduce((a, x) => toMin(x.start) < toMin(a.start) ? x : a) : null;
    const last = lect.length ? lect.reduce((a, x) => toMin(x.end) > toMin(a.end) ? x : a) : null;
    const modes = {}; live_.forEach(x => { modes[x.m.mode] = (modes[x.m.mode] || 0) + 1; });
    W.secs.forEach(s => s.meetings.filter(m => !live(m)).forEach(m => { modes[m.mode] = (modes[m.mode] || 0) + 1; }));
    const rooms = [...new Set(W.secs.map(s => s.room).filter(r => r && r !== '0'))].sort();
    const cap = W.secs.reduce((a, s) => a + s.capacity, 0), fill = cap ? Math.round(100 * W.students / cap) : 0;
    return { freeBy, freeMin, campus, busiest, first, last, modes, rooms, fill, cap };
  }
  const IP_CSS = `
    .ip-hero { overflow: hidden; }
    .ip-hero-in { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 2fr) minmax(0, 1fr); gap: 0; }
    .ip-hero-in > div { padding: .9rem 1rem; min-width: 0; } .ip-hero-in > div + div { border-inline-start: 1px solid #ece6da; }
    .ip-id { display: flex; gap: .75rem; align-items: flex-start; }
    .ip-id .ins-photo { width: 76px; height: 76px; box-shadow: 0 0 0 3px #fff, 0 3px 10px rgba(9,27,34,.16); }
    .ip-id h2 { font-size: 1.12rem; font-weight: 800; margin: 0; color: #091b22; } .ip-id .ins-en { text-align: start; }
    .ip-id .ins-unit { margin: .3rem 0 0; font-size: .86rem; } .ip-badges { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .3rem; }
    .ip-ct { display: flex; flex-wrap: wrap; gap: .15rem .8rem; margin-top: .35rem; }
    .ip-ct a, .ip-ct span.ip-c { display: flex; align-items: center; gap: .35rem; font-size: .78rem; color: #13222a; text-decoration: none; min-width: 0; }
    .ip-ct a:hover { color: #901d23; } .ip-ct i { color: #901d23; width: 1rem; text-align: center; } .ip-ct b { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .ip-ct small { color: #6b777c; }
    .ip-links { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; }
    .ip-links a { text-decoration: none; font-size: .7rem !important; padding: .05rem .4rem !important; font-weight: 700; border: 1px solid #ddd5c5; border-radius: 6px; padding: .15rem .5rem; color: #091b22 !important; }
    .ip-links a:hover { border-color: #901d23; color: #901d23 !important; }
    .ip-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; align-content: center; }
    .ip-k { border: 1px solid #ece6da; border-radius: 9px; padding: .2rem .5rem; background: #fcfaf6; display: flex; align-items: baseline; gap: .35rem; }
    .ip-k b { font-size: 1.12rem; line-height: 1.25; color: #091b22; font-variant-numeric: tabular-nums; } .ip-k span { font-size: .68rem; color: #5b6970; font-weight: 600; line-height: 1.2; }
    .ip-k.free { background: #effaf2; border-color: #bfe5cb; } .ip-k.free b { color: #13622f; }
    .ip-now { display: flex; align-items: center; gap: .5rem; padding: .5rem 1rem; border-top: 1px solid #ece6da; background: #f6f8fa; font-size: .86rem; font-weight: 700; color: #13222a; }
    .ip-now.live { background: #e9f7ee; color: #0d4f25; } .ip-now.live i { color: #15803d; animation: insPulse 1.6s ease-in-out infinite; }
    .ip-now .ms-auto { font-weight: 500; color: #6b777c; font-size: .78rem; }
    @media (max-width: 1199.98px) { .ip-hero-in { grid-template-columns: minmax(0, 1fr) minmax(0, 1.8fr); } .ip-kpis { grid-column: 1 / -1; border-inline-start: 0 !important; border-top: 1px solid #ece6da; grid-template-columns: repeat(6, minmax(0, 1fr)); padding: .45rem 1rem !important; } }
    @media (max-width: 991.98px) { .ip-hero-in { grid-template-columns: 1fr; } .ip-hero-in > div + div { border-inline-start: 0 !important; border-top: 1px solid #ece6da; } .ip-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 767.98px) { .ip-hero { display: flex; flex-direction: column; } .ip-hero-in { display: contents; } .ip-hero-in > div { padding: .65rem .75rem; }
      .ip-id { order: 1; } .ip-live { order: 2; } .ip-kpis { order: 3; border-top: 1px solid #ece6da; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .35rem; }
      .ip-hero-in > div + div { border-inline-start: 0 !important; }
      .ip-id h2 { font-size: 1.02rem; } .ip-id .ins-unit { font-size: .8rem; }
      .ip-k { padding: .3rem .45rem; display: block; } .ip-k b { display: block; font-size: 1.1rem; } .ip-k span { font-size: .66rem; display: block; line-height: 1.25; } }
    .ip-wk .card-header { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; padding: .5rem .9rem; }
    .ip-wk .card-header h5 { margin: 0; font-size: 1rem; font-weight: 800; color: #091b22; }
    .ip-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .9rem; margin-inline-start: auto; }
    .ip-seg { display: inline-flex; border: 1px solid #d5cdbd; border-radius: 8px; overflow: hidden; background: #fff; }
    .ip-seg button { border: 0; background: none; padding: .2rem .6rem; font-size: .76rem; font-weight: 700; color: #3c474c; white-space: nowrap; }
    .ip-seg button + button { border-inline-start: 1px solid #e2d9c8; } .ip-seg button.on { background: #fbf0f0; color: #7a1a1f; box-shadow: inset 0 -2px 0 #901d23; }
    .ip-cb { display: inline-flex; align-items: center; gap: .25rem; height: 1.6rem; padding: 0 .45rem; border: 1px solid #d8d0bf; border-radius: 6px; background: #fff; font-size: .74rem; font-weight: 600; color: #3c474c; cursor: pointer; margin: 0; user-select: none; }
    .ip-cb input { accent-color: #901d23; margin: 0; } .ip-cb.on { background: #fbf0f0; border-color: #c98f92; color: #7a1a1f; }
    .ip-tl { font-size: .7rem; font-weight: 800; color: #6b4a1f; }
    .ip-legend { display: flex; flex-wrap: wrap; gap: .3rem .9rem; padding: .4rem .9rem; border-bottom: 1px solid #ece6da; background: #fbf9f5; font-size: .76rem; }
    .ip-legend span { display: inline-flex; align-items: center; gap: .3rem; } .ip-legend i { width: 11px; height: 11px; border-radius: 3px; background: var(--cbg); border: 2px solid var(--cc); }
    .ip-legend b { color: var(--cc); } .ip-legend em { font-style: normal; color: #6b777c; }
    .ip-mx { --dw: 92px; }
    .ip-mr { display: grid; grid-template-columns: var(--dw) minmax(0, 1fr); }
    .ip-md { display: flex; flex-direction: column; justify-content: center; padding: 0 .6rem; border-inline-end: 2px solid #091b22; background: #f6f1e7; }
    .ip-md b { font-size: .88rem; color: #091b22; } .ip-md small { font-size: .66rem; color: #6b4a1f; font-weight: 700; }
    .ip-mh .ip-md { background: none; border-color: transparent; }
    .ip-mh .ip-mt { height: 22px; } .ip-mh .ip-mt span { position: absolute; top: 2px; transform: translateX(50%); font-size: .7rem; font-weight: 800; color: #3c474c; font-variant-numeric: tabular-nums; }
    .ip-mh .ip-mt span:first-child { transform: none; } .ip-mh .ip-mt span:last-child { transform: translateX(100%); }
    .ip-mt { position: relative; min-width: 0; }
    .ip-mgrid .ip-mr { border-top: 1px solid #e6dfd0; } .ip-mgrid .ip-mr:last-child { border-bottom: 1px solid #e6dfd0; }
    .ip-mgrid .ip-mt { height: calc(var(--lanes) * 64px + 6px);
      background: repeating-linear-gradient(to left, transparent 0, transparent calc(100% / var(--cols) - 1px), #ebe5d8 calc(100% / var(--cols) - 1px), #ebe5d8 calc(100% / var(--cols))); }
    .ip-mgrid .ip-mr:nth-child(even) .ip-mt { background-color: #fcfaf6; }
    .ip-b, .ip-free { position: absolute; box-sizing: border-box; }
    .ip-b { padding: 3px 6px; margin: 0 2px; border: 1px solid var(--cc); border-inline-start-width: 4px; border-radius: 6px; background: var(--cbg); overflow: hidden; line-height: 1.25; font-size: .74rem; color: #13222a; }
    .ip-bt { display: flex; align-items: baseline; gap: .3rem; } .ip-bt small { margin-inline-start: auto; }
    .ip-b { container-type: inline-size; } @container (max-width: 135px) { .ip-bt small { display: none; } .ip-b b { font-size: .72rem; } }
    .ip-b b { color: var(--cc); font-size: .78rem; white-space: nowrap; } .ip-b span { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-weight: 700; font-size: .74rem; line-height: 1.2; }
    .ip-b small { color: #4b5a62; white-space: nowrap; font-size: .68rem; font-weight: 700; }
    .ip-b.oh { border-style: dashed; }
    .ip-free { top: 4px; bottom: 4px; display: flex; align-items: center; justify-content: center; border: 1px dashed #4fae6d; border-radius: 6px; background: repeating-linear-gradient(135deg, #eef9f1 0 8px, #e2f4e7 8px 16px); color: #0d5c2a; overflow: hidden; font-style: normal; }
    .ip-free span { font-size: .72rem; font-weight: 700; white-space: nowrap; padding: 0 4px; font-variant-numeric: tabular-nums; } .ip-free b { font-weight: 800; }
    .ip-free { container-type: inline-size; } @container (max-width: 125px) { .ip-free b { display: none; } .ip-free span { font-size: .66rem; } } @container (max-width: 80px) { .ip-free span { display: none; } }
    .ip-cols { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: .5rem; }
    .ip-col { border: 1px solid #ece6da; border-radius: 10px; padding: .4rem; background: #fcfaf6; min-width: 0; }
    .ip-col h6 { margin: -.4rem -.4rem .4rem; padding: .35rem .5rem; background: #091b22; color: #fff; border-radius: 9px 9px 0 0; font-size: .84rem; font-weight: 800; text-align: center; }
    .ip-ce { border: 1px solid var(--cc); border-inline-start-width: 4px; border-radius: 6px; background: var(--cbg); padding: 3px 6px; margin-bottom: 4px; font-size: .74rem; line-height: 1.3; }
    .ip-ce em { display: block; font-style: normal; font-weight: 800; color: #091b22; font-size: .74rem; } .ip-ce b { color: var(--cc); } .ip-ce span { display: block; font-weight: 700; } .ip-ce small { color: #4b5a62; font-size: .68rem; margin-inline-start: auto; }
    .ip-ce.oh { border-style: dashed; }
    .ip-cf { border: 1px dashed #4fae6d; border-radius: 6px; background: #eef9f1; color: #0d5c2a; padding: 2px 6px; margin-bottom: 4px; font-size: .72rem; font-weight: 700; }
    .ip-cnone { color: #8a959a; font-size: .76rem; text-align: center; padding: .6rem 0; }
    @media (max-width: 991.98px) { .ip-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .ip-wkey { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin-top: .55rem; font-size: .72rem; color: #5b6970; }
    .ip-wkey span { display: inline-flex; align-items: center; gap: .3rem; }
    .ip-sw { display: inline-block; width: 18px; height: 11px; border-radius: 3px; border: 1px solid #901d23; background: #fbecec; } .ip-sw.f { border: 1px dashed #4fae6d; background: #e2f4e7; } .ip-sw.o { border: 1px dashed #15803d; background: #e7f6ec; }
    .ip-side .card { overflow: hidden; }
    .ip-side .card-header, .ip-secs .card-header { padding: .45rem .8rem; font-weight: 800; font-size: .9rem; }
    .ip-fr { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr); gap: .4rem; align-items: center; padding: .3rem 0; border-bottom: 1px dashed #ece6da; font-size: .8rem; }
    .ip-fr:last-child { border-bottom: 0; } .ip-fr > b { color: #091b22; }
    .ip-fr span { display: flex; flex-wrap: wrap; gap: 4px; } .ip-fr em { font-style: normal; font-weight: 700; font-size: .74rem; background: #e9f7ee; border: 1px solid #8fd0a4; color: #0d5c2a; border-radius: 999px; padding: 0 8px; font-variant-numeric: tabular-nums; }
    .ip-fr .none { color: #8a959a; font-size: .74rem; }
    .ip-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .3rem .7rem; font-size: .8rem; margin: 0; }
    .ip-facts dt { color: #6b777c; font-weight: 600; white-space: nowrap; } .ip-facts dd { margin: 0; font-weight: 700; color: #13222a; }
    .ip-facts dd a { color: #091b22; text-decoration: none; border-bottom: 1px dotted #901d23; } .ip-facts dd a:hover { color: #901d23; }
    .ip-meter { height: 6px; border-radius: 3px; background: #ece6da; overflow: hidden; margin-top: 3px; } .ip-meter i { display: block; height: 100%; background: #901d23; }
    .ip-secs .ins-table { font-size: .82rem; } .ip-secs .ins-table td, .ip-secs .ins-table th { padding: .35rem .5rem; }
    .ip-live { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .5rem; padding: .6rem .7rem !important; background: #faf8f3; }
    .ip-lv { background: #fff; border: 1px solid #e3dccd; border-radius: 12px; padding: .45rem .7rem; display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
    .ip-lv-then { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; font-size: .7rem; color: #6b777c; border-top: 1px dashed #e3dccd; padding-top: .25rem; }
    .ip-lv-then em { font-style: normal; background: var(--cbg); border-inline-start: 3px solid var(--cc); border-radius: 4px; padding: 0 .35rem; color: #13222a; } .ip-lv-then em b { color: var(--cc); }
    .ip-lv.now, .ip-lv.next { border-inline-start: 5px solid var(--cc); }
    .ip-lv.now { background: linear-gradient(0deg, #fff, #fff), var(--cbg); box-shadow: 0 0 0 2px #cdebd6; border-color: #7cc694; border-inline-start-color: #15803d; }
    .ip-lv-h { display: flex; align-items: center; gap: .4rem; font-size: .74rem; font-weight: 800; color: #6b4a1f; text-transform: none; }
    .ip-lv.now .ip-lv-h { color: #0d6b2e; } .ip-lv-h bdi, .ip-lv-h .ms-auto { font-weight: 800; color: #091b22; font-size: .8rem; font-variant-numeric: tabular-nums; }
    .ip-dot { width: 9px; height: 9px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 0 rgba(22,163,74,.6); animation: ipPing 1.6s infinite; }
    @keyframes ipPing { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.55); } 70% { box-shadow: 0 0 0 8px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
    .ip-lv-c { font-size: 1.05rem; color: var(--cc, #091b22); font-weight: 800; } .ip-lv.idle .ip-lv-c { color: #5b6970; font-size: .98rem; }
    .ip-lv-sec { font-size: .72rem; font-weight: 700; background: #091b22; color: #fff; border-radius: 20px; padding: 0 .45rem; vertical-align: middle; }
    .ip-lv-n { font-weight: 700; color: #13222a; font-size: .88rem; line-height: 1.3; } .ip-lv.idle .ip-lv-n { color: #6b777c; font-weight: 600; font-size: .8rem; }
    .ip-lv-m { display: flex; flex-wrap: wrap; gap: .2rem .7rem; font-size: .78rem; margin-top: .15rem; }
    .ip-lv-m a { color: #091b22; font-weight: 800; text-decoration: none; } .ip-lv-m a:hover { color: #901d23; } .ip-lv-m i { color: #901d23; } .ip-lv-m small { color: #6b777c; }
    .ip-lv-mode { color: #2b4cb3; font-weight: 700; } .ip-lv-mode i { color: #2b4cb3 !important; }
    .ip-prog { height: 6px; border-radius: 3px; background: #e2efe6; overflow: hidden; } .ip-prog i { display: block; height: 100%; background: #16a34a; border-radius: 3px; }
    .ip-lv-f { font-size: .76rem; color: #3c474c; margin-top: auto; } .ip-lv-f b { color: #091b22; } .ip-lv.next .ip-lv-f { color: #7a1a1f; } .ip-lv.next .ip-lv-f b { color: #901d23; }
    .ip-lv-list { display: flex; flex-direction: column; gap: 3px; }
    .ip-lv-list > div { display: grid; grid-template-columns: 2.6rem auto minmax(0, 1fr) auto; gap: .35rem; align-items: baseline; font-size: .76rem; padding: 2px 6px; border-radius: 5px; background: var(--cbg); border-inline-start: 3px solid var(--cc); }
    .ip-lv-list bdi { font-weight: 800; color: #091b22; font-variant-numeric: tabular-nums; } .ip-lv-list b { color: var(--cc); }
    .ip-lv-list span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; } .ip-lv-list small { color: #5b6970; }
    .ip-lv-list p { margin: 0; color: #8a959a; font-size: .78rem; }
    @media (max-width: 575.98px) { .ip-live { grid-template-columns: 1fr; padding: .6rem; } }
    @media (max-width: 767.98px) { .ip-mx { overflow-x: auto; -webkit-overflow-scrolling: touch; } .ip-mx > * { min-width: 720px; } .ip-mx { --dw: 70px; }
      .ip-cols { grid-template-columns: 1fr; } .ip-wk .card-header { padding: .5rem; } .ip-tools { margin-inline-start: 0; gap: .35rem .5rem; } .ip-seg button { padding: .25rem .45rem; font-size: .72rem; }
      .ip-legend { padding: .4rem .6rem; } .ip-id .ins-photo { width: 72px; height: 72px; } }
    @media (max-width: 991.98px) and (min-width: 768px) { .ip-b span { display: none; } }`;
  if (!document.getElementById('ip-css')) { const el = document.createElement('style'); el.id = 'ip-css'; el.textContent = IP_CSS; document.head.appendChild(el); }

  // «الآن والتالية»: the lecture going on (with how far it has run), the next one (with a countdown) and the rest of today
  function liveInfo(W) {
    const amman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Amman' }));
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const T = IDX.teaching || {}, hol = new Set(T.holidays || []);
    const today = ymd(amman), mins = amman.getHours() * 60 + amman.getMinutes(), dToday = U.JS_DAY[amman.getDay()];
    const list = W.items.map(x => ({ ...x, a: toMin(x.start), b: toMin(x.end) }));
    const R = { mins, dToday, note: '' };
    if (T.start && today < T.start) R.note = `تبدأ المحاضرات ${U.numDate(T.start)}`;
    else if (T.end && today > T.end) { R.note = 'انتهت فترة التدريس لهذا الفصل'; return R; }
    if (hol.has(today)) R.note = 'اليوم عطلة رسمية';
    if (!hol.has(today) && !(T.start && today < T.start)) {
      R.cur = list.filter(x => x.day === dToday && x.a <= mins && mins < x.b).sort((a, b) => !!a.oh - !!b.oh)[0];
      R.rest = list.filter(x => !x.oh && x.day === dToday && x.a > mins).sort((a, b) => a.a - b.a);
    }
    for (let k = 0; k < 21; k++) {
      const d = new Date(amman); d.setDate(d.getDate() + k);
      const key = ymd(d);
      if (hol.has(key) || (T.end && key > T.end) || (T.start && key < T.start)) continue;
      const nx = list.filter(x => !x.oh && x.day === U.JS_DAY[d.getDay()] && (k > 0 || x.a > mins)).sort((a, b) => a.a - b.a)[0];
      if (nx) { R.next = nx; R.k = k; R.date = d; break; }
    }
    return R;
  }
  const durTxt = m => { const h = Math.floor(m / 60), r = m % 60; return [h ? (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`) : '', r ? `${r} دقيقة` : ''].filter(Boolean).join(' و'); };
  function liveHTML(W) {
    const R = liveInfo(W);
    const room = x => x.s ? (x.s.room === '0' ? '<span><i class="bi bi-laptop"></i> قاعة افتراضية</span>' : `<a href="room.html?r=${encodeURIComponent(x.s.room)}"><i class="bi bi-geo-alt-fill"></i> ${esc(x.s.room)}</a>${x.s.building ? ` <small>${esc(x.s.building)}</small>` : ''}`) : (W.ohPlace ? `<span><i class="bi bi-geo-alt-fill"></i> ${esc(W.ohPlace)}</span>` : '');
    const mode = x => x.m && x.m.mode !== 'وجاهي' ? `<span class="ip-lv-mode"><i class="bi ${(U.MODE[x.m.mode] || {}).icon || 'bi-laptop'}"></i> ${esc(x.m.mode)}</span>` : '';
    const what = x => x.oh ? '<b class="ip-lv-c">ساعة مكتبية</b>' : `<b class="ip-lv-c" dir="ltr">${esc(x.s.code)}</b> <span class="ip-lv-sec">شعبة ${esc(x.s.section)}</span><div class="ip-lv-n">${esc(x.s.name)}</div>`;
    let cur;
    if (R.cur) {
      const x = R.cur, pct = Math.max(2, Math.round(100 * (R.mins - x.a) / (x.b - x.a)));
      cur = `<div class="ip-lv now" style="${x.style}"><div class="ip-lv-h"><span class="ip-dot"></span> ${x.oh ? 'الآن · ساعة مكتبية' : 'يحاضر الآن'}<bdi class="ms-auto" dir="ltr">${x.start}–${x.end}</bdi></div>
        <div class="ip-lv-b">${what(x)}<div class="ip-lv-m">${room(x)}${mode(x)}</div></div>
        <div class="ip-prog"><i style="width:${pct}%"></i></div><div class="ip-lv-f">مضى ${durTxt(R.mins - x.a) || 'أقل من دقيقة'} · يبقى <b>${durTxt(x.b - R.mins)}</b></div></div>`;
    } else {
      const hadToday = W.items.some(x => x.day === R.dToday && !x.oh);
      cur = `<div class="ip-lv idle"><div class="ip-lv-h"><i class="bi bi-pause-circle"></i> الآن</div><div class="ip-lv-b"><b class="ip-lv-c">لا محاضرة الآن</b>
        <div class="ip-lv-n">${esc(R.note || (R.rest && R.rest.length ? 'بين المحاضرات' : hadToday ? 'انتهت محاضرات اليوم' : 'لا محاضرات اليوم'))}</div></div></div>`;
    }
    let nxt;
    if (R.next) {
      const x = R.next, w = R.k === 0 ? 'اليوم' : R.k === 1 ? 'غداً' : U.DAYS[x.day];
      const cd = R.k === 0 ? `تبدأ بعد <b>${durTxt(x.a - R.mins)}</b>` : `<b>${esc(w)}</b> · ${U.DAYS[x.day]} ${R.date.getDate()}/${R.date.getMonth() + 1}`;
      nxt = `<div class="ip-lv next" style="${x.style}"><div class="ip-lv-h"><i class="bi bi-skip-forward-circle"></i> المحاضرة التالية<span class="ms-auto">${esc(w)} <bdi dir="ltr">${x.start}–${x.end}</bdi></span></div>
        <div class="ip-lv-b">${what(x)}<div class="ip-lv-m">${room(x)}${mode(x)}</div></div><div class="ip-lv-f"><i class="bi bi-alarm"></i> ${cd}</div></div>`;
    } else nxt = `<div class="ip-lv idle"><div class="ip-lv-h"><i class="bi bi-skip-forward-circle"></i> المحاضرة التالية</div><div class="ip-lv-b"><b class="ip-lv-c">لا محاضرات قادمة</b><div class="ip-lv-n">${esc(R.note || 'ضمن فترة التدريس')}</div></div></div>`;
    const rest = (R.rest || []).filter(x => x !== R.next);
    if (rest.length) nxt = nxt.replace(/<\/div>$/, `<div class="ip-lv-then"><span>ثم اليوم:</span>${rest.map(x => `<em style="${x.style}" title="${esc(x.s.name)}"><bdi dir="ltr">${x.start}</bdi> <b dir="ltr">${esc(x.s.code)}</b></em>`).join('')}</div></div>`);
    return cur + nxt;
  }
  let liveTimer;
  function personView(I) {
    const W = build(I), F = facts(I, W), P = vLoad();
    const pageUrl = SITE + 'instructor.html?id=' + I.id;
    const icsUrl = I.ics ? SITE + I.ics : '';

    document.title = `${I.name} – جامعة البترا`;
    $('#pg-title').textContent = I.name;
    $('#pg-sub').textContent = [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · ') || 'عضو هيئة تدريس';
    $('#pg-actions').innerHTML = `<div class="d-flex flex-wrap gap-2 justify-content-end">
        ${icsUrl ? `<button type="button" class="btn btn-update" id="i-sub"><i class="bi bi-calendar-plus"></i> اشترك في جدولي</button>` : ''}
        <button type="button" class="btn btn-update" id="i-print"><i class="bi bi-printer"></i> طباعة / PDF</button></div>
      <small class="update-when" id="pg-updated">—</small>`;
    U.updatedLine(TT.updated, 'يُراجَع كل ساعة');

    const contact = [
      I.email ? `<a href="mailto:${esc(I.email)}"><i class="bi bi-envelope-fill"></i><b dir="ltr">${esc(I.email)}</b></a>` : '',
      I.ext ? `<a href="tel:+96265799555,${esc(I.ext)}"><i class="bi bi-telephone-fill"></i><span><small>الفرعي</small> <b dir="ltr">${esc(I.ext)}</b></span></a>` : '',
      I.office ? `<span class="ip-c"><i class="bi bi-door-open-fill"></i><span><small>المكتب</small> <b>${esc(I.office)}</b></span></span>` : '',
    ].join('');
    const groups = [];
    W.secs.forEach(s => { const k = s.code + '|' + s.activity; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, s0: s, list: [] }); g.list.push(s); });
    const otherDept = s => s.department && I.department && !I.department.split(', ').includes(s.department);
    const perCourse = c => W.secs.filter(s => s.code === c).reduce((a, s) => a + s.registered, 0);
    const seg = (k, opts) => `<div class="ip-seg" role="group">${opts.map(([v, l, ic]) => `<button type="button" data-ipk="${k}" data-ipv="${v}" class="${P[k] === v ? 'on' : ''}">${ic ? `<i class="bi ${ic}"></i> ` : ''}${l}</button>`).join('')}</div>`;
    const cb = (k, l) => `<label class="ip-cb${P[k] ? ' on' : ''}"><input type="checkbox" data-ipc="${k}" ${P[k] ? 'checked' : ''}>${l}</label>`;
    const day = d => U.DAYS[d];

    const secsTable = `<div class="table-responsive"><table class="table align-middle mb-0 tt-table ins-table">
            <thead><tr><th>المقرر</th><th class="text-center">الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>المسجلون</th></tr></thead>
          <tbody>${groups.map(g => { const [c, bg] = W.color(g.s0.code); return g.list.map((s, i) => `<tr class="${i ? '' : 'ins-first'}" style="--cc:${c};--cbg:${bg}">
            ${i ? '' : `<td class="ins-course" rowspan="${g.list.length}"><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)}
              <span class="tt-act ${s.activity === 'عملي' ? 'lab' : ''}">${esc(s.activity)}</span>${s.degree !== 'البكالوريوس' ? ` <span class="badge text-bg-warning">${esc(s.degree)}</span>` : ''}
              ${otherDept(s) ? `<small>${esc(s.department)}</small>` : ''}</td>`}
            <td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td>
            <td class="ins-when">${when(s)}</td>
            <td class="ins-room">${s.room === '0' ? '<span class="tt-none">قاعة افتراضية (0)</span>' : `<a href="room.html?r=${encodeURIComponent(s.room)}" title="صفحة القاعة"><b>${esc(s.room)}</b> <i class="bi bi-door-open"></i></a> <small>${esc(s.building)}</small>`}</td>
            <td>${seats(s)}</td></tr>`).join(''); }).join('')}</tbody></table></div>`;
    $('#ins-app').innerHTML = `
      <section class="card ip-hero mb-3"><div class="ip-hero-in">
        <div class="ip-id">${I.photo ? `<img class="ins-photo" src="${esc(I.photo)}" alt="">` : `<span class="ins-photo ins-ini">${esc(initials(I.name))}</span>`}
          <div class="min-w-0"><h2>${esc(I.name)}</h2>${I.name_en ? `<div class="ins-en" dir="ltr">${esc(I.name_en)}</div>` : ''}
            <div class="ip-badges">${I.role ? `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(I.role)}</span>` : ''}${I.rank ? `<span class="badge text-bg-light border">${esc(I.rank)}</span>` : ''}
              ${I.corrected ? '<span class="badge badge-fix" title="بيانات مصحَّحة عن الموقع الرسمي (انظر دليل الموظفين)"><i class="bi bi-pencil-square"></i> مصحَّح</span>' : ''}</div>
            <div class="ins-unit"><i class="bi bi-diagram-3"></i> ${esc(I.department || 'القسم غير معروف')}${I.faculty ? `<small>${esc(I.faculty)}</small>` : ''}</div>
          <div class="ip-ct">${contact || '<span class="text-muted small">لا توجد بيانات تواصل في دليل الموظفين.</span>'}</div>
          <div class="ip-links no-print">
            ${I.directory_id ? `<a href="directory.html?q=${encodeURIComponent(U.shortName(I.name).split(' ').slice(0, 2).join(' '))}"><i class="bi bi-person-lines-fill"></i> دليل الموظفين</a>` : ''}
            ${I.profile ? `<a href="${esc(I.profile)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> الملف الرسمي</a>` : ''}
            <a href="timetable.html?inst=${encodeURIComponent(I.name)}"><i class="bi bi-table"></i> الجدول الدراسي</a></div></div></div>
        <div class="ip-live" id="ip-live" aria-live="polite">${liveHTML(W)}</div>
        <div class="ip-kpis">
          <div class="ip-k"><b>${W.secs.length}</b><span>شعبة</span></div>
          <div class="ip-k"><b>${W.courses.length}</b><span>مقرر</span></div>
          <div class="ip-k"><b>${W.hours.toLocaleString('en-US')}</b><span>ساعة حضور أسبوعياً</span></div>
          <div class="ip-k"><b>${W.students}</b><span>طالباً مسجلاً</span></div>
          <div class="ip-k free"><b>${hrs(F.freeMin)}</b><span title="بين 08:00 و16:00، فترات ساعة فأكثر">ساعة فراغ في الدوام</span></div>
          <div class="ip-k"><b>${F.campus.length}</b><span>${F.campus.length > 2 && F.campus.length < 11 ? 'أيام' : 'يوم'} في الحرم</span></div></div>
      </div></section>

      <section class="card ip-wk mb-3"><div class="card-header">
        <h5><i class="bi bi-calendar-week"></i> الجدول الأسبوعي</h5>
        <div class="ip-tools no-print">
          ${seg('v', [['mx', 'مصفوفة الأسبوع والفراغ', 'bi-distribute-horizontal'], ['cols', 'الأيام كأعمدة', 'bi-layout-three-columns'], ['grid', 'الشبكة الزمنية', 'bi-calendar3'], ['secs', `الشعب (${W.secs.length})`, 'bi-list-ul']])}
          ${P.v === 'mx' || P.v === 'cols' ? `<span class="ip-tl">الساعات</span>${seg('range', [['auto', 'تلقائي'], ['work', 'الدوام 08–16']])}` : ''}
          ${P.v === 'mx' || P.v === 'cols' ? `<span class="ip-tl">الخانة</span>${cb('name', 'اسم المقرر')}${cb('room', 'القاعة')}${P.v === 'mx' ? cb('time', 'الوقت') : ''}${cb('free', 'الفراغ')}` : ''}
        </div></div>
        <div class="ip-legend">${W.courses.map(c => { const s = W.secs.find(x => x.code === c), [col, bg] = W.color(c);
          return `<span style="--cc:${col};--cbg:${bg}"><i></i><b dir="ltr">${esc(c)}</b> ${esc(s.name)} <em>(${perCourse(c)} طالباً)</em></span>`; }).join('')}</div>
        ${P.v === 'secs' ? `<div class="ip-secs">${secsTable}</div>` : `<div class="card-body p-2 p-md-3" id="ip-week">${weekBody(W, P)}
          <div class="ip-wkey"><span><i class="ip-sw"></i> محاضرة (لون لكل مقرر)</span><span><i class="ip-sw o"></i> ساعة مكتبية</span>${P.free ? '<span><i class="ip-sw f"></i> فراغ لساعة أو أكثر (08:00–16:00)</span>' : ''}
            ${Object.entries(U.MODE).filter(([k]) => k !== 'غير متزامن').map(([k, v]) => `<span><i class="bi ${v.icon}"></i> ${k}</span>`).join('')}
            ${W.asyncSecs.length ? `<span class="ms-auto"><i class="bi bi-info-circle"></i> ${W.asyncSecs.length} ${W.asyncSecs.length > 2 && W.asyncSecs.length < 11 ? 'شعب لها' : 'شعبة لها'} لقاءات غير متزامنة لا تظهر في الجدول</span>` : ''}</div></div>`}</section>

      <div class="row g-3 mb-3 ip-side">
        <div class="col-lg-4"><section class="card ins-oh h-100" id="ins-oh">${ohCard(I, W)}</section></div>
        <div class="col-lg-4"><section class="card h-100"><div class="card-header"><i class="bi bi-hourglass-split"></i> أوقات الفراغ <small class="text-muted fw-normal">08:00–16:00 · ساعة فأكثر</small></div>
            <div class="card-body py-1 px-3">${F.freeBy.map(([d, rs]) => `<div class="ip-fr"><b>${esc(day(d))}</b><span>${rs.length ? rs.map(r => `<em dir="ltr">${toTime(r[0])}–${toTime(r[1])}</em>`).join('') : '<span class="none">لا فراغ لساعة</span>'}</span></div>`).join('')}</div></section></div>
        <div class="col-lg-4"><section class="card h-100"><div class="card-header"><i class="bi bi-info-square"></i> معلومات مفيدة</div>
            <div class="card-body py-2 px-3"><dl class="ip-facts">
              ${F.campus.length ? `<dt>أيام الحضور</dt><dd>${F.campus.length ? U.WEEK.filter(d => F.campus.includes(d)).map(day).join('، ') : '—'}</dd>` : ''}
              ${F.busiest && F.busiest[1] ? `<dt>أكثر الأيام</dt><dd>${esc(day(F.busiest[0]))} · ${hrs(F.busiest[1])} ساعة</dd>` : ''}
              ${F.first ? `<dt>أبكر محاضرة</dt><dd>${esc(day(F.first.day))} <bdi dir="ltr">${F.first.start}</bdi></dd><dt>آخر محاضرة</dt><dd>${esc(day(F.last.day))} حتى <bdi dir="ltr">${F.last.end}</bdi></dd>` : ''}
              <dt>نمط التدريس</dt><dd>${Object.entries(F.modes).map(([m, n]) => `${esc(m)} (${n})`).join('، ') || '—'}</dd>
              ${F.rooms.length ? `<dt>القاعات</dt><dd>${F.rooms.map(r => `<a href="room.html?r=${encodeURIComponent(r)}">${esc(r)}</a>`).join('، ')}</dd>` : ''}
              <dt>نسبة الامتلاء</dt><dd>${W.students} من ${F.cap} مقعداً (${F.fill}%)<div class="ip-meter"><i style="width:${Math.min(100, F.fill)}%"></i></div></dd>
            </dl></div></section></div>
      </div>`;

    const sub = $('#i-sub');
    if (sub) sub.addEventListener('click', () => subscribe(I, icsUrl));
    $('#i-print').addEventListener('click', () => printPage(I, W, pageUrl));
    document.querySelectorAll('[data-ipk]').forEach(b => b.addEventListener('click', () => { P[b.dataset.ipk] = b.dataset.ipv; vSave(P); personView(I); }));
    document.querySelectorAll('[data-ipc]').forEach(b => b.addEventListener('change', () => { P[b.dataset.ipc] = b.checked; vSave(P); personView(I); }));
    bindOh(I, W);
    clearInterval(liveTimer);
    liveTimer = setInterval(() => { const el = $('#ip-live'); if (el) el.innerHTML = liveHTML(W); else clearInterval(liveTimer); }, 60000);
  }

  function subscribe(I, url) {
    const webcal = url.replace(/^https?:/, 'webcal:');
    U.modal('<i class="bi bi-calendar-plus"></i> اشترك في محاضرات ' + esc(I.name), `
      <p class="small text-muted">اشتراك لمرة واحدة: تظهر المحاضرات أسبوعياً في تقويم هاتفك طوال فترة التدريس
        (${U.numDate(IDX.teaching.start)} – ${U.numDate(IDX.teaching.end)})، بدون العطل الرسمية، ويتحدّث تلقائياً إذا تغيّر الجدول.</p>
      <div class="sub-grid">
        <a class="sub-opt" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener"><i class="bi bi-google"></i><b>Google Calendar</b><small>هاتف Android والويب</small></a>
        <a class="sub-opt" href="${esc(webcal)}"><i class="bi bi-apple"></i><b>iPhone / Mac</b><small>تقويم Apple</small></a>
        <a class="sub-opt" href="https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('محاضرات ' + I.name)}" target="_blank" rel="noopener"><i class="bi bi-microsoft"></i><b>Outlook</b><small>بريد الجامعة / Office 365</small></a>
        <a class="sub-opt" href="${esc(url)}" download="${esc('محاضرات_' + U.shortName(I.name).replace(/\s+/g, '_'))}.ics"><i class="bi bi-download"></i><b>تنزيل الملف</b><small>‎.ics لأي تطبيق تقويم</small></a>
      </div>
      <div class="input-group input-group-sm mt-3"><input class="form-control" readonly dir="ltr" value="${esc(url)}" id="i-sub-url">
        <button class="btn btn-primary" type="button" onclick="navigator.clipboard && navigator.clipboard.writeText(document.getElementById('i-sub-url').value)"><i class="bi bi-clipboard"></i> نسخ الرابط</button></div>`);
  }

  // One A4 page whatever the number of sections, built for paper: the week as a table of the actual lecture times
  // (no empty hours, so little scaling and large text), dark text with course-coloured edges (clear in black and white too)
  function printPage(I, W, url) {
    const q = qrcode(0, 'M');
    q.addData(unescape(encodeURIComponent(url)));
    q.make();
    const svg = q.createSvgTag({ cellSize: 5, margin: 1, scalable: true }).replace(/fill="black"/g, 'fill="#000"');
    const days = W.days.filter(d => d !== 'ج' || W.items.some(x => x.day === d));
    const slots = [...new Set(W.items.map(x => x.start + '–' + x.end))]
      .sort((a, b) => toMin(a.slice(0, 5)) - toMin(b.slice(0, 5)) || toMin(a.slice(6)) - toMin(b.slice(6)));
    const entry = x => `<div class="pw-e" style="${x.style}"><b dir="ltr">${esc(x.title.replace(' · ش', ' / ش'))}</b>${x.icon ? ' <i class="bi ' + x.icon + '"></i>' : ''}
      <span>${esc(x.line)}</span><small>${esc(x.sub)}</small></div>`;
    const week = `<table class="pw"><thead><tr><th class="pw-t">الوقت</th>${days.map(d => `<th>${esc(U.DAYS[d])}</th>`).join('')}</tr></thead><tbody>
      ${slots.map(k => `<tr><th class="pw-t" dir="ltr">${k}</th>${days.map(d => `<td>${W.items.filter(x => x.day === d && x.start + '–' + x.end === k).map(entry).join('')}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
    const free = days.map(d => {
      const runs = W.free(d).filter(r => r[1] - r[0] >= 60);
      return `<tr><th>${esc(U.DAYS[d])}</th><td dir="ltr">${runs.map(r => `${toTime(r[0])}–${toTime(r[1])}`).join('  ·  ') || '—'}</td></tr>`;
    }).join('');
    const rows = W.secs.map(s => { const [c] = W.color(s.code); return `<tr><td class="pc" style="border-inline-start:5px solid ${c}"><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)} <small>${esc(s.activity)}${s.degree !== 'البكالوريوس' ? ' · ' + esc(s.degree) : ''}</small></td>
      <td class="num"><b>${esc(s.section)}</b></td><td>${esc(whenText(s))}</td><td>${s.room === '0' ? 'قاعة افتراضية (0)' : `<b>${esc(s.room)}</b> <small>${esc(s.building)}</small>`}</td>
      <td class="num">${s.registered}/${s.capacity}</td><td class="num"><span class="pill ${s.status === 'مغلقة' ? 'no' : 'ok'}">${esc(s.status)}</span></td></tr>`; }).join('');
    const CSS = `<style>
      .pi { display: grid; grid-template-columns: auto ${W.oh ? 'auto ' : ''}1fr auto; gap: 14px; align-items: stretch; margin-top: 10px; }
      .pi-oh { border: 2px solid #15803d; border-radius: 10px; padding: 6px 12px; background: #e7f6ec; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
      .pi-oh b { font-size: 11pt; color: #0d4f25; } .pi-oh span { font-size: 10.5pt; font-weight: 800; color: #000; } .pi-oh small { font-size: 9pt; color: #0d4f25; }
      .pi-card { display: flex; gap: 12px; align-items: center; border: 1.5px solid #091b22; border-radius: 10px; padding: 8px 12px; }
      .pi-card img { width: 66px; height: 66px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid #901d23; }
      .pi-card dl { margin: 0; display: grid; grid-template-columns: auto auto; gap: 2px 10px; font-size: 10.5pt; }
      .pi-card dt { color: #444; } .pi-card dd { margin: 0; font-weight: 800; color: #000; }
      .pi-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .pi-stats div { border: 1.5px solid #091b22; border-top-width: 4px; border-radius: 10px; padding: 6px 10px; font-size: 10pt; color: #222; display: flex; flex-direction: column; justify-content: center; }
      .pi-stats b { font-size: 19pt; color: #000; line-height: 1.1; }
      .pi-qr { display: flex; gap: 8px; align-items: center; border: 1.5px solid #091b22; border-radius: 10px; padding: 6px 10px; max-width: 250px; }
      .pi-qr svg { width: 74px; height: 74px; flex: 0 0 auto; }
      .pi-qr span { font-size: 8.5pt; color: #111; line-height: 1.35; } .pi-qr b { display: block; font-size: 7.5pt; color: #000; word-break: break-all; direction: ltr; text-align: left; }
      table.pw { margin-top: 6px; table-layout: fixed; }
      table.pw thead th { background: #091b22 !important; color: #fff !important; text-align: center; font-size: 11pt; padding: 6px; }
      table.pw th.pw-t { width: 92px; }
      table.pw tbody th.pw-t { background: #f1ede4 !important; color: #000; font-size: 10pt; font-weight: 800; text-align: center; border: 1px solid #c9c2b2; white-space: nowrap; }
      table.pw td { padding: 4px; border: 1px solid #c9c2b2; vertical-align: top; background: #fff !important; }
      .pw-e { border: 1px solid #b9b2a2; border-inline-start: 6px solid var(--cc); border-radius: 6px; padding: 3px 7px; background: var(--cbg); line-height: 1.3; }
      .pw-e + .pw-e { margin-top: 4px; }
      .pw-e b { font-size: 10.5pt; color: #000; } .pw-e i { color: #000; font-size: 9pt; }
      .pw-e span { display: block; font-size: 9.5pt; font-weight: 700; color: #111; }
      .pw-e small { display: block; font-size: 9pt; color: #222; font-weight: 700; }
      .pb { display: grid; grid-template-columns: 1fr 250px; gap: 14px; align-items: start; }
      table.ps td, table.pf td, table.pf th { font-size: 10pt; color: #000; }
      table.ps td small { display: inline; color: #444; font-size: 8.5pt; }
      table.ps thead th { font-size: 10pt; }
      table.pf th { background: #f1ede4 !important; width: 72px; text-align: start; padding: 4px 6px; border: 1px solid #c9c2b2; }
      table.pf td { border: 1px solid #c9c2b2; padding: 4px 6px; font-weight: 700; text-align: right; }
      .pn { font-size: 9pt; color: #333; margin: 4px 0 0; }
      h3.sec { font-size: 12.5pt; margin: 12px 0 4px; }
    </style>`;
    printReport({
      title: I.name, subtitle: [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · '),
      orientation: 'landscape', fit: true, source: IDX.term,
      css: ['https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css'],
      raw: `${CSS}<div class="pi">
          <div class="pi-card">${I.photo ? `<img src="${esc(new URL(I.photo, location.href).href)}" alt="">` : ''}
            <dl>${I.ext ? `<dt>الفرعي</dt><dd dir="ltr">${esc(I.ext)}</dd>` : ''}${I.office ? `<dt>المكتب</dt><dd>${esc(I.office)}</dd>` : ''}
              ${I.email ? `<dt>البريد</dt><dd dir="ltr">${esc(I.email)}</dd>` : ''}</dl></div>
          ${W.oh ? `<div class="pi-oh"><b><i class="bi bi-person-raised-hand"></i> الساعات المكتبية</b>${ohList(W.oh).map(x => `<span>${esc(x)}</span>`).join('')}${W.ohPlace ? `<small>المكان: ${esc(W.ohPlace)}${W.oh.mode && W.oh.mode !== 'وجاهي' ? ' · ' + esc(W.oh.mode) : ''}</small>` : ''}</div>` : ''}
          <div class="pi-stats"><div><b>${W.secs.length}</b>شعبة</div><div><b>${W.courses.length}</b>مقرر</div><div><b>${W.hours}</b>ساعة حضور أسبوعياً</div><div><b>${W.students}</b>طالباً مسجلاً</div></div>
          <div class="pi-qr">${svg}<span>امسح الرمز للجدول المحدَّث وبيانات التواصل<b>${esc(url.replace(/^https?:\/\//, ''))}</b></span></div>
        </div>
        <h3 class="sec">الجدول الأسبوعي</h3>
        ${W.items.length ? week : '<p>لا لقاءات بوقت ثابت.</p>'}
        ${W.asyncSecs.length ? `<p class="pn">إضافة إلى ذلك: ${W.asyncSecs.length} شعبة لها لقاءات غير متزامنة (بلا وقت حضور ثابت)، مذكورة في جدول الشعب.</p>` : ''}
        <div class="pb">
          <div><h3 class="sec">الشعب (${W.secs.length})</h3>
            <table class="ps"><thead><tr><th>المقرر</th><th class="num">الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th class="num">المسجلون</th><th class="num">الحالة</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div><h3 class="sec">أوقات الفراغ (08:00–16:00)</h3><table class="pf">${free}</table></div>
        </div>`,
    });
  }

  // ---------------------------------------------------------------- start
  Promise.all([U.getJSON('data/instructors.json'), U.getJSON('data/timetable.json'), window.OH ? OH.load().catch(() => ({ map: {} })) : { map: {} }]).then(([idx, tt, oh]) => {
    IDX = idx; TT = tt; S = tt.sections; OHD = oh;
    U.setDays(tt.days);
    $('#foot-count').textContent = `${idx.instructors.length} مدرس · ${tt.term}`;
    U.updatedLine(tt.updated, 'يُراجَع كل ساعة');
    const id = qs().get('id');
    const I = id && idx.instructors.find(i => i.id === id);
    if (I) personView(I); else listView();
    const top = $('#pg-q');
    top.addEventListener('keydown', e => { if (e.key === 'Enter') location.href = 'instructor.html?q=' + encodeURIComponent(top.value); });
    if (!I) top.addEventListener('input', () => { const i = $('#i-q'); if (i) { i.value = top.value; i.dispatchEvent(new Event('input')); } });
  }).catch(e => { $('#ins-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})();
