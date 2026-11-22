/* Semester choice: الفصل الأول / الثاني / الصيفي, on every page that shows sections.
   The site keeps each semester in data/terms/<id>/ (timetable.json, instructors.json, seats_history.json; see
   scripts/terms.py) and lists them in data/terms/index.json. Without a choice a page reads data/timetable.json and the
   rest: the default semester (the one being taught by the official academic calendar). With a choice (?term=<id>, kept
   for the rest of the visit in this tab) the page's requests for those three files are answered from the chosen
   semester's folder, so every view, count, export and print of the page is of that semester.
   Loaded before the page's own script. */
(function () {
  'use strict';
  const KEY = 'uop-term', ID = /^\d{4}-\d{4}-[123]$/;
  const params = new URLSearchParams(location.search);
  let chosen = params.get('term') || '';
  try {
    if (params.has('term')) chosen ? sessionStorage.setItem(KEY, chosen) : sessionStorage.removeItem(KEY);
    else chosen = sessionStorage.getItem(KEY) || '';
  } catch (e) { /* storage unavailable: the address alone carries the choice */ }
  if (!ID.test(chosen)) chosen = '';

  const nativeFetch = window.fetch.bind(window);
  const FILE = /^(?:\.\/)?data\/(timetable|instructors|seats_history)\.json(\?.*)?$/;
  if (chosen) {
    window.fetch = function (input, init) {
      const m = typeof input === 'string' && FILE.exec(input);
      if (!m) return nativeFetch(input, init);
      // a semester no longer kept: the default semester, and the choice is dropped
      return nativeFetch(`data/terms/${chosen}/${m[1]}.json${m[2] || ''}`, init)
        .then(r => r.ok ? r : (forget(), nativeFetch(input, init)));
    };
    // the page writes its own filters into the address: the semester stays in it, so a shared link opens the same semester
    ['replaceState', 'pushState'].forEach(k => {
      const orig = history[k].bind(history);
      history[k] = function (state, title, url) {
        if (url != null && chosen) {
          const u = new URL(url, location.href);
          if (!u.searchParams.has('term')) { u.searchParams.set('term', chosen); url = u.pathname + u.search + u.hash; }
        }
        return orig(state, title, url);
      };
    });
    if (!params.has('term')) history.replaceState(history.state, '', location.pathname + location.search + location.hash);
  }
  function forget() {
    chosen = '';
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  const SEM = { 1: 'الأول', 2: 'الثاني', 3: 'الصيفي' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' }); };

  function go(id, def) {
    const u = new URL(location.href);
    try { id === def ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    if (id === def) u.searchParams.delete('term'); else u.searchParams.set('term', id);
    // filters of one semester (a section, a page number) may not exist in another
    ['page', 'cell', 'ccell', 'sec'].forEach(k => u.searchParams.delete(k));
    location.href = u.pathname + u.search + u.hash;
  }

  function draw(ix) {
    const host = document.querySelector('.uop-hero .hero-text');
    if (!host || !ix || !ix.terms || !ix.terms.length) return;
    const byId = Object.fromEntries(ix.terms.map(t => [t.id, t]));
    if (chosen && !byId[chosen]) forget();
    const cur = byId[chosen] || byId[ix.default];
    if (!cur) return;
    const maxFac = Math.max(...ix.terms.map(t => t.faculties || 0));
    const year = cur.year, y0 = year.split('/')[0];
    const btn = n => {
      const id = `${y0}-${+y0 + 1}-${n}`, t = byId[id];
      if (!t) return `<button type="button" class="tp-b" disabled title="لم تنشر بوابة الجامعة جدول هذا الفصل بعد"><b>${SEM[n]}</b><small>لم يُنشر بعد</small></button>`;
      const part = t.faculties < maxFac ? ` · ${t.faculties === 1 ? 'كلية واحدة' : t.faculties === 2 ? 'كليتان' : t.faculties + ' كليات'} حتى الآن` : '';
      const tip = `${t.term}: ${t.count} شعبة${part}. ${t.id === ix.portal ? 'تنشره بوابة الجامعة الآن، يُراجَع كل ساعة.' : 'نسخة محفوظة من بوابة الجامعة'} آخر تغيير ${date(t.updated)}.${t.id === ix.default ? ' الفصل الحالي حسب التقويم الجامعي.' : ''}`;
      return `<button type="button" class="tp-b${t.id === cur.id ? ' on' : ''}" data-term="${esc(t.id)}" aria-pressed="${t.id === cur.id}" title="${esc(tip)}">
        <b>${SEM[n]}${t.id === ix.default ? ' <i class="bi bi-dot" aria-hidden="true"></i>' : ''}</b><small>${t.count} شعبة${esc(part)}</small></button>`;
    };
    const others = ix.terms.filter(t => t.year !== year);
    const box = document.createElement('div');
    box.className = 'term-pick no-print';
    box.innerHTML = `<div class="tp-row" role="group" aria-label="الفصل الدراسي">
        <span class="tp-l"><i class="bi bi-calendar3"></i> الفصل الدراسي ${esc(year)}</span>${[1, 2, 3].map(btn).join('')}
        ${others.length ? `<select class="tp-s" aria-label="فصل من سنة أخرى"><option value="">سنة أخرى…</option>${others.map(t => `<option value="${esc(t.id)}">${esc(t.term)} (${t.count} شعبة)</option>`).join('')}</select>` : ''}
      </div>
      ${cur.id !== ix.default && byId[ix.default] ? `<div class="tp-note"><i class="bi bi-info-circle"></i> تعرض هذه الصفحة <b>${esc(cur.term)}</b>${cur.faculties < maxFac ? ` (نشرته البوابة حتى الآن ${cur.faculties === 1 ? "لكلية واحدة" : `لـ${cur.faculties} كليات`} فقط)` : ''}.
        الفصل الحالي حسب التقويم الجامعي: ${esc(byId[ix.default].term)}. <a href="#" data-term="${esc(ix.default)}">العودة إليه</a></div>` : ''}`;
    host.appendChild(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-term]');
      if (!b || b.disabled) return;
      e.preventDefault();
      if (b.dataset.term !== cur.id) go(b.dataset.term, ix.default);
    });
    const s = box.querySelector('.tp-s');
    if (s) s.addEventListener('change', () => s.value && go(s.value, ix.default));
  }

  const css = document.createElement('style');
  css.textContent = `
    .term-pick { margin-top: .55rem; }
    .term-pick .tp-row { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
    .term-pick .tp-l { color: rgba(255,255,255,.8); font-size: .8rem; margin-inline-end: .2rem; white-space: nowrap; }
    .term-pick .tp-b { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.15; min-width: 5.2rem;
      padding: .28rem .8rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.45); background: transparent; color: #fff; cursor: pointer; }
    .term-pick .tp-b b { font-size: .86rem; } .term-pick .tp-b small { font-size: .68rem; opacity: .8; white-space: nowrap; }
    .term-pick .tp-b:hover:not(:disabled) { background: rgba(255,255,255,.12); }
    .term-pick .tp-b.on { background: #fff; color: var(--uop-maroon, #901d23); border-color: #fff; cursor: default; }
    .term-pick .tp-b:disabled { opacity: .45; cursor: not-allowed; }
    .term-pick .tp-b:focus-visible, .term-pick .tp-s:focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }
    .term-pick .tp-b .bi-dot { margin: 0 -.3rem; }
    .term-pick .tp-s { font-size: .78rem; border-radius: 999px; padding: .25rem .7rem; border: 1px solid rgba(255,255,255,.45); background: transparent; color: #fff; }
    .term-pick .tp-s option { color: #000; }
    .term-pick .tp-note { margin-top: .45rem; display: inline-block; font-size: .8rem; background: #fff3cd; color: #5c4400; border-radius: .5rem; padding: .3rem .7rem; }
    .term-pick .tp-note a { color: #5c4400; font-weight: 700; }
    @media print { .term-pick { display: none !important; } }`;
  document.head.appendChild(css);

  const ready = nativeFetch('data/terms/index.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  window.UOP_TERM = { get chosen() { return chosen; }, index: ready };
  const start = () => ready.then(draw);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
