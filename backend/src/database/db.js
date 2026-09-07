require('dotenv').config();

const pg = require('./pgDb');

console.log('🐘 Database connected: PostgreSQL (nexus_erp)');

module.exports = {
  db: pg.db,
  runTransaction: pg.runTransaction,
  pool: pg.pool
};
