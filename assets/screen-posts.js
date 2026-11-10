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
  const DEF = { mode: 'on', every: 3, secs: 15, exams: false };
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
  const alertHTML = a => `<div class="pp-slide pp-alert"><i class="bi bi-exclamation-octagon-fill"></i><h3>${esc(a.title)}</h3>${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`;
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
  let D = null, SCR = null, show = [], tick = [], tk = 0, si = 0, nextAt = Date.now() + 20000, ov = null, rowsWas = '';
  const now = () => window.UOP.amman(P.get('at'));
  const load = () => DEMO ? (() => { try { const x = JSON.parse(localStorage.getItem('uop-pp-demo') || 'null'); D = x && x.DATA; } catch (e) { D = null; } draw(); })()
    : fetch('data/screen_posts.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(x => { D = x; draw(); }).catch(() => {});
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
    const old = { u: document.getElementById('pp-urg'), t: document.getElementById('pp-tick') };
    const uHTML = urg.length && set.mode !== 'off' ? urgentHTML(urg) : '', tHTML = tick.length ? tickerHTML(tick) : '';
    if (old.u && old.u.outerHTML !== uHTML) old.u.remove();
    if (uHTML && !document.getElementById('pp-urg')) SCR.querySelector('.scr-top').insertAdjacentHTML('afterend', uHTML);
    if (old.t && old.t.dataset.k !== tHTML.length + tick.map(p => p.id).join()) old.t.remove();
    if (tHTML && !document.getElementById('pp-tick')) { SCR.querySelector('.scr-foot').insertAdjacentHTML('beforebegin', tHTML); const t = document.getElementById('pp-tick'); t.dataset.k = tHTML.length + tick.map(p => p.id).join(); tk = 0; }
    if (uHTML || tHTML || al || show.length) css();
    layout();
    if (al) { cover(alertHTML(al), 0, 'al'); return; }
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
      cover(slideHTML(show[si++ % show.length], now()), secs, 's' + si);
      nextAt = Date.now() + secs * 1000 + Math.max(1, Math.min(30, +set.every || 3)) * 60000;
    }
  }
  setInterval(second, 1000);
  setInterval(draw, 60000);
  load();
  setInterval(load, DEMO ? 10000 : 3 * 60000);
})();
