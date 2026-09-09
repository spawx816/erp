const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const { logAudit } = require('../../middlewares/audit');
const { generateCommercialId } = require('../../utils/idGenerator');

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

      if (!parsedSupplierId || !parsedWarehouseId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Proveedor, almacén y al menos un ítem son obligatorios.' });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(parsedWarehouseId, companyId);
      if (!warehouse) return res.status(404).json({ success: false, message: 'Almacén no válido para su empresa.' });

      const supplier = await db.prepare('SELECT id, name FROM suppliers WHERE id = ? AND company_id = ?').get(parsedSupplierId, companyId);
      if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado en su empresa.' });

      const purchaseNumber = generateCommercialId('COM');

      const purchaseId = await runTransaction(async (txDb) => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;

        const preparedItems = [];

        for (const item of items) {
          const pIdItem = parseInt(item.product_id, 10);
          if (!pIdItem) {
            throw new Error('Cada línea de compra debe tener un product_id válido.');
          }

          const itemQty = Number(item.quantity);
          if (isNaN(itemQty) || !isFinite(itemQty) || itemQty <= 0) {
            throw new Error(`Cantidad inválida para el producto ID ${pIdItem}: ${item.quantity}. Debe ser mayor a 0.`);
          }

          const itemCost = Number(item.unit_cost !== undefined ? item.unit_cost : 0);
          if (isNaN(itemCost) || !isFinite(itemCost) || itemCost < 0) {
            throw new Error(`Costo unitario inválido para el producto ID ${pIdItem}: ${item.unit_cost}`);
          }

          // Respect explicit 0% tax rate
          const itemTaxRate = Number(item.tax_rate !== undefined ? item.tax_rate : 18);
          if (isNaN(itemTaxRate) || itemTaxRate < 0) {
            throw new Error(`Tasa de impuesto inválida para el producto ID ${pIdItem}: ${item.tax_rate}`);
          }

          // Verify product belongs to company
          const prod = await txDb.prepare('SELECT id, name, cost FROM products WHERE id = ? AND company_id = ?').get(pIdItem, companyId);
          if (!prod) {
            throw new Error(`Producto ID ${pIdItem} no pertenece a su empresa.`);
          }

          const variantId = item.variant_id ? parseInt(item.variant_id, 10) : null;
          if (variantId) {
            const variant = await txDb.prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?').get(variantId, pIdItem);
            if (!variant) {
              throw new Error(`Variante ID ${variantId} no pertenece al producto [${prod.name}].`);
            }
          }

          const itemSub = Math.round(itemQty * itemCost * 100) / 100;
          const itemTax = Math.round(itemSub * (itemTaxRate / 100) * 100) / 100;
          const itemTot = Math.round((itemSub + itemTax) * 100) / 100;

          subtotal = Math.round((subtotal + itemSub) * 100) / 100;
          taxAmount = Math.round((taxAmount + itemTax) * 100) / 100;
          total = Math.round((total + itemTot) * 100) / 100;

          preparedItems.push({
            product_id: pIdItem,
            variant_id: variantId,
            quantity: itemQty,
            unit_cost: itemCost,
            subtotal: itemSub,
            tax_rate: itemTaxRate,
            tax_amount: itemTax,
            total: itemTot
          });
        }

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

        // 2. Insert items and update inventory & kardex with txClient
        const stmtItem = txDb.prepare(`
          INSERT INTO purchase_items (
            purchase_id, product_id, variant_id, quantity, unit_cost, subtotal, tax_rate, tax_amount, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of preparedItems) {
          await stmtItem.run(
            pId, it.product_id, it.variant_id, it.quantity, it.unit_cost,
            it.subtotal, it.tax_rate, it.tax_amount, it.total
          );

          // Update stock and Kardex passing transactional client
          await InventoryService.recordMovement({
            companyId,
            branchId: warehouse.branch_id,
            warehouseId: parsedWarehouseId,
            productId: it.product_id,
            variantId: it.variant_id,
            userId: req.user.id,
            movementType: 'purchase',
            quantity: it.quantity,
            unitCost: it.unit_cost,
            referenceType: 'purchases',
            referenceId: pId,
            reason: `Compra de mercancía ${purchaseNumber} (Factura Prov: ${supplier_invoice_number || 'N/A'})`,
            txClient: txDb
          });

          // Update product cost to latest purchase cost
          await txDb.prepare('UPDATE products SET cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?').run(it.unit_cost, it.product_id, companyId);
          if (it.variant_id) {
            await txDb.prepare('UPDATE product_variants SET cost = ? WHERE id = ?').run(it.unit_cost, it.variant_id);
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
          await txDb.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ? AND company_id = ?').run(total, parsedSupplierId, companyId);
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
