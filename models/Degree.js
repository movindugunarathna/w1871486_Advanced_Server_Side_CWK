'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Degree = sequelize.define('Degree', {
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
  university: {
    type: DataTypes.STRING,
    allowNull: true
  },
  officialUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'degrees',
  timestamps: true
});

module.exports = Degree;
