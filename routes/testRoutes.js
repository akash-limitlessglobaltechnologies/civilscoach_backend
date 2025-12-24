const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const testController = require('../controllers/testController');

// Get all tests (Public - no auth required)
router.get('/', testController.getAllTests);

// Get tests by specific type (Public - no auth required)
router.get('/type/:testType', testController.getTestsByType);

// Get specific test by ID (Public - no auth required)
router.get('/:id', testController.getTestById);

// Start a test session (Protected - requires authentication)
router.post('/:id/start', authenticateToken, testController.startTestSession);

// Submit test answers (Protected - requires authentication)
router.post('/:sessionId/submit', authenticateToken, testController.submitTest);

// End test session (Protected - requires authentication)
router.post('/:sessionId/end', authenticateToken, testController.endTestSession);

// Get test session status (Protected - requires authentication)
router.get('/session/:sessionId/status', authenticateToken, testController.getSessionStatus);

module.exports = router;