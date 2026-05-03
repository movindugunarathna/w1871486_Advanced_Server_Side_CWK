'use strict'

var { ApiKey, ApiKeyUsageLog } = require('../models');

// Authenticate requests using API key in Authorization header
var apiKeyAuth = async function(req, res, next) {
  try {
    var authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'API key required. Use Authorization: Bearer <api_key>' });
    }

    var key = authHeader.split(' ')[1];

    // Dashboard proxy sends ANALYTICS_API_KEY; on a fresh VM that value may not exist in `api_keys`.
    // Treat a matching env secret as a full-scope key (no DB row required).
    var masterKey = process.env.ANALYTICS_API_KEY || '';
    if (masterKey && key === masterKey) {
      req.apiKey = {
        id: null,
        developerId: null,
        permissions: ['read:alumni', 'read:alumni_of_day', 'read:analytics'],
        isRevoked: false
      };
      req.apiKeyDeveloper = { id: null, apiKeyId: null };
      return next();
    }

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
    req.apiKey = apiKey;
    next();
  } catch (err) {
    next(err);
  }
};

var hasPermission = function(requiredScope) {
  return function(req, res, next) {
    var perms = (req.apiKey && req.apiKey.permissions) || [];
    if (!perms.includes(requiredScope)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Required scope: ' + requiredScope
      });
    }
    next();
  };
};

module.exports = { apiKeyAuth: apiKeyAuth, hasPermission: hasPermission };
