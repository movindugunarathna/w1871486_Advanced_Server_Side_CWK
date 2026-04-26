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
 *     description: >
 *       Creates a cryptographically random API key with explicit scopes.
 *       Supported scopes: read:alumni (analytics dashboard), read:analytics (analytics dashboard),
 *       read:alumni_of_day (mobile AR app). The full key value is returned only once in this response.
 *     tags: [Developer]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions]
 *             properties:
 *               name:
 *                 type: string
 *                 example: My AR App
 *                 description: A friendly label for this key
 *               permissions:
 *                 type: array
 *                 description: Scopes granted to this API key
 *                 items:
 *                   type: string
 *                   enum: [read:alumni, read:analytics, read:alumni_of_day]
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
 *                     key:
 *                       type: string
 *                       example: a1b2c3d4e5f6...
 *                     name:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
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
  var permissions = req.body.permissions;

  try {
    var fullKey = crypto.randomBytes(32).toString('hex');

    var created = await ApiKey.create({
      developerId: developerId,
      key: fullKey,
      name: name,
      permissions: permissions,
      isRevoked: false
    });

    // Only time the full key is returned.
    res.status(201).json({
      success: true,
      message: 'API key generated',
      data: {
        key: fullKey,
        name: created.name,
        permissions: created.permissions || []
      }
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
 *                       permissions:
 *                         type: array
 *                         items:
 *                           type: string
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
        'permissions',
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
        permissions: r.permissions || [],
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
 *                     isRevoked:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     firstUsed:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Timestamp of the first request made with this key
 *                     lastUsed:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Timestamp of the most recent request
 *                     uniqueClients:
 *                       type: integer
 *                       description: Number of distinct IP addresses that used this key
 *                     totalRequests:
 *                       type: integer
 *                     last7Days:
 *                       type: integer
 *                     recentRequests:
 *                       type: array
 *                       description: Last 20 requests with timestamps and client IPs
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

    var firstUsedRow = await ApiKeyUsageLog.findOne({
      where: { apiKeyId: keyRow.id },
      order: [['timestamp', 'ASC']],
      attributes: ['timestamp'],
      raw: true
    });

    var lastUsedRow = await ApiKeyUsageLog.findOne({
      where: { apiKeyId: keyRow.id },
      order: [['timestamp', 'DESC']],
      attributes: ['timestamp'],
      raw: true
    });

    var uniqueClientsResult = await ApiKeyUsageLog.count({
      where: { apiKeyId: keyRow.id },
      distinct: true,
      col: 'ipAddress'
    });

    var recentRequests = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: keyRow.id },
      order: [['timestamp', 'DESC']],
      limit: 20,
      attributes: ['endpoint', 'method', 'timestamp', 'ipAddress'],
      raw: true
    });

    var breakdownRows = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: keyRow.id },
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
        isRevoked: keyRow.isRevoked,
        createdAt: keyRow.createdAt,
        firstUsed: firstUsedRow ? firstUsedRow.timestamp : null,
        lastUsed: lastUsedRow ? lastUsedRow.timestamp : null,
        uniqueClients: uniqueClientsResult || 0,
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

/**
 * @swagger
 * /api/developer/usage-summary:
 *   get:
 *     summary: Aggregate usage statistics across all API keys
 *     description: >
 *       Returns a high-level summary of all the developer's API keys including
 *       total requests, requests in the last 7 days, per-key breakdown with
 *       first/last usage timestamps, unique client IPs, and a combined endpoint
 *       breakdown.
 *     tags: [Developer]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Aggregate usage statistics
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
 *                     totalKeys:
 *                       type: integer
 *                     activeKeys:
 *                       type: integer
 *                     revokedKeys:
 *                       type: integer
 *                     totalRequests:
 *                       type: integer
 *                     requestsLast7Days:
 *                       type: integer
 *                     uniqueClients:
 *                       type: integer
 *                     perKey:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           isRevoked:
 *                             type: boolean
 *                           totalRequests:
 *                             type: integer
 *                           last7Days:
 *                             type: integer
 *                           firstUsed:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           lastUsed:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                     endpointBreakdown:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                     recentRequests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           keyName:
 *                             type: string
 *                           endpoint:
 *                             type: string
 *                           method:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           ipAddress:
 *                             type: string
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
router.get('/usage-summary', async function(req, res) {
  var developerId = req.session.userId;
  var since7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    var keys = await ApiKey.findAll({
      where: { developerId: developerId },
      attributes: ['id', 'name', 'isRevoked', 'createdAt'],
      raw: true
    });

    if (keys.length === 0) {
      return res.json({
        success: true,
        data: {
          totalKeys: 0,
          activeKeys: 0,
          revokedKeys: 0,
          totalRequests: 0,
          requestsLast7Days: 0,
          uniqueClients: 0,
          perKey: [],
          endpointBreakdown: {},
          recentRequests: []
        }
      });
    }

    var keyIds = keys.map(function(k) { return k.id; });
    var activeKeys = keys.filter(function(k) { return !k.isRevoked; }).length;

    var totalRequests = await ApiKeyUsageLog.count({
      where: { apiKeyId: { [Op.in]: keyIds } }
    });

    var requestsLast7Days = await ApiKeyUsageLog.count({
      where: { apiKeyId: { [Op.in]: keyIds }, timestamp: { [Op.gte]: since7Days } }
    });

    var uniqueClients = await ApiKeyUsageLog.count({
      where: { apiKeyId: { [Op.in]: keyIds } },
      distinct: true,
      col: 'ipAddress'
    });

    var perKey = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var kTotal = await ApiKeyUsageLog.count({ where: { apiKeyId: k.id } });
      var kLast7 = await ApiKeyUsageLog.count({
        where: { apiKeyId: k.id, timestamp: { [Op.gte]: since7Days } }
      });
      var kFirst = await ApiKeyUsageLog.findOne({
        where: { apiKeyId: k.id },
        order: [['timestamp', 'ASC']],
        attributes: ['timestamp'],
        raw: true
      });
      var kLast = await ApiKeyUsageLog.findOne({
        where: { apiKeyId: k.id },
        order: [['timestamp', 'DESC']],
        attributes: ['timestamp'],
        raw: true
      });
      perKey.push({
        id: k.id,
        name: k.name,
        isRevoked: k.isRevoked,
        totalRequests: kTotal,
        last7Days: kLast7,
        firstUsed: kFirst ? kFirst.timestamp : null,
        lastUsed: kLast ? kLast.timestamp : null
      });
    }

    var breakdownRows = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: { [Op.in]: keyIds } },
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
      var label = (r.method || '') + ' ' + (r.endpoint || '');
      endpointBreakdown[label] = parseInt(r.count, 10) || 0;
    });

    var recentLogs = await ApiKeyUsageLog.findAll({
      where: { apiKeyId: { [Op.in]: keyIds } },
      order: [['timestamp', 'DESC']],
      limit: 30,
      attributes: ['apiKeyId', 'endpoint', 'method', 'timestamp', 'ipAddress'],
      raw: true
    });

    var keyNameMap = {};
    keys.forEach(function(k) { keyNameMap[k.id] = k.name; });

    var recentRequests = recentLogs.map(function(log) {
      return {
        keyName: keyNameMap[log.apiKeyId] || 'Unknown',
        endpoint: log.endpoint,
        method: log.method,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress
      };
    });

    res.json({
      success: true,
      data: {
        totalKeys: keys.length,
        activeKeys: activeKeys,
        revokedKeys: keys.length - activeKeys,
        totalRequests: totalRequests,
        requestsLast7Days: requestsLast7Days,
        uniqueClients: uniqueClients || 0,
        perKey: perKey,
        endpointBreakdown: endpointBreakdown,
        recentRequests: recentRequests
      }
    });
  } catch (err) {
    console.error('Usage summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to load usage summary' });
  }
});
