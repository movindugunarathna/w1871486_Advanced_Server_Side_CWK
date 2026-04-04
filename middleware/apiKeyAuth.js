'use strict'

var { ApiKey, ApiKeyUsageLog } = require('../models');

// Authenticate requests using API key in Authorization header
module.exports = async function(req, res, next) {
  try {
    var authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'API key required. Use Authorization: Bearer <api_key>' });
    }

    var key = authHeader.split(' ')[1];
    var apiKey = await ApiKey.findOne({ where: { key: key } });

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'Invalid API key.' });
    }

    if (apiKey.isRevoked) {
      return res.status(401).json({ success: false, message: 'API key has been revoked.' });
    }

    // Log usage
    await ApiKeyUsageLog.create({
      apiKeyId: apiKey.id,
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress: req.ip
    });

    req.apiKeyDeveloper = { id: apiKey.developerId, apiKeyId: apiKey.id };
    next();
  } catch (err) {
    next(err);
  }
};
