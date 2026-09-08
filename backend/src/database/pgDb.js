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

// Helper to convert SQLite '?' placeholders and dialect to PostgreSQL
function convertSqliteToPostgres(sql) {
  let paramIndex = 1;
  let converted = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Replace SQLite specific date arithmetic if present
  converted = converted.replace(/CAST\s*\(\s*\(\s*julianday\('now'\)\s*-\s*julianday\(([^)]+)\)\s*\)\s*AS\s*INTEGER\s*\)/gi, 
    'CAST(EXTRACT(DAY FROM (NOW() - $1)) AS INTEGER)');

  // IFNULL -> COALESCE
  converted = converted.replace(/IFNULL\s*\(/gi, 'COALESCE(');

  // date('now', '-30 days') / date('now', '+X days')
  converted = converted.replace(/date\s*\(\s*'now'\s*,\s*'-(\d+)\s*(days?|months?|years?)'\s*\)/gi, "(CURRENT_DATE - INTERVAL '$1 $2')");
  converted = converted.replace(/date\s*\(\s*'now'\s*,\s*'\+(\d+)\s*(days?|months?|years?)'\s*\)/gi, "(CURRENT_DATE + INTERVAL '$1 $2')");
  converted = converted.replace(/date\s*\(\s*'now'\s*,\s*'(-?\d+\s*[^']+)'\s*\)/gi, "(CURRENT_DATE + INTERVAL '$1')");

  // date('now') / datetime('now')
  converted = converted.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
  converted = converted.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');

  // strftime translations
  converted = converted.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*'now'\s*\)/gi, "TO_CHAR(CURRENT_DATE, 'YYYY-MM')");
  converted = converted.replace(/strftime\s*\(\s*'%Y'\s*,\s*'now'\s*\)/gi, "TO_CHAR(CURRENT_DATE, 'YYYY')");
  converted = converted.replace(/strftime\s*\(\s*'%Y-%m-%d'\s*,\s*'now'\s*\)/gi, "TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')");
  converted = converted.replace(/strftime\s*\(\s*'%d'\s*,\s*'now'\s*\)/gi, "TO_CHAR(CURRENT_DATE, 'DD')");

  converted = converted.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, "TO_CHAR(($1)::timestamp, 'YYYY-MM')");
  converted = converted.replace(/strftime\s*\(\s*'%Y'\s*,\s*([^)]+)\)/gi, "TO_CHAR(($1)::timestamp, 'YYYY')");
  converted = converted.replace(/strftime\s*\(\s*'%d'\s*,\s*([^)]+)\)/gi, "TO_CHAR(($1)::timestamp, 'DD')");
  converted = converted.replace(/strftime\s*\(\s*'%m'\s*,\s*([^)]+)\)/gi, "TO_CHAR(($1)::timestamp, 'MM')");
  converted = converted.replace(/strftime\s*\(\s*'%Y-%m-%d'\s*,\s*([^)]+)\)/gi, "TO_CHAR(($1)::timestamp, 'YYYY-MM-DD')");

  // date(col) -> ((col)::date) — but only if it does NOT start with 'now' (those are already handled)
  converted = converted.replace(/date\s*\(\s*(?!'now')([^)]+)\)/gi, "($1)::date");

  // INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
    converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(converted)) {
      converted = `${converted.trim()} ON CONFLICT DO NOTHING`;
    }
  }

  return converted;
}

const normalizeParams = (params) => {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return flat.map(p => (p === undefined ? null : p));
};

// Database query wrapper interface
const db = {
  // Query returning all rows
  query: async (sql, params = []) => {
    const formattedSql = convertSqliteToPostgres(sql);
    const flatParams = normalizeParams(params);
    try {
      const res = await pool.query(formattedSql, flatParams);
      return res.rows;
    } catch (err) {
      console.error('❌ Database query error:', err.message, '\nSQL:', formattedSql, '\nParams:', flatParams);
      throw err;
    }
  },

  // Prepared statement emulation for high compatibility
  prepare: (sql) => {
    return {
      all: async (...params) => {
        const flatParams = normalizeParams(params);
        const formattedSql = convertSqliteToPostgres(sql);
        try {
          const res = await pool.query(formattedSql, flatParams);
          return res.rows;
        } catch (err) {
          console.error('❌ Database prepare.all error:', err.message, '\nSQL:', formattedSql, '\nParams:', flatParams);
          throw err;
        }
      },

      get: async (...params) => {
        const flatParams = normalizeParams(params);
        const formattedSql = convertSqliteToPostgres(sql);
        try {
          const res = await pool.query(formattedSql, flatParams);
          return res.rows[0] || null;
        } catch (err) {
          console.error('❌ Database prepare.get error:', err.message, '\nSQL:', formattedSql, '\nParams:', flatParams);
          throw err;
        }
      },

      run: async (...params) => {
        const flatParams = normalizeParams(params);
        let formattedSql = convertSqliteToPostgres(sql);

        // If INSERT and doesn't have RETURNING id, append RETURNING id
        const isInsert = /^\s*INSERT\s+INTO/i.test(formattedSql);
        if (isInsert && !/RETURNING/i.test(formattedSql)) {
          formattedSql += ' RETURNING id';
        }

        try {
          const res = await pool.query(formattedSql, flatParams);
          const lastInsertRowid = res.rows && res.rows.length > 0 && res.rows[0].id ? res.rows[0].id : null;

          return {
            lastInsertRowid,
            changes: res.rowCount
          };
        } catch (err) {
          console.error('❌ Database prepare.run error:', err.message, '\nSQL:', formattedSql, '\nParams:', flatParams);
          throw err;
        }
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

// Helper to build a db-like interface on top of a specific pg client (for transactions)
function makeClientDb(client) {
  return {
    prepare: (sql) => ({
      all: async (...params) => {
        const flatParams = normalizeParams(params);
        const formattedSql = convertSqliteToPostgres(sql);
        try {
          const res = await client.query(formattedSql, flatParams);
          return res.rows;
        } catch (err) {
          console.error('❌ TX prepare.all error:', err.message, '\nSQL:', formattedSql);
          throw err;
        }
      },
      get: async (...params) => {
        const flatParams = normalizeParams(params);
        const formattedSql = convertSqliteToPostgres(sql);
        try {
          const res = await client.query(formattedSql, flatParams);
          return res.rows[0] || null;
        } catch (err) {
          console.error('❌ TX prepare.get error:', err.message, '\nSQL:', formattedSql);
          throw err;
        }
      },
      run: async (...params) => {
        const flatParams = normalizeParams(params);
        let formattedSql = convertSqliteToPostgres(sql);
        const isInsert = /^\s*INSERT\s+INTO/i.test(formattedSql);
        if (isInsert && !/RETURNING/i.test(formattedSql)) {
          formattedSql += ' RETURNING id';
        }
        try {
          const res = await client.query(formattedSql, flatParams);
          const lastInsertRowid = res.rows && res.rows.length > 0 && res.rows[0].id ? res.rows[0].id : null;
          return { lastInsertRowid, changes: res.rowCount };
        } catch (err) {
          console.error('❌ TX prepare.run error:', err.message, '\nSQL:', formattedSql);
          throw err;
        }
      }
    }),
    query: async (sql, params = []) => {
      const formattedSql = convertSqliteToPostgres(sql);
      const flatParams = normalizeParams(params);
      const res = await client.query(formattedSql, flatParams);
      return res.rows;
    }
  };
}

// Transaction runner — callback receives a transactional db object
const runTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txDb = makeClientDb(client);
    const result = await callback(txDb);
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
