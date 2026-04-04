'use strict'

var express = require('express');
var router = express.Router();

// Auth controller uses router (custom routes don't fit convention-based mapping)
exports.name = 'auth';
exports.prefix = '/api/auth';
exports.router = router;

// Health check
router.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

// POST /api/auth/register
// TODO: Implement in Module 1

// GET /api/auth/verify-email?token=xxx
// TODO: Implement in Module 1

// POST /api/auth/login
// TODO: Implement in Module 2

// POST /api/auth/logout
// TODO: Implement in Module 2

// POST /api/auth/forgot-password
// TODO: Implement in Module 2

// POST /api/auth/reset-password?token=xxx
// TODO: Implement in Module 2
