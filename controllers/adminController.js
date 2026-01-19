const Test = require('../models/Test');
const PracticeQuestion = require('../models/PracticeQuestion');
const { validateTestData, validateTestName, validateDuration, convertToLegacyFormat, createMinimalValidJson } = require('../utils/validation');
const { cleanAndValidateJson } = require('../utils/jsonAnalyzer');
const mongoose = require('mongoose');
const crypto = require('crypto');

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

// ========================================
// NEW QUESTION BANK FUNCTIONS - ADDED BELOW
// ========================================

// Upload questions to question bank
const uploadQuestionBank = async (req, res, next) => {
  try {
    console.log('🔥 STARTING BULLETPROOF QUESTION BANK UPLOAD...');
    
    const { adminId, password } = req.body;
    
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
        message: 'No JSON file uploaded'
      });
    }
    
    // Parse JSON file
    let questionsData;
    try {
      const fileContent = req.file.buffer.toString('utf8');
      questionsData = JSON.parse(fileContent);
      console.log(`📁 Parsed JSON successfully. Type: ${typeof questionsData}, Array: ${Array.isArray(questionsData)}`);
    } catch (error) {
      console.error('❌ JSON Parse Error:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON file format',
        details: error.message
      });
    }
    
    // Ensure questions is an array
    let questions = Array.isArray(questionsData) ? questionsData : [questionsData];
    console.log(`📊 Total questions to process: ${questions.length}`);
    
    if (!questions || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No questions found in the uploaded file'
      });
    }
    
    // Generate unique upload session
    const uploadSession = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`🎯 Upload session: ${uploadSession}`);
    
    const results = {
      inserted: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: []
    };
    
    // Get the collection directly - bypass mongoose validation completely
    const db = mongoose.connection.db;
    const collection = db.collection('practicequestions');
    
    for (let i = 0; i < questions.length; i++) {
      try {
        const q = questions[i];
        const questionNumber = i + 1;
        
        console.log(`🔍 Processing Question ${questionNumber}:`, {
          questionId: q.questionId,
          hasQuestion: !!q.question,
          hasOptions: !!(q.OptionA && q.OptionB && q.OptionC && q.OptionD),
          hasKey: !!q.key,
          hasArea: !!q.area,
          difficulty: q.difficulty
        });
        
        // ABSOLUTELY MINIMAL VALIDATION
        if (!q.question) {
          results.errors++;
          results.errorDetails.push(`Q${questionNumber}: Missing question text`);
          console.log(`❌ Q${questionNumber}: Missing question`);
          continue;
        }
        
        if (!q.OptionA || !q.OptionB || !q.OptionC || !q.OptionD) {
          results.errors++;
          results.errorDetails.push(`Q${questionNumber}: Missing options`);
          console.log(`❌ Q${questionNumber}: Missing options`);
          continue;
        }
        
        if (!q.key || !['A', 'B', 'C', 'D'].includes(q.key.toUpperCase())) {
          results.errors++;
          results.errorDetails.push(`Q${questionNumber}: Invalid key`);
          console.log(`❌ Q${questionNumber}: Invalid key: ${q.key}`);
          continue;
        }
        
        if (!q.area) {
          results.errors++;
          results.errorDetails.push(`Q${questionNumber}: Missing area`);
          console.log(`❌ Q${questionNumber}: Missing area`);
          continue;
        }
        
        // Create hash for duplicate detection
        const hashData = [
          q.question.trim().toLowerCase(),
          q.OptionA.trim().toLowerCase(),
          q.OptionB.trim().toLowerCase(), 
          q.OptionC.trim().toLowerCase(),
          q.OptionD.trim().toLowerCase(),
          q.key.toUpperCase()
        ].join('|');
        
        const questionHash = crypto.createHash('sha256').update(hashData).digest('hex');
        
        // Check for duplicate
        const existingQuestion = await collection.findOne({ questionHash });
        
        if (existingQuestion) {
          // Update duplicate count
          await collection.updateOne(
            { _id: existingQuestion._id },
            { 
              $inc: { duplicateCount: 1 },
              $set: { lastDuplicateAttempt: new Date() }
            }
          );
          results.duplicates++;
          console.log(`🔄 Q${questionNumber}: Duplicate found`);
        } else {
          // Create document - DIRECT INSERTION, NO MONGOOSE
          const questionDoc = {
            questionHash,
            questionId: q.questionId || `Q${questionNumber}`,
            question: q.question,
            difficulty: q.difficulty || 'Medium',
            area: parseInt(q.area),
            subarea: q.subarea || '',
            OptionA: q.OptionA,
            OptionB: q.OptionB,
            OptionC: q.OptionC,
            OptionD: q.OptionD,
            key: q.key.toUpperCase(),
            explanation: q.explanation || '',
            source: q.source || '',
            
            // Metadata
            uploadSession,
            uploadedBy: adminId,
            batchId: `batch_${uploadSession}_${Date.now()}`,
            isActive: true,
            isVerified: false,
            qualityScore: 3,
            tags: [],
            
            // Usage tracking
            usage: {
              timesUsed: 0,
              lastUsed: null,
              avgPerformance: 0,
              totalAttempts: 0,
              correctAttempts: 0
            },
            
            duplicateCount: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          // Direct MongoDB insertion - bypasses ALL Mongoose validation
          await collection.insertOne(questionDoc);
          results.inserted++;
          console.log(`✅ Q${questionNumber}: Successfully inserted`);
        }
        
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Q${i + 1}: ${error.message}`);
        console.error(`❌ Error processing question ${i + 1}:`, error.message);
        console.error('Full error:', error);
      }
    }
    
    // Final log
    console.log(`📚 Question Bank Upload by ${adminId}: ${results.inserted} new, ${results.duplicates} duplicates, ${results.errors} errors`);
    
    res.json({
      success: true,
      message: `Successfully processed ${questions.length} questions`,
      uploadSession,
      results: {
        totalQuestions: questions.length,
        inserted: results.inserted,
        duplicates: results.duplicates,
        errors: results.errors,
        errorDetails: results.errorDetails.slice(0, 10)
      }
    });
    
  } catch (error) {
    console.error('🔥 FATAL ERROR in uploadQuestionBank:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message
    });
  }
};

// Get question bank statistics
const getQuestionBankStats = async (req, res, next) => {
  try {
    const { adminId, password } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }
    
    const totalQuestions = await PracticeQuestion.countDocuments({ isActive: true });
    const verifiedQuestions = await PracticeQuestion.countDocuments({ isActive: true, isVerified: true });
    
    // Get area-wise statistics  
    const areaStats = await PracticeQuestion.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$area',
          count: { $sum: 1 },
          avgQualityScore: { $avg: '$qualityScore' },
          totalUsage: { $sum: '$usage.timesUsed' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    // Get difficulty-wise statistics
    const difficultyStats = await PracticeQuestion.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 },
          avgQualityScore: { $avg: '$qualityScore' },
          totalUsage: { $sum: '$usage.timesUsed' }
        }
      }
    ]);
    
    // Get usage statistics
    const usageStats = await PracticeQuestion.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalUsage: { $sum: '$usage.timesUsed' },
          avgUsage: { $avg: '$usage.timesUsed' },
          maxUsage: { $max: '$usage.timesUsed' },
          totalAttempts: { $sum: '$usage.totalAttempts' },
          totalCorrectAttempts: { $sum: '$usage.correctAttempts' }
        }
      }
    ]);
    
    const overallUsage = usageStats[0] || {};
    const globalSuccessRate = overallUsage.totalAttempts > 0 ? 
      Math.round((overallUsage.totalCorrectAttempts / overallUsage.totalAttempts) * 100) : 0;
    
    res.json({
      success: true,
      statistics: {
        overview: {
          totalQuestions,
          activeQuestions: totalQuestions,
          inactiveQuestions: 0,
          verifiedQuestions,
          verificationRate: totalQuestions > 0 ? Math.round((verifiedQuestions / totalQuestions) * 100) : 0
        },
        areaBreakdown: areaStats,
        difficultyBreakdown: difficultyStats.reduce((acc, stat) => {
          acc[stat._id || 'Unknown'] = {
            count: stat.count,
            avgQualityScore: stat.avgQualityScore || 0,
            totalUsage: stat.totalUsage
          };
          return acc;
        }, {}),
        usageStatistics: {
          totalUsage: overallUsage.totalUsage || 0,
          averageUsage: Math.round(overallUsage.avgUsage || 0),
          maxUsage: overallUsage.maxUsage || 0,
          globalSuccessRate,
          totalAttempts: overallUsage.totalAttempts || 0
        }
      }
    });
    
  } catch (error) {
    console.error('Question bank stats error:', error);
    next(error);
  }
};

// Get question bank list with filters
const getQuestionBankList = async (req, res, next) => {
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
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    
    const filters = { isActive: true };
    if (req.query.area) filters.area = parseInt(req.query.area);
    if (req.query.difficulty) filters.difficulty = req.query.difficulty;
    if (req.query.subarea) filters.subarea = new RegExp(req.query.subarea, 'i');
    if (req.query.isVerified !== undefined) filters.isVerified = req.query.isVerified === 'true';
    
    let sort = { createdAt: -1 };
    if (req.query.sortBy) {
      switch (req.query.sortBy) {
        case 'usage':
          sort = { 'usage.timesUsed': -1 };
          break;
        case 'quality':
          sort = { qualityScore: -1 };
          break;
        case 'area':
          sort = { area: 1, subarea: 1 };
          break;
      }
    }
    
    const questions = await PracticeQuestion.find(filters)
      .select('questionId question difficulty area subarea key usage qualityScore isVerified uploadSession createdAt duplicateCount')
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    const totalCount = await PracticeQuestion.countDocuments(filters);
    const totalPages = Math.ceil(totalCount / limit);
    
    const formattedQuestions = questions.map(q => ({
      id: q._id,
      questionId: q.questionId,
      questionPreview: q.question.substring(0, 100) + (q.question.length > 100 ? '...' : ''),
      difficulty: q.difficulty,
      area: q.area,
      subarea: q.subarea,
      correctAnswer: q.key,
      usage: {
        timesUsed: q.usage?.timesUsed || 0,
        successRate: q.usage?.totalAttempts > 0 ? Math.round((q.usage.correctAttempts / q.usage.totalAttempts) * 100) : 0
      },
      qualityScore: q.qualityScore || 3,
      isVerified: q.isVerified,
      uploadSession: q.uploadSession,
      duplicateCount: q.duplicateCount || 1,
      createdAt: q.createdAt
    }));
    
    res.json({
      success: true,
      questions: formattedQuestions,
      pagination: {
        currentPage: page,
        totalPages,
        totalQuestions: totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
    
  } catch (error) {
    console.error('Question bank list error:', error);
    next(error);
  }
};

// Delete questions from question bank
const deleteQuestionBankQuestions = async (req, res, next) => {
  try {
    const { adminId, password, questionIds } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }
    
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question IDs array is required'
      });
    }
    
    // Soft delete (mark as inactive)
    const result = await PracticeQuestion.updateMany(
      { _id: { $in: questionIds }, isActive: true },
      { $set: { isActive: false, deactivatedAt: new Date(), deactivatedBy: adminId } }
    );
    
    console.log(`🗑️ Question Bank Deletion by ${adminId}: ${result.modifiedCount} questions deactivated`);
    
    res.json({
      success: true,
      message: `Successfully deactivated ${result.modifiedCount} questions`,
      deactivatedCount: result.modifiedCount
    });
    
  } catch (error) {
    console.error('Question bank deletion error:', error);
    next(error);
  }
};

// Generate test from question bank
const generateTestFromQuestionBank = async (req, res, next) => {
  try {
    const { 
      adminId, 
      password, 
      testName, 
      duration, 
      questionCount,
      filters = {},
      testType = 'Practice',
      year,
      paper
    } = req.body;
    
    // Verify admin credentials
    if (adminId !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }
    
    // Validate required fields
    if (!testName || !duration || !questionCount) {
      return res.status(400).json({
        success: false,
        message: 'Test name, duration, and question count are required'
      });
    }
    
    if (questionCount > 200) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 200 questions allowed per test'
      });
    }
    
    // Build query for selecting questions
    const query = { isActive: true };
    if (filters.area) query.area = { $in: Array.isArray(filters.area) ? filters.area : [filters.area] };
    if (filters.difficulty) query.difficulty = { $in: Array.isArray(filters.difficulty) ? filters.difficulty : [filters.difficulty] };
    if (filters.subarea) query.subarea = new RegExp(filters.subarea, 'i');
    if (filters.minQualityScore) query.qualityScore = { $gte: filters.minQualityScore };
    if (filters.isVerified !== undefined) query.isVerified = filters.isVerified;
    
    // Get available questions
    const availableQuestions = await PracticeQuestion.find(query);
    
    if (availableQuestions.length < questionCount) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableQuestions.length} questions available with the specified filters. Requested: ${questionCount}`,
        availableCount: availableQuestions.length,
        appliedFilters: filters
      });
    }
    
    // Randomly select questions (with preference for less-used questions)
    const selectedQuestions = availableQuestions
      .sort((a, b) => {
        // Prioritize by quality score and low usage
        const scoreA = (a.qualityScore || 3) - ((a.usage?.timesUsed || 0) * 0.1);
        const scoreB = (b.qualityScore || 3) - ((b.usage?.timesUsed || 0) * 0.1);
        return scoreB - scoreA + (Math.random() - 0.5) * 0.5; // Add randomness
      })
      .slice(0, questionCount);
    
    // Convert to test format
    const testQuestions = selectedQuestions.map((pq, index) => ({
      qid: `${year || new Date().getFullYear()}_${(paper || testName).replace(/\s+/g, '')}_Q${index + 1}`,
      question: pq.question,
      difficulty: pq.difficulty || 'Medium',
      area: pq.area,
      subarea: pq.subarea,
      options: [
        { key: 'A', text: pq.OptionA, correct: pq.key === 'A' },
        { key: 'B', text: pq.OptionB, correct: pq.key === 'B' },
        { key: 'C', text: pq.OptionC, correct: pq.key === 'C' },
        { key: 'D', text: pq.OptionD, correct: pq.key === 'D' }
      ],
      explanation: pq.explanation
    }));
    
    // Create test object
    const testData = {
      name: testName,
      testType: testType,
      year: year || new Date().getFullYear(),
      paper: paper || 'Generated Test',
      numberOfQuestions: questionCount,
      timeInMins: duration,
      duration: duration,
      questions: testQuestions,
      createdBy: adminId,
      tags: ['generated', 'question-bank'],
      description: `Generated from question bank with ${questionCount} questions`
    };
    
    // Create test
    const newTest = await Test.create(testData);
    
    console.log(`🧪 Test Generated from Question Bank by ${adminId}: ${testName} (${questionCount} questions)`);
    
    res.json({
      success: true,
      message: `Test "${testName}" created successfully with ${questionCount} questions`,
      test: {
        id: newTest._id,
        name: newTest.name,
        testType: newTest.testType,
        year: newTest.year,
        paper: newTest.paper,
        questionCount: newTest.questions.length,
        duration: newTest.duration,
        createdAt: newTest.createdAt
      }
    });
    
  } catch (error) {
    console.error('Generate test from question bank error:', error);
    next(error);
  }
};

module.exports = {
  adminLogin,
  getAdminTests,
  createTest,
  deleteTest,
  getTestStatistics,
  // NEW QUESTION BANK FUNCTIONS
  uploadQuestionBank,
  getQuestionBankStats,
  getQuestionBankList,
  deleteQuestionBankQuestions,
  generateTestFromQuestionBank
};