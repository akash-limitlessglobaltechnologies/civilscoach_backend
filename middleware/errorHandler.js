const errorHandler = (err, req, res, next) => {
    console.error('Error occurred:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  
    // Default error response
    let error = {
      success: false,
      message: 'Internal server error'
    };
  
    // Mongoose validation error
    if (err.name === 'ValidationError') {
      error.message = 'Validation error';
      error.errors = Object.values(err.errors).map(val => val.message);
      return res.status(400).json(error);
    }
  
    // Mongoose duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      error.message = `${field} already exists`;
      return res.status(409).json(error);
    }
  
    // Mongoose cast error
    if (err.name === 'CastError') {
      error.message = 'Invalid ID format';
      return res.status(400).json(error);
    }
  
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      error.message = 'Invalid token';
      return res.status(401).json(error);
    }
  
    if (err.name === 'TokenExpiredError') {
      error.message = 'Token expired';
      return res.status(401).json(error);
    }
  
    // Multer errors
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        error.message = 'File too large';
        return res.status(413).json(error);
      }
      error.message = 'File upload error';
      return res.status(400).json(error);
    }
  
    // Custom error status
    const statusCode = err.statusCode || 500;
    
    // Include error details in development
    if (process.env.NODE_ENV === 'development') {
      error.stack = err.stack;
      error.details = err.message;
    }
  
    res.status(statusCode).json(error);
  };
  
  module.exports = errorHandler;