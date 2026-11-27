require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('../db');
const config = require('../config');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  let username = process.argv[2] ? process.argv[2].trim() : '';
  let password = process.argv[3] || '';

  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!username) username = (await ask(rl, 'Admin username: ')).trim();
    if (!password) password = await ask(rl, 'Admin password (min 6 chars): ');
    rl.close();
  }

  if (!username || username.length > 50) {
    console.error('Error: username is required (max 50 chars).');
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error('Error: password must be at least 6 characters.');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const [result] = await pool.query(
      'INSERT INTO admin_user (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    console.log(`Created admin "${username}" with admin_id=${result.insertId}.`);
    process.exit(0);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.error(`Error: username "${username}" already exists.`);
    } else {
      console.error('Database error:', err.message);
    }
    process.exit(1);
  }
}

main();
