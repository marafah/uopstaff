/* Print reports: a clean A4 document built from the data (not a print of the screen).
   printReport({ title, subtitle, filters: [[label, value]], stats: [[label, value]], sections: [{ title?, columns, rows, widths? }],
                 orientation: 'landscape' | 'portrait', note, fit }) builds it (fit: scaled to one page) in a hidden frame and opens the print dialog
   (where "Save as PDF" saves it as a file). */
window.printReport = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toLocaleString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const CSS = `
  @page { size: A4 __ORIENT__; margin: __MARGIN__; }
  /* multi-page reports: the footer and page numbers in the page margin of every page (a fixed footer would land on the
     next page's title); one-page reports (no margin) keep the footer line below */
  @page { @bottom-right { content: "صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة؛ المرجع المعتمد هو الموقع الرسمي."; font: 7.5pt Tajawal, sans-serif; color: #777; }
          @bottom-left { content: "marafah.github.io/uopstaff  ·  " counter(page) " / " counter(pages); font: 7.5pt Tajawal, sans-serif; color: #777; } }
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
  .raw .tt-grid { table-layout: fixed; }
  .raw .tt-chip { max-width: 100%; }`;
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
  return function printReport(o) {
    // a hidden frame, not a pop-up window: nothing for a pop-up blocker to stop, and only the report is printed
    let frame = document.getElementById('report-frame');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'report-frame';
    frame.setAttribute('aria-hidden', 'true');
    const printable = (o.orientation || 'landscape') === 'landscape' ? 1032 : 703;  // A4 minus the page margins, in CSS px
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${printable}px;height:900px;border:0;visibility:hidden`;
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    const orient = o.orientation || 'landscape';
    const logo = new URL('assets/logo.png', location.href).href;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap">
      ${(o.css || []).map(h => `<link rel="stylesheet" href="${new URL(h, location.href).href}">`).join('')}
      <style>${CSS.replace('__ORIENT__', orient).replace('__MARGIN__', o.fit ? '0' : '14mm 12mm 16mm')}${o.raw ? RAW_CSS : ''}</style></head><body class="${o.fit ? 'fit' : ''}">
      <div class="page">
        <header class="rh"><img src="${logo}" alt="">
          <div class="t"><small>جامعة البترا</small><h1>${esc(o.title)}</h1>${o.subtitle ? `<h2>${esc(o.subtitle)}</h2>` : ''}</div>
          <div class="meta">تاريخ التقرير: ${now()}<br>${o.source ? esc(o.source) : ''}</div>${qr(o)}</header>
        ${o.filters && o.filters.length ? `<div class="filters">${o.filters.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
        ${o.stats && o.stats.length ? `<div class="stats">${o.stats.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
        ${(o.sections || []).map(table).join('')}
        ${o.raw ? `<div class="raw">${o.raw}</div>` : ''}
        ${o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
      </div>
      <footer class="rf"><span>صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة؛ المرجع المعتمد هو الموقع الرسمي.</span><span>marafah.github.io/uopstaff</span></footer>
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
        const height = (orient === 'landscape' ? 794 : 1123) - 38 - 64;  // A4 minus the top margin and the footer zone, in CSS px
        const scale = Math.min(1, printable / page.scrollWidth, height / page.scrollHeight);
        if (scale < 1) page.style.zoom = scale.toFixed(3);
      } else if (raw && raw.scrollWidth > printable) raw.style.zoom = (printable / raw.scrollWidth).toFixed(3);  // a wide matrix: page width, not cut
      try { w.focus(); w.print(); } catch (e) { /* printing not available */ }
    };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 300)); else setTimeout(go, 800);
  };
})();
