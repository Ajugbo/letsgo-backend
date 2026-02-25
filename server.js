const session = require('express-session');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to LetsGo API' });
});

const PORT = process.env.PORT || 5000;
// Admin Dashboard Route
app.get('/admin', async (req, res) => {
  try {
    const pool = require('./config/database');
    
    // Get stats from database
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalRides = await pool.query('SELECT COUNT(*) FROM rides');
    const totalWallets = await pool.query('SELECT COUNT(*) FROM wallets');
    
    // Render admin dashboard
    res.render('admin', {
      stats: {
        totalUsers: totalUsers.rows[0].count,
        totalRides: totalRides.rows[0].count,
        totalWallets: totalWallets.rows[0].count
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
