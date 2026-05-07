'use strict'

require('dotenv').config();

var express = require('express');
var logger = require('morgan');
var path = require('node:path');
var fs = require('node:fs');
var http = require('node:http');
var https = require('node:https');
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
var isHttpsBaseUrl = String(process.env.BASE_URL || '').indexOf('https://') === 0;

function isSslEnabled() {
  return String(process.env.SSL_ENABLED || '').toLowerCase() === 'true';
}

function createHttpsServer(appInstance) {
  if (!isSslEnabled()) {
    return null;
  }

  var keyPath = process.env.SSL_KEY_PATH;
  var certPath = process.env.SSL_CERT_PATH;
  var caPath = process.env.SSL_CA_PATH;

  if (!keyPath || !certPath) {
    console.warn('[WARN] SSL_ENABLED=true but SSL_KEY_PATH or SSL_CERT_PATH is missing. Falling back to HTTP.');
    return null;
  }

  try {
    var sslOptions = {
      key: fs.readFileSync(path.resolve(keyPath)),
      cert: fs.readFileSync(path.resolve(certPath))
    };

    if (caPath) {
      sslOptions.ca = fs.readFileSync(path.resolve(caPath));
    }

    return https.createServer(sslOptions, appInstance);
  } catch (error) {
    console.warn('[WARN] Failed to read SSL certificate files. Falling back to HTTP.');
    console.warn(error.message);
    return null;
  }
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Trust reverse proxy (Nginx/Apache) so secure cookies work in production HTTPS setups.
app.set('trust proxy', 1);

// Security middleware — omit upgrade-insecure-requests unless the public site is HTTPS.
// Otherwise browsers block same-origin CSS/JS on http:// (they are upgraded to https:// and fail).
var helmetCspDirectives = Object.assign(
  {},
  helmet.contentSecurityPolicy.getDefaultDirectives(),
  (isHttpsBaseUrl)
    ? {}
    : { 'upgrade-insecure-requests': null }
);
// COOP / Origin-Agent-Cluster only apply on "trustworthy" origins (HTTPS or localhost).
// On http://<public-ip> browsers ignore them and log noise; skip sending those headers.
var helmetHttps = isHttpsBaseUrl;
app.use(helmet({
  contentSecurityPolicy: { directives: helmetCspDirectives },
  crossOriginOpenerPolicy: helmetHttps,
  originAgentCluster: helmetHttps
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
  proxy: isHttpsBaseUrl,
  cookie: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    httpOnly: true,
    secure: isHttpsBaseUrl,
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
      var httpsServer = createHttpsServer(app);

      if (httpsServer) {
        httpsServer.listen(PORT, '0.0.0.0', function() {
          console.log('Express HTTPS listening on 0.0.0.0:' + PORT);
        });

        var enableHttpRedirect = String(process.env.HTTP_REDIRECT_ENABLED || '').toLowerCase() === 'true';
        if (enableHttpRedirect) {
          var httpPort = Number(process.env.HTTP_PORT || 8080);
          http.createServer(function(req, res) {
            var host = String(req.headers.host || '');
            var hostname = host.split(':')[0] || 'localhost';
            var targetPort = Number(PORT) === 443 ? '' : ':' + PORT;
            var redirectUrl = 'https://' + hostname + targetPort + req.url;
            res.writeHead(301, { Location: redirectUrl });
            res.end();
          }).listen(httpPort, '0.0.0.0', function() {
            console.log('HTTP redirect server listening on 0.0.0.0:' + httpPort);
          });
        }
      } else {
        app.listen(PORT, '0.0.0.0', function () {
          console.log('Express HTTP listening on 0.0.0.0:' + PORT);
        });
      }
    })
    .catch(function(err) {
      console.error('Unable to connect to database:', err);
    });
}
