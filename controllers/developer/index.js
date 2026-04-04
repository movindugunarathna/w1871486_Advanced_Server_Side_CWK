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

// POST /api/developer/api-keys
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

// GET /api/developer/api-keys
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

// DELETE /api/developer/api-keys/:id (revoke)
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

// GET /api/developer/api-keys/:id/stats
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
