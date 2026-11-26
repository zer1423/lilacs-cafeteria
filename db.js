require('dotenv').config();
const mysql = require('mysql2/promise');

module.exports = mysql.createPool({
  host: 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: 'lilacs_cafeteria',
  waitForConnections: true,
  connectionLimit: 10
});
