// ============================================================
// AGOS Admin — User Management
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { formatPeso, formatDate, getInitials, escHtml, debounce } from '../../js/lib/utils.js';
import { showToast } from '../../js/lib/toast.js';

let adminProfile = null;
let page = 0;
const PAGE_SIZE = 20;
let searchVal = '';
let filterVal = '';

async function init() {
  adminProfile = await initAdminShell('users');
  if (!adminProfile) return;
  loadUsers();
  setupSearch();
  setupModal();
}

async function loadUsers(reset = true) {
  if (reset) page = 0;

  let q = supabase
    .from('profiles')
    .select('id, full_name, phone, account_number, balance, is_active, is_admin, created_at', { count: 'exact' })
    .eq('is_admin', false)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (searchVal) {
    q = q.or(`full_name.ilike.%${searchVal}%,account_number.ilike.%${searchVal}%,phone.ilike.%${searchVal}%`);
  }
  if (filterVal === 'active')   q = q.eq('is_active', true);
  if (filterVal === 'inactive') q = q.eq('is_active', false);

  const { data, count, error } = await q;

  const tbody = document.getElementById('users-tbody');
  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon"><i class="fas fa-users" aria-hidden="true"></i></div><h3>No users found</h3></div></td></tr>`;
    document.getElementById('users-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar">${getInitials(u.full_name)}</div>
          <div>
            <div class="user-name">${escHtml(u.full_name)}</div>
          </div>
        </div>
      </td>
      <td style="font-family:monospace;font-size:var(--font-size-xs)">${u.account_number}</td>
      <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${u.phone || '—'}</td>
      <td class="font-bold">${formatPeso(u.balance)}</td>
      <td>
        <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${formatDate(u.created_at, { month:'short', year:'numeric', day:'numeric' })}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-view-user" data-id="${u.id}" aria-label="View ${escHtml(u.full_name)}">
          View
        </button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.btn-view-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = data.find(u => u.id === btn.dataset.id);
      if (user) openUserModal(user);
    });
  });

  // Pagination
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
  renderPagination(totalPages);
}

function setupSearch() {
  document.getElementById('user-search').addEventListener('input', debounce(e => {
    searchVal = e.target.value.trim();
    loadUsers();
  }, 350));
  document.getElementById('user-filter').addEventListener('change', e => {
    filterVal = e.target.value;
    loadUsers();
  });
}

function renderPagination(totalPages) {
  const el = document.getElementById('users-pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="pg-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
    <span style="font-size:var(--font-size-sm);color:var(--text-muted)">Page ${page + 1} of ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" id="pg-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>`;
  document.getElementById('pg-prev')?.addEventListener('click', () => { page--; loadUsers(false); });
  document.getElementById('pg-next')?.addEventListener('click', () => { page++; loadUsers(false); });
}

function setupModal() {
  document.getElementById('user-modal-close').addEventListener('click', closeModal);
  document.getElementById('user-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('user-modal')) closeModal();
  });
}

async function openUserModal(user) {
  document.getElementById('user-modal-title').textContent = user.full_name;

  // Load recent transactions for this user
  const { data: txns } = await supabase
    .from('admin_transactions_view')
    .select('*')
    .or(`sender_account.eq.${user.account_number},receiver_account.eq.${user.account_number}`)
    .order('created_at', { ascending: false })
    .limit(5);

  document.getElementById('user-modal-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-5)">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;flex-shrink:0">${getInitials(user.full_name)}</div>
      <div>
        <div style="font-size:var(--font-size-lg);font-weight:700">${escHtml(user.full_name)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);font-family:monospace">${user.account_number}</div>
        <div style="margin-top:var(--space-1)">
          <span class="badge ${user.is_active ? 'badge-success' : 'badge-danger'}">${user.is_active ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-5)">
      <div style="background:var(--color-gray-50);padding:var(--space-4);border-radius:var(--border-radius)">
        <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Balance</div>
        <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-success)">${formatPeso(user.balance)}</div>
      </div>
      <div style="background:var(--color-gray-50);padding:var(--space-4);border-radius:var(--border-radius)">
        <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Phone</div>
        <div style="font-size:var(--font-size-sm);font-weight:600">${user.phone || '—'}</div>
      </div>
    </div>

    <div style="margin-bottom:var(--space-5)">
      <div style="font-size:var(--font-size-sm);font-weight:700;margin-bottom:var(--space-3)">Recent Transactions</div>
      ${!txns?.length
        ? '<p style="font-size:var(--font-size-xs);color:var(--text-muted)">No transactions yet.</p>'
        : txns.map(t => `
          <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs)">
            <span>${t.type.replace(/_/g,' ')} · <span style="color:var(--text-muted)">${t.reference_no}</span></span>
            <span class="font-bold">${formatPeso(t.amount)}</span>
          </div>`).join('')}
    </div>

    <div style="display:flex;flex-direction:column;gap:var(--space-3)">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" for="edit-name">Full Name</label>
        <input type="text" id="edit-name" class="form-control" value="${escHtml(user.full_name)}" />
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" for="edit-phone">Phone</label>
        <input type="tel" id="edit-phone" class="form-control" value="${user.phone || ''}" />
      </div>
    </div>
    <div id="user-edit-error" class="form-error hidden" role="alert"></div>
  `;

  document.getElementById('user-modal-footer').innerHTML = `
    <button class="btn btn-ghost" id="um-cancel">Cancel</button>
    <button class="btn ${user.is_active ? 'btn-danger' : 'btn-success'}" id="um-toggle-active" data-id="${user.id}" data-active="${user.is_active}">
      <i class="fas ${user.is_active ? 'fa-user-slash' : 'fa-user-check'}" aria-hidden="true"></i> ${user.is_active ? 'Deactivate' : 'Activate'}
    </button>
    <button class="btn btn-primary" id="um-save" data-id="${user.id}">Save Changes</button>
  `;

  document.getElementById('um-cancel').addEventListener('click', closeModal);

  document.getElementById('um-save').addEventListener('click', async () => {
    const name  = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const errEl = document.getElementById('user-edit-error');
    if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('hidden'); return; }

    const { error } = await supabase.from('profiles').update({ full_name: name, phone: phone || null }).eq('id', user.id);
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    showToast('Saved', user.full_name + '\'s profile updated.', 'success');
    closeModal();
    loadUsers();
  });

  document.getElementById('um-toggle-active').addEventListener('click', async () => {
    const newActive = !user.is_active;
    if (!confirm(`${newActive ? 'Activate' : 'Deactivate'} account for ${user.full_name}?`)) return;
    const { error } = await supabase.from('profiles').update({ is_active: newActive }).eq('id', user.id);
    if (!error) {
      showToast(newActive ? 'Account Activated' : 'Account Deactivated', user.full_name, newActive ? 'success' : 'warning');
      closeModal();
      loadUsers();
    }
  });

  document.getElementById('user-modal').classList.remove('hidden');
  document.getElementById('user-modal-close').focus();
}

function closeModal() { document.getElementById('user-modal').classList.add('hidden'); }

init();
