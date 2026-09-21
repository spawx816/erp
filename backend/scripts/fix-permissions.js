const { pool } = require('../src/database/pgDb');

async function fixPermissions() {
  const permissionsToAdd = [
    { module: 'finance', slug: 'cxc.view', name: 'Ver Cuentas por Cobrar', description: 'Permite consultar facturas y saldos de clientes' },
    { module: 'finance', slug: 'cxc.pay', name: 'Registrar Cobros', description: 'Permite registrar cobros a facturas de clientes' },
    { module: 'finance', slug: 'cxp.view', name: 'Ver Cuentas por Pagar', description: 'Permite consultar cuentas por pagar a proveedores' },
    { module: 'finance', slug: 'cxp.pay', name: 'Registrar Pagos a Proveedores', description: 'Permite emitir pagos a facturas de compras' },
    { module: 'finance', slug: 'expenses.view', name: 'Ver Gastos y Pagos Fijos', description: 'Permite consultar el registro de gastos operativos y pagos recurrentes' },
    { module: 'finance', slug: 'expenses.create', name: 'Crear Gastos y Pagos Fijos', description: 'Permite registrar nuevos gastos y programar pagos fijos' },
    { module: 'finance', slug: 'expenses.edit', name: 'Editar Gastos y Pagos Fijos', description: 'Permite actualizar datos de gastos y pagos fijos' },
    { module: 'finance', slug: 'expenses.delete', name: 'Eliminar Gastos', description: 'Permite anular o eliminar gastos operativos' },
    { module: 'finance', slug: 'expenses.pay', name: 'Pagar Gastos Fijos', description: 'Permite ejecutar el pago de obligaciones recurrentes' },
    { module: 'sales', slug: 'commissions.view', name: 'Ver Comisiones', description: 'Permite consultar las comisiones generadas por vendedores' },
    { module: 'sales', slug: 'commissions.pay', name: 'Pagar Comisiones', description: 'Permite liquidar y pagar comisiones acumuladas' },
    { module: 'sales', slug: 'quotes.view', name: 'Ver Cotizaciones', description: 'Permite visualizar el historial de cotizaciones' },
    { module: 'sales', slug: 'quotes.create', name: 'Crear Cotizaciones', description: 'Permite generar presupuestos y cotizaciones formales' },
    { module: 'third_parties', slug: 'customers.view', name: 'Ver Clientes', description: 'Permite consultar la lista y ficha 360 de clientes' },
    { module: 'third_parties', slug: 'customers.create', name: 'Crear Clientes', description: 'Permite registrar nuevos clientes' },
    { module: 'third_parties', slug: 'customers.edit', name: 'Editar Clientes', description: 'Permite actualizar información de clientes' },
    { module: 'third_parties', slug: 'customers.block', name: 'Bloquear Crédito de Clientes', description: 'Permite pausar la línea de crédito de un cliente' },
    { module: 'third_parties', slug: 'suppliers.view', name: 'Ver Proveedores', description: 'Permite consultar la lista de proveedores' },
    { module: 'third_parties', slug: 'suppliers.create', name: 'Crear Proveedores', description: 'Permite registrar nuevos proveedores' },
    { module: 'third_parties', slug: 'suppliers.edit', name: 'Editar Proveedores', description: 'Permite actualizar datos de proveedores' },
    { module: 'admin', slug: 'users.view', name: 'Ver Usuarios y Roles', description: 'Permite ver la lista de usuarios y roles del sistema' },
    { module: 'admin', slug: 'authorizations.view', name: 'Ver Autorizaciones', description: 'Permite ver solicitudes de autorización de precios y créditos' },
    { module: 'admin', slug: 'authorizations.approve', name: 'Aprobar Autorizaciones', description: 'Permite autorizar ventas especiales y descuentos' },
    { module: 'reports', slug: 'monthly_closing.execute', name: 'Ejecutar Cierre Mensual', description: 'Permite procesar el cierre contable y fiscal mensual' }
  ];

  for (const p of permissionsToAdd) {
    await pool.query(
      'INSERT INTO permissions (module, slug, name, description) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, module = EXCLUDED.module',
      [p.module, p.slug, p.name, p.description]
    );
  }

  // Grant all permissions to admin (role_id 1) and gerente (role_id 2)
  const allPerms = await pool.query('SELECT id FROM permissions');
  for (const perm of allPerms.rows) {
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (1, $1) ON CONFLICT DO NOTHING', [perm.id]);
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (2, $1) ON CONFLICT DO NOTHING', [perm.id]);
  }

  // Grant expenses permissions to cajero (role_id 3)
  const expensePerms = await pool.query("SELECT id FROM permissions WHERE slug IN ('expenses.view', 'expenses.create', 'expenses.pay', 'cxc.view', 'cxc.pay')");
  for (const perm of expensePerms.rows) {
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (3, $1) ON CONFLICT DO NOTHING', [perm.id]);
  }

  console.log('✅ Permisos insertados y asignados exitosamente.');
  await pool.end();
}

fixPermissions().catch(err => {
  console.error('Error fixing permissions:', err);
  pool.end();
  process.exit(1);
});
