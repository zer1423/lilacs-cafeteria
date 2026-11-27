(function () {
  const STORAGE_KEY = 'lilacs_cart_v1';

  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('lilacs:cart-updated', { detail: items }));
  }

  function addItem(item) {
    const items = readCart();
    const existing = items.find((i) => Number(i.item_id) === Number(item.item_id));
    if (existing) {
      existing.quantity += 1;
      existing.name = item.name;
      existing.price = Number(item.price);
      existing.image_url = item.image_url || null;
      existing.has_takeout_fee = Boolean(item.has_takeout_fee);
    } else {
      items.push({
        item_id: Number(item.item_id),
        name: item.name,
        price: Number(item.price),
        image_url: item.image_url || null,
        has_takeout_fee: Boolean(item.has_takeout_fee),
        quantity: 1
      });
    }
    writeCart(items);
    return items;
  }

  function updateQuantity(itemId, deltaOrQty, isAbsolute = false) {
    const items = readCart();
    const idx = items.findIndex((i) => Number(i.item_id) === Number(itemId));
    if (idx === -1) return items;

    const nextQty = isAbsolute ? Number(deltaOrQty) : items[idx].quantity + Number(deltaOrQty);
    if (nextQty <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx].quantity = nextQty;
    }
    writeCart(items);
    return items;
  }

  function removeItem(itemId) {
    const items = readCart().filter((i) => Number(i.item_id) !== Number(itemId));
    writeCart(items);
    return items;
  }

  function clearCart() {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('lilacs:cart-updated', { detail: [] }));
  }

  function syncWithMenu(menuItems) {
    const menuMap = new Map(menuItems.map((m) => [Number(m.item_id), m]));
    const current = readCart();
    let changed = false;
    const synced = [];

    for (const entry of current) {
      const fresh = menuMap.get(Number(entry.item_id));
      if (!fresh) {
        changed = true;
        continue;
      }
      synced.push({
        item_id: Number(fresh.item_id),
        name: fresh.name,
        price: Number(fresh.price),
        image_url: fresh.image_url || null,
        has_takeout_fee: Boolean(fresh.has_takeout_fee),
        quantity: Number(entry.quantity) || 1
      });
      if (
        entry.name !== fresh.name ||
        Number(entry.price) !== Number(fresh.price) ||
        Boolean(entry.has_takeout_fee) !== Boolean(fresh.has_takeout_fee) ||
        (entry.image_url || null) !== (fresh.image_url || null)
      ) {
        changed = true;
      }
    }

    if (changed) {
      writeCart(synced);
    }
    return synced;
  }

  function computeTotals(feePerMeal) {
    const items = readCart();
    const rate = Number(feePerMeal) || 0;
    let subtotal = 0;
    let mealCount = 0;
    let totalCount = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      subtotal += Number(item.price) * qty;
      totalCount += qty;
      if (item.has_takeout_fee) {
        mealCount += qty;
      }
    }

    subtotal = Number(subtotal.toFixed(2));
    const takeoutFee = Number((mealCount * rate).toFixed(2));
    const total = Number((subtotal + takeoutFee).toFixed(2));
    return { items, subtotal, takeoutFee, total, mealCount, totalCount };
  }

  function formatPeso(amount) {
    return '₱' + Number(amount || 0).toFixed(2);
  }

  window.LilacsCart = {
    getItems: readCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    syncWithMenu,
    computeTotals,
    formatPeso
  };
})();
