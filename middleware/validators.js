'use strict'

var { body, validationResult } = require('express-validator');
var env = require('../config/env');

// Handle validation results
exports.validate = function(req, res, next) {
  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(function(err) {
        return { field: err.path, message: err.msg };
      })
    });
  }
  next();
};

// Registration validation rules
exports.registerRules = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .custom(function(value) {
      // Domain match should be case-insensitive.
      var domain = String(env.universityDomain || '').toLowerCase();
      var email = String(value || '').toLowerCase();
      if (!email.endsWith(domain)) {
        throw new Error('Email must end with ' + env.universityDomain);
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least 1 uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least 1 lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least 1 number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least 1 special character'),
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .escape(),
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .escape()
];

// Login validation rules
exports.loginRules = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required'),
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Profile update validation rules
exports.profileRules = [
  body('firstName').optional().trim().escape(),
  body('lastName').optional().trim().escape(),
  body('biography').optional().trim().escape(),
  body('linkedInUrl').optional().trim().isURL().withMessage('Valid URL is required')
];

// Bid validation rules
exports.bidRules = [
  body('amount')
    .isFloat({ gt: 0 }).withMessage('Amount must be a positive number')
];

// Password reset validation
exports.resetPasswordRules = [
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least 1 uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least 1 lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least 1 number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least 1 special character')
];

// Forgot password validation
exports.forgotPasswordRules = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
];
