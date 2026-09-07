const bcrypt = require('bcryptjs');
const { db, runTransaction } = require('./db');
const { initSchema } = require('./schema');

function runSeed() {
  initSchema();

  // Check if company already seeded with full dataset
  const existingCompany = db.prepare('SELECT id FROM companies WHERE tax_id = ?').get('131-98765-4');
  const existingSalespeople = db.prepare("SELECT count(*) as count FROM salespeople").get();
  if (existingCompany && existingSalespeople && existingSalespeople.count >= 5) {
    console.log('Database already fully seeded with enterprise dataset. Skipping.');
    return;
  }

  runTransaction(() => {
    console.log('Seeding enterprise ERP dataset for República Dominicana (Cambri Comercial)...');

    // Clean old data if partial
    try {
      db.prepare("DELETE FROM sales").run();
      db.prepare("DELETE FROM customers").run();
      db.prepare("DELETE FROM salespeople").run();
      db.prepare("DELETE FROM products").run();
      db.prepare("DELETE FROM suppliers").run();
    } catch (e) {}

    // 1. COMPANY
    let company = db.prepare('SELECT id FROM companies WHERE tax_id = ?').get('131-98765-4');
    let companyId;
    if (!company) {
      const insertCompany = db.prepare(`
        INSERT INTO companies (name, legal_name, tax_id, phone, email, address, city, country, currency, currency_symbol, allow_negative_inventory, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const compRes = insertCompany.run(
        'Comercial Cambri SRL',
        'Comercial Cambri SRL',
        '131-98765-4',
        '809-555-0199',
        'contacto@cambri.com.do',
        'Av. Winston Churchill #105, Piantini',
        'Santo Domingo',
        'República Dominicana',
        'DOP',
        'RD$',
        0,
        'active'
      );
      companyId = compRes.lastInsertRowid;
    } else {
      companyId = company.id;
    }

    // 2. BRANCHES & WAREHOUSES
    let branch1 = db.prepare('SELECT id FROM branches WHERE company_id = ? AND code = ?').get(companyId, 'SUC-01');
    let branch1Id = branch1 ? branch1.id : null;
    let branch2 = db.prepare('SELECT id FROM branches WHERE company_id = ? AND code = ?').get(companyId, 'SUC-02');
    let branch2Id = branch2 ? branch2.id : null;

    if (!branch1Id) {
      const insertBranch = db.prepare(`
        INSERT INTO branches (company_id, name, code, phone, email, address, city, is_main, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      branch1Id = insertBranch.run(companyId, 'Sucursal Principal Santo Domingo', 'SUC-01', '809-555-0101', 'principal@cambri.com.do', 'Av. Winston Churchill #105', 'Santo Domingo', 1, 'active').lastInsertRowid;
      branch2Id = insertBranch.run(companyId, 'Sucursal Santiago', 'SUC-02', '809-555-0202', 'santiago@cambri.com.do', 'Av. Juan Pablo Duarte #45', 'Santiago', 0, 'active').lastInsertRowid;
    }

    let warehouse1 = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND code = ?').get(companyId, 'ALM-01');
    let warehouse1Id = warehouse1 ? warehouse1.id : null;
    let warehouse2 = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND code = ?').get(companyId, 'ALM-02');
    let warehouse2Id = warehouse2 ? warehouse2.id : null;

    if (!warehouse1Id) {
      const insertWarehouse = db.prepare(`
        INSERT INTO warehouses (company_id, branch_id, name, code, is_default, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      warehouse1Id = insertWarehouse.run(companyId, branch1Id, 'Almacén Central Churchill', 'ALM-01', 1, 'active').lastInsertRowid;
      warehouse2Id = insertWarehouse.run(companyId, branch2Id, 'Almacén Santiago Norte', 'ALM-02', 1, 'active').lastInsertRowid;
    }

    // Cash Registers
    const existingRegisters = db.prepare('SELECT id FROM cash_registers WHERE company_id = ?').all(companyId);
    if (existingRegisters.length === 0) {
      const insertRegister = db.prepare(`
        INSERT INTO cash_registers (company_id, branch_id, name, code, status)
        VALUES (?, ?, ?, ?, 'active')
      `);
      insertRegister.run(companyId, branch1Id, 'Caja Principal 01', 'CAJA-01');
      insertRegister.run(companyId, branch1Id, 'Caja Secundaria 02', 'CAJA-02');
      insertRegister.run(companyId, branch2Id, 'Caja Santiago 01', 'CAJA-STG-01');
    }

    // 3. ROLES & USERS
    const existingRoles = db.prepare('SELECT id, slug FROM roles WHERE company_id = ?').all(companyId);
    let roleMap = {};
    if (existingRoles.length === 0) {
      const insertRole = db.prepare(`INSERT INTO roles (company_id, name, slug, description, is_system) VALUES (?, ?, ?, ?, ?)`);
      roleMap['admin'] = insertRole.run(companyId, 'Super Administrador', 'admin', 'Control total', 1).lastInsertRowid;
      roleMap['gerente'] = insertRole.run(companyId, 'Gerente General', 'gerente', 'Gestión operativa y reportes', 1).lastInsertRowid;
      roleMap['cajero'] = insertRole.run(companyId, 'Cajero Principal', 'cajero', 'POS y cobros', 1).lastInsertRowid;
      roleMap['vendedor'] = insertRole.run(companyId, 'Vendedor Comercial', 'vendedor', 'Facturación y clientes', 1).lastInsertRowid;
      roleMap['cobros'] = insertRole.run(companyId, 'Encargado de Cobros', 'cobros', 'Cobranzas y CxC', 1).lastInsertRowid;
      roleMap['almacen'] = insertRole.run(companyId, 'Encargado de Almacén', 'almacen', 'Inventario y kardex', 1).lastInsertRowid;
    } else {
      existingRoles.forEach(r => { roleMap[r.slug] = r.id; });
    }

    // Seed Permissions
    const allPermissions = [
      { module: 'sales', slug: 'sales.create', name: 'Crear Ventas y Facturación', description: 'Permite facturar ventas en POS' },
      { module: 'sales', slug: 'sales.cancel', name: 'Anular Ventas', description: 'Permite anular ventas y emitir B04' },
      { module: 'purchases', slug: 'purchases.create', name: 'Registrar Compras', description: 'Permite ingresar compras a proveedores' },
      { module: 'inventory', slug: 'inventory.adjust', name: 'Ajuste de Inventario', description: 'Permite ajustar stock físico y productos' },
      { module: 'inventory', slug: 'inventory.transfer', name: 'Transferencias', description: 'Permite transferir mercancía entre almacenes' },
      { module: 'finance', slug: 'cxc.pay', name: 'Registrar Cobros', description: 'Permite registrar cobros a clientes (CxC)' },
      { module: 'finance', slug: 'cxp.pay', name: 'Registrar Pagos', description: 'Permite pagar facturas a proveedores (CxP)' },
      { module: 'cash', slug: 'cash.open', name: 'Apertura de Caja', description: 'Permite abrir sesión de caja' },
      { module: 'cash', slug: 'cash.withdraw', name: 'Movimientos de Caja', description: 'Permite ingresos y retiros de caja chica' },
      { module: 'cash', slug: 'cash.close', name: 'Cierre de Caja', description: 'Permite cerrar y cuadrar sesión de caja' },
      { module: 'fiscal', slug: 'fiscal.manage', name: 'Gestión Fiscal NCF', description: 'Permite configurar secuencias DGII' },
      { module: 'settings', slug: 'settings.manage', name: 'Configuración y Backups', description: 'Permite cambiar ajustes de empresa y copias de seguridad' },
      { module: 'admin', slug: 'users.create', name: 'Crear Usuarios', description: 'Permite crear nuevos empleados en el sistema' },
      { module: 'admin', slug: 'users.update', name: 'Actualizar Usuarios', description: 'Permite modificar roles y datos de usuarios' },
      { module: 'admin', slug: 'audit.view', name: 'Ver Auditoría', description: 'Permite ver los registros de auditoría' }
    ];

    const insertPerm = db.prepare(`INSERT OR IGNORE INTO permissions (module, slug, name, description) VALUES (?, ?, ?, ?)`);
    allPermissions.forEach(p => insertPerm.run(p.module, p.slug, p.name, p.description));

    const perms = db.prepare('SELECT id, slug FROM permissions').all();
    const permMap = {};
    perms.forEach(p => { permMap[p.slug] = p.id; });

    const insertRolePerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);
    const allPermIds = Object.values(permMap);
    if (roleMap['admin']) allPermIds.forEach(pId => insertRolePerm.run(roleMap['admin'], pId));
    if (roleMap['gerente']) allPermIds.forEach(pId => insertRolePerm.run(roleMap['gerente'], pId));

    const cajeroPerms = ['sales.create', 'sales.cancel', 'cxc.pay', 'cash.open', 'cash.withdraw', 'cash.close'];
    if (roleMap['cajero']) cajeroPerms.forEach(s => permMap[s] && insertRolePerm.run(roleMap['cajero'], permMap[s]));

    const vendedorPerms = ['sales.create', 'cxc.pay'];
    if (roleMap['vendedor']) vendedorPerms.forEach(s => permMap[s] && insertRolePerm.run(roleMap['vendedor'], permMap[s]));

    const cobrosPerms = ['cxc.pay', 'sales.create', 'cash.open', 'cash.close'];
    if (roleMap['cobros']) cobrosPerms.forEach(s => permMap[s] && insertRolePerm.run(roleMap['cobros'], permMap[s]));

    const almacenPerms = ['inventory.adjust', 'inventory.transfer', 'purchases.create'];
    if (roleMap['almacen']) almacenPerms.forEach(s => permMap[s] && insertRolePerm.run(roleMap['almacen'], permMap[s]));

    const salt = bcrypt.genSaltSync(10);
    const pwdHash = bcrypt.hashSync('Admin123!', salt);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (company_id, branch_id, role_id, username, first_name, last_name, id_card, email, phone, password_hash, job_title, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const uAdmin = insertUser.run(companyId, branch1Id, roleMap['admin'] || 1, 'admin', 'Lic. Eduardo', 'Paredes', '001-1234567-8', 'admin@cambri.com.do', '809-555-0100', pwdHash, 'Director General', 'active').lastInsertRowid;
    const uGerente = insertUser.run(companyId, branch1Id, roleMap['gerente'] || 2, 'gerente', 'Marcos', 'Villanueva', '001-2345678-9', 'gerente@cambri.com.do', '809-555-0102', pwdHash, 'Gerente de Operaciones', 'active').lastInsertRowid;
    const uCajero = insertUser.run(companyId, branch1Id, roleMap['cajero'] || 3, 'cajero', 'Yomaira', 'Bautista', '001-3456789-0', 'cajero@cambri.com.do', '809-555-0103', pwdHash, 'Cajera Central', 'active').lastInsertRowid;
    const uVendedor = insertUser.run(companyId, branch1Id, roleMap['vendedor'] || 4, 'vendedor', 'Carlos', 'Pérez', '001-4567890-1', 'cperez@cambri.com.do', '809-555-0104', pwdHash, 'Ejecutivo de Ventas', 'active').lastInsertRowid;
    const uCobros = insertUser.run(companyId, branch1Id, roleMap['cobros'] || 4, 'cobros', 'Patricia', 'Peña', '001-5678901-2', 'cobros@cambri.com.do', '809-555-0105', pwdHash, 'Analista de Crédito y Cobros', 'active').lastInsertRowid;
    const uAlmacen = insertUser.run(companyId, branch1Id, roleMap['almacen'] || 5, 'almacen', 'Ramón', 'Castillo', '001-6789012-3', 'almacen@cambri.com.do', '809-555-0106', pwdHash, 'Jefe de Almacén', 'active').lastInsertRowid;

    // 4. SALESPEOPLE (5 VENDEDORES OFICIALES)
    console.log('Seeding 5 Salespeople...');
    const insertSalesperson = db.prepare(`
      INSERT INTO salespeople (company_id, user_id, code, name, phone, email, zone, monthly_goal, commission_rate, hire_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const s1 = insertSalesperson.run(companyId, uVendedor, 'VEND-001', 'Carlos Pérez', '809-555-1101', 'cperez@cambri.com.do', 'Zona Metro (Distrito Nacional)', 350000.00, 5.00, '2024-01-15', 'active').lastInsertRowid;
    const s2 = insertSalesperson.run(companyId, null, 'VEND-002', 'Ana Rosario', '809-555-1102', 'arosario@cambri.com.do', 'Zona Norte (Santiago / La Vega)', 400000.00, 5.50, '2024-03-01', 'active').lastInsertRowid;
    const s3 = insertSalesperson.run(companyId, null, 'VEND-003', 'Juan Tejada', '809-555-1103', 'jtejada@cambri.com.do', 'Zona Este (La Romana / Bávaro)', 300000.00, 6.00, '2024-06-10', 'active').lastInsertRowid;
    const s4 = insertSalesperson.run(companyId, null, 'VEND-004', 'Laura Méndez', '809-555-1104', 'lmendez@cambri.com.do', 'Zona Sur (San Cristóbal / Baní)', 250000.00, 5.00, '2024-08-20', 'active').lastInsertRowid;
    const s5 = insertSalesperson.run(companyId, null, 'VEND-005', 'Miguel Almonte', '809-555-1105', 'malmonte@cambri.com.do', 'Santo Domingo Este / Boca Chica', 320000.00, 5.00, '2025-01-10', 'active').lastInsertRowid;

    const salespeopleIds = [s1, s2, s3, s4, s5];

    // 5. CATEGORIES & BRANDS
    const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (company_id, name, description) VALUES (?, ?, ?)`);
    const catDyes = insertCat.run(companyId, 'Coloración & Tintes', 'Líneas profesionales de coloración permanente y demi-permanente').lastInsertRowid || 1;
    const catCare = insertCat.run(companyId, 'Cuidado Capilar', 'Tratamientos, botox capilar, mascarillas, sérums y champús').lastInsertRowid || 2;
    const catOxidants = insertCat.run(companyId, 'Oxidantes & Decolorantes', 'Oxidantes en crema y polvos decolorantes técnicos').lastInsertRowid || 3;
    const catTools = insertCat.run(companyId, 'Accesorios & Herramientas', 'Capas, brochas de tinte, tazones medidores y guantes').lastInsertRowid || 4;
    const catFootwear = insertCat.run(companyId, 'Calzado & Moda Deportiva', 'Calzado y complementos').lastInsertRowid || 5;

    const insertBrand = db.prepare(`INSERT OR IGNORE INTO brands (company_id, name) VALUES (?, ?)`);
    const brSalerm = insertBrand.run(companyId, 'Salerm Cosmetics').lastInsertRowid || 1;
    const brLoreal = insertBrand.run(companyId, "L'Oréal Professionnel").lastInsertRowid || 2;
    const brAlfaparf = insertBrand.run(companyId, 'Alfaparf Milano').lastInsertRowid || 3;
    const brWella = insertBrand.run(companyId, 'Wella Professionals').lastInsertRowid || 4;
    const brNike = insertBrand.run(companyId, 'Nike').lastInsertRowid || 5;

    const insertUnit = db.prepare(`INSERT OR IGNORE INTO units (company_id, name, code) VALUES (?, ?, ?)`);
    const uTubo = insertUnit.run(companyId, 'Tubo 60g / 100ml', 'TUBO').lastInsertRowid || 1;
    const uUnd = insertUnit.run(companyId, 'Unidad', 'UND').lastInsertRowid || 2;
    const uLitro = insertUnit.run(companyId, 'Litro / 1000ml', 'LT').lastInsertRowid || 3;

    // 6. PRICE LISTS
    const insertPriceList = db.prepare(`INSERT OR IGNORE INTO price_lists (company_id, name, description, is_default) VALUES (?, ?, ?, ?)`);
    const plGeneral = insertPriceList.run(companyId, 'Detalle / Salones Regulares', 'Precio base de mostrador y salones pequeños', 1).lastInsertRowid || 1;
    const plMayorista = insertPriceList.run(companyId, 'Distribuidor Mayorista', 'Precio preferencial para cadenas de salones', 0).lastInsertRowid || 2;

    // 7. 65+ PRODUCTS (INCLUDING COMPREHENSIVE DYE MATRIX)
    console.log('Seeding 65+ products and dye shade matrix...');
    const insertProduct = db.prepare(`
      INSERT INTO products (
        company_id, category_id, brand_id, unit_id, internal_code, sku, barcode, name,
        description, type, line, shade_number, family, is_dye, color_hex, cost, price,
        min_price, special_price, tax_rate, stock_min, stock_max, location, allows_discount, max_discount_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const dyeShades = [
      { shade: '1.0', name: 'Negro Ébano Natural', hex: '#0e0e10', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '3.0', name: 'Castaño Oscuro Intenso', hex: '#241712', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '4.0', name: 'Castaño Medio', hex: '#3b2416', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '5.0', name: 'Castaño Claro', hex: '#4e2f1b', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '5.1', name: 'Castaño Claro Cenizo Humo', hex: '#523c31', family: 'Cenizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '5.2', name: 'Castaño Claro Irisado Violeta', hex: '#4a2630', family: 'Irisados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '5.3', name: 'Castaño Claro Dorado Miel', hex: '#634220', family: 'Dorados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '5.4', name: 'Castaño Claro Cobrizo Canela', hex: '#6b3218', family: 'Cobrizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '6.0', name: 'Rubio Oscuro Clásico', hex: '#694726', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '6.1', name: 'Rubio Oscuro Cenizo', hex: '#6b5440', family: 'Cenizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '6.2', name: 'Rubio Oscuro Irisado Malva', hex: '#613f45', family: 'Irisados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '6.3', name: 'Rubio Oscuro Dorado Ámbar', hex: '#7a5726', family: 'Dorados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '6.4', name: 'Rubio Oscuro Cobrizo Bronce', hex: '#873d1a', family: 'Cobrizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '6.66', name: 'Rubio Oscuro Rojo Fuego Intenso', hex: '#9e1414', family: 'Rojos', cost: 230.00, price: 435.00, brand: brSalerm },
      { shade: '7.0', name: 'Rubio Medio Natural', hex: '#8c663b', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '7.1', name: 'Rubio Medio Cenizo Platino', hex: '#8a745c', family: 'Cenizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '7.3', name: 'Rubio Medio Dorado Trigo', hex: '#9e7939', family: 'Dorados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '7.44', name: 'Rubio Cobrizo Intenso Pasión', hex: '#b54b18', family: 'Cobrizos', cost: 230.00, price: 435.00, brand: brSalerm },
      { shade: '8.0', name: 'Rubio Claro Champagne', hex: '#b08b54', family: 'Naturales', cost: 210.00, price: 395.00, brand: brSalerm },
      { shade: '8.1', name: 'Rubio Claro Cenizo Perlado', hex: '#ad9b7f', family: 'Cenizos', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '8.3', name: 'Rubio Claro Dorado Vainilla', hex: '#bfa052', family: 'Dorados', cost: 220.00, price: 415.00, brand: brSalerm },
      { shade: '9.0', name: 'Rubio Muy Claro Luminoso', hex: '#d4b179', family: 'Naturales', cost: 215.00, price: 410.00, brand: brSalerm },
      { shade: '9.1', name: 'Rubio Muy Claro Cenizo Hielo', hex: '#cec0a7', family: 'Cenizos', cost: 225.00, price: 425.00, brand: brSalerm },
      { shade: '10.0', name: 'Rubio Platino Extra Claro', hex: '#ebd59d', family: 'Aclarantes', cost: 225.00, price: 430.00, brand: brSalerm },
      { shade: '10.1', name: 'Rubio Platino Ultra Cenizo', hex: '#e6ded0', family: 'Aclarantes', cost: 235.00, price: 450.00, brand: brSalerm },
      { shade: '0.00', name: 'Booster Aclarador Neutral', hex: '#fdfdfd', family: 'Aclarantes', cost: 240.00, price: 460.00, brand: brSalerm }
    ];

    const createdProductIds = [];

    dyeShades.forEach((d, idx) => {
      const internalCode = `TIN-${d.shade.replace('.', '')}`;
      const sku = `SAL-TIN-${d.shade}`;
      const barcode = `75010020${1000 + idx}`;
      const name = `Tinte Salerm Vison #${d.shade} ${d.name}`;
      const res = insertProduct.run(
        companyId, catDyes, d.brand, uTubo, internalCode, sku, barcode, name,
        `Coloración permanente profesional con aceites tratantes de germen de trigo. Matiz ${d.shade}`,
        'physical', 'Coloración Permanente Profesional', d.shade, d.family, 1, d.hex,
        d.cost, d.price, d.cost * 1.3, d.price * 0.9, 18.00, 10.00, 300.00, `Estante C-${Math.floor(idx/5)+1}`, 1, 15.00
      );
      createdProductIds.push(res.lastInsertRowid);
    });

    // Hair Care & Treatments (18 products)
    const hairCareProducts = [
      { name: "Botox Capilar Reconstructor Termoactivo 1000ml", sku: 'ALF-BTX-1000', price: 2850.00, cost: 1450.00, cat: catCare, br: brAlfaparf, unit: uLitro },
      { name: "Mascarilla Nutritiva Reparación Profunda Keratina 500g", sku: 'SAL-MK-500', price: 950.00, cost: 480.00, cat: catCare, br: brSalerm, unit: uUnd },
      { name: "Sérum Brillo & Sellador de Puntas Aceite de Argán 120ml", sku: 'SAL-ARG-120', price: 680.00, cost: 320.00, cat: catCare, br: brSalerm, unit: uUnd },
      { name: "Champú Sin Sulfatos Post-Color 1000ml", sku: 'LOR-SHP-1000', price: 1450.00, cost: 780.00, cat: catCare, br: brLoreal, unit: uLitro },
      { name: "Acondicionador Sellador Ácido pH 4.5 1000ml", sku: 'LOR-ACD-1000', price: 1550.00, cost: 820.00, cat: catCare, br: brLoreal, unit: uLitro },
      { name: "Caja Ampollas Anticaída Fortalecedoras (12 x 10ml)", sku: 'ALF-AMP-12', price: 1250.00, cost: 650.00, cat: catCare, br: brAlfaparf, unit: uUnd },
      { name: "Tratamiento Plex Fortalecedor de Puentes 250ml", sku: 'WEL-PLX-250', price: 1850.00, cost: 980.00, cat: catCare, br: brWella, unit: uUnd },
      { name: "Crema Alisadora Permanente Forte 1000ml", sku: 'SAL-ALI-1000', price: 2400.00, cost: 1200.00, cat: catCare, br: brSalerm, unit: uLitro },
      { name: "Gel Modelador Fijación Fuerte Rizos 500ml", sku: 'SAL-GEL-500', price: 550.00, cost: 260.00, cat: catCare, br: brSalerm, unit: uUnd },
      { name: "Laca Fijadora Extra Secado Rápido 750ml", sku: 'LOR-LAC-750', price: 890.00, cost: 430.00, cat: catCare, br: brLoreal, unit: uUnd },
      { name: "Matizador Rubio Cenizo Anti-Amarillo Silver 500ml", sku: 'LOR-MAT-500', price: 1150.00, cost: 580.00, cat: catCare, br: brLoreal, unit: uUnd },
      { name: "Termoprotector Alisado Pro Keratin 250ml", sku: 'ALF-THP-250', price: 790.00, cost: 380.00, cat: catCare, br: brAlfaparf, unit: uUnd }
    ];

    hairCareProducts.forEach((p, idx) => {
      const res = insertProduct.run(
        companyId, p.cat, p.br, p.unit, `CARE-${idx+1}`, p.sku, `75020030${2000 + idx}`, p.name,
        'Tratamiento capilar profesional de alta gama para salones de belleza', 'physical',
        'Línea Cuidado y Reconstrucción Capilar', null, 'Cuidado', 0, '#e5e7eb',
        p.cost, p.price, p.cost * 1.35, p.price * 0.92, 18.00, 8.00, 200.00, `Estante T-${idx+1}`, 1, 15.00
      );
      createdProductIds.push(res.lastInsertRowid);
    });

    // Oxidants & Bleach (8 products)
    const oxidants = [
      { name: 'Oxidante en Crema 10 Volúmenes 1000ml', sku: 'OXI-10V-1000', price: 420.00, cost: 190.00 },
      { name: 'Oxidante en Crema 20 Volúmenes 1000ml', sku: 'OXI-20V-1000', price: 420.00, cost: 190.00 },
      { name: 'Oxidante en Crema 30 Volúmenes 1000ml', sku: 'OXI-30V-1000', price: 440.00, cost: 200.00 },
      { name: 'Oxidante en Crema 40 Volúmenes 1000ml', sku: 'OXI-40V-1000', price: 460.00, cost: 210.00 },
      { name: 'Polvo Decolorante Azul Anti-Reflejos 500g', sku: 'DEC-BLU-500', price: 950.00, cost: 460.00 },
      { name: 'Polvo Decolorante Blanco Ultra 9 Tonos 500g', sku: 'DEC-WHT-500', price: 1100.00, cost: 530.00 }
    ];

    oxidants.forEach((o, idx) => {
      const res = insertProduct.run(
        companyId, catOxidants, brSalerm, uLitro, `OXI-${idx+1}`, o.sku, `75030040${3000 + idx}`, o.name,
        'Fórmula estabilizada con agentes acondicionadores para decoloración y tinte', 'physical',
        'Línea Oxidantes y Decolorantes Técnicos', null, 'Químicos', 0, '#f3f4f6',
        o.cost, o.price, o.cost * 1.3, o.price * 0.9, 18.00, 15.00, 500.00, 'Zona Química A', 1, 10.00
      );
      createdProductIds.push(res.lastInsertRowid);
    });

    // Salon Accessories (8 products)
    const accessories = [
      { name: 'Capa Profesional de Corte Impermeable Negra', sku: 'CAP-CORTE-BLK', price: 350.00, cost: 150.00 },
      { name: 'Tazón Medidor de Tinte con Agarre y Escala', sku: 'TAZ-TINTE-PRO', price: 120.00, cost: 45.00 },
      { name: 'Brocha Ancha Profesional para Tinte y Mechas', sku: 'BRO-TINTE-ANC', price: 95.00, cost: 35.00 },
      { name: 'Paquete Guantes de Nitrilo Negro Resiste Químicos (100u)', sku: 'GUA-NIT-100', price: 480.00, cost: 240.00 },
      { name: 'Papel Térmico Reutilizable para Balayage y Mechas (100u)', sku: 'PAP-BAL-100', price: 550.00, cost: 250.00 },
      { name: 'Pinzas de Peluquería Cocodrilo Antideslizantes (Pack 6u)', sku: 'PIN-COC-6PK', price: 280.00, cost: 110.00 }
    ];

    accessories.forEach((a, idx) => {
      const res = insertProduct.run(
        companyId, catTools, brSalerm, uUnd, `ACC-${idx+1}`, a.sku, `75040050${4000 + idx}`, a.name,
        'Accesorios y herramientas indispensables para salones y estilistas', 'physical',
        'Herramientas y Accesorios de Salón', null, 'Accesorios', 0, '#e5e7eb',
        a.cost, a.price, a.cost * 1.4, a.price * 0.95, 18.00, 10.00, 300.00, 'Estante H-1', 1, 10.00
      );
      createdProductIds.push(res.lastInsertRowid);
    });

    // Sports footwear / apparel (6 products)
    const sports = [
      { name: 'Nike Air Max 90 Classic', sku: 'NIKE-AM90', price: 7500.00, cost: 4200.00, cat: catFootwear, br: brNike, code: 'PROD-001' },
      { name: 'Camiseta Adidas DryFit Running', sku: 'ADI-DRY-TSHIRT', price: 1850.00, cost: 900.00, cat: catFootwear, br: brSalerm, code: 'PROD-002' },
      { name: 'Mochila Puma Training Pro', sku: 'PUMA-BP-PRO', price: 2400.00, cost: 1200.00, cat: catFootwear, br: brSalerm, code: 'PROD-003' }
    ];
    sports.forEach((s) => {
      const res = insertProduct.run(
        companyId, s.cat, s.br, uUnd, s.code, s.sku, `745300${Math.floor(Math.random()*899999)+100000}`, s.name,
        'Calzado y prendas deportivas de alta durabilidad', 'physical',
        'Línea Deportiva', null, 'General', 0, '#3b82f6',
        s.cost, s.price, s.cost * 1.3, s.price * 0.9, 18.00, 5.00, 100.00, 'Almacén 2', 1, 10.00
      );
      createdProductIds.push(res.lastInsertRowid);
    });

    // 8. SUPPLIERS (8 REALISTIC DOMINICAN SUPPLIERS)
    console.log('Seeding 8 suppliers...');
    const insertSupp = db.prepare(`
      INSERT INTO suppliers (company_id, code, company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit, credit_days, current_balance, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const supp1 = insertSupp.run(companyId, 'PROV-001', 'Distribuidora Cosmética del Caribe SAS', 'Cosmética Caribe', '101-55443-2', '809-540-9988', 'pedidos@cosmeticacaribe.com.do', 'Zona Industrial Herrera #45', 'Santo Domingo', 'Lic. Pedro Valdéz', 800000.00, 45, 145000.00, 'Distribuidor oficial de Salerm en RD').lastInsertRowid;
    const supp2 = insertSupp.run(companyId, 'PROV-002', 'L’Oréal Caribe Dominicana SRL', 'L’Oréal RD', '130-88776-5', '809-567-2233', 'ventas@lorealcaribe.com.do', 'Torre Novo-Centro Piso 12, Naco', 'Santo Domingo', 'Sandra Almánzar', 1200000.00, 60, 230000.00, 'Importador directo de tintes y champús L’Oréal').lastInsertRowid;
    const supp3 = insertSupp.run(companyId, 'PROV-003', 'Alfaparf Milano Dominicana SRL', 'Alfaparf RD', '131-44556-7', '809-333-8899', 'contacto@alfaparf.do', 'Av. San Martín #180', 'Santo Domingo', 'Ing. Roberto De León', 600000.00, 30, 85000.00, 'Proveedor de botox capilar y líneas Milano').lastInsertRowid;
    const supp4 = insertSupp.run(companyId, 'PROV-004', 'Suplidora Capilar del Cibao SRL', 'Capilar Cibao', '102-99881-4', '809-582-4411', 'ventas@capilarcibao.com', 'Av. 27 de Febrero #88', 'Santiago', 'Carmen Ortiz', 500000.00, 30, 0.00, 'Insumos capilares y accesorios en la región norte').lastInsertRowid;
    const supp5 = insertSupp.run(companyId, 'PROV-005', 'Envases & Accesorios Plásticos SAS', 'EnvaPlast RD', '132-77665-1', '809-560-1234', 'info@envaplast.com.do', 'Carretera Sánchez Km 8.5', 'Santo Domingo', 'Felipe Santos', 300000.00, 15, 22000.00, 'Fabricante de tazones, brochas y atomizadores').lastInsertRowid;
    const supp6 = insertSupp.run(companyId, 'PROV-006', 'Químicos & Formulaciones del Este SRL', 'QuimiEste', '131-00992-3', '809-550-6789', 'ordenes@quimieste.com', 'Zona Franca La Romana #14', 'La Romana', 'Milagros Cruz', 400000.00, 30, 60000.00, 'Fabricación y distribución de peróxidos y decolorantes').lastInsertRowid;
    const supp7 = insertSupp.run(companyId, 'PROV-007', 'Importadora Textil Global SRL', 'Global Textil', '101-77889-9', '809-567-9911', 'contacto@globaltextil.do', 'Av. John F. Kennedy #50', 'Santo Domingo', 'Manuel Henríquez', 450000.00, 30, 0.00, 'Capas profesionales y uniformes térmicos').lastInsertRowid;
    const supp8 = insertSupp.run(companyId, 'PROV-008', 'Distribuidora Deportiva del Caribe SAS', 'Caribe Sports', '101-33221-8', '809-540-1122', 'ventas@caribesports.com.do', 'Av. Luperón #12', 'Santo Domingo', 'Patricia Morales', 500000.00, 30, 45000.00, 'Zapatillas y ropa deportiva').lastInsertRowid;

    // 9. 28 REALISTIC DOMINICAN CUSTOMERS WITH ASSIGNED SALESPEOPLE & GPS
    console.log('Seeding 28 realistic Dominican customers...');
    const insertCust = db.prepare(`
      INSERT INTO customers (
        company_id, code, salesperson_id, price_list_id, person_type, first_name, last_name, company_name,
        id_card, tax_id, email, phone, mobile, address, province, municipality, sector, city,
        latitude, longitude, contact_person, customer_type, credit_condition, credit_limit, credit_days,
        current_balance, credit_notes_balance, is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices,
        delivery_type, risk_score, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const customersData = [
      // Zona Metro (Carlos Pérez - s1)
      { code: 'CLI-001', name: 'Glamour Beauty Lounge SRL', rnc: '131-45678-9', phone: '809-541-2020', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Piantini', lat: 18.4725, lng: -69.9328, sp: s1, lim: 150000, days: 30, bal: 95000, blocked: 0, type: 'Salón de Belleza VIP', risk: 'medium', notes: 'Excelente volumen mensual de tintes Salerm y botox' },
      { code: 'CLI-002', name: 'Centro de Belleza D’Yomaira', rnc: '001-0987654-3', phone: '809-565-3344', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Bella Vista', lat: 18.4512, lng: -69.9540, sp: s1, lim: 80000, days: 15, bal: 25000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Paga puntualmente quincenal' },
      { code: 'CLI-003', name: 'Distribuidora Capilar Bella SRL', rnc: '130-99881-2', phone: '809-688-4455', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Gazcue', lat: 18.4710, lng: -69.9020, sp: s1, lim: 250000, days: 45, bal: 235000, blocked: 0, type: 'Distribuidor Mayorista', risk: 'high', notes: 'Crédito casi al tope. Próximo a vencer balance mayor' },
      { code: 'CLI-004', name: 'Studio 54 Hair & Nails', rnc: '001-1122334-5', phone: '809-482-1010', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Naco', lat: 18.4780, lng: -69.9270, sp: s1, lim: 100000, days: 30, bal: 0, blocked: 0, type: 'Salón de Belleza VIP', risk: 'low', notes: 'Cliente al día con crédito excelente' },
      { code: 'CLI-005', name: 'Salón Rosely & Spa', rnc: '001-5544332-1', phone: '809-534-8899', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Mirador Sur', lat: 18.4480, lng: -69.9650, sp: s1, lim: 60000, days: 30, bal: 68000, blocked: 1, type: 'Salón de Belleza', risk: 'critical', notes: 'Crédito suspendido por exceder límite de RD$ 60,000' },
      { code: 'CLI-006', name: 'Peluquería & Barbería El Conde', rnc: '101-88223-4', phone: '809-682-1122', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Zona Colonial', lat: 18.4735, lng: -69.8870, sp: s1, lim: 50000, days: 15, bal: 18000, blocked: 0, type: 'Barbería & Estilo', risk: 'low', notes: 'Compra quincenal tintes 1.0, 3.0 y champú sin sal' },

      // Zona Norte (Ana Rosario - s2)
      { code: 'CLI-007', name: 'Palacio de la Belleza Cibao SRL', rnc: '102-33445-6', phone: '809-581-7788', city: 'Santiago', prov: 'Santiago', mun: 'Santiago de los Caballeros', sec: 'Los Jardines Metropolitanos', lat: 19.4580, lng: -70.6890, sp: s2, lim: 300000, days: 45, bal: 210000, blocked: 0, type: 'Cadena de Salones', risk: 'medium', notes: 'El cliente más grande de Santiago. Consume 150 tubos de tinte por semana' },
      { code: 'CLI-008', name: 'Estética & Salón New Look Santiago', rnc: '031-0022334-1', phone: '809-583-9900', city: 'Santiago', prov: 'Santiago', mun: 'Santiago de los Caballeros', sec: 'Villa Olga', lat: 19.4520, lng: -70.6780, sp: s2, lim: 120000, days: 30, bal: 45000, blocked: 0, type: 'Salón de Belleza VIP', risk: 'low', notes: 'Pagos por transferencia BHD puntuales' },
      { code: 'CLI-009', name: 'Suplidora Estilo del Norte SRL', rnc: '131-88990-1', phone: '809-582-1234', city: 'Santiago', prov: 'Santiago', mun: 'Santiago de los Caballeros', sec: 'Centro Ciudad', lat: 19.4500, lng: -70.7000, sp: s2, lim: 200000, days: 30, bal: 185000, blocked: 0, type: 'Distribuidor Mayorista', risk: 'high', notes: 'Factura vencida hace 18 días. Compromiso de pago agendado' },
      { code: 'CLI-010', name: 'Salón Elegancia Real La Vega', rnc: '047-0012345-6', phone: '809-573-4567', city: 'La Vega', prov: 'La Vega', mun: 'Concepción de La Vega', sec: 'Las Carolinas', lat: 19.2220, lng: -70.5280, sp: s2, lim: 90000, days: 30, bal: 32000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Ruta de entrega todos los miércoles' },
      { code: 'CLI-011', name: 'Belleza Mágica Moca', rnc: '054-0099881-2', phone: '809-578-8811', city: 'Moca', prov: 'Espaillat', mun: 'Moca', sec: 'Centro', lat: 19.3940, lng: -70.5250, sp: s2, lim: 70000, days: 30, bal: 58000, blocked: 0, type: 'Salón de Belleza', risk: 'medium', notes: 'Prefiere línea Alfaparf y decolorantes' },
      { code: 'CLI-012', name: 'D’Carmen Salón & Spa Puerto Plata', rnc: '037-0055441-9', phone: '809-586-3322', city: 'Puerto Plata', prov: 'Puerto Plata', mun: 'San Felipe de Puerto Plata', sec: 'Playa Dorada', lat: 19.7800, lng: -70.6650, sp: s2, lim: 100000, days: 30, bal: 92000, blocked: 0, type: 'Salón de Belleza VIP', risk: 'high', notes: 'Clientes turísticos. Temporada alta genera alta rotación' },

      // Zona Este (Juan Tejada - s3)
      { code: 'CLI-013', name: 'Capilar Resort & Spa Bávaro SRL', rnc: '132-00112-9', phone: '809-552-1020', city: 'Punta Cana', prov: 'La Altagracia', mun: 'Higüey', sec: 'Bávaro', lat: 18.6850, lng: -68.4420, sp: s3, lim: 250000, days: 45, bal: 140000, blocked: 0, type: 'Spa Hotelero', risk: 'low', notes: 'Compras grandes mensuales con NCF B01 Crédito Fiscal' },
      { code: 'CLI-014', name: 'Salón Divas La Romana', rnc: '026-0044556-7', phone: '809-550-4499', city: 'La Romana', prov: 'La Romana', mun: 'La Romana', sec: 'Buena Vista', lat: 18.4280, lng: -68.9720, sp: s3, lim: 80000, days: 30, bal: 40000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Excelente relación comercial' },
      { code: 'CLI-015', name: 'Estilo & Belleza Higüey SRL', rnc: '103-88771-4', phone: '809-554-3311', city: 'Higüey', prov: 'La Altagracia', mun: 'Higüey', sec: 'Centro', lat: 18.6150, lng: -68.7080, sp: s3, lim: 110000, days: 30, bal: 115000, blocked: 1, type: 'Salón de Belleza', risk: 'critical', notes: 'Límite excedido. Requiere autorización especial de gerencia' },
      { code: 'CLI-016', name: 'San Pedro Glamour Nails & Hair', rnc: '023-0098761-1', phone: '809-529-8877', city: 'San Pedro de Macorís', prov: 'San Pedro de Macorís', mun: 'San Pedro', sec: 'Miramar', lat: 18.4550, lng: -69.3080, sp: s3, lim: 75000, days: 30, bal: 22000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Ruta este los jueves' },

      // Zona Sur (Laura Méndez - s4)
      { code: 'CLI-017', name: 'Salón San Cristóbal Fashion', rnc: '002-0045671-8', phone: '809-528-9900', city: 'San Cristóbal', prov: 'San Cristóbal', mun: 'San Cristóbal', sec: 'Madre Vieja Norte', lat: 18.4160, lng: -70.1080, sp: s4, lim: 85000, days: 30, bal: 72000, blocked: 0, type: 'Salón de Belleza', risk: 'medium', notes: 'Facturas pendientes por cobrar' },
      { code: 'CLI-018', name: 'Cosméticos & Salón Peravia Baní', rnc: '104-55667-8', phone: '809-522-3344', city: 'Baní', prov: 'Peravia', mun: 'Baní', sec: 'Centro', lat: 18.2790, lng: -70.3320, sp: s4, lim: 120000, days: 30, bal: 45000, blocked: 0, type: 'Distribuidor Mayorista', risk: 'low', notes: 'Distribuye en salones del sur profundo' },
      { code: 'CLI-019', name: 'Salón D’Yessica Azua', rnc: '010-0033221-5', phone: '809-521-1289', city: 'Azua', prov: 'Azua', mun: 'Azua de Compostela', sec: 'Pueblo Abajo', lat: 18.4530, lng: -70.7340, sp: s4, lim: 50000, days: 15, bal: 52000, blocked: 1, type: 'Salón de Belleza', risk: 'critical', notes: 'Moroso > 60 días. Bloqueado temporalmente' },
      { code: 'CLI-020', name: 'Ocoa Beauty Center', rnc: '013-0012984-7', phone: '809-558-2211', city: 'San José de Ocoa', prov: 'San José de Ocoa', mun: 'Ocoa', sec: 'Centro', lat: 18.5460, lng: -70.5060, sp: s4, lim: 60000, days: 30, bal: 15000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Cliente responsable' },

      // Santo Domingo Este & Norte (Miguel Almonte - s5)
      { code: 'CLI-021', name: 'Salón & Spa Coral Mall SDE', rnc: '131-77884-2', phone: '809-598-1144', city: 'Santo Domingo Este', prov: 'Santo Domingo', mun: 'Santo Domingo Este', sec: 'Autopista San Isidro', lat: 18.4980, lng: -69.8320, sp: s5, lim: 180000, days: 30, bal: 85000, blocked: 0, type: 'Cadena de Salones', risk: 'low', notes: 'Alto volumen en acondicionadores y queratinas' },
      { code: 'CLI-022', name: 'Megacentro Hair Studio SRL', rnc: '130-44551-9', phone: '809-592-3322', city: 'Santo Domingo Este', prov: 'Santo Domingo', mun: 'Santo Domingo Este', sec: 'Villa Faro', lat: 18.5060, lng: -69.8540, sp: s5, lim: 200000, days: 30, bal: 160000, blocked: 0, type: 'Salón de Belleza VIP', risk: 'medium', notes: 'Factura parcial pagada, balance pendiente' },
      { code: 'CLI-023', name: 'Salón Mil Maneras Ensanche Ozama', rnc: '001-8877661-2', phone: '809-594-5566', city: 'Santo Domingo Este', prov: 'Santo Domingo', mun: 'Santo Domingo Este', sec: 'Ensanche Ozama', lat: 18.4890, lng: -69.8650, sp: s5, lim: 90000, days: 30, bal: 38000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Pago con transferencias Banco Popular' },
      { code: 'CLI-024', name: 'D’Lourdes Salón Villa Mella', rnc: '001-9922114-8', phone: '809-568-1122', city: 'Santo Domingo Norte', prov: 'Santo Domingo', mun: 'Santo Domingo Norte', sec: 'Villa Mella', lat: 18.5440, lng: -69.9050, sp: s5, lim: 70000, days: 30, bal: 65000, blocked: 0, type: 'Salón de Belleza', risk: 'high', notes: 'Cerca del límite de crédito. Revisar antes de facturar' },
      { code: 'CLI-025', name: 'Boca Chica Beach Hair Studio', rnc: '001-4433228-9', phone: '809-523-4411', city: 'Boca Chica', prov: 'Santo Domingo', mun: 'Boca Chica', sec: 'Andrés', lat: 18.4520, lng: -69.6120, sp: s5, lim: 60000, days: 15, bal: 28000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Paga con tarjeta o efectivo en entrega' },
      { code: 'CLI-026', name: 'Centro Capilar Los Mina', rnc: '001-3311229-4', phone: '809-595-8822', city: 'Santo Domingo Este', prov: 'Santo Domingo', mun: 'Santo Domingo Este', sec: 'Los Mina', lat: 18.5020, lng: -69.8600, sp: s5, lim: 50000, days: 15, bal: 48000, blocked: 0, type: 'Salón de Belleza', risk: 'medium', notes: 'Visita semanal los lunes' },
      { code: 'CLI-027', name: 'Salón & Uñas Charles de Gaulle', rnc: '131-00228-4', phone: '809-597-9911', city: 'Santo Domingo Este', prov: 'Santo Domingo', mun: 'Santo Domingo Este', sec: 'Charles de Gaulle', lat: 18.5200, lng: -69.8390, sp: s5, lim: 80000, days: 30, bal: 12000, blocked: 0, type: 'Salón de Belleza', risk: 'low', notes: 'Cliente al día y compras constantes' },
      { code: 'CLI-028', name: 'Consumidor Final Mostrador Churchill', rnc: '000-0000000-0', phone: '809-555-0199', city: 'Santo Domingo', prov: 'Distrito Nacional', mun: 'Santo Domingo', sec: 'Piantini', lat: 18.4725, lng: -69.9328, sp: s1, lim: 0, days: 0, bal: 0, blocked: 0, type: 'Consumidor Final', risk: 'low', notes: 'Ventas de contado al por menor con NCF B02' }
    ];

    const customerMap = {};

    customersData.forEach((c) => {
      const res = insertCust.run(
        companyId, c.code, c.sp, plGeneral, c.rnc.startsWith('1') ? 'juridica' : 'natural',
        c.name.split(' ')[0], c.name.split(' ').slice(1).join(' '), c.name,
        c.rnc.startsWith('0') ? c.rnc : null, c.rnc.startsWith('1') ? c.rnc : null,
        `contacto@${c.code.toLowerCase()}.com.do`, c.phone, c.phone, `${c.sec}, ${c.city}`,
        c.prov, c.mun, c.sec, c.city, c.lat, c.lng, `${c.name.split(' ')[1] || 'Doña'} Propietaria`,
        c.type, c.lim > 0 ? 'credit' : 'cash', c.lim, c.days, c.bal, 0.00, c.blocked, 0, 0,
        'Ruta Estándar', c.risk, c.notes, c.blocked ? 'blocked' : 'active'
      );
      customerMap[c.code] = res.lastInsertRowid;
    });

    // 10. INVENTORY STOCK & BATCHES (LOTS)
    console.log('Seeding inventory stock in warehouses and lots...');
    const insertInv = db.prepare(`
      INSERT OR REPLACE INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity, reserved_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLot = db.prepare(`
      INSERT INTO inventory_lots (company_id, warehouse_id, product_id, variant_id, supplier_id, lot_number, purchase_date, entry_date, expiration_date, initial_quantity, current_quantity, unit_cost, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (
        company_id, branch_id, warehouse_id, product_id, variant_id, user_id, movement_type,
        previous_quantity, quantity, new_quantity, unit_cost, total_cost, reference_type, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    createdProductIds.forEach((pid, idx) => {
      // Stock levels: Some high, some medium, some low (<10), some 0
      let qty = 45.00;
      if (idx % 7 === 0) qty = 4.00; // Low stock
      else if (idx === 14) qty = 0.00; // Out of stock (Rubio 7.0)
      else if (idx % 3 === 0) qty = 85.00; // High stock
      else qty = 28.00;

      insertInv.run(companyId, branch1Id, warehouse1Id, pid, null, qty, 0.00);

      // Create lot
      if (qty > 0) {
        insertLot.run(
          companyId, warehouse1Id, pid, null, supp1, `LOTE-2026-${100 + idx}`,
          '2026-07-15', '2026-07-18', '2028-07-30', qty + 20, qty, 210.00, 'active'
        );
      }

      insertMovement.run(
        companyId, branch1Id, warehouse1Id, pid, null, uAdmin, 'initial',
        0.00, qty, qty, 210.00, qty * 210.00, 'initial', 'Inventario inicial de apertura'
      );
    });

    // 11. FISCAL SEQUENCES (NCF)
    const insertFiscalDoc = db.prepare(`INSERT OR IGNORE INTO fiscal_document_types (company_id, code, name, description, affects_inventory, is_credit_note) VALUES (?, ?, ?, ?, ?, ?)`);
    insertFiscalDoc.run(companyId, 'B01', 'Factura de Crédito Fiscal', 'Para personas físicas o jurídicas que sustentan gastos y crédito fiscal', 1, 0);
    insertFiscalDoc.run(companyId, 'B02', 'Factura de Consumo', 'Para consumidores finales', 1, 0);
    insertFiscalDoc.run(companyId, 'B04', 'Nota de Crédito', 'Para anulaciones y devoluciones', 1, 1);
    insertFiscalDoc.run(companyId, 'B14', 'Régimen Especial', 'Zonas francas y regímenes tributarios especiales', 1, 0);
    insertFiscalDoc.run(companyId, 'B15', 'Gubernamental', 'Instituciones del Estado dominicano', 1, 0);

    const insertSeq = db.prepare(`
      INSERT OR REPLACE INTO fiscal_sequences (company_id, branch_id, fiscal_type_code, series, prefix, current_number, final_number, expiration_date, warning_threshold, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSeq.run(companyId, branch1Id, 'B01', 'B', 'B01', 35, 1000, '2027-12-31', 50, 'active');
    insertSeq.run(companyId, branch1Id, 'B02', 'B', 'B02', 48, 2000, '2027-12-31', 100, 'active');
    insertSeq.run(companyId, branch1Id, 'B04', 'B', 'B04', 6, 500, '2027-12-31', 20, 'active');

    // 12. 35+ REALISTIC SALES (INVOICES) WITH NCF & CXC AGING DATES
    console.log('Seeding 35+ realistic invoices across August/September 2026...');
    const insertSale = db.prepare(`
      INSERT INTO sales (
        company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
        sale_number, invoice_number, ncf, fiscal_type_code, sale_type, subtotal,
        discount_amount, tax_amount, total, amount_paid, balance, due_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, product_name, quantity, unit_cost, unit_price,
        discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCxC = db.prepare(`
      INSERT INTO accounts_receivable (
        company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
        issue_date, due_date, amount, balance, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPayment = db.prepare(`
      INSERT INTO receivable_payments (
        company_id, branch_id, customer_id, user_id, payment_number, payment_date,
        total_amount, payment_method, bank_name, reference_number, received_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAlloc = db.prepare(`
      INSERT INTO payment_allocations (payment_id, receivable_id, amount_applied)
      VALUES (?, ?, ?)
    `);

    const insertCommission = db.prepare(`
      INSERT INTO commissions (
        company_id, salesperson_id, sale_id, invoice_number, base_amount,
        commission_rate, commission_amount, calculation_type, status, paid_at, receipt_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const invoiceTemplates = [
      // 1-8: Current Month (September) - Credit Invoices (Current 0-30 days)
      { cust: 'CLI-001', ncfType: 'B01', type: 'credit', total: 45000, paid: 0, daysAgo: 2, dueDays: 30, sp: s1 },
      { cust: 'CLI-001', ncfType: 'B01', type: 'credit', total: 50000, paid: 0, daysAgo: 8, dueDays: 30, sp: s1 },
      { cust: 'CLI-002', ncfType: 'B01', type: 'credit', total: 25000, paid: 0, daysAgo: 4, dueDays: 15, sp: s1 },
      { cust: 'CLI-007', ncfType: 'B01', type: 'credit', total: 110000, paid: 0, daysAgo: 3, dueDays: 45, sp: s2 },
      { cust: 'CLI-007', ncfType: 'B01', type: 'credit', total: 100000, paid: 0, daysAgo: 10, dueDays: 45, sp: s2 },
      { cust: 'CLI-008', ncfType: 'B01', type: 'credit', total: 45000, paid: 0, daysAgo: 5, dueDays: 30, sp: s2 },
      { cust: 'CLI-013', ncfType: 'B01', type: 'credit', total: 140000, paid: 0, daysAgo: 6, dueDays: 45, sp: s3 },
      { cust: 'CLI-021', ncfType: 'B01', type: 'credit', total: 85000, paid: 0, daysAgo: 7, dueDays: 30, sp: s5 },

      // 9-15: Cash Invoices (September) - Fully Paid
      { cust: 'CLI-028', ncfType: 'B02', type: 'cash', total: 3850, paid: 3850, daysAgo: 1, dueDays: 0, sp: s1 },
      { cust: 'CLI-028', ncfType: 'B02', type: 'cash', total: 5400, paid: 5400, daysAgo: 1, dueDays: 0, sp: s1 },
      { cust: 'CLI-004', ncfType: 'B01', type: 'cash', total: 32000, paid: 32000, daysAgo: 2, dueDays: 0, sp: s1 },
      { cust: 'CLI-006', ncfType: 'B01', type: 'cash', total: 18000, paid: 18000, daysAgo: 3, dueDays: 0, sp: s1 },
      { cust: 'CLI-014', ncfType: 'B01', type: 'cash', total: 28000, paid: 28000, daysAgo: 4, dueDays: 0, sp: s3 },
      { cust: 'CLI-023', ncfType: 'B01', type: 'cash', total: 19500, paid: 19500, daysAgo: 5, dueDays: 0, sp: s5 },
      { cust: 'CLI-025', ncfType: 'B02', type: 'cash', total: 12000, paid: 12000, daysAgo: 6, dueDays: 0, sp: s5 },

      // 16-22: Overdue 31-60 days (Emitted late July / August, due early August)
      { cust: 'CLI-003', ncfType: 'B01', type: 'credit', total: 120000, paid: 0, daysAgo: 55, dueDays: 15, sp: s1 }, // Overdue 40 days
      { cust: 'CLI-009', ncfType: 'B01', type: 'credit', total: 95000, paid: 0, daysAgo: 50, dueDays: 15, sp: s2 },  // Overdue 35 days
      { cust: 'CLI-017', ncfType: 'B01', type: 'credit', total: 72000, paid: 0, daysAgo: 48, dueDays: 15, sp: s4 },  // Overdue 33 days
      { cust: 'CLI-022', ncfType: 'B01', type: 'credit', total: 160000, paid: 60000, daysAgo: 52, dueDays: 15, sp: s5 }, // Partial, overdue 37 days

      // 23-27: Overdue 61-90 days (Emitted early July)
      { cust: 'CLI-005', ncfType: 'B01', type: 'credit', total: 68000, paid: 0, daysAgo: 85, dueDays: 15, sp: s1 },  // Overdue 70 days (Blocked)
      { cust: 'CLI-011', ncfType: 'B01', type: 'credit', total: 58000, paid: 0, daysAgo: 80, dueDays: 15, sp: s2 },  // Overdue 65 days
      { cust: 'CLI-015', ncfType: 'B01', type: 'credit', total: 115000, paid: 0, daysAgo: 75, dueDays: 15, sp: s3 }, // Overdue 60 days (Blocked)

      // 28-32: Overdue 91-120 days and +120 days
      { cust: 'CLI-019', ncfType: 'B01', type: 'credit', total: 52000, paid: 0, daysAgo: 130, dueDays: 15, sp: s4 }, // Overdue 115 days (Blocked)
      { cust: 'CLI-003', ncfType: 'B01', type: 'credit', total: 115000, paid: 0, daysAgo: 145, dueDays: 15, sp: s1 }, // Overdue 130 days (+120)
      { cust: 'CLI-024', ncfType: 'B01', type: 'credit', total: 65000, paid: 0, daysAgo: 110, dueDays: 15, sp: s5 }, // Overdue 95 days

      // 33-36: Fully Paid Historic Invoices (August)
      { cust: 'CLI-001', ncfType: 'B01', type: 'credit', total: 75000, paid: 75000, daysAgo: 38, dueDays: 30, sp: s1 },
      { cust: 'CLI-007', ncfType: 'B01', type: 'credit', total: 180000, paid: 180000, daysAgo: 40, dueDays: 30, sp: s2 },
      { cust: 'CLI-013', ncfType: 'B01', type: 'credit', total: 95000, paid: 95000, daysAgo: 42, dueDays: 30, sp: s3 },
      { cust: 'CLI-021', ncfType: 'B01', type: 'credit', total: 60000, paid: 60000, daysAgo: 36, dueDays: 30, sp: s5 }
    ];

    const today = new Date('2026-09-04T12:00:00');

    invoiceTemplates.forEach((inv, index) => {
      const invDate = new Date(today.getTime() - inv.daysAgo * 24 * 60 * 60 * 1000);
      const invDateStr = invDate.toISOString().split('T')[0];
      const dueDate = new Date(invDate.getTime() + inv.dueDays * 24 * 60 * 60 * 1000);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const invNum = `FAC-2026-${String(1001 + index).padStart(5, '0')}`;
      const ncfCode = inv.ncfType === 'B01' ? `B01000000${String(index + 1).padStart(2, '0')}` : `B02000000${String(index + 1).padStart(2, '0')}`;
      const customerId = customerMap[inv.cust] || 1;

      const subtotal = Math.round((inv.total / 1.18) * 100) / 100;
      const taxAmount = Math.round((inv.total - subtotal) * 100) / 100;
      const balance = inv.total - inv.paid;

      let status = 'paid';
      if (balance > 0) {
        if (dueDate < today) status = 'overdue';
        else if (inv.paid > 0) status = 'partial';
        else status = 'pending';
      }

      const saleRes = insertSale.run(
        companyId, branch1Id, warehouse1Id, customerId, inv.sp, uVendedor,
        `VTA-${String(index + 1).padStart(5, '0')}`, invNum, ncfCode, inv.ncfType,
        inv.type, subtotal, 0.00, taxAmount, inv.total, inv.paid, balance,
        inv.type === 'credit' ? dueDateStr : null, status, invDateStr + ' 10:30:00'
      );
      const saleId = saleRes.lastInsertRowid;

      // Sale item
      insertSaleItem.run(
        saleId, createdProductIds[index % createdProductIds.length],
        `Productos y Tintes Salerm Lote Variado`, 10, subtotal * 0.55, subtotal, 0.00, 0.00, subtotal, 18.00, taxAmount, inv.total
      );

      // CxC if credit
      if (inv.type === 'credit') {
        const cxcRes = insertCxC.run(
          companyId, branch1Id, customerId, saleId, invNum, ncfCode,
          invDateStr, dueDateStr, inv.total, balance,
          balance === 0 ? 'paid' : (dueDate < today ? 'overdue' : (inv.paid > 0 ? 'partial' : 'pending')),
          invDateStr + ' 10:30:00'
        );
        const cxcId = cxcRes.lastInsertRowid;

        // If partially or fully paid, record payment
        if (inv.paid > 0) {
          const payDateStr = new Date(invDate.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const payRes = insertPayment.run(
            companyId, branch1Id, customerId, uCobros, `REC-2026-${String(index + 1).padStart(4, '0')}`,
            payDateStr, inv.paid, 'transfer', 'Banco Popular Dominicano', `BPD-TRF-${Math.floor(Math.random()*899999)+100000}`,
            'Patricia Peña', 'Abono a factura verificado en cuenta', payDateStr + ' 14:00:00'
          );
          insertAlloc.run(payRes.lastInsertRowid, cxcId, inv.paid);
        }
      }

      // Commission for salesperson (5%)
      const commRate = 5.00;
      const commAmount = Math.round((subtotal * (commRate / 100)) * 100) / 100;
      insertCommission.run(
        companyId, inv.sp, saleId, invNum, subtotal, commRate, commAmount,
        'invoiced', inv.daysAgo > 30 ? 'paid' : 'pending',
        inv.daysAgo > 30 ? '2026-08-31 18:00:00' : null,
        inv.daysAgo > 30 ? `COM-REC-${index}` : null,
        invDateStr + ' 10:30:00'
      );
    });

    // 13. COLLECTION FOLLOW-UPS & PAYMENT PROMISES (12+ RECORDS)
    console.log('Seeding collection follow-up timeline and payment promises...');
    const insertNote = db.prepare(`
      INSERT INTO collection_notes (company_id, customer_id, user_id, contact_channel, result, notes, promise_date, promise_amount, status, next_action_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertNote.run(companyId, customerMap['CLI-003'], uCobros, 'phone', 'promise', 'Conversación con Lic. Valdez. Indicó que emitirá cheque este viernes.', '2026-09-08', 50000.00, 'pending', '2026-09-08', '2026-09-01 09:30:00');
    insertNote.run(companyId, customerMap['CLI-009'], uCobros, 'whatsapp', 'promise', 'Confirmó depósito por transferencia Banreservas por RD$ 40,000.', '2026-09-05', 40000.00, 'pending', '2026-09-06', '2026-09-02 11:15:00');
    insertNote.run(companyId, customerMap['CLI-005'], uCobros, 'visit', 'disputed', 'Visita física al salón. Exigen estado de cuenta revisado antes de abonar.', null, 0.00, 'pending', '2026-09-07', '2026-08-28 15:00:00');
    insertNote.run(companyId, customerMap['CLI-015'], uCobros, 'phone', 'promise', 'Promesa de pago firmada para abonar RD$ 30,000 el 10 de septiembre.', '2026-09-10', 30000.00, 'pending', '2026-09-10', '2026-09-03 16:20:00');
    insertNote.run(companyId, customerMap['CLI-017'], uCobros, 'phone', 'paid', 'Se recibió comprobante de pago por RD$ 25,000 en Banco BHD.', '2026-08-30', 25000.00, 'fulfilled', null, '2026-08-25 10:00:00');
    insertNote.run(companyId, customerMap['CLI-019'], uCobros, 'visit', 'not_answering', 'Local cerrado temporalmente por remodelación. Contactar al esposo.', null, 0.00, 'pending', '2026-09-12', '2026-08-20 14:30:00');

    // 14. EXPENSES & 8 RECURRING PAYMENTS (PAGOS FIJOS)
    console.log('Seeding expenses and recurring fixed obligations...');
    const insertExpCat = db.prepare(`INSERT OR IGNORE INTO expense_categories (company_id, name, description) VALUES (?, ?, ?)`);
    const catNomina = insertExpCat.run(companyId, 'Nómina & Sueldos', 'Pago de salarios a empleados').lastInsertRowid || 1;
    const catAlquiler = insertExpCat.run(companyId, 'Alquiler de Inmuebles', 'Alquiler local comercial Churchill y Santiago').lastInsertRowid || 2;
    const catServicios = insertExpCat.run(companyId, 'Servicios Básicos (Luz, Agua, Internet)', 'Edeeste, CAASD, Claro').lastInsertRowid || 3;
    const catCombustible = insertExpCat.run(companyId, 'Transporte & Combustible', 'Combustible de camiones y vehículos de ventas').lastInsertRowid || 4;
    const catMantenimiento = insertExpCat.run(companyId, 'Mantenimiento & Reparaciones', 'Mantenimiento de aires acondicionados y vehículos').lastInsertRowid || 5;
    const catImpuestos = insertExpCat.run(companyId, 'Impuestos & DGII', 'Anticipos, ITBIS y retenciones').lastInsertRowid || 6;
    const catCajaChica = insertExpCat.run(companyId, 'Caja Chica', 'Gastos menores de oficina y limpieza').lastInsertRowid || 7;

    const insertExpense = db.prepare(`
      INSERT INTO expenses (company_id, branch_id, category_id, user_id, amount, payment_method, beneficiary, voucher_number, notes, expense_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertExpense.run(companyId, branch1Id, catAlquiler, uAdmin, 120000.00, 'transfer', 'Inmobiliaria Churchill SA', 'REC-ALQ-0826', 'Pago de alquiler correspondiente a Agosto 2026', '2026-08-05', '2026-08-05 09:00:00');
    insertExpense.run(companyId, branch1Id, catNomina, uAdmin, 340000.00, 'transfer', 'Nómina General Quincenal', 'NOM-0826-Q2', 'Pago quincena 30 de agosto empleados', '2026-08-30', '2026-08-30 17:00:00');
    insertExpense.run(companyId, branch1Id, catServicios, uAdmin, 28500.00, 'transfer', 'Edeeste Distribuidora de Electricidad', 'EDE-99881', 'Factura energía eléctrica almacén central', '2026-08-18', '2026-08-18 11:00:00');
    insertExpense.run(companyId, branch1Id, catServicios, uAdmin, 8400.00, 'transfer', 'Claro Dominicana', 'CLA-44551', 'Internet fibra óptica 300MB y líneas telefónicas', '2026-08-15', '2026-08-15 10:30:00');
    insertExpense.run(companyId, branch1Id, catCombustible, uVendedor, 14500.00, 'card', 'Estación Shell Churchill', 'TKT-SHELL-12', 'Combustible de ruta Santo Domingo', '2026-08-22', '2026-08-22 18:00:00');
    insertExpense.run(companyId, branch1Id, catCajaChica, uCajero, 3500.00, 'cash', 'Supermercados Nacional', 'VALE-CC-01', 'Café, agua embotellada e insumos de limpieza', '2026-09-02', '2026-09-02 09:15:00');
    insertExpense.run(companyId, branch1Id, catCombustible, uVendedor, 12000.00, 'card', 'TotalEnergies Las Américas', 'TKT-TOT-99', 'Combustible ruta este Juan Tejada', '2026-09-01', '2026-09-01 16:40:00');

    // Recurring Fixed Obligations (8 Pagos Fijos con Semáforo de Alertas)
    const insertRecurring = db.prepare(`
      INSERT INTO recurring_expenses (company_id, branch_id, category_id, concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, alert_days_before, status, last_paid_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRecurring.run(companyId, branch1Id, catAlquiler, 'Alquiler Local Principal Churchill', 120000.00, 'monthly', 5, '2026-09-05', 'Lic. Eduardo Paredes', 7, 'upcoming', '2026-08-05');
    insertRecurring.run(companyId, branch2Id, catAlquiler, 'Alquiler Almacén Santiago Los Jardines', 45000.00, 'monthly', 10, '2026-09-10', 'Marcos Villanueva', 7, 'upcoming', '2026-08-10');
    insertRecurring.run(companyId, branch1Id, catNomina, 'Nómina Primera Quincena', 170000.00, 'biweekly', 15, '2026-09-15', 'Lic. Eduardo Paredes', 3, 'pending', '2026-08-30');
    insertRecurring.run(companyId, branch1Id, catNomina, 'Nómina Segunda Quincena', 170000.00, 'biweekly', 30, '2026-09-30', 'Lic. Eduardo Paredes', 3, 'pending', '2026-08-30');
    insertRecurring.run(companyId, branch1Id, catServicios, 'Energía Eléctrica Edeeste Churchill', 29000.00, 'monthly', 18, '2026-09-18', 'Marcos Villanueva', 5, 'pending', '2026-08-18');
    insertRecurring.run(companyId, branch1Id, catServicios, 'Internet Dedicado & Troncal Claro', 8500.00, 'monthly', 20, '2026-09-20', 'Marcos Villanueva', 5, 'pending', '2026-08-20');
    insertRecurring.run(companyId, branch1Id, catImpuestos, 'Declaración Jurada y Pago ITBIS DGII', 95000.00, 'monthly', 20, '2026-09-20', 'Lic. Eduardo Paredes', 7, 'pending', '2026-08-20');
    insertRecurring.run(companyId, branch1Id, catServicios, 'Póliza de Seguros Flotilla y Almacén', 38000.00, 'monthly', 2, '2026-09-02', 'Lic. Eduardo Paredes', 7, 'overdue', '2026-08-02');

    // 15. MONTHLY CLOSING RECORD (CIERRE MENSUAL DE AGOSTO 2026 & ESTIMADO SEPTIEMBRE)
    console.log('Seeding Monthly Closing financial records...');
    const insertClosing = db.prepare(`
      INSERT OR REPLACE INTO monthly_closings (
        company_id, month, year, total_sales, total_collections, pending_receivables,
        discounts_total, credit_notes_total, purchases_total, operating_expenses,
        administrative_expenses, fixed_expenses, commissions_total, cogs,
        gross_profit, net_profit, previous_sales, previous_net_profit, status, closed_by_user_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Agosto 2026 (Cerrado Oficial)
    insertClosing.run(
      companyId, 8, 2026, 1850000.00, 1620000.00, 230000.00,
      35000.00, 28000.00, 980000.00, 85000.00,
      120000.00, 340000.00, 92500.00, 1020000.00,
      830000.00, 285000.00, 1640000.00, 245000.00, 'closed', uAdmin,
      'Cierre mensual completado exitosamente. Crecimiento del +12.8% en ventas vs Julio 2026.'
    );

    // 16. SYSTEM NOTIFICATIONS & AUDIT LOGS
    console.log('Seeding notifications center and audit log...');
    const insertNotif = db.prepare(`
      INSERT INTO notifications (company_id, user_id, type, title, message, priority, is_read, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertNotif.run(companyId, uAdmin, 'credit_exceeded', 'Cliente Límite Excedido: Salón Rosely', 'El cliente ha utilizado RD$ 68,000 de su límite de RD$ 60,000 (113%).', 'high', 0, '/customers?code=CLI-005');
    insertNotif.run(companyId, uAdmin, 'overdue_invoice', 'Facturas Vencidas +60 días: Azua', 'Salón D’Yessica posee factura FAC-2026-01028 vencida hace 115 días.', 'urgent', 0, '/sales?status=overdue');
    insertNotif.run(companyId, uAdmin, 'stock_low', 'Stock Mínimo: Tinte Salerm Rubio 7.0', 'Existencia actual en 0 unidades en Almacén Central Churchill.', 'high', 0, '/inventory?low=true');
    insertNotif.run(companyId, uAdmin, 'recurring_expense', 'Alerta Pago Fijo: Póliza Seguros Vencida', 'Obligación vencida el 02/09/2026 por RD$ 38,000.', 'urgent', 0, '/finance?tab=recurring');
    insertNotif.run(companyId, uAdmin, 'authorization', 'Autorización Solicitada: Descuento 12%', 'Vendedor Carlos Pérez solicita 12% para Glamour Beauty Lounge.', 'normal', 0, '/authorizations');

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (company_id, user_id, ip_address, module, action, record_id, old_values, new_values, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAudit.run(companyId, uAdmin, '192.168.1.10', 'system', 'seed', 'ALL', null, null, 'Inicialización del sistema comercial ERP Cambri con 28 clientes, 5 vendedores y 65 productos');
    insertAudit.run(companyId, uGerente, '192.168.1.15', 'sales', 'authorize_discount', 'CLI-001', '{"discount": 5}', '{"discount": 10}', 'Autorización de descuento especial de volumen a Glamour Beauty Lounge');
    insertAudit.run(companyId, uAdmin, '192.168.1.10', 'customers', 'credit_block', 'CLI-005', '{"is_blocked": 0}', '{"is_blocked": 1}', 'Bloqueo automático de cliente por exceso de límite de crédito');

    console.log('✅ Seeding completed successfully!');
  });
}

module.exports = {
  runSeed
};
