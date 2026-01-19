const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getNextQuestion,
  trackAnswer,
  trackSkip,
  getUserStats,
  resetProgress
} = require('../controllers/untimedPracticeController');

// Middleware to ensure all routes are authenticated
router.use(authenticateToken);

// Get next random question for practice
// GET /api/user/untimed-practice/next?area=1&difficulty=Medium&sortBy=random
router.get('/next', getNextQuestion);

// Track user's answer to a question
// POST /api/user/untimed-practice/track-answer
router.post('/track-answer', trackAnswer);

// Track when user skips a question
// POST /api/user/untimed-practice/track-skip
router.post('/track-skip', trackSkip);

// Get user's practice statistics
// GET /api/user/untimed-practice/stats?subject=1
router.get('/stats', getUserStats);

// Reset user's progress (for testing or restart)
// DELETE /api/user/untimed-practice/reset
router.delete('/reset', resetProgress);

module.exports = router;