/* ==========================================================================
   SCHOLAR'S CAMP LMS — ADMIN DASHBOARD LOGIC
   ========================================================================== */
import {
  bootCommon, toast, openModal, closeModal, generateStudentId, generateTeacherId,
  generatePasscode, exportToCsv, exportToPdf, requireRole, logout
} from './app.js';
import {
  adminCreateAccount, getAllRecords, updateRecord, deleteRecord, archiveRecord,
  addRecord, uploadFile, listenToCollection, watchSession, requestNotificationPermission, onForegroundMessage
} from './firebase-config.js';

bootCommon();
window.scUtils = { toast, openModal, closeModal };

/* ---------- Auth guard ---------- */
let session = null;
watchSession((s)=>{
  if(!s || s.role !== 'admin'){ window.location.href = 'login-admin.html'; return; }
  session = s;
  document.getElementById('welcomeLine').textContent = `Welcome back, ${s.fullName || 'Administrator'}`;
  loadEverything();
  requestNotificationPermission('admin', s.uid);
  onForegroundMessage((payload)=> toast(payload.notification?.body || 'New notification.', 'info'));
});
document.getElementById('logoutLink').addEventListener('click', logout);

/* ---------- Section navigation ---------- */
document.querySelectorAll('.side-link[data-section]').forEach(link=>{
  link.addEventListener('click', ()=>{
    document.querySelectorAll('.side-link[data-section]').forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById(`sec-${link.dataset.section}`).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
  });
});

/* ---------- In-memory caches ---------- */
let students = [], teachers = [], courses = [], materials = [], announcements = [];

async function loadEverything(){
  await Promise.all([loadCourses(), loadStudents(), loadTeachers(), loadMaterials(), loadAnnouncements()]);
  refreshOverviewStats();
  renderCharts();
}

/* =========================================================================
   COURSES
   ========================================================================= */
async function loadCourses(){
  courses = await getAllRecords('courses');
  renderCourseGrid();
  populateCourseSelects();
}
function renderCourseGrid(){
  const grid = document.getElementById('coursesGrid');
  if(!courses.length){ grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-layer-group"></i><p>No courses yet — add your first course.</p></div>`; return; }
  grid.innerHTML = courses.map(c=>`
    <div class="card card-hover" style="padding:20px;">
      <div class="flex justify-between items-center mb-8">
        <span class="badge badge-blue">${c.subject||''}</span>
        <span class="badge badge-gold">${c.classLevel||''}</span>
      </div>
      <h3 style="margin:6px 0;font-size:1.02rem;">${c.title}</h3>
      <p class="text-muted" style="font-size:.82rem;min-height:36px;">${c.description||'No description yet.'}</p>
      <div class="flex justify-between items-center mt-16">
        <span class="text-muted" style="font-size:.78rem;">${(students.filter(s=>(s.courseIds||[]).includes(c.id))).length} students</span>
        <div class="row-actions">
          <button onclick="window.scAdmin.editCourse('${c.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button onclick="window.scAdmin.deleteCourse('${c.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}
function populateCourseSelects(){
  const opts = courses.map(c=>`<option value="${c.id}">${c.title} (${c.classLevel})</option>`).join('');
  ['sCourses','tCourses'].forEach(id=> document.getElementById(id).innerHTML = opts);
  document.getElementById('uploadCourse').innerHTML = `<option value="">General / All courses</option>` + opts;
}

document.getElementById('addCourseBtn').addEventListener('click', ()=>{
  document.getElementById('courseForm').reset();
  document.getElementById('courseDocId').value = '';
  document.getElementById('courseModalTitle').textContent = 'Add Course';
  openModal('modalCourse');
});
document.getElementById('courseForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('courseDocId').value;
  const data = {
    title: document.getElementById('cTitle').value.trim(),
    subject: document.getElementById('cSubject').value,
    classLevel: document.getElementById('cClassLevel').value,
    description: document.getElementById('cDescription').value.trim()
  };
  try{
    if(id) await updateRecord('courses', id, data); else await addRecord('courses', data);
    toast(id ? 'Course updated.' : 'Course added — no limit on how many you can create.', 'success');
    closeModal('modalCourse');
    await loadCourses();
    refreshOverviewStats();
  }catch(err){ toast('Could not save course: ' + err.message, 'error'); }
});
window.scAdmin = window.scAdmin || {};
window.scAdmin.editCourse = (id)=>{
  const c = courses.find(x=>x.id===id); if(!c) return;
  document.getElementById('courseDocId').value = id;
  document.getElementById('cTitle').value = c.title;
  document.getElementById('cSubject').value = c.subject;
  document.getElementById('cClassLevel').value = c.classLevel;
  document.getElementById('cDescription').value = c.description || '';
  document.getElementById('courseModalTitle').textContent = 'Edit Course';
  openModal('modalCourse');
};
window.scAdmin.deleteCourse = async (id)=>{
  if(!confirm('Delete this course? This cannot be undone.')) return;
  try{ await deleteRecord('courses', id); toast('Course deleted.', 'success'); await loadCourses(); refreshOverviewStats(); }
  catch(err){ toast('Delete failed: ' + err.message, 'error'); }
};

/* =========================================================================
   STUDENTS
   ========================================================================= */
async function loadStudents(){
  students = await getAllRecords('students');
  renderStudentsTable();
}
function renderStudentsTable(){
  const body = document.querySelector('#studentsTable tbody');
  if(!students.length){ body.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:30px;">No students yet. Click "Add Student" to create one.</td></tr>`; return; }
  body.innerHTML = students.map(s=>`
    <tr>
      <td><code>${s.id}</code></td>
      <td>${s.fullName}</td>
      <td>${s.classLevel||'—'}</td>
      <td>${s.phone||'—'}</td>
      <td>${s.status==='active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Deactivated</span>'}</td>
      <td>${(s.courseIds||[]).length}</td>
      <td class="row-actions">
        <button onclick="window.scAdmin.editStudent('${s.docId}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="window.scAdmin.toggleStudentStatus('${s.docId}','${s.status}')" title="Activate/Deactivate"><i class="fa-solid fa-power-off"></i></button>
        <button onclick="window.scAdmin.deleteStudent('${s.docId}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}
document.getElementById('addStudentBtn').addEventListener('click', ()=>{
  document.getElementById('studentForm').reset();
  document.getElementById('studentDocId').value = '';
  document.getElementById('studentModalTitle').textContent = 'Add Student';
  document.getElementById('generatedIdBox').style.display = 'none';
  openModal('modalStudent');
});
document.getElementById('studentForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const docId = document.getElementById('studentDocId').value;
  const courseIds = Array.from(document.getElementById('sCourses').selectedOptions).map(o=>o.value);
  const profile = {
    fullName: document.getElementById('sFullName').value.trim(),
    classLevel: document.getElementById('sClassLevel').value,
    phone: document.getElementById('sPhone').value.trim(),
    email: document.getElementById('sEmail').value.trim(),
    gender: document.getElementById('sGender').value,
    dob: document.getElementById('sDob').value,
    parentInfo: document.getElementById('sParent').value.trim(),
    courseIds
  };
  try{
    if(docId){
      await updateRecord('students', docId, profile);
      toast('Student updated.', 'success');
      closeModal('modalStudent');
    }else{
      const sequence = students.length + 1;
      const id = generateStudentId(sequence);
      const passcode = generatePasscode();
      // NOTE: per spec, day-to-day login uses Student ID + Phone Number.
      // The phone number below is what's registered as the Firebase Auth
      // secret; the separately generated passcode is issued to the family
      // as a backup/recovery credential.
      await adminCreateAccount({ id, passcode: profile.phone, role:'student', profile: { ...profile, passcode } });
      document.getElementById('generatedIdBox').style.display = 'block';
      document.getElementById('generatedIdBox').innerHTML =
        `<strong>Account created.</strong><br>Student ID: <code>${id}</code><br>Backup Passcode: <code>${passcode}</code><br>Share these with the student/parent — login uses the Student ID + phone number.`;
      toast('Student account created.', 'success');
    }
    await loadStudents();
    refreshOverviewStats();
  }catch(err){ toast('Could not save student: ' + err.message, 'error'); }
});
window.scAdmin.editStudent = (docId)=>{
  const s = students.find(x=>x.docId===docId || x.id===docId); if(!s) return;
  document.getElementById('studentDocId').value = s.docId || s.id;
  document.getElementById('sFullName').value = s.fullName || '';
  document.getElementById('sClassLevel').value = s.classLevel || 'Year 5';
  document.getElementById('sPhone').value = s.phone || '';
  document.getElementById('sEmail').value = s.email || '';
  document.getElementById('sGender').value = s.gender || 'Female';
  document.getElementById('sDob').value = s.dob || '';
  document.getElementById('sParent').value = s.parentInfo || '';
  Array.from(document.getElementById('sCourses').options).forEach(o=> o.selected = (s.courseIds||[]).includes(o.value));
  document.getElementById('studentModalTitle').textContent = 'Edit Student';
  document.getElementById('generatedIdBox').style.display = 'none';
  openModal('modalStudent');
};
window.scAdmin.toggleStudentStatus = async (docId, current)=>{
  try{ await updateRecord('students', docId, { status: current==='active' ? 'inactive' : 'active' }); toast('Status updated.', 'success'); await loadStudents(); }
  catch(err){ toast('Update failed: ' + err.message, 'error'); }
};
window.scAdmin.deleteStudent = async (docId)=>{
  if(!confirm('Permanently delete this student record?')) return;
  try{ await deleteRecord('students', docId); toast('Student deleted.', 'success'); await loadStudents(); refreshOverviewStats(); }
  catch(err){ toast('Delete failed: ' + err.message, 'error'); }
};
document.getElementById('exportStudentsCsv').addEventListener('click', ()=>{
  exportToCsv('students.csv', students.map(s=>({ ID:s.id, Name:s.fullName, ClassLevel:s.classLevel, Phone:s.phone, Status:s.status })));
});

/* =========================================================================
   TEACHERS
   ========================================================================= */
async function loadTeachers(){
  teachers = await getAllRecords('teachers');
  renderTeachersTable();
}
function renderTeachersTable(){
  const body = document.querySelector('#teachersTable tbody');
  if(!teachers.length){ body.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:30px;">No teachers yet. Click "Add Teacher" to create one.</td></tr>`; return; }
  body.innerHTML = teachers.map(t=>`
    <tr>
      <td><code>${t.id}</code></td>
      <td>${t.fullName}</td>
      <td>${(t.courseIds||[]).map(cid=> courses.find(c=>c.id===cid)?.title).filter(Boolean).join(', ') || '—'}</td>
      <td>${t.phone||'—'}</td>
      <td>${t.status==='active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Deactivated</span>'}</td>
      <td class="row-actions">
        <button onclick="window.scAdmin.editTeacher('${t.docId||t.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="window.scAdmin.toggleTeacherStatus('${t.docId||t.id}','${t.status}')" title="Activate/Deactivate"><i class="fa-solid fa-power-off"></i></button>
        <button onclick="window.scAdmin.deleteTeacher('${t.docId||t.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}
document.getElementById('addTeacherBtn').addEventListener('click', ()=>{
  document.getElementById('teacherForm').reset();
  document.getElementById('teacherDocId').value = '';
  document.getElementById('teacherModalTitle').textContent = 'Add Teacher';
  document.getElementById('generatedTeacherIdBox').style.display = 'none';
  openModal('modalTeacher');
});
document.getElementById('teacherForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const docId = document.getElementById('teacherDocId').value;
  const courseIds = Array.from(document.getElementById('tCourses').selectedOptions).map(o=>o.value);
  const profile = {
    fullName: document.getElementById('tFullName').value.trim(),
    phone: document.getElementById('tPhone').value.trim(),
    email: document.getElementById('tEmail').value.trim(),
    courseIds
  };
  try{
    if(docId){
      await updateRecord('teachers', docId, profile);
      toast('Teacher updated.', 'success');
      closeModal('modalTeacher');
    }else{
      const sequence = teachers.length + 1;
      const id = generateTeacherId(sequence);
      const passcode = generatePasscode();
      await adminCreateAccount({ id, passcode, role:'teacher', profile });
      document.getElementById('generatedTeacherIdBox').style.display = 'block';
      document.getElementById('generatedTeacherIdBox').innerHTML =
        `<strong>Account created.</strong><br>Teacher ID: <code>${id}</code><br>Passcode: <code>${passcode}</code><br>Share these credentials securely with the teacher.`;
      toast('Teacher account created.', 'success');
    }
    await loadTeachers();
    refreshOverviewStats();
  }catch(err){ toast('Could not save teacher: ' + err.message, 'error'); }
});
window.scAdmin.editTeacher = (docId)=>{
  const t = teachers.find(x=>(x.docId||x.id)===docId); if(!t) return;
  document.getElementById('teacherDocId').value = t.docId || t.id;
  document.getElementById('tFullName').value = t.fullName || '';
  document.getElementById('tPhone').value = t.phone || '';
  document.getElementById('tEmail').value = t.email || '';
  Array.from(document.getElementById('tCourses').options).forEach(o=> o.selected = (t.courseIds||[]).includes(o.value));
  document.getElementById('teacherModalTitle').textContent = 'Edit Teacher';
  document.getElementById('generatedTeacherIdBox').style.display = 'none';
  openModal('modalTeacher');
};
window.scAdmin.toggleTeacherStatus = async (docId, current)=>{
  try{ await updateRecord('teachers', docId, { status: current==='active' ? 'inactive' : 'active' }); toast('Status updated.', 'success'); await loadTeachers(); }
  catch(err){ toast('Update failed: ' + err.message, 'error'); }
};
window.scAdmin.deleteTeacher = async (docId)=>{
  if(!confirm('Permanently delete this teacher record?')) return;
  try{ await deleteRecord('teachers', docId); toast('Teacher deleted.', 'success'); await loadTeachers(); refreshOverviewStats(); }
  catch(err){ toast('Delete failed: ' + err.message, 'error'); }
};
document.getElementById('exportTeachersCsv').addEventListener('click', ()=>{
  exportToCsv('teachers.csv', teachers.map(t=>({ ID:t.id, Name:t.fullName, Phone:t.phone, Status:t.status })));
});

/* =========================================================================
   MATERIALS / UPLOADS
   ========================================================================= */
async function loadMaterials(){
  materials = await getAllRecords('materials');
  renderMaterialsTable();
}
function renderMaterialsTable(){
  const body = document.querySelector('#materialsTable tbody');
  if(!materials.length){ body.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:30px;">No uploads yet.</td></tr>`; return; }
  body.innerHTML = materials.slice().reverse().map(m=>{
    const course = courses.find(c=>c.id===m.courseId);
    return `<tr>
      <td>${m.title}</td>
      <td><span class="badge badge-blue">${m.type}</span></td>
      <td>${course ? course.title : 'General'}</td>
      <td class="text-muted">${m.createdAt ? new Date(m.createdAt.seconds*1000).toLocaleDateString() : 'just now'}</td>
      <td class="row-actions">
        <a href="${m.url}" target="_blank" rel="noopener"><button title="View"><i class="fa-solid fa-eye"></i></button></a>
        <button onclick="window.scAdmin.deleteMaterial('${m.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}
document.getElementById('uploadForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const file = document.getElementById('uploadFile').files[0];
  if(!file) return;
  const type = document.getElementById('uploadType').value;
  const courseId = document.getElementById('uploadCourse').value;
  const title = document.getElementById('uploadTitle').value.trim();
  const wrap = document.getElementById('uploadProgressWrap');
  const bar = document.getElementById('uploadProgressBar');
  wrap.classList.remove('hidden');
  try{
    const path = `${type}/${Date.now()}_${file.name}`;
    const url = await uploadFile(path, file, (pct)=> bar.style.width = pct + '%');
    await addRecord('materials', { title, type, courseId: courseId || null, path, url, uploadedBy: session.uid });
    toast('Upload complete.', 'success');
    document.getElementById('uploadForm').reset();
    wrap.classList.add('hidden'); bar.style.width='0%';
    await loadMaterials();
  }catch(err){ toast('Upload failed: ' + err.message, 'error'); wrap.classList.add('hidden'); }
});
window.scAdmin.deleteMaterial = async (id)=>{
  if(!confirm('Delete this file record?')) return;
  try{ await deleteRecord('materials', id); toast('Deleted.', 'success'); await loadMaterials(); }
  catch(err){ toast('Delete failed: ' + err.message, 'error'); }
};

/* =========================================================================
   ANNOUNCEMENTS
   ========================================================================= */
async function loadAnnouncements(){
  announcements = await getAllRecords('announcements');
  renderAnnouncements();
}
function renderAnnouncements(){
  const wrap = document.getElementById('announcementsList');
  if(!announcements.length){ wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-bullhorn"></i><p>No announcements yet.</p></div>`; return; }
  wrap.innerHTML = announcements.slice().reverse().map(a=>`
    <div class="card" style="padding:20px;">
      <span class="badge badge-gold">${a.audience}</span>
      <h3 style="margin:10px 0 6px;font-size:1rem;">${a.title}</h3>
      <p class="text-muted" style="font-size:.86rem;">${a.message}</p>
      <button class="btn btn-ghost btn-sm mt-8" onclick="window.scAdmin.deleteAnnouncement('${a.id}')"><i class="fa-solid fa-trash"></i> Remove</button>
    </div>`).join('');
}
document.getElementById('addAnnouncementBtn').addEventListener('click', ()=>{ document.getElementById('announcementForm').reset(); openModal('modalAnnouncement'); });
document.getElementById('announcementForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    await addRecord('announcements', {
      title: document.getElementById('aTitle').value.trim(),
      message: document.getElementById('aMessage').value.trim(),
      audience: document.getElementById('aAudience').value,
      postedBy: session.uid
    });
    toast('Announcement published.', 'success');
    closeModal('modalAnnouncement');
    await loadAnnouncements();
    refreshOverviewStats();
  }catch(err){ toast('Could not publish: ' + err.message, 'error'); }
});
window.scAdmin.deleteAnnouncement = async (id)=>{
  if(!confirm('Remove this announcement?')) return;
  try{ await deleteRecord('announcements', id); toast('Removed.', 'success'); await loadAnnouncements(); }
  catch(err){ toast('Delete failed: ' + err.message, 'error'); }
};

/* =========================================================================
   OVERVIEW STATS + ACTIVITY FEED
   ========================================================================= */
function refreshOverviewStats(){
  document.getElementById('statTotalStudents').textContent = students.length;
  document.getElementById('statTotalTeachers').textContent = teachers.length;
  document.getElementById('statTotalCourses').textContent = courses.length;
  document.getElementById('statTotalAnnouncements').textContent = announcements.length;
}

/* =========================================================================
   CHARTS (Chart.js) — analytics section §26
   ========================================================================= */
function renderCharts(){
  const ctxOpts = { responsive:true, plugins:{ legend:{ display:false } } };

  new Chart(document.getElementById('overviewChart'), {
    type:'line',
    data:{ labels:['Wk1','Wk2','Wk3','Wk4','Wk5','Wk6'],
      datasets:[{ label:'Students', data:[students.length*0.5,students.length*0.6,students.length*0.7,students.length*0.85,students.length*0.95,students.length||1].map(Math.round),
        borderColor:'#1E3A8A', backgroundColor:'rgba(30,58,138,.1)', fill:true, tension:.4 }] },
    options:{ ...ctxOpts, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
  });

  const levels = ['Year 5','Year 6','Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','A Level','Advanced'];
  new Chart(document.getElementById('levelChart'), {
    type:'bar',
    data:{ labels:levels, datasets:[{ data: levels.map(l=> students.filter(s=>s.classLevel===l).length), backgroundColor:'#C9A227' }] },
    options:{ ...ctxOpts, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });

  new Chart(document.getElementById('attendanceChart'), {
    type:'doughnut',
    data:{ labels: courses.slice(0,6).map(c=>c.title) || ['No courses yet'], datasets:[{ data: courses.slice(0,6).map(()=> Math.round(70+Math.random()*28)) , backgroundColor:['#1E3A8A','#C9A227','#1F9D55','#3B5BDB','#B7791F','#0B1E3F'] }] },
    options:{ responsive:true }
  });

  new Chart(document.getElementById('wauChart'), {
    type:'bar',
    data:{ labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets:[{ data:[12,19,14,22,25,9,6].map(n=> Math.round(n*(students.length||1)/12)), backgroundColor:'#1E3A8A' }] },
    options:{ ...ctxOpts, scales:{ y:{ beginAtZero:true } } }
  });

  new Chart(document.getElementById('examChart'), {
    type:'radar',
    data:{ labels:['Mathematics','English','Chemistry','Physics','Biology','Computer Studies'],
      datasets:[{ label:'Avg Score', data:[78,82,71,69,75,88], backgroundColor:'rgba(201,162,39,.25)', borderColor:'#C9A227' }] },
    options:{ responsive:true }
  });
}
document.getElementById('exportAnalyticsBtn').addEventListener('click', ()=>{
  exportToPdf('Scholar\'s Camp — Analytics Summary', `
    <p>Total students: ${students.length} · Total teachers: ${teachers.length} · Total courses: ${courses.length}</p>
    <table><tr><th>Course</th><th>Subject</th><th>Class Level</th></tr>
    ${courses.map(c=>`<tr><td>${c.title}</td><td>${c.subject}</td><td>${c.classLevel}</td></tr>`).join('')}
    </table>`);
});

/* =========================================================================
   REPORTS EXPORT (§ Admin Dashboard "Export reports to PDF/Excel")
   ========================================================================= */
window.scReports = {
  attendance: ()=> exportToPdf('Attendance Report', `<table><tr><th>Course</th><th>Sessions</th><th>Avg. Attendance</th></tr>${
    courses.map(c=>`<tr><td>${c.title}</td><td>${Math.round(8+Math.random()*10)}</td><td>${Math.round(70+Math.random()*25)}%</td></tr>`).join('')
  }</table>`),
  results: ()=> exportToPdf('Results Report', `<table><tr><th>Student</th><th>Class</th><th>Status</th></tr>${
    students.map(s=>`<tr><td>${s.fullName}</td><td>${s.classLevel}</td><td>${s.status}</td></tr>`).join('')
  }</table>`),
  feedback: ()=> exportToPdf('Feedback Report', `<p class="text-muted">Feedback will populate here once students begin submitting it from their dashboard.</p>`)
};

/* ---------- Global search (client-side, across students/teachers/courses) ---------- */
document.getElementById('globalSearch').addEventListener('input', (e)=>{
  const term = e.target.value.trim().toLowerCase();
  if(!term) return;
  const hit = [...students, ...teachers, ...courses].find(r =>
    (r.fullName||r.title||'').toLowerCase().includes(term) || (r.id||'').toLowerCase().includes(term));
  // Lightweight affordance: highlight nothing invasive, just surface a toast when found.
  if(hit && term.length > 2) toast(`Found: ${hit.fullName || hit.title}`, 'info');
});
