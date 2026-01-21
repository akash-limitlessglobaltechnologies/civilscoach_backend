const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value
    }));

    console.log('⚠️ Validation errors:', formattedErrors);

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      type: 'VALIDATION_ERROR',
      errors: formattedErrors
    });
  }
  
  next();
};

// Validation rules for signup flow
const validateSignupOTP = [
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

const validateVerifySignupOTP = [
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

const validateCompleteSignup = [
  body('sessionKey')
    .notEmpty()
    .withMessage('Session key is required')
    .isLength({ min: 10, max: 200 })
    .withMessage('Invalid session key format'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters')
    .trim(),
  
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters')
    .trim()
];

// Validation rules for login flow
const validateLogin = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Identifier must be between 5 and 100 characters')
    .trim(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

// Validation rules for forgot password flow
const validateForgotPassword = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Identifier must be between 5 and 100 characters')
    .trim()
];

const validateResetPassword = [
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
    .withMessage('Phone OTP must contain only numbers'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

// Validation rules for utility functions
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

// SIGNUP ROUTES

// Step 1: Send OTP for signup
router.post('/signup/send-otp', 
  validateSignupOTP, 
  handleValidationErrors, 
  authController.sendSignupOTP
);

// Step 2: Verify OTPs for signup
router.post('/signup/verify-otp', 
  validateVerifySignupOTP, 
  handleValidationErrors, 
  authController.verifySignupOTP
);

// Step 3: Complete signup with password
router.post('/signup/complete', 
  validateCompleteSignup, 
  handleValidationErrors, 
  authController.completeSignup
);

// LOGIN ROUTES

// Login with email/phone and password
router.post('/login', 
  validateLogin, 
  handleValidationErrors, 
  authController.login
);

// FORGOT PASSWORD ROUTES

// Forgot password - send reset OTP
router.post('/forgot-password', 
  validateForgotPassword, 
  handleValidationErrors, 
  authController.forgotPassword
);

// Reset password with OTP
router.post('/reset-password', 
  validateResetPassword, 
  handleValidationErrors, 
  authController.resetPassword
);

// UTILITY ROUTES

// Resend OTP (works for both signup and login flows)
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

// PROTECTED ROUTES

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

// PASSWORD MANAGEMENT ROUTES (Future implementation)

// Change password (protected route)
router.post('/change-password', 
  authenticateToken,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
  ],
  handleValidationErrors,
  async (req, res) => {
    // TODO: Implement change password functionality
    res.status(501).json({
      success: false,
      message: 'Change password feature coming soon',
      type: 'NOT_IMPLEMENTED'
    });
  }
);

// ADMIN ROUTES (Future implementation)

// Admin endpoint to check user status
router.get('/admin/user/:userId', 
  authenticateToken, // Add admin authentication middleware later
  [
    param('userId').isMongoId().withMessage('Invalid user ID format')
  ],
  handleValidationErrors,
  async (req, res) => {
    // TODO: Implement admin user check functionality
    res.status(501).json({
      success: false,
      message: 'Admin features coming soon',
      type: 'NOT_IMPLEMENTED'
    });
  }
);

// ACCOUNT MANAGEMENT ROUTES

// Deactivate account (protected route)
router.post('/deactivate-account', 
  authenticateToken,
  [
    body('password')
      .notEmpty()
      .withMessage('Password is required for account deactivation'),
    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    // TODO: Implement account deactivation
    res.status(501).json({
      success: false,
      message: 'Account deactivation feature coming soon',
      type: 'NOT_IMPLEMENTED'
    });
  }
);

// Reactivate account
router.post('/reactivate-account', [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('password').notEmpty().withMessage('Password is required')
], handleValidationErrors, async (req, res) => {
  // TODO: Implement account reactivation
  res.status(501).json({
    success: false,
    message: 'Account reactivation feature coming soon',
    type: 'NOT_IMPLEMENTED'
  });
});

// ANALYTICS AND MONITORING ROUTES

// Get authentication analytics (protected admin route)
router.get('/analytics/auth-stats', 
  authenticateToken, // Add admin middleware later
  async (req, res) => {
    // TODO: Implement auth analytics
    res.status(501).json({
      success: false,
      message: 'Authentication analytics coming soon',
      type: 'NOT_IMPLEMENTED'
    });
  }
);

// HEALTH CHECK AND STATUS ROUTES

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Authentication Service v2.0',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      signup: {
        sendOTP: 'POST /api/auth/signup/send-otp',
        verifyOTP: 'POST /api/auth/signup/verify-otp',
        complete: 'POST /api/auth/signup/complete'
      },
      login: {
        login: 'POST /api/auth/login'
      },
      forgotPassword: {
        sendResetOTP: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password'
      },
      utility: {
        resendOTP: 'POST /api/auth/resend-otp',
        sessionStatus: 'GET /api/auth/session/:sessionKey/status',
        verifyToken: 'GET /api/auth/verify-token',
        logout: 'POST /api/auth/logout'
      },
      future: {
        changePassword: 'POST /api/auth/change-password [COMING SOON]'
      }
    }
  });
});

// Service status with detailed information
router.get('/status', (req, res) => {
  const { testEmailConnection } = require('../services/emailService');
  const { testTwilioConnection } = require('../services/smsService');
  
  // Test service connections
  Promise.all([
    testEmailConnection(),
    testTwilioConnection()
  ]).then(([emailStatus, smsStatus]) => {
    res.json({
      success: true,
      service: 'Authentication Service',
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        email: {
          status: emailStatus ? 'Connected' : 'Disconnected',
          provider: 'Zoho Workplace'
        },
        sms: {
          status: smsStatus ? 'Connected' : 'Disconnected',
          provider: 'Twilio'
        },
        database: {
          status: 'Connected', // Assume connected if this route works
          provider: 'MongoDB'
        }
      },
      features: {
        signup: 'Available',
        login: 'Available',
        forgotPassword: 'Available',
        resetPassword: 'Available',
        otpVerification: 'Available',
        passwordAuthentication: 'Available',
        jwtTokens: 'Available'
      }
    });
  }).catch(error => {
    console.error('Service status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Service status check failed',
      error: error.message
    });
  });
});

module.exports = router;