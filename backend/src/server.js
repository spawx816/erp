const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dbType = process.env.DB_TYPE || 'postgres';

// Auto-initialize database
if (dbType === 'postgres') {
  (async () => {
    try {
      const { pool } = require('./database/pgDb');
      await pool.query('SELECT 1');
      console.log('🐘 PostgreSQL connected successfully.');

      const check = await pool.query("SELECT to_regclass('public.products') as exists");
      if (!check.rows[0].exists) {
        console.log('🌱 Inicializando dataset completo en PostgreSQL...');
        const sqlPath = path.resolve(__dirname, './database/nexus_erp_full_seed.sql');
        const fallbackPath = path.resolve(__dirname, './database/nexus_erp_postgres.sql');
        const targetPath = fs.existsSync(sqlPath) ? sqlPath : fallbackPath;
        if (fs.existsSync(targetPath)) {
          const sql = fs.readFileSync(targetPath, 'utf8');
          await pool.query(sql);
          console.log('✅ Esquema y dataset completo cargados en PostgreSQL!');
        }
      }
    } catch (err) {
      console.error('⚠️ Error conectando o inicializando PostgreSQL:', err.message);
    }
  })();
} else {
  try {
    const { initSchema } = require('./database/schema');
    const { runSeed } = require('./database/seeder');
    initSchema();
    runSeed();
  } catch (err) {
    console.warn('Skipping SQLite schema init:', err.message);
  }
}

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-branch-id']
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Health Check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Nexus ERP - Sistema de Gestión Comercial',
    timestamp: new Date().toISOString(),
    version: '1.0.0-production'
  });
});

// Mount Routes
app.use('/api/v1/auth', require('./modules/auth/authRoutes'));
app.use('/api/v1/catalog', require('./modules/catalog/catalogRoutes'));
app.use('/api/v1/third-parties', require('./modules/thirdParties/thirdPartiesRoutes'));
app.use('/api/v1/inventory', require('./modules/inventory/inventoryRoutes'));
app.use('/api/v1/purchases', require('./modules/purchases/purchasesRoutes'));
app.use('/api/v1/sales', require('./modules/sales/salesRoutes'));
app.use('/api/v1/cash', require('./modules/cash/cashRoutes'));
app.use('/api/v1/finance', require('./modules/finance/financeRoutes'));
app.use('/api/v1/fiscal', require('./modules/fiscal/fiscalRoutes'));
app.use('/api/v1/reports', require('./modules/reports/reportsRoutes'));
app.use('/api/v1/admin', require('./modules/admin/adminRoutes'));
app.use('/api/v1/imports', require('./modules/imports/importRoutes'));
app.use('/api/v1/settings', require('./modules/settings/settingsRoutes'));

// Global Error Handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = (typeof err.status === 'number' && err.status >= 100 && err.status < 600)
    ? err.status
    : ((typeof err.statusCode === 'number' && err.statusCode >= 100 && err.statusCode < 600) ? err.statusCode : 500);

  const message = err.type === 'entity.parse.failed'
    ? 'Formato JSON inválido en la solicitud.'
    : (err.message || 'Error interno del servidor.');

  return res.status(statusCode).json({
    success: false,
    message
  });
});

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Nexus ERP - Sistema de Gestión Comercial Backend API`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Health:     http://localhost:${PORT}/api/v1/health`);
  console.log(`====================================================`);
});

server.on('error', (err) => {
  console.error('HTTP SERVER ERROR:', err);
});

server.on('close', () => {
  console.warn('HTTP SERVER CLOSED.');
});

process.on('exit', (code) => {
  console.log(`Node server process exited with code: ${code}`);
});

// Periodic keep-alive heartbeat
setInterval(() => {}, 60000);

module.exports = { app, server };
