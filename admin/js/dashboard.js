// ============================================================
// AGOS Admin — Dashboard
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { formatPeso, formatDateTime, timeAgo, escHtml } from '../../js/lib/utils.js';

async function init() {
  const profile = await initAdminShell('dashboard');
  if (!profile) return;

  loadKPIs();
  loadRecentTransactions();
  loadOpenTickets();
  loadFlaggedTransactions();
}

async function loadKPIs() {
  const today = new Date(); today.setHours(0,0,0,0);
  const [
    { data: fund },
    { count: userCount },
    { data: txnsToday },
    { count: flaggedCount }
  ] = await Promise.all([
    supabase.from('system_fund').select('total_funds').order('id').limit(1).single(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', false).eq('is_active', true),
    supabase.from('transactions').select('amount').gte('created_at', today.toISOString()).eq('status','completed'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).in('status', ['flagged','pending']),
  ]);

  document.getElementById('kpi-funds').textContent       = formatPeso(fund?.total_funds || 0);
  document.getElementById('kpi-users').textContent       = userCount || 0;
  document.getElementById('kpi-flagged').textContent     = flaggedCount || 0;

  const todayCount = txnsToday?.length || 0;
  const todayVol   = (txnsToday || []).reduce((s,t) => s + Number(t.amount), 0);
  document.getElementById('kpi-txns-today').textContent    = todayCount;
  document.getElementById('kpi-txns-today-vol').textContent = 'Volume: ' + formatPeso(todayVol);
}

async function loadRecentTransactions() {
  const { data } = await supabase
    .from('admin_transactions_view')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6);

  const el = document.getElementById('recent-txns');
  if (!data?.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:var(--font-size-sm);padding:var(--space-4)">No transactions yet.</p>'; return; }

  const typeIcon = { transfer:'fas fa-arrow-up-right', bill_payment:'fas fa-file-invoice-dollar', admin_credit:'fas fa-wallet', admin_debit:'fas fa-money-bill-wave', receive:'fas fa-arrow-down-left' };
  el.innerHTML = data.map(t => `
    <div class="mini-txn">
      <div class="mini-txn-icon" style="background:${t.is_flagged?'var(--color-warning-bg)':t.type==='admin_credit'?'var(--color-success-bg)':'var(--color-info-bg)'}"><i class="${t.is_flagged?'fas fa-exclamation-triangle':(typeIcon[t.type]||'fas fa-credit-card')}"></i></div>
      <div class="mini-txn-meta">
        <div class="mini-txn-title">${escHtml(t.sender_name||'—')} → ${escHtml(t.receiver_name||'—')}</div>
        <div class="mini-txn-sub">${t.type.replace(/_/g,' ')} · ${timeAgo(t.created_at)}</div>
      </div>
      <div class="mini-txn-amt" style="color:${t.is_flagged?'var(--color-warning)':'var(--text-primary)'}">${formatPeso(t.amount)}</div>
    </div>`).join('');
}

async function loadOpenTickets() {
  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, priority, created_at, user_id, profiles!user_id(full_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(6);

  const el = document.getElementById('open-tickets');
  if (!data?.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:var(--font-size-sm);padding:var(--space-4)"><i class="fas fa-circle-check" aria-hidden="true"></i> No open tickets.</p>'; return; }

  const prioColor = { low:'var(--color-info)', normal:'var(--color-primary)', high:'var(--color-warning)', urgent:'var(--color-danger)' };
  el.innerHTML = data.map(t => `
    <div class="ticket-mini">
      <div class="ticket-mini-subject">${escHtml(t.subject)}</div>
      <div class="ticket-mini-meta">
        <span style="color:${prioColor[t.priority]};font-weight:700">${t.priority}</span>
        · ${escHtml(t.profiles?.full_name||'Unknown')}
        · ${timeAgo(t.created_at)}
      </div>
    </div>`).join('');
}

async function loadFlaggedTransactions() {
  const { data } = await supabase
    .from('admin_transactions_view')
    .select('*')
    .eq('is_flagged', true)
    .order('created_at', { ascending: false })
    .limit(8);

  const el = document.getElementById('flagged-txns');
  if (!data?.length) { el.innerHTML = '<div class="empty-state" style="padding:var(--space-8)"><div class="empty-state-icon"><i class="fas fa-circle-check" aria-hidden="true"></i></div><h3>No flagged transactions</h3><p>All clear!</p></div>'; return; }

  el.innerHTML = `<div class="table-wrapper"><table class="data-table">
    <thead><tr>
      <th>Reference</th><th>From</th><th>To</th><th>Amount</th><th>Flag Reason</th><th>Date</th><th>Action</th>
    </tr></thead>
    <tbody>
    ${data.map(t => `
      <tr>
        <td style="font-family:monospace;font-size:.7rem">${t.reference_no}</td>
        <td>${escHtml(t.sender_name||'—')}</td>
        <td>${escHtml(t.receiver_name||'—')}</td>
        <td class="font-bold text-warning">${formatPeso(t.amount)}</td>
        <td><span class="badge badge-warning">${escHtml(t.flag_reason||'Flagged')}</span></td>
        <td style="font-size:.75rem;color:var(--text-muted)">${formatDateTime(t.created_at)}</td>
        <td>
          <button class="btn btn-success btn-sm" data-id="${t.id}" data-action="approve">✓ Approve</button>
          <button class="btn btn-danger btn-sm" data-id="${t.id}" data-action="reject" style="margin-left:4px">✕ Reject</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleFlaggedAction(btn.dataset.id, btn.dataset.action));
  });
}

async function handleFlaggedAction(txnId, action) {
  if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this flagged transaction?`)) return;

  const newStatus = action === 'approve' ? 'completed' : 'failed';
  const { error } = await supabase
    .from('transactions')
    .update({ status: newStatus, is_flagged: false })
    .eq('id', txnId);

  if (!error) {
    // If approved, actually move the money
    if (action === 'approve') {
      const { data: txn } = await supabase.from('transactions').select('sender_id,receiver_id,amount').eq('id', txnId).single();
      if (txn?.sender_id && txn?.receiver_id) {
        await supabase.from('profiles').update({ balance: supabase.rpc('_raw') }).eq('id', txn.sender_id);
        // Use raw SQL update via RPC-like approach — deduct sender, credit receiver
        await supabase.rpc('admin_approve_flagged', { p_txn_id: txnId });
      }
    }
    loadFlaggedTransactions();
    loadKPIs();
  }
}

init();
