// ============================================================
// AGOS Admin — All Transactions
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { formatPeso, formatDateTime, escHtml } from '../../js/lib/utils.js';
import { showToast } from '../../js/lib/toast.js';

let page = 0;
const PAGE_SIZE = 25;

async function init() {
  await initAdminShell('transactions');

  // Default last 30 days
  const now   = new Date();
  const start = new Date(now - 30 * 86400000);
  document.getElementById('f-from').value = start.toISOString().slice(0,10);
  document.getElementById('f-to').value   = now.toISOString().slice(0,10);

  // Pre-select flagged if URL param
  const params = new URLSearchParams(window.location.search);
  if (params.get('filter') === 'flagged') document.getElementById('f-status').value = 'flagged';

  loadTransactions(true);
  document.getElementById('btn-filter').addEventListener('click', () => loadTransactions(true));
  document.getElementById('btn-reset').addEventListener('click', () => {
    ['f-type','f-status','f-search'].forEach(id => document.getElementById(id).value = '');
    const n = new Date(), s = new Date(n - 30*86400000);
    document.getElementById('f-from').value = s.toISOString().slice(0,10);
    document.getElementById('f-to').value   = n.toISOString().slice(0,10);
    loadTransactions(true);
  });
  document.getElementById('btn-more').addEventListener('click', () => { page++; loadTransactions(false); });
}

async function loadTransactions(reset) {
  if (reset) page = 0;
  document.getElementById('loading-overlay').classList.remove('hidden');

  const type   = document.getElementById('f-type').value;
  const status = document.getElementById('f-status').value;
  const from   = document.getElementById('f-from').value;
  const to     = document.getElementById('f-to').value;
  const search = document.getElementById('f-search').value.trim();

  let q = supabase
    .from('admin_transactions_view')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (type)   q = q.eq('type', type);
  if (status) q = q.eq('status', status);
  if (from)   q = q.gte('created_at', from + 'T00:00:00');
  if (to)     q = q.lte('created_at', to   + 'T23:59:59');

  const { data } = await q;
  document.getElementById('loading-overlay').classList.add('hidden');

  let rows = data || [];
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(t =>
      t.reference_no?.toLowerCase().includes(s) ||
      t.sender_name?.toLowerCase().includes(s) ||
      t.receiver_name?.toLowerCase().includes(s) ||
      t.sender_account?.toLowerCase().includes(s) ||
      t.receiver_account?.toLowerCase().includes(s) ||
      String(t.amount).includes(s)
    );
  }

  const tbody   = document.getElementById('txns-tbody');
  const moreBtn = document.getElementById('txn-load-more');

  if (reset) tbody.innerHTML = '';

  if (!rows.length && page === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon"><i class="fas fa-receipt" aria-hidden="true"></i></div><h3>No transactions found</h3><p>Adjust filters and try again.</p></div></td></tr>`;
    moreBtn.classList.add('hidden');
    document.getElementById('txn-total').textContent = '';
    return;
  }

  document.getElementById('txn-total').textContent = `(${page * PAGE_SIZE + rows.length}+ shown)`;

  const typeIcon = { transfer:'fas fa-arrow-up-right', bill_payment:'fas fa-file-invoice-dollar', admin_credit:'fas fa-wallet', admin_debit:'fas fa-money-bill-wave' };
  const statusBadge = {
    completed: 'badge-success', flagged: 'badge-warning',
    pending: 'badge-info',      failed: 'badge-danger',
  };

  tbody.insertAdjacentHTML('beforeend', rows.map(t => `
    <tr>
      <td style="font-family:monospace;font-size:.7rem">${t.reference_no}</td>
      <td><i class="${typeIcon[t.type]||'fas fa-credit-card'}" style="font-size:1rem;margin-right:.5rem"></i> <span style="font-size:var(--font-size-xs)">${t.type.replace(/_/g,' ')}</span></td>
      <td>
        <div style="font-weight:600;font-size:var(--font-size-xs)">${escHtml(t.sender_name||'—')}</div>
        <div style="font-family:monospace;font-size:.65rem;color:var(--text-muted)">${t.sender_account||''}</div>
      </td>
      <td>
        <div style="font-weight:600;font-size:var(--font-size-xs)">${escHtml(t.receiver_name||t.bill_biller||'—')}</div>
        <div style="font-family:monospace;font-size:.65rem;color:var(--text-muted)">${t.receiver_account||t.bill_account||''}</div>
      </td>
      <td class="font-bold">${formatPeso(t.amount)}</td>
      <td>
        <span class="badge ${statusBadge[t.status]||'badge-gray'}">${t.status}</span>
        ${t.is_flagged ? ' <span class="badge badge-warning"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
      </td>
      <td style="font-size:.7rem;color:var(--text-muted);white-space:nowrap">${formatDateTime(t.created_at)}</td>
      <td>
        ${t.status === 'flagged' ? `
          <button class="btn btn-success btn-sm" data-id="${t.id}" data-action="approve" style="margin-bottom:2px"><i class="fas fa-check"></i></button>
          <button class="btn btn-danger btn-sm"  data-id="${t.id}" data-action="reject"><i class="fas fa-times"></i></button>
        ` : '—'}
      </td>
    </tr>`).join(''));

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleFlag(btn.dataset.id, btn.dataset.action));
  });

  moreBtn.classList.toggle('hidden', rows.length < PAGE_SIZE);
}

async function handleFlag(id, action) {
  if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this transaction?`)) return;
  const newStatus = action === 'approve' ? 'completed' : 'failed';
  const { error } = await supabase.from('transactions').update({ status: newStatus, is_flagged: false }).eq('id', id);
  if (!error) {
    showToast(action === 'approve' ? 'Transaction Approved' : 'Transaction Rejected', '', action === 'approve' ? 'success' : 'warning');
    if (action === 'approve') {
      await supabase.rpc('admin_approve_flagged', { p_txn_id: id }).catch(() => {});
    }
    loadTransactions(true);
  }
}

init();
