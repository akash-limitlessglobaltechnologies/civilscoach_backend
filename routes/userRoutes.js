const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');

// Get user performance by email
router.post('/performance', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
], userController.getUserPerformance);

// Get detailed user test history
router.post('/history', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
], userController.getUserTestHistory);

// Get detailed user test history by testId
router.post('/history/:testId', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
], userController.getUserTestHistory);

module.exports = router;