'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Profile = sequelize.define('Profile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    unique: true,
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  biography: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  linkedInUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profileImagePath: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profileComplete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'profiles',
  timestamps: true
});

module.exports = Profile;
