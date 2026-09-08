const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const { logAudit } = require('../../middlewares/audit');

const purchasesController = {
  getPurchases: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, supplier_id, status, start_date, end_date } = req.query;

      let whereClauses = ['p.company_id = ?'];
      let params = [companyId];

      if (supplier_id) {
        whereClauses.push('p.supplier_id = ?');
        params.push(supplier_id);
      }
      if (status) {
        whereClauses.push('p.status = ?');
        params.push(status);
      }
      if (start_date) {
        whereClauses.push('date(p.created_at) >= ?');
        params.push(start_date);
      }
      if (end_date) {
        whereClauses.push('date(p.created_at) <= ?');
        params.push(end_date);
      }
      if (search) {
        whereClauses.push('(p.purchase_number LIKE ? OR p.supplier_invoice_number LIKE ? OR s.company_name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const purchases = await db.prepare(`
        SELECT p.*,
               s.company_name as supplier_name, s.tax_id as supplier_tax_id,
               w.name as warehouse_name,
               b.name as branch_name,
               u.first_name || ' ' || u.last_name as user_name
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        JOIN warehouses w ON p.warehouse_id = w.id
        JOIN branches b ON p.branch_id = b.id
        JOIN users u ON p.user_id = u.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY p.created_at DESC
      `).all(...params);

      return res.json({ success: true, data: purchases });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando compras.', error: err.message });
    }
  },

  getPurchaseById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const purchase = await db.prepare(`
        SELECT p.*,
               s.company_name as supplier_name, s.tax_id as supplier_tax_id, s.phone as supplier_phone,
               w.name as warehouse_name,
               b.name as branch_name
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        JOIN warehouses w ON p.warehouse_id = w.id
        JOIN branches b ON p.branch_id = b.id
        WHERE p.id = ? AND p.company_id = ?
      `).get(id, companyId);

      if (!purchase) {
        return res.status(404).json({ success: false, message: 'Compra no encontrada.' });
      }

      purchase.items = await db.prepare(`
        SELECT pi.*, p.name as product_name, p.sku, pv.variant_name
        FROM purchase_items pi
        JOIN products p ON pi.product_id = p.id
        LEFT JOIN product_variants pv ON pi.variant_id = pv.id
        WHERE pi.purchase_id = ?
      `).all(id);

      return res.json({ success: true, data: purchase });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo detalle de compra.', error: err.message });
    }
  },

  createPurchase: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        supplier_id, branch_id, warehouse_id, supplier_invoice_number,
        payment_terms = 'cash', credit_days = 30, notes, items
      } = req.body;

      const parsedSupplierId = parseInt(supplier_id, 10);
      const parsedWarehouseId = parseInt(warehouse_id, 10);

      if (!parsedSupplierId || !parsedWarehouseId || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Proveedor, almacén y al menos un ítem son obligatorios.' });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(parsedWarehouseId, companyId);
      if (!warehouse) return res.status(404).json({ success: false, message: 'Almacén no válido.' });

      const purchaseNumber = `COM-${Date.now().toString().slice(-6)}`;

      const purchaseId = await runTransaction(async (txDb) => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;

        items.forEach(item => {
          const itemSubtotal = parseFloat(item.quantity || 1) * parseFloat(item.unit_cost || 0);
          const itemTax = itemSubtotal * (parseFloat(item.tax_rate || 18) / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          total += itemSubtotal + itemTax;
        });

        // 1. Insert purchase
        const stmtPurch = txDb.prepare(`
          INSERT INTO purchases (
            company_id, branch_id, warehouse_id, supplier_id, user_id,
            purchase_number, supplier_invoice_number, payment_terms, payment_status,
            subtotal, tax_amount, total, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')
        `);

        const paymentStatus = payment_terms === 'credit' ? 'pending' : 'paid';
        const resPurch = await stmtPurch.run(
          companyId, warehouse.branch_id, parsedWarehouseId, parsedSupplierId, req.user.id,
          purchaseNumber, supplier_invoice_number || null, payment_terms, paymentStatus,
          subtotal, taxAmount, total, notes || null
        );
        const pId = resPurch.lastInsertRowid;

        // 2. Insert items and update inventory & kardex
        const stmtItem = txDb.prepare(`
          INSERT INTO purchase_items (
            purchase_id, product_id, variant_id, quantity, unit_cost, subtotal, tax_rate, tax_amount, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const pIdItem = parseInt(item.product_id, 10);
          if (!pIdItem) continue;

          const itemQty = Math.abs(parseFloat(item.quantity || 1));
          const itemCost = parseFloat(item.unit_cost || 0);
          const itemTaxRate = parseFloat(item.tax_rate || 18);
          const itemSub = itemQty * itemCost;
          const itemTax = itemSub * (itemTaxRate / 100);
          const itemTot = itemSub + itemTax;
          const variantId = item.variant_id ? parseInt(item.variant_id, 10) : null;

          await stmtItem.run(
            pId, pIdItem, variantId, itemQty, itemCost,
            itemSub, itemTaxRate, itemTax, itemTot
          );

          // Update stock and Kardex (uses global db — InventoryService reads current stock & writes)
          await InventoryService.recordMovement({
            companyId,
            branchId: warehouse.branch_id,
            warehouseId: parsedWarehouseId,
            productId: pIdItem,
            variantId: variantId,
            userId: req.user.id,
            movementType: 'purchase',
            quantity: itemQty,
            unitCost: itemCost,
            referenceType: 'purchases',
            referenceId: pId,
            reason: `Compra de mercancía ${purchaseNumber} (Factura Prov: ${supplier_invoice_number || 'N/A'})`
          });

          // Update product cost to latest purchase cost
          await txDb.prepare('UPDATE products SET cost = ? WHERE id = ?').run(itemCost, pIdItem);
          if (variantId) {
            await txDb.prepare('UPDATE product_variants SET cost = ? WHERE id = ?').run(itemCost, variantId);
          }
        }

        // 3. If credit, generate Accounts Payable (CxP)
        if (payment_terms === 'credit') {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + Number(credit_days || 30));
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const issueDateStr = new Date().toISOString().split('T')[0];

          await txDb.prepare(`
            INSERT INTO accounts_payable (
              company_id, branch_id, supplier_id, purchase_id, document_number,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(companyId, warehouse.branch_id, parsedSupplierId, pId, supplier_invoice_number || purchaseNumber, issueDateStr, dueDateStr, total, total);

          // Update supplier balance
          await txDb.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?').run(total, parsedSupplierId);
        }

        return pId;
      });

      // Audit log after successful commit
      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'purchases',
        action: 'create_purchase',
        recordId: purchaseId,
        newValues: { purchase_number: purchaseNumber, payment_terms },
        description: `Compra registrada ${purchaseNumber}`
      });

      return res.status(201).json({ success: true, message: 'Compra registrada exitosamente.', purchase_id: purchaseId });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
};

module.exports = purchasesController;
