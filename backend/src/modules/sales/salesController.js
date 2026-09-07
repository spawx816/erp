const bcrypt = require('bcryptjs');
const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const FiscalService = require('../fiscal/fiscalService');
const { logAudit } = require('../../middlewares/audit');

const salesController = {
  getSales: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, customer_id, branch_id, status, sale_type, start_date, end_date, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let whereClauses = ['s.company_id = ?'];
      let params = [companyId];

      if (branch_id) {
        whereClauses.push('s.branch_id = ?');
        params.push(branch_id);
      }
      if (customer_id) {
        whereClauses.push('s.customer_id = ?');
        params.push(customer_id);
      }
      if (status) {
        whereClauses.push('s.status = ?');
        params.push(status);
      }
      if (sale_type) {
        whereClauses.push('s.sale_type = ?');
        params.push(sale_type);
      }
      if (start_date) {
        whereClauses.push('date(s.created_at) >= ?');
        params.push(start_date);
      }
      if (end_date) {
        whereClauses.push('date(s.created_at) <= ?');
        params.push(end_date);
      }
      if (search) {
        whereClauses.push('(s.sale_number LIKE ? OR s.ncf LIKE ? OR c.company_name LIKE ? OR c.first_name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereSQL = whereClauses.join(' AND ');

      const count = await db.prepare(`
        SELECT COUNT(*) as total
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        WHERE ${whereSQL}
      `).get(...params).total;

      const sales = await db.prepare(`
        SELECT s.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               c.tax_id as customer_tax_id, c.id_card as customer_id_card,
               b.name as branch_name,
               u.first_name || ' ' || u.last_name as seller_name,
               sp.name as salesperson_name,
               sp.code as salesperson_code
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        JOIN branches b ON s.branch_id = b.id
        JOIN users u ON s.user_id = u.id
        LEFT JOIN salespeople sp ON s.salesperson_id = sp.id
        WHERE ${whereSQL}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      return res.json({
        success: true,
        data: sales,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando ventas.', error: err.message });
    }
  },

  getSaleById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const sale = await db.prepare(`
        SELECT s.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               c.tax_id as customer_tax_id, c.id_card as customer_id_card, c.phone as customer_phone, c.address as customer_address,
               b.name as branch_name, b.phone as branch_phone, b.address as branch_address,
               u.first_name || ' ' || u.last_name as seller_name,
               comp.name as company_name, comp.legal_name as company_legal_name, comp.tax_id as company_tax_id, comp.phone as company_phone, comp.address as company_address
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        JOIN branches b ON s.branch_id = b.id
        JOIN users u ON s.user_id = u.id
        JOIN companies comp ON s.company_id = comp.id
        WHERE s.id = ? AND s.company_id = ?
      `).get(id, companyId);

      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
      }

      sale.items = await db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id);
      sale.payments = await db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(id);

      return res.json({ success: true, data: sale });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo detalle de venta.', error: err.message });
    }
  },

  // POS CHECKOUT
  checkout: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const targetWarehouse = req.body?.warehouse_id ? await db.prepare('SELECT branch_id FROM warehouses WHERE id = ?').get(req.body.warehouse_id) : null;
      const branchId = targetWarehouse?.branch_id || (req.headers['x-branch-id'] ? parseInt(req.headers['x-branch-id'], 10) : null) || req.user.branch_id || 1;
      const userId = req.user.id;

      const {
        customer_id,
        warehouse_id,
        fiscal_type_code = 'B02', // B02 default (Consumo)
        discount_percent = 0,
        supervisor_auth, // { username, password } if discount exceeds user limit
        notes = '',
        items = [],
        payments = []
      } = req.body;

      if (!customer_id || !warehouse_id || items.length === 0 || payments.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cliente, almacén, al menos un ítem y al menos una forma de pago son obligatorios.'
        });
      }

      // Check user discount authorization
      const discPercent = Number(discount_percent || 0);
      let authorizedByUserId = userId;

      if (discPercent > Number(req.user.max_discount_percentage)) {
        if (!supervisor_auth || !supervisor_auth.username || !supervisor_auth.password) {
          return res.status(403).json({
            success: false,
            requires_supervisor_auth: true,
            message: `El descuento solicitado (${discPercent}%) excede su límite permitido (${req.user.max_discount_percentage}%). Ingrese credenciales de supervisor/administrador.`
          });
        }

        // Validate supervisor credentials
        const supervisor = await db.prepare(`
          SELECT u.id, u.password_hash, u.max_discount_percentage, r.slug as role_slug
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE (u.username = ? OR u.email = ?) AND u.company_id = ? AND u.status = 'active'
        `).get(supervisor_auth.username, supervisor_auth.username, companyId);

        if (!supervisor || !bcrypt.compareSync(supervisor_auth.password, supervisor.password_hash)) {
          return res.status(403).json({ success: false, message: 'Credenciales de supervisor no válidas.' });
        }

        if (supervisor.role_slug !== 'super-admin' && Number(supervisor.max_discount_percentage) < discPercent) {
          return res.status(403).json({
            success: false,
            message: `El supervisor indicado tampoco tiene autorización para otorgar ${discPercent}% de descuento.`
          });
        }

        authorizedByUserId = supervisor.id;
      }

      // Check if cash session is required for any cash payment
      const hasCashPayment = payments.some(p => p.payment_method === 'cash');
      let activeSession = null;
      if (hasCashPayment) {
        activeSession = await db.prepare(`
          SELECT id FROM cash_sessions
          WHERE user_id = ? AND branch_id = ? AND status = 'open'
        `).get(userId, branchId);

        if (!activeSession) {
          // Look for any open register session in the target branch or any active session
          const branchSession = await db.prepare(`
            SELECT id FROM cash_sessions
            WHERE (branch_id = ? OR branch_id IS NULL) AND status = 'open'
            ORDER BY id DESC
          `).get(branchId);

          if (branchSession) {
            activeSession = branchSession;
          } else {
            const anySession = await db.prepare(`SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC`).get();
            if (anySession) {
              activeSession = anySession;
            } else {
              return res.status(400).json({
                success: false,
                message: 'No hay una sesión de caja abierta en esta sucursal para registrar pagos en efectivo. Por favor, abre un turno de caja primero o utiliza Tarjeta/Transferencia/Crédito.'
              });
            }
          }
        }
      }

      // TRANSACTION EXECUTION
      const saleResult = await runTransaction(async () => {
        // 1. Calculate Totals and Validate Inventory
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        let total = 0;

        const preparedItems = [];
        for (const item of items) {
          // Check stock if physical
          const prod = await db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
          if (!prod) throw new Error(`Producto ID ${item.product_id} no encontrado.`);

          if (prod.type === 'physical') {
            const currentStock = InventoryService.getCurrentStock(warehouse_id, item.product_id, item.variant_id || null);
            if (currentStock < Number(item.quantity)) {
              const comp = await db.prepare('SELECT allow_negative_inventory FROM companies WHERE id = ?').get(companyId);
              if (!comp || comp.allow_negative_inventory === 0) {
                throw new Error(`Inventario insuficiente para [${prod.name}]. Disponible: ${currentStock}, Solicitado: ${item.quantity}`);
              }
            }
          }

          const unitPrice = Number(item.unit_price || prod.price);
          const itemQty = Number(item.quantity);
          const itemBase = itemQty * unitPrice;
          const itemDiscPercent = discPercent > 0 ? discPercent : Number(item.discount_percent || 0);
          const itemDiscAmount = itemBase * (itemDiscPercent / 100);
          const itemNet = itemBase - itemDiscAmount;
          const itemTaxRate = Number(item.tax_rate !== undefined ? item.tax_rate : prod.tax_rate);
          const itemTaxAmount = itemNet * (itemTaxRate / 100);
          const itemTotal = itemNet + itemTaxAmount;

          subtotal += itemBase;
          totalDiscount += itemDiscAmount;
          totalTax += itemTaxAmount;
          total += itemTotal;

          preparedItems.push({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            product_name: prod.name,
            product_type: prod.type,
            quantity: itemQty,
            unit_cost: prod.cost,
            unit_price: unitPrice,
            discount_percent: itemDiscPercent,
            discount_amount: itemDiscAmount,
            subtotal: itemNet,
            tax_rate: itemTaxRate,
            tax_amount: itemTaxAmount,
            total: itemTotal
          });
        }

        // 2. Validate Payment amounts
        let totalPaid = 0;
        let totalTendered = 0;
        let hasCreditPayment = false;
        let creditAmount = 0;

        payments.forEach(p => {
          const amt = Number(p.amount);
          totalPaid += amt;
          totalTendered += Number(p.tendered || amt);
          if (p.payment_method === 'credit') {
            hasCreditPayment = true;
            creditAmount += amt;
          }
        });

        // Determine sale type
        let saleType = 'cash';
        if (hasCreditPayment && creditAmount >= total - 0.05) {
          saleType = 'credit';
        } else if (payments.length > 1 || (hasCreditPayment && creditAmount < total)) {
          saleType = 'mixed';
        }

        const changeGiven = Math.max(0, totalTendered - totalPaid);

        // 3. Customer and credit checks
        const cust = await db.prepare('SELECT salesperson_id, credit_days, credit_limit, current_balance, is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices FROM customers WHERE id = ?').get(customer_id);
        const salespersonId = cust ? cust.salesperson_id : null;
        const creditDays = cust && cust.credit_days ? cust.credit_days : 30;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + creditDays);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const issueDateStr = new Date().toISOString().split('T')[0];

        const balanceAmount = Math.max(0, total - totalPaid);
        const initialStatus = balanceAmount === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending');

        // 4. Obtain Dominican NCF atomically
        const fiscalInfo = FiscalService.getNextNCF(companyId, branchId, fiscal_type_code);
        const saleNumber = `VTA-${Date.now().toString().slice(-6)}`;
        const invoiceNumber = `FAC-${Date.now().toString().slice(-6)}`;

        // 5. Insert Sale
        const stmtSale = await db.prepare(`
          INSERT INTO sales (
            company_id, branch_id, warehouse_id, cash_session_id, customer_id, salesperson_id, user_id,
            sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
            subtotal, discount_amount, tax_amount, total, amount_paid, balance, change_given,
            due_date, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const resSale = stmtSale.run(
          companyId, branchId, warehouse_id, activeSession ? activeSession.id : null, customer_id, salespersonId, userId,
          saleNumber, invoiceNumber, fiscalInfo.ncf, fiscal_type_code, saleType,
          subtotal, totalDiscount, totalTax, total, totalPaid, balanceAmount, changeGiven,
          saleType === 'credit' ? dueDateStr : null, initialStatus, notes
        );
        const saleId = resSale.lastInsertRowid;

        // Log sequence usage
        await db.prepare(`
          INSERT INTO fiscal_sequence_logs (fiscal_sequence_id, ncf, reference_type, reference_id, user_id)
          VALUES (?, ?, 'sales', ?, ?)
        `).run(fiscalInfo.sequenceId, fiscalInfo.ncf, saleId, userId);

        // 6. Insert Sale Items and deduct stock (Kardex)
        const stmtItem = await db.prepare(`
          INSERT INTO sale_items (
            sale_id, product_id, variant_id, product_name, quantity, unit_cost, unit_price,
            discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of preparedItems) {
          stmtItem.run(
            saleId, item.product_id, item.variant_id, item.product_name, item.quantity,
            item.unit_cost, item.unit_price, item.discount_percent, item.discount_amount,
            item.subtotal, item.tax_rate, item.tax_amount, item.total
          );

          if (item.product_type === 'physical') {
            InventoryService.recordMovement({
              companyId,
              branchId,
              warehouseId: warehouse_id,
              productId: item.product_id,
              variantId: item.variant_id,
              userId,
              movementType: 'sale',
              quantity: -Math.abs(item.quantity),
              unitCost: item.unit_cost,
              referenceType: 'sales',
              referenceId: saleId,
              reason: `Venta ${saleNumber} (NCF: ${fiscalInfo.ncf})`
            });
          }
        }

        // 7. Insert Payments
        const stmtPayment = await db.prepare(`
          INSERT INTO sale_payments (sale_id, payment_method, amount, tendered, change_given, reference_number, card_last_digits)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const p of payments) {
          await stmtPayment.run(
            saleId, p.payment_method, p.amount, p.tendered || p.amount,
            p.payment_method === 'cash' ? changeGiven : 0,
            p.reference_number || null, p.card_last_digits || null
          );

          if (p.payment_method === 'cash' && activeSession) {
            await db.prepare(`
              INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
              VALUES (?, ?, 'sale_cash', ?, ?, 'sales', ?)
            `).run(activeSession.id, userId, p.amount, `Venta en mostrador ${saleNumber}`, saleId);
          }
        }

        // 8. If credit, generate Accounts Receivable (CxC) & update customer current_balance
        if (hasCreditPayment) {
          await db.prepare(`
            INSERT INTO accounts_receivable (
              company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            companyId, branchId, customer_id, saleId, invoiceNumber, fiscalInfo.ncf,
            issueDateStr, dueDateStr, total, balanceAmount, initialStatus
          );

          await db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(balanceAmount, customer_id);
        }

        // 9. Commission calculation for assigned salesperson
        if (salespersonId) {
          const sp = await db.prepare('SELECT commission_rate FROM salespeople WHERE id = ?').get(salespersonId);
          const rate = sp ? Number(sp.commission_rate) : 5.00;
          const commAmt = Math.round((subtotal * (rate / 100)) * 100) / 100;
          await db.prepare(`
            INSERT INTO commissions (company_id, salesperson_id, sale_id, invoice_number, base_amount, commission_rate, commission_amount, calculation_type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', 'pending')
          `).run(companyId, salespersonId, saleId, invoiceNumber, subtotal, rate, commAmt);
        }

        // 8. If authorized discount was used, log it
        if (discPercent > Number(req.user.max_discount_percentage)) {
          await db.prepare(`
            INSERT INTO discount_authorizations (
              company_id, sale_id, requested_by_user_id, authorized_by_user_id,
              requested_percent, discount_amount, reason, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
          `).run(companyId, saleId, userId, authorizedByUserId, discPercent, totalDiscount, notes || 'Descuento especial autorizado en POS');
        }

        // 9. Audit Log
        logAudit({
          companyId,
          userId,
          ipAddress: req.ip,
          module: 'sales',
          action: 'create_sale',
          recordId: saleId,
          newValues: { sale_number: saleNumber, ncf: fiscalInfo.ncf, total, sale_type: saleType },
          description: `Venta facturada ${saleNumber} | NCF: ${fiscalInfo.ncf} | Total: RD$ ${total.toFixed(2)}`
        });

        return {
          sale_id: saleId,
          sale_number: saleNumber,
          invoice_number: invoiceNumber,
          ncf: fiscalInfo.ncf,
          subtotal,
          total_discount: totalDiscount,
          tax_amount: totalTax,
          total,
          amount_paid: totalPaid,
          change_given: changeGiven
        };
      });

      return res.status(201).json({
        success: true,
        message: 'Venta facturada exitosamente.',
        data: saleResult
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // CANCEL / REFUND SALE (Generates NCF B04 & Kardex reversal)
  cancelSale: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        reason = 'Anulación solicitada por cliente',
        action_taken = 'refund_cash'  // refund_cash | credit_cxc | store_credit
      } = req.body;

      const VALID_ACTIONS = ['refund_cash', 'credit_cxc', 'store_credit'];
      if (!VALID_ACTIONS.includes(action_taken)) {
        return res.status(400).json({ success: false, message: `Acción inválida. Usar: ${VALID_ACTIONS.join(', ')}.` });
      }

      const sale = await db.prepare(`SELECT * FROM sales WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!sale) return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

      if (sale.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'Esta venta ya se encuentra anulada.' });
      }

      let creditNoteResult = {};

      await runTransaction(async () => {
        // 1. Get NCF B04 for credit note
        const b04 = FiscalService.getNextNCF(companyId, sale.branch_id, 'B04');
        const creditNoteNumber = `NC-${Date.now().toString().slice(-6)}`;

        // 2. Insert credit note record
        const stmtNC = await db.prepare(`
          INSERT INTO credit_notes (
            company_id, branch_id, warehouse_id, customer_id, user_id, sale_id,
            ncf, credit_note_number, return_type, reason, subtotal, tax_amount, total, action_taken
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'total', ?, ?, ?, ?, ?)
        `);

        const resNC = stmtNC.run(
          companyId, sale.branch_id, sale.warehouse_id, sale.customer_id, req.user.id, sale.id,
          b04.ncf, creditNoteNumber, reason, sale.subtotal, sale.tax_amount, sale.total, action_taken
        );
        const ncId = resNC.lastInsertRowid;

        // 3. Insert sale items into credit_note_items (FIX: was missing)
        const items = await db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
        const stmtNCI = await db.prepare(`
          INSERT INTO credit_note_items (
            credit_note_id, product_id, variant_id, quantity, unit_price,
            subtotal, tax_rate, tax_amount, total, returned_to_inventory
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        for (const item of items) {
          stmtNCI.run(
            ncId,
            item.product_id,
            item.variant_id || null,
            Math.abs(item.quantity),
            item.unit_price,
            item.subtotal,
            item.tax_rate || 0,
            item.tax_amount || 0,
            item.total
          );

          // Return to stock (Kardex)
          const prod = await db.prepare('SELECT type FROM products WHERE id = ?').get(item.product_id);
          if (prod && prod.type === 'physical') {
            InventoryService.recordMovement({
              companyId,
              branchId: sale.branch_id,
              warehouseId: sale.warehouse_id,
              productId: item.product_id,
              variantId: item.variant_id,
              userId: req.user.id,
              movementType: 'sale_return',
              quantity: Math.abs(item.quantity),
              unitCost: item.unit_cost,
              referenceType: 'credit_notes',
              referenceId: ncId,
              reason: `Reversión por anulación de venta ${sale.sale_number} (NC: ${b04.ncf})`
            });
          }
        }

        // 4. Cancel accounts receivable (CxC)
        await db.prepare(`
          UPDATE accounts_receivable
          SET status = 'paid', balance = 0
          WHERE sale_id = ?
        `).run(sale.id);

        // 5. If store_credit, update customer credit_notes_balance (FIX: was never updated)
        if (action_taken === 'store_credit') {
          await db.prepare(`
            UPDATE customers
            SET credit_notes_balance = COALESCE(credit_notes_balance, 0) + ?
            WHERE id = ?
          `).run(sale.total, sale.customer_id);
        }

        // 6. Mark sale as cancelled
        await db.prepare(`UPDATE sales SET status = 'cancelled' WHERE id = ?`).run(sale.id);

        // 7. Audit
        logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'sales',
          action: 'cancel_sale',
          recordId: sale.id,
          newValues: { status: 'cancelled', ncf_b04: b04.ncf, reason, action_taken },
          description: `Venta anulada ${sale.sale_number}. NC B04: ${b04.ncf} — Acción: ${action_taken}`
        });

        creditNoteResult = { ncf: b04.ncf, credit_note_number: creditNoteNumber, id: ncId };
      });

      return res.json({
        success: true,
        message: 'Venta anulada y Nota de Crédito B04 generada correctamente.',
        credit_note: creditNoteResult
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CREATE PARTIAL CREDIT NOTE (partial return without full cancellation)
  createCreditNote: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        sale_id,
        items = [],          // [{ product_id, variant_id, quantity, unit_price, tax_rate }]
        reason,
        action_taken = 'refund_cash'
      } = req.body;

      if (!sale_id || !reason || items.length === 0) {
        return res.status(400).json({ success: false, message: 'sale_id, reason e items son requeridos.' });
      }

      const VALID_ACTIONS = ['refund_cash', 'credit_cxc', 'store_credit'];
      if (!VALID_ACTIONS.includes(action_taken)) {
        return res.status(400).json({ success: false, message: `Acción inválida. Usar: ${VALID_ACTIONS.join(', ')}.` });
      }

      const sale = await db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(sale_id, companyId);
      if (!sale) return res.status(404).json({ success: false, message: 'Venta de referencia no encontrada.' });
      if (sale.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'No se puede generar Nota de Crédito sobre una venta anulada.' });
      }

      let creditNoteResult = {};

      await runTransaction(async () => {
        // Calculate totals from items
        let subtotal = 0, taxAmount = 0, total = 0;
        for (const item of items) {
          const qty = Math.abs(Number(item.quantity));
          const price = Number(item.unit_price);
          const taxRate = Number(item.tax_rate || 0);
          const itemSubtotal = qty * price;
          const itemTax = itemSubtotal * (taxRate / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          total += itemSubtotal + itemTax;
        }

        const b04 = FiscalService.getNextNCF(companyId, sale.branch_id, 'B04');
        const creditNoteNumber = `NC-${Date.now().toString().slice(-6)}`;

        const resNC = await db.prepare(`
          INSERT INTO credit_notes (
            company_id, branch_id, warehouse_id, customer_id, user_id, sale_id,
            ncf, credit_note_number, return_type, reason, subtotal, tax_amount, total, action_taken
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'partial', ?, ?, ?, ?, ?)
        `).run(
          companyId, sale.branch_id, sale.warehouse_id, sale.customer_id, req.user.id, sale.id,
          b04.ncf, creditNoteNumber, reason, subtotal, taxAmount, total, action_taken
        );
        const ncId = resNC.lastInsertRowid;

        const stmtItem = await db.prepare(`
          INSERT INTO credit_note_items (
            credit_note_id, product_id, variant_id, quantity, unit_price,
            subtotal, tax_rate, tax_amount, total, returned_to_inventory
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        for (const item of items) {
          const qty = Math.abs(Number(item.quantity));
          const price = Number(item.unit_price);
          const taxRate = Number(item.tax_rate || 0);
          const iSub = qty * price;
          const iTax = iSub * (taxRate / 100);
          stmtItem.run(ncId, item.product_id, item.variant_id || null, qty, price, iSub, taxRate, iTax, iSub + iTax);

          const prod = await db.prepare('SELECT type FROM products WHERE id = ?').get(item.product_id);
          if (prod && prod.type === 'physical') {
            InventoryService.recordMovement({
              companyId,
              branchId: sale.branch_id,
              warehouseId: sale.warehouse_id,
              productId: item.product_id,
              variantId: item.variant_id,
              userId: req.user.id,
              movementType: 'sale_return',
              quantity: qty,
              unitCost: price,
              referenceType: 'credit_notes',
              referenceId: ncId,
              reason: `Devolución parcial de venta ${sale.sale_number} (NC: ${b04.ncf})`
            });
          }
        }

        if (action_taken === 'store_credit') {
          await db.prepare(`
            UPDATE customers SET credit_notes_balance = COALESCE(credit_notes_balance, 0) + ? WHERE id = ?
          `).run(total, sale.customer_id);
        }

        logAudit({
          companyId, userId: req.user.id, ipAddress: req.ip,
          module: 'sales', action: 'create_credit_note',
          recordId: ncId,
          newValues: { ncf: b04.ncf, sale_id, reason, action_taken, total },
          description: `NC Parcial emitida para venta ${sale.sale_number}. NCF: ${b04.ncf}`
        });

        creditNoteResult = { id: ncId, ncf: b04.ncf, credit_note_number: creditNoteNumber, total };
      });

      return res.status(201).json({
        success: true,
        message: 'Nota de Crédito parcial generada exitosamente.',
        credit_note: creditNoteResult
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // QUOTES (Cotizaciones)
  getQuotes: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const quotes = await db.prepare(`
        SELECT q.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               u.first_name || ' ' || u.last_name as seller_name
        FROM quotes q
        JOIN customers c ON q.customer_id = c.id
        JOIN users u ON q.user_id = u.id
        WHERE q.company_id = ?
        ORDER BY q.created_at DESC
      `).all(companyId);

      return res.json({ success: true, data: quotes });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createQuote: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branchId = req.user.branch_id;
      const userId = req.user.id;
      const { customer_id, warehouse_id, valid_days = 15, notes, items } = req.body;

      if (!customer_id || !warehouse_id || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cliente, almacén y artículos requeridos.' });
      }

      const quoteNumber = `COT-${Date.now().toString().slice(-6)}`;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + Number(valid_days));
      const validUntilStr = validUntil.toISOString().split('T')[0];

      let subtotal = 0;
      let taxAmount = 0;
      let total = 0;

      items.forEach(it => {
        const lineSub = Number(it.quantity) * Number(it.unit_price);
        const lineTax = lineSub * (Number(it.tax_rate || 18) / 100);
        subtotal += lineSub;
        taxAmount += lineTax;
        total += lineSub + lineTax;
      });

      const qId = await runTransaction(async () => {
        const stmtQ = await db.prepare(`
          INSERT INTO quotes (
            company_id, branch_id, warehouse_id, customer_id, user_id,
            quote_number, valid_until, subtotal, tax_amount, total, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')
        `);

        const resQ = stmtQ.run(
          companyId, branchId, warehouse_id, customer_id, userId,
          quoteNumber, validUntilStr, subtotal, taxAmount, total, notes || null
        );
        const id = resQ.lastInsertRowid;

        const stmtItem = await db.prepare(`
          INSERT INTO quote_items (
            quote_id, product_id, variant_id, quantity, unit_price, subtotal, tax_rate, tax_amount, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        items.forEach(it => {
          const lSub = Number(it.quantity) * Number(it.unit_price);
          const lTax = lSub * (Number(it.tax_rate || 18) / 100);
          stmtItem.run(id, it.product_id, it.variant_id || null, it.quantity, it.unit_price, lSub, it.tax_rate || 18, lTax, lSub + lTax);
        });

        return id;
      });

      return res.status(201).json({ success: true, message: 'Cotización creada exitosamente.', quote_id: qId, quote_number: quoteNumber });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // COMMISSIONS
  getCommissions: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { salesperson_id, status } = req.query;
      let where = ['c.company_id = ?'];
      let params = [companyId];
      if (salesperson_id) {
        where.push('c.salesperson_id = ?');
        params.push(salesperson_id);
      }
      if (status) {
        where.push('c.status = ?');
        params.push(status);
      }
      const commissions = await db.prepare(`
        SELECT c.*, sp.name as salesperson_name, sp.code as salesperson_code
        FROM commissions c
        JOIN salespeople sp ON c.salesperson_id = sp.id
        WHERE ${where.join(' AND ')}
        ORDER BY c.created_at DESC
      `).all(...params);
      return res.json({ success: true, data: commissions });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  payCommissions: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { commission_ids, receipt_number } = req.body;
      if (!Array.isArray(commission_ids) || commission_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Lista de IDs de comisiones requerida.' });
      }
      const placeholders = commission_ids.map(() => '?').join(',');
      await db.prepare(`
        UPDATE commissions
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, receipt_number = ?
        WHERE id IN (${placeholders}) AND company_id = ?
      `).run(receipt_number || `COM-PAY-${Date.now()}`, ...commission_ids, companyId);
      return res.json({ success: true, message: 'Comisiones marcadas como pagadas.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CREDIT NOTES — List all
  getCreditNotes: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { customer_id, action_taken, return_type, start_date, end_date, search } = req.query;

      let where = 'cn.company_id = ?';
      const params = [companyId];

      if (customer_id) { where += ' AND cn.customer_id = ?'; params.push(customer_id); }
      if (action_taken) { where += ' AND cn.action_taken = ?'; params.push(action_taken); }
      if (return_type) { where += ' AND cn.return_type = ?'; params.push(return_type); }
      if (start_date) { where += ' AND date(cn.created_at) >= ?'; params.push(start_date); }
      if (end_date) { where += ' AND date(cn.created_at) <= ?'; params.push(end_date); }
      if (search) {
        where += ' AND (cn.ncf LIKE ? OR cn.credit_note_number LIKE ? OR cn.reason LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const creditNotes = await db.prepare(`
        SELECT
          cn.*,
          COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          c.tax_id AS customer_tax_id,
          s.sale_number AS original_sale_number,
          s.ncf AS original_ncf,
          u.first_name || ' ' || u.last_name AS user_name
        FROM credit_notes cn
        LEFT JOIN customers c ON cn.customer_id = c.id
        LEFT JOIN sales s ON cn.sale_id = s.id
        LEFT JOIN users u ON cn.user_id = u.id
        WHERE ${where}
        ORDER BY cn.created_at DESC
      `).all(...params);

      return res.json({ success: true, data: creditNotes, total: creditNotes.length });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CREDIT NOTES — Detail with items
  getCreditNoteById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const cn = await db.prepare(`
        SELECT
          cn.*,
          COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          c.tax_id AS customer_tax_id,
          c.phone AS customer_phone,
          c.email AS customer_email,
          s.sale_number AS original_sale_number,
          s.ncf AS original_ncf,
          u.first_name || ' ' || u.last_name AS user_name
        FROM credit_notes cn
        LEFT JOIN customers c ON cn.customer_id = c.id
        LEFT JOIN sales s ON cn.sale_id = s.id
        LEFT JOIN users u ON cn.user_id = u.id
        WHERE cn.id = ? AND cn.company_id = ?
      `).get(id, companyId);

      if (!cn) return res.status(404).json({ success: false, message: 'Nota de Crédito no encontrada.' });

      const items = await db.prepare(`
        SELECT
          cni.*,
          p.name AS product_name,
          p.sku,
          pv.variant_name AS variant_attrs
        FROM credit_note_items cni
        JOIN products p ON cni.product_id = p.id
        LEFT JOIN product_variants pv ON cni.variant_id = pv.id
        WHERE cni.credit_note_id = ?
      `).all(id);

      return res.json({ success: true, data: { ...cn, items } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = salesController;
