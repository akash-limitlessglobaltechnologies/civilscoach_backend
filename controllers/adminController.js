const Test = require('../models/Test');
const { validateTestData, validateTestName, validateDuration, convertToLegacyFormat } = require('../utils/validation');

// Admin login
const adminLogin = async (req, res, next) => {
  try {
    const { adminId, password } = req.body;

    if (!adminId || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin ID and password are required' 
      });
    }

    // Check admin credentials
    const validAdminId = process.env.ADMIN_ID || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (adminId !== validAdminId || password !== validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Admin login successful',
      adminId: adminId
    });
  } catch (error) {
    next(error);
  }
};

// Get all tests for admin
const getAdminTests = async (req, res, next) => {
  try {
    const { adminId, password } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const tests = await Test.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name year paper duration timeInMins numberOfQuestions questions scoring cutoff createdAt');

    // Add question count to each test
    const testsWithCounts = tests.map(test => ({
      ...test.toObject(),
      questionCount: test.questions.length
    }));

    const total = await Test.countDocuments();

    res.json({ 
      success: true, 
      tests: testsWithCounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalTests: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create new test
const createTest = async (req, res, next) => {
  try {
    const { testName, correctScore, wrongScore, unansweredScore, adminId, password } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'JSON file is required' 
      });
    }

    // Validate test name
    if (!validateTestName(testName)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Test name must be between 3 and 200 characters' 
      });
    }

    // Validate scoring configuration
    const correct = parseFloat(correctScore);
    const wrong = parseFloat(wrongScore);
    const unanswered = parseFloat(unansweredScore);

    if (isNaN(correct) || correct <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Correct score must be a positive number' 
      });
    }

    if (isNaN(wrong)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wrong score must be a valid number' 
      });
    }

    if (wrong > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wrong score should not be positive (use 0 or negative for penalty)' 
      });
    }

    if (isNaN(unanswered)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Unanswered score must be a valid number' 
      });
    }

    // Parse JSON file
    let jsonData;
    try {
      jsonData = JSON.parse(req.file.buffer.toString());
    } catch (parseError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON file format' 
      });
    }
    
    // Validate JSON structure
    const validationErrors = validateTestData(jsonData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'JSON validation failed',
        errors: validationErrors
      });
    }

    // Check if test name already exists
    const existingTest = await Test.findOne({ name: testName });
    if (existingTest) {
      return res.status(409).json({ 
        success: false, 
        message: 'Test with this name already exists' 
      });
    }

    // Convert new format to legacy format for database storage
    const convertedData = convertToLegacyFormat(jsonData);

    // Use duration from JSON file
    const testDuration = jsonData.timeInMins;

    // Validate duration from JSON
    if (!validateDuration(testDuration)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Duration in JSON file must be between 1 and 600 minutes' 
      });
    }

    // Create new test with custom scoring and cutoff data
    const newTest = new Test({
      name: testName,
      year: convertedData.year,
      paper: convertedData.paper,
      numberOfQuestions: convertedData.numberOfQuestions,
      timeInMins: convertedData.timeInMins,
      duration: testDuration,
      cutoff: convertedData.cutoff,
      scoring: {
        correct: correct,
        wrong: wrong,
        unanswered: unanswered
      },
      questions: convertedData.questions
    });

    await newTest.save();

    res.status(201).json({ 
      success: true, 
      message: 'Test created successfully',
      testId: newTest._id,
      testName: newTest.name,
      duration: newTest.duration,
      timeInMins: newTest.timeInMins,
      numberOfQuestions: newTest.numberOfQuestions,
      questionsCount: newTest.questions.length,
      scoring: newTest.scoring,
      cutoff: newTest.cutoff
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Database validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    next(error);
  }
};

// Delete test
const deleteTest = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { adminId, password } = req.body;

    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found' 
      });
    }

    await Test.findByIdAndDelete(testId);

    res.json({ 
      success: true, 
      message: 'Test deleted successfully' 
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid test ID format' 
      });
    }
    next(error);
  }
};

// Get test statistics
const getTestStatistics = async (req, res, next) => {
  try {
    const { adminId, password } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    const totalTests = await Test.countDocuments();
    const totalQuestions = await Test.aggregate([
      { $project: { questionCount: { $size: "$questions" } } },
      { $group: { _id: null, total: { $sum: "$questionCount" } } }
    ]);

    const recentTests = await Test.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt questions scoring cutoff numberOfQuestions timeInMins');

    res.json({ 
      success: true, 
      statistics: {
        totalTests,
        totalQuestions: totalQuestions[0]?.total || 0,
        recentTests: recentTests.map(test => ({
          name: test.name,
          createdAt: test.createdAt,
          questionCount: test.questions.length,
          numberOfQuestions: test.numberOfQuestions,
          timeInMins: test.timeInMins,
          scoring: test.scoring,
          cutoff: test.cutoff
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminLogin,
  getAdminTests,
  createTest,
  deleteTest,
  getTestStatistics
};