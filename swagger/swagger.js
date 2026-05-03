'use strict'

var swaggerJsdoc = require('swagger-jsdoc');
var env = require('../config/env');

var options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alumni Influencers API',
      version: '1.0.0',
      description:
        'REST API for the Eastminster University Alumni of the Day bidding platform. ' +
        'Alumni register with a university email, build rich professional profiles, ' +
        'and place blind bids for a daily featured spot. Developers generate API keys ' +
        'to fetch the featured alumnus data for external applications.'
    },
    servers: [
      {
        url: env.baseUrl,
        description: 'Server (from BASE_URL in .env)'
      }
    ],
    components: {
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie set after a successful POST /api/auth/login'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Developer API key passed as Authorization: Bearer <key>'
        }
      },
      schemas: {
        SuccessMessage: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' }
          }
        },
        ErrorMessage: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        Degree: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profileId: { type: 'integer' },
            name: { type: 'string', example: 'BSc Computer Science' },
            university: { type: 'string', example: 'Eastminster University' },
            officialUrl: { type: 'string', example: 'https://www.eastminster.ac.uk/cs' },
            completionDate: { type: 'string', format: 'date', example: '2020-06-15' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Certification: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profileId: { type: 'integer' },
            name: { type: 'string', example: 'AWS Solutions Architect' },
            issuingBody: { type: 'string', example: 'Amazon Web Services' },
            courseUrl: { type: 'string', example: 'https://aws.amazon.com/certification/' },
            completionDate: { type: 'string', format: 'date', example: '2022-04-18' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Licence: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profileId: { type: 'integer' },
            name: { type: 'string', example: 'Chartered IT Professional (CITP)' },
            awardingBody: { type: 'string', example: 'BCS' },
            licenceUrl: { type: 'string', example: 'https://www.bcs.org/' },
            completionDate: { type: 'string', format: 'date', example: '2022-01-15' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        ProfessionalCourse: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profileId: { type: 'integer' },
            name: { type: 'string', example: 'Machine Learning Specialization' },
            provider: { type: 'string', example: 'Coursera' },
            courseUrl: { type: 'string', example: 'https://www.coursera.org/' },
            completionDate: { type: 'string', format: 'date', example: '2023-05-08' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Employment: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profileId: { type: 'integer' },
            company: { type: 'string', example: 'Tech Corp' },
            role: { type: 'string', example: 'Software Engineer' },
            startDate: { type: 'string', format: 'date', example: '2020-07-01' },
            endDate: { type: 'string', format: 'date', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Profile: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            biography: { type: 'string', example: 'Software engineer with 5 years of experience.' },
            linkedInUrl: { type: 'string', example: 'https://linkedin.com/in/johndoe' },
            profileImagePath: { type: 'string', nullable: true },
            profileComplete: { type: 'boolean' },
            Degrees: { type: 'array', items: { '$ref': '#/components/schemas/Degree' } },
            Certifications: { type: 'array', items: { '$ref': '#/components/schemas/Certification' } },
            Licences: { type: 'array', items: { '$ref': '#/components/schemas/Licence' } },
            ProfessionalCourses: { type: 'array', items: { '$ref': '#/components/schemas/ProfessionalCourse' } },
            Employments: { type: 'array', items: { '$ref': '#/components/schemas/Employment' } }
          }
        },
        Bid: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            bidDate: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'won', 'lost', 'cancelled'] },
            amount: { type: 'number', description: 'Own bid amount (history endpoint only)' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        AlumniOfTheDay: {
          type: 'object',
          properties: {
            alumni: {
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                biography: { type: 'string' },
                linkedInUrl: { type: 'string' },
                profileImageUrl: { type: 'string', nullable: true },
                degrees: { type: 'array', items: { type: 'object' } },
                certifications: { type: 'array', items: { type: 'object' } },
                licences: { type: 'array', items: { type: 'object' } },
                professionalCourses: { type: 'array', items: { type: 'object' } },
                employmentHistory: { type: 'array', items: { type: 'object' } }
              }
            },
            featuredDate: { type: 'string', format: 'date' },
            isLive: { type: 'boolean' }
          }
        }
      }
    },
    tags: [
      { name: 'Authentication', description: 'Register, login, logout, email verification, and password reset' },
      { name: 'Profile', description: 'Alumni profile CRUD including degrees, certifications, licences, courses, and employment' },
      { name: 'Bidding', description: 'Blind bidding system for the Alumni of the Day slot' },
      { name: 'Developer', description: 'API key management for developer accounts' },
      { name: 'Public', description: 'Public Alumni of the Day endpoint (requires API key)' },
      { name: 'Analytics', description: 'Aggregated intelligence endpoints (requires read:analytics scope)' },
      { name: 'Alumni Browse', description: 'Browse and filter alumni profiles (requires read:alumni scope)' },
      { name: 'Dashboard', description: 'Server-rendered web client routes (session-authenticated)' }
    ]
  },
  apis: ['./controllers/*/index.js']
};

var swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
