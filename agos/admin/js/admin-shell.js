// ============================================================
// AGOS Admin — Shell (sidebar + header + auth guard)
// ============================================================
import { supabase } from '../../js/lib/supabase.js';
import { getInitials } from '../../js/lib/utils.js';

export async function initAdminShell(activePage = '') {
  // Auth + admin guard
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const match = window.location.pathname.match(/\/(pages|admin)\/.*/);
    sessionStorage.setItem('agos-redirect-after-login', match ? match[0].substring(1) : 'admin/index.html');
    window.location.href = '../index.html';
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile?.is_admin) { window.location.href = '../index.html'; return null; }

  renderSidebar(profile, activePage);
  renderHeader(activePage);
  setupMobileMenu();
  updateBadges();

  return profile;
}

const navItems = [
  { id: 'dashboard',    label: 'Dashboard',        icon: 'fas fa-chart-line', href: 'index.html' },
  { id: 'users',        label: 'Users',             icon: 'fas fa-users', href: 'users.html' },
  { id: 'funds',        label: 'Fund Allocation',   icon: 'fas fa-wallet', href: 'funds.html' },
  { id: 'transactions', label: 'Transactions',      icon: 'fas fa-list', href: 'transactions.html' },
  { id: 'tickets',      label: 'Support Tickets',   icon: 'fas fa-headset', href: 'tickets.html', badgeId: 'nav-ticket-badge' },
  { id: 'billers',      label: 'Billers',           icon: 'fas fa-file-invoice-dollar', href: 'billers.html' },
];

const pageTitles = {
  dashboard: 'Admin Dashboard', users: 'User Management',
  funds: 'Fund Allocation', transactions: 'All Transactions',
  tickets: 'Support Tickets', billers: 'Biller Management',
};

function renderSidebar(profile, activePage) {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon"><i class="fas fa-water"></i></div>
      <div>
        <div class="sidebar-logo-text">AGOS</div>
        <div class="sidebar-logo-sub">Admin Panel</div>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="Admin navigation">
      <div class="nav-section-label">Administration</div>
      ${navItems.map(item => `
        <a href="${item.href}" class="nav-item ${activePage === item.id ? 'active' : ''}"
           ${activePage === item.id ? 'aria-current="page"' : ''}>
          <span class="nav-icon" aria-hidden="true"><i class="${item.icon}"></i></span>
          <span>${item.label}</span>
          ${item.badgeId ? `<span class="nav-badge hidden" id="${item.badgeId}">0</span>` : ''}
        </a>`).join('')}
      <div class="nav-section-label">User Side</div>
      <a href="../pages/dashboard.html" class="nav-item" aria-label="Switch to user view">
        <span class="nav-icon" aria-hidden="true"><i class="fas fa-user"></i></span>
        <span>User View</span>
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar" aria-hidden="true">${getInitials(profile.full_name)}</div>
        <div style="flex:1;min-width:0">
          <div class="sidebar-user-name">${profile.full_name}</div>
          <div class="sidebar-user-role">Administrator</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="admin-logout" title="Sign out" aria-label="Sign out"
                style="border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.6);min-height:36px"><i class="fas fa-power-off"></i></button>
      </div>
    </div>`;

  document.getElementById('admin-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '../index.html';
  });
}

function renderHeader(activePage) {
  const el = document.getElementById('top-header');
  if (!el) return;
  el.innerHTML = `
    <div class="top-header-left">
      <button class="menu-toggle" id="menu-toggle" aria-label="Toggle menu" aria-expanded="false"><i class="fas fa-bars"></i></button>
      <h1 class="page-title">${pageTitles[activePage] || 'Admin'}</h1>
    </div>
    <div class="top-header-right">
      <span class="admin-pill"><i class="fas fa-cog"></i> Admin</span>
    </div>`;
}

async function updateBadges() {
  const { count } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const badge = document.getElementById('nav-ticket-badge');
  if (badge && count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  }
}

function setupMobileMenu() {
  const toggle  = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  let overlay   = document.getElementById('sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  const open  = () => { sidebar.classList.add('open');  overlay.classList.add('visible');  toggle?.setAttribute('aria-expanded','true');  };
  const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('visible'); toggle?.setAttribute('aria-expanded','false'); };
  toggle?.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
  overlay.addEventListener('click', close);
}
