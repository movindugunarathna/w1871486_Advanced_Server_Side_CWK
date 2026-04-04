'use strict'

var express = require('express');
var router = express.Router();

exports.name = 'bidding';
exports.prefix = '/api/bidding';
exports.router = router;

// All routes require isAlumnus middleware
// TODO: Implement in Module 4

// GET    /api/bidding/slot
// POST   /api/bidding/bid
// PUT    /api/bidding/bid/:bidId
// DELETE /api/bidding/bid/:bidId
// GET    /api/bidding/bid/:bidId/status
// GET    /api/bidding/history
// GET    /api/bidding/monthly-status
