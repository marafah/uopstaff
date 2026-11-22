/* Semester choice (الفصل الأول / الثاني / الصيفي) for the pages that show the sections of a semester.
   The site keeps each semester in data/terms/<id>/ (timetable.json, instructors.json, seats_history.json; see
   scripts/terms.py) and lists them in data/terms/index.json. Without a choice a page reads data/timetable.json and the
   rest: the default semester (the one being taught by the official academic calendar). With a choice (?term=<id>, kept
   for the rest of the visit in this tab) the page's requests for those three files are answered from the chosen
   semester's folder, so every view, count, export and print of the page is of that semester.

   Each page puts the choice among its own filters, in its own style: UOP_TERM.field() (a labelled select, like the
   other filters), UOP_TERM.select(cls) (a select alone) or UOP_TERM.options() (the <option>s, for a page's own select
   with the attribute data-uop-term). Choosing a semester reloads the page in that semester.
   Loaded before the page's own script; the page's data requests wait for the semester list, so the choice is ready
   when the page draws. */
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
  let IX = null;
  const ready = nativeFetch('data/terms/index.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).catch(() => null)
    .then(ix => {
      IX = ix && ix.terms && ix.terms.length ? ix : null;
      if (chosen && (!IX || !IX.terms.some(t => t.id === chosen))) forget();  // a semester no longer kept
      if (IX && chosen === IX.default) forget();
      return IX;
    });

  const FILE = /^(?:\.\/)?data\/(timetable|instructors|seats_history)\.json(\?.*)?$/;
  window.fetch = function (input, init) {
    const m = typeof input === 'string' && FILE.exec(input);
    if (!m) return nativeFetch(input, init);
    return ready.then(() => chosen
      ? nativeFetch(`data/terms/${chosen}/${m[1]}.json${m[2] || ''}`, init).then(r => r.ok ? r : (forget(), nativeFetch(input, init)))
      : nativeFetch(input, init));
  };
  // the page writes its own filters into the address: the semester stays in it, so a shared link opens the same semester
  ['replaceState', 'pushState'].forEach(k => {
    const orig = history[k].bind(history);
    history[k] = function (state, title, url) {
      if (url != null) {
        const u = new URL(url, location.href);
        if (chosen) u.searchParams.set('term', chosen); else u.searchParams.delete('term');
        url = u.pathname + u.search + u.hash;
      }
      return orig(state, title, url);
    };
  });
  function forget() {
    chosen = '';
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    if (params.has('term')) history.replaceState(history.state, '', location.pathname + location.search + location.hash);
  }
  if (chosen && !params.has('term')) history.replaceState(history.state, '', location.pathname + location.search + location.hash);

  const SEM = { 1: 'الفصل الأول', 2: 'الفصل الثاني', 3: 'الفصل الصيفي' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const current = () => chosen || (IX && IX.default) || '';

  // the <option>s: the three semesters of the shown semester's academic year (one not published yet is listed, disabled),
  // then the kept semesters of other years
  function options() {
    if (!IX) return '';
    const byId = Object.fromEntries(IX.terms.map(t => [t.id, t]));
    const cur = byId[current()] || IX.terms[0];
    const maxFac = Math.max(...IX.terms.map(t => t.faculties || 0));
    const [y0, y1] = cur.id.split('-');
    const yearName = cur.term.replace(/^.*?(\d{4}\s*\/\s*\d{4}).*$/, '$1');
    const opt = t => {
      const note = [t.id === IX.default ? 'الحالي' : '',
        t.faculties < maxFac ? (t.faculties === 1 ? 'كلية واحدة حتى الآن' : t.faculties === 2 ? 'كليتان حتى الآن' : `${t.faculties} كليات حتى الآن`) : '']
        .filter(Boolean).join('، ');
      return `<option value="${esc(t.id)}" ${t.id === cur.id ? 'selected' : ''}>${esc(t.term)}${note ? ` (${esc(note)})` : ''}</option>`;
    };
    const year = [1, 2, 3].map(n => byId[`${y0}-${y1}-${n}`] ? opt(byId[`${y0}-${y1}-${n}`])
      : `<option disabled>${SEM[n]} ${esc(yearName)} (لم يُنشر بعد)</option>`).join('');
    return year + IX.terms.filter(t => !t.id.startsWith(`${y0}-${y1}-`)).map(opt).join('');
  }
  const select = (cls, id) => IX ? `<select class="form-select form-select-sm ${cls || ''}" ${id ? `id="${id}"` : ''} data-uop-term title="الفصل الدراسي" aria-label="الفصل الدراسي">${options()}</select>` : '';
  // like the pages' other filters: a small bold label above the select
  const field = (labelCls, wrapCls) => IX ? `<div class="${wrapCls || ''}"><label class="small fw-bold ${labelCls || ''}" for="uop-term">الفصل الدراسي</label>${select('', 'uop-term')}</div>` : '';

  function go(id) {
    const def = IX && IX.default;
    try { id === def ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    chosen = id === def ? '' : id;
    const u = new URL(location.href);
    if (chosen) u.searchParams.set('term', chosen); else u.searchParams.delete('term');
    // filters of one semester (a section, a page number) may not exist in another
    ['page', 'cell', 'ccell', 'sec', 's'].forEach(k => u.searchParams.delete(k));
    location.href = u.pathname + u.search + u.hash;
  }
  document.addEventListener('change', e => {
    const s = e.target.closest && e.target.closest('select[data-uop-term]');
    if (!s || !s.value || s.value === current()) return;
    const was = current();
    go(s.value);
    // the page may keep its unsaved work (it asks before leaving): the select then shows the semester still shown
    setTimeout(() => { chosen = IX && was === IX.default ? '' : was; s.value = was; }, 1500);
  });

  window.UOP_TERM = { get chosen() { return chosen; }, get current() { return current(); }, index: ready, options, select, field };
})();
