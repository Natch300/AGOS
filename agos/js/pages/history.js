// ============================================================
// AGOS — Transaction History Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatPeso, formatDateTime, txnIcon, txnDirection, escHtml, generateReceiptHTML } from '../lib/utils.js';

let profile = null;
let page = 0;
const PAGE_SIZE = 20;
let currentFilters = {};
let currentTxn = null;

async function init() {
  profile = await initShell('history');
  if (!profile) return;

  // Default date range: last 3 months
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  document.getElementById('filter-from').value = start.toISOString().slice(0, 10);
  document.getElementById('filter-to').value = now.toISOString().slice(0, 10);

  loadTransactions(true);
  setupFilters();
  setupModal();
}

function buildQuery(reset) {
  if (reset) page = 0;
  const type = document.getElementById('filter-type').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const search = document.getElementById('filter-search').value.trim();
  const sortDir = document.getElementById('sort-order').value === 'asc';

  currentFilters = { type, from, to, search, sortDir };
  return currentFilters;
}

async function loadTransactions(reset = false) {
  const loading = document.getElementById('loading-overlay');
  loading.classList.remove('hidden');
  buildQuery(reset);
  const { type, from, to, search, sortDir } = currentFilters;

  let q = supabase
    .from('transactions')
    .select(`
      id, type, amount, description, reference_no, status, is_flagged,
      bill_biller, bill_account, created_at, fee,
      sender:sender_id(id, full_name, account_number),
      receiver:receiver_id(id, full_name, account_number)
    `)
    .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
    .order('created_at', { ascending: sortDir })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (type) {
    if (type === 'receive') {
      q = q.eq('receiver_id', profile.id).eq('type', 'transfer');
    } else {
      q = q.eq('type', type);
    }
  }
  if (from) q = q.gte('created_at', from + 'T00:00:00');
  if (to) q = q.lte('created_at', to + 'T23:59:59');

  const { data: txns, error } = await q;
  loading.classList.add('hidden');

  if (error) { console.error(error); return; }

  // Client-side search filter
  let filtered = txns || [];
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(t =>
      t.reference_no?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      t.bill_biller?.toLowerCase().includes(s) ||
      t.sender?.full_name?.toLowerCase().includes(s) ||
      t.receiver?.full_name?.toLowerCase().includes(s) ||
      String(t.amount).includes(s)
    );
  }

  const listEl = document.getElementById('txn-list');
  const countEl = document.getElementById('txn-count');
  const moreWrap = document.getElementById('load-more-wrap');

  if (reset) listEl.innerHTML = '';

  if (!filtered.length && page === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-list"></i></div>
        <h3>No transactions found</h3>
        <p>Try adjusting your filters.</p>
      </div>`;
    moreWrap.classList.add('hidden');
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `(${(page * PAGE_SIZE) + filtered.length}+ shown)`;

  listEl.insertAdjacentHTML('beforeend', filtered.map(t => {
    const dir = txnDirection(t, profile.id);
    const iconObj = txnIcon(t.type, t.is_flagged);
    const name = dir === 'credit'
      ? (t.sender?.full_name || t.bill_biller || 'System')
      : (t.receiver?.full_name || t.bill_biller || 'System');
    const label = t.type === 'bill_payment' ? `Bill: ${t.bill_biller}`
      : t.type === 'admin_credit' ? 'Admin Credit'
        : t.type === 'admin_debit' ? 'Admin Debit'
          : dir === 'credit' ? `From: ${name}` : `To: ${name}`;
    const sign = dir === 'credit' ? '+' : '-';

    return `
      <div class="txn-row" tabindex="0" role="button" aria-label="${label}, ${sign}${formatPeso(t.amount)}"
           data-id="${t.id}">
        <div class="txn-icon ${iconObj.cls}" aria-hidden="true"><i class="${iconObj.icon}"></i></div>
        <div class="txn-meta">
          <div class="txn-title">${escHtml(label)}</div>
          <div class="txn-sub">
            ${formatDateTime(t.created_at)}
            · <span style="font-family:var(--font-family-mono);font-size:.7rem">${t.reference_no}</span>
            ${t.is_flagged ? ' · <span style="color:var(--color-warning)"><i class="fas fa-exclamation-triangle"></i> Flagged</span>' : ''}
            ${t.status === 'pending' ? ' · <span style="color:var(--color-info)"><i class="fas fa-hourglass-half"></i> Pending</span>' : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div class="txn-amount ${dir}">${sign}${formatPeso(t.amount)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${t.status}</div>
        </div>
      </div>`;
  }).join(''));

  // Click to view receipt
  listEl.querySelectorAll('.txn-row[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const txn = filtered.find(t => t.id === row.dataset.id);
      if (txn) openReceiptModal(txn);
    });
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') row.click(); });
  });

  // Show "Load More" if full page returned
  if (filtered.length === PAGE_SIZE) {
    moreWrap.classList.remove('hidden');
  } else {
    moreWrap.classList.add('hidden');
  }
}

function setupFilters() {
  document.getElementById('btn-filter').addEventListener('click', () => loadTransactions(true));
  document.getElementById('sort-order').addEventListener('change', () => loadTransactions(true));
  document.getElementById('btn-reset').addEventListener('click', () => {
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-search').value = '';
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    document.getElementById('filter-from').value = start.toISOString().slice(0, 10);
    document.getElementById('filter-to').value = now.toISOString().slice(0, 10);
    loadTransactions(true);
  });
  document.getElementById('btn-load-more').addEventListener('click', () => {
    page++;
    loadTransactions(false);
  });
}

function setupModal() {
  document.getElementById('receipt-close').addEventListener('click', closeModal);
  document.getElementById('receipt-close2').addEventListener('click', closeModal);
  document.getElementById('receipt-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('receipt-modal')) closeModal();
  });
  document.getElementById('btn-download-receipt').addEventListener('click', downloadReceipt);
}

function openReceiptModal(txn) {
  currentTxn = txn;
  const dir = txnDirection(txn, profile.id);
  const sign = dir === 'credit' ? '+' : '-';
  const other = dir === 'credit'
    ? (txn.sender?.full_name || 'System')
    : (txn.receiver?.full_name || txn.bill_biller || 'System');

  document.getElementById('receipt-body').innerHTML = `
    <div style="text-align:center;padding:var(--space-4) 0 var(--space-6)">
      <div style="font-size:3rem;margin-bottom:var(--space-3)"><i class="${txnIcon(txn.type, txn.is_flagged).icon}"></i></div>
      <div style="font-size:var(--font-size-3xl);font-weight:700;font-family:var(--font-family-mono);font-variant-numeric:tabular-nums;color:${dir === 'credit' ? 'var(--color-success)' : 'var(--color-danger)'}">${sign}${formatPeso(txn.amount)}</div>
      <span class="badge ${txn.status === 'completed' ? 'badge-success' : txn.status === 'flagged' ? 'badge-warning' : 'badge-gray'}" style="margin-top:var(--space-2)">${txn.status}</span>
    </div>
    <table style="width:100%;font-size:var(--font-size-sm)">
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Reference</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-family:var(--font-family-mono);font-weight:700">${txn.reference_no}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Type</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:700">${txn.type.replace(/_/g, ' ').toUpperCase()}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Date & Time</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:600">${formatDateTime(txn.created_at)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">${dir === 'credit' ? 'From' : 'To'}</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:700">${escHtml(other)}</td>
      </tr>
      ${txn.bill_biller ? `
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Biller</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:700">${escHtml(txn.bill_biller)}</td>
      </tr>` : ''}
      ${txn.bill_account ? `
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Biller Account</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:700">${escHtml(txn.bill_account)}</td>
      </tr>` : ''}
      ${txn.description ? `
      <tr>
        <td style="padding:var(--space-3) 0;color:var(--text-muted);font-weight:600">Note</td>
        <td style="padding:var(--space-3) 0;text-align:right;font-weight:600">${escHtml(txn.description)}</td>
      </tr>` : ''}
    </table>
    ${txn.is_flagged ? `<div class="alert alert-warning" style="margin-top:var(--space-4)"><i class="fas fa-exclamation-triangle"></i> This transaction has been flagged for security review. Contact support if you need assistance.</div>` : ''}
  `;

  document.getElementById('receipt-modal').classList.remove('hidden');
  document.getElementById('receipt-close').focus();
}

function closeModal() {
  document.getElementById('receipt-modal').classList.add('hidden');
  currentTxn = null;
}

function downloadReceipt() {
  if (!currentTxn) return;
  // Enrich txn with name fields for receipt
  const txnData = {
    ...currentTxn,
    sender_name: currentTxn.sender?.full_name,
    receiver_name: currentTxn.receiver?.full_name,
  };
  const html = generateReceiptHTML(txnData, profile);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AGOS_Receipt_${currentTxn.reference_no}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

init();