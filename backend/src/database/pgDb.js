const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nexus_erp',
  user: process.env.DB_USER || 'educrm_user',
  password: process.env.DB_PASSWORD || 'NuevaPasswordSegura',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

// Helper to convert SQLite '?' placeholders to PostgreSQL '$1, $2, ...'
function convertSqliteToPostgres(sql) {
  let paramIndex = 1;
  let converted = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Replace SQLite specific date arithmetic if present
  // e.g. CAST((julianday('now') - julianday(ar.due_date)) AS INTEGER) -> CAST(EXTRACT(DAY FROM (NOW() - ar.due_date)) AS INTEGER)
  converted = converted.replace(/CAST\s*\(\s*\(\s*julianday\('now'\)\s*-\s*julianday\(([^)]+)\)\s*\)\s*AS\s*INTEGER\s*\)/gi, 
    'CAST(EXTRACT(DAY FROM (NOW() - $1)) AS INTEGER)');

  return converted;
}

// Database query wrapper interface
const db = {
  // Query returning all rows
  query: async (sql, params = []) => {
    const formattedSql = convertSqliteToPostgres(sql);
    const res = await pool.query(formattedSql, params);
    return res.rows;
  },

  // Prepared statement emulation for high compatibility
  prepare: (sql) => {
    return {
      all: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const formattedSql = convertSqliteToPostgres(sql);
        const res = await pool.query(formattedSql, flatParams);
        return res.rows;
      },

      get: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const formattedSql = convertSqliteToPostgres(sql);
        const res = await pool.query(formattedSql, flatParams);
        return res.rows[0] || null;
      },

      run: async (...params) => {
        let flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        let formattedSql = convertSqliteToPostgres(sql);

        // If INSERT and doesn't have RETURNING id, append RETURNING id
        const isInsert = /^\s*INSERT\s+INTO/i.test(formattedSql);
        if (isInsert && !/RETURNING/i.test(formattedSql)) {
          formattedSql += ' RETURNING id';
        }

        const res = await pool.query(formattedSql, flatParams);
        const lastInsertRowid = res.rows && res.rows.length > 0 && res.rows[0].id ? res.rows[0].id : null;

        return {
          lastInsertRowid,
          changes: res.rowCount
        };
      }
    };
  },

  // Direct raw execution
  exec: async (sql) => {
    return await pool.query(sql);
  },

  // Pragma dummy for compatibility
  pragma: () => {}
};

// Transaction runner
const runTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  db,
  runTransaction
};
