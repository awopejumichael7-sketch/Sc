/* ==========================================================================
   SCHOLAR'S CAMP LMS — SHARED APP UTILITIES
   Loaded on every page. Provides: theme toggling, toast notifications,
   mobile nav/sidebar toggling, scroll reveal, ID/passcode generation,
   CSV export, and small DOM helpers used by the dashboard pages.
   Depends on nothing (plain ES module) so it is safe to import first.
   ========================================================================== */

/* ---------- Theme (Light / Dark / Auto) ---------- */
export function initTheme(){
  const saved = localStorage.getItem('sc_theme') || 'auto';
  applyTheme(saved);
  document.querySelectorAll('[data-theme-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('sc_theme', next);
    });
  });
}
function applyTheme(mode){
  let resolved = mode;
  if(mode === 'auto'){
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelectorAll('[data-theme-icon]').forEach(el=>{
    el.className = resolved === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
}

/* ---------- Toast notifications ---------- */
export function toast(message, type = 'info'){
  let stack = document.querySelector('.toast-stack');
  if(!stack){
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icons = { success:'circle-check', error:'circle-exclamation', info:'circle-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid fa-${icons[type]||'circle-info'}"></i><span>${message}</span>`;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; setTimeout(()=>el.remove(),250); }, 3800);
}

/* ---------- Mobile nav / sidebar toggle ---------- */
export function initMobileNav(){
  document.querySelectorAll('[data-nav-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = document.querySelector(btn.dataset.navToggle);
      target?.classList.toggle('open');
    });
  });
}

/* ---------- Scroll reveal ---------- */
export function initReveal(){
  const els = document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){ els.forEach(e=>e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold:.14 });
  els.forEach(e=>io.observe(e));
}

/* ---------- FAQ accordion ---------- */
export function initFaq(){
  document.querySelectorAll('.faq-item').forEach(item=>{
    item.querySelector('.faq-q')?.addEventListener('click', ()=>{
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
      if(!wasOpen) item.classList.add('open');
    });
  });
}

/* ---------- Tabs ---------- */
export function initTabs(){
  document.querySelectorAll('[data-tab-group]').forEach(group=>{
    const buttons = group.querySelectorAll('.tab-btn');
    buttons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        buttons.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const panels = document.querySelectorAll(`[data-tab-panel-group="${group.dataset.tabGroup}"] .tab-panel`);
        panels.forEach(p=>p.classList.remove('active'));
        document.getElementById(btn.dataset.tabTarget)?.classList.add('active');
      });
    });
  });
}

/* ---------- Modal helpers ---------- */
export function openModal(id){ document.getElementById(id)?.classList.add('show'); }
export function closeModal(id){ document.getElementById(id)?.classList.remove('show'); }
export function initModalCloseOnBackdrop(){
  document.querySelectorAll('.modal-backdrop').forEach(bd=>{
    bd.addEventListener('click', (e)=>{ if(e.target === bd) bd.classList.remove('show'); });
  });
}

/* ---------- ID / Passcode generation ----------
   Student ID:  SC-STU-YYYY-#### (e.g. SC-STU-2026-0417)
   Teacher ID:  SC-TCH-YYYY-###
   Passcodes:   8-character alphanumeric, unambiguous character set
------------------------------------------------------------------ */
export function generateStudentId(sequence){
  const year = new Date().getFullYear();
  return `SC-STU-${year}-${String(sequence).padStart(4,'0')}`;
}
export function generateTeacherId(sequence){
  const year = new Date().getFullYear();
  return `SC-TCH-${year}-${String(sequence).padStart(3,'0')}`;
}
export function generatePasscode(length = 8){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let out = '';
  const rnd = new Uint32Array(length);
  (window.crypto || window.msCrypto).getRandomValues(rnd);
  for(let i=0;i<length;i++) out += chars[rnd[i] % chars.length];
  return out;
}
export function generateOtp(){
  return String(Math.floor(100000 + Math.random()*900000));
}

/* ---------- CSV export ---------- */
export function exportToCsv(filename, rows){
  if(!rows || !rows.length){ toast('Nothing to export yet.', 'error'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(
    rows.map(r=> headers.map(h=> `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(','))
  ).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ---------- Simple print-to-PDF export (uses the browser's native PDF printer,
   which is the reliable free option here — no paid PDF library required) ---- */
export function exportToPdf(title, htmlContent){
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>${title}</title>
    <style>
      body{font-family:Inter,sans-serif;padding:32px;color:#14213A;}
      h1{font-family:Georgia,serif;color:#1E3A8A;}
      table{width:100%;border-collapse:collapse;margin-top:16px;}
      th,td{border:1px solid #E4E0D6;padding:8px 10px;font-size:13px;text-align:left;}
      th{background:#F8F6F0;}
    </style></head><body>
    <h1>${title}</h1>${htmlContent}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(), 300);
}

/* ---------- Auth-guard: redirect if the wrong / no role is present ----------
   Called at the top of each dashboard page. Reads the lightweight session
   object written by firebase-config.js's onAuthStateChanged listener.
------------------------------------------------------------------------- */
export function requireRole(role){
  const session = JSON.parse(sessionStorage.getItem('sc_session') || 'null');
  if(!session || session.role !== role){
    window.location.href = `login-${role}.html`;
    return null;
  }
  return session;
}

export function logout(){
  sessionStorage.removeItem('sc_session');
  window.location.href = 'index.html';
}

/* ---------- Service worker registration ---------- */
export function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('service-worker.js').catch(()=>{ /* offline-safe, ignore */ });
    });
  }
}

/* ---------- Install prompt (PWA "Add to Home Screen") ---------- */
let deferredInstallPrompt = null;
export function initInstallPrompt(){
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    document.querySelectorAll('[data-install-btn]').forEach(b=> b.classList.remove('hidden'));
  });
  document.querySelectorAll('[data-install-btn]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    });
  });
}

/* ---------- Bootstrapping every page ---------- */
export function bootCommon(){
  initTheme();
  initMobileNav();
  initReveal();
  initFaq();
  initTabs();
  initModalCloseOnBackdrop();
  registerServiceWorker();
  initInstallPrompt();
  // Footer year
  document.querySelectorAll('[data-year]').forEach(el=> el.textContent = new Date().getFullYear());
}
