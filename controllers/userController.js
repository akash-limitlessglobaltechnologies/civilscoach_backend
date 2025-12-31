const UserTestRecord = require('../models/UserTestRecord');
const User = require('../models/User');
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
    allUserRecords.forEach(record => {
      if (record.analytics && record.analytics.subjectWisePerformance) {
        for (const [subject, stats] of record.analytics.subjectWisePerformance) {
          if (!subjectPerformance[subject]) {
            subjectPerformance[subject] = {
              correct: 0,
              wrong: 0,
              unanswered: 0,
              total: 0,
              percentage: 0
            };
          }
          subjectPerformance[subject].correct += stats.correct || 0;
          subjectPerformance[subject].wrong += stats.wrong || 0;
          subjectPerformance[subject].unanswered += stats.unanswered || 0;
          subjectPerformance[subject].total += stats.total || 0;
        }
      }
    });

    // Calculate subject percentages
    Object.keys(subjectPerformance).forEach(subject => {
      const stats = subjectPerformance[subject];
      stats.percentage = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : 0;
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

    // Format test history for frontend with enhanced details
    const testHistory = userRecords.map(record => ({
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
      averageScore: Math.round(averagePercentage),
      averageWeightedScore: parseFloat(averageWeightedScore.toFixed(2)),
      bestScore: Math.round(bestPercentage),
      bestWeightedScore: parseFloat(bestWeightedScore.toFixed(2)),
      totalQuestions,
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
          // This would be calculated from individual question analysis
          // Implementation would require aggregating difficulty data
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

    console.log('Sending enhanced performance data with', testHistory.length, 'test records');
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching user performance:', error);
    next(error);
  }
};

// Get detailed user test history with answers
const getUserTestHistory = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const { testId } = req.params;
    
    if (!userId || !email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication',
        type: 'AUTH_ERROR'
      });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    // Build query
    let query = {
      $or: [
        { userId: userId },
        { email: email.toLowerCase().trim() }
      ]
    };
    
    if (testId) {
      query.testId = testId;
    }

    // Get records with full details including populated test data
    const records = await UserTestRecord.find(query)
      .sort({ 'completion.completedAt': -1 })
      .populate('testId', 'name year paper duration questions testType')
      .limit(50); // Limit to prevent large responses

    // Format detailed history with answer analysis
    const detailedHistory = records.map(record => {
      const incorrectAnswers = record.getIncorrectAnswers();
      const answerBreakdown = [];
      
      // Convert answers Map to array for frontend
      if (record.answers) {
        for (const [questionIndex, answerData] of record.answers.entries()) {
          answerBreakdown.push({
            questionIndex: parseInt(questionIndex),
            ...answerData
          });
        }
      }

      return {
        id: record._id,
        testId: record.testId?._id,
        testName: record.testName,
        testType: record.testType,
        testYear: record.testYear,
        testPaper: record.testPaper,
        score: record.score,
        correctAnswers: record.correctAnswers || 0,
        wrongAnswers: record.wrongAnswers || 0,
        unansweredQuestions: record.unansweredQuestions || 0,
        totalQuestions: record.totalQuestions,
        percentage: record.percentage,
        grade: record.grade,
        efficiency: record.efficiency,
        timeTaken: record.timeTaken,
        timeAllotted: record.timeAllotted,
        timeExpired: record.timeExpired,
        completedAt: record.completion?.completedAt || record.completedAt,
        submissionType: record.completion?.submissionType || 'manual',
        scoring: record.scoring || { correct: 4, wrong: -1, unanswered: 0 },
        performance: record.performanceSummary,
        answers: answerBreakdown,
        incorrectAnswers: incorrectAnswers,
        analytics: {
          subjectWisePerformance: record.analytics?.subjectWisePerformance ? 
            Object.fromEntries(record.analytics.subjectWisePerformance) : {},
          difficultyWisePerformance: record.analytics?.difficultyWisePerformance || {},
          averageTimePerQuestion: record.analytics?.averageTimePerQuestion || 0,
          flaggedQuestions: record.analytics?.flaggedQuestions || []
        },
        review: record.review,
        testDetails: record.testId ? {
          totalQuestions: record.testId.questions?.length,
          duration: record.testId.duration,
          testType: record.testId.testType
        } : null
      };
    });

    res.json({
      success: true,
      user: user.getPublicProfile(),
      testHistory: detailedHistory,
      totalRecords: detailedHistory.length,
      hasFullDetails: true,
      subscription: {
        ...user.subscription.toObject(),
        status: user.subscriptionStatus,
        remainingTests: user.remainingTests
      }
    });

  } catch (error) {
    console.error('Error fetching detailed test history:', error);
    next(error);
  }
};

// Get specific test attempt with full details
const getTestAttemptDetails = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { recordId } = req.params;
    
    // Find the specific test record
    const record = await UserTestRecord.findOne({
      _id: recordId,
      $or: [
        { userId: userId },
        { email: req.user.email.toLowerCase().trim() }
      ]
    }).populate('testId', 'name questions duration testType scoring');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Test record not found',
        type: 'RECORD_NOT_FOUND'
      });
    }

    // Get user data
    const user = await User.findById(userId);

    // Prepare detailed analysis
    const questionAnalysis = [];
    const test = record.testId;
    
    if (test && test.questions && record.answers) {
      test.questions.forEach((question, index) => {
        const answerData = record.getAnswerDetails(index);
        
        questionAnalysis.push({
          questionIndex: index,
          question: {
            text: question.question,
            options: question.options.map(opt => ({
              key: opt.key,
              text: opt.text,
              isCorrect: opt.correct
            })),
            difficulty: question.difficulty,
            area: question.area,
            subarea: question.subarea,
            explanation: question.explanation
          },
          answer: answerData || {
            selectedOption: '',
            correctOption: question.options.find(opt => opt.correct)?.key || 'A',
            isCorrect: false,
            timeSpent: 0,
            attempts: 0
          }
        });
      });
    }

    // Calculate detailed analytics
    const detailedAnalytics = record.calculateDetailedAnalytics();

    res.json({
      success: true,
      record: {
        id: record._id,
        testName: record.testName,
        testType: record.testType,
        score: record.score,
        percentage: record.percentage,
        grade: record.grade,
        performance: record.performanceSummary,
        timeTaken: record.timeTaken,
        timeAllotted: record.timeAllotted,
        completedAt: record.completion?.completedAt || record.completedAt,
        scoring: record.scoring
      },
      questionAnalysis,
      analytics: detailedAnalytics,
      user: user?.getPublicProfile(),
      comparison: record.getComparisonWithPreviousAttempts(),
      recommendations: generateRecommendations(record, detailedAnalytics)
    });

  } catch (error) {
    console.error('Error fetching test attempt details:', error);
    next(error);
  }
};

// Update user profile
const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { profile, preferences } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    // Update profile fields if provided
    if (profile) {
      Object.keys(profile).forEach(key => {
        if (user.profile[key] !== undefined) {
          user.profile[key] = profile[key];
        }
      });
    }

    // Update preferences if provided
    if (preferences) {
      Object.keys(preferences).forEach(key => {
        if (user.preferences[key] !== undefined) {
          if (typeof preferences[key] === 'object') {
            Object.assign(user.preferences[key], preferences[key]);
          } else {
            user.preferences[key] = preferences[key];
          }
        }
      });
    }

    await user.save();

    console.log('User profile updated:', {
      userId,
      email: user.email,
      updatedFields: Object.keys(profile || {}).concat(Object.keys(preferences || {}))
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Error updating user profile:', error);
    next(error);
  }
};

// Submit test feedback
const submitTestFeedback = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { recordId } = req.params;
    const { difficulty, quality, comments } = req.body;

    const record = await UserTestRecord.findOne({
      _id: recordId,
      $or: [
        { userId: userId },
        { email: req.user.email.toLowerCase().trim() }
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
    record.review = {
      hasReviewed: true,
      reviewedAt: new Date(),
      feedback: {
        difficulty: difficulty || 'Just Right',
        quality: quality || 5,
        comments: comments || ''
      }
    };

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
  if (analytics.subjectWisePerformance) {
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