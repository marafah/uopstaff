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
      return { day: m.day, start: m.start, end: m.end, title: `${s.code} · ش${s.section}`, line: s.name, sub: room(s),
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

  function personView(I) {
    const W = build(I);
    const pageUrl = SITE + 'instructor.html?id=' + I.id;
    const icsUrl = I.ics ? SITE + I.ics : '';
    const nn = nowNext(W);

    document.title = `${I.name} – جامعة البترا`;
    $('#pg-title').textContent = I.name;
    $('#pg-sub').textContent = [I.job && I.job !== I.rank ? I.job : '', I.rank, I.department, I.faculty].filter(Boolean).join(' · ') || 'عضو هيئة تدريس';
    $('#pg-actions').innerHTML = `<div class="d-flex flex-wrap gap-2 justify-content-end">
        ${icsUrl ? `<button type="button" class="btn btn-update" id="i-sub"><i class="bi bi-calendar-plus"></i> اشترك في جدولي</button>` : ''}
        <button type="button" class="btn btn-update" id="i-print"><i class="bi bi-printer"></i> طباعة / PDF</button></div>
      <small class="update-when" id="pg-updated">—</small>`;
    U.updatedLine(TT.updated, 'يُراجَع كل ساعة');

    const contact = [
      I.ext ? `<a class="ins-ct${I.office ? '' : ' wide'}" href="tel:+96265799555,${esc(I.ext)}"><i class="bi bi-telephone-fill"></i><span><small>الفرعي</small><b dir="ltr">${esc(I.ext)}</b></span></a>` : '',
      I.office ? `<span class="ins-ct${I.ext ? '' : ' wide'}"><i class="bi bi-door-open-fill"></i><span><small>المكتب</small><b>${esc(I.office)}</b></span></span>` : '',
      I.email ? `<a class="ins-ct wide" href="mailto:${esc(I.email)}"><i class="bi bi-envelope-fill"></i><span><small>البريد</small><b dir="ltr">${esc(I.email)}</b></span></a>` : '',
    ].join('');
    const groups = [];
    W.secs.forEach(s => { const k = s.code + '|' + s.activity; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, s0: s, list: [] }); g.list.push(s); });
    const otherDept = s => s.department && I.department && !I.department.split(', ').includes(s.department);

    $('#ins-app').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-xl-5"><section class="card h-100 ins-card"><div class="card-body">
          <div class="ins-top">
            ${I.photo ? `<img class="ins-photo" src="${esc(I.photo)}" alt="">` : `<span class="ins-photo ins-ini">${esc(initials(I.name))}</span>`}
            <div class="min-w-0"><h2 class="ins-name">${esc(I.name)}</h2>${I.name_en ? `<div class="ins-en" dir="ltr">${esc(I.name_en)}</div>` : ''}
              <div class="mt-1 d-flex flex-wrap gap-1">${I.role ? `<span class="badge badge-lead"><i class="bi bi-star-fill"></i> ${esc(I.role)}</span>` : ''}${I.rank ? `<span class="badge text-bg-light border">${esc(I.rank)}</span>` : ''}
              ${I.corrected ? '<span class="badge badge-fix" title="بيانات مصحَّحة عن الموقع الرسمي (انظر دليل الموظفين)"><i class="bi bi-pencil-square"></i> مصحَّح</span>' : ''}</div>
              <div class="ins-unit mt-2"><i class="bi bi-diagram-3"></i> ${esc(I.department || 'القسم غير معروف (غير موجود في دليل الموظفين)')}${I.faculty ? `<small>${esc(I.faculty)}</small>` : ''}</div></div>
          </div>
          <div class="ins-now ${nn.now ? 'live' : ''}"><i class="bi ${nn.icon}"></i> ${esc(nn.text)}</div>
          <div class="ins-cts">${contact || '<span class="text-muted small">لا توجد بيانات تواصل في دليل الموظفين.</span>'}</div>
          <div class="ins-links no-print">
            ${I.directory_id ? `<a href="directory.html?q=${encodeURIComponent(U.shortName(I.name).split(' ').slice(0, 2).join(' '))}"><i class="bi bi-person-lines-fill"></i> دليل الموظفين</a>` : ''}
            ${I.profile ? `<a href="${esc(I.profile)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> الملف الرسمي</a>` : ''}
            <a href="timetable.html?inst=${encodeURIComponent(I.name)}"><i class="bi bi-table"></i> الجدول الدراسي</a>
          </div></div></section></div>
        <div class="col-xl-7 d-flex flex-column gap-3">
          <div class="ins-kpis">
            <div class="stat-card"><div class="v">${W.secs.length}</div><div class="l"><i class="bi bi-collection-fill"></i> شعبة</div></div>
            <div class="stat-card"><div class="v">${W.courses.length}</div><div class="l"><i class="bi bi-journal-bookmark-fill"></i> مقرر</div></div>
            <div class="stat-card"><div class="v">${W.hours.toLocaleString('en-US')}</div><div class="l"><i class="bi bi-clock-fill"></i> ساعة حضور أسبوعياً</div></div>
            <div class="stat-card"><div class="v">${W.students}</div><div class="l"><i class="bi bi-people-fill"></i> طالباً مسجلاً</div></div></div>
          <section class="card ins-oh" id="ins-oh">${ohCard(I, W)}</section>
          <section class="card flex-grow-1"><div class="card-header"><i class="bi bi-hourglass-split"></i> أوقات الفراغ <small class="text-muted">بين 08:00 و16:00</small></div>
            <div class="card-body">${timeline(W)}</div></section>
        </div>
      </div>
      <section class="card mb-3"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-calendar-week"></i> الجدول الأسبوعي</span>
        <span class="ins-legend ms-auto">${W.courses.map(c => { const s = W.secs.find(x => x.code === c), [col, bg] = W.color(c);
          return `<span style="--cc:${col};--cbg:${bg}"><i></i><b dir="ltr">${esc(c)}</b> ${esc(s.name)}</span>`; }).join('')}</span></div>
        <div class="card-body">${W.items.length ? U.weekGrid(W.items, { days: W.days, px: 64, cls: 'wk-ins', compact: true }) : '<p class="text-muted mb-0">لا لقاءات بوقت ثابت.</p>'}
          <div class="ins-modes">${Object.entries(U.MODE).filter(([k]) => k !== 'غير متزامن').map(([k, v]) => `<span><i class="bi ${v.icon}"></i> ${k}</span>`).join('')}
            ${W.asyncSecs.length ? `<span class="ms-auto"><i class="bi bi-info-circle"></i> ${W.asyncSecs.length} ${W.asyncSecs.length > 2 && W.asyncSecs.length < 11 ? 'شعب لها' : 'شعبة لها'} لقاءات غير متزامنة (بلا وقت ثابت) لا تظهر في الجدول</span>` : ''}</div></div></section>
      <section class="card mb-3"><div class="card-header"><i class="bi bi-list-ul"></i> الشعب <small class="text-muted">${W.secs.length} شعبة في ${W.courses.length} مقرر</small></div>
        <div class="table-responsive"><table class="table align-middle mb-0 tt-table ins-table">
          <thead><tr><th>المقرر</th><th class="text-center">الشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>المسجلون</th></tr></thead>
        <tbody>${groups.map(g => { const [c, bg] = W.color(g.s0.code); return g.list.map((s, i) => `<tr class="${i ? '' : 'ins-first'}" style="--cc:${c};--cbg:${bg}">
          ${i ? '' : `<td class="ins-course" rowspan="${g.list.length}"><b dir="ltr">${esc(s.code)}</b> ${esc(s.name)}
            <span class="tt-act ${s.activity === 'عملي' ? 'lab' : ''}">${esc(s.activity)}</span>${s.degree !== 'البكالوريوس' ? ` <span class="badge text-bg-warning">${esc(s.degree)}</span>` : ''}
            ${otherDept(s) ? `<small>${esc(s.department)}</small>` : ''}</td>`}
          <td class="text-center"><span class="tt-sec">${esc(s.section)}</span></td>
          <td class="ins-when">${when(s)}</td>
          <td class="ins-room">${s.room === '0' ? '<span class="tt-none">قاعة افتراضية (0)</span>' : `<a href="room.html?r=${encodeURIComponent(s.room)}" title="صفحة القاعة"><b>${esc(s.room)}</b> <i class="bi bi-door-open"></i></a> <small>${esc(s.building)}</small>`}</td>
          <td>${seats(s)}</td></tr>`).join(''); }).join('')}</tbody></table></div></section>`;

    const sub = $('#i-sub');
    if (sub) sub.addEventListener('click', () => subscribe(I, icsUrl));
    $('#i-print').addEventListener('click', () => printPage(I, W, pageUrl));
    bindOh(I, W);
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
