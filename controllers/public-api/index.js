'use strict'

var express = require('express');
var router = express.Router();

var rateLimit = require('express-rate-limit');
var { Op } = require('sequelize');

var apiKeyAuth = require('../../middleware/apiKeyAuth');
var {
  sequelize,
  FeaturedAlumnus,
  Profile,
  Degree,
  Certification,
  Licence,
  ProfessionalCourse,
  Employment
} = require('../../models');

exports.name = 'public-api';
exports.prefix = '/api';
exports.router = router;

// 100 requests per hour per API key (keyed by apiKeyId from apiKeyAuth).
var apiKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'API rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function(req) {
    if (req.apiKeyDeveloper && req.apiKeyDeveloper.apiKeyId) {
      return String(req.apiKeyDeveloper.apiKeyId);
    }
    return req.ip;
  }
});

/**
 * @swagger
 * /api/alumni-of-the-day:
 *   get:
 *     summary: Get today's featured Alumni of the Day
 *     description: >
 *       Returns the full public profile of today's featured alumnus including
 *       degrees, certifications, licences, professional courses, and employment
 *       history. No sensitive data (email, password, bid amounts) is included.
 *       Requires a valid developer API key in the Authorization header.
 *       Response is cached for 1 hour (Cache-Control: max-age=3600).
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Featured alumnus data (or null if no winner today)
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AlumniOfTheDay'
 *                 - type: object
 *                   properties:
 *                     featured:
 *                       type: 'null'
 *                       example: null
 *                     message:
 *                       type: string
 *                       example: No Alumni of the Day today.
 *       401:
 *         description: Missing, invalid, or revoked API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       429:
 *         description: API rate limit exceeded (100 req/hour per key)
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
var profileAssociations = [Degree, Certification, Licence, ProfessionalCourse, Employment];

router.get('/alumni-of-the-day', apiKeyAuth, apiKeyLimiter, async function(req, res) {
  try {
    // Load featured row without JOINs first (avoids Sequelize subquery/join edge cases), then load Profile.
    var featured = await FeaturedAlumnus.findOne({
      where: sequelize.where(
        sequelize.col('FeaturedAlumnus.featuredDate'),
        Op.eq,
        sequelize.fn('CURDATE')
      )
    });

    var isLive = !!featured;
    if (!featured) {
      featured = await FeaturedAlumnus.findOne({
        order: [['featuredDate', 'DESC']]
      });
      isLive = false;
    }

    var p = featured
      ? await Profile.findByPk(featured.profileId, {
          include: profileAssociations
        })
      : null;

    // Cache-Control header (1 hour)
    res.set('Cache-Control', 'max-age=3600');

    if (!featured || !p) {
      return res.status(200).json({
        featured: null,
        message:
          'No featured alumnus in the database. From the project root run: node utils/seed.js ' +
          '(uses your .env DB_NAME). Then restart the server and create a new API key.'
      });
    }

    var alumni = {
      firstName: p.firstName,
      lastName: p.lastName,
      biography: p.biography,
      linkedInUrl: p.linkedInUrl,
      profileImageUrl: p.profileImagePath ? '/' + p.profileImagePath : null,
      degrees: (p.Degrees || []).map(function(d) {
        return { name: d.name, university: d.university, officialUrl: d.officialUrl, completionDate: d.completionDate };
      }),
      certifications: (p.Certifications || []).map(function(c) {
        return { name: c.name, issuingBody: c.issuingBody, courseUrl: c.courseUrl, completionDate: c.completionDate };
      }),
      licences: (p.Licences || []).map(function(l) {
        return { name: l.name, awardingBody: l.awardingBody, licenceUrl: l.licenceUrl, completionDate: l.completionDate };
      }),
      professionalCourses: (p.ProfessionalCourses || []).map(function(c) {
        return { name: c.name, provider: c.provider, courseUrl: c.courseUrl, completionDate: c.completionDate };
      }),
      employmentHistory: (p.Employments || []).map(function(e) {
        return { company: e.company, role: e.role, startDate: e.startDate, endDate: e.endDate };
      })
    };

    return res.status(200).json({
      alumni: alumni,
      featuredDate: featured.featuredDate,
      isLive: isLive
    });
  } catch (err) {
    console.error('Public endpoint error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load Alumni of the Day' });
  }
});
