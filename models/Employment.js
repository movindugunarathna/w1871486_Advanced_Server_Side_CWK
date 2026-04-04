'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Employment = sequelize.define('Employment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  profileId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  company: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.STRING,
    allowNull: true
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'employments',
  timestamps: true
});

module.exports = Employment;
