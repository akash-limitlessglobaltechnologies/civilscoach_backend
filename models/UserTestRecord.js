const mongoose = require('mongoose');

// Enhanced User Test Record Schema with detailed answer storage and user references
const userTestRecordSchema = new mongoose.Schema({
  // User reference (replaces email field)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Keep email for backward compatibility and quick queries
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  // Test information
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  testName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  testYear: {
    type: Number,
    index: true
  },
  testPaper: {
    type: String,
    trim: true
  },
  testType: {
    type: String,
    enum: ['PYQ', 'Practice', 'Assessment'],
    required: true,
    index: true
  },
  // Scoring information
  score: {
    type: Number,
    required: true,
    index: true
  },
  correctAnswers: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  wrongAnswers: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  unansweredQuestions: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  totalQuestions: {
    type: Number,
    required: true,
    min: 1
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true
  },
  // Time tracking
  timeTaken: {
    type: Number,
    required: true,
    min: 0 // in minutes
  },
  timeAllotted: {
    type: Number,
    required: true,
    min: 1 // in minutes
  },
  timeExpired: {
    type: Boolean,
    required: true,
    default: false,
    index: true
  },
  // Enhanced answer storage with detailed information
  answers: {
    type: Map,
    of: {
      selectedOption: {
        type: String,
        enum: ['A', 'B', 'C', 'D', ''], // Empty string for unanswered
        default: ''
      },
      correctOption: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true
      },
      isCorrect: {
        type: Boolean,
        required: true
      },
      timeSpent: {
        type: Number, // time spent on this question in seconds
        default: 0,
        min: 0
      },
      attempts: {
        type: Number, // number of times user changed answer
        default: 1,
        min: 0
      },
      difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium'
      },
      area: {
        type: Number,
        default: 1
      },
      subarea: {
        type: String,
        default: ''
      },
      questionText: {
        type: String,
        default: '' // Store question text for historical reference
      },
      explanation: {
        type: String,
        default: '' // Store explanation for this question
      }
    },
    default: new Map()
  },
  // Performance analytics
  analytics: {
    subjectWisePerformance: {
      type: Map,
      of: {
        correct: { type: Number, default: 0 },
        wrong: { type: Number, default: 0 },
        unanswered: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      default: new Map()
    },
    difficultyWisePerformance: {
      easy: {
        correct: { type: Number, default: 0 },
        wrong: { type: Number, default: 0 },
        unanswered: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      medium: {
        correct: { type: Number, default: 0 },
        wrong: { type: Number, default: 0 },
        unanswered: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      hard: {
        correct: { type: Number, default: 0 },
        wrong: { type: Number, default: 0 },
        unanswered: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      }
    },
    averageTimePerQuestion: {
      type: Number,
      default: 0 // in seconds
    },
    questionsReviewed: {
      type: Number,
      default: 0
    },
    flaggedQuestions: {
      type: [Number], // array of question indices
      default: []
    }
  },
  // Scoring system used
  scoring: {
    correct: {
      type: Number,
      default: 4
    },
    wrong: {
      type: Number,
      default: -1
    },
    unanswered: {
      type: Number,
      default: 0
    }
  },
  // Test completion details
  completion: {
    startedAt: {
      type: Date,
      required: true,
      index: true
    },
    completedAt: {
      type: Date,
      required: true,
      index: true
    },
    submissionType: {
      type: String,
      enum: ['auto', 'manual', 'timeout'],
      default: 'manual'
    },
    deviceInfo: {
      userAgent: { type: String, default: '' },
      platform: { type: String, default: '' },
      screenSize: { type: String, default: '' }
    },
    interruptions: {
      type: Number,
      default: 0 // number of times user left the test
    }
  },
  // Review and feedback
  review: {
    hasReviewed: {
      type: Boolean,
      default: false
    },
    reviewedAt: {
      type: Date
    },
    feedback: {
      difficulty: {
        type: String,
        enum: ['Too Easy', 'Easy', 'Just Right', 'Hard', 'Too Hard'],
        default: 'Just Right'
      },
      quality: {
        type: Number,
        min: 1,
        max: 5,
        default: 5
      },
      comments: {
        type: String,
        maxlength: 1000,
        default: ''
      }
    }
  },
  // Metadata
  metadata: {
    version: {
      type: String,
      default: '2.0'
    },
    source: {
      type: String,
      enum: ['web', 'mobile'],
      default: 'web'
    },
    isPublic: {
      type: Boolean,
      default: false // for leaderboards
    },
    tags: {
      type: [String],
      default: []
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userTestRecordSchema.index({ userId: 1, completedAt: -1 });
userTestRecordSchema.index({ email: 1, completedAt: -1 });
userTestRecordSchema.index({ testId: 1, completedAt: -1 });
userTestRecordSchema.index({ testType: 1, percentage: -1 });
userTestRecordSchema.index({ score: -1 });
userTestRecordSchema.index({ 'completion.completedAt': -1 });
userTestRecordSchema.index({ sessionId: 1 });

// Virtual for grade based on percentage
userTestRecordSchema.virtual('grade').get(function() {
  const percentage = this.percentage;
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
});

// Virtual for test efficiency (percentage per minute)
userTestRecordSchema.virtual('efficiency').get(function() {
  return this.timeTaken > 0 ? (this.percentage / this.timeTaken).toFixed(2) : 0;
});

// Virtual for detailed performance summary
userTestRecordSchema.virtual('performanceSummary').get(function() {
  return {
    grade: this.grade,
    efficiency: this.efficiency,
    accuracy: ((this.correctAnswers / this.totalQuestions) * 100).toFixed(1),
    completionRate: (((this.correctAnswers + this.wrongAnswers) / this.totalQuestions) * 100).toFixed(1),
    timeUtilization: ((this.timeTaken / this.timeAllotted) * 100).toFixed(1)
  };
});

// Instance methods
userTestRecordSchema.methods.calculateDetailedAnalytics = function() {
  const analytics = {
    subjectWisePerformance: new Map(),
    difficultyWisePerformance: {
      easy: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
      medium: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
      hard: { correct: 0, wrong: 0, unanswered: 0, total: 0 }
    },
    averageTimePerQuestion: 0,
    totalTimeSpent: 0
  };

  let totalTimeSpent = 0;
  let questionCount = 0;

  for (const [questionIndex, answerData] of this.answers.entries()) {
    questionCount++;
    totalTimeSpent += answerData.timeSpent || 0;

    // Subject-wise performance
    const area = answerData.area || 1;
    const areaKey = area.toString();
    
    if (!analytics.subjectWisePerformance.has(areaKey)) {
      analytics.subjectWisePerformance.set(areaKey, {
        correct: 0, wrong: 0, unanswered: 0, total: 0, percentage: 0
      });
    }
    
    const areaStats = analytics.subjectWisePerformance.get(areaKey);
    areaStats.total++;
    
    if (answerData.selectedOption === '') {
      areaStats.unanswered++;
    } else if (answerData.isCorrect) {
      areaStats.correct++;
    } else {
      areaStats.wrong++;
    }
    
    areaStats.percentage = areaStats.total > 0 ? 
      ((areaStats.correct / areaStats.total) * 100).toFixed(1) : 0;

    // Difficulty-wise performance
    const difficulty = (answerData.difficulty || 'medium').toLowerCase();
    if (analytics.difficultyWisePerformance[difficulty]) {
      analytics.difficultyWisePerformance[difficulty].total++;
      
      if (answerData.selectedOption === '') {
        analytics.difficultyWisePerformance[difficulty].unanswered++;
      } else if (answerData.isCorrect) {
        analytics.difficultyWisePerformance[difficulty].correct++;
      } else {
        analytics.difficultyWisePerformance[difficulty].wrong++;
      }
    }
  }

  analytics.averageTimePerQuestion = questionCount > 0 ? 
    (totalTimeSpent / questionCount).toFixed(1) : 0;
  analytics.totalTimeSpent = totalTimeSpent;

  this.analytics = analytics;
  return analytics;
};

userTestRecordSchema.methods.getAnswerDetails = function(questionIndex) {
  const answerData = this.answers.get(questionIndex.toString());
  if (!answerData) {
    return null;
  }

  return {
    questionIndex: parseInt(questionIndex),
    selectedOption: answerData.selectedOption,
    correctOption: answerData.correctOption,
    isCorrect: answerData.isCorrect,
    timeSpent: answerData.timeSpent,
    attempts: answerData.attempts,
    difficulty: answerData.difficulty,
    area: answerData.area,
    subarea: answerData.subarea,
    explanation: answerData.explanation
  };
};

userTestRecordSchema.methods.getIncorrectAnswers = function() {
  const incorrectAnswers = [];
  
  for (const [questionIndex, answerData] of this.answers.entries()) {
    if (answerData.selectedOption !== '' && !answerData.isCorrect) {
      incorrectAnswers.push({
        questionIndex: parseInt(questionIndex),
        selectedOption: answerData.selectedOption,
        correctOption: answerData.correctOption,
        difficulty: answerData.difficulty,
        area: answerData.area,
        subarea: answerData.subarea,
        timeSpent: answerData.timeSpent,
        questionText: answerData.questionText,
        explanation: answerData.explanation
      });
    }
  }
  
  return incorrectAnswers;
};

userTestRecordSchema.methods.getComparisonWithPreviousAttempts = function() {
  // This method would compare with previous attempts of the same test
  // Implementation would require additional database queries
  return {
    isImprovement: null,
    scoreImprovement: 0,
    timeImprovement: 0,
    accuracyImprovement: 0
  };
};

// Static methods
userTestRecordSchema.statics.getLeaderboard = function(testId, limit = 10) {
  return this.find({ testId, 'metadata.isPublic': true })
    .populate('userId', 'profile.firstName profile.lastName email')
    .sort({ score: -1, 'completion.completedAt': 1 })
    .limit(limit)
    .select('score percentage timeTaken completion.completedAt');
};

userTestRecordSchema.statics.getUserRanking = function(userId, testId) {
  return this.aggregate([
    { $match: { testId, 'metadata.isPublic': true } },
    { $sort: { score: -1, 'completion.completedAt': 1 } },
    {
      $group: {
        _id: null,
        records: { $push: '$$ROOT' }
      }
    },
    {
      $unwind: {
        path: '$records',
        includeArrayIndex: 'rank'
      }
    },
    { $match: { 'records.userId': userId } },
    {
      $project: {
        rank: { $add: ['$rank', 1] },
        totalParticipants: { $size: '$records' }
      }
    }
  ]);
};

userTestRecordSchema.statics.getTestStatistics = function(testId) {
  return this.aggregate([
    { $match: { testId } },
    {
      $group: {
        _id: null,
        totalAttempts: { $sum: 1 },
        averageScore: { $avg: '$score' },
        averagePercentage: { $avg: '$percentage' },
        averageTime: { $avg: '$timeTaken' },
        highestScore: { $max: '$score' },
        lowestScore: { $min: '$score' },
        timeoutRate: {
          $avg: {
            $cond: [{ $eq: ['$timeExpired', true] }, 1, 0]
          }
        }
      }
    }
  ]);
};

// Pre-save middleware
userTestRecordSchema.pre('save', function(next) {
  // Calculate detailed analytics if answers have changed
  if (this.isModified('answers')) {
    this.calculateDetailedAnalytics();
  }
  
  // Ensure completion times are set
  if (!this.completion.startedAt) {
    this.completion.startedAt = this.createdAt || new Date();
  }
  
  if (!this.completion.completedAt) {
    this.completion.completedAt = this.updatedAt || new Date();
  }
  
  // Set time allotted if not set
  if (!this.timeAllotted && this.populate && this.populate.testId) {
    this.timeAllotted = this.populate.testId.duration || this.timeTaken;
  }
  
  next();
});

// Post-save middleware to update user statistics
userTestRecordSchema.post('save', async function(doc) {
  try {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.userId, {
      $inc: {
        'statistics.totalTestsAttempted': 1,
        'statistics.totalTestsCompleted': 1,
        'statistics.totalTimeSpent': doc.timeTaken
      },
      $set: {
        'statistics.lastTestDate': doc.completion.completedAt
      }
    });
  } catch (error) {
    console.error('Error updating user statistics:', error);
  }
});

module.exports = mongoose.model('UserTestRecord', userTestRecordSchema);