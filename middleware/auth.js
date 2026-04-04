'use strict'

// Check if user is authenticated via session
exports.isAuthenticated = function(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
};

// Check if user is an alumnus
exports.isAlumnus = function(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'alumnus') {
    return next();
  }
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
  }
  return res.status(403).json({ success: false, message: 'Access denied. Alumni only.' });
};

// Check if user is a developer
exports.isDeveloper = function(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'developer') {
    return next();
  }
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
  }
  return res.status(403).json({ success: false, message: 'Not authorised. The developer portal is only for developer accounts.' });
};
