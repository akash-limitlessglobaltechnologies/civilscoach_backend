const mongoose = require('mongoose');

// Test Session Schema
const testSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  answers: {
    type: Map,
    of: String,
    default: new Map()
  },
  score: {
    type: Number
    // Removed min: 0 validation to allow negative scores with negative marking
  },
  completed: {
    type: Boolean,
    default: false
  },
  timeExpired: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes using ONLY schema.index() method to avoid duplicates
testSessionSchema.index({ sessionId: 1 });
testSessionSchema.index({ email: 1 });
testSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // TTL index for 24 hours

module.exports = mongoose.model('TestSession', testSessionSchema);