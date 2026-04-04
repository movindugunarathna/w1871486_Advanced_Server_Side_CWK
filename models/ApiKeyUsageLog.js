'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var ApiKeyUsageLog = sequelize.define('ApiKeyUsageLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  apiKeyId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  endpoint: {
    type: DataTypes.STRING,
    allowNull: false
  },
  method: {
    type: DataTypes.STRING,
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'api_key_usage_logs',
  timestamps: false
});

module.exports = ApiKeyUsageLog;
