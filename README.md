# Scholar's Camp LMS — Setup Guide

A flat, no-build, Firebase-backed PWA: landing page + Admin / Teacher / Student
dashboards, real Firestore CRUD, Firebase Storage uploads, PWA install/offline,
and a free multi-provider AI layer. Every file sits in one folder and links to
the others directly by filename — no subfolders, no bundler, no npm install.

## 1. What's fully working out of the box (once you add your Firebase keys)

**Core platform**
- Landing page, light/dark mode, installable PWA, offline app shell
- Admin, Teacher, and Student login with real Firebase Authentication
- Admin: create/edit/deactivate/delete Students & Teachers with auto-generated IDs and passcodes, unlimited course creation, file uploads to Firebase Storage **or** import by Google Drive link, announcements, analytics charts, CSV/PDF export
- Teacher: assigned courses only, uploads, in-browser session recording, attendance, objective & theory exam questions, AI-assisted translation for grading
- Student: enrolled courses, library (streaming-only audio/video), AI Tutor chat with speech-to-text, exams, grades/progress, profile
- Firestore & Storage security rules enforcing role-based access
- Free multi-provider AI layer with automatic failover: Gemini → Hugging Face → Cloudflare Workers AI → Ollama
- Push notifications via Firebase Cloud Messaging (optional VAPID key)

**Added in this round — all free, no paid tier required**
- **Study Tools** (`study-tools.html`): scientific calculator, formula solver, graph plotter, full periodic table, dictionary (dictionaryapi.dev, no key), code editor with syntax highlighting, virtual whiteboard — all client-side, most work fully offline
- **Discussion Forum & Live Chat** (`forum.html`): per-course forum threads and real-time chat rooms, powered by Firestore's free real-time listeners
- **Live Class** (`live-class.html`): real WebRTC video — teacher broadcasts, students join and watch. Signaling runs over Firestore (free); media travels browser-to-browser using Google's free public STUN server. *Honest limitation:* on very restrictive networks (some school firewalls) a direct connection can fail without a TURN relay, which typically isn't free at scale — see the note in §4 below for a free-tier option.
- **Help Center** (`help-center.html`): FAQ plus a real support ticket system (Firestore-backed)
- **Timetable & Events** (`timetable.html`): admin-managed weekly timetable and campus events, visible to everyone
- **Class Leaderboard**: ranks students by XP within their class level, using a privacy-safe collection that only exposes name + XP, never full profiles
- **Digital ID Card**: QR-code student ID card generated client-side (QRCode.js, free), downloadable as an image
- **Two-Factor Authentication**: free, offline TOTP (RFC 6238) for admin accounts — scan with Google Authenticator/Authy, no SMS provider, no cost. Set up under Admin → Settings → Two-Factor Authentication; it's then enforced automatically at the next admin login.
- **Google Drive import**: paste a "Anyone with the link can view" Drive share link straight into Admin → Uploads — no Google Cloud project, no OAuth setup, no billing
- **SEO**: `robots.txt` + `sitemap.xml`

## 2. What's still intentionally out of scope

A platform matching Coursera/Canvas/Khan Academy in full (37 feature sections) also
includes things like a many-to-many video conferencing grid (true multi-party
video at scale needs a paid SFU media server — free peer-to-peer, which is what's
here, works great for a teacher-to-class broadcast but not a full Zoom-style grid),
a Google Drive OAuth *picker* (vs. the free link-import above), and SMS-based
OTP (SMS gateways are not free — TOTP was used instead, which is both free and
arguably more secure). Nothing here fakes these — they're simply not included,
so nothing in the app claims to work when it doesn't.

## 3. First-time setup (10–15 minutes)

1. **Create a Firebase project** at https://console.firebase.google.com — free "Spark" plan is enough.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Firestore Database** (production mode, any region).
4. Enable **Storage**.
5. In Project settings → General → "Your apps", add a **Web app** and copy the config object.
6. Paste those values into `firebaseConfig` at the top of `firebase-config.js`.
7. Deploy the security rules (optional but recommended):
   ```
   npm install -g firebase-tools
   firebase login
   firebase init   # choose Hosting + Firestore + Storage, point to this folder
   firebase deploy --only firestore:rules,storage:rules
   ```
8. **Create your first Administrator account:**
   - Firebase Console → Authentication → Add user → enter an email + password.
   - Copy the generated User UID.
   - Firestore → start a collection called `admins` → document ID = that UID → add fields `fullName` (string) and `role` = `"admin"`.
   - Go to `login-admin.html` and sign in with that email/password.
9. From the Admin dashboard, create your first Course, then create Teachers and Students — IDs and passcodes are generated automatically and shown once on screen.

## 4. Turning on push notifications (optional)

1. Firebase Console → Project settings → **Cloud Messaging** → Web configuration → **Generate key pair**.
2. Copy that Web Push VAPID key into `VAPID_KEY` in `firebase-config.js`.
3. Keep `firebase-messaging-sw.js`'s `firebaseConfig` object in sync with the one in `firebase-config.js` (same project, same keys) — Firebase Cloud Messaging requires this file to sit at the site root with matching config.
4. Reload any dashboard — it will prompt the signed-in user for notification permission and store their device token on their own profile document (`fcmToken` field) for you to target from a Cloud Function or the Firebase console's "Send test message" tool.

Leaving `VAPID_KEY` as the placeholder is fine — the app skips push setup silently and everything else keeps working.

### Optional: free TURN relay for Live Class

`live-class.html` uses only free public STUN servers by default, which is
enough for the vast majority of home and school networks. If some students
consistently fail to connect (common on networks with strict symmetric NAT
or corporate/school firewalls), add a free-tier TURN relay — for example
Metered.ca's free plan (20 GB/month) or Cloudflare Calls' free tier — then
uncomment and fill in the `turn:` entry in the `RTC_CONFIG.iceServers` array
near the top of `live-class.js`. This is optional; nothing breaks if you skip it.

## 5. Adding free AI keys (optional but recommended)

Open `ai-providers.js` and fill in any of:
- `gemini` — free key from https://aistudio.google.com/app/apikey
- `huggingface` — free token from https://huggingface.co/settings/tokens
- `cloudflare` — free Workers AI account + token from https://developers.cloudflare.com/workers-ai
- `ollamaUrl` — only if you're running Ollama locally on the same network

Leave any key as the placeholder text to skip that provider — the app will
automatically try the next one in the list.

## 6. Deploying

```
firebase deploy --only hosting
```
Your app will be live at `https://<your-project-id>.web.app`, installable on
any device, and working offline for previously visited pages/content.

## 7. File map (all flat, all linked directly by filename)

```
index.html                → landing page
login-admin.html           login-teacher.html           login-student.html
admin-dashboard.html       teacher-dashboard.html       student-dashboard.html
admin-dashboard.js         teacher-dashboard.js         student-dashboard.js
study-tools.html / .js    → calculator, formula solver, graph plotter, periodic table, dictionary, code editor, whiteboard
forum.html / .js          → discussion forum + per-course live chat
live-class.html / .js     → WebRTC live class (teacher broadcasts, students watch)
help-center.html / .js    → FAQ + support tickets
timetable.html / .js      → weekly timetable + campus events
elements-data.js          → periodic table dataset (used by study-tools.js)
totp.js                   → shared free TOTP (2FA) module, used by admin login + settings
style.css                 → shared design system
app.js                    → shared utilities (theme, toasts, modals, ID generation…)
firebase-config.js        → Firebase init + Auth/Firestore/Storage/Messaging helpers
ai-providers.js           → free AI layer with automatic failover
manifest.json             → PWA manifest
service-worker.js         → app-shell offline caching (installable PWA)
firebase-messaging-sw.js  → dedicated background service worker for push notifications
icon-192.png / icon-512.png → app icons
robots.txt / sitemap.xml  → SEO crawl rules
firestore.rules / storage.rules / firebase.json / .firebaserc → security & deploy config
```

## 8. Confirming everything here is free

| Feature | Technology used | Cost |
|---|---|---|
| Hosting, Auth, Database, Storage | Firebase Spark (free) plan | $0, generous free quotas |
| AI Tutor / translation / grading help | Gemini, Hugging Face, Cloudflare Workers AI, Ollama — all free tiers | $0 |
| Push notifications | Firebase Cloud Messaging | $0 |
| Dictionary | dictionaryapi.dev (public, no key) | $0 |
| Calculator / Formula Solver / Graph Plotter | math.js (MIT license, CDN) | $0 |
| Code highlighting | Prism.js (MIT license, CDN) | $0 |
| QR codes (2FA + Digital ID) | QRCode.js (MIT license, CDN) | $0 |
| Charts | Chart.js (MIT license, CDN) | $0 |
| Two-Factor Authentication | Browser-native Web Crypto (RFC 6238 TOTP) | $0, no SMS provider |
| Live Class video | Browser WebRTC + free Google STUN servers | $0 (optional TURN relay also has a free tier — see §4) |
| Forum / Live Chat / Leaderboard / Timetable | Firestore free tier | $0 |
| Google Drive materials | Plain share links, no API/OAuth | $0 |

Nothing in this build requires a credit card. The only two things worth
double-checking as your usage grows are Firebase's free-tier **read/write
quotas** (generous for a single school, but worth monitoring in the Firebase
console) and, if you add TURN, that provider's free bandwidth cap.
