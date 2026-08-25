// ============================================================
// AGOS Admin — Biller Management
// ============================================================
import { initAdminShell } from './admin-shell.js';
import { supabase } from '../../js/lib/supabase.js';
import { escHtml } from '../../js/lib/utils.js';
import { showToast } from '../../js/lib/toast.js';

let editingId = null;

const catIcons = {
  electricity:'💡', water:'💧', internet:'📡', telecom:'📱',
  cable:'📺', government:'🏛️', utilities:'🔧', other:'🏢'
};

async function init() {
  await initAdminShell('billers');
  loadBillers();
  setupModal();
}

async function loadBillers() {
  const { data } = await supabase.from('billers').select('*').order('category').order('name');
  const tbody = document.getElementById('billers-tbody');

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon"><i class="fas fa-file-invoice-dollar" aria-hidden="true"></i></div><h3>No billers yet</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(b => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <span style="font-size:1.4rem">${catIcons[b.category]||'🏢'}</span>
          <span style="font-weight:700">${escHtml(b.name)}</span>
        </div>
      </td>
      <td><span class="badge badge-info" style="text-transform:capitalize">${b.category}</span></td>
      <td><span class="badge ${b.is_active ? 'badge-success' : 'badge-danger'}">${b.is_active ? 'Active' : 'Inactive'}</span></td>
      <td style="display:flex;gap:var(--space-2)">
        <button class="btn btn-ghost btn-sm btn-edit" data-id="${b.id}" data-name="${escHtml(b.name)}" data-cat="${b.category}">Edit</button>
        <button class="btn ${b.is_active ? 'btn-warning' : 'btn-success'} btn-sm btn-toggle" data-id="${b.id}" data-active="${b.is_active}">
          ${b.is_active ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-danger btn-sm btn-delete" data-id="${b.id}" data-name="${escHtml(b.name)}">Delete</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id, btn.dataset.name, btn.dataset.cat));
  });
  tbody.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newActive = btn.dataset.active === 'true' ? false : true;
      await supabase.from('billers').update({ is_active: newActive }).eq('id', btn.dataset.id);
      showToast(newActive ? 'Biller Enabled' : 'Biller Disabled', '', newActive ? 'success' : 'warning', 2000);
      loadBillers();
    });
  });
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete biller "${btn.dataset.name}"?`)) return;
      const { error } = await supabase.from('billers').delete().eq('id', btn.dataset.id);
      if (!error) { showToast('Deleted', btn.dataset.name + ' removed.', 'success'); loadBillers(); }
    });
  });
}

function setupModal() {
  document.getElementById('btn-add-biller').addEventListener('click', () => openModal());
  document.getElementById('bm-close').addEventListener('click',   closeModal);
  document.getElementById('bm-cancel').addEventListener('click',  closeModal);
  document.getElementById('biller-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('biller-modal')) closeModal();
  });

  document.getElementById('bm-save').addEventListener('click', async () => {
    const name = document.getElementById('b-name').value.trim();
    const cat  = document.getElementById('b-category').value;
    const errEl = document.getElementById('bm-error');
    errEl.classList.add('hidden');

    if (!name) { errEl.textContent = 'Please enter a biller name.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('bm-save');
    btn.disabled = true;

    let error;
    if (editingId) {
      ({ error } = await supabase.from('billers').update({ name, category: cat }).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('billers').insert({ name, category: cat }));
    }

    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    showToast(editingId ? 'Biller updated' : 'Biller added', name, 'success');
    closeModal();
    loadBillers();
  });
}

function openModal(id = null, name = '', cat = 'electricity') {
  editingId = id;
  document.getElementById('biller-modal-title').textContent = id ? 'Edit Biller' : 'Add Biller';
  document.getElementById('b-name').value    = name;
  document.getElementById('b-category').value = cat;
  document.getElementById('bm-error').classList.add('hidden');
  document.getElementById('biller-modal').classList.remove('hidden');
  document.getElementById('b-name').focus();
}
function closeModal() {
  document.getElementById('biller-modal').classList.add('hidden');
  editingId = null;
}

init();
