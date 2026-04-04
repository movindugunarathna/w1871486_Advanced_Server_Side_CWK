'use strict'

var express = require('express');
var router = express.Router();
var path = require('node:path');
var fs = require('node:fs');

var { isAlumnus } = require('../../middleware/auth');
var { profileRules, validate } = require('../../middleware/validators');
var upload = require('../../middleware/upload');
var { Profile, Degree, Certification, Licence, ProfessionalCourse, Employment } = require('../../models');

exports.name = 'profile';
exports.prefix = '/api/profile';
exports.router = router;

// All profile routes require alumnus role
router.use(isAlumnus);

// ─── Helpers ───

function getProfile(userId) {
  return Profile.findOne({
    where: { userId: userId },
    include: [Degree, Certification, Licence, ProfessionalCourse, Employment]
  });
}

function checkCompletion(profile) {
  var hasDegree = profile.Degrees && profile.Degrees.length > 0;
  var hasEmployment = profile.Employments && profile.Employments.length > 0;
  return {
    firstName: !!profile.firstName,
    lastName: !!profile.lastName,
    biography: !!profile.biography,
    linkedInUrl: !!profile.linkedInUrl,
    profileImage: !!profile.profileImagePath,
    hasDegree: hasDegree,
    hasEmployment: hasEmployment,
    isComplete: !!profile.firstName && !!profile.lastName && !!profile.biography &&
                !!profile.linkedInUrl && !!profile.profileImagePath && hasDegree && hasEmployment
  };
}

// ─── Profile CRUD ───

// GET /api/profile
router.get('/', function(req, res) {
  getProfile(req.session.userId)
    .then(function(profile) {
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }
      res.json({ success: true, data: profile });
    })
    .catch(function(err) {
      console.error('Get profile error:', err);
      res.status(500).json({ success: false, message: 'Failed to load profile' });
    });
});

// PUT /api/profile
router.put('/', profileRules, validate, function(req, res) {
  Profile.findOne({ where: { userId: req.session.userId } })
    .then(function(profile) {
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      var updates = {};
      if (req.body.firstName !== undefined) updates.firstName = req.body.firstName;
      if (req.body.lastName !== undefined) updates.lastName = req.body.lastName;
      if (req.body.biography !== undefined) updates.biography = req.body.biography;
      if (req.body.linkedInUrl !== undefined) updates.linkedInUrl = req.body.linkedInUrl;

      return profile.update(updates).then(function(updated) {
        return getProfile(req.session.userId);
      }).then(function(full) {
        var comp = checkCompletion(full);
        return full.update({ profileComplete: comp.isComplete }).then(function() {
          res.json({ success: true, message: 'Profile updated', data: full });
        });
      });
    })
    .catch(function(err) {
      console.error('Update profile error:', err);
      res.status(500).json({ success: false, message: 'Failed to update profile' });
    });
});

// POST /api/profile/image
router.post('/image', upload.single('image'), function(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  Profile.findOne({ where: { userId: req.session.userId } })
    .then(function(profile) {
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      // Delete old image if it exists
      if (profile.profileImagePath) {
        var oldPath = path.join(__dirname, '../../', profile.profileImagePath);
        fs.unlink(oldPath, function() {});
      }

      var imagePath = 'uploads/profiles/' + req.file.filename;
      return profile.update({ profileImagePath: imagePath }).then(function() {
        return getProfile(req.session.userId);
      }).then(function(full) {
        var comp = checkCompletion(full);
        return full.update({ profileComplete: comp.isComplete });
      }).then(function() {
        res.json({ success: true, message: 'Profile image uploaded', data: { path: imagePath } });
      });
    })
    .catch(function(err) {
      console.error('Upload image error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload image' });
    });
});

// GET /api/profile/completion
router.get('/completion', function(req, res) {
  getProfile(req.session.userId)
    .then(function(profile) {
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }
      var comp = checkCompletion(profile);
      res.json({ success: true, data: comp });
    })
    .catch(function(err) {
      console.error('Completion check error:', err);
      res.status(500).json({ success: false, message: 'Failed to check completion' });
    });
});

// ─── Generic sub-resource CRUD factory ───

var subResources = {
  degrees: { model: Degree, label: 'Degree', fields: ['name', 'university', 'officialUrl', 'completionDate'] },
  certifications: { model: Certification, label: 'Certification', fields: ['name', 'issuingBody', 'courseUrl', 'completionDate'] },
  licences: { model: Licence, label: 'Licence', fields: ['name', 'awardingBody', 'licenceUrl', 'completionDate'] },
  courses: { model: ProfessionalCourse, label: 'Professional Course', fields: ['name', 'provider', 'courseUrl', 'completionDate'] },
  employment: { model: Employment, label: 'Employment', fields: ['company', 'role', 'startDate', 'endDate'] }
};

Object.keys(subResources).forEach(function(section) {
  var config = subResources[section];
  var Model = config.model;

  // GET /api/profile/:section
  router.get('/' + section, function(req, res) {
    Profile.findOne({ where: { userId: req.session.userId } })
      .then(function(profile) {
        if (!profile) {
          return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        return Model.findAll({ where: { profileId: profile.id }, order: [['createdAt', 'DESC']] });
      })
      .then(function(items) {
        res.json({ success: true, data: items });
      })
      .catch(function(err) {
        console.error('Get ' + section + ' error:', err);
        res.status(500).json({ success: false, message: 'Failed to load ' + section });
      });
  });

  // POST /api/profile/:section
  router.post('/' + section, function(req, res) {
    Profile.findOne({ where: { userId: req.session.userId } })
      .then(function(profile) {
        if (!profile) {
          return res.status(404).json({ success: false, message: 'Profile not found' });
        }

        var data = { profileId: profile.id };
        config.fields.forEach(function(field) {
          if (req.body[field] !== undefined) data[field] = req.body[field] || null;
        });

        return Model.create(data).then(function(item) {
          return getProfile(req.session.userId).then(function(full) {
            var comp = checkCompletion(full);
            return full.update({ profileComplete: comp.isComplete });
          }).then(function() {
            res.status(201).json({ success: true, message: config.label + ' added', data: item });
          });
        });
      })
      .catch(function(err) {
        console.error('Create ' + section + ' error:', err);
        res.status(500).json({ success: false, message: 'Failed to create ' + config.label });
      });
  });

  // PUT /api/profile/:section/:id
  router.put('/' + section + '/:id', function(req, res) {
    Profile.findOne({ where: { userId: req.session.userId } })
      .then(function(profile) {
        if (!profile) {
          return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        return Model.findOne({ where: { id: req.params.id, profileId: profile.id } });
      })
      .then(function(item) {
        if (!item) {
          return res.status(404).json({ success: false, message: config.label + ' not found' });
        }

        var updates = {};
        config.fields.forEach(function(field) {
          if (req.body[field] !== undefined) updates[field] = req.body[field] || null;
        });

        return item.update(updates).then(function(updated) {
          res.json({ success: true, message: config.label + ' updated', data: updated });
        });
      })
      .catch(function(err) {
        console.error('Update ' + section + ' error:', err);
        res.status(500).json({ success: false, message: 'Failed to update ' + config.label });
      });
  });

  // DELETE /api/profile/:section/:id
  router.delete('/' + section + '/:id', function(req, res) {
    Profile.findOne({ where: { userId: req.session.userId } })
      .then(function(profile) {
        if (!profile) {
          return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        return Model.findOne({ where: { id: req.params.id, profileId: profile.id } });
      })
      .then(function(item) {
        if (!item) {
          return res.status(404).json({ success: false, message: config.label + ' not found' });
        }
        return item.destroy().then(function() {
          return getProfile(req.session.userId).then(function(full) {
            var comp = checkCompletion(full);
            return full.update({ profileComplete: comp.isComplete });
          }).then(function() {
            res.json({ success: true, message: config.label + ' deleted' });
          });
        });
      })
      .catch(function(err) {
        console.error('Delete ' + section + ' error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete ' + config.label });
      });
  });
});
