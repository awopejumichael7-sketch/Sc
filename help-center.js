/* ==========================================================================
   SCHOLAR'S CAMP LMS — HELP CENTER
   ========================================================================== */
import { bootCommon, toast, openModal, closeModal } from './app.js';
import { getAllRecords, addRecord, updateRecord, watchSession } from './firebase-config.js';

bootCommon();
window.scUtils = { toast, openModal, closeModal };

let session = null, tickets = [];

watchSession((s)=>{
  if(!s){ window.location.href = 'login-student.html'; return; }
  session = s;
  document.getElementById('backLink').addEventListener('click', ()=>{
    window.location.href = s.role === 'teacher' ? 'teacher-dashboard.html' : s.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  });
  if(s.role === 'admin') document.getElementById('ticketsSub').textContent = 'All tickets raised across the campus.';
  loadTickets();
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

async function loadTickets(){
  tickets = (await getAllRecords('feedback')).filter(f=>f.kind === 'ticket' && (session.role === 'admin' || f.authorId === session.uid));
  renderTickets();
}
function renderTickets(){
  const body = document.querySelector('#ticketsTable tbody');
  if(!tickets.length){ body.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:30px;">No tickets yet.</td></tr>`; return; }
  body.innerHTML = tickets.slice().reverse().map(t=>`
    <tr>
      <td>${escapeHtml(t.subject)}</td>
      <td>${escapeHtml(t.authorName)}</td>
      <td>${t.status === 'resolved' ? '<span class="badge badge-green">Resolved</span>' : '<span class="badge badge-gold">Open</span>'}</td>
      <td class="text-muted">${t.createdAt ? new Date(t.createdAt.seconds*1000).toLocaleDateString() : 'just now'}</td>
      <td class="row-actions">
        <button onclick="window.scHelp.viewTicket('${t.id}')" title="View"><i class="fa-solid fa-eye"></i></button>
        ${session.role==='admin' && t.status!=='resolved' ? `<button onclick="window.scHelp.resolveTicket('${t.id}')" title="Mark resolved"><i class="fa-solid fa-check"></i></button>` : ''}
      </td>
    </tr>`).join('');
}
document.getElementById('newTicketBtn').addEventListener('click', ()=>{
  document.getElementById('ticketForm').reset();
  document.getElementById('ticketDocId').value = '';
  document.getElementById('ticketModalTitle').textContent = 'New Support Ticket';
  document.getElementById('ticketThread').style.display = 'none';
  document.getElementById('ticketSubject').disabled = false;
  document.getElementById('ticketMessage').disabled = false;
  openModal('modalTicket');
});
document.getElementById('ticketForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const docId = document.getElementById('ticketDocId').value;
  if(docId) { closeModal('modalTicket'); return; } // read-only view mode, nothing to resubmit
  try{
    await addRecord('feedback', {
      kind:'ticket', status:'open',
      subject: document.getElementById('ticketSubject').value.trim(),
      message: document.getElementById('ticketMessage').value.trim(),
      authorId: session.uid, authorName: session.fullName || session.role, role: session.role
    });
    toast('Ticket submitted — an administrator will follow up.', 'success');
    closeModal('modalTicket');
    await loadTickets();
  }catch(err){ toast('Could not submit ticket: ' + err.message, 'error'); }
});
window.scHelp = {
  viewTicket: (id)=>{
    const t = tickets.find(x=>x.id===id); if(!t) return;
    document.getElementById('ticketDocId').value = id;
    document.getElementById('ticketModalTitle').textContent = 'Ticket Details';
    document.getElementById('ticketSubject').value = t.subject;
    document.getElementById('ticketSubject').disabled = true;
    document.getElementById('ticketMessage').value = t.message;
    document.getElementById('ticketMessage').disabled = true;
    document.getElementById('ticketThread').style.display = 'block';
    document.getElementById('ticketThread').innerHTML = `<span class="badge ${t.status==='resolved'?'badge-green':'badge-gold'}">${t.status}</span>`;
    openModal('modalTicket');
  },
  resolveTicket: async (id)=>{
    try{ await updateRecord('feedback', id, { status:'resolved' }); toast('Marked resolved.', 'success'); await loadTickets(); }
    catch(err){ toast('Update failed: ' + err.message, 'error'); }
  }
};
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
