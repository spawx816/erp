const { pool } = require('../src/database/pgDb');

async function migrate() {
  console.log('--- MIGRATING SALES ORDERS TABLES ---');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      salesperson_id INTEGER REFERENCES salespeople(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      order_number TEXT NOT NULL,
      fiscal_type_code TEXT DEFAULT 'B02',
      payment_type TEXT DEFAULT 'cash',
      credit_days INTEGER DEFAULT 0,
      due_date DATE,
      subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      dispatched_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      dispatched_at TIMESTAMPTZ,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, order_number)
    );

    ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'cash';
    ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS credit_days INTEGER DEFAULT 0;
    ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS due_date DATE;

    CREATE TABLE IF NOT EXISTS sales_order_items (
      id SERIAL PRIMARY KEY,
      sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit_cost NUMERIC(14, 2) DEFAULT 0.00,
      unit_price NUMERIC(14, 2) NOT NULL,
      discount_percent NUMERIC(5, 2) DEFAULT 0.00,
      discount_amount NUMERIC(14, 2) DEFAULT 0.00,
      subtotal NUMERIC(14, 2) NOT NULL,
      tax_rate NUMERIC(5, 2) DEFAULT 18.00,
      tax_amount NUMERIC(14, 2) DEFAULT 0.00,
      total NUMERIC(14, 2) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_orders_company_status ON sales_orders(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_user ON sales_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_created ON sales_orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(sales_order_id);
  `);

  // Insert permissions for sales_orders if not present
  const permissions = [
    { slug: 'orders.view', name: 'Ver Pedidos de Venta', module: 'sales' },
    { slug: 'orders.create', name: 'Crear Pedidos de Venta', module: 'sales' },
    { slug: 'orders.approve', name: 'Autorizar Pedidos de Venta', module: 'sales' },
    { slug: 'orders.dispatch', name: 'Despachar Pedidos en Almacén', module: 'inventory' }
  ];

  for (const perm of permissions) {
    await pool.query(`
      INSERT INTO permissions (slug, name, module)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module
    `, [perm.slug, perm.name, perm.module]);
  }

  // Assign permissions to roles
  // 1: admin (all), 2: gerente (view, create, approve), 4: vendedor (view, create), 6: almacen (view, dispatch), 3: cajero (view)
  const roleMappings = [
    { roleId: 1, perms: ['orders.view', 'orders.create', 'orders.approve', 'orders.dispatch'] },
    { roleId: 2, perms: ['orders.view', 'orders.create', 'orders.approve'] },
    { roleId: 3, perms: ['orders.view'] },
    { roleId: 4, perms: ['orders.view', 'orders.create'] },
    { roleId: 6, perms: ['orders.view', 'orders.dispatch'] }
  ];

  for (const rm of roleMappings) {
    for (const pSlug of rm.perms) {
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT $1, id FROM permissions WHERE slug = $2
        ON CONFLICT DO NOTHING
      `, [rm.roleId, pSlug]);
    }
  }

  console.log('✅ Migration completed successfully: sales_orders tables and permissions ready.');
  await pool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
