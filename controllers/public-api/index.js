'use strict'

var express = require('express');
var router = express.Router();

var rateLimit = require('express-rate-limit');
var { Op } = require('sequelize');

var { apiKeyAuth, hasPermission } = require('../../middleware/apiKeyAuth');
var { validate, alumniQueryRules } = require('../../middleware/validators');
var {
  sequelize,
  FeaturedAlumnus,
  User,
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
 *       403:
 *         description: Insufficient permissions
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

router.get('/alumni-of-the-day', apiKeyAuth, hasPermission('read:alumni_of_day'), apiKeyLimiter, async function(req, res) {
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

/**
 * @swagger
 * /api/alumni:
 *   get:
 *     summary: Browse verified alumni profiles
 *     description: >
 *       Returns a paginated list of public alumni profiles with optional filters
 *       for programme, graduation year, and industry sector.
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema:
 *           type: string
 *         description: Degree name contains this value
 *       - in: query
 *         name: graduationYear
 *         schema:
 *           type: integer
 *         description: Degree completion year
 *       - in: query
 *         name: industrySector
 *         schema:
 *           type: string
 *         description: Employment company/role contains this value
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, graduationYear]
 *           default: name
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *     responses:
 *       200:
 *         description: Paginated alumni list
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/alumni', apiKeyAuth, hasPermission('read:alumni'), apiKeyLimiter, alumniQueryRules, validate, async function(req, res) {
  var programme = req.query.programme ? String(req.query.programme).trim() : '';
  var graduationYear = req.query.graduationYear ? Number(req.query.graduationYear) : null;
  var industrySector = req.query.industrySector ? String(req.query.industrySector).trim() : '';
  var page = req.query.page ? Number(req.query.page) : 1;
  var limit = req.query.limit ? Number(req.query.limit) : 20;
  var sortBy = req.query.sortBy || 'name';
  var order = (req.query.order || 'ASC').toUpperCase();

  var degreeFilter = {};
  if (programme) {
    degreeFilter.name = { [Op.like]: '%' + programme + '%' };
  }
  if (graduationYear) {
    degreeFilter.completionDate = sequelize.where(
      sequelize.fn('YEAR', sequelize.col('Degrees.completionDate')),
      graduationYear
    );
  }

  var sectorFilter = industrySector
    ? {
        [Op.or]: [
          { company: { [Op.like]: '%' + industrySector + '%' } },
          { role: { [Op.like]: '%' + industrySector + '%' } }
        ]
      }
    : null;

  var orderClause = sortBy === 'graduationYear'
    ? [[Degree, 'completionDate', order]]
    : [['lastName', order], ['firstName', order]];

  try {
    var result = await Profile.findAndCountAll({
      attributes: { exclude: ['userId'] },
      include: [
        {
          model: User,
          attributes: ['id', 'role', 'isVerified', 'appearanceCount'],
          where: { role: 'alumnus', isVerified: true },
          required: true
        },
        {
          model: Degree,
          attributes: ['name', 'university', 'completionDate'],
          where: Object.keys(degreeFilter).length ? degreeFilter : undefined,
          required: Object.keys(degreeFilter).length > 0
        },
        { model: Certification, attributes: ['name', 'issuingBody', 'completionDate'] },
        { model: Licence, attributes: ['name', 'awardingBody', 'completionDate'] },
        { model: ProfessionalCourse, attributes: ['name', 'provider', 'completionDate'] },
        {
          model: Employment,
          attributes: ['company', 'role', 'startDate', 'endDate'],
          where: sectorFilter || undefined,
          required: !!sectorFilter
        }
      ],
      order: orderClause,
      limit: limit,
      offset: (page - 1) * limit,
      distinct: true
    });

    var totalPages = Math.ceil(result.count / limit);

    return res.json({
      success: true,
      data: {
        alumni: result.rows,
        pagination: {
          total: result.count,
          page: page,
          limit: limit,
          totalPages: totalPages
        },
        filters: {
          programme: programme || null,
          graduationYear: graduationYear || null,
          industrySector: industrySector || null
        }
      }
    });
  } catch (err) {
    console.error('Alumni browse error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load alumni list' });
  }
});
