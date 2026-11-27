const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { parsePositiveInt, cleanText, parseBooleanFlag } = require('../middleware/validate');

const router = express.Router();

// GET /api/categories (public)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT category_id, name, display_name, has_takeout_fee FROM category ORDER BY category_id'
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/categories/:id (public)
router.get('/:id', async (req, res) => {
  const categoryId = parsePositiveInt(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ error: 'Invalid category id.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT category_id, name, display_name, has_takeout_fee FROM category WHERE category_id = ?',
      [categoryId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/categories (admin)
router.post('/', requireAdmin, async (req, res) => {
  const name = cleanText(req.body.name).toLowerCase().replace(/\s+/g, '_');
  const displayName = cleanText(req.body.display_name);
  const feeFlag = req.body.has_takeout_fee === undefined ? 0 : parseBooleanFlag(req.body.has_takeout_fee);

  if (!name || name.length > 50 || !displayName || displayName.length > 100 || feeFlag === null) {
    return res.status(400).json({
      error: 'Valid name (max 50), display_name (max 100), and has_takeout_fee (0 or 1) are required.'
    });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO category (name, display_name, has_takeout_fee) VALUES (?, ?, ?)',
      [name, displayName, feeFlag]
    );
    return res.status(201).json({
      category_id: result.insertId,
      name,
      display_name: displayName,
      has_takeout_fee: feeFlag
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Category name already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/categories/:id (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const categoryId = parsePositiveInt(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ error: 'Invalid category id.' });
  }

  const name = cleanText(req.body.name).toLowerCase().replace(/\s+/g, '_');
  const displayName = cleanText(req.body.display_name);
  const feeFlag = req.body.has_takeout_fee === undefined ? 0 : parseBooleanFlag(req.body.has_takeout_fee);

  if (!name || name.length > 50 || !displayName || displayName.length > 100 || feeFlag === null) {
    return res.status(400).json({
      error: 'Valid name (max 50), display_name (max 100), and has_takeout_fee (0 or 1) are required.'
    });
  }

  try {
    const [result] = await pool.query(
      'UPDATE category SET name = ?, display_name = ?, has_takeout_fee = ? WHERE category_id = ?',
      [name, displayName, feeFlag, categoryId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.json({
      category_id: categoryId,
      name,
      display_name: displayName,
      has_takeout_fee: feeFlag
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Category name already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/categories/:id (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const categoryId = parsePositiveInt(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ error: 'Invalid category id.' });
  }

  try {
    const [result] = await pool.query('DELETE FROM category WHERE category_id = ?', [categoryId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.json({ message: 'Category deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Cannot delete a category that still has menu items.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
