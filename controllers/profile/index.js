'use strict'

var express = require('express');
var router = express.Router();

exports.name = 'profile';
exports.prefix = '/api/profile';
exports.router = router;

// All routes require isAlumnus middleware
// TODO: Implement in Module 3

// GET    /api/profile
// PUT    /api/profile
// POST   /api/profile/image
// GET    /api/profile/completion
// CRUD   /api/profile/degrees
// CRUD   /api/profile/certifications
// CRUD   /api/profile/licences
// CRUD   /api/profile/courses
// CRUD   /api/profile/employment
