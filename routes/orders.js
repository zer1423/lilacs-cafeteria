const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const {
  parsePositiveInt,
  cleanText,
  isValidPhone,
  isValidEmail,
  isValidPaymentReference,
  parseFutureDatetime
} = require('../middleware/validate');

const router = express.Router();

const VALID_STATUSES = [
  'pending',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'cancelled'
];

const STATUS_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled'],
  picked_up: [],
  cancelled: []
};

async function fetchOrderWithItems(conn, orderId) {
  const [orders] = await conn.query(
    `SELECT order_id, customer_name, order_datetime, status, phone, email, notes,
            subtotal, takeout_fee, total, payment_method, payment_reference, time_of_pickup
     FROM orders
     WHERE order_id = ?`,
    [orderId]
  );
  if (orders.length === 0) return null;

  const [items] = await conn.query(
    `SELECT oi.order_item_id, oi.item_id, oi.quantity, oi.unit_price,
            m.name, c.display_name AS category, c.has_takeout_fee
     FROM order_item oi
     JOIN menu_item m USING (item_id)
     JOIN category c USING (category_id)
     WHERE oi.order_id = ?
     ORDER BY oi.order_item_id`,
    [orderId]
  );

  return { ...orders[0], items };
}

async function recalcOrderTotals(conn, orderId) {
  const [bizRows] = await conn.query(
    'SELECT takeout_fee_per_meal FROM business_info WHERE business_id = 1'
  );
  const feePerMeal = bizRows.length > 0 ? Number(bizRows[0].takeout_fee_per_meal) : 0;

  const [totals] = await conn.query(
    `SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS subtotal,
            COALESCE(SUM(CASE WHEN c.has_takeout_fee THEN oi.quantity ELSE 0 END), 0) * ? AS takeout_fee
     FROM order_item oi
     JOIN menu_item m USING (item_id)
     JOIN category c USING (category_id)
     WHERE oi.order_id = ?`,
    [feePerMeal, orderId]
  );

  const subtotal = Number(Number(totals[0].subtotal).toFixed(2));
  const takeoutFee = Number(Number(totals[0].takeout_fee).toFixed(2));
  const total = Number((subtotal + takeoutFee).toFixed(2));

  await conn.query(
    'UPDATE orders SET subtotal = ?, takeout_fee = ?, total = ? WHERE order_id = ?',
    [subtotal, takeoutFee, total, orderId]
  );
}

// POST /api/orders (public)
router.post('/', async (req, res) => {
  const customerName = cleanText(req.body.customer_name);
  const phone = cleanText(req.body.phone);
  const email = req.body.email ? cleanText(req.body.email) : null;
  const notes = req.body.notes ? cleanText(req.body.notes) : null;
  const paymentRef = cleanText(req.body.payment_reference);
  const pickupDatetime = parseFutureDatetime(req.body.time_of_pickup);
  const rawItems = req.body.items;

  if (!customerName || customerName.length > 100) {
    return res.status(400).json({ error: 'Customer name is required (max 100 characters).' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Please enter a valid mobile/phone number.' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (notes && notes.length > 255) {
    return res.status(400).json({ error: 'Notes must be at most 255 characters.' });
  }
  if (!isValidPaymentReference(paymentRef)) {
    return res.status(400).json({
      error: 'Payment reference number must be 6 to 30 letters or digits.'
    });
  }
  if (pickupDatetime === null) {
    return res.status(400).json({ error: 'Valid pickup time is required.' });
  }
  if (pickupDatetime === 'past') {
    return res.status(400).json({ error: 'Pickup time must be in the future.' });
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item.' });
  }

  const parsedItems = [];
  const seenItemIds = new Set();
  for (const entry of rawItems) {
    const itemId = parsePositiveInt(entry && entry.item_id);
    const quantity = parsePositiveInt(entry && entry.quantity);
    if (!itemId || !quantity) {
      return res.status(400).json({
        error: 'Each order item must have a valid item_id and quantity of at least 1.'
      });
    }
    if (seenItemIds.has(itemId)) {
      return res.status(400).json({
        error: 'Duplicate menu item in order. Increase quantity instead.'
      });
    }
    seenItemIds.add(itemId);
    parsedItems.push({ item_id: itemId, quantity });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [bizRows] = await conn.query(
      'SELECT takeout_fee_per_meal FROM business_info WHERE business_id = 1'
    );
    if (bizRows.length === 0) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Online ordering is currently unavailable because business info is not configured.'
      });
    }
    const feePerMeal = Number(bizRows[0].takeout_fee_per_meal);

    const itemIds = parsedItems.map((i) => i.item_id);
    const placeholders = itemIds.map(() => '?').join(',');
    const [menuRows] = await conn.query(
      `SELECT m.item_id, m.name, m.price, m.is_available, c.has_takeout_fee
       FROM menu_item m
       JOIN category c USING (category_id)
       WHERE m.item_id IN (${placeholders})`,
      itemIds
    );

    const menuMap = new Map(menuRows.map((row) => [row.item_id, row]));
    let subtotal = 0;
    let mealUnits = 0;

    for (const item of parsedItems) {
      const dbItem = menuMap.get(item.item_id);
      if (!dbItem) {
        await conn.rollback();
        return res.status(400).json({ error: `Menu item #${item.item_id} does not exist.` });
      }
      if (!dbItem.is_available) {
        await conn.rollback();
        return res.status(400).json({ error: `"${dbItem.name}" is currently unavailable.` });
      }
      const unitPrice = Number(dbItem.price);
      subtotal += unitPrice * item.quantity;
      if (dbItem.has_takeout_fee) {
        mealUnits += item.quantity;
      }
      item.unit_price = unitPrice;
    }

    subtotal = Number(subtotal.toFixed(2));
    const takeoutFee = Number((mealUnits * feePerMeal).toFixed(2));
    const total = Number((subtotal + takeoutFee).toFixed(2));

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (customer_name, phone, email, notes, subtotal, takeout_fee, total, payment_reference, time_of_pickup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerName,
        phone,
        email || null,
        notes || null,
        subtotal,
        takeoutFee,
        total,
        paymentRef,
        pickupDatetime
      ]
    );

    const orderId = orderResult.insertId;
    for (const item of parsedItems) {
      await conn.query(
        'INSERT INTO order_item (item_id, order_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [item.item_id, orderId, item.quantity, item.unit_price]
      );
    }

    await conn.commit();
    const created = await fetchOrderWithItems(conn, orderId);
    return res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'This payment reference number has already been used for another order.'
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/orders (admin)
router.get('/', requireAdmin, async (req, res) => {
  const statusFilter = req.query.status ? cleanText(req.query.status) : '';
  if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
    return res.status(400).json({ error: 'Invalid status filter.' });
  }

  try {
    const query = statusFilter
      ? `SELECT order_id, customer_name, order_datetime, status, phone, email, notes,
                subtotal, takeout_fee, total, payment_method, payment_reference, time_of_pickup
         FROM orders WHERE status = ? ORDER BY order_datetime DESC, order_id DESC`
      : `SELECT order_id, customer_name, order_datetime, status, phone, email, notes,
                subtotal, takeout_fee, total, payment_method, payment_reference, time_of_pickup
         FROM orders ORDER BY order_datetime DESC, order_id DESC`;

    const params = statusFilter ? [statusFilter] : [];
    const [orders] = await pool.query(query, params);

    if (orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map((o) => o.order_id);
    const placeholders = orderIds.map(() => '?').join(',');
    const [allItems] = await pool.query(
      `SELECT oi.order_item_id, oi.order_id, oi.item_id, oi.quantity, oi.unit_price,
              m.name
       FROM order_item oi
       JOIN menu_item m USING (item_id)
       WHERE oi.order_id IN (${placeholders})
       ORDER BY oi.order_item_id`,
      orderIds
    );

    const itemsByOrder = new Map();
    for (const item of allItems) {
      if (!itemsByOrder.has(item.order_id)) {
        itemsByOrder.set(item.order_id, []);
      }
      itemsByOrder.get(item.order_id).push(item);
    }

    const result = orders.map((o) => ({
      ...o,
      items: itemsByOrder.get(o.order_id) || []
    }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orders/:id (admin)
router.get('/:id', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  try {
    const order = await fetchOrderWithItems(pool, orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.json(order);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/orders/:id (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_id = ?', [orderId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const existing = rows[0];

    const detailFields = [
      'customer_name',
      'phone',
      'email',
      'notes',
      'time_of_pickup',
      'payment_reference'
    ];
    const hasDetailEdit = detailFields.some((f) => req.body[f] !== undefined);

    if (hasDetailEdit && existing.status !== 'pending') {
      return res.status(409).json({
        error: 'Customer details and pickup time can only be edited while the order is pending.'
      });
    }

    let nextStatus = existing.status;
    if (req.body.status !== undefined) {
      const requestedStatus = cleanText(req.body.status);
      if (!VALID_STATUSES.includes(requestedStatus)) {
        return res.status(400).json({ error: 'Invalid order status.' });
      }
      if (
        requestedStatus !== existing.status &&
        !STATUS_TRANSITIONS[existing.status].includes(requestedStatus)
      ) {
        return res.status(409).json({
          error: `Cannot move order from "${existing.status}" to "${requestedStatus}".`
        });
      }
      nextStatus = requestedStatus;
    }

    const customerName =
      req.body.customer_name !== undefined ? cleanText(req.body.customer_name) : existing.customer_name;
    const phone = req.body.phone !== undefined ? cleanText(req.body.phone) : existing.phone;
    const email =
      req.body.email !== undefined
        ? req.body.email
          ? cleanText(req.body.email)
          : null
        : existing.email;
    const notes =
      req.body.notes !== undefined
        ? req.body.notes
          ? cleanText(req.body.notes)
          : null
        : existing.notes;
    const paymentRef =
      req.body.payment_reference !== undefined
        ? cleanText(req.body.payment_reference)
        : existing.payment_reference;

    let pickupTime = existing.time_of_pickup;
    if (req.body.time_of_pickup !== undefined) {
      const parsedPickup = parseFutureDatetime(req.body.time_of_pickup);
      if (parsedPickup === null) {
        return res.status(400).json({ error: 'Invalid pickup time.' });
      }
      if (parsedPickup === 'past') {
        return res.status(400).json({ error: 'Pickup time must be in the future.' });
      }
      pickupTime = parsedPickup;
    }

    if (hasDetailEdit) {
      if (!customerName || customerName.length > 100) {
        return res.status(400).json({ error: 'Customer name is required (max 100 characters).' });
      }
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: 'Valid phone number is required.' });
      }
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Valid email address is required.' });
      }
      if (notes && notes.length > 255) {
        return res.status(400).json({ error: 'Notes must be at most 255 characters.' });
      }
      if (!isValidPaymentReference(paymentRef)) {
        return res.status(400).json({
          error: 'Payment reference must be 6 to 30 letters or digits.'
        });
      }
    }

    await pool.query(
      `UPDATE orders
       SET customer_name = ?, phone = ?, email = ?, notes = ?,
           payment_reference = ?, time_of_pickup = ?, status = ?
       WHERE order_id = ?`,
      [customerName, phone, email, notes, paymentRef, pickupTime, nextStatus, orderId]
    );

    const updated = await fetchOrderWithItems(pool, orderId);
    return res.json(updated);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'This payment reference number is already used by another order.'
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/orders/:id (admin, cancelled orders only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (rows[0].status !== 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ error: 'Only cancelled orders can be deleted.' });
    }

    await conn.query('DELETE FROM order_item WHERE order_id = ?', [orderId]);
    await conn.query('DELETE FROM orders WHERE order_id = ?', [orderId]);
    await conn.commit();
    return res.json({ message: 'Cancelled order deleted.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/orders/:id/items (admin)
router.get('/:id/items', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  try {
    const [orderRows] = await pool.query('SELECT order_id FROM orders WHERE order_id = ?', [orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const [items] = await pool.query(
      `SELECT oi.order_item_id, oi.item_id, oi.quantity, oi.unit_price, m.name
       FROM order_item oi
       JOIN menu_item m USING (item_id)
       WHERE oi.order_id = ?
       ORDER BY oi.order_item_id`,
      [orderId]
    );
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orders/:id/items (admin, pending orders only)
router.post('/:id/items', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const itemId = parsePositiveInt(req.body.item_id);
  const quantity = parsePositiveInt(req.body.quantity);

  if (!orderId || !itemId || !quantity) {
    return res.status(400).json({ error: 'Valid order id, item_id, and quantity (>= 1) are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    if (orderRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (orderRows[0].status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'Items can only be added to pending orders.' });
    }

    const [menuRows] = await conn.query(
      'SELECT item_id, price, is_available FROM menu_item WHERE item_id = ?',
      [itemId]
    );
    if (menuRows.length === 0 || !menuRows[0].is_available) {
      await conn.rollback();
      return res.status(400).json({ error: 'Menu item does not exist or is unavailable.' });
    }

    await conn.query(
      'INSERT INTO order_item (item_id, order_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
      [itemId, orderId, quantity, menuRows[0].price]
    );

    await recalcOrderTotals(conn, orderId);
    await conn.commit();
    const updated = await fetchOrderWithItems(conn, orderId);
    return res.status(201).json(updated);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Item is already in this order. Update its quantity instead.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id/items/:itemId (admin, pending orders only)
router.put('/:id/items/:itemId', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const itemId = parsePositiveInt(req.params.itemId);
  const quantity = parsePositiveInt(req.body.quantity);

  if (!orderId || !itemId || !quantity) {
    return res.status(400).json({ error: 'Valid order id, item id, and quantity (>= 1) are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    if (orderRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (orderRows[0].status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'Item quantities can only be edited on pending orders.' });
    }

    const [result] = await conn.query(
      'UPDATE order_item SET quantity = ? WHERE order_id = ? AND item_id = ?',
      [quantity, orderId, itemId]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order item not found in this order.' });
    }

    await recalcOrderTotals(conn, orderId);
    await conn.commit();
    const updated = await fetchOrderWithItems(conn, orderId);
    return res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/orders/:id/items/:itemId (admin, pending orders only, cannot delete last item)
router.delete('/:id/items/:itemId', requireAdmin, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const itemId = parsePositiveInt(req.params.itemId);

  if (!orderId || !itemId) {
    return res.status(400).json({ error: 'Invalid order id or item id.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    if (orderRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (orderRows[0].status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'Items can only be removed from pending orders.' });
    }

    const [existingItem] = await conn.query(
      'SELECT order_item_id FROM order_item WHERE order_id = ? AND item_id = ?',
      [orderId, itemId]
    );
    if (existingItem.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order item not found in this order.' });
    }

    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM order_item WHERE order_id = ?',
      [orderId]
    );
    if (countRows[0].cnt <= 1) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Cannot remove the last item from an order. Cancel the order instead.'
      });
    }

    await conn.query('DELETE FROM order_item WHERE order_id = ? AND item_id = ?', [orderId, itemId]);
    await recalcOrderTotals(conn, orderId);
    await conn.commit();
    const updated = await fetchOrderWithItems(conn, orderId);
    return res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

module.exports = router;
