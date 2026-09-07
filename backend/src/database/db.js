require('dotenv').config();

const dbType = process.env.DB_TYPE || 'postgres';

let dbInstance;
let runTransactionInstance;

if (dbType === 'sqlite') {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const dbDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.resolve(dbDir, 'sgc_erp.sqlite');
    const sqliteDb = new Database(dbPath);

    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    sqliteDb.pragma('synchronous = NORMAL');

    dbInstance = sqliteDb;
    runTransactionInstance = (callback) => {
      const transaction = sqliteDb.transaction(callback);
      return transaction();
    };
    console.log('📦 Database connected: SQLite (Local)');
  } catch (err) {
    console.warn('⚠️ SQLite could not be loaded, falling back to PostgreSQL:', err.message);
    const pg = require('./pgDb');
    dbInstance = pg.db;
    runTransactionInstance = pg.runTransaction;
  }
} else {
  // PostgreSQL default
  const pg = require('./pgDb');
  dbInstance = pg.db;
  runTransactionInstance = pg.runTransaction;
  console.log('🐘 Database connected: PostgreSQL (nexus_erp)');
}

module.exports = {
  db: dbInstance,
  runTransaction: runTransactionInstance
};
