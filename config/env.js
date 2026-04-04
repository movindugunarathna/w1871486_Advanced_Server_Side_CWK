'use strict'

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',

  // Database (XAMPP defaults)
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'alumni_influencers'
  },

  // Auth
  sessionSecret: process.env.SESSION_SECRET || 'alumni-secret-change-me',
  jwtSecret: process.env.JWT_SECRET || 'jwt-secret-change-me',

  // Email
  email: {
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: process.env.EMAIL_PORT || 587,
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || 'noreply@eastminster.ac.uk'
  },

  // University
  universityDomain: process.env.UNIVERSITY_DOMAIN || '@eastminster.ac.uk'
};
