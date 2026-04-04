'use strict'

var express = require('express');
var router = express.Router();

exports.name = 'public-api';
exports.prefix = '/api';
exports.router = router;

// Uses apiKeyAuth middleware (NOT session auth)
// TODO: Implement in Module 5

// GET /api/alumni-of-the-day
