-- =====================================================================
-- SGC ERP / NEXUS ERP - MIGRACIONES INCREMENTALES E IDEMPOTENTES
-- Versión: 2da Revisión Integral (Septiembre 2026)
-- =====================================================================

BEGIN;

-- 1. Añadir columnas faltantes requeridas por controladores
ALTER TABLE accounts_receivable ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE discount_authorizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- 2. Restricciones e Índices únicos para prevenir carreras de concurrencia

-- 2.1 Inventario: evitar duplicados cuando variant_id es NULL o NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventories_unique_prod 
  ON inventories (warehouse_id, product_id) 
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventories_unique_var 
  ON inventories (warehouse_id, product_id, variant_id) 
  WHERE variant_id IS NOT NULL;

-- 2.2 Sesiones de caja: garantizar que solo exista 1 sesión abierta por caja y por usuario
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_register_session 
  ON cash_sessions (cash_register_id) 
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_user_session 
  ON cash_sessions (user_id) 
  WHERE status = 'open';

-- 3. Catálogo completo de permisos de la aplicación (28 permisos)
INSERT INTO permissions (slug, module, name, description) VALUES
  ('sales.view', 'sales', 'Ver Ventas', 'Permite visualizar el historial de ventas'),
  ('sales.create', 'sales', 'Crear Ventas y Facturación', 'Permite facturar ventas en POS'),
  ('sales.cancel', 'sales', 'Anular Ventas', 'Permite anular ventas y emitir B04'),
  ('sales.return', 'sales', 'Notas de Crédito y Devoluciones', 'Permite emitir devoluciones parciales y totales'),
  ('sales.edit_price', 'sales', 'Editar Precios', 'Permite modificar precios en facturación sin autorización'),
  ('customers.view', 'third_parties', 'Ver Clientes', 'Permite ver el directorio y saldos de clientes'),
  ('customers.manage', 'third_parties', 'Administrar Clientes', 'Permite crear y editar clientes y límites de crédito'),
  ('suppliers.view', 'third_parties', 'Ver Proveedores', 'Permite consultar el catálogo de proveedores'),
  ('suppliers.manage', 'third_parties', 'Administrar Proveedores', 'Permite crear y editar proveedores'),
  ('purchases.view', 'purchases', 'Ver Compras', 'Permite consultar el historial de compras'),
  ('purchases.create', 'purchases', 'Registrar Compras', 'Permite registrar compras e ingreso de mercancía'),
  ('inventory.view', 'inventory', 'Ver Inventario', 'Permite ver existencias, lotes y kardex'),
  ('inventory.adjust', 'inventory', 'Ajustar Inventario', 'Permite realizar ajustes manuales de stock'),
  ('inventory.transfer', 'inventory', 'Transferencias', 'Permite transferir mercancía entre almacenes'),
  ('cxc.view', 'finance', 'Ver Cuentas por Cobrar', 'Permite ver facturas por cobrar y antigüedad de saldos'),
  ('cxc.pay', 'finance', 'Registrar Cobros', 'Permite registrar cobros a clientes'),
  ('cxp.view', 'finance', 'Ver Cuentas por Pagar', 'Permite ver facturas por pagar a proveedores'),
  ('cxp.pay', 'finance', 'Registrar Pagos', 'Permite registrar pagos a proveedores'),
  ('cash.view', 'cash', 'Ver Caja', 'Permite consultar sesiones y arqueos de caja'),
  ('cash.open', 'cash', 'Abrir Caja', 'Permite aperturar turno de caja'),
  ('cash.withdraw', 'cash', 'Movimientos de Caja', 'Permite registrar depósitos y retiros de caja chica'),
  ('cash.close', 'cash', 'Cerrar Caja', 'Permite cuadrar y cerrar sesión de caja'),
  ('cash.manage', 'cash', 'Supervisión de Cajas', 'Permite supervisar y operar sesiones de otros cajeros'),
  ('reports.view', 'reports', 'Ver Reportes', 'Permite acceder al centro de reportes y ventas por vendedor'),
  ('dashboard.view', 'dashboard', 'Ver Dashboard', 'Permite ver métricas clave del negocio'),
  ('fiscal.manage', 'fiscal', 'Gestión Fiscal NCF', 'Permite configurar secuencias DGII'),
  ('settings.manage', 'settings', 'Configuración y Backups', 'Permite cambiar ajustes de empresa y copias de seguridad'),
  ('salespeople.view', 'salespeople', 'Ver Vendedores', 'Permite visualizar catálogo y metas de vendedores'),
  ('salespeople.create', 'salespeople', 'Crear Vendedores', 'Permite registrar nuevos vendedores'),
  ('salespeople.edit', 'salespeople', 'Editar Vendedores', 'Permite modificar comisiones y datos de vendedores'),
  ('users.manage', 'admin', 'Administrar Usuarios y Roles', 'Permite crear y actualizar usuarios y asignar permisos'),
  ('audit.view', 'admin', 'Ver Auditoría', 'Permite ver los registros de auditoría del sistema')
ON CONFLICT (slug) DO UPDATE SET
  module = EXCLUDED.module,
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 4. Asignar permisos completos a roles administrativos (admin, super-admin, gerente)
-- 4.1 Super Administrador / Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN ('admin', 'super-admin')
ON CONFLICT DO NOTHING;

-- 4.2 Gerente General (todos excepto gestión profunda de usuarios y backups críticos)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'gerente'
  AND p.slug NOT IN ('settings.manage')
ON CONFLICT DO NOTHING;

-- 4.3 Cajero Principal
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'cajero'
  AND p.slug IN (
    'sales.view', 'sales.create', 'sales.return',
    'customers.view',
    'cash.view', 'cash.open', 'cash.withdraw', 'cash.close',
    'cxc.view', 'cxc.pay'
  )
ON CONFLICT DO NOTHING;

-- 4.4 Vendedor Comercial
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'vendedor'
  AND p.slug IN (
    'sales.view', 'sales.create',
    'customers.view', 'customers.manage',
    'inventory.view', 'dashboard.view'
  )
ON CONFLICT DO NOTHING;

-- 4.5 Encargado de Cobros
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'cobros'
  AND p.slug IN (
    'cxc.view', 'cxc.pay', 'customers.view', 'reports.view'
  )
ON CONFLICT DO NOTHING;

-- 4.6 Encargado de Almacén
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'almacen'
  AND p.slug IN (
    'inventory.view', 'inventory.adjust', 'inventory.transfer',
    'purchases.view', 'purchases.create', 'suppliers.view'
  )
ON CONFLICT DO NOTHING;

COMMIT;
