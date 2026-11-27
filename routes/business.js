const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const {
  parseNonNegativeMoney,
  cleanText,
  isValidPhone
} = require('../middleware/validate');

const router = express.Router();

function validateBusinessBody(body) {
  const name = cleanText(body.name);
  const tagline = body.tagline ? cleanText(body.tagline) : null;
  const address = cleanText(body.address);
  const city = cleanText(body.city);
  const mapLink = body.map_link ? cleanText(body.map_link) : null;
  const phone = cleanText(body.phone);
  const takeoutFeePerMeal = parseNonNegativeMoney(body.takeout_fee_per_meal);

  if (!name || name.length > 100) {
    return { error: 'Business name is required (max 100 characters).' };
  }
  if (tagline && tagline.length > 150) {
    return { error: 'Tagline must be at most 150 characters.' };
  }
  if (!address || address.length > 255) {
    return { error: 'Address is required (max 255 characters).' };
  }
  if (!city || city.length > 100) {
    return { error: 'City is required (max 100 characters).' };
  }
  if (mapLink && mapLink.length > 500) {
    return { error: 'Map link must be at most 500 characters.' };
  }
  if (!isValidPhone(phone)) {
    return { error: 'Valid phone number is required.' };
  }
  if (takeoutFeePerMeal === null) {
    return { error: 'Takeout fee per meal must be a non-negative number.' };
  }

  return {
    data: {
      name,
      tagline: tagline || null,
      address,
      city,
      map_link: mapLink || null,
      phone,
      takeout_fee_per_meal: takeoutFeePerMeal
    }
  };
}

// GET /api/business (public)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT business_id, name, tagline, address, city, map_link, phone, takeout_fee_per_meal
       FROM business_info
       WHERE business_id = 1`
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Business information not configured.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/business (admin)
router.post('/', requireAdmin, async (req, res) => {
  const { error, data } = validateBusinessBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    await pool.query(
      `INSERT INTO business_info
        (business_id, name, tagline, address, city, map_link, phone, takeout_fee_per_meal)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.tagline,
        data.address,
        data.city,
        data.map_link,
        data.phone,
        data.takeout_fee_per_meal
      ]
    );
    return res.status(201).json({
      business_id: 1,
      ...data,
      takeout_fee_per_meal: data.takeout_fee_per_meal.toFixed(2)
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Business information already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/business (admin)
router.put('/', requireAdmin, async (req, res) => {
  const { error, data } = validateBusinessBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const [result] = await pool.query(
      `UPDATE business_info
       SET name = ?, tagline = ?, address = ?, city = ?, map_link = ?, phone = ?, takeout_fee_per_meal = ?
       WHERE business_id = 1`,
      [
        data.name,
        data.tagline,
        data.address,
        data.city,
        data.map_link,
        data.phone,
        data.takeout_fee_per_meal
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Business information does not exist.' });
    }
    return res.json({
      business_id: 1,
      ...data,
      takeout_fee_per_meal: data.takeout_fee_per_meal.toFixed(2)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/business (admin)
router.delete('/', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM business_info WHERE business_id = 1');
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Business information does not exist.' });
    }
    return res.json({ message: 'Business information deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
