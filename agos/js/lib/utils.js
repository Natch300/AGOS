// ============================================================
// AGOS — Shared utilities
// ============================================================

/** Format number as Philippine Peso */
export function formatPeso(amount) {
  const n = parseFloat(amount) || 0;
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a date string to readable Filipino-style date */
export function formatDate(dateStr, opts = {}) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    ...opts
  });
}

/** Format datetime */
export function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Relative time (e.g. "2 hours ago") */
export function timeAgo(dateStr) {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr, { month: 'short' });
}

/** Get initials from a full name */
export function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

/** Mask account number for display */
export function maskAccount(acct = '') {
  if (acct.length <= 4) return acct;
  return acct.slice(0, 3) + '•••' + acct.slice(-4);
}

/** Transaction type → icon */
export function txnIcon(type, isFlagged = false) {
  if (isFlagged) return { icon: 'fas fa-exclamation-triangle', cls: 'flagged' };
  const map = {
    transfer: { icon: 'fas fa-arrow-up-right', cls: 'debit' },
    receive: { icon: 'fas fa-arrow-down-left', cls: 'credit' },
    bill_payment: { icon: 'fas fa-file-invoice-dollar', cls: 'bill' },
    admin_credit: { icon: 'fas fa-wallet', cls: 'credit' },
    admin_debit: { icon: 'fas fa-money-bill-wave', cls: 'debit' },
  };
  return map[type] || { icon: 'fas fa-credit-card', cls: 'debit' };
}

/** Determine if a transaction is credit or debit for a given user */
export function txnDirection(txn, userId) {
  if (txn.type === 'admin_credit') return 'credit';
  if (txn.type === 'admin_debit') return 'debit';
  if (txn.type === 'bill_payment') return 'debit';
  if (txn.receiver_id === userId) return 'credit';
  return 'debit';
}

/** Simple HTML escaping */
export function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Debounce */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Generate a simple PDF-like receipt as a printable HTML page */
export function generateReceiptHTML(txn, currentProfile) {
  const dir = txnDirection(txn, currentProfile.id);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AGOS Receipt - ${txn.reference_no}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 40px auto; color: #111827; }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e2e5eb; }
    .logo   { font-size: 1.75rem; font-weight: 800; color: #0f3d7a; letter-spacing: .08em; }
    .sub    { color: #8a94a3; font-size: .875rem; }
    .status { display: inline-block; padding: 4px 14px; border-radius: 9999px; font-weight: 700; font-size: .8rem; margin: 12px 0; }
    .status.completed { background: #dcfce7; color: #16a34a; }
    .status.flagged   { background: #fef3c7; color: #d97706; }
    .amount { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; font-size: 2.25rem; font-weight: 700; text-align: center; margin: 16px 0; }
    .amount.credit { color: #16a34a; }
    .amount.debit  { color: #dc2626; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: .9rem; }
    .label { color: #8a94a3; font-weight: 600; }
    .value { font-weight: 600; text-align: right; max-width: 60%; }
    .row .value.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .footer { text-align: center; color: #8a94a3; font-size: .8rem; margin-top: 30px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">AGOS</div>
    <div class="sub">Official Transaction Receipt</div>
    <div class="status ${txn.status}">${txn.status.toUpperCase()}</div>
  </div>
  <div class="amount ${dir}">${dir === 'credit' ? '+' : '-'}${formatPeso(txn.amount)}</div>
  <div class="row"><span class="label">Reference No.</span><span class="value mono">${txn.reference_no}</span></div>
  <div class="row"><span class="label">Type</span><span class="value">${txn.type.replace('_', ' ').toUpperCase()}</span></div>
  <div class="row"><span class="label">Date & Time</span><span class="value">${formatDateTime(txn.created_at)}</span></div>
  ${txn.sender_name ? `<div class="row"><span class="label">From</span><span class="value">${txn.sender_name}</span></div>` : ''}
  ${txn.receiver_name ? `<div class="row"><span class="label">To</span><span class="value">${txn.receiver_name}</span></div>` : ''}
  ${txn.bill_biller ? `<div class="row"><span class="label">Biller</span><span class="value">${txn.bill_biller}</span></div>` : ''}
  ${txn.bill_account ? `<div class="row"><span class="label">Account No.</span><span class="value">${txn.bill_account}</span></div>` : ''}
  ${txn.description ? `<div class="row"><span class="label">Note</span><span class="value">${txn.description}</span></div>` : ''}
  <div class="footer">
    <p>Thank you for using AGOS Banking.</p>
    <p>Keep this receipt for your records.</p>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#1a56a0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;font-family:inherit;">Print Receipt</button>
  </div>
</body>
</html>`;
}