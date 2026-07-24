/* ==========================================================================
   SCHOLAR'S CAMP LMS — FIREBASE CLOUD MESSAGING SERVICE WORKER
   Firebase Web Push requires this exact file, at the site root, registered
   under its own scope — separate from service-worker.js (which handles the
   PWA app-shell/offline caching). The browser auto-registers this one the
   first time getToken() is called from firebase-config.js.
   >>> Keep this firebaseConfig in sync with the one in firebase-config.js <<<
   ========================================================================== */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "scholars-camp-lms.firebaseapp.com",
  projectId: "scholars-camp-lms",
  storageBucket: "scholars-camp-lms.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Fires when a push arrives while no Scholar's Camp tab is focused.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Scholar's Camp";
  const options = {
    body: payload.notification?.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: payload.data?.url || './index.html' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './index.html';
  event.waitUntil(clients.openWindow(url));
});
