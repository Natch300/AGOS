// ============================================================
// AGOS — Accessibility & Settings Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { savePrefs, loadPrefs, signOut } from '../lib/auth.js';
import { getInitials, escHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

let profile = null;
let prefs = {};

// Filipino translations (basic UI strings)
const translations = {
  en: {
    dashboard: 'Dashboard', send: 'Send Money', receive: 'Receive Money',
    bills: 'Pay Bills', history: 'Transactions', contacts: 'Saved Contacts',
    notifications: 'Notifications', support: 'Help & Support', settings: 'Accessibility Settings',
  },
  fil: {
    dashboard: 'Dashboard', send: 'Magpadala', receive: 'Tumanggap', bills: 'Bayad Singil',
    history: 'Kasaysayan', contacts: 'Mga Kontak', notifications: 'Mga Abiso',
    support: 'Tulong', settings: 'Mga Setting',
  }
};

async function init() {
  profile = await initShell('settings');
  if (!profile) return;

  prefs = loadPrefs();
  applyStoredPrefs();
  populateProfileForm();
  loadTrustedContacts();
  setupTheme();
  setupTextSize();
  setupLanguage();
  setupProfileSave();
  setupPinChange();
  setupTrustedModal();
  setupLogout();
}

function applyStoredPrefs() {
  // Theme
  const theme = prefs.theme || 'standard';
  document.querySelectorAll('.theme-btn').forEach(b => {
    const isActive = b.dataset.theme === theme;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive);
  });
  document.documentElement.setAttribute('data-theme', theme === 'high-contrast' ? 'high-contrast' : '');

  // Text scale
  const scale = prefs.textScale || 1;
  document.documentElement.style.setProperty('--text-scale', scale);
  document.getElementById('text-size-display').textContent = Math.round(scale * 100) + '%';

  // Language
  const lang = prefs.lang || 'en';
  document.querySelectorAll('.lang-btn').forEach(b => {
    const isActive = b.dataset.lang === lang;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive);
  });
}

function populateProfileForm() {
  document.getElementById('profile-name').value = profile.full_name || '';
  document.getElementById('profile-phone').value = profile.phone || '';
}

// ---- Theme ----
function setupTheme() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      prefs.theme = theme;
      savePrefs(prefs);
      document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
        b.setAttribute('aria-pressed', b.dataset.theme === theme);
      });
      document.documentElement.setAttribute('data-theme', theme === 'high-contrast' ? 'high-contrast' : '');
      showToast('Theme updated', `Switched to ${theme === 'high-contrast' ? 'High Contrast' : 'Standard'} mode.`, 'success', 2000);
    });
  });
}

// ---- Text size ----
function setupTextSize() {
  const MIN = 0.85, MAX = 1.5, STEP = 0.1;

  function updateScale(scale) {
    scale = Math.max(MIN, Math.min(MAX, Math.round(scale * 10) / 10));
    prefs.textScale = scale;
    savePrefs(prefs);
    document.documentElement.style.setProperty('--text-scale', scale);
    document.getElementById('text-size-display').textContent = Math.round(scale * 100) + '%';
  }

  document.getElementById('text-increase').addEventListener('click', () => updateScale((prefs.textScale || 1) + STEP));
  document.getElementById('text-decrease').addEventListener('click', () => updateScale((prefs.textScale || 1) - STEP));
  document.getElementById('text-reset').addEventListener('click', () => updateScale(1));
}

// ---- Language ----
function setupLanguage() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      prefs.lang = lang;
      savePrefs(prefs);
      document.documentElement.lang = lang;
      document.querySelectorAll('.lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
        b.setAttribute('aria-pressed', b.dataset.lang === lang);
      });
      showToast('Language updated', lang === 'fil' ? 'Lumipat sa Filipino.' : 'Switched to English.', 'success', 2000);
    });
  });
}

// ---- Profile ----
function setupProfileSave() {
  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const errEl = document.getElementById('profile-error');
    const sucEl = document.getElementById('profile-success');
    errEl.classList.add('hidden');
    sucEl.classList.add('hidden');

    if (!name) { errEl.textContent = 'Name cannot be empty.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;

    const { error } = await supabase.from('profiles').update({
      full_name: name,
      phone: phone || null,
    }).eq('id', profile.id);

    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    profile.full_name = name;
    profile.phone = phone;
    sucEl.textContent = 'Profile updated successfully.';
    sucEl.classList.remove('hidden');
    setTimeout(() => sucEl.classList.add('hidden'), 3000);
  });
}

// ---- PIN Change ----
function setupPinChange() {
  document.getElementById('btn-change-pin').addEventListener('click', async () => {
    const newPin = document.getElementById('new-pin').value.trim();
    const confPin = document.getElementById('confirm-pin').value.trim();
    const errEl = document.getElementById('pin-error');
    const sucEl = document.getElementById('pin-success');
    errEl.classList.add('hidden');
    sucEl.classList.add('hidden');

    if (!/^\d{6}$/.test(newPin)) { errEl.textContent = 'PIN must be exactly 6 digits.'; errEl.classList.remove('hidden'); return; }
    if (newPin !== confPin) { errEl.textContent = 'PINs do not match.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('btn-change-pin');
    btn.disabled = true;

    // Update auth password to new PIN password
    const { error } = await supabase.auth.updateUser({ password: 'AGOS_PIN_' + newPin });

    // Update pin_hash marker in profile
    if (!error) {
      await supabase.from('profiles').update({ pin_hash: 'set' }).eq('id', profile.id);
    }

    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    document.getElementById('new-pin').value = '';
    document.getElementById('confirm-pin').value = '';
    sucEl.textContent = 'PIN updated successfully.';
    sucEl.classList.remove('hidden');
    setTimeout(() => sucEl.classList.add('hidden'), 3000);
  });
}

// ---- Trusted contacts ----
async function loadTrustedContacts() {
  const { data } = await supabase
    .from('trusted_contacts')
    .select(`
      id, label, is_active,
      trusted_user:trusted_user_id(full_name, account_number)
    `)
    .eq('owner_id', profile.id);

  const list = document.getElementById('trusted-list');
  if (!data?.length) {
    list.innerHTML = `<p style="font-size:var(--font-size-sm);color:var(--text-muted);padding:var(--space-2) 0">No trusted family members added yet.</p>`;
    return;
  }

  list.innerHTML = data.map(tc => `
    <div class="trusted-item">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0">
        ${getInitials(tc.trusted_user?.full_name || tc.label)}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:var(--font-size-sm)">${escHtml(tc.trusted_user?.full_name || tc.label)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${tc.label} · ${tc.trusted_user?.account_number || ''}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-id="${tc.id}" aria-label="Remove ${escHtml(tc.label)}">Remove</button>
    </div>`).join('');

  list.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('trusted_contacts').delete().eq('id', btn.dataset.id);
      showToast('Removed', 'Trusted contact removed.', 'success', 2000);
      loadTrustedContacts();
    });
  });
}

function setupTrustedModal() {
  document.getElementById('btn-add-trusted').addEventListener('click', () => document.getElementById('trusted-modal').classList.remove('hidden'));
  document.getElementById('trusted-modal-close').addEventListener('click', () => document.getElementById('trusted-modal').classList.add('hidden'));
  document.getElementById('trusted-cancel').addEventListener('click', () => document.getElementById('trusted-modal').classList.add('hidden'));
  document.getElementById('trusted-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('trusted-modal')) document.getElementById('trusted-modal').classList.add('hidden');
  });

  document.getElementById('trusted-acct').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });

  document.getElementById('trusted-save').addEventListener('click', async () => {
    const acct = document.getElementById('trusted-acct').value.trim().toUpperCase();
    const label = document.getElementById('trusted-label').value.trim() || 'Family Member';
    const errEl = document.getElementById('trusted-error');
    errEl.classList.add('hidden');

    if (!acct) { errEl.textContent = 'Please enter an account number.'; errEl.classList.remove('hidden'); return; }

    const { data } = await supabase.rpc('lookup_profile_by_account', { p_account_number: acct });
    const user = data && data.length > 0 ? data[0] : null;
    if (!user) { errEl.textContent = 'Account not found.'; errEl.classList.remove('hidden'); return; }
    if (user.id === profile.id) { errEl.textContent = 'You cannot add yourself.'; errEl.classList.remove('hidden'); return; }

    const { error } = await supabase.from('trusted_contacts').insert({
      owner_id: profile.id,
      trusted_user_id: user.id,
      label,
    });

    if (error) { errEl.textContent = error.code === '23505' ? 'This person is already in your trusted contacts.' : error.message; errEl.classList.remove('hidden'); return; }

    showToast('Added', label + ' added as trusted contact.', 'success');
    document.getElementById('trusted-modal').classList.add('hidden');
    document.getElementById('trusted-acct').value = '';
    document.getElementById('trusted-label').value = '';
    loadTrustedContacts();
  });
}

function setupLogout() {
  document.getElementById('btn-logout-settings').addEventListener('click', () => signOut());
}

init();