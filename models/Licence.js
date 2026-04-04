'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Licence = sequelize.define('Licence', {
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
  awardingBody: {
    type: DataTypes.STRING,
    allowNull: true
  },
  licenceUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'licences',
  timestamps: true
});

module.exports = Licence;
