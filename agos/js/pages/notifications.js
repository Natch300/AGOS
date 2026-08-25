// ============================================================
// AGOS — Notifications Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { timeAgo, escHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

let profile = null;
let activeFilter = 'all';

const typeIcons = { success: 'fas fa-check-circle', warning: 'fas fa-exclamation-triangle', danger: 'fas fa-times-circle', info: 'fas fa-info-circle' };

async function init() {
  profile = await initShell('notifications');
  if (!profile) return;

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  loadNotifications();
  setupFilters();
  setupMarkAll();

  // Realtime: new notification
  supabase.channel('notifs-page-' + profile.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${profile.id}`
    }, () => loadNotifications())
    .subscribe();
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  list.innerHTML = '<div class="spinner"></div>';

  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (activeFilter === 'unread') q = q.eq('is_read', false);
  else if (activeFilter === 'success') q = q.eq('type', 'success');
  else if (activeFilter === 'warning') q = q.in('type', ['warning', 'danger']);

  const { data } = await q;

  if (!data?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-bell"></i></div>
        <h3>No notifications</h3>
        <p>You're all caught up! Notifications about your account will appear here.</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" tabindex="0" role="button"
         aria-label="${escHtml(n.title)}: ${escHtml(n.body)}">
      <div class="notif-icon ${n.type}" aria-hidden="true"><i class="${typeIcons[n.type] || 'fas fa-info-circle'}"></i></div>
      <div class="notif-body">
        <div class="notif-title">${escHtml(n.title)}</div>
        <div class="notif-msg">${escHtml(n.body)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
      ${n.is_read ? '' : '<div class="notif-unread-dot" aria-hidden="true"></div>'}
    </div>`).join('');

  // Mark as read on click
  list.querySelectorAll('.notif-item').forEach(item => {
    const handler = async () => {
      const id = item.dataset.id;
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      item.classList.remove('unread');
      item.querySelector('.notif-unread-dot')?.remove();
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

function setupFilters() {
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      loadNotifications();
    });
  });
}

function setupMarkAll() {
  document.getElementById('btn-mark-all').addEventListener('click', async () => {
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', profile.id).eq('is_read', false);
    showToast('All notifications marked as read', '', 'success', 2000);
    loadNotifications();
  });
}

init();