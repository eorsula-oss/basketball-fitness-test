const C='basketball-fitness-test-v21',FILES=['./?v=21','index.html?v=21','styles.css?v=21','enhancements.css?v=21','brand.css?v=21','mobile-groups.css?v=21','backup.css?v=21','app.js?v=21','enhancements.js?v=21','supabase-config.js?v=21','backup.js?v=21','release-notes.json?v=21','manifest.webmanifest?v=21','bc-pesch-logo.png?v=21'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('basketball-fitness-test-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)))});
