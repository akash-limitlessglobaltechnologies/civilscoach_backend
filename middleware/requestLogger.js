const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request details
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip} - ${new Date().toISOString()}`);
  
  // Log request body for POST/PUT requests (excluding sensitive data)
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    const logBody = { ...req.body };
    
    // Remove sensitive fields from logs
    if (logBody.password) logBody.password = '[REDACTED]';
    if (logBody.adminId) logBody.adminId = '[REDACTED]';
    
    console.log('📦 Request Body:', JSON.stringify(logBody, null, 2));
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    console.log(`📤 ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    
    // Log error responses
    if (res.statusCode >= 400) {
      console.log('❌ Error Response:', JSON.stringify(body, null, 2));
    }
    
    return originalJson.call(this, body);
  };

  next();
};

module.exports = requestLogger;