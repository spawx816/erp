const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const catalogController = {
  // PRODUCTS
  getProducts: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, category_id, brand_id, type, status, warehouse_id, branch_id, page = 1, limit = 25 } = req.query;
      const offset = (page - 1) * limit;

      let whereClauses = ['p.company_id = ?'];
      let params = [companyId];

      if (search) {
        whereClauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.internal_code LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (category_id) {
        whereClauses.push('p.category_id = ?');
        params.push(category_id);
      }
      if (brand_id) {
        whereClauses.push('p.brand_id = ?');
        params.push(brand_id);
      }
      if (type) {
        whereClauses.push('p.type = ?');
        params.push(type);
      }
      if (status) {
        whereClauses.push('p.status = ?');
        params.push(status);
      }

      const whereSQL = whereClauses.join(' AND ');

      // Total count
      const countRow = await db.prepare(`SELECT COUNT(*) as total FROM products p WHERE ${whereSQL}`).get(...params);

      const parsedWhId = warehouse_id ? parseInt(warehouse_id, 10) : null;
      const parsedBrId = branch_id ? parseInt(branch_id, 10) : null;

      const stockSubquery = parsedWhId
        ? `(SELECT COALESCE(SUM(inv.quantity), 0) FROM inventories inv WHERE inv.product_id = p.id AND inv.warehouse_id = ${parsedWhId})`
        : parsedBrId
        ? `(SELECT COALESCE(SUM(inv.quantity), 0) FROM inventories inv WHERE inv.product_id = p.id AND inv.branch_id = ${parsedBrId})`
        : `(SELECT COALESCE(SUM(inv.quantity), 0) FROM inventories inv WHERE inv.product_id = p.id)`;

      // Query products
      const products = await db.prepare(`
        SELECT p.*,
               c.name as category_name,
               b.name as brand_name,
               u.name as unit_name, u.code as unit_code,
               ${stockSubquery} as total_stock,
               (SELECT COALESCE(SUM(inv.quantity), 0) FROM inventories inv WHERE inv.product_id = p.id) as company_total_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN units u ON p.unit_id = u.id
        WHERE ${whereSQL}
        ORDER BY p.name ASC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      // Attach variants to products
      const getVariants = db.prepare(`SELECT * FROM product_variants WHERE product_id = ?`);
      for (const prod of products) {
        prod.variants = await getVariants.all(prod.id);
      }

      return res.json({
        success: true,
        data: products,
        pagination: {
          total: countRow.total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(countRow.total / limit)
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando productos.', error: err.message });
    }
  },

  getProductById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const product = await db.prepare(`
        SELECT p.*,
               c.name as category_name,
               b.name as brand_name,
               u.name as unit_name, u.code as unit_code
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN units u ON p.unit_id = u.id
        WHERE p.id = ? AND p.company_id = ?
      `).get(id, companyId);

      if (!product) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
      }

      product.variants = await db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id);
      product.stock_by_warehouse = await db.prepare(`
        SELECT inv.*, w.name as warehouse_name, br.name as branch_name, pv.variant_name
        FROM inventories inv
        JOIN warehouses w ON inv.warehouse_id = w.id
        JOIN branches br ON inv.branch_id = br.id
        LEFT JOIN product_variants pv ON inv.variant_id = pv.id
        WHERE inv.product_id = ?
      `).all(product.id);

      return res.json({ success: true, data: product });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo producto.', error: err.message });
    }
  },

  lookupBarcode: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { barcode } = req.params;

      // Check variant first
      const variant = await db.prepare(`
        SELECT pv.*, p.name as product_name, p.tax_rate, p.type, p.allows_discount, p.max_discount_percent
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE (pv.barcode = ? OR pv.sku = ?) AND p.company_id = ?
      `).get(barcode, barcode, companyId);

      if (variant) {
        return res.json({
          success: true,
          type: 'variant',
          data: variant
        });
      }

      // Check direct product
      const product = await db.prepare(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE (p.barcode = ? OR p.sku = ? OR p.internal_code = ?) AND p.company_id = ?
      `).get(barcode, barcode, barcode, companyId);

      if (product) {
        return res.json({
          success: true,
          type: 'product',
          data: product
        });
      }

      return res.status(404).json({ success: false, message: 'Producto no encontrado con el código escaneado.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error en búsqueda por código de barras.', error: err.message });
    }
  },

  createProduct: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        category_id, brand_id, unit_id, internal_code, sku, barcode,
        name, description, type = 'physical', cost = 0, price = 0, min_price = 0,
        tax_rate = 18.00, stock_min = 0, stock_max = 0,
        allows_discount = true, max_discount_percent = 0,
        initial_warehouse_id, initial_stock = 0,
        variants = []
      } = req.body;

      if (!name || !sku) {
        return res.status(400).json({ success: false, message: 'Nombre y SKU son requeridos.' });
      }

      const existing = await db.prepare('SELECT id FROM products WHERE company_id = ? AND sku = ?').get(companyId, sku);
      if (existing) {
        return res.status(400).json({ success: false, message: `Ya existe un producto con el SKU: ${sku}` });
      }

      const numCost = cost === '' || cost === null || cost === undefined ? 0 : Number(cost);
      const numPrice = price === '' || price === null || price === undefined ? 0 : Number(price);
      const numMinPrice = min_price === '' || min_price === null || min_price === undefined ? numPrice : Number(min_price);
      const numTaxRate = tax_rate === '' || tax_rate === null || tax_rate === undefined ? 18.00 : Number(tax_rate);
      const numStockMin = stock_min === '' || stock_min === null || stock_min === undefined ? 0 : Number(stock_min);
      const numStockMax = stock_max === '' || stock_max === null || stock_max === undefined ? 0 : Number(stock_max);
      const numMaxDiscount = max_discount_percent === '' || max_discount_percent === null || max_discount_percent === undefined ? 0 : Number(max_discount_percent);
      const numInitialStock = initial_stock === '' || initial_stock === null || initial_stock === undefined ? 0 : Number(initial_stock);

      const newProduct = await runTransaction(async (txDb) => {
        const stmt = txDb.prepare(`
          INSERT INTO products (
            company_id, category_id, brand_id, unit_id, internal_code, sku, barcode,
            name, description, type, cost, price, min_price, tax_rate,
            stock_min, stock_max, allows_discount, max_discount_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const resInsert = await stmt.run(
          companyId, category_id ? Number(category_id) : null, brand_id ? Number(brand_id) : null, unit_id ? Number(unit_id) : null,
          internal_code || null, sku, barcode || null, name, description || null,
          type, numCost, numPrice, numMinPrice, numTaxRate,
          numStockMin, numStockMax, allows_discount ? 1 : 0, numMaxDiscount
        );

        const productId = resInsert.lastInsertRowid;

        // Insert variants if supplied
        if (variants && variants.length > 0) {
          const stmtVar = txDb.prepare(`
            INSERT INTO product_variants (product_id, variant_name, sku, barcode, cost, price)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const v of variants) {
            const vCost = v.cost === '' || v.cost === null || v.cost === undefined ? numCost : Number(v.cost);
            const vPrice = v.price === '' || v.price === null || v.price === undefined ? numPrice : Number(v.price);
            await stmtVar.run(productId, v.variant_name, v.sku, v.barcode || null, vCost, vPrice);
          }
        }

        // If initial stock provided
        if (type === 'physical' && initial_warehouse_id && Number(initial_warehouse_id) > 0 && numInitialStock > 0) {
          const warehouse = await txDb.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(initial_warehouse_id, companyId);
          if (warehouse) {
            await txDb.prepare(`
              INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, quantity)
              VALUES (?, ?, ?, ?, ?)
            `).run(companyId, warehouse.branch_id, initial_warehouse_id, productId, numInitialStock);

            await txDb.prepare(`
              INSERT INTO inventory_movements (
                company_id, branch_id, warehouse_id, product_id, user_id, movement_type,
                previous_quantity, quantity, new_quantity, unit_cost, total_cost, reference_type, reason
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              companyId, warehouse.branch_id, initial_warehouse_id, productId, req.user.id,
              'initial', 0, numInitialStock, numInitialStock, numCost, Math.round(numCost * numInitialStock * 100) / 100, 'initial', 'Inventario inicial de creación de producto'
            );
          }
        }

        return productId;
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'catalog',
        action: 'create_product',
        recordId: newProduct,
        newValues: { name, sku, price, cost },
        description: `Creación del producto ${name} (${sku})`
      });

      return res.status(201).json({ success: true, message: 'Producto creado exitosamente.', product_id: newProduct });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error creando producto.', error: err.message });
    }
  },

  updateProduct: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        name, barcode, internal_code, category_id, brand_id, unit_id,
        description, type, cost, price, min_price, tax_rate,
        stock_min, stock_max, allows_discount, max_discount_percent, status
      } = req.body;

      const current = await db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!current) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
      }

      const numCost = cost === undefined ? null : (cost === '' || cost === null ? 0 : Number(cost));
      const numPrice = price === undefined ? null : (price === '' || price === null ? 0 : Number(price));
      const numMinPrice = min_price === undefined ? null : (min_price === '' || min_price === null ? 0 : Number(min_price));
      const numTaxRate = tax_rate === undefined ? null : (tax_rate === '' || tax_rate === null ? 18.00 : Number(tax_rate));
      const numStockMin = stock_min === undefined ? null : (stock_min === '' || stock_min === null ? 0 : Number(stock_min));
      const numStockMax = stock_max === undefined ? null : (stock_max === '' || stock_max === null ? 0 : Number(stock_max));
      const numMaxDiscount = max_discount_percent === undefined ? null : (max_discount_percent === '' || max_discount_percent === null ? 0 : Number(max_discount_percent));

      await db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          barcode = COALESCE(?, barcode),
          internal_code = COALESCE(?, internal_code),
          category_id = ?,
          brand_id = ?,
          unit_id = ?,
          description = ?,
          type = COALESCE(?, type),
          cost = COALESCE(?, cost),
          price = COALESCE(?, price),
          min_price = COALESCE(?, min_price),
          tax_rate = COALESCE(?, tax_rate),
          stock_min = COALESCE(?, stock_min),
          stock_max = COALESCE(?, stock_max),
          allows_discount = COALESCE(?, allows_discount),
          max_discount_percent = COALESCE(?, max_discount_percent),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(
        name, barcode, internal_code, category_id ? Number(category_id) : null, brand_id ? Number(brand_id) : null, unit_id ? Number(unit_id) : null,
        description, type, numCost, numPrice, numMinPrice, numTaxRate,
        numStockMin, numStockMax, allows_discount !== undefined ? (allows_discount ? 1 : 0) : null, numMaxDiscount, status,
        id, companyId
      );

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'catalog',
        action: 'update_product',
        recordId: id,
        oldValues: current,
        newValues: req.body,
        description: `Actualización del producto ID ${id}`
      });

      return res.json({ success: true, message: 'Producto actualizado exitosamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error actualizando producto.', error: err.message });
    }
  },

  // CATEGORIES
  getCategories: async (req, res) => {
    try {
      const categories = await db.prepare('SELECT * FROM categories WHERE company_id = ? ORDER BY name ASC').all(req.user.company_id);
      return res.json({ success: true, data: categories });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createCategory: async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Nombre requerido.' });
      const stmt = await db.prepare('INSERT INTO categories (company_id, name, description) VALUES (?, ?, ?)');
      const result = await stmt.run(req.user.company_id, name, description || null);
      return res.json({ success: true, data: { id: result.lastInsertRowid, name, description: description || null } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Nombre requerido.' });
      await db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ? AND company_id = ?')
        .run(name, description || null, id, req.user.company_id);
      return res.json({ success: true, message: 'Categoria actualizada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  deleteCategory: async (req, res) => {
    try {
      const { id } = req.params;
      // Unlink products first
      await db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ? AND company_id = ?').run(id, req.user.company_id);
      await db.prepare('DELETE FROM categories WHERE id = ? AND company_id = ?').run(id, req.user.company_id);
      return res.json({ success: true, message: 'Categoria eliminada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // BRANDS
  getBrands: async (req, res) => {
    try {
      const brands = await db.prepare('SELECT * FROM brands WHERE company_id = ? ORDER BY name ASC').all(req.user.company_id);
      return res.json({ success: true, data: brands });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createBrand: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Nombre requerido.' });
      const stmt = await db.prepare('INSERT INTO brands (company_id, name) VALUES (?, ?)');
      const result = await stmt.run(req.user.company_id, name);
      return res.json({ success: true, data: { id: result.lastInsertRowid, name } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateBrand: async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Nombre requerido.' });
      await db.prepare('UPDATE brands SET name = ? WHERE id = ? AND company_id = ?').run(name, id, req.user.company_id);
      return res.json({ success: true, message: 'Marca actualizada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  deleteBrand: async (req, res) => {
    try {
      const { id } = req.params;
      await db.prepare('DELETE FROM brands WHERE id = ? AND company_id = ?').run(id, req.user.company_id);
      return res.json({ success: true, message: 'Marca eliminada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // UNITS
  getUnits: async (req, res) => {
    try {
      const units = await db.prepare('SELECT * FROM units WHERE company_id = ? ORDER BY name ASC').all(req.user.company_id);
      return res.json({ success: true, data: units });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // PRICE LISTS
  getPriceLists: async (req, res) => {
    try {
      const lists = await db.prepare('SELECT * FROM price_lists WHERE company_id = ? ORDER BY id ASC').all(req.user.company_id);
      return res.json({ success: true, data: lists });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = catalogController;
