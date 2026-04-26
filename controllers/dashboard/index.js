'use strict'

var express = require('express');
var router = express.Router();
var http = require('http');
var bcrypt = require('bcryptjs');
var crypto = require('crypto');

var { User, Profile } = require('../../models');
var env = require('../../config/env');

exports.name = 'dashboard';
exports.prefix = '/dashboard';
exports.router = router;

var API_KEY = process.env.ANALYTICS_API_KEY || '';
var BASE_PORT = process.env.PORT || 5000;

function isDashboardAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
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

function proxyAnalytics(endpoint, req, res) {
  proxyGet('/api/analytics/' + endpoint, req.query, function(err, data, status) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Proxy error' });
    }
    res.status(status).json(data);
  });
}

// ─── Auth pages (no session required) ───

router.get('/login', function(req, res) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('dashboard/login', { error: null });
});

router.post('/login', function(req, res) {
  var email = String(req.body.email || '').toLowerCase().trim();
  var password = req.body.password || '';

  if (!email || !password) {
    return res.render('dashboard/login', { error: 'Email and password are required' });
  }

  User.findOne({ where: { email: email } })
    .then(function(user) {
      if (!user) {
        return res.render('dashboard/login', { error: 'Invalid email or password' });
      }

      return bcrypt.compare(password, user.password).then(function(match) {
        if (!match) {
          return res.render('dashboard/login', { error: 'Invalid email or password' });
        }
        if (!user.isVerified) {
          return res.render('dashboard/login', { error: 'Please verify your email before logging in' });
        }

        req.session.regenerate(function(err) {
          if (err) {
            return res.render('dashboard/login', { error: 'Login failed. Please try again.' });
          }
          req.session.userId = user.id;
          req.session.role = user.role;
          res.redirect('/dashboard');
        });
      });
    })
    .catch(function() {
      res.render('dashboard/login', { error: 'Login failed. Please try again.' });
    });
});

router.get('/register', function(req, res) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('dashboard/register', { error: null, success: null });
});

router.post('/register', function(req, res) {
  var email = String(req.body.email || '').toLowerCase().trim();
  var password = req.body.password || '';
  var firstName = String(req.body.firstName || '').trim();
  var lastName = String(req.body.lastName || '').trim();

  if (!email || !password || !firstName || !lastName) {
    return res.render('dashboard/register', { error: 'All fields are required', success: null });
  }

  var domain = String(env.universityDomain || '').toLowerCase();
  if (!email.endsWith(domain)) {
    return res.render('dashboard/register', { error: 'Email must end with ' + env.universityDomain, success: null });
  }

  User.findOne({ where: { email: email } })
    .then(function(existing) {
      if (existing) {
        return res.render('dashboard/register', { error: 'Email already registered', success: null });
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
        });
      }).then(function() {
        res.render('dashboard/register', {
          error: null,
          success: 'Registration successful! Please check your email to verify your account, then log in.'
        });
      });
    })
    .catch(function() {
      res.render('dashboard/register', { error: 'Registration failed. Please try again.', success: null });
    });
});

router.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.redirect('/dashboard/login');
  });
});

// ─── Protected pages ───

router.get('/', isDashboardAuthenticated, function(req, res) {
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
