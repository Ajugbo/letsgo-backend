const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
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

// Root Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to LetsGo API' });
});

// Admin Dashboard Route
app.get('/admin', async (req, res) => {
  try {
    const pool = require('./config/database');
    
    // Get stats from database
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalRides = await pool.query('SELECT COUNT(*) FROM rides');
    const totalWallets = await pool.query('SELECT COUNT(*) FROM wallets');
    
    // Get recent users
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    
    // Get chart data - Users per day (last 7 days)
    const userGrowth = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    // Get chart data - Rides per day (last 7 days)
    const rideData = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM rides 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    // Get revenue data (last 7 days)
    const revenueData = await pool.query(`
      SELECT DATE(created_at) as date, SUM(fare) as total 
      FROM rides 
      WHERE created_at >= NOW() - INTERVAL '7 days' AND fare IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    // Format chart data
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    const chartData = {
      userLabels: userGrowth.rows.map(row => formatDate(row.date)),
      userData: userGrowth.rows.map(row => parseInt(row.count)),
      rideLabels: rideData.rows.map(row => formatDate(row.date)),
      rideData: rideData.rows.map(row => parseInt(row.count)),
      revenueLabels: revenueData.rows.map(row => formatDate(row.date)),
      revenueData: revenueData.rows.map(row => parseFloat(row.total || 0))
    };
    
    // Render admin dashboard
    res.render('admin', {
      stats: {
        totalUsers: totalUsers.rows[0].count,
        totalRides: totalRides.rows[0].count,
        totalWallets: totalWallets.rows[0].count
      },
      users: users.rows,
      chartData: chartData
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Users List Page
app.get('/admin/users', async (req, res) => {
  try {
    const pool = require('./config/database');
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.render('users', { users: users.rows });
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rides List Page
app.get('/admin/rides', async (req, res) => {
  try {
    const pool = require('./config/database');
    const rides = await pool.query('SELECT * FROM rides ORDER BY id DESC');
    res.render('rides', { rides: rides.rows });
  } catch (error) {
    console.error('Rides page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Wallets List Page
app.get('/admin/wallets', async (req, res) => {
  try {
    const pool = require('./config/database');
    const wallets = await pool.query('SELECT * FROM wallets ORDER BY id DESC');
    const totalBalanceResult = await pool.query('SELECT SUM(balance) as total FROM wallets');
    const totalBalance = totalBalanceResult.rows[0].total || 0;
    
    res.render('wallets', { 
      wallets: wallets.rows,
      totalBalance: parseFloat(totalBalance).toFixed(2)
    });
  } catch (error) {
    console.error('Wallets page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth Routes
app.use('/api/auth', require('./routes/auth'));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});