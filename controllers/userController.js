const UserTestRecord = require('../models/UserTestRecord');
const User = require('../models/User');
const Test = require('../models/Test');
const mongoose = require('mongoose');
const { validateEmail } = require('../utils/validation');

// Get user performance (enhanced with user profile integration)
const getUserPerformance = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    
    if (!userId || !email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication',
        type: 'AUTH_ERROR'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('Fetching performance for user:', { userId, email });

    // Get user profile data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    // Get paginated user test records with enhanced details
    const userRecords = await UserTestRecord.find({ 
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    })
      .sort({ 'completion.completedAt': -1 })
      .skip(skip)
      .limit(limit)
      .populate('testId', 'duration name testType');

    const totalRecords = await UserTestRecord.countDocuments({ 
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    });

    console.log('Found test records:', userRecords.length);

    if (userRecords.length === 0) {
      return res.json({
        success: true,
        message: 'No test records found for this user',
        user: user.getPublicProfile(),
        totalTests: 0,
        averageScore: null,
        bestScore: null,
        totalQuestions: 0,
        testHistory: [],
        statistics: user.statistics,
        subscription: {
          ...user.subscription.toObject(),
          status: user.subscriptionStatus,
          remainingTests: user.remainingTests
        },
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    // Get all user records for statistics calculation
    const allUserRecords = await UserTestRecord.find({ 
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    }).sort({ 'completion.completedAt': -1 });

    const totalTests = allUserRecords.length;
    
    // Calculate enhanced statistics
    const totalPercentageScore = allUserRecords.reduce((sum, record) => sum + record.percentage, 0);
    const totalWeightedScore = allUserRecords.reduce((sum, record) => sum + record.score, 0);
    const totalQuestions = allUserRecords.reduce((sum, record) => sum + record.totalQuestions, 0);
    const totalCorrectAnswers = allUserRecords.reduce((sum, record) => sum + record.correctAnswers, 0);
    const totalWrongAnswers = allUserRecords.reduce((sum, record) => sum + record.wrongAnswers, 0);
    const totalTime = allUserRecords.reduce((sum, record) => sum + record.timeTaken, 0);
    
    const averagePercentage = totalPercentageScore / totalTests;
    const averageWeightedScore = totalWeightedScore / totalTests;
    const averageTimePerTest = totalTime / totalTests;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrectAnswers / totalQuestions) * 100 : 0;
    
    // Find best and worst scores
    const bestPercentage = Math.max(...allUserRecords.map(record => record.percentage));
    const worstPercentage = Math.min(...allUserRecords.map(record => record.percentage));
    const bestWeightedScore = Math.max(...allUserRecords.map(record => record.score));
    const worstWeightedScore = Math.min(...allUserRecords.map(record => record.score));
    
    // Test completion rate and other metrics
    const completedNormally = allUserRecords.filter(record => !record.timeExpired).length;
    const completionRate = (completedNormally / totalTests) * 100;
    
    // Subject-wise performance analysis
    const subjectPerformance = {};
    
    // Initialize areas 1-7 with proper names
    const areaNames = {
      1: 'Current Affairs',
      2: 'History', 
      3: 'Polity',
      4: 'Economy',
      5: 'Geography',
      6: 'Ecology',
      7: 'General Science'
    };

    // Initialize all areas
    for (let area = 1; area <= 7; area++) {
      subjectPerformance[area] = {
        areaName: areaNames[area],
        correct: 0,
        wrong: 0,
        unanswered: 0,
        total: 0,
        percentage: 0
      };
    }

    // Calculate cumulative topic-wise performance from all test records
    allUserRecords.forEach(record => {
      // Method 1: Use analytics.subjectWisePerformance if available
      if (record.analytics && record.analytics.subjectWisePerformance) {
        for (const [subject, stats] of record.analytics.subjectWisePerformance) {
          const area = parseInt(subject);
          if (area >= 1 && area <= 7 && subjectPerformance[area]) {
            subjectPerformance[area].correct += stats.correct || 0;
            subjectPerformance[area].wrong += stats.wrong || 0;
            subjectPerformance[area].unanswered += stats.unanswered || 0;
            subjectPerformance[area].total += stats.total || 0;
          }
        }
      }
      
      // Method 2: Parse answers directly if analytics not available
      else if (record.answers && typeof record.answers === 'object') {
        // Get the original test questions to determine areas
        // Note: This would require population of testId with questions, 
        // but since analytics should be available, this is a fallback
      }
    });

    // Calculate percentages for each subject
    Object.keys(subjectPerformance).forEach(area => {
      const stats = subjectPerformance[area];
      if (stats.total > 0) {
        stats.percentage = parseFloat(((stats.correct / stats.total) * 100).toFixed(1));
        stats.accuracy = stats.correct + stats.wrong > 0 ? 
          parseFloat(((stats.correct / (stats.correct + stats.wrong)) * 100).toFixed(1)) : 0;
      } else {
        stats.percentage = 0;
        stats.accuracy = 0;
      }
    });

    // Test type performance
    const testTypePerformance = {};
    allUserRecords.forEach(record => {
      const testType = record.testType || 'Unknown';
      if (!testTypePerformance[testType]) {
        testTypePerformance[testType] = {
          count: 0,
          totalScore: 0,
          totalPercentage: 0,
          bestScore: 0,
          averageScore: 0,
          averagePercentage: 0
        };
      }
      
      testTypePerformance[testType].count += 1;
      testTypePerformance[testType].totalScore += record.score;
      testTypePerformance[testType].totalPercentage += record.percentage;
      testTypePerformance[testType].bestScore = Math.max(testTypePerformance[testType].bestScore, record.score);
    });

    Object.keys(testTypePerformance).forEach(testType => {
      const stats = testTypePerformance[testType];
      stats.averageScore = parseFloat((stats.totalScore / stats.count).toFixed(2));
      stats.averagePercentage = parseFloat((stats.totalPercentage / stats.count).toFixed(1));
    });

    // Recent performance trend (last 10 tests)
    const recentTests = allUserRecords.slice(0, 10);
    const recentAveragePercentage = recentTests.length > 0 ? 
      recentTests.reduce((sum, record) => sum + record.percentage, 0) / recentTests.length : 0;
    
    const performanceTrend = recentAveragePercentage > averagePercentage ? 'improving' : 
                           recentAveragePercentage < averagePercentage ? 'declining' : 'stable';

    // Format test history for frontend with enhanced details INCLUDING recordId
    const testHistory = userRecords.map(record => ({
      recordId: record._id, // IMPORTANT: Add recordId for detailed analysis
      id: record._id,
      testName: record.testName,
      testType: record.testType,
      submittedAt: record.completion?.completedAt || record.completedAt,
      score: {
        weighted: record.score,
        correct: record.correctAnswers || 0,
        wrong: record.wrongAnswers || 0,
        unanswered: record.unansweredQuestions || 0,
        total: record.totalQuestions
      },
      percentage: record.percentage,
      grade: record.grade,
      timeExpired: record.timeExpired,
      duration: record.testId?.duration || record.timeAllotted || null,
      timeTaken: record.timeTaken,
      efficiency: record.efficiency,
      scoring: record.scoring || { correct: 4, wrong: -1, unanswered: 0 },
      analytics: {
        accuracy: ((record.correctAnswers / record.totalQuestions) * 100).toFixed(1),
        completionRate: (((record.correctAnswers + record.wrongAnswers) / record.totalQuestions) * 100).toFixed(1)
      }
    }));

    // Prepare comprehensive response
    const responseData = {
      success: true,
      user: user.getPublicProfile(),
      totalTests,
      averagePercentage: Math.round(averagePercentage),
      averageScore: Math.round(averagePercentage),
      averageWeightedScore: parseFloat(averageWeightedScore.toFixed(2)),
      bestScore: Math.round(bestPercentage),
      bestWeightedScore: parseFloat(bestWeightedScore.toFixed(2)),
      totalQuestions,
      totalCorrectAnswers,
      totalTimeTaken: totalTime,
      testHistory,
      statistics: {
        ...user.statistics.toObject(),
        totalTests,
        totalQuestions,
        totalCorrectAnswers,
        totalWrongAnswers,
        averagePercentage: parseFloat(averagePercentage.toFixed(1)),
        averageWeightedScore: parseFloat(averageWeightedScore.toFixed(2)),
        averageTimePerTest: parseFloat(averageTimePerTest.toFixed(1)),
        overallAccuracy: parseFloat(overallAccuracy.toFixed(1)),
        bestPercentage: parseFloat(bestPercentage.toFixed(1)),
        worstPercentage: parseFloat(worstPercentage.toFixed(1)),
        bestWeightedScore: parseFloat(bestWeightedScore.toFixed(2)),
        worstWeightedScore: parseFloat(worstWeightedScore.toFixed(2)),
        completionRate: parseFloat(completionRate.toFixed(1)),
        performanceTrend: performanceTrend,
        recentAveragePercentage: parseFloat(recentAveragePercentage.toFixed(1)),
        lastTestDate: allUserRecords[0]?.completion?.completedAt || allUserRecords[0]?.completedAt
      },
      analytics: {
        subjectPerformance,
        testTypePerformance,
        difficultyAnalysis: {
          easy: allUserRecords.filter(r => r.analytics?.difficultyWisePerformance?.easy?.total > 0).length,
          medium: allUserRecords.filter(r => r.analytics?.difficultyWisePerformance?.medium?.total > 0).length,
          hard: allUserRecords.filter(r => r.analytics?.difficultyWisePerformance?.hard?.total > 0).length
        },
        weeklyStats: {
          testsThisWeek: allUserRecords.filter(record => {
            const testDate = new Date(record.completion?.completedAt || record.completedAt);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return testDate >= weekAgo;
          }).length
        }
      },
      subscription: {
        ...user.subscription.toObject(),
        status: user.subscriptionStatus,
        remainingTests: user.remainingTests
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        hasNext: page < Math.ceil(totalRecords / limit),
        hasPrev: page > 1
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error in getUserPerformance:', error);
    next(error);
  }
};

// Get detailed user test history
const getUserTestHistory = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    
    if (!userId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication',
        type: 'AUTH_ERROR'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get user test records with detailed analytics
    const userRecords = await UserTestRecord.find({
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    })
      .sort({ 'completion.completedAt': -1 })
      .skip(skip)
      .limit(limit)
      .populate('testId', 'name testType duration numberOfQuestions');

    const totalRecords = await UserTestRecord.countDocuments({
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    });

    const testHistory = userRecords.map(record => {
      const recommendations = generateRecommendations(record, record.analytics);
      
      return {
        recordId: record._id, // IMPORTANT: Include recordId for detailed analysis
        id: record._id,
        testName: record.testName,
        testType: record.testType,
        testYear: record.testYear,
        testPaper: record.testPaper,
        submittedAt: record.completion?.completedAt || record.completedAt,
        score: {
          weighted: record.score,
          correct: record.correctAnswers || 0,
          wrong: record.wrongAnswers || 0,
          unanswered: record.unansweredQuestions || 0,
          total: record.totalQuestions
        },
        percentage: record.percentage,
        grade: record.grade,
        timeExpired: record.timeExpired,
        timeTaken: record.timeTaken,
        timeAllotted: record.timeAllotted,
        efficiency: record.efficiency,
        performanceSummary: record.performanceSummary,
        scoring: record.scoring,
        analytics: {
          subjectWisePerformance: record.analytics?.subjectWisePerformance || {},
          difficultyWisePerformance: record.analytics?.difficultyWisePerformance || {},
          averageTimePerQuestion: record.analytics?.averageTimePerQuestion || 0,
          questionsReviewed: record.analytics?.questionsReviewed || 0,
          flaggedQuestions: record.analytics?.flaggedQuestions || [],
          accuracy: record.totalQuestions > 0 ? ((record.correctAnswers / record.totalQuestions) * 100).toFixed(1) : 0,
          completionRate: record.totalQuestions > 0 ? (((record.correctAnswers + record.wrongAnswers) / record.totalQuestions) * 100).toFixed(1) : 0
        },
        completion: record.completion,
        review: record.review,
        recommendations: recommendations
      };
    });

    res.json({
      success: true,
      testHistory,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        hasNext: page < Math.ceil(totalRecords / limit),
        hasPrev: page > 1
      },
      summary: {
        totalTests: totalRecords,
        averageScore: testHistory.length > 0 ? 
          testHistory.reduce((sum, test) => sum + test.percentage, 0) / testHistory.length : 0,
        bestScore: testHistory.length > 0 ? 
          Math.max(...testHistory.map(test => test.percentage)) : 0
      }
    });

  } catch (error) {
    console.error('Error in getUserTestHistory:', error);
    next(error);
  }
};

// Get specific test attempt with comprehensive analysis (NEW METHOD)
const getTestAttemptDetails = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const { recordId } = req.params;

    console.log('Fetching test attempt details for:', { recordId, userId, email });

    // Validate recordId
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format'
      });
    }

    // Find the specific test attempt
    const testAttempt = await UserTestRecord.findOne({
      _id: recordId,
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    }).lean();

    if (!testAttempt) {
      return res.status(404).json({
        success: false,
        message: 'Test attempt not found or you do not have permission to view it'
      });
    }

    console.log('Found test attempt:', testAttempt.testName);

    // Get the associated test details for questions
    let testDetails = null;
    if (testAttempt.testId) {
      testDetails = await Test.findById(testAttempt.testId).lean();
      console.log('Found test details:', testDetails ? testDetails.name : 'Not found');
    }

    // Prepare response with comprehensive test attempt data
    const response = {
      success: true,
      testAttempt: {
        recordId: testAttempt._id,
        testId: testAttempt.testId,
        testName: testAttempt.testName,
        testType: testAttempt.testType,
        testYear: testAttempt.testYear,
        testPaper: testAttempt.testPaper,
        score: testAttempt.score,
        percentage: testAttempt.percentage,
        correctAnswers: testAttempt.correctAnswers,
        wrongAnswers: testAttempt.wrongAnswers,
        unansweredQuestions: testAttempt.unansweredQuestions,
        totalQuestions: testAttempt.totalQuestions,
        timeTaken: testAttempt.timeTaken,
        timeAllotted: testAttempt.timeAllotted,
        timeExpired: testAttempt.timeExpired,
        answers: testAttempt.answers,
        analytics: testAttempt.analytics,
        scoring: testAttempt.scoring,
        completion: testAttempt.completion,
        review: testAttempt.review,
        metadata: testAttempt.metadata,
        createdAt: testAttempt.createdAt,
        updatedAt: testAttempt.updatedAt
      },
      questions: testDetails ? testDetails.questions : [],
      testInfo: testDetails ? {
        name: testDetails.name,
        testType: testDetails.testType,
        year: testDetails.year,
        paper: testDetails.paper,
        duration: testDetails.duration,
        numberOfQuestions: testDetails.numberOfQuestions,
        scoring: testDetails.scoring
      } : null
    };

    console.log('Sending response with questions count:', response.questions.length);

    res.json(response);

  } catch (error) {
    console.error('Error in getTestAttemptDetails:', error);
    next(error);
  }
};

// Update user profile
const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication',
        type: 'AUTH_ERROR'
      });
    }

    // Only allow specific fields to be updated for security
    const allowedUpdates = {};
    
    if (updates.profile) {
      if (updates.profile.firstName !== undefined) allowedUpdates['profile.firstName'] = updates.profile.firstName;
      if (updates.profile.lastName !== undefined) allowedUpdates['profile.lastName'] = updates.profile.lastName;
      if (updates.profile.dateOfBirth !== undefined) allowedUpdates['profile.dateOfBirth'] = updates.profile.dateOfBirth;
      if (updates.profile.gender !== undefined) allowedUpdates['profile.gender'] = updates.profile.gender;
      if (updates.profile.category !== undefined) allowedUpdates['profile.category'] = updates.profile.category;
    }

    if (updates.preferences) {
      if (updates.preferences.language !== undefined) allowedUpdates['preferences.language'] = updates.preferences.language;
      if (updates.preferences.notifications?.email !== undefined) allowedUpdates['preferences.notifications.email'] = updates.preferences.notifications.email;
      if (updates.preferences.notifications?.sms !== undefined) allowedUpdates['preferences.notifications.sms'] = updates.preferences.notifications.sms;
      if (updates.preferences.testSettings?.defaultTimer !== undefined) allowedUpdates['preferences.testSettings.defaultTimer'] = updates.preferences.testSettings.defaultTimer;
      if (updates.preferences.testSettings?.showExplanations !== undefined) allowedUpdates['preferences.testSettings.showExplanations'] = updates.preferences.testSettings.showExplanations;
      if (updates.preferences.testSettings?.autoSubmit !== undefined) allowedUpdates['preferences.testSettings.autoSubmit'] = updates.preferences.testSettings.autoSubmit;
    }

    console.log('Updating user profile:', { userId, allowedUpdates });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    console.log('Profile updated successfully for user:', userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser.getPublicProfile()
    });

  } catch (error) {
    console.error('Error updating user profile:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        type: 'VALIDATION_ERROR',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    next(error);
  }
};

// Submit test feedback
const submitTestFeedback = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const { recordId } = req.params;
    const { difficulty, quality, comments } = req.body;

    if (!userId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication',
        type: 'AUTH_ERROR'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID',
        type: 'VALIDATION_ERROR'
      });
    }

    console.log('Submitting feedback:', { userId, recordId, difficulty, quality });

    const record = await UserTestRecord.findOne({
      _id: recordId,
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Test record not found',
        type: 'RECORD_NOT_FOUND'
      });
    }

    // Update feedback
    record.review = record.review || {};
    record.review.hasReviewed = true;
    record.review.reviewedAt = new Date();
    record.review.feedback = record.review.feedback || {};
    
    if (difficulty) record.review.feedback.difficulty = difficulty;
    if (quality) record.review.feedback.quality = quality;
    if (comments !== undefined) record.review.feedback.comments = comments;

    await record.save();

    console.log('Test feedback submitted:', {
      userId,
      recordId,
      difficulty,
      quality
    });

    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting test feedback:', error);
    next(error);
  }
};

// Get user dashboard summary
const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    // Get recent test records (last 5)
    const recentTests = await UserTestRecord.find({
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    })
      .sort({ 'completion.completedAt': -1 })
      .limit(5)
      .populate('testId', 'name testType');

    // Get statistics for different time periods
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const weeklyTests = await UserTestRecord.countDocuments({
      $or: [{ userId: userId }, { email: email.toLowerCase().trim() }],
      'completion.completedAt': { $gte: sevenDaysAgo }
    });

    const monthlyTests = await UserTestRecord.countDocuments({
      $or: [{ userId: userId }, { email: email.toLowerCase().trim() }],
      'completion.completedAt': { $gte: thirtyDaysAgo }
    });

    // Calculate streak and goals
    const streak = await calculateUserStreak(userId, email);
    const goals = generateUserGoals(user, recentTests);

    res.json({
      success: true,
      user: user.getPublicProfile(),
      dashboard: {
        recentTests: recentTests.map(record => ({
          recordId: record._id, // IMPORTANT: Include recordId for detailed analysis
          id: record._id,
          testName: record.testName,
          testType: record.testType,
          score: record.score,
          percentage: record.percentage,
          grade: record.grade,
          completedAt: record.completion?.completedAt || record.completedAt
        })),
        statistics: {
          weeklyTests,
          monthlyTests,
          totalTests: user.statistics.totalTestsCompleted,
          averageScore: user.statistics.averageScore,
          bestScore: user.statistics.bestScore,
          streak: streak,
          totalTimeSpent: user.statistics.totalTimeSpent
        },
        subscription: {
          ...user.subscription.toObject(),
          status: user.subscriptionStatus,
          remainingTests: user.remainingTests
        },
        goals: goals
      }
    });

  } catch (error) {
    console.error('Error fetching user dashboard:', error);
    next(error);
  }
};

// Helper function to generate recommendations
const generateRecommendations = (record, analytics) => {
  const recommendations = [];

  // Score-based recommendations
  if (record.percentage < 50) {
    recommendations.push({
      type: 'improvement',
      title: 'Focus on Fundamentals',
      description: 'Your score indicates need for stronger foundation. Consider reviewing basic concepts.',
      priority: 'high'
    });
  } else if (record.percentage < 75) {
    recommendations.push({
      type: 'improvement',
      title: 'Target Specific Areas',
      description: 'Good progress! Focus on your weaker subjects to improve further.',
      priority: 'medium'
    });
  }

  // Time-based recommendations
  if (record.timeExpired) {
    recommendations.push({
      type: 'strategy',
      title: 'Time Management',
      description: 'Practice with time limits to improve your pace and efficiency.',
      priority: 'high'
    });
  }

  // Subject-specific recommendations
  if (analytics?.subjectWisePerformance) {
    const weakestSubject = Object.entries(analytics.subjectWisePerformance)
      .sort((a, b) => a[1].percentage - b[1].percentage)[0];
    
    if (weakestSubject && weakestSubject[1].percentage < 40) {
      recommendations.push({
        type: 'subject',
        title: `Improve Area ${weakestSubject[0]}`,
        description: `Focus more practice on this subject area where you scored ${weakestSubject[1].percentage}%.`,
        priority: 'medium'
      });
    }
  }

  return recommendations;
};

// Helper function to calculate user streak
const calculateUserStreak = async (userId, email) => {
  try {
    const tests = await UserTestRecord.find({
      $or: [{ userId: userId }, { email: email.toLowerCase().trim() }]
    })
      .sort({ 'completion.completedAt': -1 })
      .limit(30) // Look at last 30 tests
      .select('completion.completedAt');

    if (tests.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < tests.length; i++) {
      const testDate = new Date(tests[i].completion?.completedAt || tests[i].completedAt);
      testDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor((today - testDate) / (1000 * 60 * 60 * 24));

      if (daysDiff === streak) {
        streak++;
      } else if (daysDiff > streak) {
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('Error calculating user streak:', error);
    return 0;
  }
};

// Helper function to generate user goals
const generateUserGoals = (user, recentTests) => {
  const goals = [];

  // Test frequency goal
  if (user.statistics.totalTestsCompleted < 10) {
    goals.push({
      type: 'frequency',
      title: 'Complete 10 Tests',
      description: 'Build momentum by completing your first 10 tests',
      progress: user.statistics.totalTestsCompleted,
      target: 10,
      percentage: (user.statistics.totalTestsCompleted / 10) * 100
    });
  }

  // Score improvement goal
  if (recentTests.length > 0 && user.statistics.averageScore < 80) {
    goals.push({
      type: 'performance',
      title: 'Reach 80% Average',
      description: 'Improve your average score to 80%',
      progress: user.statistics.averageScore,
      target: 80,
      percentage: (user.statistics.averageScore / 80) * 100
    });
  }

  // Consistency goal
  const weeklyTarget = 3;
  goals.push({
    type: 'consistency',
    title: 'Take 3 Tests This Week',
    description: 'Maintain regular practice with weekly test goals',
    progress: 0, // Would need to calculate current week's tests
    target: weeklyTarget,
    percentage: 0
  });

  return goals;
};

module.exports = {
  getUserPerformance,
  getUserTestHistory,
  getTestAttemptDetails,
  updateUserProfile,
  submitTestFeedback,
  getUserDashboard
};