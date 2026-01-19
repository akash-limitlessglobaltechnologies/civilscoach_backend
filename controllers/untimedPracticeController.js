const PracticeQuestion = require('../models/PracticeQuestion');
const UserQuestionProgress = require('../models/UserQuestionProgress');

// Get next random question for untimed practice
const getNextQuestion = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { area, difficulty, limit = 1, sortBy = 'random' } = req.query;

    // Build query to exclude already answered questions
    const answeredQuestions = await UserQuestionProgress.getAnsweredQuestions(userId, area);
    const answeredQuestionIds = answeredQuestions.map(progress => progress.questionId);

    // Build question query
    const questionQuery = {
      isActive: true,
      _id: { $nin: answeredQuestionIds }
    };

    if (area && area !== 'all') {
      questionQuery.area = parseInt(area);
    }

    if (difficulty && difficulty !== 'all') {
      questionQuery.difficulty = difficulty;
    }

    // Get available questions count
    const totalAvailable = await PracticeQuestion.countDocuments(questionQuery);
    
    if (totalAvailable === 0) {
      return res.json({
        success: false,
        message: 'No more questions available for the selected criteria',
        question: null
      });
    }

    // For random selection, skip a random number of documents
    let question;
    if (sortBy === 'random') {
      const randomSkip = Math.floor(Math.random() * totalAvailable);
      question = await PracticeQuestion.findOne(questionQuery)
        .skip(randomSkip)
        .select('questionId question difficulty area subarea OptionA OptionB OptionC OptionD key explanation source qualityScore');
    } else {
      // Other sorting options
      let sortQuery = {};
      switch (sortBy) {
        case 'difficulty':
          sortQuery = { difficulty: 1, createdAt: -1 };
          break;
        case 'area':
          sortQuery = { area: 1, createdAt: -1 };
          break;
        case 'quality':
          sortQuery = { qualityScore: -1, createdAt: -1 };
          break;
        default:
          sortQuery = { createdAt: -1 };
      }
      
      question = await PracticeQuestion.findOne(questionQuery)
        .sort(sortQuery)
        .select('questionId question difficulty area subarea OptionA OptionB OptionC OptionD key explanation source qualityScore');
    }

    if (!question) {
      return res.json({
        success: false,
        message: 'No questions found',
        question: null
      });
    }

    // Update question usage (increment times used)
    await PracticeQuestion.findByIdAndUpdate(
      question._id,
      { 
        $inc: { 'usage.timesUsed': 1 },
        $set: { 'usage.lastUsed': new Date() }
      }
    );

    res.json({
      success: true,
      question: {
        _id: question._id,
        questionId: question.questionId,
        question: question.question,
        difficulty: question.difficulty || 'Medium',
        area: question.area,
        subarea: question.subarea,
        OptionA: question.OptionA,
        OptionB: question.OptionB,
        OptionC: question.OptionC,
        OptionD: question.OptionD,
        key: question.key,
        explanation: question.explanation,
        source: question.source,
        qualityScore: question.qualityScore
      },
      totalAvailable: totalAvailable - 1, // Subtract 1 as we're now using this question
      message: 'Question retrieved successfully'
    });

  } catch (error) {
    console.error('Get next question error:', error);
    next(error);
  }
};

// Track user's answer to a question
const trackAnswer = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { questionId, selectedAnswer, isCorrect, timeSpent = 0 } = req.body;

    if (!questionId || !selectedAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Question ID and selected answer are required'
      });
    }

    if (!['A', 'B', 'C', 'D'].includes(selectedAnswer)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid answer option'
      });
    }

    // Get question details for metadata
    const question = await PracticeQuestion.findById(questionId)
      .select('area difficulty');

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Create or update progress record
    let progress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (progress) {
      // Update existing record
      await progress.markAsAnswered(selectedAnswer, isCorrect, timeSpent);
    } else {
      // Create new record
      progress = new UserQuestionProgress({
        userId,
        questionId,
        status: 'answered',
        selectedAnswer,
        isCorrect,
        timeSpent,
        subject: question.area,
        difficulty: question.difficulty
      });
      await progress.save();
    }

    // Update question statistics
    await PracticeQuestion.findByIdAndUpdate(
      questionId,
      {
        $inc: {
          'usage.totalAttempts': 1,
          'usage.correctAttempts': isCorrect ? 1 : 0
        }
      }
    );

    // Get updated user stats
    const userStats = await UserQuestionProgress.getUserStats(userId, question.area);

    res.json({
      success: true,
      message: 'Answer tracked successfully',
      result: {
        isCorrect,
        selectedAnswer,
        timeSpent
      },
      userStats
    });

  } catch (error) {
    console.error('Track answer error:', error);
    
    if (error.code === 11000) {
      // Duplicate key error - question already answered
      return res.status(409).json({
        success: false,
        message: 'This question has already been answered'
      });
    }
    
    next(error);
  }
};

// Track when user skips a question
const trackSkip = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { questionId, timeSpent = 0 } = req.body;

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: 'Question ID is required'
      });
    }

    // Get question details for metadata
    const question = await PracticeQuestion.findById(questionId)
      .select('area difficulty');

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Create or update progress record
    let progress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (progress) {
      // Update existing record
      await progress.markAsSkipped(timeSpent);
    } else {
      // Create new record
      progress = new UserQuestionProgress({
        userId,
        questionId,
        status: 'skipped',
        timeSpent,
        subject: question.area,
        difficulty: question.difficulty
      });
      await progress.save();
    }

    // Get updated user stats
    const userStats = await UserQuestionProgress.getUserStats(userId, question.area);

    res.json({
      success: true,
      message: 'Skip tracked successfully',
      result: {
        skipped: true,
        timeSpent
      },
      userStats
    });

  } catch (error) {
    console.error('Track skip error:', error);
    
    if (error.code === 11000) {
      // Duplicate key error - question already tracked
      return res.status(409).json({
        success: false,
        message: 'This question has already been tracked'
      });
    }
    
    next(error);
  }
};

// Get user's untimed practice statistics (ENHANCED for Performance page)
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { subject } = req.query;

    // Get overall stats
    const overallStats = await UserQuestionProgress.getUserStats(userId);

    // Get subject-wise stats if subject is specified
    let subjectStats = null;
    if (subject && subject !== 'all') {
      subjectStats = await UserQuestionProgress.getUserStats(userId, parseInt(subject));
    }

    // Get recent activity (last 10 questions)
    const recentActivity = await UserQuestionProgress.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('status isCorrect subject difficulty attemptedAt')
      .populate('questionId', 'questionId question');

    // Get subject-wise breakdown (ENHANCED with better aggregation)
    const subjectBreakdown = await UserQuestionProgress.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$subject',
          answered: {
            $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] }
          },
          skipped: {
            $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] }
          },
          correct: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', true] }] }, 1, 0] }
          },
          wrong: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', false] }] }, 1, 0] }
          },
          totalTimeSpent: { $sum: '$timeSpent' },
          avgTimeSpent: { $avg: '$timeSpent' }
        }
      },
      { 
        $addFields: {
          accuracy: {
            $cond: {
              if: { $gt: ['$answered', 0] },
              then: { $multiply: [{ $divide: ['$correct', '$answered'] }, 100] },
              else: 0
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get difficulty-wise breakdown
    const difficultyBreakdown = await UserQuestionProgress.aggregate([
      { $match: { userId, status: 'answered' } },
      {
        $group: {
          _id: '$difficulty',
          answered: { $sum: 1 },
          correct: {
            $sum: { $cond: [{ $eq: ['$isCorrect', true] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          accuracy: {
            $cond: {
              if: { $gt: ['$answered', 0] },
              then: { $multiply: [{ $divide: ['$correct', '$answered'] }, 100] },
              else: 0
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        overall: overallStats,
        subject: subjectStats,
        breakdown: subjectBreakdown,
        difficultyBreakdown,
        recentActivity: recentActivity.map(activity => ({
          status: activity.status,
          isCorrect: activity.isCorrect,
          subject: activity.subject,
          difficulty: activity.difficulty,
          attemptedAt: activity.attemptedAt,
          questionPreview: activity.questionId?.question?.substring(0, 100) + '...'
        }))
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    next(error);
  }
};

// Reset user progress for a subject (for testing or restart)
const resetProgress = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { subject, confirmReset } = req.body;

    if (!confirmReset) {
      return res.status(400).json({
        success: false,
        message: 'Reset confirmation required'
      });
    }

    const query = { userId };
    if (subject && subject !== 'all') {
      query.subject = parseInt(subject);
    }

    const result = await UserQuestionProgress.deleteMany(query);

    res.json({
      success: true,
      message: `Reset completed. ${result.deletedCount} records removed.`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Reset progress error:', error);
    next(error);
  }
};

module.exports = {
  getNextQuestion,
  trackAnswer,
  trackSkip,
  getUserStats,
  resetProgress
};