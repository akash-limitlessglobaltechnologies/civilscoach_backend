const Test = require('../models/Test');
const TestSession = require('../models/TestSession');
const UserTestRecord = require('../models/UserTestRecord');
const { validateEmail } = require('../utils/validation');
const crypto = require('crypto');

// Get all tests (Public)
const getAllTests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const tests = await Test.find({}, 'name year paper duration scoring createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Test.countDocuments();
    
    res.json({ 
      success: true, 
      tests,
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
    
    const test = await Test.findById(id).select('-__v');
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found' 
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

// Start a test session
const startTestSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid email address is required' 
      });
    }

    const test = await Test.findById(id);
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found' 
      });
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

    res.json({ 
      success: true, 
      sessionId,
      duration: test.duration,
      scoring: test.scoring,
      message: 'Test session started successfully' 
    });
  } catch (error) {
    next(error);
  }
};

// Submit test answers
const submitTest = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { answers, timeExpired: clientTimeExpired } = req.body;

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
      correct: 1,
      wrong: 0,
      unanswered: 0
    };

    // Convert answers array to object for easier processing
    const answersMap = {};
    if (Array.isArray(answers)) {
      answers.forEach(answer => {
        if (answer && typeof answer === 'object' && 'questionIndex' in answer) {
          answersMap[answer.questionIndex] = answer.selectedOption;
        }
      });
    } else if (answers && typeof answers === 'object') {
      // If answers is already an object, use it directly
      Object.assign(answersMap, answers);
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

    // Calculate percentage based on correct answers (for backward compatibility)
    const percentage = ((correctAnswers / test.questions.length) * 100);

    console.log('Score calculation:', {
      correctAnswers,
      wrongAnswers,
      unanswered,
      totalScore,
      percentage
    });

    // Update test session
    testSession.answers = new Map(Object.entries(answersMap));
    testSession.score = totalScore; // Store total weighted score (can be negative)
    testSession.completed = true;
    testSession.timeExpired = timeExpired;
    testSession.endTime = new Date();
    
    await testSession.save();

    // Create user test record with enhanced scoring data
    const userTestRecord = new UserTestRecord({
      email: testSession.email,
      testId: test._id,
      sessionId: sessionId,
      testName: test.name,
      testYear: test.year,
      testPaper: test.paper,
      score: totalScore, // Total weighted score (can be negative)
      correctAnswers: correctAnswers,
      wrongAnswers: wrongAnswers,
      unansweredQuestions: unanswered,
      totalQuestions: test.questions.length,
      percentage: parseFloat(percentage.toFixed(1)),
      timeTaken: Math.round(timeElapsed),
      timeExpired: timeExpired,
      answers: new Map(Object.entries(answersMap)),
      scoring: scoring, // Store the scoring system used
      completedAt: new Date()
    });

    await userTestRecord.save();

    res.json({ 
      success: true, 
      totalScore: parseFloat(totalScore.toFixed(2)),
      scoring: scoring,
      breakdown: {
        correct: correctAnswers,
        wrong: wrongAnswers,
        unanswered: unanswered,
        total: test.questions.length
      },
      percentage: percentage.toFixed(1),
      timeExpired,
      timeTaken: Math.round(timeElapsed),
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
    
    // Handle other database errors
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      return res.status(500).json({
        success: false,
        message: 'Database error occurred while saving test results'
      });
    }
    
    next(error);
  }
};

// End test session
const endTestSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const testSession = await TestSession.findOne({ sessionId });
    if (!testSession) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test session not found' 
      });
    }

    // Mark session as ended if not completed
    if (!testSession.completed) {
      testSession.endTime = new Date();
      await testSession.save();
    }

    res.json({ 
      success: true, 
      message: 'Test session ended successfully' 
    });
  } catch (error) {
    next(error);
  }
};

// Get test session status
const getSessionStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const testSession = await TestSession.findOne({ sessionId }).populate('testId');
    if (!testSession) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test session not found' 
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
      startTime: testSession.startTime,
      timeElapsed: Math.round(timeElapsed),
      timeRemaining: Math.round(timeRemaining),
      timeExpired,
      completed: testSession.completed,
      scoring: testSession.testId.scoring
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTests,
  getTestById,
  startTestSession,
  submitTest,
  endTestSession,
  getSessionStatus
};