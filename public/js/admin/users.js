document.addEventListener('DOMContentLoaded', async () => {
  const currentAdmin = await window.AdminCommon.requireAdminSession();
  if (!currentAdmin) return;
  window.AdminCommon.setupLogout();

  const { escapeHtml } = window.AdminCommon;
  const tbody = document.getElementById('adminsTableBody');
  const feedbackEl = document.getElementById('usersFeedback');

  const userModal = new bootstrap.Modal(document.getElementById('userModal'));
  const deleteUserModal = new bootstrap.Modal(document.getElementById('deleteUserModal'));

  let admins = [];
  let pendingDeleteId = null;

  function showFeedback(message, type = 'success') {
    feedbackEl.className = `alert alert-${type} mb-3`;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('d-none');
    setTimeout(() => feedbackEl.classList.add('d-none'), 4000);
  }

  async function loadAdmins() {
    const res = await fetch('/api/admins');
    if (res.status === 401) {
      window.location.href = '/admin/login.html';
      return;
    }
    admins = await res.json();
    renderAdmins();
  }

  function renderAdmins() {
    if (admins.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No admin accounts found.</td></tr>';
      return;
    }

    tbody.innerHTML = admins
      .map(
        (a) => `
        <tr>
          <td class="ps-4 fw-semibold">#${a.admin_id}</td>
          <td class="fw-bold">
            ${escapeHtml(a.username)}
            ${a.admin_id === currentAdmin.admin_id ? '<span class="badge bg-secondary ms-2">You</span>' : ''}
          </td>
          <td class="pe-4 text-end">
            <button type="button" class="admin-icon-action" data-edit-user="${a.admin_id}">
              <i class="bi bi-pencil fs-5"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="admin-icon-action text-danger" data-delete-user="${a.admin_id}">
              <i class="bi bi-trash fs-5"></i>
              <span>Delete</span>
            </button>
          </td>
        </tr>
      `
      )
      .join('');

    tbody.querySelectorAll('[data-edit-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const user = admins.find((u) => u.admin_id === Number(btn.getAttribute('data-edit-user')));
        if (user) openUserModal(user);
      });
    });

    tbody.querySelectorAll('[data-delete-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteId = Number(btn.getAttribute('data-delete-user'));
        const user = admins.find((u) => u.admin_id === pendingDeleteId);
        document.getElementById('deleteUserPrompt').textContent =
          `Are you sure you want to delete "${user ? user.username : 'this user'}"?`;
        deleteUserModal.show();
      });
    });
  }

  function openUserModal(user = null) {
    document.getElementById('userFormError').classList.add('d-none');
    const pwField = document.getElementById('userPasswordField');
    const pwHelp = document.getElementById('passwordHelp');

    if (user) {
      document.getElementById('userModalTitle').textContent = 'Edit User';
      document.getElementById('userIdField').value = user.admin_id;
      document.getElementById('userUsernameField').value = user.username;
      pwField.value = '';
      pwField.required = false;
      pwHelp.textContent = 'Leave blank to keep the current password (min 6 chars if changing).';
    } else {
      document.getElementById('userModalTitle').textContent = 'Add Admin';
      document.getElementById('userIdField').value = '';
      document.getElementById('userUsernameField').value = '';
      pwField.value = '';
      pwField.required = true;
      pwHelp.textContent = 'Minimum 6 characters.';
    }

    userModal.show();
  }

  document.getElementById('addAdminBtn').addEventListener('click', () => openUserModal(null));

  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('userFormError');
    errEl.classList.add('d-none');

    const userId = document.getElementById('userIdField').value;
    const username = document.getElementById('userUsernameField').value.trim();
    const password = document.getElementById('userPasswordField').value;

    const payload = { username };
    if (password || !userId) {
      payload.password = password;
    }

    const url = userId ? `/api/admins/${userId}` : '/api/admins';
    const method = userId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Could not save admin account.';
      errEl.classList.remove('d-none');
      return;
    }

    userModal.hide();
    showFeedback(userId ? 'Admin account updated.' : 'Admin account created.');
    await loadAdmins();
  });

  document.getElementById('confirmDeleteUserBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const res = await fetch(`/api/admins/${pendingDeleteId}`, { method: 'DELETE' });
    const data = await res.json();
    deleteUserModal.hide();
    if (!res.ok) {
      showFeedback(data.error || 'Could not delete account.', 'danger');
      return;
    }

    if (pendingDeleteId === currentAdmin.admin_id) {
      window.location.href = '/admin/login.html';
      return;
    }

    showFeedback('Admin account deleted.');
    pendingDeleteId = null;
    await loadAdmins();
  });

  await loadAdmins();
});
