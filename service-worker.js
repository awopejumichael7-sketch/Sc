/* ==========================================================================
   SCHOLAR'S CAMP LMS — SERVICE WORKER
   Strategy: cache-first for the app shell (HTML/CSS/JS/icons) so the whole
   UI opens instantly offline; network-first for anything else (Firestore
   traffic itself is NOT proxied here — the Firestore SDK has its own
   IndexedDB offline persistence, enabled in firebase-config.js).
   ========================================================================== */

const CACHE_VERSION = 'scholars-camp-v1';
const APP_SHELL = [
  './',
  './index.html',
  './login-admin.html',
  './login-teacher.html',
  './login-student.html',
  './admin-dashboard.html',
  './teacher-dashboard.html',
  './student-dashboard.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './ai-providers.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event)=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache=> cache.addAll(APP_SHELL).catch(()=>{ /* ignore missing during dev */ }))
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=> k !== CACHE_VERSION).map(k=> caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const { request } = event;
  if(request.method !== 'GET') return;

  // Never intercept Firebase/Google API calls — let the Firestore/Auth SDKs
  // manage their own network + offline behaviour.
  if(/googleapis|gstatic|firebaseio|firebaseapp/.test(request.url)) return;

  event.respondWith(
    caches.match(request).then(cached=>{
      const network = fetch(request).then(response=>{
        if(response && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache=> cache.put(request, clone));
        }
        return response;
      }).catch(()=> cached);
      return cached || network;
    })
  );
});

/* ---------- Background sync for offline-created records ----------
   Pages queue pending writes into IndexedDB (via the Firestore SDK's own
   offline queue) — this listener just wakes the page up to flush UI state
   once connectivity returns. */
self.addEventListener('sync', (event)=>{
  if(event.tag === 'scholars-camp-sync'){
    event.waitUntil(self.clients.matchAll().then(clients=>{
      clients.forEach(c=> c.postMessage({ type:'SYNC_RECONNECTED' }));
    }));
  }
});

/* ---------- Push notifications (Firebase Cloud Messaging) ---------- */
self.addEventListener('push', (event)=>{
  const data = event.data ? event.data.json() : { title:"Scholar's Camp", body:'You have a new update.' };
  event.waitUntil(
    self.registration.showNotification(data.title || "Scholar's Camp", {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: data.url || './index.html' }
    })
  );
});

self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  const url = event.notification.data?.url || './index.html';
  event.waitUntil(clients.openWindow(url));
});
