const { db, runTransaction } = require('../../database/db');

const InventoryService = {
  /**
   * Adjusts stock and logs an immutable Kardex movement.
   * Concurrency-safe, supports optional transactional db client (txClient).
   * If txClient is not provided, automatically wraps execution in an atomic runTransaction.
   */
  recordMovement: async (params) => {
    if (!params.txClient) {
      return await runTransaction(async (txDb) => {
        return await InventoryService.recordMovement({ ...params, txClient: txDb });
      });
    }

    const {
      companyId,
      branchId,
      warehouseId,
      toWarehouseId = null,
      productId,
      variantId = null,
      userId,
      movementType,
      quantity, // positive to increase, negative to decrease
      unitCost = 0,
      referenceType = null,
      referenceId = null,
      reason = '',
      txClient
    } = params;

    const activeDb = txClient;
    const changeQty = Number(quantity);

    if (isNaN(changeQty) || !isFinite(changeQty)) {
      throw new Error(`Cantidad inválida para movimiento de inventario: ${quantity}`);
    }

    // 1. Ensure inventory row exists to guarantee row-level lock
    const comp = await activeDb.prepare('SELECT allow_negative_inventory FROM companies WHERE id = ?').get(companyId);
    const allowNegative = comp && (comp.allow_negative_inventory === true || comp.allow_negative_inventory === 1 || comp.allow_negative_inventory === '1');

    if (variantId) {
      await activeDb.prepare(`
        INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity, reserved_quantity)
        VALUES (?, ?, ?, ?, ?, 0, 0)
        ON CONFLICT DO NOTHING
      `).run(companyId, branchId, warehouseId, productId, variantId);
    } else {
      // Use WHERE variant_id IS NULL conflict protection
      const existing = await activeDb.prepare(`
        SELECT id FROM inventories WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL
      `).get(warehouseId, productId);
      if (!existing) {
        await activeDb.prepare(`
          INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity, reserved_quantity)
          VALUES (?, ?, ?, ?, NULL, 0, 0)
        `).run(companyId, branchId, warehouseId, productId);
      }
    }

    // 2. Fetch inventory record id and current reservation status
    let currentInv;
    if (variantId) {
      currentInv = await activeDb.prepare(`
        SELECT id, quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id = ? FOR UPDATE
      `).get(warehouseId, productId, variantId);
    } else {
      currentInv = await activeDb.prepare(`
        SELECT id, quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL FOR UPDATE
      `).get(warehouseId, productId);
    }

    if (!currentInv) {
      throw new Error(`Registro de inventario no encontrado para el producto ID ${productId}.`);
    }

    const inventoryId = currentInv.id;
    const initialPrevQty = Number(currentInv.quantity || 0);
    const initialReservedQty = Number(currentInv.reserved_quantity || 0);
    const reserveChange = Number(params.reserveChange || 0);

    // 3. Update inventory atomically with database-level constraint and RETURNING *
    // When changeQty < 0 and allowNegative is false, we must guarantee available stock (quantity - reserved_quantity + changeQty >= 0)
    const updateRes = await activeDb.prepare(`
      UPDATE inventories
      SET quantity = quantity + ?,
          reserved_quantity = GREATEST(0, reserved_quantity + ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (? = true OR (quantity - reserved_quantity + ?) >= 0)
      RETURNING id, quantity, reserved_quantity
    `).run(changeQty, reserveChange, inventoryId, allowNegative ? true : false, changeQty);

    if (updateRes.changes === 0 && changeQty < 0 && !allowNegative) {
      const availableStock = Math.max(0, initialPrevQty - initialReservedQty);
      throw new Error(`Inventario insuficiente para el producto ID ${productId}. Stock físico: ${initialPrevQty}, Reservado: ${initialReservedQty} (Disponible: ${availableStock}), Solicitado: ${Math.abs(changeQty)}`);
    }

    const updatedRow = updateRes.row;
    const newQty = updatedRow ? Number(updatedRow.quantity) : (initialPrevQty + changeQty);
    const prevQty = newQty - changeQty;

    // 4. Record Kardex movement (only if physical quantity changed or explicitly required)
    const totalCost = Math.round(Math.abs(changeQty) * Number(unitCost) * 100) / 100;
    const movResult = await activeDb.prepare(`
      INSERT INTO inventory_movements (
        company_id, branch_id, warehouse_id, to_warehouse_id,
        product_id, variant_id, user_id, movement_type,
        previous_quantity, quantity, new_quantity, unit_cost, total_cost,
        reference_type, reference_id, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId, branchId, warehouseId, toWarehouseId,
      productId, variantId, userId, movementType,
      prevQty, changeQty, newQty, unitCost, totalCost,
      referenceType, referenceId, reason
    );

    return {
      movement_id: movResult.lastInsertRowid,
      inventory_id: inventoryId,
      previous_quantity: prevQty,
      quantity: changeQty,
      new_quantity: newQty,
      reserved_quantity: updatedRow ? Number(updatedRow.reserved_quantity) : Math.max(0, initialReservedQty + reserveChange)
    };
  },

  getCurrentStock: async (warehouseId, productId, variantId = null) => {
    let row;
    if (variantId) {
      row = await db.prepare(`
        SELECT quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id = ?
      `).get(warehouseId, productId, variantId);
    } else {
      row = await db.prepare(`
        SELECT quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL
      `).get(warehouseId, productId);
    }

    if (!row) return 0;
    const total = Number(row.quantity || 0);
    const reserved = Number(row.reserved_quantity || 0);
    // Returns available stock (physical minus reserved)
    return Math.max(0, total - reserved);
  },

  getAvailableStock: async (warehouseId, productId, variantId = null) => {
    return await InventoryService.getCurrentStock(warehouseId, productId, variantId);
  },

  getPhysicalStock: async (warehouseId, productId, variantId = null) => {
    let row;
    if (variantId) {
      row = await db.prepare(`
        SELECT quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id = ?
      `).get(warehouseId, productId, variantId);
    } else {
      row = await db.prepare(`
        SELECT quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL
      `).get(warehouseId, productId);
    }
    return row ? Number(row.quantity || 0) : 0;
  },

  reserveStock: async ({ companyId, warehouseId, productId, variantId = null, quantity, txClient = null }) => {
    const qty = Math.abs(Number(quantity));
    if (qty <= 0) return true;
    const activeDb = txClient || db;
    const res = await activeDb.prepare(`
      UPDATE inventories
      SET reserved_quantity = reserved_quantity + ?, updated_at = CURRENT_TIMESTAMP
      WHERE warehouse_id = ? AND product_id = ? AND (? IS NULL OR variant_id = ?)
        AND (quantity - reserved_quantity) >= ?
      RETURNING id, quantity, reserved_quantity
    `).run(qty, warehouseId, productId, variantId, variantId, qty);
    if (res.changes === 0) {
      throw new Error(`Stock insuficiente para reservar ${qty} unidades del producto ID ${productId}.`);
    }
    return res.row;
  },

  releaseStock: async ({ companyId, warehouseId, productId, variantId = null, quantity, txClient = null }) => {
    const qty = Math.abs(Number(quantity));
    if (qty <= 0) return true;
    const activeDb = txClient || db;
    const res = await activeDb.prepare(`
      UPDATE inventories
      SET reserved_quantity = GREATEST(0, reserved_quantity - ?), updated_at = CURRENT_TIMESTAMP
      WHERE warehouse_id = ? AND product_id = ? AND (? IS NULL OR variant_id = ?)
      RETURNING id, quantity, reserved_quantity
    `).run(qty, warehouseId, productId, variantId, variantId);
    return res.row;
  },

  addStockTransaction: async (params, txDb = null) => {
    return await InventoryService.recordMovement({
      companyId: params.companyId,
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      toWarehouseId: params.toWarehouseId || null,
      productId: params.productId,
      variantId: params.variantId || null,
      userId: params.userId,
      movementType: (params.type || 'purchase').toLowerCase(),
      quantity: params.quantity,
      unitCost: params.unitCost || 0,
      referenceType: params.documentType || 'purchases',
      referenceId: params.documentId || null,
      reason: params.notes || params.reason || '',
      txClient: params.txClient || txDb
    });
  }
};

module.exports = InventoryService;
