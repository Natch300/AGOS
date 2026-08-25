// ============================================================
// AGOS — Send Money Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatPeso, getInitials, escHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

let profile = null;
let step = 1;
let recipient = null;  // { id, full_name, account_number }

async function init() {
  profile = await initShell('send');
  if (!profile) return;

  document.getElementById('avail-balance').textContent = formatPeso(profile.balance);
  loadSavedContacts();
  setupRecipientLookup();
  setupPresets();
  setupNav();
}

// ---- Saved contacts chips ----
async function loadSavedContacts() {
  const { data } = await supabase
    .from('saved_contacts')
    .select('id, nickname, account_number, contact_id')
    .eq('owner_id', profile.id)
    .order('nickname');

  const wrap = document.getElementById('contact-chips');
  if (!data?.length) {
    wrap.innerHTML = `<p style="font-size:var(--font-size-xs);color:var(--text-muted)">No saved contacts yet. <a href="contacts.html">Add one →</a></p>`;
    return;
  }
  wrap.innerHTML = data.map(c => `
    <button class="contact-chip" data-acct="${c.account_number}" aria-label="Select ${c.nickname}">
      <div class="contact-chip-avatar">${getInitials(c.nickname)}</div>
      <span>${escHtml(c.nickname)}</span>
    </button>`).join('');

  wrap.querySelectorAll('.contact-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.contact-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const acct = chip.dataset.acct;
      document.getElementById('recv-acct').value = acct.toUpperCase();
      lookupRecipient(acct);
    });
  });
}

// ---- Recipient lookup ----
function setupRecipientLookup() {
  const input = document.getElementById('recv-acct');
  input.addEventListener('input', () => {
    const val = input.value.trim().toUpperCase();
    input.value = val;
    if (val.length >= 6) lookupRecipient(val);
    else {
      recipient = null;
      document.getElementById('recv-preview').classList.add('hidden');
    }
  });
}

async function lookupRecipient(acct) {
  const { data } = await supabase
    .rpc('lookup_profile_by_account', { p_account_number: acct });
  const result = data && data.length > 0 ? data[0] : null;

  const preview = document.getElementById('recv-preview');
  if (result && result.id !== profile.id) {
    recipient = result;
    document.getElementById('prev-avatar').textContent = getInitials(result.full_name);
    document.getElementById('prev-name').textContent = result.full_name;
    document.getElementById('prev-acct-disp').textContent = result.account_number;
    preview.classList.remove('hidden');
  } else {
    recipient = null;
    preview.classList.add('hidden');
  }
}

// ---- Preset amounts ----
function setupPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('send-amount').value = btn.dataset.amount;
    });
  });
}

// ---- Step navigation ----
function setupNav() {
  document.getElementById('btn-step1-next').addEventListener('click', async () => {
    const acct = document.getElementById('recv-acct').value.trim().toUpperCase();
    if (!acct) { showErr('step1-error', 'Please enter an account number.'); return; }
    if (!recipient) {
      await lookupRecipient(acct);
      if (!recipient) { showErr('step1-error', 'Account not found. Please check and try again.'); return; }
    }
    clearErr('step1-error');
    goStep(2);

    // Populate step 2 recipient preview
    document.getElementById('step2-avatar').textContent = getInitials(recipient.full_name);
    document.getElementById('step2-name').textContent = recipient.full_name;
    document.getElementById('step2-acct').textContent = recipient.account_number;

    // Refresh balance
    const { data } = await supabase.from('profiles').select('balance').eq('id', profile.id).single();
    if (data) { profile.balance = data.balance; document.getElementById('avail-balance').textContent = formatPeso(data.balance); }
  });

  document.getElementById('btn-step2-back').addEventListener('click', () => goStep(1));
  document.getElementById('btn-step2-next').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('send-amount').value);
    if (!amount || amount <= 0) { showErr('step2-error', 'Please enter a valid amount.'); return; }
    if (amount > profile.balance) { showErr('step2-error', `Insufficient balance. You have ${formatPeso(profile.balance)}.`); return; }
    if (amount < 1) { showErr('step2-error', 'Minimum transfer is ₱1.00.'); return; }
    clearErr('step2-error');
    goStep(3);
    renderConfirm(amount);
  });

  document.getElementById('btn-step3-back').addEventListener('click', () => goStep(2));
  document.getElementById('btn-step3-confirm').addEventListener('click', () => doTransfer());
}

function renderConfirm(amount) {
  const note = document.getElementById('send-note').value.trim();
  document.getElementById('confirm-box').innerHTML = `
    <div class="confirm-amount">-${formatPeso(amount)}</div>
    <div class="confirm-row"><span class="confirm-lbl">To</span><span class="confirm-val">${escHtml(recipient.full_name)}</span></div>
    <div class="confirm-row"><span class="confirm-lbl">Account</span><span class="confirm-val">${recipient.account_number}</span></div>
    <div class="confirm-row"><span class="confirm-lbl">Amount</span><span class="confirm-val">${formatPeso(amount)}</span></div>
    ${note ? `<div class="confirm-row"><span class="confirm-lbl">Note</span><span class="confirm-val">${escHtml(note)}</span></div>` : ''}
    <div class="confirm-row"><span class="confirm-lbl">Your Balance After</span><span class="confirm-val">${formatPeso(profile.balance - amount)}</span></div>
  `;
}

async function doTransfer() {
  const amount = parseFloat(document.getElementById('send-amount').value);
  const note = document.getElementById('send-note').value.trim();

  document.getElementById('loading-overlay').classList.remove('hidden');
  document.getElementById('btn-step3-confirm').disabled = true;

  const { data, error } = await supabase.rpc('transfer_money', {
    p_sender_id: profile.id,
    p_receiver_acct: recipient.account_number,
    p_amount: amount,
    p_description: note || null
  });

  document.getElementById('loading-overlay').classList.add('hidden');

  if (error || !data) {
    showErr('step3-error', error?.message || 'Transfer failed. Please try again.');
    document.getElementById('btn-step3-confirm').disabled = false;
    return;
  }

  if (!data.success && !data.flagged) {
    showErr('step3-error', data.error || 'Transfer failed.');
    document.getElementById('btn-step3-confirm').disabled = false;
    return;
  }

  goStep(4);
  const flagged = data.flagged;
  document.getElementById('success-screen').innerHTML = `
    <div class="success-icon"><i class="${flagged ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'}"></i></div>
    <h2>${flagged ? 'Transfer Under Review' : 'Transfer Sent!'}</h2>
    <p>${flagged
      ? `Your transfer of ${formatPeso(amount)} to ${escHtml(recipient.full_name)} is under review for security reasons.`
      : `You successfully sent ${formatPeso(amount)} to ${escHtml(recipient.full_name)}.`}</p>
    <div class="ref">Ref: ${data.reference_no}</div>
    <div style="display:flex;gap:var(--space-3);justify-content:center;margin-top:var(--space-6);flex-wrap:wrap">
      <a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>
      <a href="history.html" class="btn btn-ghost">View Transactions</a>
    </div>`;
}

function goStep(n) {
  step = n;
  [1, 2, 3, 4].forEach(i => {
    document.getElementById(`step-${i}`).classList.toggle('hidden', i !== n);
    const s = document.querySelector(`.step[data-step="${i}"]`);
    if (s) {
      s.classList.toggle('active', i === n);
      s.classList.toggle('done', i < n);
    }
  });
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearErr(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.add('hidden');
}

init();