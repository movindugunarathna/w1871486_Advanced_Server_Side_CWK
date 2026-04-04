'use strict'

var swaggerJsdoc = require('swagger-jsdoc');
var env = require('../config/env');

var options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alumni Influencers API',
      version: '1.0.0',
      description: 'API for the Alumni of the Day bidding platform. Alumni can bid for a featured spot, and developers can access the featured alumni data via API keys.'
    },
    servers: [
      {
        url: env.baseUrl + '/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie authentication'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key in Authorization header'
        }
      }
    },
    tags: [
      { name: 'Authentication', description: 'Register, login, logout, verify, reset' },
      { name: 'Profile', description: 'Alumni profile CRUD' },
      { name: 'Bidding', description: 'Blind bidding system' },
      { name: 'Developer', description: 'API key management' },
      { name: 'Public', description: 'Alumni of the Day endpoint' }
    ]
  },
  apis: ['./controllers/*/index.js']
};

var swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
