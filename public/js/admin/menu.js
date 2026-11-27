document.addEventListener('DOMContentLoaded', async () => {
  const admin = await window.AdminCommon.requireAdminSession();
  if (!admin) return;
  window.AdminCommon.setupLogout();

  const { escapeHtml, formatPeso } = window.AdminCommon;
  const menuListEl = document.getElementById('adminMenuList');
  const filterBarEl = document.getElementById('categoryFilterBar');
  const searchInput = document.getElementById('menuSearchInput');
  const feedbackEl = document.getElementById('menuFeedback');

  const itemModalEl = document.getElementById('itemModal');
  const itemModal = new bootstrap.Modal(itemModalEl);
  const deleteItemModalEl = document.getElementById('deleteItemModal');
  const deleteItemModal = new bootstrap.Modal(deleteItemModalEl);

  let items = [];
  let categories = [];
  let activeCategoryId = 'all';
  let searchQuery = '';
  let pendingDeleteItemId = null;

  function showFeedback(message, type = 'success') {
    feedbackEl.className = `alert alert-${type} mb-3`;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('d-none');
    setTimeout(() => feedbackEl.classList.add('d-none'), 4000);
  }

  async function loadCategories() {
    const res = await fetch('/api/categories');
    categories = await res.json();
    renderCategoryFilters();
    renderCategoryDropdown();
    renderCategoriesTable();
  }

  async function loadMenuItems() {
    const res = await fetch('/api/menu/all');
    if (res.status === 401) {
      window.location.href = '/admin/login.html';
      return;
    }
    items = await res.json();
    renderMenuList();
  }

  function renderCategoryFilters() {
    const pills = [
      `<button type="button" class="admin-filter-pill ${activeCategoryId === 'all' ? 'active' : ''}" data-cat="all">All</button>`,
      ...categories.map(
        (c) =>
          `<button type="button" class="admin-filter-pill ${String(activeCategoryId) === String(c.category_id) ? 'active' : ''}" data-cat="${c.category_id}">${escapeHtml(c.display_name)}</button>`
      )
    ];
    filterBarEl.innerHTML = pills.join('');
    filterBarEl.querySelectorAll('.admin-filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategoryId = btn.getAttribute('data-cat');
        renderCategoryFilters();
        renderMenuList();
      });
    });
  }

  function renderCategoryDropdown() {
    const select = document.getElementById('itemCategoryField');
    select.innerHTML = categories
      .map((c) => `<option value="${c.category_id}">${escapeHtml(c.display_name)}</option>`)
      .join('');
  }

  function renderMenuList() {
    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchCat =
        activeCategoryId === 'all' || String(item.category_id) === String(activeCategoryId);
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      menuListEl.innerHTML =
        '<div class="alert alert-light border text-center py-4">No menu items found.</div>';
      return;
    }

    menuListEl.innerHTML = filtered
      .map((item) => {
        const imgSrc = item.image_url || '/images/lilac_logo.jpg';
        const isFallback = !item.image_url;
        const availChecked = item.is_available ? 'checked' : '';
        return `
          <div class="admin-menu-row ${item.is_available ? '' : 'opacity-75'}">
            <div class="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
              <img
                src="${escapeHtml(imgSrc)}"
                alt="${escapeHtml(item.name)}"
                class="admin-menu-row-thumb ${isFallback ? 'is-fallback' : ''}"
                onerror="this.onerror=null;this.src='/images/lilac_logo.jpg';this.classList.add('is-fallback');"
              >
              <div class="min-w-0">
                <div class="fw-bold fs-5 text-truncate">
                  ${escapeHtml(item.name)}
                  ${item.is_available ? '' : '<span class="badge bg-secondary ms-2 fs-6">Unavailable</span>'}
                </div>
                <div class="small text-muted">${escapeHtml(item.category)}</div>
              </div>
            </div>

            <div class="d-flex align-items-center gap-4">
              <div class="fw-bold fs-5">${formatPeso(item.price)}</div>
              <div class="form-check form-switch mb-0" title="Toggle availability">
                <input class="form-check-input" type="checkbox" ${availChecked} data-toggle-avail="${item.item_id}" aria-label="Toggle availability for ${escapeHtml(item.name)}">
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="admin-icon-action" data-edit-item="${item.item_id}">
                  <i class="bi bi-pencil fs-5"></i>
                  <span>Edit</span>
                </button>
                <button type="button" class="admin-icon-action text-danger" data-delete-item="${item.item_id}">
                  <i class="bi bi-trash fs-5"></i>
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    menuListEl.querySelectorAll('[data-toggle-avail]').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const id = Number(chk.getAttribute('data-toggle-avail'));
        const item = items.find((i) => i.item_id === id);
        if (!item) return;
        const res = await fetch(`/api/menu/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: item.category_id,
            name: item.name,
            description: item.description,
            price: item.price,
            image_url: item.image_url,
            is_available: chk.checked ? 1 : 0
          })
        });
        if (!res.ok) {
          showFeedback('Could not update item availability.', 'danger');
          chk.checked = !chk.checked;
          return;
        }
        await loadMenuItems();
      });
    });

    menuListEl.querySelectorAll('[data-edit-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-item'));
        const item = items.find((i) => i.item_id === id);
        if (item) openItemModal(item);
      });
    });

    menuListEl.querySelectorAll('[data-delete-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteItemId = Number(btn.getAttribute('data-delete-item'));
        const item = items.find((i) => i.item_id === pendingDeleteItemId);
        document.getElementById('deleteItemPrompt').textContent =
          `Are you sure you want to delete "${item ? item.name : 'this item'}"?`;
        deleteItemModal.show();
      });
    });
  }

  function openItemModal(item = null) {
    document.getElementById('itemFormError').classList.add('d-none');
    if (item) {
      document.getElementById('itemModalTitle').textContent = 'Edit Item';
      document.getElementById('itemIdField').value = item.item_id;
      document.getElementById('itemNameField').value = item.name;
      document.getElementById('itemPriceField').value = Number(item.price).toFixed(2);
      document.getElementById('itemCategoryField').value = item.category_id;
      document.getElementById('itemDescField').value = item.description || '';
      document.getElementById('itemImageField').value = item.image_url || '';
      document.getElementById('itemAvailableField').checked = Boolean(item.is_available);
      document.getElementById('itemPreviewImg').src = item.image_url || '/images/lilac_logo.jpg';
    } else {
      document.getElementById('itemModalTitle').textContent = 'Add New Item';
      document.getElementById('itemIdField').value = '';
      document.getElementById('itemForm').reset();
      document.getElementById('itemAvailableField').checked = true;
      document.getElementById('itemPreviewImg').src = '/images/lilac_logo.jpg';
    }
    itemModal.show();
  }

  document.getElementById('itemImageField').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    document.getElementById('itemPreviewImg').src = val || '/images/lilac_logo.jpg';
  });

  document.getElementById('addNewItemBtn').addEventListener('click', () => openItemModal(null));

  document.getElementById('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('itemFormError');
    errEl.classList.add('d-none');

    const itemId = document.getElementById('itemIdField').value;
    const payload = {
      name: document.getElementById('itemNameField').value.trim(),
      price: document.getElementById('itemPriceField').value,
      category_id: Number(document.getElementById('itemCategoryField').value),
      description: document.getElementById('itemDescField').value.trim() || null,
      image_url: document.getElementById('itemImageField').value.trim() || null,
      is_available: document.getElementById('itemAvailableField').checked ? 1 : 0
    };

    const url = itemId ? `/api/menu/${itemId}` : '/api/menu';
    const method = itemId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Could not save menu item.';
      errEl.classList.remove('d-none');
      return;
    }

    itemModal.hide();
    showFeedback(itemId ? 'Menu item updated.' : 'Menu item added.');
    await loadMenuItems();
  });

  document.getElementById('confirmDeleteItemBtn').addEventListener('click', async () => {
    if (!pendingDeleteItemId) return;
    const res = await fetch(`/api/menu/${pendingDeleteItemId}`, { method: 'DELETE' });
    const data = await res.json();
    deleteItemModal.hide();
    if (!res.ok) {
      showFeedback(data.error || 'Could not delete item.', 'danger');
      return;
    }
    showFeedback('Menu item deleted.');
    pendingDeleteItemId = null;
    await loadMenuItems();
  });

  // Categories CRUD inside modal
  function showCatError(msg) {
    const el = document.getElementById('categoryModalError');
    if (!msg) {
      el.classList.add('d-none');
      return;
    }
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function resetCategoryForm() {
    document.getElementById('catIdField').value = '';
    document.getElementById('catNameField').value = '';
    document.getElementById('catDisplayField').value = '';
    document.getElementById('catFeeField').checked = false;
    document.getElementById('catSubmitBtn').textContent = 'Add Category';
    document.getElementById('catCancelEditBtn').classList.add('d-none');
  }

  function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    tbody.innerHTML = categories
      .map(
        (c) => `
        <tr>
          <td class="fw-semibold">${escapeHtml(c.display_name)}</td>
          <td><code>${escapeHtml(c.name)}</code></td>
          <td>${c.has_takeout_fee ? '<span class="badge bg-primary">Yes (Takeout Fee)</span>' : '<span class="badge bg-secondary">Exempt</span>'}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-secondary me-1" data-edit-cat="${c.category_id}">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-del-cat="${c.category_id}">Delete</button>
          </td>
        </tr>
      `
      )
      .join('');

    tbody.querySelectorAll('[data-edit-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showCatError('');
        const cat = categories.find((c) => c.category_id === Number(btn.getAttribute('data-edit-cat')));
        if (!cat) return;
        document.getElementById('catIdField').value = cat.category_id;
        document.getElementById('catNameField').value = cat.name;
        document.getElementById('catDisplayField').value = cat.display_name;
        document.getElementById('catFeeField').checked = Boolean(cat.has_takeout_fee);
        document.getElementById('catSubmitBtn').textContent = 'Save';
        document.getElementById('catCancelEditBtn').classList.remove('d-none');
      });
    });

    tbody.querySelectorAll('[data-del-cat]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showCatError('');
        const catId = Number(btn.getAttribute('data-del-cat'));
        const res = await fetch(`/api/categories/${catId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          showCatError(data.error || 'Could not delete category.');
          return;
        }
        await loadCategories();
        await loadMenuItems();
      });
    });
  }

  document.getElementById('catCancelEditBtn').addEventListener('click', () => {
    showCatError('');
    resetCategoryForm();
  });

  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showCatError('');
    const catId = document.getElementById('catIdField').value;
    const payload = {
      name: document.getElementById('catNameField').value.trim(),
      display_name: document.getElementById('catDisplayField').value.trim(),
      has_takeout_fee: document.getElementById('catFeeField').checked ? 1 : 0
    };

    const url = catId ? `/api/categories/${catId}` : '/api/categories';
    const method = catId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showCatError(data.error || 'Could not save category.');
      return;
    }
    resetCategoryForm();
    await loadCategories();
    await loadMenuItems();
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderMenuList();
  });

  await Promise.all([loadCategories(), loadMenuItems()]);
});
