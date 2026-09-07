const { db, runTransaction } = require('../../database/db');

const InventoryService = {
  /**
   * Adjusts stock and logs an immutable Kardex movement
   */
  recordMovement: ({
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
    reason = ''
  }) => {
    // 1. Get current stock
    let currentInv = db.prepare(`
      SELECT id, quantity, reserved_quantity
      FROM inventories
      WHERE warehouse_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
    `).get(warehouseId, productId, variantId, variantId);

    const prevQty = currentInv ? Number(currentInv.quantity) : 0;
    const changeQty = Number(quantity);
    const newQty = prevQty + changeQty;

    // 2. Check negative stock constraint
    if (newQty < 0) {
      const comp = db.prepare('SELECT allow_negative_inventory FROM companies WHERE id = ?').get(companyId);
      if (!comp || comp.allow_negative_inventory === 0) {
        throw new Error(`Inventario insuficiente. Stock actual: ${prevQty}, Solicitado: ${Math.abs(changeQty)}`);
      }
    }

    // 3. Upsert inventory
    if (currentInv) {
      db.prepare(`
        UPDATE inventories
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQty, currentInv.id);
    } else {
      db.prepare(`
        INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(companyId, branchId, warehouseId, productId, variantId, newQty);
    }

    // 4. Record Kardex movement
    const totalCost = Math.abs(changeQty) * Number(unitCost);
    const movResult = db.prepare(`
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
      previous_quantity: prevQty,
      quantity: changeQty,
      new_quantity: newQty
    };
  },

  getCurrentStock: (warehouseId, productId, variantId = null) => {
    const row = db.prepare(`
      SELECT quantity, reserved_quantity
      FROM inventories
      WHERE warehouse_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
    `).get(warehouseId, productId, variantId, variantId);

    return row ? Number(row.quantity) : 0;
  }
};

module.exports = InventoryService;
