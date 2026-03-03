const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const pool = require('./config/database');

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

// Root Route
app.get('/', (req, res) => {
  res.redirect('/customer');
});

// Customer Landing Page
app.get('/customer', (req, res) => {
  res.render('customer/index');
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
    const existing = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.render('customer/signup', { error: 'Phone number already registered' });
    }
    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, role, phone_verified, created_at) VALUES ($1, $2, $3, 'user', true, NOW()) RETURNING *`,
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
  res.render('customer/dashboard', { user: req.session.user });
});

// Book Ride Page
app.get('/customer/book-ride', (req, res) => {
  res.render('customer/book-ride', { user: req.session.user, success: null, error: null });
});

// Wallet Page
app.get('/customer/wallet', async (req, res) => {
  try {
    let wallet = { balance: 0 };
    const walletResult = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [req.session.userId]);
    wallet = walletResult.rows[0] || { balance: 0 };
    let transactions = [];
    const txnResult = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [req.session.userId]);
    transactions = txnResult.rows;
    res.render('customer/wallet', { user: req.session.user, wallet: wallet, transactions: transactions, error: null, success: null });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.render('customer/wallet', { user: req.session.user, wallet: { balance: 0 }, transactions: [], error: 'Error loading wallet', success: null });
  }
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
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.render('login', { error: 'Please provide username and password' });
    }
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 AND role = $2',
      [username, 'admin']
    );
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (password === 'admin123') {
        req.session.adminId = user.id;
        req.session.isAdmin = true;
        req.session.user = user;
        return res.redirect('/admin');
      }
    }
    res.render('login', { error: 'Invalid credentials' });
  } catch (error) {
    console.error('Admin login error:', error);
    res.render('login', { error: 'Login failed: ' + error.message });
  }
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin Middleware
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
};

// Admin Dashboard
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalRides = await pool.query('SELECT COUNT(*) FROM rides');
    const totalWallets = await pool.query('SELECT COUNT(*) FROM wallets');
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    res.render('admin', {
      stats: {
        totalUsers: totalUsers.rows[0].count,
        totalRides: totalRides.rows[0].count,
        totalWallets: totalWallets.rows[0].count
      },
      users: users.rows
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Users List
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.render('users', { users: users.rows });
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rides List
app.get('/admin/rides', requireAdmin, async (req, res) => {
  try {
    const rides = await pool.query('SELECT * FROM rides ORDER BY id DESC');
    res.render('rides', { rides: rides.rows });
  } catch (error) {
    console.error('Rides page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Wallets List
app.get('/admin/wallets', requireAdmin, async (req, res) => {
  try {
    const wallets = await pool.query('SELECT * FROM wallets ORDER BY id DESC');
    const totalBalance = await pool.query('SELECT SUM(balance) as total FROM wallets');
    res.render('wallets', {
      wallets: wallets.rows,
      totalBalance: parseFloat(totalBalance.rows[0].total || 0).toFixed(2)
    });
  } catch (error) {
    console.error('Wallets page error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth Routes
// app.use('/api/auth', require('./routes/auth')); // File not found

// Payment: Fund Wallet
app.post('/customer/wallet/fund', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1000) {
      return res.render('customer/wallet', { user: req.session.user, wallet: { balance: 0 }, transactions: [], error: 'Minimum funding amount is 1,000 Naira', success: null });
    }
    const userResult = await pool.query('SELECT email, phone, full_name FROM users WHERE id = $1', [req.session.userId]);
    const user = userResult.rows[0];
    const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
    const response = await paystack.transaction.initialize({
      email: user.email || user.phone.replace(/[^0-9]/g, '') + '@letsgo.com',
      amount: parseInt(amount) * 100,
      currency: 'NGN',
      metadata: { user_id: req.session.userId, full_name: user.full_name, type: 'wallet_funding' }
    });
    await pool.query(`INSERT INTO transactions (user_id, amount, type, status, reference, description, created_at) VALUES ($1, $2, 'credit', 'pending', $3, $4, NOW())`, [req.session.userId, amount, response.data.reference, 'Wallet funding']);
    // Note: Transaction status will be updated via webhook or callback
    console.log('Payment initiated:', response.data.reference);
    res.redirect(response.data.authorization_url);
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.render('customer/wallet', { user: req.session.user, wallet: { balance: 0 }, transactions: [], error: 'Payment initialization failed', success: null });
  }
});

// Ride Booking Route
app.post('/customer/ride/book', async (req, res) => {
  if (!req.session.userId) {
    console.log('Ride booking: No user session');
    return res.redirect('/customer/login');
  }
  try {
    const { pickup_location, dropoff_location, ride_type, seats, payment_method } = req.body;
    console.log('Ride booking ', { pickup_location, dropoff_location, ride_type, seats, payment_method, userId: req.session.userId });
    
    const rideTypeRates = { economy: 100, comfort: 150, premium: 250 };
    const rate = rideTypeRates[ride_type] || 100;
    const baseFare = rate * 10;
    const totalFare = baseFare + (parseInt(seats) > 1 ? (parseInt(seats) - 1) * 500 : 0);
    
    console.log('Calculated fare:', totalFare);
    
    await pool.query(
      `INSERT INTO rides (user_id, pickup_location, dropoff_location, ride_type, seats_booked, fare, payment_method, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [req.session.userId, pickup_location, dropoff_location, ride_type, seats, totalFare, payment_method || 'cash']
    );
    
    console.log('Ride booked successfully');
    res.render('customer/book-ride', {
      user: req.session.user,
      success: 'Ride requested successfully! We will find a driver for you.',
      error: null
    });
  } catch (error) {
    console.error('Ride booking error:', error);
    res.render('customer/book-ride', {
      user: req.session.user,
      success: null,
      error: 'Failed to book ride: ' + error.message
    });
  }
});

// Pay Ride from Wallet
app.post('/customer/ride/pay', async (req, res) => {
  if (!req.session.userId) { return res.status(401).json({ error: 'Unauthorized' }); }
  try {
    const { ride_id, amount } = req.body;
    const walletResult = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [req.session.userId]);
    const wallet = walletResult.rows[0];
    if (!wallet || wallet.balance < amount) { return res.status(400).json({ error: 'Insufficient wallet balance' }); }
    await pool.query('UPDATE wallets SET balance = balance - $1 WHERE user_id = $2', [amount, req.session.userId]);
    await pool.query(`INSERT INTO transactions (user_id, amount, type, status, reference, description, created_at) VALUES ($1, $2, 'debit', 'success', $3, $4, NOW())`, [req.session.userId, amount, 'ride_' + ride_id + '_' + Date.now(), 'Ride payment']);
    await pool.query(`UPDATE rides SET status = 'paid', payment_method = 'wallet' WHERE id = $1`, [ride_id]);
    res.json({ success: true, message: 'Payment successful!' });
  } catch (error) {
    console.error('Ride payment error:', error);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Rate Ride
app.post('/customer/ride/rate', async (req, res) => {
  if (!req.session.userId) { return res.status(401).json({ error: 'Unauthorized' }); }
  try {
    const { ride_id, rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) { return res.status(400).json({ error: 'Rating must be between 1 and 5 stars' }); }
    const rideResult = await pool.query('SELECT * FROM rides WHERE id = $1 AND user_id = $2', [ride_id, req.session.userId]);
    if (rideResult.rows.length === 0) { return res.status(404).json({ error: 'Ride not found' }); }
    const existingRating = await pool.query('SELECT * FROM ride_ratings WHERE ride_id = $1', [ride_id]);
    if (existingRating.rows.length > 0) { return res.status(400).json({ error: 'Already rated' }); }
    await pool.query('INSERT INTO ride_ratings (ride_id, user_id, rating, review, created_at) VALUES ($1, $2, $3, $4, NOW())', [ride_id, req.session.userId, rating, review || null]);
    await pool.query('UPDATE rides SET status = completed, rated = true WHERE id = $1', [ride_id]);
    res.json({ success: true, message: 'Thank you for your rating!' });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// Ride History
app.get('/customer/rides', async (req, res) => {
  if (!req.session.userId) { return res.redirect('/customer/login'); }
  try {
    const ridesResult = await pool.query('SELECT r.*, rr.rating, rr.review FROM rides r LEFT JOIN ride_ratings rr ON r.id = rr.ride_id WHERE r.user_id = $1 ORDER BY r.created_at DESC', [req.session.userId]);
    res.render('customer/ride-history', { user: req.session.user, rides: ridesResult.rows });
  } catch (error) {
    console.error('Ride history error:', error);
    res.status(500).send('Error loading ride history');
  }
});

// Admin Driver Ratings
app.get('/admin/driver-ratings', requireAdmin, async (req, res) => {
  try {
    const ratingsResult = await pool.query(`SELECT u.full_name, u.phone, COUNT(rr.id) as total_ratings, AVG(rr.rating) as average_rating, MAX(rr.created_at) as last_rated FROM users u LEFT JOIN rides r ON u.id = r.user_id LEFT JOIN ride_ratings rr ON r.id = rr.ride_id WHERE u.role = 'user' GROUP BY u.id HAVING COUNT(rr.id) > 0 ORDER BY average_rating DESC`);
    res.render('driver-ratings', { ratings: ratingsResult.rows });
  } catch (error) {
    console.error('Driver ratings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Payment Callback
app.get('/customer/wallet/callback', async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res.redirect('/customer/wallet?error=No reference provided');
    }
    const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
    const verification = await paystack.transaction.verify({ reference });
    if (verification.data.status === 'success') {
      const amount = verification.data.amount / 100;
      const userId = verification.data.metadata.user_id;
      await pool.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [amount, userId]);
      await pool.query("UPDATE transactions SET status = 'success' WHERE reference = $1", [reference]);
      return res.redirect('/customer/wallet?success=Payment successful!');
    }
    await pool.query("UPDATE transactions SET status = 'failed' WHERE reference = $1", [reference]);
    res.redirect('/customer/wallet?error=Payment failed');
  } catch (error) {
    console.error('Payment callback error:', error);
    res.redirect('/customer/wallet?error=Verification failed');
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('Customer: http://localhost:' + PORT + '/customer');
console.log('Admin: http://localhost:' + PORT + '/admin/login');
});
