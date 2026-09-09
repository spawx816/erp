const bcrypt = require('bcryptjs');
const { db, runTransaction } = require('../../database/db');
const InventoryService = require('../inventory/inventoryService');
const FiscalService = require('../fiscal/fiscalService');
const { logAudit } = require('../../middlewares/audit');
const { generateCommercialId } = require('../../utils/idGenerator');

const salesController = {
  getSales: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, customer_id, branch_id, status, sale_type, start_date, end_date, page = 1, limit = 50 } = req.query;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;

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

      const countRow = await db.prepare(`
        SELECT COUNT(*) as total
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        WHERE ${whereSQL}
      `).get(...params);
      const count = countRow ? parseInt(countRow.total, 10) || 0 : 0;

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
      `).all(...params, parsedLimit, offset);

      return res.json({
        success: true,
        data: sales,
        pagination: {
          total: count,
          page: parsedPage,
          limit: parsedLimit,
          pages: Math.ceil(count / parsedLimit)
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
      const userId = req.user.id;

      const {
        customer_id,
        warehouse_id,
        fiscal_type_code = 'B02', // B02 default (Consumo)
        discount_percent = 0,
        supervisor_auth, // { username, password }
        notes = '',
        items = [],
        payments = [],
        is_pos = true
      } = req.body;

      if (!customer_id || !warehouse_id || !Array.isArray(items) || items.length === 0 || !Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cliente, almacén, al menos un ítem y al menos una forma de pago son obligatorios.'
        });
      }

      // 1. Verify warehouse isolation (must belong to user company)
      const targetWarehouse = await db.prepare('SELECT id, branch_id, company_id FROM warehouses WHERE id = ? AND company_id = ?').get(warehouse_id, companyId);
      if (!targetWarehouse) {
        return res.status(403).json({ success: false, message: 'El almacén especificado no existe o no pertenece a su empresa.' });
      }
      const branchId = targetWarehouse.branch_id || (req.headers['x-branch-id'] ? parseInt(req.headers['x-branch-id'], 10) : null) || req.user.branch_id || 1;

      // 2. Validate user discount limits (preserving 0 as limit)
      const discPercent = Math.max(0, Number(discount_percent || 0));
      const userMaxDiscount = req.user.max_discount_percentage !== undefined && req.user.max_discount_percentage !== null
        ? Number(req.user.max_discount_percentage)
        : 15;

      let authorizedByUserId = userId;

      if (discPercent > userMaxDiscount) {
        if (!supervisor_auth || !supervisor_auth.username || !supervisor_auth.password) {
          return res.status(403).json({
            success: false,
            requires_supervisor_auth: true,
            message: `El descuento solicitado (${discPercent}%) excede su límite permitido (${userMaxDiscount}%). Se requiere autenticación de supervisor.`
          });
        }

        const supervisor = await db.prepare(`
          SELECT u.id, u.password_hash, u.max_discount_percentage, r.slug as role_slug
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) AND u.company_id = ? AND u.status = 'active'
        `).get(supervisor_auth.username, supervisor_auth.username, companyId);

        if (!supervisor || !(await bcrypt.compare(supervisor_auth.password, supervisor.password_hash))) {
          return res.status(403).json({ success: false, message: 'Credenciales de supervisor no válidas.' });
        }

        const allowedSupervisorRoles = ['super-admin', 'admin', 'gerente', 'supervisor'];
        if (!allowedSupervisorRoles.includes(supervisor.role_slug)) {
          return res.status(403).json({ success: false, message: 'El usuario no tiene rango de supervisor para autorizar descuentos.' });
        }

        if (supervisor.role_slug !== 'super-admin' && Number(supervisor.max_discount_percentage || 0) < discPercent) {
          return res.status(403).json({
            success: false,
            message: `El supervisor indicado no tiene autorización para otorgar ${discPercent}% de descuento.`
          });
        }

        authorizedByUserId = supervisor.id;
      }

      // 3. Strict Cash Session Check for POS / cash payments
      const hasCashPayment = payments.some(p => p.payment_method === 'cash');
      let activeSession = null;

      if (hasCashPayment || is_pos) {
        const explicitSessionId = req.body.cash_session_id;
        if (explicitSessionId) {
          activeSession = await db.prepare(`
            SELECT cs.id, cs.cash_register_id, cs.branch_id
            FROM cash_sessions cs
            JOIN cash_registers cr ON cs.cash_register_id = cr.id
            WHERE cs.id = ? AND cs.branch_id = ? AND cr.company_id = ? AND cs.status = 'open'
          `).get(explicitSessionId, branchId, companyId);
        }

        if (!activeSession) {
          activeSession = await db.prepare(`
            SELECT cs.id, cs.cash_register_id, cs.branch_id
            FROM cash_sessions cs
            JOIN cash_registers cr ON cs.cash_register_id = cr.id
            WHERE cs.user_id = ? AND cs.branch_id = ? AND cr.company_id = ? AND cs.status = 'open'
          `).get(userId, branchId, companyId);
        }

        if (!activeSession) {
          return res.status(400).json({
            success: false,
            requires_cash_open: true,
            message: 'No tienes un turno de caja abierto en esta sucursal. Debe aperturar caja antes de facturar en el Punto de Venta (POS).'
          });
        }
      }

      // 4. TRANSACTION EXECUTION WITH PROPAGATED txDb
      const saleResult = await runTransaction(async (txDb) => {
        // Calculate Totals and Validate Items from DB
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        let total = 0;

        const preparedItems = [];
        for (const item of items) {
          const itemQty = Number(item.quantity);
          if (isNaN(itemQty) || !isFinite(itemQty) || itemQty <= 0) {
            throw new Error(`Cantidad inválida para el producto ID ${item.product_id}: ${item.quantity}`);
          }

          // Fetch product strictly isolated by company
          const prod = await txDb.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(item.product_id, companyId);
          if (!prod) throw new Error(`Producto ID ${item.product_id} no encontrado en su empresa.`);

          // Validate or override unit price
          let unitPrice = Number(prod.price);
          if (item.unit_price !== undefined && Math.abs(Number(item.unit_price) - unitPrice) > 0.01) {
            const canEditPrice = ['super-admin', 'admin'].includes(req.user.role_slug) || (req.user.permissions && req.user.permissions.includes('sales.edit_price'));
            if (!canEditPrice) {
              if (!supervisor_auth || !supervisor_auth.username || !supervisor_auth.password) {
                throw new Error(`No tiene permisos para modificar el precio de [${prod.name}]. Precio catálogo: RD$ ${unitPrice.toFixed(2)}. Requiere autorización y contraseña de supervisor.`);
              }
              const supUser = await txDb.prepare(`
                SELECT u.id, u.password_hash, r.slug as role_slug
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) AND u.company_id = ? AND u.status = 'active'
              `).get(supervisor_auth.username, supervisor_auth.username, companyId);

              if (!supUser || !(await bcrypt.compare(supervisor_auth.password, supUser.password_hash))) {
                throw new Error('Credenciales de supervisor incorrectas para autorizar modificación de precio.');
              }
              if (!['super-admin', 'admin', 'gerente', 'supervisor'].includes(supUser.role_slug)) {
                throw new Error('El usuario indicado no cuenta con el rol requerido para autorizar precios.');
              }
              if (Number(supUser.id) === Number(req.user.id)) {
                throw new Error('Segregación de funciones: no puede autorizarse precios especiales a sí mismo.');
              }
            }
            unitPrice = Math.max(0, Number(item.unit_price));
          }

          // Validate variant if provided
          if (item.variant_id) {
            const variant = await txDb.prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?').get(item.variant_id, item.product_id);
            if (!variant) {
              throw new Error(`La variante ID ${item.variant_id} no pertenece al producto [${prod.name}].`);
            }
          }

          // Validate inventory if physical product
          if (prod.type === 'physical') {
            const currentStock = await InventoryService.getCurrentStock(warehouse_id, item.product_id, item.variant_id || null);
            if (currentStock < itemQty) {
              const comp = await txDb.prepare('SELECT allow_negative_inventory FROM companies WHERE id = ?').get(companyId);
              const allowNegative = comp && (comp.allow_negative_inventory === 1 || comp.allow_negative_inventory === true || comp.allow_negative_inventory === '1');
              if (!allowNegative) {
                throw new Error(`Inventario insuficiente para [${prod.name}]. Disponible: ${currentStock}, Solicitado: ${itemQty}`);
              }
            }
          }

          const itemBase = Math.round(itemQty * unitPrice * 100) / 100;
          const itemDiscPercent = discPercent > 0 ? discPercent : Math.min(Math.max(0, Number(item.discount_percent || 0)), userMaxDiscount);
          const itemDiscAmount = Math.round(itemBase * (itemDiscPercent / 100) * 100) / 100;
          const itemNet = Math.round((itemBase - itemDiscAmount) * 100) / 100;
          
          // Server catalog is authority on tax rate (exempt goods maintain 0% tax)
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
            product_type: prod.type,
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

        // 5. Payment reconciliation (SEPARATE direct payments from credit financing)
        const VALID_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'check', 'credit']);
        let directPaid = 0;
        let totalCashAmount = 0;
        let totalCashTendered = 0;
        let hasCreditPayment = false;
        let creditAmount = 0;

        payments.forEach(p => {
          const amt = Math.round(Number(p.amount) * 100) / 100;
          if (isNaN(amt) || !isFinite(amt) || amt < 0) {
            throw new Error(`Monto de pago inválido: ${p.amount}`);
          }
          if (!VALID_PAYMENT_METHODS.has(p.payment_method)) {
            throw new Error(`Método de pago no permitido: [${p.payment_method}]. Métodos válidos: cash, card, transfer, check, credit.`);
          }
          if (p.payment_method === 'credit') {
            hasCreditPayment = true;
            creditAmount = Math.round((creditAmount + amt) * 100) / 100;
          } else {
            directPaid = Math.round((directPaid + amt) * 100) / 100;
            if (p.payment_method === 'cash') {
              totalCashAmount = Math.round((totalCashAmount + amt) * 100) / 100;
              totalCashTendered = Math.round((totalCashTendered + Number(p.tendered !== undefined ? p.tendered : amt)) * 100) / 100;
            }
          }
        });

        // Determine sale type
        let saleType = 'cash';
        if (hasCreditPayment && creditAmount >= total - 0.05) {
          saleType = 'credit';
        } else if (hasCreditPayment && directPaid > 0) {
          saleType = 'mixed';
        } else if (payments.length > 1) {
          saleType = 'mixed';
        }

        // Change applies exclusively to excess cash tendered on cash payments
        const changeGiven = Math.max(0, Math.round((totalCashTendered - totalCashAmount) * 100) / 100);

        // Calculate actual unpaid balance
        const balanceAmount = Math.max(0, Math.round((total - directPaid) * 100) / 100);
        const initialStatus = balanceAmount === 0 ? 'paid' : (directPaid > 0 ? 'partial' : 'pending');

        // Customer and Credit Checks locked with FOR UPDATE
        const cust = await txDb.prepare(`
          SELECT id, salesperson_id, credit_days, credit_limit, current_balance,
                 is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices
          FROM customers WHERE id = ? AND company_id = ?
          FOR UPDATE
        `).get(customer_id, companyId);

        if (!cust) {
          throw new Error('Cliente no válido o no pertenece a esta empresa.');
        }

        const salespersonId = cust.salesperson_id || null;
        const creditDays = cust.credit_days ? Number(cust.credit_days) : 30;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + creditDays);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const issueDateStr = new Date().toISOString().split('T')[0];

        // Strict verification if credit is granted
        if (hasCreditPayment || balanceAmount > 0) {
          const availableCredit = Number(cust.credit_limit || 0) - Number(cust.current_balance || 0);

          const overdueCheck = await txDb.prepare(`
            SELECT COUNT(*) as cnt FROM accounts_receivable
            WHERE customer_id = ? AND company_id = ? AND status != 'paid' AND due_date < CURRENT_DATE AND balance > 0.01
          `).get(customer_id, companyId);
          const hasOverdue = Number(overdueCheck?.cnt || 0) > 0;
          const overdueBlocked = hasOverdue && (cust.allow_sales_with_overdue_invoices !== 1 && cust.allow_sales_with_overdue_invoices !== true && cust.allow_sales_with_overdue_invoices !== '1');

          const creditExceeded = (balanceAmount > availableCredit && Number(cust.credit_limit || 0) > 0);
          const needsSupervisorAuth = (cust.is_credit_blocked === 1) || creditExceeded || overdueBlocked || (cust.requires_special_auth === 1);

          if (needsSupervisorAuth) {
            if (!supervisor_auth || !supervisor_auth.username || !supervisor_auth.password) {
              let reason = 'Se requiere autorización de supervisor para facturar a crédito.';
              if (cust.is_credit_blocked === 1) reason = 'El cliente tiene el crédito bloqueado por administración.';
              else if (overdueBlocked) reason = 'El cliente tiene facturas vencidas impagadas.';
              else if (creditExceeded) reason = `El crédito (RD$ ${balanceAmount.toFixed(2)}) supera el crédito disponible (RD$ ${Math.max(0, availableCredit).toFixed(2)}).`;

              throw new Error(`${reason} Ingrese usuario y contraseña de supervisor.`);
            }

            const supUser = await txDb.prepare(`
              SELECT u.id, u.password_hash, r.slug as role_slug
              FROM users u
              JOIN roles r ON u.role_id = r.id
              WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) AND u.company_id = ? AND u.status = 'active'
            `).get(supervisor_auth.username, supervisor_auth.username, companyId);

            if (!supUser || !(await bcrypt.compare(supervisor_auth.password, supUser.password_hash))) {
              throw new Error('Credenciales de supervisor incorrectas para autorizar el crédito.');
            }

            const allowedRoles = ['super-admin', 'admin', 'gerente', 'supervisor'];
            if (!allowedRoles.includes(supUser.role_slug)) {
              throw new Error('El usuario indicado no cuenta con el rol requerido para autorizar crédito especial.');
            }
            if (Number(supUser.id) === Number(req.user.id)) {
              throw new Error('Segregación de funciones: no puede auto-aprobarse crédito especial.');
            }
          }
        }

        // 6. Obtain Dominican NCF atomically within the transaction
        const fiscalInfo = await FiscalService.getNextNCF(companyId, branchId, fiscal_type_code, txDb);
        const saleNumber = generateCommercialId('VTA');
        const invoiceNumber = generateCommercialId('FAC');

        // 7. Insert Sale record
        const resSale = await txDb.prepare(`
          INSERT INTO sales (
            company_id, branch_id, warehouse_id, cash_session_id, customer_id, salesperson_id, user_id,
            sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
            subtotal, discount_amount, tax_amount, total, amount_paid, balance, change_given,
            due_date, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId, branchId, warehouse_id, activeSession ? activeSession.id : null, customer_id, salespersonId, userId,
          saleNumber, invoiceNumber, fiscalInfo.ncf, fiscal_type_code, saleType,
          subtotal, totalDiscount, totalTax, total, directPaid, balanceAmount, changeGiven,
          hasCreditPayment ? dueDateStr : null, initialStatus, notes
        );
        const saleId = resSale.lastInsertRowid;

        // Log sequence usage
        await txDb.prepare(`
          INSERT INTO fiscal_sequence_logs (fiscal_sequence_id, ncf, reference_type, reference_id, user_id)
          VALUES (?, ?, 'sales', ?, ?)
        `).run(fiscalInfo.sequenceId, fiscalInfo.ncf, saleId, userId);

        // 8. Insert Sale Items and deduct stock atomically via Kardex
        for (const item of preparedItems) {
          await txDb.prepare(`
            INSERT INTO sale_items (
              sale_id, product_id, variant_id, product_name, quantity, unit_cost, unit_price,
              discount_percent, discount_amount, subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            saleId, item.product_id, item.variant_id, item.product_name, item.quantity,
            item.unit_cost, item.unit_price, item.discount_percent, item.discount_amount,
            item.subtotal, item.tax_rate, item.tax_amount, item.total
          );

          if (item.product_type === 'physical') {
            await InventoryService.recordMovement({
              companyId,
              branchId,
              warehouseId,
              productId: item.product_id,
              variantId: item.variant_id,
              userId,
              movementType: 'sale',
              quantity: -Math.abs(item.quantity),
              unitCost: item.unit_cost,
              referenceType: 'sales',
              referenceId: saleId,
              reason: `Venta ${saleNumber} (NCF: ${fiscalInfo.ncf})`,
              txClient: txDb
            });
          }
        }

        // 9. Insert Payments
        for (const p of payments) {
          await txDb.prepare(`
            INSERT INTO sale_payments (sale_id, payment_method, amount, tendered, change_given, reference_number, card_last_digits)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            saleId, p.payment_method, p.amount, p.tendered || p.amount,
            p.payment_method === 'cash' ? changeGiven : 0,
            p.reference_number || null, p.card_last_digits || null
          );

          if (p.payment_method === 'cash' && activeSession) {
            await txDb.prepare(`
              INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
              VALUES (?, ?, 'sale_cash', ?, ?, 'sales', ?)
            `).run(activeSession.id, userId, p.amount, `Venta en mostrador ${saleNumber}`, saleId);
          }
        }

        // 10. If there is an unpaid balance / credit, generate Accounts Receivable (CxC) & update customer current_balance
        if (hasCreditPayment || balanceAmount > 0) {
          await txDb.prepare(`
            INSERT INTO accounts_receivable (
              company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
              issue_date, due_date, amount, balance, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            companyId, branchId, customer_id, saleId, invoiceNumber, fiscalInfo.ncf,
            issueDateStr, dueDateStr, total, balanceAmount, initialStatus
          );

          // Correctly update customer balance with the real unpaid amount
          await txDb.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(balanceAmount, customer_id);
        }

        // 11. Commission calculation for assigned salesperson
        if (salespersonId) {
          const sp = await txDb.prepare('SELECT commission_rate FROM salespeople WHERE id = ?').get(salespersonId);
          const rate = sp ? Number(sp.commission_rate) : 5.00;
          const commAmt = Math.round((subtotal * (rate / 100)) * 100) / 100;
          await txDb.prepare(`
            INSERT INTO commissions (company_id, salesperson_id, sale_id, invoice_number, base_amount, commission_rate, commission_amount, calculation_type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', 'pending')
          `).run(companyId, salespersonId, saleId, invoiceNumber, subtotal, rate, commAmt);
        }

        // 12. If authorized discount was used, log it
        if (discPercent > userMaxDiscount) {
          await txDb.prepare(`
            INSERT INTO discount_authorizations (
              company_id, sale_id, requested_by_user_id, authorized_by_user_id,
              requested_percent, discount_amount, reason, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
          `).run(companyId, saleId, userId, authorizedByUserId, discPercent, totalDiscount, notes || 'Descuento especial autorizado en POS');
        }

        return {
          saleId,
          sale_id: saleId,
          saleNumber,
          sale_number: saleNumber,
          invoiceNumber,
          invoice_number: invoiceNumber,
          ncf: fiscalInfo.ncf,
          fiscal_type_code,
          subtotal,
          discount: totalDiscount,
          discount_amount: totalDiscount,
          total_discount: totalDiscount,
          tax: totalTax,
          tax_amount: totalTax,
          total,
          paid: directPaid,
          balance: balanceAmount,
          change: changeGiven,
          change_given: changeGiven,
          status: initialStatus,
          items: preparedItems
        };
      });

      // 13. Audit Log post commit
      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'sales',
        action: 'create_sale',
        recordId: saleResult.saleId,
        newValues: saleResult,
        description: `Venta creada exitosamente ${saleResult.saleNumber} (NCF: ${saleResult.ncf}) por RD$ ${saleResult.total}`
      });

      return res.status(201).json({
        success: true,
        message: 'Venta procesada exitosamente.',
        data: saleResult
      });
    } catch (err) {
      console.error('Checkout error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // VOID SALE (Cancel invoice with Credit Note B04)
  voidSale: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { reason = 'Anulación de factura por error operativo', action_taken = 'store_credit' } = req.body;

      const sale = await db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
      }
      if (sale.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'Esta venta ya se encuentra anulada.' });
      }

      let creditNoteResult = {};

      await runTransaction(async (txDb) => {
        // Lock sale row
        const lockedSale = await txDb.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ? FOR UPDATE').get(id, companyId);
        if (!lockedSale || lockedSale.status === 'cancelled') {
          throw new Error('La venta ya fue anulada previamente o no existe.');
        }

        // 1. Get NCF B04 for credit note atomically
        const b04 = await FiscalService.getNextNCF(companyId, lockedSale.branch_id, 'B04', txDb);
        const creditNoteNumber = generateCommercialId('NC');

        // Check unreturned items and calculate exact unreturned subtotals and taxes
        const items = await txDb.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(lockedSale.id);
        const verifiedItems = [];
        let ncSubtotal = 0;
        let ncTaxAmount = 0;
        let ncTotal = 0;

        for (const item of items) {
          const itemReturnedRow = await txDb.prepare(`
            SELECT COALESCE(SUM(cni.quantity), 0) as returned_qty
            FROM credit_note_items cni
            JOIN credit_notes cn ON cni.credit_note_id = cn.id
            WHERE cn.sale_id = ? AND cni.product_id = ? AND (cni.variant_id = ? OR (cni.variant_id IS NULL AND ? IS NULL))
          `).get(lockedSale.id, item.product_id, item.variant_id, item.variant_id);
          const itemAlreadyReturned = Number(itemReturnedRow?.returned_qty || 0);
          const netQtyToReturn = Math.max(0, Number(item.quantity) - itemAlreadyReturned);

          if (netQtyToReturn > 0) {
            const unitNet = Number(item.quantity) > 0 ? (Number(item.subtotal) / Number(item.quantity)) : Number(item.unit_price);
            const unitTax = Number(item.quantity) > 0 ? (Number(item.tax_amount) / Number(item.quantity)) : 0;
            const lineSub = Math.round(netQtyToReturn * unitNet * 100) / 100;
            const lineTax = Math.round(netQtyToReturn * unitTax * 100) / 100;
            const lineTot = Math.round((lineSub + lineTax) * 100) / 100;

            ncSubtotal = Math.round((ncSubtotal + lineSub) * 100) / 100;
            ncTaxAmount = Math.round((ncTaxAmount + lineTax) * 100) / 100;
            ncTotal = Math.round((ncTotal + lineTot) * 100) / 100;

            verifiedItems.push({
              product_id: item.product_id,
              variant_id: item.variant_id || null,
              quantity: netQtyToReturn,
              unit_price: unitNet,
              subtotal: lineSub,
              tax_rate: item.tax_rate || 0,
              tax_amount: lineTax,
              total: lineTot,
              unit_cost: item.unit_cost
            });
          }
        }

        // 2. Insert credit note record with exact reconciled totals
        const resNC = await txDb.prepare(`
          INSERT INTO credit_notes (
            company_id, branch_id, warehouse_id, customer_id, user_id, sale_id,
            ncf, credit_note_number, return_type, reason, subtotal, tax_amount, total, action_taken
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'total', ?, ?, ?, ?, ?)
        `).run(
          companyId, lockedSale.branch_id, lockedSale.warehouse_id, lockedSale.customer_id, req.user.id, lockedSale.id,
          b04.ncf, creditNoteNumber, reason, ncSubtotal, ncTaxAmount, ncTotal, action_taken
        );
        const ncId = resNC.lastInsertRowid;

        // 3. Revert inventory
        for (const it of verifiedItems) {
          await txDb.prepare(`
            INSERT INTO credit_note_items (
              credit_note_id, product_id, variant_id, quantity, unit_price,
              subtotal, tax_rate, tax_amount, total, returned_to_inventory
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(ncId, it.product_id, it.variant_id, it.quantity, it.unit_price, it.subtotal, it.tax_rate, it.tax_amount, it.total);

          const prod = await txDb.prepare('SELECT type FROM products WHERE id = ?').get(it.product_id);
          if (prod && prod.type === 'physical') {
            await InventoryService.recordMovement({
              companyId,
              branchId: lockedSale.branch_id,
              warehouseId: lockedSale.warehouse_id,
              productId: it.product_id,
              variantId: it.variant_id,
              userId: req.user.id,
              movementType: 'sale_return',
              quantity: it.quantity,
              unitCost: it.unit_cost,
              referenceType: 'credit_notes',
              referenceId: ncId,
              reason: `Reversión por anulación de venta ${lockedSale.sale_number} (NC: ${b04.ncf})`,
              txClient: txDb
            });
          }
        }

        // 4. Financial routing: Relieve outstanding debt in CxC first
        const ar = await txDb.prepare('SELECT id, balance FROM accounts_receivable WHERE sale_id = ? FOR UPDATE').get(lockedSale.id);
        const unpaidDebt = ar ? Number(ar.balance || 0) : 0;
        const debtRelief = Math.min(unpaidDebt, ncTotal);

        if (ar && unpaidDebt > 0) {
          await txDb.prepare(`
            UPDATE accounts_receivable
            SET status = CASE WHEN balance - ? <= 0.01 THEN 'cancelled' ELSE 'partial' END,
                balance = GREATEST(0, balance - ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(debtRelief, debtRelief, ar.id);

          await txDb.prepare('UPDATE customers SET current_balance = GREATEST(0, current_balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(debtRelief, lockedSale.customer_id);
        }

        // Reset sales balance and mark as cancelled
        await txDb.prepare("UPDATE sales SET balance = 0, status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lockedSale.id);

        const remainingRefund = Math.max(0, Math.round((ncTotal - debtRelief) * 100) / 100);

        if (action_taken === 'refund_cash') {
          // Check how much cash was actually collected on this sale
          const cashPaidRow = await txDb.prepare("SELECT COALESCE(SUM(amount), 0) as paid FROM sale_payments WHERE sale_id = ? AND payment_method = 'cash'").get(lockedSale.id);
          const totalCashCollected = Number(cashPaidRow?.paid || 0);

          const previousCashRefundsRow = await txDb.prepare(`
            SELECT COALESCE(SUM(cm.amount), 0) as refunded
            FROM cash_movements cm
            JOIN credit_notes cn ON cm.reference_id = cn.id
            WHERE cn.sale_id = ? AND cm.type = 'refund_cash'
          `).get(lockedSale.id);
          const previousCashRefunds = Number(previousCashRefundsRow?.refunded || 0);

          const maxCashRefundable = Math.max(0, totalCashCollected - previousCashRefunds);
          const cashToRefund = Math.min(remainingRefund, maxCashRefundable);

          if (cashToRefund > 0) {
            const activeSession = await txDb.prepare(`
              SELECT id FROM cash_sessions
              WHERE user_id = ? AND branch_id = ? AND status = 'open'
              FOR UPDATE
            `).get(req.user.id, lockedSale.branch_id);

            if (!activeSession) {
              throw new Error('Se requiere una sesión de caja abierta activa en esta sucursal para devolver dinero en efectivo.');
            }

            await txDb.prepare(`
              INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
              VALUES (?, ?, 'refund_cash', ?, ?, 'credit_notes', ?)
            `).run(activeSession.id, req.user.id, cashToRefund, `Devolución efectivo anulación venta ${lockedSale.sale_number}`, ncId);
          }
        } else if (action_taken === 'store_credit' && remainingRefund > 0) {
          await txDb.prepare(`
            UPDATE customers
            SET credit_notes_balance = COALESCE(credit_notes_balance, 0) + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(remainingRefund, lockedSale.customer_id);
        }

        // 5. Cancel commissions
        await txDb.prepare(`UPDATE commissions SET status = 'cancelled' WHERE sale_id = ?`).run(lockedSale.id);

        creditNoteResult = { ncf: b04.ncf, credit_note_number: creditNoteNumber, id: ncId, total: ncTotal };
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'sales',
        action: 'cancel_sale',
        recordId: sale.id,
        newValues: { status: 'cancelled', ncf_b04: creditNoteResult.ncf, reason, action_taken },
        description: `Venta anulada ${sale.sale_number}. NC B04: ${creditNoteResult.ncf} — Acción: ${action_taken}`
      });

      return res.json({
        success: true,
        message: 'Venta anulada exitosamente y Nota de Crédito emitida.',
        credit_note: creditNoteResult
      });
    } catch (err) {
      console.error('Void sale error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CREATE PARTIAL CREDIT NOTE
  createCreditNote: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        sale_id,
        items = [], // [{ product_id, variant_id, quantity }]
        reason,
        action_taken = 'refund_cash'
      } = req.body;

      if (!sale_id || !reason || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'sale_id, reason e items son requeridos.' });
      }

      const VALID_ACTIONS = ['refund_cash', 'credit_cxc', 'store_credit'];
      if (!VALID_ACTIONS.includes(action_taken)) {
        return res.status(400).json({ success: false, message: `Acción inválida. Usar: ${VALID_ACTIONS.join(', ')}.` });
      }

      const sale = await db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(sale_id, companyId);
      if (!sale) return res.status(404).json({ success: false, message: 'Venta de referencia no encontrada.' });
      if (sale.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'No se puede generar Nota de Crédito sobre una venta ya anulada.' });
      }

      // Aggregate incoming items by product_id and variant_id to eliminate duplicates
      const aggregatedMap = new Map();
      for (const reqItem of items) {
        const pId = parseInt(reqItem.product_id, 10);
        const vId = reqItem.variant_id ? parseInt(reqItem.variant_id, 10) : null;
        const qty = Number(reqItem.quantity);
        if (!pId || isNaN(qty) || !isFinite(qty) || qty <= 0) {
          return res.status(400).json({ success: false, message: `Cantidad inválida para producto ID ${reqItem.product_id}: ${reqItem.quantity}` });
        }
        const key = `${pId}_${vId || 'none'}`;
        const existing = aggregatedMap.get(key) || { product_id: pId, variant_id: vId, quantity: 0 };
        existing.quantity = Math.round((existing.quantity + qty) * 10000) / 10000;
        aggregatedMap.set(key, existing);
      }

      let creditNoteResult = {};

      await runTransaction(async (txDb) => {
        // Lock sale row
        const lockedSale = await txDb.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ? FOR UPDATE').get(sale.id, companyId);
        if (!lockedSale || lockedSale.status === 'cancelled') {
          throw new Error('La venta se encuentra anulada o no existe.');
        }

        // Fetch original sale items
        const originalItems = await txDb.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(lockedSale.id);

        let subtotal = 0, taxAmount = 0, total = 0;
        const verifiedItems = [];

        for (const reqItem of aggregatedMap.values()) {
          // Match by product_id and variant_id
          const orig = originalItems.find(it => 
            Number(it.product_id) === Number(reqItem.product_id) &&
            ((!it.variant_id && !reqItem.variant_id) || Number(it.variant_id) === Number(reqItem.variant_id))
          );

          if (!orig) {
            throw new Error(`El producto ID ${reqItem.product_id} no formó parte de la venta original.`);
          }

          // Check cumulative returns under row-level lock
          const prevReturn = await txDb.prepare(`
            SELECT COALESCE(SUM(cni.quantity), 0) as returned_qty
            FROM credit_note_items cni
            JOIN credit_notes cn ON cni.credit_note_id = cn.id
            WHERE cn.sale_id = ? AND cni.product_id = ? AND (cni.variant_id = ? OR (cni.variant_id IS NULL AND ? IS NULL))
          `).get(lockedSale.id, reqItem.product_id, reqItem.variant_id, reqItem.variant_id);

          const alreadyReturnedQty = Number(prevReturn?.returned_qty || 0);
          const maxReturnableQty = Number(orig.quantity) - alreadyReturnedQty;

          if (reqItem.quantity > maxReturnableQty) {
            throw new Error(`No se puede devolver ${reqItem.quantity} unidad(es) de [${orig.product_name}]. Cantidad original: ${orig.quantity}, Ya devuelta: ${alreadyReturnedQty}, Máximo a devolver: ${maxReturnableQty}`);
          }

          // Use effective net and tax per unit originally paid (respecting original discounts)
          const unitNet = Number(orig.quantity) > 0 ? (Number(orig.subtotal) / Number(orig.quantity)) : Number(orig.unit_price);
          const unitTax = Number(orig.quantity) > 0 ? (Number(orig.tax_amount) / Number(orig.quantity)) : 0;
          const itemSubtotal = Math.round(reqItem.quantity * unitNet * 100) / 100;
          const itemTax = Math.round(reqItem.quantity * unitTax * 100) / 100;
          const itemTotal = Math.round((itemSubtotal + itemTax) * 100) / 100;

          subtotal = Math.round((subtotal + itemSubtotal) * 100) / 100;
          taxAmount = Math.round((taxAmount + itemTax) * 100) / 100;
          total = Math.round((total + itemTotal) * 100) / 100;

          verifiedItems.push({
            product_id: orig.product_id,
            variant_id: orig.variant_id,
            quantity: reqItem.quantity,
            unit_price: unitNet,
            unit_cost: orig.unit_cost,
            subtotal: itemSubtotal,
            tax_rate: orig.tax_rate || 0,
            tax_amount: itemTax,
            total: itemTotal
          });
        }

        const b04 = await FiscalService.getNextNCF(companyId, lockedSale.branch_id, 'B04', txDb);
        const creditNoteNumber = generateCommercialId('NC');

        const resNC = await txDb.prepare(`
          INSERT INTO credit_notes (
            company_id, branch_id, warehouse_id, customer_id, user_id, sale_id,
            ncf, credit_note_number, return_type, reason, subtotal, tax_amount, total, action_taken
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'partial', ?, ?, ?, ?, ?)
        `).run(
          companyId, lockedSale.branch_id, lockedSale.warehouse_id, lockedSale.customer_id, req.user.id, lockedSale.id,
          b04.ncf, creditNoteNumber, reason, subtotal, taxAmount, total, action_taken
        );
        const ncId = resNC.lastInsertRowid;

        for (const item of verifiedItems) {
          await txDb.prepare(`
            INSERT INTO credit_note_items (
              credit_note_id, product_id, variant_id, quantity, unit_price,
              subtotal, tax_rate, tax_amount, total, returned_to_inventory
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(ncId, item.product_id, item.variant_id, item.quantity, item.unit_price, item.subtotal, item.tax_rate, item.tax_amount, item.total);

          const prod = await txDb.prepare('SELECT type FROM products WHERE id = ?').get(item.product_id);
          if (prod && prod.type === 'physical') {
            await InventoryService.recordMovement({
              companyId,
              branchId: lockedSale.branch_id,
              warehouseId: lockedSale.warehouse_id,
              productId: item.product_id,
              variantId: item.variant_id,
              userId: req.user.id,
              movementType: 'sale_return',
              quantity: item.quantity,
              unitCost: item.unit_cost,
              referenceType: 'credit_notes',
              referenceId: ncId,
              reason: `Devolución parcial de venta ${lockedSale.sale_number} (NC: ${b04.ncf})`,
              txClient: txDb
            });
          }
        }

        // Financial destination processing
        if (action_taken === 'refund_cash') {
          // Check actual cash collected on this sale
          const cashPaidRow = await txDb.prepare("SELECT COALESCE(SUM(amount), 0) as paid FROM sale_payments WHERE sale_id = ? AND payment_method = 'cash'").get(lockedSale.id);
          const totalCashCollected = Number(cashPaidRow?.paid || 0);

          const previousCashRefundsRow = await txDb.prepare(`
            SELECT COALESCE(SUM(cm.amount), 0) as refunded
            FROM cash_movements cm
            JOIN credit_notes cn ON cm.reference_id = cn.id
            WHERE cn.sale_id = ? AND cm.type = 'refund_cash'
          `).get(lockedSale.id);
          const previousCashRefunds = Number(previousCashRefundsRow?.refunded || 0);

          const maxCashRefundable = Math.max(0, totalCashCollected - previousCashRefunds);
          if (total > maxCashRefundable) {
            throw new Error(`No se puede devolver RD$ ${total.toFixed(2)} en efectivo. El remanente cobrado en efectivo para esta venta es RD$ ${maxCashRefundable.toFixed(2)}.`);
          }

          const activeSession = await txDb.prepare(`
            SELECT id FROM cash_sessions
            WHERE user_id = ? AND branch_id = ? AND status = 'open'
            FOR UPDATE
          `).get(req.user.id, lockedSale.branch_id);

          if (!activeSession) {
            throw new Error('Se requiere una sesión de caja abierta activa en esta sucursal para devolver dinero en efectivo.');
          }

          await txDb.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'refund_cash', ?, ?, 'credit_notes', ?)
          `).run(activeSession.id, req.user.id, total, `Devolución efectivo NC ${creditNoteNumber}`, ncId);

        } else if (action_taken === 'credit_cxc') {
          // Reduce Accounts Receivable
          const ar = await txDb.prepare('SELECT id, balance FROM accounts_receivable WHERE sale_id = ? FOR UPDATE').get(lockedSale.id);
          const arBalance = ar ? Number(ar.balance || 0) : 0;
          const toDeductAr = Math.min(arBalance, total);

          if (ar && toDeductAr > 0) {
            await txDb.prepare(`
              UPDATE accounts_receivable
              SET balance = GREATEST(0, balance - ?),
                  status = CASE WHEN balance - ? <= 0.01 THEN 'paid' ELSE 'partial' END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(toDeductAr, toDeductAr, ar.id);

            await txDb.prepare('UPDATE sales SET balance = GREATEST(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(toDeductAr, lockedSale.id);
            await txDb.prepare('UPDATE customers SET current_balance = GREATEST(0, current_balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(toDeductAr, lockedSale.customer_id);
          }
        } else if (action_taken === 'store_credit') {
          await txDb.prepare(`
            UPDATE customers SET credit_notes_balance = COALESCE(credit_notes_balance, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(total, lockedSale.customer_id);
        }

        creditNoteResult = { id: ncId, ncf: b04.ncf, credit_note_number: creditNoteNumber, total };
      });

      logAudit({
        companyId, userId: req.user.id, ipAddress: req.ip,
        module: 'sales', action: 'create_credit_note',
        recordId: creditNoteResult.id,
        newValues: { ncf: creditNoteResult.ncf, sale_id, reason, action_taken, total: creditNoteResult.total },
        description: `NC Parcial emitida para venta ${sale.sale_number}. NCF: ${creditNoteResult.ncf}`
      });

      return res.json({
        success: true,
        message: 'Nota de Crédito generada exitosamente.',
        credit_note: creditNoteResult
      });
    } catch (err) {
      console.error('Credit note error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // QUOTES
  createQuote: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branchId = req.user.branch_id || 1;
      const userId = req.user.id;
      const { customer_id, warehouse_id, valid_days = 15, notes = '', items = [] } = req.body;

      if (!customer_id || !warehouse_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cliente, almacén y al menos un producto son requeridos.' });
      }

      const quoteNumber = generateCommercialId('COT');
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + Number(valid_days));
      const validUntilStr = validUntil.toISOString().split('T')[0];

      let subtotal = 0;
      let taxAmount = 0;
      let total = 0;

      for (const it of items) {
        const qty = Number(it.quantity);
        const price = Number(it.unit_price);
        if (isNaN(qty) || !isFinite(qty) || qty <= 0 || isNaN(price) || price < 0) {
          return res.status(400).json({ success: false, message: 'Cantidades y precios de cotización deben ser positivos y válidos.' });
        }
        const taxRate = Number(it.tax_rate !== undefined ? it.tax_rate : 18);
        const lineSub = Math.round(qty * price * 100) / 100;
        const lineTax = Math.round(lineSub * (taxRate / 100) * 100) / 100;
        subtotal = Math.round((subtotal + lineSub) * 100) / 100;
        taxAmount = Math.round((taxAmount + lineTax) * 100) / 100;
        total = Math.round((total + (lineSub + lineTax)) * 100) / 100;
      }

      const qId = await runTransaction(async (txDb) => {
        const resQ = await txDb.prepare(`
          INSERT INTO quotes (
            company_id, branch_id, warehouse_id, customer_id, user_id,
            quote_number, valid_until, subtotal, tax_amount, total, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')
        `).run(
          companyId, branchId, warehouse_id, customer_id, userId,
          quoteNumber, validUntilStr, subtotal, taxAmount, total, notes || null
        );
        const id = resQ.lastInsertRowid;

        for (const it of items) {
          const qty = Number(it.quantity);
          const price = Number(it.unit_price);
          const taxRate = Number(it.tax_rate !== undefined ? it.tax_rate : 18);
          const lSub = Math.round(qty * price * 100) / 100;
          const lTax = Math.round(lSub * (taxRate / 100) * 100) / 100;
          await txDb.prepare(`
            INSERT INTO quote_items (
              quote_id, product_id, variant_id, quantity, unit_price, subtotal, tax_rate, tax_amount, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, it.product_id, it.variant_id || null, qty, price, lSub, taxRate, lTax, lSub + lTax);
        }

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
      `).run(receipt_number || generateCommercialId('COM-PAY'), ...commission_ids, companyId);
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
  },

  getQuotes: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { customer_id, status, search } = req.query;
      let where = 'q.company_id = ?';
      const params = [companyId];

      if (customer_id) { where += ' AND q.customer_id = ?'; params.push(customer_id); }
      if (status) { where += ' AND q.status = ?'; params.push(status); }
      if (search) {
        where += ' AND (q.quote_number LIKE ? OR c.company_name LIKE ? OR c.first_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const quotes = await db.prepare(`
        SELECT q.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               u.first_name || ' ' || u.last_name as user_name
        FROM quotes q
        JOIN customers c ON q.customer_id = c.id
        JOIN users u ON q.user_id = u.id
        WHERE ${where}
        ORDER BY q.created_at DESC
      `).all(...params);

      return res.json({ success: true, data: quotes });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Alias for route consistency
  cancelSale: (req, res) => salesController.voidSale(req, res)
};

module.exports = salesController;
