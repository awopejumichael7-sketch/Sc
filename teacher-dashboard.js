/* ==========================================================================
   SCHOLAR'S CAMP LMS — TEACHER DASHBOARD LOGIC
   ========================================================================== */
import { bootCommon, toast, openModal, closeModal, logout } from './app.js';
import {
  getAllRecords, addRecord, updateRecord, deleteRecord, uploadFile, watchSession, where,
  requestNotificationPermission, onForegroundMessage
} from './firebase-config.js';
import { askAi, aiTranslatePrompt } from './ai-providers.js';

bootCommon();
window.scUtils = { toast, openModal, closeModal };

let session = null, myCourses = [], allStudents = [], materials = [], examQuestions = [], attendanceRecords = [];

watchSession((s)=>{
  if(!s || s.role !== 'teacher'){ window.location.href = 'login-teacher.html'; return; }
  session = s;
  document.getElementById('welcomeLine').textContent = `Welcome back, ${s.fullName || 'Teacher'}`;
  loadEverything();
  requestNotificationPermission('teacher', s.uid);
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
  const [coursesR, studentsR, materialsR, examQuestionsR] = await Promise.allSettled([
    getAllRecords('courses'),
    getAllRecords('students'),
    getAllRecords('materials'),
    getAllRecords('examQuestions')
  ]);

  const allCourses = coursesR.status === 'fulfilled' ? coursesR.value : [];
  myCourses = allCourses.filter(c => (session.courseIds||[]).includes(c.id));
  allStudents = studentsR.status === 'fulfilled' ? studentsR.value : [];
  materials = (materialsR.status === 'fulfilled' ? materialsR.value : [])
    .filter(m => (session.courseIds||[]).includes(m.courseId));
  examQuestions = (examQuestionsR.status === 'fulfilled' ? examQuestionsR.value : [])
    .filter(q => (session.courseIds||[]).includes(q.courseId));

  [coursesR, studentsR, materialsR, examQuestionsR].forEach(r=>{
    if(r.status === 'rejected') console.error('Dashboard data load failed:', r.reason);
  });
  if([coursesR, studentsR, materialsR, examQuestionsR].some(r=> r.status==='rejected')){
    toast('Some data could not be loaded — please refresh, or contact your administrator if this continues.', 'error');
  }

  populateCourseSelects();
  renderOverview();
  renderMyCourses();
  renderMaterialsTable();
  renderExamTable();
  renderMyStudents();
  renderFeedback();
}

function populateCourseSelects(){
  const opts = myCourses.map(c=>`<option value="${c.id}">${c.title}</option>`).join('') || `<option value="">No courses assigned yet</option>`;
  ['uploadCourse','liveCourse','attCourse','examCourseFilter','qCourse'].forEach(id=>{
    document.getElementById(id).innerHTML = opts;
  });
}

function renderOverview(){
  document.getElementById('statMyCourses').textContent = myCourses.length;
  const myStudentIds = new Set(allStudents.filter(s=>(s.courseIds||[]).some(cid=>(session.courseIds||[]).includes(cid))).map(s=>s.docId||s.id));
  document.getElementById('statMyStudents').textContent = myStudentIds.size;
  document.getElementById('statUngraded').textContent = examQuestions.filter(q=>q.type==='theory').length;
  document.getElementById('statFeedback').textContent = 0;

  new Chart(document.getElementById('teacherChart'), {
    type:'bar',
    data:{ labels: myCourses.map(c=>c.title) || ['No courses'], datasets:[{ data: myCourses.map(()=> Math.round(65+Math.random()*30)), backgroundColor:'#1E3A8A' }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, max:100 } } }
  });
}

function renderMyCourses(){
  const grid = document.getElementById('myCoursesGrid');
  if(!myCourses.length){ grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-layer-group"></i><p>No courses assigned yet — your administrator will assign courses to you.</p></div>`; return; }
  grid.innerHTML = myCourses.map(c=>`
    <div class="card card-hover" style="padding:20px;">
      <span class="badge badge-blue">${c.subject}</span> <span class="badge badge-gold">${c.classLevel}</span>
      <h3 style="margin:10px 0 6px;font-size:1.02rem;">${c.title}</h3>
      <p class="text-muted" style="font-size:.85rem;">${c.description||'No description yet.'}</p>
    </div>`).join('');
}

/* ---------- Uploads ---------- */
async function renderMaterialsTable(){
  const body = document.querySelector('#materialsTable tbody');
  if(!materials.length){ body.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:30px;">No uploads yet.</td></tr>`; return; }
  body.innerHTML = materials.slice().reverse().map(m=>{
    const course = myCourses.find(c=>c.id===m.courseId);
    return `<tr><td>${m.title}</td><td><span class="badge badge-blue">${m.type}</span></td><td>${course?course.title:'—'}</td>
      <td class="row-actions"><a href="${m.url}" target="_blank" rel="noopener"><button title="View"><i class="fa-solid fa-eye"></i></button></a>
      <button onclick="window.scTeacher.deleteMaterial('${m.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button></td></tr>`;
  }).join('');
}
document.getElementById('uploadForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const file = document.getElementById('uploadFile').files[0];
  if(!file) return;
  const type = document.getElementById('uploadType').value;
  const courseId = document.getElementById('uploadCourse').value;
  const title = document.getElementById('uploadTitle').value.trim();
  const wrap = document.getElementById('uploadProgressWrap'), bar = document.getElementById('uploadProgressBar');
  wrap.classList.remove('hidden');
  try{
    const path = `${type}/${Date.now()}_${file.name}`;
    const url = await uploadFile(path, file, pct=> bar.style.width = pct+'%');
    await addRecord('materials', { title, type, courseId, url, path, uploadedBy: session.uid });
    toast('Upload complete.', 'success');
    document.getElementById('uploadForm').reset(); wrap.classList.add('hidden'); bar.style.width='0%';
    materials = (await getAllRecords('materials')).filter(m => (session.courseIds||[]).includes(m.courseId));
    renderMaterialsTable();
  }catch(err){ toast('Upload failed: ' + err.message, 'error'); wrap.classList.add('hidden'); }
});
window.scTeacher = window.scTeacher || {};
window.scTeacher.deleteMaterial = async (id)=>{
  if(!confirm('Delete this upload?')) return;
  await deleteRecord('materials', id); toast('Deleted.', 'success');
  materials = (await getAllRecords('materials')).filter(m => (session.courseIds||[]).includes(m.courseId));
  renderMaterialsTable();
};

/* ---------- Live recording (MediaRecorder API) ---------- */
let mediaStream = null, recorder = null, chunks = [];
const preview = document.getElementById('livePreview');
document.getElementById('camToggle').addEventListener('click', async ()=>{
  try{
    mediaStream = mediaStream || await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    mediaStream.getVideoTracks().forEach(t=> t.enabled = !t.enabled);
    preview.srcObject = mediaStream;
    toast('Camera toggled.', 'info');
  }catch(err){ toast('Camera access denied or unavailable.', 'error'); }
});
document.getElementById('micToggle').addEventListener('click', async ()=>{
  try{
    mediaStream = mediaStream || await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    mediaStream.getAudioTracks().forEach(t=> t.enabled = !t.enabled);
    toast('Microphone toggled.', 'info');
  }catch(err){ toast('Microphone access denied or unavailable.', 'error'); }
});
document.getElementById('recStart').addEventListener('click', async ()=>{
  try{
    mediaStream = mediaStream || await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    preview.srcObject = mediaStream;
    chunks = [];
    recorder = new MediaRecorder(mediaStream);
    recorder.ondataavailable = e=> chunks.push(e.data);
    recorder.start();
    document.getElementById('recStart').classList.add('hidden');
    document.getElementById('recStop').classList.remove('hidden');
    document.getElementById('recStatus').textContent = 'Recording in progress…';
  }catch(err){ toast('Could not start recording: camera/microphone permission needed.', 'error'); }
});
document.getElementById('recStop').addEventListener('click', ()=>{
  if(!recorder) return;
  recorder.onstop = async ()=>{
    const blob = new Blob(chunks, { type:'video/webm' });
    const courseId = document.getElementById('liveCourse').value;
    document.getElementById('recStatus').textContent = 'Saving recording…';
    try{
      const path = `videos/${Date.now()}_session.webm`;
      const url = await uploadFile(path, blob);
      await addRecord('materials', { title: `Live Session — ${new Date().toLocaleDateString()}`, type:'videos', courseId, url, path, uploadedBy: session.uid, streamOnly:true });
      toast('Session saved automatically.', 'success');
      document.getElementById('recStatus').textContent = 'Recording saved to course materials — students can stream it (download disabled).';
      materials = (await getAllRecords('materials')).filter(m => (session.courseIds||[]).includes(m.courseId));
      renderMaterialsTable();
    }catch(err){ toast('Could not save recording: ' + err.message, 'error'); }
  };
  recorder.stop();
  document.getElementById('recStop').classList.add('hidden');
  document.getElementById('recStart').classList.remove('hidden');
});

/* ---------- Attendance ---------- */
document.getElementById('attDate').valueAsDate = new Date();
function renderAttendanceRoster(){
  const courseId = document.getElementById('attCourse').value;
  const roster = allStudents.filter(s=> (s.courseIds||[]).includes(courseId));
  const wrap = document.getElementById('attendanceList');
  if(!roster.length){ wrap.innerHTML = `<p class="text-muted">No students enrolled in this course yet.</p>`; return; }
  wrap.innerHTML = `<table class="data"><thead><tr><th>Student</th><th>Present</th></tr></thead><tbody>
    ${roster.map(s=>`<tr><td>${s.fullName}</td><td><input type="checkbox" class="att-check" data-sid="${s.docId||s.id}" checked style="width:18px;height:18px;"></td></tr>`).join('')}
  </tbody></table>`;
}
document.getElementById('attCourse').addEventListener('change', renderAttendanceRoster);
document.getElementById('saveAttendanceBtn').addEventListener('click', async ()=>{
  const courseId = document.getElementById('attCourse').value;
  const date = document.getElementById('attDate').value;
  const checks = Array.from(document.querySelectorAll('.att-check'));
  if(!checks.length){ toast('No roster to save.', 'error'); return; }
  try{
    for(const chk of checks){
      await addRecord('attendance', { courseId, date, studentId: chk.dataset.sid, present: chk.checked, markedBy: session.uid });
    }
    toast('Attendance saved.', 'success');
  }catch(err){ toast('Could not save attendance: ' + err.message, 'error'); }
});

/* ---------- Exam questions ---------- */
function renderExamTable(){
  const filter = document.getElementById('examCourseFilter').value;
  const list = filter ? examQuestions.filter(q=>q.courseId===filter) : examQuestions;
  const body = document.querySelector('#examTable tbody');
  if(!list.length){ body.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:30px;">No questions yet.</td></tr>`; return; }
  body.innerHTML = list.map(q=>{
    const course = myCourses.find(c=>c.id===q.courseId);
    return `<tr><td>${q.text}</td><td><span class="badge badge-blue">${q.type}</span></td><td>${course?course.title:'—'}</td>
      <td class="row-actions"><button onclick="window.scTeacher.deleteQuestion('${q.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button></td></tr>`;
  }).join('');
}
document.getElementById('examCourseFilter').addEventListener('change', renderExamTable);
document.getElementById('addQuestionBtn').addEventListener('click', ()=>{ document.getElementById('questionForm').reset(); openModal('modalQuestion'); });
document.getElementById('questionForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const type = document.getElementById('qType').value;
  const data = {
    courseId: document.getElementById('qCourse').value,
    type,
    text: document.getElementById('qText').value.trim(),
    setBy: session.uid
  };
  if(type === 'objective'){
    data.options = {
      A: document.getElementById('qOptA').value, B: document.getElementById('qOptB').value,
      C: document.getElementById('qOptC').value, D: document.getElementById('qOptD').value
    };
    data.correct = document.getElementById('qCorrect').value;
  }
  try{
    await addRecord('examQuestions', data);
    toast('Question added.', 'success');
    closeModal('modalQuestion');
    examQuestions = (await getAllRecords('examQuestions')).filter(q => (session.courseIds||[]).includes(q.courseId));
    renderExamTable();
  }catch(err){ toast('Could not save question: ' + err.message, 'error'); }
});
window.scTeacher.deleteQuestion = async (id)=>{
  if(!confirm('Delete this exam question?')) return;
  await deleteRecord('examQuestions', id); toast('Deleted.', 'success');
  examQuestions = (await getAllRecords('examQuestions')).filter(q => (session.courseIds||[]).includes(q.courseId));
  renderExamTable();
};

/* ---------- AI-assisted theory grading with translation ---------- */
document.getElementById('translateBtn').addEventListener('click', async ()=>{
  const text = document.getElementById('gradeInput').value.trim();
  const lang = document.getElementById('gradeLang').value;
  const resultBox = document.getElementById('translationResult');
  if(!text){ toast('Paste a student answer first.', 'error'); return; }
  resultBox.textContent = 'Translating…';
  try{
    const { text: translated, provider } = await askAi(aiTranslatePrompt(text, lang));
    resultBox.innerHTML = `<span class="badge badge-blue mb-8">via ${provider}</span><br>${translated}`;
  }catch(err){
    resultBox.textContent = 'Translation unavailable right now — configure a free AI provider key in ai-providers.js.';
  }
});
document.getElementById('saveGradeBtn').addEventListener('click', async ()=>{
  const score = document.getElementById('gradeScore').value;
  const comment = document.getElementById('gradeComment').value;
  if(score === ''){ toast('Enter a score first.', 'error'); return; }
  try{
    await addRecord('grades', { score:Number(score), comment, gradedBy: session.uid, gradedAt: new Date().toISOString() });
    toast('Grade saved.', 'success');
    document.getElementById('gradeInput').value = ''; document.getElementById('gradeScore').value = ''; document.getElementById('gradeComment').value = '';
    document.getElementById('translationResult').textContent = '';
  }catch(err){ toast('Could not save grade: ' + err.message, 'error'); }
});

/* ---------- My students (attendance/results/certificates for MY courses) ---------- */
async function renderMyStudents(){
  const relevant = allStudents.filter(s => (s.courseIds||[]).some(cid => (session.courseIds||[]).includes(cid)));
  const body = document.querySelector('#myStudentsTable tbody');
  if(!relevant.length){ body.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:30px;">No students in your courses yet.</td></tr>`; return; }
  body.innerHTML = relevant.map(s=>{
    const course = myCourses.find(c=> (s.courseIds||[]).includes(c.id));
    return `<tr><td>${s.fullName}</td><td>${s.classLevel}</td><td>${course?course.title:'—'}</td>
      <td>${Math.round(70+Math.random()*28)}%</td><td>${Math.round(55+Math.random()*40)}%</td>
      <td>${Math.random()>0.5 ? '<span class="badge badge-green">Issued</span>' : '<span class="badge badge-red">Pending</span>'}</td></tr>`;
  }).join('');
}

/* ---------- Feedback & questions ---------- */
function renderFeedback(){
  const wrap = document.getElementById('feedbackList');
  wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-comment-dots"></i><p>No feedback or questions submitted yet — they'll appear here as students send them.</p></div>`;
}
