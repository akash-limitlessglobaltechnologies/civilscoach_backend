const Test = require('../models/Test');
const { validateTestData, validateTestName, validateDuration, convertToLegacyFormat } = require('../utils/validation');
const { cleanAndValidateJson } = require('../utils/jsonAnalyzer');

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

// Create new test with enhanced error handling
const createTest = async (req, res, next) => {
  try {
    console.log('🚀 Starting test creation process...');
    
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
        message: 'JSON file is required',
        details: 'Please upload a JSON file containing test questions'
      });
    }

    console.log('📄 File uploaded:', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Validate test name
    if (!validateTestName(testName)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Test name must be between 3 and 200 characters',
        field: 'testName',
        provided: testName
      });
    }

    // Validate scoring configuration with defaults
    let correct = parseFloat(correctScore) || 4; // Default: 4 points for correct
    let wrong = parseFloat(wrongScore) || -1;   // Default: -1 point for wrong
    let unanswered = parseFloat(unansweredScore) || 0; // Default: 0 points for unanswered

    console.log('🎯 Scoring configuration:', { correct, wrong, unanswered });

    if (correct <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Correct score must be a positive number',
        field: 'correctScore',
        provided: correctScore
      });
    }

    if (wrong > 0) {
      console.log('⚠️ Warning: Wrong score is positive, converting to negative for penalty');
      wrong = -Math.abs(wrong); // Convert to negative
    }

    // Parse JSON file with detailed error handling and auto-fixing
    let jsonData;
    let jsonString;
    
    try {
      jsonString = req.file.buffer.toString('utf8');
      console.log('📖 File content preview (first 200 chars):', jsonString.substring(0, 200) + '...');
      
      // Use the enhanced JSON analyzer to clean and validate
      const jsonResult = cleanAndValidateJson(jsonString);
      
      if (jsonResult.success) {
        jsonData = jsonResult.data;
        console.log('✅ JSON parsing successful');
        
        // Log if fixes were applied
        if (jsonResult.fixed) {
          console.log('🔧 JSON was automatically fixed for control characters');
        }
      } else {
        console.error('❌ JSON parsing failed:', jsonResult.error.message);
        
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid JSON file format',
          error: jsonResult.error.message,
          details: jsonResult.analysis,
          suggestions: jsonResult.analysis?.suggestions || [
            'Check for control characters like unescaped line breaks',
            'Ensure all strings are properly quoted with double quotes',
            'Verify proper JSON structure with matching brackets and braces'
          ],
          type: 'JSON_PARSE_ERROR',
          position: jsonResult.analysis?.position,
          line: jsonResult.analysis?.line,
          column: jsonResult.analysis?.column,
          context: jsonResult.analysis?.context
        });
      }
      
    } catch (unexpectedError) {
      console.error('❌ Unexpected error during JSON processing:', unexpectedError);
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to process JSON file',
        error: 'Unexpected error during file processing',
        type: 'PROCESSING_ERROR'
      });
    }
    
    // Validate JSON structure with enhanced validation
    console.log('🔍 Starting JSON validation...');
    const validationResult = validateTestData(jsonData);
    
    if (validationResult.errors.length > 0) {
      console.error('❌ JSON validation failed:', validationResult.errors);
      
      return res.status(400).json({ 
        success: false, 
        message: 'JSON validation failed',
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        type: 'VALIDATION_ERROR',
        details: 'The JSON structure or data does not meet the required format'
      });
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.log('⚠️ Validation warnings:', validationResult.warnings);
    }

    // Check if test name already exists
    console.log('🔍 Checking for duplicate test name...');
    const existingTest = await Test.findOne({ name: testName });
    if (existingTest) {
      return res.status(409).json({ 
        success: false, 
        message: 'Test with this name already exists',
        field: 'testName',
        existing: existingTest.name
      });
    }

    // Convert new format to legacy format for database storage
    console.log('🔄 Converting to legacy format...');
    let convertedData;
    
    try {
      convertedData = convertToLegacyFormat(jsonData);
      console.log('✅ Conversion successful');
    } catch (conversionError) {
      console.error('❌ Conversion failed:', conversionError.message);
      
      return res.status(400).json({
        success: false,
        message: 'Failed to process test data',
        error: conversionError.message,
        type: 'CONVERSION_ERROR'
      });
    }

    // Use duration from JSON file (already validated and set with defaults)
    const testDuration = jsonData.timeInMins;

    console.log('💾 Creating test in database...');

    // Create new test with custom scoring and cutoff data
    const newTest = new Test({
      name: testName.trim(),
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
    
    console.log('✅ Test created successfully:', {
      testId: newTest._id,
      name: newTest.name,
      questionsCount: newTest.questions.length,
      duration: newTest.duration
    });

    // Prepare response with detailed information
    const response = {
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
    };

    // Include warnings if any
    if (validationResult.warnings.length > 0) {
      response.warnings = validationResult.warnings;
      response.message += ` (${validationResult.warnings.length} warnings)`;
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Unexpected error in createTest:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      console.error('Database validation errors:', validationErrors);
      
      return res.status(400).json({ 
        success: false, 
        message: 'Database validation error',
        errors: validationErrors,
        type: 'DATABASE_VALIDATION_ERROR'
      });
    }

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      
      console.error('Duplicate key error:', { field, value });
      
      return res.status(409).json({
        success: false,
        message: `${field} '${value}' already exists`,
        field: field,
        value: value,
        type: 'DUPLICATE_ERROR'
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
      message: 'Test deleted successfully',
      deletedTest: {
        id: testId,
        name: test.name
      }
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid test ID format',
        providedId: req.params.testId
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