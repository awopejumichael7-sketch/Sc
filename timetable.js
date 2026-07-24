/* ==========================================================================
   SCHOLAR'S CAMP LMS — TIMETABLE & EVENTS
   ========================================================================== */
import { bootCommon, toast, openModal, closeModal } from './app.js';
import { getAllRecords, addRecord, watchSession } from './firebase-config.js';

bootCommon();
window.scUtils = { toast, openModal, closeModal };

let session = null, myCourses = [], slots = [], events = [];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const TIMES = ['8:00–8:45am','8:45–9:30am','9:45–10:30am','10:30–11:15am','11:30am–12:15pm','12:15–1:00pm'];

watchSession((s)=>{
  if(!s){ window.location.href = 'login-student.html'; return; }
  session = s;
  document.getElementById('backLink').addEventListener('click', ()=>{
    window.location.href = s.role === 'teacher' ? 'teacher-dashboard.html' : s.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  });
  if(s.role === 'admin'){
    document.getElementById('addSlotBtn').classList.remove('hidden');
    document.getElementById('addEventBtn').classList.remove('hidden');
  }
  loadAll();
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

async function loadAll(){
  const allCourses = await getAllRecords('courses');
  myCourses = session.role === 'admin' ? allCourses : allCourses.filter(c => (session.courseIds||[]).includes(c.id));
  document.getElementById('slotCourse').innerHTML = myCourses.map(c=>`<option value="${c.id}">${c.title}</option>`).join('');
  await loadSlots();
  await loadEvents();
}

async function loadSlots(){
  const all = await getAllRecords('activityLogs');
  slots = all.filter(r => r.kind === 'timetable-slot');
  const relevantCourseIds = new Set(myCourses.map(c=>c.id));
  slots = slots.filter(s => relevantCourseIds.has(s.courseId));
  renderTimetable();
}
function renderTimetable(){
  const body = document.querySelector('#timetableTable tbody');
  body.innerHTML = TIMES.map(time=>{
    const cells = DAYS.map(day=>{
      const match = slots.find(s=> s.day===day && s.time===time);
      const course = match ? myCourses.find(c=>c.id===match.courseId) : null;
      return `<td>${course ? `<span class="badge badge-blue">${course.title}</span>` : ''}</td>`;
    }).join('');
    return `<tr><td class="text-muted" style="white-space:nowrap;">${time}</td>${cells}</tr>`;
  }).join('');
}
document.getElementById('addSlotBtn').addEventListener('click', ()=>{ document.getElementById('slotForm').reset(); openModal('modalSlot'); });
document.getElementById('slotForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    await addRecord('activityLogs', {
      kind:'timetable-slot',
      day: document.getElementById('slotDay').value,
      time: document.getElementById('slotTime').value.trim(),
      courseId: document.getElementById('slotCourse').value,
      addedBy: session.uid
    });
    toast('Slot added.', 'success');
    closeModal('modalSlot');
    await loadSlots();
  }catch(err){ toast('Could not save slot: ' + err.message, 'error'); }
});

async function loadEvents(){
  const all = await getAllRecords('activityLogs');
  events = all.filter(r => r.kind === 'campus-event');
  renderEvents();
}
function renderEvents(){
  const wrap = document.getElementById('eventsList');
  if(!events.length){ wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-calendar-star"></i><p>No events scheduled yet.</p></div>`; return; }
  wrap.innerHTML = events.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).map(ev=>`
    <div class="card" style="padding:20px;">
      <span class="badge badge-gold">${new Date(ev.date).toLocaleDateString(undefined,{ month:'short', day:'numeric', year:'numeric' })}</span>
      <h3 style="margin:10px 0 6px;font-size:1rem;">${ev.title}</h3>
      <p class="text-muted" style="font-size:.86rem;">${ev.description||''}</p>
    </div>`).join('');
}
document.getElementById('addEventBtn').addEventListener('click', ()=>{ document.getElementById('eventForm').reset(); openModal('modalEvent'); });
document.getElementById('eventForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    await addRecord('activityLogs', {
      kind:'campus-event',
      title: document.getElementById('eventTitle').value.trim(),
      date: document.getElementById('eventDate').value,
      description: document.getElementById('eventDesc').value.trim(),
      addedBy: session.uid
    });
    toast('Event added.', 'success');
    closeModal('modalEvent');
    await loadEvents();
  }catch(err){ toast('Could not save event: ' + err.message, 'error'); }
});
