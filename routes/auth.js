const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Public routes (no login required)
router.post('/request-otp', authController.requestOtp);
router.post('/verify-otp', authController.verifyOtp);

// Protected routes (login required)
router.post('/verify-bank', auth, authController.verifyBankAccount);
router.get('/profile', auth, authController.getProfile);

module.exports = router;