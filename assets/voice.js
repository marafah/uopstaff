/* Voice search: a microphone in every search box of the site (also the ones a page draws later).
   Arabic first (ar-JO), English on one tap; works in Chrome (Android, desktop), Edge and Safari (iPhone, Mac).
   What is heard is cleaned before it goes into the box: Arabic digits and number words become digits ("سبعة آلاف وأربعمية
   وخمسة" → 7405, "603 102" → 603102), polite fillers and titles are dropped ("ابحث عن الدكتور …"), and the best of the
   recogniser's alternatives is chosen by matching it against the site's own words — course names and numbers, rooms,
   buildings, instructors and staff — so a slightly misheard name is snapped to the real one. */
(function () {
  'use strict';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (window.__uopVoice || !(SR || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia))) return;
  window.__uopVoice = true;

  const LANGS = { ar: ['ar-JO', 'عربي'], en: ['en-US', 'English'] };
  let lang = (() => { try { return localStorage.getItem('uop-voice-lang') || 'ar'; } catch (e) { return 'ar'; } })();
  const setLang = l => { lang = l; try { localStorage.setItem('uop-voice-lang', l); } catch (e) { /* storage unavailable */ } };

  // ------------------------------------------------------------------ text clean-up
  const DIG = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const key = s => norm(s).split(' ').map(w => w.length > 4 ? w.replace(/^(ال|وال|بال|لل)/, '') : w).join(' ');
  // Arabic number words → digits (units, tens, hundreds, thousands; spoken Jordanian forms too)
  const UNITS = { 'صفر': 0, 'واحد': 1, 'واحده': 1, 'احد': 1, 'اثنين': 2, 'اثنان': 2, 'اتنين': 2, 'ثنتين': 2, 'ثلاثه': 3, 'ثلاث': 3, 'تلاته': 3, 'تلات': 3, 'اربعه': 4, 'اربع': 4,
    'خمسه': 5, 'خمس': 5, 'سته': 6, 'ست': 6, 'سبعه': 7, 'سبع': 7, 'ثمانيه': 8, 'ثماني': 8, 'ثمان': 8, 'تمانيه': 8, 'تمنيه': 8, 'تسعه': 9, 'تسع': 9, 'عشره': 10, 'عشر': 10,
    'احدعش': 11, 'احدعشر': 11, 'اثنعش': 12, 'اثناعشر': 12, 'اطنعش': 12 };
  const TENS = { 'عشرين': 20, 'عشرون': 20, 'ثلاثين': 30, 'ثلاثون': 30, 'تلاتين': 30, 'اربعين': 40, 'اربعون': 40, 'خمسين': 50, 'خمسون': 50, 'ستين': 60, 'ستون': 60,
    'سبعين': 70, 'سبعون': 70, 'ثمانين': 80, 'ثمانون': 80, 'تمانين': 80, 'تسعين': 90, 'تسعون': 90 };
  const HUND = { 'ميه': 100, 'مائه': 100, 'مئه': 100, 'ميت': 100, 'مية': 100, 'ميتين': 200, 'مئتين': 200, 'مائتين': 200, 'مئتان': 200, 'مائتان': 200 };
  function numWords(text) {
    const words = text.split(/\s+/), out = [];
    let cur = null, total = 0;
    const flush = () => { if (cur !== null || total) { out.push(String(total + (cur || 0))); cur = null; total = 0; } };
    for (let raw of words) {
      let w = norm(raw).replace(/^و(?=\S{2,})/, '');
      if (/^\d+$/.test(w)) { flush(); out.push(w); continue; }
      let v = null;
      if (w in UNITS) v = UNITS[w];
      else if (w in TENS) v = TENS[w];
      else if (w in HUND) v = HUND[w];
      else { const m = w.match(/^(ثلاث|تلات|اربع|خمس|ست|سبع|ثمان|تمن|تسع)(مايه|ميه|مائه|مئه|ميت|مية)$/); if (m) v = { 'ثلاث': 3, 'تلات': 3, 'اربع': 4, 'خمس': 5, 'ست': 6, 'سبع': 7, 'ثمان': 8, 'تمن': 8, 'تسع': 9 }[m[1]] * 100; }
      if (/^(الف|الاف|آلاف|ألف|ألاف)$/.test(w)) { total += (cur || 1) * 1000; cur = 0; continue; }
      if (v === null) { flush(); out.push(raw); continue; }
      cur = (cur || 0) + v;
    }
    flush();
    return out.join(' ');
  }
  const FILLER = /^(?:(?:لو سمحت|من فضلك|بدي|بدّي|اريد|أريد|ابغى|ابحث|ابحثي|دور|دوري|فتش|اعرض|اظهر|وين|أين|اين|مكان|عن|على|لي|please|search|find|show|where is|where|for|me)\s+)+/i;
  const TITLES = /(^|\s)(?:الدكتوره|الدكتورة|الدكتور|دكتوره|دكتورة|دكتور|الاستاذه|الأستاذة|الاستاذة|الاستاذ|الأستاذ|استاذه|أستاذة|استاذ|أستاذ|المهندسه|المهندس|مهندس|م\.|د\.|أ\.د\.?|ا\.د\.?|dr\.?|doctor|prof\.?|professor|eng\.?|mr\.?|mrs\.?|ms\.?)(?=\s|$)/gi;
  const KINDW = /(^|\s)(?:رقم|نمره|نمرة|number|no\.?)(?=\s|$)/gi;
  function clean(t) {
    let s = String(t || '').replace(/[٠-٩۰-۹]/g, d => DIG[d]).replace(/[.,؟?!،؛]+$/g, '').trim();
    s = s.replace(FILLER, '').replace(TITLES, ' ').replace(KINDW, ' ');
    s = numWords(s);
    // spoken digit groups belong together: "603 102" → 603102, "7 4 0 5" → 7405 (also after a word: "قاعة 74 05")
    s = s.replace(/\b(\d+)(?:\s+(\d+))+\b/g, m => { const j = m.replace(/\s+/g, ''); return j.length <= 8 ? j : m; });
    s = s.replace(/(^|\s)(?:القاعه|القاعة|قاعه|قاعة|الغرفه|الغرفة|غرفه|غرفة|المختبر|مختبر رقم|room|hall|lab)\s+(?=\d)/gi, '$1');   // "قاعة 7405" → 7405
    s = s.replace(/(^|\s)و\s+(?=\S)/g, '$1و');   // "تفاضل و تكامل" → "تفاضل وتكامل"
    return s.replace(/\s+/g, ' ').trim();
  }

  // ------------------------------------------------------------------ the site's own words, to choose and correct
  let LEX = null, lexP = null;
  function loadLex() {
    if (lexP) return lexP;
    const get = u => fetch(u, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    lexP = Promise.all([get('data/timetable.json'), get('data/staff.json')]).then(([tt, sf]) => {
      const phrases = new Map(), codes = new Set();
      const add = (p, w) => { const k = key(p); if (k.length >= 3 && (!phrases.has(k) || phrases.get(k).w < w)) phrases.set(k, { text: String(p).replace(/\s+/g, ' ').trim(), w }); };
      ((tt && tt.sections) || []).forEach(s => {
        if (s.code) codes.add(String(s.code));
        if (s.name) add(String(s.name).replace(/\s*-\s*(نظري|عملي)\s*$/, ''), 3);
        if (s.instructor) add(String(s.instructor).replace(TITLES, ' ').trim(), 3);
        if (s.room) codes.add(String(s.room));
        if (s.building) add(s.building, 2);
      });
      const staff = Array.isArray(sf) ? sf : (sf && (sf.staff || sf.people || sf.items)) || [];
      staff.forEach(p => { const n = p && (p.name || p.ar || p.name_ar); if (n) add(String(n).replace(TITLES, ' ').trim(), 2); });
      const words = new Set(); phrases.forEach((v, k) => k.split(' ').forEach(w => w.length > 2 && words.add(w)));
      LEX = { phrases: [...phrases.entries()], codes, words };
      return LEX;
    });
    return lexP;
  }
  const bigrams = s => { const a = new Map(), t = ' ' + s + ' '; for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); a.set(g, (a.get(g) || 0) + 1); } return a; };
  function dice(a, b) {
    if (!a || !b) return 0; if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b); let both = 0, n = 0;
    A.forEach((v, g) => { both += Math.min(v, B.get(g) || 0); n += v; }); B.forEach(v => { n += v; });
    return 2 * both / n;
  }
  // how well a heard text fits the site: known numbers, known words, and the closest known phrase
  function fit(text) {
    if (!LEX) return { score: 0 };
    const k = key(text), toks = k.split(' ').filter(Boolean);
    let score = 0;
    (text.match(/\d{3,8}/g) || []).forEach(d => { if (LEX.codes.has(d)) score += 3; });
    toks.forEach(w => { if (w.length > 2 && LEX.words.has(w)) score += 1; });
    let best = null, bestSim = 0;
    if (k.length >= 4 && !/^\d+$/.test(k)) {
      for (const [pk, v] of LEX.phrases) {
        if (Math.abs(pk.length - k.length) > Math.max(6, k.length * .6)) continue;
        const sim = dice(k, pk);
        if (sim > bestSim) { bestSim = sim; best = v; }
      }
    }
    return { score: score + bestSim * 2, best, bestSim };
  }
  function pick(alts) {
    const cands = alts.map(a => clean(a)).filter(Boolean);
    if (!cands.length) return '';
    let top = cands[0], topF = fit(top), topS = topF.score + .3;   // the recogniser's first choice gets a small head start
    cands.slice(1).forEach(c => { const f = fit(c); if (f.score > topS) { top = c; topF = f; topS = f.score; } });
    // a near-certain match to a real course, person or building is written the way the site writes it
    if (topF.best && topF.bestSim >= .82 && top.split(' ').length >= 2) return topF.best.text;
    return top;
  }

  // ------------------------------------------------------------------ the listening panel
  let rec = null, target = null, panel = null, alts = [], heard = '', timer = null;
  function ui() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'vz-ov'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'البحث بالصوت');
    panel.innerHTML = `<div class="vz-card">
      <button type="button" class="vz-x" aria-label="إغلاق">✕</button>
      <button type="button" class="vz-big" aria-label="ابدأ أو أوقف الاستماع"><span class="vz-ring"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg></button>
      <div class="vz-st" aria-live="polite"></div>
      <div class="vz-txt" dir="auto"></div>
      <div class="vz-lang" role="group" aria-label="لغة الكلام">${Object.entries(LANGS).map(([k, [, l]]) => `<button type="button" data-vl="${k}">${l}</button>`).join('')}</div>
      <div class="vz-help" hidden></div><button type="button" class="vz-retry" hidden>حاول مرة أخرى</button>
      <p class="vz-tip">قل مثلاً: <b>603102</b> · <b>قاعة 7405</b> · <b>تفاضل وتكامل</b> · <b>محمد عرفة</b> · <b>مبنى الصيدلة</b></p>
    </div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', e => { if (e.target === panel) stop(true); });
    panel.querySelector('.vz-x').onclick = () => stop(true);
    panel.querySelector('.vz-retry').onclick = () => { micOk = false; start(target); };
    panel.querySelector('.vz-big').onclick = () => rec ? rec.stop() : start(target);
    panel.querySelectorAll('[data-vl]').forEach(b => b.onclick = () => { setLang(b.dataset.vl); paintLang(); if (rec) { rec.onend = null; try { rec.abort(); } catch (e) { /* already stopped */ } rec = null; } start(target); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) stop(true); });
    return panel;
  }
  const paintLang = () => panel && panel.querySelectorAll('[data-vl]').forEach(b => b.classList.toggle('on', b.dataset.vl === lang));
  const say = (st, txt, mode) => { const p = ui(); p.querySelector('.vz-st').textContent = st; if (txt != null) p.querySelector('.vz-txt').textContent = txt; p.dataset.mode = mode || ''; };

  // ------------------------------------------------------------------ microphone permission: asked on the first tap, explained when refused
  const UA = navigator.userAgent, IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1), ANDROID = /Android/.test(UA);
  const INAPP = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|; wv\)/.test(UA);
  let micOk = (() => { try { return localStorage.getItem('uop-voice-mic') === '1'; } catch (e) { return false; } })();
  const howTo = () => IOS ? 'على iPhone: اضغط «aA» بجانب العنوان ← «إعدادات موقع الويب» ← «الميكروفون» ← «سماح»، ثم أعد تحميل الصفحة. وتأكد من تفعيل «Siri والإملاء» في إعدادات الهاتف.'
    : ANDROID ? 'على Android: اضغط رمز القفل 🔒 بجانب العنوان ← «الأذونات» ← «الميكروفون» ← «سماح»، ثم أعد تحميل الصفحة.'
    : 'اضغط رمز القفل 🔒 بجانب عنوان الموقع ← «الميكروفون» ← «سماح»، ثم أعد تحميل الصفحة.';
  function helpMsg(kind) {
    const p = ui(), h = p.querySelector('.vz-help');
    const t = kind === 'denied' ? `<b>الميكروفون محجوب لهذا الموقع.</b><span>${howTo()}</span>`
      : kind === 'nosr' ? `<b>البحث بالصوت غير مدعوم في هذا المتصفح.</b><span>${INAPP ? 'أنت داخل متصفح تطبيق (واتساب، فيسبوك…). افتح الرابط في ' + (IOS ? 'Safari' : 'Chrome') + ' من قائمة «⋮» أو «فتح في المتصفح».' : 'استخدم Chrome أو Edge أو Safari.'}</span>`
      : kind === 'ask' ? `<b>${IOS ? 'اضغط «سماح» في النافذة التي ظهرت.' : 'اضغط «سماح» (Allow) في نافذة المتصفح بالأعلى.'}</b><span>يُطلب الإذن مرة واحدة فقط.</span>` : '';
    h.innerHTML = t; h.hidden = !t;
    p.querySelector('.vz-retry').hidden = kind !== 'denied';
  }
  async function permission() {
    if (micOk) return true;
    try { if (navigator.permissions) { const st = await navigator.permissions.query({ name: 'microphone' }); if (st.state === 'granted') { micOk = true; return true; } if (st.state === 'denied') return false; } } catch (e) { /* not supported (Safari) */ }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return true;   // let the recogniser ask by itself
    helpMsg('ask'); say('بانتظار إذن الميكروفون…', '', 'busy');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });   // opens the browser's own permission prompt (phones too)
      s.getTracks().forEach(t => t.stop());   // free the microphone for the recogniser
      micOk = true; try { localStorage.setItem('uop-voice-mic', '1'); } catch (e) { /* storage unavailable */ }
      helpMsg(''); return true;
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return false;
      if (e && e.name === 'NotFoundError') { helpMsg(''); say('لا يوجد ميكروفون متصل بهذا الجهاز.', '', 'err'); return null; }
      helpMsg(''); return true;
    }
  }
  async function start(input) {
    target = input; alts = []; heard = '';
    const p0 = ui(); paintLang(); p0.hidden = false; document.documentElement.classList.add('vz-open'); helpMsg('');
    if (!SR) { say('', '', 'err'); helpMsg('nosr'); return; }
    const ok = await permission();
    if (ok === null) return;
    if (!ok) { say('', '', 'err'); helpMsg('denied'); return; }
    if (p0.hidden) return;   // closed while the prompt was open
    begin();
  }
  function begin() {
    target = input; alts = []; heard = '';
    const p = ui(); paintLang(); p.hidden = false; document.documentElement.classList.add('vz-open');
    say(lang === 'ar' ? 'تحدّث الآن…' : 'Speak now…', '', 'listen');
    loadLex();
    try {
      rec = new SR();
      rec.lang = LANGS[lang][0]; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    } catch (e) { say('تعذّر تشغيل الميكروفون في هذا المتصفح.', '', 'err'); return; }
    rec.onresult = e => {
      let interim = '', fin = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { fin = [...r].map(a => a.transcript); } else interim += r[0].transcript;
      }
      if (fin) { alts = fin; heard = fin[0]; say('لحظة…', heard, 'busy'); } else { heard = interim; say(lang === 'ar' ? 'أسمعك…' : 'Listening…', interim, 'listen'); }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed') { micOk = false; try { localStorage.removeItem('uop-voice-mic'); } catch (x) { /* storage unavailable */ } say('', '', 'err'); helpMsg('denied'); rec = null; return; }
      const m = { 'service-not-allowed': 'التعرّف على الكلام غير متاح في هذا المتصفح. جرّب Chrome أو Safari.',
        'no-speech': 'لم أسمع شيئاً. اضغط الميكروفون وتحدّث.', 'audio-capture': 'لا يوجد ميكروفون متاح.', network: 'تحتاج خدمة التعرّف على الكلام إلى اتصال بالإنترنت.' }[e.error];
      if (m) { say(m, null, 'err'); rec = null; }
    };
    rec.onend = () => {
      rec = null;
      if (panel.dataset.mode === 'err') return;
      if (!alts.length && heard) alts = [heard];
      if (!alts.length) { say('لم أسمع شيئاً. اضغط الميكروفون وتحدّث.', '', 'err'); return; }
      (LEX ? Promise.resolve() : Promise.race([loadLex(), new Promise(r => setTimeout(r, 1500))])).then(() => {
        const text = pick(alts);
        say('✓', text, 'done');
        fill(target, text);
        clearTimeout(timer); timer = setTimeout(() => stop(false), 650);
      });
    };
    try { rec.start(); } catch (e) { /* already started */ }
  }
  function stop(cancel) {
    clearTimeout(timer);
    if (rec) { rec.onend = null; try { rec.abort(); } catch (e) { /* already stopped */ } rec = null; }
    if (panel) panel.hidden = true;
    document.documentElement.classList.remove('vz-open');
    if (!cancel && target) { try { target.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
  }
  function fill(input, text) {
    if (!input || !input.isConnected) {   // the page redrew the box while we listened: use the one now in its place
      input = (target && target.id && document.getElementById(target.id)) || document.querySelector('#pg-q');
      if (!input) return;
    }
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ------------------------------------------------------------------ a mic in every search box
  const SEL = 'input[type="search"], input.uop-search, input[id$="-q"], input[placeholder*="ابحث"], input[placeholder*="بحث"], input[data-voice]';
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>';
  const ro = window.ResizeObserver ? new ResizeObserver(es => es.forEach(e => place(e.target))) : null;
  function place(input) {
    const b = input.__vz; if (!b || !b.isConnected) return;
    const h = input.offsetHeight, sz = Math.max(22, Math.min(34, h - 6));
    b.style.width = b.style.height = sz + 'px';
    b.style.top = (input.offsetTop + (h - sz) / 2) + 'px';
    const rtl = getComputedStyle(input).direction === 'rtl';
    b.style.left = rtl ? (input.offsetLeft + 4) + 'px' : (input.offsetLeft + input.offsetWidth - sz - 4) + 'px';
    b.hidden = !input.offsetParent || input.disabled;
  }
  function attach(input) {
    if (input.__vz && input.__vz.isConnected) return;
    if (input.type && !/^(search|text|)$/.test(input.type)) return;
    if (input.closest('[data-novoice]') || input.readOnly) return;
    const host = input.parentElement; if (!host) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vz-mic'; b.innerHTML = MIC;
    b.title = 'ابحث بالصوت (عربي / English)'; b.setAttribute('aria-label', 'البحث بالصوت');
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); start(input); });
    input.insertAdjacentElement('afterend', b);
    input.__vz = b;
    input.classList.add('vz-has');
    place(input);
    if (ro) ro.observe(input);
  }
  let scanT = null;
  const scan = () => { clearTimeout(scanT); scanT = setTimeout(() => document.querySelectorAll(SEL).forEach(attach), 60); };
  const mo = new MutationObserver(scan);
  const boot = () => { scan(); mo.observe(document.body, { childList: true, subtree: true }); addEventListener('resize', () => document.querySelectorAll('.vz-has').forEach(place)); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();

  document.head.insertAdjacentHTML('beforeend', `<style id="vz-css">
    .vz-has { padding-inline-end: 2.3rem !important; }
    .vz-mic { position: absolute; z-index: 3; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #901d23; cursor: pointer; transition: background .15s, transform .15s; }
    .vz-mic svg { width: 62%; height: 62%; fill: currentColor; } .vz-mic:hover { background: rgba(144,29,35,.1); transform: scale(1.08); } .vz-mic:focus-visible { outline: 2px solid #901d23; outline-offset: 1px; }
    .uop-search ~ .vz-mic, .site-header .vz-mic, header .vz-mic { color: #fff; } .uop-search ~ .vz-mic:hover { background: rgba(255,255,255,.18); }
    .vz-ov { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; background: rgba(9,27,34,.55); backdrop-filter: blur(3px); padding: 1rem; }
    .vz-ov[hidden] { display: none; } html.vz-open { overflow: hidden; }
    .vz-card { position: relative; width: min(440px, 100%); background: #fff; border-radius: 22px; padding: 1.6rem 1.2rem 1.1rem; text-align: center; box-shadow: 0 24px 60px rgba(0,0,0,.3); direction: rtl; font-family: inherit; }
    .vz-x { position: absolute; top: .6rem; inset-inline-start: .7rem; border: 0; background: #f3f4f6; width: 32px; height: 32px; border-radius: 50%; font-size: .9rem; color: #374151; cursor: pointer; }
    .vz-big { position: relative; width: 92px; height: 92px; border-radius: 50%; border: 0; background: linear-gradient(135deg, #901d23, #6e151a); color: #fff; cursor: pointer; display: grid; place-items: center; margin: .2rem auto .8rem; box-shadow: 0 10px 26px rgba(144,29,35,.35); }
    .vz-big svg { width: 42px; height: 42px; fill: currentColor; position: relative; z-index: 1; }
    .vz-ring { position: absolute; inset: 0; border-radius: 50%; border: 3px solid rgba(144,29,35,.45); opacity: 0; }
    .vz-ov[data-mode="listen"] .vz-ring { animation: vz-p 1.3s ease-out infinite; }
    .vz-ov[data-mode="done"] .vz-big { background: linear-gradient(135deg, #15803d, #0f5f2e); } .vz-ov[data-mode="err"] .vz-big { background: linear-gradient(135deg, #64748b, #334155); }
    @keyframes vz-p { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.55); opacity: 0; } }
    .vz-st { font-weight: 800; color: #091b22; font-size: 1.05rem; min-height: 1.5em; } .vz-ov[data-mode="err"] .vz-st { color: #b42318; font-size: .92rem; }
    .vz-txt { min-height: 2.2em; margin: .4rem 0 .8rem; font-size: 1.25rem; font-weight: 700; color: #0b4a66; line-height: 1.4; word-break: break-word; }
    .vz-lang { display: inline-flex; gap: 2px; background: #f3f1ea; border-radius: 99px; padding: 3px; }
    .vz-lang button { border: 0; background: none; padding: .35rem 1rem; border-radius: 99px; font-weight: 700; font-size: .85rem; color: #0b4a66; cursor: pointer; } .vz-lang button.on { background: #0b4a66; color: #fff; }
    .vz-help { margin: .2rem 0 .8rem; padding: .7rem .8rem; background: #fff7e6; border: 1px solid #f5d48a; border-radius: 12px; text-align: start; font-size: .84rem; line-height: 1.8; color: #5b4300; }
    .vz-help b { display: block; color: #7a3d00; margin-bottom: .15rem; } .vz-help[hidden] { display: none; }
    .vz-retry { display: block; margin: 0 auto .7rem; border: 0; background: #901d23; color: #fff; font-weight: 700; border-radius: 10px; padding: .45rem 1.2rem; cursor: pointer; } .vz-retry[hidden] { display: none; }
    .vz-tip { margin: .8rem 0 0; font-size: .74rem; color: #6b7280; line-height: 1.8; } .vz-tip b { color: #901d23; font-weight: 700; white-space: nowrap; }
    @media (max-width: 576px) { .vz-ov { align-items: flex-end; padding: 0; } .vz-card { border-radius: 22px 22px 0 0; padding-bottom: calc(1.2rem + env(safe-area-inset-bottom)); } .vz-mic { min-width: 30px; min-height: 30px; } }
    @media print { .vz-mic, .vz-ov { display: none !important; } }
  </style>`);
})();
