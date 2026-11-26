const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.item_id, m.name, m.description, m.price, m.image_url,
              c.category_id, c.display_name AS category
       FROM menu_item m
       JOIN category c USING (category_id)
       WHERE m.is_available = 1
       ORDER BY c.category_id, m.item_id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
