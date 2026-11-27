(function () {
  async function requireAdminSession() {
    try {
      const res = await fetch('/api/admin/me');
      if (!res.ok) {
        window.location.href = '/admin/login.html';
        return null;
      }
      const admin = await res.json();
      const userBadge = document.getElementById('adminCurrentUser');
      if (userBadge) {
        userBadge.textContent = admin.username;
      }
      return admin;
    } catch {
      window.location.href = '/admin/login.html';
      return null;
    }
  }

  function setupLogout() {
    const btn = document.getElementById('adminLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
      } finally {
        window.location.href = '/admin/login.html';
      }
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPeso(val) {
    return '₱' + Number(val || 0).toFixed(2);
  }

  window.AdminCommon = {
    requireAdminSession,
    setupLogout,
    escapeHtml,
    formatPeso
  };
})();
