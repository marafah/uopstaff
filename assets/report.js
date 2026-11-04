/* Print reports: a clean A4 document built from the data (not a print of the screen).
   printReport({ title, subtitle, filters: [[label, value]], stats: [[label, value]], sections: [{ title?, columns, rows, widths? }],
                 orientation: 'landscape' | 'portrait', paper: 'A4' | 'A3', note, fit, fitParts })
   (fitParts: each .part of o.raw on its own page, scaled to fit it but not below minZoom) builds it (fit: scaled to one page) in a hidden frame and opens the print dialog
   (where "Save as PDF" saves it as a file). */
window.printReport = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toLocaleString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const CSS = `
  @page { size: __PAPER__ __ORIENT__; margin: __MARGIN__; }
  /* multi-page reports: the footer and page numbers in the page margin of every page (a fixed footer would land on the
     next page's title); one-page reports (no margin) keep the footer line below */
  @page { @bottom-right { content: "صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة؛ المرجع المعتمد هو الموقع الرسمي."; font: 7.5pt Tajawal, sans-serif; color: #777; }
          @bottom-left { content: "بوصلة البترا  ·  marafah.github.io/uopstaff  ·  " counter(page) " / " counter(pages); font: 7.5pt Tajawal, sans-serif; color: #777; } }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; color: #1f2d33; font-family: Tajawal, 'Segoe UI', Tahoma, sans-serif; font-size: 10.5pt; }
  .page { padding: 0; }
  header.rh { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px solid #901d23; }
  header.rh img { height: 54px; }
  header.rh .t { flex: 1; }
  header.rh .t small { display: block; color: #6b6b6b; font-size: 9pt; letter-spacing: .2px; }
  header.rh .t h1 { margin: 2px 0 0; font-size: 17pt; color: #091b22; font-weight: 800; }
  header.rh .t h2 { margin: 2px 0 0; font-size: 10.5pt; color: #901d23; font-weight: 700; }
  header.rh .meta { text-align: left; font-size: 8.5pt; color: #555; line-height: 1.6; }
  header.rh .qr { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border: 1px solid #e3dccb; border-radius: 8px; }
  header.rh .qr svg { width: 66px; height: 66px; display: block; } header.rh .qr span { font-size: 6.5pt; color: #901d23; font-weight: 700; white-space: nowrap; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
  .filters span { background: #f6f3ec; border: 1px solid #e3dccb; border-radius: 999px; padding: 2px 10px; font-size: 8.5pt; }
  .filters b { color: #901d23; font-weight: 700; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 12px 0 4px; }
  .stats div { border: 1px solid #e3dccb; border-top: 3px solid #091b22; border-radius: 8px; padding: 6px 10px; }
  .stats b { display: block; font-size: 14pt; color: #091b22; font-weight: 800; }
  .stats span { font-size: 8.5pt; color: #555; }
  h3.sec { font-size: 11.5pt; color: #091b22; margin: 16px 0 6px; padding-inline-start: 8px; border-inline-start: 4px solid #901d23; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: auto; }
  thead { display: table-header-group; }
  thead th { background: #091b22; color: #fff; font-weight: 700; font-size: 9pt; padding: 6px 6px; text-align: start; border: 1px solid #091b22; }
  tbody td { padding: 5px 6px; font-size: 9pt; border: 1px solid #e6e0d2; vertical-align: top; line-height: 1.45; }
  tbody tr:nth-child(even) td { background: #faf8f3; }
  tbody tr { break-inside: avoid; }
  td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ltr { direction: ltr; text-align: right; unicode-bidi: plaintext; white-space: nowrap; }
  td small { display: block; color: #777; font-size: 8pt; }
  .pill { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 8pt; font-weight: 700; white-space: nowrap; }
  .ok { background: #e3f4e3; color: #0a6b0a; } .no { background: #fdecec; color: #8f1f1f; } .mut { background: #f1ede4; color: #555; }
  .empty { color: #999; text-align: center; padding: 20px; }
  footer.rf { position: fixed; bottom: -10mm; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 7.5pt; color: #777; border-top: 1px solid #ddd; padding-top: 3px; }
  .note { margin-top: 10px; font-size: 8pt; color: #666; }
  /* one-page report: no page margin (so the browser prints no date/title/URL lines); margins inside the page instead,
     sized so the content keeps the measured width; the footer inside the page, never on a page of its own */
  @media print { body:not(.fit) footer.rf { display: none; } body.fit { padding: 10mm 12mm 0; } body.fit footer.rf { bottom: 6mm; left: 12mm; right: 12mm; } }
  @media screen { footer.rf { position: static; margin-top: 14px; } }
  `;

  // a table copied from the screen (with the site's styles): printed as displayed, without scroll boxes or links
  const RAW_CSS = `
  body { background: #fff !important; }
  .raw { margin-top: 10px; }
  .raw .table-responsive, .raw .mx-wrap, .raw .tt-grid-wrap { overflow: visible !important; max-height: none !important; }
  .raw table { width: 100% !important; margin: 0; }
  .raw thead th { position: static !important; }
  .raw tbody th { position: static !important; }
  .raw a { text-decoration: none !important; pointer-events: none; }
  .raw .tt-more { display: none; }
  .raw tr { break-inside: avoid; }
  .raw table thead { display: table-header-group; }
  .raw .tt-grid thead th, .raw .mx-table thead th, .raw .fr-heat thead th, .raw .fr-strips thead th { background: #091b22 !important; color: #fff !important; }
  .raw th, .raw td { min-width: 0 !important; }
  .raw .tt-chip, .raw .ti-chip { max-width: 100%; }
  /* readable on paper: the screen sizes (≈ 9–10px) are too small once printed */
  .raw table { font-size: 9.5pt !important; }
  .raw .tt-grid, .raw .mx-table, .raw .fr-heat, .raw .fr-strips, .raw .ti-table { font-size: 9.5pt !important; }
  .raw thead th { font-size: 9.5pt !important; padding: 5px 6px !important; }
  .raw tbody th { font-size: 9.5pt !important; }
  .raw .tt-chip, .raw .ti-chip { font-size: 9pt !important; line-height: 1.35 !important; padding: 3px 6px !important; }
  .raw .tt-chip small, .raw .ti-room, .raw .ti-inst small, .raw .ti-hrs small { font-size: 8pt !important; }
  .raw .ti-top b, .raw .tt-chip-c b { font-size: 9.5pt !important; }
  .raw .ti-name, .raw .tt-chip-n { font-size: 8.5pt !important; }
  .raw .ti-sec, .raw .tt-chip-s { font-size: 8pt !important; }
  .raw .fr-heat td a, .raw .mx-c, .raw .mx-tot { font-size: 10pt !important; }
  .raw .fr-heat td a small { font-size: 8pt !important; opacity: 1 !important; }
  .raw .ti-inst { min-width: 150px !important; }
  .raw .tt-chip.static { font-size: 8.5pt !important; }
  .raw .part-h { font-size: 9pt; color: #901d23; font-weight: 700; margin: 0 0 4px; }
  .raw .part + .part { break-before: page; }`;
  function cell(c) {
    if (c && typeof c === 'object' && !Array.isArray(c)) return `<td class="${c.cls || ''}">${c.html != null ? c.html : esc(c.text)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</td>`;
    return `<td>${esc(c)}</td>`;
  }
  function table(sec) {
    const head = sec.columns.map((h, i) => `<th class="${(sec.numCols || []).includes(i) ? 'num' : ''}" ${sec.widths && sec.widths[i] ? `style="width:${sec.widths[i]}"` : ''}>${esc(h)}</th>`).join('');
    const body = sec.rows.length ? sec.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')
      : `<tr><td class="empty" colspan="${sec.columns.length}">لا توجد بيانات</td></tr>`;
    return `${sec.title ? `<h3 class="sec">${esc(sec.title)}</h3>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  // every report carries a QR code of the page it came from (with its filters), so the paper copy opens the live,
  // always up-to-date version; o.url overrides the address, o.qr === false leaves it out
  function qr(o) {
    if (o.qr === false || typeof window.qrcode !== 'function') return '';
    try {
      const url = o.url || location.href, q = window.qrcode(0, 'M');
      q.addData(url); q.make();
      return `<div class="qr">${q.createSvgTag({ cellSize: 2, margin: 0, scalable: true })}<span>${esc(o.qrLabel || 'امسح للنسخة الحية')}</span></div>`;
    } catch (e) { return ''; }
  }
  // the cells of a table as a grid: every cell with its first column and how many columns it spans (rowspans included)
  function gridOf(rows) {
    const taken = [], out = [];
    rows.forEach((r, ri) => {
      let c = 0; out[ri] = [];
      [...r.cells].forEach(cell => {
        while (taken[ri] && taken[ri][c]) c++;
        const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
        out[ri].push({ cell, c, cs });
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) ((taken[ri + i] ||= [])[c + j] = true);
        c += cs;
      });
    });
    return out;
  }
  function splitTable(doc, raw, t, printable) {
    const rows = [...t.rows], grid = gridOf(rows);
    const n = Math.max(...grid.map(r => r.reduce((a, x) => Math.max(a, x.c + x.cs), 0)));
    if (n < 3) return;
    // the width of each column, from the cells that span one column
    const wcol = Array(n).fill(0);
    grid.forEach(r => r.forEach(x => { if (x.cs === 1) wcol[x.c] = Math.max(wcol[x.c], x.cell.getBoundingClientRect().width); }));
    for (let i = 0; i < n; i++) if (!wcol[i]) wcol[i] = 80;
    const first = wcol[0], room = printable - first - 4;
    const parts = [];
    let cur = [], w = 0;
    for (let i = 1; i < n; i++) {
      if (cur.length && w + wcol[i] > room) { parts.push(cur); cur = []; w = 0; }
      cur.push(i); w += wcol[i];
    }
    if (cur.length) parts.push(cur);
    if (parts.length < 2) return;
    const label = i => { for (const r of grid) { const x = r.find(x => x.c === i && x.cs === 1); if (x) return x.cell.innerText.trim().split('\n')[0]; } return ''; };
    const out = parts.map((cols, k) => {
      const keep = new Set([0, ...cols]);
      const nt = t.cloneNode(false);
      ['thead', 'tbody', 'tfoot'].forEach(tag => {
        const sec = t.querySelector(':scope > ' + tag);
        if (!sec) return;
        const ns = sec.cloneNode(false);
        [...sec.rows].forEach(r => {
          const ri = rows.indexOf(r), nr = r.cloneNode(false);
          grid[ri].forEach(x => {
            let m = 0;
            for (let j = 0; j < x.cs; j++) if (keep.has(x.c + j)) m++;
            if (!m) return;
            const nc = x.cell.cloneNode(true);
            if (x.cs > 1) nc.colSpan = m;
            nr.appendChild(nc);
          });
          ns.appendChild(nr);
        });
        nt.appendChild(ns);
      });
      nt.style.width = '100%';
      const d = doc.createElement('div');
      d.className = 'part';
      d.innerHTML = `<p class="part-h">الجزء ${k + 1} من ${parts.length} · الأعمدة: ${esc(label(cols[0]))} – ${esc(label(cols[cols.length - 1]))}</p>`;
      d.appendChild(nt);
      return d;
    });
    const wrap = t.closest('.table-responsive, .mx-wrap, .tt-grid-wrap, .ti-wrap') || t;
    out.forEach(d => wrap.parentNode.insertBefore(d, wrap));
    wrap.remove();
  }
  return function printReport(o) {
    // a hidden frame, not a pop-up window: nothing for a pop-up blocker to stop, and only the report is printed
    let frame = document.getElementById('report-frame');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'report-frame';
    frame.setAttribute('aria-hidden', 'true');
    // the paper in CSS px (96 per inch): A4 297 × 210 mm, A3 420 × 297 mm; the printable width is the paper minus 24 mm of margins
    const PX = 96 / 25.4, paper = o.paper === 'A3' ? 'A3' : 'A4', [mmL, mmS] = paper === 'A3' ? [420, 297] : [297, 210];
    const landscape = (o.orientation || 'landscape') === 'landscape', pageW = (landscape ? mmL : mmS) * PX, pageH = (landscape ? mmS : mmL) * PX;
    const printable = Math.round(pageW - 24 * PX);
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${printable}px;height:900px;border:0;visibility:hidden`;
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    const orient = o.orientation || 'landscape';
    const logo = new URL('assets/logo.png', location.href).href;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap">
      ${(o.css || []).map(h => `<link rel="stylesheet" href="${new URL(h, location.href).href}">`).join('')}
      <style>${CSS.replace('__PAPER__', paper).replace('__ORIENT__', orient).replace('__MARGIN__', o.fit ? '0' : '14mm 12mm 16mm')}${o.raw ? RAW_CSS : ''}</style></head><body class="${o.fit ? 'fit' : ''}">
      <div class="page">
        <header class="rh"><img src="${logo}" alt="">
          <div class="t"><small>بوصلة البترا · جامعة البترا</small><h1>${esc(o.title)}</h1>${o.subtitle ? `<h2>${esc(o.subtitle)}</h2>` : ''}</div>
          <div class="meta">تاريخ التقرير: ${now()}<br>${o.source ? esc(o.source) : ''}</div>${qr(o)}</header>
        ${o.filters && o.filters.length ? `<div class="filters">${o.filters.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
        ${o.stats && o.stats.length ? `<div class="stats">${o.stats.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
        ${(o.sections || []).map(table).join('')}
        ${o.raw ? `<div class="raw">${o.raw}</div>` : ''}
        ${o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
      </div>
      <footer class="rf"><span>صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة؛ المرجع المعتمد هو الموقع الرسمي.</span><span>بوصلة البترا · marafah.github.io/uopstaff</span></footer>
      </body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // print once the font and logo are in, so the first page is laid out with them
    const go = () => {
      const raw = w.document.querySelector('.raw');
      if (o.fit) {
        // o.fit: everything on one page — the whole report is scaled to the printable width and height
        const page = w.document.querySelector('.page');
        const height = pageH - 38 - 64;  // the paper minus the top margin and the footer zone, in CSS px
        const scale = Math.min(1, printable / page.scrollWidth, height / page.scrollHeight);
        if (scale < 1) page.style.zoom = scale.toFixed(3);
      } else if (o.fitParts && raw) {
        // o.fitParts: every .part on a page of its own, scaled to fit it (the first page also holds the report header)
        const parts = [...raw.querySelectorAll('.part')], full = pageH - 14 * PX - 16 * PX - 8;
        parts.forEach((p, i) => {
          const avail = i ? full : full - (p.getBoundingClientRect().top - w.document.body.getBoundingClientRect().top) + 14 * PX;
          // never smaller than o.minZoom: a part too tall for that continues on the next page (its header repeated)
          const scale = Math.min(1, printable / p.scrollWidth, Math.max(o.minZoom || 0, avail / p.scrollHeight));
          if (scale < 1) p.style.zoom = scale.toFixed(3);
        });
      } else if (raw) {
        // a wide matrix is split into parts that each fit the page at a readable size (the first column repeated in
        // every part), instead of shrinking the whole table until it can no longer be read
        const t = raw.querySelector('table');
        if (t && t.scrollWidth > printable && !o.noSplit) splitTable(w.document, raw, t, printable);
        raw.querySelectorAll('.part').forEach(p => { if (p.scrollWidth > printable) p.style.zoom = Math.max(0.6, printable / p.scrollWidth).toFixed(3); });
        if (!raw.querySelector('.part') && raw.scrollWidth > printable) raw.style.zoom = (printable / raw.scrollWidth).toFixed(3);
      }
      try { w.focus(); w.print(); } catch (e) { /* printing not available */ }
    };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 300)); else setTimeout(go, 800);
  };
})();
