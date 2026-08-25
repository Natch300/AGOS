// ============================================================
// AGOS — App Shell: sidebar, header, nav, notifications badge
// ============================================================
import { supabase } from './supabase.js';
import { getProfile, signOut } from './auth.js';
import { applyPrefs } from './auth.js';
import { getInitials, formatPeso } from './utils.js';

export async function initShell(activePage = '') {
  applyPrefs();

  const profile = await getProfile();
  if (!profile) {
    const match = window.location.pathname.match(/\/(pages|admin)\/.*/);
    sessionStorage.setItem('agos-redirect-after-login', match ? match[0].substring(1) : 'pages/dashboard.html');
    window.location.href = '../index.html';
    return null;
  }

  // If admin, mark that they're in user view (for return navigation)
  if (profile.is_admin) {
    sessionStorage.setItem('agos-admin-viewing-user', 'true');
  }

  renderSidebar(profile, activePage);
  renderMobileNav(activePage);
  renderHeader(profile, activePage);
  setupMobileMenu();
  updateNotifBadge(profile.id);

  // Listen for realtime notifications
  supabase.channel('notifications-' + profile.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${profile.id}`
    }, (payload) => {
      updateNotifBadge(profile.id);
      // Show browser notification if permitted
      if (Notification.permission === 'granted') {
        new Notification('AGOS: ' + payload.new.title, { body: payload.new.body });
      }
    })
    .subscribe();

  return profile;
}

function renderSidebar(profile, activePage) {
  const basePath = '../';
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-home', href: 'dashboard.html' },
    { id: 'send', label: 'Send Money', icon: 'fas fa-paper-plane', href: 'send.html' },
    { id: 'receive', label: 'Receive Money', icon: 'fas fa-inbox', href: 'receive.html' },
    { id: 'bills', label: 'Pay Bills', icon: 'fas fa-file-invoice-dollar', href: 'bills.html' },
    { id: 'history', label: 'Transactions', icon: 'fas fa-list', href: 'history.html' },
    { id: 'contacts', label: 'Saved Contacts', icon: 'fas fa-users', href: 'contacts.html' },
    { id: 'notifications', label: 'Notifications', icon: 'fas fa-bell', href: 'notifications.html', badgeId: 'nav-notif-badge' },
    { id: 'support', label: 'Help & Support', icon: 'fas fa-headset', href: 'support.html' },
    { id: 'settings', label: 'Accessibility', icon: 'fas fa-sliders', href: 'settings.html' },
  ];

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  let adminSection = '';
  if (profile.is_admin) {
    adminSection = `
      <div class="nav-section-label">Administration</div>
      <a href="../admin/index.html" class="nav-item" aria-label="Go to admin panel">
        <span class="nav-icon" aria-hidden="true"><i class="fas fa-cog"></i></span>
        <span>Admin Panel</span>
      </a>
    `;
  }

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon"><i class="fas fa-water"></i></div>
      <div>
        <div class="sidebar-logo-text">AGOS</div>
        <div class="sidebar-logo-sub">Digital Banking</div>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="Main navigation">
      <div class="nav-section-label">Main Menu</div>
      ${nav.map(item => `
        <a href="${item.href}"
           class="nav-item ${activePage === item.id ? 'active' : ''}"
           ${activePage === item.id ? 'aria-current="page"' : ''}>
          <span class="nav-icon" aria-hidden="true"><i class="${item.icon}"></i></span>
          <span>${item.label}</span>
          ${item.badgeId ? `<span class="nav-badge hidden" id="${item.badgeId}" aria-label="unread count">0</span>` : ''}
        </a>
      `).join('')}
      ${adminSection}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar" aria-hidden="true">${getInitials(profile.full_name)}</div>
        <div style="flex:1;min-width:0">
          <div class="sidebar-user-name">${profile.full_name}</div>
          <div class="sidebar-user-acct">${profile.account_number}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-logout" title="Sign out" aria-label="Sign out"><i class="fas fa-power-off"></i></button>
      </div>
    </div>
  `;

  document.getElementById('btn-logout')?.addEventListener('click', () => signOut());
}

function renderHeader(profile, activePage) {
  const pageTitles = {
    dashboard: 'Dashboard',
    send: 'Send Money',
    receive: 'Receive Money',
    bills: 'Pay Bills',
    history: 'Transactions',
    contacts: 'Saved Contacts',
    notifications: 'Notifications',
    support: 'Help & Support',
    settings: 'Accessibility Settings',
  };

  const header = document.getElementById('top-header');
  if (!header) return;

  header.innerHTML = `
    <div class="top-header-left">
      <button class="menu-toggle" id="menu-toggle" aria-label="Toggle menu" aria-expanded="false"><i class="fas fa-bars"></i></button>
      <h1 class="page-title">${pageTitles[activePage] || 'AGOS'}</h1>
    </div>
    <div class="top-header-right">
      <button class="notif-btn" id="header-notif-btn" title="Notifications" aria-label="Notifications">
        <i class="fas fa-bell"></i>
        <span class="notif-dot hidden" id="header-notif-dot" aria-hidden="true"></span>
      </button>
      <div style="font-size:var(--font-size-sm);font-weight:600;color:var(--text-secondary)">
        ${formatPeso(profile.balance)}
      </div>
    </div>
  `;

  document.getElementById('header-notif-btn')?.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });
}

function renderMobileNav(activePage) {
  const mobileNav = document.getElementById('mobile-nav');
  if (!mobileNav) return;

  const nav = [
    { id: 'dashboard', label: 'Home', icon: 'fas fa-house', href: 'dashboard.html' },
    { id: 'send', label: 'Send', icon: 'fas fa-arrow-up-right-from-square', href: 'send.html' },
    { id: 'receive', label: 'Receive', icon: 'fas fa-inbox', href: 'receive.html' },
    { id: 'history', label: 'Activity', icon: 'fas fa-clock-rotate-left', href: 'history.html' },
    { id: 'settings', label: 'More', icon: 'fas fa-ellipsis', href: 'settings.html' },
  ];

  mobileNav.innerHTML = nav.map(item => `
    <a href="${item.href}" class="mobile-nav-item ${activePage === item.id ? 'active' : ''}"
       ${activePage === item.id ? 'aria-current="page"' : ''}>
      <i class="${item.icon}" aria-hidden="true"></i>
      <span>${item.label}</span>
    </a>
  `).join('');
}

async function updateNotifBadge(userId) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  const badge = document.getElementById('nav-notif-badge');
  const dot = document.getElementById('header-notif-dot');

  if (count > 0) {
    if (badge) { badge.textContent = count > 99 ? '99+' : count; badge.classList.remove('hidden'); }
    if (dot) { dot.classList.remove('hidden'); }
  } else {
    if (badge) badge.classList.add('hidden');
    if (dot) dot.classList.add('hidden');
  }
}

function setupMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  let overlay = document.getElementById('sidebar-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    toggle?.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    toggle?.setAttribute('aria-expanded', 'false');
  }

  toggle?.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay.addEventListener('click', closeMenu);
}