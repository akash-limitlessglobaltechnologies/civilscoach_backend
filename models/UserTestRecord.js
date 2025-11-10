const mongoose = require('mongoose');

// User Test Record Schema
const userTestRecordSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  testName: {
    type: String,
    required: true
  },
  testYear: {
    type: Number,
    required: true
  },
  testPaper: {
    type: String,
    required: true
  },
  // Total weighted score based on scoring system
  score: {
    type: Number,
    required: true
    // Removed min: 0 validation to allow negative scores with negative marking
  },
  // Individual counts for detailed breakdown
  correctAnswers: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  wrongAnswers: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  unansweredQuestions: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  totalQuestions: {
    type: Number,
    required: true,
    min: 1
  },
  // Percentage based on correct answers (for backward compatibility)
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  timeTaken: {
    type: Number, // in minutes
    required: true
  },
  timeExpired: {
    type: Boolean,
    default: false
  },
  answers: {
    type: Map,
    of: String,
    default: new Map()
  },
  // Store the scoring system used for this test
  scoring: {
    correct: {
      type: Number,
      required: true,
      default: 1
    },
    wrong: {
      type: Number,
      required: true,
      default: 0
    },
    unanswered: {
      type: Number,
      required: true,
      default: 0
    }
  },
  completedAt: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes for better performance
userTestRecordSchema.index({ email: 1, completedAt: -1 });
userTestRecordSchema.index({ testId: 1 });

// Virtual for backward compatibility - maps to correctAnswers
userTestRecordSchema.virtual('unanswered').get(function() {
  return this.unansweredQuestions;
});

module.exports = mongoose.model('UserTestRecord', userTestRecordSchema);