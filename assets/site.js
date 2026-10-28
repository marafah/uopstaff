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

  // ---------------------------------------------------------------- app: offline copy and install
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  const foot = document.querySelector('.foot-share-row > div');
  let prompt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function installUI() {
    if (!foot || standalone() || $('#app-install')) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !prompt;
    if (!prompt && !ios) return;
    foot.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-sm btn-light mt-2 ms-1" id="app-install"><i class="bi bi-phone"></i> ثبّت التطبيق</button>`);
    $('#app-install').addEventListener('click', async () => {
      if (prompt) { prompt.prompt(); await prompt.userChoice.catch(() => {}); prompt = null; $('#app-install').remove(); return; }
      alert('للتثبيت على iPhone: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية».');
    });
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; installUI(); });
  window.addEventListener('appinstalled', () => { const b = $('#app-install'); if (b) b.remove(); });
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

// ---------------------------------------------------------------- menu: «البحث العلمي» on every page, and the loose links
// (التقويم، الآن، مفكرتي) grouped under «المزيد» to make room in the top bar
(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav || nav.dataset.extra) return;
  nav.dataset.extra = '1';
  const here = location.pathname.split('/').pop() || 'index.html';
  const li = (h, i, b, s) => `<li><a class="dropdown-item${h === here ? ' active' : ''}" href="${h}"><i class="bi ${i}"></i><span><b>${b}</b><small>${s}</small></span></a></li>`;
  const menu = (href, icon, full, short, items, active) => {
    const d = document.createElement('div');
    d.className = 'dropdown site-more';
    d.innerHTML = `<a href="${href}" class="dropdown-toggle${active ? ' active' : ''}" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi ${icon}"></i> `
      + (short ? `<span class="nav-full">${full}</span><span class="nav-short">${short}</span>` : full) + `</a><ul class="dropdown-menu">${items}</ul>`;
    return d;
  };
  const RS = [
    ['research.html', 'bi-mortarboard', 'لوحة البحث العلمي', 'ملخص الإنتاج البحثي للجامعة'],
    ['researchers.html', 'bi-person-lines-fill', 'الباحثون', 'بحث وتصفية وترتيب أعضاء الهيئة التدريسية'],
    ['publications.html', 'bi-journal-text', 'المنشورات', 'كل الأبحاث مع روابط التحقق والتصدير'],
    ['compare.html', 'bi-bar-chart-steps', 'المقارنة', 'باحثون أو كليات أو أقسام جنباً إلى جنب'],
    ['universities.html', 'bi-bank', 'الجامعات الأردنية', 'موقع البترا بين الجامعات الأردنية'],
    ['network.html', 'bi-diagram-3', 'شبكة التعاون', 'من يكتب مع من داخل الجامعة']
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
  if (old) old.closest('.dropdown, a').remove();
  nav.insertBefore(menu('research.html', 'bi-mortarboard-fill', 'البحث العلمي', 'البحث', RS.map(r => li(...r)).join(''), rsHere), more);
})();
