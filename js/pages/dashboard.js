// ============================================================
// AGOS — Dashboard Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatPeso, formatDateTime, txnIcon, txnDirection, escHtml } from '../lib/utils.js';

let currentProfile = null;
let balanceVisible = false;

async function init() {
  currentProfile = await initShell('dashboard');
  if (!currentProfile) return;

  renderGreeting();
  renderBalance();
  loadMonthlyStats();
  loadRecentTransactions();
  checkFraudAlerts();

  // Realtime: refresh balance on new transactions
  supabase.channel('dashboard-txns')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transactions',
      filter: `receiver_id=eq.${currentProfile.id}`
    }, async () => {
      const { data } = await supabase.from('profiles').select('balance').eq('id', currentProfile.id).single();
      if (data) { currentProfile.balance = data.balance; renderBalance(); loadMonthlyStats(); loadRecentTransactions(); }
    })
    .subscribe();
}

function renderGreeting() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('balance-greeting').textContent = greet;
  document.getElementById('balance-name').textContent = currentProfile.full_name;
  document.getElementById('balance-acct').textContent = 'Account: ' + currentProfile.account_number;
}

function renderBalance() {
  const el = document.getElementById('balance-amount');
  el.textContent = balanceVisible ? formatPeso(currentProfile.balance) : '••••••';

  // Also refresh the header balance display
  const headerBal = document.querySelector('.top-header-right div');
  if (headerBal) headerBal.textContent = formatPeso(currentProfile.balance);
}

document.getElementById('balance-toggle')?.addEventListener('click', async () => {
  balanceVisible = !balanceVisible;
  const btn = document.getElementById('balance-toggle');
  btn.innerHTML = balanceVisible ? '<i class="fas fa-eye-slash"></i> Hide' : '<i class="fas fa-eye"></i> Show';
  btn.setAttribute('aria-pressed', balanceVisible);

  if (balanceVisible) {
    // Re-fetch fresh balance
    const { data } = await supabase.from('profiles').select('balance').eq('id', currentProfile.id).single();
    if (data) currentProfile.balance = data.balance;
  }
  renderBalance();
});

async function loadMonthlyStats() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: txns } = await supabase
    .from('transactions')
    .select('type, amount, sender_id, receiver_id')
    .gte('created_at', start)
    .or(`sender_id.eq.${currentProfile.id},receiver_id.eq.${currentProfile.id}`)
    .eq('status', 'completed');

  let received = 0, sent = 0, bills = 0, count = 0;
  (txns || []).forEach(t => {
    count++;
    const dir = txnDirection(t, currentProfile.id);
    if (t.type === 'bill_payment' && t.sender_id === currentProfile.id) { bills += Number(t.amount); }
    else if (dir === 'credit') { received += Number(t.amount); }
    else if (dir === 'debit') { sent += Number(t.amount); }
  });

  document.getElementById('stat-received').textContent = formatPeso(received);
  document.getElementById('stat-sent').textContent = formatPeso(sent);
  document.getElementById('stat-bills').textContent = formatPeso(bills);
  document.getElementById('stat-count').textContent = count;
}

async function loadRecentTransactions() {
  const container = document.getElementById('recent-txns');

  const { data: txns, error } = await supabase
    .from('transactions')
    .select(`
      id, type, amount, description, reference_no, status, is_flagged,
      bill_biller, created_at,
      sender:sender_id(full_name),
      receiver:receiver_id(full_name)
    `)
    .or(`sender_id.eq.${currentProfile.id},receiver_id.eq.${currentProfile.id}`)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error || !txns?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-inbox"></i></div>
        <h3>No transactions yet</h3>
        <p>Your recent transactions will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = txns.map(t => {
    const dir = txnDirection(t, currentProfile.id);
    const iconObj = txnIcon(t.type, t.is_flagged);
    const name = dir === 'credit'
      ? (t.sender?.full_name || t.bill_biller || 'System')
      : (t.receiver?.full_name || t.bill_biller || 'System');
    const sign = dir === 'credit' ? '+' : '-';
    const label = t.type === 'bill_payment' ? `Bill: ${t.bill_biller}`
      : t.type === 'admin_credit' ? 'Admin Credit'
        : t.type === 'admin_debit' ? 'Admin Debit'
          : dir === 'credit' ? `From: ${name}` : `To: ${name}`;

    return `
      <div class="txn-row" tabindex="0" role="button" aria-label="${label}, ${sign}${formatPeso(t.amount)}"
           onclick="window.location.href='history.html'">
        <div class="txn-icon ${iconObj.cls}" aria-hidden="true"><i class="${iconObj.icon}"></i></div>
        <div class="txn-meta">
          <div class="txn-title">${escHtml(label)}</div>
          <div class="txn-sub">${formatDateTime(t.created_at)}
            ${t.is_flagged ? ' · <span style="color:var(--color-warning)"><i class="fas fa-exclamation-triangle"></i> Flagged</span>' : ''}
            ${t.status === 'pending' ? ' · <span style="color:var(--color-info)"><i class="fas fa-hourglass-half"></i> Pending</span>' : ''}
          </div>
        </div>
        <div class="txn-amount ${dir}">${sign}${formatPeso(t.amount)}</div>
      </div>`;
  }).join('');
}

async function checkFraudAlerts() {
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .or(`sender_id.eq.${currentProfile.id},receiver_id.eq.${currentProfile.id}`)
    .eq('is_flagged', true)
    .eq('status', 'flagged');

  if (count > 0) {
    document.getElementById('fraud-banner').classList.remove('hidden');
  }
}

init();