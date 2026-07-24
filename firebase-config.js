/* ==========================================================================
   SCHOLAR'S CAMP LMS — FIREBASE INITIALIZATION & DATA LAYER
   Uses the modular Firebase v10 SDK straight from the CDN (no build step,
   no bundler — matches the "flat files, free tools" requirement).

   >>> REPLACE firebaseConfig BELOW WITH YOUR OWN PROJECT KEYS <<<
   Get them from: Firebase Console → Project settings → General → Your apps.
   This file is imported by every page as: <script type="module" src="firebase-config.js">
   ========================================================================== */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updatePassword, setPersistence,
  browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, enableIndexedDbPersistence, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getMessaging, isSupported as messagingIsSupported, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

/* ---------- 1. Project configuration (placeholder — swap in your keys) ---------- */
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "scholars-camp-lms.firebaseapp.com",
  projectId: "scholars-camp-lms",
  storageBucket: "scholars-camp-lms.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

/* ---------- 2. Core service initialization ---------- */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
let messaging = null;
messagingIsSupported().then(ok=>{ if(ok) messaging = getMessaging(app); }).catch(()=>{});
export { messaging };

// >>> Get this from Firebase Console → Project settings → Cloud Messaging →
// Web configuration → "Generate key pair" (Web Push certificate). <<<
const VAPID_KEY = "YOUR_WEB_PUSH_VAPID_KEY";

/**
 * requestNotificationPermission — asks the browser for permission, retrieves
 * an FCM registration token, and stores it on the caller's own profile doc
 * so a Cloud Function (or the admin, via the Firebase console) can target
 * pushes at that device. Safe to call repeatedly; fails silently and returns
 * null if messaging isn't supported, permission is denied, or VAPID_KEY
 * hasn't been configured yet — callers should not treat null as an error.
 */
export async function requestNotificationPermission(role, uid){
  if(!messaging || VAPID_KEY.startsWith('YOUR_')) return null;
  try{
    const permission = await Notification.requestPermission();
    if(permission !== 'granted') return null;
    const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if(token){
      const col = role === 'admin' ? 'admins' : role === 'teacher' ? 'teachers' : 'students';
      await setDoc(doc(db, col, uid), { fcmToken: token }, { merge:true });
    }
    return token;
  }catch(err){ console.warn('Push notification setup skipped:', err.message); return null; }
}

/** Foreground push handler — fires while a Scholar's Camp tab is open and focused. */
export function onForegroundMessage(callback){
  if(!messaging) return;
  onMessage(messaging, (payload)=> callback(payload));
}

// A second, isolated app instance is required so an Admin can create new
// Teacher/Student accounts (createUserWithEmailAndPassword) WITHOUT Firebase
// silently signing the Admin out and switching the active session to the
// brand-new account — a well-known quirk of client-side user creation.
const secondaryApp = getApps().find(a=>a.name==='Secondary') || initializeApp(firebaseConfig, 'Secondary');
const secondaryAuth = getAuth(secondaryApp);

try{ enableIndexedDbPersistence(db); }catch(e){ /* multiple tabs open — persistence silently disabled */ }

/* ---------- 3. Domain helpers: synthetic credentials for ID-based login ----------
   Students/Teachers log in with an ID + Passcode (per spec section 6), not an
   email address. Firebase Auth needs an email/password pair under the hood,
   so we derive a synthetic, non-public email from the issued ID. The real
   secret is the randomly generated passcode, never the derived email.
------------------------------------------------------------------------------- */
export function idToEmail(id){
  return `${id.trim().toLowerCase().replace(/[^a-z0-9]/g,'-')}@members.scholarscamp.app`;
}

/* ---------- 4. Authentication ---------- */
export async function loginAdmin(email, password, rememberMe){
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithId(id, passcode, role, rememberMe){
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, idToEmail(id), passcode);
  return cred.user;
}

export async function logoutUser(){
  await signOut(auth);
  sessionStorage.removeItem('sc_session');
}

export async function resetPasswordByEmail(email){
  return sendPasswordResetEmail(auth, email);
}

/* Admin creates a Teacher or Student account without losing their own session */
export async function adminCreateAccount({ id, passcode, role, profile }){
  const email = idToEmail(id);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, passcode);
  const uid = cred.user.uid;
  await setDoc(doc(db, role === 'teacher' ? 'teachers' : 'students', uid), {
    ...profile, id, uid, role, status: 'active',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  await signOut(secondaryAuth); // free up the secondary slot; admin's primary session is untouched
  return uid;
}

/* ---------- 5. Session bootstrap: watch auth state, resolve role + profile ---------- */
export function watchSession(onReady){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){ sessionStorage.removeItem('sc_session'); onReady(null); return; }
    // Determine role by checking each collection for a matching uid doc.
    const collections = [['admins','admin'], ['teachers','teacher'], ['students','student']];
    for(const [colName, role] of collections){
      const snap = await getDoc(doc(db, colName, user.uid));
      if(snap.exists()){
        const session = { uid:user.uid, role, ...snap.data() };
        sessionStorage.setItem('sc_session', JSON.stringify(session));
        onReady(session);
        return;
      }
    }
    onReady(null);
  });
}

/* ---------- 6. Generic Firestore CRUD helpers (used by every dashboard) ---------- */
export async function addRecord(col, data){
  return addDoc(collection(db, col), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function setRecord(col, id, data){
  return setDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() }, { merge:true });
}
export async function updateRecord(col, id, data){
  return updateDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteRecord(col, id){
  return deleteDoc(doc(db, col, id));
}
export async function getAllRecords(col, ...constraints){
  const q = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
  const snap = await getDocs(q);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export function listenToCollection(col, cb, ...constraints){
  const q = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
  return onSnapshot(q, snap=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export { collection, doc, query, where, orderBy, limit, serverTimestamp, increment };

/* ---------- 7. Storage helpers ---------- */
export function uploadFile(path, file, onProgress){
  return new Promise((resolve, reject)=>{
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on('state_changed',
      (snap)=> onProgress?.(Math.round((snap.bytesTransferred/snap.totalBytes)*100)),
      reject,
      async ()=> resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}
export async function deleteFile(path){
  return deleteObject(ref(storage, path));
}

/* ---------- 8. Archive/soft-delete convention ----------
   Every collection supports Add / Edit / Delete / Archive / Restore per spec.
   "Archive" = updateRecord(col, id, {archived:true}); "Restore" clears it.
------------------------------------------------------------------------- */
export const archiveRecord  = (col,id)=> updateRecord(col, id, { archived:true });
export const restoreRecord  = (col,id)=> updateRecord(col, id, { archived:false });
