const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const thirdPartiesController = {
  // SALESPEOPLE (VENDEDORES)
  getSalespeople: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const salespeople = await db.prepare(`
        SELECT sp.*,
               u.username,
               (SELECT COUNT(*) FROM customers c WHERE c.salesperson_id = sp.id AND c.status = 'active') as assigned_customers_count,
               (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.salesperson_id = sp.id AND s.status != 'cancelled' AND date(s.created_at) = date('now')) as sales_today,
               (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.salesperson_id = sp.id AND s.status != 'cancelled' AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')) as sales_month,
               (SELECT COALESCE(SUM(rp.total_amount), 0) FROM receivable_payments rp JOIN customers c ON rp.customer_id = c.id WHERE c.salesperson_id = sp.id AND strftime('%Y-%m', rp.payment_date) = strftime('%Y-%m', 'now')) as collections_month,
               (SELECT COALESCE(SUM(c.current_balance), 0) FROM customers c WHERE c.salesperson_id = sp.id) as portfolio_balance,
               (SELECT COUNT(DISTINCT c.id) FROM customers c JOIN accounts_receivable ar ON ar.customer_id = c.id WHERE c.salesperson_id = sp.id AND ar.status = 'overdue') as morose_customers_count,
               (SELECT COALESCE(SUM(cm.commission_amount), 0) FROM commissions cm WHERE cm.salesperson_id = sp.id AND cm.status = 'pending') as pending_commission,
               (SELECT COALESCE(SUM(cm.commission_amount), 0) FROM commissions cm WHERE cm.salesperson_id = sp.id AND cm.status = 'paid') as paid_commission
        FROM salespeople sp
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.company_id = ?
        ORDER BY sp.name ASC
      `).all(companyId);

      const formatted = salespeople.map(s => {
        const goal = parseFloat(s.monthly_goal || 0);
        const monthSales = parseFloat(s.sales_month || 0);
        const compliance = goal > 0 ? Math.round((monthSales / goal) * 100) : 0;
        return {
          ...s,
          compliance_percentage: compliance
        };
      });

      return res.json({ success: true, data: formatted });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando vendedores.', error: err.message });
    }
  },

  getSalespersonById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const sp = await db.prepare(`SELECT * FROM salespeople WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!sp) return res.status(404).json({ success: false, message: 'Vendedor no encontrado.' });

      // Customers assigned
      const customers = await db.prepare(`
        SELECT id, code, company_name, first_name, last_name, phone, city, sector, current_balance, credit_limit, risk_score, status
        FROM customers
        WHERE salesperson_id = ? AND company_id = ?
        ORDER BY current_balance DESC
      `).all(id, companyId);

      // Monthly sales evolution (last 6 months)
      const monthlySales = await db.prepare(`
        SELECT strftime('%Y-%m', created_at) as month, SUM(total) as total, COUNT(id) as count
        FROM sales
        WHERE salesperson_id = ? AND status != 'cancelled'
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month DESC
        LIMIT 6
      `).all(id);

      // Recent sales
      const recentSales = await db.prepare(`
        SELECT s.id, s.sale_number, s.invoice_number, s.ncf, s.total, s.sale_type, s.status, s.created_at,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        WHERE s.salesperson_id = ?
        ORDER BY s.created_at DESC
        LIMIT 15
      `).all(id);

      return res.json({
        success: true,
        data: {
          salesperson: sp,
          customers,
          monthly_evolution: monthlySales.reverse(),
          recent_sales: recentSales
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createSalesperson: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { name, code, phone, email, zone, monthly_goal, commission_rate, hire_date } = req.body;

      if (!name) return res.status(400).json({ success: false, message: 'El nombre del vendedor es obligatorio.' });

      let spCode = code;
      if (!spCode) {
        const countRow = await db.prepare(`SELECT count(*) as count FROM salespeople WHERE company_id = ?`).get(companyId);
        const count = countRow ? parseInt(countRow.count, 10) || 0 : 0;
        spCode = `VEND-${String(count + 1).padStart(3, '0')}`;
      }

      const stmt = await db.prepare(`
        INSERT INTO salespeople (company_id, code, name, phone, email, zone, monthly_goal, commission_rate, hire_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);
      const result = await stmt.run(companyId, spCode, name, phone, email, zone, monthly_goal || 200000.00, commission_rate || 5.00, hire_date || new Date().toISOString().split('T')[0]);

      logAudit({
        companyId,
        userId: req.user.id,
        module: 'salespeople',
        action: 'create',
        recordId: String(result.lastInsertRowid),
        description: `Creado nuevo vendedor: ${name} (${spCode})`
      });

      return res.status(201).json({ success: true, message: 'Vendedor creado correctamente.', id: result.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateSalesperson: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { name, phone, email, zone, monthly_goal, commission_rate, status } = req.body;

      await db.prepare(`
        UPDATE salespeople
        SET name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            zone = COALESCE(?, zone),
            monthly_goal = COALESCE(?, monthly_goal),
            commission_rate = COALESCE(?, commission_rate),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(name, phone, email, zone, monthly_goal, commission_rate, status, id, companyId);

      return res.json({ success: true, message: 'Vendedor actualizado correctamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CUSTOMERS (CLIENTES)
  getCustomers: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { search, status, salesperson_id, risk_score, page = 1, limit = 100 } = req.query;
      const offset = (page - 1) * limit;

      let whereClauses = ['c.company_id = ?'];
      let params = [companyId];

      if (salesperson_id) {
        whereClauses.push('c.salesperson_id = ?');
        params.push(salesperson_id);
      }
      if (status) {
        whereClauses.push('c.status = ?');
        params.push(status);
      }
      if (risk_score) {
        whereClauses.push('c.risk_score = ?');
        params.push(risk_score);
      }
      if (search) {
        whereClauses.push('(c.code LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.company_name LIKE ? OR c.tax_id LIKE ? OR c.id_card LIKE ? OR c.phone LIKE ? OR c.city LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereSQL = whereClauses.join(' AND ');

      const countRow = await db.prepare(`SELECT COUNT(*) as total FROM customers c WHERE ${whereSQL}`).get(...params);
      const count = countRow ? parseInt(countRow.total, 10) || 0 : 0;

      const customers = await db.prepare(`
        SELECT c.*,
               sp.name as salesperson_name,
               sp.code as salesperson_code,
               pl.name as price_list_name,
               (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status != 'cancelled') as last_purchase_date,
               (SELECT MAX(rp.payment_date) FROM receivable_payments rp WHERE rp.customer_id = c.id) as last_payment_date,
               (SELECT COUNT(*) FROM accounts_receivable ar WHERE ar.customer_id = c.id AND ar.status = 'overdue') as overdue_invoices_count,
               (SELECT COALESCE(SUM(ar.balance), 0) FROM accounts_receivable ar WHERE ar.customer_id = c.id AND ar.status = 'overdue') as overdue_balance
        FROM customers c
        LEFT JOIN salespeople sp ON c.salesperson_id = sp.id
        LEFT JOIN price_lists pl ON c.price_list_id = pl.id
        WHERE ${whereSQL}
        ORDER BY c.current_balance DESC, c.company_name ASC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      const formatted = customers.map(cust => {
        const limitAmt = parseFloat(cust.credit_limit || 0);
        const balance = parseFloat(cust.current_balance || 0);
        const available = Math.max(0, limitAmt - balance);
        const usedPercent = limitAmt > 0 ? Math.min(100, Math.round((balance / limitAmt) * 100)) : 0;

        let daysWithoutBuy = null;
        if (cust.last_purchase_date) {
          const diffMs = new Date() - new Date(cust.last_purchase_date);
          daysWithoutBuy = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        return {
          ...cust,
          credit_available: available,
          credit_used_percent: usedPercent,
          days_without_purchase: daysWithoutBuy
        };
      });

      return res.json({
        success: true,
        data: formatted,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando clientes.', error: err.message });
    }
  },

  getCustomer360: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const customer = await db.prepare(`
        SELECT c.*,
               sp.name as salesperson_name,
               sp.code as salesperson_code,
               sp.phone as salesperson_phone,
               pl.name as price_list_name,
               af.name as affiliate_name
        FROM customers c
        LEFT JOIN salespeople sp ON c.salesperson_id = sp.id
        LEFT JOIN price_lists pl ON c.price_list_id = pl.id
        LEFT JOIN affiliates af ON c.affiliate_id = af.id
        WHERE c.id = ? AND c.company_id = ?
      `).get(id, companyId);

      if (!customer) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });

      // Invoices
      const invoices = await db.prepare(`
        SELECT s.id, s.sale_number, s.invoice_number, s.ncf, s.fiscal_type_code, s.sale_type,
               s.subtotal, s.tax_amount, s.total, s.amount_paid, s.balance, s.due_date, s.status, s.created_at,
               u.first_name || ' ' || u.last_name as created_by_name
        FROM sales s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.customer_id = ?
        ORDER BY s.created_at DESC
        LIMIT 30
      `).all(id);

      // Accounts Receivable
      const receivables = await db.prepare(`
        SELECT ar.*, s.sale_number
        FROM accounts_receivable ar
        LEFT JOIN sales s ON ar.sale_id = s.id
        WHERE ar.customer_id = ?
        ORDER BY ar.due_date ASC
      `).all(id);

      // Payments made
      const payments = await db.prepare(`
        SELECT rp.*
        FROM receivable_payments rp
        WHERE rp.customer_id = ?
        ORDER BY rp.payment_date DESC
        LIMIT 30
      `).all(id);

      // Collection Notes & Promises
      const collectionNotes = await db.prepare(`
        SELECT cn.*, u.first_name || ' ' || u.last_name as user_name
        FROM collection_notes cn
        LEFT JOIN users u ON cn.user_id = u.id
        WHERE cn.customer_id = ?
        ORDER BY cn.created_at DESC
      `).all(id);

      // Statistics calculations
      const totalPurchasedRow = await db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE customer_id = ? AND status != 'cancelled'`).get(id);
      const totalPurchased = totalPurchasedRow ? Number(totalPurchasedRow.total) || 0 : 0;
      const purchasesThisYearRow = await db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE customer_id = ? AND status != 'cancelled' AND strftime('%Y', created_at) = strftime('%Y', 'now')`).get(id);
      const purchasesThisYear = purchasesThisYearRow ? Number(purchasesThisYearRow.total) || 0 : 0;
      const purchasesThisMonthRow = await db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE customer_id = ? AND status != 'cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get(id);
      const purchasesThisMonth = purchasesThisMonthRow ? Number(purchasesThisMonthRow.total) || 0 : 0;
      const overdueCount = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(balance), 0) as balance FROM accounts_receivable WHERE customer_id = ? AND status = 'overdue'`).get(id);
      const lastPayment = payments[0] || null;
      const lastSale = invoices[0] || null;

      // Monthly purchase behavior (last 12 months)
      const monthlyBehavior = await db.prepare(`
        SELECT strftime('%Y-%m', created_at) as month, SUM(total) as amount, COUNT(id) as invoices_count
        FROM sales
        WHERE customer_id = ? AND status != 'cancelled'
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month DESC
        LIMIT 12
      `).all(id);

      const limitAmt = parseFloat(customer.credit_limit || 0);
      const balance = parseFloat(customer.current_balance || 0);
      const available = Math.max(0, limitAmt - balance);
      const usedPercent = limitAmt > 0 ? Math.min(100, Math.round((balance / limitAmt) * 100)) : 0;

      let daysWithoutBuy = null;
      if (lastSale?.created_at) {
        const diffMs = new Date() - new Date(lastSale.created_at);
        daysWithoutBuy = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      return res.json({
        success: true,
        data: {
          customer: {
            ...customer,
            credit_available: available,
            credit_used_percent: usedPercent,
            days_without_purchase: daysWithoutBuy,
            last_purchase_date: lastSale?.created_at || null,
            last_payment_date: lastPayment?.payment_date || null
          },
          kpis: {
            total_purchased_history: totalPurchased,
            purchases_year: purchasesThisYear,
            purchases_month: purchasesThisMonth,
            pending_balance: balance,
            overdue_balance: overdueCount.balance,
            overdue_invoices_count: overdueCount.count,
            credit_available: available,
            monthly_purchase_avg: Math.round(purchasesThisYear / 12),
            last_payment_amount: lastPayment?.total_amount || 0
          },
          invoices,
          receivables,
          payments,
          collection_notes: collectionNotes,
          monthly_behavior: monthlyBehavior.reverse()
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error cargando Perfil 360.', error: err.message });
    }
  },

  getCustomerStatement: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { start_date, end_date } = req.query;

      const customer = await db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!customer) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });

      // Gather debits (Invoices) and credits (Payments, Credit Notes, and Direct POS/Sale Payments #17)
      const salesQuery = `
        SELECT id, sale_number as document, invoice_number, ncf, created_at as date,
               total as debit, 0 as credit, 'Factura' as doc_type
        FROM sales
        WHERE customer_id = ? AND company_id = ? AND status != 'cancelled'
      `;
      const paymentsQuery = `
        SELECT id, payment_number as document, reference_number as invoice_number, '' as ncf,
               payment_date as date, 0 as debit, total_amount as credit, 'Cobro / Recibo' as doc_type
        FROM receivable_payments
        WHERE customer_id = ? AND company_id = ?
      `;
      const creditNotesQuery = `
        SELECT id, credit_note_number as document, ncf as invoice_number, ncf,
               created_at as date, 0 as debit, total as credit, 'Nota de Crédito' as doc_type
        FROM credit_notes
        WHERE customer_id = ? AND company_id = ?
      `;
      const salePaymentsQuery = `
        SELECT sp.id, ('Pago ' || s.sale_number) as document, s.invoice_number, s.ncf,
               s.created_at as date, 0 as debit, sp.amount as credit,
               ('Pago Directo (' || sp.payment_method || ')') as doc_type
        FROM sale_payments sp
        JOIN sales s ON sp.sale_id = s.id
        WHERE s.customer_id = ? AND s.company_id = ? AND s.status != 'cancelled' AND sp.payment_method != 'credit'
      `;

      const sales = await db.prepare(salesQuery).all(id, companyId);
      const payments = await db.prepare(paymentsQuery).all(id, companyId);
      const creditNotes = await db.prepare(creditNotesQuery).all(id, companyId);
      const salePayments = await db.prepare(salePaymentsQuery).all(id, companyId);

      const allEntries = [...sales, ...payments, ...creditNotes, ...salePayments].sort((a, b) => new Date(a.date) - new Date(b.date));

      let runningBalance = 0;
      let initialBalance = 0;
      const ledger = [];

      for (const entry of allEntries) {
        runningBalance = Math.round((runningBalance + (Number(entry.debit) - Number(entry.credit))) * 100) / 100;
        const entryDate = entry.date ? (typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10)) : '';

        if (start_date && entryDate < start_date) {
          initialBalance = runningBalance;
        } else if (end_date && entryDate > end_date) {
          continue;
        } else {
          ledger.push({
            ...entry,
            balance: runningBalance
          });
        }
      }

      // Query detailed sales invoices with balance and overdue status
      const invoices = await db.prepare(`
        SELECT s.id, s.invoice_number, s.ncf, s.sale_number,
               strftime('%Y-%m-%d', s.created_at) as issue_date,
               strftime('%Y-%m-%d', s.due_date) as due_date,
               s.total as amount, s.balance, s.status,
               (CURRENT_DATE > s.due_date AND s.balance > 0) as is_overdue,
               CASE WHEN CURRENT_DATE > s.due_date AND s.due_date IS NOT NULL AND s.balance > 0 
                    THEN (CURRENT_DATE - s.due_date)
                    ELSE 0 
               END as days_overdue
        FROM sales s
        WHERE s.customer_id = ? AND s.company_id = ? AND s.status != 'cancelled'
        ORDER BY s.created_at DESC
      `).all(id, companyId);

      const openInvoices = invoices.filter(i => Number(i.balance) > 0);
      const overdueInvoices = invoices.filter(i => i.is_overdue);
      const overdueBalance = overdueInvoices.reduce((acc, i) => acc + Number(i.balance || 0), 0);
      const realCustomerBalance = (customer.current_balance !== null && customer.current_balance !== undefined)
        ? Number(customer.current_balance)
        : runningBalance;

      return res.json({
        success: true,
        data: {
          customer,
          invoices,
          open_invoices: openInvoices,
          ledger,
          summary: {
            total_debits: sales.reduce((acc, s) => acc + Number(s.debit || 0), 0),
            total_credits: payments.reduce((acc, p) => acc + Number(p.credit || 0), 0) +
                           creditNotes.reduce((acc, c) => acc + Number(c.credit || 0), 0) +
                           salePayments.reduce((acc, sp) => acc + Number(sp.credit || 0), 0),
            current_balance: realCustomerBalance,
            initial_balance: initialBalance,
            open_invoices_count: openInvoices.length,
            overdue_invoices_count: overdueInvoices.length,
            overdue_balance: overdueBalance
          }
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createCustomer: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        code, salesperson_id, person_type, first_name, last_name, company_name,
        tax_id, id_card, email, phone, mobile, address, province, municipality,
        sector, city, latitude, longitude, contact_person, customer_type,
        credit_condition, credit_limit, credit_days, allow_sales_with_overdue_invoices,
        requires_special_auth, delivery_type, notes
      } = req.body;

      if (!salesperson_id) {
        return res.status(400).json({
          success: false,
          message: 'Es OBLIGATORIO asignar un vendedor permanente al cliente.'
        });
      }

      let custCode = code;
      if (!custCode) {
        const countRow = await db.prepare(`SELECT count(*) as count FROM customers WHERE company_id = ?`).get(companyId);
        const count = countRow ? parseInt(countRow.count, 10) || 0 : 0;
        custCode = `CLI-${String(count + 1).padStart(3, '0')}`;
      }

      const stmt = await db.prepare(`
        INSERT INTO customers (
          company_id, code, salesperson_id, person_type, first_name, last_name, company_name,
          tax_id, id_card, email, phone, mobile, address, province, municipality,
          sector, city, latitude, longitude, contact_person, customer_type,
          credit_condition, credit_limit, credit_days, allow_sales_with_overdue_invoices,
          requires_special_auth, delivery_type, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);

      const result = await stmt.run(
        companyId, custCode, salesperson_id, person_type || 'natural', first_name, last_name,
        company_name || `${first_name} ${last_name}`, tax_id, id_card, email, phone, mobile,
        address, province, municipality, sector, city, latitude || 18.4861, longitude || -69.9312,
        contact_person, customer_type || 'Salón de Belleza', credit_condition || 'credit',
        credit_limit || 50000.00, credit_days || 30, allow_sales_with_overdue_invoices ? 1 : 0,
        requires_special_auth ? 1 : 0, delivery_type || 'Ruta Estándar', notes
      );

      logAudit({
        companyId,
        userId: req.user.id,
        module: 'customers',
        action: 'create',
        recordId: String(result.lastInsertRowid),
        description: `Creado nuevo cliente: ${company_name || first_name} (${custCode}) con vendedor asignado permanentemente ID: ${salesperson_id}`
      });

      return res.status(201).json({
        success: true,
        message: 'Cliente creado exitosamente con vendedor asignado permanentemente.',
        id: result.lastInsertRowid
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateCustomer: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const current = await db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!current) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });

      const {
        company_name, first_name, last_name, tax_id, id_card, email, phone, mobile,
        address, province, municipality, sector, city, latitude, longitude,
        contact_person, customer_type, credit_condition, credit_limit, credit_days,
        is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices,
        delivery_type, risk_score, notes, status, salesperson_id
      } = req.body;

      // If salesperson is modified, verify authorization rule
      if (salesperson_id && parseInt(salesperson_id, 10) !== current.salesperson_id) {
        logAudit({
          companyId,
          userId: req.user.id,
          module: 'customers',
          action: 'change_salesperson',
          recordId: String(id),
          oldValues: { salesperson_id: current.salesperson_id },
          newValues: { salesperson_id },
          description: `Vendedor modificado para cliente ${current.code} por usuario autorizado ${req.user.username}`
        });
      }

      await db.prepare(`
        UPDATE customers
        SET company_name = COALESCE(?, company_name),
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            tax_id = COALESCE(?, tax_id),
            id_card = COALESCE(?, id_card),
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            mobile = COALESCE(?, mobile),
            address = COALESCE(?, address),
            province = COALESCE(?, province),
            municipality = COALESCE(?, municipality),
            sector = COALESCE(?, sector),
            city = COALESCE(?, city),
            latitude = COALESCE(?, latitude),
            longitude = COALESCE(?, longitude),
            contact_person = COALESCE(?, contact_person),
            customer_type = COALESCE(?, customer_type),
            credit_condition = COALESCE(?, credit_condition),
            credit_limit = COALESCE(?, credit_limit),
            credit_days = COALESCE(?, credit_days),
            is_credit_blocked = COALESCE(?, is_credit_blocked),
            requires_special_auth = COALESCE(?, requires_special_auth),
            allow_sales_with_overdue_invoices = COALESCE(?, allow_sales_with_overdue_invoices),
            delivery_type = COALESCE(?, delivery_type),
            risk_score = COALESCE(?, risk_score),
            notes = COALESCE(?, notes),
            status = COALESCE(?, status),
            salesperson_id = COALESCE(?, salesperson_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(
        company_name, first_name, last_name, tax_id, id_card, email, phone, mobile,
        address, province, municipality, sector, city, latitude, longitude,
        contact_person, customer_type, credit_condition, credit_limit, credit_days,
        is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices,
        delivery_type, risk_score, notes, status, salesperson_id, id, companyId
      );

      return res.json({ success: true, message: 'Cliente actualizado correctamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  toggleCustomerCreditBlock: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const cust = await db.prepare('SELECT id, is_credit_blocked, company_name, code FROM customers WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!cust) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });

      const newBlocked = cust.is_credit_blocked === 1 ? 0 : 1;
      await db.prepare('UPDATE customers SET is_credit_blocked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBlocked, id);

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip || req.connection.remoteAddress,
        module: 'customers',
        action: newBlocked === 1 ? 'credit_block' : 'credit_unblock',
        recordId: id,
        description: `${newBlocked === 1 ? 'Bloqueo' : 'Desbloqueo'} de crédito para cliente ${cust.company_name || cust.code} por ${req.user.username}`
      });

      return res.json({
        success: true,
        is_credit_blocked: newBlocked,
        message: newBlocked === 1 ? `Crédito de [${cust.company_name || cust.code}] ha sido BLOQUEADO.` : `Crédito de [${cust.company_name || cust.code}] ha sido DESBLOQUEADO.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // COLLECTION NOTES & PROMISES
  getCollectionNotes: async (req, res) => {
    try {
      const { id } = req.params;
      const notes = await db.prepare(`
        SELECT cn.*, u.first_name || ' ' || u.last_name as user_name
        FROM collection_notes cn
        LEFT JOIN users u ON cn.user_id = u.id
        WHERE cn.customer_id = ?
        ORDER BY cn.created_at DESC
      `).all(id);

      return res.json({ success: true, data: notes });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  addCollectionNote: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { contact_channel, result, notes, promise_date, promise_amount, next_action_date } = req.body;

      const stmt = await db.prepare(`
        INSERT INTO collection_notes (
          company_id, customer_id, user_id, contact_channel, result, notes,
          promise_date, promise_amount, status, next_action_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `);
      const r = await stmt.run(
        companyId, id, req.user.id, contact_channel || 'phone', result || 'promise',
        notes, promise_date || null, promise_amount || 0.00, next_action_date || null
      );

      return res.status(201).json({ success: true, message: 'Gestión de cobro registrada.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // SUPPLIERS
  getSuppliers: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const suppliers = await db.prepare(`
        SELECT s.*,
               (SELECT COALESCE(SUM(ap.balance), 0) FROM accounts_payable ap WHERE ap.supplier_id = s.id AND ap.status != 'paid') as pending_balance,
               (SELECT COUNT(*) FROM accounts_payable ap WHERE ap.supplier_id = s.id AND ap.status = 'overdue') as overdue_invoices_count,
               (SELECT MAX(p.created_at) FROM purchases p WHERE p.supplier_id = s.id) as last_purchase_date,
               (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id AND p.company_id = s.company_id) as purchase_count,
               (SELECT COALESCE(SUM(p.total), 0) FROM purchases p WHERE p.supplier_id = s.id AND p.company_id = s.company_id) as total_purchased
        FROM suppliers s
        WHERE s.company_id = ?
        ORDER BY s.company_name ASC
      `).all(companyId);

      return res.json({ success: true, data: suppliers });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  getSupplierById: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;

      const supplier = await db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });

      const purchases = await db.prepare(`
        SELECT p.*
        FROM purchases p
        WHERE p.supplier_id = ?
        ORDER BY p.created_at DESC
        LIMIT 20
      `).all(id);

      const payables = await db.prepare(`
        SELECT ap.*
        FROM accounts_payable ap
        WHERE ap.supplier_id = ?
        ORDER BY ap.due_date ASC
      `).all(id);

      return res.json({ success: true, data: { supplier, purchases, payables } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createSupplier: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit, credit_days, notes } = req.body;

      if (!company_name || !tax_id) {
        return res.status(400).json({ success: false, message: 'Nombre y RNC del proveedor son obligatorios.' });
      }

      const countRow = await db.prepare(`SELECT count(*) as count FROM suppliers WHERE company_id = ?`).get(companyId);
      const count = countRow ? parseInt(countRow.count, 10) || 0 : 0;
      const code = `PROV-${String(count + 1).padStart(3, '0')}`;

      const stmt = await db.prepare(`
        INSERT INTO suppliers (company_id, code, company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit, credit_days, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);
      const result = await stmt.run(companyId, code, company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit || 100000.00, credit_days || 30, notes);

      return res.status(201).json({ success: true, message: 'Proveedor creado correctamente.', id: result.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateSupplier: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit, credit_days, notes, status } = req.body;

      await db.prepare(`
        UPDATE suppliers
        SET company_name = COALESCE(?, company_name),
            trade_name = COALESCE(?, trade_name),
            tax_id = COALESCE(?, tax_id),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            city = COALESCE(?, city),
            contact_person = COALESCE(?, contact_person),
            credit_limit = COALESCE(?, credit_limit),
            credit_days = COALESCE(?, credit_days),
            notes = COALESCE(?, notes),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(company_name, trade_name, tax_id, phone, email, address, city, contact_person, credit_limit, credit_days, notes, status, id, companyId);

      return res.json({ success: true, message: 'Proveedor actualizado correctamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  getAffiliates: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const affiliates = await db.prepare(`SELECT * FROM affiliates WHERE company_id = ? ORDER BY name ASC`).all(companyId);
      return res.json({ success: true, data: affiliates });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createAffiliate: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { name, institution_name, agreement_details, discount_percentage, valid_until } = req.body;
      const stmt = await db.prepare(`
        INSERT INTO affiliates (company_id, name, institution_name, agreement_details, discount_percentage, valid_until, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `);
      const result = await stmt.run(companyId, name, institution_name, agreement_details, discount_percentage || 0, valid_until || null);
      return res.status(201).json({ success: true, message: 'Convenio de afiliado creado.', id: result.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = thirdPartiesController;
