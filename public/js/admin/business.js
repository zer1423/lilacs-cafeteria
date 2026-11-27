document.addEventListener('DOMContentLoaded', async () => {
  const admin = await window.AdminCommon.requireAdminSession();
  if (!admin) return;
  window.AdminCommon.setupLogout();

  const missingBanner = document.getElementById('businessMissingBanner');
  const feedbackEl = document.getElementById('businessFeedback');
  const saveBtn = document.getElementById('bizSaveBtn');
  const deleteBtn = document.getElementById('bizDeleteBtn');
  const deleteModal = new bootstrap.Modal(document.getElementById('deleteBizModal'));

  let recordExists = false;

  function showFeedback(message, type = 'success') {
    feedbackEl.className = `alert alert-${type} mb-4`;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('d-none');
  }

  async function loadBusiness() {
    const res = await fetch('/api/business');
    if (res.status === 404) {
      recordExists = false;
      missingBanner.classList.remove('d-none');
      deleteBtn.classList.add('d-none');
      saveBtn.textContent = 'Create Business Info';
      document.getElementById('businessForm').reset();
      return;
    }

    const biz = await res.json();
    recordExists = true;
    missingBanner.classList.add('d-none');
    deleteBtn.classList.remove('d-none');
    saveBtn.textContent = 'Save Changes';

    document.getElementById('bizName').value = biz.name || '';
    document.getElementById('bizPhone').value = biz.phone || '';
    document.getElementById('bizAddress').value = biz.address || '';
    document.getElementById('bizCity').value = biz.city || '';
    document.getElementById('bizTagline').value = biz.tagline || '';
    document.getElementById('bizTakeoutFee').value = Number(biz.takeout_fee_per_meal).toFixed(2);
    document.getElementById('bizMapLink').value = biz.map_link || '';
  }

  document.getElementById('businessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    feedbackEl.classList.add('d-none');

    const payload = {
      name: document.getElementById('bizName').value.trim(),
      phone: document.getElementById('bizPhone').value.trim(),
      address: document.getElementById('bizAddress').value.trim(),
      city: document.getElementById('bizCity').value.trim(),
      tagline: document.getElementById('bizTagline').value.trim() || null,
      takeout_fee_per_meal: document.getElementById('bizTakeoutFee').value,
      map_link: document.getElementById('bizMapLink').value.trim() || null
    };

    const method = recordExists ? 'PUT' : 'POST';
    const res = await fetch('/api/business', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showFeedback(data.error || 'Could not save business info.', 'danger');
      return;
    }

    showFeedback(recordExists ? 'Business information updated.' : 'Business information created.');
    await loadBusiness();
  });

  document.getElementById('confirmDeleteBizBtn').addEventListener('click', async () => {
    const res = await fetch('/api/business', { method: 'DELETE' });
    const data = await res.json();
    deleteModal.hide();
    if (!res.ok) {
      showFeedback(data.error || 'Could not delete business info.', 'danger');
      return;
    }
    showFeedback('Business information deleted.', 'warning');
    await loadBusiness();
  });

  await loadBusiness();
});
