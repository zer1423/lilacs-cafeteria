document.addEventListener('DOMContentLoaded', () => {
  const menuContainer = document.getElementById('menuContainer');
  const categoryChipsEl = document.getElementById('categoryChips');
  const searchInput = document.getElementById('menuSearchInput');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartSubtotalEl = document.getElementById('cartSubtotal');
  const cartTakeoutFeeEl = document.getElementById('cartTakeoutFee');
  const cartTotalEl = document.getElementById('cartTotal');
  const takeoutRateNoteEl = document.getElementById('takeoutRateNote');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const clearCartBtn = document.getElementById('clearCartBtn');
  const mobileCartBar = document.getElementById('mobileCartBar');
  const mobileCartCount = document.getElementById('mobileCartCount');
  const mobileCartTotal = document.getElementById('mobileCartTotal');
  const unavailableAlert = document.getElementById('orderingUnavailableAlert');

  let allItems = [];
  let activeCategory = 'all';
  let searchTerm = '';
  let feePerMeal = 10;
  let orderingEnabled = true;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCategoryChips() {
    const categories = [];
    const seen = new Set();
    for (const item of allItems) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        categories.push(item.category);
      }
    }

    const chips = [
      `<button type="button" class="category-chip ${activeCategory === 'all' ? 'active' : ''}" data-category="all">All</button>`,
      ...categories.map(
        (cat) =>
          `<button type="button" class="category-chip ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
      )
    ];

    categoryChipsEl.innerHTML = chips.join('');
    categoryChipsEl.querySelectorAll('.category-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-category');
        renderCategoryChips();
        renderMenu();
      });
    });
  }

  function renderMenu() {
    const query = searchTerm.trim().toLowerCase();
    const filtered = allItems.filter((item) => {
      const matchCategory = activeCategory === 'all' || item.category === activeCategory;
      const matchQuery =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        item.category.toLowerCase().includes(query);
      return matchCategory && matchQuery;
    });

    if (filtered.length === 0) {
      menuContainer.innerHTML = `
        <div class="alert alert-light border text-center py-4">
          <i class="bi bi-search fs-3 d-block mb-2 text-muted"></i>
          No menu items matched your search.
        </div>`;
      return;
    }

    const grouped = new Map();
    for (const item of filtered) {
      if (!grouped.has(item.category)) {
        grouped.set(item.category, {
          hasTakeoutFee: Boolean(item.has_takeout_fee),
          items: []
        });
      }
      grouped.get(item.category).items.push(item);
    }

    let html = '';
    for (const [categoryName, group] of grouped.entries()) {
      const feeNote = group.hasTakeoutFee
        ? `+₱${feePerMeal.toFixed(0)} takeout fee/meal`
        : 'No takeout fee';

      html += `
        <section class="menu-category-block">
          <div class="menu-category-header">
            <h2 class="menu-category-title">${escapeHtml(categoryName)}</h2>
            <span class="menu-category-badge">${feeNote}</span>
          </div>
          <div class="row g-3">
      `;

      for (const item of group.items) {
        const imgSrc = item.image_url || '/images/lilac_logo.jpg';
        const isFallback = !item.image_url;
        html += `
          <div class="col-12 col-md-6">
            <div class="menu-item-card">
              <div class="menu-item-info">
                <h3 class="menu-item-name">${escapeHtml(item.name)}</h3>
                ${item.description ? `<p class="menu-item-desc">${escapeHtml(item.description)}</p>` : ''}
                <p class="menu-item-price">₱${Number(item.price).toFixed(2)}</p>
              </div>
              <div class="menu-item-media">
                <img
                  src="${escapeHtml(imgSrc)}"
                  alt="${escapeHtml(item.name)}"
                  class="menu-item-img ${isFallback ? 'is-fallback' : ''}"
                  loading="lazy"
                  onerror="this.onerror=null;this.src='/images/lilac_logo.jpg';this.classList.add('is-fallback');"
                >
                <button
                  type="button"
                  class="menu-add-btn"
                  data-add-id="${item.item_id}"
                  aria-label="Add ${escapeHtml(item.name)} to cart"
                  ${orderingEnabled ? '' : 'disabled'}
                >
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }

      html += '</div></section>';
    }

    menuContainer.innerHTML = html;

    menuContainer.querySelectorAll('[data-add-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-add-id'));
        const item = allItems.find((i) => Number(i.item_id) === id);
        if (!item) return;
        window.LilacsCart.addItem(item);
        renderCart();
      });
    });
  }

  function renderCart() {
    const { items, subtotal, takeoutFee, total, totalCount } =
      window.LilacsCart.computeTotals(feePerMeal);

    if (items.length === 0) {
      cartItemsList.innerHTML =
        '<p class="text-muted text-center py-4 mb-0">Your cart is empty. Tap <b>+</b> on any item to add it.</p>';
      clearCartBtn.classList.add('d-none');
      mobileCartBar.classList.add('d-none');
      checkoutBtn.disabled = true;
    } else {
      clearCartBtn.classList.remove('d-none');
      mobileCartBar.classList.remove('d-none');
      mobileCartCount.textContent = totalCount;
      mobileCartTotal.textContent = window.LilacsCart.formatPeso(total);
      checkoutBtn.disabled = !orderingEnabled;

      cartItemsList.innerHTML = items
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
                <div class="fw-semibold text-truncate" style="font-size:0.92rem;">${escapeHtml(item.name)}</div>
                <div class="text-muted" style="font-size:0.82rem;">₱${lineTotal.toFixed(2)}</div>
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

      cartItemsList.querySelectorAll('[data-qty-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-qty-id'));
          const delta = Number(btn.getAttribute('data-delta'));
          window.LilacsCart.updateQuantity(id, delta, false);
          renderCart();
        });
      });

      cartItemsList.querySelectorAll('[data-remove-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-remove-id'));
          window.LilacsCart.removeItem(id);
          renderCart();
        });
      });
    }

    cartSubtotalEl.textContent = window.LilacsCart.formatPeso(subtotal);
    cartTakeoutFeeEl.textContent = window.LilacsCart.formatPeso(takeoutFee);
    cartTotalEl.textContent = window.LilacsCart.formatPeso(total);
    takeoutRateNoteEl.textContent = `(₱${feePerMeal.toFixed(0)}/meal)`;
  }

  document.addEventListener('lilacs:business-loaded', (e) => {
    const biz = e.detail;
    if (!biz) {
      orderingEnabled = false;
      feePerMeal = 0;
      unavailableAlert.classList.remove('d-none');
    } else {
      orderingEnabled = true;
      feePerMeal = Number(biz.takeout_fee_per_meal) || 0;
      unavailableAlert.classList.add('d-none');
    }
    if (allItems.length > 0) renderMenu();
    renderCart();
  });

  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderMenu();
  });

  clearCartBtn.addEventListener('click', () => {
    window.LilacsCart.clearCart();
    renderCart();
  });

  checkoutBtn.addEventListener('click', () => {
    if (!orderingEnabled) return;
    if (window.LilacsCart.getItems().length === 0) return;
    window.location.href = 'order.html';
  });

  async function initMenu() {
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) throw new Error('Failed to load menu');
      allItems = await res.json();
      window.LilacsCart.syncWithMenu(allItems);
      renderCategoryChips();
      renderMenu();
      renderCart();
    } catch (err) {
      console.error(err);
      menuContainer.innerHTML =
        '<div class="alert alert-danger">Unable to load the menu right now. Please try again later.</div>';
    }
  }

  initMenu();
});
