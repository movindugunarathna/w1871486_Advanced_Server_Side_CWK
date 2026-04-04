'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var FeaturedAlumnus = sequelize.define('FeaturedAlumnus', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  profileId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  featuredDate: {
    type: DataTypes.DATEONLY,
    unique: true,
    allowNull: false
  },
  winningBidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  activatedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'featured_alumni',
  timestamps: true
});

module.exports = FeaturedAlumnus;
