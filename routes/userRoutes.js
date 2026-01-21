const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const userController = require('../controllers/userController');

// Import untimed practice controller
const untimedPracticeController = require('../controllers/untimedPracticeController');

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
const validateObjectId = [
  param('recordId').isMongoId().withMessage('Invalid record ID format'),
  param('testId').optional().isMongoId().withMessage('Invalid test ID format')
];

const validateProfileUpdate = [
  body('profile.firstName').optional().isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('profile.lastName').optional().isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('profile.category').optional().isIn(['General', 'EWS', 'OBC', 'SC', 'ST']).withMessage('Invalid category'),
  body('profile.gender').optional().isIn(['Male', 'Female', 'Other', 'Prefer not to say']).withMessage('Invalid gender'),
  body('preferences.language').optional().isIn(['English', 'Hindi']).withMessage('Invalid language preference')
];

const validateFeedback = [
  body('difficulty').optional().isIn(['Too Easy', 'Easy', 'Just Right', 'Hard', 'Too Hard']).withMessage('Invalid difficulty rating'),
  body('quality').optional().isInt({ min: 1, max: 5 }).withMessage('Quality rating must be between 1 and 5'),
  body('comments').optional().isLength({ max: 1000 }).withMessage('Comments cannot exceed 1000 characters')
];

// User Performance Routes

// Get user performance overview with pagination and enhanced analytics
router.get('/performance', 
  authenticateToken, 
  userController.getUserPerformance
);

// Get user dashboard summary with recent activity and goals
router.get('/dashboard', 
  authenticateToken, 
  userController.getUserDashboard
);

// User Test History Routes

// Get detailed user test history with full answer details
router.get('/history', 
  authenticateToken, 
  userController.getUserTestHistory
);

// Get detailed user test history by specific testId
router.get('/history/:testId', 
  authenticateToken,
  validateObjectId,
  handleValidationErrors,
  userController.getUserTestHistory
);

// Get specific test attempt with comprehensive analysis
router.get('/attempts/:recordId', 
  authenticateToken,
  validateObjectId,
  handleValidationErrors,
  userController.getTestAttemptDetails
);

// User Profile Management Routes

// Update user profile and preferences
router.put('/profile', 
  authenticateToken,
  validateProfileUpdate,
  handleValidationErrors,
  userController.updateUserProfile
);

// Get current user profile (alternative endpoint)
router.get('/profile', 
  authenticateToken, 
  async (req, res, next) => {
    try {
      const User = require('../models/User');
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        user: user.getPublicProfile()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Feedback and Review Routes

// Submit feedback for a specific test attempt
router.post('/attempts/:recordId/feedback', 
  authenticateToken,
  validateObjectId,
  validateFeedback,
  handleValidationErrors,
  userController.submitTestFeedback
);

// User Statistics Routes

// Get user statistics by test type
router.get('/statistics/by-type', 
  authenticateToken,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const userId = req.user.userId;
      const email = req.user.email;

      const typeStats = await UserTestRecord.aggregate([
        {
          $match: {
            $or: [
              { userId: mongoose.Types.ObjectId(userId) },
              { email: email.toLowerCase().trim() }
            ]
          }
        },
        {
          $group: {
            _id: '$testType',
            count: { $sum: 1 },
            averageScore: { $avg: '$score' },
            averagePercentage: { $avg: '$percentage' },
            bestScore: { $max: '$score' },
            totalTime: { $sum: '$timeTaken' }
          }
        },
        {
          $project: {
            testType: '$_id',
            count: 1,
            averageScore: { $round: ['$averageScore', 2] },
            averagePercentage: { $round: ['$averagePercentage', 1] },
            bestScore: { $round: ['$bestScore', 2] },
            averageTime: { $round: [{ $divide: ['$totalTime', '$count'] }, 1] }
          }
        }
      ]);

      res.json({
        success: true,
        statistics: typeStats.reduce((acc, stat) => {
          acc[stat.testType] = {
            count: stat.count,
            averageScore: stat.averageScore,
            averagePercentage: stat.averagePercentage,
            bestScore: stat.bestScore,
            averageTime: stat.averageTime
          };
          return acc;
        }, {})
      });

    } catch (error) {
      next(error);
    }
  }
);

// Get user progress over time
router.get('/progress', 
  authenticateToken,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const userId = req.user.userId;
      const email = req.user.email;
      const period = req.query.period || 'month'; // week, month, year
      
      let dateFormat;
      switch (period) {
        case 'week':
          dateFormat = '%Y-%U'; // Year-Week
          break;
        case 'year':
          dateFormat = '%Y-%m'; // Year-Month
          break;
        default:
          dateFormat = '%Y-%m-%d'; // Year-Month-Day
      }

      const progressData = await UserTestRecord.aggregate([
        {
          $match: {
            $or: [
              { userId: mongoose.Types.ObjectId(userId) },
              { email: email.toLowerCase().trim() }
            ]
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: { $ifNull: ['$completion.completedAt', '$completedAt'] }
              }
            },
            testsCount: { $sum: 1 },
            averageScore: { $avg: '$score' },
            averagePercentage: { $avg: '$percentage' },
            totalTime: { $sum: '$timeTaken' }
          }
        },
        {
          $sort: { '_id': 1 }
        },
        {
          $project: {
            date: '$_id',
            testsCount: 1,
            averageScore: { $round: ['$averageScore', 2] },
            averagePercentage: { $round: ['$averagePercentage', 1] },
            totalTime: { $round: ['$totalTime', 1] }
          }
        }
      ]);

      res.json({
        success: true,
        period: period,
        progress: progressData
      });

    } catch (error) {
      next(error);
    }
  }
);

// User Comparison and Ranking Routes

// Get user ranking for a specific test
router.get('/ranking/:testId', 
  authenticateToken,
  validateObjectId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const { testId } = req.params;
      const userId = req.user.userId;

      const ranking = await UserTestRecord.getUserRanking(userId, testId);
      
      res.json({
        success: true,
        ranking: ranking[0] || null
      });

    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// UNTIMED PRACTICE ROUTES - NEW ADDITION
// =============================================================================

// Get next untimed practice question
router.get('/untimed-practice/next', 
  authenticateToken, 
  untimedPracticeController.getNextQuestion
);

// Track answer for untimed practice question  
router.post('/untimed-practice/track-answer',
  authenticateToken,
  [
    body('questionId').isMongoId().withMessage('Invalid question ID'),
    body('selectedAnswer').isIn(['A', 'B', 'C', 'D']).withMessage('Answer must be A, B, C, or D'),
    body('isCorrect').isBoolean().withMessage('isCorrect must be boolean'),
    body('timeSpent').optional().isInt({ min: 0 }).withMessage('Time spent must be non-negative')
  ],
  handleValidationErrors,
  untimedPracticeController.trackAnswer
);

// Track skip for untimed practice question
router.post('/untimed-practice/track-skip',
  authenticateToken,
  [
    body('questionId').isMongoId().withMessage('Invalid question ID'),
    body('timeSpent').optional().isInt({ min: 0 }).withMessage('Time spent must be non-negative')
  ],
  handleValidationErrors,
  untimedPracticeController.trackSkip
);

// Get user's untimed practice statistics
router.get('/untimed-practice/stats',
  authenticateToken,
  untimedPracticeController.getUserStats
);

// Reset untimed practice progress (for testing/admin)
router.post('/untimed-practice/reset',
  authenticateToken,
  [
    body('subject').optional().isIn(['all', '1', '2', '3', '4', '5', '6', '7', '8']).withMessage('Invalid subject'),
    body('confirmReset').isBoolean().withMessage('confirmReset must be boolean')
  ],
  handleValidationErrors,
  untimedPracticeController.resetProgress
);

// Health check for user service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'User Service',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      performance: 'GET /api/user/performance',
      dashboard: 'GET /api/user/dashboard',
      history: 'GET /api/user/history',
      profile: 'GET|PUT /api/user/profile',
      feedback: 'POST /api/user/attempts/:recordId/feedback',
      statistics: 'GET /api/user/statistics/*',
      progress: 'GET /api/user/progress',
      ranking: 'GET /api/user/ranking/:testId',
      // NEW: Untimed practice endpoints
      'untimed-practice': {
        next: 'GET /api/user/untimed-practice/next',
        trackAnswer: 'POST /api/user/untimed-practice/track-answer',
        trackSkip: 'POST /api/user/untimed-practice/track-skip',
        stats: 'GET /api/user/untimed-practice/stats',
        reset: 'POST /api/user/untimed-practice/reset'
      }
    }
  });
});

module.exports = router;