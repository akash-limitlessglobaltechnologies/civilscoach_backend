const PracticeQuestion = require('../models/PracticeQuestion');
const UserQuestionProgress = require('../models/UserQuestionProgress');
const mongoose = require('mongoose');

// Get next random question for untimed practice
const getNextQuestion = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { area, difficulty, limit = 1, sortBy = 'random' } = req.query;

    // Only exclude ANSWERED questions, NOT skipped ones
    // Skipped questions should be available to attempt again
    const answeredQuestions = await UserQuestionProgress.find({ 
      userId: userId,
      status: 'answered'
    }).select('questionId');

    const answeredQuestionIds = answeredQuestions.map(progress => progress.questionId.toString());

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

    // Get available questions count
    const totalAvailable = await PracticeQuestion.countDocuments(questionQuery);

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
      totalAnswered: answeredQuestionIds.length,
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
      .select('area difficulty key explanation');

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Verify the answer is correct
    const actualIsCorrect = question.key === selectedAnswer;

    // Handle answering previously skipped questions
    const existingProgress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (existingProgress) {
      if (existingProgress.status === 'answered') {
        return res.status(409).json({
          success: false,
          message: 'You have already answered this question',
          alreadyAttempted: true
        });
      } else if (existingProgress.status === 'skipped') {
        // Update existing skip record to answered status
        existingProgress.status = 'answered';
        existingProgress.selectedAnswer = selectedAnswer;
        existingProgress.isCorrect = actualIsCorrect;
        existingProgress.timeSpent = timeSpent;
        existingProgress.attemptedAt = new Date();
        
        await existingProgress.save();

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

    await progress.save();

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

    // Check if question was already attempted
    const existingProgress = await UserQuestionProgress.findOne({
      userId,
      questionId
    });

    if (existingProgress) {
      if (existingProgress.status === 'answered') {
        return res.status(409).json({
          success: false,
          message: 'You have already answered this question',
          alreadyAttempted: true
        });
      } else if (existingProgress.status === 'skipped') {
        // Update existing skip record
        existingProgress.timeSpent += timeSpent;
        existingProgress.attemptedAt = new Date();
        
        await existingProgress.save();

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

// Get user's untimed practice statistics - FIXED VERSION
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    console.log('Getting user stats for:', userId.toString());

    // First, let's check what records exist for debugging
    const allRecords = await UserQuestionProgress.find({ userId }).lean();
    console.log('Total records found:', allRecords.length);
    
    if (allRecords.length > 0) {
      console.log('Sample records:', allRecords.slice(0, 3).map(r => ({
        subject: r.subject,
        status: r.status,
        isCorrect: r.isCorrect,
        selectedAnswer: r.selectedAnswer
      })));
    }

    // Get overall stats
    const overallStats = await getUserStatsForSubject(userId);
    console.log('Overall stats calculated:', overallStats);

    // FIXED: More robust subject-wise breakdown
    const subjectBreakdown = await UserQuestionProgress.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId) // Ensure proper ObjectId matching
        } 
      },
      {
        $group: {
          _id: '$subject',
          answered: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] 
            } 
          },
          skipped: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] 
            } 
          },
          correct: { 
            $sum: { 
              $cond: [
                { 
                  $and: [
                    { $eq: ['$status', 'answered'] }, 
                    { $eq: ['$isCorrect', true] }
                  ] 
                }, 
                1, 
                0
              ] 
            } 
          },
          wrong: { 
            $sum: { 
              $cond: [
                { 
                  $and: [
                    { $eq: ['$status', 'answered'] }, 
                    { $eq: ['$isCorrect', false] }
                  ] 
                }, 
                1, 
                0
              ] 
            } 
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
              then: { 
                $round: [
                  { $multiply: [{ $divide: ['$correct', '$answered'] }, 100] }, 
                  1
                ]
              },
              else: 0
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('Subject breakdown result:', subjectBreakdown);

    // If aggregation returns empty but we have records, try alternative approach
    let finalBreakdown = subjectBreakdown;
    if (subjectBreakdown.length === 0 && allRecords.length > 0) {
      console.log('Aggregation returned empty, using manual calculation...');
      
      // Manual subject breakdown calculation
      const subjectStats = {};
      
      allRecords.forEach(record => {
        const subject = record.subject;
        if (!subjectStats[subject]) {
          subjectStats[subject] = {
            _id: subject,
            answered: 0,
            skipped: 0,
            correct: 0,
            wrong: 0,
            accuracy: 0,
            totalTimeSpent: 0,
            avgTimeSpent: 0
          };
        }
        
        if (record.status === 'answered') {
          subjectStats[subject].answered++;
          if (record.isCorrect) {
            subjectStats[subject].correct++;
          } else {
            subjectStats[subject].wrong++;
          }
        } else if (record.status === 'skipped') {
          subjectStats[subject].skipped++;
        }
        
        subjectStats[subject].totalTimeSpent += (record.timeSpent || 0);
      });
      
      // Calculate accuracy for each subject
      Object.values(subjectStats).forEach(stats => {
        if (stats.answered > 0) {
          stats.accuracy = Math.round((stats.correct / stats.answered) * 100);
          stats.avgTimeSpent = stats.totalTimeSpent / (stats.answered + stats.skipped);
        }
      });
      
      finalBreakdown = Object.values(subjectStats).sort((a, b) => a._id - b._id);
      console.log('Manual breakdown result:', finalBreakdown);
    }

    res.json({
      success: true,
      stats: {
        overall: overallStats,
        breakdown: finalBreakdown,
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

// Helper function to get user stats for a specific subject - ENHANCED VERSION
const getUserStatsForSubject = async (userId, subject = null) => {
  try {
    // Ensure we're using the correct userId format
    const matchQuery = { 
      userId: new mongoose.Types.ObjectId(userId) 
    };
    
    if (subject) {
      matchQuery.subject = subject;
    }

    console.log('Stats query:', matchQuery);

    // Count all records first
    const totalCount = await UserQuestionProgress.countDocuments(matchQuery);
    console.log('Total count:', totalCount);

    if (totalCount === 0) {
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

    console.log('Calculated stats:', result);
    return result;
    
  } catch (error) {
    console.error('Error calculating stats:', error);
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