/* Service screens for the Finance Department (screen.html?b=finance) and the Petra Library (screen.html?b=library),
   in the look of the Admissions and Registration screen (screen-reg.js). All content comes from the site's own data:
   the staff directory (who to go to, by the job titles on the university site), the university calendar, the
   timetable (the library building's rooms) and the research data (new and most cited papers by the university's
   researchers). Optional notices per screen (opening hours, payment channels, announcements) are read from
   data/screens.json, which the department can edit on GitHub; a panel shows only when it has content.
   The clock updates every minute, the data every 15 minutes, the rotating panel every 15 seconds. ?at= shows another moment. */
(function () {
  'use strict';
  const UNITS = {
    finance: { unit: 'financedepartment', title: 'دائرة الشؤون المالية', icon: 'bi-cash-coin' },
    library: { unit: 'uoplibrary', title: 'مكتبة جامعة البترا', icon: 'bi-book' },
    research: { unit: '', title: 'عمادة البحث العلمي والدراسات العليا', icon: 'bi-mortarboard' },
  };
  window.UOP_UNITS = UNITS;
  window.UOP_UNIT = function (kind, ctx) {
    const U = window.UOP, { $, esc } = U, K = UNITS[kind];
    const P = new URLSearchParams(location.search);
    const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
    let TT = ctx.tt, CAL = ctx.cal, STAFF = null, NOTES = {}, WORKS = null, RS = null, UNIS = null, PROJ = null, slide = 0;
    const DAY = 864e5;
    const MONTH = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
    const longDate = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTH[+m - 1]} ${y}`; };
    const dm = iso => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
    const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
    const days = n => U.count(n, 'يوم', 'يومين', 'أيام', 'يوماً');
    const tidy = t => String(t || '').replace(/\s*(للفصل الدراسي|للعام الجامعي)?\s*\d{4}\/\d{4}\s*$/, '').replace(/لطلبة البكالوريوس والماجستير/, '').trim();
    const N = n => Number(n || 0).toLocaleString('en-US');
    window.UOP_RG_STYLE();
    document.head.insertAdjacentHTML('beforeend', `<style>
      .un .scr-main { grid-template-columns: 1.15fr 1.4fr .85fr; }
      .un-svc { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55em; }
      .un-s { min-width: 0; }
      .un-line { display: grid; grid-template-columns: 1.6em 1fr auto; gap: .5em; align-items: center; background: rgba(255,255,255,.06); border-radius: 12px; padding: .45em .7em; }
      .un-line i { color: #fbbf24; font-size: 1.1em; } .un-line span { min-width: 0; } .un-line span b { display: block; font-size: .95em; } .un-line span small { display: block; color: #c9d4da; font-size: .78em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .un-line strong { font-size: 1.35em; color: #fde68a; font-variant-numeric: tabular-nums; }
      .un-lines { display: grid; gap: .45em; }
      .un-s { background: rgba(255,255,255,.06); border-radius: 14px; padding: .55em .75em; display: grid; gap: .25em; border-top: 4px solid #b7791f; }
      .un-s h3 { margin: 0; font-size: 1.05em; font-weight: 800; display: flex; gap: .4em; align-items: center; color: #fff; }
      .un-s h3 i { color: #fbbf24; }
      .un-p { display: flex; justify-content: space-between; align-items: baseline; gap: .6em; font-size: .9em; color: #dbe4e9; }
      .un-p span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .un-p b { font-size: 1.35em; font-weight: 800; color: #fde68a; font-variant-numeric: tabular-nums; direction: ltr; }
      .un-note { background: rgba(251,191,36,.12); border: 1px solid rgba(251,191,36,.4); border-radius: 12px; padding: .5em .75em; font-size: .95em; line-height: 1.45; }
      .un-note b { color: #fde68a; }
      .un-rooms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45em; }
      .un-r { border-radius: 14px; padding: .55em .7em; display: grid; gap: .15em; }
      .un-r.free { background: rgba(34,197,94,.14); border: 1px solid rgba(74,222,128,.45); }
      .un-r.busy { background: rgba(239,68,68,.12); border: 1px solid rgba(248,113,113,.4); }
      .un-r b { font-size: 1.3em; font-weight: 800; font-variant-numeric: tabular-nums; }
      .un-r span { font-size: .85em; color: #dbe4e9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .un-r em { font-style: normal; font-size: .8em; font-weight: 700; } .un-r.free em { color: #86efac; } .un-r.busy em { color: #fca5a5; }
      .un-w { background: rgba(255,255,255,.05); border-radius: 12px; padding: .5em .75em; display: grid; gap: .2em; }
      .un-w b { font-size: .98em; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .un-w span { font-size: .8em; color: #c9d4da; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .un-w .un-tags { display: flex; gap: .4em; align-items: center; flex-wrap: wrap; font-size: .78em; }
      .un-tag { border-radius: 999px; padding: 0 .55em; font-weight: 800; background: rgba(255,255,255,.12); }
      .un-tag.q1 { background: #15803d; } .un-tag.q2 { background: #0e7490; } .un-tag.q3 { background: #b45309; } .un-tag.q4 { background: #6b7280; }
      .un-tag.c { background: #7c2d12; }
    </style>`);

    // ---------------------------------------------------------------- data
    const people = () => (STAFF ? STAFF.members : []).filter(m => m.faculty === K.unit);
    // services from the job titles on the university site: [service, icon, pattern]
    const SERVICES = {
      finance: [['دفع الرسوم والأقساط (الصندوق)', 'bi-cash-stack', /أمين صندوق|صندوق/], ['كشف الحساب وذمم الطلبة', 'bi-receipt', /ذمم|محاسب طلبة|محاسبة الطلبة/],
        ['المنح والخصومات', 'bi-percent', /منح|خصوم/], ['التحصيل', 'bi-wallet2', /تحصيل/], ['المحاسبة العامة', 'bi-calculator', /المحاسبة العامة|محاسب أول/],
        ['الإدارة', 'bi-person-badge', /مدير|موظفة إدارية|سكرتير/]],
      library: [['الإعارة والإرجاع', 'bi-arrow-left-right', /إعارة|اعارة/], ['البحث والإرشاد', 'bi-search', /بحث وارشاد|بحث وإرشاد|ارشاد/],
        ['قواعد البيانات والمصادر الإلكترونية', 'bi-database', /قواعد البيانات|حوسبة/], ['الدوريات', 'bi-journal-text', /دوريات/],
        ['الفهرسة والتزويد', 'bi-tags', /فهرسة|تزويد/], ['الإشراف على المكتبة', 'bi-person-badge', /مشرف|مدير/]],
    }[kind] || [];
    function services() {
      const used = new Set();
      return SERVICES.map(([name, icon, re]) => {
        const ps = people().filter(m => re.test(m.job || '') && !used.has(m.id));
        ps.forEach(m => used.add(m.id));
        ps.sort((a, b) => (a.role ? 0 : 1) - (b.role ? 0 : 1));
        return { name, icon, ps };
      }).filter(x => x.ps.length);
    }
    const short = n => String(n || '').replace(/^(أ\.?\s?د|ا\.?\s?د|د|م|أ)\.+\s*/, '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    // one line per service (the head, or the first person, and the extension): for a narrow column
    const svcLines = () => `<div class="un-lines">${services().map(s => { const m = s.ps[0];
      return `<div class="un-line"><i class="bi ${s.icon}"></i><span><b>${esc(s.name)}</b><small>${esc(short(m.name))}${s.ps.length > 1 ? ` و${s.ps.length - 1} آخر` : ''}</small></span><strong>${esc(m.ext || '—')}</strong></div>`; }).join('')}</div>`;
    const svcHTML = () => `<div class="un-svc">${services().map(s => `<div class="un-s"><h3><i class="bi ${s.icon}"></i>${esc(s.name)}</h3>
      ${s.ps.slice(0, 3).map(m => `<div class="un-p"><span>${esc(short(m.name))}${m.role ? ' <small>(رئيس القسم)</small>' : ''}</span><b>${esc(m.ext || '—')}</b></div>`).join('')}</div>`).join('')}</div>`;
    // calendar dates that concern this office
    const REL = { finance: /غرامة|السحب والإضافة|تسجيل|الانسحاب|بطاقة دخول/, library: /امتحان|الامتحانات|عطلة|بدء التدريس|آخر يوم تدريس/, research: /^$/ }[kind];
    function events(now) {
      const ev = (CAL ? CAL.semesters : []).flatMap(s => s.events).filter(e => REL.test(e.title) || (kind === 'library' && e.category === 'holiday') || (kind === 'research' && e.category === 'graduate'));
      const on = ev.filter(e => e.start <= now.iso && e.end >= now.iso).sort((a, b) => a.end.localeCompare(b.end));
      const next = ev.filter(e => e.start > now.iso).sort((a, b) => a.start.localeCompare(b.start));
      return { on, next };
    }
    function evRow(e, now) {
      const on = e.start <= now.iso, d = diff(now.iso, on ? e.end : e.start);
      const cls = e.category === 'registration' ? 'reg' : e.category;
      return `<div class="rg-ev ${cls}"><div class="rg-d"><b>${dm(e.start)}</b><small>${esc(e.day || '')}</small></div>
        <div class="rg-t"><b>${esc(tidy(e.title))}</b><small>${e.start === e.end ? longDate(e.start) : `${longDate(e.start)} – ${longDate(e.end)}`}</small></div>
        <span class="rg-in">${on ? (d <= 0 ? 'ينتهي اليوم' : 'ينتهي بعد ' + days(d)) : (d === 1 ? 'غداً' : 'بعد ' + days(d))}</span></div>`;
    }
    // library building rooms now (from the timetable)
    function rooms(now) {
      const B = 'مبنى المكتبة', toMin = U.toMin;
      const S = TT.sections.filter(s => s.building === B && s.room && s.room !== '0');
      const R = [...new Set(S.map(s => String(s.room).trim()))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      const today = S.flatMap(s => s.meetings.filter(m => m.day === now.day && U.live(m) && m.mode !== 'الكتروني كامل').map(m => ({ s, room: String(s.room).trim(), a: toMin(m.start), b: toMin(m.end), m })));
      return R.map(r => {
        const cur = today.find(x => x.room === r && x.a <= now.min && now.min < x.b);
        const nx = today.filter(x => x.room === r && x.a > now.min).sort((x, y) => x.a - y.a)[0];
        return { r, cur, nx };
      });
    }
    function papers() {
      if (!WORKS) return [];
      const byId = {}; ((RS || {}).researchers || []).forEach(r => { byId[r.id] = r; });
      const who = w => (w.r || []).map(id => byId[id]).filter(Boolean).map(r => short(r.name)).slice(0, 2).join('، ');
      const ok = w => w.t && w.y && (w.r || []).length && (w.vt === 'journal' || w.vt === 'conference') && !['dataset', 'preprint', 'erratum', 'editorial', 'peer-review', 'other'].includes(w.type);
      const W = WORKS.filter(ok);
      const year = Math.max(...W.map(w => w.y).filter(y => y <= new Date().getFullYear()));
      const recent = W.filter(w => w.y >= year - 1).sort((a, b) => String(b.pd || b.y).localeCompare(String(a.pd || a.y)) || (b.c || 0) - (a.c || 0)).slice(0, 8);
      const cited = W.filter(w => w.y >= year - 4).sort((a, b) => (b.sc != null ? b.sc : b.c || 0) - (a.sc != null ? a.sc : a.c || 0)).slice(0, 8);
      const card = w => `<div class="un-w"><b dir="auto">${esc(w.t)}</b><span dir="ltr" style="text-align:right">${esc(w.v || '')}</span>
        <div class="un-tags">${w.q ? `<span class="un-tag ${w.q.toLowerCase()}">${esc(w.q)}</span>` : ''}<span class="un-tag">${w.y}</span>
          ${(w.sc != null ? w.sc : w.c) ? `<span class="un-tag c"><i class="bi bi-quote"></i> ${N(w.sc != null ? w.sc : w.c)}</span>` : ''}<span>${esc(who(w))}</span></div></div>`;
      const out = [['bi-stars', 'أحدث أبحاث باحثي جامعة البترا', `${year - 1}–${year}`, recent.map(card).join('')],
        ['bi-trophy', 'الأبحاث الأعلى اقتباساً', `آخر خمس سنوات`, cited.map(card).join('')]];
      if (kind === 'research') {
        // the faculties publishing most this year (each paper once per faculty of its university authors)
        const fc = {};
        W.filter(w => w.y === year).forEach(w => new Set((w.r || []).map(id => byId[id] && byId[id].faculty).filter(Boolean)).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
        const top = Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = top.length ? top[0][1] : 1;
        out.push(['bi-bar-chart-line', `الكليات الأكثر نشراً في ${year}`, 'عدد الأبحاث لكل كلية حسب باحثيها',
          top.map(([f, n]) => `<div class="rg-sec"><b>${esc(f)}</b><div class="rg-n"><strong class="rg-ok">${n}</strong><small>بحثاً</small></div><span></span><i class="rg-bar"><em style="width:${Math.round(100 * n / mx)}%;background:#38bdf8"></em></i></div>`).join('')]);
        const P2 = ((PROJ || {}).projects || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(b.id).localeCompare(String(a.id), 'en', { numeric: true })).slice(0, 7);
        if (P2.length) out.push(['bi-briefcase', 'أحدث المشاريع البحثية المدعومة', 'مشاريع دعمتها الجامعة عبر العمادة',
          P2.map(x => `<div class="un-w"><b dir="auto">${esc(x.t || x.te || '')}</b><div class="un-tags"><span class="un-tag">${x.year || ''}</span><span class="un-tag ${x.done ? 'q1' : 'q3'}">${x.done ? 'منجز' : 'قيد التنفيذ'}</span><span>${esc(short(String(x.pi || '').replace(/^(الدكتورة|الدكتور|الأستاذ الدكتور|الاستاذ الدكتور)\s*/, '')))} · ${esc(x.fac || '')}</span></div></div>`).join('')]);
      }
      return out.filter(x => x[3]);
    }
    const notes = () => {
      const n = NOTES[kind] || {};
      const lines = [].concat(n.hours ? [`<div class="un-note"><b><i class="bi bi-clock"></i> ساعات الدوام:</b> ${esc(n.hours)}</div>`] : [],
        (n.notes || []).filter(Boolean).map(t => `<div class="un-note"><i class="bi bi-megaphone-fill" style="color:#fbbf24"></i> ${esc(t)}</div>`));
      return lines.join('');
    };
    function trim(sel) {
      document.querySelectorAll(sel).forEach(box => {
        const col = box.closest('.scr-col'); if (!col) return;
        const q = col.querySelector('.rg-qrs');   // keep room for the QR codes at the bottom of the column
        const bottom = col.getBoundingClientRect().bottom - parseFloat(getComputedStyle(col).paddingBottom) - (q && !box.contains(q) ? q.getBoundingClientRect().height + 10 : 0);
        [...box.children].forEach(el => { if (el.getBoundingClientRect().bottom > bottom + 1) el.remove(); });
      });
    }

    // ---------------------------------------------------------------- paint
    const qr = (url, title, sub) => { const q = qrcode(0, 'M'); q.addData(url); q.make();
      return `<div class="rg-qr">${q.createSvgTag({ cellSize: 4, margin: 1, scalable: true })}<b>${title}</b><small>${sub}</small></div>`; };
    const QR = kind === 'research' ? '' : kind === 'finance'
      ? qr(SITE + 'directory.html?faculty=' + K.unit, 'موظفو الدائرة', 'الفرعيات والبريد') + qr(SITE + 'calendar.html', 'التقويم الجامعي', 'كل المواعيد')
      : qr(SITE + 'directory.html?faculty=' + K.unit, 'موظفو المكتبة', 'الفرعيات والبريد') + qr(SITE + 'calendar.html', 'التقويم الجامعي', 'الامتحانات والعطل');
    function paint() {
      const now = U.amman(P.get('at'));
      $('#scr-time').textContent = now.clock;
      $('#scr-date').textContent = `${U.DAYS[now.day] || ''} ${longDate(now.iso)}`;
      const E = events(now), nt = notes();
      const dates = `<div class="rg-phase">${E.on.slice(0, 2).map(e => { const left = diff(now.iso, e.end);
          return `<div class="rg-ph"><span class="rg-k"><i class="bi bi-hourglass-split"></i> جارٍ الآن</span><b>${esc(tidy(e.title))}</b>
            <div class="rg-cd">${left <= 0 ? '<strong>اليوم</strong><span>آخر يوم</span>' : `<span>ينتهي بعد</span><strong>${left}</strong><span>${left === 1 ? 'يوم' : left === 2 ? 'يومين' : left <= 10 ? 'أيام' : 'يوماً'}</span>`}</div>
            <small>حتى ${longDate(e.end)}</small></div>`; }).join('')}</div>
        <div class="rg-next">${E.next.slice(0, 6).map(e => evRow(e, now)).join('') || '<p class="rg-quiet">لا مواعيد قادمة في التقويم</p>'}</div>`;
      if (kind === 'research') {
        const SU = ((UNIS || {}).scopus_universities || []), me = SU.find(u => u.afid === '60040839');
        const yr = new Date().getFullYear(), py = String(yr - 1), cy = String(yr);
        const rank = (key, f) => me ? SU.slice().sort((a, b) => f(b) - f(a)).findIndex(u => u.afid === me.afid) + 1 : null;
        const yrs = me ? Object.keys(me.by_year).filter(y => +y >= yr - 7 && +y <= yr) : [], mx = me ? Math.max(...yrs.map(y => me.by_year[y])) : 1;
        const SL = papers(), k = SL.length ? slide % SL.length : 0, cur = SL[k];
        const dots = SL.length > 1 ? `<span class="scr-dots">${SL.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</span>` : '';
        const nb = me ? (() => { const L = SU.slice().sort((a, b) => (b.by_year[py] || 0) - (a.by_year[py] || 0)), i = L.findIndex(u => u.afid === me.afid);
          return L.slice(Math.max(0, i - 2), i + 3).map((u, j) => `<div class="un-line" style="${u.afid === me.afid ? 'background:#9e1f27' : ''}"><strong style="font-size:1.1em;color:#fff">${L.indexOf(u) + 1}</strong>
            <span><b>${esc(u.name_ar)}</b></span><strong>${N(u.by_year[py] || 0)}</strong></div>`).join(''); })() : '';
        $('#scr-main').innerHTML = `
          <section class="scr-col rg-now"><h2><i class="bi bi-graph-up-arrow"></i> جامعة البترا في Scopus</h2>
            ${me ? `<div class="rg-tiles" style="grid-template-columns:repeat(2,1fr)">
              <div class="rg-tile"><strong>${N(me.docs)}</strong><small>وثيقة منشورة</small></div><div class="rg-tile"><strong>${N(me.cites)}</strong><small>اقتباساً</small></div>
              <div class="rg-tile"><strong>${me.h}</strong><small>مؤشر h</small></div><div class="rg-tile"><strong>${N(me.by_year[cy] || 0)}</strong><small>وثيقة في ${cy} حتى الآن</small></div></div>
              <div style="display:flex;align-items:stretch;gap:.35em;height:7em;flex-shrink:0;margin-top:.3em">${yrs.map(y => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.15em;height:100%;justify-content:flex-end">
                <small style="font-size:.7em;color:#fde68a">${me.by_year[y]}</small><i style="display:block;width:100%;height:${Math.round(85 * me.by_year[y] / mx)}%;background:${y === cy ? '#fbbf24' : 'rgba(255,255,255,.55)'};border-radius:6px 6px 0 0"></i><small style="font-size:.7em">${y}</small></div>`).join('')}</div>` : '<p class="rg-quiet">جارٍ التحميل…</p>'}
            <h2 style="font-size:1.05em;margin-top:.5em"><i class="bi bi-calendar-event"></i> مواعيد الدراسات العليا</h2>${dates}</section>
          <section class="scr-col">${cur ? `<h2><i class="bi ${cur[0]}"></i> ${esc(cur[1])}${dots}</h2><div class="rg-sub">${esc(cur[2])}</div><div class="rg-slide un-list">${cur[3]}</div>`
            : '<h2><i class="bi bi-journal-text"></i> أبحاث الجامعة</h2><p class="scr-none">جارٍ التحميل…</p>'}</section>
          <section class="scr-col rg-help"><h2><i class="bi bi-trophy"></i> بين الجامعات الأردنية</h2>
            <div class="rg-sub">عدد وثائق Scopus في ${py}${me ? ` · البترا في المرتبة ${rank('docs', u => u.by_year[py] || 0)} من ${SU.length}` : ''}</div>
            <div class="un-lines">${nb}</div>${nt}
            <div class="rg-qrs">${qr('https://srgs.uop.edu.jo/', 'موقع العمادة', 'الدعم والتعليمات')}${qr(SITE + 'calendar.html', 'التقويم الجامعي', 'مواعيد الدراسات العليا')}</div></section>`;
      } else if (kind === 'finance') {
        $('#scr-main').innerHTML = `
          <section class="scr-col rg-now"><h2><i class="bi bi-calendar2-week"></i> مواعيد مالية مهمة</h2>${dates}</section>
          <section class="scr-col"><h2><i class="bi bi-signpost-split"></i> إلى من تتوجه؟ <span style="background:#b7791f">الرقم الفرعي</span></h2>
            <div class="rg-sub">حسب المسميات الوظيفية لموظفي الدائرة على موقع الجامعة</div>${svcHTML()}</section>
          <section class="scr-col rg-help"><h2><i class="bi bi-info-circle"></i> معلومات</h2>
            ${nt || `<div class="rg-tiles" style="grid-template-columns:1fr 1fr"><div class="rg-tile"><strong>${people().length}</strong><small>موظفاً في الدائرة</small></div>
              <div class="rg-tile"><strong dir="ltr">${esc(STAFF ? STAFF.main_line_display || '' : '')}</strong><small>الرقم الرئيسي</small></div></div>`}
            <div class="rg-qrs">${QR}</div></section>`;
      } else {
        const RM = rooms(now), SL = papers(), k = SL.length ? slide % SL.length : 0, cur = SL[k];
        const dots = SL.length > 1 ? `<span class="scr-dots">${SL.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</span>` : '';
        const toT = U.toTime;
        $('#scr-main').innerHTML = `
          <section class="scr-col rg-now"><h2><i class="bi bi-door-open"></i> قاعات مبنى المكتبة الآن</h2>
            <div class="un-rooms">${RM.map(x => x.cur
              ? `<div class="un-r busy"><b dir="ltr">${esc(x.r)}</b><span>${esc(x.cur.s.name)}</span><em>مشغولة حتى ${toT(x.cur.b)}</em></div>`
              : `<div class="un-r free"><b dir="ltr">${esc(x.r)}</b><span>${x.nx ? esc(x.nx.s.name) : 'لا محاضرات بعد الآن'}</span><em>${x.nx ? 'شاغرة حتى ' + toT(x.nx.a) : 'شاغرة بقية اليوم'}</em></div>`).join('') || '<p class="rg-quiet">لا قاعات تدريس في المبنى</p>'}</div>
            <h2 style="font-size:1.05em;margin-top:.4em"><i class="bi bi-calendar-event"></i> الامتحانات والعطل القادمة</h2>${dates}</section>
          <section class="scr-col">${cur ? `<h2><i class="bi ${cur[0]}"></i> ${esc(cur[1])}${dots}</h2><div class="rg-sub">${esc(cur[2])} · من بيانات Scopus و OpenAlex</div><div class="rg-slide un-list">${cur[3]}</div>`
            : '<h2><i class="bi bi-journal-text"></i> أبحاث الجامعة</h2><p class="scr-none">جارٍ التحميل…</p>'}</section>
          <section class="scr-col rg-help"><h2><i class="bi bi-person-raised-hand"></i> خدمات المكتبة</h2>${nt}${svcLines()}
            <div class="rg-qrs">${QR}</div></section>`;
      }
      trim('.rg-next'); trim('.un-svc'); trim('.un-lines'); trim('.un-list'); trim('.un-rooms');
      $('#scr-tick').innerHTML = `<div class="rg-foot"><span><b>${esc(TT.term)}</b></span><span>البيانات من موقع الجامعة وبوابتها، تتحدّث تلقائياً</span>
        <span>المرجع الرسمي: ${esc(K.title)}</span></div>`;
    }

    // ---------------------------------------------------------------- the screen
    document.body.classList.add('scr-on');
    document.title = `${K.title} – شاشة`;
    document.body.insertAdjacentHTML('beforeend', `<div class="scr rg un" id="scr">
      <header class="scr-top"><img src="assets/logo.png" alt=""><div class="scr-t"><small>جامعة البترا</small><h1>${esc(K.title)}</h1></div>
        <div class="scr-clock"><b id="scr-time">--:--</b><span id="scr-date"></span></div></header>
      <main class="scr-main" id="scr-main"></main>
      <footer class="scr-foot"><div class="scr-tick" id="scr-tick"></div></footer></div>`);
    const load = fresh => Promise.allSettled([U.getJSON('data/staff.json', fresh), U.getJSON('data/screens.json', fresh),
      kind !== 'finance' ? U.getJSON('data/research/works.json', fresh) : null, kind !== 'finance' ? U.getJSON('data/research/researchers.json', fresh) : null,
      kind === 'research' ? U.getJSON('data/research/universities.json', fresh) : null, kind === 'research' ? U.getJSON('data/research/projects.json', fresh) : null])
      .then(([s, n, w, r, u, pj]) => {
        if (u.status === 'fulfilled' && u.value) UNIS = u.value; if (pj.status === 'fulfilled' && pj.value) PROJ = pj.value;
        if (s.status === 'fulfilled') STAFF = s.value; if (n.status === 'fulfilled' && n.value) NOTES = n.value;
        if (w.status === 'fulfilled' && w.value) WORKS = w.value.works; if (r.status === 'fulfilled' && r.value) RS = r.value;
      });
    load().then(paint);
    setInterval(paint, 60000);
    setInterval(() => { slide++; paint(); }, 15000);
    setInterval(() => Promise.all([U.getJSON('data/timetable.json', true), U.getJSON('data/calendar.json', true), load(true)])
      .then(([t, c]) => { TT = t; CAL = c; paint(); }).catch(() => {}), 15 * 60000);
    setTimeout(() => location.reload(), 6 * 3600 * 1000);
  };
})();
