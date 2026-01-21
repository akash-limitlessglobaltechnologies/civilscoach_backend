const mongoose = require('mongoose');

const UserQuestionProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PracticeQuestion',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['answered', 'skipped'],
    required: true,
    index: true
  },
  selectedAnswer: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    required: function() {
      return this.status === 'answered';
    }
  },
  isCorrect: {
    type: Boolean,
    required: function() {
      return this.status === 'answered';
    }
  },
  timeSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  subject: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
    index: true
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  attemptedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// CRITICAL: Compound unique index to prevent duplicate attempts
UserQuestionProgressSchema.index({ userId: 1, questionId: 1 }, { unique: true });

// Additional indexes for performance
UserQuestionProgressSchema.index({ userId: 1, status: 1 });
UserQuestionProgressSchema.index({ userId: 1, subject: 1 });
UserQuestionProgressSchema.index({ userId: 1, attemptedAt: -1 });

// Static method to get answered questions for a user (to exclude from next question)
UserQuestionProgressSchema.statics.getAnsweredQuestions = function(userId, subject = null) {
  const query = { 
    userId: userId,
    status: 'answered'
  };
  
  if (subject && subject !== 'all') {
    query.subject = parseInt(subject);
  }
  
  return this.find(query).select('questionId');
};

// Static method to get ALL attempted questions (both answered and skipped)
UserQuestionProgressSchema.statics.getAttemptedQuestions = function(userId, subject = null) {
  const query = { 
    userId: userId,
    $or: [{ status: 'answered' }, { status: 'skipped' }]
  };
  
  if (subject && subject !== 'all') {
    query.subject = parseInt(subject);
  }
  
  return this.find(query).select('questionId');
};

// Static method to get skipped questions for a user
UserQuestionProgressSchema.statics.getSkippedQuestions = function(userId, subject = null) {
  const query = { 
    userId: userId,
    status: 'skipped'
  };
  
  if (subject && subject !== 'all') {
    query.subject = parseInt(subject);
  }
  
  return this.find(query).select('questionId');
};

// Static method to get user statistics
UserQuestionProgressSchema.statics.getUserStats = function(userId, subject = null) {
  const matchQuery = { userId: userId };
  
  if (subject && subject !== 'all') {
    matchQuery.subject = parseInt(subject);
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
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
        totalTimeSpent: { $sum: '$timeSpent' },
        avgTimeSpent: { $avg: '$timeSpent' }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        answered: 1,
        skipped: 1,
        correct: 1,
        wrong: 1,
        totalTimeSpent: 1,
        avgTimeSpent: 1,
        accuracy: {
          $cond: {
            if: { $gt: ['$answered', 0] },
            then: { $round: [{ $multiply: [{ $divide: ['$correct', '$answered'] }, 100] }, 1] },
            else: 0
          }
        }
      }
    }
  ]).then(results => {
    if (results.length === 0) {
      return {
        total: 0,
        answered: 0,
        skipped: 0,
        correct: 0,
        wrong: 0,
        totalTimeSpent: 0,
        avgTimeSpent: 0,
        accuracy: 0
      };
    }
    return results[0];
  });
};

// Instance method to mark as answered
UserQuestionProgressSchema.methods.markAsAnswered = function(selectedAnswer, isCorrect, timeSpent = 0) {
  this.status = 'answered';
  this.selectedAnswer = selectedAnswer;
  this.isCorrect = isCorrect;
  this.timeSpent = timeSpent;
  this.attemptedAt = new Date();
  return this.save();
};

// Instance method to mark as skipped
UserQuestionProgressSchema.methods.markAsSkipped = function(timeSpent = 0) {
  this.status = 'skipped';
  this.timeSpent = timeSpent;
  this.attemptedAt = new Date();
  // Clear answer fields if they were set
  this.selectedAnswer = undefined;
  this.isCorrect = undefined;
  return this.save();
};

// Pre-save middleware to validate data
UserQuestionProgressSchema.pre('save', function(next) {
  // Ensure subject is within valid range
  if (this.subject < 1 || this.subject > 8) {
    return next(new Error('Subject must be between 1 and 8'));
  }
  
  // Validate answered questions have required fields
  if (this.status === 'answered') {
    if (!this.selectedAnswer || !['A', 'B', 'C', 'D'].includes(this.selectedAnswer)) {
      return next(new Error('Selected answer is required and must be A, B, C, or D for answered questions'));
    }
    if (typeof this.isCorrect !== 'boolean') {
      return next(new Error('isCorrect is required for answered questions'));
    }
  }
  
  // Clear answer fields for skipped questions
  if (this.status === 'skipped') {
    this.selectedAnswer = undefined;
    this.isCorrect = undefined;
  }
  
  next();
});

// Add error handling for duplicate key errors
UserQuestionProgressSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    next(new Error('User has already attempted this question'));
  } else {
    next(error);
  }
});

// Virtual for getting area name
UserQuestionProgressSchema.virtual('areaName').get(function() {
  const AREA_MAPPING = {
    1: 'Current Affairs',
    2: 'History', 
    3: 'Polity',
    4: 'Economy',
    5: 'Geography',
    6: 'Ecology',
    7: 'General Science',
    8: 'Arts & Culture'
  };
  return AREA_MAPPING[this.subject] || `Subject ${this.subject}`;
});

// Ensure virtual fields are serialized
UserQuestionProgressSchema.set('toJSON', { virtuals: true });
UserQuestionProgressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('UserQuestionProgress', UserQuestionProgressSchema);