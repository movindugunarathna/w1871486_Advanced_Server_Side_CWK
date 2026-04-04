'use strict'

var { DataTypes } = require('sequelize');
var sequelize = require('../config/db');

var Bid = sequelize.define('Bid', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  bidDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'won', 'lost', 'cancelled'),
    defaultValue: 'active'
  }
}, {
  tableName: 'bids',
  timestamps: true
});

module.exports = Bid;
