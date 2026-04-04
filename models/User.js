'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('alumnus', 'developer'),
    allowNull: false,
    defaultValue: 'alumnus'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  verificationTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  appearanceCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  attendedEvent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastAppearanceReset: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true
});

module.exports = User;
