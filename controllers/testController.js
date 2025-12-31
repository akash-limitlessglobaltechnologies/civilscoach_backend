const Test = require('../models/Test');
const TestSession = require('../models/TestSession');
const UserTestRecord = require('../models/UserTestRecord');
const User = require('../models/User');
const { validateEmail } = require('../utils/validation');
const crypto = require('crypto');

// Get all tests with optional test type filtering (Public)
const getAllTests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const testType = req.query.testType; // Optional filter by test type

    // Build query object
    const query = { isActive: true };
    if (testType && ['PYQ', 'Practice', 'Assessment'].includes(testType)) {
      query.testType = testType;
    }

    const tests = await Test.find(query, 'name year paper duration scoring testType createdAt numberOfQuestions')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Test.countDocuments(query);

    // Get counts by test type for frontend tabs
    const testCounts = await Test.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$testType', count: { $sum: 1 } } }
    ]);

    const typeStats = {
      PYQ: 0,
      Practice: 0,
      Assessment: 0
    };

    testCounts.forEach(item => {
      if (item._id) {
        typeStats[item._id] = item.count;
      }
    });
    
    res.json({ 
      success: true, 
      tests,
      typeStats,
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

// Get tests by specific type (Public)
const getTestsByType = async (req, res, next) => {
  try {
    const { testType } = req.params;
    
    // Validate test type
    if (!['PYQ', 'Practice', 'Assessment'].includes(testType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid test type. Must be PYQ, Practice, or Assessment' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const tests = await Test.find(
      { testType: testType, isActive: true }, 
      'name year paper duration scoring testType createdAt numberOfQuestions'
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Test.countDocuments({ testType: testType, isActive: true });
    
    res.json({ 
      success: true, 
      tests,
      testType,
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

// Get specific test by ID (Public)
const getTestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const test = await Test.findOne({ _id: id, isActive: true }).select('-__v');
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found or inactive' 
      });
    }

    res.json({ 
      success: true, 
      test 
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

// Start a test session (requires authentication)
const startTestSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const email = req.user.email;

    // Find the test
    const test = await Test.findOne({ _id: id, isActive: true });
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found or inactive' 
      });
    }

    // Check if user can take the test (subscription limits, etc.)
    let user = null;
    try {
      user = await User.findById(userId);
      if (user) {
        const canTake = user.canTakeTest();
        if (!canTake.allowed) {
          return res.status(403).json({
            success: false,
            message: canTake.reason,
            type: 'TEST_LIMIT_EXCEEDED',
            remainingTests: canTake.remaining || 0
          });
        }
      }
    } catch (error) {
      console.error('Error checking user test permissions:', error);
      // Continue even if user check fails
    }

    // Check for existing active session
    const existingSession = await TestSession.findOne({
      testId: id,
      email: email.toLowerCase().trim(),
      completed: false
    });

    if (existingSession) {
      // Calculate if session is still valid (within test duration + 30 minutes grace)
      const timeElapsed = (new Date() - existingSession.startTime) / 1000 / 60;
      const gracePeriod = 30; // 30 minutes grace period
      
      if (timeElapsed <= test.duration + gracePeriod) {
        return res.json({
          success: true,
          sessionId: existingSession.sessionId,
          duration: test.duration,
          scoring: test.scoring,
          testType: test.testType,
          timeRemaining: Math.max(0, test.duration - timeElapsed),
          isResuming: true,
          user: {
            email: email,
            phoneNumber: req.user.phoneNumber,
            displayName: user?.displayName || email.split('@')[0]
          },
          message: 'Resuming existing test session'
        });
      } else {
        // Mark old session as expired and create new one
        await TestSession.findOneAndUpdate(
          { sessionId: existingSession.sessionId },
          { 
            completed: true,
            timeExpired: true,
            endTime: new Date()
          }
        );
      }
    }

    // Generate unique session ID
    const sessionId = `test_${id}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Create new test session
    const testSession = new TestSession({
      sessionId,
      testId: id,
      email: email.toLowerCase().trim(),
      startTime: new Date()
    });

    await testSession.save();

    console.log('Test session started:', {
      sessionId,
      testId: id,
      testName: test.name,
      userId,
      email
    });

    res.json({ 
      success: true, 
      sessionId,
      duration: test.duration,
      scoring: test.scoring,
      testType: test.testType,
      timeRemaining: test.duration,
      isResuming: false,
      user: {
        email: email,
        phoneNumber: req.user.phoneNumber,
        displayName: user?.displayName || email.split('@')[0]
      },
      message: 'Test session started successfully' 
    });
  } catch (error) {
    console.error('Error starting test session:', error);
    next(error);
  }
};

// Submit test answers (enhanced with detailed answer tracking)
const submitTest = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { answers, timeExpired: clientTimeExpired, deviceInfo, analytics } = req.body;
    const userId = req.user.userId;

    console.log('Submitting test for session:', sessionId);

    // Find the test session
    const testSession = await TestSession.findOne({ sessionId }).populate('testId');
    if (!testSession) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test session not found' 
      });
    }

    if (testSession.completed) {
      return res.status(400).json({ 
        success: false, 
        message: 'Test already completed' 
      });
    }

    // Check if time has expired
    const timeElapsed = (new Date() - testSession.startTime) / 1000 / 60; // in minutes
    const timeExpired = timeElapsed > testSession.testId.duration || clientTimeExpired;

    // Calculate score using custom scoring system
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let unanswered = 0;
    let totalScore = 0;
    const test = testSession.testId;
    
    // Get scoring configuration or use defaults
    const scoring = test.scoring || {
      correct: 4,
      wrong: -1,
      unanswered: 0
    };

    // Convert answers array to object for easier processing
    const answersMap = {};
    const detailedAnswers = new Map();
    
    if (Array.isArray(answers)) {
      answers.forEach(answer => {
        if (answer && typeof answer === 'object' && 'questionIndex' in answer) {
          answersMap[answer.questionIndex] = answer.selectedOption;
          
          // Store detailed answer information
          const questionIndex = answer.questionIndex.toString();
          const question = test.questions[answer.questionIndex];
          const correctOption = question?.options?.find(opt => opt.correct);
          const selectedOption = answer.selectedOption || '';
          const isCorrect = selectedOption === correctOption?.key;
          
          detailedAnswers.set(questionIndex, {
            selectedOption,
            correctOption: correctOption?.key || 'A',
            isCorrect,
            timeSpent: answer.timeSpent || 0,
            attempts: answer.attempts || 1,
            difficulty: question?.difficulty || 'Medium',
            area: question?.area || 1,
            subarea: question?.subarea || '',
            questionText: question?.question || '',
            explanation: question?.explanation || ''
          });
        }
      });
    } else if (answers && typeof answers === 'object') {
      Object.assign(answersMap, answers);
      
      // Create detailed answers for legacy format
      Object.entries(answersMap).forEach(([questionIndex, selectedOption]) => {
        const question = test.questions[parseInt(questionIndex)];
        const correctOption = question?.options?.find(opt => opt.correct);
        
        detailedAnswers.set(questionIndex, {
          selectedOption: selectedOption || '',
          correctOption: correctOption?.key || 'A',
          isCorrect: selectedOption === correctOption?.key,
          timeSpent: 0,
          attempts: 1,
          difficulty: question?.difficulty || 'Medium',
          area: question?.area || 1,
          subarea: question?.subarea || '',
          questionText: question?.question || '',
          explanation: question?.explanation || ''
        });
      });
    }
    
    // Calculate score based on custom scoring system
    test.questions.forEach((question, index) => {
      const userAnswer = answersMap[index];
      const correctOption = question.options.find(opt => opt.correct);
      
      if (!userAnswer) {
        unanswered++;
        totalScore += scoring.unanswered;
      } else if (userAnswer === correctOption.key) {
        correctAnswers++;
        totalScore += scoring.correct;
      } else {
        wrongAnswers++;
        totalScore += scoring.wrong;
      }
    });

    // Calculate percentage based on correct answers
    const percentage = ((correctAnswers / test.questions.length) * 100);

    console.log('Score calculation:', {
      correctAnswers,
      wrongAnswers,
      unanswered,
      totalScore,
      percentage,
      testType: test.testType
    });

    // Update test session
    testSession.answers = new Map(Object.entries(answersMap));
    testSession.score = totalScore;
    testSession.completed = true;
    testSession.timeExpired = timeExpired;
    testSession.endTime = new Date();
    
    await testSession.save();

    // Find or create user for statistics update
    let user = null;
    try {
      user = await User.findById(userId);
    } catch (error) {
      console.error('Error finding user for statistics update:', error);
    }

    // Create enhanced user test record
    const userTestRecord = new UserTestRecord({
      userId: userId,
      email: testSession.email,
      testId: test._id,
      sessionId: sessionId,
      testName: test.name,
      testYear: test.year,
      testPaper: test.paper,
      testType: test.testType,
      score: totalScore,
      correctAnswers: correctAnswers,
      wrongAnswers: wrongAnswers,
      unansweredQuestions: unanswered,
      totalQuestions: test.questions.length,
      percentage: parseFloat(percentage.toFixed(1)),
      timeTaken: Math.round(timeElapsed),
      timeAllotted: test.duration,
      timeExpired: timeExpired,
      answers: detailedAnswers,
      scoring: scoring,
      completion: {
        startedAt: testSession.startTime,
        completedAt: new Date(),
        submissionType: timeExpired ? 'timeout' : 'manual',
        deviceInfo: deviceInfo || {},
        interruptions: analytics?.interruptions || 0
      },
      analytics: analytics || {},
      metadata: {
        version: '2.0',
        source: 'web',
        isPublic: false
      }
    });

    await userTestRecord.save();

    // Update user statistics
    if (user) {
      try {
        await user.updateTestStatistics(totalScore, Math.round(timeElapsed), !timeExpired);
        console.log('User statistics updated for:', user.email);
      } catch (error) {
        console.error('Error updating user statistics:', error);
      }
    }

    console.log('Test completed and recorded:', {
      sessionId,
      userId,
      email: testSession.email,
      score: totalScore,
      percentage: percentage.toFixed(1),
      recordId: userTestRecord._id
    });

    res.json({ 
      success: true, 
      totalScore: parseFloat(totalScore.toFixed(2)),
      scoring: scoring,
      testType: test.testType,
      breakdown: {
        correct: correctAnswers,
        wrong: wrongAnswers,
        unanswered: unanswered,
        total: test.questions.length
      },
      percentage: percentage.toFixed(1),
      timeExpired,
      timeTaken: Math.round(timeElapsed),
      grade: userTestRecord.grade,
      efficiency: userTestRecord.efficiency,
      recordId: userTestRecord._id,
      user: user ? {
        totalTestsCompleted: user.statistics.totalTestsCompleted,
        averageScore: user.statistics.averageScore,
        bestScore: user.statistics.bestScore,
        remainingTests: user.remainingTests
      } : null,
      message: `Test completed! Score: ${totalScore.toFixed(2)} (${correctAnswers}/${test.questions.length} correct)`
    });
  } catch (error) {
    console.error('Error submitting test:', error);
    
    // Handle specific validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Handle database errors
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      return res.status(500).json({
        success: false,
        message: 'Database error occurred while saving test results'
      });
    }
    
    next(error);
  }
};

// End test session (enhanced)
const endTestSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const testSession = await TestSession.findOne({ sessionId });
    if (!testSession) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test session not found' 
      });
    }

    // Verify session belongs to user
    if (testSession.email !== req.user.email.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to end this test session'
      });
    }

    // Mark session as ended if not completed
    if (!testSession.completed) {
      testSession.endTime = new Date();
      testSession.timeExpired = true;
      await testSession.save();
      
      console.log('Test session ended by user:', {
        sessionId,
        userId,
        email: testSession.email
      });
    }

    res.json({ 
      success: true, 
      message: 'Test session ended successfully' 
    });
  } catch (error) {
    next(error);
  }
};

// Get test session status (enhanced)
const getSessionStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const testSession = await TestSession.findOne({ sessionId }).populate('testId');
    if (!testSession) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test session not found' 
      });
    }

    // Verify session belongs to user
    if (testSession.email !== req.user.email.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this test session'
      });
    }

    const timeElapsed = (new Date() - testSession.startTime) / 1000 / 60; // in minutes
    const timeRemaining = Math.max(0, testSession.testId.duration - timeElapsed);
    const timeExpired = timeElapsed >= testSession.testId.duration;

    res.json({ 
      success: true,
      sessionId: testSession.sessionId,
      testId: testSession.testId._id,
      testName: testSession.testId.name,
      testType: testSession.testId.testType,
      startTime: testSession.startTime,
      timeElapsed: Math.round(timeElapsed),
      timeRemaining: Math.round(timeRemaining),
      timeExpired,
      completed: testSession.completed,
      scoring: testSession.testId.scoring,
      totalQuestions: testSession.testId.questions.length
    });
  } catch (error) {
    next(error);
  }
};

// Get test leaderboard
const getTestLeaderboard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const leaderboard = await UserTestRecord.getLeaderboard(id, limit);
    
    res.json({
      success: true,
      leaderboard: leaderboard.map((record, index) => ({
        rank: index + 1,
        userName: record.userId?.displayName || record.email?.split('@')[0] || 'Anonymous',
        score: record.score,
        percentage: record.percentage,
        timeTaken: record.timeTaken,
        completedAt: record.completion?.completedAt || record.completedAt
      })),
      totalParticipants: leaderboard.length
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTests,
  getTestsByType,
  getTestById,
  startTestSession,
  submitTest,
  endTestSession,
  getSessionStatus,
  getTestLeaderboard
};