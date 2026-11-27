require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');

const { authRouter, adminsRouter } = require('./routes/admin');
const categoriesRouter = require('./routes/categories');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');
const businessRouter = require('./routes/business');

const app = express();

app.use(express.json());
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.sessionCookieMaxAgeMs
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/admin', authRouter);
app.use('/api/admins', adminsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/business', businessRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.listen(config.port, () => {
  console.log(`Running at http://localhost:${config.port}`);
});
