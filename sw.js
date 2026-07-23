/* Service Worker: App-Shell offline verfügbar machen (Kursdaten kommen live/aus localStorage) */
const CACHE='tsla-signal-v1.1.1';
const SHELL=['index.html','styles.css','app.js','manifest.webmanifest','icon.svg'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  // API-Aufrufe niemals cachen — immer live
  if(url.hostname.includes('alphavantage')||url.hostname.includes('twelvedata')) return;
  // App-Shell: cache-first
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(resp=>{
      if(e.request.method==='GET' && resp.ok && url.origin===location.origin){
        const clone=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,clone));
      }
      return resp;
    }).catch(()=>caches.match('index.html')))
  );
});
