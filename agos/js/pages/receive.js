// ============================================================
// AGOS — Receive Money Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatPeso, formatDateTime, getInitials, escHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

async function init() {
  const profile = await initShell('receive');
  if (!profile) return;

  // Render account card
  document.getElementById('recv-avatar').textContent = getInitials(profile.full_name);
  document.getElementById('recv-name').textContent = profile.full_name;
  document.getElementById('recv-acct').textContent = profile.account_number;

  // Copy button
  document.getElementById('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(profile.account_number);
      showToast('Copied!', 'Account number copied to clipboard.', 'success', 2500);
    } catch {
      showToast('Could not copy', 'Please copy the number manually.', 'warning');
    }
  });

  loadReceivedTransactions(profile.id);

  // Realtime: new incoming money
  supabase.channel('receive-page-' + profile.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transactions',
      filter: `receiver_id=eq.${profile.id}`
    }, () => loadReceivedTransactions(profile.id))
    .subscribe();
}

async function loadReceivedTransactions(userId) {
  const container = document.getElementById('received-txns');
  const { data } = await supabase
    .from('transactions')
    .select(`
      id, type, amount, description, reference_no, status, created_at,
      sender:sender_id(full_name)
    `)
    .eq('receiver_id', userId)
    .in('type', ['transfer', 'admin_credit', 'receive'])
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-inbox" aria-hidden="true"></i></div>
        <h3>No incoming transfers yet</h3>
        <p>Money sent to your account will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(t => `
    <div class="txn-row">
      <div class="txn-icon credit" aria-hidden="true"><i class="fas fa-inbox"></i></div>
      <div class="txn-meta">
        <div class="txn-title">From: ${escHtml(t.sender?.full_name || 'Admin')}</div>
        <div class="txn-sub">${formatDateTime(t.created_at)} · ${t.reference_no}</div>
      </div>
      <div class="txn-amount credit">+${formatPeso(t.amount)}</div>
    </div>`).join('');
}

init();