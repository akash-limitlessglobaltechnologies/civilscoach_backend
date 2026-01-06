const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User Schema with comprehensive profile management and password authentication
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(phone) {
        // Support international format and Indian mobile numbers
        const cleanNumber = phone.replace(/[\s\-\(\)]/g, '');
        const indianMobileRegex = /^(\+91|91)?[6-9]\d{9}$/;
        const internationalRegex = /^\+[1-9]\d{1,14}$/;
        return indianMobileRegex.test(cleanNumber) || internationalRegex.test(cleanNumber);
      },
      message: 'Please provide a valid phone number'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    validate: {
      validator: function(password) {
        // Skip validation if password is already hashed (starts with $2b$ for bcrypt)
        if (password.startsWith('$2b$')) {
          return true;
        }
        
        // Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);
      },
      message: 'Password must contain at least 8 characters with one uppercase letter, one lowercase letter, one number, and one special character'
    }
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
      default: ''
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
      default: ''
    },
    dateOfBirth: {
      type: Date
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
      default: 'Prefer not to say'
    },
    category: {
      type: String,
      enum: ['General', 'EWS', 'OBC', 'SC', 'ST'],
      default: 'General'
    },
    profilePicture: {
      type: String, // URL or base64 string
      default: ''
    }
  },
  preferences: {
    language: {
      type: String,
      enum: ['English', 'Hindi'],
      default: 'English'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    testSettings: {
      defaultTimer: {
        type: Boolean,
        default: true
      },
      showExplanations: {
        type: Boolean,
        default: true
      },
      autoSubmit: {
        type: Boolean,
        default: true
      }
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['Free', 'Basic', 'Premium'],
      default: 'Free'
    },
    validUntil: {
      type: Date,
      default: function() {
        // Free plan valid for 30 days from registration
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    },
    testsAllowed: {
      type: Number,
      default: function() {
        return this.subscription?.plan === 'Free' ? 10 : -1; // -1 means unlimited
      }
    },
    testsUsed: {
      type: Number,
      default: 0
    }
  },
  statistics: {
    totalTestsAttempted: {
      type: Number,
      default: 0
    },
    totalTestsCompleted: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    bestScore: {
      type: Number,
      default: 0
    },
    totalTimeSpent: {
      type: Number,
      default: 0 // in minutes
    },
    lastTestDate: {
      type: Date
    },
    streakDays: {
      type: Number,
      default: 0
    },
    lastActiveDate: {
      type: Date,
      default: Date.now
    }
  },
  security: {
    lastLoginAt: {
      type: Date,
      default: Date.now
    },
    loginCount: {
      type: Number,
      default: 1
    },
    lastLoginIP: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isVerified: {
      type: Boolean,
      default: false // Will be set to true after OTP verification during signup
    },
    accountLocked: {
      type: Boolean,
      default: false
    },
    lockReason: {
      type: String,
      default: ''
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date
    }
  },
  metadata: {
    registrationSource: {
      type: String,
      enum: ['web', 'mobile', 'referral'],
      default: 'web'
    },
    referralCode: {
      type: String,
      default: ''
    },
    utmSource: {
      type: String,
      default: ''
    },
    deviceInfo: {
      type: String,
      default: ''
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Remove duplicate indexes by only using schema.index() method (not index: true in field definition)
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'security.lastLoginAt': -1 });
userSchema.index({ 'subscription.plan': 1 });
userSchema.index({ 'subscription.validUntil': 1 });
userSchema.index({ 'security.isActive': 1 });
userSchema.index({ 'security.isVerified': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  const firstName = this.profile?.firstName || '';
  const lastName = this.profile?.lastName || '';
  return `${firstName} ${lastName}`.trim() || 'User';
});

// Virtual for display name (use full name or email prefix)
userSchema.virtual('displayName').get(function() {
  const fullName = this.fullName;
  if (fullName && fullName !== 'User') {
    return fullName;
  }
  return this.email.split('@')[0];
});

// Virtual for subscription status
userSchema.virtual('subscriptionStatus').get(function() {
  const now = new Date();
  if (this.subscription.validUntil < now) {
    return 'Expired';
  }
  if (this.subscription.plan === 'Free' && this.subscription.testsUsed >= this.subscription.testsAllowed) {
    return 'Limit Reached';
  }
  return 'Active';
});

// Virtual for remaining tests
userSchema.virtual('remainingTests').get(function() {
  if (this.subscription.plan === 'Free') {
    return Math.max(0, this.subscription.testsAllowed - this.subscription.testsUsed);
  }
  return -1; // Unlimited
});

// Virtual to check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  try {
    // Only hash password if it has been modified (or is new) AND it's not already hashed
    if (!this.isModified('password')) return next();
    
    // Skip hashing if password is already hashed (starts with $2b$ for bcrypt)
    if (this.password.startsWith('$2b$')) {
      return next();
    }
    
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for data validation and formatting
userSchema.pre('save', function(next) {
  // Ensure email is lowercase
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  
  // Ensure phone number is clean
  if (this.phoneNumber) {
    this.phoneNumber = this.phoneNumber.trim();
  }
  
  // Update statistics averages
  if (this.statistics.totalTestsCompleted > 0) {
    this.statistics.averageScore = Math.round(this.statistics.averageScore * 100) / 100;
  }
  
  next();
});

// Instance methods

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Update login info
userSchema.methods.updateLoginInfo = function(ipAddress) {
  this.security.lastLoginAt = new Date();
  this.security.loginCount += 1;
  this.security.lastLoginIP = ipAddress || '';
  this.security.failedLoginAttempts = 0; // Reset failed attempts on successful login
  this.statistics.lastActiveDate = new Date();
  return this.save();
};

// Handle failed login attempt
userSchema.methods.incFailedLoginAttempts = function() {
  // If we have a previous lock and it's expired, restart
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.lockUntil': 1 },
      $set: { 'security.failedLoginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'security.failedLoginAttempts': 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.security.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Update test statistics
userSchema.methods.updateTestStatistics = function(testScore, timeTaken, completed = true) {
  this.statistics.totalTestsAttempted += 1;
  if (completed) {
    this.statistics.totalTestsCompleted += 1;
  }
  
  // Update average score
  const totalCompleted = this.statistics.totalTestsCompleted;
  if (totalCompleted > 0) {
    this.statistics.averageScore = 
      ((this.statistics.averageScore * (totalCompleted - 1)) + testScore) / totalCompleted;
  }
  
  // Update best score
  if (testScore > this.statistics.bestScore) {
    this.statistics.bestScore = testScore;
  }
  
  // Update time spent
  this.statistics.totalTimeSpent += timeTaken;
  this.statistics.lastTestDate = new Date();
  
  // Update test usage for subscription
  if (this.subscription.plan === 'Free') {
    this.subscription.testsUsed += 1;
  }
  
  // Update streak (simplified logic)
  const today = new Date();
  const lastActive = this.statistics.lastActiveDate;
  const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 1) {
    this.statistics.streakDays += 1;
  } else if (daysDiff > 1) {
    this.statistics.streakDays = 1; // Reset streak
  }
  
  this.statistics.lastActiveDate = today;
  
  return this.save();
};

// Check if user can take test
userSchema.methods.canTakeTest = function() {
  if (!this.security.isActive || this.security.accountLocked || this.isLocked) {
    return { allowed: false, reason: 'Account is inactive, locked, or temporarily locked due to failed login attempts' };
  }
  
  if (!this.security.isVerified) {
    return { allowed: false, reason: 'Account is not verified' };
  }
  
  const now = new Date();
  if (this.subscription.validUntil < now) {
    return { allowed: false, reason: 'Subscription expired' };
  }
  
  if (this.subscription.plan === 'Free' && this.subscription.testsUsed >= this.subscription.testsAllowed) {
    return { allowed: false, reason: 'Free test limit reached' };
  }
  
  return { allowed: true, remaining: this.remainingTests };
};

// Get public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    email: this.email,
    phoneNumber: this.phoneNumber,
    displayName: this.displayName,
    profile: {
      firstName: this.profile.firstName,
      lastName: this.profile.lastName,
      category: this.profile.category,
      profilePicture: this.profile.profilePicture
    },
    subscription: {
      plan: this.subscription.plan,
      status: this.subscriptionStatus,
      remainingTests: this.remainingTests
    },
    statistics: {
      totalTestsCompleted: this.statistics.totalTestsCompleted,
      averageScore: Math.round(this.statistics.averageScore),
      bestScore: this.statistics.bestScore,
      streakDays: this.statistics.streakDays
    },
    security: {
      isVerified: this.security.isVerified,
      lastLoginAt: this.security.lastLoginAt
    },
    joinedAt: this.createdAt
  };
};

// Static methods
userSchema.statics.findByEmailOrPhone = function(email, phoneNumber) {
  return this.findOne({
    $or: [
      { email: email.toLowerCase().trim() },
      { phoneNumber: phoneNumber.trim() }
    ]
  });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ 'security.isActive': true });
};

userSchema.statics.getSubscriptionStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$subscription.plan',
        count: { $sum: 1 },
        totalTestsUsed: { $sum: '$subscription.testsUsed' }
      }
    }
  ]);
};

// Post-save middleware for logging
userSchema.post('save', function(doc) {
  console.log(`User updated: ${doc.email} - Tests completed: ${doc.statistics.totalTestsCompleted}`);
});

module.exports = mongoose.model('User', userSchema);