/* Phones: the site header (brand + search + two rows of menus) is ~185px tall and sticky,
   which would cover a third of a phone screen. On narrow screens it slides away while the
   user scrolls down and comes back as soon as they scroll up (or reach the top). */
(function () {
  'use strict';
  const bar = document.querySelector('.uop-topbar');
  if (!bar) return;
  const mq = matchMedia('(max-width: 767.98px)');
  const st = document.createElement('style');
  st.id = 'mb-css';
  st.textContent = `@media (max-width: 767.98px) {
    .uop-topbar { transition: transform .25s ease, box-shadow .25s; will-change: transform; }
    .uop-topbar.mb-hide { transform: translateY(-100%); box-shadow: none; }
  }`;
  document.head.appendChild(st);
  let last = scrollY, ticking = false;
  const busy = () => bar.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || bar.querySelector('.dropdown-menu.show');
  function update() {
    ticking = false;
    const y = scrollY, h = bar.offsetHeight;
    if (!mq.matches || y < h || busy()) { bar.classList.remove('mb-hide'); last = y; return; }
    if (y > last + 6) bar.classList.add('mb-hide');
    else if (y < last - 6) bar.classList.remove('mb-hide');
    if (Math.abs(y - last) > 6) last = y;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  bar.addEventListener('focusin', () => bar.classList.remove('mb-hide'));
})();
