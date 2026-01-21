const PracticeQuestion = require('../models/PracticeQuestion');
const UserQuestionProgress = require('../models/UserQuestionProgress');
const mongoose = require('mongoose');

// Get next random question for untimed practice
const getNextQuestion = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { area, difficulty, limit = 1, sortBy = 'random' } = req.query;

    console.log('Getting next question for user:', userId.toString(), { area, difficulty });

    // FIXED: Only exclude ANSWERED questions, NOT skipped ones
    // Skipped questions should be available to attempt again
    const answeredQuestions = await UserQuestionProgress.find({ 
      userId: userId,
      status: 'answered'  // ONLY exclude answered questions, skipped can repeat
    }).select('questionId');

    const answeredQuestionIds = answeredQuestions.map(progress => progress.questionId.toString());
    
    console.log('User has ANSWERED', answeredQuestionIds.length, 'questions (skipped questions can repeat)');

    // Build question query - exclude ONLY answered questions
    const questionQuery = {
      isActive: true,
      _id: { $nin: answeredQuestionIds }
    };

    if (area && area !== 'all' && area !== '0') {
      questionQuery.area = parseInt(area);
    }

    if (difficulty && difficulty !== 'all') {
      questionQuery.difficulty = difficulty;
    }

    console.log('Question query:', questionQuery);

    // Get available questions count
    const totalAvailable = await PracticeQuestion.countDocuments(questionQuery);
    
    console.log('Total available questions:', totalAvailable);

    if (totalAvailable === 0) {
      return res.json({
        success: false,
        message: area && area !== 'all' 
          ? 'No more questions available for this subject. Try "All Subjects" or a different subject.'
          : 'Congratulations! You have completed all available questions. More questions will be added soon.',
        question: null,
        totalAvailable: 0
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
        message: 'No questions found matching your criteria',
        question: null,
        totalAvailable: 0
      });
    }

    console.log('Selected question:', question._id);

    // Update question usage
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
      totalAvailable: totalAvailable - 1,
      totalAnswered: answeredQuestionIds.length, // Only count answered questions, not skipped
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

    console.log('Tracking answer for user:', userId.toString(), { questionId, selectedAnswer, isCorrect });

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
      .select('area difficulty key explanation');

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // FIXED: Verify the answer is correct BEFORE checking existing progress so we can use it
    const actualIsCorrect = question.key === selectedAnswer;

    // FIXED: Handle answering previously skipped questions
    const existingProgress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (existingProgress) {
      if (existingProgress.status === 'answered') {
        console.log('User has already answered this question');
        return res.status(409).json({
          success: false,
          message: 'You have already answered this question',
          alreadyAttempted: true
        });
      } else if (existingProgress.status === 'skipped') {
        // Update existing skip record to answered status
        console.log('Converting skip to answer for question:', existingProgress._id);
        existingProgress.status = 'answered';
        existingProgress.selectedAnswer = selectedAnswer;
        existingProgress.isCorrect = actualIsCorrect;
        existingProgress.timeSpent = timeSpent;
        existingProgress.attemptedAt = new Date();
        
        await existingProgress.save();
        console.log('Skip converted to answer:', existingProgress._id);

        // Update question statistics
        await PracticeQuestion.findByIdAndUpdate(
          questionId,
          {
            $inc: {
              'usage.totalAttempts': 1,
              'usage.correctAttempts': actualIsCorrect ? 1 : 0
            }
          }
        );

        // Get updated user stats for this subject
        const userStats = await getUserStatsForSubject(userId, question.area);

        return res.json({
          success: true,
          message: 'Answer recorded successfully (converted from skip)',
          result: {
            isCorrect: actualIsCorrect,
            correctAnswer: question.key,
            selectedAnswer,
            timeSpent,
            explanation: question.explanation,
            converted: true
          },
          userStats
        });
      }
    }

    // Create new progress record
    const progress = new UserQuestionProgress({
      userId,
      questionId,
      status: 'answered',
      selectedAnswer,
      isCorrect: actualIsCorrect,
      timeSpent,
      subject: question.area,
      difficulty: question.difficulty || 'Medium',
      attemptedAt: new Date()
    });

    console.log('🔍 DEBUG: About to save progress record:', {
      userId: progress.userId,
      questionId: progress.questionId,
      status: progress.status,
      selectedAnswer: progress.selectedAnswer,
      isCorrect: progress.isCorrect,
      subject: progress.subject
    });

    await progress.save();
    console.log('✅ DEBUG: Progress record saved successfully with ID:', progress._id);

    // CRITICAL: Let's verify what was actually saved
    const savedRecord = await UserQuestionProgress.findById(progress._id);
    console.log('🔍 DEBUG: Verification - what was actually saved to database:', {
      _id: savedRecord._id,
      userId: savedRecord.userId,
      questionId: savedRecord.questionId,
      status: savedRecord.status,
      selectedAnswer: savedRecord.selectedAnswer,
      isCorrect: savedRecord.isCorrect,
      subject: savedRecord.subject
    });
    console.log('Progress saved:', progress._id);

    // Update question statistics
    await PracticeQuestion.findByIdAndUpdate(
      questionId,
      {
        $inc: {
          'usage.totalAttempts': 1,
          'usage.correctAttempts': actualIsCorrect ? 1 : 0
        }
      }
    );

    // Get updated user stats for this subject
    const userStats = await getUserStatsForSubject(userId, question.area);

    res.json({
      success: true,
      message: 'Answer recorded successfully',
      result: {
        isCorrect: actualIsCorrect,
        correctAnswer: question.key,
        selectedAnswer,
        timeSpent,
        explanation: question.explanation
      },
      userStats
    });

  } catch (error) {
    console.error('Track answer error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already attempted this question',
        alreadyAttempted: true
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

    console.log('Tracking skip for user:', userId.toString(), { questionId });

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

    // FIXED: Handle multiple skips of same question since skipped questions can appear again
    const existingProgress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (existingProgress) {
      if (existingProgress.status === 'answered') {
        console.log('User has already answered this question, cannot skip');
        return res.status(409).json({
          success: false,
          message: 'You have already answered this question',
          alreadyAttempted: true
        });
      } else if (existingProgress.status === 'skipped') {
        // Update existing skip record (just update timestamp)
        console.log('Updating existing skip record for question:', existingProgress._id);
        existingProgress.attemptedAt = new Date();
        existingProgress.timeSpent = timeSpent;
        await existingProgress.save();
        console.log('Skip record updated:', existingProgress._id);
        
        // Get updated user stats for this subject
        const userStats = await getUserStatsForSubject(userId, question.area);

        return res.json({
          success: true,
          message: 'Skip recorded successfully (updated)',
          result: {
            skipped: true,
            timeSpent,
            updated: true
          },
          userStats
        });
      }
    }

    // Create new progress record for first-time skip
    const progress = new UserQuestionProgress({
      userId,
      questionId,
      status: 'skipped',
      timeSpent,
      subject: question.area,
      difficulty: question.difficulty || 'Medium',
      attemptedAt: new Date()
    });

    await progress.save();
    console.log('New skip progress saved:', progress._id);

    // Get updated user stats for this subject
    const userStats = await getUserStatsForSubject(userId, question.area);

    res.json({
      success: true,
      message: 'Skip recorded successfully',
      result: {
        skipped: true,
        timeSpent
      },
      userStats
    });

  } catch (error) {
    console.error('Track skip error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already attempted this question',
        alreadyAttempted: true
      });
    }
    
    next(error);
  }
};

// Get user's untimed practice statistics
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    console.log('Getting user stats for:', userId.toString());

    // 🚨 CRITICAL DEBUG: Let's see ALL records for this user
    const allUserRecords = await UserQuestionProgress.find({ userId }).lean();
    console.log('🔍 DEBUG: TOTAL USER RECORDS IN DATABASE:', allUserRecords.length);
    
    // Group by status to see the distribution
    const statusCounts = allUserRecords.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 DEBUG: STATUS DISTRIBUTION:', statusCounts);

    // Show a few sample records
    console.log('📝 DEBUG: SAMPLE RECORDS:');
    allUserRecords.slice(0, 5).forEach((record, index) => {
      console.log(`  Record ${index + 1}:`, {
        _id: record._id,
        status: record.status,
        subject: record.subject,
        selectedAnswer: record.selectedAnswer,
        isCorrect: record.isCorrect,
        createdAt: record.createdAt || record.attemptedAt
      });
    });

    // Get overall stats
    const overallStats = await getUserStatsForSubject(userId);

    // Get subject-wise breakdown
    const subjectBreakdown = await UserQuestionProgress.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$subject',
          answered: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          skipped: { $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] } },
          correct: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', true] }] }, 1, 0] } },
          wrong: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'answered'] }, { $eq: ['$isCorrect', false] }] }, 1, 0] } },
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

    console.log('Overall stats:', overallStats);
    console.log('Subject breakdown:', subjectBreakdown.length, 'subjects');

    res.json({
      success: true,
      stats: {
        overall: overallStats,
        breakdown: subjectBreakdown,
        recentActivity: []
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    
    // Return empty stats instead of failing
    res.json({
      success: true,
      stats: {
        overall: {
          total: 0,
          answered: 0,
          skipped: 0,
          correct: 0,
          wrong: 0,
          accuracy: 0
        },
        breakdown: [],
        recentActivity: []
      }
    });
  }
};

// SIMPLIFIED: Helper function to get user stats for a specific subject
const getUserStatsForSubject = async (userId, subject = null) => {
  try {
    console.log('🔍 SIMPLE DEBUG: Getting stats for userId:', userId.toString());
    
    // Use the exact same userId format as when saving records
    const matchQuery = { userId };
    if (subject) {
      matchQuery.subject = subject;
    }

    console.log('📊 SIMPLE DEBUG: Match query:', matchQuery);

    // Count all records first
    const totalCount = await UserQuestionProgress.countDocuments(matchQuery);
    console.log(`📊 SIMPLE DEBUG: Total records found: ${totalCount}`);

    if (totalCount === 0) {
      console.log('❌ SIMPLE DEBUG: No records found, returning zeros');
      return { total: 0, answered: 0, skipped: 0, correct: 0, wrong: 0, accuracy: 0 };
    }

    // Count answered records
    const answeredCount = await UserQuestionProgress.countDocuments({
      ...matchQuery,
      status: 'answered'
    });

    // Count correct answers
    const correctCount = await UserQuestionProgress.countDocuments({
      ...matchQuery,
      status: 'answered',
      isCorrect: true
    });

    // Count wrong answers
    const wrongCount = await UserQuestionProgress.countDocuments({
      ...matchQuery,
      status: 'answered',
      isCorrect: false
    });

    // Count skipped
    const skippedCount = await UserQuestionProgress.countDocuments({
      ...matchQuery,
      status: 'skipped'
    });

    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    const result = {
      total: totalCount,
      answered: answeredCount,
      skipped: skippedCount,
      correct: correctCount,
      wrong: wrongCount,
      accuracy: accuracy
    };

    console.log('✅ SIMPLE DEBUG: Calculated stats:', JSON.stringify(result, null, 2));
    return result;
    
  } catch (error) {
    console.error('❌ SIMPLE DEBUG: Error calculating stats:', error);
    return { total: 0, answered: 0, skipped: 0, correct: 0, wrong: 0, accuracy: 0 };
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
    console.log('Reset progress for user:', userId.toString(), 'deleted:', result.deletedCount);

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