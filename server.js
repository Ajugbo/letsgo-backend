const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Customer Landing Page
app.get('/customer', (req, res) => {
  res.render('customer/index');
});

app.get('/', (req, res) => {
  res.redirect('/customer');
});

// Customer Login Page
app.get('/customer/login', (req, res) => {
  res.render('customer/login', { error: null });
});

// Customer Signup Page
app.get('/customer/signup', (req, res) => {
  res.render('customer/signup', { error: null });
});

// Customer Login Handler
app.post('/customer/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const pool = require('./config/database');
    
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (password === 'password123') { 
        req.session.userId = user.id;
        req.session.user = user;
        return res.redirect('/customer/dashboard');
      }
    }
    
    res.render('customer/login', { error: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.render('customer/login', { error: 'Login failed' });
  }
});

// Customer Signup Handler
app.post('/customer/signup', async (req, res) => {
  try {
    const { full_name, phone, email, password } = req.body;
    const pool = require('./config/database');
    
    const existing = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.render('customer/signup', { error: 'Phone number already registered' });
    }
    
    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, role, phone_verified, created_at) 
       VALUES ($1, $2, $3, 'user', true, NOW()) RETURNING *`,
      [full_name, phone, email || null]
    );
    
    const user = result.rows[0];
    
    await pool.query(
      `INSERT INTO wallets (user_id, balance, bank_verified) VALUES ($1, 0.00, false)`,
      [user.id]
    );
    
    req.session.userId = user.id;
    req.session.user = user;
    res.redirect('/customer/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('customer/signup', { error: 'Signup failed' });
  }
});

// Customer Dashboard
app.get('/customer/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/customer/login');
  }
  res.render('customer/dashboard', { user: req.session.user });
});

// Book Ride Page (Protected)
app.get('/customer/book-ride', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/customer/login');
  }
  res.render('customer/book-ride', { user: req.session.user });
});

// Customer Logout
app.get('/customer/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/customer');
});

// Admin Login Page
app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

// Admin Login Handler
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const pool = require('./config/database');
    
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 AND role = $2',
      [username, 'admin']
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (password === 'admin123') {
        req.session.adminId = user.id;
        req.session.isAdmin = true;
        return res.redirect('/admin');
      }
    }
    
    res.render('login', { error: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login failed' });
  }
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Middleware to protect admin routes
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
};

// Admin Dashboard Route
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const pool = require('./config/database');
    
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalRides = await pool.query('SELECT COUNT(*) FROM rides');
    const totalWallets = await pool.query('SELECT COUNT(*) FROM wallets');
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    
    const userGrowth = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    const rideData = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM rides 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    const revenueData = await pool.query(`
      SELECT DATE(created_at) as date, SUM(fare) as total 
      FROM rides 
      WHERE created_at >= NOW() - INTERVAL '7 days' AND fare IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
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
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Users List Page
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const pool = require('./config/database');
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.render('users', { users: users.rows });
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User Details Page
app.get('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const pool = require('./config/database');
    const userId = req.params.id;
    
    // Get user details
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).send('User not found');
    }
    
    const user = userResult.rows[0];
    
    // Get user's rides
    const ridesResult = await pool.query(
      'SELECT * FROM rides WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    // Get user's wallet
    const walletResult = await pool.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );
    
    const wallet = walletResult.rows[0] || null;
    
    res.render('user-details', {
      user: user,
      rides: ridesResult.rows,
      wallet: wallet
    });
  } catch (error) {
    console.error('User details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rides List Page
app.get('/admin/rides', requireAdmin, async (req, res) => {
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
app.get('/admin/wallets', requireAdmin, async (req, res) => {
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