const mongoose = require('mongoose');

// Practice Question Schema for Question Bank
const practiceQuestionSchema = new mongoose.Schema({
  // Unique identifier for deduplication
  questionHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Core question data
  questionId: {
    type: String,
    trim: true,
    index: true
  },
  
  question: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [2000, 'Question cannot exceed 2000 characters']
  },
  
  difficulty: {
    type: String,
    enum: {
      values: ['Easy', 'Medium', 'Hard', ''],
      message: 'Difficulty must be Easy, Medium, Hard, or empty'
    },
    default: 'Medium',
    trim: true
  },
  
  area: {
    type: Number,
    required: true,
    min: [1, 'Area must be at least 1'],
    default: 1
  },
  
  subarea: {
    type: String,
    trim: true,
    maxlength: [100, 'Subarea cannot exceed 100 characters'],
    default: ''
  },
  
  // Options with flexible naming
  options: {
    A: {
      type: String,
      trim: true,
      maxlength: [1000, 'Option A cannot exceed 1000 characters'],
      default: ''
    },
    B: {
      type: String,
      trim: true,
      maxlength: [1000, 'Option B cannot exceed 1000 characters'],
      default: ''
    },
    C: {
      type: String,
      trim: true,
      maxlength: [1000, 'Option C cannot exceed 1000 characters'],
      default: ''
    },
    D: {
      type: String,
      trim: true,
      maxlength: [1000, 'Option D cannot exceed 1000 characters'],
      default: ''
    }
  },
  
  // Alternative option naming (for backward compatibility)
  OptionA: {
    type: String,
    trim: true,
    maxlength: [1000, 'Option A cannot exceed 1000 characters']
  },
  OptionB: {
    type: String,
    trim: true,
    maxlength: [1000, 'Option B cannot exceed 1000 characters']
  },
  OptionC: {
    type: String,
    trim: true,
    maxlength: [1000, 'Option C cannot exceed 1000 characters']
  },
  OptionD: {
    type: String,
    trim: true,
    maxlength: [1000, 'Option D cannot exceed 1000 characters']
  },
  
  // Correct answer
  key: {
    type: String,
    required: [true, 'Correct answer key is required'],
    enum: {
      values: ['A', 'B', 'C', 'D'],
      message: 'Answer key must be A, B, C, or D'
    }
  },
  
  explanation: {
    type: String,
    trim: true,
    maxlength: [2000, 'Explanation cannot exceed 2000 characters'],
    default: ''
  },
  
  source: {
    type: String,
    trim: true,
    maxlength: [200, 'Source cannot exceed 200 characters'],
    default: ''
  },
  
  // Metadata
  tags: {
    type: [{
      type: String,
      trim: true,
      maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    default: []
  },
  
  // Usage tracking
  usage: {
    timesUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    lastUsed: {
      type: Date
    },
    avgPerformance: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    correctAttempts: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Admin metadata
  uploadedBy: {
    type: String,
    default: 'admin',
    trim: true
  },
  
  uploadSession: {
    type: String,
    trim: true,
    index: true
  },
  
  batchId: {
    type: String,
    trim: true,
    index: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Quality control
  isVerified: {
    type: Boolean,
    default: false
  },
  
  qualityScore: {
    type: Number,
    min: 0,
    max: 5,
    default: 3
  },
  
  // Duplicate tracking
  duplicateCount: {
    type: Number,
    default: 1,
    min: 1
  },
  
  lastDuplicateAttempt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
practiceQuestionSchema.index({ questionHash: 1 });
practiceQuestionSchema.index({ area: 1, subarea: 1 });
practiceQuestionSchema.index({ difficulty: 1 });
practiceQuestionSchema.index({ tags: 1 });
practiceQuestionSchema.index({ uploadSession: 1 });
practiceQuestionSchema.index({ batchId: 1 });
practiceQuestionSchema.index({ isActive: 1 });
practiceQuestionSchema.index({ createdAt: -1 });
practiceQuestionSchema.index({ 'usage.timesUsed': -1 });
practiceQuestionSchema.index({ 'usage.avgPerformance': -1 });

// Virtual for success rate
practiceQuestionSchema.virtual('successRate').get(function() {
  if (this.usage.totalAttempts === 0) return 0;
  return Math.round((this.usage.correctAttempts / this.usage.totalAttempts) * 100);
});

// Virtual for formatted options
practiceQuestionSchema.virtual('formattedOptions').get(function() {
  return {
    A: this.options.A || this.OptionA || '',
    B: this.options.B || this.OptionB || '',
    C: this.options.C || this.OptionC || '',
    D: this.options.D || this.OptionD || ''
  };
});

// Pre-save middleware for data normalization and hash generation
practiceQuestionSchema.pre('save', function(next) {
  try {
    // Normalize options - handle both naming conventions
    if (this.OptionA && !this.options.A) this.options.A = this.OptionA;
    if (this.OptionB && !this.options.B) this.options.B = this.OptionB;
    if (this.OptionC && !this.options.C) this.options.C = this.OptionC;
    if (this.OptionD && !this.options.D) this.options.D = this.OptionD;
    
    // Generate unique hash for deduplication
    if (!this.questionHash) {
      const crypto = require('crypto');
      const hashData = [
        this.question?.trim().toLowerCase(),
        this.options.A?.trim().toLowerCase() || this.OptionA?.trim().toLowerCase() || '',
        this.options.B?.trim().toLowerCase() || this.OptionB?.trim().toLowerCase() || '',
        this.options.C?.trim().toLowerCase() || this.OptionC?.trim().toLowerCase() || '',
        this.options.D?.trim().toLowerCase() || this.OptionD?.trim().toLowerCase() || '',
        this.key?.toUpperCase()
      ].join('|');
      
      this.questionHash = crypto.createHash('sha256').update(hashData).digest('hex');
    }
    
    // Normalize area
    if (!this.area || isNaN(this.area)) {
      this.area = 1;
    }
    
    // Normalize difficulty
    if (!this.difficulty) {
      this.difficulty = 'Medium';
    }
    
    // Ensure subarea is string
    if (!this.subarea) {
      this.subarea = '';
    }
    
    // Set default upload session if not provided
    if (!this.uploadSession) {
      this.uploadSession = `session_${new Date().getTime()}`;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Static methods for question bank operations

// Find questions with filters
practiceQuestionSchema.statics.findWithFilters = function(filters = {}) {
  const query = { isActive: true };
  
  if (filters.area) query.area = filters.area;
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.subarea) query.subarea = new RegExp(filters.subarea, 'i');
  if (filters.tags && filters.tags.length > 0) query.tags = { $in: filters.tags };
  if (filters.minQualityScore) query.qualityScore = { $gte: filters.minQualityScore };
  
  return this.find(query);
};

// Get questions by upload session
practiceQuestionSchema.statics.findByUploadSession = function(sessionId) {
  return this.find({ uploadSession: sessionId }).sort({ createdAt: 1 });
};

// Get statistics by area
practiceQuestionSchema.statics.getStatsByArea = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$area',
        count: { $sum: 1 },
        avgQualityScore: { $avg: '$qualityScore' },
        totalUsage: { $sum: '$usage.timesUsed' },
        avgPerformance: { $avg: '$usage.avgPerformance' },
        difficulties: {
          $push: '$difficulty'
        }
      }
    },
    {
      $project: {
        area: '$_id',
        count: 1,
        avgQualityScore: { $round: ['$avgQualityScore', 2] },
        totalUsage: 1,
        avgPerformance: { $round: ['$avgPerformance', 2] },
        difficultyBreakdown: {
          $reduce: {
            input: '$difficulties',
            initialValue: { Easy: 0, Medium: 0, Hard: 0 },
            in: {
              Easy: {
                $cond: [
                  { $eq: ['$$this', 'Easy'] },
                  { $add: ['$$value.Easy', 1] },
                  '$$value.Easy'
                ]
              },
              Medium: {
                $cond: [
                  { $eq: ['$$this', 'Medium'] },
                  { $add: ['$$value.Medium', 1] },
                  '$$value.Medium'
                ]
              },
              Hard: {
                $cond: [
                  { $eq: ['$$this', 'Hard'] },
                  { $add: ['$$value.Hard', 1] },
                  '$$value.Hard'
                ]
              }
            }
          }
        }
      }
    },
    { $sort: { area: 1 } }
  ]);
};

// Batch upsert with duplicate handling
practiceQuestionSchema.statics.batchUpsert = async function(questions, uploadSession, uploadedBy = 'admin') {
  const results = {
    inserted: 0,
    duplicates: 0,
    errors: 0,
    details: []
  };
  
  for (let i = 0; i < questions.length; i++) {
    try {
      const questionData = {
        ...questions[i],
        uploadSession,
        uploadedBy,
        batchId: `batch_${uploadSession}_${Date.now()}`
      };
      
      // Create instance to trigger pre-save middleware for hash generation
      const tempQuestion = new this(questionData);
      await tempQuestion.validate();
      const questionHash = tempQuestion.questionHash;
      
      // Check for existing question
      const existing = await this.findOne({ questionHash });
      
      if (existing) {
        // Update duplicate tracking
        await this.findByIdAndUpdate(existing._id, {
          $inc: { duplicateCount: 1 },
          $set: { lastDuplicateAttempt: new Date() }
        });
        
        results.duplicates++;
        results.details.push({
          index: i,
          status: 'duplicate',
          questionId: questionData.questionId || `Q${i + 1}`,
          existingId: existing._id,
          reason: 'Question already exists in database'
        });
      } else {
        // Insert new question
        const newQuestion = await this.create(questionData);
        results.inserted++;
        results.details.push({
          index: i,
          status: 'inserted',
          questionId: questionData.questionId || `Q${i + 1}`,
          newId: newQuestion._id,
          hash: questionHash
        });
      }
    } catch (error) {
      results.errors++;
      results.details.push({
        index: i,
        status: 'error',
        questionId: questions[i]?.questionId || `Q${i + 1}`,
        error: error.message
      });
    }
  }
  
  return results;
};

// Instance methods

// Update usage statistics
practiceQuestionSchema.methods.updateUsage = function(isCorrect = false) {
  this.usage.timesUsed += 1;
  this.usage.totalAttempts += 1;
  if (isCorrect) {
    this.usage.correctAttempts += 1;
  }
  this.usage.avgPerformance = (this.usage.correctAttempts / this.usage.totalAttempts) * 100;
  this.usage.lastUsed = new Date();
  
  return this.save();
};

// Convert to test question format
practiceQuestionSchema.methods.toTestQuestionFormat = function() {
  return {
    question: this.question,
    difficulty: this.difficulty || 'Medium',
    area: this.area,
    subarea: this.subarea,
    options: [
      { key: 'A', text: this.formattedOptions.A, correct: this.key === 'A' },
      { key: 'B', text: this.formattedOptions.B, correct: this.key === 'B' },
      { key: 'C', text: this.formattedOptions.C, correct: this.key === 'C' },
      { key: 'D', text: this.formattedOptions.D, correct: this.key === 'D' }
    ],
    explanation: this.explanation
  };
};

// Validation method
practiceQuestionSchema.methods.validateQuestionData = function() {
  const errors = [];
  
  if (!this.question || this.question.trim().length === 0) {
    errors.push('Question text is required');
  }
  
  const options = this.formattedOptions;
  if (!options.A || !options.B || !options.C || !options.D) {
    errors.push('All four options (A, B, C, D) are required');
  }
  
  if (!this.key || !['A', 'B', 'C', 'D'].includes(this.key)) {
    errors.push('Valid answer key (A, B, C, D) is required');
  }
  
  if (!this.area || this.area < 1) {
    errors.push('Valid area number is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = mongoose.model('PracticeQuestion', practiceQuestionSchema);