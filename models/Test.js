const mongoose = require('mongoose');

// Flexible Test Schema with area as numeric only
const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Test name is required'],
    trim: true,
    minlength: [3, 'Test name must be at least 3 characters'],
    maxlength: [200, 'Test name cannot exceed 200 characters'],
    index: true
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
  year: {
    type: Number,
    min: [2000, 'Year must be 2000 or later'],
    max: [2035, 'Year cannot exceed 2035'],
    default: () => new Date().getFullYear()
  },
  paper: {
    type: String,
    trim: true,
    maxlength: [100, 'Paper name cannot exceed 100 characters'],
    default: 'General Test'
  },
  numberOfQuestions: {
    type: Number,
    min: [1, 'Must have at least 1 question'],
    max: [500, 'Cannot exceed 500 questions'],
    default: function() {
      return this.questions ? this.questions.length : 50;
    }
  },
  timeInMins: {
    type: Number,
    min: [1, 'Duration must be at least 1 minute'],
    max: [600, 'Duration cannot exceed 600 minutes (10 hours)'],
    default: function() {
      const questionCount = this.questions ? this.questions.length : this.numberOfQuestions || 50;
      return Math.max(30, Math.ceil(questionCount * 1.5));
    }
  },
  duration: {
    type: Number,
    min: [1, 'Duration must be at least 1 minute'],
    max: [600, 'Duration cannot exceed 600 minutes (10 hours)'],
    default: function() {
      return this.timeInMins || Math.max(30, Math.ceil((this.questions?.length || 50) * 1.5));
    }
  },
  cutoff: {
    Gen: {
      type: Number,
      min: [0, 'Cutoff cannot be negative'],
      default: function() {
        const total = this.parent().questions?.length || this.parent().numberOfQuestions || 50;
        return Math.round(total * 0.30);
      }
    },
    EWS: {
      type: Number,
      min: [0, 'Cutoff cannot be negative'],
      default: function() {
        const total = this.parent().questions?.length || this.parent().numberOfQuestions || 50;
        return Math.round(total * 0.30);
      }
    },
    OBC: {
      type: Number,
      min: [0, 'Cutoff cannot be negative'],
      default: function() {
        const total = this.parent().questions?.length || this.parent().numberOfQuestions || 50;
        return Math.round(total * 0.25);
      }
    },
    SC: {
      type: Number,
      min: [0, 'Cutoff cannot be negative'],
      default: function() {
        const total = this.parent().questions?.length || this.parent().numberOfQuestions || 50;
        return Math.round(total * 0.20);
      }
    },
    ST: {
      type: Number,
      min: [0, 'Cutoff cannot be negative'],
      default: function() {
        const total = this.parent().questions?.length || this.parent().numberOfQuestions || 50;
        return Math.round(total * 0.20);
      }
    }
  },
  scoring: {
    correct: {
      type: Number,
      min: [0.1, 'Correct score must be at least 0.1'],
      default: 4
    },
    wrong: {
      type: Number,
      max: [0, 'Wrong score should not be positive (use negative for penalty or 0 for no penalty)'],
      default: -1
    },
    unanswered: {
      type: Number,
      default: 0
    }
  },
  questions: {
    type: [{
      qid: {
        type: String,
        trim: true,
        default: function() {
          const parent = this.parent();
          const index = parent.questions.indexOf(this);
          const year = parent.year || new Date().getFullYear();
          const paper = (parent.paper || 'Test').replace(/\s+/g, '');
          return `${year}_${paper}_Q${index + 1}`;
        }
      },
      question: {
        type: String,
        trim: true,
        maxlength: [2000, 'Question cannot exceed 2000 characters'],
        default: 'Question text not provided'
      },
      difficulty: {
        type: String,
        enum: {
          values: ['Easy', 'Medium', 'Hard'],
          message: 'Difficulty must be Easy, Medium, or Hard'
        },
        default: 'Medium',
        trim: true
      },
      // Area field as number only - no validation for range to allow flexibility
      area: {
        type: Number,
        default: 1,
        index: true
      },
      // Subarea field for more specific categorization
      subarea: {
        type: String,
        trim: true,
        maxlength: [100, 'Subarea cannot exceed 100 characters'],
        default: '',
        index: true
      },
      options: {
        type: [{
          key: {
            type: String,
            enum: {
              values: ['A', 'B', 'C', 'D'],
              message: 'Option key must be A, B, C, or D'
            }
          },
          text: {
            type: String,
            trim: true,
            maxlength: [1000, 'Option text cannot exceed 1000 characters'],
            default: 'Option text not provided'
          },
          correct: {
            type: Boolean,
            default: false
          }
        }],
        default: function() {
          return [
            { key: 'A', text: 'Option A', correct: true },
            { key: 'B', text: 'Option B', correct: false },
            { key: 'C', text: 'Option C', correct: false },
            { key: 'D', text: 'Option D', correct: false }
          ];
        }
      },
      explanation: {
        type: String,
        trim: true,
        maxlength: [2000, 'Explanation cannot exceed 2000 characters'],
        default: ''
      }
    }],
    default: []
  },
  createdBy: {
    type: String,
    default: 'admin',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: {
    type: [{
      type: String,
      trim: true,
      maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    default: []
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  }
}, {
  timestamps: true
});

// Virtual for test statistics including area breakdown
testSchema.virtual('stats').get(function() {
  if (!this.questions || this.questions.length === 0) {
    return {
      totalQuestions: 0,
      easyQuestions: 0,
      mediumQuestions: 0,
      hardQuestions: 0,
      areaBreakdown: {},
      subareaBreakdown: {}
    };
  }

  const areaBreakdown = {};
  const subareaBreakdown = {};

  this.questions.forEach(q => {
    // Area breakdown by number
    const area = q.area || 1;
    areaBreakdown[area] = (areaBreakdown[area] || 0) + 1;

    // Subarea breakdown
    if (q.subarea) {
      subareaBreakdown[q.subarea] = (subareaBreakdown[q.subarea] || 0) + 1;
    }
  });

  return {
    totalQuestions: this.questions.length,
    easyQuestions: this.questions.filter(q => q.difficulty === 'Easy').length,
    mediumQuestions: this.questions.filter(q => q.difficulty === 'Medium').length,
    hardQuestions: this.questions.filter(q => q.difficulty === 'Hard').length,
    areaBreakdown,
    subareaBreakdown
  };
});

// Flexible pre-save middleware
testSchema.pre('save', function(next) {
  try {
    // Auto-sync duration and timeInMins
    if (this.timeInMins && !this.duration) {
      this.duration = this.timeInMins;
    } else if (this.duration && !this.timeInMins) {
      this.timeInMins = this.duration;
    } else if (!this.timeInMins && !this.duration) {
      const questionCount = this.questions?.length || this.numberOfQuestions || 50;
      const autoTime = Math.max(30, Math.ceil(questionCount * 1.5));
      this.timeInMins = autoTime;
      this.duration = autoTime;
    }

    if (this.questions && this.questions.length > 0) {
      this.numberOfQuestions = this.questions.length;
    } else if (!this.numberOfQuestions) {
      this.numberOfQuestions = 50;
    }

    // Auto-generate missing question IDs and validate area
    if (this.questions && this.questions.length > 0) {
      this.questions.forEach((question, index) => {
        if (!question.qid) {
          const year = this.year || new Date().getFullYear();
          const paper = (this.paper || 'Test').replace(/\s+/g, '');
          question.qid = `${year}_${paper}_Q${index + 1}`;
        }

        // Set default area if not provided or invalid
        if (!question.area || isNaN(question.area)) {
          question.area = 1; // Default to 1
        }

        // Ensure subarea is a string
        if (!question.subarea) {
          question.subarea = '';
        }
      });
    }

    // Flexible validation for questions
    if (this.questions && this.questions.length > 0) {
      for (let i = 0; i < this.questions.length; i++) {
        const question = this.questions[i];
        if (question.options && question.options.length > 0) {
          const correctOptions = question.options.filter(opt => opt.correct);
          
          if (correctOptions.length === 0 && question.options.length > 0) {
            console.warn(`Question ${i + 1}: No correct answer set, defaulting to option A`);
            question.options[0].correct = true;
          }
          
          if (correctOptions.length > 1) {
            console.warn(`Question ${i + 1}: Multiple correct answers found, keeping only the first one`);
            question.options.forEach((opt, idx) => {
              opt.correct = (opt === correctOptions[0]);
            });
          }
        }
      }
    }

    next();
  } catch (error) {
    console.warn('Pre-save processing warning:', error.message);
    next();
  }
});

// Flexible cutoff calculation
testSchema.pre('save', function(next) {
  try {
    const totalQuestions = this.questions?.length || this.numberOfQuestions || 50;
    
    if (!this.cutoff) this.cutoff = {};
    
    if (!this.cutoff.Gen || this.cutoff.Gen === 0) {
      this.cutoff.Gen = Math.round(totalQuestions * 0.30);
    }
    if (!this.cutoff.EWS || this.cutoff.EWS === 0) {
      this.cutoff.EWS = Math.round(totalQuestions * 0.30);
    }
    if (!this.cutoff.OBC || this.cutoff.OBC === 0) {
      this.cutoff.OBC = Math.round(totalQuestions * 0.25);
    }
    if (!this.cutoff.SC || this.cutoff.SC === 0) {
      this.cutoff.SC = Math.round(totalQuestions * 0.20);
    }
    if (!this.cutoff.ST || this.cutoff.ST === 0) {
      this.cutoff.ST = Math.round(totalQuestions * 0.20);
    }
    
    next();
  } catch (error) {
    console.warn('Cutoff calculation warning:', error.message);
    next();
  }
});

// Add indexes for better performance
testSchema.index({ createdAt: -1 });
testSchema.index({ name: 1 });
testSchema.index({ year: 1, paper: 1 });
testSchema.index({ isActive: 1 });
testSchema.index({ testType: 1 });
testSchema.index({ testType: 1, createdAt: -1 });
testSchema.index({ 'cutoff.Gen': 1 });
testSchema.index({ 'questions.area': 1 });
testSchema.index({ 'questions.subarea': 1 });

// Static methods
testSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

testSchema.statics.findByYear = function(year) {
  return this.find({ year: year });
};

testSchema.statics.findByType = function(testType) {
  return this.find({ testType: testType, isActive: true });
};

testSchema.statics.findByArea = function(area) {
  return this.find({ 'questions.area': area, isActive: true });
};

// Instance methods
testSchema.methods.getQuestionsByDifficulty = function(difficulty) {
  return this.questions.filter(q => q.difficulty === difficulty);
};

testSchema.methods.getQuestionsByArea = function(area) {
  return this.questions.filter(q => q.area === area);
};

testSchema.methods.getQuestionsBySubarea = function(subarea) {
  return this.questions.filter(q => q.subarea === subarea);
};

testSchema.methods.calculateMaxScore = function() {
  const questionCount = this.questions?.length || this.numberOfQuestions || 0;
  return questionCount * this.scoring.correct;
};

testSchema.methods.calculateMinScore = function() {
  const questionCount = this.questions?.length || this.numberOfQuestions || 0;
  return questionCount * this.scoring.wrong;
};

// Method to validate and fix data
testSchema.methods.validateAndFix = function() {
  const warnings = [];
  const fixes = [];

  if (!this.questions || this.questions.length === 0) {
    warnings.push('No questions found in test');
  } else {
    // Fix area values
    this.questions.forEach((question, index) => {
      if (!question.area || isNaN(question.area)) {
        question.area = 1;
        fixes.push(`Question ${index + 1}: Area set to 1`);
      }
      if (!question.subarea) {
        question.subarea = '';
        fixes.push(`Question ${index + 1}: Subarea set to empty string`);
      }
    });
  }

  if (!this.year) {
    this.year = new Date().getFullYear();
    fixes.push(`Year set to current year: ${this.year}`);
  }

  if (!this.paper) {
    this.paper = 'General Test';
    fixes.push('Paper set to "General Test"');
  }

  if (!this.timeInMins || !this.duration) {
    const questionCount = this.questions?.length || this.numberOfQuestions || 50;
    const autoTime = Math.max(30, Math.ceil(questionCount * 1.5));
    this.timeInMins = autoTime;
    this.duration = autoTime;
    fixes.push(`Duration set to ${autoTime} minutes`);
  }

  return { warnings, fixes };
};

// Add JSON transform
testSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Test', testSchema);