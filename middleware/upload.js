'use strict'

var multer = require('multer');
var path = require('node:path');

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads', 'profiles'));
  },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, req.session.userId + '-' + Date.now() + ext);
  }
});

var fileFilter = function(req, file, cb) {
  var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, JPG and PNG files are allowed'), false);
  }
};

var upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

module.exports = upload;
