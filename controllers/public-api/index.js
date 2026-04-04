'use strict'

var express = require('express');
var router = express.Router();

var rateLimit = require('express-rate-limit');

var apiKeyAuth = require('../../middleware/apiKeyAuth');
var {
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateOnlyLocal(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function getTodayDateOnly() {
  return toDateOnlyLocal(new Date());
}

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

// GET /api/alumni-of-the-day
router.get('/alumni-of-the-day', apiKeyAuth, apiKeyLimiter, async function(req, res) {
  var todayDateOnly = getTodayDateOnly();

  try {
    var featured = await FeaturedAlumnus.findOne({
      where: { featuredDate: todayDateOnly },
      include: [{
        model: Profile,
        include: [Degree, Certification, Licence, ProfessionalCourse, Employment]
      }]
    });

    // Cache-Control header (1 hour)
    res.set('Cache-Control', 'max-age=3600');

    if (!featured || !featured.Profile) {
      return res.status(200).json({ featured: null, message: 'No Alumni of the Day today.' });
    }

    var p = featured.Profile;

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
      isLive: true
    });
  } catch (err) {
    console.error('Public endpoint error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load Alumni of the Day' });
  }
});
