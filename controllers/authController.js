const { validateEmail } = require('../utils/validation');
const { validatePhoneNumber, sendOTPSMS, verifySMSOTP } = require('../services/smsService');
const { sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
const { generateToken } = require('../middleware/auth');
const { CustomError } = require('../middleware/errorHandler');

// In-memory OTP storage (In production, use Redis or database)
const otpStorage = new Map();
const OTP_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Clean up expired OTPs
const cleanupExpiredOTPs = () => {
  const now = Date.now();
  for (const [key, data] of otpStorage.entries()) {
    if (data.expiresAt < now) {
      otpStorage.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);

// Step 1: Send OTP to email and phone
const sendOTP = async (req, res, next) => {
  try {
    const { email, phoneNumber } = req.body;

    // Validate inputs
    if (!email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Email and phone number are required',
        type: 'VALIDATION_ERROR'
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
        type: 'INVALID_EMAIL'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number',
        type: 'INVALID_PHONE'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const sessionKey = `${normalizedEmail}_${phoneNumber}`;

    // Check if there's a recent OTP request
    const existingOTP = otpStorage.get(sessionKey);
    if (existingOTP) {
      const timeSinceLastRequest = Date.now() - existingOTP.requestedAt;
      if (timeSinceLastRequest < 60000) { // 1 minute cooldown
        return res.status(429).json({
          success: false,
          message: 'Please wait before requesting a new OTP',
          retryAfter: Math.ceil((60000 - timeSinceLastRequest) / 1000),
          type: 'RATE_LIMITED'
        });
      }
    }

    // Generate OTP for email only (Twilio handles SMS OTP generation)
    const emailOTP = generateOTP();

    console.log(`🔐 Generated OTPs for ${normalizedEmail}:`, {
      email: emailOTP,
      phone: 'handled_by_twilio_verify_service',
      sessionKey
    });

    // Store OTPs with expiration (only email OTP, Twilio handles SMS)
    otpStorage.set(sessionKey, {
      emailOTP,
      email: normalizedEmail,
      phoneNumber,
      expiresAt: Date.now() + OTP_EXPIRY_TIME,
      requestedAt: Date.now(),
      verified: {
        email: false,
        phone: false
      },
      attempts: 0
    });

    // Send OTPs simultaneously (Twilio will generate its own SMS OTP)
    const [emailResult, smsResult] = await Promise.allSettled([
      sendOTPEmail(normalizedEmail, emailOTP, 'login'),
      sendOTPSMS(phoneNumber) // No OTP parameter - Twilio generates it
    ]);

    // Check results
    const emailSent = emailResult.status === 'fulfilled';
    const smsSent = smsResult.status === 'fulfilled';

    if (!emailSent && !smsSent) {
      // Remove from storage if both failed
      otpStorage.delete(sessionKey);
      
      console.error('❌ Both OTP sending failed:', {
        emailError: emailResult.reason?.message,
        smsError: smsResult.reason?.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP to both email and phone. Please try again.',
        type: 'OTP_SEND_FAILED',
        errors: {
          email: emailResult.reason?.message,
          sms: smsResult.reason?.message
        }
      });
    }

    // Prepare response
    const response = {
      success: true,
      message: 'OTP sent successfully',
      sessionKey,
      expiresIn: Math.floor(OTP_EXPIRY_TIME / 1000), // in seconds
      sent: {
        email: emailSent,
        sms: smsSent
      }
    };

    // Add warnings for partial failures
    if (!emailSent) {
      response.warnings = response.warnings || [];
      response.warnings.push(`Failed to send email OTP: ${emailResult.reason?.message}`);
    }
    
    if (!smsSent) {
      response.warnings = response.warnings || [];
      response.warnings.push(`Failed to send SMS OTP: ${smsResult.reason?.message}`);
    }

    console.log('✅ OTP send result:', {
      sessionKey,
      email: normalizedEmail,
      phone: phoneNumber,
      emailSent,
      smsSent
    });

    res.json(response);

  } catch (error) {
    console.error('🚨 Send OTP error:', error);
    next(error);
  }
};

// Step 2: Verify OTPs and login
const verifyOTPAndLogin = async (req, res, next) => {
  try {
    const { sessionKey, emailOTP, phoneOTP } = req.body;

    // Validate inputs
    if (!sessionKey || !emailOTP || !phoneOTP) {
      return res.status(400).json({
        success: false,
        message: 'Session key and both OTPs are required',
        type: 'VALIDATION_ERROR'
      });
    }

    // Get stored OTP data
    const otpData = otpStorage.get(sessionKey);
    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session. Please request a new OTP.',
        type: 'SESSION_NOT_FOUND'
      });
    }

    // Check expiration
    if (Date.now() > otpData.expiresAt) {
      otpStorage.delete(sessionKey);
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new OTP.',
        type: 'OTP_EXPIRED'
      });
    }

    // Check attempt limit
    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      otpStorage.delete(sessionKey);
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new OTP.',
        type: 'MAX_ATTEMPTS_EXCEEDED'
      });
    }

    // Increment attempts
    otpData.attempts++;

    // Verify OTPs
    const emailOTPValid = emailOTP.trim() === otpData.emailOTP;
    
    // Verify SMS OTP using Twilio Verify Service
    let phoneOTPValid = false;
    let smsVerificationError = null;
    
    try {
      const smsVerification = await verifySMSOTP(otpData.phoneNumber, phoneOTP.trim());
      phoneOTPValid = smsVerification.success;
      if (!phoneOTPValid) {
        smsVerificationError = smsVerification.error || 'Invalid SMS OTP';
      }
    } catch (error) {
      console.error('📱 SMS verification error:', error.message);
      smsVerificationError = error.message;
    }

    console.log(`🔍 OTP verification for ${sessionKey}:`, {
      emailOTPValid,
      phoneOTPValid,
      attempts: otpData.attempts,
      providedEmailOTP: emailOTP,
      providedPhoneOTP: phoneOTP,
      storedEmailOTP: otpData.emailOTP,
      smsVerificationMethod: 'twilio_verify_service',
      smsError: smsVerificationError || 'none'
    });

    if (!emailOTPValid || !phoneOTPValid) {
      // Save updated attempts count
      otpStorage.set(sessionKey, otpData);
      
      const errors = [];
      if (!emailOTPValid) errors.push('email');
      if (!phoneOTPValid) errors.push('SMS');
      
      let errorMessage = `Invalid OTP for: ${errors.join(' and ')}`;
      if (!phoneOTPValid && smsVerificationError) {
        errorMessage += ` (SMS Error: ${smsVerificationError})`;
      }
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
        type: 'INVALID_OTP',
        invalidOTPs: errors,
        attemptsRemaining: MAX_OTP_ATTEMPTS - otpData.attempts,
        smsError: smsVerificationError
      });
    }

    // Both OTPs are valid - generate JWT token
    const tokenPayload = {
      email: otpData.email,
      phoneNumber: otpData.phoneNumber,
      loginTime: new Date().toISOString(),
      type: 'user'
    };

    const token = generateToken(tokenPayload);

    // Clean up OTP data
    otpStorage.delete(sessionKey);

    // Send welcome email (async, don't wait)
    sendWelcomeEmail(otpData.email).catch(error => {
      console.error('📧 Welcome email failed:', error.message);
    });

    console.log('✅ Successful login:', {
      email: otpData.email,
      phone: otpData.phoneNumber,
      sessionKey
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        email: otpData.email,
        phoneNumber: otpData.phoneNumber,
        loginTime: tokenPayload.loginTime
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

  } catch (error) {
    console.error('🚨 Verify OTP error:', error);
    next(error);
  }
};

// Resend OTP
const resendOTP = async (req, res, next) => {
  try {
    const { sessionKey, type } = req.body; // type: 'email' or 'sms' or 'both'

    if (!sessionKey) {
      return res.status(400).json({
        success: false,
        message: 'Session key is required',
        type: 'VALIDATION_ERROR'
      });
    }

    const otpData = otpStorage.get(sessionKey);
    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session. Please start a new login process.',
        type: 'SESSION_NOT_FOUND'
      });
    }

    // Check if enough time has passed since last request (30 seconds cooldown)
    const timeSinceLastRequest = Date.now() - otpData.requestedAt;
    if (timeSinceLastRequest < 30000) {
      return res.status(429).json({
        success: false,
        message: 'Please wait before requesting OTP again',
        retryAfter: Math.ceil((30000 - timeSinceLastRequest) / 1000),
        type: 'RATE_LIMITED'
      });
    }

    // Generate new OTPs if needed
    if (type === 'email' || type === 'both') {
      otpData.emailOTP = generateOTP();
    }
    // Note: For SMS, Twilio Verify Service generates its own OTP

    // Update expiration and request time
    otpData.expiresAt = Date.now() + OTP_EXPIRY_TIME;
    otpData.requestedAt = Date.now();
    otpData.attempts = 0; // Reset attempts on resend

    // Send OTPs based on type
    const sendPromises = [];
    
    if (type === 'email' || type === 'both') {
      sendPromises.push(sendOTPEmail(otpData.email, otpData.emailOTP, 'resend'));
    }
    if (type === 'sms' || type === 'both') {
      sendPromises.push(sendOTPSMS(otpData.phoneNumber)); // No OTP parameter - Twilio handles it
    }

    const results = await Promise.allSettled(sendPromises);
    
    // Update storage
    otpStorage.set(sessionKey, otpData);

    console.log('🔄 OTP resent:', {
      sessionKey,
      type,
      email: otpData.email,
      phone: otpData.phoneNumber
    });

    res.json({
      success: true,
      message: `OTP resent successfully to ${type}`,
      expiresIn: Math.floor(OTP_EXPIRY_TIME / 1000),
      sent: {
        email: type === 'email' || type === 'both',
        sms: type === 'sms' || type === 'both'
      }
    });

  } catch (error) {
    console.error('🚨 Resend OTP error:', error);
    next(error);
  }
};

// Get session status
const getSessionStatus = async (req, res, next) => {
  try {
    const { sessionKey } = req.params;

    const otpData = otpStorage.get(sessionKey);
    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        type: 'SESSION_NOT_FOUND'
      });
    }

    const timeRemaining = Math.max(0, otpData.expiresAt - Date.now());
    
    res.json({
      success: true,
      sessionKey,
      expiresIn: Math.floor(timeRemaining / 1000),
      attemptsRemaining: MAX_OTP_ATTEMPTS - otpData.attempts,
      verified: otpData.verified
    });

  } catch (error) {
    console.error('🚨 Session status error:', error);
    next(error);
  }
};

// Verify current token (for frontend to check auth status)
const verifyToken = async (req, res, next) => {
  try {
    // User info is already available in req.user from auth middleware
    res.json({
      success: true,
      user: req.user,
      message: 'Token is valid'
    });
  } catch (error) {
    console.error('🚨 Token verification error:', error);
    next(error);
  }
};

// Logout (client-side token removal)
const logout = async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('🚨 Logout error:', error);
    next(error);
  }
};

module.exports = {
  sendOTP,
  verifyOTPAndLogin,
  resendOTP,
  getSessionStatus,
  verifyToken,
  logout
};