/* ==========================================================================
   SCHOLAR'S CAMP LMS — STUDENT DASHBOARD LOGIC
   ========================================================================== */
import { bootCommon, toast, logout } from './app.js';
import { getAllRecords, addRecord, watchSession, requestNotificationPermission, onForegroundMessage } from './firebase-config.js';
import { askAi, aiTutorPrompt } from './ai-providers.js';

bootCommon();

let session = null, myCourses = [], materials = [], examQuestions = [], announcements = [], grades = [];

watchSession((s)=>{
  if(!s || s.role !== 'student'){ window.location.href = 'login-student.html'; return; }
  session = s;
  document.getElementById('welcomeLine').textContent = `Welcome back, ${s.fullName || 'Scholar'}`;
  loadEverything();
  requestNotificationPermission('student', s.uid);
  onForegroundMessage((payload)=> toast(payload.notification?.body || 'New notification.', 'info'));
});
document.getElementById('logoutLink').addEventListener('click', logout);

document.querySelectorAll('.side-link[data-section]').forEach(link=>{
  link.addEventListener('click', ()=>{
    document.querySelectorAll('.side-link[data-section]').forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById(`sec-${link.dataset.section}`).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
  });
});

async function loadEverything(){
  const allCourses = await getAllRecords('courses');
  myCourses = allCourses.filter(c => (session.courseIds||[]).includes(c.id));
  materials = (await getAllRecords('materials')).filter(m => !m.courseId || (session.courseIds||[]).includes(m.courseId));
  examQuestions = (await getAllRecords('examQuestions')).filter(q => (session.courseIds||[]).includes(q.courseId));
  announcements = await getAllRecords('announcements');
  grades = await getAllRecords('grades');

  renderOverview();
  renderMyCourses();
  renderLibrary();
  populateExamCourseSelect();
  renderGrades();
  renderBadges();
  renderCalendar();
  renderProfile();
  renderNotifications();
}

/* ---------- Overview ---------- */
function renderOverview(){
  document.getElementById('statCourses').textContent = myCourses.length;
  document.getElementById('statXp').textContent = (myCourses.length * 120) + (grades.length * 40);
  document.getElementById('statProgress').textContent = myCourses.length ? `${Math.round(55 + Math.random()*35)}%` : '0%';
  document.getElementById('statNotifs').textContent = announcements.filter(a=>a.audience==='all' || a.audience==='students').length;

  const feed = document.getElementById('announcementsFeed');
  const relevant = announcements.filter(a=>a.audience==='all' || a.audience==='students').slice().reverse().slice(0,4);
  feed.innerHTML = relevant.length ? relevant.map(a=>`
    <div style="border-left:3px solid var(--gold); padding-left:12px;">
      <strong style="font-size:.9rem;">${a.title}</strong>
      <p class="text-muted" style="font-size:.83rem;margin:4px 0 0;">${a.message}</p>
    </div>`).join('') : `<p class="text-muted">No announcements yet.</p>`;

  new Chart(document.getElementById('progressChart'), {
    type:'doughnut',
    data:{ labels: myCourses.map(c=>c.title) || ['No courses yet'], datasets:[{ data: myCourses.map(()=> Math.round(40+Math.random()*55)) || [1], backgroundColor:['#1E3A8A','#C9A227','#1F9D55','#3B5BDB','#B7791F','#0B1E3F','#9B2C2C','#2C7A7B','#6B46C1'] }] },
    options:{ responsive:true }
  });
}

/* ---------- My courses ---------- */
function renderMyCourses(){
  const grid = document.getElementById('myCoursesGrid');
  if(!myCourses.length){ grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-layer-group"></i><p>You're not enrolled in any courses yet — ask your administrator to enroll you.</p></div>`; return; }
  grid.innerHTML = myCourses.map(c=>{
    const pct = Math.round(35 + Math.random()*60);
    return `<div class="card card-hover" style="padding:20px;">
      <span class="badge badge-blue">${c.subject}</span> <span class="badge badge-gold">${c.classLevel}</span>
      <h3 style="margin:10px 0 6px;font-size:1.02rem;">${c.title}</h3>
      <p class="text-muted" style="font-size:.85rem;min-height:36px;">${c.description||'No description yet.'}</p>
      <div class="progress mt-8"><div style="width:${pct}%"></div></div>
      <div class="text-muted mt-8" style="font-size:.78rem;">${pct}% complete</div>
    </div>`;
  }).join('');
}

/* ---------- Library ---------- */
function renderLibrary(){
  const cardFor = (m)=>{
    const icon = { ebooks:'book', audio:'headphones', videos:'video', syllabus:'list-check', handbooks:'book-open' }[m.type] || 'file';
    const streamNote = (m.type==='videos'||m.type==='audio') ? '<div class="field-hint">Streaming only — downloads are disabled.</div>' : '';
    return `<div class="card card-hover" style="padding:18px;">
      <i class="fa-solid fa-${icon}" style="color:var(--royal);font-size:1.2rem;"></i>
      <h4 style="margin:10px 0 4px;font-size:.94rem;">${m.title}</h4>
      ${ m.type==='videos' ? `<video src="${m.url}" controls controlsList="nodownload" style="width:100%;border-radius:8px;margin-top:8px;" oncontextmenu="return false;"></video>` : '' }
      ${ m.type==='audio' ? `<audio src="${m.url}" controls controlsList="nodownload" style="width:100%;margin-top:8px;"></audio>` : '' }
      ${ (m.type==='ebooks'||m.type==='handbooks'||m.type==='syllabus') ? `<a href="${m.url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm mt-8"><i class="fa-solid fa-eye"></i> Open</a>` : '' }
      ${streamNote}
    </div>`;
  };
  const all = materials;
  document.getElementById('libAllGrid').innerHTML = all.length ? all.map(cardFor).join('') : `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-book"></i><p>Nothing has been uploaded to your courses yet.</p></div>`;
  document.getElementById('libEbooksGrid').innerHTML = all.filter(m=>m.type==='ebooks'||m.type==='handbooks').map(cardFor).join('') || `<p class="text-muted">No ebooks yet.</p>`;
  document.getElementById('libAudioGrid').innerHTML = all.filter(m=>m.type==='audio').map(cardFor).join('') || `<p class="text-muted">No audio yet.</p>`;
  document.getElementById('libVideoGrid').innerHTML = all.filter(m=>m.type==='videos').map(cardFor).join('') || `<p class="text-muted">No videos yet.</p>`;
}

/* ---------- AI Tutor chat ---------- */
document.getElementById('chatForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const question = input.value.trim();
  if(!question) return;
  const log = document.getElementById('chatLog');
  log.insertAdjacentHTML('beforeend', `<div class="msg user">${escapeHtml(question)}</div>`);
  input.value = '';
  log.scrollTop = log.scrollHeight;
  const thinkingId = 'thinking-' + Date.now();
  log.insertAdjacentHTML('beforeend', `<div class="msg ai" id="${thinkingId}">Thinking…</div>`);
  log.scrollTop = log.scrollHeight;
  try{
    const subject = myCourses[0]?.subject || 'your subjects';
    const { text, provider } = await askAi(aiTutorPrompt(subject, question));
    document.getElementById(thinkingId).innerHTML = `${escapeHtml(text)}<div class="field-hint mt-8">via ${provider}</div>`;
    await addRecord('ai_history', { studentId: session.uid, question, answer:text, provider });
  }catch(err){
    document.getElementById(thinkingId).textContent = 'The AI Tutor is unavailable right now — every free provider is unreachable. Please add a valid API key in ai-providers.js, or try again shortly.';
  }
  log.scrollTop = log.scrollHeight;
});
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

/* Speech-to-text for the AI Tutor input (Web Speech API — free, browser-native) */
document.getElementById('micBtn').addEventListener('click', ()=>{
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){ toast('Speech recognition is not supported in this browser.', 'error'); return; }
  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.onresult = (e)=>{ document.getElementById('chatInput').value = e.results[0][0].transcript; };
  rec.onerror = ()=> toast('Could not capture speech — please try again.', 'error');
  rec.start();
  toast('Listening…', 'info');
});

/* ---------- Exams ---------- */
function populateExamCourseSelect(){
  const sel = document.getElementById('examCourseSelect');
  sel.innerHTML = myCourses.map(c=>`<option value="${c.id}">${c.title}</option>`).join('') || `<option value="">No courses yet</option>`;
  sel.addEventListener('change', renderExamForm);
  renderExamForm();
}
function renderExamForm(){
  const courseId = document.getElementById('examCourseSelect').value;
  const questions = examQuestions.filter(q=>q.courseId===courseId);
  const form = document.getElementById('examForm');
  if(!questions.length){ form.innerHTML = `<p class="text-muted">No exam questions have been set for this course yet.</p>`; return; }
  form.innerHTML = questions.map((q,i)=>{
    if(q.type === 'objective'){
      return `<div class="card" style="padding:16px;">
        <strong>${i+1}. ${q.text}</strong>
        <div class="mt-8" style="display:flex;flex-direction:column;gap:8px;">
          ${['A','B','C','D'].map(opt=> q.options?.[opt] ? `<label class="flex items-center gap-8"><input type="radio" name="q-${q.id}" value="${opt}"> ${opt}. ${q.options[opt]}</label>` : '').join('')}
        </div>
      </div>`;
    }
    return `<div class="card" style="padding:16px;"><strong>${i+1}. ${q.text}</strong>
      <textarea name="q-${q.id}" rows="4" class="mt-8" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);" placeholder="Write your answer…"></textarea></div>`;
  }).join('');
}
document.getElementById('submitExamBtn').addEventListener('click', async ()=>{
  const courseId = document.getElementById('examCourseSelect').value;
  const questions = examQuestions.filter(q=>q.courseId===courseId);
  if(!questions.length){ toast('No exam to submit yet.', 'error'); return; }
  let correct = 0, objectiveCount = 0;
  const answers = questions.map(q=>{
    if(q.type === 'objective'){
      objectiveCount++;
      const picked = document.querySelector(`input[name="q-${q.id}"]:checked`)?.value || null;
      if(picked === q.correct) correct++;
      return { questionId: q.id, type:'objective', answer: picked };
    }
    const val = document.querySelector(`textarea[name="q-${q.id}"]`)?.value || '';
    return { questionId: q.id, type:'theory', answer: val };
  });
  try{
    await addRecord('results', { studentId: session.uid, courseId, answers, autoScore: objectiveCount ? Math.round((correct/objectiveCount)*100) : null, submittedAt: new Date().toISOString() });
    const box = document.getElementById('examResultBox');
    box.classList.add('show');
    box.textContent = objectiveCount
      ? `Submitted! You scored ${correct}/${objectiveCount} on the objective questions. Theory answers will be graded by your teacher.`
      : `Submitted! Your theory answers have been sent to your teacher for grading.`;
    toast('Exam submitted.', 'success');
  }catch(err){ toast('Could not submit exam: ' + err.message, 'error'); }
});

/* ---------- Grades ---------- */
function renderGrades(){
  const cards = document.getElementById('gradesCards');
  if(!myCourses.length){ cards.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-chart-line"></i><p>No grades yet.</p></div>`; return; }
  cards.innerHTML = myCourses.map(c=>{
    const score = Math.round(55 + Math.random()*40);
    return `<div class="card" style="padding:20px;"><span class="badge badge-blue">${c.subject}</span>
      <h3 style="margin:10px 0 4px;font-size:1rem;">${c.title}</h3>
      <div class="amt" style="font-size:1.8rem;color:var(--royal);">${score}%</div></div>`;
  }).join('');
  new Chart(document.getElementById('gradesChart'), {
    type:'bar',
    data:{ labels: myCourses.map(c=>c.title), datasets:[{ label:'Score %', data: myCourses.map(()=>Math.round(55+Math.random()*40)), backgroundColor:'#C9A227' }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, max:100 } } }
  });
}

/* ---------- Badges / gamification ---------- */
function renderBadges(){
  const badges = [
    { icon:'fa-book-open-reader', label:'First Read', earned:true },
    { icon:'fa-bolt', label:'Quick Learner', earned: myCourses.length>0 },
    { icon:'fa-fire', label:'7-Day Streak', earned:false },
    { icon:'fa-medal', label:'Top of Class', earned:false },
    { icon:'fa-star', label:'Perfect Score', earned:false },
    { icon:'fa-robot', label:'AI Explorer', earned:true },
    { icon:'fa-clipboard-check', label:'Perfect Attendance', earned:false },
    { icon:'fa-graduation-cap', label:'Course Complete', earned:false }
  ];
  document.getElementById('badgesGrid').innerHTML = badges.map(b=>`
    <div class="card ${b.earned?'':''}" style="padding:20px;text-align:center;opacity:${b.earned?1:.45};">
      <i class="fa-solid ${b.icon}" style="font-size:1.6rem;color:var(--gold);"></i>
      <div style="margin-top:10px;font-size:.85rem;font-weight:600;">${b.label}</div>
      <div class="text-muted" style="font-size:.72rem;">${b.earned?'Earned':'Locked'}</div>
    </div>`).join('');
}

/* ---------- Calendar ---------- */
function renderCalendar(){
  const items = [
    { date:'This week', title:'Live class — Physics', icon:'fa-video' },
    { date:'This week', title:'Assignment due — Mathematics', icon:'fa-file-pen' },
    { date:'Next week', title:'Chemistry exam window opens', icon:'fa-flask' }
  ];
  document.getElementById('calendarList').innerHTML = items.map(i=>`
    <li class="flex items-center gap-12">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(30,58,138,.1);display:flex;align-items:center;justify-content:center;color:var(--royal);"><i class="fa-solid ${i.icon}"></i></div>
      <div><strong style="font-size:.9rem;">${i.title}</strong><div class="text-muted" style="font-size:.78rem;">${i.date}</div></div>
    </li>`).join('');
}

/* ---------- Profile ---------- */
function renderProfile(){
  document.getElementById('profileAvatar').textContent = (session.fullName||'S').charAt(0).toUpperCase();
  document.getElementById('profileName').textContent = session.fullName || '—';
  document.getElementById('profileId').textContent = session.id || '—';
  document.getElementById('profileClass').value = session.classLevel || '—';
  document.getElementById('profilePhone').value = session.phone || '—';
  document.getElementById('profileGender').value = session.gender || '—';
  document.getElementById('profileDob').value = session.dob || '—';
  document.getElementById('profileParent').value = session.parentInfo || '—';
}

/* ---------- Notifications ---------- */
function renderNotifications(){
  const relevant = announcements.filter(a=>a.audience==='all' || a.audience==='students').slice().reverse();
  const wrap = document.getElementById('notificationsList');
  wrap.innerHTML = relevant.length ? relevant.map(a=>`
    <div style="padding:16px;border-bottom:1px solid var(--line);">
      <div class="flex justify-between"><strong style="font-size:.9rem;">${a.title}</strong><span class="badge badge-blue">${a.audience}</span></div>
      <p class="text-muted" style="font-size:.84rem;margin:6px 0 0;">${a.message}</p>
    </div>`).join('') : `<div class="empty-state"><i class="fa-solid fa-bell"></i><p>No notifications yet.</p></div>`;
}
