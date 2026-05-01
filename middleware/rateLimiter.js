'use strict'

var rateLimit = require('express-rate-limit');

function isTrustedDashboardProxyRequest(req) {
  var forwarded = req.headers['x-dashboard-proxy'];
  var ip = req.ip || '';
  var isLoopbackIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return forwarded === '1' && isLoopbackIp;
}

// Auth routes: 10 requests per 15 minutes
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Login: 5 attempts per 15 minutes
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Forgot password: 3 per hour
exports.forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Bid placement: 20 per hour
exports.bidLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many bid requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Public API: 100 per hour per key
exports.apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'API rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Analytics API: 60 requests per 15 minutes per IP
exports.analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Analytics rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: function(req) {
    // Dashboard page requests are authenticated and proxied by this same server.
    // Skip analytics throttling to avoid self-throttling chart loads.
    return isTrustedDashboardProxyRequest(req);
  }
});

// Export routes: 10 requests per 15 minutes per IP
exports.exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Export rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: function(req) {
    return isTrustedDashboardProxyRequest(req);
  }
});

// General: 200 per 15 minutes per IP
exports.generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
