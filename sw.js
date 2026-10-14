const C='basketball-fitness-test-v20',FILES=['./','index.html','styles.css','enhancements.css','brand.css','mobile-groups.css','backup.css','app.js','enhancements.js','supabase-config.js','backup.js','release-notes.json','manifest.webmanifest','bc-pesch-logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('basketball-fitness-test-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));

