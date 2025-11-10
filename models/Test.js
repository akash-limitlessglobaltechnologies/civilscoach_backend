const mongoose = require('mongoose');

// Test Schema
const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Test name is required'],
    trim: true,
    maxlength: [200, 'Test name cannot exceed 200 characters']
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2000, 'Year must be 2000 or later'],
    max: [2030, 'Year cannot exceed 2030']
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
    max: [300, 'Cannot exceed 300 questions']
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
  // Cutoff scores for different categories
  cutoff: {
    Gen: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative']
    },
    EWS: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative']
    },
    OBC: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative']
    },
    SC: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative']
    },
    ST: {
      type: Number,
      required: true,
      min: [0, 'Cutoff cannot be negative']
    }
  },
  // Custom scoring configuration
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
      max: [0, 'Wrong score cannot be positive (use negative for penalty)']
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
      required: true,
      trim: true
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Question cannot exceed 1000 characters']
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['Easy', 'Medium', 'Hard'],
      trim: true
    },
    area: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Area cannot exceed 100 characters']
    },
    options: [{
      key: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D']
      },
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: [500, 'Option text cannot exceed 500 characters']
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
      maxlength: [1000, 'Explanation cannot exceed 1000 characters']
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual to ensure numberOfQuestions matches questions array length
testSchema.virtual('questionsCount').get(function() {
  return this.questions.length;
});

// Pre-save middleware to sync duration with timeInMins
testSchema.pre('save', function(next) {
  if (this.timeInMins && !this.duration) {
    this.duration = this.timeInMins;
  } else if (this.duration && !this.timeInMins) {
    this.timeInMins = this.duration;
  }
  next();
});

// Add indexes for better performance
testSchema.index({ createdAt: -1 });
testSchema.index({ name: 1 });
testSchema.index({ year: 1, paper: 1 });

module.exports = mongoose.model('Test', testSchema);