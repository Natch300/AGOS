// ============================================================
// AGOS Admin — Support Tickets
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { formatDateTime, timeAgo, escHtml } from '../../js/lib/utils.js';
import { showToast } from '../../js/lib/toast.js';

let adminProfile = null;

const statusBadge = {
  open: 'badge-info', in_progress: 'badge-warning',
  resolved: 'badge-success', closed: 'badge-gray'
};
const priorityClass = { urgent:'priority-urgent', high:'priority-high', normal:'priority-normal', low:'priority-low' };

async function init() {
  adminProfile = await initAdminShell('tickets');
  if (!adminProfile) return;
  loadTickets();
  document.getElementById('btn-filter').addEventListener('click', loadTickets);
  document.getElementById('btn-reset').addEventListener('click', () => {
    document.getElementById('f-status').value   = 'open';
    document.getElementById('f-priority').value = '';
    document.getElementById('f-search').value   = '';
    loadTickets();
  });
  setupModal();
}

async function loadTickets() {
  const status   = document.getElementById('f-status').value;
  const priority = document.getElementById('f-priority').value;
  const search   = document.getElementById('f-search').value.trim();

  let q = supabase
    .from('support_tickets')
    .select(`
      *,
      profiles!user_id(full_name, account_number)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status)   q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);

  const { data } = await q;
  let rows = data || [];

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(t =>
      t.subject?.toLowerCase().includes(s) ||
      t.body?.toLowerCase().includes(s) ||
      t.profiles?.full_name?.toLowerCase().includes(s)
    );
  }

  const body  = document.getElementById('tickets-body');
  const count = document.getElementById('ticket-count');
  count.textContent = `${rows.length} ticket${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
     body.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-headset" aria-hidden="true"></i></div><h3>No tickets found</h3><p>Adjust filters to see more.</p></div>`;
    return;
  }

  body.innerHTML = rows.map(t => `
    <div class="ticket-row" data-id="${t.id}" tabindex="0" role="button" aria-label="Ticket: ${escHtml(t.subject)}">
      <div>
        <div class="t-subject">${escHtml(t.subject)}</div>
        <div class="t-meta">
          <span class="${priorityClass[t.priority]} font-bold">${t.priority.toUpperCase()}</span>
          · ${escHtml(t.profiles?.full_name || 'Unknown')}
          · ${timeAgo(t.created_at)}
          ${t.admin_reply ? ' · <span style="color:var(--color-success)">✓ Replied</span>' : ''}
        </div>
      </div>
      <span class="badge ${statusBadge[t.status]||'badge-gray'}">${t.status.replace('_',' ')}</span>
      <span class="badge badge-gray" style="font-size:.65rem">${t.priority}</span>
      <button class="btn btn-primary btn-sm" data-open="${t.id}">Open →</button>
    </div>`).join('');

  body.querySelectorAll('[data-open], .ticket-row').forEach(el => {
    const id = el.dataset.id || el.dataset.open;
    if (!id) return;
    const handler = (e) => {
      if (e.target.tagName === 'BUTTON' && !e.target.dataset.open) return;
      const t = rows.find(r => r.id === id);
      if (t) openTicketModal(t);
    };
    el.addEventListener('click', handler);
    if (el.classList.contains('ticket-row')) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') handler(e); });
    }
  });
}

function setupModal() {
  document.getElementById('tm-close').addEventListener('click', closeModal);
  document.getElementById('ticket-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('ticket-modal')) closeModal();
  });
}

function openTicketModal(ticket) {
  document.getElementById('ticket-modal-title').textContent = ticket.subject;
  document.getElementById('ticket-modal-body').innerHTML = `
    <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-5)">
      <span class="badge ${statusBadge[ticket.status]||'badge-gray'}">${ticket.status.replace('_',' ')}</span>
      <span class="badge badge-gray">${ticket.priority} priority</span>
      <span style="font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center">${formatDateTime(ticket.created_at)}</span>
    </div>
    <div style="margin-bottom:var(--space-4)">
      <strong style="font-size:var(--font-size-xs);text-transform:uppercase;color:var(--text-muted)">From:</strong>
      <span style="font-size:var(--font-size-sm);font-weight:700;margin-left:var(--space-2)">${escHtml(ticket.profiles?.full_name||'Unknown')}</span>
      <span style="font-size:var(--font-size-xs);color:var(--text-muted);margin-left:var(--space-2)">${ticket.profiles?.account_number||''}</span>
    </div>
    <div style="background:var(--color-gray-50);padding:var(--space-4);border-radius:var(--border-radius);font-size:var(--font-size-sm);line-height:1.7;white-space:pre-wrap;margin-bottom:var(--space-5)">${escHtml(ticket.body)}</div>

    ${ticket.admin_reply ? `
      <div style="background:var(--color-success-bg);padding:var(--space-4);border-radius:var(--border-radius);border:2px solid #bbf7d0;margin-bottom:var(--space-5)">
        <div style="font-weight:700;font-size:var(--font-size-xs);text-transform:uppercase;margin-bottom:var(--space-2);color:var(--color-success)">Previous Reply</div>
        <div style="font-size:var(--font-size-sm);line-height:1.7;white-space:pre-wrap">${escHtml(ticket.admin_reply)}</div>
      </div>` : ''}

    <div class="form-group">
      <label class="form-label" for="admin-reply-text">Reply to User</label>
      <textarea id="admin-reply-text" class="form-control" rows="5"
                placeholder="Type your reply here…">${escHtml(ticket.admin_reply || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="ticket-status-sel">Update Status</label>
      <select id="ticket-status-sel" class="form-control">
        <option value="open"        ${ticket.status==='open'        ?'selected':''}>Open</option>
        <option value="in_progress" ${ticket.status==='in_progress' ?'selected':''}>In Progress</option>
        <option value="resolved"    ${ticket.status==='resolved'    ?'selected':''}>Resolved</option>
        <option value="closed"      ${ticket.status==='closed'      ?'selected':''}>Closed</option>
      </select>
    </div>
    <div id="reply-error" class="form-error hidden" role="alert"></div>
  `;

  document.getElementById('ticket-modal-footer').innerHTML = `
    <button class="btn btn-ghost" id="tm-cancel">Cancel</button>
    <button class="btn btn-primary" id="tm-save" data-id="${ticket.id}">Send Reply & Update</button>
  `;
  document.getElementById('tm-cancel').addEventListener('click', closeModal);
  document.getElementById('tm-save').addEventListener('click', async () => {
    const reply  = document.getElementById('admin-reply-text').value.trim();
    const status = document.getElementById('ticket-status-sel').value;
    const errEl  = document.getElementById('reply-error');
    errEl.classList.add('hidden');

    if (!reply) { errEl.textContent = 'Please enter a reply.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('tm-save');
    btn.disabled = true;

    const { error } = await supabase.from('support_tickets').update({
      admin_reply: reply,
      status,
      replied_by: adminProfile.id,
      replied_at: new Date().toISOString(),
    }).eq('id', ticket.id);

    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    // Notify the user
    await supabase.from('notifications').insert({
      user_id: ticket.user_id,
      title: 'Support Reply',
      body:  `Your ticket "${ticket.subject}" has been updated. Status: ${status}.`,
      type:  'info',
    });

    showToast('Reply sent', 'Ticket updated successfully.', 'success');
    closeModal();
    loadTickets();
  });

  document.getElementById('ticket-modal').classList.remove('hidden');
  document.getElementById('tm-close').focus();
}

function closeModal() { document.getElementById('ticket-modal').classList.add('hidden'); }

init();
