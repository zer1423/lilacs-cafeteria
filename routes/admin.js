const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const config = require('../config');
const { requireAdmin } = require('../middleware/auth');
const { parsePositiveInt, cleanText } = require('../middleware/validate');

const authRouter = express.Router();
const adminsRouter = express.Router();

// POST /api/admin/login
authRouter.post('/login', async (req, res) => {
  const username = cleanText(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT admin_id, username, password_hash FROM admin_user WHERE username = ?',
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.adminId = admin.admin_id;
    req.session.username = admin.username;

    return res.json({ admin_id: admin.admin_id, username: admin.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/logout
authRouter.post('/logout', requireAdmin, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to log out.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out.' });
  });
});

// GET /api/admin/me
authRouter.get('/me', requireAdmin, (req, res) => {
  return res.json({
    admin_id: req.session.adminId,
    username: req.session.username
  });
});

// GET /api/admins
adminsRouter.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT admin_id, username FROM admin_user ORDER BY admin_id'
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admins/:id
adminsRouter.get('/:id', requireAdmin, async (req, res) => {
  const adminId = parsePositiveInt(req.params.id);
  if (!adminId) {
    return res.status(400).json({ error: 'Invalid admin id.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT admin_id, username FROM admin_user WHERE admin_id = ?',
      [adminId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Admin account not found.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admins
adminsRouter.post('/', requireAdmin, async (req, res) => {
  const username = cleanText(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || username.length > 50) {
    return res.status(400).json({ error: 'Username is required (max 50 characters).' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const [result] = await pool.query(
      'INSERT INTO admin_user (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    return res.status(201).json({ admin_id: result.insertId, username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admins/:id
adminsRouter.put('/:id', requireAdmin, async (req, res) => {
  const adminId = parsePositiveInt(req.params.id);
  if (!adminId) {
    return res.status(400).json({ error: 'Invalid admin id.' });
  }

  const username = cleanText(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || username.length > 50) {
    return res.status(400).json({ error: 'Username is required (max 50 characters).' });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  try {
    let result;
    if (password) {
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      [result] = await pool.query(
        'UPDATE admin_user SET username = ?, password_hash = ? WHERE admin_id = ?',
        [username, hash, adminId]
      );
    } else {
      [result] = await pool.query(
        'UPDATE admin_user SET username = ? WHERE admin_id = ?',
        [username, adminId]
      );
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Admin account not found.' });
    }

    if (req.session.adminId === adminId) {
      req.session.username = username;
    }

    return res.json({ admin_id: adminId, username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admins/:id
adminsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const adminId = parsePositiveInt(req.params.id);
  if (!adminId) {
    return res.status(400).json({ error: 'Invalid admin id.' });
  }

  try {
    const [result] = await pool.query('DELETE FROM admin_user WHERE admin_id = ?', [adminId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Admin account not found.' });
    }
    return res.json({ message: 'Admin account deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { authRouter, adminsRouter };
