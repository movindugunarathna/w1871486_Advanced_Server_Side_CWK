'use strict'

var express = require('express');
var fs = require('node:fs');
var path = require('node:path');

module.exports = function(parent, options){
  var dir = path.join(__dirname, '..', 'controllers');
  var verbose = options.verbose;
  fs.readdirSync(dir).forEach(function(name){
    var file = path.join(dir, name);
    if (!fs.statSync(file).isDirectory()) return;
    verbose && console.log('\n   %s:', name);
    var obj = require(file);
    var controllerName = obj.name || name;
    var prefix = obj.prefix || '';

    // If the controller exports an Express Router, mount it directly
    if (obj.router) {
      parent.use(prefix, obj.router);
      verbose && console.log('     ROUTER mounted at %s', prefix || '/');
      return;
    }

    // Otherwise, use the boilerplate convention-based routing
    var app = express();
    var handler;
    var method;
    var url;

    if (obj.engine) app.set('view engine', obj.engine);
    app.set('views', path.join(__dirname, '..', 'controllers', controllerName, 'views'));

    for (var key in obj) {
      if (~['name', 'prefix', 'engine', 'before'].indexOf(key)) continue;
      switch (key) {
        case 'show':
          method = 'get';
          url = '/' + controllerName + '/:' + controllerName + '_id';
          break;
        case 'list':
          method = 'get';
          url = '/' + controllerName + 's';
          break;
        case 'edit':
          method = 'get';
          url = '/' + controllerName + '/:' + controllerName + '_id/edit';
          break;
        case 'update':
          method = 'put';
          url = '/' + controllerName + '/:' + controllerName + '_id';
          break;
        case 'create':
          method = 'post';
          url = '/' + controllerName;
          break;
        case 'index':
          method = 'get';
          url = '/';
          break;
        default:
          /* skip unknown exports instead of throwing */
          continue;
      }

      handler = obj[key];
      url = prefix + url;

      if (obj.before) {
        app[method](url, obj.before, handler);
        verbose && console.log('     %s %s -> before -> %s', method.toUpperCase(), url, key);
      } else {
        app[method](url, handler);
        verbose && console.log('     %s %s -> %s', method.toUpperCase(), url, key);
      }
    }

    parent.use(app);
  });
};
