const express = require('express');
const router = express.Router();
const { query, param } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const testController = require('../controllers/testController');

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
const validateTestQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('testType').optional().isIn(['PYQ', 'Practice', 'Assessment']).withMessage('Invalid test type')
];

const validateTestType = [
  param('testType').isIn(['PYQ', 'Practice', 'Assessment']).withMessage('Test type must be PYQ, Practice, or Assessment')
];

const validateObjectId = [
  param('id').isMongoId().withMessage('Invalid test ID format'),
  param('sessionId').optional().isMongoId().withMessage('Invalid session ID format')
];

const validateLeaderboardQuery = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Public Test Routes (No authentication required)

// Get all tests with optional filtering and pagination
router.get('/', 
  validateTestQuery,
  handleValidationErrors,
  testController.getAllTests
);

// Get tests by specific type
router.get('/type/:testType', 
  validateTestType,
  validateTestQuery,
  handleValidationErrors,
  testController.getTestsByType
);

// Get specific test by ID
router.get('/:id', 
  validateObjectId,
  handleValidationErrors,
  testController.getTestById
);

// Get test leaderboard (public)
router.get('/:id/leaderboard', 
  validateObjectId,
  validateLeaderboardQuery,
  handleValidationErrors,
  testController.getTestLeaderboard
);

// Protected Test Routes (Requires authentication)

// Start a test session
router.post('/:id/start', 
  authenticateToken,
  validateObjectId,
  handleValidationErrors,
  testController.startTestSession
);

// Submit test answers
router.post('/:sessionId/submit', 
  authenticateToken,
  [
    param('sessionId').notEmpty().withMessage('Session ID is required'),
    // Add body validation for answers if needed
  ],
  handleValidationErrors,
  testController.submitTest
);

// End test session (for early termination)
router.post('/:sessionId/end', 
  authenticateToken,
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  handleValidationErrors,
  testController.endTestSession
);

// Get test session status
router.get('/session/:sessionId/status', 
  authenticateToken,
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  handleValidationErrors,
  testController.getSessionStatus
);

// Additional Test Analytics Routes

// Get test statistics (public)
router.get('/:id/statistics', 
  validateObjectId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const { id } = req.params;

      const stats = await UserTestRecord.getTestStatistics(id);
      
      if (!stats || stats.length === 0) {
        return res.json({
          success: true,
          message: 'No statistics available for this test',
          statistics: null
        });
      }

      const testStats = stats[0];
      
      res.json({
        success: true,
        statistics: {
          totalAttempts: testStats.totalAttempts,
          averageScore: Math.round(testStats.averageScore * 100) / 100,
          averagePercentage: Math.round(testStats.averagePercentage * 10) / 10,
          averageTime: Math.round(testStats.averageTime * 10) / 10,
          highestScore: testStats.highestScore,
          lowestScore: testStats.lowestScore,
          timeoutRate: Math.round(testStats.timeoutRate * 1000) / 10 // Convert to percentage
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

// Get test difficulty analysis (public)
router.get('/:id/difficulty-analysis', 
  validateObjectId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const Test = require('../models/Test');
      const UserTestRecord = require('../models/UserTestRecord');
      const { id } = req.params;

      // Get test details
      const test = await Test.findById(id).select('questions');
      if (!test) {
        return res.status(404).json({
          success: false,
          message: 'Test not found'
        });
      }

      // Analyze question difficulty from user responses
      const difficultyAnalysis = await UserTestRecord.aggregate([
        { $match: { testId: mongoose.Types.ObjectId(id) } },
        {
          $project: {
            answers: { $objectToArray: '$answers' }
          }
        },
        { $unwind: '$answers' },
        {
          $group: {
            _id: '$answers.k', // question index
            totalAttempts: { $sum: 1 },
            correctAnswers: {
              $sum: {
                $cond: ['$answers.v.isCorrect', 1, 0]
              }
            }
          }
        },
        {
          $project: {
            questionIndex: '$_id',
            totalAttempts: 1,
            correctAnswers: 1,
            successRate: {
              $round: [
                { $multiply: [{ $divide: ['$correctAnswers', '$totalAttempts'] }, 100] },
                1
              ]
            }
          }
        },
        { $sort: { questionIndex: 1 } }
      ]);

      // Merge with test question data
      const analysisWithQuestions = difficultyAnalysis.map(analysis => {
        const questionIndex = parseInt(analysis.questionIndex);
        const question = test.questions[questionIndex];
        
        return {
          questionIndex,
          successRate: analysis.successRate,
          totalAttempts: analysis.totalAttempts,
          correctAnswers: analysis.correctAnswers,
          question: question ? {
            difficulty: question.difficulty,
            area: question.area,
            subarea: question.subarea
          } : null,
          actualDifficulty: analysis.successRate > 80 ? 'Easy' : 
                          analysis.successRate > 50 ? 'Medium' : 'Hard'
        };
      });

      res.json({
        success: true,
        testId: id,
        difficultyAnalysis: analysisWithQuestions
      });

    } catch (error) {
      next(error);
    }
  }
);

// Get popular tests (based on attempt count)
router.get('/analytics/popular', 
  validateTestQuery,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const limit = parseInt(req.query.limit) || 10;

      const popularTests = await UserTestRecord.aggregate([
        {
          $group: {
            _id: '$testId',
            attemptCount: { $sum: 1 },
            averageScore: { $avg: '$score' },
            averagePercentage: { $avg: '$percentage' },
            testName: { $first: '$testName' },
            testType: { $first: '$testType' }
          }
        },
        { $sort: { attemptCount: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'tests',
            localField: '_id',
            foreignField: '_id',
            as: 'testDetails'
          }
        },
        {
          $project: {
            testId: '$_id',
            testName: 1,
            testType: 1,
            attemptCount: 1,
            averageScore: { $round: ['$averageScore', 2] },
            averagePercentage: { $round: ['$averagePercentage', 1] },
            testDetails: { $arrayElemAt: ['$testDetails', 0] }
          }
        }
      ]);

      res.json({
        success: true,
        popularTests: popularTests.map(test => ({
          testId: test.testId,
          testName: test.testName,
          testType: test.testType,
          attemptCount: test.attemptCount,
          averageScore: test.averageScore,
          averagePercentage: test.averagePercentage,
          duration: test.testDetails?.duration,
          questionCount: test.testDetails?.questions?.length || test.testDetails?.numberOfQuestions
        }))
      });

    } catch (error) {
      next(error);
    }
  }
);

// Get test recommendations for authenticated users
router.get('/recommendations/for-user', 
  authenticateToken,
  async (req, res, next) => {
    try {
      const UserTestRecord = require('../models/UserTestRecord');
      const Test = require('../models/Test');
      const userId = req.user.userId;
      const email = req.user.email;
      
      // Get user's test history to analyze performance
      const userHistory = await UserTestRecord.find({
        $or: [
          { userId: userId },
          { email: email.toLowerCase().trim() }
        ]
      }).select('testType score percentage testId').sort({ completedAt: -1 }).limit(20);

      // Analyze user's weak areas
      const testTypePerformance = {};
      userHistory.forEach(record => {
        const testType = record.testType;
        if (!testTypePerformance[testType]) {
          testTypePerformance[testType] = { total: 0, sum: 0, average: 0 };
        }
        testTypePerformance[testType].total += 1;
        testTypePerformance[testType].sum += record.percentage;
      });

      // Calculate averages and find weak areas
      Object.keys(testTypePerformance).forEach(type => {
        const perf = testTypePerformance[type];
        perf.average = perf.sum / perf.total;
      });

      // Find test types where user needs improvement
      const weakAreas = Object.entries(testTypePerformance)
        .filter(([type, perf]) => perf.average < 70)
        .map(([type]) => type);

      // Get tests user hasn't attempted
      const attemptedTestIds = userHistory.map(record => record.testId);
      
      let recommendedTests = [];

      if (weakAreas.length > 0) {
        // Recommend tests from weak areas
        recommendedTests = await Test.find({
          _id: { $nin: attemptedTestIds },
          testType: { $in: weakAreas },
          isActive: true
        }).limit(5).select('name testType duration numberOfQuestions year paper');
      } else {
        // Recommend popular tests user hasn't tried
        recommendedTests = await Test.find({
          _id: { $nin: attemptedTestIds },
          isActive: true
        }).limit(5).select('name testType duration numberOfQuestions year paper');
      }

      res.json({
        success: true,
        recommendations: {
          weakAreas: weakAreas,
          testTypePerformance: testTypePerformance,
          recommendedTests: recommendedTests.map(test => ({
            id: test._id,
            name: test.name,
            testType: test.testType,
            duration: test.duration,
            questionCount: test.numberOfQuestions,
            year: test.year,
            paper: test.paper
          }))
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

// Health check for test service
router.get('/health/status', (req, res) => {
  res.json({
    success: true,
    service: 'Test Service',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      getTests: 'GET /api/tests',
      getTestsByType: 'GET /api/tests/type/:testType',
      getTestById: 'GET /api/tests/:id',
      startSession: 'POST /api/tests/:id/start',
      submitTest: 'POST /api/tests/:sessionId/submit',
      endSession: 'POST /api/tests/:sessionId/end',
      getSessionStatus: 'GET /api/tests/session/:sessionId/status',
      getLeaderboard: 'GET /api/tests/:id/leaderboard',
      getStatistics: 'GET /api/tests/:id/statistics',
      getRecommendations: 'GET /api/tests/recommendations/for-user'
    }
  });
});

module.exports = router;