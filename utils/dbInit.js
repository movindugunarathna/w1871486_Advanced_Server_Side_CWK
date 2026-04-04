'use strict'

const mysql = require('mysql2/promise');

/**
 * Automatically creates the database if it doesn't exist
 * @param {Object} config - Database configuration
 * @param {string} config.host - Database host
 * @param {number} config.port - Database port
 * @param {string} config.user - Database user
 * @param {string} config.password - Database password
 * @param {string} config.database - Database name
 * @returns {Promise<void>}
 */
async function initializeDatabase(config) {
    const { host, port, user, password, database } = config;

    try {
        // Connect without specifying database (to check if it exists)
        const connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            waitForConnections: true,
            connectionLimit: 1,
            queueLimit: 0
        });

        console.log('Connected to MySQL server');

        // Check if database exists
        const [rows] = await connection.execute(
            `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
            [database]
        );

        if (rows.length === 0) {
            // Database doesn't exist, create it
            console.log(`Database "${database}" not found. Creating...`);
            await connection.execute(
                `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
            );
            console.log(`✓ Database "${database}" created successfully`);
        } else {
            console.log(`✓ Database "${database}" already exists`);
        }

        await connection.end();
    } catch (error) {
        console.error('Error initializing database:', error.message);
        throw error;
    }
}

module.exports = { initializeDatabase };
