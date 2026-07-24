/* ==========================================================================
   SCHOLAR'S CAMP LMS — STUDY TOOLS
   Every tool here runs on free, client-side technology:
   - Calculator / Formula Solver / Graph Plotter: math.js (free, MIT, CDN)
   - Periodic Table: static local data, no network call
   - Dictionary: dictionaryapi.dev — free, public, no API key required
   - Code Editor: Prism.js (free, MIT, CDN) for highlighting; JS execution
     happens locally in the browser sandbox, no server involved
   - Whiteboard: plain <canvas>, no library needed
   ========================================================================== */
import { bootCommon, toast } from './app.js';
import { ELEMENTS } from './elements-data.js';

bootCommon();
document.getElementById('backLink').addEventListener('click', ()=>{
  const session = JSON.parse(sessionStorage.getItem('sc_session') || 'null');
  window.location.href = session?.role === 'teacher' ? 'teacher-dashboard.html'
    : session?.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
});

document.querySelectorAll('.side-link[data-section]').forEach(link=>{
  link.addEventListener('click', ()=>{
    document.querySelectorAll('.side-link[data-section]').forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById(`sec-${link.dataset.section}`).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
  });
});

/* =========================================================================
   SCIENTIFIC CALCULATOR
   ========================================================================= */
const calcKeys = ['C','(',')','←','sin(','cos(','tan(','log(','7','8','9','/','sqrt(','^','!','pi','4','5','6','*','ln(','e','%','ans','1','2','3','-','0','.','=','+'];
let calcAns = 0;
const calcDisplay = document.getElementById('calcDisplay');
const calcGrid = document.getElementById('calcGrid');
calcGrid.innerHTML = calcKeys.map(k=>`<button class="btn btn-ghost btn-sm" data-key="${k}" style="padding:12px 0;">${k}</button>`).join('');
calcGrid.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const key = btn.dataset.key;
  if(key === 'C'){ calcDisplay.value = '0'; return; }
  if(key === '←'){ calcDisplay.value = calcDisplay.value.slice(0,-1) || '0'; return; }
  if(key === 'ans'){ calcDisplay.value = (calcDisplay.value==='0'?'':calcDisplay.value) + calcAns; return; }
  if(key === '='){
    try{
      const result = math.evaluate(calcDisplay.value.replace(/\^/g,'^'));
      calcAns = result;
      calcDisplay.value = String(result);
    }catch(err){ calcDisplay.value = 'Error'; }
    return;
  }
  calcDisplay.value = (calcDisplay.value === '0' ? '' : calcDisplay.value) + key;
});

/* =========================================================================
   FORMULA SOLVER (math.js — handles expressions; simple linear equations
   in x are solved by sampling, since a full symbolic CAS isn't a free/light
   dependency worth adding for K-12/A-Level use cases)
   ========================================================================= */
document.getElementById('solveBtn').addEventListener('click', ()=>{
  const input = document.getElementById('solverInput').value.trim();
  const box = document.getElementById('solverResult');
  if(!input){ box.textContent = 'Enter an expression first.'; return; }
  try{
    if(input.includes('=')){
      const [left, right] = input.split('=');
      const f = (x)=> math.evaluate(left, { x }) - math.evaluate(right, { x });
      const f0 = f(0), f1 = f(1);
      const slope = f1 - f0;
      if(Math.abs(slope) < 1e-9){ box.textContent = 'This does not look like a simple linear equation in x — try a plain expression instead.'; return; }
      const x = -f0 / slope;
      box.innerHTML = `<strong>x = ${math.format(x, { precision:8 })}</strong>`;
    }else{
      const result = math.evaluate(input);
      box.innerHTML = `<strong>${math.format(result, { precision:8 })}</strong>`;
    }
  }catch(err){ box.textContent = 'Could not parse that expression — check the syntax.'; }
});

/* =========================================================================
   GRAPH PLOTTER
   ========================================================================= */
function plotFunction(expr){
  const canvas = document.getElementById('plotCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const xMin=-10, xMax=10, yMin=-10, yMax=10;
  const toPx = (x,y)=>[ (x-xMin)/(xMax-xMin)*w, h - (y-yMin)/(yMax-yMin)*h ];
  // axes
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
  ctx.beginPath(); const [ox,] = toPx(0,0); ctx.moveTo(ox,0); ctx.lineTo(ox,h); ctx.stroke();
  ctx.beginPath(); const [,oy] = toPx(0,0); ctx.moveTo(0,oy); ctx.lineTo(w,oy); ctx.stroke();
  try{
    const node = math.compile(expr);
    ctx.strokeStyle = '#1E3A8A'; ctx.lineWidth = 2.4; ctx.beginPath();
    let started = false;
    for(let px=0; px<=w; px++){
      const x = xMin + (px/w)*(xMax-xMin);
      let y;
      try{ y = node.evaluate({ x }); }catch{ y = NaN; }
      if(typeof y !== 'number' || !isFinite(y) || y < yMin-5 || y > yMax+5){ started = false; continue; }
      const [px2, py2] = toPx(x,y);
      if(!started){ ctx.moveTo(px2,py2); started = true; } else { ctx.lineTo(px2,py2); }
    }
    ctx.stroke();
  }catch(err){ toast('Could not plot that function — check the syntax.', 'error'); }
}
document.getElementById('plotBtn').addEventListener('click', ()=> plotFunction(document.getElementById('plotInput').value.trim() || 'x'));
window.addEventListener('load', ()=> plotFunction('sin(x)'));

/* =========================================================================
   PERIODIC TABLE
   ========================================================================= */
const CATEGORY_COLORS = {
  'alkali':'#F87171','alkaline-earth':'#FBBF24','transition':'#60A5FA','post-transition':'#34D399',
  'metalloid':'#A78BFA','nonmetal':'#4ADE80','halogen':'#FB923C','noble-gas':'#38BDF8',
  'lanthanide':'#F472B6','actinide':'#E879F9'
};
const periodicGrid = document.getElementById('periodicGrid');
periodicGrid.innerHTML = ELEMENTS.map(el=>`
  <button title="${el.name}" data-n="${el.n}" style="grid-row:${el.row};grid-column:${el.col};aspect-ratio:1;border:none;border-radius:4px;background:${CATEGORY_COLORS[el.cat]}22;color:var(--text);font-size:.62rem;font-weight:700;cursor:pointer;padding:2px;">
    <div style="font-size:.55rem;opacity:.7;">${el.n}</div>${el.sym}
  </button>`).join('');
periodicGrid.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const el = ELEMENTS.find(x=>x.n === Number(btn.dataset.n));
  const box = document.getElementById('elementDetail');
  box.style.display = 'block';
  box.innerHTML = `<div class="flex items-center gap-16">
    <div style="width:56px;height:56px;border-radius:12px;background:${CATEGORY_COLORS[el.cat]}33;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.3rem;">${el.sym}</div>
    <div><h3 style="margin:0;">${el.name}</h3><span class="badge badge-blue">Atomic #${el.n}</span> <span class="badge badge-gold">${el.cat.replace('-',' ')}</span></div>
  </div>`;
});

/* =========================================================================
   DICTIONARY (dictionaryapi.dev — free, no key)
   ========================================================================= */
document.getElementById('dictBtn').addEventListener('click', async ()=>{
  const word = document.getElementById('dictInput').value.trim();
  const box = document.getElementById('dictResult');
  if(!word) return;
  box.textContent = 'Looking up…';
  try{
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if(!res.ok) throw new Error('not found');
    const data = await res.json();
    const entry = data[0];
    box.innerHTML = `<strong>${entry.word}</strong> ${entry.phonetic ? `<span class="text-muted">${entry.phonetic}</span>` : ''}<br>` +
      entry.meanings.slice(0,3).map(m=>`<div class="mt-8"><em>${m.partOfSpeech}</em>: ${m.definitions[0].definition}</div>`).join('');
  }catch(err){ box.textContent = `No definition found for "${word}".`; }
});

/* =========================================================================
   CODE EDITOR
   ========================================================================= */
document.getElementById('runCodeBtn').addEventListener('click', ()=>{
  const out = document.getElementById('codeOutput');
  const lang = document.getElementById('codeLang').value;
  if(lang !== 'javascript'){ out.textContent = 'Only JavaScript can run in-browser. Python is available for editing and highlighting.'; return; }
  const code = document.getElementById('codeInput').value;
  const logs = [];
  const fakeConsole = { log: (...args)=> logs.push(args.map(a=> typeof a==='object' ? JSON.stringify(a) : String(a)).join(' ')) };
  try{
    // eslint-disable-next-line no-new-func
    new Function('console', code)(fakeConsole);
    out.textContent = logs.join('\n') || '(no output)';
  }catch(err){ out.textContent = 'Error: ' + err.message; }
});
document.getElementById('highlightBtn').addEventListener('click', ()=>{
  const lang = document.getElementById('codeLang').value;
  const preview = document.getElementById('codePreview');
  preview.className = `language-${lang}`;
  preview.textContent = document.getElementById('codeInput').value;
  document.getElementById('codePreviewWrap').style.display = 'block';
  Prism.highlightElement(preview);
});

/* =========================================================================
   VIRTUAL WHITEBOARD
   ========================================================================= */
const wb = document.getElementById('wbCanvas');
const wctx = wb.getContext('2d');
wctx.fillStyle = '#fff'; wctx.fillRect(0,0,wb.width,wb.height);
let drawing = false, lastX = 0, lastY = 0;
function wbPos(e){
  const rect = wb.getBoundingClientRect();
  const scaleX = wb.width / rect.width, scaleY = wb.height / rect.height;
  const point = e.touches ? e.touches[0] : e;
  return [ (point.clientX - rect.left) * scaleX, (point.clientY - rect.top) * scaleY ];
}
function startDraw(e){ drawing = true; [lastX,lastY] = wbPos(e); }
function moveDraw(e){
  if(!drawing) return;
  e.preventDefault();
  const [x,y] = wbPos(e);
  wctx.strokeStyle = document.getElementById('wbColor').value;
  wctx.lineWidth = document.getElementById('wbSize').value;
  wctx.lineCap = 'round';
  wctx.beginPath(); wctx.moveTo(lastX,lastY); wctx.lineTo(x,y); wctx.stroke();
  [lastX,lastY] = [x,y];
}
function endDraw(){ drawing = false; }
['mousedown','touchstart'].forEach(ev=> wb.addEventListener(ev, startDraw));
['mousemove','touchmove'].forEach(ev=> wb.addEventListener(ev, moveDraw, { passive:false }));
['mouseup','mouseleave','touchend'].forEach(ev=> wb.addEventListener(ev, endDraw));
document.getElementById('wbClear').addEventListener('click', ()=>{ wctx.fillStyle='#fff'; wctx.fillRect(0,0,wb.width,wb.height); });
document.getElementById('wbDownload').addEventListener('click', ()=>{
  const link = document.createElement('a'); link.download = 'whiteboard.png'; link.href = wb.toDataURL(); link.click();
});
