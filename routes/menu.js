const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const {
  parsePositiveInt,
  parseNonNegativeMoney,
  cleanText,
  parseBooleanFlag
} = require('../middleware/validate');

const router = express.Router();

// GET /api/menu (public, available items only)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.item_id, m.name, m.description, m.price, m.image_url,
              c.category_id, c.display_name AS category, c.has_takeout_fee
       FROM menu_item m
       JOIN category c USING (category_id)
       WHERE m.is_available = 1
       ORDER BY c.category_id, m.item_id`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/menu/all (admin, includes unavailable items) - defined before /:id
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.item_id, m.category_id, m.name, m.description, m.price,
              m.image_url, m.is_available, c.display_name AS category, c.has_takeout_fee
       FROM menu_item m
       JOIN category c USING (category_id)
       ORDER BY c.category_id, m.item_id`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/menu/:id (public, available item only)
router.get('/:id', async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid menu item id.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT m.item_id, m.name, m.description, m.price, m.image_url,
              c.category_id, c.display_name AS category, c.has_takeout_fee
       FROM menu_item m
       JOIN category c USING (category_id)
       WHERE m.item_id = ? AND m.is_available = 1`,
      [itemId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/menu (admin)
router.post('/', requireAdmin, async (req, res) => {
  const categoryId = parsePositiveInt(req.body.category_id);
  const name = cleanText(req.body.name);
  const description = req.body.description ? cleanText(req.body.description) : null;
  const price = parseNonNegativeMoney(req.body.price);
  const imageUrl = req.body.image_url ? cleanText(req.body.image_url) : null;
  const isAvailable = req.body.is_available === undefined ? 1 : parseBooleanFlag(req.body.is_available);

  if (!categoryId || !name || name.length > 100 || price === null || isAvailable === null) {
    return res.status(400).json({
      error: 'Valid category_id, name (max 100), non-negative price, and is_available are required.'
    });
  }
  if (imageUrl && imageUrl.length > 255) {
    return res.status(400).json({ error: 'image_url must be at most 255 characters.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO menu_item (category_id, name, description, price, image_url, is_available)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [categoryId, name, description || null, price, imageUrl || null, isAvailable]
    );
    return res.status(201).json({
      item_id: result.insertId,
      category_id: categoryId,
      name,
      description: description || null,
      price: price.toFixed(2),
      image_url: imageUrl || null,
      is_available: isAvailable
    });
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Referenced category does not exist.' });
    }
    if (err.errno === 3819 || err.errno === 4025) {
      return res.status(400).json({ error: 'Price cannot be negative.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/menu/:id (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid menu item id.' });
  }

  const categoryId = parsePositiveInt(req.body.category_id);
  const name = cleanText(req.body.name);
  const description = req.body.description ? cleanText(req.body.description) : null;
  const price = parseNonNegativeMoney(req.body.price);
  const imageUrl = req.body.image_url ? cleanText(req.body.image_url) : null;
  const isAvailable = req.body.is_available === undefined ? 1 : parseBooleanFlag(req.body.is_available);

  if (!categoryId || !name || name.length > 100 || price === null || isAvailable === null) {
    return res.status(400).json({
      error: 'Valid category_id, name (max 100), non-negative price, and is_available are required.'
    });
  }
  if (imageUrl && imageUrl.length > 255) {
    return res.status(400).json({ error: 'image_url must be at most 255 characters.' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE menu_item
       SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, is_available = ?
       WHERE item_id = ?`,
      [categoryId, name, description || null, price, imageUrl || null, isAvailable, itemId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    return res.json({
      item_id: itemId,
      category_id: categoryId,
      name,
      description: description || null,
      price: price.toFixed(2),
      image_url: imageUrl || null,
      is_available: isAvailable
    });
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Referenced category does not exist.' });
    }
    if (err.errno === 3819 || err.errno === 4025) {
      return res.status(400).json({ error: 'Price cannot be negative.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/menu/:id (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid menu item id.' });
  }

  try {
    const [result] = await pool.query('DELETE FROM menu_item WHERE item_id = ?', [itemId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    return res.json({ message: 'Menu item deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'Cannot delete an item that has been ordered. Mark it unavailable instead.'
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
