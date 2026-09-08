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

      if (!supplier_id || !warehouse_id || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Proveedor, almacén y al menos un ítem son obligatorios.' });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(warehouse_id, companyId);
      if (!warehouse) return res.status(404).json({ success: false, message: 'Almacén no válido.' });

      const purchaseNumber = `COM-${Date.now().toString().slice(-6)}`;

      const purchaseId = await runTransaction(async () => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;

        items.forEach(item => {
          const itemSubtotal = Number(item.quantity) * Number(item.unit_cost);
          const itemTax = itemSubtotal * (Number(item.tax_rate || 18) / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          total += itemSubtotal + itemTax;
        });

        // 1. Insert purchase
        const stmtPurch = db.prepare(`
          INSERT INTO purchases (
            company_id, branch_id, warehouse_id, supplier_id, user_id,
            purchase_number, supplier_invoice_number, payment_terms, payment_status,
            subtotal, tax_amount, total, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')
        `);

        const paymentStatus = payment_terms === 'credit' ? 'pending' : 'paid';
        const resPurch = await stmtPurch.run(
          companyId, warehouse.branch_id, warehouse_id, supplier_id, req.user.id,
          purchaseNumber, supplier_invoice_number || null, payment_terms, paymentStatus,
          subtotal, taxAmount, total, notes || null
        );
        const pId = resPurch.lastInsertRowid;

        // 2. Insert items and update inventory & kardex
        const stmtItem = db.prepare(`
          INSERT INTO purchase_items (
            purchase_id, product_id, variant_id, quantity, unit_cost, subtotal, tax_rate, tax_amount, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const itemSub = Number(item.quantity) * Number(item.unit_cost);
          const itemTax = itemSub * (Number(item.tax_rate || 18) / 100);
          const itemTot = itemSub + itemTax;

          await stmtItem.run(
            pId, item.product_id, item.variant_id || null, item.quantity, item.unit_cost,
            itemSub, item.tax_rate || 18, itemTax, itemTot
          );

          // Update stock and Kardex
          await InventoryService.recordMovement({
            companyId,
            branchId: warehouse.branch_id,
            warehouseId,
            productId: item.product_id,
            variantId: item.variant_id || null,
            userId: req.user.id,
            movementType: 'purchase',
            quantity: Math.abs(Number(item.quantity)),
            unitCost: item.unit_cost,
            referenceType: 'purchases',
            referenceId: pId,
            reason: `Compra de mercancía ${purchaseNumber} (Factura Prov: ${supplier_invoice_number || 'N/A'})`
          });

          // Update product cost to latest purchase cost
          await db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(item.unit_cost, item.product_id);
          if (item.variant_id) {
            await db.prepare('UPDATE product_variants SET cost = ? WHERE id = ?').run(item.unit_cost, item.variant_id);
          }
        }

        // 3. If credit, generate Accounts Payable (CxP)
        if (payment_terms === 'credit') {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + Number(credit_days || 30));
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const issueDateStr = new Date().toISOString().split('T')[0];

          await db.prepare(`
            INSERT INTO accounts_payable (
              company_id, branch_id, supplier_id, purchase_id, document_number,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(companyId, warehouse.branch_id, supplier_id, pId, supplier_invoice_number || purchaseNumber, issueDateStr, dueDateStr, total, total);

          // Update supplier balance
          await db.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?').run(total, supplier_id);
        }

        logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'purchases',
          action: 'create_purchase',
          recordId: pId,
          newValues: { purchase_number: purchaseNumber, total, payment_terms },
          description: `Compra registrada ${purchaseNumber} por monto total RD$ ${total.toFixed(2)}`
        });

        return pId;
      });

      return res.status(201).json({ success: true, message: 'Compra registrada exitosamente.', purchase_id: purchaseId });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
};

module.exports = purchasesController;
