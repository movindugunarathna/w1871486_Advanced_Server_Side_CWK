'use strict'

var express = require('express');
var router = express.Router();
var bcrypt = require('bcryptjs');
var crypto = require('crypto');
var nodemailer = require('nodemailer');

var { User, Profile } = require('../../models');
var { registerRules, loginRules, resetPasswordRules, validate } = require('../../middleware/validators');
var env = require('../../config/env');

exports.name = 'auth';
exports.prefix = '/api/auth';
exports.router = router;

// ─── Email helper ───

function createTransporter() {
  return nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    auth: {
      user: env.email.user,
      pass: env.email.pass
    }
  });
}

function sendVerificationEmail(email, token) {
  var transporter = createTransporter();
  var link = env.baseUrl + '/api/auth/verify-email?token=' + token;
  return transporter.sendMail({
    from: env.email.from,
    to: email,
    subject: 'Verify your Eastminster Alumni account',
    html: '<p>Welcome! Please verify your email by clicking the link below:</p>' +
          '<p><a href="' + link + '">' + link + '</a></p>' +
          '<p>This link expires in 24 hours.</p>'
  });
}

function sendPasswordResetEmail(email, token) {
  var transporter = createTransporter();
  var link = env.baseUrl + '/#reset-password?token=' + token;
  return transporter.sendMail({
    from: env.email.from,
    to: email,
    subject: 'Reset your Eastminster Alumni password',
    html: '<p>You requested a password reset. Click the link below (expires in 1 hour):</p>' +
          '<p><a href="' + link + '">' + link + '</a></p>' +
          '<p>If you did not request this, please ignore this email.</p>'
  });
}

// ─── Routes ───

// GET /api/auth/health
router.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

// POST /api/auth/register
router.post('/register', registerRules, validate, function(req, res) {
  var email = req.body.email;
  var password = req.body.password;
  var firstName = req.body.firstName;
  var lastName = req.body.lastName;

  User.findOne({ where: { email: email } })
    .then(function(existing) {
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      var token = crypto.randomBytes(32).toString('hex');
      var expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      return bcrypt.hash(password, 12).then(function(hashedPassword) {
        return User.create({
          email: email,
          password: hashedPassword,
          role: 'alumnus',
          isVerified: false,
          verificationToken: token,
          verificationTokenExpiry: expiry
        });
      }).then(function(user) {
        return Profile.create({
          userId: user.id,
          firstName: firstName,
          lastName: lastName
        }).then(function() {
          return sendVerificationEmail(email, token).catch(function(err) {
            console.error('Email send failed:', err.message);
          });
        }).then(function() {
          res.status(201).json({
            success: true,
            message: 'Registration successful! Please check your email to verify your account.'
          });
        });
      });
    })
    .catch(function(err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
    });
});

// GET /api/auth/verify-email?token=xxx
router.get('/verify-email', function(req, res) {
  var token = req.query.token;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required' });
  }

  User.findOne({ where: { verificationToken: token } })
    .then(function(user) {
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
      }
      if (user.isVerified) {
        return res.status(400).json({ success: false, message: 'Email already verified' });
      }
      if (new Date() > user.verificationTokenExpiry) {
        return res.status(400).json({ success: false, message: 'Verification token has expired' });
      }

      return user.update({
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      }).then(function() {
        res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
      });
    })
    .catch(function(err) {
      console.error('Verify email error:', err);
      res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
    });
});

// POST /api/auth/login
router.post('/login', loginRules, validate, function(req, res) {
  var email = req.body.email;
  var password = req.body.password;

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      return bcrypt.compare(password, user.password).then(function(match) {
        if (!match) {
          return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        if (!user.isVerified) {
          return res.status(403).json({ success: false, message: 'Please verify your email before logging in' });
        }

        req.session.regenerate(function(err) {
          if (err) {
            console.error('Session regenerate error:', err);
            return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
          }
          req.session.userId = user.id;
          req.session.role = user.role;
          res.json({
            success: true,
            message: 'Logged in successfully',
            data: { id: user.id, email: user.email, role: user.role }
          });
        });
      });
    })
    .catch(function(err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
    });
});

// POST /api/auth/logout
router.post('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', function(req, res) {
  var email = req.body.email;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  // Always respond the same way to prevent email enumeration
  var genericResponse = { success: true, message: 'If that email exists, a reset link has been sent.' };

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.json(genericResponse);
      }

      var token = crypto.randomBytes(32).toString('hex');
      var expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      return user.update({
        resetPasswordToken: token,
        resetPasswordTokenExpiry: expiry
      }).then(function() {
        return sendPasswordResetEmail(email, token).catch(function(err) {
          console.error('Password reset email failed:', err.message);
        });
      }).then(function() {
        res.json(genericResponse);
      });
    })
    .catch(function(err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ success: false, message: 'Request failed. Please try again.' });
    });
});

// POST /api/auth/reset-password?token=xxx
router.post('/reset-password', resetPasswordRules, validate, function(req, res) {
  var token = req.query.token;
  var newPassword = req.body.newPassword;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Reset token is required' });
  }

  User.findOne({ where: { resetPasswordToken: token } })
    .then(function(user) {
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
      }
      if (new Date() > user.resetPasswordTokenExpiry) {
        return res.status(400).json({ success: false, message: 'Reset token has expired' });
      }

      return bcrypt.hash(newPassword, 12).then(function(hashedPassword) {
        return user.update({
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordTokenExpiry: null
        });
      }).then(function() {
        res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
      });
    })
    .catch(function(err) {
      console.error('Reset password error:', err);
      res.status(500).json({ success: false, message: 'Password reset failed. Please try again.' });
    });
});
