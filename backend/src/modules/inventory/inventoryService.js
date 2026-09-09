const { db } = require('../../database/db');

const InventoryService = {
  /**
   * Adjusts stock and logs an immutable Kardex movement.
   * Concurrency-safe, supports optional transactional db client (txClient).
   */
  recordMovement: async ({
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
    txClient = null
  }) => {
    const activeDb = txClient || db;
    const changeQty = Number(quantity);

    if (isNaN(changeQty) || !isFinite(changeQty)) {
      throw new Error(`Cantidad inválida para movimiento de inventario: ${quantity}`);
    }

    // 1. Fetch current inventory with row-level lock if transactional
    let currentInv;
    const lockClause = txClient ? ' FOR UPDATE' : '';
    if (variantId) {
      currentInv = await activeDb.prepare(`
        SELECT id, quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id = ?${lockClause}
      `).get(warehouseId, productId, variantId);
    } else {
      currentInv = await activeDb.prepare(`
        SELECT id, quantity, reserved_quantity
        FROM inventories
        WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL${lockClause}
      `).get(warehouseId, productId);
    }

    const prevQty = currentInv ? Number(currentInv.quantity) : 0;
    const reservedQty = currentInv ? Number(currentInv.reserved_quantity || 0) : 0;
    const newQty = prevQty + changeQty;

    // 2. Check negative stock constraint if decreasing
    if (changeQty < 0) {
      const comp = await activeDb.prepare('SELECT allow_negative_inventory FROM companies WHERE id = ?').get(companyId);
      const allowNegative = comp && (comp.allow_negative_inventory === true || comp.allow_negative_inventory === 1 || comp.allow_negative_inventory === '1');
      
      // Check physical stock constraint
      if (newQty < 0 && !allowNegative) {
        throw new Error(`Inventario insuficiente para el producto ID ${productId}. Stock actual: ${prevQty}, Solicitado: ${Math.abs(changeQty)}`);
      }
    }

    // 3. Upsert inventory atomically
    let inventoryId;
    if (currentInv) {
      inventoryId = currentInv.id;
      // Atomic increment in DB
      await activeDb.prepare(`
        UPDATE inventories
        SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(changeQty, inventoryId);
    } else {
      const insertRes = await activeDb.prepare(`
        INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity, reserved_quantity)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run(companyId, branchId, warehouseId, productId, variantId, newQty);
      inventoryId = insertRes.lastInsertRowid;
    }

    // 4. Record Kardex movement
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
      new_quantity: newQty
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
  }
};

module.exports = InventoryService;
