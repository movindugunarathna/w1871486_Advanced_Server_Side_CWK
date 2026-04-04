'use strict'

// Global error handler middleware
module.exports = function(err, req, res, next) {
  console.error(err.stack);

  var statusCode = err.statusCode || 500;
  var message = err.message || 'Internal Server Error';

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    success: false,
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
