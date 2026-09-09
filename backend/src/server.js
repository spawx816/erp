const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { pool } = require('./database/pgDb');

const app = express();

// Middlewares
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-branch-id']
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Health Check with real database probe
app.get('/api/v1/health', async (req, res) => {
  try {
    const dbProbe = await pool.query('SELECT 1 as live');
    const isDbLive = dbProbe.rows && dbProbe.rows.length > 0;
    
    if (!isDbLive) {
      return res.status(503).json({
        status: 'degraded',
        database: 'unresponsive',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      status: 'ok',
      database: 'connected',
      system: 'Nexus ERP - Sistema de Gestión Comercial',
      timestamp: new Date().toISOString(),
      version: '1.0.0-production'
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Base de datos no disponible.',
      timestamp: new Date().toISOString()
    });
  }
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
    : (process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Error interno del servidor.'
        : (err.message || 'Error interno del servidor.'));

  return res.status(statusCode).json({
    success: false,
    message
  });
});

async function startServer() {
  try {
    // 1. Verify PostgreSQL connection
    await pool.query('SELECT 1');
    console.log('🐘 PostgreSQL conectado exitosamente.');

    // 2. Ensure schema exists
    const check = await pool.query("SELECT to_regclass('public.companies') as exists");
    if (!check.rows[0].exists) {
      console.log('🌱 Inicializando esquema nativo en PostgreSQL...');
      const schemaPath = path.resolve(__dirname, './database/nexus_erp_postgres.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schemaSql);
        console.log('✅ Esquema inicial creado.');
      }
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` Nexus ERP - Sistema de Gestión Comercial Backend API`);
      console.log(` Running on: http://localhost:${PORT}`);
      console.log(` Health:     http://localhost:${PORT}/api/v1/health`);
      console.log(`====================================================`);
    });

    // Graceful Shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}. Cerrando conexiones...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('🐘 Pool de PostgreSQL cerrado limpiamente.');
          process.exit(0);
        } catch (err) {
          console.error('Error cerrando pool:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err) {
    console.error('❌ Error fatal iniciando el servidor:', err.message);
    process.exit(1);
  }
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});
