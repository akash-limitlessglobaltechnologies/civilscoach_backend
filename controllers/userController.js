const UserTestRecord = require('../models/UserTestRecord');
const { validateEmail } = require('../utils/validation');

// Get user performance by email
const getUserPerformance = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email address is required'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('Fetching performance for email:', email); // Debug log

    // Get user test records
    const userRecords = await UserTestRecord.find({ email: email.toLowerCase().trim() })
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('testId', 'duration');

    const totalRecords = await UserTestRecord.countDocuments({ email: email.toLowerCase().trim() });

    console.log('Found records:', userRecords.length); // Debug log

    if (userRecords.length === 0) {
      return res.json({
        success: true,
        message: 'No test records found for this email',
        totalTests: 0,
        averageScore: null,
        bestScore: null,
        totalQuestions: 0,
        testHistory: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    // Calculate statistics
    const allUserRecords = await UserTestRecord.find({ email: email.toLowerCase().trim() });
    const totalTests = allUserRecords.length;
    
    // Calculate average scores (both percentage and weighted)
    const totalPercentageScore = allUserRecords.reduce((sum, record) => sum + record.percentage, 0);
    const totalWeightedScore = allUserRecords.reduce((sum, record) => sum + record.score, 0);
    const totalQuestions = allUserRecords.reduce((sum, record) => sum + record.totalQuestions, 0);
    
    const averagePercentage = totalPercentageScore / totalTests;
    const averageWeightedScore = totalWeightedScore / totalTests;
    
    // Find best and worst scores (both percentage and weighted)
    const bestPercentage = Math.max(...allUserRecords.map(record => record.percentage));
    const worstPercentage = Math.min(...allUserRecords.map(record => record.percentage));
    const bestWeightedScore = Math.max(...allUserRecords.map(record => record.score));
    const worstWeightedScore = Math.min(...allUserRecords.map(record => record.score));
    
    // Test completion rate (completed vs time expired)
    const completedNormally = allUserRecords.filter(record => !record.timeExpired).length;
    const completionRate = (completedNormally / totalTests) * 100;

    // Format test history for frontend
    const testHistory = userRecords.map(record => ({
      testName: record.testName,
      submittedAt: record.completedAt,
      score: {
        weighted: record.score,
        correct: record.correctAnswers || 0,
        wrong: record.wrongAnswers || 0,
        unanswered: record.unansweredQuestions || 0,
        total: record.totalQuestions
      },
      percentage: record.percentage,
      timeExpired: record.timeExpired,
      duration: record.testId?.duration || record.timeTaken || null,
      timeTaken: record.timeTaken,
      scoring: record.scoring || { correct: 1, wrong: 0, unanswered: 0 }
    }));

    const responseData = {
      success: true,
      email: email.toLowerCase().trim(),
      totalTests,
      averageScore: Math.round(averagePercentage),
      averageWeightedScore: parseFloat(averageWeightedScore.toFixed(2)),
      bestScore: Math.round(bestPercentage),
      bestWeightedScore: parseFloat(bestWeightedScore.toFixed(2)),
      totalQuestions,
      testHistory,
      statistics: {
        totalTests,
        totalQuestions,
        averagePercentage: parseFloat(averagePercentage.toFixed(1)),
        averageWeightedScore: parseFloat(averageWeightedScore.toFixed(2)),
        bestPercentage: parseFloat(bestPercentage.toFixed(1)),
        worstPercentage: parseFloat(worstPercentage.toFixed(1)),
        bestWeightedScore: parseFloat(bestWeightedScore.toFixed(2)),
        worstWeightedScore: parseFloat(worstWeightedScore.toFixed(2)),
        completionRate: parseFloat(completionRate.toFixed(1)),
        lastTestDate: allUserRecords[0]?.completedAt
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        hasNext: page < Math.ceil(totalRecords / limit),
        hasPrev: page > 1
      }
    };

    console.log('Sending response with', testHistory.length, 'test records'); // Debug log
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching user performance:', error);
    next(error);
  }
};

// Get user test history with detailed results
const getUserTestHistory = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { testId } = req.params;
    
    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email address is required'
      });
    }

    let query = { email: email.toLowerCase().trim() };
    if (testId) {
      query.testId = testId;
    }

    const records = await UserTestRecord.find(query)
      .sort({ completedAt: -1 })
      .populate('testId', 'name year paper duration questions');

    const detailedHistory = records.map(record => ({
      id: record._id,
      testName: record.testName,
      testYear: record.testYear,
      testPaper: record.testPaper,
      score: record.score, // Weighted score
      correctAnswers: record.correctAnswers || 0,
      wrongAnswers: record.wrongAnswers || 0,
      unansweredQuestions: record.unansweredQuestions || 0,
      totalQuestions: record.totalQuestions,
      percentage: record.percentage,
      timeTaken: record.timeTaken,
      timeExpired: record.timeExpired,
      completedAt: record.completedAt,
      answers: Object.fromEntries(record.answers),
      scoring: record.scoring || { correct: 1, wrong: 0, unanswered: 0 },
      testDetails: record.testId
    }));

    res.json({
      success: true,
      email: email.toLowerCase().trim(),
      testHistory: detailedHistory,
      totalRecords: detailedHistory.length
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserPerformance,
  getUserTestHistory
};