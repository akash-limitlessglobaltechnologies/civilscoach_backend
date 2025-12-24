const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const userController = require('../controllers/userController');

// Get user performance (protected route - no email validation needed as it comes from token)
router.get('/performance', authenticateToken, userController.getUserPerformance);

// Get detailed user test history (protected route)
router.get('/history', authenticateToken, userController.getUserTestHistory);

// Get detailed user test history by testId (protected route)
router.get('/history/:testId', authenticateToken, userController.getUserTestHistory);

module.exports = router;