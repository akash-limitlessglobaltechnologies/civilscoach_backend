const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Admin login
router.post('/login', [
  body('adminId')
    .notEmpty()
    .withMessage('Admin ID is required')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], adminController.adminLogin);

// Get all tests for admin
router.post('/tests', adminController.getAdminTests);

// Create new test
router.post('/create-test', upload.single('jsonFile'), [
  body('testName')
    .notEmpty()
    .withMessage('Test name is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Test name must be between 3 and 200 characters')
    .trim(),
  body('duration')
    .isInt({ min: 1, max: 300 })
    .withMessage('Duration must be between 1 and 300 minutes'),
  body('adminId')
    .notEmpty()
    .withMessage('Admin ID is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], adminController.createTest);

// Delete test
router.delete('/tests/:testId', adminController.deleteTest);

// Get test statistics
router.post('/statistics', adminController.getTestStatistics);

// ========================================
// QUESTION BANK ROUTES
// ========================================

// Upload questions to question bank
router.post('/question-bank/upload', upload.single('jsonFile'), [
  body('adminId')
    .notEmpty()
    .withMessage('Admin ID is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], adminController.uploadQuestionBank);

// Get question bank statistics
router.post('/question-bank/statistics', adminController.getQuestionBankStats);

// Get question bank list with filters
router.post('/question-bank/list', adminController.getQuestionBankList);

// Delete questions from question bank
router.post('/question-bank/delete', [
  body('questionIds')
    .isArray({ min: 1 })
    .withMessage('Question IDs array is required with at least one ID'),
  body('adminId')
    .notEmpty()
    .withMessage('Admin ID is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], adminController.deleteQuestionBankQuestions);

// Generate test from question bank
router.post('/question-bank/generate-test', [
  body('testName')
    .notEmpty()
    .withMessage('Test name is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Test name must be between 3 and 200 characters')
    .trim(),
  body('duration')
    .isInt({ min: 1, max: 300 })
    .withMessage('Duration must be between 1 and 300 minutes'),
  body('questionCount')
    .isInt({ min: 1, max: 200 })
    .withMessage('Question count must be between 1 and 200'),
  body('adminId')
    .notEmpty()
    .withMessage('Admin ID is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], adminController.generateTestFromQuestionBank);

module.exports = router;