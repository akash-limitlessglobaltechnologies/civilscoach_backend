const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

// Validation middleware
const validateSendOTP = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ min: 5, max: 100 })
    .withMessage('Email must be between 5 and 100 characters'),
  
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 characters')
    .matches(/^[\+]?[1-9][\d\s\-\(\)]{8,}$/)
    .withMessage('Please provide a valid phone number')
];

const validateVerifyOTP = [
  body('sessionKey')
    .notEmpty()
    .withMessage('Session key is required')
    .isLength({ min: 10, max: 200 })
    .withMessage('Invalid session key format'),
  
  body('emailOTP')
    .notEmpty()
    .withMessage('Email OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('Email OTP must be 6 digits')
    .isNumeric()
    .withMessage('Email OTP must contain only numbers'),
  
  body('phoneOTP')
    .notEmpty()
    .withMessage('Phone OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('Phone OTP must be 6 digits')
    .isNumeric()
    .withMessage('Phone OTP must contain only numbers')
];

const validateResendOTP = [
  body('sessionKey')
    .notEmpty()
    .withMessage('Session key is required')
    .isLength({ min: 10, max: 200 })
    .withMessage('Invalid session key format'),
  
  body('type')
    .isIn(['email', 'sms', 'both'])
    .withMessage('Type must be email, sms, or both')
];

const validateSessionKey = [
  param('sessionKey')
    .notEmpty()
    .withMessage('Session key is required')
    .isLength({ min: 10, max: 200 })
    .withMessage('Invalid session key format')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value
    }));

    console.log('❌ Validation errors:', formattedErrors);

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      type: 'VALIDATION_ERROR',
      errors: formattedErrors
    });
  }
  
  next();
};

// Authentication routes

// Step 1: Send OTP to email and phone
router.post('/send-otp', 
  validateSendOTP, 
  handleValidationErrors, 
  authController.sendOTP
);

// Step 2: Verify OTPs and login
router.post('/verify-otp', 
  validateVerifyOTP, 
  handleValidationErrors, 
  authController.verifyOTPAndLogin
);

// Resend OTP
router.post('/resend-otp', 
  validateResendOTP, 
  handleValidationErrors, 
  authController.resendOTP
);

// Get session status
router.get('/session/:sessionKey/status', 
  validateSessionKey, 
  handleValidationErrors, 
  authController.getSessionStatus
);

// Verify current token (protected route)
router.get('/verify-token', 
  authenticateToken, 
  authController.verifyToken
);

// Logout (protected route)
router.post('/logout', 
  authenticateToken, 
  authController.logout
);

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Authentication Service',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      sendOTP: 'POST /api/auth/send-otp',
      verifyOTP: 'POST /api/auth/verify-otp',
      resendOTP: 'POST /api/auth/resend-otp',
      sessionStatus: 'GET /api/auth/session/:sessionKey/status',
      verifyToken: 'GET /api/auth/verify-token',
      logout: 'POST /api/auth/logout'
    }
  });
});

module.exports = router;