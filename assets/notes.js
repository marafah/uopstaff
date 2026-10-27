/* مفكرتي: a personal notebook (calls, meetings, memos, reports, follow-ups, events, conferences, seminars,
   reminders, tasks, notes) kept only on this device: the browser's own database (IndexedDB), never sent anywhere.
   Views: today, list, timeline, month calendar, task board. Exports: printed report, meeting minutes, Excel (CSV),
   calendar file (.ics with alarms), full backup (.json) and restore. */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm } = U;

  // ---------------------------------------------------------------- record types and their fields
  const TYPES = {
    // التواصل
    call: { name: 'مكالمة', icon: 'bi-telephone-fill', color: '#1d4ed8', f: ['when', 'people', 'phone', 'direction', 'outcome', 'follow'] },
    meeting: { name: 'اجتماع', icon: 'bi-people-fill', color: '#901d23', f: ['when', 'end', 'place', 'people', 'decisions', 'checklist', 'follow'] },
    email: { name: 'بريد إلكتروني', icon: 'bi-envelope-fill', color: '#0369a1', f: ['when', 'people', 'org', 'ref', 'outcome', 'follow'] },
    message: { name: 'رسالة', icon: 'bi-chat-dots-fill', color: '#16a34a', f: ['when', 'people', 'phone', 'outcome', 'follow'] },
    visit: { name: 'زيارة', icon: 'bi-door-open-fill', color: '#0e7490', f: ['when', 'end', 'place', 'people', 'org', 'outcome', 'follow'] },
    interview: { name: 'مقابلة', icon: 'bi-person-video2', color: '#4338ca', f: ['when', 'end', 'place', 'people', 'outcome', 'decisions', 'follow'] },
    // الأعمال الإدارية
    memo: { name: 'مذكرة', icon: 'bi-file-earmark-text-fill', color: '#475569', f: ['when', 'org', 'ref', 'follow'] },
    letter: { name: 'كتاب رسمي', icon: 'bi-envelope-paper-fill', color: '#334155', f: ['when', 'org', 'ref', 'direction', 'due', 'follow'] },
    request: { name: 'طلب', icon: 'bi-inbox-fill', color: '#0891b2', f: ['when', 'org', 'ref', 'due', 'outcome', 'checklist', 'follow'] },
    decision: { name: 'قرار', icon: 'bi-hammer', color: '#7f1d1d', f: ['when', 'org', 'ref', 'decisions'] },
    circular: { name: 'تعميم', icon: 'bi-broadcast-pin', color: '#a16207', f: ['when', 'org', 'ref', 'link'] },
    report: { name: 'بلاغ', icon: 'bi-megaphone-fill', color: '#c2410c', f: ['when', 'org', 'ref', 'place', 'outcome', 'follow'] },
    complaint: { name: 'شكوى', icon: 'bi-exclamation-diamond-fill', color: '#b91c1c', f: ['when', 'people', 'org', 'ref', 'outcome', 'follow'] },
    approval: { name: 'موافقة / اعتماد', icon: 'bi-patch-check-fill', color: '#15803d', f: ['when', 'org', 'ref', 'due', 'outcome'] },
    // المهام والمتابعة
    task: { name: 'مهمة', icon: 'bi-check2-square', color: '#0f766e', f: ['due', 'people', 'checklist'] },
    follow: { name: 'متابعة', icon: 'bi-arrow-repeat', color: '#7c3aed', f: ['due', 'people', 'related', 'checklist'] },
    reminder: { name: 'تذكير', icon: 'bi-bell-fill', color: '#b45309', f: ['when'] },
    deadline: { name: 'موعد نهائي', icon: 'bi-hourglass-bottom', color: '#dc2626', f: ['due', 'org', 'link', 'checklist'] },
    project: { name: 'مشروع', icon: 'bi-kanban-fill', color: '#1e40af', f: ['when', 'due', 'people', 'org', 'link', 'checklist'] },
    // الأكاديمي
    lecture: { name: 'محاضرة', icon: 'bi-easel-fill', color: '#9a3412', f: ['when', 'end', 'course', 'place', 'checklist'] },
    exam: { name: 'امتحان', icon: 'bi-pencil-square', color: '#be123c', f: ['when', 'end', 'course', 'place', 'checklist'] },
    advising: { name: 'إرشاد طالب', icon: 'bi-mortarboard-fill', color: '#0d9488', f: ['when', 'people', 'course', 'outcome', 'follow'] },
    supervision: { name: 'إشراف', icon: 'bi-journal-check', color: '#6d28d9', f: ['due', 'people', 'checklist', 'link', 'follow'] },
    research: { name: 'بحث / نشر', icon: 'bi-journal-richtext', color: '#5b21b6', f: ['due', 'people', 'org', 'link', 'checklist'] },
    committee: { name: 'لجنة', icon: 'bi-diagram-3-fill', color: '#9f1239', f: ['when', 'place', 'people', 'decisions', 'checklist', 'follow'] },
    // الفعاليات والتطوير
    event: { name: 'حدث', icon: 'bi-calendar-event-fill', color: '#0369a1', f: ['when', 'end', 'place', 'org', 'link'] },
    conference: { name: 'مؤتمر', icon: 'bi-easel2-fill', color: '#9333ea', f: ['when', 'end', 'place', 'org', 'link', 'ref', 'amount'] },
    seminar: { name: 'ندوة', icon: 'bi-mic-fill', color: '#be185d', f: ['when', 'end', 'place', 'org', 'link'] },
    workshop: { name: 'ورشة عمل', icon: 'bi-tools', color: '#c2410c', f: ['when', 'end', 'place', 'org', 'link', 'checklist'] },
    training: { name: 'دورة تدريبية', icon: 'bi-award-fill', color: '#ca8a04', f: ['when', 'end', 'place', 'org', 'link', 'ref', 'amount'] },
    trip: { name: 'سفر / مهمة رسمية', icon: 'bi-airplane-fill', color: '#0284c7', f: ['when', 'end', 'place', 'org', 'ref', 'amount', 'checklist'] },
    // شخصي
    note: { name: 'ملاحظة', icon: 'bi-sticky-fill', color: '#64748b', f: [] },
    idea: { name: 'فكرة', icon: 'bi-lightbulb-fill', color: '#eab308', f: ['link'] },
    leave: { name: 'إجازة', icon: 'bi-umbrella-fill', color: '#0f766e', f: ['when', 'end', 'org', 'ref'] },
    expense: { name: 'مصروف', icon: 'bi-cash-coin', color: '#047857', f: ['when', 'amount', 'org', 'ref'] },
    document: { name: 'وثيقة / رابط', icon: 'bi-paperclip', color: '#475569', f: ['link', 'ref', 'org'] },
  };
  const CATS = [
    ['التواصل', 'bi-chat-left-text-fill', ['call', 'meeting', 'email', 'message', 'visit', 'interview']],
    ['الأعمال الإدارية', 'bi-briefcase-fill', ['memo', 'letter', 'request', 'decision', 'circular', 'report', 'complaint', 'approval']],
    ['المهام والمتابعة', 'bi-list-check', ['task', 'follow', 'reminder', 'deadline', 'project']],
    ['الأكاديمي', 'bi-mortarboard', ['lecture', 'exam', 'advising', 'supervision', 'research', 'committee']],
    ['الفعاليات والتطوير', 'bi-stars', ['event', 'conference', 'seminar', 'workshop', 'training', 'trip']],
    ['شخصي', 'bi-person-heart', ['note', 'idea', 'leave', 'expense', 'document']],
  ];
  const ORDER = CATS.flatMap(c => c[2]);
  const STATUS = { open: ['مفتوح', 'bi-circle'], doing: ['قيد التنفيذ', 'bi-play-circle-fill'], waiting: ['بانتظار رد', 'bi-hourglass-split'], done: ['منجز', 'bi-check-circle-fill'], cancelled: ['ملغى', 'bi-x-circle'] };
  const PRIO = { low: ['منخفضة', '#64748b'], normal: ['عادية', '#0369a1'], high: ['مهمة', '#c2410c'], urgent: ['عاجلة', '#b42318'] };
  const MILESTONE = new Set(['meeting', 'event', 'conference', 'seminar', 'workshop', 'training', 'trip', 'exam', 'committee', 'deadline', 'decision', 'approval']);
  const LABEL = { when: 'التاريخ والوقت', end: 'ينتهي', due: 'موعد الإنجاز', people: 'الأشخاص', phone: 'الهاتف / الفرعي', direction: 'الاتجاه', outcome: 'النتيجة',
    place: 'المكان', decisions: 'القرارات', checklist: 'بنود العمل', org: 'الجهة', ref: 'الرقم المرجعي', link: 'الرابط', related: 'مرتبط بـ', follow: 'متابعة بتاريخ',
    amount: 'المبلغ (دينار)', course: 'المقرر' };
  // the type's own words for some fields
  const DIRECTION = { call: ['صادرة', 'واردة', 'فائتة'], letter: ['صادر', 'وارد'] };
  const QUICK_DEFAULT = ['meeting', 'call', 'task', 'follow', 'reminder', 'email', 'lecture', 'memo', 'event', 'note'];

  // ---------------------------------------------------------------- storage: IndexedDB on this device only
  const DB = {
    db: null,
    open() {
      return new Promise((ok, no) => {
        if (!window.indexedDB) return no(new Error('no indexedDB'));
        const r = indexedDB.open('uop-notebook', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
        r.onsuccess = () => { this.db = r.result; ok(); };
        r.onerror = () => no(r.error);
      });
    },
    tx(mode, fn) { return new Promise((ok, no) => { const t = this.db.transaction('items', mode); const s = t.objectStore('items'); const out = fn(s); t.oncomplete = () => ok(out && out.result); t.onerror = () => no(t.error); }); },
    all() { return this.tx('readonly', s => s.getAll()); },
    put(x) { return this.tx('readwrite', s => s.put(x)); },
    del(id) { return this.tx('readwrite', s => s.delete(id)); },
  };
  // fallback when IndexedDB is unavailable (private windows of some browsers): localStorage
  const LS = {
    all: async () => { try { return JSON.parse(localStorage.getItem('uop-notebook') || '[]'); } catch (e) { return []; } },
    save: () => { try { localStorage.setItem('uop-notebook', JSON.stringify(ITEMS)); } catch (e) { toast('تعذّر الحفظ على هذا الجهاز', true); } },
  };
  let ITEMS = [], useLS = false, PEOPLE = null;
  const pref = { get: (k, d) => { try { const v = localStorage.getItem('uop-nb-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('uop-nb-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
  async function persist(x, keepStamp) {
    if (!keepStamp || !x.updated) x.updated = new Date().toISOString();
    const i = ITEMS.findIndex(y => y.id === x.id);
    if (i >= 0) ITEMS[i] = x; else ITEMS.push(x);
    if (useLS) LS.save(); else await DB.put(x).catch(() => toast('تعذّر الحفظ على هذا الجهاز', true));
  }
  async function remove(id) {
    ITEMS = ITEMS.filter(x => x.id !== id);
    if (useLS) LS.save(); else await DB.del(id);
  }

  // ---------------------------------------------------------------- helpers
  const st = { view: pref.get('view', 'today'), q: '', type: '', status: '', prio: '', tag: '', month: null, day: '' };
  const pad = n => String(n).padStart(2, '0');
  const now = () => new Date();
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = () => isoLocal(now()).slice(0, 10);
  const dateOf = x => x.when || x.due || x.follow || x.created.slice(0, 16);  // the moment a record sits at
  const fmt = v => { if (!v) return ''; const [d, t] = v.split('T'); return `${U.numDate(d)}${t ? ' ' + t.slice(0, 5) : ''}`; };
  // "27/10/2026 · 10:00–11:30" (same day) or "2/11/2026 09:00 ← 3/11/2026 15:00"; times kept left-to-right inside Arabic text
  const range = (a, b) => {
    if (!a) return '';
    const [da, ta] = a.split('T'), [db, tb] = (b || '').split('T');
    if (!b) return `${U.numDate(da)}${ta ? ` · <bdi dir="ltr">${ta.slice(0, 5)}</bdi>` : ''}`;
    if (da === db) return `${U.numDate(da)} · <bdi dir="ltr">${(ta || '').slice(0, 5)}–${(tb || '').slice(0, 5)}</bdi>`;
    return `${U.numDate(da)} <bdi dir="ltr">${(ta || '').slice(0, 5)}</bdi> ← ${U.numDate(db)} <bdi dir="ltr">${(tb || '').slice(0, 5)}</bdi>`;
  };
  const dayName = iso => ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(iso.slice(0, 10) + 'T12:00').getDay()];
  const open = x => x.status !== 'done' && x.status !== 'cancelled';
  const overdue = x => open(x) && ((x.due && x.due.slice(0, 10) < today()) || (x.follow && x.follow.slice(0, 10) < today()) || (x.type === 'reminder' && x.when && x.when < isoLocal(now())));
  const T = x => TYPES[x.type] || TYPES.note;
  function toast(t, bad) { const e = document.createElement('div'); e.className = 'nb-toast' + (bad ? ' bad' : ''); e.innerHTML = t; document.body.appendChild(e); setTimeout(() => e.remove(), 3500); }
  function people() {
    if (PEOPLE) return Promise.resolve(PEOPLE);
    return U.getJSON('data/staff.json').then(d => (PEOPLE = d.members.map(m => ({ name: m.name, ext: m.ext, email: m.email, job: m.job })))).catch(() => (PEOPLE = []));
  }
  let COURSES = [];
  function courses() {
    return U.getJSON('data/timetable.json').then(d => { const m = {}; d.sections.forEach(s => { m[s.code] = `${s.code} ${s.name.replace(/\s*-\s*(نظري|عملي)\s*$/, '')}`; }); COURSES = Object.values(m).sort(); }).catch(() => {});
  }
  // the quick-add bar: the types the person chose (☆ in the gallery), else the ones they use most, then the usual ones
  const favs = () => (pref.get('fav', null) || []).filter(k => TYPES[k]);
  function quickTypes() {
    if (pref.get('fav', null)) return favs();
    const used = {}; ITEMS.forEach(x => { used[x.type] = (used[x.type] || 0) + 1; });
    const top = Object.keys(used).filter(k => TYPES[k]).sort((a, b) => used[b] - used[a]);
    return [...new Set(top.concat(QUICK_DEFAULT))].slice(0, 10);
  }
  // all types, grouped, with a search box; ☆ puts a type on the quick-add bar (custom: opened from «تخصيص»)
  function gallery(custom) {
    let bar = quickTypes(), changed = false;
    const star = k => { const on = bar.includes(k); return `<button type="button" class="nb-star ${on ? 'on' : ''}" data-star="${k}" title="${on ? 'إزالة من' : 'إضافة إلى'} شريط الإضافة السريعة" aria-pressed="${on}"><i class="bi ${on ? 'bi-star-fill' : 'bi-star'}"></i></button>`; };
    U.modal(custom ? '<i class="bi bi-sliders"></i> تخصيص شريط الإضافة السريعة' : '<i class="bi bi-plus-circle-fill"></i> سجل جديد: اختر النوع', `
      <div class="nb-favbar"><i class="bi bi-star-fill"></i> <span>انقر النجمة لإضافة النوع إلى شريط الإضافة السريعة أعلى الصفحة أو إزالته منه — يظهر بالترتيب الذي تختاره.</span>
        <b id="g-n"></b><button type="button" class="btn btn-sm btn-link" id="g-auto" ${pref.get('fav', null) ? '' : 'hidden'}>رجوع إلى التلقائي (الأكثر استخداماً)</button></div>
      <div class="nb-search mb-3"><i class="bi bi-search"></i><input id="g-q" type="search" placeholder="ابحث عن نوع: اجتماع، كتاب، امتحان، سفر…" autocomplete="off"></div>
      <div id="g-list">${CATS.map(([cn, ci, ks]) => `<section class="nb-gcat"><h3><i class="bi ${ci}"></i> ${cn}</h3><div class="nb-gtypes">${ks.map(k => `<div class="nb-gt" data-n="${esc(norm(TYPES[k].name))}"><button type="button" data-g="${k}" style="--c:${TYPES[k].color}">
        <i class="bi ${TYPES[k].icon}"></i><b>${TYPES[k].name}</b><small>${TYPES[k].f.filter(f => ['when', 'due', 'people', 'place', 'decisions', 'checklist', 'amount', 'course', 'ref'].includes(f)).slice(0, 2).map(f => LABEL[f].replace(' (دينار)', '')).join(' · ') || 'نص حر'}</small></button>${star(k)}</div>`).join('')}</div></section>`).join('')}</div>`);
    const m = $('#pgModal'); m.querySelector('.modal-dialog').classList.add('modal-xl');
    const count = () => { $('#g-n').textContent = `في الشريط: ${bar.length}`; };
    count();
    m.addEventListener('hidden.bs.modal', () => { m.querySelector('.modal-dialog').classList.remove('modal-xl'); if (changed) render(); }, { once: true });
    m.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { bootstrap.Modal.getInstance(m).hide(); setTimeout(() => edit(null, b.dataset.g), 320); }));
    bindStars();
    function bindStars() {
      m.querySelectorAll('[data-star]').forEach(b => { if (b.dataset.bound) return; b.dataset.bound = 1; b.addEventListener('click', () => {
        const k = b.dataset.star;
        bar = bar.includes(k) ? bar.filter(x => x !== k) : bar.concat(k);
        pref.set('fav', bar); changed = true; render();  // the bar behind the window updates at once
        const on = bar.includes(k);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.title = `${on ? 'إزالة من' : 'إضافة إلى'} شريط الإضافة السريعة`;
        b.innerHTML = `<i class="bi ${on ? 'bi-star-fill' : 'bi-star'}"></i>`;
        count(); $('#g-auto').hidden = false;
      }); });
    }
    $('#g-auto').addEventListener('click', () => {
      pref.set('fav', null); changed = true; bar = quickTypes(); render();
      m.querySelectorAll('[data-star]').forEach(b => { const on = bar.includes(b.dataset.star); b.classList.toggle('on', on); b.innerHTML = `<i class="bi ${on ? 'bi-star-fill' : 'bi-star'}"></i>`; });
      count(); $('#g-auto').hidden = true;
    });
    const q = $('#g-q');
    q.addEventListener('input', () => { const v = norm(q.value.trim());
      m.querySelectorAll('.nb-gt').forEach(b => { b.hidden = !!v && !b.dataset.n.includes(v); });
      m.querySelectorAll('.nb-gcat').forEach(c => { c.hidden = ![...c.querySelectorAll('.nb-gt')].some(b => !b.hidden); }); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = m.querySelector('.nb-gt:not([hidden]) [data-g]'); if (b) b.click(); } });
    setTimeout(() => q.focus(), 350);
  }
  function filtered() {
    const q = norm(st.q.trim());
    return ITEMS.filter(x => (!st.type || x.type === st.type) && (!st.status || x.status === st.status) && (!st.prio || x.priority === st.prio)
      && (!st.tag || (x.tags || []).includes(st.tag)) && (!st.day || dateOf(x).slice(0, 10) === st.day)
      && (!q || norm([x.title, x.body, x.place, x.org, x.ref, x.outcome, x.decisions, (x.people || []).map(p => p.name).join(' '), (x.tags || []).join(' '), (x.checklist || []).map(c => c.text).join(' ')].join(' ')).includes(q)));
  }

  // ---------------------------------------------------------------- cards
  function chip(x) { const t = T(x); return `<span class="nb-type" style="--c:${t.color}"><i class="bi ${t.icon}"></i> ${t.name}</span>`; }
  function card(x, compact) {
    const t = T(x), cl = x.checklist || [], done = cl.filter(c => c.done).length;
    const when = x.when ? `<span><i class="bi bi-clock"></i> ${range(x.when, x.end)}</span>` : '';
    const due = x.due ? `<span class="${overdue(x) ? 'late' : ''}"><i class="bi bi-flag-fill"></i> ${range(x.due)}</span>` : '';
    const fol = x.follow ? `<span class="${overdue(x) ? 'late' : ''}"><i class="bi bi-arrow-repeat"></i> متابعة ${range(x.follow)}</span>` : '';
    return `<article class="nb-card ${open(x) ? '' : 'closed'} ${overdue(x) ? 'late' : ''}" style="--c:${t.color}" data-id="${x.id}" draggable="true">
      <header>${chip(x)}${x.pinned ? '<i class="bi bi-pin-angle-fill nb-pin" title="مثبّت"></i>' : ''}
        ${x.priority && x.priority !== 'normal' ? `<span class="nb-prio" style="--p:${PRIO[x.priority][1]}">${PRIO[x.priority][0]}</span>` : ''}
        <button type="button" class="nb-st" data-cycle="${x.id}" title="تغيير الحالة"><i class="bi ${STATUS[x.status || 'open'][1]}"></i> ${STATUS[x.status || 'open'][0]}</button></header>
      <h3>${esc(x.title || '(بلا عنوان)')}</h3>
      ${!compact && x.body ? `<p>${esc(x.body).slice(0, 220)}${x.body.length > 220 ? '…' : ''}</p>` : ''}
      <div class="nb-meta">${when}${due}${fol}${x.place ? `<span><i class="bi bi-geo-alt-fill"></i> ${esc(x.place)}</span>` : ''}
        ${(x.people || []).length ? `<span><i class="bi bi-person-fill"></i> ${x.people.map(p => esc(U.shortName(p.name))).slice(0, 3).join('، ')}${x.people.length > 3 ? ` +${x.people.length - 3}` : ''}</span>` : ''}
        ${x.course ? `<span><i class="bi bi-journal-bookmark"></i> ${esc(x.course)}</span>` : ''}${x.amount ? `<span><i class="bi bi-cash-coin"></i> <bdi dir="ltr">${(+x.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}</bdi> د.أ</span>` : ''}
        ${cl.length ? `<span><i class="bi bi-list-check"></i> ${done}/${cl.length}</span>` : ''}</div>
      ${cl.length ? `<i class="nb-prog"><em style="width:${Math.round(100 * done / cl.length)}%"></em></i>` : ''}
      ${(x.tags || []).length ? `<div class="nb-tags">${x.tags.map(g => `<a href="#" data-tag="${esc(g)}">#${esc(g)}</a>`).join('')}</div>` : ''}
    </article>`;
  }

  // ---------------------------------------------------------------- views
  function viewToday(list) {
    const td = today(), in7 = isoLocal(new Date(Date.now() + 7 * 864e5)).slice(0, 10);
    const late = list.filter(overdue).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const tod = list.filter(x => !overdue(x) && dateOf(x).slice(0, 10) === td && (x.when || x.due || x.follow)).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const next = list.filter(x => open(x) && !overdue(x) && dateOf(x).slice(0, 10) > td && dateOf(x).slice(0, 10) <= in7 && (x.when || x.due || x.follow)).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const pins = list.filter(x => x.pinned && open(x));
    const recent = list.slice().sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
    const col = (title, icon, cls, items, empty) => `<section class="nb-col ${cls}"><h2><i class="bi ${icon}"></i> ${title} <span>${items.length}</span></h2>
      ${items.map(x => card(x, true)).join('') || `<p class="nb-empty">${empty}</p>`}</section>`;
    return `<div class="nb-today">
      ${col('متأخر', 'bi-exclamation-octagon-fill', 'late', late, 'لا شيء متأخر 👌')}
      ${col(`اليوم · ${dayName(td)} ${U.numDate(td)}`, 'bi-sun-fill', 'now', tod, 'لا مواعيد اليوم')}
      ${col('خلال 7 أيام', 'bi-calendar-week', 'soon', next, 'لا شيء في الأسبوع القادم')}
      </div>
      ${pins.length ? `<section class="nb-strip"><h2><i class="bi bi-pin-angle-fill"></i> مثبّت</h2><div class="nb-grid">${pins.map(x => card(x)).join('')}</div></section>` : ''}
      <section class="nb-strip"><h2><i class="bi bi-clock-history"></i> آخر ما عدّلته</h2><div class="nb-grid">${recent.map(x => card(x)).join('') || `<div class="nb-start"><p>لا سجلات بعد. ابدأ بزر «سجل جديد»، أو جرّب المفكرة أولاً ببيانات نموذجية تُحذف بضغطة.</p>
        <button type="button" class="btn btn-outline-secondary" data-exp="demo"><i class="bi bi-magic"></i> تجربة ببيانات نموذجية</button></div>`}</div></section>`;
  }
  function viewList(list) {
    const l = list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || dateOf(b).localeCompare(dateOf(a)));
    return `<div class="nb-grid">${l.map(x => card(x)).join('') || '<p class="nb-empty">لا سجلات ضمن التصفية.</p>'}</div>`;
  }
  function viewTimeline(list) {
    const l = list.slice().sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    const tdy = today();
    let lastM = '', html = '', todayMark = false;
    l.forEach(x => {
      const d = dateOf(x), m = d.slice(0, 7);
      if (!todayMark && d.slice(0, 10) < tdy) { html += `<div class="nb-now"><span>اليوم ${U.numDate(tdy)}</span></div>`; todayMark = true; }
      if (m !== lastM) { const [y, mm] = m.split('-'); html += `<h3 class="nb-month">${['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][+mm - 1]} ${y}</h3>`; lastM = m; }
      const t = T(x), ms = MILESTONE.has(x.type);
      html += `<div class="nb-tl ${ms ? 'ms' : ''} ${open(x) ? '' : 'closed'}" style="--c:${t.color}"><span class="nb-dot"><i class="bi ${t.icon}"></i></span>
        <div class="nb-tl-when"><b>${U.numDate(d.slice(0, 10))}</b><small>${dayName(d)}${d.length > 10 ? ' ' + d.slice(11, 16) : ''}</small></div>${card(x, true)}</div>`;
    });
    if (!todayMark && l.length) html += `<div class="nb-now"><span>اليوم ${U.numDate(tdy)}</span></div>`;
    return `<div class="nb-timeline">${html || '<p class="nb-empty">لا سجلات ضمن التصفية.</p>'}</div>`;
  }
  function viewCalendar(list) {
    const base = st.month ? new Date(st.month + '-01T12:00') : now();
    const y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const key = `${y}-${pad(m + 1)}`, td = today();
    const by = {};
    list.forEach(x => { const d = dateOf(x).slice(0, 10); if (d.startsWith(key)) (by[d] ||= []).push(x); });
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="nb-cd out"></div>');
    for (let d = 1; d <= days; d++) {
      const iso = `${key}-${pad(d)}`, its = (by[iso] || []).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
      cells.push(`<div class="nb-cd ${iso === td ? 'today' : ''} ${st.day === iso ? 'sel' : ''}" data-day="${iso}"><b>${d}</b>
        ${its.slice(0, 3).map(x => `<a href="#" class="nb-ce" data-open="${x.id}" style="--c:${T(x).color}"><i class="bi ${T(x).icon}"></i> ${esc(x.title || T(x).name)}</a>`).join('')}
        ${its.length > 3 ? `<small>+${its.length - 3}</small>` : ''}<button type="button" class="nb-add-day" data-addday="${iso}" title="سجل في هذا اليوم"><i class="bi bi-plus"></i></button></div>`);
    }
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `<div class="nb-cal-head"><button type="button" class="btn btn-sm btn-outline-secondary" data-mon="-1"><i class="bi bi-chevron-right"></i></button>
        <b>${months[m]} ${y}</b><button type="button" class="btn btn-sm btn-outline-secondary" data-mon="1"><i class="bi bi-chevron-left"></i></button>
        <button type="button" class="btn btn-sm btn-link" data-mon="0">هذا الشهر</button>${st.day ? `<button type="button" class="btn btn-sm btn-link" id="nb-day-x">إلغاء اختيار اليوم ${U.numDate(st.day)}</button>` : ''}</div>
      <div class="nb-cal">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(d => `<div class="nb-cw">${d}</div>`).join('')}${cells.join('')}</div>
      ${st.day ? `<h3 class="nb-month mt-3">${dayName(st.day)} ${U.numDate(st.day)}</h3><div class="nb-grid">${(by[st.day] || []).map(x => card(x)).join('') || '<p class="nb-empty">لا سجلات في هذا اليوم.</p>'}</div>` : ''}`;
  }
  function viewBoard(list) {
    return `<div class="nb-board">${Object.entries(STATUS).map(([k, [n, i]]) => { const its = list.filter(x => (x.status || 'open') === k).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
      return `<section class="nb-lane" data-lane="${k}"><h2><i class="bi ${i}"></i> ${n} <span>${its.length}</span></h2>${its.map(x => card(x, true)).join('') || '<p class="nb-empty">اسحب سجلاً إلى هنا</p>'}</section>`; }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- page
  function render() {
    const list = filtered();
    const counts = {}; ITEMS.forEach(x => { counts[x.type] = (counts[x.type] || 0) + 1; });
    const tags = [...new Set(ITEMS.flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b, 'ar'));
    const late = ITEMS.filter(overdue).length, openN = ITEMS.filter(open).length;
    const last = pref.get('backup', null), stale = ITEMS.length && (!last || Date.now() - last > 14 * 864e5);
    const views = [['today', 'اليوم', 'bi-sun'], ['list', 'كل السجلات', 'bi-grid-3x2-gap'], ['timeline', 'الشريط الزمني', 'bi-bar-chart-steps'], ['calendar', 'التقويم', 'bi-calendar3'], ['board', 'لوحة المهام', 'bi-kanban']];
    const body = { today: viewToday, list: viewList, timeline: viewTimeline, calendar: viewCalendar, board: viewBoard }[st.view](list);
    $('#nb-app').innerHTML = `
      <div class="nb-private"><i class="bi bi-shield-lock-fill"></i><span><b>خاص بك:</b> سجلاتك محفوظة على هذا الجهاز وهذا المتصفح فقط، ولا تُرسل إلى أي مكان. للنقل إلى جهاز آخر أو للاحتياط: «تصدير ← نسخة احتياطية».</span></div>
      ${ITEMS.some(isDemo) ? `<div class="nb-demo"><i class="bi bi-magic"></i> تعرض المفكرة الآن ${ITEMS.filter(isDemo).length} سجلاً نموذجياً للتجربة (#${DEMO_TAG}). <button type="button" class="btn btn-sm btn-light" data-exp="undemo"><i class="bi bi-trash"></i> حذفها</button></div>` : ''}
      ${stale && !ITEMS.every(isDemo) ? `<div class="nb-backup"><i class="bi bi-cloud-arrow-down-fill"></i> ${last ? `آخر نسخة احتياطية ${U.ago(new Date(last).toISOString())}` : 'لم تحفظ نسخة احتياطية بعد'}. احفظ نسخة الآن حتى لا تفقد سجلاتك إن مُسح المتصفح. <button type="button" class="btn btn-sm btn-light" data-exp="json"><i class="bi bi-download"></i> نسخة احتياطية</button></div>` : ''}
      <div class="nb-kpis">
        <div><b>${ITEMS.length}</b><span>سجل</span></div><div><b>${openN}</b><span>مفتوح</span></div><div class="${late ? 'bad' : ''}"><b>${late}</b><span>متأخر</span></div>
        <div><b>${ITEMS.filter(x => x.status === 'done').length}</b><span>منجز</span></div>
        <button type="button" class="nb-new" id="nb-new"><i class="bi bi-plus-lg"></i> سجل جديد <kbd>N</kbd></button>
      </div>
      <div class="nb-quick">${quickTypes().map(k => `<button type="button" data-quick="${k}" style="--c:${TYPES[k].color}" title="${TYPES[k].name} جديد"><i class="bi ${TYPES[k].icon}"></i><span>${TYPES[k].name}</span></button>`).join('')}
        <button type="button" class="nb-all" id="nb-all" title="كل الأنواع (${ORDER.length})"><i class="bi bi-grid-3x3-gap-fill"></i><span>كل الأنواع</span></button>
        <button type="button" class="nb-custom" id="nb-custom" title="اختر الأنواع التي تظهر في هذا الشريط"><i class="bi bi-sliders"></i><span>تخصيص</span></button></div>
      <div class="nb-bar">
        <div class="nb-views" role="tablist">${views.map(([k, l, i]) => `<button type="button" class="${st.view === k ? 'on' : ''}" data-view="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
        <div class="nb-search"><i class="bi bi-search"></i><input id="nb-q" type="search" placeholder="ابحث في سجلاتك…" value="${esc(st.q)}"></div>
        <div class="dropdown"><button class="btn btn-sm btn-maroon dropdown-toggle" type="button" data-bs-toggle="dropdown"><i class="bi bi-box-arrow-up"></i> تصدير</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" data-exp="print"><i class="bi bi-printer"></i> تقرير PDF منظم (حسب التصفية)</a></li>
            <li><a class="dropdown-item" href="#" data-exp="csv"><i class="bi bi-file-earmark-spreadsheet"></i> Excel</a></li>
            <li><a class="dropdown-item" href="#" data-exp="ics"><i class="bi bi-calendar-plus"></i> المواعيد والتذكيرات إلى تقويم الهاتف (.ics)</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" data-exp="json"><i class="bi bi-download"></i> نسخة احتياطية كاملة (.json)</a></li>
            <li><a class="dropdown-item" href="#" data-exp="import"><i class="bi bi-upload"></i> استعادة من نسخة احتياطية</a></li>
            <li><hr class="dropdown-divider"></li>
            ${ITEMS.some(isDemo) ? '<li><a class="dropdown-item text-danger" href="#" data-exp="undemo"><i class="bi bi-trash"></i> حذف البيانات النموذجية</a></li>'
              : '<li><a class="dropdown-item" href="#" data-exp="demo"><i class="bi bi-magic"></i> تجربة ببيانات نموذجية</a></li>'}</ul></div>
      </div>
      <div class="nb-filters">
        <button type="button" class="${!st.type ? 'on' : ''}" data-ftype="">الكل <span>${ITEMS.length}</span></button>
        ${ORDER.filter(k => counts[k]).map(k => `<button type="button" class="${st.type === k ? 'on' : ''}" data-ftype="${k}" style="--c:${TYPES[k].color}"><i class="bi ${TYPES[k].icon}"></i> ${TYPES[k].name} <span>${counts[k]}</span></button>`).join('')}
        <select id="nb-fs" class="form-select form-select-sm"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, [n]]) => `<option value="${k}" ${st.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select id="nb-fp" class="form-select form-select-sm"><option value="">كل الأولويات</option>${Object.entries(PRIO).map(([k, [n]]) => `<option value="${k}" ${st.prio === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${tags.length ? `<select id="nb-ft" class="form-select form-select-sm"><option value="">كل الوسوم</option>${tags.map(g => `<option ${st.tag === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="nb-view" class="nb-v-${st.view}">${body}</div>`;
    bind();
  }
  function bind() {
    $('#nb-new').addEventListener('click', () => gallery());
    $('#nb-all').addEventListener('click', () => gallery());
    $('#nb-custom').addEventListener('click', () => gallery(true));
    document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => edit(null, b.dataset.quick)));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; pref.set('view', st.view); render(); }));
    document.querySelectorAll('[data-ftype]').forEach(b => b.addEventListener('click', () => { st.type = b.dataset.ftype; render(); }));
    $('#nb-fs').addEventListener('change', e => { st.status = e.target.value; render(); });
    $('#nb-fp').addEventListener('change', e => { st.prio = e.target.value; render(); });
    const ft = $('#nb-ft'); if (ft) ft.addEventListener('change', e => { st.tag = e.target.value; render(); });
    let t; $('#nb-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); const i = $('#nb-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 200); });
    document.querySelectorAll('#nb-view .nb-card').forEach(c => c.addEventListener('click', e => { if (e.target.closest('[data-cycle],[data-tag]')) return; edit(ITEMS.find(x => x.id === c.dataset.id)); }));
    document.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); edit(ITEMS.find(x => x.id === a.dataset.open)); }));
    document.querySelectorAll('[data-cycle]').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const x = ITEMS.find(y => y.id === b.dataset.cycle), ks = ['open', 'doing', 'waiting', 'done'];
      x.status = ks[(ks.indexOf(x.status || 'open') + 1) % ks.length]; await persist(x); render();
    }));
    document.querySelectorAll('[data-tag]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); st.tag = a.dataset.tag; render(); }));
    document.querySelectorAll('[data-exp]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); exportAs(a.dataset.exp); }));
    document.querySelectorAll('[data-mon]').forEach(b => b.addEventListener('click', () => {
      const v = +b.dataset.mon, d = st.month ? new Date(st.month + '-01T12:00') : now();
      if (!v) st.month = null; else { d.setMonth(d.getMonth() + v); st.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
      render();
    }));
    document.querySelectorAll('.nb-cd[data-day]').forEach(c => c.addEventListener('click', e => { if (e.target.closest('a,button')) return; st.day = st.day === c.dataset.day ? '' : c.dataset.day; render(); }));
    document.querySelectorAll('[data-addday]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); edit(null, 'meeting', b.dataset.addday + 'T09:00'); }));
    const dx = $('#nb-day-x'); if (dx) dx.addEventListener('click', () => { st.day = ''; render(); });
    // task board: drag a card to another status
    document.querySelectorAll('.nb-board .nb-card').forEach(c => c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); }));
    document.querySelectorAll('.nb-lane').forEach(l => {
      l.addEventListener('dragover', e => { e.preventDefault(); l.classList.add('over'); });
      l.addEventListener('dragleave', () => l.classList.remove('over'));
      l.addEventListener('drop', async e => { e.preventDefault(); const x = ITEMS.find(y => y.id === e.dataTransfer.getData('text/plain')); if (x) { x.status = l.dataset.lane; await persist(x); render(); } });
    });
  }

  // ---------------------------------------------------------------- editor
  async function edit(x, type, when, fresh) {
    const isNew = !x || !!fresh;
    x = x ? JSON.parse(JSON.stringify(x)) : { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: type || 'note', title: '', body: '', status: 'open', priority: 'normal',
      tags: [], people: [], checklist: [], created: new Date().toISOString(), when: when || (TYPES[type || 'note'].f.includes('when') && type !== 'reminder' ? isoLocal(now()) : '') };
    const ppl = await people();
    if (TYPES[x.type] && TYPES[x.type].f.includes('course') && !COURSES.length) await courses();  // course suggestions only when needed
    const draw = () => {
      const t = T(x), has = f => t.f.includes(f);
      const input = (f, html) => has(f) ? `<div class="col-sm-6"><label class="small fw-bold">${LABEL[f]}</label>${html}</div>` : '';
      U.modal(`<span class="nb-mt" style="--c:${t.color}"><i class="bi ${t.icon}"></i></span> ${isNew ? t.name + ' جديد' : esc(x.title || t.name)}`, `
        <details class="nb-typepick"><summary><span class="nb-type" style="--c:${t.color}"><i class="bi ${t.icon}"></i> ${t.name}</span> <small>تغيير النوع</small></summary>
          ${CATS.map(([cn, ci, ks]) => `<div class="nb-tcat"><b><i class="bi ${ci}"></i> ${cn}</b><div class="nb-typesel">${ks.map(k => `<button type="button" class="${x.type === k ? 'on' : ''}" data-settype="${k}" style="--c:${TYPES[k].color}"><i class="bi ${TYPES[k].icon}"></i>${TYPES[k].name}</button>`).join('')}</div></div>`).join('')}</details>
        <div class="row g-2 mt-1">
          <div class="col-12"><input class="form-control form-control-lg nb-title" id="e-title" placeholder="العنوان" value="${esc(x.title)}"></div>
          ${input('when', `<input type="datetime-local" class="form-control form-control-sm" id="e-when" value="${esc(x.when || '')}">`)}
          ${input('end', `<input type="datetime-local" class="form-control form-control-sm" id="e-end" value="${esc(x.end || '')}">`)}
          ${input('due', `<input type="datetime-local" class="form-control form-control-sm" id="e-due" value="${esc(x.due || '')}">`)}
          ${input('direction', `<select class="form-select form-select-sm" id="e-direction">${(DIRECTION[x.type] || DIRECTION.call).map(v => `<option ${x.direction === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
          ${input('amount', `<input type="number" min="0" step="0.01" class="form-control form-control-sm" id="e-amount" dir="ltr" value="${esc(x.amount || '')}" placeholder="0.00">`)}
          ${input('course', `<input class="form-control form-control-sm" id="e-course" list="e-clist" value="${esc(x.course || '')}" placeholder="رمز المقرر أو اسمه"><datalist id="e-clist">${COURSES.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
          ${input('phone', `<input class="form-control form-control-sm" id="e-phone" dir="ltr" value="${esc(x.phone || '')}" placeholder="فرعي أو رقم">`)}
          ${input('place', `<input class="form-control form-control-sm" id="e-place" value="${esc(x.place || '')}" placeholder="قاعة، مكتب، Teams…">`)}
          ${input('org', `<input class="form-control form-control-sm" id="e-org" value="${esc(x.org || '')}" placeholder="الجهة / المنظِّم / المرسَل إليه">`)}
          ${input('ref', `<input class="form-control form-control-sm" id="e-ref" value="${esc(x.ref || '')}" placeholder="رقم الكتاب أو المرجع">`)}
          ${input('link', `<input class="form-control form-control-sm" id="e-link" dir="ltr" value="${esc(x.link || '')}" placeholder="https://">`)}
          ${input('follow', `<input type="datetime-local" class="form-control form-control-sm" id="e-follow" value="${esc(x.follow || '')}">`)}
          ${input('related', `<select class="form-select form-select-sm" id="e-related"><option value="">—</option>${ITEMS.filter(y => y.id !== x.id).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 80)
            .map(y => `<option value="${y.id}" ${x.related === y.id ? 'selected' : ''}>${esc(T(y).name + ': ' + (y.title || ''))}</option>`).join('')}</select>`)}
          ${has('people') ? `<div class="col-12"><label class="small fw-bold">${x.type === 'meeting' ? 'الحضور' : LABEL.people}</label>
            <div class="nb-people" id="e-people">${(x.people || []).map((p, i) => `<span>${esc(p.name)}${p.ext ? ` · <bdi dir="ltr">${esc(p.ext)}</bdi>` : ''}<button type="button" data-rmp="${i}" aria-label="إزالة">×</button></span>`).join('')}
              <input id="e-person" list="e-plist" placeholder="اكتب اسماً من دليل الموظفين أو أي اسم ثم Enter"><datalist id="e-plist">${ppl.map(p => `<option value="${esc(p.name)}">${esc(p.job || '')}</option>`).join('')}</datalist></div></div>` : ''}
          <div class="col-12"><label class="small fw-bold">${x.type === 'meeting' ? 'جدول الأعمال / المحضر' : x.type === 'call' ? 'ملخص المكالمة' : 'التفاصيل'}</label>
            <textarea class="form-control" id="e-body" rows="${x.type === 'note' ? 7 : 4}" placeholder="اكتب هنا…">${esc(x.body || '')}</textarea></div>
          ${has('outcome') ? `<div class="col-12"><label class="small fw-bold">${LABEL.outcome}</label><input class="form-control form-control-sm" id="e-outcome" value="${esc(x.outcome || '')}" placeholder="ماذا اتُّفق عليه؟"></div>` : ''}
          ${has('decisions') ? `<div class="col-12"><label class="small fw-bold">${LABEL.decisions}</label><textarea class="form-control form-control-sm" id="e-decisions" rows="3" placeholder="قرار في كل سطر">${esc(x.decisions || '')}</textarea></div>` : ''}
          ${has('checklist') ? `<div class="col-12"><label class="small fw-bold">${x.type === 'meeting' ? 'بنود العمل (من؟ ماذا؟ متى؟)' : 'خطوات / بنود'}</label>
            <div class="nb-check" id="e-check">${(x.checklist || []).map((c, i) => `<div><input type="checkbox" data-ci="${i}" ${c.done ? 'checked' : ''}><input class="form-control form-control-sm" data-ct="${i}" value="${esc(c.text)}">
              ${x.type === 'meeting' ? `<input class="form-control form-control-sm" data-cw="${i}" value="${esc(c.who || '')}" placeholder="المسؤول"><input type="date" class="form-control form-control-sm" data-cd="${i}" value="${esc(c.due || '')}">` : ''}
              <button type="button" data-cx="${i}" aria-label="حذف">×</button></div>`).join('')}
              <button type="button" class="btn btn-sm btn-outline-secondary" id="e-addc"><i class="bi bi-plus"></i> بند</button></div></div>` : ''}
          <div class="col-sm-4"><label class="small fw-bold">الحالة</label><select class="form-select form-select-sm" id="e-status">${Object.entries(STATUS).map(([k, [n]]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="small fw-bold">الأولوية</label><select class="form-select form-select-sm" id="e-prio">${Object.entries(PRIO).map(([k, [n]]) => `<option value="${k}" ${x.priority === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="small fw-bold">وسوم</label><input class="form-control form-control-sm" id="e-tags" value="${esc((x.tags || []).join('، '))}" placeholder="مثلاً: القسم، لجنة الجودة"></div>
          <div class="col-12"><label class="form-check-label small"><input type="checkbox" class="form-check-input" id="e-pin" ${x.pinned ? 'checked' : ''}> تثبيت في الأعلى</label></div>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button type="button" class="btn btn-maroon" id="e-save"><i class="bi bi-check2"></i> حفظ <kbd>Ctrl+Enter</kbd></button>
          ${!isNew ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="e-print"><i class="bi bi-printer"></i> ${x.type === 'meeting' ? 'طباعة المحضر' : 'طباعة'}</button>
            ${x.when || x.due || x.follow ? '<button type="button" class="btn btn-outline-secondary btn-sm" id="e-ics"><i class="bi bi-calendar-plus"></i> إلى تقويمي</button>' : ''}
            <button type="button" class="btn btn-outline-secondary btn-sm" id="e-dup"><i class="bi bi-copy"></i> نسخ كسجل جديد</button>
            <button type="button" class="btn btn-outline-danger btn-sm ms-auto" id="e-del"><i class="bi bi-trash"></i> حذف</button>` : ''}
        </div>`);
      const m = $('#pgModal'); m.querySelector('.modal-dialog').classList.add('modal-xl');
      m.addEventListener('hidden.bs.modal', () => m.querySelector('.modal-dialog').classList.remove('modal-xl'), { once: true });
      wire();
    };
    // read the form into x (fields of other types are kept, so switching type loses nothing)
    const read = () => {
      const v = id => { const e = $('#' + id); return e ? e.value.trim() : undefined; };
      ['title', 'body', 'when', 'end', 'due', 'direction', 'phone', 'place', 'org', 'ref', 'link', 'follow', 'related', 'outcome', 'decisions', 'amount', 'course'].forEach(f => { const val = v('e-' + f); if (val !== undefined) x[f] = val; });
      x.status = v('e-status') || x.status; x.priority = v('e-prio') || x.priority;
      const tg = v('e-tags'); if (tg !== undefined) x.tags = tg.split(/[،,]/).map(s => s.trim()).filter(Boolean);
      const pin = $('#e-pin'); if (pin) x.pinned = pin.checked;
      document.querySelectorAll('[data-ct]').forEach(e => { const i = +e.dataset.ct; x.checklist[i].text = e.value; });
      document.querySelectorAll('[data-ci]').forEach(e => { x.checklist[+e.dataset.ci].done = e.checked; });
      document.querySelectorAll('[data-cw]').forEach(e => { x.checklist[+e.dataset.cw].who = e.value; });
      document.querySelectorAll('[data-cd]').forEach(e => { x.checklist[+e.dataset.cd].due = e.value; });
      x.checklist = (x.checklist || []).filter(c => c.text || c.who);
    };
    const addPerson = name => {
      name = name.trim(); if (!name) return;
      read();  // keep what was typed so far, then add the person (and fill the call's extension and title)
      const p = ppl.find(q => q.name === name);
      x.people = (x.people || []).concat([p ? { name: p.name, ext: p.ext || '', email: p.email || '' } : { name }]);
      if (x.type === 'call' && p && p.ext && !x.phone) x.phone = p.ext;
      if (x.type === 'call' && !x.title) x.title = 'مكالمة مع ' + U.shortName(p ? p.name : name);
      draw(); setTimeout(() => { const i = $('#e-person'); if (i) i.focus(); }, 50);
    };
    const wire = () => {
      document.querySelectorAll('[data-settype]').forEach(b => b.addEventListener('click', async () => { read(); x.type = b.dataset.settype; if (TYPES[x.type].f.includes('when') && !x.when) x.when = isoLocal(now());
        if (TYPES[x.type].f.includes('course') && !COURSES.length) await courses(); draw(); }));
      const pi = $('#e-person');
      if (pi) {
        pi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(pi.value); } });
        pi.addEventListener('change', () => { if (ppl.some(p => p.name === pi.value)) addPerson(pi.value); });
      }
      document.querySelectorAll('[data-rmp]').forEach(b => b.addEventListener('click', () => { read(); x.people.splice(+b.dataset.rmp, 1); draw(); }));
      const ac = $('#e-addc'); if (ac) ac.addEventListener('click', () => { read(); x.checklist.push({ text: '', done: false }); draw(); const l = [...document.querySelectorAll('[data-ct]')].pop(); if (l) l.focus(); });
      document.querySelectorAll('[data-cx]').forEach(b => b.addEventListener('click', () => { read(); x.checklist.splice(+b.dataset.cx, 1); draw(); }));
      const save = async () => {
        read();
        if (!x.title && !x.body) { $('#e-title').focus(); return toast('اكتب عنواناً أو تفاصيل', true); }
        if (!x.title) x.title = x.body.split('\n')[0].slice(0, 60);
        await persist(x); bootstrap.Modal.getInstance($('#pgModal')).hide(); render(); toast('<i class="bi bi-check-circle-fill"></i> حُفظ على جهازك');
      };
      $('#e-save').addEventListener('click', save);
      $('#pgModal').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } };
      const del = $('#e-del'); if (del) del.addEventListener('click', async () => { if (!confirm('حذف هذا السجل نهائياً من جهازك؟')) return; await remove(x.id); bootstrap.Modal.getInstance($('#pgModal')).hide(); render(); toast('حُذف السجل'); });
      const pr = $('#e-print'); if (pr) pr.addEventListener('click', () => { read(); printOne(x); });
      const ic = $('#e-ics'); if (ic) ic.addEventListener('click', () => { read(); U.download(`${(x.title || 'سجل').slice(0, 40)}.ics`, ics([x]), 'text/calendar;charset=utf-8'); });
      const dup = $('#e-dup'); if (dup) dup.addEventListener('click', () => {
        read();
        const c = { ...JSON.parse(JSON.stringify(x)), id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: x.title + ' (نسخة)', status: 'open',
          created: new Date().toISOString(), updated: '' };
        (c.checklist || []).forEach(i => { i.done = false; });
        bootstrap.Modal.getInstance($('#pgModal')).hide(); setTimeout(() => edit(c, null, null, true), 350);
      });
      setTimeout(() => { const t = $('#e-title'); if (t && !t.value) t.focus(); }, 300);
    };
    draw();
  }

  // ---------------------------------------------------------------- sample data (to try every type, view and export)
  // sample records carry the id prefix "demo-" and the tag «تجريبي»: removing them never touches the person's own records
  const DEMO_TAG = 'تجريبي';
  const isDemo = x => String(x.id).startsWith('demo-');
  function demoItems() {
    const at = (d, h, m) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h || 9, m || 0, 0, 0); return isoLocal(x); };
    const day = d => at(d).slice(0, 10);
    const P = (name, ext) => ({ name, ext: ext || '' });
    const L = (text, done, who, due) => ({ text, done: !!done, who: who || '', due: due || '' });
    const r = [
      // التواصل
      { type: 'call', title: 'مكالمة مع القبول والتسجيل بخصوص مقعد إضافي', when: at(-1, 11, 15), direction: 'صادرة', phone: '1300', people: [P('أ. سارة خالد', '1300')], outcome: 'سيُفتح مقعد إضافي في الشعبة 5', follow: at(1, 10), status: 'waiting', tags: ['التسجيل'] },
      { type: 'call', title: 'مكالمة واردة من وليّ أمر طالب', when: at(0, 9, 30), direction: 'واردة', phone: '0790000000', outcome: 'شرح آلية الانسحاب، وسيراجع الطالب المرشد', status: 'done' },
      { type: 'call', title: 'مكالمة فائتة من مركز الحاسوب', when: at(0, 8, 50), direction: 'فائتة', phone: '1500', follow: at(0, 13), status: 'open', priority: 'high' },
      { type: 'meeting', title: 'اجتماع مجلس القسم', when: at(0, 10), end: at(0, 11, 30), place: 'قاعة الاجتماعات', people: [P('د. أحمد سالم', '7301'), P('د. ليلى حسن', '7302'), P('د. عمر يوسف', '7305')],
        body: '1. مراجعة الخطط الدراسية\n2. توزيع مشاريع التخرج\n3. ما يستجد من أعمال', decisions: 'اعتماد توزيع مشاريع التخرج\nتشكيل لجنة لمراجعة الخطة الدراسية\nعقد ورشة للطلبة الجدد',
        checklist: [L('إرسال المحضر للأعضاء', 1, 'مقرر القسم', day(1)), L('رفع التوزيع إلى العمادة', 0, 'رئيس القسم', day(3)), L('تحديد موعد الورشة', 0, 'د. ليلى حسن', day(7))], status: 'doing', priority: 'high', pinned: true, tags: ['القسم'] },
      { type: 'meeting', title: 'اجتماع لجنة الجودة', when: at(4, 12), end: at(4, 13), place: 'مكتب العميد', people: [P('د. ليلى حسن', '7302')], checklist: [L('تجهيز تقرير المؤشرات'), L('تحديث ملف المقرر')], status: 'open', tags: ['الجودة'] },
      { type: 'email', title: 'بريد إلى عمادة الكلية بطلب مختبر', when: at(-4, 14), people: [P('مكتب العميد')], org: 'عمادة الكلية', ref: 'BR-112', outcome: 'بانتظار الرد', follow: at(2, 9), status: 'waiting' },
      { type: 'message', title: 'رسالة لمجموعة طلبة الشعبة 1', when: at(-2, 18), outcome: 'إعلان تأجيل الاختبار القصير', status: 'done', tags: ['طلبة'] },
      { type: 'visit', title: 'زيارة ميدانية لشركة برمجيات', when: at(9, 9), end: at(9, 13), place: 'شارع المدينة المنورة', org: 'شركة تقنية', people: [P('م. رامي ناصر')], status: 'open', priority: 'normal' },
      { type: 'interview', title: 'مقابلة متقدم لوظيفة مشرف مختبر', when: at(2, 11), end: at(2, 11, 45), place: 'مكتب رئيس القسم', people: [P('م. هيثم علي')], decisions: 'التوصية بالتعيين', status: 'open' },
      // الأعمال الإدارية
      { type: 'memo', title: 'مذكرة طلب تجهيز مختبر إضافي', when: at(-6, 9), org: 'عمادة الكلية', ref: 'ت م/45/2026', body: 'طلب تخصيص مختبر للشعب العملية بسبب زيادة الأعداد', status: 'done' },
      { type: 'letter', title: 'كتاب وارد: تعديل مواعيد الامتحانات', when: at(-3, 10), direction: 'وارد', org: 'عمادة القبول والتسجيل', ref: 'ق ت/221', due: at(2, 14), follow: at(1, 9), status: 'open', priority: 'high' },
      { type: 'letter', title: 'كتاب صادر: ترشيح ممثل القسم', when: at(-8, 12), direction: 'صادر', org: 'عمادة الكلية', ref: 'ع ح/77', status: 'done' },
      { type: 'request', title: 'طلب تمديد موعد تسليم العلامات', when: at(-2, 10), org: 'عمادة القبول والتسجيل', ref: 'ط/09', due: at(1, 12), checklist: [L('تعبئة النموذج', 1), L('توقيع رئيس القسم', 0)], status: 'waiting' },
      { type: 'decision', title: 'قرار اعتماد الخطة الدراسية المعدّلة', when: at(-10, 13), org: 'مجلس الكلية', ref: 'ق/14/2026', decisions: 'اعتماد الخطة اعتباراً من الفصل القادم', status: 'done' },
      { type: 'circular', title: 'تعميم: إجراءات السلامة في المختبرات', when: at(-5, 8), org: 'مكتب السلامة العامة', ref: 'تع/3', link: 'https://example.org/safety', status: 'done' },
      { type: 'report', title: 'بلاغ عطل جهاز العرض في القاعة', when: at(-3, 8, 40), place: 'القاعة 7419', org: 'مركز الحاسوب', ref: 'HD-2291', follow: at(-1, 10), status: 'open', priority: 'high' },
      { type: 'complaint', title: 'شكوى طالب على علامة الاختبار الأول', when: at(-1, 13), people: [P('الطالب: محمد علي')], org: 'القسم', ref: 'ش/5', outcome: 'مراجعة الورقة مع الطالب', follow: at(3, 11), status: 'doing' },
      { type: 'approval', title: 'اعتماد جدول المحاضرات الإضافية', when: at(-2, 9), org: 'عمادة الكلية', ref: 'م/31', due: at(5, 12), status: 'waiting' },
      // المهام والمتابعة
      { type: 'task', title: 'تسليم علامات الامتحان الأول', due: at(-2, 14), checklist: [L('الشعبة 1', 1), L('الشعبة 5', 0), L('إدخالها في البوابة', 0)], status: 'open', priority: 'urgent' },
      { type: 'task', title: 'تحديث ملف المقرر على المنصة', due: at(5, 16), checklist: [L('الخطة الأسبوعية', 1), L('المراجع', 0)], status: 'doing' },
      { type: 'task', title: 'تصحيح الواجب الثاني', due: at(-6, 12), status: 'done' },
      { type: 'follow', title: 'متابعة اعتماد الخطة الدراسية', due: at(1, 12), people: [P('د. أحمد سالم', '7301')], checklist: [L('التأكد من وصول الكتاب', 1), L('الاستفسار من العمادة', 0)], status: 'open' },
      { type: 'reminder', title: 'تجديد اشتراك قاعدة البيانات العلمية', when: at(0, 15), status: 'open' },
      { type: 'reminder', title: 'إرسال الحضور الأسبوعي', when: at(2, 8, 30), status: 'open' },
      { type: 'deadline', title: 'آخر موعد لتقديم ملخصات المؤتمر', due: at(6, 23, 59), org: 'لجنة المؤتمر', link: 'https://example.org/cfp', checklist: [L('كتابة الملخص', 1), L('مراجعة اللغة', 0)], status: 'doing', priority: 'high' },
      { type: 'project', title: 'تطوير مختبر الذكاء الاصطناعي', when: at(-20, 9), due: at(25, 16), people: [P('د. عمر يوسف', '7305'), P('م. رامي ناصر')], org: 'القسم',
        checklist: [L('دراسة الاحتياجات', 1), L('عروض الأسعار', 1), L('موافقة العمادة', 0), L('التركيب والتشغيل', 0)], status: 'doing', priority: 'high', tags: ['مشاريع'] },
      // الأكاديمي
      { type: 'lecture', title: 'محاضرة: هياكل البيانات (الأشجار)', when: at(1, 10), end: at(1, 11), course: '601214 لغة برمجة (2)', place: '2105', checklist: [L('تجهيز الأمثلة', 1), L('رفع الشرائح', 0)], status: 'open' },
      { type: 'lecture', title: 'محاضرة تعويضية', when: at(3, 14), end: at(3, 15, 30), course: '606315 البرمجة لعلم البيانات', place: '7419', status: 'open' },
      { type: 'exam', title: 'الامتحان الثاني', when: at(12, 12), end: at(12, 13, 30), course: '601214 لغة برمجة (2)', place: 'المسرح', checklist: [L('إعداد الأسئلة', 0), L('نموذج الإجابة', 0), L('طباعة النسخ', 0)], status: 'open', priority: 'high' },
      { type: 'advising', title: 'إرشاد طالب: خطة التخرج', when: at(-1, 12), people: [P('الطالبة: رنا محمود')], course: '603480 مشروع تخرج (1)', outcome: 'تسجيل 18 ساعة الفصل القادم', follow: at(14, 12), status: 'done' },
      { type: 'supervision', title: 'إشراف: مشروع نظام الحضور بالوجه', due: at(20, 12), people: [P('الطالب: يزن خليل'), P('الطالب: سامر عادل')], checklist: [L('الفصل الأول', 1), L('النموذج الأولي', 0), L('التقرير النهائي', 0)], follow: at(7, 11), status: 'doing', tags: ['مشاريع'] },
      { type: 'research', title: 'بحث: التنبؤ بالانسحاب من المقررات', due: at(40, 12), people: [P('د. ليلى حسن', '7302')], org: 'مجلة علمية محكّمة', link: 'https://example.org/journal', checklist: [L('جمع البيانات', 1), L('التحليل', 0), L('الكتابة', 0)], status: 'doing', tags: ['بحث'] },
      { type: 'committee', title: 'لجنة المعادلات', when: at(-7, 11), place: 'مكتب رئيس القسم', people: [P('د. أحمد سالم', '7301'), P('د. عمر يوسف', '7305')], decisions: 'معادلة 3 مقررات لطالب منتقل', checklist: [L('إرسال القرار للقبول', 1)], status: 'done' },
      // الفعاليات والتطوير
      { type: 'event', title: 'يوم الإرشاد الوظيفي', when: at(10, 10), end: at(10, 14), place: 'ساحة الجامعة', org: 'عمادة شؤون الطلبة', status: 'open' },
      { type: 'conference', title: 'مؤتمر الذكاء الاصطناعي في التعليم', when: at(15, 9), end: at(16, 15), place: 'عمّان', org: 'جامعة البترا', link: 'https://example.org/conf', ref: 'ورقة رقم 42', amount: '150', status: 'open', priority: 'high', tags: ['بحث'] },
      { type: 'seminar', title: 'ندوة النزاهة الأكاديمية', when: at(3, 11), end: at(3, 12, 30), place: 'المسرح', org: 'عمادة البحث العلمي', status: 'open' },
      { type: 'workshop', title: 'ورشة: التعليم المدمج', when: at(-12, 10), end: at(-12, 13), place: 'مركز التطوير الأكاديمي', org: 'مركز التطوير الأكاديمي', checklist: [L('الحضور', 1), L('تطبيق نشاط في المقرر', 0)], status: 'done' },
      { type: 'training', title: 'دورة: أساسيات الحوسبة السحابية', when: at(20, 9), end: at(22, 14), place: 'عن بعد', org: 'جهة تدريب', ref: 'شهادة حضور', amount: '200', status: 'open' },
      { type: 'trip', title: 'مهمة رسمية: زيارة جامعة شريكة', when: at(30, 7), end: at(32, 20), place: 'العقبة', org: 'مكتب التعليم الدولي', ref: 'م ر/12', amount: '320', checklist: [L('الموافقة على المهمة', 1), L('حجز الفندق', 0), L('تقرير الزيارة', 0)], status: 'open' },
      // شخصي
      { type: 'note', title: 'أفكار لمشاريع التخرج', body: 'نظام حضور بالوجه\nتحليل بيانات التسجيل\nمساعد ذكي للطلبة', status: 'open', pinned: true, tags: ['مشاريع'] },
      { type: 'idea', title: 'فكرة: نادٍ للبرمجة التنافسية', body: 'لقاء أسبوعي ومسابقات شهرية', link: 'https://example.org/club', status: 'open' },
      { type: 'leave', title: 'إجازة سنوية', when: at(45, 8), end: at(49, 16), org: 'دائرة الموارد البشرية', ref: 'إج/88', status: 'waiting' },
      { type: 'expense', title: 'رسوم اشتراك مجلة', when: at(-9, 10), amount: '60', org: 'ناشر علمي', ref: 'فاتورة 551', status: 'done' },
      { type: 'expense', title: 'كتب مراجع للمقرر', when: at(-15, 10), amount: '45.5', status: 'done' },
      { type: 'document', title: 'دليل الطالب للخطة الدراسية', link: 'https://example.org/guide.pdf', ref: 'إصدار 2026', org: 'القسم', status: 'open' },
      { type: 'note', title: 'سجل قديم ملغى', body: 'مثال على سجل ملغى', status: 'cancelled' },
    ];
    const c = new Date();
    return r.map((x, i) => {
      const made = new Date(c.getTime() - (r.length - i) * 3600e3).toISOString();
      return { priority: 'normal', people: [], checklist: [], status: 'open', ...x, id: 'demo-' + String(i + 1).padStart(2, '0'), tags: [DEMO_TAG].concat(x.tags || []), created: made, updated: made };
    });
  }
  async function loadDemo() {
    const items = demoItems();
    await Promise.all(items.map(x => persist(x, true)));
    render(); toast(`<i class="bi bi-magic"></i> أُضيف ${items.length} سجلاً نموذجياً (موسومة #${DEMO_TAG}) — جرّب كل العروض والتصدير`);
  }
  async function clearDemo() {
    const ids = ITEMS.filter(isDemo).map(x => x.id);
    if (!ids.length) return;
    if (!confirm(`حذف ${ids.length} سجلاً نموذجياً؟ سجلاتك الخاصة لن تُمسّ.`)) return;
    await Promise.all(ids.map(remove));
    render(); toast('حُذفت البيانات النموذجية');
  }

  // ---------------------------------------------------------------- exports
  const rowsFor = l => l.slice().sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  function details(x) {
    return [x.course && 'المقرر: ' + x.course, x.amount && `المبلغ: ${x.amount} د.أ`, x.body, x.outcome && 'النتيجة: ' + x.outcome, x.decisions && 'القرارات: ' + x.decisions.split('\n').join(' · '),
      (x.checklist || []).length && 'البنود: ' + x.checklist.map(c => `${c.done ? '☑' : '☐'} ${c.text}${c.who ? ' (' + c.who + ')' : ''}${c.due ? ' ' + U.numDate(c.due) : ''}`).join(' · ')].filter(Boolean).join('\n');
  }
  function exportAs(kind) {
    const list = filtered();
    if (kind === 'print') {
      if (!list.length) return toast('لا سجلات ضمن التصفية', true);
      const groups = ORDER.filter(k => list.some(x => x.type === k));
      return printReport({
        title: 'مفكرتي', subtitle: `${list.length} سجل${st.type ? ' · ' + TYPES[st.type].name : ''}${st.status ? ' · ' + STATUS[st.status][0] : ''}${st.q ? ' · بحث: ' + st.q : ''}`, orientation: 'landscape',
        source: 'سجلات شخصية محفوظة على جهاز المستخدم',
        stats: [['سجل', list.length], ['مفتوح', list.filter(open).length], ['متأخر', list.filter(overdue).length], ['منجز', list.filter(x => x.status === 'done').length]]
          .concat(list.some(x => +x.amount) ? [['مجموع المبالغ (د.أ)', list.reduce((a, x) => a + (+x.amount || 0), 0).toLocaleString('en-US', { maximumFractionDigits: 2 })]] : []),
        sections: groups.map(k => ({ title: `${TYPES[k].name} (${list.filter(x => x.type === k).length})`, columns: ['التاريخ', 'العنوان', 'التفاصيل', 'الأشخاص / الجهة', 'الحالة'],
          widths: ['12%', '20%', '43%', '15%', '10%'],
          rows: rowsFor(list.filter(x => x.type === k)).map(x => [{ text: fmt(dateOf(x)), sub: x.due ? 'إنجاز ' + fmt(x.due) : '' }, { html: `<b>${esc(x.title)}</b>${x.place ? `<small>${esc(x.place)}</small>` : ''}` },
            { html: esc(details(x)).replace(/\n/g, '<br>') }, [(x.people || []).map(p => p.name).join('، '), x.org].filter(Boolean).join(' · '),
            { html: `<span class="pill ${x.status === 'done' ? 'ok' : overdue(x) ? 'no' : 'mut'}">${STATUS[x.status || 'open'][0]}${overdue(x) ? ' · متأخر' : ''}</span>` }]) })),
      });
    }
    if (kind === 'csv') {
      const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const head = ['النوع', 'العنوان', 'التاريخ', 'ينتهي', 'موعد الإنجاز', 'متابعة', 'الحالة', 'الأولوية', 'الأشخاص', 'الجهة', 'المكان', 'المرجع', 'المقرر', 'المبلغ', 'التفاصيل', 'الوسوم', 'أُنشئ', 'عُدّل'];
      const lines = [head.map(q).join(',')].concat(rowsFor(list).map(x => [T(x).name, x.title, fmt(x.when), fmt(x.end), fmt(x.due), fmt(x.follow), STATUS[x.status || 'open'][0], PRIO[x.priority || 'normal'][0],
        (x.people || []).map(p => p.name + (p.ext ? ` (${p.ext})` : '')).join('، '), x.org, x.place, x.ref, x.course, x.amount, details(x), (x.tags || []).join('، '), fmt(isoLocal(new Date(x.created))), fmt(isoLocal(new Date(x.updated)))].map(q).join(',')));
      return U.download(`مفكرتي_${today()}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    }
    if (kind === 'ics') {
      const dated = list.filter(x => (x.when || x.due || x.follow) && open(x));
      if (!dated.length) return toast('لا مواعيد مفتوحة ضمن التصفية', true);
      return U.download(`مفكرتي_${today()}.ics`, ics(dated), 'text/calendar;charset=utf-8');
    }
    if (kind === 'json') {
      U.download(`مفكرتي_نسخة_احتياطية_${today()}.json`, JSON.stringify({ app: 'uop-notebook', version: 1, exported: new Date().toISOString(), count: ITEMS.length, settings: { quickTypes: pref.get('fav', null) }, items: ITEMS }, null, 1), 'application/json');
      pref.set('backup', Date.now()); render(); return toast('<i class="bi bi-check-circle-fill"></i> حُفظت النسخة الاحتياطية في مجلد التنزيلات');
    }
    if (kind === 'demo') return loadDemo();
    if (kind === 'undemo') return clearDemo();
    if (kind === 'import') {
      const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
      f.onchange = () => { const r = new FileReader(); r.onload = async () => {
        try {
          const d = JSON.parse(r.result), its = Array.isArray(d) ? d : d.items;
          if (!Array.isArray(its) || its.some(x => !x.id || !x.type)) throw new Error('bad');
          if (d.settings && Array.isArray(d.settings.quickTypes) && !pref.get('fav', null)) pref.set('fav', d.settings.quickTypes.filter(k => TYPES[k]));  // the chosen quick-add bar comes along
          const have = new Map(ITEMS.map(x => [x.id, x]));
          let added = 0, newer = 0;
          for (const x of its) { const o = have.get(x.id); if (!o) { added++; } else if ((x.updated || '') > (o.updated || '')) { newer++; } else continue;
            await persist(x, true); }  // the backup's own modification time is kept
          render(); toast(`استُعيد: ${added} سجل جديد، ${newer} محدَّث. السجلات الموجودة الأحدث بقيت كما هي.`);
        } catch (e) { toast('الملف ليس نسخة احتياطية صالحة من مفكرتي', true); }
      }; r.readAsText(f.files[0]); };
      f.click();
    }
  }
  // calendar file with alarms (RFC 5545): appointments at their time, tasks and follow-ups as all-day items
  function ics(list) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const tx = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const dt = v => v.replace(/[-:]/g, '').slice(0, 13) + '00';
    const fold = line => { const enc = new TextEncoder(), out = []; let cur = '', size = 0;
      for (const ch of line) { const n = enc.encode(ch).length; if (size + n > 75) { out.push(cur); cur = ' '; size = 1; } cur += ch; size += n; } out.push(cur); return out.join('\r\n'); };
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UoP unofficial//notebook//AR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:مفكرتي',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Amman', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'END:STANDARD', 'END:VTIMEZONE'];
    list.forEach(x => {
      const at = x.when || x.due || x.follow, start = dt(at);
      const end = x.end && x.end > at ? dt(x.end) : dt(isoLocal(new Date(new Date(at).getTime() + (x.type === 'reminder' ? 15 : 60) * 60000)));
      L.push('BEGIN:VEVENT', `UID:${x.id}@uop-notebook`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Amman:${start}`, `DTEND;TZID=Asia/Amman:${end}`,
        `SUMMARY:${tx(`${T(x).name}: ${x.title}`)}`, x.place ? `LOCATION:${tx(x.place)}` : '', `DESCRIPTION:${tx(details(x))}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${tx(x.title)}`, `TRIGGER:-PT${x.type === 'reminder' ? 0 : 15}M`, 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.filter(Boolean).map(fold).join('\r\n') + '\r\n';
  }
  // one record: a meeting prints as minutes (attendees, agenda, decisions, action items); others as a clear sheet
  function printOne(x) {
    const t = T(x), cl = x.checklist || [];
    const facts = [['النوع', t.name], ['التاريخ', range(x.when, x.end), true], ['موعد الإنجاز', fmt(x.due)], ['المكان', x.place], ['الجهة', x.org], ['المرجع', x.ref],
      ['المكالمة', x.direction ? x.direction + (x.phone ? ' · ' + x.phone : '') : ''], ['متابعة', fmt(x.follow)], ['الحالة', STATUS[x.status || 'open'][0]], ['الأولوية', PRIO[x.priority || 'normal'][0]]].filter(f => f[1]);
    printReport({
      title: x.type === 'meeting' ? 'محضر اجتماع' : t.name, subtitle: x.title, orientation: 'portrait', source: 'مفكرتي',
      raw: `<style>.f{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 18px;margin:8px 0}.f div{border-bottom:1px solid #e6e0d2;padding:3px 0;font-size:10pt}.f b{color:#555;font-weight:400;margin-inline-end:6px}
        .bx{border:1px solid #e3dccb;border-radius:8px;padding:8px 12px;font-size:10.5pt;line-height:1.7;white-space:pre-wrap}.ppl span{display:inline-block;border:1px solid #e3dccb;border-radius:999px;padding:1px 10px;margin:2px;font-size:9.5pt}
        .sig{display:grid;grid-template-columns:repeat(2,1fr);gap:40px;margin-top:36px}.sig div{border-top:1px solid #333;padding-top:4px;font-size:9.5pt;text-align:center}</style>
        <div class="f">${facts.map(([k, v, html]) => `<div><b>${k}:</b>${html ? v : esc(v)}</div>`).join('')}</div>
        ${(x.people || []).length ? `<h3 class="sec">${x.type === 'meeting' ? 'الحضور' : 'الأشخاص'}</h3><div class="ppl">${x.people.map(p => `<span>${esc(p.name)}${p.ext ? ' · ' + esc(p.ext) : ''}</span>`).join('')}</div>` : ''}
        ${x.body ? `<h3 class="sec">${x.type === 'meeting' ? 'جدول الأعمال والمناقشة' : x.type === 'call' ? 'ملخص المكالمة' : 'التفاصيل'}</h3><div class="bx">${esc(x.body)}</div>` : ''}
        ${x.outcome ? `<h3 class="sec">النتيجة</h3><div class="bx">${esc(x.outcome)}</div>` : ''}
        ${x.decisions ? `<h3 class="sec">القرارات</h3><ol class="bx" style="padding-inline-start:28px">${x.decisions.split('\n').filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('')}</ol>` : ''}
        ${cl.length ? `<h3 class="sec">${x.type === 'meeting' ? 'بنود العمل' : 'البنود'}</h3><table><thead><tr><th>#</th><th>البند</th><th>المسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead><tbody>
          ${cl.map((c, i) => `<tr><td class="num">${i + 1}</td><td>${esc(c.text)}</td><td>${esc(c.who || '')}</td><td class="num">${c.due ? U.numDate(c.due) : ''}</td><td>${c.done ? '<span class="pill ok">منجز</span>' : '<span class="pill mut">مفتوح</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
        ${x.type === 'meeting' ? '<div class="sig"><div>مقرر الاجتماع</div><div>رئيس الاجتماع</div></div>' : ''}`,
    });
  }

  // ---------------------------------------------------------------- reminders while the page is open
  function remind() {
    const nowS = isoLocal(now()), soon = isoLocal(new Date(Date.now() + 15 * 60000)), seen = pref.get('alerted', {});
    ITEMS.filter(x => open(x) && x.when && x.when >= isoLocal(new Date(Date.now() - 60000)) && x.when <= (x.type === 'reminder' ? nowS : soon) && !seen[x.id + x.when]).forEach(x => {
      seen[x.id + x.when] = 1;
      const text = `${T(x).name}: ${x.title}${x.type === 'reminder' ? '' : ' · ' + x.when.slice(11, 16)}`;
      toast(`<i class="bi bi-bell-fill"></i> ${esc(text)}`);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('مفكرتي', { body: text }); } catch (e) { /* notifications unavailable */ }
    });
    pref.set('alerted', seen);
  }

  // ---------------------------------------------------------------- start
  (async () => {
    try { await DB.open(); ITEMS = await DB.all(); } catch (e) { useLS = true; ITEMS = await LS.all(); }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not supported */ }
    $('#foot-count').textContent = 'محفوظة على هذا الجهاز فقط';
    U.updatedLine(new Date().toISOString(), 'لا تُرسل سجلاتك إلى أي مكان');
    $('#pg-updated').textContent = `${ITEMS.length} سجل على هذا الجهاز`;
    $('#pg-actions').insertAdjacentHTML('afterbegin', `<button type="button" class="btn btn-update" id="nb-hero-new"><i class="bi bi-plus-lg"></i> سجل جديد</button>`);
    $('#nb-hero-new').addEventListener('click', () => gallery());
    render();
    document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !/input|textarea|select/i.test(e.target.tagName) && !document.querySelector('.modal.show')) { e.preventDefault(); gallery(); } });
    $('#pg-q').addEventListener('input', e => { st.q = e.target.value; render(); });
    remind(); setInterval(remind, 60000);
    if (window.Notification && Notification.permission === 'default' && ITEMS.some(x => x.type === 'reminder')) Notification.requestPermission().catch(() => {});
  })();
})();
