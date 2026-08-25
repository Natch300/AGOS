// ============================================================
// AGOS — Toast notification helper
// ============================================================

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification
 * @param {string} title
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} duration  ms before auto-close (0 = permanent)
 */
export function showToast(title, message = '', type = 'info', duration = 4000) {
  const icons = { info: 'fas fa-info-circle', success: 'fas fa-check-circle', warning: 'fas fa-exclamation-triangle', error: 'fas fa-times-circle' };
  const c = getContainer();

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.setAttribute('role', 'alert');
  t.setAttribute('aria-live', 'polite');
  t.innerHTML = `
    <span class="toast-icon"><i class="${icons[type] || 'fas fa-info-circle'}"></i></span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-msg">${escHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Close notification"><i class="fas fa-times"></i></button>
  `;

  t.querySelector('.toast-close').addEventListener('click', () => remove(t));
  c.appendChild(t);

  if (duration > 0) setTimeout(() => remove(t), duration);
  return t;
}

function remove(el) {
  el.style.opacity = '0';
  el.style.transform = 'translateX(100%)';
  el.style.transition = 'all .3s ease';
  setTimeout(() => el.remove(), 300);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}