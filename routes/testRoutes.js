const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const testController = require('../controllers/testController');

// Get all tests (Public)
router.get('/', testController.getAllTests);

// Get tests by specific type (Public)
router.get('/type/:testType', testController.getTestsByType);

// Get specific test by ID (Public)
router.get('/:id', testController.getTestById);

// Start a test session
router.post('/:id/start', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
], testController.startTestSession);

// Submit test answers
router.post('/:sessionId/submit', testController.submitTest);

// End test session
router.post('/:sessionId/end', testController.endTestSession);

// Get test session status
router.get('/session/:sessionId/status', testController.getSessionStatus);

module.exports = router;