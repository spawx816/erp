const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const FiscalService = require('../fiscal/fiscalService');
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
        supplier_id, branch_id, warehouse_id, supplier_invoice_number, ncf,
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

      // Validate supplier invoice NCF if formatted as DGII sequence
      const ncfToValidate = ncf || supplier_invoice_number;
      if (ncfToValidate && /^[BE]/i.test(String(ncfToValidate).trim())) {
        const ncfCheck = FiscalService.validateSupplierNCF(ncfToValidate);
        if (!ncfCheck.valid) {
          return res.status(400).json({ success: false, message: ncfCheck.message });
        }
      }

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
              company_id, branch_id, supplier_id, purchase_id, purchase_order_id, document_number,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending')
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
  },

  // -------------------------------------------------------------
  // PURCHASE ORDERS (ÓRDENES DE COMPRA)
  // -------------------------------------------------------------
  getPurchaseOrders: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, supplier_id, status, start_date, end_date } = req.query;

      let whereClauses = ['po.company_id = ?'];
      let params = [companyId];

      if (supplier_id) {
        whereClauses.push('po.supplier_id = ?');
        params.push(supplier_id);
      }
      if (status) {
        whereClauses.push('po.status = ?');
        params.push(status);
      }
      if (start_date) {
        whereClauses.push('date(po.created_at) >= ?');
        params.push(start_date);
      }
      if (end_date) {
        whereClauses.push('date(po.created_at) <= ?');
        params.push(end_date);
      }
      if (search) {
        whereClauses.push('(po.order_number LIKE ? OR s.company_name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      const orders = await db.prepare(`
        SELECT po.*,
               s.company_name as supplier_name, s.tax_id as supplier_tax_id, s.phone as supplier_phone,
               w.name as warehouse_name,
               b.name as branch_name,
               u.first_name || ' ' || u.last_name as user_name,
               (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) as items_count
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        JOIN warehouses w ON po.warehouse_id = w.id
        JOIN branches b ON po.branch_id = b.id
        JOIN users u ON po.user_id = u.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY po.created_at DESC
      `).all(...params);

      return res.json({ success: true, data: orders });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando órdenes de compra.', error: err.message });
    }
  },

  getPurchaseOrderById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const order = await db.prepare(`
        SELECT po.*,
               s.company_name as supplier_name, s.tax_id as supplier_tax_id, s.phone as supplier_phone,
               s.email as supplier_email, s.address as supplier_address, s.contact_person as supplier_contact,
               w.name as warehouse_name,
               b.name as branch_name,
               u.first_name || ' ' || u.last_name as user_name
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        JOIN warehouses w ON po.warehouse_id = w.id
        JOIN branches b ON po.branch_id = b.id
        JOIN users u ON po.user_id = u.id
        WHERE po.id = ? AND po.company_id = ?
      `).get(id, companyId);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Orden de compra no encontrada.' });
      }

      order.items = await db.prepare(`
        SELECT poi.*, p.name as product_name, p.sku, p.barcode, pv.variant_name
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        LEFT JOIN product_variants pv ON poi.variant_id = pv.id
        WHERE poi.purchase_order_id = ?
      `).all(id);

      const company = await db.prepare('SELECT id, name, legal_name, tax_id, phone, email, address FROM companies WHERE id = ?').get(companyId);
      order.company = company || {};

      return res.json({ success: true, data: order });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo detalle de orden.', error: err.message });
    }
  },

  createPurchaseOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        supplier_id, warehouse_id, expected_date, notes, items
      } = req.body;

      const parsedSupplierId = parseInt(supplier_id, 10);
      const parsedWarehouseId = parseInt(warehouse_id, 10);

      if (!parsedSupplierId || !parsedWarehouseId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Proveedor, almacén y al menos un producto son requeridos.' });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(parsedWarehouseId, companyId);
      if (!warehouse) return res.status(404).json({ success: false, message: 'Almacén no válido para su empresa.' });

      const supplier = await db.prepare('SELECT id, company_name FROM suppliers WHERE id = ? AND company_id = ?').get(parsedSupplierId, companyId);
      if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado en su empresa.' });

      const orderNumber = generateCommercialId('OC');

      const orderId = await runTransaction(async (txDb) => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;
        const preparedItems = [];

        for (const item of items) {
          const pId = parseInt(item.product_id, 10);
          if (!pId) throw new Error('Cada artículo debe tener un producto válido.');

          const qty = Number(item.quantity);
          if (isNaN(qty) || qty <= 0) throw new Error(`Cantidad inválida para producto ID ${pId}.`);

          const cost = Number(item.unit_cost !== undefined ? item.unit_cost : 0);
          if (isNaN(cost) || cost < 0) throw new Error(`Costo inválido para producto ID ${pId}.`);

          const taxRate = Number(item.tax_rate !== undefined ? item.tax_rate : 18);

          const prod = await txDb.prepare('SELECT id, name FROM products WHERE id = ? AND company_id = ?').get(pId, companyId);
          if (!prod) throw new Error(`Producto ID ${pId} no pertenece a su empresa.`);

          const itemSub = Math.round(qty * cost * 100) / 100;
          const itemTax = Math.round(itemSub * (taxRate / 100) * 100) / 100;
          const itemTot = Math.round((itemSub + itemTax) * 100) / 100;

          subtotal = Math.round((subtotal + itemSub) * 100) / 100;
          taxAmount = Math.round((taxAmount + itemTax) * 100) / 100;
          total = Math.round((total + itemTot) * 100) / 100;

          preparedItems.push({
            product_id: pId,
            variant_id: item.variant_id ? parseInt(item.variant_id, 10) : null,
            quantity: qty,
            unit_cost: cost,
            subtotal: itemSub,
            tax_rate: taxRate,
            tax_amount: itemTax,
            total: itemTot
          });
        }

        const resPo = await txDb.prepare(`
          INSERT INTO purchase_orders (
            company_id, branch_id, warehouse_id, supplier_id, user_id,
            order_number, status, expected_date, subtotal, tax_amount, total, notes
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
        `).run(
          companyId, warehouse.branch_id, parsedWarehouseId, parsedSupplierId, req.user.id,
          orderNumber, expected_date || null, subtotal, taxAmount, total, notes || null
        );

        const poId = resPo.row ? resPo.row.id : (await txDb.prepare('SELECT id FROM purchase_orders WHERE order_number = ?').get(orderNumber)).id;

        for (const it of preparedItems) {
          await txDb.prepare(`
            INSERT INTO purchase_order_items (
              purchase_order_id, product_id, variant_id, quantity, received_quantity,
              unit_cost, subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?)
          `).run(
            poId, it.product_id, it.variant_id, it.quantity,
            it.unit_cost, it.subtotal, it.tax_rate, it.tax_amount, it.total
          );
        }

        return poId;
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'purchases',
        action: 'create_purchase_order',
        recordId: orderId,
        newValues: { order_number: orderNumber },
        description: `Orden de compra creada ${orderNumber}`
      });

      return res.status(201).json({ success: true, message: 'Orden de compra creada exitosamente.', order_id: orderId, order_number: orderNumber });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  updatePurchaseOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        supplier_id, warehouse_id, expected_date, notes, items
      } = req.body;

      const parsedSupplierId = parseInt(supplier_id, 10);
      const parsedWarehouseId = parseInt(warehouse_id, 10);

      if (!parsedSupplierId || !parsedWarehouseId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Proveedor, almacén y al menos un producto son requeridos.' });
      }

      // Check current PO
      const currentPo = await db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!currentPo) {
        return res.status(404).json({ success: false, message: 'Orden de compra no encontrada.' });
      }

      if (['received', 'partially_received', 'cancelled'].includes(currentPo.status)) {
        return res.status(400).json({
          success: false,
          message: `No se puede editar una orden en estado "${currentPo.status}". Solo órdenes pendientes o aprobadas pueden modificarse.`
        });
      }

      const warehouse = await db.prepare('SELECT branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(parsedWarehouseId, companyId);
      if (!warehouse) return res.status(404).json({ success: false, message: 'Almacén no válido para su empresa.' });

      const supplier = await db.prepare('SELECT id, company_name FROM suppliers WHERE id = ? AND company_id = ?').get(parsedSupplierId, companyId);
      if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado en su empresa.' });

      await runTransaction(async (txDb) => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;
        const preparedItems = [];

        for (const item of items) {
          const pId = parseInt(item.product_id, 10);
          if (!pId) throw new Error('Cada artículo debe tener un producto válido.');

          const qty = Number(item.quantity);
          if (isNaN(qty) || qty <= 0) throw new Error(`Cantidad inválida para producto ID ${pId}.`);

          const cost = Number(item.unit_cost !== undefined ? item.unit_cost : 0);
          if (isNaN(cost) || cost < 0) throw new Error(`Costo inválido para producto ID ${pId}.`);

          const taxRate = Number(item.tax_rate !== undefined ? item.tax_rate : 18);

          const prod = await txDb.prepare('SELECT id, name FROM products WHERE id = ? AND company_id = ?').get(pId, companyId);
          if (!prod) throw new Error(`Producto ID ${pId} no pertenece a su empresa.`);

          const itemSub = Math.round(qty * cost * 100) / 100;
          const itemTax = Math.round(itemSub * (taxRate / 100) * 100) / 100;
          const itemTot = Math.round((itemSub + itemTax) * 100) / 100;

          subtotal = Math.round((subtotal + itemSub) * 100) / 100;
          taxAmount = Math.round((taxAmount + itemTax) * 100) / 100;
          total = Math.round((total + itemTot) * 100) / 100;

          preparedItems.push({
            product_id: pId,
            variant_id: item.variant_id ? parseInt(item.variant_id, 10) : null,
            quantity: qty,
            unit_cost: cost,
            subtotal: itemSub,
            tax_rate: taxRate,
            tax_amount: itemTax,
            total: itemTot
          });
        }

        // Update purchase_orders record
        await txDb.prepare(`
          UPDATE purchase_orders
          SET branch_id = ?, warehouse_id = ?, supplier_id = ?,
              expected_date = ?, subtotal = ?, tax_amount = ?, total = ?, notes = ?
          WHERE id = ? AND company_id = ?
        `).run(
          warehouse.branch_id, parsedWarehouseId, parsedSupplierId,
          expected_date || null, subtotal, taxAmount, total, notes || null,
          id, companyId
        );

        // Delete old items and insert updated items
        await txDb.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id);

        for (const it of preparedItems) {
          await txDb.prepare(`
            INSERT INTO purchase_order_items (
              purchase_order_id, product_id, variant_id, quantity, received_quantity,
              unit_cost, subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?)
          `).run(
            id, it.product_id, it.variant_id, it.quantity,
            it.unit_cost, it.subtotal, it.tax_rate, it.tax_amount, it.total
          );
        }
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'purchases',
        action: 'update_purchase_order',
        recordId: id,
        description: `Orden de compra actualizada ${currentPo.order_number}`
      });

      return res.json({ success: true, message: 'Orden de compra actualizada exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  updatePurchaseOrderStatus: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'approved', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Estado no válido.' });
      }

      const order = await db.prepare('SELECT id, status, order_number FROM purchase_orders WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!order) return res.status(404).json({ success: false, message: 'Orden no encontrada.' });

      if (order.status === 'received') {
        return res.status(400).json({ success: false, message: 'No se puede modificar una orden que ya fue recibida.' });
      }

      await db.prepare('UPDATE purchase_orders SET status = ? WHERE id = ? AND company_id = ?').run(status, id, companyId);

      return res.json({ success: true, message: `Orden ${order.order_number} actualizada a ${status}.` });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error actualizando estado de la orden.', error: err.message });
    }
  },

  receivePurchaseOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        supplier_invoice_number, payment_terms = 'cash', credit_days = 30, notes, items
      } = req.body;

      const order = await db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!order) return res.status(404).json({ success: false, message: 'Orden de compra no encontrada.' });

      if (order.status === 'received') {
        return res.status(400).json({ success: false, message: 'Esta orden de compra ya fue recibida totalmente anteriormente.' });
      }
      if (order.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'No se puede recibir una orden cancelada.' });
      }

      // Validate supplier invoice NCF if formatted as DGII sequence
      if (supplier_invoice_number && /^[BE]/i.test(String(supplier_invoice_number).trim())) {
        const ncfCheck = FiscalService.validateSupplierNCF(supplier_invoice_number);
        if (!ncfCheck.valid) {
          return res.status(400).json({ success: false, message: ncfCheck.message });
        }
      }

      // Load existing order items to validate reception limits
      const currentOrderItems = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(id);

      // If items not provided in body, default to receiving full remaining quantities
      let itemsToReceive = items;
      if (!itemsToReceive || !Array.isArray(itemsToReceive) || itemsToReceive.length === 0) {
        itemsToReceive = currentOrderItems.map(oi => ({
          product_id: oi.product_id,
          variant_id: oi.variant_id,
          quantity: Math.max(0, Number(oi.quantity) - Number(oi.received_quantity || 0)),
          unit_cost: oi.unit_cost,
          tax_rate: oi.tax_rate
        })).filter(oi => oi.quantity > 0);
      }

      if (itemsToReceive.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay cantidades pendientes por recibir en esta orden.' });
      }

      const purchaseNumber = generateCommercialId('COM');

      const purchaseId = await runTransaction(async (txDb) => {
        let subtotal = 0;
        let taxAmount = 0;
        let total = 0;
        const preparedItems = [];

        for (const item of itemsToReceive) {
          const pId = parseInt(item.product_id, 10);
          const qty = Number(item.quantity);
          if (qty <= 0) continue; // Skip 0 quantity items

          const cost = Number(item.unit_cost !== undefined ? item.unit_cost : 0);
          const taxRate = Number(item.tax_rate !== undefined ? item.tax_rate : 18);

          const prod = await txDb.prepare('SELECT id, name, cost FROM products WHERE id = ? AND company_id = ?').get(pId, companyId);
          if (!prod) throw new Error(`Producto ID ${pId} no encontrado.`);

          // Check that receiving qty does not exceed order remaining qty
          const existingOrderItem = currentOrderItems.find(oi => Number(oi.product_id) === pId);
          if (existingOrderItem) {
            const alreadyReceived = Number(existingOrderItem.received_quantity || 0);
            const totalOrdered = Number(existingOrderItem.quantity);
            if (alreadyReceived + qty > totalOrdered + 0.001) {
              throw new Error(`La cantidad a recibir (${qty}) de "${prod.name}" supera el saldo pendiente (${Math.max(0, totalOrdered - alreadyReceived)}).`);
            }
          }

          const itemSub = Math.round(qty * cost * 100) / 100;
          const itemTax = Math.round(itemSub * (taxRate / 100) * 100) / 100;
          const itemTot = Math.round((itemSub + itemTax) * 100) / 100;

          subtotal = Math.round((subtotal + itemSub) * 100) / 100;
          taxAmount = Math.round((taxAmount + itemTax) * 100) / 100;
          total = Math.round((total + itemTot) * 100) / 100;

          preparedItems.push({
            product_id: pId,
            variant_id: item.variant_id ? parseInt(item.variant_id, 10) : null,
            quantity: qty,
            unit_cost: cost,
            subtotal: itemSub,
            tax_rate: taxRate,
            tax_amount: itemTax,
            total: itemTot
          });
        }

        if (preparedItems.length === 0) {
          throw new Error('Debe recibir al menos una cantidad mayor a cero en algún producto.');
        }

        const paymentStatus = payment_terms === 'credit' ? 'pending' : 'paid';

        const resPurch = await txDb.prepare(`
          INSERT INTO purchases (
            company_id, branch_id, warehouse_id, supplier_id, user_id,
            purchase_order_id, purchase_number, supplier_invoice_number, payment_terms, payment_status,
            subtotal, tax_amount, total, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')
        `).run(
          companyId, order.branch_id, order.warehouse_id, order.supplier_id, req.user.id,
          order.id, purchaseNumber, supplier_invoice_number || `REC-${order.order_number}`, payment_terms, paymentStatus,
          subtotal, taxAmount, total, notes || `Recepción de Orden ${order.order_number}`
        );

        const pId = resPurch.row ? resPurch.row.id : (await txDb.prepare('SELECT id FROM purchases WHERE purchase_number = ?').get(purchaseNumber)).id;

        for (const it of preparedItems) {
          await txDb.prepare(`
            INSERT INTO purchase_items (
              purchase_id, product_id, variant_id, quantity, unit_cost,
              subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            pId, it.product_id, it.variant_id, it.quantity, it.unit_cost,
            it.subtotal, it.tax_rate, it.tax_amount, it.total
          );

          // Update stock and Kardex passing transactional client
          await InventoryService.recordMovement({
            companyId,
            branchId: order.branch_id,
            warehouseId: order.warehouse_id,
            productId: it.product_id,
            variantId: it.variant_id,
            userId: req.user.id,
            movementType: 'purchase',
            quantity: it.quantity,
            unitCost: it.unit_cost,
            referenceType: 'purchases',
            referenceId: pId,
            reason: `Ingreso por Orden de Compra ${order.order_number} (Factura Prov: ${supplier_invoice_number || 'N/A'})`,
            txClient: txDb
          });

          // Update product cost to latest purchase cost
          await txDb.prepare('UPDATE products SET cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?').run(it.unit_cost, it.product_id, companyId);
          if (it.variant_id) {
            await txDb.prepare('UPDATE product_variants SET cost = ? WHERE id = ?').run(it.unit_cost, it.variant_id);
          }

          // Atomically increment received_quantity in purchase_order_items
          await txDb.prepare(`
            UPDATE purchase_order_items
            SET received_quantity = received_quantity + ?
            WHERE purchase_order_id = ? AND product_id = ?
          `).run(it.quantity, order.id, it.product_id);
        }

        // Determine if purchase order is now fully received or partially received
        const pendingCheck = await txDb.prepare(`
          SELECT SUM(GREATEST(0, quantity - received_quantity)) as total_remaining
          FROM purchase_order_items
          WHERE purchase_order_id = ?
        `).get(order.id);

        const totalRemaining = pendingCheck ? Number(pendingCheck.total_remaining || 0) : 0;
        const newOrderStatus = totalRemaining <= 0.001 ? 'received' : 'partially_received';

        await txDb.prepare('UPDATE purchase_orders SET status = ? WHERE id = ?').run(newOrderStatus, order.id);

        // If credit, create CxP with purchase_order_id linkage
        if (payment_terms === 'credit') {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + Number(credit_days || 30));
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const issueDateStr = new Date().toISOString().split('T')[0];

          await txDb.prepare(`
            INSERT INTO accounts_payable (
              company_id, branch_id, supplier_id, purchase_id, purchase_order_id, document_number,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(
            companyId, order.branch_id, order.supplier_id, pId, order.id,
            supplier_invoice_number || purchaseNumber, issueDateStr, dueDateStr, total, total
          );

          await txDb.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ? AND company_id = ?').run(total, order.supplier_id, companyId);
        }

        return { purchaseId: pId, newOrderStatus, totalRemaining };
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'purchases',
        action: 'receive_purchase_order',
        recordId: purchaseId,
        newValues: { order_id: order.id, purchase_number: purchaseNumber },
        description: `Orden ${order.order_number} convertida a Compra ${purchaseNumber}`
      });

      return res.status(201).json({
        success: true,
        message: `Mercancía ingresada a inventario exitosamente (Compra ${purchaseNumber}).`,
        purchase_id: purchaseId,
        purchase_number: purchaseNumber
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
};

module.exports = purchasesController;
