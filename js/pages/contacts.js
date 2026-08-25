// ============================================================
// AGOS — Saved Contacts Page
// ============================================================
import { initShell } from '../lib/shell.js';
import { supabase } from '../lib/supabase.js';
import { getInitials, escHtml, debounce } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

let profile = null;
let editingId = null;
let deletingId = null;

async function init() {
  profile = await initShell('contacts');
  if (!profile) return;
  loadContacts();
  setupModal();
  setupDeleteModal();
}

async function loadContacts() {
  const { data } = await supabase
    .from('saved_contacts')
    .select('id, nickname, account_number')
    .eq('owner_id', profile.id)
    .order('nickname');

  const list = document.getElementById('contacts-list');
  if (!data?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-users" aria-hidden="true"></i></div>
        <h3>No saved contacts yet</h3>
        <p>Add your family members or frequent recipients to make sending money faster.</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(c => `
    <div class="contact-item" id="contact-${c.id}">
      <div class="contact-avatar">${getInitials(c.nickname)}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(c.nickname)}</div>
        <div class="contact-acct">${c.account_number}</div>
      </div>
      <div class="contact-actions">
        <a href="send.html?acct=${c.account_number}" class="btn btn-primary btn-sm" aria-label="Send money to ${escHtml(c.nickname)}"><i class="fas fa-paper-plane" aria-hidden="true"></i> Send</a>
        <button class="btn btn-ghost btn-sm btn-edit" data-id="${c.id}" data-nickname="${escHtml(c.nickname)}" data-acct="${c.account_number}" aria-label="Edit ${escHtml(c.nickname)}"><i class="fas fa-pen" aria-hidden="true"></i></button>
        <button class="btn btn-danger btn-sm btn-delete" data-id="${c.id}" data-name="${escHtml(c.nickname)}" aria-label="Remove ${escHtml(c.nickname)}"><i class="fas fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id, btn.dataset.nickname, btn.dataset.acct));
  });
  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.name));
  });
}

function setupModal() {
  document.getElementById('btn-add-contact').addEventListener('click', () => openModal());
  document.getElementById('contact-modal-close').addEventListener('click', closeModal);
  document.getElementById('c-cancel').addEventListener('click', closeModal);
  document.getElementById('contact-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('contact-modal')) closeModal();
  });

  // Live account lookup
  const acctInput = document.getElementById('c-acct');
  acctInput.addEventListener('input', debounce(async () => {
    const val = acctInput.value.trim().toUpperCase();
    acctInput.value = val;
    if (val.length < 5) { document.getElementById('c-preview').style.display = 'none'; return; }
    const { data } = await supabase.rpc('lookup_profile_by_account', { p_account_number: val });
    const result = data && data.length > 0 ? data[0] : null;
    if (result) {
      document.getElementById('c-preview-icon').textContent = getInitials(result.full_name);
      document.getElementById('c-preview-name').textContent = result.full_name;
      document.getElementById('c-preview-acct').textContent = result.account_number;
      document.getElementById('c-preview').style.display = 'flex';
      document.getElementById('c-preview').classList.remove('hidden');
    } else {
      document.getElementById('c-preview').style.display = 'none';
    }
  }, 400));

  document.getElementById('c-save').addEventListener('click', saveContact);
}

function openModal(id = null, nickname = '', acct = '') {
  editingId = id;
  const title = id ? 'Edit Contact' : 'Add Contact';
  document.getElementById('contact-modal-title').textContent = title;
  document.getElementById('c-nickname').value = nickname;
  document.getElementById('c-acct').value = acct;
  document.getElementById('c-error').classList.add('hidden');
  document.getElementById('c-preview').style.display = 'none';
  document.getElementById('contact-modal').classList.remove('hidden');
  document.getElementById('c-nickname').focus();
}

function closeModal() {
  document.getElementById('contact-modal').classList.add('hidden');
  editingId = null;
}

async function saveContact() {
  const nickname = document.getElementById('c-nickname').value.trim();
  const acct = document.getElementById('c-acct').value.trim().toUpperCase();
  const errEl = document.getElementById('c-error');

  if (!nickname) { errEl.textContent = 'Please enter a name.'; errEl.classList.remove('hidden'); return; }
  if (!acct) { errEl.textContent = 'Please enter an account number.'; errEl.classList.remove('hidden'); return; }

  // Verify account exists
  const { data } = await supabase.rpc('lookup_profile_by_account', { p_account_number: acct });
  const recipient = data && data.length > 0 ? data[0] : null;
  if (!recipient) { errEl.textContent = 'Account not found. Check the account number.'; errEl.classList.remove('hidden'); return; }

  document.getElementById('c-save').disabled = true;

  let error;
  if (editingId) {
    ({ error } = await supabase.from('saved_contacts').update({ nickname, account_number: acct }).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('saved_contacts').insert({
      owner_id: profile.id,
      contact_id: recipient.id,
      nickname,
      account_number: acct
    }));
  }

  document.getElementById('c-save').disabled = false;
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

  showToast('Contact saved', nickname + ' has been saved.', 'success');
  closeModal();
  loadContacts();
}

function setupDeleteModal() {
  document.getElementById('del-modal-close').addEventListener('click', closeDeleteModal);
  document.getElementById('del-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
  document.getElementById('del-confirm').addEventListener('click', async () => {
    if (!deletingId) return;
    const { error } = await supabase.from('saved_contacts').delete().eq('id', deletingId);
    if (!error) { showToast('Contact removed', '', 'success'); closeDeleteModal(); loadContacts(); }
    else showToast('Error', error.message, 'error');
  });
}

function openDeleteModal(id, name) {
  deletingId = id;
  document.getElementById('del-name').textContent = name;
  document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deletingId = null;
}

init();