const errorHandler = (err, req, res, next) => {
  // Enhanced error logging with more details
  console.error('🚨 Error occurred:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    body: req.method === 'POST' ? (req.body ? Object.keys(req.body) : 'No body') : undefined,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Default error response
  let error = {
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  };

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const validationErrors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message,
      value: val.value,
      kind: val.kind
    }));

    console.error('📋 Validation Error Details:', validationErrors);

    error.message = 'Validation error';
    error.type = 'VALIDATION_ERROR';
    error.errors = validationErrors;
    error.details = 'One or more fields contain invalid data';
    
    return res.status(400).json(error);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    
    console.error('🔄 Duplicate Key Error:', { field, value });

    error.message = `${field} '${value}' already exists`;
    error.type = 'DUPLICATE_ERROR';
    error.field = field;
    error.value = value;
    error.details = 'A record with this value already exists in the database';
    
    return res.status(409).json(error);
  }

  // Mongoose cast error (Invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    console.error('🎯 Cast Error:', {
      path: err.path,
      value: err.value,
      kind: err.kind
    });

    error.message = `Invalid ${err.path} format`;
    error.type = 'CAST_ERROR';
    error.field = err.path;
    error.provided = err.value;
    error.expected = err.kind;
    error.details = 'The provided value is not in the correct format';
    
    return res.status(400).json(error);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    console.error('🔐 JWT Error:', err.message);
    
    error.message = 'Invalid authentication token';
    error.type = 'AUTH_ERROR';
    error.details = 'Please provide a valid authentication token';
    
    return res.status(401).json(error);
  }

  if (err.name === 'TokenExpiredError') {
    console.error('⏰ Token Expired:', err.message);
    
    error.message = 'Authentication token expired';
    error.type = 'TOKEN_EXPIRED';
    error.details = 'Please login again to get a new token';
    
    return res.status(401).json(error);
  }

  // File upload errors (Multer)
  if (err.code === 'LIMIT_FILE_SIZE') {
    console.error('📁 File Size Error:', {
      limit: err.limit,
      field: err.field
    });

    error.message = 'File too large';
    error.type = 'FILE_SIZE_ERROR';
    error.limit = err.limit;
    error.details = `File size exceeds the maximum allowed size of ${Math.round(err.limit / (1024 * 1024))}MB`;
    
    return res.status(413).json(error);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    console.error('📎 Unexpected File Error:', {
      field: err.field
    });

    error.message = 'Unexpected file upload';
    error.type = 'UNEXPECTED_FILE';
    error.field = err.field;
    error.details = 'File upload not expected for this field';
    
    return res.status(400).json(error);
  }

  // MongoDB connection errors
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    console.error('🗄️ Database Error:', {
      name: err.name,
      code: err.code
    });

    error.message = 'Database operation failed';
    error.type = 'DATABASE_ERROR';
    error.details = 'There was an issue with the database operation';
    
    // Don't expose sensitive database details in production
    if (process.env.NODE_ENV === 'development') {
      error.dbError = err.message;
    }
    
    return res.status(500).json(error);
  }

  // Network/Connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('🌐 Network Error:', {
      code: err.code,
      address: err.address,
      port: err.port
    });

    error.message = 'Connection failed';
    error.type = 'NETWORK_ERROR';
    error.details = 'Unable to establish connection to external service';
    
    return res.status(503).json(error);
  }

  // Syntax errors (JSON parsing, etc.)
  if (err.name === 'SyntaxError') {
    console.error('📝 Syntax Error:', {
      message: err.message,
      type: err.type
    });

    error.message = 'Invalid request format';
    error.type = 'SYNTAX_ERROR';
    error.details = 'The request contains invalid syntax';
    
    if (err.message.includes('JSON')) {
      error.message = 'Invalid JSON in request body';
      error.details = 'The JSON in the request body is malformed';
    }
    
    return res.status(400).json(error);
  }

  // Rate limiting errors
  if (err.name === 'RateLimitError') {
    console.error('⏱️ Rate Limit Error:', {
      limit: err.limit,
      current: err.current,
      remaining: err.remaining
    });

    error.message = 'Too many requests';
    error.type = 'RATE_LIMIT_ERROR';
    error.details = 'You have exceeded the rate limit. Please try again later';
    error.retryAfter = err.retryAfter;
    
    return res.status(429).json(error);
  }

  // Permission errors
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    console.error('🔒 Permission Error:', {
      code: err.code,
      path: err.path
    });

    error.message = 'Permission denied';
    error.type = 'PERMISSION_ERROR';
    error.details = 'Insufficient permissions to perform this operation';
    
    return res.status(403).json(error);
  }

  // Custom application errors
  if (err.isCustomError) {
    console.error('🎨 Custom Error:', {
      type: err.type,
      code: err.code
    });

    error.message = err.message;
    error.type = err.type || 'CUSTOM_ERROR';
    error.details = err.details;
    
    if (err.field) error.field = err.field;
    if (err.value) error.value = err.value;
    
    return res.status(err.statusCode || 400).json(error);
  }

  // Default handling for unknown errors
  const statusCode = err.statusCode || err.status || 500;
  
  // Enhanced error details in development
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
    error.details = err.message;
    error.name = err.name;
    
    if (err.code) error.code = err.code;
    if (err.errno) error.errno = err.errno;
    if (err.syscall) error.syscall = err.syscall;
  }

  // Log critical errors for monitoring
  if (statusCode >= 500) {
    console.error('🔴 CRITICAL ERROR:', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      statusCode,
      timestamp: new Date().toISOString()
    });
  }

  // Set appropriate error message based on status code
  if (statusCode === 500) {
    error.message = 'Internal server error';
    error.type = 'INTERNAL_ERROR';
    error.details = 'An unexpected error occurred on the server';
  } else if (statusCode === 404) {
    error.message = 'Resource not found';
    error.type = 'NOT_FOUND';
    error.details = 'The requested resource was not found';
  } else if (statusCode === 403) {
    error.message = 'Access forbidden';
    error.type = 'FORBIDDEN';
    error.details = 'You do not have permission to access this resource';
  }

  res.status(statusCode).json(error);
};

// Custom error class for application-specific errors
class CustomError extends Error {
  constructor(message, statusCode = 500, type = 'CUSTOM_ERROR', details = null) {
    super(message);
    this.name = 'CustomError';
    this.statusCode = statusCode;
    this.type = type;
    this.details = details;
    this.isCustomError = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  CustomError
};