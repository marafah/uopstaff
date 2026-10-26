/* Share panel: link to the directory (or to the current filtered view), QR code, download/print, messaging. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const TITLE = document.body.dataset.shareTitle || 'دليل موظفي جامعة البترا';  // set per page on <body>
  const NAVY = '#091b22', MAROON = '#901d23';
  let current = '';

  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
  function viewLabel() {
    const p = new URLSearchParams(location.search);
    const parts = [];
    if (p.get('q')) parts.push(`بحث: ${p.get('q')}`);
    if (p.get('type')) parts.push(p.get('type') === 'academic' ? 'أكاديمي' : 'إداري');
    if (p.get('faculty')) { const o = document.querySelector(`#f-faculty option[value="${p.get('faculty')}"]`); if (o) parts.push(o.textContent.replace(/\s*\(\d+\)$/, '')); }
    ['dept', 'rank', 'role'].forEach(k => { if (p.get(k)) parts.push(p.get(k) === 'any' ? 'المناصب القيادية' : p.get(k)); });
    return parts.join(' · ');
  }
  function qrFor(url) {
    const q = qrcode(0, 'M');
    q.addData(unescape(encodeURIComponent(url)));  // UTF-8 bytes (Arabic search terms)
    q.make();
    return q;
  }
  function update() {
    const what = document.querySelector('input[name=shareWhat]:checked').value;
    const hasView = !!location.search;
    $('#sw-view').disabled = !hasView;
    if (!hasView) $('#sw-all').checked = true;
    current = (what === 'view' && hasView) ? location.href : baseUrl();
    const label = what === 'view' && hasView ? viewLabel() : '';
    $('#share-url').value = current;
    $('#share-url-text').textContent = current.replace(/^https?:\/\//, '');
    $('#qr-sub').textContent = label ? `امسح الرمز لفتح: ${label}` : `امسح الرمز لفتح ${document.body.dataset.shareWhat || 'الدليل'}`;
    $('#qr').innerHTML = qrFor(current).createSvgTag({ cellSize: 6, margin: 2, scalable: true })
      .replace(/fill="black"/g, `fill="${NAVY}"`);
    const text = `${TITLE}${label ? ' – ' + label : ''}\n${current}`;
    $('#share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    $('#share-mail').href = `mailto:?subject=${encodeURIComponent(TITLE)}&body=${encodeURIComponent(text)}`;
    $('#share-native').hidden = !navigator.share;
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    return Promise.resolve();
  }
  function toast(msg) {
    const el = $('#copy-toast');
    el.querySelector('span').textContent = msg;
    el.classList.remove('warn'); el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }
  // PNG card: title, QR code and link, ready to send or put on a poster
  function cardCanvas() {
    const q = qrFor(current), n = q.getModuleCount(), cell = 14, quiet = 4;
    const qrSize = (n + quiet * 2) * cell, W = qrSize + 120, H = qrSize + 260;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = MAROON; g.fillRect(0, 0, W, 16);
    g.direction = 'rtl'; g.textAlign = 'center';
    g.fillStyle = NAVY; g.font = 'bold 40px Tajawal, Tahoma, sans-serif';
    g.fillText(TITLE, W / 2, 84);
    g.fillStyle = '#666'; g.font = '24px Tajawal, Tahoma, sans-serif';
    g.fillText($('#qr-sub').textContent, W / 2, 124);
    const ox = (W - qrSize) / 2, oy = 150;
    g.fillStyle = NAVY;
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++)
      if (q.isDark(r, col)) g.fillRect(ox + (col + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
    g.direction = 'ltr'; g.fillStyle = MAROON; g.font = 'bold 26px Tajawal, Tahoma, sans-serif';
    g.fillText(current.replace(/^https?:\/\//, ''), W / 2, oy + qrSize + 50);
    return c;
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('#year').textContent = new Date().getFullYear();
    // small QR of the directory link in the footer (opens the share panel)
    $('#foot-qr').innerHTML = qrFor(baseUrl()).createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace(/fill="black"/g, `fill="${NAVY}"`);
    const modal = $('#shareModal');
    modal.addEventListener('show.bs.modal', update);
    document.querySelectorAll('input[name=shareWhat]').forEach(r => r.addEventListener('change', update));
    $('#copy-link').addEventListener('click', () => copy(current).then(() => toast('تم نسخ الرابط')));
    $('#share-url').addEventListener('focus', e => e.target.select());
    $('#share-native').addEventListener('click', () => navigator.share({ title: TITLE, url: current }).catch(() => {}));
    $('#qr-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = cardCanvas().toDataURL('image/png');
      a.download = 'دليل_موظفي_جامعة_البترا_QR.png';
      document.body.appendChild(a); a.click(); a.remove();
    });
    $('#qr-print').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة');
      w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${TITLE}</title>
        <style>body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:Tajawal,Tahoma,sans-serif}img{width:min(90vw,520px)}</style></head>
        <body><img src="${cardCanvas().toDataURL('image/png')}" alt="${TITLE}" onload="setTimeout(()=>print(),150)"></body></html>`);
      w.document.close();
    });
  });
})();
