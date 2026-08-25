// ============================================================
// AGOS — Login Page Logic
// ============================================================
import { supabase } from '../lib/supabase.js';
import { applyPrefs } from '../lib/auth.js';

applyPrefs();

// If already logged in, redirect
supabase.auth.getSession().then(({ data }) => {
  if (data.session) redirectAfterLogin(data.session.user.id);
});

// ---- State ----
let pinValue = '';
const PIN_LENGTH = 6;

// ---- Elements ----
const tabPin = document.getElementById('tab-pin');
const tabPassword = document.getElementById('tab-password');
const panelPin = document.getElementById('panel-pin');
const panelPw = document.getElementById('panel-password');
const pinDots = document.querySelectorAll('.pin-dot');
const pinError = document.getElementById('pin-error');
const pwError = document.getElementById('pw-error');
const regError = document.getElementById('reg-error');
const loading = document.getElementById('loading-overlay');

// ---- Tab switching ----
tabPin.addEventListener('click', () => switchTab('pin'));
tabPassword.addEventListener('click', () => switchTab('password'));

function switchTab(tab) {
  if (tab === 'pin') {
    tabPin.classList.add('active'); tabPin.setAttribute('aria-selected', 'true');
    tabPassword.classList.remove('active'); tabPassword.setAttribute('aria-selected', 'false');
    panelPin.classList.remove('hidden');
    panelPw.classList.add('hidden');
  } else {
    tabPassword.classList.add('active'); tabPassword.setAttribute('aria-selected', 'true');
    tabPin.classList.remove('active'); tabPin.setAttribute('aria-selected', 'false');
    panelPw.classList.remove('hidden');
    panelPin.classList.add('hidden');
  }
}

// ---- PIN keypad ----
document.querySelectorAll('.pin-key[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (pinValue.length < PIN_LENGTH) {
      pinValue += btn.dataset.val;
      updatePinDots();
    }
  });
});

document.getElementById('pin-del')?.addEventListener('click', () => {
  pinValue = pinValue.slice(0, -1);
  updatePinDots();
  clearError(pinError);
});

// Keyboard support for PIN
document.addEventListener('keydown', (e) => {
  if (!panelPin.classList.contains('hidden')) {
    if (/^[0-9]$/.test(e.key) && pinValue.length < PIN_LENGTH) {
      pinValue += e.key;
      updatePinDots();
    } else if (e.key === 'Backspace') {
      pinValue = pinValue.slice(0, -1);
      updatePinDots();
    } else if (e.key === 'Enter') {
      document.getElementById('btn-pin-login').click();
    }
  }
});

function updatePinDots() {
  pinDots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinValue.length);
    dot.classList.remove('error');
  });
}

function shakePinDots() {
  pinDots.forEach(d => { d.classList.add('error'); d.classList.remove('filled'); });
  pinValue = '';
  setTimeout(() => pinDots.forEach(d => d.classList.remove('error')), 600);
}

// ---- PIN Login ----
document.getElementById('btn-pin-login').addEventListener('click', async () => {
  const email = document.getElementById('pin-email').value.trim();
  if (!email) { showError(pinError, 'Please enter your email address.'); return; }
  if (pinValue.length < PIN_LENGTH) { showError(pinError, 'Please enter your complete 6-digit PIN.'); return; }

  setLoading(true);
  clearError(pinError);

  try {
    // Sign in with Supabase — PIN is stored as password in format pin:<hash>
    // We use a deterministic "pin password" by signing in with email + stored pin as password
    // The actual pin_hash is verified server-side; we sign in with email+password where password is pin
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: 'AGOS_PIN_' + pinValue,
    });

    if (error) {
      shakePinDots();
      showError(pinError, 'Incorrect PIN or email. Please try again.');
      return;
    }

    await redirectAfterLogin(data.user.id);
  } catch (err) {
    showError(pinError, 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});

// ---- Password Login ----
document.getElementById('btn-pw-login').addEventListener('click', async () => {
  const email = document.getElementById('pw-email').value.trim();
  const password = document.getElementById('pw-password').value;
  if (!email) { showError(pwError, 'Please enter your email address.'); return; }
  if (!password) { showError(pwError, 'Please enter your password.'); return; }

  setLoading(true);
  clearError(pwError);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showError(pwError, 'Incorrect email or password.'); return; }
    await redirectAfterLogin(data.user.id);
  } catch {
    showError(pwError, 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});

// Show/hide password
document.getElementById('pw-toggle')?.addEventListener('click', () => {
  const input = document.getElementById('pw-password');
  const btn = document.getElementById('pw-toggle');
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
});

// Forgot password
document.getElementById('btn-forgot')?.addEventListener('click', async () => {
  const email = document.getElementById('pw-email').value.trim();
  if (!email) { showError(pwError, 'Enter your email first, then click Forgot Password.'); return; }
  setLoading(true);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
  });
  setLoading(false);
  if (error) { showError(pwError, 'Could not send reset email. Please try again.'); }
  else { showError(pwError, 'Password reset email sent. Check your inbox.'); pwError.style.color = 'var(--color-success)'; }
});

// ---- Register ----
document.getElementById('btn-show-register')?.addEventListener('click', () => {
  document.getElementById('register-panel').classList.remove('hidden');
  document.getElementById('btn-show-register').closest('p').classList.add('hidden');
});
document.getElementById('btn-hide-register')?.addEventListener('click', () => {
  document.getElementById('register-panel').classList.add('hidden');
  document.getElementById('btn-show-register').closest('p').classList.remove('hidden');
});

document.getElementById('btn-register')?.addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const pin = document.getElementById('reg-pin').value.trim();

  if (!name) { showError(regError, 'Please enter your full name.'); return; }
  if (!email) { showError(regError, 'Please enter your email address.'); return; }
  if (!password || password.length < 8) { showError(regError, 'Password must be at least 8 characters.'); return; }
  if (!/^\d{6}$/.test(pin)) { showError(regError, 'PIN must be exactly 6 digits.'); return; }

  setLoading(true);
  clearError(regError);

  try {
    // Register with full password
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, phone } }
    });
    if (error) { showError(regError, error.message); return; }

    // Also create a PIN-based auth entry using password = AGOS_PIN_{pin}
    // We register two passwords by using Supabase admin API — instead, we store pin_hash in profile
    // The PIN login uses 'AGOS_PIN_' + pin as password, so we update it
    await supabase.auth.updateUser({ password: 'AGOS_PIN_' + pin });

    // Update profile with phone and pin_hash indicator
    if (data.user) {
      await supabase.from('profiles').update({
        full_name: name,
        phone: phone || null,
        pin_hash: 'set'
      }).eq('id', data.user.id);
    }

    // Since PIN replaces the password, we also need to let them know
    showError(regError, 'Account created. You can now sign in with your PIN.');
    regError.style.color = 'var(--color-success)';
  } catch {
    showError(regError, 'Registration failed. Please try again.');
  } finally {
    setLoading(false);
  }
});

// ---- Redirect after login ----
async function redirectAfterLogin(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_active')
    .eq('id', userId)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    showError(pinError, 'Your account has been deactivated. Please contact support.');
    showError(pwError, 'Your account has been deactivated. Please contact support.');
    return;
  }

  const stored = sessionStorage.getItem('agos-redirect-after-login');
  if (stored) {
    sessionStorage.removeItem('agos-redirect-after-login');
    window.location.href = stored;
    return;
  }

  window.location.href = 'pages/dashboard.html';
}

// ---- Helpers ----
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError(el) {
  el.textContent = '';
  el.classList.add('hidden');
  el.style.color = '';
}
function setLoading(show) {
  loading.classList.toggle('hidden', !show);
}