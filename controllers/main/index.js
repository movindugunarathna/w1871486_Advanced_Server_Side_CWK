'use strict'

var path = require('path');

// Landing page — serves the client-side SPA (from boilerplate client-side pattern)
exports.index = function(req, res) {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
};
