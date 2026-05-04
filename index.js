'use strict'

require('dotenv').config();

var express = require('express');
var logger = require('morgan');
var path = require('node:path');
var session = require('express-session');
var methodOverride = require('method-override');
var helmet = require('helmet');
var cors = require('cors');

var errorHandler = require('./middleware/errorHandler');

var swaggerUi = require('swagger-ui-express');
var swaggerSpec = require('./swagger/swagger');

var env = require('./config/env');
var { sequelize } = require('./models');
var scheduler = require('./utils/scheduler');
var ensureDatabaseExists = require('./config/ensureDatabase');

var app = module.exports = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security middleware — omit upgrade-insecure-requests unless the public site is HTTPS.
// Otherwise browsers block same-origin CSS/JS on http:// (they are upgraded to https:// and fail).
var helmetCspDirectives = Object.assign(
  {},
  helmet.contentSecurityPolicy.getDefaultDirectives(),
  (String(process.env.BASE_URL || '').indexOf('https://') === 0)
    ? {}
    : { 'upgrade-insecure-requests': null }
);
app.use(helmet({
  contentSecurityPolicy: { directives: helmetCspDirectives }
}));
app.use(cors({
  origin: env.corsOrigin,
  credentials: true
}));

// Flash message helper (from boilerplate)
app.response.message = function(msg){
  var sess = this.req.session;
  sess.messages = sess.messages || [];
  sess.messages.push(msg);
  return this;
};

// Logging
if (!module.parent) app.use(logger('dev'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// In-memory session store (sessions are lost on server restart).
app.use(session({
  secret: process.env.SESSION_SECRET || 'alumni-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    httpOnly: true,
    secure: String(process.env.BASE_URL || '').indexOf('https://') === 0,
    sameSite: 'lax'
  }
}));

// Flash messages middleware (from boilerplate)
app.use(function(req, res, next){
  var msgs = req.session && req.session.messages ? req.session.messages : [];
  res.locals.messages = msgs;
  res.locals.hasMessages = !! msgs.length;
  next();
  if (req.session) {
    req.session.messages = [];
  }
});

// Health check endpoint
app.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

// Swagger API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Auto-load controllers (from boilerplate boot.js)
require('./lib/boot')(app, { verbose: !module.parent });

// Error handling middleware (JSON errors for API routes, HTML for page routes)
app.use(function(err, req, res, next) {
  var acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
  if (acceptsJson) {
    return errorHandler(err, req, res, next);
  }
  if (!module.parent) console.error(err.stack);
  res.status(500).render('errors/5xx');
});

// 404 handler
app.use(function(req, res, next){
  res.status(404).render('errors/404', { url: req.originalUrl });
});

// Start server with DB sync
if (!module.parent) {
  var PORT = process.env.PORT || 5000;

  // Warn if analytics dashboard key is missing
  if (!process.env.ANALYTICS_API_KEY) {
    console.warn('[WARN] ANALYTICS_API_KEY is not set — dashboard charts and exports will fail.');
  }

  ensureDatabaseExists()
    .then(function() {
      console.log('Database ensured: ' + (process.env.DB_NAME || 'w1871486_alumni_influencers'));
      return sequelize.authenticate();
    })
    .then(function() {
      console.log('MySQL connected via XAMPP');
      return sequelize.sync();
    })
    .then(function() {
      console.log('Database tables synced');
      // Start background scheduler jobs (winner selection, monthly resets).
      scheduler.start();
      app.listen(PORT, '0.0.0.0', function () {
        console.log('Express listening on 0.0.0.0:' + PORT);
      });
    })
    .catch(function(err) {
      console.error('Unable to connect to database:', err);
    });
}
