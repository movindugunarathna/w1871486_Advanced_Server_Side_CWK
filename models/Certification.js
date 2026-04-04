'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Certification = sequelize.define('Certification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  profileId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  issuingBody: {
    type: DataTypes.STRING,
    allowNull: true
  },
  courseUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'certifications',
  timestamps: true
});

module.exports = Certification;
