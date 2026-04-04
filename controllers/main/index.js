'use strict'

// Landing page — redirects to API docs
exports.index = function(req, res) {
  res.redirect('/api-docs');
};
