/* ==========================================================================
   SCHOLAR'S CAMP LMS — DISCUSSION FORUM & LIVE CHAT
   Both features run entirely on Firestore's free tier using onSnapshot
   real-time listeners — no separate chat server or paid service needed.
   ========================================================================== */
import { bootCommon, toast, openModal, closeModal } from './app.js';
import { getAllRecords, addRecord, listenToCollection, watchSession, where, orderBy } from './firebase-config.js';

bootCommon();
window.scUtils = { toast, openModal, closeModal };

let session = null, myCourses = [], forumPosts = [], unsubscribeChat = null;

watchSession((s)=>{
  if(!s){ window.location.href = 'login-student.html'; return; }
  session = s;
  document.getElementById('backLink').addEventListener('click', ()=>{
    window.location.href = s.role === 'teacher' ? 'teacher-dashboard.html' : s.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  });
  loadCourses();
});

document.querySelectorAll('.side-link[data-section]').forEach(link=>{
  link.addEventListener('click', ()=>{
    document.querySelectorAll('.side-link[data-section]').forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById(`sec-${link.dataset.section}`).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
    if(link.dataset.section === 'chat') connectChatRoom();
  });
});

async function loadCourses(){
  const allCourses = await getAllRecords('courses');
  myCourses = session.role === 'admin' ? allCourses : allCourses.filter(c => (session.courseIds||[]).includes(c.id));
  const opts = myCourses.map(c=>`<option value="${c.id}">${c.title}</option>`).join('');
  document.getElementById('forumCourseFilter').innerHTML = `<option value="">All my courses</option>` + opts;
  document.getElementById('postCourse').innerHTML = opts || `<option value="">No courses yet</option>`;
  document.getElementById('chatCourseSelect').innerHTML = opts || `<option value="">No courses yet</option>`;
  loadForum();
}

/* ---------- Forum ---------- */
async function loadForum(){
  const allPosts = await getAllRecords('chat', where('kind','==','forum-post'));
  const myCourseIds = new Set(myCourses.map(c=>c.id));
  forumPosts = allPosts.filter(p => myCourseIds.has(p.courseId));
  renderForum();
}
function renderForum(){
  const filter = document.getElementById('forumCourseFilter').value;
  const list = (filter ? forumPosts.filter(p=>p.courseId===filter) : forumPosts).slice().reverse();
  const wrap = document.getElementById('forumList');
  if(!list.length){ wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-comments"></i><p>No discussions yet — start the first one.</p></div>`; return; }
  wrap.innerHTML = list.map(p=>{
    const course = myCourses.find(c=>c.id===p.courseId);
    return `<div class="card" style="padding:20px;">
      <div class="flex justify-between items-center mb-8"><span class="badge badge-blue">${course?course.title:'General'}</span><span class="text-muted" style="font-size:.75rem;">${p.authorName||'Member'}</span></div>
      <h3 style="margin:0 0 6px;font-size:1rem;">${escapeHtml(p.title)}</h3>
      <p class="text-muted" style="font-size:.88rem;">${escapeHtml(p.body)}</p>
    </div>`;
  }).join('');
}
document.getElementById('forumCourseFilter').addEventListener('change', renderForum);
document.getElementById('newPostBtn').addEventListener('click', ()=>{ document.getElementById('postForm').reset(); openModal('modalPost'); });
document.getElementById('postForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    await addRecord('chat', {
      kind:'forum-post',
      courseId: document.getElementById('postCourse').value,
      title: document.getElementById('postTitle').value.trim(),
      body: document.getElementById('postBody').value.trim(),
      authorId: session.uid,
      authorName: session.fullName || session.role
    });
    toast('Posted.', 'success');
    closeModal('modalPost');
    await loadForum();
  }catch(err){ toast('Could not post: ' + err.message, 'error'); }
});
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }

/* ---------- Live chat (real-time per-course room) ---------- */
function connectChatRoom(){
  if(unsubscribeChat) unsubscribeChat();
  const courseId = document.getElementById('chatCourseSelect').value;
  if(!courseId) return;
  const box = document.getElementById('chatMessages');
  box.innerHTML = `<p class="text-muted">Loading messages…</p>`;
  unsubscribeChat = listenToCollection('chat', (msgs)=>{
    const roomMsgs = msgs.filter(m=> m.kind === 'chat-message' && m.courseId === courseId)
      .sort((a,b)=> (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
    box.innerHTML = roomMsgs.length ? roomMsgs.map(m=>`
      <div class="msg ${m.authorId===session.uid?'user':'ai'}" style="align-self:${m.authorId===session.uid?'flex-end':'flex-start'};">
        <strong style="font-size:.72rem;opacity:.75;display:block;">${escapeHtml(m.authorName)}</strong>${escapeHtml(m.text)}
      </div>`).join('') : `<p class="text-muted">No messages yet — say hello.</p>`;
    box.scrollTop = box.scrollHeight;
  }, where('kind','==','chat-message'));
}
document.getElementById('chatCourseSelect').addEventListener('change', connectChatRoom);
document.getElementById('chatForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  const courseId = document.getElementById('chatCourseSelect').value;
  if(!text || !courseId) return;
  input.value = '';
  try{
    await addRecord('chat', { kind:'chat-message', courseId, text, authorId: session.uid, authorName: session.fullName || session.role });
  }catch(err){ toast('Message failed to send: ' + err.message, 'error'); }
});
