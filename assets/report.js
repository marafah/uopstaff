/* Print reports: a clean A4 document built from the data (not a print of the screen).
   printReport({ title, subtitle, filters: [[label, value]], stats: [[label, value]], sections: [{ title?, columns, rows, widths? }],
                 orientation: 'landscape' | 'portrait', note }) builds it in a hidden frame and opens the print dialog
   (where "Save as PDF" saves it as a file). */
window.printReport = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toLocaleString('ar-JO-u-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const CSS = `
  @page { size: A4 var(--orient); margin: 14mm 12mm 16mm; }
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
  @media screen { footer.rf { position: static; margin-top: 14px; } }
  `;

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
  return function printReport(o) {
    // a hidden frame, not a pop-up window: nothing for a pop-up blocker to stop, and only the report is printed
    let frame = document.getElementById('report-frame');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'report-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    const orient = o.orientation || 'landscape';
    const logo = new URL('assets/logo.png', location.href).href;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap">
      <style>:root{--orient:${orient};--screenw:${orient === 'landscape' ? '297mm' : '210mm'}}${CSS}</style></head><body>
      <div class="page">
        <header class="rh"><img src="${logo}" alt="">
          <div class="t"><small>جامعة البترا</small><h1>${esc(o.title)}</h1>${o.subtitle ? `<h2>${esc(o.subtitle)}</h2>` : ''}</div>
          <div class="meta">تاريخ التقرير: ${now()}<br>${o.source ? esc(o.source) : ''}</div></header>
        ${o.filters && o.filters.length ? `<div class="filters">${o.filters.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
        ${o.stats && o.stats.length ? `<div class="stats">${o.stats.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
        ${(o.sections || []).map(table).join('')}
        ${o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
        <footer class="rf"><span>صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة؛ المرجع المعتمد هو الموقع الرسمي.</span><span>marafah.github.io/uopstaff</span></footer>
      </div></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // print once the font and logo are in, so the first page is laid out with them
    const go = () => { try { w.focus(); w.print(); } catch (e) { /* printing not available */ } };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 300)); else setTimeout(go, 800);
  };
})();
