const CACHE_NAME = 'loto-bonheur-v2.1.2';
const ASSETS_CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/data/real_data.json'
];

// Install - precache core
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_CORE).catch(e=>{ console.warn('precache fail', e); }))
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(()=> self.clients.claim())
  );
});

// Fetch - advanced strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ignore chrome extensions etc
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API proxy - network only (no cache) but with offline fallback
  if (url.pathname.startsWith('/lonaci-proxy') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then(res => {
        if(res.ok && req.url.startsWith(self.location.origin)){
          const clone=res.clone();
          caches.open(CACHE_NAME).then(c=>c.put(req,clone));
        }
        return res;
      }).catch(()=> caches.match(req).then(r=> r || new Response(JSON.stringify({error:'offline'}), {status:503, headers:{'Content-Type':'application/json'}})))
    );
    return;
  }

  // Navigation - network-first with offline fallback to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(async () => {
        const cached = await caches.match(req);
        if(cached) return cached;
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Assets (js/css/fonts/json) - stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req).then(networkRes => {
        if(networkRes.ok){
          // Only cache same-origin and cdn fontsource
          if(url.origin === self.location.origin || url.hostname.includes('jsdelivr.net')){
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
        }
        return networkRes;
      }).catch(()=> null);
      return cached || fetched || fetch(req);
    })
  );
});

// Optional background sync for logs
self.addEventListener('message', (event)=>{
  if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});
