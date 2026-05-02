'use strict';

var mysql = require('mysql2/promise');

module.exports = async function ensureDatabaseExists() {
  var host = process.env.DB_HOST || 'localhost';
  var port = Number(process.env.DB_PORT || 3306);
  var user = process.env.DB_USER || 'root';
  var password = process.env.DB_PASSWORD || '';
  var database = process.env.DB_NAME || 'w1871486_alumni_influencers';

  var connection = await mysql.createConnection({
    host: host,
    port: port,
    user: user,
    password: password
  });

  try {
    // Use utf8mb4 so emoji and full Unicode text are stored correctly.
    await connection.query(
      'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      [database]
    );
  } finally {
    await connection.end();
  }
};
