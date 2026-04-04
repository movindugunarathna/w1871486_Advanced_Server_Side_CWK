'use strict'

var crypto = require('node:crypto');

// Generate a cryptographically random token
exports.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Hash a token with SHA-256
exports.hashToken = function(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};
