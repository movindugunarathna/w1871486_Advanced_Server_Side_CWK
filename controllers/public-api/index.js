'use strict'

var express = require('express');
var router = express.Router();

var rateLimit = require('express-rate-limit');
var { Op } = require('sequelize');

var { apiKeyAuth, hasPermission } = require('../../middleware/apiKeyAuth');
var { alumniQueryRules, validate } = require('../../middleware/validators');
var {
  sequelize,
  User,
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
 *     summary: Browse alumni profiles
 *     description: >
 *       Returns a paginated, filterable list of verified alumni profiles with
 *       degrees, certifications, licences, professional courses, and employment.
 *       Requires a valid API key with read:alumni scope.
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema:
 *           type: string
 *         description: Filter by degree programme name (contains match)
 *       - in: query
 *         name: graduationYear
 *         schema:
 *           type: integer
 *         description: Filter by degree completion year
 *       - in: query
 *         name: industrySector
 *         schema:
 *           type: string
 *         description: Filter by employment company or role (contains match)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Results per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, graduationYear]
 *           default: name
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated alumni list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     alumni:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Profile'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                     filters:
 *                       type: object
 *                       properties:
 *                         programme:
 *                           type: string
 *                         graduationYear:
 *                           type: string
 *                         industrySector:
 *                           type: string
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
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
 *         description: API rate limit exceeded
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
router.get('/alumni', apiKeyAuth, hasPermission('read:alumni'), alumniQueryRules, validate, apiKeyLimiter, async function(req, res) {
  try {
    var programme = req.query.programme ? String(req.query.programme).trim() : '';
    var graduationYear = req.query.graduationYear || '';
    var industrySector = req.query.industrySector ? String(req.query.industrySector).trim() : '';
    var parsedPage = req.query.page || 1;
    var parsedLimit = req.query.limit || 20;
    var sortBy = req.query.sortBy || 'name';
    var sortOrder = req.query.order || 'ASC';

    var degreeFilter = null;
    if (programme || graduationYear) {
      degreeFilter = {};
      if (programme) {
        degreeFilter.name = { [Op.like]: '%' + programme + '%' };
      }
      if (graduationYear) {
        degreeFilter.completionDate = sequelize.where(
          sequelize.fn('YEAR', sequelize.col('Degrees.completionDate')),
          Number(graduationYear)
        );
      }
    }

    var sectorFilter = null;
    if (industrySector) {
      sectorFilter = {
        [Op.or]: [
          { company: { [Op.like]: '%' + industrySector + '%' } },
          { role: { [Op.like]: '%' + industrySector + '%' } }
        ]
      };
    }

    var orderClause;
    if (sortBy === 'graduationYear') {
      orderClause = [[Degree, 'completionDate', sortOrder]];
    } else {
      orderClause = [['firstName', sortOrder], ['lastName', sortOrder]];
    }

    var result = await Profile.findAndCountAll({
      include: [
        {
          model: User,
          attributes: ['role', 'isVerified', 'appearanceCount'],
          where: { role: 'alumnus', isVerified: true }
        },
        {
          model: Degree,
          attributes: ['name', 'university', 'completionDate'],
          where: degreeFilter || undefined,
          required: !!degreeFilter
        },
        {
          model: Certification,
          attributes: ['name', 'issuingBody', 'completionDate']
        },
        {
          model: Licence,
          attributes: ['name', 'awardingBody', 'completionDate']
        },
        {
          model: ProfessionalCourse,
          attributes: ['name', 'provider', 'completionDate']
        },
        {
          model: Employment,
          attributes: ['company', 'role', 'startDate', 'endDate'],
          where: sectorFilter || undefined,
          required: !!sectorFilter
        }
      ],
      attributes: { exclude: ['userId'] },
      order: orderClause,
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      distinct: true
    });

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      success: true,
      data: {
        alumni: result.rows,
        pagination: {
          total: result.count,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(result.count / parsedLimit)
        },
        filters: {
          programme: programme,
          graduationYear: graduationYear,
          industrySector: industrySector
        }
      }
    });
  } catch (err) {
    console.error('Alumni browse error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load alumni list' });
  }
});

/**
 * @swagger
 * /api/alumni/{userId}:
 *   get:
 *     summary: Get a single alumni profile
 *     description: >
 *       Returns a single verified alumni profile by userId, including all
 *       associations and featured alumnus history. Requires read:alumni scope.
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user ID of the alumnus
 *     responses:
 *       200:
 *         description: Single alumni profile with featured history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile:
 *                       $ref: '#/components/schemas/Profile'
 *                     additionalData:
 *                       type: object
 *                       properties:
 *                         featuredCount:
 *                           type: integer
 *                         lastFeatured:
 *                           type: string
 *                           format: date
 *                           nullable: true
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
 *       404:
 *         description: Alumni not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       429:
 *         description: API rate limit exceeded
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
router.get('/alumni/:userId', apiKeyAuth, hasPermission('read:alumni'), apiKeyLimiter, async function(req, res) {
  try {
    var userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(404).json({ success: false, message: 'Alumni not found' });
    }

    var profile = await Profile.findOne({
      where: { userId: userId },
      include: [
        {
          model: User,
          attributes: ['role', 'isVerified', 'appearanceCount'],
          where: { role: 'alumnus', isVerified: true }
        },
        {
          model: Degree,
          attributes: ['name', 'university', 'completionDate']
        },
        {
          model: Certification,
          attributes: ['name', 'issuingBody', 'completionDate']
        },
        {
          model: Licence,
          attributes: ['name', 'awardingBody', 'completionDate']
        },
        {
          model: ProfessionalCourse,
          attributes: ['name', 'provider', 'completionDate']
        },
        {
          model: Employment,
          attributes: ['company', 'role', 'startDate', 'endDate']
        }
      ],
      attributes: { exclude: ['userId'] }
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Alumni not found' });
    }

    var featuredCount = await FeaturedAlumnus.count({ where: { userId: userId } });

    var lastFeaturedRow = await FeaturedAlumnus.findOne({
      where: { userId: userId },
      order: [['featuredDate', 'DESC']],
      attributes: ['featuredDate']
    });

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      success: true,
      data: {
        profile: profile,
        additionalData: {
          featuredCount: featuredCount,
          lastFeatured: lastFeaturedRow ? lastFeaturedRow.featuredDate : null
        }
      }
    });
  } catch (err) {
    console.error('Alumni detail error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load alumni profile' });
  }
});
