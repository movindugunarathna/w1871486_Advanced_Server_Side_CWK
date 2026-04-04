'use strict'

var express = require('express');
var router = express.Router();

exports.name = 'developer';
exports.prefix = '/api/developer';
exports.router = router;

// All routes require isDeveloper middleware
// TODO: Implement in Module 5

// POST   /api/developer/api-keys
// GET    /api/developer/api-keys
// DELETE /api/developer/api-keys/:id
// GET    /api/developer/api-keys/:id/stats
