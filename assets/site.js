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
