const mongoose = require('mongoose');

const userQuestionProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PracticeQuestion',
    required: true
  },
  status: {
    type: String,
    enum: ['answered', 'skipped'],
    required: true
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
    default: 0 // in seconds
  },
  attemptedAt: {
    type: Date,
    default: Date.now
  },
  subject: {
    type: Number,
    min: 1,
    max: 8
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard']
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per question
userQuestionProgressSchema.index({ userId: 1, questionId: 1 }, { unique: true });

// Index for efficient querying
userQuestionProgressSchema.index({ userId: 1, status: 1 });
userQuestionProgressSchema.index({ userId: 1, subject: 1, status: 1 });
userQuestionProgressSchema.index({ userId: 1, createdAt: -1 });

// Static methods
userQuestionProgressSchema.statics.getUserProgress = async function(userId, filters = {}) {
  const query = { userId };
  
  if (filters.subject && filters.subject !== 'all') {
    query.subject = filters.subject;
  }
  
  if (filters.status) {
    query.status = filters.status;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

userQuestionProgressSchema.statics.getAnsweredQuestions = async function(userId, subject = null) {
  const query = { userId, status: 'answered' };
  
  if (subject && subject !== 'all') {
    query.subject = subject;
  }
  
  return this.find(query).select('questionId');
};

userQuestionProgressSchema.statics.getSkippedQuestions = async function(userId, subject = null) {
  const query = { userId, status: 'skipped' };
  
  if (subject && subject !== 'all') {
    query.subject = subject;
  }
  
  return this.find(query).select('questionId');
};

userQuestionProgressSchema.statics.getUserStats = async function(userId, subject = null) {
  const matchQuery = { userId };
  
  if (subject && subject !== 'all') {
    matchQuery.subject = subject;
  }
  
  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalTimeSpent: { $sum: '$timeSpent' }
      }
    }
  ]);
  
  const correctAnswers = await this.countDocuments({
    ...matchQuery,
    status: 'answered',
    isCorrect: true
  });
  
  const wrongAnswers = await this.countDocuments({
    ...matchQuery,
    status: 'answered', 
    isCorrect: false
  });
  
  const result = {
    answered: 0,
    skipped: 0,
    correct: correctAnswers,
    wrong: wrongAnswers,
    totalTimeSpent: 0,
    accuracy: 0
  };
  
  stats.forEach(stat => {
    if (stat._id === 'answered') {
      result.answered = stat.count;
      result.totalTimeSpent += stat.totalTimeSpent;
    } else if (stat._id === 'skipped') {
      result.skipped = stat.count;
    }
  });
  
  if (result.answered > 0) {
    result.accuracy = Math.round((result.correct / result.answered) * 100);
  }
  
  return result;
};

// Instance methods
userQuestionProgressSchema.methods.markAsAnswered = async function(selectedAnswer, isCorrect, timeSpent = 0) {
  this.status = 'answered';
  this.selectedAnswer = selectedAnswer;
  this.isCorrect = isCorrect;
  this.timeSpent = timeSpent;
  this.attemptedAt = new Date();
  
  return this.save();
};

userQuestionProgressSchema.methods.markAsSkipped = async function(timeSpent = 0) {
  this.status = 'skipped';
  this.timeSpent = timeSpent;
  this.attemptedAt = new Date();
  
  return this.save();
};

module.exports = mongoose.model('UserQuestionProgress', userQuestionProgressSchema);