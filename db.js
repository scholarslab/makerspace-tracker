var pg = require('pg');

// database connection
DB_URL = process.env.DATABASE_URL;
pg.defaults.ssl = true;
var knex = require('knex')({client: 'pg', connection: DB_URL});
var dbPool = require('bookshelf')(knex);

module.exports = dbPool;
