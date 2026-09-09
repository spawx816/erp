const { db, runTransaction } = require('../../database/db');
const InventoryService = require('./inventoryService');
const { logAudit } = require('../../middlewares/audit');
const { generateCommercialId } = require('../../utils/idGenerator');

const inventoryController = {
  // Current stock list
  getStock: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { warehouse_id, branch_id, search, low_stock, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let whereClauses = ['p.company_id = ?'];
      let params = [companyId];

      if (warehouse_id) {
        whereClauses.push('inv.warehouse_id = ?');
        params.push(warehouse_id);
      }
      if (branch_id) {
        whereClauses.push('inv.branch_id = ?');
        params.push(branch_id);
      }
      if (search) {
        whereClauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      let whereSQL = whereClauses.join(' AND ');

      let query = `
        SELECT inv.*,
               p.name as product_name, p.sku as product_sku, p.sku, p.cost, p.price, p.stock_min, p.stock_max, p.tax_rate, p.shade_number, p.line,
               pv.variant_name, pv.sku as variant_sku,
               w.name as warehouse_name,
               br.name as branch_name,
               c.name as category_name,
               u.code as unit_code
        FROM inventories inv
        JOIN products p ON inv.product_id = p.id
        LEFT JOIN units u ON p.unit_id = u.id
        LEFT JOIN product_variants pv ON inv.variant_id = pv.id
        JOIN warehouses w ON inv.warehouse_id = w.id
        JOIN branches br ON inv.branch_id = br.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${whereSQL}
      `;

      if (low_stock === 'true') {
        query += ` AND inv.quantity <= p.stock_min`;
      }

      query += ` ORDER BY p.name ASC LIMIT ? OFFSET ?`;

      const rows = await db.prepare(query).all(...params, limit, offset);

      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando existencias.', error: err.message });
    }
  },

  // Kardex movements
  getKardex: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { product_id, warehouse_id, movement_type, start_date, end_date, search, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let whereClauses = ['m.company_id = ?'];
      let params = [companyId];

      if (product_id) {
        whereClauses.push('m.product_id = ?');
        params.push(product_id);
      }
      if (warehouse_id) {
        whereClauses.push('m.warehouse_id = ?');
        params.push(warehouse_id);
      }
      if (movement_type) {
        whereClauses.push('m.movement_type = ?');
        params.push(movement_type);
      }
      if (start_date) {
        whereClauses.push('date(m.created_at) >= ?');
        params.push(start_date);
      }
      if (end_date) {
        whereClauses.push('date(m.created_at) <= ?');
        params.push(end_date);
      }
      if (search) {
        whereClauses.push('(p.name LIKE ? OR p.sku LIKE ? OR m.reason LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereSQL = whereClauses.join(' AND ');

      const countRow = await db.prepare(`SELECT COUNT(*) as total FROM inventory_movements m WHERE ${whereSQL}`).get(...params);
      const count = countRow ? parseInt(countRow.total, 10) || 0 : 0;

      const movements = await db.prepare(`
        SELECT m.*,
               p.name as product_name, p.sku as product_sku, p.sku, p.shade_number,
               pv.variant_name,
               w.name as warehouse_name,
               w_to.name as to_warehouse_name,
               u.username, u.first_name || ' ' || u.last_name as user_name
        FROM inventory_movements m
        JOIN products p ON m.product_id = p.id
        LEFT JOIN product_variants pv ON m.variant_id = pv.id
        JOIN warehouses w ON m.warehouse_id = w.id
        LEFT JOIN warehouses w_to ON m.to_warehouse_id = w_to.id
        JOIN users u ON m.user_id = u.id
        WHERE ${whereSQL}
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      return res.json({
        success: true,
        data: movements,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando kardex.', error: err.message });
    }
  },

  // Manual stock adjustment (In/Out)
  adjustStock: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { warehouse_id, product_id, variant_id = null, adjustment_type, quantity, unit_cost, reason } = req.body;

      if (!warehouse_id || !product_id || !quantity || !reason) {
        return res.status(400).json({ success: false, message: 'Almacén, producto, cantidad y motivo son obligatorios.' });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(warehouse_id, companyId);
      if (!warehouse) {
        return res.status(404).json({ success: false, message: 'Almacén no encontrado.' });
      }

      const qty = Math.abs(Number(quantity)) * (adjustment_type === 'out' ? -1 : 1);
      const movType = adjustment_type === 'out' ? 'adjustment_out' : 'adjustment_in';

      const result = await runTransaction(async (txDb) => {
        const mov = await InventoryService.recordMovement({
          companyId,
          branchId: warehouse.branch_id,
          warehouseId: warehouse_id,
          productId: product_id,
          variantId: variant_id || null,
          userId: req.user.id,
          movementType: movType,
          quantity: qty,
          unitCost: unit_cost || 0,
          reason,
          txClient: txDb
        });

        await logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'inventory',
          action: 'adjust_stock',
          recordId: mov.movement_id,
          newValues: { warehouse_id, product_id, qty, reason },
          description: `Ajuste manual de inventario (${adjustment_type}): ${qty} unidades. Motivo: ${reason}`
        });

        return mov;
      });

      return res.json({ success: true, message: 'Ajuste de inventario aplicado exitosamente.', data: result });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // TRANSFERS
  getTransfers: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const transfers = await db.prepare(`
        SELECT t.*,
               w1.name as from_warehouse_name, b1.name as from_branch_name,
               w2.name as to_warehouse_name, b2.name as to_branch_name,
               u.first_name || ' ' || u.last_name as created_by_name
        FROM inventory_transfers t
        JOIN warehouses w1 ON t.from_warehouse_id = w1.id
        JOIN branches b1 ON t.from_branch_id = b1.id
        JOIN warehouses w2 ON t.to_warehouse_id = w2.id
        JOIN branches b2 ON t.to_branch_id = b2.id
        JOIN users u ON t.user_id = u.id
        WHERE t.company_id = ?
        ORDER BY t.created_at DESC
      `).all(companyId);

      const getItems = db.prepare(`
        SELECT ti.*, p.name as product_name, p.sku
        FROM inventory_transfer_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transfer_id = ?
      `);

      for (const tr of transfers) {
        tr.items = await getItems.all(tr.id);
      }

      return res.json({ success: true, data: transfers });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando transferencias.', error: err.message });
    }
  },

  createTransfer: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { from_warehouse_id, to_warehouse_id, notes, items } = req.body;

      if (!from_warehouse_id || !to_warehouse_id || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Almacén origen, destino e ítems son requeridos.' });
      }

      if (Number(from_warehouse_id) === Number(to_warehouse_id)) {
        return res.status(400).json({ success: false, message: 'El almacén de origen y destino no pueden ser el mismo.' });
      }

      const wFrom = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(from_warehouse_id, companyId);
      const wTo = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(to_warehouse_id, companyId);

      if (!wFrom || !wTo) {
        return res.status(404).json({ success: false, message: 'Almacén de origen o destino no encontrado en su empresa.' });
      }

      const transferNumber = generateCommercialId('TRF');

      const transferId = await runTransaction(async (txDb) => {
        // Validate stock for all items
        for (const item of items) {
          const currentStock = await InventoryService.getCurrentStock(from_warehouse_id, item.product_id, item.variant_id);
          if (currentStock < Number(item.quantity)) {
            throw new Error(`Stock insuficiente para el producto ID ${item.product_id}. Disponible: ${currentStock}, Solicitado: ${item.quantity}`);
          }
        }

        const stmtTr = txDb.prepare(`
          INSERT INTO inventory_transfers (
            company_id, from_branch_id, from_warehouse_id, to_branch_id, to_warehouse_id,
            user_id, transfer_number, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
        `);

        const resTr = await stmtTr.run(companyId, wFrom.branch_id, from_warehouse_id, wTo.branch_id, to_warehouse_id, req.user.id, transferNumber, notes || null);
        const trId = resTr.lastInsertRowid;

        const stmtItem = txDb.prepare(`
          INSERT INTO inventory_transfer_items (transfer_id, product_id, variant_id, quantity, unit_cost)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          await stmtItem.run(trId, item.product_id, item.variant_id || null, item.quantity, item.unit_cost || 0);

          // Deduct from source warehouse immediately using transaction client
          await InventoryService.recordMovement({
            companyId,
            branchId: wFrom.branch_id,
            warehouseId: from_warehouse_id,
            toWarehouseId: to_warehouse_id,
            productId: item.product_id,
            variantId: item.variant_id || null,
            userId: req.user.id,
            movementType: 'transfer_out',
            quantity: -Math.abs(Number(item.quantity)),
            unitCost: item.unit_cost || 0,
            referenceType: 'inventory_transfers',
            referenceId: trId,
            reason: `Envío de transferencia ${transferNumber}`,
            txClient: txDb
          });
        }

        await logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'inventory',
          action: 'create_transfer',
          recordId: trId,
          description: `Transferencia creada y despachada ${transferNumber}`
        });

        return trId;
      });

      return res.status(201).json({ success: true, message: 'Transferencia creada y despachada exitosamente.', transfer_id: transferId });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  receiveTransfer: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      await runTransaction(async (txDb) => {
        // Lock transfer row
        const transfer = await txDb.prepare(`
          SELECT * FROM inventory_transfers WHERE id = ? AND company_id = ? FOR UPDATE
        `).get(id, companyId);

        if (!transfer) {
          throw new Error('Transferencia no encontrada.');
        }

        if (transfer.status !== 'sent') {
          throw new Error('Esta transferencia no se encuentra en tránsito o ya ha sido recibida previamente.');
        }

        // Conditional transition sent -> received
        const updateRes = await txDb.prepare(`
          UPDATE inventory_transfers
          SET status = 'received', received_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'sent'
        `).run(id);

        if (updateRes.changes === 0) {
          throw new Error('Conflicto de concurrencia: la transferencia ya fue recibida simultáneamente.');
        }

        const items = await txDb.prepare('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?').all(id);

        for (const item of items) {
          await InventoryService.recordMovement({
            companyId,
            branchId: transfer.to_branch_id,
            warehouseId: transfer.to_warehouse_id,
            toWarehouseId: null,
            productId: item.product_id,
            variantId: item.variant_id || null,
            userId: req.user.id,
            movementType: 'transfer_in',
            quantity: Math.abs(Number(item.quantity)),
            unitCost: item.unit_cost || 0,
            referenceType: 'inventory_transfers',
            referenceId: transfer.id,
            reason: `Recepción de transferencia ${transfer.transfer_number}`,
            txClient: txDb
          });
        }

        await logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'inventory',
          action: 'receive_transfer',
          recordId: id,
          description: `Recepción completada para transferencia ${transfer.transfer_number}`
        });
      });

      return res.json({ success: true, message: 'Transferencia recibida e ingresada al almacén destino exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // LOTS (LOTES DE INVENTARIO Y ANTIGÜEDAD)
  getLots: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { product_id, warehouse_id, search } = req.query;

      let where = ['l.company_id = ?'];
      let params = [companyId];

      if (product_id) { where.push('l.product_id = ?'); params.push(product_id); }
      if (warehouse_id) { where.push('l.warehouse_id = ?'); params.push(warehouse_id); }
      if (search) {
        where.push('(p.name LIKE ? OR p.sku LIKE ? OR l.lot_number LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const lots = await db.prepare(`
        SELECT l.*,
               p.name as product_name, p.sku, p.shade_number, p.line,
               w.name as warehouse_name,
               s.company_name as supplier_name,
               COALESCE((CURRENT_DATE - l.entry_date), 0) as days_in_inventory,
               CASE WHEN l.expiration_date IS NOT NULL THEN (l.expiration_date - CURRENT_DATE) ELSE NULL END as days_to_expiration
        FROM inventory_lots l
        JOIN products p ON l.product_id = p.id
        JOIN warehouses w ON l.warehouse_id = w.id
        LEFT JOIN suppliers s ON l.supplier_id = s.id
        WHERE ${where.join(' AND ')}
        ORDER BY l.entry_date DESC
      `).all(...params);

      return res.json({ success: true, data: lots });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // INVENTORY ROTATION & AGE ANALYSIS (ANALISIS DE ROTACIÓN)
  getInventoryAnalysis: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const noMovementDays = parseInt(req.query.no_movement_days || 60, 10);

      // Total Inventory Valuation
      const totals = await db.prepare(`
        SELECT COALESCE(SUM(p.cost * inv.quantity), 0) as total_valuation,
               COALESCE(SUM(inv.quantity), 0) as total_units,
               COUNT(DISTINCT p.id) as total_products
        FROM products p
        JOIN inventories inv ON inv.product_id = p.id
        WHERE p.company_id = ?
      `).get(companyId);

      // Stock status counts
      const stockCounts = await db.prepare(`
        SELECT
          COUNT(CASE WHEN inv_sum <= 0 THEN 1 END) as out_of_stock,
          COUNT(CASE WHEN inv_sum > 0 AND inv_sum <= stock_min THEN 1 END) as low_stock,
          COUNT(CASE WHEN inv_sum > stock_min THEN 1 END) as optimal_stock
        FROM (
          SELECT p.id, p.stock_min, COALESCE(SUM(inv.quantity), 0) as inv_sum
          FROM products p
          LEFT JOIN inventories inv ON inv.product_id = p.id
          WHERE p.company_id = ?
          GROUP BY p.id, p.stock_min
        ) sub
      `).get(companyId);

      // Product sales in last 30 days
      const productsRotation = await db.prepare(`
        SELECT p.id, p.name, p.sku, p.shade_number, p.line, p.cost, p.price,
               c.name as category_name, b.name as brand_name,
               COALESCE(SUM(inv.quantity), 0) as current_stock,
               (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE si.product_id = p.id AND s.status != 'cancelled' AND s.created_at >= (CURRENT_DATE - INTERVAL '30 days')) as units_sold_30d,
               (SELECT MAX(s.created_at) FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE si.product_id = p.id AND s.status != 'cancelled') as last_sale_date
        FROM products p
        LEFT JOIN inventories inv ON inv.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.company_id = ?
        GROUP BY p.id, p.name, p.sku, p.shade_number, p.line, p.cost, p.price, c.name, b.name
        ORDER BY units_sold_30d DESC
      `).all(companyId);

      const classified = productsRotation.map(p => {
        let rotationClass = 'sin_movimiento';
        const sold = parseFloat(p.units_sold_30d || 0);

        let daysSinceSale = 999;
        if (p.last_sale_date) {
          daysSinceSale = Math.floor((new Date() - new Date(p.last_sale_date)) / (1000 * 60 * 60 * 24));
        }

        if (sold >= 25) rotationClass = 'alta';
        else if (sold >= 8) rotationClass = 'media';
        else if (sold >= 1) rotationClass = 'baja';
        else rotationClass = 'sin_movimiento';

        const isDeadStock = daysSinceSale >= noMovementDays;

        return {
          ...p,
          rotation_class: rotationClass,
          days_since_last_sale: daysSinceSale === 999 ? null : daysSinceSale,
          is_dead_stock: isDeadStock,
          stock_valuation: Math.round(p.cost * p.current_stock * 100) / 100
        };
      });

      // Group counts
      const rotationSummary = {
        alta: classified.filter(p => p.rotation_class === 'alta').length,
        media: classified.filter(p => p.rotation_class === 'media').length,
        baja: classified.filter(p => p.rotation_class === 'baja').length,
        sin_movimiento: classified.filter(p => p.is_dead_stock).length
      };

      // Valuation by category
      const valuationByCategory = await db.prepare(`
        SELECT c.name, COALESCE(SUM(p.cost * inv.quantity), 0) as valuation
        FROM categories c
        JOIN products p ON p.category_id = c.id
        JOIN inventories inv ON inv.product_id = p.id
        WHERE c.company_id = ?
        GROUP BY c.id
        ORDER BY valuation DESC
      `).all(companyId);

      // Valuation by brand
      const valuationByBrand = await db.prepare(`
        SELECT b.name, COALESCE(SUM(p.cost * inv.quantity), 0) as valuation
        FROM brands b
        JOIN products p ON p.brand_id = b.id
        JOIN inventories inv ON inv.product_id = p.id
        WHERE b.company_id = ?
        GROUP BY b.id
        ORDER BY valuation DESC
      `).all(companyId);

      return res.json({
        success: true,
        data: {
          kpis: {
            total_valuation: totals.total_valuation,
            total_units: totals.total_units,
            total_products: totals.total_products,
            out_of_stock: stockCounts.out_of_stock,
            low_stock: stockCounts.low_stock,
            optimal_stock: stockCounts.optimal_stock,
            no_movement_days_threshold: noMovementDays
          },
          rotation_summary: rotationSummary,
          products: classified,
          valuation_by_category: valuationByCategory,
          valuation_by_brand: valuationByBrand
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = inventoryController;
