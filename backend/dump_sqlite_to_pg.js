const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, './data/sgc_erp.sqlite');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log('Found tables:', tables.length);

let sqlDump = `-- ==========================================================
-- NEXUS ERP - FULL POSTGRESQL DATA DUMP FROM SQLITE SEED
-- ==========================================================

`;

// First dump table definitions if needed, or insert statements in topological order
const tableOrder = [
  'companies', 'branches', 'warehouses', 'roles', 'permissions', 'role_permissions',
  'users', 'user_branches', 'salespeople', 'categories', 'brands', 'units',
  'products', 'product_variants', 'price_lists', 'price_list_items',
  'customers', 'suppliers', 'ncf_sequences', 'ncf_logs',
  'cash_registers', 'cash_sessions', 'cash_movements',
  'sales', 'sale_items', 'sale_payments', 'accounts_receivable', 'receivable_payments', 'payment_allocations',
  'credit_notes', 'credit_note_items', 'purchases', 'purchase_items', 'accounts_payable', 'payable_payments',
  'expense_categories', 'expenses', 'recurring_expenses',
  'inventory', 'inventories', 'inventory_batches', 'inventory_transactions', 'inventory_movements',
  'inventory_transfers', 'inventory_transfer_items', 'inventory_adjustments', 'inventory_adjustment_items',
  'import_orders', 'import_costs', 'import_items', 'monthly_closings', 'system_settings', 'settings', 'audit_logs', 'notifications'
];

// Add notifications table schema if missing
sqlDump += `
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`;

const existingTableNames = tables.map(t => t.name);

tableOrder.forEach(tableName => {
  if (!existingTableNames.includes(tableName)) return;

  const rows = db.prepare(`SELECT * FROM "${tableName}"`).all();
  if (rows.length === 0) return;

  console.log(`Dumping ${tableName} (${rows.length} rows)`);

  sqlDump += `\n-- Table: ${tableName}\n`;
  
  rows.forEach(row => {
    const keys = Object.keys(row);
    const values = keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      // Escape strings
      const str = String(v).replace(/'/g, "''");
      return `'${str}'`;
    });

    sqlDump += `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
  });

  // Adjust sequence if table has 'id' column
  if (rows[0] && rows[0].id !== undefined) {
    sqlDump += `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1));\n`;
  }
});

const outPath = path.resolve(__dirname, './src/database/nexus_erp_full_seed.sql');
fs.writeFileSync(outPath, sqlDump, 'utf8');
console.log('✅ Generated nexus_erp_full_seed.sql successfully! File size:', (fs.statSync(outPath).size / 1024).toFixed(1), 'KB');
