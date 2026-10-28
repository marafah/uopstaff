/* Offline support: the pages, scripts and styles are kept on install; data (staff, timetable, calendar…) is
   fetched fresh when online and the last copy is used when offline or when the network is too slow; libraries,
   fonts and photos are kept once used. VERSION changes with every release of the site (the same ?v= the pages use),
   which replaces the kept pages and scripts. */
const VERSION = '202610292300';
const CORE = 'uop-core-' + VERSION, DATA = 'uop-data', LIBS = 'uop-libs';
const PAGES = ['./', 'index.html', 'directory.html', 'timetable.html', 'calendar.html', 'now.html', 'notes.html', 'changes.html', 'makeup.html', 'load.html',
  'phones.html', 'together.html', 'instructor.html', 'planner.html', 'room.html', 'office-hours.html', 'usage.html', 'screen.html', 'trends.html', 'org.html',
  'research.html', 'researchers.html', 'researcher.html', 'publications.html', 'compare.html', 'universities.html', 'network.html', 'publication.html', 'jordan.html', 'journals.html', 'experts.html', 'simulator.html', 'reports.html'];
const SCRIPTS = ['app', 'calendar', 'changes', 'common', 'find', 'instructor', 'load', 'makeup', 'notes', 'now', 'officehours', 'oh-list', 'org', 'phones',
  'planner', 'report', 'room', 'screen', 'share', 'site', 'timetable', 'together', 'trends', 'usage'].map(n => `assets/${n}.js?v=${VERSION}`);
const CORE_FILES = PAGES.concat(SCRIPTS, [`assets/app.css?v=${VERSION}`, 'assets/logo.png', 'manifest.webmanifest', 'assets/icons/icon-192.png']);
const DATA_FILES = ['data/staff.json', 'data/timetable.json', 'data/instructors.json', 'data/calendar.json', 'data/org.json', 'data/org_structure.json', 'data/changes.json'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LIB_FILES = ['https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css', 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2?dd67030699838ea613ee6dbda90effa6',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'];
const SLOW = 6000;  // ms: past this, the kept copy is shown

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const core = await caches.open(CORE);
    await Promise.all(CORE_FILES.map(u => core.add(u).catch(() => {})));  // one missing file does not stop the rest
    const data = await caches.open(DATA);
    await Promise.all(DATA_FILES.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && data.put(u, r)).catch(() => {})));
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_FILES.map(u => caches.match(u).then(have => have || fetch(u, { mode: 'cors' }).then(r => r.ok && libs.put(u, r))).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('uop-core-') && k !== CORE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// network first (with a time limit), else the kept copy; the copy is stored under the address without ?t=… so it is found again
async function fresh(req, cacheName, key) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then(r => { if (r.ok) cache.put(key, r.clone()); return r; });
  const kept = () => cache.match(key, { ignoreSearch: true }).then(r => r || caches.match(key, { ignoreSearch: true }));
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), SLOW))]);
  } catch (err) {
    const r = await kept();
    if (r) { net.catch(() => {}); return r; }
    return net;
  }
}
async function keptFirst(req, cacheName) {
  const r = await caches.match(req);
  if (r) return r;
  const n = await fetch(req);
  if (n.ok || n.type === 'opaque') (await caches.open(cacheName)).put(req, n.clone());
  return n;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);  // path inside the site
    if (req.mode === 'navigate') {
      e.respondWith(fresh(req, CORE, url.origin + url.pathname).catch(() => caches.match('./', { ignoreSearch: true })));
    } else if (path.startsWith('data/')) {
      e.respondWith(fresh(req, DATA, url.origin + url.pathname));
    } else if (path.startsWith('assets/photos/') || path.startsWith('assets/icons/') || /\.(png|jpe?g|svg|webp)$/.test(path)) {
      e.respondWith(keptFirst(req, LIBS));
    } else {
      e.respondWith(caches.match(req).then(r => r || fetch(req)));
    }
  } else if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(keptFirst(req, LIBS));
  }
});
