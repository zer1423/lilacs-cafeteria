document.addEventListener('DOMContentLoaded', async () => {
  const admin = await window.AdminCommon.requireAdminSession();
  if (!admin) return;
  window.AdminCommon.setupLogout();

  const { escapeHtml, formatPeso } = window.AdminCommon;
  const ordersGrid = document.getElementById('ordersGrid');
  const statusFilterBar = document.getElementById('statusFilterBar');
  const searchInput = document.getElementById('orderSearchInput');
  const feedbackEl = document.getElementById('ordersFeedback');

  const detailModalEl = document.getElementById('orderDetailModal');
  const detailModal = new bootstrap.Modal(detailModalEl);
  const deleteModalEl = document.getElementById('deleteOrderModal');
  const deleteModal = new bootstrap.Modal(deleteModalEl);

  let allOrders = [];
  let availableMenu = [];
  let currentStatus = '';
  let searchQuery = '';
  let activeOrder = null;
  let pendingDeleteId = null;

  const STATUS_LABELS = {
    pending: 'Pending',
    preparing: 'Preparing',
    ready_for_pickup: 'Ready for Pickup',
    picked_up: 'Complete',
    cancelled: 'Cancelled'
  };

  function showFeedback(message, type = 'success') {
    feedbackEl.className = `alert alert-${type} mb-3`;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('d-none');
    setTimeout(() => feedbackEl.classList.add('d-none'), 4000);
  }

  function showModalError(msg) {
    const el = document.getElementById('modalOrderError');
    if (!msg) {
      el.classList.add('d-none');
      return;
    }
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function formatPickupShort(val) {
    const dt = new Date(String(val).replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return val;
    return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function toDatetimeLocalValue(val) {
    const dt = new Date(String(val).replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  async function loadOrders() {
    const url = currentStatus ? `/api/orders?status=${encodeURIComponent(currentStatus)}` : '/api/orders';
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = '/admin/login.html';
      return;
    }
    allOrders = await res.json();
    renderOrders();
  }

  async function loadMenuForDropdown() {
    const res = await fetch('/api/menu');
    if (res.ok) {
      availableMenu = await res.json();
      const select = document.getElementById('addOrderItemSelect');
      select.innerHTML = availableMenu
        .map((m) => `<option value="${m.item_id}">${escapeHtml(m.name)} (${formatPeso(m.price)})</option>`)
        .join('');
    }
  }

  function renderOrders() {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allOrders.filter((o) => {
      if (!q) return true;
      return (
        String(o.order_id).includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.payment_reference || '').toLowerCase().includes(q) ||
        (o.phone || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      ordersGrid.innerHTML =
        '<div class="col-12"><div class="alert alert-light border text-center py-4">No orders match this filter.</div></div>';
      return;
    }

    ordersGrid.innerHTML = filtered
      .map((order) => {
        const itemsHtml = (order.items || [])
          .map((i) => `<div class="fw-semibold">${i.quantity}x ${escapeHtml(i.name)}</div>`)
          .join('');

        let primaryAction = '';
        if (order.status === 'pending') {
          primaryAction = `<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-status-move="${order.order_id}" data-next="preparing">Start Prep</button>`;
        } else if (order.status === 'preparing') {
          primaryAction = `<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-status-move="${order.order_id}" data-next="ready_for_pickup">Mark as Ready</button>`;
        } else if (order.status === 'ready_for_pickup') {
          primaryAction = `<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-status-move="${order.order_id}" data-next="picked_up">Mark as Complete</button>`;
        } else if (order.status === 'cancelled') {
          primaryAction = `<button type="button" class="btn btn-danger btn-sm rounded-pill px-3" data-delete-order="${order.order_id}">Delete</button>`;
        }

        return `
          <div class="col-12 col-md-6 col-xl-4">
            <div class="admin-order-card">
              <div class="admin-order-card-head">
                <div>
                  <span class="fw-bold fs-5">#${order.order_id}</span>
                  <span class="status-badge status-${escapeHtml(order.status)} ms-2">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
                </div>
                <span class="fw-semibold text-muted">${escapeHtml(formatPickupShort(order.time_of_pickup))}</span>
              </div>
              <div class="admin-order-card-body">
                <div class="small text-muted mb-1">
                  <strong>${escapeHtml(order.customer_name)}</strong> • ${escapeHtml(order.phone)}
                </div>
                <div class="mb-2">
                  <span class="badge bg-dark">QR Ref: ${escapeHtml(order.payment_reference)}</span>
                </div>
                <div class="small mb-2">${itemsHtml}</div>
                <div class="fw-bold" style="color: var(--lilac-dark);">Total: ${formatPeso(order.total)}</div>
              </div>
              <div class="admin-order-card-foot border-top">
                <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill px-3" data-view-order="${order.order_id}">
                  View / Edit
                </button>
                ${primaryAction}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    ordersGrid.querySelectorAll('[data-view-order]').forEach((btn) => {
      btn.addEventListener('click', () => openOrderModal(Number(btn.getAttribute('data-view-order'))));
    });

    ordersGrid.querySelectorAll('[data-status-move]').forEach((btn) => {
      btn.addEventListener('click', () =>
        updateOrderStatus(Number(btn.getAttribute('data-status-move')), btn.getAttribute('data-next'))
      );
    });

    ordersGrid.querySelectorAll('[data-delete-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteId = Number(btn.getAttribute('data-delete-order'));
        document.getElementById('deleteOrderPrompt').textContent =
          `Are you sure you want to delete cancelled Order #${pendingDeleteId}?`;
        deleteModal.show();
      });
    });
  }

  async function updateOrderStatus(orderId, nextStatus) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) {
        showFeedback(data.error || 'Could not update status.', 'danger');
        return;
      }
      showFeedback(`Order #${orderId} updated to ${STATUS_LABELS[nextStatus] || nextStatus}.`);
      await loadOrders();
      if (activeOrder && activeOrder.order_id === orderId) {
        activeOrder = data;
        populateOrderModal();
      }
    } catch {
      showFeedback('Network error updating status.', 'danger');
    }
  }

  async function openOrderModal(orderId) {
    showModalError('');
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) {
      showFeedback('Order could not be loaded.', 'danger');
      return;
    }
    activeOrder = await res.json();
    populateOrderModal();
    detailModal.show();
  }

  function populateOrderModal() {
    if (!activeOrder) return;
    const isPending = activeOrder.status === 'pending';

    document.getElementById('modalOrderTitle').textContent = `Order #${activeOrder.order_id}`;
    const badge = document.getElementById('modalOrderStatusBadge');
    badge.className = `status-badge status-${activeOrder.status}`;
    badge.textContent = STATUS_LABELS[activeOrder.status] || activeOrder.status;
    document.getElementById('modalOrderRefDisplay').textContent = activeOrder.payment_reference;

    const fields = [
      ['editCustomerName', activeOrder.customer_name || ''],
      ['editPhone', activeOrder.phone || ''],
      ['editEmail', activeOrder.email || ''],
      ['editPaymentRef', activeOrder.payment_reference || ''],
      ['editPickupTime', toDatetimeLocalValue(activeOrder.time_of_pickup)],
      ['editNotes', activeOrder.notes || '']
    ];
    for (const [id, val] of fields) {
      const el = document.getElementById(id);
      el.value = val;
      el.disabled = !isPending;
    }
    document.getElementById('saveOrderDetailsBtn').classList.toggle('d-none', !isPending);
    document.getElementById('addOrderItemRow').classList.toggle('d-none', !isPending);

    const tbody = document.getElementById('modalOrderItemsBody');
    tbody.innerHTML = (activeOrder.items || [])
      .map((item) => {
        const lineTotal = Number(item.unit_price) * Number(item.quantity);
        return `
          <tr>
            <td class="fw-semibold">${escapeHtml(item.name)}</td>
            <td>
              ${
                isPending
                  ? `<div class="input-group input-group-sm">
                       <input type="number" class="form-control" min="1" value="${item.quantity}" data-item-qty="${item.item_id}">
                       <button class="btn btn-outline-secondary" type="button" data-save-qty="${item.item_id}">Set</button>
                     </div>`
                  : item.quantity
              }
            </td>
            <td class="text-end">${formatPeso(item.unit_price)}</td>
            <td class="text-end fw-semibold">${formatPeso(lineTotal)}</td>
            <td class="text-end">
              ${
                isPending
                  ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" data-remove-order-item="${item.item_id}" title="Remove item"><i class="bi bi-trash"></i></button>`
                  : ''
              }
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('[data-save-qty]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showModalError('');
        const itemId = Number(btn.getAttribute('data-save-qty'));
        const qtyInput = tbody.querySelector(`[data-item-qty="${itemId}"]`);
        const quantity = Number(qtyInput.value);
        const res = await fetch(`/api/orders/${activeOrder.order_id}/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity })
        });
        const data = await res.json();
        if (!res.ok) {
          showModalError(data.error || 'Could not update quantity.');
          return;
        }
        activeOrder = data;
        populateOrderModal();
        await loadOrders();
      });
    });

    tbody.querySelectorAll('[data-remove-order-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showModalError('');
        const itemId = Number(btn.getAttribute('data-remove-order-item'));
        const res = await fetch(`/api/orders/${activeOrder.order_id}/items/${itemId}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) {
          showModalError(data.error || 'Could not remove item.');
          return;
        }
        activeOrder = data;
        populateOrderModal();
        await loadOrders();
      });
    });

    document.getElementById('modalSubtotal').textContent = formatPeso(activeOrder.subtotal);
    document.getElementById('modalTakeoutFee').textContent = formatPeso(activeOrder.takeout_fee);
    document.getElementById('modalTotal').textContent = formatPeso(activeOrder.total);

    const actionsEl = document.getElementById('modalStatusActions');
    const btns = [];
    if (activeOrder.status === 'pending') {
      btns.push(`<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-modal-status="preparing">Start Prep</button>`);
    } else if (activeOrder.status === 'preparing') {
      btns.push(`<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-modal-status="ready_for_pickup">Mark as Ready</button>`);
    } else if (activeOrder.status === 'ready_for_pickup') {
      btns.push(`<button type="button" class="btn btn-admin-lilac btn-sm px-3" data-modal-status="picked_up">Mark as Complete</button>`);
    }

    if (activeOrder.status !== 'picked_up' && activeOrder.status !== 'cancelled') {
      btns.push(`<button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3" data-modal-status="cancelled">Cancel Order</button>`);
    }

    if (activeOrder.status === 'cancelled') {
      btns.push(`<button type="button" class="btn btn-danger btn-sm rounded-pill px-3" id="modalDeleteOrderBtn">Delete Cancelled Order</button>`);
    }

    actionsEl.innerHTML = btns.join('');
    actionsEl.querySelectorAll('[data-modal-status]').forEach((b) => {
      b.addEventListener('click', () => updateOrderStatus(activeOrder.order_id, b.getAttribute('data-modal-status')));
    });

    const delBtn = document.getElementById('modalDeleteOrderBtn');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        pendingDeleteId = activeOrder.order_id;
        detailModal.hide();
        document.getElementById('deleteOrderPrompt').textContent =
          `Are you sure you want to delete cancelled Order #${pendingDeleteId}?`;
        deleteModal.show();
      });
    }
  }

  document.getElementById('orderDetailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeOrder) return;
    showModalError('');

    const payload = {
      customer_name: document.getElementById('editCustomerName').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      email: document.getElementById('editEmail').value.trim() || null,
      payment_reference: document.getElementById('editPaymentRef').value.trim(),
      time_of_pickup: document.getElementById('editPickupTime').value,
      notes: document.getElementById('editNotes').value.trim() || null
    };

    const res = await fetch(`/api/orders/${activeOrder.order_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showModalError(data.error || 'Could not save order changes.');
      return;
    }

    activeOrder = data;
    populateOrderModal();
    await loadOrders();
    showFeedback(`Order #${activeOrder.order_id} details updated.`);
  });

  document.getElementById('addOrderItemBtn').addEventListener('click', async () => {
    if (!activeOrder) return;
    showModalError('');
    const itemId = Number(document.getElementById('addOrderItemSelect').value);
    const quantity = Number(document.getElementById('addOrderItemQty').value);

    const res = await fetch(`/api/orders/${activeOrder.order_id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, quantity })
    });
    const data = await res.json();
    if (!res.ok) {
      showModalError(data.error || 'Could not add item.');
      return;
    }

    activeOrder = data;
    populateOrderModal();
    await loadOrders();
  });

  document.getElementById('confirmDeleteOrderBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const res = await fetch(`/api/orders/${pendingDeleteId}`, { method: 'DELETE' });
    const data = await res.json();
    deleteModal.hide();
    if (!res.ok) {
      showFeedback(data.error || 'Could not delete order.', 'danger');
      return;
    }
    showFeedback(`Order #${pendingDeleteId} deleted.`);
    pendingDeleteId = null;
    await loadOrders();
  });

  statusFilterBar.querySelectorAll('.admin-filter-pill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      statusFilterBar.querySelectorAll('.admin-filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatus = btn.getAttribute('data-status');
      await loadOrders();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderOrders();
  });

  await Promise.all([loadMenuForDropdown(), loadOrders()]);
});
