'use strict'

var sequelize = require('../config/db');

// Import all models
var User = require('./User');
var Profile = require('./Profile');
var Degree = require('./Degree');
var Certification = require('./Certification');
var Licence = require('./Licence');
var ProfessionalCourse = require('./ProfessionalCourse');
var Employment = require('./Employment');
var Bid = require('./Bid');
var FeaturedAlumnus = require('./FeaturedAlumnus');
var ApiKey = require('./ApiKey');
var ApiKeyUsageLog = require('./ApiKeyUsageLog');

// ── Associations ──

// User <-> Profile (one-to-one)
User.hasOne(Profile, { foreignKey: 'userId', onDelete: 'CASCADE' });
Profile.belongsTo(User, { foreignKey: 'userId' });

// Profile <-> Degree (one-to-many)
Profile.hasMany(Degree, { foreignKey: 'profileId', onDelete: 'CASCADE' });
Degree.belongsTo(Profile, { foreignKey: 'profileId' });

// Profile <-> Certification (one-to-many)
Profile.hasMany(Certification, { foreignKey: 'profileId', onDelete: 'CASCADE' });
Certification.belongsTo(Profile, { foreignKey: 'profileId' });

// Profile <-> Licence (one-to-many)
Profile.hasMany(Licence, { foreignKey: 'profileId', onDelete: 'CASCADE' });
Licence.belongsTo(Profile, { foreignKey: 'profileId' });

// Profile <-> ProfessionalCourse (one-to-many)
Profile.hasMany(ProfessionalCourse, { foreignKey: 'profileId', onDelete: 'CASCADE' });
ProfessionalCourse.belongsTo(Profile, { foreignKey: 'profileId' });

// Profile <-> Employment (one-to-many)
Profile.hasMany(Employment, { foreignKey: 'profileId', onDelete: 'CASCADE' });
Employment.belongsTo(Profile, { foreignKey: 'profileId' });

// User <-> Bid (one-to-many)
User.hasMany(Bid, { foreignKey: 'userId', onDelete: 'CASCADE' });
Bid.belongsTo(User, { foreignKey: 'userId' });

// User <-> FeaturedAlumnus (one-to-many)
User.hasMany(FeaturedAlumnus, { foreignKey: 'userId', onDelete: 'CASCADE' });
FeaturedAlumnus.belongsTo(User, { foreignKey: 'userId' });

// Profile <-> FeaturedAlumnus (one-to-many)
Profile.hasMany(FeaturedAlumnus, { foreignKey: 'profileId', onDelete: 'CASCADE' });
FeaturedAlumnus.belongsTo(Profile, { foreignKey: 'profileId' });

// User <-> ApiKey (one-to-many, developer only)
User.hasMany(ApiKey, { foreignKey: 'developerId', onDelete: 'CASCADE' });
ApiKey.belongsTo(User, { foreignKey: 'developerId' });

// ApiKey <-> ApiKeyUsageLog (one-to-many)
ApiKey.hasMany(ApiKeyUsageLog, { foreignKey: 'apiKeyId', onDelete: 'CASCADE' });
ApiKeyUsageLog.belongsTo(ApiKey, { foreignKey: 'apiKeyId' });

module.exports = {
  sequelize,
  User,
  Profile,
  Degree,
  Certification,
  Licence,
  ProfessionalCourse,
  Employment,
  Bid,
  FeaturedAlumnus,
  ApiKey,
  ApiKeyUsageLog
};
