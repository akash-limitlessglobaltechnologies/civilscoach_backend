const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const analyticsController = require('../controllers/analyticsController');

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  // Get credentials from headers (preferred for GET requests) or body
  const adminId = req.headers['x-admin-id'] || (req.body && req.body.adminId);
  const password = req.headers['x-admin-password'] || (req.body && req.body.password);

  if (!adminId || !password) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required. Please provide x-admin-id and x-admin-password headers.',
      type: 'ADMIN_AUTH_REQUIRED'
    });
  }

  // Verify admin credentials
  if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin credentials',
      type: 'INVALID_ADMIN_CREDENTIALS'
    });
  }

  next();
};

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

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      type: 'VALIDATION_ERROR',
      errors: formattedErrors
    });
  }
  
  next();
};

// Validation rules
const validateUserId = [
  param('userId').isMongoId().withMessage('Invalid user ID format')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// =============================================================================
// ANALYTICS ROUTES
// =============================================================================

/**
 * Get overall platform dashboard statistics
 * GET /api/admin/analytics/dashboard
 */
router.get('/dashboard',
  authenticateAdmin,
  analyticsController.getPlatformDashboard
);

/**
 * Get list of all users with basic statistics
 * GET /api/admin/analytics/users
 * Query params: page, limit, search, sortBy, sortOrder
 */
router.get('/users',
  authenticateAdmin,
  validatePagination,
  handleValidationErrors,
  analyticsController.getAllUsers
);

/**
 * Get detailed analytics for a specific user
 * GET /api/admin/analytics/users/:userId
 */
router.get('/users/:userId',
  authenticateAdmin,
  validateUserId,
  handleValidationErrors,
  analyticsController.getUserDetailedAnalytics
);

/**
 * Get user test history with pagination
 * GET /api/admin/analytics/users/:userId/test-history
 */
router.get('/users/:userId/test-history',
  authenticateAdmin,
  validateUserId,
  validatePagination,
  handleValidationErrors,
  analyticsController.getUserTestHistory
);

/**
 * Get user untimed practice history with pagination
 * GET /api/admin/analytics/users/:userId/practice-history
 * Query params: page, limit, subject
 */
router.get('/users/:userId/practice-history',
  authenticateAdmin,
  validateUserId,
  validatePagination,
  [
    query('subject').optional().isIn(['all', '1', '2', '3', '4', '5', '6', '7', '8'])
      .withMessage('Invalid subject')
  ],
  handleValidationErrors,
  analyticsController.getUserPracticeHistory
);

/**
 * Export all user data (for GDPR compliance or backup)
 * GET /api/admin/analytics/users/:userId/export
 */
router.get('/users/:userId/export',
  authenticateAdmin,
  validateUserId,
  handleValidationErrors,
  analyticsController.exportUserData
);

// Health check for analytics service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Admin Analytics Service',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      dashboard: 'GET /api/admin/analytics/dashboard',
      users: {
        list: 'GET /api/admin/analytics/users',
        details: 'GET /api/admin/analytics/users/:userId',
        testHistory: 'GET /api/admin/analytics/users/:userId/test-history',
        practiceHistory: 'GET /api/admin/analytics/users/:userId/practice-history',
        export: 'GET /api/admin/analytics/users/:userId/export'
      }
    },
    authentication: 'Required: x-admin-id and x-admin-password headers'
  });
});

module.exports = router;