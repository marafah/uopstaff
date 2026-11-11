/* Announcements on the building and service screens (screen.html?b=...), posted from «إعلانات الشاشات»
   (screen-posts.html) and approved there. Read from data/screen_posts.json every 3 minutes:
     - ticker  : one-line news in a strip above the footer (one line at a time, every 8 seconds)
     - notice / event / poster : every few minutes (per screen setting, 3 by default) they cover the screen's middle area
                 for 15 seconds, then the normal screen is back; header, clock and footer always stay
     - urgent  : a red strip under the header while it is active (admin only)
     - alert   : the site admin's emergency message; covers the middle area until it is cleared
   Nothing is added when no announcement is meant for this screen, when the admin set the screen to «كما هي» (no
   announcements; emergency messages only), or when the screen's link has ?posts=off (exactly the screen as it was).
   During exams the building screens show no announcements unless the admin allows it (urgent and alert still show).
   Every text is shown as text (escaped), images only from data/screens/media/, links only as QR codes.
   The same drawing is used by the posting page for its live preview (window.UOP_PP). */
(function () {
  'use strict';
  const SERVICES = ['registration', 'finance', 'library', 'research'];
  const LABEL = { '*': 'كل الشاشات', 'g:buildings': 'كل شاشات المباني', 'g:services': 'كل شاشات الخدمات', others: 'المباني العامة', exams: 'شاشة الامتحانات',
    registration: 'عمادة القبول والتسجيل', finance: 'دائرة الشؤون المالية', library: 'مكتبة جامعة البترا', research: 'عمادة البحث العلمي' };
  const TYPES = {
    ticker: { t: 'شريط أخبار', ic: 'bi-megaphone', d: 'سطر واحد أسفل الشاشة' },
    notice: { t: 'إعلان', ic: 'bi-card-text', d: 'بطاقة بعنوان ونص، تظهر دورياً' },
    poster: { t: 'بوستر', ic: 'bi-image', d: 'صورة أو ملصق يملأ وسط الشاشة دورياً' },
    event: { t: 'فعالية', ic: 'bi-calendar-event', d: 'فعالية بموعد وعدّ تنازلي و QR' },
    urgent: { t: 'تنبيه عاجل', ic: 'bi-exclamation-triangle-fill', d: 'شريط أحمر دائم تحت العنوان (للمسؤول)' } };
  const TONES = { info: ['#0e7490', 'أزرق'], gold: ['#b7791f', 'ذهبي'], maroon: ['#9e1f27', 'عنابي'], green: ['#15803d', 'أخضر'], violet: ['#6d28d9', 'بنفسجي'] };
  const ICONS = ['bi-megaphone', 'bi-info-circle', 'bi-calendar-event', 'bi-mortarboard', 'bi-trophy', 'bi-people', 'bi-briefcase', 'bi-journal-text',
    'bi-mic', 'bi-easel', 'bi-heart-pulse', 'bi-lightbulb', 'bi-globe2', 'bi-award', 'bi-cash-coin', 'bi-exclamation-circle', 'bi-clock-history', 'bi-geo-alt'];
  const DEF = { mode: 'on', every: 3, secs: 15, exams: false, map: false, lapse: false };
  const DAYL = ['ح', 'ن', 'ث', 'ر', 'خ', 'س', 'ج'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const DEMO = /[?&]demo=1(&|$)/.test(location.search);   // the try-out screen of «وضع التجربة»: its posts come from this browser only
  const safeImg = u => /^data\/screens\/media\/[A-Za-z0-9._-]+\.(webp|jpe?g|png)$/.test(u || '') || (DEMO && /^data:image\/(webp|jpeg|png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(u || '')) ? u : '';
  const safeLink = u => /^https:\/\/[^\s"'<>]{3,300}$/.test(u || '') ? u : '';
  const icon = i => ICONS.includes(i) ? i : 'bi-megaphone';
  const tone = t => (TONES[t] || TONES.maroon)[0];
  const isBuilding = k => !!k && k !== '*' && !k.startsWith('g:') && !SERVICES.includes(k) && k !== 'exams';
  const inTarget = (t, key) => t === '*' || t === key || (t === 'g:services' && SERVICES.includes(key)) || (t === 'g:buildings' && isBuilding(key));
  const settingsFor = (D, key) => Object.assign({}, DEF, (D && D.settings && D.settings.default) || {}, (D && D.settings && D.settings.screens && D.settings.screens[key]) || {});
  // is the post shown on this screen at this moment (Amman time: {iso, day, min})?
  function matches(p, key, now) {
    if (!p || p.status !== 'live' || !Array.isArray(p.screens) || !p.screens.some(t => inTarget(t, key))) return false;
    if (now.iso < p.start || now.iso > p.end) return false;
    if (p.days && p.days.length && !p.days.includes(now.day)) return false;
    const a = toMin(p.from), b = toMin(p.to);
    if (a != null && now.min < a) return false;
    if (b != null && now.min >= b) return false;
    if (p.type === 'event' && p.at) { const d = p.at.slice(0, 10), m = toMin(p.at.slice(11)); if (d < now.iso || (d === now.iso && m != null && now.min > m + 180)) return false; }
    return true;
  }
  const qr = link => { if (!safeLink(link) || !window.qrcode) return ''; try { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); return q.createSvgTag({ cellSize: 4, margin: 1, scalable: true }); } catch (e) { return ''; } };
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  function countdown(at, now) {
    const d = at.slice(0, 10), m = toMin(at.slice(11)) || 0, n = dayDiff(now.iso, d);
    if (n > 1) return { big: String(n), small: n <= 10 ? 'أيام' : 'يوماً', line: 'بعد' };
    if (n === 1) return { big: 'غداً', small: at.slice(11), line: '' };
    if (now.min < m) { const left = m - now.min; return left >= 60 ? { big: String(Math.round(left / 60)), small: Math.round(left / 60) <= 10 ? 'ساعات' : 'ساعة', line: 'اليوم · بعد' } : { big: String(left), small: 'دقيقة', line: 'بعد' }; }
    return { big: 'الآن', small: 'جارية', line: '' };
  }
  const when = at => { const d = at.slice(0, 10); return `${WD[new Date(d + 'T12:00:00Z').getUTCDay()]} ${+d.slice(8)}/${+d.slice(5, 7)} · <bdi dir="ltr">${esc(at.slice(11))}</bdi>`; };
  const from = p => p.ownerName ? `<span class="pp-from"><i class="bi bi-person-badge"></i> ${esc(p.ownerName)}</span>` : '';

  // ---------------------------------------------------------------- drawing
  function css() {
    if (document.getElementById('pp-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="pp-css">
      .pp-tick { display: flex; align-items: center; gap: .8em; background: rgba(255,255,255,.07); border-radius: 12px; padding: .45em .8em; min-width: 0; overflow: hidden; }
      .pp-tl { flex: none; background: #9e1f27; color: #fff; font-weight: 800; border-radius: 8px; padding: .15em .7em; font-size: .95em; }
      .pp-tt { position: relative; flex: 1; min-width: 0; height: 1.6em; }
      .pp-tt > span { position: absolute; inset: 0; font-size: 1.15em; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0; transform: translateY(.5em); transition: opacity .6s, transform .6s; }
      .pp-tt > span.on { opacity: 1; transform: none; }
      .pp-tt small { color: #9fb0b8; font-weight: 500; font-size: .75em; margin-inline-start: .6em; }
      .pp-urg { display: flex; align-items: center; gap: .7em; background: linear-gradient(90deg, #b91c1c, #7f1d1d); color: #fff; border-radius: 12px; padding: .5em .9em; font-size: 1.1em; box-shadow: 0 0 0 2px rgba(254,202,202,.35); animation: ppPulse 2.4s ease-in-out infinite; }
      .pp-urg i { font-size: 1.3em; color: #fde68a; } .pp-urg b { font-weight: 800; } .pp-urg span { color: #fee2e2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @keyframes ppPulse { 50% { box-shadow: 0 0 0 5px rgba(254,202,202,.15); } }
      .pp-ov { position: fixed; z-index: 30; display: flex; opacity: 0; transition: opacity .7s; pointer-events: none; }
      .pp-ov.on { opacity: 1; }
      .pp-slide { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: .7em; background: radial-gradient(circle at 15% 0%, #1f3540 0, #0b1c22 60%, #08161b 100%);
        border-radius: 18px; padding: 1em 1.2em; overflow: hidden; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
      .pp-head { display: flex; align-items: center; gap: .6em; font-size: .95em; color: #fbbf24; font-weight: 800; }
      .pp-head .pp-from { margin-inline-start: auto; }
      .pp-from { color: #c9d4da; font-weight: 600; font-size: .9em; }
      .pp-prog { height: .3em; background: rgba(255,255,255,.12); border-radius: 999px; overflow: hidden; }
      .pp-prog em { display: block; height: 100%; width: 100%; background: #fbbf24; transform-origin: right; }
      .pp-ov.on .pp-prog em { animation: ppProg var(--pp-secs, 15s) linear forwards; }
      @keyframes ppProg { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      .pp-cards { flex: 1; min-height: 0; display: grid; gap: .9em; grid-template-columns: repeat(var(--n, 1), minmax(0, 1fr)); }
      .pp-card { display: flex; flex-direction: column; gap: .5em; background: rgba(255,255,255,.06); border-radius: 16px; padding: 1em 1.1em; border-top: 6px solid var(--c); min-height: 0; overflow: hidden; }
      .pp-card .pp-ic { width: 2.6em; height: 2.6em; border-radius: .7em; display: grid; place-items: center; font-size: 1.4em; background: var(--c); color: #fff; flex: none; }
      .pp-card h3 { margin: 0; font-size: 1.9em; font-weight: 800; line-height: 1.25; color: #fff; }
      .pp-n1 .pp-card h3 { font-size: 2.6em; }
      .pp-card p { margin: 0; font-size: 1.25em; line-height: 1.6; color: #e2e8ec; white-space: pre-line; overflow: hidden; }
      .pp-n1 .pp-card p { font-size: 1.6em; }
      .pp-card .pp-row { display: flex; gap: .8em; align-items: flex-start; }
      .pp-card .pp-foot { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: .8em; }
      .pp-qr { flex: none; display: grid; justify-items: center; gap: .2em; font-size: .8em; color: #c9d4da; }
      .pp-qr svg { width: 6.5em; height: 6.5em; background: #fff; border-radius: 10px; padding: .25em; display: block; }
      .pp-ev { flex: 1; min-height: 0; display: grid; grid-template-columns: auto 1fr auto; gap: 1.4em; align-items: center; }
      .pp-cd { text-align: center; background: var(--c); border-radius: 22px; padding: .6em 1.2em; min-width: 7em; box-shadow: 0 .4em 1.4em rgba(0,0,0,.35); }
      .pp-cd small { display: block; font-size: 1.05em; color: #fde68a; font-weight: 700; }
      .pp-cd b { display: block; font-size: 4.2em; line-height: 1.05; font-weight: 800; font-variant-numeric: tabular-nums; }
      .pp-cd span { display: block; font-size: 1.2em; font-weight: 700; }
      .pp-et h3 { margin: 0 0 .25em; font-size: 2.7em; font-weight: 800; line-height: 1.2; }
      .pp-et .pp-when { font-size: 1.45em; color: #fde68a; font-weight: 700; } .pp-et .pp-place { font-size: 1.25em; color: #dbe4e9; }
      .pp-et p { margin: .4em 0 0; font-size: 1.3em; line-height: 1.55; color: #e2e8ec; white-space: pre-line; }
      .pp-ev .pp-qr svg { width: 9em; height: 9em; }
      .pp-poster { padding: 0; }
      .pp-poster .pp-bg { position: absolute; inset: -20px; background-size: cover; background-position: center; filter: blur(24px) brightness(.45); }
      .pp-poster img { position: relative; flex: 1; min-height: 0; width: 100%; object-fit: contain; }
      .pp-poster .pp-cap { position: absolute; inset-inline: 0; bottom: 0; display: flex; align-items: flex-end; gap: 1em; padding: 1.4em 1.2em .8em; background: linear-gradient(transparent, rgba(0,0,0,.75)); }
      .pp-poster .pp-cap b { font-size: 1.6em; font-weight: 800; } .pp-poster .pp-cap span { display: block; font-size: 1.1em; color: #e2e8ec; }
      .pp-poster .pp-cap .pp-qr { margin-inline-start: auto; }
      .pp-poster .pp-prog { position: absolute; top: 0; inset-inline: 0; border-radius: 0; }
      .pp-alert { background: linear-gradient(135deg, #991b1b, #450a0a); justify-content: center; align-items: center; text-align: center; gap: .5em; box-shadow: 0 0 0 4px #fca5a5 inset; }
      .pp-alert i { font-size: 5em; color: #fde68a; animation: ppBlink 1.6s steps(2) infinite; }
      .pp-alert h3 { font-size: 3.4em; font-weight: 800; margin: 0; } .pp-alert p { font-size: 1.8em; margin: 0; color: #fee2e2; white-space: pre-line; max-width: 80%; }
      @keyframes ppBlink { 50% { opacity: .45; } }
      @media (prefers-reduced-motion: reduce) { .pp-urg, .pp-alert i { animation: none; } .pp-tt > span { transition: none; } }
      .pp-evac { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.4fr); gap: 1em; text-align: start; align-items: center; padding: 1em; }
      .pp-evac .pp-evt { display: grid; gap: .3em; justify-items: start; } .pp-evac .pp-evt i { font-size: 3.4em; } .pp-evac h3 { font-size: 2.6em; } .pp-evac p { font-size: 1.4em; max-width: none; }
      .pp-ap { background: #15803d; border-radius: 14px; padding: .6em .9em; margin-top: .4em; box-shadow: 0 0 0 3px #bbf7d0; } .pp-ap b { display: block; font-size: 1.6em; } .pp-ap span { display: block; font-size: 1.2em; } .pp-ap small { display: block; font-size: .95em; opacity: .9; }
      .pp-free { display: grid; gap: .25em; margin: .2em 0 .6em; } .pp-free > b { font-size: 1.1em; color: #bbf7d0; } .pp-free span { display: flex; justify-content: space-between; gap: .5em; background: rgba(255,255,255,.1); border-radius: 8px; padding: .15em .5em; font-size: 1.15em; font-weight: 800; }
      .pp-free small { font-weight: 500; color: #dbe4e9; font-size: .8em; }
      .pp-lapse .pp-lg { transition: r .25s linear, fill .4s; stroke-width: 3; }
      .pp-lclock { font-size: 4.2em; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; color: #fde68a; }
      .pp-ltot b { display: block; font-size: 2.6em; line-height: 1.1; font-variant-numeric: tabular-nums; } .pp-ltot span { color: #dbe4e9; font-size: 1em; }
      .pp-lbar { height: .45em; background: rgba(255,255,255,.15); border-radius: 999px; overflow: hidden; margin: .6em 0; } .pp-lbar i { display: block; height: 100%; background: #fde68a; transition: width .2s linear; }
      .pp-lapse .pp-mapside { min-width: 0; } .pp-ltop { display: grid; grid-template-columns: minmax(0, 1fr); gap: .3em; min-width: 0; }
      .pp-ltop > span { display: flex; align-items: center; gap: .4em; background: rgba(255,255,255,.08); border-radius: 8px; padding: .2em .4em; font-size: .95em; min-width: 0; }
      .pp-ltop em { font-style: normal; font-weight: 800; color: #fff; border-radius: 999px; min-width: 1.9em; text-align: center; padding: 0 .3em; } .pp-ltop > span > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pp-ltop b { font-variant-numeric: tabular-nums; }
      .pp-lnote { font-size: .8em !important; color: #94a3b8 !important; margin-top: .6em; }
      .pp-mapbody { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 15em; gap: 1em; align-items: center; }
      .pp-map { width: 100%; height: 100%; display: block; background: #f6f8f7; border-radius: 12px; }
      .pp-pulse { fill: rgba(37,99,235,.45); transform-box: fill-box; transform-origin: center; animation: ppYou 1.6s ease-out infinite; }
      @keyframes ppYou { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(4); opacity: 0; } }
      .pp-mapside h3 { font-size: 1.7em; font-weight: 800; margin: 0 0 .3em; } .pp-mapside p { font-size: 1.05em; color: #dbe4e9; line-height: 1.5; }
      .pp-mapside .pp-qr svg { width: 9em; height: 9em; }
      .pp-mockw { container-type: inline-size; }
      .scr.pp-mock, .scr.pp-mock * { box-sizing: border-box; }
      .scr.pp-mock { position: relative; inset: auto; width: 100%; aspect-ratio: 16 / 9; font-size: 1.15cqw; border-radius: 12px; overflow: hidden; z-index: 0; }
      .scr.pp-mock .pp-ov { position: static; opacity: 1; min-height: 0; }
      .pp-ghost { display: grid; grid-template-columns: 1.35fr 1fr .9fr; gap: 1.2em; min-height: 0; }
      .pp-ghost > div { background: rgba(255,255,255,.05); border-radius: 16px; padding: .8em; display: grid; gap: .6em; align-content: start; }
      .pp-ghost > div i { display: block; height: 2.6em; border-radius: 10px; background: rgba(255,255,255,.06); }
      .pp-ghost > div b { color: #9fb0b8; font-size: 1em; }
    </style>`);
  }
  const tickerHTML = list => `<div class="pp-tick" id="pp-tick"><span class="pp-tl"><i class="bi bi-megaphone-fill"></i> أخبار</span><div class="pp-tt">${list.map((p, i) =>
    `<span class="${i ? '' : 'on'}">${esc(p.text)}${p.ownerName ? `<small>· ${esc(p.ownerName)}</small>` : ''}</span>`).join('')}</div></div>`;
  const urgentHTML = list => `<div class="pp-urg" id="pp-urg"><i class="bi bi-exclamation-triangle-fill"></i><b>${esc(list[0].title)}</b>${list[0].text ? `<span>${esc(list[0].text)}</span>` : ''}${list.length > 1 ? `<span>· +${list.length - 1}</span>` : ''}</div>`;
  const prog = () => '<div class="pp-prog"><em></em></div>';
  // a slide: {kind: 'notices', items} | {kind: 'event', p} | {kind: 'poster', p}; img overrides the poster's image (preview)
  function slideHTML(s, now, img) {
    if (s.kind === 'map') {   // «أنت هنا»: the campus plan with this building, and a QR to the live map from here
      const b = s.b, link = s.site + 'campus.html?here=' + encodeURIComponent('b:' + b.id), q = qr(link);
      return `<div class="pp-slide pp-mapslide"><div class="pp-head"><i class="bi bi-map"></i> خريطة الحرم${''}</div>${prog()}
        <div class="pp-mapbody"><svg class="pp-map" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="xMidYMid meet"><image href="${esc(s.img)}" width="${s.w}" height="${s.h}"/>
          <g transform="translate(${(b.x * s.w).toFixed(0)} ${(b.y * s.h).toFixed(0)})"><circle class="pp-pulse" r="22"/><circle r="22" fill="#2563eb" stroke="#fff" stroke-width="7"/>
          <rect x="-62" y="32" width="124" height="38" rx="19" fill="#2563eb"/><text y="58" text-anchor="middle" fill="#fff" font-size="24" font-weight="800">أنت هنا</text></g></svg>
          <div class="pp-mapside"><h3>أنت في ${esc(b.name)}</h3>${s.free && s.free.length ? `<div class="pp-free"><b><i class="bi bi-door-open"></i> قاعات شاغرة قريبة الآن</b>${s.free.map(f => `<span><bdi dir="ltr">${esc(f.r)}</bdi><small>${f.same ? 'في هذا المبنى' : `مبنى ${esc(f.b)} · ${f.min} د`}</small></span>`).join('')}</div>`
            : '<p>امسح الرمز: خريطة الحرم الحيّة، والطريق إلى أي قاعة أو مكتب، ومن في كل مبنى الآن.</p>'}${q ? `<div class="pp-qr">${q}<span>خريطة الحرم</span></div>` : ''}</div></div></div>`;
    }
    if (s.kind === 'lapse') {   // «يوم الحرم في دقيقة»: the day from 7:30 to 18:30, each building's students as a growing circle
      const C = s.C, P2 = b => `${(b.x * C.width).toFixed(0)} ${(b.y * C.height).toFixed(0)}`;
      return `<div class="pp-slide pp-mapslide pp-lapse"><div class="pp-head"><i class="bi bi-play-circle"></i> يوم الحرم في دقيقة · ${esc(s.dayName)}</div>${prog()}
        <div class="pp-mapbody"><svg class="pp-map" viewBox="0 0 ${C.width} ${C.height}" preserveAspectRatio="xMidYMid meet"><image href="${esc(C.image)}" width="${C.width}" height="${C.height}"/>
          ${C.buildings.filter(b => s.L.per[b.id]).map(b => `<g transform="translate(${P2(b)})"><circle class="pp-lg" data-b="${esc(b.id)}" r="0"/><circle r="17" fill="#091b22" stroke="#fff" stroke-width="4"/><text y="6" text-anchor="middle" fill="#fff" font-size="${b.id.length > 2 ? 13 : 17}" font-weight="800">${esc(b.id)}</text></g>`).join('')}</svg>
          <div class="pp-mapside"><div class="pp-lclock" dir="ltr">07:30</div><div class="pp-ltot"><b>0</b><span>طالباً في القاعات الآن</span></div><div class="pp-lbar"><i></i></div>
            <div class="pp-ltop"></div><p class="pp-lnote">من أعداد المسجلين في الشعب حسب الجدول الدراسي</p></div></div></div>`;
    }
    if (s.kind === 'poster') {
      const p = s.p, src = img || safeImg(p.image), q = qr(p.link);
      return `<div class="pp-slide pp-poster">${src ? `<div class="pp-bg" style="background-image:url('${esc(src)}')"></div><img src="${esc(src)}" alt="">` : '<div class="pp-alert" style="flex:1"><i class="bi bi-image"></i><p>اختر صورة</p></div>'}
        ${prog()}${p.title || p.text || q ? `<div class="pp-cap"><div>${p.title ? `<b>${esc(p.title)}</b>` : ''}${p.text ? `<span>${esc(p.text)}</span>` : ''}</div>${q ? `<div class="pp-qr">${q}<span>امسح الرمز</span></div>` : ''}</div>` : ''}</div>`;
    }
    if (s.kind === 'event') {
      const p = s.p, c = countdown(p.at || now.iso + 'T00:00', now), q = qr(p.link);
      return `<div class="pp-slide" style="--c:${tone(p.tone)}"><div class="pp-head"><i class="bi ${icon(p.icon)}"></i> فعالية${from(p)}</div>${prog()}
        <div class="pp-ev"><div class="pp-cd"><small>${esc(c.line)}</small><b>${esc(c.big)}</b><span>${esc(c.small)}</span></div>
          <div class="pp-et"><h3>${esc(p.title)}</h3><div class="pp-when"><i class="bi bi-calendar3"></i> ${p.at ? when(p.at) : ''}</div>${p.place ? `<div class="pp-place"><i class="bi bi-geo-alt"></i> ${esc(p.place)}</div>` : ''}${p.text ? `<p>${esc(p.text)}</p>` : ''}</div>
          ${q ? `<div class="pp-qr">${q}<span>للتسجيل والتفاصيل</span></div>` : '<span></span>'}</div></div>`;
    }
    const L = s.items;
    return `<div class="pp-slide pp-n${L.length}"><div class="pp-head"><i class="bi bi-megaphone-fill"></i> إعلانات</div>${prog()}
      <div class="pp-cards" style="--n:${L.length}">${L.map(p => { const q = qr(p.link); return `<div class="pp-card" style="--c:${tone(p.tone)}">
        <div class="pp-row"><span class="pp-ic"><i class="bi ${icon(p.icon)}"></i></span><h3>${esc(p.title)}</h3></div>${p.text ? `<p>${esc(p.text)}</p>` : ''}
        <div class="pp-foot">${from(p)}${q ? `<div class="pp-qr">${q}<span>امسح الرمز</span></div>` : ''}</div></div>`; }).join('')}</div></div>`;
  }
  // the emergency message; with «evac» and the campus data: this building, the nearest assembly point and the way to it
  function alertHTML(a, b, C) {
    const sf = C && C.safety, ap = a.evac && b && sf && (sf.assembly || []).slice().sort((x, y) => Math.hypot(x.x - b.x, (x.y - b.y) * C.height / C.width) - Math.hypot(y.x - b.x, (y.y - b.y) * C.height / C.width))[0];
    if (!ap) return `<div class="pp-slide pp-alert"><i class="bi bi-exclamation-octagon-fill"></i><h3>${esc(a.title)}</h3>${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`;
    const P2 = o => `${(o.x * C.width).toFixed(0)},${(o.y * C.height).toFixed(0)}`;
    return `<div class="pp-slide pp-alert pp-evac"><div class="pp-evt"><i class="bi bi-exclamation-octagon-fill"></i><h3>${esc(a.title)}</h3>${a.text ? `<p>${esc(a.text)}</p>` : ''}
        <div class="pp-ap"><b>توجّه إلى نقطة التجمع ${esc(ap.id)}</b><span>${esc(ap.name)}</span>${sf.status !== 'official' ? '<small>واتبع تعليمات الأمن الجامعي</small>' : ''}</div></div>
      <svg class="pp-map" viewBox="0 0 ${C.width} ${C.height}" preserveAspectRatio="xMidYMid meet"><image href="${esc(C.image)}" width="${C.width}" height="${C.height}"/>
        <polyline points="${P2(b)} ${P2(ap)}" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/><polyline points="${P2(b)} ${P2(ap)}" fill="none" stroke="#15803d" stroke-width="9" stroke-dasharray="22 14" stroke-linecap="round"/>
        <g transform="translate(${P2(b).replace(',', ' ')})"><circle class="pp-pulse" r="24"/><circle r="24" fill="#2563eb" stroke="#fff" stroke-width="7"/></g>
        <g transform="translate(${P2(ap).replace(',', ' ')})"><rect x="-30" y="-30" width="60" height="60" rx="10" fill="#15803d" stroke="#fff" stroke-width="7"/><text y="13" text-anchor="middle" fill="#fff" font-size="38" font-weight="800">${esc(ap.id)}</text></g></svg></div>`;
  }
  // the rotation: pinned first, notices two by two (one when long), each event and poster alone
  function slides(posts) {
    const L = posts.filter(p => ['notice', 'event', 'poster'].includes(p.type)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(a.start).localeCompare(String(b.start)));
    const out = []; let pair = [];
    L.forEach(p => {
      if (p.type !== 'notice') { out.push({ kind: p.type, p }); return; }
      if ((p.text || '').length > 160) { out.push({ kind: 'notices', items: [p] }); return; }
      pair.push(p); if (pair.length === 2) { out.push({ kind: 'notices', items: pair }); pair = []; }
    });
    if (pair.length) out.push({ kind: 'notices', items: pair });
    return out;
  }
  // a whole screen in miniature, for the posting page: the slide, or the normal screen (grey) with the ticker / urgent strip
  function mock({ title, p, img, now }) {
    css();
    const top = `<header class="scr-top"><img src="assets/logo.png" alt=""><div class="scr-t"><small>جامعة البترا</small><h1>${esc(title || 'شاشة المبنى')}</h1></div>
      <div class="scr-clock"><b>${esc(now.clock || '10:30')}</b><span>معاينة</span></div></header>`;
    const ghost = `<main class="scr-main pp-ghost">${['جارية الآن', 'تبدأ قريباً', 'قاعات شاغرة'].map(t => `<div><b>${t}</b><i></i><i></i><i></i></div>`).join('')}</main>`;
    const foot = `<footer class="scr-foot"><div class="scr-tick" style="color:#9fb0b8">مواعيد قريبة…</div></footer>`;
    let mid = ghost, strip = '', urg = '';
    if (p.type === 'ticker') strip = tickerHTML([p]);
    else if (p.type === 'urgent') urg = urgentHTML([p]);
    else if (p.type === 'alert') mid = `<div class="pp-ov on" style="--pp-secs:9999s">${alertHTML(p)}</div>`;
    else mid = `<div class="pp-ov on" style="--pp-secs:9999s">${slideHTML(p.type === 'notice' ? { kind: 'notices', items: [p] } : { kind: p.type, p }, now, img)}</div>`;
    const rows = ['auto', urg && 'auto', 'minmax(0,1fr)', strip && 'auto', 'auto'].filter(Boolean).join(' ');
    return `<div class="pp-mockw"><div class="scr pp-mock" style="grid-template-rows:${rows}">${top}${urg}${mid}${strip}${foot}</div></div>`;
  }
  window.UOP_PP = { SERVICES, LABEL, TYPES, TONES, ICONS, DEF, DAYL, matches, settingsFor, inTarget, isBuilding, slides, slideHTML, mock, css, safeLink };

  // ---------------------------------------------------------------- on the screen
  if (!document.getElementById('scr-app')) return;   // not screen.html
  const P = new URLSearchParams(location.search);
  if (P.get('posts') === 'off') return;   // this screen exactly as it was
  const KEY = (P.get('b') || '').replace(/^مينى\s/, 'مبنى ');
  if (!KEY) return;
  let CAMPUS, TT, D = null, SCR = null, show = [], tick = [], tk = 0, si = 0, nextAt = Date.now() + 20000, ov = null, rowsWas = '';
  const now = () => window.UOP.amman(P.get('at'));
  const load = () => DEMO ? (() => { try { const x = JSON.parse(localStorage.getItem('uop-pp-demo') || 'null'); D = x && x.DATA; } catch (e) { D = null; } draw(); })()
    : fetch('data/screen_posts.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(x => { D = x; draw(); }).catch(() => {});
  // «يوم الحرم في دقيقة»: students in each building's rooms every 5 minutes (each lecture once, in-person only)
  const LAPSE = {};
  function lapseData(day) {
    if (LAPSE[day]) return LAPSE[day];
    if (!TT || !TT.sections || !CAMPUS) return null;
    const U = window.UOP, byTT = {}, seen = new Set(), T0 = 450, T1 = 1110, ST = 5, n = (T1 - T0) / ST, per = {}, tot = new Array(n + 1).fill(0);
    CAMPUS.buildings.forEach(x => (x.tt || []).forEach(t => { byTT[t] = x; }));
    TT.sections.forEach(s => { const b = byTT[s.building], r = String(s.room || '').trim(); if (!b || !r || r === '0') return;
      s.meetings.forEach(m => { if (m.day !== day || !U.live(m) || m.mode === 'الكتروني كامل') return; const k = [r, s.code, s.section, m.start].join('|'); if (seen.has(k)) return; seen.add(k);
        const a = U.toMin(m.start), z = U.toMin(m.end), v = +s.registered || 0, arr = per[b.id] = per[b.id] || new Array(n + 1).fill(0);
        for (let i = 0; i <= n; i++) { const t = T0 + i * ST; if (a <= t && t < z) { arr[i] += v; tot[i] += v; } } }); });
    return (LAPSE[day] = { T0, ST, n, per, tot, max: Math.max(1, ...Object.values(per).flat()) });
  }
  const lapseColor = v => v >= 400 ? '220,38,38' : v >= 150 ? '245,158,11' : '22,163,74';
  function runLapse(el, L, C, ms) {
    const k = 95 / Math.sqrt(L.max), steps = L.n, every = Math.max(60, (ms * 0.9) / steps), names = Object.fromEntries(C.buildings.map(b => [b.id, b.short || b.name]));
    let i = 0;
    const tick = () => {
      if (!document.body.contains(el)) return clearInterval(tm);
      const t = L.T0 + i * L.ST, U = window.UOP;
      el.querySelectorAll('.pp-lg').forEach(c => { const v = L.per[c.dataset.b][i]; c.style.r = (v ? 18 + Math.sqrt(v) * k : 0).toFixed(1) + 'px'; c.style.fill = `rgba(${lapseColor(v)},.45)`; c.style.stroke = `rgb(${lapseColor(v)})`; });
      el.querySelector('.pp-lclock').textContent = U.toTime(t);
      el.querySelector('.pp-ltot b').textContent = L.tot[i].toLocaleString('en');
      el.querySelector('.pp-lbar i').style.width = (i / steps * 100) + '%';
      el.querySelector('.pp-ltop').innerHTML = Object.entries(L.per).map(([b, a]) => [b, a[i]]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([b, v]) => `<span><em style="background:rgb(${lapseColor(v)})">${esc(b)}</em><span>${esc(names[b])}</span><b>${v.toLocaleString('en')}</b></span>`).join('');
      if (++i > steps) clearInterval(tm);
    };
    const tm = setInterval(tick, every); tick();
  }
  // free rooms now in this building and the nearest others (for the map slide): rooms with no in-person lecture at this minute
  function freeNear(b, n) {
    if (!TT || !TT.sections || !CAMPUS) return [];
    const U = window.UOP, byTT = {}; CAMPUS.buildings.forEach(x => (x.tt || []).forEach(t => { byTT[t] = x; }));
    const rooms = {}, busy = new Set();
    TT.sections.forEach(s => { const x = byTT[s.building], r = String(s.room || '').trim(); if (!x || !r || r === '0') return; rooms[r] = x;
      s.meetings.forEach(m => { if (m.day === n.day && U.live(m) && m.mode !== 'الكتروني كامل' && U.toMin(m.start) <= n.min + 30 && n.min < U.toMin(m.end)) busy.add(r); }); });
    const d = x => Math.round(Math.hypot(x.x - b.x, (x.y - b.y) * CAMPUS.height / CAMPUS.width) * (CAMPUS.meters_wide || 750) * 1.3 / 80);
    return Object.entries(rooms).filter(([r]) => !busy.has(r)).map(([r, x]) => ({ r, b: x.id, same: x === b, min: Math.max(1, d(x)) }))
      .sort((p, q) => (q.same - p.same) || p.min - q.min || p.r.localeCompare(q.r, 'en', { numeric: true })).slice(0, 5);
  }
  // the strips go in the screen's own grid (the columns re-measure themselves); nothing at all when there is nothing to show
  function layout() {
    const kids = [...SCR.children].filter(e => e !== ov);
    const rows = kids.map(e => e.classList.contains('scr-main') ? 'minmax(0, 1fr)' : 'auto').join(' ');
    if (rows === rowsWas) return;
    rowsWas = rows;
    SCR.style.gridTemplateRows = kids.length === 3 ? '' : rows;
    window.dispatchEvent(new Event('resize'));
  }
  function draw() {
    if (!SCR) return;
    const n = now(), set = settingsFor(D, KEY), exams = SCR.classList.contains('scx') && KEY !== 'exams';
    const live = (D && D.posts || []).filter(p => matches(p, KEY, n));
    const ads = set.mode === 'off' || (exams && !set.exams) ? [] : live;
    const urg = live.filter(p => p.type === 'urgent');
    const al = D && D.alert && D.alert.title && (D.alert.screens || ['*']).some(t => inTarget(t, KEY)) && (!D.alert.until || D.alert.until > new Date().toISOString()) ? D.alert : null;
    tick = ads.filter(p => p.type === 'ticker');
    show = slides(ads);
    // «خريطة الحرم» on this screen (set by the admin per screen): one more slide in the rotation
    const wantMap = set.map && set.mode !== 'off' && !(exams && !set.exams), wantLapse = set.lapse && set.mode !== 'off' && !(exams && !set.exams);
    if ((wantMap || wantLapse || (al && al.evac)) && CAMPUS === undefined) { CAMPUS = null; fetch('data/campus.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(c => { CAMPUS = c || false; draw(); }).catch(() => { CAMPUS = false; }); }
    const here = CAMPUS && CAMPUS.buildings.find(x => x.screen === KEY);
    if ((wantMap || wantLapse) && TT === undefined) { TT = null; window.UOP.getJSON('data/timetable.json').then(t => { TT = t; draw(); }).catch(() => { TT = false; }); }
    if (wantLapse) { const L = lapseData(n.day); if (L && L.tot.some(Boolean)) show.push({ kind: 'lapse', L, C: CAMPUS, dayName: (window.UOP.DAYS || {})[n.day] || '' }); }
    if (wantMap) {
      if (here) show.push({ kind: 'map', b: here, img: CAMPUS.image, w: CAMPUS.width, h: CAMPUS.height, site: location.origin + location.pathname.replace(/[^/]*$/, ''), free: freeNear(here, n) });
    }
    const old = { u: document.getElementById('pp-urg'), t: document.getElementById('pp-tick') };
    const uHTML = urg.length && set.mode !== 'off' ? urgentHTML(urg) : '', tHTML = tick.length ? tickerHTML(tick) : '';
    if (old.u && old.u.outerHTML !== uHTML) old.u.remove();
    if (uHTML && !document.getElementById('pp-urg')) SCR.querySelector('.scr-top').insertAdjacentHTML('afterend', uHTML);
    if (old.t && old.t.dataset.k !== tHTML.length + tick.map(p => p.id).join()) old.t.remove();
    if (tHTML && !document.getElementById('pp-tick')) { SCR.querySelector('.scr-foot').insertAdjacentHTML('beforebegin', tHTML); const t = document.getElementById('pp-tick'); t.dataset.k = tHTML.length + tick.map(p => p.id).join(); tk = 0; }
    if (uHTML || tHTML || al || show.length) css();
    layout();
    if (al) { cover(alertHTML(al, here, CAMPUS), 0, 'al'); return; }
    if (ov && ov.dataset.k === 'al') hide();
  }
  // the middle area covered by a slide; secs = 0: until taken away
  function cover(html, secs, k) {
    const main = SCR.querySelector('.scr-main'); if (!main) return;
    if (ov && ov.dataset.k === k && k === 'al' && ov.dataset.h === html) return;
    if (!ov) { ov = document.createElement('div'); ov.className = 'pp-ov'; SCR.appendChild(ov); }
    const r = main.getBoundingClientRect();
    Object.assign(ov.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    ov.style.setProperty('--pp-secs', (secs || 9999) + 's');
    ov.dataset.k = k; ov.dataset.h = html;
    ov.classList.remove('on'); ov.innerHTML = html; void ov.offsetWidth; ov.classList.add('on');
    if (secs) setTimeout(() => { if (ov && ov.dataset.k === k) hide(); }, secs * 1000);
  }
  function hide() { if (!ov) return; const o = ov; ov = null; o.classList.remove('on'); setTimeout(() => o.remove(), 800); }
  function second() {
    if (!SCR) { SCR = document.getElementById('scr'); if (SCR) { draw(); if (DEMO) SCR.insertAdjacentHTML('beforeend', '<div style="position:fixed;left:50%;transform:translateX(-50%);top:.35em;z-index:40;background:#fbbf24;color:#1b1405;font-weight:800;border-radius:999px;padding:.3em 1em;font-size:1.1em">شاشة تجريبية — لا تظهر على الشاشات الحقيقية</div>'); } return; }
    if (!document.body.contains(SCR)) { SCR = null; ov = null; rowsWas = ''; return; }
    // ticker: one line at a time, every 8 seconds
    const tt = document.querySelectorAll('#pp-tick .pp-tt > span');
    if (tt.length > 1 && Math.floor(Date.now() / 1000) % 8 === 0) { tt.forEach(s => s.classList.remove('on')); tt[++tk % tt.length].classList.add('on'); }
    if (ov && ov.dataset.k === 'al') return;
    if (!ov && show.length && Date.now() >= nextAt) {
      const set = settingsFor(D, KEY), secs = Math.max(5, Math.min(60, +set.secs || 15));
      const sl = show[si++ % show.length], dur = sl.kind === 'lapse' ? Math.max(secs, 40) : secs;
      cover(slideHTML(sl, now()), dur, 's' + si);
      if (sl.kind === 'lapse' && ov) runLapse(ov, sl.L, sl.C, dur * 1000);
      nextAt = Date.now() + dur * 1000 + Math.max(1, Math.min(30, +set.every || 3)) * 60000;
    }
  }
  setInterval(second, 1000);
  setInterval(draw, 60000);
  load();
  setInterval(load, DEMO ? 10000 : 3 * 60000);
})();
