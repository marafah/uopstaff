/* On every page: the site as an app (offline copy through sw.js, an «ثبّت التطبيق» button where the browser allows
   it, a note when the page shows the kept copy because there is no network) and the light / dark switch. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };

  // ---------------------------------------------------------------- «أبلغ عن خطأ»: an e-mail to the site's maintainer with the record filled in
  const MAINTAINER = 'mohammad.arafah@uop.edu.jo';
  window.reportMail = (what, lines) => `mailto:${MAINTAINER}?subject=${encodeURIComponent('تصحيح بيانات: ' + what)}&body=${encodeURIComponent(
    ['السلام عليكم،', '', 'لاحظت خطأً في البيانات التالية على الموقع:', ...lines.filter(Boolean), `الرابط: ${location.href}`, '', 'التصحيح المطلوب:', '', ''].join('\n'))}`;

  // ---------------------------------------------------------------- light / dark (the choice is applied in <head> before the page draws)
  function theme(t) {
    document.documentElement.dataset.theme = t;
    store.set('uop-theme', t);
    const b = $('#theme-btn');
    if (b) { b.innerHTML = `<i class="bi ${t === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}"></i>`; b.title = t === 'dark' ? 'الوضع الفاتح' : 'الوضع الليلي'; b.setAttribute('aria-label', b.title); }
  }
  const bar = document.querySelector('.uop-topbar .d-flex.align-items-center.gap-2');
  if (bar) {
    bar.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-share btn-icon no-print" id="theme-btn"></button>');
    theme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    $('#theme-btn').addEventListener('click', () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  // ---------------------------------------------------------------- phones: the top bar's tools on one row inside the screen,
  // and nothing pushes the page sideways (Android and iPhone)
  if (!$('#site-mobile-css')) {
    const st = document.createElement('style');
    st.id = 'site-mobile-css';
    st.textContent = `@media (max-width: 575.98px) {
      .uop-topbar .container-fluid > .d-flex.ms-auto { flex-wrap: nowrap; min-width: 0; max-width: 100%; }
      .uop-topbar .uop-search { flex: 1 1 auto; width: auto !important; min-width: 0; }
      .uop-topbar .btn-share { flex: 0 0 auto; padding: .32rem .6rem; }
      .uop-topbar .btn-share > span { display: none !important; }
      input, select, textarea { min-width: 0; max-width: 100%; }
      img, video, canvas { max-width: 100%; }
      body { overflow-wrap: break-word; }
      .rs-pub { grid-template-columns: minmax(0, 1fr) !important; }
      .rs-pub > * { min-width: 0; overflow-wrap: anywhere; }
      /* section tabs: all visible in rows of two instead of a strip that hides some of them sideways */
      .rs-tabs { flex-wrap: wrap !important; overflow-x: visible !important; position: static !important; }
      .uop-topbar .dropdown-menu .dropdown-item { white-space: normal; text-align: start; }
      .uop-topbar .dropdown-menu .dropdown-item span, .uop-topbar .dropdown-menu .dropdown-item b, .uop-topbar .dropdown-menu .dropdown-item small { text-align: start; }
      .sp2-dleg, .staff-contact.one-row { flex-wrap: wrap !important; overflow: visible !important; }
      .rs-seg, .sp2-views { flex-wrap: wrap !important; overflow-x: visible !important; }
      .rs-tabs > button { flex: 1 1 calc(50% - .45rem); min-width: 0; justify-content: center; white-space: normal; font-size: .86rem; padding: .45rem .5rem; line-height: 1.3; }
    }
    @media (max-width: 767.98px) { html, body { overflow-x: clip; } }`;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- one footer for every page: compact, the same layout
  // everywhere; the page's own name, note, figures and source link are kept (the elements other scripts fill move as they are)
  (function unifyFooter() {
    const f = document.querySelector('footer.site-footer');
    if (!f || f.dataset.sf) return;
    const q = s => f.querySelector(s);
    const name = (q('.foot-brand b') || {}).textContent || document.title.split('–')[0].trim();
    const icon = ((q('.foot-logo i') || {}).className || 'bi bi-grid').trim();
    const note = ((q('.foot-col .foot-text') || {}).textContent || '').trim();
    const src = q('.foot-col .foot-link');
    const keep = id => { const e = f.querySelector('#' + id); return e ? e : null; };
    const withId = [...f.querySelectorAll('[id]')].filter(e => e.id !== 'app-install');   // other scripts fill these by id: none may be lost
    const count = keep('foot-count'), upd = keep('foot-updated'), qr = keep('foot-qr'), year = keep('year');
    const people = [...f.querySelectorAll('.credit-line')].map(l => ({ role: (l.querySelector('.credit-role') || {}).textContent.trim(), a: l.querySelector('a') }));
    const disclaimer = ((q('.foot-bottom span:not(.foot-copy):not(#year)') || {}).textContent || '').trim();
    const tag = (cls, ic) => `<span class="sf-chip ${cls}"><i class="bi ${ic}"></i><span class="sf-slot"></span></span>`;
    f.dataset.sf = '1';
    f.innerHTML = `<div class="container-fluid px-4"><div class="sf-row">
        <div class="sf-about"><h6>عن الصفحة</h6>
          <div class="sf-brand"><span class="sf-logo"><i class="${icon}"></i></span><div><b>${name}</b><small>جامعة البترا</small></div></div>
          ${note ? `<p class="sf-note" title="${note.replace(/"/g, '&quot;')}">${note}</p>` : ''}
          <div class="sf-chips">${count ? tag('sf-count', 'bi-collection') : ''}${upd ? tag('sf-upd', 'bi-arrow-repeat') : ''}<span class="sf-src"></span></div>
        </div>
        <div class="sf-team"><h6>فريق العمل</h6><div class="sf-people"></div></div>
        <div class="sf-share-col"><h6>شارك الموقع</h6><div class="sf-share"><span class="sf-qr"></span><div><div class="sf-url" dir="ltr">marafah.github.io/uopstaff</div>
          <p class="sf-hint">امسح الرمز أو شارك الرابط.</p>
          <div class="sf-actions"><button type="button" class="sf-btn" data-bs-toggle="modal" data-bs-target="#shareModal"><i class="bi bi-share-fill"></i> مشاركة</button></div></div></div></div>
      </div></div>
      <div class="sf-bottom"><div class="container-fluid px-4"><span class="sf-disc"><i class="bi bi-info-circle"></i> ${disclaimer}</span><span class="sf-copy">© <span class="sf-year"></span></span></div></div>`;
    const put = (sel, el) => { const box = f.querySelector(sel); if (box && el) box.appendChild(el); };
    put('.sf-count .sf-slot', count); put('.sf-upd .sf-slot', upd); put('.sf-qr', qr); put('.sf-year', year);
    if (src) { src.className = 'sf-link'; put('.sf-src', src); }
    withId.forEach(e => {
      if (f.contains(e)) return;
      if (e.tagName === 'A') { e.className = 'sf-link'; put('.sf-src', e); return; }
      const chip = document.createElement('span'); chip.className = 'sf-chip'; chip.innerHTML = '<i class="bi bi-database"></i>';
      chip.appendChild(e); f.querySelector('.sf-chips').insertBefore(chip, f.querySelector('.sf-src'));
    });
    const pp = f.querySelector('.sf-people');
    // team photos (the same ones the staff directory shows); initials if a photo is missing
    const PHOTO = { 'عرفة': 'assets/photos/71ba67046bdd9507.jpg', 'المقوسي': 'assets/photos/ddeb550f05d31822.jpg' };
    people.forEach(p => {
      if (!p.a) return;
      const nm = p.a.textContent.trim(), key = Object.keys(PHOTO).find(k => nm.includes(k));
      const ini = nm.replace(/^د\.\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join(' ');
      const d = document.createElement('div'); d.className = 'sf-person';
      d.innerHTML = `<span class="sf-av">${key ? `<img src="${PHOTO[key]}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${ini}'))">` : ini}</span><span class="sf-who"></span><small>${p.role}</small>`;
      p.a.className = 'sf-name'; d.querySelector('.sf-who').appendChild(p.a); pp.appendChild(d);
    });
    const st = document.createElement('style');
    st.textContent = `
      footer.site-footer { padding: 0 !important; margin-top: 2.5rem; background: #091b22; color: #c9d4d8; font-size: .86rem; }
      footer.site-footer a { color: #fff; }
      .sf-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1.1fr); gap: 1.6rem; align-items: start; padding: 1.25rem 0 1.1rem; }
      .sf-brand { display: flex; align-items: center; gap: .6rem; }
      .sf-logo { width: 38px; height: 38px; border-radius: 10px; background: #901d23; color: #fff; display: grid; place-items: center; font-size: 1.1rem; flex: none; }
      .sf-brand b { display: block; color: #fff; font-size: 1rem; line-height: 1.2; } .sf-brand small { color: #8fa3ab; font-size: .75rem; }
      .sf-note { margin: .55rem 0 .5rem; color: #b5c3c8; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .sf-chips { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
      .sf-chip { display: inline-flex; align-items: center; gap: .35rem; padding: .18rem .6rem; border-radius: 30px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #e6eef0; font-size: .78rem; white-space: nowrap; }
      .sf-chip i { color: #e0a100; }
      .sf-link { display: inline-flex; align-items: center; gap: .3rem; font-size: .8rem; color: #f3c9cb !important; text-decoration: none; }
      .sf-link:hover { text-decoration: underline; }
      .site-footer h6 { color: #fff; font-size: .8rem; font-weight: 800; letter-spacing: .02em; margin: 0 0 .5rem; padding-bottom: .3rem; border-bottom: 2px solid #901d23; display: inline-block; }
      .sf-people { display: flex; flex-direction: column; gap: .35rem; }
      .sf-person { display: flex; align-items: baseline; justify-content: space-between; gap: .6rem; padding: .4rem .7rem; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
      .sf-name { font-weight: 800; text-decoration: none; } .sf-name:hover { color: #f3c9cb; }
      .sf-person small { color: #8fa3ab; font-size: .74rem; white-space: nowrap; }
      .sf-person { align-items: center; justify-content: flex-start; padding: .35rem .6rem .35rem .7rem; }
      .sf-who { flex: 1 1 auto; min-width: 0; }
      .sf-av { width: 36px; height: 36px; border-radius: 50%; flex: none; overflow: hidden; display: grid; place-items: center; background: #901d23; color: #fff; font-weight: 800; font-size: .8rem; border: 2px solid rgba(255,255,255,.85); box-shadow: 0 2px 6px rgba(0,0,0,.35); }
      .sf-av img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
      .sf-share { display: flex; gap: .8rem; align-items: flex-start; }
      .sf-qr { flex: none; }
      .sf-hint { margin: 0 0 .45rem; color: #8fa3ab; font-size: .76rem; }
      .sf-about h6, .sf-team h6, .sf-share-col h6 { display: table; }
      .sf-share { align-items: center; }
      .sf-qr .foot-qr, .sf-qr button { width: 84px; height: 84px; padding: 4px; border-radius: 10px; background: #fff; border: 0; display: block; }
      .sf-qr svg { width: 100%; height: 100%; display: block; }
      .sf-url { font-weight: 700; color: #fff; font-size: .8rem; margin-bottom: .15rem; }
      .sf-actions { display: flex; flex-wrap: wrap; gap: .35rem; }
      .sf-btn, .sf-actions .btn { display: inline-flex; align-items: center; gap: .3rem; padding: .25rem .7rem !important; margin: 0 !important; border-radius: 30px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; font-size: .78rem; font-weight: 700; }
      .sf-btn:hover, .sf-actions .btn:hover { background: #fff; color: #901d23; }
      .sf-bottom { border-top: 1px solid rgba(255,255,255,.08); background: #071419; }
      .sf-bottom .container-fluid { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: .55rem; padding-bottom: .55rem; font-size: .74rem; color: #8fa3ab; }
      .sf-disc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .sf-copy { white-space: nowrap; flex: none; }
      @media (max-width: 991.98px) { .sf-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .sf-about { grid-column: 1 / -1; } }
      @media (max-width: 575.98px) {
        .sf-row { grid-template-columns: minmax(0, 1fr); gap: 1rem; padding: 1rem 0 .9rem; }
        .sf-qr { display: none; }
        .site-footer h6 { display: none; }
        .sf-note { -webkit-line-clamp: 3; margin: .45rem 0 .4rem; }
        .sf-people { flex-direction: row; flex-wrap: wrap; gap: .25rem .9rem; }
        .sf-person { padding: 0; background: none; border: 0; justify-content: flex-start; gap: .35rem; }
        .sf-person small::after { content: ''; }
        .sf-person { flex-direction: row; align-items: center; gap: .45rem; } .sf-person small { order: 3; }
        .sf-av { width: 30px; height: 30px; }
        .sf-share { display: block; } .sf-url, .sf-hint { display: none; }
        .sf-disc { white-space: normal; } .sf-bottom .container-fluid { flex-direction: column; align-items: flex-start; gap: .25rem; }
      }
      @media print { footer.site-footer { display: none; } }`;
    document.head.appendChild(st);
    // floating buttons in a bottom corner (PDF, sign out) must not sit on the footer's text: keep that side of the footer clear
    const pad = () => {
      const need = { low: [0, 0], high: [0, 0] };   // [right, left] for the bottom line and for the row above it
      document.querySelectorAll('body *').forEach(e => {
        if (f.contains(e) || getComputedStyle(e).position !== 'fixed' || !e.getClientRects().length) return;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if (!r.width || r.top < innerHeight - 170 || cs.visibility === 'hidden' || +cs.opacity === 0) return;
        const k = r.top > innerHeight - 70 ? 'low' : 'high';
        if (r.left > innerWidth - 260) need[k][0] = Math.max(need[k][0], innerWidth - r.left);
        else if (r.right < 260) need[k][1] = Math.max(need[k][1], r.right);
      });
      const set = (c, [rt, lf]) => {
        if (!c) return;
        if (rt) c.style.setProperty('padding-right', (rt + 12) + 'px', 'important'); else c.style.removeProperty('padding-right');
        if (lf) c.style.setProperty('padding-left', (lf + 12) + 'px', 'important'); else c.style.removeProperty('padding-left');
      };
      set(f.querySelector('.sf-bottom .container-fluid'), need.low);
      set(f.querySelector(':scope > .container-fluid'), need.high);
    };
    [800, 2000, 4500].forEach(t => setTimeout(pad, t));
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) pad(); }).observe(f);
    window.addEventListener('load', () => setTimeout(pad, 300));
    window.addEventListener('resize', () => { clearTimeout(pad.t); pad.t = setTimeout(pad, 300); });
  })();

  // ---------------------------------------------------------------- app: offline copy and install
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  const foot = document.querySelector('.sf-actions') || document.querySelector('.foot-share-row > div');
  let prompt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  // no install offer from the browser: it is already installed here, or this browser installs from its own menu
  function installHelp() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const edge = /edg\//i.test(navigator.userAgent);
    const steps = ios
      ? ['افتح الموقع في Safari.', 'اضغط زر المشاركة <i class="bi bi-box-arrow-up"></i> أسفل الشاشة.', 'اختر «إضافة إلى الشاشة الرئيسية».']
      : edge
        ? ['اضغط قائمة المتصفح <b>…</b> أعلى الشاشة.', 'اختر «التطبيقات» ثم «تثبيت هذا الموقع كتطبيق».']
        : ['اضغط قائمة المتصفح <b>⋮</b> أعلى الشاشة.', 'اختر «حفظ ومشاركة» أو «Cast, save and share» ثم «تثبيت الصفحة كتطبيق».'];
    let m = $('#installModal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal fade" id="installModal" tabindex="-1" aria-labelledby="installTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title fw-bold" id="installTitle"><i class="bi bi-download"></i> تثبيت التطبيق</h5><button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
        <div class="modal-body">
          <div class="alert alert-success py-2 small mb-3"><i class="bi bi-check-circle-fill"></i> إذا ظهر لك زر <b>«Open in app»</b> أو <b>«فتح في التطبيق»</b> في شريط العنوان، فالتطبيق مثبّت على هذا الجهاز؛ اضغطه لفتحه، أو افتحه من قائمة البرامج أو الشاشة الرئيسية.</div>
          <p class="fw-bold mb-2">لتثبيته على جهاز جديد:</p><ol class="mb-0" id="installSteps"></ol>
        </div></div></div></div>`);
      m = $('#installModal');
    }
    $('#installSteps').innerHTML = steps.map(x => `<li class="mb-1">${x}</li>`).join('');
    if (window.bootstrap && bootstrap.Modal) bootstrap.Modal.getOrCreateInstance(m).show();
    else alert(steps.map(x => x.replace(/<[^>]+>/g, '')).join('\n'));
  }
  async function install() {
    if (prompt) { prompt.prompt(); await prompt.userChoice.catch(() => {}); prompt = null; return; }
    installHelp();
  }
  // in the top bar beside «مشاركة», only while it fits on one line (otherwise the footer button is enough)
  const share = document.querySelector('.uop-topbar .btn-share[data-bs-target="#shareModal"]');
  // the top bar stays on one line: the button with its label; else icons only (install, then share too) and a
  // narrower search box; else no button in the bar (the footer one stays)
  function fitTop() {
    const b = $('#app-install-top');
    if (!b || !share) return;
    const nav = share.closest('.uop-topbar') || share.parentElement, lab = b.querySelector('span'),
      sLab = share.querySelector('span'), q = share.parentElement.querySelector('.uop-search');
    const set = (on, iconB, iconS, narrow) => {
      b.hidden = !on;
      b.classList.toggle('btn-icon', iconB); if (lab) lab.style.setProperty('display', iconB ? 'none' : '', iconB ? 'important' : '');
      share.classList.toggle('btn-icon', iconS); if (sLab) sLab.style.setProperty('display', iconS ? 'none' : '', iconS ? 'important' : '');
      if (q) q.style.width = narrow ? '150px' : '';
    };
    set(false, false, false, false);
    const row = share.parentElement, h0 = nav.offsetHeight;
    const fits = () => nav.offsetHeight <= h0 + 2 && row.scrollWidth <= row.clientWidth + 1 && (!q || q.offsetWidth >= 120);
    for (const step of [[true, false, false, false], [true, true, false, false], [true, true, true, false], [true, true, true, true]]) {
      set(...step);
      if (fits()) return;
    }
    set(false, false, false, false);
  }
  function installUI() {
    if (standalone()) return;
    if (share && !$('#app-install-top')) {
      share.insertAdjacentHTML('afterend', `<button type="button" class="btn btn-share no-print" id="app-install-top" title="تثبيت الموقع كتطبيق على هذا الجهاز" aria-label="تثبيت التطبيق"><i class="bi bi-download"></i><span class="d-none d-sm-inline"> تثبيت التطبيق</span></button>`);
      $('#app-install-top').addEventListener('click', install);
      fitTop();
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (foot && !$('#app-install')) {
      foot.insertAdjacentHTML('beforeend', `<button type="button" class="sf-btn" id="app-install"><i class="bi bi-download"></i> ثبّت التطبيق</button>`);
      $('#app-install').addEventListener('click', install);
    }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; installUI(); });
  window.addEventListener('appinstalled', () => { const b = $('#app-install'); if (b) b.remove(); });
  window.addEventListener('resize', () => { clearTimeout(fitTop.t); fitTop.t = setTimeout(fitTop, 150); });
  window.addEventListener('load', fitTop);
  installUI();

  // the network is down: say that the page shows the copy kept on this device
  function offline() {
    let n = $('#offline-note');
    if (navigator.onLine) { if (n) n.remove(); return; }
    if (n) return;
    document.body.insertAdjacentHTML('afterbegin', `<div id="offline-note" class="offline-note no-print" role="status"><i class="bi bi-wifi-off"></i> لا يوجد اتصال بالإنترنت — تُعرض آخر نسخة محفوظة على هذا الجهاز.</div>`);
  }
  window.addEventListener('online', offline);
  window.addEventListener('offline', offline);
  offline();
})();

// the wide research menu opens centred under the top bar, so none of its three columns runs off the screen
document.addEventListener('show.bs.dropdown', e => {
  const m = e.target.parentElement && e.target.parentElement.querySelector('.rs-mega');
  if (m) m.style.setProperty('--rs-mega-top', Math.round(e.target.getBoundingClientRect().bottom + 8) + 'px');
});

// ---------------------------------------------------------------- menu: «البحث العلمي» on every page, and the loose links
// (التقويم، الآن، مفكرتي) grouped under «المزيد» to make room in the top bar
(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav || nav.dataset.extra) return;
  nav.dataset.extra = '1';
  const here = location.pathname.split('/').pop() || 'index.html';
  const li = (h, i, b, s) => `<li><a class="dropdown-item${h === here ? ' active' : ''}" href="${h}"><i class="bi ${i}"></i><span><b>${b}</b><small>${s}</small></span></a></li>`;
  const menu = (href, icon, full, short, items, active, mega) => {
    const d = document.createElement('div');
    d.className = 'dropdown site-more';
    d.innerHTML = `<a href="${href}" class="dropdown-toggle${active ? ' active' : ''}" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi ${icon}"></i> `
      + (short ? `<span class="nav-full">${full}</span><span class="nav-short">${short}</span>` : full) + `</a><ul class="dropdown-menu${mega ? ' rs-mega' : ''}">${items}</ul>`;
    return d;
  };
  const RS = [
    ['research.html', 'bi-mortarboard', 'لوحة البحث العلمي', 'ملخص الإنتاج البحثي للجامعة'],
    ['researchers.html', 'bi-person-lines-fill', 'الباحثون', 'بحث وتصفية وترتيب أعضاء الهيئة التدريسية'],
    ['publications.html', 'bi-journal-text', 'المنشورات', 'كل الأبحاث مع روابط التحقق والتصدير'],
    ['compare.html', 'bi-bar-chart-steps', 'المقارنة', 'باحثون أو كليات أو أقسام جنباً إلى جنب'],
    ['jordan.html', 'bi-globe-central-south-asia', 'مقارنة الجامعات الأردنية', 'حسب المجال والتخصص والفترة والتصنيف والمجلات'],
    ['integrity.html', 'bi-shield-exclamation', 'النزاهة البحثية', 'الأبحاث المسحوبة والمجلات المحذوفة من Scopus'],
    ['journals.html', 'bi-journal-bookmark-fill', 'دليل المجلات', 'التصنيف ومدة القرار ومجلات مقترحة لبحثك'],
    ['experts.html', 'bi-person-check', 'ابحث عن خبير', 'باحثو الأردن حسب الموضوع'],
    ['simulator.html', 'bi-sliders', 'محاكي المؤشرات', 'أثر رفع Q1 والتعاون الدولي على الترتيب'],
    ['regulations.html', 'bi-bank2', 'التعليمات والأنظمة', 'نصوص البحث العلمي والترقية والمكافآت الرسمية'],
    ['promotion.html', 'bi-ladder', 'أداة الترقية', 'ما لديك وما ينقصك للترقية'],
    ['reward.html', 'bi-calculator', 'حاسبة المكافأة', 'دعم النشر والحوافز والمشاريع والمؤتمرات'],
    ['award.html', 'bi-trophy', 'جائزة الباحث المتميز', 'نقاطك وترتيبك المتوقع في القسم'],
    ['sabbatical.html', 'bi-calendar-range', 'إجازة التفرغ العلمي', 'الاستحقاق ونقاط المفاضلة'],
    ['projects.html', 'bi-briefcase', 'المشاريع المدعومة', 'مشاريع بحثية دعمتها الجامعة، حسب الدعوة والكلية'],
    ['reports.html', 'bi-calendar2-check', 'التقرير الشهري', 'الأبحاث الجديدة واقتباساتها لكل كلية'],
    ['universities.html', 'bi-bank', 'مؤشرات الجامعات الأسبوعية', 'أعداد Scopus و OpenAlex المحدّثة أسبوعياً'],
    ['network.html', 'bi-diagram-3', 'شبكة التعاون', 'من يكتب مع من داخل الجامعة'],
    ['publish.html', 'bi-signpost-split', 'أين أنشر؟', 'المجلة الأنسب وما يساويه النشر فيها'],
    ['annual.html', 'bi-person-vcard', 'ملفي البحثي', 'تقريرك السنوي الشخصي'],
    ['impact.html', 'bi-stars', 'الأبحاث الأعلى أثراً', 'الأكثر اقتباساً والصاعدة وإنجازات Q1'],
    ['intl.html', 'bi-globe2', 'التعاون الخارجي', 'الدول والمؤسسات الشريكة وشركاء مقترحون'],
    ['dept.html', 'bi-building-gear', 'لوحة الكلية والقسم', 'الإنتاج والجودة وكل الأعضاء'],
    ['dept.html?tab=act', 'bi-bell', 'تنبيه النشاط البحثي', 'من لم يُسجَّل له إنتاج منذ سنوات (م12)'],
    ['goals.html', 'bi-bullseye', 'مؤشرات الأهداف', 'الجامعة والكليات مقابل الأهداف']
  ];
  const RSG = [   // the same columns as scripts/make_research_pages.py
    ['استكشاف الإنتاج البحثي', 'bi-compass', ['research.html', 'researchers.html', 'publications.html', 'impact.html', 'projects.html', 'reports.html']],
    ['المقارنة والتعاون', 'bi-bar-chart-line', ['compare.html', 'jordan.html', 'integrity.html', 'universities.html', 'intl.html', 'network.html', 'simulator.html', 'experts.html']],
    ['أدوات الباحث', 'bi-person-workspace', ['annual.html', 'publish.html', 'journals.html', 'promotion.html', 'reward.html', 'award.html', 'sabbatical.html']],
    ['الإدارة والتعليمات', 'bi-bank2', ['regulations.html', 'dept.html', 'dept.html?tab=act', 'goals.html']]
  ];
  const DESC = { 'calendar.html': 'الفصول والعطل والامتحانات، واشتراك التقويم', 'now.html': 'المحاضرات الجارية والقاعات الشاغرة الآن', 'notes.html': 'ملاحظاتك ومهامك، محفوظة في متصفحك' };
  const loose = [...nav.children].filter(c => c.tagName === 'A');
  let more = null;
  if (loose.length > 1) {
    const items = loose.map(a => {
      const h = a.getAttribute('href'), ic = ((a.querySelector('i') || {}).className || 'bi bi-link').replace(/^bi\s+/, '');
      const t = ((a.querySelector('.nav-full') || a).textContent || '').trim();
      return li(h, ic, t, DESC[h] || '');
    }).join('');
    more = menu('#', 'bi-grid-3x3-gap', 'المزيد', '', items, loose.some(a => a.getAttribute('href') === here));
    loose.forEach(a => a.remove());
    nav.appendChild(more);
  }
  const rsHere = RS.some(r => r[0] === here) || here === 'researcher.html';
  const old = nav.querySelector('a[href="research.html"]');
  if (old) return;   // the page already has the research menu
  nav.insertBefore(menu('research.html', 'bi-mortarboard-fill', 'البحث العلمي', 'البحث', RSG.map(([t, i, fs]) => `<li class="rs-mega-col"><h6 class="rs-mega-h"><i class="bi ${i}"></i> ${t}</h6><ul>`
    + fs.map(f => li(...RS.find(r => r[0] === f))).join('') + '</ul></li>').join(''), rsHere, true), more);
})();


// phones: every top-bar menu opens as a full-width panel under its button, never partly off the screen
(function () {
  const phone = () => matchMedia('(max-width: 575.98px)').matches;
  function place(t) {
    const menu = t.parentElement && t.parentElement.querySelector('.dropdown-menu');
    if (!menu || !t.closest('.uop-topbar')) return;
    if (!phone()) { ['position', 'inset', 'transform', 'max-height', 'width', 'min-width', 'margin'].forEach(p => menu.style.removeProperty(p)); return; }
    const top = Math.round(t.getBoundingClientRect().bottom + 6);
    const set = (p, v) => menu.style.setProperty(p, v, 'important');
    set('position', 'fixed'); set('inset', `${top}px 8px auto 8px`); set('transform', 'none'); set('margin', '0');
    set('width', 'auto'); set('min-width', '0'); set('max-height', `calc(100vh - ${top + 12}px)`);
    menu.style.overflowY = 'auto';
  }
  document.addEventListener('shown.bs.dropdown', e => place(e.target));
  window.addEventListener('resize', () => document.querySelectorAll('.uop-topbar .dropdown-toggle.show').forEach(place));
})();

// phones: a wide table (one that would need sideways scrolling) is shown as a stack of cards, one per row,
// each value with its column name; tables that are grids (row headers, merged cells) keep scrolling sideways
(function () {
  const phone = () => matchMedia('(max-width: 575.98px)').matches;
  const st = document.createElement('style');
  st.textContent = `@media (max-width: 575.98px) {
    table.site-stack, table.site-stack tbody, table.site-stack tfoot, table.site-stack tr, table.site-stack td, table.site-stack tfoot th { display: block; width: 100% !important; min-width: 0 !important; max-width: 100%; }
    table.site-stack thead, table.site-stack colgroup { display: none; }
    table.site-stack tr { border: 1px solid rgba(144,29,35,.18); border-radius: 12px; margin: 0 0 .55rem; padding: .35rem .7rem; background: var(--bs-body-bg, #fff); box-shadow: 0 1px 3px rgba(9,27,34,.06); }
    table.site-stack td, table.site-stack tfoot th { border: 0 !important; padding: .28rem 0 !important; text-align: start !important; white-space: normal !important; position: static !important; overflow-wrap: break-word; }
    table.site-stack td + td, table.site-stack tfoot th + td { border-top: 1px dashed rgba(9,27,34,.1) !important; }
    table.site-stack td[data-label]::before { content: attr(data-label); display: block; margin-bottom: .1rem; font-weight: 700; font-size: .78rem; color: #901d23; }
    table.site-stack tfoot tr { background: rgba(144,29,35,.06); }
    table.site-stack td > * { max-width: 100%; }
    table.site-stack td:empty { display: none; }
    .site-stack-wrap { overflow: visible !important; max-height: none !important; height: auto !important; }
  }`;
  document.head.appendChild(st);
  function stack() {
    if (!phone()) return;
    document.querySelectorAll('main table:not(.no-stack), .container-fluid table:not(.no-stack)').forEach(t => {
      if (t.classList.contains('site-stack')) {   // rows drawn again (a new page, a new sort): label them too
        const L = JSON.parse(t.dataset.stackLabels || '[]');
        t.querySelectorAll('tbody tr, tfoot tr').forEach(r => [...r.cells].forEach((c, i) => { if (L[i] && !c.dataset.label && !c.hasAttribute('colspan')) c.dataset.label = L[i]; }));
        return;
      }
      if (!t.offsetParent || t.closest('.uop-topbar, .modal, .dropdown-menu')) return;
      const box = t.parentElement;
      if (t.scrollWidth <= box.clientWidth + 4) return;
      const head = t.tHead && t.tHead.rows[t.tHead.rows.length - 1];
      if (!head || t.tHead.rows.length > 1) return;
      const labels = [...head.cells].map(c => c.textContent.replace(/[⇅↕↑↓▲▼]/g, '').trim());
      const body = [...t.tBodies].flatMap(b => [...b.rows]), foot = t.tFoot ? [...t.tFoot.rows] : [];
      if (!body.length || body.some(r => r.querySelector('th, [colspan], [rowspan]') && !r.cells[0].hasAttribute('colspan')) ||
          head.querySelector('[colspan], [rowspan]')) return;
      body.concat(foot).forEach(r => { let k = 0; [...r.cells].forEach(c => { const span = +c.getAttribute('colspan') || 1; if (labels[k] && span === 1) c.dataset.label = labels[k]; k += span; }); });
      t.dataset.stackLabels = JSON.stringify(labels);
      t.classList.add('site-stack');
      if (box && /auto|scroll/.test(getComputedStyle(box).overflowX)) box.classList.add('site-stack-wrap');
    });
  }
  let tm = 0;
  const later = () => { clearTimeout(tm); tm = setTimeout(stack, 150); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', later);
  window.addEventListener('load', later);
  later();
})();

// phones: a box that grows wider than the screen because of what it holds (a grid or row whose items will not shrink)
// is allowed to shrink to the screen; checked whenever the page draws new content
(function () {
  const phone = () => matchMedia('(max-width: 575.98px)').matches;
  const skip = e => e.closest('.uop-topbar, table, svg, .modal, .dropdown-menu, .no-fit');
  function fit() {
    if (!phone()) return;
    const W = document.documentElement.clientWidth;
    if (document.body.scrollWidth <= W + 1) return;
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width || (r.right <= W + 1 && r.left >= -1) || skip(el)) continue;
        const p = el.parentElement, pr = p.getBoundingClientRect();
        if (pr.right > W + 1 || pr.left < -1) continue;            // the parent overflows too: fix it first
        let a = p, scroller = false;
        while (a && a !== document.body) { if (/auto|scroll/.test(getComputedStyle(a).overflowX)) { scroller = true; break; } a = a.parentElement; }
        if (scroller) continue;                                      // inside a box that scrolls sideways on purpose
        if (el.style.minWidth !== '0px') { el.style.minWidth = '0'; el.style.maxWidth = '100%'; changed = true; }
        else if (/grid/.test(getComputedStyle(p).display) && !p.dataset.fit) { p.style.gridTemplateColumns = 'minmax(0, 1fr)'; p.dataset.fit = '1'; changed = true; }
      }
      if (!changed || document.body.scrollWidth <= W + 1) break;
    }
  }
  let tm = 0;
  const later = () => { clearTimeout(tm); tm = setTimeout(fit, 400); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', later);
  window.addEventListener('load', later);
  later();
})();
