'use strict'

require('dotenv').config();

var express = require('express');
var logger = require('morgan');
var path = require('node:path');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var methodOverride = require('method-override');
var helmet = require('helmet');
var cors = require('cors');

var swaggerUi = require('swagger-ui-express');
var swaggerSpec = require('./swagger/swagger');

var { sequelize } = require('./models');

var app = module.exports = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5000',
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

// Session store (XAMPP MySQL)
var sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alumni_influencers'
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'alumni-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
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

// Error handling middleware
app.use(function(err, req, res, next){
  if (!module.parent) console.error(err.stack);
  res.status(500).render('5xx');
});

// 404 handler
app.use(function(req, res, next){
  res.status(404).render('404', { url: req.originalUrl });
});

// Start server with DB sync
if (!module.parent) {
  var PORT = process.env.PORT || 5000;

  sequelize.authenticate()
    .then(function() {
      console.log('MySQL connected via XAMPP');
      return sequelize.sync();
    })
    .then(function() {
      console.log('Database tables synced');
      app.listen(PORT);
      console.log('Express started on port ' + PORT);
    })
    .catch(function(err) {
      console.error('Unable to connect to database:', err);
    });
}
