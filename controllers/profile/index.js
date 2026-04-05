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

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get the authenticated alumnus's full profile
 *     description: Returns the profile with all related data (degrees, certifications, licences, professional courses, employment).
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Profile with all sub-resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
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

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update personal info (firstName, lastName, biography, linkedInUrl)
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               biography:
 *                 type: string
 *                 example: Full-stack engineer with cloud expertise.
 *               linkedInUrl:
 *                 type: string
 *                 example: https://linkedin.com/in/johndoe
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
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

/**
 * @swagger
 * /api/profile/image:
 *   post:
 *     summary: Upload a profile image
 *     description: Accepts JPEG/PNG up to 5 MB. Replaces any existing image.
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                       example: uploads/profiles/1_1712345678901.jpg
 *       400:
 *         description: No image file provided or invalid type/size
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
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

/**
 * @swagger
 * /api/profile/completion:
 *   get:
 *     summary: Get profile completion status
 *     description: Returns a breakdown of which profile fields are filled and whether the profile is complete.
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Completion breakdown
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
 *                     firstName:
 *                       type: boolean
 *                     lastName:
 *                       type: boolean
 *                     biography:
 *                       type: boolean
 *                     linkedInUrl:
 *                       type: boolean
 *                     profileImage:
 *                       type: boolean
 *                     hasDegree:
 *                       type: boolean
 *                     hasEmployment:
 *                       type: boolean
 *                     isComplete:
 *                       type: boolean
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
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

/**
 * @swagger
 * /api/profile/degrees:
 *   get:
 *     summary: List all degrees
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Array of degrees
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Degree'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   post:
 *     summary: Add a degree
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: BSc Computer Science
 *               university:
 *                 type: string
 *                 example: Eastminster University
 *               officialUrl:
 *                 type: string
 *                 example: https://www.eastminster.ac.uk/cs
 *               completionDate:
 *                 type: string
 *                 format: date
 *                 example: '2020-06-15'
 *     responses:
 *       201:
 *         description: Degree created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Degree'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/degrees/{id}:
 *   put:
 *     summary: Update a degree
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               university:
 *                 type: string
 *               officialUrl:
 *                 type: string
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Degree updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Degree'
 *       404:
 *         description: Degree not found or does not belong to user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   delete:
 *     summary: Delete a degree
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Degree deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: Degree not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/certifications:
 *   get:
 *     summary: List all certifications
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Array of certifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Certification'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   post:
 *     summary: Add a certification
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: AWS Solutions Architect
 *               issuingBody:
 *                 type: string
 *                 example: Amazon Web Services
 *               courseUrl:
 *                 type: string
 *                 example: https://aws.amazon.com/certification/
 *               completionDate:
 *                 type: string
 *                 format: date
 *                 example: '2022-04-18'
 *     responses:
 *       201:
 *         description: Certification created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Certification'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/certifications/{id}:
 *   put:
 *     summary: Update a certification
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               issuingBody:
 *                 type: string
 *               courseUrl:
 *                 type: string
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Certification updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Certification'
 *       404:
 *         description: Certification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   delete:
 *     summary: Delete a certification
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Certification deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: Certification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/licences:
 *   get:
 *     summary: List all licences
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Array of licences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Licence'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   post:
 *     summary: Add a licence
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Chartered IT Professional (CITP)
 *               awardingBody:
 *                 type: string
 *                 example: BCS
 *               licenceUrl:
 *                 type: string
 *                 example: https://www.bcs.org/
 *               completionDate:
 *                 type: string
 *                 format: date
 *                 example: '2022-01-15'
 *     responses:
 *       201:
 *         description: Licence created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Licence'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/licences/{id}:
 *   put:
 *     summary: Update a licence
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               awardingBody:
 *                 type: string
 *               licenceUrl:
 *                 type: string
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Licence updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Licence'
 *       404:
 *         description: Licence not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   delete:
 *     summary: Delete a licence
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Licence deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: Licence not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/courses:
 *   get:
 *     summary: List all professional courses
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Array of professional courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProfessionalCourse'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   post:
 *     summary: Add a professional course
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Machine Learning Specialization
 *               provider:
 *                 type: string
 *                 example: Coursera
 *               courseUrl:
 *                 type: string
 *                 example: https://www.coursera.org/
 *               completionDate:
 *                 type: string
 *                 format: date
 *                 example: '2023-05-08'
 *     responses:
 *       201:
 *         description: Professional course created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalCourse'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/courses/{id}:
 *   put:
 *     summary: Update a professional course
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               provider:
 *                 type: string
 *               courseUrl:
 *                 type: string
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Professional course updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalCourse'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   delete:
 *     summary: Delete a professional course
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Course deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/employment:
 *   get:
 *     summary: List all employment history
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Array of employment records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Employment'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   post:
 *     summary: Add an employment entry
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company:
 *                 type: string
 *                 example: Tech Corp
 *               role:
 *                 type: string
 *                 example: Software Engineer
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: '2020-07-01'
 *               endDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: null
 *                 description: null for current job
 *     responses:
 *       201:
 *         description: Employment entry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Employment'
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not an alumnus
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *
 * /api/profile/employment/{id}:
 *   put:
 *     summary: Update an employment entry
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company:
 *                 type: string
 *               role:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Employment entry updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Employment'
 *       404:
 *         description: Employment entry not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *   delete:
 *     summary: Delete an employment entry
 *     tags: [Profile]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Employment entry deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: Employment entry not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */

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
