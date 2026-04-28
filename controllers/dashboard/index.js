'use strict'

var express = require('express');
var router = express.Router();
var http = require('http');
var bcrypt = require('bcryptjs');
var crypto = require('crypto');
var csrf = require('csurf');

var { User, Profile } = require('../../models');
var env = require('../../config/env');
var emailUtil = require('../../utils/email');
var demoAnalyticsData = require('../../analytics-dashboard-demo-data.json');

exports.name = 'dashboard';
exports.prefix = '/dashboard';
exports.router = router;

var API_KEY = process.env.ANALYTICS_API_KEY || '';
var BASE_PORT = process.env.PORT || 5000;
var DASHBOARD_DEMO_MODE = String(process.env.DASHBOARD_DEMO_MODE || '').toLowerCase() === 'true';

var csrfProtection = csrf({ cookie: false });

// Inject CSRF token into all dashboard views so the layout logout form works.
router.use(csrfProtection, function(req, res, next) {
  res.locals.csrfToken = req.csrfToken();
  next();
});

function isDashboardAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.path.indexOf('/proxy/') === 0) {
    return res.status(401).json({ success: false, message: 'Your dashboard session has expired. Please sign in again.' });
  }
  return res.redirect('/dashboard/login');
}

function proxyGet(apiPath, query, callback) {
  var qs = new URLSearchParams();
  if (query) {
    Object.keys(query).forEach(function(k) {
      if (query[k] !== '' && query[k] != null) {
        qs.set(k, query[k]);
      }
    });
  }

  var qsStr = qs.toString();
  var fullPath = apiPath + (qsStr ? '?' + qsStr : '');

  var options = {
    hostname: 'localhost',
    port: BASE_PORT,
    path: fullPath,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + API_KEY,
      'Accept': 'application/json'
    }
  };

  var req = http.request(options, function(proxyRes) {
    var chunks = [];
    proxyRes.on('data', function(chunk) { chunks.push(chunk); });
    proxyRes.on('end', function() {
      var body = Buffer.concat(chunks).toString();
      try {
        callback(null, JSON.parse(body), proxyRes.statusCode);
      } catch (e) {
        callback(new Error('Invalid JSON from API'), null, proxyRes.statusCode);
      }
    });
  });

  req.on('error', function(err) {
    callback(err, null, 500);
  });

  req.end();
}

function proxyDownload(apiPath, query, res) {
  // Early guard: if no API key is configured, fail with a clear message.
  if (!API_KEY) {
    return res.status(503).json({
      success: false,
      message: 'ANALYTICS_API_KEY is not configured. Set it in .env and restart the server.'
    });
  }

  var qs = new URLSearchParams();
  if (query) {
    Object.keys(query).forEach(function(k) {
      if (query[k] !== '' && query[k] != null) {
        qs.set(k, query[k]);
      }
    });
  }

  var qsStr = qs.toString();
  var fullPath = apiPath + (qsStr ? '?' + qsStr : '');
  var options = {
    hostname: 'localhost',
    port: BASE_PORT,
    path: fullPath,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + API_KEY
    }
  };

  var downloadReq = http.request(options, function(proxyRes) {
    var chunks = [];
    proxyRes.on('data', function(chunk) { chunks.push(chunk); });
    proxyRes.on('end', function() {
      var bodyBuffer = Buffer.concat(chunks);
      var statusCode = proxyRes.statusCode || 500;
      var contentType = proxyRes.headers['content-type'] || 'application/octet-stream';

      // If the upstream returned an error, forward it as JSON so the client
      // can show a meaningful message rather than a corrupt binary download.
      if (statusCode >= 400) {
        var errMsg = 'Export failed (HTTP ' + statusCode + ')';
        try {
          var parsed = JSON.parse(bodyBuffer.toString());
          if (parsed && parsed.message) errMsg = parsed.message;
        } catch (e) { /* body wasn't JSON */ }
        return res.status(statusCode).json({ success: false, message: errMsg });
      }

      var contentDisposition = proxyRes.headers['content-disposition'];
      res.status(statusCode);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      }
      res.send(bodyBuffer);
    });
  });

  downloadReq.on('error', function(err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Export proxy connection error: ' + err.message });
    }
  });

  downloadReq.end();
}

function proxyAnalytics(endpoint, req, res) {
  disableProxyCaching(req, res);

  if (DASHBOARD_DEMO_MODE) {
    var demoResponse = getDemoAnalyticsResponse('/api/analytics/' + endpoint, req);
    if (!demoResponse) {
      return res.status(404).json({ success: false, message: 'Demo data not found for endpoint: ' + endpoint });
    }
    return res.json(demoResponse);
  }

  proxyGet('/api/analytics/' + endpoint, req.query, function(err, data, status) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Proxy error' });
    }
    res.status(status).json(data);
  });
}

function getDemoAnalyticsResponse(endpoint, req) {
  var endpoints = (demoAnalyticsData && demoAnalyticsData.endpoints) ? demoAnalyticsData.endpoints : null;
  var payload = endpoints ? endpoints[endpoint] : null;
  var parsedLimit;
  var limitedEmployers;

  if (!payload) {
    return null;
  }

  if (endpoint === '/api/analytics/top-employers') {
    parsedLimit = req && req.query && req.query.limit !== undefined ? Number(req.query.limit) : 10;
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return {
        success: false,
        message: 'limit must be an integer between 1 and 50'
      };
    }
    limitedEmployers = (payload.data && payload.data.employers ? payload.data.employers : []).slice(0, parsedLimit);
    return {
      success: true,
      data: {
        employers: limitedEmployers
      }
    };
  }

  return payload;
}

function disableProxyCaching(req, res) {
  // Remove client validators so Express won't short-circuit with 304 for dashboard analytics.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

// ─── Auth pages (CSRF protected) ───

router.get('/login', csrfProtection, function(req, res) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('dashboard/login', { error: null, csrfToken: req.csrfToken() });
});

router.post('/login', csrfProtection, function(req, res) {
  var email = String(req.body.email || '').toLowerCase().trim();
  var password = req.body.password || '';

  if (!email || !password) {
    return res.render('dashboard/login', { error: 'Email and password are required', csrfToken: req.csrfToken() });
  }

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.render('dashboard/login', { error: 'Invalid email or password', csrfToken: req.csrfToken() });
      }

      return bcrypt.compare(password, user.password).then(function(match) {
        if (!match) {
          return res.render('dashboard/login', { error: 'Invalid email or password', csrfToken: req.csrfToken() });
        }
        if (!user.isVerified) {
          return res.render('dashboard/login', { error: 'Please verify your email before logging in', csrfToken: req.csrfToken() });
        }

        req.session.regenerate(function(err) {
          if (err) {
            return res.render('dashboard/login', { error: 'Login failed. Please try again.', csrfToken: req.csrfToken() });
          }
          req.session.userId = user.id;
          req.session.role = user.role;
          res.redirect('/dashboard');
        });
      });
    })
    .catch(function() {
      res.render('dashboard/login', { error: 'Login failed. Please try again.', csrfToken: req.csrfToken() });
    });
});

router.get('/register', csrfProtection, function(req, res) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('dashboard/register', { error: null, success: null, csrfToken: req.csrfToken() });
});

router.post('/register', csrfProtection, function(req, res) {
  var email = String(req.body.email || '').toLowerCase().trim();
  var password = req.body.password || '';
  var firstName = String(req.body.firstName || '').trim();
  var lastName = String(req.body.lastName || '').trim();

  if (!email || !password || !firstName || !lastName) {
    return res.render('dashboard/register', { error: 'All fields are required', success: null, csrfToken: req.csrfToken() });
  }

  var domain = String(env.universityDomain || '').toLowerCase();
  if (!email.endsWith(domain)) {
    return res.render('dashboard/register', { error: 'Email must end with ' + env.universityDomain, success: null, csrfToken: req.csrfToken() });
  }

  User.findOne({ where: { email: email } })
    .then(function(existing) {
      if (existing) {
        return res.render('dashboard/register', { error: 'Email already registered', success: null, csrfToken: req.csrfToken() });
      }

      var token = crypto.randomBytes(32).toString('hex');
      var hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      var expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      return bcrypt.hash(password, 12).then(function(hashedPassword) {
        return User.create({
          email: email,
          password: hashedPassword,
          role: 'alumnus',
          isVerified: false,
          verificationToken: hashedToken,
          verificationTokenExpiry: expiry
        });
      }).then(function(user) {
        return Profile.create({
          userId: user.id,
          firstName: firstName,
          lastName: lastName
        }).then(function() { return user; });
      }).then(function() {
        var link = env.baseUrl + '/dashboard/verify-email?token=' + token;
        var html = '<p>Welcome! Please verify your Eastminster Alumni account:</p>' +
                   '<p><a href="' + link + '">' + link + '</a></p>' +
                   '<p>This link expires in 24 hours.</p>';
        return emailUtil.sendEmail(email, 'Verify your Eastminster Alumni account', html)
          .catch(function() { return { sent: false, previewLink: link }; });
      }).then(function(emailResult) {
        var msg = 'Registration successful! Please check your email to verify your account, then log in.';
        if (emailResult && !emailResult.sent && emailResult.previewLink) {
          msg = 'Registration successful! Email delivery is not configured. Verification link: ' + emailResult.previewLink;
        }
        res.render('dashboard/register', {
          error: null,
          success: msg,
          csrfToken: req.csrfToken()
        });
      });
    })
    .catch(function() {
      res.render('dashboard/register', { error: 'Registration failed. Please try again.', success: null, csrfToken: req.csrfToken() });
    });
});

// Keep GET logout for direct-link support but keep POST as the preferred CSRF-safe path.
router.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.redirect('/dashboard/login');
  });
});

router.post('/logout', csrfProtection, function(req, res) {
  req.session.destroy(function() {
    res.redirect('/dashboard/login');
  });
});

// ─── Email verification page ───

router.get('/verify-email', function(req, res) {
  var token = String(req.query.token || '');

  if (!token) {
    return res.render('dashboard/verify-email', { success: null, error: 'Missing verification token.' });
  }

  var hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  User.findOne({ where: { verificationToken: hashedToken } })
    .then(function(user) {
      if (!user) {
        return res.render('dashboard/verify-email', { success: null, error: 'Invalid or expired verification link.' });
      }
      if (user.isVerified) {
        return res.render('dashboard/verify-email', { success: 'Email already verified. You can sign in.', error: null });
      }
      if (new Date() > user.verificationTokenExpiry) {
        return res.render('dashboard/verify-email', { success: null, error: 'Verification link has expired. Please register again.' });
      }

      return user.update({ isVerified: true, verificationToken: null, verificationTokenExpiry: null })
        .then(function() {
          res.render('dashboard/verify-email', { success: 'Email verified successfully! You can now sign in.', error: null });
        });
    })
    .catch(function() {
      res.render('dashboard/verify-email', { success: null, error: 'Verification failed. Please try again.' });
    });
});

// ─── Forgot / Reset password pages ───

router.get('/forgot-password', csrfProtection, function(req, res) {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.render('dashboard/forgot-password', { error: null, success: null, csrfToken: req.csrfToken() });
});

router.post('/forgot-password', csrfProtection, function(req, res) {
  var email = String(req.body.email || '').toLowerCase().trim();

  if (!email) {
    return res.render('dashboard/forgot-password', {
      error: 'Email is required', success: null, csrfToken: req.csrfToken()
    });
  }

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.render('dashboard/forgot-password', {
          error: null,
          success: 'If that email is registered, a reset link has been sent.',
          csrfToken: req.csrfToken()
        });
      }

      var rawToken = crypto.randomBytes(32).toString('hex');
      var hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      var expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      return user.update({ resetPasswordToken: hashedToken, resetPasswordTokenExpiry: expiry })
        .then(function() {
          var link = env.baseUrl + '/dashboard/reset-password?token=' + rawToken;
          var html = '<p>Click the link below to reset your password (expires in 1 hour):</p>' +
                     '<p><a href="' + link + '">' + link + '</a></p>';
          return emailUtil.sendEmail(email, 'Reset your Eastminster Analytics password', html)
            .catch(function() { return { sent: false, previewLink: link }; });
        })
        .then(function() {
          res.render('dashboard/forgot-password', {
            error: null,
            success: 'If that email is registered, a reset link has been sent.',
            csrfToken: req.csrfToken()
          });
        });
    })
    .catch(function() {
      res.render('dashboard/forgot-password', {
        error: 'Request failed. Please try again.', success: null, csrfToken: req.csrfToken()
      });
    });
});

router.get('/reset-password', csrfProtection, function(req, res) {
  var token = String(req.query.token || '');
  if (!token) return res.redirect('/dashboard/forgot-password');
  res.render('dashboard/reset-password', { error: null, success: null, token: token, csrfToken: req.csrfToken() });
});

router.post('/reset-password', csrfProtection, function(req, res) {
  var token = String(req.query.token || '');
  var newPassword = String(req.body.newPassword || '');

  if (!token) {
    return res.redirect('/dashboard/forgot-password');
  }

  var pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
  if (!pwRegex.test(newPassword)) {
    return res.render('dashboard/reset-password', {
      error: 'Password must be at least 8 characters with uppercase, lowercase, number and special character.',
      success: null, token: token, csrfToken: req.csrfToken()
    });
  }

  var hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  User.findOne({ where: { resetPasswordToken: hashedToken } })
    .then(function(user) {
      if (!user || new Date() > user.resetPasswordTokenExpiry) {
        return res.render('dashboard/reset-password', {
          error: 'Invalid or expired reset link. Please request a new one.',
          success: null, token: token, csrfToken: req.csrfToken()
        });
      }

      return require('bcryptjs').hash(newPassword, 12).then(function(hashed) {
        return user.update({ password: hashed, resetPasswordToken: null, resetPasswordTokenExpiry: null });
      }).then(function() {
        res.render('dashboard/reset-password', {
          error: null, success: 'Password reset successfully!', token: '', csrfToken: req.csrfToken()
        });
      });
    })
    .catch(function() {
      res.render('dashboard/reset-password', {
        error: 'Reset failed. Please try again.', success: null, token: token, csrfToken: req.csrfToken()
      });
    });
});

// ─── Protected pages ───

router.get('/', isDashboardAuthenticated, function(req, res) {
  if (DASHBOARD_DEMO_MODE) {
    var demoOverview = getDemoAnalyticsResponse('/api/analytics/overview', req);
    var demoOverviewData = demoOverview && demoOverview.data ? demoOverview.data : null;
    return res.render('dashboard/index', { overview: demoOverviewData });
  }

  proxyGet('/api/analytics/overview', {}, function(err, data) {
    var overview = (data && data.data) ? data.data : null;
    res.render('dashboard/index', { overview: overview });
  });
});

router.get('/charts', isDashboardAuthenticated, function(req, res) {
  res.render('dashboard/charts');
});

router.get('/alumni', isDashboardAuthenticated, function(req, res) {
  res.render('dashboard/alumni');
});

// ─── Server-side API proxy routes ───

router.get('/proxy/analytics/overview', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('overview', req, res);
});

router.get('/proxy/analytics/skills-gap', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('skills-gap', req, res);
});

router.get('/proxy/analytics/employment-by-sector', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('employment-by-sector', req, res);
});

router.get('/proxy/analytics/job-titles', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('job-titles', req, res);
});

router.get('/proxy/analytics/top-employers', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('top-employers', req, res);
});

router.get('/proxy/analytics/career-trends', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('career-trends', req, res);
});

router.get('/proxy/analytics/profile-completion-rate', isDashboardAuthenticated, function(req, res) {
  proxyAnalytics('profile-completion-rate', req, res);
});

router.get('/proxy/alumni', isDashboardAuthenticated, function(req, res) {
  proxyGet('/api/alumni', req.query, function(err, data, status) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Proxy error' });
    }
    res.status(status).json(data);
  });
});

router.get('/proxy/analytics/export/skills-gap', isDashboardAuthenticated, function(req, res) {
  proxyDownload('/api/analytics/export/skills-gap', req.query, res);
});

router.get('/proxy/analytics/export/employment', isDashboardAuthenticated, function(req, res) {
  proxyDownload('/api/analytics/export/employment', req.query, res);
});

router.get('/proxy/alumni/export', isDashboardAuthenticated, function(req, res) {
  proxyDownload('/api/alumni/export', req.query, res);
});
