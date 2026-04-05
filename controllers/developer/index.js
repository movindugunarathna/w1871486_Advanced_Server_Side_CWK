'use strict'

var express = require('express');
var router = express.Router();

var crypto = require('crypto');
var { isDeveloper } = require('../../middleware/auth');
var { validate, apiKeyCreateRules } = require('../../middleware/validators');
var { ApiKey, ApiKeyUsageLog, sequelize } = require('../../models');
var { Op } = require('sequelize');

exports.name = 'developer';
exports.prefix = '/api/developer';
exports.router = router;

// All routes require isDeveloper middleware.
router.use(isDeveloper);

/**
 * @swagger
 * /api/developer/api-keys:
 *   post:
 *     summary: Generate a new API key
 *     description: Creates a cryptographically random API key. The full key value is returned only once in this response.
 *     tags: [Developer]
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
 *                 example: My AR App
 *                 description: A friendly label for this key
 *     responses:
 *       201:
 *         description: API key created — full key shown once
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
 *                   example: API key generated
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     key:
 *                       type: string
 *                       example: a1b2c3d4e5f6...
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not a developer account
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
router.post('/api-keys', apiKeyCreateRules, validate, async function(req, res) {
  var developerId = req.session.userId;
  var name = req.body.name;

  try {
    var fullKey = crypto.randomBytes(32).toString('hex');

    var created = await ApiKey.create({
      developerId: developerId,
      key: fullKey,
      name: name,
      isRevoked: false
    });

    // Only time the full key is returned.
    res.status(201).json({
      success: true,
      message: 'API key generated',
      data: { id: created.id, key: fullKey }
    });
  } catch (err) {
    console.error('Create api key error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate API key' });
  }
});

/**
 * @swagger
 * /api/developer/api-keys:
 *   get:
 *     summary: List all API keys for this developer
 *     description: Returns metadata and a prefix (first 8 chars) for each key. Full key values are never returned.
 *     tags: [Developer]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       keyPrefix:
 *                         type: string
 *                         example: a1b2c3d4...
 *                       isRevoked:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Not signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Not a developer account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.get('/api-keys', async function(req, res) {
  var developerId = req.session.userId;

  try {
    // Return only prefix + metadata; never expose full key values.
    var rows = await ApiKey.findAll({
      where: { developerId: developerId },
      attributes: [
        'id',
        'name',
        'isRevoked',
        'createdAt',
        [sequelize.fn('LEFT', sequelize.col('key'), 8), 'keyPrefix8']
      ],
      raw: true
    });

    var keys = rows.map(function(r) {
      return {
        id: r.id,
        name: r.name,
        keyPrefix: (r.keyPrefix8 || '') + '...',
        isRevoked: r.isRevoked,
        createdAt: r.createdAt
      };
    });

    res.json({ success: true, data: keys });
  } catch (err) {
    console.error('List api keys error:', err);
    res.status(500).json({ success: false, message: 'Failed to load API keys' });
  }
});

/**
 * @swagger
 * /api/developer/api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Sets isRevoked to true. The key can no longer authenticate requests.
 *     tags: [Developer]
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
 *         description: Key revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       404:
 *         description: API key not found
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
 *         description: Not a developer account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.delete('/api-keys/:id', async function(req, res) {
  var developerId = req.session.userId;
  var id = req.params.id;

  try {
    var keyRow = await ApiKey.findOne({ where: { id: id, developerId: developerId } });
    if (!keyRow) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    await keyRow.update({ isRevoked: true });
    res.json({ success: true, message: 'Key revoked.' });
  } catch (err) {
    console.error('Revoke api key error:', err);
    res.status(500).json({ success: false, message: 'Failed to revoke API key' });
  }
});

/**
 * @swagger
 * /api/developer/api-keys/{id}/stats:
 *   get:
 *     summary: Get usage statistics for an API key
 *     description: Returns total requests, last 7 days count, 20 most recent requests, and an endpoint breakdown.
 *     tags: [Developer]
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
 *         description: Usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyName:
 *                       type: string
 *                     totalRequests:
 *                       type: integer
 *                     last7Days:
 *                       type: integer
 *                     recentRequests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           endpoint:
 *                             type: string
 *                           method:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           ipAddress:
 *                             type: string
 *                     endpointBreakdown:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                       example:
 *                         GET /api/alumni-of-the-day: 145
 *       404:
 *         description: API key not found
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
 *         description: Not a developer account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
router.get('/api-keys/:id/stats', async function(req, res) {
  var developerId = req.session.userId;
  var id = req.params.id;
  var since7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    var keyRow = await ApiKey.findOne({ where: { id: id, developerId: developerId } });
    if (!keyRow) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    var totalRequests = await ApiKeyUsageLog.count({ where: { apiKeyId: keyRow.id } });
    var last7Days = await ApiKeyUsageLog.count({
      where: { apiKeyId: keyRow.id, timestamp: { [Op.gte]: since7Days } }
    });

    var recentRequests = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: keyRow.id },
      order: [['timestamp', 'DESC']],
      limit: 20,
      attributes: ['endpoint', 'method', 'timestamp', 'ipAddress'],
      raw: true
    });

    var breakdownRows = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: keyRow.id, timestamp: { [Op.gte]: since7Days } },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        'endpoint',
        'method'
      ],
      group: ['endpoint', 'method'],
      raw: true
    });

    var endpointBreakdown = {};
    breakdownRows.forEach(function(r) {
      var k = (r.method || '') + ' ' + (r.endpoint || '');
      endpointBreakdown[k] = parseInt(r.count, 10) || 0;
    });

    res.json({
      success: true,
      data: {
        keyName: keyRow.name,
        totalRequests: totalRequests,
        last7Days: last7Days,
        recentRequests: recentRequests,
        endpointBreakdown: endpointBreakdown
      }
    });
  } catch (err) {
    console.error('API key stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to load API key stats' });
  }
});
