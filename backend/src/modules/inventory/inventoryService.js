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

    // 2. Fetch locked row
    const lockClause = txClient ? ' FOR UPDATE' : '';
    let currentInv;
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
    const effectiveAvailable = prevQty - reservedQty;
    const newQty = prevQty + changeQty;

    // 3. Strict verification of physical stock & reserved stock under row-level lock
    if (changeQty < 0 && !allowNegative) {
      if (newQty < 0 || (effectiveAvailable + changeQty < 0 && movementType !== 'sale_checkout_reserved')) {
        throw new Error(`Inventario insuficiente para el producto ID ${productId}. Stock actual: ${prevQty} (Disponible: ${Math.max(0, effectiveAvailable)}), Solicitado: ${Math.abs(changeQty)}`);
      }
    }

    // 4. Update inventory atomically with database-level constraint
    const updateRes = await activeDb.prepare(`
      UPDATE inventories
      SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (? = true OR quantity + ? >= 0)
    `).run(changeQty, currentInv.id, allowNegative ? true : false, changeQty);

    if (updateRes.changes === 0 && changeQty < 0 && !allowNegative) {
      throw new Error(`Conflicto de inventario concurrente: Stock insuficiente para el producto ID ${productId}.`);
    }

    const inventoryId = currentInv.id;

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
