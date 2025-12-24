const jwt = require('jsonwebtoken');
const { CustomError } = require('./errorHandler');

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        type: 'AUTH_REQUIRED'
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        console.error('JWT verification failed:', err.message);
        
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            message: 'Token expired. Please login again.',
            type: 'TOKEN_EXPIRED'
          });
        }
        
        if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            message: 'Invalid token. Please login again.',
            type: 'INVALID_TOKEN'
          });
        }

        return res.status(401).json({
          success: false,
          message: 'Token verification failed',
          type: 'AUTH_FAILED'
        });
      }

      // Add user info to request object
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Authentication middleware error:', error);
    next(new CustomError('Authentication failed', 401, 'AUTH_ERROR'));
  }
};

// Optional authentication (for routes that work with or without auth)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

// Generate JWT Token
const generateToken = (payload) => {
  try {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'civils-coach',
      audience: 'civils-coach-users'
    });
  } catch (error) {
    console.error('Token generation error:', error);
    throw new CustomError('Failed to generate authentication token', 500, 'TOKEN_GENERATION_ERROR');
  }
};

// Verify JWT Token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Token verification error:', error);
    throw new CustomError('Invalid or expired token', 401, 'TOKEN_VERIFICATION_ERROR');
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  generateToken,
  verifyToken
};