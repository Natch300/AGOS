// ============================================================
// AGOS — Pay Bills Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { formatPeso, escHtml } from '../lib/utils.js';

let profile = null;
let allBillers = [];
let selectedBiller = null;
let activeCategory = 'all';

const categoryIcons = {
  electricity: 'fas fa-bolt', water: 'fas fa-droplet', internet: 'fas fa-wifi', telecom: 'fas fa-mobile-screen-button',
  cable: 'fas fa-tv', government: 'fas fa-landmark', utilities: 'fas fa-wrench', all: 'fas fa-grip'
};
const CATEGORY_FALLBACK_ICON = 'fas fa-building';

async function init() {
  profile = await initShell('bills');
  if (!profile) return;

  document.getElementById('bill-avail-bal').textContent = formatPeso(profile.balance);
  loadBillers();
  setupSearch();
  setupNavButtons();
}

async function loadBillers() {
  const { data } = await supabase.from('billers').select('*').eq('is_active', true).order('name');
  allBillers = data || [];

  // Build category buttons
  const cats = ['all', ...new Set(allBillers.map(b => b.category))];
  document.getElementById('biller-categories').innerHTML = cats.map(c => `
    <button class="cat-btn ${c === 'all' ? 'active' : ''}" data-cat="${c}" aria-pressed="${c === 'all'}">
      <i class="${categoryIcons[c] || CATEGORY_FALLBACK_ICON}" aria-hidden="true"></i> ${c === 'all' ? 'All' : capitalize(c)}
    </button>`).join('');

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      activeCategory = btn.dataset.cat;
      renderBillers(document.getElementById('biller-search').value.trim());
    });
  });

  renderBillers('');
}

function renderBillers(search) {
  const filtered = allBillers.filter(b => {
    const matchCat = activeCategory === 'all' || b.category === activeCategory;
    const matchName = !search || b.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchName;
  });

  const grid = document.getElementById('biller-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-search"></i></div><h3>No billers found</h3></div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => `
    <button class="biller-card" data-id="${b.id}" tabindex="0" aria-label="${b.name}">
      <div class="biller-icon"><i class="${categoryIcons[b.category] || CATEGORY_FALLBACK_ICON}" aria-hidden="true"></i></div>
      <div class="biller-name">${escHtml(b.name)}</div>
      <div class="biller-cat">${b.category}</div>
    </button>`).join('');

  grid.querySelectorAll('.biller-card').forEach(card => {
    card.addEventListener('click', () => {
      const biller = allBillers.find(b => b.id === card.dataset.id);
      if (biller) selectBiller(biller);
    });
  });
}

function setupSearch() {
  document.getElementById('biller-search').addEventListener('input', e => {
    renderBillers(e.target.value.trim());
  });
}

function selectBiller(biller) {
  selectedBiller = biller;
  document.getElementById('step-1').classList.add('hidden');
  document.getElementById('step-2').classList.remove('hidden');

  document.getElementById('selected-biller-header').innerHTML = `
    <div class="sel-bil-icon"><i class="${categoryIcons[biller.category] || CATEGORY_FALLBACK_ICON}" aria-hidden="true"></i></div>
    <div>
      <div class="sel-bil-name">${escHtml(biller.name)}</div>
      <div class="sel-bil-cat">${biller.category}</div>
    </div>`;

  // Refresh balance
  supabase.from('profiles').select('balance').eq('id', profile.id).single().then(({ data }) => {
    if (data) { profile.balance = data.balance; document.getElementById('bill-avail-bal').textContent = formatPeso(data.balance); }
  });
}

function setupNavButtons() {
  document.getElementById('btn-back-step1').addEventListener('click', () => {
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-1').classList.remove('hidden');
    clearErr('bill-error');
  });

  document.getElementById('btn-pay-review').addEventListener('click', () => {
    const acct = document.getElementById('bill-acct').value.trim();
    const amount = parseFloat(document.getElementById('bill-amount').value);
    if (!acct) { showErr('bill-error', 'Please enter your account number with this biller.'); return; }
    if (!amount || amount <= 0) { showErr('bill-error', 'Please enter a valid amount.'); return; }
    if (amount > profile.balance) { showErr('bill-error', `Insufficient balance. You have ${formatPeso(profile.balance)}.`); return; }
    clearErr('bill-error');

    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-3').classList.remove('hidden');

    const note = document.getElementById('bill-note').value.trim();
    document.getElementById('bill-confirm-box').innerHTML = `
      <div class="confirm-amount">-${formatPeso(amount)}</div>
      <div class="confirm-row"><span class="confirm-lbl">Biller</span><span class="confirm-val">${escHtml(selectedBiller.name)}</span></div>
      <div class="confirm-row"><span class="confirm-lbl">Account No.</span><span class="confirm-val">${escHtml(acct)}</span></div>
      <div class="confirm-row"><span class="confirm-lbl">Amount</span><span class="confirm-val">${formatPeso(amount)}</span></div>
      ${note ? `<div class="confirm-row"><span class="confirm-lbl">Note</span><span class="confirm-val">${escHtml(note)}</span></div>` : ''}
      <div class="confirm-row"><span class="confirm-lbl">Balance After</span><span class="confirm-val">${formatPeso(profile.balance - amount)}</span></div>`;
  });

  document.getElementById('btn-back-step2').addEventListener('click', () => {
    document.getElementById('step-3').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
    clearErr('confirm-error');
  });

  document.getElementById('btn-pay-confirm').addEventListener('click', async () => {
    const acct = document.getElementById('bill-acct').value.trim();
    const amount = parseFloat(document.getElementById('bill-amount').value);
    const note = document.getElementById('bill-note').value.trim();

    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('btn-pay-confirm').disabled = true;

    const { data, error } = await supabase.rpc('pay_bill', {
      p_user_id: profile.id,
      p_biller_name: selectedBiller.name,
      p_bill_account: acct,
      p_amount: amount,
      p_description: note || null
    });

    document.getElementById('loading-overlay').classList.add('hidden');

    if (error || !data?.success) {
      showErr('confirm-error', error?.message || data?.error || 'Payment failed. Please try again.');
      document.getElementById('btn-pay-confirm').disabled = false;
      return;
    }

    document.getElementById('step-3').classList.add('hidden');
    document.getElementById('step-4').classList.remove('hidden');
    document.getElementById('bill-success').innerHTML = `
      <div style="font-size:5rem;margin-bottom:var(--space-4);color:var(--color-success)"><i class="fas fa-circle-check" aria-hidden="true"></i></div>
      <h2>Payment Successful!</h2>
      <p style="color:var(--text-muted);margin-top:var(--space-2)">You paid ${formatPeso(amount)} to ${escHtml(selectedBiller.name)}</p>
      <p style="color:var(--text-muted)">Account: ${escHtml(acct)}</p>
      <div style="font-size:var(--font-size-xs);background:var(--color-gray-100);padding:var(--space-2) var(--space-4);border-radius:var(--border-radius);font-family:var(--font-family-mono);margin:var(--space-4) auto;display:inline-block">Ref: ${data.reference_no}</div>
      <div style="display:flex;gap:var(--space-3);justify-content:center;margin-top:var(--space-5);flex-wrap:wrap">
        <a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>
        <button class="btn btn-ghost" onclick="window.location.reload()">Pay Another Bill</button>
      </div>`;
  });
}

function showErr(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.classList.remove('hidden'); }
function clearErr(id) { const e = document.getElementById(id); e.textContent = ''; e.classList.add('hidden'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

init();