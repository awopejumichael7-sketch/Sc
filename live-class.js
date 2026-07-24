/* ==========================================================================
   SCHOLAR'S CAMP LMS — LIVE CLASS (WebRTC)
   Signaling channel: Firestore itself (onSnapshot), which is free on the
   Spark plan at classroom scale — no separate signaling server needed.
   Media relay: browser-to-browser (star topology: teacher <-> each viewer),
   using Google's public STUN server (free, no account needed). TURN is left
   as an optional free-tier slot (see README) for networks that block direct
   peer connections — most school/home networks won't need it.
   ========================================================================== */
import { bootCommon, toast } from './app.js';
import { getAllRecords, setRecord, listenToCollection, watchSession, db } from './firebase-config.js';
import { doc, getDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

bootCommon();

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    // Optional free TURN relay (recommended for restrictive networks):
    // { urls: 'turn:YOUR_FREE_TURN_HOST:3478', username: 'YOUR_USER', credential: 'YOUR_CRED' }
  ]
};

let session = null, myCourses = [], currentCourseId = null;
let localStream = null;                 // teacher's camera/mic
let teacherPeerConnections = new Map(); // viewerUid -> RTCPeerConnection (teacher side)
let viewerPeerConnection = null;        // student side
let unsubViewers = null, unsubOwnDoc = null, unsubRoomStatus = null;
let appliedTeacherCandidates = 0, appliedViewerCandidatesCount = new Map();

watchSession((s)=>{
  if(!s){ window.location.href = 'login-student.html'; return; }
  session = s;
  document.getElementById('backLink').addEventListener('click', ()=>{
    window.location.href = s.role === 'teacher' ? 'teacher-dashboard.html' : s.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  });
  if(s.role === 'teacher') document.getElementById('teacherControls').classList.remove('hidden');
  else document.getElementById('studentControls').classList.remove('hidden');
  loadCourses();
});

async function loadCourses(){
  const allCourses = await getAllRecords('courses');
  myCourses = session.role === 'admin' ? allCourses : allCourses.filter(c => (session.courseIds||[]).includes(c.id));
  document.getElementById('courseSelect').innerHTML = myCourses.map(c=>`<option value="${c.id}">${c.title}</option>`).join('') || `<option value="">No courses yet</option>`;
  currentCourseId = document.getElementById('courseSelect').value;
  watchRoomStatus();
}
document.getElementById('courseSelect').addEventListener('change', ()=>{
  currentCourseId = document.getElementById('courseSelect').value;
  watchRoomStatus();
});

function watchRoomStatus(){
  if(unsubRoomStatus) unsubRoomStatus();
  if(!currentCourseId) return;
  unsubRoomStatus = listenToCollection('liveRooms', (rooms)=>{
    const room = rooms.find(r=>r.id === currentCourseId);
    const badge = document.getElementById('roomStatus');
    if(room && room.status === 'live'){
      badge.innerHTML = `<span class="badge badge-green">Live now</span><span class="text-muted" style="font-size:.85rem;">Session started by your teacher.</span>`;
    }else{
      badge.innerHTML = `<span class="badge badge-red">Offline</span><span class="text-muted" style="font-size:.85rem;">No live session for this course right now.</span>`;
    }
  });
}

/* =========================================================================
   TEACHER SIDE
   ========================================================================= */
document.getElementById('goLiveBtn').addEventListener('click', async ()=>{
  if(!currentCourseId){ toast('Choose a course first.', 'error'); return; }
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    document.getElementById('mainVideo').srcObject = localStream;
    document.getElementById('mainVideo').muted = true;
    await setRecord('liveRooms', currentCourseId, { status:'live', teacherUid: session.uid, startedAt: new Date().toISOString() });
    document.getElementById('goLiveBtn').classList.add('hidden');
    document.getElementById('endLiveBtn').classList.remove('hidden');
    toast('You are live.', 'success');
    listenForViewers();
  }catch(err){ toast('Could not start broadcast — camera/microphone permission needed.', 'error'); }
});

function listenForViewers(){
  if(unsubViewers) unsubViewers();
  unsubViewers = listenToCollection(`liveRooms/${currentCourseId}/viewers`, async (viewerDocs)=>{
    document.getElementById('viewerList').innerHTML = viewerDocs.length
      ? viewerDocs.map(v=>`<li class="flex items-center gap-8"><i class="fa-solid fa-user" style="color:var(--royal);"></i> ${v.name || 'Student'}</li>`).join('')
      : `<li class="text-muted">No one has joined yet.</li>`;

    for(const v of viewerDocs){
      if(!v.offer || v.answer) continue; // already answered, or no offer yet
      if(teacherPeerConnections.has(v.id)) continue; // already handling this viewer
      const pc = new RTCPeerConnection(RTC_CONFIG);
      teacherPeerConnections.set(v.id, pc);
      localStream.getTracks().forEach(track=> pc.addTrack(track, localStream));
      const gatheredCandidates = [];
      pc.onicecandidate = (e)=>{
        if(e.candidate){
          gatheredCandidates.push(e.candidate.toJSON());
          setRecord(`liveRooms/${currentCourseId}/viewers`, v.id, { teacherCandidates: gatheredCandidates });
        }
      };
      try{
        await pc.setRemoteDescription(new RTCSessionDescription(v.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await setRecord(`liveRooms/${currentCourseId}/viewers`, v.id, { answer: { type: answer.type, sdp: answer.sdp } });
        // Apply any viewer ICE candidates already present, and watch for more.
        let applied = 0;
        const applyNew = (doc)=>{
          const cands = doc.viewerCandidates || [];
          for(let i=applied;i<cands.length;i++){ pc.addIceCandidate(new RTCIceCandidate(cands[i])).catch(()=>{}); }
          applied = cands.length;
        };
        applyNew(v);
        const poll = setInterval(async ()=>{
          if(pc.connectionState === 'closed' || pc.connectionState === 'failed'){ clearInterval(poll); return; }
          const snap = await getDoc(doc(db, `liveRooms/${currentCourseId}/viewers`, v.id));
          if(snap.exists()) applyNew(snap.data());
        }, 2000);
      }catch(err){ console.warn('Could not connect to viewer', v.id, err.message); }
    }
  });
}

document.getElementById('endLiveBtn').addEventListener('click', async ()=>{
  if(localStream) localStream.getTracks().forEach(t=>t.stop());
  teacherPeerConnections.forEach(pc=> pc.close());
  teacherPeerConnections.clear();
  if(unsubViewers) unsubViewers();
  await setRecord('liveRooms', currentCourseId, { status:'ended' });
  document.getElementById('mainVideo').srcObject = null;
  document.getElementById('goLiveBtn').classList.remove('hidden');
  document.getElementById('endLiveBtn').classList.add('hidden');
  toast('Session ended.', 'info');
});

/* =========================================================================
   STUDENT SIDE
   ========================================================================= */
document.getElementById('joinBtn').addEventListener('click', async ()=>{
  if(!currentCourseId){ toast('Choose a course first.', 'error'); return; }
  try{
    viewerPeerConnection = new RTCPeerConnection(RTC_CONFIG);
    viewerPeerConnection.addTransceiver('video', { direction:'recvonly' });
    viewerPeerConnection.addTransceiver('audio', { direction:'recvonly' });
    viewerPeerConnection.ontrack = (e)=>{ document.getElementById('mainVideo').srcObject = e.streams[0]; };

    const gatheredCandidates = [];
    viewerPeerConnection.onicecandidate = (e)=>{
      if(e.candidate){
        gatheredCandidates.push(e.candidate.toJSON());
        setRecord(`liveRooms/${currentCourseId}/viewers`, session.uid, { viewerCandidates: gatheredCandidates });
      }
    };

    const offer = await viewerPeerConnection.createOffer();
    await viewerPeerConnection.setLocalDescription(offer);
    await setRecord(`liveRooms/${currentCourseId}/viewers`, session.uid, {
      name: session.fullName || 'Student', offer: { type: offer.type, sdp: offer.sdp }
    });

    let appliedTeacherCands = 0;
    if(unsubOwnDoc) unsubOwnDoc();
    unsubOwnDoc = listenToCollection(`liveRooms/${currentCourseId}/viewers`, async (docs)=>{
      const mine = docs.find(d=>d.id === session.uid);
      if(!mine) return;
      if(mine.answer && viewerPeerConnection.signalingState === 'have-local-offer'){
        await viewerPeerConnection.setRemoteDescription(new RTCSessionDescription(mine.answer));
      }
      const cands = mine.teacherCandidates || [];
      for(let i=appliedTeacherCands;i<cands.length;i++){ viewerPeerConnection.addIceCandidate(new RTCIceCandidate(cands[i])).catch(()=>{}); }
      appliedTeacherCands = cands.length;
    });

    document.getElementById('joinBtn').textContent = 'Connecting…';
    document.getElementById('joinBtn').disabled = true;
    toast('Joining live class…', 'info');
  }catch(err){ toast('Could not join: ' + err.message, 'error'); }
});

/* Clean up viewer doc when leaving the page */
window.addEventListener('beforeunload', ()=>{
  if(session?.role !== 'teacher' && currentCourseId && session){
    deleteDoc(doc(db, `liveRooms/${currentCourseId}/viewers`, session.uid)).catch(()=>{});
  }
});
