'use strict'

var express = require('express');
var router = express.Router();
var { Op } = require('sequelize');
var { parse } = require('json2csv');
var PDFDocument = require('pdfkit');

var { apiKeyAuth, hasPermission } = require('../../middleware/apiKeyAuth');
var { analyticsLimiter, exportLimiter } = require('../../middleware/rateLimiter');
var { analyticsQueryRules, validate } = require('../../middleware/validators');
var {
  sequelize,
  User,
  Profile,
  Degree,
  Certification,
  ProfessionalCourse,
  Employment,
  FeaturedAlumnus
} = require('../../models');

exports.name = 'analytics';
exports.prefix = '/api/analytics';
exports.router = router;

var buildDegreeWhere = function(programme, graduationYear) {
  var where = {};

  if (programme) {
    where.name = { [Op.like]: '%' + programme + '%' };
  }

  if (graduationYear) {
    where.completionDate = sequelize.where(
      sequelize.fn('YEAR', sequelize.col('completionDate')),
      Number(graduationYear)
    );
  }

  return where;
};

var buildEmploymentWhere = function(industrySector) {
  if (!industrySector) {
    return null;
  }

  return {
    [Op.or]: [
      { company: { [Op.like]: '%' + industrySector + '%' } },
      { role: { [Op.like]: '%' + industrySector + '%' } }
    ]
  };
};

var getAnalyticsFilters = function(req) {
  return {
    programme: req.query.programme ? String(req.query.programme).trim() : '',
    graduationYear: req.query.graduationYear ? String(req.query.graduationYear).trim() : '',
    industrySector: req.query.industrySector ? String(req.query.industrySector).trim() : ''
  };
};

var buildExportDate = function() {
  return new Date().toISOString().slice(0, 10);
};

var getSkillsGapData = async function(filters) {
  var programme = filters.programme;
  var graduationYear = filters.graduationYear;
  var industrySector = filters.industrySector;
  var degreeWhere = buildDegreeWhere(programme, graduationYear);
  var hasDegreeFilter = !!programme || !!graduationYear;
  var employmentWhere = buildEmploymentWhere(industrySector);
  var profileInclude = [];

  if (hasDegreeFilter) {
    profileInclude.push({
      model: Degree,
      attributes: [],
      where: degreeWhere,
      required: true
    });
  }

  if (employmentWhere) {
    profileInclude.push({
      model: Employment,
      attributes: [],
      where: employmentWhere,
      required: true
    });
  }

  var includeForSkills = [{
    model: Profile,
    attributes: [],
    required: hasDegreeFilter || !!employmentWhere,
    include: profileInclude
  }];

  var certRows = await Certification.findAll({
    attributes: [
      'name',
      'issuingBody',
      [sequelize.fn('COUNT', sequelize.col('Certification.id')), 'count']
    ],
    include: includeForSkills,
    group: ['Certification.name', 'Certification.issuingBody'],
    order: [[sequelize.fn('COUNT', sequelize.col('Certification.id')), 'DESC']],
    limit: 20,
    raw: true
  });

  var courseRows = await ProfessionalCourse.findAll({
    attributes: [
      'name',
      'provider',
      [sequelize.fn('COUNT', sequelize.col('ProfessionalCourse.id')), 'count']
    ],
    include: includeForSkills,
    group: ['ProfessionalCourse.name', 'ProfessionalCourse.provider'],
    order: [[sequelize.fn('COUNT', sequelize.col('ProfessionalCourse.id')), 'DESC']],
    limit: 20,
    raw: true
  });

  var certifications = certRows.map(function(row) {
    return {
      name: row.name,
      issuingBody: row.issuingBody,
      count: parseInt(row.count, 10) || 0
    };
  });

  var professionalCourses = courseRows.map(function(row) {
    return {
      name: row.name,
      provider: row.provider,
      count: parseInt(row.count, 10) || 0
    };
  });

  var topSkillGaps = certifications
    .map(function(item) {
      return {
        skill: item.name,
        type: 'certification',
        source: item.issuingBody,
        count: item.count
      };
    })
    .concat(
      professionalCourses.map(function(item) {
        return {
          skill: item.name,
          type: 'course',
          source: item.provider,
          count: item.count
        };
      })
    )
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  return {
    certifications: certifications,
    professionalCourses: professionalCourses,
    topSkillGaps: topSkillGaps
  };
};

var getEmploymentBySectorData = async function(filters) {
  var profileNestedIncludes = buildNestedProfileIncludes(
    filters.programme,
    filters.graduationYear,
    filters.industrySector
  );
  var employmentWhere = buildEmploymentWhere(filters.industrySector);
  var includeProfile = [{
    model: Profile,
    attributes: [],
    required: profileNestedIncludes.length > 0,
    include: profileNestedIncludes
  }];

  var groupedRows = await Employment.findAll({
    attributes: [
      ['company', 'sector'],
      [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('Profile.userId'))), 'alumniCount']
    ],
    where: employmentWhere || undefined,
    include: includeProfile,
    group: ['Employment.company'],
    order: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('Profile.userId'))), 'DESC']],
    raw: true
  });

  var totalDistinctUsers = await Employment.count({
    where: employmentWhere || undefined,
    include: includeProfile,
    distinct: true,
    col: 'profileId'
  });

  return groupedRows.map(function(row) {
    var alumniCount = parseInt(row.alumniCount, 10) || 0;
    var percentage = totalDistinctUsers > 0
      ? Math.round((alumniCount / totalDistinctUsers) * 1000) / 10
      : 0;
    return {
      sector: row.sector,
      alumniCount: alumniCount,
      percentage: percentage
    };
  });
};

var buildNestedProfileIncludes = function(programme, graduationYear, industrySector) {
  var includes = [];
  var degreeWhere = buildDegreeWhere(programme, graduationYear);
  var employmentWhere = buildEmploymentWhere(industrySector);

  if (programme || graduationYear) {
    includes.push({
      model: Degree,
      attributes: [],
      where: degreeWhere,
      required: true
    });
  }

  if (employmentWhere) {
    includes.push({
      model: Employment,
      attributes: [],
      where: employmentWhere,
      required: true
    });
  }

  return includes;
};

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get high-level analytics overview
 *     description: Returns top-level alumni and profile intelligence metrics.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview metrics
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
 *                     totalAlumni:
 *                       type: integer
 *                     profilesComplete:
 *                       type: integer
 *                     totalDegrees:
 *                       type: integer
 *                     totalCertifications:
 *                       type: integer
 *                     totalEmploymentRecords:
 *                       type: integer
 *                     featuredAlumniTotal:
 *                       type: integer
 *                     mostRecentFeatured:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         firstName:
 *                           type: string
 *                           nullable: true
 *                         lastName:
 *                           type: string
 *                           nullable: true
 *                         featuredDate:
 *                           type: string
 *                           format: date
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
router.get('/overview', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  try {
    var results = await Promise.all([
      User.count({ where: { role: 'alumnus', isVerified: true } }),
      Profile.count({ where: { profileComplete: true } }),
      Degree.count(),
      Certification.count(),
      Employment.count(),
      FeaturedAlumnus.count(),
      FeaturedAlumnus.findOne({
        order: [['featuredDate', 'DESC']],
        include: [{
          model: Profile,
          attributes: ['firstName', 'lastName'],
          required: false
        }]
      })
    ]);

    var totalAlumni = results[0];
    var profilesComplete = results[1];
    var totalDegrees = results[2];
    var totalCertifications = results[3];
    var totalEmploymentRecords = results[4];
    var featuredAlumniTotal = results[5];
    var mostRecentFeaturedRow = results[6];

    var mostRecentFeatured = mostRecentFeaturedRow
      ? {
          firstName: mostRecentFeaturedRow.Profile ? mostRecentFeaturedRow.Profile.firstName : null,
          lastName: mostRecentFeaturedRow.Profile ? mostRecentFeaturedRow.Profile.lastName : null,
          featuredDate: mostRecentFeaturedRow.featuredDate
        }
      : null;

    res.set('Cache-Control', 'public, max-age=300');

    return res.json({
      success: true,
      data: {
        totalAlumni: totalAlumni,
        profilesComplete: profilesComplete,
        totalDegrees: totalDegrees,
        totalCertifications: totalCertifications,
        totalEmploymentRecords: totalEmploymentRecords,
        featuredAlumniTotal: featuredAlumniTotal,
        mostRecentFeatured: mostRecentFeatured
      }
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load analytics overview' });
  }
});

/**
 * @swagger
 * /api/analytics/skills-gap:
 *   get:
 *     summary: Get top certification and course skill gaps
 *     description: Returns grouped frequencies for certifications and professional courses.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema:
 *           type: string
 *         description: Degree programme name filter (contains match)
 *       - in: query
 *         name: graduationYear
 *         schema:
 *           type: integer
 *         description: Degree completion year filter
 *       - in: query
 *         name: industrySector
 *         schema:
 *           type: string
 *         description: Employment company/role filter (contains match)
 *     responses:
 *       200:
 *         description: Skills gap frequencies
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
 *                     certifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           issuingBody: { type: string, nullable: true }
 *                           count: { type: integer }
 *                     professionalCourses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           provider: { type: string, nullable: true }
 *                           count: { type: integer }
 *                     topSkillGaps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           skill: { type: string }
 *                           type: { type: string, enum: [certification, course] }
 *                           source: { type: string, nullable: true }
 *                           count: { type: integer }
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
router.get('/skills-gap', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);

  try {
    var data = await getSkillsGapData(filters);

    res.set('Cache-Control', 'public, max-age=300');

    return res.json({
      success: true,
      data: data
    });
  } catch (err) {
    console.error('Analytics skills-gap error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load skills gap analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/employment-by-sector:
 *   get:
 *     summary: Get employment grouped by sector proxy
 *     description: Uses company as a sector proxy and returns alumni counts with percentages.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Employment grouped by sector proxy
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/employment-by-sector', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);

  try {
    var sectors = await getEmploymentBySectorData(filters);

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, data: { sectors: sectors } });
  } catch (err) {
    console.error('Analytics employment-by-sector error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load employment by sector analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/job-titles:
 *   get:
 *     summary: Get top job titles
 *     description: Returns the most common employment roles.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job title frequencies
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/job-titles', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);
  var profileNestedIncludes = buildNestedProfileIncludes(
    filters.programme,
    filters.graduationYear,
    filters.industrySector
  );
  var employmentWhere = buildEmploymentWhere(filters.industrySector);

  try {
    var rows = await Employment.findAll({
      attributes: [
        ['role', 'title'],
        [sequelize.fn('COUNT', sequelize.col('Employment.id')), 'count']
      ],
      where: employmentWhere || undefined,
      include: [{
        model: Profile,
        attributes: [],
        required: profileNestedIncludes.length > 0,
        include: profileNestedIncludes
      }],
      group: ['Employment.role'],
      order: [[sequelize.fn('COUNT', sequelize.col('Employment.id')), 'DESC']],
      limit: 20,
      raw: true
    });

    var jobTitles = rows.map(function(row) {
      return {
        title: row.title,
        count: parseInt(row.count, 10) || 0
      };
    });

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, data: { jobTitles: jobTitles } });
  } catch (err) {
    console.error('Analytics job-titles error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load job title analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/top-employers:
 *   get:
 *     summary: Get top employers
 *     description: Returns ranked employers by alumni count.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of employers to return (default 10)
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Top employers
 *       400:
 *         description: Invalid query parameter
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/top-employers', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);
  var parsedLimit = req.query.limit === undefined ? 10 : Number(req.query.limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    return res.status(400).json({
      success: false,
      message: 'limit must be an integer between 1 and 50'
    });
  }

  var profileNestedIncludes = buildNestedProfileIncludes(
    filters.programme,
    filters.graduationYear,
    filters.industrySector
  );
  var employmentWhere = buildEmploymentWhere(filters.industrySector);

  try {
    var rows = await Employment.findAll({
      attributes: [
        'company',
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('Profile.userId'))), 'alumniCount']
      ],
      where: employmentWhere || undefined,
      include: [{
        model: Profile,
        attributes: [],
        required: profileNestedIncludes.length > 0,
        include: profileNestedIncludes
      }],
      group: ['Employment.company'],
      order: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('Profile.userId'))), 'DESC']],
      limit: parsedLimit,
      raw: true
    });

    var employers = rows.map(function(row) {
      return {
        company: row.company,
        alumniCount: parseInt(row.alumniCount, 10) || 0
      };
    });

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, data: { employers: employers } });
  } catch (err) {
    console.error('Analytics top-employers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load top employers analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/career-trends:
 *   get:
 *     summary: Get monthly career trends
 *     description: Returns 12-month trend lines for certifications and featured alumni.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Monthly trend data
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/career-trends', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);
  var since12Months = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  var profileNestedIncludes = buildNestedProfileIncludes(
    filters.programme,
    filters.graduationYear,
    filters.industrySector
  );

  try {
    var certRows = await Certification.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('Certification.createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('Certification.id')), 'count']
      ],
      where: { createdAt: { [Op.gte]: since12Months } },
      include: [{
        model: Profile,
        attributes: [],
        required: profileNestedIncludes.length > 0,
        include: profileNestedIncludes
      }],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('Certification.createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('Certification.createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    var featuredRows = await FeaturedAlumnus.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('FeaturedAlumnus.createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('FeaturedAlumnus.id')), 'count']
      ],
      where: { createdAt: { [Op.gte]: since12Months } },
      include: [{
        model: Profile,
        attributes: [],
        required: profileNestedIncludes.length > 0,
        include: profileNestedIncludes
      }],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('FeaturedAlumnus.createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('FeaturedAlumnus.createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    var certificationsByMonth = certRows.map(function(row) {
      return { month: row.month, count: parseInt(row.count, 10) || 0 };
    });
    var featuredAlumniByMonth = featuredRows.map(function(row) {
      return { month: row.month, count: parseInt(row.count, 10) || 0 };
    });

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      success: true,
      data: {
        certificationsByMonth: certificationsByMonth,
        featuredAlumniByMonth: featuredAlumniByMonth
      }
    });
  } catch (err) {
    console.error('Analytics career-trends error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load career trends analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/profile-completion-rate:
 *   get:
 *     summary: Get profile completion rate breakdown
 *     description: Returns complete/incomplete totals, rate, and field-level breakdown.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Profile completion metrics
 *       401:
 *         description: Missing, invalid, or revoked API key
 *       403:
 *         description: Insufficient permissions
 *       429:
 *         description: API rate limit exceeded
 *       500:
 *         description: Server error
 */
router.get('/profile-completion-rate', apiKeyAuth, hasPermission('read:analytics'), analyticsQueryRules, validate, analyticsLimiter, async function(req, res) {
  var filters = getAnalyticsFilters(req);
  var profileNestedIncludes = buildNestedProfileIncludes(
    filters.programme,
    filters.graduationYear,
    filters.industrySector
  );

  var baseInclude = [{
    model: User,
    attributes: [],
    where: { role: 'alumnus', isVerified: true },
    required: true
  }].concat(profileNestedIncludes);

  var countProfiles = function(where, extraInclude) {
    return Profile.count({
      where: where || undefined,
      include: baseInclude.concat(extraInclude || []),
      distinct: true,
      col: 'id'
    });
  };

  try {
    var results = await Promise.all([
      countProfiles(),
      countProfiles({ profileComplete: true }),
      countProfiles({ profileComplete: false }),
      countProfiles({ firstName: { [Op.ne]: null } }),
      countProfiles({ lastName: { [Op.ne]: null } }),
      countProfiles({ biography: { [Op.ne]: null } }),
      countProfiles({ linkedInUrl: { [Op.ne]: null } }),
      countProfiles({ profileImagePath: { [Op.ne]: null } }),
      countProfiles({}, [{ model: Degree, attributes: [], required: true }]),
      countProfiles({}, [{ model: Employment, attributes: [], required: true }])
    ]);

    var total = results[0];
    var complete = results[1];
    var incomplete = results[2];
    var completionRate = total > 0 ? Math.round((complete / total) * 1000) / 10 : 0;

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      success: true,
      data: {
        complete: complete,
        incomplete: incomplete,
        completionRate: completionRate,
        breakdown: {
          hasFirstName: results[3],
          hasLastName: results[4],
          hasBio: results[5],
          hasLinkedIn: results[6],
          hasImage: results[7],
          hasDegree: results[8],
          hasEmployment: results[9]
        }
      }
    });
  } catch (err) {
    console.error('Analytics profile-completion-rate error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load profile completion analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/export/skills-gap:
 *   get:
 *     summary: Export skills gap data as CSV or PDF
 *     description: Downloads certifications and professional courses frequency data. Response is a binary file, not JSON.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: Output format
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: File download (text/csv or application/pdf)
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Invalid format parameter
 *       401:
 *         description: Missing or invalid API key
 *       403:
 *         description: Insufficient permissions. Required scope: read:analytics
 *       429:
 *         description: Export rate limit exceeded (10 per 15 min)
 *       500:
 *         description: Server error
 */
router.get('/export/skills-gap', apiKeyAuth, hasPermission('read:analytics'), exportLimiter, async function(req, res) {
  var format = String(req.query.format || '').toLowerCase();

  if (format !== 'csv' && format !== 'pdf') {
    return res.status(400).json({ success: false, message: 'format must be csv or pdf' });
  }

  try {
    var data = await getSkillsGapData(getAnalyticsFilters(req));
    var certifications = data.certifications;
    var courses = data.professionalCourses;
    var exportDate = buildExportDate();

    if (format === 'csv') {
      var fields = ['type', 'name', 'source', 'count'];
      var rows = certifications.map(function(item) {
        return { type: 'certification', name: item.name, source: item.issuingBody || '', count: item.count };
      }).concat(
        courses.map(function(item) {
          return { type: 'course', name: item.name, source: item.provider || '', count: item.count };
        })
      );
      var csv = parse(rows, { fields: fields });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="skills-gap-' + exportDate + '.csv"');
      return res.send(csv);
    }

    var doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="skills-gap-' + exportDate + '.pdf"');
    doc.pipe(res);
    doc.fontSize(18).text('Skills Gap Analysis Report', { align: 'center' });
    doc.fontSize(10).text('Generated: ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('Top Certifications');
    doc.moveDown(0.5);
    certifications.forEach(function(c, i) {
      doc.fontSize(10).text((i + 1) + '. ' + c.name + ' (' + (c.issuingBody || 'Unknown') + ') - ' + c.count + ' alumni');
    });
    doc.moveDown();
    doc.fontSize(14).text('Top Professional Courses');
    doc.moveDown(0.5);
    courses.forEach(function(c, i) {
      doc.fontSize(10).text((i + 1) + '. ' + c.name + ' (' + (c.provider || 'Unknown') + ') - ' + c.count + ' alumni');
    });
    doc.end();
  } catch (err) {
    console.error('Analytics export skills-gap error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export skills gap analytics' });
  }
});

/**
 * @swagger
 * /api/analytics/export/employment:
 *   get:
 *     summary: Export employment-by-sector data as CSV or PDF
 *     description: Downloads employment sector breakdown. Response is a binary file, not JSON.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: Output format
 *       - in: query
 *         name: programme
 *         schema: { type: string }
 *       - in: query
 *         name: graduationYear
 *         schema: { type: integer }
 *       - in: query
 *         name: industrySector
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: File download (text/csv or application/pdf)
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Invalid format parameter
 *       401:
 *         description: Missing or invalid API key
 *       403:
 *         description: Insufficient permissions. Required scope: read:analytics
 *       429:
 *         description: Export rate limit exceeded (10 per 15 min)
 *       500:
 *         description: Server error
 */
router.get('/export/employment', apiKeyAuth, hasPermission('read:analytics'), exportLimiter, async function(req, res) {
  var format = String(req.query.format || '').toLowerCase();

  if (format !== 'csv' && format !== 'pdf') {
    return res.status(400).json({ success: false, message: 'format must be csv or pdf' });
  }

  try {
    var sectors = await getEmploymentBySectorData(getAnalyticsFilters(req));
    var exportDate = buildExportDate();

    if (format === 'csv') {
      var fields = ['sector', 'alumniCount', 'percentage'];
      var csv = parse(sectors, { fields: fields });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employment-by-sector-' + exportDate + '.csv"');
      return res.send(csv);
    }

    var doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="employment-by-sector-' + exportDate + '.pdf"');
    doc.pipe(res);
    doc.fontSize(18).text('Employment by Sector Report', { align: 'center' });
    doc.fontSize(10).text('Generated: ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown();
    sectors.forEach(function(item, i) {
      doc
        .fontSize(10)
        .text(
          (i + 1) + '. ' + (item.sector || 'Unknown') +
          ' - ' + item.alumniCount + ' alumni (' + item.percentage + '%)'
        );
    });
    doc.end();
  } catch (err) {
    console.error('Analytics export employment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export employment analytics' });
  }
});
