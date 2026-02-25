const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to LetsGo API' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

// Add after your existing routes
const { adminOptions, AdminJS, AdminJSExpress } = require('./admin');

// Simple resource for users table
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Add admin routes
app.use('/admin', async (req, res, next) => {
  try {
    // Simple dashboard showing database stats
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const wallets = await pool.query('SELECT COUNT(*) FROM wallets');
    const rides = await pool.query('SELECT COUNT(*) FROM rides');
    
    res.json({
      message: 'LetsGo Admin Dashboard',
      stats: {
        totalUsers: users.rows[0].count,
        totalWallets: wallets.rows[0].count,
        totalRides: rides.rows[0].count,
      },
      tables: {
        users: '/admin/resources/users',
        wallets: '/admin/resources/wallets',
        otp_codes: '/admin/resources/otp_codes',
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});