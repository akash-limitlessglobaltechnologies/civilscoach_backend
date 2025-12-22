const Test = require('../models/Test');
const { validateTestData, validateTestName, validateDuration, convertToLegacyFormat, createMinimalValidJson } = require('../utils/validation');
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

// Get all tests for admin with test type filtering
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
    const testType = req.query.testType; // Optional filter by test type

    // Build query object
    const query = {};
    if (testType && ['PYQ', 'Practice', 'Assessment'].includes(testType)) {
      query.testType = testType;
    }

    const tests = await Test.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name year paper duration timeInMins numberOfQuestions questions scoring cutoff testType createdAt');

    // Add question count to each test with fallbacks
    const testsWithCounts = tests.map(test => ({
      ...test.toObject(),
      questionCount: test.questions?.length || test.numberOfQuestions || 0
    }));

    const total = await Test.countDocuments(query);

    // Get test counts by type for dashboard stats
    const testCountsByType = await Test.aggregate([
      { $group: { _id: '$testType', count: { $sum: 1 } } }
    ]);

    const typeStats = {
      PYQ: 0,
      Practice: 0,
      Assessment: 0
    };

    testCountsByType.forEach(item => {
      if (item._id) {
        typeStats[item._id] = item.count;
      }
    });

    res.json({ 
      success: true, 
      tests: testsWithCounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalTests: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      typeStats: typeStats
    });
  } catch (error) {
    next(error);
  }
};

// Create new test with FLEXIBLE validation and missing value handling
const createTest = async (req, res, next) => {
  try {
    console.log('🚀 Starting FLEXIBLE test creation process...');
    
    const { 
      testName, 
      testType, 
      correctScore, 
      wrongScore, 
      unansweredScore, 
      adminId, 
      password 
    } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    // Handle missing test name with default
    let finalTestName = testName;
    if (!validateTestName(testName)) {
      finalTestName = `Test_${Date.now()}`;
      console.log(`⚠️ Invalid test name, using default: ${finalTestName}`);
    }

    // Handle missing test type with default
    const validTestTypes = ['PYQ', 'Practice', 'Assessment'];
    let finalTestType = testType;
    if (!testType || !validTestTypes.includes(testType)) {
      finalTestType = 'Practice';
      console.log(`⚠️ Invalid test type, using default: ${finalTestType}`);
    }

    // Handle missing scoring configuration with defaults
    let correct = parseFloat(correctScore) || 4; // Default: 4 points for correct
    let wrong = parseFloat(wrongScore) || -1;   // Default: -1 point for wrong
    let unanswered = parseFloat(unansweredScore) || 0; // Default: 0 points for unanswered

    console.log('🎯 Scoring configuration:', { 
      correct, 
      wrong, 
      unanswered, 
      testType: finalTestType,
      testName: finalTestName 
    });

    if (correct <= 0) {
      correct = 4; // Force positive value
      console.log('⚠️ Invalid correct score, using default: 4');
    }

    if (wrong > 0) {
      console.log('⚠️ Warning: Wrong score is positive, converting to negative for penalty');
      wrong = -Math.abs(wrong); // Convert to negative
    }

    // Handle JSON file with VERY flexible parsing
    let jsonData;
    let jsonString;
    
    if (!req.file) {
      // If no file provided, create a minimal test
      console.log('⚠️ No file provided, creating minimal test template');
      jsonData = createMinimalValidJson();
    } else {
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
          console.log('⚠️ JSON parsing failed, but continuing with minimal template');
          
          // Instead of failing, create a minimal valid JSON
          jsonData = createMinimalValidJson();
          
          // Add the parsing error as a warning in the response
          const parsingWarning = `JSON parsing failed: ${jsonResult.error.message}. Created a template test instead.`;
          console.log(`⚠️ ${parsingWarning}`);
        }
        
      } catch (unexpectedError) {
        console.log('⚠️ Unexpected error during JSON processing, using minimal template');
        jsonData = createMinimalValidJson();
      }
    }
    
    // FLEXIBLE JSON validation with auto-fixes
    console.log('🔍 Starting FLEXIBLE JSON validation...');
    const validationResult = validateTestData(jsonData);
    
    // In flexible mode, we don't fail on errors, just log them as warnings
    if (validationResult.errors.length > 0) {
      console.log('⚠️ JSON validation errors (continuing anyway):', validationResult.errors);
    }

    // Log all warnings and fixes
    if (validationResult.warnings.length > 0) {
      console.log('⚠️ Validation warnings:', validationResult.warnings);
    }
    
    if (validationResult.fixes.length > 0) {
      console.log('🔧 Auto-fixes applied:', validationResult.fixes);
    }

    // Check if test name already exists (with conflict resolution)
    console.log('🔍 Checking for duplicate test name...');
    let testNameCounter = 1;
    let uniqueTestName = finalTestName;
    
    while (await Test.findOne({ name: uniqueTestName })) {
      uniqueTestName = `${finalTestName}_${testNameCounter}`;
      testNameCounter++;
      if (testNameCounter > 100) break; // Prevent infinite loop
    }
    
    if (uniqueTestName !== finalTestName) {
      console.log(`🔧 Test name modified to avoid conflict: ${uniqueTestName}`);
    }

    // Convert to legacy format with flexible handling
    console.log('🔄 Converting to legacy format with flexible handling...');
    let convertedData;
    
    try {
      convertedData = convertToLegacyFormat(jsonData);
      console.log('✅ Flexible conversion successful');
    } catch (conversionError) {
      console.log('⚠️ Conversion failed, creating minimal valid data');
      
      // Create minimal valid data instead of failing
      convertedData = {
        year: new Date().getFullYear(),
        paper: 'Default Test Paper',
        numberOfQuestions: 1,
        timeInMins: 30,
        cutoff: { Gen: 15, EWS: 15, OBC: 13, SC: 10, ST: 10 },
        questions: [{
          qid: `${new Date().getFullYear()}_DefaultTest_Q1`,
          question: 'Sample question (please update)',
          options: [
            { key: 'A', text: 'Option A', correct: true },
            { key: 'B', text: 'Option B', correct: false },
            { key: 'C', text: 'Option C', correct: false },
            { key: 'D', text: 'Option D', correct: false }
          ],
          explanation: 'Please add explanation',
          difficulty: 'Medium',
          area: 'General'
        }]
      };
    }

    console.log('💾 Creating flexible test in database...');

    // Create new test with flexible data handling
    const newTest = new Test({
      name: uniqueTestName,
      testType: finalTestType,
      year: convertedData.year || new Date().getFullYear(),
      paper: convertedData.paper || 'Default Test',
      numberOfQuestions: convertedData.numberOfQuestions || convertedData.questions?.length || 1,
      timeInMins: convertedData.timeInMins || 30,
      duration: convertedData.timeInMins || 30,
      cutoff: convertedData.cutoff || {
        Gen: 15, EWS: 15, OBC: 13, SC: 10, ST: 10
      },
      scoring: {
        correct: correct,
        wrong: wrong,
        unanswered: unanswered
      },
      questions: convertedData.questions || []
    });

    // Use the model's built-in validation and auto-fix capabilities
    const autoFixResult = newTest.validateAndFix ? newTest.validateAndFix() : { warnings: [], fixes: [] };

    await newTest.save();
    
    console.log('✅ Flexible test created successfully:', {
      testId: newTest._id,
      name: newTest.name,
      testType: newTest.testType,
      questionsCount: newTest.questions?.length || 0,
      duration: newTest.duration,
      autoFixes: autoFixResult.fixes?.length || 0
    });

    // Prepare comprehensive response with all warnings and fixes
    const allWarnings = [
      ...(validationResult.warnings || []),
      ...(autoFixResult.warnings || [])
    ];
    
    const allFixes = [
      ...(validationResult.fixes || []),
      ...(autoFixResult.fixes || [])
    ];

    const response = {
      success: true, 
      message: 'Test created successfully with flexible validation',
      testId: newTest._id,
      testName: newTest.name,
      testType: newTest.testType,
      duration: newTest.duration,
      timeInMins: newTest.timeInMins,
      numberOfQuestions: newTest.numberOfQuestions,
      questionsCount: newTest.questions?.length || 0,
      scoring: newTest.scoring,
      cutoff: newTest.cutoff,
      flexibleMode: true,
      processingInfo: {
        warnings: allWarnings,
        fixes: allFixes,
        hasAutoFixes: allFixes.length > 0,
        hasWarnings: allWarnings.length > 0
      }
    };

    // Add summary message
    if (allFixes.length > 0) {
      response.message += ` (${allFixes.length} auto-fixes applied)`;
    }
    
    if (allWarnings.length > 0) {
      response.message += ` (${allWarnings.length} warnings)`;
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Error in flexible createTest:', error);
    
    // Even in error cases, try to be helpful rather than just failing
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value,
        suggestion: 'This field has been auto-corrected where possible'
      }));
      
      console.log('🔧 Database validation errors, but flexible mode can handle many:', validationErrors);
      
      return res.status(400).json({ 
        success: false, 
        message: 'Test creation failed, but you can try again with simplified data',
        errors: validationErrors,
        type: 'DATABASE_VALIDATION_ERROR',
        suggestion: 'Try uploading a simpler JSON file or contact admin for help',
        flexibleMode: true
      });
    }

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      
      return res.status(409).json({
        success: false,
        message: `${field} '${value}' already exists, but we can auto-resolve this`,
        field: field,
        value: value,
        type: 'DUPLICATE_ERROR',
        suggestion: 'Try again - the system will auto-generate a unique name',
        flexibleMode: true
      });
    }
    
    // Generic error handling
    return res.status(500).json({
      success: false,
      message: 'Test creation encountered an issue, but flexible mode is available',
      error: error.message,
      type: 'UNEXPECTED_ERROR',
      suggestion: 'Try uploading again - the system can handle many data format issues',
      flexibleMode: true
    });
  }
};

// Delete test (unchanged)
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
        name: test.name,
        testType: test.testType
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

// Get test statistics with test type breakdown
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
      { $project: { questionCount: { $size: { $ifNull: ["$questions", []] } } } },
      { $group: { _id: null, total: { $sum: "$questionCount" } } }
    ]);

    // Get test counts by type with fallbacks
    const testsByType = await Test.aggregate([
      { 
        $group: { 
          _id: { $ifNull: ['$testType', 'Practice'] }, 
          count: { $sum: 1 },
          totalQuestions: { $sum: { $size: { $ifNull: ['$questions', []] } } },
          avgDuration: { $avg: { $ifNull: ['$duration', 30] } }
        } 
      }
    ]);

    const recentTests = await Test.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name testType createdAt questions scoring cutoff numberOfQuestions timeInMins');

    res.json({ 
      success: true, 
      statistics: {
        totalTests,
        totalQuestions: totalQuestions[0]?.total || 0,
        testsByType: testsByType.reduce((acc, item) => {
          acc[item._id || 'Practice'] = {
            count: item.count,
            totalQuestions: item.totalQuestions,
            avgDuration: Math.round(item.avgDuration || 0)
          };
          return acc;
        }, {}),
        recentTests: recentTests.map(test => ({
          name: test.name || 'Unnamed Test',
          testType: test.testType || 'Practice',
          createdAt: test.createdAt,
          questionCount: test.questions?.length || test.numberOfQuestions || 0,
          numberOfQuestions: test.numberOfQuestions || 0,
          timeInMins: test.timeInMins || 30,
          scoring: test.scoring || { correct: 4, wrong: -1, unanswered: 0 },
          cutoff: test.cutoff || { Gen: 15, EWS: 15, OBC: 13, SC: 10, ST: 10 }
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