/* Shared helpers for the research pages: data loading, formatting, source links, charts, compare tray. */
(function () {
  'use strict';
  const R = (window.R = {});
  const V = document.currentScript && document.currentScript.src.split('v=')[1] || Date.now();

  R.state = {};
  R.$ = (s, el) => (el || document).querySelector(s);
  R.$$ = (s, el) => [...(el || document).querySelectorAll(s)];
  R.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  R.param = k => new URLSearchParams(location.search).get(k) || '';
  R.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const nf = new Intl.NumberFormat('en-US');
  R.n = x => (x == null || x === '' || Number.isNaN(+x)) ? '–' : nf.format(Math.round(+x));
  R.k = x => x == null ? '–' : (x >= 10000 ? (x / 1000).toFixed(x >= 100000 ? 0 : 1) + 'K' : nf.format(x));
  R.pct = (x, d = 0) => x == null ? '–' : (x * 100).toFixed(d) + '%';
  R.median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  R.sum = a => a.reduce((s, x) => s + (+x || 0), 0);
  R.percentile = (arr, v) => { if (!arr.length) return 0; const below = arr.filter(x => x < v).length, eq = arr.filter(x => x === v).length; return Math.round(100 * (below + eq / 2) / arr.length); };
  R.norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  R.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ------------------------------------------------------------------ data
  const cache = {};
  R.load = function (name) {
    if (!cache[name]) {
      cache[name] = fetch(`data/research/${name}.json?v=${V}`, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(name + ': ' + r.status); return r.json(); });
    }
    return cache[name];
  };
  R.loadAll = names => Promise.all(names.map(R.load));

  R.indexResearchers = function (data) {
    const list = data.researchers || [];
    const byId = {};
    list.forEach(r => { byId[r.id] = r; r._q = R.norm([r.name, r.name_en, r.dept, r.dept_en, r.faculty, r.spec, r.spec_en, r.interests, r.interests_en, (r.topics || []).map(t => t[0]).join(' ')].join(' ')); });
    R.state.researchers = list; R.state.byId = byId; R.state.meta = data.meta || {};
    return { list, byId };
  };
  R.faculties = list => [...new Set(list.map(r => r.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  R.depts = (list, fac) => [...new Set(list.filter(r => !fac || r.faculty === fac).map(r => r.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));

  // ------------------------------------------------------------------ colours
  R.colors = ['#901d23', '#1f6f78', '#b8892b', '#091b22', '#6b4c9a', '#2f7d32', '#c75b12', '#3b6ea8', '#a23a72', '#5d6d2f', '#8c6d62', '#00897b', '#d4a017', '#455a64'];
  const facColor = {};
  R.facColor = name => { if (!(name in facColor)) facColor[name] = R.colors[Object.keys(facColor).length % R.colors.length]; return facColor[name]; };
  R.alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  // ------------------------------------------------------------------ links (every number links to where it can be checked)
  R.SRC = {
    o: { name: 'OpenAlex', color: '#1d4f80', icon: 'bi-globe2' },
    u: { name: 'صفحة المدرس', color: '#901d23', icon: 'bi-building' },
    s: { name: 'Scopus', color: '#e9711c', icon: 'bi-bar-chart-line' },
    g: { name: 'Google Scholar', color: '#4285f4', icon: 'bi-google' }
  };
  R.oaAuthorUrl = id => `https://openalex.org/authors/${id}`;
  R.oaWorkUrl = id => `https://openalex.org/works/${id}`;
  R.oaInstUrl = id => `https://openalex.org/institutions/${id}`;
  R.scopusAuthorUrl = id => `https://www.scopus.com/authid/detail.uri?authorId=${id}`;
  R.scopusDocUrl = eid => `https://www.scopus.com/record/display.uri?eid=${encodeURIComponent(eid)}&origin=resultslist`;
  R.scopusOrgUrl = id => `https://www.scopus.com/pages/organization/${id}`;
  R.scholarUrl = id => `https://scholar.google.com/citations?user=${id}&hl=en`;
  R.profileUrl = r => `researcher.html?id=${encodeURIComponent(r.id)}`;
  R.srcBadge = (txt, href, icon) => href
    ? `<a class="rs-src" href="${R.esc(href)}" target="_blank" rel="noopener" title="افتح المصدر للتحقق"><i class="bi ${icon || 'bi-box-arrow-up-left'}"></i>${R.esc(txt)}</a>`
    : `<span class="rs-src">${icon ? `<i class="bi ${icon}"></i>` : ''}${R.esc(txt)}</span>`;

  R.linkList = function (r, big) {
    const L = r.links || {}, cls = 'rs-link' + (big ? ' lg' : '');
    const items = [
      ['Google Scholar', L.scholar, '#4285f4', 'bi-google'],
      ['Scopus', L.scopus || ((r.scopus_ids || [])[0] && R.scopusAuthorUrl(r.scopus_ids[0])), '#e9711c', 'bi-bar-chart-line'],
      ['ORCID', L.orcid, '#a6ce39', 'bi-person-vcard'],
      ['OpenAlex', (r.oa_ids || [])[0] && R.oaAuthorUrl(r.oa_ids[0]), '#1d4f80', 'bi-globe2'],
      ['JOIP', L.joip, '#007a3d', 'bi-flag'],
      ['ResearchGate', L.researchgate, '#00ccbb', 'bi-r-circle'],
      ['Web of Science', L.wos, '#5e33bf', 'bi-journal'],
      ['LinkedIn', L.linkedin, '#0a66c2', 'bi-linkedin'],
      ['صفحة الجامعة', r.profile, '#901d23', 'bi-building']
    ];
    return '<div class="rs-links">' + items.filter(x => x[1] || big).map(([n, u, c, i]) => u
      ? `<a class="${cls}" href="${R.esc(u)}" target="_blank" rel="noopener"><i class="bi ${i}" style="color:${c}"></i>${n}</a>`
      : `<span class="${cls} off"><i class="bi ${i}"></i>${n}</span>`).join('') + '</div>';
  };

  R.matchBadge = function (r) {
    const m = r.oa_match;
    if (!r.oa_ids || !r.oa_ids.length) return '<span class="rs-verify none" title="لم يُعثر على ملف في OpenAlex؛ الأرقام من قائمة صفحة المدرس فقط"><i class="bi bi-dash-circle"></i>غير مطابق</span>';
    if (m === 'orcid' || m === 'override') return `<span class="rs-verify ok" title="${m === 'orcid' ? 'طوبق عبر رقم ORCID المسجل في صفحة المدرس' : 'مطابقة يدوية معتمدة'}"><i class="bi bi-patch-check-fill"></i>${m === 'orcid' ? 'مطابق بـ ORCID' : 'مطابقة معتمدة'}</span>`;
    if (m === 'name') return '<span class="rs-verify ok" title="طوبق بالاسم والانتماء لجامعة البترا"><i class="bi bi-check-circle"></i>مطابق بالاسم والجامعة</span>';
    return '<span class="rs-verify warn" title="مطابقة تقريبية بالاسم: يُرجى التحقق من رابط OpenAlex"><i class="bi bi-exclamation-triangle"></i>يحتاج تحقق</span>';
  };

  R.scBadge = function (r) {
    const m = r.scopus_match;
    if (!(r.scopus_ids || []).length) return '<span class="rs-verify none" title="لا يوجد ملف Scopus مرتبط بهذا الباحث في وثائق الجامعة"><i class="bi bi-dash-circle"></i>Scopus: غير مطابق</span>';
    if (m === 'link') return '<span class="rs-verify ok" title="رقم مؤلف Scopus من صفحة المدرس على موقع الجامعة"><i class="bi bi-patch-check-fill"></i>Scopus: من صفحة المدرس</span>';
    if (m === 'name') return '<span class="rs-verify ok" title="طوبق بالاسم بين مؤلفي الجامعة في Scopus"><i class="bi bi-check-circle"></i>Scopus: مطابق بالاسم</span>';
    return '<span class="rs-verify warn" title="مطابقة بالاسم الأول واسم العائلة: تحقّق من رابط Scopus"><i class="bi bi-exclamation-triangle"></i>Scopus: يحتاج تحقق</span>';
  };
  R.qTag = q => q ? `<span class="rs-tag q${q[1]}" title="تصنيف المجلة حسب SJR (من بيانات Scopus)">${q}</span>` : '';
  R.scUrl = r => (r.links || {}).scopus || ((r.scopus_ids || [])[0] ? R.scopusAuthorUrl(r.scopus_ids[0]) : '');

  R.workLinks = function (w) {
    const a = [];
    if (w.doi) a.push(`<a href="https://doi.org/${R.esc(w.doi)}" target="_blank" rel="noopener"><i class="bi bi-link-45deg"></i> DOI</a>`);
    const oid = w.oid || (/^W\d+$/.test(w.id) ? w.id : '');
    if (oid) a.push(`<a href="${R.oaWorkUrl(oid)}" target="_blank" rel="noopener" style="color:#1d4f80"><i class="bi bi-globe2"></i> OpenAlex</a>`);
    if (w.eid) a.push(`<a href="${R.scopusDocUrl(w.eid)}" target="_blank" rel="noopener" style="color:#c75b12"><i class="bi bi-bar-chart-line"></i> Scopus</a>`);
    if (w.url && !(w.doi && w.url.includes(w.doi))) a.push(`<a href="${R.esc(w.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> رابط الناشر</a>`);
    if (w.oaurl) a.push(`<a href="${R.esc(w.oaurl)}" target="_blank" rel="noopener" style="color:#17663a"><i class="bi bi-unlock"></i> النص الكامل</a>`);
    if (!a.length) a.push(`<a href="https://scholar.google.com/scholar?q=${encodeURIComponent('"' + (w.t || '') + '"')}" target="_blank" rel="noopener"><i class="bi bi-search"></i> ابحث في Scholar</a>`);
    return a.join('');
  };

  R.TYPE_AR = { article: 'مقالة', 'journal-article': 'مقالة', conference: 'مؤتمر', 'proceedings-article': 'مؤتمر', chapter: 'فصل كتاب', 'book-chapter': 'فصل كتاب', book: 'كتاب', review: 'مراجعة', preprint: 'ما قبل النشر', dataset: 'بيانات', dissertation: 'أطروحة', letter: 'رسالة', editorial: 'افتتاحية', erratum: 'تصويب', patent: 'براءة', paratext: 'أخرى', other: 'أخرى', 'conference paper': 'مؤتمر', 'book chapter': 'فصل كتاب' };
  R.typeAr = t => R.TYPE_AR[(t || '').toLowerCase()] || t || 'أخرى';
  R.OA_AR = { gold: 'ذهبي', green: 'أخضر', hybrid: 'هجين', bronze: 'برونزي', diamond: 'ماسي', closed: 'مغلق', oa: 'مفتوح' };
  R.isOA = w => w.oa && w.oa !== 'closed';

  R.pubHTML = function (w, opts) {
    opts = opts || {};
    const src = (w.src || '').split('').sort((a, b) => 'soug'.indexOf(a) - 'soug'.indexOf(b)).map(s => `<span class="rs-tag src-${s}" title="المصدر: ${R.SRC[s] ? R.SRC[s].name : s}">${R.SRC[s] ? R.SRC[s].name : s}</span>`).join('');
    const who = opts.byId ? (w.r || []).map(id => opts.byId[id]).filter(Boolean) : [];
    return `<article class="rs-pub">
      <div class="t">${R.esc(w.t)}</div>
      <div class="c">${w.sc != null ? `<b>${R.n(w.sc)}</b><span>اقتباس Scopus${w.c != null && w.c !== w.sc ? `<br>OpenAlex: ${R.n(w.c)}` : ''}</span>` : `<b>${R.n(w.c)}</b><span>اقتباس OpenAlex</span>`}</div>
      ${w.au ? `<div class="a">${R.esc(w.au)}</div>` : ''}
      <div class="m">${w.y ? `<span class="rs-tag y">${w.y}</span>` : ''}${R.qTag(w.q)}${w.v ? `<span class="ltr">${R.esc(w.v)}</span>` : ''}
        <span class="rs-tag">${R.esc(R.typeAr(w.type))}</span>${R.isOA(w) ? `<span class="rs-tag oa"><i class="bi bi-unlock"></i> ${R.OA_AR[w.oa] || 'مفتوح'}</span>` : ''}
        ${w.fwci != null ? `<span class="rs-tag" title="مؤشر الاقتباس الموزون حسب المجال (1 = المتوسط العالمي)">FWCI ${w.fwci}</span>` : ''}${src}
        ${who.length && opts.showUop ? who.map(r => `<a class="rs-chip" href="${R.profileUrl(r)}">${R.esc(r.name)}</a>`).join('') : ''}</div>
      <div class="lnk">${R.workLinks(w)}</div>
    </article>`;
  };

  R.avatar = function (r, size) {
    const parts = (r.name || '').replace(/^(أ\.?\s*د\.?|د\.|أ\.|م\.)\s*/, '').split(/\s+/).filter(Boolean);
    const ini = [parts[0], parts[parts.length - 1]].filter(Boolean).map(x => x.replace(/^(ال|أل)(?=..)/, '')[0] || '').join(' ');
    return `<span class="rs-avatar ${size || ''}">${r.photo ? `<img src="${R.esc(r.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${r.photo ? '' : R.esc(ini)}</span>`;
  };

  // ------------------------------------------------------------------ charts
  R.charts = {};
  R.chart = function (id, cfg) {
    if (!window.Chart) return null;
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return null;
    if (R.charts[el.id]) R.charts[el.id].destroy();
    Chart.defaults.font.family = 'Tajawal, "Segoe UI", Tahoma, sans-serif';
    Chart.defaults.color = '#4a4a46';
    Chart.defaults.borderColor = '#eee8da';
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.tooltip.rtl = true;
    Chart.defaults.plugins.tooltip.textDirection = 'rtl';
    Chart.defaults.maintainAspectRatio = false;
    const c = new Chart(el, cfg);
    R.charts[el.id] = c;
    return c;
  };
  R.spark = function (byYear, from, to) {
    const ys = []; for (let y = from; y <= to; y++) ys.push((byYear[y] || [0])[0]);
    const mx = Math.max(1, ...ys), w = 100, h = 30, bw = w / ys.length;
    return `<svg class="rs-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${ys.map((v, i) => `<rect x="${(i * bw + .6).toFixed(2)}" y="${(h - (v / mx) * h).toFixed(2)}" width="${(bw - 1.2).toFixed(2)}" height="${((v / mx) * h).toFixed(2)}" rx=".8" fill="${i === ys.length - 1 ? '#b8892b' : '#901d23'}" opacity="${v ? .85 : .15}"></rect>`).join('')}</svg>`;
  };

  // ------------------------------------------------------------------ export
  R.csv = function (rows, file) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const txt = '﻿' + [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\n');
    R.download(txt, file, 'text/csv;charset=utf-8');
  };
  R.download = function (txt, file, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: type || 'text/plain;charset=utf-8' }));
    a.download = file; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  R.bibtex = function (works) {
    return works.map(w => {
      const key = ((w.au || 'anon').split(/[ ,]/)[0] + (w.y || '') + (w.t || '').split(/\s+/)[0]).replace(/[^A-Za-z0-9]/g, '');
      const type = /conference|proceedings/.test(w.type) ? 'inproceedings' : /chapter/.test(w.type) ? 'incollection' : /book/.test(w.type) ? 'book' : 'article';
      const f = [['title', w.t], ['author', (w.au || '').replace(/ …$/, '').split(/,\s*/).join(' and ')], ['year', w.y], [type === 'article' ? 'journal' : 'booktitle', w.v], ['doi', w.doi], ['url', w.doi ? 'https://doi.org/' + w.doi : w.url]];
      return `@${type}{${key},\n` + f.filter(x => x[1]).map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, '')}}`).join(',\n') + '\n}';
    }).join('\n\n');
  };

  // ------------------------------------------------------------------ "updated" line in the hero
  R.updated = function (meta) {
    const el = document.getElementById('pg-updated');
    if (!el || !meta || !meta.updated) return;
    const d = new Date(meta.updated);
    const days = Math.round((Date.now() - d) / 864e5);
    const when = days <= 0 ? 'اليوم' : days === 1 ? 'أمس' : `قبل ${days} يوماً`;
    el.textContent = `آخر تحديث ${when} (${d.toLocaleDateString('en-GB')}) · يُحدَّث أسبوعياً`;
    const fu = document.getElementById('foot-updated'), fc = document.getElementById('foot-count');
    if (fu) fu.textContent = `تحديث أسبوعي · ${d.toLocaleDateString('en-GB')}`;
    if (fc && meta.researchers) fc.textContent = `${meta.researchers} باحث · ${R.n(meta.works)} منشور`;
  };
  R.fail = function (el, e) {
    console.error(e);
    const u = document.getElementById('pg-updated');
    if (u) u.textContent = 'البيانات قيد الإعداد';
    el.innerHTML = `<div class="rs-empty"><i class="bi bi-cloud-slash"></i>تعذّر تحميل بيانات البحث العلمي.<br><small>تُبنى البيانات تلقائياً عبر GitHub Actions ‏(Update research data). إن كانت هذه أول مرة، شغّل الإجراء من تبويب Actions.</small></div>`;
  };

  // ------------------------------------------------------------------ compare tray (kept per viewer)
  const KEY = 'uop-research-compare';
  R.cmp = {
    get: () => R.store.get(KEY, []).filter(Boolean).slice(0, 4),
    set(list) { R.store.set(KEY, list.slice(0, 4)); R.cmp.render(); document.dispatchEvent(new CustomEvent('cmp-change')); },
    has: id => R.cmp.get().includes(id),
    toggle(id) { const l = R.cmp.get(); const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else if (l.length < 4) l.push(id); else { alertTray(); return false; } R.cmp.set(l); return true; },
    render() {
      let t = document.getElementById('rs-tray');
      if (!t) { t = document.createElement('div'); t.id = 'rs-tray'; t.className = 'rs-tray no-print'; document.body.appendChild(t); }
      const l = R.cmp.get(), by = R.state.byId || {};
      if (!l.length || /compare\.html/.test(location.pathname)) { t.classList.remove('show'); return; }
      t.innerHTML = `<div class="in"><span class="who">${l.map(id => by[id] ? R.avatar(by[id], 'sm') : '').join('')}</span>
        <span>${l.length} للمقارنة</span>
        <a class="btn btn-sm btn-light fw-bold" href="compare.html?ids=${l.join(',')}"><i class="bi bi-bar-chart-steps"></i> قارن الآن</a>
        <button class="btn btn-sm btn-outline-light" type="button" id="rs-tray-clear" title="إفراغ"><i class="bi bi-x-lg"></i></button></div>`;
      t.classList.add('show');
      t.querySelector('#rs-tray-clear').onclick = () => R.cmp.set([]);
    }
  };
  function alertTray() {
    const t = document.querySelector('#rs-tray .in');
    if (t) { t.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }
  }

  // header search box: jump to the researchers list
  document.addEventListener('DOMContentLoaded', () => {
    const q = document.getElementById('pg-q');
    if (q && !q.dataset.local) q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) location.href = 'researchers.html?q=' + encodeURIComponent(q.value.trim()); });
  });
})();
