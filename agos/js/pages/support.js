// ============================================================
// AGOS — Help & Support Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatDateTime, timeAgo, escHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

let profile = null;

const statusColors = {
  open: 'badge-info',
  in_progress: 'badge-warning',
  resolved: 'badge-success',
  closed: 'badge-gray',
};
const priorityClass = {
  low: 'priority-badge-low',
  normal: 'priority-badge-normal',
  high: 'priority-badge-high',
  urgent: 'priority-badge-urgent',
};

async function init() {
  profile = await initShell('support');
  if (!profile) return;
  loadTickets();
  setupSubmit();
  setupModal();
}

async function loadTickets() {
  const list = document.getElementById('tickets-list');
  const { data } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (!data?.length) {
    list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-headset" aria-hidden="true"></i></div>
          <h3>No support tickets yet</h3>
          <p>Submit a request above and we'll help you as soon as possible.</p>
        </div>`;
    return;
  }

  list.innerHTML = data.map(t => `
    <div class="ticket-item" data-id="${t.id}" tabindex="0" role="button"
         aria-label="Ticket: ${escHtml(t.subject)}, status: ${t.status}">
      <div class="ticket-head">
        <div class="ticket-subject">${escHtml(t.subject)}</div>
        <span class="badge ${statusColors[t.status] || 'badge-gray'}">${t.status.replace('_', ' ')}</span>
      </div>
      <div class="ticket-preview">${escHtml(t.body.slice(0, 100))}${t.body.length > 100 ? '...' : ''}</div>
      <div class="ticket-meta">
        <span class="badge ${priorityClass[t.priority]}">${t.priority}</span>
        <span class="ticket-date">${timeAgo(t.created_at)}</span>
        ${t.admin_reply ? `<span class="badge badge-success" style="font-size:.6rem">Reply received</span>` : ''}
      </div>
    </div>`).join('');

  list.querySelectorAll('.ticket-item').forEach(item => {
    const handler = () => {
      const ticket = data.find(t => t.id === item.dataset.id);
      if (ticket) openModal(ticket);
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

function setupSubmit() {
  document.getElementById('btn-submit-ticket').addEventListener('click', async () => {
    const subject = document.getElementById('ticket-subject').value.trim();
    const body = document.getElementById('ticket-body').value.trim();
    const priority = document.getElementById('ticket-priority').value;
    const errEl = document.getElementById('ticket-error');

    if (!subject) { errEl.textContent = 'Please enter a subject.'; errEl.classList.remove('hidden'); return; }
    if (!body || body.length < 10) { errEl.textContent = 'Please describe your issue (at least 10 characters).'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    const btn = document.getElementById('btn-submit-ticket');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const { error } = await supabase.from('support_tickets').insert({
      user_id: profile.id,
      subject,
      body,
      priority,
    });

    btn.disabled = false;
    btn.textContent = 'Submit Request';

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }

    showToast('Ticket submitted', 'We\'ll get back to you soon!', 'success');
    document.getElementById('ticket-subject').value = '';
    document.getElementById('ticket-body').value = '';
    document.getElementById('ticket-priority').value = 'normal';
    loadTickets();
  });
}

function setupModal() {
  document.getElementById('ticket-modal-close').addEventListener('click', closeModal);
  document.getElementById('ticket-modal-close2').addEventListener('click', closeModal);
  document.getElementById('ticket-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('ticket-modal')) closeModal();
  });
}

function openModal(ticket) {
  document.getElementById('ticket-modal-title').textContent = ticket.subject;
  document.getElementById('ticket-modal-body').innerHTML = `
    <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-5);flex-wrap:wrap">
      <span class="badge ${statusColors[ticket.status] || 'badge-gray'}">${ticket.status.replace('_', ' ')}</span>
      <span class="badge ${priorityClass[ticket.priority]}">${ticket.priority} priority</span>
      <span class="ticket-date" style="font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center">
        Submitted ${formatDateTime(ticket.created_at)}
      </span>
    </div>

    <div style="margin-bottom:var(--space-5)">
      <div class="form-label" style="margin-bottom:var(--space-2)">Your Message</div>
      <div style="background:var(--color-gray-50);padding:var(--space-4);border-radius:var(--border-radius);font-size:var(--font-size-sm);line-height:1.7;white-space:pre-wrap">${escHtml(ticket.body)}</div>
    </div>

    ${ticket.admin_reply ? `
      <div style="background:var(--color-success-bg);padding:var(--space-4);border-radius:var(--border-radius);border:2px solid #bbf7d0">
        <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-3)">
          <i class="fas fa-headset" aria-hidden="true" style="font-size:1.2rem;color:var(--color-primary)"></i>
          <strong style="font-size:var(--font-size-sm)">Support Team Reply</strong>
          ${ticket.replied_at ? `<span style="font-size:var(--font-size-xs);color:var(--text-muted);margin-left:auto">${formatDateTime(ticket.replied_at)}</span>` : ''}
        </div>
        <div style="font-size:var(--font-size-sm);line-height:1.7;white-space:pre-wrap">${escHtml(ticket.admin_reply)}</div>
      </div>
    ` : `
      <div class="alert alert-info">
        <i class="fas fa-circle-info" aria-hidden="true"></i> Your request is being reviewed. We'll reply as soon as possible.
      </div>
    `}
  `;
  document.getElementById('ticket-modal').classList.remove('hidden');
  document.getElementById('ticket-modal-close').focus();
}

function closeModal() {
  document.getElementById('ticket-modal').classList.add('hidden');
}

init();