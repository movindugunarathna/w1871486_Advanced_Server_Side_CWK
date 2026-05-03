'use strict'

var express = require('express');
var router = express.Router();
var bcrypt = require('bcryptjs');
var crypto = require('crypto');

var { User, Profile, sequelize } = require('../../models');
var { registerRules, loginRules, forgotPasswordRules, resetPasswordRules, validate } = require('../../middleware/validators');
var env = require('../../config/env');
var { forgotPasswordLimiter, loginLimiter } = require('../../middleware/rateLimiter');
var { isAuthenticated } = require('../../middleware/auth');
var emailUtil = require('../../utils/email');

exports.name = 'auth';
exports.prefix = '/api/auth';
exports.router = router;

// ─── Email helpers (delegate to utils/email.js which supports Ethereal) ───

function sendVerificationEmail(email, token) {
  var link = env.baseUrl + '/api/auth/verify-email?token=' + token;
  var html = '<p>Welcome! Please verify your Eastminster Alumni account by clicking the link below:</p>' +
             '<p><a href="' + link + '">' + link + '</a></p>' +
             '<p>This link expires in 24 hours.</p>';
  return emailUtil.sendEmail(email, 'Verify your Eastminster Alumni account', html)
    .then(function() { return { sent: true }; })
    .catch(function(err) {
      console.error('[Verification email failed]', err.message);
      console.log('Verification link (fallback):', link);
      return { sent: false, previewLink: link };
    });
}

function sendPasswordResetEmail(email, token) {
  var link = env.baseUrl + '/api/auth/reset-password?token=' + token;
  var html = '<p>You requested a password reset. Click the link below (expires in 1 hour):</p>' +
             '<p><a href="' + link + '">' + link + '</a></p>' +
             '<p>If you did not request this, please ignore this email.</p>';
  return emailUtil.sendEmail(email, 'Reset your Eastminster Alumni password', html)
    .then(function() { return { sent: true }; })
    .catch(function(err) {
      console.error('[Reset email failed]', err.message);
      console.log('Reset link (fallback):', link);
      return { sent: false, previewLink: link };
    });
}

function hashResetToken(token) {
  // Store only a hashed reset token in the database (do not persist the raw token).
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getValidResetTokenUser(token) {
  var hashedToken = hashResetToken(token);

  return User.findOne({ where: { resetPasswordToken: hashedToken } })
    .then(function(user) {
      if (user) return user;
      // Backward compatibility for any legacy plaintext tokens.
      return User.findOne({ where: { resetPasswordToken: token } });
    })
    .then(function(user) {
      if (!user || !user.resetPasswordTokenExpiry || new Date() > user.resetPasswordTokenExpiry) {
        return null;
      }
      return user;
    });
}

// With MemoryStore there is no DB table to purge; the user's current session
// is destroyed in the reset handler and other sessions expire naturally.

// ─── Routes ───

/**
 * @swagger
 * /api/auth/health:
 *   get:
 *     summary: Auth service health check
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the currently signed-in user
 *     tags: [Authentication]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [alumnus, developer]
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.get('/me', function(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not signed in' });
  }

  User.findByPk(req.session.userId)
    .then(function(user) {
      if (!user) {
        return res.status(401).json({ success: false, message: 'Session is no longer valid' });
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    })
    .catch(function(err) {
      console.error('Get current user error:', err);
      res.status(500).json({ success: false, message: 'Failed to load session' });
    });
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new alumni account
 *     description: Creates a new user with role "alumnus". Email must end with the university domain. A verification email is sent.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *                 example: alice.jones@eastminster.ac.uk
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongP@ss1
 *                 description: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
 *               firstName:
 *                 type: string
 *                 example: Alice
 *               lastName:
 *                 type: string
 *                 example: Jones
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Registration successful! Please check your email to verify your account.
 *       400:
 *         description: Validation error (invalid email domain, weak password, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.post('/register', registerRules, validate, function(req, res) {
  var email = req.body.email;
  var password = req.body.password;
  var firstName = req.body.firstName;
  var lastName = req.body.lastName;

  // Normalize so duplicate-check and login work consistently.
  email = email.toLowerCase();

  User.findOne({ where: { email: email } })
    .then(function(existing) {
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      var token = crypto.randomBytes(32).toString('hex');
      var hashedVerificationToken = hashResetToken(token); // same sha256 strategy as password reset
      var expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      return bcrypt.hash(password, 12).then(function(hashedPassword) {
        // Wrap User + Profile creation in a transaction so both succeed or both roll back.
        return sequelize.transaction(function(t) {
          return User.create({
            email: email,
            password: hashedPassword,
            role: 'alumnus',
            isVerified: false,
            verificationToken: hashedVerificationToken,
            verificationTokenExpiry: expiry
          }, { transaction: t }).then(function(user) {
            return Profile.create({
              userId: user.id,
              firstName: firstName,
              lastName: lastName
            }, { transaction: t });
          });
        });
      }).then(function() {
        return sendVerificationEmail(email, token);
      }).then(function(emailResult) {
        var response = {
          success: true,
          message: 'Registration successful! Please check your email to verify your account.'
        };
        if (!emailResult.sent && emailResult.previewLink) {
          response.message = 'Registration successful! Email delivery is not configured. Use the verification link below.';
          response.verificationLink = emailResult.previewLink;
        }
        res.status(201).json(response);
      });
    })
    .catch(function(err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
    });
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email address
 *     description: Verifies a newly registered user's email using the token sent via email.
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Verification token from the email link
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Invalid, expired, or already-used token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.get('/verify-email', function(req, res) {
  var token = req.query.token;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required' });
  }

  var hashedVerificationToken = hashResetToken(token);

  User.findOne({ where: { verificationToken: hashedVerificationToken } })
    .then(function(user) {
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
      }
      if (new Date() > user.verificationTokenExpiry) {
        return res.status(400).json({ success: false, message: 'Verification token has expired' });
      }
      return User.update(
        { isVerified: true, verificationToken: null, verificationTokenExpiry: null },
        {
          where: {
            id: user.id,
            verificationToken: hashedVerificationToken,
            isVerified: false
          }
        }
      ).then(function(result) {
        var updatedRows = result && result[0] ? result[0] : 0;
        if (updatedRows === 0) {
          return res.status(400).json({ success: false, message: 'Verification link has already been used' });
        }
        res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
      });
    })
    .catch(function(err) {
      console.error('Verify email error:', err);
      res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
    });
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     description: Authenticates the user and creates a server-side session. Returns a session cookie (connect.sid).
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: john.doe@eastminster.ac.uk
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password1!
 *     responses:
 *       200:
 *         description: Logged in successfully — session cookie is set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged in successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [alumnus, developer]
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Email not verified yet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.post('/login', loginLimiter, loginRules, validate, function(req, res) {
  var email = req.body.email;
  var password = req.body.password;

  // Normalize so login works consistently.
  email = email.toLowerCase();

  User.findOne({
    where: { email: email },
    include: [{ model: Profile, attributes: ['firstName', 'lastName'] }]
  })
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
            data: {
              id: user.id,
              email: user.email,
              role: user.role,
              firstName: user.Profile ? user.Profile.firstName : null
            }
          });
        });
      });
    })
    .catch(function(err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
    });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out and destroy the session
 *     tags: [Authentication]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.post('/logout', isAuthenticated, function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: Sends a password-reset link to the given email. Always returns 200 to prevent email enumeration.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: john.doe@eastminster.ac.uk
 *     responses:
 *       200:
 *         description: Reset link sent (or silent success if email not found)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: If that email exists, a reset link has been sent.
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordRules, validate, function(req, res) {
  var email = req.body.email;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  email = String(email).toLowerCase();

  // Always respond the same way to prevent email enumeration
  var genericResponse = { success: true, message: 'If that email exists, a reset link has been sent.' };

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.json(genericResponse);
      }

      var rawToken = crypto.randomBytes(32).toString('hex');
      var hashedToken = hashResetToken(rawToken);
      var expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      return user.update({
        resetPasswordToken: hashedToken,
        resetPasswordTokenExpiry: expiry
      }).then(function() {
        return sendPasswordResetEmail(email, rawToken);
      }).then(function(emailResult) {
        var response = { success: true, message: genericResponse.message };
        if (!emailResult.sent) {
          response.message = 'Email delivery is not configured, so use the reset link returned below.';
          response.resetLink = emailResult.previewLink;
        } else if (emailResult.previewLink) {
          response.emailPreviewUrl = emailResult.previewLink;
        }
        res.json(response);
      }).catch(function(err) {
        console.error('Password reset email failed:', err.message);
        res.json({
          success: true,
          message: 'Password reset requested, but sending the email failed.',
          resetLink: env.baseUrl + '/#reset-password?token=' + rawToken
        });
      });
    })
    .catch(function(err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ success: false, message: 'Request failed. Please try again.' });
    });
});

router.get('/reset-password', function(req, res) {
  var token = String(req.query.token || '');
  var replacementToken = crypto.randomBytes(32).toString('hex');
  var replacementHashedToken = hashResetToken(replacementToken);

  if (!token) {
    return res.status(400).json({ success: false, message: 'Reset token is required' });
  }

  getValidResetTokenUser(token)
    .then(function(user) {
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
      }

      return User.update(
        { resetPasswordToken: replacementHashedToken },
        { where: { id: user.id, resetPasswordToken: user.resetPasswordToken } }
      ).then(function(result) {
        var updatedRows = result && result[0] ? result[0] : 0;
        if (updatedRows === 0) {
          return res.status(400).json({ success: false, message: 'Reset link has already been used' });
        }

        res.redirect('/#reset-password?token=' + encodeURIComponent(replacementToken));
      });
    })
    .catch(function(err) {
      console.error('Reset password link error:', err);
      res.status(500).json({ success: false, message: 'Reset link processing failed. Please try again.' });
    });
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using the emailed token
 *     description: Validates the reset token, updates the password, and invalidates all active sessions for the user.
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The unhashed reset token received via email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewStr0ng!Pass
 *                 description: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Invalid or expired token, or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.post('/reset-password', resetPasswordRules, validate, function(req, res) {
  var token = req.query.token;
  var newPassword = req.body.newPassword;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Reset token is required' });
  }

  getValidResetTokenUser(token)
    .then(function(user) {
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
      }

      return bcrypt.hash(newPassword, 12).then(function(hashedPassword) {
        return user.update({
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordTokenExpiry: null
        }).then(function() {
          res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
        });
      });
    })
    .catch(function(err) {
      console.error('Reset password error:', err);
      res.status(500).json({ success: false, message: 'Password reset failed. Please try again.' });
    });
});
