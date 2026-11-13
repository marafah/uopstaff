/* «سحب خطط طلابي»: runs on the university portal (edugate.uop.edu.jo/staff/studentPlan), started from the bookmark that
   «مكتب الإرشاد» gives the advisor. The advisor signs in to the portal as usual; this script never sees or asks for the
   password. It walks the portal's own list of the advisor's students and, for each one, asks the portal for the printed
   «تحليل خطة الطالب» (the same PDF its «طباعة» button gives), then hands the file to the advising page of the site, opened
   in another tab, through the browser (window.postMessage). Nothing goes to any server other than the portal itself. */
(function () {
  'use strict';
  if (window.__uopImport) { window.__uopImport.show(); return; }
  const SRC = (document.currentScript && document.currentScript.src) || 'https://marafah.github.io/uopstaff/assets/edugate-import.js';
  const SITE = new URL('../', SRC).href;                 // the site's root, beside assets/
  const SITE_ORIGIN = new URL(SITE).origin;
  const TARGET = SITE + 'advising.html?view=import&from=edugate';
  const $ = (s, r) => (r || document).querySelector(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const onPlanPage = /\/staff\/studentPlan/.test(location.pathname) && $('[id="contents:sectionsTable"]');

  // ---------------------------------------------------------------- the panel shown over the portal page
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    .bg { position: fixed; inset: 0; background: rgba(9,27,34,.55); display: flex; align-items: center; justify-content: center; font-family: Tajawal, "Segoe UI", Tahoma, Arial, sans-serif; direction: rtl; }
    .card { width: min(560px, calc(100vw - 32px)); background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35); overflow: hidden; color: #1f2328; }
    .hd { background: linear-gradient(135deg,#901d23,#6b141a); color: #fff; padding: 16px 20px; display: flex; align-items: center; gap: 10px; }
    .hd b { font-size: 18px; } .hd small { display: block; opacity: .85; font-size: 12px; margin-top: 2px; }
    .x { margin-inline-start: auto; background: rgba(255,255,255,.18); border: 0; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px; }
    .bd { padding: 18px 20px 20px; }
    .steps { display: flex; gap: 6px; margin-bottom: 14px; } .steps span { flex: 1; text-align: center; font-size: 12px; padding: 6px 4px; border-radius: 8px; background: #f3f1ea; color: #4a4f57; }
    .steps span.on { background: #901d23; color: #fff; font-weight: 700; } .steps span.ok { background: #e5f4ea; color: #14532d; }
    p { margin: 0 0 10px; line-height: 1.7; font-size: 14px; }
    .note { font-size: 12.5px; background: #f6f8fa; border: 1px solid #e3e6ea; border-radius: 10px; padding: 8px 10px; color: #2b3036; }
    .big { font-size: 34px; font-weight: 800; color: #901d23; }
    .btn { display: block; width: 100%; border: 0; border-radius: 10px; padding: 12px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 12px; }
    .go { background: #901d23; color: #fff; } .go:hover { background: #7a171d; } .ghost { background: #f3f1ea; color: #1f2328; }
    .bar { height: 14px; background: #eee9dc; border-radius: 99px; overflow: hidden; margin: 10px 0 6px; } .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#0f766e,#15803d); transition: width .3s; }
    .nums { display: flex; justify-content: space-between; font-size: 13px; color: #2b3036; } .nums b { color: #1f2328; }
    .now { font-size: 13px; color: #3b4048; min-height: 20px; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 10px; } .grid div { border: 1px solid #e3ddcf; border-radius: 10px; padding: 8px; text-align: center; }
    .grid b { display: block; font-size: 22px; } .grid span { font-size: 12px; color: #3b4048; }
    .g b { color: #15803d; } .r b { color: #b42318; } .y b { color: #92400e; }
    .err { font-size: 12.5px; color: #7a1414; background: #fdf0f0; border: 1px solid #e9a2a2; border-radius: 10px; padding: 8px 10px; margin-top: 10px; max-height: 120px; overflow: auto; }
  </style><div class="bg"><div class="card"><div class="hd"><div><b>سحب خطط طلابي</b><small>مكتب الإرشاد · بوصلة البترا</small></div><button class="x" title="إغلاق">×</button></div><div class="bd" id="bd"></div></div></div>`;
  document.body.appendChild(host);
  const bd = root.getElementById('bd');
  root.querySelector('.x').onclick = () => { if (!running || confirm('إيقاف السحب؟ يُحفظ ما سُحب حتى الآن.')) { stop = true; host.remove(); window.__uopImport = null; } };
  const steps = n => `<div class="steps">${['تسجيل الدخول', 'التأكيد', 'السحب', 'اكتمل'].map((t, i) => `<span class="${i < n ? 'ok' : i === n ? 'on' : ''}">${i < n ? '✓ ' : ''}${t}</span>`).join('')}</div>`;
  const privacy = '<div class="note">🔒 تسجيل الدخول يتم في بوابة الجامعة نفسها؛ لا يرى الموقع اسم المستخدم ولا كلمة المرور ولا يحفظهما. تُنقل الخطط من هذه الصفحة إلى صفحة «مكتب الإرشاد» داخل متصفحك مباشرة، وتُحفظ على جهازك فقط.</div>';
  let running = false, stop = false;

  if (!onPlanPage) {
    const onPortal = /(^|\.)edugate\.uop\.edu\.jo$/.test(location.hostname);
    const signedIn = onPortal && /\/staff/.test(location.pathname) && !$('input[type=password]');
    bd.innerHTML = steps(signedIn ? 1 : 0) + (!onPortal
      ? `<p><b>هذا الزر يعمل داخل بوابة الجامعة، لا في هذه الصفحة.</b></p><ol style="margin:0 0 12px;padding-inline-start:20px;line-height:1.9"><li>افتح بوابة المدرس (الزر أدناه) وسجّل الدخول كالمعتاد.</li><li>من القائمة افتح «المرشد الأكاديمي ← خطة الطالب» (قائمة طلابك).</li><li>وأنت على تلك الصفحة اضغط «سحب الخطط» في شريط المفضلة.</li></ol><button class="btn go" id="portal">افتح بوابة المدرس</button>`
      : signedIn
      ? `<p>أنت مسجّل الدخول. افتح قائمة طلابك في «الإرشاد الأكاديمي ← خطة الطالب» ثم اضغط زر «سحب الخطط» مرة أخرى.</p><button class="btn go" id="open">افتح قائمة طلابي</button>`
      : `<p>سجّل الدخول إلى البوابة باسم المستخدم وكلمة المرور كالمعتاد، ثم اضغط زر «سحب الخطط» مرة أخرى.</p><button class="btn ghost" id="close">حسناً</button>`) + privacy;
    const o = root.getElementById('open'); if (o) o.onclick = () => { location.href = '/staff/studentPlan'; };
    const pt = root.getElementById('portal'); if (pt) pt.onclick = () => { window.open('https://edugate.uop.edu.jo/staff/studentPlan', '_blank', 'noopener'); host.remove(); window.__uopImport = null; };
    const c = root.getElementById('close'); if (c) c.onclick = () => { host.remove(); window.__uopImport = null; };
    window.__uopImport = { show() { document.body.appendChild(host); } };
    return;
  }

  const W = window.PrimeFaces && PrimeFaces.widgets.widget_contents_sectionsTable;
  const total = W && W.paginator ? W.paginator.cfg.rowCount : document.querySelectorAll('[id="contents:sectionsTable_data"] > tr').length;
  bd.innerHTML = steps(1) + `<p>في قائمتك على البوابة:</p><div class="big">${total} طالباً</div>
    <p>ستُسحب «تحليل خطة الطالب» لكل منهم كما تطبعه البوابة، ثم تُفتح صفحة «استيراد الخطط» في تبويب جديد وتظهر فيها الخطط أولاً بأول. يستغرق السحب نحو ${Math.max(1, Math.round(total * 2.2 / 60))} دقيقة؛ أبقِ هذا التبويب مفتوحاً.</p>
    ${privacy}<button class="btn go" id="start">تأكيد وابدأ السحب</button>`;
  root.getElementById('start').onclick = start;
  window.__uopImport = { show() { document.body.appendChild(host); } };

  // ---------------------------------------------------------------- the portal's own steps, one student at a time
  const ajaxDone = (ms) => new Promise(res => {
    const h = () => { window.jQuery(document).off('pfAjaxComplete', h); setTimeout(() => res(true), 60); };
    window.jQuery(document).on('pfAjaxComplete', h);
    setTimeout(() => { window.jQuery(document).off('pfAjaxComplete', h); res(false); }, ms || 20000);
  });
  const rows = () => [...document.querySelectorAll('[id="contents:sectionsTable_data"] > tr')].filter(r => r.querySelector('button'));
  const cellText = (r, i) => (r.cells[i] ? r.cells[i].innerText.trim() : '');
  async function fetchPlan(row) {
    let p = ajaxDone(); row.querySelector('button').click(); await p;                      // the row's magnifier: shows the student's panels
    const an = [...document.querySelectorAll('.ui-panel')].find(x => /^تحليل الخطة/.test((x.querySelector('.ui-panel-titlebar') || {}).innerText || ''));
    if (!an || !an.querySelector('a')) throw new Error('لم يظهر زر «تحليل الخطة»');
    p = ajaxDone(); an.querySelector('a').click(); await p;                                // «تحليل الخطة»
    const pb = [...document.querySelectorAll('[id="contents:masterPanel"] button')].find(b => /طباعة/.test(b.innerText));
    if (!pb) throw new Error('لم يظهر زر «طباعة»');
    await new Promise(res => PrimeFaces.ab({ s: pb.id, oncomplete: () => res() }));       // «طباعة»: the portal prepares the report
    const a = document.getElementById('contents:viewReport');
    const r = await fetch(a.href, { cache: 'no-store' });
    const buf = await r.arrayBuffer();
    const head = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
    if (!r.ok || head !== '%PDF-') throw new Error('لم تُرجع البوابة ملف PDF');
    return buf;
  }

  // ---------------------------------------------------------------- the advising page in the other tab
  let site = null;
  const replies = {};
  window.addEventListener('message', e => {
    if (e.origin !== SITE_ORIGIN || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'uop-ready') replies.ready && replies.ready();
    if (e.data.type === 'uop-ack' && replies[e.data.id]) replies[e.data.id](e.data);
  });
  function openSite() {
    site = window.open(TARGET, 'uop-advising');
    return new Promise((res, rej) => {
      if (!site) return rej(new Error('popup'));
      const t = setInterval(() => { try { site.postMessage({ type: 'uop-hello', total }, SITE_ORIGIN); } catch (e) { /* not loaded yet */ } }, 700);
      replies.ready = () => { clearInterval(t); res(); };
      setTimeout(() => { clearInterval(t); rej(new Error('timeout')); }, 45000);
    });
  }
  const send = (msg, transfer) => new Promise(res => {
    replies[msg.id] = d => { delete replies[msg.id]; res(d); };
    site.postMessage(msg, SITE_ORIGIN, transfer || []);
    setTimeout(() => { if (replies[msg.id]) { delete replies[msg.id]; res({ ok: false, reason: 'لم تردّ صفحة مكتب الإرشاد' }); } }, 60000);
  });

  async function start() {
    running = true;
    bd.innerHTML = steps(2) + '<p>جارٍ فتح صفحة «استيراد الخطط» في تبويب جديد…</p>';
    try { await openSite(); } catch (e) {
      running = false;
      bd.innerHTML = steps(1) + `<div class="err">${e.message === 'popup' ? 'منع المتصفح فتح التبويب الجديد. اسمح بالنوافذ المنبثقة لهذا الموقع (رمز في شريط العنوان) ثم اضغط الزر مرة أخرى.' : 'لم تُفتح صفحة «مكتب الإرشاد». تحقّق من الاتصال ثم أعد المحاولة.'}</div><button class="btn go" id="start">إعادة المحاولة</button>`;
      root.getElementById('start').onclick = start;
      return;
    }
    bd.innerHTML = steps(2) + `<div class="bar"><i id="bar"></i></div><div class="nums"><span>اكتمل <b id="done">0</b> من <b>${total}</b></span><span id="eta"></span><span>المتبقي <b id="left">${total}</b></span></div>
      <div class="now" id="now"></div><div class="grid"><div class="g"><b id="ok">0</b><span>مطابقة وكاملة</span></div><div class="y"><b id="retry">0</b><span>أُعيدت</span></div><div class="r"><b id="bad">0</b><span>تعذّرت</span></div></div>
      <div id="errs"></div><button class="btn ghost" id="stop">إيقاف</button>`;
    root.getElementById('stop').onclick = () => { stop = true; };
    const q = id => root.getElementById(id);
    let done = 0, ok = 0, bad = 0, retried = 0;
    const errs = [], t0 = Date.now();
    const pages = W && W.paginator ? null : 1;
    let p = ajaxDone(8000);
    if (W && W.paginator && W.paginator.cfg.rows < 30) { W.paginator.setRowsPerPage(30); await p; }
    const nPages = W && W.paginator ? Math.ceil(W.paginator.cfg.rowCount / W.paginator.cfg.rows) : pages;
    for (let pg = 0; pg < nPages && !stop; pg++) {
      if (W && W.paginator && W.paginator.cfg.page !== pg) { p = ajaxDone(); W.paginator.setPage(pg); await p; }
      const list = rows();
      for (let i = 0; i < list.length && !stop; i++) {
        const r = rows()[i];
        const meta = { id: cellText(r, 1), name: cellText(r, 2), major: cellText(r, 3), dept: cellText(r, 4), gpa: cellText(r, 5) };
        q('now').textContent = `${meta.name} (${meta.id})`;
        let res = null, err = '';
        for (let attempt = 0; attempt < 3 && !(res && res.ok); attempt++) {
          if (attempt) { retried++; q('retry').textContent = retried; await wait(800); }
          try {
            const buf = await fetchPlan(rows()[i]);
            res = await send({ type: 'uop-plan', id: meta.id, meta, pdf: buf }, [buf]);
            err = res.ok ? '' : res.reason;
          } catch (e) { err = e.message; res = null; }
        }
        done++;
        if (res && res.ok) ok++; else { bad++; errs.push(`${meta.name} (${meta.id}): ${err}`); }
        q('done').textContent = done; q('left').textContent = total - done; q('ok').textContent = ok; q('bad').textContent = bad;
        q('bar').style.width = `${100 * done / total}%`;
        const per = (Date.now() - t0) / done;
        q('eta').textContent = total > done ? `الوقت المتبقي نحو ${Math.max(1, Math.round(per * (total - done) / 60000))} د` : '';
        q('errs').innerHTML = errs.length ? `<div class="err">${errs.map(x => `<div>${x.replace(/</g, '&lt;')}</div>`).join('')}</div>` : '';
      }
    }
    try { site.postMessage({ type: 'uop-done', total, ok, bad, stopped: stop }, SITE_ORIGIN); } catch (e) { /* tab closed */ }
    running = false;
    bd.innerHTML = steps(4) + `<p>${stop ? 'أُوقف السحب.' : 'اكتمل السحب.'}</p><div class="grid"><div class="g"><b>${ok}</b><span>خطة مطابقة وكاملة</span></div><div class="y"><b>${total - done}</b><span>لم تُسحب</span></div><div class="r"><b>${bad}</b><span>تعذّرت</span></div></div>
      ${errs.length ? `<div class="err">${errs.map(x => `<div>${x.replace(/</g, '&lt;')}</div>`).join('')}</div>` : ''}
      <button class="btn go" id="openSite">افتح لوحة التحكم</button><button class="btn ghost" id="close">إغلاق</button>`;
    root.getElementById('openSite').onclick = () => { try { site.focus(); } catch (e) { window.open(TARGET.replace('view=import&from=edugate', 'view=board'), 'uop-advising'); } };
    root.getElementById('close').onclick = () => { host.remove(); window.__uopImport = null; };
  }
})();
