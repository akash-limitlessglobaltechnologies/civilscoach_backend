const User = require('../models/User');
const UserTestRecord = require('../models/UserTestRecord');
const UserQuestionProgress = require('../models/UserQuestionProgress');
const Test = require('../models/Test');
const PracticeQuestion = require('../models/PracticeQuestion');
const mongoose = require('mongoose');

// =============================================================================
// USER ANALYTICS
// =============================================================================

/**
 * Get list of all users with basic statistics
 * GET /api/admin/analytics/users
 * Query params: page, limit, search, sortBy, sortOrder
 */
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build search query
    const searchQuery = {};
    if (search) {
      searchQuery.$or = [
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const totalUsers = await User.countDocuments(searchQuery);

    // Get users with pagination
    const users = await User.find(searchQuery)
      .select('-password')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // Enrich with test statistics
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const testStats = await UserTestRecord.aggregate([
          {
            $match: {
              userId: user._id
            }
          },
          {
            $group: {
              _id: null,
              totalTests: { $sum: 1 },
              avgScore: { $avg: '$score' },
              avgPercentage: { $avg: '$percentage' },
              totalTimedTests: {
                $sum: {
                  $cond: [{ $ne: ['$testType', 'Practice'] }, 1, 0]
                }
              }
            }
          }
        ]);

        const untimedStats = await UserQuestionProgress.aggregate([
          {
            $match: {
              userId: user._id
            }
          },
          {
            $group: {
              _id: null,
              totalQuestions: { $sum: 1 },
              answered: {
                $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] }
              },
              correct: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', true] }] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]);

        const stats = testStats[0] || {
          totalTests: 0,
          avgScore: 0,
          avgPercentage: 0,
          totalTimedTests: 0
        };

        const untimed = untimedStats[0] || {
          totalQuestions: 0,
          answered: 0,
          correct: 0
        };

        return {
          _id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          fullName: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || 'N/A',
          category: user.profile?.category || 'General',
          isActive: user.security?.isActive || false,
          isVerified: user.security?.isVerified || false,
          joinedAt: user.createdAt,
          lastLoginAt: user.security?.lastLoginAt,
          subscriptionPlan: user.subscription?.plan || 'Free',
          timedTests: {
            total: stats.totalTimedTests,
            avgScore: Math.round(stats.avgScore * 100) / 100,
            avgPercentage: Math.round(stats.avgPercentage * 10) / 10
          },
          untimedPractice: {
            totalQuestions: untimed.totalQuestions,
            answered: untimed.answered,
            correct: untimed.correct,
            accuracy: untimed.answered > 0 
              ? Math.round((untimed.correct / untimed.answered) * 100) 
              : 0
          },
          statistics: user.statistics
        };
      })
    );

    res.json({
      success: true,
      data: {
        users: enrichedUsers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers: totalUsers,
          limit: limit
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * Get detailed analytics for a specific user
 * GET /api/admin/analytics/users/:userId
 */
exports.getUserDetailedAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Get user details
    const user = await User.findById(userId).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all test attempts
    const testAttempts = await UserTestRecord.find({ userId })
      .populate('testId', 'name testType year paper')
      .sort({ 'completion.completedAt': -1 })
      .lean();

    // ✅ FIXED: Get test statistics by type
    const testStatsByType = await UserTestRecord.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$testType',
          count: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgPercentage: { $avg: '$percentage' },
          avgTime: { $avg: '$timeTaken' },
          bestScore: { $max: '$score' },
          totalTime: { $sum: '$timeTaken' }
        }
      }
    ]);

    // ✅ FIXED: Get subject-wise performance from all tests
    const subjectPerformance = await UserTestRecord.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          subjectPerformance: { $objectToArray: '$analytics.subjectWisePerformance' }
        }
      },
      { $unwind: '$subjectPerformance' },
      {
        $group: {
          _id: '$subjectPerformance.k',
          totalQuestions: { $sum: '$subjectPerformance.v.total' },
          correctAnswers: { $sum: '$subjectPerformance.v.correct' },
          wrongAnswers: { $sum: '$subjectPerformance.v.wrong' },
          unanswered: { $sum: '$subjectPerformance.v.unanswered' }
        }
      },
      {
        $project: {
          subject: '$_id',
          totalQuestions: 1,
          correctAnswers: 1,
          wrongAnswers: 1,
          unanswered: 1,
          accuracy: {
            $cond: {
              if: { $gt: ['$totalQuestions', 0] },
              then: { $round: [{ $multiply: [{ $divide: ['$correctAnswers', '$totalQuestions'] }, 100] }, 1] },
              else: 0
            }
          }
        }
      },
      { $sort: { subject: 1 } }
    ]);

    // Get untimed practice statistics
    const untimedOverall = await UserQuestionProgress.getUserStats(userId);

    // ✅ FIXED: Get untimed practice by subject
    const untimedBySubject = await UserQuestionProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$subject',
          total: { $sum: 1 },
          answered: {
            $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] }
          },
          skipped: {
            $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] }
          },
          correct: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', true] }] },
                1,
                0
              ]
            }
          },
          wrong: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', false] }] },
                1,
                0
              ]
            }
          },
          totalTimeSpent: { $sum: '$timeSpent' }
        }
      },
      {
        $project: {
          subject: '$_id',
          total: 1,
          answered: 1,
          skipped: 1,
          correct: 1,
          wrong: 1,
          totalTimeSpent: 1,
          accuracy: {
            $cond: {
              if: { $gt: ['$answered', 0] },
              then: { $round: [{ $multiply: [{ $divide: ['$correct', '$answered'] }, 100] }, 1] },
              else: 0
            }
          }
        }
      },
      { $sort: { subject: 1 } }
    ]);

    // Get recent activity
    const recentTests = testAttempts.slice(0, 10).map(test => ({
      testId: test.testId?._id,
      testName: test.testName,
      testType: test.testType,
      score: test.score,
      percentage: test.percentage,
      timeTaken: test.timeTaken,
      completedAt: test.completion.completedAt,
      grade: test.grade
    }));

    const recentPractice = await UserQuestionProgress.find({ userId })
      .populate('questionId', 'question area difficulty')
      .sort({ attemptedAt: -1 })
      .limit(20)
      .lean();

    // ✅ FIXED: Calculate performance trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const performanceTrend = await UserTestRecord.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          'completion.completedAt': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$completion.completedAt'
            }
          },
          testsCount: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgPercentage: { $avg: '$percentage' }
        }
      },
      {
        $sort: { '_id': 1 }
      },
      {
        $project: {
          date: '$_id',
          testsCount: 1,
          avgScore: { $round: ['$avgScore', 2] },
          avgPercentage: { $round: ['$avgPercentage', 1] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profile: user.profile,
          subscription: user.subscription,
          statistics: user.statistics,
          security: user.security,
          joinedAt: user.createdAt,
          lastActive: user.statistics.lastActiveDate
        },
        timedTests: {
          overall: {
            totalTests: testAttempts.length,
            byType: testStatsByType.reduce((acc, stat) => {
              acc[stat._id] = {
                count: stat.count,
                avgScore: Math.round(stat.avgScore * 100) / 100,
                avgPercentage: Math.round(stat.avgPercentage * 10) / 10,
                avgTime: Math.round(stat.avgTime * 10) / 10,
                bestScore: Math.round(stat.bestScore * 100) / 100
              };
              return acc;
            }, {})
          },
          subjectPerformance: subjectPerformance,
          recentTests: recentTests,
          allAttempts: testAttempts.map(test => ({
            _id: test._id,
            testId: test.testId?._id,
            testName: test.testName,
            testType: test.testType,
            year: test.testYear,
            paper: test.testPaper,
            score: test.score,
            percentage: test.percentage,
            correctAnswers: test.correctAnswers,
            wrongAnswers: test.wrongAnswers,
            unansweredQuestions: test.unansweredQuestions,
            totalQuestions: test.totalQuestions,
            timeTaken: test.timeTaken,
            timeAllotted: test.timeAllotted,
            completedAt: test.completion.completedAt,
            submissionType: test.completion.submissionType
          }))
        },
        untimedPractice: {
          overall: untimedOverall,
          bySubject: untimedBySubject,
          recentActivity: recentPractice.map(practice => ({
            _id: practice._id,
            questionId: practice.questionId?._id,
            questionText: practice.questionId?.question?.substring(0, 100) + '...',
            subject: practice.subject,
            difficulty: practice.difficulty,
            status: practice.status,
            selectedAnswer: practice.selectedAnswer,
            isCorrect: practice.isCorrect,
            timeSpent: practice.timeSpent,
            attemptedAt: practice.attemptedAt
          }))
        },
        performanceTrend: performanceTrend
      }
    });
  } catch (error) {
    console.error('Get user detailed analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics',
      error: error.message
    });
  }
};

// =============================================================================
// PLATFORM ANALYTICS
// =============================================================================

/**
 * Get overall platform statistics
 * GET /api/admin/analytics/dashboard
 */
exports.getPlatformDashboard = async (req, res) => {
  try {
    // Get total users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 'security.isActive': true });
    const verifiedUsers = await User.countDocuments({ 'security.isVerified': true });

    // Get users registered in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersLastWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    // Get total tests
    const totalTests = await Test.countDocuments();
    const activeTests = await Test.countDocuments({ isActive: true });

    // Get test attempts statistics
    const testStats = await UserTestRecord.aggregate([
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgPercentage: { $avg: '$percentage' },
          avgTime: { $avg: '$timeTaken' }
        }
      }
    ]);

    // Get test attempts by type
    const testsByType = await UserTestRecord.aggregate([
      {
        $group: {
          _id: '$testType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get practice questions statistics
    const totalPracticeQuestions = await PracticeQuestion.countDocuments({ isActive: true });

    const practiceStats = await UserQuestionProgress.aggregate([
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          answered: {
            $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] }
          },
          correct: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', true] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get activity trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyActivity = await UserTestRecord.aggregate([
      {
        $match: {
          'completion.completedAt': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$completion.completedAt'
            }
          },
          tests: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          date: '$_id',
          tests: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get top performing users
    const topUsers = await UserTestRecord.aggregate([
      {
        $group: {
          _id: '$userId',
          totalTests: { $sum: 1 },
          avgPercentage: { $avg: '$percentage' },
          totalScore: { $sum: '$score' }
        }
      },
      { $sort: { avgPercentage: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          userId: '$_id',
          totalTests: 1,
          avgPercentage: { $round: ['$avgPercentage', 1] },
          totalScore: { $round: ['$totalScore', 2] },
          email: { $arrayElemAt: ['$user.email', 0] },
          fullName: {
            $concat: [
              { $ifNull: [{ $arrayElemAt: ['$user.profile.firstName', 0] }, ''] },
              ' ',
              { $ifNull: [{ $arrayElemAt: ['$user.profile.lastName', 0] }, ''] }
            ]
          }
        }
      }
    ]);

    // Get most attempted tests
    const popularTests = await UserTestRecord.aggregate([
      {
        $group: {
          _id: '$testId',
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgPercentage: { $avg: '$percentage' },
          testName: { $first: '$testName' },
          testType: { $first: '$testType' }
        }
      },
      { $sort: { attempts: -1 } },
      { $limit: 10 },
      {
        $project: {
          testId: '$_id',
          testName: 1,
          testType: 1,
          attempts: 1,
          avgScore: { $round: ['$avgScore', 2] },
          avgPercentage: { $round: ['$avgPercentage', 1] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          verified: verifiedUsers,
          newLastWeek: newUsersLastWeek,
          growthRate: totalUsers > 0 ? ((newUsersLastWeek / totalUsers) * 100).toFixed(2) : 0
        },
        tests: {
          total: totalTests,
          active: activeTests,
          totalAttempts: testStats[0]?.totalAttempts || 0,
          avgScore: Math.round((testStats[0]?.avgScore || 0) * 100) / 100,
          avgPercentage: Math.round((testStats[0]?.avgPercentage || 0) * 10) / 10,
          avgTime: Math.round((testStats[0]?.avgTime || 0) * 10) / 10,
          byType: testsByType.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {})
        },
        practice: {
          totalQuestions: totalPracticeQuestions,
          totalAttempts: practiceStats[0]?.totalAttempts || 0,
          answered: practiceStats[0]?.answered || 0,
          correct: practiceStats[0]?.correct || 0,
          accuracy: practiceStats[0]?.answered > 0 
            ? Math.round((practiceStats[0].correct / practiceStats[0].answered) * 100) 
            : 0
        },
        activity: {
          dailyTrend: dailyActivity,
          topUsers: topUsers,
          popularTests: popularTests
        }
      }
    });
  } catch (error) {
    console.error('Get platform dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch platform analytics',
      error: error.message
    });
  }
};

/**
 * Get user test history with details
 * GET /api/admin/analytics/users/:userId/test-history
 */
exports.getUserTestHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const totalTests = await UserTestRecord.countDocuments({ userId });

    const tests = await UserTestRecord.find({ userId })
      .populate('testId', 'name testType year paper numberOfQuestions')
      .sort({ 'completion.completedAt': -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: {
        tests: tests.map(test => ({
          _id: test._id,
          sessionId: test.sessionId,
          test: {
            id: test.testId?._id,
            name: test.testName,
            type: test.testType,
            year: test.testYear,
            paper: test.testPaper,
            totalQuestions: test.totalQuestions
          },
          performance: {
            score: test.score,
            percentage: test.percentage,
            grade: test.grade,
            correctAnswers: test.correctAnswers,
            wrongAnswers: test.wrongAnswers,
            unansweredQuestions: test.unansweredQuestions
          },
          timing: {
            timeTaken: test.timeTaken,
            timeAllotted: test.timeAllotted,
            timeExpired: test.timeExpired
          },
          completion: test.completion,
          analytics: test.analytics
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalTests / limit),
          totalTests: totalTests,
          limit: limit
        }
      }
    });
  } catch (error) {
    console.error('Get user test history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user test history',
      error: error.message
    });
  }
};

/**
 * Get user untimed practice history
 * GET /api/admin/analytics/users/:userId/practice-history
 */
exports.getUserPracticeHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const subject = req.query.subject; // Optional filter

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // ✅ FIXED: Get user practice history
    const query = { userId: new mongoose.Types.ObjectId(userId) };
    if (subject && subject !== 'all') {
      query.subject = parseInt(subject);
    }

    const totalQuestions = await UserQuestionProgress.countDocuments(query);

    const questions = await UserQuestionProgress.find(query)
      .populate('questionId', 'question area subarea difficulty explanation')
      .sort({ attemptedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: {
        questions: questions.map(q => ({
          _id: q._id,
          question: {
            id: q.questionId?._id,
            text: q.questionId?.question,
            area: q.questionId?.area,
            subarea: q.questionId?.subarea,
            difficulty: q.questionId?.difficulty,
            explanation: q.questionId?.explanation
          },
          userResponse: {
            status: q.status,
            selectedAnswer: q.selectedAnswer,
            isCorrect: q.isCorrect,
            timeSpent: q.timeSpent
          },
          subject: q.subject,
          difficulty: q.difficulty,
          attemptedAt: q.attemptedAt
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalQuestions / limit),
          totalQuestions: totalQuestions,
          limit: limit
        }
      }
    });
  } catch (error) {
    console.error('Get user practice history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user practice history',
      error: error.message
    });
  }
};

/**
 * Export user data
 * GET /api/admin/analytics/users/:userId/export
 */
exports.exportUserData = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const testRecords = await UserTestRecord.find({ userId }).lean();
    const practiceRecords = await UserQuestionProgress.find({ userId }).lean();

    const exportData = {
      user: user,
      timedTests: testRecords,
      untimedPractice: practiceRecords,
      exportedAt: new Date(),
      totalTimedTests: testRecords.length,
      totalPracticeQuestions: practiceRecords.length
    };

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export user data',
      error: error.message
    });
  }
};