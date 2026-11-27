document.addEventListener('DOMContentLoaded', () => {
  const checkoutUnavailable = document.getElementById('checkoutUnavailable');
  const emptyCartState = document.getElementById('emptyCartState');
  const checkoutGrid = document.getElementById('checkoutGrid');
  const checkoutItemsList = document.getElementById('checkoutItemsList');
  const checkoutSubtotal = document.getElementById('checkoutSubtotal');
  const checkoutTakeoutFee = document.getElementById('checkoutTakeoutFee');
  const checkoutTotal = document.getElementById('checkoutTotal');
  const checkoutRateNote = document.getElementById('checkoutRateNote');
  const qrPayAmount = document.getElementById('qrPayAmount');
  const pickupDisplayText = document.getElementById('pickupDisplayText');
  const pickupDayLabel = document.getElementById('pickupDayLabel');
  const timeSlotList = document.getElementById('timeSlotList');
  const confirmPickupTimeBtn = document.getElementById('confirmPickupTimeBtn');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutError = document.getElementById('checkoutError');
  const confirmCheckoutBtn = document.getElementById('confirmCheckoutBtn');

  let feePerMeal = 10;
  let businessAvailable = true;
  let slots = [];
  let selectedSlotIso = '';
  let draftSlotIso = '';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(dt) {
    return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatWindow(startDt) {
    const endDt = new Date(startDt.getTime() + 10 * 60 * 1000);
    return `Between ${formatTime(startDt)} – ${formatTime(endDt)}`;
  }

  function toLocalDatetimeString(dt) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
  }

  function generatePickupSlots() {
    const now = new Date();
    // Earliest pickup is 20 minutes from now, rounded up to next 30-minute mark
    const minTime = new Date(now.getTime() + 20 * 60 * 1000);

    // Operating hours: Mon 8:30-20:30, Tue-Fri 7:00-21:30, Sat-Sun 8:00-21:30
    function getHoursForDay(dayOfWeek) {
      if (dayOfWeek === 1) return { startMin: 8 * 60 + 30, endMin: 20 * 60 + 30 };
      if (dayOfWeek === 0 || dayOfWeek === 6) return { startMin: 8 * 60, endMin: 21 * 60 + 30 };
      return { startMin: 7 * 60, endMin: 21 * 60 + 30 };
    }

    function buildDaySlots(baseDate) {
      const { startMin, endMin } = getHoursForDay(baseDate.getDay());
      const daySlots = [];
      for (let m = startMin; m <= endMin - 30; m += 30) {
        const dt = new Date(
          baseDate.getFullYear(),
          baseDate.getMonth(),
          baseDate.getDate(),
          Math.floor(m / 60),
          m % 60,
          0,
          0
        );
        if (dt.getTime() > minTime.getTime()) {
          daySlots.push(dt);
        }
      }
      return daySlots;
    }

    let dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let result = buildDaySlots(dayDate);
    let dayLabel = 'Today';

    if (result.length === 0) {
      dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      result = buildDaySlots(dayDate);
      dayLabel = 'Tomorrow';
    }

    pickupDayLabel.textContent = `${dayLabel} (${dayDate.toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })})`;

    slots = result.map((dt) => ({
      value: toLocalDatetimeString(dt),
      date: dt,
      label: formatTime(dt),
      windowLabel: formatWindow(dt),
      dayLabel
    }));

    if (slots.length > 0 && !selectedSlotIso) {
      selectedSlotIso = slots[0].value;
      draftSlotIso = slots[0].value;
    }

    updatePickupDisplay();
    renderTimeSlotList();
  }

  function updatePickupDisplay() {
    const chosen = slots.find((s) => s.value === selectedSlotIso);
    if (!chosen) {
      pickupDisplayText.textContent = 'No pickup slots available';
      return;
    }
    pickupDisplayText.textContent = `${chosen.dayLabel}, ${chosen.windowLabel}`;
  }

  function renderTimeSlotList() {
    timeSlotList.innerHTML = slots
      .map((slot) => {
        const isSelected = slot.value === draftSlotIso;
        return `
          <button type="button" class="time-slot-option ${isSelected ? 'selected' : ''}" data-slot="${escapeHtml(slot.value)}">
            <span>${escapeHtml(slot.label)} <small class="text-muted fw-normal">(${escapeHtml(slot.windowLabel)})</small></span>
            <span class="time-slot-radio">
              ${isSelected ? '<i class="bi bi-check-lg"></i>' : ''}
            </span>
          </button>
        `;
      })
      .join('');

    timeSlotList.querySelectorAll('.time-slot-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        draftSlotIso = btn.getAttribute('data-slot');
        renderTimeSlotList();
      });
    });
  }

  confirmPickupTimeBtn.addEventListener('click', () => {
    selectedSlotIso = draftSlotIso;
    updatePickupDisplay();
    const modalEl = document.getElementById('pickupTimeModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  });

  document.getElementById('pickupTimeModal').addEventListener('show.bs.modal', () => {
    draftSlotIso = selectedSlotIso;
    renderTimeSlotList();
  });

  function renderSummary() {
    if (!businessAvailable) {
      checkoutUnavailable.classList.remove('d-none');
      emptyCartState.classList.add('d-none');
      checkoutGrid.classList.add('d-none');
      return;
    }

    checkoutUnavailable.classList.add('d-none');
    const { items, subtotal, takeoutFee, total } = window.LilacsCart.computeTotals(feePerMeal);

    if (items.length === 0) {
      emptyCartState.classList.remove('d-none');
      checkoutGrid.classList.add('d-none');
      return;
    }

    emptyCartState.classList.add('d-none');
    checkoutGrid.classList.remove('d-none');

    checkoutItemsList.innerHTML = items
      .map((item) => {
        const thumbSrc = item.image_url || '/images/lilac_logo.jpg';
        const isFallback = !item.image_url;
        const lineTotal = Number(item.price) * Number(item.quantity);
        return `
          <div class="cart-item-row">
            <img
              src="${escapeHtml(thumbSrc)}"
              alt="${escapeHtml(item.name)}"
              class="cart-item-thumb ${isFallback ? 'is-fallback' : ''}"
              onerror="this.onerror=null;this.src='/images/lilac_logo.jpg';this.classList.add('is-fallback');"
            >
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold text-truncate" style="font-size:0.95rem;">${escapeHtml(item.name)}</div>
              <div class="text-muted" style="font-size:0.82rem;">₱${Number(item.price).toFixed(2)} each • ₱${lineTotal.toFixed(2)}</div>
            </div>
            <div class="d-flex align-items-center gap-1">
              <button type="button" class="btn btn-sm p-1 text-danger" data-remove-id="${item.item_id}" aria-label="Remove ${escapeHtml(item.name)}">
                <i class="bi bi-trash"></i>
              </button>
              <div class="cart-qty-pill">
                <button type="button" class="cart-qty-btn" data-qty-id="${item.item_id}" data-delta="-1" aria-label="Decrease quantity">-</button>
                <span class="cart-qty-val">${item.quantity}</span>
                <button type="button" class="cart-qty-btn" data-qty-id="${item.item_id}" data-delta="1" aria-label="Increase quantity">+</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    checkoutItemsList.querySelectorAll('[data-qty-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-qty-id'));
        const delta = Number(btn.getAttribute('data-delta'));
        window.LilacsCart.updateQuantity(id, delta, false);
        renderSummary();
      });
    });

    checkoutItemsList.querySelectorAll('[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-remove-id'));
        window.LilacsCart.removeItem(id);
        renderSummary();
      });
    });

    const formattedTotal = window.LilacsCart.formatPeso(total);
    checkoutSubtotal.textContent = window.LilacsCart.formatPeso(subtotal);
    checkoutTakeoutFee.textContent = window.LilacsCart.formatPeso(takeoutFee);
    checkoutTotal.textContent = formattedTotal;
    qrPayAmount.textContent = formattedTotal;
    checkoutRateNote.textContent = `(₱${feePerMeal.toFixed(0)}/meal)`;
  }

  function showError(msg) {
    checkoutError.textContent = msg;
    checkoutError.classList.remove('d-none');
    checkoutError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    checkoutError.classList.add('d-none');

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const paymentReference = document.getElementById('paymentReference').value.trim();

    if (!firstName || !lastName) {
      showError('Please enter both your first name and last name.');
      return;
    }
    if (!phone) {
      showError('Please enter your mobile number.');
      return;
    }
    if (!selectedSlotIso) {
      showError('Please select a pickup time.');
      return;
    }
    if (!/^[A-Za-z0-9]{6,30}$/.test(paymentReference)) {
      showError('Payment reference number must be 6 to 30 letters or digits.');
      return;
    }

    const cartItems = window.LilacsCart.getItems();
    if (cartItems.length === 0) {
      showError('Your cart is empty.');
      return;
    }

    const payload = {
      customer_name: `${firstName} ${lastName}`,
      phone,
      email: email || null,
      notes: notes || null,
      time_of_pickup: selectedSlotIso,
      payment_reference: paymentReference,
      items: cartItems.map((i) => ({ item_id: i.item_id, quantity: i.quantity }))
    };

    confirmCheckoutBtn.disabled = true;
    confirmCheckoutBtn.textContent = 'Placing Order...';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Unable to place order. Please review your details.');
        confirmCheckoutBtn.disabled = false;
        confirmCheckoutBtn.textContent = 'Confirm Checkout';
        return;
      }

      sessionStorage.setItem('lilacs_last_order', JSON.stringify(data));
      window.LilacsCart.clearCart();
      window.location.href = `confirmation.html?order_id=${encodeURIComponent(data.order_id)}`;
    } catch (err) {
      console.error(err);
      showError('Network error while submitting your order. Please try again.');
      confirmCheckoutBtn.disabled = false;
      confirmCheckoutBtn.textContent = 'Confirm Checkout';
    }
  });

  document.addEventListener('lilacs:business-loaded', (e) => {
    const biz = e.detail;
    if (!biz) {
      businessAvailable = false;
      feePerMeal = 0;
    } else {
      businessAvailable = true;
      feePerMeal = Number(biz.takeout_fee_per_meal) || 0;
    }
    renderSummary();
  });

  async function initCheckout() {
    generatePickupSlots();
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        const menuItems = await res.json();
        window.LilacsCart.syncWithMenu(menuItems);
      }
    } catch (err) {
      console.error('Could not refresh menu prices:', err);
    }
    renderSummary();
  }

  initCheckout();
});
