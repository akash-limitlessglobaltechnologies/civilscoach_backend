const mongoose = require('mongoose');

// Test Schema with enhanced flexibility
const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Test name is required'],
    trim: true,
    minlength: [3, 'Test name must be at least 3 characters'],
    maxlength: [200, 'Test name cannot exceed 200 characters'],
    index: true
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2000, 'Year must be 2000 or later'],
    max: [2035, 'Year cannot exceed 2035']
  },
  paper: {
    type: String,
    required: [true, 'Paper is required'],
    trim: true,
    maxlength: [100, 'Paper name cannot exceed 100 characters']
  },
  numberOfQuestions: {
    type: Number,
    required: [true, 'Number of questions is required'],
    min: [1, 'Must have at least 1 question'],
    max: [500, 'Cannot exceed 500 questions']
  },
  timeInMins: {
    type: Number,
    required: [true, 'Time in minutes is required'],
    min: [1, 'Duration must be at least 1 minute'],
    max: [600, 'Duration cannot exceed 600 minutes (10 hours)']
  },
  duration: {
    type: Number,
    required: [true, 'Test duration is required'],
    min: [1, 'Duration must be at least 1 minute'],
    max: [600, 'Duration cannot exceed 600 minutes (10 hours)']
  },
  // Cutoff scores for different categories - all have defaults
  cutoff: {
    Gen: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative'],
      default: 0
    },
    EWS: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative'],
      default: 0
    },
    OBC: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative'],
      default: 0
    },
    SC: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative'],
      default: 0
    },
    ST: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative'],
      default: 0
    }
  },
  // Custom scoring configuration with defaults
  scoring: {
    correct: {
      type: Number,
      required: true,
      default: 4,
      min: [0.1, 'Correct score must be at least 0.1']
    },
    wrong: {
      type: Number,
      required: true,
      default: -1,
      max: [0, 'Wrong score should not be positive (use negative for penalty or 0 for no penalty)']
    },
    unanswered: {
      type: Number,
      required: true,
      default: 0
    }
  },
  questions: [{
    qid: {
      type: String,
      required: [true, 'Question ID is required'],
      trim: true
    },
    question: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      maxlength: [2000, 'Question cannot exceed 2000 characters']
    },
    difficulty: {
      type: String,
      required: true,
      enum: {
        values: ['Easy', 'Medium', 'Hard'],
        message: 'Difficulty must be Easy, Medium, or Hard'
      },
      default: 'Medium',
      trim: true
    },
    area: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Area cannot exceed 100 characters'],
      default: 'General'
    },
    options: [{
      key: {
        type: String,
        required: [true, 'Option key is required'],
        enum: {
          values: ['A', 'B', 'C', 'D'],
          message: 'Option key must be A, B, C, or D'
        }
      },
      text: {
        type: String,
        required: [true, 'Option text is required'],
        trim: true,
        maxlength: [1000, 'Option text cannot exceed 1000 characters']
      },
      correct: {
        type: Boolean,
        required: true,
        default: false
      }
    }],
    explanation: {
      type: String,
      trim: true,
      maxlength: [2000, 'Explanation cannot exceed 2000 characters'],
      default: ''
    }
  }],
  // Additional metadata
  createdBy: {
    type: String,
    default: 'admin',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Virtual to ensure numberOfQuestions matches questions array length
testSchema.virtual('questionsCount').get(function() {
  return this.questions ? this.questions.length : 0;
});

// Virtual for test statistics
testSchema.virtual('stats').get(function() {
  if (!this.questions || this.questions.length === 0) {
    return {
      totalQuestions: 0,
      easyQuestions: 0,
      mediumQuestions: 0,
      hardQuestions: 0,
      subjects: []
    };
  }

  const stats = {
    totalQuestions: this.questions.length,
    easyQuestions: this.questions.filter(q => q.difficulty === 'Easy').length,
    mediumQuestions: this.questions.filter(q => q.difficulty === 'Medium').length,
    hardQuestions: this.questions.filter(q => q.difficulty === 'Hard').length,
    subjects: [...new Set(this.questions.map(q => q.area))]
  };

  return stats;
});

// Pre-save middleware to sync duration with timeInMins
testSchema.pre('save', function(next) {
  // Sync duration and timeInMins
  if (this.timeInMins && !this.duration) {
    this.duration = this.timeInMins;
  } else if (this.duration && !this.timeInMins) {
    this.timeInMins = this.duration;
  }

  // Ensure numberOfQuestions matches questions array length
  if (this.questions && this.questions.length > 0) {
    this.numberOfQuestions = this.questions.length;
  }

  // Validate that each question has exactly one correct answer
  if (this.questions) {
    for (let i = 0; i < this.questions.length; i++) {
      const question = this.questions[i];
      const correctOptions = question.options ? question.options.filter(opt => opt.correct) : [];
      
      if (correctOptions.length !== 1) {
        const error = new Error(`Question ${i + 1} must have exactly one correct answer (found: ${correctOptions.length})`);
        error.name = 'ValidationError';
        return next(error);
      }
    }
  }

  next();
});

// Pre-save middleware for cutoff defaults based on questions
testSchema.pre('save', function(next) {
  if (this.questions && this.questions.length > 0 && this.isNew) {
    // Auto-calculate default cutoffs if not provided
    const totalQuestions = this.questions.length;
    
    if (!this.cutoff.Gen) this.cutoff.Gen = Math.round(totalQuestions * 0.30);
    if (!this.cutoff.EWS) this.cutoff.EWS = Math.round(totalQuestions * 0.30);
    if (!this.cutoff.OBC) this.cutoff.OBC = Math.round(totalQuestions * 0.25);
    if (!this.cutoff.SC) this.cutoff.SC = Math.round(totalQuestions * 0.20);
    if (!this.cutoff.ST) this.cutoff.ST = Math.round(totalQuestions * 0.20);
  }
  
  next();
});

// Add indexes for better performance
testSchema.index({ createdAt: -1 });
testSchema.index({ name: 1 });
testSchema.index({ year: 1, paper: 1 });
testSchema.index({ isActive: 1 });
testSchema.index({ 'cutoff.Gen': 1 });

// Static methods for common queries
testSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

testSchema.statics.findByYear = function(year) {
  return this.find({ year: year });
};

testSchema.statics.getTestStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalTests: { $sum: 1 },
        totalQuestions: { $sum: { $size: '$questions' } },
        avgQuestionsPerTest: { $avg: { $size: '$questions' } },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);
  
  return stats[0] || {
    totalTests: 0,
    totalQuestions: 0,
    avgQuestionsPerTest: 0,
    avgDuration: 0
  };
};

// Instance methods
testSchema.methods.getQuestionsByDifficulty = function(difficulty) {
  return this.questions.filter(q => q.difficulty === difficulty);
};

testSchema.methods.getQuestionsByArea = function(area) {
  return this.questions.filter(q => q.area === area);
};

testSchema.methods.calculateMaxScore = function() {
  return this.questions.length * this.scoring.correct;
};

testSchema.methods.calculateMinScore = function() {
  return this.questions.length * this.scoring.wrong;
};

// Add JSON transform to include virtual fields
testSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Test', testSchema);