const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const FiscalService = require('../fiscal/fiscalService');
const { logAudit } = require('../../middlewares/audit');
const { generateCommercialId } = require('../../utils/idGenerator');

const ordersController = {
  // 1. LIST ORDERS WITH SUMMARY COUNTS
  getOrders: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { status, customer_id, branch_id, salesperson_id, search, page = 1, limit = 50 } = req.query;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;

      let whereClauses = ['so.company_id = ?'];
      let params = [companyId];

      // If user is a salesperson and not an admin/manager, they only see their own orders
      if (req.user.role_slug === 'vendedor') {
        whereClauses.push('(so.user_id = ? OR so.salesperson_id IN (SELECT id FROM salespeople WHERE email = ? OR code = ?))');
        params.push(req.user.id, req.user.email, req.user.username);
      } else if (salesperson_id) {
        whereClauses.push('so.salesperson_id = ?');
        params.push(salesperson_id);
      }

      if (branch_id) {
        whereClauses.push('so.branch_id = ?');
        params.push(branch_id);
      }
      if (customer_id) {
        whereClauses.push('so.customer_id = ?');
        params.push(customer_id);
      }
      if (status && status !== 'all') {
        whereClauses.push('so.status = ?');
        params.push(status);
      }
      if (search) {
        whereClauses.push('(so.order_number LIKE ? OR c.company_name LIKE ? OR c.first_name LIKE ? OR c.tax_id LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereSQL = whereClauses.join(' AND ');

      // Summary KPIs
      const summaryRow = await db.prepare(`
        SELECT
          COUNT(*) as total_count,
          COUNT(CASE WHEN so.status = 'pending_approval' THEN 1 END) as pending_count,
          COUNT(CASE WHEN so.status = 'approved' THEN 1 END) as approved_count,
          COUNT(CASE WHEN so.status = 'dispatched' THEN 1 END) as dispatched_count,
          COUNT(CASE WHEN so.status = 'invoiced' THEN 1 END) as invoiced_count,
          COUNT(CASE WHEN so.status = 'rejected' THEN 1 END) as rejected_count,
          COALESCE(SUM(CASE WHEN so.status NOT IN ('rejected', 'cancelled') THEN so.total ELSE 0 END), 0) as active_total_amount
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        WHERE ${whereSQL}
      `).get(...params);

      const orders = await db.prepare(`
        SELECT
          so.*,
          COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
          c.tax_id as customer_tax_id, c.phone as customer_phone,
          c.credit_limit, c.current_balance, c.credit_days,
          b.name as branch_name,
          w.name as warehouse_name,
          u.first_name || ' ' || u.last_name as seller_name,
          u.username as seller_username,
          uApp.first_name || ' ' || uApp.last_name as approved_by_name,
          uDisp.first_name || ' ' || uDisp.last_name as dispatched_by_name,
          s.sale_number, s.ncf as invoice_ncf
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        JOIN branches b ON so.branch_id = b.id
        JOIN warehouses w ON so.warehouse_id = w.id
        JOIN users u ON so.user_id = u.id
        LEFT JOIN users uApp ON so.approved_by_user_id = uApp.id
        LEFT JOIN users uDisp ON so.dispatched_by_user_id = uDisp.id
        LEFT JOIN sales s ON so.sale_id = s.id
        WHERE ${whereSQL}
        ORDER BY so.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, parsedLimit, offset);

      const count = summaryRow ? parseInt(summaryRow.total_count, 10) || 0 : 0;

      return res.json({
        success: true,
        data: orders,
        summary: {
          totalCount: count,
          pendingCount: summaryRow ? parseInt(summaryRow.pending_count, 10) || 0 : 0,
          approvedCount: summaryRow ? parseInt(summaryRow.approved_count, 10) || 0 : 0,
          dispatchedCount: summaryRow ? parseInt(summaryRow.dispatched_count, 10) || 0 : 0,
          invoicedCount: summaryRow ? parseInt(summaryRow.invoiced_count, 10) || 0 : 0,
          rejectedCount: summaryRow ? parseInt(summaryRow.rejected_count, 10) || 0 : 0,
          totalAmount: summaryRow ? parseFloat(summaryRow.active_total_amount) || 0 : 0
        },
        pagination: {
          total: count,
          page: parsedPage,
          limit: parsedLimit,
          pages: Math.ceil(count / parsedLimit) || 1
        }
      });
    } catch (err) {
      console.error('getOrders error:', err);
      return res.status(500).json({ success: false, message: 'Error consultando pedidos.', error: err.message });
    }
  },

  // 2. GET ORDER BY ID WITH ITEMS
  getOrderById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const order = await db.prepare(`
        SELECT
          so.*,
          COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
          c.tax_id as customer_tax_id, c.id_card as customer_id_card, c.phone as customer_phone, c.address as customer_address,
          c.credit_limit, c.current_balance, c.credit_days,
          b.name as branch_name,
          w.name as warehouse_name,
          u.first_name || ' ' || u.last_name as seller_name,
          u.username as seller_username,
          uApp.first_name || ' ' || uApp.last_name as approved_by_name,
          uDisp.first_name || ' ' || uDisp.last_name as dispatched_by_name,
          s.sale_number, s.ncf as invoice_ncf
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        JOIN branches b ON so.branch_id = b.id
        JOIN warehouses w ON so.warehouse_id = w.id
        JOIN users u ON so.user_id = u.id
        LEFT JOIN users uApp ON so.approved_by_user_id = uApp.id
        LEFT JOIN users uDisp ON so.dispatched_by_user_id = uDisp.id
        LEFT JOIN sales s ON so.sale_id = s.id
        WHERE so.id = ? AND so.company_id = ?
      `).get(id, companyId);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
      }

      order.items = await db.prepare(`
        SELECT
          soi.*,
          p.sku, p.type as product_type,
          pv.variant_name
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        LEFT JOIN product_variants pv ON soi.variant_id = pv.id
        WHERE soi.sales_order_id = ?
      `).all(id);

      return res.json({ success: true, data: order });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo detalle de pedido.', error: err.message });
    }
  },

  // 3. CREATE SALES ORDER (VENDEDOR EN POS — SIN COBRO NI CAJA)
  createOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.id;
      const {
        customer_id,
        warehouse_id,
        fiscal_type_code = 'B02',
        discount_percent = 0,
        payment_type = 'cash',
        credit_days = 0,
        notes = '',
        items = []
      } = req.body;

      if (!customer_id || !warehouse_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cliente, almacén y al menos un producto son obligatorios para generar un pedido.'
        });
      }

      // Verify warehouse belongs to company
      const targetWarehouse = await db.prepare('SELECT id, branch_id FROM warehouses WHERE id = ? AND company_id = ?').get(warehouse_id, companyId);
      if (!targetWarehouse) {
        return res.status(403).json({ success: false, message: 'El almacén especificado no pertenece a su empresa.' });
      }
      const branchId = targetWarehouse.branch_id || (req.headers['x-branch-id'] ? parseInt(req.headers['x-branch-id'], 10) : null) || req.user.branch_id || 1;

      // Verify customer and credit terms
      const cust = await db.prepare('SELECT id, company_name, first_name, last_name, status, salesperson_id, credit_limit, current_balance, credit_days FROM customers WHERE id = ? AND company_id = ?').get(customer_id, companyId);
      if (!cust) {
        return res.status(404).json({ success: false, message: 'Cliente no encontrado o no pertenece a su empresa.' });
      }
      if (cust.status === 'inactive') {
        return res.status(400).json({ success: false, message: 'No se pueden generar pedidos para clientes inactivos.' });
      }

      const isCredit = payment_type === 'credit';
      const finalCreditDays = isCredit
        ? (Number(credit_days) > 0 ? Number(credit_days) : (Number(cust.credit_days) || 30))
        : 0;
      const dueDate = isCredit
        ? new Date(Date.now() + finalCreditDays * 86400000).toISOString().split('T')[0]
        : null;

      const salespersonId = cust.salesperson_id || null;
      const orderNumber = generateCommercialId('PED');

      const orderResult = await runTransaction(async (txDb) => {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        let total = 0;

        const preparedItems = [];
        for (const item of items) {
          const itemQty = Number(item.quantity);
          if (isNaN(itemQty) || itemQty <= 0) {
            throw new Error(`Cantidad inválida para producto ID ${item.product_id}: ${item.quantity}`);
          }

          const prod = await txDb.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(item.product_id, companyId);
          if (!prod) throw new Error(`Producto ID ${item.product_id} no pertenece a su empresa.`);

          let unitPrice = Number(item.unit_price !== undefined ? item.unit_price : prod.price);
          const itemBase = Math.round(itemQty * unitPrice * 100) / 100;
          const itemDiscPercent = Math.max(0, Number(discount_percent || item.discount_percent || 0));
          const itemDiscAmount = Math.round(itemBase * (itemDiscPercent / 100) * 100) / 100;
          const itemNet = Math.round((itemBase - itemDiscAmount) * 100) / 100;

          const itemTaxRate = Number(prod.tax_rate !== undefined ? prod.tax_rate : 18);
          const itemTaxAmount = Math.round(itemNet * (itemTaxRate / 100) * 100) / 100;
          const itemTotal = Math.round((itemNet + itemTaxAmount) * 100) / 100;

          subtotal = Math.round((subtotal + itemBase) * 100) / 100;
          totalDiscount = Math.round((totalDiscount + itemDiscAmount) * 100) / 100;
          totalTax = Math.round((totalTax + itemTaxAmount) * 100) / 100;
          total = Math.round((total + itemTotal) * 100) / 100;

          preparedItems.push({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            product_name: prod.name,
            quantity: itemQty,
            unit_cost: prod.cost || 0,
            unit_price: unitPrice,
            discount_percent: itemDiscPercent,
            discount_amount: itemDiscAmount,
            subtotal: itemNet,
            tax_rate: itemTaxRate,
            tax_amount: itemTaxAmount,
            total: itemTotal
          });
        }

        let combinedNotes = notes;
        if (isCredit) {
          const availCredit = Math.max(0, Number(cust.credit_limit || 0) - Number(cust.current_balance || 0));
          if (Number(cust.credit_limit || 0) > 0 && total > availCredit) {
            combinedNotes = `[ALERTA CRÉDITO: Excede límite disponible por RD$ ${(total - availCredit).toFixed(2)}] ${combinedNotes}`.trim();
          }
        }

        // Insert Order
        const resOrder = await txDb.prepare(`
          INSERT INTO sales_orders (
            company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
            order_number, fiscal_type_code, payment_type, credit_days, due_date,
            subtotal, discount_amount, tax_amount, total,
            status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
        `).run(
          companyId, branchId, warehouse_id, customer_id, salespersonId, userId,
          orderNumber, fiscal_type_code, payment_type, finalCreditDays, dueDate,
          subtotal, totalDiscount, totalTax, total, combinedNotes
        );
        const orderId = resOrder.lastInsertRowid;

        // Insert Items
        for (const it of preparedItems) {
          await txDb.prepare(`
            INSERT INTO sales_order_items (
              sales_order_id, product_id, variant_id, product_name, quantity, unit_cost, unit_price,
              discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            orderId, it.product_id, it.variant_id, it.product_name, it.quantity,
            it.unit_cost, it.unit_price, it.discount_percent, it.discount_amount,
            it.subtotal, it.tax_rate, it.tax_amount, it.total
          );
        }

        return { orderId, orderNumber, total, itemsCount: preparedItems.length };
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'sales_orders',
        action: 'create_order',
        recordId: orderResult.orderId,
        newValues: { order_number: orderResult.orderNumber, total: orderResult.total },
        description: `Pedido de venta ${orderResult.orderNumber} creado por vendedor y enviado a autorización gerencial.`
      });

      return res.status(201).json({
        success: true,
        message: `Pedido ${orderResult.orderNumber} generado exitosamente. Enviado a Gerencia para autorización.`,
        data: orderResult
      });
    } catch (err) {
      console.error('createOrder error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // 4. APPROVE ORDER (GERENTE)
  approveOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const order = await db.prepare(`
        SELECT id, order_number, status, total, customer_id
        FROM sales_orders
        WHERE id = ? AND company_id = ?
      `).get(id, companyId);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
      }

      if (order.status !== 'pending_approval') {
        return res.status(400).json({
          success: false,
          message: `El pedido no se encuentra en estado pendiente de aprobación (Estado actual: ${order.status}).`
        });
      }

      await db.prepare(`
        UPDATE sales_orders
        SET status = 'approved',
            approved_by_user_id = ?,
            approved_at = CURRENT_TIMESTAMP,
            rejection_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(req.user.id, id, companyId);

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'sales_orders',
        action: 'approve_order',
        recordId: order.id,
        description: `Pedido ${order.order_number} AUTORIZADO por Gerencia. Listo para despacho.`
      });

      return res.json({
        success: true,
        message: `Pedido ${order.order_number} autorizado exitosamente por Gerencia. Pasa a Almacén para despacho.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // 5. REJECT ORDER (GERENTE)
  rejectOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { rejection_reason } = req.body;

      if (!rejection_reason || !rejection_reason.trim()) {
        return res.status(400).json({ success: false, message: 'El motivo de rechazo es obligatorio.' });
      }

      const order = await db.prepare(`
        SELECT id, order_number, status
        FROM sales_orders
        WHERE id = ? AND company_id = ?
      `).get(id, companyId);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
      }

      if (order.status !== 'pending_approval') {
        return res.status(400).json({
          success: false,
          message: `No se puede rechazar un pedido que no esté pendiente (Estado: ${order.status}).`
        });
      }

      await db.prepare(`
        UPDATE sales_orders
        SET status = 'rejected',
            rejection_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(rejection_reason.trim(), id, companyId);

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'sales_orders',
        action: 'reject_order',
        recordId: order.id,
        description: `Pedido ${order.order_number} RECHAZADO por Gerencia. Motivo: ${rejection_reason}`
      });

      return res.json({
        success: true,
        message: `Pedido ${order.order_number} rechazado correctamente.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // 6. DISPATCH ORDER (ALMACÉN — DESPACHO FÍSICO Y SALIDA DE KARDEX)
  dispatchOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const order = await db.prepare(`
        SELECT * FROM sales_orders WHERE id = ? AND company_id = ?
      `).get(id, companyId);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
      }

      if (order.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: `Solo se pueden despachar pedidos previamente autorizados por Gerencia (Estado actual: ${order.status}).`
        });
      }

      const items = await db.prepare(`
        SELECT soi.*, p.type as product_type
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `).all(id);

      await runTransaction(async (txDb) => {
        // Deduct inventory with atomic Kardex movement
        for (const item of items) {
          if (item.product_type === 'physical') {
            await InventoryService.recordMovement({
              companyId,
              branchId: order.branch_id,
              warehouseId: order.warehouse_id,
              productId: item.product_id,
              variantId: item.variant_id,
              userId: req.user.id,
              movementType: 'sale',
              quantity: -Math.abs(Number(item.quantity)),
              unitCost: item.unit_cost,
              referenceType: 'sales_orders',
              referenceId: order.id,
              reason: `Despacho de Pedido ${order.order_number}`,
              txClient: txDb
            });
          }
        }

        // Update status to dispatched
        await txDb.prepare(`
          UPDATE sales_orders
          SET status = 'dispatched',
              dispatched_by_user_id = ?,
              dispatched_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(req.user.id, id);
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'sales_orders',
        action: 'dispatch_order',
        recordId: order.id,
        description: `Pedido ${order.order_number} DESPACHADO físicamente por almacén. Inventario rebajado en Kardex.`
      });

      return res.json({
        success: true,
        message: `Pedido ${order.order_number} despachado exitosamente. Mercancía entregada y Kardex actualizado.`
      });
    } catch (err) {
      console.error('dispatchOrder error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // 7. INVOICE ORDER (FACTURACIÓN FISCAL DEFINITIVA DESDE CAJA O PEDIDOS)
  invoiceOrder: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        payments = [],
        fiscal_type_code,
        payment_type: reqPaymentType,
        credit_days: reqCreditDays
      } = req.body;

      const order = await db.prepare('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!order) return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });

      if (!['approved', 'dispatched'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: `El pedido debe estar autorizado o despachado para ser facturado (Estado actual: ${order.status}).`
        });
      }

      const activeTypeCode = fiscal_type_code || order.fiscal_type_code || 'B02';
      const items = await db.prepare(`
        SELECT soi.*, p.type as product_type
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `).all(id);

      const invoiceResult = await runTransaction(async (txDb) => {
        // 1. If not yet dispatched, dispatch inventory now from Kardex
        if (order.status === 'approved') {
          for (const item of items) {
            if (item.product_type === 'physical') {
              await InventoryService.recordMovement({
                companyId,
                branchId: order.branch_id,
                warehouseId: order.warehouse_id,
                productId: item.product_id,
                variantId: item.variant_id,
                userId: req.user.id,
                movementType: 'sale',
                quantity: -Math.abs(Number(item.quantity)),
                unitCost: item.unit_cost,
                referenceType: 'sales_orders',
                referenceId: order.id,
                reason: `Despacho y facturación de Pedido ${order.order_number}`,
                txClient: txDb
              });
            }
          }
          await txDb.prepare(`
            UPDATE sales_orders
            SET status = 'dispatched', dispatched_by_user_id = ?, dispatched_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(req.user.id, id);
        }

        // 2. Generate NCF atomically
        const fiscalInfo = await FiscalService.getNextNCF(companyId, order.branch_id, activeTypeCode, txDb);
        const saleNumber = generateCommercialId('VTA');
        const invoiceNumber = generateCommercialId('FAC');

        // 3. Determine Payment Condition (Crédito vs Contado)
        const isCredit = reqPaymentType === 'credit' ||
          (!payments.length && order.payment_type === 'credit') ||
          (payments.some(p => p.payment_method === 'credit'));

        let directPaid = 0;
        let finalPayments = [];

        if (isCredit) {
          const nonCreditPaid = payments
            .filter(p => p.payment_method !== 'credit')
            .reduce((acc, p) => acc + Number(p.amount || 0), 0);
          directPaid = Math.round(nonCreditPaid * 100) / 100;
          const balance = Math.max(0, Math.round((Number(order.total) - directPaid) * 100) / 100);

          if (payments.length > 0) {
            finalPayments = payments;
          } else {
            finalPayments = [{ payment_method: 'credit', amount: order.total, tendered: order.total }];
          }

          const creditDays = Number(reqCreditDays) > 0
            ? Number(reqCreditDays)
            : (Number(order.credit_days) > 0 ? Number(order.credit_days) : 30);
          const dueDateStr = order.due_date || new Date(Date.now() + creditDays * 86400000).toISOString().split('T')[0];
          const saleType = directPaid > 0 ? 'mixed' : 'credit';
          const initialStatus = directPaid > 0 ? 'partial' : 'pending';

          const resSale = await txDb.prepare(`
            INSERT INTO sales (
              company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
              sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
              subtotal, discount_amount, tax_amount, total, amount_paid, balance, change_given,
              due_date, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
          `).run(
            companyId, order.branch_id, order.warehouse_id, order.customer_id, order.salesperson_id, req.user.id,
            saleNumber, invoiceNumber, fiscalInfo.ncf, activeTypeCode, saleType,
            order.subtotal, order.discount_amount, order.tax_amount, order.total, directPaid, balance,
            dueDateStr, initialStatus, `Facturación de Pedido ${order.order_number} (A Crédito)`
          );
          const saleId = resSale.lastInsertRowid;

          // Items
          for (const it of items) {
            await txDb.prepare(`
              INSERT INTO sale_items (
                sale_id, product_id, variant_id, product_name, quantity, unit_cost, unit_price,
                discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              saleId, it.product_id, it.variant_id, it.product_name, it.quantity,
              it.unit_cost, it.unit_price, it.discount_percent, it.discount_amount,
              it.subtotal, it.tax_rate, it.tax_amount, it.total
            );
          }

          // Payments
          for (const p of finalPayments) {
            await txDb.prepare(`
              INSERT INTO sale_payments (sale_id, payment_method, amount, tendered)
              VALUES (?, ?, ?, ?)
            `).run(saleId, p.payment_method, p.amount, p.tendered || p.amount);
          }

          // Accounts Receivable (CxC)
          if (balance > 0) {
            await txDb.prepare(`
              INSERT INTO accounts_receivable (
                company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
                issue_date, due_date, amount, balance, status
              ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?)
            `).run(companyId, order.branch_id, order.customer_id, saleId, invoiceNumber, fiscalInfo.ncf, dueDateStr, order.total, balance, initialStatus);

            await txDb.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(balance, order.customer_id);
          }

          // Commissions
          if (order.salesperson_id) {
            const sp = await txDb.prepare('SELECT commission_rate, commission_calculation_type FROM salespeople WHERE id = ?').get(order.salesperson_id);
            if (sp && (sp.commission_calculation_type || 'invoiced') === 'invoiced') {
              const rate = Number(sp.commission_rate || 5.00);
              const commAmt = Math.round((Number(order.subtotal) * (rate / 100)) * 100) / 100;
              await txDb.prepare(`
                INSERT INTO commissions (company_id, salesperson_id, sale_id, invoice_number, base_amount, commission_rate, commission_amount, calculation_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', 'pending')
              `).run(companyId, order.salesperson_id, saleId, invoiceNumber, order.subtotal, rate, commAmt);
            }
          }

          // Link order
          await txDb.prepare(`
            UPDATE sales_orders
            SET status = 'invoiced', sale_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(saleId, id);

          return { saleId, saleNumber, invoiceNumber, ncf: fiscalInfo.ncf, saleType, total: order.total, balance };
        } else {
          // Contado
          directPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
          if (directPaid === 0) directPaid = Number(order.total);
          const balance = Math.max(0, Math.round((Number(order.total) - directPaid) * 100) / 100);
          const saleType = balance === 0 ? 'cash' : (directPaid > 0 ? 'mixed' : 'credit');
          const initialStatus = balance === 0 ? 'paid' : (directPaid > 0 ? 'partial' : 'pending');

          const resSale = await txDb.prepare(`
            INSERT INTO sales (
              company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
              sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
              subtotal, discount_amount, tax_amount, total, amount_paid, balance, change_given,
              status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          `).run(
            companyId, order.branch_id, order.warehouse_id, order.customer_id, order.salesperson_id, req.user.id,
            saleNumber, invoiceNumber, fiscalInfo.ncf, activeTypeCode, saleType,
            order.subtotal, order.discount_amount, order.tax_amount, order.total, directPaid, balance,
            initialStatus, `Facturación de Pedido ${order.order_number}`
          );
          const saleId = resSale.lastInsertRowid;

          for (const it of items) {
            await txDb.prepare(`
              INSERT INTO sale_items (
                sale_id, product_id, variant_id, product_name, quantity, unit_cost, unit_price,
                discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              saleId, it.product_id, it.variant_id, it.product_name, it.quantity,
              it.unit_cost, it.unit_price, it.discount_percent, it.discount_amount,
              it.subtotal, it.tax_rate, it.tax_amount, it.total
            );
          }

          if (payments.length > 0) {
            for (const p of payments) {
              await txDb.prepare(`
                INSERT INTO sale_payments (sale_id, payment_method, amount, tendered)
                VALUES (?, ?, ?, ?)
              `).run(saleId, p.payment_method, p.amount, p.tendered || p.amount);
            }
          } else {
            await txDb.prepare(`
              INSERT INTO sale_payments (sale_id, payment_method, amount, tendered)
              VALUES (?, 'cash', ?, ?)
            `).run(saleId, directPaid, directPaid);
          }

          if (balance > 0) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);
            await txDb.prepare(`
              INSERT INTO accounts_receivable (
                company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
                issue_date, due_date, amount, balance, status
              ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?)
            `).run(companyId, order.branch_id, order.customer_id, saleId, invoiceNumber, fiscalInfo.ncf, dueDate.toISOString().split('T')[0], order.total, balance, initialStatus);

            await txDb.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(balance, order.customer_id);
          }

          // Commissions
          if (order.salesperson_id) {
            const sp = await txDb.prepare('SELECT commission_rate, commission_calculation_type FROM salespeople WHERE id = ?').get(order.salesperson_id);
            if (sp && (sp.commission_calculation_type || 'invoiced') === 'invoiced') {
              const rate = Number(sp.commission_rate || 5.00);
              const commAmt = Math.round((Number(order.subtotal) * (rate / 100)) * 100) / 100;
              await txDb.prepare(`
                INSERT INTO commissions (company_id, salesperson_id, sale_id, invoice_number, base_amount, commission_rate, commission_amount, calculation_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', 'pending')
              `).run(companyId, order.salesperson_id, saleId, invoiceNumber, order.subtotal, rate, commAmt);
            }
          }

          await txDb.prepare(`
            UPDATE sales_orders
            SET status = 'invoiced', sale_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(saleId, id);

          return { saleId, saleNumber, invoiceNumber, ncf: fiscalInfo.ncf, saleType, total: order.total, balance };
        }
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'sales_orders',
        action: 'invoice_order',
        recordId: order.id,
        description: `Pedido ${order.order_number} FACTURADO con Factura ${invoiceResult.saleNumber} (NCF: ${invoiceResult.ncf})`
      });

      return res.json({
        success: true,
        message: `Pedido ${order.order_number} facturado exitosamente con NCF ${invoiceResult.ncf}.`,
        data: invoiceResult
      });
    } catch (err) {
      console.error('invoiceOrder error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = ordersController;
