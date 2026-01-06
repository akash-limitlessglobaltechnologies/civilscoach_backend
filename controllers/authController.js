const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../services/emailService');
const { sendOTPSMS, verifySMSOTP } = require('../services/smsService');
const { CustomError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');

// Temporary storage for OTP sessions (in production, use Redis)
const otpSessions = new Map();

// OTP generation utility
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create session key utility
const createSessionKey = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// SIGNUP FLOW

// Step 1: Send OTP for Signup
const sendSignupOTP = async (req, res, next) => {
  try {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        type: 'VALIDATION_ERROR',
        errors: errors.array()
      });
    }

    const { email, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmailOrPhone(email, phoneNumber);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone number',
        type: 'USER_EXISTS'
      });
    }

    // Generate OTPs
    const emailOTP = generateOTP();
    const phoneOTP = generateOTP();
    const sessionKey = createSessionKey();

    // Store session data
    const sessionData = {
      email: email.toLowerCase().trim(),
      phoneNumber: phoneNumber.trim(),
      emailOTP,
      phoneOTP,
      emailVerified: false,
      phoneVerified: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
      type: 'signup',
      attempts: 0
    };

    otpSessions.set(sessionKey, sessionData);

    // Send OTP emails and SMS
    try {
      await sendOTPEmail(email, emailOTP, 'signup');
      console.log('📧 Email OTP sent successfully to:', email);
    } catch (emailError) {
      console.error('📧 Email OTP failed:', emailError.message);
      // Continue with phone OTP even if email fails
    }

    try {
      await sendOTPSMS(phoneNumber);
      console.log('📱 SMS OTP sent successfully to:', phoneNumber);
    } catch (smsError) {
      console.error('📱 SMS OTP failed:', smsError.message);
      // Continue even if SMS fails, user can retry
    }

    res.json({
      success: true,
      message: 'OTP sent successfully to your email and phone',
      sessionKey,
      email: email.toLowerCase().trim(),
      phoneNumber: phoneNumber.trim(),
      expiresAt: sessionData.expiresAt,
      type: 'signup'
    });

  } catch (error) {
    console.error('Send signup OTP error:', error);
    next(new CustomError('Failed to send OTP', 500, 'OTP_SEND_ERROR'));
  }
};

// Step 2: Verify OTP for Signup
const verifySignupOTP = async (req, res, next) => {
  try {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        type: 'VALIDATION_ERROR',
        errors: errors.array()
      });
    }

    const { sessionKey, emailOTP, phoneOTP } = req.body;

    // Get session data
    const sessionData = otpSessions.get(sessionKey);
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired session',
        type: 'INVALID_SESSION'
      });
    }

    // Check session expiry
    if (Date.now() > sessionData.expiresAt) {
      otpSessions.delete(sessionKey);
      return res.status(400).json({
        success: false,
        message: 'OTP session expired. Please request new OTP.',
        type: 'SESSION_EXPIRED'
      });
    }

    // Check session type
    if (sessionData.type !== 'signup') {
      return res.status(400).json({
        success: false,
        message: 'Invalid session type for signup',
        type: 'INVALID_SESSION_TYPE'
      });
    }

    // Increment verification attempts
    sessionData.attempts += 1;
    if (sessionData.attempts > 5) {
      otpSessions.delete(sessionKey);
      return res.status(429).json({
        success: false,
        message: 'Too many verification attempts. Please request new OTP.',
        type: 'TOO_MANY_ATTEMPTS'
      });
    }

    let emailVerified = sessionData.emailVerified;
    let phoneVerified = sessionData.phoneVerified;

    // Verify Email OTP
    if (!emailVerified && emailOTP) {
      if (emailOTP.trim() === sessionData.emailOTP) {
        emailVerified = true;
        sessionData.emailVerified = true;
        console.log('✅ Email OTP verified for:', sessionData.email);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid email OTP',
          type: 'INVALID_EMAIL_OTP',
          emailVerified: false,
          phoneVerified: sessionData.phoneVerified
        });
      }
    }

    // Verify Phone OTP using Twilio
    if (!phoneVerified && phoneOTP) {
      try {
        const phoneVerification = await verifySMSOTP(sessionData.phoneNumber, phoneOTP.trim());
        if (phoneVerification.success) {
          phoneVerified = true;
          sessionData.phoneVerified = true;
          console.log('✅ Phone OTP verified for:', sessionData.phoneNumber);
        } else {
          return res.status(400).json({
            success: false,
            message: phoneVerification.error || 'Invalid phone OTP',
            type: 'INVALID_PHONE_OTP',
            emailVerified: sessionData.emailVerified,
            phoneVerified: false
          });
        }
      } catch (error) {
        console.error('Phone OTP verification error:', error);
        return res.status(400).json({
          success: false,
          message: 'Phone OTP verification failed',
          type: 'PHONE_OTP_ERROR',
          emailVerified: sessionData.emailVerified,
          phoneVerified: false
        });
      }
    }

    // Check if both OTPs are verified
    if (emailVerified && phoneVerified) {
      // Mark session as verified
      sessionData.verified = true;
      sessionData.verifiedAt = Date.now();
      
      res.json({
        success: true,
        message: 'OTP verification successful. Please create your password.',
        sessionKey,
        emailVerified: true,
        phoneVerified: true,
        nextStep: 'create_password'
      });
    } else {
      res.json({
        success: true,
        message: 'Partial verification successful',
        sessionKey,
        emailVerified,
        phoneVerified,
        nextStep: 'verify_remaining_otp'
      });
    }

  } catch (error) {
    console.error('Verify signup OTP error:', error);
    next(new CustomError('OTP verification failed', 500, 'OTP_VERIFICATION_ERROR'));
  }
};

// Step 3: Complete Signup with Password
const completeSignup = async (req, res, next) => {
  try {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        type: 'VALIDATION_ERROR',
        errors: errors.array()
      });
    }

    const { sessionKey, password, firstName, lastName } = req.body;

    // Get session data
    const sessionData = otpSessions.get(sessionKey);
    if (!sessionData || !sessionData.verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session or OTP not verified',
        type: 'INVALID_SESSION'
      });
    }

    // Check if user already exists (double check)
    const existingUser = await User.findByEmailOrPhone(sessionData.email, sessionData.phoneNumber);
    if (existingUser) {
      otpSessions.delete(sessionKey);
      return res.status(409).json({
        success: false,
        message: 'User already exists',
        type: 'USER_EXISTS'
      });
    }

    // Create new user
    const userData = {
      email: sessionData.email,
      phoneNumber: sessionData.phoneNumber,
      password,
      profile: {
        firstName: firstName || '',
        lastName: lastName || ''
      },
      security: {
        isVerified: true,
        lastLoginAt: new Date(),
        loginCount: 1,
        lastLoginIP: req.ip || req.connection.remoteAddress || ''
      },
      metadata: {
        registrationSource: 'web',
        deviceInfo: req.get('User-Agent') || ''
      }
    };

    const newUser = new User(userData);
    await newUser.save();

    // Generate JWT token
    const token = generateToken({
      userId: newUser._id,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber
    });

    // Clean up session
    otpSessions.delete(sessionKey);

    // Send welcome email (fire and forget)
    try {
      const { sendWelcomeEmail } = require('../services/emailService');
      await sendWelcomeEmail(newUser.email);
    } catch (emailError) {
      console.error('Welcome email failed:', emailError.message);
    }

    console.log(`✅ User signup completed: ${newUser.email}`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: newUser.getPublicProfile(),
      token,
      type: 'SIGNUP_SUCCESS'
    });

  } catch (error) {
    console.error('Complete signup error:', error);
    next(new CustomError('Account creation failed', 500, 'SIGNUP_ERROR'));
  }
};

// LOGIN FLOW

// Login with email/phone and password
const login = async (req, res, next) => {
  try {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        type: 'VALIDATION_ERROR',
        errors: errors.array()
      });
    }

    const { identifier, password } = req.body; // identifier can be email or phone
    const clientIP = req.ip || req.connection.remoteAddress || '';

    // Find user by email or phone
    const user = await User.findByEmailOrPhone(identifier, identifier);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
        type: 'ACCOUNT_LOCKED'
      });
    }

    // Check if account is active and verified
    if (!user.security.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
        type: 'ACCOUNT_DEACTIVATED'
      });
    }

    if (!user.security.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Account is not verified. Please complete the signup process.',
        type: 'ACCOUNT_NOT_VERIFIED'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment failed login attempts
      await user.incFailedLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Update login information
    await user.updateLoginInfo(clientIP);

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      phoneNumber: user.phoneNumber
    });

    console.log(`✅ User login successful: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      user: user.getPublicProfile(),
      token,
      type: 'LOGIN_SUCCESS'
    });

  } catch (error) {
    console.error('Login error:', error);
    next(new CustomError('Login failed', 500, 'LOGIN_ERROR'));
  }
};

// UTILITY FUNCTIONS

// Resend OTP (works for both signup and login flows)
const resendOTP = async (req, res, next) => {
  try {
    const { sessionKey, type = 'both' } = req.body;

    const sessionData = otpSessions.get(sessionKey);
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired session',
        type: 'INVALID_SESSION'
      });
    }

    // Check if too many resend attempts
    if (sessionData.resendCount >= 3) {
      return res.status(429).json({
        success: false,
        message: 'Too many resend attempts. Please start over.',
        type: 'TOO_MANY_RESENDS'
      });
    }

    // Generate new OTPs
    if (type === 'email' || type === 'both') {
      sessionData.emailOTP = generateOTP();
      sessionData.emailVerified = false;
    }

    if (type === 'sms' || type === 'both') {
      sessionData.phoneOTP = generateOTP();
      sessionData.phoneVerified = false;
    }

    // Update session
    sessionData.resendCount = (sessionData.resendCount || 0) + 1;
    sessionData.expiresAt = Date.now() + (10 * 60 * 1000); // Extend expiry

    // Send OTPs
    try {
      if (type === 'email' || type === 'both') {
        await sendOTPEmail(sessionData.email, sessionData.emailOTP, sessionData.type);
        console.log('📧 Email OTP resent to:', sessionData.email);
      }

      if (type === 'sms' || type === 'both') {
        await sendOTPSMS(sessionData.phoneNumber);
        console.log('📱 SMS OTP resent to:', sessionData.phoneNumber);
      }

      res.json({
        success: true,
        message: 'OTP resent successfully',
        sessionKey,
        type,
        expiresAt: sessionData.expiresAt
      });

    } catch (error) {
      console.error('Resend OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend OTP. Please try again.',
        type: 'RESEND_FAILED'
      });
    }

  } catch (error) {
    console.error('Resend OTP error:', error);
    next(new CustomError('Failed to resend OTP', 500, 'RESEND_ERROR'));
  }
};

// Get session status
const getSessionStatus = async (req, res, next) => {
  try {
    const { sessionKey } = req.params;

    const sessionData = otpSessions.get(sessionKey);
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        type: 'SESSION_NOT_FOUND'
      });
    }

    const now = Date.now();
    const isExpired = now > sessionData.expiresAt;

    if (isExpired) {
      otpSessions.delete(sessionKey);
      return res.status(400).json({
        success: false,
        message: 'Session expired',
        type: 'SESSION_EXPIRED'
      });
    }

    res.json({
      success: true,
      status: {
        sessionKey,
        type: sessionData.type,
        emailVerified: sessionData.emailVerified || false,
        phoneVerified: sessionData.phoneVerified || false,
        verified: sessionData.verified || false,
        expiresAt: sessionData.expiresAt,
        timeRemaining: Math.max(0, sessionData.expiresAt - now),
        attempts: sessionData.attempts || 0,
        resendCount: sessionData.resendCount || 0
      }
    });

  } catch (error) {
    console.error('Get session status error:', error);
    next(new CustomError('Failed to get session status', 500, 'SESSION_STATUS_ERROR'));
  }
};

// Verify current token (for protected routes)
const verifyToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        type: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Token verification error:', error);
    next(new CustomError('Token verification failed', 500, 'TOKEN_VERIFICATION_ERROR'));
  }
};

// Logout
const logout = async (req, res, next) => {
  try {
    // In a stateless JWT system, logout is mainly client-side
    // But we can log the event for analytics
    console.log(`User logout: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    next(new CustomError('Logout failed', 500, 'LOGOUT_ERROR'));
  }
};

// Clean up expired sessions (should be called periodically)
const cleanupExpiredSessions = () => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionKey, sessionData] of otpSessions.entries()) {
    if (now > sessionData.expiresAt) {
      otpSessions.delete(sessionKey);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired OTP sessions`);
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

module.exports = {
  // Signup flow
  sendSignupOTP,
  verifySignupOTP,
  completeSignup,
  
  // Login flow
  login,
  
  // Utility functions
  resendOTP,
  getSessionStatus,
  verifyToken,
  logout,
  cleanupExpiredSessions
};