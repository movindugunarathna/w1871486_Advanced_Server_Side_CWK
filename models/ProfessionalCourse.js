'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var ProfessionalCourse = sequelize.define('ProfessionalCourse', {
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
  provider: {
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
  tableName: 'professional_courses',
  timestamps: true
});

module.exports = ProfessionalCourse;
