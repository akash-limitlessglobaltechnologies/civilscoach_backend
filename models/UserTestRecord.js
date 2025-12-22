const mongoose = require('mongoose');

// Area mapping for reference
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

// Flexible User Test Record Schema with area and subarea tracking
const userTestRecordSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    index: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: [true, 'Test ID is required'],
    index: true
  },
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    index: true
  },
  // Flexible test metadata with defaults
  testName: {
    type: String,
    trim: true,
    default: 'Unnamed Test'
  },
  testYear: {
    type: Number,
    default: () => new Date().getFullYear(),
    index: true
  },
  testPaper: {
    type: String,
    trim: true,
    default: 'General Test'
  },
  testType: {
    type: String,
    enum: {
      values: ['PYQ', 'Practice', 'Assessment'],
      message: 'Test type must be PYQ, Practice, or Assessment'
    },
    default: 'Practice',
    index: true
  },
  // Flexible scoring with defaults
  score: {
    type: Number,
    default: 0
  },
  correctAnswers: {
    type: Number,
    min: 0,
    default: 0
  },
  wrongAnswers: {
    type: Number,
    min: 0,
    default: 0
  },
  unansweredQuestions: {
    type: Number,
    min: 0,
    default: 0
  },
  totalQuestions: {
    type: Number,
    min: 1,
    default: 1
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  timeTaken: {
    type: Number,
    min: 0,
    default: 0,
    comment: 'Time taken in minutes'
  },
  timeExpired: {
    type: Boolean,
    default: false
  },
  // Flexible answers storage
  answers: {
    type: Map,
    of: String,
    default: new Map()
  },
  // Flexible scoring configuration with defaults
  scoring: {
    correct: {
      type: Number,
      default: 1
    },
    wrong: {
      type: Number,
      default: 0
    },
    unanswered: {
      type: Number,
      default: 0
    }
  },
  // NEW: Area-wise performance tracking
  areaPerformance: {
    type: Map,
    of: {
      total: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
      wrong: { type: Number, default: 0 },
      unanswered: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 }
    },
    default: new Map()
  },
  // NEW: Subarea performance tracking
  subareaPerformance: {
    type: Map,
    of: {
      total: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
      wrong: { type: Number, default: 0 },
      unanswered: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      area: { type: Number, min: 1, max: 8 } // Reference to main area
    },
    default: new Map()
  },
  completedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries including area-based queries
userTestRecordSchema.index({ email: 1, completedAt: -1 });
userTestRecordSchema.index({ email: 1, testType: 1, completedAt: -1 });
userTestRecordSchema.index({ testId: 1, completedAt: -1 });
userTestRecordSchema.index({ testType: 1, completedAt: -1 });
userTestRecordSchema.index({ email: 1, testType: 1, percentage: -1 });
userTestRecordSchema.index({ 'areaPerformance.1.percentage': -1 }); // Current Affairs performance
userTestRecordSchema.index({ 'areaPerformance.2.percentage': -1 }); // History performance
// Add more area-specific indexes as needed

// TTL index to automatically delete old records after 2 years
userTestRecordSchema.index({ completedAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

// Virtual for performance grade
userTestRecordSchema.virtual('grade').get(function() {
  if (this.percentage >= 90) return 'A+';
  if (this.percentage >= 80) return 'A';
  if (this.percentage >= 70) return 'B';
  if (this.percentage >= 60) return 'C';
  if (this.percentage >= 50) return 'D';
  return 'F';
});

// Virtual for pass/fail status
userTestRecordSchema.virtual('passed').get(function() {
  return this.percentage >= 50;
});

// Virtual for detailed performance summary with area breakdown
userTestRecordSchema.virtual('summary').get(function() {
  return {
    totalQuestions: this.totalQuestions || 0,
    correct: this.correctAnswers || 0,
    wrong: this.wrongAnswers || 0,
    unanswered: this.unansweredQuestions || 0,
    score: this.score || 0,
    percentage: this.percentage || 0,
    grade: this.grade,
    passed: this.passed,
    timeTaken: this.timeTaken || 0,
    timeExpired: this.timeExpired || false,
    testType: this.testType || 'Practice',
    areaBreakdown: this.getAreaBreakdown(),
    subareaBreakdown: this.getSubareaBreakdown()
  };
});

// Virtual to get area breakdown with names
userTestRecordSchema.virtual('areaBreakdownWithNames').get(function() {
  const breakdown = {};
  
  if (this.areaPerformance) {
    for (const [areaNum, stats] of this.areaPerformance) {
      const areaName = AREA_MAPPING[parseInt(areaNum)] || `Area ${areaNum}`;
      breakdown[areaName] = {
        ...stats,
        areaNumber: parseInt(areaNum)
      };
    }
  }
  
  return breakdown;
});

// Flexible pre-save middleware with area performance calculation
userTestRecordSchema.pre('save', function(next) {
  try {
    // Auto-calculate missing values
    const total = this.totalQuestions || 1;
    const correct = this.correctAnswers || 0;
    const wrong = this.wrongAnswers || 0;
    const unanswered = this.unansweredQuestions || 0;

    // Auto-fix totalQuestions if it doesn't match the sum
    const calculatedTotal = correct + wrong + unanswered;
    if (calculatedTotal > 0 && calculatedTotal !== total) {
      this.totalQuestions = calculatedTotal;
      console.warn(`Auto-corrected totalQuestions from ${total} to ${calculatedTotal}`);
    }

    // Auto-calculate percentage if missing or incorrect
    if (this.totalQuestions > 0) {
      const calculatedPercentage = (this.correctAnswers / this.totalQuestions) * 100;
      if (Math.abs(this.percentage - calculatedPercentage) > 0.1) {
        this.percentage = Math.round(calculatedPercentage * 10) / 10;
      }
    }

    // Ensure percentage is within bounds
    this.percentage = Math.max(0, Math.min(100, this.percentage || 0));

    // Set default scoring if missing
    if (!this.scoring || typeof this.scoring !== 'object') {
      this.scoring = { correct: 1, wrong: 0, unanswered: 0 };
    } else {
      if (this.scoring.correct === undefined) this.scoring.correct = 1;
      if (this.scoring.wrong === undefined) this.scoring.wrong = 0;
      if (this.scoring.unanswered === undefined) this.scoring.unanswered = 0;
    }

    // Ensure timeTaken is not negative
    this.timeTaken = Math.max(0, this.timeTaken || 0);

    // Initialize area and subarea performance maps if they don't exist
    if (!this.areaPerformance) {
      this.areaPerformance = new Map();
    }
    if (!this.subareaPerformance) {
      this.subareaPerformance = new Map();
    }

    next();
  } catch (error) {
    console.warn('Pre-save processing warning:', error.message);
    next();
  }
});

// Instance methods
userTestRecordSchema.methods.getPerformanceLevel = function() {
  const percentage = this.percentage || 0;
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Very Good';
  if (percentage >= 70) return 'Good';
  if (percentage >= 60) return 'Average';
  if (percentage >= 50) return 'Below Average';
  return 'Poor';
};

userTestRecordSchema.methods.getAreaBreakdown = function() {
  const breakdown = {};
  
  if (this.areaPerformance) {
    for (const [areaNum, stats] of this.areaPerformance) {
      const areaName = AREA_MAPPING[parseInt(areaNum)] || `Area ${areaNum}`;
      breakdown[areaName] = {
        ...stats,
        areaNumber: parseInt(areaNum)
      };
    }
  }
  
  return breakdown;
};

userTestRecordSchema.methods.getSubareaBreakdown = function() {
  const breakdown = {};
  
  if (this.subareaPerformance) {
    for (const [subareaName, stats] of this.subareaPerformance) {
      breakdown[subareaName] = {
        ...stats,
        areaName: AREA_MAPPING[stats.area] || `Area ${stats.area}`
      };
    }
  }
  
  return breakdown;
};

userTestRecordSchema.methods.getBestPerformingArea = function() {
  let bestArea = null;
  let bestPercentage = -1;
  
  if (this.areaPerformance) {
    for (const [areaNum, stats] of this.areaPerformance) {
      if (stats.percentage > bestPercentage) {
        bestPercentage = stats.percentage;
        bestArea = {
          number: parseInt(areaNum),
          name: AREA_MAPPING[parseInt(areaNum)] || `Area ${areaNum}`,
          percentage: stats.percentage,
          stats: stats
        };
      }
    }
  }
  
  return bestArea;
};

userTestRecordSchema.methods.getWorstPerformingArea = function() {
  let worstArea = null;
  let worstPercentage = 101;
  
  if (this.areaPerformance) {
    for (const [areaNum, stats] of this.areaPerformance) {
      if (stats.total > 0 && stats.percentage < worstPercentage) {
        worstPercentage = stats.percentage;
        worstArea = {
          number: parseInt(areaNum),
          name: AREA_MAPPING[parseInt(areaNum)] || `Area ${areaNum}`,
          percentage: stats.percentage,
          stats: stats
        };
      }
    }
  }
  
  return worstArea;
};

// Method to update area performance from test results
userTestRecordSchema.methods.updateAreaPerformance = function(testQuestions, userAnswers) {
  if (!testQuestions || !Array.isArray(testQuestions)) return;
  
  const areaStats = {};
  const subareaStats = {};
  
  testQuestions.forEach((question, index) => {
    const userAnswer = userAnswers[index];
    const correctOption = question.options.find(opt => opt.correct);
    const area = question.area || 1;
    const subarea = question.subarea || '';
    
    // Initialize area stats
    if (!areaStats[area]) {
      areaStats[area] = { total: 0, correct: 0, wrong: 0, unanswered: 0 };
    }
    
    // Initialize subarea stats
    if (subarea && !subareaStats[subarea]) {
      subareaStats[subarea] = { total: 0, correct: 0, wrong: 0, unanswered: 0, area: area };
    }
    
    // Update counts
    areaStats[area].total++;
    if (subarea) subareaStats[subarea].total++;
    
    if (!userAnswer) {
      areaStats[area].unanswered++;
      if (subarea) subareaStats[subarea].unanswered++;
    } else if (userAnswer === correctOption.key) {
      areaStats[area].correct++;
      if (subarea) subareaStats[subarea].correct++;
    } else {
      areaStats[area].wrong++;
      if (subarea) subareaStats[subarea].wrong++;
    }
  });
  
  // Calculate percentages and update maps
  for (const [area, stats] of Object.entries(areaStats)) {
    stats.percentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    this.areaPerformance.set(area.toString(), stats);
  }
  
  for (const [subarea, stats] of Object.entries(subareaStats)) {
    stats.percentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    this.subareaPerformance.set(subarea, stats);
  }
};

userTestRecordSchema.methods.compareWithAverage = async function() {
  try {
    const TestRecord = this.constructor;
    
    const avgStats = await TestRecord.aggregate([
      { 
        $match: { 
          testType: this.testType || 'Practice',
          _id: { $ne: this._id }
        } 
      },
      {
        $group: {
          _id: null,
          avgPercentage: { $avg: '$percentage' },
          avgScore: { $avg: '$score' },
          avgTime: { $avg: '$timeTaken' },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    const avg = avgStats[0] || { 
      avgPercentage: 0, 
      avgScore: 0, 
      avgTime: 0, 
      totalRecords: 0 
    };

    return {
      yourPercentage: this.percentage || 0,
      avgPercentage: Math.round(avg.avgPercentage * 100) / 100,
      percentageDiff: Math.round(((this.percentage || 0) - avg.avgPercentage) * 100) / 100,
      yourScore: this.score || 0,
      avgScore: Math.round(avg.avgScore * 100) / 100,
      scoreDiff: Math.round(((this.score || 0) - avg.avgScore) * 100) / 100,
      yourTime: this.timeTaken || 0,
      avgTime: Math.round(avg.avgTime * 100) / 100,
      timeDiff: Math.round(((this.timeTaken || 0) - avg.avgTime) * 100) / 100,
      totalComparisons: avg.totalRecords,
      testType: this.testType || 'Practice',
      areaComparison: this.getAreaBreakdown()
    };
  } catch (error) {
    console.warn('Error in compareWithAverage:', error.message);
    return {
      yourPercentage: this.percentage || 0,
      avgPercentage: 0,
      percentageDiff: 0,
      yourScore: this.score || 0,
      avgScore: 0,
      scoreDiff: 0,
      yourTime: this.timeTaken || 0,
      avgTime: 0,
      timeDiff: 0,
      totalComparisons: 0,
      testType: this.testType || 'Practice',
      areaComparison: {}
    };
  }
};

// Static methods with area-based filtering
userTestRecordSchema.statics.getPerformanceByEmail = function(email, options = {}) {
  const { testType, area, limit = 10, page = 1 } = options;
  const skip = (page - 1) * limit;
  
  const query = { email: email.toLowerCase().trim() };
  if (testType && ['PYQ', 'Practice', 'Assessment'].includes(testType)) {
    query.testType = testType;
  }
  
  return this.find(query)
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('testId', 'name duration questions');
};

userTestRecordSchema.statics.getUserStats = async function(email, testType = null) {
  try {
    const match = { email: email.toLowerCase().trim() };
    if (testType && ['PYQ', 'Practice', 'Assessment'].includes(testType)) {
      match.testType = testType;
    }
    
    const stats = await this.aggregate([
      { $match: match },
      {
        $group: {
          _id: testType ? null : '$testType',
          totalTests: { $sum: 1 },
          avgPercentage: { $avg: '$percentage' },
          avgScore: { $avg: '$score' },
          bestPercentage: { $max: '$percentage' },
          bestScore: { $max: '$score' },
          worstPercentage: { $min: '$percentage' },
          worstScore: { $min: '$score' },
          totalTime: { $sum: '$timeTaken' },
          avgTime: { $avg: '$timeTaken' },
          passedTests: {
            $sum: {
              $cond: [{ $gte: ['$percentage', 50] }, 1, 0]
            }
          },
          expiredTests: {
            $sum: {
              $cond: ['$timeExpired', 1, 0]
            }
          }
        }
      }
    ]);

    return stats;
  } catch (error) {
    console.warn('Error in getUserStats:', error.message);
    return [];
  }
};

// New method to get area-wise performance for a user
userTestRecordSchema.statics.getUserAreaStats = async function(email, options = {}) {
  const { testType } = options;
  const match = { email: email.toLowerCase().trim() };
  if (testType) match.testType = testType;
  
  try {
    const areaStats = await this.aggregate([
      { $match: match },
      { $unwind: { path: '$areaPerformance', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$areaPerformance.k', // Area number
          totalQuestions: { $sum: '$areaPerformance.v.total' },
          totalCorrect: { $sum: '$areaPerformance.v.correct' },
          totalWrong: { $sum: '$areaPerformance.v.wrong' },
          totalUnanswered: { $sum: '$areaPerformance.v.unanswered' },
          avgPercentage: { $avg: '$areaPerformance.v.percentage' },
          testsTaken: { $sum: 1 }
        }
      },
      {
        $project: {
          areaNumber: '$_id',
          areaName: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', '1'] }, then: 'Current Affairs' },
                { case: { $eq: ['$_id', '2'] }, then: 'History' },
                { case: { $eq: ['$_id', '3'] }, then: 'Polity' },
                { case: { $eq: ['$_id', '4'] }, then: 'Economy' },
                { case: { $eq: ['$_id', '5'] }, then: 'Geography' },
                { case: { $eq: ['$_id', '6'] }, then: 'Ecology' },
                { case: { $eq: ['$_id', '7'] }, then: 'General Science' },
                { case: { $eq: ['$_id', '8'] }, then: 'Arts & Culture' }
              ],
              default: 'Unknown'
            }
          },
          totalQuestions: 1,
          totalCorrect: 1,
          totalWrong: 1,
          totalUnanswered: 1,
          avgPercentage: { $round: ['$avgPercentage', 1] },
          testsTaken: 1
        }
      },
      { $sort: { areaNumber: 1 } }
    ]);
    
    return areaStats;
  } catch (error) {
    console.warn('Error in getUserAreaStats:', error.message);
    return [];
  }
};

userTestRecordSchema.statics.getLeaderboard = function(testType = null, limit = 10) {
  try {
    const match = {};
    if (testType && ['PYQ', 'Practice', 'Assessment'].includes(testType)) {
      match.testType = testType;
    }
    
    return this.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$email',
          bestScore: { $max: '$score' },
          bestPercentage: { $max: '$percentage' },
          avgPercentage: { $avg: '$percentage' },
          totalTests: { $sum: 1 },
          testType: { $first: '$testType' }
        }
      },
      { $sort: { bestScore: -1, bestPercentage: -1, avgPercentage: -1 } },
      { $limit: limit }
    ]);
  } catch (error) {
    console.warn('Error in getLeaderboard:', error.message);
    return [];
  }
};

// Method to validate and auto-fix record data
userTestRecordSchema.methods.validateAndFix = function() {
  const warnings = [];
  const fixes = [];

  if (!this.testName) {
    this.testName = 'Unnamed Test';
    fixes.push('Test name set to "Unnamed Test"');
  }

  if (!this.testYear) {
    this.testYear = new Date().getFullYear();
    fixes.push(`Test year set to ${this.testYear}`);
  }

  if (!this.testPaper) {
    this.testPaper = 'General Test';
    fixes.push('Test paper set to "General Test"');
  }

  if (!this.testType || !['PYQ', 'Practice', 'Assessment'].includes(this.testType)) {
    this.testType = 'Practice';
    fixes.push('Test type set to "Practice"');
  }

  const total = this.correctAnswers + this.wrongAnswers + this.unansweredQuestions;
  if (total === 0) {
    this.totalQuestions = 1;
    this.unansweredQuestions = 1;
    fixes.push('Added default question count');
  } else if (total !== this.totalQuestions) {
    this.totalQuestions = total;
    fixes.push(`Total questions adjusted to ${total}`);
  }

  if (this.totalQuestions > 0) {
    const correctPercentage = (this.correctAnswers / this.totalQuestions) * 100;
    if (Math.abs(this.percentage - correctPercentage) > 0.1) {
      this.percentage = Math.round(correctPercentage * 10) / 10;
      fixes.push(`Percentage recalculated to ${this.percentage}%`);
    }
  }

  if (!this.scoring) {
    this.scoring = { correct: 1, wrong: 0, unanswered: 0 };
    fixes.push('Added default scoring configuration');
  }

  // Initialize area and subarea performance if missing
  if (!this.areaPerformance) {
    this.areaPerformance = new Map();
    fixes.push('Initialized area performance tracking');
  }

  if (!this.subareaPerformance) {
    this.subareaPerformance = new Map();
    fixes.push('Initialized subarea performance tracking');
  }

  return { warnings, fixes };
};

// Add JSON transform to include virtual fields and area mapping
userTestRecordSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    
    // Convert area performance map to object with area names
    if (ret.areaPerformance) {
      const areaPerformanceObj = {};
      for (const [areaNum, stats] of Object.entries(ret.areaPerformance)) {
        const areaName = AREA_MAPPING[parseInt(areaNum)] || `Area ${areaNum}`;
        areaPerformanceObj[areaName] = {
          ...stats,
          areaNumber: parseInt(areaNum)
        };
      }
      ret.areaPerformanceWithNames = areaPerformanceObj;
    }
    
    return ret;
  }
});

module.exports = mongoose.model('UserTestRecord', userTestRecordSchema);
module.exports.AREA_MAPPING = AREA_MAPPING;