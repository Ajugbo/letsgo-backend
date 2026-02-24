const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendSMS = require('../utils/smsService');

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// 1. Register / Login Request (Send OTP)
exports.requestOtp = async (req, res) => {
  const { phone, full_name } = req.body;

  // Simple Nigerian phone validation
  if (!phone.match(/^(\+234|0)[7-9][0-1][0-9]{8}$/)) {
    return res.status(400).json({ success: false, message: 'Invalid Nigerian phone number' });
  }

  try {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP to DB
    await pool.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
      [phone, otp, expiresAt]
    );

    // Send SMS
    await sendSMS(phone, `Your LetsGo OTP is ${otp}. Valid for 5 mins.`);

    // Check if user exists, if not create placeholder
    const userExists = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    
    if (userExists.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (phone, full_name) VALUES ($1, $2)',
        [phone, full_name || 'LetsGo User']
      );
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 2. Verify OTP & Login
exports.verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    // Check OTP
    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW()',
      [phone, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET used = true WHERE id = $1', [otpResult.rows[0].id]);

    // Get User
    const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = userResult.rows[0];

    // If no wallet exists, create one
    if (!user.wallet_id) {
      const walletResult = await pool.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, 0) RETURNING id',
        [user.id]
      );
      const walletId = walletResult.rows[0].id;
      await pool.query('UPDATE users SET wallet_id = $1, phone_verified = true WHERE id = $2', [walletId, user.id]);
      user.wallet_id = walletId;
      user.phone_verified = true;
    } else {
      // Just mark phone verified if logging in
      await pool.query('UPDATE users SET phone_verified = true, last_login = NOW() WHERE id = $1', [user.id]);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          full_name: user.full_name,
          role: user.role,
          wallet_id: user.wallet_id
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Verify Bank Account (Paystack)
exports.verifyBankAccount = async (req, res) => {
  const { account_number, bank_code } = req.body;
  const userId = req.user.id;

  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status) {
      const accountName = response.data.data.account_name;

      await pool.query(
        `UPDATE wallets 
         SET linked_bank_accounts = jsonb_set(linked_bank_accounts, '{0}', jsonb_build_object('account_number', $1, 'bank_code', $2, 'account_name', $3)),
         bank_verified = true
         WHERE user_id = $4`,
        [account_number, bank_code, accountName, userId]
      );

      res.json({
        success: true,
        message: 'Bank account verified',
        data: { account_name: accountName }
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid account details' });
    }
  } catch (error) {
    console.error('Paystack Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Bank verification failed' });
  }
};

// 4. Get Profile
exports.getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.phone, u.full_name, u.role, u.rating, u.phone_verified, 
              w.balance, w.bank_verified 
       FROM users u 
       LEFT JOIN wallets w ON u.wallet_id = w.id 
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};