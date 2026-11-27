require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'lilacs-dev-secret-change-me',
  sessionCookieMaxAgeMs: 1000 * 60 * 60 * 8, // 8 hours
  bcryptRounds: 10
};
