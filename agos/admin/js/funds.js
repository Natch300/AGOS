// ============================================================
// AGOS Admin — Fund Allocation
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { formatPeso, formatDateTime, getInitials, escHtml, debounce } from '../../js/lib/utils.js';
import { showToast } from '../../js/lib/toast.js';

let adminProfile  = null;
let selectedUser  = null;

async function init() {
  adminProfile = await initAdminShell('funds');
  if (!adminProfile) return;
  loadSystemFund();
  loadFundOpsLog();
  setupSystemFundForm();
  setupUserSearch();
  setupAllocForm();
}

async function loadSystemFund() {
  const { data } = await supabase.from('system_fund').select('*').order('id').limit(1).single();
  if (data) {
    document.getElementById('sys-fund-display').textContent = formatPeso(data.total_funds);
    document.getElementById('sys-fund-note').textContent = data.notes
      ? `Note: ${data.notes} · Updated: ${formatDateTime(data.updated_at)}`
      : `Last updated: ${formatDateTime(data.updated_at)}`;
    document.getElementById('fund-set-amount').value = data.total_funds;
    document.getElementById('fund-set-notes').value  = data.notes || '';
  }
}

function setupSystemFundForm() {
  document.getElementById('btn-set-fund').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('fund-set-amount').value);
    const notes  = document.getElementById('fund-set-notes').value.trim();
    const errEl  = document.getElementById('fund-set-error');
    errEl.classList.add('hidden');

    if (isNaN(amount) || amount < 0) { errEl.textContent = 'Please enter a valid amount (0 or more).'; errEl.classList.remove('hidden'); return; }
    if (!confirm(`Set system total funds to ${formatPeso(amount)}?`)) return;

    const btn = document.getElementById('btn-set-fund');
    btn.disabled = true;

    const { error } = await supabase
      .from('system_fund')
      .update({ total_funds: amount, notes: notes || null, updated_by: adminProfile.id, updated_at: new Date().toISOString() })
      .eq('id', 1);

    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    showToast('System fund updated', formatPeso(amount), 'success');
    loadSystemFund();
  });
}

function setupUserSearch() {
  const input = document.getElementById('alloc-search');
  const results = document.getElementById('alloc-results');

  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; return; }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, account_number, balance, phone')
      .eq('is_admin', false)
      .eq('is_active', true)
      .or(`full_name.ilike.%${q}%,account_number.ilike.%${q}%`)
      .limit(6);

    if (!data?.length) { results.innerHTML = '<p style="font-size:var(--font-size-xs);color:var(--text-muted);padding:var(--space-2)">No users found.</p>'; return; }

    results.innerHTML = data.map(u => `
      <div class="user-result-item" data-id="${u.id}" tabindex="0" role="option" aria-label="${escHtml(u.full_name)}">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;flex-shrink:0">${getInitials(u.full_name)}</div>
        <div>
          <div style="font-weight:700;font-size:var(--font-size-sm)">${escHtml(u.full_name)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${u.account_number} · ${formatPeso(u.balance)}</div>
        </div>
      </div>`).join('');

    results.querySelectorAll('.user-result-item').forEach(item => {
      const handler = () => {
        const user = data.find(u => u.id === item.dataset.id);
        if (user) selectUser(user);
      };
      item.addEventListener('click', handler);
      item.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
    });
  }, 300));
}

function selectUser(user) {
  selectedUser = user;
  document.getElementById('alloc-results').innerHTML = '';
  document.getElementById('alloc-search').value = '';

  const sel = document.getElementById('alloc-selected');
  sel.classList.remove('hidden');
  document.getElementById('alloc-avatar').textContent  = getInitials(user.full_name);
  document.getElementById('alloc-name').textContent    = user.full_name;
  document.getElementById('alloc-acct').textContent    = user.account_number;
  document.getElementById('alloc-balance').textContent = 'Current balance: ' + formatPeso(user.balance);

  document.getElementById('alloc-clear').addEventListener('click', () => {
    selectedUser = null;
    sel.classList.add('hidden');
  });
}

function setupAllocForm() {
  document.getElementById('btn-alloc').addEventListener('click', async () => {
    const type   = document.getElementById('alloc-type').value;
    const amount = parseFloat(document.getElementById('alloc-amount').value);
    const note   = document.getElementById('alloc-note').value.trim();
    const errEl  = document.getElementById('alloc-error');
    errEl.classList.add('hidden');

    if (!selectedUser) { errEl.textContent = 'Please select a user first.'; errEl.classList.remove('hidden'); return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; errEl.classList.remove('hidden'); return; }
    if (!confirm(`${type === 'credit' ? 'Add' : 'Remove'} ${formatPeso(amount)} ${type === 'credit' ? 'to' : 'from'} ${selectedUser.full_name}'s account?`)) return;

    const btn = document.getElementById('btn-alloc');
    btn.disabled = true;

    const rpcName = type === 'credit' ? 'admin_credit_user' : 'admin_debit_user';
    const { data, error } = await supabase.rpc(rpcName, {
      p_admin_id: adminProfile.id,
      p_user_id:  selectedUser.id,
      p_amount:   amount,
      p_notes:    note || null,
    });

    btn.disabled = false;

    if (error || !data?.success) {
      errEl.textContent = error?.message || data?.error || 'Operation failed.';
      errEl.classList.remove('hidden');
      return;
    }

    showToast(
      type === 'credit' ? 'Funds Added' : 'Funds Removed',
      `${formatPeso(amount)} ${type === 'credit' ? 'credited to' : 'debited from'} ${selectedUser.full_name}`,
      type === 'credit' ? 'success' : 'warning'
    );

    // Refresh user balance display
    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selectedUser.id).single();
    if (fresh) {
      selectedUser.balance = fresh.balance;
      document.getElementById('alloc-balance').textContent = 'Current balance: ' + formatPeso(fresh.balance);
    }

    document.getElementById('alloc-amount').value = '';
    document.getElementById('alloc-note').value   = '';
    loadFundOpsLog();
  });
}

async function loadFundOpsLog() {
  const { data } = await supabase
    .from('admin_transactions_view')
    .select('*')
    .in('type', ['admin_credit', 'admin_debit'])
    .order('created_at', { ascending: false })
    .limit(20);

  const el = document.getElementById('fund-ops-log');
  if (!data?.length) {
    el.innerHTML = '<div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon"><i class="fas fa-receipt" aria-hidden="true"></i></div><h3>No fund operations yet</h3></div>';
    return;
  }

  el.innerHTML = `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Reference</th><th>Description</th></tr></thead>
    <tbody>
    ${data.map(t => `
      <tr>
        <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${formatDateTime(t.created_at)}</td>
        <td>${escHtml(t.type === 'admin_credit' ? (t.receiver_name||'—') : (t.sender_name||'—'))}</td>
        <td><span class="badge ${t.type === 'admin_credit' ? 'badge-success' : 'badge-warning'}">${t.type === 'admin_credit' ? '+ Credit' : '- Debit'}</span></td>
        <td class="font-bold ${t.type === 'admin_credit' ? 'text-success' : 'text-warning'}">${formatPeso(t.amount)}</td>
        <td style="font-family:monospace;font-size:.7rem">${t.reference_no}</td>
        <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${escHtml(t.description||'—')}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

init();
